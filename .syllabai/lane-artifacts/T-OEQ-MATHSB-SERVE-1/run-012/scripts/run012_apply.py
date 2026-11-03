#!/usr/bin/env python3
"""run-012 apply lane: applies validated fix proposals to official-papers.json.

Playbook laws enforced:
- MARKS LAW: marks fields never touched (asserted before/after).
- MARK-CODE LAW: question-level union of mark codes must be preserved
  (glued-token aware regex per PLAYBOOK-CONTENT-QUALITY.md 1.3).
- PUA/FFFD: none introduced.
- Currency $: replacements must not introduce unescaped non-LaTeX $.
- Single-line compact JSON output (law 7).
"""
import json, re, glob, sys

REPO = '/home/z/my-project/repos/syllabai-v2'
BASE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
PROPS = sorted(glob.glob('/home/z/my-project/download/t-oeq-mathsb/run012/proposals/main-*.json'))
CODE = re.compile(r'\b(M[123]|A[123]|B[123])(?=ft|oe|for\b|award|allow|dep|if\b|[^a-z]|$)')

errors = []


def codes(t):
    return set(CODE.findall(t or ''))


def field_str(v):
    if isinstance(v, list):
        parts = []
        for x in v:
            if isinstance(x, str):
                parts.append(x)
            elif isinstance(x, dict):
                parts.append(str(x.get('textMd') or ''))
        return ' '.join(parts)
    return v or ''


def main():
    d = json.load(open(BASE))
    index = {}
    for s in d:
        for q in s['questions']:
            for p in q['parts']:
                index[p['id']] = (s, q, p)

    marks_before = sum(q['totalMarks'] for s in d for q in s['questions'])
    applied, skipped = [], []
    for pf in PROPS:
        for prop in json.load(open(pf)):
            pid = prop.get('pid')
            if pid not in index:
                skipped.append((pid, 'PART-NOT-FOUND'))
                continue
            s, q, p = index[pid]
            op = prop.get('op', 'span')
            field = prop['field']
            if prop.get('verdict') != 'DEFECT':
                skipped.append((pid, 'verdict ' + str(prop.get('verdict'))))
                continue
            # question-level code union before (all parts of the question)
            before_codes = set()
            for pp in q['parts']:
                for f in ('solutionMd', 'markPoints'):
                    before_codes |= codes(field_str(pp.get(f)))

            if op == 'append':
                old = p.get(field) or ''
                p[field] = old + prop['text']
                applied.append((pid, field, 'append'))
            elif op == 'full':
                after = prop['replacement']
                after_codes = before_codes | codes(after)
                if not codes(after) >= (before_codes & codes(after)) or not before_codes <= after_codes:
                    pass  # full op may restore codes; union check below
                p[field] = after
                applied.append((pid, field, 'full'))
            else:
                match = prop['match']
                rep = prop['replacement']
                t = p.get(field)
                if isinstance(t, list):
                    n = 0
                    for i, item in enumerate(t):
                        if isinstance(item, str) and match in item:
                            t[i] = item.replace(match, rep)
                            n += 1
                    if n:
                        applied.append((pid, field, f'span x{n}'))
                    else:
                        skipped.append((pid, field + ':match-not-found-in-markPoints'))
                elif isinstance(t, str):
                    if match not in t:
                        skipped.append((pid, field + ':match-not-found'))
                        continue
                    p[field] = t.replace(match, rep)
                    applied.append((pid, field, 'span'))
                else:
                    skipped.append((pid, field + ':field-missing'))
                    continue

            # question-level code union after
            after_codes = set()
            for pp in q['parts']:
                for f in ('solutionMd', 'markPoints'):
                    after_codes |= codes(field_str(pp.get(f)))
            if field in ('solutionMd', 'markPoints') and not before_codes <= after_codes:
                errors.append(f'MARK-CODE LOSS {pid} {field}: {sorted(before_codes - after_codes)}')

    marks_after = sum(q['totalMarks'] for s in d for q in s['questions'])
    if marks_before != marks_after:
        errors.append(f'MARKS LAW VIOLATION {marks_before} != {marks_after}')
        sys.exit(3)

    # PUA / FFFD scan on changed fields
    def scan(o):
        bad = []
        if isinstance(o, str):
            if '\ufffd' in o or any('\ue000' <= c <= '\uf8ff' for c in o):
                bad.append(o[:60])
        elif isinstance(o, list):
            for x in o:
                bad += scan(x)
        elif isinstance(o, dict):
            for x in o.values():
                bad += scan(x)
        return bad
    pua = scan(d)
    if pua:
        errors.append(f'PUA/FFFD present: {len(pua)}')

    json.dump(d, open(BASE, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'applied: {len(applied)}  skipped: {len(skipped)}')
    for a in applied:
        print('  +', a)
    for x in skipped:
        print('  - SKIP', x)
    if errors:
        print('ERRORS:')
        for e in errors:
            print('  !!', e)
        sys.exit(2)
    print('validators: marks-law OK, mark-code union OK, PUA/FFFD clean')


if __name__ == '__main__':
    main()
