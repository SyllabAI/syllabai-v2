#!/usr/bin/env python3
"""Append UIUX-TIER-B-RUN-004 section to the maths-b bundle manifest note."""
import json

M = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/manifest.json'
SEC = (" || UIUX-TIER-B-RUN-004 (2026-10-24, operator order trace 1a16af738f7076c1 "
"'fire Tier-B run-004'): the run-003 disclosed remainder executed under the no-guess law, "
"every fragment verified against the QP/MS of record (QP/MS PDFs anonymous-fetched from the "
"syllabai-pastpapers raw mirror; pdftotext -layout + PyMuPDF page renders + high-zoom crops "
"visually read per fragment). (B) UFFFD sub-lane CLOSED: 2019-06-4mb1-02 solutionMd symbol-loss "
"0 remaining — 58 line rules across the 11 disclosed parts (MS pages 5-17 rendered + read): "
"matrix pmatrix rebuilds q4 (product, inverse N=M^-1, 2(-1 0; -0.5 -0.5) answer cell), "
"(BE=)sqrt(5^2+8^2-40sqrt3) + (k=)sqrt((18.9+\"10\")/\"10\") q5, 1/2(8)(5)sin30 half-mark glyph "
"restore, (3/4-3/5) + ALT 1/4=2/5 x q q7 (k->q per MS visual), quadratic formula + "
"(x-3/2)^2-9/4-9 q9p1, y=5-2((3+3sqrt5)/2) + (2-3sqrt5)^2 q9p2 (s->y italic misread law), "
"|q|^2=q1^2+q2^2 + 119-42sqrt5 or 7(17-6sqrt5) q9p3 (r->x), (f'(x)=)6x^2+2ax+b q10; adjacent "
"same-cell bleed folded (denominator/numerator strips, column-bleed '3 1' class). (C) ANNEX "
"whole-stem problemMd flatten family: 2025-06-4mb1-01 rebuilt end-to-end — 21 rules across 17 "
"questions (q1 (1.2^2+5)/(7.1-3), q2 12-7n, q4 5 2/3-2 4/5, q6 g=5d-4e^2, q7 -4<=x<2 with "
"tick-label scale collapsed, q10 D/E/F prime-factor lines (x3 parts, stem law kept), q11 "
"sqrt(675)-sqrt(108)=sqrt(m), q12 (2x+3)/4+(x-1)/3=7, q16 10p^2q^4-15p^3q + 2x^2-9x-5, q19 "
"proportionality block, q20 0.7 g/cm^3 density mass/volume, q21 A/A-B/C pmatrix block (control-"
"glyph parens stripped, x3 parts), q22 3x^2-(10/3)x+3=2y, q26 inequalities x3 parts). (A) "
"solutionMd census (q-deg/10n/superscript-merge): 29 evidenced rules — 2018-06-01 q16 81y^12; "
"2020-06/11-01R q1 2563/11 x13-fraction flatten; 2020-06/11-01R q22 major-sector working "
"(360-76)/360 x pi x 16 / 16pi - 76/360 x pi x 16 + 568/45 pi reference; 2020-06/11-02R q9 "
"quadratic-formula discriminants 20^2-4x3x-175 / 20^2-4x12x-825; 2024-06-01R q5 61.8x10^8 + "
"2x10^7+0.6x10^6 standard-form merges; 2024-06-02 q6 (39/4)n^2-(39/2)n=10n^2-30n+20 n=40 "
"(CORRECTS the run-003 receipt's illustrative 'n^4-n^2=10n^3-30n^2+20n' reading — MS visual "
"p12 is the fraction-prefixed quadratic). GATES: structure law 65/1270/2412/6500 unchanged, "
"marks unchanged (diff-proven vs HEAD), KaTeX gate 335 unique segments 0 failures, raw-$ "
"parity 0 introduced (53 pre-existing currency-class fields untouched, byte-identical set vs "
"HEAD), single-line compact JSON kept, UFFFD 0, scrub-assert clean. DISCLOSED REMAINDER filed "
"for operator (run-005 candidates): R4-A rebuild-class 35 parts / 30 sets (evidence pack "
"persisted: 53 crops + 51 MS page renders in lane-artifacts), ANNEX named instances 2025-11-02 "
"(7 real parts), 2019-01-01R q13, 2018-06-01 q7 + fleet strict census 627 parts / 63 sets; "
"q10 p1 P4 answer cell '2a+b=-14' absent from bundle (addition deferred); q9 p0 '2r+s=5' "
"italic-misread class beyond UFFFD parts.")

m = json.load(open(M, encoding='utf-8'))
assert 'UIUX-TIER-B-RUN-004' not in m['note']
m['note'] = m['note'] + SEC
json.dump(m, open(M, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print('manifest note appended; length', len(m['note']))
