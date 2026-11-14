(() => {
  'use strict';
  const originalExe = 'warcraft ii bne.exe';
  const originalHash = 'c3d83429aa0c2200ad3f6ac141da8ae7213a7b196d1f70d4d84a6e607bd504bd';
  const ownsPresentation = document.documentElement.classList.contains('warcraft-page');
  const panel = document.createElement('main');
  panel.id = 'war2-launch-cover';
  panel.style.cssText = [
    'position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center',
    'gap:16px;padding:24px;text-align:center;background:#161513;color:#f2e6ca',
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
  panel.append(heading, status, start);
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

  async function prepare() {
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
    window.wineApps.APPS[plan.id] = app;
    const viewport = window.WarcraftIndependentCameraPilot?.viewport ?? {width: 832, height: 608};
    const moviePilot = window.WarcraftCompressedMoviePilot;
    const movieMedia = window.WarcraftCompactPlan ? await moviePilot.prepareMedia() : undefined;
    const installBridge = window.WarcraftAssemblyV16 && await window.WarcraftAssemblyV16.prepare({
      ...viewport,
      sha256: 'b1ad7afb19b88bd680536ba7ebbfcf9cf39e76127b25aa65990f4bf9fd57a311',
      ...moviePilot?.bridge,
    });

    start.addEventListener('click', async () => {
      start.disabled = true;
      status.textContent = 'Запускаю игру…';
      let imageLoaded = false;
      let titlePrepared;
      const firstTitle = ownsPresentation && new Promise(resolve => { titlePrepared = resolve; });
      try {
        const shell = window.wineShell;
        await shell.launchApp(plan.id, {hidden: ownsPresentation, async beforeRun(wine) {
          if (installBridge) {
            await installBridge(wine);
            await window.WarcraftAssemblyMenuPolicy?.install(wine);
            window.attachWarcraftAssemblyV16(wine, shell.renderer, {onTitlePrepared: titlePrepared});
            moviePilot?.attach(wine, movieMedia);
          }
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
      } catch (error) {
        showError(error);
      }
    }, {once: true});
    status.textContent = 'Локальный архив готов к запуску.';
    start.disabled = false;
  }

  async function prepareLocal() {
    const local = window.WarcraftLocalMedia;
    if (await local.installed()) return prepare();
    status.textContent = 'Выбери ZIP с оригинальной Warcraft II Battle.net Edition.';
    start.hidden = true;
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
        input.remove();
        start.hidden = false;
        await prepare();
      } catch (error) {
        input.value = '';
        input.disabled = false;
        status.textContent = error.message;
      }
    });
  }

  async function prepareCompact() {
    const local = window.WarcraftCompactAssets;
    await local.ensureInstalled(({loaded, total}) => {
      status.textContent = 'Скачиваю игру для запуска без интернета… ' +
        Math.floor(100 * loaded / total) + '%';
    });
    await prepare();
  }

  if (window.WarcraftCompactPlan) {
    prepareCompact().catch(error => {
      showError(error);
      start.hidden = true;
      const retry = document.createElement('a');
      retry.href = location.href;
      retry.textContent = 'Продолжить загрузку';
      retry.style.color = 'inherit';
      panel.append(retry);
    });
  } else {
    (window.WarcraftLocalMedia ? prepareLocal() : prepare()).catch(showError);
  }
})();
