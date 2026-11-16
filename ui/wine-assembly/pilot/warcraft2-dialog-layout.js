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
    [SOUND_OPTIONS, {w:256, h:288, cancel:[12,256], accept:[138,256]}],
  ]);
  const SCENARIO_FILTERS = [
    {id:2, label:[8,38,120,20], control:[138,36,204,22]},
    {id:3, label:[8,86,120,20], control:[138,84,204,22]},
    // The original picker hides the folder control for built-in scenarios.
    {id:16, control:[22,110,240,22], optional:true},
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
  const CUSTOM_POPUP_ROW = 18;
  const CUSTOM_POPUP_EDGE = 2;

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

  const nativeText = new TextDecoder('windows-1251');
  function customCaption(wine, address) {
    const value=guestView(wine,address,64);
    if(!value)return '';
    const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength),end=bytes.indexOf(0);
    return end>0&&!bytes.subarray(0,end).some(byte=>byte<32) ? nativeText.decode(bytes.slice(0,end)) : '';
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
        const caption=front.handler===CUSTOM_GAME_SETUP&&type===13
          ? customCaption(wine,item.getUint32(0x14,true)) : '';
        controls.set(id, {type, flags, source, address:node, caption});
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
  const UNFOCUSED_BUTTON_INK = new Map([
    [0xfffbf3,0xf7e323],[0x9f9f9f,0xd3c31f],[0x6f6f6f,0xab8f13],
    [0xfcf8f0,0xf4e020],[0x9c9c9c,0xd0c01c],[0x6c6c6c,0xa88c10],
  ]);
  // Credits and briefing use neutral grayscale UI art; stone there never
  // exceeds gray 135. Keep the original light grayscale lettering ramp.
  const PAPER_BUTTON_INK = new Set([0xffffff,0xdbdbdb,0xbbbbbb,0x9b9b9b]);
  const stockArt = new Map();
  function artwork(name) {
    if (!stockArt.has(name)) {
      const image = new global.Image();
      image.src = `./menu-art/${name}.png`;
      stockArt.set(name,image);
    }
    return stockArt.get(name);
  }
  function acceptArtwork(faction, width) {
    return artwork(width > 106 ? 'title-accept-button' : faction + '-accept-button');
  }
  let inkCanvas;
  function paintTallButton(context,image,source,target,blank,captionScale,paper=false,useNativeFrame=true,preserveFocus=false,
    useUnfocusedInk=false) {
    const {x:sx,y:sy,w:sw,h:sh}=source, {x,y,w,h}=target;
    const scale = Math.min(w/sw,h/sh);
    const rim = Math.min(4,sh/4), edge = rim*scale;
    const body = blank?.naturalWidth && blank.naturalHeight === sh ? blank : null;
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
    const focus=asRgb(sw>>1);
    const focused=focus===0xffff00||focus===0xfcfc00;
    const text = new Uint8Array(sw*sh);
    // The outer frame may also contain yellow/gray pixels. Only the inward
    // caption box uses this masking; preserve the live edges separately.
    for (let row=4;row<sh-4;row++) for(let col=6;col<sw-6;col++) {
      const i=row*sw+col,rgb=asRgb(i);
      text[i]=(paper?PAPER_BUTTON_INK:BUTTON_INK).has(rgb)?1:0;
      const ink = useUnfocusedInk && UNFOCUSED_BUTTON_INK.get(rgb);
      if (ink) {
        data[i*4]=ink>>16;
        data[i*4+1]=(ink>>8)&255;
        data[i*4+2]=ink&255;
      }
    }
    for (let row=1;row<sh;row++) for(let col=1;col<sw;col++) {
      const i=row*sw+col;
      if (!text[i] && asRgb(i)===0 && (text[i-sw-1]===1||text[i-sw]===1||text[i-1]===1)) text[i]=2;
    }
    // The authored title uses the blank original frame and its own focus.
    // Native dialogs retain the current rim, including any native highlight.
    const frame=!useNativeFrame&&body?body:image;
    const fx=frame===image?sx:0, fy=frame===image?sy:0;
    const fw=frame===image?sw:frame.naturalWidth;
    context.drawImage(frame,fx,fy,fw,rim,x,y,w,edge);
    context.drawImage(frame,fx,fy+sh-rim,fw,rim,x,y+h-edge,w,edge);
    context.drawImage(frame,fx,fy+rim,rim,sh-rim*2,x,y+edge,edge,h-edge*2);
    context.drawImage(frame,fx+fw-rim,fy+rim,rim,sh-rim*2,x+w-edge,y+edge,edge,h-edge*2);
    if (body) context.drawImage(body,rim,rim,body.naturalWidth-rim*2,sh-rim*2,x+edge,y+edge,w-edge*2,h-edge*2);
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
    if(preserveFocus&&frame!==image&&focused) {
      const size=Math.max(1,Math.round(scale));
      context.fillStyle='#ffff00';
      context.fillRect(x,y,w,size);
      context.fillRect(x,y+h-size,w,size);
      context.fillRect(x,y,size,h);
      context.fillRect(x+w-size,y,size,h);
    }
  }

  function controlPixels(image,{x,y,w,h}) {
    if(!inkCanvas)inkCanvas=global.document.createElement('canvas');
    if(inkCanvas.width<w)inkCanvas.width=w;
    if(inkCanvas.height<h)inkCanvas.height=h;
    const scratch=inkCanvas.getContext('2d',{willReadFrequently:true});
    scratch.clearRect(0,0,w,h);
    scratch.drawImage(image,x,y,w,h,0,0,w,h);
    return {scratch,pixels:scratch.getImageData(0,0,w,h)};
  }

  function paintControlInk(context,image,source,target,exact=false) {
    const {scratch,pixels}=controlPixels(image,source),{data,width:w,height:h}=pixels;
    const ink=new Uint8Array(w*h);
    for(let i=0;i<ink.length;i++){
      const p=i*4,r=data[p],g=data[p+1],b=data[p+2];
      const rgb=r<<16|g<<8|b;
      if(exact ? BUTTON_INK.has(rgb)&&r>=156 : (r>=168&&g>=136&&b<=41)||(r>=215&&g>=215&&b>=215))ink[i]=1;
    }
    for(let i=0;i<ink.length;i++){
      const p=i*4,rgb=data[p]<<16|data[p+1]<<8|data[p+2];
      if(!ink[i]&&!(i>=w+1&&i%w&&ink[i-w-1]&&(data[p]<40||exact&&BUTTON_INK.has(rgb))))data[p+3]=0;
    }
    scratch.putImageData(pixels,0,0);
    context.drawImage(inkCanvas,0,0,w,h,target.x,target.y,target.w,target.h);
  }

  function paintDropdown(context,image,source,target,background,scale=target.w/source.w,caption) {
    const {x:sx,y:sy,w:sw,h:sh}=source,{x,y,w,h}=target;
    const lineH=Math.min(h,sh*scale), middle=y+(h-lineH)/2;
    if(!background?.naturalWidth){context.drawImage(image,sx,sy,sw,sh,x,middle,w,lineH);return;}
    context.drawImage(background,x,y,w,h);
    const arrow=artwork('orc-dropdown');
    const arrowW=19, arrowH=20, pad=5;
    const labelWidth=Math.min(sw-arrowW-pad-4,Math.floor(w/scale-arrowW-pad-4));
    if(caption?.width){
      const fit=Math.min(scale,(w-(arrowW+2*pad+4)*scale)/caption.width);
      context.drawImage(caption,x+pad*scale,y+(h-caption.height*fit)/2,caption.width*fit,caption.height*fit);
    }else{
      paintControlInk(context,image,{x:sx+pad,y:sy+2,w:labelWidth,h:sh-4},
        {x:x+pad*scale,y:middle+2*scale,w:labelWidth*scale,h:lineH-4*scale});
    }
    const arrowX=x+w-(arrowW+4)*scale,arrowY=y+(h-arrowH*scale)/2;
    if(arrow.naturalWidth)context.drawImage(arrow,arrowX,arrowY,arrowW*scale,arrowH*scale);
  }

  function paintCustomPopup(context, image, {source:s, target:t, rowCount}, background) {
    if (!background?.naturalWidth) {
      context.drawImage(image, s.x, s.y, s.w, s.h, t.x, t.y, t.w, t.h);
      return;
    }
    const edge = CUSTOM_POPUP_EDGE;
    const scaleX = t.w / s.w, scaleY = t.h / s.h;
    const rim = edge * scaleX;
    const rowH = CUSTOM_POPUP_ROW * scaleY;
    const inkH = CUSTOM_POPUP_ROW - 1;
    const inkScale = Math.min(scaleX, (rowH - 3) / inkH);
    const innerW = t.w - 2 * rim;
    for (let row = 0; row < rowCount; row++) {
      const sourceY = s.y + edge + row * CUSTOM_POPUP_ROW;
      const y = t.y + edge * scaleY + row * rowH;
      context.drawImage(background, 4, 4, background.width - 8, background.height - 8,
        t.x + rim, y, innerW, rowH);
      paintControlInk(context, image, {x:s.x + edge, y:sourceY, w:s.w - 2 * edge, h:inkH},
        {x:t.x + rim, y:y + (rowH - inkH * inkScale) / 2, w:(s.w - 2 * edge) * inkScale, h:inkH * inkScale});
      context.drawImage(image, s.x + edge, sourceY + inkH, s.w - 2 * edge, 1,
        t.x + rim, y + rowH - 1, innerW, 1);
    }
    context.drawImage(image, s.x, s.y, edge, s.h, t.x, t.y, rim, t.h);
    context.drawImage(image, s.x + s.w - edge, s.y, edge, s.h, t.x + t.w - rim, t.y, rim, t.h);
    context.drawImage(image, s.x, s.y, s.w, edge, t.x, t.y, t.w, edge * scaleY);
    context.drawImage(image, s.x, s.y + s.h - edge, s.w, edge,
      t.x, t.y + t.h - edge * scaleY, t.w, edge * scaleY);
  }

  // The controls are the original sound-dialog children. Their displayed
  // body slots can be wider on a short screen so labels stay at native scale.
  const SOUND_ROWS = [
    {kind:'slider',source:[32,40,212,20],label:[12,24,232,14],help:[32,60,214,8]},
    {kind:'slider',source:[32,88,212,20],label:[12,72,232,14],help:[32,108,214,8]},
  ];
  const SOUND_ART = [
    ['volume-track','volume-thumb'], ['volume-track-human','volume-thumb-human'],
  ];

  function soundRows({left,top,width,scale,height}) {
    const x=left+12*scale,w=width-24*scale;
    const slot=height+32*scale;
    const controls=SOUND_ROWS.map((row,i)=>{
      const y=top+i*slot,trackY=y+16*scale;
      const labelBox={x,y,w:Math.min(w,232*scale),h:14*scale};
      return {...row,target:{x,y:trackY,w,h:height},labelBox,
        helpBox:{x,y:trackY+height,w,h:8*scale},scale};
    });
    const last=controls.at(-1).helpBox;
    return {controls,bottom:last.y+last.h};
  }

  function volumeDragAxis(drag,x,y) {
    if (drag.axis) return drag.axis;
    const dx=Math.abs(x-drag.x),dy=Math.abs(y-drag.y);
    if(Math.max(dx,dy)>=5)drag.axis=dx>dy?'horizontal':'vertical';
    return drag.axis;
  }

  function paintSoundEnds(context,image,s,t) {
    // Paint the native words flush with the two ends of the resized track.
    const scale=t.h/s.h,endWidth=28;
    for(const end of [0,1])paintControlInk(context,image,
      {x:s.x+end*(s.w-endWidth),y:s.y,w:endWidth,h:s.h},
      {x:t.x+end*(t.w-endWidth*scale),y:t.y,w:endWidth*scale,h:t.h});
  }

  function paintSoundControl(context,image,{source:s,target:t,scale}) {
    const {pixels:{data,width:w,height:h}}=controlPixels(image,s);
    let first=w,last=-1,red=0,blue=0;
    for(let y=2;y<h-2;y++)for(let x=14;x<w-14;x++){
      const p=(y*w+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      if(r>165&&g>130&&b<45){first=Math.min(first,x);last=Math.max(last,x);}
      if(g<35&&r>=47&&b<12)red++;
      if(r<30&&g<62&&b>=54)blue++;
    }
    const [track,thumb]=SOUND_ART[Number(blue>red)].map(artwork);
    const trackH=t.h*2/3, trackY=t.y+(t.h-trackH)/2;
    if(!track.naturalWidth||!thumb.naturalWidth||last-first>22||last<first){
      context.drawImage(image,s.x,s.y,s.w,s.h,t.x,trackY,t.w,trackH);
      return;
    }
    const size=Math.min(27*scale,t.h), position=Math.max(0,Math.min(1,((first+last)/2-26)/156));
    const rim=2,edge=Math.min(rim*scale,trackH/3);
    context.drawImage(track,0,0,track.naturalWidth,rim,t.x,trackY,t.w,edge);
    context.drawImage(track,0,rim,track.naturalWidth,track.naturalHeight-rim*2,t.x,trackY+edge,t.w,trackH-edge*2);
    context.drawImage(track,0,track.naturalHeight-rim,track.naturalWidth,rim,t.x,trackY+trackH-edge,t.w,edge);
    context.drawImage(thumb,t.x+(t.w-size)*position,t.y+(t.h-size)/2,size,size);
  }

  function reflowCustom(chart, controls, inset, backTarget, bottomInset) {
    if (controls.size !== CUSTOM_FIELDS.length + CUSTOM_BUTTONS.length) return null;
    const {width, height} = chart;
    const available = width - 2 * inset;
    const landscape = width >= height;
    const gap = Math.min(landscape ? 12 : 10, available / 6);
    const actions = backTarget ? CUSTOM_BUTTONS.slice(0, -1) : CUSTOM_BUTTONS;
    const titleScale = Math.min(1.2, available / CUSTOM_HEADING.w);
    const desiredHeight = menuButtonHeight(width, height);
    const backBottom = backTarget && Math.min(backTarget.y + backTarget.h, height - bottomInset);
    const formHeight = !landscape && backTarget ? backBottom - desiredHeight - gap : height;
    const innerHeight = formHeight - 2 * inset;
    const inlineDetail = landscape && height < 315;
    const stackedActions = landscape ? 1 : actions.length;
    const fieldScale = columnWidth => Math.min(1.7, columnWidth / 184);
    const summaryScale = summaryWidth => Math.min(1.15, summaryWidth / CUSTOM_SCENARIO_TEXT.w);
    const labelsAndGaps = (rows, scale, summary, actionRows) =>
      CUSTOM_HEADING.h * titleScale + rows * 18 * scale + summary + (rows + actionRows + 1) * gap;
    const singleRows = CUSTOM_FIELDS.length;
    const singleSummary = CUSTOM_SCENARIO_TEXT.h * summaryScale(available) + gap;
    const singleColumnHeight = labelsAndGaps(singleRows, fieldScale(available), singleSummary, stackedActions) +
      (singleRows + stackedActions) * desiredHeight;
    // Keep full-height controls on phones by using a second field column when
    // the complete single-column form would run into the footer.
    const columns = landscape ? (available >= 600 ? 3 : 2) :
      (innerHeight >= singleColumnHeight && available < 500 ? 1 : 2);
    const columnW = (available - (columns - 1) * gap) / columns;
    const formScale = fieldScale(columnW);
    const detailWidth = inlineDetail ? columnW : available;
    const detailScale = summaryScale(detailWidth);
    const detailHeight = CUSTOM_SCENARIO_TEXT.h * detailScale;
    const rows = Math.ceil(CUSTOM_FIELDS.length / columns);
    const summary = inlineDetail ? 0 : detailHeight + gap;
    const stackFits = innerHeight >= labelsAndGaps(rows, formScale, summary, stackedActions) +
      (rows + stackedActions) * desiredHeight;
    const buttonColumns = landscape || (!stackFits && actions.length === 2) ? actions.length : 1;
    const buttonRows = Math.ceil(actions.length / buttonColumns);
    const actionAvailable = landscape && backTarget ? backTarget.x - inset - gap : available;
    const actionContentWidth = Math.min(actionAvailable, available * buttonColumns /
      (landscape ? CUSTOM_BUTTONS.length : 1));
    const buttonScale = Math.min(1.65, (actionContentWidth - (buttonColumns - 1) * gap) / (224 * buttonColumns));
    if (buttonScale <= 0) return null;
    let expanded = null;
    for (const field of CUSTOM_FIELDS) {
      const live = controls.get(field.id);
      if (live?.type !== 13) return null;
      if (!same(live.source, field.control)) {
        if (expanded || !contains(live.source, field.control) ||
            live.source.x !== field.control.x || live.source.w !== field.control.w) return null;
        // The original list has two outline pixels and 18 pixels per option.
        const rowCount = (live.source.h - 2 * CUSTOM_POPUP_EDGE) / CUSTOM_POPUP_ROW;
        if (!Number.isInteger(rowCount) || rowCount < 2) return null;
        expanded = {id: field.id, source: live.source, rowCount};
      }
    }
    for (const button of CUSTOM_BUTTONS) {
      const live = controls.get(button.id);
      if (live?.type !== 2 || !same(live.source, button.source)) return null;
    }

    // In landscape keep the original left-to-right field order.
    const fields = landscape ? [CUSTOM_FIELDS[0], CUSTOM_FIELDS[2], CUSTOM_FIELDS[4],
      CUSTOM_FIELDS[1], CUSTOM_FIELDS[3]] : CUSTOM_FIELDS;
    const bodyHeight = labelsAndGaps(rows, formScale, summary, buttonRows);
    const controlRows=rows+buttonRows;
    const desiredButtonH=Math.min(desiredHeight,Math.max(28*formScale,(innerHeight-bodyHeight)/controlRows));
    const extraDetail=inlineDetail?Math.max(0,detailHeight-18*formScale-desiredButtonH):0;
    const fit = Math.min(1,(innerHeight-controlRows*desiredButtonH)/(bodyHeight+extraDetail));
    if (fit <= 0) return null;
    let top = (formHeight-(bodyHeight+extraDetail)*fit-controlRows*desiredButtonH)/2;
    const paintRegions = [], regions = [];
    function crop(source, x, y, scale, interactive, decoration) {
      const target = {x, y, w: source.w * scale,
        h: decoration==='tall-button'||decoration==='dropdown'?desiredButtonH:source.h*scale};
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
    const popupTop = landscape ? inset : top;
    const scale = formScale * fit;
    let popup = null;
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index];
      const col = index % columns;
      const left = inset + col * (columnW + gap) + (columnW - 184 * scale) / 2;
      crop(field.label, left, top, scale, false);
      const control = crop(field.control,left+4*scale,top+18*scale,scale,true,'dropdown');
      control.target.w=180*scale;
      control.caption=controls.get(field.id).caption;
      control.glyphScale=scale;
      if (expanded?.id === field.id) {
        const {source, rowCount} = expanded;
        const bottom = height - Math.max(bottomInset, inset);
        const popupH = Math.min(source.h * 48 / CUSTOM_POPUP_ROW, bottom - popupTop);
        const popupW = Math.min(columnW, Math.max(control.target.w, source.w * 1.4));
        const anchor = control.target.y + control.target.h / 2;
        const selectedRowCenter = field.control.y + field.control.h / 2 - source.y;
        const y = Math.max(popupTop, Math.min(anchor - selectedRowCenter * popupH / source.h, bottom - popupH));
        popup = {source, rowCount, decoration:'custom-popup', wideHeldInput:true, target:{
          x:Math.min(left, width - inset - popupW), y, w:popupW, h:popupH,
        }};
      }
      if (index === fields.length - 1) {
        if (inlineDetail) {
          const x = inset + (col + 1) * (columnW + gap);
          crop(CUSTOM_SCENARIO_TEXT, x, top, detailScale * fit, false);
        }
        top += (18*formScale+extraDetail+gap)*fit+desiredButtonH;
      } else if (col === columns-1) top += (18*formScale+gap)*fit+desiredButtonH;
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
      const action = actions[index];
      const button = crop(action.source, actionLeft + col * (actionW + actionGap), top,
        actionScale, true, 'tall-button');
      if (action.id === 2) button.accept = true;
      if (col === buttonColumns - 1) top += desiredButtonH + actionGap;
    }

    if (backTarget) {
      const size = desiredButtonH;
      const back = {source: CUSTOM_BUTTONS[2].source, target: {x:backTarget.x+backTarget.w-size,
        y:backBottom-size,w:size,h:size}, decoration:'back'};
      regions.push(back);
      paintRegions.push(back);
    }
    const form = {...chart, reflow:true, customFrame:CUSTOM_CONTENT, regions, paintRegions};
    if (!popup) return form;
    // Native drawing overwrites underlying controls. The closed frame keeps
    // the form stable while the expanded list alone receives input.
    const body = paintRegions.map(region => ({...region, previous:true}));
    return {...form, regions:[popup], paintRegions:[...body, popup]};
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

    const {width,height}=chart;
    const landscape=width>=height&&width>=520;
    const buttonSize=menuButtonHeight(width,height);
    const panelUnits=landscape?512:256;
    const rowCount=3,chromeHeight=106;
    const scale=Math.min(chart.regions[0].target.w/256,(width-2*inset)/panelUnits,
      (height-2*inset-rowCount*buttonSize)/chromeHeight);
    if(scale<=0)return null;
    const panelW=panelUnits*scale,totalH=rowCount*buttonSize+chromeHeight*scale;
    const left=(width-panelW)/2,top=(height-totalH)/2;
    const body=soundRows({left,top:top+30*scale,width:panelW,scale,height:buttonSize});
    const heading={source:area(4,5,248,17),target:{x:(width-248*scale)/2,y:top+6*scale,w:248*scale,h:17*scale},
      decoration:'control-ink'};
    const fields=body.controls.map(({source,...row})=>({...row,source:area(...source),decoration:'sound-control'}));
    const labels=body.controls.flatMap(row=>[{source:area(...row.label),target:row.labelBox,decoration:'control-ink'},
      {source:area(...row.help),target:row.helpBox,decoration:'sound-ends'}]);
    const footerY=top+totalH-buttonSize-10*scale;
    const button={source:accept,target:{x:left+16*scale,y:footerY,w:106*scale,h:buttonSize},decoration:'tall-button',accept:true};
    const back={source:cancel,target:{x:left+panelW-buttonSize-16*scale,y:footerY,w:buttonSize,h:buttonSize},decoration:'back'};
    const stone={source:area(0,174,256,48),target:{x:left,y:top,w:panelW,h:totalH},texture:true};
    return {...chart,reflow:true,regions:[...fields,button,back],paintRegions:[stone,heading,...labels,...fields,button,back],
      frame:{source:area(0,0,w,h),target:stone.target,scale}};
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
    const filterTop = inset+(landscape?35:30*scale);
    const filterGap=6*scale;
    const listX = landscape ? inset+labelWidth+gap : inset;
    const filters = SCENARIO_FILTERS.filter(field => !field.optional || controls.has(field.id));
    const listTop = landscape?filterTop:filterTop+filters.length*(buttonSize+filterGap);
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
    for (const [index,field] of filters.entries()) {
      const source = area(...field.control);
      const item = controls.get(field.id);
      const drawY = filterTop+index*(buttonSize+filterGap);
      const drawX = inset+(field.label?128*scale:0);
      if (item?.type !== 13) return null;
      if ((item.flags & 0x2000) !== 0) {
        if (popup || !contains(item.source,source) || item.source.x !== source.x || item.source.w !== source.w) return null;
        popup = {...item, target:fitted(item.source,drawX,Math.max(inset,Math.min(height-inset-item.source.h*scale,
          drawY+(buttonSize-source.h*scale)/2+(item.source.y-source.y)*scale)))};
      } else if (!same(item.source, source)) return null;
      if (field.label) {
        const label = area(...field.label);
        add(label,fitted(label,inset,drawY+(buttonSize-label.h*scale)/2),'scenario-caption');
      }
      add(source,{...fitted(source,drawX,drawY),h:buttonSize},'dropdown',true);
    }
    add(list,listBox,'scenario-list',true);
    add(result,{...fitted(result,landscape?listX:inset,resultY),w:Math.min(listWidth,result.w*scale)},'scenario-caption');
    add(ok,{...fitted(ok,inset,footerY),h:buttonSize},'tall-button',true);
    paintRegions.at(-1).accept=true;
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

  function layout({width, height, art, scenes, wine, backTarget, backImage, bottomInset=0}) {
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
      const reflow = controls && reflowCustom(chart, controls, inset, backTarget, bottomInset);
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
      const buttons = readControls(wine, front, new Set([1,2]));
      if (buttons) return reflowNativeFooter(chart, front, buttons, footer, inset) || chart;
    }
    return chart;
  }

  const isAdaptedHandler = handler => HELD_CONTROLS.has(handler);
  const api = Object.freeze({layout, wantsImmediatePress, isAdaptedHandler, paintTallButton, menuButtonHeight,
    paintDropdown,paintCustomPopup,soundRows,volumeDragAxis,paintSoundControl,paintSoundEnds,paintControlInk,acceptArtwork});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyDialogLayout = api;
})(globalThis);
