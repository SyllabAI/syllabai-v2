#!/usr/bin/env python3
"""RN-DEBRIS-11 run-008 — the geography repair: igcse-geography-19 (4GE1) spine
row-label restoration, content plane + KG mirror.

Defect of record (ADR-039 r3 queue addition, disclosed in T-SMEWIRE-R3 receipts):
"igcse-geography-19 (4GE1) spine sub-topic titles are sentence fragments … and
T3 mis-parents a SUB1.4 node — the Edexcel front-matter parse wreck … the row
labels are the queued defect."

Evidence of record:
  * Official Pearson Edexcel International GCSE Geography (4GE1) specification,
    Issue 4 – February 2026, pinned upstream at
    syllabai-resources Official-Specifications/igcse-geography/
    9781446958360-int-gcse-geog-issue-3.pdf
      sha256 a5ff19bd10182ce739b3f2eae6e94ab543ea3df31b418def965d184ad245aa0f
      sha1   fa6a75d1197e23a8c6f75a54d9d7e04e3a408718  == upstream parsed
             spec_points.json source.pdf_sha1 pin (verified byte-exact).
  * Every key-idea title below is the coordinate-exact extraction of the PDF's
    own "Key ideas" left column (scripts/geo_repair_extract_titles.py,
    pdftotext -bbox-layout word geometry), char-exact including the
    typographic apostrophes and en dashes.
  * Cross-validation: the upstream parsed spec_points.json subsection titles
    (issue 4, same PDF pin) agree byte-exactly with this map wherever upstream
    captured a full title (1.2, 2.1, 3.2 measured).

Row-label law (ADR-039 §4 + ICT-21 row-15 precedent): official headings only;
composed parentheticals follow the corpus's established disclosure-suffix
pattern ("(SME section)" rows) and are flagged in the map.
"""
import json, hashlib, sys

CUR = "apps/hub/content/igcse-geography-19/curriculum.json"
KG  = "apps/hub/public/kg/data/igcse-geography-19.json"

PDF_SHA256 = "a5ff19bd10182ce739b3f2eae6e94ab543ea3df31b418def965d184ad245aa0f"

# code -> (new_title, source, composed?)
TITLE_MAP = {
    "igcse-geography-T1:SUB1.1": ("The world\u2019s water supply is contained in a closed system \u2013 the hydrological cycle", "PDF key idea 1.1 (Topic 1, PDF p15)", False),
    "igcse-geography-T1:SUB1.2": ("Physical processes give rise to characteristic river landforms", "PDF key idea 1.2 (Topic 1, PDF p15)", False),
    "igcse-geography-T1:SUB1.3": ("River environments are of great importance to people and need to be sustainably managed", "PDF key idea 1.3 (Topic 1, PDF p15)", False),
    "igcse-geography-T2:SUB2.1": ("Physical processes and human intervention give rise to characteristic coastal landforms", "PDF key idea 2.1 (Topic 2, PDF p16)", False),
    "igcse-geography-T2:SUB2.2": ("Distinctive ecosystems develop along particular stretches of coastline", "PDF key idea 2.2 (Topic 2, PDF p16)", False),
    "igcse-geography-T2:SUB2.3": ("Coastal environments are of great importance to people and need to be sustainably managed", "PDF key idea 2.3 (Topic 2, PDF p16)", False),
    "igcse-geography-T3:SUB1.4": ("Assessment of fieldwork skills \u2013 Section B (Paper 1)", "PDF \u00a71.4 heading (p18) + body \u201cFieldwork is assessed in Section B of Paper 1\u201d", True),
    "igcse-geography-T3:SUB2.1": ("Description (Paper 2)", "PDF \u00a72.1 heading \u201cDescription\u201d (p22), Paper 2 section", True),
    "igcse-geography-T3:SUB3.1": ("Some places are more hazardous than others", "PDF key idea 3.1 (Topic 3, PDF p17)", False),
    "igcse-geography-T3:SUB3.2": ("Hazards have an impact on people and the environment", "PDF key idea 3.2 (Topic 3, PDF p17)", False),
    "igcse-geography-T3:SUB3.3": ("Earthquakes present a hazard to many people and need to be managed carefully", "PDF key idea 3.3 (Topic 3, PDF p17)", False),
    "igcse-geography-T4:SUB4.1": ("The relative importance of different economic sectors and the location of economic activity varies spatially, and changes over time", "PDF key idea 4.1 (Topic 4, PDF p24)", False),
    "igcse-geography-T4:SUB4.2": ("The growth and decline of different economic sectors has resulted in a range of impacts and possible resource issues", "PDF key idea 4.2 (Topic 4, PDF p24)", False),
    "igcse-geography-T4:SUB4.3": ("Countries increasingly experience an energy gap and therefore seek energy security by developing a balanced energy mix and sustainable energy use", "PDF key idea 4.3 (Topic 4, PDF p24-25)", False),
    "igcse-geography-T5:SUB5.1": ("Rural environments are natural ecosystems that are exploited by human activities", "PDF key idea 5.1 (Topic 5, PDF p26)", False),
    "igcse-geography-T5:SUB5.2": ("Rural environments have contrasting physical, social and economic characteristics and are experiencing significant changes", "PDF key idea 5.2 (Topic 5, PDF p26-27)", False),
    "igcse-geography-T5:SUB5.3": ("Rural environments need to adapt to be socially, economically and environmentally sustainable", "PDF key idea 5.3 (Topic 5, PDF p26-27)", False),
    "igcse-geography-T6:SUB2.4": ("Assessment of fieldwork skills \u2013 Section B (Paper 2)", "PDF \u00a72.4 heading (p29) + body \u201cFieldwork is assessed in Section B of Paper 2\u201d", True),
    "igcse-geography-T6:SUB6.1": ("A growing percentage of the world\u2019s population lives in urban areas", "PDF key idea 6.1 (Topic 6, PDF p28)", False),
    "igcse-geography-T6:SUB6.2": ("Cities face a range of social and environmental challenges resulting from rapid growth and resource demands", "PDF key idea 6.2 (Topic 6, PDF p28)", False),
    "igcse-geography-T6:SUB6.3": ("Different strategies can be used to manage social, economic and environmental challenges in a sustainable manner", "PDF key idea 6.3 (Topic 6, PDF p28)", False),
    "igcse-geography-T7:SUB7.1": ("Fragile environments are under threat from desertification, deforestation and global climate change", "PDF key idea 7.1 (Topic 7, PDF p34)", False),
    "igcse-geography-T7:SUB7.2": ("There are various impacts of desertification, deforestation and climate change on fragile environments", "PDF key idea 7.2 (Topic 7, PDF p34)", False),
    "igcse-geography-T7:SUB7.3": ("The responses to desertification, deforestation and climate change vary depending on a country\u2019s level of development", "PDF key idea 7.3 (Topic 7, PDF p34)", False),
    "igcse-geography-T8:SUB8.1": ("Globalisation is creating a more connected world, with increased movements of goods (trade) and people (migration and tourism) worldwide", "PDF key idea 8.1 (Topic 8, PDF p35)", False),
    "igcse-geography-T8:SUB8.2": ("The impacts of globalisation vary on a global scale", "PDF key idea 8.2 (Topic 8, PDF p35)", False),
    "igcse-geography-T8:SUB8.3": ("The responses to increased migration and tourism vary depending on a country\u2019s level of development", "PDF key idea 8.3 (Topic 8, PDF p35)", False),
    "igcse-geography-T9:SUB_":   ("Geographical skills and transferable skills (appendices)", "composed from PDF Appendix 4 \u201cGeographical skills\u201d (p44) + Appendix 8 \u201cTransferable skills\u201d (p50) headings; block's 72 children map to the specification's appendix family (Appendix 4 Geographical skills / Appendix 5 Practical geographical enquiry process / Appendix 6 Fieldwork requirements / Appendix 7 Health and safety in the field / Appendix 8 Transferable skills) plus two assessment-objective descriptor rows S9.082-083 == the AO2/AO3 wordings; the composed title names the two largest families and the receipt discloses the full child mapping", True),
    "igcse-geography-T9:SUB9.1": ("Definitions of development and human welfare vary, as do attempts to measure it", "PDF key idea 9.1 (Topic 9, PDF p36)", False),
    "igcse-geography-T9:SUB9.2": ("The level of development and human welfare varies globally and has had a range of consequences", "PDF key idea 9.2 (Topic 9, PDF p36)", False),
    "igcse-geography-T9:SUB9.3": ("A range of sustainable strategies is required to address uneven levels of development and human welfare", "PDF key idea 9.3 (Topic 9, PDF p36)", False),
}

def ser(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

def main():
    cur_raw = open(CUR, "rb").read()
    kg_raw = open(KG, "rb").read()

    # G1 serializer round-trip byte-exactness on the ORIGINAL bytes
    cur = json.loads(cur_raw)
    kg = json.loads(kg_raw)
    assert ser(cur) == cur_raw, "G1 FAIL: curriculum round-trip not byte-exact"
    assert ser(kg) == kg_raw, "G1 FAIL: kg round-trip not byte-exact"
    print("G1 serializer round-trip byte-exact: OK")

    # pre-census: the 31 rows must exist with family SUBTOPIC; KG labels must
    # equal curriculum titles row-for-row (mirror-identity proof, no guessing)
    by_code = {n["code"]: n for n in cur["nodes"]}
    pre = {}
    for code, (new, src, composed) in TITLE_MAP.items():
        n = by_code.get(code)
        assert n is not None and n.get("family") == "SUBTOPIC", f"missing SUBTOPIC {code}"
        pre[code] = n["title"]
    kg_subtopics = kg["subtopics"]            # section -> [[id, label], ...]
    kg_nodes = {n["id"]: n for n in kg["nodes"] if n.get("type") == "SubTopic"}
    assert len(kg_nodes) == 31, f"kg SubTopic nodes {len(kg_nodes)} != 31"
    # build the order-derived KG id map and VERIFY it by label equality
    kids = {}
    for e in cur["edges"]:
        if e.get("relation") == "PART_OF":
            kids.setdefault(e["source"], []).append(e["target"])
    id_map = {}                                # curriculum code -> kg id
    for sec_node in [n for n in cur["nodes"] if n.get("family") == "TOPIC"]:
        sec = sec_node["code"].rsplit("T", 1)[-1]
        subs = [c for c in kids.get(sec_node["code"], []) if by_code[c]["family"] == "SUBTOPIC"]
        letters = kg_subtopics.get(sec)
        assert letters is not None and len(letters) == len(subs), f"KG/curriculum arity mismatch section {sec}"
        for (kid, klabel), code in zip(letters, subs):
            assert klabel == by_code[code]["title"], f"KG label mismatch {kid} vs {code}"
            assert kid in kg_nodes, f"kg node missing {kid}"
            id_map[code] = kid
    assert len(id_map) == 31
    print("KG/curriculum mirror identity verified by label equality: 31/31")

    # apply the title edits
    changed_cur = []
    for code, (new, src, composed) in TITLE_MAP.items():
        n = by_code[code]
        if n["title"] != new:
            n["title"] = new
            changed_cur.append(code)
    assert len(changed_cur) == 31, f"curriculum edits {len(changed_cur)} != 31"
    changed_kg_labels = 0
    for code, kid in id_map.items():
        new = TITLE_MAP[code][0]
        if kg_nodes[kid]["label"] != new:
            kg_nodes[kid]["label"] = new
            changed_kg_labels += 1
    st_changed = 0
    for sec, rows in kg_subtopics.items():
        for row in rows:
            code = next(c for c, k in id_map.items() if k == row[0])
            if row[1] != TITLE_MAP[code][0]:
                row[1] = TITLE_MAP[code][0]
                st_changed += 1
    assert changed_kg_labels == 31 and st_changed == 31, (changed_kg_labels, st_changed)
    print("applied: 31 curriculum titles, 31 kg node labels, 31 kg subtopics labels")

    # G7 uniqueness of the new titles
    titles = [by_code[c]["title"] for c in TITLE_MAP]
    assert len(set(titles)) == 31, "G7 FAIL: repaired titles not unique"
    print("G7 post-repair title uniqueness (31/31): OK")

    open(CUR, "wb").write(ser(cur))
    open(KG, "wb").write(ser(kg))
    print("wrote", CUR, "and", KG)

    # artifact: the map with provenance + pre-state
    art = {
        "pdf": {"sha256": PDF_SHA256,
                "path_upstream": "syllabai-resources Official-Specifications/igcse-geography/9781446958360-int-gcse-geog-issue-3.pdf",
                "issue": "Issue 4 - February 2026 (Pearson Education Limited 2026)",
                "upstream_sha1_pin_match": True},
        "rows": [{"code": c, "kgId": id_map[c], "old": pre[c], "new": TITLE_MAP[c][0],
                  "source": TITLE_MAP[c][1], "composed": TITLE_MAP[c][2]} for c in TITLE_MAP],
    }
    json.dump(art, open(".syllabai/lane-artifacts/RN-DEBRIS-11/run008_title_map.json", "w"),
              indent=1, ensure_ascii=False)
    print("wrote .syllabai/lane-artifacts/RN-DEBRIS-11/run008_title_map.json")

if __name__ == "__main__":
    main()
