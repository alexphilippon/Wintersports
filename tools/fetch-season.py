#!/usr/bin/env python3
"""Télécharge les résultats d'une saison de Coupe du monde (pages www.fis-ski.com) -> data/season-<an>.json
   Usage : python3 tools/fetch-season.py 2026   (2026 = saison 2025-26)"""
import re, sys, json, time, subprocess, os
season = sys.argv[1] if len(sys.argv) > 1 else '2026'
H = 'https://www.fis-ski.com/DB/'
def get(u):
    for _ in range(3):
        r = subprocess.run(['curl', '-sS', '-m', '40', u], capture_output=True, text=True)
        if r.stdout: return r.stdout
        time.sleep(2)
    return ''
def flat(s):
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    t = re.sub(r'<[^>]+>', '|', t); t = t.replace('&nbsp;', ' ').replace('&amp;', '&')
    return re.sub(r'[\s|]*\|[\s|]*', '|', t)
cal = get(H + f'alpine-skiing/calendar-results.html?sectorcode=AL&seasoncode={season}&categorycode=WC')
events = sorted(set(re.findall(r'eventid=(\d+)', cal)), key=int)
DISC = {'Giant Slalom': 'GS', 'Slalom': 'SL', 'Super G': 'SG', 'Downhill': 'DH'}
MON = {m: i + 1 for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}
races, ath = [], {}
for ev in events:
    s = get(H + f'general/event-details.html?sectorcode=AL&eventid={ev}&seasoncode={season}')
    ids = re.findall(r'results\.html\?sectorcode=AL&raceid=(\d+)', s)
    for rid in dict.fromkeys(ids):
        p = flat(get(H + f'general/results.html?sectorcode=AL&raceid={rid}'))
        m = re.search(r"Results - ([^|]+?) \((\w+)\) \d{4}/\d{4}\|", p) or re.search(r'Soelden|', p)
        t = re.search(r'Event details\|([^|]+)\|[^|]+\|(Men|Women)\'s ([^|]+)\|([A-Za-z]+) (\d+), (\d{4})\|', p)
        if not t: print('?', rid); continue
        place, g, d, mo, dd, yy = t.groups(); disc = DISC.get(d.strip())
        if not disc: continue
        date = f'{yy}-{MON[mo[:3]]:02d}-{int(dd):02d}'
        i = p.find('Cup Points|'); body = p[i + 11:] if i > 0 else ''
        res, seen = [], set()
        # classés : rang|dossard|code|NOM|-->|-->|année|NAT
        parts = re.split(r'\|(Did not [^|]+|Disqualified[^|]*)\|', body)
        ms = list(re.finditer(r'(?:^|\|)(\d+)\|(\d+)\|(\d+)\|([^|]+)\|-->\|-->\|(\d{4})\|([A-Z]{3})\|', parts[0]))
        for n2, m2 in enumerate(ms):
            rk, bib, code, name, yr, nat = m2.groups()
            seg = parts[0][m2.end():(ms[n2 + 1].start() if n2 + 1 < len(ms) else len(parts[0]))].strip('|').split('|')
            cp = int(seg[-1]) if seg and re.fullmatch(r'\d+', seg[-1]) else 0     # points de Coupe du monde publiés par la FIS
            if code not in seen and (cp > 0 or int(rk) <= 30):
                seen.add(code); res.append([code, int(rk), cp]); ath[code] = [name, nat]
        for k in range(1, len(parts) - 1, 2):
            st = 'DNS' if parts[k].startswith('Did not start') else 'DNQ' if 'qualify' in parts[k] else 'DSQ' if parts[k].startswith('Disq') else 'DNF'
            for m2 in re.finditer(r'(?:^|\|)(\d+)\|(\d+)\|([^|]+)\|-->\|-->\|(\d{4})\|([A-Z]{3})', parts[k + 1].split('|Did not')[0]):
                bib, code, name, yr, nat = m2.groups()
                if code not in seen: seen.add(code); res.append([code, st]); ath[code] = [name, nat]
        if not any(isinstance(x[1], int) for x in res): print('pas de résultat', rid, place, date, disc, g); continue
        races.append({'id': int(rid), 'place': place.strip(), 'date': date, 'disc': disc, 'g': 'M' if g == 'Men' else 'W', 'res': res})
        print(rid, place, date, disc, g, len([x for x in res if isinstance(x[1], int)]), 'classés', len(res) - len([x for x in res if isinstance(x[1], int)]), 'statuts')
    time.sleep(0.3)
races.sort(key=lambda r: (r['date'], r['g']))
out = os.path.join(os.path.dirname(__file__), '..', 'data', f'season-{season}.json')
json.dump({'season': season, 'races': races, 'ath': ath}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(races), 'courses', len(ath), 'skieurs ->', out)
