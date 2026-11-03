#!/usr/bin/env python3
"""RN-DEBRIS-11 run-002 — full-corpus KaTeX sweep (family law: katex 0.16.22,
throwOnError, output:html, dollar-stripped segment bodies). Walks every
apps/hub/**/*.json, collects $...$ segment occurrences, renders uniques in
one node process, writes /tmp/rn11/sweep_<tag>.json with the failure set.
"""
import json, re, subprocess, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/sv2-rn9")
TAG = sys.argv[1] if len(sys.argv) > 1 else "pre"
MATHSEG = re.compile(r"\$[^$]+\$")

def walk(n, jp):
    if isinstance(n, dict):
        for k, v in n.items(): yield from walk(v, jp + "." + k)
    elif isinstance(n, list):
        for i, v in enumerate(n): yield from walk(v, jp + "[" + str(i) + "]")
    elif isinstance(n, str): yield jp, n

occ = 0
occ_list = []
for p in sorted(REPO.glob("apps/hub/**/*.json")):
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        continue
    for jp, s in walk(data, "$"):
        for m in MATHSEG.finditer(s):
            occ += 1
            occ_list.append((str(p.relative_to(REPO)), jp, m.group(0)))

uniq = {}
for f, jp, seg in occ_list:
    uniq.setdefault(seg, []).append((f, jp))
print(f"segments: occ={occ} unique={len(uniq)}")

PROBE = r"""
const katex = require('/tmp/rn11/node_modules/katex');
const fs = require('fs');
const segs = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const out = [];
for (const s of segs) {
  let ok = false, err = '';
  try { katex.renderToString(s.slice(1, -1), {throwOnError: true, output: 'html'}); ok = true; }
  catch (e) { err = String(e.message).slice(0, 120); }
  if (!ok) out.push({seg: s, err});
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('rendered', segs.length, 'failed', out.length);
"""
segs_path = f"/tmp/rn11/sweep_{TAG}_segs.json"
out_path = f"/tmp/rn11/sweep_{TAG}_fails.json"
Path(segs_path).write_text(json.dumps(list(uniq.keys())))
p = subprocess.run(["node", "-e", PROBE, segs_path, out_path],
                   capture_output=True, text=True, timeout=1800)
if p.returncode != 0:
    raise SystemExit("sweep probe failed: " + p.stderr[:400])
print(p.stdout.strip())
fails = json.loads(open(out_path).read())
fail_occ = sum(len(uniq[f["seg"]]) for f in fails)
print(f"failures: unique={len(fails)} occ={fail_occ}")
json.dump({"tag": TAG, "occ": occ, "unique": len(uniq),
           "failUnique": len(fails), "failOcc": fail_occ,
           "failures": [{"seg": f["seg"], "err": f["err"],
                         "sites": uniq[f["seg"]]} for f in fails]},
          open(f"/tmp/rn11/sweep_{TAG}.json", "w"), ensure_ascii=False)
print("wrote", f"/tmp/rn11/sweep_{TAG}.json")
