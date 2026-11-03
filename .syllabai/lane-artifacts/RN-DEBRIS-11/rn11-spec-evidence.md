# RN-DEBRIS-11 run-002 — R1 official-spec attestation register

Evidence source of record for the R1 de-zipper pairs (30 repaired / 1 refused):

- Document: "Pearson Edexcel International Advanced Subsidiary/Advanced Level
  in Mathematics, Further Mathematics and Pure Mathematics – Specification –
  Issue 3 – April 2019 © Pearson Education Limited 2019"
- URL: https://qualifications.pearson.com/content/dam/pdf/International%20Advanced%20Level/Mathematics/2018/Specification-and-Sample-Assessment/international-a-level-maths-spec.pdf
- sha256 (downloaded 2026-11-03, this session): see receipt
  rn11-spec-sha256.txt
- Extraction: pdftotext -layout (the layout pass flattens superscripts/fractions;
  the reconstruction maps them to the corpus house style: unicode superscripts
  ² ³ ⁴ ˣ ⁿ ᵏ, U+2044 fraction slash, ".: • " bullet separator).

Per-text register (corrupted-text anchor -> spec section -> use):

| anchor (corrupted)                | unit.section | official wording use |
|-----------------------------------|--------------|----------------------|
| Represent rati                    | P1 1.8       | guidance "Represent linear and quadratic inequalities such as y > x + r and y > ax2 + bx + c graphically. Shading and use of dotted and solid line convention is required." |
| bracke polynomials of degree      | P1 1.10      | guidance "Students should be able to use brackets. Factorisation of polynomials of degree n, n  3, e.g. x3 + 4x2 + 3x. The notation f(x) may be used." (the PDF itself drops the comparison glyph; the corpus's own bytes "n 3" preserved) |
| wledgeofthx2                      | P1 1.11      | guidance "Functions to include simple cubic functions and the reciprocal functions y=k/x and y=k/x2 with x != 0. Knowledge of the term asymptote is expected. Also, trigonometric graphs." |
| 4=18throughth                     | P1 2.1       | guidance "(ii) ... For example, the line perpendicular to the line 3x + 4y = 18 through the point (2, 3) has equation y - 3 = 4/3(x - 2)." (perpendicular gradient +4/3) |
| 1reaofatriangl                    | P1 3.1       | "The sine and cosine rules, and the area of a triangle in the form 1/2 ab sin C. Including the ambiguous case of the sine rule." |
| differe s such as x               | P1 4.2       | guidance "The ability to differentiate expressions such as (2x + 5)(x - 1) and (x2 + 5x - 3)/3x is expected." |
| theabilit2/2andy                  | P1 5.2       | REFUSED (see receipt) — official reading "the ability to integrate expressions such as 1/2x2 - 3x-1 and ((x + 2)2)/x is expected" leaves one '2' unaccounted |
| Needtoknowa                       | P1 1.4       | guidance "Need to know and to use b2 - 4ac > 0, b2 - 4ac = 0 and b2 - 4ac < 0" |
| uationofa/e+of(yth                | P2 3.1       | "Coordinate geometry of the circle using the equation of a circle in the form (x - a)2 + (y - b)2 = r2 and including use of the following circle properties: (i)... (ii)... (iii)..." |
| lutionofequati/=b                 | P2 5.3       | "The solution of equations of the form ax = b. Students may use the change of base formula." |
| ple,findthefin/                   | P2 8.2       | guidance "For example, find the finite area bounded by the curve y = 6x - x2 and the line y = 2x. [integral] x dy will not be required. ..." |
| sproofbycoun/                     | P2 1.3 + "2. Algebra and functions" | guidance "Disproof by counter example - show that the statement "n2 - n + 1 is a prime number for all values of n" is untrue." (restoration "Alge" from the section header) |
| buired,e.g./a                     | P2 2.1 + "3. Coordinate geometry in the (x, y) plane" | guidance "Only division by (ax + b) or (ax - b) will be required, e.g. students should know that if f(x) = 0 when x = b/a, then (ax - b) is a factor of f(x). ..." (restoration "Coo"; "b" accounted in-corpus) |
| owledgeand/θ2                     | P3 2.2       | "Knowledge and use of sec2 θ = 1 + tan2 θ and cosec2 θ = 1 + cot2 θ." (the of-record title) |
| ludeapplicatio/2θ                 | P3 2.3 + "3. Exponential and logarithms" | "Knowledge and use of double angle formulae; ... To include application to half angles. Knowledge of the t (tan 1/2 θ) formulae will not be required. Students should be able to solve equations such as a cos θ + b sin θ = c ... cos x cos 2x + sin x sin 2x identically-equals cos x." (restoration "Exp"; the PDF's own "t (tan" quirk preserved) |
| aph;lnx/                          | P3 3.2       | "The function ln x and its graph; ln x as the inverse function of ex. Solution of equations of the form e(ax + b) = p and ln (ax + b) = q is expected." |
| eo3x/xsition                      | P3 4.2       | guidance "... such as 2x4 sin x, e(3x)/x, cos x2 and tan2 2x." |
| xoin1/                            | P3 5.1       | "Integration of ekx, 1/xn, sin kx, cos kx and their sums and differences. To include integration of standard functions such as sin 3x, e5x, 1/(2x)." |
| illmean'dogf/                     | P3 1.2       | "The concept of a function as a one-one or many-one mapping from R (or a subset of R) to R. The notation f:x and f(x) will be used. Students should know that fg will mean 'do g first, then f'. Students should know that if f-1 exists, then f-1f(x) = ff-1(x) = x." (no mapsto arrow: corpus bytes rule) |
| uld be able to obtain the expansion ab | P4 4.1 + "5. Differentiation" | "For | x | < b/a, students should be able to obtain the expansion of (ax + b)n, and the expansion of rational functions by decomposition into partial fractions." (restoration "Diff"; bound is b/a per the PDF) |
| fintegratio/dx,∫eˣ                | P4 6.2       | "Students will be expected to use a substitution to find, e.g. ... The substitution will be given in more complicated integrals. The integral [integral] ln x dx is required. More than one application of integration by parts may be required, for example, ..." (integral bodies kept as the corpus's own bytes) |
| (cx + d)²chas/                    | P4 2.1 + "3. Coordinate geometry in the (x, y) plane" | "Partial fractions to include denominators such as (ax + b)(cx + d)(ex + f) and (ax + b)(cx + d)2. The degree of the numerator may equal or exceed ... Quadratic factors ... are not required." (restoration "Coo") |
| bnax +bx/a                        | FP1 2.1      | "For the equation ax2 + bx + c = 0, whose roots are α and β, then α + β = -b/a, αβ = c/a." |
| ntudents/∑r                       | FP1 7.1      | "Students should be able to sum series such as [n over r=1] sum r, [..] sum r2, [..] sum r(r2 + 2). The method of differences is not required." |
| erroo/−x³                         | FP1 1.6      | "For example, (i) f(x) = x4 - x3 - 5x2 + 7x + 10 Given that x = 2 + i is a root of f(x) = 0, use algebra to find the three other roots of f(x) = 0 (ii) g(x) = x4 - x3 + 6x2 + 14x - 20 Given g(1) = 0 and g(-2) = 0, use algebra to solve g(x) = 0 completely." |
| 3/i+tmple                         | M2 1.4 + "2. Centres of mass" | "For example, given that r = t3/2 i + t2 j, find r-dot and r-ddot at a given time." (the derivative dots are PUA-accent glyphs U+F026 in the PDF text layer, attached to the r's; restorations "Cen" + the two combining dots) |
| is the rate of/the chain rule     | P1 4.1       | "For example, knowledge that dy/dx is the rate of change of y with respect to x. Knowledge of the chain rule is not required. The notation f'(x) and f''(x) may be used." |
| πor the/4 (and πorthe/4)          | P3 1.4 + "2. Trigonometry" | "Students should be able to sketch the graph of, for example, y = 2f(3x), y = f(-x) + 1, given the graph of y = f(x) or the graph of, for example, y = 3 + sin 2x, y = - cos(x + pi/4). The graph of y = f(ax + b) will not be required." (restorations "Trig" + the big-paren pair — the PDF text layer carries the CMEX paren glyphs U+F8EC/U+F8F7 around "x + pi/4") |
| X)+b,/Var(X)                      | S1 5.3       | "Use of E(X), E(X2) for calculating the variance of X. Knowledge and use of E(aX + b) = aE(X) + b, Var(aX + b) = a2 Var(X)." |

Byte-accounting gate (all 30 repaired): after stripping U+2044 and whitespace and
applying the superscript-flavor normalization (the zip's math pass scrambled
2<->2, 3<->3, n<->n, x<->x, 1<->1, -<->- flavors), the corrupted multiset EQUALS
the intended multiset PLUS the declared official-attested restorations exactly:
Alge (P2 1.3), Coo (P2 2.1, P4 2.1), Exp (P3 2.3), Diff (P4 4.1),
Cen + U+0307 + U+0308 (M2 1.4), Trig + ( + ) (P3 1.4 x2), ( + ) (P1 4.2).
The U+2044 count of the intended never exceeds the corrupted count (the zip
moves fraction slashes; it never invents them).
