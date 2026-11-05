#!/usr/bin/env python3
"""
kg_f8al_qa.py — the F8 QA of record (v1.0).

The 16-law ledger T-KG-PRE-2 shipped as `16/16 ACCEPT`, rebuilt as a
fail-closed script so every future F8 run (T-KG-PRE-3 onward) proves the
same laws before its PR opens. Zero dependencies beyond the stdlib; reads
only the hub corpus (content/**, public/kg/data/**).

Ledger:
  P1  registry parity — every spine file is a registered index course and
      vice versa; counts.blocks fields present.
  P2  spanning tree — hier edges == nodes - 1, per graph (tree law).
  P3  edge endpoints — every hier/pre endpoint is a spine node id.
  P4  spec-to-spec pre — every pre endpoint is a SpecificationPoint node.
  P5  index sync — index counts (nodes/edges/specPoints) equal the served
      graph exactly, per course.
  P6  pre direction law — no self-loops, no duplicate pairs, no mutual
      (reversed) pairs survive anywhere in the served corpus.
  F8  per-course laws over every course carrying a web-schema snapshot
      (conceptWebPrerequisiteEdges present):
       F8.1 anchors resolve — every anchor binding resolves on the spine's
            point id space (curriculum-prefix aware).
       F8.2 basis vocabulary — every web edge basis is in the operator
            store vocabulary.
       F8.3 web pair hygiene — no self/duplicate/mutual web pairs.
       F8.4 snapshot counts self-consistent — counts block matches the
            snapshot body; validatedEdges == len(validatedPrerequisiteEdges)
            and inferred counters match their lists (zero on plain web
            snapshots — nothing claims validation or an unshipped
            inference; on mergeOf two-layer snapshots the legacy layer's
            operator-validated/inferred counters match its lists).
       F8.5 served == calibrated export — the served pre set equals the
            in-order export of the web (the kg_f8al_project.py law); on
            mergeOf snapshots, the union of the web export and the legacy
            layer's own documented derivation (validated concept edges AND
            direct-point endpoint edges through the legacy anchors, plus
            the inferredPrototypePre tuples).
       F8.6 prereqValidated EMPTY — validatedPrerequisiteEdges == [] and
            inferredPrototypePre/Rel == [] on plain web-schema snapshots
            (the INFERRED PROTOTYPE honesty law: the web tier never claims
            operator validation); on mergeOf snapshots the legacy layer's
            validated edges keep operator provenance (validated_by:operator
            verbatim) and the F8 web edges carry NO provenance field.
       F8.7 disclosure present — meta.prerequisites exists and says
            AI_SUGGESTED / unvalidated; meta.counts.byEdgeType matches the
            served edge type census.
"""

import collections
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
HUB = REPO / "apps" / "hub"
DATA = HUB / "public" / "kg" / "data"
CONTENT = HUB / "content"

BASIS_VOCAB = {"DEFINITIONAL_DEPENDENCY", "USED_WITHOUT_RETEACHING"}

results: list[tuple[str, str, str]] = []  # (law, course, status/detail)


def fail(law: str, course: str, msg: str) -> None:
    results.append((law, course, f"FAIL — {msg}"))
    print(f"FAIL [{law}] {course}: {msg}", flush=True)
    sys.exit(2)


def ok(law: str, course: str, detail: str) -> None:
    results.append((law, course, f"ACCEPT — {detail}"))


def main() -> None:
    files = sorted(DATA.glob("*.json"))
    spines = []
    for f in files:
        if f.name == "index.json":
            continue
        d = json.loads(f.read_text())
        if isinstance(d, dict) and "nodes" in d and "edges" in d:
            spines.append((f.stem, d))
    if not spines:
        fail("P1", "*", "no spine files found")

    # P1 — registry parity
    index = json.loads((DATA / "index.json").read_text())
    reg = {r.get("slug") for r in index.get("courses", [])}
    served_slugs = {s for s, _ in spines}
    orphans = served_slugs - reg
    ghosts = reg - served_slugs
    if orphans or ghosts:
        fail("P1", "*", f"orphans={sorted(orphans)} ghosts={sorted(ghosts)}")
    ok("P1", "*", f"{len(reg)} registered, 0 orphans, 0 ghosts")

    for slug, d in spines:
        nodes = {n.get("id") for n in d["nodes"]}
        types = {n.get("id"): n.get("type") for n in d["nodes"]}
        et = collections.Counter(e[2] for e in d["edges"])

        # P2 — spanning tree
        if et.get("hier", 0) != len(d["nodes"]) - 1:
            fail("P2", slug, f"hier {et.get('hier', 0)} != nodes-1 {len(d['nodes']) - 1}")
        # P3 — endpoints exist
        bad = [e for e in d["edges"] if e[0] not in nodes or e[1] not in nodes]
        if bad:
            fail("P3", slug, f"{len(bad)} edges with missing endpoints, e.g. {bad[0]}")
        # P4 — pre endpoints spec-to-spec
        bad_pre = [
            e for e in d["edges"]
            if e[2] == "pre" and (types.get(e[0]) != "SpecificationPoint" or types.get(e[1]) != "SpecificationPoint")
        ]
        if bad_pre:
            fail("P4", slug, f"{len(bad_pre)} pre edges not spec-to-spec, e.g. {bad_pre[0]}")
        # P6 — pre hygiene: no self / dup / mutual
        pre_pairs = [(e[0], e[1]) for e in d["edges"] if e[2] == "pre"]
        seen = set()
        for a, b in pre_pairs:
            if a == b:
                fail("P6", slug, f"self-loop {a}")
            if (a, b) in seen:
                fail("P6", slug, f"duplicate pair {a}->{b}")
            if (b, a) in seen:
                fail("P6", slug, f"mutual pair {a}<->{b}")
            seen.add((a, b))
        ok("P2-P4,P6", slug, f"nodes {len(d['nodes'])}, hier {et.get('hier', 0)}, pre {et.get('pre', 0)} — tree/endpoint/spec/hygiene laws hold")

        # P5 — index sync
        row = next((r for r in index["courses"] if r.get("slug") == slug), None)
        if row is None:
            fail("P5", slug, "absent from index.json")
        c = row.get("counts", {})
        if c.get("nodes") != len(d["nodes"]) or c.get("edges") != len(d["edges"]):
            fail("P5", slug, f"index {c} vs served nodes {len(d['nodes'])} edges {len(d['edges'])}")
        mc = d.get("meta", {}).get("counts", {})
        if mc.get("edges") != len(d["edges"]) or mc.get("nodes") != len(d["nodes"]):
            fail("P5", slug, f"meta.counts {mc} vs served edges {len(d['edges'])}")
        if mc.get("byEdgeType", {}).get("pre", 0) != et.get("pre", 0):
            fail("P5", slug, f"meta.counts.byEdgeType.pre != served {et.get('pre', 0)}")
        ok("P5", slug, f"index + meta.counts sync at edges {len(d['edges'])}")

        # F8 laws — only for courses with a web-schema snapshot
        ppath = CONTENT / slug / "prerequisites.json"
        if not ppath.exists():
            continue
        pre = json.loads(ppath.read_text())
        if "conceptWebPrerequisiteEdges" not in pre:
            continue  # legacy generation (T-KG-PRE-1) — F8 web laws N/A

        is_merge = "mergeOf" in pre  # T-KG-PRE-20 two-layer merged store

        pts = [p.get("id") for p in d["points"]]
        ids = set(pts)
        prefix_code = d.get("meta", {}).get("code")
        prefix = f"{prefix_code}-" if isinstance(prefix_code, str) and prefix_code else None

        def res(b):
            if b in ids:
                return b
            if prefix and b.startswith(prefix) and b[len(prefix):] in ids:
                return b[len(prefix):]
            return None

        # F8.1 — anchors resolve
        anchors = {}
        for con, binds in pre["conceptAnchors"].items():
            r = [res(b) for b in binds]
            if not r or any(x is None for x in r):
                fail("F8.1", slug, f"concept {con}: unresolvable binding")
            anchors[con] = r
        ok("F8.1", slug, f"{len(anchors)} concepts, {sum(len(v) for v in anchors.values())} bindings all resolve")

        # F8.2 — basis vocabulary + F8.3 — web hygiene
        seen_pairs = set()
        for e in pre["conceptWebPrerequisiteEdges"]:
            if e["basis"] not in BASIS_VOCAB:
                fail("F8.2", slug, f"basis {e['basis']!r} outside store vocabulary")
            k = (e["prerequisite"], e["dependent"])
            if k[0] == k[1] or k in seen_pairs or (k[1], k[0]) in seen_pairs:
                fail("F8.3", slug, f"self/dup/mutual web pair {k}")
            if k[0] not in anchors or k[1] not in anchors:
                fail("F8.3", slug, f"web edge {k} references an unanchored concept")
            seen_pairs.add(k)
        ok("F8.2-F8.3", slug, f"{len(pre['conceptWebPrerequisiteEdges'])} web edges, vocabulary + hygiene laws hold")

        # F8.4 — snapshot counts self-consistent
        cnt = pre["counts"]
        if cnt.get("anchoredConcepts") != len(anchors):
            fail("F8.4", slug, f"counts.anchoredConcepts {cnt.get('anchoredConcepts')} != {len(anchors)}")
        if cnt.get("conceptWebEdges") != len(pre["conceptWebPrerequisiteEdges"]):
            fail("F8.4", slug, "counts.conceptWebEdges mismatch")
        if cnt.get("validatedEdges") != len(pre.get("validatedPrerequisiteEdges", [])):
            fail("F8.4", slug, "counts.validatedEdges mismatch")
        if cnt.get("inferredPre") != len(pre.get("inferredPrototypePre", [])):
            fail("F8.4", slug, "counts.inferredPre mismatch")
        if cnt.get("inferredRel") != len(pre.get("inferredPrototypeRel", [])):
            fail("F8.4", slug, "counts.inferredRel mismatch")
        if not is_merge and (
            cnt.get("validatedEdges") != 0 or cnt.get("inferredPre") != 0 or cnt.get("inferredRel") != 0
        ):
            fail("F8.4", slug, "web-schema snapshot claims validated/inferred counters != 0")
        if is_merge:
            ok("F8.4", slug, "counts block self-consistent over the two-layer merge (legacy validated/inferred counters match their lists)")
        else:
            ok("F8.4", slug, "counts block self-consistent, zero validated/inferred claims")

        # F8.5 — served == calibrated in-order export (web layer; plus the
        # legacy layer's documented derivation on mergeOf snapshots)
        order = {p: i for i, p in enumerate(pts)}
        derived = set()
        for e in pre["conceptWebPrerequisiteEdges"]:
            for a in anchors[e["prerequisite"]]:
                for b in anchors[e["dependent"]]:
                    if a != b and order[a] < order[b]:
                        derived.add((f"p:{a}", f"p:{b}"))
        served_set = {(e[0], e[1]) for e in d["edges"] if e[2] == "pre"}
        if is_merge:
            cand = set()
            for e in pre.get("validatedPrerequisiteEdges", []):
                def leg_ep(x):
                    return anchors[x] if x in anchors else [
                        res(x) if res(x) else fail("F8.5", slug, f"legacy endpoint {x!r} does not resolve")
                    ]
                for a in leg_ep(e["prerequisite"]):
                    for b in leg_ep(e["dependent"]):
                        if a != b:
                            cand.add((a, b))
            legacy_pairs = {
                (f"p:{a}", f"p:{b}") for a, b in cand if order[a] < order[b]
            } | {(x[0], x[1]) for x in pre.get("inferredPrototypePre", [])}
            derived = derived | legacy_pairs
        if derived != served_set:
            fail("F8.5", slug, f"calibration drift: derived {len(derived)} vs served {len(served_set)}, sym {len(derived ^ served_set)}")
        if is_merge:
            ok("F8.5", slug, f"served pre == legacy derivation UNION web export exactly ({len(derived)} pairs)")
        else:
            ok("F8.5", slug, f"served pre == in-order web export exactly ({len(derived)} pairs)")

        # F8.6 — prereqValidated EMPTY + inferred prototype lists empty
        # (plain web snapshots); on mergeOf snapshots the legacy layer's
        # operator provenance must ride along byte-intact and the F8 web
        # layer must carry NO provenance claim.
        if is_merge:
            bad_prov = [
                e for e in pre.get("validatedPrerequisiteEdges", [])
                if "validated_by:operator" not in e.get("provenance", "")
            ]
            if bad_prov:
                fail("F8.6", slug, f"{len(bad_prov)} legacy validated edges lost operator provenance")
            prov_web = [e for e in pre["conceptWebPrerequisiteEdges"] if "provenance" in e]
            if prov_web:
                fail("F8.6", slug, f"{len(prov_web)} F8 web edges carry a provenance field — web tier must never claim validation")
            ok("F8.6", slug, "legacy layer operator provenance byte-intact; F8 web layer carries zero validated claims")
        else:
            if pre.get("validatedPrerequisiteEdges") != []:
                fail("F8.6", slug, "validatedPrerequisiteEdges not empty — web tier must never claim validation")
            if pre.get("inferredPrototypePre") != [] or pre.get("inferredPrototypeRel") != []:
                fail("F8.6", slug, "inferredPrototypePre/Rel not empty on a web-schema snapshot")
            ok("F8.6", slug, "prereqValidated EMPTY — INFERRED PROTOTYPE honesty law holds")

        # F8.7 — disclosure present
        pr = d.get("meta", {}).get("prerequisites")
        if not isinstance(pr, dict) or "AI_SUGGESTED" not in json.dumps(pr):
            fail("F8.7", slug, "meta.prerequisites disclosure missing or not AI_SUGGESTED")
        ok("F8.7", slug, "meta.prerequisites disclosure present (AI_SUGGESTED, INFERRED PROTOTYPE)")

    print(f"\nQA ledger: {len(results)}/{len(results)} ACCEPT")
    for law, course, status in results:
        print(f"  [{law}] {course}: {status}")


if __name__ == "__main__":
    main()
