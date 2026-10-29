#!/usr/bin/env python3
"""UIUX-TIER-B run-004 — R4-A evidenced-subset patch (solutionMd census classes).
Rules limited to fragments with complete visual evidence of record:
- 2018-06-01 q16p1: 81y^12 superscript-merge (MS crop r4a-2018-06-4m-q16p1)
- 2020-06/11-01R q1p0: 2563/11 fraction flatten (crop r4a-2020-06-4m-q1p0)
- 2020-06/11-01R q22p0: major-sector working (crops r4a-q22sector-*)
- 2020-06-02R q9p1: quadratic-formula discriminants (crop r4a-2020-06-4m-q9p1)
- 2024-06-01R q5p0: 61.8x10^8 + 2x10^7 standard-form merges (crop r4a-10n-2024-06-01R)
- 2024-06-02 q6p3: (39/4)n^2-(39/2)n=10n^2-30n+20 (crop r4a-10n-2024-06-02c)
NOTE: 2020-11 re-print asserted byte-identical to 2020-06 rows (Nov=Jun re-print
law of record); fail-closed if not."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'

R = [
 ("2018-06-4mb1-01--exam-questions", 16, 1,
  [("- Note: 81y12 B1 for either 81 or for y12",
    "- Note: $81y^{12}$ B1 for either 81 or for $y^{12}$")]),
 ("2020-06-4mb1-01r--exam-questions", 1, 0,
  [("- Note: x13 and x 8 or x5",
    "- Note: $\\dfrac{2563}{11} \\times 13$ and $\\dfrac{2563}{11} \\times 8$ or $\\dfrac{2563}{11} \\times 5$"),
   ("- Note: 11 11 11", None)]),
 ("2020-11-4mb1-01r--exam-questions", 1, 0,
  [("- Note: x13 and x 8 or x5",
    "- Note: $\\dfrac{2563}{11} \\times 13$ and $\\dfrac{2563}{11} \\times 8$ or $\\dfrac{2563}{11} \\times 5$"),
   ("- Note: 11 11 11", None)]),
 ("2020-06-4mb1-01r--exam-questions", 22, 0,
  [("- Note: x $\\pi$ x16 or",
    "- Note: $\\dfrac{360-76}{360} \\times \\pi \\times 16$ or"),
   ("- Note: 360", None),
   ("- Note: 76", None),
   ("- Note: 16$\\pi$ − x $\\pi$ x16",
    "- Note: $16\\pi - \\dfrac{76}{360} \\times \\pi \\times 16$"),
   ("- Note: 360", None),
   ("**P2** (1 mark) 568", "**P2** (1 mark)"),
   ("- Note: Awrt to 39.7 or 39.6 (For reference: 39.65388… or $\\pi$)",
    "- Note: Awrt to 39.7 or 39.6 (For reference: 39.65388… or $\\dfrac{568}{45}\\pi$)"),
   ("- Note: 45", None)]),
 ("2020-11-4mb1-01r--exam-questions", 22, 0,
  [("- Note: x $\\pi$ x16 or",
    "- Note: $\\dfrac{360-76}{360} \\times \\pi \\times 16$ or"),
   ("- Note: 360", None),
   ("- Note: 76", None),
   ("- Note: 16$\\pi$ − x $\\pi$ x16",
    "- Note: $16\\pi - \\dfrac{76}{360} \\times \\pi \\times 16$"),
   ("- Note: 360", None),
   ("**P2** (1 mark) 568", "**P2** (1 mark)"),
   ("- Note: Awrt to 39.7 or 39.6 (For reference: 39.65388… or $\\pi$)",
    "- Note: Awrt to 39.7 or 39.6 (For reference: 39.65388… or $\\dfrac{568}{45}\\pi$)"),
   ("- Note: 45", None)]),
 ("2020-06-4mb1-02r--exam-questions", 9, 1,
  [("- Note: −20 ± 202 − 4 x 3 x −175 −20 ± 202 − 4 x12 x −825 quadratic equation using any",
    "- Note: $x = \\dfrac{-20 \\pm \\sqrt{20^2 - 4 \\times 3 \\times -175}}{2 \\times 3}$ $y = \\dfrac{-20 \\pm \\sqrt{20^2 - 4 \\times 12 \\times -825}}{2 \\times 12}$ quadratic equation using any"),
   ("- Note: −20 ± 400 + 2100",
    "- Note: $-20 \\pm \\sqrt{400 + 2100}$")]),
 ("2020-11-4mb1-02r--exam-questions", 9, 1,
  [("- Note: −20 ± 202 − 4 x 3 x −175 −20 ± 202 − 4 x12 x −825 quadratic equation using any",
    "- Note: $x = \\dfrac{-20 \\pm \\sqrt{20^2 - 4 \\times 3 \\times -175}}{2 \\times 3}$ $y = \\dfrac{-20 \\pm \\sqrt{20^2 - 4 \\times 12 \\times -825}}{2 \\times 12}$ quadratic equation using any"),
   ("- Note: −20 ± 400 + 2100",
    "- Note: $-20 \\pm \\sqrt{400 + 2100}$")]),
 ("2024-06-4mb1-01r--exam-questions", 5, 0,
  [("- Note: 61.8 x108 or for a correct answer in any form or for 2.06$\\times$10n where n is an",
    "- Note: $61.8 \\times 10^8$ or for a correct answer in any form"),
   ("- Note: 2 x107 + 0.6 x106 or 2 x107 + 6 x105 for a correct sum with the fraction removed",
    "- Note: $2 \\times 10^7 + 0.6 \\times 10^6$ or $2 \\times 10^7 + 6 \\times 10^5$ for a correct sum with the fraction removed")]),
 ("2024-06-4mb1-02--exam-questions", 6, 3,
  [("- Note: 39 2 39",
    "- Note: $\\frac{39}{4}n^2 - \\frac{39}{2}n = 10n^2 - 30n + 20$ May be implied by $n = 40$"),
   ("- Note: n − n = 10n 2 − 30n + 20 May be implied by n = 40", None)]),
]

def main():
    apply = '--apply' in sys.argv
    d = json.load(open(BUNDLE, encoding='utf-8'))
    n_ok, n_fail = 0, 0
    for slug, qn, pi, rules in R:
        s = [x for x in d if x['slug'] == slug][0]
        p = s['questions'][qn-1]['parts'][pi]
        sm = p.get('solutionMd') or ''
        lines = sm.split('\n')
        ok = True
        for old, new in rules:
            if old not in lines:
                print(f'NO-MATCH {slug} q{qn}p{pi}: {old[:80]!r}')
                ok = False; n_fail += 1; continue
            j = lines.index(old)
            if new is None:
                lines.pop(j)
            else:
                lines[j:j+1] = [new]
            n_ok += 1
        if ok and apply:
            p['solutionMd'] = '\n'.join(lines)
    print(f'rules {"applied" if apply else "verified"}: {n_ok} | failures: {n_fail}')
    if apply and n_fail == 0:
        json.dump(d, open(BUNDLE, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
        print('BUNDLE WRITTEN')

if __name__ == '__main__':
    main()
