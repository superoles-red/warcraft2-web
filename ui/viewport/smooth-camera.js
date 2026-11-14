/* Pan a crop of the newest completed native raster. Only camera geometry is retained. */
(function (global) {
  'use strict';
  const TILE = 32;
  const options = new URLSearchParams(global.location?.search);
  const ahead = options.get('bridge') === 'v16' && options.get('view') === 'map' &&
    options.get('camera') !== 'tile';
  const guardPixels = ahead ? 64 : 32;
  const EPSILON = 1e-7;
  const COAST_DECAY_MS = 185;
  const COAST_BRAKE_MS = 90;
  const COAST_RECOVERY_ACCELERATION = .005;
  const COAST_MAX_STALL_MS = 55;
  const MAX_COAST_CSS_SPEED = 1;
  const PAN_SUPERSEDED_MS = 160;
  const PAN_TIMEOUT_MS = 600;
  const FLICK_WINDOW_MS = 90;
  const FLICK_MAX_PAUSE_MS = 55;
  const FLICK_MIN_DISTANCE = 12;
  const FLICK_MIN_SPEED = .35;
  const DRAG_TRAVEL_MS = 300;
  const DRAG_LEAD_MS = 135;
  const MAX_DRAG_CSS_SPEED = 3.6;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function validGeometry(g) {
    return g?.active === true && g.world && [g.width, g.height, g.world.left, g.world.top,
      g.world.right, g.world.bottom, g.mapWidth, g.mapHeight, g.cameraX, g.cameraY,
      g.maxX, g.maxY].every(Number.isFinite) && g.width > 0 && g.height > 0 &&
      g.world.left >= 0 && g.world.top >= 0 && g.world.right > g.world.left &&
      g.world.bottom > g.world.top && g.world.right <= g.width && g.world.bottom <= g.height &&
      g.mapWidth > 0 && g.mapHeight > 0 && g.cameraX >= 0 && g.cameraY >= 0 &&
      g.cameraX <= g.maxX && g.cameraY <= g.maxY;
  }

  function dimensions(g, width, height, guard, viewport) {
    const nativeWidth = g.world.right - g.world.left;
    const nativeHeight = g.world.bottom - g.world.top;
    const reference = viewport?.width === g.width && viewport?.height === g.height ? viewport.reference : null;
    const referenceWidth = reference ? Math.min(nativeWidth, reference.width - 192) : nativeWidth;
    const referenceHeight = reference ? Math.min(nativeHeight, reference.height - 32) : nativeHeight;
    const availableWidth = Math.max(TILE, referenceWidth - guard * 2);
    const availableHeight = Math.max(TILE, referenceHeight - guard * 2);
    const aspect = width / height;
    const w = Math.min(availableWidth, availableHeight * aspect);
    const h = Math.min(availableHeight, availableWidth / aspect);
    return { w, h, extraX: nativeWidth - w, extraY: nativeHeight - h,
      maxX: Math.max(0, g.mapWidth * TILE - w), maxY: Math.max(0, g.mapHeight * TILE - h) };
  }

  function coverage(camera, d) {
    const left = camera.x * TILE, top = camera.y * TILE;
    return { left, top, right: Math.min(left + d.extraX, d.maxX), bottom: Math.min(top + d.extraY, d.maxY) };
  }

  function intersection(a, b) {
    return { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  }

  function contains(bounds, point) {
    return point.x >= bounds.left - EPSILON && point.x <= bounds.right + EPSILON &&
      point.y >= bounds.top - EPSILON && point.y <= bounds.bottom + EPSILON;
  }

  function fit(point, bounds) {
    return { x: clamp(point.x, bounds.left, bounds.right), y: clamp(point.y, bounds.top, bounds.bottom) };
  }

  const between = (v, a, b) => v >= Math.min(a, b) && v <= Math.max(a, b);

  function nextTile(desired, visible, current, extra, max, lead) {
    const target = Math.round((desired - extra / 2 + lead) / TILE);
    const origin = current * TILE;
    if (desired >= origin && desired <= origin + extra && (target - current) * lead <= 0) return current;
    const minTile = Math.max(0, current - 4, Math.ceil((visible - extra - EPSILON) / TILE));
    const maxTile = Math.min(max, current + 4, Math.floor((visible + EPSILON) / TILE));
    return clamp(target, minTile, maxTile);
  }

  function travelTile(desired, visible, current, extra, max, velocity) {
    const direction = Math.sign(desired - visible) || Math.sign(velocity);
    if (!direction) return current;
    const origin = current * TILE;
    const edge = direction > 0 ? origin + extra : origin;
    const lead = Math.min(extra, Math.abs(velocity) * DRAG_LEAD_MS);
    if (direction * (edge - desired) >= -EPSILON &&
        direction * (edge - visible) >= lead + TILE) return current;

    // A pending native frame must still cover the current crop. Leave room
    // for a turn when possible instead of pinning that crop at the new edge.
    const reserve = Math.min(2 * TILE, extra / 4);
    const candidate = spare => direction > 0
      ? Math.min(max, Math.floor((visible - spare + EPSILON) / TILE))
      : Math.max(0, Math.ceil((visible - extra + spare - EPSILON) / TILE));
    const target = candidate(reserve);
    if (direction * (target - current) > 0) return target;
    if (direction * (desired - edge) <= EPSILON) return current;
    const safe = candidate(0);
    return direction * (safe - current) > 0 ? safe : current;
  }

  function forwardRoom(point, bounds, vx, vy, speed) {
    const x = vx === 0 ? Infinity : ((vx > 0 ? bounds.right : bounds.left) - point.x) / vx;
    const y = vy === 0 ? Infinity : ((vy > 0 ? bounds.bottom : bounds.top) - point.y) / vy;
    return Math.max(0, Math.min(x, y) * speed);
  }

  function createCamera({ panTiles, panReply = () => 0, lookAhead = ahead, viewport,
    now = () => performance.now(), followMs = 30, maxFollowSpeed = 2.5 } = {}) {
    if (typeof panTiles !== 'function') throw new TypeError('Native pan transport required');
    if (!(followMs > 0 && maxFollowSpeed > 0)) throw new TypeError('Positive display follow limits required');
    let key = '', viewWidth = 0, viewHeight = 0;
    let latest = null, desired = null, visible = null, pending = null;
    let dragging = false, vx = 0, vy = 0, lastSample = 0, lastTick = null;
    let releaseTime = null, pixelScale = 1, displaySpeed = 0, catchingUp = false, coastBlockedSince = null;
    let motionSamples = [], recentDistance = 0;
    let retainDragTravel = false, travelDeadline = null, lastDragX = 0, lastDragY = 0;
    const telemetry = { requests: 0, externalResets: 0, timeouts: 0, coverageHolds: 0, recovered: 0 };

    function stop() {
      dragging = false;
      vx = vy = 0;
      releaseTime = null;
      travelDeadline = null;
      lastDragX = lastDragY = 0;
      coastBlockedSince = null;
      catchingUp = false;
      displaySpeed = 0;
      motionSamples = [];
      recentDistance = 0;
      lastTick = null;
      if (visible) desired = { ...visible };
    }

    function reset() {
      stop();
      key = '';
      viewWidth = viewHeight = 0;
      latest = desired = visible = pending = null;
    }

    function pause(g) {
      stop();
      // A coherent paused frame ends the world-input transaction. A key
      // arriving while the native dialog is open can be ignored by the game.
      pending = null;
      if (validGeometry(g)) latest = { x: g.cameraX, y: g.cameraY };
    }

    function moving() {
      return dragging || releaseTime !== null || vx !== 0 || vy !== 0 ||
        !!(desired && visible && Math.hypot(desired.x - visible.x, desired.y - visible.y) > .02);
    }

    function frame(g, width, height, time = now(), receipt, travel = false) {
      if (!validGeometry(g) || !Number.isFinite(time) || !(width > 0 && height > 0)) {
        reset();
        return null;
      }
      const d = dimensions(g, width, height, lookAhead ? 64 : 32,
        lookAhead ? viewport ?? global.WARCRAFT_CAMERA_VIEWPORT : null);
      const nextKey = [g.width, g.height, g.world.left, g.world.top, g.world.right,
        g.world.bottom, g.mapWidth, g.mapHeight, g.maxX, g.maxY, travel].join(',');
      retainDragTravel = lookAhead && travel;
      const native = { x: g.cameraX, y: g.cameraY };
      const liveBounds = coverage(native, d);
      const center = () => fit({ x: liveBounds.left + d.extraX / 2, y: liveBounds.top + d.extraY / 2 }, liveBounds);
      if (nextKey !== key) {
        reset();
        key = nextKey;
        desired = center();
        visible = { ...desired };
        lastTick = time;
      }
      const resized = viewWidth > 0 && (width !== viewWidth || height !== viewHeight);
      viewWidth = width;
      viewHeight = height;
      if (latest && (latest.x !== native.x || latest.y !== native.y)) {
        const own = pending && between(native.x, pending.from.x, pending.to.x) &&
          between(native.y, pending.from.y, pending.to.y);
        if (!own) {
          stop();
          pending = null;
          telemetry.externalResets++;
          desired = center();
          visible = { ...desired };
        }
      }
      latest = native;
      if (pending && native.x === pending.to.x && native.y === pending.to.y) pending = null;
      if (pending) {
        const status = panReply(pending.serial);
        const age = time - pending.at;
        // The game can apply a pan and return to its prior position before
        // publishing a frame at the requested coordinates. Drop the overlap
        // restriction only once a new, coherent frame agrees with live state.
        const current = receipt?.currentCamera;
        if (status === 1 && pending.ackSequence === undefined) pending.ackSequence = receipt?.sequence;
        const stable = receipt?.sequence && receipt.sequence !== pending.frameSequence &&
          current?.x === native.x && current.y === native.y;
        const superseded = status === 1 && age > PAN_SUPERSEDED_MS &&
          receipt?.sequence !== pending.ackSequence;
        if (status > 1) pending = null;
        else if (stable && (age > PAN_TIMEOUT_MS || superseded)) {
          if (age > PAN_TIMEOUT_MS && !pending.timedOut) telemetry.timeouts++;
          telemetry.recovered++;
          pending = null;
        }
      }
      if (resized) {
        stop();
        if (pending) pending.bounds = intersection(coverage(pending.from, d), coverage(pending.to, d));
        visible = fit(visible, pending ? pending.bounds : liveBounds);
        desired = { ...visible };
      }
      if (pending && !pending.timedOut && time - pending.at > PAN_TIMEOUT_MS) {
        if (!retainDragTravel) stop();
        pending.timedOut = true;
        telemetry.timeouts++;
      }

      const elapsed = lastTick === null ? 0 : Math.max(0, time - lastTick);
      const dt = Math.min(elapsed, 40);
      lastTick = time;
      // The crop remains covered by both ends of an in-flight native move.
      const bounds = pending ? pending.bounds : liveBounds;
      const tracking = dragging || releaseTime !== null;
      if (travelDeadline !== null && time >= travelDeadline) {
        desired = { ...visible };
        travelDeadline = null;
      }
      if (!retainDragTravel && lookAhead && !tracking) {
        if (visible.x === 0 && vx < 0 || visible.x === d.maxX && vx > 0) vx = 0;
        if (visible.y === 0 && vy < 0 || visible.y === d.maxY && vy > 0) vy = 0;
        const speed = Math.hypot(vx, vy);
        const roomSpeed = speed && forwardRoom(visible, bounds, vx, vy, speed) / COAST_BRAKE_MS;
        // Keep the decaying flick velocity separate from what the current frame
        // can show. New coverage can restore speed gradually, without stored travel.
        const safeSpeed = Math.min(speed, roomSpeed, displaySpeed + COAST_RECOVERY_ACCELERATION * pixelScale * dt);
        const stopSpeed = .018 * pixelScale;
        coastBlockedSince = safeSpeed < stopSpeed ? coastBlockedSince ?? time : null;
        if (elapsed > 120 || speed < stopSpeed ||
            (coastBlockedSince !== null && time - coastBlockedSince >= COAST_MAX_STALL_MS)) {
          vx = vy = 0;
          displaySpeed = 0;
          desired = { ...visible };
        } else {
          const fraction = safeSpeed / speed;
          const travelTime = -COAST_DECAY_MS * Math.expm1(-Math.min(dt, 32) / COAST_DECAY_MS);
          desired = { x: visible.x + vx * fraction * travelTime, y: visible.y + vy * fraction * travelTime };
          const decay = Math.exp(-elapsed / COAST_DECAY_MS);
          displaySpeed = safeSpeed * decay;
          vx *= decay;
          vy *= decay;
        }
      } else if (!tracking && (vx || vy)) {
        const decay = Math.exp(-dt / 180);
        desired.x += vx * 180 * (1 - decay);
        desired.y += vy * 180 * (1 - decay);
        vx *= decay;
        vy *= decay;
        if (Math.hypot(vx, vy) < .01) vx = vy = 0;
      }
      desired.x = clamp(desired.x, 0, d.maxX);
      desired.y = clamp(desired.y, 0, d.maxY);
      if ((desired.x === 0 && vx < 0) || (desired.x === d.maxX && vx > 0)) vx = 0;
      if ((desired.y === 0 && vy < 0) || (desired.y === d.maxY && vy > 0)) vy = 0;

      const target = fit(desired, bounds);
      const outside = !contains(bounds, desired);
      const alpha = lookAhead || tracking ? 1 : 1 - Math.exp(-dt / followMs);
      let dx = (target.x - visible.x) * alpha, dy = (target.y - visible.y) * alpha;
      if (dt > 0 && Math.abs(target.x - visible.x) < .02) dx = target.x - visible.x;
      if (dt > 0 && Math.abs(target.y - visible.y) < .02) dy = target.y - visible.y;
      const distance = Math.hypot(dx, dy);
      let speedLimit = maxFollowSpeed;
      if (lookAhead && tracking) {
        speedLimit = Math.min(speedLimit, 1.45 * pixelScale);
        if (outside || catchingUp) {
          speedLimit = Math.min(speedLimit, Math.max(.42 * pixelScale, displaySpeed + .012 * pixelScale * dt));
          if (outside) speedLimit = Math.min(speedLimit, distance / 44);
        }
      }
      const limit = (retainDragTravel ? MAX_DRAG_CSS_SPEED * pixelScale : speedLimit) * dt;
      if (distance > limit) {
        dx *= limit / distance;
        dy *= limit / distance;
      }
      visible = fit({ x: visible.x + dx, y: visible.y + dy }, bounds);
      if (outside) telemetry.coverageHolds++;
      if (tracking && dt > 0) {
        displaySpeed = Math.hypot(dx, dy) / dt;
        catchingUp = outside || (catchingUp && distance - limit > .5);
      }
      if (travelDeadline !== null && Math.hypot(desired.x - visible.x, desired.y - visible.y) <= .02) {
        desired = { ...visible };
        travelDeadline = null;
      }
      if (releaseTime !== null && dt > 0) {
        // Coast from the position actually drawn, with no remaining drag debt.
        const speed = Math.hypot(vx, vy);
        const limit = Math.min(MAX_COAST_CSS_SPEED * pixelScale, Math.max(.52 * pixelScale, displaySpeed));
        const scale = speed > limit ? limit / speed : 1;
        const decay = Math.exp(-Math.max(0, time - releaseTime) / COAST_DECAY_MS);
        vx *= scale * decay;
        vy *= scale * decay;
        displaySpeed = Math.hypot(vx, vy);
        desired = { ...visible };
        releaseTime = null;
      }

      if (!pending && moving()) {
        const tileX = clamp(Math.round((desired.x - d.extraX / 2) / TILE), 0, g.maxX);
        const tileY = clamp(Math.round((desired.y - d.extraY / 2) / TILE), 0, g.maxY);
        const leadTime = dragging && time - lastSample > 44 ? 0 : 80;
        const stepX = retainDragTravel
          ? travelTile(desired.x, visible.x, native.x, d.extraX, g.maxX, leadTime ? vx : 0) - native.x
          : lookAhead
          ? nextTile(desired.x, visible.x, native.x, d.extraX, g.maxX, clamp(vx * leadTime, -64, 64)) - native.x
          : Math.sign(tileX - native.x);
        const stepY = retainDragTravel
          ? travelTile(desired.y, visible.y, native.y, d.extraY, g.maxY, leadTime ? vy : 0) - native.y
          : lookAhead
          ? nextTile(desired.y, visible.y, native.y, d.extraY, g.maxY, clamp(vy * leadTime, -64, 64)) - native.y
          : Math.sign(tileY - native.y);
        if (stepX || stepY) {
          const to = { x: native.x + stepX, y: native.y + stepY };
          const overlap = intersection(liveBounds, coverage(to, d));
          // Reach the overlap through ordinary motion before asking for a tile.
          if (overlap.left <= overlap.right && overlap.top <= overlap.bottom && contains(overlap, visible)) {
            const serial = panTiles(stepX, stepY, native);
            if (serial !== false) {
              pending = { from: native, to, bounds: overlap, at: time, timedOut: false,
                serial, frameSequence: receipt?.sequence };
              telemetry.requests++;
            }
          }
        }
      }

      return { left: g.world.left + clamp(visible.x - liveBounds.left, 0, d.extraX),
        top: g.world.top + clamp(visible.y - liveBounds.top, 0, d.extraY),
        width: d.w, height: d.h, extraX: d.extraX, extraY: d.extraY,
        sourceCamera: native, visibleGlobal: { ...visible } };
    }

    function begin(time = now(), scale = 1) {
      stop();
      dragging = true;
      pixelScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      lastSample = lastTick = time;
    }

    function trackMotion(dx, dy, time) {
      const previous = motionSamples.at(-1);
      const reversed = previous && dx * previous.dx + dy * previous.dy < 0;
      if (reversed || time - lastSample > FLICK_MAX_PAUSE_MS) motionSamples = [];
      if (reversed) {
        // A turn cancels the part of the previous drag that was never displayed.
        if (dx * (desired.x - visible.x) < 0) desired.x = visible.x;
        if (dy * (desired.y - visible.y) < 0) desired.y = visible.y;
      }
      time = Math.max(lastSample, time);
      const tail = motionSamples.at(-1);
      if (tail && tail.to === time) {
        tail.dx += dx;
        tail.dy += dy;
      } else {
        const from = Math.min(time - 8, Math.max(lastSample, time - FLICK_WINDOW_MS));
        motionSamples.push({ from, to: time, dx, dy });
      }
      lastSample = time;
      const cutoff = time - FLICK_WINDOW_MS;
      while (motionSamples[0].to <= cutoff) motionSamples.shift();
      const start = Math.max(cutoff, motionSamples[0].from);
      let x = 0, y = 0;
      for (const sample of motionSamples) {
        const weight = (sample.to - Math.max(sample.from, start)) / (sample.to - sample.from);
        x += sample.dx * weight;
        y += sample.dy * weight;
      }
      const span = time - start;
      vx = x / span;
      vy = y / span;
      recentDistance = Math.hypot(x, y) / pixelScale;
    }

    function move(dx, dy, time = now()) {
      if (!dragging || !desired || !Number.isFinite(dx) || !Number.isFinite(dy) ||
        !Number.isFinite(time) || (dx === 0 && dy === 0)) return;
      if (lookAhead) {
        trackMotion(dx, dy, time);
        if (retainDragTravel) {
          if (dx * lastDragX < 0 && dx * (desired.x - visible.x) < 0) desired.x = visible.x;
          if (dy * lastDragY < 0 && dy * (desired.y - visible.y) < 0) desired.y = visible.y;
          if (dx) lastDragX = Math.sign(dx);
          if (dy) lastDragY = Math.sign(dy);
        }
        desired.x += dx;
        desired.y += dy;
        return;
      }
      desired.x += dx;
      desired.y += dy;
      const dt = Math.max(8, time - lastSample);
      if (dt > 100) vx = vy = 0;
      vx = vx * .3 + clamp(dx / dt, -2.5, 2.5) * .7;
      vy = vy * .3 + clamp(dy / dt, -2.5, 2.5) * .7;
      lastSample = time;
    }

    function end(time = now()) {
      if (!dragging) return;
      dragging = false;
      if (retainDragTravel) {
        if (time - lastSample >= FLICK_MAX_PAUSE_MS) stop();
        else {
          vx = vy = 0;
          travelDeadline = time + DRAG_TRAVEL_MS;
        }
        return;
      }
      if (lookAhead) {
        const pause = Math.max(0, time - lastSample);
        if (pause >= FLICK_MAX_PAUSE_MS) {
          stop();
          return;
        }
        const last = motionSamples.at(-1);
        const speed = Math.hypot(vx, vy) / pixelScale;
        const terminalSpeed = last ? Math.hypot(last.dx, last.dy) / (last.to - last.from) / pixelScale : 0;
        if (recentDistance < FLICK_MIN_DISTANCE || Math.min(speed, terminalSpeed) < FLICK_MIN_SPEED) vx = vy = 0;
        else {
          const fraction = Math.min(1, terminalSpeed / speed) * (1 - (pause / FLICK_MAX_PAUSE_MS) ** 2);
          vx *= fraction;
          vy *= fraction;
        }
        releaseTime = time;
        return;
      }
      lastTick = time;
      if (time - lastSample > 100) vx = vy = 0;
    }

    return {
      frame, begin, move, end, stop, pause, reset,
      get active() { return moving() || (!!pending && !pending.timedOut); },
      get settled() { return !!latest && !pending; },
      debug() {
        return { dragging, velocity: { x: vx, y: vy }, desired: desired && { ...desired }, visible: visible && { ...visible },
          pending: pending && { ...pending, from: { ...pending.from }, to: { ...pending.to }, bounds: { ...pending.bounds } },
          latestCamera: latest && { ...latest }, sourceCamera: latest && { ...latest }, telemetry: { ...telemetry } };
      },
    };
  }

  const api = { createCamera, ahead, guardPixels };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftSmoothCamera = api;
})(typeof window !== 'undefined' ? window : globalThis);
