/* Original pre-game dialogs keep one affine transform across each native control group. */
(function (global) {
  'use strict';

  const DIALOG_PAINTER = 0x405400;
  const LOAD_GAME = 0x43c540;
  const CUSTOM_GAME_SETUP = 0x415640;
  const SELECT_SCENARIO = 0x41d490;
  const SOUND_OPTIONS = 0x441940;
  const AUTHORED_OR_CINEMATIC = new Set([0x42adc0, 0x441cc0, 0x434a00, 0x429580, 0x42fef0]);

  // Both native dialogs register a 640x480 root with a transparent upper
  // area. These crops include the complete lower native content, borders,
  // dependent labels, and room for the custom form's dropdown to expand.
  // The original nested scenario picker registers its own 352x352 root.
  const LOAD_CONTENT = {x: 128, y: 200, w: 392, h: 244};
  const CUSTOM_CONTENT = {x: 0, y: 200, w: 640, h: 280};

  function contains(outer, inner) {
    return [inner.x, inner.y, inner.w, inner.h].every(Number.isInteger) &&
      inner.w > 0 && inner.h > 0 &&
      inner.x >= outer.x && inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w &&
      inner.y + inner.h <= outer.y + outer.h;
  }

  // Exact visible type-7/12/13 controls from the original dialogs.
  // A native dropdown paints its choices while the pointer button is held.
  const HELD_CONTROLS = new Map([
    [LOAD_GAME, [[170, 232, 320, 148]]],
    [CUSTOM_GAME_SETUP, [[44, 274, 124, 22], [44, 324, 124, 22],
      [224, 274, 144, 22], [224, 324, 144, 22], [404, 274, 180, 22]]],
    [SELECT_SCENARIO, [[22, 136, 320, 112], [138, 36, 204, 22],
      [138, 84, 204, 22], [22, 110, 240, 22]]],
    [SOUND_OPTIONS, [[32, 40, 212, 18], [32, 88, 212, 18]]],
  ]);

  // Original Custom Game Setup children. Rectangles are absolute native
  // pixels in its registered 640x480 scene; coordinates include the visible
  // labels and exclude the frame's unused top artwork.
  const CUSTOM_FIELDS = [
    {id: 10, label: {x: 40, y: 256, w: 128, h: 18}, control: {x: 44, y: 274, w: 124, h: 22}},
    {id: 7, label: {x: 40, y: 306, w: 128, h: 18}, control: {x: 44, y: 324, w: 124, h: 22}},
    {id: 4, label: {x: 220, y: 256, w: 160, h: 18}, control: {x: 224, y: 274, w: 144, h: 22}},
    {id: 8, label: {x: 220, y: 306, w: 160, h: 18}, control: {x: 224, y: 324, w: 144, h: 22}},
    {id: 6, label: {x: 400, y: 256, w: 160, h: 18}, control: {x: 404, y: 274, w: 180, h: 22}},
  ];
  const CUSTOM_BUTTONS = [
    {id: 3, source: {x: 400, y: 368, w: 224, h: 28}},
    {id: 2, source: {x: 400, y: 404, w: 224, h: 28}},
    {id: 1, source: {x: 400, y: 440, w: 224, h: 28}},
  ];
  const CUSTOM_CONTROL_TYPES = new Set([2, 13]);
  const LOAD_CONTROL_TYPES = new Set([1, 2, 7, 10, 12]);
  const CUSTOM_HEADING = {x: 160, y: 220, w: 320, h: 20};
  const CUSTOM_SCENARIO_TEXT = {x: 8, y: 402, w: 380, h: 74};

  function guestView(wine, address, length) {
    const translate = wine?.instance?.exports?.guest_to_wasm;
    const memory = wine?.memory?.buffer;
    if (!translate || !memory || !address) return null;
    const start = translate(address) >>> 0;
    const end = translate(address + length - 1) >>> 0;
    if (start <= 0xf0 || end !== start + length - 1 || end >= memory.byteLength) return null;
    return new DataView(memory, start, length);
  }

  function readControls(wine, front, wantedTypes) {
    const root = guestView(wine, front.root, 0x4a);
    if (root?.getUint16(0x20, true) !== front.slot ||
        root.getUint32(0x2a, true) !== front.handler) return null;
    let node = root.getUint32(0x46, true);
    const seen = new Set(), controls = new Map();
    while (node) {
      const item = guestView(wine, node, 0x36);
      if (!item || seen.has(node) || seen.size === 24 ||
          item.getUint32(0x32, true) !== front.root) return null;
      seen.add(node);
      const type = item.getUint16(0x22, true);
      const flags = item.getUint32(0x18, true);
      const id = item.getInt16(0x20, true);
      if (wantedTypes.has(type) && (flags & 8)) {
        if (controls.has(id)) return null;
        const x = item.getInt16(4, true), y = item.getInt16(6, true);
        const w = item.getInt16(8, true) - x + 1, h = item.getInt16(10, true) - y + 1;
        const source = {x: x + front.x, y: y + front.y, w, h};
        if (!contains(front, source)) return null;
        controls.set(id, {type, flags, source});
      }
      node = item.getUint32(0, true);
    }
    return controls;
  }

  function same(a, b) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function reflowCustom(chart, controls, inset, backTarget) {
    if (controls.size !== CUSTOM_FIELDS.length + CUSTOM_BUTTONS.length) return null;
    const {width, height} = chart;
    const available = width - 2 * inset;
    const landscape = width >= height;
    const columns = landscape ? (available >= 600 ? 3 : 2) :
      (available >= 500 || height < 630 ? 2 : 1);
    const gap = Math.min(landscape ? 12 : 10, available / 6);
    const columnW = (available - (columns - 1) * gap) / columns;
    const formScale = Math.min(1.7, columnW / 184);
    const actions = backTarget ? CUSTOM_BUTTONS.slice(0, -1) : CUSTOM_BUTTONS;
    const buttonRows = landscape ? 1 : actions.length;
    const buttonColumns = landscape ? actions.length : 1;
    const actionAvailable = landscape && backTarget ? backTarget.x - inset - gap : available;
    const actionContentWidth = Math.min(actionAvailable, available * buttonColumns /
      (landscape ? CUSTOM_BUTTONS.length : 1));
    const buttonScale = Math.min(1.65, (actionContentWidth - (buttonColumns - 1) * gap) / (224 * buttonColumns));
    if (buttonScale <= 0) return null;
    const titleScale = Math.min(1.2, available / CUSTOM_HEADING.w);
    const inlineDetail = landscape && height < 315;
    const detailWidth = inlineDetail ? columnW : available;
    const detailScale = Math.min(1.15, detailWidth / CUSTOM_SCENARIO_TEXT.w);
    const detailHeight = CUSTOM_SCENARIO_TEXT.h * detailScale;
    let expanded = null;
    for (const field of CUSTOM_FIELDS) {
      const live = controls.get(field.id);
      if (live?.type !== 13) return null;
      if (!same(live.source, field.control)) {
        if (expanded || !contains(live.source, field.control) ||
            live.source.x !== field.control.x || live.source.w !== field.control.w) return null;
        expanded = {id: field.id, source: live.source};
      }
    }
    for (const button of CUSTOM_BUTTONS) {
      const live = controls.get(button.id);
      if (live?.type !== 2 || !same(live.source, button.source)) return null;
    }

    // In landscape keep the original left-to-right field order.
    const fields = landscape ? [CUSTOM_FIELDS[0], CUSTOM_FIELDS[2], CUSTOM_FIELDS[4],
      CUSTOM_FIELDS[1], CUSTOM_FIELDS[3]] : CUSTOM_FIELDS;
    const rows = Math.ceil(fields.length / columns);
    const rowHeight = 40 * formScale;
    const lastRowHeight = inlineDetail ? Math.max(rowHeight, detailHeight) : rowHeight;
    const total = 20 * titleScale + (rows - 1) * rowHeight + lastRowHeight +
      (inlineDetail ? 0 : detailHeight + gap) +
      buttonRows * 28 * buttonScale + (rows + buttonRows + 1) * gap;
    const formHeight = !landscape && backTarget ? backTarget.y - gap : height;
    const fit = Math.min(1, (formHeight - 2 * inset) / total);
    if (fit <= 0) return null;
    let top = (formHeight - total * fit) / 2;
    const paintRegions = [], regions = [];
    function crop(source, x, y, scale, interactive) {
      const target = {x, y, w: source.w * scale, h: source.h * scale};
      const region = {source, target, interactive, foreground: !interactive};
      if (interactive) regions.push(region);
      paintRegions.push(region);
      return region;
    }
    function center(source, scale, interactive) {
      const region = crop(source, (width - source.w * scale) / 2, top, scale, interactive);
      top += region.target.h + gap * fit;
    }
    center(CUSTOM_HEADING, titleScale * fit, false);
    const scale = formScale * fit;
    let popup = null;
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index];
      const col = index % columns;
      const left = inset + col * (columnW + gap) + (columnW - 184 * scale) / 2;
      crop(field.label, left, top, scale, false);
      const control = crop(field.control, left + 4 * scale, top + 18 * scale, scale, true);
      if (expanded?.id === field.id) {
        const {source} = expanded;
        const popupScale = Math.min(scale, (height - 2 * inset) / source.h);
        const y = control.target.y + (source.y - field.control.y) * popupScale;
        popup = {source, interactive: true, foreground: false, target: {
          x: control.target.x, y: Math.max(inset, Math.min(y, height - inset - source.h * popupScale)),
          w: source.w * popupScale, h: source.h * popupScale,
        }};
      }
      if (index === fields.length - 1) {
        if (inlineDetail) {
          const x = inset + (col + 1) * (columnW + gap);
          crop(CUSTOM_SCENARIO_TEXT, x, top, detailScale * fit, false);
        }
        top += (lastRowHeight + gap) * fit;
      } else if (col === columns - 1) top += (rowHeight + gap) * fit;
    }
    if (!inlineDetail) center(CUSTOM_SCENARIO_TEXT, detailScale * fit, false);
    const actionScale = buttonScale * fit;
    const actionGap = gap * fit;
    const actionW = 224 * actionScale;
    const actionWidth = buttonColumns * actionW + (buttonColumns - 1) * actionGap;
    const centeredAction = (width - actionWidth) / 2;
    const actionLeft = landscape && backTarget
      ? Math.max(inset, Math.min(centeredAction, backTarget.x - actionGap - actionWidth)) : centeredAction;
    for (let index = 0; index < actions.length; index++) {
      const col = index % buttonColumns;
      crop(actions[index].source, actionLeft + col * (actionW + actionGap), top,
        actionScale, true);
      if (col === buttonColumns - 1) top += 28 * actionScale + actionGap;
    }

    if (!popup) {
      if (backTarget) {
        const back = {source: CUSTOM_BUTTONS[2].source, target: backTarget, decoration: 'back'};
        regions.push(back);
        paintRegions.push(back);
      }
      return {...chart, reflow: true, regions, paintRegions};
    }
    // The original raster already contains the open menu over its old
    // neighbors. Drop overlapping source crops and paint the popup once.
    return {...chart, reflow: true, regions: [popup],
      paintRegions: [...paintRegions.filter(region => !overlaps(region.source, popup.source)), popup]};
  }

  function reflowLoad(chart, controls, inset) {
    const {width, height} = chart;
    const heading = {x: 136, y: 208, w: 368, h: 18};
    const list = {x: 170, y: 232, w: 320, h: 148};
    const buttons = [{x: 154, y: 408, w: 224, h: 28}, {x: 402, y: 408, w: 106, h: 28}];
    const expected = [[1, {x: 170, y: 232, w: 300, h: 148}], [-32767, {x: 470, y: 232, w: 20, h: 148}],
      [-2, buttons[0]], [-3, buttons[1]], [-1, heading]];
    if (controls.size !== expected.length ||
        expected.some(([id, source]) => !controls.has(id) || !same(controls.get(id).source, source))) return null;
    const available = width - 2 * inset;
    const listScale = Math.min(1.8, available / list.w);
    const textScale = Math.min(1.4, available / heading.w);
    const buttonScale = Math.min(1.65, available / buttons[0].w);
    const total = heading.h * textScale + list.h * listScale + 56 * buttonScale + 36;
    const fit = Math.min(1, (height - 2 * inset) / total);
    let y = (height - total * fit) / 2;
    function center(source, scale, interactive) {
      const w = source.w * scale * fit, h = source.h * scale * fit;
      const region = {source, target: {x: (width - w) / 2, y, w, h}, interactive, foreground: !interactive};
      y += h + 12 * fit;
      return region;
    }
    const title = center(heading, textScale, false);
    const regions = [center(list, listScale, true), ...buttons.map(source => center(source, buttonScale, true))];
    return {...chart, reflow: true, regions, paintRegions: [title, ...regions]};
  }

  function wantsImmediatePress(chart, nativeX, nativeY) {
    const point = {x: Math.floor(nativeX), y: Math.floor(nativeY), w: 1, h: 1};
    return chart?.mode === 'dialog' && chart.heldControls.some(rect => contains(rect, point));
  }

  function layout({width, height, art, scenes, wine, backTarget}) {
    if (![width, height].every(value => Number.isFinite(value) && value > 0) ||
        !art || !contains(art, art) || !Array.isArray(scenes)) return null;
    const dialogs = scenes.filter(scene => scene.painter === DIALOG_PAINTER);
    if (!dialogs.length || dialogs.some(scene => !Number.isInteger(scene.handler) ||
        scene.handler <= 0 || !Number.isInteger(scene.root) || scene.root <= 0 ||
        !Number.isInteger(scene.slot) || scene.slot < 2 || scene.slot > 5 ||
        !contains(art, scene))) return null;
    // BNE paints scene slots from high to low. A lower registered scene is
    // the frontmost native dialog; keep the paused underlying form inert.
    const front = dialogs.reduce((first, scene) => scene.slot < first.slot ? scene : first);
    if (AUTHORED_OR_CINEMATIC.has(front.handler)) return null;
    const {x, y, w, h} = front;
    let source = {x, y, w, h};
    const fullFrame = x === art.x && y === art.y && w === art.w && h === art.h;
    if (fullFrame) {
      if (front.handler === LOAD_GAME) source = LOAD_CONTENT;
      else if (front.handler === CUSTOM_GAME_SETUP) source = CUSTOM_CONTENT;
      else return null;
      if (!contains(art, source)) return null;
    }

    const inset = Math.min(12, width * 0.04, height * 0.04);
    const sharedScale = source.w === 256 && source.h <= 288
      ? global.WarcraftModalPresentationV15?.classicDialogScale(width, height) : undefined;
    const scale = sharedScale ?? Math.min(2, (width - inset * 2) / source.w, (height - inset * 2) / source.h);
    const targetW = source.w * scale;
    const targetH = source.h * scale;
    const heldControls = (HELD_CONTROLS.get(front.handler) || [])
      .map(([left, top, w, h]) => ({x: x + left, y: y + top, w, h}))
      .filter(rect => contains(source, rect));
    const chart = {
      width, height, mode: 'dialog', art, heldControls,
      dialog: {slot: front.slot, handler: front.handler, root: front.root},
      regions: [{source, target: {
        x: (width - targetW) / 2, y: (height - targetH) / 2,
        w: targetW, h: targetH,
      }}],
    };
    if (fullFrame && front.handler === CUSTOM_GAME_SETUP) {
      const controls = readControls(wine, front, CUSTOM_CONTROL_TYPES);
      if (controls) return reflowCustom(chart, controls, inset, backTarget) || chart;
    }
    if (fullFrame && width < height && front.handler === LOAD_GAME) {
      const controls = readControls(wine, front, LOAD_CONTROL_TYPES);
      if (controls) return reflowLoad(chart, controls, inset) || chart;
    }
    return chart;
  }

  const api = Object.freeze({layout, wantsImmediatePress});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyDialogLayout = api;
})(globalThis);
