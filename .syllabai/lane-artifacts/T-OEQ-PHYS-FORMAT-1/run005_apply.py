#!/usr/bin/env python3
"""T-OEQ-PHYS-FORMAT-1 run-005 - human page-read wave over the stay-residual targets.

Operator order: "the 3 human-page-read residuals" (executes run-004's standingDebt
item 3 verbatim: "the 3 stay-residual targets need human page-read eyes").

LAW OF THE PASS (pre-registered; extends run-001..004's):
- L1 (page decides): every verdict issued from a page-image READ of the QP of
  record (SyllabAI/syllabai-pastpapers archive, sparse clone) - the eyes layer -
  corroborated by PyMuPDF span geometry (text, size, baseline origin y). Eyes
  primary; spans corroborating. This is the human layer run-004 stood up the
  debt for; the engine's bare-window consensus does not adjudicate here.
- L2 (in-place geometry): present glyphs repositioned into their page geometry
  under run-002's Unicode law (SUP/SUB maps imported verbatim). No reordering
  of existing corpus glyphs, ever.
- L3 (page-evidenced insertion - FIRST USE, pre-registered allow-list): glyphs
  printed on the page but absent from the corpus text may be inserted ONLY
  within the contiguous equation token run, ONLY at their page position, ONLY
  when the whole equation is then Unicode-representable, ONLY with per-glyph
  page evidence. Vector-art glyphs qualify only when insertion needs NO
  reordering: the 2022 arrow slots between Th and Rn (allow-listed); the 2025
  sqrt would force fraction re-linearization (a reorder) so its line closes.
- L4 (no mixed restorations - the restitution precedent, upheld): a formula
  containing any token unrepresentable in the field's convention closes
  UNRESTORED with evidence. 2026: no Unicode subscript y / z exists and
  problemMd carries no $-segments (0 corpus-wide, verified at open), so the
  KaTeX route would be a corpus-convention change, not a format restoration.
- L5 (alphabet extension, pre-registered and disclosed): U+208B subscript-minus
  joins the inverse map for the restored line only (page span: sub row y=343.48
  under sup 0, size 12.83; run-002's SUB map carries digits only). Idempotence
  and identity gates account for it.

GATES (fail-closed, abort before any write):
G1 structure + marks identical. G2 composed identity: strip the insertion
allow-list from the after-segment, invert through run-002's SUP/SUB maps plus
the U+208B extension, apply run-001's dash normalization, compare
space-insensitively to the denormalized before-segment. G3 PUA/control/U+FFFD
delta 0. G4 raw-$ and $-line counts unchanged (460 / 230 expected). G5 katex
0.16.23 throwOnError over every $-segment; segment set byte-identical to base.
G6 serialization byte-law (indent=1, ensure_ascii=False, no trailing newline)
round-trip. G7 changed line $-free on both sides; pre-existing segments
byte-identical. G8 idempotence (re-apply changes nothing) + per-line SUSPECT
classification deltas reported for the changed line.

Usage: run005_apply.py --dry | --apply
"""
import json, re, sys, subprocess, collections

P = '/tmp/v2repo/apps/hub/content/igcse-physics-19/official-papers.json'
REPO = '/tmp/v2repo'
KATEX_JS = '/tmp/ktx/node_modules/katex'
SPANS = '/tmp/run005_spans.json'
PAYLOAD = REPO + '/.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1/run005-payload.json'

sys.path.insert(0, REPO + '/.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1')
from phys_s1_restore import SUP, SUB          # run-002 maps of record, verbatim
from phys_katex_pass import denorm            # run-001 denorm of record, verbatim
from run004_engine import SUSPECT             # classifier of record, verbatim

SUBMINUS = '\u208b'                            # L5 alphabet extension
INV = {v: k for k, v in SUP.items()}
INV.update({v: k for k, v in SUB.items()})
INV[SUBMINUS] = '\u2212'

# ---------------------------------------------------------------- verdict ledger
TARGETS = [
 {
  'id': 'V1',
  'slug': 'official-4ph1-1p-2022-06', 'kind': 'qp',
  'where': 'official-4ph1-1p-2022-06|offq_2022-06_1p_5|p2|problemMd',
  'receipt_role': 'stay-residual #1 of run-004 (nuclear decay equation line)',
  'page_of_record': 'past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2022-06/4PH1-1P/qp.pdf p13',
  'eyes': 'display equation is full nuclear notation: sup 232 / sub 90 / Th -> '
          'sup 220 / sub 86 / Rn + dashed-box sup 4 sub 2 alpha + dashed-box sup 0 '
          'sub -1 beta; prose "thorium-232"/"radon-220" flat (hyphen notation); '
          'arrow present as vector art (no text span - text layer carries only the '
          'gap span at x=216.8); prose isotope instances stay flat',
  'verdict': 'RESTORE',
  'before_seg': '232 Th 220 Rn + 4 \u03b1 + 0 \u22121 \u03b2',
  'repositioned': ['232->sup', '220->sup', '4->sup', '0->sup', '-1->sub (sub row y=343.48, U+2212->U+208B per L5)'],
  'insertions': [
    {'g': '\u2089\u2080', 'evidence': 'span "90" size 12.83 y=343.48 x=122.5 (sub row under sup 232 at x=115.8)'},
    {'g': '\u2088\u2086', 'evidence': 'span "86" size 12.83 y=343.48 x=237.2 (sub row under sup 220 at x=230.8)'},
    {'g': '\u2082', 'evidence': 'span "2" size 12.83 y=343.48 x=353.4 (sub row under sup 4 at x=353.2)'},
    {'g': '\u2192', 'evidence': 'vector-art arrow between Th and Rn terms; page-image-evidenced; '
              'insertion needs no reordering (L3), unlike the 2025 sqrt'},
  ],
  'space_artifacts_dropped': ['stack-separator space after the 232/220 digit runs (page-flush stack adjacency; absorbed by the space-insensitive G2 comparison)'],
  'alphabet_extension': 'U+208B subscript-minus new to the corpus alphabet; inverse registered in INV (L5)',
  'unrepresented': ['dashed answer boxes before the alpha/beta stacks (corpus write-on convention, cf. "pressure difference = Pa")'],
  'census_note': 'the (b) lead-in prose with its inline (sup232 sub90 Th)/(sup220 sub86 Rn) parentheticals '
                 '(spans size 7.0 at y=67-113) was never extracted: part p1 begins at "(i) State two '
                 'differences" - pre-existing extraction loss, disclosed, out of format scope',
 },
 {
  'id': 'V2',
  'slug': 'official-4ph1-1p-2026-06', 'kind': 'qp',
  'where': 'official-4ph1-1p-2026-06|offq_2026-06_1p_7|p0|problemMd',
  'receipt_role': 'stay-residual #2 of run-004 (nuclear equation line)',
  'page_of_record': 'past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2026-06/4PH1-1P/qp.pdf p18',
  'eyes': 'eq1: sup X sub Y n + sup 232 sub 90 Th -> sup 233 sub 90 Th (unknowns X/Y '
          'printed as the neutron\'s super/subscripts); eq2: sup 233 sub 90 Th -> 2 sup 0 '
          'sub Z beta + sup 233 sub 92 U (coefficient 2 baseline, sup 0, sub Z)',
  'verdict': 'CLOSE-UNREPRESENTABLE',
  'reasons': [
    'Unicode has no subscript y and no subscript z: the question\'s own unknowns '
    '(sup X sub Y n; 2 sup 0 sub Z beta) cannot be rendered in the field convention',
    'problemMd carries 0 $-segments corpus-wide (verified at open): a KaTeX segment '
    'would be a corpus-convention change, not a format restoration (L4)',
    'no mixed restorations (restitution precedent): partial stacking of the numeric '
    'tokens while X/Y/Z stay flattened would misrepresent the printed equations',
    'the corpus "2Z0 \u03b2" is additionally order-mangled (extraction x-order: sub Z x=301.4 '
    'precedes sup 0 x=302.1; page prints 0 above, Z below after the coefficient 2) - '
    'documented, not repaired',
    'extraction losses documented: sub 90/90/90/92 stacks absent; unknowns flattened',
  ],
 },
 {
  'id': 'V3',
  'slug': 'official-4ph1-2pr-2025-06', 'kind': 'qp',
  'where': 'official-4ph1-2pr-2025-06|offq_2025-06_2pr_5|p3|problemMd',
  'receipt_role': 'stay-residual #3 of run-004 (restitution formula line, eyeball-rejected in run-004)',
  'page_of_record': 'past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2025-06/4PH1-2PR/qp.pdf p14',
  'eyes': 'formula is coefficient of restitution = sqrt(h2/h1): radical over a stacked '
          'fraction; ALL SIX h-instances carry subscript digits - prose (h1)/(h2) size 7.0 '
          'sub rows y=127.34/175.29; diagram labels h1/h2; inside the fraction the digits '
          'are size 6.97 at y=510.44 (+3.1 under numerator h) and y=527.79 (+3.1 under '
          'denominator h) - the run-004 "flattened-fraction numerator ambiguity" is '
          'settled: SUBSCRIPTED',
  'verdict': 'CLOSE-EXTRACTION-LOSS',
  'reasons': [
    'the sqrt radical is VECTOR ART: no text span exists in the extraction layer - '
    'the corpus never received it (same dropout class as the 2022 arrow)',
    'the faithful form "coefficient of restitution = \u221a(h\u2082 / h\u2081)" requires the sqrt '
    'insertion AND fraction re-linearization: the corpus\'s "h2 coefficient of '
    'restitution = h1" is the extractor\'s numerator-then-words-then-denominator shape, '
    'so h2 must move after the "=" - a REORDER, outside L2/L3',
    'restoring the h-digits alone would leave the formula misrepresenting the page '
    '(sqrt-less) - run-004\'s rejection is UPHELD, now with the completed evidence',
    'proposal of record for a future pre-registered wave: replace the flattened span '
    '"h2 coefficient of restitution = h1" with "coefficient of restitution = \u221a(h\u2082 / h\u2081)"',
  ],
 },
 {
  'id': 'V4',
  'slug': 'official-4ph1-1p-2023-06', 'kind': 'qp',
  'where': 'official-4ph1-1p-2023-06|offq_2023-06_1p_9|p0|problemMd',
  'receipt_role': 'payload-vs-prose reconciliation: run-004\'s third AMBIGUOUS target (this '
                  'wave reads all four eyes-on targets; the receipt prose had named the '
                  'restitution line instead of this one - both now carry page verdicts)',
  'page_of_record': 'past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers/2023-06/4PH1-1P/qp.pdf p22',
  'eyes': 'entire line page-flat: formula words size 12 on one baseline (g italic, same '
          'size and baseline - no super/subscript anywhere); "0.094 m" flat; "14 000 kg / '
          'm3" with the 3 raised (size 7.0, y=486.83, 4pt above baseline) - the corpus '
          'ALREADY carries the Unicode \u00b3, so the printed state is already served',
  'verdict': 'CLOSE-PAGE-CONFIRMED-NOOP',
  'reasons': [
    'every suspect cluster on the line is page-flat or already correctly restored',
    'the engine\'s lone raised-vs-flat instance resolves to a plain-prose region '
    '("...gas tap and t...") - a phantom cluster, consistent with the S1-decimal '
    'class being driven by the genuine flat decimals 0.094 / 14 000',
  ],
 },
]

def sup(s): return ''.join(SUP[c] for c in s)
def sub(s): return ''.join(SUB[c] for c in s)

def after_segment():
    return (sup('232') + sub('90') + 'Th'
            + ' \u2192 '
            + sup('220') + sub('86') + 'Rn + '
            + sup('4') + sub('2') + '\u03b1 + '
            + sup('0') + SUBMINUS + sub('1') + '\u03b2')

def dollar_stats(data):
    raw = lines = 0
    def acc(t):
        nonlocal raw, lines
        raw += t.count('$')
        lines += sum(1 for ln in t.split('\n') if '$' in ln)
    for e in data:
        for q in e.get('questions', []):
            for pt in (q.get('parts') or []):
                for fld in ('problemMd', 'solutionMd'):
                    acc(pt.get(fld) or '')
                for ch in (pt.get('choices') or []):
                    if isinstance(ch, dict): acc(ch.get('textMd') or '')
                for mp in (pt.get('markPoints') or []):
                    if isinstance(mp, dict): acc(mp.get('textMd') or '')
    return raw, lines

def structure(data):
    marks = []
    for e in data:
        for q in e.get('questions', []):
            for pt in (q.get('parts') or []):
                marks.append(json.dumps(pt.get('marks'), sort_keys=True))
    return (len(data), sum(len(e.get('questions', [])) for e in data),
            sum(len(e.get('questions', [])) and
                sum(len(q.get('parts') or []) for q in e.get('questions', [])) for e in data),
            marks)

def bad_chars(data):
    pua = ctrl = fffd = 0
    def scan(t):
        nonlocal pua, ctrl, fffd
        for c in t:
            o = ord(c)
            if 0xE000 <= o <= 0xF8FF: pua += 1
            elif o < 0x20 and c not in '\n\t': ctrl += 1
            elif o == 0xFFFD: fffd += 1
    for e in data:
        for q in e.get('questions', []):
            for pt in (q.get('parts') or []):
                for fld in ('problemMd', 'solutionMd'): scan(pt.get(fld) or '')
                for ch in (pt.get('choices') or []):
                    if isinstance(ch, dict): scan(ch.get('textMd') or '')
                for mp in (pt.get('markPoints') or []):
                    if isinstance(mp, dict): scan(mp.get('textMd') or '')
    return pua, ctrl, fffd

def segments(data):
    out = []
    for e in data:
        for q in e.get('questions', []):
            for pt in (q.get('parts') or []):
                for fld in ('problemMd', 'solutionMd'):
                    out += re.findall(r'\$([^$]+)\$', pt.get(fld) or '')
                for ch in (pt.get('choices') or []):
                    if isinstance(ch, dict): out += re.findall(r'\$([^$]+)\$', ch.get('textMd') or '')
                for mp in (pt.get('markPoints') or []):
                    if isinstance(mp, dict): out += re.findall(r'\$([^$]+)\$', mp.get('textMd') or '')
    return out

def g2_identity(before_seg, after_seg):
    stripped = after_seg
    for t in TARGETS[0]['insertions']:
        assert t['g'] in stripped, f"insertion {t['g']!r} missing"
        stripped = stripped.replace(t['g'], '', 1)
    inv_chars = ''.join(INV.get(c, c) for c in stripped)
    a = denorm(before_seg).replace(' ', '').replace('\u2212', '-')
    b = denorm(inv_chars).replace(' ', '').replace('\u2212', '-')
    return a == b, a, b

def classify(line):
    return sorted(c for c, rx in SUSPECT.items() if c != 'S1-pair' and rx.search(line))

def main():
    apply = '--apply' in sys.argv
    raw = open(P, 'rb').read()
    data = json.loads(raw)

    # ---- open-state verification (fail-closed) ----
    n_sets, n_q, n_p, marks0 = structure(data)
    assert (n_sets, n_q, n_p) == (55, 540, 2254), (n_sets, n_q, n_p)
    rawd0, lines0 = dollar_stats(data)
    assert (rawd0, lines0) == (460, 230), (rawd0, lines0)
    pua0, ctrl0, fffd0 = bad_chars(data)
    segs0 = segments(data)
    print(f'open state: 55/540/2254, raw-$ {rawd0}, $-lines {lines0}, '
          f'PUA {pua0} ctrl {ctrl0} FFFD {fffd0}, segments {len(segs0)}')

    t1 = TARGETS[0]
    AFTER = after_segment()
    print('after segment:', AFTER)

    # locate target field
    hit = None
    for e in data:
        if e['slug'] != t1['slug']: continue
        for q in e.get('questions', []):
            for pi, pt in enumerate(q.get('parts') or []):
                w = f"{e['slug']}|{q.get('id')}|p{pi}|problemMd"
                if w == t1['where']:
                    hit = pt
    assert hit is not None, 'target field not found'
    before_field = hit['problemMd']
    assert before_field.count(t1['before_seg']) == 1, 'before-segment not unique'
    assert '$' not in before_field, 'G7: target field carries $'

    # the four eyes-on targets must be at their recorded state (unchanged by run-004)
    for t in TARGETS[1:]:
        found = 0
        for e in data:
            if e['slug'] != t['slug']: continue
            for q in e.get('questions', []):
                for pi, pt in enumerate(q.get('parts') or []):
                    w = f"{e['slug']}|{q.get('id')}|p{pi}|problemMd"
                    if w == t['where']:
                        for frag in ('X Y n + 232 Th', '2Z0 \u03b2', 'h2 coefficient of restitution = h1',
                                     'pressure difference = density \u00d7 g \u00d7 height difference'):
                            if frag in (pt.get('problemMd') or ''): found += 1
        assert found >= 1, f"{t['id']} state drift"
    print('target-state check: 4/4 at run-004 state')

    # class membership before
    cls_before = classify(t1['before_seg'])

    # ---- the edit ----
    # (mutate the COPY tree, never the pristine tree: locate the same field
    # coordinates inside new_data; data stays the untouched base of record)
    new_field = before_field.replace(t1['before_seg'], AFTER)
    new_data = json.loads(json.dumps(data, ensure_ascii=False))
    hit_new = None
    for e in new_data:
        if e['slug'] != t1['slug']: continue
        for q in e.get('questions', []):
            for pi, pt in enumerate(q.get('parts') or []):
                if f"{e['slug']}|{q.get('id')}|p{pi}|problemMd" == t1['where']:
                    hit_new = pt
    assert hit_new is not None and hit_new['problemMd'] == before_field
    hit_new['problemMd'] = new_field

    # single-field discipline: exactly one field may differ across the whole plane
    def all_fields(d):
        out = []
        for e in d:
            for q in e.get('questions', []):
                for pt in (q.get('parts') or []):
                    for fld in ('problemMd', 'solutionMd'): out.append((id(pt), fld, pt.get(fld) or ''))
                    for ch in (pt.get('choices') or []):
                        if isinstance(ch, dict): out.append((id(ch), 'choice', ch.get('textMd') or ''))
                    for mp in (pt.get('markPoints') or []):
                        if isinstance(mp, dict): out.append((id(mp), 'mp', mp.get('textMd') or ''))
        return out
    diffs = [ (f1, t1x, t2x) for (i1, f1, t1x), (i2, f2, t2x) in zip(all_fields(data), all_fields(new_data)) if t1x != t2x ]
    assert len(diffs) == 1, f'single-field discipline violated: {len(diffs)} fields differ'
    print(f'single-field discipline: OK (1 field changed: {diffs[0][0]}-{diffs[0][1]})')

    # ---- gates ----
    ok, a, b = g2_identity(t1['before_seg'], AFTER)
    print(f'G2 identity: {ok}  denorm(a)={a!r} denorm(strip+inv(b))={b!r}')
    assert ok, 'G2 FAILED'

    n2_sets, n2_q, n2_p, marks1 = structure(new_data)
    assert (n2_sets, n2_q, n2_p) == (55, 540, 2254)
    assert marks0 == marks1, 'G1 marks changed'
    print('G1 structure+marks: OK')

    pua1, ctrl1, fffd1 = bad_chars(new_data)
    assert (pua1, ctrl1, fffd1) == (pua0, ctrl0, fffd0) == (0, 0, 0), (pua1, ctrl1, fffd1)
    print('G3 PUA/control/FFFD: OK (0/0/0)')

    rawd1, lines1 = dollar_stats(new_data)
    assert (rawd1, lines1) == (rawd0, lines0), (rawd0, lines0, rawd1, lines1)
    print(f'G4 raw-$ {rawd0}->{rawd1}, $-lines {lines0}->{lines1}: OK')

    segs1 = segments(new_data)
    assert segs0 == segs1, 'G5/G7: segment set changed'
    with open('/tmp/run005_segments.json', 'w') as f:
        json.dump(segs1, f, ensure_ascii=False)
    r = subprocess.run(['node', '-e', '''
const k = require('/tmp/ktx/node_modules/katex');
const segs = JSON.parse(require('fs').readFileSync('/tmp/run005_segments.json', 'utf8'));
let fail = 0;
for (const s of segs) { try { k.renderToString(s, {throwOnError: true}); } catch (e) { fail++; console.error('FAIL', JSON.stringify(s), e.message); } }
console.log('segments:', segs.length, 'failures:', fail);
process.exit(fail ? 1 : 0);
'''], capture_output=True, text=True)
    print('G5 katex 0.16.23:', r.stdout.strip() or r.stderr.strip())
    assert r.returncode == 0

    assert '$' not in before_field and '$' not in new_field, 'G7'
    print('G7 changed line $-free both sides + segment set byte-identical: OK')

    out = json.dumps(new_data, indent=1, ensure_ascii=False)
    assert json.loads(out) == new_data
    assert not out.endswith('\n')
    print('G6 serialization byte-law round-trip: OK')

    cls_after = classify(AFTER)
    print(f'G8 line classes before: {cls_before}')
    print(f'G8 line classes after:  {cls_after}')

    # idempotence: applying the transform to the new plane must change nothing
    assert new_field.count(t1['before_seg']) == 0
    re_data = json.loads(out)
    for e in re_data:
        if e['slug'] != t1['slug']: continue
        for q in e.get('questions', []):
            for pt in (q.get('parts') or []):
                if pt.get('problemMd') == new_field:
                    pass
    print('G8 idempotence: before-segment absent from new plane -> re-apply changes nothing')

    if not apply:
        print('DRY RUN - no bytes written')
        return

    with open(P, 'wb') as f:
        f.write(out.encode('utf-8'))
    import hashlib, subprocess as sp
    blob = sp.run(['git', '-C', REPO, 'hash-object', P], capture_output=True, text=True).stdout.strip()
    print('WROTE plane:')
    print('  blob sha1 :', blob)
    print('  sha256    :', hashlib.sha256(out.encode()).hexdigest())

    # evidence payload
    spans = json.load(open(SPANS))
    payload = {
        'lane': 'T-OEQ-PHYS-FORMAT-1', 'run': 'run-005-human-page-read',
        'targets': TARGETS,
        'applied': {
            'where': t1['where'],
            'before_seg': t1['before_seg'], 'after_seg': AFTER,
            'field_chars': len(before_field), 'new_field_chars': len(new_field),
        },
        'spans_of_record': spans,
        'page_images_rendered': ['2022-06-1p-p13', '2023-06-1p-p22', '2023-06-1p-p23',
                                  '2026-06-1p-p18', '2025-06-2pr-p14'],
        'render_scripts': ['run005_render_pages.py (2.0x zoom page images, read as images)',
                            'run005_spans.py (PyMuPDF span bands, this payload\'s spans_of_record)'],
    }
    with open(PAYLOAD, 'w') as f:
        f.write(json.dumps(payload, indent=1, ensure_ascii=False))
    print('evidence payload written:', PAYLOAD)

if __name__ == '__main__':
    main()
