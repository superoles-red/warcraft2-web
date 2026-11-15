/* Keep the original Wine sound graph and restart its output after an interruption. */
(() => {
  'use strict';
  const CHECK_MS = 450;

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
    const hidden = () => doc.hidden || leftPage;
    const blocked = () => hidden() || session?.state === 'interrupted';
    wine.pauseAudibleWhenHidden = true;
    wine.foregroundAudioBlocked = blocked;

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
      attempt.timer = page.setTimeout(finish, 1000);
      try { Promise.resolve(ac.suspend()).then(finish, finish); }
      catch (_) { finish(); }
    }

    function interrupt() {
      if (!needsSync || synced) markInterruption();
      if (hidden()) wine._maybePauseForHidden();
      suspendOutput(context);
    }

    function observe() {
      if (blocked()) {
        interrupt();
      } else if (context?.state === 'interrupted') {
        needsSync = true;
        synced = false;
      } else if (needsSync) {
        recover();
      }
    }

    function bind(next) {
      if (context === next) return;
      context?.removeEventListener('statechange', observe);
      context = next;
      synced = false;
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
        if (nudged || ac.state === 'closed') return;
        nudged = true;
        synced = false;
        suspendOutput(ac);
      }, CHECK_MS);
    }

    function recover(trusted = false) {
      const ac = context;
      if (!ac || blocked() || blurred || ac.state === 'closed' ||
          (suspension && ac.state === 'running' && !trusted)) return;
      if (ac.state === 'running') {
        checkClock(ac);
        return;
      }
      if (pending && (!trusted || pending.trusted)) return;
      clearResume();
      const attempt = {trusted};
      pending = attempt;
      resumeTimeout = page.setTimeout(clearResume, 1000);
      // A trusted release must reach resume() in the gesture handler itself.
      ac.resume().then(() => {
        if (pending !== attempt) return;
        clearResume();
        if (context === ac && !blocked()) checkClock(ac);
      }, () => {
        if (pending === attempt) clearResume();
      });
    }

    function gesture(event) {
      if (!event.isTrusted || blocked() || !needsSync) return;
      blurred = false;
      recover(true);
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
        markInterruption();
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
      bind(null);
      delete wine.pauseAudibleWhenHidden;
      delete wine.foregroundAudioBlocked;
      delete wine.bindForegroundAudio;
      delete wine.recoverForegroundAudio;
    };
  }
  const api = Object.freeze({attach, playbackSessionType, isAppleMobile});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WarcraftAudioLifecycle = api;
})();
