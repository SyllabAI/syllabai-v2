#!/usr/bin/env python3
"""RN-DEBRIS-11 run-012 executor C2 — the two title-join residuals re-homed.

The rebuild retired the wreck rows that had title-join/notes-bridge-placed two
sets (el20 'paper-1-reading' sat on TP1 'Paper 1: Reading'; el25
'section-a-directed-writing' bridged via its SME topic slug). Per the D0
placement law of record ("SME section/topic-slug joins against this course's
committed curriculum map" — sme_d0_backfill.py basis) both SME sections
uniquely name AO blocks of record: Paper 1 Reading -> Reading (T1),
Paper 2 Writing -> Writing (T2). Honest '-gen' stamps at topic level.
"""
import json
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
ART = REPO / ".syllabai" / "lane-artifacts" / "RN-DEBRIS-11"

MOVES = {
    ("cie-igcse-english-language-20",
     "paper-1-reading--november-2023-050011-reading"):
        ("paper-1-reading", "1-paper-1-reading",
         "cie-igcse-english-language-2024-2026-T1-gen"),
    ("cie-igcse-english-language-25",
     "section-a-directed-writing--exam-questions-question-1a"):
        ("section-a-directed-writing", "paper-2-writing",
         "cie-igcse-english-language-2027-2029-T2-gen"),
}


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def dump_indent(obj):
    return (json.dumps(obj, indent=1, ensure_ascii=False) + "\n").encode()


def main():
    census = []
    for (slug, set_slug), (want_topic, want_section, stamp) in MOVES.items():
        qp = HUB / "content" / slug / "questions.json"
        raw = qp.read_bytes()
        sets = json.loads(raw)
        if dump_indent(sets) != raw:
            fail(f"C2: {slug} questions.json round-trip law broken")
        s = next(x for x in sets if x.get("slug") == set_slug)
        if s.get("subtopicCode") is not None:
            fail(f"C2: {set_slug} already stamped ({s.get('subtopicCode')})")
        if s.get("topicSlug") != want_topic or s.get("sectionSlug") != want_section:
            fail(f"C2: {set_slug} SME join drift "
                 f"({s.get('topicSlug')}/{s.get('sectionSlug')})")
        s["subtopicCode"] = stamp
        qp.write_bytes(dump_indent(sets))
        census.append({"course": slug, "set": set_slug, "topicSlug": want_topic,
                       "sectionSlug": want_section, "stamp": stamp,
                       "basis": "D0 SME section/topic-slug join to the rebuilt "
                                "AO-block map; Paper 1 Reading -> AO Reading, "
                                "Paper 2 Writing -> AO Writing (official paper/"
                                "objective identity)"})
        print(f"C2 OK: {slug} {set_slug[:44]} -> {stamp}")
    (ART / "run012_residual_rehome_census.json").write_text(
        json.dumps({"moves": census}, indent=1))


if __name__ == "__main__":
    main()
