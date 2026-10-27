#!/usr/bin/env python3
"""run-014 crop URL gate (playbook §5.3): every asset rawUrl in the plane must HEAD-200."""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

PLANE = "/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json"
plane = json.load(open(PLANE))
urls = set()
for paper in plane:
    for q in paper["questions"]:
        for part in q["parts"]:
            for a in part.get("assets") or []:
                u = a.get("rawUrl")
                if u:
                    urls.add(u)
print("unique rawUrls:", len(urls))

def head(u):
    r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-I", "-L", u],
                       capture_output=True, text=True, timeout=30)
    return u, r.stdout.strip()

bad = []
with ThreadPoolExecutor(max_workers=16) as ex:
    for u, code in ex.map(head, sorted(urls)):
        if code != "200":
            bad.append((u, code))
print("non-200:", len(bad))
for u, c in bad[:10]:
    print("  ", c, u)
sys.exit(1 if bad else 0)
