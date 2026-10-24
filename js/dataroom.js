/* Ski game – « Data room » : classements des globes (version légère) et tableau brut des résultats (version complète).
   Les données viennent de l'app (contexte C) ; en démonstration, les courses non courues sont complétées par des résultats inventés. */
(function (root) {
  'use strict';
  let C = null;
  const ui = { pp: { disc: [] }, bub: {}, sub: 'light', g: 'M', disc: [], more: false, last: 10, gInit: false, rows: 'top', prem: { disc: [] } };
  const init = (ctx) => { C = ctx; };
  const DISC = ['DH', 'SG', 'GS', 'SL'], DNAME = { DH: 'Descente', SG: 'Super-G', GS: 'Géant', SL: 'Slalom' };
  const DESKC = { 1: '#2f7fb0', 2: '#2f8a63', 3: '#d27a2a', M: '#2c8f94' };

  const rnkc = (rk) => `<span class="rnk rnk--${rk <= 3 ? rk : rk <= 10 ? 'c' : 'n'}">${rk}</span>`;
  const h01 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };

  /** Résultats utilisés : ceux du jeu ; en démonstration, 14 courses par genre complétées de résultats fictifs. */
  let fakeCache = null;
  function fakeResults() {
    if (fakeCache) return fakeCache;
    const out = {};
    ['M', 'W'].forEach((g) => {
      const races = Object.values(C.D.RACES).filter((r) => r.gender === g && r.kind === 'cdm' && !r.cancelled).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 14);
      const pool = C.LIST()[g].slice(0, 70);
      races.forEach((r) => {
        if (C.state.results[r.id]) return;
        const speed = r.disc === 'DH' || r.disc === 'SG';
        const sc = pool.map((a) => ({ a, s: (a.pts || 200) * (0.5 + 0.9 * h01(r.id + a.id)) + 250 * h01(r.id + 'x' + a.id) + (speed === (h01(a.id + 'sp') > 0.5) ? 120 : 0) }));
        const dnf = sc.filter((x) => h01(r.id + x.a.id + 's') < 0.05);
        const ok = sc.filter((x) => !dnf.includes(x)).sort((x, y) => y.s - x.s).slice(0, 30);
        out[r.id] = ok.map((x, i) => ({ ath: x.a.id, rank: i + 1 })).concat(dnf.slice(0, 4).map((x) => ({ ath: x.a.id, status: 'DNF' })));
      });
    });
    return (fakeCache = out);
  }
  const allResults = () => (C.state.demo ? Object.assign({}, fakeResults(), C.state.results) : C.state.results);
  const racesOf = (g, discs, res) => Object.keys(res).map((id) => C.G.raceOf(id)).filter((r) => r && r.gender === g && !r.cancelled && (!discs.length || discs.includes(r.disc))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  /** Points Coupe du monde par skieur et par course. */
  function table(g, discs) {
    const res = allResults(), races = racesOf(g, discs, res), by = {};
    races.forEach((r) => (res[r.id] || []).forEach((e) => {
      const s = (by[e.ath] = by[e.ath] || { ath: e.ath, pts: 0, cells: {}, n: 0 });
      s.cells[r.id] = e; s.n++;
      if (!e.status && e.rank) s.pts += C.G.racePoints(r, e.rank);
    }));
    const rows = Object.values(by).sort((a, b) => b.pts - a.pts || a.n - b.n || C.nameOf(a.ath).localeCompare(C.nameOf(b.ath), 'fr'));
    let last = null, rk = 0; rows.forEach((r, i) => { if (r.pts !== last) { rk = i + 1; last = r.pts; } r.rank = rk; });
    return { races, rows };
  }
  /** Skieurs que j'ai déjà choisis, par desk (1, 2, 3, M = Mondiaux). */
  function mine(drafts) {
    const m = {};
    Object.entries(C.state.picks[C.state.me] || {}).forEach(([rid, pk]) => {
      const r = C.G.raceOf(rid); if (!r || !pk || !pk.a || r.cancelled) return;
      if (!!C.isDraft(pk, r) !== !!drafts) return;
      const s = C.sessionOf(r); const k = r.kind === 'mondial' ? 'M' : s && s.desk;
      if (k) (m[pk.a] = m[pk.a] || new Set()).add(String(k));
    });
    return m;
  }
  /** Nom de famille seul (le champ « fis » commence par le nom en majuscules). */
  function fam(id) {
    const a = C.ATH()[id]; if (!a) return id;
    const t = a.name.split(/\s+/), f = (a.fis || '').split(/\s+/).filter(Boolean);
    if (f.length) { const given = f.filter((w) => w !== w.toUpperCase() || /^[a-zà-ÿ]/.test(w)).length; if (given && given < t.length) return t.slice(given).join(' '); }
    return t[t.length - 1];
  }
  /** Course -> skieur que j'ai choisi. */
  const myPick = (drafts) => { const o = {}; Object.entries(C.state.picks[C.state.me] || {}).forEach(([rid, pk]) => { const r = C.G.raceOf(rid); if (pk && pk.a && r && !!C.isDraft(pk, r) === !!drafts) o[rid] = pk.a; }); return o; };
  const chip = (attr, v, label, on, cls) => `<button type="button" class="ffc ${cls || ''}" data-dr="${attr}:${v}" aria-pressed="${on}">${label}</button>`;
  const genderChips = () => `<span class="ff__g">${chip('g', 'W', 'Dames', ui.g === 'W', 'ffc--W')}${chip('g', 'M', 'Messieurs', ui.g === 'M', 'ffc--M')}</span>`;
  const discChips = (list) => `<span class="ff__g">${DISC.map((d) => chip('disc', d, C.D.DISC[d].short, list.includes(d), 'ffc--' + d)).join('')}</span>`;

  /** Par défaut : le genre de la course terminée la plus récente. */
  function initG() {
    if (ui.gInit) return; ui.gInit = true;
    const res = allResults(); let best = null;
    Object.keys(res).forEach((id) => { const r = C.G.raceOf(id); if (r && !r.cancelled && res[id] && res[id].length && (!best || C.G.raceStart(r) > C.G.raceStart(best))) best = r; });
    if (best) ui.g = best.gender;
  }
  /* ---------- 1. Classements (version légère) ---------- */
  function light() {
    initG(); const { rows } = table(ui.g, ui.disc), used = mine(), dr = mine(true);
    const shown = ui.more ? rows : rows.slice(0, 30);
    const globe = !ui.disc.length ? 'Gros globe (cumul des quatre disciplines)' : ui.disc.length === 1 ? `Petit globe de ${DNAME[ui.disc[0]].toLowerCase()}` : `Cumul : ${ui.disc.map((d) => DNAME[d].toLowerCase()).join(' + ')}`;
    const badges = (id) => ['1', '2', '3', 'M'].map((k) => { const on = used[id] && used[id].has(k), dft = !on && dr[id] && dr[id].has(k); return `<span class="db${on ? ' is-on' : dft ? ' is-draft' : ''}" style="--c:${DESKC[k]}" title="${on ? 'Déjà pris' : dft ? 'Brouillon (non confirmé)' : 'Pas encore pris'} (${k === 'M' ? 'Mondiaux' : 'Desk ' + k})">${k === 'M' ? 'M' : 'D' + k}</span>`; }).join('');
    const body = shown.map((r) => `<tr class="${used[r.ath] ? 'is-mine' : ''}"><td class="num">${rnkc(r.rank)}</td>
      <th scope="row"><button type="button" class="dr__sk dr__lnk" data-dr="sk:id~${r.ath}">${C.avatarOf(r.ath, 'sm')}<span class="dr__nm">${C.esc(C.nameOf(r.ath))}</span></button></th>
      <td class="num"><b>${r.pts}</b></td><td class="dr__bd">${badges(r.ath)}</td></tr>`).join('');
    return `<div class="ff dr__filters" role="group" aria-label="Filtres">${genderChips()}${discChips(ui.disc)}${ui.disc.length ? '<button type="button" class="ff__x" data-dr="disc:clear">Cumul des quatre</button>' : ''}</div>
      <div class="tablewrap"><table class="grid grid--rank dr__light"><caption>${C.esc(globe)}, ${ui.g === 'M' ? 'messieurs' : 'dames'}</caption>
      <thead><tr><th class="num" scope="col">Rang</th><th scope="col">Skieur</th><th class="num" scope="col">Pts</th><th scope="col">Déjà pris par moi</th></tr></thead><tbody>${body || '<tr><td colspan="4"><span class="none">Aucun résultat.</span></td></tr>'}</tbody></table></div>
      ${rows.length > 30 ? `<p class="dr__more"><button type="button" class="btn btn--ghost btn--sm" data-dr="more">${ui.more ? 'Réduire' : `Voir les ${rows.length} skieurs`}</button></p>` : ''}
      <p class="hint">Points de la Coupe du monde (100, 80, 60…), d’après les résultats saisis. D1, D2, D3 et M : skieur déjà choisi dans le desk correspondant ou aux Mondiaux.</p>`;
  }

  /* ---------- 2. Résultats bruts (version complète) ---------- */
  const mo = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const cellCls = (e) => (!e ? 'c-none' : e.status ? 'c-st' : e.rank === 1 ? 'c-1' : e.rank === 2 ? 'c-2' : e.rank === 3 ? 'c-3' : e.rank <= 10 ? 'c-top' : 'c-in');
  /** Code de 3 lettres par lieu, distinct d'une colonne à l'autre (Val d'Isère / Val Gardena…). */
  function codes(races) {
    const out = {}, by = {};
    const base = (p) => p.replace(/[^A-Za-zÀ-ÿ ]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    races.forEach((r) => { const p = placeOf(r); if (out[p]) return; const w = base(p).split(/\s+/).filter(Boolean); out[p] = (w[0] || '').slice(0, 3).toUpperCase(); (by[out[p]] = by[out[p]] || new Set()).add(p); });
    Object.entries(by).forEach(([c, set]) => { if (set.size > 1) [...set].forEach((p) => { const w = base(p).split(/\s+/).filter(Boolean); out[p] = ((w[0] || '')[0] + (w[w.length - 1] || '').slice(0, 2)).toUpperCase(); }); });
    return out;
  }
  const placeOf = (r) => (r.place && !r.kind ? r.place : C.placeLabel(r));
  const frDate = (r) => mo.format(new Date(r.date + 'T12:00:00Z'));
  /** Saison passée (données FIS). */
  let past = null, pastLoading = false;
  function loadPast() {
    if (past || pastLoading) return; pastLoading = true;
    fetch('data/season-2026.json').then((r) => r.json()).then((d) => { past = d; C.rerender(); }).catch(() => { past = { races: [], ath: {}, error: true }; C.rerender(); });
  }
  const byFid = () => { const m = {}; Object.entries(C.ATH()).forEach(([id, a]) => { if (a.fid) m[a.fid] = id; }); return m; };
  const titleCase = (s) => s.toLowerCase().replace(/(^|[ -])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Von|Van|De|Di|Da|Du|Der|Del|Della)\b/g, (x) => x.toLowerCase()).replace(/\bMc([a-z])/g, (m, c) => 'Mc' + c.toUpperCase());
  function pastTable(g, discs) {
    const races = past.races.filter((r) => r.g === g && (!discs.length || discs.includes(r.disc)));
    const by = {}; const map = byFid();
    races.forEach((r) => r.res.forEach(([code, v, cp]) => {
      const s = (by[code] = by[code] || { ath: code, pts: 0, cells: {}, n: 0 });
      s.cells[r.id] = typeof v === 'number' ? { rank: v } : { status: v }; s.n++;
      if (typeof v === 'number') s.pts += cp != null ? cp : C.G.pointsForRank(v);   // points publiés par la FIS (les finales n'en donnent pas à tous)
    }));
    const nameOfCode = (code) => { const id = map[code]; if (id) return fam(id); const n = (past.ath[code] || [code])[0].split(' '); const up = []; while (n.length && n[0] === n[0].toUpperCase()) up.push(n.shift()); return (n.length ? n.join(' ') + ' ' : '') + (up.length ? up : n).join(' ').toUpperCase(); };
    const rows = Object.values(by).sort((a, b) => b.pts - a.pts || a.n - b.n);
    rows.forEach((r) => { r.name = nameOfCode(r.ath); });
    let last = null, rk = 0; rows.forEach((r, i) => { if (r.pts !== last) { rk = i + 1; last = r.pts; } r.rank = rk; });
    return { races, rows };
  }
  function premium(isPast) {
    if (isPast) { loadPast(); if (!past) return '<p class="hint">Chargement des résultats 2025-26…</p>'; if (past.error) return '<p class="hint">Résultats 2025-26 indisponibles.</p>'; }
    const P = isPast ? ui.pp : ui.prem;
    initG(); const t = isPast ? pastTable(ui.g, P.disc) : table(ui.g, P.disc), used = isPast ? {} : mine(), mp = isPast ? {} : myPick(), mpd = isPast ? {} : myPick(true);
    const races = (ui.last ? t.races.slice(-ui.last) : t.races).slice().reverse();   // la course la plus récente à gauche
    let rows = t.rows;
    if (ui.rows === 'top') rows = rows.slice(0, 30); else if (ui.rows === 'mine') rows = isPast ? rows.slice(0, 30) : rows.filter((r) => used[r.ath]);
    const cd = codes(races), pk = isPast ? 'ppdisc' : 'pdisc';
    const head = races.map((r) => `<th scope="col" class="dr__rh" title="${C.esc(`${placeOf(r)} · ${C.D.DISC[r.disc].short} · ${frDate(r)}`)}"><span class="dr__pl">${C.esc(cd[placeOf(r)])}</span><span class="dr__ds disc disc--${r.disc}">${C.D.DISC[r.disc].short}</span><span class="dr__dt">${frDate(r)}</span></th>`).join('');
    const body = rows.map((s) => `<tr class="${used[s.ath] ? 'is-mine' : ''}"><th scope="row" class="dr__sticky"><span class="dr__rk">${s.rank}</span><button type="button" class="dr__nm dr__lnk" data-dr="sk:${isPast ? 'code' : 'id'}~${s.ath}">${used[s.ath] ? '★ ' : ''}${C.esc(isPast ? s.name : C.nameOf(s.ath))}</button></th><td class="dr__pts">${s.pts}</td>${races.map((r) => { const e = s.cells[r.id]; return `<td class="dr__c ${cellCls(e)}${mp[r.id] === s.ath ? ' c-pick' : mpd[r.id] === s.ath ? ' c-pick c-pick--draft' : ''}"${mp[r.id] === s.ath ? ' title="Ton choix pour cette course"' : mpd[r.id] === s.ath ? ' title="Ton brouillon pour cette course"' : ''}>${e ? (e.status ? e.status : e.rank) : ''}</td>`; }).join('')}</tr>`).join('');
    const sel = (k, opts) => `<span class="ff__g">${opts.map(([v, l]) => chip(k, v, l, String(ui[k]) === String(v))).join('')}</span>`;
    const rowOpts = isPast ? [['top', 'Top 30'], ['all', 'Tous']] : [['top', 'Top 30'], ['all', 'Tous'], ['mine', '★ Mes choix']];
    return `<div class="ff dr__filters" role="group" aria-label="Filtres">${genderChips()}${discChips(P.disc).replace(/data-dr="disc:/g, `data-dr="${pk}:`)}</div>
      <div class="ff dr__filters"><span class="sub">Courses</span>${sel('last', [[5, '5 dernières'], [10, '10'], [20, '20'], [0, 'Toutes']])}<span class="sub">Skieurs</span>${sel('rows', rowOpts)}</div>
      <div class="tablewrap tablewrap--scroll dr__wrap"><table class="grid dr__grid${isPast ? ' dr__grid--past' : ''}"><caption>${isPast ? 'Saison 2025-26 · ' : ''}${ui.g === 'M' ? 'Messieurs' : 'Dames'} · ${races.length} course${races.length > 1 ? 's' : ''}</caption>
      <thead><tr><th scope="col" class="dr__sticky">Skieur</th><th scope="col" class="dr__pts">Pts</th>${head}</tr></thead><tbody>${body || `<tr><td colspan="${races.length + 2}"><span class="none">Aucun résultat.</span></td></tr>`}</tbody></table></div>
      <p class="hint">Rang à l’arrivée (30 premiers) ; DNF, DNS, DNQ, DSQ sont notés. Case vide : hors des 30 premiers.${isPast ? ' Points : barème Coupe du monde sur les courses affichées.' : ' ★ : skieur que tu as déjà choisi ; case encadrée : ton choix pour cette course.'} Fais glisser le tableau pour voir les courses.</p>`;
  }

  /* ---------- 3. Bulles : un skieur choisi qui ne marque aucun point (hors DNS) ---------- */
  function bubbles() {
    const res = allResults(), ev = [];
    C.state.players.forEach((pl) => Object.entries(C.state.picks[pl.id] || {}).forEach(([rid, pk]) => {
      const r = C.G.raceOf(rid); if (!r || r.cancelled || !res[rid] || !pk || !pk.a) return;
      const ath = C.G.effectiveAthlete(pk, res, rid), e = (res[rid] || []).find((x) => x.ath === ath);
      if (e && e.status === 'DNS') return;
      if (e && !e.status && e.rank && C.G.racePoints(r, e.rank) > 0) return;
      ev.push({ pl, ath, r, why: e && e.status ? e.status : 'hors points' });
    }));
    return ev;
  }
  function rankBy(ev, keyF, subF, labelF) {
    const m = {};
    ev.forEach((x) => { const k = keyF(x); const o = (m[k] = m[k] || { k, n: 0, sub: {} }); o.n++; const s = subF(x); (o.sub[s] = o.sub[s] || { s, n: 0, why: [] }).n++; o.sub[s].why.push(labelF(x)); });
    const rows = Object.values(m).sort((a, b) => b.n - a.n);
    let last = null, rk = 0; rows.forEach((r, i) => { if (r.n !== last) { rk = i + 1; last = r.n; } r.rank = rk; });
    return rows;
  }
  function bubbleList(rows, linkF, subLinkF, id) {
    const shown = ui.bub[id] ? rows : rows.slice(0, 10);
    const li = shown.map((r) => `<li class="bb">${rnkc(r.rank)}<div class="bb__main"><div class="bb__h"><b>${linkF(r.k)}</b><span class="bb__n" title="${r.n} bulle${r.n > 1 ? 's' : ''}">${r.n} <small>✗</small></span></div>
      <div class="bb__d">${Object.values(r.sub).sort((a, b) => b.n - a.n).map((s) => `<span class="bb__c" title="${C.esc(s.why.join(' · '))}">${subLinkF(s.s)}${s.n > 1 ? ` <b>×${s.n}</b>` : ''}</span>`).join('')}</div></div></li>`).join('');
    return `<ol class="bblist">${li || '<li class="none">Aucune bulle pour l’instant.</li>'}</ol>${rows.length > 10 ? `<p class="dr__more"><button type="button" class="btn btn--ghost btn--sm" data-dr="bub:${id}">${ui.bub[id] ? 'Réduire' : `Voir les ${rows.length}`}</button></p>` : ''}`;
  }
  function bulles() {
    const ev = bubbles(), pn = (id) => (C.state.players.find((p) => p.id === id) || {}).name || id;
    const skLink = (id) => `<button type="button" class="dr__lnk" data-dr="sk:id~${id}">${C.esc(C.nameOf(id))}</button>`;
    const plLink = (pid) => `<button type="button" class="dr__lnk" data-player="${C.esc(pid)}">${C.esc(pn(pid))}</button>`;
    const lab = (x) => `${C.placeLabel(x.r)} ${C.D.DISC[x.r.disc].short} : ${x.why}`;
    const victims = rankBy(ev, (x) => x.ath, (x) => x.pl.id, lab);
    // « bulles » : une seule par skieur et par course, quel que soit le nombre de joueurs qui l'avaient choisi
    const seen = new Set(), once = ev.filter((x) => { const k = x.ath + '|' + x.r.id; if (seen.has(k)) return false; seen.add(k); return true; });
    const bub = rankBy(once, (x) => x.ath, (x) => x.r.id, lab);
    const bubSub = (rid) => { const r = C.G.raceOf(rid); return `<span class="dr__lnk">${C.esc(C.placeLabel(r) + ' ' + C.D.DISC[r.disc].short)}</span>`; };
    return `<p class="hint">Une bulle : le skieur choisi fait 0 point (DNF, disqualifié, non qualifié ou hors des 30 premiers). Un DNS n’en est pas une. Tous desks confondus, remplaçants pris en compte.</p>
      <h3 class="subtitle">Les skieurs qui ont fait le plus de victimes<span class="bb__tot">${ev.length} au total</span></h3><p class="hint">Un skieur à 0 point choisi par 5 joueurs compte pour 5 victimes.</p>${bubbleList(victims, (id) => skLink(id), (pid) => plLink(pid), 'sk')}
      <h3 class="subtitle">Les skieurs qui font le plus de bulles <span class="bb__tot">${once.length} au total</span></h3><p class="hint">Une bulle par course, quel que soit le nombre de joueurs touchés.</p>${bubbleList(bub, (id) => skLink(id), bubSub, 'pl')}`;
  }

  /* ---------- Fiche skieur : saison en cours (2026-27) et saison passée (2025-26) ---------- */
  const nkey = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join(' ');
  let codeMap = null;
  function pastIndex() {
    if (codeMap) return codeMap; if (!past) return { byId: {}, byCode: {} };
    codeMap = { byId: {}, byCode: {} };
    const idx = {}; Object.entries(C.ATH()).forEach(([id, a]) => { idx[nkey(a.fis || a.name)] = id; idx[nkey(a.name)] = idx[nkey(a.name)] || id; });
    Object.entries(past.ath).forEach(([code, [name]]) => { const id = idx[nkey(name)]; if (id) { codeMap.byId[id] = code; codeMap.byCode[code] = id; } });
    return codeMap;
  }
  const sk = { id: null, code: null, season: 'now' };
  function skierRows(id, code, season) {
    if (season === 'now') {
      const res = allResults(), g = (C.ATH()[id] || {}).gender || null;
      return Object.keys(res).map((rid) => { const r = C.G.raceOf(rid), e = (res[rid] || []).find((x) => x.ath === id); return r && e && !r.cancelled ? { r, place: placeOf(r), date: r.date, disc: r.disc, rank: e.status ? null : e.rank, status: e.status || '', pts: e.status ? 0 : C.G.racePoints(r, e.rank) } : null; }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    }
    if (!past || !code) return [];
    return past.races.map((r) => { const e = r.res.find((x) => x[0] === code); return e ? { place: r.place.replace(/\s*\([^)]*\)\s*$/, ''), date: r.date, disc: r.disc, rank: typeof e[1] === 'number' ? e[1] : null, status: typeof e[1] === 'number' ? '' : e[1], pts: typeof e[1] === 'number' ? (e[2] != null ? e[2] : C.G.pointsForRank(e[1])) : 0 } : null; }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  }
  function skierSheet() {
    loadPast(); const ix = pastIndex();
    const id = sk.id || ix.byCode[sk.code] || null, code = sk.code || ix.byId[id] || null;
    const a = id ? C.ATH()[id] : null;
    const pn = a ? a.name : (code && past && past.ath[code] ? titleCase(past.ath[code][0].split(' ').filter((w) => w !== w.toUpperCase()).join(' ')) + ' ' + titleCase(past.ath[code][0].split(' ').filter((w) => w === w.toUpperCase()).join(' ')) : '');
    const nat = a ? a.nat : (code && past && past.ath[code] ? past.ath[code][1] : '');
    const rows = skierRows(id, code, sk.season), pts = rows.reduce((s, r) => s + r.pts, 0);
    const wins = rows.filter((r) => r.rank === 1).length, podium = rows.filter((r) => r.rank && r.rank <= 3).length, top10 = rows.filter((r) => r.rank && r.rank <= 10).length, zero = rows.filter((r) => r.status !== 'DNS' && !r.pts).length;   // bulle : 0 point hors DNS
    const byD = {}; rows.forEach((r) => { byD[r.disc] = (byD[r.disc] || 0) + r.pts; });
    const used = id ? mine()[id] : null;
    const tile = (v, l, k) => `<div class="sk__t sk__t--${k}"><b>${v}</b><span>${l}</span></div>`;
    const list = rows.slice().reverse().map((r) => `<li class="sk__r"><span class="sk__d">${frDate(r)}</span><span class="sk__p">${C.esc(placeOf(r))}</span><span class="disc disc--${r.disc}">${C.D.DISC[r.disc].short}</span><span class="sk__k ${cellCls(r.rank ? { rank: r.rank } : { status: r.status })}">${r.rank || r.status}</span><span class="sk__pt">${r.pts ? '+' + r.pts : '0'}</span></li>`).join('');
    return `<div class="sk"><header class="sk__h">${id ? C.avatarOf(id, 'lg') : ''}<div><h2 class="sk__n">${C.esc(pn)}</h2><p class="sk__m">${C.esc(nat)}${a && a.rank ? ` · n° ${a.rank} du classement ${a.rank ? '2025-26' : ''}` : ''}</p>${used ? `<p class="sk__m">Déjà pris : ${['1', '2', '3', 'M'].filter((k) => used.has(k)).map((k) => (k === 'M' ? 'Mondiaux' : 'Desk ' + k)).join(', ')}</p>` : ''}</div></header>
      <div class="seg sk__seg" role="tablist"><button type="button" role="tab" class="seg__btn" aria-selected="${sk.season === 'now'}" data-dr="skseason:now">2026-27</button><button type="button" role="tab" class="seg__btn seg__btn--past" aria-selected="${sk.season === 'past'}" data-dr="skseason:past">2025-26</button></div>
      ${sk.season === 'past' && !past ? '<p class="hint">Chargement…</p>' : `<div class="sk__tiles">${tile(pts, 'points', 'pts')}${tile(rows.length, rows.length > 1 ? 'courses' : 'course', 'c')}${tile(wins, wins > 1 ? 'victoires' : 'victoire', 'win')}${tile(podium, podium > 1 ? 'podiums' : 'podium', 'pod')}${tile(top10, 'top 10', 'top')}${tile(zero, zero > 1 ? 'bulles' : 'bulle', 'bub')}</div>
      <p class="sk__disc">${['DH', 'SG', 'GS', 'SL'].filter((d) => byD[d] != null).map((d) => `<span class="disc disc--${d}">${C.D.DISC[d].short}</span> <b>${byD[d]}</b>`).join(' · ') || ''}</p>
      <ul class="sk__list">${list || '<li class="none">Aucun résultat sur cette saison.</li>'}</ul>`}</div>`;
  }
  const openSkier = (id, code, season) => { sk.id = id || null; sk.code = code || null; sk.season = season || sk.season; loadPast(); C.openModal(skierSheet(), 'modal__card--sk'); };

  function render() {
    const body = ui.sub === 'light' ? light() : ui.sub === 'bub' ? bulles() : premium(ui.sub === 'past');
    return `<section class="dr"><header class="deskhead"><div><h2>Data room</h2><p class="deskhead__meta">Classement de la Coupe du monde et résultats bruts${C.state.demo && ui.sub !== 'past' ? ' · données fictives pour les courses pas encore courues' : ''}</p></div></header>
      <div class="deskbar"><div class="seg" role="tablist" aria-label="Data room"><button type="button" role="tab" class="seg__btn" aria-selected="${ui.sub === 'light'}" data-dr="sub:light">Classements</button><button type="button" role="tab" class="seg__btn" aria-selected="${ui.sub === 'prem'}" data-dr="sub:prem">Par course</button><button type="button" role="tab" class="seg__btn" aria-selected="${ui.sub === 'bub'}" data-dr="sub:bub">Bulles</button><button type="button" role="tab" class="seg__btn seg__btn--past" aria-selected="${ui.sub === 'past'}" data-dr="sub:past">2025-26</button></div></div>
      ${body}</section>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dr]'); if (!b || !C) return;
    const [k, v] = b.dataset.dr.split(':');
    if (k === 'sk') { const [t, x] = v.split('~'); openSkier(t === 'id' ? x : null, t === 'code' ? x : null, ui.sub === 'past' ? 'past' : 'now'); return; }
    if (k === 'skseason') { sk.season = v; C.openModal(skierSheet(), 'modal__card--sk'); return; }
    if (k === 'sub') ui.sub = v;
    else if (k === 'g') ui.g = v;
    else if (k === 'bub') ui.bub[v] = !ui.bub[v];
    else if (k === 'more') ui.more = !ui.more;
    else if (k === 'disc' || k === 'pdisc' || k === 'ppdisc') { const a = k === 'disc' ? ui : k === 'pdisc' ? ui.prem : ui.pp; if (v === 'clear') a.disc = []; else a.disc = a.disc.includes(v) ? a.disc.filter((x) => x !== v) : a.disc.concat(v); }
    else if (k === 'last') ui.last = Number(v);
    else if (k === 'rows') ui.rows = v;
    C.rerender();
  });
  const api = { init, render, table };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_DR = api;
})(typeof window !== 'undefined' ? window : globalThis);
