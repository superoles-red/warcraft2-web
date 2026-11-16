/* Offline session coordination for the pinned Battle.net Edition executable. */
(function (global) {
  'use strict';

  const campaigns = Object.freeze({
    'human-tod': {base:0x52c8, missions:14}, 'orc-tod': {base:0x52c9, missions:14},
    'human-btdp': {base:0x53c6, missions:12}, 'orc-btdp': {base:0x53c7, missions:12},
  });
  const level = 0x4abda2, gameState = 0x4ae480, inGame = 0x4ae86c;
  const matchResult = 0x4ae862, matchEnding = 0x4ae86d;
  const customScenario = 0x4acc2e, networkGame = 0x4b49ce, replay = 0x4ae0f9;
  const selectedLevel = 0x48f780, finishedState = 0x48f782, finishedLevel = 0x48f784;
  const campaignCode = 0x48f7a0, outcomeCode = 0x48f7d0;
  const fastSetup = 0x4ad960, fastRoot = 0x4ad9c4;
  const fastSetupPending = 0x4ad78c;
  const selectedMap = 0x4ad678, startUnits = 0x4ad78d, race = 0x4ad78e;
  const commandLineMap = 0x4ad9d0;
  const pickerHandler = 0x41d490, builtInList = 0x4964a0;
  const pickerSelection = 0x4ae1b0, pickerFilenames = 0x4ae1e4;
  const firstBuiltIn = 0x4c4, builtInSizes = [96,96,128,128,128,128,128,128,96,96,96,128,128,128,
    128,64,96,64,64,32,96,128,96,128,128,128,96,96];
  // The native picker reserves 256 filename slots. Its stock list uses at
  // most 153 PUDs, so the last slot can carry the basename of a nested map.
  const authoredFilenameIndex = 255;
  const mapRoot = 'c:\\warcraft2\\';
  const packagedMapPath = /^maps\\(?:[a-z0-9 _-]+\\)*[a-z0-9_ !&',-]+\.pud$/;
  const saveCode = 0x48f810, continueCode = 0x48f890, savePath = 0x48f910, saveLabel = 0x48f940;
  const continueRequest = 0x48f788, saveResult = 0x48f789, autosaveRequest = 0x48f78a;
  const guestSave = 'c:\\wc2-web-continue.sav';
  const checkpointKey = 'wc2-native-continue-v1';
  const maxSaveBytes = 3 * 1024 * 1024;
  const autosaveInterval = 60000;
  const installed = new WeakSet();
  let publishedMaps = new Map();
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
    return new TextDecoder(encoding).decode(buffer.slice(0, end));
  }

  function mapTitle(filename) {
    return filename[0].toUpperCase() + filename.slice(1, -4).replace(/\bbne$/, 'BNE');
  }

  function readPud(data) {
    if (!(data instanceof Uint8Array)) return null;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let size, players, signature, description = '';
    for (let offset = 0; offset + 8 <= data.length;) {
      const kind = view.getUint32(offset), length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (length > data.length - start) return null;
      if (kind === 0x54595045 && length === 16 && view.getUint32(start) === 0x57415232 &&
          view.getUint32(start + 4) === 0x204d4150) {
        signature = view.getUint32(start + 12, true);
      } else if (kind === 0x44494d20 && length === 4) {
        const width = view.getUint16(start, true), height = view.getUint16(start + 2, true);
        if (width === height && [32,64,96,128].includes(width)) size = width;
      } else if (kind === 0x4f574e52 && length === 16) {
        // The original picker counts the first eight OWNR values of 5.
        players = data.subarray(start, start + 8).filter(owner => owner === 5).length;
      } else if (kind === 0x44455343 && length === 32) {
        description = nativeText(data.subarray(start, start + length)).trim();
      }
      offset = start + length;
      if (size && players && signature !== undefined && description) break;
    }
    return size && players && signature !== undefined ? {size,players,signature,description} : null;
  }

  function readPackagedMaps(files) {
    const entries = new Map();
    for (const [fullPath,file] of files || []) {
      if (!(file.attrs & 1) || file._provider || !fullPath.startsWith(mapRoot)) continue;
      const path = fullPath.slice(mapRoot.length);
      if (!packagedMapPath.test(path)) continue;
      const parts = path.split('\\'), filename = parts.at(-1), data = filename.length <= 31 && readPud(file.data);
      const category = parts.slice(1,-1).join('/') || 'bne';
      if (data) entries.set(path, {...data,filename,path,category,title:mapTitle(filename),id:path});
    }
    return entries;
  }

  function scenarioRecord(entry) {
    const record = new Uint8Array(48);
    record.set([1,entry.size,entry.players]);
    const view = new DataView(record.buffer);
    view.setUint16(6, authoredFilenameIndex, true);
    view.setUint32(12, entry.signature, true);
    record.set(new TextEncoder().encode(entry.filename),16);
    return record;
  }

  function matchesMap(settings, entry) {
    return !!entry && settings[1] === entry.size && settings[2] === entry.players &&
      new DataView(settings.buffer, settings.byteOffset).getUint32(12, true) === entry.signature &&
      nativeText(settings.subarray(16)).toLowerCase() === entry.filename;
  }

  function validOctets(data, size) {
    return Array.isArray(data) && data.length === size && data.every(value =>
      Number.isInteger(value) && value >= 0 && value <= 255);
  }

  function fastConfig(scenario, maps = publishedMaps) {
    if (scenario?.version !== 1 || !validOctets(scenario.settings, 48) ||
        !Number.isInteger(scenario.startUnits) || scenario.startUnits < 0 || scenario.startUnits > 7 ||
        !Number.isInteger(scenario.race) || scenario.race < 0 || scenario.race > 3) return null;
    const settings = Uint8Array.from(scenario.settings);
    const mapId = settings[6] | settings[7] << 8;
    if (settings[0] === 0 && builtInSizes[mapId - firstBuiltIn] && !scenario.externalPath) return settings;
    // BNE's picker uses a 32-byte DOS filename for packaged local scenarios.
    const name = nativeText(settings.subarray(16));
    if (settings[0] === 1 && typeof scenario.externalPath === 'string') {
      return mapId === authoredFilenameIndex && matchesMap(settings, maps.get(scenario.externalPath)) ? settings : null;
    }
    return settings[0] === 1 && mapId !== authoredFilenameIndex && !scenario.externalPath && /^[^\\/:]+\.pud$/i.test(name)
      ? settings : null;
  }

  function portableFastSlot(slot) {
    if (slot?.kind !== 'fast') return false;
    const settings = fastConfig(slot.scenario);
    if (!settings || settings[2] < 1 || settings[2] > 8 || settings[3] || settings[4] || settings[5] ||
        !settings.subarray(16).includes(0)) return false;
    const record = new DataView(settings.buffer), mapId = record.getUint16(6, true);
    const options = record.getUint32(8, true), signature = record.getUint32(12, true);
    if ((options & ~0x3fe00) !== 0) return false;
    if (settings[0] === 0) return (settings[1] === 0 || settings[1] === builtInSizes[mapId - firstBuiltIn]) && signature === 0;
    if (typeof slot.scenario.externalPath === 'string') return true;
    const map = portableMaps[mapId];
    return !!map && map[0] === nativeText(settings.subarray(16)) && map[1] === settings[1] &&
      map[2] === settings[2] && map[3] === signature;
  }

  function attach(wine, {onStarted, onVictory, onDefeat} = {}) {
    if (!installed.has(wine)) return null;
    let active = null, pendingFast = null, running = false, resuming = null, nextAutosave = Infinity;
    let pendingScenario = null;
    const maps = readPackagedMaps(wine._helpCtx?.vfs?.files);
    publishedMaps = maps;
    const dword = address => nativeView(wine, address, 4)?.getUint32(0, true);
    const word = address => nativeView(wine, address, 2)?.getUint16(0, true);
    const byte = address => nativeView(wine, address, 1)?.getUint8(0);
    const offline = () => byte(networkGame) === 0 && byte(replay) === 0;
    function openFastSetup() {
      const root = dword(fastRoot);
      return word(gameState) === 12 && offline() && root && dword(root + 0x2a) === 0x415640;
    }
    function fastSetupReady() {
      // The original setup poll at 0x414533 applies a pending map change.
      // Starting before it runs lets that change cancel the native Start.
      return Boolean(openFastSetup()) && byte(fastSetupPending) === 0;
    }
    function openPicker(front) {
      return front?.slot === 4 && front.handler === pickerHandler && word(front.root + 0x20) === 4 &&
        dword(front.root + 0x2a) === pickerHandler && openFastSetup();
    }
    function readBuiltIns() {
      const count = word(builtInList + 6), base = dword(builtInList + 8);
      if (!base || count !== builtInSizes.length) return [];
      const entries = [];
      for (let index = 0; index < count; index++) {
        const view = nativeView(wine, base + index * 48, 48);
        if (!view) return [];
        const record = octets(view).slice(), size = record[1], players = record[2];
        const id = view.getUint16(6, true), title = nativeText(record.subarray(16));
        if (record[0] || builtInSizes[id - firstBuiltIn] !== size || !players || players > 8 || !title) return [];
        entries.push({id:`builtin:${id}`,title,size,players,category:'builtin',description:'',record});
      }
      return entries;
    }
    function scenarioChoices(front) {
      if (!openPicker(front)) return null;
      const setup = nativeView(wine, fastSetup, 48), builtIns = readBuiltIns();
      if (!setup || !builtIns.length) return null;
      const record = octets(setup), filename = nativeText(record.subarray(16)).toLowerCase();
      const activePath = readSelectedPath();
      const selectedId = record[0] === 0 ? `builtin:${setup.getUint16(6,true)}` :
        activePath || `maps\\${filename}`;
      return {selectedId, entries:[...builtIns, ...maps.values()].map(({id,title,size,players,category,description}) =>
        ({id,title,size,players,category,description}))};
    }
    function selectScenario(id, front) {
      if (!openPicker(front)) return false;
      const entry = maps.get(id) || readBuiltIns().find(item => item.id === id);
      const selection = nativeView(wine, pickerSelection, 48);
      if (!entry || !selection) return false;
      const record = entry.record || scenarioRecord(entry);
      if (entry.path) {
        const filenames = dword(pickerFilenames);
        const filename = filenames && nativeView(wine, filenames + authoredFilenameIndex * 32, 32);
        if (!filename) return false;
        octets(filename).set(record.subarray(16));
      }
      // Original OK closes the dialog and copies this exact record into the
      // current Fast setup, retaining the existing game rules at offsets 4/8.
      octets(selection).set(record);
      pendingScenario = {record,path:entry.path || false};
      return true;
    }
    function readSelectedPath() {
      const path = nativeView(wine, selectedMap, 260);
      if (!path) return false;
      const name = nativeText(octets(path)).toLowerCase();
      return name.startsWith(mapRoot) && maps.has(name.slice(mapRoot.length)) ? name.slice(mapRoot.length) : false;
    }
    function writeSelectedPath(relative) {
      const path = nativeView(wine, selectedMap, 260), flag = nativeView(wine, commandLineMap, 2);
      if (!path || !flag || (relative && !maps.has(relative))) return false;
      const raw = octets(path);
      raw.fill(0);
      if (relative) raw.set(new TextEncoder().encode(mapRoot + relative));
      flag.setUint16(0,0,true);
      return true;
    }
    function acknowledgeScenario() {
      if (!pendingScenario || !openFastSetup()) return;
      const setup = nativeView(wine, fastSetup, 48);
      if (!setup) return;
      const {record,path} = pendingScenario;
      const confirmed = octets(setup);
      // The native commit preserves setup options at offsets 4/8. Every
      // other byte must match the catalog entry before changing its path.
      if (!record.every((value,i) => (i >= 4 && i < 6) || (i >= 8 && i < 12) || confirmed[i] === value)) return;
      if (writeSelectedPath(path)) pendingScenario = null;
    }
    function snapshotFast() {
      const setup = openFastSetup() && nativeView(wine, fastSetup, 48);
      if (!setup) return null;
      acknowledgeScenario();
      const scenario = {version:1,settings:Array.from(octets(setup)),startUnits:byte(startUnits),race:byte(race),
        externalPath:setup.getUint8(0) === 1 && readSelectedPath()};
      const settings = fastConfig(scenario,maps);
      if (!settings) return null;
      const name = maps.get(scenario.externalPath)?.title || nativeText(settings.subarray(16)).replace(/\.pud$/i, '').trim();
      return {kind:'fast',scenario,name};
    }
    function applyFast(slot) {
      const settings = slot?.kind === 'fast' && fastConfig(slot.scenario,maps);
      const setup = nativeView(wine, fastSetup, 48);
      const units = nativeView(wine, startUnits, 1), teamRace = nativeView(wine, race, 1);
      if (!settings || !setup || !units || !teamRace || !writeSelectedPath(slot.scenario.externalPath)) return false;
      octets(setup).set(settings);
      units.setUint8(0, slot.scenario.startUnits);
      teamRace.setUint8(0, slot.scenario.race);
      pendingScenario = null;
      return true;
    }
    function restoreFast(slot) {
      if (!openFastSetup() || !applyFast(slot)) return false;
      pendingFast = slot;
      return true;
    }
    function validSave(data) {
      return data instanceof Uint8Array && data.length > 0x1000 && data.length <= maxSaveBytes &&
        new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0x28,true) === 0x32726157;
    }
    function clearCheckpoint(slot) {
      try {
        if (slot) {
          const saved = JSON.parse(global.localStorage.getItem(checkpointKey));
          if (JSON.stringify(saved?.slot) !== JSON.stringify(slot)) return;
        }
        global.localStorage.removeItem(checkpointKey);
      }
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
    function settleResult(result, slot) {
      const persist = result === 6 ? onVictory : onDefeat;
      if (persist?.(slot) !== false) clearCheckpoint(slot);
    }
    function detachActive() {
      const slot = active;
      active = null;
      nativeView(wine, autosaveRequest, 1)?.setUint8(0, 0);
      return slot;
    }
    function finish(result, id) {
      running = false;
      const slot = detachActive();
      if (!slot) return;
      if (result === 5) {
        clearCheckpoint(slot);
        if (slot.kind === 'fast') pendingFast = slot;
      }
      const campaignMatches = slot.kind === 'campaign' && encodeCampaign(slot) === id;
      if ((result === 6 || result === 7) && (slot.kind === 'fast' || campaignMatches)) settleResult(result, slot);
    }
    function tick(outcomeResult) {
      commitCheckpoint();
      acknowledgeScenario();
      const event = nativeView(wine, finishedState, 4);
      const result = event?.getUint16(0, true);
      if (result) {
        const id = event.getUint16(2, true);
        event.setUint16(0, 0, true);
        finish(result, id);
      } else if (active && offline() && word(gameState) === 3) {
        if (outcomeResult === 6 && active.kind === 'fast') {
          // BNE leaves the match running until its victory dialog is closed.
          // Settle the slot now and wait for the original result to end the match.
          settleResult(6, detachActive());
        } else if (byte(inGame) === 0 && byte(matchEnding) === 1 && word(matchResult) === 7) {
          // The native defeat prompt opens after BNE marks the match finished.
          finish(7, word(level));
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
        // The original save carries the running map. Restore the setup's map
        // selection separately so Restart can open the same packaged PUD.
        if (resuming?.kind === 'fast') applyFast(resuming);
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
    return {armCampaign,tick,scenarioChoices,selectScenario,snapshotFast,fastSetupReady,restoreFast,continueSlot,clearCheckpoint,readSession:() => active,
      armFast(slot) { pendingFast = slot?.kind === 'fast' ? slot : null; }};
  }

  const api = {install,attach,encodeCampaign,decodeCampaign,portableFastSlot};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.WarcraftSessionNative = api;
})(globalThis);
