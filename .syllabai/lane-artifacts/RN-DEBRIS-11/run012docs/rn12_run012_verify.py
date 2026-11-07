#!/usr/bin/env python3
"""RN-DEBRIS-11 run-012 — the independent verification battery.

Re-derives every gate from the tree content + origin/main (base 1533294d ==
origin/lane run-011 tip; el20/el25/ict-21 planes are byte-identical between
origin/main and the base — asserted in G0) and never trusts the executor's
censuses as their own input.
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
BASE = "1533294d"
ART = REPO / ".syllabai" / "lane-artifacts" / "RN-DEBRIS-11"

results = []


def check(cid, fn):
    try:
        detail = fn()
        results.append({"id": cid, "pass": True, "detail": detail})
        print(f"{cid} PASS: {detail}")
    except AssertionError as exc:
        results.append({"id": cid, "pass": False, "detail": str(exc)})
        print(f"{cid} FAIL: {exc}")


def require(cond, msg):
    if not cond:
        raise AssertionError(msg)


def base_bytes(path):
    return subprocess.run(["git", "-C", str(REPO), "show", f"{BASE}:{path}"],
                          capture_output=True, check=True).stdout


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


COURSES = {
    "cie-igcse-english-language-20": {
        "vintage": "2024-2026", "fam": "F1_0500_2024",
        "blocks": {"Reading": [f"S2.0{i:02d}" for i in range(7, 13)],
                   "Writing": [f"S3.00{i}" for i in range(1, 7)],
                   "Speaking and Listening": [f"S4.00{i}" for i in range(1, 7)]},
    },
    "cie-igcse-english-language-25": {
        "vintage": "2027-2029", "fam": "F2_0500_2027",
        "blocks": {"Reading": [f"S2.0{i:02d}" for i in range(7, 13)],
                   "Writing": [f"S2.0{i:02d}" for i in range(13, 19)],
                   "Speaking and Listening": [f"S2.0{i:02d}" for i in range(19, 25)]},
    },
}
B25 = "cie-igcse-business-25"
ICT21 = "cie-igcse-ict-21"

DECLARED_MODIFIED = {
    f"apps/hub/content/{B25}/questions.json",
    f"apps/hub/content/{B25}/manifest.json",
    "apps/hub/public/kg/data/cie-igcse-ict-21.json",
    "apps/hub/content/cie-igcse-english-language-20/curriculum.json",
    "apps/hub/content/cie-igcse-english-language-20/notes.json",
    "apps/hub/content/cie-igcse-english-language-20/questions.json",
    "apps/hub/content/cie-igcse-english-language-20/manifest.json",
    "apps/hub/content/cie-igcse-english-language-25/curriculum.json",
    "apps/hub/content/cie-igcse-english-language-25/questions.json",
    "apps/hub/content/cie-igcse-english-language-25/manifest.json",
    "apps/hub/public/kg/data/cie-igcse-english-language-20.json",
    "apps/hub/public/kg/data/cie-igcse-english-language-25.json",
    "apps/hub/public/kg/data/index.json",
}


def g0():
    st = subprocess.run(["git", "-C", str(REPO), "status", "--short"],
                        capture_output=True, check=True).stdout.decode()
    modified, untracked = set(), set()
    for line in st.splitlines():
        code, path = line[:2], line[3:].strip('"')
        if code.strip() in ("M", "A"):
            modified.add(path)
        elif code.strip() == "??":
            untracked.add(path)
    require(modified == DECLARED_MODIFIED,
            f"modified set drift: extra={sorted(modified - DECLARED_MODIFIED)[:3]} "
            f"missing={sorted(DECLARED_MODIFIED - modified)[:3]}")
    allowed_prefixes = (".syllabai/lane-artifacts/RN-DEBRIS-11/",)
    bad = [u for u in untracked if not u.startswith(allowed_prefixes)]
    require(not bad, f"untracked outside lane artifacts: {bad[:4]}")
    # base identity: the three streams' untouched planes byte-equal origin/main
    for path in [f"apps/hub/content/{B25}/curriculum.json",
                 f"apps/hub/content/{ICT21}/curriculum.json",
                 "apps/hub/content/cie-igcse-english-language-20/prerequisites.json",
                 "apps/hub/content/cie-igcse-english-language-25/prerequisites.json"]:
        cur = Path(REPO / path).read_bytes()
        require(cur == base_bytes(path), f"{path} drifted vs origin/main")
    return f"13 declared files + {len(untracked)} lane artifacts; base planes == origin/main"


def g1():
    n = 0
    for rel in DECLARED_MODIFIED:
        raw = (REPO / rel).read_bytes()
        if rel.endswith("index.json") or ("/kg/data/" in rel and rel != "index.json"):
            rt = json.dumps(json.loads(raw), ensure_ascii=False,
                            separators=(",", ":")).encode()
        else:
            rt = dump_indent(json.loads(raw))
        require(rt == raw, f"{rel} round-trip drift")
        n += 1
    return f"{n} written files round-trip byte-exact (indent=1+NL; KG/index compact)"


def g2_titles():
    ev = load(ART / "run012_official_evidence.json")
    kept = retitled = 0
    for slug, spec in COURSES.items():
        cur = load(CONTENT / slug / "curriculum.json")
        pts = {n["code"]: n for n in cur["nodes"] if n["family"] == "SPEC_POINT"}
        base_pts = {n["code"]: n for n in json.loads(base_bytes(
            f"apps/hub/content/{slug}/curriculum.json"))["nodes"]
            if n["family"] == "SPEC_POINT"}
        for blk, codes in spec["blocks"].items():
            bullets = ev[spec["fam"]]["bullets"][blk]
            for code, bullet in zip(codes, bullets):
                require(code in pts, f"{slug}: survivor {code} missing")
                require(pts[code]["title"] == bullet,
                        f"{slug}: {code} title != official bullet")
                if base_pts[code]["title"] == bullet:
                    require(base_pts[code]["title"] == pts[code]["title"] ==
                            bullet, f"{slug}: {code} kept-title byte law")
                    kept += 1
                else:
                    require(base_pts[code]["title"].startswith(bullet),
                            f"{slug}: {code} base title not bullet-prefixed")
                    retitled += 1
    require((kept, retitled) == (30, 6), f"kept/retitled drift {kept}/{retitled}")
    return f"36 survivor titles == official bullets byte-form (30 kept byte-exact, 6 retitled)"


def g2_b25_tags():
    base_q = json.loads(base_bytes(f"apps/hub/content/{B25}/questions.json"))
    cur_q = json.loads((CONTENT / B25 / "questions.json").read_text())
    spine = {n["code"] for n in load(CONTENT / B25 / "curriculum.json")["nodes"]
             if n["family"] == "SPEC_POINT"}
    t1 = {"1.1.1", "1.2.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.4.1",
          "1.5.1", "1.5.2"}
    writes, tb_sets = 0, 0
    for so, sn in zip(base_q, cur_q):
        require(so.get("slug") == sn.get("slug"), "set order drift")
        set_touched = False
        for qo, qn in zip(so.get("questions") or [], sn.get("questions") or []):
            for po, pn in zip(qo.get("parts") or [], qn.get("parts") or []):
                for k in set(po) | set(pn):
                    if po.get(k) != pn.get(k):
                        require(k == "specPointCodes",
                                f"{so.get('slug')}/{pn.get('id')}: field {k} touched")
                if pn.get("specPointCodes") != po.get("specPointCodes"):
                    require(pn.get("specPointCodes") and not po.get("specPointCodes"),
                            f"{so.get('slug')}: non-additive code write")
                    for c in pn["specPointCodes"]:
                        require(c in spine and c in t1,
                                f"{so.get('slug')}: code {c} outside T1/spine")
                    require(po.get("specPointIds") == pn.get("specPointIds"),
                            "specPointIds drifted")
                    writes += 1
                    set_touched = True
        if ((sn.get("source") or {}).get("tagBackfill") !=
                (so.get("source") or {}).get("tagBackfill")):
            tb_sets += 1
            require(set_touched, f"{so.get('slug')}: provenance without writes")
    require(writes == 71 and tb_sets == 4, f"writes {writes}/tb {tb_sets} != 71/4")
    # engine method string byte-law on the manifest block
    man = load(CONTENT / B25 / "manifest.json")
    blk = man["tagBackfill"]
    require(blk["source"]["ref"] == "main@4e3a1c6843b0", "pin drift")
    require(blk["method"] == (
        "part smeSpecPointIds → SME spec-point-index name → official "
        "SPEC_POINT title (exact, per part); else the part's SME "
        "subtopic slugs resolved to curriculum subtopics (per part); "
        "else set-level fallback via SME topic-name title join to a "
        "unique curriculum SUBTOPIC"), "method string drift")
    require((blk["sets"], blk["questions"], blk["partsExact"],
             blk["partsPerPartSme"], blk["partsSubtopicLevel"],
             blk["residualSets"]) == (4, 71, 0, 0, 71, 1), "block stats drift")
    return f"71 part writes all in-spine T1; 4 provenance blocks; engine method/pin/stats byte-law"


def g3_structure():
    out = []
    for slug, spec in COURSES.items():
        cur = load(CONTENT / slug / "curriculum.json")
        nodes, edges = cur["nodes"], cur["edges"]
        require(len(nodes) == 25 and len(edges) == 24,
                f"{slug}: {len(nodes)}n/{len(edges)}e != 25/24")
        fams = collections.Counter(n["family"] for n in nodes)
        require(fams == {"SUBJECT": 1, "TOPIC": 3, "SUBTOPIC": 3,
                         "SPEC_POINT": 18}, f"{slug}: families {dict(fams)}")
        subs = [n for n in nodes if n["family"] == "SUBTOPIC"]
        pts = [n for n in nodes if n["family"] == "SPEC_POINT"]
        require([t["order"] for t in nodes if t["family"] == "TOPIC"] == [1, 2, 3],
                f"{slug}: topic orders != 1..3")
        require(all(s["order"] == 1 for s in subs), f"{slug}: sub orders != 1")
        require([p["order"] for p in pts] == list(range(1, 19)),
                f"{slug}: point orders != 1..18")
        # parents <-> edges mirror
        edge_set = {(e["source"], e["target"]) for e in edges}
        require(len(edge_set) == 24, f"{slug}: duplicate edges")
        for n in nodes[1:]:
            for par in n["parents"]:
                require((par, n["code"]) in edge_set,
                        f"{slug}: parents edge missing {par}->{n['code']}")
        for e in edges:
            src = next(x for x in nodes if x["code"] == e["source"])
            tgt = next(x for x in nodes if x["code"] == e["target"])
            require(e["source"] in (tgt.get("parents") or []),
                    f"{slug}: edge {e['source']}->{e['target']} not mirrored in parents")
        # DFS array order: SUBJECT, then per block T, SUB, 6 points
        seq = [n["family"] for n in nodes]
        require(seq == ["SUBJECT"] + ["TOPIC", "SUBTOPIC"] + ["SPEC_POINT"] * 6
                + ["TOPIC", "SUBTOPIC"] + ["SPEC_POINT"] * 6
                + ["TOPIC", "SUBTOPIC"] + ["SPEC_POINT"] * 6,
                f"{slug}: DFS array order drift")
        require(nodes[1]["title"] == "Reading" and nodes[2]["title"] == "Reading",
                f"{slug}: block 1 is not Reading")
        require(nodes[1]["code"].endswith("-T1") and nodes[2]["code"].endswith("-T1:SUB1.1"),
                f"{slug}: block 1 codes drift")
        out.append(f"{slug.split('-')[-1]} 25n/24e/1..18 orders/mirror/DFS")
    return "; ".join(out)


def g4_kg():
    sys.path.insert(0, str(HUB / "scripts"))
    import kg_export  # noqa
    reg = registry()
    out = []
    written = {"cie-igcse-ict-21.json", "cie-igcse-english-language-20.json",
               "cie-igcse-english-language-25.json", "index.json"}
    for f in sorted(KG.glob("*.json")):
        if f.name not in written:
            base = base_bytes(f"apps/hub/public/kg/data/{f.name}")
            require(f.read_bytes() == base, f"sibling KG {f.name} drifted")
    for slug in [ICT21, "cie-igcse-english-language-20",
                 "cie-igcse-english-language-25"]:
        raw = (KG / f"{slug}.json").read_bytes()
        payload = json.loads(raw)
        fresh = kg_export.export_course(slug, reg)
        served_meta = payload["meta"]
        payload_nm = json.loads(json.dumps({k: v for k, v in payload.items() if k != "meta"}))
        fresh_nm = json.loads(json.dumps({k: v for k, v in fresh.items() if k != "meta"}))
        require(payload_nm == fresh_nm, f"{slug}: KG recompute deep-equal drift")
        require(served_meta["counts"]["nodes"] == len(payload["nodes"]),
                f"{slug}: meta/node count drift")
        if slug == ICT21:
            labels = [n["label"] for n in payload["nodes"] if n["id"] == "5a"]
            require(labels == ["Communication applications"],
                    f"ict-21 5a label law: {labels}")
            pairs = [lbl for defs in payload["subtopics"].values() for _, lbl in defs]
            require("Communication applications" in pairs and "Communication" not in pairs,
                    "ict-21 pair label law")
            out.append(f"ict-21 5a 'Communication applications' + recompute deep-equal")
        else:
            idx = json.loads((KG / "index.json").read_bytes())
            row = next(r for r in idx["courses"] if r["slug"] == slug)
            require(row["counts"] == {"nodes": 25,
                                      "edges": served_meta["counts"]["edges"],
                                      "specPoints": 18}, f"{slug}: index row drift")
            out.append(f"{slug.split('-')[-1]} KG 25n deep-equal + index row")
    return "; ".join(out)


def g5_manifest():
    out = []
    for slug in ["cie-igcse-english-language-20", "cie-igcse-english-language-25"]:
        man = load(CONTENT / slug / "manifest.json")
        c = man["counts"]
        require((c["sections"], c["topics"], c["specPoints"]) == (3, 3, 18),
                f"{slug}: counts {c}")
        base_man = json.loads(base_bytes(f"apps/hub/content/{slug}/manifest.json"))
        bc = base_man["counts"]
        for k, v in c.items():
            if k in ("sections", "topics", "specPoints"):
                continue
            require(bc.get(k) == v, f"{slug}: count {k} drifted {bc.get(k)} vs {v}")
        require(base_man["importSource"] == man["importSource"],
                f"{slug}: importSource vintage block drifted")
        out.append(f"{slug.split('-')[-1]} 3/3/18 + vintage block intact")
    return "; ".join(out)


def g6_migration():
    out = []
    # el20 notes retraction
    base_notes = json.loads(base_bytes(
        "apps/hub/content/cie-igcse-english-language-20/notes.json"))
    cur_notes = json.loads((CONTENT / "cie-igcse-english-language-20/"
                            "notes.json").read_text())
    surv = set(sum(COURSES["cie-igcse-english-language-20"]["blocks"].values(), []))
    field_writes = 0
    for bo, cn in zip(base_notes, cur_notes):
        require(bo.get("noteId") == cn.get("noteId"), "note order drift")
        for k in set(bo) | set(cn):
            if k in ("specPointIds", "specPointCodes"):
                dead_dropped = [c for c in bo.get(k) or [] if c not in surv]
                require(cn.get(k) == [c for c in (bo.get(k) or []) if c in surv],
                        f"note {cn.get('noteId')} field {k} migration drift")
                if dead_dropped:
                    field_writes += 1
            else:
                require(bo.get(k) == cn.get(k),
                        f"note {cn.get('noteId')} field {k} touched")
        require((bo.get("smeSpecPointIds") or []) == (cn.get("smeSpecPointIds") or []),
                "sme anchors drifted")
    require(field_writes == 42, f"note field-writes {field_writes} != 42")
    out.append(f"el20 notes 42 field-writes, survivors kept, sme intact")
    # el25 S22 part retraction + stamps
    base_q = json.loads(base_bytes(
        "apps/hub/content/cie-igcse-english-language-25/questions.json"))
    cur_q = json.loads((CONTENT / "cie-igcse-english-language-25/"
                        "questions.json").read_text())
    surv25 = set(sum(COURSES["cie-igcse-english-language-25"]["blocks"].values(), []))
    parts_retracted = 0
    for bo, cn in zip(base_q, cur_q):
        require(bo.get("slug") == cn.get("slug"), "set order drift")
        for k in set(bo) | set(cn):
            if k == "questions":
                continue
            if k == "subtopicCode":
                if bo.get(k) != cn.get(k):
                    require(cn.get(k) in
                            ("cie-igcse-english-language-2027-2029-T1-gen",
                             "cie-igcse-english-language-2027-2029-T2-gen"),
                            f"stamp law: {cn.get(k)}")
            else:
                require(bo.get(k) == cn.get(k),
                        f"set {bo.get('slug')} field {k} touched")
        for qo, qn in zip(bo.get("questions") or [], cn.get("questions") or []):
            for po, pn in zip(qo.get("parts") or [], qn.get("parts") or []):
                for k in set(po) | set(pn):
                    if k in ("specPointIds", "specPointCodes"):
                        require(pn.get(k) == [c for c in (po.get(k) or [])
                                              if c in surv25],
                                f"part {pn.get('id')} field {k} drift")
                        if [c for c in (po.get(k) or []) if c not in surv25]:
                            parts_retracted += 1
    require(parts_retracted == 7, f"el25 part retracts {parts_retracted} != 7")
    out.append("el25 7 part retracts + 4 stamps T1-gen")
    # el20 stamps + residual re-home
    q20 = json.loads((CONTENT / "cie-igcse-english-language-20/"
                      "questions.json").read_text())
    stamps20 = sorted(s.get("subtopicCode") for s in q20 if s.get("subtopicCode"))
    require(stamps20 == ["cie-igcse-english-language-2024-2026-T1-gen",
                         "cie-igcse-english-language-2024-2026-T2-gen",
                         "cie-igcse-english-language-2024-2026-T2-gen"],
            f"el20 stamps {stamps20}")
    out.append("el20 stamps T1-gen + 2x T2-gen")
    return "; ".join(out)


def g6_placement():
    import re
    post = subprocess.run(["bun", "scripts/verify_sme_wire_r0.ts"],
                          cwd=str(HUB), capture_output=True, check=True).stdout.decode()
    pre = subprocess.run(["bun", "scripts/verify_sme_wire_r0.ts"],
                         cwd="/home/z/my-project/work/rn12-pre-wt/apps/hub",
                         capture_output=True, check=True).stdout.decode()
    def totals(txt):
        return {k: v for k, v in re.findall(r"(courses|sets|questions|placed|unplaced): (\d+)", txt)}
    pt, pr = totals(post), totals(pre)
    require(pt == pr == {"courses": "90", "sets": "2574", "questions": "43232",
                         "placed": "2574", "unplaced": "0"},
            f"fleet totals drift post={pt} pre={pr}")
    gp = subprocess.run(["bun",
                         str(ART / "run012docs" / "rn12_gen_census.ts")],
                        cwd=str(HUB), capture_output=True, check=True).stdout.decode()
    gq = subprocess.run(["bun",
                         str(ART / "run012docs" / "rn12_gen_census.ts")],
                        cwd="/home/z/my-project/work/rn12-pre-wt/apps/hub",
                        env={**dict(__import__("os").environ),
                             "RN12_CONTENT": "/home/z/my-project/work/rn12-pre-wt/apps/hub/content"},
                        capture_output=True, check=True).stdout.decode()
    pre_rows = gq.strip().splitlines()[1:]
    post_rows = gp.strip().splitlines()[1:]
    delta = set(pre_rows) ^ set(post_rows)
    require(len(pre_rows) == 31 and len(post_rows) == 30,
            f"gen-row placements {len(pre_rows)}->{len(post_rows)} != 31->30")
    require(delta == {"   cie-igcse-english-language-20 | paper-1-reading--"
                      "november-2023-050011-reading -> cie-igcse-english-language"
                      "-2024-2026-TP1-gen"},
            f"gen-row A/B delta beyond the declared re-home: {delta}")
    return (f"fleet 90/2,574/43,232, placed 2,574 unplaced 0 (pre==post); "
            f"gen-rows 31->30 = exactly the paper-1-reading declared-stamp upgrade")


def g7_index():
    raw = (KG / "index.json").read_bytes()
    idx = json.loads(raw)
    base_idx = json.loads(base_bytes("apps/hub/public/kg/data/index.json"))
    changed, ict21_equal = 0, None
    for co, cb in zip(idx["courses"], base_idx["courses"]):
        require(co["slug"] == cb["slug"], "index order drift")
        if co != cb:
            changed += 1
            require(co["slug"] in ("cie-igcse-english-language-20",
                                   "cie-igcse-english-language-25"),
                    f"unexpected index row change {co['slug']}")
        if co["slug"] == ICT21:
            ict21_equal = co == cb
    require(changed == 2, f"index changed rows {changed} != 2")
    require(ict21_equal is True,
            "ict-21 index row must stay byte-equal (counts unchanged 163/257/95)")
    return "index.json: exactly 2 rows changed (el20/el25 25n/36e|39e/18sp); ict-21 row byte-equal"


def g8_titles():
    out = []
    for slug, spec in COURSES.items():
        cur = load(CONTENT / slug / "curriculum.json")
        tops = [n["title"] for n in cur["nodes"] if n["family"] == "TOPIC"]
        require(len(set(tops)) == 3 and set(tops) == set(spec["blocks"]),
                f"{slug}: topic titles {tops}")
        for blk, codes in spec["blocks"].items():
            titles = [n["title"] for n in cur["nodes"] if n["code"] in set(codes)]
            require(len(titles) == 6 and len(set(titles)) == 6,
                    f"{slug}: block {blk} title collision {titles}")
        out.append(f"{slug.split('-')[-1]} per-block 6/6 distinct + 3 blocks")
    return "; ".join(out)


if __name__ == "__main__":
    check("G0", g0)
    check("G1", g1)
    check("G2a", g2_titles)
    check("G2b", g2_b25_tags)
    check("G3", g3_structure)
    check("G4", g4_kg)
    check("G5", g5_manifest)
    check("G6a", g6_migration)
    check("G6b", g6_placement)
    check("G7", g7_index)
    check("G8", g8_titles)
    fails = [r for r in results if not r["pass"]]
    (ART / "run012_gates.json").write_text(json.dumps(results, indent=1))
    print(f"\nBATTERY: {len(results) - len(fails)}/{len(results)} PASS "
          f"-> run012_gates.json")
    sys.exit(1 if fails else 0)
