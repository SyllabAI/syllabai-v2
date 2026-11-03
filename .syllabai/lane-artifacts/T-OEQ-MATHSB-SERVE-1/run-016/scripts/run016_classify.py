#!/usr/bin/env python3
"""run-016 Phase A: classify the 53 SPARE-GRID-INSTR fused problemMd blocks.
For each part: locate fused segments (tick runs + spare-grid captions), detect
figure links, and propose a surgical rebuild plan for eyes-on adjudication.
Read-only against the plane; writes the classification JSON only.
"""
import json, re, sys

ROOT = "/home/z/my-project/repos/syllabai-v2"
WL = f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-014/f5-fleet-worklist.json"
PLANE = f"{ROOT}/apps/hub/content/igcse-maths-b-16/official-papers.json"
OUT = f"{ROOT}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016/sparegrid_classification.json"

wl = json.load(open(WL))
sg = [it for it in wl["worklist"] if it["kind"] == "SPARE-GRID-INSTR"]
plane = json.load(open(PLANE))
idx = {}
for s in plane:
    for q in s["questions"]:
        for p in q["parts"]:
            idx[p["id"]] = p

# caption signature: "<...> for a spare grid if you need to redraw your <noun>." and
# "Only use this grid if you need to redraw your <noun>."
RE_SPARE = re.compile(r"[^.]*?for a spare grid if you need to redraw your [^.]*\.", re.I)
RE_ONLY = re.compile(r"Only use this grid if you need to redraw your [^.]*\.", re.I)
RE_TICKRUN = re.compile(r"(?:y\s+)?(?:[–−-]?\d+\s+)+[Ox][\s\S]*?(?=\.[A-Z<]|$)")

out = []
for it in sg:
    pid = it["pid"]
    p = idx[pid]
    pm = p.get("problemMd", "")
    links = re.findall(r"!\[[^\]]*\]\((https://[^)]+)\)", pm)
    m_spare = RE_SPARE.search(pm)
    m_only = RE_ONLY.search(pm)
    cap = {
        "spareCaption": m_spare.group(0) if m_spare else None,
        "onlyCaption": m_only.group(0) if m_only else None,
    }
    noun = None
    m = re.search(r"redraw your ([a-z ]+)\.", pm, re.I)
    if m:
        noun = m.group(1)
    # fused zone = from first tick-run start (or first caption) to end of last tick run
    first_pos = min([x for x in (pm.find(" for a spare grid"), pm.find("Only use this grid")) if x >= 0] or [-1])
    # find the tick-run head: scan backwards from first_pos for "y " followed by digits
    fused_head = None
    if first_pos >= 0:
        seg = pm[:first_pos]
        # last occurrence of "y " + number sequence start
        mm = None
        for m2 in re.finditer(r"(?:^|(?<=[.\s]))y\s+[–−-]?\d", seg):
            mm = m2
        if mm:
            fused_head = mm.start()
    n_links_main = len(links)
    # duplicated link targets?
    dup = len(links) != len(set(links))
    # does stem text end cleanly before fused head?
    out.append({
        "pid": pid,
        "problemMdLen": len(pm),
        "noun": noun,
        "captions": cap,
        "fusedHeadIdx": fused_head,
        "fusedZone": pm[fused_head:].strip() if fused_head is not None else None,
        "stem": pm[:fused_head].strip() if fused_head is not None else pm,
        "figureLinks": links,
        "dupLinks": dup,
        "nLinks": n_links_main,
        "hasMatrixBox": bool(re.search(r"[⎡⎛⎜⎝⎤⎞⎠⎢]", pm)) or "inverse of matrix" in pm.lower(),
    })

kinds = {}
for o in out:
    key = (o["noun"], o["hasMatrixBox"], o["nLinks"], o["dupLinks"])
    kinds[str(key)] = kinds.get(str(key), 0) + 1
print("== variant census (noun, matrixBox, nLinks, dupLinks) ==")
for k, v in sorted(kinds.items(), key=lambda kv: -kv[1]):
    print(f"  x{v}: {k}")

print(f"\nclassified: {len(out)} parts; fusedHeadIdx None count:", sum(1 for o in out if o['fusedHeadIdx'] is None))
for o in out:
    if o["fusedHeadIdx"] is None:
        print("  NO-FUSED-HEAD:", o["pid"], "| pm:", o["problemMdLen"])

# missing figure links?
nolink = [o["pid"] for o in out if o["nLinks"] == 0]
print("\nparts with ZERO figure links:", nolink)

json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print("\nwrote", OUT)
