/* Ski game – interface */
(function () {
  'use strict';
  const D = window.SKI_DATA, G = window.SKI_GAME, SHARE = window.SKI_SHARE, DEMO = window.SKI_DEMO, BASE = window.SKI_ATHLETES, CONFIG = window.SKI_CONFIG || {};
  const TZ = 'Europe/Paris';
  const PHOTO_DIR = 'img/athletes/'; // une photo par skieur : img/athletes/<id>.jpg (voir README)

  // Liste des skieurs : la liste de base (js/athletes.js) + ceux ajoutés par l'admin ou saisis librement par un joueur.
  const RESNAMES = {};   // noms des skieurs hors jeu, tirés du classement FIS complet
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
  const F_HM = fmt({ hour: '2-digit', minute: '2-digit' });
  const F_MO = fmt({ month: 'short' });
  const F_NUM = fmt({ day: 'numeric' });
  const F_DM = fmt({ day: '2-digit', month: '2-digit' });
  const dmOf = (date) => F_DM.format(at(date));   // 24/10
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
  /** Drapeau d'une nation (code CIO à 3 lettres). */
  const NAT_CC = { SUI: 'ch', BRA: 'br', NOR: 'no', AUT: 'at', ITA: 'it', FRA: 'fr', USA: 'us', FIN: 'fi', GER: 'de', BEL: 'be', CRO: 'hr', SLO: 'si', CAN: 'ca', CZE: 'cz', SWE: 'se', GBR: 'gb', BUL: 'bg', AND: 'ad', CHI: 'cl', ESP: 'es', JPN: 'jp', EST: 'ee', SVK: 'sk', NED: 'nl', NZL: 'nz', ALB: 'al', POL: 'pl', LAT: 'lv', BIH: 'ba', HUN: 'hu', ISR: 'il', AUS: 'au', KOR: 'kr', CHN: 'cn', LIE: 'li', LUX: 'lu', ARG: 'ar', UKR: 'ua', TUR: 'tr', GRE: 'gr', IRL: 'ie', DEN: 'dk', ROU: 'ro', SRB: 'rs', KAZ: 'kz', MON: 'mc' };
  const flagOf = (nat) => { const cc = NAT_CC[String(nat || '').toUpperCase()]; return cc ? `<img class="fl dr__flag" src="https://flagcdn.com/w40/${cc}.png" srcset="https://flagcdn.com/w80/${cc}.png 2x" width="20" height="15" alt="${esc(nat)}" title="${esc(nat)}" loading="lazy" onerror="this.style.display='none'">` : ''; };
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
    Object.values(res).forEach((l) => l.forEach((e) => { if (e.name && !ATH[e.ath]) RESNAMES[e.ath] = prettyFis(e.name); }));
    state.draws = G.autoDraws(res, meta, picks); // tirages au sort : fonction pure des données publiques, donc vérifiables
    Object.entries(state.draws).forEach(([rid, byPlayer]) => Object.entries(byPlayer).forEach(([pid, d]) => { picks[pid][rid] = Object.assign({}, picks[pid][rid], { d: d.ath, auto: true }); }));
    state.picks = picks;
    scheduleRender();
  }
  function startStore() {
    store.onAuth((u) => { state.authReady = true; state.user = u; state.me = u ? u.uid : null; introRules(); if (isAdmin() && !state.contactsOn) { state.contactsOn = true; store.listenContacts((m) => { state.contacts = m; scheduleRender(); }); } if (!state.demo) { state.authError = ''; scheduleRender(); } });
    setTimeout(() => { if (!state.picksReady) { state.picksLate = true; scheduleRender(); } }, 12000);   // les choix n'arrivent pas : on prévient
    store.listen({
      players: (list) => { state.players = list.map((x) => ({ id: x.id, name: x.name || x.email || x.id, photo: x.photo || '', blocked: !!x.photoBlocked, lastSeen: Number(x.lastSeen) || 0, theme: x.theme || "" })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        // un simple « vu à l'instant » n'oblige pas à redessiner la page : seulement l'onglet Admin
        const sig = JSON.stringify(state.players.map((p) => [p.id, p.name, p.photo, p.blocked]));
        const same = sig === state.playersSig; state.playersSig = sig;
        if (!same || state.tab === 'adm') scheduleRender(); },
      picks: (m) => { state.raw.picks = m; state.picksReady = true; state.syncErr = false; recompute(); },
      error: () => { state.syncErr = true; scheduleRender(); },
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
  const raceName = (r) => `${discLabel(r)} ${genderLabel(r).toLowerCase()}`;   // « Géant messieurs » : discipline d'abord
  const placeLabel = (r) => (r.kind === 'mondial' ? 'Crans-Montana' : r.place);
  const raceTag = (r) => `${placeLabel(r)} ${D.DISC[r.disc].short}${r.sub || ''}`;
  function discBadge(r) {
    const mult = r.mult > 1
      ? `<span class="mult" title="${r.kind === 'mondial' ? 'Barème ×3 aux Mondiaux' : 'Barème ×2 pour les finales (seuls les 15 premiers marquent)'}">×${r.mult}</span>` : '';
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
  /** Nom affiché : « Prénom NOM » (nom de famille en majuscules dès qu'il suit un prénom). */
  const dispCache = {};
  /** « NOM Prénom » (FIS) -> « Prénom NOM ». */
  const prettyFis = (n) => { const w = String(n).trim().split(/\s+/); let k = 0; while (k < w.length - 1 && w[k] === w[k].toUpperCase()) k++; return k && k < w.length ? w.slice(k).join(' ') + ' ' + w.slice(0, k).join(' ') : n; };
  const nameOf = (id) => {
    const a = ATH[id]; if (!a) return RESNAMES[id] || id;
    if (dispCache[id] && dispCache[id][0] === a.name) return dispCache[id][1];
    let out = a.name;
    if (a.fis) { const sn = surnameOf(a), first = a.fis.slice(sn.length).trim(); if (first) out = first + ' ' + sn.toUpperCase(); }
    else { const w = a.name.trim().split(/\s+/); if (w.length > 1) out = w.slice(0, -1).join(' ') + ' ' + w[w.length - 1].toUpperCase(); }
    dispCache[id] = [a.name, out]; return out;
  };
  /** Nom de skieur cliquable (ouvre sa fiche) et nom de joueur cliquable (ouvre sa fiche). */
  const skn = (id, label) => `<button type="button" class="lnk" data-dr="sk:id~${esc(id)}" title="Voir la fiche">${esc(label != null ? label : nameOf(id))}</button>`;
  const pln = (p) => `<button type="button" class="lnk" data-player="${esc(p.id)}" title="Voir la fiche">${esc(p.name)}</button>`;

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
    return `<button type="button" class="freelink" data-free="${race.id}" data-slot="${slot}">${race.gender === 'W' ? 'Skieuse absente de la liste ? Saisir son nom' : 'Skieur absent de la liste ? Saisir son nom'}</button>`;
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
    const ph = slot === 'a' ? (race.gender === 'W' ? 'Choisir une skieuse (tape quelques lettres)' : 'Choisir un skieur (tape quelques lettres)') : 'Remplaçant (facultatif)';
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
    if (!n) { if (!none) { none = document.createElement('li'); none.className = 'combo__none'; const rr = box.dataset.race || ((box.querySelector('[data-race]') || {}).dataset || {}).race, fw = (G.raceOf(rr) || {}).gender === 'W'; none.textContent = fw ? 'Aucune skieuse ne correspond. Utilise le lien « Skieuse absente de la liste » ci-dessous.' : 'Aucun skieur ne correspond. Utilise le lien « Skieur absent de la liste » ci-dessous.'; list.appendChild(none); } } else if (none) none.remove();
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
  /* ---------- Brouillons : choix posés à l'avance, pas encore confirmés ----------
     Un brouillon (pick.draft) réserve le skieur dans le desk mais n'est pas compté comme « choix fait ».
     À la deadline il est pris tel quel (le drapeau est alors ignoré). */
  const isDraft = (pk, race) => !!(pk && pk.a && pk.draft && !lockedRace(race));
  const isConfirmed = (pk, race) => !!(pk && pk.a && !isDraft(pk, race));
  const confirmedN = (races) => races.filter((r) => isConfirmed(myPicks()[r.id], r)).length;
  const draftN = (races) => races.filter((r) => isDraft(myPicks()[r.id], r)).length;
  const sessionDraftMode = (session) => { const l = active(G.sessionRaces(session)).filter((r) => !lockedRace(r) && (myPicks()[r.id] || {}).a); return l.length > 0 && l.every((r) => myPicks()[r.id].draft); };
  function setDraft(raceIds, on) {
    const picks = myPicks();
    raceIds.forEach((rid) => {
      const race = G.raceOf(rid), pk = picks[rid]; if (!race || lockedRace(race) || !pk || !pk.a) return;
      const n = Object.assign({}, pk); delete n.ts; if (on) n.draft = true; else delete n.draft;
      picks[rid] = n;
      if (!state.demo) store.setPick(state.me, rid, n).catch(fail);
    });
    const y = window.scrollY; renderPanel(); window.scrollTo({ top: y });
  }
  function pickEditor(race, session) {
    const label = `${placeLabel(race)}, ${raceName(race)}`;
    const cur = myPicks()[race.id] || {};
    const face = cur.a ? avatarOf(cur.a) : `<span class="avatar avatar--empty" aria-hidden="true"></span>`;
    return `<div class="pickbox">
      ${face}
      <div class="pickbox__sel">
        <label class="sr" for="pa-${race.id}">${race.gender === 'W' ? 'Skieuse' : 'Skieur'}, ${esc(label)}</label>
        ${combo(race, session, 'a')}
        <label class="sr" for="pb-${race.id}">Remplaçant, ${esc(label)}</label>
        <span class="pickhelp">${combo(race, session, 'b')}${info('Le remplaçant est facultatif. Il joue à la place du titulaire que si ce dernier ne prend pas le départ.')}</span>
        ${freeLink(race, 'auto')}
        ${cur.a ? `<button type="button" class="draftbtn${cur.draft ? ' is-on' : ''}" data-draft="${race.id}" aria-pressed="${!!cur.draft}" title="${cur.draft ? 'Ce choix est un brouillon : touche pour le confirmer' : 'Ce choix est confirmé : touche pour le repasser en brouillon'}">${cur.draft ? 'Confirmer le choix' : 'Basculer en brouillon'}</button>` : ''}
      </div>
    </div>`;
  }
  function pickSummary(playerId, race) {
    const p = (state.picks[playerId] || {})[race.id];
    if (!p || !p.a) return '<span class="none">Aucun choix</span>';
    const eff = G.effectiveAthlete(p, state.results, race.id);
    const swapped = p.b && eff === p.b;
    const drawn = p.d && eff === p.d;
    const fin = !!state.results[race.id];   // résultat saisi : on n'affiche plus le remplaçant si le titulaire a pris le départ
    const text = drawn
      ? `<span class="who"><s class="who--out">${skn(p.a)}</s>${p.b ? ` <s class="who--out">${skn(p.b)}</s>` : ''} ${skn(p.d)}</span><span class="sub">Tiré au sort</span>`
      : swapped
      ? `<span class="who"><s class="who--out">${skn(p.a)}</s> ${skn(p.b)}</span><span class="sub">Remplaçant en piste</span>`
      : `<span class="who">${skn(p.a)}</span>${p.b && !fin ? `<span class="sub">Remplaçant : ${skn(p.b)}</span>` : ''}`;
    return `<div class="pickline">${avatarOf(eff)}<div class="pickline__txt">${text}</div></div>`;
  }
  function outcome(race, playerId) {
    const res = state.results[race.id];
    if (race.cancelled) return '<span class="soon">Annulée</span>';
    if (!res) {
      if (!lockedRace(race)) return '';
      const lv = liveOf(race);
      const late = now() - G.raceStart(race) > 2.5 * 3600 * 1000; // avant, le résultat ne peut pas être publié : inutile de proposer de vérifier
      return `<span class="soon">${lv ? 'Provisoire (1re manche)' : 'Résultat en attente'}</span>${late ? '<button type="button" class="linkbtn rcbtn" data-refresh-results>↻ Vérifier le résultat officiel</button>' : ''}`;
    }
    const pk = (state.picks[playerId] || {})[race.id];
    const sc = G.scoreRace(race, pk, state.results);
    const eff = pk && G.effectiveAthlete(pk, state.results, race.id);
    const e = eff && res.find((x) => x.ath === eff);
    const how = e ? (e.status || ordinal(e.rank)) : '';
    const win = winnerOf(race.id);
    return `<div class="out"><span class="pill ${sc > 0 ? 'pill--on' : 'pill--off'}">${sc > 0 ? '+' : ''}${sc}</span>${how ? `<span class="rank">${how}</span>` : ''}<span class="flag flag--ok">Terminé</span></div>
      ${win ? `<span class="winner">Vainqueur ${esc(surname(win))}</span>` : ''}`;
  }
  const sessionOf = (race) => [...D.SESSIONS, D.WORLDS].find((s) => s.races.includes(race.id));

  /* ---------- Courses d'une session (vue « Mon desk ») ---------- */
  /** Course terminée : la ligne prend la couleur de l'ambiance (chaude si j'ai marqué, froide sinon). */
  function doneCls(race) {
    if (race.cancelled || !resOf(race)) return '';
    const sc = G.scoreRace(race, (state.picks[state.me] || {})[race.id], state.results) || 0;
    return sc > 0 ? ' race--done race--hot' : ' race--done race--cold';
  }

  /* ---------- Rentabilité de mon choix : skieur et course comparés aux autres joueurs, note en flocons ---------- */
  const f1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  function flakeRow(v) {
    return `<span class="flk" role="img" aria-label="${f1(v)} flocons sur 5">${[0, 1, 2, 3, 4].map((i) => `<span class="flk__i"><i style="width:${Math.round(100 * Math.max(0, Math.min(1, v - i)))}%">❄</i>❄</span>`).join('')}</span>`;
  }
  function anaCmp(title, who, mine, avg, n, max, min) {
    const head = `<h4 class="anab__t">${esc(title)}</h4>`;
    if (avg == null || n < min) return `<section class="anab anab--wait">${head}<p class="anab__q">${who}</p><p class="anab__w">Calcul en attente : pas encore assez de données (${n} autre${n > 1 ? 's' : ''} joueur${n > 1 ? 's' : ''}, ${min} nécessaires).</p></section>`;
    const d = Math.round(mine - avg), top = Math.max(mine, avg, 1);
    return `<section class="anab">${head}<p class="anab__q">${who}</p>
      <div class="anab__bars"><span class="anab__l">Toi</span><span class="anab__bar"><i class="is-me" style="width:${Math.round(100 * mine / top)}%"></i></span><b>${mine} pt${mine > 1 ? 's' : ''}</b>
      <span class="anab__l">Moyenne</span><span class="anab__bar"><i style="width:${Math.round(100 * avg / top)}%"></i></span><b>${f1(avg)} pt${avg >= 2 ? 's' : ''}</b></div>
      <p class="anab__d ${d > 0 ? 'is-up' : d < 0 ? 'is-dn' : ''}">${d > 0 ? '+' + d + ' pts au-dessus' : d < 0 ? Math.abs(d) + ' pts en dessous' : 'Dans la moyenne'}<span> · ${n} autre${n > 1 ? 's' : ''} joueur${n > 1 ? 's' : ''}</span></p></section>`;
  }
  function analysisBlock(race) {
    if (race.cancelled || !resOf(race)) return '';
    const an = G.pickAnalysis(race, state.me, state.picks, state.results, state.players.map((p) => p.id));
    if (!an) return '';
    const nm = esc(nameOf(an.ath));
    const lab = ['Raté', 'Décevant', 'Correct', 'Bon pick', 'Très bon pick', 'Coup de maître'];
    const concl = an.flakes == null
      ? '<p class="anab__w">Note du choix : calcul en attente, pas encore assez de données.</p>'
      : `<div class="ana__note" title="Note = 5 × (0,5 × √(points ÷ max) + 0,25 × écart à la moyenne de la course + 0,25 × écart à la moyenne du skieur).">${flakeRow(an.flakes)}<b>${f1(an.flakes)} / 5</b><span>${lab[Math.min(5, Math.max(0, Math.ceil(an.flakes - 0.5)))] }</span>${an.provisional ? '<em>provisoire : s’affinera quand d’autres joueurs auront pris ce skieur dans le desk</em>' : '<em>évolue si d’autres joueurs prennent ce skieur dans le desk</em>'}</div>`;
    return `<div class="ana"><div class="ana__grid">
      ${anaCmp('Rentabilité du skieur', `Ce que ${nm} t’a rapporté, face aux autres joueurs qui l’ont pris dans ce desk`, an.mine, an.skier.avg, an.skier.n, an.max, an.min)}
      ${anaCmp('Rentabilité de la course', `Ce que cette course t’a rapporté, face aux autres joueurs, quel que soit leur skieur`, an.mine, an.race.avg, an.race.n, an.max, an.min)}
      </div>${concl}</div>`;
  }
  function raceRow(race, session) {
    const flag = race.cancelled ? '<span class="flag flag--off">Annulée</span>'
      : race.moved ? `<span class="flag flag--moved" title="Choix modifiable jusqu’au nouveau départ">Reportée du ${esc(shortOf(race.originalDate))}, départ ${esc(hourText(G.raceStart(race)))}</span>` : '';
    const pick = race.cancelled ? '<span class="none">Course annulée : aucun choix</span>' : lockedRace(race) ? pickSummary(state.me, race) : pickEditor(race, session);
    return `<li class="race race--card race--${race.gender}${race.cancelled ? ' race--off' : ''}${doneCls(race)}">
      ${raceCard(race, { noWait: true, extra: `${flag}${race.cancelled ? '' : slLink(race)}` })}
      <div class="race__main"><div class="race__pick">${pick}</div>
      <div class="race__out">${outcome(race, state.me)}</div>${analysisBlock(race)}</div>
    </li>`;
  }
  function sessionCard(session, indexLabel) {
    const races = sortedRaces(session);
    const live = active(races);
    const dl = G.sessionDeadline(session);
    const n = confirmedN(live), nd = draftN(live);
    const open = live.some((r) => !lockedRace(r));
    const mine = G.sessionScore(session, myPicks(), state.results);
    // Session terminée : au-dessus de la moyenne des joueurs = chaude (flammes), en dessous = froide (stalactites)
    let mood = '', avgTxt = '';
    if (G.sessionState(session, now()) === 'terminée' && state.players.length > 1) {
      const all = state.players.map((p) => G.sessionScore(session, state.picks[p.id] || {}, state.results));
      const avg = all.reduce((a, b) => a + b, 0) / all.length;
      mood = mine > avg ? ' session--hot' : mine < avg ? ' session--cold' : '';
      avgTxt = `, moyenne des joueurs ${Math.round(avg)} pts`;
    }
    return `<article class="session${mood}" id="s-${session.id}">
      <header class="session__head">
        <div>
          <h3 class="session__name">${fl(session.name)}</h3>
          <p class="session__meta">${indexLabel ? indexLabel + ', ' : ''}deadline ${dlShort(dl)}${avgTxt}</p>
        </div>
        <div class="session__side">${stateBadge(session)}${open
    ? `<span class="count${n === live.length ? ' count--ok' : ''}">${n}/${live.length} choisis</span>${nd ? `<span class="count count--draft">${nd} brouillon${nd > 1 ? 's' : ''}</span>` : ''}${remindBtn(session)}`
    : `<span class="count count--pts">${mine} pts</span>`}</div>
      </header>
      ${open && live.some((r) => (myPicks()[r.id] || {}).a) ? `<p class="session__draft">${nd === live.filter((r) => (myPicks()[r.id] || {}).a).length ? '📝 Cette session est en brouillon : ses choix ne comptent pas comme faits (ils seront confirmés automatiquement à la deadline).' : ''} <button type="button" class="linkbtn" data-draft-session="${session.id}|${sessionDraftMode(session) ? 0 : 1}">${sessionDraftMode(session) ? 'Tout confirmer' : 'Tout passer en brouillon'}</button></p>` : ''}
      ${races.some((r) => r.kind === 'finale') ? '<p class="session__note">🏁 Finales : points ×2, et <strong>seuls les 15 premiers marquent</strong> (à partir de la 16ᵉ place : 0 point).</p>' : ''}
      <ul class="races">${races.filter(passF).map((r) => raceRow(r, session)).join('') || '<li class="race"><span class="none">Aucune course avec ces filtres.</span></li>'}</ul>
    </article>`;
  }

  /* ---------- Ordres d'affichage : joueurs = classement général, skieurs = classement actuel de la Coupe du monde ---------- */
  const playersRanked = () => rankRows((pk) => G.generalScore(pk, state.results)).map((r) => r.p);
  /** Points Coupe du monde de chaque skieur d'après les résultats saisis (barème de la CDM, sans bonus du jeu). */
  function wcPoints() {
    const pts = {};
    Object.keys(state.results).forEach((rid) => {
      const race = G.raceOf(rid), res = state.results[rid];
      if (!race || race.cancelled || !res) return;
      res.forEach((e) => { if (!e.status && e.rank) pts[e.ath] = (pts[e.ath] || 0) + G.racePoints(race, e.rank); });
    });
    return pts;
  }

  /* ---------- Récap des joueurs ---------- */
  function recapTable(session) {
    const races = sortedRaces(session).filter(passF);
    const order = playersRanked();
    const head = order.map((p) => `<th scope="col" class="${p.id === state.me ? 'me' : ''}">${pname(p)}</th>`).join('');
    const rows = races.map((r) => {
      const cells = order.map((p) => {
        const pk = (state.picks[p.id] || {})[r.id];
        const cls = p.id === state.me ? 'me' : '';
        if (r.cancelled) return `<td class="${cls}"><span class="none">Annulée</span></td>`;
        if (!visible(p.id, r)) return `<td class="${cls}"><span class="none">Révélé au départ</span></td>`;
        if (!pk || !pk.a) return `<td class="${cls}"><span class="none">Aucun choix</span></td>`;
        const eff = G.effectiveAthlete(pk, state.results, r.id);
        const sc = G.scoreRace(r, pk, state.results);
        return `<td class="${cls}"><div class="cell">${avatarOf(eff, 'sm')}<div class="cell__txt"><span class="who" title="${esc(nameOf(eff))}">${skn(eff, surname(nameOf(eff)))}</span>${eff !== pk.a ? '<span class="sub">Remplaçant</span>' : ''}${sc === null ? '' : `<span class="cellpts ${sc > 0 ? 'on' : 'off'}">${sc > 0 ? '+' : ''}${sc}</span>`}</div></div></td>`;
      }).join('');
      return `<tr><th scope="row"><span class="rowhead__day">${dayOf(r.date)}</span> ${fl(placeLabel(r))}<br>${discBadge(r)}<span class="gender gender--${r.gender}">${genderLabel(r)}</span>${r.cancelled || !lockedRace(r) ? '' : `<br><button type="button" class="linkbtn rcbtn" data-racecard="${r.id}">Voir plus…</button>`}</th>${cells}</tr>`;
    }).join('');
    const totals = order.map((p) => `<td class="${p.id === state.me ? 'me' : ''}"><strong>${G.sessionScore(session, state.picks[p.id], state.results)} pts</strong></td>`).join('');
    return `${SHARE.fsOpen()}<div class="tablewrap"><table class="grid grid--fx grid--fxrecap" style="--n:${state.players.length}">
      <caption>${fl(session.name)}</caption>
      <thead><tr><th scope="col">Course</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">Total de la session</th>${totals}</tr></tfoot>
    </table></div></div>`;
  }
  /* ---------- Tendances : jauges indicatives, une fois la deadline passée ---------- */
  function trendsAny(key) { return scopeSessions(key).some((s) => sortedRaces(s).some((r) => !r.cancelled && lockedRace(r))); }
  function gauge(ath, pct, extra, cls, valTxt) {
    return `<li class="gauge${cls ? ' ' + cls : ''}"><span class="gauge__who">${avatarOf(ath, 'sm')}<span class="gauge__t"><span class="gauge__n">${skn(ath)}</span>${extra ? `<span class="gauge__x">${extra}</span>` : ''}</span></span><span class="gauge__bar" role="img" aria-label="${esc(String(valTxt || pct + ' %').replace(/<[^>]*>/g, ''))}"><i style="width:${Math.max(pct, 3)}%"></i></span><b class="gauge__v${valTxt ? ' gauge__v--n' : ''}">${valTxt || pct + ' %'}</b></li>`;
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
  /** Skieurs majeurs : ceux de la liste des cotes (« victoire seulement »), classés par cote croissante. */
  const MAJORS = { M: { 'marco-odermatt': 1.4, 'lucas-pinheiro-braathen': 7, 'loic-meillard': 7, 'atle-lie-mcgrath': 8.5, 'henrik-kristoffersen': 18.5, 'franjo-von-allmen': 18.5, 'giovanni-franzoni': 18.5, 'marco-schwarz': 18.5, 'vincent-kriechmayr': 21, 'timon-haugan': 43, 'alexis-monney': 76, 'stefan-rogentin': 76, 'clement-noel': 161, 'alexander-steen-olsen': 161, 'dominik-paris': 161, 'fredrik-moeller': 261, 'raphael-haaser': 351, 'manuel-feller': 441, 'alex-vinatzer': 441, 'ryan-cochran-siegle': 676, 'stefan-brennsteiner': 676, 'linus-strasser': 901, 'filip-zubcic': 901, 'eduard-hallberg': 901, 'paco-rassat': 901, 'zan-kranjec': 901, 'river-radamus': 901 },
    W: { 'emma-aicher': 1.73, 'mikaela-shiffrin': 3.3, 'camille-rast': 5.5, 'federica-brignone': 10.5, 'sofia-goggia': 12, 'alice-robinson': 12, 'julia-scheib': 21, 'lara-colturi': 27.5, 'paula-moltzan': 43, 'cornelia-huetter': 66, 'laura-pirovano': 66, 'zrinka-ljutic': 76, 'kajsa-vickhoff-lie': 76, 'sara-hector': 76, 'petra-vlhova': 76, 'corinne-suter': 161, 'kira-weidle-winkelmann': 161, 'lauren-macuga': 161, 'breezy-johnson': 161, 'ester-ledecka': 261, 'lindsey-vonn': 261, 'wendy-holdener': 261, 'katharina-liensberger': 351, 'marta-bassino': 441, 'lena-duerr': 901, 'anna-swenn-larsson': 901 } };
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
          const sc = G.scoreRace(r, pk, state.results), dft = p.id === state.me && isDraft(pk, r);
          ((takes[pk.a] = takes[pk.a] || {})[p.id] = (takes[pk.a][p.id] || [])).push({ tag: raceTag(r), sc, dft });
          totals[r.gender][p.id] = (totals[r.gender][p.id] || 0) + (sc || 0);
        });
      });
    });
    const filters = `<div class="filters">
      <label class="sr" for="ath-q">Chercher un skieur</label>
      <input type="search" id="ath-q" class="search" placeholder="Chercher un skieur ou une nation" value="${esc(state.tq)}" autocomplete="off">
      <div class="seg seg--sm" role="group" aria-label="Filtrer les skieurs">${[['all', 'Tous'], ['taken', 'Déjà pris'], ['draft', 'Brouillons'], ['free', 'Encore libres']].map(([id, l]) =>
        `<button type="button" class="seg__btn" data-tf="${id}" aria-pressed="${state.tf === id}">${l}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="ath-major"${state.major ? ' checked' : ''}> Skieurs majeurs ${info('Coché : seuls les favoris (liste des cotes « victoire seulement », classés du plus favori au moins favori) et les skieurs déjà choisis sont affichés. Décoche pour voir tout le monde, puis fais défiler le tableau vers la droite.')}</label>
    </div>`;
    return filters + ['M', 'W'].map((g) => {
      // Majeurs d'abord, par cote croissante ; les autres ensuite, dans l'ordre habituel
      const order = Object.keys(MAJORS[g]), odd = (a) => { const k = order.indexOf(a.id); return k < 0 ? Infinity : k; };
      const wc = wcPoints();
      const list = LIST[g].map((a, i) => [a, i]).sort((x, y) => ((wc[y[0].id] || 0) - (wc[x[0].id] || 0)) || (odd(x[0]) === odd(y[0]) ? 0 : odd(x[0]) - odd(y[0])) || x[1] - y[1]).map((x) => x[0]);
      const isDr = (a) => !!takes[a.id] && Object.values(takes[a.id]).every((l) => l.every((x) => x.dft));   // pris seulement en brouillon
      const taken = list.filter((a) => takes[a.id] && !isDr(a)).length, drafted = list.filter((a) => isDr(a)).length;
      const attrs = (a) => `data-a="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.fis || '') + ' ' + (a.nat || '')))}" data-taken="${takes[a.id] ? (isDr(a) ? 'd' : 1) : 0}" data-major="${MAJORS[g][a.id] !== undefined || takes[a.id] ? 1 : 0}"`;
      const head = list.map((a) => `<th scope="col" class="sk ${takes[a.id] ? (isDr(a) ? 'is-draft' : 'is-taken') : 'is-free'}" ${attrs(a)}>${avatar(ATH[a.id], !!takes[a.id] && !isDr(a))}<span class="sk__n">${skn(a.id, listName(a))}</span><em class="sub">${esc(a.nat || (a.pending ? 'à régulariser' : ''))}</em></th>`).join('');
      const rows = playersRanked().map((p) => {
        const cells = list.map((a) => {
          const l = takes[a.id] && takes[a.id][p.id];
          const inner = l ? l.map((x) => `<span class="mark${x.dft ? ' mark--draft' : ''}" title="${esc(x.tag)}${x.dft ? ' (brouillon)' : ''}"><span class="mark__l">${esc(x.tag)}</span>${x.sc === null ? '' : `<b class="mark__p ${x.sc > 0 ? 'on' : 'off'}">${x.sc > 0 ? '+' : ''}${x.sc}</b>`}</span>`).join('') : '';
          return `<td ${attrs(a)}>${inner}</td>`;
        }).join('');
        return `<tr class="${p.id === state.me ? 'me' : ''}"><th scope="row"><strong>${pln(p)}</strong><span class="sub">${totals[g][p.id] || 0} pts rapportés</span></th>${cells}</tr>`;
      }).join('');
      return `${SHARE.fsOpen()}<div class="tablewrap tablewrap--scroll"><table class="grid grid--tk">
        <caption>${g === 'M' ? 'Messieurs' : 'Dames'}, ${taken} sur ${list.length} déjà pris${drafted ? `, ${drafted} en brouillon` : ''}</caption>
        <thead><tr><th scope="col" class="tk__corner">Joueur</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join('') + '<p class="hint">En couleur : choix confirmé. En pointillés : brouillon (réservé mais pas encore confirmé). En noir et blanc : encore libre. Les choix des autres apparaissent à la deadline de chaque session.</p>';
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
  /** Statistiques du desk : choix faits, points + classement dans le desk, classement général + places gagnées/perdues pendant le desk. */
  function deskStats(key, chosen, total, drafts, score) {
    const R = state.results, ids = new Set(scopeSessions(key).flatMap((s) => active(G.sessionRaces(s))).map((r) => r.id));
    const played = Object.keys(R).some((id) => ids.has(id));
    const R0 = Object.assign({}, R); ids.forEach((id) => { delete R0[id]; });
    const dRank = played ? (rankRows((pk) => ({ total: key === 0 ? G.worldsScore(pk, R).total : G.deskScore(key, pk, R) })).find((r) => r.p.id === state.me) || {}).rank : null;
    const g1 = (rankRows((pk) => ({ total: G.generalScore(pk, R).total })).find((r) => r.p.id === state.me) || {}).rank;
    const g0 = (rankRows((pk) => ({ total: G.generalScore(pk, R0).total })).find((r) => r.p.id === state.me) || {}).rank;
    const mv = played && g0 && g1 ? g0 - g1 : 0;
    const mvHtml = !played ? '' : mv > 0 ? `<span class="mv mv--up">▲ ${mv}</span>` : mv < 0 ? `<span class="mv mv--dn">▼ ${-mv}</span>` : '<span class="mv">=</span>';
    return `<div><dt>Choix faits ${info('Nombre de courses de ce desk pour lesquelles tu as confirmé un skieur. Les brouillons sont comptés à part.')}</dt><dd>${chosen}/${total}${drafts ? `<span class="draftn"> + ${drafts} brouillon${drafts > 1 ? 's' : ''}</span>` : ''}</dd></div>
      <div><dt>Points ${info('Total de tes points sur ce desk et ton classement parmi les joueurs sur ce desk.')}</dt><dd>${score}<span class="sub"> pts</span><span class="deskrk">${dRank ? ordinal(dRank) + ' du desk' : 'pas encore de classement'}</span></dd></div>
      <div><dt>Classement général ${info('Ta place au classement général et les places gagnées ou perdues depuis le début de ce desk.')}</dt><dd>${played && g1 ? ordinal(g1) : '-'} ${mvHtml}<span class="deskrk">${played ? 'depuis le début du desk' : 'pas encore de classement'}</span></dd></div>`;
  }
  function deskPanel(key) {
    const isW = key === 0;
    const sessions = scopeSessions(key);
    const sub = state.sub[key];
    const dk = isW ? null : D.DESKS[key - 1];
    const score = isW ? G.worldsScore(myPicks(), state.results).total : G.deskScore(key, myPicks(), state.results);
    const total = sessions.reduce((n, s) => n + active(G.sessionRaces(s)).length, 0);
    const chosen = sessions.reduce((n, s) => n + confirmedN(active(G.sessionRaces(s))), 0), drafts = sessions.reduce((n, s) => n + draftN(active(G.sessionRaces(s))), 0);
    const title = isW ? 'Championnats du monde' : dk.name;
    const meta = isW ? `Crans-Montana, 04/02 au 14/02, ${total} courses` : `${dmOf(dk.from)} au ${dmOf(dk.to)}, ${total} courses`;
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
          <p class="rule">${isW ? 'Barème ×3. Un skieur ne peut être choisi qu’une fois.' : 'Un skieur ne peut être choisi qu’une fois dans un desk.'} ${info(isW ? 'Aux Mondiaux, les points sont multipliés par 3 et un skieur ne peut servir qu’une fois sur l’ensemble des 8 épreuves. Messieurs et dames comptent à part.' : 'Dans un même desk, un skieur ne peut être choisi qu’une seule fois chez les messieurs et une seule fois chez les dames. Un skieur déjà pris apparaît grisé.')}</p></div>
        <dl class="deskhead__stats">${deskStats(key, chosen, total, drafts, score)}</dl>
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

  /* ---------- Onglet 1 : à venir / en cours / dernière session ---------- */
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignoré */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignoré */ } },
  };
  const H24 = 24 * 3600 * 1000;
  /** La « dernière session » reste affichée 24 h après sa fin, 48 h si le joueur ne l'a pas vue pendant ces 24 h ; « skip » la masque (une fois, pour cette session). */
  function finishedWindow(s) {
    if (LS.get('skigame.skip.' + s.id)) return false;
    return finishedWindowIgnoringSkip(s);
  }
  function finishedWindowIgnoringSkip(s) {
    const seen = Number(LS.get('skigame.seen.' + s.id)) || 0;
    const end = G.sessionEnd(s).getTime();
    // 24 h pour tout le monde ; une 2e journée si le joueur n'est pas passé sur le site pendant la première
    return now().getTime() < (seen && seen <= end + H24 ? end + H24 : end + 2 * H24);
  }
  function homeMode() {
    const all = allSessions(), st = (s) => G.sessionState(s, now());
    const cur = all.find((s) => st(s) === 'en cours');
    if (cur) return { kind: 'cours', session: cur };
    const next = all.find((s) => st(s) === 'ouverte');
    const done = all.filter((s) => st(s) === 'terminée');
    const last = done[done.length - 1];
    if (last && (!next || finishedWindow(last))) return { kind: 'fin', session: last, next };
    return { kind: 'avenir', session: next || upcomingSession(), back: last && next && finishedWindowIgnoringSkip(last) ? last : null };
  }
  const resOf = (race) => state.results[race.id];
  function ptsChip(pid, race) {
    if (race.cancelled || !resOf(race)) return '';
    const sc = G.scoreRace(race, (state.picks[pid] || {})[race.id], state.results) || 0;
    return `<span class="pill ${sc > 0 ? 'pill--on' : 'pill--off'}">${sc > 0 ? '+' : ''}${sc}</span>`;
  }
  /** Skieurs effectivement alignés par les joueurs sur une course, et le (ou les) plus choisi(s). */
  function racePeople(race) {
    const picks = state.players.map((p) => { const pk = (state.picks[p.id] || {})[race.id]; return pk && pk.a ? { p, ath: G.effectiveAthlete(pk, state.results, race.id) } : null; }).filter(Boolean);
    const cnt = {};
    picks.forEach((x) => { cnt[x.ath] = (cnt[x.ath] || 0) + 1; });
    const max = Math.max(0, ...Object.values(cnt));
    return { picks, cnt, max, top: Object.keys(cnt).filter((a) => cnt[a] === max) };
  }
  /* ---------- Suivi en direct (après la 1re manche) : data/live.json, écrit par tools/live.js ---------- */
  const hm = (t) => (t ? t.replace(':', 'h') : '');
  function liveOf(race) {
    const L = state.live && state.live.races && state.live.races[race.id];
    if (!L || !L.hasResults || resOf(race)) return null;
    const sl = startListOf(race), codeAth = {};
    ((sl && sl.rows) || []).forEach((r) => { const c = (state.startlists.races[race.id].start.find((x) => x.bib === r.bib) || {}).code; if (c && r.ath) codeAth[c] = r.ath; });
    const by = {}, q = L.qualify || 30;
    (L.rows || []).forEach((r) => { const a = codeAth[r.code]; if (a) by[a] = { rank: r.rank, out: r.rank > q }; });
    (L.out || []).forEach((r) => { const a = codeAth[r.code]; if (a && r.status !== 'DNS') by[a] = { status: r.status, out: true }; });
    // non-partant : skieur du jeu absent de la liste de départ FIS alors que le classement de la 1re manche est publié
    const starters = new Set(((sl && sl.rows) || []).map((r) => r.ath).filter(Boolean));
    const dns = (a) => !!sl && starters.size > 0 && !starters.has(a);
    return { L, by, dns };
  }
  /** Skieurs qui remplacent le non-partant a pour chaque joueur concerné (remplaçant saisi, sinon tirage au sort). */
  function subsOf(race, lv, a) {
    const dr = lv._dr || (lv._dr = liveDraws(race, lv)), out = [];
    state.players.forEach((p) => {
      const pk = (state.picks[p.id] || {})[race.id]; if (!pk || pk.a !== a) return;
      const r = pk.b && !lv.dns(pk.b) ? pk.b : (dr[p.id] && dr[p.id].ath); if (r && !out.includes(r)) out.push(r);
    });
    return out;
  }
  const liveChip = (lv, a, race) => { if (lv && lv.dns(a)) { const sb = race ? subsOf(race, lv, a) : []; return ` <span class="rank rank--dns" title="Absent de la liste de départ">Non partant (DNS)${sb.length ? ` · remp. par ${sb.map((x) => skn(x)).join(', ')}` : ''}</span>`; } const e = lv && lv.by[a]; if (!e) return ''; return e.out ? ` <span class="rank rank--bubble" title="Non qualifié pour la 2e manche">⚠ Bulle : ${e.status ? esc(e.status) : 'hors du top 30 (' + e.rank + 'e)'}, 0 pt</span>` : ` <span class="rank rank--live">1re manche : ${ordinal(e.rank)}</span>`; };
  /** Résultat officiel d'un de mes choix : rang, points, remplaçant éventuel ; cliquable pour ouvrir le résultat complet. */
  function resChip(race) {
    const res = resOf(race); if (!res) return '';
    const pk = (state.picks[state.me] || {})[race.id]; if (!pk || !pk.a) return '';
    const eff = G.effectiveAthlete(pk, state.results, race.id), e = res.find((x) => x.ath === eff), sc = G.scoreRace(race, pk, state.results) || 0;
    const how = e ? (e.status || ordinal(e.rank)) : 'non classé';
    return ` <button type="button" class="rank rank--final" data-racecard="${race.id}" title="Voir le résultat complet">${eff !== pk.a ? `remp. de ${esc(nameOf(pk.a))} · ` : ''}<b>${esc(how)}</b> · ${sc > 0 ? '+' : ''}${sc} pt${Math.abs(sc) > 1 ? 's' : ''} · <u>résultat</u></button>`;
  }
  /** Titulaires qui ne prennent pas le départ : remplaçant du joueur, ou tirage au sort s'il n'en a pas (ou s'il est lui aussi absent). */
  /** Tirages au sort possibles dès la fin de la 1re manche : graine = temps du vainqueur de la 1re manche (publié avant la 2e), 30 premiers dossards. */
  function liveDraws(race, lv) {
    const sl = startListOf(race); if (!sl) return {};
    const fake = [];
    state.players.forEach((p) => { const pk = (state.picks[p.id] || {})[race.id]; if (pk && pk.a) [pk.a, pk.b].forEach((a) => { if (a && lv.dns(a) && !fake.some((x) => x.ath === a)) fake.push({ ath: a, status: 'DNS' }); }); });
    if (!fake.length) return {};
    const picks = {}; state.players.forEach((p) => { picks[p.id] = Object.assign({}, state.picks[p.id]); if (picks[p.id][race.id]) picks[p.id][race.id] = Object.assign({}, picks[p.id][race.id], { d: undefined }); });
    const d = G.autoDraws(Object.assign({}, state.results, { [race.id]: fake }), { [race.id]: { start: sl.rows.filter((r) => r.ath).map((r) => ({ bib: r.bib, ath: r.ath })) } }, picks);
    return d[race.id] || {};
  }
  function dnsNote(race, lv) {
    const rows = [], dr = lv._dr || (lv._dr = liveDraws(race, lv));
    state.players.forEach((p) => {
      const pk = (state.picks[p.id] || {})[race.id]; if (!pk || !pk.a || !lv.dns(pk.a)) return;
      const rep = pk.b && !lv.dns(pk.b) ? pk.b : null;
      rows.push(`<li><strong>${skn(pk.a)}</strong> : ${pln(p)} → ${rep ? `remplaçant <strong>${skn(rep)}</strong>` : dr[p.id] ? `pas de remplaçant valable : <strong>tirage au sort → ${skn(dr[p.id].ath)}</strong> <span class="sub">(1 sur ${dr[p.id].n} candidats, d’après la liste de départ)</span>` : '<strong>pas de remplaçant valable : tirage au sort</strong>'}</li>`);
    });
    return rows.length ? `<p class="livenote__b livenote__b--dns">🚫 <strong>Non-partant${rows.length > 1 ? 's' : ''}</strong> (absent${rows.length > 1 ? 's' : ''} de la liste de départ, pas de bulle) :</p><ul class="livenote__l">${rows.join('')}</ul>` : '';
  }
  /** Avant la 1re manche (liste de départ publiée, pas encore de classement) : seulement les non-partants et leur tirage. */
  function preLive(race) {
    const sl = startListOf(race); if (!sl || resOf(race)) return null;
    const starters = new Set(sl.rows.map((r) => r.ath).filter(Boolean));
    return { L: {}, by: {}, dns: (a) => starters.size > 0 && !starters.has(a) };
  }
  function liveNote(race) {
    let lv = liveOf(race);
    if (!lv) { const pre = preLive(race); const n = pre ? dnsNote(race, pre) : ''; return n ? `<div class="livenote">${n}</div>` : ''; }
    const { picks } = racePeople(race), hit = picks.filter((x) => lv.by[x.ath] && lv.by[x.ath].out);
    const upd = new Date(lv.L.fetched);
    return `<div class="livenote"><p><strong>1re manche terminée</strong>${lv.L.run2 ? ` · 2e manche à <strong>${hm(lv.L.run2)}</strong>` : ''} <span class="livenote__t">(mis à jour à ${F_HM.format(upd)})</span></p>
      ${dnsNote(race, lv)}${hit.length ? `<p class="livenote__b">⚠ <strong>Bulle${hit.length > 1 ? 's' : ''} actée${hit.length > 1 ? 's' : ''}</strong> : non qualifié${hit.length > 1 ? 's' : ''} pour la 2e manche, 0 point.</p><ul class="livenote__l">${Object.entries(hit.reduce((m, x) => { (m[x.ath] = m[x.ath] || []).push(x.p); return m; }, {})).map(([a, ps]) => `<li><strong>${skn(a)}</strong> : ${ps.map(pln).join(', ')}</li>`).join('')}</ul>` : '<p class="livenote__b livenote__b--ok">Aucune bulle : tous les choix passent en 2e manche.</p>'}</div>`;
  }
  /** Rang du skieur dans le résultat officiel, mis en valeur (rouge si DNF, DNQ, hors top 30) + points qu'il rapporte. */
  function skierResult(race, a, res) {
    const e = res.find((x) => x.ath === a);
    if (!e) return ` <span class="rk rk--bad">hors classement</span>`;
    if (e.status === 'DNS') return ` <span class="rk rk--dns">Non partant</span>`;
    if (e.status) return ` <span class="rk rk--bad">${esc(e.status)}</span><span class="rkpts rkpts--0">0 pt</span>`;
    const pts = G.racePoints(race, e.rank) * race.mult, out = e.rank > 30;
    return ` <span class="rk ${out ? 'rk--bad' : e.rank <= 3 ? 'rk--top' : e.rank <= 10 ? 'rk--good' : ''}">${out ? 'hors top 30 · ' : ''}${esc(ordinal(e.rank))}</span><span class="rkpts ${pts > 0 ? 'rkpts--on' : 'rkpts--0'}">${pts > 0 ? '+' : ''}${pts} pt${Math.abs(pts) > 1 ? 's' : ''}</span>`;
  }
  function shareTable(race) {
    const { picks, cnt } = racePeople(race), N = picks.length;
    if (!N) return '<span class="none">Aucun choix</span>';
    const mine = picks.find((x) => x.p.id === state.me), res = resOf(race);
    const rows = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || nameOf(a).localeCompare(nameOf(b)));
    const max = Math.max(...Object.values(cnt));
    const lv = liveOf(race) || preLive(race);
    const how = (a) => { if (res) return skierResult(race, a, res); if (lv) return liveChip(lv, a, race); return ''; };
    const pts = mine ? ptsChip(state.me, race) : '';
    return `<ul class="gauges sh">${rows.map((a) => gauge(a, Math.round(100 * cnt[a] / max), (mine && mine.ath === a ? ' <em class="sh__me">ton choix</em>' : '') + how(a), mine && mine.ath === a ? 'gauge--mine' : '', `${cnt[a]} joueur${cnt[a] > 1 ? 's' : ''}`)).join('')}</ul>
      <p class="sub sh__foot">${N} joueur${N > 1 ? 's ont validé leur choix' : ' a validé son choix'}${mine ? '' : ' (pas toi : aucun choix)'}${pts ? ` · tes points ${pts}` : ''}</p>`;
  }
  /** Course terminée : le résultat (podium + tous les skieurs choisis), même présentation que les jauges. Noms des joueurs si peu nombreux, sinon « N joueurs » cliquable. */
  function resultTable(race) {
    const { picks, cnt } = racePeople(race), N = picks.length, res = resOf(race);
    if (!N || !res) return shareTable(race);
    const mine = picks.find((x) => x.p.id === state.me);
    const rk = (a) => { const e = res.find((x) => x.ath === a); return e && !e.status ? e.rank : e ? 1e4 : 2e4; };
    const ids = Array.from(new Set(res.filter((e) => !e.status && e.rank <= 3).map((e) => e.ath).concat(Object.keys(cnt))));
    ids.sort((a, b) => rk(a) - rk(b) || (cnt[b] || 0) - (cnt[a] || 0) || nameOf(a).localeCompare(nameOf(b)));
    const who = (a) => picks.filter((x) => x.ath === a).map((x) => x.p);
    const row = (a) => {
      const ps = who(a), n = ps.length, isMine = !!mine && mine.ath === a;
      const det = n ? `<span class="rs__n">${n} joueur${n > 1 ? 's' : ''}</span><span class="rs__ps">${ps.map(pln).join(', ')}</span>` : '<span class="rs__none">personne</span>';
      return `<li class="rs${isMine ? ' rs--mine' : ''}${n ? '' : ' rs--nop'}"><span class="rs__who">${avatarOf(a, 'sm')}<span class="gauge__t"><span class="gauge__n">${skn(a)}</span><span class="gauge__x">${isMine ? '<em class="sh__me">ton choix</em>' : ''}${skierResult(race, a, res)}</span></span></span><span class="rs__d">${det}</span></li>`;
    };
    const pts = mine ? ptsChip(state.me, race) : '';
    return `<ul class="gauges sh rs__l">${ids.map(row).join('')}</ul>
      <p class="sub sh__foot">${N} joueur${N > 1 ? 's ont validé leur choix' : ' a validé son choix'}${mine ? '' : ' (pas toi : aucun choix)'}</p>`;
  }
  const LOCK_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" fill="currentColor" fill-opacity=".18"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></svg>';
  const FLAG_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h13l-2.5 4 2.5 4H5" fill="currentColor" fill-opacity=".2"/></svg>';
  const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  /** Cartouche d'une course : une info par ligne (sauf « discipline + genre »), bouton « Voir plus… » dessous. */
  function raceCard(race, opts) {
    opts = opts || {};
    const done = !race.cancelled && !!resOf(race), start = G.raceStart(race);
    const wait = !opts.noWait && !done && start <= now() ? '<span class="rcard__st rcard__st--wait">Résultat en attente</span>' : '';
    return `<div class="rcard rcard--${race.gender}">
      <span class="rcard__date">${esc(dayOf(race.date))}</span>
      <strong class="rcard__place">${fl(placeLabel(race))}</strong>
      <span class="rcard__race">${discBadge(race)} <span class="gender gender--${race.gender}">${genderLabel(race)}</span></span>
      <span class="rcard__time">Départ ${esc(hourText(start))}</span>${wait}${opts.extra ? `<span class="rcard__x">${opts.extra}</span>` : ''}
      ${race.cancelled || !lockedRace(race) ? '' : `<button type="button" class="morebtn" data-racecard="${race.id}">${done ? 'Résultat détaillé' : 'Stats'}</button>`}${!done && !race.cancelled && liveOf(race) ? `<button type="button" class="morebtn morebtn--sl" data-run1="${race.id}">Résultats 1re manche</button>` : !done && !race.cancelled && startListOf(race) ? `<button type="button" class="morebtn morebtn--sl" data-startlist="${race.id}">Start list</button>` : ''}</div>`;
  }
  function liveRaceRow(race) {
    return `<li class="race race--live race--${race.gender}${race.cancelled ? ' race--off' : ''}${doneCls(race)}">
      <div class="race__left">${raceCard(race)}${resOf(race) && !race.cancelled && ptsChip(state.me, race) ? `<p class="race__pts">Tes points ${ptsChip(state.me, race)}</p>` : ''}</div>
      <div class="race__pick">${race.cancelled ? '<span class="none">Course annulée</span>' : lockedRace(race) ? liveNote(race) + (resOf(race) ? resultTable(race) : shareTable(race)) : ''}</div></li>`;
  }
  function coursPanel(s) {
    const races = sortedRaces(s);
    const mine = active(races).map((r) => {
      const pk = (state.picks[state.me] || {})[r.id];
      const eff = pk && pk.a ? G.effectiveAthlete(pk, state.results, r.id) : null;
      let tail = '';
      if (eff && resOf(r)) {
        const e = resOf(r).find((x) => x.ath === eff), sc = G.scoreRace(r, pk, state.results) || 0;
        const how = e ? (e.status || ordinal(e.rank)) : 'non classé', bad = !e || !!e.status || e.rank > 30;
        tail = `${eff !== pk.a ? `<span class="sub">remp. de ${skn(pk.a)}</span>` : ''}<span class="lb__rk${bad ? ' lb__rk--bad' : ''}" data-racecard="${r.id}">${FLAG_SVG}<span>Classement</span> <b>${esc(how)}</b></span><button type="button" class="lb__pts ${sc > 0 ? 'lb__pts--pos' : 'lb__pts--neg'}" data-racecard="${r.id}" title="Voir le résultat complet">${sc > 0 ? '+' : ''}${sc} pt${Math.abs(sc) > 1 ? 's' : ''}</button>`;
      } else if (eff) tail = liveChip(liveOf(r), eff);
      return `<li class="lb lb--${r.gender}"><span class="lb__tag">${discBadge(r)} <span class="gender gender--${r.gender}">${genderLabel(r)}</span></span>${eff ? `<strong>${skn(eff)}</strong>${tail}` : '<span class="none">aucun choix</span>'}</li>`;
    }).join('');
    const todo = races.filter((r) => !resOf(r)), done = races.filter((r) => resOf(r)).sort((a, b) => G.raceStart(b) - G.raceStart(a));
    return `<section>
      <div class="lockbar"><div class="lockbar__t"><strong>${fl(s.name)}</strong><span class="lock" role="img" aria-label="Choix verrouillés" title="Choix verrouillés">${LOCK_SVG}</span></div>
        <ul class="lockbar__mine" aria-label="Mes choix">${mine}</ul></div>
      <h3 class="subtitle">${done.length ? 'Courses à venir' : 'Qui a pris qui'}</h3>
      ${todo.length ? `<div class="session"><ul class="races">${todo.map((r) => liveRaceRow(r)).join('')}</ul></div>` : '<p class="hint">Toutes les courses sont terminées.</p>'}
      ${done.length ? `<h3 class="subtitle">Courses passées</h3><div class="session"><ul class="races">${done.map((r) => liveRaceRow(r)).join('')}</ul></div>` : ''}
    </section>`;
  }
  /** Coup à contre-courant : un skieur choisi par une minorité de joueurs (pas le plus choisi) et qui a pourtant marqué gros. */
  function bestContrarian(s) {
    let best = null;
    active(sortedRaces(s)).forEach((r) => {
      if (!resOf(r)) return;
      const { picks, cnt, max } = racePeople(r), N = picks.length;
      Object.keys(cnt).forEach((a) => {
        if (cnt[a] >= max || cnt[a] / N > 0.5) return;
        const who = picks.filter((x) => x.ath === a).map((x) => x.p);
        const pts = G.scoreRace(r, (state.picks[who[0].id] || {})[r.id], state.results) || 0;
        if (pts <= 0) return;
        const score = pts * (1 - cnt[a] / N);
        if (!best || score > best.score || (score === best.score && cnt[a] < best.n)) best = { score, race: r, ath: a, who, n: cnt[a], N, pts, top: max };
      });
    });
    return best;
  }
  function termineePanel(hm) {
    const s = hm.session, R = state.results;
    if (!state.demo && !LS.get('skigame.seen.' + s.id)) LS.set('skigame.seen.' + s.id, String(now().getTime()));
    const races = sortedRaces(s), live = active(races);
    const rows = rankRows((pk) => ({ total: G.sessionScore(s, pk, R) }));
    const me = rows.find((r) => r.p.id === state.me);
    const R0 = Object.assign({}, R); s.races.forEach((id) => { delete R0[id]; });
    let move = '';
    if (Object.keys(R0).length) {
      const before = rankRows((pk) => G.generalScore(pk, R0)).find((r) => r.p.id === state.me);
      const after = rankRows((pk) => G.generalScore(pk, R)).find((r) => r.p.id === state.me);
      if (before && after) { const d = before.rank - after.rank; move = d > 0 ? `<span class="mv mv--up">▲ ${d}</span>` : d < 0 ? `<span class="mv mv--dn">▼ ${-d}</span>` : '<span class="mv">=</span>'; }
    }
    const gen = rankRows((pk) => G.generalScore(pk, R)).find((r) => r.p.id === state.me);
    const podium = rows.filter((r) => r.rank <= 3).slice(0, 5).map((r) => `<li><span class="rnk rnk--${r.rank}">${r.rank}</span>${pname(r.p)}<b>${r.v.total} pts</b></li>`).join('');
    const bc = bestContrarian(s);
    const bcHtml = bc ? `<div class="bilan__card"><h4>Le coup à contre-courant</h4><p><span class="wp__sk">${avatarOf(bc.ath, 'sm')}<b>${skn(bc.ath)}</b></span> à ${fl(placeLabel(bc.race))} ${discBadge(bc.race)}<span class="gender gender--${bc.race.gender}">${genderLabel(bc.race)}</span></p>
      <p class="sub">Choisi par ${esc(bc.who.map((p) => p.name).join(', '))} seulement (${bc.n} sur ${bc.N}), alors que ${bc.top} joueurs en avaient pris un autre. Résultat : +${bc.pts} points.</p></div>` : '';
    const nx = hm.next;
    const nxHtml = nx
      ? `<div class="bilan__next"><div><span class="forfait__label">Prochaine session</span><h3 class="forfait__name">${fl(nx.name)}</h3><p class="sub">Deadline ${esc(dlShort(G.sessionDeadline(nx)))} · <span class="countdown countdown--inline">${countdownText(G.sessionDeadline(nx))}</span></p></div>
        <button type="button" class="btn btn--brique" data-skip="${s.id}">Voir la session à venir</button></div>`
      : '<p class="hint">C’est la dernière session de la saison.</p>';
    return `<section>
      <article class="forfait"><div class="forfait__main"><span class="state state--terminée">Terminée</span><h2 class="forfait__name">${fl(s.name)}</h2><p class="forfait__where">${plural(live.length, 'course', 'courses')}</p></div>
        <div class="forfait__stub"><p class="forfait__label">Mes points</p><p class="count count--pts big">${me ? me.v.total : 0} pts</p><p class="forfait__dl">${me && me.v.total ? ordinal(me.rank) + ' de la session' : ''}</p></div></article>
      <div class="bilan">
        <div class="bilan__card"><h4>Gros globe</h4><p class="bilan__big">${gen ? ordinal(gen.rank) : '–'} ${move}</p><p class="sub">${gen ? gen.v.total + ' pts' : ''}${move ? ' · évolution depuis cette session' : ''}</p></div>
        <div class="bilan__card"><h4>Podium de la session</h4><ol class="podium">${podium}</ol></div>
        ${bcHtml}
      </div>
      <h3 class="subtitle">Course par course</h3>
      <div class="session"><ul class="races">${races.slice().sort((a, b) => (resOf(b) ? 1 : 0) - (resOf(a) ? 1 : 0) || G.raceStart(b) - G.raceStart(a)).map((r) => raceRow(r, s)).join('')}</ul></div>
      ${nxHtml}
    </section>`;
  }

  /* ---------- Session à venir (forfait) ---------- */
  function nextPanel() {
    const hm = homeMode();
    if (hm.kind === 'cours') return coursPanel(hm.session);
    if (hm.kind === 'fin') return termineePanel(hm);
    const up = hm.session;
    if (!up) return '<p class="empty">La saison est terminée.</p>';
    const isW = up.id === 'X';
    const races = sortedRaces(up);
    const dl = G.sessionDeadline(up);
    const live = active(races);
    const open = live.some((r) => !lockedRace(r));
    const n = confirmedN(live), nd = draftN(live);
    const inDesk = D.SESSIONS.filter((s) => s.desk === up.desk);
    const where = isW ? 'Hors desk, barème ×3' : `Desk ${up.desk}, session ${inDesk.indexOf(up) + 1} sur ${inDesk.length}`;
    const goto = isW ? 0 : up.desk;
    const list = races.map((r) => {
      const d = at(r.date);
      return `<li class="mini">
        <span class="mini__when"><b>${F_NUM.format(d)}</b> ${F_MO.format(d)}</span>
        <span class="mini__what"><strong class="mini__place">${fl(placeLabel(r))}</strong><span class="mini__tags">${discBadge(r)}<span class="gender gender--${r.gender}">${genderLabel(r)}</span></span></span>
        <span class="mini__pick">${r.cancelled ? '<span class="none">Annulée</span>' : (myPicks()[r.id] || {}).a ? `${pickSummary(state.me, r)}${isDraft(myPicks()[r.id], r) ? '<span class="draftflag">📝 brouillon</span>' : ''}` : '<span class="todo">À choisir</span>'}${r.cancelled ? '' : slLink(r)}</span></li>`;
    }).join('');
    const stub = open
      ? `<p class="forfait__label">Deadline dans ${info('Tes choix se modifient librement jusqu’au départ de la première course de la session. Ensuite ils sont verrouillés, et les choix de tous les joueurs deviennent visibles.')}</p><p class="countdown" id="countdown" data-dl="${dl.toISOString()}">${countdownText(dl)}</p><p class="forfait__dl">${dlShort(dl)}</p>${remindBtn(up)}`
      : `<p class="forfait__label">Choix verrouillés</p><p class="countdown countdown--shut">Course en cours</p><p class="forfait__dl">depuis ${dlShort(dl)}</p>`;
    const cta = open ? (n === live.length ? 'Modifier mes choix' : 'Faire mes choix') : 'Voir le desk';
    return `<section>
      ${hm.back ? `<p class="backlink"><button type="button" class="linkbtn" data-unskip="${hm.back.id}">← Revoir la dernière session (${esc(hm.back.name)})</button></p>` : ''}
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
  /** Pastille de rang : 1-3 en médaille, 4 à 10 cerclés (sans fond), au-delà rien. */
  const rnkCell = (rk) => `<span class="rnk rnk--${rk <= 3 ? rk : rk <= 10 ? 'c' : 'n'}">${rk}</span>`;
  function rankRows(scoreFn) {
    const rows = state.players.map((p) => ({ p, v: scoreFn(state.picks[p.id] || {}) })).sort((a, b) => b.v.total - a.v.total);
    let last = null, rank = 0;
    rows.forEach((r, i) => { if (r.v.total !== last) { rank = i + 1; last = r.v.total; } r.rank = rank; });
    return rows;
  }
  /** Classement simple. photo=false : sans photo de profil (classements des desks). */
  function smallRanking(title, scoreFn, cls, photo, scope) {
    const rows = rankRows((pk) => ({ total: scoreFn(pk) }));
    const xb = SHARE.xbar({ key: 'cl:' + title, title, sub: 'Ski Game · Coupe du monde 2026-27', unit: ' pts', head: ['Rang', 'Joueur', 'Points'], rows: rows.map((r) => ({ c: [String(r.rank), r.p.name, String(r.v.total)], me: r.p.id === state.me })) });
    return `<div class="tablewrap"><table class="grid grid--rank ${cls || ''}"><caption>${esc(title)}${xb}</caption>
      <thead><tr><th scope="col" class="num">Rang</th><th scope="col">Joueur</th><th scope="col" class="num">Points</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num">${rnkCell(r.rank)}</td><th scope="row">${photo === false ? pln(r.p) : pname(r.p)}</th><td class="num">${ptsBtn(r.v.total, scope, r.p.id)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  /** Nombre de points cliquable : ouvre le détail course par course. */
  const ptsBtn = (v, scope, pid) => (scope && v ? `<button type="button" class="numbtn" data-bd="${esc('pts|' + pid + '|' + scope)}" title="Voir le détail">${v}</button>` : v);
  /** Détail des points d'un joueur sur un périmètre : total, desk, Mondiaux (bonus compris) ou discipline. */
  function pointsModal(pid, scope) {
    const p = state.players.find((x) => x.id === pid); if (!p) return;
    const R = state.results, inScope = (r) => scope === 'tot' || (scope === 'w' ? r.kind === 'mondial' : scope.startsWith('disc:') ? r.disc === scope.slice(5) : scope.startsWith('d') ? (r.kind !== 'mondial' && String((sessionOf(r) || {}).desk) === scope.slice(1)) : false);
    const rows = playerRows(pid).filter((x) => inScope(x.r));
    const label = scope === 'tot' ? 'Gros globe' : scope === 'w' ? 'Mondiaux' : scope.startsWith('disc:') ? 'Petit globe : ' + D.DISC[scope.slice(5)].fr : 'Desk ' + scope.slice(1);
    const li = rows.map((x) => `<li class="dtl"><span class="dtl__r"><strong>${fl(placeLabel(x.r))}</strong> <span class="sub">${esc(raceName(x.r))} · ${esc(dayOf(x.r.date))}</span></span><span class="dtl__a">${x.has ? skn(x.eff) + (x.how ? ` <em class="sub">(${x.how})</em>` : '') : '<span class="none">Pas de choix</span>'}</span><span class="dtl__k ${x.pts > 0 ? '' : 'bad'}">${x.e ? esc(x.e.status || ordinal(x.e.rank)) : ''} <b>${x.pts > 0 ? '+' : ''}${x.pts}</b></span></li>`).join('');
    const bonus = (scope === 'w' || scope === 'tot') ? G.worldsBonus(state.picks[pid] || {}, R).lines : [];
    const bl = bonus.map((b) => `<li class="dtl"><span class="dtl__r"><strong>Bonus Mondiaux</strong> <span class="sub">${esc(b.label)}</span></span><span class="dtl__a"></span><span class="dtl__k"><b>+${b.pts}</b></span></li>`).join('');
    const total = rows.reduce((a, x) => a + x.pts, 0) + bonus.reduce((a, b) => a + b.pts, 0);
    openModal(`<h2>${esc(p.name)} · ${esc(label)}</h2><ul class="dtls">${li}${bl || ''}${!li && !bl ? '<li class="none">Aucun point.</li>' : ''}</ul><p class="dtl__tot">Total : <b>${total} pts</b></p>`);
  }
  /** Classement par compteur : rows = [{ p, v, sub }], déjà classées. */
  function countRanking(title, rows, unit, cls, note) {
    const xb = SHARE.xbar({ key: 'cr:' + title, title, sub: 'Ski Game · Coupe du monde 2026-27', head: ['Rang', 'Joueur', unit], rows: rows.map((r) => ({ c: [String(r.rank), r.p.name + (r.sub ? ' ' + r.sub : ''), String(r.v)], me: r.p.id === state.me })) });
    return `<div class="tablewrap"><table class="grid grid--rank ${cls || ''}"><caption>${esc(title)}${note ? ' ' + info(note) : ''}${xb}</caption>
      <thead><tr><th scope="col" class="num">Rang</th><th scope="col">Joueur</th><th scope="col" class="num">${esc(unit)}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num">${rnkCell(r.rank)}</td><th scope="row">${pln(r.p)}${r.sub ? `<span class="sub"> ${esc(r.sub)}</span>` : ''}</th><td class="num total">${r.v && r.bd ? `<button type="button" class="numbtn" data-bd="${esc(r.bd)}" title="Voir le détail">${r.v}</button>` : r.v}</td></tr>`).join('')}</tbody></table></div>
`;
  }
  /** Fenêtre de détail d'un compteur : bulles, victoires ou plus longue série d'un joueur. */
  function detailModal(spec) {
    if (spec.startsWith('pts|')) { const [, pp, sc] = spec.split('|'); pointsModal(pp, sc); return; }
    const [kind, pid, sid] = spec.split('|'), p = state.players.find((x) => x.id === pid); if (!p) return;
    const evs = SKI_STATS.events(state, G, state.results), mine = evs.filter((e) => e.p.id === pid);
    let list, title;
    if (kind === 'bub') { list = mine.filter((e) => e.bubble); title = `Bulles de ${p.name}`; }
    else if (kind === 'win') { list = mine.filter((e) => e.win); title = `Victoires de ${p.name}`; }
    else { const sd = SKI_STATS.STREAKS.find((x) => x.id === sid); list = SKI_STATS.longestRun(mine, sd.f); title = `${sd.label} : meilleure série de ${p.name}`; }
    const li = list.map((e) => `<li class="dtl"><span class="dtl__r"><strong>${fl(placeLabel(e.race))}</strong> <span class="sub">${esc(raceName(e.race))} · ${esc(dayOf(e.race.date))}</span></span><span class="dtl__a">${skn(e.eff)}${e.eff !== e.pk.a ? ' <em class="sub">(remplaçant)</em>' : ''}</span><span class="dtl__k ${e.bubble ? 'bad' : ''}">${e.status ? esc(e.status) : e.rank ? esc(ordinal(e.rank)) : '–'} <b>${e.pts > 0 ? '+' : ''}${e.pts}</b></span></li>`).join('');
    openModal(`<h2>${esc(title)}</h2><ul class="dtls">${li || '<li class="none">Aucun.</li>'}</ul>`);
  }
  function generalPanel() {
    const R = state.results, sub = state.gsub || 'globes';
    const seg = `<div class="seg gseg" role="tablist" aria-label="Classements">${[['globes', 'Globes'], ['bonus', 'Bulles et victoires'], ['series', 'Séries']].map(([id, l]) => `<button type="button" role="tab" class="seg__btn" aria-selected="${sub === id}" data-gsub="${id}">${l}</button>`).join('')}</div>`;
    const none = Object.keys(R).length === 0 ? '<p class="hint">Aucun résultat pour l’instant.</p>' : '';
    let body = '';
    if (sub === 'globes') {
      const rows = rankRows((pk) => G.generalScore(pk, R));
      const xbGG = SHARE.xbar({ key: 'cl:gros-globe', title: 'Le gros globe', sub: 'Ski Game · Coupe du monde 2026-27', unit: ' pts', head: ['Rang', 'Joueur', 'Total', 'Desk 1', 'Desk 2', 'Desk 3', 'Mondiaux'], rows: rows.map((r) => ({ c: [String(r.rank), r.p.name, String(r.v.total)].concat(r.v.desks.map(String), [String(r.v.worlds)]), me: r.p.id === state.me })) });
      const main = `${SHARE.fsOpen()}<div class="tablewrap"><table class="grid grid--rank grid--general cap--gen"><caption>Le gros globe ${info('Classement général : somme des points des trois desks et des Mondiaux, bonus compris.')}${xbGG}</caption>
        <thead><tr><th scope="col" class="num">Rang</th><th scope="col">Joueur</th><th scope="col" class="num th--tot">Total</th><th scope="col" class="num th--d1">Desk 1</th><th scope="col" class="num th--d2">Desk 2</th><th scope="col" class="num th--d3">Desk 3</th><th scope="col" class="num th--w">Mondiaux</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num">${rnkCell(r.rank)}</td><th scope="row">${pname(r.p)}</th><td class="num total">${ptsBtn(r.v.total, 'tot', r.p.id)}</td>${r.v.desks.map((d, i) => `<td class="num">${ptsBtn(d, 'd' + D.DESKS[i].id, r.p.id)}</td>`).join('')}<td class="num">${ptsBtn(r.v.worlds, 'w', r.p.id)}</td></tr>`).join('')}</tbody></table></div></div>
`;
      const discs = ['DH', 'SG', 'GS', 'SL'].map((c) => smallRanking(`Petit globe de ${c === 'SG' ? 'super-G' : D.DISC[c].fr.toLowerCase()}`, (pk) => G.disciplineScore(c, pk, R), 'cap--' + c, undefined, 'disc:' + c)).join('');
      const dk = (d) => smallRanking(`Classement du ${d.name}`, (pk) => G.deskScore(d.id, pk, R), 'cap--d' + d.id, false, 'd' + d.id);
      const wk = smallRanking('Classement des Mondiaux', (pk) => G.worldsScore(pk, R).total, 'cap--w', false, 'w');
      body = `${main}<h3 class="subtitle">Petits globes</h3><div class="grid2">${discs}</div>
        <h3 class="subtitle">Par desk</h3><div class="grid2">${dk(D.DESKS[0])}${dk(D.DESKS[1])}</div><div class="grid2">${wk}${dk(D.DESKS[2])}</div>`;
    } else {
      const evs = SKI_STATS.events(state, G, R), tot = SKI_STATS.totals(state, evs);
      if (sub === 'bonus') {
        const bub = SKI_STATS.rank(tot.map((t) => ({ p: t.p, v: t.bubbles, sub: `sur ${t.n}`, bd: `bub|${t.p.id}` })), (r) => r.v, true);
        const win = SKI_STATS.rank(tot.map((t) => ({ p: t.p, v: t.wins, sub: `sur ${t.n}`, bd: `win|${t.p.id}` })), (r) => r.v);
        body = `<div class="grid2">${countRanking('Classement des bulles', bub, 'Bulles', 'cap--bub', 'Une bulle : ton skieur fait 0 point (DNF, DNQ, disqualifié ou hors des 30 premiers). Un DNS n’en est pas une. Le premier est le joueur qui en a subi le moins.')}
          ${countRanking('Classement des victoires', win, 'Victoires', 'cap--vic', 'Nombre de fois où le skieur que tu avais choisi a gagné la course.')}</div>`;
      } else {
        const st = SKI_STATS.streaks(evs);
        body = `<p class="hint">Plus longue série de courses consécutives de l’hiver. Une course sans choix, ou un échec, interrompt la série.</p><div class="grid2">${SKI_STATS.STREAKS.map((sd) => countRanking(sd.label, SKI_STATS.rank(state.players.map((p) => ({ p, v: (st[p.id] || {})[sd.id] ? st[p.id][sd.id].best : 0, bd: `st|${p.id}|${sd.id}`, sub: (st[p.id] && st[p.id][sd.id] && st[p.id][sd.id].now) ? `(en cours : ${st[p.id][sd.id].now})` : '' })), (r) => r.v), 'Série', 'cap--st')).join('')}</div>`;
      }
    }
    return `<section class="genpanel"><header class="deskhead"><div><h2>Classements</h2>
      <p class="deskhead__meta">Général : trois desks et les Mondiaux, bonus compris</p></div></header>${none}<div class="deskbar">${seg}</div>${body}</section>`;
  }

  /* ---------- Navigation & rendu ---------- */
  function tabs() {
    const hk = homeMode().kind;
    const label = hk === 'cours' ? 'En cours' : hk === 'fin' ? 'Dernière session' : 'Session à venir';
    return [
      { id: 'next', label, note: '' },
      { id: '1', label: 'Desk 1', note: `${dmOf(D.DESKS[0].from)} au ${dmOf(D.DESKS[0].to)}` },
      { id: '2', label: 'Desk 2', note: `${dmOf(D.DESKS[1].from)} au ${dmOf(D.DESKS[1].to)}` },
      { id: 'w', label: 'Mondiaux', note: '04/02 au 14/02' },
      { id: '3', label: 'Desk 3', note: `${dmOf(D.DESKS[2].from)} au ${dmOf(D.DESKS[2].to)}` },
      { id: 'gen', label: 'Classements', note: '' },
    ].concat([{ id: 'data', label: 'Data room', note: '' }]);
  }
  const TAB_IDS = ['next', '1', '2', 'w', '3', 'gen', 'data', 'adm'];
  /** Pictos des onglets (affichés sur mobile à la place des libellés longs). */
  const TAB_ICO = {
    home: '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    next: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/>',
    1: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.6" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor" stroke="none">1</text>',
    2: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.6" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor" stroke="none">2</text>',
    3: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="16.6" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor" stroke="none">3</text>',
    w: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c3.2 3 3.2 14 0 17c-3.2-3-3.2-14 0-17z"/>',
    data: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9.5 4v16M15 9.5v10.5"/>',
    gen: '<path d="M3 20.5h18"/><rect x="9" y="7.5" width="6" height="13"/><rect x="3" y="13" width="6" height="7.5"/><rect x="15" y="15.5" width="6" height="5"/>',
  };
  const TAB_SHORT = { next: 'À venir', 1: 'Desk 1', 2: 'Desk 2', w: 'WCh', 3: 'Desk 3', gen: 'Général', data: 'Data' };
  function renderTabs() {
    $('#tabs').innerHTML = tabs().map((t) => {
      const short = t.id === 'next' && /en cours/.test(t.label) ? 'En cours' : t.id === 'next' && /Dernière/.test(t.label) ? 'Terminée' : TAB_SHORT[t.id];
      return `<button type="button" role="tab" class="plate plate--${t.id}" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${state.tab === t.id}" aria-label="${esc((t.id === 'next' && t.label === 'En cours' ? 'Session en cours' : t.label) + (t.note ? ', ' + t.note : ''))}">
      <svg class="plate__ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TAB_ICO[t.id === 'next' && /En cours/.test(t.label) ? 'home' : t.id]}</svg><span class="plate__short">${short}</span>
      <span class="plate__label">${t.id === 'next' && /En cours/.test(t.label) ? `<svg class="plate__home" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICO.home}</svg> ` : ''}${t.label}</span>${t.note ? `<span class="plate__note">${t.note}</span>` : ''}</button>`;
    }).join('');
  }

  /* ---------- Règles, boîte à idées, bulles d'aide ---------- */
  function rulesHtml() {
    return `<div class="rules">
      <h3>Le principe</h3>
      <p>À chaque course de la Coupe du Monde, tu choisis <strong>un skieur</strong> (et, si tu veux, un remplaçant). Il te rapporte les points de la Coupe du Monde : <strong>100 pour le 1er, 80, 60, 50, 45…</strong> jusqu’à 1 point pour le 30e. <strong>Aux finales</strong>, seuls les <strong>15 premiers</strong> marquent des points.</p>
      <h3>L’organisation</h3>
      <ul>
        <li><strong>3 desks</strong> (octobre-décembre, janvier, février-mars) et les <strong>Mondiaux</strong> de Crans-Montana, soit une vingtaine de sessions. Chaque session regroupe quelques courses.</li>
        <li>Messieurs et dames sont chacun à part : un choix par course.</li>
        <li>Slalom et géant : classement cumulé des deux manches. Chaque descente compte comme une course. Les épreuves par équipes sont exclues.</li>
        <li><strong>Finales ×2</strong> (seuls les 15 premiers marquent) et <strong>Mondiaux ×3</strong> (avec un bonus si tes choix gagnent).</li>
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
  function openModal(html, cls) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal__card${cls ? ' ' + cls : ''}" role="dialog" aria-modal="true"><button type="button" class="modal__x" data-close aria-label="Fermer">×</button>${html}</div>`;
    m.hidden = false; document.body.classList.add('noscroll');
    const f = m.querySelector('textarea, button:not(.modal__x)'); if (f) f.focus({ preventScroll: true });
  }
  const slLink = (race) => (liveOf(race) && !resOf(race) ? `<button type="button" class="linkbtn slbtn" data-run1="${race.id}">Résultats de la 1re manche</button>` : startListOf(race) && !resOf(race) ? `<button type="button" class="linkbtn slbtn" data-startlist="${race.id}">Consulter la start list</button>` : '');
  /** Fenêtre « start list » : dossards, noms et nations lus sur la page FIS. On peut y choisir son skieur (et son remplaçant) tant que la session est ouverte ;
      le choix déjà fait est mis en évidence et peut être retiré puis changé. */
  /** Fenêtre « résultats de la 1re manche » : classement provisoire (qualifiés, DNQ, DNF) avec les joueurs qui ont pris chaque skieur ; export des seuls skieurs choisis. */
  function run1Modal(raceId) {
    const race = G.raceOf(raceId), lv = race && liveOf(race), sl = race && startListOf(race);
    if (!lv || !sl) return;
    const L = lv.L, bibAth = {}; sl.rows.forEach((r) => { if (r.ath) bibAth[r.bib] = r.ath; });
    const { picks } = racePeople(race), who = {}; picks.forEach((x) => { (who[x.ath] = who[x.ath] || []).push(x.p); });
    const items = (L.rows || []).map((r) => ({ lead: String(r.rank), name: r.name, time: r.time, ath: bibAth[r.bib], out: false }))
      .concat((L.out || []).filter((r) => r.status !== 'DNS').map((r) => ({ lead: r.status, name: r.name, time: r.time || '', ath: bibAth[r.bib], out: true })));
    const seen = new Set(items.map((x) => x.ath).filter(Boolean));
    Object.keys(who).forEach((a) => { if (!seen.has(a)) items.push({ lead: lv.dns(a) ? 'DNS' : '–', name: nameOf(a), time: '', ath: a, out: true }); });
    const mineIds = new Set(); const pk = (myPicks()[race.id] || {}); [pk.a, pk.b].forEach((a) => a && mineIds.add(a));
    const li = items.map((x) => {
      const ps = x.ath && who[x.ath] || [], mine = ps.some((p) => p.id === state.me), isNum = /^\d+$/.test(x.lead);
      return `<li class="rc__row${mine ? ' is-mine' : ''}${isNum ? '' : ' is-st'}${ps.length ? '' : ' is-nop'}"><span class="rc__rk">${esc(x.lead)}</span>${x.ath ? avatarOf(x.ath, 'sm') : '<span class="avatar avatar--empty avatar--sm" aria-hidden="true"></span>'}<span class="rc__sk">${x.ath ? skn(x.ath) : esc(x.name)}${x.time ? ` <b class="rc__pct">${esc(x.time)}</b>` : ''}</span>${ps.length ? `<span class="rc__who">${ps.map((p) => `<span class="rc__chip${p.id === state.me ? ' me' : ''}">${pln(p)}</span>`).join('')}</span>` : ''}</li>`;
    }).join('');
    const rowsX = items.filter((x) => x.ath && who[x.ath]).map((x) => ({ c: [x.lead, nameOf(x.ath), x.time], under: who[x.ath].map((p) => p.name).join(', ') }));
    const tech = race.disc === 'GS' || race.disc === 'SL';
    const xb = rowsX.length ? ` ${SHARE.xbar({ key: 'r1:' + race.id, title: 'Résultats 1re manche : skieurs choisis', sub: `${placeLabel(race)} · ${raceName(race)} · ${dayOf(race.date)}\n1re manche terminée${tech && L.run2 ? ` · 2e manche à ${hm(L.run2)}` : ''}`, right: '1re manche', head: ['Rang', (race.gender === 'W' ? 'Skieuse' : 'Skieur') + ' · choisi par', 'Temps'], rows: rowsX })}` : '';
    const upd = L.fetched ? `${F_DAY.format(new Date(L.fetched))}, ${F_HOUR.format(new Date(L.fetched))}` : '';
    openModal(`<div class="rc"><h3 class="rc__title">1re manche${xb}</h3><p class="rc__date">${esc(placeLabel(race))} · ${esc(raceName(race))}${L.run2 ? ` · 2e manche à ${esc(hm(L.run2))}` : ''}</p>
      <p class="hint">${upd ? `Classement provisoire, relevé le ${esc(upd)}. ` : ''}Les skieurs choisis par au moins un joueur sont suivis de leurs joueurs ; l’export ne contient qu’eux.</p>
      <ol class="rc__list">${li}</ol></div>`, 'modal__card--wide');
  }
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
      : canPick ? '<p class="hint">Tu n’as pas encore choisi : touche « Choisir » en face d’un nom de la liste.</p>' : '';
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
    let xb = '';
    if (lockedRace(race) && !race.cancelled) {
      const { cnt, picks: pks } = racePeople(race), byAth = {}, pickersOf = {}; pks.forEach((x) => { (pickersOf[x.ath] = pickersOf[x.ath] || []).push(x.p.name); }); sl.rows.forEach((r) => { if (r.ath) byAth[r.ath] = r; });
      const rowsX = Object.keys(cnt).map((a) => ({ bib: byAth[a] ? byAth[a].bib : null, a, n: cnt[a] })).sort((x, y) => (x.bib == null) - (y.bib == null) || x.bib - y.bib || nameOf(x.a).localeCompare(nameOf(y.a)))
        .map((x) => ({ c: [x.bib == null ? '–' : String(x.bib), nameOf(x.a) + (x.bib == null ? ' (absent de la start list)' : '')], under: pickersOf[x.a].join(', ') }));
      const lvr = state.live && state.live.races && state.live.races[race.id], tech = race.disc === 'GS' || race.disc === 'SL';
      const times = `1re manche ${hourText(G.raceStart(race))}${tech ? ` · 2e manche ${lvr && lvr.run2 ? hm(lvr.run2) : 'horaire à confirmer'}` : ''}`;
      if (rowsX.length) xb = ` ${SHARE.xbar({ key: 'sl:' + race.id, title: 'Dossards des ' + (race.gender === 'W' ? 'skieuses' : 'skieurs') + ' choisis', sub: `${placeLabel(race)} · ${raceName(race)} · ${dayOf(race.date)}\n${times}`, right: 'Start list', head: ['N°', (race.gender === 'W' ? 'Skieuse' : 'Skieur') + ' · choisi par'], rows: rowsX, nomedal: true })}`;
    }
    openModal(`<h2 class="rc__title">Start list${xb}</h2>
      <p class="hint">${esc(placeLabel(race))}, ${esc(raceName(race))} · manche 1 · ${sl.rows.length} partants<br>Source : page FIS « Start List »${when ? `, relevée le ${esc(when)}` : ''}. Elle peut encore évoluer avant le départ.${canPick ? '' : lockedRace(race) ? ' Les choix sont verrouillés.' : ''}</p>
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
    const ma = $('#mastact'); if (ma) { ma.hidden = !state.user && !state.demo; ma.innerHTML = '<span class="mast-actions__row">' + THEMESW + '<button type="button" class="mastbtn" data-rules>Règles du jeu</button><button type="button" class="mastbtn" data-ideas>Boîte à idées</button></span>' + (isAdmin() ? `<button type="button" class="mastbtn mastbtn--admin" data-tab="adm" aria-pressed="${state.tab === 'adm'}">Admin${newPlayers().length ? ` · 🔔 ${newPlayers().length}` : ''}</button>` : ''); }
    el.hidden = !state.user || (state.demo && !state.user);
    if (!el.hidden) el.innerHTML = accountBar();
  }
  /* ---------- Présence : « vu à l'instant » écrit toutes les 2 minutes tant que la page est visible ---------- */
  function beat() {
    if (state.demo || !state.user || document.visibilityState !== 'visible' || !store.touchPresence) return;
    const p = state.players.find((x) => x.id === state.me); if (p) p.lastSeen = Date.now();
    syncTheme();
    Promise.resolve(store.touchPresence(state.me)).catch(() => { /* hors ligne : on réessaie au prochain battement */ });
  }
  setInterval(beat, 2 * 60 * 1000);
  document.addEventListener('visibilitychange', beat);
  setTimeout(beat, 3000);

  const THEMESW = "<div class=\"themesw\" role=\"group\" aria-label=\"Ambiance du site\"><span>Ambiance</span><span class=\"themesw__dots\"><button type=\"button\" class=\"th--sapin\" data-theme-set=\"sapin\" aria-pressed=\"true\" title=\"Sapin\" aria-label=\"Ambiance Sapin\"></button><button type=\"button\" class=\"th--glace\" data-theme-set=\"glace\" aria-pressed=\"false\" title=\"Grand froid\" aria-label=\"Ambiance Grand froid\"></button><button type=\"button\" class=\"th--nuit\" data-theme-set=\"nuit\" aria-pressed=\"false\" title=\"Aurore boréale\" aria-label=\"Ambiance Aurore boréale\"></button><button type=\"button\" class=\"th--noel\" data-theme-set=\"noel\" aria-pressed=\"false\" title=\"Noël\" aria-label=\"Ambiance Noël\"></button><button type=\"button\" class=\"th--halloween\" data-theme-set=\"halloween\" aria-pressed=\"false\" title=\"Halloween\" aria-label=\"Ambiance Halloween\"></button><button type=\"button\" class=\"th--arcade\" data-theme-set=\"arcade\" aria-pressed=\"false\" title=\"Arcade\" aria-label=\"Ambiance Arcade\"></button><button type=\"button\" class=\"th--minimal\" data-theme-set=\"minimal\" aria-pressed=\"false\" title=\"Minimal\" aria-label=\"Ambiance Minimal\"></button></span></div>";
  /* ---------- Ambiance (Sapin, Glace, Nuit), mémorisée dans le navigateur ---------- */
  const THEME_COLOR = { sapin: '#163629', glace: '#a8cfe4', nuit: '#0b1322', noel: '#8f1620', halloween: '#1a0b2c', arcade: '#0d0b2a', minimal: '#ffffff' };
  function setTheme(t, save) {
    if (!THEME_COLOR[t]) t = 'sapin';
    const de = document.documentElement;
    if (t === 'sapin') de.removeAttribute('data-theme'); else de.setAttribute('data-theme', (t === 'halloween' || t === 'arcade') ? 'nuit' : t);   // Halloween = variante sombre de Nuit
    if (t === 'halloween' || t === 'arcade') de.setAttribute('data-skin', t); else de.removeAttribute('data-skin');
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEME_COLOR[t]);
    curTheme = t;
    if (save) { try { localStorage.setItem('skigame.theme', t); } catch (e) { /* ignoré */ } syncTheme(); }
  }
  /** Ambiance choisie : enregistrée sur la fiche du joueur (liste admin, pastille d'initiale aux couleurs de son ambiance). */
  let curTheme = 'sapin';
  function syncTheme() {
    if (state.demo || !state.user || !store.setPlayerTheme) return;
    const p = state.players.find((x) => x.id === state.me);
    if (!p || p.theme === curTheme) return;
    p.theme = curTheme;
    Promise.resolve(store.setPlayerTheme(state.me, curTheme)).catch(() => { /* hors ligne : au prochain battement */ });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-theme-set]'); if (b) setTheme(b.dataset.themeSet, true); });
  (function () { let t = 'sapin'; try { t = localStorage.getItem('skigame.theme') || 'sapin'; } catch (e) { /* ignoré */ } setTheme(t, false); })();

  /* ---------- Recherche de skieurs (ordinateur) : pop up de recherche, puis la fiche dans la même pop up ---------- */
  (function () {
    const results = (qv) => {
      const t = norm(qv.trim()).split(/\s+/).filter(Boolean); if (!t.length) return '';
      const hits = [];
      ['W', 'M'].forEach((g) => (LIST[g] || []).forEach((a) => { const n = norm(nameOf(a.id) + ' ' + (a.name || '')); if (t.every((x) => n.includes(x))) hits.push(a); }));
      hits.sort((x, y) => nameOf(x.id).localeCompare(nameOf(y.id)));
      return hits.slice(0, 12).map((a) => `<li><button type="button" data-dr="sk:id~${esc(a.id)}">${avatarOf(a.id, 'sm')}${flagOf(a.id)}<span>${esc(nameOf(a.id))}</span>${a.g || a.gender ? '' : ''}</button></li>`).join('') || '<li class="none">Aucun skieur trouvé.</li>';
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#skfind')) return;
      openModal('<h2>Chercher un skieur</h2><input id="skq" class="skq" type="search" placeholder="Nom ou prénom…" autocomplete="off" aria-label="Chercher un skieur ou une skieuse"><ul class="skres" id="skres"></ul>');
      setTimeout(() => { const q = $('#skq'); if (q) q.focus(); }, 50);
    });
    document.addEventListener('input', (e) => { if (e.target.id === 'skq') { const r = $('#skres'); if (r) r.innerHTML = results(e.target.value); } });
    document.addEventListener('keydown', (e) => { if (e.target.id === 'skq' && e.key === 'Enter') { const b = document.querySelector('#skres button'); if (b) b.click(); } });
  })();

  /* ---------- Photo de profil ---------- */
  const playerOf = (id) => state.players.find((p) => p.id === id) || { id, name: '', photo: '' };
  function pav(p, size) {
    const init = esc((p.name || '?').trim()[0] ? (p.name || '?').trim()[0].toUpperCase() : '?');
    return `<span class="pav pav--${size || 'sm'}${!p.photo && p.theme ? ' pav--t-' + esc(p.theme) : ''}" aria-hidden="true">${p.photo ? `<img src="${p.photo}" alt="">` : `<span>${init}</span>`}</span>`;
  }
  const FICHE_ON = true; // fiche joueur : désactivée pour le moment (passer à true pour la réactiver)
  const pname = (p) => !FICHE_ON ? `<span class="pn">${pav(p, 'xs')}<span>${esc(p.name)}</span></span>` : `<button type="button" class="pn pn--btn" data-player="${esc(p.id)}" title="Voir la fiche">${pav(p, 'xs')}<span>${esc(p.name)}</span></button>`;
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
  function myRanks(pid) {
    const R = state.results, n = state.players.length;
    if (!Object.keys(R).length || !n) return null;
    const rankOf = (fn) => { const r = rankRows((pk) => ({ total: fn(pk) })).find((x) => x.p.id === (pid || state.me)); return r ? { rank: r.rank, pts: r.v.total } : null; };
    const done = Object.keys(R).map((rid) => G.raceOf(rid)).filter((r) => r && !r.cancelled);   // courses déjà classées : sans course dans un globe, pas de rang
    return { n, gen: done.length ? rankOf((pk) => G.generalScore(pk, R).total) : null, discs: ['DH', 'SG', 'GS', 'SL'].map((c) => (done.some((r) => r.disc === c) ? Object.assign({ c }, rankOf((pk) => G.disciplineScore(c, pk, R))) : null)) };
  }
  const globeBoard = (rk) => {
    const nth = (r) => (r ? `${ordinal(r.rank)}` : '-');
    const DN = { DH: 'DH', SG: 'SG', GS: 'GS', SL: 'SL' };
    return `<div class="acct__board">
      <button type="button" class="gl gl--big" data-tab="gen" title="Voir le classement général">${globeSvg('big')}<span class="gl__t"><b>${rk ? nth(rk.gen) : '-'}</b><span title="Gros globe">GG</span></span></button>
      <div class="gl-row">${['DH', 'SG', 'GS', 'SL'].map((c, i) => `<button type="button" class="gl gl--sm" data-tab="gen" title="Voir le classement général">${globeSvg('sm')}<span class="gl__t"><b>${rk ? nth(rk.discs[i]) : '-'}</b><span>${DN[c]}</span></span></button>`).join('')}</div>
    </div>`;
  };
  /** Cartouche « Mon compte » : identité, tableau des globes (gros seul sur mobile), boutons. */
  function accountBar() {
    const name = state.user.name || '';
    const rk = myRanks();
    const me = playerOf(state.me);
    const cam = state.demo ? '' : `<button type="button" class="acct__cam" data-photo title="${me.blocked ? 'Photo retirée par l’organisateur' : me.photo ? 'Changer ma photo' : 'Ajouter ma photo'}" aria-label="${me.photo ? 'Changer ma photo' : 'Ajouter ma photo'}"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 8h3l1.6-2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>`;
    return `<div class="acct"><div class="acct__who"><span class="acct__avw"><button type="button" class="acct__avb" data-photo aria-label="${me.photo ? 'Changer ma photo' : 'Ajouter ma photo'}" ${state.demo ? 'disabled' : ''}>${pav(Object.assign({}, me, { name }), 'lg')}</button>${cam}</span>
      <div class="acct__id"><span class="acct__hi">Mon compte</span>${FICHE_ON ? `<button type="button" class="acct__name acct__namebtn" data-player="${esc(state.me)}" title="Voir ma fiche">${esc(name)}</button>` : `<strong class="acct__name">${esc(name)}</strong>`}</div></div>
      ${globeBoard(rk)}
      <div class="acct__btns">${FICHE_ON ? `<button type="button" class="btn btn--sm acct__ib" data-player="${esc(state.me)}" aria-label="Ma fiche" title="Ma fiche"><span class="lbl-lg">Ma fiche</span><svg class="ico-sm" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.7"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/></svg></button>` : ''}<button type="button" class="btn btn--sm btn--ghost acct__ib" data-settings aria-label="Mes réglages" title="Mes réglages"><span class="lbl-lg">Mes réglages</span><svg class="ico-sm" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button></div></div>`;
  }

  /* ---------- Fiche d'un joueur : statistiques avancées (courses terminées seulement, donc publiques) ---------- */
  function playerRows(pid) {
    const R = state.results, picks = state.picks[pid] || {}, rows = [];
    allSessions().forEach((sn) => sortedRaces(sn).forEach((r) => {
      if (r.cancelled || !R[r.id]) return;
      const pk = picks[r.id], has = !!(pk && pk.a);
      const eff = has ? G.effectiveAthlete(pk, R, r.id) : null;
      const e = eff ? R[r.id].find((x) => x.ath === eff) : null;
      rows.push({ r, has, eff, e, pts: has ? (G.scoreRace(r, pk, R) || 0) : 0, how: !has ? '' : pk.d && eff === pk.d ? 'tiré au sort' : pk.b && eff === pk.b ? 'remplaçant' : '' });
    }));
    return rows;
  }
  function sparkline(rows) {
    const vals = []; let t = 0; rows.forEach((x) => { t += x.pts; vals.push(t); });
    if (vals.length < 2) return '';
    const W = 300, H = 64, max = Math.max(...vals, 1);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (W - 8) + 4).toFixed(1)},${(H - 6 - v / max * (H - 14)).toFixed(1)}`).join(' ');
    return `<svg class="fsp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Points cumulés course après course"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  /** Le Desk 2 est terminé : toutes ses courses ont leur résultat (ou sont annulées). */
  const desk2Done = () => D.SESSIONS.filter((x) => x.desk === 2).every((x) => G.sessionRaces(x).every((r) => r.cancelled || !!resOf(r)));

  /** Liste exhaustive des choix d'un joueur avec leur note en flocons, le plus récent en premier. */
  function evalModal(pid) {
    const p = state.players.find((x) => x.id === pid) || (pid === state.me ? { id: pid, name: (state.user && state.user.name) || '', photo: '' } : null);
    if (!p) return;
    const ids = state.players.map((x) => x.id), picks = state.picks[pid] || {};
    const rows = Object.keys(D.RACES).map((id) => G.raceOf(id)).filter((r) => !r.cancelled && resOf(r) && picks[r.id] && picks[r.id].a)
      .sort((a, b) => G.raceStart(b) - G.raceStart(a))
      .map((r) => ({ r, an: G.pickAnalysis(r, pid, state.picks, state.results, ids) })).filter((x) => x.an);
    const rated = rows.filter((x) => x.an.flakes != null), mean = rated.length ? rated.reduce((a, x) => a + x.an.flakes, 0) / rated.length : null;
    const li = rows.map(({ r, an }) => {
      const e = resOf(r).find((x) => x.ath === an.ath), how = e ? (e.status || ordinal(e.rank)) : 'non classé';
      return `<li class="evl__row"><span class="evl__d">${esc(dayOf(r.date))}</span><span class="evl__r">${fl(placeLabel(r))} ${discBadge(r)} <span class="gender gender--${r.gender}">${genderLabel(r)}</span></span>
        <span class="evl__a">${skn(an.ath)} <em class="sub">${esc(how)} · ${an.mine} pt${an.mine > 1 ? 's' : ''}</em></span>
        <span class="evl__n">${an.flakes == null ? '<em class="sub">en attente de données</em>' : `${flakeRow(an.flakes)}<b>${f1(an.flakes)}</b>${an.provisional ? '<em class="sub">provisoire</em>' : ''}`}</span></li>`;
    }).join('');
    openModal(`<div class="fiche"><header class="fiche__head">${pav(Object.assign({}, p), 'lg')}<div><h2 class="fiche__name">Évaluation des choix${pid === state.me ? ' <em>(toi)</em>' : ''}</h2><p class="fiche__sum">${esc(p.name)}${mean != null ? ` · note moyenne ${f1(mean)} / 5` : ''}</p></div></header>
      <p class="hint">Note de 0 à 5 flocons par choix, du plus récent au plus ancien. Elle compare les points du skieur à ceux des autres joueurs (sur la course et sur ce skieur dans le desk) ; elle peut évoluer quand d’autres joueurs le prennent.</p>
      ${li ? `<ul class="evl">${li}</ul>` : '<p class="hint">Aucune course terminée pour ce joueur.</p>'}
      <p class="fiche__foot"><button type="button" class="btn btn--ghost btn--sm" data-player="${esc(pid)}">← Retour à la fiche</button></p></div>`, 'modal__card--wide');
  }
  function ficheModal(pid) {
    const p = state.players.find((x) => x.id === pid) || (pid === state.me && state.user ? { id: pid, name: state.user.name || '', photo: '' } : null);
    if (!p) return;
    const R = state.results, picks = state.picks[pid] || {}, rows = playerRows(pid), played = rows.filter((x) => x.has);
    const rk = myRanks(pid), total = G.generalScore(picks, R).total;
    const nb = (n) => String(n);
    const scored = played.filter((x) => x.pts > 0), podium = played.filter((x) => x.e && !x.e.status && x.e.rank <= 3), wins = played.filter((x) => x.e && !x.e.status && x.e.rank === 1);
    let streak = 0, run = 0; played.forEach((x) => { run = x.pts > 0 ? run + 1 : 0; streak = Math.max(streak, run); });
    const best = played.slice().sort((a, b) => b.pts - a.pts)[0];
    const avg = played.length ? Math.round(played.reduce((a, x) => a + x.pts, 0) / played.length * 10) / 10 : 0;
    const byAth = {}; played.forEach((x) => { if (x.eff) byAth[x.eff] = (byAth[x.eff] || 0) + x.pts; });
    const top = Object.entries(byAth).sort((a, b) => b[1] - a[1]).slice(0, 3).filter((x) => x[1] > 0);
    const bars = (items) => { const mx = Math.max(1, ...items.map((i) => i[1])); return `<ul class="fbars">${items.map(([l, v, c]) => `<li><span class="fbars__l">${esc(l)}</span><span class="fbars__b"><i style="width:${Math.round(v / mx * 100)}%;${c ? 'background:' + c : ''}"></i></span><b>${v}</b></li>`).join('')}</ul>`; };
    const gs = G.generalScore(picks, R);
    const desks = D.DESKS.map((d, i) => [d.name, gs.desks[i]]).concat([['Mondiaux', gs.worlds]]);
    const discs = ['DH', 'SG', 'GS', 'SL'].map((c) => [c === 'SG' ? 'Super-G' : D.DISC[c].fr, G.disciplineScore(c, picks, R)]);
    const tile = (v, l) => `<div class="ftile"><b>${v}</b><span>${l}</span></div>`;
    const evs = SKI_STATS.events(state, G, R), tt = SKI_STATS.totals(state, evs).find((t) => t.p.id === pid) || { n: 0, bubbles: 0, tas: 0, tasPts: 0, wins: 0, podiums: 0 };
    const mine = evs.filter((e) => e.p.id === pid && !e.nopick);
    const stile = (v, l, k) => `<div class="sk__t sk__t--${k}"><b>${v}</b><span>${l}</span></div>`;
    const wr = SKI_STATS.worth(evs, pid).filter((x) => x.ath);
    const wl = (arr) => arr.length ? `<ul class="fbars fbars--w">${arr.map((x) => `<li><span class="fbars__l">${skn(x.ath)}</span><span class="sub">${x.n} fois</span><b class="${x.diff >= 0 ? 'pos' : 'neg'}">${x.diff >= 0 ? '+' : ''}${Math.round(x.diff * 10) / 10}</b></li>`).join('')}</ul>` : '<p class="hint">Pas encore assez de courses.</p>';
    const bestW = wr.slice().sort((a, b) => b.diff - a.diff).filter((x) => x.diff > 0).slice(0, 5), worstW = wr.slice().sort((a, b) => a.diff - b.diff).filter((x) => x.diff < 0).slice(0, 5);
    const byA = {}; mine.forEach((e) => { const o = (byA[e.eff] = byA[e.eff] || { ath: e.eff, n: 0, wins: 0, zeros: 0, pts: 0 }); o.n++; o.pts += e.pts; if (e.win) o.wins++; if (!e.pts) o.zeros++; });
    const A = Object.values(byA), allWin = A.filter((x) => x.wins === x.n), allZero = A.filter((x) => x.zeros === x.n);
    const chips = (arr) => arr.length ? `<p class="fchips">${arr.map((x) => `${skn(x.ath)}${x.n > 1 ? ` <b>×${x.n}</b>` : ''}`).join(' · ')}</p>` : '<p class="hint">Aucun pour l’instant.</p>';
    const prov = SKI_STATS.providers(evs, pid).filter((x) => x.pts > 0), provShown = state.ficheMore === pid ? prov : prov.slice(0, 10);
    const st = (SKI_STATS.streaks(evs)[pid]) || {};
    const strk = `<ul class="fbars fbars--w">${SKI_STATS.STREAKS.map((sd) => `<li><span class="fbars__l">${sd.label}</span><span class="sub">${st[sd.id] && st[sd.id].now ? 'en cours : ' + st[sd.id].now : ''}</span><b>${st[sd.id] ? st[sd.id].best : 0}</b></li>`).join('')}</ul>`;
    const body = !rows.length ? '<p class="hint">Aucune course terminée pour l’instant : les statistiques apparaîtront après la première.</p>' : `
      <div class="ftiles">${stile(tt.wins, tt.wins > 1 ? 'victoires' : 'victoire', 'win')}${stile(tt.podiums, tt.podiums > 1 ? 'podiums' : 'podium', 'pod')}${stile(avg, 'pts par course', 'top')}
        ${stile(`${tt.bubbles} <small>sur ${tt.n}</small>`, tt.bubbles > 1 ? 'bulles' : 'bulle', 'bub')}${stile(tt.tas, 'TAS subis', 'c')}${stile(tt.tas ? Math.round(tt.tasPts / tt.tas * 10) / 10 : '–', 'pts moyens sur TAS', 'c')}</div>
      <h3 class="fh">Évolution</h3><div class="fchart">${sparkline(rows) || '<span class="hint">Pas encore assez de courses.</span>'}</div>
      <div class="fcols"><div><h3 class="fh">Par desk</h3>${bars(desks)}</div><div><h3 class="fh">Par discipline</h3>${bars(discs)}</div></div>
      <div class="fcols"><div><h3 class="fh">Top 5 des coureurs mieux rentabilisés que les autres ${info('Points que le skieur t’a rapportés, comparés à la moyenne des autres joueurs qui l’ont pris eux aussi, cumulé sur tous les desks. Les skieurs que personne d’autre n’a pris sont ignorés.')}</h3>${wl(bestW)}</div>
        <div><h3 class="fh">Top 5 des moins bien rentabilisés</h3>${wl(worstW)}</div></div>
      ${desk2Done() ? `<div class="fcols"><div><h3 class="fh">Toujours gagnants quand ils sont joués</h3>${chips(allWin)}</div><div><h3 class="fh">Toujours à zéro quand ils sont joués</h3>${chips(allZero)}</div></div>` : ''}
      <h3 class="fh">Skieurs les plus pourvoyeurs de points</h3>${prov.length ? `<ul class="fbars fbars--w">${provShown.map((x) => `<li><span class="fbars__l">${skn(x.ath)}</span><span class="sub">${x.n} fois</span><b>${x.pts}</b></li>`).join('')}</ul>${prov.length > 10 ? `<p><button type="button" class="linkbtn" data-fmore="${esc(pid)}">${state.ficheMore === pid ? 'Réduire' : `Voir plus… (${prov.length})`}</button></p>` : ''}` : '<p class="hint">Pas encore de points.</p>'}
      <h3 class="fh">Séries les plus longues</h3>${strk}`;
    openModal(`<div class="fiche"><header class="fiche__head">${pav(Object.assign({}, p), 'lg')}<div><h2 class="fiche__name">${esc(p.name)}${pid === state.me ? ' <em>(toi)</em>' : ''}</h2>
      <p class="fiche__sum">${rk && rk.gen ? `${esc(ordinal(rk.gen.rank))} au général · ${total} pts` : 'Pas encore de classement'}</p></div></header>
      ${globeBoard(rk)}${rows.length ? `<p class="fiche__eval"><button type="button" class="btn btn--ghost btn--sm" data-evalpicks="${esc(pid)}">Évaluation des choix du joueur ❄ →</button></p>` : ''}${body}
      ${pid === state.me ? '<p class="fiche__foot"><button type="button" class="btn btn--ghost btn--sm" data-settings>Mes réglages</button></p>' : ''}</div>`, 'modal__card--wide');
  }

  /* ---------- Installer l'app (raccourci sur l'écran d'accueil) ---------- */
  let installEvt = null;
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  function syncInstall() { const r = $('#installrow'); if (r) r.hidden = isStandalone(); }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
  window.addEventListener('appinstalled', () => { installEvt = null; syncInstall(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* ignoré */ });
  async function installApp() {
    if (installEvt) { const ev = installEvt; installEvt = null; ev.prompt(); try { await ev.userChoice; } catch (e) { /* ignoré */ } return; }
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const steps = ios
      ? ['Ouvre ce site dans <strong>Safari</strong> (pas dans une application de messagerie ou de réseau social).', 'Touche le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut), en bas de l’écran.', 'Fais défiler la liste et touche <strong>« Sur l’écran d’accueil »</strong>.', 'Touche <strong>« Ajouter »</strong> : l’icône Ski Game apparaît sur ton écran d’accueil.']
      : android
        ? ['Ouvre ce site dans <strong>Chrome</strong>.', 'Touche le menu <strong>⋮</strong>, en haut à droite.', 'Touche <strong>« Installer l’application »</strong> (ou « Ajouter à l’écran d’accueil »).', 'Valide : l’icône Ski Game apparaît sur ton écran d’accueil.']
        : ['Dans <strong>Chrome</strong> ou <strong>Edge</strong>, clique sur l’icône d’installation à droite de la barre d’adresse, ou ouvre le menu <strong>⋮</strong> puis <strong>« Installer Ski Game »</strong>.', 'Sur Safari (Mac) : menu <strong>Fichier</strong>, puis <strong>« Ajouter au Dock »</strong>.', 'Sur téléphone, ouvre ce site depuis ton téléphone pour avoir le raccourci sur l’écran d’accueil.'];
    openModal(`<h2>Installer l’app</h2><p class="hint">Ski Game s’ouvre alors comme une application, en plein écran, depuis un raccourci sur ton écran d’accueil.</p><ol class="inst">${steps.map((t) => `<li>${t}</li>`).join('')}</ol>`);
  }

  /* ---------- Mes réglages ---------- */
  function settingsModal() {
    const me = playerOf(state.me), g = gateGet();
    const snoozed = Object.keys(g.skip || {}).length + Object.keys(g.until || {}).length > 0;
    const email = state.user && state.user.email ? esc(state.user.email) : '';
    const th = document.documentElement.getAttribute('data-theme') || 'sapin';
    const dot = (k, l) => `<button type="button" class="th--${k}" data-theme-set="${k}" aria-pressed="${th === k}" title="${l}" aria-label="Ambiance ${l}"></button>`;
    openModal(`<h2>Mes réglages</h2>
      <section class="set"><h3>Mon profil</h3>
        <div class="set__row"><span>Nom affiché<strong>${esc(state.user.name || '')}</strong></span>${state.demo ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-auth="rename">Changer</button>'}</div>
        <div class="set__row"><span>Photo de profil</span>${state.demo ? '' : `<button type="button" class="btn btn--ghost btn--sm" data-photo>${me.photo ? 'Changer' : 'Ajouter'}</button>`}</div>
        ${email ? `<div class="set__row"><span>Adresse e-mail<strong>${email}</strong></span></div>` : ''}
      </section>
      <section class="set"><h3>Rappel « Au portillon »</h3>
        <label class="set__check"><input type="checkbox" id="set-gate"${g.off ? '' : ' checked'}><span>Me prévenir la veille de la deadline, dès 21 h, s’il me reste des choix à faire</span></label>
        ${snoozed ? '<button type="button" class="linkbtn" data-gate-reset>Réafficher les rappels reportés ou masqués</button>' : ''}
        <p class="hint">Réglage enregistré dans ce navigateur : à refaire sur un autre appareil.</p>
      </section>
      <section class="set"><h3>Ambiance du site</h3><div class="set__themes">${dot('sapin', 'Sapin')}${dot('glace', 'Grand froid')}${dot('nuit', 'Aurore')}${dot('noel', 'Noël')}${dot('halloween', 'Halloween')}${dot('arcade', 'Arcade')}${dot('minimal', 'Minimal')}</div></section>
      <section class="set"><h3>Application mobile</h3>
        ${isStandalone() ? '<p class="hint">L’app est déjà installée sur cet appareil ✓</p>' : '<p class="hint">Ajoute un raccourci Ski Game sur ton écran d’accueil : le jeu s’ouvre comme une application.</p><button type="button" class="btn btn--ghost btn--sm" data-install>📲 Installer l’app sur mon téléphone</button>'}
      </section>
      <section class="set"><h3>Aide et compte</h3>
        <div class="set__links"><button type="button" class="btn btn--ghost btn--sm" data-rules>Revoir les règles</button><button type="button" class="btn btn--ghost btn--sm" data-ideas>Boîte à idées</button>${state.demo ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-auth="out">Me déconnecter</button>'}</div>
      </section>`);
  }
  function renderPanel() {
    const t = state.tab;
    if (!state.authReady && !state.demo) { $('#panel').innerHTML = '<p class="hint">Chargement…</p>'; return; }
    if (!state.user && !state.demo) {
      $('#panel').innerHTML = authPanel();
      return;
    }
    if (t === 'adm' && !isAdmin()) state.tab = 'next';
    const html = state.tab === 'adm' ? window.SKI_ADMIN.render(adminCtx()) : state.tab === 'next' ? nextPanel() : state.tab === 'gen' ? generalPanel() : state.tab === 'data' ? window.SKI_DR.render() : state.tab === 'w' ? deskPanel(0) : deskPanel(Number(state.tab));
    const syncWarn = !state.demo && state.user && !state.picksReady && (state.syncErr || state.picksLate) ? '<div class="syncwarn" role="alert"><strong>Tes choix et ceux des autres ne se chargent pas.</strong> Ce n’est pas une perte : ils sont enregistrés. Recharge la page ; si ça persiste, désactive ton bloqueur de publicités ou le mode « protection renforcée » du navigateur pour ce site, ou essaie un autre navigateur.</div>' : '';
    $('#panel').innerHTML = (state.demo ? '<p class="demo">Démonstration : joueurs, choix et résultats fictifs.</p>' : '') + syncWarn + html;
    $('#panel').setAttribute('aria-labelledby', 'tab-' + state.tab);
    applyTakenFilter();
  }
  /** Recherche et filtre de « Athlètes pris » : on masque des lignes, sans réafficher (le focus reste dans le champ). */
  function applyTakenFilter() {
    const q = norm(state.tq.trim());
    document.querySelectorAll('.grid--tk thead th[data-a]').forEach((th) => {
      const ok = (!q || th.dataset.name.includes(q)) && (state.tf === 'all' || (state.tf === 'taken' ? th.dataset.taken === '1' : state.tf === 'draft' ? th.dataset.taken === 'd' : th.dataset.taken === '0')) && (!state.major || th.dataset.major === '1');
      const table = th.closest('table');
      table.querySelectorAll(`[data-a="${th.dataset.a}"]`).forEach((c) => { c.hidden = !ok; });
    });
    document.querySelectorAll('[data-tf]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === state.tf)));
  }
  /** Onglets : si la rangée déborde, on dégrade par étapes (libellé « Ambiance », puces d'ambiance, puis onglets en pictos). */
  function fitTabs() {
    const nav = document.querySelector('.tabs'), row = $('#tabs');
    if (!nav || !row || nav.hidden) return;
    const steps = ['tabs--nolabel', 'tabs--nodots', 'tabs--ico'];  // 1 : champ de recherche réduit, 2 : masqué
    nav.classList.remove(...steps);
    const over = () => row.scrollWidth > row.clientWidth + 1;
    for (const c of steps) { if (!over()) break; nav.classList.add(c); }
  }
  let fitT = 0;
  window.addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitTabs, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTabs);
  function render() {
    $('#tabs').closest('nav').hidden = !state.user && !state.demo;
    renderTabs(); fitTabs(); renderUserbar(); renderPanel(); syncSim();
    setTimeout(gateCheck, 400); syncInstall();
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
    if (cur.a && !('draft' in cur) && !(myPicks()[race.id] || {}).a && sessionDraftMode(sessionOf(race))) cur.draft = true;   // nouveau choix dans une session en brouillon : brouillon aussi
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
    const ev = e.target.closest('[data-evalpicks]'); if (ev) { evalModal(ev.dataset.evalpicks); return; }
    const pl = e.target.closest('[data-player]');
    if (pl && FICHE_ON) { ficheModal(pl.dataset.player); return; }
    if (e.target.closest('[data-settings]')) { settingsModal(); return; }
    if (e.target.closest('[data-install]')) { installApp(); return; }
    if (e.target.closest('[data-gate-reset]')) { const g = gateGet(); delete g.skip; delete g.until; gateSet(g); settingsModal(); return; }
    if (e.target.closest('#modal [data-auth="out"]')) closeModal();
    const slp = e.target.closest('[data-slpick]');
    if (slp) { const [rid, slot, ath] = slp.dataset.slpick.split('|'); onPick({ dataset: { race: rid, slot }, value: ath, id: 'sl' }).then(() => startListModal(rid, true)); return; }
    const slc = e.target.closest('[data-slclear]');
    if (slc) { const [rid, slot] = slc.dataset.slclear.split('|'); onPick({ dataset: { race: rid, slot }, value: '', id: 'sl' }).then(() => startListModal(rid, true)); return; }
    const r1b = e.target.closest('[data-run1]'); if (r1b) { run1Modal(r1b.dataset.run1); return; }
    const slb = e.target.closest('[data-startlist]');
    if (slb) { startListModal(slb.dataset.startlist); return; }
    const sxo = e.target.closest('[data-sx-open]'); if (sxo) { SHARE.sessionOpen(sxo.dataset.sxOpen); return; }
    const sxc = e.target.closest('[data-sx-copy]'); if (sxc) { SHARE.sessionCopy(sxc.dataset.sxCopy); return; }
    const sxj = e.target.closest('[data-sx-jpg]'); if (sxj) { SHARE.sessionJpg(sxj.dataset.sxJpg); return; }
    const dr1 = e.target.closest('[data-draft]'); if (dr1) { const pk = myPicks()[dr1.dataset.draft]; setDraft([dr1.dataset.draft], !(pk && pk.draft)); return; }
    const dr2 = e.target.closest('[data-draft-session]'); if (dr2) { const [sid, on] = dr2.dataset.draftSession.split('|'); const ss = allSessions().find((x) => String(x.id) === sid); if (ss) setDraft(active(G.sessionRaces(ss)).map((r) => r.id), on === '1'); return; }
    if (e.target.closest('[data-refresh-results]')) { loadResults(true); return; }
    const rgc = e.target.closest('[data-rc-gcopy]'); if (rgc) { SHARE.copyGeneral(rgc.dataset.rcGcopy); return; }
    const rgj = e.target.closest('[data-rc-gjpg]'); if (rgj) { SHARE.jpgGeneral(rgj.dataset.rcGjpg); return; }
    const rcc = e.target.closest('[data-rc-copy]'); if (rcc) { SHARE.copy(rcc.dataset.rcCopy); return; }
    const rcj = e.target.closest('[data-rc-jpg]'); if (rcj) { SHARE.jpg(rcj.dataset.rcJpg); return; }
    if (e.target.closest('.brand')) { setTab('next'); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { setTab(tab.dataset.tab); return; }
    const go = e.target.closest('[data-goto]');
    if (go) { setTab(go.dataset.goto === '0' ? 'w' : go.dataset.goto); return; }
    const tf = e.target.closest('[data-tf]');
    if (tf) { state.tf = tf.dataset.tf; applyTakenFilter(); return; }
    const skp = e.target.closest('[data-skip]');
    if (skp) { LS.set('skigame.skip.' + skp.dataset.skip, '1'); render(); window.scrollTo(0, 0); return; }
    const usk = e.target.closest('[data-unskip]');
    if (usk) { LS.del('skigame.skip.' + usk.dataset.unskip); render(); window.scrollTo(0, 0); return; }
    const ffb = e.target.closest('[data-ff]');
    if (ffb) {
      const v = ffb.dataset.ff;
      if (v === 'clear') state.ff = { disc: [], gender: [] };
      else { const [k, x] = v.split(':'); const a = state.ff[k]; state.ff[k] = a.includes(x) ? a.filter((y) => y !== x) : a.concat(x); }
      renderPanel(); return;
    }
    const fmo = e.target.closest('[data-fmore]'); if (fmo) { state.ficheMore = state.ficheMore === fmo.dataset.fmore ? null : fmo.dataset.fmore; ficheModal(fmo.dataset.fmore); return; }
    const bdb = e.target.closest('[data-bd]'); if (bdb) { detailModal(bdb.dataset.bd); return; }
    const gsb = e.target.closest('[data-gsub]'); if (gsb) { state.gsub = gsb.dataset.gsub; renderPanel(); return; }
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
      const todo = active(sortedRaces(s)).filter((r) => !lockedRace(r) && !isConfirmed(myPicks()[r.id], r));
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
    const nDraft = todo.filter((r) => isDraft(myPicks()[r.id], r)).length;
    const list = todo.map((r) => `<li class="gate__race"><span class="gate__when">${esc(dayOf(r.date))}</span><span class="gate__what"><strong>${fl(placeLabel(r))}</strong> ${discBadge(r)}<span class="gender gender--${r.gender}">${genderLabel(r)}</span></span></li>`).join('');
    openModal(`<div class="gate"><p class="gate__kicker">Au portillon</p>
      <h2 class="gate__title">${todo.length > 1 ? `${todo.length} choix t’attendent` : 'Un choix t’attend'}</h2>
      ${nDraft ? `<p class="gate__lead">Dont <strong>${nDraft} brouillon${nDraft > 1 ? 's' : ''}</strong> à confirmer. Sans action de ta part, les brouillons seront confirmés automatiquement à la deadline.</p>` : ''}
      <p class="gate__lead">Deadline <strong>${esc(dlShort(dl))}</strong>, dans ${esc(leftText(left))}. Ensuite, tout est verrouillé, <strong>y compris les courses des jours suivants</strong> : il faut tout valider avant la première course de la session.</p>
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

  document.addEventListener('change', (e) => {
    if (e.target.id !== 'set-gate') return;
    const g = gateGet(); if (e.target.checked) delete g.off; else g.off = true; gateSet(g);
  });

  /* ---------- Départ reporté : prévenir les joueurs qu'ils ont plus de temps (une fois par report et par navigateur) ---------- */
  /* ---------- Alerte au joueur dont le titulaire ne prend pas le départ (remplaçant ou tirage au sort), une fois par course ---------- */
  const DN_KEY = 'skigame.dnsalert';
  function dnsAlertCheck() {
    if (!state.user && !state.demo) return;
    const m = $('#modal'); if (!m || !m.hidden || !state.me) return;
    let seen = {}; try { seen = JSON.parse(localStorage.getItem(DN_KEY) || '{}') || {}; } catch (e) { /* ignoré */ }
    for (const r of Object.values(D.RACES)) {
      if (r.cancelled || !lockedRace(r) || resOf(r)) continue;
      const pk = (state.picks[state.me] || {})[r.id]; if (!pk || !pk.a) continue;
      const lv = liveOf(r) || preLive(r); if (!lv || !lv.dns(pk.a) || seen[r.id + '@' + pk.a]) continue;
      const dr = lv._dr || (lv._dr = liveDraws(r, lv)), rep = pk.b && !lv.dns(pk.b) ? pk.b : null, tas = !rep && dr[state.me] ? dr[state.me].ath : null;
      if (!rep && !tas) continue;
      seen[r.id + '@' + pk.a] = 1; try { localStorage.setItem(DN_KEY, JSON.stringify(seen)); } catch (e) { /* ignoré */ }
      openModal(`<div class="gate"><p class="gate__kicker">Non-partant</p>
        <h2 class="gate__title">${esc(nameOf(pk.a))} ne prend pas le départ</h2>
        <p class="gate__lead"><strong>${fl(placeLabel(r))}</strong> ${discBadge(r)} <span class="gender gender--${r.gender}">${genderLabel(r)}</span> : ton titulaire est absent de la liste de départ.</p>
        <p class="gate__lead">${rep ? `Ton remplaçant <strong>${esc(nameOf(rep))}</strong> prend sa place.` : `Tu n’avais pas de remplaçant valable : le <strong>tirage au sort</strong> te donne <strong>${esc(nameOf(tas))}</strong> (1 sur ${dr[state.me].n}, d’après la liste de départ).`}</p>
        <button type="button" class="btn btn--brique gate__go" data-gate-go="${sessionOf(r).id}">Voir la course</button></div>`);
      return;
    }
  }
  const MV_KEY = 'skigame.moved';
  const mvGet = () => { try { return JSON.parse(localStorage.getItem(MV_KEY) || '{}') || {}; } catch (e) { return {}; } };
  function movedCheck() {
    if (!state.user && !state.demo) return;
    const m = $('#modal'); if (!m || !m.hidden) return;
    const seen = mvGet(), t = now();
    const list = Object.values(D.RACES).filter((r) => r.time0 && r.time > r.time0 && !seen[r.id + '@' + r.time]);
    for (const r of list) {
      const sess = sessionOf(r); if (!sess || G.sessionState(sess, t) !== 'ouverte') continue;
      const group = list.filter((x) => sessionOf(x) === sess);
      group.forEach((x) => { seen[x.id + '@' + x.time] = 1; });
      const dlOld = Math.min(...active(sortedRaces(sess)).map((x) => G.raceStart(Object.assign({}, x, { time: x.time0 || x.time })).getTime()));
      if (!(G.sessionDeadline(sess).getTime() > dlOld)) { try { localStorage.setItem(MV_KEY, JSON.stringify(seen)); } catch (e) { /* ignoré */ } continue; }   // la deadline (1re course de la session) n'a pas bougé : rien à signaler
      try { localStorage.setItem(MV_KEY, JSON.stringify(seen)); } catch (e) { /* ignoré */ }
      const dl = G.sessionDeadline(sess), todo = active(sortedRaces(sess)).filter((x) => !lockedRace(x) && !isConfirmed(myPicks()[x.id], x));
      openModal(`<div class="gate"><p class="gate__kicker">Départ reporté</p>
        <h2 class="gate__title">Tu as plus de temps pour choisir</h2>
        ${group.map((x) => `<p class="gate__lead"><strong>${fl(placeLabel(x))}</strong> ${discBadge(x)} <span class="gender gender--${x.gender}">${genderLabel(x)}</span> : départ reporté de ${esc(hm(x.time0))} à <strong>${esc(hm(x.time))}</strong>.</p>`).join('')}
        <p class="gate__lead">Les choix de <strong>${fl(sess.name)}</strong> restent ouverts jusqu’au <strong>${esc(dlShort(dl))}</strong> (dans ${esc(leftText(dl - t))}).${todo.length ? ` Il te reste <strong>${todo.length}</strong> choix à faire.` : ' Tous tes choix sont déjà faits : tu peux encore les modifier.'}</p>
        <button type="button" class="btn btn--brique gate__go" data-gate-go="${sess.id}">Voir mes choix</button></div>`);
      return;
    }
  }
  setInterval(() => {
    const c = $('#countdown');
    if (c) c.innerHTML = countdownText(new Date(c.dataset.dl));
    if (!document.hidden) { movedCheck(); dnsAlertCheck(); }
    gateCheck();
  }, 30000);

  /* ---------- Démarrage ---------- */
  window.SKI_DR.init({ state, G, D, isDraft, flag: flagOf, locked: (r) => lockedRace(r), pav, STATS: window.SKI_STATS, LIST: () => LIST, ATH: () => ATH, esc, avatarOf, nameOf, placeLabel, discLabel, sessionOf, openModal, rerender: renderPanel });
  SHARE.init({ state, G, D, esc, nameOf, surname, skn, pln, pname, flagOf: (id) => flagOf((ATH[id] || {}).nat), avatarOf, placeLabel, genderLabel, discLabel, dayOf, lockedRace, ordinal, openModal });
  /** Résultats officiels (data/results.json) : relus chaque minute ; dès qu'une course est officialisée, tout bascule de « en attente » à « officiel ». */
  function loadResults(manual) {
    const btns = manual ? Array.from(document.querySelectorAll('[data-refresh-results]')) : [];
    btns.forEach((b) => { b.disabled = true; b.textContent = 'Vérification…'; });
    return fetch('data/results.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const sg = JSON.stringify((j && j.races) || {}), changed = !!j && j.races && sg !== state.fileSig;
      if (changed) { state.fileSig = sg; state.file = j; recompute(); }
      if (manual) setTimeout(() => { btns.forEach((b) => { if (b.isConnected) { b.disabled = false; b.textContent = changed ? 'Résultat officiel chargé ✓' : 'Pas encore officiel : réessaie dans quelques minutes'; } }); }, 50);
    }).catch(() => { btns.forEach((b) => { b.disabled = false; b.textContent = '↻ Vérifier le résultat officiel'; }); });
  }
  const adminCtx = () => ({ state, G, D, store, LIST, ATH, esc, norm, at, F_DAY, hourText, dlShort, shortOf, placeLabel, discLabel, genderLabel, nameOf, avatarOf, sortedRaces, lockedRace, active, canon, newPlayers, markPlayersSeen, rerender: render, fail, isAdmin });
  const q = new URLSearchParams(location.search);
  const h = location.hash.replace('#', '');
  if (TAB_IDS.includes(h)) state.tab = h;
  if (q.has('demo')) loadDemo();
  else {
    rebuildAthletes(); startStore();
    loadResults(); setInterval(() => { if (document.visibilityState === 'visible') loadResults(); }, 60000);
    fetch('data/extra-athletes.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { state.addl = { M: j.M || [], W: j.W || [] }; recompute(); } }).catch(() => {});
  }
  /** Horaires corrigés (data/time-overrides.json, écrit par tools/check-times.js) : la clôture des choix suit l'heure officielle FIS. */
  const loadTimes = () => fetch('data/time-overrides.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const sg = JSON.stringify((j && j.races) || {}); if (sg === state.timesSig) return; state.timesSig = sg;
    Object.entries((j && j.races) || {}).forEach(([id, o]) => { if (D.RACES[id] && o && o.time) { if (!D.RACES[id].time0) D.RACES[id].time0 = D.RACES[id].time; D.RACES[id].time = o.time; D.RACES[id].timeKnown = true; } });
    scheduleRender(); setTimeout(movedCheck, 400); setTimeout(dnsAlertCheck, 600);
  }).catch(() => {});
  loadTimes(); setInterval(() => { if (document.visibilityState === 'visible') loadTimes(); }, 60000);
  const loadLive = () => fetch('data/live.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.races) { const sg = JSON.stringify(j); if (sg !== state.liveSig) { state.liveSig = sg; state.live = j; scheduleRender(); setTimeout(dnsAlertCheck, 600); } } }).catch(() => {});
  loadLive(); setInterval(() => { if (document.visibilityState === 'visible') loadLive(); }, 60000);
  fetch('data/startlists.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.races) { state.startlists = j; scheduleRender(); setTimeout(dnsAlertCheck, 800); } }).catch(() => {});

  render();
  window.SKI_APP = { state, render, store };
})();
