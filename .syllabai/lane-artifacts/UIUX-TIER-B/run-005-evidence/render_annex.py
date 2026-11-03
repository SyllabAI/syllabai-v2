#!/usr/bin/env python3
"""run-005: render specific QP/MS pages for eyes-on."""
import fitz, os
OUT = os.path.expanduser("~/my-project/scripts/run005/pdf")
REN = os.path.expanduser("~/my-project/scripts/run005/render")
os.makedirs(REN, exist_ok=True)

jobs = [
    # (pdf, page1based, outname)
    ("2025-11-4MB1-02-qp.pdf", 12, "qp-2025-11-02-p12-q5.png"),
    ("2025-11-4MB1-02-qp.pdf", 13, "qp-2025-11-02-p13-q5-cont.png"),
    ("2025-11-4MB1-02-qp.pdf", 22, "qp-2025-11-02-p22-q8.png"),
    ("2025-11-4MB1-02-qp.pdf", 23, "qp-2025-11-02-p23-q8-cont.png"),
    ("2025-11-4MB1-02-qp.pdf", 26, "qp-2025-11-02-p26-q9.png"),
    ("2025-11-4MB1-02-qp.pdf", 27, "qp-2025-11-02-p27-q9-cont.png"),
    ("2025-11-4MB1-02-qp.pdf", 34, "qp-2025-11-02-p34-q11.png"),
    ("2025-11-4MB1-02-qp.pdf", 35, "qp-2025-11-02-p35-q11-cont.png"),
    ("2025-11-4MB1-02-qp.pdf", 36, "qp-2025-11-02-p36-q12.png"),
    ("2025-11-4MB1-02-qp.pdf", 37, "qp-2025-11-02-p37-q12-cont.png"),
    ("2019-01-4MB1-01R-qp.pdf", 8, "qp-2019-01-01R-p08-q13.png"),
    ("2018-06-4MB1-01-qp.pdf", 11, "qp-2018-06-01-p11-q7.png"),
]
# find 2018-06-01 MS q7 page + 2019-06-02 MS q9/q10 pages by text
def find(pdf, needle):
    d = fitz.open(pdf)
    r = [i+1 for i in range(d.page_count) if needle in d[i].get_text()]
    d.close(); return r

m7 = find(f"{OUT}/2018-06-4MB1-01-ms.pdf", "2 4 5")  # mixed number 2 4/5 in q7 working
print("2018-06-01 MS pages mentioning 2 4/5:", m7)
for p in (m7 or [5]):
    jobs.append(("2018-06-4MB1-01-ms.pdf", p, f"ms-2018-06-01-p{p:02d}.png"))
m9 = find(f"{OUT}/2019-06-4MB1-02-ms.pdf", "2r + s")
print("2019-06-02 MS '2r + s' pages:", m9)
m10 = find(f"{OUT}/2019-06-4MB1-02-ms.pdf", "2a + b")
print("2019-06-02 MS '2a + b' pages:", m10)
for p in sorted(set((m9 or []) + (m10 or []) + [16, 17])):
    jobs.append(("2019-06-4MB1-02-ms.pdf", p, f"ms-2019-06-02-p{p:02d}.png"))

for pdf, pg, name in jobs:
    d = fitz.open(f"{OUT}/{pdf}")
    pix = d[pg-1].get_pixmap(matrix=fitz.Matrix(2.4, 2.4), colorspace=fitz.csGRAY)
    pix.save(f"{REN}/{name}")
    d.close()
    print("rendered", name, pix.width, "x", pix.height)
