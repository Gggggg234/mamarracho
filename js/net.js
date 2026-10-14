/* Mamarracho — red entre jugadores con PeerJS (WebRTC).
   El anfitrión registra el id "mamarracho-v1-<CÓDIGO>" y los demás se conectan a él.
   Los mensajes viajan como JSON; los grandes (dibujos) se parten en pedazos. */
(function (M) {
  'use strict';
  const PREFIX = 'mamarracho-v1-';
  const CHUNK = 14000;
  const Net = (M.Net = { PREFIX });

  let seq = 0;
  function pack(obj) {
    const s = JSON.stringify(obj);
    if (s.length <= CHUNK) return ['J' + s];
    const id = (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
    const parts = [];
    let i = 0;
    while (i < s.length) {
      let end = Math.min(s.length, i + CHUNK);
      const code = s.charCodeAt(end - 1);
      if (end < s.length && code >= 0xd800 && code <= 0xdbff) end--; // no partir un emoji al medio
      parts.push(s.slice(i, end));
      i = end;
    }
    return parts.map((p, k) => 'C' + id + ':' + k + ':' + parts.length + ':' + p);
  }

  class Unpacker {
    constructor() {
      this.buf = new Map();
    }
    feed(str) {
      if (typeof str !== 'string' || !str.length) return null;
      if (str[0] === 'J') {
        try {
          return JSON.parse(str.slice(1));
        } catch (e) {
          return null;
        }
      }
      if (str[0] !== 'C') return null;
      const a = str.indexOf(':');
      const b = str.indexOf(':', a + 1);
      const c = str.indexOf(':', b + 1);
      if (a < 0 || b < 0 || c < 0) return null;
      const id = str.slice(1, a);
      const k = Number(str.slice(a + 1, b));
      const n = Number(str.slice(b + 1, c));
      if (!(n > 0 && n < 3000 && k >= 0 && k < n)) return null;
      let e = this.buf.get(id);
      if (!e) {
        e = { parts: new Array(n), got: 0, t: Date.now() };
        this.buf.set(id, e);
        for (const [oid, oe] of this.buf) if (Date.now() - oe.t > 90000) this.buf.delete(oid);
      }
      if (e.parts[k] == null) {
        e.parts[k] = str.slice(c + 1);
        e.got++;
      }
      if (e.got < n) return null;
      this.buf.delete(id);
      try {
        return JSON.parse(e.parts.join(''));
      } catch (err) {
        return null;
      }
    }
  }
  Net.pack = pack;
  Net.Unpacker = Unpacker;

  const peerOpts = () => ({ debug: 1 });

  function safeSend(conn, parts) {
    try {
      for (const p of parts) conn.send(p);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Anfitrión ----------
  class HostLink {
    constructor(code, handlers) {
      this.code = code;
      this.h = handlers;
      this.peer = null;
      this.conns = new Map();
      this.closed = false;
      this.nextId = 1;
    }

    start() {
      return new Promise((resolve, reject) => {
        if (typeof Peer !== 'function') {
          reject({ type: 'no-peerjs' });
          return;
        }
        let opened = false;
        const peer = new Peer(PREFIX + this.code, peerOpts());
        this.peer = peer;
        const timer = setTimeout(() => {
          if (opened) return;
          reject({ type: 'timeout' });
          try { peer.destroy(); } catch (e) { /* nada */ }
        }, 15000);
        peer.on('open', () => {
          opened = true;
          clearTimeout(timer);
          resolve();
        });
        peer.on('connection', (conn) => this._accept(conn));
        peer.on('disconnected', () => {
          if (this.closed || peer.destroyed) return;
          if (this.h.onStatus) this.h.onStatus('signal-lost');
          setTimeout(() => {
            if (!this.closed && !peer.destroyed && peer.disconnected) {
              try { peer.reconnect(); } catch (e) { /* reintenta en el próximo disconnected */ }
            }
          }, 1500);
        });
        peer.on('error', (err) => {
          if (!opened) {
            clearTimeout(timer);
            reject(err || { type: 'unknown' });
            try { peer.destroy(); } catch (e) { /* nada */ }
            return;
          }
          if (this.h.onStatus) this.h.onStatus('error', err && err.type);
        });
      });
    }

    _accept(conn) {
      if (this.closed) {
        try { conn.close(); } catch (e) { /* nada */ }
        return;
      }
      const id = 'c' + this.nextId++;
      const unp = new Unpacker();
      conn.on('open', () => {
        this.conns.set(id, conn);
        if (this.h.onConnect) this.h.onConnect(id);
      });
      conn.on('data', (d) => {
        const msg = unp.feed(d);
        if (msg) this.h.onMessage(id, msg);
      });
      const gone = () => {
        if (this.conns.get(id) !== conn) return;
        this.conns.delete(id);
        if (this.h.onDisconnect) this.h.onDisconnect(id);
      };
      conn.on('close', gone);
      conn.on('error', gone);
    }

    send(id, obj) {
      const conn = this.conns.get(id);
      if (!conn || !conn.open) return false;
      return safeSend(conn, pack(obj));
    }

    broadcast(obj) {
      const parts = pack(obj);
      for (const conn of this.conns.values()) if (conn.open) safeSend(conn, parts);
    }

    drop(id) {
      const conn = this.conns.get(id);
      if (!conn) return;
      this.conns.delete(id);
      try { conn.close(); } catch (e) { /* nada */ }
    }

    close() {
      this.closed = true;
      for (const conn of this.conns.values()) {
        try { conn.close(); } catch (e) { /* nada */ }
      }
      this.conns.clear();
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* nada */ }
    }
  }

  // ---------- Invitado ----------
  class ClientLink {
    constructor(code, handlers) {
      this.code = code;
      this.h = handlers;
      this.peer = null;
      this.conn = null;
      this.closed = false;
      this.everOpen = false;
      this.attempts = 0;
      this.lastMsg = 0;
      this.retryT = 0;
      this.watchT = 0;
    }

    connect() {
      if (typeof Peer !== 'function') {
        this._fail('no-peerjs');
        return;
      }
      this._ensurePeer();
    }

    get connected() {
      return !!(this.conn && this.conn.open);
    }

    _ensurePeer() {
      if (this.closed) return;
      const p = this.peer;
      if (p && !p.destroyed) {
        if (p.disconnected) {
          try {
            p.reconnect();
          } catch (e) {
            this._newPeer();
          }
          return;
        }
        if (p.open) this._dial();
        return;
      }
      this._newPeer();
    }

    _newPeer() {
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* nada */ }
      const peer = new Peer(peerOpts());
      this.peer = peer;
      peer.on('open', () => {
        if (this.peer === peer && !this.closed) this._dial();
      });
      peer.on('disconnected', () => {
        if (this.closed || this.peer !== peer) return;
        setTimeout(() => {
          if (!this.closed && this.peer === peer && peer.disconnected && !peer.destroyed) {
            try { peer.reconnect(); } catch (e) { /* nada */ }
          }
        }, 1200);
      });
      peer.on('error', (err) => {
        if (this.peer !== peer || this.closed) return;
        const t = err && err.type;
        if (t === 'peer-unavailable') {
          const c = this.conn;
          this.conn = null;
          try { if (c) c.close(); } catch (e) { /* nada */ }
          this._failedAttempt('notfound');
        } else if (t === 'browser-incompatible') {
          this._fail('browser');
        } else if (!this.connected) {
          this._failedAttempt('network');
        }
      });
    }

    _dial() {
      if (this.closed) return;
      if (this.conn) {
        try { this.conn.close(); } catch (e) { /* nada */ }
        this.conn = null;
      }
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'raw' });
      this.conn = conn;
      const unp = new Unpacker();
      let opened = false;
      const openTimer = setTimeout(() => {
        if (opened || this.conn !== conn) return;
        this.conn = null;
        try { conn.close(); } catch (e) { /* nada */ }
        this._failedAttempt('timeout');
      }, 12000);
      conn.on('open', () => {
        if (this.conn !== conn) return;
        opened = true;
        clearTimeout(openTimer);
        this.attempts = 0;
        this.everOpen = true;
        this.lastMsg = Date.now();
        this._watch();
        if (this.h.onOpen) this.h.onOpen();
      });
      conn.on('data', (d) => {
        if (this.conn !== conn) return;
        this.lastMsg = Date.now();
        const msg = unp.feed(d);
        if (msg) this.h.onMessage(msg);
      });
      const lost = () => {
        clearTimeout(openTimer);
        if (this.conn !== conn || this.closed) return;
        this.conn = null;
        if (opened) {
          if (this.h.onClose) this.h.onClose();
          this._scheduleRetry();
        } else this._failedAttempt('closed');
      };
      conn.on('close', lost);
      conn.on('error', lost);
    }

    _failedAttempt(reason) {
      this.attempts++;
      // Si la sala no existe, el servidor tarda unos segundos en avisar: no insistimos.
      const limit = this.everOpen ? 45 : reason === 'notfound' ? 1 : 4;
      if (this.attempts >= limit) {
        this._fail(this.everOpen ? 'lost' : reason);
        return;
      }
      this._scheduleRetry();
    }

    _scheduleRetry() {
      if (this.closed || this.retryT) return;
      const delay = Math.min(5000, 1000 + this.attempts * 700);
      this.retryT = setTimeout(() => {
        this.retryT = 0;
        this._ensurePeer();
      }, delay);
    }

    _watch() {
      clearInterval(this.watchT);
      this.watchT = setInterval(() => {
        if (this.closed) return;
        // El anfitrión manda un "ping" cada 4 s: si se calla mucho, reconectamos.
        if (this.conn && this.conn.open && Date.now() - this.lastMsg > 14000) {
          const c = this.conn;
          this.conn = null;
          try { c.close(); } catch (e) { /* nada */ }
          if (this.h.onClose) this.h.onClose();
          this._scheduleRetry();
        }
      }, 2000);
    }

    _fail(reason) {
      if (this.closed) return;
      this.closed = true;
      clearInterval(this.watchT);
      clearTimeout(this.retryT);
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* nada */ }
      if (this.h.onFail) this.h.onFail(reason);
    }

    send(obj) {
      const c = this.conn;
      if (!c || !c.open) return false;
      return safeSend(c, pack(obj));
    }

    close() {
      this.closed = true;
      clearInterval(this.watchT);
      clearTimeout(this.retryT);
      try { if (this.conn) this.conn.close(); } catch (e) { /* nada */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* nada */ }
    }
  }

  Net.HostLink = HostLink;
  Net.ClientLink = ClientLink;
})(globalThis.M = globalThis.M || {});
