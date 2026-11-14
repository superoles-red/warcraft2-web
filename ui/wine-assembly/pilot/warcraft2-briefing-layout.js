/* Recompose the original mission briefing while the guest owns text, scroll and input. */
(function (global) {
  'use strict';

  const BRIEFING_HANDLER = 0x42fef0;
  const DIALOG_PAINTER = 0x405400;
  const CONTINUE = {x: 456, y: 448, w: 106, h: 28};
  const OBJECTIVES = {x: 372, y: 306, w: 252, h: 132};
  // Both original briefing images have a shaded panel on the right. Keep it
  // in the complete illustration and sample only the left side for the cover.
  const BACKDROP = {x: 0, y: 0, w: 352, h: 480};
  const states = new WeakMap();

  const area = (x, y, w, h) => ({x, y, w, h});

  function guestView(wine, address, bytes) {
    const convert = wine?.instance?.exports?.guest_to_wasm;
    const memory = wine?.memory?.buffer;
    if (!convert || !memory || !Number.isInteger(address) || address < 0x10000 ||
        address + bytes > 0x100000000) return null;
    const start = convert(address) >>> 0;
    const end = convert(address + bytes - 1) >>> 0;
    if (start <= 0xf0 || end >= memory.byteLength || end !== start + bytes - 1) return null;
    return new DataView(memory, start, bytes);
  }

  function nativeRegions(wine, scene) {
    const root = guestView(wine, scene.root, 0x4a);
    if (!root || root.getUint32(0x2a, true) !== BRIEFING_HANDLER ||
        root.getUint16(0x20, true) !== scene.slot) return null;
    const byId = new Map();
    const visited = new Set();
    let address = root.getUint32(0x46, true);
    while (address && visited.size < 12) {
      const child = guestView(wine, address, 0x36);
      if (!child || visited.has(address) || child.getUint32(0x32, true) !== scene.root) return null;
      visited.add(address);
      const id = child.getInt16(0x20, true);
      const x = child.getInt16(4, true), y = child.getInt16(6, true);
      const w = child.getInt16(8, true) - x + 1, h = child.getInt16(10, true) - y + 1;
      if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 640 || y + h > 480) return null;
      if (child.getUint32(0x18, true) & 8) byId.set(id, {...area(x, y, w, h), kind: child.getUint16(0x22, true)});
      address = child.getUint32(0, true);
    }
    const heading = byId.get(-5), narrative = byId.get(1), button = byId.get(-2);
    const objectiveTitle = byId.get(-1), objectiveBody = byId.get(-4);
    if (address || heading?.kind !== 10 || narrative?.kind !== 9 || button?.kind !== 1 ||
        objectiveTitle?.kind !== 9 || objectiveBody?.kind !== 9 ||
        !['x', 'y', 'w', 'h'].every(key => button[key] === CONTINUE[key]) ||
        ![72, 264].includes(narrative.x) || narrative.y !== 80 || narrative.w !== 320 || narrative.h > 200 ||
        heading.y !== 28 || heading.h !== 20 ||
        objectiveTitle.x !== 372 || objectiveTitle.y !== 306 || objectiveTitle.w !== 252 ||
        objectiveBody.x !== 372 || objectiveBody.y !== 330 || objectiveBody.w !== 252 ||
        objectiveBody.y + objectiveBody.h > 438) return null;
    return {heading, narrative, objectives: OBJECTIVES, continue: CONTINUE};
  }

  function layout({wine, width, height, art, scenes}) {
    if (![width, height].every(value => Number.isFinite(value) && value > 0) ||
        width < 220 || height < 260 || art?.x !== 0 || art.y !== 0 || art.w !== 640 || art.h !== 480 ||
        !Array.isArray(scenes)) return null;
    const dialogs = scenes.filter(scene => scene.painter === DIALOG_PAINTER);
    const scene = dialogs[0];
    if (dialogs.length !== 1 || scene.handler !== BRIEFING_HANDLER || scene.x !== 0 ||
        scene.y !== 0 || scene.w !== art.w || scene.h !== art.h) return null;
    const source = nativeRegions(wine, scene);
    if (!source) return null;

    const inset = Math.min(18, width * 0.045, height * 0.05);
    const gap = Math.min(14, height * 0.022);
    const availableW = width - inset * 2;
    const availableH = height - inset * 2;
    const artRatio = art.h / art.w;
    const split = width >= height * 1.2;
    const buttonH = Math.min(48, availableH * 0.15);
    const textUnits = source.heading.h + source.narrative.h + source.objectives.h;
    const columnW = split ? Math.min(490, (availableW - gap) * 0.45) : availableW;
    const artLimitH = split ? 0 : Math.min(availableW * artRatio, availableH * 0.37);
    const textScale = Math.min(1.55, columnW / source.narrative.w,
      (availableH - artLimitH - buttonH - gap * (split ? 3 : 4)) / textUnits);

    const panelH = textUnits * textScale + buttonH + gap * 3;
    const imageLimitW = split ? availableW - columnW - gap : availableW;
    const imageW = Math.min(imageLimitW, (split ? availableH : artLimitH) / artRatio, 900);
    const imageH = imageW * artRatio;
    const panelX = split ? (width - imageW - gap - columnW) / 2 + imageW + gap : inset;
    let y = split ? (height - panelH) / 2 : (height - panelH - imageH - gap) / 2;
    const centered = (w, h) => area(panelX + (columnW - w) / 2, y, w, h);

    const targets = {};
    targets.heading = centered(columnW, source.heading.h * textScale);
    y += targets.heading.h + gap;
    const artwork = split ? area(panelX - gap - imageW, (height - imageH) / 2, imageW, imageH) :
      centered(imageW, imageH);
    if (!split) y += artwork.h + gap;
    targets.narrative = centered(source.narrative.w * textScale, source.narrative.h * textScale);
    y += targets.narrative.h + gap;
    targets.objectives = centered(source.objectives.w * textScale, source.objectives.h * textScale);
    y += targets.objectives.h + gap;
    targets.continue = centered(buttonH * CONTINUE.w / CONTINUE.h, buttonH);

    return {width, height, mode: 'briefing', art, artwork, textScale, source, targets,
      dialog: {slot: scene.slot, handler: scene.handler, root: scene.root},
      regions: [{source: source.continue, target: targets.continue}]};
  }

  function draw(context, image, source, target) {
    context.drawImage(image, source.x, source.y, source.w, source.h,
      target.x, target.y, target.w, target.h);
  }

  function makeCanvas(width, height, read = false) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext('2d', {willReadFrequently: read});
  }

  function cleanArtwork(wine, image, chart, state) {
    // The briefing handler decodes its selected original PCX into root + 0x0c.
    // The IMAGE begins with uint16 width/height followed by its pixel pointer.
    const descriptor = guestView(wine, chart.dialog.root + 0x0c, 8);
    if (descriptor?.getUint16(0, true) !== 640 || descriptor.getUint16(2, true) !== 480) return null;
    const address = descriptor.getUint32(4, true);
    const indices = guestView(wine, address, 640 * 480);
    if (!indices) return null;
    const palette = global.WarcraftUiBridge?.cursorPlane()?.palette;
    const alternate = guestView(wine, 0x4ae894, 1024);
    const sampleX = 32, sampleY = 360;
    const sample = state.scratch.getContext('2d');
    sample.clearRect(0, 0, 16, 1);
    sample.drawImage(image, sampleX, sampleY, 16, 1, 0, 0, 16, 1);
    const actual = sample.getImageData(0, 0, 16, 1).data;
    const matches = colors => colors && colors.length === 1024 &&
      Array.from({length: 16}, (_, i) => indices.getUint8(sampleY * 640 + sampleX + i) * 4)
        .every((offset, i) => [0, 1, 2].every(channel => colors[offset + channel] === actual[i * 4 + channel]));
    let colors = palette;
    if (!matches(colors) && alternate) colors = new Uint8Array(alternate.buffer, alternate.byteOffset, alternate.byteLength);
    if (!matches(colors)) return null;
    const cached = state.background;
    if (cached?.address === address && cached.root === chart.dialog.root &&
        colors.every((color, i) => color === cached.colors[i])) return cached;
    const background = makeCanvas(640, 480);
    const picture = background.createImageData(640, 480);
    for (let i = 0; i < 640 * 480; i++) {
      const index = indices.getUint8(i) * 4;
      const at = i * 4;
      picture.data[at] = colors[index];
      picture.data[at + 1] = colors[index + 1];
      picture.data[at + 2] = colors[index + 2];
      picture.data[at + 3] = 255;
    }
    background.putImageData(picture, 0, 0);
    return state.background = {address, root: chart.dialog.root, colors: new Uint8Array(colors),
      canvas: background.canvas, rgba: picture.data};
  }

  function paintText(context, image, scratch, background, source, target, headingScale) {
    const size = area(0, 0, source.w, source.h);
    draw(scratch, image, source, size);
    const bitmap = scratch.getImageData(0, 0, source.w, source.h);
    let minX = source.w, maxX = -1;
    for (let y = 0; y < source.h; y++) {
      for (let x = 0; x < source.w; x++) {
        const i = (y * source.w + x) * 4;
        const b = ((source.y + y) * 640 + source.x + x) * 4;
        if (bitmap.data[i] === background.rgba[b] && bitmap.data[i + 1] === background.rgba[b + 1] &&
            bitmap.data[i + 2] === background.rgba[b + 2]) bitmap.data[i + 3] = 0;
        else if (headingScale) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }
    scratch.putImageData(bitmap, 0, 0);
    if (!headingScale) {
      draw(context, scratch.canvas, size, target);
    } else if (maxX >= minX) {
      const inkW = maxX - minX + 1;
      const scale = Math.min(headingScale, target.w / inkW);
      draw(context, scratch.canvas, area(minX, 0, inkW, source.h),
        area(target.x + (target.w - inkW * scale) / 2, target.y + (target.h - source.h * scale) / 2,
          inkW * scale, source.h * scale));
    }
  }

  function paint({wine, context, image, chart}) {
    let state = states.get(wine);
    if (!state) {
      state = {scratch: makeCanvas(480, 200, true).canvas};
      states.set(wine, state);
    }
    const background = cleanArtwork(wine, image, chart, state);
    if (!background) return false;
    const {width, height, art, artwork, textScale, source, targets} = chart;
    const cover = Math.max(width / BACKDROP.w, height / BACKDROP.h);
    const coverW = BACKDROP.w * cover, coverH = BACKDROP.h * cover;
    draw(context, background.canvas, BACKDROP,
      area((width - coverW) / 2, (height - coverH) / 2, coverW, coverH));
    context.fillStyle = 'rgba(0,0,0,.8)';
    context.fillRect(0, 0, width, height);
    draw(context, background.canvas, art, artwork);
    const scratch = state.scratch.getContext('2d');
    paintText(context, image, scratch, background, source.heading, targets.heading, textScale);
    paintText(context, image, scratch, background, source.narrative, targets.narrative);
    paintText(context, image, scratch, background, source.objectives, targets.objectives);
    draw(context, image, source.continue, targets.continue);
    return true;
  }

  const api = Object.freeze({layout, paint});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyBriefingLayout = api;
})(globalThis);
