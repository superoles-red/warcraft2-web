/* Pixel-only presentation chart. No simulation, native UI, selection or orders. */
(function(global){
  'use strict';
  const positive = x => Number.isFinite(x)&&x>0;
  function rectangle(value,name){
    if(!value)throw new TypeError(name+' rectangle required');
    const left=value.left??0,top=value.top??0;
    const width=value.width??(value.right-left),height=value.height??(value.bottom-top);
    if(!Number.isFinite(left)||!Number.isFinite(top)||!positive(width)||!positive(height))throw new TypeError('Invalid '+name+' rectangle');
    return Object.freeze({left,top,width,height,right:left+width,bottom:top+height});
  }
  const inside=(r,x,y)=>x>=r.left&&y>=r.top&&x<r.right&&y<r.bottom;
  function intersection(a,b){
    const left=Math.max(a.left,b.left),top=Math.max(a.top,b.top),right=Math.min(a.right,b.right),bottom=Math.min(a.bottom,b.bottom);
    return right>left&&bottom>top?rectangle({left,top,right,bottom},'intersection'):null;
  }
  function affine(source,target,fit){
    if(fit!=='contain'&&fit!=='cover')throw new TypeError('fit must be contain or cover');
    const scale=(fit==='cover'?Math.max:Math.min)(target.width/source.width,target.height/source.height);
    const width=source.width*scale,height=source.height*scale;
    const tx=target.left+(target.width-width)/2-source.left*scale;
    const ty=target.top+(target.height-height)/2-source.top*scale;
    const painted=rectangle({left:source.left*scale+tx,top:source.top*scale+ty,width,height},'painted');
    return Object.freeze({scale,tx,ty,painted});
  }
  function createChart(options){
    const width=options.width,height=options.height;
    if(!positive(width)||!positive(height))throw new TypeError('Positive chart width and height required');
    const source=rectangle(options.source,'source');
    if(source.left!==0||source.top!==0)throw new TypeError('Source surface starts at0,0');
    const bounds=rectangle({left:0,top:0,width,height},'chart');
    const mode=options.mode||'world';
    if(mode!=='world'&&mode!=='native-ui')throw new TypeError('Unknown chart mode');
    const regions=[],ids=new Set();
    function add(id,sourceRect,targetRect,fit,z,kind,interactive,layer,visualSource,hitRects){
      if(typeof id!=='string'||ids.has(id))throw new TypeError('Unique string region id required');
      ids.add(id);
      const s=rectangle(sourceRect,'region source'),target=rectangle(targetRect,'region target');
      if(s.left<0||s.top<0||s.right>source.width||s.bottom>source.height)throw new RangeError('Region outside source surface: '+id);
      if(!Number.isFinite(z))throw new TypeError('Finite region z required');
      const transform=affine(s,target,fit),clip=intersection(target,bounds);
      if(layer!==undefined&&(typeof layer!=='string'||!layer.length))throw new TypeError('Invalid native visual layer');
      const visual=visualSource?rectangle(visualSource,'native visual source'):s;
      const hits=hitRects===undefined?null:Object.freeze(hitRects.map(value=>{
        const hit=rectangle(value,'native hit');
        if(hit.left<s.left||hit.top<s.top||hit.right>s.right||hit.bottom>s.bottom)
          throw new RangeError('Hit rectangle outside region: '+id);
        return hit;
      }));
      regions.push(Object.freeze({id,kind,source:s,visualSource:visual,target,fit,z,index:regions.length,interactive:interactive!==false,layer,hits,
        transform,visible:clip&&intersection(clip,transform.painted)}));
    }
    if(mode==='native-ui'){
      add('native-ui',source,bounds,'contain',0,'native-ui',true);
    }else{
      const world=rectangle(options.world,'native world');
      add('map',world,options.map?.target||bounds,options.map?.fit||'contain',0,'world',true,options.map?.layer);
      for(const item of options.regions||[])add(item.id,item.source,item.target,item.fit||'contain',item.z??10,'native-ui',item.interactive,item.layer,item.visualSource,item.hitRects);
    }
    regions.sort((a,b)=>a.z-b.z||a.index-b.index);
    const byId=new Map(regions.map(r=>[r.id,r]));
    function sourceToPresentation(id,x,y){
      const r=byId.get(id);if(!r||!Number.isFinite(x)||!Number.isFinite(y))return null;
      const p={x:x*r.transform.scale+r.transform.tx,y:y*r.transform.scale+r.transform.ty};
      return {...p,visible:inside(r.source,x,y)&&!!r.visible&&inside(r.visible,p.x,p.y)};
    }
    function presentationToSource(x,y){
      if(!Number.isFinite(x)||!Number.isFinite(y)||!inside(bounds,x,y))return null;
      for(let i=regions.length-1;i>=0;i--){
        const r=regions[i];if(!r.visible||!inside(r.visible,x,y))continue;
        const nativeX=(x-r.transform.tx)/r.transform.scale,nativeY=(y-r.transform.ty)/r.transform.scale;
        if(r.hits&&!r.hits.some(hit=>inside(hit,nativeX,nativeY)))continue;
        if(!r.interactive)return {regionId:r.id,kind:'blocked'};
        if(inside(r.source,nativeX,nativeY))return {regionId:r.id,kind:r.kind,x:nativeX,y:nativeY};
      }
      return null;
    }
    function clientTransform(clientRect){
      const r=rectangle(clientRect,'client');
      // Browser layout can round a fractional aspect by one CSS pixel. Larger
      // distortion invalidates input instead of guessing differentX/Y scales.
      const scale=Math.min(r.width/width,r.height/height);
      if(Math.abs(r.width-width*scale)>1||Math.abs(r.height-height*scale)>1)return null;
      return affine(bounds,r,'contain');
    }
    function clientToSource(x,y,clientRect){
      const t=clientTransform(clientRect);if(!t)return null;
      return presentationToSource((x-t.tx)/t.scale,(y-t.ty)/t.scale);
    }
    function sourceToClient(id,x,y,clientRect){
      const p=sourceToPresentation(id,x,y),t=clientTransform(clientRect);if(!p||!t)return null;
      return {x:p.x*t.scale+t.tx,y:p.y*t.scale+t.ty,visible:p.visible};
    }
    function render(context,frame,{clear=true,background='#000',layers={}}={}){
      if(!context||typeof context.drawImage!=='function')throw new TypeError('2D rendering context required');
      if(frame.width!==source.width||frame.height!==source.height)throw new RangeError('Frame/source geometry mismatch; wait for fresh native geometry');
      const output=context.canvas;
      const scale=Math.min(output.width/width,output.height/height);
      if(!positive(scale))throw new RangeError('Empty presentation canvas');
      if(Math.abs(output.width-width*scale)>1||Math.abs(output.height-height*scale)>1)throw new RangeError('Presentation backing store must keep the chart aspect ratio');
      const tx=(output.width-width*scale)/2,ty=(output.height-height*scale)/2;
      context.save();
      try{
        context.setTransform(1,0,0,1,0,0);
        if(clear){context.fillStyle=background;context.fillRect(0,0,output.width,output.height);}
        context.setTransform(scale,0,0,scale,tx,ty);
        context.imageSmoothingEnabled=false;
        for(const r of regions){
          if(!r.visible)continue;
          context.save();
          try{
            context.beginPath();context.rect(r.visible.left,r.visible.top,r.visible.width,r.visible.height);context.clip();
            const t=r.transform,s=r.source;
            // Native foreground layers retain the same input chart while their
            // compact pixels use an independent image origin.
            const pixels=r.layer?layers[r.layer]:frame;
            const visual=r.visualSource;
            if(!pixels||visual.right>pixels.width||visual.bottom>pixels.height)throw new RangeError('Native visual layer not ready: '+r.id);
            context.drawImage(pixels,visual.left,visual.top,visual.width,visual.height,t.painted.left,t.painted.top,t.painted.width,t.painted.height);
          }finally{context.restore();}
        }
      }finally{context.restore();}
    }
    return Object.freeze({width,height,source,mode,regions:Object.freeze(regions),
      provenance:options.provenance||null,sourceToPresentation,presentationToSource,clientToSource,sourceToClient,render});
  }
  function createFrameCopier(createCanvas){
    let canvas=null,context=null,sequence=0;
    const factory=createCanvas||((width,height)=>{
      if(typeof global.OffscreenCanvas==='function')return new global.OffscreenCanvas(width,height);
      const result=global.document.createElement('canvas');result.width=width;result.height=height;return result;
    });
    return Object.freeze({capture(source){
      if(!Number.isInteger(source?.width)||!Number.isInteger(source?.height)||source.width<=0||source.height<=0)throw new TypeError('Readable source frame required');
      if(!canvas){canvas=factory(source.width,source.height);context=canvas.getContext('2d');}
      if(!context)throw new Error('2D frame copy unavailable');
      if(canvas.width!==source.width)canvas.width=source.width;
      if(canvas.height!==source.height)canvas.height=source.height;
      context.save();
      try{context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0);}
      finally{context.restore();}
      sequence++;
      return {frame:canvas,sequence,width:canvas.width,height:canvas.height};
    }});
  }
  const api={createChart,createFrameCopier};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.WarcraftPresentation=api;
})(typeof window!=='undefined'?window:globalThis);
