#!/usr/bin/env python3
"""Census: for every hub-unanchored flashcard, derive candidate official codes
via its topic's anchored siblings (notes + question parts in the same
[sectionSlug, topicSlug]) from (a) hub data (all resolve — audited), and
(b) upstream spec-links same-topic note/part joins (authoritative tiers only).
Reports per-course rescuable counts and code-set sizes. Read-only.
"""
import json, os, collections

UP = "/home/z/my-project/work/upstream-snap/spec-links"
HUB = "/home/z/my-project/work/syllabai-v2/apps/hub/content"
AUTH_TIERS = {  # upstream tiers considered learner-authoritative
    "T1_verbatim", "T2_near", "T3_section_anchored",
    "S1_name_match", "C1_content_join", "C2_content_join", "C3_topic_anchored",
    "V1_definition_verbatim", "V1_name_text_identity", "V2_name_phrase_identity",
    "V3_subsection_head_identity", "V3_convergent", "V4_settext_title_identity",
    "V5_topic_scoped_phrase_identity", "V6_near_text_verdict",
    "V7_agent_note_join", "J1_definition_text_identity", "J2_definition_phrase_identity",
    "J3_name_text_identity", "J4_name_phrase_identity",
}
EXCLUDE = {"S2_name_ambiguous", "T4_fuzzy"}  # flagged upstream — never authoritative

def load(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)

def up_codes_for(items, kind, section, topic):
    out = set()
    for v in items.values():
        if v.get("kind") != kind:
            continue
        if v.get("section") != section or v.get("topic") != topic:
            continue
        for e in v.get("codes") or []:
            t = e.get("tier")
            if t in AUTH_TIERS and t not in EXCLUDE:
                out.add(e.get("official_code") or e.get("official_id"))
    out.discard(None)
    return out

grand = collections.Counter()
size_hist = collections.Counter()
per_course = []
for course in sorted(os.listdir(HUB)):
    base = os.path.join(HUB, course)
    if not os.path.isdir(base):
        continue
    fl = load(os.path.join(base, "flashcards.json"))
    cur = load(os.path.join(base, "curriculum.json"))
    spec_codes = {n["code"] for n in cur.get("nodes", []) if n.get("family") == "SPEC_POINT"}

    def anchor_set(obj):
        a = set()
        for f in ("specPointIds", "specPointCodes", "smeSpecPointIds"):
            v = obj.get(f)
            if isinstance(v, list):
                a.update(x for x in v if isinstance(x, str) and x.strip())
        if isinstance(obj.get("specPointCode"), str) and obj["specPointCode"].strip():
            a.add(obj["specPointCode"])
        return {c for c in a if c in spec_codes}

    # topic -> codes from hub siblings
    topic_codes = collections.defaultdict(set)
    for n in load(os.path.join(base, "notes.json")):
        cs = anchor_set(n)
        if cs:
            topic_codes[(n.get("sectionSlug"), n.get("topicSlug"))] |= cs
    for s in load(os.path.join(base, "questions.json")):
        key = (s.get("sectionSlug"), s.get("topicSlug"))
        for q in s.get("questions", []):
            for p in q.get("parts", []):
                cs = anchor_set(p)
                if cs:
                    topic_codes[key] |= cs

    # topic -> codes from upstream spec-links (authoritative tiers) — ALL topics
    up_path = os.path.join(UP, course + ".json")
    up_topic = collections.defaultdict(set)
    if os.path.exists(up_path):
        items = load(up_path).get("items", {})
        by_key = collections.defaultdict(lambda: collections.defaultdict(set))
        for v in items.values():
            if v.get("kind") not in ("note", "question_part"):
                continue
            key = (v.get("section"), v.get("topic"))
            for e in v.get("codes") or []:
                t = e.get("tier")
                if t in AUTH_TIERS and t not in EXCLUDE:
                    by_key[key]["note" if v["kind"] == "note" else "part"].add(
                        e.get("official_code") or e.get("official_id"))
        for key, by_kind in by_key.items():
            s = by_kind["note"] | by_kind["part"]
            s.discard(None)
            if s:
                up_topic[key] |= s

    un = [c for c in fl if not (c.get("specPointCode") or c.get("specPointIds") or c.get("smeSpecPointIds"))]
    resc = hub_only = up_only = 0
    sizes = []
    no_topic = 0
    for c in un:
        key = (c.get("sectionSlug"), c.get("subtopicCode") or c.get("topicSlug"))
        # hub sibling codes (note: notes carry topicSlug; flashcards subtopicCode==topicSlug in practice)
        h = topic_codes.get((c.get("sectionSlug"), c.get("topicSlug")), set())
        u = up_topic.get((c.get("sectionSlug"), c.get("topicSlug")), set())
        cand = h | u
        if not c.get("topicSlug"):
            no_topic += 1
        if cand:
            resc += 1
            sizes.append(len(cand))
            if h and not u:
                hub_only += 1
            elif u and not h:
                up_only += 1
        size_hist[len(cand)] += 1
    grand["un"] += len(un)
    grand["resc"] += resc
    grand["hub_only"] += hub_only
    grand["up_only"] += up_only
    grand["no_topic"] += no_topic
    if un:
        per_course.append((course, len(un), resc, hub_only, up_only))

print(f"{'course':58s} {'unanch':>6s} {'wireable':>8s} {'hubOnly':>7s} {'upOnly':>6s}")
for course, un, resc, h, u in sorted(per_course, key=lambda r: -r[1]):
    print(f"{course:58s} {un:6d} {resc:8d} {h:7d} {u:6d}")
print()
print("GLOBAL:", dict(grand))
nonzero = {k: v for k, v in sorted(size_hist.items()) if k}
tot_resc = sum(v for k, v in size_hist.items() if k)
print("code-set size distribution (wireable cards):")
for k in sorted(nonzero):
    print(f"  {k} codes: {size_hist[k]} cards ({size_hist[k]/tot_resc*100:.1f}%)")
json.dump(per_course, open("/home/z/my-project/work/wire_census.json", "w"), indent=1)
