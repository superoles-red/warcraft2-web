/* Connect the V16 compositor and gestures to the Wine-Assembly guest. */
(() => {
  'use strict';
  const nativePath = name => 'c:\\' + name.replaceAll('/', '\\');

  function infoButtons(wine, layer) {
    const translate = wine.instance?.exports?.guest_to_wasm;
    const memory = wine.memory?.buffer;
    if (!translate || !memory || !layer.root || wine.guestWorker) return [];
    function view(address, length) {
      if (address < 0x10000 || address + length > 0x100000000) return null;
      const start = translate(address) >>> 0;
      const end = translate(address + length - 1) >>> 0;
      return start > 0xf0 && end === start + length - 1 && end < memory.byteLength
        ? new DataView(memory, start, length) : null;
    }
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
      if (width > 0 && height > 0) rects.push({left: layer.source.left + x, top: layer.source.top + y, width, height});
    }
    return node ? [] : rects;
  }

  function createObjectivesCheckbox(wine, frame, surface) {
    const label = document.createElement('label');
    label.id = 'warcraft-objectives-at-start';
    label.hidden = true;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.winePageDialog = '';
    const russian = window.WarcraftLanguage?.current?.() === 'ru';
    const caption = document.createElement('img');
    caption.alt = russian ? 'Показывать в начале' : 'Show at Start';
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

  function attach(wine, renderer, {onTitlePrepared} = {}) {
    const vfs = wine._helpCtx.vfs;
    const surface = document.getElementById('screen');
    const display = document.getElementById('screen-present');
    const frame = document.getElementById('screen-canvas-stack');
    const input = window.WarcraftAssemblyInput.create(wine, renderer);
    const objectivesCheckbox = onTitlePrepared && createObjectivesCheckbox(wine, frame, surface);
    const matchSettings = onTitlePrepared && window.WarcraftMatchPreferences?.create(wine, frame);
    let presented = null;
    function show(owner, mode) {
      if (presented !== owner) {
        presented = owner;
        frame.dataset.warcraftPresentation = owner;
      }
      if (frame.dataset.warcraftMode !== mode) frame.dataset.warcraftMode = mode;
      delete frame.dataset.warcraftTransition;
    }
    function hold(owner) {
      if ((!presented || presented === owner) && !('warcraftTransition' in frame.dataset)) {
        frame.dataset.warcraftTransition = '';
      }
    }
    if (onTitlePrepared) {
      hold('menu');
      for (const name of ['handleKeyDown', 'handleKeyPress']) {
        const handle = renderer[name];
        if (typeof handle !== 'function') continue;
        renderer[name] = function(...args) {
          if (!('warcraftTransition' in frame.dataset)) return handle.apply(this, args);
        };
      }
    }
    let menu, notifyMapFrame;
    window.attachWarcraftUiTransport({
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
      ? window.WarcraftAssemblyMenu.install({wine, renderer, source: surface, frame,
        onPrepared({mode, authored}) {
          if (!onTitlePrepared) return;
          show('menu', mode);
          if (mode === 'title' && authored) onTitlePrepared();
        },
        onUnavailable() { if (onTitlePrepared) hold('menu'); },
      })
      : null;
    if (menu) window.WarcraftAssemblyMenuDebug = menu.debug;
    const textures = window.WarcraftAssemblyMenuNavigation && ['human', 'orc'].map(faction => {
      const image = new Image();
      image.src = `./menu-art/${faction}-texture.png`;
      return image;
    });
    window.WarcraftFullMap.install({
      source: surface, input: surface, display, frame, container: frame,
      independentCamera: window.WarcraftIndependentCameraPilot,
      onPresented: onTitlePrepared ? (mode, layout) => {
        show('map', mode);
        objectivesCheckbox(mode === 'dialog' ? layout : null);
        matchSettings?.(mode === 'dialog' ? layout : null);
      } : undefined,
      onUnavailable: onTitlePrepared ? () => {
        objectivesCheckbox(null);
        matchSettings?.(null);
        hold('map');
      } : undefined,
      acceptsInput: onTitlePrepared
        ? () => presented === 'map' && !('warcraftTransition' in frame.dataset) : undefined,
      infoButtons: layer => infoButtons(wine, layer),
      modalBack: window.WarcraftAssemblyMenuNavigation?.createModalBack?.(wine),
      modalSlider: (layer, x, y) => window.WarcraftAssemblyMenuPolicy?.sliderAt(wine, layer, x, y),
      modalTexture() {
        if (!textures || !window.WarcraftUiBridge.state().inGame) return null;
        const offset = wine.instance?.exports?.guest_to_wasm?.(0x4abb7c) >>> 0;
        const memory = wine.memory?.buffer;
        return offset > 0xf0 && offset < memory?.byteLength
          ? textures[new Uint8Array(memory, offset, 1)[0] === 0 ? 0 : 1] : null;
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
        const observe = renderer.observePresentationPublication;
        renderer.observePresentationPublication = function(...args) {
          observe.apply(this, args);
          callback();
          if (args[0]?.backend !== 'warcraft-map') menu?.onFrame(args[0]);
        };
      },
    });
    if (onTitlePrepared && menu) {
      const gdi = wine.hostCtx.sharedGdi;
      const upload = gdi.presentBestDxOffscreen;
      const repaint = renderer._repaintOnce;
      const scanout = renderer._presentDisplayCanvas;
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
      gdi.presentBestDxOffscreen = function(...args) {
        if (restoreScanout || !ownsWorld()) {
          const uploaded = upload.apply(this, args);
          if (uploaded) hiddenCopyDeferred = false;
          return uploaded;
        }
        hiddenCopyDeferred = true;
        notifyMapFrame();
        return 0;
      };
      renderer._repaintOnce = function(capture) {
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
      };
      renderer._presentDisplayCanvas = function() {
        if (!mapRepaint) return scanout.call(this);
        mapRepaint = false;
        return {source: null, output: this.canvas, backend: 'warcraft-map'};
      };
    }
    window.installWarcraftDuneControls();
    window.WarcraftFullMap.installInputRouter();
  }

  window.attachWarcraftAssemblyV16 = attach;
})();
