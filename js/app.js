/* Ski game – interface */
(function () {
  'use strict';
  const D = window.SKI_DATA, G = window.SKI_GAME, DEMO = window.SKI_DEMO, BASE = window.SKI_ATHLETES, CONFIG = window.SKI_CONFIG || {};
  const TZ = 'Europe/Paris';
  const PHOTO_DIR = 'img/athletes/'; // une photo par skieur : img/athletes/<id>.jpg (voir README)

  // Liste des skieurs : la liste de base (js/athletes.js) + ceux ajoutés par l'admin ou saisis librement par un joueur.
  let LIST = { M: BASE.M.slice(), W: BASE.W.slice() }, ATH = {};
  function rebuildAthletes() {
    LIST = { M: BASE.M.slice(), W: BASE.W.slice() };
    state.extra.slice().sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.name.localeCompare(b.name)).forEach((x) => {
      if (!state.aliases[x.id] && LIST[x.gender]) LIST[x.gender].push(Object.assign({ rank: null }, x));
    });
    ATH = {};
    ['M', 'W'].forEach((g) => LIST[g].forEach((a) => { ATH[a.id] = Object.assign({}, a, { gender: g }); }));
    // un nom libre régularisé reste lisible : il pointe vers le vrai skieur
    state.extra.forEach((x) => { if (state.aliases[x.id] && ATH[state.aliases[x.id]]) ATH[x.id] = ATH[state.aliases[x.id]]; });
  }

  const freshSubs = () => ({ 1: 'mine', 2: 'mine', 3: 'mine', 0: 'mine' });
  const state = {
    tab: 'next',
    sub: freshSubs(),
    sim: null,
    demo: false,
    user: null,            // { uid, email, name } une fois connecté
    authMode: 'up',        // 'in' | 'up' (écran de connexion)
    authReady: false,      // la session (déjà connecté ou non) est connue
    authError: '',
    players: [],
    me: null,
    picks: {},             // choix de tous les joueurs (alias déjà appliqués)
    results: {},
    tq: '',                // recherche dans « Athlètes pris »
    tf: 'all',             // filtre : all | taken | free
    // données brutes du stockage
    raw: { picks: {}, results: {} },
    overrides: {}, extra: [], aliases: {},
    admin: { race: null, msg: '' },
  };

  /* ---------- Utilitaires ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => state.sim || new Date();
  const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: TZ }, opts));
  const F_DAY = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
  const F_WD = fmt({ weekday: 'short' });
  const F_MO = fmt({ month: 'short' });
  const F_NUM = fmt({ day: 'numeric' });
  const F_HOUR = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const F_SHORT = fmt({ day: 'numeric', month: 'short' });
  const at = (date) => G.parisInstant(date, '12:00');
  const dayOf = (date) => F_DAY.format(at(date));
  const shortOf = (date) => F_SHORT.format(at(date));
  const hourText = (d) => { const [h, m] = F_HOUR.format(d).split(':'); return m === '00' ? `${+h} h` : `${+h} h ${m}`; };
  const dlShort = (d) => `${F_DAY.format(d)} à ${hourText(d)}`;
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const surname = (name) => { const p = name.split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : name; };
  const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);
  /* Drapeaux : images (les emoji de drapeaux ne s'affichent pas sous Windows). */
  const PLACE_CC = { 'Sölden': 'at', 'Levi': 'fi', 'Gurgl': 'at', 'Copper Mountain': 'us', 'Beaver Creek': 'us', 'Val d’Isère': 'fr', "Val d'Isère": 'fr', 'Val Gardena': 'it', 'Alta Badia': 'it', 'Madonna di Campiglio': 'it', 'Madonna': 'it', 'Bormio': 'it', 'Kranjska Gora': 'si', 'Adelboden': 'ch', 'Wengen': 'ch', 'Kitzbühel': 'at', 'Schladming': 'at', 'Chamonix': 'fr', 'Garmisch-Partenkirchen': 'de', 'Garmisch': 'de', 'Saalbach': 'at', 'Kvitfjell': 'no', 'Åre': 'se', 'Sun Valley': 'us', 'Killington': 'us', 'Tremblant': 'ca', 'Saint-Moritz': 'ch', 'Courchevel': 'fr', 'Gosau': 'at', 'Flachau': 'at', 'Val di Fassa': 'it', 'Cortina d’Ampezzo': 'it', 'Cortina': 'it', 'Kronplatz': 'it', 'Jasná': 'sk', 'Lenzerheide': 'ch', 'Soldeu': 'ad', 'Narvik': 'no', 'Crans-Montana': 'ch' };
  const PLACE_RE = new RegExp(Object.keys(PLACE_CC).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  /** Texte HTML échappé avec un drapeau devant chaque nom de station connu. */
  function fl(text) {
    let out = '', last = 0, m;
    PLACE_RE.lastIndex = 0;
    while ((m = PLACE_RE.exec(text))) {
      const cc = PLACE_CC[m[0]];
      out += esc(text.slice(last, m.index)) + `<img class="fl" src="https://flagcdn.com/w40/${cc}.png" srcset="https://flagcdn.com/w80/${cc}.png 2x" width="20" height="15" alt="" loading="lazy" onerror="this.style.display='none'">` + esc(m[0]);
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  /** Bouton « i » qui ouvre une petite bulle d'aide. */
  const info = (text) => `<button type="button" class="info" data-info="${esc(text)}" aria-label="Aide : ${esc(text)}">i</button>`;
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const myPicks = () => state.picks[state.me] || (state.picks[state.me] = {});
  const isAdmin = () => !!state.user && !state.demo && (store.mode === 'local' || (!!CONFIG.adminEmail && state.user.email.toLowerCase() === CONFIG.adminEmail.toLowerCase()));

  const allSessions = () => [...D.SESSIONS, D.WORLDS].sort((a, b) => G.sessionDeadline(a) - G.sessionDeadline(b));
  const scopeSessions = (key) => (key === 0 ? [D.WORLDS] : D.SESSIONS.filter((s) => s.desk === key));
  const locked = (session) => G.sessionState(session, now()) !== 'ouverte';
  const lockedRace = (race) => G.raceLocked(race, now());
  const visible = (playerId, race) => playerId === state.me || lockedRace(race);
  const active = (races) => races.filter((r) => !r.cancelled);
  const sortedRaces = (session) => G.sessionRaces(session)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.gender.localeCompare(b.gender));
  const upcomingSession = () => allSessions().find((s) => G.sessionState(s, now()) !== 'terminée');
  const canon = (id) => state.aliases[id] || id;

  /* ---------- Stockage partagé (Firebase) ou local ---------- */
  const store = window.SKI_STORE.create(CONFIG);
  let rafId = 0, pendingRender = false;
  const editing = () => { const el = document.activeElement; return !!el && el !== document.body && !!el.closest('#panel') && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName); };
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; if (editing()) { pendingRender = true; return; } render(); });
  }
  document.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => { if (!editing()) { pendingRender = false; render(); } }, 0); });

  /** Recalcule tout ce qui dérive des données brutes : surcharges du calendrier, liste de skieurs, choix et résultats (alias appliqués). */
  function recompute() {
    if (state.demo) return;
    G.setOverrides(state.overrides);
    rebuildAthletes();
    const fix = (p) => { const q = Object.assign({}, p); ['a', 'b', 'd'].forEach((k) => { if (q[k]) q[k] = canon(q[k]); }); return q; };
    const picks = {};
    Object.keys(state.raw.picks).forEach((uid) => {
      picks[uid] = {};
      Object.entries(state.raw.picks[uid] || {}).forEach(([rid, p]) => { if (p && typeof p === 'object') picks[uid][rid] = fix(p); });
    });
    state.picks = picks;
    const res = {};
    Object.entries(state.raw.results).forEach(([rid, entries]) => { res[rid] = (entries || []).map((e) => Object.assign({}, e, { ath: canon(e.ath) })); });
    state.results = res;
    scheduleRender();
  }
  function startStore() {
    store.onAuth((u) => { state.authReady = true; state.user = u; state.me = u ? u.uid : null; introRules(); if (!state.demo) { state.authError = ''; scheduleRender(); } });
    store.listen({
      players: (list) => { state.players = list.map((x) => ({ id: x.id, name: x.name || x.email || x.id })).sort((a, b) => a.name.localeCompare(b.name, 'fr')); scheduleRender(); },
      picks: (m) => { state.raw.picks = m; recompute(); },
      results: (m) => { state.raw.results = m; recompute(); },
      overrides: (m) => { state.overrides = m; recompute(); },
      aliases: (m) => { state.aliases = m; recompute(); },
      athletes: (list) => { state.extra = list.filter((x) => x.gender === 'M' || x.gender === 'W'); recompute(); },
    });
  }
  const fail = (e) => { alert('Enregistrement impossible : ' + (e && e.message ? e.message : e) + '\nVérifie ta connexion et réessaie.'); };

  /* ---------- Éléments récurrents ---------- */
  const discLabel = (r) => D.DISC[r.disc].fr + (r.sub ? ' ' + r.sub : '');
  const genderLabel = (r) => (r.gender === 'M' ? 'Messieurs' : 'Dames');
  const placeLabel = (r) => (r.kind === 'mondial' ? 'Crans-Montana' : r.place);
  const raceTag = (r) => `${placeLabel(r)} ${D.DISC[r.disc].short}${r.sub || ''}`;
  function discBadge(r) {
    const mult = r.mult > 1
      ? `<span class="mult" title="${r.kind === 'mondial' ? 'Barème ×3 aux Mondiaux' : 'Barème ×2 pour les finales'}">×${r.mult}</span>` : '';
    return `<span class="disc disc--${r.disc}">${esc(discLabel(r))}</span>${mult}`;
  }
  function stateBadge(session) {
    const s = G.sessionState(session, now());
    return `<span class="state state--${s.replace(' ', '-')}">${s === 'ouverte' ? 'Choix ouverts' : s === 'en cours' ? 'Choix verrouillés' : 'Terminée'}</span>`;
  }
  /** Avatar : initiales par défaut, photo par-dessus si le fichier existe (sinon l'image est retirée). */
  function avatar(a, on, size) {
    const caps = a.name.split(' ').filter((w) => /^[A-ZÀ-ÝÖÜÄ]/.test(w));
    const initials = (caps.length > 1 ? caps[0][0] + caps[caps.length - 1][0] : (caps[0] || a.name).slice(0, 2)).toUpperCase();
    return `<span class="avatar avatar--${a.gender}${size ? ' avatar--' + size : ''}${on === false ? ' is-off' : ''}" aria-hidden="true"><span class="avatar__in">${esc(initials)}</span><img class="avatar__img" src="${PHOTO_DIR}${a.id}.jpg" alt="" loading="lazy" onerror="this.style.display='none'"></span>`;
  }
  const avatarOf = (id, size) => (ATH[id] ? avatar(ATH[id], true, size) : '');
  const nameOf = (id) => (ATH[id] ? ATH[id].name : id);

  function winnerOf(raceId) {
    const res = state.results[raceId];
    const w = res && res.find((e) => !e.status && e.rank === 1);
    return w ? nameOf(w.ath) : '';
  }

  /* ---------- Sélecteurs de choix ---------- */
  // Tri et affichage par nom de famille (le classement FIS stocke « NOM Prénom »).
  function surnameOf(a) {
    if (a.fis) { const m = a.fis.match(/^((?:[A-ZÀ-ÖØ-Þ'’\-]+\s+)*[A-ZÀ-ÖØ-Þ'’\-]+)(?=\s|$)/); if (m) return m[1].replace(/\s+[A-Z]$/, '').replace(/\s+[A-Z]$/, ''); }
    const w = a.name.trim().split(/\s+/); return w[w.length - 1];
  }
  function listName(a) {
    if (a.fis) { const sn = surnameOf(a); const first = a.fis.slice(sn.length).trim(); return first ? sn.toLowerCase().replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase()) + ' ' + first : a.name; }
    const w = a.name.trim().split(/\s+/); return w.length > 1 ? w[w.length - 1] + ' ' + w.slice(0, -1).join(' ') : a.name;
  }
  function bySurname(a, b) { return norm(listName(a)).localeCompare(norm(listName(b))); }
  function freeLink(race, slot) {
    return `<button type="button" class="freelink" data-free="${race.id}" data-slot="${slot}">Skieur absent de la liste ? Saisir son nom</button>`;
  }
  function options(race, session, slot) {
    const picks = myPicks();
    const used = G.usedInDesk(session.desk, race.gender, picks, race.id, state.results);
    const cur = picks[race.id] || {};
    const head = `<option value="">${slot === 'a' ? 'Choisir un skieur' : 'Remplaçant (facultatif)'}</option>`;
    return head + LIST[race.gender].slice().sort(bySurname).map((a) => {
      const isCur = cur[slot] === a.id;
      const taken = used.has(a.id);
      const dis = !isCur && (taken || (slot === 'b' && cur.a === a.id));
      const meta = [a.nat, a.pending ? 'à régulariser' : '', taken && slot === 'a' ? 'déjà pris' : ''].filter(Boolean).join(', ');
      return `<option value="${a.id}"${isCur ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(listName(a))}${meta ? ` (${meta})` : ''}</option>`;
    }).join('');
  }
  function pickEditor(race, session) {
    const label = `${placeLabel(race)}, ${genderLabel(race)}, ${discLabel(race)}`;
    const cur = myPicks()[race.id] || {};
    const face = cur.a ? avatarOf(cur.a) : `<span class="avatar avatar--empty" aria-hidden="true"></span>`;
    return `<div class="pickbox">
      ${face}
      <div class="pickbox__sel">
        <label class="sr" for="pa-${race.id}">Skieur, ${esc(label)}</label>
        <select id="pa-${race.id}" class="pick" data-race="${race.id}" data-slot="a">${options(race, session, 'a')}</select>
        ${freeLink(race, 'a')}
        <label class="sr" for="pb-${race.id}">Remplaçant, ${esc(label)}</label>
        <select id="pb-${race.id}" class="pick pick--sub" data-race="${race.id}" data-slot="b"${cur.a ? '' : ' disabled'}>${options(race, session, 'b')}</select>
        <span class="pickhelp">${freeLink(race, 'b')}${info('Le remplaçant est facultatif : il joue à ta place seulement si ton titulaire ne prend pas le départ (blessure, malade). Dans ce cas, seul le remplaçant est « grillé ». Si le titulaire chute ou abandonne, il marque 0 et reste grillé : le remplaçant ne joue pas.')}</span>
      </div>
    </div>`;
  }
  function pickSummary(playerId, race) {
    const p = (state.picks[playerId] || {})[race.id];
    if (!p || !p.a) return '<span class="none">Aucun choix</span>';
    const eff = G.effectiveAthlete(p, state.results, race.id);
    const swapped = p.b && eff === p.b;
    const text = swapped
      ? `<span class="who"><s class="who--out">${esc(nameOf(p.a))}</s> ${esc(nameOf(p.b))}</span><span class="sub">Remplaçant en piste</span>`
      : `<span class="who">${esc(nameOf(p.a))}</span>${p.b ? `<span class="sub">Remplaçant : ${esc(nameOf(p.b))}</span>` : ''}`;
    return `<div class="pickline">${avatarOf(eff)}<div class="pickline__txt">${text}</div></div>`;
  }
  function outcome(race, playerId) {
    const res = state.results[race.id];
    if (race.cancelled) return '<span class="soon">Annulée</span>';
    if (!res) return lockedRace(race) ? '<span class="soon">En attente</span>' : '';
    const pk = (state.picks[playerId] || {})[race.id];
    const sc = G.scoreRace(race, pk, state.results);
    const eff = pk && G.effectiveAthlete(pk, state.results, race.id);
    const e = eff && res.find((x) => x.ath === eff);
    const how = e ? (e.status || ordinal(e.rank)) : '';
    const win = winnerOf(race.id);
    return `<div class="out"><span class="pill ${sc > 0 ? 'pill--on' : 'pill--off'}">${sc > 0 ? '+' : ''}${sc}</span>${how ? `<span class="rank">${how}</span>` : ''}</div>
      ${win ? `<span class="winner">Vainqueur ${esc(surname(win))}</span>` : ''}`;
  }
  const sessionOf = (race) => [...D.SESSIONS, D.WORLDS].find((s) => s.races.includes(race.id));

  /* ---------- Courses d'une session (vue « Mon desk ») ---------- */
  function raceRow(race, session) {
    const d = at(race.date);
    const flag = race.cancelled ? '<span class="flag flag--off">Annulée</span>'
      : race.moved ? `<span class="flag flag--moved" title="Choix modifiable jusqu’au nouveau départ">Reportée du ${esc(shortOf(race.originalDate))}, départ ${esc(hourText(G.raceStart(race)))}</span>` : '';
    const pick = race.cancelled ? '<span class="none">Course annulée : aucun choix</span>' : lockedRace(race) ? pickSummary(state.me, race) : pickEditor(race, session);
    return `<li class="race${race.cancelled ? ' race--off' : ''}">
      <div class="race__date"><span class="race__num">${F_NUM.format(d)}</span><span class="race__mo">${F_WD.format(d)} ${F_MO.format(d)}</span></div>
      <div class="race__info"><strong class="race__place">${fl(placeLabel(race))}</strong>
        <span class="race__tags"><span class="gender gender--${race.gender}">${genderLabel(race)}</span>${discBadge(race)}${flag}</span></div>
      <div class="race__pick">${pick}</div>
      <div class="race__out">${outcome(race, state.me)}</div>
    </li>`;
  }
  function sessionCard(session, indexLabel) {
    const races = sortedRaces(session);
    const live = active(races);
    const dl = G.sessionDeadline(session);
    const n = live.filter((r) => (myPicks()[r.id] || {}).a).length;
    const open = live.some((r) => !lockedRace(r));
    const mine = G.sessionScore(session, myPicks(), state.results);
    return `<article class="session" id="s-${session.id}">
      <header class="session__head">
        <div>
          <h3 class="session__name">${fl(session.name)}</h3>
          <p class="session__meta">${indexLabel ? indexLabel + ', ' : ''}deadline ${dlShort(dl)}</p>
        </div>
        <div class="session__side">${stateBadge(session)}${open
    ? `<span class="count${n === live.length ? ' count--ok' : ''}">${n}/${live.length} choisis</span>${remindBtn(session)}`
    : `<span class="count count--pts">${mine} pts</span>`}</div>
      </header>
      <ul class="races">${races.map((r) => raceRow(r, session)).join('')}</ul>
    </article>`;
  }

  /* ---------- Récap des joueurs ---------- */
  function recapTable(session) {
    const races = sortedRaces(session);
    const head = state.players.map((p) => `<th scope="col" class="${p.id === state.me ? 'me' : ''}">${esc(p.name)}</th>`).join('');
    const rows = races.map((r) => {
      const cells = state.players.map((p) => {
        const pk = (state.picks[p.id] || {})[r.id];
        const cls = p.id === state.me ? 'me' : '';
        if (r.cancelled) return `<td class="${cls}"><span class="none">Annulée</span></td>`;
        if (!visible(p.id, r)) return `<td class="${cls}"><span class="none">Révélé au départ</span></td>`;
        if (!pk || !pk.a) return `<td class="${cls}"><span class="none">Aucun choix</span></td>`;
        const eff = G.effectiveAthlete(pk, state.results, r.id);
        const sc = G.scoreRace(r, pk, state.results);
        return `<td class="${cls}"><div class="cell">${avatarOf(eff, 'sm')}<div class="cell__txt"><span class="who" title="${esc(nameOf(eff))}">${esc(surname(nameOf(eff)))}</span>${eff !== pk.a ? '<span class="sub">Remplaçant</span>' : ''}${sc === null ? '' : `<span class="cellpts ${sc > 0 ? 'on' : 'off'}">${sc > 0 ? '+' : ''}${sc}</span>`}</div></div></td>`;
      }).join('');
      return `<tr><th scope="row"><span class="rowhead__day">${dayOf(r.date)}</span> ${fl(placeLabel(r))}<br><span class="gender gender--${r.gender}">${genderLabel(r)}</span>${discBadge(r)}</th>${cells}</tr>`;
    }).join('');
    const totals = state.players.map((p) => `<td class="${p.id === state.me ? 'me' : ''}"><strong>${G.sessionScore(session, state.picks[p.id], state.results)} pts</strong></td>`).join('');
    return `<div class="tablewrap"><table class="grid">
      <caption>${fl(session.name)}</caption>
      <thead><tr><th scope="col">Course</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Total de la session</th>${totals}</tr></tfoot>
    </table></div>`;
  }
  function recapView(key) {
    const sessions = scopeSessions(key);
    const done = sessions.filter(locked);
    const waiting = sessions.length - done.length;
    let html = done.length ? done.map(recapTable).join('') : '<p class="empty">Rien à voir pour l’instant. Les choix de chacun apparaissent à la deadline de la session.</p>';
    if (done.length && waiting) html += `<p class="hint">${plural(waiting, 'session reste', 'sessions restent')} à venir.</p>`;
    return html;
  }

  /* ---------- Athlètes pris ---------- */
  function takenView(key) {
    const sessions = scopeSessions(key);
    const takes = {};   // athId -> playerId -> [{race, sc}]
    const totals = { M: {}, W: {} }; // genre -> playerId -> points
    sessions.forEach((s) => {
      G.sessionRaces(s).forEach((r) => {
        if (r.cancelled) return;
        state.players.forEach((p) => {
          if (!visible(p.id, r)) return;
          const pk = (state.picks[p.id] || {})[r.id];
          if (!pk || !pk.a) return;
          const sc = G.scoreRace(r, pk, state.results);
          ((takes[pk.a] = takes[pk.a] || {})[p.id] = (takes[pk.a][p.id] || [])).push({ tag: raceTag(r), sc });
          totals[r.gender][p.id] = (totals[r.gender][p.id] || 0) + (sc || 0);
        });
      });
    });
    const head = state.players.map((p) => `<th scope="col" class="${p.id === state.me ? 'me' : ''}">${esc(p.name)}</th>`).join('');
    const filters = `<div class="filters">
      <label class="sr" for="ath-q">Chercher un skieur</label>
      <input type="search" id="ath-q" class="search" placeholder="Chercher un skieur ou une nation" value="${esc(state.tq)}" autocomplete="off">
      <div class="seg seg--sm" role="group" aria-label="Filtrer les skieurs">${[['all', 'Tous'], ['taken', 'Déjà pris'], ['free', 'Encore libres']].map(([id, l]) =>
        `<button type="button" class="seg__btn" data-tf="${id}" aria-pressed="${state.tf === id}">${l}</button>`).join('')}</div>
    </div>`;
    return filters + ['M', 'W'].map((g) => {
      const list = LIST[g];
      const taken = list.filter((a) => takes[a.id]).length;
      const rows = list.map((a) => {
        const on = !!takes[a.id];
        const cells = state.players.map((p) => {
          const l = takes[a.id] && takes[a.id][p.id];
          const inner = l ? l.map((x) => `<span class="mark" title="${esc(x.tag)}"><span class="mark__l">${esc(x.tag)}</span>${x.sc === null ? '' : `<b class="mark__p ${x.sc > 0 ? 'on' : 'off'}">${x.sc > 0 ? '+' : ''}${x.sc}</b>`}</span>`).join('') : '';
          return `<td class="${p.id === state.me ? 'me' : ''}">${inner}</td>`;
        }).join('');
        return `<tr class="${on ? 'is-taken' : 'is-free'}" data-name="${esc(norm(a.name + ' ' + (a.fis || '') + ' ' + a.nat))}" data-taken="${on ? 1 : 0}"><th scope="row">${avatar(ATH[a.id], on)}<span class="athname">${a.rank ? `<span class="rk">${a.rank}</span> ` : ''}${esc(a.name)} <em class="sub">${esc(a.nat || (a.pending ? 'à régulariser' : ''))}</em></span></th>${cells}</tr>`;
      }).join('');
      const foot = state.players.map((p) => `<td class="${p.id === state.me ? 'me' : ''}"><strong>${totals[g][p.id] || 0} pts</strong></td>`).join('');
      return `<div class="tablewrap tablewrap--scroll"><table class="grid grid--taken">
        <caption>${g === 'M' ? 'Messieurs' : 'Dames'}, ${taken} sur ${list.length} déjà pris</caption>
        <thead><tr><th scope="col">Skieur</th>${head}</tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><th scope="row">Points rapportés</th>${foot}</tr></tfoot></table></div>`;
    }).join('') + '<p class="hint">En couleur : déjà choisi. En noir et blanc : encore libre. Les choix des autres apparaissent à la deadline de chaque session.</p>';
  }

  /* ---------- Panneau d'un desk / des Mondiaux ---------- */
  function worldsBox() {
    const b = G.worldsBonus(myPicks(), state.results);
    const lines = b.lines.length
      ? `<ul class="bonus__lines">${b.lines.map((l) => `<li><span>${esc(l.label)}</span><strong>+${l.pts}</strong></li>`).join('')}</ul>` : '';
    return `<aside class="bonus">
      <h3>Bonus des vainqueurs ${info('Aux Mondiaux, tu gagnes un bonus si tes choix remportent des épreuves : +200 par discipline gagnée à la fois chez les messieurs et chez les dames, +400 si tes quatre skieurs d’un même genre gagnent leur discipline.')}</h3>
      <ul class="bonus__rules">
        <li><strong>+200</strong><span>les deux vainqueurs d’une discipline (messieurs et dames)</span></li>
        <li><strong>+400</strong><span>les quatre vainqueurs messieurs, ou les quatre dames</span></li>
        <li><strong>1 600</strong><span>pour les huit, bonus cumulés</span></li>
      </ul>${lines}
    </aside>`;
  }
  function deskPanel(key) {
    const isW = key === 0;
    const sessions = scopeSessions(key);
    const sub = state.sub[key];
    const dk = isW ? null : D.DESKS[key - 1];
    const score = isW ? G.worldsScore(myPicks(), state.results).total : G.deskScore(key, myPicks(), state.results);
    const total = sessions.reduce((n, s) => n + active(G.sessionRaces(s)).length, 0);
    const chosen = sessions.reduce((n, s) => n + active(G.sessionRaces(s)).filter((r) => (myPicks()[r.id] || {}).a).length, 0);
    const title = isW ? 'Championnats du monde' : dk.name;
    const meta = isW ? `Crans-Montana, 4 au 14 février, ${total} courses` : `${shortOf(dk.from)} au ${shortOf(dk.to)}, ${total} courses`;
    const tabs = [['mine', 'Mon desk'], ['recap', 'Récap des joueurs'], ['taken', 'Athlètes pris']].map(([id, label]) =>
      `<button type="button" role="tab" class="seg__btn" aria-selected="${sub === id}" data-sub="${id}" data-key="${key}">${label}</button>`).join('');
    let body;
    if (sub === 'mine') {
      body = (isW ? worldsBox() : '') + sessions.map((s, i) => sessionCard(s, isW ? '' : `session ${i + 1} sur ${sessions.length}`)).join('')
        + '<p class="hint">Heures de départ provisoires.</p>';
    } else if (sub === 'recap') body = (isW ? worldsBox() : '') + recapView(key);
    else body = takenView(key);
    return `<section>
      <header class="deskhead">
        <div><h2>${esc(title)}</h2><p class="deskhead__meta">${esc(meta)}</p>
          <p class="rule">${isW ? 'Barème ×3. Un skieur ne peut être choisi qu’une fois.' : 'Un skieur ne peut être choisi qu’une fois dans ce desk.'} ${info(isW ? 'Aux Mondiaux, les points sont multipliés par 3 et un skieur ne peut servir qu’une fois sur l’ensemble des 8 épreuves. Messieurs et dames comptent à part.' : 'Dans un même desk, un skieur ne peut être choisi qu’une seule fois chez les messieurs et une seule fois chez les dames. Un skieur déjà pris apparaît grisé.')}</p></div>
        <dl class="deskhead__stats"><div><dt>Choix faits ${info('Nombre de courses de ce desk pour lesquelles tu as déjà choisi un skieur.')}</dt><dd>${chosen}/${total}</dd></div><div><dt>Points ${info('Total de tes points sur ce desk, d’après les résultats déjà saisis.')}</dt><dd>${score}</dd></div></dl>
      </header>
      <div class="seg" role="tablist" aria-label="Vue du desk">${tabs}</div>
      <div class="deskbody">${body}</div>
    </section>`;
  }

  /* ---------- Session à venir / en cours (forfait) ---------- */
  function nextPanel() {
    const up = upcomingSession();
    if (!up) return '<p class="empty">La saison est terminée.</p>';
    const isW = up.id === 'X';
    const races = sortedRaces(up);
    const dl = G.sessionDeadline(up);
    const live = active(races);
    const open = live.some((r) => !lockedRace(r));
    const n = live.filter((r) => (myPicks()[r.id] || {}).a).length;
    const inDesk = D.SESSIONS.filter((s) => s.desk === up.desk);
    const where = isW ? 'Hors desk, barème ×3' : `Desk ${up.desk}, session ${inDesk.indexOf(up) + 1} sur ${inDesk.length}`;
    const goto = isW ? 0 : up.desk;
    const list = races.map((r) => {
      const d = at(r.date);
      return `<li class="mini">
        <span class="mini__when"><b>${F_NUM.format(d)}</b> ${F_MO.format(d)}</span>
        <span class="mini__what"><strong>${fl(placeLabel(r))}</strong> <span class="gender gender--${r.gender}">${genderLabel(r)}</span>${discBadge(r)}</span>
        <span class="mini__pick">${r.cancelled ? '<span class="none">Annulée</span>' : (myPicks()[r.id] || {}).a ? pickSummary(state.me, r) : '<span class="todo">À choisir</span>'}</span></li>`;
    }).join('');
    const stub = open
      ? `<p class="forfait__label">Deadline dans ${info('Tes choix se modifient librement jusqu’au départ de la première course de la session. Ensuite ils sont verrouillés, et les choix de tous les joueurs deviennent visibles.')}</p><p class="countdown" id="countdown" data-dl="${dl.toISOString()}">${countdownText(dl)}</p><p class="forfait__dl">${dlShort(dl)}</p>${remindBtn(up)}`
      : `<p class="forfait__label">Choix verrouillés</p><p class="countdown countdown--shut">Course en cours</p><p class="forfait__dl">depuis ${dlShort(dl)}</p>`;
    const cta = open ? (n === live.length ? 'Modifier mes choix' : 'Faire mes choix') : 'Voir le desk';
    return `<section>
      <article class="forfait">
        <div class="forfait__main">
          ${stateBadge(up)}
          <h2 class="forfait__name">${fl(up.name)}</h2>
          <p class="forfait__where">${esc(where)}</p>
          <ul class="minis">${list}</ul>
          <button type="button" class="btn btn--brique" data-goto="${goto}">${cta}</button>
        </div>
        <div class="forfait__stub">${stub}</div>
      </article>
      ${open ? '' : `<h3 class="subtitle">Choix de tous les joueurs</h3>${recapTable(up)}`}
    </section>`;
  }
  function countdownText(dl) {
    let s = Math.max(0, Math.floor((dl - now()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    return `<span><b>${d}</b> j</span> <span><b>${h}</b> h</span> <span><b>${m}</b> min</span>`;
  }

  /* ---------- Classements ---------- */
  function rankRows(scoreFn) {
    const rows = state.players.map((p) => ({ p, v: scoreFn(state.picks[p.id] || {}) })).sort((a, b) => b.v.total - a.v.total);
    let last = null, rank = 0;
    rows.forEach((r, i) => { if (r.v.total !== last) { rank = i + 1; last = r.v.total; } r.rank = rank; });
    return rows;
  }
  function smallRanking(title, scoreFn, cls) {
    const rows = rankRows((pk) => ({ total: scoreFn(pk) }));
    return `<div class="tablewrap"><table class="grid grid--rank ${cls || ''}"><caption>${esc(title)}</caption>
      <thead><tr><th scope="col" class="num">Rang</th><th scope="col">Joueur</th><th scope="col" class="num">Points</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num"><span class="rnk rnk--${r.rank <= 3 ? r.rank : 'n'}">${r.rank}</span></td><th scope="row">${esc(r.p.name)}</th><td class="num">${r.v.total}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function generalPanel() {
    const R = state.results;
    const rows = rankRows((pk) => G.generalScore(pk, R));
    const main = `<div class="tablewrap"><table class="grid grid--rank grid--general cap--gen"><caption>Le gros globe ${info('Classement général : somme des points des trois desks et des Mondiaux, bonus compris.')}</caption>
      <thead><tr><th scope="col" class="num">Rang</th><th scope="col">Joueur</th><th scope="col" class="num th--d1">Desk 1</th><th scope="col" class="num th--d2">Desk 2</th><th scope="col" class="num th--d3">Desk 3</th><th scope="col" class="num th--w">Mondiaux</th><th scope="col" class="num">Total</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num"><span class="rnk rnk--${r.rank <= 3 ? r.rank : 'n'}">${r.rank}</span></td><th scope="row">${esc(r.p.name)}</th>${r.v.desks.map((d) => `<td class="num">${d}</td>`).join('')}<td class="num">${r.v.worlds}</td><td class="num total">${r.v.total}</td></tr>`).join('')}</tbody></table></div>`;
    const desks = D.DESKS.map((d) => smallRanking(`Classement du ${d.name}`, (pk) => G.deskScore(d.id, pk, R), 'cap--d' + d.id)).join('');
    const discs = ['DH', 'SG', 'GS', 'SL'].map((c) => smallRanking(`Petit globe de ${c === 'SG' ? 'super-G' : D.DISC[c].fr.toLowerCase()}`, (pk) => G.disciplineScore(c, pk, R), 'cap--' + c)).join('');
    const none = Object.keys(R).length === 0 ? '<p class="hint">Aucun résultat pour l’instant.</p>' : '';
    return `<section class="genpanel"><header class="deskhead"><div><h2>Classement général</h2>
      <p class="deskhead__meta">Trois desks et les Mondiaux, bonus compris</p></div></header>${none}${main}
      <h3 class="subtitle">Par desk</h3><div class="grid3">${desks}</div>
      <h3 class="subtitle">Petits globes</h3><div class="grid2">${discs}</div></section>`;
  }

  /* ---------- Navigation & rendu ---------- */
  function tabs() {
    const up = upcomingSession();
    const label = up && G.sessionState(up, now()) === 'en cours' ? 'Session en cours' : 'Session à venir';
    return [
      { id: 'next', label, note: '' },
      { id: '1', label: 'Desk 1', note: `${shortOf(D.DESKS[0].from)} au ${shortOf(D.DESKS[0].to)}` },
      { id: '2', label: 'Desk 2', note: `${shortOf(D.DESKS[1].from)} au ${shortOf(D.DESKS[1].to)}` },
      { id: 'w', label: 'Mondiaux', note: '4 au 14 févr.' },
      { id: '3', label: 'Desk 3', note: `${shortOf(D.DESKS[2].from)} au ${shortOf(D.DESKS[2].to)}` },
      { id: 'gen', label: 'Classement général', note: '' },
    ].concat(isAdmin() ? [{ id: 'adm', label: 'Admin', note: 'organisateur' }] : []);
  }
  const TAB_IDS = ['next', '1', '2', 'w', '3', 'gen', 'adm'];
  function renderTabs() {
    $('#tabs').innerHTML = tabs().map((t) => `<button type="button" role="tab" class="plate plate--${t.id}" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${state.tab === t.id}">
      <span class="plate__label">${t.label}</span>${t.note ? `<span class="plate__note">${t.note}</span>` : ''}</button>`).join('');
  }

  /* ---------- Règles, boîte à idées, bulles d'aide ---------- */
  function rulesHtml() {
    return `<div class="rules">
      <h3>Le principe</h3>
      <p>À chaque course de la Coupe du Monde, tu choisis <strong>un skieur</strong> (et, si tu veux, un remplaçant). Il te rapporte les points de la Coupe du Monde : <strong>100 pour le 1er, 80, 60, 50, 45…</strong> jusqu’à 1 point pour le 30e.</p>
      <h3>L’organisation</h3>
      <ul>
        <li><strong>3 desks</strong> (octobre-décembre, janvier, février-mars) et les <strong>Mondiaux</strong> de Crans-Montana, soit une vingtaine de sessions. Chaque session regroupe quelques courses.</li>
        <li>Messieurs et dames sont chacun à part : un choix par course.</li>
        <li>Slalom et géant : classement cumulé des deux manches. Chaque descente compte comme une course. Les épreuves par équipes sont exclues.</li>
        <li><strong>Finales ×2</strong> et <strong>Mondiaux ×3</strong> (avec un bonus si tes choix gagnent).</li>
      </ul>
      <h3>La règle d’or</h3>
      <p>Dans un desk, <strong>un skieur ne peut être choisi qu’une seule fois</strong> par genre. Aux Mondiaux aussi, une seule fois sur les huit épreuves. Il faut donc gérer ses atouts sur la durée.</p>
      <h3>Les délais</h3>
      <ul>
        <li>Tu peux changer tes choix jusqu’au <strong>départ de la première course de la session</strong>.</li>
        <li>Ensuite tout est verrouillé, et les choix des autres joueurs deviennent visibles (avant, ils sont cachés).</li>
      </ul>
      <h3>Quand ça ne se passe pas comme prévu</h3>
      <ul>
        <li><strong>Chute ou abandon</strong> : 0 point, et le skieur reste « grillé » dans ce desk.</li>
        <li><strong>Non-partant</strong> : ton remplaçant prend la place, et lui seul est grillé. Sans remplaçant, l’organisateur fait un tirage au sort.</li>
        <li><strong>Course annulée</strong> : personne ne marque, ton skieur est libéré.</li>
        <li><strong>Course reportée</strong> : ton choix est gardé, modifiable jusqu’au nouveau départ.</li>
      </ul>
      <h3>Les classements</h3>
      <p>Général (gros globe), par desk, et un petit globe par discipline (descente, super-G, géant, slalom).</p>
    </div>`;
  }
  function openModal(html) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal__card" role="dialog" aria-modal="true"><button type="button" class="modal__x" data-close aria-label="Fermer">×</button>${html}</div>`;
    m.hidden = false; document.body.classList.add('noscroll');
    const f = m.querySelector('textarea, button:not(.modal__x)'); if (f) f.focus({ preventScroll: true });
  }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.dataset.lock = ''; m.innerHTML = ''; document.body.classList.remove('noscroll'); }
  const rulesSeen = () => { try { return !!localStorage.getItem('skigame.rulesSeen'); } catch (e) { return false; } };
  const markSeen = () => { try { localStorage.setItem('skigame.rulesSeen', '1'); } catch (e) { /* ignoré */ } };
  function rulesModal(intro) {
    openModal(`<h2>${intro ? 'Bienvenue sur Ski Game' : 'Les règles du jeu'}</h2>${intro ? '<p class="hint">Voici le jeu en deux minutes. Tu les retrouveras à tout moment via « Règles du jeu » en haut de la page.</p>' : ''}${rulesHtml()}
      <div class="remindbtns"><button type="button" class="btn btn--brique" data-rules-ok>Ok, j’ai compris</button><button type="button" class="btn btn--ghost" data-question>J’ai une question</button></div>`);
    $('#modal').dataset.lock = intro ? '1' : '';
  }
  /** Première visite : les règles s'affichent et restent jusqu'à « Ok, j'ai compris ». */
  function introRules() { if (!state.demo && !rulesSeen() && $('#modal').hidden) rulesModal(true); }
  function questionForm() {
    const who = state.user ? '' : `<label for="q-contact">Ton nom ou e-mail (pour qu’on puisse te répondre)</label><input id="q-contact" type="text" maxlength="80">`;
    $('#modal .modal__card').innerHTML = `<h2>J’ai une question</h2><p class="hint">Pose ta question sur le jeu ou son fonctionnement : l’organisateur la recevra.</p>
      <form id="q-form"><label class="sr" for="q-text">Ta question</label><textarea id="q-text" rows="5" maxlength="1500" required></textarea>${who}
      <p class="auth__err" id="q-msg" role="status"></p><button type="submit" class="btn btn--brique">Envoyer ma question</button></form>`;
    $('#q-text').focus();
  }
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'q-form') return;
    e.preventDefault();
    const text = $('#q-text').value.trim(); if (!text) return;
    const c = $('#q-contact');
    try {
      await store.addIdea({ kind: 'question', uid: state.user ? state.user.uid : '', name: state.user ? state.user.name : '', contact: c ? c.value.trim() : '', text });
      $('#modal .modal__card').innerHTML = '<h2>Merci !</h2><p class="adm__msg">Ta question a bien été envoyée.</p><button type="button" class="btn btn--brique" data-rules-ok>Continuer</button>';
    } catch (err) { $('#q-msg').textContent = 'Envoi impossible : ' + (err.message || err); }
  });
  const ideasModal = () => openModal(`<h2>Boîte à idées</h2>
    <p class="hint">N’hésite pas à formuler tes suggestions d’améliorations sur l’ergonomie du site. Pas sur les règles, mais sur les fonctionnalités, la navigation, les stats éventuelles, etc.</p>
    <form id="idea-form"><label class="sr" for="idea-text">Ta suggestion</label><textarea id="idea-text" rows="6" maxlength="1500" placeholder="Ta suggestion…" required></textarea>
    <p class="auth__err" id="idea-msg" role="status"></p><button type="submit" class="btn btn--brique">Envoyer</button></form>`);
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'idea-form') return;
    e.preventDefault();
    const t = $('#idea-text').value.trim();
    if (!t || !state.user) return;
    try {
      await store.addIdea({ kind: 'idea', uid: state.user.uid, name: state.user.name, text: t });
      $('#idea-form').innerHTML = '<p class="adm__msg">Merci ! Ta suggestion a bien été envoyée.</p><button type="button" class="btn" data-close>Fermer</button>';
    } catch (err) { $('#idea-msg').textContent = 'Envoi impossible : ' + (err.message || err); }
  });
  function showTip(btn) {
    const tip = $('#tip');
    if (!tip.hidden && tip._for === btn) { hideTip(); return; }
    tip.textContent = btn.dataset.info; tip._for = btn; tip.hidden = false;
    const r = btn.getBoundingClientRect(), w = Math.min(280, window.innerWidth - 24);
    tip.style.width = w + 'px';
    tip.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    const h = tip.offsetHeight;
    tip.style.top = (r.bottom + h + 14 > window.innerHeight && r.top > h + 14 ? r.top - h - 8 : r.bottom + 8) + 'px';
  }
  function hideTip() { const t = $('#tip'); t.hidden = true; t._for = null; }
  document.addEventListener('click', (e) => {
    const i = e.target.closest('.info');
    if (i) { e.preventDefault(); showTip(i); return; }
    if (!e.target.closest('#tip')) hideTip();
    if (e.target.closest('[data-rules-ok]')) { markSeen(); closeModal(); return; }
    if (e.target.closest('[data-question]')) { questionForm(); return; }
    const lk = $('#modal').dataset.lock === '1';
    if (e.target.closest('[data-close]') || (e.target.id === 'modal' && !lk)) closeModal();
    if (e.target.closest('[data-rules]')) rulesModal(false);
    if (e.target.closest('[data-ideas]')) ideasModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideTip(); if ($('#modal').dataset.lock !== '1') closeModal(); } });
  window.addEventListener('scroll', hideTip, { passive: true });


  /* ---------- Rappel agenda (fichier .ics ou lien Google Agenda) ---------- */
  const REMIND = [['1h', '1 h avant la deadline'], ['2h', '2 h avant la deadline'], ['24h', '24 h avant la deadline'], ['eve22', 'La veille à 22 h'], ['eve20', 'La veille à 20 h']];
  const FMT_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function remindAt(dl, key) {
    if (key === '1h') return new Date(dl - 3600e3);
    if (key === '2h') return new Date(dl - 7200e3);
    if (key === '24h') return new Date(dl - 86400e3);
    const [y, m, d] = FMT_YMD.format(dl).split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    return G.parisInstant(prev, key === 'eve22' ? '22:00' : '20:00');
  }
  const remindKey = (sid) => { try { return localStorage.getItem('skigame.remind.' + sid) || ''; } catch (e) { return ''; } };
  const remindSave = (sid, k) => { try { if (k) localStorage.setItem('skigame.remind.' + sid, k); else localStorage.removeItem('skigame.remind.' + sid); } catch (e) { /* ignoré */ } };
  const remindBtn = (session) => {
    const k = remindKey(session.id);
    const lab = k ? 'Rappel : ' + REMIND.find((r) => r[0] === k)[1].toLowerCase() : 'Me rappeler';
    return `<button type="button" class="remindbtn${k ? ' is-on' : ''}" data-remind="${session.id}">🔔 ${lab}</button>`;
  };
  const icsUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = (t) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  function remindEvent(session, key) {
    const dl = G.sessionDeadline(session), start = remindAt(dl, key);
    const title = `Ski game : valide tes choix avant ${hourText(dl)} (${session.name})`;
    const desc = `Deadline : ${dlShort(dl)} (heure de Paris). Tes choix se modifient jusqu’au départ de la première course.\n${location.origin}${location.pathname}`;
    return { start, end: new Date(start.getTime() + 15 * 60e3), title, desc };
  }
  function remindOpen(session) {
    const cur = remindKey(session.id) || '1h';
    const dl = G.sessionDeadline(session);
    openModal(`<h2>Rappel pour cette session</h2>
      <p class="hint">${esc(session.name)} : deadline ${esc(dlShort(dl))}. Choisis quand tu veux être prévenu, puis l’agenda à relier.</p>
      <form id="remind-form" data-sid="${session.id}"><div class="remindopts">${REMIND.map(([k, l]) => `<label><input type="radio" name="rk" value="${k}"${k === cur ? ' checked' : ''}> ${l} <span class="sub">${esc(dlShort(remindAt(dl, k)))}</span></label>`).join('')}</div>
      <div class="remindbtns"><button type="submit" class="btn btn--brique" data-kind="ics">Ajouter à mon agenda</button><button type="submit" class="btn" data-kind="google">Google Agenda</button>${remindKey(session.id) ? '<button type="submit" class="btn btn--ghost" data-kind="off">Retirer le rappel</button>' : ''}</div>
      <p class="hint">« Ajouter à mon agenda » télécharge un fichier : ouvre-le et choisis l’agenda (Apple, Google, Outlook…). Le rappel est un événement placé à l’heure choisie.</p></form>`);
  }
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'remind-form') return;
    e.preventDefault();
    const kind = e.submitter && e.submitter.dataset.kind;
    const sid = e.target.dataset.sid;
    const session = allSessions().find((x) => String(x.id) === sid);
    if (!session) return;
    if (kind === 'off') { remindSave(sid, ''); closeModal(); render(); return; }
    const key = new FormData(e.target).get('rk');
    remindSave(sid, key);
    const ev = remindEvent(session, key);
    if (kind === 'google') {
      window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) + '&dates=' + icsUtc(ev.start) + '/' + icsUtc(ev.end) + '&details=' + encodeURIComponent(ev.desc), '_blank', 'noopener');
    } else {
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ski game//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:skigame-${sid}-${key}@skigame`, `DTSTAMP:${icsUtc(new Date())}`, `DTSTART:${icsUtc(ev.start)}`, `DTEND:${icsUtc(ev.end)}`, `SUMMARY:${icsEsc(ev.title)}`, `DESCRIPTION:${icsEsc(ev.desc)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Ski game', 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      a.download = `ski-game-rappel-${sid}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
    }
    closeModal(); render();
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remind]');
    if (!b) return;
    const session = allSessions().find((x) => String(x.id) === b.dataset.remind);
    if (session) remindOpen(session);
  });

  /* ---------- Connexion ---------- */
  function authPanel() {
    const up = state.authMode === 'up';
    return `<section class="auth"><form class="authcard" id="auth-form" novalidate>
      <h2>${up ? 'Créer mon compte' : 'Connexion'}</h2>
      <p class="auth__intro">${up ? 'Une adresse e-mail et un mot de passe suffisent. Choisis le nom qui s’affichera dans les classements.' : 'Connecte-toi pour faire tes choix et voir le classement.'}</p>
      ${up ? '<label for="au-name">Ton nom dans le jeu</label><input id="au-name" name="name" type="text" autocomplete="nickname" maxlength="24" required>' : ''}
      <label for="au-mail">Adresse e-mail</label><input id="au-mail" name="email" type="email" autocomplete="email" required>
      <label for="au-pw">Mot de passe${up ? ' (6 caractères minimum)' : ''}</label><input id="au-pw" name="pw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required>
      <p class="auth__err" id="auth-err" role="alert">${esc(state.authError)}</p>
      <button type="submit" class="btn btn--brique">${up ? 'Créer mon compte' : 'Me connecter'}</button>
      <p class="auth__alt">${up ? 'Déjà un compte ?' : 'Pas encore de compte ?'} <button type="button" class="linkbtn" data-auth="${up ? 'in' : 'up'}">${up ? 'Me connecter' : 'Créer un compte'}</button> · <button type="button" class="linkbtn" data-rules>Revoir les règles</button>${up ? '' : ' · <button type="button" class="linkbtn" data-auth="reset">Mot de passe oublié</button>'}</p>
      ${store.mode === 'local' ? '<p class="auth__local">Mode local : les comptes et les choix restent dans ce navigateur (pas de partage entre joueurs).</p>' : ''}
    </form></section>`;
  }
  function renderUserbar() {
    const el = $('#userbar');
    if (!el) return;
    const ma = $('#mastact'); if (ma) { ma.hidden = !state.user && !state.demo; ma.innerHTML = '<button type="button" class="mastbtn" data-rules>Règles du jeu</button><button type="button" class="mastbtn" data-ideas>Boîte à idées</button>'; }
    el.hidden = !state.user || state.demo;
    if (!el.hidden) el.innerHTML = `<span>Connecté : <strong>${esc(state.user.name)}</strong></span> <button type="button" class="linkbtn" data-auth="rename">Changer mon nom</button> <button type="button" class="linkbtn" data-auth="out">Me déconnecter</button>`;
  }
  function renderPanel() {
    const t = state.tab;
    if (!state.authReady && !state.demo) { $('#panel').innerHTML = '<p class="hint">Chargement…</p>'; return; }
    if (!state.user && !state.demo) {
      $('#panel').innerHTML = authPanel();
      return;
    }
    if (t === 'adm' && !isAdmin()) state.tab = 'next';
    const html = state.tab === 'adm' ? window.SKI_ADMIN.render(adminCtx()) : state.tab === 'next' ? nextPanel() : state.tab === 'gen' ? generalPanel() : state.tab === 'w' ? deskPanel(0) : deskPanel(Number(state.tab));
    $('#panel').innerHTML = (state.demo ? '<p class="demo">Démonstration : joueurs, choix et résultats fictifs.</p>' : '') + html;
    $('#panel').setAttribute('aria-labelledby', 'tab-' + state.tab);
    applyTakenFilter();
  }
  /** Recherche et filtre de « Athlètes pris » : on masque des lignes, sans réafficher (le focus reste dans le champ). */
  function applyTakenFilter() {
    const q = norm(state.tq.trim());
    document.querySelectorAll('.grid--taken tbody tr').forEach((tr) => {
      const okQ = !q || tr.dataset.name.includes(q);
      const okF = state.tf === 'all' || (state.tf === 'taken') === (tr.dataset.taken === '1');
      tr.hidden = !(okQ && okF);
    });
    document.querySelectorAll('[data-tf]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === state.tf)));
  }
  function render() {
    $('#tabs').closest('nav').hidden = !state.user && !state.demo;
    renderTabs(); renderUserbar(); renderPanel(); syncSim();
    const f = document.querySelector('.atelier'); if (f) f.hidden = !(state.demo || store.mode === 'local');
  }

  function syncSim() {
    const el = $('#sim-date');
    if (!el) return;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now()).map((x) => [x.type, x.value]));
    el.value = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  /** Changer d'onglet ramène toujours chaque desk sur son premier sous-onglet (« Mon desk »). */
  function setTab(id) {
    state.tab = id;
    state.sub = freshSubs();
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignoré */ }
    render();
    window.scrollTo({ top: 0 });
  }

  /* ---------- Actions : connexion ---------- */
  async function authAction(kind) {
    if (kind === 'in' || kind === 'up') { state.authMode = kind; state.authError = ''; render(); return; }
    if (kind === 'out') { await store.signOut(); state.tab = 'next'; state.authMode = 'in'; state.authError = ''; render(); return; }
    if (kind === 'rename') {
      const n = (window.prompt('Ton nom dans le jeu :', state.user.name) || '').trim().slice(0, 24);
      if (n) store.setPlayerName(state.user.uid, n).catch(fail);
      return;
    }
    if (kind === 'reset') {
      const f = $('#au-mail');
      const mail = (f && f.value.trim()) || window.prompt('Adresse e-mail du compte :') || '';
      if (!mail) return;
      try { await store.resetPassword(mail); state.authError = 'Un e-mail de réinitialisation vient d’être envoyé.'; } catch (err) { state.authError = err.message; }
      render();
    }
  }
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'auth-form') return;
    e.preventDefault();
    const f = e.target, v = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
    state.authError = '';
    try {
      if (state.authMode === 'up') {
        if (!v('name')) throw new Error('Choisis un nom pour le jeu.');
        await store.signUp(v('email'), f.elements.pw.value, v('name'));
      } else await store.signIn(v('email'), f.elements.pw.value);
    } catch (err) { state.authError = err.message || String(err); }
    render();
  });

  /* ---------- Actions : choix d'un skieur ---------- */
  const slugOf = (n) => norm(n).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  function findAthleteByName(name, gender) {
    const k = norm(name).replace(/[^a-z0-9]/g, '');
    return LIST[gender].find((a) => norm(a.name).replace(/[^a-z0-9]/g, '') === k || norm(a.fis || '').replace(/[^a-z0-9]/g, '') === k);
  }
  async function onPick(sel) {
    const race = G.raceOf(sel.dataset.race);
    if (lockedRace(race)) { render(); return; } // deadline passée : on ignore
    const cur = Object.assign({}, myPicks()[race.id] || {});
    const slot = sel.dataset.slot;
    let value = sel.value;
    if (value === '__free__') {
      const name = (window.prompt('ATTENTION : vérifie d\'abord que ce skieur n\'est vraiment pas dans la liste déroulante (cherche-le par son nom de famille).\n\nNom du skieur (prénom et nom) :') || '').trim();
      if (!name) { render(); return; }
      const known = findAthleteByName(name, race.gender);
      if (known) value = known.id;
      else {
        const id = 'x-' + slugOf(name) + '-' + Math.random().toString(36).slice(2, 6);
        const a = { id, name, gender: race.gender, nat: '', pending: true, createdBy: state.me };
        state.extra.push(a); rebuildAthletes();
        try { await store.addAthlete(a); } catch (err) { fail(err); return; }
        value = id;
      }
    }
    if (value) cur[slot] = value; else delete cur[slot];
    if (slot === 'a') { if (!cur.a || cur.b === cur.a) delete cur.b; }
    delete cur.ts;
    const out = cur.a ? cur : null;
    const picks = myPicks(); // relu ici : les données ont pu être rechargées pendant l'attente
    // affichage immédiat, puis enregistrement
    if (out) picks[race.id] = out; else delete picks[race.id];
    const y = window.scrollY;
    renderPanel();
    window.scrollTo({ top: y });
    const again = document.getElementById(sel.id);
    if (again) again.focus({ preventScroll: true });
    if (!state.demo) store.setPick(state.me, race.id, out).catch(fail);
  }

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { setTab(tab.dataset.tab); return; }
    const go = e.target.closest('[data-goto]');
    if (go) { setTab(go.dataset.goto === '0' ? 'w' : go.dataset.goto); return; }
    const tf = e.target.closest('[data-tf]');
    if (tf) { state.tf = tf.dataset.tf; applyTakenFilter(); return; }
    const sub = e.target.closest('[data-sub]');
    if (sub) { state.sub[Number(sub.dataset.key)] = sub.dataset.sub; renderPanel(); return; }
    const fr = e.target.closest('[data-free]');
    if (fr) { onPick({ dataset: { race: fr.dataset.free, slot: fr.dataset.slot }, value: '__free__', id: `p${fr.dataset.slot}-${fr.dataset.free}` }); return; }
    const au = e.target.closest('[data-auth]');
    if (au) { authAction(au.dataset.auth); return; }
    if (e.target.closest('#btn-demo')) loadDemo();
    if (e.target.closest('#btn-reset') && state.me) {
      Object.keys(myPicks()).forEach((rid) => { if (!lockedRace(G.raceOf(rid))) store.setPick(state.me, rid, null).catch(fail); });
    }
    if (e.target.closest('#btn-now')) { state.sim = null; render(); }
  });

  document.addEventListener('change', (e) => {
    const sel = e.target.closest('select.pick');
    if (sel) { onPick(sel); return; }
    if (e.target.id === 'sim-date' && e.target.value) {
      const [d, t] = e.target.value.split('T');
      state.sim = G.parisInstant(d, t);
      render();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'ath-q') { state.tq = e.target.value; applyTakenFilter(); }
  });

  // Une photo absente (fichier non fourni) est retirée : il reste les initiales.
  document.addEventListener('error', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('avatar__img')) e.target.remove();
  }, true);

  function loadDemo() {
    state.demo = true;
    state.user = { uid: DEMO.ME, email: '', name: 'Alexandre' };
    state.me = DEMO.ME;
    G.setOverrides({});
    state.players = DEMO.PLAYERS.slice();
    state.picks = JSON.parse(JSON.stringify(DEMO.PICKS));
    state.results = JSON.parse(JSON.stringify(DEMO.RESULTS));
    state.sim = new Date(DEMO.DEMO_NOW);
    render();
  }

  setInterval(() => {
    const c = $('#countdown');
    if (c) c.innerHTML = countdownText(new Date(c.dataset.dl));
  }, 30000);

  /* ---------- Démarrage ---------- */
  const adminCtx = () => ({ state, G, D, store, LIST, ATH, esc, norm, at, F_DAY, hourText, dlShort, shortOf, placeLabel, discLabel, genderLabel, nameOf, avatarOf, sortedRaces, lockedRace, active, canon, rerender: render, fail, isAdmin });
  const q = new URLSearchParams(location.search);
  const h = location.hash.replace('#', '');
  if (TAB_IDS.includes(h)) state.tab = h;
  if (q.has('demo')) loadDemo();
  else { rebuildAthletes(); startStore(); }
  render();
  window.SKI_APP = { state, render, store };
})();
