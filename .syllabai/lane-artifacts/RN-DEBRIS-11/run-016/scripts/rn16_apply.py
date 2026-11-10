#!/usr/bin/env python3
"""RN-DEBRIS-11 run-016 (revised) — gates-green apply of record.

The first apply pass filled the cs-23 T7/T9/T10 husks with 21 topic-level
SPEC_POINTs — and the completion gates caught the corpus law that forbids it:
every SPEC_POINT in the 106-course fleet hangs under exactly one SUBTOPIC
(kg_export v1.6 refuses topic-level points; the apparent fleet precedent
igcse-chemistry-19 is DUAL-PARENTED — its 'S1-a..i' rows are real official
subsections, so its points are (TOPIC, SUBTOPIC)-parented). A topic-level
point state would leave validate_spines.py permanently red (kg_export
incompatible) and the KG plane unproducible — invention by construction.

Revised law-ful scope (executed here):
  Part A (unchanged): the excluded 2.3.2 row family — 8 files / 11 sites ->
     the official 9709 row (content+spine+KG three-plane; run-013 label law).
  Part B (revised): cs-23 mirror restoration WITHOUT invention —
     T7 title hyphen fix (PDF-verified), T8 order 7->8, canonical DFS array
     (T7 husk block before T8), spine gains the 3 empty TOPIC nodes + 3
     subject edges (census TOPIC 10==10), meta.counts sync, manifest sync,
     KG regen via export_course (now export-compatible; run-011 law with the
     deep-equal gate).
  Part B-proposal: the 21 official points (7.1..7.9 + 7.2a/b/c + 7.5a/b +
     9.1..9.4 + 10.1..10.3c) are filed as the PROPOSAL MAP of record —
     apply-ready byte-exact, pending the exporter's topic-level-point law
     (a code-change run for the desk). run-009 precedent: title maps are
     repair-pass work.
"""
import hashlib
import json
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
WORK = Path("/home/z/my-project/work/rn16docs")
HUB = REPO / "apps" / "hub"
SLUG_CS = "cie-igcse-computer-science-23"
SUBJ = "cie-igcse-computer-science-23"
TPRE = "cie-igcse-computer-science-2023-2025"

GARB = ("use trigonometrical identities for the simplification and exact evaluation of "
        "expressions, e.g. solving and in the course of solving equations, and select an "
        "identity or identities appropriate to the context, showing familiarity in "
        "particular with the use of tan( A ± B ) forms R sin ^ i ! a h and R cos ^ i ! a h "
        ".: • sec i / 1 + tan i and cosec i / 1 + cot i • the expansions of sin( A ± B ) , "
        "cos( A ± B ) and • the formulae for sin 2 A , cos 2 A and tan 2 A • the expression "
        "of a sin i + b cos i in the")
GARB_MARK = "R sin ^ i ! a h"


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def dump_pretty(doc):
    return json.dumps(doc, indent=1, ensure_ascii=False) + "\n"


def dump_compact(doc, trailing_nl):
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + ("\n" if trailing_nl else "")


def rtr(raw, doc, kind):
    if kind == "pretty":
        return raw == dump_pretty(doc)
    return raw in (dump_compact(doc, False), dump_compact(doc, True))


def replace_sites(doc, old, new):
    n = 0

    def rec(o):
        nonlocal n
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str) and v == old:
                    o[k] = new
                    n += 1
                else:
                    rec(v)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                if isinstance(v, str) and v == old:
                    o[i] = new
                    n += 1
                else:
                    rec(v)
    rec(doc)
    return n


def edge(src, tgt):
    return {"source": src, "relation": "PART_OF", "target": tgt,
            "provenanceTier": "RULE_DERIVED"}


def main():
    ev = load(WORK / "rn16_official_evidence.json")
    OFFICIAL = ev["evidence_9709"]["official_2_3_2_title"]
    T7_TITLE = ev["evidence_0478"]["headers"]["T7"]["title"]
    manifest = {"run": "rn11-run-016", "mode": "apply", "partA": [], "partB": []}

    # ══ Part A (as before): verify-then-apply ════════════════════════════
    cont_p3 = load(HUB / "content/cie-a-level-maths-20-pure-3/curriculum.json")
    p3_title = next(n["title"] for n in cont_p3["nodes"] if n.get("code") == "3.3.2")
    spine_p3 = load(HUB / "spines/cie-a-level-maths-20-pure-3.json")
    p3_spine_title = next(n["title"] for n in spine_p3["curriculum"]["nodes"]
                          if n.get("code") == "3.3.2")
    part_a = [
        (HUB / "content/cie-as-maths-20-pure-2/curriculum.json", "pretty", GARB, 1),
        (HUB / "content/cie-a-level-maths-20-pure-2/curriculum.json", "pretty", GARB, 1),
        (HUB / "spines/cie-a-level-maths-20-pure-2.json", "compact", GARB, 1),
        (HUB / "content/cie-a-level-maths-20-pure-3/curriculum.json", "pretty", p3_title, 1),
        (HUB / "spines/cie-a-level-maths-20-pure-3.json", "compact", p3_spine_title, 1),
    ]

    def discover(path):
        doc = load(path)
        olds = set()

        def rec(o):
            if isinstance(o, dict):
                for v in o.values():
                    rec(v)
            elif isinstance(o, list):
                for v in o:
                    rec(v)
            elif isinstance(o, str) and GARB_MARK in o:
                olds.add(o)
        rec(doc)
        return olds

    for slug in ("cie-as-maths-20-pure-2", "cie-a-level-maths-20-pure-2"):
        part_a.append((HUB / f"public/kg/data/{slug}.json", "compact", GARB, 2))
    # UGM byte-true re-serve planes: officialText must mirror the repaired
    # curriculum title (T-UGM-AS-PURE-1 serve law: byte-true copy of the hub
    # bundle of record)
    for slug, pid in (("cie-as-maths-20-pure-2", "2.3.2"),
                      ("cie-a-level-maths-20-pure-2", "2.3.2")):
        part_a.append((HUB / f"content/{slug}/ugm-resources.json", "pretty", GARB, 1))
    p3kg = HUB / "public/kg/data/cie-a-level-maths-20-pure-3.json"
    olds = discover(p3kg)
    if len(olds) == 1:
        part_a.append((p3kg, "compact", next(iter(olds)), 2))
    elif len(olds) == 0 and GARB_MARK not in p3kg.read_text(encoding="utf-8"):
        pass  # already applied — resume-safe
    else:
        fail(f"pure-3 KG discover: {len(olds)} distinct strings")
    # pure-3 UGM: same discover-by-mark law (493-char variant)
    p3ugm = HUB / "content/cie-a-level-maths-20-pure-3/ugm-resources.json"
    uolds = discover(p3ugm)
    if len(uolds) == 1:
        part_a.append((p3ugm, "pretty", next(iter(uolds)), 1))
    elif len(uolds) == 0 and GARB_MARK not in p3ugm.read_text(encoding="utf-8"):
        pass  # already applied — resume-safe
    else:
        fail(f"pure-3 UGM discover: {len(uolds)} distinct strings")

    for path, kind, old, expected in part_a:
        raw = Path(path).read_text(encoding="utf-8")
        n = replace_sites(json.loads(raw), old, OFFICIAL)
        if n != expected:
            if n == 0 and old not in raw and OFFICIAL in raw:
                print(f"A-SKIP already applied: {path.name}")
                continue
            fail(f"[dry] {path.name}: sites {n} != {expected}")
    for path, kind, old, expected in part_a:
        path = Path(path)
        raw = path.read_text(encoding="utf-8")
        doc = json.loads(raw)
        trailing = raw.endswith("\n")
        if not rtr(raw, doc, kind):
            fail(f"round-trip broken: {path.name}")
        n = replace_sites(doc, old, OFFICIAL)
        if n != expected:
            if n == 0 and old not in raw and OFFICIAL in raw:
                manifest["partA"].append({"file": str(path.relative_to(REPO)), "kind": kind,
                                          "sites": 0, "alreadyApplied": True,
                                          "oldSha": sha(raw), "newSha": sha(raw)})
                continue
            fail(f"{path.name}: sites {n} != {expected}")
        out = dump_pretty(doc) if kind == "pretty" else dump_compact(doc, trailing)
        if GARB_MARK in out:
            fail(f"garbage survives in {path.name}")
        manifest["partA"].append({"file": str(path.relative_to(REPO)), "kind": kind,
                                  "sites": n, "oldSha": sha(raw), "newSha": sha(out)})
        path.write_text(out, encoding="utf-8")
        print(f"A-OK {n} site(s): {path.relative_to(REPO)}")

    # ══ Part B (revised): cs-23 mirror restoration, zero invention ═══════
    cpath = HUB / f"content/{SLUG_CS}/curriculum.json"
    cur_raw = cpath.read_text(encoding="utf-8")
    cur = json.loads(cur_raw)
    if not rtr(cur_raw, cur, "pretty"):
        fail("cs-23 curriculum round-trip broken")
    by = {n["code"]: n for n in cur["nodes"]}
    if by[f"{TPRE}-T7"]["title"] not in ("Algorithm design and problem solving", T7_TITLE):
        fail("T7 husk title drift")
    if by[f"{TPRE}-T8"]["order"] not in (7, 8) or by[f"{TPRE}-T7"]["order"] != 7:
        fail("T7/T8 order state drift")

    by[f"{TPRE}-T7"]["title"] = T7_TITLE
    by[f"{TPRE}-T8"]["order"] = 8

    # canonical DFS: move the T7 husk block (empty) before T8's block
    nodes = cur["nodes"]
    t7_idx = next(i for i, n in enumerate(nodes) if n.get("code") == f"{TPRE}-T7")
    t8_idx = next(i for i, n in enumerate(nodes) if n.get("code") == f"{TPRE}-T8")
    if t7_idx > t8_idx:
        t7_node = nodes.pop(t7_idx)
        t8_idx = next(i for i, n in enumerate(nodes) if n.get("code") == f"{TPRE}-T8")
        nodes.insert(t8_idx, t7_node)
    # census unchanged: 1 SUBJECT + 10 TOPIC + 21 SUBTOPIC + 88 SPEC_POINT = 120
    fams = {}
    for n in nodes:
        fams[n.get("family")] = fams.get(n.get("family"), 0) + 1
    if (len(nodes), fams.get("TOPIC"), fams.get("SUBTOPIC"), fams.get("SPEC_POINT")) != (120, 10, 21, 88):
        fail(f"post content census drift: {len(nodes)}/{fams}")

    cur_out = dump_pretty(cur)
    manifest["partB"].append({"file": str(cpath.relative_to(REPO)),
                              "oldSha": sha(cur_raw), "newSha": sha(cur_out),
                              "nodes": 120, "edges": 119})
    cpath.write_text(cur_out, encoding="utf-8")
    print("B-OK content: 120 nodes (T7 title+order+position), 119 edges")

    # spine mirror: +3 TOPIC nodes + 3 subject edges (the census fix), T8 order fix
    spath = HUB / f"spines/{SLUG_CS}.json"
    sp_raw = spath.read_text(encoding="utf-8")
    sp = json.loads(sp_raw)
    trailing = sp_raw.endswith("\n")
    if not rtr(sp_raw, sp, "compact"):
        fail("cs-23 spine round-trip broken")
    spc = sp["curriculum"]
    spn = {n["code"]: n for n in spc["nodes"]}
    spn[f"{TPRE}-T8"]["order"] = 8
    # mirror the content T7 title
    spn[f"{TPRE}-T7"] = {"code": f"{TPRE}-T7", "family": "TOPIC", "title": T7_TITLE,
                         "description": None, "parents": [SUBJ],
                         "provenanceTier": "RULE_DERIVED", "order": 7}
    for t, order in (("T9", 9), ("T10", 10)):
        cn = next(n for n in cur["nodes"] if n.get("code") == f"{TPRE}-{t}")
        spn[f"{TPRE}-{t}"] = {"code": f"{TPRE}-{t}", "family": "TOPIC", "title": cn["title"],
                              "description": None, "parents": [SUBJ],
                              "provenanceTier": "RULE_DERIVED", "order": order}
    spc["nodes"] = [n for n in spc["nodes"]]  # keep original order; add tails? no — mirror content order
    # mirror the content's node ORDER exactly (DFS law incl. the moved husk)
    spc["nodes"] = []
    sp_by_new = {n["code"]: n for n in sp["curriculum"]["nodes"]} if False else None
    # rebuild: spine node list == content node list shape (same codes, same order)
    content_codes = [n["code"] for n in cur["nodes"]]
    spine_index = {n["code"]: n for n in (list(spn.values()))}
    for code in content_codes:
        spc["nodes"].append(spine_index[code])
    # edges: mirror content's edge array verbatim (same 119 shape)
    spc["edges"] = [dict(e) for e in cur["edges"]]
    mc = sp["meta"]["counts"]
    mc["topics"] = 10
    mc["subtopics"] = 21
    mc["specPoints"] = 88
    mc["parsePool"] = 88
    mc["scopedPool"] = 88
    mc["orphans"] = 0
    sp_out = dump_compact(sp, trailing)
    manifest["partB"].append({"file": str(spath.relative_to(REPO)),
                              "oldSha": sha(sp_raw), "newSha": sha(sp_out),
                              "nodes": 120, "edges": 119, "meta.counts": mc})
    spath.write_text(sp_out, encoding="utf-8")
    print("B-OK spine: 120 nodes / 119 edges / counts 10/21/88")

    # manifest counts sync
    mpath = HUB / f"content/{SLUG_CS}/manifest.json"
    m_raw = mpath.read_text(encoding="utf-8")
    man = json.loads(m_raw)
    if not rtr(m_raw, man, "pretty"):
        fail("manifest round-trip broken")
    man["counts"]["sections"] = 10
    man["counts"]["topics"] = 21
    man["counts"]["specPoints"] = 88
    m_out = dump_pretty(man)
    manifest["partB"].append({"file": str(mpath.relative_to(REPO)),
                              "oldSha": sha(m_raw), "newSha": sha(m_out),
                              "counts": man["counts"]})
    mpath.write_text(m_out, encoding="utf-8")
    print("B-OK manifest counts: sections 10 / topics 21 / specPoints 88")

    # KG regen (now export-compatible) + deep-equal gate
    sys.path.insert(0, str(HUB / "scripts"))
    import kg_export
    reg_data = load(HUB / "content/courses.json")
    registry = {}
    for entry in (reg_data if isinstance(reg_data, list) else reg_data.get("courses", [])):
        if isinstance(entry, dict) and entry.get("slug"):
            registry[entry["slug"]] = entry
    kpath = HUB / f"public/kg/data/{SLUG_CS}.json"
    k_raw = kpath.read_text(encoding="utf-8")
    payload = kg_export.export_course(SLUG_CS, registry)
    cts = payload["meta"]["counts"]
    if cts["nodes"] != 120 or cts["specPoints"] != 88:
        fail(f"KG export counts drift: {cts}")
    k_trailing = k_raw.endswith("\n")
    k_out = dump_compact(payload, k_trailing)
    # G4 deep-equal: rerun and compare ex-generatedUtc
    payload2 = kg_export.export_course(SLUG_CS, registry)
    p1, p2 = json.loads(json.dumps(payload)), json.loads(json.dumps(payload2))
    p1["meta"].pop("generatedUtc", None)
    p2["meta"].pop("generatedUtc", None)
    if json.dumps(p1, sort_keys=True) != json.dumps(p2, sort_keys=True):
        fail("KG deep-equal (ex-generatedUtc) broken")
    manifest["partB"].append({"file": str(kpath.relative_to(REPO)),
                              "oldSha": sha(k_raw), "newSha": sha(k_out),
                              "disposition": "KG-REGEN-OK (exporter-compatible after the revised shape)",
                              "exporter": payload["meta"].get("exporter"),
                              "counts": cts})
    kpath.write_text(k_out, encoding="utf-8")
    print(f"B-OK KG regen: {cts['nodes']} nodes / {cts['edges']} edges / specPoints 88 (deep-equal OK)")

    # proposal map of record (the 21 official points, apply-ready)
    rows4 = ev["evidence_0478"]["rows"]
    proposal = {
        "artifact": "rn11-run-016-topic-level-points-proposal-r0",
        "status": "PROPOSAL-MAP-OF-RECORD (apply-ready pending the exporter's topic-level-point law)",
        "law": "run-009 precedent: title maps are repair-pass work; zero-invention pins in official_evidence_r0.json",
        "blocker": {
            "exporterRefusal": "cie-igcse-computer-science-23: SPEC_POINT 7.1 has 0 SUBTOPIC parents (['cie-igcse-computer-science-2023-2025-T7'])",
            "law": "kg_export v1.6: every SPEC_POINT must hang under exactly one SUBTOPIC; the 106-course fleet is universally "
                   "SUBTOPIC-hung (the apparent precedent igcse-chemistry-19 is dual-parented — its S1-a..i rows are real official "
                   "subsections); the official 0478 T7/T9/T10 carry NO subtopic layer",
            "optionsForTheDesk": [
                "extend kg_export to accept topic-level points (code-change run; the KG graph shape decision is desk territory)",
                "synthetic per-topic SUBTOPIC rows (REJECTED here: curriculum-plane invention — the doc has no such rows)",
            ],
        },
        "points": [],
        "edges": [],
    }
    global_order_hint = 78  # T7's points would insert after T6's 77 (T8's first point shifts +12)
    for tn, code, title in []:
        pass
    inv = []
    for k, prefix in (("T7", "7"), ("T9", "9"), ("T10", "10")):
        for r in rows4[k]:
            n = r["n"]
            if r["letters"]:
                for lt in r["letters"]:
                    title = lt["statement"]
                    if lt["romans"]:
                        title = title + " " + " ".join(f"({rm['roman']}) {rm['text']}" for rm in lt["romans"])
                    inv.append({"code": f"{prefix}.{n}{lt['letter']}", "title": title,
                                "parents": [f"{TPRE}-{k}"]})
            else:
                inv.append({"code": f"{prefix}.{n}", "title": r["statement"],
                            "parents": [f"{TPRE}-{k}"]})
    if len(inv) != 21:
        fail(f"proposal inventory {len(inv)} != 21")
    proposal["points"] = inv
    proposal["edges"] = [{"source": p["parents"][0], "relation": "PART_OF", "target": p["code"]} for p in inv]
    proposal["orderLawIfApplied"] = "global point orders 1..109; T7's 12 points take 78-89; T8's 11 shift +12 (90-100); T9 101-104; T10 105-109"
    (WORK / "rn16_topic_level_points_proposal.json").write_text(
        json.dumps(proposal, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"proposal map -> rn16_topic_level_points_proposal.json (21 points, apply-ready)")

    out = WORK / "rn16_apply_manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"apply manifest -> {out}")


if __name__ == "__main__":
    main()
