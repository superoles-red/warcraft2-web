/* Browser presentation for movies selected by the original BNE callbacks. */
(() => {
  'use strict';
  const folder = 'c:\\wc2-runtime-v16\\';
  const path = suffix => folder + 'wc2-movie' + suffix + '.bin';
  const names = ['Blizzard', 'Intro_M', 'Smoke_M', 'Burn_M', 'Zepp_M', 'Turtle_M',
    'Ships_M', 'Demn_M', 'HVict_M', 'OVict_M', 'IntroX_M', 'HVicX_M', 'OrcX_M'];
  const REQUEST = 1, FINISHED = 2, SKIPPED = 3, FALLBACK = 4;
  const PLAYING = 1, ENDED = 2, UNAVAILABLE = 3, SKIP = 4, WAIT_FOR_PLAY = 5;
  const MAX_EVENTS = 64;
  const settings = document.currentScript.dataset;
  const directory = new URL('./', location.href);

  function asLocalUrl(relative) {
    const url = new URL(relative, directory);
    if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname) ||
        url.search || url.hash) throw new Error('Недопустимый адрес ролика Warcraft II');
    return url.href;
  }

  function mediaList(records) {
    if (!Array.isArray(records)) throw new Error('Список роликов Warcraft II недоступен');
    const movies = new Map();
    for (const record of records) {
      if (record?.kind && record.kind !== 'movie') continue;
      if (typeof record?.name !== 'string' && typeof record?.source !== 'string') continue;
      const name = (record.name || record.source).replace(/^smk[\\/]/i, '').toLowerCase();
      const id = names.findIndex(base => base.toLowerCase() + '.smk' === name) + 1;
      if (!id) continue;
      if (movies.has(id) || (record.nativeId != null && record.nativeId !== id) ||
          !Number.isInteger(record.width) || !Number.isInteger(record.height) ||
          record.width < 1 || record.height < 1 || record.width > 4096 || record.height > 4096) {
        throw new Error('Неверное описание ролика ' + name);
      }
      movies.set(id, record);
    }
    return movies;
  }

  function fitVideo(video, movie, width, height) {
    // Storm's fullscreen movie path doubles an axis only when it fits its
    // 640×480 plane. This is the original display size, distinct from the
    // decoded SMK/MP4 dimensions.
    const displayWidth = movie.width * (movie.width * 2 <= 640 ? 2 : 1);
    const displayHeight = movie.height * (movie.height * 2 <= 480 ? 2 : 1);
    const scale = Math.min(width / displayWidth, height / displayHeight);
    video.style.width = displayWidth * scale + 'px';
    video.style.height = displayHeight * scale + 'px';
  }

  async function prepareMedia() {
    const compact = window.WarcraftCompactAssets;
    if (compact?.manifest && typeof compact.blob === 'function') {
      const movies = mediaList(compact.manifest.media);
      if (movies.size !== names.length) throw new Error('В компактных данных отсутствуют ролики Warcraft II');
      return {movies, compact: true, source: async record => {
        const blob = await compact.blob(record.path, 'video/mp4');
        if (!(blob instanceof Blob) || blob.size !== record.bytes) throw new Error('Неверный файл ролика Warcraft II');
        return {url: URL.createObjectURL(blob), object: true};
      }};
    }
    if (settings.manifestUrl) {
      const response = await fetch(asLocalUrl(settings.manifestUrl), {redirect: 'error'});
      if (!response.ok) throw new Error('Не удалось открыть список роликов Warcraft II');
      const {movies} = await response.json();
      return {movies: mediaList(movies), compact: false,
        source: async record => ({url: asLocalUrl(record.url || record.path)})};
    }
    return {movies: new Map([[2, {width: 320, height: 288}]]), compact: false,
      source: async () => ({url: asLocalUrl('./movie-pilot/intro.mp4')})};
  }

  function attach(wine, preparedMedia) {
    const vfs = wine._helpCtx.vfs;
    const layer = document.createElement('div');
    const back = document.createElement('button');
    const arrow = document.createElement('img');
    const play = document.createElement('button');
    const events = [];
    const listener = new AbortController();
    let media, expectedToken, active, raf, sawRunning = false, destroyed = false;
    const muted = new URLSearchParams(location.search).has('movie-mute');
    layer.id = 'wc2-movie-pilot';
    layer.hidden = true;
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#000';
    back.type = 'button';
    back.setAttribute('aria-label', 'Пропустить ролик');
    back.style.cssText = 'position:absolute;bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right));width:64px;height:64px;padding:0;border:0;background:transparent';
    arrow.src = './menu-art/orc-back.png';
    arrow.alt = '';
    arrow.style.cssText = 'width:100%;height:100%;object-fit:contain';
    back.append(arrow);
    play.type = 'button';
    play.textContent = 'Воспроизвести ролик';
    play.hidden = true;
    play.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:12px 18px;font:inherit;color:#f2e6ca;background:#421e15;border:1px solid #98753d';
    layer.append(back, play);
    document.body.append(layer);

    function write(suffix, ...words) {
      const data = new Uint8Array(words.length * 4);
      const bytes = new DataView(data.buffer);
      words.forEach((value, i) => bytes.setUint32(i * 4, value, true));
      vfs.files.set(path(suffix), {data, attrs: 0x20});
    }

    function record(event, request) {
      if (events.length === MAX_EVENTS) events.shift();
      events.push({event, movieId: request.id, token: request.token, time: performance.now(),
        position: request.video.currentTime, visible: !layer.hidden});
    }

    function acknowledge(request, status) {
      if (active !== request || request.terminal) return;
      request.terminal = status === ENDED || status === UNAVAILABLE || status === SKIP;
      write('-ack', request.token, status);
    }

    function finish() {
      if (!active) return;
      const request = active;
      active = null;
      layer.hidden = play.hidden = true;
      request.video.pause();
      request.video.removeAttribute('src');
      request.video.load();
      request.video.remove();
      if (request.source?.object) URL.revokeObjectURL(request.source.url);
    }

    function resize() {
      if (active?.movie) fitVideo(active.video, active.movie, layer.clientWidth, layer.clientHeight);
    }

    function playMovie(request) {
      if (active !== request || request.terminal) return;
      request.video.play().catch(error => {
        if (active !== request || request.terminal) return;
        if (error?.name === 'NotAllowedError' && media.compact) {
          layer.hidden = play.hidden = false;
          resize();
          acknowledge(request, WAIT_FOR_PLAY);
          play.focus({preventScroll: true});
        } else {
          acknowledge(request, UNAVAILABLE);
        }
      });
    }

    async function openMovie(id, token) {
      finish();
      vfs.files.delete(path('-ack'));
      const movie = media.movies.get(id);
      const video = document.createElement('video');
      video.playsInline = true;
      video.preload = 'auto';
      video.muted = muted;
      video.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);object-fit:fill';
      const request = active = {id, token, video, movie};
      layer.prepend(video);
      record('native-request', request);
      if (!movie) return acknowledge(request, UNAVAILABLE);
      if (media.compact) acknowledge(request, WAIT_FOR_PLAY);
      video.addEventListener('loadedmetadata', () => {
        if (movie.width !== video.videoWidth || movie.height !== video.videoHeight) {
          record('mp4-dimension-mismatch', request);
          acknowledge(request, UNAVAILABLE);
        }
      });
      video.addEventListener('playing', () => {
        if (active !== request || request.terminal) { video.pause(); return; }
        play.hidden = true;
        layer.hidden = false;
        resize();
        back.focus({preventScroll: true});
        record('mp4-playing', request);
        acknowledge(request, PLAYING);
      });
      video.addEventListener('ended', () => acknowledge(request, ENDED));
      video.addEventListener('error', () => acknowledge(request, UNAVAILABLE));
      try {
        const source = await media.source(movie);
        if (active !== request || request.terminal) {
          if (source.object) URL.revokeObjectURL(source.url);
          return;
        }
        request.source = source;
        video.src = source.url;
        playMovie(request);
      } catch {
        acknowledge(request, UNAVAILABLE);
      }
    }

    function poll() {
      if (destroyed) return;
      if (wine.running) sawRunning = true;
      else if (sawRunning) { destroy(); return; }
      const data = vfs.files.get(path(''))?.data;
      if (data?.byteLength === 24) {
        const packet = new DataView(data.buffer, data.byteOffset, data.byteLength);
        if (packet.getUint32(0, true) === 0x314d4357 && packet.getUint32(4, true) === 24 &&
            packet.getUint32(20, true) === 0) {
          const token = packet.getUint32(8, true);
          const state = packet.getUint32(12, true);
          const id = packet.getUint32(16, true);
          const terminal = state === FINISHED || state === SKIPPED || state === FALLBACK;
          // While a tab is hidden, the native loop can finish a request before
          // we read it. Skip forward in this session, never accept an old ACK.
          const fresh = token && ((token - expectedToken) >>> 0) < 0x80000000;
          if (id >= 1 && id <= names.length) {
            if (fresh && (state === REQUEST || terminal)) {
              expectedToken = ((token + 1) >>> 0) || 1;
              if (state === REQUEST) openMovie(id, token);
              else finish();
            } else if (terminal && active?.token === token && active.id === id) {
              record({[FINISHED]: 'native-finished', [SKIPPED]: 'native-skipped', [FALLBACK]: 'native-fallback'}[state], active);
              finish();
            }
          }
        }
      }
      raf = requestAnimationFrame(poll);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      listener.abort();
      finish();
      vfs.files.delete(path('-arm'));
      vfs.files.delete(path('-ack'));
      vfs.files.delete(path(''));
      layer.remove();
    }

    play.addEventListener('click', () => { if (active) playMovie(active); });
    back.addEventListener('click', () => { if (active) acknowledge(active, SKIP); });
    window.addEventListener('keydown', event => {
      if (!active || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      acknowledge(active, SKIP);
    }, {capture: true, signal: listener.signal});
    window.addEventListener('pagehide', event => {
      if (!event.persisted) destroy();
    }, {signal: listener.signal});
    window.addEventListener('resize', resize, {signal: listener.signal});
    function arm(value) {
      if (destroyed || !value.movies.size) return;
      media = value;
      const mask = [...media.movies.keys()].reduce((bits, id) => bits | (1 << (id - 1)), media.compact ? 0x80000000 : 0);
      expectedToken = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
      vfs.files.delete(path(''));
      vfs.files.delete(path('-ack'));
      write('-arm', expectedToken, mask);
      raf = requestAnimationFrame(poll);
    }
    if (preparedMedia) {
      arm(preparedMedia);
    } else {
      prepareMedia().then(arm, error => console.warn(error.message));
    }
    window.WarcraftMoviePilotEvents = () => events.slice();
    return {destroy};
  }

  window.WarcraftCompressedMoviePilot = {prepareMedia, attach, bridge: {
    artifactURL: './v16-movie-pilot.dll', sha256: settings.bridgeSha,
  }};
})();
