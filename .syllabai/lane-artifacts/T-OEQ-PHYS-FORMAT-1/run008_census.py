#!/usr/bin/env python3
"""run-008 pre-registration census — GFM-accurate pipe-table classification
over the full igcse-physics-19 corpus (questions.json SME bank + official-papers.json
+ run-007 served gmd values). Read-only. Deterministic. Single unified pass.

A 'run' = maximal consecutive lines that carry table pipes (strict |...| rows or
loose rows with internal pipes outside $...$ math). Under remark-gfm a run renders
as a table iff it contains a delimiter row; otherwise it renders as literal text.

Classes:
  TABLE_OK         - delimiter row present, >=2 cols, consistent -> renders fine
  1COL_DEGENERATE  - delimiter row present but exactly 1 column (word-bank stacking)
  CORRUPT_HEADER   - header row dash-like, or a second delimiter-shaped row (double delim)
  TABLE_MISMATCH   - delimiter present, >=2 cols, row cell-counts disagree
  FLATTENED        - pipe-bearing rows, NO delimiter row -> literal text with pipes visible
  MATH_PIPE        - a $...$ math segment contains a raw pipe (expected 0)
"""
import json, re, hashlib
from collections import Counter, defaultdict

V2 = '/tmp/v2repo/apps/hub/content/igcse-physics-19'
LANE = 'T-OEQ-PHYS-FORMAT-1'

STRICT_ROW = re.compile(r'^\s*\|.*\|\s*$')
MATH_SEG = re.compile(r'\$[^$]*\$')

def strip_math(line):
    return MATH_SEG.sub('', line)

def is_pipey(line):
    if STRICT_ROW.match(line):
        return True
    return '|' in strip_math(line) and line.strip() != ''

def row_cells(line):
    """cells of a pipey line, math-segments preserved as atoms"""
    s = line.strip()
    # protect math segments from their internal pipes
    def repl(m):
        return m.group(0).replace('|', '\x00')
    s = MATH_SEG.sub(repl, s)
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    return [c.strip().replace('\x00', '|') for c in s.split('|')]

def is_delim_row(line):
    for c in row_cells(line):
        if re.search(r'[a-zA-Z0-9]', c):
            return False
        if not re.fullmatch(r':?-+:?', c):
            return False
    return True

def is_dashlike_row(line):
    return all(re.fullmatch(r':?-+:?', c) for c in row_cells(line))

def classify_run(rows):
    """-> (class, meta) for a run of pipey lines"""
    delim_idx = [i for i, r in enumerate(rows) if is_delim_row(r)]
    if not delim_idx:
        return 'FLATTENED', {'rows': len(rows),
                             'lines': [r.strip()[:70] for r in rows[:5]]}
    di = delim_idx[0]
    extra_delims = [i for i in delim_idx[1:]]
    cols = len(row_cells(rows[di]))
    header = rows[di - 1] if di > 0 else None
    if (header is not None and is_dashlike_row(header)) or extra_delims or di == 0:
        return 'CORRUPT_HEADER', {'cols': cols, 'rows': len(rows),
                                  'delimAt': delim_idx,
                                  'header': (header or rows[0]).strip()[:90]}
    # dash-run corruption: header cell carries a scrape rule-artifact dash run
    # (outside math: >=4; inside math segments too: >=8 consecutive dashes raw)
    if header is not None and (re.search(r'-{4,}', strip_math(header)) or re.search(r'-{8,}', header)):
        return 'CORRUPT_HEADER', {'cols': cols, 'rows': len(rows),
                                  'delimAt': delim_idx, 'header': header.strip()[:90]}
    if cols == 1:
        return '1COL_DEGENERATE', {'cols': 1, 'rows': len(rows),
                                   'n_items': len(rows) - 2, 'first': rows[0].strip()[:90]}
    bad = [i for i, r in enumerate(rows) if i != di and len(row_cells(r)) != cols]
    if bad:
        return 'TABLE_MISMATCH', {'cols': cols, 'rows': len(rows), 'bad_rows': len(bad),
                                  'first': rows[0].strip()[:90]}
    return 'TABLE_OK', {'cols': cols, 'rows': len(rows), 'first': rows[0].strip()[:90]}

def math_pipe_conflicts(md):
    return [m.group(0)[:80] for m in MATH_SEG.finditer(md) if '|' in m.group(0)]

def scan_md(v):
    """unified pass over one md string -> (ok_blocks, defect_blocks, mathpipe)"""
    lines = v.split('\n')
    ok, defects, mp = [], [], math_pipe_conflicts(v)
    i = 0
    while i < len(lines):
        if is_pipey(lines[i]):
            j = i
            while j < len(lines) and is_pipey(lines[j]):
                j += 1
            rows = lines[i:j]
            cls, meta = classify_run(rows)
            if cls == 'TABLE_OK':
                ok.append(meta)
            else:
                defects.append({'class': cls, **meta})
            i = j
        else:
            i += 1
    return ok, defects, mp

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()

def scan_file(path, label):
    data = json.load(open(path))
    recs = []
    for si, s in enumerate(data):
        sslug = s.get('slug') or f'[{si}]'
        for q in s.get('questions', []):
            for p in q.get('parts', []):
                pid = p.get('id', '')
                fields = [('problemMd', p.get('problemMd')), ('solutionMd', p.get('solutionMd'))]
                for ch in p.get('choices') or []:
                    fields.append((f'choices[{ch.get("label")}]', ch.get('textMd')))
                fields.append(('group_stem_md', p.get('group_stem_md')))
                ok_total, defect_list, mp_all = [], [], []
                for fkey, v in fields:
                    if not v:
                        continue
                    ok, defs, mp = scan_md(v)
                    ok_total += [{'field': fkey, **m} for m in ok]
                    defect_list += [{'field': fkey, **d} for d in defs]
                    mp_all += [{'field': fkey, 'seg': x} for x in mp]
                if ok_total or defect_list or mp_all:
                    recs.append({
                        'repo': label, 'setIndex': si, 'set': sslug,
                        'questionId': q.get('id', ''), 'partId': pid,
                        'ok_blocks': ok_total, 'defects': defect_list, 'mathPipe': mp_all,
                    })
    return data, recs

def main():
    qpath = f'{V2}/questions.json'
    opath = f'{V2}/official-papers.json'
    gpath = '/tmp/v2repo/.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1/run007-payload.json'

    qdata, qrecs = scan_file(qpath, 'questions.json')
    odata, orecs = scan_file(opath, 'official-papers.json')

    # run-007 served group-intro gmd values: table/math-pipe content must be zero
    gmd_recs = []
    try:
        g = json.load(open(gpath))
        items = g.get('items') or g.get('gmds') or []
        for i, it in enumerate(items):
            gmd = it.get('gmd') if isinstance(it, dict) else None
            if not gmd:
                continue
            ok, defs, mp = scan_md(gmd)
            for d in defs:
                gmd_recs.append({'item': i, 'class': d['class'], 'first': str(d.get('first', d.get('lines', '')))[:80]})
            for x in mp:
                gmd_recs.append({'item': i, 'class': 'MATH_PIPE', 'first': x})
    except Exception as e:
        gmd_recs = [{'error': str(e)}]

    # ---- rollups ----
    def part_defects(r):
        return [d for d in r['defects']]

    q_clean_ok_blocks = q_clean_ok_parts = 0
    q_ok_blocks_total = q_ok_parts_total = 0
    q_aff = []
    by_class = Counter()
    flat_rows = 0
    per_set = defaultdict(lambda: Counter())
    for r in qrecs:
        ds = part_defects(r)
        n_ok = len(r['ok_blocks'])
        if n_ok:
            q_ok_blocks_total += n_ok
            q_ok_parts_total += 1
        if not ds and not r['mathPipe']:
            if n_ok:
                q_clean_ok_blocks += n_ok
                q_clean_ok_parts += 1
        else:
            q_aff.append(r)
            cls_here = Counter(d['class'] for d in ds)
            by_class.update(cls_here)
            flat_rows += sum(d['rows'] for d in ds if d['class'] == 'FLATTENED')
            for c, n in cls_here.items():
                per_set[r['set']][c] += n
            per_set[r['set']]['affected_parts'] += 1
            if r['mathPipe']:
                per_set[r['set']]['mathPipe'] += len(r['mathPipe'])

    o_aff = [r for r in orecs if r['defects'] or r['mathPipe']]
    o_ok = sum(len(r['ok_blocks']) for r in orecs)

    out = {
        'lane': LANE, 'run': 'run-008-table-format',
        'generated': 'sandbox re-derivation (fresh sparse checkout @ origin/main tip, GFM-accurate unified classifier)',
        'files': {
            'questions.json': {'sha256': sha256(qpath), 'sets': len(qdata),
                               'parts': sum(len(q.get('parts', [])) for s in qdata for q in s['questions'])},
            'official-papers.json': {'sha256': sha256(opath), 'sets': len(odata),
                                     'parts': sum(len(q.get('parts', [])) for s in odata for q in s['questions'])},
        },
        'sme_bank': {
            'total_parts': sum(len(q.get('parts', [])) for s in qdata for q in s['questions']),
            'affected_parts': len(q_aff),
            'ok_blocks_total': q_ok_blocks_total, 'ok_parts_total': q_ok_parts_total,
            'ok_blocks_in_clean_parts': q_clean_ok_blocks, 'clean_ok_parts': q_clean_ok_parts,
            'class_blocks': dict(by_class),
            'flattened_rows_total': flat_rows,
            'mathPipe_parts': len([r for r in qrecs if r['mathPipe']]),
            'per_set': {k: dict(v) for k, v in sorted(per_set.items())},
        },
        'official': {
            'affected_parts': len(o_aff),
            'ok_blocks': o_ok,
            'records': [{k: r[k] for k in ('set', 'partId', 'defects', 'mathPipe')} for r in o_aff],
        },
        'run007_gmd_scan': {'scanned_nonempty': True, 'table_or_mathpipe_hits': len(gmd_recs), 'detail': gmd_recs[:5]},
    }
    with open('/home/z/my-project/scripts/run008_census_result.json', 'w') as f:
        json.dump({'rollup': out, 'sme_records': qrecs, 'official_records': orecs}, f, indent=1, ensure_ascii=False)
    print(json.dumps(out, indent=1, ensure_ascii=False))

if __name__ == '__main__':
    main()
