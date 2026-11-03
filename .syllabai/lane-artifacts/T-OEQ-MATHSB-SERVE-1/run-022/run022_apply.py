#!/usr/bin/env python3
r"""T-OEQ-MATHSB-SERVE-1 run-022: F1-F3 structural repairs apply battery (fail-closed).
Clone of run-020/run-019/tranche-2 battery.

Scope of record (operator order trace 1a187e0b42de09c1 'F1-F3 structural repairs
(fused/foreign MS blocks — they shrink the trig bucket)'):
  F1  offp_2023-06_02_8   truncate to the genuine q8 block (p13/p14 anchored,
      closes 'Total 7 marks') + lockstep mirror; q9(b) portion re-homed
      verbatim to offp_2023-06_02_9-b (replaces stub; 0 mp rows, RATTACH
      solutionMd-only attach); q9(a) portion discarded per the run-020 F1
      filing (9-a carries its own rebuilt solution + 3 mp rows).
  F2  offp_2021-06_02_9-b truncate to the true 2-mark B1ft block (p16) +
      lockstep mirror; q10(b) MS block re-homed verbatim to
      offp_2021-06_02_10-b (replaces stub; 0 mp rows); q11(a) first-row
      fragment prepended verbatim to offp_2021-06_02_11-a + lockstep mirror
      (reunites the p25 row; pre-apply mp[0] carried 43 ch of tall-paren
      control-glyph variants vs solutionMd — lockstep normalization disclosed).
  F3  offp_2026-06_01r_18 NO-OP — the run-020 'raw duplicate of ALT1' is not
      present at any pin (C132 byte-match + pre-run-020 plane byte-match +
      zero duplicate signatures); receipt corrects the filing.

Gates:
  1  census_EXACT            66/1281/2443/6600 pre==post
  2  marks_map_identical     per-pid (marks, markPoints (marks,code)) identical
  3  PUA_FFFD_0              zero PUA/control/FFFD across scanned fields
  4  dollar_parity           edited fields raw-$ count even
  5  changed_set_EXACT       exactly the 5 solutionMd writes + 3 lockstep mirrors
  6  mirror_law_refined      edited parts with mp rows mirror byte-exact;
                             edited parts without mp rows stay 0-row
  7  serialization_roundtrip single-line compact JSON preserved
  8  scrub_assert            napi_/ghp_/vcp_/postgresql://neon.tech zero hits
  +  byte_decomposition      old fields reassemble EXACTLY from the new pieces
                             (zero byte loss/creation in the move)
  +  boundary_law            every print-anchored boundary signature present/absent
  +  stub_discharge          the 'not captured' stub absent from both attach targets
  +  moved_signatures        the moved blocks carry their p20/p24/p25/p14/p15
                             signatures in their new homes
Usage: run022_apply.py [--write]   (without --write: dry-run, no plane write)
"""
import json, re, sys, hashlib, importlib.util

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
LANE = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-022'

spec = importlib.util.spec_from_file_location('run022_boundaries', f'{LANE}/run022_boundaries.py')
run022_boundaries = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run022_boundaries)

WRITE = '--write' in sys.argv

raw = open(PLANE, 'rb').read()
before_sha = hashlib.sha256(raw).hexdigest()[:16]
EXPECT_BEFORE = 'f2cbe67ab7d24993'
if before_sha != EXPECT_BEFORE:
    sys.exit(f'FAIL plane pin: {before_sha} != {EXPECT_BEFORE}')
data = json.loads(raw)

index = {}
for si, s in enumerate(data):
    for qi, q in enumerate(s['questions']):
        for pi, p in enumerate(q['parts']):
            index[p['id']] = (si, qi, pi, s)

OPS, BOUNDARY_EV = run022_boundaries.build()

snapshot = json.loads(raw)
snap_index = {}
for s in snapshot:
    for q in s['questions']:
        for p in q['parts']:
            snap_index[p['id']] = p

def old_sol(pid):
    return snap_index[pid]['solutionMd']

# ---------------- apply (5 solutionMd writes + lockstep mirrors) ----------------
ATTACH_NO_MIRROR = {'offp_2023-06_02_9-b', 'offp_2021-06_02_10-b'}   # 0 mp rows by design
changed = set()
for pid, new in OPS.items():
    if pid not in index:
        sys.exit(f'FAIL: pid {pid} not in plane')
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    old = p['solutionMd']
    if old == new:
        sys.exit(f'FAIL: {pid} old==new (no-op edit refused)')
    p['solutionMd'] = new
    changed.add((pid, 'solutionMd'))
    if pid not in ATTACH_NO_MIRROR:
        mp = (p.get('markPoints') or [{}])[0]
        mp['textMd'] = new
        changed.add((pid, 'mirror'))

projection = []
for pid in sorted({p for p, f in changed}):
    si, qi, pi, s = index[pid]
    p_new = data[si]['questions'][qi]['parts'][pi]
    p_old = snap_index[pid]
    projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'solutionMd',
                       'old': p_old.get('solutionMd', ''), 'new': p_new.get('solutionMd', '')})
    if (pid, 'mirror') in changed:
        projection.append({'pid': pid, 'set': s['topicSlug'], 'field': 'markPoints[0].textMd',
                           'old': (p_old.get('markPoints') or [{}])[0].get('textMd', ''),
                           'new': (p_new.get('markPoints') or [{}])[0].get('textMd', '')})
json.dump(projection, open(f'{LANE}/run022_projection.json', 'w'), ensure_ascii=False, indent=1)

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
    if field != 'solutionMd':
        continue
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    txt = p.get('solutionMd') or ''
    n = txt.replace('\\$', '').count('$')
    if n % 2:
        dollar_bad.append(pid)
gates['dollar_parity'] = not dollar_bad

expected_changed = {(pid, 'solutionMd') for pid in OPS} | \
                   {(pid, 'mirror') for pid in OPS if pid not in ATTACH_NO_MIRROR}
gates['changed_set_EXACT'] = changed == expected_changed

mirror_bad, zerorow_bad = [], []
for pid in OPS:
    si, qi, pi, s = index[pid]
    p = data[si]['questions'][qi]['parts'][pi]
    if pid in ATTACH_NO_MIRROR:
        if p.get('markPoints'):
            zerorow_bad.append(pid)
    else:
        if not p.get('markPoints') or p['markPoints'][0].get('textMd') != p.get('solutionMd'):
            mirror_bad.append(pid)
gates['mirror_law_refined'] = not mirror_bad and not zerorow_bad

new_raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
gates['serialization_roundtrip'] = json.loads(new_raw) == data

scrub_txt = new_raw.decode('utf-8')
scrub_hits = [pat for pat in ('napi_', 'ghp_', 'vcp_', 'postgresql://neon.tech') if pat in scrub_txt]
gates['scrub_assert'] = not scrub_hits

# ---- run-022 specific: byte decomposition (zero byte loss/creation) ----
dec_bad = []
try:
    q8_old = old_sol('offp_2023-06_02_8')
    q8_new = snap_new = None
    si, qi, pi, s = index['offp_2023-06_02_8']
    q8_new = data[si]['questions'][qi]['parts'][pi]['solutionMd']
    nb_2023 = data[index['offp_2023-06_02_9-b'][0]]['questions'][index['offp_2023-06_02_9-b'][1]]['parts'][index['offp_2023-06_02_9-b'][2]]['solutionMd']
    i = q8_old.index('\n9(a) ')
    tail = q8_old[i + 1:]
    j = tail.index('\n( 2 x \u2212 3) 5 B1')
    if q8_old != q8_new + '\n' + tail[:j] + '\n' + nb_2023:
        dec_bad.append('F1:q8/9a/9b')
except Exception as e:
    dec_bad.append(f'F1:{e}')
try:
    p9b_old = old_sol('offp_2021-06_02_9-b')
    nb_2021 = data[index['offp_2021-06_02_9-b'][0]]['questions'][index['offp_2021-06_02_9-b'][1]]['parts'][index['offp_2021-06_02_9-b'][2]]['solutionMd']
    n10b = data[index['offp_2021-06_02_10-b'][0]]['questions'][index['offp_2021-06_02_10-b'][1]]['parts'][index['offp_2021-06_02_10-b'][2]]['solutionMd']
    n11a = data[index['offp_2021-06_02_11-a'][0]]['questions'][index['offp_2021-06_02_11-a'][1]]['parts'][index['offp_2021-06_02_11-a'][2]]['solutionMd']
    k = p9b_old.index('\nFB = 9.8')
    blob = p9b_old[k + 1:]
    m = blob.rindex('24.0466585\u2026')
    nl = blob.index('\n', m)
    if p9b_old != nb_2021 + '\n' + blob[:nl] + '\n' + blob[nl + 1:]:
        dec_bad.append('F2:9b/q10b/q11frag')
    if n11a != blob[nl + 1:] + '\n' + old_sol('offp_2021-06_02_11-a'):
        dec_bad.append('F2:11a-prepend')
    if n10b != blob[:nl]:
        dec_bad.append('F2:10b-rehome')
except Exception as e:
    dec_bad.append(f'F2:{e}')
gates['byte_decomposition'] = not dec_bad

# ---- boundary law (print-anchored signatures) ----
def get_new(pid):
    si, qi, pi, s = index[pid]
    return data[si]['questions'][qi]['parts'][pi]['solutionMd']

bl = []
q8n = get_new('offp_2023-06_02_8')
if not q8n.endswith('Total 7 marks'): bl.append('q8-close')
if '9(a) ' in q8n or '( 2 x \u2212 3) 5 B1' in q8n: bl.append('q8-fused-residue')
if not q8n.startswith('\u2220ABC = 90\u00b0 7 M1 using circle theorem'): bl.append('q8-head-p13')
nb23 = get_new('offp_2023-06_02_9-b')
if not nb23.startswith('( 2 x \u2212 3) 5 B1 ( 2 x \u2212 3) seen or used'): bl.append('9b2023-head-p14')
if not nb23.endswith('ignore subsequent changes to decimal form if exact form seen'): bl.append('9b2023-close-p15')
if 'ALT' not in nb23: bl.append('9b2023-alt')
nb21 = get_new('offp_2021-06_02_9-b')
if nb21.count('B1ft') != 2: bl.append('9b2021-b1ft-count')
if 'FB = 9.8' in nb21 or 'Case 2' in nb21: bl.append('9b2021-blob-residue')
n10b = get_new('offp_2021-06_02_10-b')
if not n10b.startswith('FB = 9.8'): bl.append('10b-head-p20')
if not n10b.endswith('24.0466585\u2026'): bl.append('10b-close-p24')
if 'Method II: Finding BD or AB using trigonometry' not in n10b: bl.append('10b-method2')
if 'M1 for calculating AC or AB' in n10b: bl.append('10b-q11-fragment-leak')
n11a = get_new('offp_2021-06_02_11-a')
if not n11a.startswith('M1 for calculating AC or AB - note that use of cosine rule'): bl.append('11a-fragment-head-p25')
gates['boundary_law'] = not bl

# ---- stub discharge ----
STUB = run022_boundaries.STUB
gates['stub_discharge'] = STUB not in nb23 and STUB not in n10b

# ---- moved signatures present in new homes ----
ms = []
for sig, pid in [('AB "9.8"\u2212 3 M1 setting up correct sine rule formula', 'offp_2021-06_02_10-b'),
                 ('AD2 \u2212 (6cos129) AD \u2212 61.56 = 0', 'offp_2021-06_02_10-b'),
                 ('In essence for Method II', 'offp_2021-06_02_10-b'),
                 ('4 AB 2 = AC 2 + 82 \u2212 2 ( 8)( AC ) cos 35', 'offp_2021-06_02_11-a'),
                 ('4 x 2 \u00b1 nx \u2212 2 M1 for a quadratic with any value of n seen', 'offp_2023-06_02_9-b'),
                 ('3 \u00b1 41 A1wr dep on B1 and 2 M awarded', 'offp_2023-06_02_9-b'),
                 ('M1 dep on the 1st M1 for correctly solving their 3 term quadratic', 'offp_2023-06_02_9-b'),
                 ('8x2 \u2212 6 x \u2212 4 A1 allow multiples eg 4 x\u00b2 \u2212 3x \u2212 2', 'offp_2023-06_02_9-b')]:
    if sig not in get_new(pid):
        ms.append((pid, sig[:40]))
gates['moved_signatures'] = not ms

# ---- katex segments census on edited fields (no new spans introduced) ----
def seg_count(t):
    return len(re.findall(r'(?<!\\)\$[^$]+\$', t or ''))
seg_bad = []
for pid in OPS:
    old_n = seg_count(old_sol(pid))
    new_n = seg_count(get_new(pid))
    if new_n != old_n:
        seg_bad.append((pid, old_n, new_n))
gates['katex_spans_unchanged'] = not seg_bad

after_sha = hashlib.sha256(new_raw).hexdigest()[:16]

print(f'plane: {before_sha} -> {after_sha}')
print(f'changed fields: {sorted(changed)}')
for f, g in gates.items():
    print(f'  {f}: {"GREEN" if g else "RED"}')
if not all(gates.values()):
    print('boundary evidence:', json.dumps(BOUNDARY_EV))
    for bad_ in (dec_bad, bl, ms, seg_bad):
        if bad_: print('  detail:', bad_)
ok = all(gates.values())
if WRITE and ok:
    open(PLANE, 'wb').write(new_raw)
    print(f'WRITTEN: {PLANE} ({after_sha})')
elif WRITE:
    print('WRITE REFUSED — gates RED')
sys.exit(0 if ok else 3)
