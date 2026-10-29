#!/usr/bin/env python3
r"""run-020 tranche-1: full field dump for the 5 operator-named top trig-bucket
leads (run-018 filing 'top:' list) + mirror-law state + dollar parity state."""
import json

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
OUT = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-020/t1_fields.json'

PIDS = [
    'offp_2023-06_02_8',        # 2023-06-02 q8
    'offp_2021-06_02_9-b',      # 2021-06-02 q9(b)
    'offp_2022-06_01r_22-a',    # 2022-06-01R q22(a)
    'offp_2026-06_01r_18',      # 2026-06-01R q18
    'offp_2025-06_02_9-a',      # 2025-06-02 q9(a)
]

data = json.load(open(PLANE))
index = {}
for s in data:
    for q in s['questions']:
        for p in q['parts']:
            index[p['id']] = (s, q, p)

out = {}
for pid in PIDS:
    if pid not in index:
        print(f'!! MISSING {pid}')
        continue
    s, q, p = index[pid]
    mps = p.get('markPoints') or []
    mp0 = (mps or [{}])[0].get('textMd', '')
    sol = p.get('solutionMd', '')
    prob = p.get('problemMd', '')
    fields = {
        'paper': s.get('topicSlug'),
        'paperCode': (p.get('sourcePaper') or {}).get('paperCode', ''),
        'marks': [(mp.get('marks'), mp.get('code')) for mp in mps],
        'problemMd': prob,
        'solutionMd': sol,
        'markPoints0': mp0,
        'mirror_ok': (mp0 == sol),
        'dollar_prob': prob.count('$'),
        'dollar_sol': sol.count('$'),
        'n_markPoints': len(mps),
        'all_markPoints': [
            {'id': mp.get('id'), 'marks': mp.get('marks'), 'code': mp.get('code'),
             'textMd_head': (mp.get('textMd') or '')[:80]} for mp in mps
        ],
    }
    out[pid] = fields
    print(f"{pid}: mirror_ok={fields['mirror_ok']} dollar_prob={fields['dollar_prob']} "
          f"dollar_sol={fields['dollar_sol']} marks={fields['marks']}")

json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(f'\nwritten: {OUT}')
