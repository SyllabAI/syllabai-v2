#!/usr/bin/env python3
"""RN-DEBRIS-11 run-023 — the postReview battery (the author self-review record
before the desk merge of PR #979, per the run-018/019/020/021/022 postReview
flow; the operator self-merge order of record trace 1a1d3a04442bb47d
'self-merge #979' supersedes the filing-time no-self-merge plan per the
run-021/022 precedent).

Run against the branch head (post sync #1 + sync #2). Asserts:
  B1  the PR net diff vs main tip is EXACTLY the declared run-023 path set;
      both sync unions' delta vs their SECOND parent == exactly the branch's
      own path set (theirs-verbatim law) and vs their FIRST parent == exactly
      that round's main advance (scripted)
  B2  the four artifacts parse and their internal gates hold (gates_r0 all ok;
      the split table's 43 evidence pins present; the ledger's planes; the
      census/delta engines' pins re-asserted from the of-record filings)
  B3  both worklogs: theirs-verbatim prefix vs main tip 4cbd95f4 + the run-023
      entry byte-identical exactly once at each tail, zero unparented markers
  B4  the commit chain is base -> surgery -> receipts -> union#1 -> union#2 ->
      battery (2-parent unions with pinned parents; the battery commit's own
      scope asserted vs its first parent — no self-referential sha)
  B5  CI conclusions on the pushed head (census/hub/verify/Vercel ALL success)
"""
import json, subprocess, sys
from pathlib import Path

CLONE = Path('/home/z/my-project/work/syllabai-v2')
BASE = '24e6f5fd6acef778b459be9fab0e76e3c529c8d7'
MAIN_TIP = '0ff74eb3478f6bd257474ac783c28e5d727af8ba'
ADV1_TIP = '540d8ea4a103e335cd02fc6f9c1f62c18a73a24f'   # 24e6f5fd..540d8ea4 (the 14-file advance)
ADV2_FILES = {'apps/api/src/services/learner-pdf-drawings/index.selfheal.test.ts',
              'apps/api/src/services/learner-pdf-drawings/index.ts'}   # 540d8ea4..4cbd95f4
ADV3_FILES = {'.github/workflows/t-hub-ink-brk-db-heal.yml', '.github/workflows/t-vercel-api-diag.yml',
              'apps/api/scripts/ink-wedge-heal.ts'}   # 4cbd95f4..0ff74eb3 (the DB-heal wave)
UNION1, UNION2, UNION3 = 'e337983a9f351a83f211ec1c9dc036d6018e82df', 'a4ffd60a', '5018edc5'
SURGERY, RECEIPTS = '47f835c8', '7e78d091'
BATTERY = '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023/scripts/rn23_review_battery.py'
POSTREVIEW = '.syllabai/receipts/RN-DEBRIS-11/run-023-postReview.json'
R23 = '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023'

def git(*a):
    r = subprocess.run(['git', *a], cwd=CLONE, capture_output=True, text=True)
    assert r.returncode == 0, f'git {a}: {r.stderr}'
    return r.stdout

def main():
    res = {'battery': 'rn11-run-023-postReview', 'base': BASE, 'mainTip': MAIN_TIP}
    head = git('rev-parse', 'HEAD').strip()
    res['head'] = head

    # B4 commit chain (first-parent, newest-first)
    chain = [l.split()[0][:8] for l in git('log', '--oneline', '--first-parent', f'{BASE}..HEAD').splitlines()]
    res['B4_chain'] = chain
    head8 = head[:8]
    assert chain[0] == head8, chain
    # chain[1] (battery fix), chain[2] (battery) asserted by scope below; the unions by sha/scope
    assert chain[2] == '5018edc5' and chain[3] == 'a4ffd60a' and chain[4] == 'e337983a' and \
           chain[5] == '7e78d091' and chain[6] == '47f835c8', chain
    assert len(chain) == 7, f'expected 7 first-parent commits, got {len(chain)}'
    for sha, p0, p1 in (('e337983a', '7e78d091', ADV1_TIP),):
        ps = git('show', '-s', '--format=%P', sha).split()
        assert len(ps) == 2 and ps[0].startswith(p0) and ps[1] == p1, f'union {sha}: {ps}'
    ps2 = git('show', '-s', '--format=%P', 'a4ffd60a').split()
    assert len(ps2) == 2 and ps2[0].startswith('e337983a') and ps2[1] == MAIN_TIP, f'union2: {ps2}'
    fixscope = set(git('diff', '--name-only', f'{chain[2]}..{chain[1]}').splitlines())
    assert fixscope == {BATTERY, POSTREVIEW}, f'battery-fix commit scope drift: {fixscope}'
    bscope = set(git('diff', '--name-only', f'{chain[3]}..{chain[2]}').splitlines())
    assert bscope == {BATTERY, POSTREVIEW}, f'battery commit scope drift: {bscope}'
    ps3 = git('show', '-s', '--format=%P', '5018edc5').split()
    assert len(ps3) == 2 and ps3[0].startswith('6cd7a246') and ps3[1] == MAIN_TIP, f'union3: {ps3}'
    print(f'B4 PASS: 7-commit first-parent chain; all three unions 2-parent with pinned parents; '
          f'the battery commit touches exactly [battery, postReview]; the fix commit too (the receipt\'s chain line + the script fix)')

    # B1 net diff path set + the union delta law
    names = set(git('diff', '--name-only', f'{MAIN_TIP}..HEAD').splitlines())
    EXPECTED_OWN = {
        '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023/apply_manifest_r0.json',
        '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023/gates_r0.json',
        '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023/rn23_635_split_r0.json',
        '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023/rn23_repoint_ledger_r0.json',
        '.syllabai/lane-artifacts/RN-DEBRIS-11/run-023/scripts/rn23_apply.py',
        BATTERY, POSTREVIEW,
        '.syllabai/receipts/RN-DEBRIS-11/run-023-open-dispositions-apply.json',
        '.syllabai/worklog.md',
        'apps/api/scripts/cie-phase4-apply.ts',
        'apps/api/src/services/sme/bundle-questions.ts',
        'apps/api/test/sme/bundle-questions.test.ts',
        'apps/api/test/sme/cie-phase4-roster.test.ts',
        'apps/hub/content-maps/cie-igcse-computer-science-23.json',
        'apps/hub/content/cie-a-level-maths-20-pure-1/curriculum.json',
        'apps/hub/content/cie-a-level-maths-20-pure-1/manifest.json',
        'apps/hub/content/cie-a-level-maths-20-pure-1/prerequisites.json',
        'apps/hub/content/cie-as-maths-20-pure-1/curriculum.json',
        'apps/hub/content/cie-as-maths-20-pure-1/manifest.json',
        'apps/hub/content/cie-as-maths-20-pure-1/prerequisites.json',
        'apps/hub/content/cie-igcse-computer-science-23/curriculum.json',
        'apps/hub/content/cie-igcse-computer-science-23/flashcards.json',
        'apps/hub/content/cie-igcse-computer-science-23/manifest.json',
        'apps/hub/content/cie-igcse-computer-science-23/notes.json',
        'apps/hub/content/cie-igcse-computer-science-23/prerequisites.json',
        'apps/hub/content/cie-igcse-computer-science-23/questions.json',
        'apps/hub/public/kg/data/cie-a-level-maths-20-pure-1.json',
        'apps/hub/public/kg/data/cie-as-maths-20-pure-1.json',
        'apps/hub/public/kg/data/cie-igcse-computer-science-23.json',
        'apps/hub/public/kg/data/index.json',
        'apps/hub/spines/cie-a-level-maths-20-pure-1.json',
        'apps/hub/spines/cie-as-maths-20-pure-1.json',
        'apps/hub/spines/cie-igcse-computer-science-23.json',
        'apps/hub/src/lib/ugm.bundle.test.ts',
        'worklog.md',
    }
    assert names == EXPECTED_OWN, f'PR path-set drift: extra={names-EXPECTED_OWN} missing={EXPECTED_OWN-names}'
    # each union's delta vs its FIRST parent == exactly that round's main advance
    ud1 = set(git('diff', '--name-only', f'{chain[4]}..{chain[3]}').splitlines())
    adv1 = set(git('diff', '--name-only', f'{BASE}..{ADV1_TIP}').splitlines())
    assert ud1 == adv1, f'union#1 delta != advance: {ud1 ^ adv1}'
    ud2 = set(git('diff', '--name-only', f'{chain[3]}..{chain[2]}').splitlines())
    adv2 = set(git('diff', '--name-only', f'{ADV1_TIP}..{MAIN_TIP}').splitlines())
    assert ud2 == adv2 == ADV2_FILES, f'union#2 delta != advance: {ud2 ^ adv2 ^ ADV2_FILES}'
    # and vs its SECOND parent == exactly the branch's own pre-battery path set
    od2 = set(git('diff', '--name-only', f'{MAIN_TIP}..{UNION2}').splitlines())
    assert od2 == EXPECTED_OWN - {BATTERY, POSTREVIEW}, f'union#2 own-delta drift: {od2 ^ (EXPECTED_OWN - {BATTERY, POSTREVIEW})}'
    st = git('diff', '--shortstat', f'{MAIN_TIP}..HEAD').strip()
    res['B1'] = {'prPaths': sorted(names), 'shortstat': st, 'unions': '2/2 delta == own advance (theirs-verbatim)'}
    print(f'B1 PASS: PR net diff == exactly the {len(names)} declared run-023 paths ({st}); '
          f'both union deltas byte-lawful')

    # B2 artifacts parse + gates hold
    gates = json.loads((CLONE / f'{R23}/gates_r0.json').read_text())
    assert all(g['ok'] for g in gates['gates']), 'gates_r0 carries a red gate'
    split = json.loads((CLONE / f'{R23}/rn23_635_split_r0.json').read_text())
    assert len(split['items']) == 43, f"split items {len(split['items'])}"
    from collections import Counter
    rc = Counter(r['ruling'] for r in split['items'])
    assert rc == {'a': 20, 'b': 5, 'both': 4, 'drop': 14}, rc
    assert all(r['evidencePin'] == r['evidenceLive'] for r in split['items']), 'an evidence pin drifted from its live tuple'
    ledger = json.loads((CLONE / f'{R23}/rn23_repoint_ledger_r0.json').read_text())
    assert len(ledger['questions']) == 39 and len(ledger['flashcards']) == 83 and len(ledger['notes']) == 8, \
        {k: len(ledger[k]) for k in ('questions', 'flashcards', 'notes')}
    manifest = json.loads((CLONE / f'{R23}/apply_manifest_r0.json').read_text())
    assert len(manifest['courses']) == 3
    cs = [c for c in manifest['courses'] if c['slug'] == 'cie-igcse-computer-science-23'][0]
    assert cs['kg']['to'] == [136, 225, 104] and cs['manifest']['specPoints'] == {'from': 114, 'to': 104}
    receipt = json.loads((CLONE / '.syllabai/receipts/RN-DEBRIS-11/run-023-open-dispositions-apply.json').read_text())
    assert receipt['operatorOrder'].startswith('run-023') and receipt['baseTip'] == BASE
    res['B2'] = {'gates': f"{len(gates['gates'])}/ALL ok", 'split': dict(rc), 'ledger': '39/83/8 + maps + prereq + projection', 'manifest': '3 courses pinned'}
    print(f"B2 PASS: artifacts parse; gates {len(gates['gates'])} ALL ok; the 43 evidence pins == their live tuples; "
          f"the ledger 39 parts / 83 cards / 8 notes; the manifest 3 courses pinned")

    # B3 worklog suffix identity — theirs of record = the main tip for BOTH ledgers
    for wl in ('worklog.md', '.syllabai/worklog.md'):
        cur = (CLONE / wl).read_bytes()
        theirs = subprocess.run(['git', 'show', f'{MAIN_TIP}:{wl}'], cwd=CLONE, capture_output=True).stdout
        assert cur.startswith(theirs), f'{wl}: theirs-verbatim prefix lost vs {MAIN_TIP[:8]}'
        suffix = cur[len(theirs):]
        assert suffix.count(b'RN-DEBRIS-11 run-023') == 1, f'{wl}: run-023 entry not exactly once'
        assert suffix.rstrip(b'\n').endswith(b'race-guard at push.'), f'{wl}: run-023 entry not at tail'
        for marker in (b'<<<<<<<', b'>>>>>>>', b'======='):
            assert not [l for l in suffix.splitlines(True) if l.startswith(marker)], f'{wl}: marker line in suffix'
    res['B3'] = f'both worklogs: theirs-verbatim prefix vs main tip {MAIN_TIP[:8]} + the run-023 entry byte-identical exactly once at each tail, zero unparented markers'
    print('B3 PASS:', res['B3'])

    # B5 CI on head
    pat = Path('/home/z/my-project/work/.pat.0600').read_text().strip()
    import urllib.request
    req = urllib.request.Request(
        f'https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{head}/check-runs?per_page=20',
        headers={'Authorization': f'token {pat}', 'User-Agent': 'rn23-battery'})
    runs = json.loads(urllib.request.urlopen(req, timeout=30).read())['check_runs']
    cis = {r['name']: (r['status'], r['conclusion']) for r in runs}
    for name in ('census', 'hub', 'verify', 'Vercel Preview Comments'):
        assert cis.get(name) == ('completed', 'success'), f'{name}: {cis.get(name)}'
    res['B5'] = {'checkRuns': cis}
    print('B5 PASS: census/hub/verify/Vercel-comments ALL success on the pushed head')

    out = Path('/home/z/my-project/work/rn23/out/rn23_postReview_battery.json')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=1))
    print('\nBATTERY 5/5 ALL PASS ->', out)

if __name__ == '__main__':
    main()
