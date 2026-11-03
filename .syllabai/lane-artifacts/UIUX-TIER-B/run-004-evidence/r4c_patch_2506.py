#!/usr/bin/env python3
"""UIUX-TIER-B run-004 — R4-C ANNEX problemMd rebuild (2025-06-4mb1-01).
Every rebuild verified against the QP of record (2025-06 4MB1/01 QP pages
2,3,4,5,7,8,12,15,16,17,18,24 rendered + Read). Student-visible whole-stem
flatten family. Fail-closed exact-match on the CURRENT bundle text."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'

S = '2025-06-4mb1-01--exam-questions'
STEM10 = ('The numbers $D$, $E$ and $F$ are given as products of their prime factors\n\n'
          '$D = 2^9 \\times 3^x$\n\n$E = 2^2 \\times 3^{x+1}$\n\n'
          '$F = 2^4 \\times 3^{2x+1} \\times 7^{x+1}$\n\nwhere $x$ is a positive integer.\n\n')
STEM21 = ('$\\mathbf{A} = \\begin{pmatrix} 2 & -3 \\\\ -5 & 10 \\end{pmatrix}'
          '\\qquad \\mathbf{A} - \\mathbf{B} = \\begin{pmatrix} 1 & p \\\\ -2p & 4 \\end{pmatrix}'
          '\\qquad \\mathbf{C} = \\begin{pmatrix} 4 & -5 & 2 \\\\ -1 & 3 & 8 \\end{pmatrix}$\n\n')

# (q, part, old_problemMd_exact, new_problemMd, evidence)
R = [
 (1, 0,
  'Calculate the value of 1 2\n\n.\n\n5\n\n7 1 3\n\n.\n\nGive your answer as a decimal to 5 significant figures.',
  'Calculate the value of $\\dfrac{1.2^2 + 5}{7.1 - 3}$\n\nGive your answer as a decimal to 5 significant figures.',
  'QP p2: (1.2^2+5)/(7.1-3)'),
 (2, 0,
  'The nth term of a sequence is given by 12\n\n−n\n\n7\n\nFind the first 3 terms of this sequence.\n\n............................... , ............................... , ...............................',
  'The $n$th term of a sequence is given by $12 - 7n$\n\nFind the first 3 terms of this sequence.\n\n............................... , ............................... , ...............................',
  'QP p2: 12 − 7n'),
 (4, 0,
  'Without using a calculator and showing all your working, evaluate\n\n5 2\n\n2 4\n\n−\n\n3\n\n5\n\nGive your answer as a mixed number in its simplest form.',
  'Without using a calculator and showing all your working, evaluate\n\n$5\\frac{2}{3} - 2\\frac{4}{5}$\n\nGive your answer as a mixed number in its simplest form.',
  'QP p3: 5 2/3 − 2 4/5'),
 (6, 0,
  'Make d the subject of g\n\n2\n\nd\n\ne\n\n5\n\n4',
  'Make $d$ the subject of $g = 5d - 4e^2$',
  'QP p4: g = 5d − 4e^2'),
 (7, 0,
  'On the number line below represent the inequality\n\n≤x\n\n4\n\n2\n\nx\n\n−5\n\n−4\n\n−3\n\n−2\n\n−1\n\n0\n\n1\n\n2\n\n3\n\n4\n\n5',
  'On the number line below represent the inequality $-4 \\leqslant x < 2$\n\n−5 −4 −3 −2 −1 0 1 2 3 4 5',
  'QP p5: −4 <= x < 2 + tick-label scale collapsed'),
 (10, 0,
  'The numbers D, E and F are given as products of their prime factors\n\nx\n\n9\n\nD\n\n2\n\n3\n\nx\n\n2\n\n1\n\nE\n\n2\n\n3\n\nx\n\nx\n\n4\n\n2\n\n1\n\n1\n\nF\n\n2\n\n3\n\n7\n\nwhere x is a positive integer.\n\nFind the Highest Common Factor (HCF) of D and E\n\nGive your answer in terms of x as a product of prime factors.',
  STEM10 + 'Find the Highest Common Factor (HCF) of $D$ and $E$\n\nGive your answer in terms of $x$ as a product of prime factors.',
  'QP p7: D=2^9x3^x; E=2^2x3^(x+1); F=2^4x3^(2x+1)x7^(x+1)'),
 (10, 1,
  'The numbers D, E and F are given as products of their prime factors\n\nx\n\n9\n\nD\n\n2\n\n3\n\nx\n\n2\n\n1\n\nE\n\n2\n\n3\n\nx\n\nx\n\n4\n\n2\n\n1\n\n1\n\nF\n\n2\n\n3\n\n7\n\nwhere x is a positive integer.\n\nFind the Lowest Common Multiple (LCM) of E and F\n\nGive your answer in terms of x as a product of prime factors.\n\nGiven that x is even,',
  STEM10 + 'Find the Lowest Common Multiple (LCM) of $E$ and $F$\n\nGive your answer in terms of $x$ as a product of prime factors.\n\nGiven that $x$ is even,',
  'QP p7'),
 (10, 2,
  'The numbers D, E and F are given as products of their prime factors\n\nx\n\n9\n\nD\n\n2\n\n3\n\nx\n\n2\n\n1\n\nE\n\n2\n\n3\n\nx\n\nx\n\n4\n\n2\n\n1\n\n1\n\nF\n\n2\n\n3\n\n7\n\nwhere x is a positive integer.\n\nfind the least number that F must be multiplied by to give a square number.',
  STEM10 + 'find the least number that $F$ must be multiplied by to give a square number.',
  'QP p7'),
 (11, 0,
  'Without using a calculator and showing all your working, find the value of the\n\ninteger m such that\n\nm\n\n675\n\n108\n\nm = ..............................................................',
  'Without using a calculator and showing all your working, find the value of the\n\ninteger $m$ such that\n\n$\\sqrt{675} - \\sqrt{108} = \\sqrt{m}$\n\nm = ..............................................................',
  'QP p8: sqrt(675) − sqrt(108) = sqrt(m)'),
 (12, 0,
  'Solve 2\n\n3\n\n1\n\n7\n\n4\n\n3\n\nShow clear algebraic working.\n\nx = ..............................................................',
  'Solve $\\dfrac{2x+3}{4} + \\dfrac{x-1}{3} = 7$\n\nShow clear algebraic working.\n\nx = ..............................................................',
  'QP p8: (2x+3)/4 + (x-1)/3 = 7'),
 (16, 0,
  'Factorise fully 10\n\n2\n\n4\n\n3\n\np q\n\np q\n\n−\n\n15',
  'Factorise fully $10p^2q^4 - 15p^3q$',
  'QP p12: 10p^2q^4 − 15p^3q'),
 (16, 1,
  'Factorise 2\n\n2\n\nx\n\nx\n\n−\n\n−\n\n9\n\n5',
  'Factorise $2x^2 - 9x - 5$',
  'QP p12: 2x^2 − 9x − 5'),
 (19, 0,
  'f is directly proportional to g 2\n\nf = 9 when g = 5\n\ng is inversely proportional to h\n\ng = 5 when h = 4\n\nFind a formula for f in terms of h',
  '$f$ is directly proportional to $g^2$\n\n$f = 9$ when $g = 5$\n\n$g$ is inversely proportional to $h$\n\n$g = 5$ when $h = 4$\n\nFind a formula for $f$ in terms of $h$',
  'QP p15: proportionality block'),
 (20, 0,
  'A solid right cylinder is made of wood.\n\nThe mass of the cylinder is 2140\u2009g, to the nearest 10\u2009g\n\nThe radius of the cylinder is 8.5\u2009cm, to the nearest 0.5\u2009cm\n\n. g/cm , to the nearest 0 1\n\n3\n\n3\n\nThe density of the wood is 0 7\n\n. g/cm\n\nGiven that density = mass\n\nvolume\n\nand taking the value of $\\pi$ as 3.142\n\ncalculate the lower bound, in cm to one decimal place, of the height of the cylinder.\n\nShow all your working.\n\n............................................................. cm',
  'A solid right cylinder is made of wood.\n\nThe mass of the cylinder is 2140\u2009g, to the nearest 10\u2009g\n\nThe radius of the cylinder is 8.5\u2009cm, to the nearest 0.5\u2009cm\n\nThe density of the wood is 0.7 g/cm$^3$, to the nearest 0.1 g/cm$^3$\n\nGiven that $\\text{density} = \\dfrac{\\text{mass}}{\\text{volume}}$\n\nand taking the value of $\\pi$ as 3.142\n\ncalculate the lower bound, in cm to one decimal place, of the height of the cylinder.\n\nShow all your working.\n\n............................................................. cm',
  'QP p16: 0.7 g/cm^3 nearest 0.1 g/cm^3; density = mass/volume'),
 (21, 0,
  'A\n\nA\n\nB\n\nC\n\n10\n\n\x19\x18\n\n\x19\x18\n\n\x19\x18\n\n\x1b\n\n\x1b\n\n\x1b\n\np\n\n1\n\n3\n\n8\n\n5\n\n2\n\n4\n\nFind matrix B, giving the elements of B in terms of p where appropriate.\n\n\x1a\n\n\x1a\n\n\x1a\n\n\x1a\n\n\x1b',
  STEM21 + '(a) Find matrix $\\mathbf{B}$, giving the elements of $\\mathbf{B}$ in terms of $p$ where appropriate.',
  'QP p17: A, A−B, C matrices; control-glyph parens stripped'),
 (21, 1,
  'A\n\nA\n\nB\n\nC\n\n10\n\n\x19\x18\n\n\x19\x18\n\n\x19\x18\n\n\x1b\n\n\x1b\n\n\x1b\n\np\n\n1\n\n3\n\n8\n\n5\n\n2\n\n4\n\nFind A−1\n\n\x1a\n\n\x1a\n\n\x1a\n\n\x1a\n\n\x1b',
  STEM21 + '(b) Find $\\mathbf{A}^{-1}$',
  'QP p17'),
 (21, 2,
  'A\n\nA\n\nB\n\nC\n\n10\n\n\x19\x18\n\n\x19\x18\n\n\x19\x18\n\n\x1b\n\n\x1b\n\n\x1b\n\np\n\n1\n\n3\n\n8\n\n5\n\n2\n\n4\n\nFind AC\n\n\x1a\n\n\x1a\n\n\x1a\n\n\x1a\n\n\x1b',
  STEM21 + '(c) Find $\\mathbf{AC}$',
  'QP p17'),
 (22, 0,
  'Solve the simultaneous equations\n\n10\n\n2\n\nx\n\nx\n\ny\n\n3\n\n3\n\n2\n\n3\n\nx\n\ny\n\n2\n\n3\n\n4\n\nShow clear algebraic working.',
  'Solve the simultaneous equations\n\n$3x^2 - \\dfrac{10}{3}x + 3 = 2y$\n\n$2x + 3y = 4$\n\nShow clear algebraic working.',
  'QP p18: 3x^2 − (10/3)x + 3 = 2y; 2x + 3y = 4'),
 (26, 0,
  'Solve the inequality 3\n\nx\n\nx\n\n5\n\n15\n\n2',
  'Solve the inequality $3x - 5 < 15 - 2x$',
  'QP p24: 3x − 5 < 15 − 2x'),
 (26, 1,
  'Solve the inequality x x\n\n6\n\n1\n\nShow clear algebraic working.',
  'Solve the inequality $x(x - 1) > 6$\n\nShow clear algebraic working.',
  'QP p24: x(x−1) > 6'),
 (26, 2,
  'Hence find the range of values of x for which both\n\nand x x\n\nx\n\nx\n\n1\n\n6\n\n3\n\n5\n\n15\n\n2',
  'Hence find the range of values of $x$ for which **both**\n\n$3x - 5 < 15 - 2x$ **and** $x(x - 1) > 6$',
  'QP p24'),
]

def main():
    apply = '--apply' in sys.argv
    d = json.load(open(BUNDLE, encoding='utf-8'))
    n_ok, n_fail = 0, 0
    for qn, pi, old, new, ev in R:
        s = [x for x in d if x['slug'] == S][0]
        p = s['questions'][qn-1]['parts'][pi]
        cur = p.get('problemMd') or ''
        if cur != old:
            print(f'NO-MATCH q{qn}p{pi}'); n_fail += 1; continue
        if apply:
            p['problemMd'] = new
        n_ok += 1
    print(f'rules {"applied" if apply else "verified"}: {n_ok} | failures: {n_fail}')
    if apply and n_fail == 0:
        json.dump(d, open(BUNDLE, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
        print('BUNDLE WRITTEN')

if __name__ == '__main__':
    main()
