/* Mamarracho — arranque: perfil, crear/unirse a sala, mensajes y pantallas. */
(function (M) {
  'use strict';
  const { U, D, S, UI } = M;

  const UNKNOWN = { id: '', name: 'Alguien', avatar: '❓', color: '#C9CCD6', online: true };

  const App = (M.App = {
    pid: null,
    profile: null,
    role: null,
    code: null,
    inviteCode: null,
    server: null,
    link: null,
    state: null,
    task: null,
    gameId: null,
    items: new Map(),
    lotArt: new Map(),
    screen: null,
    screenKey: null,

    // ---------- Perfil ----------
    loadProfile() {
      // Primero el de esta pestaña (por si hay varias abiertas en el mismo navegador).
      const saved = U.store.sget('mm.profile', null) || U.store.get('mm.profile', null) || {};
      this.profile = {
        name: typeof saved.name === 'string' ? saved.name.slice(0, 16) : '',
        avatar: D.AVATARS.includes(saved.avatar) ? saved.avatar : U.pick(D.AVATARS),
        color: D.AVATAR_COLORS.includes(saved.color) ? saved.color : U.pick(D.AVATAR_COLORS),
      };
      this.saveProfile();
    },
    saveProfile() {
      U.store.set('mm.profile', this.profile);
      U.store.sset('mm.profile', this.profile);
    },
    randomizeAvatar() {
      let a = this.profile.avatar;
      while (a === this.profile.avatar) a = U.pick(D.AVATARS);
      this.profile.avatar = a;
      this.profile.color = U.pick(D.AVATAR_COLORS.filter((c) => c !== this.profile.color));
      this.saveProfile();
      if (this.state && this.state.phase === 'lobby') this.send({ t: 'profile', ...this.profile });
    },
    hello() {
      return { t: 'hello', pid: this.pid, name: U.cleanText(this.profile.name, 16), avatar: this.profile.avatar, color: this.profile.color };
    },

    // ---------- Consultas ----------
    isHost() {
      return !!(this.state && this.state.host === this.pid);
    },
    me() {
      return this.player(this.pid);
    },
    player(id) {
      const p = this.state && this.state.players.find((x) => x.id === id);
      return p || { ...UNKNOWN, id: id || '' };
    },
    inviteLink() {
      return location.origin + location.pathname + '?sala=' + this.code;
    },

    send(msg) {
      if (this.role === 'host' && this.server) this.server.receive('local', msg);
      else if (this.link) this.link.send(msg);
    },

    // ---------- Anfitrión ----------
    makeHostLink(code) {
      return new M.Net.HostLink(code, {
        onMessage: (id, msg) => this.server && this.server.receive(id, msg),
        onDisconnect: (id) => this.server && this.server.disconnect(id),
        onStatus: () => {},
      });
    },

    async createRoom() {
      UI.busy('Creando la sala…');
      let err = null;
      for (let i = 0; i < 4; i++) {
        const code = U.code();
        const link = this.makeHostLink(code);
        try {
          await link.start();
          this.startHost(code, link, null);
          return;
        } catch (e) {
          err = e;
          if (e && e.type === 'unavailable-id') continue;
          break;
        }
      }
      UI.busy(false);
      console.warn('[mamarracho] no se pudo crear la sala', err);
      UI.toast('No se pudo crear la sala. Revisá tu conexión a internet y probá de nuevo.', 'error', 5000);
    },

    startHost(code, link, snap) {
      this.role = 'host';
      this.code = code;
      this.link = link;
      const server = snap ? M.Server.restore(snap, link) : new M.Server(code, link);
      server.persist = (data) => U.store.sset('mm.hostSnap', data);
      server.attachLocal(this.pid, (msg) => this.onMessage(msg));
      this.server = server;
      U.store.sset('mm.session', { code, role: 'host' });
      history.replaceState(null, '', '?sala=' + code);
      this.inviteCode = null;
      this.send(this.hello());
    },

    async resumeHost(snap) {
      UI.busy('Recuperando tu sala…');
      for (let i = 0; i < 10; i++) {
        const link = this.makeHostLink(snap.code);
        try {
          await link.start();
          this.startHost(snap.code, link, snap);
          UI.busy(false);
          UI.toast('¡Sala recuperada! Los demás se reconectan solos.');
          return;
        } catch (e) {
          if (e && e.type === 'unavailable-id') {
            await U.sleep(2000);
            continue;
          }
          break;
        }
      }
      UI.busy(false);
      U.store.sset('mm.session', undefined);
      U.store.sset('mm.hostSnap', undefined);
      UI.toast('No se pudo recuperar la sala. Creá una nueva.', 'error', 5000);
      this.render();
    },

    // ---------- Invitado ----------
    joinRoom(code) {
      UI.busy('Entrando a la sala ' + code + '…');
      this.role = 'guest';
      this.code = code;
      const link = new M.Net.ClientLink(code, {
        onOpen: () => {
          this.netStatus(true);
          this.send(this.hello());
        },
        onMessage: (msg) => this.onMessage(msg),
        onClose: () => this.netStatus(false),
        onFail: (reason) => this.onLinkFail(reason),
      });
      this.link = link;
      U.store.sset('mm.session', { code, role: 'guest' });
      link.connect();
    },

    onLinkFail(reason) {
      const code = this.code;
      const msgs = {
        notfound: 'No encontramos la sala ' + code + '. Revisá el código (o que el anfitrión siga con la pestaña abierta).',
        timeout: 'No pudimos conectarnos con la sala. Probá con otra red (Wi-Fi o datos) y volvé a entrar.',
        closed: 'No pudimos conectarnos con la sala. Probá de nuevo en un ratito.',
        network: 'Parece que no hay internet. Revisá tu conexión y volvé a entrar.',
        lost: 'Se perdió la conexión con la sala. ¿El anfitrión cerró la pestaña?',
        browser: 'Tu navegador no puede conectarse al juego. Probá con Chrome, Safari o Firefox actualizados.',
        'no-peerjs': 'No se pudo cargar el juego completo. Revisá tu conexión y recargá la página.',
      };
      this.leave(true);
      UI.toast(msgs[reason] || msgs.timeout, 'error', 7000);
    },

    netStatus(ok) {
      const el = U.$('#net');
      if (!el) return;
      el.hidden = ok;
    },

    // ---------- Salir ----------
    async confirmLeave() {
      if (!this.state && !this.link) return;
      const host = this.role === 'host';
      const inGame = this.state && this.state.phase !== 'lobby';
      const buttons = [];
      if (host && inGame) buttons.push({ label: 'Terminar la partida y volver a la sala', value: 'lobby', cls: 'primary' });
      buttons.push({ label: host ? 'Cerrar la sala' : 'Salir de la sala', value: 'leave', cls: 'danger' });
      buttons.push({ label: 'Cancelar', value: null });
      const v = await UI.choose({
        title: host ? '¿Qué querés hacer?' : '¿Salir de la sala?',
        text: host ? 'Sos el anfitrión: si cerrás la sala, se termina para todos.' : 'Podés volver a entrar con el mismo código.',
        buttons,
      });
      if (v === 'lobby') this.send({ t: 'again' });
      else if (v === 'leave') this.leave();
    },

    leave() {
      if (this.role === 'host' && this.server) {
        const srv = this.server;
        const link = this.link;
        srv.local = null;
        srv.persist = null;
        srv.broadcast({ t: 'closed' });
        setTimeout(() => {
          srv.stop();
          if (link) link.close();
        }, 400);
      } else if (this.link) {
        this.link.close();
      }
      this.server = null;
      this.link = null;
      this.role = null;
      this.state = null;
      this.task = null;
      this.gameId = null;
      this.items.clear();
      this.lotArt.clear();
      U.store.sset('mm.session', undefined);
      U.store.sset('mm.hostSnap', undefined);
      history.replaceState(null, '', location.pathname);
      this.inviteCode = null;
      this.netStatus(true);
      UI.busy(false);
      UI.keepAwake(false);
      this.render();
    },

    // ---------- Mensajes ----------
    onMessage(msg) {
      if (!msg || typeof msg.t !== 'string') return;
      switch (msg.t) {
        case 'welcome':
          UI.busy(false);
          this.code = msg.code;
          if (this.role === 'guest') history.replaceState(null, '', '?sala=' + msg.code);
          break;
        case 'state':
          this.setState(msg.s);
          break;
        case 'task':
          if (msg.task) {
            this.task = msg.task;
            this.render();
          }
          break;
        case 'item':
          if (msg.item && typeof msg.item.key === 'string') {
            this.items.set(msg.item.key, msg.item);
            if (this.screen && this.screen.onItem) this.screen.onItem(msg.item);
          }
          break;
        case 'rx':
          if (this.screen && this.screen.onReaction) this.screen.onReaction(msg);
          break;
        case 'lotart':
          if (msg.gameId && this.gameId && msg.gameId !== this.gameId) return;
          this.lotArt.set(msg.i, msg.art);
          if (this.screen && this.screen.onLotArt) this.screen.onLotArt(msg.i);
          break;
        case 'ping':
          this.send({ t: 'pong' });
          break;
        case 'kicked':
          this.leave();
          UI.toast('El anfitrión te sacó de la sala.', 'error', 4000);
          break;
        case 'closed':
          this.leave();
          UI.toast('El anfitrión cerró la sala.', 'error', 4000);
          break;
        case 'error':
          UI.busy(false);
          UI.toast(msg.msg || 'Algo salió mal.', 'error', 4500);
          if (msg.code === 'full') this.leave();
          break;
        default:
      }
    },

    setState(s) {
      if (!s || !Array.isArray(s.players)) return;
      if (s.gameId !== this.gameId) {
        this.gameId = s.gameId;
        this.items.clear();
        this.lotArt.clear();
        if (this.task && this.task.gameId !== s.gameId) this.task = null;
      }
      this.state = s;
      this.code = s.code;
      UI.busy(false);
      UI.keepAwake(s.phase !== 'lobby');
      this.render();
    },

    // ---------- Pantallas ----------
    screenKeyFor(s) {
      if (!s) return 'home';
      if (s.phase === 'lobby') return 'lobby';
      if (s.phase === 'round') {
        const playing = (s.order || []).includes(this.pid);
        return playing ? 'round:' + s.gameId + ':' + s.round.n : 'watch:' + s.gameId;
      }
      return s.phase + ':' + (s.gameId || '');
    },

    rerender() {
      this.screenKey = null;
      this.render();
    },

    render() {
      const s = this.state;
      const key = this.screenKeyFor(s);
      if (key !== this.screenKey) {
        if (this.screen && this.screen.destroy) this.screen.destroy();
        const root = U.$('#app');
        U.clear(root);
        const kind = key.split(':')[0];
        this.screen = M.Screens[kind](this, key);
        root.appendChild(this.screen.el);
        this.screenKey = key;
        document.body.dataset.screen = kind;
        window.scrollTo(0, 0);
      }
      if (s && this.screen.update) this.screen.update(s);
      this.renderTopbar();
    },

    renderTopbar() {
      const inRoom = !!(this.state || this.link);
      const chip = U.$('#tb-room');
      chip.hidden = !this.state;
      if (this.state) U.$('#tb-code').textContent = this.state.code;
      U.$('#tb-leave').hidden = !inRoom;
      const mute = U.$('#tb-sound');
      mute.textContent = S.muted ? '🔇' : '🔊';
      mute.setAttribute('aria-label', S.muted ? 'Activar sonido' : 'Silenciar');
      mute.title = S.muted ? 'Activar sonido' : 'Silenciar';
    },

    // ---------- Inicio ----------
    boot() {
      globalThis.MM_DEBUG = !!U.store.get('mm.debug', false);
      this.pid = U.store.sget('mm.pid', null);
      if (!this.pid || !/^[a-z0-9]{6,24}$/.test(this.pid)) {
        this.pid = U.uid(12);
        U.store.sset('mm.pid', this.pid);
      }
      this.loadProfile();
      const sala = U.normCode(new URLSearchParams(location.search).get('sala'));
      this.inviteCode = sala.length === 4 ? sala : null;

      U.$('#tb-sound').addEventListener('click', () => {
        S.toggle();
        this.renderTopbar();
      });
      U.$('#tb-leave').addEventListener('click', () => this.confirmLeave());
      U.$('#tb-room').addEventListener('click', async () => {
        if (!this.code) return;
        const ok = await U.copy(this.inviteLink());
        UI.toast(ok ? '¡Link de la sala copiado!' : 'Código de la sala: ' + this.code);
      });
      window.addEventListener('beforeunload', (e) => {
        if (this.role === 'host' && this.state && this.state.players.length > 1) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.state && this.state.phase !== 'lobby') UI.keepAwake(true);
      });

      this.render();

      if (typeof Peer !== 'function') {
        UI.toast('No se pudo cargar la parte de conexión del juego. Revisá tu internet y recargá la página.', 'error', 9000);
        return;
      }

      const sess = U.store.sget('mm.session', null);
      if (sess && sess.role === 'host') {
        const snap = U.store.sget('mm.hostSnap', null);
        if (snap && snap.code === sess.code && snap.hostPid === this.pid && Date.now() - snap.t < 15 * 60 * 1000) {
          this.resumeHost(snap);
          return;
        }
      }
      if (sess && sess.role === 'guest' && sess.code && (!this.inviteCode || this.inviteCode === sess.code)) {
        this.joinRoom(sess.code);
        return;
      }
      U.store.sset('mm.session', undefined);
      U.store.sset('mm.hostSnap', undefined);
    },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot());
  else App.boot();
})(globalThis.M = globalThis.M || {});
