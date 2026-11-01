#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-036: Mode-A table->GFM tranche-2 — FIX SET part A (2018-06..2019-06, 13 parts).

Every NEW problemMd authored against first-hand evidence:
  - 13 contact sheets of the corpus-of-record crop PNGs (sheet-01..13, t2_sheet_map.json)
  - QP page texts pdftotext -layout from the upload/ official-4MB1-* set (@census pages)
  - per-value arithmetic corroboration (exact) for every equation restoration

Fix tuple shape: {pid, kind, note, ev, new, drop_assets, drop_expect}
  new=None  -> assets-only fix (pmd untouched; battery extension)
  drop_expect -> number of assets[] entries with that path (default 1; >1 when the
                 plane legitimately carries duplicate refs, disclosed in note)
kinds: table-reconstruction (Mode A) / symbol-restoration (Mode B, evidence in ev).
"""

_A = "assets/"

FIXES_A = [
    # ---------------- 2018-06 4MB1-02 ----------------
    {
        "pid": "offp_2018-06_02_10-b",
        "kind": "table-reconstruction",
        "note": "10(b) plot part: shared table crop ref replaced by the GFM table "
                "(identical printed table to tranche-1 10(a)); own grid ref kept; crop dropped",
        "ev": "crop asset_10_a_table.png of record (sheet-01 #1); table identical to tranche-1 "
              "10(a) conversion (y = x^2 - 5x + 8/x, values 4/-2/-2/7.33 corroborated exact)",
        "new": (
            "On the grid, plot the points from your completed table and join them to form a smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.31) (same figure as 10(b))]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2018-06/4MB1-02/assets/asset_10_b_grid.png)\n\n"
            "| $x$ | $0.8$ | $1$ | $2$ | $3$ | $4$ | $5$ | $6$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  | $4$ | $-2$ |  | $-2$ |  | $7.33$ |"
        ),
        "drop_assets": [_A + "asset_10_a_table.png"],
    },
    {
        "pid": "offp_2018-06_02r_2-a",
        "kind": "table-reconstruction",
        "note": "2(a) table -> GFM; Mode-B repairs: drawn-curve 'y = x 2 - 3x - 1' -> $y = x^2 - 3x - 1$ "
                "and 'y = -x 2 - 2x + 4' -> $y = -x^2 - 2x + 4$ (superscripts lost at extraction)",
        "ev": "crop asset_2_a_table.png of record (sheet-01 #2) + p4 page text "
              "('Part of the curve with equation y = x2 - 3x - 1'); arithmetic y(-4)=-4, y(-1)=5, y(1)=1 exact",
        "new": (
            "Part of the curve with equation $y = x^2 - 3x - 1$ is drawn on the grid on the opposite page. "
            "The equation of another curve is $y = -x^2 - 2x + 4$\n\n"
            "Complete the table of values for $y = -x^2 - 2x + 4$\n\n"
            "| $x$ | $-4$ | $-3$ | $-2$ | $-1$ | $0$ | $1$ | $2$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-4$ |  |  | $5$ |  | $1$ |  |"
        ),
        "drop_assets": [_A + "asset_2_a_table.png"],
    },
    {
        "pid": "offp_2018-06_02r_2-b",
        "kind": "table-reconstruction",
        "note": "2(b) plot part: BOTH refs targeted the table crop (the 'grid'-alt ref is a pre-existing "
                "wrong-file mislabel — no grid crop exists in the corpus); both dropped, GFM table added; "
                "true grid never cropped = pre-existing serving gap (ledger)",
        "ev": "crop asset_2_a_table.png of record (sheet-01 #3); corpus assets for 2018-06/4MB1-02R carry no 2(b) grid",
        "new": (
            "On the grid, plot the points from your completed table and join them to form a smooth curve.\n\n"
            "| $x$ | $-4$ | $-3$ | $-2$ | $-1$ | $0$ | $1$ | $2$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-4$ |  |  | $5$ |  | $1$ |  |"
        ),
        "drop_assets": [_A + "asset_2_a_table.png"],
        "drop_expect": 2,
    },
    {
        "pid": "offp_2018-06_02r_2-c",
        "kind": "table-reconstruction",
        "note": "2(c): 'grid'-alt ref targeted the table crop (pre-existing mislabel) — dropped; "
                "Mode-B repair '2x 2 - x - 5 = 0' -> $2x^2 - x - 5 = 0$; grid axis run-on KEPT "
                "(no grid image is served, the run-on is its only text carrier)",
        "ev": "p4 page text ('(c) ... the equation 2x 2 - x - 5 = 0'); equation corroborated: "
              "x^2-3x-1 = -x^2-2x+4 => 2x^2 - x - 5 = 0 exact",
        "new": (
            "Use the two curves on the grid to find estimates, to 1 decimal place, for the solutions "
            "of the equation $2x^2 - x - 5 = 0$ y –4 –3 –2 –1 O 1 2 3 x –1 –2 –3 –4 –5"
        ),
        "drop_assets": [_A + "asset_2_a_table.png"],
    },
    # ---------------- 2019-01 4MB1-02R ----------------
    {
        "pid": "offp_2019-01_02r_2-a",
        "kind": "table-reconstruction",
        "note": "2(a) table -> GFM; equation already superscripted in prose (no Mode-B repair)",
        "ev": "crop asset_2_a_table.png of record (sheet-01 #5); arithmetic y(1)=-1, y(3)=1, y(4)=5 exact "
              "for y = x^2 - 3x + 1",
        "new": (
            "Complete the table of values for $y = x^2 - 3x + 1$\n\n"
            "| $x$ | $-1$ | $0$ | $1$ | $2$ | $3$ | $4$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  |  | $-1$ |  | $1$ | $5$ |  |"
        ),
        "drop_assets": [_A + "asset_2_a_table.png"],
    },
    {
        "pid": "offp_2019-01_02r_2-b",
        "kind": "table-reconstruction",
        "note": "2(b) plot part: table crop ref replaced by the GFM table; own grid ref kept; crop dropped",
        "ev": "crop asset_2_a_table.png of record (sheet-01 #6); own grid asset_2_b_grid.png of record",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.5)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2019-01/4MB1-02R/assets/asset_2_b_grid.png)\n\n"
            "| $x$ | $-1$ | $0$ | $1$ | $2$ | $3$ | $4$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  |  | $-1$ |  | $1$ | $5$ |  |"
        ),
        "drop_assets": [_A + "asset_2_a_table.png"],
    },
    # ---------------- 2019-06 4MB1-01 ----------------
    {
        "pid": "offp_2019-06_01_20",
        "kind": "table-reconstruction",
        "note": "homework-times table -> GFM with print-faithful BLANK frequency cells (frequencies are "
                "read from the histogram by the candidate); crop KEPT (it is the histogram to complete), "
                "alt relabelled table->histogram; axis run-on dropped (visible in the kept image)",
        "ev": "crop asset_20_table.png of record (sheet-02 #1: histogram, 'Frequency density' + axis 10..70 "
              "labels visible); intervals 10<=t<20/20<=t<25/25<=t<30/30<=t<45/45<=t<60 match run-on text",
        "new": (
            "The incomplete histogram and the incomplete table give information about the time taken, "
            "in minutes, for some students to each complete a piece of homework. No student took less "
            "than 10 minutes to complete the homework and no student took longer than 60 minutes to "
            "complete the homework.\n\n"
            "| Time taken ($t$ minutes) | Number of students |\n"
            "| --- | --- |\n"
            "| $10 \\le t < 20$ |  |\n"
            "| $20 \\le t < 25$ |  |\n"
            "| $25 \\le t < 30$ |  |\n"
            "| $30 \\le t < 45$ |  |\n"
            "| $45 \\le t < 60$ |  |\n\n"
            "Complete the histogram and the table.\n\n"
            "![histogram — official paper figure (qp.pdf p.13)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2019-06/4MB1-01/assets/asset_20_table.png)"
        ),
        "drop_assets": [],
    },
    {
        "pid": "offp_2019-06_01r_28-a",
        "kind": "table-reconstruction",
        "note": "TWO tables -> TWO GFM tables (Sunday complete 8/10/15/17/25, Monday incomplete "
                "12/_/_/27/18); answer-line furniture 'minutes' dropped; fail-closed 'Figure not shown' "
                "stub replaced by the real histogram crop ref (crop of record); asset kept",
        "ev": "crop asset_28_table.png of record (sheet-02 #2: histogram bars); p22/p23 page texts; "
              "Sunday sum 8+10+15+17+25 = 75 = printed '75 cars' exact",
        "new": (
            "The table below gives information about the lengths of time, in minutes, that 75 cars were "
            "parked in a car park on Sunday.\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 5$ | 8 |\n"
            "| $5 < t \\le 20$ | 10 |\n"
            "| $20 < t \\le 30$ | 15 |\n"
            "| $30 < t \\le 40$ | 17 |\n"
            "| $40 < t \\le 60$ | 25 |\n\n"
            "Calculate an estimate for the mean length of time, in minutes to one decimal place, that "
            "the 75 cars were parked in the car park on Sunday\n\n"
            "The incomplete table and incomplete histogram give information about the lengths of time, "
            "in minutes, that 132 cars were parked in the car park on Monday.\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 5$ | 12 |\n"
            "| $5 < t \\le 20$ |  |\n"
            "| $20 < t \\le 30$ |  |\n"
            "| $30 < t \\le 40$ | 27 |\n"
            "| $40 < t \\le 60$ | 18 |\n\n"
            "![histogram — official paper figure (qp.pdf p.23)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2019-06/4MB1-01R/assets/asset_28_table.png)"
        ),
        "drop_assets": [],
    },
    {
        "pid": "offp_2019-06_01r_28-b",
        "kind": "table-reconstruction",
        "note": "28(b): fail-closed stub replaced by the real histogram crop ref; axis run-on KEPT "
                "(conservative — labels not confirmed visible inside the crop); no table in this part's text",
        "ev": "crop asset_28_table.png of record (sheet-02 #3); p23 page text shows the histogram axes "
              "'0 10 20 30 40 50 60 Time (t minutes)'",
        "new": (
            "Complete the histogram and the table. Frequency density 0 10 20 30 40 50 60 Time (t minutes)\n\n"
            "![histogram — official paper figure (qp.pdf p.23)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2019-06/4MB1-01R/assets/asset_28_table.png)"
        ),
        "drop_assets": [],
    },
    # ---------------- 2019-06 4MB1-02 ----------------
    {
        "pid": "offp_2019-06_02_11-d",
        "kind": "table-reconstruction",
        "note": "11(d) plot part: shared table crop ref replaced by the GFM r/V table "
                "(identical printed table to tranche-1 11(c)); own grid ref kept; crop dropped",
        "ev": "crop asset_11_c_table.png of record (sheet-02 #4): r 0/0.4/0.8/1.2/1.6/2.0/2.4, "
              "V 0/_/7.9/_/_/29.3/32.6; arithmetic V(0.8)=7.907, V(2.0)=29.32, V(2.4)=32.57 exact",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve. The volume of one particular toy is 26 cm³\n\n"
            "![grid — official paper figure (qp.pdf p.35)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2019-06/4MB1-02/assets/asset_11_d_grid.png)\n\n"
            "| $r$ | $0$ | $0.4$ | $0.8$ | $1.2$ | $1.6$ | $2.0$ | $2.4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $V$ | $0$ |  | $7.9$ |  |  | $29.3$ | $32.6$ |"
        ),
        "drop_assets": [_A + "asset_11_c_table.png"],
    },
    {
        "pid": "offp_2019-06_02r_7-a",
        "kind": "table-reconstruction",
        "note": "7(a) table -> GFM; Mode-B repair: mangled 'y= 5 — 5 x?' -> $y = 5 - x/2 - x^2$ "
                "(display fraction lost at extraction)",
        "ev": "crop asset_7_a_table.png of record (sheet-02 #5: printed 'y = 5 - x/2 - x^2' display "
              "fraction read first-hand); p20 page text; arithmetic y(-4)=-9, y(-2)=2, y(-1)=4.5, "
              "y(1)=3.5, y(2)=0 exact",
        "new": (
            "The equation of a curve is $y = 5 - \\frac{x}{2} - x^2$\n\n"
            "Complete the table of values for $y = 5 - \\frac{x}{2} - x^2$\n\n"
            "| $x$ | $-4$ | $-3$ | $-2$ | $-1$ | $0$ | $1$ | $2$ | $3$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-9$ |  | $2$ | $4.5$ |  | $3.5$ | $0$ |  |"
        ),
        "drop_assets": [_A + "asset_7_a_table.png"],
    },
    {
        "pid": "offp_2019-06_02r_7-b",
        "kind": "table-reconstruction",
        "note": "7(b): fail-closed stub replaced by the REAL grid crop ref (asset_7_7-b.png exists of "
                "record but was never wired into the pmd); table crop ref replaced by the GFM table",
        "ev": "crop asset_7_a_table.png of record (sheet-02 #6); grid asset_7_7-b.png of record; "
              "p21 page text = 'Question 7 continued' grid page",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.21)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2019-06/4MB1-02R/assets/asset_7_7-b.png)\n\n"
            "| $x$ | $-4$ | $-3$ | $-2$ | $-1$ | $0$ | $1$ | $2$ | $3$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-9$ |  | $2$ | $4.5$ |  | $3.5$ | $0$ |  |"
        ),
        "drop_assets": [_A + "asset_7_a_table.png"],
    },
    {
        "pid": "offp_2019-06_02r_7-e",
        "kind": "table-reconstruction",
        "note": "7(e): ORPHAN table crop (attached to assets[] but never referenced in the pmd) — "
                "assets-only fix, pmd untouched (text already carries the KaTeX equation)",
        "ev": "crop asset_7_a_table.png of record (sheet-03 #1); probe: no img ref in live pmd",
        "new": None,
        "drop_assets": [_A + "asset_7_a_table.png"],
    },
]
