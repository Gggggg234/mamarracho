/* Mamarracho — motor de dibujo: lienzo interactivo, balde, codificación compacta,
   repetición animada de los trazos, monstruos por partes y exportación del álbum. */
(function (M) {
  'use strict';
  const { U, D } = M;
  const W = 800;
  const H = 600;
  const STRIP = 90; // franja que ve el siguiente en "Monstruo por partes"
  const FADE_MS = 650;
  const Draw = (M.Draw = { W, H, STRIP });

  // ---------- Codificación: puntos con deltas en base 64 (estilo polyline) ----------
  function encNum(v, out) {
    v = v < 0 ? ~(v << 1) : v << 1;
    while (v >= 0x20) {
      out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
      v >>= 5;
    }
    out.push(String.fromCharCode(v + 63));
  }
  function encPoints(p) {
    const out = [];
    let px = 0;
    let py = 0;
    for (let i = 0; i < p.length; i += 2) {
      encNum(p[i] - px, out);
      encNum(p[i + 1] - py, out);
      px = p[i];
      py = p[i + 1];
    }
    return out.join('');
  }
  function readNum(str, st) {
    let r = 0;
    let s = 0;
    let b;
    do {
      if (st.i >= str.length) return null;
      b = str.charCodeAt(st.i++) - 63;
      if (b < 0 || b > 63) return null;
      r |= (b & 0x1f) << s;
      s += 5;
    } while (b >= 0x20 && s < 30);
    return r & 1 ? ~(r >> 1) : r >> 1;
  }
  function decPoints(str) {
    const p = [];
    const st = { i: 0 };
    let x = 0;
    let y = 0;
    while (st.i < str.length && p.length < 40000) {
      const dx = readNum(str, st);
      const dy = readNum(str, st);
      if (dx == null || dy == null) break;
      x += dx;
      y += dy;
      p.push(U.clamp(x, -50, W + 50), U.clamp(y, -50, H + 50));
    }
    return p;
  }

  Draw.encode = (ops) =>
    JSON.stringify(ops.map((o) => (o.k === 'f' ? ['f', o.c, o.x, o.y] : [o.c, o.z, encPoints(o.p)])));

  const decodeCache = new Map();
  Draw.decode = (data) => {
    if (!data || typeof data !== 'string') return [];
    if (decodeCache.has(data)) return decodeCache.get(data);
    let arr;
    try {
      arr = JSON.parse(data);
    } catch (e) {
      return [];
    }
    const ops = [];
    if (Array.isArray(arr)) {
      for (const a of arr.slice(0, 6000)) {
        if (!Array.isArray(a)) continue;
        if (a[0] === 'f') {
          const c = a[1] | 0;
          const x = a[2] | 0;
          const y = a[3] | 0;
          if (c >= 0 && c < D.PALETTE.length && x >= 0 && y >= 0 && x < W && y < H) ops.push({ k: 'f', c, x, y });
        } else {
          const c = a[0] | 0;
          const z = a[1] | 0;
          const p = typeof a[2] === 'string' ? decPoints(a[2]) : [];
          if (c >= 0 && c < D.PALETTE.length && z >= 0 && z < D.SIZES.length && p.length >= 2) ops.push({ k: 's', c, z, p });
        }
      }
    }
    if (decodeCache.size > 300) decodeCache.delete(decodeCache.keys().next().value);
    decodeCache.set(data, ops);
    return ops;
  };

  Draw.isBlank = (data) => Draw.decode(data).length === 0;

  // Ramer–Douglas–Peucker sobre un arreglo plano [x0,y0,x1,y1,...]
  function simplify(p, eps) {
    const n = p.length / 2;
    if (n <= 2) return p.slice();
    const keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = p[a * 2];
      const ay = p[a * 2 + 1];
      const dx = p[b * 2] - ax;
      const dy = p[b * 2 + 1] - ay;
      const len2 = dx * dx + dy * dy;
      let maxD = 0;
      let idx = -1;
      for (let i = a + 1; i < b; i++) {
        const px = p[i * 2] - ax;
        const py = p[i * 2 + 1] - ay;
        let d;
        if (len2 === 0) d = Math.hypot(px, py);
        else {
          const t = U.clamp((px * dx + py * dy) / len2, 0, 1);
          d = Math.hypot(px - t * dx, py - t * dy);
        }
        if (d > maxD) {
          maxD = d;
          idx = i;
        }
      }
      if (maxD > eps && idx > 0) {
        keep[idx] = 1;
        stack.push([a, idx], [idx, b]);
      }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
    return out;
  }

  // ---------- Pintado ----------
  Draw.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  function setPen(ctx, o) {
    ctx.strokeStyle = D.PALETTE[o.c];
    ctx.fillStyle = D.PALETTE[o.c];
    ctx.lineWidth = D.SIZES[o.z];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function strokeOp(ctx, o) {
    const p = o.p;
    setPen(ctx, o);
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], D.SIZES[o.z] / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Balde de pintura por líneas horizontales. La tolerancia es menor que la diferencia
  // entre el blanco y el color más claro de la paleta, así no se escapa por trazos claros.
  Draw.floodFill = function (ctx, x, y, hex) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const [fr, fg, fb] = hexRgb(hex);
    const s0 = (y * W + x) * 4;
    const tr = d[s0];
    const tg = d[s0 + 1];
    const tb = d[s0 + 2];
    if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 6) return false;
    const TOL = 90;
    const seen = new Uint8Array(W * H);
    const match = (i) => {
      const j = i * 4;
      return Math.abs(d[j] - tr) + Math.abs(d[j + 1] - tg) + Math.abs(d[j + 2] - tb) <= TOL;
    };
    const stack = [y * W + x];
    while (stack.length) {
      const i = stack.pop();
      if (seen[i] || !match(i)) continue;
      const row = (i / W) | 0;
      const rowStart = row * W;
      const rowEnd = rowStart + W - 1;
      let l = i;
      while (l > rowStart && !seen[l - 1] && match(l - 1)) l--;
      let r = i;
      while (r < rowEnd && !seen[r + 1] && match(r + 1)) r++;
      let upOpen = false;
      let downOpen = false;
      for (let k = l; k <= r; k++) {
        seen[k] = 1;
        const j = k * 4;
        d[j] = fr;
        d[j + 1] = fg;
        d[j + 2] = fb;
        d[j + 3] = 255;
        if (row > 0) {
          const u = k - W;
          if (!seen[u] && match(u)) {
            if (!upOpen) {
              stack.push(u);
              upOpen = true;
            }
          } else upOpen = false;
        }
        if (row < H - 1) {
          const v = k + W;
          if (!seen[v] && match(v)) {
            if (!downOpen) {
              stack.push(v);
              downOpen = true;
            }
          } else downOpen = false;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return true;
  };

  function applyOp(ctx, o) {
    if (o.k === 'f') Draw.floodFill(ctx, o.x, o.y, D.PALETTE[o.c]);
    else strokeOp(ctx, o);
  }

  function paper(ctx, bg) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    if (bg) ctx.drawImage(bg, 0, 0);
    ctx.restore();
  }

  Draw.render = function (ctx, ops, bg) {
    paper(ctx, bg);
    for (const o of ops) applyOp(ctx, o);
  };

  const renderCache = new Map();
  // Devuelve un canvas W×H con el dibujo terminado (cacheado si no tiene fondo).
  Draw.toCanvas = function (data, bg) {
    if (!bg && renderCache.has(data)) {
      const c = renderCache.get(data);
      renderCache.delete(data);
      renderCache.set(data, c);
      return c;
    }
    const c = Draw.canvas(W, H);
    Draw.render(c.getContext('2d'), Draw.decode(data), bg);
    if (!bg) {
      renderCache.set(data || '', c);
      if (renderCache.size > 24) renderCache.delete(renderCache.keys().next().value);
    }
    return c;
  };

  // Copia un dibujo terminado a un canvas visible (escala por CSS).
  Draw.paintInto = function (target, data, bg) {
    target.width = W;
    target.height = H;
    target.getContext('2d').drawImage(Draw.toCanvas(data, bg), 0, 0);
    return target;
  };

  // ---------- Monstruo por partes ----------
  Draw.stripBg = function (prevCanvas) {
    const c = Draw.canvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF';
    x.fillRect(0, 0, W, H);
    x.drawImage(prevCanvas, 0, H - STRIP, W, STRIP, 0, 0, W, STRIP);
    return c;
  };

  // Renderiza las partes en orden: cada una usa de fondo la franja de abajo de la anterior.
  Draw.partCanvases = function (parts) {
    const out = [];
    let prev = null;
    for (const data of parts) {
      const bg = prev ? Draw.stripBg(prev) : null;
      const c = Draw.canvas(W, H);
      Draw.render(c.getContext('2d'), Draw.decode(data), bg);
      out.push({ canvas: c, bg });
      prev = c;
    }
    return out;
  };

  Draw.monsterHeight = (n) => H + Math.max(0, n - 1) * (H - STRIP);

  Draw.monster = function (parts) {
    const pcs = Draw.partCanvases(parts);
    const step = H - STRIP;
    const c = Draw.canvas(W, Draw.monsterHeight(pcs.length));
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF';
    x.fillRect(0, 0, c.width, c.height);
    pcs.forEach((p, k) => x.drawImage(p.canvas, 0, k * step));
    return c;
  };

  // ---------- Repetición animada (el dibujo se va haciendo solo) ----------
  Draw.replay = function (canvas, data, opts) {
    opts = opts || {};
    const ops = Draw.decode(data);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const bg = opts.bg || null;
    paper(ctx, bg);
    let total = 0;
    for (const o of ops) total += o.k === 'f' ? 30 : Math.max(1, o.p.length / 2);
    const reduce = U.reducedMotion();
    const dur = opts.duration || U.clamp(total * 6, 900, 4200);
    let start = null;
    let oi = 0;
    let pi = 0;
    let done = 0;
    let raf = 0;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      Draw.render(ctx, ops, bg);
      if (opts.onDone) opts.onDone();
    }

    function frame(ts) {
      if (finished) return;
      if (start == null) start = ts;
      const target = Math.min(total, ((ts - start) / dur) * total);
      while (oi < ops.length && done < target) {
        const o = ops[oi];
        if (o.k === 'f') {
          applyOp(ctx, o);
          done += 30;
          oi++;
          pi = 0;
          continue;
        }
        const n = o.p.length / 2;
        setPen(ctx, o);
        if (n === 1) {
          strokeOp(ctx, o);
          done += 1;
          oi++;
          pi = 0;
          continue;
        }
        if (pi === 0) pi = 1;
        ctx.beginPath();
        ctx.moveTo(o.p[(pi - 1) * 2], o.p[(pi - 1) * 2 + 1]);
        while (pi < n && done < target) {
          ctx.lineTo(o.p[pi * 2], o.p[pi * 2 + 1]);
          pi++;
          done++;
        }
        ctx.stroke();
        if (pi >= n) {
          oi++;
          pi = 0;
        }
      }
      if (oi >= ops.length) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    if (reduce || !ops.length) finish();
    else raf = requestAnimationFrame(frame);
    return {
      skip: finish,
      stop() {
        finished = true;
        cancelAnimationFrame(raf);
      },
    };
  };

  // ---------- Iconos de herramientas (SVG propio, trazo de marcador) ----------
  const ICONS = {
    pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-4.6L16.6 4a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M14.5 6.1l3.4 3.4"/><path d="M4 20l4.6-1.2"/></svg>',
    fill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11l6.5-6.5 7 7L12 18a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8z"/><path d="M5.2 11.5h13"/><path d="M20 15.5c0 1.6 1.2 2.6 1.2 3.7a1.2 1.2 0 0 1-2.4 0c0-1.1 1.2-2.1 1.2-3.7z"/><path d="M9 6.8L7 4.8"/></svg>',
    eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 19.5L3.6 14.6a2 2 0 0 1 0-2.8L12 3.4a2 2 0 0 1 2.8 0l5.8 5.8a2 2 0 0 1 0 2.8l-7.5 7.5z"/><path d="M8 9.4l6.6 6.6"/><path d="M8.5 19.5H20"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>',
  };
  Draw.ICONS = ICONS;

  // ---------- Lienzo interactivo ----------
  class Pad {
    constructor(opts) {
      opts = opts || {};
      this.variant = opts.variant || 'normal'; // normal | invisible | onestroke
      this.bg = opts.bg || null;
      this.guide = opts.guide || null;
      this.onChange = opts.onChange || null;
      this.ops = [];
      this.tool = 'pen';
      this.color = 0;
      this.size = 1;
      this.enabled = true;
      this.locked = false;
      this.cur = null;
      this.fades = [];
      this.fadeRaf = 0;
      this._build();
      this.redraw();
    }

    _build() {
      const { h } = U;
      this.base = h('canvas.pad-base', { width: W, height: H });
      this.live = h('canvas.pad-live', { width: W, height: H, role: 'img', 'aria-label': 'Hoja para dibujar' });
      this.bctx = this.base.getContext('2d', { willReadFrequently: true });
      this.lctx = this.live.getContext('2d');
      this.stage = h('div.pad-stage', this.base, this.live);
      if (this.variant === 'invisible') this.stage.classList.add('is-invisible');
      if (this.guide && this.guide.top) this.stage.appendChild(h('div.pad-guide-top', h('span', this.guide.top)));
      if (this.guide && this.guide.bottom) this.stage.appendChild(h('div.pad-guide-bottom', h('span', this.guide.bottom)));
      this.lockEl = h('div.pad-lock', { hidden: true },
        h('div.pad-lock-card',
          h('b', '✅ ¡Trazo hecho!'),
          h('button.btn.small', { type: 'button', on: { click: () => this.clear() } }, 'Borrar y reintentar')));
      this.stage.appendChild(this.lockEl);

      const tools = h('div.pad-tools');
      const toolBtn = (id, label) => {
        const b = h('button.tool', { type: 'button', title: label, 'aria-label': label, dataset: { tool: id }, html: ICONS[id] });
        b.addEventListener('click', () => this.setTool(id));
        return b;
      };
      const kinds = this.variant === 'normal' ? ['pen', 'fill', 'eraser'] : ['pen'];
      this.toolBtns = kinds.map((k) => toolBtn(k, { pen: 'Lápiz', fill: 'Balde de pintura', eraser: 'Goma' }[k]));
      if (this.toolBtns.length > 1) tools.appendChild(h('div.tool-group', this.toolBtns));

      this.sizeBtns = D.SIZES.map((s, i) => {
        const b = h('button.tool.size', { type: 'button', title: D.SIZE_NAMES[i], 'aria-label': 'Grosor ' + D.SIZE_NAMES[i] },
          h('i', { style: { width: Math.max(5, Math.min(26, s * 0.75)) + 'px', height: Math.max(5, Math.min(26, s * 0.75)) + 'px' } }));
        b.addEventListener('click', () => this.setSize(i));
        return b;
      });
      tools.appendChild(h('div.tool-group', this.sizeBtns));

      const acts = [];
      if (this.variant !== 'onestroke') {
        this.undoBtn = h('button.tool', { type: 'button', title: 'Deshacer', 'aria-label': 'Deshacer', html: ICONS.undo });
        this.undoBtn.addEventListener('click', () => this.undo());
        acts.push(this.undoBtn);
      }
      this.clearBtn = h('button.tool.danger', { type: 'button', title: 'Borrar todo', 'aria-label': 'Borrar todo', html: ICONS.trash });
      this.clearBtn.addEventListener('click', () => this._askClear());
      acts.push(this.clearBtn);
      tools.appendChild(h('div.tool-group', acts));

      this.swatches = D.PALETTE.map((hex, i) => {
        if (this.variant !== 'normal' && i === D.WHITE) return null;
        const b = h('button.swatch', { type: 'button', title: D.PALETTE_NAMES[i], 'aria-label': 'Color ' + D.PALETTE_NAMES[i], style: { '--sw': hex }, dataset: { c: i } });
        b.addEventListener('click', () => this.setColor(i));
        return b;
      }).filter(Boolean);
      const palette = h('div.pad-palette', this.swatches);

      this.el = h('div.pad', { class: 'pad--' + this.variant }, this.stage, h('div.pad-controls', tools, palette));

      const c = this.live;
      c.addEventListener('pointerdown', (e) => this._down(e));
      c.addEventListener('pointermove', (e) => this._move(e));
      c.addEventListener('pointerup', (e) => this._up(e));
      c.addEventListener('pointercancel', (e) => this._up(e));
      c.addEventListener('lostpointercapture', (e) => this._up(e));
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      this._syncUi();
    }

    _syncUi() {
      this.toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.tool === this.tool));
      this.sizeBtns.forEach((b, i) => b.classList.toggle('on', i === this.size));
      const colorOn = this.tool !== 'eraser';
      this.swatches.forEach((b) => b.classList.toggle('on', colorOn && Number(b.dataset.c) === this.color));
      this.el.dataset.tool = this.tool;
      if (this.undoBtn) this.undoBtn.disabled = !this.ops.length;
    }

    setTool(t) {
      this.tool = t;
      this._syncUi();
    }
    setSize(i) {
      this.size = i;
      if (this.tool === 'fill') this.tool = 'pen';
      this._syncUi();
    }
    setColor(i) {
      this.color = i;
      if (this.tool === 'eraser') this.tool = 'pen';
      this._syncUi();
    }

    setEnabled(on) {
      this.enabled = !!on;
      this.el.classList.toggle('is-off', !on);
      if (!on && this.cur) this._up(null);
    }

    _pos(e) {
      const r = this.live.getBoundingClientRect();
      return [
        U.clamp(Math.round(((e.clientX - r.left) * W) / r.width), 0, W - 1),
        U.clamp(Math.round(((e.clientY - r.top) * H) / r.height), 0, H - 1),
      ];
    }

    _down(e) {
      if (!this.enabled || this.locked || this.cur) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const [x, y] = this._pos(e);
      if (this.tool === 'fill') {
        this._fill(x, y);
        return;
      }
      try {
        this.live.setPointerCapture(e.pointerId);
      } catch (err) { /* sin captura igual funciona */ }
      const c = this.tool === 'eraser' ? D.WHITE : this.color;
      this.cur = { id: e.pointerId, k: 's', c, z: this.size, p: [x, y] };
      this._seg(x, y, x, y);
    }

    _move(e) {
      if (!this.cur || e.pointerId !== this.cur.id) return;
      e.preventDefault();
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      for (const ev of list && list.length ? list : [e]) {
        const [x, y] = this._pos(ev);
        const p = this.cur.p;
        const lx = p[p.length - 2];
        const ly = p[p.length - 1];
        const dx = x - lx;
        const dy = y - ly;
        if (dx * dx + dy * dy < 4) continue;
        if (p.length > 8000) break;
        p.push(x, y);
        this._seg(lx, ly, x, y);
      }
    }

    _up(e) {
      if (!this.cur || (e && e.pointerId !== this.cur.id)) return;
      const op = this.cur;
      this.cur = null;
      op.p = simplify(op.p, 0.8);
      delete op.id;
      this.ops.push(op);
      strokeOp(this.bctx, op);
      if (this.variant !== 'invisible') this.lctx.clearRect(0, 0, W, H);
      if (this.variant === 'onestroke') {
        this.locked = true;
        this.lockEl.hidden = false;
      }
      this._changed();
    }

    _seg(x0, y0, x1, y1) {
      const o = this.cur;
      if (this.variant === 'invisible') {
        this.fades.push({ x0, y0, x1, y1, c: o.c, z: o.z, t: performance.now() });
        this._fadeLoop();
        return;
      }
      const ctx = this.lctx;
      setPen(ctx, o);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    _fadeLoop() {
      if (this.fadeRaf) return;
      const tick = () => {
        const now = performance.now();
        const ctx = this.lctx;
        ctx.clearRect(0, 0, W, H);
        this.fades = this.fades.filter((s) => now - s.t < FADE_MS);
        // En vez de transparencia (que deja "cuentas" donde se pisan los trazos),
        // aclaramos el color hacia el blanco del papel.
        for (const s of this.fades) {
          const k = Math.min(1, (now - s.t) / FADE_MS);
          const [r, g, b] = hexRgb(D.PALETTE[s.c]);
          const mix = (v) => Math.round(v + (255 - v) * k);
          ctx.strokeStyle = 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
          ctx.lineWidth = D.SIZES[s.z];
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(s.x0, s.y0);
          ctx.lineTo(s.x1, s.y1);
          ctx.stroke();
        }
        this.fadeRaf = this.fades.length ? requestAnimationFrame(tick) : 0;
      };
      this.fadeRaf = requestAnimationFrame(tick);
    }

    _fill(x, y) {
      const op = { k: 'f', c: this.color, x, y };
      if (Draw.floodFill(this.bctx, x, y, D.PALETTE[op.c])) {
        this.ops.push(op);
        if (M.S) M.S.play('pop');
        this._changed();
      }
    }

    undo() {
      if (!this.ops.length || !this.enabled) return;
      this.ops.pop();
      this.redraw();
      this._changed();
    }

    _askClear() {
      if (!this.enabled || !this.ops.length) return;
      if (this.clearBtn.classList.contains('confirm')) {
        this.clear();
        return;
      }
      this.clearBtn.classList.add('confirm');
      this.clearBtn.title = 'Tocá de nuevo para borrar todo';
      clearTimeout(this._clearT);
      this._clearT = setTimeout(() => {
        this.clearBtn.classList.remove('confirm');
        this.clearBtn.title = 'Borrar todo';
      }, 2200);
    }

    clear() {
      if (!this.enabled) return;
      this.clearBtn.classList.remove('confirm');
      this.ops = [];
      this.locked = false;
      this.lockEl.hidden = true;
      this.redraw();
      this._changed();
    }

    redraw() {
      Draw.render(this.bctx, this.ops, this.bg);
      this.lctx.clearRect(0, 0, W, H);
    }

    _changed() {
      this._syncUi();
      if (this.onChange) this.onChange(this);
    }

    data() {
      if (this.cur) this._up(null);
      return Draw.encode(this.ops);
    }

    isEmpty() {
      return this.ops.length === 0 && !this.cur;
    }

    handleKey(e) {
      if (!this.enabled) return false;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        this.undo();
        return true;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (k === 'b' || k === 'p') this.setTool('pen');
      else if ((k === 'g' || k === 'f') && this.variant === 'normal') this.setTool('fill');
      else if (k === 'e' && this.variant === 'normal') this.setTool('eraser');
      else if (k >= '1' && k <= '4') this.setSize(Number(k) - 1);
      else return false;
      return true;
    }

    destroy() {
      cancelAnimationFrame(this.fadeRaf);
      clearTimeout(this._clearT);
      this.cur = null;
    }
  }
  Draw.Pad = Pad;

  // ---------- Álbum como imagen PNG ----------
  function wrapLines(ctx, text, maxW) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const INK = '#1E1B3A';
  const F_DISPLAY = '"Bagel Fat One", "Arial Black", sans-serif';
  const F_UI = '"Grandstander", "Trebuchet MS", sans-serif';
  const F_HAND = '"Gochi Hand", "Comic Sans MS", cursive';

  // entries: [{ who: {name, avatar, color}, verb, kind: 'text'|'drawing'|'monster', text, data, parts, bg }]
  Draw.albumBlob = async function ({ title, subtitle, entries }) {
    try {
      await Promise.all([
        document.fonts.load('48px "Bagel Fat One"'),
        document.fonts.load('700 24px "Grandstander"'),
        document.fonts.load('34px "Gochi Hand"'),
      ]);
    } catch (e) { /* si no cargan las fuentes usamos las de respaldo */ }
    const WID = 880;
    const PAD = 40;
    const inner = WID - PAD * 2;
    const meas = Draw.canvas(10, 10).getContext('2d');
    meas.font = '34px ' + F_HAND;

    const blocks = entries.map((en) => {
      let hgt = 52;
      if (en.kind === 'text') {
        en._lines = wrapLines(meas, en.text || '…', inner - 60);
        hgt += en._lines.length * 44 + 34;
      } else if (en.kind === 'drawing') {
        en._img = Draw.toCanvas(en.data, en.bg || null);
        hgt += Math.round((inner * H) / W) + 8;
      } else if (en.kind === 'monster') {
        en._img = Draw.monster(en.parts || []);
        en._w = Math.round(inner * 0.72);
        hgt += Math.round((en._w * en._img.height) / en._img.width) + (en.text ? 60 : 8);
      }
      return hgt + 26;
    });
    const total = 170 + blocks.reduce((a, b) => a + b, 0) + 70;
    const c = Draw.canvas(WID, total);
    const x = c.getContext('2d');

    // Hoja cuadriculada
    x.fillStyle = '#F4F7FB';
    x.fillRect(0, 0, WID, total);
    x.strokeStyle = '#DCE6F3';
    x.lineWidth = 1.5;
    for (let gx = 0; gx < WID; gx += 28) {
      x.beginPath();
      x.moveTo(gx + 0.5, 0);
      x.lineTo(gx + 0.5, total);
      x.stroke();
    }
    for (let gy = 0; gy < total; gy += 28) {
      x.beginPath();
      x.moveTo(0, gy + 0.5);
      x.lineTo(WID, gy + 0.5);
      x.stroke();
    }

    // Título
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.font = '64px ' + F_DISPLAY;
    x.lineJoin = 'round';
    x.lineWidth = 10;
    x.strokeStyle = INK;
    x.strokeText('MAMARRACHO', WID / 2, 92);
    x.fillStyle = '#FFE14A';
    x.fillText('MAMARRACHO', WID / 2, 92);
    x.font = '700 26px ' + F_UI;
    x.fillStyle = INK;
    x.fillText(title || '', WID / 2, 132);
    if (subtitle) {
      x.font = '20px ' + F_UI;
      x.fillStyle = '#4D4A6B';
      x.fillText(subtitle, WID / 2, 158);
    }

    let y = 190;
    entries.forEach((en, i) => {
      x.textAlign = 'left';
      // Avatar + nombre
      x.fillStyle = (en.who && en.who.color) || '#FFE14A';
      x.beginPath();
      x.arc(PAD + 22, y + 20, 22, 0, Math.PI * 2);
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = INK;
      x.stroke();
      x.font = '24px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText((en.who && en.who.avatar) || '❓', PAD + 22, y + 21);
      x.textAlign = 'left';
      x.textBaseline = 'alphabetic';
      x.font = '800 22px ' + F_UI;
      x.fillStyle = INK;
      const nm = (en.who && en.who.name) || 'Alguien';
      x.fillText(nm, PAD + 56, y + 28);
      const nw = x.measureText(nm).width;
      x.font = '20px ' + F_UI;
      x.fillStyle = '#4D4A6B';
      x.fillText(en.verb || '', PAD + 64 + nw, y + 28);
      let cy = y + 52;
      if (en.kind === 'text') {
        const bh = en._lines.length * 44 + 26;
        roundRect(x, PAD + 30, cy, inner - 30, bh, 18);
        x.fillStyle = '#FFFFFF';
        x.fill();
        x.lineWidth = 3;
        x.strokeStyle = INK;
        x.stroke();
        x.font = '34px ' + F_HAND;
        x.fillStyle = INK;
        en._lines.forEach((ln, k) => x.fillText(ln, PAD + 56, cy + 44 + k * 44));
      } else if (en.kind === 'drawing') {
        const dh = Math.round((inner * H) / W);
        x.fillStyle = INK;
        x.fillRect(PAD + 5, cy + 5, inner, dh);
        x.drawImage(en._img, PAD, cy, inner, dh);
        x.lineWidth = 3;
        x.strokeStyle = INK;
        x.strokeRect(PAD, cy, inner, dh);
      } else if (en.kind === 'monster') {
        const mw = en._w;
        const mh = Math.round((mw * en._img.height) / en._img.width);
        const mx = (WID - mw) / 2;
        x.fillStyle = INK;
        x.fillRect(mx + 5, cy + 5, mw, mh);
        x.drawImage(en._img, mx, cy, mw, mh);
        x.lineWidth = 3;
        x.strokeStyle = INK;
        x.strokeRect(mx, cy, mw, mh);
        if (en.text) {
          x.textAlign = 'center';
          x.font = '34px ' + F_DISPLAY;
          x.lineWidth = 7;
          x.strokeStyle = INK;
          x.strokeText(en.text, WID / 2, cy + mh + 46);
          x.fillStyle = '#FF5C9D';
          x.fillText(en.text, WID / 2, cy + mh + 46);
          x.textAlign = 'left';
        }
      }
      y += blocks[i];
    });

    x.textAlign = 'center';
    x.font = '700 18px ' + F_UI;
    x.fillStyle = '#4D4A6B';
    x.fillText('Hecho en Mamarracho ✏️', WID / 2, total - 30);

    return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
  };
})(globalThis.M = globalThis.M || {});
