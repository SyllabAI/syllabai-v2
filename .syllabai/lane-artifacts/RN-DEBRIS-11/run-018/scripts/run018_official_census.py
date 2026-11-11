#!/usr/bin/env python3
"""RN-DEBRIS-11 run-018 — evidence pass: official 9709 P1 (topic 1) row census of record.

Zero-invention law (run-009/013/016/017 family):
  1. The PDF is re-verified against the pins of record BEFORE any extraction
     (sha256 3a7a3769…6256 / sha1 997e5a9f…2e32 — run-009/016 continuity,
     source syllabai-resources @ 4e3a1c6843b0,
     Official-Specifications/cie-a-level-maths-2023-2025/597421-2023-2025-syllabus.pdf).
  2. Extraction: pdftotext -layout; the 9709 subject-content tables are
     statement|notes two-column blocks — the per-block notes gutter is the
     column of 'Notes and examples' in that block's 'Candidates should be
     able to:' header; statement text lives LEFT of the gutter, notes at/after
     it (EXCLUDED — statement-only law); bullet rows open with '•' at shallow
     indent; wrapped-continuation + display-math lines at statement indent are
     statement content; floating superscript/subscript tokens are pinned
     verbatim for the composed adjudication; running headers/footers deduped.
  3. Output: per-row raw token dump (line-structured, column-annotated) for
     the adjudication of record + the subtopic census. No assembled titles are
     produced here — assembly happens in the pinned adjudication table
     (run018_adjudication.py), which cites this dump.
"""
import hashlib, json, re, subprocess, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-018"
PDF = Path("/home/z/my-project/work/run018/9709-2023-2025-syllabus.pdf")
TXT = Path("/home/z/my-project/work/run018/9709_run018_layout.txt")

PINS = {
    "sha256": "3a7a37692399f47ff5e0d94cc41f9dd33d3b99467ce83aa4bad28c6136f96256",
    "sha1": "997e5a9f0d8b0eb2c2c51568f95b81bae78c2e32",
}
P1_HEADER = re.compile(r"^\s*1\s+Pure Mathematics 1 \(for Paper 1\)|^\s*1\s+Pure Mathematics 1\s*$")
SUB_RE = re.compile(r"^\s*(1\.[1-8])\s+(.+?)\s*$")
SECMARK = "Candidates should be able to:"


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


# ---------- 1. pin verification (before any extraction) ----------
data = PDF.read_bytes()
sha256 = hashlib.sha256(data).hexdigest()
sha1 = hashlib.sha1(data).hexdigest()
if sha256 != PINS["sha256"] or sha1 != PINS["sha1"]:
    fail(f"PDF pin mismatch: sha256 {sha256} sha1 {sha1}")
print(f"PIN-OK 9709-2023-2025-syllabus.pdf sha256 {sha256[:8]}…{sha256[-4:]} sha1 {sha1[:8]}…{sha1[-4:]} ({len(data)} bytes)")

if not TXT.exists():
    subprocess.run(["pdftotext", "-layout", str(PDF), str(TXT)], check=True)
raw_lines = TXT.read_text(encoding="utf-8").split("\n")
# CTRL strip law (BEL \x07 bold-marker glyph — run-013 RS-23 class; 9709 uses
# the same marker per run-017's census of the 0478 family origin)
lines = [l.replace("\x07", "") for l in raw_lines]
print(f"EXTRACT-OK {TXT} {len(lines)} n-lines (BEL stripped per CTRL-strip law)")

# NOTE: no bare-number pattern here — standalone bare-number lines inside the
# P1 subject-content range are floating fraction/superscript tokens (the ½
# stack of 1.4.2, the ⁿ of 1.6.1), NOT page footers; the footer lines in this
# range all carry the www/back-to-contents text and are matched below.
FOOTER_RE = re.compile(r"Back to contents page|www\.cambridgeinternational\.org|Cambridge International AS & A Level Mathematics 9709 syllabus")
FLOAT_RE = re.compile(r"^[12n](?:\s+[12n])?$")  # pinned float tokens: ½ stack parts, ⁿ (pdftotext may emit the statement-col and notes-col floats on ONE layout line)

# ---------- 2. locate the P1 topic-1 subject-content range ----------
# The subject content for Pure Mathematics 1 (Paper 1) runs from the
# '1  Pure Mathematics 1 (for Paper 1)' header (page 15) to the '2  Pure
# Mathematics 2' header. Bounded scan: find start, then the P2 start.
start = None
for i, l in enumerate(lines):
    if re.match(r"^\s*1\s+Pure Mathematics 1 \(for Paper 1\)\s*$", l):
        start = i
        break
if start is None:
    fail("P1 (for Paper 1) header not found")
end = None
for i in range(start + 1, len(lines)):
    if re.match(r"^\s*2\s+Pure Mathematics 2 \(for Paper 2\)\s*$", l := lines[i]) or re.match(r"^\s*2\s+Pure Mathematics 2\s*$", l):
        end = i
        break
if end is None:
    fail("P2 header not found (range end)")
print(f"RANGE-OK P1 content lines {start}..{end} ({end-start} lines)")

# ---------- 3. walk the blocks: subtopic headers + bullet rows ----------
blocks = []  # {sub, title, gutter, rows: [{bullet_idx, lines:[(col,text)]}]}
cur = None
row = None
i = start
while i < end:
    l = lines[i]
    m = SUB_RE.match(l)
    if m and "Candidates" not in l:
        cur = {"sub": m.group(1), "title": m.group(2).strip(), "gutter": None, "rows": []}
        blocks.append(cur)
        row = None
        i += 1
        continue
    if cur is not None and SECMARK in l:
        # notes gutter = column where 'Notes and examples' starts
        g = l.find("Notes and examples")
        if g == -1:
            g = l.find("Notes")
        cur["gutter"] = g
        row = None
        i += 1
        continue
    if cur is not None and cur["gutter"] is not None:
        stripped = l.strip()
        if stripped.startswith("•"):
            row = {"lines": []}
            # pre-bullet float capture: pinned stacked-fraction/superscript
            # tokens that pdftotext emitted ABOVE the bullet line (e.g. the
            # ½ numerator of 1.4.2, the ⁿ of 1.6.1). Look back over the
            # current contiguous run of float tokens only.
            allrows = cur.setdefault("rowsAll", [])
            for j in range(len(allrows) - 1, max(len(allrows) - 3, -1), -1):
                pj = cur["rowsAll"][j]
                ps = pj.strip()
                if ps and FLOAT_RE.match(ps) and not FOOTER_RE.search(pj):
                    pjcol = len(pj) - len(pj.lstrip())
                    # statement-column token only: left of the block gutter
                    stmt_part = pj.strip()
                    if cur["gutter"] is not None and pjcol >= cur["gutter"]:
                        stmt_part = stmt_part.split()[0]
                    else:
                        # keep only tokens STARTING left of the gutter
                        import re as _re
                        stmt_part = " ".join(
                            m.group(0) for m in _re.finditer(r"\S+", pj)
                            if m.start() < cur["gutter"]
                        ) or _re.search(r"\S+", pj).group(0)
                    row["lines"].insert(0, (pjcol, "FLOAT:" + stmt_part))
                else:
                    break
            cur["rows"].append(row)
        if row is not None and stripped and not FOOTER_RE.search(l) and not P1_HEADER.match(l) and not SUB_RE.match(l):
            row["lines"].append((len(l) - len(l.lstrip()), stripped))
    if cur is not None:
        cur.setdefault("rowsAll", []).append(l)
    i += 1

census = {b["sub"]: {"title": b["title"], "gutter": b["gutter"], "rows": len(b["rows"])} for b in blocks}
print("CENSUS:", json.dumps({k: v["rows"] for k, v in census.items()}))
expected = {"1.1": 5, "1.2": 5, "1.3": 5, "1.4": 2, "1.5": 5, "1.6": 4, "1.7": 4, "1.8": 4}
if {k: v["rows"] for k, v in census.items()} != expected:
    fail(f"census mismatch vs official structure of record: {census} != {expected}")
print("CENSUS-PASS 8 subtopics / 34 rows (5/5/5/2/5/4/4/4)")

# ---------- 4. per-row raw dump (statement column, gutter-annotated) ----------
out = {"artifact": "rn11-run018-official-9709-p1-census-r0", "pins": PINS,
       "range": [start, end], "census": census, "rows": []}
for b in blocks:
    for ridx, r in enumerate(b["rows"], 1):
        dump = []
        for col, txt in r["lines"]:
            # statement column = text left of the gutter; notes at/after gutter.
            # For annotation: split at the gutter, but keep both parts pinned.
            if col >= b["gutter"]:
                side = "NOTE-COL?"
                stmt = ""
            else:
                side = "STMT"
                stmt = txt
            dump.append({"col": col, "side": side, "text": txt})
        out["rows"].append({"row": f"{b['sub']}.{ridx}", "sub": b["sub"],
                            "subTitle": b["title"], "gutter": b["gutter"], "lines": dump})

ART.mkdir(parents=True, exist_ok=True)
op = ART / "official_9709_p1_census_r0.json"
op.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print(f"WRITE-OK {op} rows={len(out['rows'])}")

# ---------- 5. print the human-readable dump for adjudication ----------
for r in out["rows"]:
    print(f"===== {r['row']}  [{r['subTitle']}]  gutter={r['gutter']}")
    for ln in r["lines"]:
        print(f"   c{ln['col']:>3} | {ln['text']}")
