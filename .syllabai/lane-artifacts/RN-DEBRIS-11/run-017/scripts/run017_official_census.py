#!/usr/bin/env python3
"""RN-DEBRIS-11 run-017 — evidence pass: official 0478 row census of record.

Zero-invention law:
  1. The PDF is re-verified against the run-016 pins of record BEFORE any
     extraction (sha256 48cd6cf0…cbdb4 / sha1 bee666fb…2b20 — continuity:
     sha1 == upstream spec.json pin; official source
     cambridgeinternational.org/Images/595424-2023-2025-syllabus.pdf).
  2. Extraction = run-009/010/013/016 law family: pdftotext -layout;
     statement/notes column split (gutter cut: first 3+-space run whose right
     side starts at/after the notes gutter, else the first run whose right
     side begins a notes marker • / –); wrapped-continuation join;
     '(continued)' + running-header/footer dedupe; CTRL strip (the BEL \x07
     bold-marker glyph — the exact origin of the corpus garbage); notes
     column EXCLUDED (statement-only law).
  3. Asserts: structure (expected letters/romans per target row), leak
     detectors (notes vocabulary must not appear in assembled statements),
     no control chars, single-space joins — anti-invention + anti-truncation.
  4. Output: official row census for the cs-23 damage sections + per-row
     extract-line provenance.
"""
import hashlib, json, re, subprocess, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-017"
PDF = Path("/tmp/syllabai-resources/Official-Specifications/cie-igcse-computer-science-2023-2025/595424-2023-2025-syllabus.pdf")
TXT = Path("/tmp/0478_run017_layout.txt")

PINS = {
    "sha256": "48cd6cf03e2a29cdf6c106aee2677919a6b17b4b50a7ab6ddded1ca7633cbdb4",
    "sha1": "bee666fb57b27b01eb1e32e20ea8773aff1a2b20",
}
GUTTER = 55  # notes column starts at/after this layout column in this PDF

def fail(msg):
    print(f"FAIL: {msg}", flush=True); sys.exit(2)

# ---------- 1. pin verification (before any extraction) ----------
data = PDF.read_bytes()
sha256 = hashlib.sha256(data).hexdigest()
sha1 = hashlib.sha1(data).hexdigest()
if sha256 != PINS["sha256"] or sha1 != PINS["sha1"]:
    fail(f"PDF pin mismatch: sha256 {sha256} sha1 {sha1}")
print(f"PIN-OK 0478-2023-2025-syllabus.pdf sha256 {sha256[:8]}…{sha256[-4:]} sha1 {sha1[:8]}…{sha1[-4:]} ({len(data)} bytes)")

if not TXT.exists():
    subprocess.run(["pdftotext", "-layout", str(PDF), str(TXT)], check=True)
lines = TXT.read_text(encoding="utf-8").split("\n")
# BEL (\x07) is the PDF bold-marker glyph artifact — the exact origin of the
# corpus garbage BELs (upstream extractor kept it); law family: CTRL strip.
lines = [l.replace("\x07", "") for l in lines]
print(f"EXTRACT-OK {TXT} {len(lines)} n-lines (BEL stripped per CTRL-strip law)")

# Section signature law: a REAL section header is followed by the
# 'Candidates should be able to:' table marker within 4 lines — TOC entries,
# running headers and banner repeats never are. This is the content-page
# anchor (the 'Subject content' running header alternates pages).
SECMARK = re.compile(r"^\s*Candidates should be able to:")

def _has_mark(i):
    return any(SECMARK.match(lines[j]) for j in range(i + 1, min(i + 5, len(lines))))

def section_range(header_re):
    for i in range(len(lines)):
        if re.search(header_re, lines[i]) and _has_mark(i):
            return i
    fail(f"section header not found: {header_re}")

# bullet-column census is computed after SEC (scoped to the parsed ranges)

# ---------- 2. statement-column split (gutter law) ----------
def split_line(raw: str):
    """Return the statement-column text of a layout line (notes excluded).

    Laws: statement text lives LEFT of the notes gutter and its own
    continuation indent is shallow (< GUTTER); anything at/after GUTTER, or
    bullet/dash-marked, is notes. Cuts whose left side ends in a marker are
    mid-notes gaps (bullet -> its text), not statement cuts.
    """
    s = raw.replace("\t", " ")
    if not s.strip():
        return ""
    runs = list(re.finditer(r"(?<=\S)( {3,})(?=\S)", s))
    for m in runs:  # (1) fixed notes gutter
        if m.end() >= GUTTER:
            left = s[:m.start()].strip()
            if not left.endswith(("•", "–")):
                return left
    for m in runs:  # (2) marker-led notes column at any column
        right = s[m.end():].lstrip()
        left = s[:m.start()].strip()
        if right.startswith(("•", "–")) and not left.endswith(("•", "–")):
            return left
    st = s.strip()
    if st.startswith(("•", "–")):  # pure notes line (bullet/dash-led)
        return ""
    if len(s) - len(s.lstrip()) >= GUTTER:  # deep-indented notes continuation
        return ""
    return st

# ---------- 3. section location ----------

def find_end(start, next_headers):
    for i in range(start + 1, len(lines)):
        for nh in next_headers:
            if re.search(nh, lines[i]) and _has_mark(i):
                return i
    return len(lines)

SEC = {}
s = section_range(r"^\s{5,}1\.1\s+Number systems\s*$")
SEC["1.1"] = (s, find_end(s, [r"^\s{5,}1\.2\s+Text, sound and images\s*$"]))
s = section_range(r"^\s{5,}2\.1\s+Types and methods of data transmission\s*$")
SEC["2.1"] = (s, find_end(s, [r"^\s{5,}2\.2\s+Methods of error detection\s*$"]))
s = section_range(r"^\s{5,}3\.1\s+Computer architecture\s*$")
SEC["3.1"] = (s, find_end(s, [r"^\s{5,}3\.2\s+Input and output devices\s*$"]))
s = section_range(r"^\s{5,}3\.2\s+Input and output devices\s*$")
SEC["3.2"] = (s, find_end(s, [r"^\s{5,}3\.3\s+Data storage\s*$"]))
s = section_range(r"^\s{5,}3\.4\s+Network hardware\s*$")
SEC["3.4"] = (s, find_end(s, [r"^\s{5,}4\.1\s+Types of software and interrupts\s*$"]))
s = section_range(r"^\s{4,}7\s+Algorithm design and problem-solving\s*$")
SEC["7"] = (s, find_end(s, [r"^\s{4,}8\s+Programming\s*$"]))
s = section_range(r"^\s{4,}8\.1\s+Programming concepts\s*$")
SEC["8.1"] = (s, find_end(s, [r"^\s{4,}8\.2\s+Arrays\s*$"]))

# bullet-column census scoped to the parsed section ranges: mid-line notes
# bullets (3+ spaces before) must sit at/after GUTTER (the run's end position)
bullet_cols = [m.end()
               for a, b in SEC.values()
               for l in lines[a:b]
               for m in re.finditer(r"(?<=\S)( {3,})•", l)]
if bullet_cols and min(bullet_cols) < GUTTER:
    fail(f"mid-line notes bullet at column {min(bullet_cols)} < GUTTER {GUTTER}")
print(f"GUTTER-OK min mid-line bullet column in parsed ranges = {min(bullet_cols) if bullet_cols else 'n/a'} (>= {GUTTER})")

# ---------- 4. row parsing ----------
ROWHDR = re.compile(r"^\s*(\d{1,2})\s{2,}(\(([a-h])\))?\s*(.*)$")
LETHDR = re.compile(r"^\s*\(([a-h])\)\s*(.*)$")
ROMHDR = re.compile(r"^\s*\((x|i{1,3}|iv|vi{0,3}|ix)\)\s*(.*)$")
ROMORDER = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]

def parse_rows(sec_start, sec_end):
    rows = {}
    cur = None
    cur_letter = None
    for i in range(sec_start + 1, sec_end):
        line = lines[i]
        if re.search(r"Back to contents|www\.cambridgeinternational|Cambridge IGCSE Computer Science 0478", line):
            continue
        if re.match(r"^\s*\d{1,3}\s*$", line):  # bare page number
            continue
        if re.match(r"^\s*Candidates should be able to:", line):
            continue
        if re.match(r"^\s*\d{1,2}(?:\.\d+)?[\s]+\S.*\bcontinued\s*$", line):  # 'X.Y … continued'
            continue
        st = split_line(line)
        if not st:
            continue
        m = ROWHDR.match(st)
        if m:
            num = int(m.group(1))
            cur = num
            cur_letter = None
            r = rows.setdefault(num, {"letters": {}, "romans": {}, "plain": None, "lines": []})
            r["lines"].append(i + 1)
            rest = m.group(4).strip()
            if m.group(3):
                r["letters"].setdefault(m.group(3), "")
                r["letters"][m.group(3)] += rest
                cur_letter = m.group(3)
            else:
                r["plain"] = rest
            continue
        if cur is None:
            continue
        mr = ROMHDR.match(st)
        if mr and cur_letter:
            r = rows[cur]
            r["romans"].setdefault(cur_letter, {})
            r["romans"][cur_letter].setdefault(mr.group(1), "")
            r["romans"][cur_letter][mr.group(1)] += mr.group(2).strip()
            continue
        ml = LETHDR.match(st)
        if ml:
            r = rows[cur]
            r["letters"].setdefault(ml.group(1), "")
            r["letters"][ml.group(1)] += (" " if r["letters"][ml.group(1)] else "") + ml.group(2).strip()
            cur_letter = ml.group(1)
            continue
        r = rows[cur]
        if cur_letter and r["letters"].get(cur_letter) is not None:
            r["letters"][cur_letter] += " " + st
        elif r["plain"] is not None:
            r["plain"] += " " + st
        else:
            fail(f"orphan continuation line {i + 1} in section row {cur}: {st!r}")
    return rows

CENSUS = {}
for sec, (a, b) in SEC.items():
    CENSUS[sec] = parse_rows(a, b)
    print(f"SECTION {sec}: lines {a+1}–{b}, rows {sorted(CENSUS[sec].keys())}")

def assemble(sec, num):
    r = CENSUS[sec][num]
    parts, srcs = [], list(r["lines"])
    if r["plain"]:
        parts.append(r["plain"])
    for letter in sorted(r["letters"].keys()):
        t = f"({letter}) {r['letters'][letter]}"
        romans = r["romans"].get(letter, {})
        for rk in sorted(romans, key=ROMORDER.index):
            t += f" ({rk}) {romans[rk]}"
        parts.append(t)
    return " ".join(parts), srcs

TARGETS = {
    "1.1.2": ("1.1", 2), "1.1.4": ("1.1", 4),
    "2.1.1": ("2.1", 1), "2.1.2": ("2.1", 2),
    "3.1.1": ("3.1", 1), "3.1.2": ("3.1", 2), "3.2.3": ("3.2", 3), "3.4.3": ("3.4", 3),
    "7.5": ("7", 5),
    "8.1.4": ("8.1", 4),
}
EXPECT = {  # structure asserts (letters; romans per letter) — from the raw dumps
    "1.1.2": {"letters": ["a", "b"], "romans": {"b": ["i", "ii", "iii"]}},
    "1.1.4": {"letters": ["a", "b"], "romans": {}},
    "2.1.1": {"letters": ["a", "b", "c"], "romans": {}},
    "2.1.2": {"letters": ["a", "b"], "romans": {}},
    "3.1.1": {"letters": ["a", "b"], "romans": {}},
    "3.1.2": {"letters": ["a", "b"], "romans": {}},
    "3.2.3": {"letters": ["a", "b"], "romans": {}},
    "3.4.3": {"letters": ["a", "b"], "romans": {}},
    "7.5":   {"letters": ["a", "b"], "romans": {}},
    "8.1.4": {"letters": ["a", "b", "c", "d", "e", "f"], "romans": {}},
}
# notes-vocabulary leak detectors: these phrases live ONLY in the notes column
LEAK = ["Including", "Limited to", "e.g.", "i.e.", "such as", "Candidates will not",
        "A packet of data contains", "see section 4", "See section 4"]

census_rows = {}
for code, (sec, num) in TARGETS.items():
    text, srcs = assemble(sec, num)
    ex = EXPECT[code]
    if sorted(CENSUS[sec][num]["letters"].keys()) != sorted(ex["letters"]):
        fail(f"{code} letters {sorted(CENSUS[sec][num]['letters'])} != {ex['letters']}")
    for letter, roms in ex["romans"].items():
        got = sorted(CENSUS[sec][num]["romans"].get(letter, {}).keys(), key=ROMORDER.index)
        if got != roms:
            fail(f"{code}({letter}) romans {got} != {roms}")
    for leak in LEAK:
        if leak in text:
            fail(f"{code} notes-column leak {leak!r}: {text!r}")
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", text):
        fail(f"{code} control char in assembled text")
    if "  " in text or "•" in text:
        fail(f"{code} double-space or bullet in assembled text: {text!r}")
    census_rows[code] = {"official": text, "extractLines": srcs,
                         "letters": sorted(CENSUS[sec][num]["letters"].keys())}
    print(f"\nOFFICIAL {code} (lines {srcs}):\n  {text}")

# sub-row statements needed by the partition repair + proposal map
sub = {}
r4 = CENSUS["8.1"][4]
sub["8.1.4f"] = r4["letters"]["f"].strip()
r6 = CENSUS["8.1"][6]
for L in sorted(r6["letters"]):
    sub[f"8.1.6{L}"] = r6["letters"][L].strip()
sub["8.1.5"] = CENSUS["8.1"][5]["plain"].strip()
sub["8.1.7"] = CENSUS["8.1"][7]["plain"].strip()
sub["7.5a"] = CENSUS["7"][5]["letters"]["a"].strip()
sub["7.5b"] = CENSUS["7"][5]["letters"]["b"].strip()
print("\nSUB-ROWS:", json.dumps(sub, indent=1, ensure_ascii=False))

out = {
    "artifact": "rn11-run-017-official-0478-census-r0",
    "pins": {
        "pdf": "0478-2023-2025-syllabus.pdf (595424-2023-2025-syllabus.pdf)",
        "sha256": sha256, "sha1": sha1,
        "continuity": "== run-016 pins of record, re-verified byte-exact this run BEFORE extraction; sha1 == upstream spec.json pin",
        "sourceUrl": "https://www.cambridgeinternational.org/Images/595424-2023-2025-syllabus.pdf",
        "resourcesTip": "syllabai-resources @ 4e3a1c6843b0 (sparse blobless clone, the run-009/016 fetch tip of record)",
    },
    "law": ("pdftotext -layout; gutter column split (notes excluded — statement-only law); "
            "wrapped-continuation join; '(continued)'/running-header/footer dedupe; CTRL strip "
            "(the BEL bold-marker glyph); tabs normalized; lettered + roman markers preserved doc-verbatim; "
            "leak-detector asserts green"),
    "sectionsParsed": {k: {"extractLines": [v[0] + 1, v[1]],
                           "convention": "pdftotext -layout, LF-split, BEL-stripped, 1-based"}
                       for k, v in SEC.items()},
    "rows": census_rows,
    "subRows": sub,
}
ART.mkdir(parents=True, exist_ok=True)
(ART / "official_0478_census_r0.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print("\nCENSUS-OK -> .syllabai/lane-artifacts/RN-DEBRIS-11/run-017/official_0478_census_r0.json")
