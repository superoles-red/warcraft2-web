/* One authoritative original background, captured before the first modal paint. */
(function(global){
  'use strict';
  function parse(bytes){
    if(!ArrayBuffer.isView(bytes)||bytes.byteLength<96)throw new RangeError('Truncated WBG1');
    const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=n=>d.getUint32(n,true),
      h=n=>d.getUint16(n,true),s=n=>d.getInt16(n,true);
    if(u(0)!==0x31474257||u(4)!==bytes.byteLength||u(88)||u(92))throw new RangeError('Invalid WBG1 header');
    const width=h(16),height=h(18),epoch=u(48),status=u(80),flags=u(12);
    const result={format:'WBG1',usable:false,revision:u(8),sceneEpoch:epoch,status,flags,
      failedAddress:u(84),screen:{width,height}};
    if(bytes.byteLength===96){if(flags!==1||status>3)throw new RangeError('Invalid WBG1 pending state');return result;}
    const n=width*height,left=s(24),top=s(26),w=h(28),hh=h(30);
    if(flags!==15||status!==2||!epoch||!u(52)||width<640||width>1920||height<480||height>1536||
      width%32||height%32||u(32)!==96||u(36)!==96+n||u(40)!==n||u(44)!==256||
      bytes.byteLength!==96+n+1024||left<0||top<0||!w||!hh||w%32||hh%32||left+w>width||top+hh>height||
      s(20)<0||s(22)<0||d.getInt32(68,true)!==s(20)*32||d.getInt32(72,true)!==s(22)*32)
      throw new RangeError('Invalid complete WBG1 frame');
    const data=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return {...result,usable:true,cameraX:s(20),cameraY:s(22),captureSequence:u(52),
      world:{left,top,right:left+w,bottom:top+hh},indices:data.subarray(96,96+n),
      palette:data.subarray(96+n),dialogRoot:u(56),firstModalScene:u(60)};
  }
  function createPainter(){
    let canvas=null,ctx=null,image=null,words=null,key=null;
    const colors=new Uint8Array(1024),palette=new Uint32Array(colors.buffer);
    return {paint(packet, region){
      if(!packet?.usable)return null;
      const {width,height}=packet.screen;
      const {left=0,top=0,right=width,bottom=height}=region??{};
      const next=[packet.sceneEpoch,packet.revision,packet.paletteRevision,left,top,right,bottom].join(':');
      if(key===next)return canvas;
      if(!canvas){canvas=global.document.createElement('canvas');ctx=canvas.getContext('2d');}
      if(canvas.width!==width)canvas.width=width;
      if(canvas.height!==height)canvas.height=height;
      if(!image||image.width!==right-left||image.height!==bottom-top){
        image=ctx.createImageData(right-left,bottom-top);
        words=new Uint32Array(image.data.buffer);
      }
      for(let i=0;i<256;i++){colors[i*4]=packet.palette[i*4];colors[i*4+1]=packet.palette[i*4+1];
        colors[i*4+2]=packet.palette[i*4+2];colors[i*4+3]=255;}
      if(left===0&&right===width){
        const offset=top*width;
        for(let i=0;i<words.length;i++)words[i]=palette[packet.indices[offset+i]];
      }else{
        for(let y=top,i=0;y<bottom;y++){
          const row=y*width;
          for(let x=left;x<right;x++)words[i++]=palette[packet.indices[row+x]];
        }
      }
      ctx.putImageData(image,left,top);key=next;return canvas;
    },reset(){key=null;}};
  }
  const api={parse,createPainter};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.WarcraftBootstrapBackgroundV16=api;
})(typeof window!=='undefined'?window:globalThis);
