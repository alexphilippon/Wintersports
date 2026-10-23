const assert = require('assert');
const G = require('../js/game.js'), D = require('../js/data.js'), R = require('../js/results.js'), A = require('../js/athletes.js');
const fx = require('./fixtures/solden-2025-w-gs.json');
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok', name); };

const out = R.buildRace(fx, A.W);
ok('66 partants = 30 classés + 11 DNF + 25 DNQ', () => { assert.strictEqual(out.start.length, 66); assert.strictEqual(out.entries.length, 66); assert.deepStrictEqual(out.warnings, []); });
ok('vainqueur et ex æquo (17e)', () => {
  const by = (id) => out.entries.find((e) => e.ath === id);
  assert.strictEqual(by('julia-scheib').rank, 1);
  assert.strictEqual(by('asja-zenere').rank, 17); assert.strictEqual(by('maryna-gasienica-daniel').rank, 17);
  assert.strictEqual(G.pointsForRank(17), 14);
});
ok('skieurs hors liste : identifiant stable', () => { assert.ok(out.unknown.includes('JANCOVA Rebeka')); assert.ok(out.entries.some((e) => e.ath === 'rebeka-jancova')); });
ok('DNS non confirmé : aucun résultat produit', () => {
  const r = R.buildRace(Object.assign({}, fx, { dns: [{ bib: 1, confirmed: false }], ranked: fx.ranked.split('\n').filter((l) => !/ STJERNESUND /.test(l)).join('\n') }), A.W);
  assert.strictEqual(r.entries.length, 0); assert.strictEqual(r.pendingDns.length, 1); assert.strictEqual(r.pendingDns[0].name, 'STJERNESUND Thea Louise');
});

/* Course de test : W01 (Sölden, GS dames) avec les résultats 2025 ; Stjernesund et Colturi sont déclarées DNS. */
const dnsFx = Object.assign({}, fx, {
  ranked: fx.ranked.split('\n').filter((l) => !/ (STJERNESUND|COLTURI) /.test(l)).join('\n'),
  dns: [{ bib: 1, confirmed: true }, { bib: 2, confirmed: true }],
});
const res = R.buildRace(dnsFx, A.W);
const results = { W01: res.entries };
const meta = { W01: { start: res.start, seed: res.seed } };
const pk = (a, b) => ({ W01: { a, b } });
const picks = {
  p1: pk('thea-louise-stjernesund', 'lara-colturi'),        // titulaire et remplaçante DNS : tirage
  p2: pk('thea-louise-stjernesund', 'julia-scheib'),        // remplaçante partante : elle joue
  p3: pk('thea-louise-stjernesund', null),                  // sans remplaçante : tirage
  p4: pk('mikaela-shiffrin', 'lara-colturi'),               // titulaire partante : rien
};
ok('ids des DNS résolus', () => { assert.ok(A.W.some((a) => a.id === 'thea-louise-stjernesund')); assert.ok(A.W.some((a) => a.id === 'lara-colturi')); });
const draws = G.autoDraws(results, meta, picks);
ok('tirages : seulement p1 et p3', () => { assert.deepStrictEqual(Object.keys(draws.W01).sort(), ['p1', 'p3']); });
ok('tirage reproductible et parmi les 30 premiers dossards', () => {
  assert.deepStrictEqual(G.autoDraws(results, meta, picks), draws);
  const first30 = res.start.slice(0, 30).map((x) => x.ath);
  Object.values(draws.W01).forEach((d) => { assert.ok(first30.includes(d.ath)); assert.ok(!['thea-louise-stjernesund', 'lara-colturi'].includes(d.ath)); assert.ok(d.n <= 28); });
});
ok('graine différente par joueur', () => { assert.notStrictEqual(draws.W01.p1.seed, draws.W01.p3.seed); });
ok('le skieur déjà grillé par le joueur est exclu', () => {
  const p = { p1: Object.assign({}, picks.p1) };
  const free = G.autoDraws(results, meta, p).W01.p1;
  const other = Object.assign({}, p.p1, {});
  // Shiffrin grillée sur une autre course du desk 1 (W03 = autre course dames du desk 1)
  const w = D.SESSIONS.filter((s) => s.desk === 1).flatMap((s) => s.races).map((id) => D.RACES[id]).find((r) => r.gender === 'W' && r.id !== 'W01');
  p.p1[w.id] = { a: free.ath };
  const again = G.autoDraws(results, meta, p).W01.p1;
  assert.ok(!again.candidates.includes(free.ath)); assert.notStrictEqual(again.ath, free.ath);
});
ok('points : le tiré marque, le remplaçant partant marque, DNS non grillé', () => {
  const race = G.raceOf('W01');
  const full = {}; Object.keys(picks).forEach((k) => { full[k] = { W01: Object.assign({}, picks[k].W01, draws.W01[k] ? { d: draws.W01[k].ath } : {}) }; });
  assert.strictEqual(G.effectiveAthlete(full.p2.W01, results, 'W01'), 'julia-scheib');
  assert.strictEqual(G.scoreRace(race, full.p2.W01, results), 100 * race.mult);
  assert.strictEqual(G.effectiveAthlete(full.p1.W01, results, 'W01'), draws.W01.p1.ath);
  assert.strictEqual(G.effectiveAthlete(full.p4.W01, results, 'W01'), 'mikaela-shiffrin');
  const used = G.usedInDesk(1, 'W', full.p1, 'zz', results);
  assert.ok(used.has(draws.W01.p1.ath)); assert.ok(!used.has('thea-louise-stjernesund')); assert.ok(!used.has('lara-colturi'));
  assert.ok(G.usedInDesk(1, 'W', full.p2, 'zz', results).has('julia-scheib'));
});
console.log(n + ' tests OK');
