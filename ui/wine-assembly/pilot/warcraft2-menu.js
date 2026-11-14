/* Present BNE's original pre-game pixels with the matching native input transform. */
(function (global) {
  'use strict';

  const ART = {x: 0, y: 0, w: 640, h: 480};
  // Original dialog handlers registered through 405720. The scene-7 IMAGE
  // and 4886F0 painter are the undecorated TitleMenu_BNE.pcx loaded at 44F36F.
  const TITLE_HANDLERS = new Map([[0x42adc0, 'title'], [0x441cc0, 'single'], [0x434a00, 'campaign']]);
  const MISSION_BRIEFING_CALLBACK = 0x42fef0;
  const ACT_INTERLUDE = 0x429580;
  const CREDITS = 0x417d00;
  const MISSION_STATS = 0x4315e0;
  const TITLE_IMAGE = 0x4be200;
  const IMAGE_PAINTER = 0x4886f0;
  const NATIVE_DIALOG_PAINTER = 0x405400;
  const SCENES = 0x4d48f8;
  const SCENE_STRIDE = 20;
  const IN_GAME = 0x4ae86c;
  const GAME_STATE = 0x4ae480;

  function area(x, y, w, h) {
    return {x, y, w, h};
  }

  function centered(source, width, height) {
    const scale = Math.min(width / source.w, height / source.h);
    return area((width - source.w * scale) / 2, (height - source.h * scale) / 2,
      source.w * scale, source.h * scale);
  }

  function layout(width, height, mode, original = ART, controls = []) {
    if (![width, height, original.w, original.h].every(n => Number.isFinite(n) && n > 0)) {
      return null;
    }
    const normal = centered(original, width, height);
    const base = {width, height, mode, art: original, regions: [{source: original, target: normal}]};
    if (width >= height || !controls.length) return base;
    const firstY = Math.min(...controls.map(r => r.y));
    const lastY = Math.max(...controls.map(r => r.y + r.h));
    const largestW = Math.max(...controls.map(r => r.w));
    const artHeight = Math.min(normal.h, height * 0.40);
    const artWidth = artHeight * original.w / original.h;
    const scale = Math.min(1.65, (width - 24) / largestW,
      (height - artHeight - 24) / (lastY - firstY));
    if (scale <= normal.w / original.w) return base;
    // Leave the complete original artwork, including its version stamp,
    // above the enlarged native controls.
    const top = (height - artHeight - 12 - (lastY - firstY) * scale) / 2;
    const controlTop = top + artHeight + 12;
    const artwork = area((width - artWidth) / 2, top, artWidth, artHeight);
    const regions = controls.map(source => ({source,
      target: area((width - source.w * scale) / 2, controlTop + (source.y - firstY) * scale,
        source.w * scale, source.h * scale)}));
    return {...base, artwork, regions};
  }

  function bottomButtonLayout(wine, current, width, height) {
    if (!['credits', 'stats'].includes(current.cinematic) || width < 200 || height < 220) return null;
    const isCredits = current.cinematic === 'credits';
    const dialog = current.scenes.find(scene => scene.handler === (isCredits ? CREDITS : MISSION_STATS));
    if (!dialog) return null;
    const child = nativeView(wine, dialog.root, 0x4a)?.getUint32(0x46, true);
    const button = child && nativeView(wine, child, 0x36);
    const x = isCredits ? 524 : 456;
    const source = area(x, 448, 106, 28);
    if (!button || button.getUint32(0x32, true) !== dialog.root ||
        button.getInt16(0x20, true) !== -2 || button.getUint16(0x22, true) !== 1 ||
        !(button.getUint32(0x18, true) & 8) ||
        [4, 6, 8, 10].some((offset, i) => button.getInt16(offset, true) !== [x, 448, x + 105, 475][i])) return null;
    // Preserve the whole table/illustration up to the separate action.
    const art = area(0, 0, ART.w, 446);
    const scale = Math.min((width - 16) / art.w, (height - 76) / art.h);
    const w = art.w * scale, h = art.h * scale;
    const buttonHeight = 44, buttonWidth = buttonHeight * source.w / source.h;
    const top = (height - h - buttonHeight - 12) / 2;
    const control = {source, target: area((width - buttonWidth) / 2, top + h + 12, buttonWidth, buttonHeight)};
    return {width, height, mode: 'dialog', art: current.art, dialog, heldControls: [], regions: [control],
      paintRegions: [{source: art, target: area((width - w) / 2, top, w, h)}, control]};
  }

  function translate(regions, x, y, inverse = false) {
    for (const region of regions) {
      const from = inverse ? region.source : region.target;
      const to = inverse ? region.target : region.source;
      if (x >= from.x && y >= from.y && x < from.x + from.w && y < from.y + from.h) {
        return {x: to.x + (x - from.x) * to.w / from.w,
          y: to.y + (y - from.y) * to.h / from.h};
      }
    }
    return null;
  }

  function nativeView(wine, address, bytes) {
    const exports = wine.instance?.exports;
    const memory = wine.memory?.buffer;
    if (!exports?.guest_to_wasm || !memory) return null;
    const start = exports.guest_to_wasm(address) >>> 0;
    const end = exports.guest_to_wasm(address + bytes - 1) >>> 0;
    if (start <= 0xf0 || end >= memory.byteLength || end !== start + bytes - 1) return null;
    return new DataView(memory, start, bytes);
  }

  function dialogControls(wine, dialog) {
    let node = nativeView(wine, dialog.root, 0x4a)?.getUint32(0x46, true);
    const seen = new Set();
    const controls = [];
    while (node && seen.size < 24) {
      const child = nativeView(wine, node, 0x36);
      if (!child || seen.has(node) || child.getUint32(0x32, true) !== dialog.root) return [];
      seen.add(node);
      const kind = child.getUint16(0x22, true);
      const flags = child.getUint32(0x18, true);
      if ((kind === 2 || kind === 10) && (flags & 8)) {
        let x = child.getInt16(4, true) + dialog.x, y = child.getInt16(6, true) + dialog.y;
        let w = child.getInt16(8, true) + dialog.x - x + 1;
        const h = child.getInt16(10, true) + dialog.y - y + 1;
        if (kind === 10 && x === 0 && w === ART.w) {
          // The native campaign heading label is centered in a 640px box.
          // Keep a wider center crop than the buttons for the original text.
          x = 176;
          w = 288;
        }
        if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > ART.w || y + h > ART.h) return [];
        controls.push({...area(x, y, w, h), text: kind === 10});
      }
      node = child.getUint32(0, true);
    }
    return node ? [] : controls;
  }

  function movieIsPlaying(wine) {
    // The original SMK player installs these callbacks only for movie playback.
    const callbacks = nativeView(wine, 0x4ae164, 0x3c);
    return callbacks?.getUint32(0, true) === 0x43b2e0 &&
      callbacks.getUint32(4, true) === 0x43b250 &&
      callbacks.getUint32(0x38, true) === 0x43b280;
  }

  function nativeScene(wine, authored) {
    const play = nativeView(wine, IN_GAME, 1);
    if (!play || play.getUint8(0) !== 0 || global.WarcraftUiBridge?.state()?.inGame) return null;
    const registry = nativeView(wine, SCENES + 2 * SCENE_STRIDE, 6 * SCENE_STRIDE);
    if (!registry) return null;
    const scenes = [];
    for (let slot = 2; slot <= 7; slot++) {
      const at = (slot - 2) * SCENE_STRIDE;
      if (!registry.getUint8(at)) continue;
      const x = registry.getUint16(at + 2, true);
      const y = registry.getUint16(at + 4, true);
      const w = registry.getUint16(at + 6, true);
      const h = registry.getUint16(at + 8, true);
      const root = registry.getUint32(at + 12, true);
      const painter = registry.getUint32(at + 16, true);
      if (!w || !h) continue;
      const scene = {slot, x, y, w, h, root, painter};
      if (painter === NATIVE_DIALOG_PAINTER) {
        const record = nativeView(wine, root, 0x2e);
        if (record?.getUint16(0x20, true) === slot) scene.handler = record.getUint32(0x2a, true);
      }
      scenes.push(scene);
    }
    const dialogs = scenes.filter(scene => scene.handler && scene.x + scene.w <= ART.w &&
      scene.y + scene.h <= ART.h);
    if (dialogs.length) {
      const dialog = dialogs.length === 1 && dialogs[0];
      const mode = dialog && TITLE_HANDLERS.get(dialog.handler);
      const hasTitleArt = scenes.some(scene => scene.slot === 7 && scene.root === TITLE_IMAGE &&
        scene.painter === IMAGE_PAINTER && scene.x === 0 && scene.y === 0 &&
        scene.w === ART.w && scene.h === ART.h);
      const cinematic = dialog?.handler === ACT_INTERLUDE ? 'act' :
        dialog?.handler === CREDITS ? 'credits' : dialog?.handler === MISSION_STATS ? 'stats' : null;
      return {mode: mode || (dialog?.handler === MISSION_BRIEFING_CALLBACK ? 'briefing' : 'menu'),
        art: ART, scenes, cinematic,
        controls: mode && hasTitleArt ? dialogControls(wine, dialog) : []};
    }
    // Both BNE title images can be registered before their native buttons
    // exist. The incomplete artwork is a fade, not a screen to publish.
    const gameState = nativeView(wine, GAME_STATE, 2)?.getUint16(0, true);
    // On returning from Custom Setup the old movie callbacks can linger
    // while the surface still contains the unadapted setup screen.
    if (authored && gameState === 4) return null;
    // A standalone image with no registered dialog can be the previous
    // screen during a native transition. Only the classic path uses it.
    if (!authored && scenes.some(scene => scene.x === 0 && scene.y === 0 &&
        scene.w === ART.w && scene.h === ART.h)) {
      return {mode: 'menu', art: ART, scenes};
    }
    return !authored || (!scenes.length && movieIsPlaying(wine))
      ? {mode: 'video', art: ART, scenes} : null;
  }

  function draw(context, image, source, target) {
    if (source.w > 0 && source.h > 0 && target.w > 0 && target.h > 0) {
      context.drawImage(image, source.x, source.y, source.w, source.h,
        target.x, target.y, target.w, target.h);
    }
  }

  function rgb(data, offset = 0) {
    return `rgb(${data[offset]}, ${data[offset + 1]}, ${data[offset + 2]})`;
  }

  function installBackdrop(wine, image, previous) {
    const descriptor = nativeView(wine, TITLE_IMAGE, 8);
    if (descriptor?.getUint16(0, true) !== ART.w || descriptor.getUint16(2, true) !== ART.h) return null;
    const pixels = descriptor.getUint32(4, true);
    const palette = global.WarcraftUiBridge?.cursorPlane()?.palette;
    if (!palette || palette.length !== 1024) return null;
    if (previous?.pixels === pixels && palette.every((value, i) => value === previous.palette[i])) {
      return previous;
    }
    const native = nativeView(wine, pixels, ART.w * ART.h);
    if (!native) return null;
    // The applied cursor palette and the DirectDraw output should agree.
    // Verify a background patch before masking foreground text against it.
    const sample = image.getContext('2d').getImageData(0, 0, 3, 1).data;
    for (let i = 0; i < 3; i++) {
      const p = native.getUint8(i) * 4;
      if (sample[i * 4] !== palette[p] || sample[i * 4 + 1] !== palette[p + 1] ||
          sample[i * 4 + 2] !== palette[p + 2]) return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = ART.w;
    canvas.height = ART.h;
    const context = canvas.getContext('2d');
    const frame = context.createImageData(ART.w, ART.h);
    for (let i = 0; i < ART.w * ART.h; i++) {
      const at = i * 4, color = native.getUint8(i) * 4;
      frame.data[at] = palette[color];
      frame.data[at + 1] = palette[color + 1];
      frame.data[at + 2] = palette[color + 2];
      frame.data[at + 3] = 255;
    }
    context.putImageData(frame, 0, 0);
    return {canvas, pixels, palette, data: frame.data};
  }

  function drawForeground(context, image, region, backdrop, scratch) {
    const r = region.source;
    scratch.clearRect(0, 0, r.w, r.h);
    draw(scratch, image, r, area(0, 0, r.w, r.h));
    const foreground = scratch.getImageData(0, 0, r.w, r.h);
    const data = foreground.data;
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const at = (y * r.w + x) * 4, old = ((r.y + y) * ART.w + r.x + x) * 4;
        if (data[at] === backdrop.data[old] && data[at + 1] === backdrop.data[old + 1] &&
            data[at + 2] === backdrop.data[old + 2]) data[at + 3] = 0;
      }
    }
    scratch.putImageData(foreground, 0, 0);
    draw(context, scratch.canvas, area(0, 0, r.w, r.h), region.target);
  }

  function drawTitle(context, image, chart, backdrop, scratch) {
    draw(context, backdrop.canvas, ART, chart.artwork);
    for (const region of chart.regions) {
      if (region.source.text) drawForeground(context, image, region, backdrop, scratch);
      else draw(context, image, region.source, region.target);
    }
  }

  function install({wine, renderer, source, frame, onPrepared, onUnavailable}) {
    const canvas = document.createElement('canvas');
    canvas.id = 'warcraft-menu-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2', display: 'none',
    });
    frame.append(canvas);
    const context = canvas.getContext('2d', {alpha: false});
    const scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = ART.w;
    scratchCanvas.height = ART.h;
    const scratch = scratchCanvas.getContext('2d', {willReadFrequently: true});
    const originalMap = renderer._mapExclusiveInputPoint;
    const originalUnmap = renderer._unmapExclusiveInputPoint;
    const originalImmediate = renderer.touchWantsImmediatePress;
    let scene = null, chart = null, last = null, raf = 0, originX = 0, originY = 0;
    let backdrop = null, borderColor = '#000';
    let activating = false, transitioning = false;
    const authored = !!global.WarcraftAssemblyMenuNavigation;
    if (authored) frame.classList.add('warcraft-owns-presentation');
    const dialogTexture = authored ? new Image() : null;
    if (dialogTexture) { dialogTexture.src = './menu-art/orc-texture.png'; dialogTexture.onload = repaint; }
    const dialogBack = authored ? new Image() : null;
    if (dialogBack) { dialogBack.onload = repaint; dialogBack.src = './menu-art/orc-back.png'; }
    const navigation = global.WarcraftAssemblyMenuNavigation?.create({wine, renderer, frame, activate, repaint});

    function dialogStillActive() {
      if (!chart?.dialog) return true;
      const {slot, root, handler} = chart.dialog;
      const entry = nativeView(wine, SCENES + slot * SCENE_STRIDE, SCENE_STRIDE);
      const dialog = nativeView(wine, root, 0x4a);
      return !!entry?.getUint8(0) && !!entry.getUint16(6, true) && entry.getUint32(12, true) === root &&
        dialog?.getUint32(0x2a, true) === handler && !!dialog.getUint32(0x46, true);
    }

    function activate(x, y) {
      if (!chart || !scene || !renderer._exclusiveTransform) return false;
      const point = originalUnmap.call(renderer, originX + x + .5, originY + y + .5);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      activating = true;
      try {
        renderer.handleMouseMove(point.x, point.y);
        renderer.handleMouseDown(point.x, point.y, 0);
        renderer.handleMouseUp(point.x, point.y, 0);
      } finally {
        activating = false;
      }
      return true;
    }

    function hide() {
      canvas.style.display = 'none';
      chart = null;
      last = null;
      scene = null;
      navigation?.hide();
      onUnavailable?.();
    }

    function waitForScene() {
      chart = null;
      transitioning = !global.WarcraftUiBridge?.state()?.inGame;
      navigation?.hide();
      onUnavailable?.();
    }

    function paint(image) {
      const current = nativeScene(wine, authored);
      const transform = renderer._exclusiveTransform;
      const owner = transform && renderer.windows[transform.hwnd];
      if (!current || !transform || owner?.wasm !== wine.instance ||
          image !== renderer._exclusivePresentationSource ||
          image.width < ART.w || image.height < ART.h ||
          transform.srcX !== owner.x || transform.srcY !== owner.y) {
        if (!authored || global.WarcraftFullMap?.active || !wine.running) hide();
        else waitForScene();
        return;
      }
      const rect = frame.getBoundingClientRect();
      if ((current.controls?.length && (rect.width < rect.height || authored)) ||
          (authored && current.scenes.some(scene => scene.slot === 7 &&
            scene.root === TITLE_IMAGE && scene.painter === IMAGE_PAINTER))) {
        backdrop = installBackdrop(wine, image, backdrop);
      } else {
        backdrop = null;
      }
      const params = {width: rect.width, height: rect.height, art: current.art, scenes: current.scenes, wine,
        backTarget: dialogBack?.naturalWidth && global.WarcraftAssemblyMenuNavigation.backBox(rect.width, rect.height)};
      const nativeDialog = authored && bottomButtonLayout(wine, current, rect.width, rect.height) ||
        (current.mode === 'menu' && global.WarcraftAssemblyDialogLayout?.layout(params));
      const briefing = current.mode === 'briefing' && global.WarcraftAssemblyBriefingLayout?.layout(params);
      let next = briefing || nativeDialog || layout(rect.width, rect.height, current.mode, current.art,
        backdrop ? current.controls : []);
      if (!next) {
        hide();
        return;
      }
      const dpr = Math.max(1, Math.min(global.devicePixelRatio || 1, 3));
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      const isAuthoredNavigation = authored && TITLE_HANDLERS.has(current.scenes.find(s => s.handler)?.handler);
      if (isAuthoredNavigation && (!backdrop ||
          (current.mode === 'campaign' && current.controls.filter(c => !c.text).length !== 5))) {
        waitForScene();
        return;
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.setTransform(width / rect.width, 0, 0, height / rect.height, 0, 0);
      context.imageSmoothingEnabled = false;
      if (current.mode === 'video') {
        context.fillStyle = '#000';
      } else {
        if (current.mode !== scene?.mode || backdrop || current.mode === 'briefing') {
          // The mission briefing draws a wooden desk near the lower edge.
          // Use its original color only outside the complete centered frame.
          const sample = current.mode === 'briefing' ? [8, 474] : [0, 0];
          borderColor = backdrop ? rgb(backdrop.data) :
            rgb(image.getContext('2d').getImageData(...sample, 1, 1).data);
        }
        context.fillStyle = borderColor;
      }
      context.fillRect(0, 0, next.width, next.height);
      if (nativeDialog || (authored && current.cinematic)) {
        global.WarcraftAssemblyMenuNavigation?.paintTexture(context, dialogTexture, next.width, next.height);
      }
      const foreground = (sourceImage, region) => drawForeground(context, sourceImage, region, backdrop, scratch);
      const authoredPaint = navigation?.paint(context, image, backdrop, current, next.width, next.height, foreground);
      const briefingPaint = briefing && global.WarcraftAssemblyBriefingLayout.paint({wine, context, image, chart: briefing});
      if (!authoredPaint && !briefingPaint) {
        if (briefing) next = layout(rect.width, rect.height, current.mode, current.art);
        if (backdrop && next.artwork) drawTitle(context, image, next, backdrop, scratch);
        else for (const region of next.paintRegions || next.regions) {
          if (region.decoration === 'back') {
            const {x, y, w, h} = region.target;
            const size = Math.round(w * .9), height = size * .95;
            context.drawImage(dialogBack, x + (w - size) / 2, y + (h - height) / 2, size, height);
          } else if (region.foreground && backdrop) foreground(image, region);
          else draw(context, image, region.source, region.target);
        }
      }
      chart = next;
      scene = current;
      last = image;
      originX = transform.srcX;
      originY = transform.srcY;
      transitioning = false;
      canvas.style.display = 'block';
      onPrepared?.({mode: current.mode, authored: Boolean(authoredPaint)});
    }

    function repaint() {
      if (raf || !last) return;
      raf = global.requestAnimationFrame(() => {
        raf = 0;
        if (last) paint(last);
      });
    }

    function map(x, y) {
      if (activating) return originalMap.call(this, x, y);
      if (transitioning || navigation?.active) return {outside: true};
      if (!chart) return originalMap.call(this, x, y);
      if (!dialogStillActive()) return this._mouseButtonsMask
        ? {x: originX + 640, y: originY + 480} : {outside: true};
      const menu = translate(chart.regions, x * chart.width / Math.max(1, source.width),
        y * chart.height / Math.max(1, source.height));
      if (menu) return {x: originX + Math.floor(menu.x), y: originY + Math.floor(menu.y)};
      // A held native button must be released even if the pointer leaves the
      // art. The native client outside its 640x480 menu has no menu control.
      if (this._mouseButtonsMask) return {x: originX + 640, y: originY + 480};
      return {outside: true};
    }

    function unmap(x, y) {
      if (!chart) return originalUnmap.call(this, x, y);
      const point = translate(chart.regions, x - originX, y - originY, true);
      if (!point) return originalUnmap.call(this, x, y);
      return {x: point.x * source.width / chart.width, y: point.y * source.height / chart.height};
    }

    function immediatePress(x, y) {
      if (chart?.mode === 'dialog') {
        const point = map.call(this, x, y);
        if (!point.outside && global.WarcraftAssemblyDialogLayout.wantsImmediatePress(
          chart, point.x - originX, point.y - originY)) return true;
      }
      return originalImmediate?.call(this, x, y) ?? false;
    }

    const resize = new ResizeObserver(repaint);
    resize.observe(frame);
    renderer._mapExclusiveInputPoint = map;
    renderer._unmapExclusiveInputPoint = unmap;
    if (authored) renderer.touchWantsImmediatePress = immediatePress;

    return {
      get nativeTouch() { return authored && chart?.mode === 'dialog'; },
      onFrame(publication) {
        if (publication?.source) paint(publication.source);
        else if (!authored || !wine.running) hide();
        else waitForScene();
      },
      debug() {
        const rect = frame.getBoundingClientRect();
        return {
          active: Boolean(chart), scene, chart, navigation: navigation?.presented,
          backing: [canvas.width, canvas.height],
          client: [rect.left, rect.top, rect.width, rect.height],
          sourceToClient(x, y) {
            const nav = navigation?.presented;
            const regions = nav ? nav.controls.map((item, i) => ({source: item.source, target: nav.boxes[i]}))
              .filter(region => region.source) : chart?.regions;
            const point = regions && translate(regions, x + 0.5, y + 0.5, true);
            return point && {x: rect.left + point.x, y: rect.top + point.y};
          },
        };
      },
      destroy() {
        resize.disconnect();
        if (raf) global.cancelAnimationFrame(raf);
        if (renderer._mapExclusiveInputPoint === map) renderer._mapExclusiveInputPoint = originalMap;
        if (renderer._unmapExclusiveInputPoint === unmap) renderer._unmapExclusiveInputPoint = originalUnmap;
        if (renderer.touchWantsImmediatePress === immediatePress) renderer.touchWantsImmediatePress = originalImmediate;
        hide();
        navigation?.destroy();
        frame.classList.remove('warcraft-owns-presentation');
        canvas.remove();
      },
    };
  }

  const api = {install, layout, translate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyMenu = api;
})(globalThis);
