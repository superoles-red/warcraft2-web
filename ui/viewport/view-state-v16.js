/* Strict V16-only WVS2 telemetry. Native map-init epoch prevents reuse of a
 * previous scenario background. WVS1 remains owned by view-state-v15.js.
 * This reader observes exact native state; it never infers game rules. */
(function(global){
  'use strict';
  function parse(bytes){
    if(!ArrayBuffer.isView(bytes)||bytes.byteLength!==512)throw new RangeError('WVS2 must be512 bytes');
    bytes=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const u32=n=>d.getUint32(n,true),u16=n=>d.getUint16(n,true),s16=n=>d.getInt16(n,true);
    if(u32(0)!==0x32535657||u32(4)!==512||(u32(12)&~255))throw new RangeError('Invalid WVS2 header');
    if(bytes[20]>9||u32(184)>9||u32(188)>4||[504,508].some(n=>u32(n)!==0))throw new RangeError('Invalid WVS2 counts');
    const flags=u32(12),mapEpoch=u32(500),screen={width:u16(16),height:u16(18)};
    if((flags&2)&&mapEpoch===0)throw new RangeError('WVS2 inGame requires native mapEpoch');
    const supported=s=>s.width>=640&&s.width<=1920&&s.height>=480&&s.height<=1536&&s.width%32===0&&s.height%32===0;
    const rect=n=>({left:s16(n),top:s16(n+2),right:s16(n+4),bottom:s16(n+6)});
    const inScreen=r=>r.left>=0&&r.top>=0&&r.right>=r.left&&r.bottom>=r.top&&r.right<screen.width&&r.bottom<screen.height;
    const selected=Array.from({length:9},(_,i)=>u32(28+i*4));
    const contexts=Array.from({length:9},(_,i)=>u32(64+i*4));
    const commands=[],ids=new Set();
    for(let i=0;i<u32(184);i++){
      const p=192+i*20,id=u16(p),roles=u16(p+2),objectAddress=u32(p+4),descriptorAddress=u32(p+8);
      if(id>8||ids.has(id)||(roles&~15)||(objectAddress!==0&&objectAddress<65536)||
        (descriptorAddress!==0&&descriptorAddress<65536))throw new RangeError('Invalid WVS2 command record');
      ids.add(id);commands.push({id,roles,objectAddress,descriptorAddress,actionAddress:u32(p+12),param:u32(p+16),
        isBuildingPlacement:!!(roles&8),nativeVisible:!!(roles&2)});
    }
    const usable=(flags&15)===15&&supported(screen)&&commands.length===9;
    const dialog=u32(112),dialogRect=rect(132);
    const stack=[];
    for(let i=0;i<u32(188);i++){
      const p=372+i*32,scene=u32(p),r=rect(p+20),root=u32(p+4);
      if(scene<2||scene>5||!root||!inScreen(r))throw new RangeError('Invalid WVS2 modal scene');
      stack.push({scene,root,handlerAddress:u32(p+8),firstChildAddress:u32(p+12),
        nativeVisible:!!(u16(p+16)&255),rect:{...r,inclusive:true}});
    }
    const modal=(flags&48)===48&&dialog&&inScreen(dialogRect)?{format:'WMD1',usable:true,flags:15,
      // The native diagnostic epoch also observes transient dirty/focus flags.
      // Dialog identity excludes those flags so a held button survives repaint.
      token:dialog,identity:[dialog,u32(116),u32(120),u32(124),...Object.values(dialogRect),
        ...stack.flatMap(s=>[s.scene,s.root,s.handlerAddress,s.firstChildAddress,s.nativeVisible?1:0,
          s.rect.left,s.rect.top,s.rect.right,s.rect.bottom])].join(':'),
      diagnosticEpoch:u32(108),screen,rect:{...dialogRect,inclusive:true},inclusive:true,
      ...(stack.length?{currentDialog:dialog,stack}:{})}:null;
    const pScreen={width:u16(176),height:u16(178)},cx=s16(164),cy=s16(166);
    const presented=(flags&64)&&(u32(180)&1)&&u32(160)&&supported(pScreen)&&cx>=0&&cy>=0?
      {sequence:u32(160),cameraX:cx,cameraY:cy,screen:pScreen}:null;
    return {format:'WVS2',mapEpoch,revision:u32(8),flags,usable,screen,count:bytes[20],modes:bytes[21],
      // Exact pointers, not a lossy hash or count-only identity. The context list
      // is exposed for diagnostics; command submenu changes never alter this key.
      selectionToken:usable?[u32(24),bytes[20],...selected].join(':'):null,
      selectedPointers:selected,contextPointers:contexts,selectionEpoch:u32(24),commands,
      dialogAddress:dialog,modal,presented,cursor:{x:s16(140),y:s16(142)},
      currentCamera:{x:s16(144),y:s16(146)},modalCount:u32(188)};
  }
  const api={parse};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.WarcraftViewStateV16=api;
})(typeof window!=='undefined'?window:globalThis);
