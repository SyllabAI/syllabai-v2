#!/usr/bin/env python3
r"""T-OEQ-MATHSB-SERVE-1 run-022: F1-F3 structural repairs — boundary extraction
module (imported by run022_apply.py).

Adjudication of record (all print-anchored, NO-GUESS):
  F1  offp_2023-06_02_8   solutionMd = genuine q8 block (p13 start row, p14
      'Total 7 marks' close) FUSED with q9(a) rows (p14, 3 marks) + q9(b) rows
      (p14 main + p15 ALT, 5 marks).
        - q8     := genuine block only; markPoints[0] mirrors (7 marks).
        - 9-b    := q9(b) portion re-homed verbatim (replaces the
                    'not captured' stub; 0 markPoints rows per RATTACH
                    solutionMd-only attach convention, plane precedent
                    offp_2021-06_02_4-b-i).
        - q9(a)  := discarded per the run-020 F1 filing (9-a carries its own
                    rebuilt solution + 3 markPoints rows; SC/allow notes
                    covered by the of-record rebuilt presentation).
  F2  offp_2021-06_02_9-b solutionMd = true 2-mark B1ft block (p16) FUSED with
      a foreign blob = q10(b) MS block from 'FB = 9.8' (p20 A1 row) through the
      Method II close '24.0466585...' (p24 'Total 10 marks' row precedes it in
      print; Total line not carried by the text layer) + a 2-line fragment of
      q11(a)'s first note row (p25: 'M1 for calculating AC or AB ... must
      simplify to' — truncated; the print's continuation 'AC cos 35 = 4 or AB
      cos 35 = 4' is exactly what the 11-a carrier opens with).
        - 9-b  := true block; markPoints[0] mirrors (2 marks).
        - 10-b := q10(b) portion re-homed verbatim (replaces stub; 0
                  markPoints rows, RATTACH convention).
        - 11-a := q11(a) fragment prepended verbatim (reunites the row;
                  markPoints[0] mirrors — 11-a carries 1 mp row).
  F3  offp_2026-06_01r_18 — NO-OP: the run-020 'raw pdftotext-flatten
      duplicate of ALT1' is NOT present at any pin (C132 byte-match at the
      t3-sync state, byte-identical pre-run-020 plane 701ae199, zero duplicate
      signatures in the current field). Receipt corrects the run-020 filing.

Byte-integrity law: old fields decompose EXACTLY into the moved pieces
(genuine + sep + q9a + sep + q9b etc.) — nothing is dropped or invented.
"""
import json

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'

STUB = ('*The official mark scheme line for this part was not captured by the '
        'digitised extraction \u2014 treat the worked values above the line with care '
        'and check against the paper\'s own mark scheme.*')


def load():
    data = json.load(open(PLANE))
    index = {}
    for si, s in enumerate(data):
        for qi, q in enumerate(s['questions']):
            for pi, p in enumerate(q['parts']):
                index[p['id']] = (si, qi, pi, s, q)
    return data, index


def one(text, sig):
    n = text.count(sig)
    assert n == 1, f'signature count {n} != 1 for {sig[:60]!r}'
    return text.index(sig)


def build():
    """Return (ops, evidence) where ops maps pid -> new solutionMd, plus the
    byte-decomposition proofs."""
    data, index = load()
    ev = {}

    def sol(pid):
        return data[index[pid][0]]['questions'][index[pid][1]]['parts'][index[pid][2]]['solutionMd']

    # ---------------- F1: 2023-06 02 q8 / 9-a / 9-b ----------------
    q8_old = sol('offp_2023-06_02_8')
    i_9a = one(q8_old, '\n9(a) ')
    q8_new = q8_old[:i_9a]
    assert q8_new.endswith('Total 7 marks'), 'q8 genuine block must close with Total 7 marks'
    tail = q8_old[i_9a + 1:]                      # drop the leading '\n'
    j_9b = one(tail, '\n( 2 x \u2212 3) 5 B1')
    q9a_portion = tail[:j_9b]
    q9b_portion = tail[j_9b + 1:]
    assert q9a_portion.startswith('9(a) 3 ( \u22124 )\u00b3'), 'q9(a) portion head'
    assert 'SC a = 8 and b = \u221216' in q9a_portion, 'q9(a) portion SC row'
    assert q9b_portion.startswith('( 2 x \u2212 3) 5 B1'), 'q9(b) portion head'
    assert q9b_portion.endswith('ignore subsequent changes to decimal form if exact form seen'), 'q9(b) portion tail (p15 ALT close)'
    assert 'ALT' in q9b_portion and '8x2 \u2212 6 x \u2212 4' in q9b_portion, 'q9(b) ALT rows present'
    # byte decomposition: old q8 == genuine + '\n' + q9a + '\n' + q9b
    assert q8_old == q8_new + '\n' + q9a_portion + '\n' + q9b_portion, 'F1 byte decomposition'
    ev['F1'] = {
        'q8_old_len': len(q8_old), 'q8_new_len': len(q8_new),
        'q9a_discarded_len': len(q9a_portion), 'q9b_rehomed_len': len(q9b_portion),
    }

    b_9b_2023 = sol('offp_2023-06_02_9-b')
    assert b_9b_2023 == STUB, '2023 9-b must be the stub before repair'
    assert not (data[index['offp_2023-06_02_9-b'][0]]['questions'][index['offp_2023-06_02_9-b'][1]]
                ['parts'][index['offp_2023-06_02_9-b'][2]].get('markPoints')), '2023 9-b must have 0 mp rows'

    # ---------------- F2: 2021-06 02 9-b / 10-b / 11-a ----------------
    p9b_old = sol('offp_2021-06_02_9-b')
    k_blob = one(p9b_old, '\nFB = 9.8')
    true_block = p9b_old[:k_blob]
    blob = p9b_old[k_blob + 1:]
    assert true_block.startswith('(\u22122,1) , (\u22121,3) , ( 2,1) B1ft') or true_block.startswith('( \u22122,1)'), 'true block head (p16 B1ft rows)'
    assert true_block.count('B1ft') == 2, 'true block = 2 B1ft rows (p16: 2 marks)'
    # q10(b) / q11(a) split: LAST '24.0466585\u2026' closes Method II Case 3 (p24)
    m_end = blob.rindex('24.0466585\u2026')
    nl_after = blob.index('\n', m_end)
    q10b_portion = blob[:nl_after]
    q11_fragment = blob[nl_after + 1:]
    assert q10b_portion.startswith('FB = 9.8'), 'q10(b) portion head (p20 A1 row)'
    assert q10b_portion.endswith('24.0466585\u2026'), 'q10(b) portion close (p24 Method II Case 3 A1 row)'
    assert 'Method II: Finding BD or AB using trigonometry' in q10b_portion, 'Method II preamble carried'
    assert q11_fragment == ('M1 for calculating AC or AB - note that use of cosine rule\n'
                            '4 AB 2 = AC 2 + 82 \u2212 2 ( 8)( AC ) cos 35 with AB = AC must simplify to'), \
        'q11(a) fragment = p25 first-row note lines 1-2 (verbatim)'
    # byte decomposition: old 9-b == true block + '\n' + q10(b) + '\n' + q11 fragment
    assert p9b_old == true_block + '\n' + q10b_portion + '\n' + q11_fragment, 'F2 byte decomposition'
    ev['F2'] = {
        'true_block_len': len(true_block), 'q10b_rehomed_len': len(q10b_portion),
        'q11_fragment_len': len(q11_fragment), 'old_len': len(p9b_old),
    }

    p10b_old = sol('offp_2021-06_02_10-b')
    assert p10b_old == STUB, '2021 10-b must be the stub before repair'
    p11a_old = sol('offp_2021-06_02_11-a')
    assert p11a_old.startswith('AC = ( AB = )'), '11-a carrier head (p25 working + note continuation)'
    assert not (data[index['offp_2021-06_02_10-b'][0]]['questions'][index['offp_2021-06_02_10-b'][1]]
                ['parts'][index['offp_2021-06_02_10-b'][2]].get('markPoints')), '2021 10-b must have 0 mp rows'
    mp11 = data[index['offp_2021-06_02_11-a'][0]]['questions'][index['offp_2021-06_02_11-a'][1]] \
                ['parts'][index['offp_2021-06_02_11-a'][2]]['markPoints']
    # 11-a pre-apply mirror drift of record: mp[0] carries the same block with
    # tall-paren control-glyph variants the LATEX-1 lineage stripped from
    # solutionMd (43 ch delta).  Lockstep mirror normalization disclosed.
    assert len(mp11) == 1, '11-a must carry exactly 1 mp row'
    ev['F2']['mp11_pre_mirror_drift_ch'] = len(mp11[0]['textMd']) - len(p11a_old)
    ev['F2']['mp11_pre_mirror_equal'] = mp11[0]['textMd'] == p11a_old

    # ---------------- new field values ----------------
    ops = {
        'offp_2023-06_02_8': q8_new,                                  # truncate + mirror
        'offp_2023-06_02_9-b': q9b_portion,                           # attach, no mirror (0 rows)
        'offp_2021-06_02_9-b': true_block,                            # truncate + mirror
        'offp_2021-06_02_10-b': q10b_portion,                         # attach, no mirror (0 rows)
        'offp_2021-06_02_11-a': q11_fragment + '\n' + p11a_old,       # prepend + mirror
    }
    ev['F3'] = {'disposition': 'NO-OP (see module docstring)'}
    return ops, ev


if __name__ == '__main__':
    ops, ev = build()
    print(json.dumps(ev, indent=1))
    for pid, new in ops.items():
        print(f'{pid}: new solutionMd {len(new)} ch | head={new[:60]!r} | tail={new[-60:]!r}')
