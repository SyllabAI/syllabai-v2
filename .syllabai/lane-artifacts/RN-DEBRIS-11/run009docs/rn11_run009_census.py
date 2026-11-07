#!/usr/bin/env python3
"""RN-DEBRIS-11 run-009 — hub-side census of the queued row-label families.

Families of record (ADR-039 §4 queue + r3 queue addition + this pass's sweep):
  F1 cie-igcse-english-language-20        — TS1-TS14 front-matter parse wreck
  F2 cie-igcse-english-language-25        — TS1-TS25 same wreck class (sweep find)
  F3 cie-igcse-religious-studies-23       — 18-topic variant spine (r5 renamed)
  F4 cie-igcse-business-25                — T1 husk (r5 added; parse-drop class)
  F5 cie-{as,a-level}-maths-20-<component> (10) — 9709 component spines (r5 renamed)
  F6 igcse-business-19 (4BS1)             — Edexcel front-matter wreck (sweep find)

Census per family: meta, TOPIC/SUBTOPIC rows (code/title/order), direct SPEC_POINT
children per row, question-set stamps (subtopicCode + gen rows), KG mirror state.
Plus a fleet-wide sweep: every course's row titles tested against the wreck
classes (preposition/carticle-ending fragments, table-header captures,
sentence-fragment shapes, broken SUB_ codes).
"""
import json, os, re, glob

REPO = "/home/z/my-project/work/syllabai-v2"
HUB = f"{REPO}/apps/hub/content"

FAMILIES = {
    "F1_english_language_20": ["cie-igcse-english-language-20"],
    "F2_english_language_25": ["cie-igcse-english-language-25"],
    "F3_religious_studies_23": ["cie-igcse-religious-studies-23"],
    "F4_business_25": ["cie-igcse-business-25"],
    "F5_maths_9709_components": sorted(
        os.path.basename(p) for p in glob.glob(f"{HUB}/cie-*-maths-20-*")
        if "pure" in p or "mechanics" in p or "probability" in p),
    "F6_igcse_business_19": ["igcse-business-19"],
}

FRAG_END = re.compile(
    r"\b(of|and|the|a|an|to|for|with|in|on|by|are|is|from|or)$")
TABLE_HEADERS_EXACT = {"General", "Level Marks Description"}
TABLE_ROW_RE = re.compile(r"^Specific – descriptive|^\d+ \d+[–-]\d+ General$")
FRAG_STARTS = ("(including changes to", "specimen papers)")

def load_json(p):
    with open(p) as f:
        return json.load(f)

def kg_path(slug):
    p = f"{REPO}/apps/hub/public/kg/data/{slug}.json"
    return p if os.path.exists(p) else None

def census_course(slug):
    cur = load_json(f"{HUB}/{slug}/curriculum.json")
    nodes = cur["nodes"]
    kids = {}
    for e in cur.get("edges", []):
        if e.get("relation") == "PART_OF":
            # corpus edge law (run-008 G6 convention): {source: parent, target: child}
            kids.setdefault(e["source"], []).append(e["target"])
    code_by = {n["code"]: n for n in nodes}
    rows = []
    for n in nodes:
        if n["family"] not in ("TOPIC", "SUBTOPIC"):
            continue
        child_codes = kids.get(n["code"], [])
        sp_children = [c for c in child_codes if code_by.get(c, {}).get("family") == "SPEC_POINT"]
        rows.append({
            "code": n["code"], "family": n["family"], "title": n.get("title"),
            "order": n.get("order"),
            "specPointChildren": len(sp_children),
            "childCodes": sorted(child_codes),
        })
    # question stamps
    stamps = {}
    qpath = f"{HUB}/{slug}/questions.json"
    if os.path.exists(qpath):
        q = load_json(qpath)
        if isinstance(q, dict):
            q = q.get("questions") or q.get("sets") or []
        for it in q:
            s = it.get("subtopicCode")
            if s:
                stamps[s] = stamps.get(s, 0) + 1
    # kg mirror
    kg = None
    kp = kg_path(slug)
    kg_state = "absent"
    if kp:
        kg = load_json(kp)
        subs = kg.get("subtopics") or {}
        labels = {}
        if isinstance(subs, dict):
            for sec, pairs in subs.items():
                if isinstance(pairs, list):
                    for pair in pairs:
                        if isinstance(pair, list) and len(pair) >= 2:
                            labels[pair[0]] = pair[1]
        sub_nodes = {n["id"]: n.get("label") for n in kg.get("nodes", []) if n.get("type") == "SubTopic"}
        kg_state = (f"subtopicPairs={len(labels)} subNodes={len(sub_nodes)}")
    meta = {k: cur.get(k) for k in ("board", "level", "subject", "code", "syllabusVersion")}
    fam_counts = {}
    for n in nodes:
        fam_counts[n["family"]] = fam_counts.get(n["family"], 0) + 1
    return {"slug": slug, "meta": meta, "familyCounts": fam_counts,
            "rows": rows, "stamps": stamps, "stampTotal": sum(stamps.values()),
            "kgState": kg_state}

def wreck_hits(title):
    t = (title or "").strip()
    hits = []
    if not t:
        hits.append("empty")
        return hits
    if FRAG_END.search(t.lower()):
        hits.append("fragment-ending")
    if t in TABLE_HEADERS_EXACT or TABLE_ROW_RE.match(t):
        hits.append("table-header-capture")
    if any(t.startswith(fs) for fs in FRAG_STARTS):
        hits.append("sentence-fragment")
    if t.endswith(")"):
        hits.append("paren-tail")   # weak signal, reported but classified later
    return hits

def fleet_sweep():
    """Scan every course's TOPIC/SUBTOPIC titles for wreck-class signatures."""
    out = []
    for cur_dir in sorted(glob.glob(f"{HUB}/*/curriculum.json")):
        slug = cur_dir.split("/")[-2]
        try:
            cur = load_json(cur_dir)
        except Exception:
            continue
        hits = []
        for n in cur["nodes"]:
            if n["family"] not in ("TOPIC", "SUBTOPIC"):
                continue
            w = wreck_hits(n.get("title"))
            # drop the corpus's own honest dedupe/disclosure suffixes (e.g. "(5.2)", "(I4.4)", "(SME section)")
            strong = [h for h in w if h != "paren-tail"]
            if strong:
                hits.append({"code": n["code"], "title": n.get("title"),
                             "family": n["family"], "classes": strong})
        if hits:
            out.append({"slug": slug, "hits": hits})
    return out

def main():
    fam_out = {}
    for fam, slugs in FAMILIES.items():
        fam_out[fam] = [census_course(s) for s in slugs]
    sweep = fleet_sweep()
    out = {"families": fam_out, "fleetSweep": sweep}
    os.makedirs("/tmp/run009", exist_ok=True)
    json.dump(out, open("/tmp/run009/census.json", "w"), indent=1, ensure_ascii=False)

    # printed summary
    for fam, courses in fam_out.items():
        for c in courses:
            print(f"== {fam}: {c['slug']} meta={c['meta']} counts={c['familyCounts']} stamps={c['stampTotal']} kg[{c['kgState']}]")
            for r in c["rows"]:
                if r["family"] == "TOPIC":
                    print(f"   T {r['code']:<52} «{r['title']}» sp={r['specPointChildren']}")
    print("\n=== FLEET SWEEP (wreck-class hits outside the known families) ===")
    known = set()
    for fam, courses in fam_out.items():
        for c in courses:
            known.add(c["slug"])
    for entry in sweep:
        if entry["slug"] in known:
            continue
        print(f"  {entry['slug']}:")
        for h in entry["hits"][:14]:
            print(f"     {h['code']} «{h['title']}» {h['classes']}")
        if len(entry["hits"]) > 14:
            print(f"     ... +{len(entry['hits'])-14} more")

if __name__ == "__main__":
    main()
