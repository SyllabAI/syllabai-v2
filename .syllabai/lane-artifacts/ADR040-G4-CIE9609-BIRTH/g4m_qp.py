#!/usr/bin/env python3
"""G-4 mirror stage 2 — CIE 9609 QP text-layer grammar
(engine textlayer-qp-adr040-g4-cie9609-r0) for the LEVELS birth tranche.

Tranche: 9609-W21-QP-11/12/13 (D-prose carriers) + 9609-S22-QP-11/12/13
(E-unlabeled carriers) — the only CLEAN papers carrying single-axis band grids.

Grammar (CIE P1 2021/2022 printed layout, from the text layer):
  cover   : code '9609/NN', paper title, session '(May/June|October/November|
            February/March) YYYY', 'The total mark for this paper is N.'
  body    : question start = lone digit line (sequential);
            part start = '(x)' line; roman '(i)' sub-parts supported;
            marks = '[N]' standalone line or trailing on the part text line.
  question-level marks (no parts: Q3 [5] / Q6 [20]) = '[N]' before any part.

Oracles (fail-closed):
  - question numbers strictly sequential 1..n
  - every part carries a printed mark
  - Section A (Q1-4) offered sum == 20 and each Section B essay (Q5+) == 20;
    cover printed total == 40 == 20 + one required 20-mark essay (CIE P1
    choice structure — disclosed, no normalization; the draft carries ALL
    offered questions verbatim)
"""
import json
import re
import sys

import fitz

SRC = "/home/z/my-project/g3-9609/qp-holdings"
OUT = "/home/z/my-project/g3-9609/qp-drafts"
ENGINE = "textlayer-qp-adr040-g4-cie9609-r0"
ENGINE_VERSION = "1.0.0"
APPLICATION = "T-SM-ROLLOUT adr040-g4-cie9609-levels-birth-r0"

TRANCHE = ["9609-W21-QP-11", "9609-W21-QP-12", "9609-W21-QP-13",
           "9609-S22-QP-11", "9609-S22-QP-12", "9609-S22-QP-13"]

RE_SESSION = re.compile(r"(May/June|October/November|February/March)\s+(\d{4})")
RE_TOTAL = re.compile(r"total mark for this paper is (\d{1,3})", re.I)
RE_CODE = re.compile(r"\b9609/(\d{2})\b")
RE_QSTART = re.compile(r"^(\d{1,2})\s*$")
RE_LETTER = re.compile(r"^\(([a-h])\)\s*(.*)$")
RE_ROMAN = re.compile(r"^\(([ivx]+)\)\s*(.*)$")
RE_MARKS_LINE = re.compile(r"^\[(\d{1,2})\]\s*$")
RE_MARKS_TAIL = re.compile(r"\[(\d{1,2})\]\s*$")
RE_FURNITURE = re.compile(r"^(9609/\d{2}/[MJON/]+\d{2,4}|\u00a9 UCLES \d{4}\s*|\[Turn over|DC \([A-Z]{2}\) \d+/?\d*)$")
RE_HEADER = re.compile(r"^9609/\d{2}/")


def parse_qp(stem):
    path = f"{SRC}/{stem}__qp.pdf"
    doc = fitz.open(path)
    pages = [doc[i].get_text("text") for i in range(doc.page_count)]
    npages = doc.page_count
    doc.close()

    # ── cover identity ──
    cover = pages[0]
    mcode = RE_CODE.search(cover)
    msession = RE_SESSION.search(cover)
    mtotal = RE_TOTAL.search(cover)
    mpaper = re.search(r"Paper\s+(\d+)\s+([A-Za-z][A-Za-z ]+)", cover)
    if not mcode:
        raise SystemExit(f"FAIL-CLOSED [{stem}]: no printed 9609/NN code on cover")
    if not mtotal:
        raise SystemExit(f"FAIL-CLOSED [{stem}]: no printed paper total on cover")
    code_component = mcode.group(1)
    printed_total = int(mtotal.group(1))
    session = None
    session_source = None
    if msession:
        session = f"{msession.group(1)} {msession.group(2)}"
        session_source = "qp cover printed series"
    else:
        # MS cover fallback (r1 session law)
        ms_path = f"/home/z/my-project/g3-9609/pp-holdings/{stem}__ms.pdf" if int(code_component[0]) >= 2 else None
        raise SystemExit(f"FAIL-CLOSED [{stem}]: no printed session on QP cover (ms fallback not implemented — inspect cover)")
    paper_title = (mpaper.group(0).strip() if mpaper else None)

    # ── body stream ──
    questions = []
    cur_q = None      # {number, stem_lines, parts, marks, qmark_seen}
    cur_part = None   # {label, text_lines, marks}
    cur_letter = None

    def finalize_part():
        nonlocal cur_part
        if cur_part is not None and cur_q is not None:
            cur_q["parts"].append({
                "label": cur_part["label"],
                "text": "\n".join(cur_part["text_lines"]).strip("\n"),
                "marks": cur_part["marks"],
            })
        cur_part = None

    def finalize_question():
        nonlocal cur_q
        finalize_part()
        if cur_q is not None:
            questions.append(cur_q)
        cur_q = None

    warnings = []
    for pi, ptext in enumerate(pages[1:], start=2):  # body pages after cover
        plines = [ln for ln in ptext.split("\n")]
        # drop a leading printed page number when the next line is the 9609 header
        if len(plines) >= 2 and plines[0].strip().isdigit() and RE_HEADER.match(plines[1].strip()):
            plines = plines[1:]
        for raw in plines:
            line = raw.strip()
            if line == "" or RE_FURNITURE.match(line):
                continue
            if line.startswith("[Turn over"):
                continue
            if line == "© UCLES 2020" or line.startswith("© UCLES"):
                continue

            m = RE_QSTART.match(line)
            if m and cur_part is not None and cur_part["marks"] is None:
                raise SystemExit(
                    f"FAIL-CLOSED [{stem}] p{pi}: question {m.group(1)} starts before part {cur_part['label']} has its printed mark")
            if m:
                qn = int(m.group(1))
                if cur_q is not None:
                    expected = cur_q["number"] + 1
                elif questions:
                    expected = questions[-1]["number"] + 1
                else:
                    expected = 1
                if qn != expected:
                    # stray bare digit (page furniture leaked) — keep as content
                    warnings.append(f"p{pi}: bare digit '{line}' inside Q{cur_q['number'] if cur_q else '?'} kept as content")
                    if cur_part is not None:
                        cur_part["text_lines"].append(raw)
                    elif cur_q is not None:
                        cur_q["stem_lines"].append(raw)
                    continue
                finalize_question()
                cur_q = {"number": qn, "stem_lines": [], "parts": [], "marks": None}
                cur_letter = None
                continue

            m = RE_LETTER.match(line)
            if m and cur_q is not None:
                finalize_part()
                cur_letter = m.group(1)
                cur_part = {"label": cur_letter, "text_lines": [], "marks": None}
                tail = (m.group(2) or "").strip()
                if tail:
                    rr = RE_ROMAN.match(tail)
                    if rr:
                        cur_part["label"] = f"{cur_letter}-{rr.group(1)}"
                        tail2 = (rr.group(2) or "").strip()
                        if tail2:
                            cur_part["text_lines"].append(tail2)
                    else:
                        mt = RE_MARKS_TAIL.search(tail)
                        if mt:
                            cur_part["marks"] = int(mt.group(1))
                            tail = tail[:mt.start()].strip()
                        if tail:
                            cur_part["text_lines"].append(tail)
                continue

            m = RE_ROMAN.match(line)
            if m and cur_q is not None and cur_letter is not None and cur_part is not None:
                finalize_part()
                cur_part = {"label": f"{cur_letter}-{m.group(1)}", "text_lines": [], "marks": None}
                tail = (m.group(2) or "").strip()
                if tail:
                    mt = RE_MARKS_TAIL.search(tail)
                    if mt:
                        cur_part["marks"] = int(mt.group(1))
                        tail = tail[:mt.start()].strip()
                    if tail:
                        cur_part["text_lines"].append(tail)
                continue

            m = RE_MARKS_LINE.match(line)
            if m:
                if cur_part is not None and cur_part["marks"] is None:
                    cur_part["marks"] = int(m.group(1))
                elif cur_part is None and cur_q is not None and cur_q["marks"] is None and not cur_q["parts"]:
                    cur_q["marks"] = int(m.group(1))  # question-level mark (Q3/Q6)
                elif cur_part is not None:
                    warnings.append(f"p{pi}: extra mark line [{m.group(1)}] after part {cur_part['label']} marked ({cur_part['marks']}) — kept as content")
                    cur_part["text_lines"].append(f"[{m.group(1)}]")
                continue

            # trailing marks on a content line
            mt = RE_MARKS_TAIL.search(line)
            if mt and cur_part is not None and cur_part["marks"] is None:
                cur_part["marks"] = int(mt.group(1))
                line = line[:mt.start()].strip()

            if cur_part is not None:
                cur_part["text_lines"].append(line)
            elif cur_q is not None:
                cur_q["stem_lines"].append(line)
            # else: pre-Q1 furniture (instructions) — ignored

    finalize_question()

    # ── oracles ──
    nums = [q["number"] for q in questions]
    offered = sum(sum(p["marks"] for p in q["parts"]) + (q["marks"] or 0) for q in questions)
    import os as _os
    debug_skip = _os.environ.get("G4M_DEBUG_SKIP_ORACLE") == "1"
    if not debug_skip:
        if nums != list(range(1, len(nums) + 1)):
            raise SystemExit(f"FAIL-CLOSED [{stem}]: question numbers {nums} not sequential 1..n")
        for q in questions:
            unmarked = [p["label"] for p in q["parts"] if p["marks"] is None]
            if unmarked:
                raise SystemExit(f"FAIL-CLOSED [{stem}]: Q{q['number']} parts without printed marks: {unmarked}")
            if not q["parts"] and q["marks"] is None:
                raise SystemExit(f"FAIL-CLOSED [{stem}]: Q{q['number']} carries neither parts nor a question-level mark")
        offered = sum(sum(p["marks"] for p in q["parts"]) + (q["marks"] or 0) for q in questions)
        section_a = sum(sum(p["marks"] for p in q["parts"]) + (q["marks"] or 0)
                        for q in questions if q["number"] <= 4)
        essays = {q["number"]: sum(p["marks"] for p in q["parts"]) + (q["marks"] or 0)
                  for q in questions if q["number"] > 4}
        if section_a != 20:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: Section A (Q1-4) offered sum {section_a} != 20")
        for qn, mm in essays.items():
            if mm != 20:
                raise SystemExit(f"FAIL-CLOSED [{stem}]: essay Q{qn} offered {mm} != 20")
        if printed_total != 40:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: cover printed total {printed_total} != 40 (CIE P1 structure)")
        if offered != 80:
            raise SystemExit(f"FAIL-CLOSED [{stem}]: offered sum {offered} != 80 (Section A 20 + three 20-mark essays)")

    warnings.append(
        "CIE P1 choice structure disclosed, not normalized: cover prints total 40 "
        "(Section A 20, all questions; Section B: three 20-mark essays offered, ONE required — "
        "80 offered marks carried verbatim in the draft questions)")

    # ── draft ──
    draft_questions = []
    for q in questions:
        stem_txt = "\n".join(q["stem_lines"]).strip("\n")
        parts = [{
            "partId": None,
            "label": p["label"],
            "text": p["text"],
            "marks": p["marks"],
            "qwc": False,
            "figures": [],
            "answerPrompts": [],
            "confidence": 0.85,
        } for p in q["parts"]]
        draft_questions.append({
            "questionId": f"{stem}#q{q['number']}",
            "number": q["number"],
            "numberingStyle": None,
            "section": None,
            "stem": stem_txt,
            "mcq": False,
            "options": [],
            "parts": parts,
            "figures": [],
            "tableElementIds": [],
            "marks": sum(p["marks"] for p in q["parts"]) + (q["marks"] or 0),
            "marksKnown": True,
            "qwc": False,
            "answerPrompts": [],
            "confidence": 0.85,
        })

    draft = {
        "schemaVersion": "glm-ocr-qp-v1+adr040-g4-cie9609-lane",
        "extractionMethod": f"{ENGINE} (deterministic PyMuPDF text-layer parse; lane {APPLICATION})",
        "reviewRequired": True,
        "paper": {
            "board": "Cambridge International",
            "qualification": None,
            "subject": None,
            "paperReference": f"9609/{code_component}",
            "logNumber": None,
            "publicationCode": None,
            "session": session,
            "examDate": None,
            "duration": None,
            "canonicalDocumentId": None,
        },
        "questions": draft_questions,
        "questionTotals": {str(q["number"]): q["marks"] for q in draft_questions},
        "paperTotal": printed_total,
        "sectionTotals": {},
        "frontMatterFigures": [],
        "warnings": warnings,
    }
    meta = {
        "stem": stem,
        "component": code_component,
        "paper_title": paper_title,
        "session": session,
        "session_source": session_source,
        "printed_total": printed_total,
        "offered_total": offered,
        "pages": npages,
        "questions": [(q["number"], q["marks"], [(p["label"], p["marks"]) for p in q["parts"]]) for q in draft_questions],
        "warnings": warnings,
    }
    return draft, meta


def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    results = []
    for stem in TRANCHE:
        draft, meta = parse_qp(stem)
        with open(f"{OUT}/{stem}.qp.json", "w") as f:
            json.dump(draft, f, ensure_ascii=False, indent=1)
        print(f"== {stem}: session={meta['session']!r} ({meta['session_source']}) component={meta['component']} "
              f"printed_total={meta['printed_total']} offered={meta['offered_total']}")
        for qn, marks, parts in meta["questions"]:
            print(f"   Q{qn} total={marks} parts={parts}")
        results.append(meta)
    json.dump(results, open(f"{OUT}/_meta.json", "w"), indent=1)
    print(f"\n{len(results)} QP drafts written -> {OUT}")


if __name__ == "__main__":
    main()
