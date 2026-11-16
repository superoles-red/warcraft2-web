'use strict';

// The original compositor selects its drawing ABI from these parameters.
const gameURL = new URL(location.href);
const movieMute = gameURL.searchParams.has('movie-mute');
const launcherURL = new URL('./', gameURL);
if (movieMute) launcherURL.searchParams.set('movie-mute', '');
gameURL.search = 'warcraft2&bridge=v16&view=map&camera=independent';
if (movieMute) gameURL.searchParams.set('movie-mute', '');
history.replaceState(history.state, '', gameURL);
const workers = navigator.serviceWorker;
if (!workers?.controller) {
  location.replace(launcherURL);
} else if (!crossOriginIsolated) {
  launcherURL.searchParams.set('wc2-runtime-error', '');
  location.replace(launcherURL);
} else {
  let monitor;
  const startMonitor = () => monitor ||= watchForGameUpdate();
  window.WarcraftGameUpdate = Object.freeze({
    async check() {
      const checkOnline = await startMonitor();
      return checkOnline ? checkOnline(true) : 'failed';
    },
  });
  const observe = () => {
    const frame = document.getElementById('screen-canvas-stack');
    if (!frame) return;
    const checkTitle = () => {
      if (!mainMenuReady()) return;
      titleObserver.disconnect();
      void startMonitor();
    };
    const titleObserver = new MutationObserver(checkTitle);
    titleObserver.observe(frame, {attributes: true, childList: true, subtree: true,
      attributeFilter: ['data-warcraft-presentation', 'data-warcraft-mode', 'data-warcraft-transition',
        'data-warcraft-menu-home', 'hidden', 'disabled']});
    // The launch cover is removed outside the canvas stack.
    titleObserver.observe(document.body, {childList: true});
    checkTitle();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, {once:true});
  else observe();
}

function mainMenuReady() {
  const title = document.querySelector('#screen-canvas-stack[data-warcraft-presentation="menu"]' +
    '[data-warcraft-mode="title"]:not([data-warcraft-transition])');
  return title?.querySelector('#warcraft-menu-navigation[data-warcraft-menu-home]:not([hidden]) ' +
    'button:not([disabled])') && !title.querySelector('.warcraft-session-overlay:not([hidden])') &&
    !document.getElementById('war2-launch-cover') && !document.querySelector('#wc2-movie-pilot:not([hidden])');
}

async function watchForGameUpdate() {
  const registration = await workers.getRegistration('./').catch(() => null);
  if (!registration) return;
  const updates = window.WarcraftAppUpdate;
  const initial = await updates.status();
  const launchedVersion = initial?.clientVersion || initial?.version;
  let activeVersion = initial?.version, pending = null, check = null, restarting = false, lastCheck = -Infinity;
  let retryTimer, refreshTimer;

  function restartAtMenu(force = false) {
    if (restarting || !pending || document.hidden || navigator.onLine === false || !mainMenuReady()) return;
    const delay = updates.retryDelay(pending);
    if (delay > 0 && !force) {
      if (retryTimer === undefined) retryTimer = setTimeout(() => {
        retryTimer = undefined;
        inspect();
      }, delay);
      return;
    }
    if (force) updates.clearRetry();
    restarting = true;
    launcherURL.searchParams.set('wc2-update', '');
    location.replace(launcherURL);
  }

  async function inspect() {
    const [active, waiting] = await Promise.all([
      updates.status(),
      updates.status(registration.waiting || null),
    ]);
    if (active) activeVersion = active.version;
    pending = waiting && waiting.version !== activeVersion ? waiting.version :
      (launchedVersion && active && active.version !== launchedVersion ? active.version : null);
    restartAtMenu();
  }

  function waitForInstall(worker) {
    if (!worker) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timeout);
        worker.removeEventListener('statechange', changed);
        resolve();
      };
      const changed = () => {
        if (worker.state !== 'installing' && worker.state !== 'parsed') finish();
      };
      const timeout = setTimeout(finish, 45000);
      worker.addEventListener('statechange', changed);
      changed();
    });
  }

  async function checkRelease(manual) {
    const remote = await updates.publishedVersion(manual);
    if (!remote) return 'unreachable';
    if (remote !== activeVersion && !registration.installing && !(registration.waiting && pending === remote)) {
      // Fetch this release's worker even if the browser defers a soft update.
      await updates.bounded(workers.register('./service-worker.js?v=' + remote,
        {scope:'./', updateViaCache:'none'}), 8000);
    }
    await waitForInstall(registration.installing);
    await inspect();
    if (pending) return 'ready';
    if (activeVersion === remote) return 'current';
    return registration.installing ? 'downloading' : 'failed';
  }

  async function checkOnline(manual = false) {
    manual = manual === true;
    if (manual && check) await check;
    restartAtMenu(manual);
    if (restarting) return 'applying';
    if (document.hidden || navigator.onLine === false) return 'unreachable';
    if (!check && (manual || performance.now() - lastCheck >= 5000)) {
      lastCheck = performance.now();
      check = checkRelease(manual).catch(() => 'failed').finally(() => { check = null; });
    }
    const result = await check;
    restartAtMenu(manual);
    return restarting ? 'applying' : result;
  }

  function refreshWhileVisible() {
    clearInterval(refreshTimer);
    if (document.hidden) return;
    checkOnline();
    // A VPN route can recover without an online, focus or visibility event.
    refreshTimer = setInterval(checkOnline, 60_000);
  }

  function observeInstall() {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') inspect();
    });
  }

  function observeMenu() {
    const frame = document.getElementById('screen-canvas-stack');
    if (!frame) return;
    const observeMovie = () => {
      const movie = document.getElementById('wc2-movie-pilot');
      if (movie) observer.observe(movie, {attributes: true, attributeFilter: ['hidden']});
    };
    const observer = new MutationObserver(() => {
      observeMovie();
      restartAtMenu();
    });
    observer.observe(document.body, {childList: true});
    observer.observe(frame, {attributes: true, childList: true, subtree: true,
      attributeFilter: ['data-warcraft-presentation', 'data-warcraft-mode', 'data-warcraft-transition',
        'data-warcraft-menu-home', 'hidden', 'disabled']});
    observeMovie();
    restartAtMenu();
  }

  registration.addEventListener('updatefound', observeInstall);
  observeInstall();
  workers.addEventListener('controllerchange', inspect);
  for (const event of ['online', 'focus']) window.addEventListener(event, checkOnline);
  window.addEventListener('pageshow', refreshWhileVisible);
  window.addEventListener('pagehide', () => {
    clearInterval(refreshTimer);
    clearTimeout(retryTimer);
    retryTimer = undefined;
  });
  document.addEventListener('visibilitychange', refreshWhileVisible);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeMenu, {once: true});
  else observeMenu();
  inspect();
  refreshWhileVisible();
  return checkOnline;
}
