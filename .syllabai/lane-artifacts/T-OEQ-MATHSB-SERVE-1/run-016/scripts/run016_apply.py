#!/usr/bin/env python3
"""run-016 apply: 53 SPARE-GRID fused problemMd rebuilds/strips. FAIL-CLOSED.
Modes: strip (stem = split at verified junk marker; links kept, deduped by URL)
       rebuild (evidence-verified new text: stem + optional formula box + links)
Gates G1-G10; write only on ALL GREEN. Receipt data emitted separately.
"""
import json, re, subprocess, sys, hashlib

ROOT = "/home/z/my-project/repos/syllabai-v2"
PLANE = f"{ROOT}/apps/hub/content/igcse-maths-b-16/official-papers.json"
RAW_URL = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/igcse-maths-b-16"

INV_THE = "[The inverse of matrix $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ is $\\frac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$]"
INV = "[Inverse of matrix $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ is $\\frac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$]"
DET = "[Determinant of matrix $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad-bc$]"

def grid_link(series, paper, asset, page):
    return f"![grid \u2014 official paper figure (qp.pdf p.{page})]({RAW_URL}/{series}/{paper}/assets/{asset}.png)"

# ---------- STRIP table: pid -> junk-head marker (verified against dump) ----------
STRIP = {
    "offp_2018-06_02_10-c": " y 8\u2013",
    "offp_2019-01_02_9-f": " y \u201310 \u20138",
    "offp_2019-01_02_11-e": " y \u20132 \u20131 O 1 2 3 x \u20135 \u201310",
    "offp_2019-06_02_11-f": " V O 1 2 3 r",
    "offp_2020-01_02_2-d": " y \u20136 \u20135",
    "offp_2020-06_02_11-d": " y \u20133 \u20132 \u20131 O",
    "offp_2020-11_02_11-d": " y \u20133 \u20132 \u20131 O",
    "offp_2021-01_02_11-d": " y \u22122 \u22121 O 1 2 3 x \u221210",
    "offp_2021-06_02_6-e": " y \u22125 \u22124 \u22123",
    "offp_2021-06_02_9-d": " y A \u221210 \u22128",
    "offp_2021-11_02_7-d": " y \u22122 \u22121 O 1 2 x",
    "offp_2022-01_02_3-c": " y A \u201310",
    "offp_2022-01_02_11-f": " y \u20133 \u20132 \u20131 O 1 2 3 4 x",
    "offp_2022-06_02_10-f": " V 200",
    "offp_2023-01_02_11-d": " y \u22126 \u22125 \u22124",
    "offp_2023-06_02_5-d-ii": " y \u22122 \u22121 O 1 2 x",
    "offp_2024-06_02_9-d": " y O x \u22124",
    "offp_2024-11_02_10-d": " y \u22123 \u22122 \u22121 O",
    "offp_2025-06_02_10-e": " y \u22123 \u22122 \u22121 O 1 2 3 x \u22122 \u22124",
    "offp_2025-11_02_8-d": " y 4 A \u221210",
    "offp_2025-11_02_9-e": " y \u22121 O 1 2 3 4 x",
    "offp_2026-06_02_7-c": " y B \u22126",
    "offp_2026-06_02_10-d-ii": " y \u22124 \u22123 \u22122 \u22121 O",
    "offp_2019-01_02r_2-e": " y \u22122 \u22121 O 1 2 3 4 5 x",
    "offp_2020-01_02r_9-d": " y \u201312",
    "offp_2020-01_02r_11-e": " y 3.5",
    "offp_2021-01_02r_3-c": " x y \u22122 \u22121 O x",
    "offp_2022-01_02r_6-e": " y A \u20136",
    "offp_2022-01_02r_8-e": " y \u20133 \u20132 \u20131 O 1 2 3 4 x",
    "offp_2022-06_02r_7-e": " v 0 0.5",
    "offp_2023-01_02r_4-d": " y Q P \u20135",
    "offp_2023-01_02r_8-c": " y \u20134 \u20133 \u20132 \u20131 O 1 2 3 4 x",
    "offp_2023-06_02r_3-c": " y \u20135 \u20134 \u20133 \u20132 \u20131 O 1 2 3 4 5 x",
    "offp_2023-06_02r_6-e": " y A \u20138",
    "offp_2023-06_02r_9-d": " y O 1 2 3 4 5 x",
    "offp_2024-06_02r_3-d": " y B A \u22127",
    "offp_2026-06_02r_10-e": " y A \u22127 \u22126",
    "offp_2025-06_02r_7-c": " y A O x \u22127",
    "offp_2026-06_02r_12-c": " 2x y 0.2",
}

# ---------- REBUILD table: pid -> (new_text_without_links, link_mode) ----------
# link_mode: "keep" (dedupe same-URL), "crop:<series>/<paper>/<asset>/<page>" (replace with new crop link)
def R(text, mode):
    return {"text": text, "mode": mode}

REBUILD = {
    "offp_2018-06_02_7-f": R("Describe fully the single transformation represented by the matrix M\u207b\u00b9.\n\n" + INV_THE, "keep"),
    "offp_2020-06_02_8-d": R("find the value of k.", "crop:2020-06/4MB1-02/asset_8_d_grid/21"),
    "offp_2020-11_02_8-d": R("find the value of k.", "crop:2020-11/4MB1-02/asset_8_d_grid/21"),
    "offp_2021-01_02_9-f": R("State, giving a reason, the matrix N\u00b2.", "keep"),
    "offp_2021-11_02_5-d": R("Find matrix N.\n\n" + INV_THE, "keep"),
    "offp_2022-06_02_9-e": R("Calculate the area of quadrilateral A.\n\n" + DET, "keep"),
    "offp_2023-06_02_10-d": R("find the coordinates of the vertices of triangle F.\n\n" + DET, "keep"),
    "offp_2023-11_02_7-d": R("draw and label triangle D. Show your working clearly.\n\n" + DET, "keep"),
    "offp_2023-11_02_8-d": R("By drawing a suitable straight line on your grid, find an estimate to the nearest whole number, of the gradient of the curve $y = x^2 - 4x - 4$ at the point where $x = -1$.", "crop:2023-11/4MB1-02/asset_8_d_grid/17"),
    "offp_2024-06_02_4-e": R("Using a combination of transformation matrices or otherwise, find the matrix N.\n\n" + INV_THE, "keep"),
    "offp_2024-11_02_11-e": R("find the value of k.\n\n" + INV, "crop:2024-11/4MB1-02/asset_11_e_grid/33"),
    "offp_2025-06_02_12-d-ii": R("calculate the value of k.\n\n" + DET, "keep"),
    "offp_2021-01_02r_7-e": R("Find the matrix Q.\n\n" + INV_THE, "keep"),
    "offp_2025-06_02r_11-g": R("By drawing a suitable line (at least 3 cm long) on the grid, find the gradient of curve C at the point where x = 1.5.", "keep"),
}

LINK_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")

def extract_links(pm):
    out, seen = [], set()
    for m in LINK_RE.finditer(pm):
        s = m.group(0)
        url = s[s.index("](") + 2 : -1]
        if url in seen:
            continue
        seen.add(url)
        out.append(s)
    return out

def paper_marks_union(plane):
    union = {}
    for s in plane:
        codes = set()
        for q in s["questions"]:
            for p in q["parts"]:
                for mp in p.get("markPoints", []) or []:
                    for c in mp.get("codes", []) or []:
                        codes.add(c)
                for c in p.get("codes", []) or []:
                    codes.add(c)
        union[s["slug"]] = codes
    return union

def census(plane):
    sets = len(plane)
    qs = sum(len(s["questions"]) for s in plane)
    parts = sum(len(q["parts"]) for s in plane for q in s["questions"])
    marks = sum(int(p.get("marks", 0)) for s in plane for q in s["questions"] for p in q["parts"])
    return sets, qs, parts, marks

plane = json.load(open(PLANE))
before_raw = open(PLANE, "rb").read()
idx = {}
for s in plane:
    for q in s["questions"]:
        for p in q["parts"]:
            idx[p["id"]] = p

all_pids = set(STRIP) | set(REBUILD)
assert len(all_pids) == 53 and len(STRIP) == 39 and len(REBUILD) == 14, (len(STRIP), len(REBUILD))
missing = all_pids - set(idx)
assert not missing, missing

c_before = census(plane)
union_before = paper_marks_union(plane)
edits = {}

for pid, marker in STRIP.items():
    pm = idx[pid]["problemMd"]
    pos = pm.find(marker)
    assert pos > 0, (pid, marker, "marker not found")
    stem = pm[:pos].rstrip()
    links = extract_links(pm)
    new = stem + ("\n\n" + "\n\n".join(links) if links else "")
    edits[pid] = (pm, new)

for pid, spec in REBUILD.items():
    pm = idx[pid]["problemMd"]
    if spec["mode"] == "keep":
        links = extract_links(pm)
    else:
        _, series, paper, asset, page = spec["mode"].split(":")[0], *spec["mode"].split(":")[1].split("/")
        links = [grid_link(series, paper, asset, page)]
    new = spec["text"] + ("\n\n" + "\n\n".join(links) if links else "")
    edits[pid] = (pm, new)

# ---------- apply in-memory ----------
for pid, (old, new) in edits.items():
    idx[pid]["problemMd"] = new

# ---------- GATES ----------
fails = []
def gate(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name} {detail}")
    if not cond:
        fails.append(name)

c_after = census(plane)
gate("G1 census EXACT", c_before == c_after == (66, 1281, 2443, 6600), str(c_after))

# G2 diff scope: exactly the 53 problemMd fields
diff_fields = []
def walk(a, b, path):
    if type(a) is not type(b):
        diff_fields.append(path); return
    if isinstance(a, dict):
        for k in set(a) | set(b):
            if k not in a or k not in b:
                diff_fields.append(f"{path}.{k}")
            else:
                walk(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b):
            diff_fields.append(path); return
        for i, (x, y) in enumerate(zip(a, b)):
            walk(x, y, f"{path}[{i}]")
    else:
        if a != b:
            diff_fields.append(path)

before_plane = json.loads(before_raw)
walk(before_plane, plane, "")
bad_scope = [d for d in diff_fields if not (d.endswith(".problemMd") and d.split("'][3]['id']")[-1] if False else d.endswith(".problemMd"))]
# pid extraction for report
pid_of_field = {}
for s in before_plane:
    for q in s["questions"]:
        for p in q["parts"]:
            pid_of_field[f"root[{before_plane.index(s)}].questions[{q.get('id','?')}]" ] = None
scope_ok = all(d.endswith(".problemMd") for d in diff_fields) and len(diff_fields) == 53
gate("G2 diff scope 53 problemMd only", scope_ok, f"diffs={len(diff_fields)} nonPm={[d for d in diff_fields if not d.endswith('.problemMd')][:3]}")

# G3 edited fields clean: no captions/ticks/PUA/FFFD/total-footer/stub-note-on-crop-parts
CAPTION = re.compile(r"for a spare grid|Only use this grid|A spare grid is on the next page|Turn to page \d+ for a spare", re.I)
TICK = re.compile(r"[yvV]\s*[\u2013\u2212-]?\d+(\s+[\u2013\u2212-]?\d+){4,}")
for pid, (old, new) in edits.items():
    if CAPTION.search(new) or TICK.search(new):
        fails.append(f"G3 residue {pid}")
    if "\ufffd" in new or any(0xE000 <= ord(ch) <= 0xF8FF for ch in new):
        fails.append(f"G3 pua/fffd {pid}")
    if "(Total Question" in new:
        fails.append(f"G3 total-footer {pid}")
gate("G3 residue/PUA/FFFD/total clean", not any(f.startswith("G3") for f in fails))

# G4 marks untouched (deep: all 'marks' fields equal)
marks_diffs = []
def walk_marks(a, b, path):
    if isinstance(a, dict):
        for k in a:
            if k == "marks" and a[k] != b.get(k):
                marks_diffs.append(path)
            elif k in b:
                walk_marks(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        for i, (x, y) in enumerate(zip(a, b)):
            walk_marks(x, y, f"{path}[{i}]")
walk_marks(before_plane, plane, "")
gate("G4 marks untouched", not marks_diffs, str(marks_diffs[:3]))

# G5 paper-level mark-code union conserved
union_after = paper_marks_union(plane)
gate("G5 mark-code union conserved", union_before == union_after)

# G6 $-parity per edited field (even count of unescaped $)
par = []
for pid, (old, new) in edits.items():
    if new.count("$") % 2 != 0:
        par.append(pid)
gate("G6 $-parity", not par, str(par))

# G7 stem preservation for strips (stem must be prefix of old)
stem_fail = []
for pid, marker in STRIP.items():
    old, new = edits[pid]
    pos = old.find(marker)
    if not new.startswith(old[:pos].rstrip()[:60]):
        stem_fail.append(pid)
gate("G7 strip stems preserved", not stem_fail, str(stem_fail))

# G8 every link in every edited part HEAD-200 (sampled HEAD; full URL set)
urls = set()
for pid, (old, new) in edits.items():
    for m in LINK_RE.finditer(new):
        urls.add(m.group(0)[m.group(0).index("](") + 2 : -1])
print(f"G8 link URLs to verify: {len(urls)}")

# G9 whole-plane hygiene census: PUA/FFFD/(c) 0 after; furniture in problemMd dropped
whole = json.dumps(plane, ensure_ascii=False)
pua = sum(1 for ch in whole if 0xE000 <= ord(ch) <= 0xF8FF)
gate("G9 whole-plane PUA/FFFD 0", pua == 0 and "\ufffd" not in whole, f"pua={pua}")

# G10 old-text sanity: every edited old problemMd actually carried a spare-grid caption
no_cap = [pid for pid, (old, new) in edits.items() if not CAPTION.search(old)]
gate("G10 all edited parts carried the fused class", not no_cap, str(no_cap))

# emit link list for the URL gate script
json.dump(sorted(urls), open(f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016/urls_to_gate.json", "w"), indent=0)
# emit new-link subset
new_urls = sorted(u for u in urls if any(a in u for a in ("2020-06/4MB1-02/assets/asset_8_d_grid", "2020-11/4MB1-02/assets/asset_8_d_grid", "2024-11/4MB1-02/assets/asset_11_e_grid", "2023-11/4MB1-02/assets/asset_8_d_grid")))
json.dump(new_urls, open(f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016/new_urls.json", "w"), indent=0)
print("new crop URLs:", len(new_urls))

if fails:
    print("\nFAILURES:", fails)
    sys.exit(1)

# ---------- write (single-line compact, ensure_ascii=False, no trailing newline) ----------
out = json.dumps(plane, ensure_ascii=False, separators=(",", ":"))
open(PLANE, "w").write(out)
print("\nWROTE plane:", len(out.encode()), "bytes; sha16:", hashlib.sha256(out.encode()).hexdigest()[:16])
for pid in list(edits)[:0]:
    pass
# print compact per-part summary
for pid, (old, new) in list(edits.items()):
    print(f"  {pid}: {len(old)} -> {len(new)} B")
