/* Mount the original game with a range-backed Install.mpq. */
(() => {
  'use strict';
  const root = 'C:\\Warcraft2';
  const installPath = root + '\\Install.mpq';
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

    return {...base, mediaId: 'warcraft2-bne-compact', async mount(vfs) {
      const mounted = await base.mount(vfs);
      await Promise.all(mounted.mounted.filter(path => /\.(dll|snp)$/i.test(path))
        .map(path => vfs.materialize(path)));
      const provider = window.byteProvider.cached({
        name: 'Install.mpq', size: virtualInstallSize,
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
          // The original media ranges are only used by the native movie hook.
          // Audio is represented by virtual WAV ranges after the original EOF.
          for (let start = Math.max(offset, archive.size); start < end;) {
            const count = Math.min(end - start, 2 * 1024 * 1024);
            const bytes = await window.WarcraftCompactAudio.read(start, count);
            if (bytes?.length !== count) throw new Error('Недоступны звуковые данные Warcraft II');
            result.set(bytes, start - offset);
            start += count;
          }
          return result;
        },
      }, {chunkSize: 64 * 1024, maxChunks: 64, readAhead: 0, prefetch: 0});
      vfs.setProviderFile(installPath, {provider, length: virtualInstallSize, attrs: 0x21});
      return mounted;
    }};
  }

  window.WarcraftCompactPlan = Object.freeze({getPlan});
})();
