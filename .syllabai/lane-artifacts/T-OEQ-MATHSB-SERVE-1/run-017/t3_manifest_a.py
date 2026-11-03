#!/usr/bin/env python3
"""run-017 tranche-3 manifest, part A: 2025-06 4MB1-01 fields.
Every after-text transcribed eyes-on from the printed MS/QP of record:
MS 2025-06 p8 (q6), p9 (q8), p12 (q11), p13 (q12); QP p19 (q23 table).
"""

Q6_SOL = """$g + 4e^2 = 5d$ or $\\frac{g}{5} = d - \\frac{4e^2}{5}$ or $\\frac{g+4e^2}{5}$ or
$-g - 4e^2 = -5d$ or $-\\frac{g}{5} = -d + \\frac{4e^2}{5}$ or
$\\frac{-g-4e^2}{-5}$
$d = \\frac{g+4e^2}{5}$ 2 M1 for a correct first step eg by adding $4e^2$ or dividing
or throughout by 5 or correct expression for $d$ without $d =$ …
$d = \\frac{-g-4e^2}{-5}$ A1 oe eg $d = \\frac{g}{5} + \\frac{4e^2}{5}$ Allow the other way round eg
$\\frac{g+4e^2}{5} = d$ Must see $d =$ … or … $= d$ at least once but
allow if correct answer is in final answer in working but
omitted on the answer line. Do not ISW
cas Total 2 marks"""

Q8B_SOL = """$8q^{12}r^3$ 2 B2
Allow in any order eg $q^{12}r^3 8$
8 must be not be $2^3$
(B1 for a product with 2 parts correct and 3 parts in total)
Condone inclusion of multiplication signs for B1.
cas Total 3 marks"""

Q11_SOL = """$\\sqrt{225\\times3} - \\sqrt{36\\times3}$ 3 M1 Must see 675 and 108 decomposed. The square
or roots don’t need to be present if there is a correct
$\\sqrt{25\\times27} - \\sqrt{4\\times27}$ decomposition
or Allow further decomposition for this mark
$15\\sqrt{3} - 6\\sqrt{3}$ (eg $225 = 5\\times5^2\\times3$ eg $108 = 4\\times3^3$), so long as 675
or and 108 are decomposed into at least the equivalent
$5\\sqrt{27} - 2\\sqrt{27}$ of
225 x 3 and 36 x 3
or
25 x 27 and 4 x 27
do not allow $9\\sqrt{3}$ alone for M1
do not allow, for example $\\sqrt{225\\times3} - \\sqrt{4\\times27}$ only
unless recovered later in the question.
Not necessary to see subtraction sign for this mark.
$9\\sqrt{3}$ or $3\\sqrt{27}$ M1 (dep on first M1)
Not necessary to see subtraction sign for this mark,
but must be a square root.
Please send any alternative methods seen to 243 A1 (dep on both M marks) condone $\\sqrt{243}$
review.
Subtraction sign seen at least once.
No incorrect working for the A mark.
wr Total 3 marks"""

Q12_SOL = """$12\\times\\frac{2x+3}{4} + 12\\times\\frac{x-1}{3} = 12\\times7$ or 3 M1 for clear intention to multiply all terms by 12 (or
$12\\times\\left(\\frac{2x+3}{4} + \\frac{x-1}{3}\\right) = 12\\times7$ oe $4\\times3$) or a multiple of 12
or Do not allow eg $12\\times\\frac{2x+3}{4} + \\frac{x-1}{3} = 12\\times7$ unless
$3(2x+3) + 4(x-1) = 12\\times7$ or recovered
$\\frac{3(2x+3)}{12} + \\frac{4(x-1)}{12} [= 7]$ or
$\\frac{3(2x+3)+4(x-1)}{12} [= 7]$ oe express LHS as two fractions over 12 (or $4\\times3$) or
or a multiple of 12 or
$\\frac{2x}{4} + \\frac{3}{4} + \\frac{x}{3} - \\frac{1}{3} = 7$ oe oe express as a single fraction with a denominator of
12 (or $4\\times3$) or a multiple of 12
If numerator expanded allow 1 sign or numerical
error
or separate out terms on the left
$6x + 4x = 12\\times7 - 9 + 4$ oe or M1 for a correct equation with no brackets and x terms
$10x = 79$ oe or gathered on one side, constants on the other – examples
$\\frac{10x}{12} = \\frac{79}{12}$ oe given, look for equivalences.
$\\frac{6x}{12} + \\frac{4x}{12} = 7 - \\frac{3}{4} + \\frac{1}{3}$ oe This mark implies the previous M mark if not
$\\frac{6x+4x}{12} = \\frac{79}{12}$ oe already awarded.
7.9 A1oe must have gained the previous M mark.
wr Total 3 marks"""

# GFM wage-table re-emit (QP p19 eyes-on; renderer verified: question-player -> Markdown
# -> remark-gfm + defaultSchema sanitize + table renderer; precedent 2019-06-02R q7).
Q23A_TABLE_FLAT = ("Wage (£w) Frequency 0 < w ≤ 600 7 600 < w ≤ 1200 13 "
                   "1200 < w ≤ 1800 28 1800 < w ≤ 2400 42 2400 < w ≤ 3000 10")
Q23A_TABLE_GFM = """
| Wage (£w) | Frequency |
| --- | --- |
| $0 < w \\le 600$ | 7 |
| $600 < w \\le 1200$ | 13 |
| $1200 < w \\le 1800$ | 28 |
| $1800 < w \\le 2400$ | 42 |
| $2400 < w \\le 3000$ | 10 |"""

MANIFEST_A = [
    # (set_slug, qid, part_order, {field: ("set" | "replace_sub", payload)})
    ("official-4mb1-01-2025-06", "offq_2025-06_01_6", 0,
     {"solutionMd": ("set", Q6_SOL)}),
    ("official-4mb1-01-2025-06", "offq_2025-06_01_8", 1,
     {"solutionMd": ("set", Q8B_SOL)}),
    ("official-4mb1-01-2025-06", "offq_2025-06_01_11", 0,
     {"solutionMd": ("set", Q11_SOL)}),
    ("official-4mb1-01-2025-06", "offq_2025-06_01_12", 0,
     {"solutionMd": ("set", Q12_SOL)}),
    ("official-4mb1-01-2025-06", "offq_2025-06_01_23", 0,
     {"problemMd": ("replace_sub", (Q23A_TABLE_FLAT, Q23A_TABLE_GFM))}),
]
