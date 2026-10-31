#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-035: Mode-A table->GFM apply battery (fail-closed).
Clone of the run-033 battery (11 gates) with run-035 extensions:
  + gfm_table_shape      every inserted md table: header + delimiter + uniform columns
  + asset_integrity      dropped asset: gone from part assets[] AND from problemMd;
                         kept assets untouched; sibling references untouched
Plane pin 2021ec4730bf1c83. Usage: run035_apply.py [--write]
"""
import hashlib
import importlib.util
import json
import os
import re
import sys

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
SCRATCH = '/home/z/my-project/scratch/toeq_state/run035'
FIXES_PATH = f'{SCRATCH}/run035_fixes.py'
CENSUS_PATH = f'{SCRATCH}/run035_table_census.json'

spec = importlib.util.spec_from_file_location('run035_fixes', FIXES_PATH)
run035_fixes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run035_fixes)
FIXES = run035_fixes.FIXES

census = json.load(open(CENSUS_PATH))
CENSUS_MD = {r['pid']: r['problemMd'] for r in census['table_crop_parts']}
CENSUS_ASSETS = {r['pid']: r['asset_path'] for r in census['table_crop_parts']}

WRITE = '--write' in sys.argv
EXPECT_BEFORE = os.environ.get('RUN035_EXPECT', '2021ec4730bf1c83')

raw = open(PLANE, 'rb').read()
before_sha = hashlib.sha256(raw).hexdigest()[:16]
data = json.loads(raw)
snapshot = json.loads(raw)

index = {}
for si, s in enumerate(data):
    for qi, q in enumerate(s['questions']):
        for pi, p in enumerate(q['parts']):
            index[p['id']] = (si, qi, pi, s)

snap_index = {}
for s in snapshot:
    for q in s['questions']:
        for p in q['parts']:
            snap_index[p['id']] = p

# ---------------- probe-before-work: census text must equal live plane text ----------------
probe_fail = []
for f in FIXES:
    pid = f['pid']
    if pid not in index:
        sys.exit(f'FATAL probe: pid {pid} not in plane')
    si, qi, pi, _ = index[pid]
    live = data[si]['questions'][qi]['parts'][pi].get('problemMd') or ''
    if CENSUS_MD.get(pid) != live:
        probe_fail.append(pid)
    live_assets = [a.get('path') for a in data[si]['questions'][qi]['parts'][pi].get('assets') or []]
    if f['drop_assets']:
        for da in f['drop_assets']:
            if da not in live_assets:
                probe_fail.append(f'{pid}:drop:{da}')
if probe_fail:
    sys.exit(f'FATAL probe (census != live): {probe_fail}')
print(f'probe-before-work: 18/18 old texts + {sum(len(f["drop_assets"]) for f in FIXES)} drop targets byte-match')

# ---------------- apply ----------------
changed = set()   # (pid, 'problemMd' | 'assets')
per_fix = []
for i, f in enumerate(FIXES):
    pid = f['pid']
    si, qi, pi, _ = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    old = p.get('problemMd') or ''
    new = f['new']
    if old == new:
        sys.exit(f'FAIL fix#{i} {pid}: new == old (no-op fix refused)')
    # dollar parity pre-check on NEW text (non-escaped $)
    if new.replace('\\$', '').count('$') % 2:
        sys.exit(f'FAIL fix#{i} {pid}: new problemMd has odd unescaped $ count')
    p['problemMd'] = new
    changed.add((pid, 'problemMd'))
    for da in f['drop_assets']:
        before_n = len(p.get('assets') or [])
        p['assets'] = [a for a in (p.get('assets') or []) if a.get('path') != da]
        if len(p.get('assets') or []) != before_n - 1:
            sys.exit(f'FAIL fix#{i} {pid}: drop {da} removed {before_n - len(p.get("assets") or [])} != 1')
        changed.add((pid, 'assets'))
    per_fix.append({'fix': i, 'pid': pid, 'kind': f['kind'], 'applied': True})

# ---------------- projection ----------------
projection = []
for f in FIXES:
    pid = f['pid']
    si, qi, pi, s = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    row = {'pid': pid, 'set': s.get('topicSlug') or s.get('slug'), 'field': 'problemMd',
           'kind': f['kind'], 'note': f['note'], 'ev': f['ev'],
           'old': p_old.get('problemMd', ''), 'new': p_new.get('problemMd', '')}
    if f['drop_assets']:
        row['assets_old'] = [a.get('path') for a in (p_old.get('assets') or [])]
        row['assets_new'] = [a.get('path') for a in (p_new.get('assets') or [])]
    projection.append(row)
json.dump(projection, open(f'{SCRATCH}/run035_projection.json', 'w'), ensure_ascii=False, indent=1)

# ---------------- gates ----------------
def census_counts(d):
    return (len(d),
            sum(len(s.get('questions') or []) for s in d),
            sum(len(q.get('parts') or []) for s in d for q in s.get('questions') or []),
            sum((p.get('marks') or 0) for s in d for q in s.get('questions') or [] for p in q.get('parts') or []))

def marks_map(d):
    out = {}
    for s in d:
        for q in s.get('questions') or []:
            for p in q.get('parts') or []:
                mps = p.get('markPoints') or []
                out[p['id']] = (p.get('marks'), tuple((m.get('marks'), m.get('code')) for m in mps))
    return out

gates = {}
gates['plane_pin'] = before_sha == EXPECT_BEFORE
gates['census_EXACT'] = census_counts(data) == (66, 1281, 2443, 6600) and census_counts(data) == census_counts(snapshot)
gates['marks_map_identical'] = marks_map(data) == marks_map(snapshot)

RE_PUA = re.compile(r'[\uE000-\uF8FF\u298B\u298C\u2061-\u2064\uFEFF\u200B\uFFFD]')
def pua_count(d):
    n = 0
    for s in d:
        for q in s['questions']:
            for p in q['parts']:
                txt = json.dumps([p.get('problemMd'), p.get('solutionMd')] +
                                 [m.get('textMd') for m in (p.get('markPoints') or [])],
                                 ensure_ascii=False)
                n += len(RE_PUA.findall(txt))
    return n
gates['PUA_FFFD_delta_clean'] = pua_count(data) == pua_count(snapshot)

dollar_bad = []
for (pid, f) in changed:
    si, qi, pi, _ = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    if f == 'problemMd':
        txt = p.get('problemMd') or ''
        if txt.replace('\\$', '').count('$') % 2:
            dollar_bad.append((pid, f))
gates['dollar_parity'] = not dollar_bad

expected_changed = set()
for f in FIXES:
    expected_changed.add((f['pid'], 'problemMd'))
    for da in f['drop_assets']:
        expected_changed.add((f['pid'], 'assets'))
gates['changed_set_EXACT'] = changed == expected_changed

# mirror integrity: we never touch solutionMd/markPoints — assert solutionMd/mp0 unchanged
mirror_bad = []
for (pid, f) in sorted(changed):
    p_new, p_old = snap_index[pid], None
    si, qi, pi, _ = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    if (p_new.get('solutionMd') or '') != (p_old.get('solutionMd') or ''):
        mirror_bad.append((pid, 'solutionMd moved'))
    m_new = (p_new.get('markPoints') or [{}])[0].get('textMd') if p_new.get('markPoints') else None
    m_old = (p_old.get('markPoints') or [{}])[0].get('textMd') if p_old.get('markPoints') else None
    if m_new != m_old:
        mirror_bad.append((pid, 'markPoints[0].textMd moved'))
gates['mirror_integrity'] = not mirror_bad

new_raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
gates['serialization_roundtrip'] = json.loads(new_raw) == data

scrub_txt = new_raw.decode('utf-8')
scrub_hits = [pat for pat in ('napi_', 'ghp_', 'vcp_', 'postgresql://neon.tech') if pat in scrub_txt]
gates['scrub_assert'] = not scrub_hits

# old-form discharge: per-part KILL fragments (the mangled run-on/linearised forms this
# wave set out to kill). Fail-closed BOTH ways: each fragment must be present in the OLD
# census text (proves the kill list is real) and absent from the NEW text (proves the kill).
KILL = {
    'offp_2018-06_01_20': 'h-2 20 h-5 24',
    'offp_2026-06_01_10': '0≤t < 2 13',
    'offp_2021-01_01r_27-c': None,
    'offp_2023-01_01r_26-b': None,
    'offp_2024-06_01r_19': 'vanilla 3x + 1 vanilla chocolate 80°',
    'offp_2020-06_02_11-a': 'y = 2x 3 – 3x + 4 x –2.5',
    'offp_2020-11_02_11-a': 'y = 2x 3 – 3x + 4 x –2.5',
    'offp_2021-11_02_7-a': '0.38 −3 −2.13 1',
    'offp_2022-01_02_11-d': 'y = x 2 – 2x – 1 x –2',
    'offp_2018-06_02_10-a': 'y = x² − 5x + x',
    'offp_2021-06_02_6-a': 'x² + 2x + x≠0 x',
    'offp_2019-06_02_11-c': '(1/3)πr2(15 − 4r)',
    'offp_2021-01_02_11-a': 'x 3 − 10x 2 + 20',
    'offp_2019-01_02_11-d': 'y –12 –12 –12',
    'offp_2021-11_01_22': 'Solid A 425 312.5 Solid B x 67.5',
    'offp_2022-06_02_1': 'total GDP GDP per capita = population',
    'offp_2021-06_02_7-b': '1 euro = \\$1.20 1 euro = £x \\$1 = £0.76',
    'offp_2021-01_02_7': 'c3 complete the following table. a c 16 240 250 135',
}
leftover = []
for f in FIXES:
    pid = f['pid']
    old = CENSUS_MD[pid]
    kf = KILL.get(pid)
    if kf is not None:
        if kf not in old:
            leftover.append((pid, f'KILL fragment NOT in old (kill list stale): {kf!r}'))
        si, qi, pi, _ = index[pid]
        p = data[si]['questions'][qi]['parts'][pi]
        if kf in (p.get('problemMd') or ''):
            leftover.append((pid, f'KILL fragment survives in new: {kf!r}'))
    for da in f['drop_assets']:
        si, qi, pi, _ = index[pid]
        p = data[si]['questions'][qi]['parts'][pi]
        if da in [a.get('path') for a in (p.get('assets') or [])]:
            leftover.append((pid, f'asset still present {da}'))
        if da in (p.get('problemMd') or ''):
            leftover.append((pid, f'asset ref still in problemMd {da}'))
gates['old_form_discharge'] = not leftover

# GFM table shape: every inserted table block well-formed
GFM_BAD = []
def check_tables(txt, pid):
    lines = txt.split('\n')
    i = 0
    while i < len(lines):
        if lines[i].strip().startswith('|') and i + 1 < len(lines) and \
           re.match(r'^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$', lines[i + 1]):
            header = lines[i]
            delim = lines[i + 1]
            ncol = header.count('|') - header.count('\\|')
            dcol = delim.count('|') - delim.count('\\|')
            if ncol != dcol:
                GFM_BAD.append((pid, f'delimiter cols {dcol} != header {ncol}'))
            j = i + 2
            while j < len(lines) and lines[j].strip().startswith('|'):
                rc = lines[j].count('|') - lines[j].count('\\|')
                if rc != ncol:
                    GFM_BAD.append((pid, f'row cols {rc} != header {ncol}: {lines[j][:50]}'))
                j += 1
            i = j
        else:
            i += 1
for f in FIXES:
    pid = f['pid']
    si, qi, pi, _ = index[pid]
    check_tables(data[si]['questions'][qi]['parts'][pi].get('problemMd') or '', pid)
gates['gfm_table_shape'] = not GFM_BAD

# asset integrity: kept assets untouched (count + order), sibling parts untouched
ai_bad = []
for f in FIXES:
    pid = f['pid']
    si, qi, pi, _ = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    keep = [a.get('path') for a in (p_new.get('assets') or [])]
    old = [a.get('path') for a in (p_old.get('assets') or [])]
    expected_keep = [x for x in old if x not in f['drop_assets']]
    if keep != expected_keep:
        ai_bad.append((pid, f'assets {keep} != expected {expected_keep}'))
gates['asset_integrity'] = not ai_bad

# class post-census: marklabel soup classes must not grow on edited fields
RE_MARKLABEL = re.compile(r'\*\*[A-Z]\d+\*\*|\b4MB1\b')
RE_MARKCODE = re.compile(r'\b(?:M|A|B)(?:1|2|3)\b|\b(?:M|A|B)(?:1|2|3)(?=[a-z])')
RE_G1 = re.compile(r'[a-z]\d{1,3}(?![\d.])')
RE_G2 = re.compile(r'[a-z] \d{1,2}(?![\d.])')
RE_G3 = re.compile(r'\d [a-z] \d{1,2}(?![\d.])')
RE_U1 = re.compile(r'[A-Z]\d{1,2}(?![\d.])')
RE_U1D = re.compile(r'[A-Z] \d{1,2}(?![\d.])')
def strip_math(t):
    t = re.sub(r'\$[^$]*\$', ' ', t)
    t = re.sub(r'\\\$[^$]*\\\$', ' ', t)
    return RE_MARKLABEL.sub(' ', t)
def hits_in(txt):
    v = re.sub(RE_MARKCODE, ' ', strip_math(txt))
    n = 0
    for rx in (RE_G1, RE_G2, RE_G3, RE_U1, RE_U1D):
        n += len(rx.findall(v))
    return n
grow = []
for f in FIXES:
    pid = f['pid']
    si, qi, pi, _ = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    if hits_in(p_new.get('problemMd') or '') > hits_in(p_old.get('problemMd') or ''):
        grow.append((pid, 'problemMd'))
gates['class_post_census'] = not grow

after_sha = hashlib.sha256(new_raw).hexdigest()[:16]

print(f'plane: {before_sha} -> {after_sha}')
print(f'fix tuples: {len(FIXES)}  changed fields: {len(changed)}  '
      f'pids: {len({f["pid"] for f in FIXES})}  asset drops: {sum(len(f["drop_assets"]) for f in FIXES)}')
for f, g in gates.items():
    print(f'  {f}: {"GREEN" if g else "RED"}')
ok = all(gates.values())
if WRITE and ok:
    open(PLANE, 'wb').write(new_raw)
    print(f'WRITTEN: {PLANE} ({after_sha})')
elif WRITE:
    print('WRITE REFUSED — gates RED')
    for row in (mirror_bad + dollar_bad + grow + leftover + GFM_BAD + ai_bad):
        print('    !!', row)
sys.exit(0 if ok else 3)
