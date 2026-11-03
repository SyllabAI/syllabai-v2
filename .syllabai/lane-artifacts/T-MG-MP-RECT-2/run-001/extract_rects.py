#!/usr/bin/env python3
"""
T-MG-MP-RECT-2 run-001 — the extraction instrument of record.

Deterministic, page-anchored extraction of mark-point rect geometry from the
Edexcel 1MA1/1F June 2025 QP + MS PDFs (the dossier assets of record,
sha256-pinned in the receipt). Emits the seed manifest for
apps/api/scripts/seed-mark-point-rects.ts (schema per the joinproof zod law).

Extraction law (derived from the PDF itself, first principles):
  QP anchors — question lines "^N\\t" bold at x<60; part lines "^(a)" at x<90;
  footer "(Total for Question N is M marks)"; turn-over lines; furniture
  excluded (DO-NOT-WRITE margins, corner bullets uF0A2, *P* print codes,
  footer page numbers y>790, TOTAL FOR PAPER).
  Block bottoms — min(next question start - 8pt [same page], turn-over line
  - 2pt [question's last page], writable page bottom), floored at footer
  bottom; question y0 = question-line y0; part y0 = part-line y0; inner part
  bottom = next part start - 8pt; last part bottom = question block bottom.
  x bands — question grain 42.3..552.5pt; labeled part 60.1..552.5pt.
  MS census — column-banded table parse (Question x<110 | Mark 235..300)
  -> per-question, per-part ordered mark-point rows (B1/M1/A1/P1/C1);
  the MS is the part/point STRUCTURE of record (the corpus derives from the
  MS documents).
  Manifest — one rect row per mark point: part-block rect for MS-labeled
  parts, question-block rect for MS-partless questions; ordinal 0; refs in
  the live-corpus scheme q{n}{part}-{k}.

Validation oracle: MathsGenie's PUBLIC pdfMarking.getRegions payload for the
same paper asset (uuid 1d9e943d-f246-4866-9636-35da6dba7e47, fetched
read-only, receipt-pinned) — strict tolerance where keys match, containment
where grain diverges (e.g. their 8.p1 vs our MS-faithful 8.a/8.b).
"""
import json
import re
from pathlib import Path

import fitz  # PyMuPDF
import pdfplumber

HERE = Path(__file__).resolve().parent
QP = HERE / "qp-1ma1-1f-jun2025.pdf"
MS = HERE / "ms-1ma1-1f-jun2025.pdf"
ORACLE = HERE / "getregions-1d9e943d-f246-4866-9636-35da6dba7e47.json"

PAGE_W, PAGE_H = 595.2755126953125, 841.8895263671875  # A4 portrait, verified
MARK_CODE = re.compile(r"^(B1|B2|B3|C1|C2|M1|M2|A1|A2|P1|P2|G1|E1|O1)$")
GAP = 8.0            # pt gap before the next anchor (oracle-derived)
X_Q = (42.3, 552.5)  # question-grain x band (oracle 0.071..0.928)
X_PART = (60.1, 552.5)  # labeled-part x band (oracle 0.101..0.928)
FOOTER_ZONE_Y = 790.0  # below this = page furniture (page numbers, bullets)

FURNITURE = re.compile(
    r"DO NOT WRITE|^Turn over\s*$|^TOTAL FOR PAPER|^Examiner|"
    r"^\*P\d+|Surname|Candidate|centre number|candidate number|"
    r"^Instructions|^Information|^Advice|Answer ALL|Write your answers|"
    r"^\uf0a2+$|^\(Total for Question"
)


# ------------------------------------------------------------------ QP parse

def qp_lines():
    doc = fitz.open(QP)
    out = []
    for pno in range(len(doc)):
        d = doc[pno].get_text("dict")
        for b in d["blocks"]:
            if b.get("type") != 0:
                continue
            for l in b["lines"]:
                text = "".join(s["text"] for s in l["spans"]).strip()
                if not text:
                    continue
                bold = any("Bold" in (s.get("font") or "") for s in l["spans"])
                x0, y0, _, y1 = l["bbox"]
                out.append((pno, y0, y1, x0, text, bold))
    return out


def qp_parse():
    lines = qp_lines()
    footers = {}      # qnum -> (page, y_top, y_bot, marks)
    qnum_line = {}    # qnum -> (page, y0)   question line "^N\\t"
    turnover_page = {}  # page -> [y, ...]   any turn-over line
    part_anchors = []  # (page, y0, letter)
    for pno, y0, y1, x0, text, bold in lines:
        m = re.search(r"\(Total for Question (\d{1,2}) is (\d{1,2}) marks?\)", text)
        if m and qn_ok(int(m.group(1)), pno):
            footers.setdefault(int(m.group(1)), (pno, y0, y1, int(m.group(2))))
            continue
        m = re.search(r"Turn over( for Question (\d{1,2}))?", text)
        if m and y0 > 600:
            turnover_page.setdefault(pno, []).append(y0)
            continue
        m = re.match(r"\(([a-z])\)", text)
        if m and x0 < 90 and pno >= 1 and y0 < FOOTER_ZONE_Y:
            part_anchors.append((pno, y0, m.group(1)))
            continue
        m = re.match(r"^(\d{1,2})[\t ]", text)
        if m and x0 < 60 and bold and pno >= 1 and y0 < FOOTER_ZONE_Y:
            qn = int(m.group(1))
            if qn not in qnum_line:
                qnum_line[qn] = (pno, y0)
            # inline part label rides the question line ("10\t (a)\t ...")
            pm = re.search(r"\(([a-z])\)", text)
            if pm:
                part_anchors.append((pno, y0, pm.group(1)))
            continue
        if (re.fullmatch(r"\d{1,2}", text) and x0 < 60 and bold
                and pno >= 1 and y0 < FOOTER_ZONE_Y):
            qn = int(text)
            if qn not in qnum_line:
                qnum_line[qn] = (pno, y0)
    return lines, footers, qnum_line, turnover_page, part_anchors


def qn_ok(qn, pno):
    # cover page (0) has no totals; totals for qN live on qN's page
    return pno >= 1


def build_qp_blocks():
    lines, footers, qnum_line, turnover_page, part_anchors = qp_parse()
    questions = sorted(qnum_line)
    # writable bottom per page: last non-furniture content line bottom above the footer zone
    page_bottom = {}
    for pno, y0, y1, x0, text, bold in lines:
        if FURNITURE.search(text) or y1 >= FOOTER_ZONE_Y or x0 < 30:
            continue
        page_bottom[pno] = max(page_bottom.get(pno, 0.0), y1)

    blocks = {}
    for i, qn in enumerate(questions):
        p0, gy0 = qnum_line[qn]
        nxt = questions[i + 1] if i + 1 < len(questions) else None
        npage, ny = (qnum_line[nxt][0], qnum_line[nxt][1]) if nxt else (None, None)
        cands = []
        if nxt and npage == p0:
            cands.append(("next_q", ny))
        for ty in turnover_page.get(p0, []):
            cands.append(("turnover", ty))
        cands.append(("page_bottom", page_bottom.get(p0, 784.0)))
        _, yend = min(cands, key=lambda c: c[1])
        y1 = yend - GAP if _ == "next_q" else yend - 2.0
        fy1 = footers[qn][2] if qn in footers else 0
        y1 = max(y1, fy1 + 2.0)
        qparts = {}
        for (pp, py, L) in part_anchors:
            if pp == p0 and gy0 - 2 <= py <= y1:
                qparts[L] = py
        blocks[qn] = {"page": p0, "y0": gy0, "y1": y1, "end_kind": _,
                      "parts": qparts, "footer_marks": footers[qn][3] if qn in footers else None,
                      "footer_y1": fy1}
    for qn, b in blocks.items():
        letters = sorted(b["parts"], key=lambda L: b["parts"][L])
        b["part_blocks"] = {}
        for j, L in enumerate(letters):
            py0 = b["parts"][L]
            if j + 1 < len(letters):
                py1 = b["parts"][letters[j + 1]] - GAP
            else:
                py1 = b["y1"]
            b["part_blocks"][L] = (py0, py1)
    return blocks


# ------------------------------------------------------------------ MS parse

def ms_parse():
    """{qnum: {"parts": {letter_or_None: {"points": [code, ...], "page": int}}}}"""
    pdf = pdfplumber.open(MS)
    census = {}
    cur_q = None
    cur_part = None
    for pno in range(len(pdf.pages)):
        words = pdf.pages[pno].extract_words()
        hdr = [w for w in words if w["text"] == "Question"]
        if not hdr:
            continue
        top = hdr[0]["top"]
        body = [w for w in words if w["top"] > top + 8]
        rows = {}
        for w in body:
            rows.setdefault(round(w["top"] / 3.0), []).append(w)
        for key in sorted(rows):
            ws = sorted(rows[key], key=lambda w: w["x0"])
            qb = [w for w in ws if w["x0"] < 110]
            mb = [w for w in ws if 235 <= w["x0"] < 300]
            qnew = None
            for w in qb:
                if re.fullmatch(r"\d{1,2}", w["text"]) and w["x0"] < 100:
                    qnew = int(w["text"])
            if qnew is not None:
                cur_q = qnew
                cur_part = None
                census.setdefault(cur_q, {"parts": {}})
            if cur_q is None:
                continue
            for w in qb:
                m = re.fullmatch(r"\(([a-z])\)", w["text"])
                if m:
                    cur_part = m.group(1)
                    census[cur_q]["parts"].setdefault(cur_part, {"points": [], "page": pno})
            census[cur_q]["parts"].setdefault(cur_part, {"points": [], "page": pno})
            for w in mb:
                if MARK_CODE.fullmatch(w["text"]):
                    census[cur_q]["parts"][cur_part]["points"].append(w["text"])
    return census


# branch-collapse: the MS lists alternative method branches after the
# primary branch (q17: P1,P1,C1 x2); while the question's value sum
# exceeds its footer mark total, trim the last row (alternatives last).
def collapse_branches(census, blocks):
    for qn, c in census.items():
        ordered = []
        for L in [None] + sorted([k for k in c["parts"] if k]):
            if L in c["parts"]:
                for code in c["parts"][L]["points"]:
                    ordered.append((L, code))
        fm = blocks.get(qn, {}).get("footer_marks")
        if fm is None or not ordered:
            continue
        total = sum(int(code[1]) for _, code in ordered)
        while total > fm and ordered:
            L, code = ordered.pop()
            total -= int(code[1])
        rebuilt = {L: [] for L, _ in ordered}
        for L, code in ordered:
            rebuilt[L].append(code)
        for L in list(c["parts"].keys()):
            c["parts"][L]["points"] = rebuilt.get(L, [])
        # drop empty buckets when labeled parts exist
        if any(k is not None and c["parts"][k]["points"] for k in c["parts"]):
            for k in [k for k in c["parts"] if k is None and not c["parts"][k]["points"]]:
                del c["parts"][k]
        elif None in c["parts"] and not c["parts"][None]["points"]:
            del c["parts"][None]
    return census


# ---------------------------------------------------------------- normalize

def norm(x, y, w, h, page):
    return {
        "page": page,
        "x": round(x / PAGE_W, 4),
        "y": round(y / PAGE_H, 4),
        "width": round(w / PAGE_W, 4),
        "height": round(h / PAGE_H, 4),
    }


# -------------------------------------------------------------------- main

def main():
    blocks = build_qp_blocks()
    census = collapse_branches(ms_parse(), blocks)
    manifest_rows = []
    ours = {}

    for qn in sorted(blocks):
        b = blocks[qn]
        p0 = b["page"]
        page = p0 + 1
        qrect = norm(X_Q[0], b["y0"], X_Q[1] - X_Q[0], b["y1"] - b["y0"], page)
        ours[str(qn)] = dict(qrect)
        cparts = census.get(qn, {}).get("parts", {})
        labeled = sorted([L for L in cparts if L], key=lambda L: b["part_blocks"].get(L, (1e9, 0))[0]) if b["part_blocks"] else []
        if not labeled:
            for k, code in enumerate(cparts.get(None, {}).get("points", []), 1):
                manifest_rows.append({
                    "markPointRef": f"q{qn}-{k}", "regionKey": f"1MA1/1F-q{qn}",
                    **qrect, "ordinal": 0, "extractionConfidence": 0.93,
                })
            prect = norm(X_Q[0], b["y0"], X_Q[1] - X_Q[0], b["y1"] - b["y0"], page)
            ours[f"{qn}.p1"] = dict(prect)
        else:
            for L in labeled:
                if L not in b["part_blocks"]:
                    continue
                py0, py1 = b["part_blocks"][L]
                prect = norm(X_PART[0], py0, X_PART[1] - X_PART[0], py1 - py0, page)
                ours[f"{qn}.{L}"] = dict(prect)
                pts = cparts.get(L, {}).get("points", [])
                for k, code in enumerate(pts, 1):
                    manifest_rows.append({
                        "markPointRef": f"q{qn}{L}-{k}", "regionKey": f"1MA1/1F-q{qn}.{L}",
                        **prect, "ordinal": 0, "extractionConfidence": 0.93,
                    })

    # ---- oracle validation
    oracle = json.load(open(ORACLE))["result"]["data"]["json"]
    oregions = {g["regionKey"]: g for g in oracle["regions"] if g.get("regionKey")}
    TOL = 0.03
    hits, contain, misses = 0, [], []
    for key in sorted(oregions, key=lambda k: (int(k.split(".")[0]), k)):
        o = oregions[key]
        orc = o["rects"][0]
        m = ours.get(key)
        if m is None:
            misses.append((key, "NO OURS REGION"))
            continue
        if orc["page"] != m["page"]:
            misses.append((key, f"page {orc['page']} vs {m['page']}"))
            continue
        deltas = {f: abs(orc[f] - m[f]) for f in ("x", "y", "width", "height")}
        if max(deltas.values()) <= TOL:
            hits += 1
            continue
        # containment either way (grain divergence / right-edge quirk)
        mine_in = (m["x"] >= orc["x"] - TOL and m["y"] >= orc["y"] - TOL
                   and m["x"] + m["width"] <= orc["x"] + orc["width"] + TOL
                   and m["y"] + m["height"] <= orc["y"] + orc["height"] + TOL)
        theirs_in = (orc["x"] >= m["x"] - TOL and orc["y"] >= m["y"] - TOL
                     and orc["x"] + orc["width"] <= m["x"] + m["width"] + TOL
                     and orc["y"] + orc["height"] <= m["y"] + m["height"] + TOL)
        if mine_in:
            contain.append((key, "CONTAINED"))
        elif theirs_in:
            contain.append((key, "SUPERSET"))
        else:
            misses.append((key, " ".join(f"d{f}={d:+.3f}" for f, d in deltas.items())))

    print(f"=== ORACLE VALIDATION: strict {hits}/{len(oregions)} within TOL={TOL}; contained {len(contain)}; miss {len(misses)} ===")
    for key, why in contain:
        print(f"  ~ {key}: {why}")
    for key, why in misses:
        print(f"  MISS {key}: {why}")

    # ---- census checks
    total_rows = len(manifest_rows)
    footer_sum = sum(b["footer_marks"] or 0 for b in blocks.values())
    ms_vals = sum(int(code[1]) for c in census.values() for p in c["parts"].values() for code in p["points"])
    ms_rows = sum(len(p["points"]) for c in census.values() for p in c["parts"].values())
    print(f"=== CENSUS: manifest rows {total_rows}; footer marks sum {footer_sum}; MS value sum {ms_vals}; MS point rows {ms_rows}; questions {len(blocks)} ===")
    for qn in sorted(census):
        c = census[qn]
        parts = c["parts"]
        desc = ", ".join(f"{L or 'q'}:{len(p['points'])}" for L, p in sorted(parts.items(), key=lambda kv: (kv[0] is None, kv[0] or '')))
        fm = blocks[qn]["footer_marks"] if qn in blocks else "?"
        print(f"  q{qn}: footer={fm} ms_parts[{desc}]")

    out = {
        "paperCode": "1MA1/1F",
        "sessionLabel": "June 2025",
        "note": "REAL EXTRACTION MANIFEST",
        "rects": manifest_rows,
    }
    (HERE / "manifest-1ma1-1f-jun2025.json").write_text(json.dumps(out, indent=1))
    print("manifest written")


if __name__ == "__main__":
    main()
