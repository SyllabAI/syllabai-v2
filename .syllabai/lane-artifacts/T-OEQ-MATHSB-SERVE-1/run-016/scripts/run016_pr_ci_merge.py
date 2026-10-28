#!/usr/bin/env python3
"""run-016: open PR, watch CI checks, merge when green. PAT env-only."""
import json, os, sys, time, urllib.request

tok = os.environ.get("GITHUB_PAT_NEW", "").strip()
REPO = "SyllabAI/syllabai-v2"
HEAD = "r7a-pp-spare-grid-016"

def api(url, data=None, method=None):
    method = method or ("POST" if data is not None else "GET")
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {tok}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "r7a-lane",
    }, data=json.dumps(data).encode() if data is not None else None, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

# existing PR?
pr = None
try:
    prs = api(f"https://api.github.com/repos/{REPO}/pulls?head=SyllabAI:{HEAD}&state=open")
    pr = prs[0] if prs else None
except Exception:
    pass
if not pr:
    pr = api(f"https://api.github.com/repos/{REPO}/pulls", {
        "title": "content(4MB1): T-OEQ-MATHSB-SERVE-1 run-016 spare-grid wave — 53 fused problemMd blocks rebuilt from printed-page evidence",
        "head": HEAD,
        "base": "main",
        "body": (
            "run-016 of T-OEQ-MATHSB-SERVE-1 (operator trace 1a180c961abffa3d, order \"run-016\") — executes the run-015 receipt disposition: "
            "the 53 SPARE-GRID-INSTR fused problemMd blocks (eyes-on surgical rebuild class per playbook law 20).\n\n"
            "- 39 strips + 14 evidence-verified rebuilds (8 KaTeX formula boxes per the 4-e format law; evidenced restorations: N\u00b2, x = -1, M\u207b\u00b9, stray '2a' strip)\n"
            "- 4 crop-required grids measured via pdftotext -bbox tick-label union, pushed to syllabai-resources main (1b79e25e/21cfccec/826ac7a8/4b0e9dac), URL-gated, attached, stub notes removed\n"
            "- 2023-11 8-d sliver mis-crop (asset_8_8-d) link replaced with measured asset_8_d_grid crop\n"
            "- Gates: census 66/1281/2443/6600 EXACT; diff scope EXACTLY 53 problemMd; marks byte-untouched; paper-level mark-code union conserved; PUA/FFFD 0->0; $-parity; katex 117/117; URL gate 56/56\n"
            "- plane eabd5ca8b643f93f -> 5fc8abdba88325e8\n\n"
            "Receipt: .syllabai/receipts/T-OEQ-MATHSB-SERVE-1/run-016-spare-grid-rebuilds.json; playbook laws 21-23; lane artifacts in-repo. fetch-first, no force; PAT env-only."
        ),
    })
print(f"PR #{pr['number']}: {pr['html_url']}")

# watch checks
sha = pr["head"]["sha"]
deadline = time.time() + 1500
while time.time() < deadline:
    time.sleep(25)
    runs = api(f"https://api.github.com/repos/{REPO}/commits/{sha}/check-runs?per_page=100")
    checks = runs.get("check_runs", [])
    if not checks:
        print("  no check-runs yet...")
        continue
    summary = [(c["name"], c["status"], c["conclusion"]) for c in checks]
    pending = [c for c in checks if c["status"] != "completed"]
    print("  checks:", summary)
    if not pending:
        bad = [c for c in checks if c["conclusion"] not in ("success", "skipped", "neutral")]
        if bad:
            print("CI FAILED:", [(c["name"], c["conclusion"]) for c in bad])
            sys.exit(1)
        print("CI ALL GREEN")
        break
else:
    print("CI watch timeout")
    sys.exit(2)

# merge (admin-merge not needed; prior PRs merged by the lane token)
m = api(f"https://api.github.com/repos/{REPO}/pulls/{pr['number']}/merge", {
    "merge_method": "merge",
    "commit_title": f"Merge PR #{pr['number']}: content(4MB1) run-016 spare-grid wave — 53 fused problemMd rebuilds + 4 grid crops attached",
})
print("merge:", m["merged"], m["sha"])
