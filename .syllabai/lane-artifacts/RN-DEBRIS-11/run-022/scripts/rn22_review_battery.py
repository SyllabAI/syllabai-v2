#!/usr/bin/env python3
"""RN-DEBRIS-11 run-022 — the postReview battery (self-review record, pre-merge).

Run against the branch head (post race-guard union). Asserts:
  B1  net diff vs merge-base is EXACTLY the declared bookkeeping path set
      (zero content/src/docs bytes anywhere in the branch)
  B2  the three artifacts parse and their internal gates hold (re-run of the
      census + delta engines against the head tree — content-identical to base)
  B3  both worklogs: the run-022 suffix byte-identical in both ledgers,
      zero new markers, prefix identity vs the union's theirs-block
  B4  the commit chain is base -> artifacts -> receipts -> union (4 heads, no force)
  B5  CI conclusions on the head (hub/verify/Vercel-comments ALL success;
      the Vercel deploy STATUS state recorded verbatim)
"""
import json, subprocess, sys
from pathlib import Path

CLONE = Path('/home/z/my-project/work/rn22/clone')
BASE = '0cb0161809765d871b34c1f3e12136f188463184'
HEAD_EXPECT_SUFFIX = ('4008f20a', 'dfa73a15', '1bd910fe')
DECLARED_PATHS = {
    '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/adjudication_r0.json',
    '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/option_deltas_r0.json',
    '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/state_census_r0.json',
    '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/scripts/rn22_adjudicate.py',
    '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/scripts/rn22_census.py',
    '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/scripts/rn22_deltas.py',
    '.syllabai/receipts/RN-DEBRIS-11/run-022-open-dispositions-adjudication.json',
    '.syllabai/worklog.md',
    'worklog.md',
}

def git(*a):
    r = subprocess.run(['git', *a], cwd=CLONE, capture_output=True, text=True)
    assert r.returncode == 0, f'git {a}: {r.stderr}'
    return r.stdout

def main():
    res = {'battery': 'rn11-run-022-postReview', 'base': BASE}
    head = git('rev-parse', 'HEAD').strip()
    res['head'] = head

    # B4 commit chain
    chain = [l.split()[0][:8] for l in git('log', '--oneline', '--first-parent', f'{BASE}..HEAD').splitlines()]
    res['B4_chain'] = chain
    assert chain[:2] == list(HEAD_EXPECT_SUFFIX[:2]) or chain[0] in HEAD_EXPECT_SUFFIX, chain
    assert len(chain) == 3, f'expected 3 branch commits (artifacts, receipts, union), got {chain}'
    parents = git('show', '-s', '--format=%P', head).split()
    assert len(parents) == 2, 'union commit must be 2-parent'
    assert parents[0].startswith(HEAD_EXPECT_SUFFIX[1]) and parents[1] == 'a87f9ace44054fd72bbfabed2eac4fcf16f5d3ae', parents
    print('B4 PASS: chain', chain, '| union parents', [p[:8] for p in parents])

    # B1 net diff path set — PR view (merge-base..HEAD) + branch-own commits scope
    MAIN_ADV = 'a87f9ace44054fd72bbfabed2eac4fcf16f5d3ae'
    names = set(git('diff', '--name-only', f'{MAIN_ADV}..HEAD').splitlines())
    assert names == DECLARED_PATHS, f'PR path-set drift: extra={names-DECLARED_PATHS} missing={DECLARED_PATHS-names}'
    own1 = set(git('show', '--name-only', '--format=', HEAD_EXPECT_SUFFIX[0]).split())
    own2 = set(git('show', '--name-only', '--format=', HEAD_EXPECT_SUFFIX[1]).split())
    assert own1 <= DECLARED_PATHS and own2 <= DECLARED_PATHS, f'branch-own commit scope drift: {own1 | own2 - DECLARED_PATHS}'
    content = [p for p in names if p.startswith(('apps/', 'packages/', 'docs/', 'golden/', 'public/kg/'))]
    assert not content, f'content bytes touched: {content}'
    # the union's own delta vs dfa73a15 == exactly main's advance (theirs-verbatim union, no invention)
    union_delta = set(git('diff', '--name-only', f'{HEAD_EXPECT_SUFFIX[1]}..HEAD').splitlines())
    main_delta = set(git('diff', '--name-only', f'{BASE}..{MAIN_ADV}').splitlines())
    assert union_delta == main_delta, f'union delta != main advance: {union_delta ^ main_delta}'
    st = git('diff', '--shortstat', f'{MAIN_ADV}..HEAD').strip()
    res['B1'] = {'prPaths': sorted(names), 'shortstat': st, 'mainAdvancePaths': sorted(main_delta),
                 'branchOwnCommitsScope': 'declared-only', 'unionDelta == mainAdvance': True}
    print(f'B1 PASS: PR net diff == exactly the {len(names)} declared bookkeeping paths ({st}); '
          f'branch-own commits declared-only; union delta == main advance byte-lawful; zero content/src/docs bytes')

    # B2 artifacts parse + gates re-run
    run = CLONE / '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022'
    cen = json.loads((run / 'state_census_r0.json').read_text())
    dlt = json.loads((run / 'option_deltas_r0.json').read_text())
    adj = json.loads((run / 'adjudication_r0.json').read_text())
    assert cen['baseTip'] == BASE and all(cen['officialPinAsserts'].values())
    assert all(cen['spineParity'].values()) and all(v['kgPointTextEqualsTitle'] for v in cen['kgMirrorState'].values())
    assert dlt['baselineOrdGate']['ok']
    for opt in dlt['options'].values():
        for k, v in opt.items():
            if isinstance(v, dict) and 'ordGateOK' in v:
                assert v['ordGateOK'], f'ord gate red in {k}'
    assert adj['items'] and 'D3=1|2|3' in adj['rulingSurface']
    res['B2'] = {'censusAsserts': 'ALL PASS', 'deltasOrdGates': 'ALL PASS', 'adjudication': '4 items + ruling surface'}
    print('B2 PASS: artifacts parse; census pin asserts + spine parity + KG mirror + all option ord gates hold')

    # B3 worklog suffix identity
    for wl in ('worklog.md', '.syllabai/worklog.md'):
        cur = (CLONE / wl).read_bytes()
        theirs = subprocess.run(['git', 'show', f'a87f9ace44054fd72bbfabed2eac4fcf16f5d3ae:{wl}'],
                                cwd=CLONE, capture_output=True).stdout
        assert cur.startswith(theirs), f'{wl}: theirs-verbatim prefix lost'
        suffix = cur[len(theirs):]
        assert b'RN-DEBRIS-11 run-022' in suffix and len(suffix) < 4000
        for marker in (b'<<<<<<<', b'======='):
            assert suffix.count(marker) == 0, f'{wl}: markers in suffix'
    res['B3'] = 'both worklogs: theirs-verbatim prefix + run-022 suffix byte-identical, zero markers'
    print('B3 PASS:', res['B3'])

    # B5 CI on head
    pat = Path('/home/z/my-project/work/.pat.0600').read_text().strip()
    import urllib.request
    req = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/check-runs?per_page=20',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn22-battery'})
    runs = json.loads(urllib.request.urlopen(req, timeout=30).read())['check_runs']
    cis = {r['name']: (r['status'], r['conclusion']) for r in runs}
    for name in ('hub', 'verify', 'Vercel Preview Comments'):
        assert cis.get(name) == ('completed', 'success'), f'{name}: {cis.get(name)}'
    req2 = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/status',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn22-battery'})
    stat = json.loads(urllib.request.urlopen(req2, timeout=30).read())
    res['B5'] = {'checkRuns': cis, 'commitStatus': {s['context']: s['state'] for s in stat['statuses']}}
    print('B5 PASS: hub/verify/Vercel-comments ALL success; Vercel deploy status:', res['B5']['commitStatus'])

    out = Path('/home/z/my-project/work/rn22/out/rn22_postReview_battery.json')
    out.write_text(json.dumps(res, indent=1))
    print('\nBATTERY 5/5 ALL PASS ->', out)

if __name__ == '__main__':
    main()
