/* Presentation and inverse input only. All pixels and actions belong to BNE. */
(function (global) {
  'use strict';
  let installed=false,routerInstalled=false,chart=null,visible=false,lastNative=null;
  let output,source,display,input,frame,container,copier,context,foregroundPainter,buildConfirm;
  let hudInsets=Object.freeze({left:4,right:4,bottom:4});
  const confirmSize=Object.freeze({width:116,height:48});
  let keepNativeUntilReady=false;
  const foregroundVersion=new URLSearchParams(location.search).get('bridge');
  const enhancedHud=['v15','v16'].includes(foregroundVersion);
  const coherentFrames=foregroundVersion==='v16';
  const cleanHud=['v13','v14','v15','v16'].includes(foregroundVersion),balancedHud=['v14','v15','v16'].includes(foregroundVersion);
  let camera,modalPresenter,cursorPresenter,lastScene=null,selectedCommand=null,animation=null,lastDialogToken=null;
  let bootstrapPainter,nativeFramePainter,visibleFramePainter,lastMapEpoch=null,lastRenderedGeometry=null;
  let bootstrapCanvas,onPresented,onUnavailable,acceptsInput,modalBack;
  let bootstrapInUse=false,bootstrapPaletteKey=null;
  let cleanWorldReady=false,commandHighlight,lastWorldPaint=null,frozenWorld=null;
  let modalBackgroundWidth=0,modalBackgroundHeight=0,modalBackgroundDpr=0,modalBackgroundInsets=null;
  const performanceStats={reusedWorldFrames:0};
  let cropX=0,cropY=0,cropKey='';
  let minimapDrag=false;
  const held=new Set();
  const telemetry={frames:0,mode:'native',errors:[],geometry:null};
  const nativeButton=button=>button===2?1:button===1?2:button;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const nativeGeometry=()=>global.WarcraftUiBridge?.viewportSnapshot?.()||null;
  function setVisible(value) {
    if(!value){
      onUnavailable?.();
      cleanWorldReady=false;
      lastWorldPaint=frozenWorld=null;
      if(commandHighlight)commandHighlight.hidden=true;
    }
    if(value===visible)return;
    cancelButtons();
    global.WarcraftDuneControls?.cancel?.();
    visible=value;document.body.classList.toggle('full-map-active',value);
    output.hidden=!value;display.classList.toggle('warcraft-native-occluded',value);
    if(display===source)source.style.opacity=value?'0':'';
    chart=null;telemetry.mode=value?'world':'native';
  }
  function updateBuildConfirm(state, mode) {
    if(!buildConfirm)return;
    const target=global.WarcraftDuneControls?.buildingTarget;
    buildConfirm.hidden=mode!=='world'||!state.buildingPending||state.inputAllowed===false;
    const native=target&&global.WarcraftFullMap.globalToWorld(target.x,target.y);
    const bounds=lastRenderedGeometry?.world;
    buildConfirm.disabled=buildConfirm.hidden||!target||target.submitted||!native||!bounds||
      native.x<bounds.left||native.x>=bounds.right||native.y<bounds.top||native.y>=bounds.bottom;
  }
  function croppedWorld(g,width,height) {
    const w=g.world.right-g.world.left,h=g.world.bottom-g.world.top,aspect=width/height;
    const shownW=Math.min(w,h*aspect),shownH=Math.min(h,w/aspect);
    const extraX=w-shownW,extraY=h-shownH;
    const key=[g.width,g.height,g.world.left,g.world.top,w,h,width,height].join(',');
    if(key!==cropKey){cropKey=key;cropX=extraX/2;cropY=extraY/2;}
    const x=g.maxX>0?extraX*clamp(g.cameraX/g.maxX,0,1):clamp(cropX,0,extraX);
    const y=g.maxY>0?extraY*clamp(g.cameraY/g.maxY,0,1):clamp(cropY,0,extraY);
    return {left:g.world.left+x,top:g.world.top+y,width:shownW,height:shownH,extraX,extraY};
  }
  function commandBand(g,packet=global.WarcraftUiBridge?.uiRects?.()) {
    if(packet?.usable)return global.WarcraftNativeUiRects.getBand(packet,[0,1,2,3,4,5,6,7,8],{border:8,fullWidth:176});
    // Classic fixed-height source geometry has an independent original receipt.
    return g.height===480?{left:0,top:336,width:176,height:144}:null;
  }
  function regions(width,height,g,commands) {
    // Complete live native bands remain available while command layout is refined.
    const s=Math.min(1.25,Math.max(.85,Math.min(width/720,height/600)));
    const menuW=88*s,topH=24*s,sideW=176*s,miniH=140*s,infoH=172*s;
    const resourceW=Math.max(1,width-menuW-16),resourceH=Math.min(topH,resourceW*16/464);
    return [
      {id:'menu',source:{left:0,top:0,width:88,height:24},target:{left:4,top:0,width:menuW,height:topH}},
      {id:'resources',source:{left:176,top:0,width:464,height:16},target:{left:menuW+8,top:0,width:resourceW,height:resourceH}},
      {id:'minimap',source:{left:0,top:24,width:176,height:140},target:{left:width-sideW,top:topH,width:sideW,height:miniH}},
      {id:'info',source:{left:0,top:164,width:176,height:172},target:{left:width-sideW,top:topH+miniH,width:sideW,height:infoH}},
      {id:'commands',source:commands,target:{left:0,top:height-commands.height*s-16*s,width:commands.width*s,height:commands.height*s}},
      {id:'status',source:{left:176,top:g.height-16,width:g.width-176,height:16},target:{left:0,top:height-16*s,width:width,height:16*s}},
    ];
  }
  function cleanRegions(width,height,g,packet,foreground,state) {
    const scale=Math.min(1.25,Math.max(1,Math.min(width/720,height/600)));
    const commands=global.WarcraftHudLayout.createCommandRegions(packet,
      {left:4,top:height-16*scale-140*scale-4,scale});
    if(!commands)return null;
    const resources=foreground.fields.map(field=>({id:'resource-'+field.id,source:field.source}));
    const header=global.WarcraftHudLayout.createHeaderLayout(resources,
      {width:width-8,left:4,top:2,menuScale:1.6,resourceScale:1.5,gap:6});
    const miniSize=Math.max(144,128*scale),miniTop=header.height+6;
    const result=header.regions.map(region=>region.id==='menu'?region:{...region,layer:'native-hud-foreground'});
    result.push(global.WarcraftHudLayout.createMinimapRegion({left:width-miniSize-4,top:miniTop,size:miniSize}));
    if(state.selectionCount>0)result.push({id:'info',source:{left:0,top:164,width:176,height:172},
      target:{left:width-176*scale-4,top:miniTop+miniSize+4,width:176*scale,height:172*scale}});
    result.push(...commands,{id:'status',source:{left:176,top:g.height-16,width:g.width-176,height:16},
      target:{left:0,top:height-16*scale,width,height:16*scale}});
    return {regions:result,header,commandCount:commands.length};
  }
  function balancedRegions(width,height,g,packet,foreground,state){
    const {left,right,bottom}=hudInsets,rightEdge=width-right;
    const hudWidth=rightEdge-left,lowerEdge=height-bottom;
    const scale=Math.min(1.25,Math.max(1,Math.min((hudWidth+8)/720,height/600)));
    const fields=foreground.fields.map(field=>({id:field.id,
      compact:{source:global.WarcraftHudForeground.contentRect(field)||field.source}}));
    const compact=cameraPilot&&hudWidth<480;
    const header=global.WarcraftHudLayout.createCompactHeaderLayout(fields,
      {width:hudWidth,left,top:2,menuScale:cameraPilot?1.9:1.8,resourceScale:cameraPilot?1.65:1.5,
        gap:compact?3:6,reserveWidth:compact?40:42});
    const sideTop=header.height+8;
    // Reserve the whole native 166px command bank plus the 54px Cancel.
    const commandScale=cameraPilot?Math.max(.1,Math.min(scale*1.1,(hudWidth-6)/220,(lowerEdge-sideTop)/140)):scale;
    const gridTop=lowerEdge-140*commandScale;
    const commands=global.WarcraftHudLayout.createV14CommandRegions(packet,
      {left,top:gridTop,scale:commandScale,separateCancel:true,cancelRight:rightEdge,cancelBottom:lowerEdge});
    if(!commands)return null;
    const result=header.regions.map(region=>{
      if(region.id==='menu')return region;
      const id=Number(region.id.split('-')[1]),native=foreground.layers.find(f=>f.id===id);
      return {...region,layer:'native-hud-'+id,visualSource:{left:region.source.left-native.source.left,
        top:region.source.top-native.source.top,width:region.source.width,height:region.source.height}};
    });
    const miniSize=Math.max(144,128*scale);
    result.push(global.WarcraftHudLayout.createMinimapRegion({left:rightEdge-miniSize,top:sideTop,size:miniSize}));
    const info=foreground.layers.find(layer=>layer.id===100);
    if(state.selectionCount>0&&info?.captured&&info.nativeVisible){
      const commandsTop=Math.min(lowerEdge,...commands.filter(region=>!region.isCancel).map(region=>region.target.top),
        state.buildingPending?lowerEdge-confirmSize.height:lowerEdge);
      if(cameraPilot){
        const region=global.WarcraftHudLayout.createInfoRegion(info,
          {left,top:sideTop,scale:scale*1.15,right:rightEdge-miniSize-6,bottom:commandsTop-4});
        if(region)result.push(region);
      }else{
        result.push({id:'info',source:info.source,layer:'native-hud-100',
          visualSource:{left:0,top:0,width:info.source.width,height:info.source.height},
          target:{left,top:sideTop,width:info.source.width*scale,height:info.source.height*scale}});
      }
    }
    const status=foreground.layers.find(layer=>layer.id===101);
    const statusFields=global.WarcraftHudForeground.statusFields(status);
    if(cameraPilot){
      const cancel={left:rightEdge-54*commandScale,top:lowerEdge-46*commandScale,
        width:54*commandScale,height:46*commandScale};
      const statusCommands=state.buildingPending?[...commands,
        {target:{left,top:lowerEdge-confirmSize.height,...confirmSize}}]:commands;
      const statusLayout=global.WarcraftHudLayout.createGapStatusLayout(statusFields,
        {width,height,commands:statusCommands,cancel,bottomMargin:bottom,leftMargin:left,rightMargin:right,maxScale:1.38,
          obstacles:result.map(region=>region.target)});
      result.push(...statusLayout.regions);
    }else if(statusFields.length){
      const gap=6,total=statusFields.reduce((n,field)=>n+field.source.width,0);
      const s=Math.min(1.25,(width-8-gap*(statusFields.length-1))/total);
      let left=4;
      for(const [i,field] of statusFields.entries()){
        const {source:p,layer,visualSource}=field;
        result.push({id:'status-'+i,source:p,layer,visualSource,
          target:{left,top:gridTop-6-p.height*s,width:p.width*s,height:p.height*s}});
        left+=p.width*s+gap;
      }
    }
    result.push(...commands);
    return {regions:result,header,commandCount:commands.length,gridTop};
  }
  function scheduleAnimation(force=false) {
    if(!enhancedHud||animation!==null||(!force&&(!camera?.active||telemetry.mode==='dialog')))return;
    animation=global.requestAnimationFrame(()=>{animation=null;render(coherentFrames);});
  }
  function getHudContextToken() {
    const view=global.WarcraftUiBridge?.viewState?.();
    return view?.usable?view.selectionToken:null;
  }
  function getHudCommand(event,rect) {
    if(!enhancedHud||!visible||telemetry.mode==='dialog')return null;
    const point=pick(event,rect);
    if(!point||!/^command-\d+$/.test(point.regionId))return null;
    const blocked={blocked:true},id=Number(point.regionId.slice(8));
    const packet=global.WarcraftUiBridge?.uiRects?.(),view=global.WarcraftUiBridge?.viewState?.();
    const child=packet?.usable&&packet.children.find(item=>item.id===id&&item.type===2);
    const meta=view?.commands?.find(item=>item.objectAddress===child?.objectAddress&&
      item.descriptorAddress===child?.descriptorAddress);
    if(!child?.commandPresent||!child.nativeVisible||!view?.usable||!view.selectionToken||!meta)return blocked;
    return {key:[child.object,child.descriptor].join(':'),object:child.objectAddress,descriptor:child.descriptorAddress,
      contextToken:view.selectionToken,nativeX:(child.native.left+child.native.right)/2,
      nativeY:(child.native.top+child.native.bottom)/2,visible:true,present:true,
      isCancel:child.isCancel===true,isBuildingPlacement:meta.isBuildingPlacement===true,
      regionId:point.regionId};
  }
  function selectHudCommand(command) { selectedCommand=command; if(installed)scheduleAnimation(true); }
  function validSelectedCommand() {
    if(!selectedCommand)return null;
    if(selectedCommand.contextToken!==getHudContextToken()){selectedCommand=null;return null;}
    const packet=global.WarcraftUiBridge?.uiRects?.();
    if(!packet?.usable||!packet.children.some(c=>c.objectAddress===selectedCommand.object&&
      c.descriptorAddress===selectedCommand.descriptor&&c.commandPresent&&c.nativeVisible)){selectedCommand=null;return null;}
    return selectedCommand;
  }
  function sizeOutput(canvas=output) {
    const width=Math.max(1,Math.floor(container.clientWidth)),height=Math.max(1,Math.floor(container.clientHeight));
    const dpr=enhancedHud?Math.max(1,Math.min(3,global.devicePixelRatio||1)):1;
    if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);
    if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);
    return {width,height,dpr};
  }
  function waitForNativeFrame() {
    onUnavailable?.();
    if(buildConfirm)buildConfirm.hidden=true;
    if(keepNativeUntilReady&&!visible){telemetry.mode='waiting-native-frame';return;}
    if(hostPresentation&&visible){chart=null;telemetry.mode='waiting-native-frame';return;}
    setVisible(true);sizeOutput();chart=null;telemetry.mode='waiting-native-frame';
    context.save();context.setTransform(1,0,0,1,0,0);context.fillStyle='#000';
    context.fillRect(0,0,output.width,output.height);context.restore();
  }
  function bootstrapModalBackground(scene) {
    const packet=global.WarcraftUiBridge?.bootstrapBackground?.();
    const {g,state,ui,foreground,view}=scene;
    if(!packet?.usable||packet.sceneEpoch!==view?.mapEpoch||!g?.active||!ui?.usable||
      !foreground?.usable||foreground.format!=='WHF3'||foreground.screen.width!==g.width||
      foreground.screen.height!==g.height||packet.screen.width!==g.width||packet.screen.height!==g.height)return false;
    const live=scene.packet;
    if(!live?.usable||live.sceneEpoch!==packet.sceneEpoch)return false;
    // The original first fade can legitimately be black. Freeze only the
    // pre-dialog indices; palette changes must follow the completed native frame.
    const paletteKey=[container.clientWidth,container.clientHeight,global.devicePixelRatio,...Object.values(hudInsets),
      ...live.palette].join(',');
    if(bootstrapInUse&&bootstrapPaletteKey===paletteKey&&modalPresenter.hasBackground)return true;
    const pixels=bootstrapPainter.paint({...packet,palette:live.palette,paletteRevision:paletteKey});if(!pixels)return false;
    // A bootstrap is the dialog's background, not a completed presentation.
    const canvas=onPresented?(bootstrapCanvas??=document.createElement('canvas')):output;
    if(canvas===output)setVisible(true);
    const {width,height}=sizeOutput(canvas);
    const cleanG={...g,cameraX:packet.cameraX,cameraY:packet.cameraY,world:packet.world};
    const world=camera.frame(cleanG,width,height),
      hud=balancedRegions(width,height,cleanG,ui,foreground,state);
    if(!world||!hud)return false;
    const cleanChart=global.WarcraftPresentation.createChart({source:packet.screen,world,width,height,
      map:{fit:'contain'},regions:hud.regions});
    cleanChart.render(canvas===output?context:canvas.getContext('2d'),pixels,
      {layers:foregroundPainter.capture(foreground)});
    modalPresenter.captureBackground(canvas,{inGame:true,dialogOpen:false});
    bootstrapInUse=true;bootstrapPaletteKey=paletteKey;
    telemetry.bootstrapEpoch=packet.sceneEpoch;return true;
  }
  function resizeFrozenWorld(width,height,dpr) {
    if(!frozenWorld||(modalBackgroundWidth===width&&modalBackgroundHeight===height&&modalBackgroundDpr===dpr&&
      modalBackgroundInsets===hudInsets))return;
    const {g,world,ui,foreground,state,packet,partialFrame}=frozenWorld;
    const extent=g.world;
    const span=Math.max(world.width,world.height);
    const ratio=width/height;
    const w=Math.min(span*Math.min(1,ratio),extent.right-extent.left,(extent.bottom-extent.top)*ratio);
    const h=w/ratio;
    const left=clamp(world.left+(world.width-w)/2,extent.left,extent.right-w);
    const top=clamp(world.top+(world.height-h)/2,extent.top,extent.bottom-h);
    const crop={...world,left,top,width:w,height:h,visibleGlobal:{
      x:g.cameraX*32+left-extent.left,y:g.cameraY*32+top-extent.top}};
    const hud=balancedRegions(width,height,g,ui,foreground,state);
    if(!hud)return;
    const layout=global.WarcraftPresentation.createChart({source:g,world:crop,width,height,regions:hud.regions});
    const canvas=bootstrapCanvas??=document.createElement('canvas');
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    const ctx=canvas.getContext('2d');
    const pixels=partialFrame?visibleFramePainter.paint(packet,layout):nativeFramePainter.paint(packet);
    layout.render(ctx,pixels,{layers:foregroundPainter.capture(foreground)});
    drawMapOutlines(ctx,layout,crop,g,dpr,partialFrame);
    modalPresenter.captureBackground(canvas,{inGame:true,dialogOpen:false});
    modalBackgroundWidth=width;modalBackgroundHeight=height;modalBackgroundDpr=dpr;modalBackgroundInsets=hudInsets;
  }
  function render(captureNative=true) {
    if(!installed)return;
    if(captureNative||!lastScene){
      if(enhancedHud)cursorPresenter?.update(global.WarcraftUiBridge?.cursorPlane?.(),input);
      let g=nativeGeometry();
      const state=global.WarcraftUiBridge?.state?.(),view=enhancedHud?global.WarcraftUiBridge?.viewState?.():null;
      const completed=coherentFrames?global.WarcraftUiBridge?.completedFrame?.():null;
      const matchesGeometry=g&&completed?.usable&&completed.sceneEpoch===view?.mapEpoch&&
        completed.screen.width===g.width&&completed.screen.height===g.height;
      if(coherentFrames&&matchesGeometry){
        g={...g,cameraX:completed.cameraX,cameraY:completed.cameraY,maxX:completed.maxX,maxY:completed.maxY,
          mapWidth:completed.mapWidth,mapHeight:completed.mapHeight,world:completed.world};
      }
      if(!coherentFrames&&g&&view?.presented?.screen.width===g.width&&view.presented.screen.height===g.height)
        g={...g,cameraX:view.presented.cameraX,cameraY:view.presented.cameraY};
      lastScene={g,state,view,ui:cleanHud?global.WarcraftUiBridge?.uiRects?.():null,
        foreground:cleanHud?global.WarcraftUiBridge?.hudForeground?.():null,
        packet:completed,
        partialFrame:matchesGeometry&&visibleFramePainter&&cameraPilot.coversWorld(g)&&!state?.dialogOpen,
        frame:coherentFrames?(matchesGeometry?completed:null):
          source.width&&source.height?copier.capture(source).frame:null};
    }
    const {g,state,view,ui,foreground}=lastScene;
    if(coherentFrames){
      if(lastMapEpoch!==null&&!state?.ready){waitForNativeFrame();return;}
      if(!state?.inGame){lastMapEpoch=null;modalPresenter.reset();camera.reset();lastRenderedGeometry=null;bootstrapInUse=false;bootstrapPaletteKey=null;cleanWorldReady=false;lastWorldPaint=frozenWorld=null;}
      else if(!view?.mapEpoch){waitForNativeFrame();return;}
      else if(lastMapEpoch!==view.mapEpoch){
        lastMapEpoch=view.mapEpoch;modalPresenter.reset();camera.reset();bootstrapPainter.reset();selectedCommand=null;
        lastRenderedGeometry=null;chart=null;lastDialogToken=null;
        bootstrapInUse=false;bootstrapPaletteKey=null;cleanWorldReady=false;lastWorldPaint=frozenWorld=null;
      }
      if(state?.inGame&&lastScene.packet?.usable&&lastScene.packet.sceneEpoch===view?.mapEpoch&&
        (!!lastScene.packet.dialogRoot!==!!state.dialogOpen||lastScene.packet.dialogRoot!==(view.dialogAddress||0))){
        // Telemetry may advance before the next complete native raster. Keep
        // the already displayed image and consume input until both agree.
        if(!visible||onUnavailable)waitForNativeFrame();
        else {chart=null;telemetry.mode='waiting-native-frame';}
        return;
      }
      if(cameraPilot&&state?.inGame&&state.dialogOpen&&cleanWorldReady){
        // The visible world canvas is still intact, including while a native
        // modal frame was pending. The command outline is in its own layer.
        modalPresenter.captureBackground(output,{inGame:true,dialogOpen:false});
        modalBackgroundWidth=frozenWorld?.width;
        modalBackgroundHeight=frozenWorld?.height;
        modalBackgroundDpr=frozenWorld?.dpr;
        modalBackgroundInsets=frozenWorld?.hudInsets;
        cleanWorldReady=false;
        lastWorldPaint=null;
      }
      if(state?.inGame&&state.dialogOpen&&(!modalPresenter.hasBackground||bootstrapInUse)){
        if(!bootstrapModalBackground(lastScene)){waitForNativeFrame();return;}
      }
    }
    if(enhancedHud&&state?.inGame&&state.dialogOpen&&modalPresenter?.hasBackground){
      if(commandHighlight)commandHighlight.hidden=true;
      updateBuildConfirm(state,'dialog');
      if(telemetry.mode!=='dialog'||lastDialogToken!==view?.modal?.identity){
        cancelButtons();global.WarcraftDuneControls?.cancel?.();
        if(coherentFrames)camera.pause(g);else camera.stop();
        selectedCommand=null;
      }
      lastDialogToken=view?.modal?.identity;
      const width=Math.max(1,Math.floor(container.clientWidth)),height=Math.max(1,Math.floor(container.clientHeight));
      const dpr=enhancedHud?Math.max(1,Math.min(3,global.devicePixelRatio||1)):1;
      if(cameraPilot)resizeFrozenWorld(width,height,dpr);
      const framePixels=coherentFrames?nativeFramePainter.paint(lastScene.frame):lastScene.frame;
      const modal={inGame:true,dialogOpen:true,packet:view?.modal,panelTexture:modalTexture?.(),
        back:modalBack?.(view?.modal),fillBackground:!!onPresented,
        leftInset:hudInsets.left>4?hudInsets.left*dpr:0,rightInset:hudInsets.right>4?hudInsets.right*dpr:0};
      if(onPresented&&modalPresenter.plan(framePixels,{...modal,width:Math.round(width*dpr),
        height:Math.round(height*dpr)}).mode!=='modal'){waitForNativeFrame();return;}
      setVisible(true);
      if(output.width!==Math.round(width*dpr))output.width=Math.round(width*dpr);
      if(output.height!==Math.round(height*dpr))output.height=Math.round(height*dpr);
      const layout=modalPresenter.present(context,framePixels,modal);
      telemetry.mode='dialog';
      if(layout.mode==='modal')onPresented?.('dialog',layout);
      return;
    }
    const expanded=g&&(g.columns>14||g.rows>14);
    const commands=g?commandBand(g,ui):null;
    const hudReady=!cleanHud||(ui?.format===(balancedHud?'WUR3':'WUR2')&&foreground?.usable&&
      foreground.format===(balancedHud?'WHF3':'WHF2')&&
      foreground.screen.width===g?.width&&foreground.screen.height===g?.height);
    const ready=g?.active&&expanded&&state?.ready&&state.inGame&&!state.dialogOpen&&
      lastScene.frame&&source.width===g.width&&source.height===g.height&&input.width===g.width&&input.height===g.height&&g.width>=640&&g.height>=480&&commands&&hudReady;
    if(!ready){if(buildConfirm)buildConfirm.hidden=true;if(coherentFrames&&state?.inGame)waitForNativeFrame();else setVisible(false);return;}
    try {
      bootstrapInUse=false;bootstrapPaletteKey=null;
      lastDialogToken=null;
      const width=Math.max(1,Math.floor(container.clientWidth)),height=Math.max(1,Math.floor(container.clientHeight));
      const dpr=enhancedHud?Math.max(1,Math.min(3,global.devicePixelRatio||1)):1;
      const receipt=cameraPilot&&view?.usable&&lastScene.packet?.usable
        ? {currentCamera:view.currentCamera,sequence:lastScene.packet.sequence}:undefined;
      const world=enhancedHud?camera.frame(g,width,height,undefined,receipt):croppedWorld(g,width,height);
      if(coherentFrames&&!world){waitForNativeFrame();return;}
      if(cameraPilot){
        const key=[lastScene.packet.sequence,ui.revision,foreground.revision,state.selectionCount,
          state.buildingPending,width,height,dpr,hudInsets,world.left,world.top,world.width,world.height];
        if(telemetry.mode==='world'&&chart&&lastWorldPaint?.every((value,index)=>value===key[index])){
          updateBuildConfirm(state,'world');
          updateCommandHighlight();
          performanceStats.reusedWorldFrames++;
          scheduleAnimation();
          return;
        }
        lastWorldPaint=key;
      }
      const hud=balancedHud?balancedRegions(width,height,g,ui,foreground,state):
        cleanHud?cleanRegions(width,height,g,ui,foreground,state):null;
      if(cleanHud&&!hud){if(coherentFrames)waitForNativeFrame();else setVisible(false);return;}
      const nextChart=global.WarcraftPresentation.createChart({source:{width:g.width,height:g.height},
        world,width,height,map:{fit:'contain'},regions:hud?.regions||regions(width,height,g,commands),
        provenance:{source:g.source,revision:g.revision,nativeWorld:g.world}});
      const layers=balancedHud?foregroundPainter.capture(foreground):
        hud?{'native-hud-foreground':foregroundPainter.capture(foreground).frame}:{};
      const framePixels=lastScene.partialFrame?visibleFramePainter.paint(lastScene.packet,nextChart):
        coherentFrames?nativeFramePainter.paint(lastScene.frame):lastScene.frame;
      setVisible(true);
      chart=nextChart;
      telemetry.mode='world';
      if(output.width!==Math.round(width*dpr))output.width=Math.round(width*dpr);
      if(output.height!==Math.round(height*dpr))output.height=Math.round(height*dpr);
      chart.render(context,framePixels,{layers});
      if(cameraPilot)drawMapOutlines(context,chart,world,g,dpr,camera.independent);
      else if(camera?.independent)drawMinimapView(world,g,dpr);
      lastRenderedGeometry=g;
      if(cameraPilot){
        const hasCancel=hud.regions.some(region=>region.isCancel);
        if(hasCancel!==('warcraftCancelVisible' in frame.dataset))frame.toggleAttribute('data-warcraft-cancel-visible',hasCancel);
      }
      updateBuildConfirm(state,'world');
      if(enhancedHud){
        if(cameraPilot){
          cleanWorldReady=true;
          frozenWorld={g,world,ui,foreground,state,width,height,dpr,hudInsets,
            packet:lastScene.packet,partialFrame:lastScene.partialFrame};
          updateCommandHighlight();
        }else{
          modalPresenter.captureBackground(output,{inGame:true,dialogOpen:false});
          const selected=validSelectedCommand(),region=selected&&chart.regions.find(r=>r.id===selected.regionId);
          if(region){
            const r=region.target;context.save();context.setTransform(dpr,0,0,dpr,0,0);context.strokeStyle='#00fc00';context.lineWidth=2;
            context.strokeRect(r.left+1,r.top+1,r.width-2,r.height-2);context.restore();
          }
        }
        scheduleAnimation();
      }
      telemetry.frames++;telemetry.geometry={native:g,latestNative:g,frameSequence:lastScene.packet?.sequence,
        shownWorld:world,commands,width,height,
        ...(lastScene.partialFrame?{cameraMode:'independent',visiblePaint:visibleFramePainter.debug()}:{}),
        hud:hud?{header: hud.header,commandCount:hud.commandCount,foregroundRevision:foreground.revision,
          infoLayoutMode:foreground.infoLayoutMode}:null};
      onPresented?.('world',chart);
    } catch(error) {
      if(telemetry.errors.length<8)telemetry.errors.push(String(error));
      if(coherentFrames&&state?.inGame)waitForNativeFrame();else setVisible(false);
      console.error('[Warcraft map presentation]',error);
    }
  }
  function pick(event,rect,{captured=false}={}) {
    if(!visible||acceptsInput?.()===false)return null;
    if(enhancedHud&&telemetry.mode==='dialog') {
      if(acceptsInput) {
        const nativeModal=global.WarcraftUiBridge?.viewState?.()?.modal;
        if(!nativeModal?.usable||nativeModal.identity!==lastDialogToken||
          nativeModal.token!==modalPresenter.layout.token)return {kind:'blocked'};
      }
      return modalPresenter.clientToSource(event.clientX,event.clientY,rect)||{kind:'blocked'};
    }
    if(!chart)return null;
    if(!captured)return chart.clientToSource(event.clientX,event.clientY,rect);
    const region=chart.regions.find(item=>item.id==='map'),t=region.transform;
    const cssScale=Math.min(rect.width/chart.width,rect.height/chart.height);
    const x=(event.clientX-rect.left)/cssScale,y=(event.clientY-rect.top)/cssScale;
    return {regionId:'map',kind:'world',x:(x-t.tx)/t.scale,y:(y-t.ty)/t.scale};
  }
  function pointForGesture(event,rect,options) {
    const g=nativeGeometry();if(!g)return null;
    if(source.width!==g.width||source.height!==g.height||input.width!==g.width||input.height!==g.height)return null;
    if(!visible)return keepNativeUntilReady?null:
      {x:(event.clientX-rect.left)*g.width/rect.width,y:(event.clientY-rect.top)*g.height/rect.height};
    const point=pick(event,rect,options);if(point?.kind!=='world')return null;
    const map=chart.regions.find(region=>region.id==='map');
    return {...point,pixelsPerCssPixel:chart.width/rect.width/map.transform.scale};
  }
  function moveNative(point) {
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
    lastNative={x:Math.floor(point.x),y:Math.floor(point.y)};
    global.WarcraftUiBridge.nativeMove(lastNative.x,lastNative.y);return true;
  }
  function updateCommandHighlight() {
    if(!commandHighlight)return;
    const selected=validSelectedCommand();
    const region=selected&&chart.regions.find(item=>item.id===selected.regionId);
    commandHighlight.hidden=!region;
    if(!region)return;
    const r=region.target;
    Object.assign(commandHighlight.style,{left:r.left+'px',top:r.top+'px',
      width:r.width+'px',height:r.height+'px'});
  }
  function drawMapOutlines(context,layout,world,g,dpr,independent) {
    const map=layout.regions.find(region=>region.id==='map')?.transform.painted;
    const mini=layout.regions.find(region=>region.id==='minimap')?.transform.painted;
    if(!map||!mini)return;
    const edge=.001,origin=world.visibleGlobal;
    const width=g.mapWidth*32,height=g.mapHeight*32;
    context.save();
    context.setTransform(dpr,0,0,dpr,0,0);
    context.fillStyle='#fff';
    // Paint only the real map edge. A moving camera crop is not a map limit.
    if(origin.x<=edge)context.fillRect(map.left,map.top,1,map.height);
    if(origin.y<=edge)context.fillRect(map.left,map.top,map.width,1);
    if(origin.x+world.width>=width-edge)context.fillRect(map.right-1,map.top,1,map.height);
    if(origin.y+world.height>=height-edge)context.fillRect(map.left,map.bottom-1,map.width,1);
    context.strokeStyle='#fff';
    context.strokeRect(mini.left+.5,mini.top+.5,mini.width-1,mini.height-1);
    context.restore();
    if(independent)drawMinimapView(world,g,dpr,context,layout);
  }
  function drawMinimapView(world,g,dpr,ctx=context,layout=chart) {
    const mini=layout.regions.find(region=>region.id==='minimap')?.transform.painted;
    if(!mini)return;
    const sx=mini.width/(g.mapWidth*32),sy=mini.height/(g.mapHeight*32);
    ctx.save();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.strokeStyle='#fff7df';
    ctx.strokeRect(mini.left+world.visibleGlobal.x*sx+.5,mini.top+world.visibleGlobal.y*sy+.5,
      world.width*sx-1,world.height*sy-1);
    ctx.restore();
  }
  function moveByMinimap(event) {
    const state=global.WarcraftUiBridge.state(),g=lastRenderedGeometry;
    if(!camera?.independent||telemetry.mode!=='world'||!g||!state.inputAllowed||
      state.targetPending||state.buildingPending)return false;
    const mini=chart.regions.find(region=>region.id==='minimap');
    const point=pick(event,input.getBoundingClientRect());
    if(!mini||point?.regionId!=='minimap')return false;
    const {source}=mini;
    camera.centerOn((point.x-source.left)*g.mapWidth*32/source.width,
      (point.y-source.top)*g.mapHeight*32/source.height);
    scheduleAnimation(true);
    return true;
  }
  function cancelButtons() {
    minimapDrag=false;
    if(!held.size)return;
    const g=nativeGeometry(),point=g?{x:g.width-1,y:g.height-1}:lastNative;
    if(point)moveNative(point);
    for(const button of held)global.WarcraftUiBridge.nativeButton(0,button,lastNative.x,lastNative.y);
    held.clear();
    // Earlier gesture listeners may already have cancelled the shared fence.
    // Drop the raw HUD release just queued above as well; release actual holds.
    global.WarcraftUiBridge.cancelPendingInput?.();
  }
  function installInputRouter() {
    if(routerInstalled)return;routerInstalled=true;
    const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
    const inScope=event=>event.target===input;
    // A finger does not reliably emit the compatibility mouse click on WebKit
    // when the surface owns touch gestures. Use the same minimap hit test.
    if(cameraPilot){
      let touch=null;
      global.addEventListener('pointerdown',event=>{
        if(event.pointerType==='touch'&&inScope(event)&&moveByMinimap(event)){
          touch=event.pointerId;
          input.setPointerCapture?.(touch);
          stop(event);
        }
      },{capture:true,passive:false});
      global.addEventListener('pointermove',event=>{
        if(event.pointerId===touch){moveByMinimap(event);stop(event);}
      },{capture:true,passive:false});
      for(const name of ['pointerup','pointercancel','lostpointercapture']){
        global.addEventListener(name,event=>{
          if(event.pointerId!==touch)return;
          touch=null;
          if(name==='pointerup')moveByMinimap(event);
          stop(event);
        },{capture:true,passive:false});
      }
    }
    global.addEventListener('mousemove',event=>{
      if(minimapDrag){moveByMinimap(event);stop(event);return;}
      if(!visible||(!inScope(event)&&!held.size))return;
      if(buildConfirm&&telemetry.mode==='world'&&global.WarcraftUiBridge.state().buildingPending){stop(event);return;}
      const selected=enhancedHud&&telemetry.mode!=='dialog'?validSelectedCommand():null;
      const point=selected?{x:selected.nativeX,y:selected.nativeY,kind:'native-ui'}:pick(event,input.getBoundingClientRect());
      if(point&&point.kind!=='blocked')moveNative(point);stop(event);
    },{capture:true,passive:false});
    global.addEventListener('mousedown',event=>{
      if(!visible||!inScope(event)||![0,1,2].includes(event.button))return;
      if(enhancedHud){camera.stop();selectedCommand=null;}
      if(event.button===0&&moveByMinimap(event)){minimapDrag=true;stop(event);return;}
      const point=pick(event,input.getBoundingClientRect());stop(event);
      if(!point||point.kind==='blocked')return;
      input.focus({preventScroll:true});moveNative(point);
      const button=nativeButton(event.button);held.add(button);
      global.WarcraftUiBridge.nativeButton(1,button,lastNative.x,lastNative.y);
    },{capture:true,passive:false});
    global.addEventListener('mouseup',event=>{
      if(minimapDrag&&event.button===0){minimapDrag=false;moveByMinimap(event);stop(event);return;}
      const button=nativeButton(event.button);if(!held.has(button))return;
      const point=visible?pick(event,input.getBoundingClientRect()):null;
      if(point&&point.kind!=='blocked')moveNative(point);
      else {const g=nativeGeometry();if(g)moveNative({x:g.width-1,y:g.height-1});}
      global.WarcraftUiBridge.nativeButton(0,button,lastNative.x,lastNative.y);held.delete(button);stop(event);
    },{capture:true,passive:false});
    global.addEventListener('blur',event=>{if(event.target===global)cancelButtons();},{capture:true});
    global.addEventListener('pointercancel',()=>cancelButtons(),{capture:true});
    global.addEventListener('lostpointercapture',event=>{
      if(event.pointerType!=='mouse'||event.buttons)cancelButtons();
    },{capture:true});
    global.addEventListener('contextmenu',event=>{if(visible&&inScope(event))stop(event);},{capture:true,passive:false});
  }
  let cameraPilot,hostPresentation,modalTexture;
  function install(host) {
    if(installed)return;
    keepNativeUntilReady=!!host;
    cameraPilot=coherentFrames?host?.independentCamera:null;
    source=host?.source || document.getElementById('boxedwine-webgl-canvas-0');
    display=host?.display || source;
    input=host?.input || document.getElementById('canvas');
    frame=host?.frame || input.parentElement;
    hostPresentation=frame.classList.contains('warcraft-owns-presentation');
    modalTexture=host?.modalTexture;
    onPresented=host?.onPresented;
    onUnavailable=host?.onUnavailable;
    acceptsInput=host?.acceptsInput;
    modalBack=host?.modalBack;
    container=host?.container || document.getElementById('dropzone');
    output=document.createElement('canvas');output.id='warcraft-map-canvas';output.hidden=true;
    output.style.cssText='z-index:2;pointer-events:none;';frame.append(output);
    if(cameraPilot){
      const probes=Object.fromEntries(['left','right','bottom'].map(side=>{
        const probe=document.createElement('div');
        probe.setAttribute('aria-hidden','true');
        probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none;height:0;' +
          `width:var(--warcraft-hud-${side},4px);`;
        frame.append(probe);
        return [side,probe];
      }));
      function measureInsets(){
        const next=Object.fromEntries(Object.entries(probes).map(([side,probe])=>
          [side,Math.max(4,probe.getBoundingClientRect().width)]));
        if(Object.keys(next).every(side=>next[side]===hudInsets[side]))return;
        hudInsets=Object.freeze(next);
        frame.dispatchEvent(new Event('warcraft-hud-insets-change'));
        if(installed&&lastScene)scheduleAnimation(true);
      }
      measureInsets();
      const insetObserver=new global.ResizeObserver(measureInsets);
      for(const probe of Object.values(probes))insetObserver.observe(probe);
      commandHighlight=document.createElement('div');
      commandHighlight.id='warcraft-command-highlight';
      commandHighlight.setAttribute('aria-hidden','true');
      commandHighlight.style.cssText='position:absolute;z-index:3;pointer-events:none;box-sizing:border-box;border:2px solid #00fc00';
      commandHighlight.hidden=true;
      frame.append(commandHighlight);
      telemetry.performance=performanceStats;
    }
    if(cameraPilot?.explicitBuilding){
      buildConfirm=document.createElement('button');
      buildConfirm.type='button';buildConfirm.id='warcraft-build-confirm';
      buildConfirm.style.width=confirmSize.width+'px';
      buildConfirm.style.minHeight=confirmSize.height+'px';
      buildConfirm.setAttribute('aria-label','Подтвердить строительство');
      buildConfirm.hidden=buildConfirm.disabled=true;
      const art=document.createElement('img');
      art.src=document.documentElement.classList.contains('warcraft-page')?'./build-confirm.png':'/build-confirm.png';
      art.alt='OK';art.draggable=false;
      buildConfirm.append(art);frame.append(buildConfirm);
      buildConfirm.addEventListener('click',()=>{
        if(telemetry.mode==='world'&&global.WarcraftDuneControls?.confirmBuilding())buildConfirm.disabled=true;
      });
    }
    context=output.getContext('2d');copier=global.WarcraftPresentation.createFrameCopier();
    if(enhancedHud){
      camera=(coherentFrames?global.WarcraftSmoothCamera:global.WarcraftSmoothCameraV15).createCamera({
        panTiles:(...args)=>global.WarcraftUiBridge.panTiles(...args),
        panReply:serial=>global.WarcraftUiBridge.panReply(serial),
        viewport:cameraPilot?{...cameraPilot.viewport,reference:cameraPilot.referenceViewport}:undefined,
      });
      const modalScale=hostPresentation?1.5:1.25;
      modalPresenter=global.WarcraftModalPresentationV15.createPresenter({maxScale:modalScale*Math.max(1,global.devicePixelRatio||1),margin:8});
      cursorPresenter=global.WarcraftCursorV15.createPresenter(host?.setOriginalCursor);
      if(coherentFrames){
        bootstrapPainter=global.WarcraftBootstrapBackgroundV16.createPainter();
        nativeFramePainter=global.WarcraftBootstrapBackgroundV16.createPainter();
        if(cameraPilot){
          camera=cameraPilot.createCamera(camera);
          visibleFramePainter=cameraPilot.createPainter();
        }
      }
    }
    if(cleanHud)foregroundPainter=balancedHud?global.WarcraftHudForeground.createLayerSetPainter():
      global.WarcraftHudForeground.createLayerPainter();
    const onFrame=()=>{if(coherentFrames)scheduleAnimation(true);else render();};
    if(host)host.subscribeFrame(onFrame);
    else {
      const present=Module.boxedwinePresentSoftwareFrame;
      Module.boxedwinePresentSoftwareFrame=function(...args){
        const result=present.apply(this,args);
        onFrame();
        return result;
      };
    }
    global.addEventListener('resize',()=>{camera?.stop();cancelButtons();global.WarcraftDuneControls?.cancel?.();render();});
    document.addEventListener('fullscreenchange',()=>{camera?.stop();cancelButtons();global.WarcraftDuneControls?.cancel?.();render();});
    installed=true;
  }
  function consumePan(dx,dy) {
    if(enhancedHud)return {dx,dy};
    if(!visible)return {dx,dy};
    const g=nativeGeometry(),shown=telemetry.geometry?.shownWorld;
    if(!g||!shown)return {dx,dy};
    if(g.maxX===0&&shown.extraX>0){cropX=clamp(cropX+dx*32,0,shown.extraX);dx=0;}
    if(g.maxY===0&&shown.extraY>0){cropY=clamp(cropY+dy*32,0,shown.extraY);dy=0;}
    return {dx,dy};
  }
  global.WarcraftFullMap={install,installInputRouter,pointForGesture,consumePan,render,
    getHudCommand,getHudContextToken,selectHudCommand,
    beginPan(time,scale){if(coherentFrames&&global.WarcraftSmoothCamera.ahead)camera?.begin(time,scale);else camera?.begin();},
    panPixels(dx,dy,time){camera?.move(dx,dy,time);if(!coherentFrames)render(false);scheduleAnimation();},
    endPan(time){camera?.end(time);scheduleAnimation();},
    stopPan(){camera?.stop();},
    get cameraSettled(){return !enhancedHud||!camera||camera.settled;},
    worldToGlobal(x,y){
      const g=coherentFrames?lastRenderedGeometry:lastScene?.g;if(!g)return null;
      return {x:g.cameraX*32+x-g.world.left,y:g.cameraY*32+y-g.world.top};
    },
    globalToWorld(x,y){
      const g=nativeGeometry(),v=global.WarcraftUiBridge?.viewState?.();if(!g)return null;
      const c=v?.usable?v.currentCamera:{x:g.cameraX,y:g.cameraY};
      return {x:x-c.x*32+g.world.left,y:y-c.y*32+g.world.top};
    },
    cameraDebug:()=>camera?.debug(),modalDebug:()=>modalPresenter?.debug(),
    get active(){return visible;},get chart(){return chart;},get hudInsets(){return hudInsets;},telemetry};
})(window);
