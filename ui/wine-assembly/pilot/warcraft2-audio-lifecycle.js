/* Recover Wine's sound output without restarting the original game. */
(() => {
  'use strict';
  const CHECK_MS = 450;
  const RESUME_RETRY_MS = 250;
  const RESUME_TIMEOUT_MS = 1000;
  const REPLACE_TIMEOUT_MS = 1500;

  function isAppleMobile(nav) {
    return /iPhone|iPad|iPod/.test(nav.userAgent) ||
      (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  }

  function playbackSessionType(nav) {
    // The iOS mixer honors Ring/Silent for Ambient output. Playback clocks,
    // volume settings and interruptions keep their existing behavior.
    return isAppleMobile(nav) ? 'ambient' : 'playback';
  }

  function attach(wine, page = window, doc = document, session = navigator.audioSession) {
    page.claimAudioSession?.();
    const listeners = new AbortController();
    const options = {signal:listeners.signal};
    const appleMobile = page.navigator && isAppleMobile(page.navigator);
    let context = null, pending = null, suspension = null, resumeTimeout = 0, check = 0;
    let needsSync = false, synced = false, nudged = false, leftPage = false, blurred = false;
    let restartPending = false, autoResumes = 0;
    let replaceOnInput = false, replacement = null;
    const hidden = () => doc.hidden || leftPage;
    const blocked = () => hidden() || session?.state === 'interrupted';
    wine.pauseAudibleWhenHidden = true;
    wine.foregroundAudioBlocked = blocked;
    wine.holdsForegroundAudioCursor = () => !!(appleMobile && needsSync &&
      (blocked() || pending || suspension));

    function visibleAgain() {
      blurred = false;
      if (!blocked()) recover();
    }

    function clearCheck() {
      page.clearTimeout(check);
      check = 0;
    }

    function clearResume() {
      page.clearTimeout(resumeTimeout);
      resumeTimeout = 0;
      pending = null;
    }

    function markInterruption() {
      needsSync = true;
      synced = false;
      nudged = false;
      autoResumes = 0;
      // Safari sometimes keeps a context "running" after an audio interruption.
      // A previously audible worklet still needs its output route restarted.
      restartPending = appleMobile && wine.hostCtx?._voices?._outputProgress?.()?.bytes > 0;
      clearResume();
      clearCheck();
    }

    function clearSuspension() {
      if (suspension) page.clearTimeout(suspension.timer);
      suspension = null;
    }

    function suspendOutput(ac) {
      if (!ac || suspension || ac.state !== 'running') return;
      const attempt = {};
      suspension = attempt;
      const finish = () => {
        if (suspension === attempt) clearSuspension();
        else if (ac.state !== 'suspended') return;
        if (context === ac && !blocked()) {
          // A delayed Safari suspend can finish after the page became visible.
          if (!needsSync) markInterruption();
          recover();
        }
      };
      attempt.timer = page.setTimeout(finish, RESUME_TIMEOUT_MS);
      try { Promise.resolve(ac.suspend()).then(finish, finish); }
      catch (_) { finish(); }
    }

    function interrupt() {
      cancelReplacement();
      allowReplacement();
      if (!needsSync || synced) markInterruption();
      if (hidden()) wine._maybePauseForHidden();
      suspendOutput(context);
    }

    function observe() {
      if (context?.state === 'suspended') clearSuspension();
      if (blocked()) {
        interrupt();
        return;
      }
      if (context?.state === 'interrupted') {
        allowReplacement();
        if (!needsSync || synced) markInterruption();
      }
      if (needsSync) recover();
    }

    function bind(next) {
      if (context === next) return;
      context?.removeEventListener('statechange', observe);
      context = next;
      if (next && replacement && next !== replacement.old) needsSync = false;
      synced = false;
      autoResumes = 0;
      clearResume();
      clearSuspension();
      clearCheck();
      next?.addEventListener('statechange', observe, options);
      observe();
    }

    function checkClock(ac) {
      if (check || !needsSync || blocked() || ac.state !== 'running') return;
      const voices = wine.hostCtx?._voices;
      if (!synced) {
        // Flush the old queued PCM immediately, before ordinary guest writes.
        voices?._resyncAfterResume({resetRings: true});
        synced = true;
      }
      const startedAt = ac.currentTime;
      const before = voices?._outputProgress?.();
      check = page.setTimeout(() => {
        check = 0;
        if (blocked() || context !== ac) return;
        const current = before && voices?._outputProgress?.(before.id);
        const workletStalled = current && before.node === current.node &&
          before.epoch === current.epoch && (current.bytes === null || before.bytes === current.bytes);
        if (ac.state === 'running' && ac.currentTime > startedAt+.01 && !workletStalled) {
          needsSync = false;
          return;
        }
        if (nudged || ac.state === 'closed') {
          allowReplacement();
          return;
        }
        nudged = true;
        synced = false;
        suspendOutput(ac);
      }, CHECK_MS);
    }

    function allowReplacement() {
      const voices = wine.hostCtx?._voices;
      if (appleMobile && voices?._replaceOutput && voices._outputProgress?.()) replaceOnInput = true;
    }

    function cancelReplacement() {
      if (!replacement) return;
      const {timer, abort} = replacement;
      replacement = null;
      page.clearTimeout(timer);
      abort.abort();
    }

    function replaceOutput() {
      if (replacement || !replaceOnInput || !context) return;
      replaceOnInput = false;
      const op = {old:context, abort:new AbortController()};
      replacement = op;
      op.timer = page.setTimeout(cancelReplacement, REPLACE_TIMEOUT_MS);
      // A clock that advances and an acknowledging worklet cannot report a
      // corrupt output queue below the graph. After a real interruption use
      // the next trusted release to unlock a fresh device context once. The
      // old output remains available if the new graph cannot be prepared.
      const finish = () => { if (replacement === op) cancelReplacement(); };
      try {
        Promise.resolve(wine.hostCtx?._voices?._replaceOutput(op.old, op.abort.signal)).then(finish, finish);
      } catch (_) { finish(); }
    }

    function recover(trusted = false) {
      const ac = context;
      if (!ac || blocked() || blurred || ac.state === 'closed' ||
          (suspension && ac.state === 'running')) return;
      if (ac.state === 'running') {
        clearResume();
        autoResumes = 0;
        if (restartPending) {
          restartPending = false;
          nudged = true;
          suspendOutput(ac);
          return;
        }
        checkClock(ac);
        return;
      }
      if (pending && (!trusted || pending.trusted)) return;
      if (appleMobile && !trusted && autoResumes >= 2) return;
      // A context that actually stopped needs only the direct resume path.
      restartPending = false;
      clearResume();
      const attempt = {trusted};
      pending = attempt;
      const retry = appleMobile && !trusted && ++autoResumes === 1;
      resumeTimeout = page.setTimeout(() => {
        clearResume();
        if (retry && context === ac) recover();
      }, retry ? RESUME_RETRY_MS : RESUME_TIMEOUT_MS);
      // A trusted release must reach resume() in the gesture handler itself.
      const failed = () => { if (pending === attempt && !retry) clearResume(); };
      try {
        Promise.resolve(ac.resume()).then(() => {
          if (pending !== attempt) return;
          if (context === ac && ac.state === 'running') recover();
          else failed();
        }, failed);
      } catch (_) { failed(); }
    }

    function gesture(event) {
      if (!event.isTrusted || blocked() || (!needsSync && !replaceOnInput)) return;
      blurred = false;
      if (needsSync) recover(true);
      replaceOutput();
    }

    doc.addEventListener('visibilitychange', () => hidden() ? interrupt() : visibleAgain(), options);
    page.addEventListener('pagehide', () => { leftPage = true; interrupt(); }, options);
    page.addEventListener('pageshow', () => { leftPage = false; visibleAgain(); }, options);
    page.addEventListener('focus', visibleAgain, options);
    page.addEventListener('pointerup', gesture, {...options,capture:true});
    page.addEventListener('keydown', gesture, {...options,capture:true});
    if (appleMobile) {
      page.addEventListener('blur', () => {
        blurred = true;
        if (!needsSync || synced) markInterruption();
      }, options);
      page.addEventListener('touchend', gesture, {...options,capture:true,passive:true});
    }
    session?.addEventListener('statechange', () => {
      if (blocked()) interrupt();
      else visibleAgain();
    }, options);
    wine.bindForegroundAudio = bind;
    wine.recoverForegroundAudio = () => {
      if (!needsSync) return false;
      recover();
      return true;
    };
    bind(wine._audioCtx || null);
    return () => {
      listeners.abort();
      cancelReplacement();
      bind(null);
      delete wine.pauseAudibleWhenHidden;
      delete wine.foregroundAudioBlocked;
      delete wine.holdsForegroundAudioCursor;
      delete wine.bindForegroundAudio;
      delete wine.recoverForegroundAudio;
    };
  }
  const api = Object.freeze({attach, playbackSessionType, isAppleMobile});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WarcraftAudioLifecycle = api;
})();
