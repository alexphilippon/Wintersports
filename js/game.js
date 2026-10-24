/* Ski game – règles du jeu (fonctions pures, testables sous Node) */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.SKI_DATA;

  /* ---------- Dates : heure de Paris ---------- */
  function parisInstant(date, time) {
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = (time || '00:00').split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asParis = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    const offset = asParis - guess;
    return new Date(guess - offset);
  }

  /* ---------- Calendrier vivant : annulations, reports, heures confirmées ---------- */
  // Surcharges posées par l'admin : { raceId: { status:'cancelled', date, time, place, moved:true } }
  let OVR = {};
  function setOverrides(o) { OVR = o || {}; }
  /** Course avec ses éventuelles surcharges. `cancelled` : annulée. `moved` : reportée (elle a alors sa propre deadline). */
  function raceOf(id) {
    const r = D.RACES[id], o = OVR[id];
    if (!r || !o) return r;
    return Object.assign({}, r, {
      date: o.date || r.date, time: o.time || r.time, place: o.place || r.place,
      timeKnown: o.time ? true : r.timeKnown, cancelled: o.status === 'cancelled', moved: !!o.moved, note: o.note || '',
      originalDate: r.date,
    });
  }
  const raceStart = (race) => parisInstant(race.date, race.time);

  function sessionRaces(session) { return session.races.map(raceOf); }
  const activeRaces = (session) => sessionRaces(session).filter((r) => !r.cancelled);
  /** Courses qui fixent le calendrier de la session : ni annulées ni reportées (sauf si toutes le sont). */
  function anchorRaces(session) {
    const act = activeRaces(session);
    const fixed = act.filter((r) => !r.moved);
    return fixed.length ? fixed : act.length ? act : sessionRaces(session);
  }
  function sessionDeadline(session) {
    return new Date(Math.min(...anchorRaces(session).map((r) => raceStart(r).getTime())));
  }
  function sessionEnd(session) {
    const last = anchorRaces(session).map((r) => raceStart(r).getTime());
    return new Date(Math.max(...last) + 12 * 3600 * 1000);
  }
  const sessionOfRace = (id) => D.SESSIONS.concat([D.WORLDS]).find((s) => s.races.includes(id));
  /** Moment où les choix d'une course se verrouillent : la deadline de la session, ou le nouveau départ si la course est reportée. */
  function raceLockTime(race) {
    return race.moved ? raceStart(race) : sessionDeadline(sessionOfRace(race.id));
  }
  const raceLocked = (race, now) => now >= raceLockTime(race);
  /** 'ouverte' (choix possibles) | 'en cours' (choix verrouillés) | 'terminée' */
  function sessionState(session, now) {
    if (now < sessionDeadline(session)) return 'ouverte';
    if (now < sessionEnd(session)) return 'en cours';
    return 'terminée';
  }

  /* ---------- Points ---------- */
  function pointsForRank(rank) {
    return rank >= 1 && rank <= D.POINTS.length ? D.POINTS[rank - 1] : 0;
  }
  /** Points d'un rang dans une course : aux finales, seuls les 15 premiers marquent (règle officielle). */
  const FINALS_TOP = 15;
  function racePoints(race, rank) {
    if (race && race.kind === 'finale' && rank > FINALS_TOP) return 0;
    return pointsForRank(rank);
  }
  function findEntry(results, raceId, athId) {
    return ((results && results[raceId]) || []).find((e) => e.ath === athId) || null;
  }
  const isDNS = (results, raceId, ath) => { const e = findEntry(results, raceId, ath); return !!e && e.status === 'DNS'; };
  /** Athlète qui remplace un titulaire DNS : le remplaçant s'il a pris le départ, sinon le skieur tiré au sort (d), sinon personne. */
  function substitute(pick, results, raceId) {
    if (pick.b && !isDNS(results, raceId, pick.b)) return pick.b;
    return pick.d || null;
  }
  /** Athlète effectivement compté : le titulaire ; s'il ne part pas (DNS), le remplaçant ; si lui non plus, le skieur tiré au sort. */
  function effectiveAthlete(pick, results, raceId) {
    if (!pick || !pick.a) return null;
    if (isDNS(results, raceId, pick.a)) return substitute(pick, results, raceId) || pick.a;
    return pick.a;
  }
  /** Tirage au sort reproductible : même graine et mêmes candidats donnent toujours le même skieur. */
  function hash53(str) { // cyrb53
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  /** candidates : identifiants triés par dossard. Retourne { ath, index, n } ou null s'il n'y a personne. */
  function drawSkier(seed, candidates) {
    if (!candidates.length) return null;
    const index = hash53(seed) % candidates.length;
    return { ath: candidates[index], index, n: candidates.length };
  }
  const deskIdOf = (raceId) => { const s = sessionOfRace(raceId); return s === D.WORLDS ? 0 : s.desk; };
  /** Tirages à faire : titulaire ET remplaçant absents (DNS confirmés). Un tirage par joueur concerné, parmi les 30 premiers dossards
      du départ (manche 1 en GS/SL), hors skieurs déjà grillés par ce joueur dans le desk et hors non-partants.
      meta : { start:[{bib,ath}], seed } par course. Retourne { raceId: { playerId: {ath, index, n, seed, candidates} } }. */
  function autoDraws(results, meta, picksByPlayer) {
    const out = {};
    Object.keys(meta || {}).forEach((raceId) => {
      const m = meta[raceId], race = raceOf(raceId);
      if (!race || race.cancelled || !results[raceId] || !m.start) return;
      Object.keys(picksByPlayer).forEach((pid) => {
        const pk = (picksByPlayer[pid] || {})[raceId];
        if (!pk || !pk.a || pk.d || !isDNS(results, raceId, pk.a)) return;
        if (pk.b && !isDNS(results, raceId, pk.b)) return;
        const burnt = usedInDesk(deskIdOf(raceId), race.gender, picksByPlayer[pid], raceId, results);
        const cands = m.start.slice().sort((x, y) => x.bib - y.bib).slice(0, 30).map((x) => x.ath)
          .filter((id) => !burnt.has(id) && !isDNS(results, raceId, id));
        // graine : la liste de départ elle-même (30 premiers dossards, par ordre de dossard) : connue dès la start list, avant la 1re manche
        const sig = m.start.slice().sort((x, y) => x.bib - y.bib).slice(0, 30).map((x) => x.ath || '?').join(',');
        const seed = `${raceId}|${pid}|${sig}`;
        const d = drawSkier(seed, cands);
        if (d) (out[raceId] = out[raceId] || {})[pid] = Object.assign({ seed, candidates: cands }, d);
      });
    });
    return out;
  }
  function scoreRace(race, pick, results) {
    if (race.cancelled) return null; // course annulée : personne ne marque
    if (!results || !results[race.id]) return null; // pas encore de résultat
    const ath = effectiveAthlete(pick, results, race.id);
    if (!ath) return 0;
    const e = findEntry(results, race.id, ath);
    if (!e || e.status) return 0; // DNF, DSQ, DNS, ou hors points
    return racePoints(race, e.rank) * race.mult;
  }

  /* ---------- Bonus des Mondiaux ---------- */
  function worldsWinner(results, raceId) {
    const e = ((results && results[raceId]) || []).find((x) => !x.status && x.rank === 1);
    return e ? e.ath : null;
  }
  /** +200 par discipline (H et F gagnants), +400 pour les 4 vainqueurs d'un genre, cumulables. */
  function worldsBonus(picksOfPlayer, results) {
    const won = {};
    D.WORLDS.races.forEach((id) => {
      const w = worldsWinner(results, id);
      won[id] = !!w && effectiveAthlete(picksOfPlayer && picksOfPlayer[id], results, id) === w;
    });
    const lines = [];
    ['DH', 'SG', 'GS', 'SL'].forEach((d) => {
      if (won['XM' + d] && won['XW' + d]) lines.push({ label: D.DISC[d].fr + ' : les deux vainqueurs', pts: 200 });
    });
    ['M', 'W'].forEach((g) => {
      if (['DH', 'SG', 'GS', 'SL'].every((d) => won['X' + g + d])) {
        lines.push({ label: (g === 'M' ? 'Messieurs' : 'Dames') + ' : quatre vainqueurs', pts: 400 });
      }
    });
    return { lines, total: lines.reduce((s, l) => s + l.pts, 0) };
  }

  /* ---------- Totaux ---------- */
  function sessionScore(session, picksOfPlayer, results) {
    return sessionRaces(session).reduce((s, r) => s + (scoreRace(r, picksOfPlayer && picksOfPlayer[r.id], results) || 0), 0);
  }
  function deskScore(deskId, picksOfPlayer, results) {
    return D.SESSIONS.filter((s) => s.desk === deskId).reduce((s, x) => s + sessionScore(x, picksOfPlayer, results), 0);
  }
  function worldsScore(picksOfPlayer, results) {
    const races = D.WORLDS.races.reduce((s, id) => s + (scoreRace(raceOf(id), picksOfPlayer && picksOfPlayer[id], results) || 0), 0);
    const bonus = worldsBonus(picksOfPlayer, results).total;
    return { races, bonus, total: races + bonus };
  }
  function disciplineScore(disc, picksOfPlayer, results) {
    return Object.keys(D.RACES).map(raceOf).filter((r) => r.disc === disc)
      .reduce((s, r) => s + (scoreRace(r, picksOfPlayer && picksOfPlayer[r.id], results) || 0), 0);
  }
  function generalScore(picksOfPlayer, results) {
    const desks = D.DESKS.map((d) => deskScore(d.id, picksOfPlayer, results));
    const w = worldsScore(picksOfPlayer, results);
    return { desks, worlds: w.total, total: desks.reduce((a, b) => a + b, 0) + w.total };
  }

  /* ---------- Contrainte « un athlète une seule fois par desk » ---------- */
  /** Athlètes déjà « grillés » dans le desk, pour un genre, hors la course `exceptRaceId`.
      Une course annulée libère son skieur. Si le titulaire est DNS (résultat connu), il reste libre : seul compte celui qui a pris le départ. */
  function usedInDesk(deskId, gender, picksOfPlayer, exceptRaceId, results) {
    const used = new Set();
    // deskId 0 = bloc des Mondiaux (huit épreuves, huit skieurs différents par genre)
    const scope = deskId === 0 ? [D.WORLDS] : D.SESSIONS.filter((s) => s.desk === deskId);
    scope.forEach((s) => {
      sessionRaces(s).forEach((r) => {
        if (r.gender !== gender || r.id === exceptRaceId || r.cancelled) return;
        const p = picksOfPlayer && picksOfPlayer[r.id];
        if (!p || !p.a) return;
        const main = findEntry(results, r.id, p.a);
        if (main && main.status === 'DNS') { const sub = substitute(p, results, r.id); if (sub) used.add(sub); return; }
        used.add(p.a);
      });
    });
    return used;
  }

  /* ---------- Rentabilité d'un choix (onglet desk) ---------- */
  const ANA_MIN = 2;   // autres joueurs nécessaires pour qu'une comparaison ait un sens
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  /** Comparaison de mon choix sur une course terminée.
      skier : mes points vs la moyenne des autres joueurs ayant pris ce skieur dans le même desk (une fois par joueur, sur n'importe quelle course du desk jouée).
      race  : mes points vs la moyenne des autres joueurs sur cette course, quel que soit leur skieur (ne bouge plus une fois la course jouée).
      flakes : note de 0 à 5 par demi-flocon = 5 × (0,5 × √(points / max) + 0,25 × écart à la course + 0,25 × écart au skieur), les écarts valant 0,5 + (moi − moyenne) / max borné à [0 ; 1].
      Sans comparaison « skieur » disponible : 0,65 / 0,35 et provisoire = true. Sans comparaison « course » : flakes = null. 0 point = 0 flocon. */
  function pickAnalysis(race, meId, picksByPlayer, results, playerIds) {
    const mp = picksByPlayer && picksByPlayer[meId] && picksByPlayer[meId][race.id];
    if (!mp || !mp.a || race.cancelled || !results || !results[race.id]) return null;
    const ath = effectiveAthlete(mp, results, race.id);
    if (!ath) return null;
    const max = pointsForRank(1) * (race.mult || 1), mine = scoreRace(race, mp, results) || 0;
    const others = (playerIds || []).filter((id) => id !== meId);
    const rPts = others.map((id) => picksByPlayer[id] && picksByPlayer[id][race.id]).filter((pk) => pk && pk.a).map((pk) => scoreRace(race, pk, results) || 0);
    const scope = deskIdOf(race.id) === 0 ? [D.WORLDS] : D.SESSIONS.filter((x) => x.desk === deskIdOf(race.id));
    const sPts = [];
    others.forEach((id) => {
      for (const s of scope) for (const r of sessionRaces(s)) {
        if (r.gender !== race.gender || r.cancelled || !results[r.id]) continue;
        const pk = picksByPlayer[id] && picksByPlayer[id][r.id];
        if (pk && pk.a && effectiveAthlete(pk, results, r.id) === ath) { sPts.push(scoreRace(r, pk, results) || 0); return; }
      }
    });
    const raceOk = rPts.length >= ANA_MIN, skierOk = sPts.length >= ANA_MIN;
    const rAvg = rPts.length ? avg(rPts) : null, sAvg = sPts.length ? avg(sPts) : null;
    let flakes = null;
    if (raceOk) {
      const abs = Math.sqrt(clamp01(mine / max)), rel = (m) => clamp01(0.5 + (mine - m) / max);
      const score = skierOk ? 0.5 * abs + 0.25 * rel(rAvg) + 0.25 * rel(sAvg) : 0.65 * abs + 0.35 * rel(rAvg);
      flakes = mine <= 0 ? 0 : Math.max(0.5, Math.round(score * 10) / 2);
    }
    return { ath, mine, max, skier: { ok: skierOk, n: sPts.length, avg: sAvg }, race: { ok: raceOk, n: rPts.length, avg: rAvg }, flakes, provisional: raceOk && !skierOk, min: ANA_MIN };
  }

  const api = {
    parisInstant, setOverrides, raceOf, raceStart, activeRaces, sessionOfRace, raceLockTime, raceLocked, sessionRaces, sessionDeadline, sessionEnd, sessionState,
    pointsForRank, racePoints, FINALS_TOP, effectiveAthlete, substitute, drawSkier, autoDraws, scoreRace, worldsWinner, worldsBonus,
    pickAnalysis, sessionScore, deskScore, worldsScore, disciplineScore, generalScore, usedInDesk,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SKI_GAME = api;
})(typeof window !== 'undefined' ? window : globalThis);
