#!/usr/bin/env python3
"""Wave-9 tranche 29 prep: parse live SME RN __NEXT_DATA__ trees and run the
bijection audit vs corpus (sets + notes) for the queue pair
(cie-as-environmental-management-20 CIE 8291 2025-2027 — the AS
environmental-management shape, digit subcodes (T1:SUB1.1), 52 notes +
22 sets — *** HOLDS THE WAVE-8 PROBE SLOT — ROTATES OUT WHEN LAYERED *** /
 igcse-science-double-award-modular-24-physics-unit-2 Pearson 4XSD1
2024 — the double-award-modular shape, letter subcodes (T6:SUBc), 51
notes + 0 sets (SETLESS — the T13 bio-U2 sibling class); both
smeLayer=no per the live census at 579b3659). Adapted from the
tranche-28 recipe.

Wrinkle watch of record: BASE OF RECORD 579b3659 (the tranche-28 merge
moment; NO advance between turns). PIN SEARCH of record: the by-T-CODE
searches (rg cie-as-environmental-management-2025-2027-T / rg
igcse-science-double-award-modular-T) found ZERO pins; the by-SLUG
searches: as-emm-20 hits validate_cie_bundles.ts (the registry row {slug,
code 8291} + a historical T-SPEC-REPARSE-1 pin comment — inspected: no
curriculum-shape assertion affected by SME-row appends) and
verify_sme_wave8.ts (THE PROBE ROSTER ITSELF — the ROTATION #7 is the
disclosed plan of this tranche); sdaw-phy-U2 hits DATA-TOOLING one-shots
(annotate_fc_gap_23d.py, audit_final_21e.py, audit_schema_21e.py,
build_kg_loader_fork.py, fetch_new_lanes_21e.py, poll_deploy_tsm11.sh,
probe_sme_flashcards_23d.py, import_corpus/build_bundles.py, tb_page
HTML artifacts — inspected: no shape assertions) + sme-wave9-fixtures.
json (the gate's own file — the sdaw-bio-U2 block from T13,
self-consistent). THE ROTATION: when as-emm-20 gains its layer the wave-8
gate's fleet-safety check trips; the resolution of record (the T10
rank-pick precedent): the queue's next rank-1 no-layer course —
igcse-science-double-award-modular-24-physics-unit-2 is ITSELF being
layered THIS tranche, so the slot goes to the queue's rank-3 —
igcse-science-double-award-modular-24-chemistry-unit-1 (51 loose). NOTE:
T30 MUST rotate chem-U1 OUT when IT gains its layer. Multi-match topic
slugs resolve by the wave-7 exact-one law; drift rows surface as gate
DRIFT_BY_COURSE entries."""
import json, re, collections, shutil, os

COURSES = {
    "cie-as-environmental-management-20": "/home/z/my-project/scripts/w9t29_fetch/emm20.html",
    "igcse-science-double-award-modular-24-physics-unit-2": "/home/z/my-project/scripts/w9t29_fetch/sdawphyu2.html",
}
HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
LANE = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-29/run-001"
FETCH_DATE = "2026-11-18"
os.makedirs(LANE, exist_ok=True)

def parse_live(course, html_path):
    # raw fetches live in /tmp scratch (the committed lane set is the parsed
    # trees + scripts, the tranche-2..5 convention)
    tmp = f"/tmp/sme_{course}_rn.html"
    shutil.copy(html_path, tmp)
    html = open(tmp, encoding="utf-8", errors="replace").read()
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>', html, re.S)
    assert m, f"no __NEXT_DATA__ in {course}"
    pp = json.loads(m.group(1))["props"]["pageProps"]
    A = lambda o: o["attributes"]
    R = lambda o, k: (o.get("relationships", {}).get(k, {}).get("data") or {}).get("id")
    for key in ("sections", "topics", "subtopics"):
        assert key in pp, f"{course}: pageProps lacks '{key}' (shape drift?)"
    secs = sorted(pp["sections"], key=lambda s: A(s)["order"])
    tops = sorted(pp["topics"], key=lambda t: A(t)["order"])
    subs = sorted(pp["subtopics"], key=lambda s: A(s)["order"])
    tree = []
    for s in secs:
        my = [t for t in tops if R(t, "section") == s["id"]]
        tree.append({"slug": A(s)["slug"], "name": A(s)["name"], "order": A(s)["order"],
                     "topics": [{"slug": A(t)["slug"], "name": A(t)["name"], "order": A(t)["order"]} for t in my]})
    live_topics = {t["slug"] for sec in tree for t in sec["topics"]}
    sub_by_topic = collections.Counter(R(x, "topic") for x in subs)
    sec_slug_by_id = {s["id"]: A(s)["slug"] for s in secs}
    topic_sec = {t["id"]: sec_slug_by_id[R(t, "section")] for t in tops}
    sub_by_sec = collections.Counter(topic_sec[R(x, "topic")] for x in subs)
    for sec in tree:
        sec["liveSubtopics"] = sub_by_sec[sec["slug"]]
    return tree, live_topics, len(subs), pp

issues = 0
for course, html_path in COURSES.items():
    tree, live_topics, n_subs, pp = parse_live(course, html_path)
    notes = json.load(open(f"{HUB}/content/{course}/notes.json"))
    qsets = json.load(open(f"{HUB}/content/{course}/questions.json"))
    n_pairs = {(n.get("sectionSlug"), n.get("topicSlug")) for n in notes if n.get("topicSlug")}
    n_slugs = {tp for _, tp in n_pairs}
    classes = collections.Counter(t.get("sectionSlug") for t in qsets)
    print(f"   set sectionSlug classes: {dict(classes)}")
    topic_sets = [t for t in qsets]
    q_slugs = {t["topicSlug"] for t in topic_sets}
    note_counts = collections.Counter(n.get("topicSlug") for n in notes if n.get("topicSlug"))
    set_counts = collections.Counter(t["topicSlug"] for t in topic_sets)
    q_titles = {}
    for t in topic_sets: q_titles.setdefault(t["topicSlug"], (t["name"], t["section"], t["sectionSlug"]))
    live_name = {t["slug"]: t["name"] for sec in tree for t in sec["topics"]}
    mism_title = [(s, q_titles[s][0], live_name[s]) for s in (q_slugs & set(live_name)) if q_titles[s][0] != live_name[s]]
    # the wave-7 exact-one resolution law (the tranche-4 corrected check)
    tree_multi = {s for s, c in collections.Counter(
        t["slug"] for sec in tree for t in sec["topics"]).items() if c > 1}
    live_secs_of = {tp: {sec["slug"] for sec in tree if tp in {t["slug"] for t in sec["topics"]}}
                    for tp in tree_multi}
    mism_multi_notes = [(ss, tp) for (ss, tp) in n_pairs if tp in tree_multi and ss not in live_secs_of[tp]]
    set_multi_bad = [(t.get("sectionSlug"), t["topicSlug"]) for t in topic_sets
                     if t["topicSlug"] in tree_multi and t.get("sectionSlug") not in live_secs_of[t["topicSlug"]]]
    note_sec_mismatch = mism_multi_notes + set_multi_bad
    if tree_multi:
        on_multi = sum(1 for (ss, tp) in n_pairs if tp in tree_multi)
        print(f"   multi-match slugs: {sorted(tree_multi)} — live sections per slug: "
              f"{ {tp: sorted(v) for tp, v in live_secs_of.items()} }")
        print(f"   corpus note pairs on multi-match slugs: {on_multi}; failing exact-one: {mism_multi_notes}")
    empty_rows = [t["slug"] for sec in tree for t in sec["topics"] if note_counts[t["slug"]] == 0 and set_counts[t["slug"]] == 0]
    drift = sorted(live_topics - n_slugs - q_slugs)
    print(f"== {course}")
    print(f"   live: {len(tree)} sections / {len(live_topics)} topics / {n_subs} subtopics; multi-match topic slugs: {sorted(tree_multi)}")
    print(f"   liveSubtopics per section: {sum(sec['liveSubtopics'] for sec in tree)} total = subtopics {n_subs} (check)")
    print(f"   corpus: {len(notes)} notes in {len(n_pairs)} pairs; sets {len(qsets)}")
    print(f"   note slugs missing from live: {sorted(n_slugs - live_topics)}")
    print(f"   set slugs missing from live: {sorted(q_slugs - live_topics)}")
    print(f"   title mismatches (corpus set name vs live RN name): {mism_title[:5]}{'...' if len(mism_title)>5 else ''}")
    print(f"   exact-one failures (multi-match, corpus ss not a live section of the slug): {note_sec_mismatch[:5]}{'...' if len(note_sec_mismatch)>5 else ''}")
    print(f"   live-only drift rows (0-note AND 0-set): {drift}")
    print(f"   rows 0-note AND 0-set (incl. drift): {empty_rows}")
    if n_slugs - live_topics or q_slugs - live_topics or mism_title or note_sec_mismatch:
        issues += 1
    json.dump(tree, open(f"{LANE}/{course}_rn_tree.json", "w"), indent=1, ensure_ascii=False)
    print()
print("BIJECTION AUDIT: CLEAN" if issues == 0 else f"BIJECTION AUDIT: {issues} COURSE(S) WITH FINDINGS")
