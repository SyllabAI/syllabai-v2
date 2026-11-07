#!/usr/bin/env python3
"""CIE fleet anchoring census (RN-DEBRIS-11).

Per CIE course (content/cie-*): classify notes / question parts / flashcards
into anchored-official / sme-only / bare, plus SME cross-mapping checks
(relatedNoteIds, sourceNoteId) and inline spcpt residue in note bodies.

Classification (contracts.ts semantics):
  official-anchored : >=1 code in {specPointCodes} ∪ {specPointIds} resolves to
                      this course's curriculum SPEC_POINT code set
  sme-anchored      : no official code, but smeSpecPointIds non-empty
                      (upstream spcpt_* anchors; official mapping pending)
  bare              : neither

Zero-invention read-only census — no content is modified.
"""
import json, re, sys, collections
from pathlib import Path

HUB = Path("/home/z/my-project/work/syllabai-v2/apps/hub")
SPCPT = re.compile(r"spcpt_[A-Za-z0-9]+")

def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def classify_item(obj, spine_codes):
    codes = list(obj.get("specPointIds") or []) + list(obj.get("specPointCodes") or [])
    off = sorted({c for c in codes if c in spine_codes})
    off_verbatim = sorted({c for c in codes if c not in spine_codes})
    sme = list(obj.get("smeSpecPointIds") or [])
    if off:
        return "official", off, off_verbatim, sme
    if sme:
        return "sme", off, off_verbatim, sme
    return "bare", off, off_verbatim, sme

def census(slug):
    d = HUB / "content" / slug
    cur = load(d / "curriculum.json")
    spine_codes = {n["code"] for n in cur["nodes"] if n.get("family") == "SPEC_POINT"}
    sub_codes = {n["code"] for n in cur["nodes"] if n.get("family") == "SUBTOPIC"}
    out = {"course": slug, "board": cur.get("board"), "level": cur.get("level"),
           "subject": cur.get("subject"), "code": cur.get("code"),
           "spine": {"specPoints": len(spine_codes), "subtopics": len(sub_codes)},
           "notes": collections.Counter(), "parts": collections.Counter(),
           "cards": collections.Counter(), "sets": {}}
    # notes
    try:
        notes = load(d / "notes.json")
    except FileNotFoundError:
        notes = []
    out["notes"]["total"] = len(notes)
    note_ids = set()
    inline_ref_notes = 0
    for n in notes:
        note_ids.add(n.get("noteId"))
        st, _, _, _ = classify_item(n, spine_codes)
        out["notes"][st] += 1
        body = n.get("bodyMd") or ""
        if SPCPT.search(body):
            inline_ref_notes += 1
    out["notes"]["inlineSpcptBodies"] = inline_ref_notes
    # question parts
    try:
        sets = load(d / "questions.json")
    except FileNotFoundError:
        sets = []
    rel_total = rel_res = 0
    part_ids_all = set()
    for s in sets:
        for q in s.get("questions", []):
            for p in q.get("parts", []):
                part_ids_all.add(p.get("id"))
                st, _, _, _ = classify_item(p, spine_codes)
                out["parts"][st] += 1
        rl = s.get("relatedNoteIds") or []
        rel_total += len(rl)
        rel_res += sum(1 for r in rl if r in note_ids)
        sub_c = s.get("subtopicCode")
        if sub_c:
            out["sets"][s["slug"]] = {"subtopicCode": sub_c,
                                      "inSpine": sub_c in sub_codes,
                                      "related": len(rl)}
    out["parts"]["total"] = sum(out["parts"][k] for k in ("official", "sme", "bare"))
    out["sets"]["relatedTotal"] = rel_total
    out["sets"]["relatedResolved"] = rel_res
    out["sets"]["total"] = len(sets)
    # flashcards
    try:
        cards = load(d / "flashcards.json")
    except FileNotFoundError:
        cards = []
    out["cards"]["total"] = len(cards)
    sn_set = sn_null = 0
    for c in cards:
        st, _, _, _ = classify_item(c, spine_codes)
        out["cards"][st] += 1
        if c.get("sourceNoteId"):
            sn_set += 1
            if c["sourceNoteId"] in note_ids:
                sn_res = out["cards"].setdefault("sourceNoteIdResolved", 0)
                out["cards"]["sourceNoteIdResolved"] = sn_res + 1
        else:
            sn_null += 1
    out["cards"]["sourceNoteIdSet"] = sn_set
    out["cards"]["sourceNoteIdNull"] = sn_null
    out["cards"]["subtopicCodeSet"] = sum(1 for c in cards if c.get("subtopicCode"))
    return out

def main():
    slugs = sorted(p.name for p in (HUB / "content").iterdir()
                   if p.is_dir() and p.name.startswith("cie-"))
    rows = []
    for s in slugs:
        try:
            rows.append(census(s))
        except Exception as e:
            rows.append({"course": s, "error": str(e)})
    out = Path("/home/z/my-project/work/cie_fleet_census.json")
    out.write_text(json.dumps(rows, indent=1))
    # console summary
    tot = {k: collections.Counter() for k in ("notes", "parts", "cards")}
    print(f"{'course':58s} {'SP':>4s} | {'N o/s/b':>11s} | {'P o/s/b':>13s} | {'F o/s/b':>15s} | inline rel")
    for r in rows:
        if "error" in r:
            print(f"{r['course']:58s} ERROR {r['error'][:60]}")
            continue
        n, p, c = r["notes"], r["parts"], r["cards"]
        for k, v in (("notes", n), ("parts", p), ("cards", c)):
            for kk in ("official", "sme", "bare"):
                tot[k][kk] += v.get(kk, 0)
        print(f"{r['course']:58s} {r['spine']['specPoints']:4d} | "
              f"{n.get('official',0):3d}/{n.get('sme',0):3d}/{n.get('bare',0):3d} | "
              f"{p.get('official',0):4d}/{p.get('sme',0):4d}/{p.get('bare',0):4d} | "
              f"{c.get('official',0):5d}/{c.get('sme',0):5d}/{c.get('bare',0):4d} | "
              f"{n.get('inlineSpcptBodies',0):5d} {r['sets']['relatedResolved']}/{r['sets']['relatedTotal']}")
    print("\nFLEET TOTALS (58 CIE courses)")
    for k, v in tot.items():
        t = sum(v.values())
        print(f"  {k:6s}: official {v['official']:,}  sme {v['sme']:,}  bare {v['bare']:,}  total {t:,}"
              f"  ({v['official']/t*100:.1f}% official)")
    print(f"  courses: {len(rows)}")

if __name__ == "__main__":
    main()
