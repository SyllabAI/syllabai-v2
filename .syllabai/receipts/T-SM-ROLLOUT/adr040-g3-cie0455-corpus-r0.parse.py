#!/usr/bin/env python3
"""G-3 CIE 0455 — B/C-grammar band-grid parser v3.

v3 changes (after second-pass diagnosis):
  1. Marks extraction via the page-header 'Marks' column x-coordinate
     (2021+ layouts wrap guidance text around the marks digit, so the
     line-final rule fails); line-final rule kept as fallback.
  2. Label binding tolerance: the part label may sit on the SAME visual row
     as the grid header (w21_21: '3(d) Discuss ... 8  Level Description Marks').
  3. Grammar C anchor tolerant to the heading wrapping across two lines.
Carried from v2: grammars A/B, cross-page continuation merge, bare-label
regex, zero-row exclusion, fail-closed oracle.
"""
import json
import os
import re
from collections import defaultdict

import fitz

RAW = "/home/z/my-project/g3-corpus/raw-xt"
OUT = "/home/z/my-project/g3-corpus/drafts"
os.makedirs(OUT, exist_ok=True)

SCHEMA = "glm-ocr-ms-v1+adr040-g3-cie-bgrammar-r0"
METHOD = ("textlayer-tables-adr040-g3-cie-r2 (deterministic PyMuPDF word-box parse; "
          "header grammars A 'Level|Descriptors|Mark', B 'Level|Description|Marks', "
          "C end-of-MS 'Guidance table for Question N(d),...' with printed per-part "
          "pointers; marks read from the page-header Marks column x; cross-page "
          "continuation merge; en-dash ranges normalized; descriptors verbatim; "
          "zero-row excluded per wave-1 convention)")

LABEL_RE = re.compile(r"^\s*(\d)\(([a-h])\)\s*(.*)$")
RANGE_RE = re.compile(r"^(\d+)\s*[–-]\s*(\d+)$")
C_HEAD_RE = re.compile(r"Guidance table for Question")


def session_dirname(fn):
    code = fn[5:8]
    v = fn[-2:]
    kind = {"s": "06", "w": "11", "m": "03"}[code[0]]
    year = "20" + code[1:3]
    return f"{year}-{kind}", f"0455-{code.upper()}-QP-{v}"


def words(page):
    return list(page.get_text("words"))


def group_lines(ws, tol=2.5):
    lines = defaultdict(list)
    for w in ws:
        lines[round(w[1] / tol)].append(w)
    return [(min(w[1] for w in row), sorted(row, key=lambda w: w[0]))
            for k, row in sorted(lines.items())]


def line_text(row):
    return " ".join(w[4] for w in row)


def marks_column_x(lines):
    """x of the 'Marks'/'Mark' header word on the page header row."""
    for y, row in lines:
        txt = line_text(row)
        if "Question" in txt and "Answer" in txt and re.search(r"\bMarks?\b", txt):
            mw = [w for w in row if w[4] in ("Marks", "Mark")]
            if mw:
                return (mw[0][0] + mw[0][2]) / 2
    return None


def part_labels(lines, mx):
    bucket = defaultdict(list)
    for y, row in lines:
        for w in row:
            bucket[round(y)].append(w)

    def lines_row_bucket(lines_, y_):
        out = []
        for yy, ww in bucket.items():
            if abs(yy - y_) <= 12:
                out += ww
        return out

    out = []
    for y, row in lines:
        txt = line_text(row)
        m = LABEL_RE.match(txt)
        if m and "Example of" not in txt \
                and not txt.lstrip().startswith("Guidance table for Question"):
            marks = None
            if mx is not None and m.group(3).strip():
                # y-band marks fallback only for real (stem-bearing) label lines;
                # bare continuation labels must not guess marks
                cands = [w for w in row if re.fullmatch(r"\d{1,2}", w[4])
                         and abs((w[0] + w[2]) / 2 - mx) < 60]
                if not cands:
                    # marks digit may sit a line below/above the label token
                    # (wrapped stems): scan the y-band
                    cands = [w for w in lines_row_bucket(lines, y)
                             if re.fullmatch(r"\d{1,2}", w[4])
                             and abs((w[0] + w[2]) / 2 - mx) < 60]
                if cands:
                    marks = int(min(cands, key=lambda w: abs((w[0] + w[2]) / 2 - mx))[4])
            if marks is None and m.group(3).strip():
                nums = re.findall(r"(\d+)\s*$", txt)
                marks = int(nums[-1]) if nums else None
            out.append({"y": y, "x": row[0][0], "number": int(m.group(1)),
                        "part": m.group(2), "stem": m.group(3).strip(), "marks": marks})
    return out


def find_headers(lines):
    heads = []
    for y, row in lines:
        txt = line_text(row)
        if re.search(r"\bLevel\b", txt) and (
            ("Descriptors" in txt and re.search(r"\bMark\b", txt))
            or ("Description" in txt and re.search(r"\bMarks?\b", txt))
        ):
            lw = [w for w in row if w[4] == "Level"][0]
            mw = [w for w in row if w[4] in ("Marks", "Mark", "Descriptors",
                                              "Description")]
            heads.append({"y": y, "level_x0": lw[0],
                          "marks_col_x": min((w[0] + w[2]) / 2 for w in mw
                                             if w[4] in ("Marks", "Mark"))
                          if any(w[4] in ("Marks", "Mark") for w in mw) else None,
                          "text": txt})
    return heads


def find_c_anchor(lines):
    """Grammar C heading; part list may wrap to the next line."""
    for i, (y, row) in enumerate(lines):
        txt = line_text(row)
        if C_HEAD_RE.search(txt):
            blob = txt
            if i + 1 < len(lines):
                blob += " " + line_text(lines[i + 1][1])
            parts = re.findall(r"(\d)\(([a-h])\)", blob)
            if parts:
                return y, [(int(n), p) for n, p in parts]
    return None, []


def parse_rows(ws, hdr_y, level_x0, end_y, marks_col_x=None):
    table_x0 = level_x0 - 8
    zone_x = (marks_col_x - 25) if marks_col_x else (level_x0 + 30)
    rows_ws = [w for w in ws if hdr_y + 2 < w[1] < end_y and w[0] >= table_x0]
    if not rows_ws:
        return []
    digits = sorted([w for w in rows_ws
                     if w[4] in ("3", "2", "1", "0") and abs(w[0] - level_x0) < 15],
                    key=lambda w: w[1])
    if not digits:
        return []
    # Range candidates: words in the marks column zone (right of the header
    # 'Mark(s)' word). The cell may be vertically offset from its row digit and
    # the range may split across tokens ('1' '–' '2'), so accumulate zone words
    # in y-order into a buffer and emit a candidate whenever the buffer matches
    # a full range. k-th candidate (top-down) binds to the k-th ranged row
    # (3,2,1 — the universal printed row order); the oracle validates tiling.
    zone_words = sorted([w for w in rows_ws if w[0] >= zone_x], key=lambda w: w[1])
    range_cands = []
    zero_cands = []
    buf = ""
    for w in zone_words:
        t = w[4]
        # dash variants: U+F02D private-use hyphen (2022-era embeds), U+2212 minus,
        # U+2010/2011 hyphens — normalized for RANGE matching only
        tn = t.replace("\uf02d", "-").replace("\u2212", "-").replace("\u2010", "-").replace("\u2011", "-")
        m = RANGE_RE.match(tn)
        if m:  # single-token range e.g. '6–8' / '6\uf02d8' / '6-8'
            range_cands.append(((int(m.group(1)), int(m.group(2))), w[1]))
            buf = ""
        elif re.fullmatch(r"\d{1,2}", tn) or tn in ("–", "-", "−"):
            buf += tn.replace("–", "-").replace("−", "-")
            m2 = re.fullmatch(r"(\d{1,2})\s*-\s*(\d{1,2})", buf)
            if m2:  # split-token range e.g. '1' '–' '2'
                range_cands.append(((int(m2.group(1)), int(m2.group(2))), w[1]))
                buf = ""
            elif buf == "0":
                zero_cands.append((w[1], w))
                buf = ""
        else:
            buf = ""
    bands = []
    ranged = [d for d in digits if d[4] in ("3", "2", "1")]
    for i, d in enumerate(digits):
        y0 = d[1] - 2
        y1 = digits[i + 1][1] - 2 if i + 1 < len(digits) else end_y
        row_words = sorted([w for w in rows_ws if y0 <= w[1] < y1 and w[0] < zone_x],
                           key=lambda w: (round(w[1]), w[0]))
        desc_words = [w[4] for w in row_words]
        rng = None
        if d[4] in ("3", "2", "1"):
            k = next(j for j, dd in enumerate(ranged) if dd is d)
            if k < len(range_cands):
                rng = range_cands[k][0]
        else:  # zero row
            if any(y0 - 4 <= zy < y1 for zy, _ in zero_cands):
                rng = (0, 0)
        bands.append({"level": int(d[4]), "range": rng,
                      "descriptor": " ".join(desc_words).strip()})
    return bands


def end_bound(ws, hdr_y, table_x0):
    # group words into visual lines to inspect label-line content
    lines = defaultdict(list)
    for w in ws:
        lines[round(w[1] / 2.5)].append(w)
    rows = [(min(w[1] for w in r), sorted(r, key=lambda w: w[0]))
            for r in lines.values()]
    end_y = max(w[3] for w in ws) + 1
    for y, row in sorted(rows):
        if y <= hdr_y + 5:
            continue
        txt = " ".join(w[4] for w in row)
        first = row[0]
        t = first[4]
        # next question's label token (left column) ends the region — unless the
        # line is an 'Example of' block of the SAME question (left column, already
        # excluded by the x filter; its label token must not cut the table).
        if first[0] < table_x0 and re.match(r"^\d\([a-h]$", t) \
                and "Example of" not in txt:
            return y - 3
        if t == "Level" and y > hdr_y + 5:
            return y - 3
        if t.startswith("©"):
            return y - 3
    return end_y


def oracle(lab_marks, by_level):
    if not {"3", "2", "1"}.issubset({str(k) for k in by_level}):
        return f"missing levels, got {sorted(by_level)}"
    if lab_marks is None:
        return "part label has no printed marks"
    l3, l2, l1 = by_level[3], by_level[2], by_level[1]
    if l3["range"] is None or l2["range"] is None or l1["range"] is None:
        return "missing range token on a level row"
    if l3["range"][1] != lab_marks:
        return f"L3 max {l3['range'][1]} != part marks {lab_marks}"
    if l3["range"][0] != l2["range"][1] + 1:
        return f"L3 min {l3['range'][0]} != L2 max+1 {l2['range'][1] + 1}"
    if l2["range"][0] != l1["range"][1] + 1:
        return f"L2 min {l2['range'][0]} != L1 max+1 {l1['range'][1] + 1}"
    if not l3["descriptor"] or not l2["descriptor"] or not l1["descriptor"]:
        return "blank descriptor"
    return None


def make_entry(label, marks, by_level):
    return {
        "entryId": None, "label": label, "number": int(label[0]), "qwc": False,
        "mcq": False, "correctOption": None, "answerText": None, "markPoints": [],
        "guidance": [], "marks": marks,
        "marksCellSource": "level-descriptors-mark-table", "confidence": 0.9,
        "bands": [{"level": lv, "marksMin": by_level[lv]["range"][0],
                   "marksMax": by_level[lv]["range"][1],
                   "descriptor": by_level[lv]["descriptor"]} for lv in (3, 2, 1)],
    }


def parse_paper(path, trace=False):
    doc = fitz.open(path)
    entries, errors = [], []
    notes = defaultdict(int)
    grammars = set()
    pending = None
    registry = {}
    last_mx = None
    # grammar C via printed pointers: (d) label lines whose guidance says
    # 'See Guidance table at the end of the mark scheme.' — the document's own
    # binding instruction. Collected in a pre-pass, consumed by the first
    # header that has no label and no pending after the pointer pages.
    c_bindings = []
    for ppage in doc:
        plines = group_lines(words(ppage))
        pmx = marks_column_x(plines)
        for y, row in plines:
            txt = line_text(row)
            if "See Guidance table at the end" in txt:
                m = LABEL_RE.match(txt)
                if m:
                    nums = re.findall(r"(\d+)\s*$", txt)
                    cand = [w for w in row if re.fullmatch(r"\d{1,2}", w[4])
                            and pmx and abs((w[0] + w[2]) / 2 - pmx) < 60]
                    marks = int(cand[0][4]) if cand else (int(nums[-1]) if nums else None)
                    c_bindings.append({"label": f"{m.group(1)}({m.group(2)})",
                                       "marks": marks})

    for pno, page in enumerate(doc):
        ws = words(page)
        lines = group_lines(ws)
        mx = marks_column_x(lines) or last_mx
        last_mx = mx
        labels = part_labels(lines, mx)
        for l in labels:
            if l["marks"] is not None:
                registry[(l["number"], l["part"])] = l["marks"]
        if trace:
            print(f"  p{pno+1}: mx={mx and round(mx)} labels={[(l['number'],l['part'],l['marks']) for l in labels]}")

        c_y, c_list = find_c_anchor(lines)
        headers = find_headers(lines)
        consumed = set()
        if trace:
            print(f"        headers={[(round(h['y']), h['text'][:40]) for h in headers]}")

        if c_list and c_y is not None:
            under = [h for h in headers if h["y"] > c_y]
            if under:
                h = under[0]
                consumed.add(id(h))
                end_y = end_bound(ws, h["y"], h["level_x0"] - 8)
                rows = parse_rows(ws, h["y"], h["level_x0"], end_y, h["marks_col_x"])
                by_level = {b["level"]: b for b in rows}
                for (n, p) in c_list:
                    marks = registry.get((n, p))
                    err = oracle(marks, by_level)
                    if err:
                        errors.append({"page": pno + 1, "label": f"{n}({p})",
                                       "error": f"grammarC: {err}"})
                    else:
                        entries.append(make_entry(f"{n}({p})", marks, by_level))
                        notes["zero_rows_excluded"] += 1
                pending = None

        for h in headers:
            if id(h) in consumed:
                continue
            prior = [l for l in labels
                     if l["y"] <= h["y"] + 3 and l["x"] < h["level_x0"] - 20]
            if prior:
                lab = prior[-1]
                g = "A" if "Descriptors" in h["text"] else "B"
                grammars.add(g)
                notes[f"tables_grammar_{g}"] += 1
                end_y = end_bound(ws, h["y"], h["level_x0"] - 8)
                rows = parse_rows(ws, h["y"], h["level_x0"], end_y, h["marks_col_x"])
                lab_key = f"{lab['number']}({lab['part']})"
                same_grid = pending is not None and pending["label"] == lab_key
                merged = (pending["rows"] + rows) if same_grid else rows
                if not merged:
                    errors.append({"page": pno + 1, "label": lab_key,
                                   "error": "grid produced no rows"})
                    continue
                # trailing zero-row fragment of an already-resolved grid?
                if pending is None and {b["level"] for b in merged} == {0}:
                    notes["trailing_zero_fragments"] += 1
                    continue
                by_level = {b["level"]: b for b in merged}
                marks = lab["marks"] if lab["marks"] is not None else registry.get((lab["number"], lab["part"]))
                marks_note = None
                if marks is None and by_level.get(3) and by_level[3]["range"]:
                    # disclosed fallback (w24_22/23 template quirk): the label
                    # cell carries non-numeric guidance text and no marks digit
                    # is printed on the label line; the part marks are taken as
                    # the grid's own top-band max (tiling self-consistent, and
                    # disclosed in parseNotes — never silently).
                    marks = by_level[3]["range"][1]
                    marks_note = f"marks_from_grid_tiling(label cell non-numeric): {lab_key}={marks}"
                    notes["marks_from_grid_tiling"] += 1
                err = oracle(marks, by_level)
                if err:
                    if pending is not None and not same_grid:
                        errors.append({"page": pending["page"], "label": pending["label"],
                                       "error": f"unresolved pending: {oracle(pending['marks'], {b['level']: b for b in pending['rows']})}"})
                    pending = {"label": lab_key, "marks": marks, "rows": merged,
                               "page": pno + 1, "level_x0": h["level_x0"],
                               "marks_col_x": h["marks_col_x"]}
                else:
                    # same_grid: the pending rows were consumed by this merge —
                    # resolution, not an error. Unrelated pending: flush as error.
                    if pending is not None and not same_grid:
                        errors.append({"page": pending["page"], "label": pending["label"],
                                       "error": f"unresolved pending: {oracle(pending['marks'], {b['level']: b for b in pending['rows']})}"})
                    pending = None
                    entries.append(make_entry(lab_key, marks, by_level))
                    if marks_note:
                        notes.setdefault("marks_fallback_notes", []).append(marks_note)
                    if by_level.get(0):
                        notes["zero_rows_excluded"] += 1
            else:
                # trailing zero-row fragment of an already-resolved grid?
                rows_z = parse_rows(ws, h["y"], h["level_x0"],
                                    end_bound(ws, h["y"], h["level_x0"] - 8),
                                    h["marks_col_x"])
                if rows_z and {b["level"] for b in rows_z} == {0} and pending is None \
                        and not c_bindings:
                    notes["trailing_zero_fragments"] += 1
                elif pending is not None:
                    end_y = end_bound(ws, h["y"], h["level_x0"] - 8)
                    rows = parse_rows(ws, h["y"], h["level_x0"], end_y, h["marks_col_x"])
                    pending["rows"] += rows
                    by_level = {b["level"]: b for b in pending["rows"]}
                    if not oracle(pending["marks"], by_level):
                        entries.append(make_entry(pending["label"], pending["marks"], by_level))
                        if by_level.get(0):
                            notes["zero_rows_excluded"] += 1
                        pending = None
                elif c_bindings:
                    # grammar C via pointers: end-of-MS generic table
                    grammars.add("C")
                    end_y = end_bound(ws, h["y"], h["level_x0"] - 8)
                    rows = parse_rows(ws, h["y"], h["level_x0"], end_y, h["marks_col_x"])
                    by_level = {b["level"]: b for b in rows}
                    for cb in c_bindings:
                        n, p = cb["label"][0], cb["label"][2]
                        marks = cb["marks"] if cb["marks"] is not None else registry.get((int(n), p))
                        err = oracle(marks, by_level)
                        if err:
                            errors.append({"page": pno + 1, "label": cb["label"],
                                           "error": f"grammarC: {err}"})
                        else:
                            entries.append(make_entry(cb["label"], marks, by_level))
                            if by_level.get(0):
                                notes["zero_rows_excluded"] += 1
                    c_bindings = []
                else:
                    errors.append({"page": pno + 1, "error": "no preceding part label"})

        # headerless grid start (s22_21 4(d): a full grid with no 'Level' header
        # at all; w23_22 2(d): headerless across two pages): a stem-bearing
        # label with printed marks + a digit column that tiles -> emit or open
        # a pending. Oracle-gated; only when no header exists on the page.
        if pending is None and not headers and not c_bindings:
            stem_labels = [l for l in labels if l["stem"] and l["marks"] is not None]
            digit_ws = [w for w in ws if w[4] in ("3", "2", "1", "0")]
            cand_xs = sorted({round(w[0]) for w in digit_ws},
                             key=lambda x: -sum(1 for w in digit_ws
                                                if round(w[0]) == x))
            min_digit_y = min((w[1] for w in digit_ws), default=None)
            # the grid's own label = the nearest stem-bearing label ABOVE the
            # digit column (a page may carry several labels; only the one above
            # the table owns it)
            lab = None
            if min_digit_y is not None:
                above = [l for l in stem_labels if l["y"] < min_digit_y]
                if above:
                    lab = above[-1]
            if lab is not None:
                lab_key = f"{lab['number']}({lab['part']})"
                for cx in cand_xs:
                    col_digits = [w for w in digit_ws if abs(w[0] - cx) < 15]
                    if not col_digits:
                        continue
                    hdr_y = min(w[1] for w in col_digits) - 8
                    end_y = end_bound(ws, hdr_y, cx - 8)
                    rows = parse_rows(ws, hdr_y, cx, end_y, None)
                    if not rows:
                        continue
                    by_level = {b["level"]: b for b in rows}
                    err = oracle(lab["marks"], by_level)
                    if trace:
                        print(f"    RULE-ORACLE p{pno+1}: err={err}")
                    if not err:
                        # full headerless grid
                        entries.append(make_entry(lab_key, lab["marks"], by_level))
                        if by_level.get(0):
                            notes["zero_rows_excluded"] += 1
                        notes["headerless_grids"] += 1
                        break
                    # partial fragment: open a pending for later pages. A real
                    # grid fragment carries printed marks-range tokens — stray
                    # marks/guidance digit columns ('1','2', '0','1') do not.
                    if len(rows) >= 2 and any(b["range"] for b in rows) \
                            and {str(b["level"]) for b in rows} & {"3", "2", "1"}:
                        pending = {"label": lab_key, "marks": lab["marks"],
                                   "rows": rows, "page": pno + 1,
                                   "level_x0": cx, "marks_col_x": None}
                        notes["headerless_grids"] += 1
                        if trace:
                            print(f"    HLESS-START {lab_key} p{pno+1} rows={[(b['level'], b['range']) for b in rows]}")
                        break

        # headerless continuation (w20_23-style: rows continue with no repeated
        # header): if a grid is pending and this page offered it nothing, scan
        # the page top for orphan level digits in the pending table's column.
        if pending is not None and not headers:
            # continuation with no repeated header; the fragment's level column
            # may be indented differently (s22_22: +47pt) — try candidate digit
            # columns, keep the first whose merged rows tile (oracle-gated)
            digit_ws = [w for w in ws if w[4] in ("3", "2", "1", "0")]
            cand_xs = sorted({round(w[0]) for w in digit_ws},
                             key=lambda x: -sum(1 for w in digit_ws if round(w[0]) == x))
            for cx in cand_xs:
                col_digits = [w for w in digit_ws if abs(w[0] - cx) < 15]
                if not col_digits:
                    continue
                hdr_y = min(w[1] for w in col_digits) - 8
                end_y = end_bound(ws, hdr_y, cx - 8)
                rows = parse_rows(ws, hdr_y, cx, end_y, pending.get("marks_col_x"))
                if not rows:
                    continue
                trial = pending["rows"] + rows
                by_level = {b["level"]: b for b in trial}
                if not oracle(pending["marks"], by_level):
                    pending["rows"] = trial
                    entries.append(make_entry(pending["label"], pending["marks"], by_level))
                    if by_level.get(0):
                        notes["zero_rows_excluded"] += 1
                    pending = None
                    notes["headerless_continuations"] += 1
                    if trace:
                        print(f"    HLESS-MERGE {pending}")
                    break

    if pending is not None:
        errors.append({"page": pending["page"], "label": pending["label"],
                       "error": f"unresolved pending: {oracle(pending['marks'], {b['level']: b for b in pending['rows']})}"})
    doc.close()
    return entries, errors, dict(notes), sorted(grammars)


summary = []
import sys
if len(sys.argv) > 2 and sys.argv[1] == "--trace":
    fn = sys.argv[2]
    print(f"TRACE {fn}")
    entries, errors, notes, grammars = parse_paper(os.path.join(RAW, fn + ".pdf"), trace=True)
    print("entries:", [(e["label"], e["marks"]) for e in entries])
    print("errors:", errors)
    sys.exit(0)
for fn in sorted(f[:-4] for f in os.listdir(RAW)
                 if f.endswith(".pdf") and re.match(r"0455_[smw]\d\d_ms_\d\d\.pdf", f)):
    session, paper_dir = session_dirname(fn)
    entries, errors, notes, grammars = parse_paper(os.path.join(RAW, fn + ".pdf"))
    draft = {
        "schemaVersion": SCHEMA,
        "extractionMethod": METHOD,
        "reviewRequired": True,
        "paper": {
            "code": "0455", "session": session, "paper": paper_dir,
            "repo_path": f"past-papers/cambridge-international/igcse/economics/0455/"
                         f"past-papers/{session}/{paper_dir}",
            "source_pdf": fn + ".pdf",
        },
        "entries": entries,
        "parseNotes": [
            f"headerGrammars={grammars}",
            f"zero_rows_excluded={notes.get('zero_rows_excluded', 0)}",
            f"trailing_zero_fragments={notes.get('trailing_zero_fragments', 0)}",
            f"headerless_continuations={notes.get('headerless_continuations', 0)}",
            f"headerless_grids={notes.get('headerless_grids', 0)}",
            f"marks_from_grid_tiling={notes.get('marks_from_grid_tiling', 0)}",
        ]
        + [f"note:{n}" for n in notes.get("marks_fallback_notes", [])]
        + [f"error:{e}" for e in errors],
    }
    ddir = os.path.join(OUT, session, paper_dir)
    os.makedirs(ddir, exist_ok=True)
    with open(os.path.join(ddir, "ms.draft.json"), "w") as f:
        json.dump(draft, f, indent=1, ensure_ascii=False)
    summary.append({"file": fn, "session": session, "paper": paper_dir,
                    "entries": len(entries), "bands": sum(len(e["bands"]) for e in entries),
                    "errors": len(errors), "grammars": grammars})
    print(f"{fn}: entries={len(entries)} bands={sum(len(e['bands']) for e in entries)} "
          f"errors={len(errors)} grammars={grammars}", flush=True)

json.dump(summary, open("/home/z/my-project/g3-corpus/parse_summary.json", "w"),
          indent=1, ensure_ascii=False)
print("\nDONE papers:", len(summary),
      "entries:", sum(s["entries"] for s in summary),
      "bands:", sum(s["bands"] for s in summary),
      "errors:", sum(s["errors"] for s in summary))
