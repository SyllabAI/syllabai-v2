#!/usr/bin/env python3
r"""T-OEQ-MATHSB-SERVE-1 run-020: live re-census of the G1/G2/G3/G4 buckets
over the OFFICIAL plane at the post-run-019 pin (701ae1997de5421a).

Operator order (this session): "the G1/G2/G3/G4 buckets (incl. the 159
Pythagoras/cosine-rule leads)" — the run-019 residual discharged.

Instrument: byte-clone of run-018 run018_gs_census.py (class regexes and
stripping law UNCHANGED), with two additions:
  - OUT redirected to run-022/gs-census-post-run022.json
  - full frag capture (<=6 per class) + a trigProjection section listing every
    Pythagoras/cosine-rule-bucket lead with per-class per-field fragments
    (input to the eyes-on adjudication worksheet).
LEADS ARE FILED, NOT EXECUTED by this script (fleet-census law).

Classes scanned on math-span-stripped text (raw $...$ AND \$...\$ removed):
  G1 glued-sup direct    : lowercase letter immediately followed by 1-3 digits
  G2 detached-sup        : lowercase letter space 1-2 digits
  G3 coef-var-exp        : digit space lowercase letter space 1-2 digits
  G4 2D-flatten exponent : bare exponent line ("2"/"3") after line ending letter/paren
  B1 bare caret          : literal ^ outside any math span (expect 0 post-run-019)
  P1 PUA/control glyphs  : U+E000-F8FF, U+298B/298C, U+2061-2064, U+FEFF, U+200B, U+FFFD
Fields scanned: problemMd, solutionMd, markPoints[].textMd.
Mark-label false positives (**P1**, A1 cao, 4MB1) stripped before scanning.
"""
import json, re, os, hashlib

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
OUT = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-022/gs-census-post-run022.json'

RE_MARKLABEL = re.compile(r'\*\*[A-Z]\d+\*\*|\b4MB1\b')
RE_G1 = re.compile(r'[a-z]\d{1,3}(?![\d.])')
RE_G2 = re.compile(r'[a-z] \d{1,2}(?![\d.])')
RE_G3 = re.compile(r'\d [a-z] \d{1,2}(?![\d.])')
RE_G4 = re.compile(r'(?:[A-Za-z\)\]]|\*\*)\n\s*([23])\s*\n')
RE_B1 = re.compile(r'\^')
PUA = re.compile(r'[\uE000-\uF8FF\u298B\u298C\u2061-\u2064\uFEFF\u200B\uFFFD]')
RE_TRIG = re.compile(
    r'pythagoras|cosine\s+rule|sine\s+rule|hypotenuse|bearing|elevation|depression'
    r'|right.angle|trigonometr|\b(?:sin|cos|tan)\s*\d+|\b(?:sin|cos|tan)\s*20\b',
    re.IGNORECASE)

def strip_math(t: str) -> str:
    t = re.sub(r'\$[^$]*\$', ' ', t)          # raw $...$ math
    t = re.sub(r'\\\$[^$]*\\\$', ' ', t)      # escaped \$...\$ math
    return RE_MARKLABEL.sub(' ', t)

def frag(v: str, m: re.Match, w: int = 40) -> str:
    a, b = max(0, m.start() - w), min(len(v), m.end() + w)
    return v[a:b].replace('\n', ' / ')

plane_sha = hashlib.sha256(open(PLANE, 'rb').read()).hexdigest()[:16]
data = json.load(open(PLANE))
leads = []
part_scan = 0
fields_scanned = 0
for s in data:
    for q in s['questions']:
        for p in q['parts']:
            part_scan += 1
            texts = []
            for k in ('problemMd', 'solutionMd'):
                if p.get(k):
                    texts.append((k, p[k]))
            for mp in (p.get('markPoints') or []):
                if mp.get('textMd'):
                    texts.append((f"markPoints[{mp.get('id','?')}].textMd", mp['textMd']))
            trig = bool(RE_TRIG.search(' '.join(t for _, t in texts)))
            hits = {}
            for k, v in texts:
                fields_scanned += 1
                stripped = strip_math(v)
                for cls, rx in (('G1', RE_G1), ('G2', RE_G2), ('G3', RE_G3), ('G4', RE_G4), ('B1', RE_B1)):
                    ms = list(rx.finditer(stripped))
                    if ms:
                        h = hits.setdefault(cls, {'count': 0, 'fields': {}, 'frags': []})
                        h['count'] += len(ms)
                        h['fields'][k] = h['fields'].get(k, 0) + len(ms)
                        if len(h['frags']) < 6:
                            h['frags'].append(frag(stripped, ms[0]))
                gm = list(PUA.finditer(stripped))
                if gm:
                    h = hits.setdefault('P1', {'count': 0, 'fields': {}, 'frags': []})
                    h['count'] += len(gm)
                    h['fields'][k] = h['fields'].get(k, 0) + len(gm)
                    if len(h['frags']) < 6:
                        h['frags'].append(''.join(gm[0].group(0))[:8] + ' @ ' + frag(stripped, gm[0]))
            if hits:
                sp = p.get('sourcePaper') or {}
                tag = f"{s['topicSlug']} q{sp.get('questionNumber')}{sp.get('questionPart') or ''}"
                leads.append({
                    'part': tag, 'pid': p['id'], 'fields': [k for k, _ in texts],
                    'pythagorasCosineRuleBucket': trig, 'hits': hits,
                })

def tot(l, cls):
    return l['hits'][cls]['count'] if cls in l['hits'] else 0

summary = {}
for cls in ('G1', 'G2', 'G3', 'G4', 'B1', 'P1'):
    ls = [l for l in leads if cls in l['hits']]
    tb = [l for l in ls if l['pythagorasCosineRuleBucket']]
    summary[cls] = {'parts': len(ls), 'trigBucketParts': len(tb)}
    print(f"{cls}: {len(ls)} parts ({len(tb)} in Pythagoras/cosine-rule bucket)")

trig_leads = [l for l in leads if l['pythagorasCosineRuleBucket']]
print(f"\n=== Pythagoras/cosine-rule bucket leads: {len(trig_leads)} (of {len(leads)} total lead parts) ===")

# trig projection: every trig-bucket lead, per-class per-field frags (adjudication input)
trig_projection = []
for l in trig_leads:
    proj = {'part': l['part'], 'pid': l['pid'], 'fields': l['fields'], 'classes': {}}
    for cls in ('G1', 'G2', 'G3', 'G4', 'B1', 'P1'):
        if cls in l['hits']:
            proj['classes'][cls] = {'count': l['hits'][cls]['count'], 'frags': l['hits'][cls]['frags']}
    trig_projection.append(proj)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
art = {
    'lane': 'T-OEQ-MATHSB-SERVE-1 run-020',
    'operatorOrder': 'the G1/G2/G3/G4 buckets (incl. the 159 Pythagoras/cosine-rule leads) — run-019 residual discharged',
    'planeSha16': plane_sha,
    'baseInstrument': 'run-018 run018_gs_census.py byte-clone (class regexes + stripping law UNCHANGED); additions: OUT redirect + full frag capture + trigProjection',
    'censusPosture': 'strict pattern census, per-part adjudication required (run-017 fleet-census law); leads FILED not executed',
    'classificationDisclosure': 'official plane carries EMPTY specPointCodes fleet-wide (0/2443); Pythagoras/cosine-rule bucket is KEYWORD-classified (RE_TRIG markers listed in source), per-part adjudication required',
    'planeCountsScanned': {'sets': len(data), 'parts': part_scan, 'fields': fields_scanned},
    'classSummary': summary,
    'trigBucketLeadCount': len(trig_leads),
    'leadCount': len(leads),
    'trigProjection': trig_projection,
    'leads': leads,
}
json.dump(art, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f"\nartifact written: {OUT} ({os.path.getsize(OUT)//1024} KB)")
