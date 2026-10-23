const assert = require('assert');
const D = require('../js/data.js');
const G = require('../js/game.js');

// ---- Calendrier
assert.strictEqual(Object.values(D.RACES).filter((r) => r.kind !== 'mondial').length, 83, '83 courses CDM');
assert.strictEqual(Object.values(D.RACES).filter((r) => r.gender === 'M' && r.kind !== 'mondial').length, 43);
assert.strictEqual(Object.values(D.RACES).filter((r) => r.gender === 'W' && r.kind !== 'mondial').length, 40);
assert.strictEqual(D.SESSIONS.length, 21, '21 sessions');
const inSessions = D.SESSIONS.flatMap((s) => s.races);
assert.strictEqual(new Set(inSessions).size, 83, 'chaque course dans une seule session');
const perDesk = [1, 2, 3].map((d) => D.SESSIONS.filter((s) => s.desk === d).reduce((n, s) => n + s.races.length, 0));
assert.deepStrictEqual(perDesk, [30, 29, 24], 'desks 30/29/24');
assert.deepStrictEqual([1, 2, 3].map((d) => D.SESSIONS.filter((s) => s.desk === d).length), [8, 8, 5]);
// les sessions sont chronologiques et dans les bornes de leur desk
D.SESSIONS.forEach((s) => {
  const dk = D.DESKS[s.desk - 1];
  s.races.forEach((id) => assert.ok(D.RACES[id].date >= dk.from && D.RACES[id].date <= dk.to, id + ' hors desk'));
});
for (let i = 1; i < D.SESSIONS.length; i++) {
  const a = D.SESSIONS[i - 1].races.map((r) => D.RACES[r].date).sort()[0];
  const b = D.SESSIONS[i].races.map((r) => D.RACES[r].date).sort()[0];
  assert.ok(a < b, 'sessions chronologiques : ' + D.SESSIONS[i].name);
}
assert.strictEqual(Object.values(D.RACES).filter((r) => r.mult === 2).length, 8, '8 courses de finales ×2');
assert.strictEqual(Object.values(D.RACES).filter((r) => r.mult === 3).length, 8, '8 courses des Mondiaux ×3');

// ---- Barème
assert.strictEqual(G.pointsForRank(1), 100);
assert.strictEqual(G.pointsForRank(2), 80);
assert.strictEqual(G.pointsForRank(30), 1);
assert.strictEqual(G.pointsForRank(31), 0);
assert.strictEqual(D.POINTS.length, 30);

// ---- Points
const res = {
  M01: [{ ath: 'a', rank: 1 }, { ath: 'b', rank: 2 }, { ath: 'c', status: 'DNF' }, { ath: 'd', status: 'DNS' }],
  M40: [{ ath: 'a', rank: 1 }],
  XMSL: [{ ath: 'a', rank: 1 }],
};
assert.strictEqual(G.scoreRace(D.RACES.M01, { a: 'a' }, res), 100);
assert.strictEqual(G.scoreRace(D.RACES.M01, { a: 'b' }, res), 80);
assert.strictEqual(G.scoreRace(D.RACES.M01, { a: 'c' }, res), 0, 'DNF = 0');
assert.strictEqual(G.scoreRace(D.RACES.M01, { a: 'd', b: 'b' }, res), 80, 'DNS : le remplaçant joue');
assert.strictEqual(G.scoreRace(D.RACES.M01, { a: 'd' }, res), 0, 'DNS sans remplaçant');
assert.strictEqual(G.scoreRace(D.RACES.M01, { a: 'c', b: 'b' }, res), 0, 'DNF : pas de remplacement');
assert.strictEqual(G.scoreRace(D.RACES.M01, { a: 'zzz' }, res), 0, 'hors classement');
assert.strictEqual(G.scoreRace(D.RACES.M02, { a: 'a' }, res), null, 'pas de résultat');
assert.strictEqual(G.scoreRace(D.RACES.M40, { a: 'a' }, res), 200, 'finale ×2');
assert.strictEqual(G.scoreRace(D.RACES.XMSL, { a: 'a' }, res), 300, 'Mondiaux ×3');

// ---- Bonus des Mondiaux
const all = (g) => ['DH', 'SG', 'GS', 'SL'].map((d) => 'X' + g + d);
const wres = {};
D.WORLDS.races.forEach((id) => { wres[id] = [{ ath: 'w' + id, rank: 1 }]; });
const picksAll = {};
D.WORLDS.races.forEach((id) => { picksAll[id] = { a: 'w' + id }; });
assert.strictEqual(G.worldsBonus(picksAll, wres).total, 4 * 200 + 400 + 400, 'les 8 : 1600');
const picksM = {};
all('M').forEach((id) => { picksM[id] = { a: 'w' + id }; });
assert.strictEqual(G.worldsBonus(picksM, wres).total, 400, '4 hommes seuls : 400');
const picksPair = { XMDH: { a: 'wXMDH' }, XWDH: { a: 'wXWDH' }, XMSG: { a: 'wXMSG' } };
assert.strictEqual(G.worldsBonus(picksPair, wres).total, 200, 'une paire DH : 200');
assert.strictEqual(G.worldsBonus({}, wres).total, 0);
const picksAllF = {};
all('W').forEach((id) => { picksAllF[id] = { a: 'w' + id }; });
assert.strictEqual(G.worldsBonus(picksAllF, wres).total, 400, '4 dames seules : 400');
// total Mondiaux : 8 victoires ×300 + 1600
assert.strictEqual(G.worldsScore(picksAll, wres).total, 8 * 300 + 1600);

// ---- Contrainte « une fois par desk »
const picks = { M01: { a: 'a' }, M02: { a: 'b' }, M17: { a: 'a' }, W01: { a: 'x' } };
const used1 = G.usedInDesk(1, 'M', picks, 'M03');
assert.ok(used1.has('a') && used1.has('b') && used1.size === 2, 'desk 1 : a, b pris');
assert.ok(!G.usedInDesk(1, 'M', picks, 'M01').has('a'), 'on peut modifier sa propre course');
assert.ok(!G.usedInDesk(1, 'W', picks, null).has('a'), 'pools H et F séparés');
assert.ok(G.usedInDesk(2, 'M', picks, null).has('a'), 'M17 est dans le desk 2 : a y est repris légitimement');

const wp = { XMSG: { a: 'a' }, XMDH: { a: 'b' }, XWDH: { a: 'a' } };
assert.ok(G.usedInDesk(0, 'M', wp, 'XMGS').has('a') && G.usedInDesk(0, 'M', wp, 'XMGS').has('b'), 'Mondiaux : athlètes pris');
assert.ok(!G.usedInDesk(0, 'W', wp, null).has('b') && G.usedInDesk(0, 'W', wp, null).has('a'), 'Mondiaux : pool dames séparé');

// ---- Fuseau horaire (passage à l'heure d'hiver le 25/10/2026)
assert.strictEqual(G.parisInstant('2026-10-24', '10:00').toISOString(), '2026-10-24T08:00:00.000Z', 'CEST +2');
assert.strictEqual(G.parisInstant('2026-10-25', '10:00').toISOString(), '2026-10-25T09:00:00.000Z', 'CET +1');
assert.strictEqual(G.parisInstant('2027-02-04', '11:15').toISOString(), '2027-02-04T10:15:00.000Z');

// ---- États de session
const s1 = D.SESSIONS[0];
assert.strictEqual(G.sessionState(s1, new Date('2026-10-04T08:00:00Z')), 'ouverte');
assert.strictEqual(G.sessionState(s1, new Date('2026-10-24T09:00:00Z')), 'en cours');
assert.strictEqual(G.sessionState(s1, new Date('2026-10-27T09:00:00Z')), 'terminée');


// ---- Calendrier vivant : annulation, report, DNS, tirage
G.setOverrides({});
const sess = (id) => D.SESSIONS.find((x) => x.id === id);
const s4 = sess(4); // Copper Mountain (M04 28/11, M05 29/11) et Killington (W04 28/11, W05 29/11)
const dl4 = G.sessionDeadline(s4);

// annulation : plus de points, skieur libéré dans le desk
G.setOverrides({ M04: { status: 'cancelled' } });
assert.ok(G.raceOf('M04').cancelled);
assert.strictEqual(G.scoreRace(G.raceOf('M04'), { a: 'a' }, { M04: [{ ath: 'a', rank: 1 }] }), null, 'course annulée : rien à marquer');
assert.ok(!G.usedInDesk(1, 'M', { M04: { a: 'z' } }, null).has('z'), 'annulée : skieur libéré');
assert.ok(G.usedInDesk(1, 'M', { M05: { a: 'z' } }, null).has('z'), 'course maintenue : skieur pris');
assert.strictEqual(G.activeRaces(s4).length, s4.races.length - 1);

// report au lendemain : la course a sa propre deadline, la session garde la sienne
G.setOverrides({ W04: { date: '2026-11-30', time: '10:00', moved: true } });
const w04 = G.raceOf('W04');
assert.strictEqual(w04.date, '2026-11-30');
assert.strictEqual(G.raceLockTime(w04).toISOString(), G.parisInstant('2026-11-30', '10:00').toISOString(), 'verrou = nouveau départ');
assert.strictEqual(G.raceLockTime(G.raceOf('M05')).toISOString(), G.raceStart(G.raceOf('M04')).toISOString(), 'les autres courses se verrouillent au 1er départ restant de la session');
assert.ok(!G.raceLocked(w04, new Date('2026-11-29T20:00:00Z')), 'modifiable après la deadline de session');
assert.ok(G.raceLocked(G.raceOf('M05'), new Date('2026-11-28T11:00:00Z')), 'les autres courses sont verrouillées');
assert.ok(G.raceLocked(w04, new Date('2026-11-30T09:30:00Z')), 'verrouillée après le nouveau départ');
// report très tard : la session ne reste pas « en cours » des mois
G.setOverrides({ W04: { date: '2027-02-15', time: '10:00', moved: true } });
assert.strictEqual(G.sessionState(s4, new Date('2026-12-05T10:00:00Z')), 'terminée', 'un report lointain ne retient pas la session');
assert.strictEqual(G.raceOf('W04').date, '2027-02-15');
// heure confirmée seulement : change la deadline si c'est la 1re course
G.setOverrides({ M04: { time: '09:30' } });
assert.ok(G.raceOf('M04').timeKnown);
assert.ok(G.sessionDeadline(s4) <= G.parisInstant('2026-11-28', '09:30'));
G.setOverrides({});

// DNS : le remplaçant joue ; le titulaire DNS reste libre pour les autres courses, le remplaçant est pris
const r = { M04: [{ ath: 'a', status: 'DNS' }, { ath: 'b', rank: 2 }] };
assert.strictEqual(G.scoreRace(D.RACES.M04, { a: 'a', b: 'b' }, r), 80, 'remplaçant : 2e = 80 pts');
assert.strictEqual(G.scoreRace(D.RACES.M04, { a: 'a' }, r), 0, 'DNS sans remplaçant : 0 pt');
assert.strictEqual(G.effectiveAthlete({ a: 'a', d: 'c' }, { M04: [{ ath: 'a', status: 'DNS' }, { ath: 'c', rank: 1 }] }, 'M04'), 'c', 'tirage au sort');
const usedDns = G.usedInDesk(1, 'M', { M04: { a: 'a', b: 'b' } }, null, r);
assert.ok(usedDns.has('b') && !usedDns.has('a'), 'DNS : titulaire libéré, remplaçant grillé');
assert.ok(G.usedInDesk(1, 'M', { M04: { a: 'a', b: 'b' } }, null).has('a'), 'avant résultat : le titulaire compte');
assert.ok(G.usedInDesk(1, 'M', { M04: { a: 'a' } }, null, { M04: [{ ath: 'a', rank: 3 }] }).has('a'), 'a pris le départ : grillé');
assert.ok(G.usedInDesk(1, 'M', { M04: { a: 'a' } }, null, { M04: [{ ath: 'a', status: 'DNF' }] }).has('a'), 'DNF : grillé');

console.log('Tous les tests passent.');
