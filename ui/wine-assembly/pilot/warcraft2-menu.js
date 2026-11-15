/* Present BNE's original pre-game pixels with the matching native input transform. */
(function (global) {
  'use strict';

  const ART = {x: 0, y: 0, w: 640, h: 480};
  // Original dialog handlers registered through 405720. The scene-7 IMAGE
  // and 4886F0 painter are the undecorated TitleMenu_BNE.pcx loaded at 44F36F.
  const TITLE_HANDLERS = new Map([[0x42adc0, 'title'], [0x441cc0, 'single'], [0x434a00, 'campaign']]);
  const SOUND_OPTIONS = 0x441940;
  const MISSION_BRIEFING_CALLBACK = 0x42fef0;
  const ACT_INTERLUDE = 0x429580;
  const CREDITS = 0x417d00;
  const MISSION_STATS = 0x4315e0;
  const MISSION_VICTORY = 0x4599e0;
  const MISSION_DEFEAT = 0x459b70;
  const OUTCOME_SLOT = 3;

  const isOutcome = handler => handler === MISSION_VICTORY || handler === MISSION_DEFEAT;
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
    if (!['credits', 'stats'].includes(current.cinematic) || width < 200 || height < 180) return null;
    const isCredits = current.cinematic === 'credits';
    const dialog = current.scenes.find(scene => scene.handler === (isCredits ? CREDITS : MISSION_STATS));
    if (!dialog) return null;
    const x = isCredits ? 524 : 456;
    const child = nativeView(wine, dialog.root, 0x4a)?.getUint32(0x46, true);
    const button = child && nativeView(wine, child, 0x36);
    const source = area(x, 448, 106, 28);
    if (!button || button.getUint32(0x32, true) !== dialog.root ||
        button.getInt16(0x20, true) !== -2 || button.getUint16(0x22, true) !== 1 ||
        !(button.getUint32(0x18, true) & 8) ||
        [4, 6, 8, 10].some((offset, i) => button.getInt16(offset, true) !== [x, 448, x + 105, 475][i])) return null;
    // Preserve the whole table/illustration up to the separate action.
    const art = area(0, 0, ART.w, 446);
    const buttonHeight = global.WarcraftAssemblyDialogLayout.menuButtonHeight(width,height);
    const captionScale = Math.min(1.6,(width-16)/source.w,height*.15/28);
    const buttonWidth = source.w*captionScale;
    const scale = Math.min((width - 16) / art.w, (height - buttonHeight - 28) / art.h);
    const w = art.w * scale, h = art.h * scale;
    const top = (height - h - buttonHeight - 12) / 2;
    const control = {source, target: area((width - buttonWidth) / 2, top + h + 12, buttonWidth, buttonHeight),
      decoration:'tall-button'};
    return {width, height, mode: 'dialog', art: current.art, dialog, heldControls: [], regions: [control],
      paintRegions: [{source: art, target: area((width - w) / 2, top, w, h)}, control]};
  }

  function resultControls(wine, dialog) {
    const seen = new Set(), controls = [];
    let address = nativeView(wine, dialog.root, 0x4a)?.getUint32(0x46, true);
    while (address && seen.size < 80) {
      const child = nativeView(wine, address, 0x36);
      if (!child || seen.has(address) || child.getUint32(0x32, true) !== dialog.root) return null;
      seen.add(address);
      const x = child.getInt16(4, true), y = child.getInt16(6, true);
      const w = child.getInt16(8, true) - x + 1, h = child.getInt16(10, true) - y + 1;
      if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > dialog.w || y + h > dialog.h) return null;
      controls.push({...area(dialog.x + x, dialog.y + y, w, h),
        id: child.getInt16(0x20, true), kind: child.getUint16(0x22, true),
        visible: Boolean(child.getUint32(0x18, true) & 8)});
      address = child.getUint32(0, true);
    }
    return address ? null : controls;
  }

  function outcomeLayout(wine, dialog, width, height, bottomInset = 0) {
    if (dialog.w !== 288 || dialog.h !== 128) return null;
    const controls = resultControls(wine, dialog);
    const source = controls?.find(({id, kind, visible}) => visible && id === -2 && kind === 1);
    if (!source) return null;
    const scale = Math.min(1.65, (width - 24) / dialog.w, (height - bottomInset - 24) / dialog.h);
    if (scale <= 0) return null;
    const gap = 6 * scale;
    const headHeight = 56 * scale, paneWidth = dialog.w * scale;
    const buttonHeight = global.WarcraftAssemblyDialogLayout.menuButtonHeight(width, height);
    const paneHeight = headHeight + buttonHeight + gap*2;
    const x = (width - paneWidth) / 2, y = (height - bottomInset - paneHeight) / 2;
    const control = {source, decoration:'tall-button', accept:true,
      target:area(x + gap*2,y + headHeight + gap,paneWidth - gap*4,buttonHeight)};
    // The browser edition uses the campaign slot, including after victory.
    // Omit the original manual "Save Game" action from the presentation.
    return {width,height,mode:'dialog',art:ART,dialog,regions:[control],heldControls:[],
      outcomePanel:{source:area(dialog.x,dialog.y,dialog.w,56),
        target:area(x,y,paneWidth,paneHeight),headHeight}};
  }

  function statsLayout(wine, base, width, height, bottomInset = 0) {
    const controls = resultControls(wine, base.dialog);
    const headings = controls?.filter(row => row.kind === 10 && row.id >= 71 && row.id <= 77);
    const names = controls?.filter(row => row.kind === 10 && row.id >= 4 && row.id <= 11);
    if (!headings?.length || !names?.length) return null;
    headings.sort((a,b) => a.x - b.x);
    names.sort((a,b) => a.y - b.y);
    const rows = names.map(name => ({
      name,
      cells: controls.filter(cell => cell.kind === 9 && cell.y + cell.h === name.y).sort((a,b) => a.x-b.x),
    }));
    if (rows.some(row => row.cells.length !== headings.length)) return null;

    const split = width >= height * 1.2;
    const inset = Math.min(16, width * .04, height * .045), gap = Math.min(16, height * .025);
    const usableWidth = width - inset * 2, usableHeight = height - inset * 2 - bottomInset;
    const buttonHeight = global.WarcraftAssemblyDialogLayout.menuButtonHeight(width,height);
    const maxArtWidth = split ? Math.min(usableWidth * .45, usableHeight * 4/3) :
      Math.min(usableWidth, usableHeight * .41 * 4/3);
    const panelWidth = Math.min(720,split ? usableWidth - maxArtWidth - gap : usableWidth);
    const compact = panelWidth < 510 && (rows.length <= 4 || !split);
    const groups = compact ? [headings.slice(0,4),headings.slice(4)].filter(group=>group.length) : [headings];
    const widest = Math.max(...groups.map(group=>group.length));
    const titleRows = split ? 1 : 2;
    const summaryHeight = titleRows * 62;
    const groupHeight = 44, rowGap = 7;
    const rowHeight = 35 + groups.length * groupHeight + rowGap;
    const logicalHeight = summaryHeight + rows.length * rowHeight - rowGap;
    const preferredArtHeight = split ? 0 : Math.min(maxArtWidth * .75,usableHeight * (rows.length > 4 ? .23 : .39));
    const scale = Math.min(1.3,(panelWidth - 8) / (widest * 90),
      (usableHeight - preferredArtHeight - buttonHeight - gap * (split ? 2 : 3)) / logicalHeight);
    if (scale <= 0.2) return null;
    const artWidth = split ? maxArtWidth : preferredArtHeight * 4/3;
    const artHeight = artWidth * .75;
    const totalHeight = logicalHeight * scale + gap + buttonHeight;
    const layoutX = split ? (width - artWidth - gap - panelWidth) / 2 : (width - panelWidth) / 2;
    const paneX = layoutX + (split ? artWidth + gap : 0);
    let y = inset + (usableHeight - totalHeight - (split ? 0 : artHeight + gap)) / 2;
    const artwork = area(split ? layoutX : (width-artWidth)/2,
      split ? inset + (usableHeight - artHeight) / 2 : y,artWidth,artHeight);
    if (!split) y += artHeight + gap;
    const paneY = y;
    const captions = [];
    const add = (source,target) => captions.push({source,target});
    const centeredCaption = (source,left,top,available) => {
      const fullScale = Math.min(scale, available / source.w);
      add(source,area(left + (available - source.w * fullScale) / 2,top,source.w * fullScale,source.h * fullScale));
    };
    const masthead = [area(0,58,214,70),area(214,58,220,62),area(434,58,206,62)];
    if (split) masthead.forEach((source,i)=>centeredCaption(source,paneX+i*panelWidth/3,y,panelWidth/3));
    else {
      centeredCaption(masthead[0],paneX,y,panelWidth);
      masthead.slice(1).forEach((source,i)=>centeredCaption(source,paneX+i*panelWidth/2,y+62*scale,panelWidth/2));
    }
    y += summaryHeight * scale;
    const dividers = [];
    for (const row of rows) {
      dividers.push(y);
      // The full-width native player name can be longer than a column. Trim
      // only transparent side bearings when fitting it to the text panel.
      captions.push({source:row.name,target:area(paneX+5,y,panelWidth-10,35*scale),centerInk:true});
      y += 35 * scale;
      let index = 0;
      const metricsLeft = paneX + (panelWidth - widest * 90 * scale) / 2;
      for (const group of groups) {
        group.forEach((heading,column) => {
          const cell = row.cells[index++];
          const x = metricsLeft + column * 90 * scale;
          add(heading,area(x,y,heading.w*scale,heading.h*scale));
          add(cell,area(x+(90-cell.w)*scale/2,y+18*scale,cell.w*scale,cell.h*scale));
        });
        y += groupHeight * scale;
      }
      y += rowGap * scale;
    }
    const originalButton = base.regions[0];
    const buttonWidth = originalButton.target.w;
    const control = {...originalButton,target:area(paneX + (panelWidth - buttonWidth) / 2,
      paneY + logicalHeight * scale + gap,buttonWidth,buttonHeight)};
    return {...base,regions:[control],control,
      statistics:{artwork,captions,dividers,panel:area(paneX,paneY,panelWidth,logicalHeight*scale),scale}};
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

  function nativeOutcome(wine) {
    const entry = nativeView(wine, SCENES + OUTCOME_SLOT * SCENE_STRIDE, SCENE_STRIDE);
    if (!entry?.getUint8(0) || entry.getUint16(6,true) !== 288 || entry.getUint16(8,true) !== 128 ||
        entry.getUint32(16,true) !== NATIVE_DIALOG_PAINTER) return null;
    const root = entry.getUint32(12,true);
    const record = nativeView(wine,root,0x4a);
    if (record?.getUint16(0x20,true) !== OUTCOME_SLOT) return null;
    const handler = record.getUint32(0x2a, true);
    if (!isOutcome(handler)) return null;
    return {slot:OUTCOME_SLOT,root,handler,painter:NATIVE_DIALOG_PAINTER,...area(entry.getUint16(2,true),
      entry.getUint16(4,true),entry.getUint16(6,true),entry.getUint16(8,true))};
  }

  function nativeScene(wine, authored) {
    const outcome = authored && nativeOutcome(wine);
    if (outcome) return {mode:'menu',art:ART,scenes:[outcome],outcome,cinematic:'outcome',controls:[]};
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
    const sound = scenes.find(scene => scene.handler === SOUND_OPTIONS);
    // The original Sound Options popup is centered in the expanded guest
    // raster, unlike the authored title, which stays in its 640×480 plane.
    if (sound) return {mode:'menu', art:ART, scenes, sound:true, controls:[]};
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

  function installBackdrop(wine, image, previous, artworkAddress = TITLE_IMAGE) {
    const descriptor = nativeView(wine, artworkAddress, 8);
    if (descriptor?.getUint16(0, true) !== ART.w || descriptor.getUint16(2, true) !== ART.h) return null;
    const pixels = descriptor.getUint32(4, true);
    let palette = global.WarcraftUiBridge?.cursorPlane()?.palette;
    const isNativeStatArt = artworkAddress !== TITLE_IMAGE;
    if (!isNativeStatArt && (!palette || palette.length !== 1024)) return null;
    const fallback = isNativeStatArt && nativeView(wine, 0x4ae894, 1024);
    if (!isNativeStatArt && previous?.pixels === pixels && palette.every((value, i) => value === previous.palette[i])) {
      return previous;
    }
    const native = nativeView(wine, pixels, ART.w * ART.h);
    if (!native) return null;
    // The applied cursor palette and the DirectDraw output should agree.
    // Verify a background patch before masking foreground text against it.
    const span = isNativeStatArt ? 12 : 3;
    const sample = image.getContext('2d').getImageData(0, 0, span, 1).data;
    const matches = colors => colors && Array.from({length:span}, (_,i)=>native.getUint8(i)*4)
      .every((offset,i)=>[0,1,2].every(channel=>sample[i*4+channel]===colors[offset+channel]));
    if (!matches(palette) && fallback) palette = new Uint8Array(fallback.buffer,fallback.byteOffset,fallback.byteLength);
    if (!matches(palette)) return null;
    if (previous?.pixels === pixels && palette.every((value,i)=>value===previous.palette[i])) return previous;
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
    let left = r.w, right = 0;
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const at = (y * r.w + x) * 4, old = ((r.y + y) * ART.w + r.x + x) * 4;
        if (data[at] === backdrop.data[old] && data[at + 1] === backdrop.data[old + 1] &&
            data[at + 2] === backdrop.data[old + 2]) data[at + 3] = 0;
        else if (region.centerInk) {
          left = Math.min(left,x);
          right = Math.max(right,x+1);
        }
      }
    }
    if (region.centerInk && right <= left) return;
    scratch.putImageData(foreground, 0, 0);
    const t = region.target;
    if (region.centerInk) {
      const scale = Math.min(t.w / (right-left),t.h / r.h);
      const w = (right-left)*scale, h = r.h*scale;
      draw(context,scratch.canvas,area(left,0,right-left,r.h),area(t.x+(t.w-w)/2,t.y+(t.h-h)/2,w,h));
    } else draw(context, scratch.canvas, area(0, 0, r.w, r.h), t);
  }

  function drawTitle(context, image, chart, backdrop, scratch) {
    draw(context, backdrop.canvas, ART, chart.artwork);
    for (const region of chart.regions) {
      if (region.source.text) drawForeground(context, image, region, backdrop, scratch);
      else draw(context, image, region.source, region.target);
    }
  }

  function install({wine, renderer, source, frame, initialPage, onPrepared, onUnavailable}) {
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
    const fastSetup = 0x415640;
    let scene = null, chart = null, last = null, raf = 0, originX = 0, originY = 0;
    let backdrop = null, statsArt = null, borderColor = '#000';
    let activating = false, transitioning = false;
    let scenarioDrag = null;
    let scenarioPickerRoot = null;
    const authored = !!global.WarcraftAssemblyMenuNavigation;
    if (authored) frame.classList.add('warcraft-owns-presentation');
    const dialogTexture = authored ? new Image() : null;
    if (dialogTexture) { dialogTexture.src = './menu-art/orc-texture.png'; dialogTexture.onload = repaint; }
    const humanTexture = authored && new Image();
    if (humanTexture) { humanTexture.onload = repaint; humanTexture.src = './menu-art/human-texture.png'; }
    const resultTexture = () => nativeView(wine,0x4abb7c,1)?.getUint8(0) === 0 ? humanTexture : dialogTexture;
    const dialogBack = authored ? new Image() : null;
    if (dialogBack) { dialogBack.onload = repaint; dialogBack.src = './menu-art/menu-back-orc.png'; }
    const scenarioArt = authored ? ['track','thumb'].map(name => {
      const image = new Image();
      image.onload = repaint;
      image.src = `./menu-art/volume-${name}.png`;
      return image;
    }) : [];
    const buttonArt = authored ? Object.fromEntries(['human','orc'].flatMap(faction => ['short','wide'].map(size => {
      const image = new Image();
      image.onload = repaint;
      image.src = `./menu-art/${faction}-${size}-button.png`;
      return [faction+'-'+size,image];
    }))) : {};
    const acceptArt = authored && new Image();
    const shortAcceptArt = authored && new Image();
    if (acceptArt) {
      acceptArt.onload = repaint;
      acceptArt.src = './menu-art/title-accept-button.png';
      shortAcceptArt.onload = repaint;
      shortAcceptArt.src = './menu-art/orc-accept-button.png';
    }
    const closedDialog = document.createElement('canvas');
    closedDialog.width = ART.w;
    closedDialog.height = ART.h;
    let closedDialogRoot = null;
    let dropdownAtlas,dropdownAtlasLoading=false;
    const dropdownCaptions=new Map();
    const navigation = global.WarcraftAssemblyMenuNavigation?.create({wine, renderer, frame, activate, repaint, initialPage});

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
      scenarioPickerRoot = null;
      navigation?.hide();
      onUnavailable?.();
    }

    function waitForScene() {
      chart = null;
      transitioning = scene?.cinematic === 'outcome' || scene?.cinematic === 'stats' ||
        !global.WarcraftUiBridge?.state()?.inGame;
      navigation?.hide();
      onUnavailable?.();
    }

    function drawTallButton(image, source, target, current, accept = false) {
      const faction = nativeView(wine,0x4abb7c,1)?.getUint8(0) === 0 ? 'human' : 'orc';
      const statButton = current.cinematic === 'stats';
      const paper = current.mode === 'briefing' || current.cinematic === 'credits' || statButton;
      const style = current.cinematic === 'outcome' ? faction : 'orc';
      const acceptFace=source.w>106?acceptArt:shortAcceptArt;
      const green = (accept || statButton) && acceptFace?.naturalWidth;
      const art = green ? acceptFace : buttonArt[style+'-'+(source.w>106?'wide':'short')];
      global.WarcraftAssemblyDialogLayout.paintTallButton(context,image,source,target,paper&&!green?null:art,undefined,paper,!green,green);
    }

    function paintOutcome(image, layout, current) {
      const {source:s,target:t,headHeight} = layout.outcomePanel;
      const scale = t.w/s.w;
      const rim = 3 * scale;
      // The original panel supplies the complete two-line caption and its
      // top bevel; continue the same faction stone behind the larger buttons.
      context.save();
      context.translate(t.x,t.y);
      global.WarcraftAssemblyMenuNavigation.paintTexture(context,resultTexture(),t.w,t.h);
      context.restore();
      draw(context,image,s,area(t.x,t.y,t.w,headHeight));
      draw(context,image,area(s.x,s.y+3,3,s.h-3),area(t.x,t.y+headHeight,rim,t.h-headHeight));
      draw(context,image,area(s.x+s.w-3,s.y+3,3,s.h-3),area(t.x+t.w-rim,t.y+headHeight,rim,t.h-headHeight));
      draw(context,image,area(s.x,s.y+125,s.w,3),area(t.x,t.y+t.h-rim,t.w,rim));
      for (const region of layout.regions) drawTallButton(image,region.source,region.target,current,region.accept);
    }

    function paintStatistics(image,layout,art,current) {
      const {artwork,captions,dividers,panel,scale} = layout.statistics;
      draw(context,art.canvas,ART,artwork);
      context.fillStyle = 'rgba(0, 0, 0, .49)';
      context.fillRect(panel.x,panel.y,panel.w,panel.h);
      context.fillStyle = 'rgba(245, 213, 139, .35)';
      for (const y of dividers) context.fillRect(panel.x + 5,y,panel.w - 10,Math.max(1,scale));
      for (const caption of captions) drawForeground(context,image,caption,art,scratch);
      const {source,target} = layout.control;
      drawTallButton(image,source,target,current);
    }

    function dropdownCaption(text) {
      const font=global.WarcraftSessionText;
      if(!text||!font)return null;
      if(!dropdownAtlas){
        if(!dropdownAtlasLoading){
          dropdownAtlasLoading=true;
          font.load(global.WarcraftLanguage?.current()).then(atlas=>{
            dropdownAtlas=atlas;
            repaint();
          }).catch(()=>{}).finally(()=>{dropdownAtlasLoading=false;});
        }
        return null;
      }
      if(!dropdownCaptions.has(text))dropdownCaptions.set(text,font.ink(text,dropdownAtlas));
      return dropdownCaptions.get(text);
    }

    function drawScenarioFrame(image, frame) {
      const {source:s,target:t,scale} = frame;
      const rim = 3;
      draw(context,image,area(s.x,s.y,s.w,rim),area(0,0,t.w,rim*scale));
      draw(context,image,area(s.x,s.y+s.h-rim,s.w,rim),area(0,t.h-rim*scale,t.w,rim*scale));
      draw(context,image,area(s.x,s.y+rim,rim,s.h-rim*2),area(0,rim*scale,rim*scale,t.h-rim*scale*2));
      draw(context,image,area(s.x+s.w-rim,s.y+rim,rim,s.h-rim*2),
        area(t.w-rim*scale,rim*scale,rim*scale,t.h-rim*scale*2));
    }

    function drawScenarioList(image, {source:s,target:t}, scale) {
      const factor = Math.min(scale,t.w/s.w,t.h/s.h);
      const stretch = t.h/s.h;
      const edge = 2;
      const [track] = scenarioArt;
      // The same native red stone as the slider is free of drawn text.
      // Use it for the larger hit rows, then paint just the original labels.
      for (let line=0;line<6;line++) {
        const rowY = 2+18*line, boxY = t.y+rowY*stretch;
        const innerX = t.x+edge*factor, innerW = t.w-edge*factor*2;
        context.drawImage(track,1,1,track.naturalWidth-2,track.naturalHeight-2,innerX,boxY,innerW,18*stretch);
        drawScenarioCaption(image,{source:area(s.x+edge,s.y+rowY,s.w-edge*2,16),
          target:area(innerX,boxY+(18*stretch-16*factor)/2,Math.min(innerW,(s.w-edge*2)*scale),16*factor)},true);
        draw(context,image,area(s.x+edge,s.y+rowY+16,s.w-edge*2,2),
          area(innerX,boxY+18*stretch-2*factor,innerW,2*factor));
      }
      for (const from of [0,s.w-edge]) draw(context,image,area(s.x+from,s.y,edge,s.h),
        area(t.x+(from?t.w-edge*factor:0),t.y,edge*factor,t.h));
      for (const from of [0,s.h-edge]) draw(context,image,area(s.x,s.y+from,s.w,edge),
        area(t.x,t.y+(from?t.h-edge*factor:0),t.w,edge*factor));
    }

    function drawScenarioCaption(image,{source:s,target:t},list=false) {
      scratch.clearRect(0,0,s.w,s.h);
      draw(scratch,image,s,area(0,0,s.w,s.h));
      const caption = scratch.getImageData(0,0,s.w,s.h);
      const {data} = caption;
      // The scenario caption uses the native yellow/white text palette.
      // Keep its neighboring one-pixel shadow, with no box of old stone.
      const ink = new Uint8Array(s.w*s.h);
      for(let i=0;i<ink.length;i++){
        const p=i*4,r=data[p],g=data[p+1],b=data[p+2];
        if((r>=170&&g>=140&&b<=41)||(r>=215&&g>=215&&b>=215)||
           (list&&((r===95&&g===51&&b===0)||(r===111&&g===111&&b===111))))ink[i]=1;
      }
      for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){
        const i=y*s.w+x,p=i*4;
        if(!ink[i]&&!(x&&y&&ink[i-s.w-1]&&Math.max(data[p],data[p+1],data[p+2])<=45))data[p+3]=0;
      }
      scratch.putImageData(caption,0,0);
      draw(context,scratch.canvas,area(0,0,s.w,s.h),t);
    }

    function scrollbarThumb(bar) {
      const {target:t,scale} = bar;
      return Math.min(t.w,Math.max(17,22*scale),t.h);
    }

    function drawScenarioScrollbar(bar) {
      const {target:t,value,max,scale} = bar;
      const [track,thumb] = scenarioArt;
      const size = scrollbarThumb(bar);
      const barWidth = Math.min(t.w,Math.max(18,20*scale));
      const centerX = t.x+t.w/2;
      context.save();
      context.translate(centerX,t.y);
      context.rotate(Math.PI/2);
      context.drawImage(track,0,-barWidth/2,t.h,barWidth);
      context.restore();
      if (max > 0) context.drawImage(thumb,centerX-size/2,t.y+(t.h-size)*value/max,size,size);
    }

    function paint(image) {
      const current = nativeScene(wine, authored);
      const transform = renderer._exclusiveTransform;
      const owner = transform && renderer.windows[transform.hwnd];
      if (!current || !transform || owner?.wasm !== wine.instance ||
          image !== renderer._exclusivePresentationSource ||
          image.width < ART.w || image.height < ART.h ||
          transform.srcX !== owner.x || transform.srcY !== owner.y) {
        const resultsTransition = wine.running && (scene?.cinematic === 'stats' || scene?.cinematic === 'outcome') &&
          nativeView(wine,IN_GAME,1)?.getUint8(0) === 0;
        if (!authored || !wine.running || (global.WarcraftFullMap?.active && !resultsTransition)) hide();
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
      const insets = authored && current.mode !== 'video' && global.WarcraftFullMap?.hudInsets;
      const left = insets?.left > 4 ? insets.left : 0;
      const right = insets?.right > 4 ? insets.right : 0;
      const contentWidth = rect.width - left - right;
      const dialogArt = current.sound ? area(0, 0, image.width, image.height) : current.art;
      const params = {width: contentWidth, height: rect.height, art: dialogArt, scenes: current.scenes, wine,
        backImage: dialogBack, bottomInset: insets?.bottom,
        backTarget: dialogBack?.naturalWidth && global.WarcraftAssemblyMenuNavigation.backBox(contentWidth, rect.height)};
      const bottomDialog = authored && bottomButtonLayout(wine,current,contentWidth,rect.height);
      const statistics = current.cinematic === 'stats' && bottomDialog &&
        statsLayout(wine,bottomDialog,contentWidth,rect.height,insets?.bottom ?? 0);
      const resultArtwork = statistics && installBackdrop(wine,image,statsArt,statistics.dialog.root+0x0c);
      statsArt = resultArtwork || (statistics && statsArt) || null;
      const outcome = current.outcome && outcomeLayout(wine,current.outcome,contentWidth,rect.height,insets?.bottom ?? 0);
      const nativeDialog = outcome || (resultArtwork && statistics) || bottomDialog ||
        (current.mode === 'menu' && global.WarcraftAssemblyDialogLayout?.layout(params));
      const briefingLayout = global.WarcraftAssemblyBriefingLayout;
      const briefing = current.mode === 'briefing' && briefingLayout?.layout(params);
      const preparedBriefing = briefing && briefingLayout.prepare(wine,image,briefing);
      if (nativeDialog?.scrollbar && scenarioArt.some(art=>!art.naturalWidth)) {
        waitForScene();
        return;
      }
      if (authored && current.mode === 'briefing' && !preparedBriefing) {
        // The briefing can be registered before the original bitmap and its
        // palette agree. Keep the last authored frame until they do.
        waitForScene();
        return;
      }
      if (authored && current.mode === 'menu' && !nativeDialog &&
          current.scenes.some(scene => scene.handler && global.WarcraftAssemblyDialogLayout?.isAdaptedHandler?.(scene.handler))) {
        waitForScene();
        return;
      }
      const next = (preparedBriefing && briefing) || nativeDialog || layout(contentWidth, rect.height, current.mode, current.art,
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
      const foreground = (sourceImage, region) => drawForeground(context, sourceImage, region, backdrop, scratch);
      const authoredPaint = navigation?.paint(context, image, backdrop, current,
        rect.width, rect.height, foreground, left, right, insets?.bottom);
      if (authoredPaint === null) {
        last = image;
        chart = null;
        transitioning = true;
        onUnavailable?.();
        return;
      }
      if (!authoredPaint) {
        const closedFrame = next.customFrame || next.scenarioFrame?.source;
        if (closedFrame && !next.scenarioPopup && !next.regions[0]?.wideHeldInput) {
          const {x,y,w,h} = closedFrame;
          closedDialog.getContext('2d').drawImage(image,x,y,w,h,x,y,w,h);
          closedDialogRoot = next.dialog.root;
        } else if (!closedFrame) closedDialogRoot = null;
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
        context.fillRect(0, 0, rect.width, rect.height);
        if (nativeDialog || (authored && current.cinematic)) {
          const texture = current.cinematic === 'stats' || current.outcome ? resultTexture() : dialogTexture;
          global.WarcraftAssemblyMenuNavigation?.paintTexture(context, texture, rect.width, rect.height);
        }
        context.save();
        try {
          context.translate(left, 0);
          if (preparedBriefing) {
            briefingLayout.paint({context,image,chart:briefing,prepared:preparedBriefing,
              backgroundLeft:-left,backgroundWidth:rect.width,
              paintContinue:(source,target)=>drawTallButton(image,source,target,current)});
          } else if (next.outcomePanel) {
            paintOutcome(image,next,current);
          } else if (next.statistics) {
            paintStatistics(image,next,resultArtwork,current);
          } else {
            if (next.scenarioFrame) drawScenarioFrame(image,next.scenarioFrame);
            if (backdrop && next.artwork) drawTitle(context, image, next, backdrop, scratch);
            else for (const region of next.paintRegions || next.regions) {
              const regionImage = region.previous ? (closedDialogRoot === next.dialog.root ? closedDialog : null) : image;
              if (!regionImage) continue;
              if (region.decoration === 'back') {
                const {x, y, w, h} = region.target;
                const size = Math.min(w,h);
                context.drawImage(dialogBack,x+(w-size)/2,y+(h-size)/2,size,size);
              } else if (region.decoration === 'scenario-list') {
                drawScenarioList(regionImage,region,next.scenarioFrame.scale);
              } else if (region.decoration === 'scenario-caption') {
                drawScenarioCaption(regionImage,region);
              } else if (region.decoration === 'scenario-scroll') {
                drawScenarioScrollbar(next.scrollbar);
              } else if (region.decoration === 'tall-button') {
                drawTallButton(regionImage,region.source,region.target,current,region.accept);
              } else if (region.decoration === 'sound-control') {
                global.WarcraftAssemblyDialogLayout.paintSoundControl(context,regionImage,region);
              } else if (region.decoration === 'sound-ends') {
                global.WarcraftAssemblyDialogLayout.paintSoundEnds(context,regionImage,region.source,region.target);
              } else if (region.decoration === 'dropdown') {
                global.WarcraftAssemblyDialogLayout.paintDropdown(context,regionImage,region.source,region.target,
                  buttonArt['orc-wide'],region.glyphScale,dropdownCaption(region.caption));
              } else if (region.decoration === 'custom-popup') {
                global.WarcraftAssemblyDialogLayout.paintCustomPopup(context,regionImage,region,buttonArt['orc-wide']);
              } else if (region.decoration === 'control-ink') {
                global.WarcraftAssemblyDialogLayout.paintControlInk(context,regionImage,region.source,region.target);
              } else if (region.texture && dialogTexture?.naturalWidth) {
                const {x,y,w,h} = region.target;
                context.save();
                context.translate(x,y);
                global.WarcraftAssemblyMenuNavigation.paintTexture(context,dialogTexture,w,h);
                context.restore();
              } else if (region.foreground && backdrop) foreground(regionImage, region);
              else {
                const {source, target} = region;
                draw(context, regionImage, source, target);
                if (current.sound) global.WarcraftModalPresentationV15?.paintSettingsFrame(context, image,
                  next.dialog?.handler, {left: source.x, top: source.y, width: source.w, height: source.h},
                  {left: target.x, top: target.y, width: target.w, height: target.h});
              }
            }
            if (current.sound && next.frame) {
              const {source, target} = next.frame;
              global.WarcraftModalPresentationV15?.paintSettingsFrame(context, image, next.dialog?.handler,
                {left:source.x,top:source.y,width:source.w,height:source.h},
                {left:target.x,top:target.y,width:target.w,height:target.h},
                next.frame.scale);
            }
          }
        } finally {
          context.restore();
        }
      }
      chart = left || right ? {...next, width:rect.width,
        regions:next.regions.map(region=>({...region,target:{...region.target,x:region.target.x+left}})),
        ...(next.scrollbar ? {scrollbar:{...next.scrollbar,target:{...next.scrollbar.target,x:next.scrollbar.target.x+left}}} : {})} : next;
      scene = current;
      last = image;
      originX = transform.srcX;
      originY = transform.srcY;
      transitioning = false;
      canvas.style.display = 'block';
      const zIndex = next.outcomePanel || current.cinematic === 'stats' ? '4' : '2';
      if (canvas.style.zIndex !== zIndex) canvas.style.zIndex = zIndex;
      onPrepared?.({mode: current.mode, authored: Boolean(authoredPaint)});
      if (!chart?.scenarioFrame) scenarioPickerRoot = null;
      else if (!chart.scenarioPopup && chart.dialog.root !== scenarioPickerRoot && navigation) {
        const target = decoration => {
          const region = chart.regions.find(item => item.decoration === decoration);
          if (!region) return null;
          const {x,y,w,h} = region.source;
          return [x+w/2,y+h/2];
        };
        const choose = target('tall-button'), back = target('back');
        if (choose && back && navigation.showScenarioPicker(chart.dialog,
          () => activate(...choose), () => activate(...back))) scenarioPickerRoot = chart.dialog.root;
      }
      if (chart?.dialog?.handler === fastSetup) navigation?.handleFastDialog();
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
      if (transitioning || navigation?.active || navigation?.blocking) return {outside: true};
      if (!chart) return originalMap.call(this, x, y);
      if (!dialogStillActive()) return this._mouseButtonsMask
        ? {x: originX + 640, y: originY + 480} : {outside: true};
      const point = menuPoint(x,y);
      const popup = chart.regions[0];
      if (popup?.wideHeldInput && (this._mouseButtonsMask & 1)) {
        const {target} = popup;
        // Only an open, held dropdown extends horizontally. The same native
        // Y mapping keeps the selected row and cancels above/below the list.
        if (point.x >= 0 && point.x < chart.width && point.y >= target.y && point.y < target.y + target.h) {
          point.x = target.x + target.w / 2;
        }
      }
      const bar = !chart.scenarioPopup && chart.scrollbar;
      if (bar?.max > 0 && (scenarioDrag?.root === chart.dialog.root || inScrollbar(point,bar))) {
        // Begin each drag on the native thumb, then use its original track.
        const size = scrollbarThumb(bar);
        const value = scenarioDrag && !scenarioDrag.start ? Math.max(0,Math.min(1,
          (point.y-bar.target.y-scenarioDrag.grab)/Math.max(1,bar.target.h-size))) : bar.value/bar.max;
        return {x:originX+bar.source.x+Math.floor(bar.source.w/2),
          y:originY+Math.round(bar.nativeFirst+(bar.nativeLast-bar.nativeFirst)*value)};
      }
      const menu = translate(chart.regions, point.x,point.y);
      if (menu) return {x: originX + Math.floor(menu.x), y: originY + Math.floor(menu.y)};
      // A held native button must be released even if the pointer leaves the
      // art. The native client outside its 640x480 menu has no menu control.
      if (this._mouseButtonsMask) return {x: originX + chart.art.w, y: originY + chart.art.h};
      return {outside: true};
    }

    function menuPoint(x,y) {
      return {x:x*chart.width/Math.max(1,source.width),y:y*chart.height/Math.max(1,source.height)};
    }

    function inScrollbar(point,bar) {
      const t = bar.target;
      return point.x>=t.x&&point.x<t.x+t.w&&point.y>=t.y&&point.y<t.y+t.h;
    }

    function unmap(x, y) {
      if (!chart) return originalUnmap.call(this, x, y);
      const point = translate(chart.regions, x - originX, y - originY, true);
      if (!point) return originalUnmap.call(this, x, y);
      return {x: point.x * source.width / chart.width, y: point.y * source.height / chart.height};
    }

    function immediatePress(x, y) {
      if (chart?.mode === 'dialog') {
        if (!chart.scenarioPopup && chart.scrollbar?.max && inScrollbar(menuPoint(x,y),chart.scrollbar)) return true;
        const point = map.call(this, x, y);
        if (!point.outside && global.WarcraftAssemblyDialogLayout.wantsImmediatePress(
          chart, point.x - originX, point.y - originY)) return true;
      }
      return originalImmediate?.call(this, x, y) ?? false;
    }

    const originalDown = renderer.handleMouseDown;
    const originalUp = renderer.handleMouseUp;
    const originalKeyDown = renderer.handleKeyDown;
    function fastScene() {
      return chart?.dialog?.handler === fastSetup && dialogStillActive();
    }
    function mouseDown(x,y,button,...args) {
      if (!activating && button === 0 && !chart?.scenarioPopup && chart?.scrollbar?.max && dialogStillActive() &&
          inScrollbar(menuPoint(x,y),chart.scrollbar)) {
        const bar = chart.scrollbar, size = scrollbarThumb(bar);
        const thumbTop = bar.target.y+(bar.target.h-size)*bar.value/bar.max;
        const offset = menuPoint(x,y).y-thumbTop;
        scenarioDrag = {root:chart.dialog.root,start:true,grab:offset>=0&&offset<=size?offset:size/2};
        const result = originalDown.call(this,x,y,button,...args);
        scenarioDrag.start = false;
        this.handleMouseMove(x,y);
        return result;
      }
      if (!activating && button === 0 && fastScene()) {
        const hit = map.call(this,x,y);
        const nx = hit.x - originX, ny = hit.y - originY;
        if (nx >= 400 && nx < 624 && ny >= 404 && ny < 432 &&
            navigation?.confirmFast(() => activate(510,418))) return;
      }
      return originalDown.call(this,x,y,button,...args);
    }
    function mouseUp(x,y,button,...args) {
      try { return originalUp.call(this,x,y,button,...args); }
      finally { if (button === 0) scenarioDrag = null; }
    }
    function keyDown(key,...args) {
      if (key === 9 && chart?.outcomePanel) return;
      if (key === 13 && fastScene() && !navigation?.blocking &&
          navigation?.confirmFast(() => activate(510,418))) return;
      return originalKeyDown.call(this,key,...args);
    }

    const resize = new ResizeObserver(repaint);
    resize.observe(frame);
    frame.addEventListener('warcraft-hud-insets-change', repaint);
    renderer._mapExclusiveInputPoint = map;
    renderer._unmapExclusiveInputPoint = unmap;
    if (authored) renderer.touchWantsImmediatePress = immediatePress;
    if (authored) {
      renderer.handleMouseDown = mouseDown;
      renderer.handleMouseUp = mouseUp;
    }
    if (wine.warcraftSession) {
      renderer.handleKeyDown = keyDown;
    }

    return {
      get nativeTouch() { return authored && chart?.mode === 'dialog'; },
      get outcomeOpen() { return authored && !!nativeOutcome(wine); },
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
        frame.removeEventListener('warcraft-hud-insets-change', repaint);
        if (raf) global.cancelAnimationFrame(raf);
        if (renderer._mapExclusiveInputPoint === map) renderer._mapExclusiveInputPoint = originalMap;
        if (renderer._unmapExclusiveInputPoint === unmap) renderer._unmapExclusiveInputPoint = originalUnmap;
        if (renderer.touchWantsImmediatePress === immediatePress) renderer.touchWantsImmediatePress = originalImmediate;
        if (renderer.handleMouseDown === mouseDown) renderer.handleMouseDown = originalDown;
        if (renderer.handleMouseUp === mouseUp) renderer.handleMouseUp = originalUp;
        if (renderer.handleKeyDown === keyDown) renderer.handleKeyDown = originalKeyDown;
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
