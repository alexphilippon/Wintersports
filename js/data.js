/* Ski game – calendrier Coupe du monde 2026-2027
   Source : Wikipédia FR (version du 12/09/2026) + programme officiel des Mondiaux de Crans-Montana.
   Les épreuves par équipes sont exclues. Heures de départ : provisoires (à confirmer). */
(function (root) {
  'use strict';

  const DISC = {
    DH: { fr: 'Descente', short: 'DH' },
    SG: { fr: 'Super-G', short: 'SG' },
    GS: { fr: 'Géant', short: 'GS' },
    SL: { fr: 'Slalom', short: 'SL' },
  };

  // Format : genre|n°|lieu|date|discipline[|variante]
  const RAW = `
M|1|Sölden|2026-10-25|GS
M|2|Levi|2026-11-15|SL
M|3|Gurgl|2026-11-22|SL
M|4|Copper Mountain|2026-11-28|SG
M|5|Copper Mountain|2026-11-29|GS
M|6|Beaver Creek|2026-12-03|DH|1
M|7|Beaver Creek|2026-12-04|DH|2
M|8|Beaver Creek|2026-12-05|SG
M|9|Beaver Creek|2026-12-06|GS
M|10|Val d'Isère|2026-12-12|GS
M|11|Val d'Isère|2026-12-13|SL
M|12|Val Gardena|2026-12-18|SG
M|13|Val Gardena|2026-12-19|DH
M|14|Alta Badia|2026-12-20|GS
M|15|Alta Badia|2026-12-21|SL
M|16|Madonna di Campiglio|2026-12-23|SL
M|17|Bormio|2026-12-28|DH
M|18|Bormio|2026-12-29|SG
M|19|Kranjska Gora|2027-01-02|GS
M|20|Kranjska Gora|2027-01-03|SL
M|21|Adelboden|2027-01-09|GS
M|22|Adelboden|2027-01-10|SL
M|23|Wengen|2027-01-15|SG
M|24|Wengen|2027-01-16|DH
M|25|Wengen|2027-01-17|SL
M|26|Kitzbühel|2027-01-22|SG
M|27|Kitzbühel|2027-01-23|DH
M|28|Kitzbühel|2027-01-24|SL
M|29|Schladming|2027-01-26|GS
M|30|Schladming|2027-01-27|SL
M|31|Chamonix|2027-01-30|SL
M|32|Garmisch-Partenkirchen|2027-02-20|DH
M|33|Garmisch-Partenkirchen|2027-02-21|SG
M|34|Saalbach|2027-02-27|DH
M|35|Saalbach|2027-02-28|SG
M|36|Kvitfjell|2027-03-06|DH
M|37|Kvitfjell|2027-03-07|SG
M|38|Åre|2027-03-13|GS
M|39|Åre|2027-03-14|SL
M|40|Sun Valley|2027-03-20|DH
M|41|Sun Valley|2027-03-21|SG
M|42|Sun Valley|2027-03-24|GS
M|43|Sun Valley|2027-03-25|SL
W|1|Sölden|2026-10-24|GS
W|2|Levi|2026-11-14|SL
W|3|Gurgl|2026-11-21|SL
W|4|Killington|2026-11-28|GS
W|5|Killington|2026-11-29|SL
W|6|Tremblant|2026-12-05|GS
W|7|Tremblant|2026-12-06|GS
W|8|Beaver Creek|2026-12-11|DH|1
W|9|Beaver Creek|2026-12-12|DH|2
W|10|Beaver Creek|2026-12-13|SG
W|11|Saint-Moritz|2026-12-18|SG|1
W|12|Saint-Moritz|2026-12-19|SG|2
W|13|Saint-Moritz|2026-12-20|GS
W|14|Courchevel|2026-12-22|SL
W|15|Gosau|2026-12-28|GS
W|16|Gosau|2026-12-29|SL
W|17|Flachau|2027-01-04|GS
W|18|Flachau|2027-01-05|SL
W|19|Val di Fassa|2027-01-09|DH
W|20|Val di Fassa|2027-01-10|SG
W|21|Cortina d'Ampezzo|2027-01-15|DH|1
W|22|Cortina d'Ampezzo|2027-01-16|DH|2
W|23|Cortina d'Ampezzo|2027-01-17|SG
W|24|Kronplatz|2027-01-19|GS
W|25|Jasná|2027-01-23|GS
W|26|Jasná|2027-01-24|SL
W|27|Kranjska Gora|2027-01-29|GS
W|28|Kranjska Gora|2027-01-30|SL
W|29|Lenzerheide|2027-02-20|SG|1
W|30|Lenzerheide|2027-02-21|SG|2
W|31|Garmisch-Partenkirchen|2027-02-27|DH|1
W|32|Garmisch-Partenkirchen|2027-02-28|DH|2
W|33|Soldeu|2027-03-06|GS
W|34|Soldeu|2027-03-07|SL
W|37|Sun Valley|2027-03-20|DH
W|38|Sun Valley|2027-03-21|SG
W|39|Sun Valley|2027-03-23|GS
W|40|Sun Valley|2027-03-25|SL
`;

  const pad = (n) => String(n).padStart(2, '0');
  const FINALS = new Set(['M40', 'M41', 'M42', 'M43', 'W37', 'W38', 'W39', 'W40']);

  // Heure de départ de la 1re manche, provisoire (heure de Paris).
  const DEFAULT_TIME = { DH: '11:30', SG: '11:30', GS: '10:00', SL: '10:00' };

  const RACES = {};
  RAW.trim().split('\n').forEach((line) => {
    const [g, n, place, date, disc, sub] = line.split('|');
    const id = g + pad(n);
    RACES[id] = {
      id, gender: g, n: Number(n), place, date, disc, sub: sub || '',
      time: DEFAULT_TIME[disc], timeKnown: false,
      mult: FINALS.has(id) ? 2 : 1,
      kind: FINALS.has(id) ? 'finale' : 'cdm',
    };
  });

  // Heures confirmées (source : programme publié, 22/10/2026). Les autres restent provisoires jusqu'à confirmation par l'admin.
  ['W01', 'M01'].forEach((id) => { RACES[id].timeKnown = true; });

  // Mondiaux de Crans-Montana (1er-14 février 2027), épreuves individuelles seulement. Barème ×3.
  const WORLDS_RAW = [
    ['W', 'SG', '2027-02-04', '11:15'],
    ['M', 'SG', '2027-02-05', '11:15'],
    ['W', 'DH', '2027-02-06', '11:15'],
    ['M', 'DH', '2027-02-07', '11:15'],
    ['W', 'GS', '2027-02-11', '10:00'],
    ['M', 'GS', '2027-02-12', '10:00'],
    ['W', 'SL', '2027-02-13', '10:00'],
    ['M', 'SL', '2027-02-14', '10:00'],
  ];
  WORLDS_RAW.forEach(([g, disc, date, time]) => {
    const id = 'X' + g + disc;
    RACES[id] = {
      id, gender: g, n: 0, place: 'Crans-Montana', date, disc, sub: '',
      time, timeKnown: true, mult: 3, kind: 'mondial',
    };
  });

  const ids = (g, from, to) => {
    const out = [];
    for (let i = from; i <= to; i++) out.push(g + pad(i));
    return out;
  };
  const mix = (m, w) => [...ids('M', m[0], m[1]), ...(w ? ids('W', w[0], w[1]) : [])];

  // 21 sessions de Coupe du monde. Une session = une deadline (départ de sa 1re course).
  const SESSIONS = [
    { id: 1,  desk: 1, name: 'Sölden',                          races: mix([1, 1], [1, 1]) },
    { id: 2,  desk: 1, name: 'Levi',                            races: mix([2, 2], [2, 2]) },
    { id: 3,  desk: 1, name: 'Gurgl',                           races: mix([3, 3], [3, 3]) },
    { id: 4,  desk: 1, name: 'Copper Mountain et Killington',   races: mix([4, 5], [4, 5]) },
    { id: 5,  desk: 1, name: 'Beaver Creek et Tremblant',       races: mix([6, 9], [6, 7]) },
    { id: 6,  desk: 1, name: 'Beaver Creek et Val d’Isère', races: mix([10, 11], [8, 10]) },
    { id: 7,  desk: 1, name: 'Val Gardena, Saint-Moritz et Alta Badia', races: mix([12, 14], [11, 13]) },
    { id: 8,  desk: 1, name: 'Alta Badia, Courchevel et Madonna',         races: ['M15', 'W14', 'M16'] },
    { id: 9,  desk: 2, name: 'Bormio et Gosau',                 races: mix([17, 18], [15, 16]) },
    { id: 10, desk: 2, name: 'Kranjska Gora et Flachau',        races: ['M19', 'M20', 'W17', 'W18'] },
    { id: 11, desk: 2, name: 'Adelboden et Val di Fassa',                    races: mix([21, 22], [19, 20]) },
    { id: 12, desk: 2, name: 'Wengen et Cortina',               races: mix([23, 25], [21, 23]) },
    { id: 13, desk: 2, name: 'Kronplatz',                       races: ['W24'] },
    { id: 14, desk: 2, name: 'Kitzbühel et Jasná',              races: mix([26, 28], [25, 26]) },
    { id: 15, desk: 2, name: 'Schladming',                      races: mix([29, 30], null) },
    { id: 16, desk: 2, name: 'Chamonix et Kranjska Gora',       races: ['W27', 'W28', 'M31'] },
    { id: 17, desk: 3, name: 'Garmisch et Lenzerheide',         races: mix([32, 33], [29, 30]) },
    { id: 18, desk: 3, name: 'Saalbach et Garmisch',            races: mix([34, 35], [31, 32]) },
    { id: 19, desk: 3, name: 'Kvitfjell et Soldeu',             races: mix([36, 37], [33, 34]) },
    { id: 20, desk: 3, name: 'Åre',                             races: mix([38, 39]) },
    { id: 21, desk: 3, name: 'Finales de Sun Valley',           races: mix([40, 43], [37, 40]) },
  ];

  const WORLDS = {
    id: 'X', desk: 0, name: 'Championnats du monde de Crans-Montana',
    races: ['XWSG', 'XMSG', 'XWDH', 'XMDH', 'XWGS', 'XMGS', 'XWSL', 'XMSL'],
  };

  const DESKS = [
    { id: 1, name: 'Desk 1', from: '2026-10-24', to: '2026-12-23' },
    { id: 2, name: 'Desk 2', from: '2026-12-28', to: '2027-01-31' },
    { id: 3, name: 'Desk 3', from: '2027-02-20', to: '2027-03-25' },
  ];

  // Barème CDM : 100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15 … 1 (30 places).
  const POINTS = [100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16,
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  const api = { DISC, RACES, SESSIONS, WORLDS, DESKS, POINTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SKI_DATA = api;
})(typeof window !== 'undefined' ? window : globalThis);
