/* Mamarracho — pantallas: inicio, sala de espera, rondas y espectador. */
(function (M) {
  'use strict';
  const { U, D, S, UI } = M;
  const { h } = U;
  const Screens = (M.Screens = M.Screens || {});
  const BANNER_MS = 1700;

  // ================= INICIO =================
  Screens.home = function (app) {
    const prof = app.profile;
    const avatarBtn = UI.avatar(prof, 'xl', 'button');
    avatarBtn.setAttribute('aria-label', 'Cambiar avatar');
    avatarBtn.addEventListener('click', () => {
      app.randomizeAvatar();
      UI.setAvatar(avatarBtn, app.profile);
      avatarBtn.classList.remove('spin');
      void avatarBtn.offsetWidth;
      avatarBtn.classList.add('spin');
      S.play('pop');
    });

    const name = h('input#name.input', {
      type: 'text', maxLength: 16, placeholder: 'Tu apodo', autocomplete: 'nickname', enterkeyhint: 'go', spellcheck: 'false',
    });
    name.value = prof.name || '';
    name.addEventListener('input', () => {
      app.profile.name = name.value;
      app.saveProfile();
    });

    const needName = () => {
      if (U.cleanText(name.value, 16)) return false;
      name.focus();
      name.classList.remove('shake');
      void name.offsetWidth;
      name.classList.add('shake');
      UI.toast('Primero escribí tu nombre 🙂');
      return true;
    };

    let actions;
    const invite = app.inviteCode;
    if (invite) {
      const go = h('button.btn.primary.xl', { type: 'button' }, 'Entrar a la sala');
      go.addEventListener('click', () => {
        if (!needName()) app.joinRoom(invite);
      });
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go.click();
      });
      const other = h('button.btn.link', { type: 'button' }, 'Prefiero crear mi propia sala');
      other.addEventListener('click', () => {
        app.inviteCode = null;
        history.replaceState(null, '', location.pathname);
        app.rerender();
      });
      actions = h('div.home-actions',
        h('div.invite-box', h('span', 'Te invitaron a la sala'), h('b.code-chip', invite)),
        go, other);
    } else {
      const create = h('button.btn.primary.xl', { type: 'button' }, '✏️ Crear sala');
      create.addEventListener('click', () => {
        if (!needName()) app.createRoom();
      });
      const code = h('input#code.input.code-input', {
        type: 'text', maxLength: 4, placeholder: 'ABCD', autocomplete: 'off', autocapitalize: 'characters',
        spellcheck: 'false', 'aria-label': 'Código de la sala', enterkeyhint: 'go',
      });
      code.addEventListener('input', () => {
        const v = U.normCode(code.value);
        if (v !== code.value) code.value = v;
      });
      const join = h('button.btn', { type: 'button' }, 'Entrar');
      const doJoin = () => {
        if (needName()) return;
        const c = U.normCode(code.value);
        if (c.length !== 4) {
          UI.toast('El código de la sala tiene 4 letras.');
          code.focus();
          return;
        }
        app.joinRoom(c);
      };
      join.addEventListener('click', doJoin);
      code.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doJoin();
      });
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') code.focus();
      });
      actions = h('div.home-actions', create, h('div.divider', h('span', 'o entrá con un código')), h('div.join-row', code, join));
    }

    const card = h('div.card.start-card',
      h('div.me-row',
        h('div.me-av', avatarBtn, h('small', 'Tocá para cambiar')),
        h('label.field', { for: 'name' }, h('span.field-label', '¿Cómo te llamás?'), name)),
      actions);

    const steps = [
      ['✍️', 'Escribí', 'Inventá una frase disparatada.'],
      ['🎨', 'Dibujá', 'Te toca la frase de otro: dibujala como te salga.'],
      ['🤔', 'Adiviná', 'Mirá el dibujo de otro y escribí qué es.'],
      ['🔨', 'Subastá', 'Los mejores mamarrachos salen a remate. Gana quien termine más rico.'],
    ];
    const howto = h('div.howto',
      h('h2', '¿Cómo se juega?'),
      h('ol.steps', steps.map(([ic, t, d], i) => h('li.step', { style: { '--i': i } }, h('span.step-ic', ic), h('div.step-copy', h('b', t), h('span', d))))),
      h('p.howto-modes', h('b', '5 modos: '), D.MODE_ORDER.map((id, i) => [i ? ' · ' : '', h('span.nowrap', UI.modeLabel(id))])),
      h('p.howto-note', 'Cada uno juega desde su celu o compu. De 2 a 12 jugadores (más divertido con 4 o más).'));

    const el = h('section.screen.home',
      h('div.home-hero', UI.logo(), h('p.tagline', 'Dibujá, adiviná y subastá los peores dibujos de tus amigos.')),
      h('div.home-grid', card, howto));
    if (!prof.name) setTimeout(() => name.focus(), 300);
    return { el };
  };

  // ================= SALA DE ESPERA =================
  Screens.lobby = function (app) {
    const code = app.code;
    const link = app.inviteLink();
    const qr = UI.qr(link);

    const copyBtn = h('button.btn', { type: 'button' }, '🔗 Copiar link');
    copyBtn.addEventListener('click', async () => {
      const ok = await U.copy(link);
      UI.toast(ok ? '¡Link copiado! Mandáselo a tus amigos.' : 'No se pudo copiar. Pasales el código: ' + code);
    });
    let shareBtn = null;
    if (navigator.share) {
      shareBtn = h('button.btn', { type: 'button' }, '📤 Compartir');
      shareBtn.addEventListener('click', () => {
        navigator.share({ title: 'Mamarracho', text: '¡Vení a jugar Mamarracho! Sala ' + code, url: link }).catch(() => {});
      });
    }

    const invite = h('div.card.invite-card',
      h('div.invite-main',
        h('span.eyebrow', 'Código de la sala'),
        h('div.big-code', code.split('').map((c, i) => h('span', { style: { '--i': i } }, c))),
        h('p.invite-help', 'Tus amigos entran con este código, con el link o escaneando el QR.'),
        h('div.btn-row', copyBtn, shareBtn)),
      qr ? h('div.qr-box', qr, h('small', 'Escaneá para entrar')) : null);

    const plist = h('ul.player-grid');
    const pcount = h('span.count-chip');
    const playersCard = h('div.card.players-card', h('div.card-head', h('h2', 'Jugadores'), pcount), plist);

    const modeBtns = D.MODE_ORDER.map((id) => {
      const m = D.MODES[id];
      const b = h('button.mode-card', { type: 'button', dataset: { mode: id }, 'aria-pressed': 'false' },
        h('span.mode-ic', m.icon), h('span.mode-name', m.name), h('span.mode-desc', m.short));
      b.addEventListener('click', () => {
        if (!app.isHost()) return;
        app.send({ t: 'settings', mode: id });
        S.play('click');
      });
      return b;
    });
    const speedBtns = D.SPEED_ORDER.map((id) => {
      const sp = D.SPEEDS[id];
      const b = h('button.seg-btn', { type: 'button', dataset: { speed: id }, 'aria-pressed': 'false' }, sp.icon + ' ' + sp.name);
      b.addEventListener('click', () => {
        if (!app.isHost()) return;
        app.send({ t: 'settings', speed: id });
        S.play('click');
      });
      return b;
    });
    const modeNote = h('span.card-note');
    const speedNote = h('p.speed-note');
    const modesCard = h('div.card.modes-card',
      h('div.card-head', h('h2', 'Modo de juego'), modeNote),
      h('div.mode-grid', modeBtns),
      h('div.speed-row', h('span.field-label', 'Velocidad'), h('div.seg', speedBtns)),
      speedNote);

    const startBtn = h('button.btn.primary.xl', { type: 'button' }, '¡Empezar partida!');
    startBtn.addEventListener('click', () => {
      startBtn.disabled = true;
      app.send({ t: 'start' });
      setTimeout(() => (startBtn.disabled = false), 1500);
    });
    const hint = h('p.start-hint');
    const hostNote = h('p.host-note', '📌 Sos el anfitrión: la partida corre en tu dispositivo. No cierres esta pestaña ni bloquees la pantalla mientras juegan.');
    const startBar = h('div.start-bar', startBtn, hint, hostNote);

    const el = h('section.screen.lobby', invite, h('div.lobby-grid', playersCard, modesCard), startBar);

    const known = new Set();
    let first = true;

    async function kick(p) {
      const ok = await UI.choose({
        title: '¿Sacar a ' + p.name + '?',
        text: 'Va a salir de la sala. Puede volver a entrar con el código.',
        buttons: [{ label: 'Sí, sacarlo', value: true, cls: 'danger' }, { label: 'Cancelar', value: false }],
      });
      if (ok) app.send({ t: 'kick', pid: p.id });
    }

    function update(s) {
      const host = app.isHost();
      const players = s.players;
      pcount.textContent = players.length + ' de ' + D.MAX_PLAYERS;
      U.clear(plist);
      let joined = false;
      for (const p of players) {
        const isNew = !first && !known.has(p.id);
        if (isNew) joined = true;
        const li = h('li.player', { class: (isNew ? 'pop-in ' : '') + (p.id === s.host ? 'is-host' : '') },
          UI.avatar(p, 'l'),
          h('span.player-name', p.name),
          h('span.badges',
            p.id === s.host ? h('span.badge.crown', { title: 'Anfitrión' }, '👑 anfitrión') : null,
            p.id === app.pid ? h('span.badge.you', 'vos') : null,
            !p.online ? h('span.badge.off', 'sin conexión') : null));
        if (host && p.id !== app.pid) {
          const k = h('button.kick', { type: 'button', title: 'Sacar de la sala', 'aria-label': 'Sacar a ' + p.name }, '✕');
          k.addEventListener('click', () => kick(p));
          li.appendChild(k);
        }
        plist.appendChild(li);
      }
      const ghosts = Math.max(0, Math.min(D.MAX_PLAYERS, Math.max(4, players.length + 1)) - players.length);
      for (let i = 0; i < ghosts; i++) {
        plist.appendChild(h('li.player.empty', h('span.av.av-l.ghost', '?'), h('span.player-name', 'Esperando…')));
      }
      if (joined) S.play('join');
      known.clear();
      players.forEach((p) => known.add(p.id));
      first = false;

      modeBtns.forEach((b) => {
        const on = b.dataset.mode === s.settings.mode;
        b.classList.toggle('on', on);
        b.classList.toggle('readonly', !host);
        b.setAttribute('aria-pressed', String(on));
      });
      speedBtns.forEach((b) => {
        const on = b.dataset.speed === s.settings.speed;
        b.classList.toggle('on', on);
        b.classList.toggle('readonly', !host);
        b.setAttribute('aria-pressed', String(on));
      });
      modeNote.textContent = host ? 'Elegí uno' : 'Lo elige el anfitrión';
      const sp = D.SPEEDS[s.settings.speed] || D.SPEEDS.normal;
      speedNote.textContent = s.settings.mode === 'monstruo'
        ? sp.part + ' segundos para dibujar cada parte.'
        : s.settings.mode === 'copion'
          ? sp.memo + ' segundos para memorizar y ' + sp.draw + ' para dibujar.'
          : sp.write + ' s para escribir · ' + sp.draw + ' s para dibujar · ' + sp.guess + ' s para adivinar.';

      const online = players.filter((p) => p.online).length;
      hostNote.hidden = !host;
      if (host) {
        startBtn.hidden = false;
        startBtn.disabled = online < 2;
        hint.textContent = online < 2
          ? 'Esperando a que entre alguien más…'
          : online < 4
            ? 'Ya pueden jugar. ¡Con 4 o más es más divertido!'
            : '¡Todo listo! Cuando quieras, empezá.';
      } else {
        startBtn.hidden = true;
        hint.textContent = 'Esperando a que ' + app.player(s.host).name + ' empiece la partida…';
      }
    }

    return { el, update };
  };

  // ================= RONDA =================
  const KIND_TITLE = { write: '¡A escribir!', draw: '¡A dibujar!', guess: '¡A adivinar!', copy: '¡A memorizar!', part: '¡A dibujar!' };

  Screens.round = function (app) {
    const timer = new UI.PencilTimer();
    const roundLabel = h('b.round-num');
    const modeChip = h('span.chip');
    const doneCount = h('span.done-count');
    const doneRow = h('div.done-row');
    const head = h('div.round-head', h('div.round-info', modeChip, roundLabel, doneCount), timer.el, doneRow);
    const body = h('div.round-body', h('div.loading-task', h('span.spinner'), 'Preparando tu hoja…'));
    const el = h('section.screen.round', head, body);

    let task = null;
    let built = false;
    let submitted = false;
    let pad = null;
    let input = null;
    let doneBtn = null;
    let waitPanel = null;
    let waitText = null;
    let changeBtn = null;
    let memoT = 0;
    let keyHandler = null;
    let lastSent = 0;
    let lastUnsub = 0;
    let autoSent = false;
    let bannerShown = false;

    function banner(r) {
      if (bannerShown) return;
      bannerShown = true;
      const b = h('div.round-banner', { 'aria-hidden': 'true' },
        h('div.rb-card', h('span.rb-round', 'Ronda ' + (r.n + 1) + ' de ' + r.total), h('span.rb-title', KIND_TITLE[r.kind] || '¡Vamos!')));
      el.appendChild(b);
      S.play('whoosh');
      setTimeout(() => b.remove(), BANNER_MS);
    }

    function content() {
      if (!task) return {};
      if (task.kind === 'write' || task.kind === 'guess') return { text: input ? input.value : '' };
      return { drawing: pad ? pad.data() : '[]' };
    }

    function submit(auto) {
      if (!task || submitted) return;
      if (auto !== true) {
        if ((task.kind === 'write' || task.kind === 'guess') && !U.cleanText(input.value, 90)) {
          UI.toast(task.kind === 'write' ? 'Escribí algo (o tocá el dado 🎲).' : 'Escribí qué te parece que es.');
          input.focus();
          return;
        }
        if (pad && pad.isEmpty()) {
          UI.toast('La hoja está vacía. ¡Dibujá algo! 🙂');
          return;
        }
      }
      if (task.kind === 'copy' && !pad) return; // todavía memorizando
      app.send({ t: 'submit', round: task.round, ...content() });
      lastSent = Date.now();
      setSubmitted(true);
      S.play('submit');
    }

    function unsubmit() {
      if (!submitted || !task || timer.remaining() < 1500) return;
      app.send({ t: 'unsubmit', round: task.round });
      lastUnsub = Date.now();
      setSubmitted(false);
      S.play('click');
    }

    function setSubmitted(on) {
      submitted = on;
      if (pad) pad.setEnabled(!on);
      if (input) input.disabled = on;
      if (doneBtn) doneBtn.hidden = on;
      if (waitPanel) waitPanel.hidden = !on;
      el.classList.toggle('is-done', on);
      if (on && waitPanel) waitPanel.scrollIntoView({ block: 'nearest', behavior: U.reducedMotion() ? 'auto' : 'smooth' });
    }

    function makeDoneBtn() {
      doneBtn = h('button.btn.primary.xl.done-btn', { type: 'button' }, '¡Listo!');
      doneBtn.addEventListener('click', () => submit(false));
      return doneBtn;
    }

    function buildWrite() {
      input = h('input#phrase.input.big-input', {
        type: 'text', maxLength: 90, placeholder: 'Ej: ' + D.randomPrompt(), autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Tu frase',
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit(false);
      });
      const dice = h('button.btn.dice', { type: 'button', title: 'Dame una idea', 'aria-label': 'Dame una idea' }, '🎲');
      dice.addEventListener('click', () => {
        if (submitted) return;
        input.value = D.randomPrompt();
        input.focus();
        S.play('pop');
        dice.classList.remove('roll');
        void dice.offsetWidth;
        dice.classList.add('roll');
      });
      body.appendChild(h('div.task.task-write.card',
        h('h2.task-title', 'Escribí una frase para que otro la dibuje'),
        h('p.task-sub', 'Algo gracioso, raro o difícil de dibujar. Si no se te ocurre nada, tocá el dado.'),
        h('div.write-row', input, dice),
        makeDoneBtn()));
      setTimeout(() => !submitted && input && input.focus(), BANNER_MS);
    }

    function buildDraw(variant, opts) {
      opts = opts || {};
      pad = new M.Draw.Pad({ variant, bg: opts.bg || null, guide: opts.guide || null });
      const hint = variant === 'invisible'
        ? h('p.variant-hint', '👻 La tinta se borra sola: vas a dibujar a ciegas.')
        : variant === 'onestroke'
          ? h('p.variant-hint', '〰️ Un solo trazo: cuando levantes el dedo o el mouse, se termina.')
          : null;
      body.appendChild(h('div.task.task-draw', h('div.task-top', opts.note, hint), pad.el, h('div.task-actions', makeDoneBtn())));
      keyHandler = (e) => {
        const tg = e.target && e.target.tagName;
        if (tg === 'INPUT' || tg === 'TEXTAREA' || submitted) return;
        if (pad && pad.handleKey(e)) e.preventDefault();
      };
      document.addEventListener('keydown', keyHandler);
    }

    function promptNote(label, text, small) {
      return h('div.prompt-note', h('span.pn-label', label), h('span.pn-text', { class: small ? 'small' : '' }, text));
    }

    function buildGuess(t) {
      const cv = h('canvas.art');
      M.Draw.paintInto(cv, t.drawing);
      input = h('input#guess.input.big-input', {
        type: 'text', maxLength: 90, placeholder: '¿Qué es esto?', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Tu respuesta',
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit(false);
      });
      body.appendChild(h('div.task.task-guess',
        h('h2.task-title', '¿Qué dibujaron acá?'),
        h('div.art-frame', cv, M.Draw.isBlank(t.drawing) ? h('span.blank-note', 'Lo dejaron en blanco 🤷 ¡Inventá algo!') : null),
        h('div.write-row', input),
        makeDoneBtn()));
      setTimeout(() => !submitted && input && input.focus(), BANNER_MS);
    }

    function buildCopy(t) {
      if (t.done) {
        buildDraw('normal', { note: promptNote('¡Copialo de memoria!', 'Dibujá el dibujo que viste', true) });
        return;
      }
      const memo = t.memoMs || 7000;
      const cv = h('canvas.art');
      M.Draw.paintInto(cv, t.drawing);
      const count = h('span.memo-count', String(Math.ceil(memo / 1000)));
      const memoBox = h('div.task.task-memo',
        h('h2.task-title', '¡Memorizá este dibujo!'),
        h('p.task-sub', 'En unos segundos desaparece y lo vas a tener que copiar de memoria.'),
        h('div.art-frame.memo-frame', cv, count));
      body.appendChild(memoBox);
      const end = performance.now() + BANNER_MS + memo;
      memoT = setInterval(() => {
        const left = end - performance.now();
        count.textContent = String(Math.max(1, Math.ceil(Math.min(memo, left) / 1000)));
        if (left > 0) return;
        clearInterval(memoT);
        memoT = 0;
        memoBox.remove();
        S.play('flip');
        buildDraw('normal', { note: promptNote('¡Ahora copialo!', 'Dibujá lo que acabás de ver', true) });
        if (waitPanel) body.appendChild(waitPanel);
        if (submitted) setSubmitted(true);
      }, 100);
    }

    function buildPart(t) {
      const part = t.part || 0;
      let bg = null;
      if (part > 0 && t.prevParts && t.prevParts.length) {
        const pcs = M.Draw.partCanvases(t.prevParts);
        bg = M.Draw.stripBg(pcs[pcs.length - 1].canvas);
      }
      const guide = {
        top: part > 0 ? '⬆ Esto es de otro: seguí sus líneas' : null,
        bottom: part === 0 ? 'Hacé llegar el cuello hasta acá ⬇' : part === 1 ? 'Las piernas salen de acá ⬇' : null,
      };
      const note = promptNote(
        'Dibujá ' + D.PART_NAMES[part] + ' del monstruo',
        part === 0 ? 'Puede ser de lo que quieras: persona, animal, cosa…' : 'No sabés qué hay arriba. ¡Imaginalo!',
        true);
      buildDraw('normal', { bg, guide, note });
    }

    function build(t) {
      built = true;
      task = t;
      U.clear(body);
      waitText = h('span.wait-text');
      changeBtn = h('button.btn.small', { type: 'button' }, '✏️ Cambiar');
      changeBtn.addEventListener('click', unsubmit);
      waitPanel = h('div.wait-panel', { hidden: true, role: 'status' },
        h('span.wait-check', '✓'), h('div.wait-copy', h('b', '¡Listo!'), waitText), changeBtn);
      const mode = D.MODES[t.mode] || D.MODES.clasico;
      if (t.kind === 'write') buildWrite();
      else if (t.kind === 'draw') buildDraw(mode.variant, { note: promptNote('Dibujá:', t.prompt || '…') });
      else if (t.kind === 'guess') buildGuess(t);
      else if (t.kind === 'copy') buildCopy(t);
      else if (t.kind === 'part') buildPart(t);
      body.appendChild(waitPanel);
      if (t.done) setSubmitted(true);
    }

    timer.onSecond = (rem) => {
      if (rem > 0 || !built || submitted || autoSent) return;
      autoSent = true;
      if (task && task.kind === 'copy' && !pad) return;
      submit(true);
      UI.toast('⏰ ¡Se acabó el tiempo! Mandamos lo que tenías.');
    };

    function update(s) {
      const r = s.round;
      if (!r) return;
      banner(r);
      roundLabel.textContent = 'Ronda ' + (r.n + 1) + ' de ' + r.total;
      modeChip.textContent = UI.modeLabel(s.mode);
      timer.set(r.endsIn, r.duration);
      U.clear(doneRow);
      for (const pid of s.order || []) {
        const p = app.player(pid);
        const done = r.done.includes(pid);
        doneRow.appendChild(h('span.done-av', { class: done ? 'is-done' : '', title: p.name + (done ? ': listo' : ': todavía no') },
          UI.avatar(p, 's'), done ? h('i', '✓') : null));
      }
      doneCount.textContent = '✓ ' + r.done.length + ' de ' + (s.order || []).length + ' listos';
      const t = app.task;
      if (!built && t && t.round === r.n && t.gameId === s.gameId) build(t);
      if (!built) return;
      const serverDone = r.done.includes(app.pid);
      const now = Date.now();
      if (submitted && !serverDone && now - lastSent > 3000 && timer.remaining() > 0) {
        app.send({ t: 'submit', round: task.round, ...content() });
        lastSent = now;
      } else if (!submitted && serverDone && now - lastUnsub > 3000) {
        setSubmitted(true);
      }
      const pending = (s.order || []).filter((id) => !r.done.includes(id)).length;
      waitText.textContent = pending === 0 ? '¡Ya terminaron todos!' : pending === 1 ? 'Falta 1 jugador…' : 'Faltan ' + pending + ' jugadores…';
      changeBtn.hidden = timer.remaining() < 2500;
    }

    function destroy() {
      timer.stop();
      clearInterval(memoT);
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      if (pad) pad.destroy();
    }

    return { el, update, destroy };
  };

  // ================= ESPECTADOR =================
  Screens.watch = function (app) {
    const timer = new UI.PencilTimer();
    const info = h('p.watch-info');
    const row = h('div.done-row');
    const el = h('section.screen.watch',
      h('div.card.watch-card',
        UI.mascot(false),
        h('h2', 'La partida ya empezó'),
        h('p', 'Estás mirando. Vas a poder reaccionar cuando se muestren los álbumes y jugar en la próxima partida.'),
        info, timer.el, row));
    function update(s) {
      const r = s.round;
      if (!r) return;
      info.textContent = 'Ronda ' + (r.n + 1) + ' de ' + r.total + ' · ' + UI.modeLabel(s.mode);
      timer.set(r.endsIn, r.duration);
      U.clear(row);
      for (const pid of s.order || []) {
        const p = app.player(pid);
        const done = r.done.includes(pid);
        row.appendChild(h('span.done-av', { class: done ? 'is-done' : '' }, UI.avatar(p, 's'), done ? h('i', '✓') : null));
      }
    }
    return { el, update, destroy: () => timer.stop() };
  };
})(globalThis.M = globalThis.M || {});
