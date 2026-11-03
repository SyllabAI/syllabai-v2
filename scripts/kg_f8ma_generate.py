#!/usr/bin/env python3
"""
kg_f8ma_generate.py — T-KG-PRE-6 (F8 rollout batch four) fresh-web startup tool.

For a course whose served spine is a pure tree (0 pre edges), installs the
F8 lane's AI_SUGGESTED concept web (authored in f8ma_lattice_0580e.py /
f8ma_lattice_0580c.py / f8ma_lattice_9709p1.py) and exports the pre edges by
the CALIBRATED law of record — the exact export rule of
scripts/kg_f8al_project.py v1.0 (anchor cross-product, no self-loops, in-order
pairs only, reversed dropped outright and counted), imported from that module
rather than re-implemented so the law cannot drift.

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


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def install_web(slug: str, concepts: dict, edges: list, lane_tag: str) -> None:
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
            f"AI concept-web startup run (F8 rollout batch four; T-KG-PRE-6, "
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
            f"AI concept web (F8 rollout batch four, T-KG-PRE-6, lane "
            f"{lane_tag}): AI_SUGGESTED — unvalidated, labelled INFERRED "
            f"PROTOTYPE by the renderer, never in prereqValidated."
        ),
        "webEdges": len(web_edges),
        "preEdges": len(pre_edges),
    }
    m["exporter"] = (
        "scripts/kg_export.py v1.6 web tier via scripts/kg_f8ma_generate.py "
        f"v1.0 (fresh {lane_tag} web, anchor verification + reversed-pair "
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
    else:
        fail(f"no lattice registered for {args.course}")


if __name__ == "__main__":
    main()
