#!/usr/bin/env python3
"""T-SPEC-REPARSE-1 run-001 — land the repaired spines into the serving-plane
content bundles (v2 hub). Title authority = the of-record spine (Stage 1).
- title-only courses: SPEC_POINT titles patched by code from the spine
- EMM: nodes+edges replaced wholesale (5 spurious dup rows dropped upstream)
- manifest.officialSpine.resourcesSha re-stamped to the resources pin
- each file keeps its own serialization (indent=1 vs compact) byte-law
Idempotent; zero invention (titles verbatim from the spine)."""
import json

HUB = '/home/z/my-project/repos/syllabai-v2/apps/hub'
PIN = 'e9e86e22239c20ea0fcdd5a91e076c88c5ae62ec'

COURSES = [
    'cie-a-level-chemistry-25',
    'cie-a-level-maths-20-probability-and-statistics-1',
    'cie-a-level-maths-20-probability-and-statistics-2',
    'cie-a-level-maths-20-pure-1',
    'cie-a-level-maths-20-pure-3',
    'cie-as-environmental-management-20',
    'cie-igcse-business-23',
    'cie-as-chemistry-25',
    'cie-as-maths-20-probability-and-statistics-1',
    'cie-as-maths-20-pure-1',
    'ial-physics-19',
    # T-SPEC-REPARSE-1 run-002: the ial-maths unit fleet
    'ial-maths-20-pure-1',
    'ial-maths-20-pure-2',
    'ial-maths-20-pure-3',
    'ial-maths-20-pure-4',
    'ial-maths-20-mechanics-1',
    'ial-maths-20-mechanics-2',
    'ial-maths-20-statistics-1',
    'ial-maths-20-statistics-2',
    'ial-maths-20-decision-1',
    'ial-further-maths-18-further-pure-1',
]
WHOLESALE = {'cie-as-environmental-management-20'}


def ser_style(raw, obj):
    for name, s in (('indent1', json.dumps(obj, indent=1, ensure_ascii=False)),
                    ('compact', json.dumps(obj, separators=(',', ':'), ensure_ascii=False)),
                    ('indent2', json.dumps(obj, indent=2, ensure_ascii=False))):
        if s == raw or s + '\n' == raw or s == raw + '\n':
            return name
    return 'indent1'


def dump(obj, style, raw):
    s = json.dumps(obj, **({'indent': 1} if style == 'indent1' else
                           {'indent': 2} if style == 'indent2' else
                           {'separators': (',', ':')}), ensure_ascii=False)
    if raw.endswith('\n'):
        s += '\n'
    return s


for slug in COURSES:
    sp = json.load(open(f'{HUB}/spines/{slug}.json'))
    cur_path = f'{HUB}/content/{slug}/curriculum.json'
    raw = open(cur_path).read()
    cur = json.loads(raw)
    style = ser_style(raw, cur)
    sp_nodes = {n['code']: n for n in sp['curriculum']['nodes']}
    changed = 0
    if slug in WHOLESALE:
        cur['nodes'] = sp['curriculum']['nodes']
        cur['edges'] = sp['curriculum']['edges']
        changed = len(sp_nodes)
    else:
        for n in cur['nodes']:
            code = n.get('code')
            if code in sp_nodes and n.get('title') != sp_nodes[code].get('title'):
                n['title'] = sp_nodes[code]['title']
                changed += 1
    out = dump(cur, style, raw)
    open(cur_path, 'w').write(out)
    # manifest stamp
    man_path = f'{HUB}/content/{slug}/manifest.json'
    mraw = open(man_path).read()
    man = json.loads(mraw)
    mstyle = ser_style(mraw, man)
    if 'officialSpine' in man.get('curriculum', {}):
        man['curriculum']['officialSpine']['resourcesSha'] = PIN
    elif 'officialSpine' in man:
        man['officialSpine']['resourcesSha'] = PIN
    open(man_path, 'w').write(dump(man, mstyle, mraw))
    print(f'{slug}: {changed} titles patched, style={style}')
print('landing complete')
