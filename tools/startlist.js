#!/usr/bin/env node
/* Ski game – start list d'une course, lue sur la page FIS « Start List » (HTML).
   Usage : node tools/startlist.js W01 [page.html]
   Sans fichier, la page est téléchargée (raceid lu dans data/fis-races.json).
   Écrit data/startlists.json (une entrée par course ; ne touche jamais à data/results.json).
   Avec Node 22 derrière un proxy : NODE_USE_ENV_PROXY=1 node tools/startlist.js W01 */
'use strict';
const fs = require('fs');
const path = require('path');

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
  return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
});

/** Lignes du tableau : ordre, dossard, code FIS, nom (« NOM Prénom »), ski, année, nation. */
function parseStartList(html) {
  const text = decode(String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n'));
  const tok = text.split('\n').map((x) => x.trim()).filter((x) => x && x !== '-->');
  const head = tok.indexOf('Athlete');
  if (head < 0) throw new Error('Tableau de départ introuvable (colonne « Athlete »).');
  let k = head;
  while (k < tok.length && !/^\d+$/.test(tok[k])) k++;
  const rows = [];
  while (k + 3 < tok.length && /^\d+$/.test(tok[k]) && /^\d+$/.test(tok[k + 1]) && /^\d+$/.test(tok[k + 2])) {
    const bib = +tok[k + 1], code = tok[k + 2], name = tok[k + 3];
    let j = k + 4;
    while (j < tok.length && !(/^[A-Z]{3}$/.test(tok[j]) && /^\d{4}$/.test(tok[j - 1] || ''))) {
      if (/^\d+$/.test(tok[j]) && /^\d+$/.test(tok[j + 1] || '') && /^\d+$/.test(tok[j + 2] || '')) break; // ligne suivante sans nation
      j++;
    }
    const nat = /^[A-Z]{3}$/.test(tok[j] || '') ? tok[j] : '';
    rows.push({ bib, code, name, nat });
    k = j + 1;
  }
  if (!rows.length) throw new Error('Aucun partant lu.');
  const bibs = rows.map((r) => r.bib);
  if (new Set(bibs).size !== bibs.length) throw new Error('Dossards en double.');
  return rows;
}

function main() {
  const [id, file] = process.argv.slice(2);
  if (!id) { console.error('Usage : node tools/startlist.js W01 [page.html]'); process.exit(1); }
  const root = path.join(__dirname, '..');
  const races = JSON.parse(fs.readFileSync(path.join(root, 'data', 'fis-races.json'), 'utf8'));
  if (!races[id]) { console.error('Course inconnue dans data/fis-races.json : ' + id); process.exit(1); }
  const url = `https://www.fis-ski.com/DB/general/results.html?sectorcode=AL&raceid=${races[id].raceid}`;
  const get = file
    ? Promise.resolve({ html: fs.readFileSync(file, 'utf8'), at: fs.statSync(file).mtime })
    : fetch(url).then((r) => { if (!r.ok) throw new Error('FIS : HTTP ' + r.status); return r.text(); }).then((html) => ({ html, at: new Date() }));
  get.then(({ html, at }) => {
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const start = parseStartList(html);
    const out = path.join(root, 'data', 'startlists.json');
    const db = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { races: {} };
    db.races[id] = { raceid: races[id].raceid, run: 1, source: url, title: decode(title).trim(), fetched: at.toISOString(), start };
    fs.writeFileSync(out, JSON.stringify(db, null, 1).replace(/\{\s*"bib": (\d+),\s*"code": ("[^"]*"),\s*"name": ("[^"]*"),\s*"nat": ("[^"]*")\s*\}/g, '{ "bib": $1, "code": $2, "name": $3, "nat": $4 }') + '\n');
    console.log(`${id} : ${start.length} partants (dossards ${Math.min(...start.map((r) => r.bib))} à ${Math.max(...start.map((r) => r.bib))}) – ${db.races[id].title}`);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

if (require.main === module) main();
module.exports = { parseStartList };
