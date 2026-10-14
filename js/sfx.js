/* Mamarracho — efectos de sonido sintetizados con WebAudio (sin archivos). */
(function (M) {
  'use strict';
  const U = M.U;
  const S = (M.S = { muted: U.store.get('mm.mute', false) });
  let ctx = null;
  let master = null;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(c, { f = 440, f2 = null, type = 'sine', t = 0, d = 0.12, v = 0.2, a = 0.006 }) {
    const t0 = c.currentTime + t;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  }

  let noiseBuf = null;
  function noise(c, { t = 0, d = 0.2, v = 0.2, type = 'lowpass', freq = 1200, freq2 = null, q = 1 }) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const t0 = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(freq, t0);
    if (freq2) fl.frequency.exponentialRampToValueAtTime(freq2, t0 + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(fl).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + d + 0.05);
  }

  const SOUNDS = {
    click: (c) => tone(c, { f: 520, f2: 760, d: 0.07, v: 0.12, type: 'triangle' }),
    pop: (c) => tone(c, { f: 260 + Math.random() * 200, f2: 900 + Math.random() * 300, d: 0.09, v: 0.16 }),
    join: (c) => {
      tone(c, { f: 784, d: 0.1, v: 0.12, type: 'triangle' });
      tone(c, { f: 1175, t: 0.08, d: 0.16, v: 0.12, type: 'triangle' });
    },
    submit: (c) => {
      tone(c, { f: 660, d: 0.1, v: 0.14, type: 'triangle' });
      tone(c, { f: 990, t: 0.09, d: 0.18, v: 0.14, type: 'triangle' });
    },
    tick: (c) => tone(c, { f: 1300, d: 0.035, v: 0.07, type: 'square' }),
    whoosh: (c) => noise(c, { d: 0.35, v: 0.14, type: 'bandpass', freq: 500, freq2: 2600, q: 0.8 }),
    flip: (c) => noise(c, { d: 0.12, v: 0.12, type: 'highpass', freq: 1800 }),
    coin: (c) => {
      tone(c, { f: 988, d: 0.08, v: 0.07, type: 'square' });
      tone(c, { f: 1319, t: 0.07, d: 0.26, v: 0.07, type: 'square' });
    },
    gavel: (c) => {
      tone(c, { f: 150, f2: 55, d: 0.3, v: 0.5 });
      noise(c, { d: 0.09, v: 0.3, type: 'lowpass', freq: 900 });
    },
    fanfare: (c) => [523, 659, 784, 1047].forEach((f, i) => tone(c, { f, t: i * 0.09, d: 0.24, v: 0.12, type: 'triangle' })),
    drumroll: (c) => {
      for (let i = 0; i < 16; i++) noise(c, { t: i * 0.06, d: 0.07, v: 0.08 + i * 0.006, type: 'bandpass', freq: 300, q: 1.5 });
    },
    sad: (c) => {
      tone(c, { f: 392, d: 0.22, v: 0.1, type: 'sawtooth' });
      tone(c, { f: 330, t: 0.2, d: 0.22, v: 0.1, type: 'sawtooth' });
      tone(c, { f: 262, t: 0.4, d: 0.45, v: 0.1, type: 'sawtooth' });
    },
    great: (c) => [523, 784, 1047, 1568].forEach((f, i) => tone(c, { f, t: i * 0.07, d: 0.3, v: 0.11, type: 'square' })),
    win: (c) => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(c, { f, t: i * 0.1, d: 0.28, v: 0.12, type: 'triangle' })),
  };

  S.play = (name) => {
    if (S.muted) return;
    const c = ac();
    if (!c || !SOUNDS[name]) return;
    try {
      SOUNDS[name](c);
    } catch (e) { /* audio no disponible */ }
  };

  S.toggle = () => {
    S.muted = !S.muted;
    U.store.set('mm.mute', S.muted);
    if (!S.muted) S.play('click');
    return S.muted;
  };

  // Los navegadores solo dejan sonar audio después de un toque del usuario.
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', () => ac(), { once: true, capture: true });
  }
})(globalThis.M = globalThis.M || {});
