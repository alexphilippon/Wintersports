/* Ski game – lecture des résultats officiels FIS (texte des PDF : départ manche 1, classement, DNF/DNQ/DNS/DSQ).
   Fonctions pures, utilisables sous Node (outil tools/results.js) et dans le navigateur. */
(function (root) {
  'use strict';
  const F = typeof module !== 'undefined' && module.exports ? require('./fis-import.js') : root.SKI_FIS;
  const norm = (s) => F.slug(String(s).replace(/\./g, ' '));

  /** Lignes « dossard code FIS NOM Prénom » (départ) ou « rang dossard code NOM Prénom temps » (classement). */
  function startRows(text) {
    return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d+)\s+(\d+)\s+(.+)$/); if (!m) throw new Error('Ligne de départ illisible : ' + l);
      return { bib: +m[1], code: m[2], name: m[3].trim() };
    });
  }
  function rankRows(text) {
    return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s+(\d+:\d{2}\.\d{2}|\d{2}\.\d{2})$/); if (!m) throw new Error('Ligne de classement illisible : ' + l);
      return { rank: +m[1], bib: +m[2], code: m[3], name: m[4].trim(), time: m[5] };
    });
  }

  /**
   * raw : { race, start1, ranked, dnfBibs, dnqBibs, dns:[{bib,confirmed}], dsq:[bib] }
   * athletes : liste des skieurs du genre de la course (avec .fis et .id).
   * Retourne { race, entries, start, seed, warnings, pendingDns }.
   * Refuse de produire un résultat tant qu'un DNS n'est pas confirmé (pendingDns non vide).
   */
  function buildRace(raw, athletes) {
    const byName = {}; athletes.forEach((a) => { byName[norm(a.fis)] = a.id; });
    const warnings = [], unknown = [];
    const resolve = (name) => { const id = byName[norm(name)]; if (id) return id; unknown.push(name); return F.idOf(name.replace(/\./g, ' ')); };
    const start = startRows(raw.start1), ranked = rankRows(raw.ranked);
    const bibName = {}; start.forEach((r) => { bibName[r.bib] = r; });
    if (new Set(start.map((r) => r.bib)).size !== start.length) throw new Error('Dossards en double dans le départ.');
    const idOfBib = {}; start.forEach((r) => { idOfBib[r.bib] = resolve(r.name); });

    const dns = (raw.dns || []).map((d) => (typeof d === 'number' ? { bib: d, confirmed: false } : d));
    const pendingDns = dns.filter((d) => !d.confirmed).map((d) => ({ bib: d.bib, name: bibName[d.bib] ? bibName[d.bib].name : '?' }));

    const entries = [];
    let prev = 0;
    ranked.forEach((r) => {
      const s = bibName[r.bib];
      if (!s) throw new Error(`Dossard ${r.bib} (${r.name}) absent du départ.`);
      if (s.code !== r.code) warnings.push(`Dossard ${r.bib} : code FIS ${r.code} au classement, ${s.code} au départ.`);
      if (r.rank < prev) throw new Error(`Rangs non croissants à ${r.name}.`);
      prev = r.rank;
      entries.push({ ath: idOfBib[r.bib], rank: r.rank, bib: r.bib });
    });
    const add = (bibs, status) => (bibs || []).forEach((b) => {
      if (!bibName[b]) throw new Error(`Dossard ${b} (${status}) absent du départ.`);
      entries.push({ ath: idOfBib[b], status, bib: b });
    });
    add(raw.dnfBibs, 'DNF'); add(raw.dnqBibs, 'DNQ'); add(raw.dsq, 'DSQ');
    add(dns.filter((d) => d.confirmed).map((d) => d.bib), 'DNS');

    const seen = new Set(entries.map((e) => e.bib));
    const missing = start.filter((r) => !seen.has(r.bib) && !pendingDns.some((d) => d.bib === r.bib));
    if (missing.length) warnings.push(`${missing.length} partant(s) du départ sans résultat : ${missing.map((r) => r.name).join(', ')}.`);
    if (seen.size !== entries.length) throw new Error('Un même dossard apparaît dans plusieurs listes.');
    const seed = ranked.length ? ranked[0].time : '';
    return {
      race: raw.race, entries: pendingDns.length ? [] : entries,
      start: start.map((r) => ({ bib: r.bib, ath: idOfBib[r.bib] })), seed,
      warnings, unknown: [...new Set(unknown)], pendingDns,
    };
  }
  const api = { startRows, rankRows, buildRace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SKI_RESULTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
