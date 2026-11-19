#!/usr/bin/env python3
"""T-SME-SEL-W9-35 run-001 — the corpus append builder (lane tooling of record).

Tranche 35: appends SME Revision-Notes picker section + topic rows
(provenanceTier SME_REFERENCE) to the queue pair's curriculum.json
(cie-as-english-general-paper-21 CIE 8021 2028-2030 — the GENERAL-PAPER
shape, the TS-strand T-code pattern — *** WAVE-8 PROBE ROSTER SLOT 2 ***
/ igcse-accounting-17-financial-statements Edexcel 4AC1 2017 — the
ACCOUNTING family's T4 strand — *** WAVE-8 PROBE ROSTER SLOT 1 ***),
verbatim from the live SaveMyExams __NEXT_DATA__ trees fetched
2026-11-18 (parsed trees committed as lane artifacts), and MERGES the
live-derived gate fixtures into apps/hub/scripts/sme-wave9-fixtures.json
(tranche-1..34 blocks byte-preserved).

Laws enforced here (ADR-039 §4, the tranche-3..5 recipe):
  * append-only — official nodes byte-untouched; removal round-trip asserted
    byte-identical for every course
  * verbatim mirror — titles/slugs/orders straight from the live tree
  * corpus-true counts — fixture row counts are corpus counts, never live

Tranche-35 wrinkles of record: the TWENTY-SIXTH consecutive FULLY-CLEAN
audit — gp-21 PERFECT (2 sections/5 topics/22 subtopics, 22 = 22, 0
sets, zero drift); acctfs PERFECT on notes (3/16/20, 20 = 20, 5 sets)
WITH THE WAVE'S THIRTEENTH DRIFT EVENT — TEN live-only paper-session
rows (2019-june, 2020-june, 2020-november, 2021-june, 2021-november,
2022-june, 2023-january, 2023-june, 2023-november, 2024-june — the
fm19 class, the acct17-intro twin), carried into the acctfs fixtures
block as corpus-zero rows and pinned in DRIFT_BY_COURSE. THIS TURN
OPENED WITH A SANDBOX-RECYCLE RECONCILIATION (the checkout restored to
the pre-wave-9 commit 4008e6ce; git reset --hard origin/main
re-materialized 07a441f4; the trio verdict re-confirmed — 72/69/34 SME
rows). *** THE FOURTH DOUBLE ROTATION (#13) — PROACTIVE ***: BOTH
tranche courses sit on the wave-8 probe roster (gp-21 slot 2, acctfs
slot 1); layering BOTH trips slots 1 AND 2 — planned at recon time and
executed BEFORE the battery: gp-21 AND acctfs rotate OUT; the
replacements of record (the T10 rank-pick precedent, the
not-already-on-the-roster law): slot 1 -> igcse-english-language-a-16-
paper-1-non-fiction-texts-and-transactional-writing (10 loose), slot 2
-> igcse-english-language-a-16-paper-3-coursework (1 loose);
igcse-english-language-a-16-paper-2 (11 loose) NOT layered this tranche
and STAYS at slot 3. NOTE for T36: paper-2 + paper-1 are the next queue
pair (ANOTHER double — slots 3 and the new slot 1; the roster then
shrinks toward its edge case as only paper-3 remains as a replacement
candidate); T37 = paper-3 alone (the LAST probe trips; the roster
empties and fleet-safety goes trivially green). PIN SEARCH of record:
the by-T-CODE searches found ZERO pins; the by-SLUG searches hit
cie-phase4-roster.test.ts (INSPECTED: the QUESTION-bank code-map class,
cleared at T31/T33), validate_cie_bundles.ts (the registry-row class,
cleared at T29) and verify_sme_wave8.ts (the probe roster itself); the
acctfs hits are the known DATA-TOOLING one-shots (annotate_fc_gap_23d.py,
coverage_diagnose.ts, normalize_board_level_tags.py,
probe_optional_choice.ts, probe_sme_flashcards_23d.py). No byte-format
event. BASE OF RECORD 07a441f4 (the tranche-34 merge moment)."""
import json, collections, hashlib, copy

HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
LANE = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-35/run-001"

COURSES = [
    ("cie-as-english-general-paper-21",
     "https://www.savemyexams.com/as/english/cie/general-paper/21/revision-notes/"),
    ("igcse-accounting-17-financial-statements",
     "https://www.savemyexams.com/igcse/accounting/edexcel/17/financial-statements/revision-notes/"),
]
FETCH_DATE = "2026-11-18"


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
    # the tranche-9 lane adds the 4th candidate: chem-19's curriculum.json is
    # the fleet's first COMPACT serialization (compact, ensure_ascii=False,
    # WITH trailing newline) — the inherited dump_compact candidate has no
    # trailing newline (never exercised: every prior course was indent-1)
    # and the fail-closed law refused to guess until the exact dumper exists
    for fn in (dump_compact, dump_indent,
               lambda o: json.dumps(o, indent=2, ensure_ascii=False) + "\n",
               lambda o: json.dumps(o, separators=(",", ":"),
                                    ensure_ascii=False) + "\n"):
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
    assert len(before) == 71, f"expected 25 prior course blocks, got {len(before)}"
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
                "description": (f"SME Revision-Notes picker section row (ADR-039 wave-9 tranche-35 disclosed append {FETCH_DATE}): "
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
                    "description": (f"SME Revision-Notes picker topic row (ADR-039 wave-9 tranche-35 disclosed append {FETCH_DATE}): "
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

    assert fixtures["courses"][:71] == before, "prior tranche fixture blocks mutated"
    open(fx_path, "w", encoding="utf-8").write(json.dumps(fixtures, indent=2, ensure_ascii=False) + "\n")
    new = fixtures["courses"][71:]
    print(f"fixtures: {fx_path} — prior 71 blocks byte-preserved; tranche-35 added "
          f"{sum(len(c['sections']) for c in new)} sections, "
          f"{sum(len(s['rows']) for c in new for s in c['sections'])} rows")


if __name__ == "__main__":
    main()
