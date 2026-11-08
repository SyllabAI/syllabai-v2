#!/usr/bin/env python3
"""RN-DEBRIS-11 run-009 — verification of record + title-map assembly (v2).

Recomputes every claim from the raw evidence (never trusts):
  V1 4BS1 (F6): 25-row title map (+ kg ids); upstream-prefix law.
  V2 9709 (F5): 10 component courses vs official -> discharge-or-not.
  V3 0490 (F3): 85 SUB classes exact / glyph-variant / dedupe-suffix / truncation;
     18 composed topic titles vs official 6.
  V4 0264 (F4): T1 husk vs official; KG-plane staleness (pre-r5) table.
  V5 0500 (F1/F2): per-row capture-class census vs the official 3-block content.
  V6 fleet mirror-equality sweep (the run-008 G6 law) over every course with a
     KG subtopics plane.
"""
import json, re, os
from collections import Counter

REPO = "/home/z/my-project/work/syllabai-v2"
HUB = f"{REPO}/apps/hub/content"
KG = f"{REPO}/apps/hub/public/kg/data"
RUN = "/home/z/my-project/work/run009"

census = json.load(open("/tmp/run009/census.json"))
ev = json.load(open("/tmp/run009/evidence_cie.json"))
ev4 = json.load(open("/tmp/run009/evidence_4bs1.json"))
CTRL = re.compile(r"[\x00-\x1f]")
DEDUPE = re.compile(r"\s*\((\w?\d+\.\d+)\)$")
MARK_SP = re.compile(r"\s+([\u02BE\u02BF])\s*|\s*([\u02BE\u02BF])\s+")

def norm(s):
    s = CTRL.sub("", s or "")
    s = MARK_SP.sub(lambda m: (m.group(1) or m.group(2)), s)
    return re.sub(r"\s+", " ", s).strip()

def cur(slug):
    return json.load(open(f"{HUB}/{slug}/curriculum.json"))

def kg_of(slug):
    p = f"{KG}/{slug}.json"
    return json.load(open(p)) if os.path.exists(p) else None

def subs_by_topic(c_cur):
    kids = {}
    for e in c_cur.get("edges", []):
        if e.get("relation") == "PART_OF":
            # corpus edge law: {source: parent, target: child}
            kids.setdefault(e["source"], []).append(e["target"])
    by_code = {n["code"]: n for n in c_cur["nodes"]}
    out = {}
    for n in c_cur["nodes"]:
        if n["family"] == "TOPIC":
            sec = n["code"].rsplit("T", 1)[-1]
            out[sec] = [by_code[c] for c in kids.get(n["code"], [])
                        if by_code.get(c, {}).get("family") == "SUBTOPIC"]
    return out

def v1_4bs1():
    rows = census["families"]["F6_igcse_business_19"][0]["rows"]
    hub_rows = {r["code"]: r for r in rows if r["family"] == "TOPIC"}
    titles = ev4["titles"]
    kgd = kg_of("igcse-business-19")
    kg_sections = kgd["subtopics"]
    up = json.load(open(f"{RUN}/parsed/igcse-business/topics.json"))["topics"]
    up_by_num = {t["number"]: t["title"] for t in up}
    map_rows, consistent, divergent = [], 0, 0
    order = sorted(titles, key=lambda x: (int(x.split(".")[0]), int(x.split(".")[1])))
    for i, n in enumerate(order, start=1):
        official = titles[n]
        code = f"igcse-business-T{n}"
        old = hub_rows[code]["title"] if code in hub_rows else None
        sec = str(i)
        kg_pair = kg_sections.get(sec, [[None, None]])[0]
        kg_id, kg_label = (kg_pair[0], kg_pair[1]) if kg_pair else (None, None)
        u = up_by_num.get(n)
        ok = (u is not None and (u == official or official.startswith(u)))
        consistent += ok
        divergent += (not ok)
        map_rows.append({"code": code, "kgId": kg_id, "kgLabel": kg_label,
                         "kgLabelEqualsOld": kg_label == old,
                         "old": old, "new": official, "changed": old != official,
                         "composed": False,
                         "source": f"4BS1 spec §{n} left-column title (Issue 2 – February 2026 print)",
                         "upstreamParse": u, "upstreamPrefixConsistent": ok})
    return {"rows": map_rows, "changed": sum(1 for r in map_rows if r["changed"]),
            "kgLabelEqualsOld": sum(1 for r in map_rows if r["kgLabelEqualsOld"]),
            "upstream": {"consistent": consistent, "divergent": divergent}}

def v2_9709():
    official_topics = ev["F5_9709"]["extraction"]["topicShortNames"]
    official_subs = ev["F5_9709"]["extraction"]["subsections"]
    out = []
    for c in census["families"]["F5_maths_9709_components"]:
        c_cur = cur(c["slug"])
        topic = next(n for n in c_cur["nodes"] if n["family"] == "TOPIC")
        tn = re.search(r"T([1-6])$", topic["code"]).group(1)
        sub_ok, sub_bad = 0, []
        for n in c_cur["nodes"]:
            if n["family"] != "SUBTOPIC":
                continue
            m = re.search(r"SUB(\d+)\.(\d+)$", n["code"])
            off = official_subs.get(f"{m.group(1)}.{m.group(2)}")
            if off == n["title"]:
                sub_ok += 1
            else:
                sub_bad.append({"code": n["code"], "hub": n["title"], "official": off})
        out.append({"slug": c["slug"], "topicTitle": topic["title"],
                    "officialTopic": official_topics.get(tn),
                    "topicMatch": topic["title"] == official_topics.get(tn),
                    "subExact": sub_ok, "subMismatch": sub_bad})
    return out

def v3_0490():
    official_subs = ev["F3_0490"]["extraction"]["subsections"]
    official_topics = ev["F3_0490"]["extraction"]["topics"]
    c_cur = cur("cie-igcse-religious-studies-23")
    rows = []
    cls_n = Counter()
    for n in c_cur["nodes"]:
        if n["family"] != "SUBTOPIC":
            continue
        key = n["code"].split(":SUB")[1]
        off = official_subs.get(key)
        t = n["title"]
        if off is not None and off == t:
            k = "exact"
        elif off is not None and norm(off) == norm(t):
            k = "glyph-variant"
        else:
            m = DEDUPE.search(t)
            if m and off is not None and off == DEDUPE.sub("", t):
                k = "dedupe-suffix"
            else:
                k = "truncation"
        cls_n[k] += 1
        rows.append({"code": n["code"], "hub": t, "official": off, "class": k})
    tclass = []
    for n in c_cur["nodes"]:
        if n["family"] != "TOPIC":
            continue
        m = re.match(r"^.*-T([CIJ])([1-6])$", n["code"])
        off = official_topics.get(f"{m.group(1)}{m.group(2)}")
        tclass.append({"code": n["code"], "hub": n["title"], "official": off})
    return {"sub": {"classes": dict(cls_n), "rows": rows},
            "topics": tclass,
            "officialTopicTitles": sorted(set(official_topics.values()))}

def v4_0264():
    e4 = ev["F4_0264"]["extraction"]
    c_cur = cur("cie-igcse-business-25")
    by = {n["code"]: n for n in c_cur["nodes"]}
    t1 = by["cie-igcse-business-2027-2029-T1"]
    subs = [{"code": f"cie-igcse-business-2027-2029-T1:SUB1.{i}",
             "hub": by[f"cie-igcse-business-2027-2029-T1:SUB1.{i}"]["title"],
             "official": e4["subsections"].get(f"1.{i}")} for i in range(1, 6)]
    kgd = kg_of("cie-igcse-business-25")
    kg_arity = {k: len(v) for k, v in (kgd.get("subtopics") or {}).items()}
    cur_arity = {}
    for sec, rows in subs_by_topic(c_cur).items():
        cur_arity[sec] = len(rows)
    sample = []
    for sec, rows in sorted(subs_by_topic(c_cur).items()):
        pairs = (kgd.get("subtopics") or {}).get(sec) or []
        for (kid, label), r in zip(pairs, rows):
            if label != r["title"]:
                sample.append({"kgKey": sec, "kgId": kid, "kgLabel": label,
                               "curriculum": r["title"]})
    return {"t1Title": {"hub": t1["title"], "official": e4["topics"].get("1")},
            "t1PointsOfficial": e4["pointNumbersByTopic"].get("1", []),
            "hubT1SpecPoints": 0, "subs": subs,
            "kgSections": kg_arity, "curriculumTopicArities": cur_arity,
            "kgLabelSamples": sample[:8]}

def v5_0500():
    out = []
    blocks = {"F1": ev["F1_0500_2024"], "F2": ev["F2_0500_2027"]}
    fam_key = {"F1_english_language_20": "F1", "F2_english_language_25": "F2"}
    for fam, courses in census["families"].items():
        if fam not in fam_key:
            continue
        c_cur = cur(courses[0]["slug"])
        rows = []
        for n in c_cur["nodes"]:
            if n["family"] != "TOPIC":
                continue
            t = n["title"]
            cls = []
            if t in ("Why choose this syllabus?", "Syllabus overview"):
                cls.append("front-matter-capture")
            if t == "Level Marks Description" or t == "General" or \
               re.match(r"^\d+ \d+[–-]\d+ General$", t) or t.startswith("Specific – descriptive"):
                cls.append("assessment-table-capture")
            if t.startswith("(including changes to") or t.startswith("specimen papers)"):
                cls.append("sentence-fragment")
            if t in ("Reading", "Writing", "Speaking and Listening"):
                cls.append("official-content-block-name")
            if re.match(r"^(Paper \d|Section [AB]|Component \d)", t):
                cls.append("assessment-structure-row")
            if t == "Language task" or t == "Details of the assessment":
                cls.append("assessment-structure-row")
            rows.append({"code": n["code"], "title": t,
                         "classes": cls or ["unclassified"]})
        out.append({"slug": courses[0]["slug"],
                    "specPoints": courses[0]["familyCounts"]["SPEC_POINT"],
                    "officialBullets": sum(blocks[fam_key[fam]]["blocks"].values()),
                    "officialBlocks": blocks[fam_key[fam]]["blockOrder"],
                    "rows": rows})
    return out

def v6_mirror_sweep():
    """Mirror-equality fleet sweep (the run-008 G6 law, keying-agnostic form):
    the SEQUENCE of KG SubTopic node labels must equal the SEQUENCE of
    curriculum SUBTOPIC titles in topic/edge order (geography-19, repaired and
    G6-green at run-008, is the reference shape)."""
    out = []
    for fn in sorted(os.listdir(KG)):
        if not fn.endswith(".json"):
            continue
        slug = fn[:-5]
        c_path = f"{HUB}/{slug}/curriculum.json"
        if not os.path.exists(c_path):
            continue
        c_cur = cur(slug)
        kgd = kg_of(slug)
        if not (kgd.get("subtopics") or {}):
            continue
        by_code = {n["code"]: n for n in c_cur["nodes"]}
        kids = {}
        for e in c_cur.get("edges", []):
            if e.get("relation") == "PART_OF":
                kids.setdefault(e["source"], []).append(e["target"])
        seq_cur = [by_code[c]["title"]
                   for n in c_cur["nodes"] if n["family"] == "TOPIC"
                   for c in kids.get(n["code"], [])
                   if by_code.get(c, {}).get("family") == "SUBTOPIC"]
        seq_kg = [n.get("label") for n in kgd.get("nodes", []) if n.get("type") == "SubTopic"]
        first_div = None
        if seq_kg == seq_cur:
            status = "equal"
        else:
            status = "divergent"
            for i, (a, b) in enumerate(zip(seq_kg, seq_cur)):
                if a != b:
                    first_div = {"idx": i, "kg": a, "curriculum": b}
                    break
            if first_div is None:
                first_div = {"idx": min(len(seq_kg), len(seq_cur)),
                             "kg_len": len(seq_kg), "curriculum_len": len(seq_cur)}
        out.append({"slug": slug, "status": status, "kgCount": len(seq_kg),
                    "curriculumCount": len(seq_cur), "firstDivergence": first_div})
    drift = [o for o in out if o["status"] == "divergent"]
    return {"courses": out, "driftCourses": drift}

def main():
    r1 = v1_4bs1()
    print(f"V1 4BS1: rows={len(r1['rows'])} changed={r1['changed']}/25 kgLabel==old {r1['kgLabelEqualsOld']}/25; upstream {r1['upstream']}")
    r2 = v2_9709()
    print(f"V2 9709: topics official {sum(r['topicMatch'] for r in r2)}/10; SUB exact {sum(r['subExact'] for r in r2)}/{sum(r['subExact'] + len(r['subMismatch']) for r in r2)}")
    r3 = v3_0490()
    print(f"V3 0490: SUB classes {r3['sub']['classes']}")
    for row in r3["sub"]["rows"]:
        if row["class"] in ("truncation", "glyph-variant"):
            print(f"    {row['class'].upper():13} {row['code'].split(':SUB')[1]:7} hub={row['hub'][:44]!r} off={(row['official'] or '')[:44]!r}")
    r4 = v4_0264()
    print(f"V4 0264: T1 «{r4['t1Title']['hub']}» == official «{r4['t1Title']['official']}»; official points {len(r4['t1PointsOfficial'])} vs hub 0; subs {sum(1 for s in r4['subs'] if s['hub']==s['official'])}/5")
    print(f"    KG plane: sections={r4['kgSections']} curriculum arities={r4['curriculumTopicArities']} label-diff samples={len(r4['kgLabelSamples'])}")
    for s in r4["kgLabelSamples"][:4]:
        print("      KG-DIFF", s)
    r5 = v5_0500()
    for e in r5:
        cnt = Counter(c for row in e["rows"] for c in row["classes"] if c != "unclassified")
        print(f"V5 {e['slug']}: specPoints={e['specPoints']} officialBullets={e['officialBullets']} {dict(cnt)}")
    r6 = v6_mirror_sweep()
    print(f"V6 mirror sweep: {len(r6['courses'])} courses with KG planes; drift courses: {len(r6['driftCourses'])}")
    for d in r6["driftCourses"]:
        fd = d["firstDivergence"]
        print(f"    DRIFT {d['slug']} kg={d['kgCount']} cur={d['curriculumCount']} first_div={fd}")
    json.dump({"V1_4bs1": r1, "V2_9709": r2, "V3_0490": r3, "V4_0264": r4,
               "V5_0500": r5, "V6_mirror_sweep": r6},
              open("/tmp/run009/verification.json", "w"), indent=1, ensure_ascii=False)
    print("\nwrote /tmp/run009/verification.json")

if __name__ == "__main__":
    main()
