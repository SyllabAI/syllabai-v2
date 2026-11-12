#!/usr/bin/env python3
"""RN-DEBRIS-11 run-022 — per-option mechanical apply deltas (DRY-RUN, zero bytes applied).

For each still-open filing item (D3/D4/D5/D6b) and each filed option, computes the
exact mechanical delta of record: node surgery, dense-order renumber, per-section
ord-gate re-validation (port of the kg_export pointOrd gate), tag re-point maps,
prerequisite re-anchor maps, and KG/manifest/index count deltas.
The desk picks options; run-023 executes the chosen combination mechanically.
"""
import json, copy, re
from pathlib import Path

ROOT = Path('/home/z/my-project/work/rn22/clone')
ART = Path('/home/z/my-project/work/rn22')
CS = 'cie-igcse-computer-science-23'
P1A = 'cie-a-level-maths-20-pure-1'
P1S = 'cie-as-maths-20-pure-1'

def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8'))

def _ord_key(pid: str):
    """Port of kg_export v1.7 pointOrd gate (per-section listing-order law)."""
    head = pid.split(".", 1)[0] if "." in pid else pid
    parts = pid.split(".")
    nums, letter = [], ""
    for i, comp in enumerate(parts):
        if i == 0 and comp == head and len(parts) > 1:
            nums.append(float(comp)); continue
        m = re.match(r"^(\d+)([A-Za-z]*)$", comp)
        if m:
            nums.append(float(m.group(1))); letter = m.group(2) or letter
        else:
            try: nums.append(float(comp.rstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")))
            except ValueError: nums.append(0.0)
    return tuple(nums) + (letter,)

def dense_renumber(nodes):
    """Dense per-course law: SPEC_POINT order = 1-based array position."""
    i = 0
    for n in nodes:
        if n['family'] == 'SPEC_POINT':
            i += 1; n['order'] = i
    return nodes

def ord_gate_ok(nodes):
    """Per-section strict ID-numeric listing order (exporter gate port)."""
    pts = [n['code'] for n in nodes if n['family'] == 'SPEC_POINT']
    by_sec = {}
    for c in pts:
        by_sec.setdefault(c.split('.')[0], []).append(c)
    for sec, codes in by_sec.items():
        ords = [_ord_key(c) for c in codes]
        if ords != sorted(ords) or len(set(ords)) != len(ords):
            return False, sec
    return True, None

def simulate(cur, remove=(), recode=None, retitle=None, move_after=None):
    """Deep-copy surgery; returns (new_nodes, summary). remove: codes; recode: (old,new,after_code);
    retitle: (code,new_title); move_after: (code, after_code) array move."""
    nodes = copy.deepcopy(cur['nodes'])
    removed = []
    for c in remove:
        hit = [n for n in nodes if n['code'] == c]
        assert len(hit) == 1, f'remove {c}: {len(hit)} hits'
        nodes.remove(hit[0]); removed.append(c)
    if retitle:
        code, nt = retitle
        for n in nodes:
            if n['code'] == code: n['title'] = nt
    if recode:
        old, new, after = recode
        idx = [i for i, n in enumerate(nodes) if n['code'] == old]
        assert len(idx) == 1, f'recode {old}: {len(idx)} hits'
        n = nodes.pop(idx[0]); n['code'] = new
        ai = [i for i, x in enumerate(nodes) if x['code'] == after]
        assert len(ai) == 1, f'after {after}: {len(ai)} hits'
        nodes.insert(ai[0] + 1, n)
    if move_after:
        code, after = move_after
        idx = [i for i, n in enumerate(nodes) if n['code'] == code]
        assert len(idx) == 1
        n = nodes.pop(idx[0])
        ai = [i for i, x in enumerate(nodes) if x['code'] == after]
        assert len(ai) == 1
        nodes.insert(ai[0] + 1, n)
    dense_renumber(nodes)
    ok, bad = ord_gate_ok(nodes)
    pts = [n for n in nodes if n['family'] == 'SPEC_POINT']
    # order-field survivors delta summary
    old_orders = {n['code']: n['order'] for n in cur['nodes'] if n['family'] == 'SPEC_POINT'}
    new_orders = {n['code']: n['order'] for n in nodes if n['family'] == 'SPEC_POINT'}
    bumps = {c: (old_orders[c], new_orders[c]) for c in new_orders
             if c in old_orders and old_orders[c] != new_orders[c]}
    return nodes, {'removed': removed, 'pointsAfter': len(pts), 'ordGateOK': ok, 'ordGateSection': bad,
                   'orderBumps': bumps,
                   'newArrivals': [c for c in new_orders if c not in old_orders]}

def tag_refs(codes, slug):
    qs = load(f'apps/hub/content/{slug}/questions.json')
    out = []
    for s in qs:
        for q in s.get('questions', []):
            for p in q.get('parts', []):
                hit = set(codes) & set(p.get('specPointCodes') or [])
                if hit:
                    out.append({'set': s.get('slug'), 'question': q.get('id'), 'part': p.get('id'),
                                'hit': sorted(hit), 'allCodes': list(p.get('specPointCodes') or [])})
    return out

def main():
    cur = load(f'apps/hub/content/{CS}/curriculum.json')
    res = {'artifact': 'rn11-run-022-option-deltas-r0',
           'law': 'DRY-RUN deltas only; zero content bytes; order law = dense per-course renumber + exporter pointOrd gate port; byte-pins from the run-017 census of record'}
    census17 = json.loads((ART / 'run-017_official_0478_census_r0.json').read_text())

    out = {}
    # ---- D3 ----
    off_f = census17['subRows']['8.1.4f']
    off_814 = census17['rows']['8.1.4']['official']
    _, d31 = simulate(cur, recode=('8.1.1a', '8.1.4f', '8.1.4'))
    _, d32 = simulate(cur, remove=('8.1.1a',), retitle=('8.1.4', off_814))
    out['D3'] = {
        'opt1_recocode_8_1_4f': {**d31,
            'tagRepoints': 'none needed (0 q/fc/note refs on 8.1.1a — census r0)',
            'prereqReanchor': {'C47-CON-OPERATORS': ['8.1.1a -> 8.1.4f (same-change)']},
            'titlePin': off_f, 'titlePinSource': 'run-017 census subRows[8.1.4f]',
            'manifestDelta': 'specPoints 114 -> 114 (no census change)',
            'kgDelta': 'point node id p:8.1.1a -> p:8.1.4f; pointSubtopics bucket 8a member re-id; hier edge re-target; counts unchanged'},
        'opt2_fold_into_8_1_4': {**d32,
            'tagRepoints': 'none needed (0 refs on 8.1.1a)',
            'prereqReanchor': {'C47-CON-OPERATORS': ['8.1.1a -> 8.1.4 (same-change)']},
            'titlePin': off_814, 'titlePinSource': "run-017 census rows['8.1.4'].official (the doc-verbatim (a)-(f) blob)",
            'manifestDelta': f"specPoints 114 -> {d32['pointsAfter']}",
            'kgDelta': f"-1 point node, -1 hier edge; nodes 146->{146-1}; points 114->{d32['pointsAfter']}"},
        'opt3_retain': {'deltas': 'none; provenance note only (the mis-map stays disclosed)'},
    }

    # ---- D4 (post-run-021 live options) ----
    six = ['6.3.4a', '6.3.5', '6.3.6', '6.3.7', '6.3.8', '6.3.9']
    _, d41 = simulate(cur, remove=tuple(six))
    # byte-exact 1:1 re-point classes (from census r0 byte-equality verdicts)
    map1to1 = {'6.3.4a': '7.4', '6.3.6': '7.6', '6.3.7': '7.7', '6.3.8': '7.8', '6.3.9': '7.9'}
    refs = {}
    for c in six:
        r = tag_refs([c], CS)
        refs[c] = {'parts': len(r), 'flashcards': sum(1 for f in load(f'apps/hub/content/{CS}/flashcards.json') if f.get('specPointCode') == c),
                   'notes': sum(1 for n in load(f'apps/hub/content/{CS}/notes.json') if c in (n.get('specPointCodes') or [])),
                   'otherCodesOnTaggedParts': sorted({x for rr in r for x in rr['allCodes'] if x != c})}
    out['D4'] = {
        'filingOpt1_reparent_in_place': {'status': 'MOOT post-run-021 (computed): the six carriers are byte-equal to the LANDED official 7.4/7.5a/7.5b/7.6-7.9 (census r0 D4 verdicts incl. the 6.3.5 blob-component splits); in-place re-parenting would duplicate rows that already exist under T7'},
        'opt1_remove6_repoin_reanchor': {**d41,
            'tagRepoints_1to1_byteExact': map1to1,
            'tagRepoints_splitClass_6_3_5': 'tags on 6.3.5 map to the LANDED PAIR 7.5a/7.5b (the blob split) — per-tag component disposition (a-vs-b) is a judgment class, desk/lane to assign per item at run-023',
            'tagRefCounts': refs,
            'prereqReanchor': {'C47-CON-VALIDATION-TYPES': '6.3.5 -> 7.5a (component discipline disclosed)',
                               'C47-CON-TEST-DATA': '6.3.6 -> 7.6', 'C47-CON-TRACE-TABLE': '6.3.7 -> 7.7',
                               'C47-CON-ERROR-IDENTIFICATION': '6.3.8 -> 7.8',
                               'C47-CON-ALGORITHM-WRITE-AMEND': '6.3.9 -> 7.9'},
            'manifestDelta': f"specPoints 114 -> {d41['pointsAfter']}",
            'kgDelta': f"-6 point nodes, -6 hier edges; nodes 146->140; projected pre/rel edges re-target via the re-anchored concepts (counts stable)"},
        'opt2_retain_disclose': {'deltas': 'none; the duplication of record stays disclosed (six carriers vs landed 7.4-7.9)'},
    }

    # ---- D5 ----
    four = ['6.3.1a', '6.3.2a', '6.3.3a', '6.3.4']
    _, d51 = simulate(cur, remove=tuple(four))
    refs5 = {c: tag_refs([c], CS) for c in four}
    out['D5'] = {
        'opt1_remove4_reanchor3': {**d51,
            'tagRepoints': {'6.3.1a': 'none (0 refs)', '6.3.2a': 'none (0 refs)', '6.3.3a': 'none (0 refs)',
                            '6.3.4': f"{len(refs5['6.3.4'])} q-part refs + note refs — re-point targets desk-owned (the advisory is not an outcome row); tagged parts' other codes: see census r0"},
            'tagRefCounts_6_3_4': {'parts': len(refs5['6.3.4']),
                                   'otherCodesOnTaggedParts': sorted({x for rr in refs5['6.3.4'] for x in rr['allCodes'] if x != '6.3.4'})},
            'prereqReanchor': {'C47-CON-FLOWCHART-SYMBOLS': '6.3.1a -> desk pick (candidates: 7.9 — the only corpus row whose official title carries flowchart-symbol content alongside pseudocode/program code)',
                               'C47-CON-LOGIC-GATE-SYMBOLS': '6.3.2a -> 10.1 ("Identify and use the standard symbols for logic gates" — byte-semantic match)',
                               'C47-CON-PSEUDOCODE-FORMAT': '6.3.3a -> desk pick (candidate: 7.9 — pseudocode carried in its official title)'},
            'manifestDelta': f"specPoints 114 -> {d51['pointsAfter']}",
            'kgDelta': f"-4 point nodes, -4 hier edges; nodes 146->142; the 3 concepts survive with re-anchored edges"},
        'opt2_refile_metadata': {'deltas': 'zero corpus-plane bytes; requires the kg_export v1.8 metadata-class shape decision (exporter code-change run, desk territory per the D1 precedent); codes preserved, points-census excluded',
                                 'sketch': 'non-point doc-verbatim rows project to a meta block (e.g. meta.appendixPointers[]) NOT to points[]; pointSubtopics/prereq anchors re-surface onto the metadata class or re-anchor per opt1'},
        'opt3_retain': {'deltas': 'none; provenance note only'},
    }

    # ---- D6b (pure-1 pair) ----
    for slug, key in ((P1A, 'aLevel'), (P1S, 'asLevel')):
        cur1 = load(f'apps/hub/content/{slug}/curriculum.json')
        _, dd = simulate(cur1, remove=('1.3.1a', '1.3.2a'))
        out.setdefault('D6b', {})[key] = {**dd,
            'tagRepoints': 'none (0 q/fc/note refs on both codes — census r0)',
            'prereqReanchor': {'MAP1-CON-LINE-EQUATION': '1.3.1a -> 1.3.1 (the dedicated official row, byte-semantic)',
                               'MAP1-CON-CIRCLE-EQUATION': '1.3.2a -> 1.3.3 (the landed dedicated row, byte-semantic)'},
            'manifestDelta': f"specPoints 36 -> {dd['pointsAfter']}",
            'kgDelta': f"-2 point nodes, -2 hier edges per course; index P5 re-census x2",
            'residualProof': 'the 1.3.2a blob carries ONLY fragments of official 1.3.3/1.3.4/1.3.5 (landed dedicated rows, run-020) + corrupted-spacing debris; zero unique official 1.3.2 content (dedicated row 1.3.2 carries it byte-exact per run-018 titleMap)'}

    # ---- combined D4opt1+D5opt1 ----
    _, dc = simulate(cur, remove=tuple(six + four))
    out['combined_D4opt1_plus_D5opt1'] = {**dc,
        'manifestDelta': f"specPoints 114 -> {dc['pointsAfter']}",
        'kgDelta': f"-10 point nodes, -10 hier edges; nodes 146->136; SUB6.3 then = exactly official 6.3.1-6.3.3"}
    res['options'] = out

    # global sanity: baseline ord gate + dense law hold on the untouched tree
    ok0, bad0 = ord_gate_ok(cur['nodes'])
    res['baselineOrdGate'] = {'ok': ok0, 'section': bad0}
    assert ok0
    (ART / 'out' / 'rn22_option_deltas_r0.json').write_text(json.dumps(res, indent=1, ensure_ascii=False))
    for k, v in out.items():
        if k == 'D6b':
            for kk, vv in v.items(): print(f"{k}[{kk}]: pointsAfter={vv['pointsAfter']} ordGate={vv['ordGateOK']} bumps={len(vv['orderBumps'])}")
        elif 'pointsAfter' in v:
            print(f"{k}: pointsAfter={v['pointsAfter']} ordGate={v['ordGateOK']}({v.get('ordGateSection')}) bumps={len(v['orderBumps'])} removed={v.get('removed')}")
        else:
            print(f"{k}: {json.dumps(v)[:150]}")

if __name__ == '__main__':
    main()
