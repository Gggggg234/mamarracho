/* Mamarracho — utilidades compartidas (sin dependencias). */
(function (M) {
  'use strict';
  const U = (M.U = {});

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'readOnly', 'tabIndex', 'maxLength']);

  // Mini hyperscript: h('button.btn.primary#go', {on: {click}}, 'Texto', otroNodo)
  U.h = function h(sel, props, ...kids) {
    const m = /^([a-z][a-z0-9-]*)?((?:[.#][\w-]+)*)$/i.exec(sel);
    if (!m) throw new Error('Selector inválido: ' + sel);
    const el = document.createElement(m[1] || 'div');
    for (const t of m[2].match(/[.#][\w-]+/g) || []) {
      if (t[0] === '.') el.classList.add(t.slice(1));
      else el.id = t.slice(1);
    }
    if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
      kids.unshift(props);
      props = null;
    }
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'on') {
          for (const ev of Object.keys(v)) el.addEventListener(ev, v[ev]);
        } else if (k === 'class') {
          String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
        } else if (k === 'style') {
          if (typeof v === 'string') el.style.cssText = v;
          else for (const sk of Object.keys(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]);
            else el.style[sk] = v[sk];
          }
        } else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v; // solo para markup propio y estático
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (PROP_KEYS.has(k)) el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    U.append(el, kids);
    return el;
  };

  U.append = function (el, kids) {
    for (const k of [kids].flat(Infinity)) {
      if (k == null || k === false || k === true) continue;
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  };

  U.clear = (el) => {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.rand = (n) => Math.floor(Math.random() * n);
  U.pick = (arr) => arr[U.rand(arr.length)];
  U.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = U.rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function randomBytes(n) {
    const out = new Uint8Array(n);
    if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(out);
    else for (let i = 0; i < n; i++) out[i] = U.rand(256);
    return out;
  }

  U.uid = (n = 12) => {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    const r = randomBytes(n);
    let s = '';
    for (let i = 0; i < n; i++) s += abc[r[i] % abc.length];
    return s;
  };

  // Códigos de sala: 4 letras sin I ni O para que no se confundan con 1 y 0.
  U.CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  U.code = () => {
    const r = randomBytes(4);
    let s = '';
    for (let i = 0; i < 4; i++) s += U.CODE_ABC[r[i] % U.CODE_ABC.length];
    return s;
  };
  U.normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  // Limpia texto que viene de otros jugadores: sin caracteres de control ni invisibles.
  U.cleanText = (s, max) => {
    const t = String(s == null ? '' : s)
      .replace(/[\u0000-\u001F\u007F-\u009F­​-‌‎-‏‪-‮⁠-⁤﻿]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(t).slice(0, max).join('').trim();
  };

  U.fmt = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  U.weighted = (table) => {
    const total = table.reduce((s, t) => s + t.w, 0);
    let x = Math.random() * total;
    for (const t of table) {
      x -= t.w;
      if (x < 0) return t;
    }
    return table[table.length - 1];
  };

  U.store = {
    get(k, def) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) { /* almacenamiento bloqueado: seguimos sin recordar */ }
    },
    sget(k, def) {
      try {
        const v = sessionStorage.getItem(k);
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    sset(k, v) {
      try {
        if (v === undefined) sessionStorage.removeItem(k);
        else sessionStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  U.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = U.h('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  };

  U.timeStr = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  U.reducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  U.downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = U.h('a', { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 4000);
  };
})(globalThis.M = globalThis.M || {});
