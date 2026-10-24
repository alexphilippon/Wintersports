/* Ski game – fiche d'une course : classement réel, qui a pris qui, et exports (message à copier, image JPG).
   Les données viennent de l'app (contexte C) ; les fonctions de calcul ne touchent pas au DOM. */
(function (root) {
  'use strict';
  let C = null;
  const init = (ctx) => { C = ctx; };

  /** Lignes de la fiche : un skieur par ligne, avec ceux qui l'ont pris. */
  function raceRows(race) {
    const { state, G } = C;
    const res = state.results[race.id] || null;
    const by = {};
    const row = (ath) => (by[ath] = by[ath] || { ath, pickers: [] });
    if (res) res.forEach((e) => { const r = row(e.ath); r.rank = e.rank; r.status = e.status || ''; r.bib = e.bib; });
    state.players.forEach((p) => {
      const pk = (state.picks[p.id] || {})[race.id];
      if (!pk || !pk.a || !C.lockedRace(race)) return;
      const eff = G.effectiveAthlete(pk, state.results, race.id);
      const sc = G.scoreRace(race, pk, state.results);
      const kind = eff === pk.a ? 'titulaire' : eff === pk.b ? 'remplaçant' : 'tiré au sort';
      row(eff).pickers.push({ p, kind, pts: sc });
      if (eff !== pk.a) row(pk.a).pickers.push({ p, kind: 'non-partant', pts: 0, out: true });
    });
    let rows = Object.values(by);
    const ranked = rows.filter((r) => r.rank && !r.status).sort((a, b) => a.rank - b.rank);
    const others = rows.filter((r) => !(r.rank && !r.status));
    const picked = (r) => r.pickers.length > 0;
    if (res) {
      rows = ranked.filter((r) => r.rank <= 30 || picked(r)).concat(others.filter(picked).sort((a, b) => (a.status || 'Z').localeCompare(b.status || 'Z')));
    } else {
      rows = rows.filter(picked).sort((a, b) => b.pickers.length - a.pickers.length || C.nameOf(a.ath).localeCompare(C.nameOf(b.ath), 'fr'));
    }
    const N = state.players.filter((p) => { const pk = (state.picks[p.id] || {})[race.id]; return pk && pk.a; }).length;
    const shares = rows.filter(picked).map((r) => { const n = r.pickers.filter((x) => !x.out).length; return Object.assign(r, { n, N, pct: N ? Math.round(100 * n / N) : 0 }); })
      .filter((r) => r.n > 0).sort((a, b) => b.n - a.n || (a.rank || 99) - (b.rank || 99) || C.nameOf(a.ath).localeCompare(C.nameOf(b.ath), 'fr'));
    const podium = res ? res.filter((e) => !e.status && e.rank && e.rank <= 3).sort((a, b) => a.rank - b.rank) : [];
    return { res, rows, shares, podium, N, show: C.lockedRace(race) };
  }
  const gname = (r) => `${C.discLabel(r)} ${C.genderLabel(r).toLowerCase()}`;   // « Géant messieurs »
  const titleOf = (race) => `${C.placeLabel(race)} · ${gname(race)}`;
  const pts = (p) => (p.pts == null ? '' : ` (${p.pts > 0 ? '+' : ''}${p.pts})`);
  const how = (r) => (r.status ? r.status : r.rank ? C.ordinal(r.rank) : 'hors classement');

  /** Message à coller (WhatsApp) : choix seuls avant le résultat, résultat + choix ensuite. */
  function raceTextPre(race) {
    const { shares, res, podium, N } = raceRows(race);
    const L = [`🎿 *${titleOf(race)}* (${C.dayOf(race.date)})`];
    if (!shares.length) { L.push('Aucun choix.'); return L.join('\n'); }
    L.push(res ? '🏁 Qui avait pris qui (et résultat) :' : '👀 Qui a pris qui :', '');
    shares.forEach((r) => {
      const who = r.pickers.map((x) => x.p.name + (x.kind === 'remplaçant' ? ' (remplaçant)' : x.kind === 'tiré au sort' ? ' (tirage au sort)' : x.out ? ' (non-partant)' : '')).join(', ');
      const sc = res ? ` · ${how(r)}${r.rank && !r.status ? ` · ${C.G.racePoints(race, r.rank) * race.mult} pts` : ''}` : '';
      L.push(`• ${C.nameOf(r.ath)} : ${r.n}/${N}${sc} → ${who}`);
    });
    if (podium.length) L.push('', '🥇 Podium : ' + podium.map((e) => `${e.rank}. ${C.nameOf(e.ath)}`).join(' · '));
    return L.join('\n');
  }

  /* ---------- Fiche (fenêtre) ---------- */
  function cardHtml(race) {
    const { esc } = C;
    const all = raceRows(race), { res, show } = all;
    const head = `<h3 class="rc__title">${esc(titleOf(race))}</h3><p class="rc__date">${esc(C.dayOf(race.date))}${race.cancelled ? ' · annulée' : ''}</p>`;
    if (race.cancelled) return head + '<p class="hint">Course annulée.</p>';
    if (!show) return head + '<p class="hint">Les choix de chacun seront visibles au départ de la première course de la session.</p>';
    const { shares, podium, N } = all;
    const body = shares.length ? `<ol class="rc__list">${shares.map((r) => {
      const chips = r.pickers.map((x) => `<span class="rc__chip${x.p.id === C.state.me ? ' me' : ''}${x.out ? ' is-out' : ''}${res && !x.out && !x.pts ? ' is-zero' : ''}" title="${esc(x.kind)}">${C.pln(x.p)}${x.kind === 'remplaçant' ? ' <i>rempl.</i>' : x.kind === 'tiré au sort' ? ' <i>tirage</i>' : x.out ? ' <i>non-partant</i>' : ''}${res && !x.out && x.pts != null ? `<b>${x.pts > 0 ? '+' : ''}${x.pts}</b>` : ''}</span>`).join('');
      const mine = r.pickers.some((x) => x.p.id === C.state.me && !x.out);
      return `<li class="rc__row${mine ? ' is-mine' : ''}"><span class="rc__rk">${res ? (r.status ? esc(r.status) : r.rank ? r.rank : '–') : ''}</span>${C.avatarOf(r.ath, 'sm')}<span class="rc__sk">${C.skn(r.ath)} <b class="rc__pct">${r.n}/${N}</b></span><span class="rc__bar"><i style="width:${Math.max(r.pct, 3)}%"></i></span><span class="rc__who">${chips}</span></li>`;
    }).join('')}</ol>` : '<p class="hint">Aucun choix pour cette course.</p>';
    const pod = podium.length ? `<p class="rc__pod"><b>Podium</b> ${podium.map((e) => `${e.rank}. ${esc(C.nameOf(e.ath))}`).join(' · ')}</p>` : '';
    const note = res ? '' : '<p class="hint">Résultat pas encore saisi.</p>';
    return `${head}${note}${res ? fullHtml(race) : ''}${res ? '' : pod}${res ? '' : body}<div class="rc__act"><button type="button" class="btn" data-rc-copy="${race.id}">Copier le message</button><button type="button" class="btn btn--ghost" data-rc-jpg="${race.id}">Image JPG</button></div>${res ? `<p class="rf__sub">Classement général des joueurs (mise à jour)</p><div class="rc__act"><button type="button" class="btn" data-rc-gcopy="${race.id}">Copier le message</button><button type="button" class="btn btn--ghost" data-rc-gjpg="${race.id}">Image JPG</button></div>` : ''}<p class="auth__err" id="rc-msg" role="status"></p>`;
  }

  /* ---------- Résultat complet : classement des joueurs + classement des skieurs (temps) ---------- */
  const cs = (t) => { const m = String(t || '').match(/^(?:(\d+):)?(\d+)\.(\d\d)$/); return m ? (+(m[1] || 0)) * 6000 + (+m[2]) * 100 + (+m[3]) : null; };
  const diffOf = (t, t0) => { const a = cs(t), b = cs(t0); if (a == null || b == null) return ''; const d = a - b; if (d <= 0) return ''; return '+' + (d / 100).toFixed(2); };
  function fullHtml(race) {
    const { state, G, esc } = C, res = state.results[race.id];
    if (!res) return '';
    const pl = [];
    state.players.forEach((p) => {
      const pk = (state.picks[p.id] || {})[race.id]; if (!pk || !pk.a || !C.lockedRace(race)) return;
      const eff = G.effectiveAthlete(pk, state.results, race.id), e = res.find((x) => x.ath === eff);
      pl.push({ p, eff, e, pts: G.scoreRace(race, pk, state.results) || 0, sub: eff !== pk.a ? pk.a : null });
    });
    pl.sort((a, b) => b.pts - a.pts || C.nameOf(a.eff).localeCompare(C.nameOf(b.eff), 'fr'));
    let last = null, rk = 0; pl.forEach((r, i) => { if (r.pts !== last) { rk = i + 1; last = r.pts; } r.rk = rk; });
    const how = (e) => (e ? (e.status || (e.rank ? C.ordinal(e.rank) : '–')) : 'non classé');
    const rkc = (n) => `<span class="rnk rnk--${n <= 3 ? n : n <= 10 ? 'c' : 'n'}">${n}</span>`;
    const picked = {}; pl.forEach((r) => { (picked[r.eff] = picked[r.eff] || []).push(r.p); });
    const ranked = res.filter((e) => !e.status && e.rank).sort((a, b) => a.rank - b.rank), t0 = ranked[0] && ranked[0].time;
    const hasT = ranked.some((e) => e.time);
    const plRows = pl.map((r) => `<tr class="${r.p.id === state.me ? 'me' : ''}"><td class="num">${rkc(r.rk)}</td><th scope="row">${C.pname ? C.pname(r.p) : C.pln(r.p)}</th>
      <td><span class="rf__ath">${C.avatarOf(r.eff, 'sm')}${C.flagOf(r.eff)}<span>${C.skn(r.eff)}<em class="rf__how${r.e && (r.e.status || r.e.rank > 30) ? ' bad' : ''}">${esc(how(r.e))}</em>${r.sub ? `<span class="sub">remp. de ${C.skn(r.sub)}</span>` : ''}</span></span></td>
      <td class="num total">${r.pts > 0 ? '+' : ''}${r.pts}</td></tr>`).join('');
    const plTable = pl.length ? `<div class="tablewrap"><table class="grid grid--rank rf__tb cap--gen"><caption>Classement des joueurs</caption>
      <thead><tr><th scope="col" class="num">Rang</th><th scope="col">Joueur</th><th scope="col">Skieur choisi</th><th scope="col" class="num th--tot">Points</th></tr></thead><tbody>${plRows}</tbody></table></div>` : '<p class="hint">Aucun choix pour cette course.</p>';
    const chips = (a) => (picked[a] || []).map((p) => `<span class="rc__chip${p.id === state.me ? ' me' : ''}">${C.pln(p)}</span>`).join(' ');
    const mineRow = (a) => (picked[a] || []).some((p) => p.id === state.me) ? 'me' : '';
    const rows = ranked.map((e) => `<tr class="${mineRow(e.ath)}"><td class="num">${rkc(e.rank)}</td><th scope="row"><span class="rf__ath">${C.avatarOf(e.ath, 'sm')}${C.flagOf(e.ath)}<span>${C.skn(e.ath)}</span></span></th>${hasT ? `<td class="num">${esc(e.time || '')}${e.time && e.rank > 1 ? `<br><span class="sub">${esc(diffOf(e.time, t0))}</span>` : ''}</td>` : ''}<td>${chips(e.ath)}</td></tr>`);
    const out = res.filter((e) => e.status && e.status !== 'DNQ' && e.status !== 'DNS' && !(e.status === 'DNF' && e.run === 1) || (e.status === 'DNS' && picked[e.ath]));
    out.forEach((e) => rows.push(`<tr class="is-st ${mineRow(e.ath)}"><td class="num"><span class="rnk rnk--n rnk--st">${esc(e.status)}</span></td><th scope="row"><span class="rf__ath">${C.avatarOf(e.ath, 'sm')}${C.flagOf(e.ath)}<span>${C.skn(e.ath)}</span></span></th>${hasT ? '<td></td>' : ''}<td>${chips(e.ath)}</td></tr>`));
    // « Did not qualify » : non-qualifiés pour la 2e manche, classés au temps de la 1re manche
    const dnq = res.filter((e) => e.status === 'DNQ' || (e.status === 'DNF' && e.run === 1)).sort((a, b) => (cs(a.time) == null) - (cs(b.time) == null) || (cs(a.time) || 0) - (cs(b.time) || 0));
    if (dnq.length) {
      rows.push(`<tr class="rf__sec"><th colspan="${hasT ? 4 : 3}" scope="colgroup">${race.gender === 'W' ? 'Pas qualifiées' : 'Pas qualifiés'} en 2e manche <span class="sub">· ${race.gender === 'W' ? 'classées' : 'classés'} au temps de la 1re manche, abandons en dernier</span></th></tr>`);
      dnq.forEach((e) => rows.push(`<tr class="is-nq ${mineRow(e.ath)}"><td class="num"><span class="rnk rnk--n rnk--st">${e.status === 'DNF' ? 'DNF' : 'NQ'}</span></td><th scope="row"><span class="rf__ath">${C.avatarOf(e.ath, 'sm')}${C.flagOf(e.ath)}<span>${C.skn(e.ath)}</span></span></th>${hasT ? `<td class="num">${esc(e.time || '')}</td>` : ''}<td>${chips(e.ath)}</td></tr>`));
    }
    const nq = 0, ns = res.filter((e) => e.status === 'DNS' && !picked[e.ath]).length;
    const foot = [nq ? `${nq} non qualifié${nq > 1 ? 's' : ''} (DNQ)` : '', ns ? `${ns} non-partant${ns > 1 ? 's' : ''} (DNS)` : ''].filter(Boolean).join(' · ');
    const skTable = `<div class="tablewrap"><table class="grid grid--rank rf__tb cap--gen"><caption>Classement de la course</caption><thead><tr><th scope="col" class="num">Rang</th><th scope="col">Skieur</th>${hasT ? '<th scope="col" class="num">Temps</th>' : ''}<th scope="col">Joueurs</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${foot ? `<p class="sub">${foot}</p>` : ''}`;
    const tab = rfTab === 'sk' ? 'sk' : 'pl';
    return `<div class="seg rf__seg" role="tablist" aria-label="Résultat détaillé"><button type="button" role="tab" class="seg__btn" aria-selected="${tab === 'pl'}" data-rf="pl">Classement des joueurs</button><button type="button" role="tab" class="seg__btn" aria-selected="${tab === 'sk'}" data-rf="sk">Classement de la course</button></div>
      <div class="rf__p" data-rfp="pl"${tab === 'pl' ? '' : ' hidden'}>${plTable}</div><div class="rf__p" data-rfp="sk"${tab === 'sk' ? '' : ' hidden'}>${skTable}</div>`;
  }
  let rfTab = 'pl';
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rf]'); if (!b) return;
    rfTab = b.dataset.rf;
    const root = b.closest('.rc') || document;
    root.querySelectorAll('[data-rf]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    root.querySelectorAll('[data-rfp]').forEach((x) => { x.hidden = x.dataset.rfp !== rfTab; });
  });
  function open(raceId) {
    const race = C.G.raceOf(raceId); if (!race) return;
    C.openModal(`<div class="rc">${cardHtml(race)}</div>`);
    const card = document.querySelector('#modal .modal__card'); if (card) card.classList.add('modal__card--wide');
  }
  const say = (t) => { const m = document.getElementById('rc-msg'); if (m) m.textContent = t; else if (t) toast(t); };
  /** Petit message flottant (exports lancés depuis une page, hors fenêtre). */
  function toast(t) {
    let el = document.getElementById('xp-toast');
    if (!el) { el = document.createElement('div'); el.id = 'xp-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200);
  }
  async function copy(raceId) {
    const txt = raceText(C.G.raceOf(raceId));
    try { await navigator.clipboard.writeText(txt); say('Message copié : colle-le dans WhatsApp.'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); say('Message copié : colle-le dans WhatsApp.'); } catch (e2) { say('Copie impossible : sélectionne le texte à la main.'); }
      ta.remove();
    }
  }

  /* ---------- Image JPG (canvas, proportions maîtrisées) ---------- */
  let W = 1080;
  const TH = { sapin: { t: '#2b5f4b', b: '#163629', chev: 'rgba(143,192,164,.18)', edge: '#e9f0f2', gold: '#f1d78a', head: '#fff', sub: '#d4e6ef', bg: '#fbf8ef', band: '#f3efe2', ink: '#1b2b44', soft: '#675e51', bad: '#a93a2c', foot: '#1f4a3a', footT: '#e9f0f2', ph: '#8faec0', track: '#e4e1d3', bar: '#2f8089' },
    glace: { t: '#f1f9fd', b: '#a8cfe4', chev: 'rgba(255,255,255,.4)', edge: '#ffffff', gold: '#1d6a9c', head: '#123a55', sub: '#2c5b78', bg: '#fbfdff', band: '#eaf3f9', ink: '#17364d', soft: '#566b79', bad: '#b83a2a', foot: '#1e5a80', footT: '#ffffff', ph: '#a8cfe4', track: '#d3e1eb', bar: '#1e5a80' },
    nuit: { t: '#1c2f55', b: '#0b1322', chev: 'rgba(120,160,230,.18)', edge: '#2f56d6', gold: '#8fb4ff', head: '#ffffff', sub: '#c9d9f5', bg: '#18222f', band: '#1e2b3b', ink: '#e4eaf2', soft: '#9aaabd', bad: '#ff9a8a', foot: '#0b1322', footT: '#cfe0ff', ph: '#3d527f', track: '#293648', bar: '#5b8cf0' },
    noel: { t: '#b3261e', b: '#6e0f18', chev: 'rgba(255,220,150,.2)', edge: '#e6b94c', gold: '#ffd86b', head: '#fff', sub: '#ffe9c9', bg: '#fffaf1', band: '#f7ebdb', ink: '#2a1a17', soft: '#7a625a', bad: '#b3261e', foot: '#1f5a3a', footT: '#fff8e8', ph: '#e0a79c', track: '#ecdcc6', bar: '#1f5a3a' } };
  function loadImg(src) { return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  async function jpgCanvasPre(race) {
    const all = raceRows(race), res = all.res;
    const rows = all.shares;
    const ctx0 = document.createElement('canvas').getContext('2d');
    const F = '"Instrument Sans","Helvetica Neue",Arial,sans-serif', FD = '"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif';
    const padX = 56, nameX = padX + 70 + 60 + 18, nameW = 330, whoX = nameX + nameW + 20, whoW = W - padX - whoX;
    ctx0.font = `600 28px ${F}`;
    const lay = rows.map((r) => {
      const txt = r.pickers.map((x) => x.p.name + (res && !x.out && x.pts ? ` +${x.pts}` : '') + (x.kind === 'remplaçant' ? ' (rempl.)' : x.kind === 'tiré au sort' ? ' (tirage)' : x.out ? ' (non-partant)' : '')).join(' · ');
      const lines = wrap(ctx0, txt, whoW);
      return { r, lines, h: Math.max(84, 28 + lines.length * 36) };
    });
    const headH = all.podium.length ? 290 : 250, footH = 90;
    let bodyH = lay.reduce((s, l) => s + l.h, 0);
    const H = Math.min(Math.max(headH + bodyH + footH, 1080), 2400);
    const K = TH[document.documentElement.getAttribute('data-theme')] || TH.sapin;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = K.bg; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, 0, headH); gr.addColorStop(0, K.t); gr.addColorStop(1, K.b);
    g.fillStyle = gr; g.fillRect(0, 0, W, headH);
    g.strokeStyle = K.chev; g.lineWidth = 2; // chevrons sapin
    for (let y = 18; y < headH; y += 30) for (let x = ((y / 30) % 2) * 20; x < W; x += 40) { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 8, y); g.lineTo(x + 16, y + 8); g.stroke(); }
    g.fillStyle = K.edge; g.fillRect(0, headH - 6, W, 6);
    g.fillStyle = K.gold; g.font = `800 30px ${FD}`; g.textBaseline = 'alphabetic'; g.fillText('SKI GAME · COUPE DU MONDE 2026-27', padX, 70);
    g.fillStyle = K.head; g.font = `800 62px ${FD}`;
    const t1 = C.placeLabel(race); g.fillText(t1, padX, 150);
    g.font = `600 34px ${F}`; g.fillStyle = K.sub;
    g.fillText(`${gname(race)} · ${C.dayOf(race.date)}`, padX, 200);
    g.font = `700 26px ${F}`; g.fillStyle = K.gold;
    g.textAlign = 'right'; g.fillText(res ? 'Résultat et choix' : 'Qui a pris qui', W - padX, 70); g.textAlign = 'left';
    if (all.podium.length) { g.font = `600 26px ${F}`; g.fillStyle = K.sub; g.fillText('Podium : ' + all.podium.map((e) => `${e.rank}. ${C.nameOf(e.ath)}`).join('  ·  '), padX, 250); }
    let y = headH;
    const imgs = await Promise.all(lay.map((l) => loadImg(`img/athletes/${l.r.ath}.jpg`)));
    const extra = H - (headH + bodyH + footH); const gap = extra > 0 ? Math.min(extra / (lay.length + 1), 18) : 0; y += gap;
    lay.forEach((l, i) => {
      const r = l.r, h = l.h, cy = y + h / 2;
      if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, W, h); }
      g.fillStyle = r.status ? K.bad : K.ink; g.font = `800 34px ${FD}`; g.textAlign = 'center';
      g.fillText(res ? (r.status ? r.status : r.rank ? String(r.rank) : '–') : '', padX + 28, cy + 12); g.textAlign = 'left';
      const ix = padX + 70, rad = 30;
      g.save(); g.beginPath(); g.arc(ix + rad, cy, rad, 0, Math.PI * 2); g.clip();
      if (imgs[i]) { const im = imgs[i], s = Math.max(rad * 2 / im.width, rad * 2 / im.height); g.drawImage(im, ix, cy - rad, im.width * s, im.height * s * 1); } else { g.fillStyle = K.ph; g.fillRect(ix, cy - rad, rad * 2, rad * 2); }
      g.restore(); g.strokeStyle = K.ink; g.lineWidth = 2.5; g.beginPath(); g.arc(ix + rad, cy, rad, 0, Math.PI * 2); g.stroke();
      g.fillStyle = K.ink; g.font = `700 29px ${F}`;
      const nm = wrap(g, C.nameOf(r.ath), nameW - 10).slice(0, 1); nm.forEach((s) => g.fillText(s, nameX, cy - 6));
      const bw = nameW - 78; g.fillStyle = K.track; g.fillRect(nameX, cy + 12, bw, 14); g.fillStyle = K.bar; g.fillRect(nameX, cy + 12, Math.max(6, bw * (r.N ? r.n / r.N : 0)), 14);
      g.fillStyle = K.ink; g.font = `800 24px ${F}`; g.fillText(`${r.n}/${r.N}`, nameX + bw + 12, cy + 27);
      g.font = `600 28px ${F}`; g.fillStyle = K.soft;
      l.lines.forEach((s, k) => g.fillText(s, whoX, cy + 10 - ((l.lines.length - 1) * 18) + k * 36));
      y += h;
    });
    g.fillStyle = K.foot; g.fillRect(0, H - footH, W, footH);
    g.fillStyle = K.footT; g.font = `600 26px ${F}`; g.textAlign = 'center'; g.fillText('skigame-2627.vercel.app', W / 2, H - footH / 2 + 9); g.textAlign = 'left';
    return cv;
  }
  async function jpg(raceId) {
    const race = C.G.raceOf(raceId); say('Image en préparation…');
    try {
      const cv = await jpgCanvas(race);
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.92));
      const name = `ski-game-${race.id.toLowerCase()}-${C.placeLabel(race).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
      const file = new File([blob], name, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: titleOf(race) }); say('Image partagée.'); return; } catch (e) { if (e && e.name === 'AbortError') { say(''); return; } } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Image téléchargée.');
    } catch (e) { console.error('JPG', e); say('Impossible de créer l’image.'); }
  }

  /* ---------- Récap de session (WhatsApp) : résultats des skieurs + points des joueurs ---------- */
  const sur = (id) => { const n = C.nameOf(id).split(' '); return n.length > 1 ? n.slice(1).join(' ') : n[0]; };
  function sessionRows(session) {
    const { state, G } = C;
    const all = G.sessionRaces(session).filter((r) => !r.cancelled);
    const races = all.filter((r) => state.results[r.id]).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
    const how = (e) => (e ? (e.status || (e.rank ? C.ordinal(e.rank) : '–')) : 'non classé');
    const rows = state.players.map((p) => {
      const pk = state.picks[p.id] || {};
      const per = races.map((r) => ({ race: r, pts: G.scoreRace(r, pk[r.id], state.results) || 0 }));
      return { p, per, total: per.reduce((s, x) => s + x.pts, 0), gen: G.generalScore(pk, state.results) };
    }).sort((a, b) => b.total - a.total || b.gen - a.gen || a.p.name.localeCompare(b.p.name, 'fr'));
    let last = null, rank = 0;
    rows.forEach((r, i) => { if (r.total !== last) { rank = i + 1; last = r.total; } r.rank = rank; });
    const per = races.map((race) => {
      const res = state.results[race.id] || [];
      const pod = res.filter((e) => !e.status && e.rank && e.rank <= 3).sort((a, b) => a.rank - b.rank);
      const pl = [];
      state.players.forEach((p) => {
        const pk = (state.picks[p.id] || {})[race.id]; if (!pk || !pk.a) return;
        const eff = G.effectiveAthlete(pk, state.results, race.id), e = res.find((x) => x.ath === eff);
        pl.push({ p, eff, how: how(e), sub: eff !== pk.a, pts: G.scoreRace(race, pk, state.results) || 0 });
      });
      pl.sort((a, b) => b.pts - a.pts || a.p.name.localeCompare(b.p.name, 'fr'));
      return { race, pod, pl };
    });
    return { races, all, rows, per, partial: races.length < all.length };
  }
  const MED = ['🥇', '🥈', '🥉'];
  const raceShort = (r) => `${C.placeLabel(r)} · ${gname(r)}`;
  const sgn = (n) => (n > 0 ? '+' : '') + n;
  function sessionText(session) {
    const { rows, per, races, all, partial } = sessionRows(session);
    const L = [`🎿 *${session.name}* — ${partial ? `après ${races.length} course${races.length > 1 ? 's' : ''} sur ${all.length}` : 'bilan de la session'}`];
    if (!races.length) return L.concat('', 'Aucun résultat pour l’instant.').join('\n');
    L.push('', '🏆 *Classement des joueurs*');
    rows.forEach((r) => L.push(`${r.rank <= 3 ? MED[r.rank - 1] : r.rank + '.'} ${r.p.name} : *${r.total} pts*${races.length > 1 ? ` (${r.per.map((x) => x.pts).join(' + ')})` : ''}`));
    per.forEach(({ race, pod, pl }) => {
      L.push('', `🏁 *${raceShort(race)}*`, pod.map((e) => `${MED[e.rank - 1]} ${sur(e.ath)}`).join('  '));
      pl.forEach((x) => L.push(`• ${x.p.name} *${sgn(x.pts)}* — ${sur(x.eff)} ${x.how}${x.sub ? ' (rempl.)' : ''}`));
    });
    L.push('', 'skigame-2627.vercel.app');
    return L.join('\n');
  }
  function sessionOpen(sid) {
    const s = C.D.SESSIONS.concat([C.D.WORLDS]).find((x) => String(x.id) === String(sid)); if (!s) return;
    C.openModal(`<div class="rc"><h3 class="rc__title">${C.esc(s.name)} · récap</h3><p class="hint">Message WhatsApp et image : résultats des skieurs et points des joueurs.</p>
      <pre class="rc__pre">${C.esc(sessionText(s))}</pre>
      <div class="rc__act"><button type="button" class="btn" data-sx-copy="${s.id}">Copier le message</button><button type="button" class="btn btn--ghost" data-sx-jpg="${s.id}">Image JPG</button></div><p id="rc-msg" class="hint" role="status"></p></div>`);
    const card = document.querySelector('#modal .modal__card'); if (card) card.classList.add('modal__card--wide');
  }
  async function sessionCopy(sid) {
    const txt = sessionText(C.D.SESSIONS.concat([C.D.WORLDS]).find((x) => String(x.id) === String(sid)));
    try { await navigator.clipboard.writeText(txt); say('Message copié : colle-le dans WhatsApp.'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); say('Message copié : colle-le dans WhatsApp.'); } catch (e2) { say('Copie impossible : sélectionne le texte à la main.'); }
      ta.remove();
    }
  }
  async function sessionCanvas(session) {
    const { rows, per, races, all, partial } = sessionRows(session);
    const F = '"Instrument Sans","Helvetica Neue",Arial,sans-serif', FD = '"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif';
    const K = TH[document.documentElement.getAttribute('data-theme')] || TH.sapin;
    const padX = 56, headH = 250, rowH = 70, rH = 58, bandH = 112, footH = 90;
    const H = headH + 60 + 20 + rows.length * rowH + per.reduce((s, b) => s + 40 + bandH + b.pl.length * rH, 0) + 30 + footH;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = K.bg; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, 0, headH); gr.addColorStop(0, K.t); gr.addColorStop(1, K.b);
    g.fillStyle = gr; g.fillRect(0, 0, W, headH);
    g.strokeStyle = K.chev; g.lineWidth = 2;
    for (let y = 18; y < headH; y += 30) for (let x = ((y / 30) % 2) * 20; x < W; x += 40) { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 8, y); g.lineTo(x + 16, y + 8); g.stroke(); }
    g.fillStyle = K.edge; g.fillRect(0, headH - 6, W, 6);
    g.textBaseline = 'alphabetic';
    g.fillStyle = K.gold; g.font = `800 30px ${FD}`; g.fillText('SKI GAME · COUPE DU MONDE 2026-27', padX, 70);
    g.fillStyle = K.head; g.font = `800 62px ${FD}`; g.fillText(session.name, padX, 150);
    g.fillStyle = K.sub; g.font = `600 34px ${F}`; g.fillText(partial ? `Points après ${races.length} course${races.length > 1 ? 's' : ''} sur ${all.length}` : 'Bilan de la session', padX, 205);
    const medal = (x, y, n) => { const c = ['#e0b13a', '#b8c2cc', '#c98a55'][n - 1]; g.fillStyle = c; g.beginPath(); g.arc(x, y - 9, 20, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1b2b44'; g.font = `800 24px ${FD}`; g.textAlign = 'center'; g.fillText(String(n), x, y); g.textAlign = 'left'; };
    let y = headH + 56;
    g.fillStyle = K.ink; g.font = `800 32px ${FD}`; g.fillText('Classement des joueurs', padX, y); y += 20;
    rows.forEach((r, i) => {
      if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, W, rowH); }
      const cy = y + rowH / 2;
      if (r.rank <= 3) medal(padX + 28, cy + 11, r.rank); else { g.fillStyle = K.ink; g.font = `800 32px ${FD}`; g.textAlign = 'center'; g.fillText(String(r.rank), padX + 28, cy + 11); g.textAlign = 'left'; }
      g.fillStyle = K.ink; g.font = `700 31px ${F}`; g.fillText(r.p.name, padX + 84, cy + 11);
      g.textAlign = 'right'; g.font = `800 34px ${FD}`; g.fillText(`${r.total} pts`, W - padX, cy + 12);
      if (races.length > 1) { g.font = `600 24px ${F}`; g.fillStyle = K.soft; g.fillText(r.per.map((x) => x.pts).join(' + '), W - padX - 175, cy + 10); }
      g.textAlign = 'left'; y += rowH;
    });
    per.forEach(({ race, pod, pl }) => {
      y += 40;
      g.fillStyle = K.t; g.fillRect(0, y, W, bandH);
      g.fillStyle = K.head; g.font = `800 34px ${FD}`; g.fillText(raceShort(race), padX, y + 44);
      g.font = `600 26px ${F}`; g.fillStyle = K.sub;
      g.fillText(pod.map((e) => `${e.rank}. ${sur(e.ath)}`).join('    '), padX, y + 88);
      y += bandH;
      pl.forEach((x, i) => {
        if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, W, rH); }
        const cy = y + rH / 2;
        g.fillStyle = K.ink; g.font = `700 28px ${F}`; g.fillText(x.p.name, padX, cy + 10);
        g.fillStyle = K.soft; g.font = `600 26px ${F}`; g.fillText(`${sur(x.eff)} · ${x.how}${x.sub ? ' (rempl.)' : ''}`, padX + 330, cy + 9);
        g.textAlign = 'right'; g.fillStyle = x.pts > 0 ? '#1f7a3d' : K.soft; g.font = `800 30px ${FD}`; g.fillText(sgn(x.pts), W - padX, cy + 11); g.textAlign = 'left';
        y += rH;
      });
    });
    g.fillStyle = K.foot; g.fillRect(0, H - footH, W, footH);
    g.fillStyle = K.footT; g.font = `600 26px ${F}`; g.textAlign = 'center'; g.fillText('skigame-2627.vercel.app', W / 2, H - footH / 2 + 9); g.textAlign = 'left';
    return cv;
  }
  async function sessionJpg(sid) {
    const s = C.D.SESSIONS.concat([C.D.WORLDS]).find((x) => String(x.id) === String(sid)); say('Image en préparation…');
    try {
      const cv = await sessionCanvas(s);
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.92));
      const name = `ski-game-recap-${String(s.id).toLowerCase()}.jpg`;
      const file = new File([blob], name, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: s.name }); say('Image partagée.'); return; } catch (e) { if (e && e.name === 'AbortError') { say(''); return; } } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Image téléchargée.');
    } catch (e) { console.error('JPG', e); say('Impossible de créer l’image.'); }
  }

  /* ---------- Course terminée : classement des skieurs + points des joueurs, puis classement général ---------- */
  const sur2 = (id) => { const n = C.nameOf(id).split(' '); return n.length > 1 ? n.slice(1).join(' ') : n[0]; };
  const sg = (n) => (n > 0 ? '+' : '') + n;
  function resultRows(race) {
    const all = raceRows(race), res = all.res || [];
    const t0 = (res.find((e) => !e.status && e.rank === 1) || {}).time;
    const rows = all.rows.map((r) => {
      const who = r.pickers.filter((x) => !x.out);
      return { ath: r.ath, rank: r.rank, status: r.status, who, time: (res.find((e) => e.ath === r.ath) || {}).time, diff: r.rank > 1 ? diffOf((res.find((e) => e.ath === r.ath) || {}).time, t0) : '' };
    }).filter((r) => (r.rank && !r.status && (r.rank <= 10 || r.who.length)) || (r.status && r.who.length));
    const hidden = res.filter((e) => !e.status && e.rank && e.rank > 10 && !rows.some((r) => r.ath === e.ath)).length;
    return { rows, hidden, t0 };
  }
  function raceResultText(race) {
    const { rows } = resultRows(race);
    const L = [`🏁 *${titleOf(race)}* — résultat (${C.dayOf(race.date)})`, ''];
    rows.forEach((r) => {
      const lead = r.status ? `${r.status}` : r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `${r.rank}.`;
      const w = r.who.map((x) => `${x.p.name} *${sg(x.pts)}*${x.kind === 'remplaçant' ? ' (rempl.)' : x.kind === 'tiré au sort' ? ' (tirage)' : ''}`).join(', ');
      L.push(`${lead} ${sur2(r.ath)}${w ? ' → ' + w : ''}`);
    });
    L.push('', 'skigame-2627.vercel.app');
    return L.join('\n');
  }
  function raceText(race) { return (C.state.results[race.id] ? raceResultText : raceTextPre)(race); }

  function generalRows(race) {
    const { state, G } = C;
    const R0 = Object.assign({}, state.results); delete R0[race.id];
    const rank = (fn) => { const rows = state.players.map((p) => ({ p, v: fn(state.picks[p.id] || {}, p) })).sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name, 'fr')); let last = null, rk = 0; rows.forEach((r, i) => { if (r.v !== last) { rk = i + 1; last = r.v; } r.rank = rk; }); return rows; };
    const before = {}; rank((pk) => G.generalScore(pk, R0).total).forEach((r) => { before[r.p.id] = r.rank; });
    const rows = rank((pk) => G.generalScore(pk, state.results).total);
    rows.forEach((r) => { r.gain = G.scoreRace(race, (state.picks[r.p.id] || {})[race.id], state.results) || 0; r.mv = before[r.p.id] - r.rank; });
    return rows;
  }
  const mvTxt = (d) => (d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '=');
  function generalText(race) {
    const rows = generalRows(race);
    const L = [`📊 *Classement général* — après ${C.placeLabel(race)} ${gname(race)}`, ''];
    rows.forEach((r) => L.push(`${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank + '.'} ${r.p.name} : *${r.v} pts* (${sg(r.gain)}) ${mvTxt(r.mv)}`));
    L.push('', 'skigame-2627.vercel.app');
    return L.join('\n');
  }
  function headerCanvas(g, K, head, t, sub, right, F, FD, H0) {
    const gr = g.createLinearGradient(0, 0, 0, H0); gr.addColorStop(0, K.t); gr.addColorStop(1, K.b);
    g.fillStyle = gr; g.fillRect(0, 0, W, H0);
    g.strokeStyle = K.chev; g.lineWidth = 2;
    for (let y = 18; y < H0; y += 30) for (let x = ((y / 30) % 2) * 20; x < W; x += 40) { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 8, y); g.lineTo(x + 16, y + 8); g.stroke(); }
    g.fillStyle = K.edge; g.fillRect(0, H0 - 6, W, 6); g.textBaseline = 'alphabetic';
    g.fillStyle = K.gold; g.font = `800 30px ${FD}`; g.fillText('SKI GAME · COUPE DU MONDE 2026-27', 56, 70);
    g.fillStyle = K.head; g.font = `800 62px ${FD}`; g.fillText(t, 56, 150);
    g.font = `600 34px ${F}`; g.fillStyle = K.sub; g.fillText(sub, 56, 200);
    g.font = `700 26px ${F}`; g.fillStyle = K.gold; g.textAlign = 'right'; g.fillText(right, W - 56, 70); g.textAlign = 'left';
  }
  function footCanvas(g, K, H, footH, F) {
    g.fillStyle = K.foot; g.fillRect(0, H - footH, W, footH);
    g.fillStyle = K.footT; g.font = `600 26px ${F}`; g.textAlign = 'center'; g.fillText('skigame-2627.vercel.app', W / 2, H - footH / 2 + 9); g.textAlign = 'left';
  }
  async function resultCanvas(race) {
    const { rows } = resultRows(race);
    const F = '"Instrument Sans","Helvetica Neue",Arial,sans-serif', FD = '"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif';
    const K = TH[document.documentElement.getAttribute('data-theme')] || TH.sapin, padX = 56, headH = 230, footH = 90;
    const ctx0 = document.createElement('canvas').getContext('2d'); ctx0.font = `600 27px ${F}`;
    const whoX = 56 + 70 + 330 + 20, whoW = W - 56 - whoX;
    const lay = rows.map((r) => { const t = r.who.map((x) => `${x.p.name} ${sg(x.pts)}${x.kind === 'remplaçant' ? ' (rempl.)' : x.kind === 'tiré au sort' ? ' (tirage)' : ''}`).join(' · '); const lines = t ? wrap(ctx0, t, whoW) : []; return { r, lines, h: Math.max(70, 26 + Math.max(1, lines.length) * 34) }; });
    const H = headH + 20 + lay.reduce((a, l) => a + l.h, 0) + 30 + footH;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = K.bg; g.fillRect(0, 0, W, H);
    headerCanvas(g, K, true, C.placeLabel(race), `${gname(race)} · ${C.dayOf(race.date)}`, 'Résultat', F, FD, headH);
    let y = headH + 20;
    lay.forEach((l, i) => {
      const r = l.r, cy = y + l.h / 2;
      if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, W, l.h); }
      g.fillStyle = r.status ? K.bad : K.ink; g.font = `800 32px ${FD}`; g.textAlign = 'center'; g.fillText(r.status ? r.status : String(r.rank), padX + 34, cy + 11); g.textAlign = 'left';
      g.fillStyle = K.ink; g.font = `700 30px ${F}`; g.fillText(sur2(r.ath), padX + 90, cy - (r.time ? 4 : -10));
      if (r.time) { g.fillStyle = K.soft; g.font = `600 22px ${F}`; g.fillText(r.time + (r.diff ? '  ' + r.diff : ''), padX + 90, cy + 24); }
      g.font = `600 27px ${F}`;
      l.lines.forEach((s2, k) => { g.fillStyle = K.soft; g.fillText(s2, whoX, cy + 9 - ((l.lines.length - 1) * 17) + k * 34); });
      y += l.h;
    });
    footCanvas(g, K, H, footH, F); return cv;
  }
  async function generalCanvas(race) {
    const rows = generalRows(race);
    const F = '"Instrument Sans","Helvetica Neue",Arial,sans-serif', FD = '"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif';
    const K = TH[document.documentElement.getAttribute('data-theme')] || TH.sapin, padX = 56, headH = 230, footH = 90, rowH = 76;
    const H = headH + 30 + rows.length * rowH + 30 + footH;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = K.bg; g.fillRect(0, 0, W, H);
    headerCanvas(g, K, true, 'Classement général', `après ${C.placeLabel(race)} · ${gname(race)}`, 'Mise à jour', F, FD, headH);
    let y = headH + 30;
    rows.forEach((r, i) => {
      if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, W, rowH); }
      const cy = y + rowH / 2;
      g.fillStyle = K.ink; g.font = `800 34px ${FD}`; g.textAlign = 'center'; g.fillText(String(r.rank), padX + 28, cy + 12); g.textAlign = 'left';
      g.font = `700 32px ${F}`; g.fillText(r.p.name, padX + 84, cy + 11);
      g.textAlign = 'right'; g.font = `800 34px ${FD}`; g.fillText(`${r.v} pts`, W - padX, cy + 12);
      g.font = `700 26px ${F}`; g.fillStyle = r.gain > 0 ? '#1f7a3d' : K.soft; g.fillText(sg(r.gain), W - padX - 190, cy + 10);
      g.fillStyle = r.mv > 0 ? '#1f7a3d' : r.mv < 0 ? K.bad : K.soft; g.fillText(mvTxt(r.mv), W - padX - 290, cy + 10);
      g.textAlign = 'left'; y += rowH;
    });
    footCanvas(g, K, H, footH, F); return cv;
  }
  async function jpgCanvas(race) { return C.state.results[race.id] ? resultCanvas(race) : jpgCanvasPre(race); }
  async function sendCanvas(cv, name, title) {
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.92));
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title }); say('Image partagée.'); return; } catch (e) { if (e && e.name === 'AbortError') { say(''); return; } } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Image téléchargée.');
  }
  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); say('Message copié : colle-le dans WhatsApp.'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); say('Message copié : colle-le dans WhatsApp.'); } catch (e2) { say('Copie impossible : sélectionne le texte à la main.'); } ta.remove(); }
  }
  const copyGeneral = (raceId) => copyText(generalText(C.G.raceOf(raceId)));
  async function jpgGeneral(raceId) { const race = C.G.raceOf(raceId); say('Image en préparation…'); try { await sendCanvas(await generalCanvas(race), `ski-game-general-apres-${race.id.toLowerCase()}.jpg`, 'Classement général'); } catch (e) { console.error('JPG', e); say('Impossible de créer l’image.'); } }
  /* ---------- Export générique d'un tableau (classements, Data room) : message WhatsApp et image JPG ---------- */
  const XP = {}, MEDAL = ['🥇', '🥈', '🥉'];
  /** spec : { key, title, sub, right, unit, head: ['Rang', 'Joueur', 'Total', …], rows: [{ c: ['1', 'Alexandre', '380', …], me }], note } */
  const XI_MSG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4.1A8 8 0 1 1 20 12z"/></svg>';
  const XI_IMG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5.5-5.5 4 4 2.5-2.5L20 18"/></svg>';
  /** Deux petits pictos (message, image) à glisser dans le titre d'un tableau. */
  let fsKeep = false;
  function fsOn(v) { fsKeep = !!v; }
  function fsOpen(keep) {
    return '<div class="fswrap' + (keep && fsKeep ? ' is-fs' : '') + '"' + (keep ? ' data-keep="1"' : '') + '><div class="fsbar"><button type="button" class="btn btn--sm fsbtn" data-dr="fs:on" aria-pressed="false"><svg class="fsic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span class="fsbtn__on">Mettre le tableau en plein écran</span><span class="fsbtn__off">Quitter le plein écran</span></button></div>';
  }
  function xbar(spec) {
    XP[spec.key] = spec; const k = C.esc(spec.key);
    return `<span class="xicons"><button type="button" class="xic" data-xp="${k}|t" title="Copier le message (WhatsApp)" aria-label="Copier le message">${XI_MSG}</button><button type="button" class="xic" data-xp="${k}|j" title="Exporter en image JPG" aria-label="Exporter en image">${XI_IMG}</button></span>`;
  }
  function xpText(sp) {
    const L = [`🎿 *${sp.title}*`]; if (sp.sub) L.push(sp.sub); L.push('');
    const ex = sp.head.slice(3).map((h) => String(h).replace(/\n/g, ' '));
    sp.rows.forEach((r) => {
      const c = r.c, n = /^\d+$/.test(c[0]) ? +c[0] : 0, rk = n && n <= 3 ? MEDAL[n - 1] : (c[0] ? c[0] + '.' : '•');
      let line = `${rk} ${c[1]}`; if (c.length > 2 && c[2] !== '') line += ` — ${c[2]}${sp.unit || ''}`;
      const parts = ex.map((h, i) => (c[3 + i] !== '' && c[3 + i] != null ? `${h} ${c[3 + i]}` : '')).filter(Boolean);
      if (parts.length) line += ` (${parts.join(' · ')})`;
      L.push(line);
    });
    if (sp.note) L.push('', sp.note);
    L.push('', 'skigame-2627.vercel.app'); return L.join('\n');
  }
  function xpCanvas(sp) {
    const F = '"Instrument Sans","Helvetica Neue",Arial,sans-serif', FD = '"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif';
    const K = TH[document.documentElement.getAttribute('data-theme')] || TH.sapin, padX = 56, headH = 230, footH = 90, rowH = 70, colH = 70;
    const vals = sp.head.slice(2), nv = vals.length, cw = nv > 12 ? 70 : nv > 6 ? 84 : nv > 3 ? 120 : nv > 1 ? 160 : 200;
    const Wc = Math.max(1080, padX * 2 + 90 + 380 + nv * cw), prev = W;
    try {
      W = Wc; const H = headH + colH + sp.rows.length * rowH + 30 + footH;
      const cv = document.createElement('canvas'); cv.width = Wc; cv.height = H; const g = cv.getContext('2d');
      g.fillStyle = K.bg; g.fillRect(0, 0, Wc, H);
      headerCanvas(g, K, true, sp.title, sp.sub || '', sp.right || 'Classement', F, FD, headH);
      let y = headH;
      g.fillStyle = K.band; g.fillRect(0, y, Wc, colH); g.fillStyle = K.soft; g.font = `700 22px ${F}`;
      g.fillText(sp.head[0], padX + 8, y + colH / 2 + 8); g.fillText(sp.head[1], padX + 90, y + colH / 2 + 8);
      g.textAlign = 'right';
      vals.forEach((h, j) => { const x = Wc - padX - (nv - 1 - j) * cw, ls = String(h).split('\n'); ls.forEach((t, k) => g.fillText(t, x, y + colH / 2 + 8 - (ls.length - 1) * 12 + k * 24)); });
      g.textAlign = 'left'; y += colH;
      const maxName = Wc - padX * 2 - 90 - nv * cw - 14;
      sp.rows.forEach((r, i) => {
        const c = r.c, cy = y + rowH / 2;
        if (r.me) { g.fillStyle = K.gold; g.globalAlpha = 0.28; g.fillRect(0, y, Wc, rowH); g.globalAlpha = 1; } else if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, Wc, rowH); }
        g.fillStyle = K.ink; g.font = `800 30px ${FD}`; g.textAlign = 'center'; g.fillText(c[0], padX + 34, cy + 11); g.textAlign = 'left';
        g.font = `700 30px ${F}`; let nm = String(c[1]); while (g.measureText(nm).width > maxName && nm.length > 3) nm = nm.slice(0, -2); if (nm !== c[1]) nm += '…';
        g.fillText(nm, padX + 90, cy + 11);
        g.textAlign = 'right';
        vals.forEach((h, j) => { const v = c[2 + j]; if (v === '' || v == null) return; const x = Wc - padX - (nv - 1 - j) * cw; if (j === 0) { g.font = `800 32px ${FD}`; g.fillStyle = K.ink; } else { g.font = `600 26px ${F}`; g.fillStyle = K.soft; } g.fillText(String(v), x, cy + 11); });
        g.textAlign = 'left'; y += rowH;
      });
      footCanvas(g, K, H, footH, F); return cv;
    } finally { W = prev; }
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-xp]'); if (!b) return;
    const [key, fmt] = b.dataset.xp.split('|'), sp = XP[key]; if (!sp) return;
    if (fmt === 't') { await copyText(xpText(sp)); return; }
    toast('Image en préparation…');
    try { await sendCanvas(xpCanvas(sp), 'ski-game-' + String(key).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.jpg', sp.title); } catch (err) { console.error(err); toast('Image impossible.'); }
  });
  const api = { fsOn, fsOpen, xbar, xpText, xpCanvas, init, raceRows, raceText, cardHtml, open, copy, jpg, jpgCanvas, fullHtml, raceResultText, generalText, copyGeneral, jpgGeneral, sessionRows, sessionText, sessionOpen, sessionCopy, sessionJpg, sessionCanvas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_SHARE = api;
})(typeof window !== 'undefined' ? window : globalThis);
