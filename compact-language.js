/* Optional Russian resources for the original BNE executable. */
(() => {
  'use strict';

  const descriptor = document.currentScript.dataset;
  const digest = descriptor.sha256;
  const size = Number(descriptor.bytes);
  const available = language => language === 'en' || (language === 'ru' &&
    /^[a-f0-9]{64}$/.test(digest) && Number.isSafeInteger(size) && size > 0);
  const preference = 'wc2-language-v1';
  const root = new URL('./', location.href);
  const cacheName = 'wc2-language-data-v1:' + root.href;
  const descriptorURL = descriptor.manifest ? new URL(descriptor.manifest, root) : null;
  const text = {sha256: digest, bytes: size};
  let selected = 'en';
  let selection;
  let pack;
  let pendingManifest;
  let restartGame;
  const validFile = file => file && /^[a-f0-9]{64}$/.test(file.sha256) &&
    Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes < 16 * 1024 * 1024;
  const asset = file => new URL('compact-data/' + file.sha256 + '.bin', root);
  try {
    if (available('ru') && localStorage.getItem(preference) === 'ru') selected = 'ru';
  } catch (_) {}

  async function verifiedBytes(response, file) {
    if (!response?.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== file.bytes) return null;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    return hash === file.sha256 ? bytes : null;
  }

  function validateManifest(manifest) {
    if (manifest.language !== 'ru' || manifest.kind !== 'text' || manifest.sha256 !== digest ||
        manifest.bytes !== size) throw new Error('Неверное описание русской локализации.');
    const audio = manifest.audio;
    if (!audio) return null;
    const {effects, voices, movies, table, layout, chunks} = audio;
    if (!Array.isArray(effects) || !Array.isArray(voices) || !Array.isArray(movies) ||
        effects.length !== 298 || voices.length !== 104 || movies.length !== 3 ||
        !Array.isArray(chunks) || chunks.length < 1 || chunks.length > 8 ||
        chunks.some(file => !validFile(file) || file.bytes > 4 * 1024 * 1024) ||
        !layout || !Number.isSafeInteger(layout.start) || !Number.isSafeInteger(layout.size) ||
        !Number.isSafeInteger(layout.blocksOffset) || !Number.isSafeInteger(layout.headerSize) ||
        layout.headerOffset !== 307208 || layout.headerSize !== layout.size - 307200 ||
        layout.size <= layout.start || layout.size >= 2 ** 31 || table?.bytes !== 7376) {
      throw new Error('Неверное описание русской озвучки.');
    }
    const files = [...effects, ...voices, ...movies, table];
    if (files.some(file => !validFile(file) || !/^ru\/\d+\.(?:m4a|mp4|bin)$/.test(file.path)) ||
        new Set(files.map(file => file.path)).size !== files.length ||
        effects.some(file => !/^gamesfx\/[a-z0-9_ -]+\/[a-z0-9_ -]+\.wav$/.test(file.name))) {
      throw new Error('Неверный список русских файлов.');
    }
    let offset = 0;
    for (const file of files) {
      if (file.packedOffset !== offset) throw new Error('Неверное смещение русского файла.');
      offset += file.bytes;
    }
    if (offset !== audio.bytes || chunks.reduce((total, file) => total + file.bytes, 0) !== offset) {
      throw new Error('Неверный размер русской озвучки.');
    }
    return audio;
  }

  function readManifest() {
    if (!descriptorURL) return Promise.resolve(null);
    pendingManifest ??= fetch(descriptorURL, {redirect: 'error'}).then(response => {
      if (!response.ok) throw new Error('Описание русской локализации недоступно.');
      return response.json();
    }).then(validateManifest).catch(error => {
      pendingManifest = null;
      throw error;
    });
    return pendingManifest;
  }

  async function ensureFile(cache, file, download) {
    const url = asset(file);
    const hit = await cache.match(url);
    const marked = hit?.headers.get('X-WC2-SHA256') === file.sha256 &&
      Number(hit.headers.get('Content-Length')) === file.bytes;
    if (marked && !download && file !== text) return;
    // The first text-only build verified the same bytes before writing them,
    // but did not stamp cache headers. Keep existing offline installations.
    if (marked || file === text) {
      const bytes = await verifiedBytes(hit, file);
      if (bytes) return bytes;
    }
    if (!download) throw new Error('Русская локализация отсутствует в локальном хранилище.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {cache: 'no-store', redirect: 'error', signal: controller.signal});
      const bytes = await verifiedBytes(response, file);
      if (!bytes) throw new Error('Проверка русского файла не пройдена.');
      await cache.put(url, new Response(bytes, {headers: {
        'Content-Length': String(file.bytes), 'X-WC2-SHA256': file.sha256,
      }}));
      return bytes;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadRussian({download, progress = () => {}}) {
    const cache = await caches.open(cacheName);
    let audio;
    try {
      audio = await readManifest();
    } catch (error) {
      if (download) throw error;
      audio = null;
    }
    const files = audio ? [text, ...audio.chunks] : [text];
    const unique = [...new Map(files.map(file => [file.sha256, file])).values()];
    const total = unique.reduce((bytes, file) => bytes + file.bytes, 0);
    let loaded = 0, index = 0, error, textPatch;
    progress({loaded, total});
    async function worker() {
      while (!error && index < unique.length) {
        const file = unique[index++];
        try {
          const bytes = await ensureFile(cache, file, download);
          if (file === text) textPatch = bytes;
        }
        catch (failure) { error = failure; return; }
        loaded += file.bytes;
        progress({loaded, total});
      }
    }
    await Promise.all(Array.from({length: Math.min(unique.length, 4)}, worker));
    if (error) {
      if (download) throw error;
      // The previous release can have a verified text pack without the new
      // voice files. Keep that translation when the optional voices are absent.
      audio = null;
    }
    if (!textPatch) throw new Error('Повреждён русский текст.');
    const read = file => readMedia(cache, audio, file);
    return {textPatch, audio, read};
  }

  async function readMedia(cache, audio, file) {
    const start = file.packedOffset, end = start + file.bytes;
    const bytes = new Uint8Array(file.bytes);
    let cursor = 0, copied = 0;
    for (const block of audio.chunks) {
      if (cursor >= end) break;
      const limit = cursor + block.bytes;
      const from = Math.max(cursor, start), to = Math.min(limit, end);
      if (to > from) {
        const response = await cache.match(asset(block));
        if (!response) throw new Error('Отсутствует блок русской озвучки.');
        const blob = await response.blob();
        const part = new Uint8Array(await blob.slice(from - cursor, to - cursor).arrayBuffer());
        bytes.set(part, from - start);
        copied += part.length;
      }
      cursor = limit;
    }
    if (copied !== bytes.length) throw new Error('Неверный размер русской озвучки.');
    const verified = await verifiedBytes(new Response(bytes), file);
    if (!verified) throw new Error(`Повреждён русский файл: ${file.name || file.path}.`);
    return verified;
  }

  async function select(language, {download = false, progress} = {}) {
    if (!available(language)) throw new Error('Этот язык пока недоступен.');
    if (language === selected && !needsDownload(language)) return;
    if (selection) throw new Error('Подождите, пока язык загрузится.');
    selection = language;
    try {
      let loaded = null;
      if (language === 'ru') {
        loaded = await loadRussian({download, progress});
        if (hasAudio(language) && !loaded.audio) throw new Error('Сначала скачайте русский язык.');
      }
      localStorage.setItem(preference, language);
      await applyLanguage(language, loaded, download ? 'title' : 'language');
    } finally {
      selection = null;
    }
  }

  async function status(language) {
    if (language === 'en') return {installed: true, stored: true};
    if (!available(language)) throw new Error('Этот язык пока недоступен.');
    const audio = await readManifest();
    const files = audio ? [text, ...audio.chunks] : [text];
    if (!await caches.has(cacheName)) return {installed: false, stored: false};
    const cache = await caches.open(cacheName);
    const stored = (await cache.keys()).length > 0;
    const installed = await Promise.all(files.map(file =>
      ensureFile(cache, file, false).then(() => true, () => false)));
    return {installed: installed.every(Boolean) && !needsDownload(language), stored};
  }

  async function remove(language) {
    if (language !== 'ru' || !available(language)) throw new Error('Этот язык всегда доступен.');
    if (selection) throw new Error('Подождите, пока язык загрузится.');
    selection = language;
    try {
      await caches.delete(cacheName);
      if (selected === language) {
        localStorage.removeItem(preference);
        await applyLanguage('en', null, 'language');
      }
    } finally {
      selection = null;
    }
  }

  async function applyLanguage(language, nextPack, page) {
    selected = language;
    pack = nextPack;
    if (restartGame) {
      try {
        await restartGame(page);
        return;
      } catch (error) {
        console.warn('Warcraft II language restart failed:', error);
      }
    }
    location.reload();
  }

  async function patch() {
    if (selected !== 'ru') return null;
    try {
      pack ??= await loadRussian({download: false});
      return pack.textPatch;
    } catch (error) {
      fallback(error);
      return null;
    }
  }

  function fallback(error) {
    selected = 'en';
    pack = null;
    try { localStorage.removeItem(preference); } catch (_) {}
    window.dispatchEvent(new CustomEvent('warcraftlanguageerror', {detail: error.message}));
  }

  function fallbackAudio(error) {
    if (pack) pack = {textPatch: pack.textPatch, audio: null};
    window.dispatchEvent(new CustomEvent('warcraftlanguageerror', {detail: error.message}));
  }

  const hasAudio = language => language === 'ru' && descriptor.audio === 'true';
  const needsDownload = language => hasAudio(language) && selected === 'ru' && !pack?.audio;
  window.WarcraftLanguage = Object.freeze({current: () => selected, available, select, status, remove, hasAudio, needsDownload});
  window.WarcraftCompactLanguage = Object.freeze({patch, fallback, fallbackAudio,
    setRestart(handler) { restartGame = handler; }, get pack() { return pack; }});
})();
