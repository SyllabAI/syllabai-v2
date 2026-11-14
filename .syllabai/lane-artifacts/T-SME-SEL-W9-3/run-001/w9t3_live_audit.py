#!/usr/bin/env python3
"""Wave-9 tranche 3 prep: parse live SME RN __NEXT_DATA__ trees and run the
bijection audit vs corpus (sets + notes) for the Edexcel IGCSE maths pair
(igcse-maths-b-16 4MB1 / igcse-maths-a-18-higher 4MA1). Adapted from the
tranche-2 recipe (w9t2_live_audit.py, lane artifacts T-SME-SEL-W9-2/run-001).

Tranche-3 wrinkle of record: b-16's 65 corpus sets are SyllabAI past-paper
sets (topicSlug 2018-06-4mb1-01 …, sectionSlug 'past-papers' — the SyllabAI
pdflane archive, NOT SME content), so the set-dimension bijection is asserted
for the TOPIC-set class only; past-paper sets keep their official spine homes
(the smeRowOfQuestionSet null contract, spec-tree.ts:246) and must stay
visible on the EQ selector via the disclosed smeActive Other-sets fallback.
"""
import json, re, collections

COURSES = {
    "igcse-maths-b-16": ("maths-b-16", "maths/edexcel/b/16"),
    "igcse-maths-a-18-higher": ("maths-a-18-higher", "maths/edexcel/a/18/higher"),
}
HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
LANE = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-3/run-001"
FETCH_DATE = "2026-11-14"


def parse_live(course):
    # raw fetches live in /tmp scratch (the committed lane set is the parsed
    # trees + scripts, the tranche-2 convention)
    html = open(f"/tmp/sme_{course}_rn.html", encoding="utf-8", errors="replace").read()
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
for course, (short, urlpath) in COURSES.items():
    tree, live_topics, dupes, n_subs, sub_by_topic, pp = parse_live(course)
    notes = json.load(open(f"{HUB}/content/{course}/notes.json"))
    qsets = json.load(open(f"{HUB}/content/{course}/questions.json"))
    n_pairs = {(n.get("sectionSlug"), n.get("topicSlug")) for n in notes if n.get("topicSlug")}
    n_slugs = {tp for _, tp in n_pairs}
    # tranche-3 set classes: topic sets (live RN bijection law) vs past-paper sets (official-spine class)
    pp_sets = [t for t in qsets if t.get("sectionSlug") == "past-papers"]
    topic_sets = [t for t in qsets if t.get("sectionSlug") != "past-papers"]
    q_slugs = {t["topicSlug"] for t in topic_sets}
    note_counts = collections.Counter(n.get("topicSlug") for n in notes if n.get("topicSlug"))
    set_counts = collections.Counter(t["topicSlug"] for t in topic_sets)
    q_titles = {}
    for t in topic_sets: q_titles.setdefault(t["topicSlug"], (t["name"], t["section"], t["sectionSlug"]))
    live_name = {t["slug"]: t["name"] for sec in tree for t in sec["topics"]}
    sec_of_topic = {t["slug"]: sec["slug"] for sec in tree for t in sec["topics"]}
    mism_title = [(s, q_titles[s][0], live_name[s]) for s in (q_slugs & set(live_name)) if q_titles[s][0] != live_name[s]]
    note_sec_mismatch = [(tp, sec_of_topic[tp]) for (ss, tp) in n_pairs if tp in sec_of_topic and ss != sec_of_topic[tp]]
    empty_rows = [t["slug"] for sec in tree for t in sec["topics"] if note_counts[t["slug"]] == 0 and set_counts[t["slug"]] == 0]
    drift = sorted(live_topics - n_slugs - q_slugs)
    print(f"== {course} ({short})")
    print(f"   live: {len(tree)} sections / {len(live_topics)} topics / {n_subs} subtopics; dup topic slugs: {dupes}")
    print(f"   liveSubtopics per section: {sum(sec['liveSubtopics'] for sec in tree)} total = subtopics {n_subs} (check)")
    print(f"   corpus: {len(notes)} notes in {len(n_pairs)} pairs; sets {len(qsets)} = topic {len(topic_sets)} + past-paper {len(pp_sets)}")
    print(f"   note slugs missing from live: {sorted(n_slugs - live_topics)}")
    print(f"   topic-set slugs missing from live: {sorted(q_slugs - live_topics)}")
    print(f"   title mismatches (corpus set name vs live RN name): {mism_title}")
    print(f"   note sectionSlug != live section of topic: {note_sec_mismatch}")
    print(f"   live-only drift rows (0-note AND 0-topic-set): {drift}")
    print(f"   rows 0-note AND 0-topic-set (incl. drift): {empty_rows}")
    if n_slugs - live_topics or q_slugs - live_topics or mism_title or note_sec_mismatch or dupes:
        issues += 1
    json.dump(tree, open(f"{LANE}/{course}_rn_tree.json", "w"), indent=1, ensure_ascii=False)
    print()
print("BIJECTION AUDIT: CLEAN" if issues == 0 else f"BIJECTION AUDIT: {issues} COURSE(S) WITH FINDINGS")
