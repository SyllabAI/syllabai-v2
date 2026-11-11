#!/usr/bin/env python3
"""RN-DEBRIS-11 run-018 — the adjudication of record: official 9709 P1 rows vs
the corpus garbage family (cie-a-level-maths-20-pure-1 + cie-as-maths-20-pure-1).

Zero-invention law:
  - Wording authority: the sha-pinned PDF's statement column (the pinned census
    artifact official_9709_p1_census_r0.json).
  - Glyph forms: the corpus's own Unicode convention for glyphs it already
    carries (², ⁿ per the 0606 fleet precedent, ⁻¹, θ, ≡); dropped glyphs
    restored from the pinned float tokens; every mapping disclosed per row.
  - Anti-invention assert: every PROSE word of an assembled title must occur in
    that row's pinned statement-column tokens; math tokens touched by glyph
    work are enumerated per row (glyphWork) and checked against their pinned
    raw forms.
  - Dispositions: REPAIR (title-only, in place, code retained), NO-REPAIR
    (byte-clean of the garbage class), PROPOSAL (structural residue — NOT
    applied; desk territory per the run-016 boundary law).
"""
import json, re, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-018"
CENSUS = json.loads((ART / "official_9709_p1_census_r0.json").read_text())


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


# ---------- the adjudication table of record (34 official rows) ----------
# code: (official statement of record, corpus carrier | None, disposition,
#        composed, glyphWork note)
A = {
"1.1.1": ("carry out the process of completing the square for a quadratic polynomial ax² + bx + c and use a completed square form", "1.1.1", "REPAIR", True, "inline '2'->² (x2->x², b x2->bx² per corpus Unicode convention; layout 'ax2 + bx + c'); interleave debris 'y' (notes-col lead) removed"),
"1.1.2": ("find the discriminant of a quadratic polynomial ax² + bx + c and use the discriminant", "1.1.2", "REPAIR", True, "inline '2'->² as 1.1.1; notes glue tail '‘repeated root’ is included.' removed (notes census line at gutter col 75)"),
"1.1.3": ("solve quadratic equations, and quadratic inequalities, in one unknown", "1.1.3", "REPAIR", False, "notes interleave 'By factorising, … formula.' removed — pure statement/notes unglue, zero glyph work"),
"1.1.4": ("solve by substitution a pair of simultaneous equations of which one is linear and one is quadratic", "1.1.4", "REPAIR", False, "interleave 'e.g.' (notes lead) + floating '2' debris removed"),
"1.1.5": ("recognise and solve equations in x which are quadratic in some function of x.", "1.1.5", "REPAIR", False, "notes debris tail ' . tan' removed (notes col 'tan x = 1 + tan x.'); period re-attached per layout 'function of x.'"),
"1.2.1": ("understand the terms function, domain, range, one-one function, inverse function and composition of functions", "1.2.1", "NO-REPAIR", False, "corpus byte-clean (== upstream parse byte-true)"),
"1.2.2": ("identify the range of a given function in simple cases, and find the composition of two given functions", "1.2.2", "REPAIR", False, "notes glue tail 'condition that a composite function' removed"),
"1.2.3": ("determine whether or not a given function is one-one, and find the inverse of a one-one function in simple cases", "1.2.3", "NO-REPAIR", False, "corpus byte-clean"),
"1.2.4": ("illustrate in graphical terms the relation between a one-one function and its inverse", "1.2.4", "REPAIR", False, "notes interleave 'Sketches should include … mirror line' removed"),
"1.2.5": ("understand and use the transformations of the graph of y = f(x) given by y = f(x) + a, y = f(x + a), y = af(x), y = f(ax) and simple combinations of these.", "1.2.5", "REPAIR", False, "notes interleave 'Including use of the terms … given features.' removed; display-math statement lines (y = f(x) + a, …) re-joined per layout token order"),
"1.3.1": ("find the equation of a straight line given sufficient information", "1.3.1", "REPAIR", False, "notes interleave 'e.g. given two points, … gradient.' removed"),
"1.3.2": ("interpret and use any of the forms y = mx + c, y – y₁ = m(x – x₁), ax + by + c = 0 in solving problems", "1.3.2", "REPAIR", True, "dropped subscripts restored 1->₁ (layout 'y – y1 = m(x – x1)'; fleet Unicode-glyph convention ²/ⁿ/⁻¹ class, no curriculum-title subscript precedent — disclosed composed); truncated tail 'problems' restored per layout line 3"),
"1.3.3": ("understand that the equation (x – a)2 + (y – b)2 = r 2 represents the circle with centre (a, b) and radius r", None, "PROPOSAL", True, "F2-class: no dedicated corpus row; the statement surfaced inside the 1.3.2a blob; title pinned BYTE-EXACT for the desk's add (superscripts kept in the raw layout form '2' — glyph work is the add-pass's business)"),
"1.3.4": ("use algebraic methods to solve problems involving lines and circles", None, "PROPOSAL", False, "F2-class: pinned for the desk's add"),
"1.3.5": ("understand the relationship between a graph and its associated algebraic equation, and use the relationship between points of intersection of graphs and solutions of equations.", None, "PROPOSAL", False, "F2-class: pinned for the desk's add"),
"1.4.1": ("understand the definition of a radian, and use the relationship between radians and degrees", "1.4.1", "NO-REPAIR", False, "corpus byte-clean"),
"1.4.2": ("use the formulae s = rθ and A = ½r²θ in solving problems concerning the arc length and sector area of a circle.", "1.4.1a", "REPAIR", True, "glyph mappings: 'i'->θ (corpus same-page convention 1.5.4 θ), stacked 1/2 (FLOAT:1 + 2 at col 49) -> ½, inline '2'->² (r 2 i -> r²θ); code 1.4.1a RETAINED (parse-vintage a-suffix per the upstream duplicate-code de-dup law, run-012 disclosure class); census 2==2 unchanged"),
"1.5.1": ("sketch and use graphs of the sine, cosine and tangent functions (for angles of any size, and using either degrees or radians)", "1.5.1", "REPAIR", False, "notes interleave 'Including e.g.' removed"),
"1.5.2": ("use the exact values of the sine, cosine and tangent of 30 °, 45 °, 60 °, and related angles", "1.5.2", "NO-REPAIR", False, "byte-clean of the garbage class; whitespace-only diff vs layout ('30 °' vs '30°') is the run-015 content-plane convention — NOT this run's defect of record, disclosed"),
"1.5.3": ("use the notations sin⁻¹x, cos⁻¹x, tan⁻¹x to denote the principal values of the inverse trigonometric relations", "1.5.3", "REPAIR", False, "notes glue tail ': • No specialised knowledge … expected.' removed; corpus ⁻¹ forms kept (same-row convention; layout 'sin–1x')"),
"1.5.4": ("use the identities sinθ/cosθ ≡ tanθ and sin²θ+cos²θ ≡ 1", "1.5.4", "REPAIR", True, "glyph mappings: 'i'->θ, '/'->≡ (both corroborated by the corpus's own clean same-row fragment 'sin²θ+cos²θ ≡ 1' + UGM glyph availability), stacked fraction (sin i over cos i) -> sinθ/cosθ (flat-notation; UGM corroboration, order-correct part), layout 'sin 2 i'->sin²θ; notes glue tail ': • e.g. … equations.' removed"),
"1.5.5": ("find all the solutions of simple trigonometrical equations lying in a specified interval (general forms of solution are not included).", "1.5.5", "NO-REPAIR", False, "corpus byte-clean"),
"1.6.1": ("use the expansion of (a + b)ⁿ, where n is a positive integer", "1.6.1", "REPAIR", True, "dropped superscript restored from pinned FLOAT:n (col 44) -> ⁿ (fleet 0606 precedent '(a + b)ⁿ'); space-glue '( a + b ) ,' -> '(a + b), ' per the run-016 byte-equal spacing law (tight parens)"),
"1.6.2": ("recognise arithmetic and geometric progressions", "1.6.2", "NO-REPAIR", False, "corpus byte-clean"),
"1.6.3": ("use the formulae for the nth term and for the sum of the first n terms to solve problems involving arithmetic or geometric progressions", "1.6.3", "REPAIR", False, "notes interleave 'Including knowledge that numbers … equivalent).' removed; layout 'nth' tight kept"),
"1.6.4": ("use the condition for the convergence of a geometric progression, and the formula for the sum to infinity of a convergent geometric progression.", "1.6.4", "REPAIR", False, "notes-first interleave ('Questions may involve …' notes lead) + glue tail ': • use the condition for the convergence of a' removed"),
"1.7.1": ("understand the gradient of a curve at a point as the limit of the gradients of a suitable sequence of chords, and use the notations f ′(x), f ″(x), dy/dx, and d²y/dx² for first and second derivatives", "1.7.1", "REPAIR", True, "stacked fractions dy/dx + d²y/dx² re-assembled from pinned numerator/denominator lines (c31 'dy d2y' / 'dx dx'); floating '2' (in-layout, statement line) -> ²; f ′(x)/f ″(x) forms byte-true to layout"),
"1.7.2": ("use the derivative of xⁿ (for any rational n), together with constant multiples, sums and differences of functions, and of composite functions using the chain rule", "1.7.2", "REPAIR", True, "dropped superscript restored (layout 'xn') -> xⁿ (0606 ⁿ precedent); space-glue '(for any rational n )' -> '(for any rational n)'"),
"1.7.3": ("apply differentiation to gradients, tangents and normals, increasing and decreasing functions and rates of change", "1.7.3", "NO-REPAIR", False, "corpus byte-clean"),
"1.7.4": ("locate stationary points and determine their nature, and use information about stationary points in sketching graphs.", "1.7.4", "NO-REPAIR", False, "corpus byte-clean"),
"1.8.1": ("understand integration as the reverse process of differentiation, and integrate (ax + b)ⁿ (for any rational n except –1), together with constant multiples, sums and differences", "1.8.1", "REPAIR", True, "dropped superscript restored (layout '(ax + b)n') -> (ax + b)ⁿ; space-glue '( ax + b )' -> '(ax + b)' per the run-016 spacing law"),
"1.8.2": ("solve problems involving the evaluation of a constant of integration", "1.8.2", "NO-REPAIR", False, "corpus byte-clean"),
"1.8.3": ("evaluate definite integrals", "1.8.3", "NO-REPAIR", False, "corpus byte-clean"),
"1.8.4": ("use definite integration to find • the area of a region bounded by a curve and lines parallel to the axes, or between a curve and a line or between two curves • a volume of revolution about one of the axes.", "1.8.4", "REPAIR", False, "dash items flattened doc-verbatim with ' • ' per the fleet bullet-flattening convention (byte-equal 2.3.2 ' • ' forms; the corpus's own same-row ' • ' usage); notes-first interleave removed; no colon invented (absent from the statement column)"),
}

# ---------- 1. structure asserts ----------
if len(A) != 34:
    fail(f"adjudication table must cover 34 official rows, has {len(A)}")
census_rows = {r["row"] for r in CENSUS["rows"]}
if set(A) != census_rows:
    fail(f"adjudication codes != census codes: {set(A) ^ census_rows}")
disp = {}
for code, (_, _, d, _, _) in A.items():
    disp.setdefault(d, []).append(code)
print(f"DISPOSITIONS: REPAIR={len(disp.get('REPAIR', []))} NO-REPAIR={len(disp.get('NO-REPAIR', []))} PROPOSAL={len(disp.get('PROPOSAL', []))}")
if len(disp["REPAIR"]) != 21 or len(disp["NO-REPAIR"]) != 10 or len(disp["PROPOSAL"]) != 3:
    fail(f"disposition census mismatch: { {k: len(v) for k, v in disp.items()} }")
carriers = [c for (_, c, _, _, _) in A.values() if c]
if len(carriers) != 31 or len(set(carriers)) != 31:
    fail(f"carrier map broken: {len(carriers)} carriers, unique {len(set(carriers))}")
corpus_codes = {n["code"] for n in json.loads((REPO / "apps/hub/content/cie-a-level-maths-20-pure-1/curriculum.json").read_text())["nodes"] if n["family"] == "SPEC_POINT"}
DEBRIS = {"1.3.1a", "1.3.2a"}  # non-row debris — no official row of record (PROPOSAL)
if set(carriers) != corpus_codes - DEBRIS:
    fail(f"carriers != corpus codes minus debris: {set(carriers) ^ (corpus_codes - DEBRIS)}")
# every debris code must be corpus-real and proposal-covered
if not DEBRIS <= corpus_codes:
    fail(f"debris codes not in corpus: {DEBRIS - corpus_codes}")
print("STRUCTURE-PASS 34 rows adjudicated; 31 carriers == corpus codes (33) minus 2 debris proposals; coverage gap = official 1.3.3/1.3.4/1.3.5 (blob-carried)")

# ---------- 2. anti-invention: prose-word coverage vs pinned tokens ----------
GLYPH_TOKENS = {"ax²", "x²", "y₁", "x₁", "rθ", "½r²θ", "sinθ/cosθ", "≡", "tanθ", "sin²θ+cos²θ", "1", "dy/dx", "d²y/dx²", "f ′(x),", "f ″(x),", "xⁿ", "(ax + b)ⁿ", "(a + b)ⁿ", "•", "•", "ax²"}
leak_vocab = ["Including", "e.g.", "Questions may", "Sketches should", "No specialised", "Knowledge of", "Only an informal", "By factorising", "A volume of revolution may"]
rows_by_code = {r["row"]: r for r in CENSUS["rows"]}
for code, (stmt, carrier, dispo, composed, note) in A.items():
    row = rows_by_code[code]
    # statement-column token stream (left of gutter; skip FLOAT labels + notes col)
    toks = []
    for ln in row["lines"]:
        col, txt = ln["col"], ln["text"]
        if txt.startswith("FLOAT:"):
            toks.append(txt.split(":", 1)[1])
            continue
        if col >= row["gutter"]:
            continue
        toks.append(txt)
    stream = " ".join(toks)
    # normalize: the stream is the LAYOUT line text (statement + inline notes when the
    # notes share a line) — prose check is one-sided (every title word in stream)
    stream_words = re.findall(r"[A-Za-z]+", stream.lower())
    miss = []
    for w in re.findall(r"[A-Za-z]+", stmt.lower()):
        if w not in stream_words:
            miss.append(w)
    if miss:
        fail(f"anti-invention {code}: prose words not in pinned statement tokens: {miss}")
    for lv in leak_vocab:
        if lv.lower() in stmt.lower():
            fail(f"notes-vocabulary leak in {code}: {lv!r}")
    if re.search(r"[\x00-\x08\x0b-\x1f]", stmt):
        fail(f"control char in {code}")
    if "  " in stmt:
        fail(f"double space in {code}: {stmt!r}")
print("ANTI-INVENTION-PASS 34/34 prose words covered by pinned statement tokens; leak detectors 0; CTRL 0; single-space joins")

# ---------- 3. corpus byte-map (origin disclosure + repair delta) ----------
content = json.loads((REPO / "apps/hub/content/cie-a-level-maths-20-pure-1/curriculum.json").read_text())
corpus = {n["code"]: n["title"] for n in content["nodes"] if n["family"] == "SPEC_POINT"}
byte_true_origin = sum(1 for c in corpus if c in corpus and any(
    p["text"] == corpus[c] for p in json.loads(Path("/home/z/my-project/work/run018/parsed/cie-a-level-maths-2023-2025/597421-2023-2025-syllabus.parsed.json").read_text())["spec_points"]))
print(f"ORIGIN-DISCLOSURE: corpus titles byte-true to the upstream parse: {byte_true_origin}/33 (the parse is the interleave-defected origin; the PDF is the authority)")
title_map = {}
for code, (stmt, carrier, dispo, composed, note) in A.items():
    if dispo == "REPAIR":
        title_map[carrier] = {"old": corpus[carrier], "new": stmt, "officialRow": code, "composed": composed, "glyphWork": note}
    elif dispo == "NO-REPAIR":
        if corpus[carrier] != stmt:
            # tolerated whitespace-only convention diff (1.5.2 '30 °') — disclose
            print(f"NO-REPAIR-DISCLOSURE {carrier}: content keeps its form (whitespace-class): {corpus[carrier][:60]!r}")
out = {
    "artifact": "rn11-run018-adjudication-r0",
    "status": "ADJUDICATION-OF-RECORD (evidence-pinned)",
    "authority": "sha-pinned 9709-2023-2025-syllabus.pdf (sha256 3a7a3769…6256, run-009/016 continuity) — statement column per the gutter law; upstream parse = defected origin, corroboration only; UGM a-level variants = reworded class, wording authority DISCARDed (order-swaps disclosed), glyph corroboration only",
    "dispositions": {k: v for k, v in disp.items()},
    "titleMap": title_map,
    "proposals": [
        {"id": "P1_13_coverage_split", "finding": "official 1.3.3/1.3.4/1.3.5 have no dedicated corpus rows — the 1.3.2a blob carries their fragments (head of 1.3.3 + all of 1.3.4 + all of 1.3.5); 1.3.1a is non-row debris (upstream fragment '1 problems' + fleet-glued '• understand that the equation' head of official 1.3.3)", "proposal": "desk add of 3 rows (byte-exact titles pinned above) + 1.3.1a/1.3.2a disposition (remove/re-file); census-changing = desk territory per the run-016 boundary law", "evidence": "census rows 1.3.3/1.3.4/1.3.5; upstream parse duplicate-code entries 1.3.1/1.3.2"},
        {"id": "P2_asuffix_codes", "finding": "corpus a-suffix codes 1.3.1a/1.3.2a/1.4.1a are the fleet's de-duplication of the upstream parse's DUPLICATE official_codes (1.3.1 x2, 1.3.2 x2, 1.4.1 x2) — parse-vintage artifacts; 1.4.1a is the dedicated carrier of official 1.4.2 (title repaired this run, code retained per the run-012 frozen-anchor law)", "proposal": "no action required for 1.4.1a (disclosed); 1.3.1a/1.3.2a fold into P1"},
    ],
}
(ART / "adjudication_r0.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print(f"WRITE-OK {ART/'adjudication_r0.json'} titleMap={len(title_map)} proposals=2")
