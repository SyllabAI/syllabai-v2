#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-017 tranche-2: symbol-loss restoration wave.

Scope of record (all printed-evidenced, pages READ at 150dpi):
  - 2025-06 4MB1-01: q10 (a/b/c), q16 (a/b), q21 (a/b/c), q22, q23 (a/b solutions), q26 (a/b/c)
  - 2026-06 4MB1-01: q25 bearings (order-24 tranche-2 lead — MS p26 + 450dpi zooms)
  - 2026-06 4MB1-01R: q7 (a/b), q17 (a/b), q20 (a/b), q23
Evidence: QP 2025-06 p7/12/17/18/19/24; QP 2026-06-01 p5, 01R p14/17/20;
MS 2025-06 p11/16/23/24; MS 2026-06-01 p26(+zooms); MS 2026-06-01R p8/19/24/29(+zooms).

FAIL-CLOSED: in-memory edit + gate battery; write only on ALL GREEN.
Gates: census 66/1281/2443/6600 EXACT; marks map identical; PUA/FFFD 0;
unescaped-$ parity even per edited field; diff scope EXACT (pid,field) set;
mirror law MP[0].textMd := solutionMd on S-edited parts; serialization byte-law.
"""
import json, hashlib, sys, copy

REPO = "/home/z/my-project/repos/syllabai-v2"
PLANE = f"{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json"
ART = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-017"

raw = open(PLANE, "rb").read()
data = json.loads(raw)
before_sha = hashlib.sha256(raw).hexdigest()[:16]
snapshot = copy.deepcopy(data)

DOT = "\u0307"  # combining dot above — 40-precedent recurring-decimal class

# ---------------------------------------------------------------- manifest
# (set_slug, qid, part_order) -> {field: new_text}
M = []

def add(slug, qid, porder, **fields):
    M.append((slug, qid, porder, fields))

S1 = "official-4mb1-01-2025-06"
S2 = "official-4mb1-01-2026-06"
S3 = "official-4mb1-01r-2026-06"

# ---- 2025-06 4MB1-01 q10 (QP p7, MS p11) ----
add(S1, "offq_2025-06_01_10", 0,
    problemMd="""The numbers $D$, $E$ and $F$ are given as products of their prime factors

$D = 2^9 \\times 3^x$

$E = 2^2 \\times 3^{x+1}$

$F = 2^4 \\times 3^{2x+1} \\times 7^{x+1}$

where $x$ is a positive integer.

Find the Highest Common Factor (HCF) of $D$ and $E$

Give your answer in terms of $x$ as a product of prime factors.""",
    solutionMd="$2^2 \\times 3^x$ 1 B1 do not isw Condone eg $2^2 3^x$\nAllow $2 \\times 2$ but not 4")
add(S1, "offq_2025-06_01_10", 1,
    problemMd="""Find the Lowest Common Multiple (LCM) of $E$ and $F$

Give your answer in terms of $x$ as a product of prime factors.

Given that $x$ is even,""",
    solutionMd="$2^4 \\times 3^{2x+1} \\times 7^{x+1}$ 1 B1 condone eg $2^4 \\times 3^{2x} \\times 3^1 \\times 7^x \\times 7^1$ for B1\ndo not isw\nCondone $2^4 3^{2x+1} 7^{x+1}$\nAllow $2 \\times 2 \\times 2 \\times 2$ but not 16")
add(S1, "offq_2025-06_01_10", 2,
    problemMd="find the least number that $F$ must be multiplied by to give a square number.")

# ---- q16 (QP p12, MS p16) ----
add(S1, "offq_2025-06_01_16", 0,
    problemMd="Factorise fully $10p^2q^4 - 15p^3q$",
    solutionMd="$5p^2q(2q^3 - 3p)$ 2 B2 for $5p^2q(2q^3 - 3p)$\n(B1 for correct partial factorisation seen on answer line\nor working space $5p^2(2q^4 - 3pq)$ or $p^2q(10q^3 - 15p)$\nor $5q(2p^2q^3 - 3p^3)$ or $5p^2q(2q^3 - 3p)$ or\n$5pq(2pq^3 - 3p^2)$\nor for correctly identifying the HCF in a factorisation\nof the form $5p^2q(aq^3 \\pm ...)$ or $5p^2q(... \\pm bp)$\nwhere $a$ and $b$ are integers).")
add(S1, "offq_2025-06_01_16", 1,
    problemMd="Factorise $2x^2 - 9x - 5$",
    solutionMd="$(2x + 1)(x - 5)$ 2 B2\n(B1 for any factorisation of the form\n$(ax + b)(x + c)$, where $a$, $b$ and $c$ are integers\nwhich expands to give 2 out of 3 correct terms\nB1 if further work shows a misunderstanding, such as\nsolving)")

# ---- q21 (QP p17) ----
Q21_STEM = """$\\mathbf{A} = \\begin{pmatrix} 2 & -3 \\\\ -5 & 10 \\end{pmatrix}\\qquad \\mathbf{A} - \\mathbf{B} = \\begin{pmatrix} 1 & p \\\\ -2p & 4 \\end{pmatrix}\\qquad \\mathbf{C} = \\begin{pmatrix} 4 & -5 & 2 \\\\ -1 & 3 & 8 \\end{pmatrix}$

Find matrix $\\mathbf{B}$, giving the elements of $\\mathbf{B}$ in terms of $p$ where appropriate."""
add(S1, "offq_2025-06_01_21", 0,
    problemMd=Q21_STEM,
    solutionMd="$\\begin{pmatrix} 1 & -3-p \\\\ -5+2p & 6 \\end{pmatrix}$ 2 B2 correct\n(B1 for 3 correct values or expressions in the correct\nposition)")
add(S1, "offq_2025-06_01_21", 1,
    problemMd="Find $\\mathbf{A}^{-1}$",
    solutionMd="$\\frac{1}{5}\\begin{pmatrix} 10 & 3 \\\\ 5 & 2 \\end{pmatrix}$ oe 2 B2 correct\n(B1 for a correct method to find the determinant\nand\n$\\begin{pmatrix} 2 & 0.6 \\\\ 1 & 0.4 \\end{pmatrix}$ other values correct in the correct position.\neg For determinant\n$2 \\times 10 - (-3 \\times -5)$ allow $2 \\times 10 - 3 \\times 5$ oe\nAllow the presence of 5 or 1/5 with no contradictory\nwork to imply this mark.)\nor\n4 correct values in matrix in correct position.\nand\nan attempt to find the determinant – one error only\ninvolving multiplication of diagonals\neg $2 \\times 10 + (-3 \\times -5)$ eg $2 \\times 10 - (-3 \\times 5)$ )\nIf the correct matrix is seen in the working space,\nwith the det then incorrectly included inside, isw.")
add(S1, "offq_2025-06_01_21", 2,
    problemMd="Find $\\mathbf{AC}$",
    solutionMd="$\\begin{pmatrix} 11 & -19 & -20 \\\\ -30 & 55 & 70 \\end{pmatrix}$ 2 B2 correct\n(B1 for 3, 4 or 5 correct values in the correct\nposition)")

# ---- q22 (QP p18, MS p23) ----
add(S1, "offq_2025-06_01_22", 0,
    problemMd="""Solve the simultaneous equations

$3x^2 - \\dfrac{10}{3}x + 3 = 2y$

$2x + 3y = 4$

Show clear algebraic working.""",
    solutionMd=f"""$y = \\frac{{4-2x}}{{3}}$ and $2\\left(\\frac{{4-2x}}{{3}}\\right) = 3x^2 - \\frac{{10}}{{3}}x + 3$ oe 6 M1 for substituting a rearranged linear equation into the correct
or quadratic equation (or a rearranged quadratic equation into the
correct linear equation) to form an un-simplified equation in one
variable – allow one sign error only in the rearranged equation.
$x = \\frac{{4-3y}}{{2}}$ and $2y = 3\\left(\\frac{{4-3y}}{{2}}\\right)^2 - \\frac{{10}}{{3}}\\left(\\frac{{4-3y}}{{2}}\\right) + 3$ oe This mark may be implied by a correct equation (simplified or
unsmplified) in terms of x or y Eg $8 - 4x = 9x^2 - 10x + 9$
$9x^2 - 6x + 1 (= 0)$ or M1 dep on 1st M mark for simplifying to a 3 term quadratic with
$81y^2 - 180y + 100 (= 0)$ or least 2 terms correct
or eg $18x^2 - 12x = -2$ (oe so look for signs reversed or any multiples of coefficients,
doesn't need to = 0 if terms collected on one 'side')
$(3x - 1)^2 (= 0)$ oe or $\\frac{{6 \\pm \\sqrt{{(-6)^2 - 4\\times9\\times1}}}}{{2\\times9}}$ oe M1 dep on 1st M mark for valid method to solve their quadratic.
or If factorising must multiply out to give 2 correct terms.
Allow use of formula with one sign error.
$(9y - 10)^2 (= 0)$ or $\\frac{{180 \\pm \\sqrt{{(-180)^2 - 4\\times81\\times100}}}}{{2\\times81}}$ $[x =] \\frac{{-27 \\pm \\sqrt{{27^2 - 4\\times3\\times(-188)}}}}{{2\\times3}}$.
Allow completing the square with one sign error only.
Implied by correct values. If not correct, method must be shown.
$x = \\frac{{1}}{{3}}$ oe or $y = \\frac{{10}}{{9}}$ oe A1 dependent on a correct quadratic
for a correct value of x or y
Eg $[y =] \\frac{{4 - 2\\times"\\frac{{1}}{{3}}"}}{{3}}$ or $2\\times"\\frac{{1}}{{3}}" + 3y = 4$ M1 Dep on 1st M.
or Substitute their value of x or y into a correct equation or
expression or starting again and giving a correct unsimplified
$[x =] \\frac{{4 - 3\\times"\\frac{{10}}{{9}}"}}{{2}}$ or $2x + 3\\times"\\frac{{10}}{{9}}" = 4$ equation for the relevant variable.
Implied by a correct pair of values.
If values of x or y are incorrect then working must be shown
If 2 values are found from an incorrect equation – only 1 needs
to be substituted for the mark.
$x = \\frac{{1}}{{3}}$ oe A1 oe dep on any previous 2 method marks being awarded
and $y = \\frac{{10}}{{9}}$ Allow x=0.{DOT} or 0.{DOT}r or 0.33... not 0.3
y=1.1{DOT} or 1.1{DOT}r or 1.11... not 1.1
wr Total 6 marks""")

# ---- q23 solutions (MS p24); problemMd table re-emit FILED as lead (no GFM precedent) ----
add(S1, "offq_2025-06_01_23", 0,
    solutionMd="""4 M2 for at least 3 correct products using the midpoints (need not be
$[300 \\times 7] + [900 \\times 13] + [1500 \\times 28] +$
$[2100 \\times 42] + [2700 \\times 10]$ evaluated but must be added)
or
$2100 + 11700 + 42000 + 88200 +$
$27000 [= 171000]$ or
If not M2: M1 for at least 3 products using frequency and a value
within the interval with intention to add (eg an (incorrect) total at
the bottom of the table or on the page or an addition sign
somewhere next to their products or totals).
Condone use of the lower or upper bounds.
The numbers used can be a mix of, for example, upper, lower and
midpoint or any number in the interval.
[upper bound products for example, are:
4200, 15600, 50400, 100800, 30000, total = 20100]
[lower bound products for example, are:
0, 7800, 33600, 75600, 24000, total = 14100]
or
at least 3 correct products using midpoints without adding.
If candidates are using upper or lower bounds or midpoints the
evaluated products or the total will imply their working. If not,
they must show what they are using to calculate their products.
eg $\\frac{"171000"}{100}$ or $\\frac{"171000"}{7 + 13 + 28 + 42 + 10}$ M1 dep on at least M1 awarded
Allow division by their Σf provided addition seen or total under
column seen
1710 A1""")
add(S1, "offq_2025-06_01_23", 1,
    solutionMd="""$33 \\times 100 - 2976 (= 324)$ 3 M1 find the total for the 9 trainees
$\\frac{"324"}{9}$ M1 dep on 1st M mark for complete method to find the mean wage
for the 9 trainees
36 A1""")

# ---- q26 (QP p24) ----
add(S1, "offq_2025-06_01_26", 0, problemMd="Solve the inequality $3x - 5 < 15 - 2x$")
add(S1, "offq_2025-06_01_26", 1, problemMd="Solve the inequality $x(x - 1) > 6$\nShow clear algebraic working.")
add(S1, "offq_2025-06_01_26", 2, problemMd="Hence find the range of values of $x$ for which both $3x - 5 < 15 - 2x$ and $x(x - 1) > 6$")

# ---- 2026-06 4MB1-01 q25 bearings (MS p26 + zooms) — the order-24 lead ----
add(S2, "offq_2026-06_01_25", 0,
    solutionMd="""∠YAX = 320 − 270 [ = 50] 6 M1 Correct method to find ∠YAX .
May be seen on diagram or used
$AY = \\frac{45}{\\tan 10}$ [ = 255.207...] M1 Correct method to find AY
Allow awrt 255
May be seen on diagram or used
$XY^2 = "255.207..."^2 + 2000^2 - 2 \\times "255.207..." \\times 2000\\cos"50"$ oe M1 For a fully correct method to find $XY^2$ or $XY$
or $XY^2 = 3408953.61...$ [ = 1846.33...]
or $XY = 1846.33...$ ft their AY and ∠YAX if clearly labelled or from
or $XY^2 = \\left("255.207..."\\sin(50)\\right)^2 + \\left(2000 - "255.207..."\\cos(50)\\right)^2$
correct working.
Allow awrt 3410000 or awrt 1850
$\\frac{\\sin \\angle YXA}{"255.207..."} = \\frac{\\sin"50"}{\\sqrt{"3409381.6..."}}$ oe or $\\sin \\angle YXA = 0.106$ or M1 for a correct method to find either ∠YXA or
∠XYA
$\\left("255.207..."\\right)^2 = \\left("1846.33..."\\right)^2 + 2000^2 - 2 \\times 2000 \\times "1846.33..."\\cos\\left(\\angle YXA\\right)$ ft their AY, XY and ∠YAX if clearly labelled or
from correct working.
or $\\angle XYA = \\cos^{-1}\\left(\\frac{\\left("1846.33..."\\right)^2 + \\left("255.207..."\\right)^2 - 2000^2}{2 \\times "1846.33..." \\times "255.207..."}\\right)$ Correct method implied by
∠XYA = 123.927... or ∠YXA = 6.0777...
$\\frac{\\sin \\angle XYA}{2000} = \\frac{\\sin"50"}{\\sqrt{"3409381.6..."}}$ oe or $\\sin \\angle XYA = 0.82974...$
$2000^2 = \\left("1846.33..."\\right)^2 + \\left("255.207..."\\right)^2 - 2 \\times "255.207..." \\times "1846.33..."\\cos\\left(\\angle XYA\\right)$
or $\\angle YXA = \\cos^{-1}\\left(\\frac{\\left("1846.33..."\\right)^2 + 2000^2 - \\left("255.207..."\\right)^2}{2 \\times "1846.33..." \\times 2000}\\right)$
$140 + "123.927"$ or $180 + (90 - "6.0777")$ or M1 fully correct method to find the bearing.
$(90 + "50") + (180 - "56.0728...")$ ft their angle(s) if clearly labelled or comes from
correct working
264 A1 dep on at least 2 method marks awarded.
awrt 264
wr Total 6 marks""")

# ---- 2026-06 01R q7 (QP p5, MS p8) ----
Q7_STEM = """$\\mathbf{A} = \\begin{pmatrix} 1 & -1 \\\\ 3 & -4 \\end{pmatrix}\\qquad \\mathbf{B} = \\begin{pmatrix} 3 & 3 \\\\ -1 & 5 \\end{pmatrix}\\qquad \\mathbf{C} = \\begin{pmatrix} x & 2 \\\\ -2 & x \\end{pmatrix}\\qquad \\mathbf{D} = \\begin{pmatrix} 4 & 1 \\\\ 1 & -1 \\end{pmatrix}$

Find $\\mathbf{A} + \\mathbf{B}$

Given that $\\mathbf{A} + \\mathbf{C} = \\mathbf{D}$"""
add(S3, "offq_2026-06_01r_7", 0,
    problemMd=Q7_STEM,
    solutionMd="$\\begin{pmatrix} 4 & 2 \\\\ 2 & 1 \\end{pmatrix}$ 2 B2 Fully correct\n(B1 2 or 3 values correct)")
add(S3, "offq_2026-06_01r_7", 1, problemMd="find the value of $x$ x =")

# ---- 01R q17 (QP p14, MS p19) ----
add(S3, "offq_2026-06_01r_17", 0,
    problemMd="Simplify fully $\\left(2x^2y^3\\right)^3$",
    solutionMd="""Examples for B1:
$2^3x^6y^9$
$x^5 \\times 2^3 \\times y^9$
$x^6 \\times y^9 \\times 2^3$
$4.5x^6y^9$
$8x^6y^9$ 2 B2 For the correct term. Allow in any order eg $x^68y^9$
8 must not be $2^3$
(B1 any 2 terms correct as part of a product of the form
$bx^ny^m$ $b, m, n \\neq 0$. Allow 8 to be $2^3$
Condone terms with or without of multiplication signs for B1
only eg $x^6 \\times y^92^3$
Only allow transcription errors of the powers or the constant
onto the answer line)
Do not isw (B1 only)""")
add(S3, "offq_2026-06_01r_17", 1,
    problemMd="Write $\\left(\\frac{125p^{11}q}{375p^{15}q^3}\\right)^{-2}$ in the form $ap^mq^n$ where $a$, $m$ and $n$ are integers.",
    solutionMd="""Examples for B1:
$3^2p^8q^4$
$p^8 \\times 3^2 \\times q^{-2}$
$p^6 \\times q^4 \\times 3^2$
$p^8q^4 \\times 6$
$9p^8q^4$ 2 B2 Allow in any order eg $p^8q^49$
Condone $a = 9$, $m = 8$, $n = 4$
9 must not be $3^2$
B1 any 2 terms correct as part of a product of the form
$ap^nq^m$ $a, n, m \\neq 0$. Allow 9 to be $3^2$
Condone terms with or without of multiplication signs for B1
only eg $p^6 \\times q^43^2$
Only allow transcription errors of the powers or the constant
onto the answer line
Do not isw (B1 only)""")

# ---- 01R q20 (QP p17, MS p24) ----
add(S3, "offq_2026-06_01r_20", 0,
    problemMd="""$f(x) = x^3 + 7x^2 + 17x + 14$

Use the factor theorem to show that $(x + 2)$ is a factor of $f(x)$

Given that $f(x) = (x + 2)Q(x)$ where $Q(x)$ is a quadratic expression in $x$""",
    solutionMd="""[ $f(-2) =$] eg 2 M1
If a full substitution is not seen, the minimum we will accept
$(-2)^3 + 7 \\times ([-]2)^2 + 17 \\times -2 + 14$
is
$-8 + 28 - 34 + 14$
Condone
$-2^3 + 7 \\times -2^2 + 17 \\times -2 + 14 = 0$
or
$-2^3 + 7 \\times (-2)^2 + 17 \\times -2 + 14 = 0$
Must see = 0 for either of these
Ignore any reference to long division for part (a)
wr =0 A1""")
add(S3, "offq_2026-06_01r_20", 1,
    problemMd="find $Q(x)$ $Q(x) =$",
    solutionMd="""$x^2 + Ax + 7$ or $x^2 + 5x + B$  $A, B > 0$ 2 M1 Any 2 terms of the quadratic factor obtained –
this may be seen awarded for the correct quadratic factor
seen in part (a)
cas $x^2 + 5x + 7$ A1
Do not isw eg if they go on to solve, after seeing the correct
quadratic, award A0
This must be seen in part (b) to be awarded""")

# ---- 01R q23 (QP p20, MS p29 + zooms; AS-PRINTED incl Pearson sign inconsistency) ----
add(S3, "offq_2026-06_01r_23", 0,
    problemMd="The curve with equation $y = x^3 - 15x + 5$ has two stationary points.\nFind the exact coordinates of each of these stationary points.",
    solutionMd="""$3x^2$ or $-15$ 5 M1 one correct algebraic term correctly differentiated
$"3x^2 - 15" = 0$ or M1 dep on previous method mark, their derivative = 0
$[x =] \\sqrt{5}$ or $[x =] -\\sqrt{5}$ dependent also on a derivative in the form
$3x^2 + b$ or $ax^2 - 15$ $a, b \\neq 0$
May be implied by $[x =] \\sqrt{5}$ or $[x =] -\\sqrt{5}$
$\\left("±\\sqrt{5}"\\right)^3 - 15 \\times \\left("±\\sqrt{5}"\\right) + 5$ M1 dep on previous method mark
for substituting any value of x (from previous working)
into $x^3 - 15x + 5$
Condone use of a decimal here.
This mark can be implied by a correct coordinate,
decimal or exact.
$\\left(\\sqrt{5}, 5 - 10\\sqrt{5}\\right)$ oe exact A2 for both coordinates correct
eg $\\left(-\\sqrt{5}, 5 - \\sqrt{500}\\right)$ A1 only
$\\left(-\\sqrt{5}, 5 + 10\\sqrt{5}\\right)$ oe exact for one correct coordinate
or
eg $\\left(-\\sqrt{5}, 5 + \\sqrt{500}\\right)$ all values correct given as decimals awrt 1dp or a mix of
surds and decimals
$\\sqrt{5} = 2.2(36067....)$ $5 + 10\\sqrt{5} = 27.4$ ($27.36067977$)
$5 + 10\\sqrt{5} = -17.4$ ($-17.36067977$)
Allow answers to be given as x = and y =, so long as
correctly paired. If seen we can isw
cas - discuss Total 5 marks""")

# ---------------------------------------------------------------- apply (in-memory)
index = {}
for si, s in enumerate(data):
    for qi, q in enumerate(s.get("questions") or []):
        for pi, p in enumerate(q.get("parts") or []):
            index[(s["slug"], q["id"], p.get("order"))] = (si, qi, pi)

edits, missing = [], []
for slug, qid, porder, fields in M:
    key = (slug, qid, porder)
    if key not in index:
        missing.append(key); continue
    si, qi, pi = index[key]
    p = data[si]["questions"][qi]["parts"][pi]
    for field, new in fields.items():
        old = p.get(field)
        edits.append({"slug": slug, "qid": qid, "porder": porder,
                      "pid": p.get("id"), "field": field,
                      "old_sha16": hashlib.sha256((old or "").encode()).hexdigest()[:16] if old else None,
                      "new_len": len(new)})
        p[field] = new
    # mirror law: MP[0].textMd := solutionMd on S-edited parts
    if "solutionMd" in fields:
        mps = p.get("markPoints") or []
        if mps:
            edits.append({"slug": slug, "qid": qid, "porder": porder,
                          "pid": p.get("id"), "field": "markPoints[0].textMd",
                          "old_sha16": hashlib.sha256((mps[0].get("textMd") or "").encode()).hexdigest()[:16] if mps[0].get("textMd") else None,
                          "new_len": len(fields["solutionMd"])})
            mps[0]["textMd"] = fields["solutionMd"]

if missing:
    print("FATAL missing targets:", missing); sys.exit(2)

# ---------------------------------------------------------------- gates
def census(d):
    return (len(d),
            sum(len(s.get("questions") or []) for s in d),
            sum(len(q.get("parts") or []) for s in d for q in s.get("questions") or []),
            sum((p.get("marks") or 0) for s in d for q in s.get("questions") or [] for p in q.get("parts") or []))

def marks_map(d):
    out = {}
    for s in d:
        for q in s.get("questions") or []:
            for p in q.get("parts") or []:
                mps = p.get("markPoints") or []
                out[p["id"]] = (p.get("marks"), tuple((m.get("marks"), m.get("code")) for m in mps))
    return out

gates = {}
gates["census_EXACT"] = census(data) == (66, 1281, 2443, 6600)
gates["marks_map_identical"] = marks_map(data) == marks_map(snapshot)

bad = []
for s in data:
    for q in s.get("questions") or []:
        for p in q.get("parts") or []:
            txt = json.dumps([p.get("problemMd"), p.get("solutionMd")] +
                             [m.get("textMd") for m in (p.get("markPoints") or [])], ensure_ascii=False)
            if "\ufffd" in txt or any(0xE000 <= ord(c) <= 0xF8FF for c in txt):
                bad.append(p["id"])
gates["PUA_FFFD_0"] = not bad

dollar_bad = []
for e in edits:
    if e["field"] in ("problemMd", "solutionMd"):
        for si, s in enumerate(data):
            for q in s.get("questions") or []:
                for p in q.get("parts") or []:
                    if p.get("id") == e["pid"] and (slugmatch := s["slug"] == e["slug"]):
                        f = e["field"]
                        txt = p.get(f) or ""
                        if f == "solutionMd" and not (p.get("markPoints") or []):
                            pass
                        n = txt.replace("\\$", "").count("$")
                        if n % 2:
                            dollar_bad.append((e["pid"], f))
                        break
gates["dollar_parity"] = not dollar_bad

# mirror law byte-exact
mirror_bad = []
for e in edits:
    if e["field"] == "solutionMd":
        for s in data:
            if s["slug"] != e["slug"]: continue
            for q in s.get("questions") or []:
                for p in q.get("parts") or []:
                    if p.get("id") == e["pid"]:
                        mp = (p.get("markPoints") or [{}])[0]
                        if mp.get("textMd") != p.get("solutionMd"):
                            mirror_bad.append(e["pid"])
gates["mirror_law"] = not mirror_bad

# diff scope: S-edited parts must have MP[0].textMd changed or equal; expected edit count
expected_n = sum(len(f) for _, _, _, f in M) + sum(1 for _, _, _, f in M if "solutionMd" in f)
gates["diff_scope_EXACT"] = len(edits) == expected_n

# serialization byte-law round trip
new_raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
gates["serialization_roundtrip"] = json.loads(new_raw) == data

ALLGREEN = all(gates.values())
print("BEFORE sha16:", before_sha)
print("AFTER  sha16:", hashlib.sha256(new_raw).hexdigest()[:16])
print("edits:", len(edits), "expected:", expected_n)
print("GATES:", json.dumps(gates))
if dollar_bad: print("dollar_bad:", dollar_bad[:5])
if mirror_bad: print("mirror_bad:", mirror_bad[:5])
if not ALLGREEN:
    print("FAIL-CLOSED: no write"); sys.exit(3)

open(PLANE, "wb").write(new_raw)
json.dump({"edits": edits, "before": before_sha,
           "after": hashlib.sha256(new_raw).hexdigest()[:16]},
          open(f"{ART}/tranche2-apply-log.json", "w"), ensure_ascii=False, indent=1)
print("WROTE plane. edits:", len(edits))
