#!/usr/bin/env python3
r"""run-026 tranche-2 wave-3 FIXES (eyes-on-adjudicated, NO-GUESS).

Residual 103 units (ledger-verified) of the deduped worklist; run-025 wave-2 took 41
(receipt claimed 41/142; ledger FIXES∪ZERO_FIX covers 39 units — the +2 delta is
receipt-side sub-adjudication counting, disclosed in the run-026 receipt).

Every fix verified against the MS/QP page of record rendered @150dpi and READ
first-hand this run. Evidence PNGs: /home/z/my-project/scratch/oeq_run026/pages/.

Tuple: (pid, field, old, new, exp, evidence, note)
  field: 'solutionMirror' (solutionMd + lockstep mp0, byte-equality pre-checked)
       | 'solution' | 'mirror' (markPoints[0].textMd) | 'problem'
  exp  : expected occurrence count (fail-closed; exp!=1 replaces ALL)
ORDER MATTERS for sequence-dependent tuples (battery applies in list order).

Fences honored (run-024/025 law): radical-flatten LEAVE; deleted-sup (glyph absent
from plane) LEAVE + disclose; displaced-sup aggregates LEAVE + disclose; minus-sign
loss = content-loss class LEAVE + disclose; fraction weaves (FS, run-004 R4-A) LEAVE;
print-literal mark-code runs LEAVE; furniture (prose adjacency, diagram labels,
answer-blank bleed, trig angles) ZERO-FIX with page evidence.
"""

FIXES = [
    # ================= paper official-4mb1-01r-2022-06 =================
    # ---- q25-a (offp_2022-06_01r_25-a) — sol/mp0 DIVERGED (1908/1912) — MS p19 + QP p20 ----
    # print rows 1-3 cosine rule: (7x)^2 = 15^2 + y^2 - 2(15)(y)cos120 (row3 print-verbatim y^1);
    # plane in-place flattened sups fixed independently per field; fences: displaced '\n2' after
    # row1 cos120 (= the (7x)^2 exponent, displaced aggregate LEAVE), eg-row '2 2' displaced +
    # deleted 7x^2/15^2/y^2 sups LEAVE, '( 9) 2' minus-loss content LEAVE, sol '(y/3)^2' outer
    # sup deleted (mirror carries the .kern glyphs) LEAVE, formula-row fraction weave FS LEAVE.
    ('offp_2022-06_01r_25-a', 'solution',
     '( 7 x ) = 152 + y 2 − 2 (15)( y ) cos120',
     '( 7 x ) = $15^2$ + $y^2$ − 2 (15)( y ) cos120', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', '15^2 + y^2 flattened sups (p19 row1); (7x)^2 exponent displaced to lone \\n2 — aggregate fence LEAVE',
    ),
    ('offp_2022-06_01r_25-a', 'solution',
     '( 7 x ) = 152 + y 2 + 2 (15)( y ) cos120',
     '( 7 x ) = $15^2$ + $y^2$ + 2 (15)( y ) cos120', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', '15^2 + y^2 flattened sups (p19 eg-row2)',
    ),
    ('offp_2022-06_01r_25-a', 'solution',
     '( 7 x ) = 152 + y − 2 (15)( y ) cos120',
     '( 7 x ) = $15^2$ + y − 2 (15)( y ) cos120', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', '15^2 flattened; y^1 print-verbatim row3 (p19)',
    ),
    ('offp_2022-06_01r_25-a', 'solution',
     '49 x 2 = 225 + 9 x 2 + 45 x',
     '$49x^2$ = 225 + $9x^2$ + 45 x', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', '49x^2 + 9x^2 flattened sups (p19 M1dep row)',
    ),
    ('offp_2022-06_01r_25-a', 'solution',
     '49 = 225 + y 2 + 15 y',
     '49 = 225 + $y^2$ + 15 y', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'y^2 flattened (p19 49(y/3)^2 row); outer (y/3)^2 sup glyph ABSENT in sol — deleted-sup fence LEAVE',
    ),
    ('offp_2022-06_01r_25-a', 'solution',
     '40 x 2 − 45 x − 225 = 0',
     '$40x^2$ − 45 x − 225 = 0', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', '40x^2 flattened (p19 A1 row)',
    ),
    ('offp_2022-06_01r_25-a', 'solution',
     '8 y 2 − 27 y − 405 = 0',
     '$8y^2$ − 27 y − 405 = 0', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', '8y^2 flattened (p19 A1 eg)',
    ),
    ('offp_2022-06_01r_25-a', 'solution',
     'allow 92 for',
     'allow $9^2$ for', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', '9^2 flattened (p19 formula note); the (−9)^2 it refers to is minus-loss "( 9) 2" — content-loss fence LEAVE',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     '( 7 x ) = 152 + y 2 − 2 (15)( y ) cos120',
     '( 7 x ) = $15^2$ + $y^2$ − 2 (15)( y ) cos120', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror independent (diverged field, +4ch offset)',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     '( 7 x ) = 152 + y 2 + 2 (15)( y ) cos120',
     '( 7 x ) = $15^2$ + $y^2$ + 2 (15)( y ) cos120', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     '( 7 x ) = 152 + y − 2 (15)( y ) cos120',
     '( 7 x ) = $15^2$ + y − 2 (15)( y ) cos120', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     '49 x 2 = 225 + 9 x 2 + 45 x',
     '$49x^2$ = 225 + $9x^2$ + 45 x', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     '49 ⎜ ⎟ = 225 + y 2 + 15 y',
     '49 ⎜ ⎟ = 225 + $y^2$ + 15 y', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror variant with ⎜⎟ mid glyphs',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     '40 x 2 − 45 x − 225 = 0',
     '$40x^2$ − 45 x − 225 = 0', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     '8 y 2 − 27 y − 405 = 0',
     '$8y^2$ − 27 y − 405 = 0', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2022-06_01r_25-a', 'mirror',
     'allow 92 for',
     'allow $9^2$ for', 1,
     'ms-2022-06-4mb1-01r-p19-19.png (150dpi, READ)', 'mirror independent',
    ),
    # ---- q25-b (offp_2022-06_01r_25-b) — mp0==sol lockstep (363) — MS p20 ----
    ('offp_2022-06_01r_25-b', 'solutionMirror',
     'or 32 but not just 3',
     'or $3^2$ but not just 3', 1,
     'ms-2022-06-4mb1-01r-p20-20.png (150dpi, READ)', '3^2 flattened (p20 M1 row "or 3^2 but not just 3"); AE/ED fraction weaves FS LEAVE',
    ),
    ('offp_2022-06_01r_25-b', 'solutionMirror',
     'A mark for 32',
     'A mark for $3^2$', 1,
     'ms-2022-06-4mb1-01r-p20-20.png (150dpi, READ)', '3^2 flattened (p20 A1 note "do not award this A mark for 3^2")',
    ),
    # ---- q19 (offp_2022-06_01r_19) — sol/mp0 DIVERGED (490/501) — MS p13 + QP p13 ----
    ('offp_2022-06_01r_19', 'solution',
     'Pythagoras eg AD/ CD 62 )',
     'Pythagoras eg AD/ CD $6^2$ )', 1,
     'ms-2022-06-4mb1-01r-p13-13.png (150dpi, READ)', '6^2 flattened (p13 Pythagoras note sqrt((6/sin24)^2 − 6^2)); 13.4762… decimal "62" protected by anchor; (6/sin24)^2 outer sup fraction-mangled FS LEAVE',
    ),
    ('offp_2022-06_01r_19', 'mirror',
     'Pythagoras eg AD/ CD 62 )',
     'Pythagoras eg AD/ CD $6^2$ )', 1,
     'ms-2022-06-4mb1-01r-p13-13.png (150dpi, READ)', 'mirror independent (diverged field)',
    ),
]

ZERO_FIX = {
    # ---- paper official-4mb1-01r-2022-06 ----
    'offp_2022-06_01r_25-a-problem': ('diagram labels + prose (QP p20 print: 5 cm/x cm/15 cm/120°/y cm/7x cm, '
                                      '"AE = 5 cm EC = y cm DE = 15 cm EB = x cm DC = 7x cm ∠DEC = 120°") — qp-2022-06-4mb1-01r-p20-20.png'),
    'offp_2022-06_01r_25-a-lead': ('solution trig sin120/sin CDE/sin DCE keywords sct; sine-rule ALT fraction weaves FS '
                                   '(p20 ALT rows); displaced-sup aggregates LEAVE — disclosed in tuple notes'),
    'offp_2022-06_01r_25-b-lead': ('solution "AE 1 ED 5"/"2 5 x sin120"/"x 3 / 3y 27 / ( n 9)" = area-ratio fraction '
                                   'weaves FS (p20 print: AE/ED=1/3, ½×5x×sin120°, x/3y=3/27=1/9) — qp verified'),
    'offp_2022-06_01r_19-problem': ('diagram labels (6 m/B 24°) + prose ("radius 6 m", "to 3 significant figures") — '
                                    'qp-2022-06-4mb1-01r-p13-13.png'),
    'offp_2022-06_01r_19-lead': ('solution tan24/sin66/sin24 trig keywords; "2 + (12π )"/"⎛ 132 ⎞" arc fraction weaves FS '
                                 '(p13 print: 2(6/tan24) + 11/30(12π), (132/360)×2π(6))'),
    'offp_2022-06_01r_16': ('all cands print-verbatim (ms p10): "or 90°" prose; "M0 M0" mark-code run ("SC B1 if M0 M0 '
                            'scored"); "SAS 3" = answer-cell SAS + marks-column 3 adjacency — ms-2022-06-4mb1-01r-p10-10.png'),
    'offp_2022-06_01r_3': ('prose arithmetic furniture (ms p5): "eg 90 − (180 − 133)" / "or for 90 − 47" print-verbatim '
                           'M1 note — ms-2022-06-4mb1-01r-p05-5.png'),
}

FIXES += [
    # ================= paper official-4mb1-02r-2023-06 =================
    # ---- q11-a (offp_2023-06_02r_11-a) — sol/mp0 DIVERGED (1071/1071) — MS p24 + QP p34 ----
    # print: (3√5)² = x² + (4√3)² − 2×4√3×cos15 / (6.71² = x² + 6.93² − 2×6.93×0.966) /
    # x²−(6√2+2√6)x+3=0 / √45 = x²+48−8√3x×(√6+√2)/4. Radical fences (3 5 2 / 4 3 2 / 8 3 x /
    # 6 2 + 2 6 = √ shapes) LEAVE; FS fraction weaves LEAVE. Divergence: sol carries real ² in
    # (13.156)² and A1 x² row; mirror carries flattened (13.156)2 and glued x2 — independent fixes.
    ('offp_2023-06_02r_11-a', 'solution',
     '5 2 = x 2 + 4 3 2 – 2 x × 4 3 × cos15 oe or 3',
     '5 2 = $x^2$ + 4 3 2 – 2 x × 4 3 × cos15 oe or 3', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'x^2 flattened (p24 11(a) M1 row1); (3√5)²/(4√3)² radical fences LEAVE',
    ),
    ('offp_2023-06_02r_11-a', 'solution',
     '( 6.712 = x 2 + 6.932 − 2 × 6.93 × 0.966 )',
     '( $6.71^2$ = $x^2$ + $6.93^2$ − 2 × 6.93 × 0.966 )', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', '6.71^2/x^2/6.93^2 flattened sups (p24 decimal substitution row)',
    ),
    ('offp_2023-06_02r_11-a', 'solution',
     'show that x 2 – 6 2 + 2 6 x + 3 = 0',
     'show that $x^2$ – 6 2 + 2 6 x + 3 = 0', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'x^2 flattened (p24 show-that row x²−(6√2+2√6)x+3=0); 6 2 + 2 6 = 6√2+2√6 radical fence LEAVE',
    ),
    ('offp_2023-06_02r_11-a', 'solution',
     '45 = x 2 + 48 − 8 3 x × oe',
     '45 = $x^2$ + 48 − 8 3 x × oe', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'x^2 flattened (p24 M1 expansion row √45 = x²+48−8√3x×…); 8 3 x = 8√3x fence LEAVE',
    ),
    ('offp_2023-06_02r_11-a', 'solution',
     '6 + 2 x 2 + 48 − 45 oe',
     '6 + 2 $x^2$ + 48 − 45 oe', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'x^2 flattened (p24 or-row (√6+√2)/4 = (x²+48−√45)/(8√3x)); 6+√2 fence LEAVE',
    ),
    ('offp_2023-06_02r_11-a', 'solution',
     'Allow 6 + 2 x 2 + 3 provided',
     'Allow 6 + 2 $x^2$ + 3 provided', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'x^2 flattened (p24 Allow row); sol A1 row already carries real x² — no fix needed there',
    ),
    ('offp_2023-06_02r_11-a', 'mirror',
     '5 2 = x 2 + 4 3 2 – 2 x × 4 3 × cos15 oe or 3',
     '5 2 = $x^2$ + 4 3 2 – 2 x × 4 3 × cos15 oe or 3', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'mirror independent (diverged field)',
    ),
    ('offp_2023-06_02r_11-a', 'mirror',
     '( 6.712 = x 2 + 6.932 − 2 × 6.93 × 0.966 )',
     '( $6.71^2$ = $x^2$ + $6.93^2$ − 2 × 6.93 × 0.966 )', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-06_02r_11-a', 'mirror',
     'show that x 2 – 6 2 + 2 6 x + 3 = 0',
     'show that $x^2$ – 6 2 + 2 6 x + 3 = 0', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-06_02r_11-a', 'mirror',
     '45 = x 2 + 48 − 8 3 x × oe',
     '45 = $x^2$ + 48 − 8 3 x × oe', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-06_02r_11-a', 'mirror',
     '6 + 2 x 2 + 48 − 45 oe',
     '6 + 2 $x^2$ + 48 − 45 oe', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-06_02r_11-a', 'mirror',
     'Allow 6 + 2 x 2 + 3 provided',
     'Allow 6 + 2 $x^2$ + 3 provided', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-06_02r_11-a', 'mirror',
     '(13.156)2 – ( 6 2 + 2 6 )',
     '(13.156)$^2$ – ( 6 2 + 2 6 )', 1,
     'ms-2023-06-4mb1-02r-p24-24.png (150dpi, READ)', 'mirror-only: (13.156)^2 flattened in mirror (sol carries real ² glyph) — the documented divergence',
    ),
    # ---- q11-d (offp_2023-06_02r_11-d) — problem formula box — QP p34 ----
    ('offp_2023-06_02r_11-d', 'problem',
     'Cosine rule: a 2 b 2 c 2 2bc cos A',
     'Cosine rule: $a^2$ = $b^2$ + $c^2$ − 2bc cos A', 1,
     'qp-2023-06-4mb1-02r-p34-34.png (150dpi, READ)', 'formula box OPERATOR-RESTORATION variant (print p34: a² = b² + c² − 2bc cos A): plane lost = + − operators AND flattened sups; operators re-inserted print-verified (Tier-B, disclosed class extension); radical fences a + b 2 + c 3 + d (b√2/c√3/√d) LEAVE',
    ),
    # ---- q7-c (offp_2023-06_02r_7-c) — mp0==sol lockstep (2364) — MS p15/p16 ----
    ('offp_2023-06_02r_7-c', 'solutionMirror',
     'tan −1 BAG = [⇒ BAG = 27.8(9...)]',
     'tan^-1 BAG = [⇒ BAG = 27.8(9...)]', 1,
     'ms-2023-06-4mb1-02r-p16-16.png (150dpi, READ)', 'tan^-1 flattened inverse (p16 ALT2 M1 row: tan⁻¹ BAG = 4.5/8.5) — CATCH-ALL inverse-trig class; 4.5/8.5 fraction weave FS LEAVE',
    ),
    ('offp_2023-06_02r_7-c', 'solutionMirror',
     'tan −1 − 2 × tan − tan',
     'tan^-1 − 2 × tan − tan', 1,
     'ms-2023-06-4mb1-02r-p16-16.png (150dpi, READ)', 'first tan^-1 fixed (p16 M1dep DAH row); the 2nd/3rd tan lost their ⁻¹ entirely — deleted-sup fence LEAVE',
    ),
]

ZERO_FIX.update({
    # ---- paper official-4mb1-02r-2023-06 ----
    'offp_2023-06_02r_11-a-problem': ('diagram/trig/FS furniture: "4 3 cm"/"3 5 cm" radical-flatten (4√3/3√5, QP p34 print), '
                                      '"cos 15°" trig, cos15 = (√6+√2)/4 fraction weave — qp-2023-06-4mb1-02r-p34-34.png'),
    'offp_2023-06_02r_11-a-lead': ('solution sine-rule sin C/sin15/sin149 trig keywords; 149.495…/13.1(56..) decimals; '
                                   '(4 3) 2/(3 5) 2 radical-fenced sups LEAVE; cos15 fraction weaves FS (p24 print)'),
    'offp_2023-06_02r_11-d-lead': ('solution "3 + 2 3" = 3 + 2√3 radical-flatten fence (p24 11(c) print (3 + 2√3)²); '
                                   '"x – 3 2 + 6" sqrt-loss class; "( ± )" furniture — all LEAVE'),
    'offp_2023-06_02r_7-c': ('SCB2 mark-code + "Question 7b and 7c" prose + ALT 1/ALT 2 headers print-verbatim (p15/p16); '
                             'displaced "2" after "ALT 1 Ratio" + deleted sups in "( x − 6) + ( y − 4) = 2.5" row = '
                             'displaced/deleted-sup fences LEAVE; "( x + 3)² + ( y − 1)² = 92.5" real ² print-verbatim'),
    'offp_2023-06_02r_5-b-problem': ('"to 3 significant figures" prose (ctx-verified class, run-024/025 precedent)'),
    'offp_2023-06_02r_5-b-lead': ('"DE 2" = DE + marks-column 2 adjacency (p11 5(b) M1 row mark col = 2); '
                                  'sin"18.2" trig-quoted angles print-verbatim — ms-2023-06-4mb1-02r-p11-11.png'),
    'offp_2023-06_02r_5-a-ii': ('sin 90 trig keywords ×2 + "must do 90 – ∠ABD" prose; 2.5/8 sinA fraction weaves FS — '
                                'ms-2023-06-4mb1-02r-p11-11.png (p11 5(a)(ii) print-verbatim)'),
})

FIXES += [
    # ================= paper official-4mb1-01-2023-06 =================
    # ---- q28 (offp_2023-06_01_28) — mp0==sol lockstep (3745) — MS p26/p27 (ALT1+ALT2+main) ----
    # print: 10²=16²+20²−2×16×20cosCBA / 16²=10²+20²−2×10×20cosCAB / 20²=16²+10²−2×16×10cosBCA
    # + cos-frac numerators; ×3 blocks (main + ALT1 + ALT2) => exp=3 each.
    ('offp_2023-06_01_28', 'solutionMirror',
     '102 = 162 + 202 − 2 ×16 × 20cos CBA',
     '$10^2$ = $16^2$ + $20^2$ − 2 ×16 × 20cos CBA', 3,
     'ms-2023-06-4mb1-01-p26-26.png + p27 (150dpi, READ)', '10²/16²/20² flattened sups ×3 ALT blocks (p26 ALT1 = p27 ALT2 = main)',
    ),
    ('offp_2023-06_01_28', 'solutionMirror',
     '162 = 102 + 202 − 2 ×10 × 20cos CAB',
     '$16^2$ = $10^2$ + $20^2$ − 2 ×10 × 20cos CAB', 3,
     'ms-2023-06-4mb1-01-p26-26.png + p27 (150dpi, READ)', 'flattened sups ×3 blocks',
    ),
    ('offp_2023-06_01_28', 'solutionMirror',
     '202 = 162 + 102 − 2 ×16 ×10cos BCA',
     '$20^2$ = $16^2$ + $10^2$ − 2 ×16 ×10cos BCA', 3,
     'ms-2023-06-4mb1-01-p26-26.png + p27 (150dpi, READ)', 'flattened sups ×3 blocks',
    ),
    ('offp_2023-06_01_28', 'solutionMirror',
     '162 + 202 − 102',
     '$16^2$ + $20^2$ − $10^2$', 3,
     'ms-2023-06-4mb1-01-p26-26.png + p27 (150dpi, READ)', 'cos CBA numerator flattened ×3 (p26 cos CBA = (16²+20²−10²)/2×16×20)',
    ),
    ('offp_2023-06_01_28', 'solutionMirror',
     '102 + 202 − 162',
     '$10^2$ + $20^2$ − $16^2$', 3,
     'ms-2023-06-4mb1-01-p26-26.png + p27 (150dpi, READ)', 'cos CAB numerator flattened ×3',
    ),
    ('offp_2023-06_01_28', 'solutionMirror',
     '162 + 102 − 202',
     '$16^2$ + $10^2$ − $20^2$', 3,
     'ms-2023-06-4mb1-01-p26-26.png + p27 (150dpi, READ)', 'cos BCA numerator flattened ×3',
    ),
    # ---- q27 (offp_2023-06_01_27) — mp0==sol lockstep (1436) — MS p24 ----
    ('offp_2023-06_01_27', 'solutionMirror',
     '("7.47") = CF 2 + 4.52 − 2 × 4.5 × CF cos (180 − "60")',
     '("7.47") = $CF^2$ + $4.5^2$ − 2 × 4.5 × CF cos (180 − "60")', 1,
     'ms-2023-06-4mb1-01-p24-24.png (150dpi, READ)', 'CF²/4.5² flattened (p24 cosine-rule row ("7.47")² = CF² + 4.5²); ("7.47") lost its ² — deleted-sup fence LEAVE',
    ),
    ('offp_2023-06_01_27', 'solutionMirror',
     '⎡⎣⇒ CF 2 + 4.5CF − 35.5509 = 0⎤⎦',
     '⎡⎣⇒ $CF^2$ + 4.5CF − 35.5509 = 0⎤⎦', 1,
     'ms-2023-06-4mb1-01-p24-24.png (150dpi, READ)', 'CF² flattened (p24 [⇒ CF² + 4.5CF − 35.5509 = 0])',
    ),
    # ================= paper official-4mb1-01-2025-10 =================
    # ---- q23-b (offp_2025-10_01_23-b) — sol/mp0 DIVERGED (2460/2486) — MS p22+p23 ----
    # print: √(8²−4²)×4+2√(8²−4²)×4 / √(8²+8²−2×8×8cos120) / 2×(½(4+8)√(8²−4²)) /
    # 4×2×√(8²−4²)+4×√(8²−4²) / √((2×4)²−4²). Same counts both fields; sqrt glyphs absent
    # ('12 48'/'48 3'/'8 3') = sqrt-loss content fence LEAVE + disclose.
    ('offp_2025-10_01_23-b', 'solution',
     '82 − 4 2',
     '$8^2$ − $4^2$', 4,
     'ms-2025-10-4mb1-01-p22-22.png + p23 (150dpi, READ)', '8²−4² flattened radicands ×4 (p22 triangle-and-rectangle row + ½-rows, p23 trapeziums/rectangles rows)',
    ),
    ('offp_2025-10_01_23-b', 'solution',
     '8 2 − 4 2',
     '$8^2$ − $4^2$', 3,
     'ms-2025-10-4mb1-01-p22-22.png + p23 (150dpi, READ)', 'detached variant ×3 (same print rows)',
    ),
    ('offp_2025-10_01_23-b', 'solution',
     '82 + 82 − 2 × 8 × 8cos (120 )',
     '$8^2$ + $8^2$ − 2 × 8 × 8cos (120 )', 3,
     'ms-2025-10-4mb1-01-p22-22.png (150dpi, READ)', '8²+8²−2×8×8cos(120) flattened ×3 (implied-by row ×2 + cosine-rule row)',
    ),
    ('offp_2025-10_01_23-b', 'solution',
     '(2 × 4) 2 − 42',
     '(2 × 4)$^2$ − $4^2$', 1,
     'ms-2025-10-4mb1-01-p22-22.png (150dpi, READ)', '(2×4)²−4² flattened (p22 Pythagoras half-base row)',
    ),
    ('offp_2025-10_01_23-b', 'mirror',
     '82 − 4 2',
     '$8^2$ − $4^2$', 4,
     'ms-2025-10-4mb1-01-p22-22.png + p23 (150dpi, READ)', 'mirror independent (diverged field, same counts)',
    ),
    ('offp_2025-10_01_23-b', 'mirror',
     '8 2 − 4 2',
     '$8^2$ − $4^2$', 3,
     'ms-2025-10-4mb1-01-p22-22.png + p23 (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2025-10_01_23-b', 'mirror',
     '82 + 82 − 2 × 8 × 8cos (120 )',
     '$8^2$ + $8^2$ − 2 × 8 × 8cos (120 )', 3,
     'ms-2025-10-4mb1-01-p22-22.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2025-10_01_23-b', 'mirror',
     '(2 × 4) 2 − 42',
     '(2 × 4)$^2$ − $4^2$', 1,
     'ms-2025-10-4mb1-01-p22-22.png (150dpi, READ)', 'mirror independent',
    ),
]

ZERO_FIX.update({
    # ---- paper official-4mb1-01-2023-06 ----
    'offp_2023-06_01_28-problem': ('"Question 28" prose + diagram labels — ctx-verified furniture'),
    'offp_2023-06_01_28-lead': ('solution cos CBA/CAB/BCA fraction weaves FS (p26/p27); "OA 10"/"16 + 10 + 20 6" semiperimeter '
                                'fraction weaves; r = "7.8"sin("26.2") trig-quoted; Heron sqrt-loss "23"(...) fence LEAVE; '
                                'awrt 3.4/49.0 answers; marks-column bleeds'),
    'offp_2023-06_01_27-problem': ('"to 3 significant figures" prose (ctx-verified class)'),
    'offp_2023-06_01_27-lead': ('solution sin ĈFD/sin(180−"60") trig; "7.47"/4.5 fraction weaves; awrt 31/29 prose; '
                                'marks-column bleeds "l 7"; ∠CDF quadratic-formula fraction weave FS (p24)'),
    'offp_2023-06_01_24': ('all cands print-verbatim (p21): tan x fractions, sin x/sin 90, "26"/"5.3" quotes, 180+/270− prose, '
                           '192 awrt, Total 6 marks — ms-2023-06-4mb1-01-p21-21.png'),
    'offp_2023-06_01_5': ('"AB 4" = AB/3.6 = 4/3 fraction-numerator weave (p6 print: M1 note AB/3.6 = 4/3); "10.8 2" '
                          'same weave adjacency — ms-2023-06-4mb1-01-p06-6.png (page located by needle, pagemap-unfound unit)'),
    # ---- paper official-4mb1-01-2025-10 ----
    'offp_2025-10_01_23-b-problem': ('"to 3 significant figures" prose + diagram labels (ctx-verified class)'),
    'offp_2025-10_01_23-b-lead': ('solution sector fraction weaves FS (120/360, 60/360 flattened denominators); '
                                  '"12 48 = 48 3 = 83.13" / "8 3 = 13.85" / "4 3 = 6.92" sqrt-loss fences LEAVE; '
                                  'M0M0M0A0 mark-code; 16π prose; θ=30,45,60 prose; "2 × × 4 × π" = 4² with ² DELETED '
                                  '(deleted-sup fence, p23 print) — the flattened "42 × π" ×6 handled as FIX tuples'),
    'offp_2025-10_01_14': ('all cands print-verbatim (p12): AD=DC square prose, ∠DAN = ∠CDM = 90 (print 90⁰), SAS/RHS/SSS reasons '
                           'prose, "reasons 1 2 3" lists, marks bleeds — ms-2025-10-4mb1-01-p12-12.png'),
    'offp_2025-10_01_23-a-problem': ('diagram label "C 24 cm" + "diameter 24 cm" prose (ctx-verified)'),
    'offp_2025-10_01_23-a-lead': ('solution 12−r=2r / 12=3r / 24=6r algebra prose + sin 30 trig (ctx-verified, no sup shapes)'),
    'offp_2025-10_01_6': ('"304 − 180 or 2..." bearing prose + M0 mark-code (p7 print-verbatim) — ms-2025-10-4mb1-01-p07-7.png'),
})

FIXES += [
    # ---- q23-b sector rows CATCH-ALL (offp_2025-10_01_23-b) — MS p23 sector print 4²×π ----
    ('offp_2025-10_01_23-b', 'solution',
     '42 × π',
     '$4^2$ × π', 6,
     'ms-2025-10-4mb1-01-p23-23.png (150dpi, READ)', '4²×π flattened-glued ×6 sector rows (p23 print all 4²×π) — page-read catch-all',
    ),
    ('offp_2025-10_01_23-b', 'mirror',
     '42 × π',
     '$4^2$ × π', 6,
     'ms-2025-10-4mb1-01-p23-23.png (150dpi, READ)', 'mirror independent, same count',
    ),
]

FIXES += [
    # ================= paper official-4mb1-01r-2026-06 =================
    # ---- q26 (offp_2026-06_01r_26) — mp0==sol lockstep (2125) — MS p35 ----
    # print: [MC²]=24²+64² / [ME²]=32²+9² / [CE²]=24²+"33.2"² / [AC²]=48²+64² / [OC²]=24²+32² /
    # [AE²]="40"²+9² (+ sqrt rows). Displaced '2 2 2 6' aggregate + ("41")/("33.2") deleted-²
    # cosine row = fences LEAVE.
    ('offp_2026-06_01r_26', 'solutionMirror',
     '242 + 642', '$24^2$ + $64^2$', 1,
     'ms-2026-06-4mb1-01r-p35-35.png (150dpi, READ)', '24²+64² flattened (p35 MC rows; [MC²] row = displaced aggregate fence)',
    ),
    ('offp_2026-06_01r_26', 'solutionMirror',
     '322 + 92', '$32^2$ + $9^2$', 2,
     'ms-2026-06-4mb1-01r-p35-35.png (150dpi, READ)', '32²+9² flattened ×2 (ME² and ME sqrt rows)',
    ),
    ('offp_2026-06_01r_26', 'solutionMirror',
     '242 + "33.2"2', '$24^2$ + "33.2"$^2$', 2,
     'ms-2026-06-4mb1-01r-p35-35.png (150dpi, READ)', '24²+"33.2"² flattened ×2 (CE² and CE sqrt rows)',
    ),
    ('offp_2026-06_01r_26', 'solutionMirror',
     '482 + 642', '$48^2$ + $64^2$', 2,
     'ms-2026-06-4mb1-01r-p35-35.png (150dpi, READ)', '48²+64² flattened ×2 (AC² and AC sqrt rows)',
    ),
    ('offp_2026-06_01r_26', 'solutionMirror',
     '242 + 322', '$24^2$ + $32^2$', 2,
     'ms-2026-06-4mb1-01r-p35-35.png (150dpi, READ)', '24²+32² flattened ×2 (OC² and OC sqrt rows)',
    ),
    ('offp_2026-06_01r_26', 'solutionMirror',
     '"40"2 + 92', '"40"$^2$ + $9^2$', 2,
     'ms-2026-06-4mb1-01r-p35-35.png (150dpi, READ)', '"40"²+9² flattened ×2 (AE² and AE sqrt rows)',
    ),
    # ---- q24-a (offp_2026-06_01r_24-a) — sol/mp0 DIVERGED (533/539) — MS p30 (a) + QP p21 ----
    # print: (18−2r)×18=12² / (18−r)²=12²+r² / oe eg (18−d/2)²=12²+(d/2)² / 36r=18²−12² / ALT 18×PA=12²,
    # (18−d)×18=12². (18−r)² outer ² DELETED fence; '36r = 18 − 12' deleted-² fence; (d/2)² mangled fence.
    ('offp_2026-06_01r_24-a', 'solution',
     '(18 − 2r ) ×18 = 122 oe', '(18 − 2r ) ×18 = $12^2$ oe', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', '12² flattened (p30 24(a) M1 row)',
    ),
    ('offp_2026-06_01r_24-a', 'solution',
     '(18 − r ) = 122 + r 2', '(18 − r ) = $12^2$ + $r^2$', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', '12² + r² flattened; (18−r)² outer ² deleted — fence LEAVE',
    ),
    ('offp_2026-06_01r_24-a', 'solution',
     '⎟ = 122 + 2⎠', '⎟ = $12^2$ + 2⎠', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', '12² flattened in (18−d/2)² eg row (second term fraction-mangled fence)',
    ),
    ('offp_2026-06_01r_24-a', 'solution',
     '18 × PA = 122 oe', '18 × PA = $12^2$ oe', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', '12² flattened (ALT row)',
    ),
    ('offp_2026-06_01r_24-a', 'solution',
     '(18 − d ) ×18 = 122 oe', '(18 − d ) ×18 = $12^2$ oe', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', '12² flattened (ALT row 2)',
    ),
    ('offp_2026-06_01r_24-a', 'solution',
     'eliminate r2', 'eliminate $r^2$', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', 'r² flattened-glued (p30 M1dep note "eliminate r²")',
    ),
    ('offp_2026-06_01r_24-a', 'mirror',
     '(18 − 2r ) ×18 = 122 oe', '(18 − 2r ) ×18 = $12^2$ oe', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', 'mirror independent (diverged +6ch)',
    ),
    ('offp_2026-06_01r_24-a', 'mirror',
     '(18 − r ) = 122 + r 2', '(18 − r ) = $12^2$ + $r^2$', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2026-06_01r_24-a', 'mirror',
     '⎟ = 122 + ⎜ ⎟', '⎟ = $12^2$ + ⎜ ⎟', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2026-06_01r_24-a', 'mirror',
     '18 × PA = 122 oe', '18 × PA = $12^2$ oe', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2026-06_01r_24-a', 'mirror',
     '(18 − d ) ×18 = 122 oe', '(18 − d ) ×18 = $12^2$ oe', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2026-06_01r_24-a', 'mirror',
     'eliminate r2', 'eliminate $r^2$', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', 'mirror independent',
    ),
    # ---- q24-b (offp_2026-06_01r_24-b) — mp0==sol lockstep (642) — MS p30(b) + p31 ALT ----
    ('offp_2026-06_01r_24-b', 'solutionMirror',
     '182 + x 2', '$18^2$ + $x^2$', 1,
     'ms-2026-06-4mb1-01r-p30-30.png (150dpi, READ)', '18²+x² flattened (p30 (12+x)²=18²+x²; (12+x)² real ² survives)',
    ),
    ('offp_2026-06_01r_24-b', 'solutionMirror',
     'tan −1 [ =', 'tan^-1 [ =', 1,
     'ms-2026-06-4mb1-01r-p31-31.png (150dpi, READ)', 'tan^-1 flattened inverse (p31 [∠OPC=]tan⁻¹("5"/12)) — CATCH-ALL inverse-trig class; "5"/12 fraction weave FS',
    ),
    ('offp_2026-06_01r_24-b', 'solutionMirror',
     '[ POC =] sin −1 =', '[ POC =] sin^-1 =', 1,
     'ms-2026-06-4mb1-01r-p31-31.png (150dpi, READ)', 'sin^-1 flattened inverse (p31 [POC=]sin⁻¹(13/12)) — CATCH-ALL class',
    ),
    # ================= paper official-4mb1-02-2022-06 =================
    # ---- q5-b (offp_2022-06_02_5-b) — mp0==sol lockstep (487) — MS p08 ----
    ('offp_2022-06_02_5-b', 'solutionMirror',
     '11.52 +', '$11.5^2$ +', 1,
     'ms-2022-06-4mb1-02-p08-8.png (150dpi, READ)', '11.5² flattened (p08 3-D Pythagoras √(11.5²+3.95²+2.95²); √ glyph absent = sqrt-loss fence)',
    ),
    ('offp_2022-06_02_5-b', 'solutionMirror',
     '3.952', '$3.95^2$', 1,
     'ms-2022-06-4mb1-02-p08-8.png (150dpi, READ)', '3.95² flattened',
    ),
    ('offp_2022-06_02_5-b', 'solutionMirror',
     '2.952', '$2.95^2$', 1,
     'ms-2022-06-4mb1-02-p08-8.png (150dpi, READ)', '2.95² flattened',
    ),
    # ---- q6-a (offp_2022-06_02_6-a) — sol/mp0 DIVERGED (634/641) — MS p09(a) ----
    ('offp_2022-06_02_6-a', 'solution',
     'QP 2 + 1', '$QP^2$ + 1', 1,
     'ms-2022-06-4mb1-02-p09-9.png (150dpi, READ)', 'QP² flattened (p09 cos16.9 = 1/√(QP²+1) note; √ absent = sqrt-loss fence)',
    ),
    ('offp_2022-06_02_6-a', 'mirror',
     'QP 2 + 1', '$QP^2$ + 1', 1,
     'ms-2022-06-4mb1-02-p09-9.png (150dpi, READ)', 'mirror independent (diverged +7ch)',
    ),
    # ---- q6-b (offp_2022-06_02_6-b) — mp0==sol lockstep (500) — MS p09(b) ----
    ('offp_2022-06_02_6-b', 'solutionMirror',
     '10002 + 20002', '$1000^2$ + $2000^2$', 1,
     'ms-2022-06-4mb1-02-p09-9.png (150dpi, READ)', '1000²+2000² flattened (p09 [AB=]√(1000²+2000²) row; "1 + 2" = 1+2² with ² DELETED — fence LEAVE)',
    ),
    # ---- q8-c (offp_2022-06_02_8-c) — mp0==sol lockstep (533) — MS p12(c) ----
    ('offp_2022-06_02_8-c', 'solutionMirror',
     '1.22 − 0.62', '$1.2^2$ − $0.6^2$', 1,
     'ms-2022-06-4mb1-02-p12-12.png (150dpi, READ)', '1.2²−0.6² flattened (p12 [r=]…√(1.2²−0.6²) row)',
    ),
    ('offp_2022-06_02_8-c', 'solutionMirror',
     '0.62 + 0.62 + 2 × 0.62 cos120', '$0.6^2$ + $0.6^2$ + 2 × $0.6^2$ cos120', 1,
     'ms-2022-06-4mb1-02-p12-12.png (150dpi, READ)', '0.6²×3 flattened (p12 notes √(0.6²+0.6²+2×0.6²cos120))',
    ),
    ('offp_2022-06_02_8-c', 'solutionMirror',
     'π × "1.039.."2', 'π × "1.039.."$^2$', 1,
     'ms-2022-06-4mb1-02-p12-12.png (150dpi, READ)', '"1.039.."² flattened (p12 π×"1.039…"² area row)',
    ),
]

ZERO_FIX.update({
    # ---- paper official-4mb1-01r-2026-06 ----
    'offp_2026-06_01r_18': ('ctx-class-cited: all cands sin20/cos20/tan20 trig keywords (sct) + (sin20)² real ² in plane + '
                            'ALT1/ALT2 headers + awrt 2dp prose + marks bleeds — no sup shapes; ms p20 mapped'),
    'offp_2026-06_01r_18-problem': ('"to 2 significant figures" prose + diagram labels (ctx-verified class)'),
    'offp_2026-06_01r_26-lead': ('solution displaced aggregate "2 2 2 6" (MC² row) + cosine row "4672" = ("41") + ("33.2") '
                                 'deleted-² fence (print ("41"²)+("33.2"²)) + awrt 68/33/41/134 prose + 8 73 sqrt-loss '
                                 '(=8√73) + marks bleeds — all LEAVE'),
    'offp_2026-06_01r_24-a-problem': ('diagram label "P 12 cm" (ctx-verified) — qp-2026-06-4mb1-01r-p21-21.png'),
    'offp_2026-06_01r_24-a-lead': ('solution "36r = 18 − 12" deleted-² fence (print 36r = 18²−12²); "(d/2)²" second-term '
                                   'mangle fence; cas 5/PA=8 answers; fraction weaves'),
    # ---- paper official-4mb1-02-2022-06 ----
    'offp_2022-06_02_5-b-problem': ('"to 3 significant figures" prose (ctx-verified)'),
    'offp_2022-06_02_5-b-lead': ('solution bounds values 11.5/12.5/3.95/4.05/2.95/3.05 prose + 192/13 NB answers + '
                                 '3-D Pythagoras sqrt-loss fence — ms-2022-06-4mb1-02-p08-8.png'),
    'offp_2022-06_02_6-a-problem': ('prose "1 km due south"/"2 km due east"/"to 3 significant figures" (ctx-verified)'),
    'offp_2022-06_02_6-a-lead': ('solution QP/1000 + QP/1 fraction weaves FS; tan16.9/cos16.9/sin73.1 trig; '
                                 '"Allow any letter" prose — ms-2022-06-4mb1-02-p09-9.png'),
    'offp_2022-06_02_6-b-lead': ('solution "or 5" marks-column bleed; "1 + 2" = 1+2² deleted-² fence (print p09 √(1+2²)); '
                                 'tan θ fraction weave; 304−"288" prose — ms-2022-06-4mb1-02-p09-9.png'),
    'offp_2022-06_02_8-c-problem': ('"to 3 significant figures" prose + "used as 4" marks-bleed (print: used as hypotenuse; '
                                    '4 = marks col) — ms-2022-06-4mb1-02-p12-12.png'),
    'offp_2022-06_02_8-c-lead': ('solution tan60/tan30/sin120/sin60 trig; 3√3/5 fraction weave; "0.9974" quote; '
                                 'awrt 1.04/3.39 answers; π×"r"² note real ² — ms-2022-06-4mb1-02-p12-12.png'),
})

FIXES += [
    # ================= paper official-4mb1-02r-2023-01 =================
    # ---- q12-a (offp_2023-01_02r_12-a) — mp0==sol lockstep (803) — MS p20 (needle-located) ----
    ('offp_2023-01_02r_12-a', 'solutionMirror',
     'd 2 = 100 or x 2 = 300 or y 2 = 25 oe',
     '$d^2$ = 100 or $x^2$ = 300 or $y^2$ = 25 oe', 1,
     'ms-2023-01-4mb1-02r-p20-20.png (150dpi, READ)', 'd²/x²/y² flattened (p20 M1 row d²=100 or x²=300 or y²=25 oe)',
    ),
    # ---- q5-a (offp_2023-01_02r_5-a) — sol/mp0 DIVERGED (496/502) — MS p10 (needle-located) ----
    ('offp_2023-01_02r_5-a', 'solution',
     '82 − 52 [ = 39] or', '$8^2$ − $5^2$ [ = 39] or', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', '8²−5² flattened (p10 5(a) M1 row)',
    ),
    ('offp_2023-01_02r_5-a', 'solution',
     'Allow 82 = x 2 + 52 oe', 'Allow $8^2$ = $x^2$ + $5^2$ oe', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', '8²=x²+5² flattened (p10 Allow note)',
    ),
    ('offp_2023-01_02r_5-a', 'solution',
     '82 − 52 ⎡⎣ = 39', '$8^2$ − $5^2$ ⎡⎣ = 39', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', '8²−5² flattened (p10 √(8²−5²) row; sqrt glyph absent = sqrt-loss fence)',
    ),
    ('offp_2023-01_02r_5-a', 'solution',
     '[ ∠BAC =] cos −1 [ =', '[ ∠BAC =] cos^-1 [ =', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', 'cos^-1 flattened inverse (p10 cos⁻¹(5/8)) — CATCH-ALL inverse-trig class; 5/8 weave FS',
    ),
    ('offp_2023-01_02r_5-a', 'solution',
     '× 5 × 52 + 82 × 7', '× 5 × $5^2$ + $8^2$ × 7', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', '5²+8² flattened (p10 SCB1 note ½×5×√(5²+8²)×7; sqrt-loss fence)',
    ),
    ('offp_2023-01_02r_5-a', 'mirror',
     '82 − 52 [ = 39] or', '$8^2$ − $5^2$ [ = 39] or', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', 'mirror independent (diverged +6ch)',
    ),
    ('offp_2023-01_02r_5-a', 'mirror',
     'Allow 82 = x 2 + 52 oe', 'Allow $8^2$ = $x^2$ + $5^2$ oe', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-01_02r_5-a', 'mirror',
     '82 − 52 ⎡⎣ = 39', '$8^2$ − $5^2$ ⎡⎣ = 39', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-01_02r_5-a', 'mirror',
     'cos −1 ⎛⎜ ⎞⎟ [ =', 'cos^-1 ⎛⎜ ⎞⎟ [ =', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-01_02r_5-a', 'mirror',
     '× 5 × 52 + 82 × 7', '× 5 × $5^2$ + $8^2$ × 7', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', 'mirror independent',
    ),
    # ---- q5-b (offp_2023-01_02r_5-b) — mp0==sol lockstep (487) — MS p10 ----
    ('offp_2023-01_02r_5-b', 'solutionMirror',
     'PT = 252 − "8.55"2', 'PT = $25^2$ − "8.55"$^2$', 1,
     'ms-2023-01-4mb1-02r-p10-10.png (150dpi, READ)', '25²−"8.55"² flattened (p10 QT/PT Pythagoras row; sqrt-loss fence)',
    ),
    # ---- q12-b (offp_2023-01_02r_12-b) — sol/mp0 DIVERGED (1827/1844) — MS p21 ----
    # print: KF² = "24.14"²+"10"²−2×"24.14"×"10"×cos"165" / "18.47"²+"17.32"² / "26.13"²+"15.86"²
    # (+ [KF=] sqrt rows); "5 2 + 5 3" = 5√2+5√3 radical fence LEAVE.
    ('offp_2023-01_02r_12-b', 'solution',
     'KF 2 =', '$KF^2$ =', 3,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', 'KF² flattened ×3 cosine-rule rows (p21)',
    ),
    ('offp_2023-01_02r_12-b', 'solution',
     '"24.14"2 + "10"2', '"24.14"$^2$ + "10"$^2$', 2,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', 'quoted-sup pairs flattened ×2 (KF²= and [KF=] rows)',
    ),
    ('offp_2023-01_02r_12-b', 'solution',
     '"18.47"2 + "17.32"2', '"18.47"$^2$ + "17.32"$^2$', 2,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', '×2',
    ),
    ('offp_2023-01_02r_12-b', 'solution',
     '"26.13"2 + "15.86"2', '"26.13"$^2$ + "15.86"$^2$', 2,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', '×2',
    ),
    ('offp_2023-01_02r_12-b', 'solution',
     '"22.07..."2 + "25.73..."2', '"22.07..."$^2$ + "25.73..."$^2$', 1,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', '[KF=]√("22.07…"²+"25.73…"²) row',
    ),
    ('offp_2023-01_02r_12-b', 'mirror',
     'KF 2 =', '$KF^2$ =', 3,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', 'mirror independent (diverged +17ch)',
    ),
    ('offp_2023-01_02r_12-b', 'mirror',
     '"24.14"2 + "10"2', '"24.14"$^2$ + "10"$^2$', 2,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-01_02r_12-b', 'mirror',
     '"18.47"2 + "17.32"2', '"18.47"$^2$ + "17.32"$^2$', 2,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-01_02r_12-b', 'mirror',
     '"26.13"2 + "15.86"2', '"26.13"$^2$ + "15.86"$^2$', 2,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', 'mirror independent',
    ),
    ('offp_2023-01_02r_12-b', 'mirror',
     '"22.07..."2 + "25.73..."2', '"22.07..."$^2$ + "25.73..."$^2$', 1,
     'ms-2023-01-4mb1-02r-p21-21.png (150dpi, READ)', 'mirror independent',
    ),
]

ZERO_FIX.update({
    # ---- paper official-4mb1-02r-2023-01 ----
    'offp_2023-01_02r_5-a-problem': ('diagram labels (8 cm/7 cm/5 cm/20°/12 cm/25 cm) + "Figure 2/3" prose — qp-2023-01-4mb1-02r-p12-12.png'),
    'offp_2023-01_02r_5-a-lead': ('solution "⎝8⎠" fraction weave; 6.24.../109/140/165 answers; SCB1 mark-code; '
                                  '"× 5 × 8 × 7" prose — ms-2023-01-4mb1-02r-p10-10.png'),
    'offp_2023-01_02r_5-b-lead': ('solution 25cos70/25sin20/25sin70/25cos20 trig-verbatim; 25sin70/sin90 fraction weave FS; '
                                  '81[cm] awrt; marks bleeds — ms-2023-01-4mb1-02r-p10-10.png'),
    'offp_2023-01_02r_12-a-problem': ('"Figure 4/Figure 5" prose (ctx-verified) — qp-2023-01-4mb1-02r-p32-32.png'),
    'offp_2023-01_02r_12-a-lead': ('solution "3 3d 2 4" = (3√3d²)/2 radical+fraction fence (p20 print 3√3d²/2); ×x×x/×y×3y weaves; '
                                   'sin 60/sin 30 trig; 150√3 radical; 60(cm) answer — ms-2023-01-4mb1-02r-p20-20.png'),
    'offp_2023-01_02r_12-b-lead': ('solution "5 2 + 5 3" = 10+5√2+5√3 radical fence (p21 print); "10"sin30/"10"cos60 quoted trig; '
                                   'KG "135"/2 fraction weave; 15+5√2 displaced fence; 22.07.../25.73... answers — ms p21'),
})
