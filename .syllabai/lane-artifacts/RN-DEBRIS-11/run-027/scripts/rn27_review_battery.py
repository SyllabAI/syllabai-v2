#!/usr/bin/env python3
"""RN-DEBRIS-11 run-027 — the postReview battery (the author self-review record
for the filing PR, per the run-018/019/020/021/022/023/024/025/026 postReview flow).

Run against the pushed branch head before any desk merge (B5 gates the PUT). Asserts:
  B1  the PR net diff vs main tip is EXACTLY the declared run-027 path set
  B2  the artifacts parse and their internal gates hold (gates_r0 ALL ok; the
      manifest's 14 rows byte-equal the committed candidates_r0 classA truth; the
      live map/registry re-pin: census == the A1 projection, pops 16/17/6, 118)
  B3  both worklogs: theirs-verbatim prefix vs main tip + the run-027 entry AND
      the run-026 merge-record entry byte-identical exactly once at each tail,
      zero unparented markers
  B4  the commit chain: base -> content -> receipts -> postReview+battery, then a
      tail walk over UNION commits (2-parent sync merges: delta vs its first parent
      == the main advance since the PREVIOUS main tip, theirs-verbatim; delta vs
      its second parent == exactly the declared path set) and REFRESH commits
      (battery + postReview receipt only) interleaved in any order up to HEAD
      (per-commit scope asserted vs its first parent — no self-referential sha;
      end-relative by scope; the battery main tip == the newest union's second parent)
  B5  CI conclusions on the pushed head: the hub/verify gates ALL success; the
      census-guard classified by its own path-filter law (fires ONLY on
      apps/hub/content/** or apps/hub/scripts/import_corpus/** — absent when no
      such path is declared, success when present; fail-loud either way); the
      Vercel deploy status classified fail-loud (success OR the documented
      plane-level classes — canceled-while-queued / rate-limited /
      DEPLOYMENT_DISABLED — any other failure reds the battery)
"""
import json, subprocess, sys
from pathlib import Path

CLONE = Path('/home/z/my-project/work/syllabai-v2')
BASE = '83dae8feef9b89c2fe3d9684ea93cc558f1beeab'
R27 = '.syllabai/lane-artifacts/RN-DEBRIS-11/run-027'
POSTREVIEW = '.syllabai/receipts/RN-DEBRIS-11/run-027-postReview.json'
APPLY_RECEIPT = '.syllabai/receipts/RN-DEBRIS-11/run-027-item-plane-apply.json'
REC26 = '.syllabai/receipts/RN-DEBRIS-11/run-026-item-plane-adjudication.json'
MAP = 'apps/hub/content-maps/cie-igcse-computer-science-23.json'

EXPECTED_OWN = {
    f'{R27}/apply_manifest_r0.json',
    f'{R27}/gates_r0.json',
    f'{R27}/scripts/rn27_apply.py',
    f'{R27}/scripts/rn27_gates.py',
    f'{R27}/scripts/rn27_review_battery.py',
    APPLY_RECEIPT,
    POSTREVIEW,
    REC26,
    '.syllabai/worklog.md',
    MAP,
    'worklog.md',
}
RECEIPTS_SCOPE = EXPECTED_OWN - {f'{R27}/scripts/rn27_review_battery.py', POSTREVIEW, MAP}
POSTREVIEW_SCOPE = {f'{R27}/scripts/rn27_review_battery.py', POSTREVIEW}
REFRESH_SCOPE = {f'{R27}/scripts/rn27_review_battery.py', POSTREVIEW}


def git(*a):
    r = subprocess.run(['git', *a], cwd=CLONE, capture_output=True, text=True)
    assert r.returncode == 0, f'git {a}: {r.stderr}'
    return r.stdout


def main():
    res = {'battery': 'rn11-run-027-postReview', 'base': BASE}
    head = git('rev-parse', 'HEAD').strip()
    res['head'] = head

    # B4 commit chain (first-parent) — base-relative spine + end-relative tail walk:
    # the SPINE = the three OLDEST commits (content {MAP} -> receipts {8 paths} ->
    # postReview+battery {2 paths}, each scope-asserted); every commit ABOVE the spine
    # is a UNION (2-parent sync merge: delta vs its first parent == the main advance
    # since the PREVIOUS main tip, theirs-verbatim; delta vs its second parent ==
    # exactly the declared path set), a REFRESH (scope == {battery, postReview}), or a
    # GATESFIX (1-parent, scope a disclosed non-empty subset of the declared receipt
    # paths) — per-commit scope asserted vs its first parent, no self-referential sha;
    # the battery main tip == the newest union second parent (BASE when no union)
    chain = [l.split()[0] for l in git('log', '--format=%H', '--first-parent', f'{BASE}..HEAD').splitlines()]
    res['B4_chain'] = [c[:8] for c in chain]
    assert len(chain) >= 3, f'expected >= 3 first-parent commits, got {len(chain)}: {chain}'
    head_full = head
    assert chain[0] == head_full, chain
    oldest = list(reversed(chain))
    c_content, c_receipts, c_postreview = oldest[0], oldest[1], oldest[2]
    content_scope = set(git('diff', '--name-only', f'{BASE}..{c_content}').splitlines())
    assert content_scope == {MAP}, f'content scope drift: {content_scope}'
    receipts_scope = set(git('diff', '--name-only', f'{c_content}..{c_receipts}').splitlines())
    assert receipts_scope == RECEIPTS_SCOPE, f'receipts scope drift: {receipts_scope ^ RECEIPTS_SCOPE}'
    pr_scope = set(git('diff', '--name-only', f'{c_receipts}..{c_postreview}').splitlines())
    assert pr_scope == POSTREVIEW_SCOPE, f'postReview scope drift: {pr_scope}'
    prev, prev_main_tip = c_postreview, BASE
    main_tip, unions = BASE, []
    for c in oldest[3:]:
        ps = git('show', '-s', '--format=%P', c).split()
        delta = set(git('diff', '--name-only', f'{prev}..{c}').splitlines())
        if len(ps) == 2:
            assert ps[0] == prev, f'union {c[:8]} first parent != walked prev {prev[:8]}: {ps}'
            adv = set(git('diff', '--name-only', f'{prev_main_tip}..{ps[1]}').splitlines())
            assert delta == adv, f'union {c[:8]} delta != the advance since {prev_main_tip[:8]}: {delta ^ adv}'
            od1 = set(git('diff', '--name-only', f'{ps[1]}..{c}').splitlines())
            assert od1 == EXPECTED_OWN, f'union {c[:8]} second-parent own-delta drift: {od1 ^ EXPECTED_OWN}'
            unions.append(f'{c[:8]}({ps[1][:8]} as its second parent)')
            main_tip, prev, prev_main_tip = ps[1], c, ps[1]
        elif delta == REFRESH_SCOPE and len(ps) == 1 and ps[0] == prev:
            prev = c
        elif delta and delta <= (EXPECTED_OWN - {MAP}) and len(ps) == 1 and ps[0] == prev:
            unions.append(f'{c[:8]}(gatesfix/refresh, scope {len(delta)})')
            prev = c
        else:
            assert False, f'unexpected commit {c[:8]} in the tail walk: parents={ps} delta={sorted(delta)[:6]}'
    assert prev == head_full, f'the tail walk did not reach HEAD: stopped at {prev[:8]}'
    desc = f'content {c_content[:8]} -> receipts {c_receipts[:8]} -> postReview+battery {c_postreview[:8]}'
    if unions:
        desc += ' -> ' + ' -> '.join(unions)
    print(f'B4 PASS: {len(chain)}-commit first-parent chain ({desc}), each scope-asserted vs its first parent '
          f'(unions theirs-verbatim: delta vs first parent == the advance since the previous main tip, '
          f'delta vs second parent == exactly the {len(EXPECTED_OWN)} declared paths); battery main tip {main_tip[:8]}')

    # B1 net diff path set vs the CURRENT main tip of record + race-guard
    remote_tip = subprocess.run(['git', 'ls-remote', 'origin', 'refs/heads/main'], cwd=CLONE,
                                capture_output=True, text=True, check=True).stdout.split()[0]
    assert remote_tip == main_tip, f'main tip drift: remote {remote_tip[:8]} != the battery main tip {main_tip[:8]} — resync loop'
    names = set(git('diff', '--name-only', f'{main_tip}..HEAD').splitlines())
    assert names == EXPECTED_OWN, f'PR path-set drift: extra={names - EXPECTED_OWN} missing={EXPECTED_OWN - names}'
    st = git('diff', '--shortstat', f'{main_tip}..HEAD').strip()
    res['B1'] = {'prPaths': sorted(names), 'shortstat': st, 'mainTip': main_tip}
    print(f'B1 PASS: PR net diff == exactly the {len(names)} declared run-027 paths vs main tip {main_tip[:8]} ({st}); '
          f'race-guard: origin/main == the battery main tip, no drift')

    # B2 artifacts parse + gates hold + the zero-invention re-pin
    gates = json.loads((CLONE / f'{R27}/gates_r0.json').read_text())
    assert all(g_['ok'] for g_ in gates['gates']), 'gates_r0 carries a red gate'
    man = json.loads((CLONE / f'{R27}/apply_manifest_r0.json').read_text())
    cand = json.loads((CLONE / '.syllabai/lane-artifacts/RN-DEBRIS-11/run-026/candidates_r0.json').read_text())
    truth = {}
    for r in cand['classA_unmappedUsers']:
        truth[r['item']] = (r['item'], r['kind'], r['declaredSid'], r['candidateOfficialCode'],
                            r['candidateOfficialId'], r['candidateTitle'], r['mapShapeOfRecord'])
    for row in man['rows']:
        assert (row['item'], row['kind'], row['declaredSid'], row['officialCode'],
                row['officialId'], row['candidateTitle'], row['pre']) == truth[row['item']], \
            f"manifest row drifted from the committed candidates truth: {row['item']}"
    assert len(man['rows']) == 14
    receipt = json.loads((CLONE / APPLY_RECEIPT).read_text())
    assert receipt['operatorOrder'].startswith('Proceed') and receipt['baseTip'] == BASE
    assert receipt['applied']['option'].startswith('A1') and receipt['applied']['option'].find('14 unmapped users') > 0
    assert man['filingExecuted'].startswith('the run-026 adjudication filing')
    # the live map re-pin (anti-drift)
    cm = json.loads((CLONE / MAP).read_text())
    FC = json.loads((CLONE / 'apps/hub/content/cie-igcse-computer-science-23/flashcards.json').read_text())
    live = {"multiIdCards": sum(1 for x in FC if len(x.get('specPointIds') or []) > 1),
            "nullCodeCards": sum(1 for x in FC if not x.get('specPointCode')),
            "codedMapItems": sum(1 for v in cm['items'].values() if v.get('codes')),
            "unmappedTrueItems": sum(1 for v in cm['items'].values() if v.get('unmapped') is True)}
    assert live == {"multiIdCards": 257, "nullCodeCards": 60, "codedMapItems": 876, "unmappedTrueItems": 469}, live
    S3, SR, S7 = 'spcpt_3hpC7gNs8YZ6t7kd', 'spcpt_rGVN6hJn6Mb9z2nR', 'spcpt_7JRKzsBqqdfPqf5t'
    pops = {s: sum(1 for v in cm['items'].values() if s in (v.get('declaredUnresolved') or [])) for s in (S3, SR, S7)}
    assert pops == {S3: 16, SR: 17, S7: 6}, pops
    assert len(cm['spcptToOfficial']) == 118 and list(cm['spcptToOfficial'].keys()) == sorted(cm['spcptToOfficial'].keys())
    assert cm['spcptToOfficial'][S3]['officialCode'] == '9.1' and cm['spcptToOfficial'][SR]['officialCode'] == '9.3'
    rec26 = json.loads((CLONE / REC26).read_text())
    m = rec26.get('merged') or {}
    assert m.get('sha') == '6618610eace74f19493d672f8cacca5ca3778244' and m.get('mergedAt') == '2026-11-13T16:24:34Z'
    res['B2'] = {'gates': f"{len(gates['gates'])}/ALL ok", 'manifest': '14 rows == the committed candidates_r0 classA truth',
                 'liveRepin': 'census == the A1 projection; pops 16/17/6; registry 118 ASCII-sorted',
                 'run026MergedBlock': '6618610e of record'}
    print(f"B2 PASS: artifacts parse; gates {len(gates['gates'])} ALL ok; the manifest 14 rows byte-equal the committed "
          f"candidates truth; the live re-pin: census == the A1 projection (257/60/876/469), pops 16/17/6, registry 118; "
          f"the run-026 merged block 6618610e of record")

    # B3 worklog suffix identity — theirs of record = the CURRENT main tip for BOTH ledgers
    for wl in ('worklog.md', '.syllabai/worklog.md'):
        cur = (CLONE / wl).read_bytes()
        theirs = subprocess.run(['git', 'show', f'{main_tip}:{wl}'], cwd=CLONE, capture_output=True).stdout
        assert cur.startswith(theirs), f'{wl}: theirs-verbatim prefix lost vs {main_tip[:8]}'
        suffix = cur[len(theirs):].decode('utf-8')
        entry_b = suffix.splitlines()[-1]
        assert entry_b.startswith('- RN-DEBRIS-11 run-027 — the item-plane A1 apply'), f'{wl}: run-027 entry not at tail'
        assert suffix.count('- RN-DEBRIS-11 run-027 — the item-plane A1 apply') == 1, f'{wl}: run-027 entry count'
        assert suffix.count('- RN-DEBRIS-11 run-026 merge record — PR #1009 merged of record') == 1, f'{wl}: #1009 record count'
        for marker in ('<<<<<<<', '>>>>>>>', '======='):
            assert not [l for l in suffix.splitlines(True) if l.startswith(marker)], f'{wl}: marker line in suffix'
    res['B3'] = ('both worklogs: theirs-verbatim prefix vs main tip + the run-027 entry AND the run-026 merge-record '
                 'entry byte-identical exactly once at each tail, zero unparented markers')
    print('B3 PASS:', res['B3'])

    # B5 CI on head — hub/verify ALL success; census-guard + Vercel classified fail-loud
    pat = Path('/home/z/my-project/work/.pat.0600').read_text().strip()
    import urllib.request
    req = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/check-runs?per_page=20',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn27-battery'})
    runs = json.loads(urllib.request.urlopen(req, timeout=30).read())['check_runs']
    cis = {r['name']: (r['status'], r['conclusion']) for r in runs}
    for name in ('hub', 'verify'):
        assert cis.get(name) == ('completed', 'success'), f'{name}: {cis.get(name)}'
    if 'census' in cis:
        assert cis['census'] == ('completed', 'success'), f'census: {cis["census"]}'
        census_verdict = 'present and success'
    else:
        assert not any(pp.startswith('apps/hub/content/') or pp.startswith('apps/hub/scripts/import_corpus/')
                       for pp in EXPECTED_OWN), 'census-guard absent while a content/** path is declared — unlawful gate set'
        census_verdict = 'absent-by-own-path-filter (the declared run-027 paths carry no apps/hub/content/** or import_corpus/** path)'
    req2 = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/status',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn27-battery'})
    dep = json.loads(urllib.request.urlopen(req2, timeout=30).read())
    dep_ctx = {s['context']: (s['state'], s.get('description') or '') for s in dep.get('statuses', [])}
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

    out = Path('/home/z/my-project/work/rn27/out/rn27_postReview_battery.json')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=1))
    print('\nBATTERY 5/5 ALL PASS ->', out)


if __name__ == '__main__':
    main()
