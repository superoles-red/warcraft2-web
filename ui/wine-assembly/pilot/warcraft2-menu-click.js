/* The original BNE button sound for controls implemented in the browser. */
(() => {
  'use strict';
  const authored = [
    '#warcraft-menu-navigation button', '.warcraft-session-overlay button',
    '#warcraft-demo-controls button', '#wc2-movie-pilot button',
    '#warcraft-match-settings :is(button,input[type=checkbox])',
    '#warcraft-objectives-at-start input', '.warcraft-placement-controls button',
  ].join(',');
  let samplePromise;
  function loadSample() {
    samplePromise ??= fetch('./menu-art/button-click.wav').then(response => {
      if (!response.ok) throw new Error('Warcraft II button sound did not load');
      return response.arrayBuffer();
    }).then(data => {
      // Sfx\Button.wav from the original 2.02 archive is mono 16-bit PCM.
      const wave = new DataView(data);
      if (wave.byteLength !== 5964 || wave.getUint32(36) !== 0x64617461) throw new Error('Invalid button sound');
      return Float32Array.from({length:2960}, (_, i) => wave.getInt16(44+i*2, true)/32768);
    }).catch(error => { samplePromise = null; console.warn(error); });
    return samplePromise;
  }

  function attach(wine) {
    const listener = new AbortController(), options = {signal:listener.signal};
    const buffers = new WeakMap();
    const sources = new Set();
    const gestures = new WeakSet();
    let sample;
    loadSample().then(data => sample = data);

    function stop() {
      for (const source of sources) source.stop();
    }

    function play() {
      if (document.hidden || wine.foregroundAudioBlocked?.() || !sample) return;
      const volume = window.WarcraftAssemblyMenuPolicy.effectVolume(wine);
      if (!(volume > 0)) return;
      wine.wakeAudio();
      const audio = wine._audioCtx || wine.primeAudio();
      if (!audio || audio.state === 'closed') return;
      // Keep a suspended output from replaying a backlog of menu clicks.
      if (audio.state !== 'running') stop();
      let buffer = buffers.get(audio);
      if (!buffer) {
        buffer = audio.createBuffer(1, sample.length, 22050);
        buffer.copyToChannel(sample, 0);
        buffers.set(audio, buffer);
      }
      const source = audio.createBufferSource(), gain = audio.createGain();
      source.buffer = buffer;
      gain.gain.value = volume / 100;
      source.connect(gain);
      gain.connect(audio._wineWaveBus || audio._wineMaster || audio.destination);
      sources.add(source);
      source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
      source.start();
    }
    wine.playWarcraftMenuClick = play;
    document.addEventListener('click', event => {
      const button = event.target.closest?.(authored);
      if (button && !button.disabled && !button.hasAttribute('data-warcraft-native-click')) gestures.add(event);
    }, {...options,capture:true});
    document.addEventListener('click', event => {
      if (gestures.has(event) && !event.defaultPrevented) play();
    }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, options);
    return () => {
      listener.abort();
      stop();
      if (wine.playWarcraftMenuClick === play) delete wine.playWarcraftMenuClick;
    };
  }
  window.WarcraftMenuClick = Object.freeze({attach});
})();
