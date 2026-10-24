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
  const titleOf = (race) => `${C.placeLabel(race)} · ${C.genderLabel(race)} · ${C.discLabel(race)}`;
  const pts = (p) => (p.pts == null ? '' : ` (${p.pts > 0 ? '+' : ''}${p.pts})`);
  const how = (r) => (r.status ? r.status : r.rank ? C.ordinal(r.rank) : 'hors classement');

  /** Message à coller (WhatsApp) : choix seuls avant le résultat, résultat + choix ensuite. */
  function raceText(race) {
    const { shares, res, podium, N } = raceRows(race);
    const L = [`🎿 *${titleOf(race)}* (${C.dayOf(race.date)})`];
    if (!shares.length) { L.push('Aucun choix.'); return L.join('\n'); }
    L.push(res ? '🏁 Qui avait pris qui (et résultat) :' : '👀 Qui a pris qui :', '');
    shares.forEach((r) => {
      const who = r.pickers.map((x) => x.p.name + (x.kind === 'remplaçant' ? ' (remplaçant)' : x.kind === 'tiré au sort' ? ' (tirage au sort)' : x.out ? ' (non-partant)' : '')).join(', ');
      const sc = res ? ` · ${how(r)}${r.rank && !r.status ? ` · ${C.G.racePoints(race, r.rank) * race.mult} pts` : ''}` : '';
      L.push(`• ${C.nameOf(r.ath)} : ${r.pct} % (${r.n}/${N})${sc} → ${who}`);
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
      return `<li class="rc__row${mine ? ' is-mine' : ''}"><span class="rc__rk">${res ? (r.status ? esc(r.status) : r.rank ? r.rank : '–') : ''}</span>${C.avatarOf(r.ath, 'sm')}<span class="rc__sk">${C.skn(r.ath)} <b class="rc__pct">${r.pct} %</b> <span class="sub">${r.n}/${N}</span></span><span class="rc__bar"><i style="width:${Math.max(r.pct, 3)}%"></i></span><span class="rc__who">${chips}</span></li>`;
    }).join('')}</ol>` : '<p class="hint">Aucun choix pour cette course.</p>';
    const pod = podium.length ? `<p class="rc__pod"><b>Podium</b> ${podium.map((e) => `${e.rank}. ${esc(C.nameOf(e.ath))}`).join(' · ')}</p>` : '';
    const note = res ? '' : '<p class="hint">Résultat pas encore saisi.</p>';
    return `${head}${note}${res ? fullHtml(race) : ''}${res ? '<h4 class="rf__h">Qui avait pris qui</h4>' : ''}${pod && !res ? pod : ''}${body}<div class="rc__act"><button type="button" class="btn" data-rc-copy="${race.id}">Copier le message</button><button type="button" class="btn btn--ghost" data-rc-jpg="${race.id}">Image JPG</button></div><p class="auth__err" id="rc-msg" role="status"></p>`;
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
    const plHtml = pl.length ? `<ol class="rf__pl">${pl.map((r) => `<li class="${r.p.id === state.me ? 'is-mine' : ''}"><span class="rf__rk">${r.rk}</span><span class="rf__who">${C.pln(r.p)}</span><span class="rf__sk">${C.skn(r.eff)} <em>${esc(how(r.e))}</em>${r.sub ? ` <span class="sub">(remp. de ${esc(C.nameOf(r.sub))})</span>` : ''}</span><b class="rf__pts ${r.pts > 0 ? 'on' : 'off'}">${r.pts > 0 ? '+' : ''}${r.pts}</b></li>`).join('')}</ol>` : '<p class="hint">Aucun choix.</p>';
    const picked = {}; pl.forEach((r) => { (picked[r.eff] = picked[r.eff] || []).push(r.p); });
    const ranked = res.filter((e) => !e.status && e.rank).sort((a, b) => a.rank - b.rank), t0 = ranked[0] && ranked[0].time;
    const chips = (a) => (picked[a] || []).map((p) => `<span class="rc__chip${p.id === state.me ? ' me' : ''}">${C.pln(p)}</span>`).join(' ');
    const rows = ranked.map((e) => `<tr class="${(picked[e.ath] || []).some((p) => p.id === state.me) ? 'is-mine' : ''}"><td>${e.rank}</td><td>${C.skn(e.ath)}</td><td class="num">${esc(e.time || '')}${e.time && e.rank > 1 ? `<br><span class="sub">${esc(diffOf(e.time, t0))}</span>` : ''}</td><td>${chips(e.ath)}</td></tr>`);
    const out = res.filter((e) => e.status && e.status !== 'DNQ' && e.status !== 'DNS' || (e.status && picked[e.ath]));
    out.forEach((e) => rows.push(`<tr class="is-st"><td>${esc(e.status)}</td><td>${C.skn(e.ath)}</td><td></td><td>${chips(e.ath)}</td></tr>`));
    const nq = res.filter((e) => e.status === 'DNQ' && !picked[e.ath]).length, ns = res.filter((e) => e.status === 'DNS' && !picked[e.ath]).length;
    const foot = [nq ? `${nq} non qualifié${nq > 1 ? 's' : ''} (DNQ)` : '', ns ? `${ns} non-partant${ns > 1 ? 's' : ''} (DNS)` : ''].filter(Boolean).join(' · ');
    const hasT = ranked.some((e) => e.time);
    return `<h4 class="rf__h">Classement des joueurs</h4>${plHtml}
      <h4 class="rf__h">Classement de la course</h4><div class="tablewrap"><table class="grid rf__t"><thead><tr><th>Rang</th><th>Skieur</th><th>${hasT ? 'Temps' : ''}</th><th>Joueurs</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${foot ? `<p class="sub">${foot}</p>` : ''}`;
  }
  function open(raceId) {
    const race = C.G.raceOf(raceId); if (!race) return;
    C.openModal(`<div class="rc">${cardHtml(race)}</div>`);
    const card = document.querySelector('#modal .modal__card'); if (card) card.classList.add('modal__card--wide');
  }
  const say = (t) => { const m = document.getElementById('rc-msg'); if (m) m.textContent = t; };
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
  const W = 1080;
  const TH = { sapin: { t: '#2b5f4b', b: '#163629', chev: 'rgba(143,192,164,.18)', edge: '#e9f0f2', gold: '#f1d78a', head: '#fff', sub: '#d4e6ef', bg: '#fbf8ef', band: '#f3efe2', ink: '#1b2b44', soft: '#675e51', bad: '#a93a2c', foot: '#1f4a3a', footT: '#e9f0f2', ph: '#8faec0', track: '#e4e1d3', bar: '#2f8089' },
    glace: { t: '#f1f9fd', b: '#a8cfe4', chev: 'rgba(255,255,255,.4)', edge: '#ffffff', gold: '#1d6a9c', head: '#123a55', sub: '#2c5b78', bg: '#fbfdff', band: '#eaf3f9', ink: '#17364d', soft: '#566b79', bad: '#b83a2a', foot: '#1e5a80', footT: '#ffffff', ph: '#a8cfe4', track: '#d3e1eb', bar: '#1e5a80' },
    nuit: { t: '#1c2f55', b: '#0b1322', chev: 'rgba(120,160,230,.18)', edge: '#2f56d6', gold: '#8fb4ff', head: '#ffffff', sub: '#c9d9f5', bg: '#18222f', band: '#1e2b3b', ink: '#e4eaf2', soft: '#9aaabd', bad: '#ff9a8a', foot: '#0b1322', footT: '#cfe0ff', ph: '#3d527f', track: '#293648', bar: '#5b8cf0' } };
  function loadImg(src) { return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  async function jpgCanvas(race) {
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
    g.fillText(`${C.genderLabel(race)} · ${C.discLabel(race)} · ${C.dayOf(race.date)}`, padX, 200);
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
      const bw = nameW - 78; g.fillStyle = K.track; g.fillRect(nameX, cy + 12, bw, 14); g.fillStyle = K.bar; g.fillRect(nameX, cy + 12, Math.max(6, bw * r.pct / 100), 14);
      g.fillStyle = K.ink; g.font = `800 24px ${F}`; g.fillText(`${r.pct} %`, nameX + bw + 12, cy + 27);
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

  /* ---------- Récap de session (WhatsApp) ---------- */
  function sessionRows(session) {
    const { state, G } = C;
    const races = G.sessionRaces(session).filter((r) => !r.cancelled && state.results[r.id]).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
    const rows = state.players.map((p) => {
      const pk = state.picks[p.id] || {};
      const per = races.map((r) => ({ race: r, pts: G.scoreRace(r, pk[r.id], state.results) || 0, ath: pk[r.id] && pk[r.id].a ? G.effectiveAthlete(pk[r.id], state.results, r.id) : null }));
      return { p, per, total: per.reduce((s, x) => s + x.pts, 0), gen: G.generalScore(pk, state.results) };
    }).sort((a, b) => b.total - a.total || b.gen - a.gen || a.p.name.localeCompare(b.p.name, 'fr'));
    let last = null, rank = 0;
    rows.forEach((r, i) => { if (r.total !== last) { rank = i + 1; last = r.total; } r.rank = rank; });
    const pods = races.map((r) => ({ race: r, pod: (state.results[r.id] || []).filter((e) => !e.status && e.rank && e.rank <= 3).sort((a, b) => a.rank - b.rank) }));
    return { races, rows, pods };
  }
  const MED = ['🥇', '🥈', '🥉'];
  const raceShort = (r) => `${C.placeLabel(r)} ${r.gender === 'W' ? 'dames' : 'hommes'} ${C.discLabel(r)}`;
  function sessionText(session) {
    const { rows, pods, races } = sessionRows(session);
    const tot = C.G.sessionRaces(session).filter((r) => !r.cancelled).length, part = races.length < tot;
    const L = [`🎿 *${session.name}* — ${part ? `points après ${races.length} course${races.length > 1 ? 's' : ''} sur ${tot}` : 'bilan de la session'}`, ''];
    if (!races.length) return L.concat('Aucun résultat pour l’instant.').join('\n');
    L.push('🏆 *Classement de la session*');
    rows.forEach((r) => {
      const d = r.per.map((x) => `${x.pts}`).join(' + ');
      L.push(`${MED[r.rank - 1] && r.rank <= 3 ? MED[r.rank - 1] : r.rank + '.'} ${r.p.name} : *${r.total} pts*${races.length > 1 ? ` (${d})` : ''}`);
    });
    L.push('', '🏁 *Podiums*');
    pods.forEach(({ race, pod }) => L.push(`• ${raceShort(race)} : ` + (pod.length ? pod.map((e) => `${MED[e.rank - 1]} ${C.nameOf(e.ath)}`).join(' ') : '—')));
    L.push('', 'skigame-2627.vercel.app');
    return L.join('\n');
  }
  function sessionOpen(sid) {
    const s = C.D.SESSIONS.concat([C.D.WORLDS]).find((x) => String(x.id) === String(sid)); if (!s) return;
    C.openModal(`<div class="rc"><h3 class="rc__title">${C.esc(s.name)} · récap</h3><p class="hint">Message WhatsApp et image du bilan de la session.</p>
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
    const { rows, pods, races } = sessionRows(session);
    const F = '"Instrument Sans","Helvetica Neue",Arial,sans-serif', FD = '"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif';
    const K = TH[document.documentElement.getAttribute('data-theme')] || TH.sapin;
    const padX = 56, headH = 250, rowH = 74, footH = 90, podH = 92;
    const H = headH + 70 + rows.length * rowH + 70 + pods.length * podH + 30 + footH;
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
    g.fillStyle = K.sub; g.font = `600 34px ${F}`; g.fillText(C.G.sessionRaces(session).filter((r) => !r.cancelled).length > races.length ? `Points après ${races.length} course${races.length > 1 ? 's' : ''}` : 'Bilan de la session', padX, 205);
    let y = headH + 50;
    g.fillStyle = K.ink; g.font = `800 32px ${FD}`; g.fillText('Classement', padX, y); y += 20;
    rows.forEach((r, i) => {
      if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, W, rowH); }
      const cy = y + rowH / 2;
      g.fillStyle = K.ink; g.font = `800 34px ${FD}`; g.textAlign = 'center'; g.fillText(r.rank <= 3 ? MED[r.rank - 1] : String(r.rank), padX + 28, cy + 12); g.textAlign = 'left';
      g.font = `700 32px ${F}`; g.fillText(r.p.name, padX + 90, cy + 11);
      g.textAlign = 'right'; g.font = `800 34px ${FD}`; g.fillText(`${r.total} pts`, W - padX, cy + 12);
      if (races.length > 1) { g.font = `600 24px ${F}`; g.fillStyle = K.soft; g.fillText(r.per.map((x) => x.pts).join(' + '), W - padX - 170, cy + 10); }
      g.textAlign = 'left'; y += rowH;
    });
    y += 50; g.fillStyle = K.ink; g.font = `800 32px ${FD}`; g.fillText('Podiums', padX, y); y += 20;
    pods.forEach(({ race, pod }) => {
      g.fillStyle = K.ink; g.font = `700 25px ${F}`; g.fillText(raceShort(race), padX, y + 34);
      g.fillStyle = K.soft; g.font = `600 24px ${F}`;
      g.fillText(pod.map((e) => `${e.rank}. ${C.nameOf(e.ath)}`).join('  ·  '), padX, y + 74);
      y += podH;
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
  const api = { init, raceRows, raceText, cardHtml, open, copy, jpg, jpgCanvas, fullHtml, sessionRows, sessionText, sessionOpen, sessionCopy, sessionJpg, sessionCanvas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_SHARE = api;
})(typeof window !== 'undefined' ? window : globalThis);
