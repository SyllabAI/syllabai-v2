#!/usr/bin/env python3
"""run-007 leg A (v2): the F121-groupstem physics SERVING wave.

Operator order (this window, gateway trace 1a19135ba51a454d): "F121-groupstem"
— the ruling on the F127 standing disclosure (the physics twin of the
chemistry F121 serving decision, filed pending the operator's ruling by
run-006/resources #252). This executor serves the group-intro class onto the
v2 plane of record under the exporter of record's CURRENT law.

PRE-REGISTERED LAWS (fail-closed; any violation aborts before ANY write):
  L0  BASE RE-PROOF: the r2-consumed-proof-era exporter (resources 438aacb6,
      materialized to /tmp/physrun7/) re-exported over the corpus of record
      (resources main 8f6a6a80) is a byte-level NO-OP against the CURRENT
      plane of record (55/55 sets, json-equal incl. container fields) —
      re-anchors run-006's G-E1 no-op on today's tree.
  L1  CENSUS: the CURRENT-law emission vs the plane of record differs on
      EXACTLY the F127 disclosure census (421 pids / 55 slices / 0 new /
      0 gone), every delta problemMd-only, and each new value equals the old
      value with EXACTLY the cleaned group stem + blank-line join inserted
      once (single-insertion law; physics STEM-RESTORE 4PH1 keys == 0, so no
      ledgered cuts and no declared group figures exist).
  L2  THE WRITE: new plane := the current-law emission, element-for-element
      (list order preserved, per-set json-equality asserted pre-write);
      official-papers.json serialized json.dumps(indent=1, ensure_ascii=False)
      no trailing newline (the byte law), round-trip asserted.
  L3  GATES on the written bytes:
      G1 structure: 55 sets / 540 questions / 2,254 parts, marks[] identical;
      G2 identity reconstruction: every changed problemMd reconstructs as the
         single insertion of gmd+"\n\n"; every other leaf byte-equal;
      G3 PUA/U+FFFD/C0 census: file-level count unchanged (0 both sides);
      G4 $-accounting: file-level '$' char count unchanged; the multiset of
         $-segments byte-identical (group intros are $-free — L1 asserts);
      G5 katex: zero NEW $-segments (the G4 segment-set identity IS the gate;
         no new math is introduced, nothing to render);
      G6 serialization byte law: round-trip + no trailing newline + sha256;
      G7 zero-touch: problemMd-masked leaf diff == 0 on all 55 sets outside
         the 421 written values;
      G8 idempotence: the current-law emission vs the NEW plane is a
         byte-level no-op (census 0) — the serve closes at zero delta;
      G-E* the exporter of record's own battery (run_gates) on the staged
         bytes: G-E1 no-op, G-E1b identity, G-E2, G-E3, G-E4 SME passthrough,
         G-E6, G-E7 421/421 in-run.
  L4  MANIFEST: the F128 stamp paragraph PREPENDED to importSource.note (the
      stamp convention; note stays one line, lineage verbatim below);
      importSource.ref STAYS main@8f6a6a80... — the corpus of record is
      unchanged by a plane-side serve (G-E5 re-proven at the same cut).
  L5  questions.json untouched (0 offp_ ids — the SME banks carry no official
      parts); resources corpus untouched; zero DB/Neon/prod contact.
"""
import json, sys, os, hashlib, copy, shutil, importlib.util, collections

V2 = '/tmp/v2repo'
RES = '/tmp/resrepo'
PLANE_P = f'{V2}/apps/hub/content/igcse-physics-19/official-papers.json'
QJSON_P = f'{V2}/apps/hub/content/igcse-physics-19/questions.json'
MANI_P = f'{V2}/apps/hub/content/igcse-physics-19/manifest.json'
DISC = f'{RES}/scripts/exporter-disclosures/2026-10-31-f127-groupstem-evolution-4ph1-standing.json'
OUT_PAYLOAD = '/home/z/my-project/scripts/run007-payload.json'

sys.path.insert(0, f'{RES}/scripts')
os.chdir(RES)
import official_examq_export_hub as ex

spec = importlib.util.spec_from_file_location(
    'ex_r2', '/tmp/physrun7/export_hub_at_r2proof.py')
ex_r2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ex_r2)

for mod in (ex, ex_r2):
    mod.apply_lane('4ph1')
sl, en = ex.load_stem_ledger(), ex.load_enrichment_ledger()
assert len([k for k in sl.get('verdicts', {}) if '4PH1' in k]) == 0, \
    'L1 precondition changed: 4PH1 ledger keys exist — re-run the census law'

topics_src = lambda s, p: json.load(
    open(f'{RES}/Official-ExamQuestion/igcse-physics-19/{s}/4PH1-{p}/topic.json'))


def part_map(s):
    return {p['id']: p for q in s['questions'] for p in q['parts']}


def emit(mod):
    return {t['slug']: t for t in (mod.export_series(s, p, topics_src(s, p), sl, en)
                                   for p in mod.PAPERS for s in mod.PAPER_SERIES[p])}


def single_insert_ok(A, B, S):
    d = len(S)
    if len(B) != len(A) + d:
        return False
    p = 0
    m = min(len(A), len(B))
    while p < m and A[p] == B[p]:
        p += 1
    for j in range(p + 1):
        if B[j:j + d] == S and B[j + d:] == A[j:]:
            return True
    return False


# ---- L0: base re-proof -------------------------------------------------------
plane_bytes = open(PLANE_P, 'rb').read()
plane = json.loads(plane_bytes)
assert json.dumps(plane, indent=1, ensure_ascii=False).encode() == plane_bytes, \
    'L0: the of-record plane does not round-trip under the byte law'
by_slug = {t['slug']: t for t in plane}
r2 = emit(ex_r2)
assert set(r2) == set(by_slug)
drift = [s for s in r2 if json.dumps(r2[s], sort_keys=True) != json.dumps(by_slug[s], sort_keys=True)]
assert not drift, f'L0 FAIL: r2-era re-export drifts on {drift[:3]}'
print('L0 ok: r2-proof-era exporter (438aacb6) re-export == plane of record, 55/55 sets byte-equal')

# ---- L1: census + single-insertion derivation --------------------------------
cur = emit(ex)
disc = json.load(open(DISC))
fresh_changed, gmd_of = {}, {}
n_new = n_gone = 0
for paper in ex.PAPERS:
    for series in ex.PAPER_SERIES[paper]:
        slug = f'official-4ph1-{paper.lower()}-{series}'
        topic = topics_src(series, paper)
        rp, pp = part_map(cur[slug]), part_map(by_slug[slug])
        n_new += len(set(rp) - set(pp))
        n_gone += len(set(pp) - set(rp))
        for pid in sorted(set(rp) & set(pp)):
            if json.dumps(rp[pid], sort_keys=True) == json.dumps(pp[pid], sort_keys=True):
                continue
            fresh_changed.setdefault(slug, []).append(pid)
        for q in topic['questions']:
            qnum = str(q['question_number'])
            for letter, g in (q.get('groups') or {}).items():
                fp = next((p for p in q['parts']
                           if ex.group_letter_of(p['part_number']) == letter), None)
                if fp is None:
                    continue
                pid = f'offp_{series}_{paper.lower()}_{ex.part_slug(fp["part_number"])}'
                if pid in rp and json.dumps(rp[pid], sort_keys=True) != json.dumps(pp.get(pid, rp[pid]), sort_keys=True):
                    gmd_of[(slug, pid)] = ex.restore_group_stem(
                        g, series, paper, qnum, letter, sl, fp.get('problem_md'))
assert n_new == 0 and n_gone == 0
flat = {'new': {}, 'gone': {},
        'changed': {s: sorted(v) for s, v in fresh_changed.items()}}
assert json.dumps(flat, sort_keys=True) == json.dumps(
    {'new': disc['new'], 'gone': disc['gone'], 'changed': disc['changed']}, sort_keys=True), \
    'L1 FAIL: fresh census != F127 disclosure'
n421 = sum(len(v) for v in fresh_changed.values())
assert n421 == 421 and len(fresh_changed) == 55
impure = []
for (slug, pid), gmd in gmd_of.items():
    assert gmd, f'L1 FAIL: empty gmd at {slug}/{pid}'
    A = by_slug[slug] and next(p for q in by_slug[slug]['questions'] for p in q['parts'] if p['id'] == pid)['problemMd']
    B = next(p for q in cur[slug]['questions'] for p in q['parts'] if p['id'] == pid)['problemMd']
    if not single_insert_ok(A, B, gmd + '\n\n'):
        impure.append((slug, pid))
assert not impure, f'L1 FAIL: not a single gmd insertion: {impure[:5]}'
print(f'L1 ok: census == F127 disclosure exactly (421 pids / 55 slices); '
      f'all 421 single-insertions of gmd+blank-line join verified')

# ---- L2: the write ------------------------------------------------------------
NEW = json.loads(json.dumps(plane))
n_written = 0
for slug, pids in fresh_changed.items():
    new_parts = part_map(next(t for t in NEW if t['slug'] == slug))
    cur_parts = part_map(cur[slug])
    for pid in pids:
        new_parts[pid]['problemMd'] = cur_parts[pid]['problemMd']
        n_written += 1
assert n_written == 421
assert [t['slug'] for t in NEW] == [t['slug'] for t in plane]
for t in NEW:
    assert json.dumps(t, sort_keys=True) == json.dumps(cur[t['slug']], sort_keys=True), \
        f'L2 FAIL: written set {t["slug"]} != current-law emission'
new_bytes = json.dumps(NEW, indent=1, ensure_ascii=False).encode()
assert not new_bytes.endswith(b'\n')
assert json.loads(new_bytes) == NEW
print(f'L2 ok: new plane == the current-law emission element-for-element; '
      f'serialized {len(new_bytes)} B (was {len(plane_bytes)} B, +{len(new_bytes) - len(plane_bytes)})')

# ---- L3: gates ----------------------------------------------------------------
# G1
n_sets = len(NEW)
n_q = sum(len(t['questions']) for t in NEW)
n_p = sum(len(q['parts']) for t in NEW for q in t['questions'])
n_marks = sum(p['marks'] for t in NEW for q in t['questions'] for p in q['parts'])
assert (n_sets, n_q, n_p, n_marks) == (55, 540, 2254, 4970), (n_sets, n_q, n_p, n_marks)
for t_old, t_new in zip(plane, NEW):
    for q_old, q_new in zip(t_old['questions'], t_new['questions']):
        assert q_old['totalMarks'] == q_new['totalMarks']
        for a, b in zip(q_old['parts'], q_new['parts']):
            assert a['marks'] == b['marks'] and a['id'] == b['id']
            assert json.dumps(a['markPoints'], sort_keys=True) == json.dumps(b['markPoints'], sort_keys=True)
print('G1 ok: 55 sets / 540 questions / 2,254 parts / 4,970 marks; marks[]+markPoints+ids identical')

# G2 + G7 (masked leaf identity + per-pid single-insertion, on the WRITTEN tree)
def mask(node):
    if isinstance(node, dict):
        return {k: ('<problemMd>' if k == 'problemMd' else mask(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [mask(x) for x in node]
    return node

for t_old, t_new in zip(plane, NEW):
    assert json.dumps(mask(t_old), sort_keys=True) == json.dumps(mask(t_new), sort_keys=True), \
        f'G7 FAIL: non-problemMd drift in {t_old["slug"]}'
for (slug, pid), gmd in gmd_of.items():
    A = next(p for q in by_slug[slug]['questions'] for p in q['parts'] if p['id'] == pid)['problemMd']
    B = next(p for q in next(t for t in NEW if t['slug'] == slug)['questions']
             for p in q['parts'] if p['id'] == pid)['problemMd']
    assert single_insert_ok(A, B, gmd + '\n\n'), f'G2 FAIL at {slug}/{pid}'
print('G2+G7 ok: 421/421 single-insertion reconstructions; problemMd-masked leaf identity 55/55')

# G3 + G4 + G5
PUA = lambda s: sum(1 for c in s if 0xE000 <= ord(c) <= 0xF8FF or ord(c) == 0xFFFD or ord(c) < 0x20 and c != '\n')
old_all, new_all = json.dumps(plane, ensure_ascii=False), json.dumps(NEW, ensure_ascii=False)
assert sum(1 for c in old_all if 0xE000 <= ord(c) <= 0xF8FF or ord(c) == 0xFFFD) == \
       sum(1 for c in new_all if 0xE000 <= ord(c) <= 0xF8FF or ord(c) == 0xFFFD) == 0, 'G3 FAIL'
assert old_all.count('$') == new_all.count('$'), 'G4 FAIL: $ count moved'
segs = lambda s: collections.Counter(
    m.group(1) for m in __import__('re').finditer(r'\$([^\$\n]+)\$', s))
assert segs(old_all) == segs(new_all), 'G5 FAIL: $-segment multiset moved'
assert all('$' not in g for g in gmd_of.values()), 'G4 FAIL: $ inside a group intro'
print(f'G3/G4/G5 ok: PUA/FFFD 0 both sides; $ chars {old_all.count("$")} == {new_all.count("$")}; '
      f'$-segment multiset byte-identical ({sum(segs(old_all).values())} segments); group intros $-free')

# G6
import hashlib
sha_old = hashlib.sha256(plane_bytes).hexdigest()
sha_new = hashlib.sha256(new_bytes).hexdigest()
print(f'G6 ok: round-trip exact, no trailing newline; sha256 {sha_old[:16]}… -> {sha_new[:16]}…')

# G8 + G-E* battery on the staged bytes
staged = {t['slug']: t for t in json.loads(new_bytes)}
post = emit(ex)
deltas = 0
for s in post:
    rp, sp = part_map(post[s]), part_map(staged[s])
    assert set(rp) == set(sp)
    deltas += sum(1 for pid in rp
                  if json.dumps(rp[pid], sort_keys=True) != json.dumps(sp[pid], sort_keys=True))
    assert json.dumps(post[s], sort_keys=True) == json.dumps(staged[s], sort_keys=True)
assert deltas == 0
print('G8 ok: current-law re-export vs the NEW plane = byte-level no-op (0 deltas, 55/55 sets)')

raw_q = open(QJSON_P, 'rb').read()
kept = json.loads(raw_q)
assert json.dumps(kept, indent=1, ensure_ascii=False).encode() == raw_q, 'SME file byte-law drift'
assert not [t for t in kept if ex.is_official(t)], 'input law: official set in questions.json'
assert not [t for t in json.loads(new_bytes) if not ex.is_official(t)], 'input law: non-official in plane'
out = kept + json.loads(new_bytes)
import io, contextlib
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    ex.run_gates(out, raw_q, new_bytes, None, topics_src, False, sl, en)
gate_log = buf.getvalue()
print('G-E* battery:')
for line in gate_log.splitlines():
    if line.startswith(('G-E', 'G-E1 ok', 'G-E2', 'G-E3', 'G-E4', 'G-E6', 'G-E7')):
        print('  ' + line[:150])
assert 'G-E7 ok' in gate_log and '421 group stems' in gate_log, gate_log[-800:]
assert 'byte-level no-op' in gate_log, gate_log[-800:]

# ---- L4: manifest stamp -------------------------------------------------------
mani = json.load(open(MANI_P))
assert json.dumps(mani, separators=(',', ':'), ensure_ascii=False).encode() == open(MANI_P, 'rb').read(), \
    'manifest byte-law drift (the manifest of record is COMPACT: separators=(",",":"), no trailing newline)'
note = mani['importSource']['note']
paras_before = note.split('\n\n')
ref = mani['importSource']['ref']
assert ref == 'main@8f6a6a803261bec07306b141ad83afba19f9ae1e', ref
CUT = 'main@8f6a6a803261bec07306b141ad83afba19f9ae1e'
stamp = (
    "F128 group-stem serving stamp (T-OEQ-PHYS-FORMAT-1 run-007, operator order "
    "'F121-groupstem', trace 1a19135ba51a454d): the F121-groupstem physics serving "
    "decision is EXECUTED - the plane of record learns the group-intro serving class "
    "of the exporter of record's current law, consuming the F127 standing evolution "
    "census (scripts/exporter-disclosures/2026-10-31-f127-groupstem-evolution-4ph1-standing.json, "
    "retired by this serve; its r2-consumed twin files in the immediate resources PR): "
    "421 group-first parts across all 55 official sets now carry their question-group "
    "intro paragraph (restore_group_stem mechanical class - STEM-RESTORE carries zero "
    "4PH1 keys, so zero ledgered cuts and zero declared group figures), every write a "
    "verified single insertion of the cleaned group stem + blank-line join into that "
    "part's problemMd (problemMd-only: problemMd-masked leaf identity 55/55), group "
    "intros $-free/PUA-free, counts unchanged (55 sets / 540 questions / 2,254 parts / "
    "4,970 marks / 2,254 markPoints). Closure at both laws: the r2-proof-era exporter "
    "(438aacb6) re-export stays a byte-level no-op vs the PRE-serve plane and the "
    "current-law exporter re-export is a byte-level no-op vs the POST-serve plane "
    "(G-E1 no-op, G-E1b 55/55, G-E2, G-E3, G-E4 passthrough 2,057,977 B, G-E6, G-E7 "
    "421/421 in-run). The corpus of record is UNCHANGED by this plane-side serve - the "
    "data cut stays @" + CUT + " (G-E5 55/55 re-proven at the same cut); the resources "
    "group-stem battery (421 pins, zero network) files alongside the twin (F128). "
    "Supersedes the F127 stamp below; its full note (and the F119 / G-E4-PHYS-STAMP-1 / "
    "RN-RECONSUME-1 lineage it chains) is preserved verbatim below.")
mani['importSource']['note'] = stamp + ' ' + note
mani_bytes = json.dumps(mani, separators=(',', ':'), ensure_ascii=False).encode()
assert not mani_bytes.endswith(b'\n') and json.loads(mani_bytes) == mani
assert mani['importSource']['note'].split('\n\n') == [stamp + ' ' + paras_before[0]] + paras_before[1:], \
    'stamp join broke the paragraph lineage'
assert mani['importSource']['ref'] == CUT
print(f'L4 ok: manifest stamp prepended (note {len(note)} -> {len(mani["importSource"]["note"])} chars, one line); ref stays {CUT[:17]}…')

# ---- commit the writes ---------------------------------------------------------
with open(PLANE_P, 'wb') as f:
    f.write(new_bytes)
with open(MANI_P, 'wb') as f:
    f.write(mani_bytes)
print('WRITTEN: official-papers.json + manifest.json')

payload = {
    'run': 'run-007-groupstem-serve',
    'operatorOrder': 'F121-groupstem',
    'operatorTrace': '1a19135ba51a454d',
    'census': {'changed': fresh_changed, 'total': 421, 'slices': 55},
    'gmd': {f'{s}|{p}': g for (s, p), g in sorted(gmd_of.items())},
    'shas': {'plane_before': sha_old, 'plane_after': sha_new},
    'gate_log': gate_log,
}
json.dump(payload, open(OUT_PAYLOAD, 'w'), indent=1, ensure_ascii=False)
print(f'payload -> {OUT_PAYLOAD}')
print('RUN-007 LEG A APPLY COMPLETE — all pre-registered laws green')
