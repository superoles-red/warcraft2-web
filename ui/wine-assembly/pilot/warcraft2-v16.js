/* Connect the V16 compositor and gestures to the Wine-Assembly guest. */
(() => {
  'use strict';
  const nativePath = name => 'c:\\' + name.replaceAll('/', '\\');

  function createDemoBack(frame, stop) {
    const layer = document.createElement('div');
    layer.id = 'warcraft-demo-controls';
    layer.dataset.winePageDialog = '';
    layer.hidden = true;
    const back = document.createElement('button');
    back.type = 'button';
    back.setAttribute('aria-label', window.WarcraftLanguage?.current?.() === 'ru' ? 'Назад' : 'Back');
    back.addEventListener('click', stop);
    layer.addEventListener('contextmenu', event => event.preventDefault());
    layer.append(back);
    frame.append(layer);
    return layer;
  }

  function modalFaction(wine) {
    const offset = wine.instance?.exports?.guest_to_wasm?.(0x4abb7c) >>> 0;
    const memory = wine.memory?.buffer;
    if (!(offset > 0xf0 && offset < memory?.byteLength)) return null;
    return new Uint8Array(memory, offset, 1)[0] === 0 ? 'human' : 'orc';
  }

  function guestReader(wine) {
    const translate = wine.instance?.exports?.guest_to_wasm;
    const memory = wine.memory?.buffer;
    if (!translate || !memory || wine.guestWorker) return () => null;
    return (address, length) => {
      if (address < 0x10000 || address + length > 0x100000000) return null;
      const start = translate(address) >>> 0;
      const end = translate(address + length - 1) >>> 0;
      return start > 0xf0 && end === start + length - 1 && end < memory.byteLength
        ? new DataView(memory, start, length) : null;
    };
  }

  function purchaseTooltipMatches(wine, command) {
    const read = guestReader(wine);
    // BNE's command hover callback reads the descriptor's STR TBL index, then
    // uses the exact TBL address +2 as the original status description.
    if (read(0x4bdcdc,4)?.getUint32(0,true) !== command.object) return false;
    const descriptor = read(command.descriptor,20);
    if (!descriptor || descriptor.getUint32(8,true) !== command.action) return false;
    const id = descriptor.getUint16(14,true);
    const table = read(0x4bdd24,4)?.getUint32(0,true);
    if (!table || !id || id > (read(table,2)?.getUint16(0,true) || 0)) return false;
    const offset = read(table+id*2,2)?.getUint16(0,true);
    return !!offset && read(0x4be1b4,4)?.getUint32(0,true) === table+offset+2;
  }

  // BNE 2.02: the production/placement check at 40DCD0 and the
  // research check at 40DC20 read the same live tables as hover at 44ADE0.
  // A scenario can replace these tables, so prices are read from the guest.
  const purchaseTypes = new Map([
    [0x40e6d0, 'train'], [0x436b80, 'build'], [0x40e710, 'upgrade'],
    [0x40e650, 'research'], [0x40e690, 'research'],
  ]);
  const unitCosts = [0x4ce93c, 0x4cec8c, 0x4cedfc];
  const researchCosts = [0x4d0188, 0x4d0258, 0x4d01f0];

  function readWallet(read) {
    const player = read(0x4acb68, 1)?.getUint8(0);
    if (player === undefined || player >= 16) return null;
    const resources = [0x4abb18, 0x4acb6c, 0x4abbfc]
      .map(address => read(address + player * 4, 4)?.getInt32(0, true));
    if (resources.some(amount => amount === undefined)) return null;
    return {player, resources};
  }

  function exceedsFoodCapacity(read, player) {
    const offset = player * 2;
    const used = read(0x4adacc + offset, 2)?.getUint16(0, true);
    const reserved = read(0x4adf4c + offset, 2)?.getUint16(0, true);
    const capacity = read(0x4adc6c + offset, 2)?.getUint16(0, true);
    const expansion = read(0x4ae26c, 4)?.getUint32(0, true);
    return used - reserved >= (expansion ? Math.min(200, capacity) : capacity);
  }

  function lacksResources(read, wallet, type, id) {
    if (type === 'train' && exceedsFoodCapacity(read, wallet.player)) return true;
    if (type === 'research') {
      if (id >= 52) return false;
      return researchCosts.some((table, i) => wallet.resources[i] < read(table + id * 2, 2)?.getUint16(0, true));
    }
    if (id >= 110) return false;
    return unitCosts.some((table, i) => wallet.resources[i] < 10 * read(table + id, 1)?.getUint8(0));
  }

  function unavailableCommands(wine, commands) {
    let mask = 0, read, wallet;
    for (const command of commands) {
      const type = purchaseTypes.get(command.actionAddress);
      if (!command.nativeVisible || !type || (type === 'build' && !command.isBuildingPlacement)) continue;
      if (!read) {
        read = guestReader(wine);
        wallet = readWallet(read);
        if (!wallet) break;
      }
      if (lacksResources(read, wallet, type, command.param)) mask |= 1 << command.id;
    }
    return mask;
  }

  function placementUnaffordable(wine) {
    const read = guestReader(wine);
    if (!read(0x4b50a8, 1)?.getUint8(0)) return false;
    const type = read(0x4b50b0, 1)?.getUint8(0);
    const wallet = readWallet(read);
    return !!wallet && type >= 58 && lacksResources(read, wallet, 'build', type);
  }

  function activeConstruction(wine, view) {
    if (view?.count !== 1) return false;
    const read = guestReader(wine);
    const building = read(view.selectedPointers[0], 0x2d);
    const player = read(0x4acb68, 1)?.getUint8(0);
    if (!building || player === undefined || building.getUint8(0x2c) !== player) return false;
    // Native construction cancellation checks the building type and rejects
    // completed or removed objects before applying its original refund.
    const typeFlags = read(0x4cf574 + building.getUint8(0x27) * 4, 1)?.getUint8(0);
    return (typeFlags & 0x20) !== 0 && (building.getUint8(0x1e) & 0x87) === 0;
  }

  function infoButtons(view, layer) {
    if (!layer?.root) return [];
    if (view(0x4bdcd0, 4)?.getUint32(0, true) !== layer.root) return [];
    const root = view(layer.root, 0x4a);
    if (root?.getUint16(0x20, true) !== 15 || root.getUint16(0x22, true) !== 0 ||
        root.getUint32(0x2a, true) !== 0x44ab20 || root.getUint16(0x36, true) !== layer.source.width ||
        root.getUint16(0x38, true) !== layer.source.height) return [];
    const rects = [];
    let node = root.getUint32(0x46, true);
    // Scene 15 also contains inert labels, bars and production graphics.
    // Only the original portrait handler responds to a click.
    for (let count = 0; node && count < 32; count++) {
      const child = view(node, 0x36);
      if (!child || child.getUint32(0x32, true) !== layer.root) return [];
      node = child.getUint32(0, true);
      if (!(child.getUint32(0x18, true) & 8) || child.getUint16(0x20, true) > 8 ||
          child.getUint16(0x22, true) !== 2 || child.getUint32(0x2a, true) !== 0x44aff0 ||
          child.getUint32(0x2e, true) !== 0x445370) continue;
      const x = child.getInt16(4, true), y = child.getInt16(6, true);
      const width = child.getInt16(8, true) - x + 1, height = child.getInt16(10, true) - y + 1;
      if (width > 0 && height > 0) rects.push({left: layer.source.left + x, top: layer.source.top + y, width, height,
        id:child.getUint16(0x20, true), unit:child.getUint32(0x26, true)});
    }
    return node ? [] : rects;
  }

  function infoFocus(wine, layer, point, selection, g, shiftKey) {
    const view = guestReader(wine), portraits = infoButtons(view, layer);
    const portrait = portraits.find(({left, top, width, height}) => point.x >= left && point.x < left + width &&
      point.y >= top && point.y < top + height);
    const count = view(0x4bdce0, 1)?.getUint8(0);
    if (!portrait || !count || count > 9) return null;

    // 44B035 uses the painted cell for a group and the active object for one
    // selection. Keep Shift removal and the transport's passenger action native.
    if (count > 1 && shiftKey) return {native:true};
    const active = count === 1 ? view(0x4bdcc8, 4)?.getUint32(0, true) : portrait.unit;
    if (!active || !selection.selectedPointers.includes(active) ||
        (count > 1 && selection.contextPointers[portrait.id] !== active)) return null;
    const unit = view(active, 0x46);
    if (!unit) return null;
    const type = unit.getUint8(0x27);
    if (count === 1 && portrait.unit !== active &&
        (view(0x4cf574 + type * 4, 4)?.getUint32(0, true) & 0x400)) return {native:true};
    // Match the original camera action's ownership check and map tile anchor.
    const player = view(0x4acb68, 1)?.getUint8(0);
    if (player === undefined || (unit.getUint8(0x2c) !== player && unit.getUint16(0x44, true) !== 0)) return null;
    const tx = unit.getInt16(0x18, true), ty = unit.getInt16(0x1a, true);
    if (tx < 0 || tx >= g.mapWidth || ty < 0 || ty >= g.mapHeight) return null;
    const size = view(0x4cee6c + type * 4, 4);
    const center = (tile, span) => (tile + (span && span % 2 === 0 ? 0 : .5)) * 32;
    return {unit:active, x:center(tx, size?.getUint16(0, true)), y:center(ty, size?.getUint16(2, true))};
  }

  function objectivesBodyEnd(wine, modal, frame) {
    const layer = modal?.stack?.find(item => item.root === modal.currentDialog && item.nativeVisible);
    if (layer?.handlerAddress !== 0x4353a0 ||
        layer.rect.right-layer.rect.left!==255 || layer.rect.bottom-layer.rect.top!==287) return undefined;
    if (!frame?.usable || frame.dialogRoot !== layer.root) return null;
    const read = guestReader(wine);
    const image = read(layer.root+0xc,8);
    if (image?.getUint16(0,true)!==256 || image.getUint16(2,true)!==288) return undefined;
    const native = read(image.getUint32(4,true),256*288);
    if (!native) return undefined;
    const plain = new Uint8Array(native.buffer,native.byteOffset,native.byteLength);
    const {left,top,right,bottom} = layer.rect, {width,height} = frame.screen;
    if (right>=width || bottom>=height) return null;
    const row = (y,x) => frame.indices[(top+y)*width+left+x];
    // The original dialog background already has the palette indices in the
    // completed frame. Require matching blank strips on both sides of the
    // text area and native heading / footer pixels before removing any rows.
    for (const y of [8,56,244,282]) for (let x=8;x<248;x+=9) {
      if (row(y,x)!==plain[y*256+x]) return null;
    }
    const hasInk = (y, first=16, last=240) => {
      for (let x=first;x<last;x++) if (row(y,x)!==plain[y*256+x]) return true;
      return false;
    };
    let heading=false, footer=false;
    for (let y=12;y<30&&!heading;y++) heading=hasInk(y);
    for (let y=252;y<270&&!footer;y++) footer=hasInk(y);
    if (!heading || !footer) return null;
    for (let y=239;y>=64;y--) {
      if (hasInk(y,16,220)) return Math.min(245,Math.max(94,y+13));
    }
    // A matching heading/footer can precede the first objective paint.
    return null;
  }

  function createObjectivesCheckbox(wine, frame, surface) {
    const label = document.createElement('label');
    label.id = 'warcraft-objectives-at-start';
    label.hidden = true;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'warcraft-native-checkbox';
    checkbox.dataset.winePageDialog = '';
    const russian = window.WarcraftLanguage?.current?.() === 'ru';
    const caption = document.createElement('img');
    caption.alt = russian ? 'Показывать каждый раз' : 'Show Every Time';
    caption.src = `./menu-art/label-${russian ? 'ru-' : ''}show-objectives.png`;
    label.append(checkbox, caption);
    frame.append(label);
    const policy = window.WarcraftAssemblyMenuPolicy;
    checkbox.addEventListener('change', () => {
      policy?.showObjectivesAtStart(wine, checkbox.checked);
    });

    return layout => {
      const row = layout?.objectivesCheckbox;
      if (!row) {
        label.hidden = true;
        return;
      }
      const checked = policy?.showObjectivesAtStart(wine);
      if (typeof checked !== 'boolean') return;
      const sx = surface.clientWidth / layout.width;
      const sy = surface.clientHeight / layout.height;
      const geometry = [row.left * sx, row.top * sy, row.width * sx, row.height * sy];
      const nextStyle = geometry.join(':');
      if (label.dataset.geometry !== nextStyle) {
        const [left, top, width, height] = geometry;
        Object.assign(label.style, {left:left + 'px', top:top + 'px', width:width + 'px', height:height + 'px',
          fontSize:19 * row.scale * sy + 'px'});
        label.dataset.geometry = nextStyle;
      }
      checkbox.checked = checked;
      label.hidden = false;
    };
  }

  function attach(wine, renderer, {onTitlePrepared, initialPage} = {}) {
    const vfs = wine._helpCtx.vfs;
    const surface = document.getElementById('screen');
    const display = document.getElementById('screen-present');
    const frame = document.getElementById('screen-canvas-stack');
    const detachForegroundAudio = onTitlePrepared && window.WarcraftAudioLifecycle?.attach(wine);
    const menuButtonSize = window.WarcraftAssemblyDialogLayout?.menuButtonHeight;
    const menuResize = onTitlePrepared && menuButtonSize && new ResizeObserver(([entry]) => {
      const {width,height} = entry.contentRect;
      const left = window.WarcraftFullMap?.hudInsets?.left || 0;
      const right = window.WarcraftFullMap?.hudInsets?.right || 0;
      frame.style.setProperty('--warcraft-menu-row-height',
        menuButtonSize(width-(left>4?left:0)-(right>4?right:0),height)+'px');
    });
    if (menuResize) menuResize.observe(frame);
    const input = window.WarcraftAssemblyInput.create(wine, renderer);
    const objectivesCheckbox = onTitlePrepared && createObjectivesCheckbox(wine, frame, surface);
    const matchSettings = onTitlePrepared && window.WarcraftMatchPreferences?.create(wine, frame);
    const demoPlaying = () => window.WarcraftAssemblyMenuPolicy?.demoPlaying(wine) === true;
    const originalKeyDown = renderer.handleKeyDown, originalKeyUp = renderer.handleKeyUp;
    let demoExitPending = false;
    const demoBack = onTitlePrepared && createDemoBack(frame, () => {
      if (demoExitPending || !demoPlaying()) return;
      demoExitPending = true;
      // Escape already calls the original demo shutdown in Warcraft.
      const key = {code:'Escape',location:0,repeat:false};
      originalKeyDown.call(renderer, 27, key);
      originalKeyUp.call(renderer, 27, key);
    });
    const restore = [];
    function wrap(owner, name, handler) {
      const original = owner[name];
      const replacement = handler(original);
      owner[name] = replacement;
      restore.push(() => { if (owner[name] === replacement) owner[name] = original; });
    }
    let presented = null;
    function show(owner, mode) {
      if (presented !== owner) {
        presented = owner;
        frame.dataset.warcraftPresentation = owner;
      }
      if (frame.dataset.warcraftMode !== mode) frame.dataset.warcraftMode = mode;
      if (demoBack) {
        demoBack.hidden = owner !== 'map' || mode !== 'world' || !demoPlaying();
        if (demoBack.hidden) demoExitPending = false;
      }
      delete frame.dataset.warcraftTransition;
    }
    function hold(owner) {
      if ((!presented || presented === owner) && !('warcraftTransition' in frame.dataset)) {
        frame.dataset.warcraftTransition = '';
      }
    }
    if (onTitlePrepared) {
      hold('menu');
      if (window.matchMedia('(pointer: coarse)').matches || window.WarcraftAudioLifecycle?.isAppleMobile(navigator)) {
        wrap(wine, '_scheduleStep', schedule => function(step, delay = 0) {
          // The idle title polls even when there is no native work. Use the
          // host's interruptible timer there and keep normal scheduling as
          // soon as any transition, native menu or match takes over.
          const idleTitle = !document.hidden && frame.dataset.warcraftMode === 'title' &&
            !('warcraftTransition' in frame.dataset);
          return schedule.call(this, step, idleTitle && delay === 0 ? 4 : delay);
        });
      }
      let placementEscape = false;
      for (const name of ['handleKeyDown', 'handleKeyPress']) {
        if (typeof renderer[name] !== 'function') continue;
        wrap(renderer, name, handle => function(...args) {
          if (name === 'handleKeyDown' && args[0] === 27 &&
              (placementEscape || window.WarcraftFullMap?.canConfirmBuildCancellation?.())) {
            placementEscape = true;
            return; // The confirmation's own key listener handles this press.
          }
          if (!demoPlaying() && !('warcraftTransition' in frame.dataset) &&
              !('warcraftPurchase' in frame.dataset)) return handle.apply(this, args);
        });
      }
      for (const name of ['handleMouseDown', 'handleMouseMove', 'handleMouseUp', 'handleKeyUp']) {
        if (typeof renderer[name] !== 'function') continue;
        wrap(renderer, name, handle => function(...args) {
          if (name === 'handleKeyUp' && args[0] === 27 && placementEscape) {
            placementEscape = false;
            return;
          }
          if (!demoPlaying()) return handle.apply(this, args);
        });
      }
    }
    let menu, notifyMapFrame;
    const detachTransport = window.attachWarcraftUiTransport({
      ...input,
      surface,
      input: surface,
      allowNativeTouch: () => menu?.nativeTouch === true,
      read(name) {
        const bytes = vfs.files.get(nativePath(name))?.data;
        if (!bytes) throw new Error('Waiting for native UI packet ' + name);
        return bytes;
      },
      write(name, bytes) {
        vfs.files.set(nativePath(name), {data:bytes, attrs:0x20});
      },
    });
    menu = window.WarcraftIndependentCameraPilot && window.WarcraftAssemblyMenu
      ? window.WarcraftAssemblyMenu.install({wine, renderer, source: surface, frame, initialPage,
        onPrepared({mode, authored}) {
          if (!onTitlePrepared) return;
          show('menu', mode);
          if (mode === 'title' && authored) onTitlePrepared();
        },
        onUnavailable() { if (onTitlePrepared) hold('menu'); },
      })
      : null;
    if (menu) window.WarcraftAssemblyMenuDebug = menu.debug;
    const textures = window.WarcraftAssemblyMenuNavigation && Object.fromEntries(['human', 'orc'].map(faction => {
      const image = new Image();
      image.src = `./menu-art/${faction}-texture.png`;
      return [faction, image];
    }));
    const detachMap = window.WarcraftFullMap.install({
      source: surface, input: surface, display, frame, container: frame,
      independentCamera: window.WarcraftIndependentCameraPilot,
      onPresented: onTitlePrepared ? (mode, layout) => {
        show('map', mode);
        if (mode === 'dialog') {
          const faction = modalFaction(wine);
          if (faction && frame.dataset.warcraftModalFaction !== faction) frame.dataset.warcraftModalFaction = faction;
        }
        objectivesCheckbox(mode === 'dialog' ? layout : null);
        matchSettings?.(mode === 'dialog' ? layout : null);
      } : undefined,
      onUnavailable: onTitlePrepared ? () => {
        objectivesCheckbox(null);
        matchSettings?.(null);
        hold('map');
      } : undefined,
      acceptsInput: onTitlePrepared
        ? () => presented === 'map' && !demoPlaying() && !('warcraftTransition' in frame.dataset) : undefined,
      infoButtons: layer => infoButtons(guestReader(wine), layer),
      infoFocus: (...args) => infoFocus(wine, ...args),
      objectivesBodyEnd: (...args) => objectivesBodyEnd(wine, ...args),
      modalBack: window.WarcraftAssemblyMenuNavigation?.createModalBack?.(wine),
      modalFaction: () => modalFaction(wine),
      purchaseTooltipMatches: command => purchaseTooltipMatches(wine, command),
      unavailableCommands: commands => unavailableCommands(wine, commands),
      placementUnaffordable: () => placementUnaffordable(wine),
      activeConstruction: view => activeConstruction(wine, view),
      modalSlider: (layer, x, y) => window.WarcraftAssemblyMenuPolicy?.sliderAt(wine, layer, x, y),
      modalTexture() {
        if (!textures || !window.WarcraftUiBridge.state().inGame) return null;
        return textures[modalFaction(wine)] ?? null;
      },
      setOriginalCursor(element, value) {
        // Wine owns the canvas cursor and may hide it for software-cursor games.
        // While BNE supplies its cursor plane, display it on a separate CSS property.
        const property = '--warcraft-original-cursor';
        if (value === null) {
          element.classList.remove('warcraft-original-cursor');
          element.style.removeProperty(property);
        } else if (element.style.getPropertyValue(property) !== value) {
          element.style.setProperty(property, value);
          element.classList.add('warcraft-original-cursor');
        }
      },
      subscribeFrame(callback) {
        notifyMapFrame = callback;
        wrap(renderer, 'observePresentationPublication', observe => function(...args) {
          observe.apply(this, args);
          wine.warcraftSession?.native?.tick();
          callback();
          if (args[0]?.backend !== 'warcraft-map') menu?.onFrame(args[0]);
        });
      },
    });
    if (onTitlePrepared && menu) {
      const gdi = wine.hostCtx.sharedGdi;
      let mapRepaint = false, hiddenCopyDeferred = false, restoreScanout = false;

      function guestValue(address, bytes) {
        const offset = wine.instance.exports.guest_to_wasm(address) >>> 0;
        const buffer = wine.memory.buffer;
        if (offset <= 0xf0 || offset + bytes > buffer.byteLength) return -1;
        const view = new DataView(buffer);
        if (bytes === 1) return view.getUint8(offset);
        if (bytes === 2) return view.getUint16(offset, true);
        return view.getUint32(offset, true);
      }

      function ownsWorld() {
        if (!wine.running || wine.guestWorker || presented !== 'map' || frame.dataset.warcraftMode !== 'world' ||
            'warcraftTransition' in frame.dataset || renderer._immutableCaptureRequest) return false;
        const hwnd = wine.instance.exports.get_dx_exclusive_hwnd() >>> 0;
        if (!hwnd || renderer._exclusiveTransform?.hwnd !== hwnd ||
            renderer.windows[hwnd]?.wasm !== wine.instance ||
            Object.values(renderer.windows).some(win => win.visible && !win.isChild && win.hwnd !== hwnd) ||
            guestValue(0x4ae86c, 1) !== 1 || guestValue(0x4ae480, 2) !== 3 ||
            guestValue(0x4b406c, 4) !== 0 || guestValue(0x4d4ae0, 2) !== surface.width ||
            guestValue(0x4d4ae2, 2) !== surface.height) return false;
        const bridge = window.WarcraftUiBridge;
        const completed = bridge.completedFrame();
        return completed?.usable && !completed.dialogRoot && completed.sceneEpoch === bridge.viewState()?.mapEpoch &&
          completed.screen.width === surface.width && completed.screen.height === surface.height;
      }

      // The V16 canvas uses the completed indexed guest frame. Keep normal
      // DirectDraw timing and input bookkeeping but skip uploading a second,
      // hidden copy once the original world and our displayed owner agree.
      wrap(gdi, 'presentBestDxOffscreen', upload => function(...args) {
        if (restoreScanout || !ownsWorld()) {
          const uploaded = upload.apply(this, args);
          if (uploaded) hiddenCopyDeferred = false;
          return uploaded;
        }
        hiddenCopyDeferred = true;
        notifyMapFrame();
        return 0;
      });
      wrap(renderer, '_repaintOnce', repaint => function(capture) {
        mapRepaint = !capture && ownsWorld();
        if (mapRepaint) return null;
        if (hiddenCopyDeferred && !wine._dxLockDeferred && wine.running) {
          // A capture or a window change can request a repaint before the
          // next guest unlock. Restore through the normal lock-aware upload.
          restoreScanout = true;
          wine._dxDirty = true;
          try { wine._presentDxIfDirty(true); }
          finally { restoreScanout = false; }
        }
        return repaint.call(this, capture);
      });
      wrap(renderer, '_presentDisplayCanvas', scanout => function() {
        if (!mapRepaint) return scanout.call(this);
        mapRepaint = false;
        return {source: null, output: this.canvas, backend: 'warcraft-map'};
      });
    }
    window.installWarcraftDuneControls();
    window.WarcraftFullMap.installInputRouter();
    return () => {
      detachForegroundAudio?.();
      if (menuResize) {
        menuResize.disconnect();
        frame.style.removeProperty('--warcraft-menu-row-height');
      }
      detachMap?.();
      detachTransport();
      menu?.destroy();
      for (const release of restore.reverse()) release();
      demoBack?.remove();
      if (window.WarcraftAssemblyMenuDebug === menu?.debug) delete window.WarcraftAssemblyMenuDebug;
      for (const id of ['warcraft-objectives-at-start', 'warcraft-match-settings', 'warcraft-match-settings-heading']) {
        frame.querySelector('#' + id)?.remove();
      }
      delete frame.dataset.warcraftPresentation;
      delete frame.dataset.warcraftMode;
      delete frame.dataset.warcraftTransition;
    };
  }

  window.attachWarcraftAssemblyV16 = attach;
})();
