#!/usr/bin/env python3
"""RN-DEBRIS-11 run-011 — the F4 0264 structural repair of record (assemble).

Operator order: "business-25's structural repair (edges + 9 points + KG
regeneration)" — the run-009 F4_0264 verdict executed:
  STRUCTURAL-REPAIR-QUEUED — titles official-correct but T1 subtree has ZERO
  edges (invisible to the tree), 0 of 9 official points, KG plane pre-r5.

Repairs applied to apps/hub/content/cie-igcse-business-25/:
  curriculum.json
    N1 the r5 T1 husk (TOPIC + SUB1.1-1.5, appended at the array tail) moves to
       its canonical position (first TOPIC group, after SUBJECT) — required by
       the exporter's sections-from-array-order law (sec1 must be T1).
    N2 the 9 official T1 SPEC_POINT nodes (PDF-extracted, evidence of record)
       inserted inside the T1 group under their subtopics.
    N3 SPEC_POINT order renumbered to the fleet's global 1..N sequence law
       (9 new points take 1-9; the existing 52 shift +9 — relative order kept).
    N4 TOPIC order restored to the fleet's global 1..N law (T2-T6 1..5 -> 2..6;
       T1 already carries order 1 — the r5 husk's duplicate-order defect).
    E1 the 15 missing PART_OF edges appended at the array head in the corpus
       DFS law (subject->T1, T1->SUB1.x, SUB->points), mirroring the parents
       fields the r5 husk already declared.
  manifest.json
    M1 counts synced to curriculum truth (sections 5->6, topics 24->29,
       specPoints 52->61) — the r5 husk wave had already left them stale; the
       home-page "Spec points" card reads these.

Serializers of record (round-trip verified fail-closed before any write):
  curriculum.json / manifest.json: json.dumps(obj, indent=1, ensure_ascii=False)
  + trailing newline.

Every other byte of every file is asserted unchanged.
"""
import json
import sys
from pathlib import Path

COURSE = Path("/home/z/my-project/work/syllabai-v2/apps/hub/content/cie-igcse-business-25")
EV = Path("/home/z/my-project/work/run011/run011_official_evidence.json")

SUBJECT = "cie-igcse-business-25"
T1 = "cie-igcse-business-2027-2029-T1"
SUB = lambda n: f"{T1}:SUB1.{n}"


def ser(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def node_key_order(n):
    """The corpus node key law: code, family, title, description, parents,
    provenanceTier, order — verified against every existing node."""
    return ["code", "family", "title", "description", "parents",
            "provenanceTier", "order"]


def main():
    # ── load + round-trip fail-closed ────────────────────────────────────
    cur_raw = (COURSE / "curriculum.json").read_bytes()
    cur = json.loads(cur_raw)
    if ser(cur).encode() != cur_raw:
        fail("curriculum.json round-trip mismatch — serializer law drifted")
    man_raw = (COURSE / "manifest.json").read_bytes()
    man = json.loads(man_raw)
    if ser(man).encode() != man_raw:
        fail("manifest.json round-trip mismatch — serializer law drifted")

    ev = json.loads(EV.read_text(encoding="utf-8"))
    if ev["crossChecks"]["run009Evidence"] != "PASS (topics/subsections/pointNumbers byte-exact)" \
            or ev["crossChecks"]["curriculumTitles"] != "PASS (T1 + 5 SUB titles byte-exact)":
        fail("evidence artifact cross-checks are not PASS")

    nodes = cur["nodes"]
    edges = cur["edges"]
    by_code = {n["code"]: n for n in nodes}
    subj = by_code[SUBJECT]
    if subj["family"] != "SUBJECT" or nodes[0]["family"] != "SUBJECT":
        fail("array head is not the SUBJECT node")

    # ── pre-state census (the run-009 F4 wreck, re-proven on this branch) ─
    t1_nodes = [n for n in nodes if n["code"] == T1 or n["code"].startswith(T1 + ":")]
    if len(t1_nodes) != 6:
        fail(f"expected the 6-node T1 husk, got {len(t1_nodes)}")
    if t1_nodes[0]["code"] != T1 or nodes[-5:] != t1_nodes[1:]:
        fail("T1 husk is not the array tail — pre-state drifted from run-009")
    t1_edges = [e for e in edges if T1 in (e["source"], e["target"])
                or any(SUB(i) in (e["source"], e["target"]) for i in range(1, 6))]
    if t1_edges:
        fail(f"T1 already has edges — the run-009 wreck is gone? {t1_edges[:2]}")
    pts1 = [n for n in nodes if n["family"] == "SPEC_POINT"
            and n["code"].startswith("1.")]
    if pts1:
        fail(f"T1 points already exist: {[p['code'] for p in pts1]}")
    fam_counts = {}
    for n in nodes:
        fam_counts[n["family"]] = fam_counts.get(n["family"], 0) + 1
    if fam_counts != {"SUBJECT": 1, "TOPIC": 6, "SUBTOPIC": 29, "SPEC_POINT": 52}:
        fail(f"pre-state family counts drifted: {fam_counts}")
    if len(edges) != 81:
        fail(f"pre-state edges {len(edges)} != 81")
    print("PRE-STATE OK: the run-009 F4 wreck reproduced on this branch "
          "(6-node tail husk, 0 T1 edges, 0 T1 points, 81 edges, 52 points)")

    # ── N2: the 9 official point nodes ───────────────────────────────────
    subs = {n: by_code[SUB(n)] for n in range(1, 6)}
    for n, s in subs.items():
        if s["title"] != ev["subsections1"][f"1.{n}"]:
            fail(f"SUB1.{n} title drift vs evidence")
    new_points = []
    for i, p in enumerate(ev["points"], start=1):
        sub_n = int(p["subtopic"].split(".")[1])
        np = {
            "code": p["code"],
            "family": "SPEC_POINT",
            "title": p["officialTitle"],
            "description": None,
            "parents": [SUB(sub_n)],
            "provenanceTier": "RULE_DERIVED",
            "order": i,
        }
        if list(np.keys()) != node_key_order(np):
            fail(f"node key law violated for {p['code']}")
        new_points.append(np)
    if [p["code"] for p in new_points] != ["1.1.1", "1.2.1", "1.3.1", "1.3.2",
                                           "1.3.3", "1.3.4", "1.4.1", "1.5.1", "1.5.2"]:
        fail("point code sequence drifted")

    # ── N1+N2+N3+N4: rebuild the node array in the canonical law ─────────
    topics = [n for n in nodes if n["family"] == "TOPIC"]
    subs_all = [n for n in nodes if n["family"] == "SUBTOPIC"]
    points_all = [n for n in nodes if n["family"] == "SPEC_POINT"]
    # group points under their subtopic parent (existing corpus shape)
    pts_by_sub = {}
    for p in points_all:
        (par,) = p["parents"]          # single-parent law (asserted per node)
        pts_by_sub.setdefault(par, []).append(p)
    for p in points_all:
        if len(p["parents"]) != 1:
            fail(f"multi-parent point {p['code']}")
    for n in subs_all:
        if len(n["parents"]) != 1:
            fail(f"multi-parent subtopic {n['code']}")

    t_codes = [t["code"] for t in topics]
    t1_idx = t_codes.index(T1)
    ordered_t = [T1] + [c for c in t_codes if c != T1]   # T1 first (official 1..6)

    new_nodes = [subj]
    for ti, t_code in enumerate(ordered_t, start=1):
        t = by_code[t_code]
        if t_code == T1:
            t = dict(t)                    # husk byte-preserved, position moves
        else:
            t = dict(t)
            t["order"] = t["order"] + 1    # N4: 1..5 -> 2..6
        new_nodes.append(t)
        # the topic's subtopics, in array order (per-topic order fields 1..M)
        t_subs = [s for s in subs_all if s["parents"][0] == t_code]
        for j, s in enumerate(t_subs, start=1):
            if s["order"] != j:
                fail(f"subtopic order law broken in {t_code}: {s['code']} order {s['order']} != position {j}")
            new_nodes.append(s)
            sps = pts_by_sub.get(s["code"], [])
            if t_code == T1:
                mine = [p for p in new_points if p["parents"] == [s["code"]]]
                for k, p in enumerate(mine, start=1):
                    pass
                sps = mine                 # N2: the 9 new points, evidence order
            else:
                sps = [dict(p, order=p["order"] + 9) for p in sps]  # N3: +9
            sps.sort(key=lambda p: p["code"])
            new_nodes.extend(sps)

    if len(new_nodes) != 1 + 6 + 29 + 52 + 9:
        fail(f"post array size {len(new_nodes)} != 97")

    # structural law asserts on the new array
    fam_seq = [n["family"] for n in new_nodes]
    if fam_seq[0] != "SUBJECT":
        fail("array head lost")
    pos = 1
    for ti in range(6):
        if fam_seq[pos] != "TOPIC":
            fail(f"topic block mispositioned at {pos}")
        pos += 1
        # each topic block: alternating SUBTOPIC / SPEC_POINT groups
        block = []
        while pos < len(fam_seq) and fam_seq[pos] in ("SUBTOPIC", "SPEC_POINT"):
            block.append(fam_seq[pos]); pos += 1
        # hierarchical shape: SUBTOPIC first, points between subs
        if block[0] != "SUBTOPIC" or block[-1] not in ("SUBTOPIC", "SPEC_POINT"):
            fail("bad block shape")
    if pos != len(fam_seq):
        fail("trailing nodes after T6 block")
    topic_orders = [n["order"] for n in new_nodes if n["family"] == "TOPIC"]
    if topic_orders != [1, 2, 3, 4, 5, 6]:
        fail(f"topic order law broken: {topic_orders}")
    all_pts = [n for n in new_nodes if n["family"] == "SPEC_POINT"]
    po = [p["order"] for p in all_pts]
    if sorted(po) != list(range(1, 62)):
        fail(f"point order law broken: {sorted(po)[:5]}...")
    print(f"ARRAY OK: 97 nodes; topics 1..6; points 1..61 global; "
          f"hierarchical family blocks")

    # unchanged-byte law: every moved/renumbered node keeps its other fields
    old_codes = {n["code"]: n for n in nodes}
    for n in new_nodes:
        o = old_codes.get(n["code"])
        if o is None:
            continue                        # the 9 new points
        delta = {k for k in n if json.dumps(n[k], sort_keys=True)
                 != json.dumps(o.get(k), sort_keys=True)}
        allowed = {"order"} if n["family"] in ("TOPIC", "SPEC_POINT") else set()
        if n["code"] == T1 or n["code"].startswith(T1 + ":SUB"):
            allowed = set()                 # the husk moves, bytes untouched
        if delta - allowed:
            fail(f"node {n['code']} changed fields outside the law: {delta}")

    # ── E1: the 15 missing PART_OF edges (corpus DFS law, array head) ────
    def edge(src, dst):
        return {"source": src, "relation": "PART_OF", "target": dst,
                "provenanceTier": "RULE_DERIVED"}
    new_edges = [edge(SUBJECT, T1)]
    for n in range(1, 6):
        new_edges.append(edge(T1, SUB(n)))
        for p in new_points:
            if p["parents"] == [SUB(n)]:
                new_edges.append(edge(SUB(n), p["code"]))
    if len(new_edges) != 15:
        fail(f"expected 15 new edges, built {len(new_edges)}")
    new_edge_list = new_edges + edges       # T1 group first, then the 81 verbatim
    if len(new_edge_list) != 96:
        fail(f"post edges {len(new_edge_list)} != 96")

    # parents mirror law: every parents link has its PART_OF edge (and vice versa)
    ecodes = {(e["source"], e["target"]) for e in new_edge_list}
    for n in new_nodes:
        for p in n["parents"]:
            if (p, n["code"]) not in ecodes:
                fail(f"parents link without edge: {p} -> {n['code']}")
    code_set = {n["code"] for n in new_nodes}
    for e in new_edge_list:
        if e["source"] not in code_set or e["target"] not in code_set:
            fail(f"dangling edge {e['source']} -> {e['target']}")
        if e["relation"] != "PART_OF" or e["provenanceTier"] != "RULE_DERIVED":
            fail(f"edge law violated: {e}")
    if len(ecodes) != 96:
        fail(f"edge duplicates: {96 - len(ecodes)}")
    print("EDGES OK: 96 PART_OF edges; parents fields fully mirrored; "
          "T1 DFS group leads, the 81 legacy edges byte-verbatim")

    cur2 = dict(cur)
    cur2["nodes"] = new_nodes
    cur2["edges"] = new_edge_list

    # ── M1: manifest counts sync ─────────────────────────────────────────
    man2 = json.loads(json.dumps(man))
    man2["counts"]["sections"] = 6
    man2["counts"]["topics"] = 29
    man2["counts"]["specPoints"] = 61
    if man2["counts"]["notes"] != 85 or man2["counts"]["questions"] != 576:
        fail("manifest content counts drifted — re-derive before patching")

    # ── write ────────────────────────────────────────────────────────────
    (COURSE / "curriculum.json").write_bytes(ser(cur2).encode())
    (COURSE / "manifest.json").write_bytes(ser(man2).encode())
    print("WROTE curriculum.json + manifest.json")
    print(f"  nodes 88 -> {len(new_nodes)}; edges 81 -> {len(new_edge_list)}; "
          f"points 52 -> {len(all_pts)}")
    print(f"  manifest counts: sections 5->6, topics 24->29, specPoints 52->61")


if __name__ == "__main__":
    main()
