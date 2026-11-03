#!/usr/bin/env python3
"""run-016 resources push via GitHub Contents API (no clone — repo is 5.4GB).
PUTs 4 crop PNGs to main; verifies raw URLs 200 after. PAT env-only, never printed.
"""
import base64, json, os, sys, time, urllib.request

CREDS = "/home/z/my-project/.creds/syllabai.env"
tok = os.environ.get("GITHUB_PAT_NEW", "").strip()
if not tok:
    with open(CREDS) as f:
        for line in f:
            if line.startswith("GITHUB_PAT="):
                tok = line.strip().split("=", 1)[1]

REPO = "SyllabAI/syllabai-resources"
CROPS = "/home/z/my-project/download/t-oeq-mathsb/run016/crops"
JOBS = [
    ("2020-06_02_asset_8_d_grid.png",   "Official-ExamQuestion/igcse-maths-b-16/2020-06/4MB1-02/assets/asset_8_d_grid.png"),
    ("2020-11_02_asset_8_d_grid.png",   "Official-ExamQuestion/igcse-maths-b-16/2020-11/4MB1-02/assets/asset_8_d_grid.png"),
    ("2024-11_02_asset_11_e_grid.png",  "Official-ExamQuestion/igcse-maths-b-16/2024-11/4MB1-02/assets/asset_11_e_grid.png"),
    ("2023-11_02_asset_8_d_grid.png",   "Official-ExamQuestion/igcse-maths-b-16/2023-11/4MB1-02/assets/asset_8_d_grid.png"),
]
MSG = "assets(4MB1): run-016 spare-grid wave — 4 crop-required grid figures (2020-06 8-d p21, 2020-11 8-d p21, 2024-11 11-e p33, 2023-11 8-d p17 replacement for sliver mis-crop asset_8_8-d); T-OEQ-MATHSB-SERVE-1; URL-gate-before-attach"

def api(url, data=None, method="GET"):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {tok}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "r7a-lane",
    }, data=json.dumps(data).encode() if data else None, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())

# clean partial clone if killed earlier
import shutil
pc = "/home/z/my-project/scratch/resources_r016"
if os.path.exists(pc):
    shutil.rmtree(pc, ignore_errors=True)
    print("removed partial clone dir")

for fname, path in JOBS:
    raw = open(f"{CROPS}/{fname}", "rb").read()
    body = {"message": MSG, "content": base64.b64encode(raw).decode(), "branch": "main"}
    try:
        r = api(f"https://api.github.com/repos/{REPO}/contents/{path}", body, method="PUT")
        print(f"PUT {path}: {r['commit']['sha'][:12]} ({r['content']['size']}B)")
    except urllib.error.HTTPError as e:
        print(f"PUT {path}: HTTP {e.code} {e.read()[:200]}")
        sys.exit(1)

# verify raw 200 (CDN may lag; retry)
print("\nraw URL verification:")
for _, path in JOBS:
    url = f"https://raw.githubusercontent.com/{REPO}/main/{path}"
    ok = False
    for attempt in range(6):
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "r7a-lane"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        if code == 200:
            ok = True
            break
        time.sleep(10)
    print(f"  {code} {path}" + ("" if ok else "  (STILL NOT 200)"))
print("done")
