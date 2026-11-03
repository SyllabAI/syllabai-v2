#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-018: q27-b bare-caret micro-fix — fail-closed apply battery.

Operator order: "the q27-b bare-caret micro-fix" (discharges the standing lead of
record: run-017 dfeb0f0d "their q27-b problemMd bare caret queued for the owning
lane (no QP READ this session — NO-GUESS)" + 6c66180e "#429 bare-caret residual
... carried verbatim with the standing micro-fix lead").

Evidence of record (this session, eyes-on):
  QP 2026-06 4MB1-01R p24 (P74287A02424) @2.6x gray + 5x zoom crop:
    "(b) Show that x^2 + 2x - 80 = 0"  (true superscript, U+2212 minus in print)
  MS p36 @2.4x: (a) 360/(x+2) oe | (b) Eg 360x + 720 = 9x^2 + 18x + 360x,
    [9x^2 + 18x - 720 = 0]  -> consistent with x^2 + 2x - 80 = 0.
PDF text layer root cause: operators mapped to control glyphs U+001F/1E/1D in the
embedded font -> the #429 rebuild carried the bare caret + raw U+2212 outside math.

Fix manifest (EXACTLY ONE field):
  official-4mb1-01r-2026-06 / offp_2026-06_01r_27-b / problemMd
  OLD: 'Show that x^2 + 2x \u2212 80 = 0'      (bare caret, raw minus, no math span)
  NEW: 'Show that $x^2 + 2x - 80 = 0$'        (law-26 KaTeX, ASCII hyphen inside math;
                                               q23-a wage-table raw-$ problemMd precedent)
Mirror law N/A (problemMd edit; markPoints[0].textMd mirrors solutionMd, untouched).
C145 canary pin advanced (part_field_sha = sha256 of field utf-8, form reproduced
first-hand from the of-record pin 98f78f63...).
"""
import json, hashlib, copy, sys

PLANE = '/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json'
EVID = '/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-017/t3-corpus-reconcile-evidence.json'

SLUG = 'official-4mb1-01r-2026-06'
PID = 'offp_2026-06_01r_27-b'
FIELD = 'problemMd'
OLD = 'Show that x^2 + 2x \u2212 80 = 0'
NEW = 'Show that $x^2 + 2x - 80 = 0$'

def sha16(b): return hashlib.sha256(b).hexdigest()[:16]

raw = open(PLANE, 'rb').read()
before_sha = sha16(raw)
data = json.loads(raw)
snapshot = copy.deepcopy(data)
print('BEFORE sha16:', before_sha)

# locate
tgt = None
for s in data:
    if s['slug'] != SLUG: continue
    for q in s['questions']:
        for p in q['parts']:
            if p['id'] == PID:
                tgt = p
if tgt is None: print('GATE-0 FAIL: pid not found'); sys.exit(1)
if tgt.get(FIELD) != OLD:
    print('GATE-0 FAIL: current cell != manifest OLD; current =', repr(tgt.get(FIELD))); sys.exit(1)
tgt[FIELD] = NEW

gates = {}
def census(d):
    return (len(d),
            sum(len(s['questions']) for s in d),
            sum(len(q['parts']) for s in d for q in s['questions']),
            sum(p['marks'] for s in d for q in s['questions'] for p in q['parts']))

def marks_map(d):
    out = {}
    for s in d:
        for q in s.get('questions') or []:
            for p in q.get('parts') or []:
                mps = p.get('markPoints') or []
                out[p['id']] = (p.get('marks'), tuple((m.get('marks'), m.get('code')) for m in mps))
    return out

gates['census_EXACT'] = census(data) == (66, 1281, 2443, 6600)
gates['marks_map_identical'] = marks_map(data) == marks_map(snapshot)

bad = []
for s in data:
    for q in s.get('questions') or []:
        for p in q.get('parts') or []:
            txt = json.dumps([p.get('problemMd'), p.get('solutionMd')] +
                             [m.get('textMd') for m in (p.get('markPoints') or [])], ensure_ascii=False)
            if '\ufffd' in txt or any(0xE000 <= ord(c) <= 0xF8FF for c in txt):
                bad.append(p['id'])
gates['PUA_FFFD_0'] = not bad

# dollar parity on the edited field: replace \$ -> count $ must be even
n = (tgt[FIELD].replace('\\$', '').count('$'))
gates['dollar_parity'] = (n % 2 == 0)

changed = set()
for s_old, s_new in zip(snapshot, data):
    for q_old, q_new in zip(s_old['questions'], s_new['questions']):
        for p_old, p_new in zip(q_old['parts'], q_new['parts']):
            for f in ('problemMd', 'solutionMd'):
                if p_old.get(f) != p_new.get(f):
                    changed.add((p_old['id'], f))
            mp_o = (p_old.get('markPoints') or [{}])[0].get('textMd')
            mp_n = (p_new.get('markPoints') or [{}])[0].get('textMd')
            if mp_o != mp_n:
                changed.add((p_old['id'], 'markPoints[0].textMd'))
gates['changed_set_EXACT'] = changed == {(PID, FIELD)}

new_raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
gates['serialization_roundtrip'] = json.loads(new_raw) == data

scrub = json.dumps(data, ensure_ascii=False)
import re as _re
gates['scrub_assert'] = not _re.search(r'napi_|ghp_|vcp_|postgresql://[a-z0-9-]+\.neon\.tech', scrub)

print('GATES:', json.dumps(gates))
if not all(gates.values()):
    print('RED — no write'); sys.exit(1)

# write plane
open(PLANE, 'wb').write(new_raw)
after_sha = sha16(open(PLANE, 'rb').read())
print('AFTER sha16:', after_sha)

# C145 pin advance
evid = json.load(open(EVID))
pin = None
for p in evid['pins']:
    if p['id'] == 'C145-t3-sync-01R-27-b-problem_md':
        pin = p
if pin is None:
    print('PIN FAIL: C145 not found'); sys.exit(1)
old_pin_sha = pin['sha256']
new_field_sha = hashlib.sha256(NEW.encode()).hexdigest()
assert old_pin_sha == hashlib.sha256(OLD.encode()).hexdigest(), 'C145 pin was not pinning the OLD cell!'
pin['sha256'] = new_field_sha
pin['assertion'] = ('run-018 q27-b bare-caret micro-fix byte pin: offp_2026-06_01r_27-b problem_md == '
                    f'plane of record {after_sha} (C145 advanced by run-018; prior pin 98f78f63 pinned the '
                    '#429 bare-caret residual, discharged eyes-on QP p24 + MS p36); any re-extraction '
                    'symbol-loss regression trips this pin')
json.dump(evid, open(EVID, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'C145 advanced: {old_pin_sha[:12]} -> {new_field_sha[:12]}')
print('APPLY OK')
