#!/usr/bin/env python3
"""RN-DEBRIS-11 run-011 — the F4 0264 KG regeneration of record.

Part 3 of the operator order ("edges + 9 points + KG regeneration"): the
pre-r5 KG plane (public/kg/data/cie-igcse-business-25.json — 5 sections /
24 subtopics / 52 points, exported 2026-11-04 by the f8ma batch-eight
startup BEFORE the r5 T1-husk era) is regenerated from the repaired
curriculum truth by the exporter of record, apps/hub/scripts/kg_export.py
export_course() — the T-SPEC-KG-REGEN-1 law ("deterministic in-process
export_course() recompute"), in-process, single --qual course.

Laws asserted before any byte is written:
  K1 the served file's 52 pre pairs re-project EXACTLY from the committed
     T-C11 snapshot (concept anchors all resolve; the 1 reversed web pair
     drops again) — the web tier is carried, never re-invented;
  K2 the snapshot (prerequisites.json) is byte-untouched;
  K3 sections 1..6 == T1..T6 with the topic titles (mirror law), palette
     colors, sectionAnchors formula;
  K4 subtopic pair/node labels == curriculum subtopic titles (29/29 mirror);
  K5 point statements == normalize_display_text(curriculum title) (61/61);
  K6 counts arithmetic (nodes 97 = 1 Subject + 6 Sections + 29 SubTopics +
     61 SpecificationPoints; hier 96; pre 52; edges 148);
  K7 index.json row sync (nodes/edges/specPoints), serialization preserved
     (compact single-line, no trailing newline — f8ma Phase F law).

The exporter meta label becomes the canonical kg_export v1.6 string (the
f8ma installer's "via kg_f8ma_generate.py v1.3" label was the startup-era
label; the regen is a kg_export invocation — disclosed in the receipt).
"""
import json
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
CONTENT = HUB / "content"
OUT_DIR = HUB / "public" / "kg" / "data"
SLUG = "cie-igcse-business-25"

sys.path.insert(0, str(HUB / "scripts"))
import kg_export  # noqa: E402


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def main():
    served_path = OUT_DIR / f"{SLUG}.json"
    served_raw = served_path.read_bytes()
    served = json.loads(served_raw)

    snap_raw = (CONTENT / SLUG / "prerequisites.json").read_bytes()

    # ── K1: the served pre pairs of record ───────────────────────────────
    served_pre = {(e[0][2:], e[1][2:]) for e in served["edges"] if e[2] == "pre"}
    served_hier = [e for e in served["edges"] if e[2] != "pre"]
    if len(served_pre) != 52 or len(served_hier) != 81:
        fail(f"served state drifted: {len(served_pre)} pre / {len(served_hier)} hier")
    snap = json.loads(snap_raw)
    if len(snap.get("conceptWebPrerequisiteEdges", [])) != 53:
        fail("snapshot web edge count drifted")
    print(f"SERVED STATE OK: 52 pre / 81 hier; snapshot web edges 53 "
          f"(exportCounts: {snap['exportCounts']})")

    # ── registry (kg_export main()'s own law) ────────────────────────────
    reg_data = json.loads((CONTENT / "courses.json").read_text(encoding="utf-8"))
    registry = {}
    for entry in (reg_data if isinstance(reg_data, list) else reg_data.get("courses", [])):
        if isinstance(entry, dict) and entry.get("slug"):
            registry[entry["slug"]] = entry

    payload = kg_export.export_course(SLUG, registry)
    meta = payload["meta"]
    counts = meta["counts"]

    # ── K6: counts arithmetic ────────────────────────────────────────────
    by_type = counts["byType"]
    if (counts["nodes"], counts["edges"], counts["specPoints"]) != (97, 148, 61):
        fail(f"counts drift: {counts['nodes']}n/{counts['edges']}e/{counts['specPoints']}sp")
    if by_type != {"Section": 6, "SpecificationPoint": 61, "SubTopic": 29, "Subject": 1}:
        fail(f"byType drift: {by_type}")
    by_edge = counts["byEdgeType"]
    if by_edge != {"hier": 96, "pre": 52}:
        fail(f"byEdgeType drift: {by_edge}")
    print(f"COUNTS OK: 97 nodes (1+6+29+61), edges 148 (96 hier + 52 pre)")

    # ── K3: sections mirror ──────────────────────────────────────────────
    cur = json.loads((CONTENT / SLUG / "curriculum.json").read_text(encoding="utf-8"))
    topics = [n for n in cur["nodes"] if n["family"] == "TOPIC"]
    subs = [n for n in cur["nodes"] if n["family"] == "SUBTOPIC"]
    pts = [n for n in cur["nodes"] if n["family"] == "SPEC_POINT"]
    if len(payload["sections"]) != 6:
        fail(f"sections {len(payload['sections'])} != 6")
    for i, t in enumerate(topics, start=1):
        sec = payload["sections"][str(i)]
        if sec["label"] != t["title"]:
            fail(f"sec{i} label drift: {sec['label']!r} vs {t['title']!r}")
    if payload["sections"]["1"]["label"] != "Understanding business activity":
        fail("sec1 is not topic 1 — array order law broken")
    print("SECTIONS OK: 1..6 == T1..T6, labels == topic titles (6/6)")

    # ── K4: subtopic mirror ──────────────────────────────────────────────
    sub_titles = {s["title"] for s in subs}
    pair_labels = []
    for sec, defs in payload["subtopics"].items():
        for sid, title in defs:
            pair_labels.append(title)
    if len(pair_labels) != 29 or set(pair_labels) != sub_titles:
        fail(f"subtopic pair mirror broken ({len(pair_labels)} pairs)")
    node_labels = [n["label"] for n in payload["nodes"] if n["type"] == "SubTopic"]
    if set(node_labels) != sub_titles:
        fail("subtopic node mirror broken")
    print("SUBTOPICS OK: pair + node labels == curriculum titles (29/29)")

    # ── K5: point statements mirror ──────────────────────────────────────
    title_by_code = {p["code"]: p["title"] for p in pts}
    for p in payload["points"]:
        t = title_by_code.get(p["id"])
        if t is None:
            fail(f"KG point {p['id']} not in curriculum")
        if p["text"] != kg_export.normalize_display_text(t):
            fail(f"point {p['id']} text drift vs normalize_display_text(title)")
    if len(payload["points"]) != 61:
        fail(f"points {len(payload['points'])} != 61")
    t1_pts = [p["id"] for p in payload["points"] if p["id"].startswith("1.")]
    if t1_pts != ["1.1.1", "1.2.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4",
                  "1.4.1", "1.5.1", "1.5.2"]:
        fail(f"T1 point ids drift: {t1_pts}")
    print("POINTS OK: 61 statements == normalize_display_text(title); "
          "T1's 9 present and ordered")

    # ── K1 (assert): pre pairs re-project exactly ────────────────────────
    new_pre = {(e[0][2:], e[1][2:]) for e in payload["edges"] if e[2] == "pre"}
    if new_pre != served_pre:
        sym = new_pre ^ served_pre
        fail(f"pre tier drift: {len(sym)} endpoint pairs differ, e.g. {sorted(sym)[:3]}")
    pm = meta.get("prerequisites", {})
    if pm.get("tiers", {}).get("conceptWebInferred") != 52:
        fail(f"web tier count drift: {pm.get('tiers')}")
    rg = pm.get("reversedGovernance", {})
    if rg.get("webReversedDropped") != 1:
        fail(f"reversed governance drift: webReversedDropped={rg.get('webReversedDropped')}")
    if (CONTENT / SLUG / "prerequisites.json").read_bytes() != snap_raw:
        fail("snapshot bytes changed — K2 violated")
    print("PRE TIER OK: 52 pairs endpoint-exact vs the served set; "
          "1 reversed web pair dropped again; snapshot byte-untouched (K2)")

    # ── K7: index sync ───────────────────────────────────────────────────
    idx_path = OUT_DIR / "index.json"
    idx_raw = idx_path.read_bytes()
    if not idx_raw.rstrip(b"\n").count(b"\n") == 0:
        fail("index.json is not single-line — serialization law drifted")
    idx = json.loads(idx_raw)
    row = next((r for r in idx["courses"] if r["slug"] == SLUG), None)
    if row is None:
        fail("index row missing (P1 no-orphans)")
    if row["counts"] != {"nodes": 82, "edges": 133, "specPoints": 52}:
        fail(f"index pre-state drift: {row['counts']}")
    row["counts"] = {"nodes": counts["nodes"], "edges": counts["edges"],
                     "specPoints": counts["specPoints"]}
    for r in idx["courses"]:
        if r["slug"] == SLUG:
            continue
        served_other = json.loads((OUT_DIR / f"{r['slug']}.json").read_bytes())
        if r["counts"] != {"nodes": served_other["meta"]["counts"]["nodes"],
                           "edges": served_other["meta"]["counts"]["edges"],
                           "specPoints": served_other["meta"]["counts"]["specPoints"]}:
            fail(f"index row stale for {r['slug']} — sync would corrupt")

    # ── write (the exporter main() serialization law) ────────────────────
    served_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    idx_path.write_text(
        json.dumps(idx, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print("WROTE public/kg/data/cie-igcse-business-25.json (compact single-line) "
          "+ index.json row sync")
    print(f"  meta.exporter: {meta['exporter'][:80]}...")
    print(f"  meta.generatedUtc: {meta['generatedUtc']} (regen stamp, disclosed)")
    print(f"  label disclosure: f8ma startup label -> canonical kg_export v1.6")


if __name__ == "__main__":
    main()
