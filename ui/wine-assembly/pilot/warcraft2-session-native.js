/* Offline session coordination for the pinned Battle.net Edition executable. */
(function (global) {
  'use strict';

  const campaigns = Object.freeze({
    'human-tod': {base:0x52c8, missions:14}, 'orc-tod': {base:0x52c9, missions:14},
    'human-btdp': {base:0x53c6, missions:12}, 'orc-btdp': {base:0x53c7, missions:12},
  });
  const level = 0x4abda2, gameState = 0x4ae480, inGame = 0x4ae86c;
  const customScenario = 0x4acc2e, networkGame = 0x4b49ce, replay = 0x4ae0f9;
  const selectedLevel = 0x48f780, finishedState = 0x48f782, finishedLevel = 0x48f784;
  const campaignCode = 0x48f7a0, outcomeCode = 0x48f7d0;
  const fastSetup = 0x4ad960, fastRoot = 0x4ad9c4;
  const selectedMap = 0x4ad678, startUnits = 0x4ad78d, race = 0x4ad78e;
  const saveCode = 0x48f810, continueCode = 0x48f890, savePath = 0x48f910, saveLabel = 0x48f940;
  const continueRequest = 0x48f788, saveResult = 0x48f789, autosaveRequest = 0x48f78a;
  const guestSave = 'c:\\wc2-web-continue.sav';
  const checkpointKey = 'wc2-native-continue-v1';
  const maxSaveBytes = 3 * 1024 * 1024;
  const autosaveInterval = 60000;
  const installed = new WeakSet();
  // Top-level stock PUD maps, in the native picker order. Each entry holds
  // the filename, DIM width, OWNR player count and TYPE map signature.
  const portableMaps = Object.freeze([
    ['all you need bne.pud', 128, 8, 0x63e72fda],
    ['ant trails bne.pud', 128, 4, 0x52e2de0b],
    ['big rock candy mountain bne.pud', 96, 5, 0x52be4948],
    ['cramped bne.pud', 32, 2, 0x50c300b3],
    ['crosshair bne.pud', 128, 8, 0x60b2ca12],
    ['dark paths bne.pud', 64, 3, 0xaa44e760],
    ['dark peninsula bne.pud', 128, 4, 0x2967e47f],
    ['forsaken isles bne.pud', 128, 4, 0x8ecd756f],
    ['frosty fjords bne.pud', 128, 5, 0x95ea3b65],
    ['gold rush bne.pud', 64, 4, 0x9b389052],
    ['great white north bne.pud', 96, 4, 0x73536227],
    ['isolation bne.pud', 96, 4, 0x4f9bfa88],
    ['kaboom bne.pud', 64, 4, 0xd558f76c],
    ['more precious than gold bne.pud', 96, 4, 0xf8cafb5c],
    ['mud in your eye bne.pud', 128, 7, 0x76ec10d6],
    ['murky river bne.pud', 64, 2, 0x7efb6cae],
    ['rose petal bne.pud', 128, 6, 0x6f0b5b74],
    ['schwartzwald bne.pud', 128, 4, 0x30681d27],
    ['skirmish bne.pud', 64, 2, 0x793f5e6b],
    ['stir crazy bne.pud', 128, 8, 0x07531b62],
    ['taiga bne.pud', 128, 7, 0x3323a849],
    ['the river kwai bne.pud', 96, 2, 0x5e484db5],
    ['training ground bne.pud', 128, 4, 0xdd1596b7],
    ["widow's end bne.pud", 96, 2, 0x8dc3c442],
    ['winding ways bne.pud', 96, 4, 0xf31d5422],
    ['world domination bne.pud', 128, 5, 0x1113c83f],
  ]);

  function nativeView(wine, address, size) {
    const translate = wine.instance?.exports?.guest_to_wasm, memory = wine.memory?.buffer;
    if (!translate || !memory || wine.guestWorker) return null;
    const start = translate(address) >>> 0, end = translate(address + size - 1) >>> 0;
    return start > 0xf0 && end === start + size - 1 && end < memory.byteLength
      ? new DataView(memory, start, size) : null;
  }

  function bytes(value) {
    return value.trim().split(/\s+/).map(part => Number.parseInt(part, 16));
  }

  function branch(address, target, opcode = 0xe8) {
    const offset = target - address - 5;
    return [opcode, offset & 255, offset >>> 8 & 255, offset >>> 16 & 255, offset >>> 24];
  }

  function install(wine) {
    if (installed.has(wine)) return;
    const patches = [];
    function replace(address, original, replacement) {
      const view = nativeView(wine, address, original.length);
      if (!view || original.length !== replacement.length ||
          original.some((b, i) => view.getUint8(i) !== b)) {
        throw new Error('Original Warcraft II session bytes did not match at 0x' + address.toString(16));
      }
      patches.push(() => replacement.forEach((b, i) => view.setUint8(i, b)));
    }
    function code(address, program) {
      replace(address, Array(program.length).fill(0), program);
    }

    // The three original branches have already configured the faction and the
    // major campaign. Consume the requested native level here, before briefing.
    // When no browser selection is armed the original entry is unchanged.
    const choose = bytes(`66 a1 80 f7 48 00 66 85 c0 74 1d
      66 c7 05 80 f7 48 00 00 00 66 33 05 a2 bd 4a 00
      66 a9 01 ff 75 07 66 31 05 a2 bd 4a 00`);
    code(campaignCode, [...choose, ...branch(campaignCode + choose.length, 0x420490, 0xe9)]);
    replace(0x43497c, bytes('e8 0f bb fe ff'), branch(0x43497c, campaignCode));
    replace(0x4349b3, bytes('e8 d8 ba fe ff'), branch(0x4349b3, campaignCode));
    replace(0x4349d9, bytes('e8 b2 ba fe ff'), branch(0x4349d9, campaignCode));

    // This function returns the original game's result before any statistics,
    // restart or campaign step occurs. Its AX and original state reach its caller.
    const report = bytes(`66 a3 82 f7 48 00 66 8b 0d a2 bd 4a 00
      66 89 0d 84 f7 48 00`);
    // Named PUD maps are consumed and closed on the first launch. Reopen
    // the same verified map through the native loader for an offline restart.
    const reopen = 0x48f9d0;
    const restartMap = bytes(`66 83 f8 05 75 22
      80 3d ce 49 4b 00 00 75 19 80 3d 2e cc 4a 00 01 75 10 80 3d 60 d9 4a 00 01 75 07 50`);
    code(reopen, [...restartMap, ...branch(reopen + restartMap.length, 0x414f70), ...bytes('58 c3')]);
    code(outcomeCode, [...branch(outcomeCode, 0x4209e0), ...report,
      ...branch(outcomeCode + 5 + report.length, reopen, 0xe9)]);
    replace(0x42a4ce, bytes('e8 0d 65 ff ff'), branch(0x42a4ce, outcomeCode));

    // Use the original Restart confirmation and Restart action for offline
    // custom games as well. Network behavior precedes these guarded branches.
    replace(0x435838, bytes('68 0c 11 4a 00'), bytes('68 fc 10 4a 00'));
    replace(0x435a7b, bytes('74 11'), bytes('eb 11'));

    // One native save path, called from the confirmed exit and the original
    // outer event loop before it processes the next simulation tick.
    const save = bytes(`80 3d ce 49 4b 00 00 75 2f 80 3d f9 e0 4a 00 00 75 26
      6a 0e 68 10 f9 48 00`);
    const open = branch(saveCode + save.length, 0x489a80);
    const write = bytes('83 c4 08 85 c0 74 13 68 40 f9 48 00 50');
    const serializer = branch(saveCode + save.length + open.length + write.length, 0x43eb30);
    const done = bytes('83 c4 08 a2 89 f7 48 00');
    const saveProgram = [...save, ...open, ...write, ...serializer, ...done];
    code(saveCode, [...saveProgram, 0xc3]);
    const exit = 0x48f850;
    code(exit, [...branch(exit, saveCode), ...branch(exit + 5, 0x420490, 0xe9)]);
    replace(0x435996, bytes('e8 f5 aa fe ff'), branch(0x435996, exit));
    const poll = 0x48f970;
    const periodic = bytes(`80 3d 8a f7 48 00 01 75 1e
      80 3d 6c e8 4a 00 01 75 15
      83 3d 6c 40 4b 00 00 75 0c
      c6 05 8a f7 48 00 00`);
    code(poll, [...periodic, ...branch(poll + periodic.length, saveCode),
      ...branch(poll + periodic.length + 5, 0x4051d0, 0xe9)]);
    replace(0x420f1b, bytes('e8 b0 42 fe ff'), branch(0x420f1b, poll));
    code(savePath, [...new TextEncoder().encode(guestSave), 0]);
    code(saveLabel, [...new TextEncoder().encode('Warcraft II Web'), 0]);

    // Credits remains its original handler. Consume only the separate
    // browser-armed load request on the game's own title callback thread.
    const load = bytes('80 3d 88 f7 48 00 01 75 00 c6 05 88 f7 48 00 02 68 10 f9 48 00');
    const reader = branch(continueCode + load.length, 0x43f7c0);
    const test = bytes('83 c4 04 85 c0 74 00 a3 54 3f 4b 00');
    const stopTitle = branch(continueCode + load.length + reader.length + test.length, 0x441250);
    const start = bytes('6a 05');
    const startLoaded = branch(continueCode + load.length + reader.length + test.length + stopTitle.length + start.length, 0x420490);
    const returnLoaded = bytes('83 c4 04 c3');
    const returnFailed = bytes('c6 05 88 f7 48 00 03 c3');
    test[6] = test.length - 7 + stopTitle.length + start.length + startLoaded.length + returnLoaded.length;
    const loadProgram = [...load, ...reader, ...test, ...stopTitle, ...start, ...startLoaded, ...returnLoaded, ...returnFailed];
    loadProgram[8] = loadProgram.length - 9;
    code(continueCode, [...loadProgram, ...branch(continueCode + loadProgram.length, 0x417bf0, 0xe9)]);
    replace(0x42a5a3, bytes('e8 48 d6 fe ff'), branch(0x42a5a3, continueCode));

    // BNE writes over 1 MB on large maps, but its reader rejects those files
    // before allocating the read buffer. Raise this limit for our own slot.
    const saveLimit = 0x48f9b0;
    code(saveLimit, bytes(`80 3d 88 f7 48 00 02 75 06
      3d 00 00 30 00 c3 3d 40 42 0f 00 c3`));
    replace(0x43f705, bytes('3d 40 42 0f 00'), branch(0x43f705, saveLimit));

    patches.forEach(patch => patch());
    installed.add(wine);
  }

  function encodeCampaign({campaign, mission} = {}) {
    const entry = campaigns[campaign];
    return entry && Number.isInteger(mission) && mission >= 1 && mission <= entry.missions
      ? entry.base + 2 * (mission - 1) : 0;
  }

  function decodeCampaign(nativeLevel) {
    for (const [campaign, entry] of Object.entries(campaigns)) {
      const index = (nativeLevel - entry.base) / 2;
      if (Number.isInteger(index) && index >= 0 && index < entry.missions)
        return {kind:'campaign',campaign,mission:index + 1};
    }
    return null;
  }

  function octets(view) {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }

  function nativeText(buffer) {
    const end = buffer.indexOf(0);
    if (end < 0) return '';
    const encoding = global.WarcraftLanguage?.current() === 'ru' ? 'windows-1251' : 'windows-1252';
    return new TextDecoder(encoding).decode(buffer.subarray(0, end));
  }

  function validOctets(data, size) {
    return Array.isArray(data) && data.length === size && data.every(value =>
      Number.isInteger(value) && value >= 0 && value <= 255);
  }

  function fastConfig(scenario) {
    if (scenario?.version !== 1 || !validOctets(scenario.settings, 48) ||
        !Number.isInteger(scenario.startUnits) || scenario.startUnits < 0 || scenario.startUnits > 7 ||
        !Number.isInteger(scenario.race) || scenario.race < 0 || scenario.race > 3) return null;
    const settings = Uint8Array.from(scenario.settings);
    const mapId = settings[6] | settings[7] << 8;
    if (settings[0] === 0 && mapId >= 0x4c4 && mapId <= 0x4df) return settings;
    // BNE's picker uses a 32-byte DOS filename for packaged local scenarios.
    const name = nativeText(settings.subarray(16));
    return settings[0] === 1 && !scenario.externalPath && /^[^\\/:]+\.pud$/i.test(name)
      ? settings : null;
  }

  function portableFastSlot(slot) {
    if (slot?.kind !== 'fast' || slot.scenario?.externalPath !== false) return false;
    const settings = fastConfig(slot.scenario);
    if (!settings || settings[2] < 1 || settings[2] > 8 || settings[3] || settings[4] || settings[5] ||
        !settings.subarray(16).includes(0)) return false;
    const record = new DataView(settings.buffer), mapId = record.getUint16(6, true);
    const options = record.getUint32(8, true), signature = record.getUint32(12, true);
    if ((options & ~0x3fe00) !== 0) return false;
    if (settings[0] === 0) return settings[1] === 0 && signature === 0;
    const map = portableMaps[mapId];
    return !!map && map[0] === nativeText(settings.subarray(16)) && map[1] === settings[1] &&
      map[2] === settings[2] && map[3] === signature;
  }

  function attach(wine, {onStarted, onVictory, onDefeat} = {}) {
    if (!installed.has(wine)) return null;
    let active = null, pendingFast = null, running = false, resuming = null, nextAutosave = Infinity;
    const word = address => nativeView(wine, address, 2)?.getUint16(0, true);
    const byte = address => nativeView(wine, address, 1)?.getUint8(0);
    const offline = () => byte(networkGame) === 0 && byte(replay) === 0;
    function openFastSetup() {
      const root = nativeView(wine, fastRoot, 4)?.getUint32(0, true);
      return word(gameState) === 12 && offline() && root &&
        nativeView(wine, root + 0x2a, 4)?.getUint32(0, true) === 0x415640;
    }
    function snapshotFast() {
      const setup = openFastSetup() && nativeView(wine, fastSetup, 48);
      if (!setup) return null;
      const scenario = {version:1,settings:Array.from(octets(setup)),startUnits:byte(startUnits),race:byte(race),
        externalPath:byte(selectedMap) !== 0};
      const settings = fastConfig(scenario);
      if (!settings) return null;
      const name = nativeText(settings.subarray(16)).replace(/\.pud$/i, '').trim();
      return {kind:'fast',scenario,name};
    }
    function restoreFast(slot) {
      const settings = slot?.kind === 'fast' && fastConfig(slot.scenario);
      const setup = openFastSetup() && nativeView(wine, fastSetup, 48);
      const units = nativeView(wine, startUnits, 1), teamRace = nativeView(wine, race, 1);
      if (!settings || !setup || !units || !teamRace) return false;
      octets(setup).set(settings);
      units.setUint8(0, slot.scenario.startUnits);
      teamRace.setUint8(0, slot.scenario.race);
      pendingFast = slot;
      return true;
    }
    function validSave(data) {
      return data instanceof Uint8Array && data.length > 0x1000 && data.length <= maxSaveBytes &&
        new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0x28,true) === 0x32726157;
    }
    function clearCheckpoint() {
      try { global.localStorage.removeItem(checkpointKey); }
      catch (_) {}
    }
    function commitCheckpoint() {
      const save = nativeView(wine, saveResult, 1);
      if (save?.getUint8(0) !== 1) return;
      save.setUint8(0, 0);
      const files = wine._helpCtx.vfs.files, record = files.get(guestSave);
      if (!active || !validSave(record?.data)) return;
      try {
        global.localStorage.setItem(checkpointKey, JSON.stringify({slot:active,data:global.btoa(
          Array.from({length:Math.ceil(record.data.length / 16384)}, (_, i) =>
            String.fromCharCode(...record.data.subarray(i * 16384, (i + 1) * 16384))).join(''))}));
      } catch (error) { console.warn('Warcraft II automatic save could not be stored', error); }
    }
    function continueSlot(slot) {
      const request = nativeView(wine, continueRequest, 1);
      if (word(gameState) !== 4 || !offline() || !request || !slot) return false;
      try {
        const saved = JSON.parse(global.localStorage.getItem(checkpointKey));
        if (JSON.stringify(saved?.slot) !== JSON.stringify(slot) || typeof saved.data !== 'string' ||
            saved.data.length > 4 / 3 * maxSaveBytes) return false;
        const data = Uint8Array.from(global.atob(saved.data), c => c.charCodeAt(0));
        if (!validSave(data)) return false;
        wine._helpCtx.vfs.files.set(guestSave,{data,attrs:0x20});
        resuming = slot;
        request.setUint8(0, 1);
        return true;
      } catch (_) { return false; }
    }
    function armCampaign(slot) {
      const requested = encodeCampaign(slot), mailbox = nativeView(wine, selectedLevel, 2);
      if (!requested || !mailbox || word(gameState) !== 4 || !offline()) return false;
      mailbox.setUint16(0, requested, true);
      return true;
    }
    function tick() {
      commitCheckpoint();
      const event = nativeView(wine, finishedState, 4);
      if (event?.getUint16(0, true)) {
        const result = event.getUint16(0, true), id = event.getUint16(2, true);
        event.setUint16(0, 0, true);
        const slot = active;
        running = false;
        active = null;
        nativeView(wine, autosaveRequest, 1)?.setUint8(0, 0);
        if (slot && (result === 5 || result === 6 || result === 7)) clearCheckpoint();
        if (result === 5 && slot?.kind === 'fast') pendingFast = slot;
        if (slot?.kind === 'campaign' && encodeCampaign(slot) === id) {
          if (result === 6) onVictory?.(slot);
          if (result === 7) onDefeat?.(slot);
        }
      }
      if (resuming && byte(continueRequest) === 3) {
        resuming = null;
        nativeView(wine, continueRequest, 1)?.setUint8(0, 0);
      }
      if (byte(inGame) !== 1 || word(gameState) !== 3 || !offline()) return;
      if (running) {
        if (active && performance.now() >= nextAutosave) {
          nativeView(wine, autosaveRequest, 1)?.setUint8(0, 1);
          nextAutosave = performance.now() + autosaveInterval;
        }
        return;
      }
      running = true;
      if (!byte(customScenario)) {
        active = decodeCampaign(word(level));
        nativeView(wine, selectedLevel, 2)?.setUint16(0, 0, true);
      } else {
        active = resuming?.kind === 'fast' ? resuming : pendingFast;
        pendingFast = null;
      }
      if (active) {
        if (!resuming) clearCheckpoint();
        onStarted?.(active);
      }
      nextAutosave = performance.now() + autosaveInterval;
      if (resuming) nativeView(wine, continueRequest, 1)?.setUint8(0, 0);
      resuming = null;
    }
    return {armCampaign,tick,snapshotFast,restoreFast,continueSlot,clearCheckpoint,readSession:() => active,
      armFast(slot) { pendingFast = slot?.kind === 'fast' ? slot : null; }};
  }

  const api = {install,attach,encodeCampaign,decodeCampaign,portableFastSlot};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.WarcraftSessionNative = api;
})(globalThis);
