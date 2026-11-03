#!/usr/bin/env python3
"""run-008 census: official-papers.json paragraph-flattened table candidates.
A flattened table = table content mashed into prose (space-joined cells) or
multi-line interleaved debris. Mechanical candidate net + full-text dump for
human adjudication -> pinned list lands in the run-008 artifact."""
import json, re

V2 = '/tmp/v2repo/apps/hub/content/igcse-physics-19'
NUM = re.compile(r'^-?\d+(\.\d+)?$|^-?\d+(\.\d+)?(×|x)\s*10', re.I)

def numeric_tokens(text):
    toks = re.findall(r'(?<![\w.])-?\d+(?:\.\d+)?(?![\w])', text)
    return toks

def para_table_signature(para):
    """>=6 bare numeric tokens in one paragraph AND a multi-word header-ish lead"""
    toks = numeric_tokens(para)
    return len(toks) >= 6

def main():
    d = json.load(open(f'{V2}/official-papers.json'))
    hits = []
    for s in d:
        for q in s['questions']:
            for p in q['parts']:
                for f in ('problemMd', 'solutionMd'):
                    v = p.get(f) or ''
                    if '|' in v or '<table' in v.lower():
                        continue
                    paras = [x for x in v.split('\n\n') if x.strip()]
                    for para in paras:
                        reasons = []
                        if re.search(r'\btable\b', para, re.I) and para_table_signature(para):
                            reasons.append(f'numeric-run({len(numeric_tokens(para))})+table-mention')
                        if ';;;;;' in para:
                            reasons.append('semicolon-delimiter-debris')
                        if reasons:
                            hits.append({'pid': p['id'], 'set': s['slug'], 'field': f,
                                         'reason': reasons, 'para': para.strip()})
    # dedupe per pid+field
    seen = {}
    for h in hits:
        k = (h['pid'], h['field'])
        if k not in seen:
            seen[k] = h
        else:
            seen[k]['reason'] = list(set(seen[k]['reason'] + h['reason']))
    out = sorted(seen.values(), key=lambda x: (x['set'], x['pid']))
    print(f'{len(out)} candidate pid+field pairs\n')
    for h in out:
        print('=' * 76)
        print(f"{h['pid']}  [{h['field']}]  ({h['set']})  {h['reason']}")
        print(h['para'][:600])
    with open('/home/z/my-project/scripts/run008_official_flat_candidates.json', 'w') as fo:
        json.dump(out, fo, indent=1, ensure_ascii=False)

if __name__ == '__main__':
    main()
