#!/usr/bin/env python3
"""cie_prune_dangling_relatednotes.py — deterministic EQ->RN join-drift compensation.

The upstream CIE SME-ExamQuestion topic.json files declare subtopic
revision_note_ids (rn_*) that do not exist in the sibling SME-RevisionNotes
package (older id generation / pages never scraped upstream): 170 references
across 6 of the 44 CIE banks, and NONE of them resolve in the upstream RN
manifest either. The hub corpus gate (verify_corpus_23a.ts) enforces
same-package referential integrity (danglingRefs baseline = 0), so
unresolvable references are dropped from question-set relatedNoteIds; every
drop is recorded in the report. NO-GUESS: ids are never rewritten or invented
— only removed when they resolve to no note in the same package.

Usage:
    python3 cie_prune_dangling_relatednotes.py --content-root DIR [--report PATH]
"""
import argparse
import json
import os
from collections import defaultdict


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--content-root", required=True)
    ap.add_argument("--report", default=None)
    args = ap.parse_args()

    drops = []
    per_course = defaultdict(int)
    for slug in sorted(os.listdir(args.content_root)):
        d = os.path.join(args.content_root, slug)
        qp, np_ = os.path.join(d, "questions.json"), os.path.join(d, "notes.json")
        if not (os.path.isdir(d) and os.path.exists(qp) and os.path.exists(np_)):
            continue
        note_ids = {n["noteId"] for n in json.load(open(np_, encoding="utf8"))}
        qsets = json.load(open(qp, encoding="utf8"))
        changed = False
        for s in qsets:
            rel = s.get("relatedNoteIds") or []
            keep = [r for r in rel if r in note_ids]
            if len(keep) != len(rel):
                for r in rel:
                    if r not in note_ids:
                        drops.append({"course": slug, "qset": s.get("slug"), "dropped": r})
                        per_course[slug] += 1
                s["relatedNoteIds"] = keep
                changed = True
        if changed:
            with open(qp, "w", encoding="utf8") as f:
                json.dump(qsets, f, ensure_ascii=False, separators=(",", ":"))

    print(f"pruned {len(drops)} dangling relatedNoteIds across {len(per_course)} courses")
    for slug, n in sorted(per_course.items()):
        print(f"  {slug}: {n}")
    if args.report:
        json.dump({"dropped": len(drops), "perCourse": dict(per_course), "detail": drops},
                  open(args.report, "w"), indent=1)
        print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
