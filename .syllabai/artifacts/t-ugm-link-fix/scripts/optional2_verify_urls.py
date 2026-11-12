#!/usr/bin/env python3
"""OPTIONAL-2 lane, step 2: full per-URL verification of the trailURL class.

For every URL token ending at a hyphen (the run-003 'split-URL' signature),
probe AS-IS with -L: evidence = final HTTP code + effective URL.
Upstream-canonical hypothesis: bare form 308-redirects to `...-/` and lands 200.
Control already proven: garbage slug -> 404.
Also: precise corpus census of ttps typos + U+2010, with in-band breakdown
and context classification of in-band U+2010.
Writes lane artifact JSON to .syllabai/artifacts/t-ugm-link-fix/.
"""
import json, re, subprocess, time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path("/home/z/my-project/ws/syllabai-v2")
CONTENT = ROOT / "apps/hub/content"
OUTDIR = ROOT / ".syllabai/artifacts/t-ugm-link-fix"
OUTDIR.mkdir(parents=True, exist_ok=True)

RE_TRAIL = re.compile(r"""https?://[^\s"'<>\\()\[\]{}]*-+(?![^\s"'<>\\()\[\]{}])""")
RE_TYPO = re.compile(r"(?<![hH])ttps?://")
RE_U2010 = re.compile("\u2010")

IN_BAND = [
    "cie-igcse-religious-studies-23", "igcse-economics-17", "cie-igcse-english-language-25",
    "cie-igcse-accounting-25", "cie-igcse-english-literature-21", "cie-a-level-accounting-21",
    "igcse-english-literature-16", "cie-igcse-business-25", "cie-igcse-business-23",
    "cie-a-level-business-23", "cie-as-business-23", "igcse-business-19",
    "cie-a-level-economics-23", "cie-igcse-economics-25", "cie-igcse-economics-20",
]

def walk(o, path=""):
    if isinstance(o, str):
        yield path, o
    elif isinstance(o, list):
        for i, x in enumerate(o):
            yield from walk(x, f"{path}[{i}]")
    elif isinstance(o, dict):
        for k, v in o.items():
            yield from walk(v, f"{path}.{k}" if path else k)

# ---- 1. collect all trailURL instances ----
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
            for m in RE_TRAIL.finditer(s):
                instances.append({
                    "bundle": bundle_dir.name, "file": jf.name, "field": path,
                    "url": m.group(0), "inBand": bundle_dir.name in IN_BAND,
                })

uniq = {}
for inst in instances:
    uniq.setdefault(inst["url"], []).append(inst)
print(f"instances: {len(instances)}  unique URLs: {len(uniq)}")

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
results = {}
codes = {}
for i, (url, insts) in enumerate(sorted(uniq.items())):
    r = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-L", "-w", "%{http_code} %{url_effective} %{num_redirects}",
         "-A", UA, "--max-time", "45", url],
        capture_output=True, text=True, timeout=60)
    parts = r.stdout.strip().split(" ", 2)
    code = parts[0] if parts else "ERR"
    eff = parts[1] if len(parts) > 1 else ""
    nred = parts[2] if len(parts) > 2 else ""
    results[url] = {"final_code": code, "effective_url": eff, "redirects": nred}
    codes[code] = codes.get(code, 0) + 1
    if (i + 1) % 40 == 0:
        print(f"  probed {i+1}/{len(uniq)}  codes so far: {codes}")
    time.sleep(0.15)

print("final codes:", codes)

# ---- 2. ttps + U+2010 census ----
typo_rows, u2010_rows = [], []
for bundle_dir in sorted(CONTENT.iterdir()):
    if not bundle_dir.is_dir():
        continue
    t = c = 0
    t_ctx, c_ctx = [], []
    for jf in sorted(bundle_dir.glob("*.json")):
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except Exception:
            continue
        for path, s in walk(data):
            for m in RE_TYPO.finditer(s):
                t += 1
                if len(t_ctx) < 3:
                    t_ctx.append({"file": jf.name, "field": path, "ctx": s[max(0, m.start()-40):m.end()+60]})
            for m in RE_U2010.finditer(s):
                c += 1
                if len(c_ctx) < 3:
                    c_ctx.append({"file": jf.name, "field": path, "ctx": s[max(0, m.start()-30):m.end()+30]})
    if t:
        typo_rows.append({"bundle": bundle_dir.name, "count": t, "inBand": bundle_dir.name in IN_BAND, "samples": t_ctx})
    if c:
        u2010_rows.append({"bundle": bundle_dir.name, "count": c, "inBand": bundle_dir.name in IN_BAND, "samples": c_ctx})

art = {
    "trailURL": {
        "instances_total": len(instances),
        "unique_urls": len(uniq),
        "in_band_instances": sum(1 for x in instances if x["inBand"]),
        "probe_codes": codes,
        "probe_results": results,
        "instances": instances,
    },
    "ttps_typo": {"bundles": sorted(typo_rows, key=lambda r: -r["count"]),
                  "total": sum(r["count"] for r in typo_rows),
                  "in_band_total": sum(r["count"] for r in typo_rows if r["inBand"])},
    "u2010": {"bundles": sorted(u2010_rows, key=lambda r: -r["count"]),
              "total": sum(r["count"] for r in u2010_rows),
              "in_band_total": sum(r["count"] for r in u2010_rows if r["inBand"])},
}
out = OUTDIR / "optional2-census-verification.json"
out.write_text(json.dumps(art, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"artifact written: {out} ({out.stat().st_size} bytes)")
print(f"ttps typo total: {art['ttps_typo']['total']} (in-band {art['ttps_typo']['in_band_total']})")
print(f"u2010 total: {art['u2010']['total']} (in-band {art['u2010']['in_band_total']})")
for r in typo_rows:
    if r["inBand"]:
        print("  in-band ttps:", r["bundle"], r["count"], r["samples"][:1])
for r in u2010_rows:
    if r["inBand"]:
        print("  in-band u2010:", r["bundle"], r["count"], r["samples"][:1])
