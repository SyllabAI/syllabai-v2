#!/usr/bin/env python3
r"""run-024 tranche-2 wave-1 FIXES (eyes-on-adjudicated, NO-GUESS).

Wave-1 units (twin-pair deduped; every fix verified against the MS/QP page of
record rendered @150dpi and READ first-hand — see evidence field):

  offp_2022-06_01r_22-a        2022-06-01R q22(a)  ms p15/p16
  offp_2024-06_02_7-a          2024-06 q7(a)        ms p14 (mirror carries 4ch
                                                    big-paren glyph delta — fixed
                                                    independently, delta preserved)
  offp_2024-06_02_7-b          2024-06 q7(b)        ms p14 + qp p16 (cosine-rule
                                                    formula line: a²/b²/c² print)
  offp_2021-06_02_10-b         2021-06 q10(b)       ms p20/p21/p23/p24 (nmp=0,
                                                    solution-only attach part)
  offp_2020-06_01_26 + 11_26   twin pair            ms p18 + qp p20 (solution and
                                                    mirror DIVERGED — independent
                                                    per-field fixes, no overwrite)
  offp_2020-06_01_28 + 11_28   twin pair            ms p20 (4²+4² cosine-rule lines)
  offp_2020-06_01_16 + 11_16   twin pair            ms p12 — ZERO fixes due (all
                                                    hits print-verbatim/furniture;
                                                    page-evidenced discharge)

Tuple: (pid, field, old, new, exp, evidence, note)
  field: 'solutionMirror' (solutionMd + lockstep mirror, byte-check pre-apply)
       | 'solution' | 'mirror' (markPoints[0].textMd) | 'problem'
  exp  : expected occurrence count (fail-closed; exp!=1 replaces ALL)
ORDER MATTERS for the documented sequence-dependent tuples (22-a f11->f13,
26-mirror j4->j5): the battery applies tuples in list order.
"""

def _twins(pids):
    """Expand a 26/28-style tuple template across twin members."""
    return pids

_22A = 'offp_2022-06_01r_22-a'
_7A = 'offp_2024-06_02_7-a'
_7B = 'offp_2024-06_02_7-b'
_10B = 'offp_2021-06_02_10-b'
_26 = ['offp_2020-06_01_26', 'offp_2020-11_01_26']
_28 = ['offp_2020-06_01_28', 'offp_2020-11_01_28']

E_22 = 'ms-2022-06-01R-p15-15.png + ms-2022-06-01R-p16-16.png (150dpi, READ)'
E_7A = 'ms-2024-06-02-p14-14.png (150dpi, READ)'
E_7B = 'ms-2024-06-02-p14-14.png + qp-2024-06-02-p16-16.png (150dpi, READ)'
E_10B = 'ms-2021-06-02-p20/21/23/24 (150dpi, READ)'
E_26 = 'ms-2020-06-01-p18-18.png + qp-2020-06-01-p20-20.png (150dpi, READ; twins byte-identical payloads)'
E_28 = 'ms-2020-06-01-p20-20.png (150dpi, READ; twins byte-identical payloads)'

FIXES = [
    # ---------- 22-a (solutionMirror; mp0 == solution byte-exact) ----------
    (_22A, 'solutionMirror',
     'eg L2 + 9 + = or L2 + = or', 'eg $L^2$ + 9 + = or $L^2$ + = or', 1,
     E_22, 'L2 x2 -> L^2 (p15 row2 eg line)'),
    (_22A, 'solutionMirror',
     'L (CH) or L2 from a correct second application of',
     'L (CH) or $L^2$ from a correct second application of', 1,
     E_22, 'L2 -> L^2 (p15 notes M1 row)'),
    (_22A, 'solutionMirror',
     '( L2 =) −9− or ( L2 =) −', '( $L^2$ =) −9− or ( $L^2$ =) −', 1,
     E_22, 'L2 x2 -> L^2 (p15 row3)'),
    (_22A, 'solutionMirror',
     '( L2 = ) 3 −368 x − 1 −92 x', '( $L^2$ = ) 3 −368 x − 1 −92 x', 1,
     E_22, 'L2 -> L^2 (p15 row4 numerator line)'),
    (_22A, 'solutionMirror',
     'CH or L2', 'CH or $L^2$', 1,
     E_22, 'L2 -> L^2 (p15 notes: unsimplified fraction for L/CH or L^2)'),
    (_22A, 'solutionMirror',
     'Or ( L2 = )', 'Or ( $L^2$ = )', 1,
     E_22, 'L2 -> L^2 (p15 row4 Or line)'),
    (_22A, 'solutionMirror',
     'or for getting to L2 = )', 'or for getting to $L^2$ = )', 1,
     E_22, 'L2 -> L^2 (p15 notes: getting-to line)'),
    (_22A, 'solutionMirror',
     'AD 2 + CD 2 = AC 2 ⇒ AC 2 = 9 + 9',
     '$AD^2$ + $CD^2$ = $AC^2$ ⇒ $AC^2$ = 9 + 9', 1,
     E_22, 'Pythagoras chain block 1 (p15 row1)'),
    (_22A, 'solutionMirror',
     'AD 2 + CD 2 = AC 2 ⇒ AC 2 = 9 + (possibly',
     '$AD^2$ + $CD^2$ = $AC^2$ ⇒ $AC^2$ = 9 + (possibly', 1,
     E_22, 'Pythagoras chain block 2 (p16 ALTERNATIVE row1)'),
    (_22A, 'solutionMirror',
     'eg may see AC 2 or AC etc.', 'eg may see $AC^2$ or AC etc.', 1,
     E_22, 'AC^2 (p15 notes row1)'),
    (_22A, 'solutionMirror',
     'oe eg AC 2 = 32 + need not be simplified',
     'oe eg $AC^2$ = $3^2$ + need not be simplified', 1,
     E_22, 'AC^2 + 3^2 catch-all (p15 row2 oe eg line: print AC^2 = 3^2 + ...)'),
    # order-dependent: f11 must run before this (frees the 'eg AC 2' anchor)
    (_22A, 'solutionMirror',
     'eg AC 2', 'eg $AC^2$', 1,
     E_22, 'AC^2 (p16 notes: eg AC^2 = 9/(1-2x))'),
    (_22A, 'solutionMirror',
     'AH 2 AD 2 DC 2 L2 M1', '$AH^2$ $AD^2$ $DC^2$ $L^2$ M1', 1,
     E_22, 'p16 ALTERNATIVE row2: AH^2 = AD^2 + DC^2 + L^2 summary tokens'),
    # ---------- 7-a (solution AND mirror independently; 4ch glyph delta) ----------
    (_7A, 'solution', '+ 402 = 80 or', '+ $40^2$ = 80 or', 1, E_7A,
     '40^2 catch-all (p14 working: sqrt((40/tan30)^2 + 40^2) = 80)'),
    (_7A, 'mirror', '+ 402 = 80 or', '+ $40^2$ = 80 or', 1, E_7A, 'mirror of 40^2'),
    (_7A, 'solution', 'and BF 2 = 402 + "4800"', 'and $BF^2$ = $40^2$ + "4800"', 1,
     E_7A, 'BF^2 = 40^2 + "4800" (p14 notes eg line)'),
    (_7A, 'mirror', 'and BF 2 = 402 + "4800"', 'and $BF^2$ = $40^2$ + "4800"', 1,
     E_7A, 'mirror'),
    (_7A, 'solution', '(NB BC2 = 4800 and BC = 40 3', '(NB $BC^2$ = 4800 and BC = 40 3', 1,
     E_7A, 'BC^2 (p14 NB line; the 40 3 radical-flatten is FENCED — leave)'),
    (_7A, 'mirror', '(NB BC2 = 4800 and BC = 40 3', '(NB $BC^2$ = 4800 and BC = 40 3', 1,
     E_7A, 'mirror'),
    (_7A, 'solution', '⎡⎣ EH 2 = ⎤⎦ 1002 + ("80"− 57.5 )',
     '⎡⎣ $EH^2$ = ⎤⎦ $100^2$ + ("80"− 57.5 )', 1, E_7A,
     'EH^2 + 100^2 (p14 eg line; the (57.5)^2 sup is DELETED in plane — disclosed leave'),
    (_7A, 'mirror', '⎡⎣ EH 2 = ⎤⎦ 1002 + ("80"− 57.5 )',
     '⎡⎣ $EH^2$ = ⎤⎦ $100^2$ + ("80"− 57.5 )', 1, E_7A, 'mirror'),
    (_7A, 'solution', 'method to find EH2 or EH', 'method to find $EH^2$ or EH', 1,
     E_7A, 'EH^2 prose mention (p14 notes)'),
    (_7A, 'mirror', 'method to find EH2 or EH', 'method to find $EH^2$ or EH', 1,
     E_7A, 'mirror'),
    (_7A, 'solution', 'eg ⎡⎣ EH 2 = ⎤⎦ 1002 + ( 22.5 ) or [ EH =] 1002 + ( 22.5)',
     'eg ⎡⎣ $EH^2$ = ⎤⎦ $100^2$ + ( 22.5 ) or [ EH =] $100^2$ + ( 22.5)', 1,
     E_7A, 'EH^2 + 100^2 x2 (p14 A1oe eg line; (22.5)^2 sups DELETED — disclosed leave)'),
    (_7A, 'mirror', 'eg ⎡⎣ EH 2 = ⎤⎦ 1002 + ( 22.5 ) or [ EH =] 1002 + ( 22.5)',
     'eg ⎡⎣ $EH^2$ = ⎤⎦ $100^2$ + ( 22.5 ) or [ EH =] $100^2$ + ( 22.5)', 1, E_7A, 'mirror'),
    (_7A, 'solution', 'condone 1002 + ( 57.5 − "80")', 'condone $100^2$ + ( 57.5 − "80")', 1,
     E_7A, '100^2 (p14 condone line)'),
    (_7A, 'mirror', 'condone 1002 + ( 57.5 − "80")', 'condone $100^2$ + ( 57.5 − "80")', 1,
     E_7A, 'mirror'),
    (_7A, 'solution', 'expression for EH2 or EH seen leading to',
     'expression for $EH^2$ or EH seen leading to', 1, E_7A, 'EH^2 prose (p14 A1oe notes)'),
    (_7A, 'mirror', 'expression for EH2 or EH seen leading to',
     'expression for $EH^2$ or EH seen leading to', 1, E_7A, 'mirror'),
    (_7A, 'solution', 'eg ⎡⎣ EH 2 = ⎤⎦ 1002 + ( 22.5 ) or 10506.25 or',
     'eg ⎡⎣ $EH^2$ = ⎤⎦ $100^2$ + ( 22.5 ) or 10506.25 or', 1, E_7A,
     'EH^2 + 100^2 (p14 A1oe second eg line)'),
    (_7A, 'mirror', 'eg ⎡⎣ EH 2 = ⎤⎦ 1002 + ( 22.5 ) or 10506.25 or',
     'eg ⎡⎣ $EH^2$ = ⎤⎦ $100^2$ + ( 22.5 ) or 10506.25 or', 1, E_7A, 'mirror'),
    # ---------- 7-b (problem: no mirror; solutionMirror: lockstep) ----------
    (_7B, 'problem',
     '[ Cosine rule: a2 = b2 + c2 – 2bc cos A ]',
     '[ Cosine rule: $a^2$ = $b^2$ + $c^2$ – 2bc cos A ]', 1,
     E_7B, 'cosine-rule formula line — print qp p16: a^2 = b^2 + c^2 - 2bc cos A'),
    (_7B, 'solutionMirror',
     'cos 30 802 − 402 − 57.5 cos 30', 'cos 30 $80^2$ − $40^2$ − 57.5 cos 30', 1,
     E_7B, '80^2/40^2 catch-alls (p14 7(b) M1 working: sqrt(80^2-40^2)-57.5cos30)'),
    (_7B, 'solutionMirror',
     '⎡⎣ DH 2 = ⎤⎦ 1002 + ("19.485...") + ("28.75")',
     '⎡⎣ $DH^2$ = ⎤⎦ $100^2$ + ("19.485...") + ("28.75")', 1, E_7B,
     'DH^2 + 100^2 (p14 M1 line; (19.485)^2/(28.75)^2 sups DELETED — disclosed leave)'),
    (_7B, 'solutionMirror',
     'method to find DH2 or DH ft', 'method to find $DH^2$ or DH ft', 1,
     E_7B, 'DH^2 prose (p14 notes)'),
    # ---------- 10-b (solution only; nmp=0 attach part) ----------
    (_10B, 'solution',
     'AD2 − (6cos129) AD − 61.56 = 0', '$AD^2$ − (6cos129) AD − 61.56 = 0', 1,
     E_10B, 'AD^2 (p21 Case 2 quadratic line)'),
    (_10B, 'solution',
     '8.42 = 32 + AD 2 − 2 ( 3)( AD ) cos (180 − 51)',
     '$8.4^2$ = $3^2$ + $AD^2$ − 2 ( 3)( AD ) cos (180 − 51)', 3,
     E_10B, '8.4^2/3^2/AD^2 catch-alls x3 (p23 Method II Cases 1/2 + p24 Case 3, identical print lines)'),
    # ---------- 26-twin (solution and mirror DIVERGED — independent) ----------
    *[(pid, 'solution', '(= √3x2)', '(= √3$x^2$)', 3, E_26,
       'x^2 x3 (p18 working rows 1-3: (= sqrt3 x^2))') for pid in _26],
    *[(pid, 'mirror', '(= √3x2)', '(= √3$x^2$)', 3, E_26,
       'mirror x^2 x3') for pid in _26],
    *[(pid, 'mirror', '(= x2 )', '(= $x^2$ )', 1, E_26,
       'mirror x^2 (p18 row4; solution twin already carries the ² glyph)') for pid in _26],
    # order-dependent: j4 before j5 (j5 targets the 4th, or-less, occurrence)
    *[(pid, 'mirror', '× π × (2x)2 (= 3 πx2 ) or', '× π × $(2x)^2$ (= 3 π$x^2$ ) or', 3,
       E_26, 'mirror (2x)^2 + pi x^2 x3 (p18 sector rows 240/120/60)') for pid in _26],
    *[(pid, 'mirror', '(2x)2 (= 3 πx2 )', '$(2x)^2$ (= 3 π$x^2$ )', 1,
       E_26, 'mirror 4th sector row (p18 row 30/360)') for pid in _26],
    *[(pid, 'mirror', '× π × (2 x)2 + 2 × 0.5', '× π × $(2 x)^2$ + 2 × 0.5', 1,
       E_26, 'mirror (2x)^2 spaced variant (p18 M1 dep row)') for pid in _26],
    *[(pid, 'mirror', 'π × (2x)2 – 2 ×', 'π × $(2x)^2$ – 2 ×', 1,
       E_26, 'mirror (2x)^2 (p18 final-method row)') for pid in _26],
    *[(pid, 'mirror', '(360 × π × (2x)2 – 0.5', '(360 × π × $(2x)^2$ – 0.5', 1,
       E_26, 'mirror (2x)^2 (p18 A1 bracket row)') for pid in _26],
    # ---------- 28-twin (solutionMirror lockstep) ----------
    *[(pid, 'solutionMirror',
       '√42 + 42 – 2 × 4 × 4 × cos 135°', '√$4^2$ + $4^2$ – 2 × 4 × 4 × cos 135°', 1,
       E_28, '4^2+4^2 catch-alls (p20 GE cosine-rule line 135°)') for pid in _28],
    *[(pid, 'solutionMirror',
       'GE = 42 + 42 − 2 × 4 × 4 × cos 45', 'GE = $4^2$ + $4^2$ − 2 × 4 × 4 × cos 45', 1,
       E_28, '4^2+4^2 (p20 second block GE line 45°)') for pid in _28],
]

# zero-fix discharges (page-evidenced, no tuples): 16-twin pair
ZERO_FIX = {
    'offp_2020-06_01_16': 'ms-2020-06-01-p12-12.png: all hits print-verbatim '
                          '(tan75/tan15 keywords, "of 15º/75º" prose, "is 75°" prose); '
                          'leading "x 4" = fraction x/5 + marks-column bleed furniture (filed lead, not a sup)',
    'offp_2020-11_01_16': 'twin of offp_2020-06_01_16 (byte-identical payload) — same discharge',
}
