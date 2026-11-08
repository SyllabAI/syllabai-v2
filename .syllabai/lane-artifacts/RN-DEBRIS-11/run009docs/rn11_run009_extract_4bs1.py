#!/usr/bin/env python3
"""RN-DEBRIS-11 run-009 — F6 igcse-business-19 (4BS1) official title extraction.

Source of record: the official Pearson Edexcel International GCSE in Business
(4BS1) specification, Issue 2 – February 2026 © Pearson Education Limited 2026,
pinned upstream at syllabai-resources Official-Specifications/igcse-business/
9781446942765-international-gcse-business-specification.pdf.

Geometry of record (the Pearson two-column 'Subject content | What learners need
to study' table, the same family as the 4GE1 geography wreck run-008 repaired):
  * left-column rows carry the numbered sub-topic title ("1.3   Classification of")
  * the title WRAPS: the continuation word(s) sit on the next line at the left
    column indent ("      businesses") — the upstream parse took the first line
    only, which is the wreck: hub rows carry first-line truncation fragments.
Parse law: within the subject-content pages, a line matching ^N.M<gap>title opens
a row (the title part = text up to the first 2+ space gap before the right
column); a following line whose first token sits at raw col <= 26 and carries no
number/bullet glyph is the wrap continuation of the open row.
"""
import json, re

RUN = "/home/z/my-project/work/run009"
TXT = f"{RUN}/4bs1.txt"

ROW_RE = re.compile(r"^(\d)\.(\d) +(\S.*?) {2,}(?=\d\.\d\.\d|\S|$)")
# rows with no right-column content on the same line:
ROW_SOLO_RE = re.compile(r"^(\d)\.(\d) +(\S.*?)$")
SEC_RE = re.compile(r"^([1-5]) – (\S.*?)$")
# a wrap-continuation line: left-column text starting at raw col 2..26; the left
# column may SHARE the line with right-column content (2+ space gap separates).
CONT_LINE = re.compile(r"^\s{2,26}(\S(?:.*?\S)?)((?: {2,}\S.*)?)$")
PT_RE = re.compile(r"^\d\.\d\.\d")
STOP_RE = re.compile(r"^(Section \d|Assessment|Command words|Qualification aims|Appendix)")

def left_text(line):
    m = CONT_LINE.match(line.rstrip())
    if not m:
        return None
    return m.group(1).strip() or None

def main():
    lines = open(TXT).read().splitlines()
    rows = []      # {"n": "1.3", "words": [...]}
    sections = {}
    cur = None
    cur_open = False
    in_content = False
    for ln in lines:
        s = ln.rstrip("\n").rstrip()
        st = s.strip()
        if st == "Subject content":
            continue
        if re.match(r"^Section 2: Subject Content", st):
            in_content = True
            continue
        if not in_content or STOP_RE.match(st):
            continue
        m = SEC_RE.match(st)
        if m:
            sections[m.group(1)] = m.group(2)
            if cur:
                rows.append(cur)
                cur = None
            cur_open = False
            continue
        # numbered row opener (right column may carry 1.1.1 points or be empty)
        opened = None
        for rex in (ROW_RE, ROW_SOLO_RE):
            m = rex.match(s)
            if m:
                opened = m
                break
        if opened:
            if cur:
                rows.append(cur)
            title = opened.group(3).strip()
            cur = {"n": f"{opened.group(1)}.{opened.group(2)}", "words": [title]}
            cur_open = True
            continue
        if cur and cur_open:
            t = left_text(s)
            if t and not PT_RE.match(st) and not st.startswith("•"):
                cur["words"].append(t)
            else:
                cur_open = False   # first non-continuation line closes the wrap window
        # any other line (right-column points/bullets/page furniture) leaves cur open for a new row
    if cur:
        rows.append(cur)

    titles = {}
    for r in rows:
        titles[r["n"]] = " ".join(r["words"])
    print(f"sections: {sections}")
    print(f"rows extracted: {len(titles)}")
    for k in sorted(titles, key=lambda x: (int(x.split('.')[0]), int(x.split('.')[1]))):
        print(f"  {k}  «{titles[k]}»")
    json.dump({"sections": sections, "titles": titles},
              open("/tmp/run009/evidence_4bs1.json", "w"), indent=1, ensure_ascii=False)
    print("\nwrote /tmp/run009/evidence_4bs1.json")

if __name__ == "__main__":
    main()
