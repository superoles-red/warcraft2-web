/* Opt-in native V16 bootstrap for the pinned local Wine-Assembly pilot. */
(() => {
  'use strict';
  const artifactHash = '5b389adabf1de4068e4af0e50371795bbd729355fb3620b79ba4b0f57181faed';
  const gameDll = 'c:\\warcraft2\\wc2ui.dll';
  const stockDll = 'c:\\windows\\system\\ddraw.dll';
  const forwardDll = 'c:\\windows\\system32\\ddraw.dll';
  const viewportPath = 'c:\\wc2-viewport-request.bin';
  const frameFolder = 'c:\\wc2-runtime-v16\\';
  const ddrawNameVa = 0x4ab06c;
  const ddrawCallVa = 0x48c395;
  const ddrawHandleVa = 0x4d6e70;
  const ddrawCall = [0x68, 0x6c, 0xb0, 0x4a, 0x00, 0xff, 0x15, 0x78, 0x01, 0x49, 0x00];
  const originalName = new TextEncoder().encode('ddraw.dll\0');
  const aliasName = new TextEncoder().encode('wc2ui.dll\0');

  function encodeViewport(width, height, hideKeyboardHints) {
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 640 || width > 1920 || height < 480 || height > 1536 ||
        width % 32 !== 0 || height % 32 !== 0) {
      throw new Error('Неподдерживаемый размер кадра V16');
    }
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x31525657, true); // WVR1
    view.setUint16(4, bytes.length, true);
    view.setUint16(6, 1, true);
    view.setUint16(8, width, true);
    view.setUint16(10, height, true);
    view.setUint32(12, hideKeyboardHints ? 1 : 0, true);
    return bytes;
  }

  async function guestBytes(wine, address, length) {
    const start = (await wine.callGuest('guest_to_wasm', address)) >>> 0;
    const end = (await wine.callGuest('guest_to_wasm', address + length - 1)) >>> 0;
    const memory = wine.memory.buffer;
    if (!start || start === 0xf0 || end !== start + length - 1 || end >= memory.byteLength) {
      throw new Error('Не удалось проверить адрес в памяти Warcraft II');
    }
    return new Uint8Array(memory, start, length);
  }

  function matches(bytes, expected) {
    return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
  }

  async function install(wine, dll, request) {
    const vfs = wine._helpCtx?.vfs;
    const builtin = vfs?.files.get(stockDll);
    if (!builtin?.staticModule || typeof wine.callGuest !== 'function') {
      throw new Error('Не найден встроенный DirectDraw среды Wine-Assembly');
    }
    if ([gameDll, forwardDll, viewportPath].some(path => vfs.files.has(path))) {
      throw new Error('Пути для V16 уже заняты в гостевой файловой системе');
    }
    const call = await guestBytes(wine, ddrawCallVa, ddrawCall.length);
    const name = await guestBytes(wine, ddrawNameVa, originalName.length);
    const handle = await guestBytes(wine, ddrawHandleVa, 4);
    if (!matches(call, ddrawCall) || !matches(name, originalName) || handle.some(Boolean)) {
      throw new Error('Штатный вызов DirectDraw не совпал с ожидаемой версией BNE');
    }

    vfs.ensureParentDirs(gameDll);
    vfs.ensureParentDirs(forwardDll);
    vfs.ensureParentDirs(frameFolder + 'wc2-frame-v16-commit.bin');
    vfs.files.set(gameDll, {data: dll, attrs: 0x21});
    vfs.files.set(forwardDll, builtin);
    vfs.files.set(viewportPath, {data: request, attrs: 0x20});
    // Change one fixed-length name in the guest image before its first run.
    // BNE's original path opens the proxy; its system32 forward stays builtin.
    name.set(aliasName);
  }

  async function prepare({
    width = 640, height = 480, hideKeyboardHints = false, artifactURL = './v16-bridge.dll', sha256 = artifactHash,
  } = {}) {
    const request = encodeViewport(width, height, hideKeyboardHints);
    const directory = new URL('./', location.href);
    const url = new URL(artifactURL, directory);
    if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname) ||
        !/^[a-z0-9-]+\.dll$/.test(url.pathname.slice(directory.pathname.length)) ||
        url.search || url.hash || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error('Недопустимый локальный артефакт V16');
    }
    const response = await fetch(url, {cache: 'no-store', redirect: 'error'});
    if (!response.ok) throw new Error('Не удалось загрузить мост Warcraft II V16');
    const dll = new Uint8Array(await response.arrayBuffer());
    if (dll.length < 512 || dll.length > 128 * 1024 || dll[0] !== 77 || dll[1] !== 90) {
      throw new Error('Некорректный PE-файл моста V16');
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', dll));
    const hash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== sha256) throw new Error('Контрольная сумма моста V16 не совпала');
    return wine => install(wine, dll, request);
  }

  globalThis.WarcraftAssemblyV16 = {prepare};
})();
