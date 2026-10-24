/* Ski game – « Data room » : classements des globes (version légère) et tableau brut des résultats (version complète).
   Les données viennent de l'app (contexte C) ; en démonstration, les courses non courues sont complétées par des résultats inventés. */
(function (root) {
  'use strict';
  let C = null;
  const ui = { sub: 'light', g: 'M', disc: [], more: false, last: 8, rows: 'top', prem: { disc: [] } };
  const init = (ctx) => { C = ctx; };
  const DISC = ['DH', 'SG', 'GS', 'SL'], DNAME = { DH: 'Descente', SG: 'Super-G', GS: 'Géant', SL: 'Slalom' };
  const DESKC = { 1: '#2f7fb0', 2: '#2f8a63', 3: '#d27a2a', M: '#2c8f94' };

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
      if (!e.status && e.rank) s.pts += C.G.pointsForRank(e.rank);
    }));
    const rows = Object.values(by).sort((a, b) => b.pts - a.pts || a.n - b.n || C.nameOf(a.ath).localeCompare(C.nameOf(b.ath), 'fr'));
    let last = null, rk = 0; rows.forEach((r, i) => { if (r.pts !== last) { rk = i + 1; last = r.pts; } r.rank = rk; });
    return { races, rows };
  }
  /** Skieurs que j'ai déjà choisis, par desk (1, 2, 3, M = Mondiaux). */
  function mine() {
    const m = {};
    Object.entries(C.state.picks[C.state.me] || {}).forEach(([rid, pk]) => {
      const r = C.G.raceOf(rid); if (!r || !pk || !pk.a || r.cancelled) return;
      const s = C.sessionOf(r); const k = r.kind === 'mondial' ? 'M' : s && s.desk;
      if (k) (m[pk.a] = m[pk.a] || new Set()).add(String(k));
    });
    return m;
  }
  const chip = (attr, v, label, on, cls) => `<button type="button" class="ffc ${cls || ''}" data-dr="${attr}:${v}" aria-pressed="${on}">${label}</button>`;
  const genderChips = () => `<span class="ff__g">${chip('g', 'W', 'Dames', ui.g === 'W', 'ffc--W')}${chip('g', 'M', 'Messieurs', ui.g === 'M', 'ffc--M')}</span>`;
  const discChips = (list) => `<span class="ff__g">${DISC.map((d) => chip('disc', d, C.D.DISC[d].short, list.includes(d), 'ffc--' + d)).join('')}</span>`;

  /* ---------- 1. Classements (version légère) ---------- */
  function light() {
    const { rows } = table(ui.g, ui.disc), used = mine();
    const shown = ui.more ? rows : rows.slice(0, 30);
    const globe = !ui.disc.length ? 'Gros globe (cumul des quatre disciplines)' : ui.disc.length === 1 ? `Petit globe de ${DNAME[ui.disc[0]].toLowerCase()}` : `Cumul : ${ui.disc.map((d) => DNAME[d].toLowerCase()).join(' + ')}`;
    const badges = (id) => ['1', '2', '3', 'M'].map((k) => `<span class="db${used[id] && used[id].has(k) ? ' is-on' : ''}" style="--c:${DESKC[k]}" title="${used[id] && used[id].has(k) ? 'Déjà pris' : 'Pas encore pris'} (${k === 'M' ? 'Mondiaux' : 'Desk ' + k})">${k === 'M' ? 'M' : 'D' + k}</span>`).join('');
    const body = shown.map((r) => `<tr class="${used[r.ath] ? 'is-mine' : ''}"><td class="num"><span class="rnk rnk--${r.rank <= 3 ? r.rank : 'n'}">${r.rank}</span></td>
      <th scope="row"><span class="dr__sk">${C.avatarOf(r.ath, 'sm')}<span class="dr__nm">${C.esc(C.nameOf(r.ath))}</span></span></th>
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
  function premium() {
    const t = table(ui.g, ui.prem.disc), used = mine();
    const races = ui.last ? t.races.slice(-ui.last) : t.races;
    let rows = t.rows;
    if (ui.rows === 'top') rows = rows.slice(0, 30); else if (ui.rows === 'mine') rows = rows.filter((r) => used[r.ath]);
    const head = races.map((r) => `<th scope="col" class="dr__rh" title="${C.esc(`${C.placeLabel(r)} · ${C.discLabel(r)} · ${mo.format(new Date(r.date + 'T12:00:00Z'))}`)}"><span class="dr__pl">${C.esc(C.placeLabel(r).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase())}</span><span class="dr__ds disc disc--${r.disc}">${C.D.DISC[r.disc].short}</span><span class="dr__dt">${mo.format(new Date(r.date + 'T12:00:00Z'))}</span></th>`).join('');
    const body = rows.map((s) => `<tr class="${used[s.ath] ? 'is-mine' : ''}"><th scope="row" class="dr__sticky"><span class="dr__rk">${s.rank}</span><span class="dr__nm">${used[s.ath] ? '★ ' : ''}${C.esc(C.nameOf(s.ath))}</span></th><td class="dr__pts">${s.pts}</td>${races.map((r) => { const e = s.cells[r.id]; return `<td class="dr__c ${cellCls(e)}">${e ? (e.status ? e.status : e.rank) : ''}</td>`; }).join('')}</tr>`).join('');
    const sel = (k, opts) => `<span class="ff__g">${opts.map(([v, l]) => chip(k, v, l, String(ui[k]) === String(v))).join('')}</span>`;
    return `<div class="ff dr__filters" role="group" aria-label="Filtres">${genderChips()}${discChips(ui.prem.disc).replace(/data-dr="disc:/g, 'data-dr="pdisc:')}</div>
      <div class="ff dr__filters"><span class="sub">Courses</span>${sel('last', [[6, '6 dernières'], [12, '12'], [0, 'Toutes']])}<span class="sub">Skieurs</span>${sel('rows', [['top', 'Top 30'], ['all', 'Tous'], ['mine', '★ Mes choix']])}</div>
      <div class="tablewrap tablewrap--scroll dr__wrap"><table class="grid dr__grid"><caption>Résultats, ${ui.g === 'M' ? 'messieurs' : 'dames'} · ${races.length} course${races.length > 1 ? 's' : ''}</caption>
      <thead><tr><th scope="col" class="dr__sticky">Skieur</th><th scope="col" class="dr__pts">Pts</th>${head}</tr></thead><tbody>${body || `<tr><td colspan="${races.length + 2}"><span class="none">Aucun résultat.</span></td></tr>`}</tbody></table></div>
      <p class="hint">Rang à l’arrivée (30 premiers) ; DNF, DNS, DNQ, DSQ sont notés. Case vide : hors des 30 premiers. ★ : skieur que tu as déjà choisi. Fais glisser le tableau pour voir les courses.</p>`;
  }

  function render() {
    const body = ui.sub === 'light' ? light() : premium();
    return `<section class="dr"><header class="deskhead"><div><h2>Data room</h2><p class="deskhead__meta">Classement de la Coupe du monde et résultats bruts${C.state.demo ? ' · données fictives pour les courses pas encore courues' : ''}</p></div></header>
      <div class="deskbar"><div class="seg" role="tablist" aria-label="Data room"><button type="button" role="tab" class="seg__btn" aria-selected="${ui.sub === 'light'}" data-dr="sub:light">Classements</button><button type="button" role="tab" class="seg__btn" aria-selected="${ui.sub === 'prem'}" data-dr="sub:prem">Course par course</button></div></div>
      ${body}</section>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dr]'); if (!b || !C) return;
    const [k, v] = b.dataset.dr.split(':');
    if (k === 'sub') ui.sub = v;
    else if (k === 'g') ui.g = v;
    else if (k === 'more') ui.more = !ui.more;
    else if (k === 'disc' || k === 'pdisc') { const a = k === 'disc' ? ui : ui.prem; if (v === 'clear') a.disc = []; else a.disc = a.disc.includes(v) ? a.disc.filter((x) => x !== v) : a.disc.concat(v); }
    else if (k === 'last') ui.last = Number(v);
    else if (k === 'rows') ui.rows = v;
    C.rerender();
  });
  const api = { init, render, table };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_DR = api;
})(typeof window !== 'undefined' ? window : globalThis);
