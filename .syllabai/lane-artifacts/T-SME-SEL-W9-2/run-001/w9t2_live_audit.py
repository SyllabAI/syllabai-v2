#!/usr/bin/env python3
"""Wave-9 tranche 2 prep: parse live SME RN __NEXT_DATA__ trees and run the
bijection audit vs corpus (sets + notes) for the CIE A-level sciences-25 trio
(biology 9700 / chemistry 9701 / physics 9702). Adapted from the run-001
recipe (w9_live_audit.py, lane artifacts T-SME-SEL-W9-1/run-001)."""
import json, re, collections, sys, os

COURSES = {
    "cie-a-level-biology-25": ("bio-25", "biology/25"),
    "cie-a-level-chemistry-25": ("chem-25", "chemistry/25"),
    "cie-a-level-physics-25": ("phys-25", "physics/25"),
}
HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
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
    tree = []
    for s in secs:
        my = [t for t in tops if R(t, "section") == s["id"]]
        tree.append({"slug": A(s)["slug"], "name": A(s)["name"], "order": A(s)["order"],
                     "topics": [{"slug": A(t)["slug"], "name": A(t)["name"], "order": A(t)["order"]} for t in my]})
    live_topics = {t["slug"] for sec in tree for t in sec["topics"]}
    dupes = [s for s, c in collections.Counter(live_topics).items() if c > 1]
    sub_by_topic = collections.Counter(R(x, "topic") for x in subs)
    # liveSubtopics per section: subtopics whose topic belongs to that section
    sec_slug_by_id = {s["id"]: A(s)["slug"] for s in secs}
    topic_sec = {t["id"]: sec_slug_by_id[R(t, "section")] for t in tops}
    sub_by_sec = collections.Counter(topic_sec[R(x, "topic")] for x in subs)
    for sec in tree:
        sec["liveSubtopics"] = sub_by_sec[sec["slug"]]
    return tree, live_topics, dupes, len(subs), sub_by_topic

issues = 0
for course, (short, urlpath) in COURSES.items():
    tree, live_topics, dupes, n_subs, sub_by_topic = parse_live(course)
    notes = json.load(open(f"{HUB}/content/{course}/notes.json"))
    qsets = json.load(open(f"{HUB}/content/{course}/questions.json"))
    n_pairs = {(n.get("sectionSlug"), n.get("topicSlug")) for n in notes if n.get("topicSlug")}
    n_slugs = {tp for _, tp in n_pairs}
    q_slugs = {t["topicSlug"] for t in qsets}
    note_counts = collections.Counter(n.get("topicSlug") for n in notes if n.get("topicSlug"))
    set_counts = collections.Counter(t["topicSlug"] for t in qsets)
    q_titles = {}
    for t in qsets: q_titles.setdefault(t["topicSlug"], (t["name"], t["section"], t["sectionSlug"]))
    live_name = {t["slug"]: t["name"] for sec in tree for t in sec["topics"]}
    sec_of_topic = {t["slug"]: sec["slug"] for sec in tree for t in sec["topics"]}
    mism_title = [(s, q_titles[s][0], live_name[s]) for s in (q_slugs & set(live_name)) if q_titles[s][0] != live_name[s]]
    note_sec_mismatch = [(tp, sec_of_topic[tp]) for (ss, tp) in n_pairs if tp in sec_of_topic and ss != sec_of_topic[tp]]
    empty_rows = [t["slug"] for sec in tree for t in sec["topics"] if note_counts[t["slug"]] == 0 and set_counts[t["slug"]] == 0]
    # drift = live rows with zero corpus contact (mirrored verbatim 0/0, wave-1/3 precedent)
    drift = sorted(live_topics - n_slugs - q_slugs)
    print(f"== {course} ({short})")
    print(f"   live: {len(tree)} sections / {len(live_topics)} topics / {n_subs} subtopics; dup topic slugs: {dupes}")
    print(f"   liveSubtopics per section: {sum(sec['liveSubtopics'] for sec in tree)} total = subtopics {n_subs} (check)")
    print(f"   corpus: {len(notes)} notes in {len(n_pairs)} pairs; {len(qsets)} sets in {len(q_slugs)} slugs")
    print(f"   note slugs missing from live: {sorted(n_slugs - live_topics)}")
    print(f"   set slugs missing from live: {sorted(q_slugs - live_topics)}")
    print(f"   title mismatches (corpus set name vs live RN name): {mism_title}")
    print(f"   note sectionSlug != live section of topic: {note_sec_mismatch}")
    print(f"   live-only drift rows (0-note AND 0-set): {drift}")
    print(f"   rows 0-note AND 0-set (incl. drift): {empty_rows}")
    if n_slugs - live_topics or q_slugs - live_topics or mism_title or note_sec_mismatch or dupes:
        issues += 1
    # lane artifact: the parsed live tree (committed provenance)
    json.dump(tree, open(f"/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-2/run-001/{course}_rn_tree.json", "w"), indent=1, ensure_ascii=False)
    print()
print("BIJECTION AUDIT: CLEAN" if issues == 0 else f"BIJECTION AUDIT: {issues} COURSE(S) WITH FINDINGS")
