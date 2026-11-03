#!/usr/bin/env python3
"""
G-4 LEVELS birth r1 — pair builder for the 2 papers r0 left unbirthed:
  4BS1-01 2021-06, 4BS1-02R 2026-06 (staged wave-1 of record, fingerprint-verified absent in prod).

Mirrors the r0 lane conventions evidenced of record in prod
(documents.source_engine textlayer-{qp,ms}-adr040-g4-r0; bridge drafts):
  - canonical docs: ONE TEXT_BLOCK per page (PyMuPDF text layer), real page dims,
    documentId = derivedDocumentId(checksum, engine, engineVersion) (P-6 mirror),
    source.uri = SyllabAI/syllabai-pastpapers@main:<path>, checksum = SHA-256 of the pdf bytes
  - QP draft: textlayer-qp-adr040-g4-r1 text-layer parse (questions/parts/marks/stems/totals)
  - MS draft: the STAGED G-1 tranche draft of record (entries verbatim), paper meta remapped
  - ORACLE (fail-closed): every staged band grid must match a QP part with the SAME marks
    (ruling-A tiling law), QP totals must tile to the printed 80.
Outputs one pair JSON per paper under tmp/g4r1/.
"""
import hashlib
import json
import re
import sys
import uuid
from datetime import datetime, timezone

import fitz

STAGED_ROOT = '/home/z/my-project/repo/.syllabai/lane-artifacts/ADR040-G1-WAVE1-MS/glm-ms-drafts'
OUT_DIR = '/home/z/my-project/tmp/g4r1'

PAPERS = [
    {
        'key': '4BS1-01-2021-06',
        'qp_pdf': f'{OUT_DIR}/4bs1_past-papers_2021-06_4BS1-01_qp.pdf',
        'ms_pdf': f'{OUT_DIR}/4bs1_past-papers_2021-06_4BS1-01_ms.pdf',
        'staged': f'{STAGED_ROOT}/4bs1/2021-06/4BS1-01/ms.draft.json',
        'qp_uri': 'SyllabAI/syllabai-pastpapers@main:past-papers/pearson-edexcel/international-gcse/business/4bs1/past-papers/2021-06/4BS1-01/qp.pdf',
        'ms_uri': 'SyllabAI/syllabai-pastpapers@main:past-papers/pearson-edexcel/international-gcse/business/4bs1/past-papers/2021-06/4BS1-01/ms.pdf',
        'repo_path': '4bs1/past-papers/2021-06/4BS1-01',
        'paper_reference': '4BS1/01',
        'manifest_printed': '(not printed on cover; session from source catalog "MayJune 2021")',
    },
    {
        'key': '4BS1-02R-2026-06',
        'qp_pdf': f'{OUT_DIR}/4bs1_past-papers_2026-06_4BS1-02R_qp.pdf',
        'ms_pdf': f'{OUT_DIR}/4bs1_past-papers_2026-06_4BS1-02R_ms.pdf',
        'staged': f'{STAGED_ROOT}/4bs1/2026-06/4BS1-02R/ms.draft.json',
        'qp_uri': 'SyllabAI/syllabai-pastpapers@main:past-papers/pearson-edexcel/international-gcse/business/4bs1/past-papers/2026-06/4BS1-02R/qp.pdf',
        'ms_uri': 'SyllabAI/syllabai-pastpapers@main:past-papers/pearson-edexcel/international-gcse/business/4bs1/past-papers/2026-06/4BS1-02R/ms.pdf',
        'repo_path': '4bs1/past-papers/2026-06/4BS1-02R',
        'paper_reference': '4BS1/02R',
        'manifest_printed': None,
    },
]

QP_ENGINE = 'textlayer-qp-adr040-g4-r1'
MS_ENGINE = 'textlayer-ms-adr040-g4-r1'
ENGINE_VERSION = '1.0.0'
APPLICATION = 'T-SM-ROLLOUT adr040-g4-levels-birth-r1'


def derived_document_id(checksum: str, engine: str, engine_version: str) -> str:
    """Byte-exact port of the P-6 mirror (content-writes.ts derivedDocumentId)."""
    def comp(v):
        return (v or '').strip().lower()
    material = 'sha256:' + comp(checksum) + '|engine:' + comp(engine) + '|version:' + comp(engine_version)
    h = hashlib.sha256(material.encode('utf-8')).digest()
    b = bytearray(h[:16])
    b[6] = (b[6] & 0x0F) | 0x50
    b[8] = (b[8] & 0x3F) | 0x80
    hx = b.hex()
    return f'{hx[0:8]}-{hx[8:12]}-{hx[12:16]}-{hx[16:20]}-{hx[20:]}'


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def canonical_doc(pdf_path: str, uri: str, engine: str, now_iso: str) -> dict:
    checksum = sha256_file(pdf_path)
    doc_id = derived_document_id(checksum, engine, ENGINE_VERSION)
    pdf = fitz.open(pdf_path)
    text_blocks = []
    pages = []
    for i in range(pdf.page_count):
        page = pdf[i]
        text = page.get_text('text')
        text_blocks.append({
            'element_id': f'p{i + 1:03d}',
            'element_type': 'TEXT_BLOCK',
            'page_number': i + 1,
            'bounding_box': None,
            'text': text,
            'reading_order': i + 1,
            'confidence': 1,
            'group_key': None,
            'heading_level': None,
            'role': None,
            'source_engine': engine,
            'source_engine_version': ENGINE_VERSION,
        })
        pages.append({'pageNumber': i + 1, 'width': float(page.rect.width), 'height': float(page.rect.height)})
    n = pdf.page_count
    pdf.close()
    return {
        'schemaVersion': '1.0',
        'version': 1,
        'documentId': doc_id,
        'pageCount': n,
        'source': {
            'uri': uri,
            'checksum': checksum,
            'checksumAlgorithm': 'SHA-256',
            'mimeType': 'application/pdf',
            'fileName': uri.rsplit('/', 1)[-1],
        },
        'provenance': {
            'engine': engine,
            'engineVersion': ENGINE_VERSION,
            'extractedAt': now_iso,
            'extractionParams': None,
            'application': APPLICATION,
            'schemaVersion': '1.0',
        },
        'retrieval': None,
        'textBlocks': text_blocks,
        'tables': [],
        'equations': [],
        'figures': [],
        'pages': pages,
        'sections': None,
    }


# ── QP text-layer grammar (r0-convention mirror) ────────────────────────────

RE_CODE = re.compile(r'^\*P\d+[A-Z]\d+\*\s*$')
RE_QSTART = re.compile(r'^(\d{1,2})\t\s*(.*)$')
RE_LETTER = re.compile(r'^\(([a-h])\)\s*(?:\t(.*))?$')
RE_ROMAN = re.compile(r'^\(([ivx]+)\)\s*(?:\t(.*))?$')
RE_MARK = re.compile(r'^\((\d{1,2})\)\s*$')
RE_OPTION = re.compile(r'^([A-D])\t\s*(.*)$')
RE_TOTAL = re.compile(r'^\(Total for Question (\d{1,2})\s*(?:=|is)\s*(\d{1,3})\s*marks\)\s*$')
RE_DAYDATE = re.compile(r'(January|February|March|April|May|June|July|October|November|December)\s+(\d{4})')
RE_MS_SERIES = re.compile(r'(Summer|January|November)\s+(\d{4})')
RE_DOTS = re.compile(r'^\.{6,}\s*%?\s*$')


class Flushed:
    """One flat (page, line) stream with page furniture removed."""
    def __init__(self, pdf_path):
        pdf = fitz.open(pdf_path)
        self.items = []  # (page_no, line)
        self.page_count = pdf.page_count
        for i in range(pdf.page_count):
            lines = pdf[i].get_text('text').split('\n')
            printed_pageno = None
            # the printed page number sits among the first 3 non-furniture lines
            for j, ln in enumerate(lines[:4]):
                s = ln.strip()
                if re.match(r'^\d{1,3}$', s):
                    printed_pageno = s
                    break
            for j, ln in enumerate(lines):
                s = ln.rstrip()
                st = s.strip()
                if RE_CODE.match(st):
                    continue
                if st == 'Turn over' or st == 'Turn over':
                    continue
                if printed_pageno is not None and j <= 3 and st == printed_pageno:
                    continue
                self.items.append((i + 1, s))
        pdf.close()


def parse_qp(flush: Flushed, paper: dict, ms_pdf_path: str):
    warnings = []
    questions = []
    question_totals = {}
    cur_q = None          # dict: number, stem_lines, parts, marks
    cur_part = None       # dict: label, text_lines, marks
    cur_letter = None     # current letter-part base label ('a', 'b', ...)
    seen_q_numbers = []

    def finalize_part():
        nonlocal cur_part
        if cur_part is not None and cur_q is not None:
            text = '\n'.join(cur_part['text_lines']).strip('\n')
            cur_q['parts'].append({'label': cur_part['label'], 'text': text, 'marks': cur_part['marks']})
        cur_part = None

    def finalize_question():
        nonlocal cur_q
        finalize_part()
        if cur_q is not None:
            questions.append(cur_q)
        cur_q = None

    for page_no, raw in flush.items:
        line = raw.strip()
        if line == '':
            continue
        m = RE_TOTAL.match(line)
        if m:
            qn, total = int(m.group(1)), int(m.group(2))
            if cur_q is None or cur_q['number'] != qn:
                raise SystemExit(f'FAIL-CLOSED: total line for Q{qn} but current question is {cur_q and cur_q["number"]}')
            if cur_q['total'] is not None:
                raise SystemExit(f'FAIL-CLOSED: duplicate total line for Q{qn}')
            cur_q['total'] = total
            question_totals[str(qn)] = total
            finalize_question()
            continue
        m = RE_QSTART.match(line)
        if m and cur_part is not None and cur_part['marks'] is None:
            # a question-start while the previous part still lacks its mark = parser drift
            raise SystemExit(f'FAIL-CLOSED: question {m.group(1)} starts before part {cur_part["label"]} has its printed mark (p{page_no})')
        if m:
            qn = int(m.group(1))
            expected = (questions[-1]['number'] + 1) if questions else 1
            if qn != expected:
                # a bare "N<TAB>" line inside content (figure tables) — keep as content + warn
                warnings.append(f"p{page_no}: bare number line '{line[:20]}' inside Q{cur_q['number'] if cur_q else '?'} kept as content")
                if cur_part is not None:
                    cur_part['text_lines'].append(raw)
                elif cur_q is not None:
                    cur_q['stem_lines'].append(raw)
                continue
            finalize_question()
            seen_q_numbers.append(qn)
            cur_q = {'number': qn, 'stem_lines': [], 'parts': [], 'total': None}
            cur_letter = None
            rest = m.group(2) or ''
            # inline part chain on the question line: "(a) ...", "(a) (i) ..."
            handled = False
            if cur_q is not None:
                rm = re.match(r'^\(([a-h])\)\s*(?:\t(.*))?$', rest.strip())
                if rm:
                    cur_letter = rm.group(1)
                    cur_part = {'label': rm.group(1), 'text_lines': [], 'marks': None}
                    tail = (rm.group(2) or '').strip()
                    if tail:
                        rr = re.match(r'^\(([ivx]+)\)\s*(?:\t(.*))?$', tail)
                        if rr:
                            cur_part['label'] = f"{rm.group(1)}-{rr.group(1)}"
                            tail2 = (rr.group(2) or '').strip()
                            if tail2:
                                cur_part['text_lines'].append(tail2)
                        else:
                            cur_part['text_lines'].append(tail)
                    handled = True
            if not handled and rest:
                cur_q['stem_lines'].append(rest)
            continue
        m = RE_LETTER.match(line)
        if m and cur_q is not None:
            finalize_part()
            cur_letter = m.group(1)
            cur_part = {'label': m.group(1), 'text_lines': [], 'marks': None}
            tail = (m.group(2) or '').strip()
            if tail:
                rr = re.match(r'^\(([ivx]+)\)\s*(?:\t(.*))?$', tail)
                if rr:
                    cur_part['label'] = f'{m.group(1)}-{rr.group(1)}'
                    tail2 = (rr.group(2) or '').strip()
                    if tail2:
                        cur_part['text_lines'].append(tail2)
                else:
                    cur_part['text_lines'].append(tail)
            continue
        m = RE_ROMAN.match(line)
        if m and cur_q is not None and cur_letter is not None:
            # roman sub-part of the current letter part
            finalize_part()
            cur_part = {'label': f'{cur_letter}-{m.group(1)}', 'text_lines': [], 'marks': None}
            tail = (m.group(2) or '').strip()
            if tail:
                cur_part['text_lines'].append(tail)
            continue
        m = RE_MARK.match(line)
        if m and cur_part is not None:
            if cur_part['marks'] is None:
                cur_part['marks'] = int(m.group(1))
            else:
                warnings.append(f"p{page_no}: extra mark line '({m.group(1)})' after part {cur_part['label']} already marked ({cur_part['marks']}) — kept as content")
                cur_part['text_lines'].append(f"({m.group(1)})")
            continue
        m = RE_OPTION.match(line)
        if m and cur_part is not None and cur_part['marks'] is not None:
            # post-mark MCQ option — attach to the part text (r0 convention)
            cur_part['text_lines'].append(f'{m.group(1)} {m.group(2)}')
            continue
        if cur_part is not None:
            cur_part['text_lines'].append(raw)
        elif cur_q is not None:
            cur_q['stem_lines'].append(raw)
        else:
            # front matter before Q1 — ignore silently (cover/instructions/formulae)
            pass

    finalize_question()

    # ── fail-closed structural checks ──
    if [q['number'] for q in questions] != [1, 2, 3, 4]:
        raise SystemExit(f'FAIL-CLOSED: questions parsed = {[q["number"] for q in questions]} (expected 1..4)')
    for q in questions:
        if q['total'] is None:
            raise SystemExit(f'FAIL-CLOSED: Q{q["number"]} has no printed total line')
        unmarked = [p['label'] for p in q['parts'] if p['marks'] is None]
        if unmarked:
            raise SystemExit(f'FAIL-CLOSED: Q{q["number"]} parts without printed marks: {unmarked}')
        s = sum(p['marks'] for p in q['parts'])
        if s != q['total']:
            raise SystemExit(f'FAIL-CLOSED: Q{q["number"]} part marks {s} != printed total {q["total"]}')
    paper_total = sum(question_totals.values())
    cover = fitz.open(paper['qp_pdf'])[0].get_text('text')
    mcover = re.search(r'total mark for this paper is (\d{1,3})', cover)
    if mcover and int(mcover.group(1)) != paper_total:
        raise SystemExit(f'FAIL-CLOSED: cover total {mcover.group(1)} != summed totals {paper_total}')

    # ── session law ──
    mdate = RE_DAYDATE.search(cover)
    manifest_printed = paper['manifest_printed']
    if mdate:
        session = f'{mdate.group(1)} {mdate.group(2)}'
        session_source = 'qp cover printed date'
    else:
        ms_cover = fitz.open(ms_pdf_path)[0].get_text('text')
        mss = RE_MS_SERIES.search(ms_cover)
        if not mss:
            raise SystemExit('FAIL-CLOSED: no printed session on QP cover and no printed series on MS cover')
        session = f'{mss.group(1)} {mss.group(2)}'
        session_source = 'ms cover printed series'
        warnings.append(
            f'QP cover carries no printed session; session label from MS cover printed series "{session}" '
            f'(manifest series catalog_fallback for {manifest_printed or "this sitting"})')

    # ── build draft ──
    qp_doc_id = paper['_qp_doc_id']
    draft_questions = []
    for q in questions:
        stem = '\n'.join(q['stem_lines']).strip('\n')
        parts = []
        for p in q['parts']:
            parts.append({
                'partId': None,
                'label': p['label'],
                'text': p['text'],
                'marks': p['marks'],
                'qwc': False,
                'figures': [],
                'answerPrompts': [],
                'confidence': 0.85,
            })
        draft_questions.append({
            'questionId': f"{paper['repo_path']}#q{q['number']}",
            'number': q['number'],
            'numberingStyle': None,
            'section': None,
            'stem': stem,
            'mcq': False,
            'options': [],
            'parts': parts,
            'figures': [],
            'tableElementIds': [],
            'marks': q['total'],
            'marksKnown': True,
            'qwc': False,
            'answerPrompts': [],
            'confidence': 0.85,
        })

    draft = {
        'schemaVersion': 'glm-ocr-qp-v1+adr040-g4-lane',
        'extractionMethod': f'{QP_ENGINE} (deterministic PyMuPDF text-layer parse; lane adr040-g4-levels-birth-r1)',
        'reviewRequired': True,
        'paper': {
            'board': 'Pearson Edexcel',
            'qualification': None,
            'subject': None,
            'paperReference': paper['paper_reference'],
            'logNumber': None,
            'publicationCode': None,
            'session': session,
            'examDate': None,
            'duration': None,
            'canonicalDocumentId': qp_doc_id,
        },
        'questions': draft_questions,
        'questionTotals': question_totals,
        'paperTotal': paper_total,
        'sectionTotals': {},
        'frontMatterFigures': [],
        'warnings': warnings,
    }
    return draft, session, session_source


def build_ms_draft(paper: dict, ms_doc_id: str, session: str):
    staged = json.load(open(paper['staged']))
    return {
        'schemaVersion': 'glm-ocr-ms-v1+adr040-g1-tranche',
        'extractionMethod': staged.get('extractionMethod'),
        'reviewRequired': bool(staged.get('reviewRequired', True)),
        'paper': {
            'board': 'Pearson Edexcel',
            'qualification': None,
            'subject': None,
            'paperReference': paper['paper_reference'],
            'logNumber': None,
            'publicationCode': None,
            'session': session,
            'examDate': None,
            'duration': None,
            'canonicalDocumentId': ms_doc_id,
        },
        'entries': staged['entries'],
        'questionTotals': staged.get('questionTotals') or {},
        'paperTotal': staged.get('paperTotal'),
        'icTable': staged.get('icTable'),
        'figureRefs': staged.get('figureRefs'),
        'warnings': list(staged.get('warnings') or []),
    }


def oracle(qp_draft, ms_draft, paper_key):
    """Fail-closed: every staged grid binds a QP part with the SAME printed marks."""
    grids = []
    for e in ms_draft['entries']:
        if e.get('bands'):
            grids.append(e)
    if not grids:
        raise SystemExit(f'FAIL-CLOSED [{paper_key}]: staged draft carries no band grids')
    report = []
    for g in grids:
        m = re.match(r'^(\d+)\(([a-z]+)\)$', g['label'])
        if not m:
            raise SystemExit(f'FAIL-CLOSED [{paper_key}]: unparseable grid ref {g["label"]}')
        qn, plabel = int(m.group(1)), m.group(2)
        q = next((q for q in qp_draft['questions'] if q['number'] == qn), None)
        if q is None:
            raise SystemExit(f'FAIL-CLOSED [{paper_key}]: grid {g["label"]} has no QP question {qn}')
        p = next((p for p in q['parts'] if p['label'] == plabel), None)
        if p is None:
            raise SystemExit(f'FAIL-CLOSED [{paper_key}]: grid {g["label"]} has no QP part "{plabel}" (parts: {[x["label"] for x in q["parts"]]})')
        if p['marks'] != g['marks']:
            raise SystemExit(f'FAIL-CLOSED [{paper_key}]: grid {g["label"]} top {g["marks"]} != QP part marks {p["marks"]} (tiling law)')
        # band ordinals + contiguity sanity (mirrors bandCoverageViolations core)
        bands = sorted(g['bands'], key=lambda b: b['level'])
        if [b['level'] for b in bands] != list(range(1, len(bands) + 1)):
            raise SystemExit(f'FAIL-CLOSED [{paper_key}]: grid {g["label"]} band ordinals not 1..n')
        for b in bands:
            if b['marksMin'] is None or b['marksMax'] is None or b['descriptor'] in (None, ''):
                raise SystemExit(f'FAIL-CLOSED [{paper_key}]: grid {g["label"]} level {b["level"]} incomplete')
        if bands[0]['marksMin'] not in (0, 1):
            raise SystemExit(f'FAIL-CLOSED [{paper_key}]: grid {g["label"]} bottom marksMin {bands[0]["marksMin"]} not 0-or-1')
        if bands[-1]['marksMax'] != g['marks']:
            raise SystemExit(f'FAIL-CLOSED [{paper_key}]: grid {g["label"]} top band max {bands[-1]["marksMax"]} != entry marks {g["marks"]}')
        report.append(f'{g["label"]}: QP {p["marks"]} == grid top {g["marks"]} ({len(bands)} bands) OK')
    return report


def main():
    now_iso = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    # identity-proof of the documentId derivation against a REAL r0 row of record
    proof = derived_document_id(
        'f59c113cdb75458dc9a5f8a4021a62597591b8c7b29caf223489faabb261bf5e',
        'textlayer-qp-adr040-g4-r0', '1.0.0')
    assert proof == '052aa749-461a-55fd-ba99-89de1302a9b8', f'derivation proof failed: {proof}'
    print(f'documentId derivation proof vs r0 of record: {proof} OK')

    for paper in PAPERS:
        print(f'\n════ {paper["key"]} ════')
        qp_can = canonical_doc(paper['qp_pdf'], paper['qp_uri'], QP_ENGINE, now_iso)
        ms_can = canonical_doc(paper['ms_pdf'], paper['ms_uri'], MS_ENGINE, now_iso)
        paper['_qp_doc_id'] = qp_can['documentId']
        flush = Flushed(paper['qp_pdf'])
        qp_draft, session, session_source = parse_qp(flush, paper, paper['ms_pdf'])
        qp_draft['paper']['canonicalDocumentId'] = qp_can['documentId']
        ms_draft = build_ms_draft(paper, ms_can['documentId'], session)
        report = oracle(qp_draft, ms_draft, paper['key'])

        reconciliation = {
            'findings': [],
            'qpPaperTotal': qp_draft['paperTotal'],
            'msPaperTotal': ms_draft['paperTotal'],
            'paperTotalConflict': False,
            'mismatchCount': 0,
        }
        pair = {
            'qpCanonical': qp_can,
            'msCanonical': ms_can,
            'qpDraft': qp_draft,
            'msDraft': ms_draft,
            'reconciliation': reconciliation,
            'meta': {
                'key': paper['key'],
                'repo_path': paper['repo_path'],
                'paper_reference': paper['paper_reference'],
                'session': session,
                'session_source': session_source,
                'qp_uri': paper['qp_uri'],
                'ms_uri': paper['ms_uri'],
                'qp_sha256': qp_can['source']['checksum'],
                'ms_sha256': ms_can['source']['checksum'],
                'oracle': report,
                'ms_staged_of_record': paper['staged'],
            },
        }
        out = f"{OUT_DIR}/pair-{paper['key']}.json"
        with open(out, 'w') as f:
            json.dump(pair, f, ensure_ascii=False, indent=1)
        print(f'session: {session!r} ({session_source})')
        print(f'qp docId: {qp_can["documentId"]}  ms docId: {ms_can["documentId"]}')
        print(f'questions: {[(q["number"], q["marks"], [(p["label"], p["marks"]) for p in q["parts"]]) for q in qp_draft["questions"]]}')
        print(f'paperTotal: {qp_draft["paperTotal"]}  warnings: {qp_draft["warnings"]}')
        print('ORACLE:')
        for r in report:
            print('  ✓', r)
        print(f'pair written: {out}')


if __name__ == '__main__':
    main()
