#!/usr/bin/env python3
"""run-006: render MS evidence pages for the 6 named parts (2.4x gray, house pattern)."""
import fitz, os

OUT = os.path.expanduser("~/my-project/scripts/run006/pdf")
REN = os.path.expanduser("~/my-project/scripts/run006/render")
os.makedirs(REN, exist_ok=True)

jobs = [
    ("2024-06-4MB1-02R-ms.pdf", 14, "ms-2024-06-02R-p14-q8.png"),
    ("2024-06-4MB1-02R-ms.pdf", 15, "ms-2024-06-02R-p15-q8-cont.png"),
    ("2023-11-4MB1-02-ms.pdf", 11, "ms-2023-11-02-p11-q6.png"),
    ("2023-11-4MB1-02-ms.pdf", 12, "ms-2023-11-02-p12-q6-cont.png"),
    ("2023-06-4MB1-01-ms.pdf", 25, "ms-2023-06-01-p25-q28-main.png"),
    ("2023-06-4MB1-01-ms.pdf", 26, "ms-2023-06-01-p26-q28-alt1.png"),
    ("2023-06-4MB1-01-ms.pdf", 27, "ms-2023-06-01-p27-q28-alt2.png"),
    ("2023-06-4MB1-01-ms.pdf", 28, "ms-2023-06-01-p28-q28-alt3.png"),
    ("2025-06-4MB1-02R-ms.pdf", 16, "ms-2025-06-02R-p16-q9.png"),
    ("2026-06-4MB1-01R-ms.pdf", 25, "ms-2026-06-01R-p25-q21.png"),
    ("2026-06-4MB1-01R-ms.pdf", 26, "ms-2026-06-01R-p26-q21-alt1.png"),
    ("2026-06-4MB1-01R-ms.pdf", 27, "ms-2026-06-01R-p27-q21-alt2.png"),
    ("2026-06-4MB1-01R-ms.pdf", 30, "ms-2026-06-01R-p30-q24.png"),
    ("2026-06-4MB1-01R-ms.pdf", 31, "ms-2026-06-01R-p31-q24-cont.png"),
]

for pdf, pg, name in jobs:
    d = fitz.open(os.path.join(OUT, pdf))
    pix = d[pg - 1].get_pixmap(matrix=fitz.Matrix(2.4, 2.4), colorspace=fitz.csGRAY)
    pix.save(os.path.join(REN, name))
    print("rendered", name, pix.width, "x", pix.height)
    d.close()
