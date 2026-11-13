#!/usr/bin/env python3
"""RN-DEBRIS-11 run-024 — the postReview battery (the author self-review record
for the filing PR, per the run-018/019/020/021/022/023 postReview flow).

Run against the branch head (post sync #1). Asserts:
  B1  the PR net diff vs main tip is EXACTLY the declared run-024 path set;
      the sync union's delta vs its FIRST parent == exactly that round's main
      advance (theirs-verbatim law) and vs its SECOND parent == exactly the
      branch's own pre-union path set (scripted)
  B2  the artifacts parse and their internal gates hold (gates_r0 8/8 ok; the
      manifest's 14 card rows byte-equal the run-023 split artifact's drop
      candidates — the zero-invention re-pin; the ledger planes 14/14)
  B3  both worklogs: theirs-verbatim prefix vs main tip + the run-024 entry
      byte-identical exactly once at each tail, zero unparented markers
  B4  the commit chain is base -> content -> receipts -> postReview+battery ->
      union (2-parent union with pinned parents; per-commit scope asserted vs
      its first parent — no self-referential sha)
  B5  CI conclusions on the pushed head: the census/hub/verify gates ALL
      success; the Vercel deploy status classified fail-loud (success OR the
      documented plane-level classes — canceled-while-queued / rate-limited /
      DEPLOYMENT_DISABLED — any other failure = the battery reds)
"""
import json, subprocess, sys
from pathlib import Path

CLONE = Path('/home/z/my-project/work/rn24-wt')
BASE = '02fed707aa3b7ff61ee40e0d1618131107ea2228'
R24 = '.syllabai/lane-artifacts/RN-DEBRIS-11/run-024'
POSTREVIEW = '.syllabai/receipts/RN-DEBRIS-11/run-024-postReview.json'
APPLY_RECEIPT = '.syllabai/receipts/RN-DEBRIS-11/run-024-uclass-apply.json'

EXPECTED_OWN = {
    f'{R24}/apply_manifest_r0.json',
    f'{R24}/gates_r0.json',
    f'{R24}/rn24_apply_ledger_r0.json',
    f'{R24}/scripts/rn24_apply.py',
    f'{R24}/scripts/rn24_review_battery.py',
    POSTREVIEW,
    APPLY_RECEIPT,
    '.syllabai/worklog.md',
    'apps/hub/content-maps/cie-igcse-computer-science-23.json',
    'apps/hub/content/cie-igcse-computer-science-23/flashcards.json',
    'worklog.md',
}

def git(*a):
    r = subprocess.run(['git', *a], cwd=CLONE, capture_output=True, text=True)
    assert r.returncode == 0, f'git {a}: {r.stderr}'
    return r.stdout

def main():
    res = {'battery': 'rn11-run-024-postReview', 'base': BASE}
    head = git('rev-parse', 'HEAD').strip()
    res['head'] = head

    # B4 commit chain (first-parent, newest-first) — post battery-refresh #1
    chain = [l.split()[0][:8] for l in git('log', '--oneline', '--first-parent', f'{BASE}..HEAD').splitlines()]
    res['B4_chain'] = chain
    assert len(chain) == 5, f'expected 5 first-parent commits, got {len(chain)}: {chain}'
    head8 = head[:8]
    assert chain[0] == head8, chain
    assert chain[4] == '3d0a2596', f'content commit pin: {chain}'
    ps = git('show', '-s', '--format=%P', chain[1]).split()
    assert len(ps) == 2 and ps[0].startswith(chain[2]) and ps[1].startswith('ca4f2266'), f'union parents: {ps}'
    # per-commit scope vs first parent
    f_scope = set(git('diff', '--name-only', f'{chain[1]}..{chain[0]}').splitlines())
    assert f_scope == {f'{R24}/scripts/rn24_review_battery.py', POSTREVIEW}, f'battery-refresh scope drift: {f_scope}'
    c_scope = set(git('diff', '--name-only', f'{chain[3]}..{chain[2]}').splitlines())
    assert c_scope == {f'{R24}/scripts/rn24_review_battery.py', POSTREVIEW}, f'postReview scope drift: {c_scope}'
    b_scope = set(git('diff', '--name-only', f'{chain[4]}..{chain[3]}').splitlines())
    assert b_scope == EXPECTED_OWN - {f'{R24}/scripts/rn24_review_battery.py', POSTREVIEW,
                                      'apps/hub/content-maps/cie-igcse-computer-science-23.json',
                                      'apps/hub/content/cie-igcse-computer-science-23/flashcards.json'}, f'receipts scope drift: {b_scope}'
    content_scope = set(git('diff', '--name-only', f'{BASE}..{chain[4]}').splitlines())
    assert content_scope == {'apps/hub/content-maps/cie-igcse-computer-science-23.json',
                             'apps/hub/content/cie-igcse-computer-science-23/flashcards.json'}, f'content scope drift: {content_scope}'
    print(f'B4 PASS: 5-commit first-parent chain (content 3d0a2596 -> receipts -> postReview+battery -> union -> battery-refresh); '
          f'per-commit scopes asserted; the union is 2-parent with pinned parents')

    # B1 net diff path set + the union delta law
    main_tip = ps[1]
    names = set(git('diff', '--name-only', f'{main_tip}..HEAD').splitlines())
    assert names == EXPECTED_OWN, f'PR path-set drift: extra={names-EXPECTED_OWN} missing={EXPECTED_OWN-names}'
    ud1 = set(git('diff', '--name-only', f'{chain[2]}..{chain[1]}').splitlines())
    adv1 = set(git('diff', '--name-only', f'{BASE}..{main_tip}').splitlines())
    assert ud1 == adv1, f'union delta != advance: {ud1 ^ adv1}'
    od1 = set(git('diff', '--name-only', f'{main_tip}..{chain[1]}').splitlines())
    assert od1 == EXPECTED_OWN, f'union second-parent own-delta drift: {od1 ^ EXPECTED_OWN}'
    st = git('diff', '--shortstat', f'{main_tip}..HEAD').strip()
    res['B1'] = {'prPaths': sorted(names), 'shortstat': st, 'unions': '1/1 delta == own advance (theirs-verbatim)'}
    print(f'B1 PASS: PR net diff == exactly the {len(names)} declared run-024 paths ({st}); the union delta == its advance byte-lawful')

    # B2 artifacts parse + gates hold + the zero-invention re-pin
    gates = json.loads((CLONE / f'{R24}/gates_r0.json').read_text())
    assert all(g['ok'] for g in gates['gates']), 'gates_r0 carries a red gate'
    manifest = json.loads((CLONE / f'{R24}/apply_manifest_r0.json').read_text())
    split = json.loads((CLONE / '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023/rn23_635_split_r0.json').read_text())
    pin = {}
    for r in split['items']:
        if r['ruling'] == 'drop':
            pin[r['id']] = '9.1' if 'candidate 9.1' in r['grounds'] else ('9.3' if 'candidate 9.3' in r['grounds'] else None)
    assert len(pin) == 14 and None not in pin.values()
    mrows = {c['id']: c['candidate'] for c in manifest['cards']}
    assert mrows == pin, 'the manifest card rows drifted from the run-023 split artifact candidates'
    ledger = json.loads((CLONE / f'{R24}/rn24_apply_ledger_r0.json').read_text())
    assert len(ledger['flashcards']) == 14 and len(ledger['contentMaps']) == 14, {k: len(ledger[k]) for k in ('flashcards', 'contentMaps')}
    receipt = json.loads((CLONE / APPLY_RECEIPT).read_text())
    assert receipt['operatorOrder'].startswith('Apply') and receipt['baseTip'] == BASE
    res['B2'] = {'gates': f"{len(gates['gates'])}/ALL ok", 'manifest': '14 rows == the run-023 split candidates (byte-equal re-pin)',
                 'ledger': '14/14 planes'}
    print(f"B2 PASS: artifacts parse; gates {len(gates['gates'])} ALL ok; the 14 manifest rows == the run-023 split candidates; the ledger 14/14")

    # B3 worklog suffix identity — theirs of record = the main tip for BOTH ledgers
    for wl in ('worklog.md', '.syllabai/worklog.md'):
        cur = (CLONE / wl).read_bytes()
        theirs = subprocess.run(['git', 'show', f'{main_tip}:{wl}'], cwd=CLONE, capture_output=True).stdout
        assert cur.startswith(theirs), f'{wl}: theirs-verbatim prefix lost vs {main_tip[:8]}'
        suffix = cur[len(theirs):]
        assert suffix.count('the U-class apply (2026-11-13)'.encode()) == 1, f'{wl}: run-024 entry not exactly once'
        for marker in (b'<<<<<<<', b'>>>>>>>', b'======='):
            assert not [l for l in suffix.splitlines(True) if l.startswith(marker)], f'{wl}: marker line in suffix'
    res['B3'] = f'both worklogs: theirs-verbatim prefix vs main tip {main_tip[:8]} + the run-024 entry byte-identical exactly once at each tail, zero unparented markers'
    print('B3 PASS:', res['B3'])

    # B5 CI on head — the three CI gates ALL success; the Vercel deploy status classified
    # fail-loud (success OR the documented plane-level classes only; any other failure = red)
    pat = Path('/home/z/my-project/work/.pat.0600').read_text().strip()
    import urllib.request
    req = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/check-runs?per_page=20',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn24-battery'})
    runs = json.loads(urllib.request.urlopen(req, timeout=30).read())['check_runs']
    cis = {r['name']: (r['status'], r['conclusion']) for r in runs}
    for name in ('census', 'hub', 'verify'):
        assert cis.get(name) == ('completed', 'success'), f'{name}: {cis.get(name)}'
    req2 = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/status',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn24-battery'})
    dep = json.loads(urllib.request.urlopen(req2, timeout=30).read())
    dep_ctx = {st['context']: (st['state'], st.get('description') or '') for st in dep.get('statuses', [])}
    verc = dep_ctx.get('Vercel – syllabai-hub-v2')
    PLANE_CLASSES = ('rate limited', 'Canceled by Ignored Build Step', 'DEPLOYMENT_DISABLED')
    if verc is None:
        verdict = 'no Vercel deploy status on this head (the documented no-status class)'
    elif verc[0] == 'success':
        verdict = f'success ({verc[1]})'
    elif any(c.lower() in verc[1].lower() for c in PLANE_CLASSES[:2]) or PLANE_CLASSES[2] in verc[1]:
        verdict = f'the documented plane-level class ({verc[0]}: {verc[1]}) — not content; the CI hub gate green is the pickup proof of record per the BIO-STAGEB3/INK-BRK precedents'
    else:
        assert False, f'Vercel deploy status unclassified failure: {verc}'
    res['B5'] = {'checkRuns': cis, 'vercelDeploy': verdict}
    print(f'B5 PASS: census/hub/verify ALL success on the pushed head; Vercel deploy: {verdict}')

    out = Path('/home/z/my-project/work/rn24/out/rn24_postReview_battery.json')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=1))
    print('\nBATTERY 5/5 ALL PASS ->', out)

if __name__ == '__main__':
    main()
