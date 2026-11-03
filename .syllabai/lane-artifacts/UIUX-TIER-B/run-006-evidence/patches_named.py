#!/usr/bin/env python3
"""run-006 named-part patches — every string below transcribed eyes-on from the
MS/QP pages of record rendered in scripts/run006/render/ (see receipt)."""

# Row-level patches: (set_slug, q_order, p_order) -> {field: {Ptag: new_row}}
# Rows NOT listed are kept byte-identical. problemMd furniture handled separately.

ROW_PATCHES = {
    # 2024-06-02R Q8(c) P10/P11 — MS p15 (90/145 x (90-1)/(145-1) decode of record)
    ("2024-06-4mb1-02r", 7, 2): {
        "solutionMd": {
            "**P10**": (
                "**P10** (1 mark) A correct product\n"
                "- Note: $\\dfrac{90}{145} \\times \\dfrac{90-1}{145-1}$ oe\n"
                "- Note: Allow $\\left(\\dfrac{90}{145}\\right)^2 = \\dfrac{324}{841} \\approx 0.385$\n"
                "- Note: Condone $2 \\times \\dfrac{90}{145} \\times \\dfrac{90-1}{145-1}$ and $2 \\times \\left(\\dfrac{90}{145}\\right)^2$"
            ),
            "**P11**": (
                "**P11** (1 mark) oe eg 0.38(36…) [decimal or % 2sf or better]\n"
                "- Note: $\\dfrac{89}{232}$\n"
                "- Note: Allow 0.38 - 0.3853\n"
                "- Note: cas for each part Total 11 marks"
            ),
        }
    },

    # 2023-11-02 Q6(d) P8 — MS p11: A1cas, answer 45 (D/A/B/C orphans = debris)
    ("2023-11-4mb1-02", 5, 3): {
        "solutionMd": {
            "**P8**": (
                "**P8** (1 mark) cas\n"
                "- Note: 45"
            ),
        }
    },

    # 2025-06-02R Q9(a) — MS p16: P1/P2 missing Working lines, P4 missing first
    # product line, P5 dropped 22/7
    ("2025-06-4mb1-02r", 8, 0): {
        "solutionMd": {
            "**P1**": (
                "**P1** (1 mark) correct method to find area of one of the\n"
                "- Note: rectangular sides Allow $2 \\times 17 \\times 20\\ [ = 680]$\n"
                "- Note: $17 \\times 20\\ [ = 340]$ or $26 \\times 20\\ [ = 520]$"
            ),
            "**P2**": (
                "**P2** (1 mark) for a method to find the surface area of the\n"
                "- Note: cylinder or half-cylinder.\n"
                "- Note: $2\\pi \\times 5 \\times 20\\ [ = 200\\pi = 628.318...]$ or $\\pi \\times 5 \\times 20\\ [ = 100\\pi = 314.159...]$\n"
                "- Note: and $\\pi \\times 5^2\\ [ = 25\\pi$ = 78.539...] or $0.5 \\times \\pi \\times 5^2\\left[= \\dfrac{25}{2}\\pi = 39.269\\ldots\\right]$\n"
                "- Note: Allow $\\pi \\times 5 \\times 20 + \\pi \\times 5^2\\ [ = 125\\pi$ = 392.699...]"
            ),
            "**P4**": (
                "**P4** (1 mark) dep on previous 3 method marks awarded. For a\n"
                "- Note: fully correct method to find the surface area.\n"
                "- Note: $2 \\times \\text{\"270\"} + \\text{\"314.159\"} + \\text{\"78.539\"} + 2 \\times \\text{\"340\"} + \\text{\"520\"}\\ [ = 2132.699...]$ oe\n"
                "- Note: \"540\"+ \"(100 + 25)$\\pi$ \"+ \"680\"+ \"520\"[ = 125$\\pi$ + 1740]"
            ),
            "**P5**": (
                "**P5** (1 mark) cas awrt 2100 ignore units\n"
                "- Note: Allow 3, 3.1, 3.14 etc or $\\dfrac{22}{7}$ for $\\pi$"
            ),
        }
    },

    # 2026-06-01R Q24(a) — MS p30: P1 gains the chord-theorem form + d/2 oe-eg,
    # Pythagoras forms re-typeset; P2 gains the 36r working; P4 gains 18xPA
    ("2026-06-4mb1-01r", 23, 0): {
        "solutionMd": {
            "**P1**": (
                "**P1** (1 mark) correctly form equation using intersecting chord theorem\n"
                "- Note: or correct equation using Pythagoras' theorem\n"
                "- Note: $(18 - 2r) \\times 18 = 12^2$ oe or\n"
                "- Note: $(18 - r)^2 = 12^2 + r^2$\n"
                "- Note: oe eg $\\left(18 - \\dfrac{d}{2}\\right)^2 = 12^2 + \\left(\\dfrac{d}{2}\\right)^2$"
            ),
            "**P2**": (
                "**P2** (1 mark) dep on previous M Correctly isolate terms in r\n"
                "- Note: and eliminate $r^2$ if using Pythagoras\n"
                "- Note: $36r = 18^2 - 12^2\\ [ = 180]$ oe"
            ),
            "**P4**": (
                "**P4** (1 mark) Correct equation to find PA or d\n"
                "- Note: $18 \\times PA = 12^2$ oe\n"
                "- Note: $(18 - d) \\times 18 = 12^2$ oe\n"
                "- Note: [PA = 8 or d = 10]"
            ),
        }
    },

    # 2026-06-01R Q24(b) — MS p30/p31: P7 fraction rebuild, P8 = ALT 2-mark row
    # (MS p31 literally prints sin90/12 = sin(POC)/13 and sin^-1(13/12) — kept
    # AS PRINTED per no-guess law, disclosed in receipt), P9 gains cas/7.5
    ("2026-06-4mb1-01r", 23, 1): {
        "solutionMd": {
            "**P7**": (
                "**P7** (1 mark) Correct use of similar triangles, ft their 5 from (a)\n"
                "- Allow: seen in part (a) if used in part (b)\n"
                "- Note: \"5\"$\\times\\dfrac{18}{12}$ oe or $(12 + x)^2 = 18^2 + x^2$ oe or correctly forms equation using Pythagoras\n"
                "- Note: BQ = CQ (equal tangents) so a correct equation also is\n"
                "- Note: $\\left(12 + CQ^2\\right)^2 = 18^2 + CQ^2$"
            ),
            "**P8**": (
                "**P8** (2 marks) ALT Full correct method to find angle OPT (= angle BPQ) awrt 23\n"
                "- Note: and correct equation with BQ and this angle.\n"
                "- Note: $[\\angle OPC =] \\tan^{-1}\\dfrac{\\text{\"5\"}}{12}\\ [ = 22.61986....]$ awrt 23\n"
                "- Note: $\\tan\\text{\"22.61986..\"} = \\dfrac{BQ}{18}$ oe\n"
                "- Note: or\n"
                "- Note: $\\left[\\dfrac{\\sin 90}{12} = \\dfrac{\\sin(POC)}{13}\\right]$\n"
                "- Note: $[\\text{POC} =] \\sin^{-1}\\left(\\dfrac{13}{12}\\right) = 67.3801......$\n"
                "- Note: $OPC = 90 - \\text{\"67.3801.......\"}\\ [ = 22.61986....]$\n"
                "- Note: $\\dfrac{\\sin\\text{\"22.61986....\"}}{BQ} = \\dfrac{\\sin\\text{\"67.3801.......\"}}{18}$"
            ),
            "**P9**": (
                "**P9** (1 mark) oe\n"
                "- Note: cas\n"
                "- Note: 7.5"
            ),
        }
    },
}

# problemMd furniture strip (run-005 'Question N continued' class continuation)
PROBLEMMD_STRIPS = [
    ("2023-11-4mb1-02", 5, 3, "\n\nQuestion 6 continued"),
]

# Full-solutionMd rebuild: 2023-06-01 Q28 (P1-P23, four schemes ALT1/2/3-Herons)
Q28_SLUG, Q28_Q, Q28_P = "2023-06-4mb1-01", 27, 0
Q28_SOLUTION = """**P1** (1 mark) using cosine rule to find an angle
- Note: $10^2 = 16^2 + 20^2 - 2 \\times 16 \\times 20\\cos CBA$
- Note: $16^2 = 10^2 + 20^2 - 2 \\times 10 \\times 20\\cos CAB$
- Note: $20^2 = 16^2 + 10^2 - 2 \\times 16 \\times 10\\cos BCA$

**P2** (1 mark) this mark implies the previous mark Allow $\\angle CBA = $awrt 29.7 ,
- Note: $\\angle CAB = $awrt 52.4 , $\\angle BCA = $awrt 97.9 , Allow for angles on diagram
- Note: $\\cos CBA = \\dfrac{16^2 + 20^2 - 10^2}{2 \\times 16 \\times 20}$ or
- Note: $\\cos CAB = \\dfrac{10^2 + 20^2 - 16^2}{2 \\times 10 \\times 20}$ or Allow $\\frac{1}{2}\\angle CBA = $awrt 14.8 or $\\frac{1}{2}\\angle CAB = $awrt 26.2 or $\\frac{1}{2}\\angle BCA = $awrt 49.0
- Note: $\\cos BCA = \\dfrac{16^2 + 10^2 - 20^2}{2 \\times 16 \\times 10}$

**P3** (1 mark) Any 3 of the equations linking a, b, c and r
- Note: $a + b = 20$, $a + c = 10$, $b + c = 16$ oe
- Note: $\\dfrac{r}{a} = $tan"26.2" , $\\dfrac{r}{b} = $tan"14.8" , $\\dfrac{r}{c} = $tan"49.0" oe
- Note: Where AD = AF = a, BD = BE = b, CE = CF = c Take what they have labelled on their diagram or in their working.
- Note: May be implied by an equivalent expression.
- Note: eg BD = 20 - a which may be seen on the diagram as the length BD is equivalent to a + b = 20. These may then be used in further working eg $\\dfrac{r}{20-a} = $tan"14.8"
- Note: May be implied by correct value of a, b or c
- Note: Possible equivalent formulae are:
- Note: a − 4 = 10 − a , a + 6 = 20 − a , b − 6 = 20 − b , b − 10 = 16 − b , c + 10 = 16 − c and c + 4 = 10 − c

**P4** (1 mark) Any correct value for a, b or c
- Note: $a = 7$ or $b = 13$ or $c = 3$
- Note: Give if any of these values seen in working even if it is not clear which length is which.
- Note: This implies the previous mark.

**P5** (1 mark) Method to find r ft their numerical length or angle which may be seen on the
- Note: diagram allow alternative method eg $\\dfrac{r}{\\sin\\text{\"26.2\"}} = \\dfrac{\\text{\"7\"}}{\\sin(90-\\text{\"26.2\"})}$
- Note: $r = $ "13"tan("14.8") or $r = $ "7"tan("26.2") or $r = $ "3"tan("49.0")

**P6** (1 mark) accept answer between 3.4 and 3.5 inclusive
- Note: Correct answer scores full marks Total 6 marks

**P7** (1 mark) using cosine rule to find an angle
- Note: ALT 1
- Note: $10^2 = 16^2 + 20^2 - 2 \\times 16 \\times 20\\cos CBA$
- Note: $16^2 = 10^2 + 20^2 - 2 \\times 10 \\times 20\\cos CAB$
- Note: $20^2 = 16^2 + 10^2 - 2 \\times 16 \\times 10\\cos BCA$

**P8** (1 mark) this mark implies the previous mark Allow $\\angle CBA = $awrt 29.7 ,
- Note: $\\angle CAB = $awrt 52.4 , $\\angle BCA = $awrt 97.9 , Allow for angles on diagram
- Note: $\\cos CBA = \\dfrac{16^2 + 20^2 - 10^2}{2 \\times 16 \\times 20}$ or
- Note: $\\cos CAB = \\dfrac{10^2 + 20^2 - 16^2}{2 \\times 10 \\times 20}$ or Allow $\\frac{1}{2}\\angle CBA = $awrt 14.8 or $\\frac{1}{2}\\angle CAB = $awrt 26.2 or $\\frac{1}{2}\\angle BCA = $awrt 49.0
- Note: $\\cos BCA = \\dfrac{16^2 + 10^2 - 20^2}{2 \\times 16 \\times 10}$

**P9** (1 mark) Method to find area of ABC
- Note: $\\text{Area} = \\dfrac{1}{2} \\times 20 \\times 16 \\times \\sin(\\text{\"29.7\"}) = [79.2...]$ or
- Note: $\\text{Area} = \\dfrac{1}{2} \\times 10 \\times 16 \\times \\sin(\\text{\"97.9\"}) = [79.2...]$ or
- Note: $\\text{Area} = \\dfrac{1}{2} \\times 10 \\times 20 \\times \\sin(\\text{\"52.4\"}) = [79.2...]$ oe

**P10** (1 mark) Use area to form an equation involving r
- Note: $\\dfrac{1}{2}16r + \\dfrac{1}{2}10r + \\dfrac{1}{2}20r = $ "79.2"

**P11** (1 mark) Method to find r
- Note: $\\text{\"79.2\"} = \\text{\"23\"}r$

**P12** (1 mark) awrt 3.4
- Note: Correct answer scores full marks Total 6 marks

**P13** (1 mark) using cosine rule to find an angle
- Note: ALT 2
- Note: $10^2 = 16^2 + 20^2 - 2 \\times 16 \\times 20\\cos CBA$
- Note: $16^2 = 10^2 + 20^2 - 2 \\times 10 \\times 20\\cos CAB$
- Note: $20^2 = 16^2 + 10^2 - 2 \\times 16 \\times 10\\cos BCA$

**P14** (1 mark) this mark implies the previous mark Allow $\\angle CBA = $awrt 29.7 ,
- Note: $\\angle CAB = $awrt 52.4 , $\\angle BCA = $awrt 97.9 , Allow for angles on diagram
- Note: $\\cos CBA = \\dfrac{16^2 + 20^2 - 10^2}{2 \\times 16 \\times 20}$ or
- Note: $\\cos CAB = \\dfrac{10^2 + 20^2 - 16^2}{2 \\times 10 \\times 20}$ or Allow $\\frac{1}{2}\\angle CBA = $awrt 14.8 or $\\frac{1}{2}\\angle CAB = $awrt 26.2 or $\\frac{1}{2}\\angle BCA = $awrt 49.0
- Note: $\\cos BCA = \\dfrac{16^2 + 10^2 - 20^2}{2 \\times 16 \\times 10}$

**P15** (1 mark) Fully correct method to find OA, OB or OC from their angles
- Note: $\\angle AOC = 180 - \\text{\"49\"} - \\text{\"26.2\"}\\ [ = 105]$ and $\\dfrac{OA}{\\sin(\\text{\"49\"})} = \\dfrac{10}{\\sin\\text{\"105\"}}$ or
- Note: $\\angle AOB = 180 - \\text{\"14.8\"} - \\text{\"26.2\"}\\ [ = 139]$ and $\\dfrac{OB}{\\sin(\\text{\"26.2\"})} = \\dfrac{20}{\\sin\\text{\"139\"}}$ or
- Note: $\\angle BOC = 180 - \\text{\"14.8\"} - \\text{\"49\"}\\ [ = 116]$ and $\\dfrac{OC}{\\sin(\\text{\"14.8\"})} = \\dfrac{16}{\\sin\\text{\"116\"}}$

**P16** (1 mark) any of OA, OB or OC to at least 1 decimal place
- Note: $OA = $ awrt 7.8 or $OB = $ awrt 13.5 or $OC = $ awrt 4.6

**P17** (1 mark) Method to find r
- Note: $r = $ "7.8"sin("26.2") or $r = $ "4.6"sin("49.0") or $r = $ "13.5"sin("14.8")

**P18** (1 mark) awrt 3.4
- Note: Correct answer scores full marks Total 6 marks

**P19** (1 mark) Find semiperimeter
- Note: ALT 3 Herons
- Note: $\\dfrac{16+10+20}{2}\\ [ = 23]$

**P20** (2 marks) Find area
- Note: $\\sqrt{\\text{\"23\"}(\\text{\"23\"}-16)(\\text{\"23\"}-10)(\\text{\"23\"}-20)}\\ [ = 79.2...]$

**P21** (1 mark) Use area to form an equation involving r
- Note: $\\text{Area of triangle } ABC = \\dfrac{1}{2}16r + \\dfrac{1}{2}10r + \\dfrac{1}{2}20r$

**P22** (1 mark) Method to find r
- Note: $\\text{\"79.2\"} = \\text{\"23\"}r$

**P23** (1 mark) awrt 3.4
- Note: Correct answer scores full marks Total 6 marks"""

# Full rebuild: 2026-06-01R Q21 — problemMd (QP p18: M/N minus signs restored)
# + solutionMd P1-P4 (MS p25 main method, matrices as pmatrix)
Q21_SLUG, Q21_Q, Q21_P = "2026-06-4mb1-01r", 20, 0
Q21_PROBLEMMD = """Shape A is transformed to shape B under the transformation with matrix M where

$M = \\begin{pmatrix} 1 & 1 \\\\ -3 & -4 \\end{pmatrix}$

Shape B is transformed to shape C under the transformation with matrix N where

$N = \\begin{pmatrix} 3 & -4 \\\\ 4 & -5 \\end{pmatrix}$

Shape C is transformed to shape A under the transformation with matrix P

Find the matrix P"""

Q21_SOLUTION = """**P1** (1 mark) Attempt to find NM (at least 2 values in the matrix correct)
- Note: $[\\text{NM} =] \\begin{pmatrix} 15 & 19 \\\\ 19 & 24 \\end{pmatrix}$

**P2** (1 mark) Correct method to find determinant of their NM
- Note: $\\left|\\begin{pmatrix} 15 & 19 \\\\ 19 & 24 \\end{pmatrix}\\right| = 15 \\times 24 - 19 \\times 19\\ [ = -1]$ (allow their MN)
- Note: Eg for MN $\\left|\\begin{pmatrix} 7 & -9 \\\\ -25 & 32 \\end{pmatrix}\\right| = 7 \\times 32 - (-9) \\times (-25)\\ [ = -1]$
- Note: For reference $\\text{MN} = \\begin{pmatrix} 7 & -9 \\\\ -25 & 32 \\end{pmatrix}$, $7 \\times 32 - (-9 \\times -25)\\ [ = -1]$
- Note: For an incorrect NM or MN, correct working must be shown for their matrix product

**P3** (1 mark) ft their NM (allow their MN)
- Note: $(\\text{NM})^{-1} = \\dfrac{1}{-1}\\begin{pmatrix} 24 & -19 \\\\ -19 & 15 \\end{pmatrix}$
- Note: This mark is for (ignore the determinant)
- Note: $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\rightarrow \\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$ with their NM or their MN

**P4** (1 mark)
- Note: $\\begin{pmatrix} -24 & 19 \\\\ 19 & -15 \\end{pmatrix}$
- Note: or
- Note: $-\\begin{pmatrix} 24 & -19 \\\\ -19 & 15 \\end{pmatrix}$
- Note: Allow eg $-\\dfrac{1}{1}\\begin{pmatrix} 24 & -19 \\\\ -19 & 15 \\end{pmatrix}$ or eg $\\dfrac{1}{-1}\\begin{pmatrix} 24 & -19 \\\\ -19 & 15 \\end{pmatrix}$"""
