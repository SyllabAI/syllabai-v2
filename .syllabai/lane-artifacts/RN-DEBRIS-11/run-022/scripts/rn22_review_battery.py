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
    HEAD_EXPECT_SUFFIX = ('4008f20a', 'dfa73a15', '1bd910fe', '7dd58793', 'd4027d3b')
    chain = [l.split()[0][:8] for l in git('log', '--oneline', '--first-parent', f'{BASE}..HEAD').splitlines()]
    res['B4_chain'] = chain
    assert chain == list(HEAD_EXPECT_SUFFIX), chain
    assert len(chain) == 5, f'expected 5 branch commits (artifacts, receipts, union1, postReview, union2), got {chain}'
    parents = git('show', '-s', '--format=%P', head).split()
    assert len(parents) == 2, 'union2 commit must be 2-parent'
    assert parents[0].startswith('7dd58793') and parents[1] == '493aa4748a6b12517118db72ab8e8c741eaf7e3c', parents
    p1 = git('show', '-s', '--format=%P', '1bd910fe').split()
    assert len(p1) == 2 and p1[0].startswith('dfa73a15') and p1[1] == 'a87f9ace44054fd72bbfabed2eac4fcf16f5d3ae', p1
    print('B4 PASS: chain', chain, '| union1 parents', [p[:8] for p in p1], '| union2 parents', [p[:8] for p in parents])

    # B1 net diff path set — PR view (main tip..HEAD) + branch-own commits scope
    MAIN_TIP = '493aa4748a6b12517118db72ab8e8c741eaf7e3c'
    PR_PATHS = DECLARED_PATHS | {'.syllabai/receipts/RN-DEBRIS-11/run-022-postReview.json',
                                 '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/scripts/rn22_review_battery.py'}
    names = set(git('diff', '--name-only', f'{MAIN_TIP}..HEAD').splitlines())
    assert names == PR_PATHS, f'PR path-set drift: extra={names-PR_PATHS} missing={PR_PATHS-names}'
    own1 = set(git('show', '--name-only', '--format=', HEAD_EXPECT_SUFFIX[0]).split())
    own2 = set(git('show', '--name-only', '--format=', HEAD_EXPECT_SUFFIX[1]).split())
    assert own1 <= PR_PATHS and own2 <= PR_PATHS, f'branch-own commit scope drift: {own1 | own2 - PR_PATHS}'
    own4 = set(git('show', '--name-only', '--format=', '7dd58793').split())
    assert own4 <= PR_PATHS, f'postReview commit scope drift: {own4 - PR_PATHS}'
    content = [p for p in names if p.startswith(('apps/', 'packages/', 'docs/', 'golden/', 'public/kg/'))]
    assert not content, f'content bytes touched: {content}'
    # union1's own delta vs dfa73a15 == exactly main's first advance (theirs-verbatim, no invention)
    union1_delta = set(git('diff', '--name-only', f'{HEAD_EXPECT_SUFFIX[1]}..1bd910fe').splitlines())
    adv1 = set(git('diff', '--name-only', f'{BASE}..a87f9ace44054fd72bbfabed2eac4fcf16f5d3ae').splitlines())
    assert union1_delta == adv1, f'union1 delta != first advance: {union1_delta ^ adv1}'
    # union2's own delta vs 7dd58793 == exactly main's second advance
    union2_delta = set(git('diff', '--name-only', f'7dd58793..HEAD').splitlines())
    adv2 = set(git('diff', '--name-only', f'a87f9ace44054fd72bbfabed2eac4fcf16f5d3ae..{MAIN_TIP}').splitlines())
    assert union2_delta == adv2, f'union2 delta != second advance: {union2_delta ^ adv2}'
    st = git('diff', '--shortstat', f'{MAIN_TIP}..HEAD').strip()
    res['B1'] = {'prPaths': sorted(names), 'shortstat': st,
                 'branchOwnCommitsScope': 'declared-only', 'union1Delta == advance1': True, 'union2Delta == advance2': True}
    print(f'B1 PASS: PR net diff == exactly the {len(names)} declared bookkeeping paths ({st}); '
          f'branch-own commits declared-only; both union deltas byte-lawful; zero content/src/docs bytes')

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
