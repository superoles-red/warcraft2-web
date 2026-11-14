/* Pure native-pixel layout. No actions, availability rules or pixel masks. */
(function (global, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.WarcraftHudLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MINIMAP = Object.freeze({left:24, top:26, width:128, height:128});
  const INFO_SIZE = 176;
  const COMMAND_BANK_WIDTH = 166;
  const COMMAND_BANK_HEIGHT = 140;
  const CANCEL_WIDTH = 54;
  const MENU = Object.freeze({left:0, top:0, width:88, height:24});
  // Original rez/stat_f10.bin child2; inclusive4,2..83,21. Keep V13 MENU above.
  const MENU_BUTTON = Object.freeze({left:4, top:2, width:80, height:20});
  const positive = n => Number.isFinite(n) && n > 0;
  function placement(left, top, scale) {
    if (![left,top].every(Number.isFinite) || !positive(scale))
      throw new TypeError('Finite HUD position and positive scale required');
  }
  function sourceRect(value) {
    if (!value || ![value.left,value.top].every(Number.isFinite) ||
        !positive(value.width) || !positive(value.height))
      throw new TypeError('Native source requires left, top, width and height');
    return {left:value.left, top:value.top, width:value.width, height:value.height};
  }
  /** left/top anchor the union of button frames, excluding outer stone margins.
   * Native children use INCLUSIVE LTRB. All nine IDs and explicit native
   * presence/visibility metadata are required; unknown snapshots return null.
   * Raw flags, icon colors and resource affordability are never interpreted here.
   * Immutable BNE SHA c3d83429aa0c2200ad3f6ac141da8ae7213a7b196d1f70d4d84a6e607bd504bd:
   * commandPresent comes from child+26h (44B927 assigns,44B960 clears).
   * nativeVisible comes from child+18h bit08: native event0E jumps4033FF and
   * ORs08 at403416; event0F jumps4033E7 and ANDsF7 at4033F0. The event table
   * is4034D4/4034B0.4045B0 sends0E;404480 sends0F. Bit01 is redraw dirtiness.
   */
  function createCommandRegions(packet, {left=0, top=0, scale=1}={}) {
    placement(left,top,scale);
    if (packet?.usable !== true || !Array.isArray(packet.children) ||
        !positive(packet.screen?.width) || !positive(packet.screen?.height)) return null;
    const records=[];
    for (let id=0;id<9;id++) {
      const found=packet.children.filter(record=>record.id===id);
      if (found.length!==1) return null;
      const record=found[0], n=record.native;
      if (typeof record.commandPresent!=='boolean' || typeof record.nativeVisible!=='boolean' ||
          !n || ![n.left,n.top,n.right,n.bottom].every(Number.isInteger) ||
          n.left<0 || n.top<0 || n.right>=packet.screen.width || n.bottom>=packet.screen.height ||
          n.right-n.left+1!==54 || n.bottom-n.top+1!==46) return null;
      records.push(record);
    }
    const columns=records.slice(0,3).map(record=>record.native.left);
    const rows=[records[0].native.top,records[3].native.top,records[6].native.top];
    if (columns[1]-columns[0]!==56 || columns[2]-columns[1]!==56 ||
        rows[1]-rows[0]!==47 || rows[2]-rows[1]!==47) return null;
    for (const record of records) {
      const row=Math.floor(record.id/3),col=record.id%3;
      if (record.native.left!==columns[col] || record.native.top!==rows[row]) return null;
    }
    return records.filter(record=>record.commandPresent && record.nativeVisible).map(record=>{
      const row=Math.floor(record.id/3),col=record.id%3,n=record.native;
      return {id:'command-'+record.id,nativeId:record.id,
        source:{left:n.left,top:n.top,width:n.right-n.left+1,height:n.bottom-n.top+1},
        target:{left:left+(columns[col]-columns[0])*scale,
          top:top+(rows[2-row]-rows[0])*scale,width:54*scale,height:46*scale}};
    });
  }
  /** Native49F548={24,26,151,153} inclusive; no surrounding wood/frame.
   * 42E010 loads that clip;42DF90 subtracts24/26 and clamps0..127;
   * 42DBAC draws128x128 pixels at local24,2 in scene12(native0,24).
   */
  function createMinimapRegion({left=0,top=0,size=128}={}) {
    placement(left,top,size);
    return {id:'minimap',source:{...MINIMAP},target:{left,top,width:size,height:size}};
  }
  /** Four caller-supplied FOREGROUND native control rectangles, never a broad
   * top-bar crop. Source rectangles use chart width/height (not inclusive R/B).
   * This helper only arranges those native pixels; extracting their foreground
   * layer is the native adapter's responsibility. Menu remains at least36px high.
   */
  function createHeaderLayout(resources, {width,left=0,top=0,menuScale=1.5,
      resourceScale=1.5,gap=8,rowGap=4}={}) {
    placement(left,top,menuScale);
    if (!positive(width) || menuScale<1.5 || !positive(resourceScale) ||
        !Number.isFinite(gap) || gap<0 || !Number.isFinite(rowGap) || rowGap<0)
      throw new TypeError('Invalid native header layout');
    if (!Array.isArray(resources) || resources.length!==4)
      throw new TypeError('Four explicit native foreground resources required');
    const ids=new Set(['menu']);
    const parts=resources.map(item=>{
      if (!item || typeof item.id!=='string' || !item.id || ids.has(item.id))
        throw new TypeError('Unique native resource IDs required');
      ids.add(item.id);return {id:item.id,source:sourceRect(item.source)};
    });
    const sum=parts.reduce((n,item)=>n+item.source.width,0);
    const maxH=Math.max(...parts.map(item=>item.source.height));
    const menuW=MENU.width*menuScale,menuH=MENU.height*menuScale;
    if (menuW>width || gap*3>=width) throw new RangeError('Header is too narrow for native Menu');
    const menuOwnLine=menuW+gap+sum*resourceScale+gap*3>width;
    const available=menuOwnLine?width:width-menuW-gap;
    const scale=Math.min(resourceScale,(available-gap*3)/sum);
    if (!positive(scale)) throw new RangeError('Empty resource row');
    const rowHeight=maxH*scale,height=menuOwnLine?menuH+rowGap+rowHeight:Math.max(menuH,rowHeight);
    const rowTop=menuOwnLine?top+menuH+rowGap:top+(height-rowHeight)/2;
    let x=menuOwnLine?left:left+menuW+gap;
    const regions=[{id:'menu',source:{...MENU},target:{left,top:top+(menuOwnLine?0:(height-menuH)/2),width:menuW,height:menuH}}];
    for (const item of parts) {
      const w=item.source.width*scale,h=item.source.height*scale;
      regions.push({id:item.id,source:item.source,target:{left:x,top:rowTop+(rowHeight-h)/2,width:w,height:h}});
      x+=w+gap;
    }
    return {regions,height,menuOwnLine,resourceScale:scale,
      resourcesBounds:{left:menuOwnLine?left:left+menuW+gap,top:rowTop,width:available,height:rowHeight}};
  }
  /** V14: retain the native3x3 row flip, moving only a producer-verified Cancel
   * to the lower-right corner. isCancel is WUR3 metadata, never an ID/icon guess.
   * cancelRight/cancelBottom are exclusive presentation anchors, not extra rows.
   */
  function createV14CommandRegions(packet,{left=0,top=0,scale=1,separateCancel=true,
      cancelRight,cancelBottom}={}) {
    if(packet?.format!=='WUR3'||!Array.isArray(packet.children))return null;
    for(let id=0;id<9;id++) {
      const matching=packet.children.filter(record=>record.id===id);
      if(matching.length!==1||typeof matching[0].isCancel!=='boolean')return null;
      if(matching[0].isCancel&&!matching[0].commandPresent)return null;
    }
    if(typeof separateCancel!=='boolean')throw new TypeError('Explicit Cancel layout mode required');
    if(separateCancel&&![cancelRight,cancelBottom].every(Number.isFinite))
      throw new TypeError('Cancel corner anchors required');
    const regions=createCommandRegions(packet,{left,top,scale});if(!regions)return null;
    const activeCancel=regions.filter(r=>packet.children.find(c=>c.id===r.nativeId).isCancel);
    if(activeCancel.length>1)return null;
    return regions.map(region=>{
      const isCancel=packet.children.find(c=>c.id===region.nativeId).isCancel;
      return {...region,isCancel,target:separateCancel&&isCancel?
        {left:cancelRight-region.target.width,top:cancelBottom-region.target.height,
          width:region.target.width,height:region.target.height}:region.target};
    });
  }
  const infoHeights = new WeakMap();
  function createInfoRegion(layer, {left, top, scale, right, bottom}) {
    placement(left, top, scale);
    if (!layer?.captured || !layer.nativeVisible || right <= left || bottom <= top) return null;
    const {left: nativeLeft, top: nativeTop, width} = sourceRect(layer.source);
    let visibleHeight = infoHeights.get(layer);
    if (visibleHeight === undefined) {
      // The native foreground mask identifies padding below the last drawn icon or line.
      let last = layer.alpha.length - 1;
      while (last >= 0 && !layer.alpha[last]) last--;
      visibleHeight = Math.ceil((last + 1) / width);
      infoHeights.set(layer, visibleHeight);
    }
    if (!visibleHeight) return null;
    const fitted = Math.min(scale, (right - left) / width, (bottom - top) / visibleHeight);
    return {id: 'info', source: {left: nativeLeft, top: nativeTop, width, height: visibleHeight},
      layer: 'native-hud-100', visualSource: {left: 0, top: 0, width, height: visibleHeight},
      target: {left, top, width: width * fitted, height: visibleHeight * fitted}};
  }
  function createAdaptiveBoardLayout(layer, {left, right, top, bottom, scale, portrait}) {
    placement(left, top, scale);
    if (![right, bottom].every(Number.isFinite) || right <= left || bottom <= top)
      throw new TypeError('Invalid bounds for adaptive HUD');
    const gap = Math.min(8, (right - left) / 8, (bottom - top) / 8);
    const width = right - left - gap;
    const height = bottom - top - gap;
    // Reserve the full native info panel so selection changes never move
    // the minimap or the commands. Tall displays can spend more on buttons.
    const panelWidth = Math.min(width / 2, INFO_SIZE * scale * 1.15);
    const preferred = scale * (portrait ? 1.42 : 1.2);
    const panelShare = Math.min(panelWidth, height * .42);
    const commandScale = Math.min(preferred,
      width / (COMMAND_BANK_WIDTH + CANCEL_WIDTH),
      (height - panelShare) / COMMAND_BANK_HEIGHT);
    const gridTop = bottom - COMMAND_BANK_HEIGHT * commandScale;
    const size = Math.min(panelWidth, gridTop - top - gap);
    const minimap = createMinimapRegion({left:right - size, top, size});
    const info = createInfoRegion(layer, {left, top, scale:size / INFO_SIZE,
      right:left + size, bottom:top + size});
    return {info, minimap, commandScale, gridTop};
  }
  /** V14: exactly one header row. Caller supplies native alpha bounds through
   * field.compact.source. Reserved native widths stabilize short counters without
   * cropping larger ones. All glyph pixels and source coordinates remain native.
   */
  function createCompactHeaderLayout(fields,{width,left=0,top=0,menuScale=1.8,
      resourceScale=1.5,gap=6,reserveWidth=42,minMenuScale=1}={}) {
    placement(left,top,menuScale);
    if(!positive(width)||!positive(resourceScale)||!positive(minMenuScale)||minMenuScale>menuScale||
       !Number.isFinite(gap)||gap<0||!Number.isFinite(reserveWidth)||reserveWidth<0)
      throw new TypeError('Invalid compact header geometry');
    if(!Array.isArray(fields)||fields.length!==4)throw new TypeError('Four compact native fields required');
    const ids=new Set(['menu']);
    const parts=fields.map(field=>{
      const id=Number.isInteger(field?.id)?'resource-'+field.id:field?.id;
      if(typeof id!=='string'||!id||ids.has(id))throw new TypeError('Unique compact resource IDs required');
      ids.add(id);const source=sourceRect(field?.compact?.source);
      return{id,source,reserved:Math.max(source.width,reserveWidth)};
    });
    const sum=parts.reduce((n,p)=>n+p.reserved,0),gaps=gap*4,minResources=Math.min(1,resourceScale);
    let actualMenuScale=menuScale;
    if((width-MENU_BUTTON.width*actualMenuScale-gaps)/sum<minResources)
      actualMenuScale=Math.max(minMenuScale,Math.min(menuScale,(width-gaps-sum*minResources)/MENU_BUTTON.width));
    const menuW=MENU_BUTTON.width*actualMenuScale,menuH=MENU_BUTTON.height*actualMenuScale;
    const actualResourceScale=Math.min(resourceScale,(width-menuW-gaps)/sum);
    if(!positive(actualResourceScale))throw new RangeError('Compact header too narrow');
    const resourceH=Math.max(...parts.map(p=>p.source.height))*actualResourceScale;
    const height=Math.max(menuH,resourceH),regions=[{id:'menu',source:{...MENU_BUTTON},
      target:{left,top:top+(height-menuH)/2,width:menuW,height:menuH}}];
    let x=left+menuW+gap;
    for(const part of parts) {
      const w=part.source.width*actualResourceScale,h=part.source.height*actualResourceScale;
      regions.push({id:part.id,source:part.source,
        target:{left:x,top:top+(height-h)/2,width:w,height:h}});
      x+=part.reserved*actualResourceScale+gap;
    }
    return{regions,height,menuOwnLine:false,menuScale:actualMenuScale,resourceScale:actualResourceScale,
      reservedNativeWidths:parts.map(p=>p.reserved)};
  }
  /** Already-trimmed native tooltip/cost foreground, kept in its original
   * relative arrangement and uniformly fit above the command grid. No text,
   * availability, masking or cost logic is implemented here.
   */
  function createStatusLayout(fields,{left=0,bottom=0,width,scale=1}={}) {
    placement(left,bottom,scale);if(!positive(width)||!Array.isArray(fields))throw new TypeError('Invalid native status layout');
    if(!fields.length)return{regions:[],height:0,scale,bounds:null};
    const ids=new Set(),parts=fields.map(field=>{
      if(typeof field?.id!=='string'||!field.id||ids.has(field.id))throw new TypeError('Unique native status IDs required');
      ids.add(field.id);return{id:field.id,source:sourceRect(field.source)};
    });
    const x=Math.min(...parts.map(p=>p.source.left)),y=Math.min(...parts.map(p=>p.source.top));
    const w=Math.max(...parts.map(p=>p.source.left+p.source.width))-x;
    const h=Math.max(...parts.map(p=>p.source.top+p.source.height))-y;
    const fitted=Math.min(scale,width/w),height=h*fitted,top=bottom-height;
    return{regions:parts.map(p=>({id:p.id,source:p.source,
      target:{left:left+(p.source.left-x)*fitted,top:top+(p.source.top-y)*fitted,
        width:p.source.width*fitted,height:p.source.height*fitted}})),height,scale:fitted,
      bounds:{left,top,width:w*fitted,height}};
  }
  /** Place the native cost slots above their description in the clear lower
   * gap. The visible command bank and reserved Cancel define that gap.
   * When the gap would make the glyphs smaller than native, use clear space
   * above the bank if that admits a more legible scale.
   */
  function createGapStatusLayout(fields, {width, height, commands = [], cancel,
      obstacles = [], margin = 4, bottomMargin = margin, leftMargin = margin,
      rightMargin = margin, gap = 6, maxScale = 1.25, preferAbove = false} = {}) {
    if (!positive(width) || !positive(height) || !positive(maxScale) ||
        !Number.isFinite(margin) || margin < 0 || !Number.isFinite(gap) || gap < 0 ||
        ![bottomMargin,leftMargin,rightMargin].every(value=>Number.isFinite(value)&&value>=0) ||
        !Array.isArray(fields) || !Array.isArray(commands) || !Array.isArray(obstacles))
      throw new TypeError('Invalid tooltip geometry');
    if (!fields.length) return {regions: [], bounds: null};
    const rows = ['cost', 'description'].map(role => fields.filter(field => field.role === role))
      .filter(row => row.length)
      .map(parts => ({
        parts,
        width: parts.reduce((total, part) => total + sourceRect(part.source).width, 0),
        height: Math.max(...parts.map(part => part.source.height)),
      }));
    if (!rows.length) return {regions: [], bounds: null};
    const bank = commands.filter(command => !command.isCancel).map(command => command.target);
    const rightEdge = width - rightMargin;
    const left = Math.max(leftMargin, ...bank.map(rect => rect.left + rect.width + gap));
    const right = Math.min(rightEdge, cancel ? cancel.left - gap : rightEdge);
    const bottom = height - bottomMargin;
    const fullWidth = rightEdge - leftMargin;
    const rowGap = rows.length > 1 ? Math.min(3, gap) : 0;
    const heightOfRows = rows.reduce((total, row) => total + row.height, 0);
    function fit(availableWidth, availableHeight) {
      if (availableWidth <= 0 || availableHeight <= rowGap) return 0;
      return Math.max(0, Math.min(maxScale, (availableHeight - rowGap) / heightOfRows,
        ...rows.map(row => (availableWidth - gap * (row.parts.length - 1)) / row.width)));
    }
    function clearFrom(x, rightEdge, lowerEdge) {
      return Math.max(margin, ...obstacles.filter(rect => rect.left < rightEdge &&
        rect.left + rect.width > x && rect.top < lowerEdge).map(rect => rect.top + rect.height + gap));
    }
    let box = {left, right, bottom};
    let scale = fit(right - left, bottom - clearFrom(left, right, bottom));
    const readableGapScale = preferAbove ? Math.max(1, maxScale * .85) : 1;
    if (scale < Math.min(readableGapScale, maxScale)) {
      const above = Math.min(bottom, ...bank.map(rect => rect.top - gap),
        cancel ? cancel.top - gap : bottom);
      const alternate = fit(fullWidth, above - clearFrom(leftMargin, rightEdge, above));
      if (alternate > scale) {
        box = {left: leftMargin, right: rightEdge, bottom: above};
        scale = alternate;
      }
    }
    if (!positive(scale)) return {regions: [], bounds: null};

    const xCenter = (box.left + box.right) / 2;
    const rowWidths = rows.map(row => row.width * scale + gap * (row.parts.length - 1));
    const paintedWidth = Math.max(...rowWidths);
    const paintedHeight = heightOfRows * scale + rowGap;
    let y = box.bottom - paintedHeight;
    const bounds = {left: xCenter - paintedWidth / 2, top: y, width: paintedWidth, height: paintedHeight};
    const regions = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let x = xCenter - rowWidths[i] / 2;
      for (const part of row.parts) {
        const w = part.source.width * scale, h = part.source.height * scale;
        regions.push({...part, interactive: false, target: {
          left: x, top: y + (row.height * scale - h) / 2, width: w, height: h,
        }});
        x += w + gap;
      }
      y += row.height * scale + rowGap;
    }
    return {regions, bounds, scale};
  }
  return Object.freeze({createCommandRegions,createMinimapRegion,createHeaderLayout,
    createV14CommandRegions,createInfoRegion,createAdaptiveBoardLayout,createCompactHeaderLayout,createStatusLayout,createGapStatusLayout,
    nativeMinimap:MINIMAP,nativeMenu:MENU,nativeMenuButton:MENU_BUTTON});
});
