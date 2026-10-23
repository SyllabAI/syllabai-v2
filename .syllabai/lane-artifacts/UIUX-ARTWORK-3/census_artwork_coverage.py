#!/usr/bin/env python3
"""Census of artwork coverage in the 4MB1 bundle at FETCH_HEAD.
Read-only. Answers: how many papers have img embeds, which lack them,
total embed count vs the 632 of record, and embed URL sha pinning."""
import json, re, collections

BUNDLE = "/home/z/my-project/scripts/artwork-scale/bundle_at_fetchhead.json"

with open(BUNDLE) as f:
    bundle = json.load(f)

sets = bundle if isinstance(bundle, list) else bundle["sets"]
print(f"bundle type: {type(bundle).__name__}, sets: {len(sets)}")

img_re = re.compile(r'!\[[^\]]*\]\((https://raw\.githubusercontent\.com/SyllabAI/syllabai-resources/([0-9a-f]{40})/[^)]+)\)')
sha_re = re.compile(r'raw\.githubusercontent\.com/SyllabAI/syllabai-resources/([0-9a-f]{40})/')

per_set = {}
total_embeds = 0
shas = collections.Counter()
unique_assets = set()
no_ref_line = 0

for s in sets:
    slug = s["slug"]
    n = 0
    for q in s["questions"]:
        parts = q.get("parts", [])
        for p in parts:
            pm = p.get("problemMd", "") or ""
            for m in img_re.finditer(pm):
                n += 1
                total_embeds += 1
                unique_assets.add(m.group(1))
                sm = sha_re.search(m.group(1))
                if sm:
                    shas[sm.group(1)[:8]] += 1
    per_set[slug] = n

covered = {k: v for k, v in per_set.items() if v > 0}
uncovered = {k: v for k, v in per_set.items() if v == 0}

print(f"\nTOTAL img embeds: {total_embeds} (of record: 632 = 18 pilot + 614 scale)")
print(f"sets with embeds: {len(covered)} / {len(sets)}")
print(f"UNCOVERED sets ({len(uncovered)}):")
for k in sorted(uncovered):
    print(f"  {k}")
print(f"\nresources shas pinned: {dict(shas)}")
print(f"unique asset URLs: {len(unique_assets)}")

# per-set embed counts, sorted desc, first 10 + last 5
print("\nper-set embed counts (desc):")
for k, v in sorted(covered.items(), key=lambda x: -x[1])[:8]:
    print(f"  {v:4d}  {k}")
print("  ...")
for k, v in sorted(covered.items(), key=lambda x: -x[1])[-4:]:
    print(f"  {v:4d}  {k}")
