/* Pixel-only native modal presentation. No menu controls, game callbacks or DOM. */
(function (global, factory) {
  'use strict';
  const api=factory(global);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else global.WarcraftModalPresentationV15=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(global){
  'use strict';
  const finite=Number.isFinite,positive=n=>finite(n)&&n>0;
  const freezeRect=r=>Object.freeze({...r,right:r.left+r.width,bottom:r.top+r.height});
  function inside(r,x,y){return x>=r.left&&y>=r.top&&x<r.right&&y<r.bottom;}
  function contain(source,width,height,maxScale=Infinity,margin=0){
    const scale=Math.min(maxScale,(width-margin*2)/source.width,(height-margin*2)/source.height);
    if(!positive(scale))return null;
    return freezeRect({left:(width-source.width*scale)/2,top:(height-source.height*scale)/2,
      width:source.width*scale,height:source.height*scale,scale});
  }
  function defaultCanvas(width,height){
    if(typeof global.OffscreenCanvas==='function')return new global.OffscreenCanvas(width,height);
    if(!global.document)throw new TypeError('Canvas factory required outside a browser');
    const c=global.document.createElement('canvas');c.width=width;c.height=height;return c;
  }
  /** Normalized readonly native contract, not a guessed dialog rectangle:
   * {format:'WMD1',usable:true,flags:15,token:<nonzero uint32>,
   *  screen:{width,height},rect:{left,top,right,bottom,inclusive:true}}.
   * Producer must verify current native dialog root/scene and complete bounds.
   * An independently known expectedToken can reject a stale previous dialog.
   * Optional stack: currentDialog:<native root>, stack:[{scene:2..5,root,
   * nativeVisible:<explicit boolean>,rect:<inclusive LTRB>}]. WVS1 producer
   * verifies active scene low byte !=0, matching registry/painter/root/bounds;
   * rootFlags08 is NOT a scene visibility test. Original paint order5..2.
   * This module does not parse WUI1 or infer bounds from native pixels/children.
   */
  function nativeRectangle(packet,frame,expectedToken){
    if(packet?.format!=='WMD1'||packet.usable!==true||packet.flags!==15)return null;
    if(!Number.isInteger(packet.token)||packet.token<=0||packet.token>0xffffffff)return null;
    if(expectedToken!==undefined&&packet.token!==expectedToken)return null;
    const s=packet.screen,r=packet.rect;
    if(!s||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<640||s.height<480||
       s.width>1920||s.height>1536||s.width%32||s.height%32||frame?.width!==s.width||frame?.height!==s.height)
      return null;
    if(!r||r.inclusive!==true||![r.left,r.top,r.right,r.bottom].every(Number.isInteger)||
       r.left<0||r.top<0||r.right<r.left||r.bottom<r.top||r.right>=s.width||r.bottom>=s.height)return null;
    return freezeRect({left:r.left,top:r.top,width:r.right-r.left+1,height:r.bottom-r.top+1});
  }
  function nativeLayers(packet,frame,expectedToken){
    const source=nativeRectangle(packet,frame,expectedToken);if(!source)return null;
    if(packet.stack===undefined)return {source,union:source,layers:[{source,scene:null,root:null}]};
    if(!Array.isArray(packet.stack)||!packet.stack.length||packet.stack.length>4||
       !Number.isInteger(packet.currentDialog)||packet.currentDialog<65536||packet.currentDialog>0xffffffff)return null;
    const scenes=new Set(),roots=new Set(),layers=[];
    for(const record of packet.stack){
      if(!record||!Number.isInteger(record.scene)||record.scene<2||record.scene>5||scenes.has(record.scene)||
         !Number.isInteger(record.root)||record.root<65536||record.root>0xffffffff||roots.has(record.root)||
         typeof record.nativeVisible!=='boolean')return null;
      scenes.add(record.scene);roots.add(record.root);
      if(!record.nativeVisible)continue;
      const rect=nativeRectangle({...packet,rect:record.rect},frame,expectedToken);if(!rect)return null;
      layers.push({source:rect,scene:record.scene,root:record.root});
    }
    const top=layers.find(layer=>layer.root===packet.currentDialog);
    if(!top||['left','top','right','bottom'].some(key=>top.source[key]!==source[key]))return null;
    layers.sort((a,b)=>b.scene-a.scene);
    const left=Math.min(...layers.map(l=>l.source.left)),y=Math.min(...layers.map(l=>l.source.top));
    const right=Math.max(...layers.map(l=>l.source.right)),bottom=Math.max(...layers.map(l=>l.source.bottom));
    return {source,union:freezeRect({left,top:y,width:right-left,height:bottom-y}),layers};
  }
  function createPresenter({createCanvas=defaultCanvas,maxScale=1,margin=8}={}){
    if(typeof createCanvas!=='function'||!positive(maxScale)||!finite(margin)||margin<0)
      throw new TypeError('Canvas factory, positive uniform scale and nonnegative margin required');
    let base=null,baseContext=null,layout=Object.freeze({active:false,mode:'native-fallback'});
    const counters={backgroundCaptures:0,modalFrames:0,waitingFrames:0};
    function reset(){base=null;baseContext=null;layout=Object.freeze({active:false,mode:'native-fallback'});}
    /** Capture only the last clean composed WORLD/HUD, BEFORE any cursor overlay.
     * Never pass a frame already containing an original native modal/cursor.
     * The copy is owned; later root rendering cannot overwrite the frozen HUD.
     */
    function captureBackground(frame,{inGame=false,dialogOpen=true}={}){
      if(!inGame||dialogOpen)return false;
      if(!Number.isInteger(frame?.width)||!Number.isInteger(frame?.height)||frame.width<1||frame.height<1)
        throw new TypeError('Nonempty clean presentation frame required');
      if(!base)base=createCanvas(frame.width,frame.height);
      if(!base||typeof base.getContext!=='function')throw new TypeError('Canvas factory returned no canvas');
      if(base.width!==frame.width)base.width=frame.width;if(base.height!==frame.height)base.height=frame.height;
      baseContext=base.getContext('2d');if(!baseContext)throw new TypeError('2D background canvas required');
      baseContext.save();
      try{baseContext.setTransform(1,0,0,1,0,0);baseContext.imageSmoothingEnabled=false;
        baseContext.clearRect(0,0,base.width,base.height);baseContext.drawImage(frame,0,0);
      }finally{baseContext.restore();}
      counters.backgroundCaptures++;return true;
    }
    function plan(frame,{inGame=false,dialogOpen=false,packet=null,expectedToken,width,height,back,fillBackground=false}={}){
      if(!inGame){reset();return layout;}
      if(!dialogOpen){layout=Object.freeze({active:false,mode:'world'});return layout;}
      if(!base){layout=Object.freeze({active:false,mode:'native-fallback',reason:'no-clean-background'});return layout;}
      if(!positive(width)||!positive(height))throw new TypeError('Positive modal presentation dimensions required');
      const background=fillBackground?(() => {
        const scale=Math.max(width/base.width,height/base.height);
        return freezeRect({left:(width-base.width*scale)/2,top:(height-base.height*scale)/2,
          width:base.width*scale,height:base.height*scale,scale});
      })():contain(base,width,height),native=nativeLayers(packet,frame,expectedToken);
      const unionTarget=native?contain(native.union,width,height,maxScale,margin):null;
      const mapRect=source=>freezeRect({left:unionTarget.left+(source.left-native.union.left)*unionTarget.scale,
        top:unionTarget.top+(source.top-native.union.top)*unionTarget.scale,
        width:source.width*unionTarget.scale,height:source.height*unionTarget.scale,scale:unionTarget.scale});
      const ready=!!(native&&unionTarget);
      const backSource=back?.source&&freezeRect(back.source);
      const backScale=back?.marginScale??1;
      let backControl=null;
      if(ready&&back?.image?.naturalWidth&&backSource&&inside(native.source,backSource.left,backSource.top)&&
          inside(native.source,backSource.right-1,backSource.bottom-1)){
        const size=Math.min(80*backScale,width*.23,height*.25),inset=Math.min(12*backScale,size/6);
        backControl={source:backSource, oldTarget:mapRect(backSource),
          target:freezeRect({left:width-size-inset,top:height-size-inset,width:size,height:size})};
      }
      layout=Object.freeze({active:true,mode:ready?'modal':'waiting-native-dialog',
        width,height,background,source:ready?native.source:null,target:ready?mapRect(native.source):null,
        unionSource:ready?native.union:null,unionTarget:ready?unionTarget:null,
        layers:Object.freeze(ready?native.layers.map(layer=>Object.freeze({...layer,target:mapRect(layer.source)})):[]),
        token:ready?packet.token:null,back:backControl,
        reason:ready?null:'missing-stale-or-invalid-native-dialog'});
      return layout;
    }
    function present(context,frame,options={}){
      if(!context?.canvas||typeof context.drawImage!=='function')throw new TypeError('2D output context required');
      const p=plan(frame,{...options,width:context.canvas.width,height:context.canvas.height});
      if(!p.active)return p;
      context.save();
      try{
        context.setTransform(1,0,0,1,0,0);context.imageSmoothingEnabled=false;
        context.fillStyle='#000';context.fillRect(0,0,p.width,p.height);
        const b=p.background;context.drawImage(base,0,0,base.width,base.height,b.left,b.top,b.width,b.height);
        if(p.mode==='modal'){
          const texture=options.panelTexture;
          if(texture?.naturalWidth&&p.unionTarget){
            const t=p.unionTarget,rim=Math.min(8,Math.max(2,Math.round(t.scale*3)));
            context.save();
            context.beginPath();
            context.rect(t.left-rim,t.top-rim,t.width+rim*2,t.height+rim*2);
            context.clip();
            // One original image across the rim keeps the stones continuous.
            context.drawImage(texture,t.left-rim,t.top-rim,t.width+rim*2,t.height+rim*2);
            context.restore();
          }
          for(const layer of p.layers){
            const s=layer.source,t=layer.target;
            context.save();
            try{context.beginPath();context.rect(t.left,t.top,t.width,t.height);context.clip();
              context.drawImage(frame,s.left,s.top,s.width,s.height,t.left,t.top,t.width,t.height);
            }finally{context.restore();}
          }
          if(p.back){
            const old=p.back.oldTarget, arrow=p.back.target;
            // Fit a full-height piece of the original stone to the button
            // gap, with the same scale as the rest of the native panel.
            const s=p.back.source,t=p.target,extra=Math.ceil(2/t.scale);
            const patchW=s.width+extra*2,patchH=s.height+extra*2;
            const sourceY=s.top-patchH-extra;
            context.save();
            context.translate(0,2*(old.top-2));
            context.scale(1,-1);
            context.drawImage(frame,s.left-extra,sourceY,patchW,patchH,
              old.left-2,old.top-2-(old.height+4),old.width+4,old.height+4);
            context.restore();
            const size=arrow.width*.9;
            context.drawImage(options.back.image,arrow.left+(arrow.width-size)/2,
              arrow.top+(arrow.height-size*.95)/2,size,size*.95);
          }
          counters.modalFrames++;
        }else counters.waitingFrames++;
      }finally{context.restore();}
      return p;
    }
    function clientTransform(rect){
      if(!layout.active||!rect||![rect.left,rect.top,rect.width,rect.height].every(finite)||
         !positive(rect.width)||!positive(rect.height))return null;
      const scale=Math.min(rect.width/layout.width,rect.height/layout.height);
      if(!positive(scale)||Math.abs(rect.width-layout.width*scale)>1||Math.abs(rect.height-layout.height*scale)>1)return null;
      return {scale,left:rect.left+(rect.width-layout.width*scale)/2,top:rect.top+(rect.height-layout.height*scale)/2};
    }
    function presentationToSource(x,y){
      if(!layout.active||!finite(x)||!finite(y)||x<0||y<0||x>=layout.width||y>=layout.height)return null;
      if(layout.mode==='modal'&&layout.back){
        const back=layout.back;
        if(inside(back.target,x,y))return {regionId:'native-modal-back',kind:'native-ui',
          x:back.source.left+back.source.width/2,y:back.source.top+back.source.height/2,token:layout.token};
        if(inside(back.oldTarget,x,y))return {regionId:'modal-blocker',kind:'blocked'};
      }
      if(layout.mode!=='modal'||!inside(layout.target,x,y))return {regionId:'modal-blocker',kind:'blocked'};
      const s=layout.source,t=layout.target;
      return {regionId:'native-modal',kind:'native-ui',x:s.left+(x-t.left)/t.scale,y:s.top+(y-t.top)/t.scale,token:layout.token};
    }
    function clientToSource(x,y,rect){
      const t=clientTransform(rect);if(!t||!finite(x)||!finite(y))return null;
      return presentationToSource((x-t.left)/t.scale,(y-t.top)/t.scale);
    }
    function sourceToClient(x,y,rect){
      const c=clientTransform(rect),s=layout.source,t=layout.target;
      if(!c||!s||!t||!finite(x)||!finite(y))return null;
      const back=layout.back;
      if(back&&inside(back.source,x,y))return {x:(back.target.left+back.target.width/2)*c.scale+c.left,
        y:(back.target.top+back.target.height/2)*c.scale+c.top,visible:true,token:layout.token};
      return {x:(t.left+(x-s.left)*t.scale)*c.scale+c.left,
        y:(t.top+(y-s.top)*t.scale)*c.scale+c.top,visible:inside(s,x,y),token:layout.token};
    }
    return Object.freeze({captureBackground,plan,present,clientToSource,presentationToSource,sourceToClient,reset,
      get layout(){return layout;},get hasBackground(){return !!base;},
      debug:()=>Object.freeze({...counters,hasBackground:!!base,layout})});
  }
  return Object.freeze({createPresenter});
});
