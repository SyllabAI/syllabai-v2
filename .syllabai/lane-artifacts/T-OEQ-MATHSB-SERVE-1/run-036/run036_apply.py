#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-036: Mode-A table->GFM tranche-2 apply battery (fail-closed).
Clone of the run-035 battery (13 gates) with run-036 extensions:
  + drop_expect         multi-ref drops (duplicate paths) removed exactly as expected
  + assets_only_fixes   fixes with new=None (pmd untouched, asset drop only) allowed
  + value_carrier       every numeric token in NEW GFM table cells must exist in the OLD
                        text (normalized) unless the pid is in the evidence allowlist
Plane pin 801474a740be6546. Usage: run036_apply.py [--write]
"""
import hashlib
import importlib.util
import json
import os
import re
import sys

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
SCRATCH = '/home/z/my-project/scratch/toeq_state/fmt'
FIXES_PATH = f'{SCRATCH}/run036_fixes.py'
CENSUS_PATH = f'{SCRATCH}/run035/run035_table_census.json'

spec = importlib.util.spec_from_file_location('run036_fixes', FIXES_PATH)
run036_fixes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run036_fixes)
FIXES = run036_fixes.FIXES

census = json.load(open(CENSUS_PATH))
CENSUS_MD = {r['pid']: r['problemMd'] for r in census['table_crop_parts']}

WRITE = '--write' in sys.argv
EXPECT_BEFORE = os.environ.get('RUN036_EXPECT', '801474a740be6546')

# numeric tokens in NEW tables that come from print evidence OUTSIDE the part's own
# old text (each disclosed in the fix ev/note)
VALUE_ALLOWLIST = {
    # table values live in sibling 4(a) run-on + crop sheet-08 #6
    'offp_2022-06_02_4-b',
    # printed y(-4) = -9: the minus was lost at extraction ('y 9 2 4.5 3.5 0');
    # crop sheet-02 #5 read first-hand + arithmetic y(-4) = -9 exact
    'offp_2019-06_02r_7-a',
    # twin of 7-a: same printed table, same lost-minus disclosure
    'offp_2019-06_02r_7-b',
}

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

# ---------------- probe-before-work ----------------
probe_fail = []
for f in FIXES:
    pid = f['pid']
    if pid not in index:
        probe_fail.append(f'{pid}:MISSING')
        continue
    si, qi, pi, _ = index[pid]
    live = data[si]['questions'][qi]['parts'][pi].get('problemMd') or ''
    if CENSUS_MD.get(pid) != live:
        probe_fail.append(f'{pid}:text-moved')
    live_paths = [a.get('path') for a in data[si]['questions'][qi]['parts'][pi].get('assets') or []]
    for da in f['drop_assets']:
        c = live_paths.count(da)
        if c != f.get('drop_expect', 1):
            probe_fail.append(f'{pid}:drop {da} count {c} != {f.get("drop_expect", 1)}')
if probe_fail:
    sys.exit(f'FATAL probe (census != live): {probe_fail}')
n_drop_targets = sum(1 for f in FIXES for da in f['drop_assets'])
print(f'probe-before-work: 77/77 old texts byte-match census; {n_drop_targets} drop paths present with expected multiplicities')

# ---------------- apply ----------------
changed = set()
per_fix = []
for i, f in enumerate(FIXES):
    pid = f['pid']
    si, qi, pi, _ = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    new = f['new']
    if new is None:
        if not f['drop_assets']:
            sys.exit(f'FAIL fix#{i} {pid}: assets-only fix must drop >=1 asset')
    else:
        old = p.get('problemMd') or ''
        if old == new:
            sys.exit(f'FAIL fix#{i} {pid}: new == old (no-op fix refused)')
        if new.replace('\\$', '').count('$') % 2:
            sys.exit(f'FAIL fix#{i} {pid}: new problemMd has odd unescaped $ count')
        p['problemMd'] = new
        changed.add((pid, 'problemMd'))
    for da in f['drop_assets']:
        before_n = len(p.get('assets') or [])
        before_c = sum(1 for a in (p.get('assets') or []) if a.get('path') == da)
        p['assets'] = [a for a in (p.get('assets') or []) if a.get('path') != da]
        removed = before_n - len(p.get('assets') or [])
        if removed != f.get('drop_expect', 1) or before_c != f.get('drop_expect', 1):
            sys.exit(f'FAIL fix#{i} {pid}: drop {da} removed {removed} (had {before_c}), '
                     f'expected {f.get("drop_expect", 1)}')
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
json.dump(projection, open(f'{SCRATCH}/run036_projection.json', 'w'), ensure_ascii=False, indent=1)

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
    if f == 'problemMd':
        si, qi, pi, _ = index[pid]
        txt = data[si]['questions'][qi]['parts'][pi].get('problemMd') or ''
        if txt.replace('\\$', '').count('$') % 2:
            dollar_bad.append((pid, f))
gates['dollar_parity'] = not dollar_bad

expected_changed = set()
for f in FIXES:
    if f['new'] is not None:
        expected_changed.add((f['pid'], 'problemMd'))
    if f['drop_assets']:
        expected_changed.add((f['pid'], 'assets'))
gates['changed_set_EXACT'] = changed == expected_changed

mirror_bad = []
for (pid, f) in sorted(changed):
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

scrub_hits = [pat for pat in ('napi_', 'ghp_', 'vcp_', 'postgresql://neon.tech') if pat in new_raw.decode('utf-8')]
gates['scrub_assert'] = not scrub_hits

# old-form discharge: kill fragments fail-closed BOTH ways
def norm(s):
    return s.replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-').replace('\\,', '')

KILL = {
    'offp_2018-06_02r_2-a': 'y = x 2 – 3x – 1',
    'offp_2018-06_02r_2-c': '2x 2 – x – 5 = 0',
    'offp_2019-06_01_20': 'Frequency density 10 20 30 40 50 60 70',
    'offp_2019-06_01r_28-a': 'Figure not shown in this reconstruction',
    'offp_2019-06_01r_28-b': 'Figure not shown in this reconstruction',
    'offp_2019-06_02r_7-a': 'y= 5 — 5 x?',
    'offp_2019-06_02r_7-b': 'Figure not shown in this reconstruction',
    'offp_2020-01_02r_11-a': 'y = – + − 6 5 2',
    'offp_2020-06_01r_12': 'Plain 144°',
    'offp_2020-11_01r_12': 'Plain 144°',
    'offp_2021-01_01_23': 'Frequency density 0 5 10 15 20 25 30',
    'offp_2021-01_01r_27-b': 'minutes ( )',
    'offp_2021-01_02r_3-a': 'y = −2x3 + 6x + x²',
    'offp_2022-01_02r_8-b': 'y x x x –3',
    'offp_2022-01_02r_8-c': 'y x 2 x 1 for values',
    'offp_2022-06_02_10-c': 'V = 4x 3 – 60x 2 + 200x',
    'offp_2022-06_02_4-b': '…………… , ……………',
    'offp_2023-01_01r_26-a': 'in the shop minutes The incomplete',
    'offp_2023-01_02_11-b': 'values for y x x Give',
    'offp_2023-06_02r_9-b': 'values for y Give',
    'offp_2024-06_02_9-a': '1 2 1 y x x ≠ 0 4 x',
    'offp_2024-06_02_9-b': '1 2 1 y x 4 x',
    'offp_2024-06_02_9-c': '1 2 1 x 3 4 x',
    'offp_2024-06_02_9-d': '1 2 1 x − 2 − ≤0 4 x',
    'offp_2025-06_01_18-a': 'Frequency density 0 60 120 180 240 300',
    'offp_2025-06_01r_14': 'complete the puzzle minutes',
    'offp_2026-06_02r_12-a': 'y 5 x 2 2x2',
}
leftover = []
for f in FIXES:
    pid = f['pid']
    old = CENSUS_MD[pid]
    si, qi, pi, _ = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    newmd = p.get('problemMd') or ''
    if f['new'] is not None:
        kf = KILL.get(pid)
        if kf is not None:
            if kf not in old:
                leftover.append((pid, f'KILL fragment NOT in old (stale): {kf!r}'))
            if kf in newmd:
                leftover.append((pid, f'KILL fragment survives in new: {kf!r}'))
    for da in f['drop_assets']:
        fname = da.split('/')[-1]
        if f['new'] is not None:
            m = re.search(r'^.*!\[[^\]]*\]\([^)]*' + re.escape(fname) + r'\)[^\n]*$', old, re.M)
            if m:
                if m.group(0) in newmd:
                    leftover.append((pid, f'dropped img line survives: {fname}'))
            if fname in newmd:
                leftover.append((pid, f'dropped file name still in problemMd: {fname}'))
        live_paths = [a.get('path') for a in (p.get('assets') or [])]
        if da in live_paths:
            leftover.append((pid, f'asset still present {da}'))
gates['old_form_discharge'] = not leftover

# GFM table shape
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
    if f['new'] is None:
        continue
    si, qi, pi, _ = index[f['pid']]
    check_tables(data[si]['questions'][qi]['parts'][pi].get('problemMd') or '', f['pid'])
gates['gfm_table_shape'] = not GFM_BAD

# asset integrity: kept assets untouched (order preserved), dropped exactly as expected
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

# value carrier: numeric tokens in NEW table cells must exist in the OLD text of the part
# or of any sibling part of the same printed question (the printed table appears once and
# is carried by the family), or be crop-evidenced (VALUE_ALLOWLIST, each disclosed in ev)
vc_bad = []
NUM = re.compile(r'-?\d+(?:\.\d+)?')
def family_of(pid):
    body = pid[len('offp_'):]
    parts_ = body.split('_')
    return (parts_[0], parts_[1], parts_[2].split('-')[0])
def squash(s):
    return re.sub(r'\s+', '', norm(s))
FAMILY_TEXT = {}
for _pid, _md in CENSUS_MD.items():
    FAMILY_TEXT.setdefault(family_of(_pid), []).append(_md)
for _s in snapshot:
    for _q in _s.get('questions') or []:
        for _p in _q.get('parts') or []:
            _fam = family_of(_p['id'])
            FAMILY_TEXT.setdefault(_fam, []).append(_p.get('problemMd') or '')
for f in FIXES:
    if f['new'] is None or f['pid'] in VALUE_ALLOWLIST:
        continue
    pid = f['pid']
    old_sq = squash(CENSUS_MD[pid])
    fam_sq = [squash(t) for t in FAMILY_TEXT.get(family_of(pid), [])]
    newmd = f['new']
    lines = newmd.split('\n')
    for li, line in enumerate(lines):
        if not line.strip().startswith('|'):
            continue
        if re.match(r'^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$', line):
            continue
        for cell in line.strip().strip('|').split('|'):
            for tok in NUM.findall(cell):
                if tok.lstrip('-') == '':
                    continue
                ok = squash(tok) in old_sq or any(squash(tok) in b for b in fam_sq)
                if not ok:
                    vc_bad.append((pid, tok, cell.strip()[:40]))
gates['value_carrier'] = not vc_bad

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
    if f['new'] is None:
        continue
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
      f'pids: {len({f["pid"] for f in FIXES})}  asset drops: {sum(1 for f in FIXES for _ in f["drop_assets"])}')
for f, g in gates.items():
    print(f'  {f}: {"GREEN" if g else "RED"}')
ok = all(gates.values())
if WRITE and ok:
    open(PLANE, 'wb').write(new_raw)
    print(f'WRITTEN: {PLANE} ({after_sha})')
elif WRITE:
    print('WRITE REFUSED — gates RED')
    for row in (mirror_bad + dollar_bad + grow + leftover + GFM_BAD + ai_bad + vc_bad):
        print('    !!', row)
sys.exit(0 if ok else 3)
