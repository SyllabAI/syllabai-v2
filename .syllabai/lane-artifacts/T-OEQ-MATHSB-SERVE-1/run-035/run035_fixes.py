#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-035: Mode-A table->GFM conversion wave — FIX SET (tranche-1, 18 parts).

Every NEW problemMd was authored against first-hand evidence:
  - 5 contact sheets of the corpus-of-record crop PNGs (sheet-01..05)
  - 4 printed-page renders @150dpi (Mode-B equation/notation repairs):
      zoom_2018-06_02_p30 (y = x^2 - 5x + 8/x display fraction)
      zoom_2021-06_02_p12 (y = x^2 + 2x + 4/x, x != 0)
      zoom_2022-06_02_p2  (GDP per capita = total GDP / population display fraction)
      zoom_2021-01_02_p14 (a inversely prop. to sqrt(b) — the plane DROPPED the sqrt;
                           arithmetically corroborated: c=1500, a=6.75 exact)

Fix tuple shape:
  {pid, kind, note, ev, new, drop_assets:[...]}
The OLD problemMd is looked up from the sha-pinned census (run035_table_census.json)
and re-asserted against the live plane at apply time (probe-before-work).

kinds: table-reconstruction (Mode A) / symbol-restoration (Mode B, evidence carried in ev).
"""

FIXES = [
    # ------------------------------------------------ grouped-frequency tables
    {
        "pid": "offp_2018-06_01_20",
        "kind": "table-reconstruction",
        "note": "histogram frequency table -> GFM md table (KaTeX interval cells); "
                "axis-text run-on dropped (visible in the kept histogram image); table crop dropped",
        "ev": "crop asset_20_table.png of record (sheet-01 #1) + run-on text 20/24/12/14/30 (sum=100 vs prose '100 children')",
        "new": (
            "The table shows information about the number of hours for which each of 100 children "
            "used a computer one week.\n\n"
            "| Number of hours ($h$) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < h \\le 2$ | 20 |\n"
            "| $2 < h \\le 5$ | 24 |\n"
            "| $5 < h \\le 8$ | 12 |\n"
            "| $8 < h \\le 12$ | 14 |\n"
            "| $12 < h \\le 15$ | 30 |\n\n"
            "The diagram below is an incomplete histogram representing this information. "
            "Use the information in the table to complete the histogram.\n\n"
            "![diagram — official paper figure (qp.pdf p.14) (same figure as asset_20_q_diagram_stem)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2018-06/4MB1-01/assets/asset_20_q_diagram_stem.png)"
        ),
        "drop_assets": ["assets/asset_20_table.png"],
    },
    {
        "pid": "offp_2026-06_01_10",
        "kind": "table-reconstruction",
        "note": "TV-time frequency table -> GFM md table; answer-line furniture 'w = h =' dropped; table crop dropped",
        "ev": "crop asset_10_q_table_stem.png of record (sheet-01 #2); intervals 0≤t<2/2≤t<4/4≤t<7 match run-on text byte-for-byte",
        "new": (
            "Zahra records the time, $t$ hours, some people spend watching television each day. "
            "Her results are shown in the table below.\n\n"
            "| Time ($t$ hours) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 \\le t < 2$ | 13 |\n"
            "| $2 \\le t < 4$ | 20 |\n"
            "| $4 \\le t < 7$ | 27 |\n\n"
            "She draws a histogram for the information in the table. In the histogram the bar for the "
            "class interval $4 \\le t < 7$ is a square with sides of length 4.5 cm the bar for the class "
            "interval $2 \\le t < 4$ is a rectangle of width $w$ cm and height $h$ cm\n\n"
            "Find the value of $w$ and the value of $h$"
        ),
        "drop_assets": ["assets/asset_10_q_table_stem.png"],
    },
    {
        "pid": "offp_2021-01_01r_27-c",
        "kind": "table-reconstruction",
        "note": "journey-time frequency table -> GFM md table; table crop dropped (histogram lives in sibling part 27-b)",
        "ev": "crop asset_27_b_table_stem.png of record (sheet-01 #3)",
        "new": (
            "Use the information in the table to complete the histogram.\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $15 \\le t < 20$ | 12 |\n"
            "| $20 \\le t < 25$ | 10 |\n"
            "| $25 \\le t < 30$ | 8 |\n"
            "| $30 \\le t < 40$ | 28 |\n"
            "| $40 \\le t < 50$ | 14 |"
        ),
        "drop_assets": ["assets/asset_27_b_table_stem.png"],
    },
    {
        "pid": "offp_2023-01_01r_26-b",
        "kind": "table-reconstruction",
        "note": "call-out time frequency table -> GFM md table; table crop dropped (histogram lives in sibling part 26-a)",
        "ev": "crop asset_26_a_table_stem.png of record (sheet-01 #4)",
        "new": (
            "Complete the histogram and the frequency table.\n\n"
            "| Time ($t$ minutes) | Frequency |\n"
            "| --- | --- |\n"
            "| $0 < t \\le 5$ | 10 |\n"
            "| $5 < t \\le 15$ | 7 |\n"
            "| $15 < t \\le 25$ | 5 |\n"
            "| $25 < t \\le 30$ | 6 |\n"
            "| $30 < t \\le 40$ | 12 |"
        ),
        "drop_assets": ["assets/asset_26_a_table_stem.png"],
    },
    {
        "pid": "offp_2024-06_01r_19",
        "kind": "table-reconstruction",
        "note": "class-7T ice-cream table -> GFM md table (algebraic cells); pie-chart crop KEPT "
                "(chart half is essential), image alt relabelled table->pie chart; interleaved pie labels dropped",
        "ev": "crop asset_19_table.png of record (sheet-02 #1): vanilla $3x+1$, strawberry $5x-12$, chocolate $2x+3$",
        "new": (
            "The students in class 7T and the students in class 8Y were asked to name their favourite "
            "ice cream flavour. The table shows information about the favourite ice cream flavour for "
            "class 7T The pie chart shows information about the favourite ice cream flavour for class 8Y\n\n"
            "class 7T\n\n"
            "| ice cream flavour | number of students |\n"
            "| --- | --- |\n"
            "| vanilla | $3x + 1$ |\n"
            "| strawberry | $5x - 12$ |\n"
            "| chocolate | $2x + 3$ |\n\n"
            "There are 32 students in class 7T There are 45 students in class 8Y More students in class 7T "
            "than in class 8Y said vanilla was their favourite ice cream flavour. Find how many more.\n\n"
            "![pie chart — official paper figure (qp.pdf p.14)]"
            "(https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/"
            "igcse-maths-b-16/2024-06/4MB1-01R/assets/asset_19_table.png)"
        ),
        "drop_assets": [],
    },
    # ------------------------------------------------ table-of-values (curve plotting)
    {
        "pid": "offp_2020-06_02_11-a",
        "kind": "table-reconstruction",
        "note": "cubic table of values -> GFM md table with print-faithful BLANK cells (6 blanks); "
                "equation repair '2x 3' -> $2x^3$",
        "ev": "crop asset_11_a_table.png of record (sheet-02 #2): printed equation y = 2x^3 - 3x + 4 read first-hand; "
              "arithmetic corroboration y(-2.5)=-19.75, y(2)=14, y(2.5)=27.75 exact",
        "new": (
            "Complete the table of values for $y = 2x^3 - 3x + 4$\n\n"
            "| $x$ | $-2.5$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ | $2.5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-19.75$ |  | $1.75$ |  | $5.25$ |  | $2.75$ |  | $6.25$ | $14$ | $27.75$ |"
        ),
        "drop_assets": ["assets/asset_11_a_table.png"],
    },
    {
        "pid": "offp_2020-11_02_11-a",
        "kind": "table-reconstruction",
        "note": "identical 2020-11 twin (June-2020-did-not-run paper): same conversion as 2020-06 11-a",
        "ev": "crop asset_11_a_table.png of record (sheet-02 #3); twin of 2020-06 11-a, table identical crop-verified",
        "new": (
            "Complete the table of values for $y = 2x^3 - 3x + 4$\n\n"
            "| $x$ | $-2.5$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ | $2.5$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-19.75$ |  | $1.75$ |  | $5.25$ |  | $2.75$ |  | $6.25$ | $14$ | $27.75$ |"
        ),
        "drop_assets": ["assets/asset_11_a_table.png"],
    },
    {
        "pid": "offp_2021-11_02_7-a",
        "kind": "table-reconstruction",
        "note": "curve table of values -> GFM md table (4 print blanks); equation already correct in prose",
        "ev": "crop asset_7_a_table.png of record (sheet-02 #4): y row 0.13/0.38/-3/-2.13/1 with blanks at x=-2,-1,-0.5,0,0.5; "
              "arithmetic corroboration x^3-3x-1: y(-1.5)=0.125, y(-0.5)=0.375, y(1)=-3, y(1.5)=-2.125, y(2)=1",
        "new": (
            "Here is the equation of a curve $y = x^3 - 3x - 1$\n\n"
            "Complete the table of values for $y = x^3 - 3x - 1$, giving your values of $y$ to 2 decimal "
            "places where necessary.\n\n"
            "| $x$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  | $0.13$ |  | $0.38$ |  |  | $-3$ | $-2.13$ | $1$ |"
        ),
        "drop_assets": ["assets/asset_7_a_table.png"],
    },
    {
        "pid": "offp_2022-01_02_11-d",
        "kind": "table-reconstruction",
        "note": "quadratic table of values -> GFM md table (4 print blanks); equation repair 'x 2' -> $x^2$",
        "ev": "crop asset_11_d_table.png of record (sheet-03 #1): printed y values -1 (x=0), 2 (x=3), 7 (x=4); "
              "y=x^2-2x-1 is the UNIQUE monic quadratic through those printed points (f(0)=-1, f(3)=2, f(4)=7 exact)",
        "new": (
            "Complete the table of values for $y = x^2 - 2x - 1$\n\n"
            "| $x$ | $-2$ | $-1$ | $0$ | $1$ | $2$ | $3$ | $4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  |  | $-1$ |  |  | $2$ | $7$ |"
        ),
        "drop_assets": ["assets/asset_11_d_table.png"],
    },
    {
        "pid": "offp_2018-06_02_10-a",
        "kind": "table-reconstruction",
        "note": "curve table of values -> GFM md table (3 print blanks); EQUATION REPAIR 'y = x^2 - 5x + x' -> "
                "$y = x^2 - 5x + 8/x$ (the 8/ was lost at extraction)",
        "ev": "printed page of record 2018-06 4MB1-02 qp.pdf p30 rendered @150dpi and READ (zoom_2018-06_02_p30): "
              "display fraction y = x^2 - 5x + 8/x first-hand; arithmetic corroboration y(2)=-2, y(4)=-2, y(6)=7.33 exact",
        "new": (
            "The equation of a curve is given by $y = x^2 - 5x + \\frac{8}{x}$\n\n"
            "Complete the table of values for $y$, giving your values of $y$ to 2 decimal places where "
            "necessary.\n\n"
            "| $x$ | $0.8$ | $1$ | $2$ | $3$ | $4$ | $5$ | $6$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  | $4$ | $-2$ |  | $-2$ |  | $7.33$ |"
        ),
        "drop_assets": ["assets/asset_10_a_table.png"],
    },
    {
        "pid": "offp_2021-06_02_6-a",
        "kind": "table-reconstruction",
        "note": "curve table of values -> GFM md table (4 print blanks); EQUATION REPAIR 'y = x^2 + 2x + x!=0 x' -> "
                "$y = x^2 + 2x + 4/x$, x != 0 (the 4/ was lost at extraction)",
        "ev": "printed page of record 2021-06 4MB1-02 qp.pdf p12 rendered @150dpi and READ (zoom_2021-06_02_p12): "
              "display fraction y = x^2 + 2x + 4/x, x != 0 first-hand; arithmetic corroboration y(-0.5)=-8.75, "
              "y(1)=7, y(2)=10, y(4)=25 exact",
        "new": (
            "The curve $C$ has equation $y = x^2 + 2x + \\frac{4}{x} \\quad x \\ne 0$\n\n"
            "Complete the table of values for $C$\n\n"
            "| $x$ | $-4$ | $-2$ | $-1$ | $-0.5$ | $0.5$ | $1$ | $2$ | $4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ |  |  |  | $-8.75$ |  | $7$ | $10$ | $25$ |"
        ),
        "drop_assets": ["assets/asset_6_a_table.png"],
    },
    {
        "pid": "offp_2019-06_02_11-c",
        "kind": "table-reconstruction",
        "note": "volume-of-sphere-derivative curve table -> GFM md table (3 print blanks)",
        "ev": "crop asset_11_c_table.png of record (sheet-03 #4): r 0/0.4/0.8/1.2/1.6/2.0/2.4, V 0/blank/7.9/blank/blank/29.3/32.6; "
              "arithmetic corroboration V(0.8)=7.907, V(2.0)=29.32, V(2.4)=32.57 for V=(1/3)pi r^2 (15-4r)",
        "new": (
            "Complete the following table of values for $V = \\frac{1}{3}\\pi r^2 (15 - 4r)$ Give your "
            "values of $V$ to 1 decimal place.\n\n"
            "| $r$ | $0$ | $0.4$ | $0.8$ | $1.2$ | $1.6$ | $2.0$ | $2.4$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $V$ | $0$ |  | $7.9$ |  |  | $29.3$ | $32.6$ |"
        ),
        "drop_assets": ["assets/asset_11_c_table.png"],
    },
    {
        "pid": "offp_2021-01_02_11-a",
        "kind": "table-reconstruction",
        "note": "cubic table of values -> GFM md table (3 print blanks); equation repair 'x 3 - 10x 2' -> $x^3 - 10x^2$",
        "ev": "crop asset_11_a_table.png of record (sheet-04 #1): y -28/-5.9/blank/17.4/20/blank/11/0.9/-12/blank/-43; "
              "arithmetic corroboration f(x)=x^3-10x^2+20: f(-2)=-28, f(-1.5)=-5.875, f(-0.5)=17.375, f(1.5)=0.875, f(3)=-43 exact",
        "new": (
            "The equation of a curve is $y = f(x)$ where $f(x) = x^3 - 10x^2 + 20$\n\n"
            "Complete the table of values for $y = f(x)$\n\n"
            "| $x$ | $-2$ | $-1.5$ | $-1$ | $-0.5$ | $0$ | $0.5$ | $1$ | $1.5$ | $2$ | $2.5$ | $3$ |\n"
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
            "| $y$ | $-28$ | $-5.9$ |  | $17.4$ | $20$ |  | $11$ | $0.9$ | $-12$ |  | $-43$ |"
        ),
        "drop_assets": ["assets/asset_11_a_table.png"],
    },
    {
        "pid": "offp_2019-01_02_11-d",
        "kind": "table-reconstruction",
        "note": "three-points-on-C coordinates table -> GFM md table",
        "ev": "crop asset_11_d_table.png of record (sheet-04 #2): x -2/0.5/1.5, y -12/-12/-12 all printed",
        "new": (
            "Find the coordinates, to 2 decimal places, of the turning points of $C$. The table below "
            "gives the coordinates of three points on $C$.\n\n"
            "| $x$ | $-2$ | $0.5$ | $1.5$ |\n"
            "| --- | --- | --- | --- |\n"
            "| $y$ | $-12$ | $-12$ | $-12$ |"
        ),
        "drop_assets": ["assets/asset_11_d_table.png"],
    },
    # ------------------------------------------------ information tables
    {
        "pid": "offp_2021-11_01_22",
        "kind": "table-reconstruction",
        "note": "similar-solids surface/volume table -> GFM md table; answer furniture 'x =' dropped",
        "ev": "crop asset_22_table.png of record (sheet-04 #3): Solid A 425/312.5, Solid B x/67.5",
        "new": (
            "Solid $A$ and solid $B$ are similar. The table gives information about the surface areas "
            "and the volumes of $A$ and $B$.\n\n"
            "|  | Surface area (in cm²) | Volume (in cm³) |\n"
            "| --- | --- | --- |\n"
            "| Solid $A$ | 425 | 312.5 |\n"
            "| Solid $B$ | $x$ | 67.5 |\n\n"
            "Calculate the value of $x$."
        ),
        "drop_assets": ["assets/asset_22_table.png"],
    },
    {
        "pid": "offp_2022-06_02_1",
        "kind": "table-reconstruction",
        "note": "GDP per capita table -> GFM md table (KaTeX scientific-notation cells, 3 print blanks); "
                "FORMULA REPAIR: linearised 'total GDP GDP per capita = population' -> display fraction",
        "ev": "printed page of record 2022-06 4MB1-02 qp.pdf p2 rendered @150dpi and READ (zoom_2022-06_02_p2): "
              "GDP per capita = total GDP / population as a printed display fraction first-hand",
        "new": (
            "The GDP per capita for a region is defined as follows\n\n"
            "$\\text{GDP per capita} = \\frac{\\text{total GDP}}{\\text{population}}$\n\n"
            "Complete the table below, giving each value to 2 significant figures.\n\n"
            "| Region | Total GDP | Population | GDP per capita |\n"
            "| --- | --- | --- | --- |\n"
            "| Grenada | $1.23 \\times 10^9$ | 112 000 |  |\n"
            "| Hungary | $1.61 \\times 10^{11}$ |  | 16 500 |\n"
            "| World |  | $7.67 \\times 10^9$ | 11 400 |"
        ),
        "drop_assets": ["assets/asset_1_q_table_stem.png"],
    },
    {
        "pid": "offp_2021-06_02_7-b",
        "kind": "table-reconstruction",
        "note": "exchange-rate box -> single-column GFM md table (literal \\$ escapes per plane currency convention); "
                "table crop dropped. NOTE: leading 'Calculate the interest she receives in one year.' sentence is "
                "pre-existing glue from 7-a — LEFT AS-IS (out of wave scope, ledger finding filed)",
        "ev": "crop asset_7_b_table.png of record (sheet-05 #1): 1 euro = \\$1.20 / 1 euro = £x / \\$1 = £0.76",
        "new": (
            "Calculate the interest she receives in one year.\n\n"
            "Graham goes to a travel agent to change his share of the profit from dollars (\\$) into "
            "pounds (£). The table gives information about the exchange rates that are available.\n\n"
            "| Exchange rate |\n"
            "| --- |\n"
            "| 1 euro = \\$1.20 |\n"
            "| 1 euro = £x |\n"
            "| \\$1 = £0.76 |\n\n"
            "Graham has to decide whether to change his dollars into euros and then change the euros "
            "into pounds or change his dollars straight into pounds. He calculates that if he chooses "
            "to do (i) he will receive £20 more than if he chooses to do (ii)"
        ),
        "drop_assets": ["assets/asset_7_b_table.png"],
    },
    {
        "pid": "offp_2021-01_02_7",
        "kind": "table-reconstruction",
        "note": "proportionality a/c table -> GFM md table (2 print blanks); NOTATION REPAIR: plane dropped the "
                "printed sqrt — 'inversely proportional to b' -> $\\sqrt{b}$",
        "ev": "printed page of record 2021-01 4MB1-02 qp.pdf p14 rendered @150dpi and READ (zoom_2021-01_02_p14): "
              "a is inversely proportional to sqrt(b) and b is inversely proportional to c^3, first-hand; "
              "arithmetic corroboration a*c^1.5 = const: row2 c=1500 exact, row3 a=6.75 exact",
        "new": (
            "Given that $a$ is inversely proportional to $\\sqrt{b}$ and $b$ is inversely proportional "
            "to $c^3$ complete the following table.\n\n"
            "| $a$ | $c$ |\n"
            "| --- | --- |\n"
            "| 16 | 240 |\n"
            "| 250 |  |\n"
            "|  | 135 |"
        ),
        "drop_assets": ["assets/asset_7_q_table_stem.png"],
    },
]

assert len(FIXES) == 18, len(FIXES)
assert len({f["pid"] for f in FIXES}) == 18
