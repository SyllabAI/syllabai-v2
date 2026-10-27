#!/usr/bin/env python3
"""run-012 Tier-D deterministic fixes: spaced standard-form flattens.

Law: a spaced pattern like "× 10 8" / "×10\n2" / "× 10   4" has exactly one coherent
reading — standard form ×10 with superscript exponent (single digit 2-9, standalone).
Only the true multiplication sign × triggers (letter-x is ambiguous with the variable,
those go to the eyes-on queue). Glued "×107" is ambiguous (×10⁷ vs ×107) — eyes-on queue.

Fleet-outage fallback per playbook section 4: main lane executes deterministic classes
serially; eyes-on classes stay staged until the gateway recovers.
"""
import json, re, sys

REPO = '/home/z/my-project/repos/syllabai-v2'
BASE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
SUP = {'2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'}
PAREN = re.compile(r'\([^()]*\)')

# true × sign, required space(s) before 10 AND between 10 and a standalone exponent digit.
# The spaced exponent is unambiguous standard form. Glued exponents ("× 107", "×102")
# are syntactically ambiguous (×10⁷ vs integer ×102) -> eyes-on queue, NOT this lane.
TIER_D = re.compile(r'×\s*10\s+([2-9])(?!\d)')


def ftext(v):
    if isinstance(v, list):
        return ' '.join(str(x) for x in v)
    return v or ''


def fix_text(t):
    n = 0

    def sub(m):
        nonlocal n
        n += 1
        return f'×10{SUP[m.group(1)]}'

    return TIER_D.sub(sub, t), n


def main():
    d = json.load(open(BASE))
    total, parts_touched, log = 0, 0, []
    for s in d:
        for q in s['questions']:
            for p in q['parts']:
                pt = 0
                for f in ('problemMd', 'solutionMd'):
                    t = p.get(f)
                    if not t:
                        continue
                    t2, n = fix_text(t)
                    if n:
                        p[f] = t2
                        total += n
                        pt += n
                        log.append({'pid': p['id'], 'field': f, 'fixes': n,
                                    'set': s['slug']})
                mp = p.get('markPoints')
                if isinstance(mp, list):
                    for i, item in enumerate(mp):
                        if isinstance(item, str):
                            t2, n = fix_text(item)
                            if n:
                                mp[i] = t2
                                total += n
                                pt += n
                                log.append({'pid': p['id'], 'field': 'markPoints', 'fixes': n,
                                            'set': s['slug']})
                elif isinstance(mp, str) and mp:
                    t2, n = fix_text(mp)
                    if n:
                        p['markPoints'] = t2
                        total += n
                        pt += n
                        log.append({'pid': p['id'], 'field': 'markPoints', 'fixes': n,
                                    'set': s['slug']})
                if pt:
                    parts_touched += 1
    json.dump(d, open(BASE, 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'class': 'tierD-spaced-standard-form', 'fixes': total, 'parts': parts_touched,
               'log': log}, open('/home/z/my-project/download/t-oeq-mathsb/run012/tierD_log.json', 'w'),
              ensure_ascii=False, indent=1)
    print(f'Tier-D fixes: {total} across {parts_touched} parts')


if __name__ == '__main__':
    main()
