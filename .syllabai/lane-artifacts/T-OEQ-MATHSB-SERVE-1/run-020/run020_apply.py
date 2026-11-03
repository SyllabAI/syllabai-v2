#!/usr/bin/env python3
r"""T-OEQ-MATHSB-SERVE-1 run-020: G-bucket wave tranche-1 apply battery (fail-closed).
Clone of tranche-2/run-018/run-019 battery. 7 eyes-on-adjudicated fix pairs /
8 flattened-sup tokens / 1 pid (offp_2022-06_01r_22-a), solutionMd + mirrored
markPoints[0] (part converges to mirror of record per the run-018 scoped law).

Gates:
  1  census_EXACT            66/1281/2443/6600 pre==post
  2  marks_map_identical     per-pid (marks, markPoints (marks,code)) map identical
  3  PUA_FFFD_0              zero PUA/control/FFFD across scanned fields
  4  dollar_parity           edited fields raw-$ count even (\\$ class untouched)
  5  changed_set_EXACT       exactly the declared writes (solutionMd + mirror)
  6  mirror_law              markPoints[0].textMd == solutionMd post-apply (edited parts)
  7  serialization_roundtrip single-line compact JSON preserved
  8  scrub_assert            napi_/ghp_/vcp_/postgresql://neon.tech zero hits
  +  sup_token_discharge     all 7 old tokens absent from the edited field post-apply
  +  class_post_census      math-stripped re-scan of the edited part: zero G1/G2/G3
                             hits from the discharged token shapes (k2 / k 2 / x 2 in
                             the fixed contexts)
Usage: run020_apply.py [--write]   (without --write: dry-run, no plane write)
"""
import json, re, sys, os, hashlib, importlib.util

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
LANE = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-020'

spec = importlib.util.spec_from_file_location('run020_fixes', f'{LANE}/run020_fixes.py')
run020_fixes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run020_fixes)
FIXES = run020_fixes.FIXES

WRITE = '--write' in sys.argv

raw = open(PLANE, 'rb').read()
before_sha = hashlib.sha256(raw).hexdigest()[:16]
EXPECT_BEFORE = '701ae1997de5421a'
if before_sha != EXPECT_BEFORE:
    sys.exit(f'FAIL plane pin: {before_sha} != {EXPECT_BEFORE}')
data = json.loads(raw)

index = {}
for si, s in enumerate(data):
    for qi, q in enumerate(s['questions']):
        for pi, p in enumerate(q['parts']):
            index[p['id']] = (si, qi, pi, s)

def get_field(p, which):
    return p['problemMd'] if which == 'problem' else p['solutionMd']

def set_field(p, which, val):
    if which == 'problem':
        p['problemMd'] = val
    else:
        p['solutionMd'] = val
        mp = (p.get('markPoints') or [{}])[0]
        mp['textMd'] = val

# ---------------- apply with per-fix fail-closed count check ----------------
changed = set()
per_fix = []
for i, (pid, which, old, new, exp, ev, note) in enumerate(FIXES):
    if pid not in index:
        sys.exit(f'FAIL fix#{i}: pid {pid} not in plane')
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    txt = get_field(p, which)
    cnt = txt.count(old)
    if cnt != exp:
        sys.exit(f'FAIL fix#{i} {pid}/{which}: expected {exp} found {cnt}: {old!r}')
    newtxt = txt.replace(old, new) if exp != 1 else txt.replace(old, new, 1)
    if newtxt != txt:
        set_field(p, which, newtxt)
        changed.add((pid, 'problemMd' if which == 'problem' else 'solutionMd'))
    per_fix.append({'fix': i, 'pid': pid, 'field': which, 'applied': newtxt != txt})

snapshot = json.loads(raw)
snap_index = {}
for s in snapshot:
    for q in s['questions']:
        for p in q['parts']:
            snap_index[p['id']] = p

DECLARED = set()
for (pid, which, *_rest) in FIXES:
    DECLARED.add((pid, 'problemMd' if which == 'problem' else 'solutionMd'))
for (pid, which, *_rest) in FIXES:
    if which == 'solution':
        DECLARED.add((pid, 'mirror'))

projection = []
for pid, which in sorted(changed):
    si, qi, pi, s = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    if which == 'problemMd':
        projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'problemMd',
                           'old': p_old.get('problemMd', ''), 'new': p_new.get('problemMd', '')})
    else:
        projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'solutionMd',
                           'old': p_old.get('solutionMd', ''), 'new': p_new.get('solutionMd', '')})
        projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'markPoints[0].textMd',
                           'old': (p_old.get('markPoints') or [{}])[0].get('textMd', ''),
                           'new': (p_new.get('markPoints') or [{}])[0].get('textMd', '')})

json.dump(projection, open(f'{LANE}/run020_projection.json', 'w'), ensure_ascii=False, indent=1)

# ---------------- gates ----------------
def census(d):
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
gates['census_EXACT'] = census(data) == (66, 1281, 2443, 6600)
gates['marks_map_identical'] = marks_map(data) == marks_map(snapshot)

bad = []
for s in data:
    for q in s['questions']:
        for p in q['parts']:
            txt = json.dumps([p.get('problemMd'), p.get('solutionMd')] +
                             [m.get('textMd') for m in (p.get('markPoints') or [])], ensure_ascii=False)
            if '\ufffd' in txt or any(0xE000 <= ord(c) <= 0xF8FF for c in txt):
                bad.append(p['id'])
gates['PUA_FFFD_0'] = not bad

dollar_bad = []
for (pid, field) in changed:
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    txt = p.get(field) or ''
    n = txt.replace('\\$', '').count('$')
    if n % 2:
        dollar_bad.append((pid, field))
gates['dollar_parity'] = not dollar_bad

expected_changed = {(pid, f) for (pid, which, *_r) in FIXES
                    for f in (['problemMd'] if which == 'problem' else ['solutionMd'])}
expected_changed |= {(pid, 'mirror') for (pid, which, *_r) in FIXES if which == 'solution'}
changed_full = set(changed) | {(pid, 'mirror') for (pid, f) in changed if f == 'solutionMd'}
gates['changed_set_EXACT'] = changed_full == expected_changed

mirror_bad = []
for (pid, field) in changed:
    if field != 'solutionMd':
        continue
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    if not p.get('markPoints') or p['markPoints'][0].get('textMd') != p.get('solutionMd'):
        mirror_bad.append(pid)
gates['mirror_law'] = not mirror_bad

new_raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
gates['serialization_roundtrip'] = json.loads(new_raw) == data

scrub_txt = new_raw.decode('utf-8')
scrub_hits = [pat for pat in ('napi_', 'ghp_', 'vcp_', 'postgresql://neon.tech') if pat in scrub_txt]
gates['scrub_assert'] = not scrub_hits

# class-specific: every old token absent from the edited field post-apply
leftover = []
for (pid, which, old, new, exp, ev, note) in FIXES:
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    txt = get_field(p, which)
    if old in txt:
        leftover.append((pid, old[:40]))
gates['sup_token_discharge'] = not leftover

# class post-census on the edited part: math-stripped text must show zero
# of the discharged flattened-sup shapes (the exact fixed contexts)
RE_MARKLABEL = re.compile(r'\*\*[A-Z]\d+\*\*|\b4MB1\b')
def strip_math(t):
    t = re.sub(r'\$[^$]*\$', ' ', t)
    t = re.sub(r'\\\$[^$]*\\\$', ' ', t)
    return RE_MARKLABEL.sub(' ', t)

RE_G1 = re.compile(r'[a-z]\d{1,3}(?![\d.])')
RE_G2 = re.compile(r'[a-z] \d{1,2}(?![\d.])')
RE_G3 = re.compile(r'\d [a-z] \d{1,2}(?![\d.])')
residual_shapes = []
for (pid, which, old, new, exp, ev, note) in FIXES:
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    stripped = strip_math(get_field(p, which))
    for shape in (r'k2', r'k 2', r'144 x 2'):
        if re.search(shape, stripped):
            residual_shapes.append((pid, shape))
gates['class_post_census'] = not residual_shapes

after_sha = hashlib.sha256(new_raw).hexdigest()[:16]

print(f'plane: {before_sha} -> {after_sha}')
print(f'changed fields: {sorted(changed)}')
for f, g in gates.items():
    print(f'  {f}: {"GREEN" if g else "RED"}')
ok = all(gates.values())
if WRITE and ok:
    open(PLANE, 'wb').write(new_raw)
    print(f'WRITTEN: {PLANE} ({after_sha})')
elif WRITE:
    print('WRITE REFUSED — gates RED')
sys.exit(0 if ok else 3)
