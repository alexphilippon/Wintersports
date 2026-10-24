/* Ski game – section Admin (organisateur) : résultats, calendrier (annulations, reports, heures), skieurs, tirages, contrôles. */
(function (root) {
  'use strict';
  let C = null; // contexte fourni par app.js à chaque rendu
  const A = { sub: 'ctl', race: '', parsed: null, text: '', msg: '', calRace: '' };
  const SUBS = [['ctl', 'Contrôles'], ['res', 'Résultats'], ['cal', 'Calendrier'], ['ath', 'Skieurs'], ['draw', 'Tirages'], ['idea', 'Idées et questions']];
  const $ = (s) => document.querySelector(s);
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  const say = (m) => { A.msg = m; C.rerender(); };

  const allRaces = () => Object.keys(C.D.RACES).map((id) => C.G.raceOf(id)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.gender.localeCompare(b.gender));
  const raceLabel = (r) => `${C.shortOf(r.date)} · ${C.placeLabel(r)} · ${r.gender === 'M' ? 'Messieurs' : 'Dames'} · ${C.discLabel(r)}${r.cancelled ? ' (annulée)' : r.moved ? ' (reportée)' : ''}`;
  const raceOptions = (sel, filter) => allRaces().filter(filter || (() => true)).map((r) => `<option value="${r.id}"${sel === r.id ? ' selected' : ''}>${C.esc(raceLabel(r))}</option>`).join('');
  const entryText = (e) => e.status ? `${e.status} ${C.ATH[e.ath] ? C.ATH[e.ath].name : e.ath}` : `${e.rank} ${C.ATH[e.ath] ? C.ATH[e.ath].name : e.ath}`;

  /* ---------- Lecture d'un classement collé ---------- */
  function matchLine(text, gender, list) {
    const toks = new Set(tokens(text));
    let best = [], bestN = 0;
    (list || C.LIST)[gender].forEach((a) => {
      const n = tokens(a.name);
      if (!n.length || !n.every((t) => toks.has(t))) return;
      if (n.length > bestN) { best = [a]; bestN = n.length; } else if (n.length === bestN) best.push(a);
    });
    return best;
  }
  function parseResults(text, gender, list) {
    const rows = [];
    text.split(/\r?\n/).forEach((raw) => {
      let line = raw.trim(); if (!line) return;
      let status = null, rank = null;
      const st = line.match(/\b(DNS|DNF|DSQ|DQ)\b/i);
      if (st) { status = st[1].toUpperCase() === 'DQ' ? 'DSQ' : st[1].toUpperCase(); line = line.replace(st[0], ' '); }
      else { const m = line.match(/^=?\s*(\d{1,3})\s*[.)\-:]?\s+(.*)$/); if (m) { rank = parseInt(m[1], 10); line = m[2]; } }
      if (!status && rank === null) { rows.push({ raw, skip: true }); return; }
      const c = matchLine(line, gender, list);
      rows.push({ raw, rank, status, name: line.replace(/\d{1,2}:\d{2}[.,]\d+|\b\d+[.,]\d{2}\b|\b[A-Z]{3}\b/g, ' ').replace(/\s+/g, ' ').trim(), cands: c, ath: c.length === 1 ? c[0].id : '' });
    });
    return rows;
  }

  /* ---------- Rendus ---------- */
  function msgBox() { return A.msg ? `<p class="adm__msg" role="status">${C.esc(A.msg)}</p>` : ''; }

  function ctlView() {
    const { state, G, D, esc } = C;
    const now = state.sim || new Date();
    const up = [...D.SESSIONS, D.WORLDS].sort((a, b) => G.sessionDeadline(a) - G.sessionDeadline(b)).find((s) => G.sessionState(s, now) !== 'terminée');
    const fresh = C.newPlayers();
    let html = fresh.length ? `<div class="adm__msg">🔔 ${fresh.length > 1 ? 'Nouveaux joueurs inscrits' : 'Nouveau joueur inscrit'} : <strong>${fresh.map((p) => esc(p.name) + (state.contacts[p.id] ? ` (${esc(state.contacts[p.id])})` : '')).join(', ')}</strong> <button type="button" class="btn btn--ghost" data-adm="players-seen">Marquer comme vu</button></div>` : '';
    if (up) {
      const races = C.active(C.sortedRaces(up));
      const rows = state.players.map((p) => {
        const mine = state.picks[p.id] || {};
        const n = races.filter((r) => (mine[r.id] || {}).a).length;
        return `<tr><th scope="row">${esc(p.name)}</th><td class="num${n === races.length ? ' ok' : ''}">${n}/${races.length}</td><td>${races.filter((r) => !(mine[r.id] || {}).a).map((r) => esc(C.placeLabel(r) + ' ' + r.gender)).join(', ') || '—'}</td></tr>`;
      }).join('');
      html += `<h3 class="subtitle">${esc(up.name)} : qui a choisi ?</h3><p class="hint">Deadline : ${esc(C.dlShort(G.sessionDeadline(up)))}</p>
      <div class="tablewrap"><table class="grid"><thead><tr><th>Joueur</th><th class="num">Choix</th><th>Manquants</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Aucun joueur inscrit.</td></tr>'}</tbody></table></div>`;
    }
    // choix modifiés après le verrouillage
    const late = [];
    state.players.forEach((p) => {
      Object.entries(C.state.raw.picks[p.id] || {}).forEach(([rid, pk]) => {
        const r = G.raceOf(rid); if (!r || !pk || !pk.ts) return;
        if (pk.ts > G.raceLockTime(r).getTime() + 60000) late.push({ p, r, ts: pk.ts });
      });
    });
    html += `<h3 class="subtitle">Choix posés ou modifiés après la deadline</h3>${late.length
      ? `<ul class="adm__list">${late.map((x) => `<li><strong>${esc(x.p.name)}</strong> · ${esc(raceLabel(x.r))} · ${esc(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(x.ts)))}</li>`).join('')}</ul>`
      : '<p class="hint">Aucun.</p>'}`;
    const dot = (p) => { const age = Date.now() - (p.lastSeen || 0), on = p.lastSeen && age < 5 * 60 * 1000;
      const ago = !p.lastSeen ? 'jamais vu' : on ? 'connecté' : age < 3600e3 ? `vu il y a ${Math.max(1, Math.round(age / 60e3))} min` : age < 86400e3 ? `vu il y a ${Math.round(age / 3600e3)} h` : `vu il y a ${Math.round(age / 86400e3)} j`;
      return `<span class="presence presence--${on ? 'on' : 'off'}" title="${ago}" aria-label="${ago}"></span>`; };
    html += `<h3 class="subtitle">Joueurs inscrits (${state.players.length})</h3>${state.players.length ? `<ul class="adm__list">${state.players.map((p) => `<li class="adm__ph">${dot(p)}<span class="pav pav--sm">${p.photo ? `<img src="${p.photo}" alt="">` : `<span>${esc((p.name || '?')[0].toUpperCase())}</span>`}</span><strong>${esc(p.name)}</strong> <span class="sub">${p.lastSeen ? (Date.now() - p.lastSeen < 5 * 60e3 ? 'connecté' : 'vu ' + new Date(p.lastSeen).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : 'jamais vu'} · </span><span class="sub">${state.contacts[p.id] ? esc(state.contacts[p.id]) : 'e-mail non disponible'}</span>${p.blocked ? `<span class="sub">photo interdite</span> <button type="button" class="linkbtn" data-adm="photo-allow" data-id="${esc(p.id)}">Autoriser à nouveau</button>` : p.photo ? `<button type="button" class="linkbtn" data-adm="photo-censor" data-id="${esc(p.id)}">Retirer la photo</button>` : ''}</li>`).join('')}</ul>` : '<p class="hint">Personne pour l’instant.</p>'}`;
    return html;
  }

  function resView() {
    const { esc, state } = C;
    const r = A.race ? C.G.raceOf(A.race) : null;
    const existing = r && state.results[r.id];
    let html = `<label for="adm-race">Course</label><select id="adm-race" data-adm-change="race"><option value="">Choisir une course…</option>${raceOptions(A.race, (x) => !x.cancelled)}</select>`;
    if (!r) return html + '<p class="hint">Choisis une course pour saisir ou corriger son résultat.</p>';
    if (A.text === '' && existing) A.text = existing.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999)).map(entryText).join('\n');
    html += `<p class="hint">${existing ? 'Résultat déjà saisi : modifie le texte ci-dessous pour le corriger.' : 'Pas encore de résultat.'} Colle le classement, une ligne par skieur : <code>1 Marco Odermatt</code>. Ex æquo : même numéro sur deux lignes. Pour les non-partants : <code>DNS Nom</code> (aussi <code>DNF</code>, <code>DSQ</code>). Seuls les 30 premiers marquent des points ; pour les manches de géant et de slalom, indique le classement cumulé final.</p>
      <textarea id="adm-text" rows="12" spellcheck="false" placeholder="1 Marco Odermatt&#10;2 Loïc Meillard&#10;…&#10;DNS Nom Prénom">${esc(A.text)}</textarea>
      <div class="atelier__row"><button type="button" class="btn" data-adm="analyse">Analyser</button>${existing ? '<button type="button" class="btn btn--ghost" data-adm="clear-result">Effacer ce résultat</button>' : ''}</div>`;
    if (A.parsed) {
      const rows = A.parsed.map((x, i) => {
        if (x.skip) return `<tr class="is-skip"><td colspan="3">Ligne ignorée : ${esc(x.raw)}</td></tr>`;
        const what = x.status || (x.rank + (x.rank === 1 ? 'er' : 'e'));
        let who;
        if (x.cands.length === 1) who = `<span class="ok">${esc(x.cands[0].name)}</span>`;
        else {
          const opts = (x.cands.length ? x.cands : C.LIST[r.gender]).map((a) => `<option value="${a.id}"${x.ath === a.id ? ' selected' : ''}>${esc(a.name)} (${esc(a.nat || '?')})</option>`).join('');
          who = `<span class="warn">${x.cands.length ? 'Plusieurs possibles' : 'Inconnu'} : « ${esc(x.name)} »</span> <select data-adm-change="resolve" data-i="${i}"><option value="">Choisir…</option>${opts}<option value="__new__">Ajouter comme nouveau skieur</option></select>`;
        }
        return `<tr><td class="num">${what}</td><td>${who}</td><td class="num">${x.rank ? C.G.racePoints(r, x.rank) * r.mult : 0}</td></tr>`;
      }).join('');
      const ready = A.parsed.filter((x) => !x.skip).every((x) => x.ath);
      html += `<div class="tablewrap"><table class="grid"><thead><tr><th class="num">Place</th><th>Skieur</th><th class="num">Points${r.mult > 1 ? ' ×' + r.mult : ''}</th></tr></thead><tbody>${rows}</tbody></table></div>
        <button type="button" class="btn btn--brique" data-adm="save-result"${ready ? '' : ' disabled'}>Enregistrer le résultat</button>${ready ? '' : '<p class="hint">Résous les lignes en orange pour enregistrer.</p>'}`;
    }
    return html;
  }

  function calView() {
    const { esc, G, state } = C;
    const r = A.calRace ? G.raceOf(A.calRace) : null;
    let html = `<label for="adm-cal">Course</label><select id="adm-cal" data-adm-change="calrace"><option value="">Choisir une course…</option>${raceOptions(A.calRace)}</select>`;
    if (r) {
      const o = state.overrides[r.id] || {};
      html += `<form class="adm__form" id="adm-calform" data-race="${r.id}">
        <p class="hint">Actuellement : ${esc(C.shortOf(r.date))} à ${esc(C.hourText(G.raceStart(r)))}${r.timeKnown ? '' : ' (heure provisoire)'}, ${esc(C.placeLabel(r))}${r.cancelled ? ', <strong>annulée</strong>' : r.moved ? ', <strong>reportée</strong>' : ''}.</p>
        <label for="cal-date">Date</label><input id="cal-date" type="date" value="${esc(o.date || r.date)}">
        <label for="cal-time">Heure de départ (heure de Paris, 1re manche)</label><input id="cal-time" type="time" value="${esc(o.time || r.time)}">
        <label for="cal-place">Lieu</label><input id="cal-place" type="text" value="${esc(o.place || r.place)}">
        <label for="cal-note">Note (facultatif)</label><input id="cal-note" type="text" value="${esc(o.note || '')}">
        <div class="atelier__row">
          <button type="button" class="btn" data-adm="cal-time">Confirmer l’heure / le lieu</button>
          <button type="button" class="btn" data-adm="cal-move">Reporter (nouvelle date)</button>
          <button type="button" class="btn btn--ghost" data-adm="cal-cancel">Annuler la course</button>
          ${state.overrides[r.id] ? '<button type="button" class="btn btn--ghost" data-adm="cal-reset">Rétablir le calendrier d’origine</button>' : ''}
        </div>
        <p class="hint">Annuler : la course ne compte plus, les skieurs choisis sont libérés. Reporter : les choix restent et sont modifiables jusqu’au nouveau départ.</p></form>`;
    }
    const changed = Object.keys(state.overrides).map((id) => G.raceOf(id));
    html += `<h3 class="subtitle">Courses modifiées (${changed.length})</h3>${changed.length ? `<ul class="adm__list">${changed.map((x) => `<li>${esc(raceLabel(x))} → ${esc(C.shortOf(x.date))} ${esc(C.hourText(G.raceStart(x)))}${x.note ? ' · ' + esc(x.note) : ''}</li>`).join('')}</ul>` : '<p class="hint">Aucune.</p>'}`;
    const next = allRaces().filter((x) => !x.cancelled && G.raceStart(x) > (state.sim || new Date())).slice(0, 12);
    html += `<h3 class="subtitle">Prochaines courses</h3><ul class="adm__list">${next.map((x) => `<li>${esc(raceLabel(x))} · ${esc(C.hourText(G.raceStart(x)))}${x.timeKnown ? '' : ' <em>(heure à confirmer)</em>'}</li>`).join('')}</ul>`;
    return html;
  }

  function athView() {
    const { esc, state, LIST } = C;
    const pend = state.extra.filter((x) => x.pending && !state.aliases[x.id]);
    let html = `<h3 class="subtitle">Ajouter un skieur absent de la liste</h3>
      <form class="adm__form" id="adm-addath"><label for="na-name">Prénom et nom</label><input id="na-name" type="text" required>
        <label for="na-nat">Nation (3 lettres, ex. FRA)</label><input id="na-nat" type="text" maxlength="3" style="text-transform:uppercase">
        <label for="na-g">Genre</label><select id="na-g"><option value="M">Messieurs</option><option value="W">Dames</option></select>
        <button type="submit" class="btn">Ajouter</button></form>
      <h3 class="subtitle">Noms libres saisis par des joueurs (${pend.length})</h3>`;
    if (!pend.length) html += '<p class="hint">Rien à régulariser.</p>';
    else html += `<ul class="adm__list">${pend.map((x) => {
      const by = state.players.find((p) => p.id === x.createdBy);
      const opts = LIST[x.gender].filter((a) => !a.pending).map((a) => `<option value="${a.id}">${esc(a.name)} (${esc(a.nat || '?')})</option>`).join('');
      return `<li><strong>${esc(x.name)}</strong> (${x.gender === 'M' ? 'messieurs' : 'dames'}${by ? ', saisi par ' + esc(by.name) : ''})<br>
        <select data-adm-change="merge" data-id="${esc(x.id)}"><option value="">Fusionner avec le skieur…</option>${opts}</select>
        <button type="button" class="btn btn--ghost" data-adm="accept" data-id="${esc(x.id)}">Garder comme nouveau skieur</button></li>`;
    }).join('')}</ul>`;
    const added = state.extra.filter((x) => !x.pending);
    html += `<h3 class="subtitle">Skieurs ajoutés (${added.length})</h3><p class="hint">${added.map((x) => esc(x.name)).join(', ') || 'Aucun.'}</p>
      <p class="hint">Liste de base : ${C.LIST.M.length - state.extra.filter((x) => x.gender === 'M' && !state.aliases[x.id]).length} messieurs, ${C.LIST.W.length - state.extra.filter((x) => x.gender === 'W' && !state.aliases[x.id]).length} dames (classement FIS 2025-26). Mise à jour de la liste : voir README (tools/build-athletes.js).</p>`;
    return html;
  }

  function drawJobs() {
    const { state, G } = C, now = state.sim || new Date(), jobs = [];
    const deskOf = (r) => (G.sessionOfRace(r.id) || {}).desk;
    Object.keys(C.D.RACES).map(G.raceOf).forEach((r) => {
      if (r.cancelled || !G.raceLocked(r, now) || G.raceStart(r) < now - 30 * 86400000) return;
      state.players.forEach((p) => {
        const pk = (state.picks[p.id] || {})[r.id];
        const res = state.results[r.id];
        if (!pk || !pk.a) { jobs.push({ p, r, kind: 'oubli', pk: null }); return; }
        const main = res && res.find((e) => e.ath === pk.a);
        const sub = pk.b && (((res || []).find((e) => e.ath === pk.b) || {}).status !== 'DNS');
        if (main && main.status === 'DNS' && !sub && !pk.d) jobs.push({ p, r, kind: 'dns', pk });
      });
    });
    return jobs.sort((a, b) => (a.r.date + a.r.time).localeCompare(b.r.date + b.r.time)).map((j) => Object.assign(j, { desk: deskOf(j.r) }));
  }
  function drawView() {
    const { esc, state, G, LIST } = C;
    const jobs = drawJobs();
    if (!jobs.length) return '<p class="hint">Aucun tirage à faire : chaque choix verrouillé est complet et aucun titulaire DNS n’est sans remplaçant.</p>';
    return `<p class="hint">Le tirage se fait hors du site ; saisis ici le skieur tiré. Seuls les skieurs encore libres du joueur dans ce desk sont proposés.</p><ul class="adm__list">${jobs.map((j, i) => {
      const used = G.usedInDesk(j.desk, j.r.gender, state.picks[j.p.id] || {}, j.r.id, state.results);
      const opts = LIST[j.r.gender].filter((a) => !used.has(a.id)).map((a) => `<option value="${a.id}">${esc(a.name)} (${esc(a.nat || '?')})</option>`).join('');
      return `<li><strong>${esc(j.p.name)}</strong> · ${esc(raceLabel(j.r))} · ${j.kind === 'oubli' ? 'choix oublié' : `titulaire ${esc(C.nameOf(j.pk.a))} non partant, sans remplaçant`}<br>
        <select data-adm-change="draw" data-i="${i}"><option value="">Skieur tiré au sort…</option>${opts}</select></li>`;
    }).join('')}</ul>`;
  }

  function ideaView() {
    if (!A.ideasOn) { A.ideasOn = true; A.ideas = []; C.store.listenIdeas((l) => { A.ideas = l; if (A.sub === 'idea') C.rerender(); }); }
    if (!A.ideas.length) return '<p class="hint">Aucune suggestion pour l’instant.</p>';
    return `<ul class="adm__list">${A.ideas.map((i) => `<li><strong>${C.esc(i.name || '?')}</strong> ${i.kind === 'question' ? '<span class="flag flag--moved">Question</span>' : '<span class="flag flag--idea">Idée</span>'} ${i.contact ? `<span class="sub">Contact : ${C.esc(i.contact)}</span>` : ''}<span class="sub">${C.esc(new Date(i.ts).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }))}</span><br>${C.esc(i.text).replace(/\n/g, '<br>')}</li>`).join('')}</ul>`;
  }

  function render(ctx) {
    C = ctx;
    const body = { ctl: ctlView, res: resView, cal: calView, ath: athView, draw: drawView, idea: ideaView }[A.sub]();
    const drawN = drawJobs().length;
    const tabs = SUBS.map(([id, l]) => `<button type="button" role="tab" class="seg__btn" aria-selected="${A.sub === id}" data-adm-sub="${id}">${l}${id === 'draw' && drawN ? ` (${drawN})` : ''}</button>`).join('');
    return `<section class="adm"><header class="deskhead"><div><h2>Administration</h2><p class="deskhead__meta">Réservé à l’organisateur</p></div></header>
      <div class="seg" role="tablist" aria-label="Administration">${tabs}</div>${msgBox()}<div class="deskbody adm__body">${body}</div></section>`;
  }

  /* ---------- Actions ---------- */
  const guard = (p) => p.catch((e) => C.fail(e));
  document.addEventListener('click', async (e) => {
    if (!C) return;
    const sub = e.target.closest('[data-adm-sub]');
    if (sub) { A.sub = sub.dataset.admSub; A.msg = ''; C.rerender(); return; }
    const b = e.target.closest('[data-adm]'); if (!b) return;
    const act = b.dataset.adm;
    const r = A.race ? C.G.raceOf(A.race) : null;
    if (act === 'players-seen') { C.markPlayersSeen(); return; }
    if (act === 'photo-censor') { if (window.confirm('Retirer cette photo et empêcher le joueur d’en envoyer une nouvelle ?')) await guard(C.store.setPhotoBlock(b.dataset.id, true)); return; }
    if (act === 'photo-allow') { await guard(C.store.setPhotoBlock(b.dataset.id, false)); return; }
    if (act === 'analyse' && r) {
      A.text = $('#adm-text').value; A.parsed = parseResults(A.text, r.gender); A.msg = ''; C.rerender();
    } else if (act === 'save-result' && r && A.parsed) {
      const entries = A.parsed.filter((x) => !x.skip && x.ath).map((x) => (x.status ? { ath: x.ath, status: x.status } : { ath: x.ath, rank: x.rank }));
      await guard(C.store.setResult(r.id, entries)); A.parsed = null; A.text = ''; say(`Résultat enregistré : ${entries.length} lignes.`);
    } else if (act === 'clear-result' && r) {
      if (window.confirm('Effacer le résultat de cette course ?')) { await guard(C.store.setResult(r.id, null)); A.parsed = null; A.text = ''; say('Résultat effacé.'); }
    } else if (act.startsWith('cal-')) {
      const form = $('#adm-calform'); if (!form) return; const id = form.dataset.race, o = Object.assign({}, C.state.overrides[id] || {});
      const v = (n) => $('#cal-' + n).value.trim();
      if (act === 'cal-time') { Object.assign(o, { time: v('time'), place: v('place') }); if (v('date') !== C.D.RACES[id].date && !o.moved) o.date = v('date'); }
      if (act === 'cal-move') { if (v('date') === C.D.RACES[id].date && !o.date) { say('Choisis une nouvelle date pour reporter la course.'); return; } Object.assign(o, { date: v('date'), time: v('time'), place: v('place'), moved: true, status: undefined }); }
      if (act === 'cal-cancel') { if (!window.confirm('Annuler cette course ? Les skieurs déjà choisis seront libérés.')) return; Object.assign(o, { status: 'cancelled' }); }
      if (act === 'cal-reset') { await guard(C.store.setOverride(id, null)); say('Calendrier d’origine rétabli pour cette course.'); return; }
      o.note = v('note'); Object.keys(o).forEach((k) => { if (o[k] === undefined || o[k] === '') delete o[k]; });
      await guard(C.store.setOverride(id, o)); say('Calendrier mis à jour.');
    } else if (act === 'accept') {
      await guard(C.store.updateAthlete(b.dataset.id, { pending: false })); say('Skieur conservé.');
    }
  });
  document.addEventListener('change', async (e) => {
    if (!C) return;
    const t = e.target.closest('[data-adm-change]'); if (!t) return;
    const k = t.dataset.admChange;
    if (k === 'race') { A.race = t.value; A.parsed = null; A.text = ''; A.msg = ''; C.rerender(); }
    else if (k === 'calrace') { A.calRace = t.value; A.msg = ''; C.rerender(); }
    else if (k === 'resolve') {
      const x = A.parsed[+t.dataset.i], r = C.G.raceOf(A.race);
      if (t.value === '__new__') {
        const id = 'x-' + norm(x.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
        await guard(C.store.addAthlete({ id, name: x.name, gender: r.gender, nat: '', pending: false }));
        x.ath = id; x.cands = [{ id, name: x.name, nat: '' }];
      } else x.ath = t.value;
      C.rerender();
    } else if (k === 'merge' && t.value) {
      const x = C.state.extra.find((a) => a.id === t.dataset.id);
      if (x && window.confirm(`Fusionner « ${x.name} » avec ${C.ATH[t.value].name} ? Tous les choix concernés seront rattachés à ce skieur.`)) { await guard(C.store.setAlias(x.id, t.value)); say('Fusion faite.'); } else C.rerender();
    } else if (k === 'draw' && t.value) {
      const j = drawJobs()[+t.dataset.i]; if (!j) return;
      const base = j.kind === 'oubli' ? { a: t.value, drawn: true } : Object.assign({}, j.pk, { d: t.value });
      delete base.ts; await guard(C.store.setPick(j.p.id, j.r.id, base)); say('Tirage enregistré.');
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'adm-text') A.text = e.target.value; });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'adm-addath' || !C) return;
    e.preventDefault();
    const name = $('#na-name').value.trim(), g = $('#na-g').value, nat = $('#na-nat').value.trim().toUpperCase();
    if (!name) return;
    const id = 'x-' + norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    await guard(C.store.addAthlete({ id, name, gender: g, nat, pending: false })); say(`${name} ajouté.`);
  });

  const api = { render, parseResults, matchLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_ADMIN = api;
})(typeof window !== 'undefined' ? window : globalThis);
