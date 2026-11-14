#!/usr/bin/env python3
r"""RN-DEBRIS-11 run-026 gates — assert-driven, fail-loud (run AFTER the two commits; the diff scope law reads vs the base tip)."""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
BASE_TIP = "1aad506565ccbbfb03e2395fcc8851101a18a2be"
RUN025_HEAD = "3588080c46a804a499c18ba0f21037a1e8073bbe"

DECLARED = sorted([
    ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026/state_census_r0.json",
    ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026/candidates_r0.json",
    ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026/adjudication_r0.json",
    ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026/scripts/rn26_census.py",
    ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026/scripts/rn26_gates.py",
    ".syllabai/receipts/RN-DEBRIS-11/run-026-item-plane-adjudication.json",
    ".syllabai/receipts/RN-DEBRIS-11/run-025-postReview.json",
    ".syllabai/worklog.md",
    "worklog.md",
])

FAILS = []
def check(name, ok, detail=""):
    if not ok:
        FAILS.append(f"{name}: {detail}")
    print(("PASS " if ok else "FAIL ") + name + (" — " + detail if detail else ""))

def g(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout.strip()

# ---------- G1: the diff vs the base tip == exactly the 9 declared paths; zero content bytes ----------
changed = sorted(set(g("diff", "--name-only", BASE_TIP).split()))
check("G1-diff-scope", changed == DECLARED, f"{len(changed)} changed paths == {len(DECLARED)} declared")
bad = [p for p in changed if p.startswith(("apps/", "packages/", "books/", "docs/", "golden", "scripts/seed"))]
check("G1-zero-content-bytes", not bad, f"no path under the content/src/docs planes ({bad or 'clean'})")

# ---------- G2: the artifacts parse + the class splits + the live re-pins ----------
A = ROOT / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026"
state = json.loads((A / "state_census_r0.json").read_text())
cand = json.loads((A / "candidates_r0.json").read_text())
adj = json.loads((A / "adjudication_r0.json").read_text())
check("G2-artifacts-parse", True, "state/candidates/adjudication parse OK")
check("G2-census-pins", state["censusOfRecord"] == {"multiIdCards": 257, "nullCodeCards": 60,
      "codedMapItems": 862, "unmappedTrueItems": 483}, json.dumps(state["censusOfRecord"]))
check("G2-sid-pops", state["sidPopulationsOfRecord"]["spcpt_3hpC7gNs8YZ6t7kd"] == 16 and
      state["sidPopulationsOfRecord"]["spcpt_rGVN6hJn6Mb9z2nR"] == 17, "16/17")
check("G2-class-splits", len(state["usersOfRecord33"]) == 33 and len(cand["classA_unmappedUsers"]) == 14 and
      len(cand["classC_codedDeclarers"]["rows"]) == 4 and len(state["cards14OfRecord"]) == 14,
      "33 users / 14 A-rows / 4 C-rows / 14 cards")
check("G2-option-count", sorted(adj["options"].keys()) == ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "D1", "D2", "E1", "E2"],
      f"{len(adj['options'])} options")

# ---------- G3: the postReview merged block == the API truth of record ----------
pr = json.loads((ROOT / ".syllabai/receipts/RN-DEBRIS-11/run-025-postReview.json").read_text())
m = pr.get("merged") or {}
check("G3-merged-block", m.get("sha") == "96ebe429559c2e61d0b5f656e33e96031d619c56" and
      m.get("mergedAt") == "2026-11-13T14:36:34Z" and
      m.get("mergeMethod") == "merge (2-parent, no squash)" and
      m.get("shaPinnedTo") == RUN025_HEAD and
      "parents [a8748f6d, 3588080c]" in (m.get("mainTipAfter") or ""), json.dumps({k: m.get(k) for k in ("sha", "mergedAt")})[:160])

# ---------- G4: worklog union law ----------
EA = "- RN-DEBRIS-11 run-025 merge record — PR #1004 merged of record"
EB = "- RN-DEBRIS-11 run-026 — the declaredUnresolved item-plane adjudication filing"
for wl in (".syllabai/worklog.md", "worklog.md"):
    cur = (ROOT / wl).read_bytes()
    theirs = subprocess.run(["git", "show", f"{BASE_TIP}:{wl}"], cwd=ROOT, capture_output=True).stdout
    ok_prefix = cur.startswith(theirs)
    suffix = cur[len(theirs):].decode("utf-8")
    tail1 = suffix.splitlines()[-3] if len(suffix.splitlines()) >= 3 else ""
    lines = suffix.splitlines()
    ok_once = suffix.count(EA) == 1 and suffix.count(EB) == 1
    ok_tail = EB in lines[-1]
    ok_markers = not [l for l in suffix.splitlines(True) if l.startswith(("<<<<<<<", ">>>>>>>", "======="))]
    check(f"G4-{wl}", ok_prefix and ok_once and ok_tail and ok_markers,
          f"prefix={'OK' if ok_prefix else 'LOST'} once={'OK' if ok_once else 'FAIL'} tail={'OK' if ok_tail else 'FAIL'} markers={'zero' if ok_markers else 'FOUND'}")

# ---------- G5: the receipt facts byte-consistent with the state artifact ----------
rec = json.loads((ROOT / ".syllabai/receipts/RN-DEBRIS-11/run-026-item-plane-adjudication.json").read_text())
check("G5-receipt-baseTip", rec["baseTip"] == BASE_TIP == state["baseTip"], rec["baseTip"][:8])
check("G5-receipt-priorMerge", "96ebe429" in rec["priorMergeRecordRode"] and "3588080c" in rec["priorMergeRecordRode"],
      "the ride-along names the run-025 merge commit + the apply head")
check("G5-receipt-standing-reminder", "revoked/rotated" in rec.get("standingReminder", ""), "the PAT standing reminder carried")

# ---------- G6: the witness citations live re-pin ----------
CM = json.loads((ROOT / "apps/hub/content-maps/cie-igcse-computer-science-23.json").read_text())
NOTES = json.loads((ROOT / "apps/hub/content/cie-igcse-computer-science-23/notes.json").read_text())
CUR = json.loads((ROOT / "apps/hub/content/cie-igcse-computer-science-23/curriculum.json").read_text())
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
            raw = "\n".join(buf)
            if '"' in raw:
                raw = raw[:raw.index('"')]
            u = raw.replace("\n", " ").strip()
            return u.split(" ", 1)[1] if u[:1].isdigit() else u
    return None
check("G6-witness-live", cite("rn_pzFQ4MZnDWbnY6rf", "spcpt_3hpC7gNs8YZ6t7kd") == T91 and
      cite("rn_KGhttHj9fT889Bm2", "spcpt_rGVN6hJn6Mb9z2nR") == T93, "both citations == the curriculum titles (live)")
check("G6-registry-118", len(CM["spcptToOfficial"]) == 118, f"live {len(CM['spcptToOfficial'])}")

print(f"\n{len(FAILS)} fails")
if FAILS:
    [print(" -", f) for f in FAILS]
    sys.exit(1)
print("ALL GATES PASS")
