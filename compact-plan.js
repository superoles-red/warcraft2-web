/* Mount the original game with a range-backed Install.mpq. */
(() => {
  'use strict';
  const root = 'C:\\Warcraft2';
  const installPath = root + '\\Install.mpq';
  const patchPath = root.toLowerCase() + '\\war2patch.mpq';
  const exePath = root.toLowerCase() + '\\warcraft ii bne.exe';
  const assets = window.WarcraftCompactAssets;
  const corePath = 'install-core.bin';

  async function getPlan() {
    const manifest = await assets.initialize();
    const {archive, virtualInstallSize} = manifest;
    const coreSize = manifest.filesByPath.get(corePath).bytes;
    let packed = 0, previousEnd = 0;
    for (const {offset, length, packedOffset} of archive.parts) {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length <= 0 ||
          offset < previousEnd || offset + length > archive.size || packedOffset !== packed) {
        throw new Error('Повреждена таблица компактного Install.mpq');
      }
      previousEnd = offset + length;
      packed += length;
    }
    if (archive.size !== 490603716 || packed !== coreSize ||
        !Number.isSafeInteger(virtualInstallSize) || virtualInstallSize <= archive.size ||
        virtualInstallSize >= 2 ** 31 || manifest.audioWaves[0]?.offset !== archive.size) {
      throw new Error('Неверный размер компактного Install.mpq');
    }

    const name = 'warcraft2-compact.zip';
    const base = await window.mediaImport.analyze({
      name, size: manifest.filesByPath.get('base.zip').bytes,
      readRange: (offset, length) => assets.read('base.zip', offset, length),
    }, {name, mountOptions: {root, unwrap: false}});
    if (base.kind !== 'zip' || !base.exeCandidates.some(candidate => candidate.path === exePath)) {
      throw new Error('Игровые файлы Warcraft II не распознаны');
    }
    const language = window.WarcraftCompactLanguage;
    const textPatch = await language?.patch();
    let localized = null;
    try {
      localized = await prepareLocalizedMedia(language?.pack, virtualInstallSize);
    } catch (error) {
      language.fallbackAudio(error);
    }

    return {...base, mediaId: 'warcraft2-bne-compact', async mount(vfs) {
      const mounted = await base.mount(vfs);
      await Promise.all(mounted.mounted.filter(path => /\.(dll|snp)$/i.test(path))
        .map(path => vfs.materialize(path)));
      let activeMedia = localized;
      if (textPatch && vfs.files.has(patchPath)) {
        vfs.files.set(patchPath, {data: textPatch, attrs: 0x21});
        for (const effect of activeMedia?.effects ?? []) {
          const path = root + '\\' + effect.name.replaceAll('/', '\\');
          if (!vfs.files.has(path.toLowerCase())) continue;
          const start = effect.offset;
          vfs.setProviderFile(path, {attrs: 0x21, length: effect.wavBytes, provider: {
            name: effect.name, size: effect.wavBytes,
            readRange: (offset, length) => activeMedia.sfx.read(start + offset, length),
          }});
        }
      } else if (textPatch) {
        activeMedia = null;
        language.fallback(new Error('Не найден оригинальный War2Patch.mpq.'));
      }
      const installSize = activeMedia?.layout.size ?? virtualInstallSize;
      const provider = window.byteProvider.cached({
        name: 'Install.mpq', size: installSize,
        async readRange(offset, length) {
          const result = new Uint8Array(length);
          const end = offset + length;
          for (const part of archive.parts) {
            if (part.offset >= end) break;
            const start = Math.max(part.offset, offset);
            const stop = Math.min(part.offset + part.length, end);
            if (start >= stop) continue;
            const bytes = await assets.read(corePath, part.packedOffset + start - part.offset, stop - start);
            result.set(bytes, start - offset);
          }
          for (const patch of activeMedia?.patches ?? []) {
            const lo = Math.max(offset, patch.offset);
            const hi = Math.min(end, patch.offset + patch.data.length);
            if (lo < hi) result.set(patch.data.subarray(lo - patch.offset, hi - patch.offset), lo - offset);
          }
          // The original media ranges are only used by the native movie hook.
          // Audio is represented by virtual WAV ranges after the original EOF.
          for (let start = Math.max(offset, archive.size); start < end;) {
            const reader = start < virtualInstallSize ? window.WarcraftCompactAudio : activeMedia?.speech;
            const limit = start < virtualInstallSize ? Math.min(end, virtualInstallSize) : end;
            const count = Math.min(limit - start, 2 * 1024 * 1024);
            const bytes = await reader?.read(start, count);
            if (bytes?.length !== count) throw new Error('Недоступны звуковые данные Warcraft II');
            result.set(bytes, start - offset);
            start += count;
          }
          return result;
        },
      }, {chunkSize: 64 * 1024, maxChunks: 64, readAhead: 0, prefetch: 0});
      vfs.setProviderFile(installPath, {provider, length: installSize, attrs: 0x21});
      return mounted;
    }};
  }

  async function prepareLocalizedMedia(pack, originalSize) {
    if (!pack?.audio) return null;
    const {layout, table, voices, effects: files} = pack.audio;
    if (layout.start !== originalSize || layout.blocksOffset !== 490596340) {
      throw new Error('Локализация предназначена для другой версии Install.mpq.');
    }
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, layout.headerSize, true);
    const patches = [{offset:layout.headerOffset, data:header}, {offset:layout.blocksOffset, data:await pack.read(table)}];
    const readAsset = records => {
      const byPath = new Map(records.map(record => [record.path, record]));
      return (path, offset, length) => {
        const record = byPath.get(path);
        if (!record || offset !== 0 || length !== record.bytes) throw new Error('Неверный диапазон русской дорожки.');
        return pack.read(record);
      };
    };
    let effectEnd = layout.size;
    const effects = files.map(file => {
      const effect = {...file, offset:effectEnd};
      effectEnd += file.wavBytes;
      return effect;
    });
    const create = window.WarcraftCompactAudio.create;
    const speech = create({manifest:{audioWaves:voices, virtualInstallSize:layout.size}, readAsset:readAsset(voices)});
    const sfx = create({manifest:{audioWaves:effects, virtualInstallSize:effectEnd}, readAsset:readAsset(effects), maxWaves:298});
    return {layout, patches, speech, sfx, effects};
  }

  window.WarcraftCompactPlan = Object.freeze({getPlan});
})();
