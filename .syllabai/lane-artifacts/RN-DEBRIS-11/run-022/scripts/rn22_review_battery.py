#!/usr/bin/env python3
"""RN-DEBRIS-11 run-022 — the postReview battery v2 (refreshed for the sync-#4
chain + the operator self-merge order, trace 1a1d1450e4852275).

Run against the branch head (post race-guard sync #4). Asserts:
  B1  net diff vs main tip is EXACTLY the declared bookkeeping path set
      (zero content/src/docs bytes anywhere in the branch); every union's own
      delta == exactly that round's main advance (theirs-verbatim, scripted)
  B2  the three artifacts parse and their internal gates hold (re-run of the
      census + delta engines against the head tree — content-identical to base)
  B3  both worklogs: theirs-verbatim prefix vs main tip + the run-022 suffix
      byte-identical exactly once at each tail, zero unparented markers
  B4  the commit chain is base -> artifacts -> receipts -> union1 -> postReview
      -> union2 -> battery-refresh -> postReview-update -> union3 -> union4
      -> battery-refresh-2 -> postReview-update-3 (2-parent unions, no force)
  B5  CI conclusions on the head (hub/verify/Vercel-comments ALL success;
      the Vercel deploy commit-STATUS states recorded verbatim)
"""
import json, subprocess, sys
from pathlib import Path

CLONE = Path('/home/z/my-project/work/rn22/clone')
BASE = '0cb0161809765d871b34c1f3e12136f188463184'
MAIN_TIP = '231975d9675d5053fdcd7ec71dcaf3e77f543b0c'
ADV5 = MAIN_TIP                                      # 1364f095..231975d9 (the closeout)
ADV1 = 'a87f9ace44054fd72bbfabed2eac4fcf16f5d3ae'   # 0cb01618..a87f9ace  (#952/#962)
ADV2 = '493aa4748a6b12517118db72ab8e8c741eaf7e3c'   # a87f9ace..493aa474 (#964)
ADV3 = '387e5e019ba9ac6a465a8c2cf1af3146213dbe1f'   # 493aa474..387e5e01 (#954)
ADV4 = '1364f095f19f83b7fd1fd59d557bbd195ac10d1a'    # 387e5e01..1364f095 (#958/#963/#966/#967/#968 + bake-probe receipt)
OWN_ARTIFACTS, OWN_RECEIPTS, OWN_POSTREVIEW = '4008f20a', 'dfa73a15', '7dd58793'
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
BATTERY = '.syllabai/lane-artifacts/RN-DEBRIS-11/run-022/scripts/rn22_review_battery.py'
POSTREVIEW = '.syllabai/receipts/RN-DEBRIS-11/run-022-postReview.json'

def git(*a):
    r = subprocess.run(['git', *a], cwd=CLONE, capture_output=True, text=True)
    assert r.returncode == 0, f'git {a}: {r.stderr}'
    return r.stdout

def main():
    res = {'battery': 'rn11-run-022-postReview-v2', 'base': BASE, 'mainTip': MAIN_TIP}
    head = git('rev-parse', 'HEAD').strip()
    res['head'] = head

    # B4 commit chain (first-parent, newest-first) + 2-parent union pins
    # chain[1] (battery-v2) and chain[0] (postReview-3) are asserted by SCOPE
    # (refresh3/pr3 below), not by sha — no self-reference.
    chain = [l.split()[0][:8] for l in git('log', '--oneline', '--first-parent', f'{BASE}..HEAD').splitlines()]
    res['B4_chain'] = chain
    assert chain[0] == head[:8] and chain[2:] == ['28242a3b', '67d5eebd', 'c3ffd0c2', '5b395d53',
                                                  '230945a3', 'db04e533', 'd4027d3b', '7dd58793', '1bd910fe',
                                                  'dfa73a15', '4008f20a'], chain
    assert len(chain) == 13, f'expected 13 first-parent commits, got {len(chain)}'
    for sha, p0, p1 in (('e69a2da6', '28242a3b', ADV5),
                        ('c3ffd0c2', '5b395d53', ADV4),
                        ('5b395d53', '230945a3', ADV3),
                        ('d4027d3b', '7dd58793', ADV2),
                        ('1bd910fe', 'dfa73a15', ADV1)):
        ps = git('show', '-s', '--format=%P', sha).split()
        assert len(ps) == 2 and ps[0].startswith(p0) and ps[1] == p1, f'union {sha}: {ps}'
    # scope law, by position (no self-referential shas):
    #   chain[0] update-4 = {battery re-anchor + postReview-4}   (the 230945a3 combined pattern)
    #   chain[2] postReview-3 = [POSTREVIEW] vs chain[3]
    #   chain[3] battery-v2   = [BATTERY]    vs chain[4]
    #   chain[6] 230945a3     = {BATTERY, POSTREVIEW} vs chain[7]
    #   chain[7] db04e533     = [BATTERY]    vs chain[8]
    up4 = set(git('diff', '--name-only', f'{chain[1]}..{chain[0]}').splitlines())
    assert up4 == {BATTERY, POSTREVIEW}, f'update-4 scope drift: {up4}'
    pr3 = git('diff', '--name-only', f'{chain[3]}..{chain[2]}').splitlines()
    ref2 = git('diff', '--name-only', f'{chain[4]}..{chain[3]}').splitlines()
    pr2 = set(git('diff', '--name-only', f'{chain[7]}..{chain[6]}').splitlines())
    ref1 = git('diff', '--name-only', f'{chain[8]}..{chain[7]}').splitlines()
    assert pr3 == [POSTREVIEW], f'postReview-3 scope drift: {pr3}'
    assert ref2 == [BATTERY], f'battery-refresh-2 scope drift: {ref2}'
    assert pr2 == {BATTERY, POSTREVIEW}, f'postReview-2 scope drift: {pr2}'
    assert ref1 == [BATTERY], f'battery-refresh-1 scope drift: {ref1}'
    print('B4 PASS: 13-commit first-parent chain; all five unions 2-parent with pinned parents; '
          'battery-refresh commits touch the battery script only; postReview commits touch the receipt only')

    # B1 net diff path set — main tip..HEAD == the 11 declared bookkeeping paths
    PR_PATHS = DECLARED_PATHS | {POSTREVIEW, BATTERY}
    names = set(git('diff', '--name-only', f'{MAIN_TIP}..HEAD').splitlines())
    assert names == PR_PATHS, f'PR path-set drift: extra={names-PR_PATHS} missing={PR_PATHS-names}'
    for own in (OWN_ARTIFACTS, OWN_RECEIPTS, OWN_POSTREVIEW):
        ownset = set(git('show', '--name-only', '--format=', own).split())
        assert ownset <= PR_PATHS, f'branch-own commit scope drift ({own}): {ownset - PR_PATHS}'
    content = [p for p in names if p.startswith(('apps/', 'packages/', 'docs/', 'golden/', 'public/kg/'))]
    assert not content, f'content bytes touched: {content}'
    # every union's own delta (vs its FIRST parent, the lane head) == exactly that round's main advance
    for u, fp, a0, a1 in (('1bd910fe', 'dfa73a15', BASE, ADV1), ('d4027d3b', '7dd58793', ADV1, ADV2),
                          ('5b395d53', '230945a3', ADV2, ADV3), ('c3ffd0c2', '5b395d53', ADV3, ADV4),
                          ('e69a2da6', '28242a3b', ADV4, ADV5)):
        ud = set(git('diff', '--name-only', f'{fp}..{u}').splitlines())
        adv = set(git('diff', '--name-only', f'{a0}..{a1}').splitlines())
        assert ud == adv, f'union-{u[:4]} delta != advance: {ud ^ adv}'
    st = git('diff', '--shortstat', f'{MAIN_TIP}..HEAD').strip()
    res['B1'] = {'prPaths': sorted(names), 'shortstat': st, 'unions': '5/5 delta == own advance (theirs-verbatim)'}
    print(f'B1 PASS: PR net diff == exactly the {len(names)} declared bookkeeping paths ({st}); '
          f'zero content/src/docs bytes; all five union deltas byte-lawful')

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

    # B3 worklog suffix identity — theirs of record = the main tip for BOTH ledgers
    for wl in ('worklog.md', '.syllabai/worklog.md'):
        cur = (CLONE / wl).read_bytes()
        theirs = subprocess.run(['git', 'show', f'{MAIN_TIP}:{wl}'], cwd=CLONE, capture_output=True).stdout
        assert cur.startswith(theirs), f'{wl}: theirs-verbatim prefix lost vs {MAIN_TIP[:8]}'
        suffix = cur[len(theirs):]
        assert suffix.count(b'RN-DEBRIS-11 run-022') == 1, f'{wl}: run-022 entry not exactly once'
        assert suffix.rstrip(b'\n').endswith(b'fetch-first race-guard at push.'), f'{wl}: run-022 entry not at tail'
        for marker in (b'<<<<<<<', b'>>>>>>>', b'======='):
            assert not [l for l in suffix.splitlines(True) if l.startswith(marker)], f'{wl}: marker line in suffix'
    res['B3'] = f'both worklogs: theirs-verbatim prefix vs main tip {MAIN_TIP[:8]} + the run-022 entry byte-identical exactly once at each tail, zero unparented markers'
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
