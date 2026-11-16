/* Presentation and inverse input only. All pixels and actions belong to BNE. */
(function (global) {
  'use strict';
  let installed=false,routerInstalled=false,chart=null,visible=false,lastNative=null;
  let output,source,display,input,frame,container,copier,context,foregroundPainter,minimapPainter,buildConfirm;
  let minimapBlack;
  let placement;
  let hudInsets=Object.freeze({left:4,right:4,bottom:4});
  const confirmSize=Object.freeze({width:116,height:48});
  let keepNativeUntilReady=false;
  const foregroundVersion=new URLSearchParams(location.search).get('bridge');
  const enhancedHud=['v15','v16'].includes(foregroundVersion);
  const coherentFrames=foregroundVersion==='v16';
  const mobilePointer=global.matchMedia?.('(any-pointer: fine)');
  const cleanHud=['v13','v14','v15','v16'].includes(foregroundVersion),balancedHud=['v14','v15','v16'].includes(foregroundVersion);
  let camera,modalPresenter,cursorPresenter,lastScene=null,selectedCommand=null,animation=null,lastDialogToken=null;
  let displayedMenuRaster=null;
  let bootstrapPainter,nativeFramePainter,visibleFramePainter,lastMapEpoch=null,lastRenderedGeometry=null;
  let bootstrapCanvas,onPresented,onUnavailable,acceptsInput,modalBack,modalSlider;
  let bootstrapInUse=false,bootstrapPaletteKey=null;
  let cleanWorldReady=false,commandHighlight,lastWorldPaint=null,frozenWorld=null;
  let modalBackgroundWidth=0,modalBackgroundHeight=0,modalBackgroundDpr=0,modalBackgroundInsets=null;
  const performanceStats={reusedWorldFrames:0,composedWorldFrames:0,reusedWorldCompositions:0,forceWorldComposition:false};
  let cropX=0,cropY=0,cropKey='';
  let minimapDrag=false;
  let sliderDrag=null;
  let portraitPress=null,objectivesWaitUntil=null;
  let listeners,insetObserver,insetProbes;
  let actionDialog, pendingConfirmation=null, modalFaction, purchaseTooltipMatches;
  let unavailableCommands, placementUnaffordable, cancellationTarget;
  // WUR3 checks these exact native descriptors and their callbacks before exporting isCancel.
  const cancellationKinds=new Map([
    [0x4a3818,'cancelBuilding'], [0x4a382c,'cancelUpgrade'], [0x4a3840,'cancelTraining'],
  ]);
  // These exact BNE command wrappers share the original paid-production path.
  // Spell research, unit research and building upgrades validate their own costs.
  const paidActions=new Map([
    [0x40e6d0,'train'],[0x40e650,'research'],[0x40e690,'research'],[0x40e710,'upgrade'],
  ]);
  const held=new Set();
  let infoPress=false;
  const telemetry={frames:0,mode:'native',errors:[],geometry:null};
  const nativeButton=button=>button===2?1:button===1?2:button;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const nativeGeometry=()=>global.WarcraftUiBridge?.viewportSnapshot?.()||null;
  function setVisible(value) {
    if(!value){
      closeConfirmation();
      hideBuildControls();
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
  function hideBuildControls() {
    if(buildConfirm)buildConfirm.hidden=true;
    if(placement)placement.layer.hidden=true;
  }
  function placementSize(width,height) {
    if(!placement)return confirmSize;
    const {left,right}=hudInsets;
    const contentWidth=width-(left>4?left:0)-(right>4?right:0);
    const menuHeight=global.WarcraftAssemblyDialogLayout.menuButtonHeight(contentWidth,height);
    return {width:Math.min(menuHeight*1.65,(width-left-right)*.43),height:menuHeight};
  }
  function updateBuildConfirm(state, mode) {
    if(!buildConfirm)return;
    const target=global.WarcraftDuneControls?.buildingTarget;
    buildConfirm.hidden=mode!=='world'||!state.buildingPending||state.inputAllowed===false;
    if(placement){
      placement.layer.hidden=buildConfirm.hidden;
      if(!buildConfirm.hidden&&chart){
        const size=placementSize(chart.width,chart.height);
        const faction=modalFaction()||'orc';
        if(placement.width!==size.width||placement.height!==size.height){
          placement.layer.style.setProperty('--placement-width',size.width+'px');
          placement.layer.style.setProperty('--placement-height',size.height+'px');
          placement.width=size.width;placement.height=size.height;
        }
        if(placement.layer.dataset.faction!==faction)placement.layer.dataset.faction=faction;
        placement.cancel.hidden=!lastScene.ui?.children?.some(child=>child.isCancel&&child.commandPresent&&child.nativeVisible);
      }
    }

    const native=target&&global.WarcraftFullMap.globalToWorld(target.x,target.y);
    const bounds=lastRenderedGeometry?.world;
    const unaffordable=!buildConfirm.hidden&&placementUnaffordable?.()===true;
    buildConfirm.toggleAttribute('data-unaffordable',unaffordable);
    buildConfirm.disabled=buildConfirm.hidden||unaffordable||!target||target.submitted||!native||!bounds||
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
      compact:{source:global.WarcraftHudForeground.contentRect(field)}}));
    const compact=cameraPilot&&hudWidth<480;
    const headerOptions={width:hudWidth,left,top:2,menuScale:cameraPilot&&!compact?1.9:1.8,
      resourceScale:cameraPilot?1.65:1.5,gap:compact?3:6,reserveWidth:cameraPilot?46:42};
    let header=global.WarcraftHudLayout.createCompactHeaderLayout(fields,headerOptions);
    const sideTop=8+(cameraPilot?Math.max(
      global.WarcraftHudLayout.nativeMenuButton.height*headerOptions.menuScale,16*headerOptions.resourceScale):header.height);
    const info=foreground.layers.find(layer=>layer.id===100);
    const board=cameraPilot&&global.WarcraftHudLayout.createAdaptiveBoardLayout(
      state.selectionCount>0?info:null,{left,right:rightEdge,top:sideTop,bottom:lowerEdge,scale,portrait:height>width});
    const miniSize=Math.max(144,128*scale);
    let minimap=board?board.minimap:
      global.WarcraftHudLayout.createMinimapRegion({left:rightEdge-miniSize,top:sideTop,size:miniSize});
    if(cameraPilot&&width>height)
      ({header,minimap}=global.WarcraftHudLayout.alignMinimapToHeader(fields,headerOptions,header,minimap));
    const commandScale=board?board.commandScale:scale;
    const gridTop=board?board.gridTop:lowerEdge-140*commandScale;
    // BNE clears the selection before repainting and retiring the command
    // children. A surviving rect can otherwise crop bare panel pixels as an icon.
    const nativeCommands=state.selectionCount>0?global.WarcraftHudLayout.createV14CommandRegions(packet,
      {left,top:gridTop,scale:commandScale,separateCancel:true,cancelRight:rightEdge,cancelBottom:lowerEdge}):[];
    if(!nativeCommands)return null;
    const placing=placement&&state.buildingPending&&state.inputAllowed!==false;
    const commands=placing?nativeCommands.filter(region=>!region.isCancel):nativeCommands;

    const result=header.regions.map(region=>{
      if(region.id==='menu')return region;
      const id=Number(region.id.split('-')[1]),native=foreground.layers.find(f=>f.id===id);
      return {...region,layer:'native-hud-'+id,visualSource:{left:region.source.left-native.source.left,
        top:region.source.top-native.source.top,width:region.source.width,height:region.source.height}};
    });
    result.push(minimapPainter?{...minimap,layer:'native-minimap',
      visualSource:{left:0,top:0,width:minimap.source.width,height:minimap.source.height}}:minimap);
    if(board?.info){
      const box=board.info.source,hitRects=infoButtons?.(info)??[];
      result.push({...board.info,hitRects:hitRects.filter(hit=>
        hit.left>=box.left&&hit.top>=box.top&&hit.left+hit.width<=box.left+box.width&&
        hit.top+hit.height<=box.top+box.height)});
    }else if(!board&&state.selectionCount>0&&info?.captured&&info.nativeVisible){
      result.push({id:'info',source:info.source,layer:'native-hud-100',
        visualSource:{left:0,top:0,width:info.source.width,height:info.source.height},
        target:{left,top:sideTop,width:info.source.width*scale,height:info.source.height*scale}});
    }
    const status=foreground.layers.find(layer=>layer.id===101);
    const statusFields=global.WarcraftHudForeground.statusFields(status,{hideHotkeys:touchOnly});
    if(cameraPilot){
      const size=state.buildingPending?placementSize(width,height):confirmSize;
      const cancelSize=placing?size:{width:54*commandScale,height:46*commandScale};
      const cancel={left:rightEdge-cancelSize.width,top:lowerEdge-cancelSize.height,...cancelSize};
      const statusCommands=state.buildingPending?[...commands,
        {target:{left,top:lowerEdge-size.height,...size}}]:commands;
      const statusLayout=global.WarcraftHudLayout.createGapStatusLayout(statusFields,
        {width,height,commands:statusCommands,cancel,bottomMargin:bottom,leftMargin:left,rightMargin:right,maxScale:1.58,preferAbove:true,
          obstacles:result.map(region=>region.target)});
      result.push(...statusLayout.regions.map(region=>({...region,hitRects:[]})));
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
  const mobileEdgeRoom=()=>cameraPilot&&touchOnly?global.WarcraftPresentation.mapEdgeRoom:undefined;
  function mapProjection(world,g,width,height){
    return cameraPilot&&g.world
      ? global.WarcraftPresentation.projectWorld(world,g.world,width,height)
      : {source:world,target:{left:0,top:0,width,height}};
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
    if(!enhancedHud||!visible||telemetry.mode==='dialog'||pendingConfirmation)return null;
    const point=pick(event,rect);
    if(!point||!/^command-\d+$/.test(point.regionId))return null;
    return readHudCommand(point.regionId)||{blocked:true};
  }
  function unaffordableMask(view) {
    return view?.usable&&view.count>0 ? unavailableCommands?.(view.commands)||0 : 0;
  }
  function readHudCommand(regionId, view=global.WarcraftUiBridge?.viewState?.(), packet=global.WarcraftUiBridge?.uiRects?.(), mask) {
    const id=Number(regionId.slice(8));
    const child=packet?.usable&&packet.children.find(item=>item.id===id&&item.type===2);
    const meta=view?.commands?.find(item=>item.objectAddress===child?.objectAddress&&
      item.descriptorAddress===child?.descriptorAddress);
    if(!child?.commandPresent||!child.nativeVisible||!view?.usable||!view.selectionToken||!meta)return null;
    const confirmPurchase=actionDialog&&!child.isCancel&&!meta.isBuildingPlacement&&paidActions.get(meta.actionAddress);
    const cancelKind=actionDialog&&child.isCancel?cancellationKinds.get(child.descriptorAddress):null;
    const cancelTarget=cancelKind?cancellationTarget?.(view,cancelKind):null;
    return {key:[child.object,child.descriptor].join(':'),object:child.objectAddress,descriptor:child.descriptorAddress,
      contextToken:view.selectionToken,epoch:view.mapEpoch,nativeX:(child.native.left+child.native.right)/2,
      nativeY:(child.native.top+child.native.bottom)/2,visible:true,present:true,
      isCancel:child.isCancel===true,isBuildingPlacement:meta.isBuildingPlacement===true,
      action:meta.actionAddress,param:meta.param,regionId,confirmPurchase,cancelKind,cancelTarget,
      unaffordable:!!((mask??unaffordableMask(view))&(1<<id))};
  }
  function matchingCommand(original,view=global.WarcraftUiBridge?.viewState?.(),ui,mask) {
    const live=readHudCommand(original.regionId,view,ui,mask);
    return live&&(!original.cancelKind||live.cancelTarget!=null)&&
      ['epoch','contextToken','object','descriptor','action','param','cancelTarget']
        .every(key=>live[key]===original[key])?live:null;
  }
  function closeConfirmation(refocus=false) {
    if(!pendingConfirmation)return;
    pendingConfirmation=null;
    actionDialog.layer.hidden=true;
    delete frame.dataset.warcraftPurchase;
    if(refocus&&visible&&telemetry.mode==='world')input.focus({preventScroll:true});
  }
  function confirmationContext(state) {
    return state?.inGame&&!state.dialogOpen&&!state.buildingPending&&!state.targetPending;
  }
  function canRequestAction(state) {
    return actionDialog&&!pendingConfirmation&&visible&&telemetry.mode==='world'&&
      acceptsInput?.()!==false&&state?.inGame&&!state.dialogOpen&&state.inputAllowed;
  }
  function updateConfirmation({state,view,ui,foreground,missingResources}) {
    if(!pendingConfirmation)return;
    const {command}=pendingConfirmation;
    const live=view?.usable&&ui?.usable&&matchingCommand(command,view,ui,missingResources);
    if(!confirmationContext(state)||view?.mapEpoch!==command.epoch||
      (view?.usable&&ui?.usable&&!live)){
      closeConfirmation();
      return;
    }
    if(command.confirmPurchase&&!pendingConfirmation.statusReady&&foreground?.usable&&purchaseTooltipMatches(command))
      pendingConfirmation.statusReady=paintPurchaseStatus(foreground);
    const unaffordable=!!command.confirmPurchase&&live?.unaffordable===true;
    actionDialog.ok.toggleAttribute('data-unaffordable',unaffordable);
    actionDialog.ok.disabled=!state.inputAllowed||acceptsInput?.()===false||
      !live||unaffordable||!pendingConfirmation.statusReady;
  }
  function paintPurchaseStatus(foreground) {
    const status=foreground.layers.find(layer=>layer.id===101);
    const fields=global.WarcraftHudForeground.statusFields(status,{hideHotkeys:true});
    if(!fields.some(f=>f.role==='description'))return false;
    const art=foregroundPainter.capture(foreground)['native-hud-101'];
    if(!art)return false;
    const text=fields.filter(f=>f.role==='description'),costs=fields.filter(f=>f.role==='cost');
    for(const [line,image] of [[text,actionDialog.description],[costs,actionDialog.costs]]){
      if(!line.length)continue;
      const canvas=document.createElement('canvas');
      canvas.width=line.reduce((n,f)=>n+f.visualSource.width,0)+Math.max(0,line.length-1)*8;
      canvas.height=status.source.height;
      let x=0;
      const context=canvas.getContext('2d');
      for(const {visualSource:s} of line){
        context.drawImage(art,s.left,s.top,s.width,s.height,x,0,s.width,s.height);x+=s.width+8;
      }
      image.src=canvas.toDataURL();image.hidden=false;
    }
    return true;
  }
  function requestHudPurchase(command,submit) {
    const bridge=global.WarcraftUiBridge,state=bridge.state();
    if(!canRequestAction(state)||!confirmationContext(state))return;
    const live=matchingCommand(command);
    if(!live?.confirmPurchase||live.unaffordable)return;
    const faction=modalFaction?.();
    if(!faction)return;
    pendingConfirmation={command,submit,statusReady:false};
    actionDialog.show(command.confirmPurchase,faction);
    const region=chart.regions.find(item=>item.id===command.regionId)?.transform.painted;
    if(region){
      const {icon}=actionDialog, sx=output.width/chart.width, sy=output.height/chart.height;
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(region.width*sx));canvas.height=Math.max(1,Math.round(region.height*sy));
      canvas.getContext('2d').drawImage(output,region.left*sx,region.top*sy,region.width*sx,region.height*sy,
        0,0,canvas.width,canvas.height);
      icon.src=canvas.toDataURL();icon.hidden=false;
    }
    presentConfirmation();
    scheduleAnimation(true);
  }
  function presentConfirmation() {
    frame.dataset.warcraftPurchase='';
    actionDialog.layer.hidden=false;
    actionDialog.cancel.focus({preventScroll:true});
  }
  function cancellationCommand(original) {
    const bridge=global.WarcraftUiBridge,state=bridge.state();
    if(!canRequestAction(state))return null;
    const placing=state.buildingPending===true;
    if(!placing&&!confirmationContext(state))return null;
    const packet=bridge.uiRects(),view=bridge.viewState();
    const child=packet?.children?.find(item=>item.isCancel&&item.commandPresent&&item.nativeVisible);
    const command=original?matchingCommand(original,view,packet):child&&readHudCommand('command-'+child.id,view,packet);
    if(!command?.isCancel)return null;
    return (placing&&!command.cancelKind)||(!placing&&command.cancelKind&&command.cancelTarget!=null)
      ? command:null;
  }
  function canHandleActionCancellation() {return !!cancellationCommand();}
  function submitCancellation(command) {
    const bridge=global.WarcraftUiBridge;
    moveNative({x:command.nativeX,y:command.nativeY});
    try {bridge.nativeButton(1,0,lastNative.x,lastNative.y);}
    finally {bridge.nativeButton(0,0,lastNative.x,lastNative.y);}
  }
  function requestActionCancellation(original) {
    const command=cancellationCommand(original);
    if(!command)return false;
    camera.stop();
    if(!command.cancelKind){
      global.WarcraftDuneControls?.cancel?.();
      submitCancellation(command);
    }else{
      pendingConfirmation={command,statusReady:true,submit:submitCancellation};
      actionDialog.show(command.cancelKind,modalFaction()||'orc');
      actionDialog.ok.disabled=false;
      presentConfirmation();
    }
    return true;
  }
  function createActionDialog() {
    const text={
      en:{train:'Train this unit?',research:'Research this upgrade?',upgrade:'Upgrade this building?',
        cancelBuilding:'Cancel construction?',cancelTraining:'Cancel training?',cancelUpgrade:'Cancel upgrade?',
        buy:'Buy',ok:'OK',cancel:'Cancel'},
      ru:{train:'Обучить этого бойца?',research:'Изучить улучшение?',upgrade:'Улучшить здание?',
        cancelBuilding:'Отменить строительство?',cancelTraining:'Отменить обучение?',cancelUpgrade:'Отменить улучшение?',
        buy:'Купить',ok:'OK',cancel:'Отмена'},
    };
    const current=global.WarcraftLanguage?.current()==='ru'?'ru':'en';
    const labels=text[current],font=global.WarcraftSessionText;
    const art=font?.load(current);
    art?.catch(console.error);
    const layer=document.createElement('div'),panel=document.createElement('div'),title=document.createElement('h2');
    layer.className='warcraft-session-overlay warcraft-purchase-overlay';
    layer.dataset.winePageDialog='';
    layer.hidden=true;
    layer.setAttribute('role','dialog');
    layer.setAttribute('aria-modal','true');
    panel.className='warcraft-purchase-panel';
    const picture=()=>{const image=new Image();image.alt='';image.draggable=false;return image;};
    const caption=(label,atlas)=>{const image=picture();image.src=font.ink(label,atlas).toDataURL();return image;};
    const icon=picture(),description=picture(),costs=picture();
    icon.className='warcraft-purchase-icon';
    description.className='warcraft-purchase-ink';
    costs.className='warcraft-purchase-ink';
    const controls=document.createElement('div');
    controls.className='warcraft-purchase-controls';
    function setCaption(button,label) {
      button.textContent=label;
      button.setAttribute('aria-label',label);
      art?.then(atlas=>{
        if(button.getAttribute('aria-label')===label)button.replaceChildren(caption(label,atlas));
      }).catch(()=>{});
    }
    const cancel=document.createElement('button'),ok=document.createElement('button');
    cancel.type=ok.type='button';
    setCaption(cancel,labels.cancel);
    cancel.addEventListener('click',()=>closeConfirmation(true));
    ok.addEventListener('click',()=>{
      const pending=pendingConfirmation, state=global.WarcraftUiBridge.state();
      const valid=pending?.statusReady&&visible&&telemetry.mode==='world'&&acceptsInput?.()!==false&&state.inputAllowed&&
        confirmationContext(state)&&matchingCommand(pending.command);
      if(valid?.unaffordable&&pending.command.confirmPurchase){
        ok.setAttribute('data-unaffordable','');
        ok.disabled=true;
        return;
      }
      closeConfirmation(true);
      if(valid){global.WarcraftDuneControls?.cancel?.();pending.submit(valid);}
    });
    layer.addEventListener('contextmenu',event=>event.preventDefault());
    listen('keydown',event=>{
      if(!pendingConfirmation){
        if(event.key==='Escape'&&!event.repeat&&requestActionCancellation()){
          event.preventDefault();event.stopImmediatePropagation();
        }
        return;
      }
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();
        if(!event.repeat)closeConfirmation(true);
      }else if(event.key==='Tab'){
        event.preventDefault();(document.activeElement===cancel&&!ok.disabled?ok:cancel).focus({preventScroll:true});
      }else if(!controls.contains(event.target)){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },{capture:true});
    controls.append(ok,cancel);
    panel.append(title,description,icon,costs,controls);
    layer.append(panel);
    frame.append(layer);
    return {layer,icon,description,costs,ok,cancel,show(kind,faction){
      layer.dataset.faction=faction;
      layer.setAttribute('aria-label',labels[kind]);
      title.textContent=labels[kind];
      art?.then(atlas=>{
        if(layer.getAttribute('aria-label')===labels[kind])title.replaceChildren(caption(labels[kind],atlas));
      }).catch(()=>{});
      icon.hidden=description.hidden=costs.hidden=true;
      setCaption(ok,labels[kind.startsWith('cancel')?'ok':'buy']);
      ok.removeAttribute('data-unaffordable');
      ok.disabled=true;
    }};
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
    hideBuildControls();
    if(keepNativeUntilReady&&!visible){telemetry.mode='waiting-native-frame';return;}
    if(hostPresentation&&visible){chart=null;telemetry.mode='waiting-native-frame';return;}
    setVisible(true);sizeOutput();chart=null;telemetry.mode='waiting-native-frame';
    context.save();context.setTransform(1,0,0,1,0,0);context.fillStyle='#000';
    context.fillRect(0,0,output.width,output.height);context.restore();
  }
  function captureHudLayers(foreground,packet) {
    const layers=foregroundPainter.capture(foreground);
    if(minimapPainter)layers['native-minimap']=minimapPainter.paint(packet,minimapBlack?.());
    return layers;
  }
  function bootstrapModalBackground(scene) {
    const packet=global.WarcraftUiBridge?.bootstrapBackground?.();
    const {g,state,ui,foreground,view}=scene;
    if(!packet?.usable||packet.sceneEpoch!==view?.mapEpoch||!g?.active||!ui?.usable||
      !foreground?.usable||foreground.format!=='WHF3'||foreground.screen.width!==g.width||
      foreground.screen.height!==g.height||packet.screen.width!==g.width||packet.screen.height!==g.height)return false;
    const live=scene.packet;
    if(!live?.usable||live.sceneEpoch!==packet.sceneEpoch)return false;
    // The first complete native raster can still carry an entirely black fade
    // palette. Hold the last finished screen until the native dialog can show.
    if(!live.palette.some((value,index)=>(index&3)!==3&&value!==0))return false;
    // Freeze only the pre-dialog indices; use the palette of the matching frame.
    const paletteKey=[container.clientWidth,container.clientHeight,global.devicePixelRatio,...Object.values(hudInsets),
      ...live.palette].join(',');
    if(bootstrapInUse&&bootstrapPaletteKey===paletteKey&&modalPresenter.hasBackground)return true;
    const displayPacket={...packet,palette:live.palette,paletteRevision:paletteKey};
    const pixels=bootstrapPainter.paint(displayPacket);if(!pixels)return false;
    // A bootstrap is the dialog's background, not a completed presentation.
    const canvas=onPresented?(bootstrapCanvas??=document.createElement('canvas')):output;
    if(canvas===output)setVisible(true);
    const {width,height,dpr}=sizeOutput(canvas);
    const cleanG={...g,cameraX:packet.cameraX,cameraY:packet.cameraY,world:packet.world};
    const world=camera.frame(cleanG,width,height),
      hud=balancedRegions(width,height,cleanG,ui,foreground,state);
    if(!world||!hud)return false;
    const cleanChart=global.WarcraftPresentation.createChart({source:packet.screen,world,width,height,
      map:{fit:'contain'},regions:hud.regions});
    const ctx=canvas===output?context:canvas.getContext('2d');
    cleanChart.render(ctx,pixels,{layers:captureHudLayers(foreground,displayPacket),
      afterMap:cameraPilot?(ctx,map)=>drawWorldOutline(ctx,map,world,cleanG):undefined});
    if(cameraPilot)drawMinimapOutline(ctx,cleanChart,world,cleanG,dpr);
    modalPresenter.captureBackground(canvas,{inGame:true,dialogOpen:false});
    bootstrapInUse=true;bootstrapPaletteKey=paletteKey;
    telemetry.bootstrapEpoch=packet.sceneEpoch;return true;
  }
  function resizeFrozenWorld(width,height,dpr) {
    if(!frozenWorld||(modalBackgroundWidth===width&&modalBackgroundHeight===height&&modalBackgroundDpr===dpr&&
      modalBackgroundInsets===hudInsets))return;
    const {g,world,ui,foreground,state,packet,partialFrame,missingResources}=frozenWorld;
    const extent=g.world;
    const span=Math.max(world.width,world.height);
    const ratio=width/height;
    const w=Math.min(span*Math.min(1,ratio),extent.right-extent.left,(extent.bottom-extent.top)*ratio);
    const h=w/ratio;
    const edgeRoom=mobileEdgeRoom();
    const extraX=edgeRoom?.(w)??0,extraY=edgeRoom?.(h)??0;
    const left=clamp(world.left+(world.width-w)/2,
      extent.left-(g.cameraX===0?extraX:0),extent.right-w+(g.cameraX===g.maxX?extraX:0));
    const top=clamp(world.top+(world.height-h)/2,
      extent.top-(g.cameraY===0?extraY:0),extent.bottom-h+(g.cameraY===g.maxY?extraY:0));
    const crop={...world,left,top,width:w,height:h,visibleGlobal:{
      x:g.cameraX*32+left-extent.left,y:g.cameraY*32+top-extent.top}};
    const hud=balancedRegions(width,height,g,ui,foreground,state);
    if(!hud)return;
    const projection=mapProjection(crop,g,width,height);
    const layout=global.WarcraftPresentation.createChart({source:g,world:projection.source,width,height,
      map:{target:projection.target},regions:hud.regions});
    const canvas=bootstrapCanvas??=document.createElement('canvas');
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    const ctx=canvas.getContext('2d');
    // The same render also paints a live modal. Keep its raster separate from
    // the frozen world source that the browser is copying into the backdrop.
    const pixels=partialFrame?visibleFramePainter.paint(packet,layout):bootstrapPainter.paint(packet);
    layout.render(ctx,pixels,{layers:captureHudLayers(foreground,packet),
      afterMap:(ctx,map)=>drawWorldOutline(ctx,map,crop,g)});
    paintUnavailableCommands(ctx,layout,missingResources);
    drawMinimapOutline(ctx,layout,crop,g,dpr);
    modalPresenter.captureBackground(canvas,{inGame:true,dialogOpen:false});
    modalBackgroundWidth=width;modalBackgroundHeight=height;modalBackgroundDpr=dpr;modalBackgroundInsets=hudInsets;
  }
  function modalTransitionRows(packet, rect) {
    if(!packet?.usable||!rect||rect.right-rect.left!==255||rect.bottom-rect.top!==287||
        rect.right>=packet.screen.width||rect.bottom>=packet.screen.height)return null;
    // Each row is occupied by a button in Pause and by the dialog body in
    // its confirmations. Use two separate rows so the cursor cannot pass
    // this guard while the shared native buffer still shows the old menu.
    return [60,158].map(dy=>{
      const from=(rect.top+dy)*packet.screen.width+rect.left+24;
      return packet.indices.slice(from,from+12);
    });
  }
  function hasModalRaster(back, packet, view) {
    if(!displayedMenuRaster||packet?.sceneEpoch!==displayedMenuRaster.epoch)return true;
    const next=back?.compact;
    if(next===displayedMenuRaster.mode||(next!=='pause'&&next!=='confirmation'))return true;
    const rows=modalTransitionRows(packet,view?.modal?.rect);
    return !rows||rows.every((row,i)=>row.some((value,j)=>value!==displayedMenuRaster.rows[i][j]));
  }
  function render(captureNative=true) {
    if(!installed)return;
    if(captureNative||!lastScene){
      if(enhancedHud&&(!touchOnly||mobilePointer?.matches))cursorPresenter?.update(global.WarcraftUiBridge?.cursorPlane?.(),input);
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
        missingResources: state?.inGame&&!state.dialogOpen ? unaffordableMask(view) : 0,
        partialFrame:matchesGeometry&&visibleFramePainter&&state?.inGame&&!state.dialogOpen&&!completed.dialogRoot&&
          (touchOnly||cameraPilot.coversWorld(g)),
        frame:coherentFrames?(matchesGeometry?completed:null):
          source.width&&source.height?copier.capture(source).frame:null};
    }
    const {g,state,view,ui,foreground,missingResources}=lastScene;
    updateConfirmation(lastScene);
    if(coherentFrames){
      if(lastMapEpoch!==null&&!state?.ready){waitForNativeFrame();return;}
      if(!state?.inGame){lastMapEpoch=null;modalPresenter.reset();camera.reset();lastRenderedGeometry=null;bootstrapInUse=false;bootstrapPaletteKey=null;cleanWorldReady=false;lastWorldPaint=frozenWorld=displayedMenuRaster=null;}
      else if(!view?.mapEpoch){waitForNativeFrame();return;}
      else if(lastMapEpoch!==view.mapEpoch){
        lastMapEpoch=view.mapEpoch;modalPresenter.reset();camera.reset();bootstrapPainter.reset();selectedCommand=null;
        lastRenderedGeometry=null;chart=null;lastDialogToken=null;
        bootstrapInUse=false;bootstrapPaletteKey=null;cleanWorldReady=false;lastWorldPaint=frozenWorld=displayedMenuRaster=null;
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
      const back=modalBack?.(view?.modal);
      if(coherentFrames&&!hasModalRaster(back,lastScene.packet,view)){waitForNativeFrame();return;}
      const width=Math.max(1,Math.floor(container.clientWidth)),height=Math.max(1,Math.floor(container.clientHeight));
      const dpr=enhancedHud?Math.max(1,Math.min(3,global.devicePixelRatio||1)):1;
      if(cameraPilot)resizeFrozenWorld(width,height,dpr);
      const objectiveEnd=objectivesBodyEnd?.(view?.modal,lastScene.packet);
      if(objectiveEnd===null){
        objectivesWaitUntil??=performance.now()+300;
        if(performance.now()<objectivesWaitUntil){waitForNativeFrame();return;}
      }else objectivesWaitUntil=null;
      const modal={inGame:true,dialogOpen:true,packet:view?.modal,panelTexture:modalTexture?.(),
        objectivesBodyEnd:objectiveEnd,
        back,fillBackground:!!onPresented,
        dialogPixelRatio:onPresented?dpr:0,
        leftInset:hudInsets.left>4?hudInsets.left*dpr:0,rightInset:hudInsets.right>4?hudInsets.right*dpr:0};
      const nativeFrame=lastScene.frame;
      const plan=onPresented&&modalPresenter.plan(coherentFrames?nativeFrame?.screen:nativeFrame,
        {...modal,width:Math.round(width*dpr),height:Math.round(height*dpr)});
      if(plan&&plan.mode!=='modal'){waitForNativeFrame();return;}
      let region=coherentFrames?plan?.unionSource:null;
      if(region&&plan.back?.replaceButton){
        const s=plan.back.source,extra=Math.ceil(2/plan.target.scale);
        region={left:Math.max(0,Math.min(region.left,s.left-extra)),
          top:Math.max(0,Math.min(region.top,s.top-s.height-extra*3)),
          right:Math.min(nativeFrame.screen.width,Math.max(region.right,s.right+extra)),bottom:region.bottom};
      }
      // The frozen playfield is already composited. Expand only the indexed
      // native pixels that the dialog samples, in their original coordinates.
      const framePixels=coherentFrames?nativeFramePainter.paint(nativeFrame,region):nativeFrame;
      setVisible(true);
      if(output.width!==Math.round(width*dpr))output.width=Math.round(width*dpr);
      if(output.height!==Math.round(height*dpr))output.height=Math.round(height*dpr);
      const layout=modalPresenter.present(context,framePixels,modal);
      telemetry.mode='dialog';
      if(layout.mode==='modal'){
        const mode=back?.compact;
        const rows=(mode==='pause'||mode==='confirmation')&&modalTransitionRows(lastScene.packet,view?.modal?.rect);
        displayedMenuRaster=rows?{mode,rows,epoch:lastScene.packet.sceneEpoch}:null;
        onPresented?.('dialog',layout);
      }
      return;
    }
    const expanded=g&&(g.columns>14||g.rows>14);
    const commands=g?commandBand(g,ui):null;
    const hudReady=!cleanHud||(ui?.format===(balancedHud?'WUR3':'WUR2')&&foreground?.usable&&
      foreground.format===(balancedHud?'WHF3':'WHF2')&&
      foreground.screen.width===g?.width&&foreground.screen.height===g?.height);
    const ready=g?.active&&expanded&&state?.ready&&state.inGame&&!state.dialogOpen&&
      lastScene.frame&&source.width===g.width&&source.height===g.height&&input.width===g.width&&input.height===g.height&&g.width>=640&&g.height>=480&&commands&&hudReady;
    if(!ready){hideBuildControls();if(coherentFrames&&state?.inGame)waitForNativeFrame();else setVisible(false);return;}
    try {
      bootstrapInUse=false;bootstrapPaletteKey=null;
      lastDialogToken=objectivesWaitUntil=null;
      displayedMenuRaster=null;
      const width=Math.max(1,Math.floor(container.clientWidth)),height=Math.max(1,Math.floor(container.clientHeight));
      const dpr=enhancedHud?Math.max(1,Math.min(3,global.devicePixelRatio||1)):1;
      const pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);
      const receipt=cameraPilot&&view?.usable&&lastScene.packet?.usable
        ? {currentCamera:view.currentCamera,sequence:lastScene.packet.sequence}:undefined;
      const world=enhancedHud?camera.frame(g,width,height,undefined,receipt,mobileEdgeRoom()):
        croppedWorld(g,width,height);
      if(coherentFrames&&!world){waitForNativeFrame();return;}
      const previousPaint=lastWorldPaint;
      let key,sameWorld=false;
      if(cameraPilot){
        key=[lastScene.packet.sceneEpoch,ui.revision,foreground.revision,view?.selectionToken,state.selectionCount,
          missingResources,state.buildingPending,state.inputAllowed,width,height,dpr,hudInsets,
          g.width,g.height,g.mapWidth,g.mapHeight,g.cameraX,g.cameraY,g.world.left,g.world.top,g.world.right,g.world.bottom,
          world.left,world.top,world.width,world.height,world.visibleGlobal.x,world.visibleGlobal.y];
        sameWorld=visible&&telemetry.mode==='world'&&chart&&output.width===pixelWidth&&output.height===pixelHeight&&
          !context.isContextLost?.()&&previousPaint?.key.every((value,index)=>value===key[index]);
        if(sameWorld&&previousPaint.packet===lastScene.packet){
          updateBuildConfirm(state,'world');
          updateCommandHighlight();
          performanceStats.reusedWorldFrames++;
          scheduleAnimation();
          return;
        }
      }
      const hud=balancedHud?balancedRegions(width,height,g,ui,foreground,state):
        cleanHud?cleanRegions(width,height,g,ui,foreground,state):null;
      if(cleanHud&&!hud){if(coherentFrames)waitForNativeFrame();else setVisible(false);return;}
      const projection=mapProjection(world,g,width,height);
      const nextChart=global.WarcraftPresentation.createChart({source:{width:g.width,height:g.height},
        world:projection.source,width,height,map:{fit:'contain',target:projection.target},
        regions:hud?.regions||regions(width,height,g,commands),
        provenance:{source:g.source,revision:g.revision,nativeWorld:g.world}});
      const framePixels=lastScene.partialFrame?visibleFramePainter.paint(lastScene.packet,nextChart,!camera.active):
        coherentFrames?nativeFramePainter.paint(lastScene.frame):lastScene.frame;
      // A new native packet still advances input and freeze geometry. The
      // previous display can remain only when every sampled tile and the HUD
      // and viewport keys are identical to that exact displayed packet.
      const reuseComposition=sameWorld&&!performanceStats.forceWorldComposition&&!camera.active&&
        lastScene.partialFrame&&previousPaint.partialFrame&&visibleFramePainter.unchangedFrom(previousPaint.packet);
      setVisible(true);
      chart=nextChart;
      telemetry.mode='world';
      if(reuseComposition)performanceStats.reusedWorldCompositions++;
      else{
        const layers=balancedHud?captureHudLayers(foreground,lastScene.packet):
          hud?{'native-hud-foreground':foregroundPainter.capture(foreground).frame}:{};
        if(output.width!==pixelWidth)output.width=pixelWidth;
        if(output.height!==pixelHeight)output.height=pixelHeight;
        chart.render(context,framePixels,{layers,
          afterMap:cameraPilot?(ctx,map)=>drawWorldOutline(ctx,map,world,g):undefined});
        paintUnavailableCommands(context,chart,missingResources);
        if(cameraPilot){drawMinimapOutline(context,chart,world,g,dpr);performanceStats.composedWorldFrames++;}
        else if(camera?.independent)drawMinimapView(world,g,dpr);
      }
      if(cameraPilot)lastWorldPaint={key,packet:lastScene.packet,partialFrame:lastScene.partialFrame};
      lastRenderedGeometry=g;
      updateBuildConfirm(state,'world');
      if(cameraPilot){
        const hasCancel=hud.regions.some(region=>region.isCancel)||!!(placement&&!placement.layer.hidden&&!placement.cancel.hidden);
        if(hasCancel!==('warcraftCancelVisible' in frame.dataset))frame.toggleAttribute('data-warcraft-cancel-visible',hasCancel);
      }
      if(enhancedHud){
        if(cameraPilot){
          cleanWorldReady=true;
          frozenWorld={g,world,ui,foreground,state,width,height,dpr,hudInsets,
            packet:lastScene.packet,partialFrame:lastScene.partialFrame,missingResources};
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
        ...(lastScene.partialFrame?{cameraMode:camera.independent?'independent':'native-crop',visiblePaint:visibleFramePainter.debug()}:{}),
        hud:hud?{header: hud.header,commandCount:hud.commandCount,foregroundRevision:foreground.revision,unaffordableMask:missingResources,
          infoLayoutMode:foreground.infoLayoutMode}:null};
      onPresented?.('world',chart);
    } catch(error) {
      if(telemetry.errors.length<8)telemetry.errors.push(String(error));
      if(coherentFrames&&state?.inGame)waitForNativeFrame();else setVisible(false);
      console.error('[Warcraft map presentation]',error);
    }
  }
  function pick(event,rect,{captured=false}={}) {
    if(pendingConfirmation)return {kind:'blocked'};
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
    let point=pick(event,rect,options);
    if(!point&&cameraPilot&&touchOnly&&telemetry.mode==='world'&&acceptsInput?.()!==false){
      const inside=event.clientX>=rect.left&&event.clientX<rect.left+rect.width&&
        event.clientY>=rect.top&&event.clientY<rect.top+rect.height;
      if(inside&&chart){
        const edge=pick(event,rect,{captured:true});
        if(edge)point={...edge,padding:true};
      }
    }
    if(point?.kind!=='world')return null;
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
  function paintUnavailableCommands(ctx,layout,mask) {
    if(!mask)return;
    const {width,height}=ctx.canvas;
    const scale=Math.min(width/layout.width,height/layout.height);
    ctx.save();
    ctx.setTransform(scale,0,0,scale,(width-layout.width*scale)/2,(height-layout.height*scale)/2);
    ctx.beginPath();
    for(const region of layout.regions){
      if(!region.visible||!region.id.startsWith('command-')||!(mask&(1<<Number(region.id.slice(8)))))continue;
      const box=region.visible;
      ctx.rect(box.left,box.top,box.width,box.height);
    }
    // Saturation uses the native icon's luminance and removes only its chroma.
    ctx.globalCompositeOperation='saturation';
    ctx.fillStyle='#808080';
    ctx.fill();
    ctx.restore();
  }
  function drawWorldOutline(context,map,world,g) {
    const edge=.001,origin=world.visibleGlobal;
    const width=g.mapWidth*32,height=g.mapHeight*32;
    context.fillStyle='#fff';
    // Paint only the real map edge. A moving camera crop is not a map limit.
    if(origin.x<=edge)context.fillRect(map.left,map.top,1,map.height);
    if(origin.y<=edge)context.fillRect(map.left,map.top,map.width,1);
    if(origin.x+world.width>=width-edge)context.fillRect(map.right-1,map.top,1,map.height);
    if(origin.y+world.height>=height-edge)context.fillRect(map.left,map.bottom-1,map.width,1);
  }
  function drawMinimapOutline(context,layout,world,g,dpr) {
    const mini=layout.regions.find(region=>region.id==='minimap')?.transform.painted;
    if(!mini)return;
    context.save();
    context.setTransform(dpr,0,0,dpr,0,0);
    context.strokeStyle='#fff';
    context.strokeRect(mini.left+.5,mini.top+.5,mini.width-1,mini.height-1);
    context.restore();
    drawMinimapView(world,g,dpr,context,layout);
  }
  function drawMinimapView(world,g,dpr,ctx=context,layout=chart) {
    const mini=layout.regions.find(region=>region.id==='minimap')?.transform.painted;
    if(!mini)return;
    const width=g.mapWidth*32,height=g.mapHeight*32,sx=mini.width/width,sy=mini.height/height;
    const left=clamp(world.visibleGlobal.x,0,width),top=clamp(world.visibleGlobal.y,0,height);
    const right=clamp(world.visibleGlobal.x+world.width,0,width);
    const bottom=clamp(world.visibleGlobal.y+world.height,0,height);
    ctx.save();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.strokeStyle='#fff7df';
    ctx.strokeRect(mini.left+left*sx+.5,mini.top+top*sy+.5,
      Math.max(0,(right-left)*sx-1),Math.max(0,(bottom-top)*sy-1));
    ctx.restore();
  }
  function moveByMinimap(event) {
    const state=global.WarcraftUiBridge.state(),g=lastRenderedGeometry;
    if(!camera?.centerOn||telemetry.mode!=='world'||!g||!state.inputAllowed||
      state.targetPending||state.buildingPending)return false;
    const mini=chart?.regions.find(region=>region.id==='minimap');
    const point=pick(event,input.getBoundingClientRect());
    if(!mini||point?.regionId!=='minimap')return false;
    const {source}=mini;
    const handled = camera.centerOn((point.x-source.left)*g.mapWidth*32/source.width,
      (point.y-source.top)*g.mapHeight*32/source.height);
    if (handled) scheduleAnimation(true);
    return handled;
  }
  function portraitAt(event) {
    if(!infoFocus||!camera?.centerOn||telemetry.mode!=='world'||!lastRenderedGeometry)return null;
    const point=pick(event,input.getBoundingClientRect());
    if(point?.regionId!=='info')return null;
    const bridge=global.WarcraftUiBridge,state=bridge.state(),selection=bridge.viewState();
    const layer=lastScene?.foreground?.layers.find(item=>item.id===100);
    if(!state.inputAllowed||state.dialogOpen||state.targetPending||state.buildingPending||
      !selection?.selectionToken||!layer)return {};
    const target=infoFocus(layer,point,selection,lastRenderedGeometry,event.shiftKey);
    return {...target, token:selection.selectionToken, epoch:selection.mapEpoch};
  }
  function cancelButtons() {
    minimapDrag=false;
    sliderDrag=null;
    portraitPress=null;
    infoPress=false;
    if(!held.size)return;
    const g=nativeGeometry(),point=g?{x:g.width-1,y:g.height-1}:lastNative;
    if(point)moveNative(point);
    for(const button of held)global.WarcraftUiBridge.nativeButton(0,button,lastNative.x,lastNative.y);
    held.clear();
    // Earlier gesture listeners may already have cancelled the shared fence.
    // Drop the raw HUD release just queued above as well; release actual holds.
    global.WarcraftUiBridge.cancelPendingInput?.();
  }
  function listen(type,listener,options={}) {
    global.addEventListener(type,listener,{...options,signal:listeners.signal});
  }
  function installModalSliderInput() {
    const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
    function finish(event) {
      const drag=sliderDrag;
      if(event.pointerId!==drag?.id)return;
      sliderDrag=null;
      if(event.type==='pointerup')moveSlider(event,drag,true);
      if(drag.started&&held.delete(0))global.WarcraftUiBridge.nativeButton(0,0,lastNative.x,lastNative.y);
      stop(event);
    }
    function moveSlider(event,drag,released=false) {
      if(telemetry.mode!=='dialog'||drag.token!==lastDialogToken)return;
      const axis=global.WarcraftAssemblyDialogLayout.volumeDragAxis(drag,event.clientX,event.clientY);
      if(axis==='vertical'||(!axis&&!released))return;
      const rect=input.getBoundingClientRect(),layout=modalPresenter.layout,t=layout.target,s=layout.source;
      if(!t||!s||!rect.width)return;
      const px=(event.clientX-rect.left)*layout.width/rect.width;
      const row=layout.strips?.find(({kind,source})=>kind==='slider'&&
        drag.slider.y>=source.top&&drag.slider.y<source.bottom);
      const x=row ? row.source.left+(px-row.target.left)*row.source.width/row.target.width :
        s.left+(px-t.left)/t.scale;
      moveNative({x:clamp(x,drag.slider.left,drag.slider.right),y:drag.slider.y});
      if(!drag.started){
        drag.started=true;
        held.add(0);
        global.WarcraftUiBridge.nativeButton(1,0,lastNative.x,lastNative.y);
      }
    }
    const capture={capture:true,passive:false};
    listen('pointerdown',event=>{
      if(event.target!==input||event.button!==0||event.isPrimary===false||
        sliderDrag||telemetry.mode!=='dialog')return;
      const point=pick(event,input.getBoundingClientRect());
      if(point?.regionId!=='native-modal')return;
      const layout=modalPresenter.layout;
      const layer=layout.layers.find(item=>item.root===layout.token);
      const slider=modalSlider(layer,point.x,point.y);
      if(!slider)return;
      stop(event);
      input.focus({preventScroll:true});
      sliderDrag={id:event.pointerId,token:lastDialogToken,slider,x:event.clientX,y:event.clientY};
      try{input.setPointerCapture(event.pointerId);}catch(_){}
    },capture);
    listen('pointermove',event=>{
      if(event.pointerId!==sliderDrag?.id)return;
      moveSlider(event,sliderDrag);
      stop(event);
    },capture);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])
      listen(type,finish,capture);
  }
  function installInputRouter() {
    if(routerInstalled)return;routerInstalled=true;
    const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
    const inScope=event=>event.target===input;
    let portraitMouse=null,lastPortraitTap=null;
    const isPortraitMouse=event=>portraitMouse&&event.button===0&&inScope(event)&&telemetry.mode==='world'&&
      Math.hypot(event.clientX-portraitMouse.x,event.clientY-portraitMouse.y)<=8;
    if(infoFocus&&cameraPilot){
      const capture={capture:true,passive:false};
      listen('pointerdown',event=>{
        if(event.button!==0||event.isPrimary===false)return;
        portraitMouse=null;
        const previous=lastPortraitTap;
        lastPortraitTap=null;
        if(!inScope(event)||portraitPress)return;
        const focus=portraitAt(event);
        if(!focus||focus.native)return;
        portraitPress={id:event.pointerId,x:event.clientX,y:event.clientY,focus,previous};
        // A legacy mouse event after pointerup still belongs to this portrait.
        // Forwarding it would stop the host jump and run the original recenter too.
        portraitMouse=portraitPress;
        try{input.setPointerCapture(event.pointerId);}catch(_){}
        input.focus({preventScroll:true});
        stop(event);
      },capture);
      listen('pointermove',event=>{
        if(event.pointerId!==portraitPress?.id)return;
        if(Math.hypot(event.clientX-portraitPress.x,event.clientY-portraitPress.y)>8)portraitPress.cancelled=true;
        stop(event);
      },capture);
      for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(name,event=>{
        const press=portraitPress;
        if(event.pointerId!==press?.id)return;
        portraitPress=null;
        stop(event);
        if(name!=='pointerup'||press.cancelled||!press.focus.unit||
          Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)return;
        const target=portraitAt(event);
        if(target?.unit!==press.focus.unit||target.token!==press.focus.token||target.epoch!==press.focus.epoch)return;
        if(event.pointerType==='touch'&&target.group){
          const previous=press.previous,elapsed=event.timeStamp-previous?.time;
          if(target.unit===previous?.unit&&target.token===previous?.token&&target.epoch===previous?.epoch&&
              chart?.width===previous.width&&chart?.height===previous.height&&elapsed>=0&&elapsed<=300) {
            // The native portrait callback selects just this unit, with
            // the original selection response and command synchronization.
            const bridge=global.WarcraftUiBridge;
            moveNative({x:target.nativeX,y:target.nativeY});
            bridge.nativeButton(1,0,lastNative.x,lastNative.y);
            bridge.nativeButton(0,0,lastNative.x,lastNative.y);
            return;
          }
          lastPortraitTap={unit:target.unit,token:target.token,epoch:target.epoch,time:event.timeStamp,
            width:chart?.width,height:chart?.height};
        }
        if(camera.centerOn(target.x,target.y,{useEdgeRoom:true}))scheduleAnimation(true);
      },capture);
    }
    // A finger does not reliably emit the compatibility mouse click on WebKit
    // when the surface owns touch gestures. Use the same minimap hit test.
    if(cameraPilot){
      let touch=null;
      listen('pointerdown',event=>{
        if(event.pointerType==='touch'&&inScope(event)&&moveByMinimap(event)){
          touch=event.pointerId;
          input.setPointerCapture?.(touch);
          stop(event);
        }
      },{capture:true,passive:false});
      listen('pointermove',event=>{
        if(event.pointerId===touch){moveByMinimap(event);stop(event);}
      },{capture:true,passive:false});
      for(const name of ['pointerup','pointercancel','lostpointercapture']){
        listen(name,event=>{
          if(event.pointerId!==touch)return;
          touch=null;
          if(name==='pointerup')moveByMinimap(event);
          stop(event);
        },{capture:true,passive:false});
      }
    }
    listen('mousemove',event=>{
      if(minimapDrag){moveByMinimap(event);stop(event);return;}
      if(!visible||(!inScope(event)&&!held.size))return;
      if(buildConfirm&&telemetry.mode==='world'&&global.WarcraftUiBridge.state().buildingPending){stop(event);return;}
      const selected=enhancedHud&&telemetry.mode!=='dialog'?validSelectedCommand():null;
      const point=selected?{x:selected.nativeX,y:selected.nativeY,kind:'native-ui'}:pick(event,input.getBoundingClientRect());
      if(point&&point.kind!=='blocked')moveNative(point);stop(event);
    },{capture:true,passive:false});
    listen('mousedown',event=>{
      if(!visible||!inScope(event)||![0,1,2].includes(event.button))return;
      if(isPortraitMouse(event)){stop(event);return;}
      if(enhancedHud){camera.stop();selectedCommand=null;}
      if(event.button===0&&moveByMinimap(event)){minimapDrag=true;stop(event);return;}
      const point=pick(event,input.getBoundingClientRect());stop(event);
      if(!point||point.kind==='blocked')return;
      infoPress=touchOnly&&event.button===0&&point.regionId==='info';
      input.focus({preventScroll:true});moveNative(point);
      const button=nativeButton(event.button);held.add(button);
      global.WarcraftUiBridge.nativeButton(1,button,lastNative.x,lastNative.y);
    },{capture:true,passive:false});
    listen('mouseup',event=>{
      if(!held.has(0)&&isPortraitMouse(event)){stop(event);return;}
      if(minimapDrag&&event.button===0){minimapDrag=false;moveByMinimap(event);stop(event);return;}
      const button=nativeButton(event.button);if(!held.has(button))return;
      const point=visible?pick(event,input.getBoundingClientRect()):null;
      if(point&&point.kind!=='blocked')moveNative(point);
      else {const g=nativeGeometry();if(g)moveNative({x:g.width-1,y:g.height-1});}
      global.WarcraftUiBridge.nativeButton(0,button,lastNative.x,lastNative.y);held.delete(button);stop(event);
      if(infoPress&&button===0){
        infoPress=false;
        const info=chart?.regions.find(region=>region.id==='info');
        const commands=global.WarcraftUiBridge.uiRects?.();
        const below=info&&info.source.bottom;
        // Leave the portrait in its own native move, so its hover-exit cannot
        // clear the next command's tooltip during the same native dispatch.
        if(point?.regionId==='info'&&commands?.usable&&commands.root.native.top>below)
          moveNative({x:info.source.left+info.source.width/2,y:(below+commands.root.native.top)/2});
      }
    },{capture:true,passive:false});
    listen('blur',event=>{if(event.target===global)cancelButtons();},{capture:true});
    listen('pointercancel',()=>cancelButtons(),{capture:true});
    listen('lostpointercapture',event=>{
      if(event.pointerType!=='mouse'||event.buttons)cancelButtons();
    },{capture:true});
    listen('contextmenu',event=>{if(visible&&inScope(event))stop(event);},{capture:true,passive:false});
  }
  let cameraPilot,hostPresentation,modalTexture,infoButtons,infoFocus,objectivesBodyEnd,touchOnly=false;
  function install(host) {
    if(installed)return;
    listeners=new AbortController();
    keepNativeUntilReady=!!host;
    cameraPilot=coherentFrames?host?.independentCamera:null;
    infoButtons=host?.infoButtons;
    infoFocus=host?.infoFocus;
    objectivesBodyEnd=host?.objectivesBodyEnd;
    touchOnly=global.matchMedia?.('(pointer: coarse)').matches===true;
    source=host?.source || document.getElementById('boxedwine-webgl-canvas-0');
    display=host?.display || source;
    input=host?.input || document.getElementById('canvas');
    frame=host?.frame || input.parentElement;
    hostPresentation=frame.classList.contains('warcraft-owns-presentation');
    modalTexture=host?.modalTexture;
    modalFaction=host?.modalFaction;
    purchaseTooltipMatches=host?.purchaseTooltipMatches;
    unavailableCommands=host?.unavailableCommands;
    placementUnaffordable=host?.placementUnaffordable;
    cancellationTarget=host?.cancellationTarget;
    if(hostPresentation&&coherentFrames&&modalFaction&&purchaseTooltipMatches)actionDialog=createActionDialog();
    onPresented=host?.onPresented;
    onUnavailable=host?.onUnavailable;
    acceptsInput=host?.acceptsInput;
    modalBack=host?.modalBack;
    modalSlider=host?.modalSlider;
    if(modalSlider)installModalSliderInput();
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
      insetObserver=new global.ResizeObserver(measureInsets);
      insetProbes=Object.values(probes);
      for(const probe of insetProbes)insetObserver.observe(probe);
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
      buildConfirm.hidden=buildConfirm.disabled=true;
      if(modalFaction&&global.WarcraftSessionText&&global.WarcraftAssemblyDialogLayout){
        const layer=document.createElement('div');
        layer.className='warcraft-placement-controls';layer.hidden=true;
        const cancel=document.createElement('button');
        cancel.id='warcraft-build-cancel';cancel.type='button';cancel.hidden=true;
        cancel.setAttribute('data-warcraft-native-click','');
        const locale=global.WarcraftLanguage?.current()==='ru'?'ru':'en';
        const labels=locale==='ru'?['Поставить','Отмена']:['Place','Cancel'];
        const font=global.WarcraftSessionText;
        for(const [button,label] of [[buildConfirm,labels[0]],[cancel,labels[1]]]){
          button.textContent=label;
          button.setAttribute('aria-label',label);
          font.load(locale).then(atlas=>{
            const ink=new Image();ink.src=font.ink(label,atlas).toDataURL();ink.alt='';ink.draggable=false;
            button.replaceChildren(ink);
          }).catch(console.error);
        }
        cancel.addEventListener('click',()=>requestActionCancellation());
        layer.append(buildConfirm,cancel);frame.append(layer);
        placement={layer,cancel};
      }else{
        buildConfirm.style.width=confirmSize.width+'px';
        buildConfirm.style.minHeight=confirmSize.height+'px';
        buildConfirm.setAttribute('aria-label','Подтвердить строительство');
        const art=document.createElement('img');
        art.src=document.documentElement.classList.contains('warcraft-page')?'./build-confirm.png':'/build-confirm.png';
        art.alt='OK';art.draggable=false;
        buildConfirm.append(art);frame.append(buildConfirm);
      }
      buildConfirm.addEventListener('click',()=>{
        if(telemetry.mode==='world'&&acceptsInput?.()!==false&&placementUnaffordable?.()!==true&&
            global.WarcraftDuneControls?.confirmBuilding())buildConfirm.disabled=true;
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
    if(cameraPilot){
      minimapBlack=host?.minimapBlack;
      minimapPainter=global.WarcraftHudForeground.createMinimapPainter(global.WarcraftHudLayout.nativeMinimap);
    }
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
    const resize=()=>{camera?.stop();cancelButtons();global.WarcraftDuneControls?.cancel?.();render();};
    listen('resize',resize);
    if(cameraPilot)output.addEventListener('contextrestored',()=>{
      lastWorldPaint=null;scheduleAnimation(true);
    },{signal:listeners.signal});
    document.addEventListener('fullscreenchange',resize,{signal:listeners.signal});
    installed=true;
    if(host)return uninstall;
  }
  function uninstall() {
    if(!installed)return;
    installed=routerInstalled=false;
    listeners.abort();
    insetObserver?.disconnect();
    for(const probe of insetProbes||[])probe.remove();
    insetObserver=insetProbes=null;
    if(animation!==null)global.cancelAnimationFrame(animation);
    animation=null;
    cancelButtons();
    camera?.reset();
    setVisible(false);
    cursorPresenter?.update(null,input);
    output.remove();
    commandHighlight?.remove();
    buildConfirm?.remove();
    placement?.layer.remove();
    placement=null;
    actionDialog?.layer.remove();
    actionDialog=modalFaction=purchaseTooltipMatches=null;
    unavailableCommands=placementUnaffordable=cancellationTarget=null;
    output=context=copier=buildConfirm=commandHighlight=null;
    lastScene=lastNative=lastRenderedGeometry=lastDialogToken=selectedCommand=lastMapEpoch=displayedMenuRaster=objectivesWaitUntil=null;
    camera=modalPresenter=cursorPresenter=foregroundPainter=bootstrapPainter=nativeFramePainter=visibleFramePainter=bootstrapCanvas=null;
    minimapPainter=minimapBlack=null;
    onPresented=onUnavailable=acceptsInput=modalBack=modalSlider=modalTexture=infoButtons=infoFocus=objectivesBodyEnd=null;
    bootstrapInUse=false;
    bootstrapPaletteKey=modalBackgroundInsets=null;
    modalBackgroundWidth=modalBackgroundHeight=modalBackgroundDpr=0;
    telemetry.mode='native';telemetry.geometry=null;
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
    getHudCommand,getHudContextToken,selectHudCommand,requestHudPurchase,
    canHandleActionCancellation,requestActionCancellation,
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
