#!/usr/bin/env python3
"""run-004 residual adjudication runner - the 793 S1 residual lines of record
plus the disclosed $-segment interior (s = 652 / 26).

Grouping: census records (where, class, line) dedupe to unique (slug, kind, line)
adjudication targets; mp0 mirrors inherit the solutionMd verdict (same printed
line, same PDF - the lockstep law of runs 001-003). zero-lhs lines get the
backward-look pass. The 652/26 line is adjudicated on its $-interior text with a
2+-digit cluster pattern.
"""
import json, re, sys, collections
sys.path.insert(0, '/home/z/my-project/scripts')
from run004_engine import (norm_index, SUSPECT, adjudicate_line, adjudicate_zero_lhs,
                           get_pdf, locate, check_region)
from phys_s1_restore import SUP, SUB

WL = '/tmp/run004_worklist_raw.json'
PLANE = '/tmp/v2repo/apps/hub/content/igcse-physics-19/official-papers.json'
SEG652_WHERE = 'official-4ph1-1pr-2025-06|offq_2025-06_1pr_6|p1'

def main():
    recs = json.load(open(WL))
    # unique adjudication targets
    targets = {}
    for cls, where, line in recs:
        slug = where.split('|')[0]
        fld = where.split('|')[3]
        kind = 'qp' if fld == 'problemMd' else 'ms'
        key = (slug, kind, line)
        targets.setdefault(key, {'classes': set(), 'records': []})
        targets[key]['classes'].add(cls)
        targets[key]['records'].append({'where': where, 'cls': cls})
    print(f'unique adjudication targets: {len(targets)} '
          f'(from {len(recs)} census records)')

    out = []
    stats = collections.Counter()
    for (slug, kind, line), info in sorted(targets.items()):
        pdf = get_pdf(slug, kind)
        if pdf is None:
            stats['no-evidence-file'] += 1
            out.append({'slug': slug, 'kind': kind, 'line': line,
                        'verdict': 'NO-EVIDENCE', 'records': info['records']})
            continue
        if 'S1-zero-lhs' in info['classes']:
            res = adjudicate_zero_lhs(pdf, line)
        else:
            res = adjudicate_line(pdf, line, None)
        res['slug'], res['kind'], res['line'] = slug, kind, line
        res['classes'] = sorted(info['classes'])
        res['records'] = info['records']
        stats[res['verdict']] += 1
        out.append(res)
    print('verdicts:', dict(stats))
    json.dump(out, open('/tmp/run004_adjudication.json', 'w'),
              ensure_ascii=False, indent=1)

    # the 652/26 $-segment interior
    d = json.load(open(PLANE))
    def fields(doc):
        for e in doc:
            for q in e.get('questions', []):
                for pi, pt in enumerate(q.get('parts', [])):
                    for fld in ('problemMd', 'solutionMd'):
                        if pt.get(fld):
                            yield e, q, pi, pt, fld, pt
                    for mi, mp in enumerate(pt.get('markPoints') or []):
                        if isinstance(mp, dict) and mp.get('textMd'):
                            yield e, q, pi, pt, f'mp{mi}', mp
    seg = None
    for e, q, pi, pt, fld, holder in fields(d):
        if f"{e['slug']}|{q['id']}|p{pi}" == SEG652_WHERE:
            t = holder['textMd'] if holder is not pt else pt[fld]
            for ln in t.split('\n'):
                if '652' in ln:
                    seg = {'where': f"{e['slug']}|{q['id']}|p{pi}|{fld}", 'line': ln}
    print('652 segment:', seg)
    if seg:
        slug, fld = seg['where'].split('|')[0], seg['where'].split('|')[3]
        pdf = get_pdf(slug, 'ms')
        inner = seg['line'].replace('$', '')
        # 2+-digit clusters to catch both 652 and 26
        res = adjudicate_line(pdf, inner, ['S1-pair'])
        print('652 adjudication:', json.dumps(res, ensure_ascii=False)[:400])
        json.dump({'seg': seg, 'res': res}, open('/tmp/run004_seg652.json', 'w'),
                  ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
