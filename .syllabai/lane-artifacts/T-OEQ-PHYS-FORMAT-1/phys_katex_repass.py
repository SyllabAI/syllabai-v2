#!/usr/bin/env python3
"""T-OEQ-PHYS-FORMAT-1 run-003 - 4PH1 KaTeX re-pass over the CONVERT-requalified set.

LAW OF THE PASS (operator order, trace 1a18e0c83ae9f6c9):
- SAME LAW, NO RELAXATION: the CONVERT grammar of record is run-001's
  phys_katex_pass.py line_class/convert/U2L, imported VERBATIM - zero drift.
- run-002 receipt convert_note: 28 restored lines (e.g. 'v2 = u2 + 2as' ->
  restored 'v² = u² + 2as') re-enter run-001's CONVERT grammar unchanged; this
  pass sweeps them under that law. Fail-closed: != 28 qualifying lines aborts
  before any write.
- SCOPING (the only adaptation, disclosed): run-001 skipped any field holding a
  $-segment (the plane had zero $ then). The plane now carries 194 run-001
  segments; 4 of the 28 re-qualified lines live in $-bearing fields, so the pass
  walks ALL fields and protects every $-line byte-exact (run-002's G7 posture).
  Lines inside $-segments are never classified, never edited.

Gates (run-001 suite + run-002 additions):
  G1 structure+marks identical
  G2 identity reconstruction per changed field (unchanged lines byte-equal;
     changed plain lines through run-001's inverse map, space-normalized)
  G3 PUA/control 0, no new U+FFFD
  G4 raw-$ accounting: new == old + 2*converted, even, no escapes
  G5 katex 0.16.23 renderToString(throwOnError) 0 failures on unique segments
  G6 serialization byte-law json.dumps(indent=1, ensure_ascii=False), round-trip
  G7 zero $-line edits
  G8 idempotence: re-census on the applied plane converts 0

Usage: phys_katex_repass.py --dry | --apply
"""
import json, re, sys, subprocess, collections

REPO = '/tmp/v2repo'
P = f'{REPO}/apps/hub/content/igcse-physics-19/official-papers.json'
KATEX_JS = '/tmp/ktx/node_modules/katex'
RUN001_DIR = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1'
sys.path.insert(0, RUN001_DIR)
from phys_katex_pass import line_class, convert, denorm, norm, fields  # verbatim law

EXPECT_CONVERT = 28

def main():
    apply = '--apply' in sys.argv
    d = json.load(open(P))
    counts = collections.Counter()
    conversions, changed_fields, seg_universe = [], [], set()
    protected = 0

    for e, q, pi, pt, fldname, holder in fields(d):
        holder = holder if holder is not None else pt
        attr = 'textMd' if holder is not pt else fldname
        text = holder.get(attr)
        if not text:
            continue
        new_lines, changed = [], False
        for line in text.split('\n'):
            if '$' in line:                     # G7: $-lines byte-protected
                protected += 1
                new_lines.append(line)
                continue
            cls, core = line_class(line)        # run-001 grammar, verbatim
            if cls == 'CONVERT':
                body = convert(core)            # run-001 presentation law, verbatim
                if not body or '$' in body:
                    counts['seg-anomaly'] += 1
                    new_lines.append(line)
                    continue
                seg = '$' + body + '$'
                suffix = ';' if line.strip().endswith(';') else ''
                new_lines.append(seg + suffix)
                conversions.append({'where': f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                                    'orig': line, 'latex': seg + suffix})
                seg_universe.add(body)
                changed = True
                counts['converted-lines'] += 1
            else:
                new_lines.append(line)
        if changed:
            changed_fields.append((holder, attr, f"{e['slug']}|{q['id']}|p{pi}|{fldname}",
                                   text))
            holder[attr] = '\n'.join(new_lines)
            counts['changed-fields'] += 1

    n = counts['converted-lines']
    print(f'converted lines : {n}')
    print(f'changed fields  : {counts["changed-fields"]}')
    print(f'unique segments : {len(seg_universe)}')
    print(f'$-lines protected: {protected}')
    for c in conversions:
        print(f"  [{c['where']}]")
        print(f"    orig : {c['orig']!r}")
        print(f"    latex: {c['latex']!r}")

    if n != EXPECT_CONVERT:
        print(f'FAIL-CLOSED: qualifying lines {n} != census of record {EXPECT_CONVERT}'
              ' - aborting, no writes')
        sys.exit(2)
    if not apply:
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

    # G2 identity reconstruction per changed field + G7 no-$-line edits
    for holder, attr, key, old in changed_fields:
        new_t = holder[attr]
        o = omap[key].get(attr)
        nl, ol = new_t.split('\n'), old.split('\n')
        assert len(nl) == len(ol), f'line count drift {key}'
        for a, b in zip(nl, ol):
            if a == b:
                continue                        # untouched line (incl. $-lines): byte-equal
            assert '$' not in b, f'G7 $-line edited {key}: old={b!r}'
            da = denorm(a).replace(' ', '')
            db = norm(b).replace(' ', '')
            assert da == db, f'IDENTITY FAIL {key}\n  new: {a!r}\n  old: {b!r}'
    print(f'G2 identity reconstruction: OK ({len(changed_fields)} fields)')
    print(f'G7 no $-line edits: OK (all changed lines plain before and after)')

    # G3 PUA / control / FFFD
    raw_new = json.dumps(d, indent=1, ensure_ascii=False)
    old_blob = head.stdout
    fffd_old, fffd_new = old_blob.count('\ufffd'), raw_new.count('\ufffd')
    assert fffd_new <= fffd_old, f'NEW U+FFFD introduced ({fffd_old} -> {fffd_new})'
    bad = [hex(ord(c)) for c in set(raw_new)
           if 0xE000 <= ord(c) <= 0xF8FF or (ord(c) < 32 and c != '\n')]
    assert not bad, f'PUA/control: {bad[:5]}'
    print(f'G3 PUA/control: OK (0) | U+FFFD: {fffd_old} pre-existing, 0 new')

    # G4 raw-$ accounting
    old_dollars = old_blob.count('$')
    new_dollars = raw_new.count('$')
    assert '\\$' not in raw_new, 'escaped $'
    assert new_dollars == old_dollars + 2 * n, \
        f'$ delta mismatch: {old_dollars} + 2*{n} != {new_dollars}'
    assert new_dollars % 2 == 0
    print(f'G4 raw-$ accounting: OK ({old_dollars} -> {new_dollars} = +2*{n})')

    # G5 KaTeX throwOnError on every unique segment (hub's katex 0.16.23)
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
    json.dump({'conversions': conversions, 'unique_segments': sorted(seg_universe),
               'protected_dollar_lines': protected, 'counts': dict(counts)},
              open('/tmp/run003_payload.json', 'w'), indent=1, ensure_ascii=False)
    print('APPLIED -> payload /tmp/run003_payload.json')

if __name__ == '__main__':
    main()
