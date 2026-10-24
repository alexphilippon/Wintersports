/* Ski game – statistiques des joueurs (fonctions pures, sans DOM) : un « événement » = le choix d'un joueur pour une course terminée.
   Utilisé par les classements bonus, les séries, les fiches joueur et la Data room. */
(function (root) {
  'use strict';

  /**
   * Tous les événements, du plus ancien au plus récent.
   * ev : { p, race, pk, eff, entry, rank, status, pts, nopick, dns, bubble, win, podium, top10, tas }
   *  - bubble : le skieur compté fait 0 point (DNF, DNQ, DSQ, hors des points) ; un DNS n'en est pas une
   *  - tas : le skieur compté a été tiré au sort (le titulaire et le remplaçant n'ont pas pris le départ)
   */
  function events(state, G, res) {
    const out = [];
    const races = Object.keys(res || {}).map((id) => G.raceOf(id)).filter((r) => r && !r.cancelled && res[r.id])
      .sort((a, b) => G.raceStart(a) - G.raceStart(b) || a.id.localeCompare(b.id));
    state.players.forEach((p) => {
      races.forEach((race) => {
        const pk = (state.picks[p.id] || {})[race.id];
        if (!pk || !pk.a) { out.push({ p, race, nopick: true, bubble: false, win: false, podium: false, top10: false, pts: 0 }); return; }
        const eff = G.effectiveAthlete(pk, res, race.id), entry = (res[race.id] || []).find((x) => x.ath === eff);
        const dns = !!entry && entry.status === 'DNS';
        const rank = entry && !entry.status ? entry.rank : null;
        const pts = G.scoreRace(race, pk, res) || 0;
        out.push({
          p, race, pk, eff, entry, rank, status: entry ? entry.status || '' : '', pts, dns, nopick: false,
          bubble: !dns && !(rank && G.racePoints(race, rank) > 0),
          win: rank === 1, podium: !!rank && rank <= 3, top10: !!rank && rank <= 10,
          tas: !!pk.d && eff === pk.d && eff !== pk.a && eff !== pk.b,
        });
      });
    });
    out.sort((a, b) => G.raceStart(a.race) - G.raceStart(b.race) || a.race.id.localeCompare(b.race.id));
    return out;
  }

  const byPlayer = (evs) => { const m = {}; evs.forEach((e) => { (m[e.p.id] = m[e.p.id] || []).push(e); }); return m; };

  /** Plus longue série d'événements consécutifs vérifiant f (une course sans choix, un DNS non remplacé ou un échec casse la série). */
  function longest(list, f) {
    let best = 0, cur = 0;
    list.forEach((e) => { if (!e.nopick && f(e)) { cur++; if (cur > best) best = cur; } else cur = 0; });
    return best;
  }
  /** Événements de la plus longue série (la plus récente en cas d'égalité). */
  function longestRun(list, f) {
    let best = [], cur = [];
    list.forEach((e) => { if (!e.nopick && f(e)) { cur.push(e); if (cur.length >= best.length) best = cur.slice(); } else cur = []; });
    return best;
  }
  /** Série en cours à la dernière course. */
  function current(list, f) {
    let cur = 0; list.forEach((e) => { if (!e.nopick && f(e)) cur++; else cur = 0; }); return cur;
  }
  const STREAKS = [
    { id: 'win', label: 'Victoires consécutives', short: 'victoires', f: (e) => e.win },
    { id: 'podium', label: 'Podiums consécutifs', short: 'podiums', f: (e) => e.podium },
    { id: 'top10', label: 'Top 10 consécutifs', short: 'top 10', f: (e) => e.top10 },
    { id: 'bubble', label: 'Bulles consécutives', short: 'bulles', f: (e) => e.bubble },
  ];
  function streaks(evs) {
    const m = byPlayer(evs), out = {};
    Object.keys(m).forEach((pid) => { out[pid] = {}; STREAKS.forEach((s) => { out[pid][s.id] = { best: longest(m[pid], s.f), now: current(m[pid], s.f) }; }); });
    return out;
  }

  /** Classement avec ex æquo : rows triées par key (desc par défaut), ajoute .rank. */
  function rank(rows, key, asc) {
    rows.sort((a, b) => (asc ? key(a) - key(b) : key(b) - key(a)) || a.p.name.localeCompare(b.p.name, 'fr'));
    let last = null, rk = 0; rows.forEach((r, i) => { const k = key(r); if (k !== last) { rk = i + 1; last = k; } r.rank = rk; });
    return rows;
  }

  /** Cumul par joueur : victoires, podiums, top 10, bulles, tirages au sort, points, courses jouées. */
  function totals(state, evs) {
    const m = byPlayer(evs);
    return state.players.map((p) => {
      const l = (m[p.id] || []).filter((e) => !e.nopick);
      const tas = l.filter((e) => e.tas);
      return {
        p, n: l.length, pts: l.reduce((s, e) => s + e.pts, 0),
        wins: l.filter((e) => e.win).length, podiums: l.filter((e) => e.podium).length, top10: l.filter((e) => e.top10).length,
        bubbles: l.filter((e) => e.bubble).length, tas: tas.length, tasPts: tas.reduce((s, e) => s + e.pts, 0),
      };
    });
  }

  /** Rentabilité des skieurs choisis : points rapportés au joueur moins la moyenne des AUTRES joueurs ayant pris le même skieur
      (toutes courses confondues), cumulé sur le nombre de fois où il l'a pris. Les skieurs que personne d'autre n'a pris sont ignorés. */
  function worth(evs, pid) {
    const all = {};
    evs.filter((e) => !e.nopick).forEach((e) => { (all[e.eff] = all[e.eff] || []).push(e); });
    const out = [];
    Object.keys(all).forEach((ath) => {
      const mine = all[ath].filter((e) => e.p.id === pid), others = all[ath].filter((e) => e.p.id !== pid);
      if (!mine.length || !others.length) return;
      const avg = others.reduce((s, e) => s + e.pts, 0) / others.length;
      const pts = mine.reduce((s, e) => s + e.pts, 0);
      out.push({ ath, n: mine.length, pts, avg, diff: pts - avg * mine.length });
    });
    return out;
  }

  /** Skieurs qui rapportent le plus de points au joueur, tous desks confondus. */
  function providers(evs, pid) {
    const m = {};
    evs.filter((e) => !e.nopick && e.p.id === pid).forEach((e) => { const o = (m[e.eff] = m[e.eff] || { ath: e.eff, n: 0, pts: 0 }); o.n++; o.pts += e.pts; });
    return Object.values(m).sort((a, b) => b.pts - a.pts || b.n - a.n);
  }

  const api = { events, byPlayer, longest, longestRun, current, STREAKS, streaks, rank, totals, worth, providers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_STATS = api;
})(typeof window !== 'undefined' ? window : globalThis);
