#!/usr/bin/env python3
"""UIUX-TIER-B run-004 — R4-A visual crop renderer.
Dedupes candidates per part, locates the MS page via pdftotext page map,
renders a high-zoom crop around the matching region for eyes-on adjudication."""
import json, os, re, fitz

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, 'pdf')

rows = json.load(open(os.path.join(HERE, 'r4a-worksheet.json')))

# dedupe by (slug, q, part) keeping all frags
parts = {}
for r in rows:
    k = (r['slug'], r['q'], r['part'])
    parts.setdefault(k, []).append(r)

def ms_pages(slug):
    m = re.match(r'(\d{4}-\d{2})-4mb1-(\d{2}r?)', slug)
    txt = os.path.join(HERE, f"ms-{m.group(1)}-{m.group(2).upper()}.txt")
    if not os.path.isfile(txt):
        return None
    pages = open(txt, encoding='utf-8', errors='replace').read().split('\f')
    return pages

def score(hay, needle_ctx):
    a = set(re.findall(r'[a-z0-9]+', hay.lower()))
    b = set(re.findall(r'[a-z0-9]{3,}', needle_ctx.lower()))
    return len(a & b)

out = []
for (slug, qn, pi), rs in sorted(parts.items()):
    ctx = rs[0]['bundle_ctx']
    pages = ms_pages(slug)
    if not pages:
        out.append({**rs[0], 'page': None, 'crop': None, 'error': 'no layout txt'})
        continue
    best_pn, best_s = None, -1
    for pn, ptext in enumerate(pages):
        sc = score(ptext, ctx)
        if sc > best_s:
            best_s, best_pn = sc, pn
    if best_pn is None or best_s < 3:
        out.append({**rs[0], 'page': None, 'crop': None, 'error': f'page-loc weak ({best_s})'})
        continue
    m = re.match(r'(\d{4}-\d{2})-4mb1-(\d{2}r?)', slug)
    pdf = os.path.join(PDF, f"{m.group(1)}-4MB1-{m.group(2).upper()}-ms.pdf")
    doc = fitz.open(pdf)
    page = doc[best_pn]
    # search for a distinctive needle from the ms_line
    needles = [w for w in re.findall(r'[A-Za-z0-9=±√]{2,}', rs[0].get('ms_line') or '') if len(w) >= 3][:8]
    rect = None
    for nd in needles:
        hits = page.search_for(nd)
        if hits:
            rect = hits[0]
            break
    if rect is None:
        # fall back: full page render
        clip = None
    else:
        clip = fitz.Rect(max(0, rect.x0-260), max(0, rect.y0-40),
                         min(page.rect.x1, rect.x1+260), min(page.rect.y1, rect.y1+40))
    pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, colorspace=fitz.csGRAY)
    name = f"r4a-{slug[:10]}-q{qn}p{pi}.png"
    pix.save(os.path.join(HERE, name))
    out.append({'slug': slug, 'q': qn, 'part': pi, 'frags': [r['frag'] for r in rs],
                'classes': [r['class'] for r in rs], 'page': best_pn+1, 'crop': name,
                'ms_line': rs[0].get('ms_line'), 'bundle_ctx': ctx})
    doc.close()

json.dump(out, open(os.path.join(HERE, 'r4a-crops.json'), 'w'), indent=1)
print('parts to adjudicate:', len(out))
ok = sum(1 for o in out if o.get('crop'))
print('crops rendered:', ok, '| failures:', len(out)-ok)
for o in out:
    if not o.get('crop'):
        print('  FAIL:', o['slug'], f"q{o['q']}p{o['part']}", o.get('error'))
