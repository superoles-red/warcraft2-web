/* Original pre-game dialogs keep one affine transform across each native control group. */
(function (global) {
  'use strict';

  const DIALOG_PAINTER = 0x405400;
  const LOAD_GAME = 0x43c540;
  const CUSTOM_GAME_SETUP = 0x415640;
  const SELECT_SCENARIO = 0x41d490;
  const SOUND_OPTIONS = 0x441940;
  const AUTHORED_OR_CINEMATIC = new Set([0x42adc0, 0x441cc0, 0x434a00, 0x429580, 0x42fef0]);
  // Original rez\snd_dlg.bin and rez\filefltr.bin. These are local,
  // inclusive native footer controls decoded to half-open source rectangles.
  const NATIVE_FOOTERS = new Map([
    [SOUND_OPTIONS, {w:256, h:288, cancel:[12,256], accept:[138,256], body:256,
      compactBody:[[0,120],[140,174]], checkbox:[12,144,240,22],
      blank:[0,208,256,48], compactBlank:[0,174,256,48], footer:64}],
  ]);
  const SCENARIO_FILTERS = [
    {id:2, label:[8,38,120,20], control:[138,36,204,22]},
    {id:3, label:[8,86,120,20], control:[138,84,204,22]},
    {id:16, control:[22,110,240,22]},
  ];
  const SCENARIO_TYPES = new Set([1,2,7,9,10,11,12,13]);

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

  function menuButtonHeight(width,height) {
    const portrait=width<height;
    return Math.min(88,portrait?width*.23:Infinity,height*(portrait?.107:.15));
  }

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
        controls.set(id, {type, flags, source, address:node});
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

  // Live BNE button rasters use these two original palette ramps. The second
  // row is the DirectDraw 16-bit quantization of the first during a match.
  const BUTTON_INK = new Set([
    0xf7e323,0xd3c31f,0xab8f13,0x5f3300,0xfffbf3,0x9f9f9f,0x6f6f6f,
    0xf4e020,0xd0c01c,0xa88c10,0x5c3000,0xfcf8f0,0x9c9c9c,0x6c6c6c,
  ]);
  // Credits and briefing use neutral grayscale UI art; stone there never
  // exceeds gray 135. Keep the original light grayscale lettering ramp.
  const PAPER_BUTTON_INK = new Set([0xffffff,0xdbdbdb,0xbbbbbb,0x9b9b9b]);
  let inkCanvas;
  function paintTallButton(context,image,source,target,blank,captionScale,paper=false) {
    const {x:sx,y:sy,w:sw,h:sh}=source, {x,y,w,h}=target;
    const scale = Math.min(w/sw,h/sh);
    const rim = Math.min(4,sh/4), edge = rim*scale;
    const body = blank?.width === sw && blank.height === sh ? blank : null;
    if (!inkCanvas) {
      inkCanvas = global.document.createElement('canvas');
    }
    if(inkCanvas.width<sw)inkCanvas.width=sw;
    if(inkCanvas.height<sh)inkCanvas.height=sh;
    const scratch = inkCanvas.getContext('2d',{willReadFrequently:true});
    scratch.clearRect(0,0,sw,sh);
    scratch.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
    const pixels = scratch.getImageData(0,0,sw,sh), {data}=pixels;
    const asRgb = i => data[i*4]<<16|data[i*4+1]<<8|data[i*4+2];
    const text = new Uint8Array(sw*sh);
    // The outer frame may also contain yellow/gray pixels. Only the inward
    // caption box uses this masking; preserve the live edges separately.
    for (let row=4;row<sh-4;row++) for(let col=6;col<sw-6;col++) {
      const i=row*sw+col,rgb=asRgb(i);
      text[i]=(paper?PAPER_BUTTON_INK:BUTTON_INK).has(rgb)?1:0;
    }
    for (let row=1;row<sh;row++) for(let col=1;col<sw;col++) {
      const i=row*sw+col;
      if (!text[i] && asRgb(i)===0 && (text[i-sw-1]===1||text[i-sw]===1||text[i-1]===1)) text[i]=2;
    }
    // Keep every actual frame pixel, including current focused/default outline.
    context.drawImage(image,sx,sy,sw,rim,x,y,w,edge);
    context.drawImage(image,sx,sy+sh-rim,sw,rim,x,y+h-edge,w,edge);
    context.drawImage(image,sx,sy+rim,rim,sh-rim*2,x,y+edge,edge,h-edge*2);
    context.drawImage(image,sx+sw-rim,sy+rim,rim,sh-rim*2,x+w-edge,y+edge,edge,h-edge*2);
    if (body) context.drawImage(body,rim,rim,sw-rim*2,sh-rim*2,x+edge,y+edge,w-edge*2,h-edge*2);
    else {
      // A blank region to the right of the drawn caption preserves the
      // selected guest's current texture when no exact art was supplied.
      context.drawImage(image,sx+sw-15,sy+rim,11,sh-rim*2,x+edge,y+edge,w-edge*2,h-edge*2);
    }
    for (let i=0;i<text.length;i++) if(!text[i])data[i*4+3]=0;
    scratch.putImageData(pixels,0,0);
    const captionFit=Math.min(scale,captionScale ?? scale);
    const captionWidth=sw*captionFit,captionHeight=sh*captionFit;
    context.drawImage(inkCanvas,0,0,sw,sh,x+(w-captionWidth)/2,y+(h-captionHeight)/2,captionWidth,captionHeight);
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
    const desiredButtonH=menuButtonHeight(width,height);
    const bodyHeight = 20 * titleScale + (rows - 1) * rowHeight + lastRowHeight +
      (inlineDetail ? 0 : detailHeight + gap) +
      (rows + buttonRows + 1) * gap;
    const formHeight = !landscape && backTarget ? backTarget.y+backTarget.h-desiredButtonH-gap : height;
    const fit = Math.min(1,(formHeight-2*inset-buttonRows*desiredButtonH)/bodyHeight);
    if (fit <= 0) return null;
    let top = (formHeight-bodyHeight*fit-buttonRows*desiredButtonH)/2;
    const paintRegions = [], regions = [];
    function crop(source, x, y, scale, interactive, decoration) {
      const target = {x, y, w: source.w * scale, h: decoration==='tall-button'?desiredButtonH:source.h*scale};
      const region = {source, target, interactive, foreground: !interactive, decoration};
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
        actionScale, true, 'tall-button');
      if (col === buttonColumns - 1) top += desiredButtonH + actionGap;
    }

    if (!popup) {
      if (backTarget) {
        const size = desiredButtonH;
        const back = {source: CUSTOM_BUTTONS[2].source, target: {x:backTarget.x+backTarget.w-size,
          y:backTarget.y+backTarget.h-size,w:size,h:size}, decoration:'back'};
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
    const combined = width >= height;
    const total = heading.h * textScale + list.h * listScale + (combined?56:112) * buttonScale + (combined?24:36);
    const fit = Math.min(1, (height - 2 * inset) / total);
    let y = (height - total * fit) / 2;
    function center(source, scale, interactive) {
      const w = source.w * scale * fit, h = source.h * scale * fit;
      const region = {source, target: {x: (width - w) / 2, y, w, h}, interactive, foreground: !interactive};
      y += h + 12 * fit;
      return region;
    }
    const title = center(heading, textScale, false);
    const regions = [center(list, listScale, true)];
    const scale = buttonScale*fit, buttonH=56*scale, gap=12*fit;
    const actionWidths = buttons.map(source=>source.w*scale);
    let x = (width-actionWidths[0]-actionWidths[1]-gap)/2;
    for(let i=0;i<buttons.length;i++) {
      const w=actionWidths[i];
      regions.push({source:buttons[i],target:{x:combined?x:(width-w)/2,y,w,h:buttonH},decoration:'tall-button'});
      if(combined)x+=w+gap;
      else y+=buttonH+gap;
    }
    return {...chart, reflow: true, regions, paintRegions: [title, ...regions]};
  }

  function reflowNativeFooter(chart, front, controls, spec, inset) {
    if (front.w !== spec.w || front.h !== spec.h) return null;
    const {x, y, w, h} = front;
    const area = (left, top, width, height) => ({x:x + left, y:y + top, w:width, h:height});
    const cancel = area(...spec.cancel,106,28), accept = area(...spec.accept,106,28);
    const liveCancel = controls.get(-3), liveAccept = [...controls.values()].find(item => same(item.source, accept));
    if (liveCancel?.type !== 2 || !(liveCancel.flags & 8) || !same(liveCancel.source, cancel) ||
        !liveAccept || ![1, 2].includes(liveAccept.type)) return null;

    const speech = spec.checkbox && controls.get(4);
    const compact = speech?.type === 4 && same(speech.source, area(...spec.checkbox)) &&
      [...controls.values()].filter(item => item.type === 4).length === 1;
    const bands = compact ? spec.compactBody : [[0,spec.body]];
    const bodyHeight = bands.reduce((height,[start,end]) => height + end - start, 0);
    const buttonSize=menuButtonHeight(chart.width,chart.height);
    const scale = Math.min(chart.regions[0].target.w / w,(chart.height-inset*2)/(bodyHeight+spec.footer+4),
      (chart.height-inset*2-buttonSize)/(bodyHeight+12));
    const footerH = Math.max(spec.footer,buttonSize/scale+8);
    const height = bodyHeight + footerH + 4;
    if (scale <= 0) return null;
    const left = (chart.width - w * scale) / 2, top = (chart.height - height * scale) / 2;
    const target = (x, y, w, h) => ({x:left + x * scale, y:top + y * scale, w:w * scale, h:h * scale});
    let yRow = 0;
    const body = bands.map(([start,end]) => {
      const height = end - start;
      const row = {source:area(0,start,w,height), target:target(0,yRow,w,height)};
      yRow += height;
      return row;
    });
    const footer = {source:area(...(compact ? spec.compactBlank : spec.blank)),
      target:target(0,bodyHeight,w,footerH), texture:spec.texture};
    const rim = {source:area(0,h-4,w,4), target:target(0,height-4,w,4)};
    const size = buttonSize/scale;
    const button = {source:accept, target:target(16,bodyHeight + (footerH-size)/2,106,size),decoration:'tall-button'};
    const back = {source:cancel, target:target(w-size-12,bodyHeight + (footerH-size)/2,size,size), decoration:'back'};
    return {...chart, reflow:true, regions:[...body, button, back], paintRegions:[...body, footer, rim, button, back],
      ...(front.handler === SOUND_OPTIONS ? {frame:{source:area(0,0,w,h),target:target(0,0,w,height)}} : {})};
  }

  function reflowScenario(chart, front, controls, inset, wine) {
    if (front.w !== 352 || front.h !== 352) return null;
    const area = (x, y, w, h) => ({x:front.x+x, y:front.y+y, w, h});
    const list = area(22,136,300,112), track = area(322,136,20,112);
    const ok = area(188,318,106,28), cancel = area(44,318,106,28);
    const nativeBar = controls.get(-32767);
    for (const [id, type, source] of [[1,12,list], [-32767,7,track], [13,1,ok], [-3,2,cancel]]) {
      const item = controls.get(id);
      if (item?.type !== type || !same(item.source, source)) return null;
    }
    const {width,height} = chart;
    const landscape = width >= height && width >= 510;
    const available = width - 2 * inset;
    const labelWidth = landscape ? Math.min(290, available * .39) : available;
    const gap = landscape ? Math.min(24,available*.04) : 0;
    const listWidth = landscape ? available - labelWidth - gap : available;
    const scale = Math.min(1.65,labelWidth/334,listWidth/330,
      (height-2*inset)/(landscape?247:367));
    if (scale <= 0) return null;
    const regions = [], paintRegions = [];
    function add(source, target, decoration, interactive = false) {
      const region = {source, target, decoration};
      paintRegions.push(region);
      if (interactive) regions.push(region);
      return region;
    }
    const fitted = (source,x,y) => ({x,y,w:source.w*scale,h:source.h*scale});
    const center = (source,y) => fitted(source,(width-source.w*scale)/2,y);
    const title = area(6,8,340,16);
    const buttonSize = menuButtonHeight(width,height);
    const footerY = height-inset-buttonSize;
    const filterTop = inset + (landscape?35:Math.min(70,(height-320*scale)*.22));
    const listX = landscape ? inset+labelWidth+gap : inset;
    const listTop = landscape ? filterTop : filterTop+110*scale;
    const footerGap = (footerY-listTop)-64*scale;
    const listHeight = Math.max(112*scale,footerGap);
    const barWidth = Math.min(listWidth*.18,Math.max(23,Math.min(44,28*scale)));
    const listBox = {x:listX,y:listTop,w:listWidth-barWidth-3,h:listHeight};
    const scrollTarget = {x:listBox.x+listBox.w+3,y:listBox.y,w:barWidth,h:listBox.h};
    const result = area(8,254,334,60);
    const resultY = landscape ? listTop+listHeight+4*scale :
      Math.min(footerY-64*scale,listTop+listHeight+10*scale);

    add(title,center(title,inset+4*scale),'scenario-caption');
    let popup = null;
    for (const [index,field] of SCENARIO_FILTERS.entries()) {
      const source = area(...field.control);
      const item = controls.get(field.id);
      const drawY = filterTop+index*34*scale;
      const drawX = inset+(field.label?128*scale:0);
      if (item?.type !== 13) return null;
      if ((item.flags & 0x2000) !== 0) {
        if (popup || !contains(item.source,source) || item.source.x !== source.x || item.source.w !== source.w) return null;
        popup = {...item, target:fitted(item.source,drawX,Math.max(inset,Math.min(height-inset-item.source.h*scale,
          drawY+(item.source.y-source.y)*scale)))};
      } else if (!same(item.source, source)) return null;
      if (field.label) {
        const label = area(...field.label);
        add(label,fitted(label,inset,drawY+2*scale),'scenario-caption');
      }
      add(source,fitted(source,drawX,drawY),undefined,true);
    }
    add(list,listBox,'scenario-list',true);
    add(result,{...fitted(result,landscape?listX:inset,resultY),w:Math.min(listWidth,result.w*scale)},'scenario-caption');
    add(ok,{...fitted(ok,inset,footerY),h:buttonSize},'tall-button',true);
    add(cancel,{x:width-inset-buttonSize,y:height-inset-buttonSize,w:buttonSize,h:buttonSize},'back',true);
    const frame = {source:area(0,0,352,352),target:{x:0,y:0,w:width,h:height},scale};
    const bar = guestView(wine,nativeBar.address,0x4a);
    const value = bar?.getUint16(0x3a,true), max = bar?.getUint16(0x46,true);
    if (value === undefined || max === undefined || value > max) return null;
    const scrollbar = {source:track,target:scrollTarget,value,max,nativeFirst:track.y+28,nativeLast:track.y+81,scale};
    add(track,scrollTarget,'scenario-scroll');
    // Last: open native dropdowns occlude any controls underneath them.
    if (popup) {
      const {source,target} = popup;
      const expanded = {source,target,decoration:'scenario-popup'};
      const body = paintRegions.map(region => overlaps(region.source,source) ? {...region,previous:true} : region);
      return {...chart,reflow:true,scenarioFrame:frame,scenarioPopup:true,scrollbar,
        regions:[expanded],paintRegions:[...body,expanded]};
    }
    return {...chart,reflow:true,scenarioFrame:frame,scrollbar,regions,paintRegions};
  }

  function wantsImmediatePress(chart, nativeX, nativeY) {
    const point = {x: Math.floor(nativeX), y: Math.floor(nativeY), w: 1, h: 1};
    return chart?.mode === 'dialog' && chart.heldControls.some(rect => contains(rect, point));
  }

  function layout({width, height, art, scenes, wine, backTarget, backImage}) {
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
      const reflow = controls && reflowCustom(chart, controls, inset, backTarget);
      return reflow || (width < height && backTarget ? null : chart);
    }
    if (fullFrame && front.handler === LOAD_GAME) {
      const controls = readControls(wine, front, LOAD_CONTROL_TYPES);
      if (controls) return reflowLoad(chart, controls, inset) || chart;
    }
    if (front.handler === SELECT_SCENARIO && backImage?.naturalWidth) {
      const controls = readControls(wine,front,SCENARIO_TYPES);
      return controls && reflowScenario(chart,front,controls,inset,wine);
    }
    const footer = NATIVE_FOOTERS.get(front.handler);
    if (footer && backImage?.naturalWidth) {
      const buttons = readControls(wine, front, new Set(front.handler === SOUND_OPTIONS ? [1,2,4,13] : [1,2,13]));
      if (buttons) return reflowNativeFooter(chart, front, buttons, footer, inset) || chart;
    }
    return chart;
  }

  const isAdaptedHandler = handler => HELD_CONTROLS.has(handler);
  const api = Object.freeze({layout, wantsImmediatePress, isAdaptedHandler, paintTallButton, menuButtonHeight});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyDialogLayout = api;
})(globalThis);
