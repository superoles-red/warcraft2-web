/* Serve ordinary PCM WAV bytes to the original Storm MPQ reader. */
(() => {
  'use strict';
  const waveHeaderBytes = 44;
  const maxEncodedBytes = 8 * 1024 * 1024;
  const maxWaveBytes = 32 * 1024 * 1024;
  const pcmBudget = 32 * 1024 * 1024;
  const maxReadBytes = 2 * 1024 * 1024;
  const contexts = new Map();
  const fallbackModule = globalThis.document?.currentScript?.src
    ? new URL('compact-aac.mjs', globalThis.document.currentScript.src).href
    : null;
  let wasmDecoder;
  let useSoftware = false;

  function headerFor(wave) {
    const bytes = new Uint8Array(waveHeaderBytes);
    const view = new DataView(bytes.buffer);
    const alignment = wave.channels * 2;
    const dataBytes = wave.wavBytes - waveHeaderBytes;
    for (const [offset, fourCC] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
      for (let i = 0; i < 4; i++) bytes[offset + i] = fourCC.charCodeAt(i);
    }
    view.setUint32(4, wave.wavBytes - 8, true);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, wave.channels, true);
    view.setUint32(24, wave.sampleRate, true);
    view.setUint32(28, wave.sampleRate * alignment, true);
    view.setUint16(32, alignment, true);
    view.setUint16(34, 16, true);
    view.setUint32(40, dataBytes, true);
    return bytes;
  }

  async function decodeWebAudio(bytes, wave) {
    const Context = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
    if (!Context) throw new Error('Декодирование AAC недоступно в этом браузере');
    let context = contexts.get(wave.sampleRate);
    if (!context) {
      context = new Context(1, 1, wave.sampleRate);
      contexts.set(wave.sampleRate, context);
    }
    // decodeAudioData detaches its input and resamples to this context's rate.
    return context.decodeAudioData(bytes.slice().buffer);
  }

  async function decodeSoftware(bytes, wave) {
    if (!fallbackModule) throw new Error('Не найден резервный декодер AAC');
    wasmDecoder ??= import(fallbackModule).then(({default: createModule}) => createModule());
    const wasm = await wasmDecoder;
    const size = wave.wavBytes - waveHeaderBytes;
    const input = wasm._malloc(bytes.length);
    const output = wasm._malloc(size);
    try {
      if (!input || !output) throw new Error('Не хватает памяти для AAC');
      wasm.HEAPU8.set(bytes, input);
      const frames = wasm._wc2_decode_aac(input, bytes.length, output,
        wave.sampleFrames, wave.sampleRate, wave.channels);
      if (frames < wave.sampleFrames || frames > wave.sampleFrames + 2048) {
        throw new Error(`Ошибка резервного декодера AAC (${frames}): ${wave.name}`);
      }
      return wasm.HEAPU8.slice(output, output + size);
    } finally {
      wasm._free(output);
      wasm._free(input);
    }
  }

  async function decodeAac(bytes, wave) {
    if (!useSoftware) {
      try {
        return samplesToPcm(await decodeWebAudio(bytes, wave), wave);
      } catch (_) {
        const pcm = await decodeSoftware(bytes, wave);
        useSoftware = true;
        return pcm;
      }
    }
    return decodeSoftware(bytes, wave);
  }

  function samplesToPcm(buffer, wave) {
    // AAC decoders can expose final frame padding. Preserve the source
    // duration, and reject a short decode instead of masking missing audio.
    const maxPadding = 2048;
    if (buffer.sampleRate !== wave.sampleRate || buffer.numberOfChannels !== wave.channels ||
        buffer.length < wave.sampleFrames || buffer.length > wave.sampleFrames + maxPadding) {
      throw new Error(`Декодированная дорожка не совпадает с исходной: ${wave.name}`);
    }
    const planes = Array.from({length: wave.channels}, (_, index) => buffer.getChannelData(index));
    const pcm = new Uint8Array(wave.wavBytes - waveHeaderBytes);
    let byte = 0;
    for (let frame = 0; frame < wave.sampleFrames; frame++) {
      for (const plane of planes) {
        const value = Math.round(plane[frame] * 32768);
        const sample = Math.max(-32768, Math.min(32767, value));
        pcm[byte++] = sample & 255;
        pcm[byte++] = sample >> 8 & 255;
      }
    }
    return pcm;
  }

  function create({manifest, readAsset, decode = decodeAac}) {
    if (typeof readAsset !== 'function' || !Array.isArray(manifest?.audioWaves) ||
        manifest.audioWaves.length === 0 || manifest.audioWaves.length > 256) {
      throw new Error('Нет таблицы дорожек компактного Install.mpq');
    }
    let offset = manifest.audioWaves[0].offset;
    if (!Number.isSafeInteger(offset) || offset <= 0) throw new Error('Неверное начало WAV в Install.mpq');
    const start = offset;
    const paths = new Set();
    const waves = manifest.audioWaves.map(wave => {
      if (wave.offset !== offset || !/^(?:music|speech)\/\d+\.m4a$/.test(wave.path) ||
          paths.has(wave.path) || !/^[a-f0-9]{64}$/.test(wave.sha256) ||
          !Number.isSafeInteger(wave.sampleFrames) || wave.sampleFrames <= 0 ||
          !Number.isSafeInteger(wave.sampleRate) || wave.sampleRate < 8000 || wave.sampleRate > 48000 ||
          (wave.channels !== 1 && wave.channels !== 2) ||
          !Number.isSafeInteger(wave.bytes) || wave.bytes <= 0 || wave.bytes > maxEncodedBytes ||
          wave.wavBytes !== waveHeaderBytes + wave.sampleFrames * wave.channels * 2 ||
          wave.wavBytes > maxWaveBytes) {
        throw new Error('Неверная запись WAV в компактном Install.mpq');
      }
      paths.add(wave.path);
      offset += wave.wavBytes;
      return {...wave, header: headerFor(wave), end: offset};
    });
    if (offset !== manifest.virtualInstallSize || offset >= 2 ** 31) {
      throw new Error('Неверный размер компактного Install.mpq');
    }
    const cache = new Map();
    const pending = new Map();
    let resident = 0;
    let decodeQueue = Promise.resolve();

    function load(wave) {
      const cached = cache.get(wave);
      if (cached) {
        cache.delete(wave);
        cache.set(wave, cached);
        return Promise.resolve(cached);
      }
      if (pending.has(wave)) return pending.get(wave);
      const promise = decodeQueue.then(async () => {
        const bytes = await readAsset(wave.path, 0, wave.bytes);
        if (!(bytes instanceof Uint8Array) || bytes.length !== wave.bytes) {
          throw new Error(`Неполная дорожка ${wave.name}`);
        }
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== wave.sha256) throw new Error(`Контрольная сумма дорожки не совпала: ${wave.name}`);
        const size = wave.wavBytes - waveHeaderBytes;
        while (resident + size > pcmBudget) {
          const [old, pcm] = cache.entries().next().value;
          cache.delete(old);
          resident -= pcm.length;
        }
        const decoded = await decode(bytes, wave);
        const pcm = decoded instanceof Uint8Array ? decoded : samplesToPcm(decoded, wave);
        if (pcm.length !== size) throw new Error(`Неверный размер PCM: ${wave.name}`);
        cache.set(wave, pcm);
        resident += pcm.length;
        return pcm;
      });
      decodeQueue = promise.catch(() => {});
      pending.set(wave, promise);
      return promise.finally(() => pending.delete(wave));
    }

    async function read(at, length) {
      if (!Number.isSafeInteger(at) || at < 0 || !Number.isSafeInteger(length) || length < 0 ||
          !Number.isSafeInteger(at + length) || length > maxReadBytes) {
        throw new RangeError('Некорректное чтение компактного Install.mpq');
      }
      if (at < start || at + length > offset) return null;
      const end = at + length;
      const bytes = new Uint8Array(length);
      for (const wave of waves) {
        if (wave.end <= at) continue;
        if (wave.offset >= end) break;
        const head = Math.max(at, wave.offset);
        const data = wave.offset + waveHeaderBytes;
        if (head < data) {
          bytes.set(wave.header.subarray(head - wave.offset, Math.min(end, data) - wave.offset), head - at);
        }
        const body = Math.max(head, data);
        if (body < end) {
          const pcm = await load(wave);
          bytes.set(pcm.subarray(body - data, Math.min(end, wave.end) - data), body - at);
        }
      }
      return bytes;
    }

    return Object.freeze({read, start, size: offset});
  }

  let activeAssets, activeAudio;
  globalThis.WarcraftCompactAudio = Object.freeze({
    create,
    async read(offset, length) {
      const assets = globalThis.WarcraftCompactAssets;
      if (!assets?.manifest?.audioWaves?.length) return null;
      if (activeAssets !== assets) {
        const audio = create({manifest: assets.manifest, readAsset: assets.read.bind(assets)});
        activeAudio = audio;
        activeAssets = assets;
      }
      return activeAudio.read(offset, length);
    },
  });
})();
