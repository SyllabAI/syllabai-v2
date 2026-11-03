#!/usr/bin/env python3
"""run-012 MS-page finder for the eyes-on matrix groups: scores MS pages by
distinctive-token hits from the part's solutionMd and renders top-2 candidates."""
import json, re, os, urllib.request, ssl
import fitz

OUT = '/home/z/my-project/download/t-oeq-mathsb/run012'
MIRROR = ('https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/'
          'past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers')
MONTH = {'January': '01', 'June': '06', 'October': '10', 'November': '11'}


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        return dest
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={'User-Agent': 'syllabai-run012'})
    with urllib.request.urlopen(req, timeout=60, context=ctx) as r, open(dest, 'wb') as fh:
        fh.write(r.read())
    return dest


def group_key(it):
    return f"{it['series'].replace('-', '')}_{it['paper']}_q{it['qnum']}"


def main():
    items = []
    for f in ('w2-A1', 'w2-A2', 'w2-A3', 'w2-A4'):
        items += json.load(open(f'{OUT}/slices/{f}.json'))['items']
    # only groups whose decisive evidence is the MS (solutionMd/markPoints hits)
    groups = {}
    for it in items:
        fields = {x['field'] for x in items if x['pid'] == it['pid']}
        if fields <= {'problemMd'}:
            continue
        groups.setdefault((it['series'], it['paper'], it['qnum']), []).append(it)
    plan = {}
    for (series, paper, qnum), its in sorted(groups.items()):
        tag = f"{series.replace('-', '')}_{paper}_q{qnum}"
        try:
            pdf = fetch(f'{MIRROR}/{series}/4MB1-{paper}/ms.pdf', f'{OUT}/pdfs/{tag}_ms.pdf')
        except Exception as e:
            plan[tag] = {'error': str(e)}
            continue
        doc = fitz.open(pdf)
        # distinctive tokens: longest words + distinctive numbers from solution text
        text = ' '.join((x.get('text') or '') for x in its)
        words = [w for w in re.findall(r'[a-zA-Z]{4,}', text.lower())]
        nums = [n for n in re.findall(r'\d+\.\d+|\d{3,}', text)]
        toks = sorted(set(words), key=len, reverse=True)[:6] + list(set(nums))[:4]
        scores = []
        for i in range(doc.page_count):
            pt = doc[i].get_text().lower()
            s = sum(2 if t in pt else 0 for t in toks)
            if re.search(rf'\b0?{qnum}\b', pt):
                s += 1
            scores.append((s, i))
        scores.sort(reverse=True)
        top = [i for s, i in scores[:2] if s > 0]
        for k in top[:2]:
            doc[k].get_pixmap(matrix=fitz.Matrix(2.4, 2.4)).save(f'{OUT}/evidence/{tag}_p{k}_ms.png')
        plan[tag] = {'tokens': toks[:8], 'pages': top[:2],
                     'scores': [(i, s) for s, i in scores[:3]]}
        doc.close()
    json.dump(plan, open(f'{OUT}/ms_page_plan.json', 'w'), indent=1)
    for k, v in plan.items():
        print(k, v.get('pages'), v.get('error', ''))


if __name__ == '__main__':
    main()
