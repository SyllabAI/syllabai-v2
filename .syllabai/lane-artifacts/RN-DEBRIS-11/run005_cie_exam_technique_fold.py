#!/usr/bin/env python3
"""RN-DEBRIS-11 run-005 part 2 — fold CIE exam-skills notes under an explicit
'exam technique (not spec-tied)' label.

Data side:
  1. Every note whose SME path/source URL sits in an exam-technique /
     exam-skills section gets contentKind: "exam-technique" (additive
     optional contract field, contracts.ts RevisionNote).
  2. Two such notes carry a name-phrase-identity official code
     (cie-igcse-business-23 4.2.3 / cie-igcse-business-25 4.4.3) — retracted:
     'not spec-tied' means no official codes. specPointIds/specPointCodes →
     []; inline bodyMd (SME's own `spcpt_*` annotations) stays byte-equal
     (the reader sanitizes id-only chips at render; R2 preservation law).
     smeSpecPointIds byte-equal everywhere.

Serializer round-trip byte-exact (indent=1, ensure_ascii=False, trailing NL).
"""
import json
import re
from pathlib import Path

HUB = Path("/home/z/my-project/work/syllabai-v2/apps/hub")
KW = re.compile(r"exam-technique|exam-skills", re.I)

def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def dump_bytes(obj):
    return (json.dumps(obj, indent=1, ensure_ascii=False) + "\n").encode()

def main():
    tagged = {}
    retracted = []
    for cdir in sorted((HUB / "content").glob("cie-*")):
        slug = cdir.name
        p = cdir / "notes.json"
        if not p.exists():
            continue
        raw_before = p.read_bytes()
        notes = load(p)
        changed = False
        tagged_ids = set()
        for n in notes:
            hay = f"{n.get('path') or ''} {n.get('sourceUrl') or ''}"
            if not KW.search(hay):
                continue
            n["contentKind"] = "exam-technique"
            tagged_ids.add(n["noteId"])
            tagged.setdefault(slug, []).append(n["noteId"])
            codes = [c for c in (n.get("specPointIds") or []) if c]
            if codes:
                # gate: only the known name-phrase mistags retract
                assert slug in ("cie-igcse-business-23", "cie-igcse-business-25") and len(codes) == 1, \
                    f"{slug}/{n['noteId']}: unexpected official codes on an exam-technique note: {codes}"
                retracted.append({"course": slug, "noteId": n["noteId"], "title": n["title"],
                                  "retracted": codes})
                n["specPointIds"] = []
                n["specPointCodes"] = []
            changed = True
        if changed:
            # gates: untouched notes byte-equal
            old = json.loads(raw_before)
            assert len(old) == len(notes)
            for a, b in zip(old, notes):
                if a["noteId"] in tagged_ids:
                    continue
                assert a == b, f"{slug}: byte-drift on untouched note {a.get('noteId')}"
            for a, b in zip(old, notes):
                assert a.get("smeSpecPointIds") == b.get("smeSpecPointIds"), \
                    f"{slug}: smeSpecPointIds drift {a.get('noteId')}"
                assert a.get("bodyMd") == b.get("bodyMd"), \
                    f"{slug}: bodyMd drift {a.get('noteId')}"
            p.write_bytes(dump_bytes(notes))
    receipt = {
        "receipt": "rn11-run-005-exam-technique-fold",
        "tagged": {k: v for k, v in sorted(tagged.items())},
        "totalTagged": sum(len(v) for v in tagged.values()),
        "retractedCodes": retracted,
        "law": "exam-skills notes are exam technique, NOT spec-tied: additive "
               "contentKind field + the two name-phrase-identity codes retracted",
    }
    out = Path("/home/z/my-project/work/rn11_exam_technique_receipt.json")
    out.write_text(json.dumps(receipt, indent=1))
    print("tagged:", receipt["totalTagged"], "across", len(tagged), "courses")
    for k, v in receipt["tagged"].items():
        print(f"  {k}: {len(v)}")
    print("retracted:", json.dumps(retracted, indent=1))
    print("receipt:", out)

if __name__ == "__main__":
    main()
