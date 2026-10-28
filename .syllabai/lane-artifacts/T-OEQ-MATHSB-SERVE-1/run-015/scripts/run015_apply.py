#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-015: F5 fleet strip wave — deterministic whole-line strip.

Scope of record (sample_verdicts.json all-PASS):
  HEADER (1138) + TOTAL (1018) = 2156 whole-line furniture lines over 615 parts / 55 papers.
  SPARE-GRID-INSTR (53 hits / 53 parts) DEFERRED to run-016 eyes-on (fused single-line
  problemMd blocks carry genuine question text — whole-line strip unsafe, tier law).

Fail-closed apply: all edits staged in memory against a deep-copy simulation, validated
against the full invariant battery BEFORE any write; on any gate failure -> exit non-zero,
zero writes. Per-hit guards: exact content match at recorded line index; strip refused for
lines bearing mark-code tokens, '$', PUA/FFFD/(c), or any non-furniture residue.

Laws enforced (playbook):
  census EXACT (66/1281/2443/6600); PAPER-level mark-code union conserved EXACTLY (strips
  move nothing); PUA/FFFD/(c) not introduced; unescaped-$ parity per line; furniture census
  -> 0 HEADER/TOTAL hits fleet-wide (53 spare-grid disclosed remnants); markPoints[0].textMd
  := solutionMd byte-exact for every part whose solutionMd changed (mirror law 8/11);
  serialization byte-law (minified, ensure_ascii=False); diff-scope = line removals only.
"""
import json, re, sys, copy, hashlib

REPO = "/home/z/my-project/repos/syllabai-v2"
PLANE = f"{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json"
WL = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-014/f5-fleet-worklist.json"
SUPP = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-015/supplemental_cas_variants.json"
VERDICTS = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-015/sample_verdicts.json"
BACKUP = "/home/z/my-project/download/t-oeq-mathsb/run015/official-papers.backup-run015-pre-apply.json"

MARK_CODE_RE = re.compile(r"\b(M[123]|A[123]|B[123])(?=ft|oe|for\b|award|allow|dep|if\b|[^a-z]|$)")
PUA_RE = re.compile(r"[\uE000-\uF8FF\uFFFD]")
HEADER_RE = re.compile(r"^\s*(?:Question|Qu)\s+Work\w*\s+Ans\w*(?:\s+\w+){0,6}\s*$", re.I)
TOTAL_LINE_RE = re.compile(r"^\s*(?:cas\s+)?Total\s+\d+\s+marks?\s*$", re.I)


def furniture_scan(text):
    hits = []
    if not text:
        return hits
    for i, ln in enumerate(text.split("\n")):
        if len(ln) < 80 and HEADER_RE.match(ln):
            hits.append(("HEADER", i, ln))
        elif TOTAL_LINE_RE.match(ln):
            hits.append(("TOTAL", i, ln))
        elif re.match(r"^\s*cas\s+for\s+each\s+part\s*$", ln):
            hits.append(("CAS-EACH", i, ln))
        elif re.match(r"^\s*PMT\s*$", ln):
            hits.append(("PMT", i, ln))
    if re.search(r"spare grid|Do not write in this area|DO NOT WRITE", text, re.I):
        hits.append(("SPARE-GRID", -1, ""))
    return hits


def mark_codes(text):
    return set(MARK_CODE_RE.findall(text or ""))


def unescaped_dollars(text):
    return len(re.findall(r"(?<!\\)\$", text or ""))


def paper_union(p):
    u = set()
    for qq in p["questions"]:
        for ppart in qq["parts"]:
            u |= mark_codes(ppart.get("solutionMd"))
            for mp in ppart.get("markPoints", []):
                u |= mark_codes(mp.get("textMd"))
    return u


# ---------------------------------------------------------------- load
raw = open(PLANE, encoding="utf-8").read()
plane = json.loads(raw)
open(BACKUP, "w", encoding="utf-8").write(raw)
wl = json.load(open(WL))
supp = json.load(open(SUPP))
verdicts = json.load(open(VERDICTS))

# scope: HEADER/TOTAL hits whose paper verdict is PASS, + supplemental case-variant hits (evidenced separately)
strip_hits = []
deferred = {"SPARE-GRID-INSTR": 0, "FAILED-PAPER": 0}
for h in wl["worklist"]:
    if h["kind"] == "SPARE-GRID-INSTR":
        deferred["SPARE-GRID-INSTR"] += 1
        continue
    series, paper = h["pid"].split("_")[1], h["pid"].split("_")[2]
    v = verdicts["papers"].get(f"{series}_{paper}")
    if not v or v["verdict"] != "PASS":
        deferred["FAILED-PAPER"] += 1
        continue
    strip_hits.append(h)
for h in supp["worklist"]:
    strip_hits.append(h)

print(f"strip scope: {len(strip_hits)} hits (deferred: {deferred})")

errors = []
def gate(cond, msg):
    if not cond:
        errors.append(msg)

byid = {p["id"]: p for paper in plane for q in paper["questions"] for p in q["parts"]}

# ---------------------------------------------------------------- plan edits per (pid, field)
# field text -> set of line indices to remove
plan = {}  # (pid, field) -> {"remove": set[int], "texts": {idx: text}}
for h in strip_hits:
    part = byid.get(h["pid"])
    gate(part is not None, f"missing part {h['pid']}")
    if part is None:
        continue
    fname = h["field"]
    if fname.startswith("markPoints["):
        mi = int(fname[len("markPoints["):-1])
        gate(mi == 0, f"{h['pid']}: markPoints slot {mi} outside mirror-sync scope — eyes-on")
        text = part["markPoints"][mi].get("textMd", "")
    else:
        text = part.get(fname, "")
    lines = text.split("\n")
    idx = h["line"]
    gate(0 <= idx < len(lines), f"{h['pid']}.{fname}: line {idx} out of range (len {len(lines)})")
    if not (0 <= idx < len(lines)):
        continue
    gate(lines[idx] == h["text"], f"{h['pid']}.{fname}: L{idx} content drift: {lines[idx]!r} != {h['text']!r}")
    ln = lines[idx]
    # per-line guards: refuse anything that is not pure boilerplate
    gate(not mark_codes(ln), f"{h['pid']}.{fname}: L{idx} bears mark codes: {ln!r}")
    gate("$" not in ln, f"{h['pid']}.{fname}: L{idx} bears $: {ln!r}")
    gate(not PUA_RE.search(ln) and "©" not in ln, f"{h['pid']}.{fname}: L{idx} bears PUA/©: {ln!r}")
    gate(HEADER_RE.match(ln) or TOTAL_LINE_RE.match(ln), f"{h['pid']}.{fname}: L{idx} not boilerplate: {ln!r}")
    plan.setdefault((h["pid"], fname), {"remove": set(), "texts": {}})
    plan[(h["pid"], fname)]["remove"].add(idx)
    plan[(h["pid"], fname)]["texts"][idx] = ln

# ---------------------------------------------------------------- simulate
sim_plane = copy.deepcopy(plane)
sim_byid = {p["id"]: p for paper in sim_plane for q in paper["questions"] for p in q["parts"]}

solution_edited = set()
for (pid, fname), spec in plan.items():
    part = sim_byid[pid]
    if fname.startswith("markPoints["):
        mi = int(fname[len("markPoints["):-1])
        lines = part["markPoints"][mi]["textMd"].split("\n")
    else:
        lines = part[fname].split("\n")
    new_lines = [ln for i, ln in enumerate(lines) if i not in spec["remove"]]
    new_text = "\n".join(new_lines)
    if fname.startswith("markPoints["):
        mi = int(fname[len("markPoints["):-1])
        part["markPoints"][mi]["textMd"] = new_text
    else:
        part[fname] = new_text
    if fname == "solutionMd":
        solution_edited.add(pid)

# mirror law: textMd := solutionMd byte-exact (slot 0) for every solutionMd-edited part with mirrors
for pid in solution_edited:
    part = sim_byid[pid]
    if part.get("markPoints"):
        part["markPoints"][0]["textMd"] = part["solutionMd"]

# ---------------------------------------------------------------- gates on the post-state
# 1. census EXACT
nq = sum(len(p["questions"]) for p in sim_plane)
nparts = sum(len(q["parts"]) for p in sim_plane for q in p["questions"])
mq = sum(q["totalMarks"] for p in sim_plane for q in p["questions"])
mp = sum(pp["marks"] for p in sim_plane for q in p["questions"] for pp in q["parts"])
gate((len(sim_plane), nq, nparts, mq, mp) == (66, 1281, 2443, 6600, 6600),
     f"census moved: {(len(sim_plane), nq, nparts, mq, mp)}")

# 2. PAPER-level mark-code union conserved EXACTLY (strips move nothing)
for po, ps in zip(plane, sim_plane):
    ub, ua = paper_union(po), paper_union(ps)
    gate(ub == ua, f"{po['slug']}: mark-code union changed: -{ub-ua} +{ua-ub}")

# 3. per-edited-part field hygiene
all_edited_pids = {pid for (pid, _) in plan} | solution_edited
for pid in sorted(all_edited_pids):
    part = sim_byid[pid]
    for fname in ("solutionMd", "problemMd"):
        txt = part.get(fname) or ""
        gate(not PUA_RE.search(txt), f"{pid}.{fname}: PUA/FFFD introduced")
        for ln in txt.split("\n"):
            gate(unescaped_dollars(ln) % 2 == 0, f"{pid}.{fname}: unbalanced $: {ln[:60]!r}")
    for i, mpn in enumerate(part.get("markPoints", [])):
        t = mpn.get("textMd") or ""
        gate(not PUA_RE.search(t), f"{pid}.markPoints[{i}]: PUA/FFFD introduced")

# 4. furniture census on post-state: 0 HEADER/TOTAL/CAS-EACH/PMT fleet-wide; spare-grid remnants == 53 known parts
rem = {"HEADER": 0, "TOTAL": 0, "CAS-EACH": 0, "PMT": 0, "SPARE-GRID": 0}
spare_parts = set()
for paper in sim_plane:
    for q in paper["questions"]:
        for p in q["parts"]:
            for field in ("solutionMd", "problemMd"):
                for kind, _, _ in furniture_scan(p.get(field) or ""):
                    rem[kind] += 1
                    if kind == "SPARE-GRID":
                        spare_parts.add((p["id"], field))
            for mpn in p.get("markPoints", []):
                for kind, _, _ in furniture_scan(mpn.get("textMd") or ""):
                    rem[kind] += 1
gate(rem["HEADER"] == 0 and rem["TOTAL"] == 0 and rem["CAS-EACH"] == 0 and rem["PMT"] == 0,
     f"furniture remains after strip: { {k: v for k, v in rem.items() if k != 'SPARE-GRID'} }")
gate(rem["SPARE-GRID"] == 53, f"spare-grid remnants {rem['SPARE-GRID']} != 53 (deferred class must be untouched)")

# 5. mirror law byte-exact
for pid in solution_edited:
    part = sim_byid[pid]
    if part.get("markPoints"):
        gate(part["markPoints"][0]["textMd"] == part["solutionMd"], f"{pid}: mirror not byte-exact")

# 6. diff-scope: only intended fields changed; changes are exactly line removals
before_byid = {p["id"]: p for paper in plane for q in paper["questions"] for p in q["parts"]}
changed = set()
for paper_o, paper_s in zip(plane, sim_plane):
    for qo, qs in zip(paper_o["questions"], paper_s["questions"]):
        for pb, pa in zip(qo["parts"], qs["parts"]):
            for field in ("solutionMd", "problemMd"):
                if pb.get(field) != pa.get(field):
                    changed.add((pb["id"], field))
            if len(pb.get("markPoints", [])) != len(pa.get("markPoints", [])):
                gate(False, f"{pb['id']}: markPoints length changed")
            for i, (mb, ma) in enumerate(zip(pb.get("markPoints", []), pa.get("markPoints", []))):
                if mb.get("textMd") != ma.get("textMd"):
                    changed.add((pb["id"], f"markPoints[{i}]"))
                for k in mb:
                    if k != "textMd" and mb.get(k) != ma.get(k):
                        gate(False, f"{pb['id']}.markPoints[{i}].{k}: non-textMd key changed")
            for k in pb:
                if k not in ("solutionMd", "problemMd", "markPoints") and pb.get(k) != pa.get(k):
                    gate(False, f"{pb['id']}.{k}: OUT-OF-SCOPE field changed")
gate(changed == set(plan) | {(pid, "markPoints[0]") for pid in solution_edited if sim_byid[pid].get("markPoints")},
     f"diff scope mismatch: extra={changed - set(plan)}")

# 7. removed lines are exactly the planned furniture lines
#    (markPoints[0] on solutionMd-edited parts is governed by the mirror law — verified in #5;
#     stale mirrors there are disclosed below, not line-checked)
stale_mirrors = []
for (pid, fname), spec in plan.items():
    part_b, part_a = before_byid[pid], sim_byid[pid]
    if fname.startswith("markPoints["):
        if fname == "markPoints[0]" and pid in solution_edited:
            if part_b["markPoints"][0]["textMd"] != part_b["solutionMd"]:
                stale_mirrors.append(pid)
            continue
        mi = int(fname[len("markPoints["):-1])
        tb = part_b["markPoints"][mi]["textMd"].split("\n")
        ta = part_a["markPoints"][mi]["textMd"].split("\n")
    else:
        tb = part_b[fname].split("\n")
        ta = part_a[fname].split("\n")
    expect = [ln for i, ln in enumerate(tb) if i not in spec["remove"]]
    gate(ta == expect, f"{pid}.{fname}: post-line mismatch vs planned removals")

if errors:
    print("GATE FAILURES — zero writes:")
    for e in errors[:40]:
        print("  -", e)
    sys.exit(1)

# ---------------------------------------------------------------- apply
n_fields = 0
n_lines = 0
for (pid, fname), spec in plan.items():
    part = byid[pid]
    if fname.startswith("markPoints["):
        mi = int(fname[len("markPoints["):-1])
        lines = part["markPoints"][mi]["textMd"].split("\n")
    else:
        lines = part[fname].split("\n")
    part_new_lines = [ln for i, ln in enumerate(lines) if i not in spec["remove"]]
    n_lines += len(lines) - len(part_new_lines)
    if fname.startswith("markPoints["):
        mi = int(fname[len("markPoints["):-1])
        part["markPoints"][mi]["textMd"] = "\n".join(part_new_lines)
    else:
        part[fname] = "\n".join(part_new_lines)
    n_fields += 1
for pid in solution_edited:
    part = byid[pid]
    if part.get("markPoints"):
        part["markPoints"][0]["textMd"] = part["solutionMd"]
        n_fields += 1

out = json.dumps(plane, ensure_ascii=False, separators=(",", ":"))
open(PLANE, "w", encoding="utf-8").write(out)

# ---------------------------------------------------------------- post-apply verification (fresh reload)
plane2 = json.loads(open(PLANE, encoding="utf-8").read())
post = []
nq2 = sum(len(p["questions"]) for p in plane2)
nparts2 = sum(len(q["parts"]) for p in plane2 for q in p["questions"])
mq2 = sum(q["totalMarks"] for p in plane2 for q in p["questions"])
mp2 = sum(pp["marks"] for p in plane2 for q in p["questions"] for pp in q["parts"])
post.append(("census 66/1281/2443/6600==6600", (len(plane2), nq2, nparts2, mq2, mp2) == (66, 1281, 2443, 6600, 6600)))
byid2 = {p["id"]: p for paper in plane2 for q in paper["questions"] for p in q["parts"]}
rem2 = {"HEADER": 0, "TOTAL": 0, "CAS-EACH": 0, "PMT": 0, "SPARE-GRID": 0}
for paper in plane2:
    for q in paper["questions"]:
        for p in q["parts"]:
            for field in ("solutionMd", "problemMd"):
                for kind, _, _ in furniture_scan(p.get(field) or ""):
                    rem2[kind] += 1
            for mpn in p.get("markPoints", []):
                for kind, _, _ in furniture_scan(mpn.get("textMd") or ""):
                    rem2[kind] += 1
post.append(("HEADER/TOTAL/CAS/PMT == 0", rem2["HEADER"] == rem2["TOTAL"] == rem2["CAS-EACH"] == rem2["PMT"] == 0))
post.append(("SPARE-GRID remnants == 53 (deferred)", rem2["SPARE-GRID"] == 53))
mirror_ok = all(byid2[pid].get("markPoints", [{}])[0].get("textMd") == byid2[pid]["solutionMd"]
                for pid in solution_edited if byid2[pid].get("markPoints"))
post.append(("mirror law byte-exact", mirror_ok))
post.append(("serialization byte-law", json.dumps(plane2, ensure_ascii=False, separators=(",", ":")) == out))

sha16 = hashlib.sha256(out.encode()).hexdigest()[:16]
print(f"APPLIED: {n_lines} furniture lines stripped across {len(plan)} field edits (+{len(solution_edited)} mirror syncs), {len(all_edited_pids)} parts")
print(f"stale mirrors re-synced byte-exact (run-013 law, disclosed): {len(stale_mirrors)}")
for name, ok in post:
    print(f"  {'PASS' if ok else 'FAIL'} {name}")
if not all(ok for _, ok in post):
    sys.exit(1)
print("plane sha16:", sha16)
print("post furniture census:", rem2)
