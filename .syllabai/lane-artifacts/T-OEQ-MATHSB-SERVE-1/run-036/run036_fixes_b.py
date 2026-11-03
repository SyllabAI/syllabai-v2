#!/usr/bin/env python3
"""run-036 FIX SET part B (2020-01..2020-11, 17 parts). Same conventions as part A."""

_A = "assets/"
_R = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/igcse-maths-b-16"

FIXES_B = [
    # ---------------- 2020-01 4MB1-01R ----------------
    {
        "pid": "offp_2020-01_01r_21-a",
        "kind": "table-reconstruction",
        "note": "passenger-weight table -> GFM (95<=w<115 blank — read from the histogram by the candidate); "
                "crop dropped; the histogram itself is not served (no crop, no stub) — pre-existing gap (ledger)",
        "ev": "crop asset_21_a_table_stem.png of record (sheet-03 #2): 80/120/270 + blank last row",
        "new": (
            "The weights of 710 passengers boarding buses at a bus station were recorded. The incomplete "
            "table and histogram give information about these passengers.\n\n"
            "| Weight of passenger ($w$ kg) | Number of passengers |\n"
            "| --- | --- |\n"
            "| $50 \\le w < 60$ | 80 |\n"
            "| $60 \\le w < 80$ | 120 |\n"
            "| $80 \\le w < 95$ | 270 |\n"
            "| $95 \\le w < 115$ |  |\n\n"
            "Complete the table."
        ),
        "drop_assets": [_A + "asset_21_a_table_stem.png"],
    },
    # ---------------- 2020-01 4MB1-02R ----------------
    {
        "pid": "offp_2020-01_02r_11-a",
        "kind": "table-reconstruction",
        "note": "11(a) table -> GFM; Mode-B repair: linearised 'y = - + - 6 5 2' + 'x³ 6 x 2 3x' -> "
                "$y = -x^3/6 + 6x^2/5 - 3x/2$ (three-fraction display restored)",
        "ev": "crop asset_11_a_table.png of record (sheet-03 #3); p28 page text fraction stack "
              "('x3 6 x 2 3x' over '6 5 2'); arithmetic f(0.5)=-0.4708->-0.47, f(3)=1.8, f(5)=1.667->1.67 exact",
        "new": (
            "Part of the curve with equation $y = x^2 - 5x + 3$ is drawn on the grid. The equation of "
            "another curve is $y = -\\frac{x^3}{6} + \\frac{6x^2}{5} - \\frac{3x}{2}$\n\n"
            "Complete the table of values for $y = -\\frac{x^3}{6} + \\frac{6x^2}{5} - \\frac{3x}{2}$ "
            "Give your values of $y$ to 2 decimal places.\n\n"
            "| $x$ | $0$ | $0.5$ | $1$ | $2$ | $3$ | $4$ | $4.5$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $0$ | $-0.47$ |  |  | $1.8$ |  |  | $1.67$ |"
        ),
        "drop_assets": [_A + "asset_11_a_table.png"],
    },
    {
        "pid": "offp_2020-01_02r_11-b",
        "kind": "table-reconstruction",
        "note": "11(b) plot part: BOTH refs targeted the table crop ('grid'-alt is a pre-existing wrong-file "
                "mislabel, no grid crop exists in the corpus) — both dropped, GFM table added; ledger",
        "ev": "crop asset_11_a_table.png of record (sheet-03 #4); corpus assets for 2020-01/4MB1-02R carry no 11(b) grid",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "| $x$ | $0$ | $0.5$ | $1$ | $2$ | $3$ | $4$ | $4.5$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $0$ | $-0.47$ |  |  | $1.8$ |  |  | $1.67$ |"
        ),
        "drop_assets": [_A + "asset_11_a_table.png"],
        "drop_expect": 2,
    },
    {
        "pid": "offp_2020-01_02r_11-c",
        "kind": "table-reconstruction",
        "note": "11(c): 'grid'-alt ref targeted the table crop (pre-existing mislabel) — dropped; "
                "mangled inequality 'x³ x 2 7 x / - - +3<0 6 5 2' LEFT AS-IS (Mode-C: signs "
                "unresolvable from the text layer, no fabrication); ledger",
        "ev": "crop asset_11_a_table.png of record (sheet-03 #5); no table in this part's text",
        "new": (
            "Use the two curves on the grid to find an estimate, to 2 decimal places, of the range "
            "x³ x 2 7 x of positive values of x for which − − +3<0 6 5 2 Show your working clearly. "
            "For positive values of x, the two curves on the grid intersect at the points P and Q."
        ),
        "drop_assets": [_A + "asset_11_a_table.png"],
    },
    {
        "pid": "offp_2020-01_02r_11-e",
        "kind": "table-reconstruction",
        "note": "11(e): 'grid'-alt ref targeted the table crop (pre-existing mislabel) — dropped; "
                "prose unchanged",
        "ev": "crop asset_11_a_table.png of record (sheet-03 #6); no table in this part's text",
        "new": (
            "Find, to 1 decimal place, the value of b."
        ),
        "drop_assets": [_A + "asset_11_a_table.png"],
    },
    # ---------------- 2020-06 / 2020-11 4MB1-01 (twins) ----------------
    {
        "pid": "offp_2020-06_01_9",
        "kind": "table-reconstruction",
        "note": "brothers table -> GFM; crop dropped",
        "ev": "crop asset_9_table.png of record (sheet-04 #1): 0->5, 1->2, 2->8, 3->4, 4->1",
        "new": (
            "The table gives information about the number of brothers that each student in a class has.\n\n"
            "| Number of brothers | Frequency |\n"
            "| --- | --- |\n"
            "| 0 | 5 |\n"
            "| 1 | 2 |\n"
            "| 2 | 8 |\n"
            "| 3 | 4 |\n"
            "| 4 | 1 |\n\n"
            "Calculate the mean number of brothers."
        ),
        "drop_assets": [_A + "asset_9_table.png"],
    },
    {
        "pid": "offp_2020-11_01_9",
        "kind": "table-reconstruction",
        "note": "identical 2020-11 twin (June-2020-did-not-run paper): same conversion as 2020-06 9",
        "ev": "crop asset_9_table.png of record (sheet-05 #1); twin of 2020-06 9, table identical crop-verified",
        "new": (
            "The table gives information about the number of brothers that each student in a class has.\n\n"
            "| Number of brothers | Frequency |\n"
            "| --- | --- |\n"
            "| 0 | 5 |\n"
            "| 1 | 2 |\n"
            "| 2 | 8 |\n"
            "| 3 | 4 |\n"
            "| 4 | 1 |\n\n"
            "Calculate the mean number of brothers."
        ),
        "drop_assets": [_A + "asset_9_table.png"],
    },
    {
        "pid": "offp_2020-06_01r_12",
        "kind": "table-reconstruction",
        "note": "chocolate table -> GFM; crop KEPT (contains the pie chart half — chart essential), "
                "alt relabelled table->pie chart; interleaved pie label 'Plain 144°' dropped (visible "
                "in the kept image); tranche-1 2024-06 01r 19 precedent",
        "ev": "crop asset_12_q_table_stem.png of record (sheet-04 #2: table + pie with 144° Plain sector)",
        "new": (
            "The incomplete table and pie chart below show information about the favourite type of "
            "chocolate of 440 adults.\n\n"
            "| Type of chocolate | Number of adults |\n"
            "| --- | --- |\n"
            "| Milk | 209 |\n"
            "| Plain |  |\n"
            "| White |  |\n"
            "| Total | 440 |\n\n"
            "Complete the table and the pie chart.\n\n"
            "![pie chart — official paper figure (qp.pdf p.9)]"
            f"({_R}/2020-06/4MB1-01R/assets/asset_12_q_table_stem.png)"
        ),
        "drop_assets": [],
    },
    {
        "pid": "offp_2020-11_01r_12",
        "kind": "table-reconstruction",
        "note": "identical 2020-11 twin: same conversion as 2020-06 01r 12",
        "ev": "crop asset_12_q_table_stem.png of record (sheet-05 #2); twin of 2020-06 01r 12, crop-verified",
        "new": (
            "The incomplete table and pie chart below show information about the favourite type of "
            "chocolate of 440 adults.\n\n"
            "| Type of chocolate | Number of adults |\n"
            "| --- | --- |\n"
            "| Milk | 209 |\n"
            "| Plain |  |\n"
            "| White |  |\n"
            "| Total | 440 |\n\n"
            "Complete the table and the pie chart.\n\n"
            "![pie chart — official paper figure (qp.pdf p.9)]"
            f"({_R}/2020-11/4MB1-01R/assets/asset_12_q_table_stem.png)"
        ),
        "drop_assets": [],
    },
    # ---------------- 2020-06 / 2020-11 4MB1-02 (twins) ----------------
    {
        "pid": "offp_2020-06_02_11-b",
        "kind": "table-reconstruction",
        "note": "11(b) plot part: shared table crop ref replaced by the GFM table (identical printed "
                "table to tranche-1 11(a)); own grid ref kept; crop dropped",
        "ev": "crop asset_11_a_table.png of record (sheet-04 #3): y = 2x^3 - 3x + 4 values "
              "-19.75/_/1.75/_/5.25/_/2.75/_/6.25/14/27.75; arithmetic y(-2.5)=-19.75, y(2)=14, y(2.5)=27.75 exact",
        "new": (
            "On the grid, plot the points from your completed table and join them to form a smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.31)]"
            f"({_R}/2020-06/4MB1-02/assets/asset_11_b_grid.png)\n\n"
            "| $x$ | $-2.5$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ | $2.5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-19.75$ |  | $1.75$ |  | $5.25$ |  | $2.75$ |  | $6.25$ | $14$ | $27.75$ |"
        ),
        "drop_assets": [_A + "asset_11_a_table.png"],
    },
    {
        "pid": "offp_2020-11_02_11-b",
        "kind": "table-reconstruction",
        "note": "identical 2020-11 twin: same conversion as 2020-06 02 11-b",
        "ev": "crop asset_11_a_table.png of record (sheet-05 #3); twin of 2020-06 02 11-b, crop-verified",
        "new": (
            "On the grid, plot the points from your completed table and join them to form a smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.31)]"
            f"({_R}/2020-11/4MB1-02/assets/asset_11_b_grid.png)\n\n"
            "| $x$ | $-2.5$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ | $2.5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-19.75$ |  | $1.75$ |  | $5.25$ |  | $2.75$ |  | $6.25$ | $14$ | $27.75$ |"
        ),
        "drop_assets": [_A + "asset_11_a_table.png"],
    },
    {
        "pid": "offp_2020-06_02r_7-a",
        "kind": "table-reconstruction",
        "note": "bird-table times -> GFM; crop dropped",
        "ev": "crop asset_7_a_table_stem.png of record (sheet-04 #4): 10/8/5/3/2/0 over "
              "0<t<=5/5<t<=8/8<t<=10/10<t<=15/15<t<=30/t>30",
        "new": (
            "The table gives information about the length of time, in seconds, that each of 28 birds "
            "spent on Ali’s bird table on Monday.\n\n"
            "| Length of time ($t$ seconds) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 5$ | 10 |\n"
            "| $5 < t \\le 8$ | 8 |\n"
            "| $8 < t \\le 10$ | 5 |\n"
            "| $10 < t \\le 15$ | 3 |\n"
            "| $15 < t \\le 30$ | 2 |\n"
            "| $t > 30$ | 0 |\n\n"
            "Find the class interval that contains the median length of time that the birds spent on "
            "the bird table on Monday."
        ),
        "drop_assets": [_A + "asset_7_a_table_stem.png"],
    },
    {
        "pid": "offp_2020-06_02r_7-b",
        "kind": "table-reconstruction",
        "note": "7(b): shared Monday-table crop ref dropped (table serves via 7(a) GFM — sibling); "
                "Tuesday histogram axis run-on KEPT (histogram not served — no crop, no stub; ledger)",
        "ev": "crop asset_7_a_table_stem.png of record (sheet-04 #5); no Tuesday table in this part's text",
        "new": (
            "Calculate an estimate, in seconds to one decimal place, for the mean length of time that "
            "the birds spent on the bird table on Monday. The incomplete histogram below gives some "
            "information about the length of time, in seconds, that each of 35 birds spent on Ali’s "
            "bird table on Tuesday. Frequency density 0 10 20 30 40 Length of time (seconds) On Tuesday "
            "9 of the birds spent between 5 seconds and 8 seconds on the bird table 6 of the birds spent "
            "between 8 seconds and 10 seconds on the bird table no bird spent longer than 40 seconds on "
            "the bird table."
        ),
        "drop_assets": [_A + "asset_7_a_table_stem.png"],
    },
    {
        "pid": "offp_2020-06_02r_7-d",
        "kind": "table-reconstruction",
        "note": "7(d): shared Monday-table crop ref dropped; pre-existing glue fragment 'for a spare copy "
                "of the histogram...' LEFT AS-IS (out of wave scope, ledger); axis run-on kept",
        "ev": "crop asset_7_a_table_stem.png of record (sheet-04 #6); no table in this part's text",
        "new": (
            "Find the proportion of birds on Tuesday that spent longer than 15 seconds on the bird table. "
            "for a spare copy of the histogram if you need to redraw your bar. Only use this histogram if "
            "you need to redraw your bar. Frequency density 0 10 20 30 40 Length of time (seconds)"
        ),
        "drop_assets": [_A + "asset_7_a_table_stem.png"],
    },
    {
        "pid": "offp_2020-11_02r_7-a",
        "kind": "table-reconstruction",
        "note": "identical 2020-11 twin: same conversion as 2020-06 02r 7-a",
        "ev": "crop asset_7_a_table_stem.png of record (sheet-05 #4); twin crop-verified",
        "new": (
            "The table gives information about the length of time, in seconds, that each of 28 birds "
            "spent on Ali’s bird table on Monday.\n\n"
            "| Length of time ($t$ seconds) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 5$ | 10 |\n"
            "| $5 < t \\le 8$ | 8 |\n"
            "| $8 < t \\le 10$ | 5 |\n"
            "| $10 < t \\le 15$ | 3 |\n"
            "| $15 < t \\le 30$ | 2 |\n"
            "| $t > 30$ | 0 |\n\n"
            "Find the class interval that contains the median length of time that the birds spent on "
            "the bird table on Monday."
        ),
        "drop_assets": [_A + "asset_7_a_table_stem.png"],
    },
    {
        "pid": "offp_2020-11_02r_7-b",
        "kind": "table-reconstruction",
        "note": "identical 2020-11 twin: same conversion as 2020-06 02r 7-b",
        "ev": "crop asset_7_a_table_stem.png of record (sheet-05 #5); twin crop-verified",
        "new": (
            "Calculate an estimate, in seconds to one decimal place, for the mean length of time that "
            "the birds spent on the bird table on Monday. The incomplete histogram below gives some "
            "information about the length of time, in seconds, that each of 35 birds spent on Ali’s "
            "bird table on Tuesday. Frequency density 0 10 20 30 40 Length of time (seconds) On Tuesday "
            "9 of the birds spent between 5 seconds and 8 seconds on the bird table 6 of the birds spent "
            "between 8 seconds and 10 seconds on the bird table no bird spent longer than 40 seconds on "
            "the bird table."
        ),
        "drop_assets": [_A + "asset_7_a_table_stem.png"],
    },
    {
        "pid": "offp_2020-11_02r_7-d",
        "kind": "table-reconstruction",
        "note": "identical 2020-11 twin: same conversion as 2020-06 02r 7-d",
        "ev": "crop asset_7_a_table_stem.png of record (sheet-05 #6); twin crop-verified",
        "new": (
            "Find the proportion of birds on Tuesday that spent longer than 15 seconds on the bird table. "
            "for a spare copy of the histogram if you need to redraw your bar. Only use this histogram if "
            "you need to redraw your bar. Frequency density 0 10 20 30 40 Length of time (seconds)"
        ),
        "drop_assets": [_A + "asset_7_a_table_stem.png"],
    },
]
