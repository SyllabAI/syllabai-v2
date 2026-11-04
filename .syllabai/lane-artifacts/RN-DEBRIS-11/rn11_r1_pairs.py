#!/usr/bin/env python3
"""RN-DEBRIS-11 run-002 — R1 de-zipper pair table + zero-invention gate.

Evidence chain per pair:
  intended = official Pearson IAL Maths spec (Issue 3, April 2019) wording,
  rendered in the corpus house style (unicode superscripts, U+2044 fraction
  slash, ".: • " bullet separator, corpus math spacing).

Gate (byte-level zero-invention):
  missing = multiset(corrupted) - multiset(intended)   must be EMPTY
  extra   = multiset(intended)  - multiset(corrupted)  must equal the
            declared per-text restorations EXACTLY (every restoration byte
            justified by the official spec, listed in the receipt).
  Multisets computed after stripping U+2044 and whitespace and applying the
  superscript-flavor normalization (the zip's math-render pass scrambled
  flavors: 2<->2, 3<->2, n<->n, x<->x, ...). Fraction-slash count of the
  intended must never exceed the corrupted count (the zip moves but never
  invents U+2044).

Prints PASS/FAIL per pair + writes /tmp/rn11/r1_pairs.json for the converter.
"""
import json
from pathlib import Path
from collections import Counter

REPO = Path("/home/z/my-project/work/sv2-rn9")
ADJ = json.load(open(REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/rn11_adjudication.json"))

SUP = {"2": "\u00b2", "3": "\u00b3", "4": "\u2074", "x": "\u02e3", "n": "\u207f",
       "k": "\u1d4f", "a": "\u1d43", "1": "\u00b9", "-": "\u207b",
       "\u2099": "\u207f"}

def mset(s):
    return Counter(SUP.get(c, c) for c in s if c != "\u2044" and not c.isspace())

# ---- (anchor, intended, restorations) — anchor = unique substring of the corrupted text ----
TABLE = [
("Represent rati",
 "Represent linear and quadratic inequalities graphically.: \u2022 Represent linear and quadratic inequalities such as y > x + r and y > ax\u00b2 + bx + c graphically. Shading and use of dotted and solid line convention is required.",
 ""),
("bracke polynomials of degree",
 "Algebraic manipulation of polynomials, including expanding brackets and collecting like terms, factorisation.: \u2022 Students should be able to use brackets. Factorisation of polynomials of degree n, n 3, e.g. x\u00b3 + 4x\u00b2 + 3x.The notation f(x) may be used.",
 ""),
("wledgeofthx2",
 "Graphs of functions; sketching curves defined by simple equations. Geometrical interpretation of algebraic solution of equations. Use of intersection points of graphs of functions to solve equations.: \u2022 Functions to include simple cubic functions and the reciprocal functions y = k\u2044x and y = k\u2044x\u00b2 with x \u2260 0. Knowledge of the term asymptote is expected. Also, trigonometric graphs.",
 ""),
("4=18throughth",
 "Equation of a straight line, including the forms y \u2212 y\u2081 = m(x \u2212 x\u2081) and ax + by + c = 0.: \u2022 To include: (i) the equation of a line through two given points (ii) the equation of a line parallel (or perpendicular) to a given line through a given point. For example, the line perpendicular to the line 3x + 4y = 18 through the point (2, 3) has equation y \u2212 3 = 4\u20443(x \u2212 2).",
 ""),
("1reaofatriangl",
 "The sine and cosine rules, and the area of a triangle in the form 1\u20442 ab sin C.: \u2022 Including the ambiguous case of the sine rule.",
 ""),
("differe s such as x",
 "Differentiation of x\u207f, and related sums, differences and constant multiples.: \u2022 The ability to differentiate expressions such as (2x + 5)(x \u2212 1) and (x\u00b2 + 5x \u2212 3)\u20443x is expected.",
 "()"),
("theabilit2\u20442andy",
 "Integration of x\u207f and related sums, differences and constant multiples.: \u2022 (Excluding n = \u22121 and related sums, differences and multiples). For example, the ability to integrate expressions such as 1\u20442x\u00b2 \u2212 3x\u207b\u00b9 and (x + 2)\u00b2\u2044x is expected. Given f \u2032(x) and a point on the curve, students should be able to find an equation of the curve in the form y = f(x).",
 "REFUSE: the '2\u20442andy' region carries a duplicated '2' unaccounted by the official-anchored reading (P1 5.2: '1\u20442x\u00b2 \u2212 3x\u207b\u00b9 and (x + 2)\u00b2\u2044x'); byte-exact reconstruction not attestable"),
("Needtoknowa",
 "The discriminant of a quadratic function.: \u2022 Need to know and to use b\u00b2 \u2212 4ac > 0, b\u00b2 \u2212 4ac = 0 and b\u00b2 \u2212 4ac < 0",
 ""),
("uationofa\u2044e+of(yth",
 "Coordinate geometry of the circle using the equation of a circle in the form (x \u2212 a)\u00b2 + (y \u2212 b)\u00b2 = r\u00b2 and including use of the following circle properties: \u2022 (i) the angle in a semicircle is a right angle; (ii) the perpendicular from the centre to a chord bisects the chord; (iii) the perpendicularity of radius and tangent. \u2022 Students should be able to find the radius and the coordinates of the centre of the circle, given the equation of the circle and vice versa.",
 ""),
("lutionofequati\u2044=b",
 "The solution of equations of the form a\u02e3 = b.: \u2022 Students may use the change of base formula.",
 ""),
("ple,findthefin\u2044",
 "Interpretation of the definite integral as the area under a curve.: \u2022 Students will be expected to be able to evaluate the area of a region bounded by a curve and given straight lines. For example, find the finite area bounded by the curve y = 6x \u2212 x\u00b2 and the line y = 2x. \u222bxdy will not be required. Students will be expected to be able to evaluate the area of a region bounded by two curves.",
 ""),
("sproofbycoun\u2044",
 "Disproof by counter example. Algebra and functions: \u2022 Disproof by counter example \u2013 show that the statement \u201cn\u00b2 \u2212 n + 1 is a prime number for all values of n\u201d is untrue.",
 "Alge"),
("buired,e.g.\u2044a",
 "Simple algebraic division; use of the Factor Theorem and the Remainder Theorem. Coordinate geometry in the (x, y) plane: \u2022 Only division by (ax + b) or (ax \u2013 b) will be required, e.g. students should know that if f(x) = 0 when x = b\u2044a, then (ax \u2013 b) is a factor of f(x). Students may be required to factorise cubic expressions such as x\u00b3 + 3x\u00b2 \u2212 4 and 6x\u00b3 + 11x\u00b2 \u2212 x \u2212 6. Students should be familiar with the terms \u2018quotient\u2019 and \u2018remainder\u2019 and be able to determine the remainder when the polynomial f(x) is divided by (ax + b).",
 "Coo"),
("owledgeand\u2044\u03b82",
 "Knowledge and use of sec\u00b2\u03b8 = 1 + tan\u00b2\u03b8 and cosec\u00b2\u03b8 = 1 + cot\u00b2\u03b8.",
 ""),
("ludeapplicatio\u20442\u03b8",
 "Knowledge and use of double angle formulae; use of formulae for sin (A \u00b1 B), cos (A \u00b1 B) and tan (A \u00b1 B) and of expressions for a cos \u03b8 + b sin \u03b8 in the equivalent forms of r cos (\u03b8 \u00b1 a) or r sin (\u03b8 \u00b1 a). Exponential and logarithms: \u2022 To include application to half angles. Knowledge of the t (tan 1\u20442\u03b8) formulae will not be required. Students should be able to solve equations such as a cos \u03b8 + b sin \u03b8 = c in a given interval, and to prove identities such as cos x cos 2x + sin x sin 2x \u2261 cos x.",
 "Exp"),
("aph;lnx\u2044",
 "The function ln x and its graph; ln x as the inverse function of e\u02e3.: \u2022 Solution of equations of the form e\u1d43\u02e3\u207a\u1d47 = p and ln (ax + b) = q is expected.",
 ""),
("eo3x\u2044xsition",
 "Differentiation using the product rule, the quotient rule and the chain rule.: \u2022 Differentiation of cosecx, cotx and secx are required. Skill will be expected in the differentiation of functions generated from standard functions using products, quotients and composition, such as 2x\u2074 sin x, e\u00b3x\u2044x, cos x\u00b2 and tan\u00b2 2x.",
 ""),
("xoin1\u2044",
 "Integration of e\u1d4f\u02e3, 1\u2044x\u207f, sinkx, cos kx and their sums and differences.: \u2022 To include integration of standard functions such as sin3x, 1\u20442x, e\u2075\u02e3",
 ""),
("illmean\u2018dogf\u2044",
 "Definition of a function. Domain and range of functions. Composition of functions. Inverse functions and their graphs.: \u2022 The concept of a function as a one-one or many-one mapping from \u211d (or a subset of \u211d) to \u211d. The notation f : x and f(x) will be used. Students should know that fg will mean \u2018do g first, then f \u2019. Students should know that if f\u207b\u00b9 exists, then f\u207b\u00b9f(x) = ff\u207b\u00b9(x) = x.",
 ""),
("uld be able to obtain the expansion ab",
 "Binomial Series for any rational n. Differentiation: \u2022 For | x | < b\u2044a, students should be able to obtain the expansion of (ax + b)\u207f, and the expansion of rational functions by decomposition into partial fractions.",
 "Diff"),
("fintegratio\u2044dx,\u222be\u02e3",
 "Simple cases of integration by substitution and integration by parts. Understand these methods as the reverse processes of the chain and product rules respectively.: \u2022 Students will be expected to use a substitution to find, e.g. \u222bx x\u22122dx The substitution will be given in more complicated integrals. The integral \u222blnxdx is required. More than one application of integration by parts may be required, for example, \u222bx\u00b2e\u02e3dx, \u222be\u02e3sinxdx.",
 ""),
("(cx + d)\u00b2chas\u2044",
 "Decompose rational functions into partial fractions (denominators not more complicated than repeated linear terms). Coordinate geometry in the (x, y) plane: \u2022 Partial fractions to include denominators such as (ax + b)(cx + d)(ex + f) and (ax + b)(cx + d)\u00b2. The degree of the numerator may equal or exceed the degree of the denominator. Applications to integration, differentiation and series expansions. Quadratic factors in the denominator such as (x\u00b2 + a), a > 0, are not required.",
 "Coo"),
("bnax +bx\u2044a",
 "Sum of roots and product of roots of a quadratic equation.: \u2022 For the equation ax\u00b2 + bx + c = 0, whose roots are \u03b1 and \u03b2, then \u03b1 + \u03b2 = \u2212b\u2044a, \u03b1\u03b2 = c\u2044a.",
 ""),
("ntudents\u2044\u2211r",
 "Summation of simple finite series.: \u2022 Students should be able to sum series such as \u2211n r=1 r, \u2211n r=1 r\u00b2, \u2211n r=1 r(r\u00b2 + 2). The method of differences is not required.",
 ""),
("erroo\u2044\u2212x\u00b3",
 "Finding conjugate complex roots and/or real roots of a quartic equation with real coefficients.: \u2022 For example, (i) f(x) = x\u2074 \u2212 x\u00b3 \u2212 5x\u00b2 + 7x + 10 Given that x = 2 + i is a root of f(x) = 0, use algebra to find the three other roots of f(x) = 0 (ii) g(x) = x\u2074 \u2212 x\u00b3 + 6x\u00b2 + 14x \u2212 20 Given g(1) = 0 and g(\u22122) = 0, use algebra to solve g(x) = 0 completely.",
 ""),
("3\u2044i+tmple",
 "Differentiation and integration of a vector with respect to time. Centres of mass: \u2022 For example, given that r = t\u00b3\u20442 i + t\u00b2 j, find r\u0307 and r\u0308 at a given time.",
 "Cen\u0307\u0308"),
("is the rate of\u2044the chain rule",
 "The derivative of f(x) as the gradient of the tangent to the graph of y = f(x) at a point; the gradient of the tangent as a limit; interpretation as a rate of change; second order derivatives.: \u2022 For example, knowledge that dy\u2044dx is the rate of change of y with respect to x. Knowledge of the chain rule is not required. The notation f \u2032(x) and f \u2032\u2032(x) may be used.",
 ""),
("\u03c0or the\u20444",
 "Combinations of the transformations y = f(x) as represented by y = af(x), y = f(x) + a, y = f(x + a), y = f(ax). Trigonometry: \u2022 Students should be able to sketch the graph of, for example, y = 2f(3x), y = f(\u2212x) + 1, given the graph of y = f(x) or the graph of, for example, y = 3 + sin 2x, y = \u2212 cos (x + \u03c0\u20444). The graph of y = f(ax + b) will not be required.",
 "Trig()"),
("X)+b,\u2044Var(X)",
 "Mean and variance of a discrete random variable.: \u2022 Use of E(X), E(X\u00b2) for calculating the variance of X. Knowledge and use of E(aX + b) = aE(X) + b, Var(aX + b) = a\u00b2 Var(X).",
 ""),
("istherateof\u2044thechainrule",
 "The derivative of f(x) as the gradient of the tangent to the graph of y = f(x) at a point; the gradient of the tangent as a limit; interpretation as a rate of change; second order derivatives.: \u2022 For example, knowledge that dy\u2044dx is the rate of change of y with respect to x. Knowledge of the chain rule is not required. The notation f \u2032(x) and f \u2032\u2032(x) may be used.",
 ""),
("\u03c0orthe\u20444",
 "Combinations of the transformations y = f(x) as represented by y = af(x), y = f(x) + a, y = f(x + a), y = f(ax). Trigonometry: \u2022 Students should be able to sketch the graph of, for example, y = 2f(3x), y = f(\u2212x) + 1, given the graph of y = f(x) or the graph of, for example, y = 3 + sin 2x, y = \u2212 cos (x + \u03c0\u20444). The graph of y = f(ax + b) will not be required.",
 "Trig()"),
]

def main():
    by_text = {}
    for g in ADJ["R1_interleaved_runs"]["groups"]:
        if g["verdict"].startswith("interleaved"):
            by_text.setdefault(g["full"], []).append(g)
    texts = sorted(by_text)
    assert len(texts) == 31, len(texts)
    pairs = []
    fails = []
    used = set()
    for t in texts:
        hit = None
        for anchor, intended, rest in TABLE:
            if anchor in t and anchor not in used:
                hit = (anchor, intended, rest)
                break
        if hit is None:
            print(f"[FAIL] no anchor matched: {t[:60]!r}")
            fails.append(t[:40])
            continue
        used.add(hit[0])
        anchor, intended, rest = hit
        if rest.startswith("REFUSE:"):
            print(f"[REFUSED] {anchor[:40]!r} sites={len(by_text[t])} — {rest[8:]}")
            pairs.append({"anchor": anchor, "corrupted": t, "intended": None,
                          "restorations": rest, "sites": by_text[t], "refused": True})
            continue
        mc, mi = mset(t), mset(intended)
        missing = mc - mi
        extra = mi - mc
        rest_ms = mset(rest) if rest else Counter()
        ok = (not missing) and (extra == rest_ms)
        frac_ok = intended.count("\u2044") <= t.count("\u2044")
        status = "PASS" if (ok and frac_ok) else "FAIL"
        if status == "FAIL":
            fails.append(anchor)
            print(f"[FAIL] {anchor[:30]!r} missing={dict(missing)} extra={dict(extra)} "
                  f"restDeclared={dict(rest_ms)} frac {intended.count(chr(0x2044))}<={t.count(chr(0x2044))} {frac_ok}")
        else:
            print(f"[PASS] {anchor[:40]!r} sites={len(by_text[t])}")
        pairs.append({"anchor": anchor, "corrupted": t, "intended": intended,
                      "restorations": rest, "sites": by_text[t]})
    print(f"\n{len(pairs)}/31 anchored, FAILS: {len(fails)}")
    Path("/tmp/rn11/r1_pairs.json").write_text(json.dumps(pairs, ensure_ascii=False, indent=1))
    print("wrote /tmp/rn11/r1_pairs.json")

if __name__ == "__main__":
    main()
