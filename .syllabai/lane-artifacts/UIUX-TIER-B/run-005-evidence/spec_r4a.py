#!/usr/bin/env python3
"""run-005 R4-A patch spec: list of (slug, q, part, field, old_or_None, new, label).
old=None => full-field replacement. Every old must match exactly once (fail-closed).
All fixes eyes-on transcribed from committed MS page renders (run-004 evidence pack) / run-005 renders."""

P = []

def add(slug,q,part,field,old,new,label):
    P.append((slug,q,part,field,old,new,label))

# ---- 2019-06-01 q17p1 (mspage-2019-06-4MB1-01-p10) ----
add('2019-06-4mb1-01--exam-questions',17,1,'solutionMd', None,
 '**P3** (1 mark) Complete method (e.g. Pythagoras followed by sine,\n'
 '- Note: cosine rule, etc.)\n'
 '- Note: $\\cos x\\degree = \\dfrac{4}{12}$ or $\\sin x\\degree = \\dfrac{[(\\sin 90)\\sqrt{12^2 - 4^2}]}{12}$ or\n'
 '- Note: $\\tan x\\degree = \\dfrac{\\sqrt{12^2 - 4^2}}{4}$ or $\\cos x\\degree = \\dfrac{12^2 + 4^2 - (\\sqrt{12^2 - 4^2})^2}{2 \\times 12 \\times 4}$\n'
 '- Note: Allow $8\\sqrt{2}$ or awrt 11.3 for $\\sqrt{12^2 - 4^2}$\n\n'
 '**P4** (1 mark) awrt 70.5',
 'r5-d1-1906-01-q17p1-cos')

# ---- 2021-01-01 q25p0 (mspage-2021-01-4MB1-01-p18) ----
add('2021-01-4mb1-01--exam-questions',25,0,'solutionMd', None,
 '**P1** (1 mark) where $\\theta$ is one of the base angles of the isosceles triangles\n'
 '- Note: $\\cos \\theta = \\dfrac{17}{32.3}$ or $\\cos \\theta = \\dfrac{34^2 + 32.3^2 - 32.3^2}{2 \\times 34 \\times 32.3}$\n'
 '- Note: $(\\theta = 58.24313614\\ldots)$\n'
 '- Note: or\n'
 '- Note: $\\sin\\left(\\dfrac{1}{2}\\alpha\\right) = \\dfrac{17}{32.3}$ or $\\cos \\alpha = \\dfrac{32.3^2 + 32.3^2 - 34^2}{2(32.3)(32.3)}$\n'
 '- Note: $(\\alpha = 63.51372772\\ldots)$ Where $\\alpha$ is the angle at the vertex of the isosceles triangles\n\n'
 '**P2** (1 mark) on previous M mark\n'
 '- Note: $AN^2 = 34^2 + 16.15^2 - 2 \\times 34 \\times 16.15 \\times \\cos"58.2"$\n'
 '- Note: or\n'
 '- Note: $AN^2 = 32.3^2 + 16.15^2 - 2 \\times 32.3 \\times 16.15 \\times \\cos"63.5"$\n\n'
 '**P3** (1 mark) (for reference: 28.96243256… if exact values)\n'
 '- Note: 28.817854… if using 63, 29.09921… if using 64,\n'
 '- Note: 28.958570… if using 63.5,\n'
 '- Note: 28.950296… if using 58.2, 28.894033… if using 58 so\n'
 '- Note: check carefully that value of AN is accurate with angle\n'
 '- Note: used\n\n'
 '**P4** (1 mark) although exact allow awrt 17 e.g. may come from\n'
 '- Note: $MN^2 = 16.15^2 + 16.15^2 - 2 \\times 16.15 \\times 16.15 \\times \\cos(63.51\\ldots)$\n\n'
 '**P5** (1 mark) dep on both previous M1 marks\n\n'
 '**P6** (1 mark) (correct working only) awrt 46 (for reference:\n'
 '- Note: 45.96243256…)',
 'r5-d2-2101-01-q25p0-cos')

# ---- 2021-01-01R q27p1 (mspage-2021-01-4MB1-01R-p20) ----
add('2021-01-4mb1-01r--exam-questions',27,1,'solutionMd',
 '- Note: multiplication of all midpoints by frequencies (without\n'
 '- Note: + ( 35 x 28) + ( 45 x14 ) (=2265) addition) or multiplication of frequencies by a consistent\n'
 '- Note: value in interval (condone one error only) and addition',
 '- Note: $(17.5 \\times 12) + (22.5 \\times 10) + (27.5 \\times 8)$\n'
 '- Note: $+ (35 \\times 28) + (45 \\times 14)$ (=2265)\n'
 '- Note: multiplication of all midpoints by frequencies (without addition) or multiplication of frequencies by a consistent\n'
 '- Note: value in interval (condone one error only) and addition',
 'r5-d3-2101-01r-q27p1-midpoints')

# ---- 2021-01-02R q10p3 (mspage-2021-01-4MB1-02R-p20) ----
add('2021-01-4mb1-02r--exam-questions',10,3,'solutionMd',
 '- Note: Area of \u0394OAD = x12 x "5"[ = 30] or\n'
 '- Note: 2 OAD or ADX\n'
 '- Note: 1 1\n'
 '- Note: Area of \u0394ADX = x "5"x  x12  [ = 5] or\n'
 '- Note: 2 6\n'
 '- Note: 1   6  1\n'
 '- Note: x sin  tan \u22121    x "5"x " "x 6 + 12.5 [ = 5]\n'
 '- Note: 2 2\n'
 '- Note: 2   12.5   3',
 '- Note: Area of $\\Delta OAD = \\dfrac{1}{2} \\times 12 \\times "5"$ [= 30] or\n'
 '- Note: Area of $\\Delta ADX = \\dfrac{1}{2} \\times "5" \\times \\left(\\dfrac{1}{6} \\times 12\\right)$ [= 5] or\n'
 '- Note: $\\dfrac{1}{2} \\times \\sin\\left(\\tan^{-1}\\left(\\dfrac{6}{12.5}\\right)\\right) \\times "5" \\times \\dfrac{1}{3} \\times \\sqrt{6^2 + 12.5^2}$ [= 5]',
 'r5-d4-2101-02r-q10p3-areas')

# ---- 2021-06-01 q14p0 (mspage-2021-06-4MB1-01-p11 + 6x zoom crop) ----
add('2021-06-4mb1-01--exam-questions',14,0,'solutionMd', None,
 '**P1** (1 mark)\n'
 '- Note: $[AX =] \\sqrt{4^2 + 4^2} \\left[= \\sqrt{32} \\text{ or } 5.656\\ldots\\right]$ oe\n'
 '- Note: Allow $[AX =] \\dfrac{1}{2}\\sqrt{8^2 + 8^2}$\n\n'
 '**P2** (1 mark) dep on previous M mark being awarded. A correct method to find $\\angle EAX$ eg using\n'
 '- Note: $\\tan(\\angle EAX) = \\dfrac{15}{\\sqrt{4^2 + 4^2}}$\n'
 '- Note: $\\tan(\\angle AEX) = \\dfrac{\\sqrt{4^2 + 4^2}}{15}$ and $\\angle EAX = 90 - \\angle AEX$\n\n'
 '**P3** (1 mark) awrt 69.3 Working not required, so correct answer scores full\n'
 '- Note: marks (unless from obvious incorrect working)\n'
 '- Note: Alternatives for the 2nd M1\n'
 '- Note: $[AE =] \\sqrt{\\left(\\sqrt{4^2 + 4^2}\\right)^2 + 15^2} \\left[= \\sqrt{257}\\right]$ and $\\sin EAX = \\dfrac{15}{\\sqrt{\\text{"257"}}}$ or $\\sin EAX = \\dfrac{15\\sin 90}{\\sqrt{\\text{"257"}}}$ or $\\cos EAX = \\dfrac{\\text{"}\\sqrt{32}\\text{"}}{\\text{"}\\sqrt{257}\\text{"}}$\n'
 '- Note: $[AE =] \\sqrt{\\left(\\sqrt{4^2 + 4^2}\\right)^2 + 15^2} \\left[= \\sqrt{257}\\right]$ and $\\angle EAX = 90 - \\angle AEX$ and $\\sin AEX = \\dfrac{\\text{"}\\sqrt{32}\\text{"}}{\\sqrt{\\text{"257"}}}$ or $\\sin AEX = \\dfrac{\\text{"}\\sqrt{32}\\text{"}\\sin 90}{\\sqrt{\\text{"257"}}}$ or $\\cos AEX = \\dfrac{15}{\\sqrt{\\text{"257"}}}$\n'
 '- Note: $[AE =] \\sqrt{\\left(\\sqrt{4^2 + 4^2}\\right)^2 + 15^2} \\left[= \\sqrt{257}\\right]$ and $\\cos(\\angle EAX) = \\dfrac{\\text{"257"} + \\text{"32"} - 15^2}{2 \\times \\text{"}\\sqrt{257}\\text{"} \\times \\text{"}\\sqrt{32}\\text{"}}$\n'
 '- Note: $[AE =] \\sqrt{\\left(\\sqrt{4^2 + 4^2}\\right)^2 + 15^2} \\left[= \\sqrt{257}\\right]$ and $\\cos(\\angle AEX) = \\dfrac{\\text{"257"} + 15^2 - \\text{"32"}}{2 \\times \\text{"}\\sqrt{257}\\text{"} \\times 15}$ and $\\angle EAX = 90 - \\angle AEX$\n'
 '- Note: Alternative for M1M1 - Finding EA from triangle EAD\n'
 '- Note: $M1 [AE =] \\sqrt{\\left(\\sqrt{4^2 + 15^2}\\right)^2 + 4^2} \\left[= \\sqrt{257}\\right]$\n'
 '- Note: $M1\\dep \\sin EAX = \\dfrac{15}{\\sqrt{\\text{"257"}}}$ or $\\sin EAX = \\dfrac{15\\sin 90}{\\sqrt{\\text{"257"}}}$ or another correct method to find $EAX$',
 'r5-d5-2106-01-q14p0-alt')

# ---- 2021-06-02 q8p1 (mspage-2021-06-4MB1-02-p15) ----
add('2021-06-4mb1-02--exam-questions',8,1,'solutionMd',
 '**P3** (1 mark) for the use of any value in interval (including end points) for at least 4 (of\n'
 '- Note: (167.5 x12 ) + (180 x 3) the 6) products added together\n'
 '- Note: "7202.5"\n\n'
 '**P4** (1 mark) on at least 1 of the previous M marks for dividing by 45\n'
 '- Note: 45\n'
 '- Note: 2881\n\n'
 '**P5** (1 mark) awrt 160.1 (for reference: 160.055555\u2026) allow exact e.g.,\n'
 '- Note: 18',
 '**P3** (1 mark) for the use of any value in interval (including end points) for at least 4 (of\n'
 '- Note: the 6) products added together\n'
 '- Note: $(145 \\times 5) + (152.5 \\times 8) + (157.5 \\times 11) + (162.5 \\times 6) + (167.5 \\times 12) + (180 \\times 3)$\n\n'
 '**P4** (1 mark) dep on at least 1 of the previous M marks for dividing by 45\n'
 '- Note: $\\dfrac{\\text{"7202.5"}}{45}$\n\n'
 '**P5** (1 mark) awrt 160.1 (for reference: 160.055555\u2026) allow exact e.g., $\\dfrac{2881}{18}$',
 'r5-d6-2106-02-q8p1-mean')

# ---- 2021-11-01 q11p0 (mspage-2021-11-4MB1-01-p08) ----
add('2021-11-4mb1-01--exam-questions',11,0,'solutionMd', None,
 '**P1** (1 mark) for a correct start to a method to find any angle in the triangle or 112.4\u00b0 or 38.047\u2026\u00b0 (ie another angle found correctly)\n'
 '- Note: $8^2 = 10^2 + 15^2 - 2 \\times 10 \\times 15 \\times \\cos A$ or\n'
 '- Note: $10^2 = 8^2 + 15^2 - 2 \\times 8 \\times 15 \\times \\cos A$ or\n'
 '- Note: $15^2 = 8^2 + 10^2 - 2 \\times 8 \\times 10 \\times \\cos A$ oe\n\n'
 '**P2** (1 mark) dep for a fully correct method to find\n'
 '- Note: $\\cos A = \\left(\\dfrac{10^2 + 15^2 - 8^2}{2 \\times 10 \\times 15}\\right)\\left[= \\dfrac{261}{300}\\right]$ smallest angle e.g.\n'
 '- Note: $180 - \\cos^{-1}\\left(\\dfrac{10^2 + 8^2 - 15^2}{2 \\times 10 \\times 8}\\right) - \\cos^{-1}\\left(\\dfrac{8^2 + 15^2 - 10^2}{2 \\times 8 \\times 15}\\right)$\n'
 '- Note: or $180 - \\text{"112.4"} - \\sin^{-1}\\left(\\dfrac{10\\sin\\text{"112.4"}}{15}\\right)$\n'
 '- Note: An indirect method must lead to the angle opposite 8 being the smallest.\n\n'
 '**P3** (1 mark) awrt 29.5',
 'r5-d7-2111-01-q11p0-cosine')

# ---- 2021-11-01 q23p0 (mspage-2021-11-4MB1-01-p17) ----
add('2021-11-4mb1-01--exam-questions',23,0,'solutionMd', None,
 '**P1** (1 mark) allow $3\\dfrac{3}{8}$, $\\dfrac{27}{8}$, $3\\dfrac{11}{24}$ or $\\dfrac{83}{24}$\n'
 '- Note: 3 hours 22.5 mins, 3.375 hours, 202.5 mins, 3 hours 27.5 mins, 3.4583 hours or 207.5 mins\n\n'
 '**P2** (1 mark) allow for a calculation of speed in km/hr or km/min\n'
 '- Note: $\\dfrac{215}{3.375}$ or $\\dfrac{215}{202.5}\\left[\\times 60\\right]$\n'
 '- Note: For 215 allow 200 to 220 inclusive\n'
 '- Note: For 3.375 allow 3.33 to 3.5 inclusive\n'
 '- Note: For 202.5 allow 200 to 210 inclusive\n\n'
 '**P3** (1 mark) dep for $\\dfrac{\\text{UB}}{\\text{LB}}$ with 210 < UB \u2264 215 and\n'
 '- Note: 3.375 \u2264 LB < 3.417 (202.5 \u2264 LB < 205)\n\n'
 '**P4** (1 mark) awrt 63.7 answer must come from use of\n'
 '- Note: the correct values for the bounds',
 'r5-d8-2111-01-q23p0-speed')

# ---- quote-convention repair for already-applied q25p0 patch (run-004 house law: \text{"..."}) ----
add('2021-01-4mb1-01--exam-questions',25,0,'solutionMd',
 '$AN^2 = 34^2 + 16.15^2 - 2 \\times 34 \\times 16.15 \\times \\cos"58.2"$',
 '$AN^2 = 34^2 + 16.15^2 - 2 \\times 34 \\times 16.15 \\times \\cos\\text{"58.2"}$',
 'r5-d9-2101-01-q25p0-quote1')
add('2021-01-4mb1-01--exam-questions',25,0,'solutionMd',
 '$AN^2 = 32.3^2 + 16.15^2 - 2 \\times 32.3 \\times 16.15 \\times \\cos"63.5"$',
 '$AN^2 = 32.3^2 + 16.15^2 - 2 \\times 32.3 \\times 16.15 \\times \\cos\\text{"63.5"}$',
 'r5-d10-2101-01-q25p0-quote2')

# ---- 2022-01-01 q1p0 (mspage-2022-01-4MB1-01-p05) ----
add('2022-01-4mb1-01--exam-questions',1,0,'solutionMd', None,
 '**P1** (1 mark) A correct method to enable the LCM to be found.\n'
 '- Note: $180 = 2 \\times 2 \\times 3 \\times 3 \\times 5$\n'
 '- Note: $198 = 2 \\times 3 \\times 3 \\times 11$\n'
 '- Note: or\n'
 '- Note: 2 180 198\n'
 '- Note: 3 90 99\n'
 '- Note: 3 30 33\n'
 '- Note: 2 10 11\n'
 '- Note: 5 5 11\n'
 '- Note: 11 1 11\n'
 '- Note: 1 1\n'
 '- Note: Correct factorisation of 180 and 198 allow on factor trees.\n'
 '- Note: For the table they must divide both numbers by those shaded (or other combination with a product of 18) in grey at some point. All other lines are optional but must be correct if seen (2 and 5 could be combined to give 10).\n'
 '- Note: Division could be in a different order.\n'
 '- Note: Allow list of multiples - at least 5 correct for each number, excluding 180 and 198 eg.\n'
 '- Note: 360,540,720,900,1080 and 396, 594, 792, 990,1188\n\n'
 '**P2** (1 mark) Allow $2^2 \\times 3^2 \\times 5 \\times 11$',
 'r5-e1-2201-01-q1p0-lcm')

# ---- 2022-01-01 q25p0 (ms-2022-01-01-p17 + mspage-2022-01-4MB1-01-p18) ----
add('2022-01-4mb1-01--exam-questions',25,0,'solutionMd', None,
 '**P1** (1 mark)\n'
 '- Note: $8(x^2 - 7x) + 17\\ [= 0]$ or\n'
 '- Note: $8\\left(x^2 - 7x + \\dfrac{17}{8}\\right)[= 0]$ Allow $p = 8$. Factorising out 8 allow one numeric or sign error.\n\n'
 '**P2** (1 mark)\n'
 '- Note: $8\\left(\\left(x - \\dfrac{7}{2}\\right)^2 - \\dfrac{49}{4}\\right) + 17\\ [= 0]$ or\n'
 '- Note: $8\\left(\\left(x - \\dfrac{7}{2}\\right)^2 - \\dfrac{49}{4} + \\dfrac{17}{8}\\right)[= 0]$ dep Correct method for completing the square .\n'
 '- Note: allow a maximum of one numeric or sign error in total. Coefficient of x must be halved.\n'
 '- Note: Allow $p = 8$ and $q = -3.5$ oe\n\n'
 '**P3** (1 mark)\n'
 '- Note: $8\\left(x - \\dfrac{7}{2}\\right)^2 - 81[= 0]$ Allow $p = 8$, $q = -3.5$ and $r = 81$ oe\n'
 '- Note: dep Obtain expression in the required form, allow a maximum of one numeric or sign error in total.\n'
 '- Note: For candidates using the quadratic formula use the alternative scheme for subsequent marks.\n\n'
 '**P4** (1 mark)\n'
 '- Note: $x - \\dfrac{7}{2} = [\\pm]\\sqrt{\\dfrac{81}{8}}$ indep Must follow from an equation in the form $a(bx + c)^2 + d = 0$ for rearranging and squarerooting\n'
 '- Note: May be implied by a correct answer.\n'
 '- Note: Condone just one root given\n\n'
 '**P5** (1 mark)\n'
 '- Note: $x = \\dfrac{7}{2} \\pm \\dfrac{9\\sqrt{8}}{8}$ dep on previous M mark. Must have 2 roots\n'
 '- Note: Rationalising the denominator require an expression for x in the form\n'
 '- Note: $a \\pm b\\sqrt{2}$ or $a \\pm b\\sqrt{8}$ where $a$ and $b$ are rational or\n'
 '- Note: $\\dfrac{a \\pm b\\sqrt{2}}{c}$ or $\\dfrac{a \\pm b\\sqrt{8}}{c}$ where $a$, $b$ and $c$ are integers\n'
 '- Note: May be implied by a correct answer.\n\n'
 '**P6** (1 mark)\n'
 '- Note: $x = \\dfrac{14 \\pm 9\\sqrt{2}}{4}$ oe dep on first three M marks awarded. Allow\n'
 '- Note: answer given as decimal if correct answer seen.\n'
 '- Note: 25 ALT A candidate who attempts to complete the\n'
 '- Note: square should be awarded the first three marks\n'
 '- Note: in line with the main scheme.\n\n'
 '**P7** (1 mark) A fully correct substitution into a fully correct\n'
 '- Note: $[x =] \\dfrac{-(-56) \\pm \\sqrt{(-56)^2 - 4 \\times 8 \\times 17}}{2 \\times 8}$ quadratic equation formula.\n'
 '- Note: Allow if an incorrect quadratic equation is used following an attempt to complete the square as long as the expanded quadratic is clearly stated.\n\n'
 '**P8** (1 mark) Correct answer only (or equivalent in the required\n'
 '- Note: $x = \\dfrac{14 \\pm 9\\sqrt{2}}{4}$\n'
 '- Note: form), must gain the previous mark to gain this. A\n'
 '- Note: correct solution with no working seen gains no\n'
 '- Note: marks. Isw if the answer is given as a decimal after\n'
 '- Note: correct answer seen.\n'
 '- Note: A candidate who completes the square then uses\n'
 '- Note: the quadratic equation formula can score a\n'
 '- Note: maximum of 5 marks.\n'
 '- Note: A candidate who does not attempt to complete\n'
 '- Note: the square and who only uses the quadratic\n'
 '- Note: formula can score a maximum of 2 marks.',
 'r5-e2-2201-01-q25p0-quad')

# ---- 2022-01-02R q11p1 (mspage-2022-01-4MB1-02R-p14) ----
add('2022-01-4mb1-02r--exam-questions',11,1,'solutionMd',
 '**P5** (1 mark)\n\n**P6** (1 mark)\n'
 '- Note: 152 \u2212 "14.095"2 (= 5.13)\n'
 '- Note: 0.5 x 152 + 152 \u2212 2 x15 x15 x cos 40 (=5.13)\n'
 '- Note: Or AD = 152 + 152 \u2212 2 x15 x15 x cos 40(= 10.26...)\n\n'
 '**P7** (1 mark)\n'
 '- Note: (area of base =) 6 x x ("5.13...") 2$\\times$sin(60) oe\n'
 '- Note: 2\n'
 '- Note: (=68.38...)\n\n'
 '**P8** (1 mark)\n'
 '- Note: (volume =) x 6 x ("5.13...") 2 x sin(60) x "14.095..." oe\n'
 '- Note: 3 2\n\n'
 '**P9** (1 mark) awrt 321\n'
 '- Note: Pearson Education Limited. Registered company number 872828\n'
 '- Note: with its registered office at 80 Strand, London, WC2R 0RL, United Kingdom',
 '**P5** (1 mark)\n'
 '- Note: (height =) $15\\cos 20\\ (= 14.095\\ldots)$ oe\n\n'
 '**P6** (1 mark)\n'
 '- Note: (side of base =) $15\\sin 20\\ (= 5.13\\ldots)$ oe eg\n'
 '- Note: $\\sqrt{15^2 - \\text{"14.095"}^2}\\ (= 5.13)$\n'
 '- Note: $0.5 \\times \\sqrt{15^2 + 15^2 - 2 \\times 15 \\times 15 \\times \\cos 40}\\ (= 5.13)$\n'
 '- Note: Or $AD = \\sqrt{15^2 + 15^2 - 2 \\times 15 \\times 15 \\times \\cos 40}\\ (= 10.26\\ldots)$\n\n'
 '**P7** (1 mark)\n'
 '- Note: (area of base =) $6 \\times \\dfrac{1}{2} \\times (\\text{"5.13\\ldots"})^2 \\times \\sin(60)$ oe\n'
 '- Note: (=68.38...)\n\n'
 '**P8** (1 mark)\n'
 '- Note: (volume =) $\\dfrac{1}{3} \\times 6 \\times \\dfrac{1}{2} \\times (\\text{"5.13\\ldots"})^2 \\times \\sin(60) \\times \\text{"14.095\\ldots"}$ oe\n\n'
 '**P9** (1 mark) awrt 321',
 'r5-e3-2201-02r-q11p1-pyramid')

# ---- 2022-06-01 q24p0 (mspage-2022-06-4MB1-01-p20) ----
add('2022-06-4mb1-01--exam-questions',24,0,'solutionMd', None,
 '**P1** (1 mark)\n'
 '- Note: $\\dfrac{\\sin A}{12} = \\dfrac{\\sin 30}{6.5}$ oe\n'
 '- Note: $CN = 12\\sin 30\\ (= 6)$ where $CN$ is perpendicular to $AB$\n\n'
 '**P2** (1 mark) dep assumes previous mark unless\n'
 '- Note: $\\sin A = \\dfrac{12\\sin 30}{6.5}$ they use $BN = 12\\cos 30$\n'
 '- Note: $BN = \\sqrt{12^2 - \\text{"6"}^2}\\ \\left(6\\sqrt{3} = 10.39\\ldots\\right)$\n'
 '- Note: $BN = \\dfrac{12\\sin 30}{\\tan 30}$ or $BN = 12\\cos 30$\n\n'
 '**P3** (1 mark)\n'
 '- Note: $A = \\sin^{-1}\\left(\\dfrac{12\\sin 30}{6.5}\\right)\\ (= 67.3(8\\ldots))$\n'
 '- Note: $AN = \\sqrt{6.5^2 - (12\\sin 30)^2}\\ (= 2.5)$\n\n'
 '**P4** (1 mark) method to find correct angle or\n'
 '- Note: $180 - 30 - (180 - \\text{"67.38\\ldots"})\\ (= 37.38)$ or correct side for smallest area.\n'
 '- Note: $\\dfrac{1}{2} \\times 12 \\times 6.5 \\times \\sin\\text{"82.619\\ldots"}\\ (= 38.6(7\\ldots))$\n'
 '- Note: or\n'
 '- Note: $\\dfrac{1}{2} \\times (\\text{"10.39"}\\ldots + \\text{"2.5"}) \\times 6\\ (= 38.6(7\\ldots))$\n'
 '- Note: (where $180 - 30 - \\text{"67.38\\ldots"}\\ (= 82.619\\ldots)$)\n'
 '- Note: or Correct method to find largest area\n\n'
 '**P5** (1 mark) use of correct angle or correct lengths\n'
 '- Note: $\\dfrac{1}{2} \\times 12 \\times 6.5 \\times \\sin\\text{"37.38\\ldots"}$ or $\\dfrac{1}{2} \\times (10.39\\ldots - \\text{"2.5"}) \\times 6$\n'
 '- Note: $\\dfrac{1}{2} \\times \\dfrac{6.5\\sin\\text{"37.3(8..)"}}{\\sin 30} \\times 12 \\times \\sin 30$ or\n'
 '- Note: $\\dfrac{1}{2} \\times \\dfrac{6.5 \\times \\sin 37.3(8..)}{\\sin 30} \\times 6.5 \\times \\sin\\text{"112.6"}$ for smaller triangle area in a correct formula\n'
 '- Note: $6.5^2 = AB^2 + 12^2 - 2 \\times AB \\times 12 \\times \\cos 30$\n'
 '- Note: $AB^2 - 12\\sqrt{3}AB + 101.75\\ (= 0)$\n'
 '- Note: $(AB =) \\dfrac{12\\sqrt{3} \\pm \\sqrt{\\left(12\\sqrt{3}\\right)^2 - 4 \\times 1 \\times 101.75}}{2 \\times 1}$ (allow as far as $\\dfrac{12\\sqrt{3} \\pm \\sqrt{432 - 407}}{2}$)\n'
 '- Note: allow some simplification and 1 sign error (gives 7.89, 12.89) (could complete the square)\n'
 '- Note: For selecting $AB = 7.89$ or $\\dfrac{1}{2} \\times (\\text{"12.89\\ldots"}) \\times 6\\ (= 38.6(7\\ldots))$ (continued below) using the correct formula for the larger triangle\n'
 '- Note: $\\dfrac{1}{2} \\times 12 \\times \\text{"7.89"} \\times \\sin 30$',
 'r5-e4-2206-01-q24p0-sine')

# ---- 2022-06-02 q10p1 (mspage-2022-06-4MB1-02-p15) ----
add('2022-06-4mb1-02--exam-questions',10,1,'solutionMd',
 '**P3** (1 mark) Attempt to differentiate at least 1 term correct\n'
 '- Note: dx =  12 x \u2212 120 x + 200\n'
 '- Note: 2\n\n'
 '**P4** (1 mark) At least 2 terms correct and equated to zero\n\n'
 '**P5** (1 mark) A correct method to solve their 3 term quadratic equation.\n'
 '- Note: x= 15 \u00b1 5 3\n'
 '- Note: 2 x12 Implied by awrt 2.11 or awrt 7.89 or\n'
 '- Note: 3\n'
 '- Note: 2.11 15 \u2212 5 3\n\n'
 '**P6** (1 mark) awrt 2.11 Allow do not accept 7.89 given. If correct\n'
 '- Note: 3\n'
 '- Note: answer seen ignore subsequent rounding.',
 '**P3** (1 mark) Attempt to differentiate at least 1 term correct\n'
 '- Note: $\\left[\\dfrac{\\text{d}V}{\\text{d}x}\\right] = 12x^2 - 120x + 200$\n\n'
 '**P4** (1 mark) At least 2 terms correct and equated to zero\n\n'
 '**P5** (1 mark) A correct method to solve their 3 term quadratic equation.\n'
 '- Note: $x = \\dfrac{120 \\pm \\sqrt{120^2 - 4 \\times 12 \\times 200}}{2 \\times 12}$\n'
 '- Note: Implied by awrt 2.11 or awrt 7.89 or $\\dfrac{15 \\pm 5\\sqrt{3}}{3}$\n\n'
 '**P6** (1 mark) awrt 2.11 Allow $\\dfrac{15 - 5\\sqrt{3}}{3}$ do not accept 7.89 given. If correct\n'
 '- Note: answer seen ignore subsequent rounding.',
 'r5-e5-2206-02-q10p1-dvdx')

# ---- 2023-01-01 q10p0 (mspage-2023-01-4MB1-01-p09) ----
add('2023-01-4mb1-01--exam-questions',10,0,'solutionMd', None,
 '**P1** (1 mark) for one root/part expressed correctly\n'
 '- Allow: if split eg $\\sqrt{3} \\times \\sqrt{100}$\n'
 '- Note: or a correct decomposition consisting of at least 2 surds, one of which is a square number.\n'
 '- Note: $\\left[2\\sqrt{300} =\\right] 2\\sqrt{3 \\times 100}$ or $2\\sqrt{3 \\times 10^2}$ or $2\\sqrt{2^2 \\times 3 \\times 5^2}$\n'
 '- Note: or $\\sqrt{100 \\times 12}$ or $\\sqrt{10^2 \\times 12}$ or $\\sqrt{2^2 \\times 5^2 \\times 12}$\n'
 '- Note: $\\left[\\sqrt{300} =\\right] \\sqrt{3 \\times 100}$ or $\\sqrt{3 \\times 10^2}$ or $\\sqrt{3 \\times 2^2 \\times 5^2}$ or\n'
 '- Note: $\\sqrt{25 \\times 12}$ or $\\sqrt{5^2 \\times 12}$\n'
 '- Note: $\\left[\\sqrt{108} =\\right] \\sqrt{3 \\times 36}$ or $\\sqrt{3 \\times 6^2}$ or $\\sqrt{9 \\times 12}$ or $\\sqrt{3^2 \\times 12}$\n'
 '- Note: or $\\sqrt{3 \\times 2^2 \\times 3^2}$\n\n'
 '**P2** (1 mark) Dep on 1st M1 awarded. Allow for a correct answer of\n'
 '- Note: $20\\sqrt{3} - 6\\sqrt{3}\\ [= 14\\sqrt{3}]$ or $10\\sqrt{12} - 3\\sqrt{12}\\left[= 7\\sqrt{12}\\right]$\n'
 '- Note: $14\\sqrt{3}$ or $7\\sqrt{12}$\n\n'
 '**P3** (1 mark) Dep on 2nd M1 awarded. Condone $\\sqrt{588}$ or $\\left(14\\sqrt{3}\\right)^2$\n'
 '- Note: Working required\n\n'
 '**P4** (1 mark) SC if no marks awarded award B1 for 588 condone $\\sqrt{588}$',
 'r5-f1-2301-01-q10p0-surd')

# ---- 2023-01-01R q6p0 (mspage-2023-01-4MB1-01R-p06) ----
add('2023-01-4mb1-01r--exam-questions',6,0,'solutionMd', None,
 '**P1** (2 marks) $2^4 \\times 3^4 \\times 5^4 \\times 7 \\times 11$ oe (allow 62 370 000) isw if correct prime factors given\n'
 '- Note: (B1 for 4 455 000 or $2^3 \\times 3^4 \\times 5^4 \\times 11$ or\n'
 '- Note: $2^m \\times 3^n \\times 5^p \\times 7 \\times 11$ with 2 of $m$, $n$ or $p$ correct)\n'
 '- Note: Correct answers scores full marks (unless from obviously incorrect working)',
 'r5-f2-2301-01r-q6p0-primes')

# ---- 2023-01-01R q7p0 (mspage-2023-01-4MB1-01R-p07) ----
add('2023-01-4mb1-01r--exam-questions',7,0,'solutionMd', None,
 '**P1** (1 mark) for writing the fractions as improper fractions or for writing the\n'
 '- Note: $\\dfrac{11}{3} + \\dfrac{14}{5}$ or $\\left[\\dfrac{2}{3} + \\dfrac{4}{5} =\\right] \\dfrac{10}{15} + \\dfrac{12}{15}$ fraction part of the values over a common denominator\n\n'
 '**P2** (1 mark) for writing improper fractions over a common denominator and\n'
 '- Note: $\\dfrac{11}{3} + \\dfrac{14}{5} = \\dfrac{55}{15} + \\dfrac{42}{15} = \\dfrac{97}{15}$ or showing they equal a correct improper fraction or for adding the\n'
 '- Note: $\\left[3 + 2 +\\right] \\dfrac{10}{15} + \\dfrac{12}{15} = 5\\dfrac{22}{15}$ or $5 + 1\\left[+\\right] \\dfrac{7}{15}$ whole number parts and the fraction parts over a common\n'
 '- Note: denominator. Accept sum with shared denominator eg. $\\dfrac{5 \\times 11 + 3 \\times 14}{15}$\n\n'
 '**P3** (1 mark) for completion to the correct answer with full working shown.\n'
 '- Note: eg $\\dfrac{97}{15} = 6\\dfrac{7}{15}$ or $5\\dfrac{22}{15} = 6\\dfrac{7}{15}$ or\n'
 '- Note: $5 + 1\\left[+\\right] \\dfrac{7}{15} = 6\\dfrac{7}{15}$ Correctly showing completion\n'
 '- Note: to $6\\dfrac{7}{15}$\n'
 '- Note: Working required',
 'r5-f3-2301-01r-q7p0-frac')

# ---- 2023-01-02R q6p2 (mspage-2023-01-02R p12; field starts at P5) ----
add('2023-01-4mb1-02r--exam-questions',6,2,'solutionMd', None,
 '**P5** (1 mark) a correct product of 3 probabilities\n'
 '- Note: $\\text{"}\\dfrac{13}{20}\\text{"} \\times \\text{"}\\dfrac{9}{20}\\text{"} \\times \\dfrac{30 - x}{30} \\left[= \\dfrac{39(30 - x)}{4000} = \\dfrac{1170 - 39x}{4000}\\right]$ or\n'
 '- Note: $\\text{"}\\dfrac{13}{20}\\text{"} \\times \\text{"}\\dfrac{11}{20}\\text{"} \\times \\dfrac{x}{30} \\left[= \\dfrac{143x}{12000}\\right]$ or $\\text{"}\\dfrac{7}{20}\\text{"} \\times \\text{"}\\dfrac{9}{20}\\text{"} \\times \\dfrac{x}{30} \\left[= \\dfrac{21x}{4000}\\right]$ oe\n'
 '- Note: ft their tree diagram\n'
 '- Note: If total in bag is incorrect but consistent allow this mark.\n'
 '- Note: Eg $\\text{"}\\dfrac{13}{20}\\text{"} \\times \\text{"}\\dfrac{9}{20}\\text{"} \\times \\dfrac{20 - x}{20}$\n'
 '- Note: Do not ft any probability greater than 1\n'
 '- Note: If using $x$ rather than $\\dfrac{x}{30}$ do not award until attempting to find number of counters rather than probability\n\n'
 '**P6** (1 mark) a fully correct probability\n'
 '- Note: $\\text{"}\\dfrac{1170 - 39x}{4000}\\text{"} + \\text{"}\\dfrac{143x}{12000}\\text{"} + \\text{"}\\dfrac{21x}{4000}\\text{"}$ oe ft their tree diagram\n'
 '- Allow: If total in bag is incorrect but consistent allow this mark.\n'
 '- Note: Do not ft any probability greater than 1\n'
 '- Note: Need not be simplified\n'
 '- Note: dep on previous M mark\n\n'
 '**P7** (1 mark) ft their tree diagram\n'
 '- Note: $\\dfrac{3 \\times \\text{"1170"} - 3 \\times \\text{"39"}x + \\text{"143"}x + 3 \\times \\text{"21"}x}{12000} = \\dfrac{337}{1000}$ or $\\dfrac{89}{12000}x + \\dfrac{1170}{4000} = \\dfrac{337}{1000}$\n'
 '- Note: Do not ft any probability greater than 1\n'
 '- Note: for a correct equation with no brackets\n'
 '- Note: or $3 \\times \\text{"1170"} - 3 \\times \\text{"39"}x + \\text{"143"}x + 3 \\times \\text{"21"}x = 337 \\times 12$ or $89x = 534$ oe\n'
 '- Note: (but can be a fraction)\n'
 '- Note: dep on previous M mark\n\n'
 '**P8** (1 mark)\n'
 '- Note: Correct answers scores full marks (unless from obviously incorrect working)',
 'r5-f4-2301-02r-q6p2-prob')

# ---- 2023-06-01 q28p0 (mspage-2023-06-4MB1-01-p25; flagged rows + duplicate copies) ----
COS_ROWS = (
 '- Note: $10^2 = 16^2 + 20^2 - 2 \\times 16 \\times 20\\cos CBA$\n'
 '- Note: $16^2 = 10^2 + 20^2 - 2 \\times 10 \\times 20\\cos CAB$\n'
 '- Note: $20^2 = 16^2 + 10^2 - 2 \\times 16 \\times 10\\cos BCA$\n\n')
COS_P2 = (
 '**P2** (1 mark) this mark implies the previous mark Allow $\\angle CBA = $awrt 29.7 ,\n'
 '- Note: $\\angle CAB = $awrt 52.4 , $\\angle BCA = $awrt 97.9 , Allow for angles on diagram\n'
 '- Note: $\\cos CBA = \\dfrac{16^2 + 20^2 - 10^2}{2 \\times 16 \\times 20}$ or\n'
 '- Note: $\\cos CAB = \\dfrac{10^2 + 20^2 - 16^2}{2 \\times 10 \\times 20}$ or Allow $\\angle CBA = $awrt 14.8 or $\\angle CAB = $awrt 26.2 or $\\angle BCA = $awrt 49.0\n'
 '- Note: $\\cos BCA = \\dfrac{16^2 + 10^2 - 20^2}{2 \\times 16 \\times 10}$\n\n')
COS_P1 = ('**P1** (1 mark) using cosine rule to find an angle\n')
add('2023-06-4mb1-01--exam-questions',28,0,'solutionMd',
 '**P1** (1 mark) using cosine rule to find an angle\n'
 '- Note: 162 = 102 + 202 \u2212 2 x10 x 20cos CAB\n'
 '- Note: 202 = 162 + 102 \u2212 2 x16 x10cos BCA\n\n'
 '**P2** (1 mark) this mark implies the previous mark Allow \u2220CBA = awrt 29.7 ,\n'
 '- Note: cos CBA = or\n'
 '- Note: 2 x16 x 20 \u2220CAB = awrt 52.4 , \u2220BCA = awrt 97.9 , Allow for angles on diagram\n'
 '- Note: 102 + 202 \u2212 162 1 1 1\n'
 '- Note: cos CAB = or Allow \u2220CBA = awrt 14.8 or \u2220CAB = awrt 26.2 or \u2220BCA = awrt 49.0\n'
 '- Note: 2 x10 x 20 2 2 2\n'
 '- Note: 162 + 102 \u2212 202\n'
 '- Note: cos BCA =\n'
 '- Note: 2 x16 x10\n\n',
 COS_P1 + COS_ROWS + COS_P2, 'r5-f5-2306-01-q28p0-cos1')
add('2023-06-4mb1-01--exam-questions',28,0,'solutionMd',
 '**P7** (1 mark) using cosine rule to find an angle\n'
 '- Note: 1 162 = 102 + 202 \u2212 2 x10 x 20cos CAB\n'
 '- Note: 202 = 162 + 102 \u2212 2 x16 x10cos BCA\n\n'
 '**P8** (1 mark) this mark implies the previous mark Allow \u2220CBA = awrt 29.7 ,\n'
 '- Note: cos CBA = or\n'
 '- Note: 2 x16 x 20 \u2220CAB = awrt 52.4 , \u2220BCA = awrt 97.9 , Allow for angles on diagram\n'
 '- Note: 102 + 202 \u2212 162 1 1 1\n'
 '- Note: cos CAB = or Allow \u2220CBA = awrt 14.8 or \u2220CAB = awrt 26.2 or \u2220BCA = awrt 49.0\n'
 '- Note: 2 x10 x 20 2 2 2\n'
 '- Note: 162 + 102 \u2212 202\n'
 '- Note: cos BCA =\n'
 '- Note: 2 x16 x10\n\n',
 '**P7** (1 mark) using cosine rule to find an angle\n' + COS_ROWS + '**P8** (1 mark) this mark implies the previous mark Allow $\\angle CBA = $awrt 29.7 ,\n'
 '- Note: $\\angle CAB = $awrt 52.4 , $\\angle BCA = $awrt 97.9 , Allow for angles on diagram\n'
 '- Note: $\\cos CBA = \\dfrac{16^2 + 20^2 - 10^2}{2 \\times 16 \\times 20}$ or\n'
 '- Note: $\\cos CAB = \\dfrac{10^2 + 20^2 - 16^2}{2 \\times 10 \\times 20}$ or Allow $\\angle CBA = $awrt 14.8 or $\\angle CAB = $awrt 26.2 or $\\angle BCA = $awrt 49.0\n'
 '- Note: $\\cos BCA = \\dfrac{16^2 + 10^2 - 20^2}{2 \\times 16 \\times 10}$\n\n',
 'r5-f6-2306-01-q28p0-cos2')
add('2023-06-4mb1-01--exam-questions',28,0,'solutionMd',
 '**P13** (1 mark) using cosine rule to find an angle\n'
 '- Note: 2 162 = 102 + 202 \u2212 2 x10 x 20cos CAB\n'
 '- Note: 202 = 162 + 102 \u2212 2 x16 x10cos BCA\n\n'
 '**P14** (1 mark) this mark implies the previous mark Allow \u2220CBA = awrt 29.7 ,\n'
 '- Note: cos CBA = or\n'
 '- Note: 2 x16 x 20 \u2220CAB = awrt 52.4 , \u2220BCA = awrt 97.9 , Allow for angles on diagram\n'
 '- Note: 102 + 202 \u2212 162 1 1\n'
 '- Note: cos CAB = or Allow \u2220CBA = awrt 14.8 or \u2220CAB = awrt 26.2 or\n'
 '- Note: 2 x10 x 20 2 2\n'
 '- Note: 162 + 102 \u2212 202 1\n'
 '- Note: cos BCA = \u2220BCA = awrt 49.0\n'
 '- Note: 2 x16 x10 2\n\n',
 '**P13** (1 mark) using cosine rule to find an angle\n' + COS_ROWS + '**P14** (1 mark) this mark implies the previous mark Allow $\\angle CBA = $awrt 29.7 ,\n'
 '- Note: $\\angle CAB = $awrt 52.4 , $\\angle BCA = $awrt 97.9 , Allow for angles on diagram\n'
 '- Note: $\\cos CBA = \\dfrac{16^2 + 20^2 - 10^2}{2 \\times 16 \\times 20}$ or\n'
 '- Note: $\\cos CAB = \\dfrac{10^2 + 20^2 - 16^2}{2 \\times 10 \\times 20}$ or Allow $\\angle CBA = $awrt 14.8 or $\\angle CAB = $awrt 26.2 or $\\angle BCA = $awrt 49.0\n'
 '- Note: $\\cos BCA = \\dfrac{16^2 + 10^2 - 20^2}{2 \\times 16 \\times 10}$\n\n',
 'r5-f7-2306-01-q28p0-cos3')

# ---- 2023-06-02R q11p0 (mspage-2023-06-4MB1-02R-p24) ----
add('2023-06-4mb1-02r--exam-questions',11,0,'solutionMd',
 '**P6** (1 mark) correct substitution into cosine rule accept values correct to 3 sf.\n'
 '- Note: ( 6.712 = x 2 + 6.932 \u2212 2 x 6.93 x 0.966 )\n'
 '- Note: x + (4 3) 2 \u2212 (3 5) 2 oe\n'
 '- Note: 2\n'
 '- Note: cos15 = (only condone missing brackets if recovered including on the 3 5 and 4 3 )\n'
 '- Note: 2 x 4 3x\n'
 '- Note: or\n'
 '- Note: sin C sin15 or C = 15.5.. or B = 180 - 15 - 15.5\u2026 =\n'
 '- Note: = finding the value of x as a decimal (13.1\u2026..) by using the sine rule and\n'
 '- Note: 4 3 3 5\n'
 '- Note: 149.495\u2026 or b = sin149(.4...) x 3 5 = 13.1(56..)\n'
 '- Note: ( )\n'
 '- Note: substituting this x value into the equation to show that x 2 - 6 2 + 2 6 x + 3 = 0\n\n'
 '**P7** (1 mark)\n'
 '- Note: with (13.156)2 - ( 6 2 + 2 6 ) x13.156 + 3 = 0\n\n'
 '**P8** (1 mark) correct expansion of surds which may be seen in earlier working\n'
 '- Allow: 6 + 2 x 2 + 3 provided the 45 or 48 are seen in earlier working\n'
 '- Note: 45 = x 2 + 48 \u2212 8 3 x x oe\n'
 '- Note: 4 Must see cos15 replaced with 6 + 2 and either 45 or 48 and in a correct equation.\n'
 '- Note: 6 + 2 x 2 + 48 \u2212 45 oe 4\n'
 '- Note: or =\n'
 '- Note: 4 8 3x This implies the previous method mark\n'
 '- Note: =\n'
 '- Note: 4 8 3x\n'
 '- Note: (\n\n'
 '**P9** (1 mark) (wr) No incorrect working seen, must gain both method marks.',
 '**P6** (1 mark) correct substitution into cosine rule accept values correct to 3 sf.\n'
 '- Note: $\\left(3\\sqrt{5}\\right)^2 = x^2 + \\left(4\\sqrt{3}\\right)^2 - 2 \\times 4\\sqrt{3}x\\cos 15$ oe or\n'
 '- Note: $\\left(6.71^2 = x^2 + 6.93^2 - 2 \\times 6.93 \\times 0.966\\right)$\n'
 '- Note: (only condone missing brackets if recovered including on the $3\\sqrt{5}$ and $4\\sqrt{3}$)\n'
 '- Note: or\n'
 '- Note: $\\dfrac{\\sin C}{4\\sqrt{3}} = \\dfrac{\\sin 15}{3\\sqrt{5}}$ or $C = 15.5..$ or $B = 180 - 15 - 15.5\\ldots = 149.495\\ldots$ or $b = \\dfrac{\\sin 149(4.\\ldots) \\times 3\\sqrt{5}}{\\sin 15} = 13.1(56..)$\n'
 '- Note: finding the value of x as a decimal (13.1\\ldots..) by using the sine rule and\n'
 '- Note: substituting this x value into the equation to show that $x^2 - \\left(6\\sqrt{2} + 2\\sqrt{6}\\right)x + 3 = 0$\n'
 '- Note: will only gain a maximum score of M1\n\n'
 '**P7** (1 mark)\n'
 '- Note: with $\\left(13.156\\right)^2 - \\left(6\\sqrt{2} + 2\\sqrt{6}\\right) \\times 13.156 + 3 = 0$\n\n'
 '**P8** (1 mark) correct expansion of surds which may be seen in earlier working\n'
 '- Note: $45 = x^2 + 48 - 8\\sqrt{3}x \\times \\dfrac{\\sqrt{6} + \\sqrt{2}}{4}$ oe\n'
 '- Note: or $\\dfrac{\\sqrt{6} + \\sqrt{2}}{4} = \\dfrac{x^2 + 48 - 45}{8\\sqrt{3}x}$ oe\n'
 '- Note: Must see cos15 replaced with $\\dfrac{\\sqrt{6} + \\sqrt{2}}{4}$ and either 45 or 48 and in a correct equation.\n'
 '- Note: Allow $\\dfrac{\\sqrt{6} + \\sqrt{2}}{4} = \\dfrac{x^2 + 3}{8\\sqrt{3}x}$ provided the 45 or 48 are seen in earlier working\n'
 '- Note: This implies the previous method mark\n\n'
 '**P9** (1 mark) (wr) No incorrect working seen, must gain both method marks.',
 'r5-f8-2306-02r-q11p0-surds')

# ---- 2023-11-02 q5p0 (mspage-2023-11-4MB1-02-p10) ----
add('2023-11-4mb1-02--exam-questions',5,0,'solutionMd',
 '**P2** (1 mark) Correct method to find the volume using\n'
 '- Note: [V =] or\n'
 '- Note: m\n'
 '- Note: 7.985 V = where ( 1475 m 1525 and 7.975 d 7.985 ) or\n'
 '- Note: [V =]12.52 h d\n'
 '- Note: using V = s 2 h where 11.5 s 12.5\n'
 '- Note: m m V\n'
 '- Note: May be implied by use of d = 2\n'
 '- Note: or h = 2 or h = 2\n'
 '- Note: hs ds s\n'
 '- Note: where ( 11.5 s 12.5 , m and d any value) or\n'
 '- Note: where ( 1475 m 1525 and 7.975 d 7.985 , s any value) or\n'
 '- Note: where ( 11.5 s 12.5 and V is any value)\n\n'
 '**P3** (1 mark) Correct method/equation to enable h to be found where\n'
 '- Note: h = ds 2 =  7.985 x12.52 or 7.98 < d 7.985 and 1475 m < 1500 and 12 < s 12.5\n'
 '- Note: 1475 This implies the first M mark.\n'
 '- Note: 7.985 =\n'
 '- Note: h x12.52',
 '**P2** (1 mark) Correct method to find the volume using\n'
 '- Note: $[V =] \\dfrac{1475}{7.985}$ or $[V =] 12.5^2 h$\n'
 '- Note: $V = \\dfrac{m}{d}$ where $(1475 \\le m \\le 1525$ and $7.975 \\le d \\le 7.985)$ or\n'
 '- Note: using $V = s^2 h$ where $11.5 \\le s \\le 12.5$\n'
 '- Note: May be implied by use of $d = \\dfrac{m}{hs^2}$ or $h = \\dfrac{m}{ds^2}$ or $h = \\dfrac{V}{s^2}$\n'
 '- Note: where $(11.5 \\le s \\le 12.5$, $m$ and $d$ any value) or\n'
 '- Note: where $(1475 \\le m \\le 1525$ and $7.975 \\le d \\le 7.985$, $s$ any value) or\n'
 '- Note: where $(11.5 \\le s \\le 12.5$ and $V$ is any value)\n\n'
 '**P3** (1 mark) Correct method/equation to enable h to be found where\n'
 '- Note: $\\left[h = \\dfrac{m}{ds^2} =\\right] \\dfrac{1475}{7.985 \\times 12.5^2}$ or $7.985 = \\dfrac{1475}{h \\times 12.5^2}$\n'
 '- Note: $7.98 < d \\le 7.985$ and $1475 \\le m < 1500$ and $12 < s \\le 12.5$\n'
 '- Note: This implies the first M mark.',
 'r5-f9-2311-02-q5p0-bounds')

# ---- 2023-11-02 q5p1 (same page) ----
add('2023-11-4mb1-02--exam-questions',5,1,'solutionMd',
 '- Note: 2 x12.52 + 4 x12.5 x 2.35',
 '- Note: $2(12.5^2 + 2 \\times 12.5 \\times 2.35)$ or\n- Note: $2 \\times 12.5^2 + 4 \\times 12.5 \\times 2.35$',
 'r5-f10-2311-02-q5p1-surface')

# ---- 2023-11-02 q6p3 (mspage-2023-11-4MB1-02-p11) ----
add('2023-11-4mb1-02--exam-questions',6,3,'solutionMd',
 '**P6** (1 mark) finding fd oe eg 12 medium square = 15\n'
 '- Note: 1 small square = 0.05 or Implied by a frequency of 6, 14, 20 or 10 seen\n'
 '- Note: 1 medium square = 1.25 or Any fd / frequency may be seen in the correct place\n'
 '- Note: 1 large square = 5 or on the histogram\n'
 '- Note: 15\n'
 '- Note: [freq for 10 < t 15 = ] x 0.8\n'
 '- Note: 1.2\n\n'
 '**P7** (1 mark) Correct method ft their fd eg\n'
 '- Note: 10 x 2 + 15 + 2 x 5 or 65 \u2212 6 x1 \u2212 7 x 2 "3" "3"\n'
 '- Note: for fd x 8 x 2 + 15 + x1.6 x 5\n'
 '- Note: (10 x 40 + 25 x12 + 25 x 8) x "0.05" or 65 \u2212 ( 5 x 24 + 10 x 28) x "0.05" 2.4 2.4\n'
 '- Note: (8 x 2 + 5 x 2.4 + 5 x1.6) x "1.25" or 65 \u2212 (1x 4.8 \u2212 2 x 5.6) x "1.25"\n'
 '- Note: ( 4 x1 + 1.2 x 2.5 + 0.8 x 2.5) x "5" or 65 \u2212 ( 0.5 x 2.4 + 1x 2.8) x "5"',
 '**P6** (1 mark) finding fd oe eg 12 medium square = 15\n'
 '- Note: Fd for 5 \u2212 10 class = 3 or\n'
 '- Note: 1 small square = 0.05 or Implied by a frequency of 6, 14, 20 or 10 seen\n'
 '- Note: 1 medium square = 1.25 or Any fd / frequency may be seen in the correct place\n'
 '- Note: 1 large square = 5 or on the histogram\n'
 '- Note: $\\left[\\text{freq for } 10 < t \\le 15 = \\right] \\dfrac{15}{1.2} \\times 0.8$\n\n'
 '**P7** (1 mark) Correct method ft their fd eg\n'
 '- Note: $[\\text{Number} > 3 =]\\ 10 \\times 2 + 15 + 2 \\times 5$ or $65 - 6 \\times 1 - 7 \\times 2$\n'
 '- Note: $(10 \\times 40 + 25 \\times 12 + 25 \\times 8) \\times \\text{"0.05"}$ or $65 - (5 \\times 24 + 10 \\times 28) \\times \\text{"0.05"}$ for fd $\\dfrac{\\text{"3"}}{2.4} \\times 8 \\times 2 + 15 + \\dfrac{\\text{"3"}}{2.4} \\times 1.6 \\times 5$\n'
 '- Note: $(8 \\times 2 + 5 \\times 2.4 + 5 \\times 1.6) \\times \\text{"1.25"}$ or $65 - (1 \\times 4.8 - 2 \\times 5.6) \\times \\text{"1.25"}$\n'
 '- Note: $(4 \\times 1 + 1.2 \\times 2.5 + 0.8 \\times 2.5) \\times \\text{"5"}$ or $65 - (0.5 \\times 2.4 + 1 \\times 2.8) \\times \\text{"5"}$',
 'r5-f11-2311-02-q6p3-hist')

# ---- 2024-06-01 q14p0 (mspage-2024-06-4MB1-01-p13) ----
add('2024-06-4mb1-01--exam-questions',14,0,'solutionMd',
 '**P1** (1 mark) for writing 2 or 3 numbers correctly in prime\n'
 '- Note: 2 x 3 x 22 or 2 x 2 x 3 x11 or 22 x 3 x11 factor form or as 2 x 3 x ... eg\n'
 '- Note: 2 x 3 x 72 or 2 x 2 x 2 x 2 x 3 x 3 x 3 or 24 x 33 90 132 432\n'
 '- Note: 2 45 66 216\n'
 '- Note: 3 15 22 72\n'
 '- Note: Or two correct trees',
 '**P1** (1 mark) for writing 2 or 3 numbers correctly in prime\n'
 '- Note: $2 \\times 3 \\times 15$ or $2 \\times 3 \\times 3 \\times 5$ or $2 \\times 3^2 \\times 5$ factor form or as $2 \\times 3 \\times \\ldots$ eg\n'
 '- Note: $2 \\times 3 \\times 22$ or $2 \\times 2 \\times 3 \\times 11$ or $2^2 \\times 3 \\times 11$\n'
 '- Note: $2 \\times 3 \\times 72$ or $2 \\times 2 \\times 2 \\times 2 \\times 3 \\times 3 \\times 3$ or $2^4 \\times 3^3$\n'
 '- Note: 90 132 432\n'
 '- Note: 2 45 66 216\n'
 '- Note: 3 15 22 72\n'
 '- Note: Or two correct trees',
 'r5-g1-2406-01-q14p0-primes')

# ---- 2024-06-01 q23p1 (mspage-2024-06-4MB1-01-p21) ----
add('2024-06-4mb1-01--exam-questions',23,1,'solutionMd',
 '- Note: 1x 22 + 3.5 x13 + 7.5 x 9 + 15 x12 + 30 x 4 [= 435] (M1 for use of a value within interval (incl upper end',
 '- Note: $1 \\times 22 + 3.5 \\times 13 + 7.5 \\times 9 + 15 \\times 12 + 30 \\times 4\\ [= 435]$ (M1 for use of a value within interval (incl upper end',
 'r5-g2-2406-01-q23p1-midpoints')

# ---- 2024-06-01R q6p0 (mspage-2024-06-4MB1-01R-p07) ----
add('2024-06-4mb1-01r--exam-questions',6,0,'solutionMd',
 '**P1** (1 mark) for correctly applying the power of 3 or the power of a 0.5 to all\n'
 '- Note: 66 a 24 c 6 3 terms or for an expression of 3 terms in the form ma p c q with 2 of\n'
 '- Note: m, p and q correct or a12 c3\n\n'
 '**P2** (1 mark) ISW Do not allow 63 a12c3\n'
 '- Note: cas Total 2 marks',
 '**P1** (1 mark) for correctly applying the power of 3 or the power of a 0.5 to all\n'
 '- Note: $6^6a^{24}c^6$ or $46656a^{24}c^6$ or $36^3a^{24}c^6$ 3 terms or for an expression of 3 terms in the form $ma^pc^q$ with 2 of\n'
 '- Note: $m$, $p$ and $q$ correct or $a^{12}c^3$\n\n'
 '**P2** (1 mark) $216a^{12}c^{-3}$ ISW Do not allow $6^3a^{12}c^3$\n'
 '- Note: cas',
 'r5-g3-2406-01r-q6p0-powers')

# ---- 2024-06-01R q8p0 (mspage-2024-06-4MB1-01R-p07) ----
add('2024-06-4mb1-01r--exam-questions',8,0,'solutionMd',
 '**P2** (1 mark) for rewriting the second term as 16x \u22122 This can be seen\n'
 '- Note: x 2 =  16x anywhere including in an expression for dy/dx\n'
 '- Note: May be implied by \u22122 x16x \u22123 oe\n'
 '- Note: 36 x2 \u2212 32 x\u22123 2 32\n\n'
 '**P3** (1 mark) oe eg 36x \u2212\n'
 '- Note: x3\n'
 '- Note: Need not be simplified eg allow 3 x12 x\u00b2 \u2212 2 x16 x x \u22123\n'
 '- Note: cas Total 3 marks',
 '**P2** (1 mark) for rewriting the second term as $16x^{-2}$ This can be seen\n'
 '- Note: $\\left[\\dfrac{16}{x^2} =\\right] 16x^{-2}$ anywhere including in an expression for dy/dx\n'
 '- Note: May be implied by $-2 \\times 16x^{-3}$ oe\n'
 '- Note: $36x^2 - 32x^{-3}$\n\n'
 '**P3** (1 mark) oe eg $36x^2 - \\dfrac{32}{x^3}$\n'
 '- Note: Need not be simplified eg allow $3 \\times 12x^2 - 2 \\times 16 \\times x^{-3}$\n'
 '- Note: cas',
 'r5-g4-2406-01r-q8p0-diff')

# ---- 2024-06-01R q12p0 (mspage-2024-06-4MB1-01R-p10) ----
add('2024-06-4mb1-01r--exam-questions',12,0,'solutionMd',
 '- Note: AC 2 =  (0.5 x12.6)2 + (0.5 x12.6)2  = 39.69 + 39.692 = 79.38 or\n'
 '- Note: NB do not award for AB 2 + AC 2 = 12.62\n'
 '- Note: eg sin 45 =\n'
 '- Note: AC\n'
 '- Note: or cos 45 =\n'
 '- Note: AC\n'
 '- Note: or unless made clear AB = AC.\n'
 '- Note: 12.6 12.6 Allow AB instead of AC\n'
 '- Note: 6.3 6.3 May be Implied by the 2nd M1\n'
 '- Note: cos 45 = or sin 45 = oe\n'
 '- Note: AC AC',
 '- Note: $AC^2 = (0.5 \\times 12.6)^2 + (0.5 \\times 12.6)^2 = 39.69 + 39.69^2 = 79.38$ or\n'
 '- Note: NB do not award for $AB^2 + AC^2 = 12.6^2$\n'
 '- Note: eg $\\sin 45 = \\dfrac{AC}{12.6}$\n'
 '- Note: or $\\cos 45 = \\dfrac{AC}{12.6}$\n'
 '- Note: or unless made clear AB = AC.\n'
 '- Note: $\\cos 45 = \\dfrac{6.3}{AC}$ or $\\sin 45 = \\dfrac{6.3}{AC}$ oe Allow AB instead of AC\n'
 '- Note: May be Implied by the 2nd M1',
 'r5-g5-2406-01r-q12p0-pyth')
add('2024-06-4mb1-01r--exam-questions',12,0,'solutionMd',
 '- Note: [ x =] =  = 8.909  or to find AB or AC\n'
 '- Note: 2  25  Allow for 8.9 or better (actual 8.909545\u2026) or\n'
 '- Note: [ AC =] (0.5 x12.6) 2 + (0.5 x12.6) 2 [= 8.9090\u2026] or 63 2\n'
 '- Note: [ AB / AC =]12.6 x sin 45 or 12.6 x cos 45 10\n'
 '- Note: 6.3 6.3 Allow 9 if x 2 = 79.3... is seen\n'
 '- Note: [ AC / AB =] or\n'
 '- Note: cos 45 sin 45',
 '- Note: $\\left[x =\\right] \\sqrt{\\dfrac{12.6^2}{2}} = \\left[\\sqrt{\\dfrac{3969}{25}} = 8.909\\ldots\\right]$ or to find AB or AC\n'
 '- Note: Allow for 8.9 or better (actual 8.909545\\u2026) or $\\dfrac{63\\sqrt{2}}{10}$\n'
 '- Note: $[AC =] \\sqrt{(0.5 \\times 12.6)^2 + (0.5 \\times 12.6)^2}\\ [= 8.9090\\ldots]$ or\n'
 '- Note: $[AB/AC =] 12.6 \\times \\sin 45$ or $12.6 \\times \\cos 45$\n'
 '- Note: $\\left[AC/AB =\\right] \\dfrac{6.3}{\\cos 45}$ or $\\dfrac{6.3}{\\sin 45}$ Allow 9 if $x^2 = 79.3\\ldots$ is seen',
 'r5-g6-2406-01r-q12p0-m2')
add('2024-06-4mb1-01r--exam-questions',12,0,'solutionMd',
 '- Note: 63 + 63 2\n'
 '- Note: marks. Allow\n'
 '- Note: 5\n'
 '- Note: For using 2 x n + 12.6 where 6.3 < n < 12.6',
 '- Note: marks. Allow $\\dfrac{63 + 63\\sqrt{2}}{5}$\n'
 '- Note: For using $2 \\times n + 12.6$ where 6.3 < n < 12.6',
 'r5-g7-2406-01r-q12p0-m3')

# ---- 2024-06-01R q25p0 (mspage-2024-06-4MB1-01R-p23) ----
add('2024-06-4mb1-01r--exam-questions',25,0,'solutionMd',
 '- Note: AC = 112 + 82 \u2212 2 x 11x 8cos115(= 16.105...)',
 '- Note: $AC = \\sqrt{11^2 + 8^2 - 2 \\times 11 \\times 8\\cos 115}\\ (= 16.105\\ldots)$',
 'r5-g8-2406-01r-q25p0-ac')
add('2024-06-4mb1-01r--exam-questions',25,0,'solutionMd',
 '- Note: 16.105...2 = AD2 + 152 \u2212 2 x AD x15cos53 or Finding AD2 NB 2 x15cos 53 = 18.054 \u2026\n'
 '- Note: AD2 = 16.105...2 + 152 \u2212 2 x16.105... x15cos"78.9..." the length AD (19.79\u2026)',
 '- Note: $16.105\\ldots^2 = AD^2 + 15^2 - 2 \\times AD \\times 15\\cos 53$ or Finding $AD^2$ NB $2 \\times 15\\cos 53 = 18.054 \\ldots$\n'
 '- Note: $AD^2 = 16.105\\ldots^2 + 15^2 - 2 \\times 16.105\\ldots \\times 15\\cos\\text{"78.9\\ldots"}$ the length AD (19.79\\u2026)',
 'r5-g9-2406-01r-q25p0-ad')

# ---- 2024-06-02R q8p2 (mspage-2024-06-4MB1-02R-p14) ----
add('2024-06-4mb1-02r--exam-questions',8,2,'solutionMd',
 '- Note: 1x 3 + 3 x 4 cm squares = 75 or 15 cm squares = 75 or calculation or a correct value for area and frequency or a\n'
 '- Note: 1 cm square = 5 parcels oe correct value on FD axis (1 cm vertically is FD 5) this\n'
 '- Note: small squares (ss) may come from 1x15 x + 3 x 20 x = 75 oe eg\n'
 '- Note: 75 lines of 5 ss = 75 or 5 x15 + 15 x 20 ss = 75 or 1x 3x + 3 x 4 x = 75',
 '- Note: $1 \\times 3 + 3 \\times 4$ cm squares = 75 or 15 cm squares = 75 or calculation or a correct value for area and frequency or a\n'
 '- Note: 1 cm square = 5 parcels oe correct value on FD axis (1 cm vertically is FD 5) this\n'
 '- Note: small squares (ss) may come from $1 \\times 15x + 3 \\times 20x = 75$ oe eg\n'
 '- Note: 75 lines of 5 ss = 75 or $5 \\times 15 + 15 \\times 20$ ss = 75 or $1 \\times 3x + 3 \\times 4x = 75$',
 'r5-g10-2406-02r-q8p2-fd')
add('2024-06-4mb1-02r--exam-questions',8,2,'solutionMd',
 '- Note: 90 18\n'
 '- Note: " " or " " or "0.62(06...)" oe Also allow the correct probability for a parcel\n'
 '- Note: 145 29 being less than 4 kg\n'
 '- Note: 55 11\n'
 '- Note: eg or or 0.37(93...)\n'
 '- Note: 145 29',
 '- Note: $\\text{"}\\dfrac{90}{145}\\text{"}$ or $\\text{"}\\dfrac{18}{29}\\text{"}$ or "0.62(06...)" oe Also allow the correct probability for a parcel\n'
 '- Note: being less than 4 kg\n'
 '- Note: eg $\\dfrac{55}{145}$ or $\\dfrac{11}{29}$ or 0.37(93...)',
 'r5-g11-2406-02r-q8p2-prob')

# ---- 2024-11-01 q21p0 (mspage-2024-11-4MB1-01-p18) ----
add('2024-11-4mb1-01--exam-questions',21,0,'solutionMd',
 '- Note: = 22.3\n'
 '- Note: 2 x12.5\n'
 '- Note: or\n'
 '- Note: 25.452 \u2212 9.51152 = 2a x12.5\n'
 '- Note: \u21d2 a = 22.3',
 '- Note: $\\dfrac{25.45^2 - 9.5115^2}{2 \\times 12.5}$ = 22.3\n'
 '- Note: or\n'
 '- Note: $25.45^2 - 9.5115^2 = 2a \\times 12.5$\n'
 '- Note: $\\Rightarrow a = 22.3$',
 'r5-g12-2411-01-q21p0-suvat')

# ---- 2024-11-01 q25p0 (mspage-2024-11-4MB1-01-p22) ----
add('2024-11-4mb1-01--exam-questions',25,0,'solutionMd',
 '- Note: 1 1 if the length of the sides are PQ = awrt 64, PR = 77, QR = awrt 18 and\n'
 '- Note: ( 77 + 13.75) x11.5 \u2212 x11.5 x13.75 \u2220PQR = awrt 130 or \u2220QRP = awrt 39/awrt 40 or \u2220QPR = awrt 10\n'
 '- Note: 2 2',
 '- Note: $\\dfrac{1}{2}(77 + 13.75) \\times 11.5 - \\dfrac{1}{2} \\times 11.5 \\times 13.75$ if the length of the sides are PQ = awrt 64, PR = 77, QR = awrt 18 and\n'
 '- Note: \u2220PQR = awrt 130 or \u2220QRP = awrt 39/awrt 40 or \u2220QPR = awrt 10',
 'r5-g13-2411-01-q25p0-area')

# ---- 2025-06-01 q9p0 (mspage-2025-06-4MB1-01-p10) ----
add('2025-06-4mb1-01--exam-questions',9,0,'solutionMd',
 '**P2** (1 mark) for a full and correct method to find the number of\n'
 '- Note: 600 x oe or "360"x oe students who catch the bus.\n'
 '- Note: 10 2\n'
 '- Note: or\n'
 '- Note: 27 + 6 + 10\n'
 '- Note: [ total students] = 600 x [ = 2580]\n'
 '- Note: 10\n'
 '- Note: 27\n'
 '- Note: and "2580"x or\n'
 '- Note: 27 + 6 + 10\n'
 '- Note: "2580"\u2212 600 \u2212 "360" oe\n'
 '- Note: 360 x11\n'
 '- Note: or 960 - 600 [=360] and [=1980]\n'
 '- Note: 2\n'
 '- Note: and 1980 - 360 = 1620',
 '**P2** (1 mark) for a full and correct method to find the number of students who catch the bus.\n'
 '- Note: $600 \\times \\dfrac{27}{10}$ oe or $"360" \\times \\dfrac{9}{2}$ oe\n'
 '- Note: or\n'
 '- Note: $\\left[\\text{total students}\\right] = 600 \\times \\dfrac{27 + 6 + 10}{10}\\left[= 2580\\right]$\n'
 '- Note: and $"2580" \\times \\dfrac{27}{27 + 6 + 10}$ or\n'
 '- Note: $"2580" - 600 - "360"$ oe\n'
 '- Note: or $960 - 600\\ [= 360]$ and $\\dfrac{360 \\times 11}{2}\\ [= 1980]$\n'
 '- Note: and $1980 - 360 = 1620$',
 'r5-h1-2506-01-q9p0-ratio')

# ---- 2025-06-01 q24p0 (mspage-2025-06-4MB1-01-p25) ----
add('2025-06-4mb1-01--exam-questions',24,0,'solutionMd',
 '- Note: 222 = 152 + ("23.19...") \u2212 2 x15 x ("23.19...") cos LAB working).\n'
 '- Note: 2\n',
 '- Note: $22^2 = 15^2 + \\left(\\text{"23.19\\ldots"}\\right)^2 - 2 \\times 15 \\times \\left(\\text{"23.19\\ldots"}\\right)\\cos \\angle LAB$ working).\n',
 'r5-h2-2506-01-q24p0-coslab')

# ---- 2025-06-02 q5p2 (mspage-2025-06-4MB1-02-p09) ----
add('2025-06-4mb1-02--exam-questions',5,2,'solutionMd',
 '- Note: x1500 x15 + x 600 x18[= 13500 + 10260 = 23760] or\n'
 '- Note: 5 100 selling items or a correct method to find the total\n'
 '- Note: 3   95  profit. May be seen as two separate calculations and\n'
 '- Note: x1500 x 15 \u2212 10500  +  x 600 x 18 \u2212 6600  95\n'
 '- Note: 5   100  added at any stage (Condone 95% for )\n'
 '- Note: 100\n'
 '- Note: [= 3000 + 3600 = 6660]',
 '- Note: $\\dfrac{3}{5} \\times 1500 \\times 15 + \\dfrac{95}{100} \\times 600 \\times 18\\left[= 13500 + 10260 = 23760\\right]$ or\n'
 '- Note: selling items or a correct method to find the total\n'
 '- Note: profit. May be seen as two separate calculations and\n'
 '- Note: $\\left(\\dfrac{3}{5} \\times 1500 \\times 15 - 10500\\right) + \\left(\\dfrac{95}{100} \\times 600 \\times 18 - 6600\\right)$ added at any stage (Condone 95% for $\\dfrac{95}{100}$)\n'
 '- Note: $[= 3000 + 3600 = 6660]$',
 'r5-h3-2506-02-q5p2-profit')

# ---- 2025-06-02R q9p0 (mspage-2025-06-4MB1-02R-p16) ----
add('2025-06-4mb1-02r--exam-questions',9,0,'solutionMd',
 '- Note: rectangular sides Allow 2 x17 x 20 [ = 680]',
 '- Note: rectangular sides Allow $2 \\times 17 \\times 20\\ [ = 680]$',
 'r5-h4-2506-02r-q9p0-rect')
add('2025-06-4mb1-02r--exam-questions',9,0,'solutionMd',
 '- Note: 25 $\\pi$ = 39.269... Allow $\\pi$ x 5 x 20 + $\\pi$ x 5 [ = 125$\\pi$ = 392.699...]\n'
 '- Note: and $\\pi$ x 5 [ = 25$\\pi$ = 78.539...] or 0.5 x $\\pi$ x 5  =\n'
 '- Note: 2 2 2\n'
 '- Note: 2',
 '- Note: $\\dfrac{25}{2}\\pi$ = 39.269... Allow $\\pi \\times 5 \\times 20 + \\pi \\times 5^2\\ [ = 125\\pi$ = 392.699...] \n'
 '- Note: and $\\pi \\times 5^2\\ [ = 25\\pi$ = 78.539...] or $0.5 \\times \\pi \\times 5^2\\left[= \\dfrac{25}{2}\\pi = 39.269\\ldots\\right]$',
 'r5-h5-2506-02r-q9p0-cyl')
add('2025-06-4mb1-02r--exam-questions',9,0,'solutionMd',
 '- Note: ( 26 + 10 ) x15[ = 270]  2 x 1  ( 26 + 10 ) x 15 = 540\n'
 '- Note: 2\n'
 '- Note: 2  [ ]',
 '- Note: $\\dfrac{1}{2}(26 + 10) \\times 15\\ [ = 270]$ Allow $\\left[2 \\times \\dfrac{1}{2}(26 + 10) \\times 15\\right] = 540$',
 'r5-h6-2506-02r-q9p0-trap')

# ---- 2025-10-01 q23p1 (mspage-2025-10-4MB1-01-p23) ----
add('2025-10-4mb1-01--exam-questions',23,1,'solutionMd',
 '- Note: 90 90\n'
 '- Note: 2x x 42 x $\\pi$ + 2 x x 42 x $\\pi$\n'
 '- Note: 360 360\n'
 '- Note: [ = 2 x 4$\\pi$ + 2 x 4$\\pi$ = 2 x12.56... + 2 x12.56...]',
 '- Note: $2 \\times \\dfrac{90}{360} \\times 4^2 \\times \\pi + 2 \\times \\dfrac{90}{360} \\times 4^2 \\times \\pi$\n'
 '- Note: $\\left[= 2 \\times 4\\pi + 2 \\times 4\\pi = 2 \\times 12.56\\ldots + 2 \\times 12.56\\ldots\\right]$',
 'r5-h7-2510-01-q23p1-sector')

# ---- 2026-06-01 q17p0 (mspage-2026-06-4MB1-01-p17) ----
add('2026-06-4mb1-01--exam-questions',17,0,'solutionMd',
 '- Note: x 4 x " 84 "x13 or x 4 x "9.165..."x13 ft their AF, \u2220ABF or \u2220AFB if they come from\n'
 '- Note: 2 2\n'
 '- Note: 1 correct working or are clearly labelled\n'
 '- Note: or x 4 x10 x sin ("66.421...") x13',
 '- Note: $\\dfrac{1}{2} \\times 4 \\times \\text{"}\\sqrt{84}\\text{"} \\times 13$ or $\\dfrac{1}{2} \\times 4 \\times \\text{"9.165\\ldots"} \\times 13$ ft their AF, \u2220ABF or \u2220AFB if they come from\n'
 '- Note: correct working or are clearly labelled\n'
 '- Note: or $\\dfrac{1}{2} \\times 4 \\times 10 \\times \\sin\\left(\\text{"66.421\\ldots"}\\right) \\times 13$',
 'r5-h8-2606-01-q17p0-vol')

# ---- 2026-06-01R q21p0 (mspage-2026-06-4MB1-01R-p25) ----
add('2026-06-4mb1-01r--exam-questions',21,0,'solutionMd',
 '- Note: =  15 x 24 \u2212 19 x19 [ = \u22121] (allow their MN)',
 '- Note: $15 \\times 24 - 19 \\times 19\\ [ = -1]$ (allow their MN)',
 'r5-h9-2606-01r-q21p0-det')
add('2026-06-4mb1-01r--exam-questions',21,0,'solutionMd',
 '- Note: 7 \u22129     =  7 x 32 \u2212 ( \u22129 ) x ( \u221225 ) [ = \u22121]',
 '- Note: $7 \\times 32 - (-9) \\times (-25)\\ [ = -1]$',
 'r5-h10-2606-01r-q21p0-det2')

# ---- 2026-06-01R q24p0 (mspage-2026-06-4MB1-01R-p30) ----
add('2026-06-4mb1-01r--exam-questions',24,0,'solutionMd',
 '- Note: (18 \u2212 d ) x18 = 122 oe',
 '- Note: $(18 - d) \\times 18 = 12^2$ oe',
 'r5-h11-2606-01r-q24p0-chord')
add('2026-06-4mb1-01r--exam-questions',24,0,'solutionMd',
 '- Note: or\n- Note: 2 2 Correct method to find the radius, using their PA',
 '- Note: $\\dfrac{18 - \\text{"8"}}{2}$ or $\\dfrac{\\text{"10"}}{2}$ Correct method to find the radius, using their PA',
 'r5-h12-2606-01r-q24p0-rad')

# ---- 2026-06-02R q1p0 (mspage-2026-06-4MB1-02R-p05) ----
add('2026-06-4mb1-02r--exam-questions',1,0,'solutionMd',
 '- Note: x15\n- Note: 15 + 3 + 2',
 '- Note: $\\dfrac{2400}{15 + 3 + 2} \\times 15$',
 'r5-h13-2606-02r-q1p0-ratio')

# ---- 2026-06-02R q5p0 (mspage-2026-06-4MB1-02R-p10) ----
add('2026-06-4mb1-02r--exam-questions',5,0,'solutionMd',
 '- Note: [ Area HGI =] x12 x "5"[ = 30] 1\n'
 '- Note: 2 Allow [ Area HGI =] x12 x13sin"22.6"[ = 30] or\n'
 '- Note: 2\n'
 '- Note: 1\n'
 '- Note: x "5"x13sin("67.4") [ = 30]\n'
 '- Note: 2',
 '- Note: $\\left[\\text{Area } HGI =\\right] \\dfrac{1}{2} \\times 12 \\times \\text{"5"}\\ [= 30]$\n'
 '- Note: Allow $\\left[\\text{Area } HGI =\\right] \\dfrac{1}{2} \\times 12 \\times 13\\sin\\text{"22.6"}\\ [= 30]$ or\n'
 '- Note: $\\dfrac{1}{2} \\times \\text{"5"} \\times 13\\sin\\left(\\text{"67.4"}\\right)\\ [= 30]$',
 'r5-h14-2606-02r-q5p0-area')

# ---- 2025-11-02 q10p0 solutionMd (ms-2025-11-02 q10 render p18; problemMd census hit = FP figure-label class, no change) ----
add('2025-11-4mb1-02--exam-questions',10,0,'solutionMd',
 '- Note: [ AN =]10 \u2212 x15[ = 5] (May be seen on the diagram)\n'
 '- Note: 3\n'
 '- Note: "(10 3)" = 122 + 152 \u2212 2 x12 x15cos DEC',
 '- Note: $[AN =] 10 - \\dfrac{1}{3} \\times 15\\ [ = 5]$ (May be seen on the diagram)\n'
 '- Note: $"(10\\sqrt{3})"^2 = 12^2 + 15^2 - 2 \\times 12 \\times 15\\cos DEC$',
 'r5-h15-2511-02-q10p0-cos')
