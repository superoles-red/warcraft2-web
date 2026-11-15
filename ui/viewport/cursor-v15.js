/* Original cursor IMAGE + exact native palette, presented as one browser cursor. */
(function(global){
  'use strict';
  function parse(bytes){
    if(!ArrayBuffer.isView(bytes)||bytes.byteLength<1088||bytes.byteLength>33856)throw new RangeError('Invalid WCR1 size');
    const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=n=>d.getUint32(n,true);
    const width=d.getUint16(16,true),height=d.getUint16(18,true),n=width*height,flags=u(12);
    if(u(0)!==0x31524357||u(4)!==bytes.byteLength||(flags&~31)||!width||!height||width>128||height>128||
      u(36)!==64||u(40)!==64+n||u(44)!==64+n*2||u(48)!==256||u(52)!==n||u(60)!==0||
      bytes.byteLength!==64+n*2+1024)throw new RangeError('Invalid WCR1 geometry');
    const b=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),indices=b.slice(64,64+n),alpha=b.slice(64+n,64+n*2);
    for(let i=0;i<n;i++)if(alpha[i]!== (indices[i]===0?0:255))throw new RangeError('WCR1 alpha differs from native IMAGE transparency');
    return {format:'WCR1',usable:(flags&27)===27,visible:!!(flags&4),flags,revision:u(8),width,height,
      hotX:d.getInt16(20,true),hotY:d.getInt16(22,true),indices,alpha,palette:b.slice(64+n*2)};
  }
  function createPresenter(setCursor=(element,value)=>{element.style.cursor=value||'';}){
    let revision=null,style=null;
    return {update(packet,element){
      if(!element)return false;
      if(!packet?.usable){setCursor(element,null);revision=null;style=null;return false;}
      const key=[packet.revision,packet.visible].join(':');
      if(key===revision)return true;
      if(!packet.visible){style='none';setCursor(element,style);revision=key;return true;}
      const padX=Math.max(0,-packet.hotX),padY=Math.max(0,-packet.hotY);
      const width=Math.max(packet.width+padX,packet.hotX+padX+1),height=Math.max(packet.height+padY,packet.hotY+padY+1);
      if(width>128||height>128){setCursor(element,null);revision=null;style=null;return false;}
      const canvas=global.document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
      for(let y=0;y<packet.height;y++)for(let x=0;x<packet.width;x++){
        const i=y*packet.width+x,p=packet.indices[i]*4,j=((y+padY)*width+x+padX)*4;
        image.data[j]=packet.palette[p];image.data[j+1]=packet.palette[p+1];image.data[j+2]=packet.palette[p+2];image.data[j+3]=packet.alpha[i];
      }
      ctx.putImageData(image,0,0);style='url("'+canvas.toDataURL('image/png')+'") '+
        (packet.hotX+padX)+' '+(packet.hotY+padY)+', default';
      setCursor(element,style);revision=key;return true;
    }};
  }
  const api={parse,createPresenter};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.WarcraftCursorV15=api;
})(typeof window!=='undefined'?window:globalThis);
