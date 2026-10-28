#!/usr/bin/env python3
r"""run-019 B1 follow-up wave — fix manifest of record.
20 pids, 144 bare-caret conversions to law-26 KaTeX (ASCII hyphen / \times / \Rightarrow
/ \sqrt inside math; quoted-substitution "..." convention preserved inside math per
tranche-3 precedent; unicode sups outside math stay outside).
Each fix: (pid, field, old, new, expected_count, evidence, note).
field: 'problem' | 'solution'  (solution edits are mirrored to markPoints[0].textMd).
"""

FIXES = [
# ============ 2020-06 01 q13-b (QP p8 P61906A0824, true sups + stacked 2/3) ============
("offp_2020-06_01_13-b", "problem",
 "Simplify fully (125p\u2079w\u00b3)^(2/3)",
 "Simplify fully $(125p^9w^3)^{\\frac{2}{3}}$",
 1, "QP 2020-06 4MB1-01 p8 (P61906A0824) READ @150dpi", "B1 caret -> law-26"),

("offp_2020-11_01_13-b", "problem",
 "Simplify fully (125p\u2079w\u00b3)^(2/3)",
 "Simplify fully $(125p^9w^3)^{\\frac{2}{3}}$",
 1, "QP 2020-11 4MB1-01 p8 READ @150dpi (identical print)", "B1 caret -> law-26"),

# ============ 2023-11 01 q16 (MS p11; "2" quoted-substitution convention) ============
("offp_2023-11_01_16", "solution",
 "+ 10 x^2 ( 2 \u00d7 \"2\"+ 1)",
 "+ $10 x^2$ ( 2 \u00d7 \"2\"+ 1)",
 1, "MS p11 (16 x^2 + 48... row) (2x+1)(x+4)+10x^2", "B1"),

("offp_2023-11_01_16", "solution",
 "Or\n12 x^2 + 9 x + 4 or",
 "Or\n$12 x^2 + 9 x + 4$ or",
 1, "MS p11 'Or 12x^2+9x+4'", "B1"),

("offp_2023-11_01_16", "solution",
 "or 12 \u00d7 \"2\"^2 + 9 \u00d7 \"2\"+ 4",
 "or $12 \\times \"2\"^2 + 9 \\times \"2\"+ 4$",
 1, "MS p11 '12 x \"2\"^2 + 9 x \"2\" + 4'", "B1"),

# ============ 2023-11 01 q21-a (QP p17 P73494A01724 + MS p15) ============
("offp_2023-11_01_21-a", "problem",
 "Express 3x^2 + 6x \u2212 9 in the form p(x + q)^2 + r where",
 "Express $3x^2 + 6x - 9$ in the form $p(x + q)^2 + r$ where",
 1, "QP p17 (a) row READ", "B1 x2"),

("offp_2023-11_01_21-a", "solution",
 "3 ( x^2 + 2 x )\u2026\u2026 or",
 "$3 ( x^2 + 2 x )$\u2026\u2026 or",
 1, "MS p15 Working row1", "B1"),

("offp_2023-11_01_21-a", "solution",
 "3 ( x^2 + 2 x \u2026\u2026) oe",
 "$3 ( x^2 + 2 x \u2026\u2026)$ oe",
 1, "MS p15 Working row1 alt", "B1"),

("offp_2023-11_01_21-a", "solution",
 "3( x + 1)^2 \u2026\u2026 or 3 \u23a1( x + 1)\u00b2 \u2026\u2026\u23a4 oe",
 "$3( x + 1)^2$ \u2026\u2026 or 3 \u23a1( x + 1)\u00b2 \u2026\u2026\u23a4 oe",
 1, "MS p15 Working row2", "B1"),

("offp_2023-11_01_21-a", "solution",
 "3 ( x + 1)^2 \u2212 12 A1 condone",
 "$3 ( x + 1)^2 - 12$ A1 condone",
 1, "MS p15 Answer 3(x+1)^2-12", "B1"),

("offp_2023-11_01_21-a", "solution",
 "3 ( x + 1)^2 + ( \u221212 )",
 "$3 ( x + 1)^2 + ( -12 )$",
 1, "MS p15 'condone 3(x+1)^2 + (-12)'", "B1"),

# ============ 2023-11 01 q21-b (QP p17 + MS p15) ============
("offp_2023-11_01_21-b", "problem",
 "solve the equation 3x^2 + 6x \u2212 9 = 0 without",
 "solve the equation $3x^2 + 6x - 9 = 0$ without",
 1, "QP p17 (b) row READ", "B1"),

("offp_2023-11_01_21-b", "solution",
 "( x + 1)^2 = $\\frac{12}{3}$ or",
 "$( x + 1)^2 = \\frac{12}{3}$ or",
 1, "MS p15 (b) Working (merges existing $ span)", "B1"),

("offp_2023-11_01_21-b", "solution",
 "( x + 1)^2 = 4 or",
 "$( x + 1)^2 = 4$ or",
 1, "MS p15 (b) Working", "B1"),

("offp_2023-11_01_21-b", "solution",
 "px^2 + 2pqx + pq^2 + r",
 "$px^2 + 2pqx + pq^2 + r$",
 2, "MS p15 ALT(a) both rows", "B1 x2 (ALT row + obtain row)"),

("offp_2023-11_01_21-b", "solution",
 "pq^2 + r = \u2013 9 oe",
 "$pq^2 + r = - 9$ oe",
 1, "MS p15 ALT 'pq^2 + r = -9 oe'", "B1"),

("offp_2023-11_01_21-b", "solution",
 "3 ( x + 1)^2 \u2212 12",
 "$3 ( x + 1)^2 - 12$",
 1, "MS p15 ALT final row (string tail, no trailing newline)", "B1"),

# ============ 2023-11 01 q24 (MS p18/p19; USING n = 8x block) ============
("offp_2023-11_01_24", "solution",
 "by 8x \u2013 1 or 8x^2 \u2212 x",
 "by 8x \u2013 1 or $8x^2 - x$",
 1, "MS p19 USING-n=8x M1 note", "B1"),

("offp_2023-11_01_24", "solution",
 "646 x^2 \u2212 152 x = 640 x^2 \u2212 80 x or",
 "$646 x^2 - 152 x = 640 x^2 - 80 x$ or",
 1, "MS p19 USING block", "B1 x2"),

("offp_2023-11_01_24", "solution",
 "6 x^2 \u2212 72 x[= 0] oe",
 "$6 x^2 - 72 x$[= 0] oe",
 1, "MS p19 USING block", "B1"),

# ============ 2023-11 01 q26 (MS p21 cosine rule) ============
("offp_2023-11_01_26", "solution",
 "(4 x + 6 )^2 = ( 6 x + 4 )^2 + ( 3x )^2 \u2212 2 \u00d7 3x \u00d7 ( 6 x + 4 ) cos 60 oe",
 "$(4 x + 6 )^2 = ( 6 x + 4 )^2 + ( 3x )^2 - 2 \\times 3x \\times ( 6 x + 4 ) \\cos 60$ oe",
 1, "MS p21 Working row1", "B1 x3"),

("offp_2023-11_01_26", "solution",
 "16 x^2 + 48 x + 36 = 36 x^2 + 48 x + 16 + 9 x^2 \u2212 18 x^2 \u2212 12 x M1 Two out",
 "$16 x^2 + 48 x + 36 = 36 x^2 + 48 x + 16 + 9 x^2 - 18 x^2 - 12 x$ M1 Two out",
 1, "MS p21 expand row", "B1 x4"),

("offp_2023-11_01_26", "solution",
 "16 x^2 + 36 = 36 x^2 + 16 + 9 x^2 \u2212 18 x^2 \u2212 12 x Expand brackets",
 "$16 x^2 + 36 = 36 x^2 + 16 + 9 x^2 - 18 x^2 - 12 x$ Expand brackets",
 1, "MS p21 expand row alt", "B1 x4"),

("offp_2023-11_01_26", "solution",
 "22 x^2 \u2212 24 x \u2212 40[= 0] or 11x^2 \u2212 12 x \u2212 20[ = 0] oe",
 "$22 x^2 - 24 x - 40$[= 0] or $11x^2 - 12 x - 20$[ = 0] oe",
 1, "MS p21 3TQ row", "B1 x2"),

("offp_2023-11_01_26", "solution",
 "16 x^2 + 48 x + 36 = 36 x^2 + 48 x + 16 + 9 x^2 + 18 x^2 + 12 x\n",
 "$16 x^2 + 48 x + 36 = 36 x^2 + 48 x + 16 + 9 x^2 + 18 x^2 + 12 x$\n",
 1, "MS p21 eg two-signs-incorrect note", "B1 x4"),

# ============ 2023-11 01 q28-b (MS p23 factor theorem) ============
("offp_2023-11_01_28-b", "solution",
 "( 3x \u2212 4 ) ( 4 x^2 ...)",
 "( 3x \u2212 4 ) $( 4 x^2 ...)$",
 1, "MS p23 (b) Working", "B1"),

("offp_2023-11_01_28-b", "solution",
 "is a factor and getting 4x^2\n",
 "is a factor and getting $4x^2$\n",
 1, "MS p23 M1 note", "B1"),

("offp_2023-11_01_28-b", "solution",
 "Allow ( 2 x \u2212 1) and 6x^2 or ( 2 x + 3) and 6x^2",
 "Allow ( 2 x \u2212 1) and $6x^2$ or ( 2 x + 3) and $6x^2$",
 1, "MS p23 M1 note Allow row", "B1 x2"),

("offp_2023-11_01_28-b", "solution",
 "Division by ( 3 x \u2212 4 ) giving a first term of\n4x^2\neg",
 "Division by ( 3 x \u2212 4 ) giving a first term of\n$4x^2$\neg",
 1, "MS p23 'first term of 4x^2'", "B1"),

("offp_2023-11_01_28-b", "solution",
 "and 12x^2 etc",
 "and $12x^2$ etc",
 1, "MS p23 Allow (x-1/2) and 12x^2", "B1"),

("offp_2023-11_01_28-b", "solution",
 "Quotient ( 4 x^2 + 4 x \u2212 3) M1 a correct quadratic ( 6 x^2 \u2212 11x + 4 ) or",
 "Quotient $( 4 x^2 + 4 x - 3)$ M1 a correct quadratic $( 6 x^2 - 11x + 4 )$ or",
 1, "MS p23 Quotient row", "B1 x2"),

("offp_2023-11_01_28-b", "solution",
 "( 6 x^2 + x \u2212 12) or ( 4 x^2 + 4 x \u2212 3) or",
 "$( 6 x^2 + x - 12)$ or $( 4 x^2 + 4 x - 3)$ or",
 1, "MS p23 M1 note alternatives", "B1 x2"),

("offp_2023-11_01_28-b", "solution",
 "(12 x^2 + 2 x \u2212 24 ) etc",
 "$(12 x^2 + 2 x - 24 )$ etc",
 1, "MS p23 M1 note (12x^2+2x-24)", "B1"),

# ============ 2025-06 01R q19-a/b (QP p16 P79517A01628) ============
("offp_2025-06_01r_19-a", "problem",
 "c = 4 \u00d7 10^(\u22128n) where n is an integer.",
 "$c = 4 \\times 10^{-8n}$ where n is an integer.",
 1, "QP p16 'c = 4 x 10^{-8n} where n is an integer'", "B1"),

("offp_2025-06_01r_19-b", "problem",
 "Find an expression for c^(\u22121/2) in terms of n",
 "Find an expression for $c^{-\\frac{1}{2}}$ in terms of n",
 1, "QP p16 (b) stacked-fraction exponent", "B1"),

# ============ 2026-06 01R q17-a (MS p19) ============
("offp_2026-06_01r_17-a", "solution",
 "Examples for B1: 8x^6y^9 2 B2",
 "Examples for B1: $8x^6y^9$ 2 B2",
 1, "MS p19 (a) Answer", "B1 x2"),

("offp_2026-06_01r_17-a", "solution",
 "eg x^6 8y^9\n",
 "eg $x^6 8y^9$\n",
 1, "MS p19 B2 note", "B1 x2"),

("offp_2026-06_01r_17-a", "solution",
 "2^3 x^6 y^9 8 must not be 2^3",
 "$2^3 x^6 y^9$ 8 must not be $2^3$",
 1, "MS p19 Working row2", "B1 x4"),

("offp_2026-06_01r_17-a", "solution",
 "x^5 \u00d7 2^3 \u00d7 y^9 (B1",
 "$x^5 \\times 2^3 \\times y^9$ (B1",
 1, "MS p19 Working row3", "B1 x3"),

("offp_2026-06_01r_17-a", "solution",
 "x^6 \u00d7 y^9 \u00d7 2^3 bx^n y^m b, m, n \u2260 0 . Allow 8 to be 2^3",
 "$x^6 \\times y^9 \\times 2^3$ $bx^n y^m$ b, m, n \u2260 0 . Allow 8 to be $2^3$",
 1, "MS p19 Working row4 + B1 note", "B1 x6"),

("offp_2026-06_01r_17-a", "solution",
 "4.5x^6y^9 Condone",
 "$4.5x^6y^9$ Condone",
 1, "MS p19 Working row5", "B1 x2"),

("offp_2026-06_01r_17-a", "solution",
 "only eg x^6 \u00d7 y^9 2^3\n",
 "only eg $x^6 \\times y^9 2^3$\n",
 1, "MS p19 B1-only note", "B1 x3"),

# ============ 2026-06 01R q17-b (MS p19) ============
("offp_2026-06_01r_17-b", "solution",
 "Examples for B1: 9p^8q^4 2 B2",
 "Examples for B1: $9p^8q^4$ 2 B2",
 1, "MS p19 (b) Answer", "B1 x2"),

("offp_2026-06_01r_17-b", "solution",
 "eg p^8q^4 9\n",
 "eg $p^8q^4$ 9\n",
 1, "MS p19 B2 note (b)", "B1 x2"),

("offp_2026-06_01r_17-b", "solution",
 "3^2 p^8 q^4 Condone a = 9, m = 8, n = 4",
 "$3^2 p^8 q^4$ Condone a = 9, m = 8, n = 4",
 1, "MS p19 Working row2 (b)", "B1 x3"),

("offp_2026-06_01r_17-b", "solution",
 "p^8 \u00d7 3^2 \u00d7 q^\u22122 9 must not be 3^2",
 "$p^8 \\times 3^2 \\times q^{-2}$ 9 must not be $3^2$",
 1, "MS p19 Working row3 (b)", "B1 x4"),

("offp_2026-06_01r_17-b", "solution",
 "p^6 \u00d7 q^4 \u00d7 3^2 B1 any 2 terms",
 "$p^6 \\times q^4 \\times 3^2$ B1 any 2 terms",
 1, "MS p19 Working row4 (b)", "B1 x3"),

("offp_2026-06_01r_17-b", "solution",
 "p^8q^4 \u00d7 6 ap^n q^m a, n, m \u2260 0 . Allow 9 to be 3^2",
 "$p^8q^4 \\times 6$ $ap^n q^m$ a, n, m \u2260 0 . Allow 9 to be $3^2$",
 1, "MS p19 Working row5 + B1 note (b)", "B1 x6"),

("offp_2026-06_01r_17-b", "solution",
 "only eg p^6 \u00d7 q^4 3^2\n",
 "only eg $p^6 \\times q^4 3^2$\n",
 1, "MS p19 B1-only note (b)", "B1 x3"),

# ============ 2026-06 01R q20-a (MS p24) ============
("offp_2026-06_01r_20-a", "solution",
 "(\u22122)^3 + 7 \u00d7 ([ \u2212] 2 )^2 + 17 \u00d7 \u22122 + 14",
 "$(-2)^3 + 7 \\times ([ -] 2 )^2 + 17 \\times -2 + 14$",
 1, "MS p24 (a) eg row", "B1 x2"),

("offp_2026-06_01r_20-a", "solution",
 "\u22122^3 + 7 \u00d7 \u22122^2 + 17 \u00d7 \u22122 + 14 = 0\nor",
 "$-2^3 + 7 \\times -2^2 + 17 \\times -2 + 14 = 0$\nor",
 1, "MS p24 Condone row1", "B1 x2"),

("offp_2026-06_01r_20-a", "solution",
 "\u22122^3 + 7 \u00d7 ( \u22122 )^2 + 17 \u00d7 \u22122 + 14 = 0\nMust see",
 "$-2^3 + 7 \\times ( -2 )^2 + 17 \\times -2 + 14 = 0$\nMust see",
 1, "MS p24 Condone row2", "B1 x2"),

# ============ 2026-06 01R q23 (MS p29) ============
("offp_2026-06_01r_23", "solution",
 "3x^2 or \u221215 5 M1",
 "$3x^2$ or \u221215 5 M1",
 1, "MS p29 Working row1", "B1"),

("offp_2026-06_01r_23", "solution",
 "\"3x^2 \u2212 15\" = 0 or",
 "$\"3x^2 - 15\"$ = 0 or",
 1, "MS p29 Working row2 (quoted convention inside math)", "B1"),

("offp_2026-06_01r_23", "solution",
 "3x^2 + b or ax^2 \u2212 15 a, b \u2260 0",
 "$3x^2 + b$ or $ax^2 - 15$ a, b \u2260 0",
 1, "MS p29 M1 note derivative forms", "B1 x2"),

("offp_2026-06_01r_23", "solution",
 "( \"\u00b1\u221a5\" )^3 \u2212 15 \u00d7 ( \"\u00b1\u221a5\" ) + 5",
 "$( \"\u00b1\\sqrt{5}\" )^3 - 15 \\times ( \"\u00b1\\sqrt{5}\" ) + 5$",
 1, "MS p29 M1 row (quoted sqrt-substitution inside math)", "B1"),

# ============ 2026-06 01R q27-c (MS p37) ============
("offp_2026-06_01r_27-c", "solution",
 "( x + 1)^2 + c [ = 0] c \u2260 0, \u221280 oe",
 "$( x + 1)^2 + c$ [ = 0] c \u2260 0, \u221280 oe",
 1, "MS p37 'If completing the square need to see (x+1)^2 + c[= 0]'", "B1"),

# ============ 2025-11 02 q5 (QP p12 P79558A01240 + MS p9) ============
("offp_2025-11_02_5", "problem",
 "4x^2 \u2212 y^2 = 27",
 "$4x^2 - y^2 = 27$",
 1, "QP p12 displayed equation pair", "B1 x2"),

("offp_2025-11_02_5", "solution",
 "x = 3 \u2212 2 y \u21d2 4 ( 3 \u2212 2 y )^2 \u2212 y^2 = 27 6 M1",
 "$x = 3 - 2 y \\Rightarrow 4 ( 3 - 2 y )^2 - y^2 = 27$ 6 M1",
 1, "MS p9 Working row1", "B1 x2"),

("offp_2025-11_02_5", "solution",
 "4x^2 \u2212 y^2 = 9 to form",
 "$4x^2 - y^2 = 9$ to form",
 1, "MS p9 M1 note 'quadratic equation 4x^2 - y^2 = 9' @300dpi zoom note8", "B1 x2 (print verbatim)"),

("offp_2025-11_02_5", "solution",
 "or y = $\\frac{3-x}{2}$ \u21d2 4x^2 \u2212 $\\left(\\frac{3-x}{2}\\right)^2$ = 27",
 "or $y = \\frac{3-x}{2} \\Rightarrow 4x^2 - \\left(\\frac{3-x}{2}\\right)^2$ = 27",
 1, "MS p9 Working row1 alt (merges 3 spans)", "B1 x1"),

("offp_2025-11_02_5", "solution",
 "4 ( 9 \u2212 12 y + 4 y^2 ) \u2212 y^2 = 27 M1",
 "$4 ( 9 - 12 y + 4 y^2 ) - y^2 = 27$ M1",
 1, "MS p9 Working row2", "B1 x2"),

("offp_2025-11_02_5", "solution",
 "or 4x^2 \u2212 $\\left(\\frac{9}{4} - \\frac{3x}{2} + \\frac{x^2}{4}\\right)$ = 27",
 "or $4x^2 - \\left(\\frac{9}{4} - \\frac{3x}{2} + \\frac{x^2}{4}\\right)$ = 27",
 1, "MS p9 Working row2 alt (merges 2 spans)", "B1 x1"),

("offp_2025-11_02_5", "solution",
 "15 y^2 \u2212 48 y + 9 [ = 0] M1",
 "$15 y^2 - 48 y + 9$ [ = 0] M1",
 1, "MS p9 Working row3", "B1"),

("offp_2025-11_02_5", "solution",
 "any form of ax^2 + bx + c (= 0) with",
 "any form of $ax^2 + bx + c$ (= 0) with",
 1, "MS p9 M1 note", "B1"),

("offp_2025-11_02_5", "solution",
 "$\\frac{15x^2}{4}$ + $\\frac{3x}{2}$ \u2212 $\\frac{117}{4}$ [ = 0] (oe e.g. 5 y^2 \u2212 16 y + 3[ = 0] , 15 x^2 + 6 x \u2212 117 [ = 0] , 5 x^2 + 2 x \u2212 39 [ = 0] etc",
 "$\\frac{15x^2}{4} + \\frac{3x}{2} - \\frac{117}{4}$ [ = 0] (oe e.g. $5 y^2 - 16 y + 3$[ = 0] , $15 x^2 + 6 x - 117$ [ = 0] , $5 x^2 + 2 x - 39$ [ = 0] etc",
 1, "MS p9 Working row4 (merges 3 spans, wraps 3 e.g. forms)", "B1 x5"),

("offp_2025-11_02_5", "solution",
 "e.g. 4x^2 \u2212 \"0.2\"^2 = 27 leading",
 "e.g. $4x^2 - \"0.2\"^2 = 27$ leading",
 1, "MS p9 M1 note (quoted convention inside math)", "B1 x2"),

("offp_2025-11_02_5", "solution",
 "4x^2 \u2212 \"3\"^2 = 27 leading to x = \u2026 or 4 (\"2.6\")^2 \u2212 y^2 = \u221227 leading",
 "$4x^2 - \"3\"^2 = 27$ leading to x = \u2026 or $4 (\"2.6\")^2 - y^2 = -27$ leading",
 1, "MS p9 M1 note", "B1 x4"),

("offp_2025-11_02_5", "solution",
 "4 (\"\u2212 3\")^2 \u2212 y^2 = \u221227 leading",
 "$4 (\"- 3\")^2 - y^2 = -27$ leading",
 1, "MS p9 M1 note", "B1 x2"),

# ============ 2025-11 02 q9-a (QP p26 P79558A02640) ============
("offp_2025-11_02_9-a", "problem",
 "Complete the table of values for y = 2x^3 \u2212 9x^2 + 3x + 7\n",
 "Complete the table of values for $y = 2x^3 - 9x^2 + 3x + 7$\n",
 1, "QP p26 (a) row READ", "B1 x2"),

# ============ 2025-11 02 q9-e (MS p15) ============
("offp_2025-11_02_9-e", "solution",
 "4x^3 \u2212 18x^2 + 38 < 0 or\n2x^3 \u2212 9x^2 + 19 < 0 4 M1",
 "$4x^3 - 18x^2 + 38 < 0$ or\n$2x^3 - 9x^2 + 19 < 0$ 4 M1",
 1, "MS p15 (e) Working rows 1-2", "B1 x4"),

("offp_2025-11_02_9-e", "solution",
 "2x^3 \u2212 9x^2 + 3x + 7 < 3x \u2212 12 M1",
 "$2x^3 - 9x^2 + 3x + 7 < 3x - 12$ M1",
 1, "MS p15 (e) Working row3", "B1 x2"),

# ============ 2025-11 02 q12 (MS p21) ============
("offp_2025-11_02_12", "solution",
 "5n^2 \u2013 187n + 1638 (= 0) oe A1",
 "$5n^2 - 187n + 1638$ (= 0) oe A1",
 1, "MS p21 Working row3", "B1"),

("offp_2025-11_02_12", "solution",
 "eg 45n^2 \u2013 1683n + 14742 (= 0)",
 "eg $45n^2 - 1683n + 14742$ (= 0)",
 1, "MS p21 A1 note eg", "B1"),

("offp_2025-11_02_12", "solution",
 "Allow 45n^4 \u2212 1728n^3 + 16425n^2 \u2212 14742n(= 0) oe",
 "Allow $45n^4 - 1728n^3 + 16425n^2 - 14742n$ (= 0) oe",
 1, "MS p21 A1 note Allow row", "B1 x3"),

("offp_2025-11_02_12", "solution",
 "5x^2 \u2013 97x + 360 (= 0) oe A1",
 "$5x^2 - 97x + 360$ (= 0) oe A1",
 1, "MS p21 ALT block", "B1"),

("offp_2025-11_02_12", "solution",
 "e.g. 45x^2 \u2013 873x + 3240 (= 0) oe",
 "e.g. $45x^2 - 873x + 3240$ (= 0) oe",
 1, "MS p21 ALT A1 note", "B1"),

("offp_2025-11_02_12", "solution",
 "Allow 45x^4 \u2212 108x^3 \u2212 8361x^2 \u2212 7776x + 233280( = 0) oe",
 "Allow $45x^4 - 108x^3 - 8361x^2 - 7776x + 233280$ ( = 0) oe",
 1, "MS p21 ALT A1 note Allow row", "B1 x3"),

# ============ 2023-01 02R q10-b (MS p17 + 300dpi zooms; 1->4 digit fix DISCLOSED) ============
("offp_2023-01_02r_10-b", "solution",
 "\u221a81/81^(4/3) = 81^(\u22125/6) oe",
 "$\\sqrt{81}/81^{\\frac{4}{3}} = 81^{-\\frac{5}{6}}$ oe",
 1, "MS p17 (b) Working row3 @150dpi", "B1 x2"),

("offp_2023-01_02r_10-b", "solution",
 "(\u221b81)\u2074 = 3^(16/3) M1",
 "(\u221b81)\u2074 = $3^{\\frac{16}{3}}$ M1",
 1, "MS p17 (b) Working row4", "B1"),

("offp_2023-01_02r_10-b", "solution",
 "M1 dealing with 81^(1/3) allow for 81^a = 3^(4a) where a \u2260 1",
 "M1 dealing with $81^{\\frac{4}{3}}$ allow for $81^a = 3^{4a}$ where a \u2260 1",
 1, "MS p17 M1 note @300dpi zoom note2: print is 81^(4/3); plane 1/3 = transcription digit error, corrected WITH DISCLOSURE", "B1 x3 (incl. disclosed 1->4 digit fix)"),

("offp_2023-01_02r_10-b", "solution",
 "A1 condone 3^(\u221210/3) dep on M2",
 "A1 condone $3^{-\\frac{10}{3}}$ dep on M2",
 1, "MS p17 A1 note @300dpi zoom note2", "B1"),
]
