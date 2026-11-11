#!/usr/bin/env python3
"""RN-DEBRIS-11 run-016 — the official-row extraction of record.

Targets (the run-015 follow-up queues of record):
  A. the excluded 2.3.2 row family — cie-as-maths-20-pure-2 SPEC_POINT 2.3.2
     (run-015 contentDefectQueue[0]) + its both-planes-equal sibling
     cie-a-level-maths-20-pure-2 2.3.2 + the pure-3 3.3.2 KG-stale row
     (same official statement family, 9709 P2 §2.3 / P3 §3.3).
  B. the structural projection deltas — cs-23 T7/T9/T10 husk-fill
     (run-015 censusMismatches cs-23 TOPIC 10 vs 7; content husks have zero
     children; official 0478 2023-2025 T7/T9/T10 carry no subtopic layer,
     so points are topic-level 2-level codes per the fleet precedent
     igcse-chemistry-19 4CH1-<topic>.<point>).

Sources of record (byte-verified this run):
  PDF  work/rn16docs/9709-2023-2025-syllabus.pdf
       sha256 3a7a37692399f47ff5e0d94cc41f9dd33d3b99467ce83aa4bad28c6136f96256
       sha1   997e5a9f0d8b0eb2c2c51568f95b81bae78c2e32
       == the run-009 pins of record (run009docs/pdf_sha256.txt, pins.9709)
       fetched at syllabai-resources @ 4e3a1c6843b0 (the run-009 fetch tip)
  PDF  work/rn16docs/0478-2023-2025-syllabus.pdf
       sha256 48cd6cf03e2a29cdf6c106aee2677919a6b17b4b50a7ab6ddded1ca7633cbdb4
       sha1   bee666fb57b27b01eb1e32e20ea8773aff1a2b20 == upstream spec.json pin
       fetched at syllabai-resources @ 4e3a1c6843b0 (fresh pin of record)

Laws (inherited, cited):
  - run-009/013 extraction laws: pdftotext -layout; official-code line +
    title-column capture (3+-space column split); wrapped-continuation join
    with a single space (run-010 G4 law); CTRL strip [\x00-\x1f]; page-repeat
    '(continued)' dedupe; notes column excluded from titles (statement-only
    law — cs-23's own clean titles 1.1.1/4.1.1/6.3.1/8.1.1/8.2.1 are
    statement-only).
  - corpus glyph-convention law (run-013 composed precedent): the 9709 PDF's
    math glyphs decode to the corpus's established Unicode forms; every
    mapping below is corroborated by TWO independent corpus artifacts
    (cie-as-maths-20-pure-2 spine 2.3.2 title + cie-a-level-maths-20-pure-3
    content/spine 3.3.2 title) and the raw token boundaries.
  - lettered-row law (fleet precedent, 714 codes): doc rows (a)(b)(c) become
    separate points, letter in the code, token stripped from the title
    (igcse-economics-17 1.1.3a..j precedent).
  - roman sub-item law: (i)(ii)(iii) items completing a row statement are
    flattened verbatim into that row's title (they share one notes block;
    the econ '•'-join shape applies to dash bullets, roman tokens preserved
    as the doc's own enumeration).
  - zero-invention: every emitted byte traces to the pinned PDFs or to the
    corpus's own established forms, cited per-row.

Output: work/rn16docs/rn16_official_evidence.json
"""
import hashlib
import json
import re
import sys
from pathlib import Path

WORK = Path("/home/z/my-project/work/rn16docs")
REPO = Path("/home/z/my-project/work/syllabai-v2")

PIN_9709_SHA256 = "3a7a37692399f47ff5e0d94cc41f9dd33d3b99467ce83aa4bad28c6136f96256"
PIN_9709_SHA1 = "997e5a9f0d8b0eb2c2c51568f95b81bae78c2e32"
PIN_0478_SHA256 = "48cd6cf03e2a29cdf6c106aee2677919a6b17b4b50a7ab6ddded1ca7633cbdb4"
PIN_0478_SHA1 = "bee666fb57b27b01eb1e32e20ea8773aff1a2b20"
RESOURCES_PIN = "4e3a1c6843b0"

CTRL_RE = re.compile(r"[\x00-\x1f]")
CONT_RE = re.compile(r"\s*\(*continued\)*\s*$", re.I)


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


def sha1(p):
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def join_wrapped(lines):
    """run-010 G4 wrap law: join with single spaces, strip CTRL, collapse ws."""
    s = " ".join(CTRL_RE.sub("", l).strip() for l in lines if l.strip())
    return " ".join(s.split())


# ── 9709: P2 §2.3 + P3 §3.3 bullet rows ─────────────────────────────────

def extract_9709():
    txt = (WORK / "9709.txt").read_text(encoding="utf-8")
    lines = txt.splitlines()

    def section(name, start_hint):
        """Return (start_idx, end_idx) of a subject-content section."""
        hits = [i for i, l in enumerate(lines) if re.match(rf"^\s*{name}\s+Trigonometry\s*$", l)]
        # subject-content occurrences only (the ToC rows carry trailing page numbers)
        hits = [i for i in hits if "Trigonometry" in l and not re.search(r"\d+\s*$", lines[i])]
        return hits

    p2 = [i for i, l in enumerate(lines) if re.match(r"^\s*2\.3\s+Trigonometry\s*$", l)]
    p3 = [i for i, l in enumerate(lines) if re.match(r"^\s*3\.3\s+Trigonometry\s*$", l)]
    # the ToC block repeats the headers — the subject-content copy is the LAST hit
    if not p2 or not p3:
        fail(f"section headers not found: P2 {p2} P3 {p3}")
    p2, p3 = [p2[-1]], [p3[-1]]

    def bullets_until(start, stop_re):
        """Collect the '•' bullet rows between section start and the next header.

        Column law: statement column ends at the first 3+-space gap (notes
        column excluded). Dash items ('–') carry their own wrapped
        continuations (indent 17-25, no notes gap). Statement continuations
        sit at indent 12-18.
        """
        rows = []
        cur = None
        for i in range(start + 1, len(lines)):
            l = lines[i]
            if re.match(stop_re, l):
                break
            if "Candidates should be able to" in l:
                continue
            m = re.match(r"^\s{8,12}•\s{2,}(\S.*?)(?:\s{3,}.*)?$", l)
            if m:
                if cur:
                    rows.append(cur)
                cur = {"raw": [m.group(1)], "dashes": [], "lines": [i]}
                continue
            if cur is None:
                continue
            dash = re.match(r"^\s{10,16}–\s{1,}(\S.*?)(?:\s{3,}.*)?$", l)
            if dash:
                cur["dashes"].append({"raw": [dash.group(1)], "lines": [i]})
                continue
            left = re.match(r"^\s{12,18}(\S.*?)(?:\s{3,}.*)?$", l)
            if left:
                if cur["dashes"]:
                    cur["dashes"][-1]["raw"].append(left.group(1))
                else:
                    cur["raw"].append(left.group(1))
                continue
            deep = re.match(r"^\s{17,25}(\S.*?)(?:\s{3,}.*)?$", l)
            if deep and cur["dashes"]:
                cur["dashes"][-1]["raw"].append(deep.group(1))
        if cur:
            rows.append(cur)
        return rows

    p2_rows = bullets_until(p2[0], r"^\s*2\.4\s+Differentiation")
    p3_rows = bullets_until(p3[0], r"^\s*3\s+Pure Mathematics 3")
    if len(p2_rows) != 2 or len(p3_rows) != 2:
        fail(f"9709 bullet-row counts wrong: P2 {len(p2_rows)} P3 {len(p3_rows)}")

    # corpus glyph-convention decode of the shared statement row (row 2)
    # corroboration sources: the two corpus artifacts of record
    repo = REPO
    spine_as_p2 = json.loads((repo / "apps/hub/spines/cie-as-maths-20-pure-2.json").read_text())["curriculum"]["nodes"]
    cont_p3 = json.loads((repo / "apps/hub/content/cie-a-level-maths-20-pure-3/curriculum.json").read_text())["nodes"]
    spine_form = next(n["title"] for n in spine_as_p2 if n.get("code") == "2.3.2")
    p3_form = next(n["title"] for n in cont_p3 if n.get("code") == "3.3.2")

    # raw statement pieces (wrap-joined, statement column only)
    p2_stmt = join_wrapped(p2_rows[1]["raw"])
    p3_stmt = join_wrapped(p3_rows[1]["raw"])
    p2_dashes = [join_wrapped([d for d in dsh["raw"]]) for dsh in p2_rows[1].get("dashes", [])]
    p3_dashes = [join_wrapped([d for d in dsh["raw"]]) for dsh in p3_rows[1].get("dashes", [])]

    # corpus glyph-convention decode table (run-013 composed precedent).
    # Each mapping is corroborated by BOTH corpus artifacts of record and the
    # raw token boundaries; a raw mismatch fails loudly (PDF drift guard).
    DASH_DECODE = {
        "sec 2 i /1 + tan 2 i and cosec 2 i /1 + cot 2 i":
            "sec²θ≡1+tan²θ and cosec²θ≡1+cot²θ",
        "the expression of a sin i + b cos i in the forms R sin ^i ! ah and R cos ^i ! ah .":
            "the expression of asinθ+bcosθ in the forms Rsin(θ±A) and Rcos(θ±A).",
    }
    VERBATIM_DASH = {
        "the expansions of sin(A ± B), cos(A ± B) and tan(A ± B)",
        "the formulae for sin 2A, cos 2A and tan 2A",
    }
    assert len(p2_dashes) == 4, f"P2 dash count {len(p2_dashes)} != 4"
    assert len(p3_dashes) == 4, f"P3 dash count {len(p3_dashes)} != 4"
    assert p2_dashes == p3_dashes, "P2/P3 dash raws diverge"
    for d in p2_dashes:
        if d in VERBATIM_DASH:
            continue
        if d not in DASH_DECODE:
            fail(f"dash row has no corpus glyph mapping of record: {d!r}")
    decoded_dashes = [DASH_DECODE.get(d, d) for d in p2_dashes]
    # corpus flatten law (run-011 shape): statement + ': ' + bullets joined ' • '
    official_232 = p2_stmt + ": • " + " • ".join(decoded_dashes)
    if not official_232.endswith("."):
        fail("official 2.3.2 row does not end with the doc's period")
    # corroboration: byte-equal to the as-pure-2 spine artifact of record
    if official_232 != spine_form:
        fail("assembled official row != corpus spine artifact (cie-as-maths-20-pure-2 2.3.2)")
    # pure-3 form: the corpus artifact carries (a) the documented single-space
    # glue ("1+tan²θand") and (b) a title-notes glue tail ("• e.g. …" — the
    # run-013 title-notes-glue class). Strip the tail + glue-normalize; the
    # prefix must then byte-equal the official row.
    p3_work = p3_form
    tail_idx = p3_work.find(" • e.g. ")
    p3_tail = None
    if tail_idx != -1:
        p3_tail = p3_work[tail_idx + 3:]  # keep the '• e.g. …' glue tail verbatim for the receipt
        p3_work = p3_work[:tail_idx]
    p3_norm = p3_work.replace("1+tan²θand", "1+tan²θ and")
    if p3_norm != official_232:
        fail("pure-3 corpus form does not reconcile with the official row "
             f"after glue-normalization: {p3_norm!r}")

    evidence_9709 = {
        "pin": {"pdf": "9709-2023-2025-syllabus.pdf",
                "sha256": sha256(WORK / "9709-2023-2025-syllabus.pdf"),
                "sha1": sha1(WORK / "9709-2023-2025-syllabus.pdf"),
                "resourcesPin": RESOURCES_PIN,
                "expectedSha256": PIN_9709_SHA256, "expectedSha1": PIN_9709_SHA1},
        "official_2_3_2_title": official_232,
        "glyphLaw": {
            "rawDashToCorpus": DASH_DECODE,
            "verbatimDashes": sorted(VERBATIM_DASH),
            "corroboration": "cie-as-maths-20-pure-2 spine 2.3.2 (byte-equal) + "
                             "cie-a-level-maths-20-pure-3 content 3.3.2 (equal after the "
                             "documented '1+tan²θand' glue normalization)",
        },
        "sections": {
            "P2_2.3": {"raw": [{"type": "bullet", "raw": join_wrapped(r["raw"]),
                                "dashes": [join_wrapped([d for d in dsh["raw"]]) for dsh in r.get("dashes", [])],
                                "lines": r["lines"]} for r in p2_rows]},
            "P3_3.3": {"raw": [{"type": "bullet", "raw": join_wrapped(r["raw"]),
                                "dashes": [join_wrapped([d for d in dsh["raw"]]) for dsh in r.get("dashes", [])],
                                "lines": r["lines"]} for r in p3_rows]},
        },
        "corpusCorroboration": {
            "cie-as-maths-20-pure-2 spine 2.3.2": spine_form,
            "cie-a-level-maths-20-pure-3 content 3.3.2": p3_form,
            "cie-a-level-maths-20-pure-3 3.3.2 strippedGlueTail": p3_tail,
            "pure3GlueLaw": "content 3.3.2 carries (a) the '1+tan²θand' single-space "
                            "glue and (b) a title-notes glue tail ('• e.g. …' — run-013 "
                            "title-notes-glue class); both stripped under the "
                            "statement-only + raw-token laws; the tail is pinned verbatim",
        },
        "_internal": {"p2_stmt": p2_stmt, "p3_stmt": p3_stmt,
                      "p2_dashes": p2_dashes, "p3_dashes": p3_dashes,
                      "spine_form": spine_form, "p3_form": p3_form,
                      "p3_tail": p3_tail},
    }
    return evidence_9709


# ── 0478: T7 / T9 / T10 numbered rows ───────────────────────────────────

def extract_0478():
    txt = (WORK / "0478.txt").read_text(encoding="utf-8")
    lines = txt.splitlines()

    headers = {
        "T7": [i for i, l in enumerate(lines) if re.match(r"^\s*7\s{1,}Algorithm design and problem-solving\s*$", l)],
        "T9": [i for i, l in enumerate(lines) if re.match(r"^\s*9\s{1,}Databases\s*$", l)],
        "T10": [i for i, l in enumerate(lines) if re.match(r"^\s*10\s{1,}Boolean logic\s*$", l)],
    }
    stops_raw = {
        "T7": [i for i, l in enumerate(lines) if re.match(r"^\s*8\s{1,}Programming\s*$", l)],
        "T9": [i for i, l in enumerate(lines) if re.match(r"^\s*10\s{1,}Boolean logic\s*$", l)],
        "T10": [i for i, l in enumerate(lines) if re.match(r"^\s*4\s{1,}Details of the assessment\s*$", l)],
    }
    for k in ("T7", "T9", "T10"):
        if not headers[k]:
            fail(f"{k} header not found")
        headers[k] = [headers[k][-1]]  # subject-content copy = last hit (ToC repeats)
    stops = {k: [i for i in stops_raw[k] if i > headers[k][0]] for k in ("T7", "T9", "T10")}

    def rows_between(start, stop):
        """Numbered rows + lettered sub-rows + roman sub-items, statement column only.

        Grammar (doc law):
          - row line:      'N  statement' or 'N  (a) statement'  (inline letter)
          - letter line:   '(b) statement' on its own line
          - roman line:    '(i) item' completing the active letter's statement
          - page header:   'N  <topic title> continued'  (skip)
        Statement column ends at the first 3+-space gap; wrapped continuations
        join with a single space; CTRL chars stripped before matching.
        """
        out = []
        cur = None
        for i in range(start + 1, stop):
            raw = CTRL_RE.sub("", lines[i].expandtabs(8))
            if "Candidates should be able to" in raw or "Notes and guidance" in raw:
                continue
            if "Back to contents page" in raw or "www.cambridgeinternational.org" in raw:
                continue
            if re.match(r"^\s*Cambridge IGCSE Computer Science 0478", raw):
                continue
            if re.match(r"^\s*\d+\s{1,}\S.*continued\s*$", raw):
                continue  # page-repeat topic header
            m = re.match(r"^ {8,14}(\d{1,2})\s{2,}(\S.*?)(?:\s{3,}•.*)?$", raw)
            if m and len(m.group(1)) <= 2 and m.start(2) < 60:
                if cur:
                    out.append(cur)
                rest = m.group(2)
                cur = {"n": int(m.group(1)), "raw": [], "letters": [], "lines": [i]}
                mi = re.match(r"^\(([a-h])\)\s*(.*)$", rest)
                if mi:  # inline letter: row's statement is its (a) row
                    cur["letters"] = [{"letter": mi.group(1), "raw": [mi.group(2)], "romans": []}]
                    cur["active_letter"] = 0
                else:
                    cur["raw"].append(rest)
                continue
            ml = re.match(r"^ {8,20}\(([a-h])\)\s*(\S.*?)(?:\s{3,}•.*)?$", raw)
            if ml and cur is not None:
                cur["letters"].append({"letter": ml.group(1), "raw": [ml.group(2)], "romans": []})
                cur["active_letter"] = len(cur["letters"]) - 1
                continue
            mr = re.match(r"^ {4,20}\((i{1,3}|iv|v)\)\s*(\S.*)$", raw)
            if mr and cur is not None and cur.get("letters"):
                cur["letters"][cur["active_letter"]]["romans"].append(
                    {"roman": mr.group(1), "raw": [mr.group(2)]})
                continue
            if cur is None:
                continue
            body = raw.lstrip()
            indent = len(raw) - len(body)
            if not (13 <= indent <= 30):
                continue  # notes column (>=62) and blanks are never statement text
            if body and not body.startswith(("•", "–", "e.g.", "Notes", "Limited to:", "Including:")):
                cut = re.sub(r"\s{3,}.*$", "", body).strip()
                if not cut:
                    continue
                if cur.get("letters"):
                    tgt = cur["letters"][cur["active_letter"]]
                    if tgt["romans"]:
                        tgt["romans"][-1]["raw"].append(cut)
                    else:
                        tgt["raw"].append(cut)
                else:
                    cur["raw"].append(cut)
        if cur:
            out.append(cur)
        return out

    sections = {}
    for k, stopk in stops.items():
        rows = rows_between(headers[k][0], stops[k][0] if stops[k] else len(lines))
        sections[k] = rows

    ev_rows = {}
    for k in ("T7", "T9", "T10"):
        rows_out = []
        for r in sections[k]:
            letters_out = []
            for lt in r.get("letters", []):
                letters_out.append({
                    "letter": lt["letter"],
                    "statement": join_wrapped(lt["raw"]),
                    "romans": [{"roman": rm["roman"], "text": join_wrapped(rm["raw"])}
                               for rm in lt["romans"]],
                })
            rows_out.append({"n": r["n"], "statement": join_wrapped(r["raw"]),
                             "letters": letters_out})
        ev_rows[k] = rows_out
    ev = {"pin": {"pdf": "0478-2023-2025-syllabus.pdf",
                  "sha256": sha256(WORK / "0478-2023-2025-syllabus.pdf"),
                  "sha1": sha1(WORK / "0478-2023-2025-syllabus.pdf"),
                  "resourcesPin": RESOURCES_PIN,
                  "expectedSha256": PIN_0478_SHA256, "expectedSha1": PIN_0478_SHA1},
          "headers": {k: {"line": headers[k][0], "title": join_wrapped([lines[headers[k][0]].strip().split(None, 1)[1]])}
                      for k in ("T7", "T9", "T10")},
          "rows": ev_rows}
    return ev


def main():
    ev9 = extract_9709()
    ev4 = extract_0478()

    # ── continuity + structural asserts ─────────────────────────────────
    if ev9["pin"]["sha256"] != PIN_9709_SHA256 or ev9["pin"]["sha1"] != PIN_9709_SHA1:
        fail("9709 PDF pins do NOT match the run-009 pins of record")
    if ev4["pin"]["sha256"] != PIN_0478_SHA256 or ev4["pin"]["sha1"] != PIN_0478_SHA1:
        fail("0478 PDF pins do NOT match the spec.json/upstream pins")
    if len(ev4["rows"]["T7"]) != 9:
        fail(f"T7 row count {len(ev4['rows']['T7'])} != 9 (doc rows 1-9)")
    if len(ev4["rows"]["T9"]) != 4:
        fail(f"T9 row count {len(ev4['rows']['T9'])} != 4")
    if len(ev4["rows"]["T10"]) != 3:
        fail(f"T10 row count {len(ev4['rows']['T10'])} != 3")
    # P2/P3 statement rows byte-equal each other (same official statement)
    if ev9["_internal"]["p2_stmt"] != ev9["_internal"]["p3_stmt"]:
        fail("P2 2.3 and P3 3.3 statement rows diverge — not the same official row")

    art = {"artifact": "rn11-run-016-official-evidence-r0",
           "law": "run-009/010/011/013 extraction law family; corpus glyph-convention corroborated 2-source",
           "evidence_9709": ev9, "evidence_0478": ev4}
    out = WORK / "rn16_official_evidence.json"
    out.write_text(json.dumps(art, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK — wrote {out} ({out.stat().st_size} bytes)")
    print("9709 statement:", ev9["_internal"]["p2_stmt"][:120], "…")
    print("0478 T7 rows:", len(ev4["rows"]["T7"]), "| letters:",
          sum(len(r.get("letters", [])) for r in ev4["rows"]["T7"]))
    for r in ev4["rows"]["T7"]:
        print(f"  7.{r['n']}: {r['statement'][:70]}")


if __name__ == "__main__":
    main()
