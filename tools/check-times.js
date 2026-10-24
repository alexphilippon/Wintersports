#!/usr/bin/env node
/* Ski game – contrôle des horaires FIS avant la clôture d'une session.
   Usage : node tools/check-times.js [--write] [--hours 24]      (avec NODE_USE_ENV_PROXY=1 derrière le proxy)
   Lit la page « event details » FIS des courses qui partent dans les prochaines heures, compare l'heure de la 1re manche
   avec celle du jeu (data/data.js + data/time-overrides.json) et, avec --write, enregistre les écarts dans data/time-overrides.json
   (l'appli lit ce fichier toutes les minutes : la clôture suit sans republier le code). */
'use strict';
const fs = require('fs'), path = require('path');
const D = require('../js/data.js'), G = require('../js/game.js');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2), write = args.includes('--write'), hours = +(args[args.indexOf('--hours') + 1] || 24);
const fis = JSON.parse(fs.readFileSync(path.join(root, 'data', 'fis-races.json'), 'utf8'));
const ovF = path.join(root, 'data', 'time-overrides.json');
const ov = fs.existsSync(ovF) ? JSON.parse(fs.readFileSync(ovF, 'utf8')) : { races: {} };
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, Oct: 10, Nov: 11, Dec: 12 };
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const flat = (h) => decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '|')).replace(/[\s|]*\|[\s|]*/g, '|');
const now = new Date();
const mine = Object.values(D.RACES).filter((r) => fis[r.id] && !r.cancelled && G.raceStart(r) > now && G.raceStart(r) - now < hours * 3600e3 * 4);
const events = [...new Set(mine.map((r) => fis[r.id].eventid))];
(async () => {
  const diffs = [];
  for (const ev of events) {
    const html = await fetch(`https://www.fis-ski.com/DB/general/event-details.html?sectorcode=AL&eventid=${ev}&seasoncode=2027`).then((r) => r.text());
    const t = flat(html), rows = {};
    for (const m of t.matchAll(/\|(\d{1,2}) ([A-Z][a-z]{2})\|(\d\d:\d\d)\|(\d{4})\|/g)) rows[m[4]] = { day: +m[1], mo: MON[m[2]], time: m[3] };
    mine.filter((r) => String(fis[r.id].eventid) === String(ev)).forEach((r) => {
      const f = rows[fis[r.id].codex]; if (!f) return;
      const [, mo, day] = r.date.split('-').map(Number);
      const cur = (ov.races[r.id] && ov.races[r.id].time) || r.time;
      if (f.day !== day || f.mo !== mo) diffs.push({ id: r.id, why: `date FIS ${f.day}/${f.mo} ≠ ${day}/${mo} (à traiter à la main)` });
      else if (f.time !== cur) diffs.push({ id: r.id, from: cur, to: f.time });
    });
  }
  if (!diffs.length) { console.log(`Horaires conformes (${mine.length} courses vérifiées sur ${events.length} événement(s)).`); return; }
  diffs.forEach((d) => console.log(d.why ? `${d.id} : ${d.why}` : `${d.id} : ${d.from} → ${d.to}`));
  if (write) {
    diffs.filter((d) => d.to).forEach((d) => { ov.races[d.id] = { time: d.to, fetched: new Date().toISOString() }; });
    fs.writeFileSync(ovF, JSON.stringify(ov, null, 1)); console.log('data/time-overrides.json mis à jour.');
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
