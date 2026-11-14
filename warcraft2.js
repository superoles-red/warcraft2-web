(() => {
  'use strict';
  const originalExe = 'warcraft ii bne.exe';
  const originalHash = 'c3d83429aa0c2200ad3f6ac141da8ae7213a7b196d1f70d4d84a6e607bd504bd';
  const ownsPresentation = document.documentElement.classList.contains('warcraft-page');
  const autoLaunch = !!(window.WarcraftCompactPlan || window.WarcraftLocalMedia);
  let activeRun, bridgeReady;
  const panel = document.createElement('main');
  panel.id = 'war2-launch-cover';
  panel.style.cssText = [
    'position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center',
    'gap:16px;box-sizing:border-box;text-align:center;background:#161513;color:#f2e6ca',
    'padding:max(24px,env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) ' +
      'max(24px,env(safe-area-inset-bottom,0px)) max(24px,env(safe-area-inset-left,0px))',
    'font:16px system-ui,sans-serif',
  ].join(';');
  const heading = document.createElement('h1');
  heading.textContent = 'Warcraft II: Battle.net Edition';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Проверяю локальный архив игры…';
  const start = document.createElement('button');
  start.id = 'war2-pilot-start';
  start.type = 'button';
  start.textContent = 'Запустить Warcraft II';
  start.style.cssText = 'font:inherit;padding:10px 16px;justify-self:center';
  start.disabled = true;
  panel.append(heading, status);
  if (!autoLaunch) panel.append(start);
  document.body.append(panel);
  document.title = heading.textContent;

  async function waitForRuntime() {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      if (window.wineShell?.launchApp && window.wineApps?.APPS &&
          window.mediaImport?.analyze && window.mediaImport.makeAppEntry &&
          window.byteProvider?.HttpByteRangeProvider) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Среда Wine-Assembly не загрузилась');
  }

  function showError(error) {
    start.disabled = true;
    status.textContent = 'Запуск не удался. ' + (error?.message || String(error));
  }

  async function loadZipPlan(media) {
    const url = new URL('/play-game.zip', location.origin).href;
    const response = await fetch(url, {method: 'HEAD'});
    const size = Number(response.headers.get('Content-Length'));
    if (!response.ok || response.headers.get('Accept-Ranges') !== 'bytes' ||
        !Number.isSafeInteger(size) || size < 500000000) {
      throw new Error('Локальный архив Warcraft II недоступен');
    }
    const provider = new window.byteProvider.HttpByteRangeProvider(url, size, {name: 'play-game.zip'});
    return media.analyze(provider, {
      name: 'play-game.zip',
      mountOptions: {root: 'C:\\Warcraft2', unwrap: false},
    });
  }

  function activateGameAudioOnInput(wine) {
    const listeners = new AbortController();
    const resume = event => {
      if (!event.isTrusted || !wine.running ||
          (event.type !== 'keydown' && !event.target?.closest?.('#screen-wrap'))) return;
      if ((event.type === 'pointerdown' && event.pointerType !== 'mouse') ||
          (event.type === 'pointerup' && event.pointerType === 'mouse')) return;
      try {
        const context = wine._audioCtx;
        if (context?.state === 'suspended') {
          window.claimAudioSession?.();
          wine.wakeAudio();
        } else if (context?.state !== 'running') {
          wine.primeAudio();
        }
      } catch (_) {}
    };
    // Capture sees the user's gesture before the authored menus and map
    // consume it. Never wait on browser audio permission before entering BNE.
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, resume, {capture: true, passive: true, signal: listeners.signal});
    }
    return () => listeners.abort();
  }

  async function prepare(initialPage) {
    await waitForRuntime();
    const media = window.mediaImport;
    const plan = window.WarcraftCompactPlan
      ? await window.WarcraftCompactPlan.getPlan()
      : window.WarcraftLocalMedia
      ? await window.WarcraftLocalMedia.getPlan()
      : window.WarcraftAssemblyMedia
      ? await window.WarcraftAssemblyMedia.loadPlan()
      : await loadZipPlan(media);
    const candidate = plan.exeCandidates.find(entry => entry.name.toLowerCase() === originalExe);
    if (!candidate) throw new Error('В архиве не найден Warcraft II BNE.exe');

    const app = media.makeAppEntry(plan, {
      exePath: candidate.path,
      badge: 'session',
      label: 'Warcraft II: Battle.net Edition',
    });
    const readExe = app.exeBytes;
    let exeError;
    app.exeBytes = async vfs => {
      try {
        const bytes = await readExe(vfs);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const hash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
        if (hash !== originalHash) throw new Error('Контрольная сумма Warcraft II BNE.exe не совпала');
        return bytes;
      } catch (error) {
        exeError = error;
        throw error;
      }
    };
    app.args = 'title';
    // The native UI bridge and compositor read the cooperative VFS and
    // process memory. Keep this app on the verified Wine-Assembly path.
    if (ownsPresentation) app.threads = false;
    const viewport = window.WarcraftIndependentCameraPilot?.viewport ?? {width: 832, height: 608};
    const moviePilot = window.WarcraftCompressedMoviePilot;
    const movieMedia = window.WarcraftCompactPlan ? await moviePilot.prepareMedia() : undefined;
    bridgeReady ??= window.WarcraftAssemblyV16?.prepare({
      ...viewport,
      hideKeyboardHints: window.matchMedia('(pointer: coarse)').matches,
      ...moviePilot?.bridge,
    });
    const installBridge = await bridgeReady;

    async function launch() {
      start.disabled = true;
      let imageLoaded = false;
      let titlePrepared;
      const firstTitle = ownsPresentation && new Promise(resolve => { titlePrepared = resolve; });
      const shell = window.wineShell;
      const previous = activeRun;
      if (previous) {
        const running = shell.runningApps.find(entry => entry.wine === previous.wine);
        if (!running || shell.runningApps.length !== 1 || window.WarcraftUiBridge.state().inGame) {
          throw new Error('Язык можно переключить в главном меню');
        }
        await previous.wine._flushVfsOverlay?.('language switch');
        app._sessionOverlayStore = previous.app._sessionOverlayStore;
        previous.dispose();
        previous.wine.stop({repaint: false, releaseNow: true});
        activeRun = null;
        if (previous.wine.memory) throw new Error('Старая сессия Warcraft II ещё завершается');
      }

      let releaseAudio, releaseV16, movie;
      function dispose() {
        releaseAudio?.();
        releaseV16?.();
        movie?.destroy();
        releaseAudio = releaseV16 = movie = null;
      }
      window.wineApps.APPS[plan.id] = app;
      await shell.launchApp(plan.id, {hidden: ownsPresentation, onExit: dispose, async beforeRun(wine) {
        if (autoLaunch) releaseAudio = activateGameAudioOnInput(wine);
        if (installBridge) {
          await installBridge(wine);
          await window.WarcraftAssemblyMenuPolicy?.install(wine);
          window.WarcraftMatchPreferences?.install(wine);
          releaseV16 = window.attachWarcraftAssemblyV16(wine, shell.renderer,
            {onTitlePrepared: titlePrepared, initialPage});
          movie = moviePilot?.attach(wine, movieMedia);
        }
        if (window.WarcraftCompactPlan) activeRun = {app, wine, dispose};
        imageLoaded = true;
      }});
      // The upstream shell handles its own boot errors and may resolve on failure.
      if (exeError) throw exeError;
      if (!imageLoaded || !shell.runningApps.some(entry => entry.name === plan.id)) {
        throw new Error('Среда не запустила оригинальную программу');
      }
      if (firstTitle) {
        let timer;
        try {
          await Promise.race([firstTitle, new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Главное меню Warcraft II не появилось')), 30000);
          })]);
        } finally {
          clearTimeout(timer);
        }
      }
      panel.remove();
    }

    if (autoLaunch) {
      if (!initialPage) status.textContent = 'Запускаю игру…';
      return launch();
    }
    start.addEventListener('click', () => launch().catch(showError), {once: true});
    status.textContent = 'Локальный архив готов к запуску.';
    start.disabled = false;
  }

  async function prepareLocal() {
    const local = window.WarcraftLocalMedia;
    if (await local.installed()) return prepare();
    status.textContent = 'Выбери ZIP с оригинальной Warcraft II Battle.net Edition.';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.setAttribute('aria-label', 'Архив Warcraft II');
    panel.append(input);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      input.disabled = true;
      try {
        navigator.storage?.persist?.().catch(() => {});
        await local.install(file, ({loaded, total}) => {
          status.textContent = 'Копирую игру на устройство… ' + Math.floor(100 * loaded / total) + '%';
        });
      } catch (error) {
        input.value = '';
        input.disabled = false;
        status.textContent = error.message;
        return;
      }
      input.remove();
      await prepare().catch(showError);
    });
  }

  async function prepareCompact() {
    const local = window.WarcraftCompactAssets;
    await local.ensureInstalled(({loaded, total}) => {
      status.textContent = 'Скачиваю игру для запуска без интернета… ' +
        Math.floor(100 * loaded / total) + '%';
    });
    await prepare();
    window.WarcraftCompactLanguage?.setRestart(async page => {
      status.textContent = window.WarcraftLanguage.current() === 'ru' ? 'Переключаю язык…' : 'Switching language…';
      panel.style.background = '#161513 url("./menu-art/orc-texture.png") center / cover';
      document.body.append(panel);
      await prepare(page);
    });
  }

  if (window.WarcraftCompactPlan) {
    prepareCompact().catch(error => {
      showError(error);
      const retry = document.createElement('a');
      retry.href = location.href;
      retry.textContent = 'Повторить запуск';
      retry.style.color = 'inherit';
      panel.append(retry);
    });
  } else {
    (window.WarcraftLocalMedia ? prepareLocal() : prepare()).catch(showError);
  }
})();
