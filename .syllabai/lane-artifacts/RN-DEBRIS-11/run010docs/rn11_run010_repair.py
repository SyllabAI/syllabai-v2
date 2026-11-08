#!/usr/bin/env python3
"""RN-DEBRIS-11 run-010 — the 4BS1 + RS-23 spine row-label repairs (title-only).

Scope of record (the run-009 title map, PR #832):
  F6 igcse-business-19 (Pearson Edexcel 4BS1, Issue 2 – February 2026):
      11 truncation repairs — the first-wrapped-line fragments restored to the
      PDF's full left-column titles (wrap continuations joined).
  F3 cie-igcse-religious-studies-23 (CIE 0490 2025-2027):
      6 glyph-spacing repairs — the hub's spaced mark forms (ʿ Umrah / Qur ʾ an /
      Shi ʿ ah ...) joined to the PDF's own bbox-verified word forms (ʿUmrah /
      Qurʾan / Shiʿah ...). The 4 dedupe-suffix rows and the 18 composed topic
      names are NOT touched (corpus suffix law / r5 composed-of-record).

Law (the run-008 repair law):
  title-only, placement-neutral, zero code changes; official headings verbatim;
  KG mirror follows in the same run; compact single-line JSON serializer law
  (round-trip byte-exact on the originals before any edit); every old title
  asserted byte-exact before editing (fail-closed).
"""
import json, re, subprocess, sys

REPO = "/home/z/my-project/work/syllabai-v2"

# --- the of-record maps (frozen from run-009's byte-pinned evidence) ---
F6_NEW = {
    "1.3": "Classification of businesses",
    "1.5": "Business and the international economy",
    "1.6": "Government objectives and policies",
    "1.8": "What makes a business successful?",
    "2.1": "Internal and external communication",
    "2.2": "Recruitment and selection process",
    "2.4": "Motivation and rewards",
    "2.5": "Organisation structure and employees",
    "3.1": "Business finance – sources",
    "3.3": "Costs and break-even analysis",
    "5.1": "Economies and diseconomies of scale",
}
F3_NEW = {
    "I2.5": "The development of Islam; origins of Sunni and Shiʿah",
    "I2.6": "The Qurʾan; different ways in which Muslims understand and interpret it",
    "I3.3": "ʿUmrah",
    "I4.1": "ʿId al-Adha (feast of sacrifice)",
    "I4.3": "ʿId al-Fitr (the end of Ramadan)",
    "I6.2": "Shariʿah (‘straight path’) as a code of behaviour and ethics for Muslims; as a legal system",
}
F6_OLD = {
    "1.3": "Classification of", "1.5": "Business and the",
    "1.6": "Government objectives", "1.8": "What makes a",
    "2.1": "Internal and external", "2.2": "Recruitment and",
    "2.4": "Motivation and", "2.5": "Organisation structure",
    "3.1": "Business finance –", "3.3": "Costs and break-even",
    "5.1": "Economies and",
}
F3_OLD = {
    "I2.5": "The development of Islam; origins of Sunni and Shi ʿ ah",
    "I2.6": "The Qur ʾ an; different ways in which Muslims understand and interpret it",
    "I3.3": "ʿ Umrah",
    "I4.1": "ʿ Id al-Adha (feast of sacrifice)",
    "I4.3": "ʿ Id al-Fitr (the end of Ramadan)",
    "I6.2": "Shari ʿ ah (‘straight path’) as a code of behaviour and ethics for Muslims; as a legal system",
}

B_CUR = "apps/hub/content/igcse-business-19/curriculum.json"
B_KG = "apps/hub/public/kg/data/igcse-business-19.json"
R_CUR = "apps/hub/content/cie-igcse-religious-studies-23/curriculum.json"
R_KG = "apps/hub/public/kg/data/cie-igcse-religious-studies-23.json"

def ser_for(raw):
    """Identify the file's own serialization law (fail-closed):
    compact single-line (the corpus default) or indent=1 pretty-printed with a
    trailing newline (the pre-existing r5-era state of the RS-23 curriculum)."""
    obj = json.loads(raw)
    for suffix in (b"", b"\n"):
        for kw in (dict(ensure_ascii=False, separators=(",", ":")),
                   dict(ensure_ascii=False, indent=1)):
            if json.dumps(obj, **kw).encode("utf-8") + suffix == raw:
                return kw, suffix
    raise AssertionError("serializer law not identified")

def write_law(path, obj, law):
    kw, suffix = law
    open(f"{REPO}/{path}", "wb").write(json.dumps(obj, **kw).encode("utf-8") + suffix)

def main():
    edits = {"b_cur": 0, "b_kg_pairs": 0, "b_kg_nodes": 0, "r_cur": 0, "r_kg_pairs": 0, "r_kg_nodes": 0}

    # ---------- G1 serializer law: round-trip byte-exact on all 4 originals ----------
    laws = {}
    for path in (B_CUR, B_KG, R_CUR, R_KG):
        raw = open(f"{REPO}/{path}", "rb").read()
        laws[path] = ser_for(raw)
    print("G1 per-file serializer laws identified + round-trip byte-exact:")
    for p, kw in laws.items():
        print(f"   {p}: {'compact' if 'separators' in kw[0] else 'indent=1 (pre-existing, preserved)'} + {kw[1]!r} suffix")

    # ---------- F6 igcse-business-19 ----------
    cur = json.loads(open(f"{REPO}/{B_CUR}", "rb").read())
    by = {n["code"]: n for n in cur["nodes"]}
    for k, new in F6_NEW.items():
        old = F6_OLD[k]
        t = by[f"igcse-business-T{k}"]
        s = by[f"igcse-business-T{k}:SUB_"]
        assert t["title"] == old and s["title"] == old, (k, t["title"], s["title"])
        t["title"] = new
        s["title"] = new
        edits["b_cur"] += 2
    write_law(B_CUR, cur, laws[B_CUR])

    kg = json.loads(open(f"{REPO}/{B_KG}", "rb").read())
    for k, (old, new) in zip(F6_NEW, zip(F6_OLD.values(), F6_NEW.values())):
        hits = []
        for sec, pairs in kg["subtopics"].items():
            for pair in pairs:
                if pair[1] == old:
                    hits.append((sec, pair))
        assert len(hits) == 1, (k, old, hits)
        sec, pair = hits[0]
        pair[1] = new
        node = next(n for n in kg["nodes"] if n.get("id") == pair[0] and n.get("type") == "SubTopic")
        assert node["label"] == old, (k, node["label"])
        node["label"] = new
        edits["b_kg_pairs"] += 1
        edits["b_kg_nodes"] += 1
    write_law(B_KG, kg, laws[B_KG])

    # ---------- F3 cie-igcse-religious-studies-23 ----------
    cur = json.loads(open(f"{REPO}/{R_CUR}", "rb").read())
    by = {n["code"]: n for n in cur["nodes"]}
    for k, new in F3_NEW.items():
        m = re.match(r"^([CIJ])([1-6])\.([0-9]+)$", k)
        code = f"cie-igcse-religious-studies-2025-2027-T{m.group(1)}{m.group(2)}:SUB{k}"
        old = F3_OLD[k]
        assert by[code]["title"] == old, (k, repr(by[code]["title"]))
        by[code]["title"] = new
        edits["r_cur"] += 1
    write_law(R_CUR, cur, laws[R_CUR])

    kg = json.loads(open(f"{REPO}/{R_KG}", "rb").read())
    for k, new in F3_NEW.items():
        old = F3_OLD[k]
        hits = []
        for sec, pairs in kg["subtopics"].items():
            for pair in pairs:
                if pair[1] == old:
                    hits.append((sec, pair))
        assert len(hits) == 1, (k, old, len(hits))
        sec, pair = hits[0]
        pair[1] = new
        node = next(n for n in kg["nodes"] if n.get("id") == pair[0] and n.get("type") == "SubTopic")
        assert node["label"] == old, (k, node["label"])
        node["label"] = new
        edits["r_kg_pairs"] += 1
        edits["r_kg_nodes"] += 1
    write_law(R_KG, kg, laws[R_KG])

    print("edits:", edits)
    print("expected: b_cur=22 (11 TOPIC + 11 SUBTOPIC) b_kg=11 r_cur=6 r_kg=6")
    ok = (edits["b_cur"] == 22 and edits["b_kg_pairs"] == 11 and edits["b_kg_nodes"] == 11
          and edits["r_cur"] == 6 and edits["r_kg_pairs"] == 6 and edits["r_kg_nodes"] == 6)
    print("APPLY:", "OK" if ok else "FAIL")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
