#!/usr/bin/env python3
"""T-SPEC-ANCHOR-1 run-001 task (b) — fold exam-skills notes under an explicit
"exam technique (not spec-tied)" label: write contentKind='exam_technique'
into the classified notes (compact JSON preserved).

Classification law (deterministic, documented in the receipt):
  a note is labeled iff ALL of:
    1. it carries NO official-resolving spec codes (specPointIds/specPointCodes
       ∩ course SPEC_POINT spine = ∅) — genuinely not spec-tied;
    2. it is not in the anthology/set-text carve-out list (content pages that
       live inside technique topics);
    3. it matches a technique section/topic rule:
       - sectionSlug in {6-exam-technique, exam-skills}
       - sectionSlug in {3-practical-skills-in-physics-i,
         6-practical-skills-in-physics-ii}  (IAL Physics practicals)
       - topicSlug in {16-1-the-geographical-enquiry,
         17-1-how-to-answer-an-extended-response-question}
       - course igcse-english-literature-16 AND topic how-to-* / *-overview
       - course igcse-english-language-a-16-* (paper-skill lanes)
"""
import json, os, collections

HUB = "/home/z/my-project/work/syllabai-v2/apps/hub/content"
RECEIPT = "/home/z/my-project/work/examtech_receipt.json"

TECH_SECTIONS = {"6-exam-technique", "exam-skills",
                 "3-practical-skills-in-physics-i", "6-practical-skills-in-physics-ii"}
TECH_TOPICS = {"16-1-the-geographical-enquiry",
               "17-1-how-to-answer-an-extended-response-question"}
# anthology/set-text pages living inside technique topics (content, not technique)
CARVE_OUTS = {
    "rn_2mGbSZRQR4xmF63Q",  # 'Explorers or boys messing about?…' (Paper 1 anthology)
    "rn_KgDbZZ6rYv3ZnHr7",  # 'An Unknown Girl' (Paper 2 poetry)
    "rn_wrzDFjb5gCdCDyTS",  # 'Disabled'
    "rn_8pSXMzJXDrQrsYQk",  # 'Night'
    "rn_4pcbH88RWKD6NtnH",  # '"Out, Out-'
    "rn_kTdM4MwkwdWzzfyt",  # 'Still I Rise'
    "rn_TbNJnh8R99YPzZSw",  # 'The Bright Lights of Sarajevo'
}

def matches(course, sec, top):
    if sec in TECH_SECTIONS:
        return True
    if top in TECH_TOPICS:
        return True
    if course == "igcse-english-literature-16" and top and (
            top.startswith("how-to-") or top.endswith("-overview")):
        return True
    if course.startswith("igcse-english-language-a-16"):
        return True
    return False

def main():
    receipt = {"labeled": [], "skipped_official": [], "skipped_carve": [],
               "law": "no official-resolving codes AND technique rule match AND not carve-out"}
    courses = sorted(d for d in os.listdir(HUB)
                     if os.path.isdir(os.path.join(HUB, d))
                     and os.path.exists(os.path.join(HUB, d, "curriculum.json"))
                     and not d.startswith("cie-"))
    for course in courses:
        base = os.path.join(HUB, course)
        cur = json.load(open(os.path.join(base, "curriculum.json")))
        spine = {n["code"] for n in cur.get("nodes", []) if n.get("family") == "SPEC_POINT"}
        path = os.path.join(base, "notes.json")
        raw = open(path, "rb").read()
        had_nl = raw.endswith(b"\n")
        notes = json.loads(raw)
        changed = False
        for n in notes:
            if n.get("contentKind") == "exam_technique":
                continue
            sec, top = n.get("sectionSlug"), n.get("topicSlug")
            if not matches(course, sec, top):
                continue
            if n["noteId"] in CARVE_OUTS:
                receipt["skipped_carve"].append({"course": course, "id": n["noteId"], "title": n["title"]})
                continue
            official = any(v in spine for v in (n.get("specPointIds") or []) + (n.get("specPointCodes") or []))
            if official:
                receipt["skipped_official"].append({"course": course, "id": n["noteId"], "title": n["title"]})
                continue
            n["contentKind"] = "exam_technique"
            changed = True
            receipt["labeled"].append({"course": course, "id": n["noteId"], "title": n["title"],
                                       "sectionSlug": sec, "topicSlug": top})
        if changed:
            open(path, "wb").write(
                (json.dumps(notes, separators=(",", ":"), ensure_ascii=False) + ("\n" if had_nl else "")).encode("utf-8"))

    with open(RECEIPT, "w") as fh:
        json.dump(receipt, fh, indent=1)
    by = collections.Counter(x["course"] for x in receipt["labeled"])
    print("labeled:", sum(by.values()))
    for k, v in sorted(by.items()):
        print(f"  {k}: {v}")
    print("skipped official-resolving:", len(receipt["skipped_official"]),
          "| skipped carve-outs:", len(receipt["skipped_carve"]))

if __name__ == "__main__":
    main()
