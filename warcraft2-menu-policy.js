/* Offline menu options for the independent-camera Wine-Assembly route. */
(function (global) {
  'use strict';

  const idle = 0x4185c0;
  const menuLoadCall = 0x42aa97;
  const menuTickCall = 0x42b16c;
  const demoTick = 0x418610;
  const fastCancelCall = 0x41579e;
  const fastCancelWrapper = 0x41863b;
  const fastReturnCode = 0x48f350;
  const fastEntryCall = 0x441c8e;
  const fastSetupCall = 0x44f814;
  const titleCall = 0x44f502;
  const fastStartFade = 0x44f819;
  const idleCounter = 0x4958e4;
  const demoRequest = 0xfffe;
  const gameState = 0x4ae480;
  const inGame = 0x4ae86c;
  const titleScene = 0x4d495c;
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
  const callDemoWrapper = hex('e8 9f d4 fe ff');
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
    const requestOffset = await mapRange(wine, idleCounter, 2);
    const memory = new Uint8Array(wine.memory.buffer);
    for (const {address, bytes} of originals) {
      const start = mapped.get(address);
      if (!bytes.every((byte, i) => memory[start + i] === byte)) {
        throw new Error('Исходный код главного меню BNE не совпал по адресу 0x' + address.toString(16));
      }
    }
    if (memory.subarray(returnCodeOffset, returnCodeOffset + fastReturnCodeLength).some(byte => byte !== 0)) {
      throw new Error('Исходный код главного меню BNE не совпал по адресу 0x' + fastReturnCode.toString(16));
    }
    // No writes until all guards agree. The caller installs before first run.
    memory.set(entryAndWrapper, mapped.get(idle));
    memory.set(demoWrapper, mapped.get(demoTick));
    memory.set(callDemoWrapper, mapped.get(menuTickCall));
    memory.set(callWrapper, mapped.get(0x42aa6f) + menuLoadCall - 0x42aa6f);
    memory.set(cancelWaitWrapper, mapped.get(fastCancelWrapper));
    for (const {offset, bytes} of fastReturnWrappers) memory.set(bytes, returnCodeOffset + offset);
    for (const [guard, call, bytes] of fastReturnCalls) memory.set(hex(bytes), mapped.get(guard) + call - guard);
    // The authored menu holds its last complete frame during this exit.
    // Shorten only the hidden fade. A positive duration keeps its divisor valid.
    memory[mapped.get(0x44f807) + fastStartFade - 0x44f807 + 1] = 1;
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

  function requestDemo(wine) {
    const offset = installed.get(wine);
    if (offset === undefined || !wine.running || wine.guestWorker) return false;
    if (nativeView(wine, gameState, 2)?.getUint16(0, true) !== 4 ||
        nativeView(wine, inGame, 1)?.getUint8(0) !== 0) return false;
    const scene = nativeView(wine, titleScene, 20);
    if (!scene?.getUint8(0) || scene.getUint32(16, true) !== 0x405400) return false;
    const dialog = nativeView(wine, scene.getUint32(12, true), 0x2e);
    if (dialog?.getUint16(0x20, true) !== 5 || dialog.getUint32(0x2a, true) !== 0x42adc0) return false;
    const request = new DataView(wine.memory.buffer, offset, 2);
    const counter = request.getUint16(0, true);
    if (counter !== 600 && counter !== 0) return false;
    request.setUint16(0, demoRequest, true);
    return true;
  }

  const api = Object.freeze({install, requestDemo, controls});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyMenuPolicy = api;
})(globalThis);
