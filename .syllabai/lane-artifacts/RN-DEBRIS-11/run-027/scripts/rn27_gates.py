#!/usr/bin/env python3
r"""RN-DEBRIS-11 run-027 gates — assert-driven, fail-loud (run AFTER the three commits;
the diff scope law reads vs the base tip)."""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
BASE_TIP = "83dae8feef9b89c2fe3d9684ea93cc558f1beeab"
R27 = ".syllabai/lane-artifacts/RN-DEBRIS-11/run-027"
MAP = "apps/hub/content-maps/cie-igcse-computer-science-23.json"

DECLARED = sorted([
    f"{R27}/apply_manifest_r0.json",
    f"{R27}/gates_r0.json",
    f"{R27}/scripts/rn27_apply.py",
    f"{R27}/scripts/rn27_gates.py",
    f"{R27}/scripts/rn27_review_battery.py",
    ".syllabai/receipts/RN-DEBRIS-11/run-027-item-plane-apply.json",
    ".syllabai/receipts/RN-DEBRIS-11/run-027-postReview.json",
    ".syllabai/receipts/RN-DEBRIS-11/run-026-item-plane-adjudication.json",
    ".syllabai/worklog.md",
    MAP,
    "worklog.md",
])

FAILS = []
def check(name, ok, detail=""):
    if not ok:
        FAILS.append(f"{name}: {detail}")
    print(("PASS " if ok else "FAIL ") + name + (" — " + detail if detail else ""))

def g(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout.strip()

# ---------- G1: the diff vs the base tip == exactly the 11 declared paths ----------
changed = sorted(set(g("diff", "--name-only", BASE_TIP).split()))
check("G1-diff-scope", changed == DECLARED, f"{len(changed)} changed paths == {len(DECLARED)} declared")
allowed_content = {MAP}
bad = [p for p in changed if p.startswith(("apps/", "packages/", "books/", "docs/", "scripts/seed"))
       and p not in allowed_content]
check("G1-content-scope", not bad,
      f"the ONLY content-plane path is the cs-23 content-maps registry (the A1 apply plane); zero other bytes ({bad or 'clean'})")

# ---------- G2: manifest == the committed candidates truth + gates_r0 all ok ----------
A = ROOT / R27
man = json.loads((A / "apply_manifest_r0.json").read_text())
cand = json.loads((ROOT / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026/candidates_r0.json").read_text())
gates = json.loads((A / "gates_r0.json").read_text())
check("G2-gates-r0", all(x["ok"] for x in gates["gates"]), f"gates_r0 {gates['summary']} ALL ok")
truth = {}
for r in cand["classA_unmappedUsers"]:
    truth[r["item"]] = (r["kind"], r["declaredSid"], r["candidateOfficialCode"], r["candidateOfficialId"], r["candidateTitle"])
man_ok = len(man["rows"]) == 14 and all(
    (row["item"], row["kind"], row["declaredSid"], row["officialCode"], row["officialId"], row["candidateTitle"]) == truth[row["item"]]
    for row in man["rows"])
check("G2-manifest-14", man_ok, "the 14 manifest rows byte-equal the committed candidates_r0 classA truth (zero invention)")

# ---------- G2b: the live map re-pin (census == the A1 projection; laws hold) ----------
cm = json.loads((ROOT / MAP).read_text())
FC = json.loads((ROOT / "apps/hub/content/cie-igcse-computer-science-23/flashcards.json").read_text())
live_census = {"multiIdCards": sum(1 for x in FC if len(x.get("specPointIds") or []) > 1),
               "nullCodeCards": sum(1 for x in FC if not x.get("specPointCode")),
               "codedMapItems": sum(1 for v in cm["items"].values() if v.get("codes")),
               "unmappedTrueItems": sum(1 for v in cm["items"].values() if v.get("unmapped") is True)}
check("G2b-census-A1", live_census == {"multiIdCards": 257, "nullCodeCards": 60, "codedMapItems": 876, "unmappedTrueItems": 469},
      json.dumps(live_census) + " == the A1 projection")
S3, SR, S7 = "spcpt_3hpC7gNs8YZ6t7kd", "spcpt_rGVN6hJn6Mb9z2nR", "spcpt_7JRKzsBqqdfPqf5t"
live_pops = {s: sum(1 for v in cm["items"].values() if s in (v.get("declaredUnresolved") or [])) for s in (S3, SR, S7)}
check("G2b-pops-retained", live_pops == {S3: 16, SR: 17, S7: 6}, f"{json.dumps(live_pops)} — declarations retained")
check("G2b-registry-118", len(cm["spcptToOfficial"]) == 118, f"live {len(cm['spcptToOfficial'])}")
check("G2b-registry-sids", cm["spcptToOfficial"][S3]["officialCode"] == "9.1" and
      cm["spcptToOfficial"][SR]["officialCode"] == "9.3", "the run-025 resolutions of record live")
rows14 = {r["item"] for r in man["rows"]}
shape_ok = all(
    cm["items"][r["item"]]["codes"] == [{
        "lineage": "desk_ruling_adjudication_a1", "method": None,
        "officialCode": r["officialCode"], "officialId": r["officialId"], "score": None,
        "spineCode": r["officialCode"], "tier": None, "unit": None, "viaSpcpt": r["declaredSid"]}]
    and "unmapped" not in cm["items"][r["item"]]
    and cm["items"][r["item"]]["declaredUnresolved"] == [r["declaredSid"]]
    for r in man["rows"])
check("G2b-rows14-shape", shape_ok, "all 14 live rows == the desk-ruling ref shape, unmapped key gone, declaration retained")

# ---------- G3: the run-026 receipt merged block == the API truth of record (#1009) ----------
rec26 = json.loads((ROOT / ".syllabai/receipts/RN-DEBRIS-11/run-026-item-plane-adjudication.json").read_text())
m = rec26.get("merged") or {}
check("G3-merged-block-1009", m.get("sha") == "6618610eace74f19493d672f8cacca5ca3778244"
      and m.get("mergedAt") == "2026-11-13T16:24:34Z"
      and m.get("mergeMethod") == "merge (2-parent, no squash)"
      and m.get("shaPinnedTo") == "72ef925ad1dc739e8cd2ecb531ed49fe9e72dc4d"
      and "parents [1aad5065, 72ef925a]" in (m.get("mainTipAfter") or ""),
      json.dumps({k: m.get(k) for k in ("sha", "mergedAt")})[:160])

# ---------- G4: worklog union law ----------
EA = "- RN-DEBRIS-11 run-026 merge record — PR #1009 merged of record"
EB = "- RN-DEBRIS-11 run-027 — the item-plane A1 apply"
for wl in (".syllabai/worklog.md", "worklog.md"):
    cur = (ROOT / wl).read_bytes()
    theirs = subprocess.run(["git", "show", f"{BASE_TIP}:{wl}"], cwd=ROOT, capture_output=True).stdout
    ok_prefix = cur.startswith(theirs)
    suffix = cur[len(theirs):].decode("utf-8")
    lines = suffix.splitlines()
    ok_once = suffix.count(EA) == 1 and suffix.count(EB) == 1
    ok_tail = EB in lines[-1]
    ok_markers = not [l for l in suffix.splitlines(True) if l.startswith(("<<<<<<<", ">>>>>>>", "======="))]
    check(f"G4-{wl}", ok_prefix and ok_once and ok_tail and ok_markers,
          f"prefix={'OK' if ok_prefix else 'LOST'} once={'OK' if ok_once else 'FAIL'} tail={'OK' if ok_tail else 'FAIL'} markers={'zero' if ok_markers else 'FOUND'}")

# ---------- G5: the receipt facts byte-consistent ----------
rec = json.loads((ROOT / ".syllabai/receipts/RN-DEBRIS-11/run-027-item-plane-apply.json").read_text())
check("G5-receipt-baseTip", rec["baseTip"] == BASE_TIP, rec["baseTip"][:8])
check("G5-receipt-order", rec["operatorOrder"].startswith("Proceed") and "1a1d6112c22b2841" in rec["operatorOrder"],
      "the bare 'Proceed' order + trace of record")
check("G5-receipt-priorMerge", "6618610e" in rec["priorMergeRecordRode"] and "72ef925a" in rec["priorMergeRecordRode"],
      "the ride-along names the run-026 merge commit + the filing head")
check("G5-receipt-standing-reminder", "revoked/rotated" in rec.get("standingReminder", ""), "the PAT standing reminder carried")

# ---------- G6: the witness citations live re-pin ----------
CUR = json.loads((ROOT / "apps/hub/content/cie-igcse-computer-science-23/curriculum.json").read_text())
NOTES = json.loads((ROOT / "apps/hub/content/cie-igcse-computer-science-23/notes.json").read_text())
def title_of(code):
    hits = [n.get("title") for n in CUR["nodes"] if n.get("code") == code]
    assert len(hits) == 1
    return hits[0]
T91, T93 = title_of("9.1"), title_of("9.3")
def cite(nid, sid):
    n = next(x for x in NOTES if x.get("noteId") == nid)
    lines = n["bodyMd"].split("\n")
    for i, l in enumerate(lines):
        if f"`{sid}`" in l and "Spec point" in l:
            buf = [l.split('· "', 1)[1] if '· "' in l else ""]
            j = i + 1
            while j < len(lines) and '"' not in "".join(buf) and j < i + 6:
                buf.append(lines[j]); j += 1
            raw_c = "\n".join(buf)
            if '"' in raw_c:
                raw_c = raw_c[:raw_c.index('"')]
            u = raw_c.replace("\n", " ").strip()
            return u.split(" ", 1)[1] if u[:1].isdigit() else u
    return None
check("G6-witness-live", cite("rn_pzFQ4MZnDWbnY6rf", S3) == T91 and cite("rn_KGhttHj9fT889Bm2", SR) == T93,
      "both citations == the curriculum titles (live)")

print(f"\n{len(FAILS)} fails")
if FAILS:
    [print(" -", f) for f in FAILS]
    sys.exit(1)
print("ALL GATES PASS")
