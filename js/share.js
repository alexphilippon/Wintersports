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
    return { res, rows, show: C.lockedRace(race) };
  }
  const titleOf = (race) => `${C.placeLabel(race)} · ${C.genderLabel(race)} · ${C.discLabel(race)}`;
  const pts = (p) => (p.pts == null ? '' : ` (${p.pts > 0 ? '+' : ''}${p.pts})`);
  const how = (r) => (r.status ? r.status : r.rank ? C.ordinal(r.rank) : 'hors classement');

  /** Message à coller (WhatsApp) : choix seuls avant le résultat, résultat + choix ensuite. */
  function raceText(race) {
    const { rows, res } = raceRows(race);
    const date = C.dayOf(race.date);
    const L = [`🎿 *${titleOf(race)}* (${date})`];
    if (!rows.length) { L.push('Aucun choix.'); return L.join('\n'); }
    L.push(res ? '🏁 Résultat et qui avait pris qui :' : '👀 Qui a pris qui :', '');
    rows.filter((r) => r.pickers.length || (res && r.rank && !r.status && r.rank <= 5)).forEach((r) => {
      const who = r.pickers.length ? r.pickers.map((x) => x.p.name + (x.kind === 'remplaçant' ? ' (remplaçant)' : x.kind === 'tiré au sort' ? ' (tirage au sort)' : x.out ? ' (non-partant)' : '')).join(', ') : 'personne';
      if (res) {
        const sc = r.rank && !r.status ? ` · ${C.G.pointsForRank(r.rank) * race.mult} pts` : '';
        L.push(`${r.rank && !r.status ? r.rank + '.' : '❌'} ${C.nameOf(r.ath)}${r.status ? ' (' + r.status + ')' : ''}${sc} → ${who}`);
      } else L.push(`• ${C.nameOf(r.ath)} → ${who}`);
    });
    if (res) {
      const w = res.find((e) => !e.status && e.rank === 1);
      if (w && !rows.some((r) => r.ath === w.ath)) L.push('', `🥇 Vainqueur : ${C.nameOf(w.ath)} (personne ne l'avait pris)`);
    }
    return L.join('\n');
  }

  /* ---------- Fiche (fenêtre) ---------- */
  function cardHtml(race) {
    const { esc } = C;
    const { rows, res, show } = raceRows(race);
    const head = `<h3 class="rc__title">${esc(titleOf(race))}</h3><p class="rc__date">${esc(C.dayOf(race.date))}${race.cancelled ? ' · annulée' : ''}</p>`;
    if (race.cancelled) return head + '<p class="hint">Course annulée.</p>';
    if (!show) return head + '<p class="hint">Les choix de chacun seront visibles au départ de la première course de la session.</p>';
    const win = res && res.find((e) => !e.status && e.rank === 1);
    const body = rows.length ? `<ol class="rc__list">${rows.map((r) => {
      const chips = r.pickers.map((x) => `<span class="rc__chip${x.p.id === C.state.me ? ' me' : ''}${x.out ? ' is-out' : ''}${res && !x.out && !x.pts ? ' is-zero' : ''}" title="${esc(x.kind)}">${esc(x.p.name)}${x.kind === 'remplaçant' ? ' <i>rempl.</i>' : x.kind === 'tiré au sort' ? ' <i>tirage</i>' : x.out ? ' <i>non-partant</i>' : ''}${res && !x.out && x.pts != null ? `<b>${x.pts > 0 ? '+' : ''}${x.pts}</b>` : ''}</span>`).join('');
      return `<li class="rc__row${r.status ? ' is-st' : ''}"><span class="rc__rk">${r.status ? esc(r.status) : r.rank ? r.rank : ''}</span>${C.avatarOf(r.ath, 'sm')}<span class="rc__sk">${esc(C.nameOf(r.ath))}</span><span class="rc__who">${chips || '<em class="none">personne</em>'}</span></li>`;
    }).join('')}</ol>` : '<p class="hint">Aucun choix pour cette course.</p>';
    const note = res ? `<p class="hint">Classement officiel (30 premiers) ; les skieurs choisis hors du top 30, DNF, DNS ou DNQ sont ajoutés en dessous.${win ? '' : ''}</p>` : '<p class="hint">Résultat pas encore saisi.</p>';
    return `${head}${note}${body}<div class="rc__act"><button type="button" class="btn" data-rc-copy="${race.id}">Copier le message</button><button type="button" class="btn btn--ghost" data-rc-jpg="${race.id}">Image JPG</button></div><p class="auth__err" id="rc-msg" role="status"></p>`;
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
  function loadImg(src) { return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  async function jpgCanvas(race) {
    const all = raceRows(race), res = all.res;
    const rows = all.rows.filter((r) => r.pickers.length || (res && r.rank && !r.status && r.rank <= 5));
    const ctx0 = document.createElement('canvas').getContext('2d');
    const F = '"Instrument Sans","Helvetica Neue",Arial,sans-serif', FD = '"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif';
    const padX = 56, nameX = padX + 70 + 60 + 18, nameW = 330, whoX = nameX + nameW + 20, whoW = W - padX - whoX;
    ctx0.font = `600 28px ${F}`;
    const lay = rows.map((r) => {
      const txt = r.pickers.map((x) => x.p.name + (res && !x.out && x.pts ? ` +${x.pts}` : '') + (x.kind === 'remplaçant' ? ' (rempl.)' : x.kind === 'tiré au sort' ? ' (tirage)' : x.out ? ' (non-partant)' : '')).join(' · ');
      const lines = wrap(ctx0, txt, whoW);
      return { r, lines, h: Math.max(84, 28 + lines.length * 36) };
    });
    const headH = 250, footH = 90;
    let bodyH = lay.reduce((s, l) => s + l.h, 0);
    const H = Math.min(Math.max(headH + bodyH + footH, 1080), 2400);
    const TH = { sapin: { t: '#2b5f4b', b: '#163629', chev: 'rgba(143,192,164,.18)', edge: '#e9f0f2', gold: '#f1d78a', head: '#fff', sub: '#d4e6ef', bg: '#fbf8ef', band: '#f3efe2', ink: '#1b2b44', soft: '#675e51', bad: '#a93a2c', foot: '#1f4a3a', footT: '#e9f0f2', ph: '#8faec0' },
      glace: { t: '#f1f9fd', b: '#a8cfe4', chev: 'rgba(255,255,255,.4)', edge: '#ffffff', gold: '#1d6a9c', head: '#123a55', sub: '#2c5b78', bg: '#fbfdff', band: '#eaf3f9', ink: '#17364d', soft: '#566b79', bad: '#b83a2a', foot: '#1e5a80', footT: '#ffffff', ph: '#a8cfe4' },
      nuit: { t: '#1c2f55', b: '#0b1322', chev: 'rgba(120,160,230,.18)', edge: '#2f56d6', gold: '#8fb4ff', head: '#ffffff', sub: '#c9d9f5', bg: '#18222f', band: '#1e2b3b', ink: '#e4eaf2', soft: '#9aaabd', bad: '#ff9a8a', foot: '#0b1322', footT: '#cfe0ff', ph: '#3d527f' } };
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
    let y = headH;
    const imgs = await Promise.all(lay.map((l) => loadImg(`img/athletes/${l.r.ath}.jpg`)));
    const extra = H - (headH + bodyH + footH); const gap = extra > 0 ? Math.min(extra / (lay.length + 1), 18) : 0; y += gap;
    lay.forEach((l, i) => {
      const r = l.r, h = l.h, cy = y + h / 2;
      if (i % 2) { g.fillStyle = K.band; g.fillRect(0, y, W, h); }
      g.fillStyle = r.status ? K.bad : K.ink; g.font = `800 34px ${FD}`; g.textAlign = 'center';
      g.fillText(r.status ? r.status : r.rank ? String(r.rank) : '', padX + 28, cy + 12); g.textAlign = 'left';
      const ix = padX + 70, rad = 30;
      g.save(); g.beginPath(); g.arc(ix + rad, cy, rad, 0, Math.PI * 2); g.clip();
      if (imgs[i]) { const im = imgs[i], s = Math.max(rad * 2 / im.width, rad * 2 / im.height); g.drawImage(im, ix, cy - rad, im.width * s, im.height * s * 1); } else { g.fillStyle = K.ph; g.fillRect(ix, cy - rad, rad * 2, rad * 2); }
      g.restore(); g.strokeStyle = K.ink; g.lineWidth = 2.5; g.beginPath(); g.arc(ix + rad, cy, rad, 0, Math.PI * 2); g.stroke();
      g.fillStyle = K.ink; g.font = `700 29px ${F}`;
      const nm = wrap(g, C.nameOf(r.ath), nameW - 10); nm.slice(0, 2).forEach((s, k) => g.fillText(s, nameX, cy + 10 - (nm.length > 1 ? 18 : 0) + k * 36));
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
  const api = { init, raceRows, raceText, cardHtml, open, copy, jpg, jpgCanvas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_SHARE = api;
})(typeof window !== 'undefined' ? window : globalThis);
