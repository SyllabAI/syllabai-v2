#!/usr/bin/env python3
"""T-OEQ-PHYS-FORMAT-1 run-001 - 4PH1 KaTeX conversion pass (automated, content-preserving).

LAW OF THE PASS (pre-registered):
- L1 convert: whole LINES that are PURE single-letter/Greek symbol equations
  (lhs '=' rhs; rhs over the safe math charset; NO units, NO word symbols,
  NO letter-runs >= 2, NO letter-digit adjacency, NO S1 damage signatures).
- S1 damage classes (x10N exponent loss, letter-digit adjacency, func-inverse loss,
  spaced-unit tails, bare sqrt) are NEVER converted - censused into the run-002 worklist.
- Unicode -> LaTeX map is total and invertible; identity gate reconstructs every
  edited field through the inverse map (space-normalized) and requires equality.
- Gates: structure census unchanged; marks identical; katex.renderToString
  (throwOnError) 0 failures on every produced segment; PUA/UFFFD/control 0;
  raw-$ parity (even count, no escapes); serialization indent=1 ensure_ascii=False
  no-trailing-newline byte-law round-trip.

Usage: phys_katex_pass.py --dry | --apply
"""
import json, re, sys, subprocess, collections

P = '/tmp/v2repo/apps/hub/content/igcse-physics-19/official-papers.json'
REPO = '/tmp/v2repo'
KATEX_JS = '/tmp/ktx/node_modules/katex'

U2L = {
    '×': r'\times ', '÷': r'\div ', '−': '-', '≈': r'\approx ', '≤': r'\le ', '≥': r'\ge ',
    '∝': r'\propto ', '°': r'^{\circ}', '∆': r'\Delta ', 'Δ': r'\Delta ',
    '½': r'\frac{1}{2}', '¼': r'\frac{1}{4}', '¾': r'\frac{3}{4}',
    '²': '^{2}', '³': '^{3}', '⁴': '^{4}', '⁻¹': '^{-1}',
    'α': r'\alpha ', 'β': r'\beta ', 'γ': r'\gamma ', 'δ': r'\delta ',
    'ε': r'\varepsilon ', 'η': r'\eta ', 'θ': r'\theta ', 'κ': r'\kappa ',
    'λ': r'\lambda ', 'μ': r'\mu ', 'ν': r'\nu ', 'π': r'\pi ', 'ρ': r'\rho ',
    'σ': r'\sigma ', 'τ': r'\tau ', 'φ': r'\phi ', 'χ': r'\chi ', 'ψ': r'\psi ',
    'ω': r'\omega ', 'Ω': r'\Omega ', 'Π': r'\Pi ', 'Σ': r'\Sigma ',
    'Φ': r'\Phi ', 'Ψ': r'\Psi ', 'Γ': r'\Gamma ', 'Λ': r'\Lambda ', 'Θ': r'\Theta ',
    '%': r'\% ',
}
GREEK_SET = 'αβγδεζηθικλμνξπρστυφχψωΩΔΘΛΠΣΦΨΓξζ∆'
U2L['·'] = r'\cdot '

S1X10     = re.compile(r'[×÷]\s*10[0-9]')            # x10N exponent loss (any digits)
S1NEGEXP  = re.compile(r'10\s*-\s*[0-9]')             # 10-7 negative exponent loss
S1DECIMAL = re.compile(r'\d\.\d{2,}[2-9]\b')          # 0.452 = 0.45 sup-loss suspect
S1LEADZERO = re.compile(r'(?<![\d.])0\d(?![\d.])')    # 02 = 0^2 loss (not thousands groups)
S1PARENSUP = re.compile(r'\)\d')                      # (13)2 paren superscript loss
S1SUVAT   = re.compile(r'\d+[2-9]\s*=\s*\d+[2-9]\s*\+') # 262 = 722 + digit-base sup shape
S1FUNC    = re.compile(r'\b[a-z]{2,}\s*-\s*[0-9]')
UNIT_TAIL = re.compile(r'\d\s+[A-Za-z]\b')
UNIT_PAREN = re.compile(r'\(\s*°?[A-Za-z/]{1,6}\s*\)')
CORE_CHARS = re.compile(
    r'^[A-Za-z0-9\s\.\,\(\)\+\-×÷\*\/\=≈√½¼¾²³⁴°\;\%\'' + GREEK_SET + r']+$')
LETTER_RUN = re.compile(r'[A-Za-z]{2,}')
PAREN_PROMPT = re.compile(r'\(\s*[A-Za-z]{1,4}\s*=?\s*\)\s*=?')   # (V =)
PAREN_CALC  = re.compile(r'\([^()]*=\s*\)')                # (80 × 14 = )
MS_GROUP    = re.compile(r'\(\s*\d{3,}\s*\)')              # 40 (000)
MS_ELLIPSIS = re.compile(r'\.{2,}')                        # 50.28...
S1LD        = re.compile(r'[A-Za-z]\d')                    # v2/p2/T1/m1u1 sub-sup loss
S1ZEROLHS   = re.compile(r'^0\s*=')                        # 0 = ... (0^2 rearrangement)
MS_NEG    = re.compile(r'\(-\s*\d*\)')                # (-) / (-)14000 prompt
MS_DIGIT  = re.compile(r'\(\d\.\)')                   # (0.)70 digit prompt
MS_ROUND  = re.compile(r'\d\(\d\)')                   # 0.08(0) rounding alt
ABBREV    = re.compile(r'\be\.g\b|\bi\.e\b|\betc\b')

def line_class(line):
    s = line.strip()
    if not s:
        return 'empty', None
    core = s.rstrip(';').strip()
    if '=' not in core and '≈' not in core:
        return 'no-eq', None
    if S1X10.search(core):
        return 'S1-x10', None
    if S1NEGEXP.search(core):
        return 'S1-negexp', None
    if S1LD.search(core):
        return 'S1-subsup', None
    if S1LEADZERO.search(core):
        return 'S1-leadzero', None
    if S1ZEROLHS.match(core):
        return 'S1-zero-lhs', None
    if S1PARENSUP.search(core):
        return 'S1-parensup', None
    if S1SUVAT.search(core):
        return 'S1-suvat-shape', None
    if S1DECIMAL.search(core):
        return 'S1-decimal', None
    if S1FUNC.search(core):
        return 'S1-funcinv', None
    if MS_NEG.search(core) or MS_DIGIT.search(core) or MS_ROUND.search(core) \
            or MS_GROUP.search(core) or MS_ELLIPSIS.search(core) or PAREN_CALC.search(core):
        return 'ms-furniture', None
    if PAREN_PROMPT.search(core):
        return 'paren-prompt', None
    if UNIT_TAIL.search(core):
        return 'unit-tail', None
    if UNIT_PAREN.search(core):
        return 'unit-paren', None
    if ABBREV.search(core):
        return 'abbr', None
    if LETTER_RUN.search(core):
        return 'word-symbol', None
    if '√' in core and not re.search(r'√\s*\(', core):
        return 'sqrt-bare', None
    if core.count('(') != core.count(')'):
        return 'paren-imbalance', None
    if not CORE_CHARS.match(core):
        return 'foreign-char', None
    lhs, sep, rhs = core.partition('=') if '=' in core else core.partition('≈')
    if not lhs.strip() or not rhs.strip():
        return 'cont-line', None
    if not arith_ok(core):
        return 'arith-fail', None
    return 'CONVERT', core

def arith_ok(core):
    """F60-scanner doctrine: pure-numeric equation chains must be arithmetically true
    (1% tolerance). Returns False only when every token is numeric and a side fails."""
    sides = [x.strip() for x in core.split('=')]
    if len(sides) < 2:
        return True
    if any(re.search(r'[A-Za-z√½¼¾²³⁴°]', x) for x in sides):
        return True  # symbolic segments exempt
    def ev(x):
        x = re.sub(r'(?<=\d) (?=\d)', '', x)   # spaced thousands
        x = x.replace('×', '*').replace('÷', '/').replace('−', '-')
        if not re.fullmatch(r'[\d\s\+\-\*/\.\(\)]+', x):
            return None
        try:
            return eval(x, {'__builtins__': {}}, {})
        except Exception:
            return None
    vals = [ev(x) for x in sides]
    if any(v is None for v in vals):
        return True
    a, b = vals[0], vals[-1]
    if b == 0:
        return abs(a) < 1e-12
    return abs(a - b) / max(abs(b), 1e-12) <= 0.01

SQRT_RE = re.compile(r'√\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)')

def map_chars(s):
    pat = re.compile('|'.join(re.escape(c) for c in sorted(U2L, key=len, reverse=True)))
    out, pos = [], 0
    for m in pat.finditer(s):
        out.append(s[pos:m.start()])
        out.append(U2L[m.group(0)])
        pos = m.end()
    out.append(s[pos:])
    return ''.join(out)

def convert(core):
    body = SQRT_RE.sub(lambda m: r'\sqrt{' + map_chars(m.group(1)) + '}', core)
    body = map_chars(body)
    assert '√' not in body and '(' in body or '√' not in body
    body = re.sub(r'\s*=\s*', ' = ', body)
    body = re.sub(r'\s*≈\s*', r' \approx ', body)
    body = re.sub(r'\s{2,}', ' ', body).strip()
    body = body.replace('\\times (', '\\times (')  # no-op, clarity
    body = re.sub(r'\\(times|div|cdot|approx|le|ge|propto) (?=\S)', r'\\\1 ', body)
    body = re.sub(r'\\(alpha|beta|gamma|delta|varepsilon|eta|theta|kappa|lambda|mu|nu|'
                  r'pi|rho|sigma|tau|phi|chi|psi|omega|Omega|Pi|Sigma|Phi|Psi|Gamma|'
                  r'Lambda|Theta|Delta) (?=\S)', r'\\\1 ', body)
    return body

# ---- inverse map for the identity gate ----
INV = {v.strip(): k for k, v in U2L.items() if k != '·' and v.strip()}
INV[r'\frac{1}{2}'] = '½'
INV[r'\frac{1}{4}'] = '¼'
INV[r'\frac{3}{4}'] = '¾'
INV[r'^{2}'] = '²'
INV[r'^{3}'] = '³'
INV[r'^{4}'] = '⁴'
INV[r'^{-1}'] = '⁻¹'
INV[r'^{\circ}'] = '°'

def denorm(tex):
    s = tex.replace('$', '')
    s = re.sub(r'\\sqrt\{([^{}]*)\}', r'√(\1)', s)
    for lat in sorted(INV, key=len, reverse=True):
        s = s.replace(lat, INV[lat])
    s = s.replace('−', '-').replace('∙', '·').replace('\u0394', '\u2206')
    s = re.sub(r'\s+', ' ', s).strip().rstrip(';').strip()
    return s

def norm(s):
    return re.sub(r'\s+', ' ', s.replace('−', '-').replace('\u0394', '\u2206')).strip().rstrip(';').strip()

def fields(d):
    for e in d:
        for q in e.get('questions', []):
            for pi, pt in enumerate(q.get('parts', [])):
                for fld in ('problemMd', 'solutionMd'):
                    if pt.get(fld):
                        yield e, q, pi, pt, fld, None
                for ci, ch in enumerate(pt.get('choices') or []):
                    if isinstance(ch, dict) and ch.get('textMd'):
                        yield e, q, pi, pt, f'choice{ci}', ch
                for mi, mp in enumerate(pt.get('markPoints') or []):
                    if isinstance(mp, dict) and mp.get('textMd'):
                        yield e, q, pi, pt, f'mp{mi}', mp

def main():
    apply = '--apply' in sys.argv
    d = json.load(open(P))
    counts = collections.Counter()
    conversions, changed_fields, seg_universe = [], [], set()
    worklist = collections.Counter()
    worklist_samples = collections.defaultdict(list)

    for e, q, pi, pt, fldname, holder in fields(d):
        holder = holder if holder is not None else pt
        attr = 'textMd' if holder is not pt else fldname
        text = holder.get(attr)
        if not text or '$' in text:
            continue
        new_lines, changed = [], False
        for line in text.split('\n'):
            cls, core = line_class(line)
            if cls == 'CONVERT':
                body = convert(core)
                if not body or '$' in body:
                    counts['seg-anomaly'] += 1
                    new_lines.append(line)
                    continue
                seg = '$' + body + '$'
                suffix = ';' if line.strip().endswith(';') else ''
                new_lines.append(seg + suffix)
                conversions.append({'where': f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                                    'orig': line, 'latex': seg})
                seg_universe.add(body)
                changed = True
                counts['converted-lines'] += 1
            else:
                if cls not in ('empty', 'no-eq'):
                    worklist[cls] += 1
                    if len(worklist_samples[cls]) < 6:
                        worklist_samples[cls].append(
                            {'where': f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                             'line': line.strip()[:110]})
                new_lines.append(line)
        if changed:
            changed_fields.append((holder, attr, f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                                   text))
            holder[attr] = '\n'.join(new_lines)
            counts['changed-fields'] += 1

    print(f'converted lines : {counts["converted-lines"]}')
    print(f'changed fields  : {counts["changed-fields"]}')
    print(f'unique segments : {len(seg_universe)}')
    print('worklist (skip) census:')
    for k, v in worklist.most_common():
        print(f'  {k:18} {v}')

    if not apply:
        open('/tmp/segments.txt', 'w').write('\n'.join(sorted(seg_universe)))
        for k in list(worklist_samples)[:12]:
            print(f'--- {k} samples:')
            for s in worklist_samples[k][:4]:
                print(f'    [{s["where"]}] {s["line"]}')
        print('DRY RUN - no writes')
        return

    # ---------------- GATES ----------------
    head = subprocess.run(['git', '-C', REPO, 'show',
                           'HEAD:apps/hub/content/igcse-physics-19/official-papers.json'],
                          capture_output=True, text=True)
    odoc = json.loads(head.stdout)
    omap = {}
    for e, q, pi, pt, fldname, holder in fields(odoc):
        omap[f"{e['slug']}|{q['id']}|p{pi}|{fldname}"] = (holder if holder is not None else pt)

    # G1 structure + marks
    def census(doc):
        return (len(doc),
                sum(len(e.get('questions', [])) for e in doc),
                sum(len(q.get('parts', [])) for e in doc for q in e.get('questions', [])),
                [pt.get('marks') for e in doc for q in e.get('questions', [])
                 for pt in q.get('parts', [])])
    c_o, c_n = census(odoc), census(d)
    assert c_o[:3] == c_n[:3] and c_o[3] == c_n[3], 'structure/marks drift'
    print(f'G1 structure+marks: OK {c_n[:3]}')

    # G2 identity reconstruction per changed field
    for holder, attr, key, old in changed_fields:
        new_t = holder[attr]
        o = omap[key].get(attr)
        nl, ol = new_t.split('\n'), old.split('\n')
        assert len(nl) == len(ol), f'line count drift {key}'
        for a, b in zip(nl, ol):
            da, db = denorm(a).replace(' ', ''), norm(b).replace(' ', '')
            assert da == db, f'IDENTITY FAIL {key}\n  new: {a!r}\n  old: {b!r}'
    print(f'G2 identity reconstruction: OK ({len(changed_fields)} fields)')

    # G3 PUA / control: 0; U+FFFD: none NEW (pre-existing damage -> worklist)
    raw_new = json.dumps(d, indent=1, ensure_ascii=False)
    old_blob = head.stdout
    fffd_old, fffd_new = old_blob.count('\ufffd'), raw_new.count('\ufffd')
    assert fffd_new <= fffd_old, f'NEW U+FFFD introduced ({fffd_old} -> {fffd_new})'
    bad = [hex(ord(c)) for c in set(raw_new)
           if 0xE000 <= ord(c) <= 0xF8FF or (ord(c) < 32 and c != '\n')]
    assert not bad, f'PUA/control: {bad[:5]}'
    print(f'G3 PUA/control: OK (0) | U+FFFD: {fffd_old} pre-existing, 0 new (worklist)')

    # G4 raw-$ parity
    assert raw_new.count('$') % 2 == 0 and '\\$' not in raw_new
    print(f'G4 raw-$ parity: OK ({raw_new.count("$")} delimiter chars)')

    # G5 KaTeX throwOnError on every unique segment
    r = subprocess.run(['node', '-e', f'''
const k = require('{KATEX_JS}');
const segs = JSON.parse(process.argv[1]);
let fails = [];
for (const s of segs) {{
  try {{ k.renderToString(s, {{ throwOnError: true, displayMode: false }}); }}
  catch (e) {{ fails.push([s, String(e).slice(0, 120)]); }}
}}
console.log(JSON.stringify({{n: segs.length, fails}}));
''', json.dumps(sorted(seg_universe))], capture_output=True, text=True)
    res = json.loads(r.stdout)
    assert not res['fails'], f"katex failures: {res['fails'][:8]}"
    print(f"G5 katex throwOnError: OK ({res['n']} unique segments, 0 failures)")

    # G6 serialization byte-law
    assert json.dumps(json.loads(raw_new), indent=1, ensure_ascii=False) == raw_new
    print('G6 serialization byte-law: OK')

    with open(P, 'w') as f:
        f.write(raw_new)
    json.dump({'conversions': conversions, 'worklist': dict(worklist),
               'worklist_samples': {k: v for k, v in worklist_samples.items()},
               'unique_segments': sorted(seg_universe), 'counts': dict(counts)},
              open('/tmp/phys_katex_run001_payload.json', 'w'), indent=1, ensure_ascii=False)
    print('APPLIED -> payload /tmp/phys_katex_run001_payload.json')

if __name__ == '__main__':
    main()
