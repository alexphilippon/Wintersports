#!/usr/bin/env node
/* Rapproche le calendrier FIS (tools/fis-races.txt : eventid|raceid|jour|discipline|genre|codex) des courses du jeu.
   Écrit data/fis-races.json { "M01": { raceid, eventid, codex } } et signale les écarts de calendrier. */
const fs = require('fs'), path = require('path');
const D = require('../js/data.js');
const MON = { Jan: 1, Feb: 2, Mar: 3, Oct: 10, Nov: 11, Dec: 12 };
const DISC = { 'Giant Slalom': 'GS', Slalom: 'SL', 'Super G': 'SG', Downhill: 'DH' };
const fis = fs.readFileSync(path.join(__dirname, 'fis-races.txt'), 'utf8').trim().split('\n').map((l) => {
  const [eventid, raceid, day, disc, gender, codex] = l.split('|'); const [d, m] = day.split(' ');
  const mo = MON[m]; return { eventid, raceid, gender, codex, disc: DISC[disc], date: `${mo >= 10 ? 2026 : 2027}-${String(mo).padStart(2, '0')}-${d.padStart(2, '0')}` };
}).filter((r) => r.disc);                       // les entraînements (Downhill Training) ne comptent pas
const ours = Object.values(D.RACES).filter((r) => r.kind !== 'worlds' && !/^X/.test(r.id));
const key = (r) => `${r.gender}|${r.date}|${r.disc}`;
const byKey = {}; fis.forEach((r) => { (byKey[key(r)] = byKey[key(r)] || []).push(r); });
const map = {}, onlyOurs = [], used = new Set();
ours.forEach((r) => { const f = (byKey[key(r)] || [])[0]; if (f) { map[r.id] = { raceid: +f.raceid, eventid: +f.eventid, codex: f.codex }; used.add(f.raceid); } else onlyOurs.push(r); });
const onlyFis = fis.filter((r) => !used.has(r.raceid));
fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'fis-races.json'), JSON.stringify(map, null, 0));
console.log(`${Object.keys(map).length} courses rapprochées sur ${ours.length} (calendrier FIS : ${fis.length} courses hors entraînements)`);
console.log('Dans notre calendrier mais pas chez FIS :', onlyOurs.map((r) => `${r.id} ${r.place} ${r.date} ${r.disc}`));
console.log('Chez FIS mais pas dans notre calendrier :', onlyFis.map((r) => `${r.gender} ${r.date} ${r.disc} (raceid ${r.raceid})`));
