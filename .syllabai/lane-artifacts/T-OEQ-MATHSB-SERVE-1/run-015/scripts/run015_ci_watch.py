#!/usr/bin/env python3
"""run-015 CI watcher: polls check-runs on the landing commit until completed; exit 0 all green, 2 on failure."""
import json, os, sys, time, urllib.request

tok = os.environ["GH_TOKEN"]
SHA = "dd3a36c3"
URL = f"https://api.github.com/repos/SyllabAI/syllabai-v2/commits/{SHA}/check-runs"

for i in range(1, 25):
    req = urllib.request.Request(URL, headers={"Authorization": f"token {tok}",
        "Accept": "application/vnd.github+json", "User-Agent": "r7a-lane"})
    d = json.loads(urllib.request.urlopen(req).read())
    runs = [(c["name"], c["status"], c["conclusion"]) for c in d["check_runs"]]
    print(f"poll {i}: {runs}", flush=True)
    if runs and all(r[1] == "completed" for r in runs):
        bad = [r for r in runs if (r[2] or "").upper() not in ("SUCCESS", "SKIPPED")]
        if bad:
            print("CI-FAILURE", bad)
            sys.exit(2)
        print("CI-ALL-GREEN")
        sys.exit(0)
    time.sleep(25)
print("TIMEOUT waiting for CI")
sys.exit(3)
