#!/usr/bin/env python3
"""run-017 tranche-3 manifest, part B: 2026-06 4MB1-01R fields.
Every after-text transcribed eyes-on from the printed MS of record:
MS 2026-06 01R p20-22 (q18 main+ALT1+ALT2), p23 (q19), p32-34 (q25 main+ALT1+ALT2), p36 (q27 a/b).
AS-PRINTED disclosures: '0.88, 0.23. 0.12, 0.26, 0.13' period-of-record;
p34 ALT2 note 'allow' missing-symbol gap transcribed verbatim.
"""

Q18_SOL = """$\\frac{x}{x+1} = \\sin 20 [= 0.342]$ 4 M1 Form correct equation in x using sin 20
oe eg $x = (x+1)\\sin 20$ Allow also BC or a mix of BC and x
Allow sin 20 to be awrt 0.34 throughout.
eg $\\frac{x}{\\sin 20} = \\frac{x+1}{\\sin 90}$
Allow a processing error for sin 20 if clearly seen written first
(general marking principle, if not precluded by the MS)
A common error seen will be where a candidate’s calculator is in
radians and they evaluate sin20 as 0.912945…..
Must be using a number with minimum 2dp.
Allow a misevaluation of sin20, if sin20 is seen, throughout, with
continued correct working.
$x = x\\sin 20 + \\sin 20$ Dep on 1st M1
oe eg $x - \\sin 20 = x\\sin 20$ Correctly removes fraction from equation and expands bracket
eg $0.34(2…)x + 0.34(2…) = x$ Can imply the previous method mark.
$x(1 - \\sin 20) = \\sin 20$ Dep on 2nd M1
oe eg $x(1 - \\sin 20) - \\sin 20 = 0$ Correctly separates terms in x (or collects if using awrt 0.34)
eg $[x =] \\frac{\\sin 20}{1 - \\sin 20} = \\frac{0.34(2…)}{1 - 0.34(2…)}$ Can imply previous 2 method marks.
cas 0.52 A1 awrt 0.52
ALT1 $\\left[(AB) = \\sqrt{(x+1)^2 - x^2} = \\sqrt{2x+1}\\right]$ 4 M1 For a correct equation in x and
sin20 or cos20 or tan20
$\\cos 20 = \\frac{\\sqrt{2x+1}}{x+1}$ oe eg $(\\cos 20)^2 = \\left(\\frac{\\sqrt{2x+1}}{x+1}\\right)^2$ oe sin20 = 0.34202…..
or cos20 = 0.93969….
tan20 = 0.36397….
$\\frac{\\sqrt{2x+1}}{\\sin 70} = \\frac{x}{\\sin 20}$ oe eg $\\frac{2x+1}{(\\sin 70)^2} = \\frac{x^2}{(\\sin 20)^2}$ eg $\\frac{\\sqrt{2x+1}}{\\sin 70} = \\frac{x+1}{[\\sin 90]}$
or (sin20)² = 0.11697…..
(cos20)² = 0.88302….
$\\tan 20 = \\frac{x}{\\sqrt{2x+1}}$ oe eg $(\\tan 20)^2 = \\left(\\frac{x}{\\sqrt{2x+1}}\\right)^2$ oe (tan20)² = 0.13247….
Allow awrt 2dp
$(\\cos 20)^2 x^2 + (2(\\cos 20)^2 - 2)x + (\\cos 20)^2 - 1[= 0]$ oe M1 dep on 1st M1
or For correct 3 term quadratic in cos20 or tan 20
$(\\sin 70)^2 x^2 - 2(\\sin 20)^2 x - (\\sin 20)^2 [= 0]$ oe
or Award if 2 out of 3 terms are correct
$(0.88302...)x^2 - (0.23395...)x - 0.11697...[= 0]$ oe
or Don’t need to see = 0
$x^2 - 2(\\tan 20)^2 - (\\tan 20)^2 [= 0]$ oe
or May imply previous M mark with 2
$x^2 - (0.26494...)x - 0.13247...[= 0]$ oe coefficients correct
Allow evaluated coefficients awrt
0.88, 0.23. 0.12, 0.26, 0.13
eg $[x =] \\frac{-\\left(2(\\cos 20)^2 - 2\\right) \\pm \\sqrt{\\left(\\left(2(\\cos 20)^2 - 2\\right)\\right)^2 - 4(\\cos 20)^2\\left((\\cos 20)^2 - 1\\right)}}{2(\\cos 20)^2}$ M1 dep on 2nd M1 (ie using a 3TQ with 2 out
of 3 terms correct)
Correct substitution into the quadratic formula
cas 0.52 A1 awrt 0.52
ALT2 $\\left[(AB) = \\sqrt{(x+1)^2 - x^2} = \\sqrt{2x+1}\\right]$ 4 M1 correct equation in x using cosine rule
$x^2 = (x+1)^2 + \\left(\\sqrt{2x+1}\\right)^2 - 2(x+1)\\left(\\sqrt{2x+1}\\right)\\cos 20$ oe cos70 = 0.34202…..
cos20 = 0.93969….
oe eg $\\cos 20 = \\frac{(x+1)^2 + 2x + 1 - x^2}{2(x+1)\\sqrt{2x+1}}$ Allow awrt 2dp
or
$\\left(\\sqrt{2x+1}\\right)^2 = (x+1)^2 + x^2 - 2x(x+1)\\cos 70$
$2(\\cos 20)^2 x^3 + (5(\\cos 20)^2 - 4)x^2 + 4\\left((\\cos 20)^2 - 4\\right)x + (\\cos 20)^2 - 1[= 0]$ M1 dep on 1st M1
or For correct 4 term cubic in cos20 or quadratic in cos70
$(1.76604...)x^3 + (0.41511...)x^2 - (0.46791...)x - 0.11697...[= 0]$ oe
or Award if 2 out of 4 terms are correct for the cubic
or 2 out of 3 terms correct for the quadratic.
$(2 - 2\\cos 70)x^2 - (2\\cos 70)x[= 0]$
or Don’t need to see = 0
$(1.31595....)x^2 - (0.68404....)x[= 0]$ May imply previous M mark with 2 coefficients
correct
Allow evaluated coefficients awrt
1.77, 0.42, - 0.47, - 0.12, 1.32, 0.68 in the relevant
cubic or quadratic
eg $x\\left((2 - 2\\cos 70)x - 2\\cos 70\\right)[= 0]$ oe M1 for correct factorisation or use of correct
oe eg $[x =] \\frac{2\\cos 70}{2 - 2\\cos 70}$ oe substitution into the quadratic formula to solve the
2TQ (with at least one term correct)
May be implied by awrt 0.52
cas 0.52 A1 awrt 0.52"""

Q19_SOL = """$3x^2 + 9x = 3x(x+3)$ 4 M1 Correctly factorises $3x^2 + 9x$
or or
$2x^2 + 9x + 9 = (2x+3)(x+3)$ factorises $2x^2 + 9x + 9$ correctly
May be awarded for factorising after the fractions are added,
in which case expect to see $3x(x+3)(x-2)$ in the denom
$\\frac{2x^2 + 9x + 9}{3x^2 + 9x} = \\frac{2x+3}{3x}$ M1
or Correct simplification of the second fraction.
$\\frac{(2x^2+9x+9)(x-2)}{(3x^2+9x)(x-2)} = \\frac{2x+3}{3x}$ May be awarded for simplification after the fractions are
added
$\\frac{3x(x-5) + (x-2)(2x+3)}{3x(x-2)}$ oe eg $\\frac{3x^2 - 15x}{3x^2 - 6x} + \\frac{2x^2 - x - 6}{3x^2 - 6x}$ M1 For the correct addition of the 2 correct fractions.
or Must reach a common denominator.
eg $\\frac{(3x^2 + 9x)(x-5)}{(3x^2 + 9x)(x-2)} + \\frac{(x-2)(2x^2 + 9x + 9)}{(3x^2 + 9x)(x-2)}$ This may be as separate fractions.
or
Missing brackets must be recovered.
eg $\\frac{3x(x+3)(x-5) + (x-2)(2x+3)(x+3)}{3x(x+3)(x-2)}$ May be implied by A1
or eg $\\frac{5x^3 - x^2 - 54x - 18}{3x^3 + 3x^2 - 18x}$
or eg $\\frac{3x^3 - 15x^2 + 9x^2 - 45x}{3x^3 + 9x^2 - 6x^2 - 18x} + \\frac{2x^3 + 9x^2 + 9x - 4x^2 - 18x - 18}{3x^3 + 9x^2 - 6x^2 - 18x}$
cas $\\frac{5x^2 - 16x - 6}{3x(x-2)}$ A1 oe must be simplified
eg $\\frac{5x^2 - 16x - 6}{3x^2 - 6x}$
Total 4 marks"""

Q25_SOL = """$\\left[\\overrightarrow{OB}\\right] = \\begin{pmatrix} -8-5\\lambda \\\\ 7+3\\lambda \\end{pmatrix}$ oe eg $\\begin{pmatrix} -8 \\\\ 7 \\end{pmatrix} + \\begin{pmatrix} -5\\lambda \\\\ 3\\lambda \\end{pmatrix}$ eg $\\begin{pmatrix} -8 \\\\ 7 \\end{pmatrix} + \\begin{pmatrix} 5\\lambda \\\\ -3\\lambda \\end{pmatrix}$ 5 M1 Find $\\overrightarrow{OB}$ by adding $\\overrightarrow{OA}$ and a multiple of $\\overrightarrow{AB}$
or
place $\\overrightarrow{OB}$ written with 2 variables equal to a multiple
oe eg $\\begin{pmatrix} x+8 \\\\ y-7 \\end{pmatrix} = \\begin{pmatrix} -5\\lambda \\\\ 3\\lambda \\end{pmatrix}$ eg $\\begin{pmatrix} x+8 \\\\ y-7 \\end{pmatrix} = \\begin{pmatrix} 5\\lambda \\\\ -3\\lambda \\end{pmatrix}$ of $\\overrightarrow{AB}$
Condone missing brackets from column vectors.
eg $\\begin{pmatrix} 8 \\\\ -7 \\end{pmatrix} + \\begin{pmatrix} \\sqrt{169-y^2} \\\\ y \\end{pmatrix} = \\begin{pmatrix} -5\\lambda \\\\ 3\\lambda \\end{pmatrix}$ or $\\begin{pmatrix} 5\\lambda \\\\ -3\\lambda \\end{pmatrix}$
eg $\\begin{pmatrix} 8 \\\\ -7 \\end{pmatrix} + \\begin{pmatrix} x \\\\ \\sqrt{169-x^2} \\end{pmatrix} = \\begin{pmatrix} -5\\lambda \\\\ 3\\lambda \\end{pmatrix}$ or $\\begin{pmatrix} 5\\lambda \\\\ -3\\lambda \\end{pmatrix}$
$\\sqrt{"(-8-5\\lambda)"^2 + "(7+3\\lambda)"^2} = 13$ oe eg M1 Use their $|\\overrightarrow{OB}| = 13$ to correctly form an equation
$"(-8-5\\lambda)"^2 + "(7+3\\lambda)"^2 = 13^2$ in their parameter using $x^2 + y^2 = 169$ and their $\\overrightarrow{OB}$
eg if using 5λ and −3λ $"(-8+5\\lambda)"^2 + "(7-3\\lambda)"^2 = 169$
eg $-7 + \\sqrt{169 - "(-5\\lambda-8)"^2} = 3\\lambda$ oe including for 5λ/−3λ
eg $\\sqrt{169 - "(3\\lambda+7)"^2} + 8 = -5\\lambda$ oe including for 5λ/−3λ
$34\\lambda^2 + 122\\lambda - 56[= 0]\\left[\\Rightarrow \\lambda = \\frac{7}{17}\\right]$ oe A1 oe Correct three term quadratic gained.
or if using 5λ and −3λ Do not need to see = 0
$34\\lambda^2 - 122\\lambda - 56[= 0]\\left[\\Rightarrow \\lambda = -\\frac{7}{17}\\right]$ Implied by correct λ
$-8 - 5\\times"\\frac{7}{17}"$ and $7 + 3\\times"\\frac{7}{17}"$ must use $\\lambda > -\\frac{8}{5}$ M1 dep on previous 2 M marks or dep on correct λ
or if using 5λ and −3λ seen for substituting their λ into a correct $\\overrightarrow{OB}$ to find
both coordinates (working must be seen for an
$-8 + 5\\times-"\\frac{7}{17}"$ and $7 - 3\\times-"\\frac{7}{17}"$ must use $\\lambda < \\frac{8}{5}$ incorrect λ, allow λ to be any other letter
throughout)
Both correct coordinates can imply this mark.
cas $\\left(-\\frac{171}{17}, \\frac{140}{17}\\right)$ A1
oe fractions
ALT1 $\\left[\\overrightarrow{OB} = \\overrightarrow{OA} + \\overrightarrow{AB}\\right]$ 5 M1 Find $\\overrightarrow{OB}$ by adding $\\overrightarrow{OA}$ and a multiple of $\\overrightarrow{AB}$
$\\left[\\overrightarrow{OB} = \\overrightarrow{OA} + k\\overrightarrow{OC}\\right]$ or
place $\\overrightarrow{OB}$ written with 2 variables equal to a
$\\left[\\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} -8-5k \\\\ 7+3k \\end{pmatrix}\\right]$ oe eg $\\begin{pmatrix} x+8 \\\\ y-7 \\end{pmatrix} = \\begin{pmatrix} -5k \\\\ 3k \\end{pmatrix}$ multiple of $\\overrightarrow{AB}$
Condone missing brackets from column vectors.
$\\frac{"x+8"}{-5} = k = \\frac{"y-7"}{3} \\Rightarrow x =$ or $y =$ and $x^2 + y^2 = 13^2$ M1 using their $\\overrightarrow{OB}$ allow any letters for x and y
or Correctly rearrange each component for k and write
x in terms of y or y in terms of x
$\\left[\\text{"slope" of } \\overrightarrow{OC}\\right] = -\\frac{3}{5} = \\frac{"y-7"}{"8+x"}\\left[\\text{"slope" of } \\overrightarrow{AB}\\right]$ oe or
correctly use "slope" of $\\overrightarrow{OC}$ = "slope" of $\\overrightarrow{AB}$
eg $-3(x+8) = 5(y-7)$ eg $y = -\\frac{3}{5}x + \\frac{11}{5} \\Rightarrow x =$ or $y =$ and write x in terms of y or y in terms of x (this
approach can imply first M mark)
$\\left[x = \\frac{-5y+11}{3} \\quad y = \\frac{3x-11}{-5}\\right]$ and
state $x^2 + y^2 = 13^2$
The rearrangement for k or use of gradient must be
correct and checked for their $\\overrightarrow{OB}$
the expression for x in terms of y or y in terms of x
needs to be present, but doesn’t need to be checked.
$34y^2 - 110y - 1400[= 0]$ or $34x^2 - 66x - 4104[= 0]$ oe A1 oe Correct three term quadratic gained.
$\\left[\\Rightarrow y = \\frac{140}{17} = 8.2(35294.......) \\atop x = \\frac{-171}{17} = -10.0(58823....)\\right]$ Do not need to see = 0
Look for equivalent coefficients eg
$17x^2 - 33x - 2052[= 0]$ oe
Implied by correct x or y allow awrt 1dp
$x = \\frac{-5\\left(\\frac{140}{17}\\right)+11}{3}$ or $y = \\frac{3\\left(-\\frac{171}{17}\\right)-11}{-5}$ oe M1 dep on both previous method marks or dep on
or correct x or y
$x = \\sqrt{169 - \\left(\\frac{140}{17}\\right)^2}$ or $y = \\sqrt{169 - \\left(-\\frac{171}{17}\\right)^2}$ for substituting their x into a correct expression for
y or their y into a correct expression for x
(working must be seen for an incorrect x or y, allow
to be any other letters throughout)
Both correct coordinates can imply this mark.
cas $\\left(-\\frac{171}{17}, \\frac{140}{17}\\right)$ A1
oe fractions
ALT2 $\\left[\\overrightarrow{OB} = \\overrightarrow{OA} + \\overrightarrow{AB}\\right]$ 5 M1 Find $\\overrightarrow{OB}$ by adding $\\overrightarrow{OA}$ and a multiple of $\\overrightarrow{AB}$
$\\left[\\overrightarrow{OB} = \\overrightarrow{OA} + k\\overrightarrow{OC}\\right]$ or
place $\\overrightarrow{OB}$ written with 2 variables equal to a
$\\left[\\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} -8-5k \\\\ 7+3k \\end{pmatrix}\\right]$ oe eg $\\begin{pmatrix} x+8 \\\\ y-7 \\end{pmatrix} = \\begin{pmatrix} -5k \\\\ 3k \\end{pmatrix}$ multiple of $\\overrightarrow{AB}$
Condone missing brackets from column vectors.
$[8 + x = -5k \\quad y - 7 = 3k]$ M1 using their $\\overrightarrow{OB}$ allow any letters for x and y
Correctly rearranges one component for k and
$8 + \\sqrt{169-y^2} = -5\\left(\\frac{-7+y}{3}\\right)$ oe correctly substitutes into the other component using
$x^2 + y^2 = 13^2$ – this may be implied by a correct
or $3\\left(\\frac{8+x}{-5}\\right) = -7 + \\sqrt{169-x^2}$ oe quadratic in x or y, usually with a square root sign.
Allow any letters for x and y
$34y^2 - 110y - 1400[= 0]$ or $34x^2 - 66x - 4104[= 0]$ oe A1 oe Correct three term quadratic gained.
$\\left[\\Rightarrow y = \\frac{140}{17} = 8.2(35294.......) \\atop x = \\frac{-171}{17} = -10.0(58823....)\\right]$ Do not need to see = 0
Look for equivalent coefficients eg
$17x^2 - 33x - 2052[= 0]$ oe
Implied by correct x or y allow awrt 1dp
$x = \\frac{-5\\left(\\frac{140}{17}\\right)+11}{3}$ or $y = \\frac{3\\left(-\\frac{171}{17}\\right)-11}{-5}$ M1 dep on both previous method marks or dep on
Or correct x or y
$x = \\sqrt{169 - \\left(\\frac{140}{17}\\right)^2}$ or $y = \\sqrt{169 - \\left(-\\frac{171}{17}\\right)^2}$ for substituting their x into a correct expression for
y or their y into a correct expression for x
(working must be seen for an incorrect x or y, allow
to be any other letters throughout)
Both correct coordinates can imply this mark.
cas $\\left(-\\frac{171}{17}, \\frac{140}{17}\\right)$ A1
oe fractions
Total 5 marks"""

Q27A_SOL = """$\\frac{360}{x+2}$ oe 1 B1 oe eg $180 - \\frac{180x}{x+2}$"""

Q27B_SOL = """$\\frac{360}{x} - 9 = "\\frac{360}{x+2}"$ 3 M1 Form correct equation but ft their answer for part (a)
oe eg $"180 - \\frac{180x}{x+2}" + 9 = 180 - \\frac{180(x-2)}{x}$ Note from a correct expression in part (a) an equivalent
oe eg $"189 - \\frac{180x}{x+2}" = 180 - \\frac{180(x-2)}{x}$ equation is
$\\left[-\\right]\\frac{180x}{x+2} + 9 = \\left[-\\right]\\frac{180(x-2)}{x}$
Eg $360(x+2) - 9x(x+2) = 360x$ oe M1 for correct method to remove the denominators from
eg $360x + 720 = 9x^2 + 18x + 360x$ the correct equation but
$[9x^2 + 18x - 720 = 0]$ Condone correct method to remove denominators from
$\\frac{360}{x} + 9 = "\\frac{360}{x+2}"$
$\\frac{360}{x} = "\\frac{360}{x+2}" - 9$
$\\frac{360}{x} = "\\frac{360}{x+2}"$
oe
$180 - "\\frac{180x}{x+2}" - 9 = 180 - \\frac{180(x-2)}{x}$
$\\left[-\\right]\\frac{180x}{x+2} = \\left[-\\right]\\frac{180(x-2)}{x} + 9$
$171 - "\\frac{180x}{x+2}" = 180 - \\frac{180(x-2)}{x}$
wr Correctly shown A1 for fully correct working
Allow = 0 to be missing on the final answer only"""

MANIFEST_B = [
    ("official-4mb1-01r-2026-06", "offq_2026-06_01r_18", 0,
     {"solutionMd": ("set", Q18_SOL)}),
    ("official-4mb1-01r-2026-06", "offq_2026-06_01r_19", 0,
     {"solutionMd": ("set", Q19_SOL)}),
    ("official-4mb1-01r-2026-06", "offq_2026-06_01r_25", 0,
     {"solutionMd": ("set", Q25_SOL)}),
    ("official-4mb1-01r-2026-06", "offq_2026-06_01r_27", 0,
     {"solutionMd": ("set", Q27A_SOL)}),
    ("official-4mb1-01r-2026-06", "offq_2026-06_01r_27", 1,
     {"solutionMd": ("set", Q27B_SOL)}),
]
