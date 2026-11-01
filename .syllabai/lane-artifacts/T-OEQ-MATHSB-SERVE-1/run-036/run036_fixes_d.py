#!/usr/bin/env python3
"""run-036 FIX SET part D (2023-01..2026-06, 28 parts). Same conventions as part A."""

_A = "assets/"
_R = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/igcse-maths-b-16"

FIXES_D = [
    # ---------------- 2023-01 4MB1-01R ----------------
    {
        "pid": "offp_2023-01_01r_26-a",
        "kind": "table-reconstruction",
        "note": "TWO tables -> TWO GFM tables (shop times complete 10/7/5/6/12; distance incomplete "
                "4/_/_/6); answer-line furniture 'minutes' dropped; histogram axis run-on KEPT "
                "(distance histogram not served — no crop, no stub; ledger); crop dropped",
        "ev": "crop asset_26_a_table_stem.png of record (sheet-09 #2): 10/7/5/6/12; tranche-1 26(b) "
              "converted the same times table; distance values from run-on text (p22 corroborated)",
        "new": (
            "Jenny has a shop. One Monday, each of the 40 people who went in Jenny’s shop were asked "
            "how long they were in the shop. The table below shows information about the results.\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 5$ | 10 |\n"
            "| $5 < t \\le 15$ | 7 |\n"
            "| $15 < t \\le 25$ | 5 |\n"
            "| $25 < t \\le 30$ | 6 |\n"
            "| $30 < t \\le 40$ | 12 |\n\n"
            "Calculate an estimate for the mean length of time, in minutes, that these people were in "
            "the shop\n\n"
            "The incomplete table and the incomplete histogram give information about the number of "
            "kilometres each of the 40 people had travelled to get to the shop.\n\n"
            "| Distance ($k$ kilometres) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < k \\le 10$ | 4 |\n"
            "| $10 < k \\le 15$ |  |\n"
            "| $15 < k \\le 30$ |  |\n"
            "| $30 < k \\le 60$ | 6 |\n\n"
            "None of the people travelled more than 60 km. Frequency density 0 10 20 30 40 50 60 "
            "Distance (k kilometres)"
        ),
        "drop_assets": [_A + "asset_26_a_table_stem.png"],
    },
    # ---------------- 2023-01 4MB1-02 ----------------
    {
        "pid": "offp_2023-01_02_11-b",
        "kind": "table-reconstruction",
        "note": "11(b) table -> GFM; Mode-B repair: fully-linearised 'y x x' -> "
                "$y = 12/x + 9/x^2 + 1$ (both display fractions lost at extraction)",
        "ev": "crop asset_11_b_table.png of record (sheet-09 #3); p26 page text: '(a) Show that the "
              "value of k is 12' + '(b) Complete the table of values for y [12 over x][9 over x²] 1'; "
              "arithmetic f(-4)=-1.4375, f(-3)=-2, f(-2)=-2.75, f(-1)=-2 exact",
        "new": (
            "Complete the table of values for $y = \\frac{12}{x} + \\frac{9}{x^2} + 1$ Give your values "
            "of $y$ to 2 decimal places.\n\n"
            "| $x$ | $-6$ | $-5$ | $-4$ | $-3$ | $-2$ | $-1$ | $-0.8$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  |  | $-1.44$ | $-2.00$ | $-2.75$ | $-2.00$ |  |"
        ),
        "drop_assets": [_A + "asset_11_b_table.png"],
    },
    {
        "pid": "offp_2023-01_02_11-c-i",
        "kind": "table-reconstruction",
        "note": "11(c)(i) plot part: shared table crop ref dropped (table serves via 11(b) GFM — sibling); "
                "own grid ref kept",
        "ev": "crop asset_11_b_table.png of record (sheet-09 #4); own grid asset_11_c_i_grid.png of record",
        "new": (
            "On the grid opposite, plot the minimum point and the points from your completed table.\n\n"
            "![grid — official paper figure (qp.pdf p.27)]"
            f"({_R}/2023-01/4MB1-02/assets/asset_11_c_i_grid.png)"
        ),
        "drop_assets": [_A + "asset_11_b_table.png"],
    },
    {
        "pid": "offp_2023-01_02r_8-b",
        "kind": "table-reconstruction",
        "note": "8(b) plot part: shared table crop ref dropped (table serves via the 8(a) run-on — "
                "mention-no-crop class, out of wave scope; ledger); own grid ref kept",
        "ev": "crop asset_8_b_table_stem.png of record (sheet-09 #5); own grid asset_8_b_grid.png of record",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.23)]"
            f"({_R}/2023-01/4MB1-02R/assets/asset_8_b_grid.png)"
        ),
        "drop_assets": [_A + "asset_8_b_table_stem.png"],
    },
    # ---------------- 2023-06 4MB1-01 ----------------
    {
        "pid": "offp_2023-06_01_17",
        "kind": "table-reconstruction",
        "note": "bird-weight table -> GFM; own grid ref kept; crop dropped; axis run-on KEPT "
                "(empty student grid)",
        "ev": "crop asset_17_table.png of record (sheet-09 #6): 15/25/22/20/18 over "
              "85<w<=95/95<w<=100/100<w<=105/105<w<=110/110<w<=130; sum 100 = printed '100 birds' exact",
        "new": (
            "The table gives information about the weights, in grams, of 100 birds.\n\n"
            "| Weight ($w$ grams) | Frequency |\n"
            "| --- | --- |\n"
            "| $85 < w \\le 95$ | 15 |\n"
            "| $95 < w \\le 100$ | 25 |\n"
            "| $100 < w \\le 105$ | 22 |\n"
            "| $105 < w \\le 110$ | 20 |\n"
            "| $110 < w \\le 130$ | 18 |\n\n"
            "Use the information in the table to draw a histogram on the grid below. Frequency density "
            "80 90 100 110 120 130 Weight in grams\n\n"
            "![grid — official paper figure (qp.pdf p.11)]"
            f"({_R}/2023-06/4MB1-01/assets/asset_17_grid.png)"
        ),
        "drop_assets": [_A + "asset_17_table.png"],
    },
    {
        "pid": "offp_2023-06_01r_24",
        "kind": "table-reconstruction",
        "note": "children-per-family table -> GFM ($k$ cell); interleaved 2-line header run-on fixed by "
                "the table shape; crop dropped",
        "ev": "crop asset_24_table.png of record (sheet-10 #1): k/215/362/181/94/15 + 'k is an unknown integer.'",
        "new": (
            "The table shows the number of children in each of the families from a town.\n\n"
            "| Number of children | Frequency |\n"
            "| --- | --- |\n"
            "| 0 | $k$ |\n"
            "| 1 | 215 |\n"
            "| 2 | 362 |\n"
            "| 3 | 181 |\n"
            "| 4 | 94 |\n"
            "| 5 | 15 |\n\n"
            "$k$ is an unknown integer. The mean number of children in a family = 2.0 to 2 significant "
            "figures. Find the range of possible values of $k$"
        ),
        "drop_assets": [_A + "asset_24_table.png"],
    },
    # ---------------- 2023-06 4MB1-02 ----------------
    {
        "pid": "offp_2023-06_02_3",
        "kind": "table-reconstruction",
        "note": "secondhand-car price table -> GFM (KaTeX cells; last-row 40 000/62 000 thin-space "
                "separators per print); crop dropped",
        "ev": "crop asset_3_q_table_stem.png of record (sheet-10 #2): 3/23/21/34/10; run-on text "
              "matches byte-for-byte incl. '40 000 < x ≤ 62 000'",
        "new": (
            "The table below shows information about the prices of secondhand cars for sale at a garage.\n\n"
            "| Price of secondhand car ($x$) | Frequency |\n"
            "| --- | --- |\n"
            "| $6000 < x \\le 12000$ | 3 |\n"
            "| $12000 < x \\le 20000$ | 23 |\n"
            "| $20000 < x \\le 34000$ | 21 |\n"
            "| $34000 < x \\le 40000$ | 34 |\n"
            "| $40\\,000 < x \\le 62\\,000$ | 10 |\n\n"
            "Calculate an estimate, in dollars, for the mean price of a secondhand car at this garage."
        ),
        "drop_assets": [_A + "asset_3_q_table_stem.png"],
    },
    {
        "pid": "offp_2023-06_02r_9-b",
        "kind": "table-reconstruction",
        "note": "9(b) table -> GFM; Mode-B repair: equation lost entirely at extraction ('...for y') -> "
                "$y = x^2 + 24/x - 25$",
        "ev": "crop asset_9_b_table.png of record (sheet-10 #3); p26 page text: 'y = x2 + [24 over x] "
              "— 25 for 0 < x <= 5'; arithmetic f(0.4)=35.16, f(1)=0, f(3)=-8, f(4)=-3, f(5)=4.8 exact",
        "new": (
            "Complete the table of values for $y = x^2 + \\frac{24}{x} - 25$ Give your values of $y$ to "
            "one decimal place where necessary.\n\n"
            "| $x$ | $0.4$ | $0.6$ | $0.8$ | $1$ | $2$ | $3$ | $4$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $35.2$ |  |  | $0$ |  | $-8$ | $-3$ | $4.8$ |"
        ),
        "drop_assets": [_A + "asset_9_b_table.png"],
    },
    {
        "pid": "offp_2023-06_02r_9-c",
        "kind": "table-reconstruction",
        "note": "9(c) plot part: shared table crop ref replaced by the GFM table; own grid ref kept; crop dropped",
        "ev": "crop asset_9_b_table.png of record (sheet-10 #4); own grid asset_9_c_grid.png of record",
        "new": (
            "On the grid opposite, plot the stationary point and plot the points from your completed "
            "table. Join these to form a smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.27)]"
            f"({_R}/2023-06/4MB1-02R/assets/asset_9_c_grid.png)\n\n"
            "| $x$ | $0.4$ | $0.6$ | $0.8$ | $1$ | $2$ | $3$ | $4$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $35.2$ |  |  | $0$ |  | $-8$ | $-3$ | $4.8$ |"
        ),
        "drop_assets": [_A + "asset_9_b_table.png"],
    },
    # ---------------- 2023-11 4MB1-02 ----------------
    {
        "pid": "offp_2023-11_02_8-b",
        "kind": "table-reconstruction",
        "note": "8(b) plot part: shared table crop ref dropped (table serves via the 8(a) run-on — "
                "mention-no-crop class, out of wave scope; ledger); fail-closed stub KEPT (grid crop "
                "does not exist in the corpus)",
        "ev": "crop asset_8_b_table_stem.png of record (sheet-10 #5); no table in this part's text",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "> *Figure not shown in this reconstruction — the printed paper includes a diagram (not "
            "drawn accurately). Use the text description to work through it.*"
        ),
        "drop_assets": [_A + "asset_8_b_table_stem.png"],
    },
    # ---------------- 2024-06 4MB1-02 ----------------
    {
        "pid": "offp_2024-06_02_9-a",
        "kind": "table-reconstruction",
        "note": "9(a) table -> GFM; Mode-B repair: linearised '1 2 1 y x x ≠ 0 4 x' -> "
                "$y = x^2/4 - 3 - 1/x, x ≠ 0$; own graph ref kept; table crop dropped",
        "ev": "crop asset_9_a_table.png of record (sheet-10 #6); p24 page text 'y [x² over 4] - 3 - "
              "[1 over x], x ≠ 0'; arithmetic f(-4)=1.25, f(-3)=-0.4167, f(-0.5)=-0.9375, f(0.5)=-4.9375, "
              "f(2)=-2.5, f(3)=-1.0833, f(4)=0.75 exact",
        "new": (
            "A graph has equation $y = \\frac{x^2}{4} - 3 - \\frac{1}{x} \\quad x \\ne 0$\n\n"
            "Complete the table of values for the graph.\n\n"
            "| $x$ | $-4$ | $-3$ | $-2$ | $-1$ | $-0.5$ | $0.5$ | $1$ | $2$ | $3$ | $4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $1.25$ | $-0.42$ |  |  | $-0.94$ | $-4.94$ |  | $-2.5$ | $-1.08$ | $0.75$ |\n\n"
            "![graph — official paper figure (qp.pdf p.25)]"
            f"({_R}/2024-06/4MB1-02/assets/asset_9_a_graph.png)"
        ),
        "drop_assets": [_A + "asset_9_a_table.png"],
    },
    {
        "pid": "offp_2024-06_02_9-b",
        "kind": "table-reconstruction",
        "note": "9(b) plot part: ALL THREE refs targeted the table crop (graph-alt and grid-alt are "
                "pre-existing wrong-file mislabels) — all dropped, GFM table added; Mode-B repair "
                "'1 2 1 y x 4 x' -> $y = x^2/4 - 3 - 1/x$; ledger",
        "ev": "crop asset_9_a_table.png of record (sheet-11 #1); same printed equation as 9(a)",
        "new": (
            "On the grid opposite, plot the points from your completed table and draw the graph "
            "$y = \\frac{x^2}{4} - 3 - \\frac{1}{x}$\n\n"
            "| $x$ | $-4$ | $-3$ | $-2$ | $-1$ | $-0.5$ | $0.5$ | $1$ | $2$ | $3$ | $4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $1.25$ | $-0.42$ |  |  | $-0.94$ | $-4.94$ |  | $-2.5$ | $-1.08$ | $0.75$ |"
        ),
        "drop_assets": [_A + "asset_9_a_table.png"],
        "drop_expect": 3,
    },
    {
        "pid": "offp_2024-06_02_9-c",
        "kind": "table-reconstruction",
        "note": "9(c): 'graph'-alt ref targeted the table crop (pre-existing mislabel) — dropped; "
                "Mode-B repair: '1 2 1 x 3 4 x' -> $x^2/4 - 3 = 1/x$ (rearrangement of the printed 9(a) equation)",
        "ev": "crop asset_9_a_table.png of record (sheet-11 #2); derived from the p24-printed equation",
        "new": (
            "Using your graph, find estimates, to one decimal place, of the solutions of the equation "
            "$\\frac{x^2}{4} - 3 = \\frac{1}{x}$"
        ),
        "drop_assets": [_A + "asset_9_a_table.png"],
    },
    {
        "pid": "offp_2024-06_02_9-d",
        "kind": "table-reconstruction",
        "note": "9(d): table-crop ref dropped; own grid ref (asset_9_a_graph.png) KEPT; Mode-B repair: "
                "'1 2 1 x - 2 - <=0 4 x' -> $x^2/4 - 3 - 1/x <= 0$",
        "ev": "crop asset_9_a_table.png of record (sheet-11 #3); grid asset_9_a_graph.png of record; "
              "derived from the p24-printed equation",
        "new": (
            "By drawing a suitable line on the grid, find the range of values, to one decimal place, of "
            "$x$ in $-4 \\le x \\le 4$ for which $\\frac{x^2}{4} - 3 - \\frac{1}{x} \\le 0$\n\n"
            "![grid — official paper figure (qp.pdf p.25) (same figure as asset_9_a_graph)]"
            f"({_R}/2024-06/4MB1-02/assets/asset_9_a_graph.png)"
        ),
        "drop_assets": [_A + "asset_9_a_table.png"],
    },
    # ---------------- 2024-06 4MB1-02R ----------------
    {
        "pid": "offp_2024-06_02r_5-b",
        "kind": "table-reconstruction",
        "note": "5(b) plot part: ORPHAN table crop (asset_5_table.png attached but never referenced — "
                "the printed table lives in 5(a)'s text) — assets-only fix; own grid ref kept; stub kept "
                "(ambiguous referent, ledger)",
        "ev": "crop asset_5_table.png of record (sheet-11 #4): y = 2x^3 - 5x + 3 values 3.75/6/5.25/3/"
              "0.75/2.25 (p12 text + arithmetic exact); probe: no img ref in live pmd",
        "new": None,
        "drop_assets": [_A + "asset_5_table.png"],
    },
    # ---------------- 2024-11 4MB1-02 ----------------
    {
        "pid": "offp_2024-11_02_8-a",
        "kind": "table-reconstruction",
        "note": "fruit-weight table -> GFM; crop dropped",
        "ev": "crop asset_8_a_table.png of record (sheet-11 #5): citrus 508 kg / berries 126 kg / tropical 86 kg",
        "new": (
            "Chetan owns a fruit shop. In January, Chetan sold 560 kg of citrus fruit. In February, "
            "Chetan sold 518 kg of citrus fruit.\n\n"
            "Calculate the percentage decrease in the weight of citrus fruit sold. The table below "
            "shows the weight of citrus fruit, the weight of berries and the weight of tropical fruit "
            "Chetan sold in March.\n\n"
            "| Fruit type | Weight sold |\n"
            "| --- | --- |\n"
            "| citrus | 508 kg |\n"
            "| berries | 126 kg |\n"
            "| tropical | 86 kg |\n\n"
            "Chetan is going to draw a pie chart for this information."
        ),
        "drop_assets": [_A + "asset_8_a_table.png"],
    },
    {
        "pid": "offp_2024-11_02_8-b",
        "kind": "table-reconstruction",
        "note": "8(b): April-berries table -> GFM; the March fruit-table crop ref ('same figure as 8(a)', "
                "pre-existing mislabel on this part) dropped — March table serves via 8(a) GFM; ledger",
        "ev": "crop asset_8_a_table.png of record (sheet-11 #6): April 10/7/6/5/2 over "
              "0<w<=5/5<w<=10/10<w<=15/15<w<=20/20<w<=25 (run-on text matches)",
        "new": (
            "Calculate the size, in degrees, of the angle of the sector in the pie chart for the weight "
            "of berries sold in March. The table below gives information about the weight, in kg, of "
            "berries sold on each of the 30 days in April.\n\n"
            "| Weight ($w$ kg) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < w \\le 5$ | 10 |\n"
            "| $5 < w \\le 10$ | 7 |\n"
            "| $10 < w \\le 15$ | 6 |\n"
            "| $15 < w \\le 20$ | 5 |\n"
            "| $20 < w \\le 25$ | 2 |"
        ),
        "drop_assets": [_A + "asset_8_a_table.png"],
    },
    # ---------------- 2025-06 4MB1-01 ----------------
    {
        "pid": "offp_2025-06_01_18-a",
        "kind": "table-reconstruction",
        "note": "flight-delay table -> GFM (two blanks read from the histogram by the candidate); crop "
                "KEPT (contains the histogram half — chart essential), alt relabelled table->histogram; "
                "axis run-on dropped (visible in the kept image)",
        "ev": "crop asset_18_a_table_stem.png of record (sheet-12 #1: table + histogram with axis "
              "0..300 visible): 180/120/120 printed in rows 3-5",
        "new": (
            "The incomplete table and the incomplete histogram give information about the number of "
            "minutes that 900 flights arrived late at an airport.\n\n"
            "| Minutes late ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 30$ |  |\n"
            "| $30 < t \\le 60$ |  |\n"
            "| $60 < t \\le 120$ | 180 |\n"
            "| $120 < t \\le 180$ | 120 |\n"
            "| $180 < t \\le 300$ | 120 |\n\n"
            "Complete the table and the histogram. Sam selects at random one of the 900 flights.\n\n"
            "![histogram — official paper figure (qp.pdf p.14)]"
            f"({_R}/2025-06/4MB1-01/assets/asset_18_a_table_stem.png)"
        ),
        "drop_assets": [],
    },
    {
        "pid": "offp_2025-06_01r_14",
        "kind": "table-reconstruction",
        "note": "puzzle-time table -> GFM; interleaved 2-line header run-on fixed by the table shape; "
                "trailing answer-line 'minutes' dropped; crop dropped",
        "ev": "crop asset_14_table.png of record (sheet-12 #2): 7/8/6/5/4 over "
              "0<=t<2/2<=t<4/4<=t<6/6<=t<8/8<=t<10",
        "new": (
            "Xiou records the time, in minutes, it takes each of the 30 students in his class to "
            "complete the same puzzle. The table shows information about his results.\n\n"
            "| Time taken ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 \\le t < 2$ | 7 |\n"
            "| $2 \\le t < 4$ | 8 |\n"
            "| $4 \\le t < 6$ | 6 |\n"
            "| $6 \\le t < 8$ | 5 |\n"
            "| $8 \\le t < 10$ | 4 |\n\n"
            "Calculate an estimate for the mean number of minutes that these students take to complete "
            "the puzzle"
        ),
        "drop_assets": [_A + "asset_14_table.png"],
    },
    # ---------------- 2025-06 4MB1-02 ----------------
    {
        "pid": "offp_2025-06_02_10-d",
        "kind": "table-reconstruction",
        "note": "10(d) plot part: shared table crop ref replaced by the GFM table (identical printed "
                "table to 10(c)); own grid ref kept; crop dropped",
        "ev": "crop asset_10_d_table_stem.png of record (sheet-12 #3): x -2..2.5, y "
              "-4/-0.9/_/_/-2/-3.4/-4/_/0/6.1; arithmetic f(x)=x^3-3x-2: f(-1.5)=-0.875->-0.9, "
              "f(0.5)=-3.375->-3.4, f(1)=-4, f(2)=0, f(2.5)=6.125->6.1 exact (1dp roundings)",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.27)]"
            f"({_R}/2025-06/4MB1-02/assets/asset_10_d_grid.png)\n\n"
            "| $x$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ | $2.5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-4$ | $-0.9$ |  |  | $-2$ | $-3.4$ | $-4$ |  | $0$ | $6.1$ |"
        ),
        "drop_assets": [_A + "asset_10_d_table_stem.png"],
    },
    # ---------------- 2025-06 4MB1-02R (formula box -> KaTeX) ----------------
    {
        "pid": "offp_2025-06_02r_11-e-i",
        "kind": "table-reconstruction",
        "note": "11(e)(i): the 'table'-named crop is the printed quadratic-FORMULA BOX -> KaTeX display "
                "line; crop dropped; own grid ref kept",
        "ev": "crop asset_11_e_i_table.png of record (sheet-12 #4): 'Solutions of ax² + bx + c = 0 are "
              "x = (-b ± √(b² - 4ac)) / 2a' read first-hand",
        "new": (
            "On the grid opposite, plot the points where curve C crosses the x-axis, the two turning "
            "points and all the points from your completed table.\n\n"
            "Solutions of $ax^2 + bx + c = 0$ are $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$\n\n"
            "![grid — official paper figure (qp.pdf p.33)]"
            f"({_R}/2025-06/4MB1-02R/assets/asset_11_e_i_grid.png)"
        ),
        "drop_assets": [_A + "asset_11_e_i_table.png"],
    },
    {
        "pid": "offp_2025-06_02r_11-f",
        "kind": "table-reconstruction",
        "note": "11(f): 'grid'-alt ref targeted the formula-box crop (pre-existing mislabel) — dropped, "
                "KaTeX formula line added; mangled equation '2 x 3 x 2 3x 0' LEFT AS-IS (Mode-C: "
                "signs unresolvable from the text layer, no fabrication); ledger",
        "ev": "crop asset_11_e_i_table.png of record (sheet-12 #5); stem f(x) = 2x^3 - x^2 - 5x - 2 "
              "(p32; f(2)=0, f(-1)=0 exact) but the (f) line-equation signs unverifiable",
        "new": (
            "By drawing a suitable line on the grid, find estimates to one decimal place, of the "
            "solutions to the equation 2 x 3 x 2 3x 0 in the interval −1.5 ≤ x ≤ 2.25\n\n"
            "Solutions of $ax^2 + bx + c = 0$ are $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$"
        ),
        "drop_assets": [_A + "asset_11_e_i_table.png"],
    },
    {
        "pid": "offp_2025-06_02r_11-g",
        "kind": "table-reconstruction",
        "note": "11(g): 'graph'-alt ref targeted the formula-box crop (pre-existing mislabel) — dropped, "
                "KaTeX formula line added; own grid ref kept",
        "ev": "crop asset_11_e_i_table.png of record (sheet-12 #6); grid asset_11_e_i_grid.png of record",
        "new": (
            "By drawing a suitable line (at least 3 cm long) on the grid, find the gradient of curve C "
            "at the point where x = 1.5.\n\n"
            "Solutions of $ax^2 + bx + c = 0$ are $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$\n\n"
            "![grid — official paper figure (qp.pdf p.33) (same figure as asset_11_e_i_grid)]"
            f"({_R}/2025-06/4MB1-02R/assets/asset_11_e_i_grid.png)"
        ),
        "drop_assets": [_A + "asset_11_e_i_table.png"],
    },
    # ---------------- 2025-11 4MB1-02 ----------------
    {
        "pid": "offp_2025-11_02_6-b",
        "kind": "table-reconstruction",
        "note": "6(b): runners-time table -> GFM (evidenced by the 6(c) crop + p15 text — the table is "
                "printed in this part's own run-on); crop asset_6_table.png RECLASSIFIED pictorial-keep "
                "(first-hand read = the Q6 AGES pie chart, not a table) — asset kept untouched; "
                "histogram stub + axis run-on KEPT (histogram crop does not exist); ledger",
        "ev": "crop asset_6_table.png of record (sheet-13 #1: pie chart 'over 50/under 18/18 to 24/25 to "
              "34/35 to 50'); 6(c) crop (sheet-13 #2) shows the same times table printed: 10/16/28/_/24/_; "
              "p15 page text '15 < t 25 -> 10, 25 < t 30 -> 16'",
        "new": (
            "Calculate the lower bound, in metres/minute to 3 significant figures, for Xavier’s average "
            "speed. Show all your working.\n\n"
            "The times, in minutes, for the 120 runners to complete 5 km is recorded. No runner takes "
            "less than 15 minutes or more than 70 minutes. The incomplete table and the incomplete "
            "histogram give information about the times.\n\n"
            "| Minutes ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $15 < t \\le 25$ | 10 |\n"
            "| $25 < t \\le 30$ | 16 |\n"
            "| $30 < t \\le 35$ | 28 |\n"
            "| $35 < t \\le 40$ |  |\n"
            "| $40 < t \\le 50$ | 24 |\n"
            "| $50 < t \\le 70$ |  |\n\n"
            "Frequency density 10 20 30 40 50 60 70 Time (t minutes)\n\n"
            "> *Figure not shown in this reconstruction — the printed paper includes a diagram (not "
            "drawn accurately). Use the text description to work through it.*"
        ),
        "drop_assets": [],
    },
    {
        "pid": "offp_2025-11_02_6-c",
        "kind": "table-reconstruction",
        "note": "6(c): crop KEPT (contains the histogram half — chart essential), alt relabelled "
                "table->'histogram and table'; the printed table itself serves via 6(b) GFM — sibling",
        "ev": "crop asset_6_c_table_stem.png of record (sheet-13 #2): prose + table (10/16/28/_/24/_) + "
              "histogram with axis 10..70",
        "new": (
            "Complete the table and the histogram.\n\n"
            "![histogram and table — official paper figure (qp.pdf p.15)]"
            f"({_R}/2025-11/4MB1-02/assets/asset_6_c_table_stem.png)"
        ),
        "drop_assets": [],
    },
    # ---------------- 2026-06 4MB1-01R ----------------
    {
        "pid": "offp_2026-06_01r_12",
        "kind": "table-reconstruction",
        "note": "library-hours table -> GFM (two blanks); crop dropped (prose+table only — nothing "
                "pictorial inside); axis run-on KEPT (the histogram is NOT inside the crop and is not "
                "served anywhere — pre-existing gap, ledger)",
        "ev": "crop asset_12_q_table_stem.png of record (sheet-13 #3: prose + table 18/_/33/_ only, no "
              "histogram region); run-on text matches",
        "new": (
            "The incomplete table and the incomplete histogram give information about the length of "
            "time, in minutes, that each of 100 students worked in a library.\n\n"
            "| Time ($t$ minutes) | Number of students |\n"
            "| --- | --- |\n"
            "| $0 \\le t < 20$ | 18 |\n"
            "| $20 \\le t < 60$ |  |\n"
            "| $60 \\le t < 100$ | 33 |\n"
            "| $100 \\le t < 200$ |  |\n\n"
            "Complete the table and the histogram.\n\n"
            "Frequency density 0 40 80 120 160 200 Time (t minutes)"
        ),
        "drop_assets": [_A + "asset_12_q_table_stem.png"],
    },
    # ---------------- 2026-06 4MB1-02R ----------------
    {
        "pid": "offp_2026-06_02r_12-a",
        "kind": "table-reconstruction",
        "note": "12(a) table -> GFM; Mode-B repair: linearised 'y 5 x 2 2x2' -> $y = 5x^2 - 10 + 1/(2x^2)$",
        "ev": "crop asset_12_a_table.png of record (sheet-13 #4); p30 page text 'y 5 x 2 10 [1 over "
              "2x2]'; arithmetic f(0.2)=2.7, f(0.4)=-6.075, f(0.6)=-6.8111, f(1)=-4.5, f(1.4)=0.0551, "
              "f(1.6)=2.9953 exact (2dp roundings)",
        "new": (
            "Complete the following table of values for $y = 5x^2 - 10 + \\frac{1}{2x^2}$ Give values "
            "to 2 decimal places.\n\n"
            "| $x$ | $0.2$ | $0.4$ | $0.6$ | $0.8$ | $1$ | $1.2$ | $1.4$ | $1.6$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $2.70$ | $-6.08$ | $-6.81$ |  | $-4.50$ |  | $0.06$ | $3.00$ |"
        ),
        "drop_assets": [_A + "asset_12_a_table.png"],
    },
    {
        "pid": "offp_2026-06_02r_12-b",
        "kind": "table-reconstruction",
        "note": "12(b) plot part: shared table crop ref replaced by the GFM table; own grid ref kept; crop dropped",
        "ev": "crop asset_12_a_table.png of record (sheet-13 #5); own grid asset_12_b_grid.png of record",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.31)]"
            f"({_R}/2026-06/4MB1-02R/assets/asset_12_b_grid.png)\n\n"
            "| $x$ | $0.2$ | $0.4$ | $0.6$ | $0.8$ | $1$ | $1.2$ | $1.4$ | $1.6$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $2.70$ | $-6.08$ | $-6.81$ |  | $-4.50$ |  | $0.06$ | $3.00$ |"
        ),
        "drop_assets": [_A + "asset_12_a_table.png"],
    },
]
