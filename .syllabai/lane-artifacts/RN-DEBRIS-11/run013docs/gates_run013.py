#!/usr/bin/env python3
"""gates_run013.py — G2/G3/G6/G7 structural gates vs HEAD for the run-013 edits."""
import json, subprocess, re

WT = "/home/z/my-project/work/wt-run013"
MAP = json.load(open("/home/z/my-project/work/run013/cie_title_map.json"))

def head_obj(path):
    r = subprocess.run(["git", "-C", WT, "show", f"HEAD:{path}"], capture_output=True)
    return json.loads(r.stdout)

def walk_labels(o, path=()):
    if isinstance(o, dict):
        if isinstance(o.get("label"), str):
            yield path, o["label"]
        for k, v in o.items():
            yield from walk_labels(v, path + (k,))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk_labels(v, path + (i,))

by_slug = {}
for r in MAP["rows"]:
    by_slug.setdefault(r["slug"], []).append(r)

fails = 0
for slug, rows in sorted(by_slug.items()):
    slug_ok = True
    cp = f"apps/hub/content/{slug}/curriculum.json"
    sp = f"apps/hub/spines/{slug}.json"
    kp = f"apps/hub/public/kg/data/{slug}.json"
    c0, c1 = head_obj(cp), json.load(open(f"{WT}/{cp}"))
    s0, s1 = head_obj(sp), json.load(open(f"{WT}/{sp}"))
    k0, k1 = head_obj(kp), json.load(open(f"{WT}/{kp}"))

    # G2: only title fields changed in content+spine
    def diff_titles(a, b, plane):
        assert len(a["nodes"]) == len(b["nodes"]), f"{slug} {plane}: node count changed"
        for n0, n1 in zip(a["nodes"], b["nodes"]):
            assert n0["code"] == n1["code"], f"{slug} {plane}: node order/ids changed"
            if n0.get("title") != n1.get("title"):
                assert n1["title"] in {r["new"] for r in rows}, f"{slug} {plane}: unexpected title change"
                # every changed node must be an intended row
    diff_titles(c0, c1, "content")
    diff_titles({"nodes": s0["curriculum"]["nodes"]}, {"nodes": s1["curriculum"]["nodes"]}, "spine")
    # non-node fields byte-equal (curriculum meta/edges etc.)
    for k in c0:
        if k != "nodes":
            assert c0[k] == c1[k], f"{slug}: content top-level {k} changed"
    for k in s0:
        if k != "curriculum":
            assert s0[k] == s1[k], f"{slug}: spine top-level {k} changed"

    # G3: structure counts identical everywhere
    for a, b, nm in ((k0, k1, "kg"),):
        assert len(a["nodes"]) == len(b["nodes"]) and len(a["edges"]) == len(b["edges"]), f"{slug} {nm}: structure changed"
        assert a.get("points") == b.get("points"), f"{slug} {nm}: points changed"

    # G6: mirror equality — every row's new title in KG labels and spine
    kg_labels = {lab for _, lab in walk_labels(k1)}
    spn = {n["code"]: n.get("title") for n in s1["curriculum"]["nodes"]}
    cn = {n["code"]: n.get("title") for n in c1["nodes"]}
    for r in rows:
        assert kg_labels and r["new"] in kg_labels, f"{slug} {r['officialCode']}: KG mirror missing new title"
        assert spn[r["code"]] == r["new"], f"{slug} {r['officialCode']}: spine mirror mismatch"
        assert cn[r["code"]] == r["new"], f"{slug} {r['officialCode']}: content mismatch"

    # G6b: old titles fully extinct in all three planes (string-leaf law)
    olds = {r["old"] for r in rows}
    def leaves(o):
        if isinstance(o, dict):
            for v in o.values(): yield from leaves(v)
        elif isinstance(o, list):
            for v in o: yield from leaves(v)
        elif isinstance(o, str):
            yield o
    for obj, nm in ((c1, "content"), (s1["curriculum"], "spine"), (k1, "kg")):
        resid = [l for l in leaves(obj) if l in olds]
        assert not resid, f"{slug} {nm}: residual old-title leaves {resid[:2]!r}"

    # G7: uniqueness among SUBTOPIC+TOPIC titles within the course
    titles = [n.get("title") for n in c1["nodes"] if n.get("family") in ("TOPIC", "SUBTOPIC")]
    dups = {t for t in titles if titles.count(t) > 1}
    if dups:
        # pre-existing dup? check HEAD
        t0 = [n.get("title") for n in c0["nodes"] if n.get("family") in ("TOPIC", "SUBTOPIC")]
        new_dups = dups - {t for t in t0 if t0.count(t) > 1}
        if new_dups:
            print(f"  {slug}: NEW title dups introduced: {new_dups}")
            slug_ok = False
    if slug_ok:
        print(f"  {slug}: G2/G3/G6/G7 OK ({len(rows)} rows)")
    else:
        fails += 1

print("GATES", "FAIL" if fails else "ALL OK")
