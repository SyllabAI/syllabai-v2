#!/usr/bin/env python3
"""T-SPECS-TS4-REPAIR-1 — materialize the history-18 topic split into the
served bundle (Stage-3-equivalent, one course, surgical, re-runnable).

The Stage-1 builder override (build_official_spines.py HISTORY18_TOPIC_SPLIT)
re-keys the parse's glued S4.001-042 synthesized-code run into its three
official sections at spine level (codes STABLE). This script materializes the
SAME delta into apps/hub/content/cie-igcse-history-18/ — surgically (per-node
key order and array positions preserved; fleet serialization indent-1 +
newline) — and bumps the manifest's officialSpine provenance.

Gates (fail-closed, ALL applied before any write):
  G1  the rebuilt overridden spine's curriculum deep-equals the patched live
      tree (nodes by code + edge multiset + node array order, semantic)
  G2  counts: 23 TOPIC / 23 SUBTOPIC / 371 SPEC_POINT; point `order` ints
      unchanged and still the global running 1..371 (the split preserves the
      document sequence); the item files (notes/flashcards/questions) are
      never opened for write
  G3  every spec-point code referenced anywhere in notes/flashcards/questions
      resolves to a SPEC_POINT node of the patched tree (codes are the join
      surface — the V7 joined rows move with the re-parent untouched)
  G4  delta vs the pre-state is EXACTLY: +2 TOPIC, +2 SUBTOPIC, 31 point
      re-parents, topic-order re-sequencing (5..21 -> 7..23), +4 structural
      edges, 31 edge source swaps — nothing else
  IDEMPOTENCE: if the live tree already carries TS4L/TS4H, verify it equals
  the spine and exit 0 without writing.

Usage:
    python3 apps/hub/scripts/cie/cie_history18_topic_split.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / "apps" / "hub" / "scripts"))
import build_official_spines as BOS  # noqa: E402

SLUG = "cie-igcse-history-18"
QUAL = "cie-igcse-history-2024-2026"
L_PREFIX = f"{QUAL}-TS4L"
H_PREFIX = f"{QUAL}-TS4H"
LEAGUE_TITLE = "2 To what extent was the League of Nations a success?"
HITLER_TITLE = "3 How far was Hitler\u2019s foreign policy to blame for the outbreak of war in Europe in 1939?"
L_CODES = [f"S4.{i:03d}" for i in range(12, 29)]
H_CODES = [f"S4.{i:03d}" for i in range(29, 43)]
TS4_SUB = f"{QUAL}-TS4:SUB_"


def die(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def sem(o) -> str:
    return json.dumps(o, sort_keys=True, ensure_ascii=False)


def core_sem(tree: dict) -> str:
    """The patched surface ONLY: nodes + edges (array order significant).
    Top-level metadata (board/level/subject/code/syllabusVersion) is INTENTIONALLY
    out of scope — the live bundle carries the fleet's original values and the
    repair must never drag unrelated builder evolution (e.g. the board string)
    into this lane."""
    return sem({"nodes": tree["nodes"], "edges": tree["edges"]})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    # ---- Stage-1 reference: the overridden spine rebuild --------------------
    cache = BOS.DEFAULT_CACHE
    reg = BOS.cie_registry_rows()[SLUG]
    payload = BOS.build_course_cie(SLUG, QUAL, reg, cache)
    spine = payload["curriculum"]
    spine_nodes = {n["code"]: n for n in spine["nodes"]}
    spine_top = [n for n in spine["nodes"] if n["family"] == "TOPIC"]

    cur_path = REPO / "apps" / "hub" / "content" / SLUG / "curriculum.json"
    raw = cur_path.read_bytes()
    live = json.loads(raw)

    live_codes = {n["code"] for n in live["nodes"]}
    if L_PREFIX in live_codes:
        # idempotence path: verify, don't write
        if core_sem(live) == core_sem(spine):
            print("ALREADY APPLIED — live tree deep-equals the overridden spine; no write")
            return 0
        die("live tree already carries TS4L but does NOT deep-equal the spine")

    # ---- G4 pre-state shape assertions --------------------------------------
    topics = [n for n in live["nodes"] if n["family"] == "TOPIC"]
    subs = [n for n in live["nodes"] if n["family"] == "SUBTOPIC"]
    pts = [n for n in live["nodes"] if n["family"] == "SPEC_POINT"]
    if not (len(topics) == 21 and len(subs) == 21 and len(pts) == 371):
        die(f"pre-state counts {len(topics)}/{len(subs)}/{len(pts)} != 21/21/371")
    orders = [p["order"] for p in pts]
    if orders != list(range(1, 372)):
        die("pre-state point orders are not the global running 1..371")
    pt_by_code = {p["code"]: p for p in pts}
    for c in L_CODES + H_CODES:
        if pt_by_code[c]["parents"] != [TS4_SUB]:
            die(f"{c}: unexpected pre-state parents {pt_by_code[c]['parents']}")
    key_order = list(topics[0].keys())

    # ---- surgical patch (order-preserving) ----------------------------------
    nodes = live["nodes"]
    edges = live["edges"]
    new_nodes: list[dict] = []
    new_edges: list[dict] = []

    def mk(code: str, family: str, title: str, parents: list[str], order: int) -> dict:
        d = dict.fromkeys(key_order)
        d.update(code=code, family=family, title=title, description=None,
                 parents=parents, provenanceTier="RULE_DERIVED", order=order)
        return d

    # topic orders: TS4L=5, TS4H=6; topics formerly 5..21 -> 7..23
    t_order = {n["code"]: n["order"] for n in topics}
    for n in nodes:
        if n["family"] == "TOPIC" and n["order"] >= 5:
            n["order"] += 2
    new_nodes.append(mk(L_PREFIX, "TOPIC", LEAGUE_TITLE, [SLUG], 5))
    new_nodes.append(mk(L_PREFIX + ":SUB_", "SUBTOPIC", LEAGUE_TITLE, [L_PREFIX], 1))
    new_nodes.append(mk(H_PREFIX, "TOPIC", HITLER_TITLE, [SLUG], 6))
    new_nodes.append(mk(H_PREFIX + ":SUB_", "SUBTOPIC", HITLER_TITLE, [H_PREFIX], 1))

    # re-parent the 31 points (parents field; node stays in place)
    for c in L_CODES:
        pt_by_code[c]["parents"] = [L_PREFIX + ":SUB_"]
    for c in H_CODES:
        pt_by_code[c]["parents"] = [H_PREFIX + ":SUB_"]

    # node array: insert (TOPIC, SUBTOPIC) pairs right before their first point
    first_l = next(i for i, n in enumerate(nodes) if n["code"] == L_CODES[0])
    first_h = next(i for i, n in enumerate(nodes) if n["code"] == H_CODES[0])
    nodes[first_h:first_h] = [new_nodes[2], new_nodes[3]]
    nodes[first_l:first_l] = [new_nodes[0], new_nodes[1]]

    # edges: 31 source swaps in place; then the WHOLE edge array is reordered
    # to the spine's exact emission sequence (per-topic interleaved; tuples
    # unique) so the written file is byte-form identical to a fresh Stage-1
    # build — the idempotence guarantee
    lset, hset = set(L_CODES), set(H_CODES)
    swapped = 0
    for e in edges:
        if e["relation"] == "PART_OF" and e["source"] == TS4_SUB and e["target"] in lset | hset:
            e["source"] = (L_PREFIX + ":SUB_") if e["target"] in lset else (H_PREFIX + ":SUB_")
            swapped += 1
    if swapped != 31:
        die(f"edge source swaps {swapped} != 31")
    edges.extend([
        {"source": SLUG, "relation": "PART_OF", "target": L_PREFIX,
         "provenanceTier": "RULE_DERIVED"},
        {"source": SLUG, "relation": "PART_OF", "target": H_PREFIX,
         "provenanceTier": "RULE_DERIVED"},
        {"source": L_PREFIX, "relation": "PART_OF", "target": L_PREFIX + ":SUB_",
         "provenanceTier": "RULE_DERIVED"},
        {"source": H_PREFIX, "relation": "PART_OF", "target": H_PREFIX + ":SUB_",
         "provenanceTier": "RULE_DERIVED"},
    ])
    spine_seq = [(e["source"], e["relation"], e["target"]) for e in spine["edges"]]
    by_tuple: dict[tuple, dict] = {}
    for e in edges:
        t = (e["source"], e["relation"], e["target"])
        if t in by_tuple:
            die(f"duplicate edge tuple {t}")
        by_tuple[t] = e
    missing = [t for t in spine_seq if t not in by_tuple]
    if missing:
        die(f"edges missing vs spine: {missing[:4]}")
    edges[:] = [by_tuple[t] for t in spine_seq]

    # ---- G1: semantic deep-equal vs the spine (nodes + edges, the patched
    # surface; top-level metadata intentionally preserved as live) ----------
    if core_sem(live) != core_sem(spine):
        die("patched tree (nodes+edges) does not deep-equal the overridden spine")
    live_sem = {n["code"]: sem(n) for n in nodes}
    spine_sem = {n["code"]: sem(n) for n in spine["nodes"]}
    if set(live_sem) != set(spine_sem):
        die(f"node code sets differ: +{sorted(set(live_sem) - set(spine_sem))} "
            f"-{sorted(set(spine_sem) - set(live_sem))}")
    bad = [c for c in live_sem if live_sem[c] != spine_sem[c]]
    if bad:
        die(f"node semantic mismatches vs spine: {bad[:5]}")
    if [(n["code"]) for n in nodes] != [n["code"] for n in spine["nodes"]]:
        die("node array order differs from the spine")
    le = sorted((e["source"], e["relation"], e["target"]) for e in edges)
    se = sorted((e["source"], e["relation"], e["target"]) for e in spine["edges"])
    if le != se:
        only_l = [x for x in le if x not in se][:4]
        only_s = [x for x in se if x not in le][:4]
        die(f"edge multiset differs; live-only {only_l}; spine-only {only_s}")
    if len(edges) != len(spine["edges"]):
        die(f"edge count {len(edges)} != {len(spine['edges'])}")

    # ---- G2: counts + order invariants --------------------------------------
    ntopics = sum(1 for n in nodes if n["family"] == "TOPIC")
    nsubs = sum(1 for n in nodes if n["family"] == "SUBTOPIC")
    npts = sum(1 for n in nodes if n["family"] == "SPEC_POINT")
    if not (ntopics == 23 and nsubs == 23 and npts == 371):
        die(f"post counts {ntopics}/{nsubs}/{npts} != 23/23/371")
    post_orders = [n["order"] for n in nodes if n["family"] == "SPEC_POINT"]
    if post_orders != list(range(1, 372)):
        die("post-state point orders changed (they must not)")
    spine_top_orders = [n["order"] for n in spine_top]
    if [n["order"] for n in nodes if n["family"] == "TOPIC"] != spine_top_orders:
        die("topic order sequence differs from the spine")

    # ---- G3: linkage resolution (the join surface moves untouched) ----------
    tree_codes = {n["code"] for n in nodes if n["family"] == "SPEC_POINT"}
    base = REPO / "apps" / "hub" / "content" / SLUG
    for fname in ("notes.json", "flashcards.json", "questions.json"):
        text = (base / fname).read_text(encoding="utf-8")
        refs = set(re.findall(r'"(S\d+\.\d+[a-z]?)"', text))
        stray = sorted(r for r in refs if r not in tree_codes)
        if stray:
            die(f"{fname}: {len(stray)} spec codes do not resolve post-split: {stray[:6]}")

    if args.dry_run:
        print("DRY-RUN GREEN — all gates pass; no write")
        return 0

    # ---- write: fleet serialization (indent-1 + newline) --------------------
    cur_path.write_bytes((json.dumps(live, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))

    man_path = base / "manifest.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    man["counts"]["sections"] = 23
    man["counts"]["topics"] = 23
    man["officialSpine"]["repairRun"] = {
        "run": "T-SPECS-TS4-REPAIR-1-r0",
        "date": "2026-10-22",
        "operatorOrder": "audit menu items 4-5 + lattice residuals (trace 1a160319b5fe144d)",
        "builderOverride": "apps/hub/scripts/build_official_spines.py HISTORY18_TOPIC_SPLIT "
                           "(topic_split_map; official codes STABLE)",
        "delta": {"topicsAdded": [L_PREFIX, H_PREFIX], "pointsReparented": 31,
                  "codesChanged": 0, "pointOrdersChanged": 0},
        "countsAfter": {"sections": 23, "topics": 23, "specPoints": 371},
    }
    man_path.write_bytes((json.dumps(man, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))

    print("T-SPECS-TS4-REPAIR-1 MATERIALIZED: curriculum.json + manifest.json written")
    print(f"  TS4 Civil War keeps S4.001-011; {L_PREFIX.rsplit('-', 1)[-1]} (League) "
          f"S4.012-028; {H_PREFIX.rsplit('-', 1)[-1]} (Hitler FP) S4.029-042")
    print("  counts 21/21/371 -> 23/23/371; point orders + codes byte-stable; "
          "G1-G4 all green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
