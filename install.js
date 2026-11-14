'use strict';

const status = document.getElementById('status');
const openGame = document.getElementById('open');
const retry = document.getElementById('retry');
const workers = navigator.serviceWorker;
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const compact = document.documentElement.hasAttribute('data-compact');
document.getElementById('iphone').hidden = standalone || !/iPhone|iPad/.test(navigator.userAgent);
retry.addEventListener('click', () => location.reload());

function checkPackage(worker) {
  return new Promise(resolve => {
    if (!worker) return resolve(false);
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); resolve(false); }, 5000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data.ready === true);
    };
    worker.postMessage({type: 'WC2_OFFLINE_STATUS'}, [channel.port2]);
  });
}

async function prepare() {
  if (!workers) throw Error('Для установки нужен браузер с поддержкой офлайн-приложений.');
  const errorText = 'Загрузка прервалась. Подключись к интернету и повтори.';
  const reportReady = async () => {
    if (!await checkPackage(workers.controller)) return false;
    status.textContent = compact ? 'При первом запуске игра скачает данные для работы без интернета.'
      : 'Приложение готово. Игровой архив выбирается один раз.';
    openGame.hidden = false;
    retry.hidden = true;
    return true;
  };

  workers.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'WC2_OFFLINE_PROGRESS' && openGame.hidden && message.total > 0) {
      status.textContent = 'Загружаю приложение… ' + Math.floor(100 * message.loaded / message.total) + '%';
    }
  });
  workers.addEventListener('controllerchange', () => reportReady());
  const oldPackageReady = await reportReady();
  let registration;
  try {
    registration = await workers.register('./service-worker.js', {scope: './', updateViaCache: 'none'});
  } catch {
    if (!oldPackageReady) throw Error(errorText);
    return;
  }

  const watch = worker => worker?.addEventListener('statechange', async () => {
    if (worker.state === 'redundant' && openGame.hidden && !await reportReady()) showError(errorText);
    if (worker.state === 'installed' && !openGame.hidden && registration.waiting) {
      status.textContent = 'Обновление загружено. Оно применится после закрытия игры.';
    }
  });
  registration.addEventListener('updatefound', () => watch(registration.installing));
  watch(registration.installing);
  if (oldPackageReady && !registration.installing && !registration.waiting) {
    registration.update().catch(() => {});
  }
  if (!await reportReady() && !registration.installing && !registration.active) showError(errorText);
}

function showError(message) {
  status.textContent = message;
  retry.hidden = false;
}

prepare().catch(error => showError(error.message));
