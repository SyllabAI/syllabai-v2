#!/usr/bin/env python3
"""run-004 apply - page-evidenced restorations onto the serving plane + gates.

Phase A: 38 net-restore targets (census records via mirror law) + the disclosed
$s = 652 / 26$ -> $s = 65^{2} / 26$ segment-interior repair (page evidence:
raised 2 after 65, 26 flat; run-001's G7 exception class, explicitly allow-listed).
Phase B: CONVERT re-census (run-001 line_class verbatim, all fields, $-protected);
any re-qualified line sweeps under run-001's convert law (verbatim import),
fail-closed at the exact count, katex-gated.
"""
import json, re, sys, subprocess, collections

sys.path.insert(0, '/tmp/v2repo/.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1')
sys.path.insert(0, '/home/z/my-project/scripts')
from run004_engine import FLAT_MAP, get_pdf
from run004_engine import adjudicate_line  # G8 re-adjudication
from phys_katex_pass import line_class, convert, denorm, norm as norm001, fields  # run-001/003 law

P = '/tmp/v2repo/apps/hub/content/igcse-physics-19/official-papers.json'
KATEX_JS = '/tmp/ktx/node_modules/katex'
REJECT = [('official-4ph1-2pr-2025-06', 'The coefficient of restitution')]
SEG652_WHERES = {'official-4ph1-1pr-2025-06|offq_2025-06_1pr_6|p1|solutionMd',
                 'official-4ph1-1pr-2025-06|offq_2025-06_1pr_6|p1|mp0'}

DASH = str.maketrans({'\u2212': '-', '\u2013': '-', '\u2010': '-', '\u2011': '-'})

def flatnorm(s):
    return re.sub(r'\s+', ' ', s.translate(FLAT_MAP).translate(DASH)).strip().rstrip(';').strip()

def main():
    d = json.load(open(P))
    adj = json.load(open('/tmp/run004_adjudication.json'))
    recs = json.load(open('/tmp/run004_worklist_raw.json'))

    # target map: (slug, kind, line) -> verdict + net props
    tmap = {}
    for r in adj:
        key = (r['slug'], r['kind'], r['line'])
        net = [p for p in r.get('props', []) if p[1] != p[2]] if r['verdict'] == 'RESTORE' else []
        tmap[key] = (r['verdict'], net)

    rejected = lambda slug, line: any(slug == s and line.startswith(pfx) for s, pfx in REJECT)

    # plane field index
    plane = {}
    for e, q, pi, pt, fldname, holder in fields(d):
        key = f"{e['slug']}|{q['id']}|p{pi}|{fldname}"
        attr = fldname if holder is None else 'textMd'
        plane[key] = (pt if holder is None else holder, attr)

    # ---- Phase A: apply net restorations per census record ----
    applied, changed_fields = [], set()
    seg652_repaired = []
    stats = collections.Counter()
    for cls, where, line in recs:
        slug = where.split('|')[0]
        fld = where.split('|')[3]
        kind = 'qp' if fld == 'problemMd' else 'ms'
        verdict, net = tmap.get((slug, kind, line), (None, []))
        if verdict != 'RESTORE' or not net or rejected(slug, line):
            continue
        if where in SEG652_WHERES:
            continue                       # handled explicitly below
        holder, attr = plane[where]
        text = holder[attr]
        lines = text.split('\n')
        hit = False
        for li, l in enumerate(lines):
            if l != line:
                continue
            chars = list(l)
            ok = all(chars[rp] == old for rp, old, new, c_, v_ in net)
            assert ok, f'position drift {where}: {l!r}'
            for rp, old, new, c_, v_ in net:
                chars[rp] = new
            lines[li] = ''.join(chars)
            applied.append({'where': where, 'before': l, 'after': lines[li],
                            'net': [(rp, o, n) for rp, o, n, _, _ in net]})
            hit = True
            stats['restored-lines'] += 1
        assert hit, f'census line not found in field {where}: {line!r}'
        new_text = '\n'.join(lines)
        if new_text != text:
            holder[attr] = new_text
            changed_fields.add(where)
            stats['changed-fields'] += 1

    # ---- Phase A2: the disclosed 652/26 segment-interior repair ----
    for where in sorted(SEG652_WHERES):
        holder, attr = plane[where]
        text = holder[attr]
        old_seg = '$s = 652 / 26$'
        new_seg = '$s = 65^{2} / 26$'
        assert old_seg in text, f'652 segment missing in {where}'
        holder[attr] = text.replace(old_seg, new_seg)
        seg652_repaired.append({'where': where, 'before': old_seg, 'after': new_seg})
        stats['seg652-repairs'] += 1

    print(f"phase A: {stats['restored-lines']} restored lines / "
          f"{stats['changed-fields']} changed fields / {stats['seg652-repairs']} seg652 repairs")

    # ---- Phase B: CONVERT re-census + sweep under run-001 law ----
    conv = []
    conv_fields = set()
    for e, q, pi, pt, fldname, holder in fields(d):
        h = holder if holder is not None else pt
        attr = 'textMd' if h is not pt else fldname
        text = h.get(attr)
        if not text:
            continue
        new_lines, changed = [], False
        for line in text.split('\n'):
            if '$' in line:
                new_lines.append(line)
                continue
            cls, core = line_class(line)
            if cls == 'CONVERT':
                body = convert(core)
                seg = '$' + body + '$'
                suffix = ';' if line.strip().endswith(';') else ''
                new_lines.append(seg + suffix)
                conv.append({'where': f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                             'orig': line, 'latex': seg + suffix})
                changed = True
            else:
                new_lines.append(line)
        if changed:
            h[attr] = '\n'.join(new_lines)
            conv_fields.add(f"{e['slug']}|{q['id']}|p{pi}|{fldname}")
    print(f'phase B: {len(conv)} CONVERT-requalified lines swept / {len(conv_fields)} fields')

    # ---------------- GATES ----------------
    head = subprocess.run(['git', '-C', '/tmp/v2repo', 'show',
                           'HEAD:apps/hub/content/igcse-physics-19/official-papers.json'],
                          capture_output=True, text=True)
    odoc = json.loads(head.stdout)
    omap = {}
    for e, q, pi, pt, fldname, holder in fields(odoc):
        omap[f"{e['slug']}|{q['id']}|p{pi}|{fldname}"] = (holder if holder is not None else pt)

    def census(doc):
        return (len(doc),
                sum(len(e.get('questions', [])) for e in doc),
                sum(len(q.get('parts', [])) for e in doc for q in e.get('questions', [])),
                [pt.get('marks') for e in doc for q in e.get('questions', [])
                 for pt in q.get('parts', [])])
    c_o, c_n = census(odoc), census(d)
    assert c_o[:3] == c_n[:3] and c_o[3] == c_n[3], 'structure/marks drift'
    print(f'G1 structure+marks: OK {c_n[:3]}')

    # G2 identity: every changed field line-by-line (phase A: flat-normalized;
    # phase B: run-001 denorm composed with flat-normalization)
    def ident(s):
        t = denorm(s) if '$' in s else s
        return flatnorm(t)
    n_id = 0
    for key in sorted(set(changed_fields) | conv_fields):
        holder, attr = plane[key]
        o = omap[key].get(attr)
        nl = holder[attr].split('\n')
        ol = o.split('\n')
        assert len(nl) == len(ol), f'line count drift {key}'
        for a, b in zip(nl, ol):
            if a == b:
                continue
            if key in SEG652_WHERES and a == '$s = 65^{2} / 26$' and b == '$s = 652 / 26$':
                n_id += 1
                continue
            assert '$' not in b, f'G7 $-line edited {key}: {b!r}'
            da = ident(a)
            db = ident(b)
            assert da == db, f'IDENTITY FAIL {key}\n  new: {a!r}\n  old: {b!r}'
            n_id += 1
    print(f'G2 identity reconstruction: OK ({n_id} changed lines incl. seg652 allow-list)')

    raw_new = json.dumps(d, indent=1, ensure_ascii=False)
    old_blob = head.stdout
    fffd_old, fffd_new = old_blob.count('\ufffd'), raw_new.count('\ufffd')
    assert fffd_new <= fffd_old, f'NEW U+FFFD ({fffd_old} -> {fffd_new})'
    bad = [hex(ord(c)) for c in set(raw_new)
           if 0xE000 <= ord(c) <= 0xF8FF or (ord(c) < 32 and c != '\n')]
    assert not bad, f'PUA/control: {bad[:5]}'
    print(f'G3 PUA/control: OK (0) | U+FFFD: {fffd_old} pre-existing, 0 new')

    old_dollars, new_dollars = old_blob.count('$'), raw_new.count('$')
    assert '\\$' not in raw_new and new_dollars == old_dollars + 2 * len(conv) \
        and new_dollars % 2 == 0, f'$ drift {old_dollars} -> {new_dollars} vs +2*{len(conv)}'
    # segment delta = the disclosed 652 interior pair + the phase-B new segments
    def segs(doc):
        out = []
        for e, q, pi, pt, fldname, holder in fields(doc):
            h = holder if holder is not None else pt
            attr = fldname if holder is None else 'textMd'
            t = h.get(attr)
            if t:
                out.extend(re.findall(r'\$[^$\n]+\$', t))
        return collections.Counter(out)
    osegs, nsegs = segs(odoc), segs(d)
    added = set(nsegs - osegs)
    removed = set(osegs - nsegs)
    conv_segs = {c['latex'][:c['latex'].rindex('$') + 1] for c in conv}
    assert removed <= {'$s = 652 / 26$'}, f'unexpected removed segments: {list(removed)[:5]}'
    assert added <= conv_segs | {'$s = 65^{2} / 26$'}, f'unexpected added segments: {list(added - conv_segs)[:5]}'
    assert all(nsegs[s] in (1, 2) for s in added), \
        'new segment count outside mirror law (1=qp-only, 2=solutionMd+mp0)'
    print(f'G4 $ accounting: OK ({old_dollars} -> {new_dollars} = +2*{len(conv)} phase-B; '
          f'segment delta = 652 pair + {len(conv)} new CONVERT segments)')

    seg_universe = [s[1:-1] for s in set(nsegs) - set(osegs)]
    if seg_universe:
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
        print(f"G5 katex throwOnError: OK ({res['n']} new/changed segments, 0 failures)")
    else:
        print('G5 katex: no new segments')

    assert json.dumps(json.loads(raw_new), indent=1, ensure_ascii=False) == raw_new
    print('G6 serialization byte-law: OK')

    # G7: old side of every change must be $-free (allow-list = 2 disclosed interiors);
    # the new side carries $ only where phase B created it
    for key in sorted(set(changed_fields) | conv_fields):
        if key in SEG652_WHERES:
            continue
        holder, attr = plane[key]
        for a, b in zip(holder[attr].split('\n'), omap[key].get(attr).split('\n')):
            if a == b:
                continue
            assert '$' not in b, f'G7 violation {key}: old={b!r}'
    print('G7 $-line protection: OK (allow-list = 2 disclosed 652 interiors)')

    with open(P, 'w') as f:
        f.write(raw_new)
    json.dump({'phaseA_applied': applied, 'phaseA_stats': dict(stats),
               'seg652_repaired': seg652_repaired, 'phaseB_conversions': conv,
               'phaseB_unique_segments': sorted({c['latex'][1:-1] for c in conv})},
              open('/tmp/run004_apply_payload.json', 'w'), indent=1, ensure_ascii=False)
    print('APPLIED -> payload /tmp/run004_apply_payload.json')

if __name__ == '__main__':
    main()
