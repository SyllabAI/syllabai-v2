#!/usr/bin/env python3
r"""run-027 tranche-2 wave-4 FIXES (eyes-on-adjudicated, NO-GUESS).

Wave-4 worklist of record: 73 units (run027_w4_worklist.json — ledger-first:
run026_w3_worklist 103 - run-026 ledger covered 30 = 73; receipt claimed 69,
+4 zeroByClass delta disclosed per the run-026 101-vs-103 precedent).
Plane pin 37fc0a18720d82ff. Mirror status checked per part; diverged mirrors
get explicit per-field tuples (the battery never overwrites a diverged mirror).

Every fix verified against the MS/QP page of record rendered @150dpi and READ
first-hand this run (300dpi zoom crops where print-verbatim demanded it:
z_p7m1/z_p8note2/z_p9m1dep2.png). Evidence PNGs: scratch/oeq_run026/pages/ +
scratch/oeq_run027/ zooms.

Tuple: (pid, field, old, new, exp, evidence, note)
  field: 'solutionMirror' (solutionMd + lockstep mp0, byte-equality pre-checked)
       | 'solution' | 'mirror' (markPoints[0].textMd) | 'problem'
  exp  : expected occurrence count (fail-closed; exp!=1 replaces ALL)
ORDER MATTERS for sequence-dependent tuples (battery applies in list order).

Fences honored (run-024/025/026 law): radical-flatten LEAVE; sqrt-loss (√ glyph
lost: "12 55"=12√55 class) LEAVE + disclose; deleted-sup LEAVE + disclose;
displaced-sup aggregates LEAVE + disclose; minus/angle/operator loss inside
woven rows = content-loss class LEAVE unless tokens map 1:1 print-verified
(11-d operator-restoration class, Tier-B, disclosed); fraction weaves (FS,
run-004 R4-A) LEAVE; print-literal mark-code runs LEAVE; furniture (prose
adjacency, diagram labels, answer/marks-column bleeds, trig angles SCT)
ZERO-FIX with page evidence.
"""

FIXES = [
    # ================= paper official-4mb1-02-2023-01 =================
    # ---- q2 (offp_2023-01_02_2) — lockstep mirror 2054/2054 — MS p6+p7 + QP p3 ----
    ('offp_2023-01_02_2', 'solutionMirror',
     'AE = 82 − 32 ⎡⎣= 55 ⎤⎦',
     'AE = $8^2$ − $3^2$ ⎡⎣= 55 ⎤⎦', 2,
     'ms-2023-01-4mb1-02-p06-6.png + p07-7 (150dpi, READ)',
     '8^2-3^2 glued sups x2 (M1 main + Alt; print AE = √(8²−3²)[=√55]); bracket weave + sqrt-loss 55 fenced'),
    ('offp_2023-01_02_2', 'solutionMirror',
     'seeing AE 2 32 82',
     'seeing $AE^2$ + $3^2$ = $8^2$', 1,
     'ms-2023-01-4mb1-02-p06-6.png (150dpi, READ)',
     'AE²+3²=8² sup+operator restoration (11-d class, tokens map 1:1, print-verified p6 M1 note)'),
    ('offp_2023-01_02_2', 'solutionMirror',
     'from AE 2 32 82',
     'from $AE^2$ + $3^2$ = $8^2$', 1,
     'z_p7m1.png (300dpi zoom, READ)',
     'Alt note same class (print "e.g. from AE² + 3² = 8²", no seeing — zoom-verified)'),
    ('offp_2023-01_02_2', 'solutionMirror',
     '"16"2 − ("9"− 3)',
     '"16"$^2$ − ("9"− 3)', 1,
     'ms-2023-01-4mb1-02-p06-6.png (150dpi, READ)',
     '"16"² glued quoted sup (EC row); ("9"−3)² deleted-sup fence stays'),
    ('offp_2023-01_02_2', 'solutionMirror',
     '"3 × 8"2 − "9"2',
     '"3 × 8"$^2$ − "9"$^2$', 1,
     'ms-2023-01-4mb1-02-p06-6.png (150dpi, READ)',
     'EC row quoted glued sups ("3×8"², "9"²); √ radical-loss fence stays'),
    ('offp_2023-01_02_2', 'solutionMirror',
     '( 3 × 8)² − "9"2',
     '( 3 × 8)² − "9"$^2$', 1,
     'ms-2023-01-4mb1-02-p06-6.png (150dpi, READ)',
     'AC row second "9"²; √495 sqrt-loss fence stays'),
    ('offp_2023-01_02_2', 'solutionMirror',
     'Area of triangle ABC = 32 ×',
     'Area of triangle ABC = $3^2$ ×', 1,
     'ms-2023-01-4mb1-02-p07-7.png (150dpi, READ)',
     '3² glued (Alt ABC row; ½ weave + √55 sqrt-loss fenced)'),
    ('offp_2023-01_02_2', 'solutionMirror',
     'Area BCED = 32 ×',
     'Area BCED = $3^2$ ×', 1,
     'ms-2023-01-4mb1-02-p07-7.png (150dpi, READ)',
     '3² glued (Alt BCED row)'),
    ('offp_2023-01_02_2', 'solutionMirror',
     ' DAE ',
     ' ∠DAE ', 6,
     'ms-2023-01-4mb1-02-p06-6.png (150dpi, READ)',
     '∠ symbol restoration x6 (run-017 class): finding/sin/cos/tan/tan-where/correct rows; ∠DAE pre-count 0; space-anchored (old not substring of new)'),
    ('offp_2023-01_02_2', 'problem',
     '1 : 2 DEA BCA Calculate',
     '1 : 2 ∠DEA = ∠BCA = 90° Calculate', 1,
     'qp-2023-01-4mb1-02-p03-3.png (150dpi, READ)',
     '∠DEA = ∠BCA = 90° clause restored (angle+operator restoration, 11-d disclosed class, print-verified p3)'),
    # ---- q3 (offp_2023-01_02_3) — lockstep 1456/1456 — MS p8 + QP p4 ----
    ('offp_2023-01_02_3', 'solutionMirror',
     'of CD2 or AB2',
     'of CD$^2$ or $AB^2$', 1,
     'ms-2023-01-4mb1-02-p08-8.png + z_p8note2.png (READ)',
     'CD²/AB² glued sups (M1 note "length of CD² or AB²")'),
    ('offp_2023-01_02_3', 'solutionMirror',
     '"15"2 + "8"2',
     '"15"$^2$ + "8"$^2$', 1,
     'z_p8note.png (300dpi zoom, READ)',
     'quoted glued sups (M1dep √("15"²+"8"²)[=17]); √ radical-loss fence stays'),
    ('offp_2023-01_02_3', 'solutionMirror',
     '...2 [ 192 ...2 ]',
     '...$^2$ [ 19$^2$ ...$^2$ ]', 1,
     'z_p8note2.png (300dpi zoom, READ)',
     'print-verbatim 19² (note allow-line; Working 15² separate); "…²" glued sups x2'),
    # ---- q4 (offp_2023-01_02_4) — MS p9 (needle-located this run) + QP p6 ----
    ('offp_2023-01_02_4', 'solutionMirror',
     '3.82',
     '3.8$^2$', 2,
     'ms-2023-01-4mb1-02-p09-9.png (150dpi, READ)',
     'π×3.8² x2 (sector M1 + shaded M1dep row1); "110"/360 + 3971/900 weaves fenced'),
    ('offp_2023-01_02_4', 'solutionMirror',
     '"5.426..."2',
     '"5.426..."$^2$', 2,
     'ms-2023-01-4mb1-02-p09-9.png (150dpi, READ)',
     '"5.426…"² x2 (OAB+ABC approach note + shaded row2); ½ weaves fenced'),
    ('offp_2023-01_02_4', 'solutionMirror',
     '(3.8) 2',
     '(3.8)$^2$', 3,
     'ms-2023-01-4mb1-02-p09-9.png (150dpi, READ)',
     '(3.8)² x3 space-displaced sups re-attached (approach + shaded rows)'),
    # ---- q9-b (offp_2023-01_02_9-b) — DIVERGED 547/552 — explicit per-field — MS p15 ----
    ('offp_2023-01_02_9-b', 'solution',
     'FI = 122 + 202 3 544',
     'FI = $12^2$ + $20^2$ 3 544', 1,
     'ms-2023-01-4mb1-02-p15-15.png (150dpi, READ)',
     '12²/20² glued sups (print FI = √(12²+20²)); "3 544"=√544 radical-loss fence stays'),
    ('offp_2023-01_02_9-b', 'mirror',
     'FI = 122 + 202 3 544',
     'FI = $12^2$ + $20^2$ 3 544', 1,
     'ms-2023-01-4mb1-02-p15-15.png (150dpi, READ)',
     'mirror half (diverged 547/552 — explicit per-field law)'),
    ('offp_2023-01_02_9-b', 'solution',
     'for FJI or equivalent',
     'for ∠FJI or equivalent', 1,
     'ms-2023-01-4mb1-02-p15-15.png (150dpi, READ)',
     '∠ restoration (print "ratio for ∠FJI or equivalent")'),
    ('offp_2023-01_02_9-b', 'mirror',
     'for FJI or equivalent',
     'for ∠FJI or equivalent', 1,
     'ms-2023-01-4mb1-02-p15-15.png (150dpi, READ)',
     'mirror half'),
    ('offp_2023-01_02_9-b', 'solution',
     'example, cos FJI',
     'example, cos ∠FJI', 1,
     'ms-2023-01-4mb1-02-p15-15.png (150dpi, READ)',
     '∠ restoration (print "for example, cos ∠FJI")'),
    ('offp_2023-01_02_9-b', 'mirror',
     'example, cos FJI',
     'example, cos ∠FJI', 1,
     'ms-2023-01-4mb1-02-p15-15.png (150dpi, READ)',
     'mirror half'),
]

ZERO_FIX = {
    # ---- wave-4 zeroByClass openers (verification reads this run) ----
    'offp_2022-01_01r_5': ('marks-column bleed "or 2" (M1 marks=2 col) — print "180 + 63 or / a clear diagram…" '
                           'ms-2022-01-4mb1-01r-p07-7.png (READ)'),
    'offp_2023-11_02_10-b': ('"gains 2 marks" NB prose print-verbatim — ms-2023-11-4mb1-02-p17-17.png (READ)'),
    'offp_2026-06_02r_6-c': ('"Cas 50" = Working-column Cas (calculator) label + Answer 50 bleed, print-verbatim — '
                             'ms-2026-06-4mb1-02r-p11-11.png (READ); "allow ∠ABD = 16" print-verbatim'),
    # ---- official-4mb1-02-2023-01 fences ----
    'offp_2023-01_02_2-problem': ('diagram label glue "cm³ cm A E C" head + Figure 1 prose — qp-2023-01-4mb1-02-p03-3.png (READ)'),
    'offp_2023-01_02_2-lead': ('sqrt-loss family: "12 55"x2 (=12√55), bare 55/495/"2 55" (√ glyphs lost); ½ fraction '
                               'weaves ("1 2 ×", "× ×", ⎡⎣⎤⎦); Alt "AE 82 32" (√(8²+3²) needs operator+radical full-row '
                               'restore — content-loss fence); "AE 8 3"/"AE 73" weaves; eg-row "AE 82 32 55" '
                               '(needs "= √" restore — mislead fence); ABC-note weave 3" 55 " "9"2 3" 55 " (third "9"² '
                               'inside weave — fenced) — ms p6/p7 (READ)'),
    'offp_2023-01_02_3-problem': ('diagram labels (3x+5)/(3x+17)/(3x+2)x2/(3x+21) m + Figure 2 prose — qp-2023-01-4mb1-02-p04-4.png (READ)'),
    'offp_2023-01_02_3-lead': ('deleted sups in "((3x+17)−(3x+2)) + ... ⎡⎣= 15 + ...⎤⎦"; "2 2 2" displaced aggregates; '
                               '"+ 13 )" displaced ²; ⎝2⎠ fraction weaves; D2/B2/M0 mark codes; "If 17 seen"/"Figure 2" '
                               'prose — ms p8 + qp p4 (READ)'),
    'offp_2023-01_02_4-problem': ('Figure 3 prose numbers (3.8 cm / 3 significant figures) + reconstruction furniture tail; '
                                  '∠ACB = 70° print-verbatim present — qp-2023-01-4mb1-02-p06-6.png (READ)'),
    'offp_2023-01_02_4-lead': ('fraction weaves: 3.8/tan35 inverted "tan 35 / 3.8", sin55/cos55/sin35 table, "110"/360, '
                               '3971/900 π, ½ weaves; sct trig keywords tan35/sin55/cos55/sin35 — ms-2023-01-4mb1-02-p09-9.png (READ); '
                               'print "90° < BOA < 180°" has NO ∠ (zoom-verified z_p9m1dep2.png) — no fix'),
    'offp_2023-01_02_9-b-lead': ('sqrt-loss "3 544"/"4 34"x2/"569"; displaced "2 2" x2; M1dep cos-example weave '
                                 '("23.85..."2 52 "23.32..."2 numerator + "23.32..." 2 5 "23.85..." denominator — '
                                 'operator+structure weave fence); ⎛4 34⎞⎝5⎠ tan⁻¹ weave; "tan −1" displaced sup; '
                                 'Awrt 78 prose; A0 mark code; "23.32..."/"23.85..." answer prose — ms p15 (READ)'),
}

ZERO_FIX.update({
    # ---- official-4mb1-02-2023-06 ----
    'offp_2023-06_02_8': ('weave-wall part (Working/Notes interleave with displaced fraction parts "2 ⎛5 ⎞"/"⎣⎡ BC = ( y + 2 ) ⎟ − y 2"); '
                          'systemic ≤-glyph loss ("x 8" = x ≤ 8 x6, "2< x 8"); 7/16 fraction loss in "7 x 2 − 4 x + 4 [ 0]"; '
                          '"( 7 y" leading-7 loss; "[ x =] or 8 / [ y =] − or 6" fraction loss; 4/5-3/5 numerator/denominator displaced — '
                          'content-loss + weave classes LEAVE per run-024/025/026 law — ms p13/p14 (READ); mp0 lockstep 1816'),
    'offp_2023-06_02_4-b': ('rows verified print-verbatim: "NB 0.5 × UB × UBsin172 is M0" (sin172 sct), '
                            '"Area of polygon = "45" × "98.54…" or 2 × "45" × "49.27…"" (p10 print has NO ½ — plane EXACT), '
                            '"4430" answer, UB prose; census leads "polygon 2n 4" STALE vs current plane (not present) — '
                            'ms p9/p10 (READ); modern transcription ≤/½/²/√ intact'),
    # ---- official-4mb1-02-2025-06 ----
    'offp_2025-06_02_4-b': ('½ fraction weaves ("× 5 × sin 40" with displaced "1 1 / 2 / 2"); sct trig sin40/cos50/sin50/cos40; '
                            'cos50 spacing variant inside weave; "[=6.155048456]" prose; Cas Working-column label — '
                            'ms-2025-06-4mb1-02-p08-8.png (READ)'),
})

FIXES += [
    # ================= paper official-4mb1-01-2025-06 =================
    # ---- q5 (offp_2025-06_01_5) — lockstep 1007/1007 — MS p7 ----
    ('offp_2025-06_01_5', 'solutionMirror',
     'eg AC 2 + 202 = 42.52',
     'eg $AC^2$ + $20^2$ = $42.5^2$', 1,
     'ms-2025-06-4mb1-01-p07-7.png (150dpi, READ)',
     'AC²/20²/42.5² glued sups (print row 1); "or 2" marks bleed fenced'),
    ('offp_2025-06_01_5', 'solutionMirror',
     'AC 2 + 400 = 1806.25',
     '$AC^2$ + 400 = 1806.25', 1,
     'ms-2025-06-4mb1-01-p07-7.png (150dpi, READ)',
     'AC² glued (print row 2; 400 evaluated print-verbatim)'),
    ('offp_2025-06_01_5', 'solutionMirror',
     '42.52 = AC 2 + 202 − 2 × 20 × cos 90',
     '$42.5^2$ = $AC^2$ + $20^2$ − 2 × 20 × cos 90', 1,
     'ms-2025-06-4mb1-01-p07-7.png (150dpi, READ)',
     'Be-aware note sups (print 42.5² = AC² + 20² − 2×20×cos90)'),
    ('offp_2025-06_01_5', 'solutionMirror',
     '⎡⎣ AC 2 = ⎤⎦ 1806.25 − 400',
     '⎡⎣ $AC^2$ = ⎤⎦ 1806.25 − 400', 1,
     'ms-2025-06-4mb1-01-p07-7.png (150dpi, READ)',
     'AC² in bracket weave (print [AC² =] 1806.25 − 400); √(42.5²−20²) row sqrt-loss fenced'),
    ('offp_2025-06_01_5', 'solutionMirror',
     '⎡⎣ AC 2 = ⎤⎦ 42.52 − 202',
     '⎡⎣ $AC^2$ = ⎤⎦ $42.5^2$ − $20^2$', 1,
     'ms-2025-06-4mb1-01-p07-7.png (150dpi, READ)',
     'sup trio in bracket weave (print [AC² =] 42.5² − 20²)'),
    # ---- q24 (offp_2025-06_01_24) — lockstep 2981/2981 — MS p25+p26 ----
    ('offp_2025-06_01_24', 'solutionMirror',
     'or AB2',
     'or $AB^2$', 1,
     'ms-2025-06-4mb1-01-p25-25.png (150dpi, READ)',
     'AB² glued (M1 note "to find AB or AB²")'),
    ('offp_2025-06_01_24', 'solutionMirror',
     '( AB2 =)538(.1794302)',
     '($AB^2$ =)538(.1794302)', 1,
     'ms-2025-06-4mb1-01-p25-25.png (150dpi, READ)',
     'AB² glued (A1 row print (AB² =)538(.1794302))'),
    ('offp_2025-06_01_24', 'solutionMirror',
     '⎡⎣ AB 2 = ⎤⎦ 538(.1794302)',
     '⎡⎣ $AB^2$ = ⎤⎦ 538(.1794302)', 1,
     'ms-2025-06-4mb1-01-p25-25.png (150dpi, READ)',
     'AB² in bracket weave (ALT block); sine-rule fraction stacks fenced'),
    # ================= paper official-4mb1-02r-2025-06 =================
    # ---- q9-b (offp_2025-06_02r_9-b) — lockstep 665/665 — MS p16 ----
    ('offp_2025-06_02r_9-b', 'solutionMirror',
     'AO 2 = 132 + 202 + 152 [ = 794]',
     '$AO^2$ = $13^2$ + $20^2$ + $15^2$ [ = 794]', 1,
     'ms-2025-06-4mb1-02r-p16-16.png (150dpi, READ)',
     'AO²/13²/20²/15² glued sups (print AO² = 13²+20²+15² [= 794]); "√569" quoted sqrt-loss fenced'),
    ('offp_2025-06_02r_9-b', 'solutionMirror',
     'AN 2 = 132 + 202 + 202 [ = 969]',
     '$AN^2$ = $13^2$ + $20^2$ + $20^2$ [ = 969]', 1,
     'ms-2025-06-4mb1-02r-p16-16.png (150dpi, READ)',
     'AN² sup chain (print AN² = 13²+20²+20² [= 969]); tan∠AOX fraction weaves fenced'),
]

ZERO_FIX.update({
    # ---- official-4mb1-01-2025-06 fences ----
    'offp_2025-06_01_5-lead': ('"[AC=] 42.5 − 20 / 2" √(42.5²−20²) radical-loss weave; ALT "20 2" fragment; '
                               'tan/sin fraction stacks (20/42.5, 42.5/sin90) with displaced "−1 ⎛ 20 ⎞"; "or 2" marks '
                               'bleed; "75/2" prose — ms-2025-06-4mb1-01-p07-7.png (READ)'),
    'offp_2025-06_01_24-lead': ('sine/cosine rule fraction stacks (sin ABL/sin75, cos ABL quotients) woven with displaced '
                                'parts; "eg 180 + 125 + "38.6496..."[ = 343.6496...]" print-verbatim p26; awrt 38/39/66/67/16/73 '
                                'prose; B2 mark code; "wr" bleed; "Total 6 marks" — ms p25/p26 (READ); problem prose 15/22 km'),
    # ---- official-4mb1-01r-2025-06 ----
    'offp_2025-06_01r_2': ('marks-column bleed "or 2" (M1 marks=2); "034 Allow 34"/"Do not ISW" print-verbatim — '
                           'ms-2025-06-4mb1-01r-p05-5.png (READ)'),
    'offp_2025-06_01r_11': ('fragment head "h 3" (h/1500 weave remnant + marks bleed); tan6/tan84/sin6/sin84 fraction '
                            'stacks woven; sct keywords; "NB 1500sin6 = 156.(7…)"/"worth 0 marks"/"When 6 is misread as 60" '
                            'prose print-verbatim; problem trailing "metres" bleed — ms-2025-06-4mb1-01r-p11-11.png (READ)'),
    # ---- official-4mb1-02r-2025-06 (formula-sheet fleet class noted) ----
    'offp_2025-06_02r_9-b-lead': ('"√569" quoted sqrt-loss x2; tan∠AOX/cos∠AOX/sin∠AOX fraction weaves; '
                                  'cos∠AON "794"+"5"−"969" weave; tan∠ANX stack — ms p16 (READ); '
                                  'formula-sheet boilerplate "a b c 2bc cos A 2 2 2" flattened = FLEET-WIDE class '
                                  '(every QP formula page; candidate for dedicated restoration run — fenced this wave)'),
})
