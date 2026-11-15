/* Experimental UI transport. Original BNE decides selection, orders and camera bounds. */
(function (global) {
  'use strict';
  const SCAN_CTRL = 224, SCAN_ALT = 226;
  // The pinned Boxedwine maps F10 and PrintScreen to the same X11 keycode.
  // V12 adds a unique F6 alias; older frozen adapters retain their old protocol.
  const modernInput=['v12','v13','v14','v15','v16'].includes(new URLSearchParams(location.search).get('bridge'));
  const enhancedInput=['v15','v16'].includes(new URLSearchParams(location.search).get('bridge'));
  const coherentFrames=new URLSearchParams(location.search).get('bridge')==='v16';
  const cameraAhead=coherentFrames&&global.WarcraftSmoothCamera.ahead;
  const scans = {clear:64, clearEmpty:62, left:65, right:66,
    up:modernInput?63:67, down:68, poll:69, rememberTouch:70, restoreTouch:71};
  let root = null;
  let transport = null;
  let transportGeneration = 0;
  const guestPath = path => root + '/home/username/.wine/drive_c/' + path;
  const guestReady = () => !!transport || !!root && typeof FS !== 'undefined';
  const readPacket = path => transport ? transport.read(path) : FS.readFile(guestPath(path));
  const writePacket = (path, bytes) => transport ? transport.write(path, bytes) : FS.writeFile(guestPath(path), bytes);
  let controller = null;
  let viewportReader = null;
  let completedFrameReader = null;
  let cameraSerial = 0;
  const cameraPath=kind=>'wc2-runtime-v16/wc2-pan-'+kind+'.bin';
  const nativeViewportMode = ['v5','v6','v7','v8','v9','v10','v12','v13','v14','v15','v16'].includes(new URLSearchParams(location.search).get('bridge'));
  const telemetry = {commands:0, errors:[], prepared:false};
  function nativeGeometry() {
    const value=viewportReader?.getNativeGeometry();
    if(!value)return null;
    const display=transport?.surface || document.getElementById('boxedwine-webgl-canvas-0');
    const input=transport?.input || document.getElementById('canvas');
    return display?.width===value.width&&display.height===value.height&&
      input?.width===value.width&&input.height===value.height?value:null;
  }
  // These files are written from one cooperative native thread. Their
  // headers change revision only after an entire new packet is published.
  function packetReader(path, parser) {
    let previous;
    return () => {
      const bytes=readPacket(path);
      if(!transport||!coherentFrames)return parser(bytes);
      const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if(header.byteLength<16)return parser(bytes);
      const magic=header.getUint32(0,true),revision=header.getUint32(8,true);
      if(previous?.generation===transportGeneration&&previous.magic===magic&&previous.revision===revision&&previous.length===bytes.byteLength)
        return previous.packet;
      const packet=parser(new Uint8Array(bytes));
      previous={generation:transportGeneration,magic,revision,length:bytes.byteLength,packet};
      return packet;
    };
  }
  const readUiRects=packetReader('wc2-ui-rects.bin',bytes=>global.WarcraftNativeUiRects.parse(bytes));
  const readHud=packetReader('wc2-hud-foreground.bin',bytes=>global.WarcraftHudForeground.parse(bytes));
  const readCursor=packetReader('wc2-cursor.bin',bytes=>global.WarcraftCursorV15.parse(bytes));
  function nativeUiRects() {
    if(!guestReady()||!global.WarcraftNativeUiRects)return null;
    try {
      const packet=readUiRects();
      const g=viewportReader?.snapshot();
      return packet.usable&&g&&packet.screen.width===g.width&&packet.screen.height===g.height?packet:null;
    } catch(_){return null;}
  }
  function snapshot() {
    const empty = {inGame:false, modal:true, selectionCount:0, targetPending:false, ready:false};
    if (!guestReady()) return empty;
    try {
      const bytes = readPacket('wc2-ui-state.bin');
      if (bytes.length !== 24 || String.fromCharCode(...bytes.subarray(0,4)) !== 'WUI1') return empty;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint16(4,true) !== 24 || bytes[8] > 9) return empty;
      const flags = bytes[10];
      return {ready:!!(flags&4), inGame:!!(flags&1), modal:!(flags&2), dialogOpen:!!(flags&8), inputAllowed:!!(flags&2),
        selectionCount:bytes[8], targetPending:!!(bytes[9]&3), buildingPending:!!(bytes[9]&1), modes:bytes[9],
        sequence:view.getUint16(6,true), hooks:bytes[11],
        cameraX:view.getInt16(12,true), cameraY:view.getInt16(14,true),
        maxX:view.getInt16(16,true), maxY:view.getInt16(18,true),
        uiThread:view.getUint32(20,true)};
    } catch (_) { return empty; }
  }
  function key(scan, down) {
    Module._boxedwineEmscriptenKey(scan, 0x40000000 | scan, down ? 1 : 0);
  }
  function command(name) {
    if (!snapshot().ready || (!transport && !Module._boxedwineEmscriptenKey)) return false;
    const scan = scans[name];
    if (!scan) return false;
    if(transport){
      if(!transport.command(scan))return false;
      telemetry.commands++;
      return true;
    }
    key(SCAN_CTRL,true); key(SCAN_ALT,true);
    try { key(scan,true); key(scan,false); }
    finally { key(SCAN_ALT,false); key(SCAN_CTRL,false); }
    telemetry.commands++;
    return true;
  }
  function mouseMove(x,y) {
    if(transport)transport.move(x,y);
    else Module._boxedwineEmscriptenMouseMove(x,y);
  }
  function mouseButton(down,button,x,y) {
    if(transport)return transport.button(down,button,x,y);
    else Module._boxedwineEmscriptenMouseButton(down,button,x,y);
  }
  const actualHeld=new Set();
  let actualPoint={x:320,y:240};
  function releaseActualButtons() {
    for(const button of actualHeld)
      mouseButton(0,button,actualPoint.x,actualPoint.y);
    actualHeld.clear();
  }
  function emptyClickAck() {
    if(!guestReady())return null;
    try {
      const bytes=readPacket('wc2-empty-click.bin');
      if(bytes.length!==24)return null;
      const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if(v.getUint32(0,true)!==0x31434557||v.getUint32(4,true)!==24||v.getUint32(12,true)>3)return null;
      return {sequence:v.getUint32(8,true),status:v.getUint32(12,true)};
    } catch(_){return null;}
  }
  function sendCamera(action) {
    const view=backend.viewState();
    if(!view?.usable||!view.mapEpoch)return false;
    const from=action.origin||view.currentCamera;
    if(from.x!==view.currentCamera.x||from.y!==view.currentCamera.y)return false;
    const [dx,dy]=action.args,bytes=new Uint8Array(24),packet=new DataView(bytes.buffer);
    const serial=++cameraSerial;
    packet.setUint32(0,0x31504357,true); // WCP1
    packet.setUint16(4,bytes.length,true);packet.setUint16(6,1,true);
    packet.setUint32(8,serial,true);packet.setUint32(12,view.mapEpoch,true);
    packet.setInt16(16,from.x,true);packet.setInt16(18,from.y,true);
    packet.setInt16(20,from.x+dx,true);packet.setInt16(22,from.y+dy,true);
    writePacket(cameraPath('request'),bytes);
    if(!command('poll'))return false;
    action.serial=serial;
    return true;
  }
  function sendAction(action) {
    if(action.type==='buildingTarget'){
      const current=snapshot();
      const point=buildingDestination(action.world);
      if(!current.inputAllowed||!current.buildingPending||!point||
        action.context!==buildingContext())return false;
      const x=Math.round(point.x),y=Math.round(point.y);
      sendAction({type:'move',args:[x,y]});
      if(action.confirm&&sendAction({type:'button',args:[1,0,x,y]})!==false)
        sendAction({type:'button',args:[0,0,x,y]});
      return;
    }
    if(action.type==='touchOrder'){
      const current=snapshot();
      const map=global.WarcraftFullMap;
      const p=map?.globalToWorld(action.x,action.y),world=nativeGeometry()?.world;
      if(!p || !world || !map.cameraSettled || !current.inputAllowed || current.targetPending ||
        action.epoch!==backend.viewState()?.mapEpoch)return;
      const x=Math.floor(p.x),y=Math.floor(p.y);
      if(x<world.left || x>=world.right || y<world.top || y>=world.bottom)return;
      sendAction({type:'move',args:[x,y]});
      if(sendAction({type:'button',args:[1,1,x,y]})!==false)
        sendAction({type:'button',args:[0,1,x,y]});
      return;
    }
    if(action.type==='worldMove'||action.type==='worldButton'){
      const button=action.type==='worldButton',args=action.args;
      const p=global.WarcraftFullMap?.globalToWorld(args[button?2:0],args[button?3:1]);
      if(!p)throw new Error('World input waits for native geometry');
      action=button?{type:'button',args:[args[0],args[1],p.x,p.y]}:{type:'move',args:[p.x,p.y]};
    }
    if(action.type==='move') {
      const [x,y]=action.args.map(Math.round);actualPoint={x,y};
      mouseMove(x,y);
    } else if(action.type==='button') {
      const [down,button,x,y]=action.args;actualPoint={x:Math.round(x),y:Math.round(y)};
      if(mouseButton(down?1:0,button,actualPoint.x,actualPoint.y)===false)return false;
      if(down)actualHeld.add(button);else actualHeld.delete(button);
    } else if(action.type==='clearEmpty') {
      return command('clearEmpty');
    } else if(action.type==='restoreTouch') {
      return command('restoreTouch');
    } else if(action.type==='command')command(action.args[0]);
    else if(action.type==='pan') {
      if(cameraAhead)return sendCamera(action);
      let [dx,dy]=action.args;
      ({dx,dy}=global.WarcraftFullMap?.consumePan(dx,dy)||{dx,dy});
      let sent=false;
      for(let n=0;n<Math.min(8,Math.abs(dx));n++)sent=command(dx<0?'left':'right')||sent;
      for(let n=0;n<Math.min(8,Math.abs(dy));n++)sent=command(dy<0?'up':'down')||sent;
      return sent;
    }
  }
  const fence=modernInput ?
    global.WarcraftInputFence.createInputFence({send:sendAction,readAck:emptyClickAck,
      schedule:(fn,ms)=>global.setTimeout(fn,ms),clearSchedule:id=>global.clearTimeout(id),now:()=>Date.now(),
      onError:error=>{if(telemetry.errors.length<8)telemetry.errors.push(String(error));releaseActualButtons();}}):null;
  function directDispatch(action) {
    if(action.type==='emptyBarrier')return fence.barrier();
    if(action.type==='touchOrder')return fence.barrier('restoreTouch',action);
    return fence?fence.dispatch(action):sendAction(action);
  }
  const cameraGate=enhancedInput?global.WarcraftCameraInputGateV15.createGate({
    send:directDispatch,ready:()=>{
      const map=global.WarcraftFullMap;
      if(!map?.cameraSettled)return false;
      const view=backend.viewState();
      if(coherentFrames){
        const frame=backend.completedFrame();
        if(!view?.usable||!frame?.usable||frame.sceneEpoch!==view.mapEpoch)return false;
        if(map.telemetry.mode==='dialog')return !!frame.dialogRoot&&frame.dialogRoot===view.dialogAddress;
        return view.currentCamera.x===frame.cameraX&&view.currentCamera.y===frame.cameraY;
      }
      return !view?.usable||!view.presented||
        (view.currentCamera.x===view.presented.cameraX&&view.currentCamera.y===view.presented.cameraY);
    },schedule:(fn,ms)=>global.setTimeout(fn,ms),clearSchedule:id=>global.clearTimeout(id),now:()=>Date.now(),
    onAbort:()=>{fence?.cancel();releaseActualButtons();telemetry.errors.push('Camera input cancelled after a missing native presentation');}
  }):null;
  const dispatch=action=>cameraGate?cameraGate.dispatch(action):directDispatch(action);
  function buildingContext() {
    const view=backend.viewState();
    return view?.usable&&view.selectionToken?`${view.mapEpoch}:${view.selectionToken}`:null;
  }
  function buildingDestination(world) {
    if(!Number.isFinite(world?.x)||!Number.isFinite(world?.y))return null;
    const bounds=nativeGeometry()?.world;
    const point=global.WarcraftFullMap?.globalToWorld(world.x,world.y);
    return bounds&&point&&point.x>=bounds.left&&point.x<bounds.right&&
      point.y>=bounds.top&&point.y<bounds.bottom?point:null;
  }
  function dispatchBuildingTarget(world,confirm) {
    const current=snapshot(),context=buildingContext();
    if(!current.buildingPending||!current.inputAllowed||!context||!buildingDestination(world))return false;
    dispatch({type:'buildingTarget',world,context,confirm});
    return true;
  }
  const backend = {
    state:snapshot,
    retainsTouchSelection:()=>coherentFrames&&transport?.touchSelection===true,
    rememberTouchSelection:()=>dispatch({type:'command',args:['rememberTouch']}),
    orderWithTouchSelection(x,y) {
      const p=global.WarcraftFullMap?.worldToGlobal(x,y),epoch=backend.viewState()?.mapEpoch;
      if(p&&epoch)dispatch({type:'touchOrder',x:p.x,y:p.y,epoch});
    },
    nativeMove:(x,y) => dispatch({type:'move',args:[x,y]}),
    nativeButton:(down,button,x,y) => dispatch({type:'button',args:[down,button,x,y]}),
    ...(enhancedInput?{
      nativeWorldMove:(x,y)=>{
        const p=global.WarcraftFullMap?.worldToGlobal(x,y);
        if(p)dispatch({type:'worldMove',args:[p.x,p.y]});
      },
      nativeWorldButton:(down,button,x,y)=>{
        const p=global.WarcraftFullMap?.worldToGlobal(x,y);
        if(p)dispatch({type:'worldButton',args:[down,button,p.x,p.y]});
      },
    }:{}),
    clearSelection:() => dispatch({type:'command',args:['clear']}),
    ...(modernInput ?
      {clearSelectionIfEmpty:() => enhancedInput?dispatch({type:'emptyBarrier'}):fence.barrier()} : {}),
    panTiles(dx,dy,origin) {
      const action={type:'pan',args:[dx,dy],origin};
      if(!coherentFrames)return dispatch(action);
      return fence.dispatchNow(action)?action.serial??true:false;
    },
    panReply(serial) {
      if(!cameraAhead||!serial)return 0;
      try {
        const bytes=readPacket(cameraPath('ack'));
        if(bytes.length!==24)return 0;
        const packet=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const status=packet.getUint16(16,true);
        return packet.getUint32(0,true)===0x31414357&&packet.getUint16(4,true)===24&&
          packet.getUint16(6,true)===1&&packet.getUint32(8,true)===serial&&
          packet.getUint16(22,true)===0&&status>=1&&status<=7 ? status : 0;
      } catch(_) { return 0; }
    },
    cancelPendingInput:()=>{cameraGate?.cancel();fence?.cancel();releaseActualButtons();},
    cameraInputDebug:()=>cameraGate?.debug()||{waiting:false,queueLength:0},
    inputFenceDebug:()=>fence?.debug()||{waiting:false,queueLength:0},
    telemetry,
    viewportSnapshot:() => viewportReader?.snapshot() || null,
    uiRects:nativeUiRects,
    viewState:()=>{
      const reader=coherentFrames?global.WarcraftViewStateV16:global.WarcraftViewStateV15;
      if(!guestReady()||!reader)return null;
      try{return reader.parse(readPacket('wc2-view-state.bin'));}
      catch(_){return null;}
    },
    bootstrapBackground:()=>{
      if(!coherentFrames||!guestReady()||!global.WarcraftBootstrapBackgroundV16)return null;
      try{return global.WarcraftBootstrapBackgroundV16.parse(readPacket('wc2-bootstrap-background.bin'));}
      catch(_){return null;}
    },
    completedFrame:()=>{
      if(!coherentFrames||!guestReady()||!global.WarcraftNativeFrameV16)return null;
      if(!completedFrameReader)completedFrameReader=global.WarcraftNativeFrameV16.createReader(slot=>
        readPacket('wc2-runtime-v16/wc2-frame-v16-'+slot+'.bin'));
      return completedFrameReader.read();
    },
    completedFrameDebug:()=>completedFrameReader?.debug()||null,
    cursorPlane:()=>{
      if(!guestReady()||!global.WarcraftCursorV15)return null;
      try{return readCursor();}
      catch(_){return null;}
    },
    hudForeground:()=>{
      if(!guestReady()||!global.WarcraftHudForeground)return null;
      try{return readHud();}
      catch(_){return null;}
    },
  };
  global.WarcraftUiBridge = backend;
  global.attachWarcraftUiTransport = adapter => {
    if (transport || root) throw new Error('Warcraft UI transport is already attached');
    for (const method of ['read','write','move','button','command']) {
      if (typeof adapter[method] !== 'function') throw new TypeError('Missing Warcraft UI transport ' + method);
    }
    if (!adapter.surface || !adapter.input) throw new TypeError('Missing Warcraft UI surfaces');
    transport=adapter;
    transportGeneration++;
    viewportReader=global.WarcraftViewportProtocol.createViewportReader(() => readPacket('wc2-viewport.bin'));
    telemetry.prepared=true;
    return () => {
      if(transport!==adapter)return;
      controller?.destroy();
      controller=null;
      global.WarcraftDuneControls=null;
      backend.cancelPendingInput();
      transport=viewportReader=completedFrameReader=null;
      cameraSerial=0;
      telemetry.prepared=false;
    };
  };
  global.prepareWarcraftUiBridge = async ({root:targetRoot,variant,viewport,resizeWindow=true}) => {
    root = targetRoot;
    const variants = {forward:'ddraw-forward-only.dll', debug:'ddraw-debug.dll', v1:'ddraw.dll', v2:'ddraw-ui-v2.dll', v3:'ddraw-ui-v3.dll', v4:'ddraw-ui-v4.dll', v5:'ddraw-ui-v5.dll', v6:'ddraw-ui-v6.dll', v7:'ddraw-ui-v7.dll', v8:'ddraw-ui-v8.dll', v9:'ddraw-ui-v9.dll', v10:'ddraw-ui-v10.dll', v12:'ddraw-ui-v12.dll', v13:'ddraw-ui-v13.dll', v14:'ddraw-ui-v14.dll', v15:'ddraw-ui-v15.dll', v16:'ddraw-ui-v16.dll'};
    const artifact = cameraAhead?'ddraw-ui-v16-pan.dll':variant ? variants[variant] : 'ddraw-ui-v4.dll';
    if (!artifact) throw new Error('Пробная схема ещё проходит проверку. Основной запуск сохранён без изменений.');
    const response = await fetch(new URL('../ui-bridge/build/'+artifact,location.href));
    if (!response.ok) throw new Error('UI bridge download failed: '+response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 512 || bytes[0] !== 77 || bytes[1] !== 90) throw new Error('UI bridge is not a PE artifact');
    const folder = root + '/home/username/.wine/drive_c/files';
    FS.mkdirTree(folder);
    // A previous browser session's UI snapshot must never classify a new menu.
    // This is our disposable bridge file, never a game save.
    FS.writeFile(root+'/home/username/.wine/drive_c/wc2-ui-state.bin',new Uint8Array(0));
    if(['v12','v13','v14','v15','v16'].includes(variant))FS.writeFile(root+'/home/username/.wine/drive_c/wc2-empty-click.bin',new Uint8Array(0));
    if(['v13','v14','v15','v16'].includes(variant))FS.writeFile(root+'/home/username/.wine/drive_c/wc2-hud-foreground.bin',new Uint8Array(0));
    if(['v14','v15','v16'].includes(variant))FS.writeFile(root+'/home/username/.wine/drive_c/wc2-native-input.bin',new Uint8Array(0));
    if(['v15','v16'].includes(variant)){
      FS.writeFile(root+'/home/username/.wine/drive_c/wc2-view-state.bin',new Uint8Array(0));
      FS.writeFile(root+'/home/username/.wine/drive_c/wc2-cursor.bin',new Uint8Array(0));
    }
    if(variant==='v16'){
      completedFrameReader=null;
      FS.writeFile(root+'/home/username/.wine/drive_c/wc2-bootstrap-background.bin',new Uint8Array(0));
      // Frame transport is volatile. The parent Wine root auto-persists its
      // filesystem; mounting this owned subtree avoids writing every frame to IDB.
      const volatileRoot=root+'/home/username/.wine/drive_c/wc2-runtime-v16';
      global.WarcraftVolatileRuntimeV16.mount(FS,IDBFS,MEMFS,volatileRoot);
      for(const slot of [0,1,'commit'])FS.writeFile(volatileRoot+'/wc2-frame-v16-'+slot+'.bin',new Uint8Array(0));
      // Boxedwine caches the guest directory listing. Both paths must exist before boot.
      if(cameraAhead)for(const kind of ['request','ack'])FS.writeFile(guestPath(cameraPath(kind)),new Uint8Array(0));
    }
    if (['v8','v9','v10','v12','v13','v14','v15','v16'].includes(variant)) {
      const request=global.WarcraftViewportProtocol.encodeViewportRequest(viewport.width,viewport.height);
      FS.writeFile(root+'/home/username/.wine/drive_c/wc2-viewport-request.bin',request);
      FS.writeFile(root+'/home/username/.wine/drive_c/wc2-ui-rects.bin',new Uint8Array(0));
    }
    if(['v9','v10','v12','v13','v14','v15','v16'].includes(variant)&&new URLSearchParams(location.search).get('display')!=='randr') {
      const path=root+'/home/username/.wine/user.reg';
      let registry;
      try { registry=FS.readFile(path,{encoding:'utf8'}); }
      catch(_) {
        const response=await fetch('/wine11-compat-user.reg');
        if(!response.ok)throw new Error('Wine display configuration unavailable: '+response.status);
        registry=await response.text();
      }
      const merged=global.WarcraftViewportProtocol.mergeFixedScreenRegistry(registry);
      FS.mkdirTree(root+'/home/username/.wine');FS.writeFile(path,merged);
      telemetry.fixedScreen=true;
    }
    if(variant==='v10') {
      FS.writeFile(root+'/home/username/.wine/drive_c/wc2-window-surface.bin',new Uint8Array(0));
      FS.writeFile(root+'/home/username/.wine/drive_c/wc2-window-resize-enable.bin',new Uint8Array([resizeWindow?1:0]));
    }
    if (nativeViewportMode) {
      const path = root+'/home/username/.wine/drive_c/wc2-viewport.bin';
      FS.writeFile(path,new Uint8Array(0));
      viewportReader = global.WarcraftViewportProtocol.createViewportReader(() => FS.readFile(path));
    }
    FS.writeFile(folder+'/ddraw.dll',bytes);
    telemetry.prepared=true;
    console.log('[Warcraft UI bridge] prepared experimental DLL',artifact,bytes.length);
  };
  global.installWarcraftDuneControls = () => {
    if (controller) return controller;
    const input=transport?.input || document.getElementById('canvas');
    controller = global.createWarcraftDuneControls({
      ...backend,
      commandSelectionV15:['v15','v16'].includes(new URLSearchParams(location.search).get('bridge')),
      ...(global.WarcraftIndependentCameraPilot?.explicitBuilding?{
        explicitBuildingPlacement:true,
        getBuildingContext:buildingContext,
        buildingWorldPoint:(x,y)=>global.WarcraftFullMap.worldToGlobal(x,y),
        previewBuilding:world=>dispatchBuildingTarget(world,false),
        confirmBuilding:world=>dispatchBuildingTarget(world,true),
        ...(transport&&coherentFrames?{
          requestBuildCancellation:()=>global.WarcraftFullMap?.requestBuildCancellation(),
        }:{}),
      }:{}),
      getHudCommand:(...args)=>global.WarcraftFullMap?.getHudCommand?.(...args),
      getHudContextToken:()=>global.WarcraftFullMap?.getHudContextToken?.(),
      onHudCommandSelection:command=>global.WarcraftFullMap?.selectHudCommand?.(command),
      requestHudPurchase:(...args)=>global.WarcraftFullMap?.requestHudPurchase?.(...args),
      allowNativeTouch:()=>transport?.allowNativeTouch?.()===true,
      ...(['v15','v16'].includes(new URLSearchParams(location.search).get('bridge'))?{
        resumeAudio:()=>global.BoxedwineAudio?.resume?.(),
        beginPan:(...args)=>global.WarcraftFullMap?.beginPan?.(...args),
        panPixels:(...args)=>global.WarcraftFullMap?.panPixels?.(...args),
        endPan:(...args)=>global.WarcraftFullMap?.endPan?.(...args),
        stopPan:()=>global.WarcraftFullMap?.stopPan?.(),
      }:{}),
      canvasElement:input,
      getCanvasRect:() => input.getBoundingClientRect(),
      ...(nativeViewportMode ? {getNativeGeometry:nativeGeometry} : {}),
      ...(new URLSearchParams(location.search).get('view') === 'map' ?
        {clientToNativePoint:(...args) => global.WarcraftFullMap.pointForGesture(...args)} : {}),
    });
    const toggle = document.getElementById('duneControls');
    controller.setEnabled(toggle ? toggle.checked : !!transport);
    toggle?.addEventListener('change',() => controller.setEnabled(toggle.checked));
    global.WarcraftDuneControls = controller;
    return controller;
  };
})(window);
