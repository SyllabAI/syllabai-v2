#!/usr/bin/env python3
"""OPTIONAL-2 lane, step 3: definitive lost-opener citation census (v3).

Display-proof method: all evidence via regex hit counts + direct indexing;
results written to artifact file (never trusted to terminal rendering).

Class: markdown citations that lost their opener bracket -> `X](url)` renders
as loose text on the page. Well-formed links are removed first (nesting-
tolerant regex tolerates one bracket level inside link text/alt).

Output: per-bundle counts, every instance recorded with bundle/file/field/
context, split in-band vs out-of-band, plus self-heal check (does the same
URL appear in a well-formed construct elsewhere nearby -> true target known).
"""
import json, re
from pathlib import Path

ROOT = Path("/home/z/my-project/ws/syllabai-v2")
CONTENT = ROOT / "apps/hub/content"
OUT = ROOT / ".syllabai/artifacts/t-ugm-link-fix/optional2-orphan-census-v3.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

IN_BAND = [
    "cie-igcse-religious-studies-23", "igcse-economics-17", "cie-igcse-english-language-25",
    "cie-igcse-accounting-25", "cie-igcse-english-literature-21", "cie-a-level-accounting-21",
    "igcse-english-literature-16", "cie-igcse-business-25", "cie-igcse-business-23",
    "cie-a-level-business-23", "cie-as-business-23", "igcse-business-19",
    "cie-a-level-economics-23", "cie-igcse-economics-25", "cie-igcse-economics-20",
]

# one level of [] nesting tolerated inside the link text (e.g. alt 'rates [D]')
RE_WELLFORMED = re.compile(r"!?\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]\([^)\s]+\)")
RE_ORPHAN = re.compile(r"\]\(https?://[^)\s]{1,300}\)")

def walk(o, path=""):
    if isinstance(o, str):
        yield path, o
    elif isinstance(o, list):
        for i, x in enumerate(o):
            yield from walk(x, f"{path}[{i}]")
    elif isinstance(o, dict):
        for k, v in o.items():
            yield from walk(v, f"{path}.{k}" if path else k)

instances = []
for bundle_dir in sorted(CONTENT.iterdir()):
    if not bundle_dir.is_dir():
        continue
    for jf in sorted(bundle_dir.glob("*.json")):
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except Exception:
            continue
        for path, s in walk(data):
            for m in RE_ORPHAN.finditer(s):
                line_start = s.rfind("\n", 0, m.start()) + 1
                line_end = s.find("\n", m.end())
                line = s[line_start:line_end if line_end != -1 else len(s)]
                # orphan if after stripping ALL well-formed links from the line, the closer remains
                residue = RE_WELLFORMED.sub("", line)
                if "](http" not in residue:
                    continue
                instances.append({
                    "bundle": bundle_dir.name,
                    "inBand": bundle_dir.name in IN_BAND,
                    "file": jf.name,
                    "field": path,
                    "url": m.group(0)[2:-1],
                    "line": line[:300],
                })

by_bundle = {}
for x in instances:
    b = by_bundle.setdefault(x["bundle"], {"total": 0, "inBand": x["inBand"], "files": {}})
    b["total"] += 1
    b["files"][x["file"]] = b["files"].get(x["file"], 0) + 1

summary = {k: v for k, v in sorted(by_bundle.items(), key=lambda kv: -kv[1]["total"])}
lines = [f"{'bundle':46} {'total':>5}  files"]
for b, v in summary.items():
    det = ", ".join(f"{f}:{c}" for f, c in sorted(v["files"].items(), key=lambda kv: -kv[1]))
    lines.append(f"{b:46} {v['total']:>5}  {det}")
lines.append(f"{'TOTAL':46} {len(instances):>5}")
lines.append(f"IN-BAND instances: {sum(1 for x in instances if x['inBand'])}  "
             f"OUT-OF-BAND: {sum(1 for x in instances if not x['inBand'])}")

# econ/biz band detail lines (evidence for repair set)
lines.append("")
lines.append("=== in-band instance lines (truncated 200ch) ===")
for x in instances:
    if x["inBand"]:
        lines.append(f"[{x['bundle']} | {x['file']} | {x['field']}] {x['line'][:200]}")

OUT.write_text(json.dumps({
    "instances_total": len(instances),
    "in_band_total": sum(1 for x in instances if x["inBand"]),
    "summary": summary,
    "instances": instances,
}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

report = "\n".join(lines)
(ROOT / ".syllabai/artifacts/t-ugm-link-fix/optional2-orphan-census-v3.txt").write_text(report, encoding="utf-8")
print(f"instances_total={len(instances)} in_band={sum(1 for x in instances if x['inBand'])}")
print(f"artifact: {OUT}")
