'use strict';

const status = document.getElementById('status');
const install = document.getElementById('install');
const retry = document.getElementById('retry');
const version = document.getElementById('version');
const workers = navigator.serviceWorker;
const updates = window.WarcraftAppUpdate;
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const updateRequested = new URLSearchParams(location.search).has('wc2-update');
const iphone = document.getElementById('iphone');
let downloading = false;

function showError(error) {
  status.textContent = error.message;
  retry.hidden = false;
}

function launch() {
  const url = new URL('./game.html', location.href);
  if (new URLSearchParams(location.search).has('movie-mute')) url.searchParams.set('movie-mute', '');
  location.replace(url);
}

async function prepare() {
  if (!workers) throw new Error('Для установки нужен браузер с поддержкой офлайн-приложений.');
  if (new URLSearchParams(location.search).has('wc2-runtime-error')) {
    throw new Error('Браузер не подготовил среду игры.');
  }
  if (workers.controller && !updateRequested) {
    // The installed worker already serves the verified launcher and game.
    // Start it before any worker status query or update job.
    status.textContent = 'Запускаю Warcraft II…';
    launch();
    return;
  }
  const current = await updates.status();
  if (current) {
    status.textContent = 'Применяю обновление…';
    version.textContent = 'Версия ' + current.version;
    version.hidden = false;
    if (navigator.onLine !== false) {
      const registration = await updates.bounded(workers.getRegistration('./'), 3000);
      if (registration?.waiting) await updates.apply(registration, current);
    }
    launch();
    return;
  }

  status.textContent = 'Установи файлы игры для запуска без интернета.';
  install.hidden = false;
  iphone.hidden = standalone || !/iPhone|iPad/.test(navigator.userAgent);
}

install.addEventListener('click', async () => {
  downloading = true;
  install.hidden = true;
  iphone.hidden = true;
  status.textContent = 'Загружаю приложение…';
  navigator.storage?.persist?.().catch(() => {});
  try {
    const registration = await workers.register('./service-worker.js', {scope: './', updateViaCache: 'none'});
    const controller = await updates.waitForControl(registration.installing || registration.waiting, 300000);
    if (!await updates.status(controller)) throw new Error('Загрузка приложения прервалась.');
    launch();
  } catch (error) {
    showError(error);
  } finally {
    downloading = false;
  }
});

workers?.addEventListener('message', ({data}) => {
  if (data?.type === 'WC2_OFFLINE_PROGRESS' && downloading && data.total > 0) {
    status.textContent = 'Загружаю приложение… ' + Math.floor(100 * data.loaded / data.total) + '%';
  }
});
retry.addEventListener('click', () => {
  const url = new URL(location.href);
  url.searchParams.delete('wc2-runtime-error');
  location.replace(url);
});
prepare().catch(showError);
