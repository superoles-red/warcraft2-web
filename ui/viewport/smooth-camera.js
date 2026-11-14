/* Pan a crop of the newest completed native raster. Only camera geometry is retained. */
(function (global) {
  'use strict';
  const TILE = 32;
  const options = new URLSearchParams(global.location?.search);
  const ahead = options.get('bridge') === 'v16' && options.get('view') === 'map' &&
    options.get('camera') !== 'tile';
  const guardPixels = ahead ? 64 : 32;
  const EPSILON = 1e-7;
  const COAST_DECAY_MS = 230;
  const COAST_BRAKE_MS = 90;
  const COAST_RECOVERY_ACCELERATION = .005;
  const COAST_MAX_STALL_MS = 55;
  const MAX_COAST_CSS_SPEED = 3.4;
  const COAST_TRAVEL_MS = 1050;
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

  function flickVelocity(samples, time, scale) {
    const last = samples.at(-1);
    if (!last || time - last.to >= FLICK_MAX_PAUSE_MS) return {x:0, y:0};
    const start = Math.max(last.to - FLICK_WINDOW_MS, samples[0].from);
    let x = 0, y = 0;
    for (const sample of samples) {
      const fraction = Math.max(0, sample.to - Math.max(sample.from,start)) / (sample.to - sample.from);
      x += sample.dx * fraction;
      y += sample.dy * fraction;
    }
    const span = Math.max(8,last.to - start), distance = Math.hypot(x,y);
    const speed = distance / span;
    const terminal = Math.hypot(last.dx,last.dy) / (last.to - last.from);
    if (distance < FLICK_MIN_DISTANCE * scale || Math.min(speed,terminal) < FLICK_MIN_SPEED * scale) return {x:0,y:0};
    const limit = Math.min(speed,terminal,MAX_COAST_CSS_SPEED * scale);
    const pause = Math.max(0,time - last.to) / FLICK_MAX_PAUSE_MS;
    const factor = (limit / speed) * (1 - pause ** 2) / span;
    return {x:x*factor,y:y*factor};
  }

  function sampleFlick(samples, dx, dy, from, to) {
    const last = samples.at(-1);
    if (to - from > FLICK_MAX_PAUSE_MS || (last && dx * last.dx + dy * last.dy < 0)) samples.length = 0;
    const tail = samples.at(-1);
    if (tail && tail.to === to) { tail.dx += dx; tail.dy += dy; }
    else samples.push({from:Math.min(to-8, Math.max(from,to-FLICK_WINDOW_MS)), to, dx, dy});
    while (samples[0].to <= to-FLICK_WINDOW_MS) samples.shift();
  }

  function validGeometry(g) {
    return g?.active === true && g.world && [g.width, g.height, g.world.left, g.world.top,
      g.world.right, g.world.bottom, g.mapWidth, g.mapHeight, g.cameraX, g.cameraY,
      g.maxX, g.maxY].every(Number.isFinite) && g.width > 0 && g.height > 0 &&
      g.world.left >= 0 && g.world.top >= 0 && g.world.right > g.world.left &&
      g.world.bottom > g.world.top && g.world.right <= g.width && g.world.bottom <= g.height &&
      g.mapWidth > 0 && g.mapHeight > 0 && g.cameraX >= 0 && g.cameraY >= 0 &&
      g.cameraX <= g.maxX && g.cameraY <= g.maxY;
  }

  function dimensions(g, width, height, guard, viewport, edgeRoom) {
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
    const realMaxX = Math.max(0, g.mapWidth * TILE - w);
    const realMaxY = Math.max(0, g.mapHeight * TILE - h);
    const edgeX = edgeRoom?.(w) ?? 0, edgeY = edgeRoom?.(h) ?? 0;
    return { w, h, extraX: nativeWidth - w, extraY: nativeHeight - h, realMaxX, realMaxY,
      minX: -edgeX, minY: -edgeY, maxX: realMaxX + edgeX, maxY: realMaxY + edgeY };
  }

  function coverage(camera, d) {
    const left = camera.x * TILE, top = camera.y * TILE;
    const right = left + d.extraX, bottom = top + d.extraY;
    // The guest still needs to render all visible terrain. Widen coverage
    // only on the four edges whose other side is genuinely outside the map.
    return { left: left === 0 ? d.minX : left, top: top === 0 ? d.minY : top,
      right: d.maxX===d.realMaxX ? Math.min(right,d.realMaxX) : right>=d.realMaxX-EPSILON ? d.maxX : right,
      bottom: d.maxY===d.realMaxY ? Math.min(bottom,d.realMaxY) : bottom>=d.realMaxY-EPSILON ? d.maxY : bottom };
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
    let motionSamples = [];
    let retainDragTravel = false, travelDeadline = null, lastDragX = 0, lastDragY = 0;
    let jump = null, dimensionsNow = null;
    const telemetry = { requests: 0, externalResets: 0, timeouts: 0, coverageHolds: 0, recovered: 0 };

    function stop() {
      jump = null;
      dragging = false;
      vx = vy = 0;
      releaseTime = null;
      travelDeadline = null;
      lastDragX = lastDragY = 0;
      coastBlockedSince = null;
      catchingUp = false;
      displaySpeed = 0;
      motionSamples = [];
      lastTick = null;
      if (visible) desired = { ...visible };
    }

    function reset() {
      stop();
      key = '';
      viewWidth = viewHeight = 0;
      latest = desired = visible = pending = null;
      dimensionsNow = null;
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

    function frame(g, width, height, time = now(), receipt, travel = false, edgeRoom) {
      if (!validGeometry(g) || !Number.isFinite(time) || !(width > 0 && height > 0)) {
        reset();
        return null;
      }
      const d = dimensions(g, width, height, lookAhead ? 64 : 32,
        lookAhead ? viewport ?? global.WARCRAFT_CAMERA_VIEWPORT : null, edgeRoom);
      const nextKey = [g.width, g.height, g.world.left, g.world.top, g.world.right,
        g.world.bottom, g.mapWidth, g.mapHeight, g.maxX, g.maxY, travel, !!edgeRoom].join(',');
      retainDragTravel = lookAhead && travel;
      const native = { x: g.cameraX, y: g.cameraY };
      const liveBounds = coverage(native, d);
      const center = () => fit({x:native.x*TILE+d.extraX/2,y:native.y*TILE+d.extraY/2},
        {left:native.x*TILE,top:native.y*TILE,right:Math.min(native.x*TILE+d.extraX,d.realMaxX),
          bottom:Math.min(native.y*TILE+d.extraY,d.realMaxY)});
      if (nextKey !== key) {
        reset();
        key = nextKey;
        desired = center();
        visible = { ...desired };
        lastTick = time;
      }
      dimensionsNow = d;
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
      if (pending && native.x === pending.to.x && native.y === pending.to.y) {
        if (pending.jump && jump) {
          visible = fit(pending.jump,liveBounds);
          desired = {...visible};
          if (jump === pending.jump) jump = null;
        }
        pending = null;
      }
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
        if (status > 1) {
          if (jump === pending.jump) jump = null;
          pending = null;
        }
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
      if(jump&&!pending){
        const x=clamp(Math.round((jump.x-d.extraX/2)/TILE),0,g.maxX);
        const y=clamp(Math.round((jump.y-d.extraY/2)/TILE),0,g.maxY);
        if(x===native.x&&y===native.y){
          visible=fit(jump,liveBounds);desired={...visible};jump=null;
        }else{
          const serial=panTiles(x-native.x,y-native.y,native);
          if(serial!==false){
            pending={from:native,to:{x,y},bounds:liveBounds,at:time,timedOut:false,serial,frameSequence:receipt?.sequence,jump};
          }
        }
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
        vx = vy = 0;
        travelDeadline = null;
      }
      if (retainDragTravel && !tracking && travelDeadline !== null) {
        const integration = -COAST_DECAY_MS * Math.expm1(-dt / COAST_DECAY_MS);
        const decay = Math.exp(-elapsed / COAST_DECAY_MS);
        desired.x += vx * integration;
        desired.y += vy * integration;
        vx *= decay;
        vy *= decay;
        if (Math.hypot(vx,vy) < .018 * pixelScale) vx = vy = 0;
      } else if (lookAhead && !tracking) {
        if (visible.x === d.minX && vx < 0 || visible.x === d.maxX && vx > 0) vx = 0;
        if (visible.y === d.minY && vy < 0 || visible.y === d.maxY && vy > 0) vy = 0;
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
      desired.x = clamp(desired.x, d.minX, d.maxX);
      desired.y = clamp(desired.y, d.minY, d.maxY);
      if ((desired.x === d.minX && vx < 0) || (desired.x === d.maxX && vx > 0)) vx = 0;
      if ((desired.y === d.minY && vy < 0) || (desired.y === d.maxY && vy > 0)) vy = 0;

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
      if (retainDragTravel) {
        speedLimit = tracking ? MAX_DRAG_CSS_SPEED * pixelScale :
          Math.min(MAX_DRAG_CSS_SPEED * pixelScale, Math.max(Math.hypot(vx,vy),Math.hypot(desired.x-visible.x,desired.y-visible.y)/75));
      }
      const limit = speedLimit * dt;
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
      if (travelDeadline !== null && !vx && !vy && Math.hypot(desired.x - visible.x, desired.y - visible.y) <= .02) {
        desired = { ...visible };
        travelDeadline = null;
      }
      if (releaseTime !== null && dt > 0) {
        // Coast from the position actually drawn, with no remaining drag debt.
        const speed = Math.hypot(vx, vy);
        const limit = MAX_COAST_CSS_SPEED * pixelScale;
        const scale = speed > limit ? limit / speed : 1;
        const decay = Math.exp(-Math.max(0, time - releaseTime) / COAST_DECAY_MS);
        vx *= scale * decay;
        vy *= scale * decay;
        displaySpeed = Math.hypot(vx, vy);
        if(!retainDragTravel)desired = { ...visible };
        releaseTime = null;
      }

      if (!pending && moving()) {
        const nativeDesired = {x:clamp(desired.x,0,d.realMaxX), y:clamp(desired.y,0,d.realMaxY)};
        const nativeVisible = {x:clamp(visible.x,0,d.realMaxX), y:clamp(visible.y,0,d.realMaxY)};
        const tileX = clamp(Math.round((nativeDesired.x - d.extraX / 2) / TILE), 0, g.maxX);
        const tileY = clamp(Math.round((nativeDesired.y - d.extraY / 2) / TILE), 0, g.maxY);
        const leadTime = dragging && time - lastSample > 44 ? 0 : 80;
        const stepX = retainDragTravel
          ? travelTile(nativeDesired.x, nativeVisible.x, native.x, d.extraX, g.maxX, leadTime ? vx : 0) - native.x
          : lookAhead
          ? nextTile(nativeDesired.x, nativeVisible.x, native.x, d.extraX, g.maxX, clamp(vx * leadTime, -64, 64)) - native.x
          : Math.sign(tileX - native.x);
        const stepY = retainDragTravel
          ? travelTile(nativeDesired.y, nativeVisible.y, native.y, d.extraY, g.maxY, leadTime ? vy : 0) - native.y
          : lookAhead
          ? nextTile(nativeDesired.y, nativeVisible.y, native.y, d.extraY, g.maxY, clamp(vy * leadTime, -64, 64)) - native.y
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

      const left = visible.x - native.x * TILE, top = visible.y - native.y * TILE;
      return { left: g.world.left + (edgeRoom ? left : clamp(left,0,d.extraX)),
        top: g.world.top + (edgeRoom ? top : clamp(top,0,d.extraY)),
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
      if (reversed) {
        // A turn cancels the part of the previous drag that was never displayed.
        if (dx * (desired.x - visible.x) < 0) desired.x = visible.x;
        if (dy * (desired.y - visible.y) < 0) desired.y = visible.y;
      }
      time = Math.max(lastSample, time);
      sampleFlick(motionSamples,dx,dy,lastSample,time);
      const tail = motionSamples.at(-1);
      vx = tail.dx / (tail.to-tail.from);
      vy = tail.dy / (tail.to-tail.from);
      lastSample = time;
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
      if (lookAhead) {
        const velocity = flickVelocity(motionSamples,time,pixelScale);
        vx = velocity.x;
        vy = velocity.y;
        if (retainDragTravel) {
          travelDeadline = time + ((vx || vy) ? COAST_TRAVEL_MS : DRAG_TRAVEL_MS);
        } else releaseTime = time;
        return;
      }
      lastTick = time;
      if (time - lastSample > 100) vx = vy = 0;
    }

    function centerOn(x,y) {
      if(!dimensionsNow||!Number.isFinite(x)||!Number.isFinite(y))return false;
      stop();
      const d=dimensionsNow;
      jump={x:clamp(x-d.w/2,0,d.realMaxX),y:clamp(y-d.h/2,0,d.realMaxY)};
      return true;
    }

    return {
      frame, begin, move, end, stop, pause, reset, centerOn,
      get active() { return moving() || (!!pending && !pending.timedOut) || (!!jump && !pending); },
      get settled() { return !!latest && !pending && !jump; },
      debug() {
        return { dragging, velocity: { x: vx, y: vy }, desired: desired && { ...desired }, visible: visible && { ...visible },
          pending: pending && { ...pending, from: { ...pending.from }, to: { ...pending.to }, bounds: { ...pending.bounds } },
          latestCamera: latest && { ...latest }, sourceCamera: latest && { ...latest }, telemetry: { ...telemetry } };
      },
    };
  }

  const api = { createCamera, ahead, guardPixels, coastMs: COAST_DECAY_MS, flickVelocity, sampleFlick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftSmoothCamera = api;
})(typeof window !== 'undefined' ? window : globalThis);
