/* Opt-in input adapter. Original Warcraft code still selects, orders and scrolls. */
(function (global) {
  'use strict';
  const WORLD = Object.freeze({left: 176, top: 16, right: 624, bottom: 464});
  const ORIGINAL_GEOMETRY = Object.freeze({width:640, height:480, world:WORLD});
  const THRESHOLD = 8; // CSS pixels, as in Dune's MapGestures.
  const TILE = 32;     // Original Warcraft camera tile, in native pixels.
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  /* Gesture state with optional bounded V15 activation timers. No DOM,
   * pixel inspection or simulation logic.
   * state(): trusted {inGame, modal, inputAllowed?, selectionCount, targetPending, buildingPending?}.
   * nativeButton(down, internalButton, nativeX, nativeY): left=0, right=1.
   * nativeWorldMove/Button?(): camera-aware world event queue; HUD stays raw.
   * panTiles(dx,dy): integral CAMERA deltas; dragging left moves camera right.
   * getNativeGeometry?(): trusted {width,height,world:{left,top,right,bottom}}.
   * clientToNativePoint?(event,rect): shared presentation transform; null for HUD.
   * Invalid native geometry blocks adapted input. A change cancels an owned drag.
   */
  function createGestureMachine(api, getCanvasRect) {
    for (const key of ['state', 'nativeMove', 'nativeButton', 'panTiles', 'clearSelection']) {
      if (typeof api[key] !== 'function') throw new TypeError('Missing control callback: ' + key);
    }
    if (typeof getCanvasRect !== 'function') throw new TypeError('Missing canvas geometry callback');
    let enabled = false, destroyed = false, gesture = null;
    let selectedCommand = null, commandTimer = null, buildingTarget = null;
    const held = new Set();
    let lastNative = {x: 320, y: 240};
    const idOf = event => event.id ?? event.pointerId ?? 'mouse';
    const state = () => api.state() || {};
    const commandMode = () => api.commandSelectionV15 === true;
    const explicitBuilding = api.explicitBuildingPlacement === true;
    const now = () => typeof api.now === 'function' ? api.now() : Date.now();
    const eventTime = event => Number.isFinite(event?.timeStamp) ? event.timeStamp : now();
    const token = value => typeof value === 'string' && value.length ? value :
      Number.isSafeInteger(value) && value > 0 ? String(value) : null;
    const contextToken = () => {
      try{return token(typeof api.getHudContextToken === 'function' ?
        api.getHudContextToken() : state().commandContextToken);}catch(_){return null;}
    };
    const startAllowed = current => current.inGame === true && current.modal === false &&
      current.inputAllowed !== false && current.trusted !== false;
    function geometry() {
      let value;
      try { value = typeof api.getNativeGeometry === 'function' ? api.getNativeGeometry() : ORIGINAL_GEOMETRY; }
      catch (_) { return null; }
      const world = value?.world;
      if (!value || !world || ![value.width,value.height,world.left,world.top,world.right,world.bottom].every(Number.isFinite) ||
          value.width <= 0 || value.height <= 0 || world.left < 0 || world.top < 0 ||
          world.right > value.width || world.bottom > value.height || world.right <= world.left || world.bottom <= world.top) return null;
      return {width:value.width, height:value.height, world:{...world}};
    }
    const sameGeometry = (a,b) => a && b && a.width === b.width && a.height === b.height &&
      ['left','top','right','bottom'].every(key => a.world[key] === b.world[key]);
    function point(event, nativeGeometry = geometry(), captured = !!gesture) {
      let rect;
      try { rect = getCanvasRect(); } catch (_) { return null; }
      if (!nativeGeometry || !rect || ![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite) ||
          rect.width <= 0 || rect.height <= 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
      let nativePoint;
      try {
        nativePoint = typeof api.clientToNativePoint === 'function' ? api.clientToNativePoint(event,rect,{captured}) :
          {x:(event.clientX-rect.left)*nativeGeometry.width/rect.width,y:(event.clientY-rect.top)*nativeGeometry.height/rect.height};
      } catch (_) { return null; }
      if (!nativePoint || !Number.isFinite(nativePoint.x) || !Number.isFinite(nativePoint.y)) return null;
      const panScaleX = nativePoint.pixelsPerCssPixel ?? nativeGeometry.width/rect.width;
      const panScaleY = nativePoint.pixelsPerCssPixel ?? nativeGeometry.height/rect.height;
      if (![panScaleX,panScaleY].every(value => Number.isFinite(value) && value > 0)) return null;
      return {x:nativePoint.x, y:nativePoint.y,
        clientX: event.clientX, clientY: event.clientY, geometry:nativeGeometry,
        panScaleX,panScaleY,
        canvasRect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};
    }
    const inWorld = p => p && p.x >= p.geometry.world.left && p.x < p.geometry.world.right &&
      p.y >= p.geometry.world.top && p.y < p.geometry.world.bottom;
    function nativePoint(p, inset = 0) {
      const world = p.geometry.world;
      const ix = Math.min(inset, (world.right - world.left - 1) / 2);
      const iy = Math.min(inset, (world.bottom - world.top - 1) / 2);
      return {x: Math.floor(clamp(p.x, world.left + ix, world.right - 1 - ix)),
        y: Math.floor(clamp(p.y, world.top + iy, world.bottom - 1 - iy))};
    }
    function moveNative(p, inset = 0) {
      lastNative = nativePoint(p, inset);
      (api.nativeWorldMove || api.nativeMove)(lastNative.x, lastNative.y);
      return lastNative;
    }
    function currentBuildingTarget() {
      if (buildingTarget && (!state().buildingPending || buildingTarget.context !== api.getBuildingContext()))
        buildingTarget = null;
      return buildingTarget;
    }
    function aimBuilding(point) {
      const world = api.buildingWorldPoint(Math.floor(point.x), Math.floor(point.y));
      const context = api.getBuildingContext();
      if (!world || !context) return;
      buildingTarget = {...world, context, submitted: false};
      api.previewBuilding(world);
    }
    function confirmBuilding() {
      const target = currentBuildingTarget();
      if (!target || target.submitted || !startAllowed(state()) || !api.confirmBuilding(target)) return false;
      target.submitted = true;
      return true;
    }
    function selectCommand(command) {
      if(!selectedCommand && !command)return;
      selectedCommand = command;
      api.onHudCommandSelection?.(command ? {...command} : null);
    }
    function stopCommandTimer() {
      if(commandTimer !== null) {
        (api.clearSchedule || global.clearTimeout)?.(commandTimer);
        commandTimer = null;
      }
    }
    function rawCommand(event) {
      if(!commandMode() || typeof api.getHudCommand !== 'function')return null;
      try{return api.getHudCommand(event,getCanvasRect()) ?? null;}
      catch(_){return {blocked:true};} // Never fall through to a raw premature HUD click.
    }
    function trustedCommand(value,g = geometry()) {
      if(!value || !g || value.visible!==true || value.present!==true ||
        typeof value.key!=='string' || !value.key ||
        !Number.isSafeInteger(value.object) || value.object<65536 ||
        value.object>0xffffffff || !Number.isSafeInteger(value.descriptor) ||
        value.descriptor<65536 || value.descriptor>0xffffffff ||
        !token(value.contextToken) || !Number.isFinite(value.nativeX) || !Number.isFinite(value.nativeY) ||
        value.nativeX<0 || value.nativeY<0 || value.nativeX>=g.width || value.nativeY>=g.height ||
        typeof value.isCancel!=='boolean' || typeof value.isBuildingPlacement!=='boolean')return null;
      return {...value,contextToken:token(value.contextToken)};
    }
    const sameCommand = (a,b) => a && b && a.key===b.key && a.object===b.object &&
      a.descriptor===b.descriptor && a.contextToken===b.contextToken;
    function hoverCommand(command) {
      lastNative={x:Math.floor(command.nativeX),y:Math.floor(command.nativeY)};
      api.nativeMove(lastNative.x,lastNative.y);
    }
    function clickCommand(command) {
      hoverCommand(command);held.add(0);
      try{api.nativeButton(1,0,lastNative.x,lastNative.y);}
      finally{try{api.nativeButton(0,0,lastNative.x,lastNative.y);}finally{held.delete(0);}}
    }
    function finishGesture({stopPan=true,clearCommand=false}={}) {
      const ownedV15=commandMode() || gesture?.pixelPan || gesture?.mode?.startsWith('hud-');
      try{for(const button of [...held])release(button);}
      finally{
        stopCommandTimer();gesture=null;
        if(ownedV15 && stopPan)api.stopPan?.();
        if(clearCommand)selectCommand(null);
      }
    }
    function safePlacementPoint(g) {
      return g.placementLastValid || {geometry:g.geometry,
        x:(g.geometry.world.left+g.geometry.world.right)/2,
        y:(g.geometry.world.top+g.geometry.world.bottom)/2};
    }
    function abortHudPlacement(g) {
      api.cancelPendingInput?.();
      try{
        if(g?.activated && state().buildingPending===true && startAllowed(state())) {
          const p=safePlacementPoint(g);press(1,p);release(1,p);
        }
      }finally{finishGesture({clearCommand:true});}
    }
    function hudGeometryValid(g) {
      if(!sameGeometry(geometry(),g.geometry))return false;
      let rect;try{rect=getCanvasRect();}catch(_){return false;}
      return rect && ['left','top','width','height'].every(k=>rect[k]===g.canvasRect[k]);
    }
    function finishHudPlacement(g) {
      const current=state();
      if(!hudGeometryValid(g) || contextToken()!==g.command.contextToken || !startAllowed(current)) {
        abortHudPlacement(g);return;
      }
      if(current.buildingPending!==true)return;
      const drop=point(g.lastEvent,g.geometry,false);
      try{
        if(drop && inWorld(drop)){press(0,drop);release(0,drop);}
        else{const p=safePlacementPoint(g);press(1,p);release(1,p);}
      }finally{finishGesture();}
    }
    function waitForPlacement(g) {
      commandTimer=null;
      if(gesture!==g)return;
      if(!commandMode() || !enabled || destroyed || !hudGeometryValid(g) ||
        contextToken()!==g.command.contextToken || !startAllowed(state())) {
        abortHudPlacement(g);return;
      }
      if(state().buildingPending===true) {
        g.mode='hud-placement';
        const p=point(g.lastEvent,g.geometry,false);
        if(p && inWorld(p)){g.placementLastValid=p;moveNative(p);}
        if(g.released)finishHudPlacement(g);
        return;
      }
      if(now()>=g.deadline){abortHudPlacement(g);return;}
      const schedule=api.schedule || global.setTimeout;
      if(typeof schedule!=='function'){abortHudPlacement(g);return;}
      commandTimer=schedule(()=>waitForPlacement(g),Math.min(8,g.deadline-now()));
    }
    function downCommand(event,raw) {
      const g=geometry(),command=trustedCommand(raw,g);let rect;
      try{rect=getCanvasRect();}catch(_){rect=null;}
      gesture={id:idOf(event),button:0,mode:command && rect?'hud-pending':'hud-blocked',command,
        geometry:g,canvasRect:rect?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:{},
        origin:{clientX:event.clientX,clientY:event.clientY},lastEvent:event,
        placementLastValid:null,activated:false,released:false};
      if(command && rect)hoverCommand(command);
      else selectCommand(null);
      return true;
    }
    function moveCommand(event) {
      const g=gesture;if(!g || idOf(event)!==g.id)return false;
      if(g.released)return true; // An asynchronous ghost may not move a latched drop.
      g.lastEvent=event;
      if(!commandMode() || !hudGeometryValid(g) || !startAllowed(state())) {
        abortHudPlacement(g);return true;
      }
      if(g.mode==='hud-blocked' || g.mode==='hud-cancelled')return true;
      if(g.activated) {
        if(contextToken()!==g.command.contextToken){abortHudPlacement(g);return true;}
        const p=point(event,g.geometry,false);
        if(p && inWorld(p))g.placementLastValid=p;
        if(g.mode==='hud-placement') {
          if(state().buildingPending!==true){finishGesture({clearCommand:true});return true;}
          if(p && inWorld(p))moveNative(p);
        }
        return true;
      }
      if(Math.hypot(event.clientX-g.origin.clientX,event.clientY-g.origin.clientY)>THRESHOLD) {
        if(explicitBuilding){g.mode='hud-cancelled';selectCommand(null);return true;}
        const current=trustedCommand(rawCommand({...event,...g.origin}),g.geometry);
        if(!sameCommand(current,g.command) || !g.command.isBuildingPlacement ||
          g.command.isCancel || state().buildingPending===true || contextToken()!==g.command.contextToken) {
          g.mode='hud-cancelled';selectCommand(null);return true;
        }
        selectCommand(null);g.activated=true;g.mode='hud-activating';g.deadline=now()+500;
        const p=point(event,g.geometry,false);
        if(p && inWorld(p))g.placementLastValid=p;
        clickCommand(current); // Original icon handler only; no world confirmation yet.
        waitForPlacement(g);
      }
      return true;
    }
    function upCommand(event) {
      const g=gesture;if(!g || idOf(event)!==g.id)return false;
      if(event.button!==undefined && event.button!==0)return true;
      if(g.released)return true;
      moveCommand(event);if(gesture!==g)return true;
      g.released=true;g.lastEvent=event;
      if(g.activated){if(g.mode==='hud-placement')finishHudPlacement(g);return true;}
      try{
        const command=trustedCommand(rawCommand(event),g.geometry);
        if(g.mode!=='hud-pending' || !sameCommand(command,g.command)){selectCommand(null);return true;}
        if(command.isCancel || sameCommand(selectedCommand,command)) {
          if(command.isCancel || command.isBuildingPlacement)buildingTarget=null;
          selectCommand(null);clickCommand(command);
        }else{selectCommand(command);hoverCommand(command);}
      }finally{finishGesture();}
      return true;
    }
    function press(button, p) {
      const n = moveNative(p);
      held.add(button);
      (api.nativeWorldButton || api.nativeButton)(1, button, n.x, n.y);
    }
    function release(button, p) {
      if (!held.has(button)) return;
      const n = p ? moveNative(p) : lastNative;
      try { (api.nativeWorldButton || api.nativeButton)(0, button, n.x, n.y); }
      finally { held.delete(button); }
    }
    function cancel() {
      // Only release buttons owned by this adapter, never unrelated native UI input.
      finishGesture({clearCommand:true});
    }
    function cancelPlacementProjection() {
      const g=gesture,current=state();
      if(g?.mode?.startsWith('hud-')){abortHudPlacement(g);return;}
      try{
        if(g&&['placement','placement-cancel'].includes(g.mode)&&current.buildingPending===true&&startAllowed(current)){
          const p=g.placementLastValid||g.origin;
          press(1,p);release(1,p);
        }
      }finally{cancel();}
    }
    function canStart(event) {
      if(commandMode() && event.button===0 && rawCommand(event)!==null)
        return enabled && !destroyed;
      return enabled && !destroyed && (event.button === 0 || event.button === 2) &&
        startAllowed(state()) && inWorld(point(event));
    }
    function down(event) {
      if(commandMode())api.stopPan?.();
      if (gesture) return event.button === 0 || event.button === 2;
      if(commandMode() && event.button===0 && enabled && !destroyed) {
        const command=rawCommand(event);
        if(command!==null)return downCommand(event,startAllowed(state())?command:{blocked:true});
      }
      if (!canStart(event)) return false;
      const p = point(event);
      if (!p || !inWorld(p)) return false;
      const current=state(),building=current.buildingPending===true;
      if(commandMode())selectCommand(null);
      gesture = {id: idOf(event), button: event.button,
        mode:building?(explicitBuilding?(event.button===0?'building-aim':'building-cancel'):
          (event.button===0?'placement':'placement-cancel')):'pending', origin: p, last: p,
        remainderX: 0, remainderY: 0, startedAt: eventTime(event), targetPendingAtStart: current.targetPending===true,
        placementLastValid:building?p:null,geometry:p.geometry};
      if(building&&!explicitBuilding)moveNative(p);
      // Deliberately no native button down until tap release or right-box threshold.
      return true;
    }
    function move(event) {
      const g = gesture;
      if (!g || idOf(event) !== g.id) return false;
      if(g.mode.startsWith('hud-'))return moveCommand(event);
      if (['placement','placement-cancel','building-aim','building-cancel'].includes(g.mode) || g.buildingPan) {
        const current=state();
        if(current.buildingPending!==true || !startAllowed(current)){cancel();return true;}
      }
      if (!sameGeometry(geometry(),g.geometry)) { cancel(); return true; }
      const p = point(event,g.geometry);
      if (!p) { cancel(); return true; }
      if (!['left','top','width','height'].every(key => p.canvasRect[key] === g.origin.canvasRect[key])) {
        cancel(); return true;
      }
      // Gate only gesture START. Our native box changes the game's input callback
      // and may make modal/inputAllowed false; it still needs its movement and up.
      if (g.mode === 'building-aim' && Math.hypot(p.clientX-g.origin.clientX,p.clientY-g.origin.clientY)>THRESHOLD) {
        g.mode='pan';g.pixelPan=true;g.buildingPan=true;
        api.beginPan?.(g.startedAt,g.origin.panScaleX);
      }
      if (g.mode === 'building-aim' || g.mode === 'building-cancel') return true;
      if (g.mode === 'pending' && Math.hypot(p.clientX - g.origin.clientX, p.clientY - g.origin.clientY) > THRESHOLD) {
        g.mode = g.button === 0 ? 'pan' : 'box';
        if (g.mode === 'box') {
          const origin=commandMode()?point(g.origin,g.geometry,true):g.origin;
          if(!origin){cancel();return true;}
          press(0,origin);
        }
        else if(commandMode() && typeof api.panPixels==='function') {
          g.pixelPan=true;api.beginPan?.(g.startedAt,g.origin.panScaleX);
        }
      }
      if(g.mode==='placement'||g.mode==='placement-cancel'){
        const strict=point(event,g.geometry,false);
        if(strict&&inWorld(strict)){g.placementLastValid=strict;moveNative(strict);}
      }
      else if (g.mode === 'pan') {
        // Keep the real pointer away from edge-scroll while native camera pulses
        // implement the drag. Preserve fractional movement until a full tile exists.
        if(!g.buildingPan)moveNative(p, 16);
        if(g.pixelPan){
          if(!commandMode()){cancel();return true;}
          api.panPixels(-(p.clientX-g.last.clientX)*p.panScaleX,
            -(p.clientY-g.last.clientY)*p.panScaleY,eventTime(event));
          g.last=p;return true;
        }
        g.remainderX -= (p.clientX - g.last.clientX) * p.panScaleX / TILE;
        g.remainderY -= (p.clientY - g.last.clientY) * p.panScaleY / TILE;
        const dx = Math.trunc(g.remainderX), dy = Math.trunc(g.remainderY);
        if (dx || dy) {
          api.panTiles(dx, dy);
          g.remainderX -= dx; g.remainderY -= dy;
        }
      } else if (g.mode === 'box') moveNative(p);
      else moveNative(p);
      if (g.mode !== 'pending') g.last = p;
      return true;
    }
    function up(event) {
      const g = gesture;
      if (!g || idOf(event) !== g.id) return false;
      if(g.mode.startsWith('hud-'))return upCommand(event);
      if (event.button !== undefined && event.button !== g.button) return true;
      let completedPan=false;
      try {
        move(event); // A release can be the first event beyond the drag threshold.
        if (gesture !== g) return true; // A geometry change cancelled this gesture.
        const p = point(event,g.geometry) || g.last;
        if(g.mode==='building-aim'){
          const aim=point(event,g.geometry,false);
          if(aim&&inWorld(aim))aimBuilding(aim);
        }else if(g.mode==='building-cancel'){
          buildingTarget=null;press(1,g.origin);release(1,g.origin);
        }else if(g.mode==='placement'){
          // The final strict chart hit excludes HUD overlays and outside drops.
          // Invalid/offscreen drops use original right-click cancellation at the
          // last valid world point, never coordinates that could hit native UI.
          const drop=point(event,g.geometry,false),current=state();
          if(drop&&inWorld(drop)&&current.buildingPending===true&&startAllowed(current)){
            press(0,drop);release(0,drop);
          }else if(current.buildingPending===true&&startAllowed(current)){
            const last=g.placementLastValid||g.origin;press(1,last);release(1,last);
          }
        }else if(g.mode==='placement-cancel'){
          // While building, a right drag must cancel, never start a native left box.
          const last=g.placementLastValid||g.origin;press(1,last);release(1,last);
        }else if (g.mode === 'pending') {
          const current = state();
          // Original handlers select, order and confirm/cancel targets. A separate
          // native hit query adds the requested empty-map clear to ordinary taps.
          const button = g.button === 2 ? 1 : 0;
          press(button, p); release(button, p);
          if(button===0 && !g.targetPendingAtStart && !current.targetPending)
            api.clearSelectionIfEmpty?.();
        } else if (g.mode === 'box') release(0, p);
        else if(g.mode==='pan' && g.pixelPan){api.endPan?.(eventTime(event));completedPan=true;}
        // Pan ends without a click/order or clear-selection side effect.
      } finally { finishGesture({stopPan:!completedPan}); }
      return true;
    }
    return {
      down, move, up, cancel, cancelPlacementProjection, canStart, confirmBuilding,
      get buildingTarget() { const target=currentBuildingTarget();return target&&{...target}; },
      enable() { if (destroyed) throw new Error('Controls were destroyed'); enabled = true; return this; },
      disable() { cancel(); enabled = false; return this; },
      setEnabled(value) { return value ? this.enable() : this.disable(); },
      destroy() { cancel(); enabled = false; destroyed = true; },
      get enabled() { return enabled; },
      get active() { return !!gesture; },
      get selectedHudCommand() { return selectedCommand ? {...selectedCommand} : null; },
      debug() { return {enabled, destroyed, mode: gesture?.mode || 'idle', button: gesture?.button ?? null,
        held: [...held], remainderX: gesture?.remainderX || 0, remainderY: gesture?.remainderY || 0,
        selectedCommandKey:selectedCommand?.key || null,commandWaiting:gesture?.mode==='hud-activating'}; }
    };
  }

  function createDuneControls(api, getCanvasRect) {
    if (!global.addEventListener) throw new Error('Window event routing is unavailable');
    getCanvasRect = getCanvasRect || api.getCanvasRect;
    const element = api.canvasElement || api.gamecanvasElement || api.gameCanvasElement;
    const machine = createGestureMachine(api, getCanvasRect);
    const listeners = [];
    let capture = null;
    const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const inScope = event => !element || event.target === element || element.contains?.(event.target);
    const focus = () => { try { element?.focus({preventScroll: true}); } catch (_) {} };
    function listen(name, callback) {
      global.addEventListener(name, callback, {capture: true, passive: false});
      listeners.push([name, callback]);
    }
    function releaseCapture() {
      if (!capture) return;
      const previous=capture;capture=null;
      try { previous.target.releasePointerCapture?.(previous.id); } catch (_) {}
    }
    function cancelOwnedV15() {
      // Drop earlier queued input BEFORE original projection cancellation.
      api.cancelPendingInput?.();machine.cancelPlacementProjection();releaseCapture();
    }
    // Install now, even while disabled. This must precede Boxedwine's anonymous
    // window-capture mouse listeners; enabling later then retains input priority.
    for(const name of ['touchstart','touchmove','touchend','touchcancel'])listen(name,event=>{
      if(api.commandSelectionV15!==true || !machine.enabled || (!inScope(event)&&!capture))return;
      if(!capture&&api.allowNativeTouch?.())return;
      if(name==='touchstart'){try{api.resumeAudio?.();}catch(_){}}
      // PointerEvents own adapted gestures. Fence SDL's duplicate TouchEvents,
      // preserving default compatibility mouse events for original native menus.
      event.stopImmediatePropagation();
    });
    listen('pointerdown', event => {
      if(api.commandSelectionV15===true && !inScope(event))api.stopPan?.();
      if (event.pointerType === 'mouse') {
        if (inScope(event) && machine.canStart(event)) {
          capture = {target: event.target, id: event.pointerId};
          try { event.target.setPointerCapture?.(event.pointerId); } catch (_) {}
        }
        return; // Keep compatibility mousedown; desktop handling lives below.
      }
      if (inScope(event) && machine.down({...event, clientX: event.clientX, clientY: event.clientY,
        pointerId: event.pointerId, button: 0, timeStamp:event.timeStamp})) {
        stop(event); focus(); capture = {target: event.target, id: event.pointerId};
        try { event.target.setPointerCapture?.(event.pointerId); } catch (_) {}
      }
    });
    listen('pointermove', event => {
      if (event.pointerType !== 'mouse' && machine.move(event)) stop(event);
    });
    listen('pointerup', event => {
      if (event.pointerType !== 'mouse' && machine.up({...event, clientX: event.clientX,
        clientY: event.clientY, pointerId: event.pointerId, button: 0, timeStamp:event.timeStamp})) { stop(event); releaseCapture(); }
    });
    listen('mousedown', event => {
      if ((machine.active || inScope(event)) && machine.down(event)) { stop(event); focus(); }
    });
    listen('mousemove', event => { if (machine.move(event)) stop(event); });
    listen('mouseup', event => { if (machine.up(event)) { stop(event); releaseCapture(); } });
    listen('pointercancel', event => {
      if(machine.debug().mode.startsWith('hud-')){cancelOwnedV15();stop(event);return;}
      if(['placement','placement-cancel'].includes(machine.debug().mode)){
        api.cancelPendingInput?.();machine.cancelPlacementProjection();stop(event);releaseCapture();return;
      }
      if (machine.active) { machine.cancel(); stop(event); releaseCapture(); }
      api.cancelPendingInput?.();
    });
    listen('lostpointercapture', event => {
      // A normal mouse pointerup can release capture before compatibility mouseup.
      // Our explicit release can also precede an asynchronous placement ack.
      if(!capture && api.commandSelectionV15===true)return;
      if (machine.active && (event.pointerType !== 'mouse' || event.buttons)) {
        if(api.commandSelectionV15===true || machine.debug().mode.startsWith('hud-'))cancelOwnedV15();
        else{machine.cancel();api.cancelPendingInput?.();}
      }
    });
    listen('blur', event => {
      // Capture also sees descendant blur when focus moves from a checkbox to
      // the canvas. Only losing the whole window cancels an owned gesture.
      if (event.target !== global) return;
      if(api.commandSelectionV15===true || machine.debug().mode.startsWith('hud-'))cancelOwnedV15();
      else{machine.cancel(); releaseCapture();api.cancelPendingInput?.();}
    });
    const cancelPlacement=()=>{
      if(api.commandSelectionV15===true || machine.debug().mode.startsWith('hud-')){cancelOwnedV15();return;}
      if(!['placement','placement-cancel'].includes(machine.debug().mode))return;
      machine.cancel();releaseCapture();api.cancelPendingInput?.();
    };
    listen('keydown',event=>{if(event.key==='Escape'||event.code==='Escape')cancelPlacement();});
    listen('resize',cancelPlacement);
    listen('contextmenu', event => {
      if (machine.active || machine.canStart({clientX: event.clientX, clientY: event.clientY, button: 2})) stop(event);
    });
    return {
      enable() { machine.enable(); return this; },
      disable() {
        const owned=api.commandSelectionV15===true || machine.debug().mode.startsWith('hud-');
        if(owned)cancelOwnedV15();
        machine.disable(); releaseCapture();if(!owned)api.cancelPendingInput?.(); return this;
      },
      setEnabled(value) { return value ? this.enable() : this.disable(); },
      cancel() {
        if(api.commandSelectionV15===true || machine.debug().mode.startsWith('hud-'))cancelOwnedV15();
        else{machine.cancel(); releaseCapture();api.cancelPendingInput?.();}
      },
      destroy() {
        const owned=api.commandSelectionV15===true || machine.debug().mode.startsWith('hud-');
        if(owned)cancelOwnedV15();
        machine.destroy(); releaseCapture();if(!owned)api.cancelPendingInput?.();
        for (const [name, callback] of listeners) global.removeEventListener(name, callback, true);
        listeners.length = 0;
      },
      get enabled() { return machine.enabled; },
      get buildingTarget() { return machine.buildingTarget; },
      confirmBuilding: () => machine.confirmBuilding(),
      get selectedHudCommand() { return machine.selectedHudCommand; },
      debug: () => machine.debug()
    };
  }
  const exports = {createDuneControls, createGestureMachine, WORLD, THRESHOLD, TILE};
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else {
    global.WarcraftDuneControls = exports;
    global.createDuneControls = createDuneControls;
    global.createWarcraftDuneControls = createDuneControls;
  }
})(typeof window !== 'undefined' ? window : globalThis);
