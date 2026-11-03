#!/usr/bin/env python3
"""RN-DEBRIS-10 probe: occurrence-level census for useof / dsin with context
classification. Read-only probe over apps/hub content + spines on the fetched
tip. No mutation.

Classes per occurrence:
  url      - occurrence sits inside a URL / asset-path substring
  dollar   - occurrence sits inside a $...$ span (KaTeX)
  prose    - otherwise (candidate for split law)
"""
import json, re, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/sv2-rn9")
TARGETS = ("useof", "dsin")
# walk every JSON under apps/hub (content + spines), skip derived dirs
FILES = sorted(REPO.glob("apps/hub/**/*.json"))

url_re = re.compile(r"(?:https?:)?//[^\s\"'<>]+|/[^\"'\s]*asset[^\"'\s]*|[\w\-]+\.(?:png|jpg|jpeg|svg|gif|webp|json|mp3|mp4)\b", re.I)

def classify(s: str, idx: int, tok: str):
    """Return (cls, span_kind) for occurrence at idx in string s."""
    # dollar span check: count unescaped $ before idx, odd => inside span
    dollar = False
    in_url = False
    # nearest URL match containing idx
    for m in url_re.finditer(s):
        if m.start() <= idx < m.end():
            in_url = True
            break
    # dollar spans: split on $ occurrences that are not \$ and not \$
    pos = 0
    spans = []
    dollars = [m.start() for m in re.finditer(r"(?<!\\)\$", s)]
    for a, b in zip(dollars[0::2], dollars[1::2]):
        spans.append((a, b))
    for a, b in spans:
        if a < idx < b:
            dollar = True
            break
    if dollar:
        return "dollar"
    if in_url:
        return "url"
    return "prose"

def main():
    report = {}
    for f in FILES:
        try:
            data = json.loads(f.read_text())
        except Exception:
            continue
        hits = []
        def walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
            elif isinstance(o, str):
                for tok in TARGETS:
                    for m in re.finditer(r"\b" + tok + r"\w*", o):
                        ctx_a = max(0, m.start() - 70)
                        ctx_b = min(len(o), m.end() + 70)
                        cls = classify(o, m.start(), tok)
                        hits.append({
                            "tok": tok, "match": m.group(0), "cls": cls,
                            "ctx": o[ctx_a:ctx_b].replace("\n", "\\n"),
                        })
        walk(data)
        if hits:
            report[str(f.relative_to(REPO))] = hits
    total = {}
    for f, hits in report.items():
        for h in hits:
            key = (h["tok"], h["cls"], h["match"])
            total[key] = total.get(key, 0) + 1
    print("== TOTALS (tok, cls, match) ==")
    for k in sorted(total):
        print(f"{total[k]:4d}  {k}")
    print()
    for f, hits in report.items():
        print(f"== {f} ({len(hits)}) ==")
        for h in hits:
            print(f"  [{h['cls']}] <{h['match']}> ...{h['ctx']}...")
    # persist for the receipt
    out = Path("/tmp/rnd10_probe.json")
    out.write_text(json.dumps(report, indent=1))
    print(f"\nsaved {out}")

if __name__ == "__main__":
    main()
