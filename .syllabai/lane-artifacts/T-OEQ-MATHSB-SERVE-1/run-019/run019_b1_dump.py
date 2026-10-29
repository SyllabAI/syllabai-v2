#!/usr/bin/env python3
r"""T-OEQ-MATHSB-SERVE-1 run-019 (B1 follow-up wave): dump current caret contexts
for the 21 B1 bare-caret pids from gs-leads-census.json against the CURRENT plane.
Verifies q27-b problemMd already fixed (run-018) and emits the working manifest."""
import json, re

PLANE = '/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json'
CENSUS = '/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-018/gs-leads-census.json'
RE_MARKLABEL = re.compile(r'\*\*[A-Z]\d+\*\*|\b4MB1\b')

def strip_math(t):
    t = re.sub(r'\$[^$]*\$', ' ', t)
    t = re.sub(r'\\\$[^$]*\\\$', ' ', t)
    return RE_MARKLABEL.sub(' ', t)

census = json.load(open(CENSUS))
b1_pids = [l['pid'] for l in census['leads'] if 'B1' in l.get('hits', {})]
data = json.load(open(PLANE))

index = {}
for s in data:
    for q in s['questions']:
        for p in q['parts']:
            index[p['id']] = (s, q, p)

print(f'B1 pids: {len(b1_pids)}; plane parts indexed: {len(index)}')
manifest = []
for pid in b1_pids:
    if pid not in index:
        print(f'!! MISSING from current plane: {pid}')
        continue
    s, q, p = index[pid]
    texts = []
    for k in ('problemMd', 'solutionMd'):
        if p.get(k):
            texts.append((k, p[k]))
    for mp in (p.get('markPoints') or []):
        if mp.get('textMd'):
            texts.append((f"markPoints[{mp.get('id','?')}].textMd", mp['textMd']))
    entry = {'pid': pid, 'set': s.get('topicSlug'), 'fields': []}
    print(f'===== {pid} ({s.get("topicSlug")}) =====')
    for k, v in texts:
        stripped = strip_math(v)
        hits = [m.start() for m in re.finditer(r'\^', stripped)]
        if not hits:
            continue
        print(f'  -- {k}: {len(hits)} bare caret(s)')
        shown = set()
        for pos in hits:
            key = pos // 60
            if key in shown:
                continue
            shown.add(key)
            a, b = max(0, pos - 60), min(len(v), pos + 70)
            ctx = v[a:b].replace('\n', ' / ')
            print(f'     ctx: {ctx}')
        entry['fields'].append({'field': k, 'carets': len(hits)})
    manifest.append(entry)

json.dump(manifest, open('/home/z/my-project/scripts/run019_b1_manifest.json', 'w'),
          ensure_ascii=False, indent=1)
print(f'\nmanifest parts: {len(manifest)} -> /home/z/my-project/scripts/run019_b1_manifest.json')

# q27-b verification of record
s, q, p = index['offp_2026-06_01r_27-b']
print('\nq27-b problemMd NOW:', repr(p['problemMd'][:120]))
