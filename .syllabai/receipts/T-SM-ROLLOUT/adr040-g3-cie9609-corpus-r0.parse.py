#!/usr/bin/env python3
"""ADR-040 G-3 tail: CIE 9609 C-grammar AO-matrix full parse. v3

Corpus: 105 MS PDFs = 48 held (syllabai-pastpapers main) + 57 extension
(w23/s24/w24/s25/w25/m26/s26; m24/m25 = primary-404 gap wave).

Grammars of record:
  C-AO-matrix : Level | AO/skill axes, per-axis mark ranges (2022 P3, 2023+ all)
  C1-two-axis : Level | <skill1> | Marks | <skill2> | Marks (s20-s22 P2 8-mark)
  C2-single   : Level | <skill> | Marks (P2 low-mark parts)
  B           : Level | Description | Marks (m22 P1)
  D-prose     : 'Level N - descriptor' lines w/ trailing ranges (w21 P1)
  E-unlabeled : trailing 'descriptor ... N marks' rows (s22 P1)

Verbatim law: descriptors byte-faithful (dash-normalized only); multi-axis rows
keep per-axis cells; single-axis grids keep the tiling contract (level ints,
bottom 0/1, top == entry marks). Fail-closed: grid violations land in errors[]
and force reviewRequired on the paper.

Cell model:
  int-style    (Marks header columns): segments = [desc0, MARK a0, desc1, MARK a1, ...]
  range-style  (AO-matrix): segments = [axis0 cell (range+desc), axis1 cell, ...]
"""
import fitz
import glob
import json
import os
import re
from collections import defaultdict

OUT = "/home/z/my-project/g3-9609"
DRAFTS = f"{OUT}/glm-ms-drafts/9609"

LABEL_RE = re.compile(r"^(\d{1,2})\s*\(([a-h])\)(?:\(([ivx]+)\))?\s*(.*)$")
NCC_RE = re.compile(r"No creditable (content|response)", re.I)
SKILL_TOKENS = ("Knowledge", "Application", "Analysis", "Evaluation")


def session_dirname(stem):
    m = re.match(r"9609-([SMW])(\d{2})-QP-(\d{2})$", stem)
    if m:
        kind = {"S": "06", "W": "11", "M": "03"}[m.group(1)]
        return f"20{m.group(2)}-{kind}", stem
    m = re.match(r"9609_([smw])(\d{2})_(ms|qp)_(\d{2})$", stem)
    kind = {"s": "06", "w": "11", "m": "03"}[m.group(1)]
    return (f"20{m.group(2)}-{kind}",
            f"9609-{m.group(1).upper()}{m.group(2)}-QP-{m.group(4)}")


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


def norm_dash(s):
    return s.replace("\uf02d", "-").replace("\u2013", "-").replace("\u2014", "-")


def marks_col_x(lines):
    for y, row in lines:
        txt = line_text(row)
        if "Question" in txt and "Answer" in txt and re.search(r"\bMarks?\b", txt):
            mw = [w for w in row if w[4] in ("Marks", "Mark")]
            if mw:
                return (mw[0][0] + mw[0][2]) / 2
    return None


def question_rows(lines, mx):
    out = []
    for y, row in lines:
        txt = line_text(row)
        m = LABEL_RE.match(txt)
        if not m or not m.group(4).strip():
            continue
        first = row[0]
        if first[0] > 90:
            continue
        marks = None
        if mx is not None:
            cands = [w for w in row if re.fullmatch(r"\d{1,2}", w[4])
                     and abs((w[0] + w[2]) / 2 - mx) < 55]
            if not cands:
                # marks digit may sit a line above/below the label token
                near = []
                for yy, rrow2 in lines:
                    if abs(yy - y) <= 12:
                        for w in rrow2:
                            if re.fullmatch(r"\d{1,2}", w[4]) and \
                                    abs((w[0] + w[2]) / 2 - mx) < 55:
                                near.append(w)
                cands = near
            if cands:
                marks = int(min(cands, key=lambda w: abs((w[0] + w[2]) / 2 - mx))[4])
        else:
            # no grid header on this page: the marks digit is the rightmost
            # digit on the label line
            rc = [w for w in row if re.fullmatch(r"\d{1,2}", w[4]) and w[0] > 550]
            if rc:
                marks = int(max(rc, key=lambda w: w[0])[4])
        label = f"{m.group(1)}({m.group(2)})"
        if m.group(3):
            label += f"({m.group(3)})"
        out.append({"y": y, "x": first[0], "label": label,
                    "number": int(m.group(1)), "stem": m.group(4).strip(),
                    "marks": marks})
    return out


def marks_pairs(ws, y0, y1):
    """(num[, -num], 'marks') adjacent word pairs in a y-zone.
    Returns [(y, x, lo, hi)] sorted by y."""
    out = []
    ws_z = sorted([w for w in ws if y0 - 2 <= w[1] < y1],
                  key=lambda w: (w[1], w[0]))
    for i, w in enumerate(ws_z):
        t = w[4].strip("()")
        m = re.fullmatch(r"(\d{1,2})(?:[-\u2013\uf02d](\d{1,2}))?", norm_dash(t))
        if not m:
            continue
        # the 'marks' word may sit on the same visual line or wrap just below
        for w2 in ws_z[i + 1:i + 6]:
            if w2[4].strip("()") in ("marks", "mark") and abs(w2[1] - w[1]) < 6 \
                    and 0 < (w2[0] - w[0]) < 90:
                lo = int(m.group(1))
                hi = int(m.group(2)) if m.group(2) else lo
                out.append((w[1], w[0], lo, hi))
                break
            if w2[1] - w[1] > 8:
                break
    return sorted(out)


def marks_pairs_words(win):
    """marks pairs within a header window (list of (y, row))."""
    ws = [w for _, r in win for w in r]
    if not ws:
        return []
    y0 = min(w[1] for w in ws) - 1
    y1 = max(w[3] for w in ws) + 2
    return marks_pairs(ws, y0, y1)


# ------------------------------------------------------------------ header
def page_bottom(lines):
    return max((y for (y, _) in lines), default=842)


def find_matrix_header(lines, y_from):
    """Next matrix header at/after y_from. Header block ends at the first body
    level token / NCC line. Returns dict or None."""
    for idx in range(len(lines)):
        y, row = lines[idx]
        if y < y_from:
            continue
        txt = line_text(row)
        n_axis_here = len(re.findall(r"\b(?:AO[1-4]|Knowledge|Application|Analysis|Evaluation)\b", txt))
        nxt2 = " | ".join(line_text(lines[k][1]) for k in range(idx, min(idx + 3, len(lines))))
        has_level = re.search(r"\bLevel\b", txt)
        axis_near = len(re.findall(r"\b(?:AO[1-4]|Knowledge|Application|Analysis|Evaluation)\b", nxt2))
        # strict gate: Level + axis tokens near, OR >=2 axis tokens on the line
        if not ((has_level and axis_near >= 1) or n_axis_here >= 2):
            continue
        # pass 1: minimal window to locate the Level token
        level_x0 = None
        probe = []
        for k in range(idx, min(idx + 5, len(lines))):
            yy, rrow = lines[k]
            probe.append((yy, rrow))
            lvw = [w for w in rrow if w[4] == "Level" and w[0] < 170]
            if lvw:
                level_x0 = lvw[0][0]
                break
        # extend the window UPWARD across interleaved header lines
        # (e.g. 'Knowledge and' / 'Analysis' printed above the Level line)
        top = idx
        for back in range(1, 3):
            if idx - back < 0:
                break
            py_, prow = lines[idx - back]
            ptxt = line_text(prow)
            if abs(py_ - lines[idx - back + 1][0]) > 14:
                break
            if re.search(r"\b(?:AO[1-4]|Knowledge|Application|Analysis|Evaluation)\b", ptxt) \
                    and not LABEL_RE.match(ptxt.strip()):
                top = idx - back
            else:
                break
        idx_eff = top
        win = []
        if level_x0 is not None:
            # pass 2: window ends just above the first body level token
            first_lvl_y = None
            for k in range(idx, min(idx + 40, len(lines))):
                yy, rrow = lines[k]
                for w in rrow:
                    if re.fullmatch(r"\d[ab]?", w[4]) and abs(w[0] - level_x0) < 20 \
                            and yy > lines[idx][0] + 2:
                        first_lvl_y = yy
                        break
                if first_lvl_y is not None:
                    break
            stop_y = first_lvl_y - 6 if first_lvl_y is not None \
                else lines[idx][0] + 40
            for k in range(idx, min(idx + 40, len(lines))):
                yy, rrow = lines[k]
                if yy >= stop_y:
                    break
                if not win or win[-1][0] < yy:
                    win.append((yy, rrow))
                if len(win) >= 6:
                    break
        else:
            # F-grammar: header = axis-token lines + interleaved marks-only
            # lines. A marks-only line is HEADER maxes iff its pair x-centers
            # do NOT align with the recurring body pair columns below it;
            # otherwise it is row-1 content and the window stops before it.
            zws = [w for (_, r) in lines for w in r]
            win = []
            for (yy, rrow) in probe:
                wtxt = line_text(rrow).strip()
                has_ax = any(w[4].startswith("AO") or w[4] in SKILL_TOKENS
                             for w in rrow)
                if has_ax:
                    win.append((yy, rrow))
                    continue
                marks_only = re.fullmatch(
                    r"(?:[\d\s\(\)\u2013\-]*marks?\.?)+", wtxt)
                if marks_only:
                    pb = marks_pairs(zws, yy + 8,
                                     min(yy + 300, page_bottom(lines)))
                    bcols = []
                    for (py, px, lo, hi) in pb:
                        for c in bcols:
                            if abs(c - px) < 45:
                                break
                        else:
                            bcols.append(px)
                    lps = marks_pairs(zws, yy - 2, yy + 8)
                    aligns = [any(abs(px - bc) < 45 for bc in bcols)
                              for (_, px, _, _) in lps]
                    if lps and all(aligns):
                        break  # row-1 content
                    win.append((yy, rrow))
                    continue
                if not win:
                    continue
                break
            win = win[:6] or probe[:1]
        if top < idx:
            up = [lines[k] for k in range(top, idx)]
            win = sorted(up + win, key=lambda t: t[0])
        if not win:
            continue
        axis_toks = []
        marks_xs = []
        for yy, r in win:
            for w in r:
                t = w[4]
                if t in ("AO1", "AO2", "AO3", "AO4") or t in SKILL_TOKENS:
                    axis_toks.append((w[0], w[2], t, yy))
                elif t in ("Marks", "Mark"):
                    marks_xs.append((w[0] + w[2]) / 2)
        if len(axis_toks) < 1:
            continue
        # real band headers carry marks tokens ('N marks' / Marks columns) in
        # the window; annotation/content lists do not
        win_pairs = marks_pairs_words(win)
        if not win_pairs and not marks_xs:
            continue
        axis_toks.sort()
        cols = []
        for (x0, x1, t, yy) in axis_toks:
            for c in cols:
                if abs(c["x0"] - x0) < 75:
                    c["toks"].append((x0, x1, t, yy))
                    c["x0"] = min(c["x0"], x0)
                    c["x1"] = max(c["x1"], x1)
                    break
            else:
                cols.append({"x0": x0, "x1": x1, "toks": [(x0, x1, t, yy)]})
        cols.sort(key=lambda c: c["x0"])
        # no-Level headers must show TWO distinct axis columns (guidance
        # prose names a single AO group)
        if level_x0 is None:
            xs = sorted(set(round(c["x0"]) for c in cols))
            if len(cols) < 2 or (xs and xs[-1] - xs[0] < 60):
                continue
        if level_x0 is not None and cols and cols[0]["x0"] < level_x0 + 30:
            continue  # axis tokens bleeding into the Level column
        return {"y0": win[0][0], "win": win, "cols": cols,
                "marks_xs": sorted(set(round(x) for x in marks_xs)),
                "level_x0": level_x0, "hdr_idx": idx}
    return None


def hdr_axis_max(pairs, cols):
    """Assign each header marks-pair to its NEAREST column; per-column max.
    A pair belongs to col k if its x is the closest among column x0s."""
    out = [None] * len(cols)
    for (py, px, lo, hi) in pairs:
        dists = [abs(px - (c["x0"] + c["x1"]) / 2) for c in cols]
        k = min(range(len(cols)), key=lambda i: dists[i])
        if dists[k] < 200:
            if out[k] is None or hi > out[k]:
                out[k] = hi
    return out


# ------------------------------------------------------------------- rows
def table_naxes(rows):
    """Max segment count across sub-rows (range-style column count)."""
    n = 0
    for r in rows:
        for sr in r["subRows"]:
            n = max(n, len(sr))
    return n or None


def int_cell(ws, y0, y1, x0, x1):
    """The integer marks token within a marks column slice."""
    cands = [w for w in ws if y0 - 3 <= w[1] < y1 and x0 <= w[0] < x1
             and re.fullmatch(r"\d{1,2}", w[4])]
    if not cands:
        return None
    return int(cands[0][4])


def is_pending_err(err):
    return ("bottom level" in err or "only 1 level rows" in err
            or "unlabeled bottom row" in err)


def parse_table_rows(doc, pno, h, end_y, notes):
    """Rows only (no binding/oracle) — used for cross-page merges."""
    page = doc[pno]
    ws = words(page)
    cols = h["cols"]
    level_x0 = h["level_x0"]
    hdr_y0 = h["y0"]
    if level_x0 is not None:
        fy = [w[1] for w in ws if re.fullmatch(r"\d[ab]?", w[4])
              and abs(w[0] - level_x0) < 20
              and h["win"][-1][0] - 12 < w[1] < end_y]
        hdr_y1 = (min(fy) - 6) if fy else h["win"][-1][0] + 10
    else:
        hdr_y1 = h["win"][-1][0] + 10
    lvl = [w for w in ws if level_x0 is not None
           and re.fullmatch(r"\d[ab]?", w[4])
           and abs(w[0] - level_x0) < 20 and hdr_y1 - 4 < w[1] < end_y]
    lvl.sort(key=lambda w: w[1])
    ncc_y = None
    for (ly, lrow) in group_lines(ws):
        if hdr_y1 - 6 < ly < end_y and NCC_RE.search(line_text(lrow)):
            ncc_y = ly
            break
    if ncc_y is not None:
        lvl = [w for w in lvl if w[1] < ncc_y + 1]
    events = [(w[1], w[4], False) for w in lvl]
    int_style = bool(h["marks_xs"])
    if ncc_y is not None:
        if not any(abs(ey - ncc_y) < 22 for (ey, _, _) in events):
            if not events or events[-1][0] < ncc_y:
                events.append((ncc_y, "0", True))
    events.sort()
    if not lvl:
        zone0, zone1 = hdr_y1 - 4, end_y
        if int_style:
            ints = [w for w in ws if zone0 < w[1] < zone1
                    and re.fullmatch(r"\d{1,2}", w[4])
                    and any(abs(w[0] - a) < 45 for a in h["marks_xs"])]
            ys = sorted(set(w[1] for w in ints))
        else:
            ps = marks_pairs(ws, zone0, zone1)
            if level_x0 is not None:
                ps = [p for p in ps if p[1] > level_x0 + 25]
            ys = sorted(set(py for (py, px, lo, hi) in ps))
        merged = []
        for y in ys:
            if not merged or y - merged[-1] > 7:
                merged.append(y)
        glines = group_lines(ws)
        events = []
        for ii, y in enumerate(merged):
            y0b = y - 2
            y1b = merged[ii + 1] - 2 if ii + 1 < len(merged) else end_y
            isn = any(NCC_RE.search(line_text(r))
                      for (ly, r) in glines if y0b - 2 <= ly < y1b)
            events.append((y0b, None, isn))
    events.sort()
    table_anchors = None
    if not int_style:
        ps = marks_pairs(ws, hdr_y1 - 4, end_y)
        if level_x0 is not None:
            ps = [p for p in ps if p[1] > level_x0 + 25]
        cl = []
        for (py, px, lo, hi) in ps:
            for c in cl:
                if abs(c - px) < 45:
                    break
            else:
                cl.append(px)
        table_anchors = sorted(cl)
        if not table_anchors:
            return [], "no marks columns found in table body"
    lx0 = level_x0 if level_x0 is not None else -40
    for (ly, lrow) in group_lines(ws):
        t = line_text(lrow).strip()
        if ly > hdr_y1 and (t.startswith("©") or
                            re.search(r"Page \d+ of \d+", t)):
            end_y = min(end_y, ly - 4)
            break
    rows = []
    for ei, (ey, lab, is_ncc) in enumerate(events):
        y1 = events[ei + 1][0] - 9 if ei + 1 < len(events) else end_y
        rows.append(extract_band(ws, ey, y1, lab, is_ncc, h, int_style,
                                 lx0, page.rect.width, body=not is_ncc,
                                 table_anchors=table_anchors))
    return rows, None


def table_axis_max(doc, pno, h):
    page = doc[pno]
    ws = words(page)
    if h["level_x0"] is not None:
        fy = [w[1] for w in ws if re.fullmatch(r"\d[ab]?", w[4])
              and abs(w[0] - h["level_x0"]) < 20
              and h["win"][-1][0] - 12 < page.rect.height]
        hdr_y1 = (min(fy) - 6) if fy else h["win"][-1][0] + 10
    else:
        hdr_y1 = h["win"][-1][0] + 10
    hdr_pairs = marks_pairs(ws, h["y0"], hdr_y1)
    return hdr_axis_max(hdr_pairs, h["cols"])


def build_table(doc, pno, h, qlab, end_y, notes):
    page = doc[pno]
    ws = words(page)
    cols = h["cols"]
    level_x0 = h["level_x0"]
    hdr_y0 = h["y0"]
    if level_x0 is not None:
        fy = [w[1] for w in ws if re.fullmatch(r"\d[ab]?", w[4])
              and abs(w[0] - level_x0) < 20
              and h["win"][-1][0] - 12 < w[1] < end_y]
        # header zone ends 6pt above the first level token: the row's own
        # marks-range token can print 3pt above the label line
        hdr_y1 = (min(fy) - 6) if fy else h["win"][-1][0] + 10
    else:
        # F-grammar: header ends just below the last window line (which may
        # carry the printed per-axis maxes)
        hdr_y1 = h["win"][-1][0] + 8
    hdr_pairs = marks_pairs(ws, hdr_y0, hdr_y1)
    axis_max = hdr_axis_max(hdr_pairs, cols)
    lvl = [w for w in ws if level_x0 is not None
           and re.fullmatch(r"\d[ab]?", w[4])
           and abs(w[0] - level_x0) < 20 and hdr_y1 - 4 < w[1] < end_y]
    lvl.sort(key=lambda w: w[1])

    def body_pairs_zone(z0, z1):
        ps = marks_pairs(ws, z0, z1)
        if level_x0 is not None:
            ps = [p for p in ps if p[1] > level_x0 + 25]
        return ps
    # NCC row: search LINE text (the phrase spans several words)
    ncc_y = None
    for (ly, lrow) in group_lines(ws):
        if hdr_y1 - 6 < ly < end_y and NCC_RE.search(line_text(lrow)):
            ncc_y = ly
            break
    if ncc_y is not None:
        lvl = [w for w in lvl if w[1] < ncc_y + 1]
    events = [(w[1], w[4], False) for w in lvl]
    if ncc_y is not None:
        # dedupe: a level token ON the NCC line must not double-count
        if not any(abs(ey - ncc_y) < 22 for (ey, _, _) in events):
            if not events or events[-1][0] < ncc_y:
                events.append((ncc_y, "0", True))
    events.sort()
    int_style = bool(h["marks_xs"])
    # level-less grammars: rows from ALL marks events clustered by y
    if not lvl:
        zone0, zone1 = hdr_y1 - 4, end_y
        if int_style:
            ints = [w for w in ws if zone0 < w[1] < zone1
                    and re.fullmatch(r"\d{1,2}", w[4])
                    and any(abs(w[0] - a) < 45 for a in h["marks_xs"])]
            ys = sorted(set(w[1] for w in ints))
        else:
            ys = sorted(set(py for (py, px, lo, hi)
                            in body_pairs_zone(zone0, zone1)))
        merged = []
        for y in ys:
            if not merged or y - merged[-1] > 7:
                merged.append(y)
        glines = group_lines(ws)
        events = []
        for ii, y in enumerate(merged):
            y0b = y - 2
            y1b = merged[ii + 1] - 2 if ii + 1 < len(merged) else end_y
            isn = any(NCC_RE.search(line_text(r))
                      for (ly, r) in glines if y0b - 2 <= ly < y1b)
            events.append((y0b, None, isn))
    events.sort()
    if len(events) < 2:
        if ncc_y is None and not lvl:
            # guidance prose (tick-based AO notes) — no band table exists here
            notes["guidance_no_table"] += 1
            return None, None
        return None, f"only {len(events)} level rows"
    # range-style: table-global column anchors from ALL body marks pairs
    table_anchors = None
    if not int_style:
        all_pairs = body_pairs_zone(hdr_y1 - 4, end_y)
        cl = []
        for (py, px, lo, hi) in all_pairs:
            for c in cl:
                if abs(c - px) < 45:
                    break
            else:
                cl.append(px)
        table_anchors = sorted(cl)
        if not table_anchors:
            return None, "no marks columns found in table body"
    lx0 = level_x0 if level_x0 is not None else -40
    # cap the table zone at the page footer
    for (ly, lrow) in group_lines(ws):
        t = line_text(lrow).strip()
        if ly > hdr_y1 and (t.startswith("©") or
                            re.search(r"Page \d+ of \d+", t)):
            end_y = min(end_y, ly - 4)
            break
    glines_all = group_lines(ws)
    events2 = []
    for (ey, lab, is_ncc) in events:
        if not is_ncc:
            is_ncc = any(NCC_RE.search(line_text(r))
                         for (ly, r) in glines_all if abs(ly - ey) < 16)
        events2.append((ey, lab, is_ncc))
    events = events2
    rows = []
    for ei, (ey, lab, is_ncc) in enumerate(events):
        if ei + 1 < len(events):
            y1 = events[ei + 1][0] - 9
        else:
            y1 = end_y
            if is_ncc or ncc_y is not None:
                y1 = min(y1, max(ey, ncc_y if ncc_y is not None else ey) + 14)
        rows.append(extract_band(ws, ey, y1, lab, is_ncc, h, int_style,
                                 lx0, page.rect.width, body=not is_ncc,
                                 table_anchors=table_anchors))
    entry, err = assemble_entry(qlab, h, axis_max, rows, notes)
    return entry, err


def extract_band(ws, y0, y1, lab, is_ncc, h, int_style, level_x0, width,
                 body=True, table_anchors=None):
    anchors = h["marks_xs"]
    if not int_style:
        anchors = table_anchors or []
    sub_ys = [y0]
    if int_style and anchors:
        ints = [w for w in ws if y0 - 3 <= w[1] < y1
                and abs(w[0] - anchors[0]) < 45
                and re.fullmatch(r"\d{1,2}", w[4])]
        sub_ys = sorted(set([y0] + [w[1] for w in ints]))
    # merge sub-row starts closer than 4pt
    merged = []
    for y in sub_ys:
        if not merged or y - merged[-1] > 4:
            merged.append(y)
    sub_ys = merged
    sub_rows = []
    for si, sy in enumerate(sub_ys):
        sy1 = sub_ys[si + 1] - 2 if si + 1 < len(sub_ys) else y1
        ytop = sy - 7 if si == 0 else sy - 3
        segs = []
        if int_style:
            # [desc0, MARK a0, desc1, MARK a1, ...]
            bounds = []
            prev = level_x0 + 14
            for a in anchors:
                bounds += [(prev, a - 26), (a - 26, a + 26)]
                prev = a + 26
            bounds += [(prev, width)]
            segs = []
            for (x0, x1) in bounds:
                seg = [w for w in ws if ytop <= w[1] < sy1 and x0 <= w[0] < x1
                       and w[0] > level_x0 + 25]
                seg.sort(key=lambda w: (w[1], w[0]))
                segs.append(" ".join(w[4] for w in seg))
        else:
            # column regions are anchor-relative: the printed marks digit IS
            # the column start; text of column k spans [a_k-15, a_{k+1}-15)
            bounds = [max(0, anchors[0] - 15)]
            for k in range(1, len(anchors)):
                bounds.append(max(bounds[-1] + 1, anchors[k] - 15))
            bounds.append(width)
            for k, a in enumerate(anchors):
                x0, x1 = bounds[k], bounds[k + 1]
                seg = [w for w in ws if ytop <= w[1] < sy1
                       and x0 <= w[0] < x1 and w[0] > level_x0 + 25]
                # 6pt y-buckets keep visual lines together (baseline jitter)
                seg.sort(key=lambda w: (round(w[1] / 6), w[0]))
                segs.append(" ".join(w[4] for w in seg))
        sub_rows.append(segs)
    return {"label": lab, "isNCC": is_ncc, "subRows": sub_rows,
            "anchors": anchors, "y0": y0, "y1": y1}


def assemble_entry(qlab, h, axis_max, rows, notes):
    cols = h["cols"]
    ncols = len(cols)
    int_style = bool(h["marks_xs"])
    if not int_style:
        n_body = table_naxes(rows)
        if n_body and n_body > ncols:
            ncols = n_body
        if len(axis_max) < ncols:
            axis_max = list(axis_max) + [None] * (ncols - len(axis_max))
        # nameless extra axes get placeholder names from body order
    axis_names = []
    for c in cols:
        toks = [t for (_, _, t, _) in sorted(c["toks"], key=lambda t: (t[3], t[0]))]
        axis_names.append(" ".join(toks))
    while len(axis_names) < ncols:
        axis_names.append(f"axis-{len(axis_names) + 1}")
    is_ao = any(n.startswith("AO") for n in axis_names)
    int_style = bool(h["marks_xs"])
    grammar = ("C-AO-matrix" if is_ao else
               "C1-two-axis" if ncols == 2 else
               "C2-single-axis" if ncols == 1 else "C-multi-axis")
    band_rows = []
    for r in rows:
        if int_style:
            sub_out = []
            for segs in r["subRows"]:
                # [desc0, MARK0, desc1, MARK1, ...]
                cells = []
                for k in range(ncols):
                    di, mi = k * 2, k * 2 + 1
                    desc = segs[di].strip() if di < len(segs) else ""
                    mtok = segs[mi].strip() if mi < len(segs) else ""
                    m = re.fullmatch(r"(\d{1,2})", norm_dash(mtok))
                    rng = (int(m.group(1)), int(m.group(1))) if m else None
                    if NCC_RE.search(desc):
                        rng = (0, 0)
                    cells.append({"marksMin": rng[0] if rng else None,
                                  "marksMax": rng[1] if rng else None,
                                  "descriptor": desc or None, "raw": mtok})
                sub_out.append(cells)
            if r["isNCC"]:
                # the NCC phrase prints once across the table width; per-cell
                # fragments collapse to the full printed phrase
                joined = " ".join(" ".join(sr) for sr in r["subRows"])
                mphrase = NCC_RE.search(joined)
                phrase = mphrase.group(0).strip() if mphrase else joined.strip()
                for sr in sub_out:
                    for c in sr:
                        c["descriptor"] = phrase
                        c["marksMin"], c["marksMax"] = 0, 0
            band_rows.append({"levelLabel": r["label"], "isNCC": r["isNCC"],
                              "subRows": sub_out})
        else:
            sub_out = []
            for segs in r["subRows"]:
                cells = []
                for k in range(ncols):
                    seg = segs[k] if k < len(segs) else ""
                    rng, desc = split_range_cell(seg)
                    cells.append({"marksMin": rng[0] if rng else None,
                                  "marksMax": rng[1] if rng else None,
                                  "descriptor": desc or None, "raw": seg})
                sub_out.append(cells)
            if r["isNCC"]:
                # the NCC phrase prints once across the table width; per-cell
                # fragments collapse to the full printed phrase
                joined = " ".join(" ".join(sr) for sr in r["subRows"])
                mphrase = NCC_RE.search(joined)
                phrase = mphrase.group(0).strip() if mphrase else joined.strip()
                for sr in sub_out:
                    for c in sr:
                        c["descriptor"] = phrase
                        c["marksMin"], c["marksMax"] = 0, 0
            band_rows.append({"levelLabel": r["label"], "isNCC": r["isNCC"],
                              "subRows": sub_out})
    entry = {
        "entryId": None, "label": qlab["label"], "number": qlab["number"],
        "qwc": False, "mcq": False, "correctOption": None, "answerText": None,
        "markPoints": [], "guidance": [], "marks": qlab["marks"],
        "marksCellSource": "ao-matrix-level-table",
        "bandGrammar": grammar,
        "axes": [{"name": axis_names[k], "max": axis_max[k]} for k in range(ncols)],
        "bandRows": band_rows,
        "confidence": 0.9,
    }
    err = oracle(entry, int_style)
    if err:
        return None, err
    return entry, None


def split_range_cell(seg):
    t = norm_dash(seg).strip()
    m = re.match(r"^(\d{1,2})\s*-\s*(\d{1,2})\s*marks?\b(.*)$", t, re.S)
    if m:
        return (int(m.group(1)), int(m.group(2))), m.group(3).strip()
    m = re.match(r"^(\d{1,2})\s*marks?\b(.*)$", t, re.S)
    if m:
        v = int(m.group(1))
        return (v, v), m.group(2).strip()
    m = re.match(r"^(\d{1,2})$", t)  # bare range token (marks word cut off)
    if m:
        v = int(m.group(1))
        return (v, v), ""
    m = re.match(r"^(\d{1,2})\s*-\s*(\d{1,2})$", t)
    if m:
        return (int(m.group(1)), int(m.group(2))), ""
    if NCC_RE.search(t):
        return (0, 0), t
    return None, t


def oracle(entry, int_style):
    amax_pre = [a["max"] for a in entry["axes"]]
    if entry["marks"] is None:
        if all(m is not None for m in amax_pre) and sum(amax_pre) > 0:
            entry["marks"] = sum(amax_pre)
            entry.setdefault("parseNotes", []).append(
                "marks_from_axis_sum (question row prints no marks digit)")
        else:
            return "question row has no printed marks"
    amax = [a["max"] for a in entry["axes"]]
    nax = len(amax)
    nums = []
    unlabeled = False
    for r in entry["bandRows"]:
        if r["levelLabel"] is None:
            unlabeled = True
            continue
        m = re.fullmatch(r"(\d)([ab])?", r["levelLabel"])
        if not m:
            return f"bad level label {r['levelLabel']!r}"
        nums.append(int(m.group(1)))
    if unlabeled:
        n_rows = len(entry["bandRows"])
        for idx, r in enumerate(entry["bandRows"]):
            r["levelLabel"] = str(n_rows - 1 - idx)
        entry.setdefault("parseNotes", []).append(
            "levels_implied_no_level_column")
        nums = [n_rows - 1 - idx for idx in range(n_rows)]
        if not entry["bandRows"][-1]["isNCC"]:
            return "unlabeled bottom row is not NCC"
    labels_seq = [r["levelLabel"] for r in entry["bandRows"]]
    for i in range(len(nums) - 1):
        if nums[i] < nums[i + 1]:
            return f"levels not descending: {labels_seq}"
        if nums[i] == nums[i + 1] and labels_seq[i] == labels_seq[i + 1]:
            return f"duplicate level label {labels_seq[i]}"
    if nums[-1] != 0:
        return f"bottom level {nums[-1]} != 0"
    per_axis = [[] for _ in range(nax)]
    for r in entry["bandRows"]:
        for sr in r["subRows"]:
            for k, c in enumerate(sr):
                if k >= nax:
                    break
                if r["isNCC"] or NCC_RE.search(c["descriptor"] or ""):
                    if c["marksMin"] is None:
                        c["marksMin"], c["marksMax"] = 0, 0
                    per_axis[k].append((0, 0))
                    continue
                if c["marksMin"] is None:
                    if c["descriptor"]:
                        return (f"axis {k} level {r['levelLabel']}: descriptor "
                                f"without marks ({(c['raw'] or '')[:40]!r})")
                    continue
                if c["marksMax"] > (amax[k] if amax[k] is not None else 99):
                    return (f"axis {k} range {c['marksMin']}-{c['marksMax']} "
                            f"exceeds max {amax[k]}")
                per_axis[k].append((c["marksMin"], c["marksMax"]))
    if amax[0] is None:
        for k in range(nax):
            vals = [hi for (_, hi) in per_axis[k]]
            amax[k] = max(vals) if vals else 0
            entry["axes"][k]["max"] = amax[k]
        notes_fallback(entry)
    total = sum(m for m in amax if m is not None)
    if total != entry["marks"]:
        return f"axis max sum {total} != marks {entry['marks']}"
    for k in range(nax):
        reach = max((hi for (_, hi) in per_axis[k]), default=0)
        if reach != amax[k]:
            return f"axis {k} max {amax[k]} never reached (top {reach})"
    return None


def notes_fallback(entry):
    entry.setdefault("parseNotes", []).append(
        "axis_max_from_body_reachable (header printed no per-axis marks)")


# ---------------------------------------------------------------- prose D/E
def parse_prose(doc, pno):
    page = doc[pno]
    txt = page.get_text("text", sort=True)
    lines = [ln.rstrip() for ln in txt.splitlines()]
    rows = defaultdict(list)
    errors = []
    qlab = None
    i = 0
    n = len(lines)
    while i < n:
        ln = lines[i].strip()
        m = LABEL_RE.match(ln)
        if m and m.group(4).strip() and len(ln) > 25:
            nums = re.findall(r"(\d{1,2})\s*$", ln)
            label = f"{m.group(1)}({m.group(2)})"
            if m.group(3):
                label += f"({m.group(3)})"
            qlab = {"label": label, "number": int(m.group(1)),
                    "marks": int(nums[-1]) if nums else None}
            i += 1
            continue
        dm = re.match(r"^Level (\d)\s*[-\u2013\uf02d]\s*(.*)$", ln)
        if dm and qlab:
            lv = int(dm.group(1))
            blob = dm.group(2).strip()
            rng = None
            j = i
            while j < min(i + 4, n):
                tail = norm_dash(lines[j].strip())
                mm = re.search(r"(\d{1,2})\s*-\s*(\d{1,2})\s*$", tail)
                if mm:
                    rng = (int(mm.group(1)), int(mm.group(2)))
                    if j == i:
                        blob = re.sub(r"\s*\d{1,2}\s*-\s*\d{1,2}\s*$", "", blob)
                    break
                if NCC_RE.search(tail):
                    rng = (0, 0)
                    blob = tail
                    break
                j += 1
            if lv == 0:
                i = j + 1
                continue
            if rng is None:
                errors.append({"page": pno + 1, "label": qlab["label"],
                               "kind": "D-prose",
                               "error": f"level {lv} without range"})
                i += 1
                continue
            rows[qlab["label"]].append({"level": lv, "range": rng,
                                        "descriptor": blob.strip(),
                                        "grammar": "D-prose",
                                        "marks": qlab["marks"]})
            i = j + 1
            continue
        i += 1
    return rows, errors


# ---------------------------------------------------------------- E grammar
def parse_unlabeled(doc, pno, ql):
    """E-grammar: trailing 'descriptor ... N marks' rows with no Level header.
    Descriptors wrap across lines: a row = all lines since the previous marks
    line, joined; blocks = marks lines with wrap-gaps <= 1, >=3 rows, NCC last."""
    page = doc[pno]
    txt = page.get_text("text", sort=True)
    lines = [ln.rstrip() for ln in txt.splitlines()]
    n = len(lines)
    MK = re.compile(r"(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*marks?\.?\s*$", re.I)
    mk_idx = [i for i, ln in enumerate(lines) if MK.search(ln.strip())
              and len(ln.strip()) < 200]
    out = []
    if len(mk_idx) < 3:
        return out
    # group: consecutive MK lines with gap <= 2 (one wrapped desc line)
    groups = []
    cur = [mk_idx[0]]
    for a, b in zip(mk_idx, mk_idx[1:]):
        if b - a <= 3:
            cur.append(b)
        else:
            groups.append(cur)
            cur = [b]
    groups.append(cur)
    for g in groups:
        if len(g) < 3:
            continue
        rows = []
        for k, mi in enumerate(g):
            m = MK.search(lines[mi].strip())
            lo = int(m.group(1))
            hi = int(m.group(2)) if m.group(2) else lo
            start = (g[k - 1] + 1) if k > 0 else max(0, mi - 3)
            desc_parts = [re.sub(MK, "", lines[j]).strip()
                          for j in range(start, mi + 1)]
            desc = " ".join(p for p in desc_parts if p).strip()
            if NCC_RE.search(desc):
                lo = hi = 0
            rows.append({"lo": lo, "hi": hi, "desc": desc})
        if not any(NCC_RE.search(r["desc"]) for r in rows):
            continue
        ncc = rows[-1] if rows[-1]["lo"] == 0 else None
        nz = [r for r in rows if r["lo"] > 0]
        if not nz:
            continue
        # bind to nearest question label above the block start
        above = [ln2 for ln2 in lines[:g[0]]
                 if LABEL_RE.match(ln2.strip()) and len(ln2.strip()) > 25]
        if not above:
            continue
        lm = LABEL_RE.match(above[-1].strip())
        label = f"{lm.group(1)}({lm.group(2)})"
        if lm.group(3):
            label += f"({lm.group(3)})"
        nums = re.findall(r"(\d{1,2})\s*$", above[-1].strip())
        marks = int(nums[-1]) if nums else None
        nz.sort(key=lambda r: -r["hi"])
        out.append({"label": label, "marks": marks, "rows": nz,
                    "ncc": ncc, "page": pno + 1})
    return out


def main():
    corpus = sorted(glob.glob(f"{OUT}/pp-holdings/*__ms.pdf")) + \
             sorted(glob.glob(f"{OUT}/raw-xt/9609_*_ms_*.pdf"))
    print(f"corpus: {len(corpus)} MS PDFs")
    os.makedirs(DRAFTS, exist_ok=True)
    audit = []
    for path in corpus:
        stem = os.path.basename(path).split("__")[0].replace(".pdf", "")
        session, paper = session_dirname(stem)
        doc = fitz.open(path)
        entries, errors = [], []
        notes = defaultdict(int)
        prose_rows = defaultdict(list)
        last_mx = None
        marks_registry = {}
        pending = None  # cross-page table: {qlab, h, rows, axis_max, grammar}
        for pno in range(len(doc)):
            page = doc[pno]
            ws = words(page)
            lines = group_lines(ws)
            mx = marks_col_x(lines) or last_mx
            last_mx = mx
            ql = question_rows(lines, mx)
            for q in ql:
                if q["marks"] is not None:
                    marks_registry.setdefault(q["label"], q["marks"])
            pr, pe = parse_prose(doc, pno)
            for k, v in pr.items():
                prose_rows[k] += v
            errors += pe
            for e in parse_unlabeled(doc, pno, ql):
                rows = e["rows"]
                marks = e["marks"]
                err = None
                if marks is None:
                    marks = rows[0]["hi"]
                    notes.setdefault("marks_fallback_notes", []).append(
                        f"E-grammar marks_from_grid: {e['label']}={marks}")
                elif marks != rows[0]["hi"]:
                    err = f"E top max {rows[0]['hi']} != question marks {marks}"
                for a, b in zip(rows, rows[1:]):
                    if a["lo"] != b["hi"] + 1:
                        err = f"E tiling gap {a['lo']} vs {b['hi']}+1"
                if rows[-1]["lo"] != 1:
                    err = f"E bottom marksMin {rows[-1]['lo']} not 1"
                if err:
                    errors.append({"page": pno + 1, "label": e["label"],
                                   "kind": "E-unlabeled", "error": err})
                else:
                    k = len(rows)
                    entries.append({
                        "entryId": None, "label": e["label"],
                        "number": int(e["label"][0]), "qwc": False, "mcq": False,
                        "correctOption": None, "answerText": None,
                        "markPoints": [], "guidance": [], "marks": marks,
                        "marksCellSource": "unlabeled-level-rows",
                        "bandGrammar": "E-unlabeled",
                        "bands": [{"level": k - idx, "marksMin": r["lo"],
                                   "marksMax": r["hi"],
                                   "descriptor": r["desc"]}
                                  for idx, r in enumerate(rows)],
                        "confidence": 0.9,
                    })
                    notes["tables_E-unlabeled"] += 1
            i = 0
            while i < len(lines):
                h = find_matrix_header(lines, lines[i][0] if i < len(lines) else 0)
                if h is None:
                    break
                prior = [q for q in ql if q["y"] < h["y0"]]
                below = [q["y"] for q in ql if q["y"] > h["win"][-1][0]]
                end_y = min(below) - 3 if below else page.rect.height
                mergeable = pending is not None and (
                    not prior or prior[-1]["label"] == pending["qlab"]["label"])
                if mergeable:
                    # continuation page: parse rows only and merge
                    rows2, err2 = parse_table_rows(doc, pno, h, end_y, notes)
                    if err2:
                        errors.append({"page": pno + 1,
                                       "label": pending["qlab"]["label"],
                                       "kind": "table", "error": err2})
                        pending = None
                    else:
                        all_rows = pending["rows"] + rows2
                        entry, err = assemble_entry(
                            pending["qlab"], pending["h"],
                            pending["axis_max"], all_rows, notes)
                        if err:
                            pending = {"qlab": pending["qlab"], "h": pending["h"],
                                       "rows": all_rows,
                                       "axis_max": pending["axis_max"]}
                            if pno == len(doc) - 1:
                                errors.append({"page": pno + 1,
                                               "label": pending["qlab"]["label"],
                                               "kind": "table",
                                               "error": f"unresolved pending: {err}"})
                                pending = None
                        else:
                            entries.append(entry)
                            notes[f"tables_{entry['bandGrammar']}"] += 1
                            pending = None
                    i = h["hdr_idx"] + len(h["win"]) + 1
                    continue
                if not prior:
                    i = h["hdr_idx"] + 1
                    continue
                qlab = prior[-1]
                if qlab["marks"] is None:
                    qlab["marks"] = marks_registry.get(qlab["label"])
                entry, err = build_table(doc, pno, h, qlab, end_y, notes)
                if err and is_pending_err(err) and pno + 1 < len(doc):
                    rows1, err1 = parse_table_rows(doc, pno, h, end_y, notes)
                    if not err1:
                        pending = {"qlab": qlab, "h": h, "rows": rows1,
                                   "axis_max": table_axis_max(doc, pno, h)}
                elif err:
                    errors.append({"page": pno + 1, "label": qlab["label"],
                                   "kind": "table", "error": err})
                elif entry:
                    entries.append(entry)
                    notes[f"tables_{entry['bandGrammar']}"] += 1
                i = h["hdr_idx"] + len(h["win"]) + 1
        for label, rows in prose_rows.items():
            rows.sort(key=lambda r: -r["level"])
            levels = [r["level"] for r in rows]
            marks = rows[0]["marks"]
            err = None
            if levels != sorted(set(levels), reverse=True):
                err = f"prose duplicate levels {levels}"
            for a, b in zip(rows, rows[1:]):
                if a["range"][0] != b["range"][1] + 1:
                    err = (f"prose tiling gap L{a['level']} min "
                           f"{a['range'][0]} vs L{b['level']} max {b['range'][1]}")
            if rows[-1]["range"][0] != 1:
                err = f"prose bottom marksMin {rows[-1]['range'][0]} not 1"
            if marks is None:
                marks = rows[0]["range"][1]
                notes.setdefault("marks_fallback_notes", []).append(
                    f"prose marks_from_grid_tiling: {label}={marks}")
            elif marks != rows[0]["range"][1]:
                err = f"prose top max {rows[0]['range'][1]} != question marks {marks}"
            if err:
                errors.append({"label": label, "kind": "D-prose", "error": err})
            else:
                entries.append({
                    "entryId": None, "label": label, "number": int(label[0]),
                    "qwc": False, "mcq": False, "correctOption": None,
                    "answerText": None, "markPoints": [], "guidance": [],
                    "marks": marks, "marksCellSource": "prose-level-lines",
                    "bandGrammar": "D-prose",
                    "bands": [{"level": r["level"], "marksMin": r["range"][0],
                               "marksMax": r["range"][1],
                               "descriptor": r["descriptor"]} for r in rows],
                    "confidence": 0.9,
                })
        audit.append({"paper": paper, "session": session, "entries": entries,
                      "errors": errors, "notes": dict(notes)})
        print(f"{paper}: entries={len(entries)} errors={len(errors)}")
        doc.close()
    json.dump(audit, open(f"{OUT}/parse_audit_v3.json", "w"), indent=1)
    tot_e = sum(len(a["entries"]) for a in audit)
    print(f"TOTAL entries={tot_e} "
          f"papers_with_errors={sum(1 for a in audit if a['errors'])}")


if __name__ == "__main__":
    main()
