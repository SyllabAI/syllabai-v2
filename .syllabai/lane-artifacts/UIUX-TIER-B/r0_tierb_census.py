#!/usr/bin/env python3
"""UIUX-TIER-B census of record (read-only), trace 1a16943085ba99ad.

Plane A: fleet-wide REF-law audit — every question group referencing diagrams with NO
img embed, cross-referenced against the committed resources inventory (per-paper
assets-index question numbers) -> classification: SOFT-SKIP (asset exists, embed
missing -> embed close) vs NO-ASSET (empty surface / table / unlocatable).

Plane B: flattened fraction/table/axis debris census (lane-2 residuals of record):
box-paren glyphs, 10n literal-n, NNq degree debris, slash-fraction prose, en-dash
table cells.
"""
import json, re, os, collections

BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
RES = '/home/z/my-project/ws/syllabai-resources-art3/SME-ExamQuestion/igcse-maths-b-16/past-papers'
STAGING = '/home/z/my-project/scripts/artwork-scale/resources-staging/SME-ExamQuestion/igcse-maths-b-16/past-papers'

REF = re.compile(r"\b(diagram|grid|graph|shown below|shown in the|the figure|net of|scale drawing|centimetre squares|isometric|protractor|compasses|triangles? \w+ (?:and|to)|number line|pie chart|tree diagram|Venn|bar chart|prism|axes)\b", re.I)
IMG = re.compile(r'!\[[^\]]*\]\([^)]+\)')

d = json.load(open(BUNDLE, encoding='utf-8'))
print(f"bundle: {len(d)} sets, {sum(len(s['questions']) for s in d)} questions")

# --- resources inventory: paper key -> {question: [files]} ---
def paperkey(session, paper):
    return f"{session}/{paper}"

def slug_from(session, paper):
    return f"{session}-4mb1-{paper.lower()}--exam-questions"

inv = {}
for root in (RES, STAGING):
    if not os.path.isdir(root):
        continue
    for sess in sorted(os.listdir(root)):
        sdir = os.path.join(root, sess)
        if not os.path.isdir(sdir):
            continue
        for pap in sorted(os.listdir(sdir)):
            pdir = os.path.join(sdir, pap)
            idx = os.path.join(pdir, 'assets-index.json')
            pk = paperkey(sess, pap)
            if pk not in inv:
                inv[pk] = {}
            if os.path.isfile(idx):
                ai = json.load(open(idx))
                for a in ai.get('assets', []):
                    inv[pk].setdefault(int(a['question']), []).append(a['file'])
print(f"resources inventory: {len(inv)} papers, {sum(len(v) for v in inv.values())} asset-question entries")

# --- Plane A: REF audit ---
softskips, noasset, tableclass = [], [], []
slugset = {s['slug'] for s in d}
for s in d:
    # derive paper key from slug: 2023-01-4mb1-01--exam-questions -> 2023-01/01
    m = re.match(r'(\d{4}-\d{2})-4mb1-(\d{2}r?)--exam-questions', s['slug'])
    if not m:
        continue
    pk = paperkey(m.group(1), m.group(2).upper())
    assets = inv.get(pk, {})
    for qi, q in enumerate(s['questions']):
        parts = q.get('parts', [])
        if not parts:
            continue
        merged = '\n'.join((p.get('problemMd') or '') for p in parts)
        has_img = bool(IMG.search(merged))
        if has_img:
            continue
        if not REF.search(merged):
            continue
        # question number from first part label
        lbl = str(parts[0].get('label', ''))
        qn = None
        mm = re.match(r'(\d+)', lbl)
        if mm:
            qn = int(mm.group(1))
        entry = {
            'slug': s['slug'], 'paper': pk, 'qidx': qi, 'label': lbl,
            'marks': sum(p.get('marks') or 0 for p in parts),
            'asset_q': qn in assets if qn is not None else None,
            'asset_files': assets.get(qn, []) if qn is not None else [],
            'preview': ' | '.join((p.get('problemMd') or '').replace('\n', ' ')[:130] for p in parts[:2])[:400],
        }
        # classify flattened table rows (box-drawing / aligned pipes / dotted leaders)
        if re.search(r'[⎛⎜⎝⎡⎣⎢⎤⎦⎥]|\.{6,}|═{3,}', merged):
            entry['class'] = 'table-flat'
            tableclass.append(entry)
        elif entry['asset_q']:
            entry['class'] = 'soft-skip'
            softskips.append(entry)
        else:
            entry['class'] = 'no-asset'
            noasset.append(entry)

print(f"\n=== PLANE A: REF-hit questions with NO embed ===")
print(f"soft-skip (asset committed, embed missing): {len(softskips)}")
print(f"table-flat (flattened table rows):          {len(tableclass)}")
print(f"no-asset (nothing committed):               {len(noasset)}")

print("\n--- SOFT-SKIP DETAIL (Tier-B embed closes) ---")
for e in softskips:
    print(f"  {e['slug']} q{e['label']} marks={e['marks']} assets={e['asset_files']}")
    print(f"      {e['preview'][:200]}")

print("\n--- TABLE-FLAT DETAIL ---")
for e in tableclass:
    print(f"  {e['slug']} q{e['label']} marks={e['marks']}")
    print(f"      {e['preview'][:200]}")

print("\n--- NO-ASSET DETAIL (empty surfaces / unlocatable / tables) ---")
for e in noasset:
    print(f"  {e['slug']} q{e['label']} marks={e['marks']}")
    print(f"      {e['preview'][:200]}")

# --- Plane B: debris census ---
def parts_of(o):
    if isinstance(o, dict):
        if 'problemMd' in o:
            yield o
        for v in o.values():
            yield from parts_of(v)
    elif isinstance(o, list):
        for v in o:
            yield from parts_of(v)

parts = list(parts_of(d))
print(f"\n=== PLANE B: debris census over {len(parts)} parts ===")
box = [p for p in parts if re.search(r'[⎛⎜⎝⎡⎣⎢⎤⎦⎥]', p.get('problemMd', ''))]
ten_n = [p for p in parts if re.search(r'\b10\s?n\b', p.get('problemMd', ''))]
nnq = [p for p in parts if re.search(r'\b\d{2,3}q\b', p.get('problemMd', ''))]
slashfrac = [p for p in parts if re.search(r'(?<![A-Za-z0-9$(])\d{1,3}/\d{1,3}(?![A-Za-z0-9\]])', p.get('problemMd', ''))]
endash = [p for p in parts if re.search(r'\d\s?[–—]\s?\d', p.get('problemMd', ''))]
print(f"box-paren flattened parts:   {len(box)}")
print(f"10n literal-n parts:         {len(ten_n)}")
print(f"NNq degree-debris parts:     {len(nnq)}")
print(f"slash-fraction prose parts:  {len(slashfrac)}")
print(f"en-dash cell parts:          {len(endash)}")

print("\n--- 10n DETAIL ---")
for p in ten_n[:12]:
    t = p.get('problemMd', '')
    m = re.search(r'.{60}\b10\s?n\b.{60}', t, re.S)
    print('  •', (m.group(0) if m else t[:120]).replace('\n', ' ⏎ '))

print("\n--- NNq DETAIL ---")
for p in nnq[:12]:
    t = p.get('problemMd', '')
    m = re.search(r'.{50}\b\d{2,3}q\b.{50}', t, re.S)
    print('  •', (m.group(0) if m else t[:110]).replace('\n', ' ⏎ '))

print("\n--- BOX-PAREN worst parts (first 10) ---")
for p in box[:10]:
    t = p.get('problemMd', '')
    print('  •', t[:260].replace('\n', ' ⏎ '))
    print('    ---')
