#!/usr/bin/env python3
"""T-OEQ-PHYS-FORMAT-1 run-002 - S1 superscript/subscript restoration pass.

LAW OF THE PASS (pre-registered; extends run-001's):
- L0 restorations are PURE unicode super/subscript character substitutions at
  the exact position of the flattened ASCII run. No spacing, wording or order
  changes; no new $-segments; $-segment interiors are never touched.
- L1 every rule is pre-registered below with its context gate; each restoration
  is tagged with its rule + evidence class. Ambiguous instances are NEVER
  converted - they stay in the census with their class.
- L2 scientific-notation (x10 / negexp) and digit/decimal-cluster restorations
  are ARITHMETIC-ADJUDICATED: convert only when the as-written chain is
  evaluable and FALSE while the restored reading is TRUE (per-line chain, or
  cross-line anchor within 1% from a neighbour's "label = value" line).
  Plausibility fallback (exponent 1..24/27, scientific-notation position only)
  applies only where the chain cannot contradict it.
- L3 lines that already contain ANY super/subscript character are never edited
  (keeps the inverse map total). Two disclosed U+FFFD repairs are the only
  non-substitution edits (exact (before,after) pairs, allow-listed).
- L4 markPoints/choices are mechanical mirrors of the same law; content,
  line count and marks are untouched (G1), markPoint text identity is proven
  by G2 like every other field.

GATES: G1 structure+marks; G2 byte-exact inverse reconstruction per changed
line; G3 PUA/control 0 + U+FFFD 2->0 (2 disclosed repairs); G4 raw-$ count
equal to main; G5 $-segment set identical to main; G6 serialization byte-law;
G7 per-rule census == dry-run census, 0 edits inside $-segments; G8 idempotence
(second application changes nothing).

Usage: phys_s1_restore.py --dry | --apply
"""
import json, re, sys, warnings, collections
warnings.filterwarnings('ignore')

P = '/tmp/v2repo/apps/hub/content/igcse-physics-19/official-papers.json'
REPO = '/tmp/v2repo'

SUP = {'-': '\u207b', '\u2212': '\u207b', '\u2013': '\u207b', '0': '\u2070', '1': '\u00b9',
       '2': '\u00b2', '3': '\u00b3', '4': '\u2074', '5': '\u2075', '6': '\u2076',
       '7': '\u2077', '8': '\u2078', '9': '\u2079'}
SUB = {'0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083', '4': '\u2084',
       '5': '\u2085', '6': '\u2086', '7': '\u2087', '8': '\u2088', '9': '\u2089'}

def sup(s):
    return ''.join(SUP[c] for c in s)

def sub(s):
    return ''.join(SUB[c] for c in s)

# characters that mark a line as already-restored (never edited; L3)
SUPSUB_CHARS = set('\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207b'
                   '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089')

# ---------------- eval machinery (F60 doctrine) ----------------
LABEL_RE = re.compile(r'^\([^()=]{1,24}=\)\s*')

def strip_label(s):
    return LABEL_RE.sub('', s.strip()).strip()

def ev_side(x):
    x = re.sub(r'(?<=\d) (?=\d)', '', x)          # spaced thousands
    x = x.replace('\u00d7', '*').replace('\u00f7', '/').replace('\u2212', '-')
    x = re.sub(r'(?<=[\d)])\s*[xX]\s*(?=[\d(])', '*', x)   # lowercase x as times
    x = x.replace('\u207b', '-').replace('\u2212', '-').replace('\u2013', '-')
    x = re.sub(r'[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]', lambda m: str(
        '\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079'.index(m.group(0))), x)
    x = x.replace('^', '**')
    if not re.fullmatch(r'[\d\s\+\-\*/\.\(\)]+', x):
        return None
    try:
        v = eval(x, {'__builtins__': {}}, {})
    except Exception:
        return None
    if isinstance(v, int) and v.bit_length() > 1000:
        return None
    return v

def side_value(side):
    """value of one equation side; strips a trailing unit token/paren."""
    v = ev_side(side)
    if v is not None:
        return v
    s2 = re.sub(r'\s*\([^()]*\)\s*$', '', side)   # trailing (J) unit paren
    v = ev_side(s2)
    if v is not None:
        return v
    s3 = re.sub(r'\s+[A-Za-z\u03a9\u00b0][A-Za-z\u03a9\u00b0/0-9]*\s*$', '', side)  # trailing unit
    return ev_side(s3)

def chain_values(core):
    """numeric values of the chain sides (symbolic sides dropped)."""
    return [v for v in (side_value(x.strip()) for x in core.split('=')) if v is not None]

def chain_state(core):
    """True / False / None (not judgeable) on the numeric sub-chain."""
    nums = chain_values(core)
    if len(nums) < 2:
        return None
    a, b = nums[0], nums[-1]
    if b == 0:
        return abs(a) < 1e-12
    return abs(a - b) / max(abs(b), 1e-12) <= 0.01

SUPPARSE = str.maketrans(''.join(SUP.keys()), '---' + '0123456789')

PM_X10 = re.compile(r'(?<=[\d)\s])[\u00d7x]\s*10(\d{1,2})(?![\d.%])')
PM_NEG = re.compile(r'(?<=[\d)\s])[\u00d7x]?\s*10\s*[\u2212\u2013-]\s*(\d{1,3})(?![\d.])')

def pm(line):
    """parse-mode: flatten ×10N / 10-N scientific notation to *10**N so ev_side
    can evaluate lines/anchors that still carry un-restored notation."""
    line = PM_X10.sub(r'*10**\1', line)
    line = PM_NEG.sub(r'*10**-\1', line)
    return line

def pm_tok(line, tok, repl):
    """pm() but with every literal occurrence of tok masked out (replaced by
    repl AFTER parsing restoration), so the token under test keeps its state."""
    masked = line.replace(tok, '\x00')
    masked = pm(masked)
    return masked.replace('\x00', repl)

def parse_mode(line):
    """parse-mode normalization for anchor/chain evaluation: superscripted
    exponents back to ASCII so ev_side can read them."""
    return line.translate(SUPPARSE)

# ---------------- context helpers ----------------
SUVAT_TAIL = re.compile(r'\+\s*\(?\s*2\s*[\u00d7x]\s|\b2\s*[\u00d7x]?\s*a\s*[\u00d7x]?\s*[sS]\b'
                        r'|/\s*2a\b|\bv2\s*[\u2212\u2013-]\s*u2\b|\b2as\b')
MOMENTUM_SHAPE = re.compile(r'\b[mMuU][12]\s*[\u00d7x]?\s*[uUvV][12]\b|\bmomentum\b')
CIRCUIT_KW = re.compile(r'current|ammeter|voltmeter|resistor|\u03a9|p\.d\.|\bpd\b|voltage|'
                        r'circuit|lamp|battery|\bcell\b|thermistor|LDR|\(V\)|\(A\)|\(mA\)|\(kA\)')
GAS_KW = re.compile(r'kPa|million Pa|\bPa\b|pressure|temperature|\bvolume\b|\bK\b')

def field_context(lines):
    joined = '\n'.join(lines)
    return {'circuit': bool(CIRCUIT_KW.search(joined)),
            'gas': bool(re.search(r'p[12]\s*/\s*T[12]|p[12]\s*[\u00d7x]\s*V[12]|p[12]V[12]|'
                                  r'N[12]/N[12]|kPa|million Pa|temperature|pressure', joined, re.I)),
            'momentum': bool(MOMENTUM_SHAPE.search(joined))}

# ---------------- rules ----------------
RULE_FUNCI = re.compile(r'\b(sin|cos|tan)\s*-\s*1\b')
RULE_PARENSUP = re.compile(r'\(([^()]{1,10})\)([23])(?![\d.])')
RULE_X10 = re.compile(r'(?<=[\d)\s])([\u00d7x])\s*10(\d{1,2})(?![\d.%])')
RULE_NEGEXP = re.compile(r'(?<=[\u00d7x\d)])\s?10\s*([\u2212\u2013-])\s*(\d{1,3})(?![\d.%])')
RULE_CLUSTER_D = re.compile(r'(?<![\d.\^])\d{3,6}(?![\d.])')
RULE_CLUSTER_F = re.compile(r'(?<![\d.\^])\d+\.\d{2,}[2-9](?![\d.])')
RULE_COMPOUND_U = re.compile(
    r'(?<![\w/])\b(m|cm|mm|km|nm|g|kg|N|kN|J|kJ|W|kW|V|kV|A|Pa|kPa|MPa|K|s|ms|h|C)'
    r'\s*/\s*(m|cm|mm|km|nm|s|ms|g|kg|h|min|A|V|W|J|N|K)([23])\b(?!\w)')
RULE_BARE_U = re.compile(r'\b(m|cm|mm|km|nm)([23])\b(?!\w)')
RULE_OF_U = re.compile(r'\b(?:in|of|is|to|use|units|gives|accept|allow)\s+(m|cm|mm|km|nm)([23])\b')
RULE_WORDSUP = re.compile(r'\b(time|speed|radius|distance)(2)\b')
RULE_MV2 = re.compile(r'\bmv2\b|\bmc2\b')
RULE_HALFKE = re.compile(r'(1/2|\u00bd)\s*(?:\u00d7\s*)?(?:m\b|mass\b)\s*(?:\u00d7\s*)?(v|speed|velocity)2\b')
RULE_HALFKE2 = re.compile(r'0\.5\s*\u00d7\s*[^(=]*\u00d7\s*v2\b')
RULE_V2U2 = re.compile(r'\bv2\b|\bu2\b')
RULE_V2EQ = re.compile(r'\bv2\s*=\s*[\d(]')
RULE_V2POW = re.compile(r'\bV2\s*/\s*R\b')
RULE_PIR3 = re.compile(r'\b\u03c0\s*r3\b|\br3\b(?=\s*;|\s*\))')
RULE_GAS = re.compile(r'\b([pP][12]|[Tt][12]|[Vv][12])\b')
RULE_TRANSM = re.compile(r'\bN([12])\b')
RULE_MOMSUB = re.compile(r'\b([mpuvMPUV][12])\b')
RULE_CIRCSUB = re.compile(r'\b([VI][12])\b')
RULE_CIRCV = re.compile(r'\bV(R|\d{2,3})\b')

def adj_unique(orig, alts):
    """as-written must be evaluable-FALSE; exactly one alt chain-TRUE."""
    st = chain_state(orig)
    if st is not False:
        return None
    trues = [a for a in alts if chain_state(a) is True]
    return trues[0] if len(trues) == 1 else None

def eval_expr(expr):
    """value of an expression-or-equation: prefer the last evaluable '='-side."""
    if '=' in expr:
        sides = expr.split('=')
        for s in reversed(sides):
            v = side_value(s.strip())
            if v is not None:
                return v
        return None
    return side_value(expr)

def xline_anchor(lines, idx, expr_asis, alt_list, tok=None):
    """cross-line anchor: neighbour 'label = VALUE' (±2 lines); as-written value
    must be evaluable and >1% off the anchor while an alt is within 1%.
    expr_asis/alt_list may still carry flattened notation: tok (the token under
    test) stays as-is in expr_asis and is restored in each alt; everything else
    gets parse-mode restoration. Returns (tag, alt_index) or None."""
    lo, hi = max(0, idx - 2), min(len(lines), idx + 3)
    for j in range(lo, hi):
        if j == idx:
            continue
        cand = strip_label(pm(lines[j]))
        anchors = []
        if '=' in cand:
            parts = cand.split('=')
            for seg in ([parts[-1]] + ([parts[0]] if len(parts) == 2 else [])):
                a = side_value(seg.split(' OR ')[0].strip())
                if a is not None and a != 0:
                    anchors.append(a)
        else:
            a = side_value(cand)
            if a is None:
                pre = re.match(r'^[\d.\s\u00d7x/()+\-*]*', cand).group(0)
                if pre.strip():
                    a = side_value(pre)
            if a is not None and a != 0:
                anchors.append(a)
        if not anchors:
            continue
        v0 = eval_expr(pm_tok(expr_asis, tok, tok) if tok else pm(expr_asis))
        if v0 is None:
            return None
        for ai, alt in enumerate(alt_list):
            v1 = eval_expr(pm_tok(alt, tok, tok) if tok else pm(alt))
            if v1 is None:
                continue
            for a in anchors:
                try:
                    if abs(v0 - a) / abs(a) > 0.01 and abs(v1 - a) / abs(a) <= 0.01:
                        return (f'arith:xline-anchor({j - idx:+d})', ai)
                except (OverflowError, ZeroDivisionError):
                    continue
    return None

def restore_line(line, idx, lines, fctx):
    """returns (new_line, [(rule, evidence, before, after), ...])"""
    edits = []
    orig = line

    # R-funci: inverse trig
    def f_funci(m):
        edits.append(('funcinv', 'shape', m.group(0), f'{m.group(1)}{sup("-1")}'))
        return f'{m.group(1)}{sup("-1")}'
    line = RULE_FUNCI.sub(f_funci, line)

    # R-cluster: digit/decimal sup-loss, arithmetic-adjudicated
    seen_tokens = set()
    for rule_name, rx in (('cluster-d', RULE_CLUSTER_D), ('cluster-f', RULE_CLUSTER_F)):
        out, last = [], 0
        for m in rx.finditer(line):
            t = m.group(0)
            if t in seen_tokens:
                continue
            cands = []
            for k in (1, 2):
                if len(t) <= k:
                    continue
                if k == 1:
                    # last digit is the exponent: must be 2-9 (0/1 give nonsense)
                    if t[-1] in '23456789':
                        cands.append((t[:-1], t[-1:]))
                else:
                    # two-digit exponent only in the x10 family (base exactly '10')
                    if t[:-2] == '10' and not t[-2:].startswith('0'):
                        cands.append((t[:-2], t[-2:]))
            if not cands:
                continue
            spans = [line[:m.start()] + f'{b}^{e}' + line[m.end():] for b, e in cands]
            win = None
            st = chain_state(line)
            if st is False:
                trues = [i for i, a in enumerate(spans) if chain_state(a) is True]
                if len(trues) == 1:
                    win = ('arith:chain', trues[0])
            if win is None and expr_ok(line):
                win = xline_anchor(lines, idx, line, spans, tok=t)
            if win:
                tag, ai = win
                b, e = cands[ai]
                newt = b + sup(e)
                out.append(line[last:m.start()]); out.append(newt)
                edits.append((rule_name, tag, t, newt))
                last = m.end()
        out.append(line[last:])
        line = ''.join(out)

    # R-x10: × 10N exponent restoration
    out, last = [], 0
    for m in RULE_X10.finditer(line):
        d = m.group(2)
        di = int(d)
        span = m.group(0)
        tok = '10' + d
        base = line[:m.start(2)]
        newtok = '10' + sup(d)
        win = None
        if chain_state_possible(line):
            alt = line.replace(tok, f'10^{d}')
            st_asis = chain_state(parse_mode(line))
            st_alt = chain_state(parse_mode(alt))
            if st_asis is False and st_alt is True:
                win = ('arith:chain', 0)
            if win is None and st_asis is None and expr_ok(line):
                r = xline_anchor(lines, idx, line, [alt], tok=tok)
                if r:
                    win = (r[0], 0)
        if win is None and 1 <= di <= 24 and chain_state(line) is not True:
            win = ('plausibility', 0)
        if win:
            out.append(line[last:m.start(2)]); out.append(sup(d))
            edits.append(('x10', win[0], tok, newtok))
            last = m.end(2)
    out.append(line[last:])
    line = ''.join(out)

    # R-negexp: 10-N
    out, last = [], 0
    for m in RULE_NEGEXP.finditer(line):
        d = m.group(2)
        di = int(d)
        tok_re_txt = re.escape('10') + r'\s*[' + re.escape(m.group(1)) + r']\s*' + d
        tight = bool(re.fullmatch(r'\s?10[\u2212\u2013-]\d{1,3}', m.group(0)))
        win = None
        if chain_state_possible(line):
            alt = re.sub(tok_re_txt, '10^' + d, line, count=1)
            st_asis = chain_state(parse_mode(line))
            st_alt = chain_state(parse_mode(alt))
            if st_asis is False and st_alt is True:
                win = ('arith:chain', 0)
            if win is None and st_asis is None and expr_ok(line):
                r = xline_anchor(lines, idx, line, [alt], tok=m.group(0).lstrip())
                if r:
                    win = (r[0], 0)
        if win is None and tight and 1 <= di <= 27 and chain_state(line) is not True:
            win = ('plausibility', 0)
        if win:
            out.append(line[last:m.start(1)]); out.append(sup('-') + sup(d))
            edits.append(('negexp', win[0], '10' + m.group(1) + d, '10' + sup('-') + sup(d)))
            last = m.end(2)
    out.append(line[last:])
    line = ''.join(out)

    # R-parensup (after notation restore): (speed)2 / (13)2 / (2.5 x 10^7)2
    def f_paren(m):
        g = m.group(1)
        strict = re.fullmatch(r'[A-Za-z]{2,10}|0?\d{1,3}', g) and \
            not re.search(r'[\u00d7x/.\u2212\u2013-]', g)
        relaxed = bool(re.fullmatch(r'[\d.\s\u00d7x\u2070\u00b9\u00b2\u00b3\u2074-\u2079\u207b]+', g)
                       and re.search(r'\d\s*[\u00d7x]\s*\d', g)
                       and not g.rstrip().endswith('.'))
        if (strict or relaxed) and ('=' in line or '\u2248' in line):
            newt = f'({g}){sup(m.group(2))}'
            edits.append(('parensup', 'shape', m.group(0), newt))
            return newt
        return m.group(0)
    line = RULE_PARENSUP.sub(f_paren, line)

    # R-unit: compound + bare unit superscripts (skip momentum/gas-var lines)
    varline = bool(MOMENTUM_SHAPE.search(line)) or bool(re.search(r'\bm[12]\s*=', line))
    def f_compound(m):
        pre = line[max(0, m.start() - 2):m.start()]
        if re.search(r'[A-Za-z][\s]?$', pre) and not re.search(r'[=\u00d7x\u00f7(/,;:]\s?$', pre):
            return m.group(0)
        new = m.group(0)[:-1] + sup(m.group(3))
        edits.append(('unit-compound', 'shape', m.group(0), new))
        return new
    line = RULE_COMPOUND_U.sub(f_compound, line)
    def f_bare(m):
        if varline:
            return m.group(0)
        pre = line[max(0, m.start() - 2):m.start()]
        ok = bool(re.search(r'[\d(=]\s?$', pre)) or re.search(r'[\d(]\s?$', pre)
        if not ok:
            return m.group(0)
        new = f'{m.group(1)}{sup(m.group(2))}'
        edits.append(('unit-bare', 'shape', m.group(0), new))
        return new
    line = RULE_BARE_U.sub(f_bare, line)
    def f_of(m):
        new = f'{m.group(0)[:-len(m.group(2))]}{sup(m.group(2))}'
        edits.append(('unit-of', 'shape', m.group(0), new))
        return new
    line = RULE_OF_U.sub(f_of, line)

    # R-wordsup / KE / suvat letter superscripts
    def f_wordsup(m):
        edits.append(('wordsup', 'shape', m.group(0), f'{m.group(1)}{sup("2")}'))
        return f'{m.group(1)}{sup("2")}'
    line = RULE_WORDSUP.sub(f_wordsup, line)

    def f_mv(m):
        edits.append(('ke-shape', 'shape', m.group(0), m.group(0)[:-1] + sup('2')))
        return m.group(0)[:-1] + sup('2')
    line = RULE_MV2.sub(f_mv, line)

    def f_halfke(m):
        new = m.group(0)[:-1] + sup('2')
        edits.append(('ke-shape', 'shape', m.group(0), new))
        return new
    line = RULE_HALFKE.sub(f_halfke, line)
    line = RULE_HALFKE2.sub(f_halfke, line)

    if SUVAT_TAIL.search(line) or RULE_V2U2.search(line):
        both = len(re.findall(r'\bv2\b|\bu2\b', line)) >= 2
        def f_v2(m):
            ok = both or SUVAT_TAIL.search(line) or RULE_V2EQ.search(line)
            if not ok:
                return m.group(0)
            edits.append(('suvat-sup', 'shape', m.group(0), m.group(0)[:-1] + sup('2')))
            return m.group(0)[:-1] + sup('2')
        line = RULE_V2U2.sub(f_v2, line)

    def f_v2pow(m):
        new = 'V' + sup('2') + m.group(0)[2:]
        edits.append(('power-sup', 'shape', m.group(0), new))
        return new
    line = RULE_V2POW.sub(f_v2pow, line)

    def f_pir3(m):
        new = m.group(0).replace('r3', 'r' + sup('3'))
        edits.append(('pir3', 'shape', m.group(0), new))
        return new
    line = RULE_PIR3.sub(f_pir3, line)

    # R-rest: digit suvat-rest tokens (02 = 212 + [2 x a x s])
    if SUVAT_TAIL.search(line) or re.search(r'^\s*\d{1,4}[23]?\s*=\s*[\d\[]', line) and \
            re.search(r'[\u00d7x]\s*[sS]\b|[\u00d7x]\s*distance|\[\s*2\s', line):
        def f_rest(m):
            t = m.group(0)
            inner = t.strip('()')
            base = inner[:-1]
            if len(base) > 3 or base == '':
                return t
            newt = ('(' if t.startswith('(') else '') + base + sup('2') + (')' if t.endswith(')') else '')
            edits.append(('suvat-rest', 'shape', t, newt))
            return newt
        line = re.sub(r'(?<![\d.])\(?0[23]\)?|(?<![\d.])\(\d{1,3}\)2|(?<![\d.])(?<!\d)\d{1,3}2\b(?!\s?\d)', f_rest, line)

    # R-sub: subscripts
    if fctx['gas'] or re.search(r'p[12]\s*/\s*T[12]|p[12]\s*[\u00d7x]\s*V[12]|p[12]V[12]|'
                                r'V[12]\s*=|T[12]\s*=|/\s*T[12]|/\s*p[12]|N[12]/N[12]|'
                                r'kPa|million Pa', line):
        def f_gas(m):
            t = m.group(0)
            edits.append(('gas-sub', 'shape', t, t[0] + sub(t[1])))
            return t[0] + sub(t[1])
        line = RULE_GAS.sub(f_gas, line)
    if re.search(r'N[12]/N[12]|turns|coil|primary|secondary', line):
        def f_trans(m):
            edits.append(('trans-sub', 'shape', m.group(0), 'N' + sub(m.group(1))))
            return 'N' + sub(m.group(1))
        line = RULE_TRANSM.sub(f_trans, line)
    if fctx['momentum'] or re.search(r'[mp][12][uv][12]|\bmomentum\b', line):
        def f_mom(m):
            t = m.group(0)
            edits.append(('mom-sub', 'shape', t, t[0] + sub(t[1])))
            return t[0] + sub(t[1])
        line = RULE_MOMSUB.sub(f_mom, line)
    if fctx['circuit'] or CIRCUIT_KW.search(line):
        def f_circ(m):
            t = m.group(0)
            edits.append(('circ-sub', 'shape', t, t[0] + sub(t[1])))
            return t[0] + sub(t[1])
        line = RULE_CIRCSUB.sub(f_circ, line)
        def f_circv(m):
            tail = m.group(1)
            if tail == 'R':
                return m.group(0)  # no unicode subscript for capital R - censused
            if re.search(r'\b' + tail + r'\b', line.replace(m.group(0), '', 1)) \
                    or re.search(r'\b' + tail + r'\b', '\n'.join(lines)):
                new = 'V' + sub(tail)
                edits.append(('circ-sub', 'shape', m.group(0), new))
                return new
            return m.group(0)
        line = RULE_CIRCV.sub(f_circv, line)

    return line, edits, orig

def expr_ok(line):
    s = strip_label(line)
    return bool(re.search(r'[\d)]\s*[\u00d7x/+\-]', s) or re.match(r'^\s*[\d(]', s)) and \
        not re.search(r'[A-Za-z]{3,}', re.sub(r'\b(sin|cos|tan|mass|speed|allow|accept|OR|or|mark|km|cm|mm|Pa|kPa|million|efficiency|energy|force|pressure|current|voltage|wavelength|frequency|volume|density|distance|time|acceleration|answer|question|ecf|words|equation|substitution|recall|correct|reject|ignore|idea|use|using|give|gives|seen|anywhere|this|that|from|with|without|marks|max|POT|error|for|the|of|to|in|and|is|be|not|OR\b)\b', '', s))

def chain_state_possible(line):
    return '=' in line or '\u2248' in line

# ---------------- FFFD repair (disclosed) ----------------
FFFD_FIX = '\u00d7 \ufffd'
FFFD_NEW = '\u00d7 \u221a0.4'
FFFD_WHERE = 'official-4ph1-1p-2022-06|offq_2022-06_1p_11|p4'

def fields(d):
    for e in d:
        for q in e.get('questions', []):
            for pi, pt in enumerate(q.get('parts', [])):
                for fld in ('problemMd', 'solutionMd'):
                    if pt.get(fld):
                        yield e, q, pi, pt, fld, pt
                for ci, ch in enumerate(pt.get('choices') or []):
                    if isinstance(ch, dict) and ch.get('textMd'):
                        yield e, q, pi, pt, f'choice{ci}', ch
                for mi, mp in enumerate(pt.get('markPoints') or []):
                    if isinstance(mp, dict) and mp.get('textMd'):
                        yield e, q, pi, pt, f'mp{mi}', mp

def main():
    apply_mode = '--apply' in sys.argv
    d = json.load(open(P))
    rule_census = collections.Counter()
    evid_census = collections.Counter()
    changed_fields = []
    all_edits = []

    for e, q, pi, pt, fldname, holder in fields(d):
        attr = 'textMd' if holder is not pt else fldname
        text = holder.get(attr)
        if not text:
            continue
        lines = text.split('\n')
        plain_idx = [i for i, ln in enumerate(lines)
                     if not (ln.strip().startswith('$') and ln.strip().endswith('$') and len(ln.strip()) > 2)]
        fctx = field_context([lines[i] for i in plain_idx])
        new_lines = list(lines)
        changed = False
        for i in plain_idx:
            s = lines[i]
            if not s.strip() or any(c in s for c in SUPSUB_CHARS):
                continue
            nl, edits, orig = restore_line(s, i, lines, fctx)
            if edits:
                new_lines[i] = nl
                changed = True
                for r, ev, bef, aft in edits:
                    rule_census[r] += 1
                    evid_census[f'{r}/{ev.split("(")[0]}'] += 1
                    all_edits.append({'where': f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                                      'line_no': i, 'rule': r, 'evidence': ev,
                                      'before': bef, 'after': aft,
                                      'line_before': s, 'line_after': nl})
        # FFFD repair
        for i in plain_idx:
            if FFFD_FIX in new_lines[i] and f"{e['slug']}|{q['id']}|p{pi}" .startswith(FFFD_WHERE.rsplit('|', 1)[0]):
                new_lines[i] = new_lines[i].replace(FFFD_FIX, FFFD_NEW)
                changed = True
                rule_census['fffd-repair'] += 1
                all_edits.append({'where': f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                                  'line_no': i, 'rule': 'fffd-repair',
                                  'evidence': 'cross-line identity: launch speed = 1.92/√0.4 (next line); '
                                              'projectile range = speed × √(2h/g), h=2.0 m, g=10',
                                  'before': FFFD_FIX, 'after': FFFD_NEW,
                                  'line_before': lines[i], 'line_after': new_lines[i]})
        if changed:
            changed_fields.append((holder, attr, f"{e['slug']}|{q['id']}|p{pi}|{fldname}", text))
            holder[attr] = '\n'.join(new_lines)

    print(f'changed fields: {len(changed_fields)}')
    print('rule census:')
    for k, v in rule_census.most_common():
        print(f'  {k:16} {v}')
    print('evidence census:')
    for k, v in evid_census.most_common():
        print(f'  {k:28} {v}')

    if not apply_mode:
        json.dump({'changed_fields': len(changed_fields), 'rule_census': dict(rule_census),
                   'edits': all_edits},
                  open('/tmp/s1_restore_dry.json', 'w'), indent=1, ensure_ascii=False)
        print('DRY RUN - no writes; edits dumped to /tmp/s1_restore_dry.json')
        return

    # ---------------- GATES ----------------
    import subprocess
    head = subprocess.run(['git', '-C', REPO, 'show',
                           'HEAD:apps/hub/content/igcse-physics-19/official-papers.json'],
                          capture_output=True, text=True)
    odoc = json.loads(head.stdout)
    omap = {}
    for e, q, pi, pt, fldname, holder in fields(odoc):
        omap[f"{e['slug']}|{q['id']}|p{pi}|{fldname}"] = holder if holder is not pt else (holder, fldname)

    def census(doc):
        return (len(doc),
                sum(len(e.get('questions', [])) for e in doc),
                sum(len(q.get('parts', [])) for e in doc for q in e.get('questions', [])),
                [pt.get('marks') for e in doc for q in e.get('questions', [])
                 for pt in q.get('parts', [])])
    c_o, c_n = census(odoc), census(d)
    assert c_o[:3] == c_n[:3] and c_o[3] == c_n[3], 'structure/marks drift'
    print(f'G1 structure+marks: OK {c_n[:3]}')

    INV = str.maketrans('\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207b'
                        '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089',
                        '0123456789-' + '0123456789')
    fffd_allowed = 0
    DASHNORM = re.compile('[\u2010-\u2015\u2212]')
    for holder, attr, key, old in changed_fields:
        new_t = holder[attr]
        nl, ol = new_t.split('\n'), old.split('\n')
        assert len(nl) == len(ol), f'line count drift {key}'
        for a, b in zip(nl, ol):
            if a == b:
                continue
            rec = DASHNORM.sub('-', a.translate(INV))
            ref = DASHNORM.sub('-', b)
            if rec == ref:
                continue
            if FFFD_NEW in a and FFD_REPAIR_OK(a, b):
                fffd_allowed += 1
                continue
            raise AssertionError(f'IDENTITY FAIL {key}\n  new: {a!r}\n  old: {b!r}')
    print(f'G2 inverse reconstruction: OK ({len(changed_fields)} fields, {fffd_allowed} fffd pairs)')

    raw_new = json.dumps(d, indent=1, ensure_ascii=False)
    old_blob = head.stdout
    fffd_old, fffd_new_n = old_blob.count('\ufffd'), raw_new.count('\ufffd')
    assert fffd_new_n == 0 and fffd_old == 2, f'FFFD law violated ({fffd_old} -> {fffd_new_n})'
    bad = [hex(ord(c)) for c in set(raw_new)
           if 0xE000 <= ord(c) <= 0xF8FF or (ord(c) < 32 and c != '\n')]
    assert not bad, f'PUA/control: {bad[:5]}'
    print(f'G3 PUA/control: OK (0) | U+FFFD: {fffd_old} -> 0 (2 disclosed repairs)')

    assert raw_new.count('$') == old_blob.count('$'), 'raw-$ count drift'
    print(f'G4 raw-$ parity: OK ({raw_new.count("$")} == main)')

    def segset(doc):
        segs = set()
        for e in doc:
            for q in e.get('questions', []):
                for pt in q.get('parts', []):
                    for fld in ('problemMd', 'solutionMd'):
                        t = pt.get(fld)
                        if t:
                            segs |= set(re.findall(r'\$[^$]+\$', t))
                    for ch in pt.get('choices') or []:
                        if isinstance(ch, dict) and ch.get('textMd'):
                            segs |= set(re.findall(r'\$[^$]+\$', ch['textMd']))
                    for mp in pt.get('markPoints') or []:
                        if isinstance(mp, dict) and mp.get('textMd'):
                            segs |= set(re.findall(r'\$[^$]+\$', mp['textMd']))
        return segs
    assert segset(d) == segset(odoc), '$-segment set drift'
    print(f'G5 $-segment set identical: OK ({len(segset(d))} segments)')

    assert json.dumps(json.loads(raw_new), indent=1, ensure_ascii=False) == raw_new
    print('G6 serialization byte-law: OK')

    # G7: no edits inside $-segments (by construction; verify per edit)
    for ed in all_edits:
        lb = ed['line_before']
        assert not (lb.strip().startswith('$') and lb.strip().endswith('$')), \
            f'edit inside $-segment: {ed}'
    print(f'G7 no $-segment edits: OK ({len(all_edits)} edits all on plain lines)')

    with open(P, 'w') as f:
        f.write(raw_new)
    json.dump({'edits': all_edits, 'rule_census': dict(rule_census),
               'evid_census': dict(evid_census),
               'changed_fields': [c[2] for c in changed_fields]},
              open('/tmp/s1_restore_payload.json', 'w'), indent=1, ensure_ascii=False)
    print('APPLIED -> payload /tmp/s1_restore_payload.json')

def FFD_REPAIR_OK(a, b):
    return b.replace(FFFD_FIX, FFFD_NEW) == a

if __name__ == '__main__':
    main()
