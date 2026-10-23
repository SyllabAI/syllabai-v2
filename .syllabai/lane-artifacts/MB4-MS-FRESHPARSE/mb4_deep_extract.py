#!/usr/bin/env python3
"""MB4-MS-FRESHPARSE run-002 — deep PDF row extractor v2 (rebuild after wipe #2).

- per-page header edges (Question/Working/Answer|Ans/Mark/Sub-Total/Notes),
  carried across headerless continuation pages; split-header generations
  ('Working Answer Mark Notes' + separate 'Question' line) detected
- 'Total N marks' matched as a line SUFFIX ('wr Total 4 marks' debris class)
- headerless papers: empirical code-column mode across the paper; markv =
  digit token immediately left of the code
- printed numbers: pure digits or fused '1(a)'; strict-sequential law
- code rows: FIRST notes-region token is a code (fused 'M1for' tolerated) —
  kills mid-guidance anchors (SC B1B0, 'M1 for' inside notes text)
- Alternative / Method>=2 sections flagged (space-split 'Method 2' handled)
"""
import json, re, sys, os, collections
import pdfplumber

CODE_STRICT_RE = re.compile(r"^(?:B|M|A)(?:1|2|3)$")
CODE_FUSED_RE = re.compile(r"^(?:B|M|A)(?:1|2|3)[a-z]{0,4}$")
TOTAL_SUFFIX_RE = re.compile(r"\bTotal\s+(\d+)\s+marks?\s*$")
NUM_RE = re.compile(r"^(\d{1,2})(\(.*)?$")
FURNITURE_RE = re.compile(
    r"^(PMT|Part\s*\(?[a-z]\)?\s+on\s+following\s+page|Question\s+\d+\s+continued)\b", re.I)
LABEL_TOK_RE = re.compile(r"^(?:\x00LABEL)?\(?[a-z]{1,3}\)?(?:\(?[ivx]{0,4})?\)?$")


def page_lines(page):
    words = page.extract_words(keep_blank_chars=False, extra_attrs=["size"])
    lines = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        placed = False
        for ln in lines:
            if abs(ln["top"] - w["top"]) < 2.8:
                ln["words"].append(w)
                placed = True
                break
        if not placed:
            lines.append({"top": w["top"], "words": [w]})
    for ln in lines:
        ln["words"].sort(key=lambda w: w["x0"])
        ln["text"] = " ".join(w["text"] for w in ln["words"])
    lines.sort(key=lambda l: l["top"])
    return lines


def header_edges(lines):
    for ln in lines:
        ws = ln["words"]
        xs = {}
        for w in ws:
            if w["text"] == "Question":
                xs.setdefault("q", w["x0"])
            elif w["text"].startswith("Working"):
                xs.setdefault("w", w["x0"])
            elif w["text"].startswith(("Answer", "Ans")):
                xs.setdefault("a", w["x0"])
            elif w["text"].startswith(("Mark", "Sub-Total", "Total")):
                xs.setdefault("m", w["x0"])
            elif w["text"].startswith("Notes"):
                xs.setdefault("n", w["x0"])
        if "w" in xs and "n" in xs and ("m" in xs or "a" in xs):
            xs.setdefault("q", xs["w"] - 70)
            xs.setdefault("a", xs.get("m", xs["w"] + 160))
            xs.setdefault("m", xs["n"] - 45)
            return xs, ln["top"]
    return None, None


def extract_pdf(path):
    with pdfplumber.open(path) as pdf:
        all_lines = [(pno, page_lines(page)) for pno, page in enumerate(pdf.pages, 1)]

    page_edges = {}
    last = None
    for pno, lines in all_lines:
        e, ht = header_edges(lines)
        if e:
            last = (e, ht)
            page_edges[pno] = last
        elif last:
            page_edges[pno] = (last[0], None)
    # per-page empirical code column (receipt law): leftmost strict-code token
    # right of the Answer column; paper-modal as fallback; n-edge as last resort
    page_code_x = {}
    modal = collections.Counter()
    for pno, lines in all_lines:
        cand = []
        e = page_edges.get(pno, (None, None))[0]
        for ln in lines:
            for w in ln["words"]:
                if CODE_STRICT_RE.match(w["text"]):
                    modal[round(w["x0"] / 4)] += 1
                    if e is None or w["x0"] >= e["a"] - 4:
                        cand.append(w["x0"])
        if cand:
            page_code_x[pno] = round(min(cand))
    paper_modal_x = round(modal.most_common(1)[0][0] * 4) if modal else None
    if page_edges or paper_modal_x:
        for pno in {p for p, _ in all_lines}:
            if pno not in page_code_x:
                page_code_x[pno] = paper_modal_x

    out = {"pages": [], "questions": [], "emp_code_x": paper_modal_x}
    cur_q = cur_row = buffered = None
    expected_q = 1
    anomalies = []
    alt_state = False

    def segs(ws, edges, code_x):
        s = {}
        for w in ws:
            x = w["x0"]
            if edges:
                c = ("q" if x < edges["w"] else "w" if x < edges["a"] else
                     "a" if x < edges["m"] else "m" if x < edges["n"] else "n")
            elif code_x is not None:
                c = "n" if x >= code_x - 2 else "m" if x >= code_x - 30 else "a"
            else:
                c = "n"
            s.setdefault(c, []).append(w["text"])
        return s

    for pno, lines in all_lines:
        e_ht = page_edges.get(pno)
        edges, hdr_top = e_ht if e_ht else (None, None)
        if edges is None and paper_modal_x is None:
            continue
        body = [ln for ln in lines if not (hdr_top and ln["top"] <= hdr_top + 2)]
        out["pages"].append({"page": pno, "header": hdr_top is not None})
        for ln in body:
            ws = ln["words"]
            txt = ln["text"]
            tm = TOTAL_SUFFIX_RE.search(txt.strip())
            if tm:
                if cur_q is not None:
                    cur_q["total"] = int(tm.group(1))
                    out["questions"].append(cur_q)
                    cur_q = cur_row = buffered = None
                    alt_state = False
                continue
            if FURNITURE_RE.match(txt.strip()):
                continue
            qnum = None
            if ws:
                w0 = ws[0]
                qx = edges["q"] if edges else 120
                if w0["x0"] < qx + 36:
                    m0 = NUM_RE.match(w0["text"])
                    if m0:
                        n = int(m0.group(1))
                        if n == expected_q:
                            qnum = n
                            if m0.group(2):
                                w0["text"] = "\x00LABEL\x00" + m0.group(2)
                        else:
                            anomalies.append(
                                f"p{pno} y{ln['top']:.0f}: num {n} != expected {expected_q}")
            if qnum is not None:
                if cur_q is not None:
                    out["questions"].append(cur_q)
                cur_q = {"printed": qnum, "total": None, "page": pno, "rows": []}
                cur_row = buffered = None
                alt_state = False
                expected_q = qnum + 1
            # per-page empirical code column governs detection
            pcx = page_code_x.get(pno)
            # Alternative / Method-N markers
            first_n = None
            if pcx is not None:
                first_n = next((w for w in ws if w["x0"] >= pcx - 2), None)
            elif edges:
                first_n = next((w for w in ws if w["x0"] >= edges["n"] - 6), None)
            if first_n is not None:
                if re.match(r"^Alternative\b", first_n["text"]):
                    alt_state = True
                elif re.match(r"^Method$", first_n["text"]):
                    idx = ws.index(first_n)
                    nxt = ws[idx + 1]["text"] if idx + 1 < len(ws) else ""
                    if nxt.isdigit() and int(nxt) >= 2:
                        alt_state = True
                else:
                    mm = re.match(r"^Method\s*(\d)", first_n["text"])
                    if mm and int(mm.group(1)) >= 2:
                        alt_state = True
            # code row detection — per-page empirical code column governs
            code_w = None
            cxl = (pcx - 8) if pcx is not None else \
                (edges["n"] - 6 if edges else 1e9)
            for w in ws:
                if w["text"].startswith("\x00LABEL"):
                    continue
                if w["x0"] >= cxl and CODE_FUSED_RE.match(w["text"]):
                    code_w = w
                    break
                if w["x0"] >= cxl:
                    break
            if code_w is not None and cur_q is not None:
                markv = None
                for w in ws:
                    if w is code_w:
                        continue
                    x1, x0 = w["x1"], w["x0"]
                    if edges:
                        inwin = edges["m"] - 6 <= x0 < edges["n"] - 6
                    else:
                        inwin = code_w["x0"] - 30 <= x0 and x1 <= code_w["x0"] - 1
                    if inwin and re.match(r"^\d{1,2}$", w["text"]):
                        markv = int(w["text"])
                        break
                head_toks = []
                for w in ws:
                    if w is code_w or w["text"].startswith("\x00LABEL"):
                        continue
                    if edges:
                        c = ("q" if w["x0"] < edges["w"] else
                             "w" if w["x0"] < edges["a"] else
                             "a" if w["x0"] < edges["m"] else
                             "m" if w["x0"] < edges["n"] else "n")
                        keep = (c in ("a", "n") and w["x0"] > code_w["x0"]) or \
                               (c == "a" and w["x0"] < code_w["x0"])
                    else:
                        keep = (w["x0"] > code_w["x1"]) or (
                            w["x0"] < code_w["x0"] - 30 and
                            not re.match(r"^\d{1,2}$", w["text"]))
                    if keep:
                        head_toks.append(w["text"])
                cur_row = {
                    "code": code_w["text"], "page": pno, "top": round(ln["top"], 1),
                    "markv": markv, "head": " ".join(head_toks), "subs": [],
                    "alt": alt_state,
                }
                cur_q["rows"].append(cur_row)
                if buffered is not None:
                    if markv is None and buffered["markv"] is not None:
                        cur_row["markv"] = buffered["markv"]
                        cur_row["markv_from_label_line"] = True
                    if buffered["sub"]:
                        cur_row["subs"].insert(0, buffered["sub"])
                    buffered = None
                continue
            if FURNITURE_RE.match(txt.strip()):
                continue
            if cur_row is not None:
                s = segs(ws, edges, pcx)
                s.pop("m", None)
                s.pop("q", None)
                cur_row["subs"].append({
                    "page": pno, "top": round(ln["top"], 1),
                    "a": " ".join(s.get("a", [])), "w": " ".join(s.get("w", [])),
                    "n": " ".join(s.get("n", [])), "text": txt,
                })
            elif cur_q is not None:
                markv = None
                for w in ws:
                    x0, x1 = w["x0"], w["x1"]
                    if edges:
                        inwin = edges["m"] - 6 <= x0 < edges["n"] - 6
                    else:
                        inwin = pcx and code_x_near(w, pcx)
                    if inwin and re.match(r"^\d{1,2}$", w["text"]):
                        markv = int(w["text"])
                        break
                # codeless-row capture: mark-carrying line with no code token at
                # the code column (2021-01-01R Q1 class, char-verified) — only at
                # question/row-buffer boundaries, never mid-row, and only when the
                # line carries NO question-label token (else it is a buffered
                # label line whose code row follows)
                codeless = False
                if markv is not None and pcx is not None and markv <= 20:
                    has_code = any(CODE_FUSED_RE.match(w["text"]) and
                                   abs(w["x0"] - pcx) <= 10 for w in ws)
                    has_label = any(
                        (w["text"].startswith("\x00LABEL") or
                         (LABEL_TOK_RE.match(w["text"]) and w["x0"] < 135))
                        for w in ws)
                    if not has_code and not has_label:
                        ans_toks = [w["text"] for w in ws
                                    if not w["text"].startswith("\x00LABEL")
                                    and not re.match(r"^\d{1,2}$", w["text"])
                                    and w["x0"] < pcx - 30]
                        note_toks = [w["text"] for w in ws if w["x0"] >= pcx - 2]
                        cur_row = {
                            "code": None, "page": pno, "top": round(ln["top"], 1),
                            "markv": markv, "head": " ".join(ans_toks), "subs": [],
                            "alt": alt_state, "codeless": True,
                        }
                        if note_toks:
                            cur_row["subs"].append({
                                "page": pno, "top": round(ln["top"], 1),
                                "a": "", "w": "", "n": " ".join(note_toks),
                                "text": " ".join(note_toks),
                            })
                        cur_q["rows"].append(cur_row)
                        if buffered is not None:
                            if buffered["sub"]:
                                cur_row["subs"].insert(0, buffered["sub"])
                            buffered = None
                        codeless = True
                if codeless:
                    continue
                s = segs(ws, edges, pcx)
                s.pop("m", None)
                s.pop("q", None)
                buffered = {"page": pno, "top": round(ln["top"], 1), "markv": markv,
                            "sub": {"page": pno, "top": round(ln["top"], 1),
                                    "a": " ".join(s.get("a", [])),
                                    "w": " ".join(s.get("w", [])),
                                    "n": " ".join(s.get("n", [])), "text": txt}}

    if cur_q is not None:
        out["questions"].append(cur_q)
    out["anomalies"] = anomalies
    return out


def code_x_near(w, code_x):
    return code_x - 30 <= w["x0"] and w["x1"] <= code_x - 1


if __name__ == "__main__":
    paper = sys.argv[1]
    rows = extract_pdf(os.path.join(paper, "ms.pdf"))
    dest = "/home/z/my-project/scripts/mb4_rows/" + os.path.basename(
        os.path.dirname(paper)) + "-" + os.path.basename(paper) + ".json"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    json.dump(rows, open(dest, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    n_rows = sum(len(q["rows"]) for q in rows["questions"])
    print(f"{os.path.basename(paper)}: questions={len(rows['questions'])} rows={n_rows} "
          f"anomalies={len(rows['anomalies'])}")
