#!/usr/bin/env python3
"""
G-4 mirror r2 — pair builder for the CIE 9609 LEVELS birth (lane
adr040-g4-levels-birth-r2-9609). Builds ONE pair JSON per birthable paper:
  qpCanonical + msCanonical  (T-013 shape, derivedDocumentId P-6 mirror,
                              engines textlayer-{qp,ms}-adr040-g4-r2)
  qpDraft                    (deterministic CIE QP text-layer grammar)
  msDraft                    (STAGED G-3 drafts of record, converted verbatim:
                              F-form ao-pair entries EXCLUDED (ruling 8),
                              NCC 0-mark rows excluded (the DB itself forbids
                              level_index 0 / marks_max 0 — "zero marks is not
                              a band"), multi-axis cells birthed per axis with
                              an axisKey; sub-level printed ordinals rank-mapped
                              1..n, disclosed in levelLabelMap)
  reconciliation             (printed totals: QP cover total vs MS cover
                              "Maximum Mark")
ORACLES (fail-closed, ruling A + ruling 7):
  - every converted band grid binds a QP part with the SAME printed marks
  - per-axis reach (max cell marksMax == axis max) + sum(axis max) == entry marks
  - single-axis ladders: ordinals 1..n contiguous, bottom 0-or-1, top == entry
  - axis count >= 2 with cells => axisKey suffix; exactly 1 => axisKey null
  - QP: consecutive questions, every part marked, cover total == sum
"""
import glob
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

import fitz

STAGED = '/home/z/my-project/repo/.syllabai/lane-artifacts/ADR040-G1-WAVE1-MS/glm-ms-drafts/9609'
PDFS = '/home/z/my-project/tmp/g4r2/pdfs'
OUT = '/home/z/my-project/tmp/g4r2/pairs'
FETCH_REPORT = '/home/z/my-project/tmp/g4r2/fetch_report.json'

QP_ENGINE = 'textlayer-qp-adr040-g4-r2'
MS_ENGINE = 'textlayer-ms-adr040-g4-r2'
ENGINE_VERSION = '1.0.0'
APPLICATION = 'T-SM-ROLLOUT adr040-g4-levels-birth-r2-9609'

RE_QSTART = re.compile(r'^(\d{1,2})\s+(.*)$')
RE_QNUM_ALONE = re.compile(r'^(\d{1,2})\s*$')
RE_PART = re.compile(r'^\(([a-h])\)\s*(.*)$')
RE_ROMAN = re.compile(r'^\(([ivx]+)\)\s*(.*)$')
RE_MARKS_TRAIL = re.compile(r'^(.*?)\s*\[(\d{1,2})\]\s*$')
RE_MARKS_ALONE = re.compile(r'^\[(\d{1,2})\]\s*$')
RE_HEADER = re.compile(r'^9609/\d{2}/[A-Z]/[A-Z]/\d{2}\s*$')
RE_COPY = re.compile(r'^(©|\(c\))\s+(UCLES|Cambridge)', re.I)
RE_DOTS = re.compile(r'^[\s.]*\.{6,}[\s.]*$')
RE_BARCODE = re.compile(r'^\*[\d\s*]+\*$')
RE_PAGEFOOT = re.compile(r'^Page \d+ of \d+\s*$')
RE_SERIES = re.compile(r'(May/June|October/November|February/March|Oct\s*/?\s*Nov|Feb\s*/?\s*March|May\s+June|June|November|March)\s+(20\d\d)')
RE_ANSWER_ONE = re.compile(r'answer one (question|of)', re.I)
RE_COVER_TOTAL = re.compile(r'total mark for this paper is (\d{1,3})')
RE_MAX_MARK = re.compile(r'Maximum Mark:\s*(\d{1,3})')
RE_COMPONENT = re.compile(r'9609\s*/\s*(\d{2})')


class FailClosed(Exception):
    pass


# ── identity (P-6 mirror, proven in r1 against an r0 row of record) ─────────

def derived_document_id(checksum: str, engine: str, engine_version: str) -> str:
    def comp(v):
        return (v or '').strip().lower()
    material = 'sha256:' + comp(checksum) + '|engine:' + comp(engine) + '|version:' + comp(engine_version)
    h = hashlib.sha256(material.encode('utf-8')).digest()
    b = bytearray(h[:16])
    b[6] = (b[6] & 0x0F) | 0x50
    b[8] = (b[8] & 0x3F) | 0x80
    hx = b.hex()
    return f'{hx[0:8]}-{hx[8:12]}-{hx[12:16]}-{hx[16:20]}-{hx[20:]}'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def canonical_doc(pdf_path, uri, engine, now_iso):
    checksum = sha256_file(pdf_path)
    doc_id = derived_document_id(checksum, engine, ENGINE_VERSION)
    pdf = fitz.open(pdf_path)
    text_blocks, pages = [], []
    for i in range(pdf.page_count):
        page = pdf[i]
        text_blocks.append({
            'element_id': f'p{i + 1:03d}', 'element_type': 'TEXT_BLOCK',
            'page_number': i + 1, 'bounding_box': None, 'text': page.get_text('text'),
            'reading_order': i + 1, 'confidence': 1, 'group_key': None,
            'heading_level': None, 'role': None, 'source_engine': engine,
            'source_engine_version': ENGINE_VERSION,
        })
        pages.append({'pageNumber': i + 1, 'width': float(page.rect.width),
                      'height': float(page.rect.height)})
    n = pdf.page_count
    pdf.close()
    return {
        'schemaVersion': '1.0', 'version': 1, 'documentId': doc_id, 'pageCount': n,
        'source': {'uri': uri, 'checksum': checksum, 'checksumAlgorithm': 'SHA-256',
                   'mimeType': 'application/pdf', 'fileName': uri.rsplit('/', 1)[-1]},
        'provenance': {'engine': engine, 'engineVersion': ENGINE_VERSION,
                       'extractedAt': now_iso, 'extractionParams': None,
                       'application': APPLICATION, 'schemaVersion': '1.0'},
        'retrieval': None, 'textBlocks': text_blocks, 'tables': [], 'equations': [],
        'figures': [], 'pages': pages, 'sections': None,
    }


# ── CIE QP text-layer grammar ───────────────────────────────────────────────

def is_furniture(s):
    if s == '' or RE_BARCODE.match(s) or RE_HEADER.match(s) or RE_COPY.match(s):
        return True
    if s == '[Turn over' or RE_PAGEFOOT.match(s) or RE_DOTS.match(s):
        return True
    if re.match(r'^This document has \d+ pages', s) or s == 'PUBLISHED':
        return True
    return False


MARGIN_WORDS = {'DO', 'NOT', 'WRITE', 'IN', 'THIS', 'MARGIN'}


def visual_lines(page):
    """True visual reading order: words bucketed into lines by y, lines by y,
    words left-to-right. get_text('text') block order interleaves CIE marks
    tokens with the following question's content — the visual order is the
    printed order and is the only lawful parse order.
    The vertical 'DO NOT WRITE IN THIS MARGIN' instruction column (some CIE
    templates print it down the page edges) is dropped at word level: its
    fragments sit at x<45 or x>width-45 and would otherwise glue onto stems
    and marks tokens."""
    width = page.rect.width
    words = []
    for w in page.get_text('words'):
        t = w[4].strip()
        if t == '':
            continue
        if (w[0] < 45 or w[0] > width - 45) and (t in MARGIN_WORDS or not re.search(r'[0-9A-Za-z]', t)):
            continue
        words.append(w)
    if not words:
        return []
    words.sort(key=lambda w: (w[1], w[0]))
    lines = []
    cur, cur_y = [], None
    for w in words:
        if cur_y is None or abs(w[1] - cur_y) <= 4:
            cur.append(w)
            cur_y = w[1] if cur_y is None else cur_y
        else:
            lines.append((cur_y, sorted(cur, key=lambda v: v[0])))
            cur, cur_y = [w], w[1]
    if cur:
        lines.append((cur_y, sorted(cur, key=lambda v: v[0])))
    out = []
    for y, ws in lines:
        text = ' '.join(w[4] for w in ws).strip()
        out.append((y, text, ws[0][0]))
    return out


def parse_qp(pdf_path, component):
    """Returns (questions, session, cover_total, warnings)."""
    pdf = fitz.open(pdf_path)
    cover = pdf[0].get_text('text')
    # left-margin question numbers per page (geometry gate): a printed
    # question number sits in the left margin (x0 < 13% width, below the
    # header band); table cells / chart labels / centred headers never do
    margin = 0.13 * pdf[0].rect.width
    qnums = []
    for i in range(pdf.page_count):
        s = set()
        for w in pdf[i].get_text('words'):
            if re.match(r'^\d{1,2}$', w[4]) and w[0] < margin and w[1] > 55:
                s.add(int(w[4]))
        qnums.append(s)
    items = []
    for i in range(1, pdf.page_count):  # page 1 is the printed cover — never carries questions
        for y, text, x0 in visual_lines(pdf[i]):
            st = text
            if is_furniture(st):
                continue
            if y < 55:  # running header band (page number / paper code)
                continue
            if y > 790:  # footer band (© line / corrupted-footer glyphs)
                continue
            items.append((i + 1, st, qnums[i]))
    pdf.close()
    answer_one = bool(RE_ANSWER_ONE.search(cover)) or any(
        RE_ANSWER_ONE.search(it[1]) for it in items[:12])

    mser = RE_SERIES.search(cover)
    if not mser:
        raise FailClosed('QP cover carries no printed series')
    session = f'{mser.group(1)} {mser.group(2)}'
    mcomp = RE_COMPONENT.search(cover)
    if not mcomp or mcomp.group(1) != component:
        raise FailClosed(f'QP cover component {mcomp and mcomp.group(1)} != expected {component}')
    mtotal = RE_COVER_TOTAL.search(cover)
    cover_total = int(mtotal.group(1)) if mtotal else None

    warnings = []
    questions = []
    cur_q = None      # {number, stem_lines, parts, total}
    cur_part = None   # {label, text_lines, marks}
    cur_letter = None
    pending_group_text = None
    deferred_shared = []
    expected = 1

    def finalize_part():
        nonlocal cur_part, pending_group_text
        if cur_part is not None and cur_q is not None:
            if cur_letter is not None and cur_part['label'] == cur_letter and cur_part['marks'] is None:
                # printed grouping row ("(a) ... Calculate the:") whose marks
                # live on its roman sub-parts — absorbed, never a core part;
                # if no sub-part consumes it this is a parse error (checked at
                # finalize_question), never a silent drop
                pending_group_text = '\n'.join(cur_part['text_lines']).strip('\n')
            else:
                cur_q['parts'].append({'label': cur_part['label'],
                                       'text': '\n'.join(cur_part['text_lines']).strip('\n'),
                                       'marks': cur_part['marks']})
        cur_part = None

    def finalize_question():
        nonlocal cur_q, expected, pending_group_text, deferred_shared
        finalize_part()
        if pending_group_text is not None:
            raise FailClosed(
                f'grouping part text never consumed by a roman sub-part: {pending_group_text[:60]!r}')
        if cur_q is not None:
            if cur_q['total'] is None and cur_q['parts'] and all(p['marks'] is not None for p in cur_q['parts']):
                cur_q['total'] = sum(p['marks'] for p in cur_q['parts'])
            if (cur_q['total'] is None and not cur_q['parts'] and answer_one
                    and any(q['number'] == cur_q['number'] for q in questions) is False):
                pass
            if cur_q['total'] is None and not cur_q['parts'] and answer_one:
                # printed shared choice answer space (P3 Section B): both
                # choice stems precede ONE dotted area closed by a single
                # marks token — defer; the shared token resolves them below
                deferred_shared.append(cur_q)
            questions.append(cur_q)
        cur_q = None

    def q_open_unfinished():
        if cur_q is None:
            return False
        if not cur_q['parts'] and cur_q['total'] is None:
            return True
        return any(p['marks'] is None for p in cur_q['parts'])

    for page_no, raw, page_qnums in items:
        line = raw.strip()
        if line == '':
            continue
        # part-start branches run FIRST (in visual order a part line may end
        # with its own marks token — the marks branches must not eat it)
        m = RE_PART.match(line)
        if m and cur_q is not None:
            finalize_part()
            if pending_group_text is not None:
                raise FailClosed(
                    f'p{page_no}: grouping part text never consumed by a roman sub-part: {pending_group_text[:60]!r}')
            cur_letter = m.group(1)
            cur_part = {'label': cur_letter, 'text_lines': [], 'marks': None}
            tail = (m.group(2) or '').strip()
            if tail:
                rr = RE_ROMAN.match(tail)
                if rr:
                    cur_part['label'] = f'{cur_letter}-{rr.group(1)}'
                    tail2 = (rr.group(2) or '').strip()
                    if tail2:
                        tail = tail2
                    else:
                        tail = ''
                mt = RE_MARKS_TRAIL.match(tail) if tail else None
                if mt and mt.group(2):
                    cur_part['marks'] = int(mt.group(2))
                    tail = (mt.group(1) or '').rstrip()
                if tail:
                    cur_part['text_lines'].append(tail)
            continue
        m = RE_ROMAN.match(line)
        if m and cur_q is not None and cur_letter is not None:
            finalize_part()
            cur_part = {'label': f'{cur_letter}-{m.group(1)}', 'text_lines': [], 'marks': None}
            if pending_group_text is not None:
                cur_part['text_lines'].append(pending_group_text)
                pending_group_text = None
            tail = (m.group(2) or '').strip()
            if tail:
                mt = RE_MARKS_TRAIL.match(tail)
                if mt and mt.group(2):
                    cur_part['marks'] = int(mt.group(2))
                    tail = (mt.group(1) or '').rstrip()
                if tail:
                    cur_part['text_lines'].append(tail)
            continue
        # question starts — number must equal the expected consecutive AND
        # be printed in the left margin of this page (geometry gate)
        qstart = None
        m = RE_QSTART.match(line)
        if m and int(m.group(1)) == expected and expected in page_qnums:
            qstart = (int(m.group(1)), (m.group(2) or '').strip())
        else:
            m = RE_QNUM_ALONE.match(line)
            if m and int(m.group(1)) == expected and expected in page_qnums:
                qstart = (int(m.group(1)), '')
        if qstart is not None:
            qn, rest = qstart
            shared_space = (answer_one and cur_q is not None and not cur_q['parts']
                            and cur_q['total'] is None and cur_part is None)
            if (q_open_unfinished() or (cur_part is not None and cur_part['marks'] is None)) and not shared_space:
                raise FailClosed(
                    f'p{page_no}: question {qn} starts before the previous question fully marked (parser drift)')
            finalize_question()
            cur_q = {'number': qn, 'stem_lines': [], 'parts': [], 'total': None}
            cur_letter = None
            if rest:
                rm = RE_PART.match(rest)
                if rm:
                    cur_letter = rm.group(1)
                    cur_part = {'label': cur_letter, 'text_lines': [], 'marks': None}
                    tail = (rm.group(2) or '').strip()
                    if tail:
                        rr = RE_ROMAN.match(tail)
                        if rr:
                            cur_part['label'] = f'{cur_letter}-{rr.group(1)}'
                            tail2 = (rr.group(2) or '').strip()
                            if tail2:
                                tail = tail2
                            else:
                                tail = ''
                        mt = RE_MARKS_TRAIL.match(tail) if tail else None
                        if mt and mt.group(2):
                            cur_part['marks'] = int(mt.group(2))
                            tail = (mt.group(1) or '').rstrip()
                        if tail:
                            cur_part['text_lines'].append(tail)
                else:
                    mt = RE_MARKS_TRAIL.match(rest)
                    if mt and mt.group(2):
                        cur_q['total'] = int(mt.group(2))
                        rest = (mt.group(1) or '').rstrip()
                    if rest:
                        cur_q['stem_lines'].append(rest)
            expected += 1
            continue
        # standalone marks token
        m = RE_MARKS_ALONE.match(line)
        if m:
            marks = int(m.group(1))
            if cur_part is not None:
                if cur_part['marks'] is not None:
                    raise FailClosed(f'p{page_no}: part {cur_part["label"]} already marked, extra [{marks}]')
                cur_part['marks'] = marks
            elif cur_q is not None:
                if cur_q['total'] is not None:
                    raise FailClosed(f'p{page_no}: question {cur_q["number"]} already has a total, extra [{marks}]')
                cur_q['total'] = marks
            else:
                warnings.append(f'p{page_no}: stray marks token [{marks}] before any question — dropped')
            continue
        # trailing marks on a content line
        m = RE_MARKS_TRAIL.match(line)
        if m and m.group(2) and not RE_PART.match(m.group(1) or ''):
            marks = int(m.group(2))
            body = (m.group(1) or '').rstrip()
            if cur_part is not None:
                if body:
                    cur_part['text_lines'].append(body)
                if cur_part['marks'] is None:
                    cur_part['marks'] = marks
                else:
                    warnings.append(f'p{page_no}: part {cur_part["label"]} already marked; trailing [{marks}] kept as content')
                    cur_part['text_lines'].append(f'[{marks}]')
                continue
            if cur_q is not None and not cur_q['parts']:
                if body:
                    cur_q['stem_lines'].append(body)
                if cur_q['total'] is None:
                    cur_q['total'] = marks
                continue
            # fall through as content

        # content
        if cur_part is not None:
            cur_part['text_lines'].append(raw)
        elif cur_q is not None:
            cur_q['stem_lines'].append(raw)
        # else: front/inter matter — ignored

    finalize_question()

    # shared choice answer space: the single printed marks token resolves ALL
    # deferred choice stems (disclosed, never silent)
    if deferred_shared:
        resolved = next((q['total'] for q in reversed(questions)
                         if not q['parts'] and q['total'] is not None), None)
        if resolved is None:
            raise FailClosed('shared choice answer space carried no marks token')
        for q in deferred_shared:
            if q['total'] is None:
                q['total'] = resolved
                warnings.append(f'shared choice answer space: printed [{resolved}] token applies to choice '
                                f'question {q["number"]} (one dotted area, one token, stems {q["number"]}+)')
    # structural checks
    nums = [q['number'] for q in questions]
    if nums != list(range(1, len(nums) + 1)):
        raise FailClosed(f'questions parsed = {nums} (expected consecutive 1..N)')
    unmarked = [(q['number'], p['label']) for q in questions for p in q['parts'] if p['marks'] is None]
    if unmarked:
        raise FailClosed(f'parts without printed marks: {unmarked}')
    if questions and questions[-1]['total'] is None:
        raise FailClosed(f'last question {questions[-1]["number"]} has no marks token')
    partless_unmarked = [q['number'] for q in questions if not q['parts'] and q['total'] is None]
    if partless_unmarked:
        raise FailClosed(f'partless questions without printed marks: {partless_unmarked}')
    paper_total = sum(p['marks'] for q in questions for p in q['parts']) + \
        sum(q['total'] for q in questions if not q['parts'])
    if cover_total is not None and paper_total != cover_total:
        if answer_one:
            warnings.append(
                f'choice section printed ("answer one question"): parsed question marks sum {paper_total} '
                f'vs cover total {cover_total} — the cover total counts ONE choice question; both preserved')
        elif os.environ.get('G4R2_DEBUG_SUM'):
            warnings.append(f'DEBUG: sum of parsed marks {paper_total} != cover total {cover_total} (sum check suppressed)')
        else:
            raise FailClosed(f'sum of parsed marks {paper_total} != cover total {cover_total}')
    # duplicate part labels within a question
    for q in questions:
        labels = [p['label'] for p in q['parts']]
        if len(labels) != len(set(labels)):
            dups = sorted({l for l in labels if labels.count(l) > 1})
            warnings.append(f'Q{q["number"]}: duplicate part labels {dups} (birth relabels .2/.3; binding uses first)')
    warnings.append(f'paper marks: parsed sum {paper_total}; cover total {cover_total if cover_total else "not printed"}')
    return questions, session, cover_total, warnings


# ── markPointRef / normalizePart (byte-exact ports of glm-ocr.ts) ───────────

LETTER_THEN_ROMAN = re.compile(r'^([a-h])([ivx]+)$')


def normalize_part(part):
    if part is None or part.strip() == '':
        return 'x'
    m = LETTER_THEN_ROMAN.match(part)
    if m:
        return f'{m.group(1)}-{m.group(2)}'
    return part


def mark_point_ref(label, number):
    printed = label if label is not None else str(number)
    no_star = printed[1:] if printed.startswith('*') else printed
    paren = no_star.find('(')
    num = str(number)
    if paren < 0:
        return num if no_star.strip() == '' else no_star
    part = no_star[paren:].replace('(', '').replace(')', '')
    return f'{num}-{normalize_part(part)}'


# ── staged → converted entries (verbatim, ruled exclusions) ────────────────

def convert_entry(e, ledger):
    """Returns (converted_entry | None if F-form). Fail-closed on shape."""
    grammar = e.get('bandGrammar')
    marks = e.get('marks')
    label = e.get('label')
    if grammar == 'C-AO-matrix' and marks == 3:
        ledger['f_form_excluded'].append(label)
        return None
    conv = {
        'entryId': None, 'label': label, 'number': e.get('number'),
        'qwc': bool(e.get('qwc')), 'mcq': False, 'correctOption': None,
        'answerText': None, 'markPoints': [], 'guidance': [],
        'marks': marks, 'marksCellSource': e.get('marksCellSource'),
        'bandGrammar': grammar, 'confidence': e.get('confidence', 0.9),
        'levelLabelMap': {}, 'nccRowsExcluded': 0,
    }
    if 'bands' in e and e.get('bands'):
        # flat single-axis shape (D-prose / E-unlabeled) — printed ordinals kept
        bands = sorted(e['bands'], key=lambda b: b['marksMin'])
        if [b['level'] for b in bands] != list(range(1, len(bands) + 1)):
            raise FailClosed(f'{label}: flat band ordinals {[b["level"] for b in bands]} != 1..n')
        if bands[0]['marksMin'] not in (0, 1):
            raise FailClosed(f'{label}: bottom marksMin {bands[0]["marksMin"]} not 0-or-1')
        if bands[-1]['marksMax'] != marks:
            raise FailClosed(f'{label}: top marksMax {bands[-1]["marksMax"]} != entry marks {marks}')
        for b in bands:
            if not b.get('descriptor'):
                raise FailClosed(f'{label}: level {b["level"]} descriptor blank')
        conv['bands'] = [{'level': b['level'], 'marksMin': b['marksMin'],
                          'marksMax': b['marksMax'], 'descriptor': b['descriptor'],
                          'guidance': b.get('guidance'), 'axis': None} for b in bands]
        return conv
    axes = e.get('axes') or []
    rows = e.get('bandRows') or []
    ncc = [br for br in rows if br.get('isNCC')]
    live = [br for br in rows if not br.get('isNCC')]
    conv['nccRowsExcluded'] = len(ncc)
    ledger['ncc_rows_excluded'] += len(ncc)
    for br in ncc:
        ledger.setdefault('ncc_labels', {}).setdefault(str(br.get('levelLabel')), 0)
        ledger['ncc_labels'][str(br.get('levelLabel'))] += 1
    per_axis = []
    for i, ax in enumerate(axes):
        cells = []
        for br in live:
            for sr in br.get('subRows', []):
                if i < len(sr) and sr[i] is not None and sr[i].get('descriptor'):
                    cells.append(sr[i])
        cells.sort(key=lambda c: (c['marksMin'], c['marksMax']))
        per_axis.append((ax, cells))
    live_axes = [(ax, cells) for ax, cells in per_axis if cells]
    # axis-sum oracle (ruling 7)
    axis_sum = sum(ax['max'] for ax, _ in per_axis)
    if axis_sum != marks:
        raise FailClosed(f'{label}: sum(axis max) {axis_sum} != entry marks {marks}')
    multi = len(live_axes) >= 2
    out_bands = []
    for ai, (ax, cells) in enumerate(live_axes):
        if max(c['marksMax'] for c in cells) != ax['max']:
            raise FailClosed(f'{label}: axis {ai} reach {max(c["marksMax"] for c in cells)} != axis max {ax["max"]}')
        for k, c in enumerate(cells, start=1):
            if c['marksMin'] is None or c['marksMax'] is None or not c['descriptor']:
                raise FailClosed(f'{label}: axis {ai} cell incomplete: {c}')
            out_bands.append({'level': k, 'marksMin': c['marksMin'], 'marksMax': c['marksMax'],
                              'descriptor': c['descriptor'], 'guidance': None,
                              'axis': f'a{ai + 1}' if multi else None})
        conv['levelLabelMap'][f'a{ai + 1}'] = {'axisName': ax['name'], 'axisMax': ax['max'],
                                               'coreOrdinals': list(range(1, len(cells) + 1))}
    if not out_bands:
        raise FailClosed(f'{label}: no band cells after NCC exclusion')
    # single-axis (axisKey null) schemes are the R4-legal class: full coverage
    # law pre-check. Axis-suffixed (multi-real-axis) schemes are verbatim-cell
    # ladders (sub-levels may repeat a range by printed design — e.g. 2b/2a
    # both K=4): the governing oracles are per-axis reach + axis-sum (ruled),
    # NOT the single-axis tiling chain.
    if not multi:
        ladder = sorted(out_bands, key=lambda b: b['level'])
        for prev, nxt in zip(ladder, ladder[1:]):
            if prev['marksMax'] + 1 != nxt['marksMin']:
                raise FailClosed(f'{label}: ladder not contiguous: '
                                 f'{prev["marksMin"]}-{prev["marksMax"]} then {nxt["marksMin"]}-{nxt["marksMax"]}')
        if ladder[0]['marksMin'] not in (0, 1):
            raise FailClosed(f'{label}: bottom marksMin {ladder[0]["marksMin"]} not 0-or-1')
        if ladder[-1]['marksMax'] != marks:
            raise FailClosed(f'{label}: top marksMax {ladder[-1]["marksMax"]} != entry marks {marks}')
    conv['bands'] = out_bands
    return conv


# ── main ────────────────────────────────────────────────────────────────────

def main():
    now_iso = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    proof = derived_document_id(
        'f59c113cdb75458dc9a5f8a4021a62597591b8c7b29caf223489faabb261bf5e',
        'textlayer-qp-adr040-g4-r0', '1.0.0')
    assert proof == '052aa749-461a-55fd-ba99-89de1302a9b8', f'derivation proof failed: {proof}'
    print(f'documentId derivation proof vs r0 of record: {proof} OK')

    fetch = json.load(open(FETCH_REPORT))
    identity = {p['key']: p['qp_text_identity'] for p in fetch['papers']}
    os.makedirs(OUT, exist_ok=True)
    summary = {'papers': [], 'excluded_remapped_qp': [], 'excluded_no_entries': [],
               'ledger': {'f_form_excluded_total': 0, 'ncc_rows_excluded': 0,
                          'f_form_by_paper': {}, 'ncc_rows_by_paper': {}}}
    ok = 0
    for d in sorted(glob.glob(f'{STAGED}/*/*/ms.draft.json')):
        session_dir, code = d.split('/')[-3], d.split('/')[-2]
        key = f'{session_dir}/{code}'
        staged = json.load(open(d))
        entries = staged.get('entries', [])
        repo_path = staged['paper']['repo_path']
        if not entries:
            summary['excluded_no_entries'].append(key)
            continue
        if not identity.get(key, False):
            summary['excluded_remapped_qp'].append(key)
            continue
        component = code.rsplit('QP-', 1)[-1]
        base = f'{PDFS}/{session_dir}/{code}'
        ledger = {'f_form_excluded': [], 'ncc_rows_excluded': 0, 'ncc_labels': {}}
        try:
            qp_can = canonical_doc(f'{base}/qp.pdf',
                                   f'SyllabAI/syllabai-pastpapers@main:{repo_path}/qp.pdf',
                                   QP_ENGINE, now_iso)
            ms_can = canonical_doc(f'{base}/ms.pdf',
                                   f'SyllabAI/syllabai-pastpapers@main:{repo_path}/ms.pdf',
                                   MS_ENGINE, now_iso)
            questions, qp_session, cover_total, qp_warnings = parse_qp(f'{base}/qp.pdf', component)
            ms_pdf = fitz.open(f'{base}/ms.pdf')
            ms_cover = ms_pdf[0].get_text('text')
            ms_pdf.close()
            mmax = RE_MAX_MARK.search(ms_cover)
            if not mmax:
                raise FailClosed('MS cover carries no "Maximum Mark:"')
            ms_total = int(mmax.group(1))
            ms_series = RE_SERIES.search(ms_cover)
            if qp_session.replace('/', ' ') != (ms_series.group(0).replace('/', ' ') if ms_series else ''):
                raise FailClosed(f'QP session {qp_session} vs MS cover series {ms_series and ms_series.group(0)}')
            total_discrepancy = cover_total is not None and cover_total != ms_total

            converted, oracle_lines = [], []
            for e in entries:
                c = convert_entry(e, ledger)
                if c is None:
                    continue
                converted.append(c)

            # ruling-A binding oracle: grid ↔ QP part, same printed marks
            q_by_num = {q['number']: q for q in questions}
            for c in converted:
                ref = mark_point_ref(c['label'], c['number'])
                c['_ref'] = ref
                qn = int(ref.split('-')[0])
                part_ref = ref.split('-', 1)[1] if '-' in ref else None
                q = q_by_num.get(qn)
                if q is None:
                    raise FailClosed(f'grid {c["label"]} (ref {ref}): no QP question {qn}')
                part = next((p for p in q['parts'] if p['label'] == part_ref), None)
                if part is None:
                    raise FailClosed(f'grid {c["label"]} (ref {ref}): no QP part "{part_ref}" '
                                     f'(parts: {[p["label"] for p in q["parts"]]})')
                if part['marks'] != c['marks']:
                    raise FailClosed(f'grid {c["label"]} marks {c["marks"]} != QP part marks {part["marks"]} (tiling law)')
                n_bands = len(c['bands'])
                n_axes = len({b['axis'] for b in c['bands'] if b['axis']}) or 1
                oracle_lines.append(f'{c["label"]} ref={ref}: QP {part["marks"]} == grid {c["marks"]} '
                                    f'({n_bands} bands / {n_axes} axis scheme(s)) OK')

            qp_draft = {
                'schemaVersion': 'glm-ocr-qp-v1+adr040-g4-r2-lane',
                'extractionMethod': f'{QP_ENGINE} (deterministic PyMuPDF text-layer parse; lane {APPLICATION})',
                'reviewRequired': True,
                'paper': {'board': 'Cambridge International', 'qualification': None, 'subject': None,
                          'paperReference': f'9609/{component}', 'logNumber': None, 'publicationCode': None,
                          'session': qp_session, 'examDate': None, 'duration': None,
                          'canonicalDocumentId': qp_can['documentId']},
                'questions': [{
                    # external_ref lands in questions.external_ref varchar(80):
                    # the staged dir code is the paper identity of record and
                    # fits (the r1 repo_path form exceeds 80 on CIE paths)
                    'questionId': f'{code}#q{q["number"]}', 'number': q['number'],
                    'numberingStyle': None, 'section': None,
                    'stem': '\n'.join(q['stem_lines']).strip('\n'), 'mcq': False, 'options': [],
                    'parts': [{'partId': None, 'label': p['label'], 'text': p['text'],
                               'marks': p['marks'], 'qwc': False, 'figures': [],
                               'answerPrompts': [], 'confidence': 0.85} for p in q['parts']],
                    'figures': [], 'tableElementIds': [], 'marks': q['total'], 'marksKnown': True,
                    'qwc': False, 'answerPrompts': [], 'confidence': 0.85,
                } for q in questions],
                'questionTotals': {str(q['number']): q['total'] for q in questions},
                'paperTotal': cover_total if cover_total is not None else sum(
                    p['marks'] for q in questions for p in q['parts']),
                'sectionTotals': {}, 'frontMatterFigures': [], 'warnings': qp_warnings,
            }
            staged_notes = staged.get('parseNotes') or []
            if isinstance(staged_notes, str):
                staged_notes = [staged_notes] if staged_notes else []
            ms_warnings = list(staged_notes) + [w for w in staged.get('warnings') or []]
            f_n = len(ledger['f_form_excluded'])
            if f_n:
                ms_warnings.append(f'r2 mirror: {f_n} level-less F ao-pair grid(s) excluded from LEVELS birth '
                                   f'(ruling 8; mark-allocation form, no printed level ordinals) — labels {ledger["f_form_excluded"]}')
            if ledger['ncc_rows_excluded']:
                ms_warnings.append(f'r2 mirror: {ledger["ncc_rows_excluded"]} NCC 0-mark row(s) excluded from birth '
                                   f'(zero marks is not a band — ADR-040 §2.1; printed text preserved in the drafts of record)')
            ms_draft = {
                'schemaVersion': 'glm-ocr-ms-v1+adr040-g1-tranche+adr040-g4-r2',
                'extractionMethod': staged.get('extractionMethod'),
                'reviewRequired': bool(staged.get('reviewRequired', True)),
                'paper': {'board': 'Cambridge International', 'qualification': None, 'subject': None,
                          'paperReference': f'9609/{component}', 'logNumber': None, 'publicationCode': None,
                          'session': qp_session, 'examDate': None, 'duration': None,
                          'canonicalDocumentId': ms_can['documentId']},
                'entries': converted,
                'questionTotals': {}, 'paperTotal': ms_total, 'icTable': None, 'figureRefs': None,
                'warnings': ms_warnings,
            }
            paper_total = qp_draft['paperTotal']
            recon = {'findings': [], 'qpPaperTotal': paper_total, 'msPaperTotal': ms_total,
                     'paperTotalConflict': paper_total != ms_total or bool(total_discrepancy),
                     'mismatchCount': 0}
            if total_discrepancy:
                # printed-document discrepancy of record (e.g. W21-31 MS cover
                # misprint 60, W23 P3 MS covers carrying the stale 100): both
                # printed values preserved, never merged — the shipped
                # reconciliation semantics mark the pair REVIEW_REQUIRED
                recon['findings'].append({
                    'source': 'RECONCILIATION', 'severity': 'paper-total-conflict',
                    'questionNumber': None, 'qpMarks': cover_total, 'msMarks': ms_total,
                    'detail': f'QP cover total {cover_total} vs MS cover Maximum Mark {ms_total} — '
                              f'printed-document discrepancy of record; both preserved, never merged '
                              f'(the QP cover total governs the paper identity; grid binding is per-part and unaffected)'})
                ms_warnings.append(f'printed total discrepancy: QP cover {cover_total} vs MS cover Maximum Mark {ms_total} '
                                   f'(disclosed; the QP cover governs)')
            pair = {
                'qpCanonical': qp_can, 'msCanonical': ms_can, 'qpDraft': qp_draft,
                'msDraft': ms_draft, 'reconciliation': recon,
                'meta': {'key': key, 'repo_path': repo_path, 'paper_reference': f'9609/{component}',
                         'session': qp_session, 'session_source': 'qp cover printed series',
                         'qp_sha256': qp_can['source']['checksum'], 'ms_sha256': ms_can['source']['checksum'],
                         'oracle': oracle_lines, 'staged_of_record': d,
                         'reviewRequired': bool(staged.get('reviewRequired', True)),
                         'ledger': {'f_form_excluded': ledger['f_form_excluded'],
                                    'ncc_rows_excluded': ledger['ncc_rows_excluded']}},
            }
            out = f'{OUT}/pair-{session_dir}-{code}.json'
            with open(out, 'w') as f:
                json.dump(pair, f, ensure_ascii=False, indent=1)
            ok += 1
            summary['papers'].append({'key': key, 'pair': out, 'entries_staged': len(entries),
                                      'entries_birthed': len(converted),
                                      'f_form_excluded': len(ledger['f_form_excluded']),
                                      'ncc_excluded': ledger['ncc_rows_excluded'],
                                      'reviewRequired': bool(staged.get('reviewRequired', True))})
            summary['ledger']['f_form_by_paper'][key] = len(ledger['f_form_excluded'])
            summary['ledger']['ncc_rows_by_paper'][key] = ledger['ncc_rows_excluded']
            print(f'{ok:3d} {key}: Q {len(questions)} parts {sum(len(q["parts"]) for q in questions)} '
                  f'schemes {len(converted)} fform-{len(ledger["f_form_excluded"])} '
                  f'ncc-{ledger["ncc_rows_excluded"]} total={paper_total}')
        except FailClosed as ex:
            print(f'FAIL-CLOSED {key}: {ex}')
            summary.setdefault('fail_closed', []).append({'key': key, 'reason': str(ex)})
    summary['ledger']['f_form_excluded_total'] = sum(summary['ledger']['f_form_by_paper'].values())
    summary['ledger']['ncc_rows_excluded'] = sum(summary['ledger']['ncc_rows_by_paper'].values())
    with open('/home/z/my-project/tmp/g4r2/build_summary.json', 'w') as f:
        json.dump(summary, f, indent=1, ensure_ascii=False)
    print('\npairs:', ok)
    print('excluded remapped-QP:', len(summary['excluded_remapped_qp']), summary['excluded_remapped_qp'])
    print('excluded no-entries:', len(summary['excluded_no_entries']))
    print('fail-closed:', summary.get('fail_closed') or 'none')
    print('F-form excluded total:', summary['ledger']['f_form_excluded_total'],
          '| NCC rows excluded:', summary['ledger']['ncc_rows_excluded'])


if __name__ == '__main__':
    main()
