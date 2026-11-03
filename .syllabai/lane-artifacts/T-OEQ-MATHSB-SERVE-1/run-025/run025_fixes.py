#!/usr/bin/env python3
r"""run-025 tranche-2 wave-2 FIXES (eyes-on-adjudicated, NO-GUESS).

Residual 142 units of the deduped 149-unit worklist (run-024 wave-1 took 7).
Every fix verified against the MS/QP page of record rendered @150dpi and READ
first-hand. Evidence PNGs: /home/z/my-project/scratch/oeq_run024/pages/.

Tuple: (pid, field, old, new, exp, evidence, note)
  field: 'solutionMirror' (solutionMd + lockstep mp0, byte-equality pre-checked)
       | 'solution' | 'mirror' (markPoints[0].textMd) | 'problem'
  exp  : expected occurrence count (fail-closed; exp!=1 replaces ALL)
ORDER MATTERS for sequence-dependent tuples (battery applies in list order).

Fences honored (run-024 law): radical-flatten class LEAVE; deleted-sup (glyph
absent from plane) LEAVE + disclose; fraction weaves (FS, run-004 R4-A) LEAVE;
print-literal mark-code runs LEAVE; furniture (prose adjacency, diagram labels,
answer-blank bleed, trig angles) ZERO-FIX with page evidence.
Missing sqrt/overline glyphs where print shows sqrt() = content-loss class,
LEAVE + disclose (not sup flattening).
"""

E_P11 = 'ms-2018-06-01R-p11-11.png (150dpi, READ)'
E_P14 = 'ms-2018-06-01R-p14-14.png (150dpi, READ)'
E_P16Q = 'qp-2018-06-01R-p16-16.png (150dpi, READ)'

FIXES = [
    # ================= paper official-4mb1-01r-2018-06 =================
    # ---- q21 (offp_2018-06_01r_21) — mp0==sol lockstep; MS p11 + QP p16 ----
    ('offp_2018-06_01r_21', 'solutionMirror',
     '82 + 152 (=17) M1 Using Pythagoras correctly',
     '$8^2$ + $15^2$ (=17) M1 Using Pythagoras correctly', 1,
     E_P11, '8^2 + 15^2 flattened sups (p11 row1: sqrt(8^2+15^2)(=17); sqrt glyph absent from plane — content-loss disclosed, leave)',
    ),
    # q21 zero-fix: problem cands 'h 9'/'s 15'/'h 18'/'d 10' = prose furniture
    # (QP p16 print: 'length 9 cm'/'sides ... 15 cm'/'length 18 cm and 10 cm');
    # solution 'e 3' = 'the 3 rectangles', 'r 10' = 'or 10 x15' prose/or; row3
    # '(8x15)/2' fraction weave = FS fence (run-004 R4-A).
    # ---- q27 (offp_2018-06_01r_27) — mp0==sol lockstep; MS p14 ----
    ('offp_2018-06_01r_27', 'solutionMirror',
     'ED = 62 + 62 − 2 × 6 × 6 × cos105 or',
     'ED = $6^2$ + $6^2$ − 2 × 6 × 6 × cos105 or', 1,
     E_P14, '6^2 + 6^2 flattened sups (p14 M1 row2: sqrt(6^2+6^2-2x6x6xcos105); sqrt glyph absent — content-loss disclosed, leave)',
    ),
    ('offp_2018-06_01r_27', 'solutionMirror',
     '−9.52 + 9.522 − 4 ×1× −144',
     '−9.52 + $9.52^2$ − 4 ×1× −144', 1,
     E_P14, '9.52^2 flattened sup (p14 M1 quadratic-formula row: sqrt(9.52^2 - 4x1x-144))',
    ),
    # q27 zero-fix: problem 's 6' = 'radius 6 cm', 'o 3' = 'to 3 significant
    # figures' prose (QP p22 print verified); 'DC²'/'9.52DC' plane already real
    # sup glyphs; 'cos105'/'6sin52.5' trig furniture.
]

ZERO_FIX = {
    'offp_2018-06_01r_21': 'problem cands all prose furniture (qp-2018-06-01R-p16: '
                           '"length 9 cm"/"sides is 15 cm"/"length 18 cm and 10 cm"); '
                           'solution "3 rectangles"/"or 10x15" prose; "(8x15)/2" = FS fence',
    'offp_2018-06_01r_27': 'problem cands "radius 6 cm"/"to 3 significant figures" prose '
                           '(qp-2018-06-01R-p22); solution "cos105"/"6sin52.5" trig furniture; '
                           'DC^2 + 9.52DC row already carries real sup glyphs in plane',
    'offp_2018-06_02r_11-a': 'problem cands all diagram-label/prose furniture (qp-2018-06-02R-p26: '
                             '"GH 6 cm"/"8 cm"/"Figure 5"/"sides of length 6 cm"/"to 3 significant figures"); '
                             'solution "triangle 5" = marks bleed; "GO = 3/cos54 = ..." fraction weave FS fence',
    'offp_2018-06_02r_11-b': 'problem "to 1 decimal place" prose; all SCT cands = trig angles '
                             '(6cos18/6sin72/cos54/sin36 print-verbatim ms-p12); "r 6" = "or 6cos54" prose',
    'offp_2018-06_02r_12-b': 'problem "to 3 significant figures" prose + "cos A 1" marks bleed; '
                             'solution "or 7"/"or 9tan" = or-furniture; 8²/14²/12² cosine rows already real sups',
}

# ================= paper official-4mb1-01-2019-06 =================
E_P10_19 = 'ms-2019-06-01-p10-10.png (150dpi, READ)'

FIXES += [
    # ---- q17-b (offp_2019-06_01_17-b) — mp0==sol lockstep; MS p10 ----
    ('offp_2019-06_01_17-b', 'solutionMirror',
     '[(sin 90)] 122 − 42',
     '[(sin 90)] $12^2$ − $4^2$', 1,
     E_P10_19, '12^2 − 4^2 flattened sups (p10 17(b) row1: sin x° = [(sin90)]sqrt(12^2-4^2)/12; sqrt glyph absent — disclosed leave)',
    ),
    ('offp_2019-06_01_17-b', 'solutionMirror',
     '122 − 42 122 + 42 − ( 122 − 42 )²',
     '$12^2$ − $4^2$ $12^2$ + $4^2$ − ( $12^2$ − $4^2$ )²', 1,
     E_P10_19, '12^2/4^2 x3 flattened sups (p10 17(b) row2: tan x° = sqrt(12^2-4^2)/4 or cos x° = (12^2+4^2-(sqrt(12^2-4^2))^2)/(2x12x4); outer )² real, inners flattened)',
    ),
    ('offp_2019-06_01_17-b', 'solutionMirror',
     'awrt 11.3 for 122 − 42',
     'awrt 11.3 for $12^2$ − $4^2$', 1,
     E_P10_19, '12^2 − 4^2 (p10 Notes: Allow 8√2 or awrt 11.3 for sqrt(12^2-4^2); "8 2" = 8√2 radical-flatten FENCE left)',
    ),
]

ZERO_FIX['offp_2019-06_01_17-a'] = ('solution "1/(2)(6)sin30...3 2" = 1/2 fraction weave (FS fence) + '
                                    'answer/marks adjacency; problem cands all diagram labels '
                                    '(6 cm/30°/2 cm/12 cm/x°/4 cm) — qp-2019-06-01-p10 print-verified')
ZERO_FIX['offp_2019-06_01_17-b'] = 'problem "to 3 significant figures" prose; solution "(sin 90)" print-verbatim'

# ================= paper official-4mb1-01r-2019-06 =================
E_P14_19R = 'ms-2019-06-01R-p14-14.png (150dpi, READ)'

FIXES += [
    # ---- q27 (offp_2019-06_01r_27) — mp0==sol lockstep; MS p14 ----
    ('offp_2019-06_01r_27', 'solutionMirror',
     'or for AC 2 = AD 2 + 6.42 - 2( AD )(6.4) cos85o',
     'or for $AC^2$ = $AD^2$ + $6.4^2$ - 2( AD )(6.4) cos85o', 1,
     E_P14_19R, 'AC^2/AD^2/6.4^2 flattened sups (p14 q27 M1 Notes: AC^2 = AD^2 + 6.4^2 - 2(AD)(6.4)cos85^o)',
    ),
    ('offp_2019-06_01r_27', 'solutionMirror',
     '( AD 2 - 1.1155903507 AD - 171.6697272 = 0',
     '( $AD^2$ - 1.1155903507 AD - 171.6697272 = 0', 1,
     E_P14_19R, 'AD^2 flattened sup (p14 q27 Notes: (AD^2 - 1.1155903507AD - 171.6697272 = 0)',
    ),
]

ZERO_FIX['offp_2019-06_01r_24-a'] = ('all cands prose/marks furniture: "Correct 2"/"with 2 sets of arcs"/'
                                     '"for 2 sets" prose numbers + B2/B1 marks; problem "1 cm represents 50 metres" — '
                                     'construction question, no sup shapes in print')
ZERO_FIX['offp_2019-06_01r_27-problem'] = ('"to 3 significant figures" prose + "D 9 cm" diagram label; '
                                           '"sin 85o" = degree-glyph mangle (o for °), not a sup — leave')

# ================= paper official-4mb1-01-2020-01 =================
E_P10_20 = 'ms-2020-01-01-p10-10.png (150dpi, READ)'

FIXES += [
    # ---- q17 (offp_2020-01_01_17) — mp0==sol lockstep; MS p10 ----
    ('offp_2020-01_01_17', 'solutionMirror',
     '(BD2=)6.52-2.52 (=36)',
     '($BD^2$=)$6.5^2$-$2.5^2$ (=36)', 1,
     E_P10_20, 'BD^2/6.5^2/2.5^2 flattened sups (p10 17 M3 row: (BD^2=)6.5^2-2.5^2(=36); trailing 4 = marks bleed)',
    ),
    ('offp_2020-01_01_17', 'solutionMirror',
     'Correct method to find BD or BD2',
     'Correct method to find BD or $BD^2$', 1,
     E_P10_20, 'BD^2 flattened sup (p10 17 M1 Notes: Correct method to find BD or BD^2)',
    ),
]

ZERO_FIX['offp_2019-06_02_5-b'] = ('sin30 trig angles print-verbatim (ms-2019-06-02-p11); mathic italic '
                                   'letter-doubling = digitization artifact not sups; "5 sin 30" fraction weave FS fence')
ZERO_FIX['offp_2019-06_02_5-c'] = ('"1 4 / 2 (8)(5)sin30" = 1/2 fraction weaves (FS fence, qp-2019-06-02-p06/12 + '
                                   'ms-p11); sin30 trig; "o 3" prose')
ZERO_FIX['offp_2020-01_01_17-problem'] = '"to 3 significant figures" prose'
ZERO_FIX['offp_2020-01_01_17-fences'] = ('Area of ABD = 1/2(2.5)(BD) / Area of BCD = 1/2(4.2)(BD)sin35 / '
                                         'allow 1/2(6.5)(2.5)sinBAD with cosBAD = 2.5/6.5 — all FS fraction weaves, '
                                         'run-004 R4-A owning class (ms-2020-01-01-p10)')

# ================= paper official-4mb1-02-2020-01 =================
E_P11_20 = 'ms-2020-01-02-p11-11.png (150dpi, READ)'
E_P14_20 = 'ms-2020-01-02-p14-14.png (150dpi, READ)'
E_P18Q_20 = 'qp-2020-01-02-p18-18.png (150dpi, READ)'
E_P28Q_20 = 'qp-2020-01-02-p28-28.png (150dpi, READ)'

FIXES += [
    # ---- q7-a (offp_2020-01_02_7-a) — mp0==sol lockstep; MS p11 + QP p18 ----
    ('offp_2020-01_02_7-a', 'solutionMirror',
     "find r2 or r eg",
     "find $r^2$ or r eg", 1,
     E_P11_20, 'r^2 flattened sup (p11 7(a) M1 Notes: Use of Pythagoras to find r^2 or r)',
    ),
    ('offp_2020-01_02_7-a', 'solutionMirror',
     'V = π (16 − h 2 ) ( 2 h )',
     'V = π (16 − $h^2$ ) ( 2 h )', 1,
     E_P11_20, 'h^2 flattened sup (p11 row2: V = pi(16-h^2)(2h))',
    ),
    ('offp_2020-01_02_7-a', 'solutionMirror',
     'V = 32π h − 2π h3',
     'V = 32π h − 2π $h^3$', 1,
     E_P11_20, 'h^3 flattened sup (p11 row3: V = 32πh − 2πh^3)',
    ),
    ('offp_2020-01_02_7-a', 'problem',
     'Show that V = 32πh – 2πh3',
     'Show that V = 32πh – 2π$h^3$', 1,
     E_P18Q_20, 'h^3 flattened sup in problem stem (print qp p18: Show that V = 32πh − 2πh^3)',
    ),
    # q7-a fences: line-1/line-2 sup-displacement aggregate ('2 2 2 3 82 − (2h) 2'
    # aggregating 16-h^2 x2 sups + Notes numerator 8^2-(2h)^2 with displaced
    # denominator) — re-attachment = restructuring, F5d-disclosed leave.
    # ---- q10-a (offp_2020-01_02_10-a) — DIVERGED mirror; MS p14 ----
    ('offp_2020-01_02_10-a', 'solution',
     'eg 62 = 102 + 72 − 2 ×10 × 7 × cos(θ )',
     'eg $6^2$ = $10^2$ + $7^2$ − 2 ×10 × 7 × cos(θ )', 1,
     E_P14_20, '6^2/10^2/7^2 flattened sups (p14 10(a) M1 row: eg 6^2 = 10^2 + 7^2 - 2x10x7xcos(θ))',
    ),
    ('offp_2020-01_02_10-a', 'solution',
     '10 2 + 7 2 − 6 2',
     '$10^2$ + $7^2$ − $6^2$', 1,
     E_P14_20, 'numerator sups (p14 row2: cos∠θ = (10^2+7^2-6^2)/(2(10)(7)))',
    ),
    ('offp_2020-01_02_10-a', 'mirror',
     'eg 62 = 102 + 72 − 2 ×10 × 7 × cos(θ )',
     'eg $6^2$ = $10^2$ + $7^2$ − 2 ×10 × 7 × cos(θ )', 1,
     E_P14_20, 'mirror of cosine-rule sups',
    ),
    ('offp_2020-01_02_10-a', 'mirror',
     '10 2 + 7 2 − 6 2',
     '$10^2$ + $7^2$ − $6^2$', 1,
     E_P14_20, 'mirror of numerator sups',
    ),
    ('offp_2020-01_02_10-a', 'mirror',
     '20.7 [cm2]',
     '20.7 [cm$^2$]', 1,
     E_P14_20, 'mirror unit sup cm^2 (p14 answer col: 20.7 [cm^2]; solution already carries real cm² — pre-existing divergence)',
    ),
    # ---- q10-b (offp_2020-01_02_10-b) — mp0==sol lockstep; QP p28 ----
    ('offp_2020-01_02_10-b', 'problem',
     'Cosine rule: a 2 = b 2 + c 2 − 2bc cos A',
     'Cosine rule: $a^2$ = $b^2$ + $c^2$ − 2bc cos A', 1,
     E_P28Q_20, 'cosine-rule formula box flattened sups (print qp p28 formula box) — 12-b wave-2 class',
    ),
]

ZERO_FIX['offp_2020-01_02_3-a'] = ('problem cands = diagram labels (O/B/25°/C/A 15 cm/Figure 1) + prose; solution = '
                                   'trig (tan25/tan65/cos25) + marks bleed "oe 3" + 22/7 FS weave (ms-2020-01-02-p07)')
ZERO_FIX['offp_2020-01_02_3-b'] = 'trig sin25/cos25 + "(15)...(15)..." sector fraction weaves FS + prose (ms-p07)'
ZERO_FIX['offp_2020-01_02_8-a'] = ('"Figure 3" labels + "68 metres" prose; "g 4" = perimeter/2 fraction weave '
                                   '(FS fence); no sup shapes in any candidate')
ZERO_FIX['offp_2020-01_02_10-a-fences'] = ('Heron 1/2 weaves ("1", "100" displaced 1/2s) + "(6+7+10)/10" S-fraction '
                                           'weave — FS fence (ms-2020-01-02-p14)')
ZERO_FIX['offp_2020-01_02_10-b-fences'] = ('1/2(10)(r)+1/2(6)(r)+1/2(7)(r) weaves + r/XB tan-ratio weaves + '
                                           '"into 3 each with 3" marks bleed — FS fence (ms-2020-01-02-p14)')

# ================= paper official-4mb1-02r-2020-01 =================
E_P12_20R = 'ms-2020-01-02R-p12-12.png (150dpi, READ)'
E_P16Q_20R = 'qp-2020-01-02R-p16-16.png (150dpi, READ)'

FIXES += [
    # ---- q8-a (offp_2020-01_02r_8-a) — DIVERGED mirror; MS p12 + QP p16 ----
    ('offp_2020-01_02r_8-a', 'solution',
     '∠ABC = sin −1 100',
     '∠ABC = sin$^{-1}$ 100', 1,
     E_P12_20R, 'sin^-1 flattened inverse (p12 8(a) M1(DEP) row: ∠ABC = sin^-1(30xsin70/100); fraction weave around it = FS fence) — CATCH-ALL inverse-trig class',
    ),
    ('offp_2020-01_02r_8-a', 'mirror',
     '∠ABC = sin −1 ⎜ ⎟',
     '∠ABC = sin$^{-1}$ ⎜ ⎟', 1,
     E_P12_20R, 'mirror sin^-1 (⎜⎟ arrangement)',
    ),
    # ---- q8-b (offp_2020-01_02r_8-b) — mp0==sol lockstep; MS p12 ----
    ('offp_2020-01_02r_8-b', 'solutionMirror',
     'BC 2 = 100 2 + 30 2 − 2 × 100 × 30 × cos" ∠BAC "',
     '$BC^2$ = $100^2$ + $30^2$ − 2 × 100 × 30 × cos" ∠BAC "', 1,
     E_P12_20R, 'BC^2/100^2/30^2 flattened sups (p12 8(b) OR row: BC^2 = 100^2 + 30^2 - 2x100x30xcos"∠BAC"; sqrt of 10900-6000cos row = sqrt glyph loss, disclosed leave)',
    ),
    # ---- q8-d (offp_2020-01_02r_8-d) — DIVERGED mirror; MS p12 ----
    ('offp_2020-01_02r_8-d', 'mirror',
     '498, 499 (cm2)',
     '498, 499 (cm$^2$)', 1,
     E_P12_20R, 'mirror unit sup cm^2 (p12 8(d) A1: 498, 499 (cm^2); solution already real cm²) — CATCH-ALL unit-sup class',
    ),
    # ---- q8-e (offp_2020-01_02r_8-e) — mp0==sol lockstep; QP p16 ----
    ('offp_2020-01_02r_8-e', 'problem',
     'Cosine rule a 2 = b 2 + c 2 − 2bc cos A',
     'Cosine rule $a^2$ = $b^2$ + $c^2$ − 2bc cos A', 1,
     E_P16Q_20R, 'formula-box flattened sups (print qp p16: Cosine rule a^2 = b^2 + c^2 - 2bc cos A); sine-rule fraction weave = FS fence',
    ),
]

ZERO_FIX['offp_2020-01_02r_8-a-problem'] = 'diagram labels (100 cm/E/D/30 cm/70°/B/M/C/Figure 1) + prose — qp-2020-01-02R-p16'
ZERO_FIX['offp_2020-01_02r_8-d'] = ('solution side: "12 × 12" = 1/2 × 1/2 fraction weaves (print p12 8(d): '
                                    'V_DCM = 1/2 x (1/2 x "BC") x ("DC") x sin70) — FS fence; trig sin70 furniture')

# ================= paper official-4mb1-02-2020-06 (1-b TWIN PAIR) =================
E_P05_20 = 'ms-2020-06-02-p05-05.png (150dpi, READ; 2020-06/2020-11 twins byte-identical payloads)'

FIXES += [
    # ---- q1-b twin pair — mp0==sol lockstep; MS p05 ----
    *[(pid, 'solutionMirror',
       'y = sin −1 oe 5 × sin124',
       'y = sin$^{-1}$ oe 5 × sin124', 1,
       E_P05_20, 'sin^-1 flattened inverse (p05 1(b) M1dep row: y = sin^-1(5sin124/10.8) oe; fraction weave = FS fence) — CATCH-ALL inverse-trig class')
     for pid in ('offp_2020-06_02_1-b', 'offp_2020-11_02_1-b')],
    *[(pid, 'solutionMirror',
       'y = sin −1 ( awrt 0.38) oe',
       'y = sin$^{-1}$ ( awrt 0.38) oe', 1,
       E_P05_20, 'sin^-1 flattened inverse (p05 Notes: y = sin^-1(awrt 0.38) oe) — CATCH-ALL inverse-trig class')
     for pid in ('offp_2020-06_02_1-b', 'offp_2020-11_02_1-b')],
]

ZERO_FIX['offp_2020-06_02_1-b-lead'] = ('"sin y 3" = sin y numerator + marks-3 bleed; sine-rule 5/10.8 denominators '
                                        'displaced = FS weave (p05 row 1)')
ZERO_FIX['offp_2020-06_01r_16'] = ('"to 2 decimal places" prose; M0 mark-code fence; sin74 SCT trig; '
                                   '"1 × .../2" = 1/2 weave FS (ms-2020-06-01R-p10 + qp-p13)')

# ================= paper official-4mb1-01r-2020-11 / 01-2021-01 (zero-fix) =================
ZERO_FIX['offp_2020-11_01r_16'] = ('same class-set as 2020-06 01R q16: prose "to 2 decimal places", M0 mark-code '
                                   'fence, sin74 SCT, 1/2 weave FS (ms-2020-11-01R-p10 mapped; ctx decisive)')
ZERO_FIX['offp_2021-01_01_21'] = ('mark-code runs B1M1M0B1A0 (print-literal fence), angle-chase prose '
                                  '("Method 1/2", "leading to 70", "with reason"), no sup shapes '
                                  '(ms-2021-01-01-p15 mapped; ctx decisive)')
ZERO_FIX['offp_2021-01_01_7'] = ('problem = hexagon side labels (8/9/14/12 cm) FSW; solution "14 x 20 or 12 x 5" '
                                 'prose products, all FSW (qp-2021-01-01-p05)')

# ================= paper official-4mb1-02-2021-01 =================
E_P07_21 = 'ms-2021-01-02-p07-07.png (150dpi, READ)'
E_P15_21 = 'ms-2021-01-02-p15-15.png (150dpi, READ)'

FIXES += [
    # ---- q3 (offp_2021-01_02_3) — mp0==sol lockstep; MS p07 ----
    ('offp_2021-01_02_3', 'solutionMirror',
     '⎡⎣ SQ 2 = ⎤⎦ 402 + 602 (= 5200)',
     '⎡⎣ $SQ^2$ = ⎤⎦ $40^2$ + $60^2$ (= 5200)', 1,
     E_P07_21, 'SQ^2/40^2/60^2 flattened sups (p07 q3 row2: [SQ^2 =] 40^2 + 60^2 (= 5200))',
    ),
    ('offp_2021-01_02_3', 'solutionMirror',
     'M1 correct method to find SQ2 or SQ',
     'M1 correct method to find $SQ^2$ or SQ', 1,
     E_P07_21, 'SQ^2 (p07 Notes M1: correct method to find SQ^2 or SQ)',
    ),
    ('offp_2021-01_02_3', 'solutionMirror',
     '⎡⎣QT 2 = ⎤⎦ "5200"− 502 (= 2700)',
     '⎡⎣$QT^2$ = ⎤⎦ "5200"− $50^2$ (= 2700)', 1,
     E_P07_21, 'QT^2/50^2 flattened sups (p07 row3: [QT^2 =] "5200"− 50^2 (= 2700))',
    ),
    ('offp_2021-01_02_3', 'solutionMirror',
     'M1 correct method using their SQ2 to find QT2 or QT',
     'M1 correct method using their $SQ^2$ to find $QT^2$ or QT', 1,
     E_P07_21, 'SQ^2/QT^2 (p07 Notes M1: using their SQ^2 to find QT^2 or QT)',
    ),
    ('offp_2021-01_02_3', 'solutionMirror',
     'QT2 Allow for factorising out a square number from',
     '$QT^2$ Allow for factorising out a square number from', 1,
     E_P07_21, 'QT^2 (p07 Notes M1 indep: square number from their QT^2); "30 3"/"QT = 900 × 3" = 30√3 radical-flatten + sqrt-loss, disclosed leave',
    ),
    # ---- q10-c (offp_2021-01_02_10-c) — mp0==sol lockstep; MS p15 ----
    ('offp_2021-01_02_10-c', 'problem',
     'Cosine rule: a2 = b2 + c2 − 2bc cos A',
     'Cosine rule: $a^2$ = $b^2$ + $c^2$ − 2bc cos A', 1,
     E_P15_21, 'formula box GLUED flattened sups (10-c problem: a2 = b2 + c2 - 2bc cos A) — glued variant of the 12-b/10-b class',
    ),
    ('offp_2021-01_02_10-c', 'solutionMirror',
     'BM 2 = 62 + 62 − 2 × 6 × 6 × cos 70',
     '$BM^2$ = $6^2$ + $6^2$ − 2 × 6 × 6 × cos 70', 2,
     E_P15_21, 'BM^2/6^2 x4 flattened sups (p15 10(c) M1 row: BM^2 = 6^2+6^2-2x6x6xcos70, appears in eg-block AND Allow-block)',
    ),
    ('offp_2021-01_02_10-c', 'solutionMirror',
     'OP = 22 + 42 + 5.47 or OP = 62 + 4.58...2 − 31.58...',
     'OP = $2^2$ + $4^2$ + 5.47 or OP = $6^2$ + $4.58...^2$ − 31.58...', 1,
     E_P15_21, '2^2/4^2/6^2/4.58...^2 glued flattened sups (p15 M1 row: OP = sqrt(2^2+4^2+5.47) or sqrt(6^2+4.58...^2-31.58...); sqrt glyphs absent — disclosed leave)',
    ),
    ('offp_2021-01_02_10-c', 'solutionMirror',
     'Allow OP = 62 + 2.29...2 − 15.79...',
     'Allow OP = $6^2$ + $2.29...^2$ − 15.79...', 1,
     E_P15_21, '6^2/2.29...^2 glued flattened sups (p15 M1 Allow row)',
    ),
    # 10-c fences: leading '2 2' displaced-sup aggregation line (OP^2/2^2/4^2,
    # needs 3 sups, only 2 present) and the (2/3 BM)^2 composite weave — leave.
]

ZERO_FIX['offp_2021-01_02_8-a'] = 'kite side labels (6 cm/Figure 2) prose+FSW only (qp-2021-01-02-p16)'

# ================= paper official-4mb1-02r-2021-01 =================
E_P10_21R = 'ms-2021-01-02R-p10-10.png (150dpi, READ)'
E_P22_21R = 'ms-2021-01-02R-p22-22.png (150dpi, READ)'

FIXES += [
    # ---- q5-a (offp_2021-01_02r_5-a) — mp0==sol lockstep; MS p10 ----
    ('offp_2021-01_02r_5-a', 'solutionMirror',
     'BD2 = 10.62 + 9.22 − 2 (10.6 )(9.2 ) cos 65',
     '$BD^2$ = $10.6^2$ + $9.2^2$ − 2 (10.6 )(9.2 ) cos 65', 1,
     E_P10_21R, 'BD^2/10.6^2/9.2^2 flattened sups (p10 5(a) M1 row: BD^2 = 10.6^2+9.2^2-2(10.6)(9.2)cos65)',
    ),
    ('offp_2021-01_02r_5-a', 'solutionMirror',
     'find BD or BD2 allow once a',
     'find BD or $BD^2$ allow once a', 1,
     E_P10_21R, 'BD^2 (p10 Notes: Any correct method to find BD or BD^2 allow once a correct equation in BD is formed)',
    ),
    # ---- q11 (offp_2021-01_02r_11) — mp0==sol lockstep; MS p21/p22 ----
    ('offp_2021-01_02r_11', 'solutionMirror',
     '242 − 122 [ = 20.8]',
     '$24^2$ − $12^2$ [ = 20.8]', 2,
     E_P22_21R, '24^2/12^2 flattened sups x2 blocks (p21 main + p22 SC: sqrt(24^2-12^2) [= 20.8])',
    ),
    ('offp_2021-01_02r_11', 'solutionMirror',
     '482 − 242 [= 41.6]',
     '$48^2$ − $24^2$ [= 41.6]', 1,
     E_P22_21R, '48^2/24^2 flattened sups (p21 main block: sqrt(48^2-24^2) [= 41.6])',
    ),
    ('offp_2021-01_02r_11', 'solutionMirror',
     '122 − 62 [= 10.4]',
     '$12^2$ − $6^2$ [= 10.4]', 1,
     E_P22_21R, '12^2/6^2 flattened sups (p22 SC block: sqrt(12^2-6^2) [= 10.4])',
    ),
]

ZERO_FIX['offp_2021-01_02r_5-c'] = 'sine-rule SCT only (sin31/sin115) + prose (ms-p10 5(c) print verbatim)'
ZERO_FIX['offp_2021-01_02r_5-d'] = ('composite quadratic-in-BE weave ("10.7"^2 = BE^2+BE^2-2BExBExcos65 with '
                                    'displaced sups) = restructuring leave; rest SCT/FS (ms-2021-01-02R-p10 5(d))')
ZERO_FIX['offp_2021-01_02r_11-lead'] = ('"72 6"/"36 6" = length + marks-column 6 adjacency (p21/p22 print: '
                                        '"[Length of rectangle = ]72/36" + marks 6); "24 + 24 3"/"12 + 12 3" = '
                                        'radical-flatten (24+24√3, 12+12√3); NB prose lines; sin60 SCT')

# ================= paper official-4mb1-01-2021-06 =================
E_P13_21 = 'ms-2021-06-01-p13-13.png (150dpi, READ)'
E_P14_21 = 'ms-2021-06-01-p14-14.png (150dpi, READ)'

FIXES += [
    # ---- q18 (offp_2021-06_01_18) — mp0==sol lockstep; MS p13 ----
    ('offp_2021-06_01_18', 'solutionMirror',
     '252 + "18.496..."2 [ = 31.098...]',
     '$25^2$ + "18.496..."$^2$ [ = 31.098...]', 2,
     E_P13_21, '25^2/"18.496..."^2 flattened sups x2 (p13 Alt1 row + M2 note: [BD =] sqrt(25^2 + "18.496..."^2) [= 31.098...]; sqrt glyphs absent — disclosed leave)',
    ),
    # ---- q19 (offp_2021-06_01_19) — DIVERGED mirror; MS p14 ----
    ('offp_2021-06_01_19', 'solution',
     'eg 3x 2 = y 2 sin 60',
     'eg 3$x^2$ = $y^2$ sin 60', 1,
     E_P14_21, 'x^2/y^2 flattened sups (p14 19 M1dep row: sqrt3·x^2 = y^2 sin60; leading 3 = sqrt3 radical residue, sqrt glyph absent — radical-loss disclosed leave)',
    ),
    ('offp_2021-06_01_19', 'mirror',
     'eg 3x 2 = y 2 sin 60',
     'eg 3$x^2$ = $y^2$ sin 60', 1,
     E_P14_21, 'mirror of x^2/y^2 fix',
    ),
]

ZERO_FIX['offp_2021-06_01_6'] = '"between 5 and 25" prose (ms-2021-06-01-p07)'
ZERO_FIX['offp_2021-06_01_14'] = ('deleted-sup class: "( 4 + 4 ) + 15" print sqrt((4+4)^2+15^2) with 2s ABSENT from '
                                  'plane (re-insertion = F5d content reconstruction); sine-rule weaves FS; M1 mark codes')
ZERO_FIX['offp_2021-06_01_18-lead'] = ('Alt-2 cosine-rule denominator composite (sups displaced across 3 lines) = '
                                       'restructuring leave (p13 Alt2 print); 25tan57/tan33/tan57 trig furniture')
ZERO_FIX['offp_2021-06_01_19-lead'] = ('problem "AB = x 3 cm" = x√3 radical-flatten FENCE; 1/2·y²/√3·y² Heron/tan30 '
                                       'composites = FS fence; ratio lines radical-flatten (2x(1+√3):3y)')

# ================= paper official-4mb1-02-2021-06 =================
E_P25_21 = 'ms-2021-06-02-p25-25.png (150dpi, READ)'

FIXES += [
    # ---- q11-a (offp_2021-06_02_11-a) — mp0==sol lockstep; MS p25 ----
    ('offp_2021-06_02_11-a', 'solutionMirror',
     'AB 2 = AC 2 + 82 − 2 ( 8)( AC ) cos 35',
     '$AB^2$ = $AC^2$ + $8^2$ − 2 ( 8)( AC ) cos 35', 1,
     E_P25_21, 'AB^2/AC^2/8^2 flattened sups (p25 11(a) M1 Notes: AB^2 = AC^2 + 8^2 - 2(8)(AC)cos35; leading 4 = marks bleed)',
    ),
]

ZERO_FIX['offp_2021-06_02_11-a-lead'] = ('31 SCT trig cands (sin35/cos35/sin110) print-verbatim; area/sine-rule/Heron '
                                         'fraction weaves FS (p25 print has real fraction structure); problem labels FSW')

E_2R12 = 'ms-2018-06-02R-p12-12.png (150dpi, READ)'
E_2R13 = 'ms-2018-06-02R-p13-13.png (150dpi, READ)'
E_2R26Q = 'qp-2018-06-02R-p26-26.png (150dpi, READ)'
E_2R30Q = 'qp-2018-06-02R-p30-30.png (150dpi, READ)'

FIXES += [
    # ---- q11-a (offp_2018-06_02r_11-a) — mp0==sol lockstep; MS p12 ----
    ('offp_2018-06_02r_11-a', 'solutionMirror',
     "(AN =) 32 + 82 = '73'",
     "(AN =) $3^2$ + $8^2$ = '73'", 1,
     E_2R12, '3^2 + 8^2 flattened sups (p12 11(a) row2: sqrt(3^2+8^2)=sqrt(73); sqrt glyph absent — disclosed leave)',
    ),
    ('offp_2018-06_02r_11-a', 'solutionMirror',
     'AO 2 )"5.10..."2=\n+ 82 ( 90.049...) oe',
     '$AO^2$ )"5.10..."$^2$=\n+ $8^2$ ( 90.049...) oe', 1,
     E_2R12, 'AO^2 + "5.10..."^2 + 8^2 flattened sups (p12 M1 alt row: (AO^2 =)"5.10..."^2+8^2 (=90.049...); digit-base sups quoted-base form)',
    ),
    ('offp_2018-06_02r_11-a', 'solutionMirror',
     "(AO=) ' 4.129 '2 + '73' M1 or (AO =) \"5.10...\"2 + 82 oe",
     "(AO=) ' 4.129 '$^2$ + '73' M1 or (AO =) \"5.10...\"$^2$ + $8^2$ oe", 1,
     E_2R12, '4.129..^2 / "5.10..."^2 / 8^2 flattened sups (p12 11(a) rows 4-5: sqrt(4.129..^2+73), sqrt("5.10..."^2+8^2))',
    ),
    # ---- q11-b (offp_2018-06_02r_11-b) — DIVERGED mirror; MS p12 ----
    ('offp_2018-06_02r_11-b', 'solution',
     'or "94.249.."− 32',
     'or "94.249.."− $3^2$', 1,
     E_2R12, '3^2 flattened sup (p12 11(b) M1oe row: sqrt("94.249.."− 3^2); sqrt glyph absent — disclosed leave)',
    ),
    ('offp_2018-06_02r_11-b', 'mirror',
     'or "94.249.."− 32',
     'or "94.249.."− $3^2$', 1,
     E_2R12, 'mirror of 3^2 fix',
    ),
    ('offp_2018-06_02r_11-b', 'solution',
     '∠ = tan −1 oe',
     '∠ = tan$^{-1}$ oe', 1,
     E_2R12, 'tan^-1 flattened inverse (p12 11(b) last M1 row: angle = tan^-1(9.233../8)) — CATCH-ALL inverse-trig class',
    ),
    ('offp_2018-06_02r_11-b', 'mirror',
     '∠ = tan −1 ⎜ ⎟ oe',
     '∠ = tan$^{-1}$ ⎜ ⎟ oe', 1,
     E_2R12, 'mirror tan^-1 (big-paren glyph arrangement differs from solution — independent fix)',
    ),
    # ---- q12-b (offp_2018-06_02r_12-b) — DIVERGED mirror; MS p13 + QP p30 ----
    ('offp_2018-06_02r_12-b', 'problem',
     'Cosine rule: a 2 = b 2 + c 2 − 2bc cos A',
     'Cosine rule: $a^2$ = $b^2$ + $c^2$ − 2bc cos A', 1,
     E_2R30Q, 'cosine-rule formula line flattened sups (print qp p30 formula box: a^2 = b^2 + c^2 - 2bc cos A) — 7-b wave-1 class',
    ),
    ('offp_2018-06_02r_12-b', 'solution',
     '⎛ 82 + 142 − 122 ⎞',
     '⎛ $8^2$ + $14^2$ − $12^2$ ⎞', 1,
     E_2R13, 'numerator 8^2/14^2/12^2 (p13 12(b) M1 CAB row: (8^2+14^2-12^2)/(2x8x14))',
    ),
    ('offp_2018-06_02r_12-b', 'solution',
     '⎛ 142 + 122 − 82 ⎞',
     '⎛ $14^2$ + $12^2$ − $8^2$ ⎞', 1,
     E_2R13, 'numerator sups (p13 ABC row: (14^2+12^2-8^2)/(2x14x12))',
    ),
    ('offp_2018-06_02r_12-b', 'solution',
     '⎛ 82 + 122 − 142 ⎞',
     '⎛ $8^2$ + $12^2$ − $14^2$ ⎞', 1,
     E_2R13, 'numerator sups (p13 ACB row: (8^2+12^2-14^2)/(2x8x12))',
    ),
    ('offp_2018-06_02r_12-b', 'solution',
     'CAB = cos −1 (=58.8°)or',
     'CAB = cos$^{-1}$ (=58.8°)or', 1,
     E_2R13, 'cos^-1 flattened inverse (p13 CAB row) — CATCH-ALL inverse-trig class',
    ),
    ('offp_2018-06_02r_12-b', 'solution',
     'ABC = cos −1 (=34.77°)or',
     'ABC = cos$^{-1}$ (=34.77°)or', 1,
     E_2R13, 'cos^-1 (p13 ABC row)',
    ),
    ('offp_2018-06_02r_12-b', 'solution',
     'ACB = cos −1 (=86.4°)',
     'ACB = cos$^{-1}$ (=86.4°)', 1,
     E_2R13, 'cos^-1 (p13 ACB row)',
    ),
    ('offp_2018-06_02r_12-b', 'mirror',
     '⎛ 82 + 142 − 122 ⎞',
     '⎛ $8^2$ + $14^2$ − $12^2$ ⎞', 1,
     E_2R13, 'mirror of numerator fix',
    ),
    ('offp_2018-06_02r_12-b', 'mirror',
     '⎛ 142 + 122 − 82 ⎞',
     '⎛ $14^2$ + $12^2$ − $8^2$ ⎞', 1,
     E_2R13, 'mirror',
    ),
    ('offp_2018-06_02r_12-b', 'mirror',
     '⎛ 82 + 122 − 142 ⎞',
     '⎛ $8^2$ + $12^2$ − $14^2$ ⎞', 1,
     E_2R13, 'mirror',
    ),
    ('offp_2018-06_02r_12-b', 'mirror',
     'CAB = cos −1 ⎜ ⎟ (=58.8°)or',
     'CAB = cos$^{-1}$ ⎜ ⎟ (=58.8°)or', 1,
     E_2R13, 'mirror cos^-1 (⎜⎟ arrangement)',
    ),
    ('offp_2018-06_02r_12-b', 'mirror',
     'ABC = cos −1 ⎜ ⎟ (=34.77°)or',
     'ABC = cos$^{-1}$ ⎜ ⎟ (=34.77°)or', 1,
     E_2R13, 'mirror cos^-1',
    ),
    ('offp_2018-06_02r_12-b', 'mirror',
     'ACB = cos −1 ⎜ ⎟ (=86.4°)',
     'ACB = cos$^{-1}$ ⎜ ⎟ (=86.4°)', 1,
     E_2R13, 'mirror cos^-1',
    ),
]
