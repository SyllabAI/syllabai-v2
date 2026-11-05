#!/usr/bin/env python3
"""
kg_f8ma_generate.py — F8 rollout fresh-web startup tool (batch four
T-KG-PRE-6 / batch five T-KG-PRE-7).

For a course whose served spine is a pure tree (0 pre edges), installs the
F8 lane's AI_SUGGESTED concept web (authored in f8ma_lattice_*.py) and
exports the pre edges by the CALIBRATED law of record — the exact export
rule of scripts/kg_f8al_project.py v1.0 (anchor cross-product, no self-loops,
in-order pairs only, reversed dropped outright and counted), imported from
that module rather than re-implemented so the law cannot drift.

Fail-closed end to end: every input law (0-unmapped anchors, basis
vocabulary, web pair hygiene, snapshot counts, tree law, endpoint law,
index sync) is asserted BEFORE any byte is written.

Honesty invariants (mirroring T-KG-PRE-2 through T-KG-PRE-5):
  - prereqValidated stays EMPTY — nothing claims operator validation;
  - every shipped pair is AI_SUGGESTED / UNVALIDATED / INFERRED PROTOTYPE;
  - bases come only from the operator-validated store vocabulary.
"""

import argparse
import collections
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1] if Path(__file__).resolve().parent.name == "scripts" and (Path(__file__).resolve().parents[1] / "apps" / "hub").exists() else Path("/home/z/my-project/work/syllabai-v2")
SCRIPTS = REPO / "scripts"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import kg_f8al_project as P  # noqa: E402  (repo's pipeline of record — law source)

BASIS_VOCAB = P.BASIS_VOCAB


def _dt_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def install_web(
    slug: str,
    concepts: dict,
    edges: list,
    lane_tag: str,
    batch: str = "four",
    task: str = "T-KG-PRE-6",
    exporter_ver: str = "v1.0",
) -> None:
    spine, point_ids, prefix = P.load_spine(slug)
    if any(e[2] == "pre" for e in spine["edges"]):
        fail(f"{slug}: already carries pre edges — startup-only")
    if (P.CONTENT / slug / "prerequisites.json").exists():
        fail(f"{slug}: prerequisites.json already exists — startup-only")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Phase A — anchor resolution on the SERVED point set (0-unmapped law)
    anchors: dict[str, list[str]] = {}
    for con, binds in concepts.items():
        resolved = []
        for b in binds:
            r = P.resolve_anchor(b, point_ids, prefix)
            if r is None:
                fail(f"{slug}: concept {con} has an unresolvable anchor {b!r}")
            resolved.append(r)
        anchors[con] = resolved

    # Phase B — web input laws
    seen_pairs = set()
    for e in edges:
        if e[2] not in BASIS_VOCAB:
            fail(f"{slug}: web basis {e[2]!r} outside the store vocabulary")
        key = (e[0], e[1])
        if key[0] == key[1] or key in seen_pairs or (key[1], key[0]) in seen_pairs:
            fail(f"{slug}: self/dup/mutual web pair {key}")
        if key[0] not in anchors or key[1] not in anchors:
            fail(f"{slug}: web edge {key} references an unanchored/unknown concept")
        seen_pairs.add(key)

    # Phase C — calibrated export (the law of record, imported)
    order = {p["id"]: i for i, p in enumerate(spine["points"])}
    web_edges = [
        {"prerequisite": pr, "dependent": dp, "basis": basis}
        for pr, dp, basis in edges
    ]
    pairs, stats = P.export_pairs(web_edges, anchors, order)
    if not pairs:
        fail(f"{slug}: export produced zero pre pairs — nothing to land")

    # Phase D — snapshot (schema of record, T-KG-PRE-2 shape)
    snap = {
        "source": (
            f"AI concept-web startup run (F8 rollout batch {batch}; {task}, "
            f"lane {lane_tag}). The web is the AI_SUGGESTED, UNVALIDATED "
            f"concept lattice authored by the F8 lane for this syllabus, "
            f"every anchor machine-verified against the served spine's point "
            f"ids (0 unmapped pass law) and exported in-order only by the "
            f"calibrated law of scripts/kg_f8al_project.py. Bases mirror the "
            f"operator-validated store vocabulary. prereqValidated stays "
            f"EMPTY — the renderer labels every shipped pair INFERRED "
            f"PROTOTYPE; the named gate before any of this is treated as "
            f"truth remains the SME validation pass."
        ),
        "generatedUtc": now,
        "curriculumCode": spine["meta"].get("curriculumCode")
        or spine["meta"].get("code"),
        "hubCourseSlug": slug,
        "conceptAnchors": anchors,
        "validatedPrerequisiteEdges": [],
        "inferredPrototypePre": [],
        "inferredPrototypeRel": [],
        "conceptWebPrerequisiteEdges": web_edges,
        "counts": {
            "anchoredConcepts": len(anchors),
            "conceptWebEdges": len(web_edges),
            "validatedEdges": 0,
            "inferredPre": 0,
            "inferredRel": 0,
        },
        "exportCounts": {
            "candidates": stats["candidates"],
            "selfLoops": stats["selfLoops"],
            "reversedDropped": stats["reversedDropped"],
            "preExported": stats["exported"],
        },
    }

    # Phase E — served spine: hier VERBATIM, pre appended in deterministic
    # order (spine point order, then dst order); meta disclosure + counts.
    hier = [e for e in spine["edges"] if e[2] != "pre"]
    pt_index = {p["id"]: i for i, p in enumerate(spine["points"])}
    pre_edges = [
        [f"p:{a}", f"p:{b}", "pre"]
        for (a, b) in sorted(pairs, key=lambda ab: (pt_index[ab[0]], pt_index[ab[1]]))
    ]
    new_edges = hier + pre_edges
    import json as _json

    new_spine = _json.loads(_json.dumps(spine))  # deep copy, structure preserved
    new_spine["edges"] = new_edges
    m = new_spine["meta"]
    m["prerequisites"] = {
        "source": (
            f"AI concept web (F8 rollout batch {batch}, {task}, lane "
            f"{lane_tag}): AI_SUGGESTED — unvalidated, labelled INFERRED "
            f"PROTOTYPE by the renderer, never in prereqValidated."
        ),
        "webEdges": len(web_edges),
        "preEdges": len(pre_edges),
    }
    m["exporter"] = (
        "scripts/kg_export.py v1.6 web tier via scripts/kg_f8ma_generate.py "
        f"{exporter_ver} (fresh {lane_tag} web, anchor verification + reversed-pair "
        "governance; law imported from scripts/kg_f8al_project.py)"
    )
    m["generatedUtc"] = now
    et = collections.Counter(e[2] for e in new_edges)
    m["counts"] = {
        **m["counts"],
        "edges": len(new_edges),
        "byEdgeType": {"hier": et.get("hier", 0), "pre": et.get("pre", 0)},
    }

    # Phase F — index sync (P5 law), single entry; served serialization
    # preserved byte-format-for-byte (compact single-line vs indented)
    index_raw = (P.DATA / "index.json").read_text()
    index = _json.loads(index_raw)
    index_compact = "\n" not in index_raw.rstrip("\n")
    row = next((r for r in index.get("courses", []) if r.get("slug") == slug), None)
    if row is None:
        fail(f"{slug}: not registered in index.json (P1 no-orphans)")
    if row["counts"]["edges"] != len(spine["edges"]):
        fail(
            f"{slug}: index edges {row['counts']['edges']} != served "
            f"{len(spine['edges'])} — index is stale before the run"
        )
    row["counts"]["edges"] = len(new_edges)

    # Final asserts BEFORE any write (tree law + endpoint law)
    if et.get("hier", 0) != len(spine["nodes"]) - 1:
        fail(f"{slug}: tree law violated: hier != nodes-1")
    node_ids = {n["id"] for n in new_spine["nodes"]}
    for e in pre_edges:
        if e[0] not in node_ids or e[1] not in node_ids:
            fail(f"{slug}: pre endpoint missing from spine: {e}")

    # Served-spine serialization preserved byte-format-for-byte (compact
    # single-line vs indented): the startup is a pre-edge append + meta edit,
    # never a whole-file reformat.
    spine_raw = P.spine_path(slug).read_text()
    spine_compact = "\n" not in spine_raw.rstrip("\n")
    pre_out = P.prereq_path(slug)
    pre_out.parent.mkdir(parents=True, exist_ok=True)
    pre_out.write_text(_json.dumps(snap, indent=2, ensure_ascii=False) + "\n")
    if spine_compact:
        P.spine_path(slug).write_text(
            _json.dumps(new_spine, separators=(",", ":"), ensure_ascii=False)
        )
    else:
        P.spine_path(slug).write_text(
            _json.dumps(new_spine, indent=2, ensure_ascii=False) + "\n"
        )
    if index_compact:
        (P.DATA / "index.json").write_text(
            _json.dumps(index, separators=(",", ":"), ensure_ascii=False)
        )
    else:
        (P.DATA / "index.json").write_text(
            _json.dumps(index, indent=2, ensure_ascii=False) + "\n"
        )
    print(
        f"OK startup {slug} ({lane_tag}): concepts {len(anchors)}, "
        f"web {len(web_edges)}, pre exported {stats['exported']} "
        f"(reversed dropped {stats['reversedDropped']}, self-loops "
        f"{stats['selfLoops']}), index synced {row['counts']['edges'] - stats['exported']}"
        f" -> {row['counts']['edges']}, hier {et.get('hier', 0)} byte-verbatim"
    )


def install_web_merge(
    slug: str,
    concepts: dict,
    edges: list,
    lane_tag: str,
    batch: str = "eighteen",
    task: str = "T-KG-PRE-20",
    exporter_ver: str = "v2.3",
) -> None:
    """T-KG-PRE-20 special case: MERGE-WITH, never overwrite.

    For the one course whose spine already carries the operator-validated
    T-C11 store (igcse-chemistry-19: 112 VALIDATED concept edges projected
    to 145 served pre, plus 30 inferred-prototype pre tuples and 5 rel
    tuples). The legacy prerequisites.json's ten keys ride along
    byte-intact; the legacy served pre edges ride along byte-verbatim in
    the spine; this fresh F8 web layer contributes only NEW in-order pairs.
    Fail-closed laws before any byte is written:
      M0 the legacy file is the pre-web generation (no concept web keys);
      M1 the legacy layer re-derives the served pre set EXACTLY through the
         documented derivation (validated concept edges AND direct-point
         endpoint edges through concept anchors by the calibrated in-order
         law, plus the inferredPrototypePre direct tuples) — if the store
         is not fully derivable the merge aborts;
      M2 F8 concept ids never collide with legacy concept ids;
      M3 web hygiene (basis vocabulary, no self/dup/mutual, 0-unmapped
         anchors) exactly as install_web;
      M4 the export never REVERSES a served pair and every already-served
         pair is counted (alreadyServed), never re-landed.
    """
    import json as _json

    spine, point_ids, prefix = P.load_spine(slug)
    pre_path = P.prereq_path(slug)
    if not pre_path.exists():
        fail(f"{slug}: merge-with requires the legacy prerequisites.json")
    leg = P.load_json(pre_path)
    # M0 — legacy generation shape
    if "conceptWebPrerequisiteEdges" in leg:
        fail(f"{slug}: legacy file already carries a concept web — merge-with refused")
    served_pairs = {(e[0][2:], e[1][2:]) for e in spine["edges"] if e[2] == "pre"}
    rel_pairs = {(e[0][2:], e[1][2:]) for e in spine["edges"] if e[2] == "rel"}

    # M1 — legacy layer must re-derive the served set exactly
    legacy_anchors: dict[str, list[str]] = {}
    for con, binds in leg["conceptAnchors"].items():
        resolved = []
        for b in binds:
            r = P.resolve_anchor(b, point_ids, prefix)
            if r is None:
                fail(f"{slug}: legacy concept {con} has an unresolvable anchor {b!r}")
            resolved.append(r)
        legacy_anchors[con] = resolved

    def legacy_endpoint(x: str) -> list[str]:
        if x in legacy_anchors:
            return legacy_anchors[x]
        r = P.resolve_anchor(x, point_ids, prefix)
        if r is None:
            fail(f"{slug}: legacy edge endpoint {x!r} does not resolve")
        return [r]

    cand = set()
    for e in leg["validatedPrerequisiteEdges"]:
        for a in legacy_endpoint(e["prerequisite"]):
            for b in legacy_endpoint(e["dependent"]):
                if a != b:
                    cand.add((a, b))
    order = {p["id"]: i for i, p in enumerate(spine["points"])}
    legacy_derived = {(a, b) for a, b in cand if order[a] < order[b]} | {
        (x[0][2:], x[1][2:]) for x in leg["inferredPrototypePre"]
    }
    if legacy_derived != served_pairs:
        fail(
            f"{slug}: legacy layer re-derivation {len(legacy_derived)} != served "
            f"{len(served_pairs)} (sym {len(legacy_derived ^ served_pairs)}) — "
            "store not fully derivable, merge aborted"
        )

    # M2 — concept-id namespace separation
    collide = sorted(set(concepts) & set(legacy_anchors))
    if collide:
        fail(f"{slug}: F8 concept ids collide with legacy ids: {collide[:5]}")

    # M3 — anchor resolution + web hygiene (same laws as install_web)
    anchors: dict[str, list[str]] = {}
    for con, binds in concepts.items():
        resolved = []
        for b in binds:
            r = P.resolve_anchor(b, point_ids, prefix)
            if r is None:
                fail(f"{slug}: concept {con} has an unresolvable anchor {b!r}")
            resolved.append(r)
        anchors[con] = resolved
    seen_pairs = set()
    for e in edges:
        if e[2] not in BASIS_VOCAB:
            fail(f"{slug}: web basis {e[2]!r} outside the store vocabulary")
        key = (e[0], e[1])
        if key[0] == key[1] or key in seen_pairs or (key[1], key[0]) in seen_pairs:
            fail(f"{slug}: self/dup/mutual web pair {key}")
        if key[0] not in anchors or key[1] not in anchors:
            fail(f"{slug}: web edge {key} references an unanchored/unknown concept")
        seen_pairs.add(key)

    # calibrated export (the law of record, imported)
    web_edges = [
        {"prerequisite": pr, "dependent": dp, "basis": basis}
        for pr, dp, basis in edges
    ]
    pairs, stats = P.export_pairs(web_edges, anchors, order)

    # M4 — merge laws
    already_served = pairs & served_pairs
    rev_conflicts = {(b, a) for a, b in pairs} & served_pairs
    if rev_conflicts:
        fail(
            f"{slug}: F8 export reverses {len(rev_conflicts)} served pair(s), "
            f"e.g. {sorted(rev_conflicts)[:3]} — merge refused"
        )
    rel_conflicts = {(b, a) for a, b in pairs} & rel_pairs
    if rel_conflicts:
        fail(
            f"{slug}: F8 export reverses {len(rel_conflicts)} served rel pair(s) "
            f"{sorted(rel_conflicts)[:3]} — merge refused"
        )
    new_pairs = pairs - served_pairs
    if not new_pairs:
        fail(f"{slug}: merge produced zero new pre pairs — nothing to land")

    now = _dt_now()
    merged_anchors = {**legacy_anchors, **anchors}
    snap = {
        "source": (
            f"Two-layer merged prerequisite store (F8 rollout batch {batch}; "
            f"{task}, lane {lane_tag}). Layer 1 — the operator-validated T-C11 "
            f"settled store, byte-intact exactly as previously served "
            f"(validatedPrerequisiteEdges with provenance verbatim, "
            f"inferredPrototypePre/Rel, practicalEndpointRetarget), "
            f"re-derivation-verified at merge time against the {len(served_pairs)} "
            f"legacy served pre edges. Layer 2 — the AI concept web startup "
            f"(F8 rollout batch {batch}; {task}, lane {lane_tag}): the "
            f"AI_SUGGESTED, UNVALIDATED concept lattice authored by the F8 lane "
            f"for this syllabus, every anchor machine-verified against the "
            f"served spine's point ids (0 unmapped pass law) and exported "
            f"in-order only by the calibrated law of scripts/kg_f8al_project.py, "
            f"merged WITH — never over — layer 1 (the export is disjoint from "
            f"the legacy served set up to counted alreadyServed collisions and "
            f"never reverses a served pair). Bases mirror the operator-validated "
            f"store vocabulary. The F8 layer's pairs are AI_SUGGESTED — "
            f"unvalidated, labelled INFERRED PROTOTYPE by the renderer — while "
            f"layer 1's validated edges keep their operator provenance; the "
            f"named gate before any of this is treated as truth remains the SME "
            f"validation pass."
        ),
        "generatedUtc": now,
        "curriculumCode": leg.get("curriculumCode")
        or spine["meta"].get("curriculumCode")
        or spine["meta"].get("code"),
        "hubCourseSlug": slug,
        "conceptAnchors": {k: merged_anchors[k] for k in sorted(merged_anchors)},
        "validatedPrerequisiteEdges": leg["validatedPrerequisiteEdges"],
        "inferredPrototypePre": leg["inferredPrototypePre"],
        "inferredPrototypeRel": leg["inferredPrototypeRel"],
        "practicalEndpointRetarget": leg["practicalEndpointRetarget"],
        "conceptWebPrerequisiteEdges": web_edges,
        "mergeOf": {
            "legacyLayer": {
                "generatedUtc": leg.get("generatedUtc"),
                "source": leg.get("source"),
                "validatedEdges": len(leg["validatedPrerequisiteEdges"]),
                "inferredPre": len(leg["inferredPrototypePre"]),
                "inferredRel": len(leg["inferredPrototypeRel"]),
                "servedPreReDerived": len(legacy_derived),
                "reDerivationExact": True,
            },
            "f8Layer": {
                "lane": lane_tag,
                "concepts": len(anchors),
                "webEdges": len(web_edges),
                "law": "scripts/kg_f8al_project.py v1.0 export_pairs",
            },
        },
        "counts": {
            "anchoredConcepts": len(merged_anchors),
            "conceptWebEdges": len(web_edges),
            "validatedEdges": len(leg["validatedPrerequisiteEdges"]),
            "inferredPre": len(leg["inferredPrototypePre"]),
            "inferredRel": len(leg["inferredPrototypeRel"]),
        },
        "exportCounts": {
            "candidates": stats["candidates"],
            "selfLoops": stats["selfLoops"],
            "reversedDropped": stats["reversedDropped"],
            "preExported": stats["exported"],
            "alreadyServed": len(already_served),
            "newAppended": len(new_pairs),
        },
    }

    # served spine: existing edges byte-verbatim (including the legacy
    # interleaved hier/pre/rel layout), new pre appended at the END
    new_edges = list(spine["edges"]) + [
        [f"p:{a}", f"p:{b}", "pre"]
        for (a, b) in sorted(new_pairs, key=lambda ab: (order[ab[0]], order[ab[1]]))
    ]
    new_spine = _json.loads(_json.dumps(spine))  # deep copy, structure preserved
    new_spine["edges"] = new_edges
    m = new_spine["meta"]
    m["prerequisites"] = {
        "source": (
            f"Two-layer store: operator-validated T-C11 settled core "
            f"({len(served_pairs)} pre edges, provenance in "
            f"content/{slug}/prerequisites.json validatedPrerequisiteEdges, "
            f"unchanged at this merge) + F8 AI concept-web augmentation "
            f"(batch {batch}, {task}, lane {lane_tag}; {len(new_pairs)} new pre "
            f"edges): AI_SUGGESTED — unvalidated, labelled INFERRED PROTOTYPE "
            f"by the renderer, never in prereqValidated; the validated core "
            f"keeps its operator provenance."
        ),
        "webEdges": len(web_edges),
        "preEdges": len([e for e in new_edges if e[2] == "pre"]),
        "legacyPreEdges": len(served_pairs),
    }
    m["exporter"] = (
        "scripts/kg_export.py v1.6 web tier via scripts/kg_f8ma_generate.py "
        f"{exporter_ver} (merge-with {lane_tag} F8 layer over the legacy T-C11 "
        "store; legacy re-derivation verified exact; law imported from "
        "scripts/kg_f8al_project.py)"
    )
    m["generatedUtc"] = now
    et = collections.Counter(e[2] for e in new_edges)
    m["counts"] = {
        **m["counts"],
        "edges": len(new_edges),
        "byEdgeType": {"hier": et.get("hier", 0), "pre": et.get("pre", 0)},
    }

    # index sync (P5 law), single entry; serialization preserved
    index_raw = (P.DATA / "index.json").read_text()
    index = _json.loads(index_raw)
    index_compact = "\n" not in index_raw.rstrip("\n")
    row = next((r for r in index.get("courses", []) if r.get("slug") == slug), None)
    if row is None:
        fail(f"{slug}: not registered in index.json (P1 no-orphans)")
    if row["counts"]["edges"] != len(spine["edges"]):
        fail(
            f"{slug}: index edges {row['counts']['edges']} != served "
            f"{len(spine['edges'])} — index is stale before the run"
        )
    row["counts"]["edges"] = len(new_edges)

    # final asserts BEFORE any write (tree law + endpoint law + append-only)
    if et.get("hier", 0) != len(spine["nodes"]) - 1:
        fail(f"{slug}: tree law violated: hier != nodes-1")
    if new_edges[: len(spine["edges"])] != spine["edges"]:
        fail(f"{slug}: existing edges were disturbed — append-only violated")
    node_ids = {n["id"] for n in new_spine["nodes"]}
    for e in new_edges[len(spine["edges"]):]:
        if e[0] not in node_ids or e[1] not in node_ids:
            fail(f"{slug}: pre endpoint missing from spine: {e}")
    new_pre_only = [e for e in new_edges if e[2] == "pre"]
    seen_all = set()
    for a, b, _t in new_pre_only:
        k = (a, b)
        if k in seen_all or (b, a) in seen_all:
            fail(f"{slug}: post-merge dup/mutual pre pair {k}")
        seen_all.add(k)

    spine_raw = P.spine_path(slug).read_text()
    spine_compact = "\n" not in spine_raw.rstrip("\n")
    pre_out = P.prereq_path(slug)
    pre_out.parent.mkdir(parents=True, exist_ok=True)
    pre_out.write_text(_json.dumps(snap, indent=2, ensure_ascii=False) + "\n")
    if spine_compact:
        P.spine_path(slug).write_text(
            _json.dumps(new_spine, separators=(",", ":"), ensure_ascii=False)
        )
    else:
        P.spine_path(slug).write_text(
            _json.dumps(new_spine, indent=2, ensure_ascii=False) + "\n"
        )
    if index_compact:
        (P.DATA / "index.json").write_text(
            _json.dumps(index, separators=(",", ":"), ensure_ascii=False)
        )
    else:
        (P.DATA / "index.json").write_text(
            _json.dumps(index, indent=2, ensure_ascii=False) + "\n"
        )
    print(
        f"OK merge-with {slug} ({lane_tag}): legacy {len(served_pairs)} pre "
        f"byte-verbatim, F8 concepts {len(anchors)}, web {len(web_edges)}, "
        f"pre exported {stats['exported']} (alreadyServed {len(already_served)}, "
        f"new appended {len(new_pairs)}, reversed dropped "
        f"{stats['reversedDropped']}, self-loops {stats['selfLoops']}), "
        f"index synced {row['counts']['edges'] - len(new_pairs)} -> "
        f"{row['counts']['edges']}, existing edges byte-verbatim"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--course", required=True)
    args = ap.parse_args()
    if args.course in ("cie-a-level-maths-20-pure-1", "cie-as-maths-20-pure-1"):
        from f8ma_lattice_9709p1 import CONCEPTS, EDGES

        install_web(args.course, CONCEPTS, EDGES, "9709P1")
    elif args.course == "cie-igcse-maths-25-extended":
        from f8ma_lattice_0580e import CONCEPTS, EDGES

        install_web(args.course, CONCEPTS, EDGES, "0580E")
    elif args.course == "cie-igcse-maths-25-core":
        from f8ma_lattice_0580c import CONCEPTS, EDGES

        install_web(args.course, CONCEPTS, EDGES, "0580C")
    elif args.course in ("cie-as-maths-20-pure-2", "cie-a-level-maths-20-pure-2"):
        from f8ma_lattice_9709p2 import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "9709P2",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    elif args.course == "cie-a-level-maths-20-pure-3":
        from f8ma_lattice_9709p3 import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "9709P3",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    elif args.course in ("cie-as-maths-20-mechanics", "cie-a-level-maths-20-mechanics"):
        from f8ma_lattice_9709m import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "9709M",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    elif args.course in (
        "cie-as-maths-20-probability-and-statistics-1",
        "cie-a-level-maths-20-probability-and-statistics-1",
    ):
        from f8ma_lattice_9709s1 import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "9709S1",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    elif args.course == "cie-a-level-maths-20-probability-and-statistics-2":
        from f8ma_lattice_9709s2 import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "9709S2",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    elif args.course == "cie-igcse-further-maths-additional-maths-25":
        from f8ma_lattice_0606 import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "0606",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    elif args.course == "cie-igcse-maths-international-maths-23-core":
        from f8ma_lattice_0607c import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "0607C",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    elif args.course == "cie-igcse-maths-international-maths-23-extended":
        from f8ma_lattice_0607e import CONCEPTS, EDGES

        install_web(
            args.course, CONCEPTS, EDGES, "0607E",
            batch="five", task="T-KG-PRE-7", exporter_ver="v1.1",
        )
    else:
        # T-KG-PRE-20 (batch eighteen, the Edexcel science tranche 15):
        # the chemistry family — ial-chemistry-17 (YCH11 fresh web),
        # both 4XCH1 modular units (renumbered derivatives of the 4CH1
        # master lattice, derivation disclosed in the unit modules'
        # docstrings), and the igcse-chemistry-19 legacy-T-C11 special
        # case (MERGE-WITH, never overwrite — install_web_merge).
        chemistry = {
            "ial-chemistry-17": ("f8ch_lattice_ych11", "YCH11", "startup"),
            "igcse-chemistry-modular-24-unit-1": ("f8ch_lattice_4xch1u1", "4XCH1U1", "startup"),
            "igcse-chemistry-modular-24-unit-2": ("f8ch_lattice_4xch1u2", "4XCH1U2", "startup"),
            "igcse-chemistry-19": ("f8ch_lattice_4ch1", "4CH1-F8", "merge"),
        }
        if args.course in chemistry:
            mod, tag, mode = chemistry[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            if mode == "merge":
                install_web_merge(
                    args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                    batch="eighteen", task="T-KG-PRE-20", exporter_ver="v2.3",
                )
            else:
                install_web(
                    args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                    batch="eighteen", task="T-KG-PRE-20", exporter_ver="v2.3",
                )
            return
        # T-KG-PRE-19 (batch seventeen, the Edexcel science tranche 14):
        # the physics family — 4PH1 linear, both 4XPH1 modular units
        # (renumbered derivatives of the 4PH1 master lattice, derivation
        # disclosed in the unit modules' docstrings) and the YPH11 IAL
        # register.
        physics = {
            "igcse-physics-19": ("f8ph_lattice_4ph1", "4PH1"),
            "igcse-physics-modular-24-unit-1": ("f8ph_lattice_4xph1u1", "4XPH1U1"),
            "igcse-physics-modular-24-unit-2": ("f8ph_lattice_4xph1u2", "4XPH1U2"),
            "ial-physics-19": ("f8ph_lattice_wph11", "YPH11"),
        }
        if args.course in physics:
            mod, tag = physics[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="seventeen", task="T-KG-PRE-19", exporter_ver="v2.2",
            )
            return
        # T-KG-PRE-18 (batch sixteen, the religious-studies family
        # tranche 13): CIE 0490 IGCSE.
        religious_studies = {
            "cie-igcse-religious-studies-23": ("f8rs_lattice_0490", "0490"),
        }
        if args.course in religious_studies:
            mod, tag = religious_studies[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="sixteen", task="T-KG-PRE-18", exporter_ver="v2.1",
            )
            return
        # T-KG-PRE-17 (batch fifteen, the history family tranche 12):
        # CIE 0470 IGCSE, Edexcel 4HI1 IGCSE.
        history = {
            "cie-igcse-history-18": ("f8hi_lattice_0470", "0470"),
            "igcse-history-17": ("f8hi_lattice_4hi1", "4HI1"),
        }
        if args.course in history:
            mod, tag = history[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="fifteen", task="T-KG-PRE-17", exporter_ver="v2.0",
            )
            return
        # T-KG-PRE-16 (batch fourteen, the ICT family tranche 11):
        # CIE 0417 IGCSE, Edexcel 4IT1 IGCSE.
        ict = {
            "cie-igcse-ict-21": ("f8it_lattice_0417", "0417"),
            "igcse-ict-17": ("f8it_lattice_4it1", "4IT1"),
        }
        if args.course in ict:
            mod, tag = ict[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="fourteen", task="T-KG-PRE-16", exporter_ver="v1.9",
            )
            return
        # T-KG-PRE-15 (batch thirteen, the environmental-management family
        # tranche 10): CIE 8291 AS, CIE 0680 IGCSE (2025 series).
        environmental_management = {
            "cie-as-environmental-management-20": ("f8em_lattice_8291", "8291"),
            "cie-igcse-environmental-management-25": ("f8em_lattice_0680", "0680x25"),
        }
        if args.course in environmental_management:
            mod, tag = environmental_management[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="thirteen", task="T-KG-PRE-15", exporter_ver="v1.8",
            )
            return
        # T-KG-PRE-14 (batch twelve, the computer-science family tranche 9):
        # CIE 9618 A Level, CIE 9618 AS (sibling lattice on the identical
        # id+text 1-12 subset — NOT a shared two-course module, the point
        # sets differ), CIE 0478 IGCSE.
        computer_science = {
            "cie-a-level-computer-science-19": ("f8cs_lattice_9618al", "9618AL"),
            "cie-as-computer-science-19": ("f8cs_lattice_9618as", "9618AS"),
            "cie-igcse-computer-science-23": ("f8cs_lattice_0478x23", "0478x23"),
        }
        if args.course in computer_science:
            mod, tag = computer_science[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="twelve", task="T-KG-PRE-14", exporter_ver="v1.7",
            )
            return
        # T-KG-PRE-13 (batch eleven, the geography family tranche 8): CIE
        # 0460 both examination spines (one lattice, two identical served
        # spines — the 9709P1 two-course pattern), CIE 9696 A Level,
        # Edexcel 4GE1.
        geography = {
            "cie-igcse-geography-20": ("f8ge_lattice_0460", "0460"),
            "cie-igcse-geography-25": ("f8ge_lattice_0460", "0460"),
            "cie-a-level-geography-21": ("f8ge_lattice_9696", "9696"),
            "igcse-geography-19": ("f8ge_lattice_4ge1", "4GE1"),
        }
        if args.course in geography:
            mod, tag = geography[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="eleven", task="T-KG-PRE-13", exporter_ver="v1.6",
            )
            return
        # T-KG-PRE-12 (batch ten, the English cluster tranche 7): CIE 8021
        # AS GP, CIE 0500 both examination spines, CIE 0475, Edexcel 4EA1
        # all three papers, Edexcel 4ET1.
        english = {
            "cie-as-english-general-paper-21": ("f8en_lattice_8021gp", "8021GP"),
            "cie-igcse-english-language-20": ("f8en_lattice_0500x20", "0500x20"),
            "cie-igcse-english-language-25": ("f8en_lattice_0500x25", "0500x25"),
            "cie-igcse-english-literature-21": ("f8en_lattice_0475", "0475"),
            "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing": (
                "f8en_lattice_4ea1p1", "4EA1P1",
            ),
            "igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing": (
                "f8en_lattice_4ea1p2", "4EA1P2",
            ),
            "igcse-english-language-a-16-paper-3-coursework": (
                "f8en_lattice_4ea1p3", "4EA1P3",
            ),
            "igcse-english-literature-16": ("f8en_lattice_4et1", "4ET1"),
        }
        if args.course in english:
            mod, tag = english[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="ten", task="T-KG-PRE-12", exporter_ver="v1.5",
            )
            return
        # T-KG-PRE-11 (batch nine, the economics family tranche 6): CIE 9708
        # A Level, CIE 0455 both examination spines (2020 + 2025), Edexcel 4EC1.
        economics = {
            "cie-a-level-economics-23": ("f8ec_lattice_9708al", "9708AL"),
            "cie-igcse-economics-20": ("f8ec_lattice_0455x20", "0455x20"),
            "cie-igcse-economics-25": ("f8ec_lattice_0455x25", "0455x25"),
            "igcse-economics-17": ("f8ec_lattice_4ec1", "4EC1"),
        }
        if args.course in economics:
            mod, tag = economics[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="nine", task="T-KG-PRE-11", exporter_ver="v1.4",
            )
            return
        # T-KG-PRE-9 (batch seven, the accounting family tranche 4): CIE 9706
        # AS/A Level, CIE 0452 both examination spines, Edexcel 4AC1 papers.
        accounting = {
            "cie-as-accounting-21": ("f8ac_lattice_9706as", "9706AS"),
            "cie-a-level-accounting-21": ("f8ac_lattice_9706al", "9706AL"),
            "cie-igcse-accounting-21": ("f8ac_lattice_0452x21", "0452x21"),
            "cie-igcse-accounting-25": ("f8ac_lattice_0452x25", "0452x25"),
            "igcse-accounting-17-financial-statements": (
                "f8ac_lattice_4ac1p1", "4AC1P1",
            ),
            "igcse-accounting-17-introduction-to-bookkeeping-and-accounting": (
                "f8ac_lattice_4ac1p2", "4AC1P2",
            ),
        }
        if args.course in accounting:
            mod, tag = accounting[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="seven", task="T-KG-PRE-9", exporter_ver="v1.3",
            )
            return
        # T-KG-PRE-10 (batch eight, the business family tranche 5): CIE 9609
        # AS/A Level, CIE 0450/2023 + 0264/2025, Edexcel 4BS1.
        business = {
            "cie-as-business-23": ("f8bu_lattice_9609as", "9609AS"),
            "cie-a-level-business-23": ("f8bu_lattice_9609al", "9609AL"),
            "cie-igcse-business-23": ("f8bu_lattice_0450x23", "0450x23"),
            "cie-igcse-business-25": ("f8bu_lattice_0264x25", "0264x25"),
            "igcse-business-19": ("f8bu_lattice_4bs1", "4BS1"),
        }
        if args.course in business:
            mod, tag = business[args.course]
            from importlib import import_module

            lattice = import_module(mod)
            install_web(
                args.course, lattice.CONCEPTS, lattice.EDGES, tag,
                batch="eight", task="T-KG-PRE-10", exporter_ver="v1.3",
            )
            return
        # T-KG-PRE-8 (batch six, the maths family tranche 3) — the Edexcel
        # maths corpus: IAL units (YMA01/YFM01) and IGCSE (4MA1/4XMA1/4MB1/4PM1).
        edexcel = {
            "ial-maths-20-pure-1": ("f8ma_lattice_ialp1", "IALP1"),
            "ial-maths-20-pure-2": ("f8ma_lattice_ialp2", "IALP2"),
            "ial-maths-20-pure-3": ("f8ma_lattice_ialp3", "IALP3"),
            "ial-maths-20-pure-4": ("f8ma_lattice_ialp4", "IALP4"),
            "ial-maths-20-mechanics-1": ("f8ma_lattice_ialm1", "IALM1"),
            "ial-maths-20-mechanics-2": ("f8ma_lattice_ialm2", "IALM2"),
            "ial-maths-20-statistics-1": ("f8ma_lattice_ials1", "IALS1"),
            "ial-maths-20-statistics-2": ("f8ma_lattice_ials2", "IALS2"),
            "ial-maths-20-decision-1": ("f8ma_lattice_iald1", "IALD1"),
            "ial-further-maths-18-further-pure-1": (
                "f8ma_lattice_ialfp1", "IALFP1",
            ),
            "igcse-maths-a-18-foundation": ("f8ma_lattice_4ma1f", "4MA1F"),
            "igcse-maths-a-18-higher": ("f8ma_lattice_4ma1h", "4MA1H"),
            "igcse-maths-a-modular-24-foundation-unit-1": (
                "f8ma_lattice_4xmfu1", "4XMA1F-U1",
            ),
            "igcse-maths-a-modular-24-foundation-unit-2": (
                "f8ma_lattice_4xmfu2", "4XMA1F-U2",
            ),
            "igcse-maths-a-modular-24-higher-unit-1": (
                "f8ma_lattice_4xmhu1", "4XMA1H-U1",
            ),
            "igcse-maths-a-modular-24-higher-unit-2": (
                "f8ma_lattice_4xmhu2", "4XMA1H-U2",
            ),
            "igcse-maths-b-16": ("f8ma_lattice_4mb1", "4MB1"),
            "igcse-further-maths-19": ("f8ma_lattice_4pm1", "4PM1"),
        }
        if args.course not in edexcel:
            fail(f"no lattice registered for {args.course}")
        mod, tag = edexcel[args.course]
        from importlib import import_module

        lattice = import_module(mod)
        install_web(
            args.course, lattice.CONCEPTS, lattice.EDGES, tag,
            batch="six", task="T-KG-PRE-8", exporter_ver="v1.2",
        )


if __name__ == "__main__":
    main()
