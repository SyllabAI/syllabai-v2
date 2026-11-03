#!/usr/bin/env python3
"""UIUX-TIER-B run-004 — R4-B UFFFD patch spec + apply.
Every replacement is visual-verified of record (2019-06 4MB1/02 MS pages 5-17
rendered + Read). Fail-closed: exact-match asserts on the CURRENT bundle text.
R4-B = UFFFD sub-lane (11 parts) + same-cell glyph-loss adjacent repairs
(superscript-merge, italic misreads x->r / y->s / q->k, UFFFD siblings),
each evidenced by the MS page image of record."""

import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'

# (slug, q, part, [ (old_exact_line, new_lines_or_None_to_strip, evidence_tag) ... ])
PATCHES = [
 # q1 p0 — MS p5: Working (48/200) × 360 [r4b-ms02-p05]
 ("2019-06-4mb1-02--exam-questions", 1, 0, [
   ("- Note: \ufffd \ufffd × 360",
    ["- Note: $\\left(\\dfrac{48}{200}\\right) \\times 360$"],
   "p05: (48/200)x360"),
   ("- Note: 200", None, "p05: denominator folded"),
 ]),
 # q2 p1 — MS p6: ("11 280 000"/10 × 3) [r4b-ms02-p06]
 ("2019-06-4mb1-02--exam-questions", 2, 1, [
   ("- Note: \ufffd × 3\ufffd",
    ["- Note: $\\left( \\dfrac{\\text{\"11 280 000\"}}{10} \\times 3 \\right)$"],
   "p06: (11280000/10 x 3)"),
   ("- Note: 10", None, "p06: denominator folded"),
 ]),
 # q4 p3 — MS p8/p9: matrix product + N = M^-1 cells [r4b-ms02-p08/p09]
 ("2019-06-4mb1-02--exam-questions", 4, 3, [
   ("- Note: \ufffd \ufffd\"\ufffd \ufffd \"=",
    ["- Note: $\\begin{pmatrix} -0.5 & 0 \\\\ 0.5 & -1 \\end{pmatrix} \\begin{pmatrix} 2 & 6 & 2 \\\\ 4 & -4 & 8 \\end{pmatrix} =$"],
   "p08: 2x2 x 2x3 product"),
   ("- Note: 0.5 −1 4 -4 8 at least 4 correct values seen or for 2 correct coordinates",
    ["- Note: at least 4 correct values seen or for 2 correct coordinates"],
   "p08: matrix rows folded into KaTeX above"),
   ("- Note: −1 −3 −1 plotted",
    ["- Note: $\\begin{pmatrix} -1 & -3 & -1 \\\\ -3 & 7 & -7 \\end{pmatrix}$ plotted"],
   "p08: result matrix"),
   ("- Note: \ufffd \ufffd", None, "p08: duplicate matrix fragment folded"),
   ("- Note: 4 (e) Recognising that N = M −1 3 1",
    ["- Note: Recognising that $N = M^{-1}$"],
   "p09: row-prefix meta + mark-col bleed stripped; N=M^-1"),
   ("- Note: −1 0",
    None, "p09: inverse-matrix fragment folded into next line"),
   ("- Note: or \ufffd \ufffd seen.",
    ["- Note: or $\\begin{pmatrix} -1 & 0 \\\\ -0.5 & -0.5 \\end{pmatrix}$ seen."],
   "p09: inverse matrix (−1 0; −0.5 −0.5)"),
   ("- Note: −0.5 −0.5", None, "p09: matrix row folded"),
   ("- Note: 2\ufffd \ufffd",
    ["- Note: $2\\begin{pmatrix} -1 & 0 \\\\ -0.5 & -0.5 \\end{pmatrix}$"],
   "p09: q4(e) Answer cell 2(−1 0; −0.5 −0.5)"),
   ("- Note: −0.5 −0.5 The factor of 2 may be included in matrix.",
    ["- Note: The factor of 2 may be included in matrix."],
   "p09: matrix rows folded into Answer cell"),
 ]),
 # q4 p4 — MS p9 ALT row [r4b-ms02-p09]
 ("2019-06-4mb1-02--exam-questions", 4, 4, [
   ("- Note: ALT P Q −1 −3 −1",
    ["- Note: ALT $\\begin{pmatrix} P & Q \\\\ R & S \\end{pmatrix} \\begin{pmatrix} -1 & -3 & -1 \\\\ -3 & 7 & -7 \\end{pmatrix} =$"],
   "p09: ALT product re-emitted"),
   ("- Note: \ufffd \ufffd\"\ufffd \ufffd\" =", None, "p09: folded into ALT line"),
   ("- Note: R S −3 7 −7", None, "p09: folded into ALT line"),
   ("- Note: 2 6 2", None, "p09: folded into ALT line"),
   ("- Note: \"\ufffd \ufffd”",
    ["- Note: $\\begin{pmatrix} 2 & 6 & 2 \\\\ 4 & -4 & 8 \\end{pmatrix}$"],
   "p09: their-values matrix"),
   ("- Note: 4 −4 8", None, "p09: matrix row folded"),
 ]),
 # q5 p0 — MS p11: (BE=)√(5²+8²−40√3) [r4b-ms02-p11]
 ("2019-06-4mb1-02--exam-questions", 5, 0, [
   ("- Note: (B =)\ufffd52 + 82 − 40$\\sqrt{3}$ We must see 40$\\sqrt{3}$ or values which round to 69.3, 19.7 or",
    ["- Note: $(BE =) \\sqrt{5^2 + 8^2 - 40\\sqrt{3}}$ We must see $40\\sqrt{3}$ or values which round to 69.3, 19.7 or"],
   "p11: BE radical re-transcribed; 52/82 superscript-merge"),
 ]),
 # q5 p2 — MS p11: (k=)√((18.9+"10")/"10")(=1.7); ½(8)(5)sin30; CD [r4b-ms02-p11]
 ("2019-06-4mb1-02--exam-questions", 5, 2, [
   ("- Note: Area of \U0001d6e5 = 2 (8)(5)sin30",
    ["- Note: Area of $\\Delta ABE = \\frac{1}{2}(8)(5)\\sin 30$"],
   "p11: 1/2 glyph-loss repaired (was '2 (8)(5)sin30' = wrong math)"),
   ("- Note: Area of ∆A =",
    ["- Note: Area of $\\Delta ABE$ ="],
   "p11: BE restored"),
   ("- Note: 1", None, "p11: 1/2 flatten folded"),
   ("- Note: × 8 × \"4.44\" × sin \"34.3\"",
    ["- Note: $\\frac{1}{2} \\times 8 \\times$ \"4.44\" $\\times \\sin$ \"34.3\""],
   "p11: 1/2 folded"),
   ("- Note: 2", None, "p11: 1/2 flatten folded"),
   ("- Note: taken if a method involving C2 is used.",
    ["- Note: taken if a method involving $CD^2$ is used."],
   "p11: C2 -> CD^2"),
   ("- Note: 18.9 + \"10\"", None, "p11: folded into k line"),
   ("- Note: (e =)\ufffd (= 1.7)",
    ["- Note: $(k =) \\sqrt{\\dfrac{18.9 + \\text{\"10\"}}{\\text{\"10\"}}}\\ (= 1.7)$"],
   "p11: LSF radical re-transcribed; e->k italic misread"),
   ("- Note: \"10\"", None, "p11: folded into k line"),
   ("- Note: C = \"1.7\" × \"4.44\"",
    ["- Note: $CD$ = \"1.7\" × \"4.44\""],
   "p11: CD restored"),
 ]),
 # q7 p1 — MS p13: 2/5 p (3/4−3/5); ALT 1/4 = 2/5 × q (q=5/8); 1−"5/8" [r4b-ms02-p13]
 ("2019-06-4mb1-02--exam-questions", 7, 1, [
   ("- Note: 5 5 4 5", None, "p13: denominator bleed of the b) working folded"),
   ("**P8** (1 mark) for p (oe) or \ufffd − \ufffd seen",
    ["**P8** (1 mark) for $\\frac{2}{5}p$ (oe) or $\\left(\\frac{3}{4} - \\frac{3}{5}\\right)$ seen"],
   "p13: 2/5 p + (3/4−3/5) restored"),
   ("- Note: ALT 4",
    ["- Note: ALT $\\frac{1}{4} = \\frac{2}{5} \\times q$ $\\left(q = \\frac{5}{8}\\right)$"],
   "p13: ALT working re-transcribed; k->q MS-of-record"),
   ("- Note: = 5$\\times$k \ufffdk = 8\ufffd", None, "p13: folded into ALT line"),
   ("- Note: 1−\" \" range 0 ≤ k ≤ 1",
    ["- Note: $1 - \"\\frac{5}{8}\"$ range 0 ≤ q ≤ 1"],
   "p13: 5/8 restored; k->q per MS visual"),
   ("- Note: 8", None, "p13: denominator folded"),
 ]),
 # q9 p1 — MS p15: quadratic formula + (x−3/2)²−9/4−9=0 [r4b-ms02-p15]
 ("2019-06-4mb1-02--exam-questions", 9, 1, [
   ("- Note: − ( −3) ± ( −3) − 4(1)(−9)",
    ["- Note: $x = \\dfrac{-(-3) \\pm \\sqrt{(-3)^2 - 4(1)(-9)}}{2(1)}$"],
   "p15: formula re-transcribed; x glyph-loss"),
   ("- Note: 2", None, "p15: denominator folded"),
   ("- Note: x=", None, "p15: folded"),
   ("- Note: 2(1)", None, "p15: denominator folded"),
   ("- Note: 3 2 9", None, "p15: column-bleed strip"),
   ("- Note: or \ufffdr − 2\ufffd − 4 − 9 = 0",
    ["- Note: or $\\left(x - \\frac{3}{2}\\right)^2 - \\frac{9}{4} - 9 = 0$"],
   "p15: completing-square form; r->x misread"),
   ("- Note: 3 + 3$\\sqrt{5}$ 3+$\\sqrt{45}$",
    ["- Note: $x = \\dfrac{3 + 3\\sqrt{5}}{2}$ eg $\\dfrac{3+\\sqrt{45}}{2}$"],
   "p15: answer + equivalent exact form re-joined"),
 ]),
 # q9 p2 — MS p16: y = 5 − 2((3+3√5)/2); y²=…; (2−3√5)² [r4b-ms02-p16]
 ("2019-06-4mb1-02--exam-questions", 9, 2, [
   ("- Note: s = 5 − 2 \ufffd \ufffd involving surds into linear equation to find y",
    ["- Note: $y = 5 - 2\\left(\\dfrac{3 + 3\\sqrt{5}}{2}\\right)$ involving surds into linear equation to find y"],
   "p16: substitution line; s->y misread"),
   ("- Note: 2", None, "p16: denominator folded"),
   ("- Note: s 2 = 98 − 49 − 12$\\sqrt{5}$ or simpler to gain this mark.",
    ["- Note: $y^2 = 98 - 49 - 12\\sqrt{5}$ or simpler to gain this mark."],
   "p16: s->y misread + superscript restore"),
   ("- Allow: s 2 = 49 − 12$\\sqrt{5}$ from modulus equation and",
    ["- Allow: $y^2 = 49 - 12\\sqrt{5}$ from modulus equation and"],
   "p16: s->y + superscript"),
   ("- Note: 2", None, "p16: stray 2 bleed strip"),
   ("- Note: expansion of \ufffd2 − 3$\\sqrt{5}$\ufffd = 49 − 12$\\sqrt{5}$ along with an",
    ["- Note: expansion of $(2 - 3\\sqrt{5})^2 = 49 - 12\\sqrt{5}$ along with an"],
   "p16: parens+superscript restored"),
 ]),
 # q9 p3 — MS p16: |q|² = q₁²+q₂²; (2−3√5+3)²+(−(2−3√5))²; 119−42√5 [r4b-ms02-p16]
 ("2019-06-4mb1-02--exam-questions", 9, 3, [
   ("**P10** (1 mark) Attempt q= q12 + q2 2 - allow in terms of y or x",
    ["**P10** (1 mark) Attempt $|\\mathbf{q}|^2 = q_1^2 + q_2^2$ - allow in terms of y or x"],
   "p16: sub/superscript stack law (q12 = q1^2)"),
   ("- Allow: an expression for |k|",
    ["- Allow: an expression for $|\\mathbf{q}|$"],
   "p16: k->q misread"),
   ("- Note: 2", None, "p16: bleed strip"),
   ("- Note: 2 2", None, "p16: bleed strip"),
   ("- Note: \ufffd2 − 3$\\sqrt{5}$ + 3\ufffd + \ufffd−\ufffd2 − 3$\\sqrt{5}$\ufffd\ufffd Eg. (s + 3)2 + s 2 or (8 − 2r)2 + (5 − 2r)2",
    ["- Note: $(2 - 3\\sqrt{5} + 3)^2 + (-(2 - 3\\sqrt{5}))^2$ Eg. $(y + 3)^2 + y^2$ or $(8 - 2x)^2 + (5 - 2x)^2$"],
   "p16: |q|^2 working + Eg. (s->y, r->x, 2->^2)"),
   ("- Note: 7\ufffd17 − 6$\\sqrt{5}$\ufffd",
    ["- Note: $119 - 42\\sqrt{5}$ or $7(17 - 6\\sqrt{5})$"],
   "p16: answer cell completed (119−42√5 or 7(17−6√5))"),
 ]),
 # q10 p1 — MS p17: (f'(x)=)6x²+2ax+b; 6×1²+2a×1+b=−8 [r4b-ms02-p17]
 ("2019-06-4mb1-02--exam-questions", 10, 1, [
   ("- Note: \ufffd` / (r) =\ufffd6r 2 + 2[ + \\",
    ["- Note: $(f'(x) =) 6x^2 + 2ax + b$"],
   "p17: derivative re-transcribed from glyph soup"),
   ("- Note: 6$\\times$12 + 2[ × 1 + \\ = −8",
    ["- Note: $6 \\times 1^2 + 2a \\times 1 + b = -8$"],
   "p17: 1^2 superscript-merge + 2[->2a + \\->b"),
 ]),
]

def main():
    apply = '--apply' in sys.argv
    d = json.load(open(BUNDLE, encoding='utf-8'))
    idx = {}
    for si, s in enumerate(d):
        for qi, q in enumerate(s['questions']):
            for pi, p in enumerate(q.get('parts') or []):
                idx[(s['slug'], qi+1, pi)] = (si, qi, pi, p)

    n_fix, n_fail = 0, 0
    report = []
    for slug, qn, pi, rules in PATCHES:
        key = (slug, qn, pi)
        if key not in idx:
            print('MISS', key); n_fail += 1; continue
        p = idx[key][3]
        sm = p.get('solutionMd') or ''
        lines = sm.split('\n')
        for old, new, ev in rules:
            if old not in lines:
                print(f'NO-MATCH {slug} q{qn}p{pi}: {old[:70]!r}')
                n_fail += 1
                continue
            j = lines.index(old)
            if new is None:
                lines.pop(j)
            else:
                lines[j:j+1] = new
            n_fix += 1
            report.append({'slug': slug, 'q': qn, 'part': pi, 'evidence': ev,
                           'old': old, 'new': new})
        p['solutionMd'] = '\n'.join(lines)

    print(f'rules applied: {n_fix} | failures: {n_fail}')
    if apply and n_fail == 0:
        json.dump(d, open(BUNDLE, 'w', encoding='utf-8'), separators=(',', ':'),
                  ensure_ascii=False, sort_keys=False)
        print('BUNDLE WRITTEN (single-line compact law)')
    json.dump(report, open(os.path.join(HERE, 'r4b-report.json'), 'w'), indent=1, ensure_ascii=False)

if __name__ == '__main__':
    main()
