/* FIFO input transport only. Native BNE decides hits, selection and orders. */
(function (global) {
  'use strict';
  const MAX_QUEUE = 256, TIMEOUT_MS = 750, POLL_MS = 4;
  const BARRIER = Object.freeze({barrier: true});

  function createInputFence(options) {
    const {send, readAck} = options || {};
    if (typeof send !== 'function' || typeof readAck !== 'function')
      throw new TypeError('Input fence requires send and readAck callbacks');
    const schedule = options.schedule || ((fn, ms) => global.setTimeout(fn, ms));
    const clearSchedule = options.clearSchedule || (id => global.clearTimeout(id));
    const now = options.now || (() => Date.now());
    const onError = options.onError || (() => {});
    for (const callback of [schedule, clearSchedule, now, onError])
      if (typeof callback !== 'function') throw new TypeError('Invalid input fence callback');
    let queue = [], waiting = null, timer = null, draining = false;
    let faulted = false, destroyed = false, epoch = 0, cancelCount = 0;
    const validSequence = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
    const validAck = ack => ack && validSequence(ack.sequence) &&
      Number.isInteger(ack.status) && ack.status >= 1 && ack.status <= 3;

    function stopTimer() {
      if (timer !== null) {
        const id = timer; timer = null;
        try { clearSchedule(id); } catch (_) { /* The epoch check rejects stale callbacks. */ }
      }
    }
    function fail(reason, cause) {
      queue.length = 0;
      const first = !faulted;
      faulted = true;
      if (first) {
        const error = new Error('Input fence: ' + reason);
        error.code = reason;
        if (cause !== undefined) error.cause = cause;
        try { onError(error); } catch (_) { /* Never replay input after a release callback fails. */ }
      }
    }
    function clock() {
      const value = now();
      if (!Number.isFinite(value)) throw new TypeError('Input fence clock is not finite');
      return value;
    }
    function pollLater() {
      if (!waiting || destroyed || timer !== null) return;
      const token = waiting.epoch;
      try {
        timer = schedule(() => {
          timer = null;
          if (!waiting || destroyed || waiting.epoch !== token) return;
          poll();
        }, POLL_MS);
      } catch (error) { fail('schedule-failed', error); }
    }
    function poll() {
      if (!waiting || destroyed) return;
      try {
        // Once timed out, queued and new input stays dropped until the old native
        // request acknowledges. Starting another F5 before that would alias ACKs.
        if (!faulted && clock() - waiting.started >= TIMEOUT_MS) fail('timeout');
        const ack = readAck();
        if (validAck(ack) && ack.sequence !== waiting.baseline) {
          waiting = null;
          faulted = false;
          drain();
          return;
        }
      } catch (error) { fail('ack-failed', error); }
      pollLater();
    }
    function drain() {
      if (draining || waiting || faulted || destroyed) return;
      draining = true;
      try {
        while (queue.length && !waiting && !faulted && !destroyed) {
          const action = queue.shift();
          if (action === BARRIER) {
            let baseline, started;
            try {
              const ack = readAck();
              baseline = validSequence(ack?.sequence) ? ack.sequence : 0;
              started = clock();
            } catch (error) { fail('ack-failed', error); break; }
            waiting = {baseline, started, epoch: ++epoch};
            try { send({type: 'clearEmpty'}); }
            catch (error) { fail('send-failed', error); }
            pollLater();
          } else {
            try { send(action); }
            catch (error) { fail('send-failed', error); }
          }
        }
      } finally { draining = false; }
    }
    function enqueue(action) {
      if (destroyed || faulted) return false;
      const last = queue[queue.length - 1];
      if (action !== BARRIER && action?.type === 'move' &&
          last !== BARRIER && last?.type === 'move') queue[queue.length - 1] = action;
      else {
        if (queue.length >= MAX_QUEUE) { fail('queue-overflow'); return false; }
        queue.push(action);
      }
      drain();
      return !faulted;
    }
    return {
      dispatch(action) { return enqueue(action); },
      dispatchNow(action) {
        if (draining || waiting || queue.length || faulted || destroyed) return false;
        draining = true;
        try { return send(action) !== false; }
        catch (error) { fail('send-failed', error); return false; }
        finally { draining = false; drain(); }
      },
      barrier() { return enqueue(BARRIER); },
      cancel() {
        queue.length = 0; cancelCount++;
        // Keep the current request and poll alive. New inputs wait behind its
        // ACK, so an old completion cannot release a newer barrier by mistake.
      },
      destroy() {
        queue.length = 0; destroyed = true; epoch++; waiting = null; stopTimer();
      },
      debug() {
        let elapsedMs = 0;
        if (waiting) { try { elapsedMs = Math.max(0, clock() - waiting.started); } catch (_) {} }
        return {waiting: !!waiting, queueLength: queue.length, epoch,
          baselineAckSequence: waiting?.baseline ?? null, elapsedMs,
          faulted, destroyed, cancelCount};
      }
    };
  }
  const exported = {createInputFence};
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else global.WarcraftInputFence = exported;
})(typeof window !== 'undefined' ? window : globalThis);
