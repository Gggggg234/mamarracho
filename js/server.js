/* Mamarracho — lógica de la partida. Corre en el navegador del anfitrión y es la única
   fuente de verdad: los demás solo mandan acciones y reciben el estado. */
(function (M) {
  'use strict';
  const { U, D } = M;

  const GRACE = 2500; // espera extra al final de cada ronda para los envíos automáticos
  const BANNER = 1800; // el cartel "Ronda N" que se muestra al empezar cada ronda
  const LOT_MS = 15000;
  const EXT_MS = 6000;
  const SOLD_MS = 8000;
  const UNSOLD_MS = 3500;
  const OFFLINE_MS = 16000;
  const LOBBY_DROP_MS = 25000;
  const WAIT_OFFLINE_MS = 8000;

  const mod = (a, n) => ((a % n) + n) % n;
  const blankDrawing = (d) => !d || d.length <= 2;

  class Server {
    constructor(code, link) {
      this.code = code;
      this.link = link || null;
      this.players = new Map();
      this.conns = new Map();
      this.hostPid = null;
      this.phase = 'lobby';
      this.settings = { mode: 'clasico', speed: 'normal' };
      this.g = null;
      this.a = null;
      this.results = null;
      this.local = null;
      this.persist = null;
      this.rate = new Map();
      this._pushT = 0;
      this._saveT = 0;
      this.lastPing = 0;
      this.timer = setInterval(() => this.tick(), 250);
    }

    stop() {
      clearInterval(this.timer);
      clearTimeout(this._pushT);
      clearTimeout(this._saveT);
    }

    attachLocal(pid, deliver) {
      this.local = { pid, deliver };
      this.hostPid = pid;
    }

    // ---------- Envíos ----------
    _deliverLocal(msg) {
      if (!this.local) return;
      const copy = JSON.parse(JSON.stringify(msg));
      setTimeout(() => this.local && this.local.deliver(copy), 0);
    }

    sendConn(connId, msg) {
      if (connId === 'local') this._deliverLocal(msg);
      else if (this.link) this.link.send(connId, msg);
    }

    sendTo(pid, msg) {
      const p = this.players.get(pid);
      if (!p || !p.online || !p.connId) return;
      this.sendConn(p.connId, msg);
    }

    broadcast(msg) {
      if (this.link) this.link.broadcast(msg);
      this._deliverLocal(msg);
    }

    push(now) {
      if (now) {
        clearTimeout(this._pushT);
        this._pushT = 0;
        this.flush();
        return;
      }
      if (!this._pushT) {
        this._pushT = setTimeout(() => {
          this._pushT = 0;
          this.flush();
        }, 60);
      }
    }

    flush() {
      this.broadcast({ t: 'state', s: this.publicState() });
      this.scheduleSave();
    }

    // ---------- Entrada ----------
    receive(connId, msg) {
      try {
        this._handle(connId, msg);
      } catch (e) {
        console.error('[mamarracho] error procesando', msg && msg.t, e);
      }
    }

    _handle(connId, msg) {
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
      if (msg.t === 'hello') {
        this.onHello(connId, msg);
        return;
      }
      const pid = connId === 'local' ? this.local && this.local.pid : this.conns.get(connId);
      if (!pid) return;
      const p = this.players.get(pid);
      if (!p || p.connId !== connId) return;
      p.lastSeen = Date.now();
      if (!p.online) {
        p.online = true;
        this.push();
      }
      const isHost = pid === this.hostPid;
      if (globalThis.MM_DEBUG && msg.t !== 'pong') console.info('[mamarracho] recibido', msg.t, 'de', p.name, isHost ? '(anfitrión)' : '', 'fase', this.phase);
      switch (msg.t) {
        case 'pong':
          return;
        case 'profile':
          if (this.phase === 'lobby') {
            this.applyProfile(p, msg);
            this.push();
          }
          return;
        case 'settings':
          if (isHost) this.onSettings(msg);
          return;
        case 'kick':
          if (isHost) this.onKick(msg);
          return;
        case 'start':
          if (isHost && this.phase === 'lobby') this.startGame();
          return;
        case 'submit':
          this.onSubmit(pid, msg);
          return;
        case 'unsubmit':
          this.onUnsubmit(pid, msg);
          return;
        case 'reveal':
          if (isHost) this.onReveal();
          return;
        case 'react':
          this.onReact(pid, msg);
          return;
        case 'auction':
          if (isHost) this.onAuction();
          return;
        case 'bid':
          this.onBid(pid, msg);
          return;
        case 'next':
          if (isHost && this.phase === 'auction' && this.a && (this.a.stage === 'sold' || this.a.stage === 'intro')) this.nextLot();
          return;
        case 'again':
          if (isHost) this.backToLobby();
          return;
        default:
      }
    }

    onHello(connId, msg) {
      const pid = typeof msg.pid === 'string' && /^[a-z0-9]{6,24}$/.test(msg.pid) ? msg.pid : null;
      if (!pid) return;
      if (connId !== 'local' && pid === this.hostPid) return;
      let p = this.players.get(pid);
      if (!p) {
        if (this.players.size >= D.MAX_PLAYERS) {
          this.sendConn(connId, { t: 'error', code: 'full', msg: 'La sala está llena (máximo ' + D.MAX_PLAYERS + ' jugadores).' });
          return;
        }
        p = { id: pid, joinedAt: Date.now(), spectator: this.phase !== 'lobby' };
        this.players.set(pid, p);
      }
      if (p.connId && p.connId !== connId && p.connId !== 'local') {
        this.conns.delete(p.connId);
        if (this.link) this.link.drop(p.connId);
      }
      p.connId = connId;
      p.online = true;
      p.lastSeen = Date.now();
      if (connId !== 'local') this.conns.set(connId, pid);
      this.applyProfile(p, msg);
      this.sendConn(connId, { t: 'welcome', pid, code: this.code, host: this.hostPid });
      this.push(true);
      this.catchUp(pid);
    }

    disconnect(connId) {
      const pid = this.conns.get(connId);
      this.conns.delete(connId);
      const p = pid && this.players.get(pid);
      if (!p || p.connId !== connId) return;
      p.online = false;
      p.connId = null;
      p.lastSeen = Date.now();
      this.push();
    }

    applyProfile(p, msg) {
      let name = U.cleanText(msg.name, 16) || 'Jugador';
      const taken = (n) => [...this.players.values()].some((o) => o !== p && o.name && o.name.toLowerCase() === n.toLowerCase());
      if (taken(name)) {
        let k = 2;
        while (taken(name + ' ' + k)) k++;
        name = name + ' ' + k;
      }
      p.name = name;
      p.avatar = D.AVATARS.includes(msg.avatar) ? msg.avatar : p.avatar || U.pick(D.AVATARS);
      p.color = D.AVATAR_COLORS.includes(msg.color) ? msg.color : p.color || U.pick(D.AVATAR_COLORS);
    }

    // Lo que necesita alguien que llega (o vuelve) en medio de la partida.
    catchUp(pid) {
      const g = this.g;
      if (!g) return;
      if (this.phase === 'round' && g.order.includes(pid)) {
        this.sendTo(pid, { t: 'task', task: this.taskFor(pid) });
      } else if (this.phase === 'reveal') {
        for (let s = 0; s < g.rv.shown; s++) this.sendTo(pid, { t: 'item', item: this.itemFor(g.rv.chain, s) });
      } else if ((this.phase === 'auction' || this.phase === 'results') && this.a) {
        const upto = this.phase === 'results' ? this.a.lots.length - 1 : this.a.i;
        for (let i = 0; i <= upto; i++) {
          const lot = this.a.lots[i];
          if (lot) this.sendTo(pid, { t: 'lotart', i, art: lot.art, gameId: g.gameId });
        }
      }
    }

    onSettings(msg) {
      if (this.phase !== 'lobby') return;
      if (D.MODES[msg.mode]) this.settings.mode = msg.mode;
      if (D.SPEEDS[msg.speed]) this.settings.speed = msg.speed;
      this.push();
    }

    onKick(msg) {
      if (this.phase !== 'lobby') return;
      const target = this.players.get(msg.pid);
      if (!target || target.id === this.hostPid) return;
      this.sendTo(target.id, { t: 'kicked' });
      if (target.connId && target.connId !== 'local') {
        const cid = target.connId;
        this.conns.delete(cid);
        setTimeout(() => this.link && this.link.drop(cid), 300);
      }
      this.players.delete(target.id);
      this.push();
    }

    // ---------- Partida ----------
    startGame() {
      for (const p of [...this.players.values()]) if (!p.online) this.players.delete(p.id);
      const ids = [...this.players.values()].map((p) => p.id);
      if (ids.length < 2) {
        this.sendTo(this.hostPid, { t: 'error', msg: 'Hacen falta al menos 2 jugadores.' });
        return;
      }
      for (const p of this.players.values()) p.spectator = false;
      const order = U.shuffle(ids);
      const N = order.length;
      const mode = this.settings.mode;
      const rounds = mode === 'monstruo' ? 3 : U.clamp(N, 3, 10);
      const used = new Set();
      const chains = order.map((owner) => {
        const ch = { owner, steps: [] };
        if (mode === 'copion') {
          ch.seed = D.randomPrompt(used);
          used.add(ch.seed);
        }
        if (mode === 'monstruo') ch.name = D.monsterName();
        return ch;
      });
      this.g = {
        gameId: U.uid(8), mode, speed: this.settings.speed, order, N, rounds, chains,
        round: -1, kind: null, duration: 0, deadline: 0, submitted: new Map(), reactions: {}, rv: null, used,
      };
      this.a = null;
      this.results = null;
      this.phase = 'round';
      this.beginRound(0);
    }

    kindFor(r) {
      const mode = this.g.mode;
      if (mode === 'copion') return r === 0 ? 'draw' : 'copy';
      if (mode === 'monstruo') return 'part';
      if (r === 0) return 'write';
      return r % 2 === 1 ? 'draw' : 'guess';
    }

    secsFor(kind) {
      const sp = D.SPEEDS[this.g.speed] || D.SPEEDS.normal;
      if (kind === 'copy') return sp.memo + sp.draw;
      return sp[kind] || sp.draw;
    }

    chainIndex(pid, r) {
      const g = this.g;
      return mod(g.order.indexOf(pid) - r, g.N);
    }

    beginRound(r) {
      const g = this.g;
      g.round = r;
      g.kind = this.kindFor(r);
      g.submitted = new Map();
      g.duration = this.secsFor(g.kind) * 1000;
      g.deadline = Date.now() + g.duration + BANNER;
      for (const pid of g.order) this.sendTo(pid, { t: 'task', task: this.taskFor(pid) });
      this.push(true);
    }

    // El último texto escrito en la cadena antes de la ronda r (lo que hay que dibujar).
    promptAt(ch, r) {
      for (let i = r - 1; i >= 0; i--) {
        const s = ch.steps[i];
        if (s && s.text) return s.text;
      }
      return ch.seed || D.randomPrompt(this.g.used);
    }

    taskFor(pid) {
      const g = this.g;
      if (!g.order.includes(pid)) return null;
      const r = g.round;
      const c = this.chainIndex(pid, r);
      const ch = g.chains[c];
      const prev = r > 0 ? ch.steps[r - 1] : null;
      const t = { gameId: g.gameId, round: r, kind: g.kind, chain: c, mode: g.mode, total: g.rounds, duration: g.duration };
      if (g.kind === 'draw') t.prompt = r === 0 && ch.seed ? ch.seed : this.promptAt(ch, r);
      else if (g.kind === 'guess') t.drawing = (prev && prev.drawing) || '';
      else if (g.kind === 'copy') {
        t.drawing = (prev && prev.drawing) || '';
        t.memoMs = (D.SPEEDS[g.speed] || D.SPEEDS.normal).memo * 1000;
      } else if (g.kind === 'part') {
        t.part = r;
        t.prevParts = ch.steps.slice(0, r).map((s) => s.drawing || '');
      }
      const sub = g.submitted.get(pid);
      if (sub) t.done = true;
      return t;
    }

    onSubmit(pid, msg) {
      const g = this.g;
      if (this.phase !== 'round' || !g || msg.round !== g.round || !g.order.includes(pid)) return;
      if (Date.now() > g.deadline + GRACE) return;
      let content;
      if (g.kind === 'write' || g.kind === 'guess') content = { text: U.cleanText(msg.text, 90) };
      else content = { drawing: typeof msg.drawing === 'string' && msg.drawing.length < 600000 ? msg.drawing : '' };
      g.submitted.set(pid, content);
      this.push();
      this.checkRoundEnd();
    }

    onUnsubmit(pid, msg) {
      const g = this.g;
      if (this.phase !== 'round' || !g || msg.round !== g.round) return;
      if (Date.now() > g.deadline - 1000) return;
      if (g.submitted.delete(pid)) this.push();
    }

    checkRoundEnd() {
      const g = this.g;
      if (this.phase !== 'round' || !g) return;
      const now = Date.now();
      const waiting = g.order.filter((id) => {
        if (g.submitted.has(id)) return false;
        const p = this.players.get(id);
        return p && (p.online || now - (p.lastSeen || 0) < WAIT_OFFLINE_MS);
      });
      if (!waiting.length) this.endRound();
    }

    endRound() {
      const g = this.g;
      const r = g.round;
      for (const pid of g.order) {
        const ch = g.chains[this.chainIndex(pid, r)];
        const sub = g.submitted.get(pid);
        const step = { by: pid, kind: g.kind };
        if (g.kind === 'write') {
          step.text = (sub && sub.text) || D.randomPrompt(g.used);
          step.auto = !(sub && sub.text);
          g.used.add(step.text);
        } else if (g.kind === 'guess') {
          step.text = (sub && sub.text) || '';
          step.auto = !sub;
        } else {
          step.drawing = (sub && sub.drawing) || '';
          step.auto = !sub;
        }
        if (g.kind === 'draw') step.prompt = r === 0 && ch.seed ? ch.seed : this.promptAt(ch, r);
        if (g.kind === 'copy') step.prompt = ch.seed || this.promptAt(ch, r);
        if (g.kind === 'part') step.part = r;
        ch.steps[r] = step;
      }
      g.submitted = new Map();
      if (r + 1 < g.rounds) this.beginRound(r + 1);
      else this.startReveal();
      this.save();
    }

    // ---------- Revelación ----------
    startReveal() {
      const g = this.g;
      this.phase = 'reveal';
      g.rv = { chain: 0, shown: 1 };
      this.broadcast({ t: 'item', item: this.itemFor(0, 0) });
      this.push(true);
    }

    stepsCount(c) {
      const g = this.g;
      const n = g.chains[c].steps.length;
      return g.mode === 'monstruo' ? n + 1 : n;
    }

    itemFor(c, s) {
      const g = this.g;
      const ch = g.chains[c];
      if (g.mode === 'monstruo' && s === ch.steps.length) {
        return {
          key: c + '.m', c, s, kind: 'monster', name: ch.name,
          parts: ch.steps.map((x) => x.drawing || ''), by: ch.steps.map((x) => x.by),
        };
      }
      const st = ch.steps[s];
      return {
        key: c + '.' + s, c, s, kind: st.kind, by: st.by, text: st.text, drawing: st.drawing,
        prompt: st.prompt, auto: !!st.auto, part: st.part,
      };
    }

    parseKey(key) {
      const m = /^(\d+)\.(\d+|m)$/.exec(String(key));
      if (!m || !this.g) return null;
      const c = Number(m[1]);
      const ch = this.g.chains[c];
      if (!ch) return null;
      const s = m[2] === 'm' ? ch.steps.length : Number(m[2]);
      if (m[2] === 'm' && this.g.mode !== 'monstruo') return null;
      if (m[2] !== 'm' && !ch.steps[s]) return null;
      return { c, s };
    }

    authorsOf(key) {
      const k = this.parseKey(key);
      if (!k) return [];
      const ch = this.g.chains[k.c];
      if (k.s === ch.steps.length) return [...new Set(ch.steps.map((x) => x.by))];
      return [ch.steps[k.s].by];
    }

    isRevealed(key) {
      const k = this.parseKey(key);
      const rv = this.g && this.g.rv;
      if (!k || !rv) return false;
      if (k.c < rv.chain) return true;
      return k.c === rv.chain && k.s < rv.shown;
    }

    onReveal() {
      const g = this.g;
      if (this.phase !== 'reveal' || !g) return;
      const rv = g.rv;
      if (rv.shown < this.stepsCount(rv.chain)) {
        rv.shown++;
        this.broadcast({ t: 'item', item: this.itemFor(rv.chain, rv.shown - 1) });
      } else if (rv.chain < g.N - 1) {
        rv.chain++;
        rv.shown = 1;
        this.broadcast({ t: 'item', item: this.itemFor(rv.chain, 0) });
      } else return;
      this.push(true);
    }

    allow(pid, kind, max, win) {
      const k = pid + ':' + kind;
      const now = Date.now();
      let r = this.rate.get(k);
      if (!r || now - r.t > win) {
        r = { t: now, n: 0 };
        this.rate.set(k, r);
      }
      r.n++;
      return r.n <= max;
    }

    onReact(pid, msg) {
      const g = this.g;
      if (this.phase !== 'reveal' || !g) return;
      if (!D.REACTIONS.includes(msg.e)) return;
      const key = String(msg.key || '');
      if (!this.isRevealed(key)) return;
      if (!this.allow(pid, 'rx', 8, 1000)) return;
      const rec = g.reactions[key] || (g.reactions[key] = { by: {}, n: {} });
      rec.n[msg.e] = (rec.n[msg.e] || 0) + 1;
      if (g.order.includes(pid) && !this.authorsOf(key).includes(pid)) {
        const mine = rec.by[pid] || (rec.by[pid] = {});
        mine[msg.e] = 1;
      }
      this.broadcast({ t: 'rx', key, e: msg.e, from: pid });
      this.push();
    }

    likers(key) {
      const rec = this.g.reactions[key];
      if (!rec) return 0;
      const authors = this.authorsOf(key);
      return Object.keys(rec.by).filter((id) => !authors.includes(id)).length;
    }

    chainStars(c) {
      const out = {};
      const total = this.stepsCount(c);
      for (let s = 0; s < total; s++) {
        const key = this.itemFor(c, s).key;
        const rec = this.g.reactions[key];
        if (rec) out[key] = { stars: this.likers(key), n: rec.n };
      }
      return out;
    }

    // ---------- Subasta ----------
    onAuction() {
      const g = this.g;
      if (this.phase !== 'reveal' || !g) return;
      const rv = g.rv;
      if (rv.chain < g.N - 1 || rv.shown < this.stepsCount(rv.chain)) return;
      this.startAuction();
    }

    pickLots() {
      const g = this.g;
      const cands = [];
      if (g.mode === 'monstruo') {
        g.chains.forEach((ch, c) => {
          const parts = ch.steps.map((s) => s.drawing || '');
          if (parts.every(blankDrawing)) return;
          cands.push({
            key: c + '.m', title: ch.name, kind: 'monster',
            artists: [...new Set(ch.steps.map((s) => s.by))], art: { kind: 'monster', parts },
          });
        });
      } else {
        g.chains.forEach((ch, c) => ch.steps.forEach((st, s) => {
          if ((st.kind !== 'draw' && st.kind !== 'copy') || blankDrawing(st.drawing)) return;
          const title = st.kind === 'copy' ? st.prompt + ' (copia n.º ' + s + ')' : st.prompt;
          cands.push({ key: c + '.' + s, title, kind: 'drawing', artists: [st.by], art: { kind: 'drawing', drawing: st.drawing } });
        }));
      }
      for (const cd of cands) {
        cd.stars = this.likers(cd.key);
        cd.possible = Math.max(1, g.N - cd.artists.length);
        cd.estimate = 100 + Math.round((600 * Math.min(1, cd.stars / cd.possible)) / 10) * 10;
        cd.rand = Math.random();
      }
      cands.sort((a, b) => b.stars - a.stars || a.rand - b.rand);
      const K = Math.min(cands.length, U.clamp(g.N + 2, 3, 8));
      const picked = [];
      const per = {};
      for (const cd of cands) {
        if (picked.length >= K) break;
        if (cd.artists.length === 1 && (per[cd.artists[0]] || 0) >= 2) continue;
        picked.push(cd);
        cd.artists.forEach((a) => (per[a] = (per[a] || 0) + 1));
      }
      for (const cd of cands) {
        if (picked.length >= K) break;
        if (!picked.includes(cd)) picked.push(cd);
      }
      // De menor a mayor: el mejor dibujo queda para el final.
      picked.sort((a, b) => a.stars - b.stars || a.rand - b.rand);
      return picked.map((cd, i) => ({
        i, key: cd.key, title: cd.title, kind: cd.kind, artists: cd.artists,
        stars: cd.stars, possible: cd.possible, estimate: cd.estimate, art: cd.art,
      }));
    }

    startAuction() {
      const g = this.g;
      const wallets = {};
      const owned = {};
      for (const id of g.order) {
        wallets[id] = D.START_MONEY;
        owned[id] = [];
      }
      this.a = { stage: 'intro', lots: this.pickLots(), i: -1, wallets, owned, bid: null, bids: [], endsAt: 0, nextAt: 0, result: null };
      this.phase = 'auction';
      if (!this.a.lots.length) {
        this.finish();
        return;
      }
      this.push(true);
      this.save();
    }

    nextLot() {
      const a = this.a;
      if (a.stage === 'intro' || a.stage === 'sold') {
        a.i++;
        if (a.i >= a.lots.length) {
          this.finish();
          return;
        }
        a.stage = 'lot';
        a.bid = null;
        a.bids = [];
        a.result = null;
        a.endsAt = Date.now() + LOT_MS;
        const lot = a.lots[a.i];
        this.broadcast({ t: 'lotart', i: a.i, art: lot.art, gameId: this.g.gameId });
        this.push(true);
      }
    }

    onBid(pid, msg) {
      const a = this.a;
      if (this.phase !== 'auction' || !a || a.stage !== 'lot' || msg.lot !== a.i) return;
      if (!(pid in a.wallets) || Date.now() > a.endsAt) return;
      const lot = a.lots[a.i];
      if (lot.artists.length === 1 && lot.artists[0] === pid) return;
      if (a.bid && a.bid.by === pid) return;
      const cur = a.bid ? a.bid.amount : 0;
      const amount = Math.round(Number(msg.amount));
      if (!Number.isFinite(amount) || amount % 10 !== 0 || amount < cur + 10 || amount > a.wallets[pid]) return;
      a.bid = { by: pid, amount };
      a.bids.push({ by: pid, amount });
      if (a.bids.length > 6) a.bids.shift();
      a.endsAt = Math.max(a.endsAt, Date.now() + EXT_MS);
      this.push(true);
    }

    closeLot() {
      const a = this.a;
      const lot = a.lots[a.i];
      a.stage = 'sold';
      if (a.bid) {
        const { by, amount } = a.bid;
        a.wallets[by] -= amount;
        const payees = lot.artists.filter((x) => x !== by && x in a.wallets);
        const shares = {};
        if (payees.length) {
          const base = Math.floor(amount / payees.length / 10) * 10;
          payees.forEach((x, k) => {
            const v = base + (k === 0 ? amount - base * payees.length : 0);
            a.wallets[x] += v;
            shares[x] = v;
          });
        }
        const t = U.weighted(D.TASADOR);
        const value = Math.round((lot.estimate * t.m) / 10) * 10;
        a.owned[by].push({ i: a.i, paid: amount, value, m: t.m });
        a.result = { sold: true, by, amount, shares, m: t.m, title: t.title, line: t.line, tone: t.tone, value };
        a.nextAt = Date.now() + SOLD_MS;
      } else {
        a.result = { sold: false };
        a.nextAt = Date.now() + UNSOLD_MS;
      }
      this.push(true);
      this.save();
    }

    finish() {
      const g = this.g;
      const a = this.a;
      this.phase = 'results';
      const rows = g.order.map((pid) => {
        const owned = a ? a.owned[pid] : [];
        const art = owned.reduce((s, o) => s + o.value, 0);
        const money = a ? a.wallets[pid] : D.START_MONEY;
        return { pid, money, art, total: money + art, owned };
      }).sort((x, y) => y.total - x.total || y.money - x.money);

      const starsBy = {};
      const laughsBy = {};
      for (const key of Object.keys(g.reactions)) {
        const rec = g.reactions[key];
        const authors = this.authorsOf(key);
        for (const au of authors) {
          for (const [liker, emojis] of Object.entries(rec.by)) {
            if (authors.includes(liker)) continue;
            starsBy[au] = (starsBy[au] || 0) + 1;
            if (emojis['😂']) laughsBy[au] = (laughsBy[au] || 0) + 1;
          }
        }
      }
      const best = (fn) => {
        let top = null;
        let topV = 0;
        for (const pid of g.order) {
          const v = fn(pid);
          if (v > topV) {
            top = pid;
            topV = v;
          }
        }
        return top ? { pid: top, v: topV } : null;
      };
      const lotTitle = (i) => (a && a.lots[i] ? a.lots[i].title : '');
      const awards = [];
      if (rows.length) awards.push({ icon: '🏆', title: 'Magnate del arte', pid: rows[0].pid, text: 'Terminó con la fortuna más grande: 🥭 ' + U.fmt(rows[0].total) + '.' });
      const pic = best((pid) => starsBy[pid] || 0);
      if (pic) awards.push({ icon: '🎨', title: 'Picasso del grupo', pid: pic.pid, text: 'Sus obras juntaron ' + pic.v + ' reacciones.' });
      const lol = best((pid) => laughsBy[pid] || 0);
      if (lol) awards.push({ icon: '😂', title: 'Payaso oficial', pid: lol.pid, text: 'Hizo reír ' + lol.v + (lol.v === 1 ? ' vez.' : ' veces.') });
      let spend = null;
      let fake = null;
      let eye = null;
      for (const r of rows) {
        for (const o of r.owned) {
          if (!spend || o.paid > spend.paid) spend = { pid: r.pid, ...o };
          if (o.m === 0 && (!fake || o.paid > fake.paid)) fake = { pid: r.pid, ...o };
          if (o.value - o.paid > 0 && (!eye || o.value - o.paid > eye.value - eye.paid)) eye = { pid: r.pid, ...o };
        }
      }
      if (spend) awards.push({ icon: '💸', title: 'Billetera floja', pid: spend.pid, text: 'Pagó 🥭 ' + U.fmt(spend.paid) + ' por «' + lotTitle(spend.i) + '».' });
      if (eye) awards.push({ icon: '👀', title: 'Buen ojo', pid: eye.pid, text: 'Ganó 🥭 ' + U.fmt(eye.value - eye.paid) + ' con «' + lotTitle(eye.i) + '».' });
      if (fake) awards.push({ icon: '🤡', title: 'Lo estafaron', pid: fake.pid, text: 'Pagó 🥭 ' + U.fmt(fake.paid) + ' por una falsificación.' });
      const cheap = rows.filter((r) => !r.owned.length).sort((x, y) => y.money - x.money)[0];
      if (cheap && a && a.lots.length) awards.push({ icon: '🧐', title: 'Amarrete', pid: cheap.pid, text: 'No compró nada. Se guardó 🥭 ' + U.fmt(cheap.money) + '.' });

      this.results = {
        rows, awards,
        lots: a ? a.lots.map((l) => ({ i: l.i, title: l.title, kind: l.kind, artists: l.artists, estimate: l.estimate })) : [],
      };
      this.push(true);
      this.save();
    }

    backToLobby() {
      this.phase = 'lobby';
      this.g = null;
      this.a = null;
      this.results = null;
      for (const p of [...this.players.values()]) {
        if (!p.online) this.players.delete(p.id);
        else p.spectator = false;
      }
      this.push(true);
      this.save();
    }

    // ---------- Reloj ----------
    tick() {
      const now = Date.now();
      try {
        if (this.phase === 'round' && this.g) {
          if (now > this.g.deadline + GRACE) this.endRound();
          else this.checkRoundEnd();
        }
        if (this.phase === 'auction' && this.a) {
          if (this.a.stage === 'lot' && now >= this.a.endsAt) this.closeLot();
          else if (this.a.stage === 'sold' && now >= this.a.nextAt) this.nextLot();
        }
      } catch (e) {
        console.error('[mamarracho] error en el reloj', e);
      }
      if (now - this.lastPing > 4000) {
        this.lastPing = now;
        if (this.link) this.link.broadcast({ t: 'ping' });
      }
      let changed = false;
      for (const p of [...this.players.values()]) {
        if (p.connId === 'local') continue;
        if (p.online && now - p.lastSeen > OFFLINE_MS) {
          p.online = false;
          if (p.connId) {
            this.conns.delete(p.connId);
            if (this.link) this.link.drop(p.connId);
          }
          p.connId = null;
          changed = true;
        }
        if (!p.online && this.phase === 'lobby' && now - (p.lastSeen || 0) > LOBBY_DROP_MS) {
          this.players.delete(p.id);
          changed = true;
        }
      }
      if (changed) this.push();
    }

    // ---------- Estado público ----------
    publicState() {
      const now = Date.now();
      const g = this.g;
      const s = {
        code: this.code,
        phase: this.phase,
        host: this.hostPid,
        settings: this.settings,
        gameId: g ? g.gameId : null,
        players: [...this.players.values()].map((p) => ({
          id: p.id, name: p.name, avatar: p.avatar, color: p.color, online: !!p.online, spectator: !!p.spectator,
        })),
      };
      if (g) {
        s.order = g.order;
        s.mode = g.mode;
      }
      if (this.phase === 'round' && g) {
        s.round = {
          n: g.round, total: g.rounds, kind: g.kind, endsIn: Math.max(0, g.deadline - now),
          duration: g.duration, done: [...g.submitted.keys()],
        };
      }
      if (this.phase === 'reveal' && g) {
        const rv = g.rv;
        const ch = g.chains[rv.chain];
        const total = this.stepsCount(rv.chain);
        s.reveal = {
          chain: rv.chain, shown: rv.shown, total, chains: g.N, owner: ch.owner,
          seed: ch.seed || null, name: ch.name || null, stars: this.chainStars(rv.chain),
          done: rv.chain === g.N - 1 && rv.shown >= total,
        };
      }
      if (this.phase === 'auction' && this.a) {
        const a = this.a;
        const lot = a.lots[a.i];
        s.auction = {
          stage: a.stage, i: a.i, count: a.lots.length,
          lot: lot ? { i: lot.i, key: lot.key, title: lot.title, kind: lot.kind, artists: lot.artists, stars: lot.stars, possible: lot.possible, estimate: lot.estimate } : null,
          bid: a.bid, bids: a.bids,
          endsIn: a.stage === 'lot' ? Math.max(0, a.endsAt - now) : 0,
          nextIn: a.stage === 'sold' ? Math.max(0, a.nextAt - now) : 0,
          wallets: a.wallets,
          owned: Object.fromEntries(Object.entries(a.owned).map(([k, v]) => [k, v.length])),
          result: a.result,
        };
      }
      if (this.phase === 'results') s.results = this.results;
      return s;
    }

    // ---------- Guardado (por si el anfitrión recarga la página) ----------
    scheduleSave() {
      if (this._saveT || !this.persist) return;
      this._saveT = setTimeout(() => {
        this._saveT = 0;
        this.save();
      }, 1500);
    }

    save() {
      if (!this.persist) return;
      try {
        const g = this.g;
        this.persist({
          v: 1, t: Date.now(), code: this.code, hostPid: this.hostPid, phase: this.phase, settings: this.settings,
          players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, spectator: !!p.spectator, joinedAt: p.joinedAt })),
          g: g ? { ...g, submitted: [...g.submitted], used: [...g.used] } : null,
          a: this.a, results: this.results,
        });
      } catch (e) { /* sin espacio: seguimos sin guardar */ }
    }

    static restore(snap, link) {
      const srv = new Server(snap.code, link);
      const shift = Math.max(0, Date.now() - (snap.t || Date.now()));
      srv.hostPid = snap.hostPid;
      srv.phase = snap.phase;
      srv.settings = snap.settings || srv.settings;
      for (const p of snap.players || []) {
        srv.players.set(p.id, { ...p, online: false, connId: null, lastSeen: Date.now() });
      }
      if (snap.g) {
        srv.g = { ...snap.g, submitted: new Map(snap.g.submitted || []), used: new Set(snap.g.used || []) };
        srv.g.deadline += shift;
      }
      if (snap.a) {
        srv.a = snap.a;
        srv.a.endsAt += shift;
        srv.a.nextAt += shift;
      }
      srv.results = snap.results || null;
      return srv;
    }
  }

  M.Server = Server;
})(globalThis.M = globalThis.M || {});
