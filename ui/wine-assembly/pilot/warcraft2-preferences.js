/* Combined match settings retain the original Sound dialog and offline game setters. */
(() => {
  'use strict';

  const handler = 0x441940;
  const request = 0x48f568;
  const levels = [4, 7, 8];

  function view(wine, address, size) {
    const translate = wine.instance?.exports?.guest_to_wasm;
    const memory = wine.memory?.buffer;
    if (!translate || !memory || !address) return null;
    const start = translate(address) >>> 0, end = translate(address + size - 1) >>> 0;
    return start > 0xf0 && end === start + size - 1 && end < memory.byteLength
      ? new DataView(memory, start, size) : null;
  }

  function machineCode(address) {
    const bytes = [];
    return {
      bytes,
      emit(...data) { bytes.push(...data); },
      dword(n) { this.emit(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24); },
      branch(opcode, target) {
        this.emit(opcode);
        this.dword(target - (address + bytes.length + 4));
      },
      skipIf(opcode) {
        this.emit(opcode, 0);
        const index = bytes.length - 1;
        return () => { bytes[index] = bytes.length - index - 1; };
      },
    };
  }

  function install(wine) {
    const patches = [];
    function replace(address, original, bytes) {
      const target = view(wine, address, original.length);
      if (!target || original.some((byte, i) => target.getUint8(i) !== byte)) {
        throw new Error('Original Warcraft II settings bytes did not match at 0x' + address.toString(16));
      }
      patches.push(() => bytes.forEach((byte, i) => target.setUint8(i, byte)));
    }
    const codeRanges = [];
    function setCode(address, code) {
      const end = address + code.bytes.length;
      if (codeRanges.some(([start, stop]) => address < stop && end > start)) {
        throw new Error('Overlapping Warcraft II settings handlers');
      }
      codeRanges.push([address, end]);
      replace(address, Array(code.bytes.length).fill(0), code.bytes);
    }
    function redirect(address, original, target, opcode = 0xe8) {
      const code = machineCode(address);
      code.branch(opcode, target);
      replace(address, original, code.bytes);
    }

    // Pause > Options enters original Sound directly. Its old standalone-title
    // path is independent. The old in-match Settings shortcut opens this same panel.
    redirect(0x4355b5, [0xe8,0x76,0x96,0xff,0xff], 0x48f570);
    redirect(0x43da30, [0x68,0x50,0xda,0x43,0x00], 0x441920, 0xe9);
    const entry = machineCode(0x48f570);
    entry.emit(0xc7,0x05); entry.dword(0x4b4a14); entry.dword(0);
    entry.emit(0xfe,0x05); entry.dword(0x4b4024);
    entry.branch(0xe9, 0x441920);
    setCode(0x48f570, entry);

    // Both hidden sound switches stay enabled. The original saved setting for
    // subtitles is cleared before the title and during each game start.
    function fixedSound(code) {
      code.emit(0x81,0x25); code.dword(0x4d6b50); code.dword(0xfffbffff);
      code.emit(0x83,0x0d); code.dword(0x4d6b50); code.emit(0x06);
    }
    const title = machineCode(0x48f590);
    fixedSound(title);
    title.branch(0xe9, 0x4728e0);
    setCode(0x48f590, title);
    redirect(0x42aa6f, [0xe8,0x6c,0x7e,0x04,0x00], 0x48f590);

    const start = machineCode(0x48f5b0);
    fixedSound(start);
    start.emit(0x83,0x3d); start.dword(0x4ae84c); start.emit(0);
    const savedOrReplay = start.skipIf(0x75);
    start.emit(0x80,0x3d); start.dword(0x4b49ce); start.emit(0);
    const network = start.skipIf(0x75);
    start.emit(0x80,0x3d); start.dword(0x4ae0f9); start.emit(0);
    const demo = start.skipIf(0x75);
    start.emit(0x83,0x3d); start.dword(0x4ae26c); start.emit(0,0x0f,0x95,0xc0,0x0f,0xb6,0xc0,
      0x8d,0x44,0x00,0x05,0x50);
    start.branch(0xe8, 0x4204f0); // Classic display 5, expansion display 7.
    start.emit(0x83,0xc4,0x04);
    savedOrReplay(); network(); demo();
    start.branch(0xe9, 0x436bd0);
    setCode(0x48f5b0, start);
    redirect(0x420dab, [0xe8,0x20,0x5e,0x01,0x00], 0x48f5b0);

    // Commit only on original OK. The native Sound close still applies
    // volumes and restores its snapshot on Cancel. Use native fog invalidation
    // and visibility refresh as in original Preferences.
    const close = machineCode(0x48f610);
    close.emit(0xff,0x74,0x24,0x04);
    close.branch(0xe8, 0x435300);
    close.emit(0x83,0xc4,0x04,0x83,0x3d); close.dword(0x4ab8d0); close.emit(0xfe);
    const canceled = close.skipIf(0x75);
    close.emit(0x80,0x3d); close.dword(0x4b49ce); close.emit(0);
    const online = close.skipIf(0x75);
    close.emit(0x0f,0xb6,0x05); close.dword(request); close.emit(0x85,0xc0);
    const speedUnchanged = close.skipIf(0x74);
    close.emit(0x48,0x50); close.branch(0xe8, 0x4204f0); close.emit(0x83,0xc4,0x04);
    speedUnchanged();
    close.emit(0xa0); close.dword(request+1); close.emit(0x84,0xc0);
    const fogUnchanged = close.skipIf(0x74);
    close.emit(0xfe,0xc8,0x86,0x05); close.dword(0x4acef0);
    close.emit(0x50);
    close.branch(0xe8, 0x42d9d0);
    close.emit(0x58,0x84,0xc0);
    const fogWasOn = close.skipIf(0x74);
    close.emit(0x80,0x3d); close.dword(0x4acef0); close.emit(0);
    const fogIsOff = close.skipIf(0x75);
    close.branch(0xe8, 0x42d430);
    fogWasOn(); fogIsOff(); fogUnchanged(); online(); canceled();
    close.emit(0x66,0xc7,0x05); close.dword(request); close.emit(0,0,0xc3);
    setCode(0x48f610, close);
    redirect(0x441ab4, [0xe8,0x47,0x38,0xff,0xff], 0x48f610);

    // Cancel still has the native parent-list depth. Native OK resumes play.
    // Route only the remaining parent callback to the original Pause return.
    const back = machineCode(0x48f6b0);
    back.emit(0x8b,0x4c,0x24,0x0c,0x89,0x4c,0x24,0x04);
    back.emit(0x80,0x05); back.dword(0x4b4024); back.emit(2);
    back.branch(0xe9, 0x435702);
    setCode(0x48f6b0, back);
    redirect(0x441ad8, [0xe8,0x13,0x44,0xff,0xff], 0x48f6b0);

    // Hide original control IDs 5, 6 and 8 on initialization and prevent
    // their old accelerator paths from changing the audio/visibility flags.
    const original = [0x56,0x8b,0x74,0x24,0x08];
    const speech = machineCode(0x48f6a0);
    speech.emit(...original);
    speech.branch(0xe9, 0x4417c5);
    setCode(0x48f6a0, speech);
    const filter = machineCode(0x48f680);
    filter.emit(0x8b,0x44,0x24,0x04,0x66,0x83,0x78,0x20,0x04,0x74,0x0b,
      0x80,0x60,0x18,0xf7,0x80,0x48,0x18,0x02,0x31,0xc0,0xc3);
    filter.branch(0xe9, 0x48f6a0);
    setCode(0x48f680, filter);
    redirect(0x4417c0, original, 0x48f680, 0xe9);
    if (window.WarcraftLanguage?.current?.() !== 'ru') {
      // 404B50 has finished resolving the localized Sound controls. Change
      // only the exact English label, leaving the Russian caption untouched.
      const caption = new TextEncoder().encode('Sound Effects\0');
      const labelAddress = 0x48f720;
      replace(labelAddress, Array(caption.length).fill(0), caption);
      const name = machineCode(0x48f6d0);
      name.emit(0x53,0x56,0x57,0x8b,0x43,0x46,0xbe);
      name.dword(24);
      const loop = name.bytes.length;
      name.emit(0x85,0xc0);
      const done1 = name.skipIf(0x74);
      name.emit(0x66,0x83,0x78,0x06,0x48);
      const next1 = name.skipIf(0x75);
      name.emit(0x8b,0x50,0x14,0x85,0xd2);
      const next2 = name.skipIf(0x74);
      name.emit(0x81,0x3a); name.dword(0x69676944);
      const next3 = name.skipIf(0x75);
      name.emit(0xc7,0x40,0x14); name.dword(labelAddress);
      const done2 = name.skipIf(0xeb);
      next1(); next2(); next3();
      name.emit(0x8b,0x00,0x4e,0x75,(loop-name.bytes.length-5)&255);
      done1(); done2();
      name.emit(0x5f,0x5e,0x5b);
      name.branch(0xe9, 0x4360e0);
      setCode(0x48f6d0, name);
      redirect(0x4419c8, [0xe8,0x13,0x47,0xff,0xff], 0x48f6d0);
    }
    replace(request,[0,0],[0,0]);
    for (const apply of patches) apply();
  }

  function create(wine, frame) {
    // The widest speed caption in the shipped English and Russian bitmap sets.
    const widestCaption = 82;
    const prefs = document.createElement('div');
    prefs.id = 'warcraft-match-settings';
    prefs.dataset.winePageDialog = '';
    prefs.hidden = true;
    const ru = window.WarcraftLanguage?.current?.() === 'ru';
    function glyph(name) {
      const image = new Image();
      image.src = './menu-art/label-' + (ru ? 'ru-' : '') + name + '.png';
      image.alt = '';
      return image;
    }
    const fog = document.createElement('label'), toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.setAttribute('aria-label', ru ? 'Туман войны' : 'Fog of War');
    fog.append(toggle, glyph('fog-of-war'));

    const heading = glyph('settings');
    heading.id = 'warcraft-match-settings-heading';
    heading.hidden = true;
    const speedTitle = glyph('game-speed');
    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', ru ? 'Скорость игры' : 'Game Speed');
    const buttons = ['normal', 'faster', 'max'].map((name, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      const labels = ru ? ['Медленно', 'Средне', 'Быстро'] : ['Slow', 'Medium', 'Fast'];
      button.setAttribute('aria-label', labels[i]);
      button.append(glyph('speed-' + name));
      button.addEventListener('click', () => {
        if (!active) return;
        active.speedRequest = (active.expansion ? levels[i] : [3, 5, 6][i]) + 1;
        updateButtons(i);
        writeRequest();
      });
      group.append(button);
      return button;
    });
    const speed = document.createElement('section');
    speed.append(speedTitle, group);
    prefs.append(fog, speed);
    frame.append(heading, prefs);
    let active = null, extent = null;

    function updateButtons(index) {
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    }
    function writeRequest() {
      const data = view(wine, request, 2);
      data?.setUint8(0, active.speedRequest);
      data?.setUint8(1, toggle.checked ? 1 : 2);
    }
    toggle.addEventListener('change', () => { if (active) writeRequest(); });

    function hide() {
      heading.hidden = true;
      prefs.hidden = true;
      active = null;
    }

    return layout => {
      const panel = layout?.preferencesBody;
      if (!panel || layout.layers?.at(-1)?.handlerAddress !== handler) { hide(); return; }
      if (layout.token !== active?.token) {
        const currentSpeed = view(wine, 0x4d6b38, 4)?.getInt32(0, true);
        const expansion = !!view(wine, 0x4ae26c, 4)?.getInt32(0, true);
        active = {token:layout.token, speedRequest:0, expansion};
        toggle.checked = view(wine, 0x4acef0, 1)?.getUint8(0) === 0;
        const step = expansion ? levels : [4, 6, 7];
        updateButtons(currentSpeed >= step[2] ? 2 : currentSpeed === step[1] ? 1 : 0);
        view(wine, request, 2)?.setUint16(0, 0, true);
      }
      const sx = frame.clientWidth / layout.width;
      const sy = frame.clientHeight / layout.height;
      const scale = layout.target.scale * sy;
      const box = [panel.left * sx, panel.top * sy, panel.width * sx, panel.height * sy,
        (layout.target.top + 3 * layout.target.scale) * sy];
      const css = box.join(':');
      if (extent !== css) {
        const [left, top, width, height, headingTop] = box;
        Object.assign(prefs.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
        Object.assign(heading.style,{left:left+width/2+'px',top:headingTop+'px',
          height:19*scale+'px'});
        prefs.style.setProperty('--settings-glyph', 19 * scale + 'px');
        const captionScale = Math.max(0, Math.min(scale,
          ((width - 2 * 4) / buttons.length - 6) / widestCaption));
        prefs.style.setProperty('--settings-choice-glyph', 19 * captionScale + 'px');
        prefs.style.setProperty('--settings-control', Math.max(24, Math.min(42, height * .32)) + 'px');
        extent = css;
      }
      heading.hidden = false;
      prefs.hidden = false;
    };
  }

  window.WarcraftMatchPreferences = Object.freeze({install, create});
})();
