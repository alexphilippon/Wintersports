/* Ski game – interface */
(function () {
  'use strict';
  const D = window.SKI_DATA, G = window.SKI_GAME, SHARE = window.SKI_SHARE, DEMO = window.SKI_DEMO, BASE = window.SKI_ATHLETES, CONFIG = window.SKI_CONFIG || {};
  const TZ = 'Europe/Paris';
  const PHOTO_DIR = 'img/athletes/'; // une photo par skieur : img/athletes/<id>.jpg (voir README)

  // Liste des skieurs : la liste de base (js/athletes.js) + ceux ajoutés par l'admin ou saisis librement par un joueur.
  let LIST = { M: BASE.M.slice(), W: BASE.W.slice() }, ATH = {};
  function rebuildAthletes() {
    LIST = { M: BASE.M.concat(state.addl.M), W: BASE.W.concat(state.addl.W) }; // liste de base + skieurs de data/extra-athletes.json
    state.extra.slice().sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.name.localeCompare(b.name)).forEach((x) => {
      if (!state.aliases[x.id] && LIST[x.gender] && !LIST[x.gender].some((a) => a.id === x.id)) LIST[x.gender].push(Object.assign({ rank: null }, x));
    });
    ATH = {};
    ['M', 'W'].forEach((g) => LIST[g].forEach((a) => { ATH[a.id] = Object.assign({}, a, { gender: g }); }));
    // un nom libre régularisé reste lisible : il pointe vers le vrai skieur
    state.extra.forEach((x) => { if (state.aliases[x.id] && ATH[state.aliases[x.id]]) ATH[x.id] = ATH[state.aliases[x.id]]; });
  }

  const freshSubs = () => ({ 1: 'mine', 2: 'mine', 3: 'mine', 0: 'mine' });
  const state = {
    tab: 'next',
    ff: { disc: [], gender: [] },   // filtres d'affichage des desks (vide = tout)
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
    major: true,           // « Athlètes pris » : seulement les skieurs majeurs
    tf: 'all',             // filtre : all | taken | free
    // données brutes du stockage
    raw: { picks: {}, results: {} },
    file: null, draws: {}, // résultats officiels lus dans data/results.json, tirages calculés
    acctOpen: false,       // « Mon compte » déployé (sur mobile, replié par défaut)
    startlists: null,      // start lists FIS lues dans data/startlists.json (voir tools/startlist.js)
    addl: { M: [], W: [] }, // skieurs ajoutés depuis une start list (data/extra-athletes.json, voir tools/add-missing.js)
    overrides: {}, extra: [], aliases: {},
    admin: { race: null, msg: '' },
    contacts: {}, contactsOn: false, // e-mails des joueurs (admin seulement)
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
  const seenIds = () => { try { return JSON.parse(localStorage.getItem('skigame.seenPlayers') || '[]'); } catch (e) { return []; } };
  const newPlayers = () => { const seen = new Set(seenIds()); return state.players.filter((p) => p.id !== state.me && !seen.has(p.id)); };
  const markPlayersSeen = () => { try { localStorage.setItem('skigame.seenPlayers', JSON.stringify(state.players.map((p) => p.id))); } catch (e) { /* ignoré */ } render(); };
  const isAdmin = () => !!state.user && !state.demo && (store.mode === 'local' || (!!CONFIG.adminEmail && state.user.email.toLowerCase() === CONFIG.adminEmail.toLowerCase()));

  const allSessions = () => [...D.SESSIONS, D.WORLDS].sort((a, b) => G.sessionDeadline(a) - G.sessionDeadline(b));
  const scopeSessions = (key) => (key === 0 ? [D.WORLDS] : D.SESSIONS.filter((s) => s.desk === key));
  const locked = (session) => G.sessionState(session, now()) !== 'ouverte';
  const lockedRace = (race) => G.raceLocked(race, now());
  const visible = (playerId, race) => playerId === state.me || lockedRace(race);
  const active = (races) => races.filter((r) => !r.cancelled);
  const passF = (r) => (!state.ff.disc.length || state.ff.disc.includes(r.disc)) && (!state.ff.gender.length || state.ff.gender.includes(r.gender));
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
    const res = {}, meta = {};
    const fileRaces = (state.file && state.file.races) || {};
    Object.entries(fileRaces).forEach(([rid, r]) => { // résultats officiels du dépôt (data/results.json) ; une saisie dans Firestore les remplace
      res[rid] = (r.entries || []).map((e) => Object.assign({}, e, { ath: canon(e.ath) }));
      if (r.start && r.seed) meta[rid] = { seed: r.seed, start: r.start.map((x) => ({ bib: x.bib, ath: canon(x.ath) })) };
    });
    Object.entries(state.raw.results).forEach(([rid, entries]) => { res[rid] = (entries || []).map((e) => Object.assign({}, e, { ath: canon(e.ath) })); delete meta[rid]; });
    state.results = res;
    state.draws = G.autoDraws(res, meta, picks); // tirages au sort : fonction pure des données publiques, donc vérifiables
    Object.entries(state.draws).forEach(([rid, byPlayer]) => Object.entries(byPlayer).forEach(([pid, d]) => { picks[pid][rid] = Object.assign({}, picks[pid][rid], { d: d.ath, auto: true }); }));
    state.picks = picks;
    scheduleRender();
  }
  function startStore() {
    store.onAuth((u) => { state.authReady = true; state.user = u; state.me = u ? u.uid : null; introRules(); if (isAdmin() && !state.contactsOn) { state.contactsOn = true; store.listenContacts((m) => { state.contacts = m; scheduleRender(); }); } if (!state.demo) { state.authError = ''; scheduleRender(); } });
    store.listen({
      players: (list) => { state.players = list.map((x) => ({ id: x.id, name: x.name || x.email || x.id, photo: x.photo || '', blocked: !!x.photoBlocked })).sort((a, b) => a.name.localeCompare(b.name, 'fr')); scheduleRender(); },
      picks: (m) => { state.raw.picks = m; state.picksReady = true; recompute(); },
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

  /** Start list FIS d'une course (data/startlists.json), ou null si elle n'est pas disponible.
      Retourne { rows: [{ bib, name, nat, ath }], fetched } ; ath = identifiant du skieur dans le jeu, null s'il n'est pas dans la liste. */
  const nameKey = (s) => norm(String(s)).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join(' ');
  function startListOf(race) {
    const s = state.startlists && state.startlists.races && state.startlists.races[race.id];
    if (!s || !s.start || !s.start.length) return null;
    const byKey = {};
    (LIST[race.gender] || []).forEach((a) => { byKey[nameKey(a.fis || a.name)] = a.id; });
    (LIST[race.gender] || []).forEach((a) => { if (!byKey[nameKey(a.name)]) byKey[nameKey(a.name)] = a.id; }); // noms saisis librement (« Prénom Nom »)
    return { rows: s.start.map((r) => ({ bib: r.bib, name: r.name, nat: r.nat, ath: byKey[nameKey(r.name)] || null })), fetched: s.fetched };
  }

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
    if (a.fis) { const sn = surnameOf(a); const first = a.fis.slice(sn.length).trim(); return first ? sn.toUpperCase() + ' ' + first : a.name; }
    const w = a.name.trim().split(/\s+/); return w.length > 1 ? w[w.length - 1].toUpperCase() + ' ' + w.slice(0, -1).join(' ') : a.name;
  }
  function bySurname(a, b) { return norm(listName(a)).localeCompare(norm(listName(b))); }
  function freeLink(race, slot) {
    return `<button type="button" class="freelink" data-free="${race.id}" data-slot="${slot}">Skieur absent de la liste ? Saisir son nom</button>`;
  }
  /** Liste déroulante avec recherche : on tape quelques lettres, la liste ne garde que les noms qui les contiennent. */
  function combo(race, session, slot) {
    const picks = myPicks();
    const used = G.usedInDesk(session.desk, race.gender, picks, race.id, state.results);
    const cur = picks[race.id] || {};
    // Start list disponible : les partants d'abord, par ordre de dossard ; sinon ordre alphabétique, sans numéro.
    const sl = startListOf(race);
    const bibOf = {}; if (sl) sl.rows.forEach((r) => { if (r.ath) bibOf[r.ath] = r.bib; });
    const alpha = LIST[race.gender].slice().sort(bySurname);
    const ordered = sl ? alpha.filter((a) => bibOf[a.id] !== undefined).sort((x, y) => bibOf[x.id] - bibOf[y.id]).concat(alpha.filter((a) => bibOf[a.id] === undefined)) : alpha;
    const items = ordered.map((a) => {
      const isCur = cur[slot] === a.id;
      const taken = used.has(a.id);
      const out = sl && bibOf[a.id] === undefined; // hors start list : grisé (sauf si déjà choisi)
      const dis = !isCur && (taken || out || (slot === 'b' && cur.a === a.id));
      const meta = [a.nat, a.pending ? 'à régulariser' : '', out ? 'hors start list' : '', taken && slot === 'a' ? 'déjà pris' : ''].filter(Boolean).join(', ');
      return { a, isCur, dis, out, label: (sl && !out ? bibOf[a.id] + ' · ' : '') + listName(a) + (meta ? ` (${meta})` : '') };
    });
    const curItem = items.find((x) => x.isCur);
    const ph = slot === 'a' ? 'Choisir un skieur (tape quelques lettres)' : 'Remplaçant (facultatif)';
    const id = `p${slot}-${race.id}`;
    const dis = slot === 'b' && !cur.a;
    return `<div class="combo${slot === 'b' ? ' combo--sub' : ''}" data-race="${race.id}" data-slot="${slot}">
      <input type="text" id="${id}" class="pick${slot === 'b' ? ' pick--sub' : ''} combo__in" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(ph)}" value="${esc(curItem ? curItem.label : '')}" data-cur="${esc(curItem ? curItem.label : '')}"${dis ? ' disabled' : ''}>
      ${curItem && !dis ? `<button type="button" class="combo__x" data-cx aria-label="Retirer ce choix" title="Retirer ce choix">×</button>` : ''}
      <ul class="combo__list" role="listbox" hidden>${curItem ? '<li role="option" class="combo__opt combo__opt--clear" data-v="">— Aucun —</li>' : ''}${sl ? '<li class="combo__hd" aria-hidden="true">Par ordre de dossard (start list FIS, manche 1)</li>' : ''}${items.map((x) => `<li role="option" class="combo__opt${x.dis ? ' is-off' : ''}${x.out ? ' combo__opt--out' : ''}${x.isCur ? ' is-cur' : ''}" data-v="${x.a.id}" data-l="${esc(norm(listName(x.a)))}" data-s="${esc(norm(x.a.name + ' ' + (x.a.fis || '') + ' ' + listName(x.a) + ' ' + (x.a.nat || '')))}"${x.dis ? ' aria-disabled="true"' : ''}>${esc(x.label)}</li>`).join('')}</ul>
    </div>`;
  }
  const comboClose = () => document.querySelectorAll('.combo__list').forEach((l) => { l.hidden = true; const i = l.parentElement.querySelector('.combo__in'); if (i) { i.setAttribute('aria-expanded', 'false'); i.value = i.dataset.cur; } });
  function comboFilter(box) {
    const q = norm(box.querySelector('.combo__in').value.trim());
    const list = box.querySelector('.combo__list');
    let n = 0;
    // les noms qui commencent par les lettres tapées passent devant
    const opts = [...list.querySelectorAll('.combo__opt:not(.combo__opt--clear)')];
    opts.forEach((li, k) => { if (li.dataset.k === undefined) li.dataset.k = k; });
    opts.sort((x, y) => ((q && y.dataset.l.startsWith(q) ? 1 : 0) - (q && x.dataset.l.startsWith(q) ? 1 : 0)) || x.dataset.k - y.dataset.k).forEach((li) => list.appendChild(li));
    const none0 = list.querySelector('.combo__none'); if (none0) list.appendChild(none0);
    list.querySelectorAll('.combo__opt').forEach((li) => {
      const ok = li.classList.contains('combo__opt--clear') || !q || li.dataset.s.includes(q);
      li.hidden = !ok; li.classList.remove('is-hl'); if (ok && !li.classList.contains('combo__opt--clear')) n++;
    });
    const first = [...list.querySelectorAll('.combo__opt:not([hidden]):not(.is-off):not(.combo__opt--clear)')][0];
    if (first && q) first.classList.add('is-hl');
    let none = list.querySelector('.combo__none');
    if (!n) { if (!none) { none = document.createElement('li'); none.className = 'combo__none'; none.textContent = 'Aucun skieur ne correspond. Utilise le lien « Skieur absent de la liste » ci-dessous.'; list.appendChild(none); } } else if (none) none.remove();
  }
  function comboOpen(box) {
    comboClose();
    const i = box.querySelector('.combo__in'), list = box.querySelector('.combo__list');
    i.value = ''; list.hidden = false; i.setAttribute('aria-expanded', 'true'); comboFilter(box);
    const cur = list.querySelector('.is-cur'); if (cur) cur.scrollIntoView({ block: 'center' });
  }
  function comboChoose(box, li) {
    if (!li || li.classList.contains('is-off')) return;
    const i = box.querySelector('.combo__in');
    box.querySelector('.combo__list').hidden = true;
    onPick({ dataset: { race: box.dataset.race, slot: box.dataset.slot }, value: li.dataset.v, id: i.id });
  }
  document.addEventListener('focusin', (e) => { const i = e.target.closest('.combo__in'); if (i) comboOpen(i.parentElement); });
  document.addEventListener('click', (e) => {
    const cx = e.target.closest('[data-cx]');
    if (cx) { const box = cx.closest('.combo'); comboClose(); onPick({ dataset: { race: box.dataset.race, slot: box.dataset.slot }, value: '', id: box.querySelector('.combo__in').id }); return; }
    const i = e.target.closest('.combo__in');
    if (i && i.parentElement.querySelector('.combo__list').hidden && !i.disabled) comboOpen(i.parentElement);
    if (!e.target.closest('.combo')) comboClose();
  });
  document.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.combo__opt');
    if (li) { e.preventDefault(); comboChoose(li.closest('.combo'), li); }
  });
  document.addEventListener('input', (e) => { const i = e.target.closest('.combo__in'); if (i) comboFilter(i.parentElement); });
  document.addEventListener('keydown', (e) => {
    const i = e.target.closest && e.target.closest('.combo__in'); if (!i) return;
    const box = i.parentElement, list = box.querySelector('.combo__list');
    const vis = () => [...list.querySelectorAll('.combo__opt:not([hidden]):not(.is-off)')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (list.hidden) { comboOpen(box); return; }
      const v = vis(), k = v.findIndex((x) => x.classList.contains('is-hl')), n = e.key === 'ArrowDown' ? Math.min(v.length - 1, k + 1) : Math.max(0, k - 1);
      v.forEach((x) => x.classList.remove('is-hl')); if (v[n]) { v[n].classList.add('is-hl'); v[n].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter') { e.preventDefault(); const h = list.querySelector('.is-hl'); if (h) comboChoose(box, h); }
    else if (e.key === 'Escape') { comboClose(); i.blur(); }
  });
  function pickEditor(race, session) {
    const label = `${placeLabel(race)}, ${genderLabel(race)}, ${discLabel(race)}`;
    const cur = myPicks()[race.id] || {};
    const face = cur.a ? avatarOf(cur.a) : `<span class="avatar avatar--empty" aria-hidden="true"></span>`;
    return `<div class="pickbox">
      ${face}
      <div class="pickbox__sel">
        <label class="sr" for="pa-${race.id}">Skieur, ${esc(label)}</label>
        ${combo(race, session, 'a')}
        <label class="sr" for="pb-${race.id}">Remplaçant, ${esc(label)}</label>
        <span class="pickhelp">${combo(race, session, 'b')}${info('Le remplaçant est facultatif. Il joue à la place du titulaire que si ce dernier ne prend pas le départ.')}</span>
        ${freeLink(race, 'auto')}
      </div>
    </div>`;
  }
  function pickSummary(playerId, race) {
    const p = (state.picks[playerId] || {})[race.id];
    if (!p || !p.a) return '<span class="none">Aucun choix</span>';
    const eff = G.effectiveAthlete(p, state.results, race.id);
    const swapped = p.b && eff === p.b;
    const drawn = p.d && eff === p.d;
    const text = drawn
      ? `<span class="who"><s class="who--out">${esc(nameOf(p.a))}</s>${p.b ? ` <s class="who--out">${esc(nameOf(p.b))}</s>` : ''} ${esc(nameOf(p.d))}</span><span class="sub">Tiré au sort</span>`
      : swapped
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
      <div class="race__date race__date--${race.gender}"><span class="race__wd">${F_WD.format(d).replace('.', '')}</span><span class="race__num">${F_NUM.format(d)}</span><span class="race__mo">${F_MO.format(d)}</span></div>
      <div class="race__info"><strong class="race__place">${fl(placeLabel(race))}</strong>
        <span class="race__tags"><span class="gender gender--${race.gender}">${genderLabel(race)}</span>${discBadge(race)}${flag}</span>
        ${race.cancelled ? '' : slLink(race)}</div>
      <div class="race__pick">${pick}</div>
      <div class="race__out">${outcome(race, state.me)}${race.cancelled || !lockedRace(race) ? '' : `<button type="button" class="linkbtn rcbtn" data-racecard="${race.id}">Détail et export</button>`}</div>
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
      <ul class="races">${races.filter(passF).map((r) => raceRow(r, session)).join('') || '<li class="race"><span class="none">Aucune course avec ces filtres.</span></li>'}</ul>
    </article>`;
  }

  /* ---------- Récap des joueurs ---------- */
  function recapTable(session) {
    const races = sortedRaces(session).filter(passF);
    const head = state.players.map((p) => `<th scope="col" class="${p.id === state.me ? 'me' : ''}">${pname(p)}</th>`).join('');
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
      return `<tr><th scope="row"><span class="rowhead__day">${dayOf(r.date)}</span> ${fl(placeLabel(r))}<br><span class="gender gender--${r.gender}">${genderLabel(r)}</span>${discBadge(r)}${r.cancelled || !lockedRace(r) ? '' : `<br><button type="button" class="linkbtn rcbtn" data-racecard="${r.id}">Détail et export</button>`}</th>${cells}</tr>`;
    }).join('');
    const totals = state.players.map((p) => `<td class="${p.id === state.me ? 'me' : ''}"><strong>${G.sessionScore(session, state.picks[p.id], state.results)} pts</strong></td>`).join('');
    return `<div class="tablewrap"><table class="grid grid--fx grid--fxrecap" style="--n:${state.players.length}">
      <caption>${fl(session.name)}</caption>
      <thead><tr><th scope="col">Course</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Total de la session</th>${totals}</tr></tfoot>
    </table></div>`;
  }
  /* ---------- Tendances : jauges indicatives, une fois la deadline passée ---------- */
  function trendsAny(key) { return scopeSessions(key).some((s) => sortedRaces(s).some((r) => !r.cancelled && lockedRace(r))); }
  function gauge(ath, pct, extra) {
    return `<li class="gauge"><span class="gauge__who">${avatarOf(ath, 'sm')}<span class="gauge__n">${esc(nameOf(ath))}${extra || ''}</span></span><span class="gauge__bar" role="img" aria-label="${pct} %"><i style="width:${Math.max(pct, 3)}%"></i></span><b class="gauge__v">${pct} %</b></li>`;
  }
  /** Part des joueurs ayant pris chaque skieur, sur un ensemble de courses verrouillées : { ath: part } triée, et le nombre de joueurs pris en compte. */
  function shareOf(races, perRace) {
    const hit = {}, who = new Set();
    state.players.forEach((p) => {
      const seen = new Set();
      races.forEach((r) => { const pk = (state.picks[p.id] || {})[r.id]; if (pk && pk.a) { seen.add(pk.a); who.add(p.id); } });
      seen.forEach((id) => { hit[id] = (hit[id] || 0) + 1; });
    });
    const n = who.size;
    return { n, list: Object.keys(hit).map((id) => ({ id, pct: Math.round(100 * hit[id] / n), k: hit[id] })).sort((x, y) => y.k - x.k || nameOf(x.id).localeCompare(nameOf(y.id), 'fr')) };
  }
  function trendsView(key, onlySession, topCum) {
    const sessions = scopeSessions(key);
    const live = sessions.flatMap((s) => sortedRaces(s)).filter((r) => !r.cancelled && lockedRace(r) && passF(r));
    if (!live.length) return '<p class="empty">Les tendances apparaissent à la deadline de la première session.</p>';
    const cum = shareOf(live).list.slice(0, topCum || 8);
    const g = (id) => (ATH[id] ? ` <span class="gender gender--${ATH[id].gender}">${ATH[id].gender === 'M' ? 'H' : 'F'}</span>` : '');
    let html = `<p class="hint">Indicatif et partiel : on ne montre que les skieurs les plus pris.</p>
      <div class="trend"><h3 class="subtitle">Les skieurs les plus pris depuis le début ${info(key === 0 ? 'Part des joueurs qui ont déjà choisi ce skieur sur les courses des Mondiaux dont la deadline est passée.' : 'Part des joueurs qui ont déjà choisi ce skieur au moins une fois dans ce desk, sur les sessions dont la deadline est passée. Mise à jour à chaque deadline.')}</h3>
      <ul class="gauges">${cum.map((x) => gauge(x.id, x.pct, g(x.id))).join('')}</ul></div>`;
    const pend = (onlySession ? [onlySession] : sessions).flatMap((s) => sortedRaces(s)).filter((r) => !r.cancelled && lockedRace(r) && !state.results[r.id]);
    if (pend.length) {
      html += `<div class="trend"><h3 class="subtitle">Sur les courses à venir de la session</h3>${pend.map((r) => {
        const top = shareOf([r]).list.slice(0, 3);
        return `<div class="trend__race"><p class="trend__t">${fl(placeLabel(r))} <span class="gender gender--${r.gender}">${genderLabel(r)}</span>${discBadge(r)} <span class="sub">${esc(dayOf(r.date))}</span></p><ul class="gauges">${top.map((x) => gauge(x.id, x.pct)).join('') || '<li class="none">Aucun choix</li>'}</ul></div>`;
      }).join('')}</div>`;
    }
    return html;
  }
  function recapView(key) {
    const sessions = scopeSessions(key);
    const done = sessions.filter(locked);
    const waiting = sessions.length - done.length;
    let html = done.length ? done.filter((s) => sortedRaces(s).some(passF)).map(recapTable).join('') || '<p class="empty">Aucune course avec ces filtres.</p>' : '<p class="empty">Rien à voir pour l’instant. Les choix de chacun apparaissent à la deadline de la session.</p>';
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
        if (r.cancelled || !passF(r)) return;
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
    const filters = `<div class="filters">
      <label class="sr" for="ath-q">Chercher un skieur</label>
      <input type="search" id="ath-q" class="search" placeholder="Chercher un skieur ou une nation" value="${esc(state.tq)}" autocomplete="off">
      <div class="seg seg--sm" role="group" aria-label="Filtrer les skieurs">${[['all', 'Tous'], ['taken', 'Déjà pris'], ['free', 'Encore libres']].map(([id, l]) =>
        `<button type="button" class="seg__btn" data-tf="${id}" aria-pressed="${state.tf === id}">${l}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="ath-major"${state.major ? ' checked' : ''}> Skieurs majeurs ${info('Coché : seuls les 30 premiers du classement 2025-26 (et tous les skieurs déjà choisis) sont affichés. Décoche pour voir tout le monde, puis fais défiler le tableau vers la droite.')}</label>
    </div>`;
    return filters + ['M', 'W'].map((g) => {
      const list = LIST[g];
      const taken = list.filter((a) => takes[a.id]).length;
      const attrs = (a) => `data-a="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.fis || '') + ' ' + (a.nat || '')))}" data-taken="${takes[a.id] ? 1 : 0}" data-major="${(a.rank && a.rank <= 30) || takes[a.id] ? 1 : 0}"`;
      const head = list.map((a) => `<th scope="col" class="sk ${takes[a.id] ? 'is-taken' : 'is-free'}" ${attrs(a)}>${avatar(ATH[a.id], !!takes[a.id])}<span class="sk__n">${esc(listName(a))}</span><em class="sub">${esc(a.nat || (a.pending ? 'à régulariser' : ''))}</em></th>`).join('');
      const rows = state.players.map((p) => {
        const cells = list.map((a) => {
          const l = takes[a.id] && takes[a.id][p.id];
          const inner = l ? l.map((x) => `<span class="mark" title="${esc(x.tag)}"><span class="mark__l">${esc(x.tag)}</span>${x.sc === null ? '' : `<b class="mark__p ${x.sc > 0 ? 'on' : 'off'}">${x.sc > 0 ? '+' : ''}${x.sc}</b>`}</span>`).join('') : '';
          return `<td ${attrs(a)}>${inner}</td>`;
        }).join('');
        return `<tr class="${p.id === state.me ? 'me' : ''}"><th scope="row"><strong>${esc(p.name)}</strong><span class="sub">${totals[g][p.id] || 0} pts rapportés</span></th>${cells}</tr>`;
      }).join('');
      return `<div class="tablewrap tablewrap--scroll"><table class="grid grid--tk">
        <caption>${g === 'M' ? 'Messieurs' : 'Dames'}, ${taken} sur ${list.length} déjà pris</caption>
        <thead><tr><th scope="col" class="tk__corner">Joueur</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
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
    const tabs = [['mine', 'Mon desk'], ['recap', 'Récap des joueurs'], ['taken', 'Athlètes pris']].concat(trendsAny(key) ? [['trend', 'Tendances']] : []).map(([id, label]) =>
      `<button type="button" role="tab" class="seg__btn" aria-selected="${sub === id}" data-sub="${id}" data-key="${key}">${label}</button>`).join('');
    let body;
    if (sub === 'mine') {
      const hasF = (s) => sortedRaces(s).some(passF);
      body = (isW ? worldsBox() : '') + (sessions.some(hasF) ? sessions.map((s, i) => hasF(s) ? sessionCard(s, isW ? '' : `session ${i + 1} sur ${sessions.length}`) : '').join('') : '<p class="empty">Aucune course avec ces filtres.</p>')
        + '<p class="hint">Heures de départ provisoires.</p>';
    } else if (sub === 'recap') body = (isW ? worldsBox() : '') + recapView(key);
    else if (sub === 'trend' && trendsAny(key)) body = trendsView(key);
    else body = takenView(key);
    return `<section>
      <header class="deskhead">
        <div><h2>${esc(title)}</h2><p class="deskhead__meta">${esc(meta)}</p>
          <p class="rule">${isW ? 'Barème ×3. Un skieur ne peut être choisi qu’une fois.' : 'Un skieur ne peut être choisi qu’une fois dans ce desk.'} ${info(isW ? 'Aux Mondiaux, les points sont multipliés par 3 et un skieur ne peut servir qu’une fois sur l’ensemble des 8 épreuves. Messieurs et dames comptent à part.' : 'Dans un même desk, un skieur ne peut être choisi qu’une seule fois chez les messieurs et une seule fois chez les dames. Un skieur déjà pris apparaît grisé.')}</p></div>
        <dl class="deskhead__stats"><div><dt>Choix faits ${info('Nombre de courses de ce desk pour lesquelles tu as déjà choisi un skieur.')}</dt><dd>${chosen}/${total}</dd></div><div><dt>Points ${info('Total de tes points sur ce desk, d’après les résultats déjà saisis.')}</dt><dd>${score}</dd></div></dl>
      </header>
      <div class="deskbar"><div class="seg" role="tablist" aria-label="Vue du desk">${tabs}</div>${filterBar()}</div>
      <div class="deskbody">${body}</div>
    </section>`;
  }

  /* ---------- Filtres du desk : disciplines (vitesse → technique) et genre ---------- */
  function filterBar() {
    const chip = (kind, v, label, cls) => `<button type="button" class="ffc ${cls}" data-ff="${kind}:${v}" aria-pressed="${state.ff[kind].includes(v)}">${label}</button>`;
    const any = state.ff.disc.length || state.ff.gender.length;
    return `<div class="ff" role="group" aria-label="Filtrer les courses">
      <span class="ff__g">${['DH', 'SG', 'GS', 'SL'].map((d) => chip('disc', d, D.DISC[d].short, 'ffc--' + d)).join('')}</span>
      <span class="ff__g">${chip('gender', 'W', 'F', 'ffc--W')}${chip('gender', 'M', 'H', 'ffc--M')}</span>
      ${any ? '<button type="button" class="ff__x" data-ff="clear">Tout afficher</button>' : ''}</div>`;
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
        <span class="mini__what"><strong class="mini__place">${fl(placeLabel(r))}</strong><span class="mini__tags"><span class="gender gender--${r.gender}">${genderLabel(r)}</span>${discBadge(r)}</span></span>
        <span class="mini__pick">${r.cancelled ? '<span class="none">Annulée</span>' : (myPicks()[r.id] || {}).a ? pickSummary(state.me, r) : '<span class="todo">À choisir</span>'}${r.cancelled ? '' : slLink(r)}</span></li>`;
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
      ${open ? '' : `<h3 class="subtitle">Tendances</h3>${trendsView(up.id === 'X' ? 0 : up.desk, up, 5)}<h3 class="subtitle">Choix de tous les joueurs</h3>${recapTable(up)}`}
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
      <tbody>${rows.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num"><span class="rnk rnk--${r.rank <= 3 ? r.rank : 'n'}">${r.rank}</span></td><th scope="row">${pname(r.p)}</th><td class="num">${r.v.total}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function generalPanel() {
    const R = state.results;
    const rows = rankRows((pk) => G.generalScore(pk, R));
    const main = `<div class="tablewrap"><table class="grid grid--rank grid--general cap--gen"><caption>Le gros globe ${info('Classement général : somme des points des trois desks et des Mondiaux, bonus compris.')}</caption>
      <thead><tr><th scope="col" class="num">Rang</th><th scope="col">Joueur</th><th scope="col" class="num th--d1">Desk 1</th><th scope="col" class="num th--d2">Desk 2</th><th scope="col" class="num th--d3">Desk 3</th><th scope="col" class="num th--w">Mondiaux</th><th scope="col" class="num">Total</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num"><span class="rnk rnk--${r.rank <= 3 ? r.rank : 'n'}">${r.rank}</span></td><th scope="row">${pname(r.p)}</th>${r.v.desks.map((d) => `<td class="num">${d}</td>`).join('')}<td class="num">${r.v.worlds}</td><td class="num total">${r.v.total}</td></tr>`).join('')}</tbody></table></div>`;
    const desks = D.DESKS.map((d) => smallRanking(`Classement du ${d.name}`, (pk) => G.deskScore(d.id, pk, R), 'cap--d' + d.id)).join('');
    const discs = ['DH', 'SG', 'GS', 'SL'].map((c) => smallRanking(`Petit globe de ${c === 'SG' ? 'super-G' : D.DISC[c].fr.toLowerCase()}`, (pk) => G.disciplineScore(c, pk, R), 'cap--' + c)).join('');
    const none = Object.keys(R).length === 0 ? '<p class="hint">Aucun résultat pour l’instant.</p>' : '';
    return `<section class="genpanel"><header class="deskhead"><div><h2>Classements</h2>
      <p class="deskhead__meta">Général : trois desks et les Mondiaux, bonus compris</p></div></header>${none}${main}
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
      { id: 'gen', label: 'Classements', note: '' },
    ];
  }
  const TAB_IDS = ['next', '1', '2', 'w', '3', 'gen', 'adm'];
  /** Pictos des onglets (affichés sur mobile à la place des libellés longs). */
  const TAB_ICO = {
    next: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/>',
    1: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.6" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor" stroke="none">1</text>',
    2: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.6" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor" stroke="none">2</text>',
    3: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.6" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor" stroke="none">3</text>',
    w: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c3.2 3 3.2 14 0 17c-3.2-3-3.2-14 0-17z"/>',
    gen: '<path d="M3 20.5h18"/><rect x="9" y="7.5" width="6" height="13"/><rect x="3" y="13" width="6" height="7.5"/><rect x="15" y="15.5" width="6" height="5"/>',
  };
  const TAB_SHORT = { next: 'À venir', 1: 'Desk 1', 2: 'Desk 2', w: 'Mondiaux', 3: 'Desk 3', gen: 'Général' };
  function renderTabs() {
    $('#tabs').innerHTML = tabs().map((t) => {
      const short = t.id === 'next' && /en cours/.test(t.label) ? 'En cours' : TAB_SHORT[t.id];
      return `<button type="button" role="tab" class="plate plate--${t.id}" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${state.tab === t.id}" aria-label="${esc(t.label + (t.note ? ', ' + t.note : ''))}">
      <svg class="plate__ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TAB_ICO[t.id]}</svg><span class="plate__short">${short}</span>
      <span class="plate__label">${t.label}</span>${t.note ? `<span class="plate__note">${t.note}</span>` : ''}</button>`;
    }).join('');
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
  const slLink = (race) => (startListOf(race) ? `<button type="button" class="linkbtn slbtn" data-startlist="${race.id}">Consulter la start list</button>` : '');
  /** Fenêtre « start list » : dossards, noms et nations lus sur la page FIS. On peut y choisir son skieur (et son remplaçant) tant que la session est ouverte ;
      le choix déjà fait est mis en évidence et peut être retiré puis changé. */
  function startListModal(raceId, keep) {
    const race = G.raceOf(raceId), sl = race && startListOf(race);
    if (!sl) return;
    const session = sessionOf(race);
    const canPick = !race.cancelled && !lockedRace(race) && !!state.me;
    const picks = myPicks()[race.id] || {};
    const used = canPick ? G.usedInDesk(session.desk, race.gender, myPicks(), race.id, state.results) : new Set();
    const out = sl.rows.filter((r) => !r.ath);
    const when = sl.fetched ? `${F_DAY.format(new Date(sl.fetched))}, ${F_HOUR.format(new Date(sl.fetched))}` : '';
    const rowOf = (id) => sl.rows.find((r) => r.ath === id);
    const mine = (slot, label) => {
      const r = picks[slot] && rowOf(picks[slot]);
      const nm = picks[slot] ? (r ? `${r.bib} · ${esc(r.name)}` : esc(nameOf(picks[slot]))) : '';
      return picks[slot] ? `<div class="slmine"><span class="slmine__l">${label}</span><strong>${nm}</strong>${canPick ? `<button type="button" class="linkbtn" data-slclear="${race.id}|${slot}">Retirer</button>` : ''}</div>` : '';
    };
    const box = (picks.a || picks.b) ? `<div class="slmine__box">${mine('a', 'Ton choix')}${mine('b', 'Ton remplaçant')}</div>`
      : canPick ? '<p class="hint">Tu n’as pas encore choisi : touche « Choisir » en face d’un skieur.</p>' : '';
    const act = (r) => {
      if (!r.ath) return '<span class="sl__tag">pas dans la liste du jeu</span>';
      if (picks.a === r.ath) return `<span class="sl__me">Ton choix</span>${canPick ? `<button type="button" class="sl__btn sl__btn--off" data-slclear="${race.id}|a">Retirer</button>` : ''}`;
      if (picks.b === r.ath) return `<span class="sl__me">Remplaçant</span>${canPick ? `<button type="button" class="sl__btn sl__btn--off" data-slclear="${race.id}|b">Retirer</button>` : ''}`;
      if (!canPick) return '';
      if (used.has(r.ath)) return '<span class="sl__tag sl__tag--used">déjà pris</span>';
      if (!picks.a) return `<button type="button" class="sl__btn" data-slpick="${race.id}|a|${r.ath}">Choisir</button>`;
      if (!picks.b) return `<button type="button" class="sl__btn sl__btn--sub" data-slpick="${race.id}|b|${r.ath}">Remplaçant</button>`;
      return '';
    };
    const rows = sl.rows.map((r) => `<li class="sl__row${r.ath ? '' : ' is-out'}${r.ath && (picks.a === r.ath || picks.b === r.ath) ? ' is-mine' : ''}${r.ath && canPick && used.has(r.ath) && picks.a !== r.ath && picks.b !== r.ath ? ' is-used' : ''}"><b class="sl__bib">${r.bib}</b>${r.ath ? avatarOf(r.ath, 'sm') : '<span class="avatar avatar--empty avatar--sm" aria-hidden="true"></span>'}<span class="sl__n">${esc(r.name)}<em class="sub">${esc(r.nat)}</em></span><span class="sl__act">${act(r)}</span></li>`).join('');
    const mo = $('#modal'), prevM = keep && !mo.hidden ? mo.scrollTop : 0, prevL = keep && $('.sl') ? $('.sl').scrollTop : 0;
    openModal(`<h2 class="rc__title">Start list</h2>
      <p class="hint">${esc(placeLabel(race))}, ${esc(genderLabel(race))}, ${esc(discLabel(race))} · manche 1 · ${sl.rows.length} partants<br>Source : page FIS « Start List »${when ? `, relevée le ${esc(when)}` : ''}. Elle peut encore évoluer avant le départ.${canPick ? '' : lockedRace(race) ? ' Les choix sont verrouillés.' : ''}</p>
      ${box}
      ${out.length ? `<p class="hint"><strong>${out.length} ${race.gender === 'W' ? 'skieuses' : 'skieurs'} ne sont pas dans la liste du jeu</strong> : ${esc(out.map((r) => r.name).join(', '))}.</p>` : ''}
      <ol class="sl">${rows}</ol>`);
    const list = $('.sl');
    if (keep) { mo.scrollTop = prevM; if (list) list.scrollTop = prevL; }
    else { const me = $('.sl__row.is-mine'); if (me && list) list.scrollTop = Math.max(0, me.offsetTop - list.offsetTop - 60); }
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
      <form id="remind-form" data-sid="${session.id}"><div class="remindopts">${REMIND.slice().sort((a, b) => remindAt(dl, a[0]) - remindAt(dl, b[0])).map(([k, l]) => `<label><input type="radio" name="rk" value="${k}"${k === cur ? ' checked' : ''}> ${l} <span class="sub">${esc(dlShort(remindAt(dl, k)))}</span></label>`).join('')}</div>
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
    const ma = $('#mastact'); if (ma) { ma.hidden = !state.user && !state.demo; ma.innerHTML = '<span class="mast-actions__row"><button type="button" class="mastbtn" data-rules>Règles du jeu</button><button type="button" class="mastbtn" data-ideas>Boîte à idées</button></span>' + (isAdmin() ? `<button type="button" class="mastbtn mastbtn--admin" data-tab="adm" aria-pressed="${state.tab === 'adm'}">Admin${newPlayers().length ? ` · 🔔 ${newPlayers().length}` : ''}</button>` : ''); }
    el.hidden = !state.user || (state.demo && !state.user);
    if (!el.hidden) el.innerHTML = accountBar();
  }
  /* ---------- Ambiance (Sapin, Glace, Nuit), mémorisée dans le navigateur ---------- */
  const THEME_COLOR = { sapin: '#163629', glace: '#a8cfe4', nuit: '#0b1322' };
  function setTheme(t, save) {
    if (!THEME_COLOR[t]) t = 'sapin';
    if (t === 'sapin') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEME_COLOR[t]);
    if (save) { try { localStorage.setItem('skigame.theme', t); } catch (e) { /* ignoré */ } }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-theme-set]'); if (b) setTheme(b.dataset.themeSet, true); });
  (function () { let t = 'sapin'; try { t = localStorage.getItem('skigame.theme') || 'sapin'; } catch (e) { /* ignoré */ } setTheme(t, false); })();

  /* ---------- Photo de profil ---------- */
  const playerOf = (id) => state.players.find((p) => p.id === id) || { id, name: '', photo: '' };
  function pav(p, size) {
    const init = esc((p.name || '?').trim()[0] ? (p.name || '?').trim()[0].toUpperCase() : '?');
    return `<span class="pav pav--${size || 'sm'}" aria-hidden="true">${p.photo ? `<img src="${p.photo}" alt="">` : `<span>${init}</span>`}</span>`;
  }
  const pname = (p) => `<span class="pn">${pav(p, 'xs')}<span>${esc(p.name)}</span></span>`;
  const PH = { img: null, zoom: 1, x: 0, y: 0 };
  function photoModal() {
    const me = playerOf(state.me);
    if (me.blocked) { openModal('<h3>Photo de profil</h3><p>L’organisateur a retiré ta photo : tu ne peux pas en envoyer une nouvelle pour l’instant. Si c’est une erreur, écris-lui.</p>'); return; }
    PH.img = null; PH.zoom = 1; PH.x = 0; PH.y = 0;
    openModal(`<h3>Photo de profil</h3><p class="hint">Visible par tous les joueurs. Une image carrée de 160 px est enregistrée : choisis une photo, cadre-la, valide.</p>
      <div class="phs"><canvas id="ph-cv" class="phs__cv" width="240" height="240" aria-label="Aperçu de la photo"></canvas>
      <div class="phs__ctl"><input type="file" id="ph-file" accept="image/*"><label class="phs__z">Zoom <input type="range" id="ph-zoom" min="1" max="3" step="0.02" value="1" disabled></label><p class="hint">Fais glisser l’image pour la recentrer.</p></div></div>
      <div class="rc__act"><button type="button" class="btn" id="ph-save" disabled>Enregistrer</button>${me.photo ? '<button type="button" class="btn btn--ghost" id="ph-del">Retirer ma photo</button>' : ''}</div><p class="auth__err" id="ph-msg" role="status"></p>`);
    phDraw();
  }
  function phDraw() {
    const cv = $('#ph-cv'); if (!cv) return; const g = cv.getContext('2d'), S = cv.width;
    g.fillStyle = '#e4e1d3'; g.fillRect(0, 0, S, S);
    if (PH.img) {
      const im = PH.img, base = S / Math.min(im.width, im.height), k = base * PH.zoom, w = im.width * k, h = im.height * k;
      PH.x = Math.max(-(w - S) / 2, Math.min((w - S) / 2, PH.x)); PH.y = Math.max(-(h - S) / 2, Math.min((h - S) / 2, PH.y));
      g.drawImage(im, (S - w) / 2 + PH.x, (S - h) / 2 + PH.y, w, h);
    } else { g.fillStyle = '#675e51'; g.font = '600 18px sans-serif'; g.textAlign = 'center'; g.fillText('Aucune image', S / 2, S / 2); }
  }
  function phExport() {
    const src = $('#ph-cv'), out = document.createElement('canvas'); out.width = out.height = 160;
    out.getContext('2d').drawImage(src, 0, 0, 160, 160);
    let q = 0.85, d = out.toDataURL('image/jpeg', q);
    while (d.length > 26000 && q > 0.4) { q -= 0.1; d = out.toDataURL('image/jpeg', q); }
    return d;
  }
  document.addEventListener('change', (e) => {
    if (e.target.id === 'ph-file') {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) { $('#ph-msg').textContent = 'Ce fichier n’est pas une image.'; return; }
      const im = new Image(), url = URL.createObjectURL(f);
      im.onload = () => { PH.img = im; PH.zoom = 1; PH.x = PH.y = 0; $('#ph-zoom').disabled = false; $('#ph-zoom').value = 1; $('#ph-save').disabled = false; $('#ph-msg').textContent = ''; phDraw(); URL.revokeObjectURL(url); };
      im.onerror = () => { $('#ph-msg').textContent = 'Image illisible : essaie un JPEG ou un PNG.'; };
      im.src = url;
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'ph-zoom') { PH.zoom = +e.target.value; phDraw(); } });
  (function () {
    let drag = null;
    document.addEventListener('pointerdown', (e) => { if (e.target.id === 'ph-cv' && PH.img) { drag = { x: e.clientX, y: e.clientY, px: PH.x, py: PH.y, k: 240 / e.target.getBoundingClientRect().width }; e.target.setPointerCapture(e.pointerId); } });
    document.addEventListener('pointermove', (e) => { if (drag) { PH.x = drag.px + (e.clientX - drag.x) * drag.k; PH.y = drag.py + (e.clientY - drag.y) * drag.k; phDraw(); } });
    document.addEventListener('pointerup', () => { drag = null; });
  })();
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-photo]')) { photoModal(); return; }
    if (e.target.id === 'ph-save' && PH.img) {
      e.target.disabled = true; $('#ph-msg').textContent = 'Enregistrement…';
      try { await store.setPlayerPhoto(state.me, phExport()); closeModal(); } catch (err) { $('#ph-msg').textContent = 'Échec de l’enregistrement : ' + (err.message || err); e.target.disabled = false; }
    }
    if (e.target.id === 'ph-del') { try { await store.setPlayerPhoto(state.me, ''); closeModal(); } catch (err) { $('#ph-msg').textContent = 'Échec : ' + (err.message || err); } }
  });

  /* ---------- Mon compte et tableau de bord ---------- */
  function globeSvg(kind) {
    const id = 'g' + kind + Math.random().toString(36).slice(2, 6);
    const [c1, c2, c3] = kind === 'big' ? ['#fff6d6', '#f1d78a', '#c8962e'] : ['#ffffff', '#d4e6ef', '#8faec0'];
    return `<svg class="globe globe--${kind}" viewBox="0 0 48 56" aria-hidden="true" focusable="false"><defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></radialGradient></defs>
      <rect x="12" y="45" width="24" height="7" rx="2" fill="#1b2b44"/><rect x="17" y="40" width="14" height="6" fill="#2b3f5f"/>
      <circle cx="24" cy="22" r="19" fill="url(#${id})" stroke="#1b2b44" stroke-width="1.6"/><path d="M12 14c4-6 10-8 15-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/></svg>`;
  }
  function myRanks() {
    const R = state.results, n = state.players.length;
    if (!Object.keys(R).length || !n) return null;
    const rankOf = (fn) => { const r = rankRows((pk) => ({ total: fn(pk) })).find((x) => x.p.id === state.me); return r ? { rank: r.rank, pts: r.v.total } : null; };
    return { n, gen: rankOf((pk) => G.generalScore(pk, R).total), discs: ['DH', 'SG', 'GS', 'SL'].map((c) => Object.assign({ c }, rankOf((pk) => G.disciplineScore(c, pk, R)))) };
  }
  function accountBar() {
    const name = state.user.name || '';
    const rk = myRanks();
    const nth = (r) => (r ? `${ordinal(r.rank)}` : '–');
    const DN = { DH: 'Descente', SG: 'Super-G', GS: 'Géant', SL: 'Slalom' };
    const board = `<div class="acct__board">
      <button type="button" class="gl gl--big" data-tab="gen" title="Voir les classements">${globeSvg('big')}<span class="gl__t"><b>${rk ? nth(rk.gen) : '–'}</b><span>Gros globe</span><em>${rk && rk.gen ? rk.gen.pts + ' pts' : 'pas encore de course'}</em></span></button>
      <div class="gl-row">${['DH', 'SG', 'GS', 'SL'].map((c, i) => `<button type="button" class="gl gl--sm" data-tab="gen" title="Petit globe de ${DN[c].toLowerCase()}">${globeSvg('sm')}<span class="gl__t"><b>${rk ? nth(rk.discs[i]) : '–'}</b><span>${DN[c]}</span></span></button>`).join('')}</div>
    </div>`;
    const me0 = playerOf(state.me), me0Btn = state.demo ? '' : `<button type="button" class="linkbtn" data-photo>${me0.photo ? 'Changer ma photo' : 'Ajouter ma photo'}</button>`;
    const links = state.demo ? '' : `<span class="acct__links"><button type="button" class="linkbtn" data-auth="rename">Changer mon nom</button><button type="button" class="linkbtn" data-auth="out">Me déconnecter</button></span>`;
    const me = playerOf(state.me);
    const sum = rk && rk.gen ? `<span class="acct__sum">${nth(rk.gen)} au général · ${rk.gen.pts} pts</span>` : '';
    const tog = `<button type="button" class="acct__tog" data-acct-toggle aria-expanded="${state.acctOpen}" aria-label="${state.acctOpen ? 'Replier Mon compte' : 'Déployer Mon compte'}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`;
    return `<div class="acct${state.acctOpen ? ' acct--open' : ''}"><div class="acct__who"><span class="acct__avw"><button type="button" class="acct__avb" data-photo aria-label="${me.photo ? 'Changer ma photo' : 'Ajouter ma photo'}" ${state.demo ? 'disabled' : ''}>${pav(Object.assign({}, me, { name }), 'lg')}</button>${state.demo ? '' : `<button type="button" class="acct__cam" data-photo title="${me.blocked ? 'Photo retirée par l’organisateur' : me.photo ? 'Changer ma photo' : 'Ajouter ma photo'}" aria-label="${me.photo ? 'Changer ma photo' : 'Ajouter ma photo'}"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 8h3l1.6-2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>`}</span>
      <div class="acct__id"><span class="acct__hi">Mon compte</span><strong class="acct__name">${esc(name)}</strong>${sum}${links}</div>${tog}</div>${board}</div>`;
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
    document.querySelectorAll('.grid--tk thead th[data-a]').forEach((th) => {
      const ok = (!q || th.dataset.name.includes(q)) && (state.tf === 'all' || (state.tf === 'taken') === (th.dataset.taken === '1')) && (!state.major || th.dataset.major === '1');
      const table = th.closest('table');
      table.querySelectorAll(`[data-a="${th.dataset.a}"]`).forEach((c) => { c.hidden = !ok; });
    });
    document.querySelectorAll('[data-tf]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === state.tf)));
  }
  function render() {
    $('#tabs').closest('nav').hidden = !state.user && !state.demo;
    renderTabs(); renderUserbar(); renderPanel(); syncSim();
    setTimeout(gateCheck, 400);
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
    const slot = sel.dataset.slot === 'auto' ? (cur.a ? 'b' : 'a') : sel.dataset.slot;
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
    if (again && again.tagName === 'SELECT') again.focus({ preventScroll: true });
    if (!state.demo) store.setPick(state.me, race.id, out).catch(fail);
  }

  document.addEventListener('click', (e) => {
    const rc = e.target.closest('[data-racecard]');
    if (rc) { SHARE.open(rc.dataset.racecard); return; }
    if (e.target.closest('[data-acct-toggle]')) { state.acctOpen = !state.acctOpen; renderUserbar(); return; }
    const slp = e.target.closest('[data-slpick]');
    if (slp) { const [rid, slot, ath] = slp.dataset.slpick.split('|'); onPick({ dataset: { race: rid, slot }, value: ath, id: 'sl' }).then(() => startListModal(rid, true)); return; }
    const slc = e.target.closest('[data-slclear]');
    if (slc) { const [rid, slot] = slc.dataset.slclear.split('|'); onPick({ dataset: { race: rid, slot }, value: '', id: 'sl' }).then(() => startListModal(rid, true)); return; }
    const slb = e.target.closest('[data-startlist]');
    if (slb) { startListModal(slb.dataset.startlist); return; }
    const rcc = e.target.closest('[data-rc-copy]'); if (rcc) { SHARE.copy(rcc.dataset.rcCopy); return; }
    const rcj = e.target.closest('[data-rc-jpg]'); if (rcj) { SHARE.jpg(rcj.dataset.rcJpg); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { setTab(tab.dataset.tab); return; }
    const go = e.target.closest('[data-goto]');
    if (go) { setTab(go.dataset.goto === '0' ? 'w' : go.dataset.goto); return; }
    const tf = e.target.closest('[data-tf]');
    if (tf) { state.tf = tf.dataset.tf; applyTakenFilter(); return; }
    const ffb = e.target.closest('[data-ff]');
    if (ffb) {
      const v = ffb.dataset.ff;
      if (v === 'clear') state.ff = { disc: [], gender: [] };
      else { const [k, x] = v.split(':'); const a = state.ff[k]; state.ff[k] = a.includes(x) ? a.filter((y) => y !== x) : a.concat(x); }
      renderPanel(); return;
    }
    const sub = e.target.closest('[data-sub]');
    if (sub) { state.sub[Number(sub.dataset.key)] = sub.dataset.sub; renderPanel(); return; }
    const fr = e.target.closest('[data-free]');
    if (fr) { onPick({ dataset: { race: fr.dataset.free, slot: fr.dataset.slot }, value: '__free__', id: `pa-${fr.dataset.free}` }); return; }
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
    if (e.target.id === 'ath-major') { state.major = e.target.checked; applyTakenFilter(); }
  });

  // Une photo absente (fichier non fourni) est retirée : il reste les initiales.
  document.addEventListener('error', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('avatar__img')) e.target.remove();
  }, true);

  function loadDemo() {
    state.demo = true;
    rebuildAthletes();
    state.user = { uid: DEMO.ME, email: '', name: 'Alexandre' };
    state.me = DEMO.ME;
    G.setOverrides({});
    state.players = DEMO.PLAYERS.slice();
    state.picks = JSON.parse(JSON.stringify(DEMO.PICKS));
    state.results = JSON.parse(JSON.stringify(DEMO.RESULTS));
    state.sim = new Date(DEMO.DEMO_NOW);
    render();
  }


  /* ---------- « Au portillon » : mode deadline imminente ----------
     La veille de la deadline d'une session, à partir de 21 h, une fenêtre rappelle les choix qu'il reste à faire.
     Préférences enregistrées dans ce navigateur : { off: true } (plus jamais), { skip: { session: true } }, { until: { session: ms } } (reporté). */
  const GATE_KEY = 'skigame.gate';
  const gateGet = () => { try { return JSON.parse(localStorage.getItem(GATE_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const gateSet = (o) => { try { localStorage.setItem(GATE_KEY, JSON.stringify(o)); } catch (e) { /* ignoré */ } };
  function gateStart(dl) {
    const [y, m, d] = FMT_YMD.format(dl).split('-').map(Number);
    return G.parisInstant(new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10), '21:00');
  }
  /** Session à rappeler maintenant (ouverte, fenêtre commencée, choix manquants, pas reportée), sinon null. */
  function gatePending() {
    if (!state.user && !state.demo) return null;
    if (!state.demo && !state.picksReady) return null;
    const g = gateGet(); if (g.off) return null;
    const t = now().getTime();
    for (const s of allSessions()) {
      if (G.sessionState(s, now()) !== 'ouverte') continue;
      const dl = G.sessionDeadline(s);
      if (t < gateStart(dl).getTime()) continue;
      if ((g.skip || {})[s.id] || ((g.until || {})[s.id] || 0) > t) continue;
      const todo = active(sortedRaces(s)).filter((r) => !lockedRace(r) && !(myPicks()[r.id] || {}).a);
      if (todo.length) return { session: s, dl, todo };
    }
    return null;
  }
  const leftText = (ms) => { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}\u00a0h${m % 60 ? '\u00a0' + String(m % 60).padStart(2, '0') : ''}` : `${m}\u00a0min`; };
  /** Prochain 7 h 30 (heure de Paris). */
  function wakeUp() {
    const today = FMT_YMD.format(now()), c = G.parisInstant(today, '07:30');
    if (c > now()) return c;
    const [y, m, d] = today.split('-').map(Number);
    return G.parisInstant(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), '07:30');
  }
  function gateCheck() {
    const m = $('#modal'); if (!m || !m.hidden) return;
    const g = gatePending(); if (!g) return;
    const { session, dl, todo } = g, sid = session.id;
    const left = dl - now();
    const opts = [['1 h', 60 * 60e3], ['2 h', 2 * 60 * 60e3], ['demain au réveil', wakeUp() - now()]].filter(([, ms]) => ms > 60e3 && ms < left - 20 * 60e3);
    // fermer la fenêtre sans choisir = rappel dans 30 min
    const cur = gateGet(); cur.until = Object.assign({}, cur.until, { [sid]: now().getTime() + 30 * 60e3 }); gateSet(cur);
    const list = todo.map((r) => `<li class="gate__race"><span class="gate__when">${esc(dayOf(r.date))}</span><span class="gate__what"><strong>${fl(placeLabel(r))}</strong> <span class="gender gender--${r.gender}">${genderLabel(r)}</span>${discBadge(r)}</span></li>`).join('');
    openModal(`<div class="gate"><p class="gate__kicker">Au portillon</p>
      <h2 class="gate__title">${todo.length > 1 ? `${todo.length} choix t’attendent` : 'Un choix t’attend'}</h2>
      <p class="gate__lead">Deadline <strong>${esc(dlShort(dl))}</strong>, dans ${esc(leftText(left))}. Ensuite, les choix sont verrouillés.</p>
      <ul class="gate__list">${list}</ul>
      <button type="button" class="btn btn--brique gate__go" data-gate-go="${sid}">Je choisis maintenant</button>
      ${opts.length ? `<div class="gate__snooze"><span>Me le rappeler dans</span>${opts.map(([l, ms]) => `<button type="button" class="gate__chip" data-gate-snooze="${sid}|${Math.round(ms)}">${l}</button>`).join('')}</div>` : ''}
      <div class="gate__quiet"><button type="button" class="linkbtn" data-gate-skip="${sid}">Ne plus me le rappeler pour cette session</button><button type="button" class="linkbtn" data-gate-off>Ne plus jamais afficher ce rappel</button></div>
      <p class="hint gate__hint">Je gère seul·e : tu pourras le réactiver dans Mes réglages.</p></div>`);
  }
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-gate-go]');
    if (go) {
      const s = allSessions().find((x) => String(x.id) === go.dataset.gateGo); closeModal(); if (!s) return;
      setTab(s.id === 'X' || s === D.WORLDS ? 'w' : String(s.desk));
      setTimeout(() => { const c = document.getElementById('s-' + s.id); if (c) c.scrollIntoView({ block: 'start' }); }, 60);
      return;
    }
    const sn = e.target.closest('[data-gate-snooze]');
    if (sn) { const [sid, ms] = sn.dataset.gateSnooze.split('|'); const g = gateGet(); g.until = Object.assign({}, g.until, { [sid]: now().getTime() + Number(ms) }); gateSet(g); closeModal(); return; }
    const sk = e.target.closest('[data-gate-skip]');
    if (sk) { const g = gateGet(); g.skip = Object.assign({}, g.skip, { [sk.dataset.gateSkip]: true }); gateSet(g); closeModal(); return; }
    if (e.target.closest('[data-gate-off]')) { const g = gateGet(); g.off = true; gateSet(g); closeModal(); }
  });

  setInterval(() => {
    const c = $('#countdown');
    if (c) c.innerHTML = countdownText(new Date(c.dataset.dl));
    gateCheck();
  }, 30000);

  /* ---------- Démarrage ---------- */
  SHARE.init({ state, G, D, esc, nameOf, avatarOf, placeLabel, genderLabel, discLabel, dayOf, lockedRace, ordinal, openModal });
  const adminCtx = () => ({ state, G, D, store, LIST, ATH, esc, norm, at, F_DAY, hourText, dlShort, shortOf, placeLabel, discLabel, genderLabel, nameOf, avatarOf, sortedRaces, lockedRace, active, canon, newPlayers, markPlayersSeen, rerender: render, fail, isAdmin });
  const q = new URLSearchParams(location.search);
  const h = location.hash.replace('#', '');
  if (TAB_IDS.includes(h)) state.tab = h;
  if (q.has('demo')) loadDemo();
  else {
    rebuildAthletes(); startStore();
    fetch('data/results.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.races) { state.file = j; recompute(); } }).catch(() => {});
    fetch('data/extra-athletes.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { state.addl = { M: j.M || [], W: j.W || [] }; recompute(); } }).catch(() => {});
    fetch('data/startlists.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.races) { state.startlists = j; scheduleRender(); } }).catch(() => {});
  }
  render();
  window.SKI_APP = { state, render, store };
})();
