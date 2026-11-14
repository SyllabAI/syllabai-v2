#!/usr/bin/env python3
"""
T-SME-SEL-W9-1 run-001 — the corpus append builder (lane tooling of record).

Appends SME Revision-Notes picker section + topic rows (provenanceTier
SME_REFERENCE) to the 4 CIE IGCSE maths tranche courses' curriculum.json,
verbatim from the live SaveMyExams __NEXT_DATA__ trees fetched 2026-11-13,
and generates the live-derived gate fixtures.

Laws enforced here (ADR-039 §4):
  * append-only — official nodes byte-untouched; removal round-trip asserted
    byte-identical for every course
  * verbatim mirror — titles/slugs/orders straight from the live tree
  * corpus-true counts — fixture row counts are corpus counts, never live
Shape law (the wave-7 precedent, igcse-english-literature-16 / cie-a-level-
computer-science-19):
  section row: family TOPIC, code <course>-SME-S<i>, order = official-topic-
               count + 1 + (i-1), parents [<SUBJECT code>], smeSectionSlug
  topic row:   family SUBTOPIC, code <course>-SME-S<i>:<topicSlug>, order =
               1-based live index within section, parents [<section code>]
"""
import json, re, collections, hashlib

HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"

COURSES = [
    ("cie-igcse-maths-25-extended", "https://www.savemyexams.com/igcse/maths/cie/25/extended/revision-notes/"),
    ("cie-igcse-maths-25-core", "https://www.savemyexams.com/igcse/maths/cie/25/core/revision-notes/"),
    ("cie-igcse-maths-international-maths-23-extended", "https://www.savemyexams.com/igcse/maths/cie/international-maths/23/extended/revision-notes/"),
    ("cie-igcse-maths-international-maths-23-core", "https://www.savemyexams.com/igcse/maths/cie/international-maths/23/core/revision-notes/"),
]
FETCH_DATE = "2026-11-13"


def parse_live(course):
    html = open(f"/tmp/sme_{course}_rn.html", encoding="utf-8", errors="replace").read()
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>', html, re.S)
    assert m, f"no __NEXT_DATA__ in {course}"
    pp = json.loads(m.group(1))["props"]["pageProps"]
    A = lambda o: o["attributes"]
    R = lambda o, k: (o.get("relationships", {}).get(k, {}).get("data") or {}).get("id")
    secs = sorted(pp["sections"], key=lambda s: A(s)["order"])
    tops = sorted(pp["topics"], key=lambda t: A(t)["order"])
    subs = sorted(pp["subtopics"], key=lambda s: A(s)["order"])
    slug_by_sid = {s["id"]: A(s)["slug"] for s in secs}
    sec_slug_of_topic = {t["id"]: slug_by_sid[R(t, "section")] for t in tops}
    tree = []
    for i, s in enumerate(secs, 1):
        my = [t for t in tops if R(t, "section") == s["id"]]
        tree.append({
            "i": i, "slug": A(s)["slug"], "name": A(s)["name"], "liveOrder": A(s)["order"],
            "topics": [{"slug": A(t)["slug"], "name": A(t)["name"], "j": j}
                       for j, t in enumerate(my, 1)],
        })
    sub_counts = collections.Counter(sec_slug_of_topic[R(x, "topic")] for x in subs)
    for sec in tree:
        sec["liveSubtopics"] = sub_counts[sec["slug"]]
    return tree


def spine_digest(official):
    """Canonical per-node strings (must mirror verify_sme_wave9.ts exactly)."""
    parts = []
    for n in official:
        parts.append("\x1f".join([
            n["code"], n["family"],
            "" if n.get("order") is None else str(n["order"]),
            "\x1e".join(n.get("parents") or []),
            "" if n.get("title") is None else n["title"],
        ]))
    parts.sort()
    return hashlib.sha256("\x1d".join(parts).encode("utf-8")).hexdigest()[:16]


def dump(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def main():
    fixtures = {
        "fetched": FETCH_DATE,
        "recipe": "live SaveMyExams Revision-Notes picker __NEXT_DATA__ per course; corpus-true row counts; wave-7 shape law",
        "courses": [],
    }
    for course, picker_url in COURSES:
        path = f"{HUB}/content/{course}/curriculum.json"
        raw = open(path, encoding="utf-8").read()
        cur = json.loads(raw)
        # idempotent re-run: strip pre-existing SME rows first; the round-trip
        # baseline is the canonical dump of the stripped tree
        cur["nodes"] = [n for n in cur["nodes"] if not n["code"].startswith(f"{course}-SME-S")]
        baseline = dump(cur)
        official = [n for n in cur["nodes"] if n.get("provenanceTier") != "SME_REFERENCE"]
        off_topic_count = sum(1 for n in official if n["family"] == "TOPIC")
        subject_code = next(n["code"] for n in official if n["family"] == "SUBJECT")
        tree = parse_live(course)
        notes = json.load(open(f"{HUB}/content/{course}/notes.json", encoding="utf-8"))
        qsets = json.load(open(f"{HUB}/content/{course}/questions.json", encoding="utf-8"))
        note_counts = collections.Counter(n.get("topicSlug") for n in notes if n.get("topicSlug"))
        set_counts = collections.Counter(t["topicSlug"] for t in qsets)

        dup_slugs = [s for s, c in collections.Counter(
            t["slug"] for sec in tree for t in sec["topics"]).items() if c > 1]
        assert not dup_slugs, f"{course}: duplicate topic slugs {dup_slugs} — disambiguation review needed"

        spined = spine_digest(official)

        appends = []
        sec_fixture = []
        for sec in tree:
            i = sec["i"]
            sec_code = f"{course}-SME-S{i}"
            appends.append({
                "code": sec_code, "family": "TOPIC", "title": sec["name"],
                "description": (f"SME Revision-Notes picker section row (ADR-039 wave-9 disclosed append {FETCH_DATE}): "
                                f"mirrors the live SaveMyExams Revision-Notes picker section verbatim ({picker_url}); "
                                "navigation layer only — spec anchoring stays on the official spine."),
                "parents": [subject_code],
                "provenanceTier": "SME_REFERENCE",
                "order": off_topic_count + i,
                "smeSectionSlug": sec["slug"],
            })
            rows = []
            for t in sec["topics"]:
                appends.append({
                    "code": f"{sec_code}:{t['slug']}", "family": "SUBTOPIC", "title": t["name"],
                    "description": (f"SME Revision-Notes picker topic row (ADR-039 wave-9 disclosed append {FETCH_DATE}): "
                                    f"SME topic \"{t['name']}\" (slug {t['slug']}) under section \"{sec['name']}\"; "
                                    "notes and sets file 1:1 by their corpus topicSlug."),
                    "parents": [sec_code],
                    "provenanceTier": "SME_REFERENCE",
                    "order": t["j"],
                })
                rows.append({"slug": t["slug"], "title": t["name"],
                             "corpusNotes": note_counts[t["slug"]],
                             "corpusSets": set_counts[t["slug"]]})
            sec_fixture.append({"i": i, "slug": sec["slug"], "title": sec["name"],
                                "order": off_topic_count + i,
                                "liveSubtopics": sec["liveSubtopics"], "rows": rows})

        # ---- append + byte-safety ----
        before_official = json.dumps(official, sort_keys=True, ensure_ascii=False)
        cur["nodes"] = cur["nodes"] + appends
        out = dump(cur)
        rt = json.loads(out)
        rt["nodes"] = [n for n in rt["nodes"] if not n["code"].startswith(f"{course}-SME-S")]
        assert dump(rt) == baseline, f"{course}: removal round-trip NOT byte-identical"
        assert json.dumps([n for n in json.loads(out)["nodes"] if n.get("provenanceTier") != "SME_REFERENCE"],
                          sort_keys=True, ensure_ascii=False) == before_official, \
            f"{course}: official nodes mutated"
        open(path, "w", encoding="utf-8").write(out)

        n_secs = len(sec_fixture)
        n_rows = sum(len(s["rows"]) for s in sec_fixture)
        print(f"{course}: +{len(appends)} nodes ({n_secs} sections + {n_rows} topic rows); "
              f"official {len(official)} intact; spine {spined}")
        fixtures["courses"].append({
            "course": course, "picker": picker_url, "code": cur["code"],
            "spine": {"officialNodes": len(official),
                      "families": {k: v for k, v in sorted(collections.Counter(n["family"] for n in official).items())},
                      "officialNodeDigest": spined},
            "sections": sec_fixture,
        })
    fx_path = f"{HUB}/scripts/sme-wave9-fixtures.json"
    open(fx_path, "w", encoding="utf-8").write(json.dumps(fixtures, indent=2, ensure_ascii=False) + "\n")
    print(f"fixtures: {fx_path} ({sum(len(c['sections']) for c in fixtures['courses'])} sections, "
          f"{sum(len(s['rows']) for c in fixtures['courses'] for s in c['sections'])} rows)")


if __name__ == "__main__":
    main()
