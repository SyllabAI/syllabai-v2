#!/usr/bin/env python3
r"""run-028 tranche-2 wave-5 FIXES (eyes-on-adjudicated, NO-GUESS).

Wave-5 worklist of record: 58 units (run027_w5_continuation.json; candidates joined
from run026_w3_worklist.json — classification of record — and re-located against
plane pin edbe22de25724627 by run028_w5_plan.py: 550/550 tokens found, 0 drift,
0 anomalies). This run discharges 19 units (10 fix / 9 zero-fix), files wave-6 = 39.

Every fix verified against the MS/QP page of record rendered @150dpi and READ
first-hand this run (18 page reads; no zoom crops needed — all tokens legible).
Evidence PNGs: scratch/oeq_run028/pages/ (13 planned + 5 needle-located).

Tuple: (pid, field, old, new, exp, evidence, note)
  field: 'solutionMirror' (solutionMd + lockstep mp0, byte-equality pre-checked)
       | 'solution' | 'mirror' (markPoints[0].textMd) | 'problem'
  exp  : expected occurrence count (fail-closed; exp!=1 replaces ALL)
ORDER MATTERS for sequence-dependent tuples (battery applies in list order).

Fences honored (run-024/025/026/027 law): radical-flatten LEAVE (8 3 = 8√3 class,
12ξ3 ξ-glyph, 6 3, 12 3, 4 3, 48 3); sqrt-loss LEAVE + disclose (√ over
19.5²−18² / 15²−8² / 12²−"6"² / 6.5²−(12sin30)² / 19.5²−"10"² / 432−407 / "34");
deleted-sup INSIDE weave walls LEAVE ((AC/2)² row of 23-b, EN 36/2 weave);
displaced-sup aggregates LEAVE; fraction weaves (FS, run-004 R4-A) LEAVE;
formula-sheet QP fleet class FENCED (run-027 disclosure: a 2 = b 2 + c 2 − 2bc
cos A / 2n 4 / a b c sin A sin B boilerplate) LEAVE pending operator ruling;
print-literal mark-code runs LEAVE; furniture (prose adjacency, diagram label
runs, answer/marks-column bleeds, trig angles SCT) ZERO-FIX with page/ctx
evidence. CATCH-ALLS (run-025 law, print-verified, counted in notes):
23-b 19.52/"10"2 x2 rows (w3 scan missed the digit-glued forms; ms p19 READ).
"""

FIXES = [
    # ================= paper official-4mb1-02r-2020-06 (twin A) =================
    # ---- q9-a (offp_2020-06_02r_9-a) — problem-side only; lockstep mirror untouched ----
    ('offp_2020-06_02r_9-a', 'problem',
     '4y2', '$4y^2$', 1,
     'qp-2020-06-4mb1-02r-p22-22.png (150dpi, READ)',
     '4y² glued sup in Show-that clause (print "Show that 4y² − x² = 200"); '
     'diagram-label run (P 2x x 2y A 6y – 3 B 4y + 4 Q 2x + 4 R) + Figure-2 adjacency furniture discharged'),
    # ================= paper official-4mb1-02r-2020-11 (twin B, identical print/barcode) =================
    ('offp_2020-11_02r_9-a', 'problem',
     '4y2', '$4y^2$', 1,
     'qp-2020-11-4mb1-02r-p22-22.png (150dpi, READ)',
     'TWIN lockstep of 2020-06 02r 9-a (identical print, barcode P62019A02236 both pages)'),
    # ================= paper official-4mb1-01r-2023-06 =================
    # ---- q23-a (offp_2023-06_01r_23-a) — lockstep mirror 461/461 — MS p19 ----
    ('offp_2023-06_01r_23-a', 'solutionMirror',
     'ON 2', '$ON^2$', 3,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     'ON² spaced sup x3 (M1 row x2 + A1 row "ON² = 56.25 ⇒ ON= 7.5"; print-verified)'),
    ('offp_2023-06_01r_23-a', 'solutionMirror',
     '19.52', '$19.5^2$', 3,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     '19.5² glued sup x3 (M1 row x2 + answer row); √ over answer row = sqrt-loss fence LEAVE'),
    ('offp_2023-06_01r_23-a', 'solutionMirror',
     '182', '$18^2$', 3,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     '18² glued sup x3 (M1 row x2 + answer row); √ fence LEAVE'),
    ('offp_2023-06_01r_23-a', 'solutionMirror',
     '392', '$39^2$', 3,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     '39² glued sup x3 ("or 392 − 362" + "Allow XD = 392 − 362 where BX is the diameter" + A1 (√(39²−36²))/2 row); '
     '√ fences LEAVE; ( ) weave furniture LEAVE'),
    ('offp_2023-06_01r_23-a', 'solutionMirror',
     '362', '$36^2$', 3,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     '36² glued sup x3 (same rows); √ fences LEAVE'),
    # ---- q23-b (offp_2023-06_01r_23-b) — lockstep mirror 1092/1092 — MS p19 ----
    ('offp_2023-06_01r_23-b', 'solutionMirror',
     'AM 2', '$AM^2$', 1,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     'AM² spaced sup (M1 "[AM² =] 19.5² − \\"10\\"² [= 280.25]" print-verified)'),
    ('offp_2023-06_01r_23-b', 'solutionMirror',
     '19.5 – "10" [ = 280.25]', '$19.5^2$ – "10"$^2$ [ = 280.25]', 1,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     'deleted-sup pair restored print-verbatim (19.5² / "10"²; clean row, tokens map 1:1, '
     'run-027 z_p8note deleted-sup-verbatim precedent)'),
    ('offp_2023-06_01r_23-b', 'solutionMirror',
     '19.52', '$19.5^2$', 2,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     'CATCH-ALL (w3 scan missed digit-glued forms): 19.5² glued x2 ("[AC] = 2 × 19.52 − \\"10\\"2" M1dep row '
     '+ "from 19.52 – \\"10\\"2" A1-notes row); √ over the M1dep row = sqrt-loss fence LEAVE'),
    ('offp_2023-06_01r_23-b', 'solutionMirror',
     '"10"2', '"10"$^2$', 2,
     'ms-2023-06-4mb1-01r-p19-19.png (150dpi, READ)',
     'CATCH-ALL: "10"² glued quoted sup x2 (same rows, run-027 \\"16\\"$^2$ convention); '
     '(AC/2)² weave row + 7.5² deleted-sup LEAVE + disclose (content-loss class)'),
    # ---- q21-b (offp_2023-06_01r_21-b) — lockstep mirror 503/503 — MS p17 ----
    ('offp_2023-06_01r_21-b', 'solutionMirror',
     'eg 3 = 160 + 13 − 2 × 160 ×13cosGAF',
     'eg 3$^2$ = 160 + $13^2$ − 2 × 160 ×13cosGAF', 1,
     'ms-2023-06-4mb1-01r-p17-17.png (150dpi, READ)',
     'deleted-sup pair restored print-verbatim (print "eg 3² = 160 + 13² − 2 × √160 × 13 cos GAF"); '
     '√160 radical-loss + \\" 160 \\" quoted √-loss + spacing ×13cosGAF LEAVE + disclose'),
    # ================= paper official-4mb1-01-2022-06 =================
    # ---- q24 (offp_2022-06_01_24) — DIVERGED sol 1434 / m0 1438 — MS p20 ----
    ('offp_2022-06_01_24', 'solution',
     'BN = 122 − "6"2', 'BN = $12^2$ − "6"$^2$', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'anchored double sup (print "BN = √(12² − \\"6\\"²) (6√3 = 10.39…)"); √ + (6 3 = 6√3) radical fences LEAVE'),
    ('offp_2022-06_01_24', 'solution',
     'AN = 6.52 − (12sin 30)²', 'AN = $6.5^2$ − (12sin 30)²', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     '6.5² glued sup; (12sin 30)² already real ² in sol; √ fence LEAVE'),
    ('offp_2022-06_01_24', 'solution',
     'sin −1', 'sin$^{-1}$', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'CATCH-ALL inverse-trig class (run-025 law): print "A = sin⁻¹(12sin30/6.5)(= 67.3(8...))"; '
     '⎛⎝6.5⎠ fraction weave LEAVE'),
    ('offp_2022-06_01_24', 'solution',
     'AB2', '$AB^2$', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'AB² glued sup (Alt row "AB² − 12√3AB + 101.75 (= 0)"); 12ξ3 ξ-glyph radical fence LEAVE + disclose'),
    ('offp_2022-06_01_24', 'solution',
     'Alt 6.5 = AB + 12 – 2 × AB × 12 × cos 30',
     'Alt $6.5^2$ = $AB^2$ + $12^2$ – 2 × AB × 12 × cos 30', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'deleted-sup aggregate restored print-verbatim 1:1 (Tier-B class, clean Alt row; print '
     '"6.5² = AB² + 12² − 2 × AB × 12 × cos 30"); trailing marks bleed 6 LEAVE'),
    ('offp_2022-06_01_24', 'mirror',
     'BN = 122 − "6"2', 'BN = $12^2$ − "6"$^2$', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'mirror-side independent fix (diverged field: m0 carries same flattened rows)'),
    ('offp_2022-06_01_24', 'mirror',
     'AN = 6.52 − (12sin 30)2', 'AN = $6.5^2$ − (12sin 30)$^2$', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'mirror-side flattened (12sin 30)2 (sol has real ²) — both sups restored per print'),
    ('offp_2022-06_01_24', 'mirror',
     'sin −1', 'sin$^{-1}$', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'mirror-side inverse-trig (m0 keeps its ⎜ ⎟ bracket variant)'),
    ('offp_2022-06_01_24', 'mirror',
     'AB2', '$AB^2$', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'mirror-side AB² glued sup'),
    ('offp_2022-06_01_24', 'mirror',
     'Alt 6.5 = AB + 12 – 2 × AB × 12 × cos 30',
     'Alt $6.5^2$ = $AB^2$ + $12^2$ – 2 × AB × 12 × cos 30', 1,
     'ms-2022-06-4mb1-01-p20-20.png (150dpi, READ)',
     'mirror-side deleted-sup aggregate restoration (same print row)'),
    # ================= paper official-4mb1-01-2022-01 =================
    # ---- q4 (offp_2022-01_01_4) — lockstep mirror 230/230 — MS p6 needle-located ----
    ('offp_2022-01_01_4', 'solutionMirror',
     '[ AC =] 152 − 82 [ = 12.7]', '[ AC =] $15^2$ − $8^2$ [ = 12.7]', 1,
     'ms-2022-01-4mb1-01-p06-6.png (150dpi, READ; needle-located — unit had no mapped ms page)',
     'anchored double sup (print "[AC =] √(15² − 8²) [= 12.7]"); √ fence + sine-rule weave LEAVE'),
    # ---- q10 (offp_2022-01_01_10) ZERO-FIX ms p8; q26 (offp_2022-01_01_26) ZERO-FIX qp p22 ----
    # ================= paper official-4mb1-02-2022-01 =================
    # ---- q9 (offp_2022-01_02_9) — lockstep mirror 1802/1802 — MS p13 + QP p18 ----
    ('offp_2022-01_02_9', 'solutionMirror',
     '"48.01"2', '"48.01"$^2$', 2,
     'ms-2022-01-4mb1-02-p13-13.png (150dpi, READ)',
     '"48.01"² glued quoted sup x2 (AC² M1 row + AC √-row); √ over AC-row = sqrt-loss fence LEAVE'),
    ('offp_2022-01_02_9', 'solutionMirror',
     '"64.335"2', '"64.335"$^2$', 2,
     'ms-2022-01-4mb1-02-p13-13.png (150dpi, READ)',
     '"64.335"² glued quoted sup x2 (same rows)'),
    ('offp_2022-01_02_9', 'solutionMirror',
     'AC 2', '$AC^2$', 1,
     'ms-2022-01-4mb1-02-p13-13.png (150dpi, READ)',
     'AC² spaced sup (⎡⎣ AC 2 = ⎤⎦ M1 row; print-verified)'),
    ('offp_2022-01_02_9', 'solutionMirror',
     '"48.01" 2', '"48.01"$^2$', 4,
     'ms-2022-01-4mb1-02-p13-13.png (150dpi, READ)',
     '"48.01"² SPACED quoted sup variant x4 (cos∠CAB / cos∠ACB numerator rows + ∠ACB-cos row; '
     'print "48.01"²; new spaced-variant of the run-027 glued class)'),
    ('offp_2022-01_02_9', 'solutionMirror',
     '"76.8" 2', '"76.8"$^2$', 4,
     'ms-2022-01-4mb1-02-p13-13.png (150dpi, READ)',
     '"76.8"² spaced quoted sup x4 (same rows)'),
    ('offp_2022-01_02_9', 'solutionMirror',
     '"64.3" 2', '"64.3"$^2$', 4,
     'ms-2022-01-4mb1-02-p13-13.png (150dpi, READ)',
     '"64.3"² spaced quoted sup x4 (same rows); (30/sin32)² weave walls + tan/sin trig + prose LEAVE'),
    # ================= paper official-4mb1-02-2025-11 =================
    # ---- q4-a (offp_2025-11_02_4-a) — problem-side; lockstep mirror untouched — QP p8 ----
    ('offp_2025-11_02_4-a', 'problem',
     'ADC 56° ABC BAD 90°', '∠ADC = 56° ∠ABC = ∠BAD = 90°', 1,
     'qp-2025-11-4mb1-02-p08-8.png (150dpi, READ)',
     '∠ + = operator restoration (print "∠ADC = 56°  ∠ABC = ∠BAD = 90°"; run-027 11-d class + '
     'run-017 ∠ class, tokens map 1:1); diagram label runs (21.7 cm 56° A D 34.9 cm / r cm Q 72° r cm O) '
     'weave furniture LEAVE; MS-side tan 34/tan 56 SCT rows zero-fix'),
    ('offp_2025-11_02_4-a', 'problem',
     'POQ 72° Given', '∠POQ = 72° Given', 1,
     'qp-2025-11-4mb1-02-p08-8.png (150dpi, READ)',
     '∠ + = restoration (print "∠POQ = 72°"; the diagram-label "Q 72°" run separately discharged)'),
    # ================= paper official-4mb1-02-2026-06 =================
    # ---- q5-b (offp_2026-06_02_5-b) — lockstep mirror 1599/1599 — MS p12 needle-located + QP p12 ----
    ('offp_2026-06_02_5-b', 'solutionMirror',
     'EG2', '$EG^2$', 1,
     'ms-2026-06-4mb1-02-p12-12.png (150dpi, READ; needle-located — unit had no mapped ms page)',
     'EG² glued sup (Alt-2 M1 note "find EG or EG² in terms of x"; ∠DEG row already carries real ∠); '
     'QP formula-sheet fleet fence (2n 4 / a b c sin A sin B) + Alt-1 fsw weaves + marks bleeds LEAVE'),
]

# ---- zero-fix discharges (page-evidenced or ctx-class-cited per run-025 law) ----
ZERO_FIX = {
    'offp_2022-01_01_10':
        'PAGE-EVIDENCED ms-2022-01-4mb1-01-p08-8.png (READ): plane "AD = BC and ∠BAD = ∠ABC are given 3 Accept…" '
        'matches print row-for-row; "given 3" = marks-column bleed (B1/M1/A1 structure); no sup/operator loss',
    'offp_2022-01_01_26':
        'PAGE-EVIDENCED qp-2022-01-4mb1-01-p22-22.png (READ) + ctx-class: "8 3" = 8√3 radical-flatten fence '
        '(run-025 named class, print shows real √); solution side 4 3 / 48 3 / 8 3 same fence + SCT tan30/sin60 '
        '+ ⎛⎞ fraction weaves + marks bleeds',
    'offp_2024-11_01_4':
        'PAGE-EVIDENCED ms-2024-11-4mb1-01-p06-6.png (READ): "276 − 180 or 90 + (276 − 270)" bearing prose, '
        '"096 for 096 accept 96" A1 note; candidates = prose adjacency (or 90 / or 2 / at 96) + M0 markcode',
    'offp_2025-06_02_9-a':
        'CTX-CLASS (run-025 law): all 38 candidates SCT trig (sin/cos/tan 30/60/120) or fsw fraction weaves '
        'or Figure-3 prose adjacency; no sup/operator token present',
    'offp_2025-06_02_9-b':
        'CTX-CLASS: "34" = √34 sqrt-loss fence; "a b c 2bc cos A 2 2 2" = formula-sheet FLEET fence (run-027 '
        'disclosure, operator ruling pending); remaining candidates prose adjacency (2nd/4th/5th marks refs) + A0 markcode',
    'offp_2026-06_02_7-c':
        'CTX-CLASS: all candidates prose adjacency ("at least 1", "wr"=awrt fragment, "98.1 and 45" prose) '
        '+ marks-column bleeds ("Rotation 4"); no math token',
    'offp_2024-06_02r_2-b':
        'CTX-CLASS: all candidates prose adjacency ("eg 17x", "or 7x", "and 10x", "eg 7Tx", "on 1 side") '
        'around intact equations; no sup/operator token',
    'offp_2021-01_01r_19':
        'CTX-CLASS: "[AB²=] 5² + 5² ˗ 2 × 5 × cos126" already carries real sups; remaining candidates SCT trig '
        '(sin 63 / cos 27 / cos126) + "by 2" prose adjacency',
    'offp_2023-01_02_9-a':
        'CTX-CLASS: problem-side diagram label run ("13 cm 5 cm K I F 20 cm 12 cm H" — weave wall) + '
        'solution prose ("all 3 rectangular sides", "at least 2"); no sup/operator token',
}
