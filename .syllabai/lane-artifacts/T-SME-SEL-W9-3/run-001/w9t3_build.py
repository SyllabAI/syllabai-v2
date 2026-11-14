#!/usr/bin/env python3
"""
T-SME-SEL-W9-3 run-001 — the corpus append builder (lane tooling of record).

Tranche 3: appends SME Revision-Notes picker section + topic rows
(provenanceTier SME_REFERENCE) to the Edexcel IGCSE maths pair's
curriculum.json (igcse-maths-b-16 4MB1 / igcse-maths-a-18-higher 4MA1
Higher), verbatim from the live SaveMyExams __NEXT_DATA__ trees fetched
2026-11-14 (parsed trees committed as lane artifacts), and MERGES the
live-derived gate fixtures into apps/hub/scripts/sme-wave9-fixtures.json
(tranche-1 + tranche-2 blocks byte-preserved).

Laws enforced here (ADR-039 §4):
  * append-only — official nodes byte-untouched; removal round-trip asserted
    byte-identical for every course
  * verbatim mirror — titles/slugs/orders straight from the live tree
  * corpus-true counts — fixture row counts are corpus counts, never live
Shape law (the wave-7 precedent, uniform since):
  section row: family TOPIC, code <course>-SME-S<i>, order = official-topic-
               count + i, parents [<SUBJECT code>], smeSectionSlug
  topic row:   family SUBTOPIC, code <course>-SME-S<i>:<topicSlug>, order =
               1-based index within section, parents [<section code>]

Tranche-3 wrinkle of record: b-16's 65 corpus sets are SyllabAI past-paper
sets (sectionSlug 'past-papers', the pdflane archive — NOT SME content), so
corpusSets counts TOPIC sets only and each block carries a setLaw pin
({topicSets, officialHomeSets, officialHomeSectionSlugs}) the gate asserts
against the smeRowOfQuestionSet null contract (spec-tree.ts:246).
"""
import json, collections, hashlib, copy

HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
LANE = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-3/run-001"

COURSES = [
    ("igcse-maths-b-16",
     "https://www.savemyexams.com/igcse/maths/edexcel/b/16/revision-notes/"),
    ("igcse-maths-a-18-higher",
     "https://www.savemyexams.com/igcse/maths/edexcel/a/18/higher/revision-notes/"),
]
FETCH_DATE = "2026-11-14"
TRANCHE = 3


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


def dump_indent(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def dump_compact(obj):
    """The Edexcel curricula of record are minified single-line JSON
    (compact separators, ensure_ascii=False, NO trailing newline) — verified
    byte-identical on the pristine files; the append must not reformat."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def detect_dump(raw_path):
    """Pick the dumper that reproduces the ORIGINAL file bytes exactly (the
    append-only law starts at byte level: no reformatting allowed)."""
    raw = open(raw_path, "rb").read()
    cur = json.loads(raw)
    for fn in (dump_compact, dump_indent,
               lambda o: json.dumps(o, indent=2, ensure_ascii=False) + "\n"):
        if fn(cur).encode("utf-8") == raw:
            return fn
    raise AssertionError(f"{raw_path}: no byte-identical dumper found — format drift, review before appending")


def main():
    fx_path = f"{HUB}/scripts/sme-wave9-fixtures.json"
    fixtures = json.load(open(fx_path, encoding="utf-8"))
    before = copy.deepcopy(fixtures["courses"])
    assert len(before) == 7, f"expected 7 prior course blocks, got {len(before)}"
    existing = {c["course"] for c in fixtures["courses"]}

    for course, picker_url in COURSES:
        assert course not in existing, f"{course} already in fixtures"
        path = f"{HUB}/content/{course}/curriculum.json"
        cur = json.loads(open(path, encoding="utf-8").read())
        dump = detect_dump(path)
        # idempotent re-run: strip pre-existing SME rows first; the round-trip
        # baseline is the canonical dump of the stripped tree
        cur["nodes"] = [n for n in cur["nodes"] if not n["code"].startswith(f"{course}-SME-S")]
        baseline = dump(cur)
        official = [n for n in cur["nodes"] if n.get("provenanceTier") != "SME_REFERENCE"]
        off_topic_count = sum(1 for n in official if n["family"] == "TOPIC")
        subject_code = next(n["code"] for n in official if n["family"] == "SUBJECT")
        tree = json.load(open(f"{LANE}/{course}_rn_tree.json", encoding="utf-8"))
        notes = json.load(open(f"{HUB}/content/{course}/notes.json", encoding="utf-8"))
        qsets = json.load(open(f"{HUB}/content/{course}/questions.json", encoding="utf-8"))
        note_counts = collections.Counter(n.get("topicSlug") for n in notes if n.get("topicSlug"))
        # the tranche-3 set-class law: topic sets file onto SME rows; past-paper
        # sets (SyllabAI pdflane archive, sectionSlug 'past-papers') keep their
        # official spine homes — they are not SME content and get no SME count
        pp_slugs = sorted({t["sectionSlug"] for t in qsets if t["sectionSlug"] == "past-papers"})
        topic_sets = [t for t in qsets if t["sectionSlug"] not in pp_slugs]
        pp_sets = [t for t in qsets if t["sectionSlug"] in pp_slugs]
        set_counts = collections.Counter(t["topicSlug"] for t in topic_sets)

        dup_slugs = [s for s, c in collections.Counter(
            t["slug"] for sec in tree for t in sec["topics"]).items() if c > 1]
        assert not dup_slugs, f"{course}: duplicate topic slugs {dup_slugs} — disambiguation review needed"

        spined = spine_digest(official)

        appends = []
        sec_fixture = []
        for i, sec in enumerate(tree, 1):
            sec_code = f"{course}-SME-S{i}"
            appends.append({
                "code": sec_code, "family": "TOPIC", "title": sec["name"],
                "description": (f"SME Revision-Notes picker section row (ADR-039 wave-9 tranche-3 disclosed append {FETCH_DATE}): "
                                f"mirrors the live SaveMyExams Revision-Notes picker section verbatim ({picker_url}); "
                                "navigation layer only — spec anchoring stays on the official spine."),
                "parents": [subject_code],
                "provenanceTier": "SME_REFERENCE",
                "order": off_topic_count + i,
                "smeSectionSlug": sec["slug"],
            })
            rows = []
            for j, t in enumerate(sec["topics"], 1):
                appends.append({
                    "code": f"{sec_code}:{t['slug']}", "family": "SUBTOPIC", "title": t["name"],
                    "description": (f"SME Revision-Notes picker topic row (ADR-039 wave-9 tranche-3 disclosed append {FETCH_DATE}): "
                                    f"SME topic \"{t['name']}\" (slug {t['slug']}) under section \"{sec['name']}\"; "
                                    "notes and sets file 1:1 by their corpus topicSlug."),
                    "parents": [sec_code],
                    "provenanceTier": "SME_REFERENCE",
                    "order": j,
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
              f"official {len(official)} intact; spine {spined}; "
              f"setLaw topic={len(topic_sets)} official-home={len(pp_sets)} ({pp_slugs})")
        fixtures["courses"].append({
            "course": course, "picker": picker_url, "code": cur["code"],
            "fetched": FETCH_DATE,
            "spine": {"officialNodes": len(official),
                      "families": {k: v for k, v in sorted(collections.Counter(n["family"] for n in official).items())},
                      "officialNodeDigest": spined},
            "setLaw": {"topicSets": len(topic_sets),
                       "officialHomeSets": len(pp_sets),
                       "officialHomeSectionSlugs": pp_slugs},
            "sections": sec_fixture,
        })

    # tranche-1 + tranche-2 blocks byte-preserved (deep equality on the 7)
    assert fixtures["courses"][:7] == before, "prior tranche fixture blocks mutated"
    open(fx_path, "w", encoding="utf-8").write(json.dumps(fixtures, indent=2, ensure_ascii=False) + "\n")
    new = fixtures["courses"][7:]
    print(f"fixtures: {fx_path} — prior 7 blocks byte-preserved; tranche-3 added "
          f"{sum(len(c['sections']) for c in new)} sections, "
          f"{sum(len(s['rows']) for c in new for s in c['sections'])} rows")


if __name__ == "__main__":
    main()
