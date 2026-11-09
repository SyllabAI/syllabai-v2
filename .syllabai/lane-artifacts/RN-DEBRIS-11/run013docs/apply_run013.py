#!/usr/bin/env python3
"""apply_run013.py — apply the CIE title map to the three planes of record
(content curriculum, hub spine mirror, KG labels) in the run-013 worktree.
Serializer-law preserved per file; fail-closed on any miss; deep field-diff
assert proves title/label-only changes."""
import json, sys, copy

WT = "/home/z/my-project/work/wt-run013"
MAP = json.load(open("/home/z/my-project/work/run013/cie_title_map.json"))

def detect_dump(obj, raw):
    """return a dumps() callable reproducing raw bytes byte-exactly, or fail."""
    body = raw.decode("utf-8")
    candidates = {
        "compact": lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")),
        "compact_nl": lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")) + "\n",
        "indent1": lambda o: json.dumps(o, ensure_ascii=False, indent=1),
        "indent1_nl": lambda o: json.dumps(o, ensure_ascii=False, indent=1) + "\n",
        "indent2": lambda o: json.dumps(o, ensure_ascii=False, indent=2),
        "indent2_nl": lambda o: json.dumps(o, ensure_ascii=False, indent=2) + "\n",
    }
    for name, fn in candidates.items():
        try:
            if fn(obj) == body:
                return name, fn
        except Exception:
            continue
    raise RuntimeError("no serializer style reproduces the file byte-exactly")

def walk_label_sites(o, path=()):
    """yield (container, key, label) for every label-holding dict"""
    if isinstance(o, dict):
        if "label" in o and isinstance(o["label"], str):
            yield o, "label", o["label"], path
        for k, v in o.items():
            yield from walk_label_sites(v, path + (k,))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk_label_sites(v, path + (i,))

by_slug = {}
for r in MAP["rows"]:
    by_slug.setdefault(r["slug"], []).append(r)

report = {}
for slug, rows in sorted(by_slug.items()):
    rep = {"content": [], "spine": [], "kg": {}}
    # ---- content plane ----
    p = f"{WT}/apps/hub/content/{slug}/curriculum.json"
    raw = open(p, "rb").read()
    obj = json.loads(raw)
    style, fn = detect_dump(obj, raw)
    nodes = {n["code"]: n for n in obj["nodes"]}
    for r in rows:
        n = nodes.get(r["code"])
        assert n is not None, f"{slug} {r['code']}: content node missing"
        assert n.get("title") == r["old"], f"{slug} {r['code']}: content title != wreck: {n.get('title')!r}"
        n["title"] = r["new"]
        rep["content"].append(r["code"])
    new_bytes = fn(obj).encode("utf-8")
    open(p, "wb").write(new_bytes)
    rep["content_style"] = style

    # ---- spine mirror ----
    p = f"{WT}/apps/hub/spines/{slug}.json"
    raw = open(p, "rb").read()
    sobj = json.loads(raw)
    style, fn = detect_dump(sobj, raw)
    snodes = {n["code"]: n for n in sobj["curriculum"]["nodes"]}
    for r in rows:
        n = snodes.get(r["code"])
        assert n is not None, f"{slug} {r['code']}: spine node missing"
        assert n.get("title") == r["old"], f"{slug} {r['code']}: spine title != wreck: {n.get('title')!r}"
        n["title"] = r["new"]
        rep["spine"].append(r["code"])
    open(p, "wb").write(fn(sobj).encode("utf-8"))
    rep["spine_style"] = style

    # ---- KG plane (string-leaf replacement: dict labels + [id,label] tuple
    # mirrors + any other site carrying the exact title string) ----
    p = f"{WT}/apps/hub/public/kg/data/{slug}.json"
    raw = open(p, "rb").read()
    kobj0 = json.loads(raw)
    style, fn = detect_dump(kobj0, raw)
    old_to_new = {}
    for r in rows:
        assert old_to_new.setdefault(r["old"], r["new"]) == r["new"], \
            f"{slug}: old title maps to two different news"
    counts = {r["old"]: [0, r["code"]] for r in rows}
    def rl(o):
        if isinstance(o, dict):
            return {k: rl(v) for k, v in o.items()}
        if isinstance(o, list):
            return [rl(v) for v in o]
        if isinstance(o, str) and o in old_to_new:
            counts[o][0] += 1
            return old_to_new[o]
        return o
    kobj = rl(kobj0)
    for r in rows:
        assert counts[r["old"]][0] >= 1, f"{slug} {r['code']}: KG string-leaf not found for wreck"
        rep["kg"][r["code"]] = counts[r["old"]][0]
    # deep assert: every changed leaf is an intended new title
    def leaves(o):
        if isinstance(o, dict):
            for v in o.values(): yield from leaves(v)
        elif isinstance(o, list):
            for v in o: yield from leaves(v)
        elif isinstance(o, str):
            yield o
    newset = set(old_to_new.values())
    for leaf in leaves(kobj):
        assert not (leaf in old_to_new), f"{slug}: residual old-title leaf {leaf[:40]!r}"
    open(p, "wb").write(fn(kobj).encode("utf-8"))
    rep["kg_style"] = style
    rep["kg_changed_sites"] = sum(c[0] for c in counts.values())

    report[slug] = rep

json.dump(report, open("/home/z/my-project/work/run013/apply_report.json", "w"),
          ensure_ascii=False, indent=1)
print("APPLIED OK")
for slug, rep in report.items():
    print(f"  {slug}: content[{rep['content_style']}] x{len(rep['content'])} "
          f"spine[{rep['spine_style']}] x{len(rep['spine'])} "
          f"kg[{rep['kg_style']}] sites={rep['kg_changed_sites']} "
          f"perRow={sorted(rep['kg'].values())}")
