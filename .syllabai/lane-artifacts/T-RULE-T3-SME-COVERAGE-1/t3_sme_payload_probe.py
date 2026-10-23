#!/usr/bin/env python3
"""tranche-3 recon probe: does the SME topic-question page payload carry
spec-point ENTITY records (name/definition), or only bare ids on parts?
Read-only; single public page; attested source (LICENSE-DATA.md SME
attestation 2026-09-17, Cambridge extension 2026-10-17)."""
import json
import re
import sys

html_path = "/home/z/my-project/scripts/tmp/sme_probe_page.html"
html = open(html_path, encoding="utf-8", errors="replace").read()

m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
              html, re.S)
if not m:
    print("NO __NEXT_DATA__ found")
    sys.exit(1)
data = json.loads(m.group(1))

# Walk the whole payload, collecting dict shapes that mention specPoint
hits = {"spec_point_ids": 0, "entity_like": []}


def walk(node, path):
    if isinstance(node, dict):
        for k, v in node.items():
            kl = k.lower()
            if "specpoint" in kl or "spec_point" in kl:
                if isinstance(v, (list, dict)):
                    sample = json.dumps(v)[:200]
                else:
                    sample = repr(v)[:200]
                hits["entity_like"].append((path + "/" + k, sample))
            if k == "spec_point_ids" and isinstance(v, list) and v:
                hits["spec_point_ids"] += 1
            walk(v, path + "/" + k)
    elif isinstance(node, list):
        for i, v in enumerate(node[:400]):
            walk(v, f"{path}[{i}]")


walk(data, "")

# Search raw for entity-record shapes
for pat in ("specPoints", "spec_points", "specPoint"):
    raws = [mm.start() for mm in re.finditer(pat, html)]
    print(f"raw '{pat}' occurrences in html: {len(raws)}")

print("parts with non-empty spec_point_ids in payload:", hits["spec_point_ids"])
print("keys mentioning specpoint:", len(hits["entity_like"]))
for p, s in hits["entity_like"][:12]:
    print(" -", p, "=>", s)

# look for the known dangling id's entity record
for sid in ("spcpt_xzHNvStfDbY3yhX2",):
    idx = html.find(sid)
    print(f"\nraw find '{sid}': {'FOUND at ' + str(idx) if idx >= 0 else 'absent'}")
    if idx >= 0:
        print("context:", html[max(0, idx - 300):idx + 300].replace("\n", " ")[:600])
