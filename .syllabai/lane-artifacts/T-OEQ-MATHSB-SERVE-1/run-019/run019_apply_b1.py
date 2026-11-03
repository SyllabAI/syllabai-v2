#!/usr/bin/env python3
r"""T-OEQ-MATHSB-SERVE-1 run-019: B1 follow-up wave apply battery (fail-closed).
Clone of tranche-2/run-018 battery. 82 eyes-on-adjudicated fixes, 20 pids,
38 field writes (8 problemMd + 15 solutionMd + 15 mirrored markPoints[0]).

Gates:
  1  census_EXACT            66/1281/2443/6600 pre==post
  2  marks_map_identical     per-pid (marks, markPoints (marks,code)) map identical
  3  PUA_FFFD_0              zero PUA/control/FFFD across scanned fields
  4  dollar_parity           edited fields raw-$ count even (\\$ class untouched)
  5  changed_set_EXACT       exactly the declared 38 (pid, field) writes
  6  mirror_law              markPoints[0].textMd == solutionMd post-apply
  7  serialization_roundtrip single-line compact JSON preserved
  8  scrub_assert            napi_/ghp_/vcp_/postgresql://neon.tech zero hits
  +  B1_post_census_zero    fleet-wide bare-caret census == 0 after apply
  +  katex_gate             100 new spans throwOnError GREEN (katex 0.16.47)
  +  render_gate            projected fields through actual hub pipeline GREEN
Usage: run019_apply_b1.py [--write]   (without --write: dry-run, no plane write)
"""
import json, re, sys, os, hashlib, subprocess, unicodedata

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
SCR = '/home/z/my-project/scripts'
GATE = '/home/z/my-project/scratch/pp_4mb1_b1/gate'
sys.path.insert(0, SCR)
from run019_fixes import FIXES

WRITE = '--write' in sys.argv

raw = open(PLANE, 'rb').read()
before_sha = hashlib.sha256(raw).hexdigest()[:16]
EXPECT_BEFORE = '5fe3af48816d260b'
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
projection = []
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
    if exp == 1:
        newtxt = txt.replace(old, new, 1)
    else:
        newtxt = txt.replace(old, new)
    if newtxt != txt:
        set_field(p, which, newtxt)
        changed.add((pid, 'problemMd' if which == 'problem' else 'solutionMd'))
    per_fix.append({'fix': i, 'pid': pid, 'field': which, 'applied': newtxt != txt})

# projection AFTER mirror (mirror inside set_field) — capture old/new per written field
# rebuild old texts from snapshot for the render gate
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

json.dump(projection, open(f'{SCR}/run019_projection.json', 'w'), ensure_ascii=False, indent=1)

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
# law of record (run-018): markPoints[0].textMd mirrors solutionMd FOR EDITED parts;
# fleet-wide the pre-state legitimately carries non-mirroring parts (331) — untouched.
for (pid, field) in changed:
    if field != 'solutionMd':
        continue
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    mp = (p.get('markPoints') or [{}])
    if not p.get('markPoints') or p['markPoints'][0].get('textMd') != p.get('solutionMd'):
        mirror_bad.append(pid)
gates['mirror_law'] = not mirror_bad

new_raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
gates['serialization_roundtrip'] = json.loads(new_raw) == data

scrub_txt = new_raw.decode('utf-8')
scrub_hits = [pat for pat in ('napi_', 'ghp_', 'vcp_', 'postgresql://neon.tech') if pat in scrub_txt]
gates['scrub_assert'] = not scrub_hits

# B1 post-census: zero bare carets outside math, fleet-wide
RE_MARKLABEL = re.compile(r'\*\*[A-Z]\d+\*\*|\b4MB1\b')
def strip_math(t):
    t = re.sub(r'\$[^$]*\$', ' ', t)
    t = re.sub(r'\\\$[^$]*\\\$', ' ', t)
    return RE_MARKLABEL.sub(' ', t)
b1_left = []
for s in data:
    for q in s['questions']:
        for p in q['parts']:
            for k in ('problemMd', 'solutionMd'):
                if p.get(k) and '^' in strip_math(p[k]):
                    b1_left.append((p['id'], k))
            for mp in (p.get('markPoints') or []):
                if mp.get('textMd') and '^' in strip_math(mp['textMd']):
                    b1_left.append((p['id'], 'mp'))
gates['B1_post_census_zero'] = not b1_left

after_sha = hashlib.sha256(new_raw).hexdigest()[:16]

# katex gate + render gate via bun subprocesses
kg = subprocess.run(['bun', f'{SCR}/run019_katex_gate.mjs'], capture_output=True, text=True, cwd=GATE)
gates['katex_gate'] = (kg.returncode == 0)
rg = subprocess.run(['bun', f'{SCR}/run019_render_gate.mjs'], capture_output=True, text=True, cwd=GATE)
gates['render_gate'] = (rg.returncode == 0)

ALLGREEN = all(gates.values())
print('BEFORE sha16:', before_sha, '(expected', EXPECT_BEFORE + ')', 'OK' if before_sha == EXPECT_BEFORE else 'MISMATCH')
print('AFTER  sha16:', after_sha)
print('field writes:', len(projection), ' fixes applied:', sum(1 for f in per_fix if f['applied']), '/', len(FIXES))
if b1_left: print('B1 leftovers:', b1_left[:5])
if scrub_hits: print('SCRUB HITS:', scrub_hits)
print('katex_gate stdout:', kg.stdout.strip()[-200:] if kg.stdout else kg.stderr.strip()[-200:])
print('render_gate stdout:', rg.stdout.strip()[-200:] if rg.stdout else rg.stderr.strip()[-200:])
print('GATES:', json.dumps(gates))
print('VERDICT:', 'ALLGREEN' if ALLGREEN else 'RED')

if ALLGREEN and WRITE:
    open(PLANE, 'wb').write(new_raw)
    print(f'WROTE plane: {PLANE} ({len(new_raw)} bytes)')
elif ALLGREEN:
    print('DRY-RUN: all gates green, plane NOT written (pass --write)')
else:
    print('RED: plane NOT written')
    sys.exit(3)
