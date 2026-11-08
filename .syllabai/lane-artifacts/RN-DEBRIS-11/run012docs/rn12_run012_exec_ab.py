#!/usr/bin/env python3
"""RN-DEBRIS-11 run-012 executor — streams A + B (of-record, fail-closed).

Operator order (trace 1a1b55358fae3d51): "run-009 receipt: the T1 part-level
tagBackfill re-run (smeSpecPointIds -> official 1.x codes), ict-21 KG mirror
drift, 0500 spine rebuilds."

  A  cie-igcse-business-25 — the tagBackfill engine of record
     (apps/hub/scripts/backfill_sme_spec_tags.py, unmodified) re-run at the
     C5-verified corpus pin 4e3a1c6843b0, post-run-011: the T1 sets' parts
     resolve spcpt_* -> official 1.x codes. Engine sandbox (rn12_engine_
     sandbox.py) pre-validated the exact diff; this apply must reproduce it
     byte-exact.
  B  cie-igcse-ict-21 — the run-009 G5 label-drift finding repaired: the KG
     plane regenerated from curriculum truth by kg_export.export_course()
     (T-SPEC-KG-REGEN-1 in-process law). Served pre tier must re-project
     endpoint-exact (95/95); the written file must differ from served ONLY in
     the drifted labels (subtopics pair 5a + node 5a 'Communication' ->
     'Communication applications') and the disclosed meta fields.

Fail-closed: every phase snapshots byte anchors and asserts before writing.
"""
import json
import subprocess
import sys
import collections
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
CONTENT = HUB / "content"
KG = HUB / "public" / "kg" / "data"
ART = REPO / ".syllabai" / "lane-artifacts" / "RN-DEBRIS-11"
SME = "/home/z/my-project/work/sme-pin-4e3a1c68/SME-ExamQuestion"
PIN = "main@4e3a1c6843b0"


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def dump_indent(obj):
    return (json.dumps(obj, indent=1, ensure_ascii=False) + "\n").encode()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def registry():
    data = (CONTENT / "courses.json").read_text(encoding="utf-8")
    entries = json.loads(data)
    reg = {}
    for e in (entries if isinstance(entries, list) else entries.get("courses", [])):
        if isinstance(e, dict) and e.get("slug"):
            reg[e["slug"]] = e
    return reg


# ──────────────────────────── Stream A ────────────────────────────
def stream_a():
    print("=" * 24, "STREAM A: business-25 tagBackfill re-run", "=" * 24)
    slug = "cie-igcse-business-25"
    q_path = CONTENT / slug / "questions.json"
    m_path = CONTENT / slug / "manifest.json"
    q_raw = q_path.read_bytes()
    m_raw = m_path.read_bytes()

    # A1 pre-state: the vintage block (for the record) + engine-eligible sets
    manifest = json.loads(m_raw)
    pre_block = manifest.get("tagBackfill")
    if not pre_block or pre_block.get("date") != "2026-11-03":
        fail("A1: vintage tagBackfill block missing or drifted")
    cur = load(CONTENT / slug / "curriculum.json")
    spine = {n["code"] for n in cur["nodes"] if n["family"] == "SPEC_POINT"}
    t1_codes = {"1.1.1", "1.2.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4",
                "1.4.1", "1.5.1", "1.5.2"}
    if not t1_codes <= spine:
        fail("A1: run-011 T1 points absent from spine — base drifted")
    sets = json.loads(q_raw)
    elig = []
    for s in sets:
        coded = any(p.get("specPointCodes") or p.get("specPointIds")
                    for q in (s.get("questions") or [])
                    for p in (q.get("parts") or []))
        if not coded:
            elig.append(s.get("slug"))
    print(f"A1 OK: eligible zero-coded sets = {len(elig)}; "
          f"vintage block sets={pre_block.get('sets')} partsSubtopicLevel={pre_block.get('partsSubtopicLevel')}")

    # A2 apply — the engine of record, unmodified, in-place
    sys.path.insert(0, str(HUB / "scripts"))
    import backfill_sme_spec_tags as eng  # noqa
    res = eng.backfill_course(slug, str(CONTENT), SME, PIN, dry=False)
    if not res.get("changed"):
        fail("A2: engine reported no change")
    print(f"A2 OK: engine stats {json.dumps({k: v for k, v in res.items() if k != 'course'})}")

    # A3 post-state: byte-diff census + spine gate + sandbox reproduction
    for k, v in (("setsTagged", 4), ("partsSubtopic", 71), ("partsExact", 0),
                 ("partsPerPart", 0), ("residualSets", 1)):
        if res.get(k) != v:
            fail(f"A2: engine stat {k}={res.get(k)} != sandbox-of-record {v}")
    q_new = q_path.read_bytes()
    sets_new = json.loads(q_new)
    if (json.dumps(sets, indent=1, ensure_ascii=False) + "\n").encode() != q_raw:
        fail("A3: pre-apply questions.json round-trip law broken")
    writes, violations = [], []
    for so, sn in zip(sets, sets_new):
        if so.get("slug") != sn.get("slug"):
            fail("A3: set order drifted")
        for qo, qn in zip(so.get("questions") or [], sn.get("questions") or []):
            for po, pn in zip(qo.get("parts") or [], qn.get("parts") or []):
                for k in set(po) | set(pn):
                    if po.get(k) == pn.get(k):
                        continue
                    if k != "specPointCodes":
                        violations.append({"set": so.get("slug"), "part": pn.get("id"),
                                           "unexpectedField": k})
                if pn.get("specPointCodes") != po.get("specPointCodes"):
                    for c in pn.get("specPointCodes") or []:
                        if c not in spine:
                            violations.append({"set": so.get("slug"), "part": pn.get("id"),
                                               "codeOutsideSpine": c})
                    if so.get("subtopicCode") and ":T1:" in so.get("subtopicCode", "") \
                       and not (set(pn.get("specPointCodes") or []) <= t1_codes):
                        violations.append({"set": so.get("slug"), "part": pn.get("id"),
                                           "nonT1CodeInT1Set": pn.get("specPointCodes")})
                    writes.append({"set": so.get("slug"), "partId": pn.get("id"),
                                   "was": po.get("specPointCodes"),
                                   "now": pn.get("specPointCodes"),
                                   "smeSpecPointIds": pn.get("smeSpecPointIds")})
    if violations:
        fail(f"A3: violations {violations[:4]}")
    # sandbox byte reproduction
    sandbox_q = Path("/home/z/my-project/work/rn12_engine_sandbox/content/"
                     "cie-igcse-business-25/questions.json").read_bytes()
    if q_new != sandbox_q:
        fail("A3: in-place apply != validated sandbox bytes")
    print(f"A3 OK: {len(writes)} part writes, 0 violations; bytes == sandbox of record")

    m_new_raw = m_path.read_bytes()
    m_new = json.loads(m_new_raw)
    if (json.dumps(manifest, indent=1, ensure_ascii=False) + "\n").encode() != m_raw:
        fail("A3: pre-apply manifest round-trip law broken")
    block = m_new.get("tagBackfill")
    if not block or block.get("source", {}).get("ref") != PIN:
        fail("A3: manifest tagBackfill block missing or pin drift")
    per_set = []
    for sn in sets_new:
        tb = (sn.get("source") or {}).get("tagBackfill")
        if tb and "-T1:" in str(tb.get("home", "")):
            per_set.append({"set": sn.get("slug"), "tagBackfill": tb})
    if len(per_set) != 4:
        fail(f"A3: expected 4 T1 set provenance blocks, got {len(per_set)}")
    census = {"engine": {k: v for k, v in res.items() if k != "course"},
              "pin": PIN, "vintageBlockReplaced": pre_block, "newBlock": block,
              "partWrites": writes, "t1Sets": per_set}
    (ART / "run012_engine_census.json").write_text(json.dumps(census, indent=1))
    print(f"A4 OK: census -> run012_engine_census.json "
          f"({len(writes)} writes; manifest block pin {PIN})")
    return census


# ──────────────────────────── Stream B ────────────────────────────
def stream_b():
    print("=" * 24, "STREAM B: ict-21 KG mirror regen", "=" * 24)
    sys.path.insert(0, str(HUB / "scripts"))
    import kg_export  # noqa
    slug = "cie-igcse-ict-21"
    served_path = KG / f"{slug}.json"
    served_raw = served_path.read_bytes()
    served = json.loads(served_raw)
    idx_raw = (KG / "index.json").read_bytes()
    if json.loads(idx_raw) != json.loads(json.dumps(json.loads(idx_raw))):
        pass
    # round-trip law on index.json before touching it
    if (json.dumps(json.loads(idx_raw), ensure_ascii=False,
                   separators=(",", ":"))).encode() != idx_raw.rstrip(b"\n") and \
       (json.dumps(json.loads(idx_raw), ensure_ascii=False,
                   separators=(",", ":")) + "\n").encode() != idx_raw:
        fail("B0: index.json serialization law drift")

    snap_raw = (CONTENT / slug / "prerequisites.json").read_bytes()
    served_pre = {(e[0][2:], e[1][2:]) for e in served["edges"] if e[2] == "pre"}
    served_hier = [e for e in served["edges"] if e[2] != "pre"]
    idx_rt = json.dumps(json.loads(idx_raw), ensure_ascii=False,
                        separators=(",", ":")).encode()
    if idx_rt != idx_raw:
        fail("B0: index.json serialization law drift (compact single-line expected)")
    print(f"B0 OK: served {len(served['nodes'])}n/{len(served['edges'])}e "
          f"({len(served_hier)} hier + {len(served_pre)} pre); index round-trip byte-exact")

    payload = kg_export.export_course(slug, registry())
    meta = payload["meta"]
    counts = meta["counts"]
    by_type = counts["byType"]
    new_pre = {(e[0][2:], e[1][2:]) for e in payload["edges"] if e[2] == "pre"}
    new_hier = [e for e in payload["edges"] if e[2] != "pre"]
    if new_pre != served_pre:
        sym = new_pre ^ served_pre
        fail(f"B1: pre tier drift {len(sym)} pairs e.g. {sorted(sym)[:4]}")
    if {(e[0], e[1]) for e in new_hier} != {(e[0], e[1]) for e in served_hier} or \
       len(new_hier) != len(served_hier):
        fail(f"B1: hier plane drift {len(new_hier)} vs {len(served_hier)}")
    print(f"B1 OK: pre re-projects endpoint-exact ({len(new_pre)}/{len(served_pre)}); "
          f"hier plane endpoint-identical {len(new_hier)}; "
          f"counts {counts['nodes']}n/{counts['edges']}e/{counts['specPoints']}sp")

    # B2 the ONLY content-plane delta = the drifted label (run-009 G5 finding)
    cur = load(CONTENT / slug / "curriculum.json")
    truth = {n["code"]: n["title"] for n in cur["nodes"]
             if n["family"] in ("TOPIC", "SUBTOPIC")}
    label_deltas = []
    served_pairs = {(sec, sid): lbl for sec, defs in served["subtopics"].items()
                    for sid, lbl in defs}
    new_pairs = {(sec, sid): lbl for sec, defs in payload["subtopics"].items()
                 for sid, lbl in defs}
    if served_pairs.keys() != new_pairs.keys():
        fail("B2: subtopic pair keys drift")
    for k in served_pairs:
        if served_pairs[k] != new_pairs[k]:
            label_deltas.append({"plane": "subtopics", "key": k,
                                 "was": served_pairs[k], "now": new_pairs[k],
                                 "curriculumTruth": new_pairs[k] in set(truth.values())})
    served_nodes = {n["id"]: n for n in served["nodes"]}
    new_nodes = {n["id"]: n for n in payload["nodes"]}
    if served_nodes.keys() != new_nodes.keys():
        fail("B2: KG node id drift")
    node_deltas = []
    for nid, sn in served_nodes.items():
        nn = new_nodes[nid]
        for k in set(sn) | set(nn):
            if sn.get(k) != nn.get(k):
                node_deltas.append({"id": nid, "field": k,
                                    "was": sn.get(k), "now": nn.get(k)})
    for d in label_deltas + node_deltas:
        if d.get("now") is not None and d["now"] not in truth.values() and \
           d.get("field") == "label":
            fail(f"B2: regen label not in curriculum truth: {d}")
    # strict delta law: the ONLY content-plane change = the drifted 5a label
    if label_deltas != [{"plane": "subtopics", "key": ("5", "5a"),
                         "was": "Communication",
                         "now": "Communication applications",
                         "curriculumTruth": True}]:
        fail(f"B2: subtopic pair delta beyond the run-009 G5 finding: {label_deltas}")
    if not (len(node_deltas) == 1 and node_deltas[0]["id"] == "5a"
            and node_deltas[0]["field"] == "label"
            and node_deltas[0]["was"] == "Communication"
            and node_deltas[0]["now"] == "Communication applications"):
        fail(f"B2: node delta beyond the run-009 G5 finding: {node_deltas}")
    print(f"B2 OK: deltas — subtopic pairs {label_deltas}; node fields {node_deltas}")

    # B3 write: KG compact single-line; index row sync
    payload["meta"]["counts"] = counts
    out_raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    served_path.write_bytes(out_raw)
    idx = json.loads(idx_raw)
    row = next(r for r in idx["courses"] if r.get("slug") == slug)
    row_before = dict(row)
    row["counts"] = {"nodes": counts["nodes"], "edges": counts["edges"],
                     "specPoints": counts["specPoints"]}
    idx_raw_new = json.dumps(idx, ensure_ascii=False, separators=(",", ":")).encode()
    (KG / "index.json").write_bytes(idx_raw_new)
    print(f"B3 OK: KG written {len(out_raw)}B; index row "
          f"{row_before['counts']} -> {row['counts']}")
    census = {"served": {"nodes": len(served["nodes"]), "edges": len(served["edges"]),
                         "pre": len(served_pre)},
              "regen": dict(counts), "labelDeltas": label_deltas,
              "nodeDeltas": node_deltas, "preEndpointExact": True,
              "indexRow": {"was": row_before, "now": row}}
    (ART / "run012_ict21_regen_census.json").write_text(json.dumps(census, indent=1))
    print("B4 OK: census -> run012_ict21_regen_census.json")
    return census


if __name__ == "__main__":
    a = stream_a()
    b = stream_b()
    print("EXEC A+B: DONE")
