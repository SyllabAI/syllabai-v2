#!/usr/bin/env python3
"""run-036 FIX SET part C (2021-01..2022-06, 19 parts). Same conventions as part A."""

_A = "assets/"
_R = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/igcse-maths-b-16"

FIXES_C = [
    # ---------------- 2021-01 4MB1-01 ----------------
    {
        "pid": "offp_2021-01_01_23",
        "kind": "table-reconstruction",
        "note": "temperature table -> GFM (two blank cells read from the histogram by the candidate); "
                "crop KEPT (it is the histogram to complete), alt relabelled table->histogram; "
                "axis run-on dropped (visible in the kept image)",
        "ev": "crop asset_23_table.png of record (sheet-06 #1: histogram, 'Frequency density' + axis "
              "0..30 labels visible); intervals 5<=t<10/10<=t<15/15<=t<17/17<=t<25 with 20/80 printed",
        "new": (
            "The incomplete histogram and the incomplete table give information about the daily mean "
            "temperature for 184 days measured at Heathrow. None of the daily mean temperatures were "
            "less than 5°C and all the daily mean temperatures were less than 25°C.\n\n"
            "| Daily mean temperature ($T$ °C) | Number of days |\n"
            "| --- | --- |\n"
            "| $5 \\le t < 10$ | 20 |\n"
            "| $10 \\le t < 15$ | 80 |\n"
            "| $15 \\le t < 17$ |  |\n"
            "| $17 \\le t < 25$ |  |\n\n"
            "Complete the histogram and the table.\n\n"
            "![histogram — official paper figure (qp.pdf p.20)]"
            f"({_R}/2021-01/4MB1-01/assets/asset_23_table.png)"
        ),
        "drop_assets": [],
    },
    {
        "pid": "offp_2021-01_01r_27-b",
        "kind": "table-reconstruction",
        "note": "27(b): answer-line furniture 'minutes ( )' dropped; ORPHAN histogram crop "
                "(asset_27_diagram.png attached but never referenced) wired in replacing the fail-closed "
                "stub; redundant table crop dropped (table serves via tranche-1 27(c) GFM — sibling)",
        "ev": "crop asset_27_b_table_stem.png of record (sheet-06 #2: 12/10/8/28/14); p24 page text "
              "confirms the same table values; histogram crop asset_27_diagram.png of record",
        "new": (
            "Calculate an estimate, to 3 significant figures, of the mean time it took Amrit to complete "
            "his homework tasks last term\n\n"
            "The diagram below is an incomplete histogram for the information in the table. Frequency "
            "density 15 20 25 30 35 40 45 50 Time (minutes)\n\n"
            "![histogram — official paper figure (qp.pdf p.24)]"
            f"({_R}/2021-01/4MB1-01R/assets/asset_27_diagram.png)"
        ),
        "drop_assets": [_A + "asset_27_b_table_stem.png"],
    },
    # ---------------- 2021-01 4MB1-02 ----------------
    {
        "pid": "offp_2021-01_02_11-b",
        "kind": "table-reconstruction",
        "note": "11(b) plot part: shared table crop ref replaced by the GFM table (identical printed "
                "table to tranche-1 11(a)); own grid ref kept; pre-existing dB/dx glue LEFT AS-IS; crop dropped",
        "ev": "crop asset_11_a_table.png of record (sheet-06 #3): x -2..3, y -28/-5.9/_/17.4/20/_/11/0.9/-12/_/-43; "
              "arithmetic f(x)=x^3-10x^2+20: f(-2)=-28, f(-1.5)=-5.875, f(-0.5)=17.375, f(1.5)=0.875, f(3)=-43 exact",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve. dB A curve C has equation y = g (x) where B = g (x) and = f (x) dx The curve "
            "C has two turning points in −2 ≤ x ≤ 3\n\n"
            "![grid — official paper figure (qp.pdf p.27)]"
            f"({_R}/2021-01/4MB1-02/assets/asset_11_b_grid.png)\n\n"
            "| $x$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ | $2.5$ | $3$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-28$ | $-5.9$ |  | $17.4$ | $20$ |  | $11$ | $0.9$ | $-12$ |  | $-43$ |"
        ),
        "drop_assets": [_A + "asset_11_a_table.png"],
    },
    # ---------------- 2021-01 4MB1-02R ----------------
    {
        "pid": "offp_2021-01_02r_3-a",
        "kind": "table-reconstruction",
        "note": "3(a) table -> GFM; Mode-B repair: 'y = -2x3 + 6x + x²' -> $y = -2x^3 + 6x + 5/x^2$ "
                "(the 5-over-x² display fraction was lost at extraction)",
        "ev": "crop asset_3_a_table.png of record (sheet-06 #4); p8 page text shows '5' over 'x2'; "
              "arithmetic f(-2)=5.25, f(-1.8)=2.4072, f(-1.6)=0.5451, f(-1.4)=-0.361, f(-1)=1, "
              "f(-0.8)=4.0365 exact",
        "new": (
            "The equation of a curve is $y = -2x^3 + 6x + \\frac{5}{x^2}$\n\n"
            "Complete the table of values for $y = -2x^3 + 6x + \\frac{5}{x^2}$ Give your values of $y$ "
            "to 2 decimal places where necessary.\n\n"
            "| $x$ | $-2$ | $-1.8$ | $-1.7$ | $-1.6$ | $-1.4$ | $-1.2$ | $-1$ | $-0.9$ | $-0.8$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $5.25$ | $2.41$ |  | $0.55$ | $-0.36$ |  | $1$ |  | $4.04$ |"
        ),
        "drop_assets": [_A + "asset_3_a_table.png"],
    },
    {
        "pid": "offp_2021-01_02r_3-b",
        "kind": "table-reconstruction",
        "note": "3(b) plot part: table crop ref replaced by the GFM table; own grid ref kept; crop dropped",
        "ev": "crop asset_3_a_table.png of record (sheet-06 #5); own grid asset_3_b_grid.png of record",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.9)]"
            f"({_R}/2021-01/4MB1-02R/assets/asset_3_b_grid.png)\n\n"
            "| $x$ | $-2$ | $-1.8$ | $-1.7$ | $-1.6$ | $-1.4$ | $-1.2$ | $-1$ | $-0.9$ | $-0.8$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $5.25$ | $2.41$ |  | $0.55$ | $-0.36$ |  | $1$ |  | $4.04$ |"
        ),
        "drop_assets": [_A + "asset_3_a_table.png"],
    },
    # ---------------- 2021-06 4MB1-02 ----------------
    {
        "pid": "offp_2021-06_02_6-b",
        "kind": "table-reconstruction",
        "note": "6(b) plot part: BOTH refs targeted the table crop (grid-alt is a pre-existing wrong-file "
                "mislabel; no grid crop exists in the corpus) — both dropped, GFM table added; "
                "turning-point glue (1, 7) verified exact for y = x^2 + 2x + 4/x; ledger",
        "ev": "crop asset_6_a_table.png of record (sheet-06 #6): x -4..4, y _/_/_/-8.75/_/7/10/25; "
              "tranche-1 6(a) arithmetic y(-0.5)=-8.75, y(1)=7, y(2)=10, y(4)=25 exact",
        "new": (
            "On the grid opposite, plot the points from your completed table. The curve has one turning "
            "point and this has coordinates (1, 7)\n\n"
            "| $x$ | $-4$ | $-2$ | $-1$ | $-0.5$ | $0.5$ | $1$ | $2$ | $4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  |  |  | $-8.75$ |  | $7$ | $10$ | $25$ |"
        ),
        "drop_assets": [_A + "asset_6_a_table.png"],
        "drop_expect": 2,
    },
    # ---------------- 2021-11 4MB1-02 ----------------
    {
        "pid": "offp_2021-11_02_3-c",
        "kind": "table-reconstruction",
        "note": "3(c): shared table crop ref replaced by the GFM table; own grid ref kept; axis run-on "
                "KEPT (empty student grid — labels not confirmed inside the grid crop)",
        "ev": "crop asset_3_c_table_stem.png of record (sheet-07 #1): 28/74/42/36/20 over "
              "0<t<=5/5<t<=15/15<t<=35/35<t<=50/50<t<=75",
        "new": (
            "On the grid opposite, draw a histogram for the information in the table. Frequency density "
            "0 10 20 30 40 50 60 70 80 Time in minutes\n\n"
            "![grid — official paper figure (qp.pdf p.7)]"
            f"({_R}/2021-11/4MB1-02/assets/asset_3_c_grid.png)\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 5$ | 28 |\n"
            "| $5 < t \\le 15$ | 74 |\n"
            "| $15 < t \\le 35$ | 42 |\n"
            "| $35 < t \\le 50$ | 36 |\n"
            "| $50 < t \\le 75$ | 20 |"
        ),
        "drop_assets": [_A + "asset_3_c_table_stem.png"],
    },
    {
        "pid": "offp_2021-11_02_7-b",
        "kind": "table-reconstruction",
        "note": "7(b) plot part: shared table crop ref replaced by the GFM table (identical printed "
                "table to tranche-1 7(a)); own grid ref kept; crop dropped",
        "ev": "crop asset_7_a_table.png of record (sheet-07 #2): x -2..2, y _/0.13/_/0.38/_/_/-3/-2.13/1; "
              "tranche-1 7(a) arithmetic y=x^3-3x-1: y(-1.5)=0.125, y(-0.5)=0.375, y(1)=-3, y(1.5)=-2.125, y(2)=1 exact",
        "new": (
            "On the grid opposite, plot the points from your completed table and join them to form a "
            "smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.17)]"
            f"({_R}/2021-11/4MB1-02/assets/asset_7_b_grid.png)\n\n"
            "| $x$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  | $0.13$ |  | $0.38$ |  |  | $-3$ | $-2.13$ | $1$ |"
        ),
        "drop_assets": [_A + "asset_7_a_table.png"],
    },
    # ---------------- 2022-01 4MB1-02 ----------------
    {
        "pid": "offp_2022-01_02_11-e",
        "kind": "table-reconstruction",
        "note": "11(e) plot part: BOTH refs targeted the table crop (grid-alt pre-existing mislabel, no "
                "grid crop in corpus) — both dropped, GFM table added (identical printed table to "
                "tranche-1 11(d)); ledger",
        "ev": "crop asset_11_d_table.png of record (sheet-07 #3): x -2..4, y _/_/-1/_/_/2/7; "
              "tranche-1 11(d) uniqueness proof (monic quadratic through (0,-1),(3,2),(4,7)) exact",
        "new": (
            "On the same grid on the opposite page, plot the points from your completed table and join "
            "them to form a smooth curve.\n\n"
            "| $x$ | $-2$ | $-1$ | $0$ | $1$ | $2$ | $3$ | $4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  |  | $-1$ |  |  | $2$ | $7$ |"
        ),
        "drop_assets": [_A + "asset_11_d_table.png"],
        "drop_expect": 2,
    },
    {
        "pid": "offp_2022-01_02_11-f",
        "kind": "table-reconstruction",
        "note": "11(f): 'graph'-alt ref targeted the table crop (pre-existing mislabel) — dropped "
                "(the plane carries the ref twice; both removed); "
                "mangled inequality '11 5 x² - x- <0 4 2' LEFT AS-IS (Mode-C, no fabrication); ledger",
        "ev": "crop asset_11_d_table.png of record (sheet-07 #4); no table in this part's text",
        "new": (
            "Using part (a) and part (e), find an estimate, to one decimal place, for the range of "
            "values of x for which 11 5 x² − x− <0 4 2 Show your working clearly."
        ),
        "drop_assets": [_A + "asset_11_d_table.png"],
        "drop_expect": 2,
    },
    # ---------------- 2022-01 4MB1-02R ----------------
    {
        "pid": "offp_2022-01_02r_8-b",
        "kind": "table-reconstruction",
        "note": "8(b) table -> GFM; Mode-B repair: fully-linearised 'y x x x' -> $y = x^2 - 3x/2 - 1$ "
                "(the x² and the 3x/2 display fraction were lost at extraction); own grid ref kept",
        "ev": "crop asset_8_b_table.png of record (sheet-07 #5); p24 page text: '(a) Show that the "
              "coordinates of A are (0.75, -1.5625)' — f(0.75) = -1.5625 EXACT for y = x^2 - 3x/2 - 1; "
              "f(-3)=12.5, f(3)=3.5 exact",
        "new": (
            "Complete the table of values for $y = x^2 - \\frac{3x}{2} - 1$\n\n"
            "| $x$ | $-3$ | $-2$ | $-1$ | $0$ | $1$ | $2$ | $3$ | $4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $12.5$ |  |  |  |  |  | $3.5$ |  |\n\n"
            "The point $A$ has been plotted on the grid opposite.\n\n"
            "![grid — official paper figure (qp.pdf p.25)]"
            f"({_R}/2022-01/4MB1-02R/assets/asset_8_b_grid.png)"
        ),
        "drop_assets": [_A + "asset_8_b_table.png"],
    },
    {
        "pid": "offp_2022-01_02r_8-c",
        "kind": "table-reconstruction",
        "note": "8(c): 'grid'-alt ref targeted the table crop (pre-existing mislabel) — dropped; "
                "Mode-B repair: linearised 'y x 2 x 1 ... 2' -> $y = x^2 - 3x/2 - 1$ (same printed "
                "equation restated in (c))",
        "ev": "crop asset_8_b_table.png of record (sheet-07 #6); p24 page text '(c) On the grid "
              "opposite, draw the curve with equation y x 2 x 1 for values of x from -3 to 4 [over] 2'",
        "new": (
            "On the grid opposite, draw the curve with equation $y = x^2 - \\frac{3x}{2} - 1$ for "
            "values of x from –3 to 4"
        ),
        "drop_assets": [_A + "asset_8_b_table.png"],
    },
    {
        "pid": "offp_2022-01_02r_8-e",
        "kind": "table-reconstruction",
        "note": "8(e): 'graph'-alt ref targeted the table crop (pre-existing mislabel) — dropped; own "
                "grid ref KEPT; mangled line/equation '7 1 of the solutions of the equation x 2 x 2 2' "
                "LEFT AS-IS (Mode-C, no fabrication); ledger",
        "ev": "crop asset_8_b_table.png of record (sheet-08 #1); grid asset_8_b_grid.png of record",
        "new": (
            "By drawing a suitable straight line on the grid, find estimates, to one decimal place, "
            "7 1 of the solutions of the equation x 2 x 2 2 Show your working clearly.\n\n"
            "![grid — official paper figure (qp.pdf p.25) (same figure as asset_8_b_grid)]"
            f"({_R}/2022-01/4MB1-02R/assets/asset_8_b_grid.png)"
        ),
        "drop_assets": [_A + "asset_8_b_table.png"],
    },
    # ---------------- 2022-06 4MB1-01R ----------------
    {
        "pid": "offp_2022-06_01r_20-a",
        "kind": "table-reconstruction",
        "note": "half-marathon table -> GFM (three blanks read from the histogram by the candidate); crop dropped",
        "ev": "crop asset_20_a_table_stem.png of record (sheet-08 #2): 35/_/10/15/_/_ over "
              "0<t<=70/70<t<=80/80<t<=90/90<t<=110/110<t<=130/130<t<=190",
        "new": (
            "The incomplete table and incomplete histogram give information about the length of time, "
            "in minutes, that each of 105 runners took to complete a half marathon.\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 70$ | 35 |\n"
            "| $70 < t \\le 80$ |  |\n"
            "| $80 < t \\le 90$ | 10 |\n"
            "| $90 < t \\le 110$ | 15 |\n"
            "| $110 < t \\le 130$ |  |\n"
            "| $130 < t \\le 190$ |  |\n\n"
            "None of the 105 runners took longer than 190 minutes to complete the half marathon.\n\n"
            "Use this information and the information in the histogram to complete the table."
        ),
        "drop_assets": [_A + "asset_20_a_table_stem.png"],
    },
    {
        "pid": "offp_2022-06_01r_20-b",
        "kind": "table-reconstruction",
        "note": "20(b): shared table crop ref dropped (table serves via 20(a) GFM — sibling); "
                "histogram axis run-on KEPT (histogram not served — no crop, no stub; ledger)",
        "ev": "crop asset_20_a_table_stem.png of record (sheet-08 #3); no table in this part's text",
        "new": (
            "Use the information in the table to complete the histogram. Frequency density 0 20 40 60 "
            "80 100 120 140 160 180 200 Time (minutes)"
        ),
        "drop_assets": [_A + "asset_20_a_table_stem.png"],
    },
    # ---------------- 2022-06 4MB1-02 ----------------
    {
        "pid": "offp_2022-06_02_10-c",
        "kind": "table-reconstruction",
        "note": "10(c) table -> GFM; Mode-B repair: 'V = 4x 3 - 60x 2 + 200x' -> $V = 4x^3 - 60x^2 + 200x$ "
                "(superscripts lost at extraction)",
        "ev": "crop asset_10_c_table.png of record (sheet-08 #4); arithmetic V(1)=144, V(1.5)=178.5, "
              "V(2.5)=187.5, V(3.5)=136.5, V(5)=0 exact",
        "new": (
            "Complete the following table of values for $V = 4x^3 - 60x^2 + 200x$\n\n"
            "| $x$ | $0$ | $1$ | $1.5$ | $2.5$ | $3$ | $3.5$ | $4$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $V$ | $0$ | $144$ | $178.5$ | $187.5$ |  | $136.5$ |  | $0$ |"
        ),
        "drop_assets": [_A + "asset_10_c_table.png"],
    },
    {
        "pid": "offp_2022-06_02_10-d",
        "kind": "table-reconstruction",
        "note": "10(d) plot part: shared table crop ref replaced by the GFM table; own grid ref kept; crop dropped",
        "ev": "crop asset_10_c_table.png of record (sheet-08 #5); twin of 10(c) values",
        "new": (
            "On the grid opposite, plot the points from your completed table and, using your answer to "
            "part (b), join them to form a smooth curve.\n\n"
            "![grid — official paper figure (qp.pdf p.27)]"
            f"({_R}/2022-06/4MB1-02/assets/asset_10_d_grid.png)\n\n"
            "| $x$ | $0$ | $1$ | $1.5$ | $2.5$ | $3$ | $3.5$ | $4$ | $5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $V$ | $0$ | $144$ | $178.5$ | $187.5$ |  | $136.5$ |  | $0$ |"
        ),
        "drop_assets": [_A + "asset_10_c_table.png"],
    },
    {
        "pid": "offp_2022-06_02_4-b",
        "kind": "table-reconstruction",
        "note": "4(b): table crop ref dropped and GFM table ADDED (print-evidenced from the crop; the "
                "sibling 4(a) carries the table only as an unconverted run-on — census mention-no-crop "
                "class, out of wave scope; GFM here prevents a serving regression); answer-line dotted "
                "furniture '… , …' dropped",
        "ev": "crop asset_4_b_table_stem.png of record (sheet-08 #6): 5/7/15/36/19/8 over "
              "0<=t<10/10<=t<30/30<=t<60/60<=t<120/120<=t<240/240<=t<360",
        "new": (
            "Calculate an estimate for the mean time spent on the internet per day. Sophie drew a "
            "histogram for the information in the table. In her histogram, the bar for the class "
            "interval $30 \\le t < 60$ is a square with sides of length 3 cm. Given that the bar for "
            "the class interval $10 \\le t < 30$ is a rectangle of width $w$ cm and of height $h$ cm\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 \\le t < 10$ | 5 |\n"
            "| $10 \\le t < 30$ | 7 |\n"
            "| $30 \\le t < 60$ | 15 |\n"
            "| $60 \\le t < 120$ | 36 |\n"
            "| $120 \\le t < 240$ | 19 |\n"
            "| $240 \\le t < 360$ | 8 |"
        ),
        "drop_assets": [_A + "asset_4_b_table_stem.png"],
    },
    {
        "pid": "offp_2022-06_02r_3-a",
        "kind": "table-reconstruction",
        "note": "trains 3-column table (Frequency + pie Angle) -> GFM; crop dropped",
        "ev": "crop asset_3_a_table_stem.png of record (sheet-09 #1): 42/168, _/92, 15/_, _/_, 2/8; "
              "angle sum check 168+92+8 = 268, remaining 92° for the two blank sectors (print blanks)",
        "new": (
            "Arup collects information about the time delay, in minutes, of some trains. He is going to "
            "draw a pie chart for his results. The incomplete table below gives some information about "
            "his results together with the size, in degrees, of the angle of each of three sectors in "
            "his pie chart.\n\n"
            "| Time delay ($t$ minutes) | Frequency | Angle (in degrees) |\n"
            "| --- | --- | --- |\n"
            "| $1 < t \\le 5$ | 42 | 168 |\n"
            "| $5 < t \\le 10$ |  | 92 |\n"
            "| $10 < t \\le 20$ | 15 |  |\n"
            "| $20 < t \\le 25$ |  |  |\n"
            "| $25 < t \\le 40$ | 2 | 8 |\n\n"
            "Complete the table."
        ),
        "drop_assets": [_A + "asset_3_a_table_stem.png"],
    },
]
