#!/usr/bin/env node
/* Ajoute une course à data/results.json à partir du texte des PDF FIS.
   Usage : node tools/results.js course.json [--out data/results.json]
   course.json : { race, fisRaceId, source, start1, ranked, dnfBibs, dnqBibs, dns:[{bib,confirmed}], dsq:[bib] }
   Refuse d'écrire tant qu'un DNS n'est pas confirmé (confirmed:true) : on le demande d'abord à l'organisateur. */
const fs = require('fs'), path = require('path');
const R = require('../js/results.js'), A = require('../js/athletes.js'), D = require('../js/data.js');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(__dirname, '..', 'data', 'results.json');
if (!file) { console.error('Usage : node tools/results.js course.json [--out fichier]'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const race = D.RACES[raw.race];
if (!race) { console.error('Course inconnue : ' + raw.race); process.exit(1); }
const r = R.buildRace(raw, A[race.gender]);
if (r.pendingDns.length) {
  console.error('DNS À CONFIRMER avant d’écrire le résultat :');
  r.pendingDns.forEach((d) => console.error(`  dossard ${d.bib} ${d.name}`));
  process.exit(2);
}
if (r.unknown.length) console.log('Skieurs absents de la liste du jeu (identifiant créé à partir du nom) :', r.unknown.join(', '));
r.warnings.forEach((w) => console.log('Attention :', w));
const db = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { races: {} };
db.races[raw.race] = { fisRaceId: raw.fisRaceId, source: raw.source, seed: r.seed, entries: r.entries, start: r.start };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(db));
console.log(`${raw.race} : ${r.entries.length} lignes, départ de ${r.start.length}, graine ${r.seed} -> ${out}`);
