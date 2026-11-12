#!/usr/bin/env python3
"""RN-DEBRIS-11 run-020 receipt + worklog tail-appends (both ledgers)."""
import json, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
REC = REPO / ".syllabai/receipts/RN-DEBRIS-11"

def die(m): sys.exit(f"GATE-FAIL: {m}")

receipt = {
 "receipt": "rn11-run-020-structural-adds",
 "family": "RN-DEBRIS-11",
 "run": "020",
 "lane": "RN-DEBRIS-11",
 "operatorOrder": "run-020",
 "operatorTrace": "1a1ce80c01c93d3d",
 "generatedUtc": "2026-11-12",
 "mode": "mechanical apply of the run-019 filing's step-2 census-growth adds (D2 + D6-adds)",
 "base": "cf756fd2 (origin/main at cut; fetched first)",
 "scopeOfRecord": {
  "D2_cs23_81_adds": "cie-igcse-computer-science-23 +5 official SPEC_POINT rows under SUB8.1 (8.1.5, 8.1.6a, 8.1.6c titles byte-exact from the run-017 census subRows; 8.1.6b too) at the official sequence position after 8.1.4, orders 83-87; 6 subsequent order bumps +5; manifest specPoints 88->93; KG regen 125n/218e (array; meta = exporter output 125/215/93 per the 700bb601 nodes/meta law); index 120n/213e/88sp -> 125n/218e/93sp (P5 array truth)",
  "D6_pure1_adds": "cie-{a-level,as}-maths-20-pure-1 +3 official SPEC_POINT rows under SUB1.3 (1.3.3/1.3.4/1.3.5 from the run-018 adjudication PROPOSAL pins; 1.3.3 composed per the fleet glyph law — inline '2'->² x3, disclosed) AFTER the parse-vintage 1.3.2a blob — position forced by kg_export's ID-numeric ordering law (1.3.2a sorts before 1.3.3); orders 15-17; 19 order bumps +3 each; manifest 33->36 x2; KG regen 46n/91e x2 (exporter-complete, hier 45==nodes-1); index 43n/88e/33sp -> 46n/91e/36sp x2",
  "notTouched": "D1 exporter law, D3 8.1.1a re-code, D4 T7 re-parent, D5 6.3.x debris, 1.3.1a/1.3.2a disposition — still-open desk choices per the run-019 filing; byte-untouched"
 },
 "surfacesPerCourse": "content curriculum + hub spine (identical surgery, per-code plane parity asserted) + manifest counts + KG regen (kg_export.export_course) + index.json — the run-016/017/018 dump-law family",
 "preExistingReconciliations": [
  "cs-23 KG points[].text for the 11 run-017-repaired rows carried glued pre-repair vintage on main (the #931 landing's text mirror never survived; ec328cdc restored the 3 spanning-tree edges but not the mirror texts) — the regen restores the T-SPEC-KG-REGEN-1 mirror law (points[].text == content titles, 125/125)",
  "the cs-23 KG file's meta.counts stays at the exporter output (125/215/93) while the array carries the 3 hand-maintained [subject,sec7/9/10,hier] spanning-tree edges (218e) — the 700bb601 nodes/meta byte-identical law, re-applied on top of the adds"
 ],
 "ugmServePlane": "both pure-1 UGM bundles byte-UNTOUCHED: the 1.1-shaped a-level plane's primaryPick law forbids honest-gap index rows and the AS bijection law pins the AS index to the A-level's — the 3 new uncovered codes stay off the serve index until a T-UGM lane serves them (0606/ial-pure-4 in-index gap-row shape available to the 1.2 planes only; filed as the T-UGM follow-up note); ugm.bundle.test.ts re-pinned: AS curriculum census 33->36 with the 30-index law disclosed",
 "smeLayerNote": "the W6 SME layer (28 rows/course) is byte-untouched; the KG regen ran on the SME-filtered official tree per the seeder's T-SME-SEL-W2 skip law (the exporter predates the SME class — an unfiltered export inflates the graph to 74n); report-only: the SME rows' orders 34-39 now interleave the official point-order space 1..36 — re-spacing is T-SME-SEL territory if its law requires trailing the official max",
 "gates": "see gates_r0.json (G0-G8 + GV1 battery + bun suites, exits unmasked)",
 "boundaries": "content/spine/manifest/KG/index planes of exactly 3 courses + 1 test census re-pin; zero questions/flashcards/notes/prerequisites/concept-graph/learner-sim/UGM-resource bytes; no task card (desk owns the remaining D1/D3/D4/D5 rulings)"
}
p = REC / "run-020-structural-adds.json"
p.write_text(json.dumps(receipt, indent=1, ensure_ascii=False) + "\n")

ENTRY = """## receipt(RN-DEBRIS-11) run-020 — the structural adds apply (D2 + D6-adds of the run-019 filing) (2026-11-12) — operator order "run-020" (trace 1a1ce80c01c93d3d)
- SCOPE OF RECORD: the run-019 filing's step-2 census-growth adds, executed mechanically — D2: cs-23 +5 official rows under SUB8.1 (8.1.5/8.1.6a/8.1.6b/8.1.6c/8.1.7, titles byte-exact from the run-017 census; orders 83-87 after 8.1.4; 6 bumps +5; manifest 88->93); D6-adds: cie-{a-level,as}-maths-20-pure-1 +3 official rows under SUB1.3 (1.3.3/1.3.4/1.3.5 from the run-018 PROPOSAL pins; 1.3.3 composed per the fleet glyph law '2'->² x3, disclosed; orders 15-17 AFTER the parse-vintage 1.3.2a — position forced by kg_export's ID-numeric ordering law; 19 bumps +3; manifest 33->36 x2). Surfaces per course: content curriculum + hub spine (per-code plane parity asserted) + manifest + KG regen + index.json (P5 array truth). NOT touched (still-open desk choices): D1/D3/D4/D5 + the 1.3.1a/1.3.2a disposition — byte-untouched.
- PRE-EXISTING RECONCILIATIONS of record: (a) the cs-23 KG's points[].text for the 11 run-017 rows carried glued pre-repair vintage on main (the #931 text mirror never survived; ec328cdc restored the 3 spanning-tree edges but not the texts) — the regen restores the T-SPEC-KG-REGEN-1 mirror law 125/125; (b) the cs-23 KG keeps meta = exporter output (125/215/93) with the array at 218e incl. the 3 hand-maintained [subject,sec7/9/10,hier] edges — the 700bb601 nodes/meta law re-applied over the adds; (c) the KG regen ran on the SME-filtered official tree per the seeder's T-SME-SEL-W2 skip law (an unfiltered export inflates to 74n — the exporter predates the SME class); the W6 SME layer is byte-untouched (report-only: SME orders 34-39 interleave the official 1..36 space — T-SME-SEL territory).
- UGM SERVE PLANE: both pure-1 bundles byte-UNTOUCHED — the 1.1-shaped a-level plane's primaryPick law forbids honest-gap index rows and the AS bijection pins the AS index to the A-level's; the 3 new uncovered codes stay off the serve index until a T-UGM lane serves them (0606/ial-pure-4 gap-row shape = 1.2-planes only; filed as the T-UGM follow-up note). ugm.bundle.test.ts re-pinned: AS curriculum census 33->36 with the 30-index law disclosed. Zero serve-plane bytes changed.
- GATES ALL GREEN (exits UNMASKED): G1 serializer round-trips (dump law) x4 files/course; G2 content surgery (node/edge adjacency + dense order law); G3 spine mirror parity; G4 manifest single-site bumps; G5 KG regen (counts pre+delta EXACT, hier==nodes-1, deep-equal ex-generatedUtc, new titles carried, CTRL sweep); G6 UGM byte-identical; G7 byte-scope (delta == exactly the declared adds + order fields, both planes, per-node dump diff); G8 index P5 truth; GV1: verify_corpus_23a / verify_flashcard_sync_courses / validate_cie_bundles (pure-1 bank 67 intact) / validate_gradeb / verify_subject_identity 106/106 / validate_spines (statement_diff 0) ALL PASS; bun: kg-corpus 111/0, ugm.bundle 100/0, bundle-seed 64/0, sme bundle-questions 25/0, ugm.render 2 pass + 1 PRE-EXISTING fail (T-UGM-RENDER-1 IGCSE katex — the W6-disclosed standing red of its own lane, not this run's); hub tsc --noEmit exit 0.
- Receipt: .syllabai/receipts/RN-DEBRIS-11/run-020-structural-adds.json; artifacts .syllabai/lane-artifacts/RN-DEBRIS-11/run-020/ (apply manifest incl. per-file sha256 pre/post, gates, scripts). Branch lane/rn-debris-11-run-020-structural-adds from origin/main cf756fd2. Author does not self-merge — PR for the R0 desk; no force-push; fetch-first race-guard at push.

"""

for wl in (".syllabai/worklog.md", "worklog.md"):
    f = REPO / wl
    before = f.read_bytes()
    if b"## receipt(RN-DEBRIS-11) run-020" in before: die(f"{wl}: run-020 section already present")
    if not before.endswith(b"\n"): die(f"{wl}: no trailing newline")
    f.write_bytes(before + ENTRY.encode())
    after = f.read_bytes()
    assert after[: len(before)] == before and len(after) - len(before) == len(ENTRY.encode())
    assert after.count(b"<<<<<<<") == before.count(b"<<<<<<<")
    print(f"worklog append OK: {wl} (+{len(ENTRY.encode())}B)")

changed = sorted(set(__import__("subprocess").run(["git", "-C", str(REPO), "diff", "--name-only"], capture_output=True, text=True).stdout.splitlines()) | set(__import__("subprocess").run(["git", "-C", str(REPO), "ls-files", "--others", "--exclude-standard"], capture_output=True, text=True).stdout.splitlines()))
json.loads(p.read_text())
print(f"receipt JSON parse-valid; changed paths: {len(changed)}")
for c in changed: print(" ", c)
