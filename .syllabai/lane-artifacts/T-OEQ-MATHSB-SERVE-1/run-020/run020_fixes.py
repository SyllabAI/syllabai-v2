#!/usr/bin/env python3
r"""run-020 tranche-1 FIXES: flattened-superscript tokens -> law-26 KaTeX.
Part: offp_2022-06_01r_22-a (2022-06-01R q22(a) ALTERNATIVE block, MS p16).
Every token eyes-on-verified against ms-2022-06-01R-p16-16.png (150dpi).

Tuple: (pid, which, old, new, exp, evidence, note)
  which: 'problem' | 'solution'
  exp  : expected occurrence count of old in the field (fail-closed)
"""

FIXES = [
    # 1. "obtaining an expression/equation for k or k 2" -> print: "for k or k^2"
    ('offp_2022-06_01r_22-a', 'solution',
     'obtaining an expression/equation for k or k 2',
     'obtaining an expression/equation for k or $k^2$',
     1,
     'ms-2022-06-01R-p16-16.png row2 note: "obtaining an expression/equation for k or k^2 (dependent on first M mark)"',
     'flattened sup k^2 (G2-shape "k 2") -> law-26 KaTeX'),

    # 2. row-2 equation: "36 18 x k2" -> print "36/(3-8x) = 9 + 18x/(1-2x) + k^2/(...)"
    ('offp_2022-06_01r_22-a', 'solution',
     '36 18 x k2',
     '36 18 x $k^2$',
     1,
     'ms-2022-06-01R-p16-16.png row2 working: "... + k^2/(3-8x 1-2x)"',
     'flattened sup k^2 (G1-shape "k2") -> law-26 KaTeX'),

    # 3. "36 9 k2" -> print "Or 36/(3-8x) = 9/(1-2x) + k^2/(...)"
    ('offp_2022-06_01r_22-a', 'solution',
     '36 9 k2',
     '36 9 $k^2$',
     1,
     'ms-2022-06-01R-p16-16.png row2 "Or" line: "... + k^2/(3-8x 1-2x)"',
     'flattened sup k^2 (G1-shape "k2") -> law-26 KaTeX'),

    # 4. "18 x 3 8 x k2" -> print "+ 18x(3-8x) + k^2"
    ('offp_2022-06_01r_22-a', 'solution',
     '18 x 3 8 x k2',
     '18 x 3 8 x $k^2$',
     1,
     'ms-2022-06-01R-p16-16.png row3 working: "36(1-2x) = 9(3-8x)(1-2x) + 18x(3-8x) + k^2"',
     'flattened sup k^2 (G1-shape "k2") -> law-26 KaTeX'),

    # 5. "or 36 1 2 x 9 3 8x k2" -> print "or 36(1-2x) = 9(3-8x) + k^2"
    ('offp_2022-06_01r_22-a', 'solution',
     '9 3 8x k2',
     '9 3 8x $k^2$',
     1,
     'ms-2022-06-01R-p16-16.png row3 "or" line: "36(1-2x) = 9(3-8x) + k^2"',
     'flattened sup k^2 (G1-shape "k2") -> law-26 KaTeX'),

    # 6. "k2 36 72 x 27" -> print "k^2 = 36 - 72x - 27 - 126x + 144x^2 - (54x - 144x^2) = 9"
    ('offp_2022-06_01r_22-a', 'solution',
     'k2 36 72 x 27',
     '$k^2$ 36 72 x 27',
     1,
     'ms-2022-06-01R-p16-16.png row4 working: "k^2 = 36 - 72x - 27 - 126x + 144x^2 - (54x - 144x^2) = 9"',
     'flattened sup k^2 (G1-shape "k2") -> law-26 KaTeX'),

    # 7. expansion row: both "144 x 2" -> print "144x^2" twice
    ('offp_2022-06_01r_22-a', 'solution',
     '126 x 144 x 2 (54 x 144 x 2 ) 9',
     '126 x $144x^2$ (54 x $144x^2$ ) 9',
     1,
     'ms-2022-06-01R-p16-16.png row4 working: "... - 126x + 144x^2 - (54x - 144x^2) = 9"',
     'flattened sup 144x^2 x2 (G2-shape "x 2") -> law-26 KaTeX'),
]
