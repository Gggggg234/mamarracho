/* Mamarracho — piezas de interfaz compartidas. */
(function (M) {
  'use strict';
  const { U, D, S } = M;
  const { h } = U;
  const UI = (M.UI = {});

  // ---------- Avatares ----------
  UI.avatar = function (p, size, tag) {
    const el = h((tag || 'span') + '.av', { class: size ? 'av-' + size : '' });
    if (tag === 'button') el.type = 'button';
    UI.setAvatar(el, p);
    return el;
  };
  UI.setAvatar = function (el, p) {
    p = p || {};
    el.textContent = p.avatar || '❓';
    el.style.setProperty('--av', p.color || '#FFE14A');
    el.classList.toggle('off', p.online === false);
  };

  // Nombre + avatar en línea.
  UI.who = function (p, size) {
    return h('span.who', UI.avatar(p, size || 's'), h('span.who-name', (p && p.name) || 'Alguien'));
  };

  // ---------- Logo ----------
  const LOGO_COLORS = ['#FFE14A', '#FF5C9D', '#3D7BFF', '#22C07A', '#FF8A2A'];
  UI.logo = function (cls) {
    const letters = 'MAMARRACHO'.split('');
    return h('h1.logo.boil', { class: cls || '', 'aria-label': 'Mamarracho' },
      letters.map((ch, i) => h('span', {
        'aria-hidden': 'true',
        style: { '--c': LOGO_COLORS[i % LOGO_COLORS.length], '--r': ((i % 2 ? 1 : -1) * (2 + (i % 3))) + 'deg', '--d': (i * 0.07) + 's' },
      }, ch)));
  };

  // Efecto "línea hervida" de dibujo animado: alterna tres filtros SVG.
  let boilI = 0;
  setInterval(() => {
    if (U.reducedMotion() || document.hidden) return;
    boilI = (boilI + 1) % 3;
    for (const el of document.querySelectorAll('.boil')) el.style.filter = 'url(#boil-' + boilI + ')';
  }, 160);

  // ---------- Mascota: Don Lápiz, el rematador ----------
  UI.mascot = function (withGavel) {
    const gavel = withGavel
      ? '<g class="m-gavel"><path d="M118 112 q16 2 24 -10" fill="none" stroke="#1E1B3A" stroke-width="5" stroke-linecap="round"/>' +
        '<g transform="translate(144 100) rotate(-28)"><rect x="-4" y="-34" width="8" height="40" rx="3" fill="#8B5A2B" stroke="#1E1B3A" stroke-width="3.5"/>' +
        '<rect x="-17" y="-52" width="34" height="19" rx="5" fill="#B5763A" stroke="#1E1B3A" stroke-width="3.5"/></g></g>'
      : '';
    return h('div.mascot', {
      html:
        '<svg viewBox="0 0 170 214" aria-hidden="true">' +
        '<g stroke="#1E1B3A" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
        '<path d="M40 150 L120 150 L80 204 Z" fill="#F2C9A0"/>' +
        '<path d="M69 189 L91 189 L80 204 Z" fill="#1E1B3A"/>' +
        '<rect x="40" y="56" width="80" height="96" rx="7" fill="#FFD23F"/>' +
        '<path d="M66 60 V148 M94 60 V148" stroke="#E0A800" stroke-width="3"/>' +
        '<circle cx="65" cy="90" r="9" fill="#fff"/><circle cx="95" cy="90" r="9" fill="#fff"/>' +
        '<circle class="m-eye" cx="67" cy="92" r="3.6" fill="#1E1B3A" stroke="none"/><circle class="m-eye" cx="97" cy="92" r="3.6" fill="#1E1B3A" stroke="none"/>' +
        '<circle cx="95" cy="90" r="13.5" fill="none" stroke-width="3"/>' +
        '<path d="M108.5 92 q9 14 2 32" fill="none" stroke-width="2"/>' +
        '<path d="M60 113 q10 -10 20 0 q10 -10 20 0 q-5 9 -20 3 q-15 6 -20 -3 z" fill="#8B5A2B"/>' +
        '<path d="M71 125 q9 7 18 0" fill="none" stroke-width="3"/>' +
        '<rect x="28" y="48" width="104" height="12" rx="6" fill="#1E1B3A"/>' +
        '<rect x="50" y="6" width="60" height="46" rx="5" fill="#1E1B3A"/>' +
        '<rect x="50" y="35" width="60" height="9" fill="#E63946" stroke="none"/>' +
        '</g>' + gavel + '</svg>',
    });
  };

  // ---------- Avisos ----------
  UI.toast = function (text, kind, ms) {
    const box = U.$('#toasts');
    if (!box) return;
    const t = h('div.toast', { class: kind ? 'toast-' + kind : '', role: kind === 'error' ? 'alert' : 'status' }, text);
    box.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, ms || 2800);
  };

  UI.busy = function (text) {
    const o = U.$('#busy');
    if (!o) return;
    if (!text) {
      o.hidden = true;
      return;
    }
    U.$('#busy-text').textContent = text;
    o.hidden = false;
  };

  // Ventana de confirmación propia (no usamos confirm() del navegador).
  UI.choose = function ({ title, text, buttons }) {
    return new Promise((resolve) => {
      const layer = h('div.modal-layer', { role: 'dialog', 'aria-modal': 'true' });
      const close = (v) => {
        layer.remove();
        document.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
      };
      const card = h('div.modal.card',
        h('h2', title),
        text ? h('p', text) : null,
        h('div.modal-btns', buttons.map((b) => h('button.btn', { type: 'button', class: b.cls || '', on: { click: () => close(b.value) } }, b.label))));
      layer.appendChild(card);
      layer.addEventListener('click', (e) => {
        if (e.target === layer) close(null);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(layer);
      const first = card.querySelector('button');
      if (first) first.focus();
    });
  };

  // ---------- Emojis que vuelan ----------
  UI.floatEmoji = function (e, anchor) {
    const fx = U.$('#fx');
    if (!fx || U.reducedMotion()) return;
    let x = 20 + Math.random() * 60;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      x = ((r.left + r.width * (0.2 + Math.random() * 0.6)) / window.innerWidth) * 100;
    }
    const el = h('span.float-emoji', { style: { left: x + 'vw', '--dx': (Math.random() * 80 - 40) + 'px', '--rot': (Math.random() * 50 - 25) + 'deg' } }, e);
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  };

  // ---------- Confeti ----------
  UI.confetti = function (ms) {
    if (U.reducedMotion()) return;
    const c = U.$('#confetti');
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    c.hidden = false;
    const colors = ['#FFE14A', '#FF5C9D', '#3D7BFF', '#22C07A', '#FF8A2A', '#1E1B3A'];
    const parts = Array.from({ length: 140 }, () => ({
      x: Math.random() * c.width, y: -Math.random() * c.height * 0.6, w: (6 + Math.random() * 8) * dpr, hh: (8 + Math.random() * 10) * dpr,
      vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      col: colors[U.rand(colors.length)],
    }));
    const end = performance.now() + (ms || 3500);
    function frame(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05 * dpr;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh);
        ctx.restore();
      }
      if (t < end) requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, c.width, c.height);
        c.hidden = true;
      }
    }
    requestAnimationFrame(frame);
  };

  // ---------- Temporizador con forma de lápiz que se gasta ----------
  class PencilTimer {
    constructor() {
      this.body = h('span.pt-body');
      this.num = h('span.pt-num', '0:00');
      const tip = h('span.pt-tip', {
        html: '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M1.5 2.5 L24 13 L1.5 23.5 Z" fill="#F2C9A0" stroke="#1E1B3A" stroke-width="3" stroke-linejoin="round"/><path d="M15.5 8.6 L24 13 L15.5 17.4 Z" fill="#1E1B3A"/></svg>',
      });
      this.el = h('div.ptimer', { role: 'timer', 'aria-label': 'Tiempo restante' },
        h('span.pt-track', h('span.pt-eraser'), h('span.pt-band'), this.body, tip), this.num);
      this.deadline = 0;
      this.total = 1;
      this.lastSec = null;
      this.onSecond = null;
      this.iv = 0;
    }
    set(endsIn, total) {
      const d = performance.now() + endsIn;
      if (Math.abs(d - this.deadline) > 450) this.deadline = d;
      this.total = Math.max(1, total);
      if (!this.iv) {
        this.iv = setInterval(() => this._tick(), 100);
        this._tick();
      }
    }
    remaining() {
      return Math.max(0, this.deadline - performance.now());
    }
    _tick() {
      const rem = this.remaining();
      const shown = Math.min(rem, this.total);
      this.body.style.width = (U.clamp(shown / this.total, 0, 1) * 100).toFixed(2) + '%';
      const sec = Math.ceil(shown / 1000);
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        this.num.textContent = U.timeStr(shown);
        this.el.classList.toggle('low', rem > 0 && rem <= 10000);
        if (rem > 0 && rem <= 5200) S.play('tick');
        if (this.onSecond) this.onSecond(rem);
      }
    }
    stop() {
      clearInterval(this.iv);
      this.iv = 0;
    }
  }
  UI.PencilTimer = PencilTimer;

  // ---------- QR para entrar escaneando ----------
  UI.qr = function (text) {
    if (typeof qrcode !== 'function') return null;
    try {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      const n = q.getModuleCount();
      const cell = 6;
      const pad = 2;
      const c = h('canvas.qr-canvas', { width: (n + pad * 2) * cell, height: (n + pad * 2) * cell, role: 'img', 'aria-label': 'Código QR para entrar a la sala' });
      const x = c.getContext('2d');
      x.fillStyle = '#FFFFFF';
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#1E1B3A';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + pad) * cell, (r + pad) * cell, cell, cell);
      return c;
    } catch (e) {
      return null;
    }
  };

  // ---------- Pantalla siempre encendida durante la partida ----------
  let wakeLock = null;
  UI.keepAwake = async function (on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* el navegador no lo permite: no pasa nada */ }
  };

  UI.modeLabel = (id) => {
    const m = D.MODES[id];
    return m ? m.icon + ' ' + m.name : '';
  };
})(globalThis.M = globalThis.M || {});
