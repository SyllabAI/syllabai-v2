#!/usr/bin/env python3
"""Anonymous-200 gate on all UIUX-ARTWORK-3 asset URLs (no auth header)."""
import urllib.request, json

SHA = 'e33d4805f97af6d18a71f87d8d994e143ab66126'
BASE = f'https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{SHA}/SME-ExamQuestion/igcse-maths-b-16/past-papers'
FILES = {
  '2023-01/01': ['002-q9-quadrilaterals-a-and-b-on-a-grid.png', '003-q12-circle-abcd-tangent-edf-75-degrees.png', '004-q14-pentagon-abcde-sides-fe-eg-gh.png', '005-q15-sphere-radius-r.png', '006-q15-cone-radius-r-height-20cm.png', '007-q18-mathematically-similar-solids-a-and-b.png', '008-q21-speed-time-graph-cyclist.png', '009-q22-bar-chart-music-downloads.png', '010-q26-pyramid-abcd-triangular-base.png', '001-q19-quadrilateral-abcd-with-x-f-scale-1cm-2m.png'],
  '2021-01/02': ['001-q3-circle-qrst-50mm-40mm-60mm.png', '002-q4-probability-tree-alan-games.png', '003-q5-venn-diagram-abc.png', '004-q8-kite-abcd-6cm-8cm.png', '005-q10-triangle-oab-midpoints.png'],
  '2021-01/02R': ['001-q1-venn-diagram-abc.png', '002-q5-circle-abcde-9-2cm-10-6cm.png', '003-q8-pentagonal-prism-abcdefghjk.png', '004-q10-rectangle-oabc-vectors.png', '005-q11-six-circles-in-rectangle.png'],
}
ok = bad = 0
for pdir, files in FILES.items():
    for f in files:
        url = f'{BASE}/{pdir}/assets/{f}'
        try:
            req = urllib.request.Request(url, method='GET')  # anonymous, no auth header
            with urllib.request.urlopen(req, timeout=30) as r:
                n = len(r.read())
                status = r.status
        except Exception as e:
            status, n = getattr(e, 'code', 'ERR'), 0
        mark = 'OK' if status == 200 and n > 3000 else 'FAIL'
        if mark == 'OK': ok += 1
        else: bad += 1
        print(f'{mark} {status} {n:>7} {pdir}/{f}')
print(f'\n{ok} OK / {bad} FAIL')
