/* Pixel-only native modal presentation. No menu controls, game callbacks or DOM. */
(function (global, factory) {
  'use strict';
  const api=factory(global);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else global.WarcraftModalPresentationV15=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(global){
  'use strict';
  const finite=Number.isFinite,positive=n=>finite(n)&&n>0;
  const SLIDER_DIALOGS=new Set([0x441940,0x442050]); // Sound, Speeds
  const OBJECTIVES_ROW=35;
  const BUTTON_HEIGHT=56, BUTTON_GAP=6, PANEL_INSET=16;
  function classicDialogScale(width,height,pixelRatio=1){
    const margin=8*pixelRatio;
    // Reserve enough room for the shared 256px panel and its objectives checkbox.
    // Compacting a panel must not enlarge its remaining text on short screens.
    return Math.min(1.5*pixelRatio,(width-2*margin)/256,(height-2*margin)/(288+OBJECTIVES_ROW));
  }
  function paintSettingsFrame(context,frame,handler,source,target){
    if(!SLIDER_DIALOGS.has(handler)||source.width!==256||source.height!==288)return;
    // The original panels paint a three-pixel bevel on the top and left.
    // Reflect those pixels into the empty right and bottom gutters, including the corners.
    const rim=3;
    const scaleX=target.width/source.width,scaleY=target.height/source.height;
    function copy(width,height,flipX,flipY){
      context.save();
      context.translate(target.left+(flipX?target.width:0),target.top+(flipY?target.height:0));
      context.scale(flipX?-scaleX:scaleX,flipY?-scaleY:scaleY);
      context.drawImage(frame,source.left,source.top,width,height,0,0,width,height);
      context.restore();
    }
    // A taller reflowed footer still uses the native three-pixel bevel.
    if(Math.abs(scaleY-scaleX)>1e-6){
      context.save();
      try{
        context.translate(target.left+target.width,target.top);
        context.scale(-scaleX,1);
        context.drawImage(frame,source.left,source.top,rim,source.height-rim,0,0,rim,target.height-rim*scaleX);
      }finally{context.restore();}
    }else copy(rim,source.height-rim,true,false);
    copy(source.width-rim,rim,false,true);
    copy(rim,rim,true,true);
  }
  const freezeRect=r=>Object.freeze({...r,right:r.left+r.width,bottom:r.top+r.height});
  function inside(r,x,y){return x>=r.left&&y>=r.top&&x<r.right&&y<r.bottom;}
  const paintRect=r=>({x:r.left,y:r.top,w:r.width,h:r.height});
  function paintButtonTexture(context,image,target){
    const {naturalWidth:width,naturalHeight:height}=image;
    const rim=4,scale=Math.min(target.width/width,target.height/height);
    const edge=rim*scale,textureHeight=height-rim*2,step=textureHeight*scale;
    const {left,top,right,bottom}=target;
    context.drawImage(image,0,0,width,rim,left,top,target.width,edge);
    context.drawImage(image,0,height-rim,width,rim,left,bottom-edge,target.width,edge);
    context.save();
    try{
      context.beginPath();context.rect(left,top+edge,right-left,target.height-edge*2);context.clip();
      // Reflect the original full-width interior to fill extra rows at the same pixel scale.
      for(let y=top+edge,reverse=false;y<bottom-edge;y+=step,reverse=!reverse){
        context.save();
        context.translate(0,reverse?y+step:y);
        if(reverse)context.scale(1,-1);
        context.drawImage(image,0,rim,width,textureHeight,left,0,target.width,step);
        context.restore();
      }
    }finally{context.restore();}
  }
  function paintAction(context,frame,{source:s,target:t,blank,button,label,confirmation}) {
    const painter=global.WarcraftAssemblyDialogLayout?.paintTallButton;
    if(!painter){context.drawImage(frame,s.left,s.top,s.width,s.height,t.left,t.top,t.width,t.height);return;}
    const artwork=button?.naturalWidth?button:frame;
    const patch=artwork===frame?paintRect(s):{x:0,y:0,w:button.naturalWidth,h:button.naturalHeight};
    if(confirmation&&artwork===button)paintButtonTexture(context,button,t);
    else painter(context,artwork,patch,paintRect(t),blank);
    if(label){
      const w=(label.naturalWidth||label.width)*t.scale,h=(label.naturalHeight||label.height)*t.scale;
      context.drawImage(label,t.left+(t.width-w)/2,t.top+(t.height-h)/2,w,h);
    }
  }
  const MENU_HEADINGS={pause:32,'two-actions':32,end:32,confirmation:89};
  // Generic native modals retain every body row. Replace only a slice whose
  // complete, validated button row can grow without scaling its neighbours.
  function nativeButtonBands(source, controls) {
    const bands=[];
    for(const control of controls){
      const s=control.source;
      if(!inside(source,s.left,s.top)||!inside(source,s.left+s.width-1,s.top+s.height-1))return [];
      const start=s.top-source.top,end=start+s.height;
      if(bands.some(b=>start<b.end&&end>b.start&&(start!==b.start||end!==b.end)))return [];
      let band=bands.find(b=>b.start===start&&b.end===end);
      if(!band){band={start,end,controls:[]};bands.push(band);}
      band.controls.push(control);
    }
    for(const band of bands){
      band.controls.sort((a,b)=>a.source.left-b.source.left);
      if(band.controls.some(({source:s},i)=>i>0&&s.left<band.controls[i-1].source.left+band.controls[i-1].source.width))
        return [];
    }
    return bands.sort((a,b)=>a.start-b.start);
  }
  function contain(source,width,height,maxScale=Infinity,margin=0,left=margin,right=margin){
    const scale=Math.min(maxScale,(width-left-right)/source.width,(height-margin*2)/source.height);
    if(!positive(scale))return null;
    return freezeRect({left:left+(width-left-right-source.width*scale)/2,top:(height-source.height*scale)/2,
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
      layers.push({source:rect,scene:record.scene,root:record.root,handlerAddress:record.handlerAddress});
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
    function plan(frame,{inGame=false,dialogOpen=false,packet=null,expectedToken,width,height,back,
        fillBackground=false,leftInset=0,rightInset=0,dialogPixelRatio=0,objectivesBodyEnd}={}){
      if(!inGame){reset();return layout;}
      if(!dialogOpen){layout=Object.freeze({active:false,mode:'world'});return layout;}
      if(!base){layout=Object.freeze({active:false,mode:'native-fallback',reason:'no-clean-background'});return layout;}
      if(back?.waiting){layout=Object.freeze({active:false,mode:'waiting-native-dialog',reason:'native-layout-not-ready'});return layout;}
      if(!positive(width)||!positive(height)||![leftInset,rightInset].every(n=>finite(n)&&n>=0))
        throw new TypeError('Positive modal dimensions and nonnegative side insets required');
      const background=fillBackground?(() => {
        const scale=Math.max(width/base.width,height/base.height);
        return freezeRect({left:(width-base.width*scale)/2,top:(height-base.height*scale)/2,
          width:base.width*scale,height:base.height*scale,scale});
      })():contain(base,width,height),native=nativeLayers(packet,frame,expectedToken);
      const compact=back?.compact&&native?.source.width===256&&native?.source.height===288
        ? MENU_HEADINGS[back.compact] : 0;
      const objectives=native?.layers.length===1&&native.layers[0].handlerAddress===0x4353a0&&
        native.source.width===256&&native.source.height===288;
      const soundLayout=global.WarcraftAssemblyDialogLayout;
      const preferences=native?.layers.length===1&&native.layers[0].handlerAddress===0x441940&&
        native.source.width===256&&native.source.height===288&&!!back?.ok&&!!soundLayout?.soundRows;
      const widePreferences=preferences&&width>=height;
      const sourceWidth=widePreferences?512:native?.union.width;
      const objectiveControl=objectives&&back?.controls?.find(({id,source})=>
        id===-3&&source.left===native.source.left+16&&source.top===native.source.top+248&&source.width===224);
      const objectiveControls=objectiveControl?[objectiveControl]:[];
      const generic=!!(native?.layers.length===1&&!compact&&!objectives&&!preferences);
      const nativeControls=back?.controls??[];
      const genericBands=generic?nativeButtonBands(native.source,nativeControls):[];
      const genericBack=generic&&!!back?.source&&!!back.image?.naturalWidth;
      const objectiveFooter=245;
      const objectiveBody=Number.isInteger(objectivesBodyEnd)&&objectivesBodyEnd>=94&&
        objectivesBodyEnd<=objectiveFooter?objectivesBodyEnd:objectiveFooter;
      const rows=objectives?objectiveControls.length+1:preferences?(widePreferences?4:6):
        compact?nativeControls.length+1:genericBands.length+Number(genericBack);
      const bodyHeight=objectives?objectiveBody+288-objectiveFooter-28*objectiveControls.length:
        preferences?(widePreferences?134:176):
        compact?compact+16+rows*BUTTON_GAP:
        native?.union.height-genericBands.reduce((total,band)=>total+band.end-band.start,0)+(genericBack?PANEL_INSET:0);
      const scaleMargin=8*dialogPixelRatio;
      const classicMax=dialogPixelRatio&&native?.source.width===256&&native.source.height<=288
        ? classicDialogScale(width-Math.max(0,leftInset-scaleMargin)-Math.max(0,rightInset-scaleMargin),height,dialogPixelRatio)
        : maxScale;
      const left=Math.max(margin,leftInset),right=Math.max(margin,rightInset),availableHeight=height-2*margin;
      const menuButtonHeight=global.WarcraftAssemblyDialogLayout?.menuButtonHeight;
      // Keep the uniform scale of native labels and reserve the shared CSS
      // button height separately. Very crowded generic dialogs may need to fit.
      const fixedHeight=(rows||back?.source)&&dialogPixelRatio&&menuButtonHeight
        ? Math.min(menuButtonHeight(width/dialogPixelRatio,height/dialogPixelRatio)*dialogPixelRatio,
          availableHeight*.74/Math.max(1,rows)) : 0;
      const fitScale=native?Math.min(maxScale,classicMax,(width-left-right)/sourceWidth,
        (availableHeight-rows*fixedHeight)/(bodyHeight+(fixedHeight?0:rows*BUTTON_HEIGHT))):0;
      const buttonHeight=fixedHeight&&positive(fitScale)?fixedHeight/fitScale:BUTTON_HEIGHT;
      const bounds=native?{width:sourceWidth,height:bodyHeight+rows*buttonHeight}:null;
      const unionTarget=native?contain(bounds,width,height,fitScale,margin,left,right):null;
      const mapRect=source=>freezeRect({left:unionTarget.left+(source.left-native.union.left)*unionTarget.scale,
        top:unionTarget.top+(source.top-native.union.top)*unionTarget.scale,
        width:source.width*unionTarget.scale,height:source.height*unionTarget.scale,scale:unionTarget.scale});
      const ready=!!(native&&unionTarget);
      let strips=null,actions=[];
      let objectivesCheckbox=null,objectivesStone=null,preferencesBody=null;
      function sourceSlice(start,end,top){
        const {source}=native,t=unionTarget,scale=t.scale,height=end-start;
        return Object.freeze({source:freezeRect({...source,top:source.top+start,height}),
          target:freezeRect({left:t.left,top,width:t.width,height:height*scale,scale})});
      }
      function button(control,left,top,width=control.source.width){
        const scale=unionTarget.scale;
        return {...control,source:freezeRect(control.source),target:freezeRect({left,top,
          width:width*scale,height:buttonHeight*scale,scale:width*scale/control.source.width})};
      }
      if(ready&&preferences){
        const {source}=native,t=unionTarget,{scale}=t;
        const height=buttonHeight*scale;
        const sound=soundLayout.soundRows({left:t.left,top:t.top+28*scale,width:t.width,
          scale,height,landscape:widePreferences,match:true});
        const nativeRect=([x,y,w,h])=>freezeRect({left:source.left+x,top:source.top+y,width:w,height:h});
        const visualRect=({x,y,w,h})=>freezeRect({left:x,top:y,width:w,height:h});
        strips=sound.controls.map(row=>Object.freeze({...row,source:nativeRect(row.source),target:visualRect(row.target)}));
        const fog=visualRect(sound.fog);
        preferencesBody=Object.freeze({fog,speed:freezeRect({left:t.left+12*scale,
          top:fog.bottom+8*scale,width:t.width-24*scale,height:height+22*scale})});
      }
      if(ready&&objectives){
        // Preserve all original body pixels and native footer click geometry.
        // The inserted checkbox row belongs to the web overlay.
        const {source}=native,{scale}=unionTarget;
        const body=freezeRect({...source,height:objectiveBody});
        const footerTop=objectiveBody+buttonHeight;
        const bodyTarget=mapRect(body);
        strips=[
          Object.freeze({source:body,target:bodyTarget}),
          sourceSlice(objectiveFooter,objectiveControls.length?248:288,unionTarget.top+footerTop*scale),
        ];
        if(objectiveControls.length){
          actions=objectiveControls.map(control=>button(control,unionTarget.left+PANEL_INSET*scale,
            unionTarget.top+(footerTop+3)*scale));
          strips.push(sourceSlice(276,288,unionTarget.bottom-12*scale));
        }
        objectivesStone={source:freezeRect({...source,top:source.top+objectiveBody-5,height:5}),
          target:freezeRect({left:unionTarget.left,top:bodyTarget.bottom,width:unionTarget.width,height:buttonHeight*scale})};
        objectivesCheckbox=freezeRect({left:unionTarget.left+16*scale,top:objectivesStone.target.top,
          width:224*scale,height:buttonHeight*scale,scale});
      }else if(ready&&compact){
        const t=unionTarget, scale=t.scale;
        strips=[sourceSlice(0,compact,t.top),sourceSlice(284,288,t.bottom-4*scale)];
        actions=nativeControls.map((control,index)=>button(control,t.left+(256-control.source.width)/2*scale,
          t.top+(compact+8+index*(buttonHeight+BUTTON_GAP))*scale));
      }else if(ready&&(genericBands.length||genericBack)){
        const t=unionTarget,scale=t.scale;
        strips=[];
        let offset=0,top=t.top;
        for(const band of genericBands){
          if(offset<band.start){
            const strip=sourceSlice(offset,band.start,top);
            strips.push(strip);top=strip.target.bottom;
          }
          let left=native.source.left;
          const row=native.source.top+band.start;
          const gutterTop=top+(buttonHeight-band.end+band.start)*scale/2;
          function gutter(right){
            if(right<=left)return;
            const s=freezeRect({left,top:row,width:right-left,height:band.end-band.start});
            strips.push({source:s,target:freezeRect({left:t.left+(left-native.source.left)*scale,
              top:gutterTop,width:s.width*scale,height:s.height*scale,scale})});
          }
          for(const control of band.controls){
            const s=control.source;
            gutter(s.left);
            actions.push(button(control,t.left+(s.left-native.source.left)*scale,top));
            left=s.left+s.width;
          }
          gutter(native.source.right);
          top+=buttonHeight*scale;offset=band.end;
        }
        if(offset<native.source.height)strips.push(sourceSlice(offset,native.source.height,top));
      }
      const backSource=back?.source&&freezeRect(back.source);
      let backControl=null,okControl=null,restart=null,confirmation=null;
      if(ready&&compact&&back?.confirmation){
        const t=unionTarget,scale=t.scale;
        confirmation={ok:{source:freezeRect(back.confirmation.ok),
          target:freezeRect({left:t.left+PANEL_INSET*scale,top:t.bottom-(PANEL_INSET+buttonHeight)*scale,
            width:106*scale,height:buttonHeight*scale,scale})}};
      }
      if(ready&&back?.image?.naturalWidth&&backSource&&inside(native.source,backSource.left,backSource.top)&&
          inside(native.source,backSource.right-1,backSource.bottom-1)){
        const panel=strips?unionTarget:mapRect(native.source),scale=panel.scale;
        const strip=strips?.find(({source})=>inside(source,backSource.left,backSource.top)&&
          inside(source,backSource.right-1,backSource.bottom-1));
        const oldTarget=strip?freezeRect({left:strip.target.left+(backSource.left-strip.source.left)*scale,
          top:strip.target.top+(backSource.top-strip.source.top)*scale,width:backSource.width*scale,
          height:backSource.height*scale,scale}):mapRect(backSource);
        const size=buttonHeight*scale;
        const left=panel.right-size-PANEL_INSET*scale;
        const top=panel.bottom-(PANEL_INSET+buttonHeight)*scale;
        const target=freezeRect({left,top,width:size,height:size});
        backControl={source:backSource,oldTarget,replaceButton:!compact&&!preferences,target};
        if(preferences&&nativeControls.length){
          okControl=button(nativeControls[0],panel.left+PANEL_INSET*scale,top);
          actions=[okControl];
        }
      }
      if(ready&&compact&&back?.restartId!==undefined)restart=actions.find(action=>action.id===back.restartId);
      layout=Object.freeze({active:true,mode:ready?'modal':'waiting-native-dialog',
        width,height,background,source:ready?native.source:null,target:ready?(strips?unionTarget:mapRect(native.source)):null,
        unionSource:ready?native.union:null,unionTarget:ready?unionTarget:null,
        layers:Object.freeze(ready?native.layers.map(layer=>Object.freeze({...layer,target:mapRect(layer.source)})):[]),
        strips:strips&&Object.freeze(strips),
        objectivesCheckbox,objectivesStone,preferencesBody,ok:okControl,restart,confirmation,actions:Object.freeze(actions),
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
          for(const layer of p.strips||p.layers){
            const s=layer.source,t=layer.target;
            if(p.preferencesBody){
              const rows=global.WarcraftAssemblyDialogLayout;
              if(layer.label){
                const [x,y,w,h]=layer.label,l=layer.labelBox;
                rows.paintControlInk(context,frame,{x:p.source.left+x,y:p.source.top+y,w,h},l);
                const [a,b,c,d]=layer.help,help=layer.helpBox;
                rows.paintControlInk(context,frame,{x:p.source.left+a,y:p.source.top+b,w:c,h:d},help);
              }
              rows.paintSoundControl(context,frame,{...layer,source:paintRect(s),target:paintRect(t)});
              continue;
            }
            context.save();
            try{context.beginPath();context.rect(t.left,t.top,t.width,t.height);context.clip();
              context.drawImage(frame,s.left,s.top,s.width,s.height,t.left,t.top,t.width,t.height);
              if(layer.root===options.packet?.currentDialog)paintSettingsFrame(context,frame,layer.handlerAddress,s,t);
            }finally{context.restore();}
          }
          if(p.preferencesBody){
            const t=p.unionTarget,s=p.source;
            context.drawImage(frame,s.left,s.top,s.width,3,t.left,t.top,t.width,3*t.scale);
            context.drawImage(frame,s.left,s.top,3,s.height,t.left,t.top,3*t.scale,t.height);
            paintSettingsFrame(context,frame,0x441940,s,t);
          }
          for(const action of p.actions)paintAction(context,frame,action);
          if(p.confirmation){
            const {button,label}=options.back.confirmation;
            paintAction(context,frame,{...p.confirmation.ok,button,label,confirmation:true});
          }
          if(p.objectivesStone){
            const {source:s,target:t}=p.objectivesStone;
            const texture=options.panelTexture;
            if(texture?.naturalWidth){
              const stoneHeight=texture.naturalWidth*t.height/t.width;
              context.save();
              try{
                // Match the body and footer near each seam using their
                // verified blank strips and keep full stone detail centrally.
                const seam=Math.min(t.height*.2,p.unionTarget.scale*5);
                context.drawImage(texture,0,(texture.naturalHeight-stoneHeight)/2,texture.naturalWidth,stoneHeight,
                  t.left,t.top,t.width,t.height);
                context.globalAlpha=.8;
                context.drawImage(frame,s.left,s.top,s.width,s.height,t.left,t.top,t.width,seam);
                context.drawImage(frame,s.left,p.source.top+245,s.width,3,t.left,t.bottom-seam,t.width,seam);
              }finally{context.restore();}
            }else{
              const step=Math.ceil(t.height/7);
              for(let y=t.top;y<t.bottom;y+=step)context.drawImage(frame,s.left,s.top,s.width,s.height,
                t.left,y,t.width,Math.min(step,t.bottom-y));
            }
          }
          if(p.back){
            if(p.back.replaceButton){
              const old=p.back.oldTarget;
              // Cover the original button using nearby original stone at the same scale.
              const s=p.back.source,t=p.target,extra=Math.ceil(2/t.scale);
              const patchW=s.width+extra*2,patchH=s.height+extra*2;
              const sourceY=s.top-patchH-extra;
              context.drawImage(frame,s.left-extra,sourceY,patchW,patchH,
                old.left-2,old.top-2,old.width+4,old.height+4);
            }
            const arrow=p.back.target;
            context.drawImage(options.back.image,arrow.left,arrow.top,arrow.width,arrow.height);
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
        if(back.replaceButton&&inside(back.oldTarget,x,y))return {regionId:'modal-blocker',kind:'blocked'};
      }
      if(layout.mode==='modal'&&layout.confirmation){
        const {source:s,target:t}=layout.confirmation.ok;
        if(inside(t,x,y))return {regionId:'native-modal',kind:'native-ui',
          x:s.left+(x-t.left)*s.width/t.width,y:s.top+(y-t.top)*s.height/t.height,token:layout.token};
      }
      const action=layout.actions?.find(({target})=>inside(target,x,y));
      if(layout.mode==='modal'&&action){
        const {source:s,target:t}=action;
        return {regionId:'native-modal',kind:'native-ui',x:s.left+(x-t.left)*s.width/t.width,
          y:s.top+(y-t.top)*s.height/t.height,token:layout.token};
      }
      if(layout.mode!=='modal'||!inside(layout.target,x,y))return {regionId:'modal-blocker',kind:'blocked'};
      const strip=layout.strips?.find(region=>inside(region.target,x,y));
      if(layout.strips&&!strip)return {regionId:'modal-blocker',kind:'blocked'};
      const s=strip?.source||layout.source,t=strip?.target||layout.target;
      return {regionId:'native-modal',kind:'native-ui',x:s.left+(x-t.left)*s.width/t.width,
        y:s.top+(y-t.top)*s.height/t.height,token:layout.token};
    }
    function clientToSource(x,y,rect){
      const t=clientTransform(rect);if(!t||!finite(x)||!finite(y))return null;
      return presentationToSource((x-t.left)/t.scale,(y-t.top)/t.scale);
    }
    function sourceToClient(x,y,rect){
      const c=clientTransform(rect);
      if(!c||!layout.source||!layout.target||!finite(x)||!finite(y))return null;
      const back=layout.back;
      if(back&&inside(back.source,x,y))return {x:(back.target.left+back.target.width/2)*c.scale+c.left,
        y:(back.target.top+back.target.height/2)*c.scale+c.top,visible:true,token:layout.token};
      const action=layout.actions?.find(({source})=>inside(source,x,y));
      if(action){
        const {source:s,target:t}=action;
        return {x:(t.left+(x-s.left)*t.width/s.width)*c.scale+c.left,
          y:(t.top+(y-s.top)*t.height/s.height)*c.scale+c.top,visible:true,token:layout.token};
      }
      if(layout.confirmation){
        const {source:s,target:t}=layout.confirmation.ok;
        if(inside(s,x,y))return {x:(t.left+(x-s.left)*t.width/s.width)*c.scale+c.left,
          y:(t.top+(y-s.top)*t.height/s.height)*c.scale+c.top,visible:true,token:layout.token};
      }
      const strip=layout.strips?.find(region=>inside(region.source,x,y));
      if(layout.strips&&!strip)return null;
      const s=strip?.source||layout.source,t=strip?.target||layout.target;
      return {x:(t.left+(x-s.left)*t.width/s.width)*c.scale+c.left,
        y:(t.top+(y-s.top)*t.height/s.height)*c.scale+c.top,visible:inside(s,x,y),token:layout.token};
    }
    return Object.freeze({captureBackground,plan,present,clientToSource,presentationToSource,sourceToClient,reset,
      get layout(){return layout;},get hasBackground(){return !!base;},
      debug:()=>Object.freeze({...counters,hasBackground:!!base,layout})});
  }
  return Object.freeze({createPresenter,paintSettingsFrame,classicDialogScale});
});
