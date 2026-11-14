/* Offline menu options for the independent-camera Wine-Assembly route. */
(function (global) {
  'use strict';

  const idle = 0x4185c0;
  const menuLoadCall = 0x42aa97;
  const menuTickCall = 0x42b16c;
  const demoTick = 0x418610;
  const demoTimeout = 0x4581c1;
  const stopDemo = 0x418590;
  const fastCancelCall = 0x41579e;
  const fastCancelWrapper = 0x41863b;
  const fastReturnCode = 0x48f350;
  const fastEntryCall = 0x441c8e;
  const fastSetupCall = 0x44f814;
  const titleCall = 0x44f502;
  const fastStartFade = 0x44f819;
  const idleCounter = 0x4958e4;
  const demoRequest = 0xfffe;
  const replay = 0x4ae0f9;
  const gameState = 0x4ae480;
  const inGame = 0x4ae86c;
  const titleScene = 0x4d495c;
  const audioCode = 0x48f430;
  const volumeRequest = 0x8000;
  const volumeOptions = Object.freeze({
    sound: {address: 0x4d6b48, registry: 'sfx'},
    music: {address: 0x4d6b44, registry: 'music'},
  });
  const volumeKey = 'HKCU\\Software\\Blizzard Entertainment\\Warcraft II BNE';
  const soundDialogEntry = 0x441b90;
  const settingsSliders = new Map([[0x441940, 2], [0x442050, 3]]);
  const minimapViewportOutline = 0x42de19;
  const horizontalArrowPaint = [0x406d94, 0x406ea9];
  const scrollbarPress = 0x409367;
  const scrollbarPressCode = 0x48f4a0;
  const startupTips = 0x420d5b;
  const startupObjectivesSetting = 0x48f4d0;
  const objectivesButtonSetup = 0x43548c;
  const objectivesButtonCode = 0x48f4e0;
  const objectivesPreferenceKey = 'warcraft-show-objectives-at-start';
  const deferredDialog = 0x4ab8e4;
  // Shared user-facing file dialogs. The native disk save/load functions
  // used by the checkpoint adapter have their own entry points.
  const fileDialogs = [[0x43c4b0, '83 ec 10 e8 b8 af 03 00 85 c0 75 71'],
    [0x43c960, 'e8 9b f4 ff ff 85 c0 74 42']];
  const soundSwitches = Object.freeze({unitspeech:1, unitnoise:2, bldgnoise:4, dispmsgs:0x40000});
  const installed = new WeakMap();
  const controls = Object.freeze({
    single: Object.freeze({id: 1, x: 320, y: 254}),
    replay: Object.freeze({id: 3, x: 320, y: 326}),
    credits: Object.freeze({id: 4, x: 320, y: 362}),
  });
  const hex = value => Uint8Array.from(value.trim().split(/\s+/), part => Number.parseInt(part, 16));

  const originals = [
    // The two original callers of the title attract timer, and its entry body.
    [0x44f343, 'e8 78 92 fc ff'],
    [menuTickCall, 'e8 4f d4 fe ff 85 c0 74 e4 8b 8c 24 10 01 00 00 c7 05 d0 b8 4a 00 f0 ff 00 00'],
    [idle, `a1 e8 e7 4c 00 85 c0 75 0c 66 b8 58 02 66 a3 e4
      58 49 00 eb 06 66 a1 e4 58 49 00 8a 0d f8 e0 4a
      00 84 c9 74 10 66 3d 28 00 76 0a 66 b8 28 00 66
      a3 e4 58 49 00 66 83 3d fa e0 4a 00 00 7f 57 66
      8b c8 66 48 66 85 c9 66 a3`],
    [demoTick, `05 f9 e0 4a 00 01 a0 e6 58 49 00 33 d2 fe c0 8a
      d0 a2 e6 58 49 00 8b 0c 95 e8 58 49 00 85 c9 75
      07 32 c0 a2 e6 58 49 00 33 c9 8a`],
    [0x418660, 'a0 e6 58 49 00 c6 05 f9 e0 4a 00 01 fe c0 33 c9'],
    [demoTimeout, 'c7 05 88 0d 4c 00 80 99 45 00'],
    [stopDemo, 'a0 f9 e0 4a 00 66 c7 05 e4 58 49 00 58 02 84 c0 74 0f 6a 04 c6 05 f9 e0 4a 00 00 e8 e0 7e 00 00 59 c3'],
    [0x420480, '66 a1 80 e4 4a 00 c3'],
    // Original MainMenu/MainSpawn loader and main menu result dispatch.
    [0x42aa6f, `e8 6c 7e 04 00 85 c0 b8 dc de 49 00 75 05 b8 c8
      de 49 00 68 3e 02 00 00 68 a4 de 49 00 68 80 2e 46
      00 68 10 2c 46 00 50 e8 34 a2 fd ff 68 c0 ad 42 00
      6a 05 50 e8 77 ac fd ff`],
    [0x42ada8, '37 ac 42 00 7a ac 42 00'],
    [0x42ac7a, '6a 12 e8 0f fb 05 00 83 c4 04 66 85 c0 74 0d e8 d2 d9 fe ff'],
    [0x404cd0, '83 ec 08 8b 44 24 1c 8b 4c 24 18'],
    [0x402ad0, '8b 44 24 04 66 83 78 22 00 74 03 8b 40 32 8b 40 46'],
    // Cancel tail, offline receive slot, and the original shared wait.
    [0x415784, `c6 05 68 cb 4a 00 08 c6 05 84 49 4b 00 08 88 1d 4c ce 4a 00
      88 1d 7c d7 4a 00 e8 2d e9 01 00 5f 5e 5d b8 01 00 00 00 5b c3`],
    [fastCancelWrapper, `c8 ff 14 8d e8 58 49 00 85 c0 74 cf 66 c7 05 e4 58 49 00
      00 00 b8 01 00 00 00 c3 33 c0 c3 90 90 90 90 90 90 90`],
    [0x491044, '30 ca 45 00'],
    [0x45ca30, '33 c0 c3'],
    [0x45b982, 'ff 15 bc e5 4c 00'],
    [0x4340d0, `c7 05 8c e5 4c 00 00 00 00 00 e8 11 ae 01 00 68 e8 03 00 00
      e8 17 ae 01 00 68 e8 03 00 00 e8 0d ae 01 00 83 c4 08 85 c0 75 16
      e8 51 78 02 00 68 e8 03 00 00 e8 f7 ad 01 00 83 c4 04 85 c0 74 ea c3`],
    [0x44eef0, `e8 eb 14 01 00 48 a3 e8 e1 4b 00 c3 90 90 90 90
      e8 db 14 01 00 8b 0d e8 e1 4b 00 2b c8 78 03 33 c0 c3
      e8 c9 14 01 00 03 44 24 04 a3 e8 e1 4b 00 b8 01 00 00 00 c3`],
    // The Custom Setup exit after changing away from title state. Keep the
    // original palette routine and final palette, including its scene cleanup.
    [0x44f6e5, 'e8 96 0d fd ff 66 3d 04 00 0f 85 13 01 00 00'],
    [0x44f807, `68 c8 00 00 00 e8 6f 97 03 00 83 c4 04 e8 67 47 fc ff
      68 c8 00 00 00 c6 05 84 49 4d 00 00 e8 96 98 03 00`],
    // Original Single Player launch and its distinct in-game Load Custom caller.
    [0x441c84, '6a 00 e8 25 15 ff ff 83 c4 04 e8 1d 42 fd ff e8 e8 e7 fd ff 66 3d 04 00 0f 84'],
    [0x415eb0, '6a 00 6a 00 6a 01 e8 95 fe ff ff 83 c4 0c c3'],
    [0x435a7d, 'e8 2e 04 fe ff'],
    [0x441bf0, '6a 01 e8 29 e9 fd ff 83 c4 04 e8 81 e8 fd ff 66 3d 04 00 75 34'],
    [0x44f4ec, `38 1d ce 49 4b 00 74 0e e8 b7 34 fe ff 66 89 1d 5c 3f 4b 00
      eb 05 e8 49 b4 fd ff e8 74 0f fd ff 66 3d 04 00 74 da`],
    // Sound dialog's original music updater and adjacent DWORD settings records.
    [0x4409e0, 'a1 5c db 4b 00 85 c0 0f 84 d3 00 00 00 8b 44 24 04 8b 40 0c 85 c0 74 75 8b 04 85 84 0c 49 00'],
    [0x4aa56c, `70 a9 4a 00 00 00 00 00 64 00 00 00 4b 00 00 00 44 6b 4d 00 01 00 00 00
      6c a9 4a 00 00 00 00 00 64 00 00 00 64 00 00 00 48 6b 4d 00`],
    // The Win32 handler already schedules the standalone Sound Options
    // dialog from the title through the original deferred-dialog callback.
    [0x45fa77, 'a1 e4 b8 4a 00 85 c0 0f 85 70 02 00 00 5f 5e 5d c7 05 e4 b8 4a 00 90 1b 44 00'],
    [soundDialogEntry, `68 40 19 44 00 6a 02 68 14 03 00 00 68 94 1b 4a 00 68 80 2e 46 00
      68 10 2c 46 00 68 84 1b 4a 00 c7 05 e4 b8 4a 00 00 00 00 00 c7 05 94 db 4b 00 01 00 00 00
      e8 07 31 fc ff 83 c4 14 50 e8 4e 3b fc ff 83 c4 0c c3`],
    [minimapViewportOutline, 'e8 42 ab 05 00 6a 0c e8 8b 84 05 00 83 c4 14'],
    [horizontalArrowPaint[0], 'e8 07 1e 08 00 8b 4f 04 66 8b 15 bc b8 4a 00'],
    [horizontalArrowPaint[1], 'e8 f2 1c 08 00 8b 46 18 83 c4 28'],
    [scrollbarPress, 'e8 f4 01 00 00 83 c4 08 83 f8 06 74 51'],
    [0x409560, '8b 4c 24 08 83 ec 18 8d 44 24 00 53 56 8b 74 24 24'],
    // Automatic end-of-load Tips test and the original Objectives constructor.
    [startupTips, 'a1 50 6b 4d 00 f6 c4 01 74 05 e8 36 e3 02 00'],
    [0x435380, '68 a0 53 43 00 68 50 10 4a 00 e8 a1 98 ff ff 83 c4 08 c3'],
    [objectivesButtonSetup, 'e8 1f 82 ff ff 6a 68 68 2c 10 4a 00'],
    [0x42d6b0, '8b 44 24 04 6a fd 50 e8 14 54 fd ff'],
    ...fileDialogs,
  ].map(([address, bytes]) => ({address, bytes: hex(bytes)}));

  // Entry: return false from the idle timer. The remaining now-unreachable
  // bytes hold the title-only cdecl loader wrapper, starting at idle + 3.
  // Reset the idle counter on each newly loaded title so an abandoned demo
  // request cannot survive leaving and returning. Pass all five args to
  // 404CD0 and retain its returned root. The wrapper then
  // looks up native control 2 through 402AD0 and sets original disabled bit 2
  // only for its type-2 button. BNE draws and routes that control itself.
  const entryAndWrapper = hex(`
    31 c0 c3
    66 c7 05 e4 58 49 00 58 02
    ff 74 24 14 ff 74 24 14 ff 74 24 14 ff 74 24 14 ff 74 24 14
    e8 eb c6 fe ff 83 c4 14 85 c0 74 1c
    50 6a 02 50 e8 db a4 fe ff 83 c4 08 85 c0 74 0b
    66 83 78 22 02 75 04 80 48 18 02 58 c3`);
  const callWrapper = hex('e8 27 db fe ff');
  // Only the original MainMenu tick can enter here. Its pending marker is
  // consumed once, before validating native title state and calling 418660.
  // 418660 advances the native demo-map sequence and the original callback
  // handles the close/transition from the true result. Startup still calls
  // the unconditional false entry at 4185C0.
  const demoWrapper = hex(`
    66 83 3d e4 58 49 00 fe 75 1e 66 c7 05 e4 58 49 00 58 02
    66 83 3d 80 e4 4a 00 04 75 0b e8 2e 00 00 00
    b8 01 00 00 00 c3 31 c0 c3`);
  // The title's original tick now accepts volume pairs in the idle counter
  // (bit 15, 7 bits per channel). Validate the pair and native scene, store
  // both original settings, and apply music through the Sound dialog's
  // original cdecl helper only on change. Then run the existing demo gate.
  const audioWrapper = hex(`
    0f b7 05 e4 58 49 00 66 3d 00 80 72 57 66 3d 64 b2 77 51
    66 c7 05 e4 58 49 00 58 02 89 c2 83 e0 7f 83 f8 64 77 3e
    c1 ea 07 83 e2 7f 83 fa 64 77 33 66 83 3d 80 e4 4a 00 04
    75 29 80 3d 6c e8 4a 00 00 75 20 a3 48 6b 4d 00 3b 15 44
    6b 4d 00 74 13 89 15 44 6b 4d 00 68 38 6b 4d 00 e8 4f 15
    fb ff 83 c4 04 e9 77 91 f8 ff`);
  const callTitleTick = hex('e8 bf 42 06 00');
  // This tail of the disabled idle routine has no live original entry.
  // Only Cancel calls it. A nonlocal provider keeps the entire original wait.
  // The local receive function always returns 0. Clear the callback and
  // reset the timer as usual, then enter the shared wait at its expiry check
  // so it records the same next deadline without polling the empty provider.
  const cancelWaitWrapper = hex(`
    81 3d bc e5 4c 00 30 ca 45 00
    75 14
    c7 05 8c e5 4c 00 00 00 00 00
    e8 9a 68 03 00
    e9 a4 ba 01 00
    e9 70 ba 01 00`);

  // The original attract counter is idle in this route. Keep 0xfffe reserved
  // for manual Replay Demo. 0xfffc identifies entry from Single Player and
  // 0xfffd identifies cancellation of that exact offline setup.
  // 0x48f350 is zero padding after the last original routine in its .text page.
  const fastReturnWrappers = [
    // Mark provenance only at Single Player's own call to 415EB0.
    [0x00, '66 c7 05 e4 58 49 00 fc ff e9 52 6b f8 ff'],
    // On original Cancel, mark the return, then run the existing cleanup wait.
    [0x20, `66 83 3d e4 58 49 00 fc 75 28 81 3d bc e5 4c 00 30 ca 45 00
      75 1c 66 83 3d 80 e4 4a 00 0c 75 12 80 3d 6c e8 4a 00 00 75 09
      66 c7 05 e4 58 49 00 fd ff e9 94 92 f8 ff`],
    // Run original setup; discard provenance after Start or any other exit.
    [0x60, `e8 cb 4b f8 ff 66 83 3d e4 58 49 00 fd 75 0c 66 83 3d 80 e4 4a
      00 04 74 15 eb 0a 66 83 3d e4 58 49 00 fc 75 09
      66 c7 05 e4 58 49 00 58 02 c3`],
    // Consume the return before entering the original Single Player dialog.
    // On all other title iterations continue with the original 42A950.
    [0xa0, `66 83 3d e4 58 49 00 fd 75 21 66 c7 05 e4 58 49 00 58 02
      66 83 3d 80 e4 4a 00 04 75 0e 80 3d 6c e8 4a 00 00 75 05
      e9 d5 27 fb ff e9 30 b5 f9 ff`],
  ].map(([offset, bytes]) => ({offset, bytes: hex(bytes)}));
  const fastReturnCodeLength = 0xd0;
  const fastReturnCalls = [
    [0x441c84, fastEntryCall, 'e8 bd d6 04 00'],
    [0x415784, fastCancelCall, 'e8 cd 9b 07 00'],
    [0x44f807, fastSetupCall, 'e8 97 fb 03 00'],
    [0x44f4ec, titleCall, 'e8 e9 fe 03 00'],
  ];

  // Keep the horizontal (type 6) track and thumb geometry and its existing
  // drag/value callback. Suppress only the two arrow sprite draws. Vertical
  // (type 7) list scrollbars retain their arrows and original hit results.
  // At press only, treat any horizontal track hit (native results 1–5) as
  // result 3, the thumb. The native drag path then moves to the actual pointer
  // position on press and throughout the hold, with native limits and callbacks.
  const scrollbarPressWrapper = hex(`
    ff 74 24 08 ff 74 24 08 e8 b3 a0 f7 ff 83 c4 08
    8b 4c 24 04 66 83 79 22 06 75 0c
    83 f8 01 72 07 83 f8 05 77 02 b0 03 c3`);

  // After native Previous-button initialization, replace only its caption.
  // The original control, faction art, return code and dialog cleanup remain.
  // The two letters also exist in the installed Russian game's bitmap font.
  const objectivesButtonWrapper = hex(`
    ff 74 24 08 ff 74 24 08 e8 c3 e1 f9 ff 83 c4 08
    6a fd ff 74 24 08 e8 d5 35 f7 ff 83 c4 08 85 c0 74 07
    c7 40 14 10 f5 48 00 c3
    00 00 00 00 00 00 10 4f 4b 00`);

  function isMapped(start, end, length, size) {
    return start > 0xf0 && end === start + length - 1 && end < size;
  }

  async function mapRange(wine, address, length) {
    const start = (await wine.callGuest('guest_to_wasm', address)) >>> 0;
    const end = (await wine.callGuest('guest_to_wasm', address + length - 1)) >>> 0;
    if (!isMapped(start, end, length, wine.memory.buffer.byteLength)) {
      throw new Error('Не удалось проверить адрес главного меню Warcraft II');
    }
    return start;
  }

  async function install(wine) {
    const mapped = new Map();
    for (const original of originals) {
      mapped.set(original.address, await mapRange(wine, original.address, original.bytes.length));
    }
    const returnCodeOffset = await mapRange(wine, fastReturnCode, fastReturnCodeLength);
    const audioCodeOffset = await mapRange(wine, audioCode, audioWrapper.length);
    const scrollbarCodeOffset = await mapRange(wine, scrollbarPressCode, scrollbarPressWrapper.length);
    const objectivesSettingOffset = await mapRange(wine, startupObjectivesSetting, 1);
    const objectivesButtonOffset = await mapRange(wine, objectivesButtonCode, objectivesButtonWrapper.length);
    const requestOffset = await mapRange(wine, idleCounter, 2);
    const memory = new Uint8Array(wine.memory.buffer);
    for (const {address, bytes} of originals) {
      const start = mapped.get(address);
      if (!bytes.every((byte, i) => memory[start + i] === byte)) {
        throw new Error('Исходный код главного меню BNE не совпал по адресу 0x' + address.toString(16));
      }
    }
    for (const [address, start, length] of [
      [fastReturnCode, returnCodeOffset, fastReturnCodeLength], [audioCode, audioCodeOffset, audioWrapper.length],
      [scrollbarPressCode, scrollbarCodeOffset, scrollbarPressWrapper.length],
      [startupObjectivesSetting, objectivesSettingOffset, 1],
      [objectivesButtonCode, objectivesButtonOffset, objectivesButtonWrapper.length],
    ]) {
      if (memory.subarray(start, start + length).some(byte => byte !== 0)) {
        throw new Error('Исходный код главного меню BNE не совпал по адресу 0x' + address.toString(16));
      }
    }
    // No writes until all guards agree. The caller installs before first run.
    memory.set(entryAndWrapper, mapped.get(idle));
    memory.set(demoWrapper, mapped.get(demoTick));
    // The demo's timer normally returns to title without clearing replay.
    // Give it the same original shutdown routine as the manual exit.
    new DataView(memory.buffer).setUint32(mapped.get(demoTimeout) + 6, stopDemo, true);
    memory.set(audioWrapper, audioCodeOffset);
    memory.set(callTitleTick, mapped.get(menuTickCall));
    memory.set(callWrapper, mapped.get(0x42aa6f) + menuLoadCall - 0x42aa6f);
    memory.set(cancelWaitWrapper, mapped.get(fastCancelWrapper));
    for (const {offset, bytes} of fastReturnWrappers) memory.set(bytes, returnCodeOffset + offset);
    for (const [guard, call, bytes] of fastReturnCalls) memory.set(hex(bytes), mapped.get(guard) + call - guard);
    // The authored menu holds its last complete frame during this exit.
    // Shorten only the hidden fade. A positive duration keeps its divisor valid.
    memory[mapped.get(0x44f807) + fastStartFade - 0x44f807 + 1] = 1;
    // The web viewport draws its own footprint on the original minimap.
    memory.fill(0x90, mapped.get(minimapViewportOutline), mapped.get(minimapViewportOutline) + 5);
    for (const address of horizontalArrowPaint) memory.fill(0x90, mapped.get(address), mapped.get(address) + 5);
    memory.set(scrollbarPressWrapper, scrollbarCodeOffset);
    memory.set(hex('e8 34 61 08 00'), mapped.get(scrollbarPress));
    // Test a host-owned preference in an otherwise unused byte and call
    // the same native Objectives constructor as the original menu action.
    // The earlier replay and multiplayer guard branches stay in place.
    memory.set(hex('80 3d d0 f4 48 00 00 90 74 05 e8 16 46 01 00'), mapped.get(startupTips));
    memory.set(objectivesButtonWrapper, objectivesButtonOffset);
    memory.set(hex('e8 4f a0 05 00'), mapped.get(objectivesButtonSetup));
    for (const [address] of fileDialogs) memory.set(hex('31 c0 c3'), mapped.get(address));
    memory[objectivesSettingOffset] = 1;
    try { memory[objectivesSettingOffset] = Number(global.localStorage?.getItem(objectivesPreferenceKey) !== '0'); }
    catch (_) {}
    installed.set(wine, requestOffset);
  }

  function nativeView(wine, address, length) {
    const map = wine.instance?.exports?.guest_to_wasm;
    const memory = wine.memory?.buffer;
    if (!map || !memory) return null;
    const start = map(address) >>> 0;
    const end = map(address + length - 1) >>> 0;
    return isMapped(start, end, length, memory.byteLength) ? new DataView(memory, start, length) : null;
  }

  function showObjectivesAtStart(wine, checked) {
    if (!installed.has(wine) || wine.guestWorker) return null;
    const setting = nativeView(wine, startupObjectivesSetting, 1);
    if (!setting) return null;
    if (typeof checked === 'boolean') {
      setting.setUint8(0, Number(checked));
      try { global.localStorage?.setItem(objectivesPreferenceKey, checked ? '1' : '0'); }
      catch (_) {}
    }
    return setting.getUint8(0) === 1;
  }

  function sliderAt(wine, layer, x, y) {
    if (!installed.has(wine) || !layer?.root) return null;
    const root = nativeView(wine, layer.root, 0x4a);
    if (!root || root.getUint16(0x20, true) !== layer.scene ||
        root.getUint16(0x22, true) !== 0) return null;
    const count = settingsSliders.get(root.getUint32(0x2a, true));
    if (!count) return null;
    let node = root.getUint32(0x46, true);
    for (let checked = 0; node && checked < 24; checked++) {
      const child = nativeView(wine, node, 0x36);
      if (child?.getUint32(0x32, true) !== layer.root) return null;
      const id = child.getUint16(0x20, true);
      if (child.getUint16(0x22, true) === 6 && id > 0 && id <= count &&
          (child.getUint32(0x18, true) & 10) === 8) {
        const left = layer.source.left + child.getInt16(4, true);
        const top = layer.source.top + child.getInt16(6, true);
        const right = layer.source.left + child.getInt16(8, true);
        const bottom = layer.source.top + child.getInt16(10, true);
        if (x >= left && x < right + 1 && y >= top && y < bottom + 1) return {left, right, y:(top + bottom) >> 1};
      }
      node = child.getUint32(0, true);
    }
    return null;
  }

  function titleCounter(wine) {
    const offset = installed.get(wine);
    if (offset === undefined || !wine.running || wine.guestWorker) return null;
    if (nativeView(wine, gameState, 2)?.getUint16(0, true) !== 4 ||
        nativeView(wine, inGame, 1)?.getUint8(0) !== 0) return null;
    const scene = nativeView(wine, titleScene, 20);
    if (!scene?.getUint8(0) || scene.getUint32(16, true) !== 0x405400) return null;
    const dialog = nativeView(wine, scene.getUint32(12, true), 0x2e);
    if (dialog?.getUint16(0x20, true) !== 5 || dialog.getUint32(0x2a, true) !== 0x42adc0) return null;
    return new DataView(wine.memory.buffer, offset, 2);
  }

  function requestDemo(wine) {
    const request = titleCounter(wine);
    if (!request) return false;
    const counter = request.getUint16(0, true);
    if (counter !== 600 && counter !== 0) return false;
    request.setUint16(0, demoRequest, true);
    return true;
  }

  function demoPlaying(wine) {
    return installed.has(wine) && wine.running && !wine.guestWorker &&
      nativeView(wine, replay, 1)?.getUint8(0) === 1;
  }

  function requestSoundOptions(wine) {
    const counter = titleCounter(wine);
    if (!counter || ![0, 600].includes(counter.getUint16(0, true))) return null;
    const slot = nativeView(wine, deferredDialog, 4);
    const settings = readSoundSettings(wine, counter);
    if (!settings || slot?.getUint32(0, true) !== 0) return null;
    slot.setUint32(0, soundDialogEntry, true);
    return settings;
  }

  function readSoundSettings(wine, counter) {
    const pair = readVolumePair(wine, counter);
    const flags = nativeView(wine, 0x4d6b50, 4)?.getUint32(0, true);
    if (!pair || flags === undefined) return null;
    return {sfx:pair.sound, music:pair.music,
      ...Object.fromEntries(Object.entries(soundSwitches).map(([name, mask]) => [name, flags & mask]))};
  }

  function persistSoundOptions(wine, before) {
    const counter = titleCounter(wine);
    if (!counter || !before) return;
    const settings = readSoundSettings(wine, counter);
    if (!settings || !global.StorageImports?.setRegValue) return;
    for (const [name, value] of Object.entries(settings)) {
      // Original Cancel restores the original seven DWORDs, so it has
      // nothing to persist. Write confirmed changes before a browser exit.
      if (value !== before[name]) global.StorageImports.setRegValue(volumeKey, name, 4, value);
    }
  }

  const validVolume = value => Number.isInteger(value) && value >= 0 && value <= 100;
  function readVolumePair(wine, counter) {
    const request = counter.getUint16(0, true);
    const queued = request >= volumeRequest && request <= 0xb264;
    const sound = queued ? request & 127 : nativeView(wine, volumeOptions.sound.address, 4)?.getInt32(0, true);
    const music = queued ? (request >> 7) & 127 : nativeView(wine, volumeOptions.music.address, 4)?.getInt32(0, true);
    return validVolume(sound) && validVolume(music) ? {sound, music} : null;
  }

  function volume(wine, channel) {
    const counter = titleCounter(wine);
    return counter && readVolumePair(wine, counter)?.[channel];
  }

  function setVolume(wine, channel, value) {
    if (!Object.hasOwn(volumeOptions, channel) || !validVolume(value)) return false;
    const counter = titleCounter(wine);
    if (!counter) return false;
    const request = counter.getUint16(0, true);
    if (request !== 0 && request !== 600 && (request < volumeRequest || request > 0xb264)) return false;
    const pair = readVolumePair(wine, counter);
    if (!pair) return false;
    if (pair[channel] === value) return true;
    const storage = global.StorageImports;
    if (!storage?.setRegValue) return false;
    try { storage.setRegValue(volumeKey, volumeOptions[channel].registry, 4, value); }
    catch (_) { return false; }
    pair[channel] = value;
    counter.setUint16(0, volumeRequest | pair.sound | (pair.music << 7), true);
    return true;
  }

  const api = Object.freeze({install, requestDemo, demoPlaying, requestSoundOptions, persistSoundOptions,
    controls, volume, setVolume, sliderAt, showObjectivesAtStart});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyMenuPolicy = api;
})(globalThis);
