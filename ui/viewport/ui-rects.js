/* Own WUR1/WUR2/WUR3 decoder. Native telemetry only; no game actions or DOM hooks. */
(function (global,factory) {
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else global.WarcraftNativeUiRects=api;
})(typeof globalThis!=='undefined'?globalThis:this,function () {
  'use strict';
  const SIZE=1088,SIZE_V2=1352,HEADER=32,RECORD=32,RECORD_V2=40;
  const MAGIC=0x31525557,MAGIC_V2=0x32525557,MAGIC_V3=0x33525557;
  const cancelDescriptors=new Set([0x4a2354,0x4a23f4,0x4a24a8,0x4a2560,
    0x4a37e8,0x4a3800,0x4a3818,0x4a382c,0x4a3840]);
  const flagNames=[[1,'target'],[2,'inGame'],[4,'commandSceneVerified'],[8,'complete'],
    [16,'truncated'],[32,'invalidReadOrRect'],[64,'wrongParentOrType'],[128,'cycle']];
  const hex=value=>'0x'+value.toString(16).padStart(8,'0');
  function view(bytes) {
    if(bytes instanceof ArrayBuffer)return new DataView(bytes);
    if(ArrayBuffer.isView(bytes))return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    throw new TypeError('WUR packet requires an ArrayBuffer or typed-array view');
  }
  function parse(bytes) {
    const d=view(bytes);
    if(d.byteLength<HEADER)throw new RangeError('Truncated WUR header');
    const u16=n=>d.getUint16(n,true),s16=n=>d.getInt16(n,true),u32=n=>d.getUint32(n,true);
    const magic=u32(0),v3=magic===MAGIC_V3,v2=magic===MAGIC_V2||v3;
    const expectedSize=v2?SIZE_V2:SIZE,recordSize=v2?RECORD_V2:RECORD;
    if((magic!==MAGIC&&magic!==MAGIC_V2&&magic!==MAGIC_V3)||d.byteLength!==expectedSize)
      throw new RangeError('Invalid WUR format or byte size');
    const size=u16(4),count=u16(6),revision=u32(8),flags=u32(12),scene=u16(20),walked=u16(22),reserved=u32(28);
    if(size!==expectedSize||count>33||scene!==14||walked>32||reserved!==0||(flags&~255))
      throw new RangeError('Invalid WUR header');
    const screen=Object.freeze({width:u16(16),height:u16(18)}),entries=[];
    for(let i=0;i<count;i++) {
      const p=HEADER+recordSize*i,objectAddress=u32(p),parentAddress=u32(p+4);
      const left=s16(p+16),top=s16(p+18),right=s16(p+20),bottom=s16(p+22);
      if(right<left||bottom<top)throw new RangeError('Invalid WUR inclusive rectangle');
      const extra=v2?{descriptor:hex(u32(p+32)),descriptorAddress:u32(p+32),metadata:u32(p+36),
        commandPresent:!!(u32(p+36)&1),nativeVisible:!!(u32(p+36)&2),
        ...(v3?{isCancel:!!(u32(p+36)&4)}:{})}:{};
      entries.push(Object.freeze({index:i,object:hex(objectAddress),parent:hex(parentAddress),
        objectAddress,parentAddress,id:u16(p+8),type:u16(p+10),flags:hex(u32(p+12)),rawFlags:u32(p+12),
        native:Object.freeze({left,top,right,bottom,width:right-left+1,height:bottom-top+1}),
        local:Object.freeze({left:s16(p+24),top:s16(p+26),right:s16(p+28),bottom:s16(p+30)}),...extra}));
    }
    const root=entries[0]||null,children=Object.freeze(entries.slice(1)),validationErrors=[];
    if(flags===15) {
      if(!root)validationErrors.push('missing-command-root');
      if(screen.width<640||screen.width>1920||screen.height<480||screen.height>1536||screen.width%32||screen.height%32)
        validationErrors.push('invalid-native-frame');
      if(count!==walked+1)validationErrors.push('inconsistent-complete-child-count');
      if(root) {
        const r=root.native;
        if(root.objectAddress<65536||root.parentAddress!==0||root.id!==14||root.type!==0)
          validationErrors.push('invalid-command-root');
        if(r.left<0||r.top<0||r.right>=screen.width||r.bottom>=screen.height)
          validationErrors.push('root-outside-native-frame');
        if(v2&&(root.descriptorAddress!==0||root.metadata!==0))
          validationErrors.push('invalid-root-action-metadata');
        const pointers=new Set([root.objectAddress]);
        for(const child of children) {
          if(child.objectAddress<65536||pointers.has(child.objectAddress)||child.parentAddress!==root.objectAddress||child.type<1||child.type>13)
            validationErrors.push('invalid-direct-child');
          pointers.add(child.objectAddress);
          const a=child.native,l=child.local;
          if(a.left!==r.left+l.left||a.top!==r.top+l.top||a.right!==r.left+l.right||a.bottom!==r.top+l.bottom)
            validationErrors.push('inconsistent-local-to-native-rectangle');
          if(v2) {
            const commandNode=child.id<=8&&child.type===2;
            if((child.metadata&~(v3?7:3))||child.nativeVisible!==!!(child.rawFlags&8)||
                child.commandPresent!==(commandNode&&child.descriptorAddress!==0)||
                (!commandNode&&child.descriptorAddress!==0)||
                (child.descriptorAddress!==0&&child.descriptorAddress<65536))
              validationErrors.push('invalid-child-action-metadata');
            if(v3&&child.isCancel&&(!commandNode||!child.commandPresent||
                !cancelDescriptors.has(child.descriptorAddress)))
              validationErrors.push('invalid-native-cancel-role');
          }
        }
      }
    }
    return Object.freeze({format:v3?'WUR3':v2?'WUR2':'WUR1',bytes:size,count,revision,flags,
      flagNames:Object.freeze(flagNames.filter(([bit])=>flags&bit).map(([,name])=>name)),
      usable:flags===15&&!!root&&validationErrors.length===0,screen,scene,walked,uiThread:u32(24),reserved,
      root,children,entries:Object.freeze(entries),validationErrors:Object.freeze(validationErrors),
      semantics:v3?'LTRB inclusive; WUR3 adds exact native Cancel descriptor identity; no action or affordability logic.':
        v2?'LTRB inclusive; WUR2 exports native command presence/visibility, never affordability or action availability.':
        'LTRB inclusive; width=right-left+1, height=bottom-top+1. IDs/raw flags do not establish command availability.',
      actualNativeIdsVerified:false});
  }
  /**
   * Generic union of caller-specified direct child IDs, plus native-pixel border.
   * There is deliberately no default1..9 command-ID assumption/commandBand API.
   * fullWidth:176 is opt-in and accepted only for a native176px root atX0 whose
   * selected child rectangles fit inside it. right/bottom remain INCLUSIVE.
   */
  function getBand(packet,ids,{border=8,fullWidth=false}={}) {
    if(!packet?.usable||packet.flags!==15||!packet.root)return null;
    if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||
       ids.some(id=>!Number.isInteger(id)||id<0||id>65535))throw new TypeError('Unique explicit native child IDs required');
    if(!Number.isInteger(border)||border<0||border>4096)throw new RangeError('Border must be0..4096 native pixels');
    if(fullWidth!==false&&fullWidth!==176)throw new RangeError('Only explicit fullWidth:176 is supported');
    const selected=[];
    for(const id of ids) {
      const matches=packet.children.filter(child=>child.id===id);
      if(matches.length!==1)return null;
      selected.push(matches[0]);
    }
    const root=packet.root.native,screen=packet.screen;
    let left=Math.min(...selected.map(x=>x.native.left)),top=Math.min(...selected.map(x=>x.native.top));
    let right=Math.max(...selected.map(x=>x.native.right)),bottom=Math.max(...selected.map(x=>x.native.bottom));
    if(fullWidth===176) {
      if(root.left!==0||root.width!==176||left<root.left||right>root.right)return null;
      left=root.left;right=root.right;
    }else {left-=border;right+=border;}
    top-=border;bottom+=border;
    left=Math.max(left,root.left,0);top=Math.max(top,root.top,0);
    right=Math.min(right,root.right,screen.width-1);bottom=Math.min(bottom,root.bottom,screen.height-1);
    if(right<left||bottom<top)return null;
    return Object.freeze({left,top,right,bottom,width:right-left+1,height:bottom-top+1,
      inclusive:true,ids:Object.freeze(ids.slice()),border,fullWidth,source:'native-WUR1-explicit-child-union'});
  }
  return Object.freeze({parse,getBand,byteLength:SIZE,byteLengthV2:SIZE_V2,byteLengthV3:SIZE_V2,actualNativeIdsVerified:false});
});
