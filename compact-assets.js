/* Verified, resumable downloads for the same-origin compact release. */
(() => {
  'use strict';
  const cacheName = 'wc2-compact-data-v1:' + new URL('./', location.href).href;
  const shaPattern = /^[0-9a-f]{64}$/;
  const dataPattern = /^[a-zA-Z0-9_.\/-]+$/;
  const dataManifest = document.currentScript.dataset.manifest;
  let manifest, cache, installation;

  function safePath(path) {
    return typeof path === 'string' && dataPattern.test(path) &&
      path.split('/').every(part => part && part !== '.' && part !== '..');
  }

  async function sha256(bytes) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('');
  }

  const request = hash => new URL('./compact-data/' + hash + '.bin', location.href).href;

  async function initialize() {
    if (manifest) return manifest;
    const response = await fetch(new URL(dataManifest, location.href));
    if (!response.ok) throw new Error('Список файлов игры недоступен');
    const document = await response.json();
    if (document.version !== 1 || !Array.isArray(document.files) ||
        !Array.isArray(document.media) || !Array.isArray(document.archive?.parts) ||
        !Array.isArray(document.audioWaves)) throw new Error('Неизвестный формат компактной сборки');
    const blobs = new Map();
    const files = new Map();
    for (const file of document.files) {
      if (!safePath(file.path) || files.has(file.path) || !Number.isSafeInteger(file.bytes) ||
          file.bytes <= 0 || !Array.isArray(file.chunks)) throw new Error('Повреждён список файлов игры');
      let offset = 0;
      for (const chunk of file.chunks) {
        if (!shaPattern.test(chunk.sha256) || !Number.isSafeInteger(chunk.bytes) ||
            chunk.bytes <= 0 || chunk.bytes > 4 * 1024 * 1024 ||
            (blobs.has(chunk.sha256) && blobs.get(chunk.sha256) !== chunk.bytes)) {
          throw new Error('Повреждён список блоков игры');
        }
        blobs.set(chunk.sha256, chunk.bytes);
        chunk.offset = offset;
        offset += chunk.bytes;
      }
      if (offset !== file.bytes) throw new Error('Неверный размер файла игры');
      files.set(file.path, file);
    }
    if (!files.has('base.zip') || !files.has('install-core.bin') ||
        document.media.some(file => files.get(file.path)?.bytes !== file.bytes)) {
      throw new Error('В компактной сборке не хватает игровых данных');
    }
    cache = await caches.open(cacheName);
    manifest = document;
    manifest.filesByPath = files;
    manifest.blobs = blobs;
    return manifest;
  }

  async function findChunk(hash, bytes) {
    const stored = await cache.match(request(hash));
    return stored?.headers.get('X-WC2-SHA256') === hash &&
      Number(stored.headers.get('Content-Length')) === bytes ? stored : null;
  }

  async function download(hash, size) {
    if (await findChunk(hash, size)) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      await fetchChunk(hash, size, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchChunk(hash, size, signal) {
    const response = await fetch(request(hash), {
      cache: 'no-store', redirect: 'error', signal,
    });
    if (!response.ok) throw new Error('Не удалось скачать данные игры');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== size || await sha256(bytes) !== hash) {
      throw new Error('Часть загрузки повреждена');
    }
    await cache.put(request(hash), new Response(bytes, {headers: {
      'Content-Length': String(size), 'X-WC2-SHA256': hash,
    }}));
  }

  async function install(progress) {
    await initialize();
    const pending = [];
    let total = 0, loaded = 0;
    for (const [hash, size] of manifest.blobs) {
      total += size;
      if (await findChunk(hash, size)) loaded += size;
      else pending.push([hash, size]);
    }
    if (pending.length) progress({loaded, total});
    let cursor = 0, failure;
    async function work() {
      while (!failure && cursor < pending.length) {
        const [hash, size] = pending[cursor++];
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await download(hash, size);
            loaded += size;
            progress({loaded, total});
            break;
          } catch (error) {
            if (attempt === 2) {
              failure ??= error;
              break;
            }
          }
        }
      }
    }
    await Promise.all(Array.from({length: Math.min(3, pending.length)}, work));
    if (failure) throw failure;
  }

  function ensureInstalled(progress = () => {}) {
    if (!installation) installation = install(progress).finally(() => { installation = undefined; });
    return installation;
  }

  function getFile(path) {
    const file = manifest?.filesByPath.get(path);
    if (!file) throw new Error('Неизвестный файл компактной игры');
    return file;
  }

  async function read(path, offset, length) {
    const file = getFile(path);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
        offset < 0 || length < 0 || offset + length > file.bytes) {
      throw new Error('Некорректное чтение компактной игры');
    }
    const result = new Uint8Array(length);
    for (const chunk of file.chunks) {
      const start = Math.max(offset, chunk.offset);
      const end = Math.min(offset + length, chunk.offset + chunk.bytes);
      if (start >= end) continue;
      const response = await findChunk(chunk.sha256, chunk.bytes);
      if (!response) throw new Error('Файл игры отсутствует. Открой игру с интернетом, чтобы восстановить загрузку.');
      if (start === chunk.offset && end - start === chunk.bytes) {
        result.set(new Uint8Array(await response.arrayBuffer()), start - offset);
      } else {
        const blob = await response.blob();
        result.set(new Uint8Array(await blob.slice(start - chunk.offset, end - chunk.offset).arrayBuffer()),
          start - offset);
      }
    }
    return result;
  }

  async function blob(path, mime) {
    const file = getFile(path);
    const parts = [];
    for (const chunk of file.chunks) {
      const response = await findChunk(chunk.sha256, chunk.bytes);
      if (!response) throw new Error('Медиафайл игры отсутствует');
      parts.push(await response.blob());
    }
    return new Blob(parts, {type: mime});
  }

  window.WarcraftCompactAssets = Object.freeze({
    initialize, ensureInstalled, read, blob,
    get manifest() { return manifest; },
  });
})();
