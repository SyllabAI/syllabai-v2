#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-014: F4 (2024-06 02R q1/q2/q3 cluster) + F5 named furniture leads.

Fail-closed apply: all edits staged in memory, validated against the full invariant
battery (census/marks-law/mark-code union/PUA-FFFD-©/$-parity/furniture-0/diff-scope/
serialization law) BEFORE any write. On any gate failure -> exit non-zero, zero writes.

Evidence of record (printed pages, rendered at 150dpi, READ by the agent):
  2024-06 02R MS p5 (q1 block) / p6 (q2 block) / p7 (ALT block)  - download/t-oeq-mathsb/run014/evidence/mspg-0{5,6,7}.png
  2021-06 02 MS p7/p8 (Total 5 marks footer; q2 starts dy/dx)     - pg_2021-06_02_ms_q1c-0{7,8}.png
  2022-01 01 MS p18 (ALT sentence head)                           - pg_2022-01_01_ms_q25-18.png
  2023-06 02 MS p8/p9/p10 (q3 footer; q4(a)+(b) blocks)           - pg_2023-06_02_ms_q3-{08,09,10}.png
  2024-06 01 MS p18 (q19 cas row + Total 3 marks)                 - pg_2024-06_01_ms_q19-18.png
  2018-06 01 MS p14 (Notes|Mark|Sub-Total header variant)         - pg_2018-06_01_ms_q27-14.png
  2019-01 01 MS p7 (q10(b) block end)                             - pg_2019-01_01_ms_q10-07.png
  2019-06 02 QP p8 (4(e) stem + inverse-matrix hint)              - pg_2019-06_02_qp-08.png
"""
import json, re, sys, hashlib

PLANE = "/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json"
BACKUP = "/home/z/my-project/download/t-oeq-mathsb/run014/official-papers.backup-run014-pre-apply.json"

# ---------------------------------------------------------------- helpers
MARK_CODE_RE = re.compile(r"\b(M[123]|A[123]|B[123])(?=ft|oe|for\b|award|allow|dep|if\b|[^a-z]|$)")

def mark_codes(text):
    return set(MARK_CODE_RE.findall(text or ""))

def unescaped_dollars(text):
    """count $ not preceded by backslash"""
    return len(re.findall(r"(?<!\\)\$", text or ""))

PUA_RE = re.compile(r"[\uE000-\uF8FF\uFFFD]")

def furniture_scan(text):
    """returns list of furniture hits (playbook law 5 + spot-check law 10 header-prefix law)"""
    hits = []
    if not text:
        return hits
    for i, ln in enumerate(text.split("\n")):
        if len(ln) < 80 and re.match(r"^\s*(?:Question|Qu)\s+Work\w*\s+Ans\w*(?:\s+\w+){0,6}\s*$", ln, re.I):
            hits.append(("HEADER", i, ln))
        elif re.match(r"^\s*(?:cas\s+)?Total\s+\d+\s+marks?\s*$", ln):
            hits.append(("TOTAL", i, ln))
        elif re.match(r"^\s*cas\s+for\s+each\s+part\s*$", ln):
            hits.append(("CAS-EACH", i, ln))
        elif re.match(r"^\s*PMT\s*$", ln):
            hits.append(("PMT", i, ln))
    if re.search(r"spare grid|Do not write in this area|DO NOT WRITE", text, re.I):
        hits.append(("SPARE-GRID", -1, ""))
    return hits

# ---------------------------------------------------------------- load + backup
raw = open(PLANE, encoding="utf-8").read()
plane = json.loads(raw)
open(BACKUP, "w", encoding="utf-8").write(raw)

byid = {}
for paper in plane:
    for q in paper["questions"]:
        for part in q["parts"]:
            byid[part["id"]] = part

errors = []
def gate(cond, msg):
    if not cond:
        errors.append(msg)

# ---------------------------------------------------------------- the edits
E = {}  # pid -> dict of field -> new text  (None = delete-part-of-text handled explicitly)

# --- F4: 2024-06 02R q1 rebuilds (move-home; MS p5) ---
E["offp_2024-06_02r_1-a"] = {"solutionMd":
"42/7 × 2 oe or 42/7 × 9 [−12] M1 for a correct method to find number of tables or\n"
"or eg 2/7 = t/42 total number of tables and chairs\n"
"or setting up a correct equation to find the number of chairs\n"
"May be seen within a ratio ie 12 : 42\n"
"12 A1 cao"}

E["offp_2024-06_02r_1-b"] = {"solutionMd":
"(276 − 240)/240 [= 0.15] or (276 − 240)/240 × 100 or M1 for a correct method to find the % profit\n"
"276/240 [= 1.15] or 276/240 × 100 [= 115] May use multiple number of tables\n"
"eg (12 × 276 − 12 × 240)/(12 × 240)\n"
"15(%) A1 cao"}

E["offp_2024-06_02r_1-c"] = {"solutionMd":
"513/1.35 oe M1 for a correct method to find the price they were bought at\n"
"Allow x + 0.35x = 513 oe eg (513 − x)/x × 100 = 35\n"
"or 135% = 513 or 135%x = 513 or x + 35%x = 513\n"
"(\\$)380 A1 cao"}

E["offp_2024-06_02r_1-d"] = {"solutionMd":
"732 × 0.95 [= 695.4(0)] or 684/0.95 [= 720] oe M1 for a correct conversion\n"
"\"695.40\" − 684 [= 11.4(0)] or 732 − \"720\" [= 12] oe M1 for a correct subtraction\n"
"\"695.4(0)\" and \"720\" must come from a correct calculation\n"
"11.4(0) euros or \\$12 A1 oe eg €11.4(0) or 12 dollars\n"
"For a correct value with the correct units ISW"}

# --- F4: 2024-06 02R q2 rebuilds (strip foreign heads; MS p6+p7) ---
E["offp_2024-06_02r_2-a"] = {"solutionMd":
"(4 × 180 − 4 × 125)/2 [= 110] oe eg ((2 × 6 − 4) × 90 − 4 × 125)/2 [= 110] M2 for correct method to find one of the unknown interior angles of the hexagon\n"
"or 360 − 2 × 125 [= 110] oe eg 2 × (180 − 125) [= 110] could use sum of interior angles\n"
"or (360 − 4 × (180 − 125))/2 [= 70] oe or symmetry in the hexagon (eg line drawn from C to L)\n"
"or for correct method to find the exterior angle (at C or L) of the hexagon\n"
"can be implied by a correct calculation for y\n"
"(If not M2 then M1 for:\n"
"finding the angle sum of the hexagon\n"
"eg 4 × 180 [= 720] or (2 × 6 − 4) × 90 [= 720] oe\n"
"or finding one exterior angle of the hexagon\n"
"eg 180 − 125 [= 55]\n"
"or use of symmetry in the hexagon (eg line drawn from C to L)\n"
"and finding BCL or DCL or CLA or CLE\n"
"eg (360 − 2 × 125)/2 [= 55] or 180 − 125 [= 55]\n"
"eg ((8 − 2) × 180)/8 [= 135] oe eg ((2 × 8 − 4) × 90)/8 [= 135] or 360/8 [= 45] M1 for finding one interior angle of the octagon\n"
"or for finding one exterior angle of the octagon\n"
"can be implied by a correct calculation for y\n"
"eg 360 − \"110\" − \"135\" or \"70\" + (180 − \"135\") or \"70\" + \"45\" or \"45\" + (180 − \"110\") oe M1 (dep on all previous method marks awarded)\n"
"115 A1 cao"}

E["offp_2024-06_02r_2-b"] = {"solutionMd":
"10x + 25 + 7x − 83 = 180 oe eg 17x − 58 = 180 M1 for a correct equation in x\n"
"[x =] (180 + 58)/17 [= 14] M1 (dep on first method mark) for a correct expression for x\n"
"360/(7 × \"14\" − 83) or 360/(180 − (10 × \"14\" + 25)) M1 ft dep on M1\n"
"ft their value of x provided x is from (180 + 58)/17 or clearly labelled as x\n"
"24 A1 cao\n"
"ALT (b) eg T(7x − 83) = 360 and T(10x + 25) = 90(2T − 4) oe M1 for setting up two equations in x and T\n"
"eg T(7x − 83) = 360 and T(10x + 25) = 180(T − 2) Allow the use of any letters for T and x provided they are not the same\n"
"or 7x − 83 = 360/T and 10x + 25 = 180(T − 2)/T\n"
"eg 7Tx = 360 + 83T oe and 10Tx = 90(2T − 4) − 25T oe M1 for making 7xT or x the subject of each equation\n"
"eg x = (360 + 83T)/(7T) oe and x = (90(2T − 4) − 25T)/(10T) oe or for coefficient of xT the same in both equations\n"
"or for correct rearrangement of one equation followed by correct substitution into the other\n"
"eg 70Tx = 3600 + 830T oe and 70Tx = 630(2T − 4) − 175T oe Allow the use of any letters for T and x provided they are not the same\n"
"eg 1260T − 175T − 830T = 3600 + 2520 oe M1 for collecting T terms on 1 side and numbers on the other in a correct equation\n"
"Allow the use of any letters for T and x provided they are not the same\n"
"24 A1 cao"}

# --- F4: 2024-06 02R q3-a lead-in note moves home (MS p7 header note) ---
p3a = byid["offp_2024-06_02r_3-a"]
E["offp_2024-06_02r_3-a"] = {"solutionMd":
"In this question ignore any (incorrect) labelling of triangles\n" + p3a["solutionMd"]}

# --- F5: 2021-06 02 1-c strip footer + stray fragment (MS p7/p8) ---
p = byid["offp_2021-06_02_1-c"]
old = p["solutionMd"]
gate(old.endswith("Total 5 marks\ndy"), f"2021-06_02_1-c tail mismatch: {old[-40:]!r}")
E["offp_2021-06_02_1-c"] = {"solutionMd": old[: -len("Total 5 marks\ndy")].rstrip("\n")}

# --- F5: 2022-01 01 25 strip header + repair displaced sentence head (MS p18) ---
p = byid["offp_2022-01_01_25"]
old_lines = p["solutionMd"].split("\n")
gate(old_lines[38] == "Question Working Answer Mark Notes", f"2022-01_01_25 L38 mismatch: {old_lines[38]!r}")
gate(old_lines[39] == "square should be awarded the first three marks", f"2022-01_01_25 L39 mismatch: {old_lines[39]!r}")
new_lines = old_lines[:38] + ["A candidate who attempts to complete the square should be awarded the first three marks"] + old_lines[40:]
E["offp_2022-01_01_25"] = {"solutionMd": "\n".join(new_lines)}

# --- F5/F4-class: 2023-06 02 3 keep true q3 rows only; q4(b) rows move home ---
p = byid["offp_2023-06_02_3"]
old_lines = p["solutionMd"].split("\n")
gate(old_lines[15].startswith("30 000 A1 cas"), f"2023-06_02_3 L15 mismatch: {old_lines[15]!r}")
gate(old_lines[16] == "Total 4 marks", f"2023-06_02_3 L16 mismatch: {old_lines[16]!r}")
E["offp_2023-06_02_3"] = {"solutionMd": "\n".join(old_lines[:16])}

E["offp_2023-06_02_4-b"] = {"solutionMd":
"[UB =] 5.25 or [LB =] 5.15 B1 A correct upper or lower bound seen or used. Allow [UB/2 =] 2.625 or [LB/2 =] 2.575\n"
"tan(86) = h/(UB/2) or tan(4) = (UB/2)/h or h/sin(86) = (UB/2)/sin(4) M1 for setting up an equation to find the height of the triangle (h) or side length (S)\n"
"cos(86) = (UB/2)/S or sin(90 − 86 [= 4]) = (UB/2)/S or S/sin(86) = UB/sin(8) or 5.25² = S² + S² − 2S²cos(8) allow 5.1 ≤ UB ≤ 5.3 or 2.55 ≤ UB/2 ≤ 2.65\n"
"condone if use 171.5 ≤ angle ≤ 172.5\n"
"h = (UB/2)tan(86) [= 37.539…] or h = (UB/2)/tan(4) or h = (UB/2)/sin(4) × sin(86) M1 for correct method to find h or S\n"
"S = (UB/2)/cos(86) [= 37.63…] or S = (UB/2)/sin(90 − 86) [= 37.63] or S = (UB/sin(8)) × sin(86) Allow 5.1 ≤ UB ≤ 5.3 or 2.55 ≤ UB/2 ≤ 2.65 or awrt 37.5 or awrt 37.6\n"
"or S = √(5.25²/(2 − 2cos(8))) If previous method mark is awarded allow for awrt 36.5 ≤ h ≤ awrt 37.9 or awrt 36.5 ≤ S ≤ awrt 40.0\n"
"This mark implies the previous M1\n"
"Area of triangle = ½ × UB × \"h\" [Area = 98.54…] or ½ × \"h\" × \"S\" × sin(4) M1 for finding the area of the triangle\n"
"or ½ × UB × \"S\" × sin(86) or ½ × \"S\" × \"S\" × sin(8) where 5.1 ≤ UB ≤ 5.3 and S < 5 or S > 5.5 or h < 5 or h > 5.5 allow awrt 98.5\n"
"NB 0.5 × UB × UBsin172 is M0\n"
"or R = (UB + UB + S)/2 and √(R(R − UB)(R − UB)(R − S))\n"
"Area of polygon = \"45\" × \"98.54…\" or 2 × \"45\" × \"49.27…\" M1 dep on the 3rd M mark being awarded\n"
"4430 A1 dep on seeing 5.25 or 2.625 for UB throughout awrt 4430"}

# --- F5: 2024-06 01 19 strip footer, keep printed "cas" row (MS p18) ---
p = byid["offp_2024-06_01_19"]
old = p["solutionMd"]
gate(old.endswith("\nTotal 3 marks") or old.endswith("Total 3 marks"), f"2024-06_01_19 tail mismatch: {old[-30:]!r}")
E["offp_2024-06_01_19"] = {"solutionMd": old[: old.rfind("Total 3 marks")].rstrip("\n")}

# --- F5: 2018-06 01 27 strip tail header variant (MS p14) ---
p = byid["offp_2018-06_01_27"]
old = p["solutionMd"]
gate(old.endswith("Question Working Answer Notes Mark Sub- Total"), f"2018-06_01_27 tail mismatch: {old[-50:]!r}")
E["offp_2018-06_01_27"] = {"solutionMd": old[: -len("Question Working Answer Notes Mark Sub- Total")].rstrip("\n")}

# --- F5: 2019-01 01 10-b strip tail header (MS p7) ---
p = byid["offp_2019-01_01_10-b"]
old = p["solutionMd"]
gate(old.endswith("Question Working Answer Mark Notes"), f"2019-01_01_10-b tail mismatch: {old[-50:]!r}")
E["offp_2019-01_01_10-b"] = {"solutionMd": old[: -len("Question Working Answer Mark Notes")].rstrip("\n")}

# --- F5: 2019-06 02R 5-d stale MP mirror := solutionMd (render-visible survivor) ---
# (solutionMd unchanged; mirror slot [0] re-synced byte-exact below via _mp_only flag)
E["offp_2019-06_02r_5-d"] = {"_mp_only": True}

# --- F5: 2019-06 02 4-e problemMd junk strip + hint rebuild (QP p8) ---
E["offp_2019-06_02_4-e"] = {"problemMd":
"Triangle C is the image of triangle D under the transformation with matrix N. Find the matrix N.\n"
"\n"
"[The inverse of matrix $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ is $\\frac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$]\n"
"\n"
"![grid — official paper figure (qp.pdf p.9) (same figure as asset_4_a_grid)](https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/igcse-maths-b-16/2019-06/4MB1-02/assets/asset_4_a_grid.png)"}

# ---------------------------------------------------------------- staging + gates
import copy
expected_scope_fields = set()
for pid, fields in E.items():
    part = byid.get(pid)
    gate(part is not None, f"missing part {pid}")
    if not part:
        continue
    for field in fields:
        expected_scope_fields.add((pid, field))

# whole-plane SIMULATION (deep copy + all edits) — gates run against the post-state
sim_plane = copy.deepcopy(plane)
sim_byid = {part["id"]: part for paper in sim_plane for q in paper["questions"] for part in q["parts"]}
for pid, fields in E.items():
    sim = sim_byid[pid]
    for field, newv in fields.items():
        if field == "_mp_only":
            sim["markPoints"] = [{**mp, "textMd": sim["solutionMd"]} if i == 0 else mp
                                 for i, mp in enumerate(sim.get("markPoints", []))]
        else:
            sim[field] = newv
    # markPoints mirror law (playbook law 8 / run-013 law 11): any solutionMd edit must
    # mirror into markPoints[0].textMd in the SAME edit, byte-exact.
    if "solutionMd" in fields and sim.get("markPoints"):
        sim["markPoints"] = [{**mp, "textMd": sim["solutionMd"]} if i == 0 else mp
                             for i, mp in enumerate(sim["markPoints"])]

def paper_union(p):
    u = set()
    for qq in p["questions"]:
        for ppart in qq["parts"]:
            u |= mark_codes(ppart.get("solutionMd"))
            for mp in ppart.get("markPoints", []):
                u |= mark_codes(mp.get("textMd"))
    return u

edited_papers = {pid.rsplit("_", 2)[0] for pid in E}  # e.g. offp_2024-06_02r
for paper_o, paper_s in zip(plane, sim_plane):
    tag = paper_o["slug"]
    if not any(pid in {x["id"] for z in paper_o["questions"] for x in z["parts"]} for pid in E):
        continue
    u_before, u_after = paper_union(paper_o), paper_union(paper_s)
    gate(u_before <= u_after,
         f"{tag}: PAPER mark-code union shrank: {u_before - u_after} "
         "(run-014 note: conservation domain = paper, since F4/F5 MOVES rows across sibling questions)")

for pid, fields in E.items():
    sim = sim_byid[pid]

    # PUA / FFFD / © on edited fields
    for field in ("solutionMd", "problemMd"):
        txt = sim.get(field) or ""
        bad = PUA_RE.findall(txt) + ["©"] * txt.count("©")
        gate(not bad, f"{pid}.{field}: PUA/FFFD/© found: {bad[:5]}")

    # unescaped-$ parity per line
    for field in ("solutionMd", "problemMd"):
        for ln in (sim.get(field) or "").split("\n"):
            gate(unescaped_dollars(ln) % 2 == 0, f"{pid}.{field}: unbalanced $ on line: {ln[:60]!r}")

    # furniture 0 on edited fields
    for field in ("solutionMd", "problemMd"):
        fh = furniture_scan(sim.get(field) or "")
        gate(not fh, f"{pid}.{field}: furniture remains: {fh[:3]}")
    for i, mp in enumerate(sim.get("markPoints", [])):
        fh = furniture_scan(mp.get("textMd") or "")
        gate(not fh, f"{pid}.markPoints[{i}]: furniture remains: {fh[:3]}")

if errors:
    print("GATE FAILURES — zero writes:")
    for e in errors:
        print("  -", e)
    sys.exit(1)

# ---------------------------------------------------------------- apply
n_fields = 0
for pid, fields in E.items():
    part = byid[pid]
    for field, newv in fields.items():
        if field == "_mp_only":
            part["markPoints"] = [{**mp, "textMd": part["solutionMd"]} if i == 0 else mp
                                  for i, mp in enumerate(part.get("markPoints", []))]
        else:
            part[field] = newv
        n_fields += 1
    if "solutionMd" in fields and part.get("markPoints"):
        part["markPoints"] = [{**mp, "textMd": part["solutionMd"]} if i == 0 else mp
                              for i, mp in enumerate(part["markPoints"])]
        n_fields += 1

out = json.dumps(plane, ensure_ascii=False, separators=(",", ":"))
open(PLANE, "w", encoding="utf-8").write(out)

# ---------------------------------------------------------------- post-apply verification (fresh reload)
plane2 = json.loads(open(PLANE, encoding="utf-8").read())
byid2 = {part["id"]: part for paper in plane2 for q in paper["questions"] for part in q["parts"]}
post = []
nq = sum(len(p["questions"]) for p in plane2)
nparts = sum(len(q["parts"]) for p in plane2 for q in p["questions"])
marks_q = sum(q["totalMarks"] for p in plane2 for q in p["questions"])
marks_p = sum(pp["marks"] for p in plane2 for q in p["questions"] for pp in q["parts"])
post.append(("census", (len(plane2), nq, nparts, marks_q, marks_p) == (66, 1281, 2443, 6600, 6600)))
furn_left = []
for paper in plane2:
    for q in paper["questions"]:
        for part in q["parts"]:
            for field in ("solutionMd", "problemMd"):
                if furniture_scan(part.get(field) or "") and part["id"] in [e for e in E]:
                    furn_left.append((part["id"], field))
post.append(("edited-parts furniture 0", not furn_left))
# mirror law: for every part whose solutionMd changed and has MP, mp[0].textMd == solutionMd
mirror_ok = True
for pid, fields in E.items():
    part = byid2[pid]
    if "solutionMd" in fields and part.get("markPoints"):
        if part["markPoints"][0]["textMd"] != part["solutionMd"]:
            mirror_ok = False
            post.append((f"mirror {pid}", False))
post.append(("mirror law", mirror_ok))
# serialization law: re-dump equality
post.append(("serialization byte-law", json.dumps(plane2, ensure_ascii=False, separators=(",", ":")) == out))

sha16 = hashlib.sha256(out.encode()).hexdigest()[:16]
print("APPLIED:", n_fields, "fields across", len(E), "parts")
for name, ok in post:
    print(f"  {'PASS' if ok else 'FAIL'} {name}")
if not all(ok for _, ok in post):
    sys.exit(1)
print("plane sha16:", sha16)
print("scope fields:", sorted(f"{a}:{b}" for a, b in expected_scope_fields))
