/* Mamarracho — pantallas: revelación de álbumes, subasta y resultados. */
(function (M) {
  'use strict';
  const { U, D, S, UI } = M;
  const { h } = U;
  const Screens = (M.Screens = M.Screens || {});

  const keyAt = (s, chain, i) => (s.mode === 'monstruo' && i === s.reveal.total - 1 ? chain + '.m' : chain + '.' + i);

  // Fondo de una parte del monstruo: la franja de abajo de la parte anterior.
  function partBg(app, item) {
    if (!item || item.kind !== 'part' || !item.part) return null;
    const prev = [];
    for (let j = 0; j < item.part; j++) {
      const it = app.items.get(item.c + '.' + j);
      if (!it) return null;
      prev.push(it.drawing || '');
    }
    const pcs = M.Draw.partCanvases(prev);
    return M.Draw.stripBg(pcs[pcs.length - 1].canvas);
  }

  const slug = (s) => String(s || 'album').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'album';

  // ================= REVELACIÓN =================
  Screens.reveal = function (app) {
    const ownerSlot = h('div.album-owner');
    const progress = h('span.chip.album-progress');
    const seedNote = h('div.prompt-note.seed-note', { hidden: true });
    const feed = h('div.feed');
    const nextBtn = h('button.btn.primary.xl', { type: 'button' }, 'Siguiente ▶');
    const saveBtn = h('button.btn', { type: 'button', hidden: true }, '📥 Guardar álbum');
    const hint = h('p.reveal-hint');
    const controls = h('div.reveal-controls', h('div.btn-row', nextBtn, saveBtn), hint);
    const reactBtns = D.REACTIONS.map((e) => {
      const b = h('button.react', { type: 'button', 'aria-label': 'Reaccionar con ' + e }, e);
      b.addEventListener('click', () => react(e, b));
      return b;
    });
    const reactBar = h('div.react-bar', h('span.react-label', 'Reaccioná'), reactBtns);
    const el = h('section.screen.reveal', h('div.album-head', ownerSlot, progress), seedNote, feed, controls, reactBar);

    let chain = -1;
    const nodes = new Map();
    let target = null;
    let nextLock = 0;

    function setTarget(key) {
      target = key;
      for (const [k, n] of nodes) n.el.classList.toggle('is-target', k === key);
    }

    function renderStats(node, st) {
      U.clear(node.stats);
      if (!st) return;
      if (st.stars) node.stats.appendChild(h('span.stat.stat-star', { title: 'Personas a las que les gustó' }, '⭐ ' + st.stars));
      Object.entries(st.n || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)
        .forEach(([e, n]) => node.stats.appendChild(h('span.stat', e + ' ' + n)));
    }

    function renderItem(item) {
      let node;
      if (item.kind === 'monster') {
        const cv = M.Draw.monster(item.parts || []);
        cv.classList.add('monster-art');
        const authors = (item.by || []).map((id) => app.player(id));
        const stats = h('div.item-stats');
        node = h('article.item.item-monster',
          h('p.monster-intro', '¡Les presento a…'),
          h('h3.monster-name', item.name || 'El Monstruo'),
          h('div.art-frame.monster-frame', cv),
          h('div.monster-authors', authors.map((p, i) => h('span.monster-author', UI.avatar(p, 's'), h('span', D.PART_LABELS[i] + ': ' + p.name)))),
          stats);
        S.play('fanfare');
        return { el: node, item, stats };
      }
      const p = app.player(item.by);
      const verb = {
        write: 'escribió', draw: 'dibujó', guess: 'dijo que es', copy: 'lo copió de memoria',
        part: 'dibujó ' + (D.PART_NAMES[item.part] || '').toLowerCase(),
      }[item.kind] || '';
      const headEl = h('div.item-head', UI.avatar(p, 'm'), h('b.item-name', p.name), h('span.item-verb', verb));
      let bodyEl;
      let replay = null;
      if (item.kind === 'write' || item.kind === 'guess') {
        const txt = item.text || '';
        bodyEl = h('div.bubble', { class: txt ? '' : 'empty' },
          txt ? h('span.hand', txt) : h('span.muted', '🤷 No llegó a escribir nada'),
          item.auto && item.kind === 'write' ? h('small.auto-note', '🎲 Frase al azar: no escribió a tiempo') : null);
      } else {
        const cv = h('canvas.art', { title: 'Tocá para ver el dibujo terminado' });
        replay = M.Draw.replay(cv, item.drawing, { bg: partBg(app, item) });
        cv.addEventListener('click', () => replay && replay.skip());
        bodyEl = h('div.art-frame.reveal-art', cv,
          M.Draw.isBlank(item.drawing) ? h('span.blank-note', item.auto ? '⏰ No llegó a dibujar' : '🤷 Hoja en blanco') : null);
      }
      const stats = h('div.item-stats');
      node = h('article.item', { class: 'item-' + item.kind }, headEl, bodyEl, stats);
      return { el: node, item, stats, replay };
    }

    function addNode(item, fresh) {
      const node = renderItem(item);
      nodes.set(item.key, node);
      node.el.addEventListener('click', () => setTarget(item.key));
      feed.appendChild(node.el);
      setTarget(item.key);
      if (fresh) {
        node.el.classList.add('pop-in');
        if (item.kind !== 'monster') S.play('flip');
        requestAnimationFrame(() => node.el.scrollIntoView({ behavior: U.reducedMotion() ? 'auto' : 'smooth', block: 'center' }));
      }
    }

    function react(e, btn) {
      if (!target) return;
      app.send({ t: 'react', key: target, e });
      const n = nodes.get(target);
      UI.floatEmoji(e, n ? n.el : btn);
      S.play('pop');
      btn.classList.remove('bump');
      void btn.offsetWidth;
      btn.classList.add('bump');
    }

    function next() {
      const s = app.state;
      if (!s || !s.reveal || Date.now() < nextLock) return;
      nextLock = Date.now() + 450;
      if (s.reveal.done) app.send({ t: 'auction' });
      else app.send({ t: 'reveal' });
      S.play('click');
    }
    nextBtn.addEventListener('click', next);

    async function saveAlbum() {
      const s = app.state;
      if (!s || !s.reveal) return;
      const rv = s.reveal;
      const verbs = { write: 'escribió', draw: 'dibujó', guess: 'dijo que es', copy: 'lo copió de memoria' };
      const entries = [];
      for (let i = 0; i < rv.total; i++) {
        const it = app.items.get(keyAt(s, rv.chain, i));
        if (!it) continue;
        if (it.kind === 'monster') {
          entries.push({ who: { name: 'Entre todos', avatar: '🧟', color: '#B7E34B' }, verb: 'armaron un monstruo', kind: 'monster', parts: it.parts, text: it.name });
          continue;
        }
        const p = app.player(it.by);
        if (it.kind === 'write' || it.kind === 'guess') entries.push({ who: p, verb: verbs[it.kind], kind: 'text', text: it.text || '🤷' });
        else entries.push({ who: p, verb: it.kind === 'part' ? 'dibujó ' + D.PART_NAMES[it.part].toLowerCase() : verbs[it.kind], kind: 'drawing', data: it.drawing, bg: partBg(app, it) });
      }
      const owner = app.player(rv.owner);
      saveBtn.disabled = true;
      try {
        const blob = await M.Draw.albumBlob({
          title: 'Álbum de ' + owner.name,
          subtitle: UI.modeLabel(s.mode) + ' · ' + new Date().toLocaleDateString('es-AR'),
          entries,
        });
        const fname = 'mamarracho-' + slug(owner.name) + '.png';
        const touch = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (touch && navigator.share && typeof File === 'function') {
          const f = new File([blob], fname, { type: 'image/png' });
          if (!navigator.canShare || navigator.canShare({ files: [f] })) {
            await navigator.share({ files: [f], title: 'Mamarracho' });
            return;
          }
        }
        U.downloadBlob(blob, fname);
        UI.toast('📥 Álbum guardado como imagen.');
      } catch (err) {
        if (!err || err.name !== 'AbortError') UI.toast('No se pudo guardar el álbum.', 'error');
      } finally {
        saveBtn.disabled = false;
      }
    }
    saveBtn.addEventListener('click', saveAlbum);

    function update(s) {
      const rv = s.reveal;
      if (!rv) return;
      if (rv.chain !== chain) {
        for (const n of nodes.values()) if (n.replay) n.replay.stop();
        chain = rv.chain;
        nodes.clear();
        U.clear(feed);
        target = null;
        const owner = app.player(rv.owner);
        U.clear(ownerSlot);
        ownerSlot.append(UI.avatar(owner, 'l'), h('div', h('span.eyebrow', 'Álbum de'), h('h2.album-title', owner.name)));
        seedNote.hidden = !rv.seed;
        if (rv.seed) {
          U.clear(seedNote);
          seedNote.append(h('span.pn-label', 'La frase original era'), h('span.pn-text', rv.seed));
        }
        el.classList.remove('page-turn');
        void el.offsetWidth;
        el.classList.add('page-turn');
      }
      progress.textContent = 'Álbum ' + (rv.chain + 1) + ' de ' + rv.chains;
      for (let i = 0; i < rv.shown; i++) {
        const key = keyAt(s, rv.chain, i);
        if (nodes.has(key)) continue;
        const item = app.items.get(key);
        if (!item) break;
        addNode(item, i === rv.shown - 1);
      }
      for (const [key, node] of nodes) renderStats(node, rv.stars[key]);

      const host = app.isHost();
      const complete = rv.shown >= rv.total;
      nextBtn.hidden = !host;
      nextBtn.textContent = !complete ? 'Siguiente ▶' : rv.done ? '¡A la subasta! 🔨' : 'Próximo álbum ▶';
      nextBtn.classList.toggle('pulse', complete && rv.done);
      saveBtn.hidden = !complete;
      const hostName = app.player(s.host).name;
      hint.textContent = host
        ? (rv.done ? '¡Vieron todos los álbumes! Cuando quieras, arranca la subasta.' : 'Vos pasás las páginas. Esperá a que se rían un poco 😄')
        : (rv.done ? 'Esperando a que ' + hostName + ' abra la subasta…' : hostName + ' va pasando las páginas.');
    }

    function onReaction(msg) {
      if (msg.from === app.pid) return;
      const n = nodes.get(msg.key);
      if (n) UI.floatEmoji(msg.e, n.el);
    }

    function destroy() {
      for (const n of nodes.values()) if (n.replay) n.replay.stop();
    }

    return { el, update, onReaction, onItem: () => app.state && update(app.state), destroy };
  };

  // ================= SUBASTA =================
  const GAVEL_SVG =
    '<svg viewBox="0 0 120 120" aria-hidden="true"><g stroke="#1E1B3A" stroke-width="5" stroke-linejoin="round">' +
    '<rect x="54" y="40" width="12" height="70" rx="5" fill="#8B5A2B"/>' +
    '<rect x="22" y="12" width="76" height="34" rx="9" fill="#B5763A"/>' +
    '<rect x="16" y="16" width="12" height="26" rx="4" fill="#8B5A2B"/><rect x="92" y="16" width="12" height="26" rx="4" fill="#8B5A2B"/></g></svg>';

  Screens.auction = function (app) {
    const strip = h('div.wallet-strip', { 'aria-label': 'Mangos de cada jugador' });
    const stage = h('div.auction-stage');
    const el = h('section.screen.auction', strip, stage);
    let view = null;
    let ui = null;
    let lastBidKey = '';
    let soldShown = -1;
    const prevMoney = {};

    function renderStrip(s, a) {
      U.clear(strip);
      const ids = (s.order || []).filter((id) => id in a.wallets).sort((x, y) => a.wallets[y] - a.wallets[x]);
      for (const id of ids) {
        const p = app.player(id);
        const v = a.wallets[id];
        const chip = h('div.wallet-chip', { class: id === app.pid ? 'me' : '' },
          UI.avatar(p, 's'), h('span.wc-name', p.name), h('b.wc-money', '🥭 ' + U.fmt(v)),
          a.owned && a.owned[id] ? h('span.wc-art', { title: 'Obras compradas' }, '🖼️ ' + a.owned[id]) : null);
        if (id in prevMoney && prevMoney[id] !== v) chip.classList.add(v > prevMoney[id] ? 'up' : 'down');
        prevMoney[id] = v;
        strip.appendChild(chip);
      }
    }

    function buildIntro(s) {
      U.clear(stage);
      const host = app.isHost();
      const startBtn = h('button.btn.primary.xl', { type: 'button' }, '¡Que empiece el remate! 🔨');
      startBtn.addEventListener('click', () => {
        startBtn.disabled = true;
        app.send({ t: 'next' });
        S.play('gavel');
      });
      const rules = h('ul.rules',
        h('li', h('span.rule-ic', '🥭'), h('span', h('b', 'Todos arrancan con ' + U.fmt(D.START_MONEY) + ' mangos.'))),
        h('li', h('span.rule-ic', '🖼️'), h('span', 'Salen a remate los ' + s.auction.count + ' dibujos con más reacciones. Ofertá con +10, +50 o +100.')),
        h('li', h('span.rule-ic', '🎨'), h('span', 'Si venden tu dibujo, la plata es para vos. Por tus propias obras no podés ofertar.')),
        h('li', h('span.rule-ic', '🧐'), h('span', 'Después de cada venta, el tasador revela lo que vale de verdad. ¡Puede ser falso!')),
        h('li', h('span.rule-ic', '🏆'), h('span', h('b', 'Gana quien termine con más fortuna: mangos + valor de sus obras.'))));
      stage.append(h('div.card.auction-intro',
        UI.mascot(true),
        h('div.intro-copy',
          h('span.eyebrow', 'Gran final'),
          h('h2.intro-title', 'La Gran Subasta de Mamarrachos'),
          rules,
          host ? startBtn : h('p.wait-host', 'Esperando a que ' + app.player(s.host).name + ' abra el remate…'))));
      S.play('fanfare');
    }

    function paintArt() {
      if (!ui) return;
      const art = app.lotArt.get(ui.i);
      if (!art || ui.painted) return;
      ui.painted = true;
      U.clear(ui.frame);
      if (art.kind === 'monster') {
        const cv = M.Draw.monster(art.parts || []);
        cv.classList.add('monster-art');
        ui.frame.classList.add('is-monster');
        ui.frame.appendChild(cv);
      } else {
        const cv = h('canvas.art');
        ui.frame.appendChild(cv);
        ui.replay = M.Draw.replay(cv, art.drawing, { duration: 2200 });
      }
    }

    function buildLot(s, a) {
      if (ui) clearInterval(ui.iv);
      U.clear(stage);
      soldShown = -1;
      lastBidKey = '';
      const lot = a.lot;
      const last = a.i === a.count - 1;
      const artists = lot.artists.map((id) => app.player(id));
      const frame = h('div.frame', h('span.loading-art', 'Colgando la obra…'));
      const bidAmt = h('b.bid-amt', '—');
      const bidWho = h('span.bid-who');
      const callout = h('div.callout', { 'aria-live': 'polite' });
      const ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ringFg.setAttribute('class', 'ring-fg');
      ringFg.setAttribute('cx', '30');
      ringFg.setAttribute('cy', '30');
      ringFg.setAttribute('r', '25');
      const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ringSvg.setAttribute('viewBox', '0 0 60 60');
      ringSvg.setAttribute('aria-hidden', 'true');
      const ringBg = ringFg.cloneNode();
      ringBg.setAttribute('class', 'ring-bg');
      ringSvg.append(ringBg, ringFg);
      const secs = h('span.ring-secs');
      const btns = [10, 50, 100].map((inc) => {
        const b = h('button.btn.bid-btn', { type: 'button', dataset: { inc } }, h('span.bb-inc', '+' + inc), h('small.bb-total'));
        b.addEventListener('click', () => bid(inc));
        return b;
      });
      const note = h('p.bid-note');
      const feedList = h('ul.bid-feed');
      const sold = h('div.sold-layer', { hidden: true });
      const likes = 'Le gustó a ' + lot.stars + ' de ' + lot.possible;
      const lotEl = h('div.lot', { class: last ? 'is-last' : '' },
        h('div.lot-top', h('span.chip', 'Lote ' + (a.i + 1) + ' de ' + a.count), last ? h('span.chip.lot-star', '⭐ Lote estrella') : null),
        h('h2.lot-title', lot.kind === 'monster' ? lot.title : '«' + lot.title + '»'),
        h('div.lot-artist', h('span', 'Obra de'), artists.map((p) => UI.who(p, 's'))),
        h('div.lot-main',
          frame,
          h('div.lot-side',
            h('div.estimate', h('span.eyebrow', 'Valor estimado'), h('b.est-value', '🥭 ' + U.fmt(lot.estimate)), h('span.est-note', likes)),
            h('div.bid-box', h('div.bid-now', h('span.eyebrow', 'Oferta más alta'), bidAmt, bidWho), h('div.ring', ringSvg, secs)),
            callout,
            h('div.bid-btns', btns),
            note,
            feedList)),
        sold);
      stage.append(lotEl);
      ui = { i: a.i, lotEl, frame, bidAmt, bidWho, callout, ringFg, secs, btns, note, feedList, sold, deadline: 0, iv: 0, painted: false, replay: null, lastCall: '' };
      paintArt();
      S.play('whoosh');
      ui.iv = setInterval(tickLot, 100);
    }

    function tickLot() {
      const s = app.state;
      const a = s && s.auction;
      if (!ui || !a || a.stage !== 'lot' || a.i !== ui.i) return;
      const rem = Math.max(0, ui.deadline - performance.now());
      const frac = U.clamp(rem / 15000, 0, 1);
      const len = 2 * Math.PI * 25;
      ui.ringFg.style.strokeDasharray = len.toFixed(1);
      ui.ringFg.style.strokeDashoffset = (len * (1 - frac)).toFixed(1);
      ui.secs.textContent = String(Math.ceil(rem / 1000));
      ui.ringFg.classList.toggle('low', rem < 4500);
      let call = '';
      if (rem <= 1500) call = '¡A las tres…!';
      else if (rem <= 3000) call = '¡A las dos…!';
      else if (rem <= 4500) call = '¡A la una…!';
      else if (!a.bid) call = '¿Quién da más?';
      if (call !== ui.lastCall) {
        ui.lastCall = call;
        ui.callout.textContent = call;
        ui.callout.classList.remove('pop');
        void ui.callout.offsetWidth;
        if (call) ui.callout.classList.add('pop');
        if (rem <= 4500 && call) S.play('tick');
      }
    }

    function bid(inc) {
      const a = app.state && app.state.auction;
      if (!a || a.stage !== 'lot') return;
      const cur = a.bid ? a.bid.amount : 0;
      app.send({ t: 'bid', lot: a.i, amount: cur + inc });
      S.play('click');
    }

    function deltaText(r, buyer) {
      const d = r.value - r.amount;
      const me = r.by === app.pid;
      if (d > 0) return me ? '¡Ganaste 🥭 ' + U.fmt(d) + '!' : buyer.name + ' gana 🥭 ' + U.fmt(d);
      if (d < 0) return me ? 'Perdiste 🥭 ' + U.fmt(-d) + ' 😬' : buyer.name + ' pierde 🥭 ' + U.fmt(-d);
      return 'Ni gana ni pierde';
    }

    function showSold(s, a) {
      const r = a.result;
      if (ui.replay) ui.replay.skip();
      ui.callout.textContent = '';
      ui.lotEl.classList.add('is-sold');
      const layer = ui.sold;
      U.clear(layer);
      layer.hidden = false;
      const nextInfo = h('p.next-info');
      ui.nextInfo = nextInfo;
      let nextBtn = null;
      if (app.isHost()) {
        nextBtn = h('button.btn.small', { type: 'button' }, a.i === a.count - 1 ? 'Ver resultados ▶' : 'Siguiente lote ▶');
        nextBtn.addEventListener('click', () => {
          nextBtn.disabled = true;
          app.send({ t: 'next' });
        });
      }
      if (!r || !r.sold) {
        layer.append(h('div.stamp.stamp-gray', 'SIN OFERTAS'), h('p.sold-line', 'Nadie ofertó… vuelve al cajón 😢'), h('div.sold-foot', nextInfo, nextBtn));
        S.play('sad');
        return;
      }
      const buyer = app.player(r.by);
      const payees = Object.keys(r.shares || {}).map((id) => app.player(id).name);
      const card = h('div.tasador',
        h('div.tas-inner',
          h('div.tas-face.tas-front', h('span.tas-emoji', '🧐'), h('b', 'El tasador está mirando la obra…')),
          h('div.tas-face.tas-back', { class: 'tone-' + r.tone },
            h('span.tas-mult', r.title), h('span.tas-line', r.line), h('b.tas-value', 'Vale 🥭 ' + U.fmt(r.value)), h('span.tas-delta', deltaText(r, buyer)))));
      layer.append(
        h('div.gavel', { html: GAVEL_SVG }),
        h('div.stamp', '¡VENDIDO!'),
        h('p.sold-line', 'a ', UI.who(buyer, 's'), ' por ', h('b', '🥭 ' + U.fmt(r.amount))),
        payees.length ? h('p.sold-pay', '💸 ' + payees.join(' y ') + (payees.length > 1 ? ' cobran ' : ' cobra ') + 'la plata') : null,
        card,
        h('div.sold-foot', nextInfo, nextBtn));
      S.play('gavel');
      setTimeout(() => S.play('drumroll'), 1000);
      setTimeout(() => {
        card.classList.add('flipped');
        S.play(r.m >= 2 ? 'great' : r.m < 1 ? 'sad' : 'fanfare');
        if (r.m >= 2 && r.by === app.pid) UI.confetti(1800);
      }, 2300);
    }

    function updateLot(s, a) {
      if (!ui) return;
      const lot = a.lot;
      if (a.stage === 'lot') {
        const d = performance.now() + a.endsIn;
        if (Math.abs(d - ui.deadline) > 300) ui.deadline = d;
      }
      if (a.bid) {
        ui.bidAmt.textContent = '🥭 ' + U.fmt(a.bid.amount);
        U.clear(ui.bidWho);
        ui.bidWho.append(UI.who(app.player(a.bid.by), 's'));
      } else {
        ui.bidAmt.textContent = '—';
        ui.bidWho.textContent = 'Nadie ofertó todavía';
      }
      const bk = a.bid ? a.bid.by + ':' + a.bid.amount : '';
      if (bk && bk !== lastBidKey) {
        S.play('coin');
        ui.bidAmt.classList.remove('bump');
        void ui.bidAmt.offsetWidth;
        ui.bidAmt.classList.add('bump');
      }
      lastBidKey = bk;
      U.clear(ui.feedList);
      a.bids.slice().reverse().slice(0, 4).forEach((b) => ui.feedList.appendChild(h('li', UI.who(app.player(b.by), 's'), h('b', '🥭 ' + U.fmt(b.amount)))));

      const inGame = app.pid in a.wallets;
      const money = inGame ? a.wallets[app.pid] : 0;
      const mine = lot.artists.length === 1 && lot.artists[0] === app.pid;
      const leading = !!(a.bid && a.bid.by === app.pid);
      const cur = a.bid ? a.bid.amount : 0;
      ui.btns.forEach((b) => {
        const amt = cur + Number(b.dataset.inc);
        b.querySelector('.bb-total').textContent = '🥭 ' + U.fmt(amt);
        b.disabled = a.stage !== 'lot' || !inGame || mine || leading || amt > money;
        b.setAttribute('aria-label', 'Ofertar ' + amt + ' mangos');
      });
      ui.note.textContent = !inGame
        ? 'Estás mirando: no podés ofertar.'
        : mine
          ? '🎨 Es tu obra: no podés ofertar, pero si se vende cobrás vos.'
          : leading
            ? '🎉 ¡Vas ganando! Esperá a ver si alguien te supera.'
            : cur + 10 > money
              ? '😬 No te alcanzan los mangos (tenés ' + U.fmt(money) + ').'
              : 'Tenés 🥭 ' + U.fmt(money) + '.';
      ui.note.className = 'bid-note' + (leading ? ' good' : mine ? ' info' : '');

      if (a.stage === 'sold' && soldShown !== a.i) {
        soldShown = a.i;
        showSold(s, a);
      }
      if (a.stage === 'sold' && ui.nextInfo) {
        const secsLeft = Math.ceil(a.nextIn / 1000);
        ui.nextInfo.textContent = a.i === a.count - 1 ? 'Resultados en ' + secsLeft + '…' : 'Siguiente lote en ' + secsLeft + '…';
      }
    }

    // Cuenta regresiva del "siguiente lote" sin esperar al anfitrión.
    let soldTick = 0;
    function update(s) {
      const a = s.auction;
      if (!a) return;
      renderStrip(s, a);
      if (a.stage === 'intro') {
        if (view !== 'intro') {
          view = 'intro';
          buildIntro(s);
        }
        return;
      }
      if (view !== a.i) {
        view = a.i;
        buildLot(s, a);
      }
      updateLot(s, a);
      clearInterval(soldTick);
      if (a.stage === 'sold') {
        const end = performance.now() + a.nextIn;
        soldTick = setInterval(() => {
          if (!ui || !ui.nextInfo) return;
          const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
          ui.nextInfo.textContent = (a.i === a.count - 1 ? 'Resultados en ' : 'Siguiente lote en ') + left + '…';
        }, 250);
      }
    }

    return {
      el,
      update,
      onLotArt: (i) => {
        if (ui && ui.i === i) paintArt();
      },
      destroy: () => {
        if (ui) clearInterval(ui.iv);
        clearInterval(soldTick);
      },
    };
  };

  // ================= RESULTADOS =================
  Screens.results = function (app) {
    const el = h('section.screen.results');
    const actions = h('div.results-actions');
    let built = false;
    let celebrated = false;
    let rebuildT = 0;

    function thumb(o, lots) {
      const art = app.lotArt.get(o.i);
      const lot = lots[o.i] || { title: '' };
      let cv;
      if (art && art.kind === 'monster') {
        cv = M.Draw.monster(art.parts || []);
      } else {
        cv = h('canvas', { width: 400, height: 300 });
        if (art) cv.getContext('2d').drawImage(M.Draw.toCanvas(art.drawing), 0, 0, 400, 300);
      }
      cv.classList.add('thumb-art');
      const mult = o.m === 0 ? 'falso' : 'x' + String(o.m).replace('.', ',');
      return h('figure.thumb', { class: o.m === 0 ? 'is-fake' : o.m >= 2 ? 'is-great' : '' },
        h('div.thumb-frame', cv, o.m === 0 ? h('span.fake-stamp', 'FALSO') : null),
        h('figcaption',
          h('span.thumb-title', lot.kind === 'monster' ? lot.title : '«' + lot.title + '»'),
          h('span.thumb-money', 'Pagó 🥭 ' + U.fmt(o.paid) + ' · vale 🥭 ' + U.fmt(o.value) + ' (' + mult + ')')));
    }

    function build(s) {
      const res = s.results;
      const rows = res.rows || [];
      const winner = app.player(rows[0] && rows[0].pid);
      const podiumOrder = [1, 0, 2].filter((i) => rows[i]);
      const podium = h('div.podium', podiumOrder.map((i) => {
        const r = rows[i];
        const p = app.player(r.pid);
        return h('div.pod', { class: 'pod-' + (i + 1) },
          UI.avatar(p, i === 0 ? 'xl' : 'l'),
          h('b.pod-name', p.name),
          h('span.pod-total', '🥭 ' + U.fmt(r.total)),
          h('div.pod-block', h('span', String(i + 1))));
      }));
      const ranking = h('ol.ranking', rows.map((r, i) => {
        const p = app.player(r.pid);
        return h('li.rank-row', { class: r.pid === app.pid ? 'me' : '' },
          h('span.rank-pos', String(i + 1)),
          UI.who(p, 'm'),
          h('span.rank-detail', h('span', '🥭 ' + U.fmt(r.money)), h('span', ' + 🖼️ ' + U.fmt(r.art))),
          h('b.rank-total', '🥭 ' + U.fmt(r.total)));
      }));
      const awards = h('div.awards', (res.awards || []).map((a, i) => {
        const p = app.player(a.pid);
        return h('div.award', { style: { '--i': i } },
          h('span.award-ic', a.icon), h('b.award-title', a.title), UI.who(p, 's'), h('p.award-text', a.text));
      }));
      const collections = rows.filter((r) => r.owned && r.owned.length).map((r) => {
        const p = app.player(r.pid);
        return h('div.collection', h('h3', 'La colección de ', h('span.hl', p.name)), h('div.thumbs', r.owned.map((o) => thumb(o, res.lots || []))));
      });
      U.append(el, [
        h('div.results-head',
          h('span.eyebrow', 'Fin de la subasta'),
          h('h1.results-title', '¡', h('span.hl', winner.name), ' es el magnate del arte!'),
          h('p.results-sub', 'Fortuna = mangos que le quedaron + valor de sus obras.')),
        podium,
        h('div.results-grid',
          h('div.card.ranking-card', h('h2', 'Tabla final'), ranking),
          h('div.card.awards-card', h('h2', 'Premios'), awards)),
        collections.length ? h('div.card.collections-card', h('h2', 'Las colecciones'), collections) : null,
        actions,
      ]);
      if (!celebrated) {
        celebrated = true;
        UI.confetti(4200);
        S.play('win');
      }
    }

    function updateActions(s) {
      U.clear(actions);
      if (app.isHost()) {
        const again = h('button.btn.primary.xl', { type: 'button' }, '🔄 Jugar otra vez');
        again.addEventListener('click', () => app.send({ t: 'again' }));
        actions.append(again);
      } else {
        actions.append(h('p.wait-host', 'Esperando a que ' + app.player(s.host).name + ' arme otra partida…'));
      }
      const out = h('button.btn', { type: 'button' }, 'Salir');
      out.addEventListener('click', () => app.confirmLeave());
      actions.append(out);
    }

    function update(s) {
      if (!s.results) return;
      if (!built) {
        built = true;
        build(s);
      }
      updateActions(s);
    }

    return {
      el,
      update,
      onLotArt: () => {
        // Si llegan obras tarde (reconexión), rearmamos las miniaturas una sola vez.
        clearTimeout(rebuildT);
        rebuildT = setTimeout(() => {
          if (!built || !app.state || !app.state.results) return;
          U.clear(el);
          built = false;
          update(app.state);
        }, 250);
      },
      destroy: () => clearTimeout(rebuildT),
    };
  };
})(globalThis.M = globalThis.M || {});
