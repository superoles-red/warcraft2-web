/* Keep the original Wine sound graph and restart its output after an interruption. */
(() => {
  'use strict';
  const CHECK_MS = 450;

  function playbackSessionType(nav) {
    const appleMobile = /iPhone|iPad|iPod/.test(nav.userAgent) ||
      (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    // The iOS mixer honors Ring/Silent for Ambient output. Playback clocks,
    // volume settings and interruptions keep their existing behavior.
    return appleMobile ? 'ambient' : 'playback';
  }

  function attach(wine, page = window, doc = document, session = navigator.audioSession) {
    page.claimAudioSession?.();
    const listeners = new AbortController();
    const options = {signal:listeners.signal};
    let context = null, pending = null, resumeTimeout = 0, check = 0;
    let needsSync = false, synced = false, nudged = false, leftPage = false;
    const hidden = () => doc.hidden || leftPage;
    const blocked = () => hidden() || session?.state === 'interrupted';
    wine.pauseAudibleWhenHidden = true;
    wine.foregroundAudioBlocked = blocked;

    function visibleAgain() {
      if (!blocked()) {
        nudged = false;
        recover();
      }
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

    function interrupt() {
      needsSync = true;
      synced = false;
      clearResume();
      clearCheck();
      if (hidden()) wine._maybePauseForHidden();
      if (context?.state === 'running') context.suspend().catch(() => {});
    }

    function observe() {
      if (blocked()) {
        interrupt();
      } else if (context?.state === 'interrupted') {
        needsSync = true;
        synced = false;
      } else if (needsSync && context?.state === 'running') {
        recover();
      }
    }

    function bind(next) {
      if (context === next) return;
      context?.removeEventListener('statechange', observe);
      context = next;
      synced = false;
      clearResume();
      clearCheck();
      next?.addEventListener('statechange', observe, options);
      observe();
    }

    function checkClock(ac) {
      if (check || !needsSync || blocked() || ac.state !== 'running') return;
      if (!synced) {
        // Flush the old queued PCM immediately, before ordinary guest writes.
        wine.hostCtx?._voices?._resyncAfterResume();
        synced = true;
      }
      const startedAt = ac.currentTime;
      const voices = wine.hostCtx?._voices;
      const before = voices?._outputProgress?.();
      check = page.setTimeout(() => {
        check = 0;
        if (blocked() || context !== ac) return;
        const current = voices?._outputProgress?.();
        const workletStalled = before && current && before.id === current.id &&
          before.epoch === current.epoch && before.bytes === current.bytes;
        if (ac.state === 'running' && ac.currentTime > startedAt+.01 && !workletStalled) {
          needsSync = false;
          return;
        }
        if (nudged || ac.state === 'closed') return;
        nudged = true;
        ac.suspend().then(() => {
          if (context === ac && !blocked()) recover();
        }, () => {});
      }, CHECK_MS);
    }

    function recover(trusted = false) {
      const ac = context;
      if (!ac || blocked() || ac.state === 'closed') return;
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
      nudged = false;
      recover(true);
    }

    doc.addEventListener('visibilitychange', () => hidden() ? interrupt() : visibleAgain(), options);
    page.addEventListener('pagehide', () => { leftPage = true; interrupt(); }, options);
    page.addEventListener('pageshow', () => { leftPage = false; visibleAgain(); }, options);
    page.addEventListener('focus', visibleAgain, options);
    page.addEventListener('pointerup', gesture, {...options,capture:true});
    page.addEventListener('keydown', gesture, {...options,capture:true});
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
  const api = Object.freeze({attach, playbackSessionType});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.WarcraftAudioLifecycle = api;
})();
