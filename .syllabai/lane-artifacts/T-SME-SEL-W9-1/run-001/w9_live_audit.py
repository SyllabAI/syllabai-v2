#!/usr/bin/env python3
"""Wave-9 tranche prep: parse live SME RN __NEXT_DATA__ trees and run the
bijection audit vs corpus (sets + notes) for the CIE IGCSE maths quartet."""
import json, re, collections, sys

COURSES = {
    "cie-igcse-maths-25-extended": ("25-extended", "25/extended"),
    "cie-igcse-maths-25-core": ("25-core", "25/core"),
    "cie-igcse-maths-international-maths-23-extended": ("intl-23-extended", "international-maths/23/extended"),
    "cie-igcse-maths-international-maths-23-core": ("intl-23-core", "international-maths/23/core"),
}
HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"

def parse_live(course, short):
    html = open(f"/tmp/sme_{course}_rn.html", encoding="utf-8", errors="replace").read()
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>', html, re.S)
    data = json.loads(m.group(1))
    pp = data["props"]["pageProps"]
    A = lambda o: o["attributes"]
    R = lambda o, k: (o.get("relationships", {}).get(k, {}).get("data") or {}).get("id")
    secs = sorted(pp["sections"], key=lambda s: A(s)["order"])
    tops = sorted(pp["topics"], key=lambda t: A(t)["order"])
    subs = sorted(pp["subtopics"], key=lambda s: A(s)["order"])
    sec_by_id = {s["id"]: A(s) for s in secs}
    tree = []
    for s in secs:
        my = [t for t in tops if R(t, "section") == s["id"]]
        tree.append({"slug": A(s)["slug"], "name": A(s)["name"], "order": A(s)["order"],
                     "topics": [{"slug": A(t)["slug"], "name": A(t)["name"], "order": A(t)["order"]} for t in my]})
    live_topics = {t["slug"] for sec in tree for t in sec["topics"]}
    dupes = [s for s, c in collections.Counter(live_topics).items() if c > 1]
    sub_by_topic = collections.Counter(R(x, "topic") for x in subs)
    return tree, live_topics, dupes, len(subs), sub_by_topic

for course, (short, urlpath) in COURSES.items():
    tree, live_topics, dupes, n_subs, sub_by_topic = parse_live(course, short)
    notes = json.load(open(f"{HUB}/content/{course}/notes.json"))
    qsets = json.load(open(f"{HUB}/content/{course}/questions.json"))
    n_pairs = {(n.get("sectionSlug"), n.get("topicSlug")) for n in notes if n.get("topicSlug")}
    n_slugs = {tp for _, tp in n_pairs}
    q_slugs = {t["topicSlug"] for t in qsets}
    # per-topic note counts (corpus-true) + per-topic set counts
    note_counts = collections.Counter(n.get("topicSlug") for n in notes if n.get("topicSlug"))
    set_counts = collections.Counter(t["topicSlug"] for t in qsets)
    q_titles = {}
    for t in qsets: q_titles.setdefault(t["topicSlug"], (t["name"], t["section"], t["sectionSlug"]))
    live_name = {t["slug"]: t["name"] for sec in tree for t in sec["topics"]}
    sec_of_topic = {t["slug"]: sec["slug"] for sec in tree for t in sec["topics"]}
    mism_title = [(s, q_titles[s][0], live_name[s]) for s in (q_slugs & set(live_name)) if q_titles[s][0] != live_name[s]]
    note_sec_mismatch = [(tp, sec_of_topic[tp]) for (ss, tp) in n_pairs if tp in sec_of_topic and ss != sec_of_topic[tp]]
    print(f"== {course} ({short})")
    print(f"   live: {len(tree)} sections / {len(live_topics)} topics / {n_subs} subtopics; dup topic slugs: {dupes}")
    print(f"   corpus: {len(notes)} notes in {len(n_pairs)} pairs; {len(qsets)} sets in {len(q_slugs)} slugs")
    print(f"   note slugs missing from live: {sorted(n_slugs - live_topics)}")
    print(f"   set slugs missing from live: {sorted(q_slugs - live_topics)}")
    print(f"   live-only topics (0 corpus contact): {sorted(live_topics - n_slugs - q_slugs)}")
    print(f"   title mismatches (corpus set name vs live RN name): {mism_title}")
    print(f"   note sectionSlug != live section of topic: {note_sec_mismatch}")
    # per-section row: corpus-true counts preview
    empty_rows = [t["slug"] for sec in tree for t in sec["topics"] if note_counts[t["slug"]] == 0 and set_counts[t["slug"]] == 0]
    print(f"   rows 0-note AND 0-set (mirror verbatim precedent): {empty_rows}")
    print()
