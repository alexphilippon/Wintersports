#!/usr/bin/env node
/* Ski game – suivi en direct d'une course à deux manches (page FIS « Results »).
   Usage : node tools/live.js W01 [page.html]       (sans fichier : télécharge la page)
   Écrit data/live.json : classement après la 1re manche, horaires des manches, qualifiés (30 premiers) et éliminés.
   Ne touche jamais à data/results.json (résultat officiel, saisi après confirmation des DNS). */
'use strict';
const fs = require('fs'), path = require('path');
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m));
const tokens = (html) => decode(String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n')).split('\n').map((x) => x.trim()).filter((x) => x && x !== '-->');

function parseLive(html) {
  const tok = tokens(html), flat = '|' + tok.join('|');
  const runs = {}; const m = flat.match(/1st Run:\|(\d\d:\d\d)\|[A-Z]+(?:\|2nd Run:\|(\d\d:\d\d))?/);
  if (m) { runs.run1 = m[1]; if (m[2]) runs.run2 = m[2]; }
  const status = (flat.match(/\|2nd Run:\|[\d:]+\|[A-Z]+\|-->?\|?([A-Za-z ]*)/) || [])[1] || '';
  const head = tok.indexOf('Athlete');
  const rows = [], out = [];
  if (head >= 0) {
    // classement : rang, dossard, code FIS, NOM Prénom, [année, nation], temps…  (les non-classés suivent un intitulé « Did not … »)
    let k = head, label = '';
    const num = (x) => /^\d+$/.test(x || '');
    while (k < tok.length) {
      const t = tok[k];
      if (/^Did not|^Disqualified/.test(t)) { label = /start/.test(t) ? 'DNS' : /qualify/.test(t) ? 'DNQ' : /^Disq/.test(t) ? 'DSQ' : 'DNF'; k++; continue; }
      if (!label && num(t) && num(tok[k + 1]) && num(tok[k + 2]) && /[A-Za-z]/.test(tok[k + 3] || '')) { let j = k + 4; while (j < tok.length && !(/^[A-Z]{3}$/.test(tok[j]) && /^\d{4}$/.test(tok[j - 1] || ''))) j++;
        const tm = /^\d+:\d\d\.\d\d$|^\d+\.\d\d$/.test(tok[j + 1] || '') ? tok[j + 1] : '';
        rows.push({ rank: +t, bib: +tok[k + 1], code: tok[k + 2], name: tok[k + 3], time: tm }); k += 4; continue; }
      if (label && num(t) && num(tok[k + 1]) && /[A-Za-z]/.test(tok[k + 2] || '')) { out.push({ status: label, bib: +t, code: tok[k + 1], name: tok[k + 2] }); k += 3; continue; }
      if (label && num(t) && /[A-Za-z]/.test(tok[k + 1] || '') && !num(tok[k + 1])) { k++; continue; }
      k++;
    }
  }
  const title = (String(html).match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const isStart = /Start List/i.test(title);       // page encore en « Start List » : pas de classement
  return { runs, status, hasResults: !isStart && rows.length > 0, rows: isStart ? [] : rows, out: isStart ? [] : out, isStart };
}
module.exports = { parseLive };

if (require.main === module) {
  const [id, file] = process.argv.slice(2);
  if (!id) { console.error('Usage : node tools/live.js W01 [page.html]'); process.exit(1); }
  const root = path.join(__dirname, '..'), races = JSON.parse(fs.readFileSync(path.join(root, 'data', 'fis-races.json'), 'utf8'));
  if (!races[id]) { console.error('Course inconnue : ' + id); process.exit(1); }
  const url = `https://www.fis-ski.com/DB/general/results.html?sectorcode=AL&raceid=${races[id].raceid}`;
  (file ? Promise.resolve(fs.readFileSync(file, 'utf8')) : fetch(url).then((r) => { if (!r.ok) throw new Error('FIS : HTTP ' + r.status); return r.text(); })).then((html) => {
    const p = parseLive(html), f = path.join(root, 'data', 'live.json');
    const db = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { races: {} };
    if (!p.hasResults && db.races[id] && db.races[id].hasResults) { console.log(id + ' : la page FIS est repassée en start list (2e manche) ; classement de la 1re manche conservé.'); return; }
    db.races[id] = { raceid: races[id].raceid, source: url, fetched: new Date().toISOString(), run1: p.runs.run1 || null, run2: p.runs.run2 || null, run2status: p.status || '', hasResults: p.hasResults, seed1: (p.rows.find((r) => r.rank === 1) || {}).time || '', qualify: 30, rows: p.rows, out: p.out };
    fs.writeFileSync(f, JSON.stringify(db));
    console.log(`${id} : ${p.hasResults ? p.rows.length + ' classés, ' + p.out.length + ' non classés' : 'pas encore de classement'} · manche 1 ${p.runs.run1 || '?'} · manche 2 ${p.runs.run2 || '?'} ${p.status}`);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
