#!/usr/bin/env node
/* Ski game – skieurs d'une start list absents de la liste du jeu (js/athletes.js, classement 2025-26).
   Usage : node tools/add-missing.js W01
   Les ajoute à data/extra-athletes.json, lu par le site en plus de js/athletes.js (qui reste généré par build-athletes.js).
   N'écrase jamais une entrée déjà présente. */
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('../js/fis-import.js');
const BASE = require('../js/athletes.js');

const ACCENTS = { 'VLHOVA Petra': 'Petra Vlhová' }; // le nom FIS est sans accents ; à compléter si besoin
const key = (s) => F.slug(String(s)).split('-').filter(Boolean).sort().join('-');

const id = process.argv[2];
if (!id || !/^[MW]\d+$/.test(id)) { console.error('Usage : node tools/add-missing.js W01'); process.exit(1); }
const g = id[0];
const root = path.join(__dirname, '..');
const sl = JSON.parse(fs.readFileSync(path.join(root, 'data', 'startlists.json'), 'utf8')).races[id];
if (!sl) { console.error('Pas de start list pour ' + id + ' : lancer d\'abord tools/startlist.js'); process.exit(1); }
const file = path.join(root, 'data', 'extra-athletes.json');
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { M: [], W: [] };
const have = new Set([...BASE[g], ...db[g]].map((a) => key(a.fis || a.name)));
const added = [];
sl.start.forEach((r) => {
  if (have.has(key(r.name))) return;
  const a = { id: F.idOf(r.name), name: ACCENTS[r.name] || F.displayName(r.name), fis: r.name, nat: r.nat, rank: null, code: r.code, from: id };
  db[g].push(a); have.add(key(r.name)); added.push(a);
});
fs.writeFileSync(file, JSON.stringify(db, null, 1).replace(/\{\s*"id"[^{}]*\}/g, (m) => JSON.stringify(JSON.parse(m)).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }')) + '\n');
console.log(added.length + ' ajouté(s) :\n' + added.map((a) => `${a.id} | ${a.name} | ${a.nat}`).join('\n'));
