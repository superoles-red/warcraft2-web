/* Display camera over native BNE pixels, with full coverage on small maps. */
(() => {
  'use strict';

  const referenceViewport = Object.freeze({width: 1216, height: 1056});
  // Fast lateral drags have less spare coverage in landscape. Add four
  // original tiles to the raster, with the reference view scale preserved.
  const viewport = Object.freeze(window.innerWidth > window.innerHeight
    ? {width: referenceViewport.width + 4 * 32, height: referenceViewport.height}
    : referenceViewport);
  const explicitBuilding = document.currentScript?.hasAttribute('data-build-confirm') === true;
  const tile = 32;
  const {coastStep, sampleFlick, flickVelocity} = window.WarcraftSmoothCamera;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function coversWorld(g) {
    return g?.active === true && g.width === viewport.width && g.height === viewport.height &&
      g.cameraX === 0 && g.cameraY === 0 && g.maxX === 0 && g.maxY === 0 &&
      g.mapWidth === 32 && g.mapHeight === 32 &&
      g.world.right - g.world.left === g.mapWidth * tile &&
      g.world.bottom - g.world.top === g.mapHeight * tile;
  }

  function createCamera(fallback) {
    let independent = false, view = null, position = null;
    let dragging = false, velocityX = 0, velocityY = 0;
    let lastMove = 0, lastFrame = 0, pixelScale = 1;
    const motion = [];

    function stop() {
      dragging = false;
      velocityX = velocityY = 0;
      motion.length = 0;
    }

    function setPosition(x, y) {
      position = {x: clamp(x, view.minX, view.maxX), y: clamp(y, view.minY, view.maxY)};
      if (position.x !== x) velocityX = 0;
      if (position.y !== y) velocityY = 0;
    }

    function frame(g, width, height, time = performance.now(), receipt, edgeRoom) {
      const supported = coversWorld(g);
      if (supported !== independent) {
        stop();
        fallback.reset();
        view = position = null;
        independent = supported;
      }
      if (!independent) return fallback.frame(g, width, height, time, receipt,
        g?.mapWidth > 32 || g?.mapHeight > 32, edgeRoom);

      const worldWidth = g.mapWidth * tile;
      const worldHeight = g.mapHeight * tile;
      // Use one scale for both axes. The shorter dimension depends on aspect.
      const scale = Math.max(width / 896, height / 896);
      const w = width / scale, h = height / scale;
      const minX = -(edgeRoom?.(w) ?? 0), minY = -(edgeRoom?.(h) ?? 0);
      const maxX = worldWidth - w - minX, maxY = worldHeight - h - minY;
      if (!view || view.w !== w || view.h !== h) {
        const cx = view ? position.x + view.w / 2 : worldWidth / 2;
        const cy = view ? position.y + view.h / 2 : worldHeight / 2;
        view = {w, h, minX, minY, maxX, maxY};
        stop();
        setPosition(cx - w / 2, cy - h / 2);
      } else if (view.minX !== minX || view.minY !== minY || view.maxX !== maxX || view.maxY !== maxY) {
        Object.assign(view, {minX, minY, maxX, maxY});
        setPosition(position.x, position.y);
      }
      const elapsed = time - lastFrame;
      lastFrame = time;
      if (!dragging && (velocityX || velocityY)) {
        const {distance,remaining} = coastStep(elapsed);
        setPosition(position.x + velocityX * distance, position.y + velocityY * distance);
        velocityX *= remaining;
        velocityY *= remaining;
        if (Math.hypot(velocityX,velocityY) < .015 * pixelScale) stop();
      }
      return {left: g.world.left + position.x, top: g.world.top + position.y,
        width: w, height: h, extraX: worldWidth - w, extraY: worldHeight - h,
        sourceCamera: {x: 0, y: 0}, visibleGlobal: {...position}};
    }

    return {
      frame,
      begin(time, scale) {
        if (!independent) return fallback.begin(time, scale);
        stop();
        dragging = true;
        lastMove = time;
        pixelScale = scale > 0 ? scale : 1;
      },
      move(dx, dy, time) {
        if (!independent) return fallback.move(dx, dy, time);
        if (!dragging || (!dx && !dy)) return;
        time = Math.max(lastMove,time);
        sampleFlick(motion,dx,dy,lastMove,time,pixelScale);
        lastMove = time;
        setPosition(position.x + dx, position.y + dy);
      },
      end(time) {
        if (!independent) return fallback.end(time);
        if (!dragging) return;
        dragging = false;
        const velocity = flickVelocity(motion,time,pixelScale);
        velocityX = velocity.x;
        velocityY = velocity.y;
        lastFrame = time;
      },
      centerOn(x,y, options) {
        if (!independent) return fallback.centerOn(x,y,options);
        if (!view || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        stop();
        if (options?.useEdgeRoom) setPosition(x-view.w/2,y-view.h/2);
        else setPosition(clamp(x-view.w/2,0,1024-view.w),clamp(y-view.h/2,0,1024-view.h));
        return true;
      },
      stop() { if (independent) stop(); else fallback.stop(); },
      pause(g) { if (independent) stop(); else fallback.pause(g); },
      reset() { stop(); view = position = null; independent = false; fallback.reset(); },
      get independent() { return independent; },
      get active() { return independent ? dragging || !!(velocityX || velocityY) : fallback.active; },
      get settled() { return independent ? !!view : fallback.settled; },
      debug() {
        if (!independent) return fallback.debug();
        return {mode: 'independent', dragging, velocity: {x: velocityX, y: velocityY},
          visible: position && {...position}, pending: null, sourceCamera: {x: 0, y: 0},
          telemetry: {requests: 0, timeouts: 0, coverageHolds: 0}};
      },
    };
  }

  function createPainter() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const paletteBytes = new Uint8Array(1024);
    const palette = new Uint32Array(paletteBytes.buffer);
    let strip, pixels, painted, tilesPerRow, previous = null, expanded = 0;

    function begin(packet) {
      if (previous === packet) return;
      const {width, height} = packet.screen;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        strip = context.createImageData(width, tile);
        pixels = new Uint32Array(strip.data.buffer);
        tilesPerRow = width / tile;
        painted = new Uint8Array(tilesPerRow * (height / tile));
      } else painted.fill(0);
      paletteBytes.set(packet.palette);
      for (let i = 3; i < paletteBytes.length; i += 4) paletteBytes[i] = 255;
      previous = packet;
      expanded = 0;
    }

    function paintRect(rect) {
      const left = Math.floor(rect.left / tile);
      const top = Math.floor(rect.top / tile);
      const right = Math.min(tilesPerRow, Math.ceil(rect.right / tile));
      const bottom = Math.min(canvas.height / tile, Math.ceil(rect.bottom / tile));
      for (let row = top; row < bottom; row++) {
        const first = row * tilesPerRow;
        let col = left;
        while (col < right) {
          if (painted[first + col]) { col++; continue; }
          const from = col;
          while (col < right && !painted[first + col]) painted[first + col++] = 1;
          const x = from * tile, y = row * tile, width = (col - from) * tile;
          for (let py = 0; py < tile; py++) {
            const target = py * canvas.width + x;
            const source = target + y * canvas.width;
            for (let dx = 0; dx < width; dx++) pixels[target + dx] = palette[previous.indices[source + dx]];
          }
          context.putImageData(strip, 0, y, x, 0, width, tile);
          expanded += width * tile;
        }
      }
    }

    return {
      paint(packet, chart) {
        begin(packet);
        for (const region of chart.regions) {
          if (region.visible && !region.layer) paintRect(region.visualSource);
        }
        return canvas;
      },
      debug() { return {expanded, full: canvas.width * canvas.height}; },
    };
  }

  window.WarcraftIndependentCameraPilot = Object.freeze({viewport, referenceViewport, explicitBuilding, coversWorld, createCamera, createPainter});
})();
