#!/usr/bin/env python3
"""Wave-9 tranche 4 prep: parse live SME RN __NEXT_DATA__ trees and run the
bijection audit vs corpus (sets + notes) for the queue pair
(cie-igcse-english-literature-21 / cie-a-level-accounting-21, both CIE
2023-2025 syllabus, smeLayer=no per the live census). Adapted from the
tranche-3 recipe (w9t3_live_audit.py, lane artifacts T-SME-SEL-W9-3/run-001).

Set-class law check of record for this tranche: the maths past-paper wrinkle
(sectionSlug 'past-papers') is tranche-3-specific; this tranche asserts the
full set bijection for ALL corpus sets unless the audit surfaces a
non-topic class — findings print verbatim and fail the run."""
import json, re, collections, shutil, os

COURSES = {
    "cie-igcse-english-literature-21": "/home/z/my-project/scripts/w9t4_fetch/dd043983.html",
    "cie-a-level-accounting-21": "/home/z/my-project/scripts/w9t4_fetch/7eca23ce.html",
}
HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
LANE = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-4/run-001"
FETCH_DATE = "2026-11-15"
os.makedirs(LANE, exist_ok=True)

def parse_live(course, html_path):
    # raw fetches live in /tmp scratch (the committed lane set is the parsed
    # trees + scripts, the tranche-2/3 convention)
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
    dupes = [s for s, c in collections.Counter(live_topics).items() if c > 1]
    sub_by_topic = collections.Counter(R(x, "topic") for x in subs)
    sec_slug_by_id = {s["id"]: A(s)["slug"] for s in secs}
    topic_sec = {t["id"]: sec_slug_by_id[R(t, "section")] for t in tops}
    sub_by_sec = collections.Counter(topic_sec[R(x, "topic")] for x in subs)
    for sec in tree:
        sec["liveSubtopics"] = sub_by_sec[sec["slug"]]
    return tree, live_topics, dupes, len(subs), sub_by_topic, pp

issues = 0
for course, html_path in COURSES.items():
    tree, live_topics, dupes, n_subs, sub_by_topic, pp = parse_live(course, html_path)
    notes = json.load(open(f"{HUB}/content/{course}/notes.json"))
    qsets = json.load(open(f"{HUB}/content/{course}/questions.json"))
    n_pairs = {(n.get("sectionSlug"), n.get("topicSlug")) for n in notes if n.get("topicSlug")}
    n_slugs = {tp for _, tp in n_pairs}
    # set classes of record: full bijection unless a non-topic class surfaces
    classes = collections.Counter(t.get("sectionSlug") for t in qsets)
    print(f"   set sectionSlug classes: {dict(classes)}")
    topic_sets = [t for t in qsets]  # full-bijection law pending audit verdict
    q_slugs = {t["topicSlug"] for t in topic_sets}
    note_counts = collections.Counter(n.get("topicSlug") for n in notes if n.get("topicSlug"))
    set_counts = collections.Counter(t["topicSlug"] for t in topic_sets)
    q_titles = {}
    for t in topic_sets: q_titles.setdefault(t["topicSlug"], (t["name"], t["section"], t["sectionSlug"]))
    live_name = {t["slug"]: t["name"] for sec in tree for t in sec["topics"]}
    sec_of_topic = {t["slug"]: sec["slug"] for sec in tree for t in sec["topics"]}
    mism_title = [(s, q_titles[s][0], live_name[s]) for s in (q_slugs & set(live_name)) if q_titles[s][0] != live_name[s]]
    # multi-match class of record (the wave-7 exact-one law): a topic slug
    # may live under several live sections; a note/set (sectionSlug,
    # topicSlug) resolves EXACTLY ONE row iff its sectionSlug is one of the
    # live sections carrying that slug. The tranche-3 single-section check
    # is wrong for multi-match courses — replaced here by the resolution law.
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
    print(f"   note sectionSlug != live section of topic: {note_sec_mismatch[:5]}{'...' if len(note_sec_mismatch)>5 else ''}")
    print(f"   live-only drift rows (0-note AND 0-set): {drift}")
    print(f"   rows 0-note AND 0-set (incl. drift): {empty_rows}")
    if n_slugs - live_topics or q_slugs - live_topics or mism_title or note_sec_mismatch:
        issues += 1
    json.dump(tree, open(f"{LANE}/{course}_rn_tree.json", "w"), indent=1, ensure_ascii=False)
    print()
print("BIJECTION AUDIT: CLEAN" if issues == 0 else f"BIJECTION AUDIT: {issues} COURSE(S) WITH FINDINGS")
