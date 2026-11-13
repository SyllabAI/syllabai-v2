#!/usr/bin/env python3
"""RN-DEBRIS-11 run-025 — the postReview battery (the author self-review record
for the filing PR, per the run-018/019/020/021/022/023/024 postReview flow).

Run against the branch head (post push). Asserts:
  B1  the PR net diff vs main tip is EXACTLY the declared run-025 path set
  B2  the artifacts parse and their internal gates hold (gates_r0 8/8 ok; the
      manifest's 2 sid rows byte-equal the derived registry truth incl. the
      witness citations; the ledger 33 user rows + 2 sid rows)
  B3  both worklogs: theirs-verbatim prefix vs main tip + the run-025 entry
      AND the #995 merge-record entry byte-identical exactly once at each
      tail, zero unparented markers
  B4  the commit chain is base -> content -> receipts -> postReview+battery
      (per-commit scope asserted vs its first parent — no self-referential
      sha; end-relative by scope so refresh commits self-assert)
  B5  CI conclusions on the pushed head: the hub/verify gates ALL success;
      the census-guard classified by its own path-filter law (fires ONLY on
      apps/hub/content/** or import_corpus/** — absent when no such path is
      declared, success when present; fail-loud either way); the Vercel
      deploy status classified fail-loud (success OR the documented
      plane-level classes — canceled-while-queued / rate-limited /
      DEPLOYMENT_DISABLED — any other failure = the battery reds)
"""
import json, subprocess, sys
from pathlib import Path

CLONE = Path('/home/z/my-project/work/rn24-wt')
BASE = 'b5439c38e27e2fde58968c624a5a5d605bf2960c'
R25 = '.syllabai/lane-artifacts/RN-DEBRIS-11/run-025'
POSTREVIEW = '.syllabai/receipts/RN-DEBRIS-11/run-025-postReview.json'
APPLY_RECEIPT = '.syllabai/receipts/RN-DEBRIS-11/run-025-sid-resolution.json'
MAP = 'apps/hub/content-maps/cie-igcse-computer-science-23.json'

EXPECTED_OWN = {
    f'{R25}/apply_manifest_r0.json',
    f'{R25}/gates_r0.json',
    f'{R25}/rn25_sid_resolution_ledger_r0.json',
    f'{R25}/scripts/rn25_apply.py',
    f'{R25}/scripts/rn25_review_battery.py',
    POSTREVIEW,
    APPLY_RECEIPT,
    '.syllabai/worklog.md',
    MAP,
    'worklog.md',
}

S1 = "spcpt_3hpC7gNs8YZ6t7kd"
S2 = "spcpt_rGVN6hJn6Mb9z2nR"
OFFICIAL = {
    "9.1": "Define a single-table database from given data storage requirements",
    "9.3": "Understand the purpose of a primary key and identify a suitable primary key for a given database table",
}
WITNESS = {"9.1": "rn_pzFQ4MZnDWbnY6rf", "9.3": "rn_KGhttHj9fT889Bm2"}

def git(*a):
    r = subprocess.run(['git', *a], cwd=CLONE, capture_output=True, text=True)
    assert r.returncode == 0, f'git {a}: {r.stderr}'
    return r.stdout

def main():
    res = {'battery': 'rn11-run-025-postReview', 'base': BASE}
    head = git('rev-parse', 'HEAD').strip()
    res['head'] = head

    # B4 commit chain (first-parent, newest-first) — end-relative, per-commit scope;
    # the sync union (if present) sits at chain[-4] with pinned parents and delta laws
    chain = [l.split()[0] for l in git('log', '--oneline', '--first-parent', f'{BASE}..HEAD').splitlines()]
    res['B4_chain'] = [c[:8] for c in chain]
    assert len(chain) >= 3, f'expected >= 3 first-parent commits, got {len(chain)}: {chain}'
    head_full = head
    assert chain[0] == head_full, chain
    c_content, c_receipts = chain[-1], chain[-2]
    c_postreview = chain[-3]
    # per-commit scope vs first parent
    content_scope = set(git('diff', '--name-only', f'{BASE}..{c_content}').splitlines())
    assert content_scope == {MAP}, f'content scope drift: {content_scope}'
    receipts_scope = set(git('diff', '--name-only', f'{c_content}..{c_receipts}').splitlines())
    assert receipts_scope == EXPECTED_OWN - {f'{R25}/scripts/rn25_review_battery.py', POSTREVIEW, MAP}, \
        f'receipts scope drift: {receipts_scope}'
    pr_scope = set(git('diff', '--name-only', f'{c_receipts}..{c_postreview}').splitlines())
    assert pr_scope == {f'{R25}/scripts/rn25_review_battery.py', POSTREVIEW}, f'postReview scope drift: {pr_scope}'
    main_tip = None
    unions = ''
    if len(chain) >= 4:
        # the sync union (the run-024 fd407622 shape): 2-parent, theirs-verbatim deltas
        UNION = chain[-4]
        ps = git('show', '-s', '--format=%P', UNION).split()
        assert len(ps) == 2 and ps[0].startswith(chain[-3]), f'union parents: {ps}'
        main_tip = ps[1]
        adv = set(git('diff', '--name-only', f'{BASE}..{main_tip}').splitlines())
        ud1 = set(git('diff', '--name-only', f'{chain[-3]}..{UNION}').splitlines())
        assert ud1 == adv, f'union delta != advance: {ud1 ^ adv}'
        od1 = set(git('diff', '--name-only', f'{main_tip}..{UNION}').splitlines())
        assert od1 == EXPECTED_OWN, f'union second-parent own-delta drift: {od1 ^ EXPECTED_OWN}'
        unions = f'1/1 delta == its advance byte-lawful (theirs-verbatim worklog overlap resolved scripted)'
    refreshes = chain[:-4] if len(chain) >= 4 else []
    for i, rc in enumerate(refreshes):  # any battery-refresh commits at the tail (newest first)
        parent = chain[i + 1]
        f_scope = set(git('diff', '--name-only', f'{parent}..{rc}').splitlines())
        assert f_scope == {f'{R25}/scripts/rn25_review_battery.py', POSTREVIEW}, f'refresh {rc[:8]} scope drift: {f_scope}'
    print(f'B4 PASS: {len(chain)}-commit first-parent chain (content {c_content[:8]} -> receipts {c_receipts[:8]} -> '
          f'postReview+battery {c_postreview[:8]}' + (f' -> union {chain[-4][:8]} ({main_tip[:8]} as its second parent), {unions}' if main_tip else '') +
          (f' -> {len(refreshes)} refresh commit(s)' if refreshes else '') + '), each scope-asserted vs its first parent')

    # B1 net diff path set — vs the CURRENT main tip of record (the union's second
    # parent when a union exists, else the base) — and race-guard: it must still be
    # origin/main at battery time (drift = resync loop, fail-loud)
    if main_tip is None:
        main_tip = BASE
    remote_tip = subprocess.run(['git', 'ls-remote', 'origin', 'refs/heads/main'], cwd=CLONE,
                                capture_output=True, text=True, check=True).stdout.split()[0]
    assert remote_tip == main_tip, f'main tip drift: remote {remote_tip[:8]} != the battery main tip {main_tip[:8]} — resync loop'
    names = set(git('diff', '--name-only', f'{main_tip}..HEAD').splitlines())
    assert names == EXPECTED_OWN, f'PR path-set drift: extra={names-EXPECTED_OWN} missing={EXPECTED_OWN-names}'
    st = git('diff', '--shortstat', f'{main_tip}..HEAD').strip()
    res['B1'] = {'prPaths': sorted(names), 'shortstat': st, 'mainTip': main_tip}
    print(f'B1 PASS: PR net diff == exactly the {len(names)} declared run-025 paths vs main tip {main_tip[:8]} ({st}); '
          f'race-guard: origin/main == the battery main tip, no drift')

    # B2 artifacts parse + gates hold + the zero-invention re-pin
    gates = json.loads((CLONE / f'{R25}/gates_r0.json').read_text())
    assert all(g['ok'] for g in gates['gates']), 'gates_r0 carries a red gate'
    manifest = json.loads((CLONE / f'{R25}/apply_manifest_r0.json').read_text())
    srows = {s['sid']: (s['officialCode'], s['title'], s['witnessNote'], s['witnessCitation']) for s in manifest['sids']}
    assert srows == {S1: ('9.1', OFFICIAL['9.1'], WITNESS['9.1'], OFFICIAL['9.1']),
                     S2: ('9.3', OFFICIAL['9.3'], WITNESS['9.3'], OFFICIAL['9.3'])}, \
        f'sid rows drifted from the derived registry truth: {srows}'
    ledger = json.loads((CLONE / f'{R25}/rn25_sid_resolution_ledger_r0.json').read_text())
    assert len(ledger['sidResolution']) == 2 and len(ledger['usersOfRecord']) == 33, \
        {k: len(ledger[k]) for k in ('sidResolution', 'usersOfRecord')}
    receipt = json.loads((CLONE / APPLY_RECEIPT).read_text())
    assert receipt['operatorOrder'].startswith('apply run-025') and receipt['baseTip'] == BASE
    assert receipt['applied']['mixedRulingDisclosure'].startswith("spcpt_rGVN6hJn6Mb9z2nR's flashcard users split 2x9.1")
    # the live registry re-pin (anti-drift)
    cm = json.loads((CLONE / MAP).read_text())
    sto = cm['spcptToOfficial']
    assert sto[S1]['officialCode'] == '9.1' and sto[S2]['officialCode'] == '9.3'
    assert len(sto) == 118 and list(sto.keys()) == sorted(sto.keys())
    assert sto[S1]['lineage'] == 'desk_ruling_sid_resolution' and sto[S1]['via'] == 'RN-DEBRIS-11 run-025'
    res['B2'] = {'gates': f"{len(gates['gates'])}/ALL ok", 'manifest': '2 sid rows == the derived registry truth (witness re-pin)',
                 'ledger': '2 sid rows + 33 user rows', 'registry': '118 ASCII-sorted, live re-pin ok'}
    print(f"B2 PASS: artifacts parse; gates {len(gates['gates'])} ALL ok; the manifest sid rows byte-equal the derived "
          f"truth (witness re-pin); the ledger 2+33 rows; the live registry re-pin 118 ASCII-sorted")

    # B3 worklog suffix identity — theirs of record = the CURRENT main tip for BOTH ledgers
    for wl in ('worklog.md', '.syllabai/worklog.md'):
        cur = (CLONE / wl).read_bytes()
        theirs = subprocess.run(['git', 'show', f'{main_tip}:{wl}'], cwd=CLONE, capture_output=True).stdout
        assert cur.startswith(theirs), f'{wl}: theirs-verbatim prefix lost vs {main_tip[:8]}'
        suffix = cur[len(theirs):].decode('utf-8')
        entry_b = suffix.splitlines()[-1]
        assert entry_b.startswith('- RN-DEBRIS-11 run-025 — the sid-level resolution'), f'{wl}: run-025 entry not at tail'
        assert suffix.count('- RN-DEBRIS-11 run-025 — the sid-level resolution') == 1, f'{wl}: run-025 entry count'
        assert suffix.count('- RN-DEBRIS-11 run-024 merge record — PR #995 merged of record') == 1, f'{wl}: #995 record count'
        for marker in ('<<<<<<<', '>>>>>>>', '======='):
            assert not [l for l in suffix.splitlines(True) if l.startswith(marker)], f'{wl}: marker line in suffix'
    res['B3'] = ('both worklogs: theirs-verbatim prefix vs main tip + the run-025 entry AND the #995 merge-record '
                 'entry byte-identical exactly once at each tail, zero unparented markers')
    print('B3 PASS:', res['B3'])

    # B5 CI on head — the three CI gates ALL success; the Vercel deploy status classified fail-loud
    pat = Path('/home/z/my-project/work/.pat.0600').read_text().strip()
    import urllib.request
    req = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/check-runs?per_page=20',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn25-battery'})
    runs = json.loads(urllib.request.urlopen(req, timeout=30).read())['check_runs']
    cis = {r['name']: (r['status'], r['conclusion']) for r in runs}
    for name in ('hub', 'verify'):
        assert cis.get(name) == ('completed', 'success'), f'{name}: {cis.get(name)}'
    # the census-guard law (the workflow's own path filter of record): it fires ONLY on
    # apps/hub/content/** or apps/hub/scripts/import_corpus/** — the run-025 declared path
    # set carries NO such path, so its absence on this head is lawful; if present it must
    # be success (fail-loud either way)
    if 'census' in cis:
        assert cis['census'] == ('completed', 'success'), f'census: {cis["census"]}'
        census_verdict = 'present and success'
    else:
        assert not any(pp.startswith('apps/hub/content/') or pp.startswith('apps/hub/scripts/import_corpus/')
                       for pp in EXPECTED_OWN), 'census-guard absent while a content/** path is declared — unlawful gate set'
        census_verdict = 'absent-by-own-path-filter (the declared run-025 paths carry no apps/hub/content/** or import_corpus/** path)'
    req2 = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/status',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn25-battery'})
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
    print(f'B5 PASS: hub/verify ALL success on the pushed head; census: {census_verdict}; Vercel deploy: {verdict}')

    out = Path('/home/z/my-project/work/rn25/out/rn25_postReview_battery.json')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=1))
    print('\nBATTERY 5/5 ALL PASS ->', out)

if __name__ == '__main__':
    main()
