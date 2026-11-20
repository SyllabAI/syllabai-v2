#!/usr/bin/env python3
"""
T-SME-SEL-W9-8 run-001 — the corpus append builder (lane tooling of record).

Tranche 8: appends SME Revision-Notes picker section + topic rows
(provenanceTier SME_REFERENCE) to the queue pair's curriculum.json
(igcse-physics-19 Pearson Edexcel 4PH1 2017 /
 cie-as-biology-25 CIE AS 9700 2025-2027), verbatim from the live
SaveMyExams __NEXT_DATA__ trees fetched 2026-11-15 (parsed trees committed
as lane artifacts), and MERGES the live-derived gate fixtures into
apps/hub/scripts/sme-wave9-fixtures.json (tranche-1..7 blocks
byte-preserved).

Laws enforced here (ADR-039 §4, the tranche-3..5 recipe):
  * append-only — official nodes byte-untouched; removal round-trip asserted
    byte-identical for every course
  * verbatim mirror — titles/slugs/orders straight from the live tree
  * corpus-true counts — fixture row counts are corpus counts, never live
Shape law (the wave-7 precedent, uniform since):
  section row: family TOPIC, code <course>-SME-S<i>, order = official-topic-
               count + i, parents [<SUBJECT code>], smeSectionSlug
  topic row:   family SUBTOPIC, code <course>-SME-S<i>:<topicSlug>, order =
               1-based index within section, parents [<section code>]

Tranche-8 wrinkles of record: BOTH courses single-match (no multiMatch
declaration); blanket tranche-1/2 set law (physics 24 topic-class sets /
as-bio 48, all resolve); ZERO drift rows on either course — the feared
4BI1 skills-placeholder class did NOT appear on the 4PH1 tree and the
sciences-25 0-drift class holds on the AS 9700 tree (every live topic
carries corpus traffic; both trees are perfect 1:1s, live subtopic count
== corpus note count). NOTE: as-biology-25 is wave-8's fleet-safety
probe course (rotated in at tranche 7) — layering it forces the
disclosed probe rotation #2 (handled in verify_sme_wave8.ts, not here)."""
import json, collections, hashlib, copy

HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
LANE = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-8/run-001"

COURSES = [
    ("igcse-physics-19",
     "https://www.savemyexams.com/igcse/physics/edexcel/19/revision-notes/"),
    ("cie-as-biology-25",
     "https://www.savemyexams.com/as/biology/cie/25/revision-notes/"),
]
FETCH_DATE = "2026-11-15"


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


def resolve_row(ss, tp, tree):
    """The smeRowOfNote/smeRowOfQuestionSet resolution law, simulated.
    Returns the live SECTION slug a (sectionSlug, topicSlug) pair files to,
    or None when the runtime would fall back to first-match (which the
    builder forbids by assertion)."""
    secs_with = [sec for sec in tree if any(t["slug"] == tp for t in sec["topics"])]
    if not secs_with:
        return None
    if len(secs_with) == 1:
        return secs_with[0]["slug"]
    if ss in {s["slug"] for s in secs_with}:
        return ss
    return None  # first-match fallback — forbidden


def main():
    fx_path = f"{HUB}/scripts/sme-wave9-fixtures.json"
    fixtures = json.load(open(fx_path, encoding="utf-8"))
    before = copy.deepcopy(fixtures["courses"])
    assert len(before) == 17, f"expected 17 prior course blocks, got {len(before)}"
    existing = {c["course"] for c in fixtures["courses"]}

    for course, picker_url in COURSES:
        assert course not in existing, f"{course} already in fixtures"
        path = f"{HUB}/content/{course}/curriculum.json"
        cur = json.loads(open(path, encoding="utf-8").read())
        dump = detect_dump(path)
        cur["nodes"] = [n for n in cur["nodes"] if not n["code"].startswith(f"{course}-SME-S")]
        baseline = dump(cur)
        official = [n for n in cur["nodes"] if n.get("provenanceTier") != "SME_REFERENCE"]
        off_topic_count = sum(1 for n in official if n["family"] == "TOPIC")
        subject_code = next(n["code"] for n in official if n["family"] == "SUBJECT")
        tree = json.load(open(f"{LANE}/{course}_rn_tree.json", encoding="utf-8"))
        notes = json.load(open(f"{HUB}/content/{course}/notes.json", encoding="utf-8"))
        qsets = json.load(open(f"{HUB}/content/{course}/questions.json", encoding="utf-8"))

        # the resolution law: per-row counts through resolve_row
        note_rows = collections.Counter()
        fallback_notes = []
        for n in notes:
            if not n.get("topicSlug"):
                continue
            r = resolve_row(n.get("sectionSlug"), n["topicSlug"], tree)
            if r is None:
                fallback_notes.append((n.get("sectionSlug"), n["topicSlug"]))
            else:
                note_rows[(r, n["topicSlug"])] += 1
        assert not fallback_notes, f"{course}: notes relying on the first-match fallback: {fallback_notes[:5]}"
        set_rows = collections.Counter()
        fallback_sets = []
        for t in qsets:
            r = resolve_row(t.get("sectionSlug"), t["topicSlug"], tree)
            if r is None:
                fallback_sets.append((t.get("sectionSlug"), t["topicSlug"]))
            else:
                set_rows[(r, t["topicSlug"])] += 1
        assert not fallback_sets, f"{course}: sets relying on the first-match fallback: {fallback_sets[:5]}"

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
                "description": (f"SME Revision-Notes picker section row (ADR-039 wave-9 tranche-8 disclosed append {FETCH_DATE}): "
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
                    "description": (f"SME Revision-Notes picker topic row (ADR-039 wave-9 tranche-8 disclosed append {FETCH_DATE}): "
                                    f"SME topic \"{t['name']}\" (slug {t['slug']}) under section \"{sec['name']}\"; "
                                    "notes and sets file 1:1 by their corpus topicSlug."),
                    "parents": [sec_code],
                    "provenanceTier": "SME_REFERENCE",
                    "order": j,
                })
                rows.append({"slug": t["slug"], "title": t["name"],
                             "corpusNotes": note_rows[(sec["slug"], t["slug"])],
                             "corpusSets": set_rows[(sec["slug"], t["slug"])]})
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
        drift = [r["slug"] for s in sec_fixture for r in s["rows"] if r["corpusNotes"] == 0 and r["corpusSets"] == 0]
        print(f"{course}: +{len(appends)} nodes ({n_secs} sections + {n_rows} topic rows); "
              f"official {len(official)} intact; spine {spined}; drift rows {drift or 'none'}; "
              f"set law blanket ({len(qsets)} sets, all resolve)")
        block = {
            "course": course, "picker": picker_url, "code": cur["code"],
            "fetched": FETCH_DATE,
            "spine": {"officialNodes": len(official),
                      "families": {k: v for k, v in sorted(collections.Counter(n["family"] for n in official).items())},
                      "officialNodeDigest": spined},
            "sections": sec_fixture,
        }
        fixtures["courses"].append(block)

    assert fixtures["courses"][:17] == before, "prior tranche fixture blocks mutated"
    open(fx_path, "w", encoding="utf-8").write(json.dumps(fixtures, indent=2, ensure_ascii=False) + "\n")
    new = fixtures["courses"][17:]
    print(f"fixtures: {fx_path} — prior 17 blocks byte-preserved; tranche-8 added "
          f"{sum(len(c['sections']) for c in new)} sections, "
          f"{sum(len(s['rows']) for c in new for s in c['sections'])} rows")


if __name__ == "__main__":
    main()
