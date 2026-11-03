#!/usr/bin/env python3
"""
kg_f8al_project.py — F8 concept-web prerequisite projection + export (v1.0).

The pipeline of record for the F8 pre-edge rollout (operator build order
trace 1a19fe92af38a41d: coverage -> F8 rollout -> misconceptions -> paths;
lane startup receipts T-KG-PRE-1 / T-KG-PRE-2). Fail-closed end to end:
every law is asserted BEFORE any byte is written, and the export law is
calibrated against both landed pilots (4CH1 312/312, 9701 1014/1014 exact).

Subcommands:

  verify-export --course <slug>
      Re-derive the served pre set from content/<slug>/prerequisites.json
      plus the served spine, and assert it equals the served set exactly.
      The calibration law: the exporter below must reproduce every already
      landed F8 course byte-for-byte before it may touch a new one.

  project --from <src-slug> --to <dst-slug>
      Project the source course's AI_SUGGESTED concept web onto the target
      spine: keep concepts whose anchors resolve on the TARGET point set
      (fail-closed — 0 unmapped is the pass law), keep web edges whose both
      endpoints survive, then export pre pairs by the calibrated rule
      (anchor cross-product, no self-loops, IN-ORDER pairs only — a pair
      whose prerequisite sits after its dependent in the spine's points[]
      order is dropped outright, counted, never demoted).
      Writes: content/<to>/prerequisites.json (NEW) + the served spine's
      pre edges, meta.prerequisites disclosure, meta.counts, meta.exporter,
      meta.generatedUtc + the index.json edges sync (P5). Nothing else in
      the spine is touched — hier stays byte-identical, tree law intact.

Honesty invariants enforced here (mirroring the landed receipts):
  - prereqValidated stays EMPTY — nothing claims operator validation;
  - every shipped pair is AI_SUGGESTED / UNVALIDATED / INFERRED PROTOTYPE
    (the renderer's label, driven by meta.prerequisites);
  - bases come only from the operator-validated store vocabulary
    (DEFINITIONAL_DEPENDENCY / USED_WITHOUT_RETEACHING).
"""

import argparse
import collections
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
HUB = REPO / "apps" / "hub"
DATA = HUB / "public" / "kg" / "data"
CONTENT = HUB / "content"

BASIS_VOCAB = {"DEFINITIONAL_DEPENDENCY", "USED_WITHOUT_RETEACHING"}


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def load_json(p: Path):
    try:
        return json.loads(p.read_text())
    except FileNotFoundError:
        fail(f"missing file: {p}")
    except json.JSONDecodeError as e:
        fail(f"bad json in {p}: {e}")


def spine_path(slug: str) -> Path:
    return DATA / f"{slug}.json"


def prereq_path(slug: str) -> Path:
    return CONTENT / slug / "prerequisites.json"


def load_spine(slug: str):
    d = load_json(spine_path(slug))
    if "nodes" not in d or "edges" not in d or "points" not in d:
        fail(f"{slug}: not a GRAPH_CONTRACT spine (nodes/edges/points missing)")
    ids = {p.get("id") for p in d["points"]}
    if None in ids or len(ids) != len(d["points"]):
        fail(f"{slug}: points[] has missing/duplicate ids")
    # curriculum-prefixed anchors ("4CH1-3.14C") resolve to bare point ids
    # ("3.14C") — the same normalization lib/learner-state.ts applies to
    # every code the bridge serves (codePrefix law).
    prefix = None
    code = d.get("meta", {}).get("code")
    if isinstance(code, str) and code:
        prefix = f"{code}-"
    return d, ids, prefix


def resolve_anchor(bind: str, ids: set, prefix: str | None) -> str | None:
    if bind in ids:
        return bind
    if prefix and bind.startswith(prefix) and bind[len(prefix):] in ids:
        return bind[len(prefix):]
    return None


def export_pairs(web_edges, anchors, order: dict) -> tuple[set, dict]:
    """The calibrated export law. Returns (in-order pre pairs, stats)."""
    cand = set()
    self_loops = 0
    for e in web_edges:
        src_a = anchors.get(e["prerequisite"], [])
        dst_a = anchors.get(e["dependent"], [])
        for a in src_a:
            for b in dst_a:
                if a == b:
                    self_loops += 1
                    continue
                cand.add((a, b))
    in_order = {(a, b) for (a, b) in cand if order[a] < order[b]}
    stats = {
        "candidates": len(cand) + self_loops,
        "selfLoops": self_loops,
        "reversedDropped": len(cand) - len(in_order),
        "exported": len(in_order),
    }
    return in_order, stats


def verify_export(slug: str) -> None:
    spine, point_ids, prefix = load_spine(slug)
    pre = load_json(prereq_path(slug))
    if "conceptWebPrerequisiteEdges" not in pre:
        # T-KG-PRE-1 (4CH1) is the pre-web legacy generation (v1.5 exporter,
        # practicalEndpointRetarget): its 145 served pre edges stay untouched
        # and its exporter is NOT the pipeline of record — calibration is
        # defined for the v1.6 web tier only (0620 + 9701 prove it exact).
        print(f"SKIP {slug}: legacy prerequisites schema (no concept web) — "
              "calibration is a v1.6 web-tier law")
        return
    anchors_raw = pre["conceptAnchors"]
    # input laws first (prefix-aware resolution)
    anchors: dict[str, list[str]] = {}
    for con, binds in anchors_raw.items():
        resolved = []
        for b in binds:
            r = resolve_anchor(b, point_ids, prefix)
            if r is None:
                fail(f"{slug}: concept {con} has an unresolvable anchor {b!r}")
            resolved.append(r)
        anchors[con] = resolved
    seen_pairs = set()
    for e in pre["conceptWebPrerequisiteEdges"]:
        if e["basis"] not in BASIS_VOCAB:
            fail(f"{slug}: web edge basis {e['basis']!r} outside the store vocabulary")
        key = (e["prerequisite"], e["dependent"])
        if key[0] == key[1] or key in seen_pairs:
            fail(f"{slug}: self/duplicate web pair {key}")
        if (key[1], key[0]) in seen_pairs:
            fail(f"{slug}: mutual web pair {key}")
        if key[0] not in anchors or key[1] not in anchors:
            fail(f"{slug}: web edge {key} references an unanchored concept")
        seen_pairs.add(key)
    order = {p["id"]: i for i, p in enumerate(spine["points"])}
    derived, stats = export_pairs(pre["conceptWebPrerequisiteEdges"], anchors, order)
    served = {(e[0][2:], e[1][2:]) for e in spine["edges"] if e[2] == "pre"}
    if derived != served:
        fail(
            f"{slug}: calibration FAILED — derived {len(derived)} vs served "
            f"{len(served)} (sym diff {len(derived ^ served)})"
        )
    print(
        f"OK {slug}: calibration exact — web {len(pre['conceptWebPrerequisiteEdges'])} "
        f"-> pre {stats['exported']} (reversed dropped {stats['reversedDropped']}, "
        f"self-loops {stats['selfLoops']})"
    )


def project(src_slug: str, dst_slug: str) -> None:
    src_spine, src_ids, src_prefix = load_spine(src_slug)
    dst_spine, dst_ids, dst_prefix = load_spine(dst_slug)
    src_pre = load_json(prereq_path(src_slug))
    anchors_raw: dict[str, list[str]] = src_pre["conceptAnchors"]
    web_all: list[dict] = src_pre["conceptWebPrerequisiteEdges"]

    if dst_spine["meta"].get("code") != src_spine["meta"].get("code"):
        fail(
            f"curriculum mismatch: src code {src_spine['meta'].get('code')} vs "
            f"dst code {dst_spine['meta'].get('code')} — projection is only "
            "defined inside one curriculum"
        )
    if spine_path(dst_slug).name == spine_path(src_slug).name:
        fail("source and target are the same course")
    if any(e[2] == "pre" for e in dst_spine["edges"]):
        fail(f"{dst_slug}: already carries pre edges — projection is startup-only")

    # Phase A — source input laws (prefix-aware, same as verify-export)
    anchors_all: dict[str, list[str]] = {}
    for con, binds in anchors_raw.items():
        resolved = []
        for b in binds:
            r = resolve_anchor(b, src_ids, src_prefix)
            if r is None:
                fail(f"source {src_slug}: concept {con} has an unresolvable anchor {b!r}")
            resolved.append(r)
        anchors_all[con] = resolved
    seen_pairs = set()
    for e in web_all:
        if e["basis"] not in BASIS_VOCAB:
            fail(f"source web basis {e['basis']!r} outside the store vocabulary")
        key = (e["prerequisite"], e["dependent"])
        if key[0] == key[1] or key in seen_pairs or (key[1], key[0]) in seen_pairs:
            fail(f"source web self/dup/mutual pair {key}")
        if key[0] not in anchors_all or key[1] not in anchors_all:
            fail(f"source web edge {key} references an unanchored concept")
        seen_pairs.add(key)

    # Phase B — anchor re-verification on the TARGET spine (0 unmapped law)
    kept_anchors: dict[str, list[str]] = {}
    dropped_concepts = 0
    dropped_bindings = 0
    for con, binds in anchors_all.items():
        surviving = [b for b in binds if b in dst_ids]
        unmapped = len(binds) - len(surviving)
        dropped_bindings += unmapped
        if surviving:
            kept_anchors[con] = surviving
        else:
            dropped_concepts += 1

    # Phase C — web-level projection: both endpoints must survive; the web
    # was already mutual-free, and filtering cannot create mutuality (a
    # filter keeps a subset of pairs), but assert it anyway — fail-closed.
    kept_edges = []
    dropped_edges = 0
    seen_kept = set()
    for e in web_all:
        key = (e["prerequisite"], e["dependent"])
        if key[0] in kept_anchors and key[1] in kept_anchors:
            if key in seen_kept or (key[1], key[0]) in seen_kept:
                fail(f"filtering produced a dup/mutual web pair {key} — aborting")
            seen_kept.add(key)
            kept_edges.append(e)
        else:
            dropped_edges += 1
    if not kept_edges:
        fail(f"{dst_slug}: projection kept zero web edges — nothing to land")

    # Phase D — calibrated export on the TARGET order
    dst_order = {p["id"]: i for i, p in enumerate(dst_spine["points"])}
    pairs, stats = export_pairs(kept_edges, kept_anchors, dst_order)
    if not pairs:
        fail(f"{dst_slug}: projection exported zero pre pairs — nothing to land")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    src_meta = src_spine["meta"]

    # Phase E1 — the target prerequisites snapshot (schema of record)
    snap = {
        "source": (
            f"AI concept-web projection run (F8 rollout; T-KG-PRE-3). The web is "
            f"the AI_SUGGESTED, UNVALIDATED concept lattice first shipped for "
            f"{src_slug} (T-KG-PRE-2), projected onto the {dst_slug} spine with "
            f"every anchor re-verified against the target point set (0 unmapped "
            f"pass law) and both-endpoint edge survival. Bases mirror the "
            f"operator-validated store vocabulary. prereqValidated stays EMPTY — "
            f"the renderer labels every shipped pair INFERRED PROTOTYPE; the "
            f"named gate before any of this is treated as truth remains the SME "
            f"validation pass."
        ),
        "generatedUtc": now,
        "curriculumCode": src_meta.get("curriculumCode") or src_meta.get("code"),
        "hubCourseSlug": dst_slug,
        "projectedFrom": {
            "hubCourseSlug": src_slug,
            "prerequisitesGeneratedUtc": src_pre.get("generatedUtc"),
        },
        "conceptAnchors": {k: kept_anchors[k] for k in sorted(kept_anchors)},
        "conceptWebPrerequisiteEdges": kept_edges,
        "validatedPrerequisiteEdges": [],
        "inferredPrototypePre": [],
        "inferredPrototypeRel": [],
        "counts": {
            "anchoredConcepts": len(kept_anchors),
            "conceptWebEdges": len(kept_edges),
            "validatedEdges": 0,
            "inferredPre": 0,
            "inferredRel": 0,
        },
        "projectionCounts": {
            "sourceConcepts": len(anchors_all),
            "sourceWebEdges": len(web_all),
            "conceptsDropped": dropped_concepts,
            "anchorBindingsDropped": dropped_bindings,
            "webEdgesDropped": dropped_edges,
            "exportCandidates": stats["candidates"],
            "selfLoops": stats["selfLoops"],
            "reversedDropped": stats["reversedDropped"],
            "preExported": stats["exported"],
        },
    }

    # Phase E2 — the served spine: hier VERBATIM, pre appended in a
    # deterministic order (spine point order, then dst order)
    hier = [e for e in dst_spine["edges"] if e[2] != "pre"]
    dst_index = {p["id"]: i for i, p in enumerate(dst_spine["points"])}
    pre_edges = [
        [f"p:{a}", f"p:{b}", "pre"]
        for (a, b) in sorted(pairs, key=lambda ab: (dst_index[ab[0]], dst_index[ab[1]]))
    ]
    new_edges = hier + pre_edges
    new_spine = json.loads(json.dumps(dst_spine))  # deep copy, structure preserved
    new_spine["edges"] = new_edges
    m = new_spine["meta"]
    m["prerequisites"] = {
        "source": (
            f"AI concept-web projection (F8 rollout T-KG-PRE-3): the {src_slug} "
            f"web (T-KG-PRE-2) projected onto this spine, anchors re-verified, "
            f"in-order pairs only; AI_SUGGESTED — unvalidated, labelled INFERRED "
            f"PROTOTYPE by the renderer, never in prereqValidated."
        ),
        "projectedFrom": src_slug,
        "webEdges": len(kept_edges),
        "preEdges": len(pre_edges),
    }
    m["exporter"] = (
        "scripts/kg_export.py v1.6 web tier via scripts/kg_f8al_project.py v1.0 "
        f"projection from {src_slug} (anchor re-verification + reversed-pair governance)"
    )
    m["generatedUtc"] = now
    et = collections.Counter(e[2] for e in new_edges)
    m["counts"] = {
        **m["counts"],
        "edges": len(new_edges),
        "byEdgeType": {"hier": et.get("hier", 0), "pre": et.get("pre", 0)},
    }

    # Phase E3 — index sync (P5 law). The served serialization is preserved
    # byte-format-for-byte (compact single-line vs indented): a registry
    # sync must stay a 4-line-class diff, never a whole-file reformat.
    index_raw = (DATA / "index.json").read_text()
    index = json.loads(index_raw)
    index_compact = not index_raw.rstrip().startswith("\n") and "\n" not in index_raw.rstrip("\n")
    row = next((r for r in index.get("courses", []) if r.get("slug") == dst_slug), None)
    if row is None:
        fail(f"{dst_slug}: not registered in index.json (P1 no-orphans)")
    if row["counts"]["edges"] != len(dst_spine["edges"]):
        fail(
            f"{dst_slug}: index edges {row['counts']['edges']} != served "
            f"{len(dst_spine['edges'])} — index is stale before the run"
        )
    row["counts"]["edges"] = len(new_edges)

    # Final asserts before any write (tree law + endpoint law)
    if et.get("hier", 0) != len(dst_spine["nodes"]) - 1:
        fail("tree law violated: hier != nodes-1")
    node_ids = {n["id"] for n in new_spine["nodes"]}
    for e in pre_edges:
        if e[0] not in node_ids or e[1] not in node_ids:
            fail(f"pre endpoint missing from spine: {e}")

    # Served-spine serialization preserved byte-format-for-byte (compact
    # single-line vs indented): the export is a pre-edge append + meta edit,
    # never a whole-file reformat.
    spine_raw = spine_path(dst_slug).read_text()
    spine_compact = "\n" not in spine_raw.rstrip("\n")
    pre_out = prereq_path(dst_slug)
    pre_out.parent.mkdir(parents=True, exist_ok=True)
    pre_out.write_text(json.dumps(snap, indent=2, ensure_ascii=False) + "\n")
    if spine_compact:
        spine_path(dst_slug).write_text(
            json.dumps(new_spine, separators=(",", ":"), ensure_ascii=False)
        )
    else:
        spine_path(dst_slug).write_text(
            json.dumps(new_spine, indent=2, ensure_ascii=False) + "\n"
        )
    if index_compact:
        (DATA / "index.json").write_text(
            json.dumps(index, separators=(",", ":"), ensure_ascii=False)
        )
    else:
        (DATA / "index.json").write_text(
            json.dumps(index, indent=2, ensure_ascii=False) + "\n"
        )
    print(
        f"OK project {src_slug} -> {dst_slug}: concepts {len(kept_anchors)}/"
        f"{len(anchors_all)} kept, web {len(kept_edges)}/{len(web_all)} kept, "
        f"pre exported {stats['exported']} (reversed dropped "
        f"{stats['reversedDropped']}, self-loops {stats['selfLoops']}), "
        f"index synced {row['counts']['edges'] - stats['exported']} -> "
        f"{row['counts']['edges']}"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("verify-export")
    v.add_argument("--course", required=True)
    p = sub.add_parser("project")
    p.add_argument("--from", dest="src", required=True)
    p.add_argument("--to", dest="dst", required=True)
    args = ap.parse_args()
    if args.cmd == "verify-export":
        verify_export(args.course)
    elif args.cmd == "project":
        project(args.src, args.dst)


if __name__ == "__main__":
    main()
