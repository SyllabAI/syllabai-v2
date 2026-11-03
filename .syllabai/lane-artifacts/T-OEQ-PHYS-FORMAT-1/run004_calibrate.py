#!/usr/bin/env python3
"""run-004 calibration - engine vs run-002's 1,839 restorations of record.

For each run-002 edit: reconstruct the flattened line_before, locate it in the
paper's PDF of record, and compare the engine's page-evidence verdicts at the
exact positions run-002 changed:
  CONFIRMED  - page shows super/subscript at every changed position (same chars)
  PARTIAL    - some changed positions confirmed, others AMBIG/not-in-map
  CONTRADICT - page shows FLAT at a changed position (potential over-restoration)
  NOT-FOUND  - line not located in the PDF (matching limitation, not a verdict)
Extra proposals (page-raised positions run-002 did not restore) counted as EXTRA.
"""
import json, sys, collections
sys.path.insert(0, '/home/z/my-project/scripts')
from run004_engine import norm, adjudicate_line, adjudicate_zero_lhs, get_pdf

PAY = '/tmp/v2repo/.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1/run002-payload.json'

RULE_CLASS = {
    'x10': ['S1-x10'], 'negexp': ['S1-negexp'], 'funcinv': ['S1-funcinv'],
    'parensup': ['S1-parensup'],
    'cluster-d': ['S1-digitclus'], 'cluster-f': ['S1-digitclus'],
}
SUBSUP_RULES = {'unit-compound', 'unit-bare', 'unit-of', 'gas-sub', 'trans-sub',
                'circ-sub', 'suvat-sup', 'ke-shape', 'suvat-rest', 'wordsup',
                'power-sup', 'pir3', 'momsub'}
def classes_for(rule):
    if rule in RULE_CLASS:
        return RULE_CLASS[rule]
    if rule in SUBSUP_RULES:
        return ['S1-subsup']
    return ['S1-subsup', 'S1-digitclus']

def changed_positions(before, after):
    out = []
    if len(before) != len(after):
        return None
    for i, (a, b) in enumerate(zip(before, after)):
        if a != b:
            out.append((i, b))
    return out

def main():
    pay = json.load(open(PAY))
    edits = pay['edits']
    stats = collections.Counter()
    per_rule = collections.defaultdict(collections.Counter)
    contradict, notfound, extra_total = [], [], 0
    seen = set()
    for ed in edits:
        where, rule = ed['where'], ed['rule']
        before, after = ed['line_before'], ed['line_after']
        key = (where.split('|')[0], before)
        slug = where.split('|')[0]
        kind = 'qp' if where.split('|')[3] == 'problemMd' else 'ms'
        pdf = get_pdf(slug, kind)
        if pdf is None:
            stats['no-pdf'] += 1
            continue
        chpos = changed_positions(before, after)
        if not chpos:
            stats['len-drift'] += 1
            continue
        chpos_map = dict(chpos)
        res = adjudicate_line(pdf, before, None) if not before.lstrip().startswith('0 =') else adjudicate_zero_lhs(pdf, before)
        v = res['verdict']
        ck = f'{slug}|{before}'
        if v == 'NOT-FOUND':
            stats['NOT-FOUND'] += 1
            per_rule[rule]['NOT-FOUND'] += 1
            if ck not in seen:
                seen.add(ck)
                notfound.append((rule, slug, before[:70]))
            continue
        if v == 'AMBIGUOUS':
            stats['AMBIG'] += 1
            per_rule[rule]['AMBIG'] += 1
            continue
        props = {p[0]: p[2] for p in res.get('props', [])}
        ok = bad = 0
        for i, newc in chpos:
            if props.get(i) == newc:
                ok += 1
            elif i in props:
                bad += 1
            # else: position not proposed (flat or ambiguous there)
        extra = {i: c for i, c in props.items() if i not in {j for j, _ in chpos}}
        extra_total += len(extra)
        if bad:
            stats['CONTRADICT'] += 1
            per_rule[rule]['CONTRADICT'] += 1
            contradict.append((rule, slug, before[:60], after[:60],
                               [(i, chpos_map.get(i), props.get(i)) for i in chpos_map
                                if props.get(i) != chpos_map.get(i)]))
        elif ok == len(chpos):
            stats['CONFIRMED'] += 1
            per_rule[rule]['CONFIRMED'] += 1
        else:
            stats['PARTIAL'] += 1
            per_rule[rule]['PARTIAL'] += 1
    print('CALIBRATION STATS:', dict(stats))
    print(f'extra proposals beyond run-002: {extra_total}')
    print('per rule:')
    for r in sorted(per_rule):
        print(f'  {r:16} {dict(per_rule[r])}')
    print('NOT-FOUND samples:')
    for nf in notfound[:10]:
        print('   ', nf)
    print('CONTRADICT samples:')
    for c in contradict[:10]:
        print('   ', c)
    json.dump({'stats': dict(stats), 'notfound': notfound[:80]},
              open('/tmp/run004_calibration.json', 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
