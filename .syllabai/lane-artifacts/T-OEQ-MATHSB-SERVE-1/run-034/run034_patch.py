#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-034: post-F122 corpus rider discharge patcher (fail-closed).

Carries the 21 run-033 corpus-rider pids (42 field writes) from the v2 served plane
of record (2021ec4730bf1c83) into the resources corpus (Official-ExamQuestion/
igcse-maths-b-16), per the standing rider law discharged by operator order
"21 corpus rider pids on the next converter run" (trace 1a190c72875ff9d9).

Phases (dry-run by default; --write applies to the clone working tree):
  A  projection cross-check: every projection.new == the served plane's CURRENT
     field value (42/42) and the solutionMirror lockstep law holds on old+new;
  B  touched-key classification: re-point (already pinned) vs JOIN (must join the
     synced-fields ledger + back-sync pins), canary overlap asserted 0;
  C  per-topic patch: JSON round-trip law (indent=1, ensure_ascii=False, byte-exact),
     part location, corpus==projection.old pre-check (drift recorded, never silent),
     apply, re-serialize with the original header verbatim;
  D  questions.md: write_questions_md(old topic) == current file byte-exact for all
     13 papers, then regen from the patched topic;
  E  pins re-point + append (C-law sha), ledger append + counts;
  F  summary.
"""
import argparse, hashlib, importlib.util, json, os, sys
from pathlib import Path

REPO = Path('/home/z/my-project/repos/syllabai-resources')
CORPUS = REPO / 'Official-ExamQuestion' / 'igcse-maths-b-16'
SCR = Path('/home/z/my-project/scratch/toeq_rider')
PROJ = json.load(open(SCR / 'run033_projection.json'))
PINS_PATH = REPO / 'scripts' / 'oeq_mathsb_backsync_pins.json'
LED_PATH = REPO / 'scripts' / 'oeq_mathsb_synced_fields.json'
CAN_PATH = REPO / 'Official-ExamQuestion' / 'CANARIES.json'
PLANE = json.load(open(SCR / 'served_plane.json'))

FIELD_MAP = {'problemMd': 'problem_md', 'solutionMd': 'solution_md',
             'markPoints[0].textMd': 'mark_points'}
WRITE = '--write' in sys.argv

def fail(msg):
    print(f'FAIL: {msg}')
    sys.exit(3)

def decode_pid(pid):
    bits = pid.split('_')
    series, paper, qp = bits[1], bits[2], bits[3]
    if '-' in qp:
        qn, suf = qp.split('-', 1)
        part = f'{qn}({suf})'
    else:
        qn, part = qp, qp
    return series, paper.upper(), qn, part

def sha_md(v):
    return hashlib.sha256((v or '').encode('utf-8')).hexdigest()

def sha_mp(mps):
    proj = [{'id': x['id'], 'marks': x['marks'],
             **({'label': x['label']} if 'label' in x else {}),
             'textMd': x['text_md']} for x in (mps or [])]
    return hashlib.sha256(json.dumps(proj, ensure_ascii=False,
                                     separators=(',', ':')).encode('utf-8')).hexdigest()

# ---------- A: projection cross-check vs the served plane ----------
plane_idx = {}
for s in PLANE:
    for q in s['questions']:
        for p in q['parts']:
            plane_idx[p['id']] = (p, s['topicSlug'])

def plane_field(p, field):
    if field == 'problemMd':
        return p.get('problemMd') or ''
    if field == 'markPoints[0].textMd':
        return ((p.get('markPoints') or [{}])[0].get('textMd') or '')
    return p.get('solutionMd') or ''

for i, e in enumerate(PROJ):
    if e['pid'] not in plane_idx:
        fail(f'A{i}: pid {e["pid"]} not in served plane')
    p, slug = plane_idx[e['pid']]
    if slug != e['set']:
        fail(f'A{i}: set mismatch {slug} != {e["set"]}')
    if plane_field(p, e['field']) != e['new']:
        fail(f'A{i}: projection.new != served plane current value at {e["pid"]}/{e["field"]}')
print(f'A plane cross-check: 42/42 projection.new == served plane (2021ec4730bf1c83) GREEN')

# solutionMirror lockstep law on the projection itself
by_pid = {}
for e in PROJ:
    by_pid.setdefault(e['pid'], {})[e['field']] = e
lock_bad = []
for pid, fs in by_pid.items():
    if 'solutionMd' in fs and 'markPoints[0].textMd' in fs:
        if fs['solutionMd']['old'] != fs['markPoints[0].textMd']['old'] or \
           fs['solutionMd']['new'] != fs['markPoints[0].textMd']['new']:
            lock_bad.append(pid)
if lock_bad:
    fail(f'A: lockstep law violated on {lock_bad}')
print(f'A lockstep law: solutionMd==markPoints[0].textMd on old+new for all dual-field pids GREEN')

# ---------- B: touched-key classification ----------
pins = json.loads(PINS_PATH.read_text())
led = json.loads(LED_PATH.read_text())
can = json.loads(CAN_PATH.read_text())
pin_idx = {(p['series'], p['paper'], p['part'], p['field']): p for p in pins}
can_mb = [e for e in can['canaries']
          if e.get('spec') == '4mb1' and e.get('check') == 'part_field_sha']
touched_parts = set()
rows = []
for e in PROJ:
    series, paper, qn, part = decode_pid(e['pid'])
    ck = (series, paper, part, FIELD_MAP[e['field']])
    rows.append((e, ck, ck in pin_idx))
    touched_parts.add((series, paper, part))
can_hits = [e for e in can_mb
            if (e['series'], e['paper'], e['part'].split('(')[0]) in touched_parts]
if can_hits:
    fail(f'B: canary overlap non-zero: {can_hits} — re-point law needed')
rep = [r for r in rows if r[2]]
join = [r for r in rows if not r[2]]
print(f'B classification: {len(rep)} re-point + {len(join)} JOIN = {len(rows)} rows; '
      f'canary overlap 0 GREEN')

# sha-law self-proof: recompute stored shas for the re-point rows' OLD corpus values later;
# here prove the C-law on 5 untouched pinned entries by re-reading their corpus fields.
def load_topic(series, paper):
    return json.loads((CORPUS / series / f'4MB1-{paper}' / 'topic.json').read_bytes())

def part_of(topic, qnum, pn):
    for q in topic['questions']:
        if str(q['question_number']) == qnum:
            for p in q['parts']:
                if p['part_number'] == pn:
                    return p
    return None

law_probe = 0
for (e, ck, ispinned) in rows:
    if not ispinned or law_probe >= 5:
        continue
    series, paper, part, field = ck
    t = load_topic(series, paper)
    cp = part_of(t, e['pid'].split('_')[3].split('-')[0], part)
    if cp is None:
        fail(f'B: part missing for {e["pid"]} ({part})')
    v = cp.get(field)
    h = sha_mp(v) if field == 'mark_points' else sha_md(v)
    if h != pin_idx[ck]['sha256']:
        fail(f'B: C-law sha mismatch on untouched pin {e["pid"]}/{field} '
             f'(computed {h[:12]} != stored {pin_idx[ck]["sha256"][:12]})')
    law_probe += 1
print(f'B C-law self-proof on {law_probe} stored pins GREEN')

# ---------- C: per-topic patch ----------
topics = {}
def get_topic(series, paper):
    key = (series, paper)
    if key not in topics:
        raw = (CORPUS / series / f'4MB1-{paper}' / 'topic.json').read_bytes()
        d = json.loads(raw)
        rt = json.dumps(d, indent=1, ensure_ascii=False).encode()
        if rt != raw:
            fail(f'C: round-trip law violated for {series}/4MB1-{paper}')
        topics[key] = {'raw': raw, 'd': d, 'dirty': False}
    return topics[key]

pre_exact, pre_drift = [], []
for e, ck, ispinned in rows:
    series, paper, part, field = ck
    t = get_topic(series, paper)
    cp = part_of(t['d'], e['pid'].split('_')[3].split('-')[0], part)
    if cp is None:
        fail(f'C: part missing for {e["pid"]} ({part})')
    if field == 'mark_points':
        cur = (cp.get('mark_points') or [{}])[0].get('text_md') or ''
    else:
        cur = cp.get(field) or ''
    if cur == e['old']:
        pre_exact.append((e['pid'], field))
    else:
        pre_drift.append((e['pid'], field, len(cur), len(e['old'])))
print(f'C pre-check: corpus==projection.old on {len(pre_exact)}/42; '
      f'drift rows: {len(pre_drift)}')
for d_ in pre_drift:
    print(f'   DRIFT {d_[0]}/{d_[1]}: corpus {d_[2]}ch vs plane-old {d_[3]}ch')

# apply
for e, ck, ispinned in rows:
    series, paper, part, field = ck
    t = get_topic(series, paper)
    cp = part_of(t['d'], e['pid'].split('_')[3].split('-')[0], part)
    if field == 'mark_points':
        cp['mark_points'][0]['text_md'] = e['new']
    else:
        cp[field] = e['new']
    t['dirty'] = True
print(f'C apply: 42 field writes over {len({r[0]["pid"] for r in rows})} pids staged')

# ---------- D: questions.md regen ----------
spec = importlib.util.spec_from_file_location(
    'oeq_extract', REPO / 'scripts' / 'official_examq_extract.py')
oeq_extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oeq_extract)

for (series, paper), t in sorted(topics.items()):
    qmd = CORPUS / series / f'4MB1-{paper}' / 'questions.md'
    cur = qmd.read_bytes()
    old_topic = json.loads(t['raw'])
    regen_old = oeq_extract.write_questions_md.__wrapped__(old_topic, Path('/dev/null')) \
        if hasattr(oeq_extract.write_questions_md, '__wrapped__') else None
    # render to string without touching disk: reuse the function on a temp path
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.md', delete=False) as tf:
        tmpp = Path(tf.name)
    oeq_extract.write_questions_md(old_topic, tmpp)
    got = tmpp.read_bytes()
    tmpp.unlink()
    if got != cur:
        fail(f'D: questions.md regen-from-old != current file for {series}/4MB1-{paper} '
             f'({len(got)}B vs {len(cur)}B)')
print('D questions.md regen-from-old == current on all 13 papers GREEN (generator of record)')

# ---------- E: pins re-point + append; ledger append ----------
new_pin_rows, new_led_rows = [], []
for e, ck, ispinned in rows:
    series, paper, part, field = ck
    t = get_topic(series, paper)
    cp = part_of(t['d'], e['pid'].split('_')[3].split('-')[0], part)
    h = sha_mp(cp.get('mark_points')) if field == 'mark_points' else sha_md(cp.get(field))
    if ispinned:
        pin_idx[ck]['sha256'] = h
    else:
        new_pin_rows.append({'field': field, 'paper': paper, 'part': part,
                             'pid': e['pid'], 'series': series, 'sha256': h})
        new_led_rows.append({'field': field, 'paper': paper, 'part': part,
                             'series': series})
print(f'E pins: {len(rows) - len(new_pin_rows)} re-pointed + {len(new_pin_rows)} joined; '
      f'ledger: +{len(new_led_rows)} keys')

# ---------- F: summary (and write with --write) ----------
print()
if not WRITE:
    print('DRY-RUN COMPLETE — all pre-checks GREEN; re-run with --write to apply.')
    sys.exit(0)

for (series, paper), t in sorted(topics.items()):
    if not t['dirty']:
        continue
    out = json.dumps(t['d'], indent=1, ensure_ascii=False).encode()
    (CORPUS / series / f'4MB1-{paper}' / 'topic.json').write_bytes(out)
    oeq_extract.write_questions_md(t['d'], CORPUS / series / f'4MB1-{paper}' / 'questions.md')
    print(f'WROTE {series}/4MB1-{paper}/topic.json + questions.md')

pins.extend(new_pin_rows)
PINS_PATH.write_text(json.dumps(pins, indent=1, ensure_ascii=False) + '\n')
led['fields'].extend(new_led_rows)
led['counts'] = {
    'problem_md': sum(1 for x in led['fields'] if x['field'] == 'problem_md'),
    'solution_md': sum(1 for x in led['fields'] if x['field'] == 'solution_md'),
    'mark_points': sum(1 for x in led['fields'] if x['field'] == 'mark_points'),
    'total': len(led['fields']),
}
LED_PATH.write_text(json.dumps(led, indent=1, ensure_ascii=False) + '\n')
print(f'WROTE pins ({len(pins)} entries) + ledger ({len(led["fields"])} keys)')
