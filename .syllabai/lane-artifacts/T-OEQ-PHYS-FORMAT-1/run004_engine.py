#!/usr/bin/env python3
"""run-004 adjudication engine v3 - page-evidence verdicts from glyph-span layout data.

LAW (pre-registered, NO-GUESS):
- Page text rebuilt from PyMuPDF glyph spans (Symbol-font PUA decoded), whitespace
  stripped, char->span index. A corpus line's suspect clusters are measured with ALL
  class patterns (the pattern only SELECTS what to measure - the GLYPH GEOMETRY
  decides): every cluster's spans are judged against the cluster's own first glyph
  group; SUP (ratio<=0.85, raised dy<=-0.7) / SUB (ratio<=0.85, lowered dy>=+0.7) /
  FLAT (ratio>=0.90, |dy|<=1.5) / AMB.
- Matching: full normalized line first; if absent, shrinking context windows around
  each cluster (±12, ±6, bare cluster) - handles QP column scatter and MS table
  scatter. Multi-hit law: ALL printed instances must agree, else AMBIGUOUS.
- Restoration proposal = exactly the chars the page renders raised/lowered, through
  run-002's SUP/SUB maps, at RAW corpus-line positions. Chars outside maps -> AMB.
- NOT-FOUND after all fallbacks -> stays residual (disclosed, never guessed).
"""
import json, re, sys, os, collections

sys.path.insert(0, '/tmp/v2repo/.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1')
from phys_s1_restore import SUP, SUB

EV = '/tmp/run004_evidence'
TH = {'sup_ratio': 0.85, 'sup_dy': -0.4, 'sub_dy': 0.4, 'flat_ratio': 0.90, 'flat_dy': 1.5,
      'grp_size': 0.35, 'grp_oy': 0.75}

PUA_MAP = {'\uf0b4': '×', '\uf070': 'π', '\uf044': 'Δ', '\uf0b0': '°', '\uf0a2': '•', '\uf0b7': '•'}
# existing run-002 restorations normalize to their plain chars for page matching
# (the page glyph layer carries plain digits); proposals at those positions are
# filtered as no-ops (old == new) at apply time.
FLAT_MAP = str.maketrans({'\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3',
                          '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7',
                          '\u2078': '8', '\u2079': '9', '\u207b': '-',
                          '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3',
                          '\u2084': '4', '\u2085': '5', '\u2086': '6', '\u2087': '7',
                          '\u2088': '8', '\u2089': '9'})

def norm(s):
    s = s.replace('\u2212', '-').replace('\u2013', '-').replace('\u2019', "'")
    s = s.replace('\u2018', "'").replace('\u00a0', '').replace('\u200b', '')
    s = s.replace('\ufb01', 'fi').replace('\ufb02', 'fl')
    s = ''.join(PUA_MAP.get(c, '') if 0xE000 <= ord(c) <= 0xF8FF else c for c in s)
    return re.sub(r'\s+', '', s.translate(FLAT_MAP))

def norm_index(s):
    n, idx = [], []
    for i, c in enumerate(s):
        nc = norm(c)
        for _ in nc:
            idx.append(i)
        n.append(nc)
    out = ''.join(n)
    assert len(out) == len(idx)
    return out, idx


def norm_keep(s):
    """char-normalize but KEEP single spaces (collapse runs) - for cluster
    selection with run-001's adjacency semantics."""
    s = s.replace('\u2212', '-').replace('\u2013', '-').replace('\u2019', "'")
    s = s.replace('\u2018', "'").replace('\u00a0', ' ').replace('\u200b', '')
    s = s.replace('\ufb01', 'fi').replace('\ufb02', 'fl')
    s = ''.join(PUA_MAP.get(c, '') if 0xE000 <= ord(c) <= 0xF8FF else c for c in s)
    return re.sub(r'\s+', ' ', s.translate(FLAT_MAP))

def keep2strip_map(keep):
    """index map: position in space-collapsed text -> position in fully-stripped
    text (-1 at spaces)"""
    out, idx = [], []
    for c in keep:
        if c == ' ':
            idx.append(-1)
        else:
            idx.append(len(out))
            out.append(c)
    return ''.join(out), idx

SUSPECT = {
    'S1-x10':      re.compile(r'[×÷] ?10[0-9]+'),
    'S1-negexp':   re.compile(r'10 ?- ?[0-9]+'),
    'S1-decimal':  re.compile(r'[0-9]\.[0-9]{2,}[2-9](?![0-9])'),
    'S1-leadzero': re.compile(r'(?<![0-9.])0[0-9](?![0-9.])'),  # on keep-text
    'S1-parensup': re.compile(r'\)[0-9]'),  # adjacency: no space (raw law)
    'S1-funcinv':  re.compile(r'[a-z]{2,}-[0-9]'),
    'S1-subsup':   re.compile(r'[A-Za-z][0-9]+'),
    'S1-digitclus': re.compile(r'[0-9]{3,}'),
    'S1-pair':     re.compile(r'[0-9]{2,}'),   # 652/26 segment-interior pass only
}
ALL_CLASSES = [c for c in SUSPECT if c != 'S1-pair']

class PDF:
    def __init__(self, path):
        d = json.load(open(path))
        self.pages = d['pages']
        self.path = path

def verdict_span(span, base):
    ratio = span['size'] / base['size'] if base['size'] else 1
    dy = span['oy'] - base['oy']
    if ratio <= TH['sup_ratio']:
        # clearly smaller glyph: raised = superscript, lowered = subscript;
        # at-baseline = Pearson's size-marked subscript (gas-law p1/V1 style)
        if dy <= TH['sup_dy']:
            return 'SUP'
        return 'SUB'
    if ratio >= TH['flat_ratio'] and abs(dy) <= TH['flat_dy']:
        return 'FLAT'
    return 'AMB'

def check_region(pdf, pno, start, end):
    pg = pdf.pages[pno]
    cmap = pg['cmap']
    idxs = sorted({cmap[i] for i in range(start, end) if 0 <= i < len(cmap)})
    if not idxs:
        return []
    if len(idxs) == 1:
        si = idxs[0]
        a = start
        while a > 0 and cmap[a - 1] == si:
            a -= 1
        b = end
        while b < len(cmap) and cmap[b] == si:
            b += 1
        if a < start or b > end:
            return [(si, 'BASE', pg['spans'][si]['t'])]
        k = start - 1
        if k >= 0:
            bsp = pg['spans'][cmap[k]]
            if abs(bsp['oy'] - pg['spans'][si]['oy']) <= 12:
                return [(si, verdict_span(pg['spans'][si], bsp), pg['spans'][si]['t'])]
        return [(si, 'BASE', pg['spans'][si]['t'])]
    first = pg['spans'][idxs[0]]
    out = []
    for si in idxs:
        sp = pg['spans'][si]
        if abs(sp['size'] - first['size']) <= TH['grp_size'] and \
           abs(sp['oy'] - first['oy']) <= TH['grp_oy']:
            out.append((si, 'BASE', sp['t']))
        else:
            out.append((si, verdict_span(sp, first), sp['t']))
    return out

def locate(pdf, needle):
    hits = []
    for pno, pg in enumerate(pdf.pages):
        start = 0
        while True:
            i = pg['ntext'].find(needle, start)
            if i < 0:
                break
            hits.append((pno, i))
            start = i + 1
    return hits

def measure(pdf, pno, pcs, pclen, ncs, nline, cls, detail):
    """measure one cluster instance; returns (props {lpos:(new,cls,v)}, flats {lpos}, status)"""
    cmap = pdf.pages[pno]['cmap']
    ntext = pdf.pages[pno]['ntext']
    regs = check_region(pdf, pno, pcs, pcs + pclen)
    pr, fl, status = {}, set(), 'OK'
    for si, v, stext in regs:
        detail.append(f'p{pno} {cls} span={stext!r} -> {v}')
        for i in range(pcs, pcs + pclen):
            if cmap[i] != si:
                continue
            lpos = ncs + (i - pcs)
            if lpos < 0 or lpos >= len(nline):
                continue
            if v in ('SUP', 'SUB'):
                mp = SUP if v == 'SUP' else SUB
                ch = ntext[i]
                if ch not in mp:
                    status = 'AMBIG-map'
                    continue
                pr[lpos] = (mp[ch], cls, v)
            elif v in ('FLAT', 'BASE'):
                fl.add(lpos)
    return pr, fl, status

def adjudicate_line(pdf, raw_line, classes=None, zero_lhs=False):
    nline, n2raw = norm_index(raw_line)
    if not nline:
        return {'verdict': 'EMPTY'}
    keep = norm_keep(raw_line)
    sline, k2s = keep2strip_map(keep)
    assert sline == nline, 'keep/strip layer mismatch'
    classes = classes or ALL_CLASSES
    clusters, seen = [], set()
    for cls in classes:
        for m in SUSPECT[cls].finditer(keep):
            a, b = k2s[m.start()], k2s[m.end() - 1]
            if a < 0 or b < 0:
                continue
            ms, me = a, b + 1
            if (ms, me) in seen:
                continue
            seen.add((ms, me))
            clusters.append((cls, ms, me))
    detail = []
    props = {}
    amb_clusters, contradicted, ok_clusters = [], 0, 0

    def run_cluster(cls, ms, me, instances):
        """instances = list of (pno, pcs); returns merged props or None"""
        nonlocal contradicted, ok_clusters
        local_pr, local_fl, conflict = {}, set(), False
        for pno, pcs in instances:
            pr, fl, st = measure(pdf, pno, pcs, me - ms, ms, nline, cls, detail)
            if st == 'AMBIG-map':
                conflict = True
            for lp, v in pr.items():
                prev = local_pr.get(lp)
                if prev and prev[0] != v[0]:
                    conflict = True
                local_pr[lp] = v
            local_fl |= fl
        if conflict:
            amb_clusters.append((cls, ms, me, 'instance disagreement'))
            return None
        bad = set(local_pr) & local_fl
        if bad:
            contradicted += 1
            amb_clusters.append((cls, ms, me, f'raised-vs-flat across instances at {sorted(bad)[:4]}'))
            return None
        return local_pr

    full_hits = locate(pdf, nline)
    if full_hits:
        for cls, ms, me in clusters:
            inst = [(pno, pos + ms) for pno, pos in full_hits]
            pr = run_cluster(cls, ms, me, inst)
            if pr:
                props.update(pr)
                ok_clusters += 1
    else:
        for cls, ms, me in clusters:
            done = False
            cands = []
            for w in (12, 6):
                ws, we = max(0, ms - w), min(len(nline), me + w)
                cands.append((ws, we))
            for we2 in (me, me - 1, ms + 2):
                w2 = min(we2, len(nline))
                if w2 > ms + 1 and (ms, w2) not in cands:
                    cands.append((ms, w2))
            for ws, we in cands:
                win = nline[ws:we]
                if len(win) < 2:
                    continue
                hits = locate(pdf, win)
                if not hits:
                    continue
                inst = [(pno, ph + (ms - ws)) for pno, ph in hits]
                pr = run_cluster(cls, ms, me, inst)
                if pr is not None:
                    props.update(pr)
                    ok_clusters += 1
                done = True
                break
            if not done:
                detail.append(f'cluster {cls}@{ms}-{me} NOT-FOUND even as window')
    if props:
        raw_props = []
        for lp, (newc, cls, v) in sorted(props.items()):
            rp = n2raw[lp]
            raw_props.append((rp, raw_line[rp], newc, cls, v))
        return {'verdict': 'RESTORE', 'props': raw_props,
                'amb_clusters': amb_clusters, 'detail': detail[:24]}
    if amb_clusters:
        return {'verdict': 'AMBIGUOUS', 'reason': amb_clusters[0][3],
                'amb_clusters': amb_clusters, 'detail': detail[:12]}
    if any('NOT-FOUND' not in d for d in detail):
        return {'verdict': 'FLAT', 'detail': detail[:12]}
    return {'verdict': 'NOT-FOUND', 'detail': detail[:8]}

def adjudicate_zero_lhs(pdf, raw_line):
    """line starts '0 =': full match may still succeed (page flat) or the exponent
    glyph was lost entirely (page shows 0²=, corpus '0='). Backward-look pass."""
    res = adjudicate_line(pdf, raw_line)
    if res['verdict'] in ('RESTORE', 'FLAT'):
        return res
    nline, _ = norm_index(raw_line)
    tail = nline[2:]
    for pno, pg in enumerate(pdf.pages):
        start = 0
        while True:
            i = pg['ntext'].find(tail, start)
            if i < 0:
                break
            start = i + 1
            if i < 3 or pg['ntext'][i-1] != '=':
                continue
            j = i - 2
            while j >= 0 and pg['ntext'][j] in '0123456789':
                j -= 1
            if j < 0 or pg['ntext'][j] != '0':
                continue
            regs = check_region(pdf, pno, j, i - 1)
            raised = [k for k in range(j, i - 1)
                      for si, v, _ in regs if pg['cmap'][k] == si and v == 'SUP']
            base0 = any(v == 'BASE' for _, v, _ in regs)
            if raised and base0:
                chars = ''.join(SUP[pg['ntext'][k]] for k in sorted(raised))
                return {'verdict': 'RESTORE-zero-lhs', 'insert_after_raw': 0, 'chars': chars,
                        'detail': [f'p{pno} backward-look: 0 + raised {pg["ntext"][j+1:i-1]!r} + =']}
    return res

def paper_dir(slug):
    m = slug.replace('official-4ph1-', '')
    parts = m.split('-')
    var, ser = parts[0], '-'.join(parts[1:])
    return f'{ser}_4ph1-{var}'

def get_pdf(slug, kind):
    p = f'{EV}/{paper_dir(slug)}_{kind}.json'
    if not os.path.exists(p):
        return None
    return PDF(p)
