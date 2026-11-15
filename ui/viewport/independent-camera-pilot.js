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
    let image, pixels, painted, priorPainted, tilesPerRow, previous = null, comparison = null;
    let expanded = 0, reused = 0, uploads = 0, uploadedPixels = 0;
    const words = indices => new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4);

    function begin(packet,reuse) {
      if (previous === packet) return;
      const {width, height} = packet.screen;
      comparison = null;
      if (!image || canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        image = context.createImageData(width, height);
        pixels = new Uint32Array(image.data.buffer);
        tilesPerRow = width / tile;
        painted = new Uint8Array(tilesPerRow * (height / tile));
        priorPainted = new Uint8Array(painted.length);
      } else {
        const next = priorPainted;
        priorPainted = painted;
        painted = next;
        painted.fill(0);
        if (reuse && !packet.dialogRoot && !previous.dialogRoot && packet.sceneEpoch === previous.sceneEpoch &&
            packet.cameraX === previous.cameraX && packet.cameraY === previous.cameraY &&
            packet.indices.byteOffset % 4 === 0 && previous.indices.byteOffset % 4 === 0 &&
            packet.palette.every((byte,index) => byte === previous.palette[index])) {
          comparison = {packet: previous, before: words(previous.indices), after: words(packet.indices)};
        }
      }
      paletteBytes.set(packet.palette);
      for (let i = 3; i < paletteBytes.length; i += 4) paletteBytes[i] = 255;
      previous = packet;
      expanded = reused = uploads = uploadedPixels = 0;
    }

    function expand(x,y,width,height,stride) {
      for (let py=y; py<y+height; py++) {
        const start = py*stride+x, end = start+width;
        for (let i=start; i<end; i++) pixels[i] = palette[previous.indices[i]];
      }
      expanded += width*height;
    }

    function upload(x,y,width,height) {
      context.putImageData(image,0,0,x,y,width,height);
      uploads++;
      uploadedPixels += width*height;
    }

    function unchanged(x,y,wordStride) {
      const {before,after} = comparison;
      const start = y*wordStride+x/4;
      for (let iy=0; iy<tile; iy++) {
        const row = start+iy*wordStride, end = row+tile/4;
        for (let i=row; i<end; i++) if (before[i] !== after[i]) return false;
      }
      return true;
    }

    function paintReusingTiles(left,top,right,bottom,stride) {
      let dirtyLeft=right,dirtyTop=bottom,dirtyRight=left,dirtyBottom=top;
      for (let row=top; row<bottom; row++) for (let col=left; col<right; col++) {
        const index = row*tilesPerRow+col;
        if (painted[index]) continue;
        painted[index] = 1;
        const x = col*tile, y = row*tile;
        if (priorPainted[index] && unchanged(x,y,stride/4)) {
          reused += tile*tile;
        } else {
          expand(x,y,tile,tile,stride);
          dirtyLeft = Math.min(dirtyLeft,col);
          dirtyTop = Math.min(dirtyTop,row);
          dirtyRight = Math.max(dirtyRight,col+1);
          dirtyBottom = Math.max(dirtyBottom,row+1);
        }
      }
      // A single upload also covers unchanged pixels within the bounding
      // rectangle. Scattered animated sprites cannot create one upload each.
      if (dirtyLeft < dirtyRight && dirtyTop < dirtyBottom)
        upload(dirtyLeft*tile,dirtyTop*tile,(dirtyRight-dirtyLeft)*tile,(dirtyBottom-dirtyTop)*tile);
    }

    function paintRect(rect,reuse) {
      const left = Math.floor(rect.left / tile);
      const top = Math.floor(rect.top / tile);
      const right = Math.min(tilesPerRow, Math.ceil(rect.right / tile));
      const bottom = Math.min(canvas.height / tile, Math.ceil(rect.bottom / tile));
      const stride = canvas.width;
      if (reuse && comparison) {
        paintReusingTiles(left,top,right,bottom,stride);
        return;
      }
      for (let row = top; row < bottom; row++) {
        const first = row * tilesPerRow;
        let col = left;
        while (col < right) {
          if (painted[first + col]) { col++; continue; }
          const from = col;
          while (col < right && !painted[first + col]) painted[first + col++] = 1;
          // Upload an entire unpainted rectangle at once. One upload per
          // tile row left Android spending time on canvas transfers.
          let last = row+1;
          while (last < bottom) {
            const line = last*tilesPerRow;
            let clean = true;
            for (let tx=from; tx<col; tx++) if (painted[line+tx]) { clean=false; break; }
            if (!clean) break;
            painted.fill(1,line+from,line+col);
            last++;
          }
          const x=from*tile,y=row*tile,width=(col-from)*tile,height=(last-row)*tile;
          expand(x,y,width,height,stride);
          upload(x,y,width,height);
        }
      }
    }

    return {
      paint(packet, chart, reuse=true) {
        begin(packet,reuse);
        for (const region of chart.regions) {
          if (region.visible && !region.layer) paintRect(region.visualSource,reuse);
        }
        return canvas;
      },
      unchangedFrom(packet) {
        return comparison?.packet === packet && expanded === 0 && reused > 0;
      },
      debug() { return {expanded, reused, uploads, uploadedPixels, full: canvas.width * canvas.height}; },
    };
  }

  window.WarcraftIndependentCameraPilot = Object.freeze({viewport, referenceViewport, explicitBuilding, coversWorld, createCamera, createPainter});
})();
