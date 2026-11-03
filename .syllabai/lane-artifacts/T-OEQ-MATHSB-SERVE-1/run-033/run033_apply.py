#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-033: tranche-2 wave-6 apply battery (fail-closed).
Clone of the run-028 battery (11 gates). Plane pin bd6f21eab951639e.

Usage: run033_apply.py [--write]   (without --write: dry-run)
"""
import json, re, sys, os, hashlib, importlib.util

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
FIXES_PATH = '/home/z/my-project/scratch/oeq_run033/run033_fixes.py'
SCRATCH = '/home/z/my-project/scratch/oeq_run033'

spec = importlib.util.spec_from_file_location('run033_fixes', FIXES_PATH)
run033_fixes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run033_fixes)
FIXES = run033_fixes.FIXES
ZERO_FIX = run033_fixes.ZERO_FIX

WRITE = '--write' in sys.argv
EXPECT_BEFORE = os.environ.get('RUN033_EXPECT', 'bd6f21eab951639e')

raw = open(PLANE, 'rb').read()
before_sha = hashlib.sha256(raw).hexdigest()[:16]
data = json.loads(raw)
snapshot = json.loads(raw)

index = {}
for si, s in enumerate(data):
    for qi, q in enumerate(s['questions']):
        for pi, p in enumerate(q['parts']):
            index[p['id']] = (si, qi, pi, s)

def get_field(p, field):
    if field == 'problem':
        return p.get('problemMd') or ''
    if field == 'mirror':
        return (p.get('markPoints') or [{}])[0].get('textMd') or ''
    return p.get('solutionMd') or ''

def set_field(p, field, val):
    if field == 'problem':
        p['problemMd'] = val
    elif field == 'mirror':
        (p.get('markPoints') or [{}])[0]['textMd'] = val
    elif field == 'solution':
        p['solutionMd'] = val
    elif field == 'solutionMirror':
        p['solutionMd'] = val
        (p.get('markPoints') or [{}])[0]['textMd'] = val

# ---------------- apply with per-fix fail-closed count check ----------------
changed = set()          # (pid, actualField)
per_fix = []
for i, (pid, field, old, new, exp, ev, note) in enumerate(FIXES):
    if pid not in index:
        sys.exit(f'FAIL fix#{i}: pid {pid} not in plane')
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    if field == 'solutionMirror':
        sol = p.get('solutionMd') or ''
        m0 = (p.get('markPoints') or [{}])[0].get('textMd') or ''
        if sol != m0:
            sys.exit(f'FAIL fix#{i} {pid}: solutionMirror lockstep pre-check FAILED '
                     f'(sol {len(sol)}ch vs mp0 {len(m0)}ch diverged — split into explicit tuples)')
    targets = ['problemMd'] if field == 'problem' else \
              ['solutionMd'] if field == 'solution' else \
              ['markPoints[0].textMd'] if field == 'mirror' else \
              ['solutionMd', 'markPoints[0].textMd']
    for t in targets:
        txt = get_field(p, 'problem' if t == 'problemMd' else
                        'mirror' if t.startswith('markPoints') else 'solution')
        cnt = txt.count(old)
        if cnt != exp:
            sys.exit(f'FAIL fix#{i} {pid}/{t}: expected {exp} found {cnt}: {old!r}')
        newtxt = txt.replace(old, new) if exp != 1 else txt.replace(old, new, 1)
        if newtxt != txt:
            set_field(p, 'problem' if t == 'problemMd' else
                      'mirror' if t.startswith('markPoints') else 'solution', newtxt)
            changed.add((pid, t))
    per_fix.append({'fix': i, 'pid': pid, 'field': field, 'applied': True})

# projection
snap_index = {}
for s in snapshot:
    for q in s['questions']:
        for p in q['parts']:
            snap_index[p['id']] = p

projection = []
for pid, f in sorted(changed):
    si, qi, pi, s = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    if f == 'problemMd':
        projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'problemMd',
                           'old': p_old.get('problemMd', ''), 'new': p_new.get('problemMd', '')})
    elif f == 'markPoints[0].textMd':
        projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'markPoints[0].textMd',
                           'old': (p_old.get('markPoints') or [{}])[0].get('textMd', ''),
                           'new': (p_new.get('markPoints') or [{}])[0].get('textMd', '')})
    else:
        projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'solutionMd',
                           'old': p_old.get('solutionMd', ''), 'new': p_new.get('solutionMd', '')})

json.dump(projection, open(f'{SCRATCH}/run033_projection.json', 'w'), ensure_ascii=False, indent=1)

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
gates['plane_pin'] = before_sha == EXPECT_BEFORE
gates['census_EXACT'] = census(data) == (66, 1281, 2443, 6600) and census(data) == census(snapshot)
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
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    txt = (p.get(f) or '') if f != 'markPoints[0].textMd' else \
        ((p.get('markPoints') or [{}])[0].get('textMd') or '')
    n = txt.replace('\\$', '').count('$')
    if n % 2:
        dollar_bad.append((pid, f))
gates['dollar_parity'] = not dollar_bad

expected_changed = set()
for (pid, field, *_r) in FIXES:
    for t in (['problemMd'] if field == 'problem' else
              ['solutionMd'] if field == 'solution' else
              ['markPoints[0].textMd'] if field == 'mirror' else
              ['solutionMd', 'markPoints[0].textMd']):
        expected_changed.add((pid, t))
gates['changed_set_EXACT'] = changed == expected_changed

mirror_bad = []
for (pid, f) in sorted(changed):
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    sol_new = p.get('solutionMd') or ''
    m0_new = (p.get('markPoints') or [{}])[0].get('textMd') if p.get('markPoints') else None
    sol_old = p_old.get('solutionMd') or ''
    m0_old = (p_old.get('markPoints') or [{}])[0].get('textMd') if p_old.get('markPoints') else None
    if m0_new is None:
        continue  # attach-class parts: no markPoints by design
    if sol_old == m0_old:
        if m0_new != sol_new:
            mirror_bad.append((pid, 'lockstep broken'))
    else:
        expected_m0 = m0_old
        for (fpid, field, old, new, exp, *_r) in FIXES:
            if fpid == pid and field == 'mirror':
                expected_m0 = expected_m0.replace(old, new)
        if m0_new != expected_m0:
            mirror_bad.append((pid, 'diverged mirror unexpectedly altered'))
gates['mirror_integrity'] = not mirror_bad

new_raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
gates['serialization_roundtrip'] = json.loads(new_raw) == data

scrub_txt = new_raw.decode('utf-8')
scrub_hits = [pat for pat in ('napi_', 'ghp_', 'vcp_', 'postgresql://neon.tech') if pat in scrub_txt]
gates['scrub_assert'] = not scrub_hits

leftover = []
for (pid, field, old, new, exp, ev, note) in FIXES:
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    txt = get_field(p, field if field != 'solutionMirror' else 'solution')
    if old in txt:
        leftover.append((pid, old[:40]))
gates['token_discharge'] = not leftover

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
edited_pids = {pid for (pid, f) in changed}
for pid in sorted(edited_pids):
    si, qi, pi, s = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    for fname in ('problemMd', 'solutionMd'):
        if (pid, fname) not in changed:
            continue
        if hits_in(p_new.get(fname) or '') > hits_in(p_old.get(fname) or ''):
            grow.append((pid, fname))
gates['class_post_census'] = not grow

after_sha = hashlib.sha256(new_raw).hexdigest()[:16]

print(f'plane: {before_sha} -> {after_sha}')
print(f'zero-fix discharges (page-evidenced / ctx-class): {len(ZERO_FIX)} keys')
print(f'fix tuples: {len(FIXES)}  changed fields: {len(changed)}  pids: {len(edited_pids)}')
for f, g in gates.items():
    print(f'  {f}: {"GREEN" if g else "RED"}')
ok = all(gates.values())
if WRITE and ok:
    open(PLANE, 'wb').write(new_raw)
    print(f'WRITTEN: {PLANE} ({after_sha})')
elif WRITE:
    print('WRITE REFUSED — gates RED')
    for (pid, why) in (mirror_bad + dollar_bad + grow + leftover):
        print('    !!', pid, why)
sys.exit(0 if ok else 3)
