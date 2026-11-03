#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-017 tranche-2: WHOLE-FIELD S1 census.

Tranche-1 census (s1-census-linecontext.json, 702/345/65) was line-context —
a disclosed LOWER bound. Tranche-2 classes per tranche-1 receipt newLeadsQueued:
  W  whole-field S1 (digit letter digit, spaced variant — tranche-1 signature, no line anchoring)
  XL cross-line token splits      (digit \n letter ...)
  X10 glued standard form         ([x×]10<digits> with no space — '×1099' class)
  GS  glued-superscript digit run (digit 0{2,} digit — the order-24 '20002' = 2000^2 class)
  OA operator-adjacent exponent   (digit + letter + operator + digit — the '3 x+ 6' = 3^(x+6) class)

Severity: problemMd > solutionMd > markPoints[0] textMd. Output: this dir / s1-census-wholefield.json
READ-ONLY on the plane (no writes).
"""
import json, re, hashlib, sys
from collections import defaultdict

REPO = "/home/z/my-project/repos/syllabai-v2"
PLANE = f"{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json"
OUT = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-017/s1-census-wholefield.json"

raw = open(PLANE, "rb").read()
data = json.loads(raw)

# ---- census pins (law of record) ----
sets_n = len(data)
q_n = sum(len(s.get("questions") or []) for s in data)
part_n = sum(len(q.get("parts") or []) for s in data for q in s.get("questions") or [])
marks_n = sum((p.get("marks") or 0) for s in data for q in s.get("questions") or [] for p in q.get("parts") or [])
pins = {"sets": sets_n, "questions": q_n, "parts": part_n, "marks": marks_n}
EXPECT = {"sets": 66, "questions": 1281, "parts": 2443, "marks": 6600}
pins_ok = pins == EXPECT
plane_sha16 = hashlib.sha256(raw).hexdigest()[:16]

P = {
 "W_spaced":  re.compile(r"\d +[a-z] +\d"),
 "XL_crossline": re.compile(r"\d *\n *[a-z]"),
 "X10_glued": re.compile(r"[x×]10\d"),
 "GS_gluedsup": re.compile(r"\d0{2,}\d"),
 "OA_opadj": re.compile(r"\d +[a-z] *[+\-^] *\d"),
}
FIELD_W = {"problemMd": 3, "solutionMd": 2, "markPoints": 1}

hits = []
def scan(set_slug, q, p):
    pid, qid = p.get("id"), q.get("id")
    qorder, porder = q.get("order"), p.get("order")
    def emit(cls, field, m):
        s = max(0, m.start() - 70); e = min(len(txt), m.end() + 70)
        hits.append({
            "class": cls, "paper": set_slug, "qid": qid, "qorder": qorder,
            "part": porder, "pid": pid, "field": field,
            "hit": m.group(0), "ctx": txt[s:e].replace("\n", "\\n"),
            "sev": FIELD_W[field],
        })
    for field in ("problemMd", "solutionMd"):
        txt = p.get(field) or ""
        if not txt: continue
        for cls, rx in P.items():
            for m in rx.finditer(txt):
                emit(cls, field, m)
    mps = p.get("markPoints") or []
    if mps and (txt := (mps[0].get("textMd") or "")):
        for cls, rx in P.items():
            for m in rx.finditer(txt):
                emit(cls, "markPoints", m)

for s in data:
    slug = s.get("slug")
    for q in s.get("questions") or []:
        for p in q.get("parts") or []:
            scan(slug, q, p)

# per-part severity = max field weight; per-hit kept raw
for h in hits:
    pass  # sev already per-field

partmap = defaultdict(int)
papermap = defaultdict(set)
for h in hits:
    partmap[(h["paper"], h["pid"])] = max(partmap[(h["paper"], h["pid"])], h["sev"])
    papermap[h["paper"]].add(h["pid"])

byclass = defaultdict(int)
byclass_parts = defaultdict(set)
for h in hits:
    byclass[h["class"]] += 1
    byclass_parts[h["class"]].add((h["paper"], h["pid"]))

# severity-first ordering: paper parts desc, then problemMd hits desc
paper_rank = sorted(papermap.items(), key=lambda kv: -len(kv[1]))
summary = {
    "card": "T-OEQ-MATHSB-SERVE-1",
    "run": "run-017 tranche-2 whole-field S1 census (READ-ONLY)",
    "date": "2026-10-28",
    "planeSha16": plane_sha16,
    "pins": pins, "pinsExpected": EXPECT, "pinsOk": pins_ok,
    "totalHits": len(hits),
    "byClass": dict(byclass),
    "byClassParts": {k: len(v) for k, v in byclass_parts.items()},
    "affectedParts": len(partmap),
    "affectedPapers": len(papermap),
    "paperRankTop20": [{"paper": k, "parts": len(v)} for k, v in paper_rank[:20]],
    "note": "lead list, NOT verdicts; whole-field scan supersedes line-context lower bound 702/345/65",
}
art = {"summary": summary, "hits": sorted(hits, key=lambda h: (-h["sev"], h["paper"], h["qid"]))}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(art, f, ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1))
