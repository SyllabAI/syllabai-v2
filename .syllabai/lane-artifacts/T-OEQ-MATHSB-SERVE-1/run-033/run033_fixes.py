#!/usr/bin/env python3
r"""run-033 tranche-2 wave-6 FIXES (eyes-on-adjudicated, NO-GUESS).

Wave-6 worklist of record: 39 units (run028_w6_continuation.json; candidates joined
from run028_w5_worklist.json and re-located against plane pin bd6f21eab951639e by
run033_w6_plan.py: 0 anomalies, 0 drift). This run discharges ALL 39 units
(22 fix / 17 zero-fix) per the operator order "wave-6 token continuation (39 units)"
trace 1a1900ceaa855731.

Every fix verified against the MS/QP page of record rendered @150dpi (12 contact
sheets, 59 crop groups / 347 candidate tokens) + 300dpi zoom verification for the
ambiguous rows (zoom-1/2/3: 2021-11 02 6-b quoted forms, 2022-06 02r 2 AC²-not-4C²,
2024-06 01r 12 "39.69 + 39.69²" PRINT-LITERAL quirk kept verbatim, 2018-06 01 27
9x² row, 2025-06 02r 10-b ("7.96…")² rows, 2024-06 01r 25 ms p23 rows) and the five
∠-restoration data lines (supp-1). Evidence PNGs: scratch/oeq_run033/pages/ +
sheets/.

Tuple: (pid, field, old, new, exp, evidence, note)
  field: 'solutionMirror' (solutionMd + lockstep mp0 — ALL 21 solution-side pids are
         byte-identical lockstep, verified pre-write) | 'problem'
  exp  : expected occurrence count (fail-closed; exp!=1 replaces ALL)
ORDER MATTERS for sequence-dependent tuples (battery applies in list order).

Fences honored (run-024/025/026/027/028 law):
- radical-flatten / √-loss LEAVE + disclose (√ over fixed sup rows: 2022-01 02r 11-b
  √(15²+15²−…), 2024-06 01r 25 AC=√(11²+8²−…), 2026-06 01 17 [AF=]√(10²−4²)/√(10²+4²−…),
  2025-06 01r 25 √(6²+6²)/√(134−6²)/√72=6√2/3√2/7√2/8√2 quoted-value forms,
  2021-11 02 6-b √82/3√34, 2022-01 01r 19 √299, 2025-06 02r 7-c √(4²+2²), 2√5);
- deleted-sup INSIDE weave walls LEAVE (2023-01 01 26-a/b ( )² walls + standalone 2
  lines; 2025-06 01r 25 "6 + 62" first-6 deleted ²; 2025-06 02r 10-b ("10.62…") wall
  row; 2026-06 02r 5 "x − 15x + 15 = 0⏎2" wall);
- fraction weaves (FS, run-004 R4-A) LEAVE (2021-11 01 20 BC 3/BC 4, 2020-01 01r 17
  AD/DC/20 20, 2024-06 01r 12 6.3/6.3·AC/AC, 2023-11 01 20 35−16/4 …);
- QP formula-sheet FLEET class FENCED (run-027 fence STANDS — operator ruling still
  pending): 2025-06 02r 3-b "(2n − 4)" tokens; 2021-11 02 6-b problemMd "a 2 b 2 c 2
  2bc cos A" box; 2025-06 02r 10-b problemMd "a b c 2bc cos A 2 2 2" box;
- mark-code runs LEAVE (M1/A1/B1/B2/M2/M3/M4/SC3 print-literal);
- furniture (prose adjacency, diagram label runs incl. 2026-06 01 17 "D E 45° C 85°"
  reconstruction line + 2024-06 01r 25 "Diagram NOT 115°" line, answer/marks-column
  bleeds, SCT trig arguments) ZERO-FIX with page/ctx evidence;
- print-literal quirks KEPT verbatim: 2024-06 01r 12 "39.69 + 39.69²" (the MS itself
  prints 39.69²; restored AS PRINTED to $39.69^2$ — disclosed);
- °-flatten ("sin 50o", 2020-01 01r 17) LEAVE + disclose — ° loss is its own defect
  class, outside the wave-6 token-class scope, disclosed for the F5/census lane;
- inverse-trig inside weave soup ("tan −1 12/5", 2021-11 02 6-b; "sin −1" fragments,
  2024-06 01r 25 √-weave row) LEAVE + disclose (weave-context; the run-028 sin⁻¹
  catch-all was a clean row — these are wall-soup rows).
"""

FIXES = [
    # ================= ∠-operator restorations (run-017 ∠ class + run-027 11-d + run-028 4-a) =================
    ('offp_2026-06_01_17', 'problem',
     'FAB 90°', '∠FAB = 90°', 1,
     'qp-2026-06-4mb1-01-p13 (supp-1, READ 150dpi)',
     '∠FAB = 90° data line lost ∠ and =; siblings "AB = 4 cm BC = 13 cm FB = 10 cm" kept their =; '
     'diagram reconstruction line "D E 45° C 85° A B F" = label run furniture LEAVE'),
    ('offp_2026-06_01_22', 'problem',
     'ODC 30°', '∠ODC = 30°', 1,
     'qp-2026-06-4mb1-01-p18 (supp-1, READ)',
     '∠ODC = 30° data line lost ∠ and =; "CO = 8 cm" sibling kept ='),
    ('offp_2024-06_01r_12', 'problem',
     'BAC 90°', '∠BAC = 90°', 1,
     'qp-2024-06-4mb1-01R-p8 (supp-1, READ)',
     '∠BAC = 90° data line lost ∠ and =; "AB = AC" sibling kept ='),
    ('offp_2024-06_01r_13', 'problem',
     'PQR 90°', '∠PQR = 90°', 1,
     'qp-2024-06-4mb1-01R-p9 (supp-1, READ)',
     '∠PQR = 90° data line lost ∠ and ='),
    ('offp_2024-06_01r_13', 'problem',
     'PRQ 40°', '∠PRQ = 40°', 1,
     'qp-2024-06-4mb1-01R-p9 (supp-1, READ)',
     '∠PRQ = 40° data line lost ∠ and ='),
    ('offp_2026-06_02r_6-a', 'problem',
     'BDC 45°', '∠BDC = 45°', 1,
     'qp-2026-06-4mb1-02R-p14 (supp-1, READ)',
     '∠BDC = 45° data line lost ∠ and =; parts (b)/(c) ∠BAD/∠BAF intact in plane'),
    ('offp_2026-06_02r_6-a', 'problem',
     'ABC 85°', '∠ABC = 85°', 1,
     'qp-2026-06-4mb1-02R-p14 (supp-1, READ)',
     '∠ABC = 85° data line lost ∠ and =; diagram line "D E 45° C 85° A B F" label run LEAVE'),
    # ================= offp_2024-06_01_13 (ms p13 READ, sheet-03 crop-4) =================
    ('offp_2024-06_01_13', 'solutionMirror',
     '82 + r 2 = R 2 OR OD 2 = OA2 − 82',
     '$8^2$ + $r^2$ = $R^2$ OR $OD^2$ = $OA^2$ − $8^2$', 1,
     'ms-2024-06-4mb1-01-p13 (sheet-03, READ)',
     'print "8² + r² = R² OR OD² = OA² − 8²"; glued 82/OA2 + spaced r 2/R 2/OD 2'),
    ('offp_2024-06_01_13', 'solutionMirror',
     'Area = π ( 82 + r 2 ) − π r 2 or',
     'Area = π ( $8^2$ + $r^2$ ) − π$r^2$ or', 1,
     'ms-2024-06-4mb1-01-p13 (sheet-03, READ)',
     'print "Area = π(8² + r²) − πr² or"'),
    ('offp_2024-06_01_13', 'solutionMirror',
     'for substituting in for R2 or r2 to eliminate',
     'for substituting in for $R^2$ or $r^2$ to eliminate', 1,
     'ms-2024-06-4mb1-01-p13 (sheet-03, READ)',
     'print "for substituting in for R² or r² to eliminate one variable" (M1 note prose)'),
    ('offp_2024-06_01_13', 'solutionMirror',
     'π ( R 2 ) − π ( R 2 − 82 ) oe',
     'π ( $R^2$ ) − π ( $R^2$ − $8^2$ ) oe', 1,
     'ms-2024-06-4mb1-01-p13 (sheet-03, READ)',
     'print "π(R²) − π(R² − 8²) oe"'),
    ('offp_2024-06_01_13', 'solutionMirror',
     'Allow 82 π dep on both previous M marks',
     'Allow $8^2$π dep on both previous M marks', 1,
     'ms-2024-06-4mb1-01-p13 (sheet-03, READ)',
     'print "Allow 8²π dep on both previous M marks"'),
    # ================= offp_2023-01_01_26-a (ms p25 READ, sheet-02 crop-3) =================
    ('offp_2023-01_01_26-a', 'solutionMirror',
     'find AD2 or', 'find $AD^2$ or', 1,
     'ms-2023-01-4mb1-01-p25 (sheet-02, READ)',
     'print "A correct method to find AD² or AD =15√2"; "15 2" = 15√2 √-loss fence LEAVE; '
     '( )+()² walls flattened LEAVE'),
    ('offp_2023-01_01_26-a', 'solutionMirror',
     'find AB2 or AB', 'find $AB^2$ or AB', 1,
     'ms-2023-01-4mb1-01-p25 (sheet-02, READ)',
     'print "A correct method to find AB² or AB"; "15 2 " quoted √-loss + 10³ radical-mis-map fence LEAVE'),
    ('offp_2023-01_01_26-a', 'solutionMirror',
     '⎡⎣ AB 2 = ⎤⎦ 10 3', '⎡⎣ $AB^2$ = ⎤⎦ 10 3', 1,
     'ms-2023-01-4mb1-01-p25 (sheet-02, READ)',
     'print "[AB² =](10√3)² + ("15√2"²) − 2×10√3×"15√2"×cos60"; BC² label sup restored 1:1, '
     'wall (10√3)² exponents = standalone-2 lines LEAVE'),
    # ================= offp_2023-01_01_26-b (ms p25 READ, sheet-02 crop-2) =================
    ('offp_2023-01_01_26-b', 'solutionMirror',
     'find BC2 or BC = 15', 'find $BC^2$ or BC = 15', 1,
     'ms-2023-01-4mb1-01-p25 (sheet-02, READ)',
     'print "A correct method to find BC² or BC = 15"'),
    ('offp_2023-01_01_26-b', 'solutionMirror',
     '⎡⎣ BC 2 = ⎤⎦ 10 3 − 5 3 [= 225]', '⎡⎣ $BC^2$ = ⎤⎦ 10 3 − 5 3 [= 225]', 1,
     'ms-2023-01-4mb1-01-p25 (sheet-02, READ)',
     'print "[BC² =](10√3)² − (5√3)² [= 225]"; √-loss "10 3"/"5 3" fence LEAVE'),
    ('offp_2023-01_01_26-b', 'solutionMirror',
     '"19.5595..."2 = 5 15', '"19.5595..."$^2$ = 5 15', 1,
     'ms-2023-01-4mb1-01-p25 (sheet-02, READ)',
     'print "eg "19.5595…"² = (5√15)² + "15"² − 2×5√15×"15"cos∠ACB"; quoted-glued sup '
     '(run-027 "16"2 class); "5 15" = 5√15 √-loss fence LEAVE'),
    ('offp_2023-01_01_26-b', 'solutionMirror',
     '"19.559..."2 + "15"2 − 5 15', '"19.559..."$^2$ + "15"$^2$ − 5 15', 1,
     'ms-2023-01-4mb1-01-p25 (sheet-02, READ)',
     'print "cos∠CBA = ("19.559…"² + "15"² − (5√15)²)/(2×"19.559…"×"15")"; quoted-glued sups'),
    # ================= offp_2024-06_01_3 (ms p7 READ, supp-2 crop-1) =================
    ('offp_2024-06_01_3', 'solutionMirror',
     'Or 8.72 = AB 2 + (12 − 6 )', 'Or $8.7^2$ = $AB^2$ + (12 − 6 )$^2$', 1,
     'ms-2024-06-4mb1-01-p7 (supp-2, READ 150dpi)',
     'print "Or 8.7² = AB² + (12−6)²"; glued 8.72 + spaced AB 2 + deleted-sup (12−6)² restored '
     'print-verbatim (clean row, run-027 z_p8note precedent); second "(12 − 6 )" ("Allow using '
     'their h = (12 − 6 )") has NO ² in print — untouched via the anchored tuple'),
    ('offp_2024-06_01_3', 'solutionMirror',
     'AB 2 = 62 + 8.72 − 2 × 6 × 8.7 × cos"46.39..."',
     '$AB^2$ = $6^2$ + $8.7^2$ − 2 × 6 × 8.7 × cos"46.39..."', 1,
     'ms-2024-06-4mb1-01-p7 (supp-2, READ)',
     'print "AB² = 6² + 8.7² − 2×6×8.7×cos"46.39…""'),
    # ================= offp_2018-06_01_27 (ms p13/14 READ, zoom-2 + supp-2 crop-2) =================
    ('offp_2018-06_01_27', 'solutionMirror',
     '9x2 + 6x + 1', '$9x^2$ + 6x + 1', 1,
     'ms-2018-06-4mb1-01-p14 (zoom-2, READ 300dpi)',
     'print "9x² + 6x + 1 = x² + 6x + 9 + 4x² + 2x² + 6x"; siblings x²/4x²/2x² already real ²; '
     'leading "2 2 2" wall line LEAVE'),
    ('offp_2018-06_01_27', 'solutionMirror',
     'x 2 − 3x − 4 =0', '$x^2$ − 3x − 4 =0', 1,
     'ms-2018-06-4mb1-01-p14 (supp-2, READ)',
     'print "x² − 3x − 4 = 0 | Simplifying to TQ"; "sin120°" trig argument LEAVE; '
     '"x+3 3x + 1" sine-rule weave LEAVE'),
    # ================= offp_2021-11_01_27 (ms p21 READ, supp-2 crop-3) =================
    ('offp_2021-11_01_27', 'solutionMirror',
     'π r 2', 'π$r^2$', 2,
     'ms-2021-11-4mb1-01-p21 (supp-2, READ)',
     'print "πr² − "96√3" = "96√3"" + "πr² = 2×"96√3""; both rows; "16 3"/"96 3"/"192 3" = '
     '16√3/96√3/192√3 √-loss fences LEAVE'),
    # ================= offp_2021-11_01_20 (ms p14 READ, sheet-01 crop-3; CURLY quotes in plane) =================
    ('offp_2021-11_01_20', 'solutionMirror',
     'AB 2 = 92 − “7.07” 2 ⇒ AB = 5.57',
     '$AB^2$ = $9^2$ − “7.07”$^2$ ⇒ AB = 5.57', 1,
     'ms-2021-11-4mb1-01-p14 (sheet-01, READ)',
     'print "AB² = 9² − "7.07"² ⇒ AB = 5.57"; spaced quoted-sup variant (run-027 class) + glued 92'),
    ('offp_2021-11_01_20', 'solutionMirror',
     '92 + “7.07” 2 − “5.57” 2',
     '$9^2$ + “7.07”$^2$ − “5.57”$^2$', 1,
     'ms-2021-11-4mb1-01-p14 (sheet-01, READ)',
     'print "cos ACB = (9² + "7.07"² − "5.57"²)/(2×9×"7.07")"; fraction-bar weave LEAVE'),
    ('offp_2021-11_01_20', 'solutionMirror',
     '92 + “7.68” 2 − “2.57” 2',
     '$9^2$ + “7.68”$^2$ − “2.57”$^2$', 1,
     'ms-2021-11-4mb1-01-p14 (sheet-01, READ)',
     'print "cos ACD = (9² + "7.68"² − "2.57"²)/(2×9×"7.68")"; fraction-bar weave LEAVE'),
    # ================= offp_2022-01_01r_19 (ms p11 READ, sheet-06 crop-5) =================
    ('offp_2022-01_01r_19', 'solutionMirror',
     '182 − 52 (= 299', '$18^2$ − $5^2$ (= 299', 2,
     'ms-2022-01-4mb1-01R-p11 (sheet-06, READ)',
     'print "(AB =) √(18² − 5²) (= √299 = 17.29...)"; row repeated twice in field (M1 rows); '
     '√-loss fences (√(18²−5²), √299) LEAVE; "sin DAB = (DAB = 16.127...)" 5/18 weave LEAVE'),
    # ================= offp_2022-01_01r_27 (ms p16 READ, sheet-07 crop-1) =================
    ('offp_2022-01_01r_27', 'solutionMirror',
     '5.22 + 8.22 − 7.47 2 M1dep', '$5.2^2$ + $8.2^2$ − $7.47^2$ M1dep', 1,
     'ms-2022-01-4mb1-01R-p16 (sheet-07, READ)',
     'print "ABC = cos⁻¹((5.2²+8.2²−7.47²)/(2×5.2×8.2)) (=63.2…)"; glued 5.22/8.22 + spaced 7.47 2; '
     'cos⁻¹ −1 fragments + fraction weave LEAVE'),
    ('offp_2022-01_01r_27', 'solutionMirror',
     '8.22 + 7.47 2 − 5.22', '$8.2^2$ + $7.47^2$ − $5.2^2$', 1,
     'ms-2022-01-4mb1-01R-p16 (sheet-07, READ)',
     'print "BAC = cos⁻¹((8.2²+7.47²−5.2²)/(2×8.2×7.47)) (=38.4…)"'),
    ('offp_2022-01_01r_27', 'solutionMirror',
     '5.22 + 7.47 2 − 8.22', '$5.2^2$ + $7.47^2$ − $8.2^2$', 1,
     'ms-2022-01-4mb1-01R-p16 (sheet-07, READ)',
     'print "BCA = cos⁻¹((5.2²+7.47²−8.2²)/(2×5.2×7.47)) (=78.4…)"; "“18.6...”" plain value LEAVE'),
    # ================= offp_2022-01_02r_11-b (ms p14 READ, sheet-10 crop-2) =================
    ('offp_2022-01_02r_11-b', 'solutionMirror',
     '152 − "14.095"2 (= 5.13)', '$15^2$ − "14.095"$^2$ (= 5.13)', 1,
     'ms-2022-01-4mb1-02R-p14 (sheet-10, READ)',
     'print "√(15² − "14.095"²) (= 5.13)"; √-loss LEAVE + disclose'),
    ('offp_2022-01_02r_11-b', 'solutionMirror',
     '0.5 × 152 + 152 − 2 ×15 ×15 × cos 40 (=5.13)',
     '0.5 × $15^2$ + $15^2$ − 2 ×15 ×15 × cos 40 (=5.13)', 1,
     'ms-2022-01-4mb1-02R-p14 (sheet-10, READ)',
     'print "0.5×√(15² + 15² − 2×15×15×cos 40) (=5.13)"; √-loss LEAVE'),
    ('offp_2022-01_02r_11-b', 'solutionMirror',
     'Or AD = 152 + 152 − 2 ×15 ×15 × cos 40(= 10.26...)',
     'Or AD = $15^2$ + $15^2$ − 2 ×15 ×15 × cos 40(= 10.26...)', 1,
     'ms-2022-01-4mb1-02R-p14 (sheet-10, READ)',
     'print "Or AD = √(15² + 15² − 2×15×15×cos 40)(= 10.26…)"; √-loss LEAVE'),
    ('offp_2022-01_02r_11-b', 'solutionMirror',
     '("5.13...") 2 ×sin(60)', '("5.13...")$^2$ ×sin(60)', 1,
     'ms-2022-01-4mb1-02R-p14 (sheet-10, READ)',
     'print "(area of base =) 6×(1/2)×("5.13…")²×sin(60)"; the ½ fraction weave LEAVE'),
    # ================= offp_2022-06_02r_2 (ms p6 READ, zoom-1 300dpi: AC² NOT 4C²) =================
    ('offp_2022-06_02r_2', 'solutionMirror',
     "AC 2 = 52 + 52 − 2 ( 5 )( 5 ) cos (180 − 2 × '22.5' )",
     "AC$^2$ = $5^2$ + $5^2$ − 2 ( 5 )( 5 ) cos (180 − 2 × '22.5' )", 1,
     'ms-2022-06-4mb1-02R-p6 (zoom-1, READ 300dpi)',
     'print "AC² = 5² + 5² − 2(5)(5)cos(180 − 2×\'22.5\')"; the 150dpi read suggested 4C² — '
     '300dpi zoom DISPROVES, print is AC²'),
    ('offp_2022-06_02r_2', 'solutionMirror',
     "AC = 52 + 52 − 2 ( 5 )( 5 ) cos (180 − 2 × '22.5' )",
     "AC = $5^2$ + $5^2$ − 2 ( 5 )( 5 ) cos (180 − 2 × '22.5' )", 1,
     'ms-2022-06-4mb1-02R-p6 (zoom-1, READ 300dpi)',
     'print "AC = √(5² + 5² − 2(5)(5)cos(180 − 2×\'22.5\'))"; √-loss LEAVE; '
     '"cos\'22.5\' = (½AC)/5" weave LEAVE'),
    # ================= offp_2026-06_01_17 (ms p17 READ, sheet-04 crop-5) =================
    ('offp_2026-06_01_17', 'solutionMirror',
     '102 − 42 [ = 84] oe', '$10^2$ − $4^2$ [ = 84] oe', 1,
     'ms-2026-06-4mb1-01-p17 (sheet-04, READ)',
     'print "10² − 4² [= 84] oe"'),
    ('offp_2026-06_01_17', 'solutionMirror',
     'find AF2', 'find $AF^2$', 1,
     'ms-2026-06-4mb1-01-p17 (sheet-04, READ)',
     'print "M1 correct use of Pythagoras theorem to find AF²"'),
    ('offp_2026-06_01_17', 'solutionMirror',
     'eg 102 = AF 2 + 42', 'eg $10^2$ = $AF^2$ + $4^2$', 1,
     'ms-2026-06-4mb1-01-p17 (sheet-04, READ)',
     'print "eg 10² = AF² + 4²"'),
    ('offp_2026-06_01_17', 'solutionMirror',
     '[ AF =] 102 − 42 ⎡⎣= 84', '[ AF =] $10^2$ − $4^2$ ⎡⎣= 84', 1,
     'ms-2026-06-4mb1-01-p17 (sheet-04, READ)',
     'print "[AF =] √(10² − 4²) [= √84 = 9.165…]"; √-loss fences LEAVE'),
    ('offp_2026-06_01_17', 'solutionMirror',
     '[ AF =] 102 + 42 − 2 × 4 ×10cos ("66.421...")',
     '[ AF =] $10^2$ + $4^2$ − 2 × 4 ×10cos ("66.421...")', 1,
     'ms-2026-06-4mb1-01-p17 (sheet-04, READ)',
     'print "[AF =] √(10² + 4² − 2×4×10cos("66.421…"))"; √-loss LEAVE'),
    # ================= offp_2024-06_01r_12 (ms p10 READ, zoom-2 300dpi) =================
    ('offp_2024-06_01r_12', 'solutionMirror',
     'eg x 2 + x 2 = 12.62', 'eg $x^2$ + $x^2$ = $12.6^2$', 1,
     'ms-2024-06-4mb1-01R-p10 (zoom-2, READ 300dpi)',
     'print "eg x² + x² = 12.6² or"'),
    ('offp_2024-06_01r_12', 'solutionMirror',
     '⎡⎣ AC 2 = ⎤⎦ (0.5 ×12.6)² + (0.5 ×12.6)² ⎡⎣ = 39.69 + 39.692 = 79.38⎤⎦',
     '⎡⎣ $AC^2$ = ⎤⎦ (0.5 ×12.6)² + (0.5 ×12.6)² ⎡⎣ = 39.69 + $39.69^2$ = 79.38⎤⎦', 1,
     'ms-2024-06-4mb1-01R-p10 (zoom-2, READ 300dpi)',
     'print "[AC² =](0.5×12.6)² + (0.5×12.6)² [= 39.69+39.69² = 79.38]"; the sibling (0.5×12.6)² '
     'already real ²; "39.69²" is a PRINT-LITERAL quirk of the MS itself — restored AS PRINTED '
     '($39.69^2$), disclosed (mathematically the MS means 39.69+39.69)'),
    ('offp_2024-06_01r_12', 'solutionMirror',
     'NB do not award for AB 2 + AC 2 = 12.62',
     'NB do not award for $AB^2$ + $AC^2$ = $12.6^2$', 1,
     'ms-2024-06-4mb1-01R-p10 (zoom-2, READ)',
     'print "NB do not award for AB² + AC² = 12.6²"'),
    ('offp_2024-06_01r_12', 'solutionMirror',
     '12.62 ⎡ 3969 ⎤', '$12.6^2$ ⎡ 3969 ⎤', 1,
     'ms-2024-06-4mb1-01R-p10 (zoom-2, READ)',
     'print "[x =]√(12.6²/2) = √(3969/25) = 8.909…"; √-loss + 3969/25 weave LEAVE'),
    ('offp_2024-06_01r_12', 'solutionMirror',
     '(0.5 ×12.6) 2 + (0.5 ×12.6) 2 [= 8.9090',
     '(0.5 ×12.6)$^2$ + (0.5 ×12.6)$^2$ [= 8.9090', 1,
     'ms-2024-06-4mb1-01R-p10 (zoom-2, READ)',
     'print "[AC =]√((0.5×12.6)² + (0.5×12.6)²) [= 8.9090…]"; √-loss LEAVE'),
    ('offp_2024-06_01r_12', 'solutionMirror',
     'Allow 9 if x 2 = 79.3... is seen', 'Allow 9 if $x^2$ = 79.3... is seen', 1,
     'ms-2024-06-4mb1-01R-p10 (zoom-2, READ)',
     'print "Allow 9 if x² = 79.3... is seen"; "63 2" = 63√2/10 √-loss fence LEAVE'),
    # ================= offp_2024-06_01r_25 (ms p23 READ, zoom-3 300dpi) =================
    ('offp_2024-06_01r_25', 'problem',
     'ABC 115°', '∠ABC = 115°', 1,
     'qp-2024-06-4mb1-01R-p22 (sheet-08, READ)',
     '∠ABC = 115° data line lost ∠ and =; "Diagram NOT 115° accurately drawn 53° A D" '
     'reconstruction line = figure-label run furniture LEAVE'),
    ('offp_2024-06_01r_25', 'problem',
     'ADC 53°', '∠ADC = 53°', 1,
     'qp-2024-06-4mb1-01R-p22 (sheet-08, READ)',
     '∠ADC = 53° data line lost ∠ and ='),
    ('offp_2024-06_01r_25', 'solutionMirror',
     'AC 2 = 112 + 82 − 2 ×11× 8cos115 (= 259.38...)',
     '$AC^2$ = $11^2$ + $8^2$ − 2 ×11× 8cos115 (= 259.38...)', 1,
     'ms-2024-06-4mb1-01R-p23 (zoom-3, READ 300dpi)',
     'print "AC² = 11² + 8² − 2×11×8cos115 (= 259.38…) or"'),
    ('offp_2024-06_01r_25', 'solutionMirror',
     'AC = 112 + 82 − 2 × 11× 8cos115(= 16.105...)',
     'AC = $11^2$ + $8^2$ − 2 × 11× 8cos115(= 16.105...)', 1,
     'ms-2024-06-4mb1-01R-p23 (zoom-3, READ)',
     'print "AC = √(11² + 8² − 2×11×8cos115)(= 16.105…)"; √-loss LEAVE'),
    ('offp_2024-06_01r_25', 'solutionMirror',
     'the length of\nAC2 or AC', 'the length of\n$AC^2$ or AC', 1,
     'ms-2024-06-4mb1-01R-p23 (zoom-3, READ)',
     'print "M1 for a correct method to find the length of AC² or AC"'),
    ('offp_2024-06_01r_25', 'solutionMirror',
     '16.105...2 = AD2 + 152 − 2 × AD ×15cos53',
     '16.105...$^2$ = $AD^2$ + $15^2$ − 2 × AD ×15cos53', 1,
     'ms-2024-06-4mb1-01R-p23 (zoom-3, READ)',
     'print "16.105…² = AD² + 15² − 2×AD×15cos53"; quoted-glued 16.105...2 (run-027 class)'),
    ('offp_2024-06_01r_25', 'solutionMirror',
     'AD2 = 16.105...2 + 152 − 2 ×16.105... ×15cos"78.9..."',
     '$AD^2$ = 16.105...$^2$ + $15^2$ − 2 ×16.105... ×15cos"78.9..."', 1,
     'ms-2024-06-4mb1-01R-p23 (zoom-3, READ)',
     'print "AD² = 16.105…² + 15² − 2×16.105…×15cos"78.9…""'),
    ('offp_2024-06_01r_25', 'solutionMirror',
     'Finding AD2 NB', 'Finding $AD^2$ NB', 1,
     'ms-2024-06-4mb1-01R-p23 (zoom-3, READ)',
     'print "Finding AD² NB 2×15cos 53 = 18.054…"; "√(15² − 11.979…²)" √-loss weave LEAVE; '
     '"sin −1" fragments in the √-weave row LEAVE (weave soup, disclosed)'),
    # ================= offp_2025-06_01r_25 (ms p30 READ, sheet-08 crop-4) =================
    ('offp_2025-06_01r_25', 'solutionMirror',
     '[ AC =] 62 + 62 ⎡⎣= 72', '[ AC =] $6^2$ + $6^2$ ⎡⎣= 72', 1,
     'ms-2025-06-4mb1-01R-p30 (sheet-08, READ)',
     'print "[AC=]√(6²+6²) [= √72 = 6√2 = 8.4852…]"; √-loss fences (√ over, √72, 6√2) LEAVE'),
    ('offp_2025-06_01r_25', 'solutionMirror',
     '⎥ 6 + 62 ⎡⎣ = 3 2 = 4.2426', '⎥ 6 + $6^2$ ⎡⎣ = 3 2 = 4.2426', 1,
     'ms-2025-06-4mb1-01R-p30 (sheet-08, READ)',
     'print "or [½AC =] ½√(6²+6²) [= 3√2 = 4.2426…]"; the FIRST 6 lost its ² inside the ½-weave '
     '(deleted-sup in wall LEAVE); the second 62 glued fixed; "3 2" = 3√2 fence LEAVE'),
    ('offp_2025-06_01r_25', 'solutionMirror',
     'XC =] 134 − 62', 'XC =] 134 − $6^2$', 1,
     'ms-2025-06-4mb1-01R-p30 (sheet-08, READ)',
     'print "[XC=]√(134 − 6²)"; "134" = √134 √-loss fence LEAVE'),
    ('offp_2025-06_01r_25', 'solutionMirror',
     '"32 + 32 " + " 32 + 32 "', '"3$^2$ + 3$^2$ " + " 3$^2$ + 3$^2$ "', 1,
     'ms-2025-06-4mb1-01R-p30 (sheet-08, READ)',
     'print "[XC=]√("3²+3²" + h/(h−6)·√("3²+3²"))"; quoted-glued 32 = 3² (print-verified)'),
    ('offp_2025-06_01r_25', 'solutionMirror',
     '134 = 62 + ⎜ " 32 + 32 + 32 + 32 " ⎟',
     '134 = $6^2$ + ⎜ " 3$^2$ + 3$^2$ + 3$^2$ + 3$^2$ " ⎟', 1,
     'ms-2025-06-4mb1-01R-p30 (sheet-08, READ)',
     'print "134 = 6² + ((√("3²+3²") + h/(h−6)·√("3²+3²")))²"; the (...)² wall ² deleted in '
     'weave LEAVE; "13h2 − 372h + 1440 = 0" fixed separately'),
    ('offp_2025-06_01r_25', 'solutionMirror',
     '13h2 − 372h + 1440 = 0', '13$h^2$ − 372h + 1440 = 0', 1,
     'ms-2025-06-01r-p30 (sheet-08, READ)',
     'print "13h² − 372h + 1440 = 0"; glued h²; "7 2"/"6 2" quoted = 7√2/6√2 candidate-value '
     '√-loss fences LEAVE ("is the candidate\'s value for XC/AC")'),
    # ================= offp_2025-06_02r_7-c (ms p13 READ, sheet-11 crop-2) =================
    ('offp_2025-06_02r_7-c', 'solutionMirror',
     'their42 + 22 in place of 5', 'their $4^2$ + $2^2$ in place of 5', 1,
     'ms-2025-06-4mb1-02R-p13 (sheet-11, READ)',
     'print "ft their √(4²+2²) in place of √5 when using sin or cos"; √-loss LEAVE'),
    ('offp_2025-06_02r_7-c', 'solutionMirror',
     '42 + 2 5 Allow sin', '$4^2$ + 2 5 Allow sin', 1,
     'ms-2025-06-4mb1-02R-p13 (sheet-11, READ)',
     'print "cos(x) = (4²+(2√5)²−2²)/(2×4×2√5)"; the "2 5" = 2√5 √-loss fence LEAVE; '
     '( )−2 wall LEAVE; SC3 mark-code LEAVE'),
    # ================= offp_2025-06_02r_10-b (ms p17 READ, zoom-2 300dpi) =================
    ('offp_2025-06_02r_10-b', 'solutionMirror',
     'OC 2 = 102 +', '$OC^2$ = $10^2$ +', 3,
     'ms-2025-06-4mb1-02R-p17 (zoom-2, READ 300dpi)',
     'print "OC² = 10² + …" ×3 rows ((3/4)×"BM", ("7.96…"), ("2.65…")); the ("10.62…") row '
     'fixed separately (its = 102 − form)'),
    ('offp_2025-06_02r_10-b', 'solutionMirror',
     'OC 2 = 102 − ⎜', '$OC^2$ = $10^2$ − ⎜', 1,
     'ms-2025-06-4mb1-02R-p17 (zoom-2, READ)',
     'print "OC² = 10² − ((1/2)×"10.62…")² + ((1/4)×"10.62…")²"; the ("10.62…") sups sit inside '
     'the ⎜⎟ weave walls (deleted/spaced) — FENCE LEAVE, disclosed'),
    ('offp_2025-06_02r_10-b', 'solutionMirror',
     'BM = 10 + 10 − 2 ×10 ×10 × cos', '$BM^2$ = $10^2$ + $10^2$ − 2 ×10 ×10 × cos', 1,
     'ms-2025-06-4mb1-02R-p17 (zoom-2, READ)',
     'print "BM² = 10² + 10² − 2×10×10×cos"64.158…""; the BM² AND both 10² were deleted '
     '(clean row, restored print-verbatim)'),
    ('offp_2025-06_02r_10-b', 'solutionMirror',
     'or BM = 112.8…', 'or $BM^2$ = 112.8…', 1,
     'ms-2025-06-4mb1-02R-p17 (zoom-2, READ)',
     'print "M1 Allow for BM = 10.62… or BM² = 112.8…"'),
    ('offp_2025-06_02r_10-b', 'solutionMirror',
     '("7.96...") − 2 ×10', '("7.96...")$^2$ − 2 ×10', 1,
     'ms-2025-06-4mb1-02R-p17 (zoom-2, READ)',
     'print "or OC² = 10² + ("7.96…")² − 2×10×("7.96…")×cos("57.92…")"; deleted-sup clean row '
     'restored print-verbatim'),
    ('offp_2025-06_02r_10-b', 'solutionMirror',
     '("2.65...") − 2 ×10', '("2.65...")$^2$ − 2 ×10', 1,
     'ms-2025-06-4mb1-02R-p17 (zoom-2, READ)',
     'print "or OC² = 10² + ("2.65…")² − 2×10×("2.65…")×cos("57.92…")"; deleted-sup clean row'),
    # ================= offp_2021-11_02_6-b (ms p10 READ, zoom-1 300dpi) =================
    ('offp_2021-11_02_6-b', 'solutionMirror',
     '("8"− −1) 2 (= 306', '("8"− −1)$^2$ (= 306', 1,
     'ms-2021-11-4mb1-02-p10 (zoom-1, READ 300dpi)',
     'print "√(("8"−−7)² + ("8"−−1)²) (= √306 = 3√34 = 17.49…)"; √-loss + "3 34" = 3√34 fence LEAVE'),
    ('offp_2021-11_02_6-b', 'solutionMirror',
     '("3"− 4) 2 = ( 82', '("3"− 4)$^2$ = ( 82', 1,
     'ms-2021-11-4mb1-02-p10 (zoom-1, READ)',
     'print "[AC=]√(("−4"−5)² + ("3"−4)²) (= √82 = 9.05…)"; "82" = √82 √-loss fence LEAVE'),
    ('offp_2021-11_02_6-b', 'solutionMirror',
     '(4 − −1) 2 (= 13)', '(4 − −1)$^2$ (= 13)', 1,
     'ms-2021-11-4mb1-02-p10 (zoom-1, READ)',
     'print "√((5−−7)² + (4−−1)²) (=13)" (Alt 1 row); sibling "(5 − −7)²" already real ²'),
    ('offp_2021-11_02_6-b', 'solutionMirror',
     '"82"+ 52 − "132 " ⎞ ⎡ −62 ⎤', '"82"+ $5^2$ − "13"$^2$ ⎞ ⎡ −62 ⎤', 1,
     'ms-2021-11-4mb1-02-p10 (zoom-1, READ 300dpi)',
     'print "Eg cos∠BCA = (("82"+5²−"13"²)/(2×"√82"×5)) [= −62/(10√82)]"; "82" = the candidate\'s '
     '(√82)² value QUOTED with NO sup in print — UNCHANGED; 5² real sup; "13"² sup outside the '
     'quote; −62 = the PLAIN number (82+25−169) — UNCHANGED; 10√82 √-loss fence LEAVE'),
    ('offp_2021-11_02_6-b', 'solutionMirror',
     '"13"2 + 52 − "82" ⎞ ⎡ 112 ⎤', '"13"$^2$ + $5^2$ − "82" ⎞ ⎡ 112 ⎤', 1,
     'ms-2021-11-4mb1-02-p10 (zoom-1, READ)',
     'print "cos∠ABC = (("13"²+5²−"82")/(2×"13"×5)) [= 112/130]"; 112 = PLAIN (169+25−82)'),
    ('offp_2021-11_02_6-b', 'solutionMirror',
     '"82"+ "13"2 − 52 ⎞ ⎡ 226 ⎤', '"82"+ "13"$^2$ − $5^2$ ⎞ ⎡ 226 ⎤', 1,
     'ms-2021-11-4mb1-02-p10 (zoom-1, READ)',
     'print "cos∠BAC = (("82"+"13"²−5²)/(2×"13"×√82)) [= 226/(26√82)]"; 226 = PLAIN; '
     '"tan −1" weave fragments LEAVE (weave soup, disclosed)'),
]

# zero-fix discharges: (unitKey/pid, class, evidence)
ZERO_FIX = [
    ('offp_2018-06_01_21', 'prose adjacency + trig argument',
     'qp-2024-06... n/a — qp-2018-06-4mb1-01-p15 READ (sheet-01): "radius 8 cm"/"AOB is 35°"/'
     '"to 3 significant figures" prose; "sin 35°" plain angle'),
    ('offp_2021-11_01_11', 'prose adjacency + fraction weave',
     'qp-2021-11-4mb1-01-p9 READ (sheet-01): "length 8 cm"/"and 15 cm"/"opposite 8" prose; '
     'cos⁻¹ weave block FS fence; "or 3" marks'),
    ('offp_2021-11_01_20', 'trig arguments + fraction weaves + marks',
     'ms-2021-11-4mb1-01-p14 READ (sheet-01): tan 23/tan 67/sin 67/sin 23 plain; BC 3/BC 4 weaves'),
    ('offp_2023-11_01_20', 'marks bleed + decimals + weaves',
     'ms-2023-11-4mb1-01-p14 tail (sheet-02): "35−16 over 4" weave; 2.375/0.7108 plain'),
    ('offp_2023-11_01_25', 'prose adjacency + trig',
     'ms-2023-11-4mb1-01-p20 READ (sheet-03): "2h − ph 3 M1" marks adjacency; "cos 60" plain'),
    ('offp_2023-11_01_26', 'prose/marks/trig (field partially real-math enriched)',
     'ms-2023-11-4mb1-01-p21 READ (sheet-03): $-wrapped sups already real; flagged tokens prose'),
    ('offp_2024-06_01_9', 'prose + trig + fraction weaves',
     'qp-2024-06-4mb1-01-p7 READ (sheet-03): "is 20 m"/"is 10°" prose; tan10/tan 80/cos10 trig; '
     'BT/20 weaves'),
    ('offp_2024-11_01_13', 'prose + trig',
     'qp-2024-11-4mb1-01-p9 READ (sheet-04): "is 32°" prose; sin 32/sin 58 trig'),
    ('offp_2024-11_01_26-b', 'prose + trig + marks',
     'ms-2024-11-4mb1-01-p24 + qp-p22 READ (sheet-04): sin19/sin 71 trig; "dep on 5 previous" prose'),
    ('offp_2026-06_01_25', 'prose + marks',
     'qp-2026-06-4mb1-01-p22 + ms-p26 READ (sheet-05): "height 45 m"/"is 10°" prose; '
     '"at least 2"/"Total 6 marks" prose; $XY^2$ math already real'),
    ('offp_2019-01_01r_27', 'diagram label run + prose + trig',
     'qp-2019-01-4mb1-01R-p20 READ (sheet-05): "(2x − 5) cm 30° (x + 5) cm A C" label run; '
     '"∠ABC = 30°" real ∠ in plane; sin30/cos30 trig'),
    ('offp_2020-01_01r_17', 'prose + fraction weave + °-flatten disclosed',
     'ms-2020-01-4mb1-01R-p11 READ (sheet-05/06): "AD DC 3 M1 … 20 20" weave; "sin 50o" — the '
     '° → o flatten observed, OUT of wave-6 token scope, disclosed for the census lane'),
    ('offp_2020-01_01r_26', 'prose/marks (real ∠ present)',
     'ms-2020-01-4mb1-01R-p18 READ (sheet-06): ∠ symbols real; "and 90 A1"/"Method 1" prose'),
    ('offp_2020-01_01r_29-b', 'prose + trig + weave walls',
     'ms-2020-01-4mb1-01R-p20 READ (sheet-06): tan 25/sin 65/sin 50 trig; (8sin65/sin50)² walls'),
    ('offp_2025-06_02r_3-b', 'FLEET formula-sheet fence + prose',
     'qp-2025-06-4mb1-02R-p4 READ (sheet-11): "[Sum of interior angles of a polygon / (2n − 4) '
     'right angles]" formula-box → "n 2"/"n 4" tokens = the run-027 FENCED fleet class'),
    ('offp_2025-11_02_10', 'prose/marks (sup sibling rows already real ²)',
     'ms-2025-11-4mb1-02-p18 (supp-2) + qp-p30 READ (sheet-09): "or 20² = "13"² + "15√2"²…" '
     'already real ² in plane; flagged tokens ("r 7"/"y 10"/"f 5"…) marks/prose'),
    ('offp_2019-01_02r_7-b', 'fraction weave + trig',
     'ms-2019-01-4mb1-02R-p11 (sheet-09) + qp-p24 READ: "OC 12/12 OC" weave; tan 27/tan 63 trig; '
     'cosine-rule rows in this field carry real ² or live in the 2025-11 sibling'),
    ('offp_2026-06_02r_5', 'prose/marks + deleted-sup wall',
     'ms-2026-06-4mb1-02R-p10 (sheet-12) + qp READ: "10 × 2x or 10 × x" prose; '
     '"⎡⎣ x − 15x + 15 = 0⎤⎦⏎2" wall-row deleted sup (print "x² − 15x + 15 = 0") FENCE LEAVE; '
     '1.08/13.9/1.07 plain'),
    # problemMd-side zero-fix discharges for fix-unit pids (diagram labels / fences)
    ('offp_2023-01_01_26-a[problem]', 'diagram label run + prose',
     'qp-2023-01-4mb1-01-p22 READ (sheet-02): "60° 5 3 cm 5 15 cm A C 10 3 cm B" label run '
     '(√-loss in labels fenced); "with a horizontal" prose'),
    ('offp_2021-11_02_6-b[problem]', 'FLEET formula-sheet fence + prose',
     'qp-2021-11-4mb1-02-p4/p14 READ (sheet-09): "Cosine rule : a 2 b 2 c 2 2bc cos A / Area of '
     'triangle 1 ab sin C" formula box = run-027 FENCED fleet class'),
    ('offp_2025-06_02r_10-b[problem]', 'FLEET formula-sheet fence + prose',
     'qp-2025-06-4mb1-02R-p28 READ (sheet-12): "Sine Rule … Cosine Rule a b c 2bc cos A 2 2 2 / '
     'Area of triangle ab sin C" formula box FENCED'),
    ('offp_2026-06_02r_6-a[problem-extra]', 'diagram label run',
     'qp-2026-06-4mb1-02R-p14 READ (supp-1): "D E 45° C 85° A B F" reconstruction line = figure '
     'labels (the DATA line fixed; the label run stays)'),
    ('offp_2025-11_02_6-b', 'not in wave-6 worklist', 'n/a — guard row, unused'),
]
