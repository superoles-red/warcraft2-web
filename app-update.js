'use strict';

window.WarcraftAppUpdate = (() => {
  const workers = navigator.serviceWorker;
  const validVersion = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
  const retryKey = 'wc2-update-retry';

  async function bounded(operation, milliseconds) {
    let timeout;
    try {
      return await Promise.race([operation, new Promise(resolve => { timeout = setTimeout(resolve, milliseconds); })]);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function publishedVersion(refresh = false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const url = new URL('release.json', location.href);
      if (refresh) url.searchParams.set('check', Date.now());
      const response = await fetch(url, {
        cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
      });
      if (!response.ok) return null;
      const {version} = await response.json();
      return validVersion(version) ? version : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function retryDelay(version) {
    try {
      const record = JSON.parse(sessionStorage.getItem(retryKey));
      if (record?.version === version) return Math.max(0, record.after - Date.now());
    } catch {}
    return 0;
  }

  function deferRetry(version) {
    try { sessionStorage.setItem(retryKey, JSON.stringify({version, after: Date.now() + 60000})); }
    catch {}
  }

  function clearRetry() {
    try { sessionStorage.removeItem(retryKey); } catch {}
  }

  function request(worker, type, details = {}) {
    if (!worker) return Promise.resolve(null);
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const finish = value => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(value);
      };
      const timeout = setTimeout(() => finish(null), 5000);
      channel.port1.onmessage = ({data}) => finish(data);
      try { worker.postMessage({type, ...details}, [channel.port2]); }
      catch { finish(null); }
    });
  }

  async function status(worker = workers?.controller) {
    const report = await request(worker, 'WC2_OFFLINE_STATUS');
    return report?.ready === true && validVersion(report.version) ? report : null;
  }

  function waitForControl(worker, timeoutMs) {
    return new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timeout);
        workers.removeEventListener('controllerchange', check);
        worker?.removeEventListener('statechange', check);
        if (error) reject(error);
        else resolve(workers.controller);
      };
      const check = () => {
        if (workers.controller && (!worker || workers.controller === worker)) finish();
        else if (worker?.state === 'redundant') finish(new Error('Загрузка приложения прервалась.'));
      };
      const timeout = setTimeout(() => finish(new Error('Не удалось подготовить приложение.')), timeoutMs);
      workers.addEventListener('controllerchange', check);
      worker?.addEventListener('statechange', check);
      check();
    });
  }

  async function apply(registration, previous) {
    const waiting = registration.waiting;
    const candidate = await status(waiting);
    if (!candidate || !previous || retryDelay(candidate.version)) return;
    deferRetry(candidate.version);
    const reply = await request(waiting, 'WC2_APPLY_UPDATE', {
      version: candidate.version, previousVersion: previous.version,
    });
    if (reply?.status === 'applying' || registration.active === waiting) {
      await waitForControl(waiting, 15000).catch(() => {});
    }
  }

  return {status, waitForControl, apply, retryDelay, clearRetry, publishedVersion, bounded};
})();
