#!/usr/bin/env python3
"""RN-DEBRIS-10 run-001 census — the useof/dsin split-law lane.

Byte-verbatim walk of every JSON string under apps/hub/** (content + spines)
on the fetched tip. Occurrence-level census for the two fused tokens:
  dsin  — the fused coefficient d + function sin (grating equation nλ = d sin θ)
  useof — the fused "use of"

Classes per occurrence: dollar (inside $...$ span), prose, url (inside a
URL/asset substring — the of-record url-asset trap guard).

Of-record expectations (first-hand probe /tmp/rnd10_probe.json @ 06a7d78a):
  dsin  total 43  (dollar 39 / prose 4 / url 0)
        cie-a-level-physics-25/questions.json 20,
        cie-as-physics-25/questions.json     21,
        ial-physics-19/questions.json         2
  useof total 4   (dollar 0 / prose 4 / url 0)
        igcse-maths-b-16/questions.json       1
        ial-maths-20-pure-3 {curriculum,ugm-resources,spines} 1 each

Fail-closed asserts: every occurrence lowercase; no occurrence embedded in a
longer ASCII-alpha run; next char never [A-Za-z]; expectations exact.
Writes /tmp/rnd10_census_pre.json (+ --post mode for idempotence gate).
"""
import json
import re
import sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/sv2-rn9")
MODE = "post" if "--post" in sys.argv else "pre"
OUT = Path(f"/tmp/rnd10_census_{MODE}.json")

TARGETS = ("dsin", "useof")
# start boundary: not preceded by ASCII letter; end: next char not ASCII letter
OCC = {t: re.compile(r"(?<![A-Za-z])" + t + r"(?![A-Za-z])") for t in TARGETS}
URL_RE = re.compile(
    r"(?:https?:)?//[^\s\"'<>]+|/[^\"'\s]*asset[^\"'\s]*|"
    r"[\w\-]+\.(?:png|jpg|jpeg|svg|gif|webp|json|mp3|mp4)\b", re.I)

FILES = sorted(REPO.glob("apps/hub/**/*.json"))

EXPECT = {
    "pre": {
        "dsin": {
            "total": 43, "cls": {"dollar": 39, "prose": 4, "url": 0},
            "per_file": {
                "apps/hub/content/cie-a-level-physics-25/questions.json": 20,
                "apps/hub/content/cie-as-physics-25/questions.json": 21,
                "apps/hub/content/ial-physics-19/questions.json": 2,
            },
        },
        "useof": {
            "total": 4, "cls": {"dollar": 0, "prose": 4, "url": 0},
            "per_file": {
                "apps/hub/content/igcse-maths-b-16/questions.json": 1,
                "apps/hub/content/ial-maths-20-pure-3/curriculum.json": 1,
                "apps/hub/content/ial-maths-20-pure-3/ugm-resources.json": 1,
                "apps/hub/spines/ial-maths-20-pure-3.json": 1,
            },
        },
    },
    # post-apply (idempotence gate): dsin drained; only the 3 adjudicated
    # fail-closed useof keeps remain
    "post": {
        "dsin": {
            "total": 0, "cls": {"dollar": 0, "prose": 0, "url": 0},
            "per_file": {},
        },
        "useof": {
            "total": 3, "cls": {"dollar": 0, "prose": 3, "url": 0},
            "per_file": {
                "apps/hub/content/ial-maths-20-pure-3/curriculum.json": 1,
                "apps/hub/content/ial-maths-20-pure-3/ugm-resources.json": 1,
                "apps/hub/spines/ial-maths-20-pure-3.json": 1,
            },
        },
    },
}[MODE]


def classify(s: str, idx: int) -> str:
    for m in URL_RE.finditer(s):
        if m.start() <= idx < m.end():
            return "url"
    dollars = [m.start() for m in re.finditer(r"(?<!\\)\$", s)]
    for a, b in zip(dollars[0::2], dollars[1::2]):
        if a < idx < b:
            return "dollar"
    return "prose"


def main():
    items = []
    per_file = {t: {} for t in TARGETS}
    cls_counts = {t: {"dollar": 0, "prose": 0, "url": 0} for t in TARGETS}
    for f in FILES:
        rel = str(f.relative_to(REPO))
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            raise SystemExit(f"FAIL json parse {rel}: {e}")

        def walk(o, path):
            if isinstance(o, dict):
                for k, v in o.items():
                    walk(v, path + "/" + str(k))
            elif isinstance(o, list):
                for i, v in enumerate(o):
                    walk(v, path + f"[{i}]")
            elif isinstance(o, str):
                for t in TARGETS:
                    for m in OCC[t].finditer(o):
                        idx = m.start()
                        cls = classify(o, idx)
                        nxt = o[m.end()] if m.end() < len(o) else ""
                        prev = o[idx - 1] if idx > 0 else ""
                        items.append({
                            "tok": t, "file": rel, "path": path,
                            "pos": idx, "match": m.group(0), "cls": cls,
                            "prev": prev, "next": nxt, "s": o,
                            "slen": len(o),
                        })
                        per_file[t][rel] = per_file[t].get(rel, 0) + 1
                        cls_counts[t][cls] += 1
        walk(data, "")

    # fail-closed asserts
    errs = []
    for t in TARGETS:
        tot = sum(per_file[t].values())
        if tot != EXPECT[t]["total"]:
            errs.append(f"{t} total {tot} != {EXPECT[t]['total']}")
        for c, n in EXPECT[t]["cls"].items():
            if cls_counts[t][c] != n:
                errs.append(f"{t} cls {c} {cls_counts[t][c]} != {n}")
        for rf, n in EXPECT[t]["per_file"].items():
            if per_file[t].get(rf, 0) != n:
                errs.append(f"{t} {rf} {per_file[t].get(rf, 0)} != {n}")
    for it in items:
        if it["match"] != it["match"].lower():
            errs.append(f"non-lowercase {it['match']} @ {it['file']}")
        if (it["prev"].isascii() and it["prev"].isalpha()) or \
           (it["next"].isascii() and it["next"].isalpha()):
            errs.append(f"embedded-in-word {it['match']} @ {it['file']}:{it['path']}")
    if errs:
        for e in errs:
            print("ASSERT FAIL:", e)
        raise SystemExit(1)

    summary = {
        "mode": MODE,
        "filesWalked": len(FILES),
        "totals": {t: sum(per_file[t].values()) for t in TARGETS},
        "cls": cls_counts,
        "perFile": per_file,
    }
    OUT.write_text(json.dumps({"summary": summary, "items": items}, indent=1))
    print(f"[{MODE}] files walked: {len(FILES)}")
    for t in TARGETS:
        print(f"  {t}: total {summary['totals'][t]} cls={cls_counts[t]}")
        for rf, n in sorted(per_file[t].items()):
            print(f"    {n:3d}  {rf}")
    print("saved", OUT)


if __name__ == "__main__":
    main()
