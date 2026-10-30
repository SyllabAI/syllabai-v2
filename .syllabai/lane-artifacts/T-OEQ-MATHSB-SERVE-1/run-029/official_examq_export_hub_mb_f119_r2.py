#!/usr/bin/env python3
"""official_examq_export_hub_mb.py — the maths-B (4MB1) hub exporter of record.

PORT PROVENANCE (T-OEQ-MATHSB-SERVE-1 run-003): faithful port of
scripts/official_examq_export_hub.py (chemistry exporter of record, v6 law)
at SyllabAI/syllabai-resources 3000e439d1464c2927d082696f5bb19313af3172
(the P0 pin of record), with the course lane parameters swapped and FOUR
disclosed deviations:

  D1  course constants: CORPUS igcse-maths-b-16, code 4MB1, slug prefix
      official-4mb1-, papers 01/01R/02/02R, series labels add October (the
      2025-10 session exists in the corpus of record), curriculum block
      mirrors the maths-B bundle of record (subject "Maths", version "2016").
  D2  set topicId := sha1("<series>-<paper>")[:12] — PER-SET identity. The
      chemistry exporter scopes topicId per series (sha1(series)), which
      collides across the 4 papers of a series (54 chemistry sets / 16 ids —
      live of record). The F44 identity law ("the paper code is part of the
      identity") + the card's open DB-plane ingest item motivate the per-set
      law here; a NEW file has no bundle-of-record to break.
  D3  the wave-15 STEM-RESTORE ledger and wave-20 SOLUTION-ENRICH ledger are
      ABSENT for maths-B (they are chemistry UX ledgers): both load as {},
      so stems pass the unledgered path (mechanical cleaning only, splice
      guard kept) and every part serves its MS-derived solution. The
      exporter runs with NO authored content anywhere (values never
      invented; ADR-039).
  D4  bundle file law: the maths-B bundle of record serializes SINGLE-LINE
      COMPACT (separators=(',',':'), ensure_ascii=False — byte-proven
      against igcse-maths-b-16/questions.json and manifest.json), not
      chemistry's indent=1. G-E4 uses the maths law; the new
      official-papers.json follows the same course bundle law.

Everything else — export_series field law, F-W15-1 stem splice + splice
guard, F-W15-2 furniture strip, F-W15-4 stub copy, F-W20-1 stem-figure
handling, shared-ref resolution, G-E1/G-E1b/G-E2/G-E3/G-E4 gate bodies,
input laws, first-run census emission — is the chemistry exporter's logic
verbatim. Deterministic; no LLM in the loop (ADR-037/039).

R2 ALIGNMENT (T-OEQ-MATHSB-SERVE-1 run-028, operator pick trace
1a18be5e96ccb585 "R2-first" on the run-021 remediation menu): the run-021
byte-no-op probe proved the exporter LAW re-transforms 8/27 corpus-synced
fields away from the served plane (S1 stem-splice echo x4 problemMd —
F-W15-1 prepends unsynced question-level stem_md raw forms; S2 furniture
strip x4 — strip_furniture eats the "Total N marks" trailer the plane's
rebuilt MS blocks retain). This version adds the --synced-fields ledger:
part fields recorded there pass through from the corpus VERBATIM (no stem
splice, no figure footer append, no furniture strip) and gate G-E7 proves
IN-RUN, fail-closed, that every ledgered field's staged value is
byte-identical to the plane of record — ledger drift refuses the run (the
F-W15-1 ledger-drift pattern). Ledger of record: run-017 t3-corpus-reconcile
C120-C146 pins minus C145 (the disclosed run-018 q27-b residual whose
corpus side rides the next converter run) = 26 fields, fresh-verified
corpus==plane at resources 5f170f98 <-> v2 HEAD plane edbe22de. Base of
record: official_examq_export_hub_mb_f119.py (sha256 c1079e9dd63e120d…,
the F119 partLabel wave); the ONLY deltas of this file are this ledger
law, the pass-through branches and the G-E7 gate. G-E7 runs ONLY when
--synced-fields is supplied; without the flag this file is byte-law
identical to the f119 base.

Usage:
  pass 1 (census emission, first run):
    official_examq_export_hub_mb.py <out_stage> <current_questions.json> \
        --current-official-papers <empty [] file> --allow-new-official \
        --emit-expected-deltas <census.json> [--source-cut main@<40hex>]
  pass 2 (gated run):
    official_examq_export_hub_mb.py <out_stage> <current_questions.json> \
        --current-official-papers <empty [] file> --allow-new-official \
        --expected-deltas <census.json> [--source-cut main@<40hex>]
"""
import json, glob, os, re, subprocess, sys, hashlib
from pathlib import Path

REPO_ROOT = str(Path(__file__).resolve().parent)  # syllabai-resources checkout root
COURSE = "igcse-maths-b-16"
CORPUS = str(Path(REPO_ROOT) / "Official-ExamQuestion" / COURSE)
RAW = "https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/Official-ExamQuestion/igcse-maths-b-16"
SERIES_LABEL = {"01": "January", "06": "June", "10": "October", "11": "November"}
OFFICIAL_SLUG_PREFIX = "official-4mb1-"


def series_label(series):
    year, mm = series.split("-")
    return f"{SERIES_LABEL.get(mm, mm)} {year}"


def part_slug(pn):
    return pn.replace("(", "-").replace(")", "")


def printed_part_label(part_number):
    """F119: the printed part label ("(a)", "(a)(i)") served as a first-class
    field (sourcePaper.questionPart) — the corpus part_number minus its leading
    question number. None IFF the part_number carries no printed sub-part label
    (maths-B's bare whole-question slices: "2", "4", …). Fail-closed grammar:
    1-3 parenthesized [a-z0-9]{1,5} groups; anything else refuses (None) — and
    G-E6's id cross-check then refuses the part outright if its id slug
    disagrees. Ported byte-faithfully from the main exporter of record's F119
    wave (T-OEQ-PARTLABEL-3); the only deltas vs the archived T-OEQ-MATHSB-SERVE-1
    port base."""
    m = re.match(r"^\d+(.*)$", (part_number or "").strip())
    rest = (m.group(1) if m else "").strip()
    if not rest:
        return None
    if not re.match(r"^(?:\([a-z0-9]{1,5}\)){1,3}$", rest):
        return None
    return rest


def raw_url(series, paper, rel_path):
    return f"{RAW}/{series}/4MB1-{paper}/{rel_path}"


def resolve_asset_path(a, by_id):
    if a.get("path"):
        return a["path"]
    ref = a.get("ref_part")
    if ref and ref in by_id:
        return by_id[ref].get("path")
    return None


# F-W15-2 furniture strip (verbatim from the chemistry exporter of record).
FURNITURE_WORDS = {"question", "number", "answer", "notes", "marks",
                   "additional", "guidance", "total", "for"}


def _is_furniture_line(line):
    toks = [t for t in re.split(r"[^A-Za-z]+", line) if t]
    return bool(toks) and all(t.lower().lstrip("0123456789") in FURNITURE_WORDS for t in toks)


def strip_furniture(sol):
    if not sol:
        return sol
    lines = sol.rstrip().splitlines()
    n = 0
    while lines and n < 4:
        last = lines[-1].strip()
        if _is_furniture_line(last) or re.fullmatch(r"Total\s+\d+", last):
            lines.pop()
            n += 1
            continue
        if re.fullmatch(r"Total\s+for\s+Question\s+\d+\s*=\s*\d+\s*marks", last):
            lines.pop()
            n += 1
            continue
        break
    return "\n".join(lines).rstrip() if n else sol


def _bulletize(stem):
    s = re.sub(r"[\x00-\x08\x0b-\x1f]", "", stem).replace("\t", " ")
    for b in ("\u2022", "\u25cf"):
        if s.count(f" {b} ") >= 1:
            parts = [x.strip() for x in s.split(b) if x.strip()]
            if len(parts) >= 3:
                s = parts[0] + "\n" + "\n".join(f"- {p}" for p in parts[1:])
                break
    if len(re.findall(r"\bStep\s+\d+\b", s)) >= 2:
        s = re.sub(r"(?<!^)(?<!\n)\s*(\bStep\s+\d+\b)", r"\n\1", s)
    return s


def restore_stem(q, series, paper, ledger, by_part_num):
    """F-W15-1 unledgered maths path: splice-guard + mechanical cleaning."""
    stem = (q.get("stem_md") or "").strip()
    if not stem:
        return None
    qnum = str(q["question_number"])
    entry = ledger.get("verdicts", {}).get(f"{series}/4MB1-{paper}:Q{qnum}")
    first_md = (q["parts"][0].get("problem_md") or "") if q["parts"] else ""
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    if norm(stem)[:60] and norm(stem)[:60] in norm(first_md):
        return None  # splice-guard
    if entry:
        raise ExportGateError(
            f"F-W15-1: maths-B carries no STEM-RESTORE ledger but an entry was "
            f"found for {series}/4MB1-{paper} Q{qnum} — ledger drift")
    return _bulletize(stem).strip() or None


def export_series(series, paper, topic, stem_ledger, enrich, synced=None):
    tj = topic
    by_id = {}
    for q in tj["questions"]:
        for p in q["parts"]:
            for a in p.get("assets") or []:
                by_id[a["id"]] = a

    questions = []
    for qi, q in enumerate(tj["questions"]):
        qnum = str(q["question_number"])
        by_part_num = {p["part_number"]: p for p in q["parts"]}
        stem_md = restore_stem(q, series, paper, stem_ledger, by_part_num)
        stem_figs_md = []
        s_entry = (stem_ledger or {}).get("verdicts", {}).get(f"{series}/4MB1-{paper}:Q{qnum}") or {}
        ref = (s_entry.get("stemFigureRef") or {}).get("asset")
        if ref:
            ra = by_id.get(ref)
            if ra is None:
                ra = next((a for a in by_id.values() if a.get("ref_part") == ref), None)
            rpath = resolve_asset_path(ra, by_id) if ra else None
            if not ra or ra.get("kind") != "crop" or not rpath:
                raise ExportGateError(
                    f"F-W20-1: stemFigureRef {ref} on {series}/4MB1-{paper} Q{qnum} "
                    f"does not resolve to a real crop asset")
            url = raw_url(series, paper, rpath)
            cap = f"{ra.get('mention', 'figure')} — official paper figure (qp.pdf p.{ra.get('page')})"
            stem_figs_md.append(f"![{cap}]({url})")
        first_assets = (q["parts"][0].get("assets") or []) if q["parts"] else []
        for a in first_assets:
            if not a.get("stem_figure") or a.get("kind") != "crop":
                continue
            rel = resolve_asset_path(a, by_id)
            if not rel:
                raise ExportGateError(
                    f"F-W20-1: stem figure {a['id']} on {series}/4MB1-{paper} Q{qnum} "
                    f"has no resolvable path")
            url = raw_url(series, paper, rel)
            cap = f"{a.get('mention', 'figure')} — official paper figure (qp.pdf p.{a.get('page')})"
            stem_figs_md.append(f"![{cap}]({url})")
        parts = []
        for p in q["parts"]:
            marks = int(p["marks"]) if p.get("marks") is not None else 0
            assets_out, figures_md = [], []
            for a in p.get("assets") or []:
                is_stem_fig = a.get("stem_figure") and len(parts) == 0
                rel = resolve_asset_path(a, by_id)
                entry = {
                    "kind": a.get("kind"),
                    "mention": a.get("mention"),
                    "page": a.get("page"),
                    "review": bool(a.get("review")),
                    "shared": bool(a.get("shared")),
                }
                if a.get("ref_part"):
                    entry["refPart"] = a["ref_part"]
                if a.get("kind") == "crop" and rel:
                    entry["path"] = rel
                    entry["rawUrl"] = raw_url(series, paper, rel)
                    cap = f"{a.get('mention', 'figure')} — official paper figure (qp.pdf p.{a.get('page')})"
                    if a.get("shared"):
                        cap += f" (same figure as {a.get('ref_part')})"
                    if not is_stem_fig:
                        figures_md.append(f"![{cap}]({entry['rawUrl']})")
                elif a.get("kind") == "crop-required":
                    figures_md.append(
                        "> *No printed figure accompanies this part — in the paper "
                        "you would draw the diagram (or label the apparatus) in the "
                        "answer space provided.*")
                assets_out.append(entry)
            # R2/G-E7: ledgered (corpus==plane-synced) part fields pass through verbatim
            pkey = (series, paper, part_slug(p["part_number"]))
            sync_problem = synced is not None and pkey + ("problem_md",) in synced
            sync_solution = synced is not None and pkey + ("solution_md",) in synced
            sync_marks = synced is not None and pkey + ("mark_points",) in synced
            problem_md = (p.get("problem_md") or "").strip()
            if sync_problem:
                pass  # no stem splice, no figure footer append (the synced text is the served form)
            elif len(parts) == 0 and stem_md:
                problem_md = stem_md + "\n\n" + (("\n\n".join(stem_figs_md) + "\n\n") if stem_figs_md else "") + problem_md
            if figures_md and not sync_problem:
                problem_md += "\n\n" + "\n\n".join(figures_md)
            sol = p.get("solution_md") or None
            if sol and not sync_solution:
                sol = strip_furniture(sol) or None
            e_entry = (enrich or {}).get(f"{series}-{paper}:{part_slug(p['part_number'])}")
            if e_entry and e_entry.get("review") == "authored-r0" and e_entry.get("solutionMd"):
                raise ExportGateError(
                    f"F-W20-3: maths-B carries no SOLUTION-ENRICH ledger but an entry "
                    f"was found for {series}-{paper}:{part_slug(p['part_number'])} — ledger drift")
            mp = [{"id": x["id"], "marks": x["marks"],
                   "textMd": x["text_md"] if sync_marks else strip_furniture(x["text_md"])}
                  for x in (p.get("mark_points") or [])]
            choices = None
            if p.get("question_type") == "multiple_choice" and p.get("choices"):
                ch = p["choices"]
                if isinstance(ch, str):
                    ch = json.loads(ch)
                choices = [{"label": c["label"], "isCorrect": bool(c.get("is_correct")),
                            "textMd": c.get("text_md", "")} for c in ch]
            parts.append({
                "id": f"offp_{series}_{paper.lower()}_{part_slug(p['part_number'])}",
                "order": len(parts),
                "questionType": p.get("question_type"),
                "marks": marks,
                "commandWord": None,
                "specPointIds": [],
                "specPointCodes": list(p.get("spec_point_codes") or []),
                "problemMd": problem_md,
                "solutionMd": sol,
                "markPoints": mp,
                "assets": assets_out,
                "answerStatus": p.get("answer_status"),
                "choices": choices,
                "sourcePaper": {
                    "date": series_label(series),
                    "number": f"4MB1/{paper}",
                    "questionNumber": int(qnum) if qnum.isdigit() else None,
                    "questionPart": printed_part_label(p["part_number"]),
                },
            })
        questions.append({
            "id": f"offq_{series}_{paper.lower()}_{part_slug(qnum)}",
            "order": qi,
            "difficulty": None,
            "style": "exam_whole",
            "totalMarks": int(q["total_marks"]) if q.get("total_marks") is not None else sum(x["marks"] for x in parts),
            "parts": parts,
        })

    return {
        "topicId": "off_" + hashlib.sha1(f"{series}-{paper}".encode()).hexdigest()[:12],
        "slug": OFFICIAL_SLUG_PREFIX + paper.lower() + "-" + series,
        "name": f"{series_label(series)} — Paper {paper} (official past paper)",
        "setName": "Official Past Paper",
        "topicSlug": OFFICIAL_SLUG_PREFIX + paper.lower() + "-" + series,
        "section": f"Official past papers (4MB1/{paper})",
        "sectionSlug": "official-past-papers",
        "curriculum": {
            "board": "Pearson Edexcel",
            "level": "IGCSE",
            "subject": "Maths",
            "code": "4MB1",
            "syllabusVersion": "2016",
        },
        "source": {
            "provider": "Pearson Edexcel (operator archive, ADR-037 verbatim extraction)",
            "license": "operator-archive; extracted verbatim from the licensed archive PDFs — see syllabai-resources Official-ExamQuestion/README.md",
            "pageUrl": f"https://github.com/SyllabAI/syllabai-resources/tree/main/Official-ExamQuestion/igcse-maths-b-16/{series}/4MB1-{paper}",
        },
        "schema": "syllabai.official-paper-questions/0.1",
        "relatedNoteIds": [],
        "questions": questions,
    }


# G-E3 census of record — derived from the corpus of record at the P0 pin
# 3000e439d1464c2927d082696f5bb19313af3172 (subtree sha 875b2a88 of
# Official-ExamQuestion/igcse-maths-b-16, byte-identical at branch tip
# 986f9ad2 == merge 3000e439 == main 8b5a64f1); every slice = printed 100
# marks (66 x 100 = 6,600). Frozen like chemistry's MULTI-SERIES constants.
EXPECTED_CENSUS = {
    ("2018-06", "01"): (28, 37, 100),
    ("2019-01", "01"): (27, 36, 100),
    ("2019-06", "01"): (28, 41, 100),
    ("2020-01", "01"): (27, 35, 100),
    ("2020-06", "01"): (29, 38, 100),
    ("2020-11", "01"): (29, 38, 100),
    ("2021-01", "01"): (26, 40, 100),
    ("2021-06", "01"): (27, 33, 100),
    ("2021-11", "01"): (29, 35, 100),
    ("2022-01", "01"): (27, 31, 100),
    ("2022-06", "01"): (27, 34, 100),
    ("2023-01", "01"): (26, 38, 100),
    ("2023-06", "01"): (28, 33, 100),
    ("2023-11", "01"): (28, 38, 100),
    ("2024-06", "01"): (27, 38, 100),
    ("2024-11", "01"): (27, 33, 100),
    ("2025-06", "01"): (26, 38, 100),
    ("2025-10", "01"): (27, 40, 100),
    ("2026-06", "01"): (26, 38, 100),
    ("2018-06", "01R"): (27, 39, 100),
    ("2019-01", "01R"): (28, 37, 100),
    ("2019-06", "01R"): (29, 36, 100),
    ("2020-01", "01R"): (29, 38, 100),
    ("2020-06", "01R"): (26, 33, 100),
    ("2020-11", "01R"): (26, 33, 100),
    ("2021-01", "01R"): (28, 37, 100),
    ("2022-01", "01R"): (29, 37, 100),
    ("2022-06", "01R"): (27, 37, 100),
    ("2023-01", "01R"): (26, 37, 100),
    ("2023-06", "01R"): (26, 40, 100),
    ("2024-06", "01R"): (26, 35, 100),
    ("2025-06", "01R"): (26, 36, 100),
    ("2026-06", "01R"): (27, 40, 100),
    ("2018-06", "02"): (11, 38, 100),
    ("2019-01", "02"): (12, 36, 100),
    ("2019-06", "02"): (11, 37, 100),
    ("2020-01", "02"): (12, 37, 100),
    ("2020-06", "02"): (12, 39, 100),
    ("2020-11", "02"): (12, 39, 100),
    ("2021-01", "02"): (12, 37, 100),
    ("2021-06", "02"): (12, 36, 100),
    ("2021-11", "02"): (11, 33, 100),
    ("2022-01", "02"): (12, 39, 100),
    ("2022-06", "02"): (11, 37, 100),
    ("2023-01", "02"): (12, 30, 100),
    ("2023-06", "02"): (12, 36, 100),
    ("2023-11", "02"): (11, 39, 100),
    ("2024-06", "02"): (11, 39, 100),
    ("2024-11", "02"): (11, 39, 100),
    ("2025-06", "02"): (12, 41, 100),
    ("2025-11", "02"): (12, 34, 100),
    ("2026-06", "02"): (12, 34, 100),
    ("2018-06", "02R"): (12, 34, 100),
    ("2019-01", "02R"): (11, 39, 100),
    ("2019-06", "02R"): (11, 39, 100),
    ("2020-01", "02R"): (11, 36, 100),
    ("2020-06", "02R"): (12, 40, 100),
    ("2020-11", "02R"): (12, 40, 100),
    ("2021-01", "02R"): (11, 44, 100),
    ("2022-01", "02R"): (11, 37, 100),
    ("2022-06", "02R"): (11, 37, 100),
    ("2023-01", "02R"): (12, 35, 100),
    ("2023-06", "02R"): (11, 40, 100),
    ("2024-06", "02R"): (12, 37, 100),
    ("2025-06", "02R"): (12, 38, 100),
    ("2026-06", "02R"): (12, 38, 100),
}

PAPER_SERIES = {
    "01": ['2018-06', '2019-01', '2019-06', '2020-01', '2020-06', '2020-11',
           '2021-01', '2021-06', '2021-11', '2022-01', '2022-06', '2023-01',
           '2023-06', '2023-11', '2024-06', '2024-11', '2025-06', '2025-10',
           '2026-06'],
    "01R": ['2018-06', '2019-01', '2019-06', '2020-01', '2020-06', '2020-11',
            '2021-01', '2022-01', '2022-06', '2023-01', '2023-06', '2024-06',
            '2025-06', '2026-06'],
    "02": ['2018-06', '2019-01', '2019-06', '2020-01', '2020-06', '2020-11',
           '2021-01', '2021-06', '2021-11', '2022-01', '2022-06', '2023-01',
           '2023-06', '2023-11', '2024-06', '2024-11', '2025-06', '2025-11',
           '2026-06'],
    "02R": ['2018-06', '2019-01', '2019-06', '2020-01', '2020-06', '2020-11',
            '2021-01', '2022-01', '2022-06', '2023-01', '2023-06', '2024-06',
            '2025-06', '2026-06'],
}
PAPERS = tuple(PAPER_SERIES)


class ExportGateError(Exception):
    pass


def census(s):
    nq = len(s["questions"])
    nps = sum(len(q["parts"]) for q in s["questions"])
    mk = sum(p["marks"] for q in s["questions"] for p in q["parts"])
    return nq, nps, mk


def is_official(t):
    return t.get("slug", "").startswith(OFFICIAL_SLUG_PREFIX)


IDENTITY_FIELDS = ("topicId", "slug", "name", "setName", "topicSlug",
                   "section", "sectionSlug", "curriculum", "source",
                   "schema", "relatedNoteIds")


def part_map(s):
    return {p["id"]: p for q in s["questions"] for p in q["parts"]}


SOURCE_CUT_RE = re.compile(r"^main@[0-9a-f]{40}$")
CUT_VOLATILE_HEADER = ("generated_utc", "generator")


def parse_source_cut(value):
    if not SOURCE_CUT_RE.match(value or ""):
        raise ValueError(
            f"--source-cut must be main@<40-hex commit sha> (got {value!r})")
    return value


def _cut_topic_bytes(source_cut, rel_path):
    rev = source_cut.split("@", 1)[1] if "@" in source_cut else source_cut
    proc = subprocess.run(
        ["git", "-C", REPO_ROOT, "show", f"{rev}:{rel_path}"],
        capture_output=True)
    if proc.returncode != 0:
        raise ExportGateError(
            f"G-E5: cannot read {rel_path} at the declared data cut {source_cut} "
            f"(git show failed: {proc.stderr.decode(errors='replace').strip()[:200]})")
    return proc.stdout


def _topic_data_plane(raw_bytes):
    d = json.loads(raw_bytes)
    return {k: v for k, v in d.items() if k not in CUT_VOLATILE_HEADER}


def verify_source_cut(source_cut):
    """G-E5 (maths form): the CONSUMED corpus files on disk must BE the
    declared data cut (content-identity modulo the converter header)."""
    checked = 0
    for paper in PAPERS:
        for series in PAPER_SERIES[paper]:
            disk_path = os.path.join(CORPUS, series, f"4MB1-{paper}", "topic.json")
            if not os.path.exists(disk_path):
                raise ExportGateError(f"G-E5: corpus topic missing on disk: {disk_path}")
            staged = _topic_data_plane(open(disk_path, "rb").read())
            rel = f"Official-ExamQuestion/{COURSE}/{series}/4MB1-{paper}/topic.json"
            at_cut = _topic_data_plane(_cut_topic_bytes(source_cut, rel))
            if json.dumps(staged, sort_keys=True) != json.dumps(at_cut, sort_keys=True):
                raise ExportGateError(
                    f"G-E5: on-disk topics for {series}/{paper} are NOT the declared "
                    f"data cut {source_cut} (content drift beyond the converter header)")
            checked += 1
    print(f"G-E5 ok: {checked}/{checked} consumed topics content-identical to the "
          f"declared data cut {source_cut} (modulo the converter header)")


def topics_src(series, paper):
    return json.load(open(os.path.join(CORPUS, series, f"4MB1-{paper}", "topic.json")))


def load_synced(path):
    """R2: the synced-field ledger of record — part fields whose corpus value is
    back-synced byte-exact to the plane of record (run-017 t3-corpus-reconcile
    C120-C146 pin set minus the disclosed C145 residual). Fail-closed grammar."""
    if not path:
        return None
    raw = json.load(open(path))
    entries = raw["fields"] if isinstance(raw, dict) else raw
    synced = set()
    for e in entries:
        try:
            series, paper, part, field = e["series"], e["paper"], e["part"], e["field"]
        except (KeyError, TypeError):
            raise ExportGateError(f"G-E7: synced-field ledger entry off-grammar: {e!r}")
        if field not in ("problem_md", "solution_md", "mark_points"):
            raise ExportGateError(f"G-E7: synced-field ledger unknown field {field!r}")
        key = (series, paper, part_slug(part), field)
        if key in synced:
            raise ExportGateError(f"G-E7: synced-field ledger duplicate key {key}")
        synced.add(key)
    return synced


def verify_synced_fields(out_sets, raw_official_bytes, synced):
    """G-E7 (R2): every ledgered field must resolve AND its staged (corpus
    pass-through) value must be byte-identical to the plane of record — the
    in-run corpus==plane proof. Ledger drift refuses the run (fail-closed, the
    F-W15-1 ledger-drift pattern); no silent pass-through of drifted fields."""
    by_slug = {t.get("slug"): t for t in json.loads(raw_official_bytes)}
    staged = {t["slug"]: t for t in out_sets if is_official(t)}
    fmap = {"problem_md": "problemMd", "solution_md": "solutionMd",
            "mark_points": "markPoints"}

    def _part(t, slug, pid):
        return next((p for q in t["questions"] for p in q["parts"] if p["id"] == pid), None)

    checked = 0
    for series, paper, pslug, field in sorted(synced):
        slug = f"{OFFICIAL_SLUG_PREFIX}{paper.lower()}-{series}"
        pid = f"offp_{series}_{paper.lower()}_{pslug}"
        ts, to = staged.get(slug), by_slug.get(slug)
        sp = _part(ts, slug, pid) if ts else None
        op = _part(to, slug, pid) if to else None
        if sp is None or op is None:
            raise ExportGateError(
                f"G-E7: synced key {series}/{paper}/{pslug}/{field} does not resolve "
                f"(staged part present: {sp is not None}, plane-of-record part present: {op is not None})")
        a, b = sp.get(fmap[field]), op.get(fmap[field])
        if json.dumps(a, sort_keys=True) != json.dumps(b, sort_keys=True):
            raise ExportGateError(
                f"G-E7: SYNCED-FIELD LEDGER DRIFT at {pid} {field} — the corpus "
                f"pass-through value != the plane of record; run the R1 corpus "
                f"back-sync for this field before the R2 lane (fail-closed, "
                f"no silent pass-through of drifted fields)")
        checked += 1
    print(f"G-E7 ok: {checked}/{checked} synced-field keys pass through corpus==plane "
          f"byte-verified against the plane of record (R2 ledger law)")


def run_gates(out_sets, raw_sme_bytes, raw_official_bytes, expected_deltas_path,
              allow_new_official=False, emit_deltas_path=None, stem_ledger=None, enrich=None,
              synced=None):
    by_slug = {t.get("slug"): t for t in json.loads(raw_official_bytes)}
    # ---- G-E3: census constants ----
    n_slices = 0
    for paper in PAPERS:
        for series in PAPER_SERIES[paper]:
            s = next(t for t in out_sets if t["slug"] == f"{OFFICIAL_SLUG_PREFIX}{paper.lower()}-{series}")
            c = census(s)
            exp = EXPECTED_CENSUS[(series, paper)]
            if c != exp:
                raise ExportGateError(f"G-E3 {series}/{paper}: census {c} != expected {exp}")
            n_slices += 1
    grand = dict(sets=len([t for t in out_sets if is_official(t)]), series=len({t["slug"].rsplit("-", 2)[-2] + "-" + t["slug"].rsplit("-", 2)[-1] for t in out_sets if is_official(t)}),
                 q=sum(census(t)[0] for t in out_sets if is_official(t)),
                 p=sum(census(t)[1] for t in out_sets if is_official(t)),
                 m=sum(census(t)[2] for t in out_sets if is_official(t)))
    expect_grand = {"sets": 66, "series": 20, "q": 1281, "p": 2443, "m": 6600}
    if {k: grand[k] for k in expect_grand} != expect_grand:
        raise ExportGateError(f"G-E3 grand census {grand} != {expect_grand}")
    print(f"G-E3 ok: {n_slices} slices match the frozen corpus constants; grand "
          f"{grand['sets']} sets / {grand['series']} series / {grand['q']}q / "
          f"{grand['p']}p / {grand['m']}m (66 x printed 100 = 6600)")
    # ---- G-E2: sum laws ----
    for t in out_sets:
        if not is_official(t):
            continue
        for q in t["questions"]:
            if sum(p["marks"] for p in q["parts"]) != q["totalMarks"]:
                raise ExportGateError(f"G-E2 part-sum violation in {t['slug']} {q['id']}")
            for p in q["parts"]:
                msum = sum(m["marks"] for m in (p.get("markPoints") or []))
                if p.get("markPoints") and msum != p["marks"]:
                    raise ExportGateError(f"G-E2 markPoints sum {msum} != {p['marks']} at {p['id']}")
                if not all(isinstance(c, str) for c in (p.get("specPointCodes") or [])):
                    raise ExportGateError(f"G-E2 spec codes not strings at {p['id']}")
    print("G-E2 ok: part-sum, markPoints sum-law and spec-code shapes hold on all official sets")
    # ---- G-E1: regenerate vs bundle of record ----
    census_rows = {"new": {}, "gone": {}, "changed": {}}
    ident_drift = []
    n_common = 0
    for paper in PAPERS:
        for series in PAPER_SERIES[paper]:
            slug = f"{OFFICIAL_SLUG_PREFIX}{paper.lower()}-{series}"
            rebuilt = export_series(series, paper, topics_src(series, paper), stem_ledger, enrich, synced)
            of_record = by_slug.get(slug)
            if of_record is None:
                if not allow_new_official:
                    raise ExportGateError(
                        f"G-E1: bundle of record lacks {slug} (an append wave must run "
                        f"with --allow-new-official and disclose its census)")
                census_rows["new"][slug] = sorted(p["id"] for q in rebuilt["questions"] for p in q["parts"])
                continue
            n_common += 1
            for f in IDENTITY_FIELDS:
                if json.dumps(rebuilt.get(f), sort_keys=True) != json.dumps(of_record.get(f), sort_keys=True):
                    ident_drift.append(f"{slug}: {f}")
            rp, op = part_map(rebuilt), part_map(of_record)
            new_ids = sorted(set(rp) - set(op))
            gone_ids = sorted(set(op) - set(rp))
            changed = sorted(pid for pid in set(rp) & set(op)
                             if json.dumps(rp[pid], sort_keys=True) != json.dumps(op[pid], sort_keys=True))
            if new_ids:
                census_rows["new"].setdefault(slug, []).extend(new_ids)
            if gone_ids:
                census_rows["gone"].setdefault(slug, []).extend(gone_ids)
            if changed:
                census_rows["changed"].setdefault(slug, []).extend(changed)
    flat = {k: {s: v for s, v in d.items() if v} for k, d in census_rows.items()}
    n_delta = sum(len(v) for d in flat.values() for v in d.values())
    if emit_deltas_path:
        with open(emit_deltas_path, "w") as f:
            json.dump(flat, f, indent=1, sort_keys=True)
            f.write("\n")
        print(f"census emission: wrote {emit_deltas_path} ({n_delta} delta part ids across "
              f"{sum(len(v) for v in flat['new'].values())} new-set slugs)")
    if n_delta == 0:
        print("G-E1 ok: regeneration is a byte-level no-op against the bundle of record")
    else:
        if not expected_deltas_path:
            for k in ("new", "gone", "changed"):
                for slug, ids in flat[k].items():
                    for pid in ids:
                        print(f"  DELTA {k}: {slug} {pid}")
            raise ExportGateError(
                f"G-E1: {n_delta} deltas vs the bundle of record with no --expected-deltas "
                f"census (the reproducibility law)")
        expected = json.load(open(expected_deltas_path))
        if json.dumps(flat, sort_keys=True) != json.dumps(expected, sort_keys=True):
            raise ExportGateError("G-E1: delta census != --expected-deltas (the printed "
                                  "DELTA listing above shows the fresh census; regenerate "
                                  "the disclosure file only after eyeballing every class)")
        print(f"G-E1 ok: {n_delta} delta part ids match the first-run census disclosure "
              f"exactly ({len(flat['new'])} new official sets, 0 gone, 0 changed)")
    if ident_drift:
        for d in ident_drift:
            print(f"  IDENTITY DRIFT {d}")
        raise ExportGateError("G-E1b: set-level identity drift vs the bundle of record")
    print(f"G-E1b ok: set-level identity fields byte-equal on all {n_common} common official sets")
    if synced is not None:
        # ---- G-E7: the R2 synced-field ledger law (in-run corpus==plane proof) ----
        verify_synced_fields(out_sets, raw_official_bytes, synced)
    # ---- G-E6: the printed part label is a first-class field (F119) ----
    # Ported from the main exporter of record's F119 wave: every official
    # part's sourcePaper.questionPart must BE the label its own identity
    # carries (the id slug's path segments re-wrapped); null IFF path-less.
    # Identity is a law, not a wave artifact — fail-closed in BOTH directions.
    label_seg_re = re.compile(r"^[a-z0-9]{1,5}$")
    label_census = {}
    for t in out_sets:
        if not is_official(t):
            continue
        for q in t["questions"]:
            for p in q["parts"]:
                bits = p["id"].split("_")
                if len(bits) != 4 or bits[0] != "offp":
                    raise ExportGateError(
                        f"G-E6: {p['id']} id shape off-grammar (offp_<series>_<paper>_<qn>[-<path>])")
                segs = bits[3].split("-")[1:]
                if segs and not (len(segs) <= 3 and all(label_seg_re.match(s) for s in segs)):
                    raise ExportGateError(
                        f"G-E6: {p['id']} path segments off-grammar: {segs!r}")
                expected = "".join(f"({s})" for s in segs) if segs else None
                actual = (p.get("sourcePaper") or {}).get("questionPart")
                if actual != expected:
                    raise ExportGateError(
                        f"G-E6: {p['id']} questionPart {actual!r} != the id-derived "
                        f"printed label {expected!r}")
                label_census[len(segs)] = label_census.get(len(segs), 0) + 1
    print("G-E6 ok: questionPart == the id-derived printed label on all official "
          f"parts ({label_census.get(1, 0)} one-level, {label_census.get(2, 0)} "
          f"two-level, {label_census.get(3, 0)} three-level, "
          f"{label_census.get(0, 0)} path-less/null)")
    # ---- G-E4: the SME corpus of record is never touched (maths compact law) ----
    sme_sets = [t for t in out_sets if not is_official(t)]
    out_q_bytes = json.dumps(sme_sets, separators=(",", ":"), ensure_ascii=False).encode()
    if out_q_bytes != raw_sme_bytes:
        n = min(len(out_q_bytes), len(raw_sme_bytes))
        for i in range(n):
            if out_q_bytes[i] != raw_sme_bytes[i]:
                raise ExportGateError(
                    f"G-E4: staged questions.json diverges from the SME bundle of "
                    f"record at byte {i}: {raw_sme_bytes[max(0, i - 60):i + 60]!r} vs "
                    f"{out_q_bytes[max(0, i - 60):i + 60]!r}")
        raise ExportGateError(
            f"G-E4: staged questions.json length drift vs the SME bundle of record "
            f"(of record {len(raw_sme_bytes)} bytes vs staged {len(out_q_bytes)} bytes)")
    print(f"G-E4 ok: questions.json byte-identical passthrough ({len(raw_sme_bytes)} bytes, "
          f"{len(sme_sets)} SME sets, single-line compact law)")


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("out_stage")
    ap.add_argument("current_questions")
    ap.add_argument("--current-official-papers", required=True)
    ap.add_argument("--expected-deltas", default=None)
    ap.add_argument("--emit-expected-deltas", default=None,
                    help="first-run census emission: write the fresh G-E1 census to "
                         "this path (the maths-B port's disclosed first-run path)")
    ap.add_argument("--allow-new-official", action="store_true")
    ap.add_argument("--source-cut", default=None,
                    help="main@<40-hex> — the data cut this run consumes (G-E5-proven)")
    ap.add_argument("--synced-fields", default=None,
                    help="R2/G-E7: JSON ledger of corpus==plane-synced part fields "
                         "({series,paper,part,field}) that pass through verbatim")
    args = ap.parse_args()
    synced = load_synced(args.synced_fields)
    if args.source_cut:
        source_cut = parse_source_cut(args.source_cut)
        verify_source_cut(source_cut)

    raw = open(args.current_questions, "rb").read()
    hub = json.loads(raw)
    leaked = [t.get("slug") for t in hub if is_official(t)]
    if leaked:
        raise ExportGateError(
            f"input law: questions.json of record still carries {len(leaked)} official "
            f"set(s) (e.g. {leaked[:3]}) — official sets live in official-papers.json")
    kept = hub
    raw_op = open(args.current_official_papers, "rb").read()
    of_strays = [t.get("slug") for t in json.loads(raw_op) if not is_official(t)]
    if of_strays:
        raise ExportGateError(
            f"input law: official-papers.json of record carries non-official set(s) "
            f"(e.g. {of_strays[:3]}) — it must hold ONLY official sets")
    stem_ledger = {"verdicts": {}}   # D3: no maths-B STEM-RESTORE ledger exists
    enrich = {}                      # D3: no maths-B SOLUTION-ENRICH ledger exists
    official = [export_series(s, paper, topics_src(s, paper), stem_ledger, enrich, synced)
                for paper in PAPERS for s in PAPER_SERIES[paper]]
    out = kept + official

    run_gates(out, raw, raw_op, args.expected_deltas, args.allow_new_official,
              args.emit_expected_deltas, stem_ledger, enrich, synced)

    dest = os.path.join(args.out_stage, "content", COURSE)
    os.makedirs(dest, exist_ok=True)
    with open(os.path.join(dest, "questions.json"), "wb") as f:
        f.write(json.dumps(kept, separators=(",", ":"), ensure_ascii=False).encode())
    with open(os.path.join(dest, "official-papers.json"), "wb") as f:
        f.write(json.dumps(official, separators=(",", ":"), ensure_ascii=False).encode())
    n_sets = len(official)
    n_q = sum(len(t["questions"]) for t in official)
    n_p = sum(len(q["parts"]) for t in official for q in t["questions"])
    n_mp = sum(len(p["markPoints"]) for t in official for q in t["questions"] for p in q["parts"])
    n_fig = sum(1 for t in official for q in t["questions"] for p in q["parts"]
                for a in p["assets"] if a["kind"] == "crop")
    n_stub = sum(1 for t in official for q in t["questions"] for p in q["parts"]
                 for a in p["assets"] if a["kind"] == "crop-required")
    print(f"sets: {len(kept)} SME kept + {n_sets} official | questions: {n_q} | parts: {n_p} "
          f"| markPoints: {n_mp} | figure crops: {n_fig} | honest stubs: {n_stub}")
    print(f"written: {dest}/questions.json + {dest}/official-papers.json")


if __name__ == "__main__":
    main()
