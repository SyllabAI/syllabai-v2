#!/usr/bin/env python3
"""Wave-9 tranche 8 prep: parse live SME RN __NEXT_DATA__ trees and run the
bijection audit vs corpus (sets + notes) for the queue pair
(igcse-physics-19 Pearson Edexcel 4PH1 2017 /
 cie-as-biology-25 CIE AS 9700 2025-2027, both smeLayer=no per the live
census at 4ef09e31). Adapted from the tranche-7 recipe (w9t7_live_audit.py,
lane artifacts T-SME-SEL-W9-7/run-001 — recovered from the committed lane
set after the sandbox recycle wiped the conversation-era scripts).

Wrinkle watch of record: physics-19 is the Pearson Edexcel sibling of
igcse-biology-19 (4BI1, tranche 5) — that tree ran the 3 SME
skills/exam-technique placeholder drift rows; watch for the same class
on the 4PH1 tree. as-biology-25 is the AS-level sibling of the layered
A-level 9700 (tranche 2, 0 drift) and of the layered AS chemistry tree
(tranche 7, 0 drift) — watch for the sciences-25 trio's 0-drift class.
NOTE: as-biology-25 is ALSO wave-8's fleet-safety probe course (rotated
in at tranche 7) — layering it forces the disclosed probe rotation #2.
Multi-match topic slugs resolve by the wave-7 exact-one law (corpus
sectionSlug == live smeSectionSlug; first-match fallback flagged); set
classes printed verbatim (an official-home class would need a setLaw pin
— the tranche-3 b-16 precedent); drift rows (live-only 0-note 0-set)
surface as gate DRIFT_BY_COURSE entries."""
import json, re, collections, shutil, os

COURSES = {
    "igcse-physics-19": "/home/z/my-project/scripts/w9t8_fetch/phys19.html",
    "cie-as-biology-25": "/home/z/my-project/scripts/w9t8_fetch/asbio.html",
}
HUB = "/home/z/my-project/repos/syllabai-v2/apps/hub"
LANE = "/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-SME-SEL-W9-8/run-001"
FETCH_DATE = "2026-11-15"
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
