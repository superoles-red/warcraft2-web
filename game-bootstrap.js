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
  watchForGameUpdate();
}

async function watchForGameUpdate() {
  const registration = await workers.getRegistration('./').catch(() => null);
  if (!registration) return;
  const initial = await window.WarcraftAppUpdate.status();
  const launchedVersion = initial?.clientVersion || initial?.version;
  let pending = null, check = null, restarting = false, lastCheck = -Infinity, retryTimer;

  function onMainMenu() {
    const title = document.querySelector('#screen-canvas-stack[data-warcraft-presentation="menu"]' +
      '[data-warcraft-mode="title"]:not([data-warcraft-transition])');
    return !document.hidden && title?.querySelector('#warcraft-menu-navigation:not([hidden]) ' +
      'button[data-warcraft-menu-action="single"]:not([disabled])') &&
      !document.getElementById('war2-launch-cover') && !document.querySelector('#wc2-movie-pilot:not([hidden])');
  }

  function restartAtMenu() {
    if (restarting || !pending || navigator.onLine === false || !onMainMenu()) return;
    const delay = window.WarcraftAppUpdate.retryDelay(pending);
    if (delay > 0) {
      if (retryTimer === undefined) retryTimer = setTimeout(() => {
        retryTimer = undefined;
        inspect();
      }, delay);
      return;
    }
    restarting = true;
    launcherURL.searchParams.set('wc2-update', '');
    location.replace(launcherURL);
  }

  async function inspect() {
    const [active, waiting] = await Promise.all([
      window.WarcraftAppUpdate.status(),
      window.WarcraftAppUpdate.status(registration.waiting || null),
    ]);
    pending = waiting?.version || (launchedVersion && active && active.version !== launchedVersion ? active.version : null);
    restartAtMenu();
  }

  function checkOnline() {
    restartAtMenu();
    if (document.hidden || navigator.onLine === false || check || performance.now() - lastCheck < 5000) return;
    lastCheck = performance.now();
    check = registration.update().catch(() => {}).then(inspect).finally(() => { check = null; });
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
        'data-warcraft-menu-action', 'hidden', 'disabled']});
    observeMovie();
    restartAtMenu();
  }

  registration.addEventListener('updatefound', observeInstall);
  observeInstall();
  workers.addEventListener('controllerchange', inspect);
  for (const event of ['online', 'focus', 'pageshow']) window.addEventListener(event, checkOnline);
  document.addEventListener('visibilitychange', checkOnline);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeMenu, {once: true});
  else observeMenu();
  inspect();
  checkOnline();
}
