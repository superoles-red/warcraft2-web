/* Native WHF2 glyph/icon pixels and applied palette. No text or game logic. */
(function(global){
  'use strict';
  const SIZE=10496,ALPHA=128,INDICES=4800,PALETTE=9472,FIELD_PIXELS=73*16;
  function parse(bytes){
    const d=bytes instanceof ArrayBuffer?new DataView(bytes):ArrayBuffer.isView(bytes)?
      new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength):null;
    if(d?.byteLength>=64&&d.getUint32(0,true)===0x33464857)return parseV3(d);
    if(!d||d.byteLength!==SIZE)throw new RangeError('WHF2 requires10496 bytes');
    const u16=n=>d.getUint16(n,true),s16=n=>d.getInt16(n,true),u32=n=>d.getUint32(n,true);
    const flags=u32(12),screen={width:u16(16),height:u16(18)};
    if(u32(0)!==0x32464857||u32(4)!==SIZE||(flags&~15)||u16(20)!==4||u16(22)!==16||
       u32(40)!==INDICES||u32(44)!==PALETTE||u32(48)!==256||u32(56)||u32(60)||
       screen.width<640||screen.width>1920||screen.height<480||screen.height>1536||screen.width%32||screen.height%32)
      throw new RangeError('Invalid WHF2 header');
    const view=new Uint8Array(d.buffer,d.byteOffset,d.byteLength),fields=[];
    for(let i=0;i<4;i++){
      const p=64+i*16,id=u16(p),fieldFlags=u16(p+2),left=s16(p+4),top=s16(p+6),right=s16(p+8),bottom=s16(p+10);
      if(id!==i+1||(fieldFlags&~1)||right-left+1!==73||bottom-top+1!==16||left<0||top<0||
         right>=screen.width||bottom>=screen.height||u32(p+12)!==ALPHA+i*FIELD_PIXELS)
        throw new RangeError('Invalid WHF2 field');
      const alpha=view.subarray(ALPHA+i*FIELD_PIXELS,ALPHA+(i+1)*FIELD_PIXELS);
      if(alpha.some(value=>value!==0&&value!==255))throw new RangeError('Invalid native opacity mask');
      fields.push(Object.freeze({id,captured:!!(fieldFlags&1),source:Object.freeze({left,top,right,bottom,width:73,height:16}),
        alpha,indices:view.subarray(INDICES+i*FIELD_PIXELS,INDICES+(i+1)*FIELD_PIXELS)}));
    }
    return Object.freeze({format:'WHF2',bytes:SIZE,revision:u32(8),flags,screen:Object.freeze(screen),
      usable:flags===15&&fields.every(f=>f.captured),fields:Object.freeze(fields),
      infoLayoutMode:u32(24),selectionCount:u32(28),infoRoot:u32(32),captureCount:u32(36),paletteCaptureCount:u32(52),
      palette:view.subarray(PALETTE,PALETTE+1024)});
  }
  function parseV3(d){
    const u16=n=>d.getUint16(n,true),s16=n=>d.getInt16(n,true),u32=n=>d.getUint32(n,true);
    const flags=u32(12),screen={width:u16(16),height:u16(18)},size=d.byteLength;
    if(size<256+1024||size>134016||u32(4)!==size||(flags&~15)||u16(20)!==6||u16(22)!==32||
       u32(44)!==256||u32(56)>=290||u32(60)||screen.width<640||screen.width>1920||
       screen.height<480||screen.height>1536||screen.width%32||screen.height%32)
      throw new RangeError('Invalid WHF3 header');
    const view=new Uint8Array(d.buffer,d.byteOffset,size),layers=[];let offset=256;
    for(let i=0;i<6;i++){
      const p=64+i*32,id=u16(p),f=u16(p+2),left=s16(p+4),top=s16(p+6),right=s16(p+8),bottom=s16(p+10);
      const width=u16(p+12),height=u16(p+14),n=width*height;
      if(id!==(i<4?i+1:i===4?100:101)||(f&~3)||!n||n>176*176||
         (i<4&&(width!==73||height!==16))||(i===4&&(width!==176||height!==176))||
         (i===5&&(height!==16||width>1920))||right-left+1!==width||bottom-top+1!==height||
         left<0||top<0||right>=screen.width||bottom>=screen.height||u32(p+16)!==offset||
         u32(p+20)!==offset+n||offset+2*n>size-1024)
        throw new RangeError('Invalid WHF3 layer');
      const alpha=view.subarray(offset,offset+n),indices=view.subarray(offset+n,offset+2*n);
      if(alpha.some(a=>a!==0&&a!==255))throw new RangeError('Invalid native opacity mask');
      const hotkeyStart=id===101?u32(56):0;
      if(hotkeyStart>=width)throw new RangeError('Invalid WHF3 status shortcut boundary');
      layers.push(Object.freeze({id,captured:!!(f&1),nativeVisible:!!(f&2),root:u32(p+24),callbackCount:u32(p+28),hotkeyStart,
        source:Object.freeze({left,top,right,bottom,width,height}),alpha,indices}));
      offset+=n*2;
    }
    if(u32(40)!==offset||offset+1024!==size)throw new RangeError('Invalid WHF3 palette extent');
    return Object.freeze({format:'WHF3',bytes:size,revision:u32(8),flags,screen:Object.freeze(screen),
      usable:flags===15&&layers.slice(0,4).every(f=>f.captured),fields:Object.freeze(layers.slice(0,4)),
      layers:Object.freeze(layers),infoLayoutMode:u32(24),selectionCount:u32(28),infoRoot:u32(32),
      captureCount:u32(36),statusRoot:u32(48),paletteCaptureCount:u32(52),palette:view.subarray(offset,offset+1024)});
  }
  /** Bounds come from the original painter's opacity, not RGB color guessing. */
  function contentRect(layer,{left=0,top=0,width=layer.source.width,height=layer.source.height,minWidth=0}={}){
    if(!layer?.captured)return null;
    const w=layer.source.width,h=layer.source.height;
    const endX=Math.min(w,left+width),endY=Math.min(h,top+height);
    let minX=endX,minY=endY,maxX=-1,maxY=-1;
    for(let y=Math.max(0,top);y<endY;y++)for(let x=Math.max(0,left);x<endX;x++)if(layer.alpha[y*w+x]){
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(maxX<minX||maxY<minY)return null;
    const targetWidth=Math.min(endX-Math.max(0,left),Math.max(maxX-minX+1,minWidth));
    minX=Math.max(Math.max(0,left),Math.min(minX,endX-targetWidth));
    return {left:layer.source.left+minX,top:layer.source.top+Math.max(0,top),width:targetWidth,height:endY-Math.max(0,top)};
  }
  // WHF3 layer 101 captures the original textbox.bin scene. Description
  // occupies child 5; food child 4 shares the first native cost slot.
  function statusFields(layer, {hideHotkeys=false}={}) {
    if (layer?.id !== 101 || !layer.captured || !layer.nativeVisible) return [];
    const slots = [
      ['description', 'status-text', 0, (hideHotkeys && layer.hotkeyStart) || 290],
      ['cost', 'status-cost-1', 290, 52],
      ['cost', 'status-cost-2', 342, 52],
      ['cost', 'status-cost-3', 394, 52],
    ];
    const fields = [];
    for (const [role, id, left, width] of slots) {
      const source = contentRect(layer, {left, width});
      if (!source) continue;
      fields.push({id, role, source, layer: 'native-hud-101', visualSource: {
        left: source.left - layer.source.left, top: source.top - layer.source.top,
        width: source.width, height: source.height,
      }});
    }
    return fields;
  }
  function canvasFor(width,height){
    if(global.OffscreenCanvas)return new global.OffscreenCanvas(width,height);
    const canvas=global.document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
  }
  function createMinimapPainter({left,top,width,height},factory=canvasFor){
    let frame,context,image,words,lastPacket;
    const rgba=new Uint8Array(1024),colors=new Uint32Array(rgba.buffer);
    return {paint(packet,blackIndex=239){
      if(packet===lastPacket)return frame;
      if(!frame){
        frame=factory(width,height);context=frame.getContext('2d');
        image=context.createImageData(width,height);words=new Uint32Array(image.data.buffer);
      }
      const {palette,indices,screen}=packet;
      for(let p=0;p<1024;p+=4){
        rgba[p]=palette[p];rgba[p+1]=palette[p+1];rgba[p+2]=palette[p+2];
        rgba[p+3]=p===blackIndex*4&&!(rgba[p]|rgba[p+1]|rgba[p+2])?150:255;
      }
      for(let y=0,i=0;y<height;y++){
        const from=(top+y)*screen.width+left;
        for(let x=0;x<width;x++)words[i++]=colors[indices[from+x]];
      }
      context.putImageData(image,0,0);lastPacket=packet;return frame;
    }};
  }
  function hasProgressFill(layer){
    // Native 445690 paints the green progress fill across the original
    // 12,153..163,166 strip. Its caption is painted on top in other indices.
    const {width,height}=layer.source,fill=0x95;
    if(width!==176||height!==176)return false;
    for(let y=153;y<167;y++){
      const at=y*width+12;
      if(!layer.alpha[at]||layer.indices[at]!==fill)return false;
    }
    return true;
  }
  function createLayerSetPainter(factory){
    const entries=new Map();
    factory=factory||canvasFor;
    return {capture(packet){
      if(packet?.format!=='WHF3'||!packet.usable)throw new TypeError('Complete WHF3 foreground required');
      const result={};
      for(const layer of packet.layers){
        if(!layer.captured)continue;
        let item=entries.get(layer.id);const {width,height}=layer.source;
        if(!item){const frame=factory(width,height);item={frame,context:frame.getContext('2d'),revision:null};entries.set(layer.id,item);}
        if(!item.context)throw new Error('Native foreground canvas unavailable');
        if(item.frame.width!==width||item.frame.height!==height){item.frame.width=width;item.frame.height=height;item.revision=null;}
        if(item.revision!==packet.revision){
          const image=item.context.createImageData(width,height),out=image.data;
          for(let i=0;i<width*height;i++)if(layer.alpha[i]){
            const color=layer.indices[i]*4,p=i*4;
            out[p]=packet.palette[color];out[p+1]=packet.palette[color+1];out[p+2]=packet.palette[color+2];out[p+3]=255;
          }
          if(layer.id===100&&packet.infoLayoutMode===1&&hasProgressFill(layer)){
            for(let y=153;y<167;y++)for(let x=12;x<164;x++){
              const at=y*width+x;
              if(layer.alpha[at]&&layer.indices[at]===0x95)out[at*4+3]=165;
            }
          }
          item.context.putImageData(image,0,0);item.revision=packet.revision;
        }
        result['native-hud-'+layer.id]=item.frame;
      }
      return result;
    }};
  }
  function createLayerPainter(factory){
    let frame=null,context=null,revision=null;
    factory=factory||((width,height)=>{
      if(global.OffscreenCanvas)return new global.OffscreenCanvas(width,height);
      const canvas=global.document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
    });
    return {capture(packet){
      if(!packet?.usable)throw new TypeError('Complete native foreground required');
      const width=packet.screen.width,height=Math.max(...packet.fields.map(f=>f.source.bottom+1));
      if(!frame){frame=factory(width,height);context=frame.getContext('2d');}
      if(!context)throw new Error('Native HUD layer unavailable');
      if(frame.width!==width||frame.height!==height){frame.width=width;frame.height=height;revision=null;}
      if(revision!==packet.revision){
        const image=context.createImageData(width,height),out=image.data,palette=packet.palette;
        for(const field of packet.fields)for(let y=0;y<16;y++)for(let x=0;x<73;x++){
          const n=y*73+x;if(!field.alpha[n])continue;
          const color=field.indices[n]*4,p=((field.source.top+y)*width+field.source.left+x)*4;
          out[p]=palette[color];out[p+1]=palette[color+1];out[p+2]=palette[color+2];out[p+3]=255;
        }
        context.putImageData(image,0,0);revision=packet.revision;
      }
      return {frame,revision,fields:packet.fields};
    }};
  }
  const api={parse,createLayerPainter,createLayerSetPainter,createMinimapPainter,contentRect,statusFields,byteLength:SIZE};
  if(typeof module==='object'&&module.exports)module.exports=api;else global.WarcraftHudForeground=api;
})(typeof window!=='undefined'?window:globalThis);
