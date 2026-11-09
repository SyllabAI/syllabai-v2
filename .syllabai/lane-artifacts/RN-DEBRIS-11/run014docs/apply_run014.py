#!/usr/bin/env python3
"""apply_run014.py — apply the CIE title map to the three planes of record
(content curriculum, hub spine mirror, KG labels) in the run-013 worktree.
Serializer-law preserved per file; fail-closed on any miss; deep field-diff
assert proves title/label-only changes."""
import json, sys, copy

WT = "/home/z/my-project/work/wt-run014"
MAP = json.load(open("/home/z/my-project/work/run014/edexcel_title_map.json"))

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

    # ---- KG plane (id-resolved replacement: curriculum code -> spec-point
    # kids -> pointSubtopics bridge -> (sectionId, subtopicId) -> all mirror
    # sites by id, so shared wreck strings take per-row distinct news) ----
    p = f"{WT}/apps/hub/public/kg/data/{slug}.json"
    raw = open(p, "rb").read()
    kobj0 = json.loads(raw)
    style, fn = detect_dump(kobj0, raw)
    kobj = copy.deepcopy(kobj0)

    cnodes = {n["code"]: n for n in obj["nodes"]}
    kids_of = {}
    for n in obj["nodes"]:
        for par in n.get("parents", []):
            kids_of.setdefault(par, []).append(n)

    def resolve(sec_code):
        """curriculum TOPIC/SUBTOPIC code -> (sectionId, subtopicId)"""
        node = cnodes[sec_code]
        kids = kids_of.get(sec_code, [])
        if len(kids) == 1 and kids[0].get("family") == "SUBTOPIC":
            return resolve(kids[0]["code"])
        pt_ids = sorted(k["code"] for k in kids if k.get("family") == "SPEC_POINT")
        assert pt_ids, f"{slug} {sec_code}: no spec-point kids"
        matches = []
        ps = kobj0["pointSubtopics"]
        for sub_id, pts in ps.items():
            if sorted(pts) == pt_ids:
                matches.append(sub_id)
        assert len(matches) == 1, f"{slug} {sec_code}: bridge match {matches}"
        sub_id = matches[0]
        sec_node = next(n for n in kobj0["nodes"]
                        if n.get("id") == sub_id and n.get("type") == "SubTopic")
        return sec_node["section"], sub_id

    sec_index = {}   # section node
    for n in kobj["nodes"]:
        if n.get("type") == "Section":
            sec_index[n["section"]] = n
        elif n.get("type") == "SubTopic":
            pass
    sites_done = {}
    consumed = set()
    for r in rows:
        sec_id, sub_id = resolve(r["code"])
        new = r["new"]
        n_changed = 0
        # Section node + sections dict
        sn = sec_index[sec_id]
        if sn["label"] == r["old"]:
            sn["label"] = new; n_changed += 1
        sd = kobj["sections"].get(sec_id)
        if sd and sd["label"] == r["old"]:
            sd["label"] = new; n_changed += 1
        # SubTopic node
        tn = next(n for n in kobj["nodes"] if n.get("id") == sub_id)
        if tn["label"] == r["old"]:
            tn["label"] = new; n_changed += 1
        # subtopics tuple mirrors
        for entry in kobj["subtopics"].get(sec_id, []):
            if isinstance(entry, list) and len(entry) >= 2 and entry[0] == sub_id \
                    and entry[1] == r["old"]:
                entry[1] = new; n_changed += 1
        key = (sec_id, sub_id, new)
        if key in consumed:
            assert n_changed == 0, f"{slug} {r['code']}: pair row unexpectedly changed {n_changed} sites"
        else:
            assert n_changed >= 2, f"{slug} {r['code']}: only {n_changed} KG sites changed"
            consumed.add(key)
        sites_done[r["code"]] = (sec_id, sub_id, n_changed)
    rep["kg"] = {c: v[2] for c, v in sites_done.items()}
    # extinction law: no leaf equals any old title (all rows replaced by id)
    def leaves(o):
        if isinstance(o, dict):
            for v in o.values(): yield from leaves(v)
        elif isinstance(o, list):
            for v in o: yield from leaves(v)
        elif isinstance(o, str):
            yield o
    olds = {r["old"] for r in rows}
    resid = [l for l in leaves(kobj) if l in olds]
    assert not resid, f"{slug}: residual old-title leaves {resid[:2]!r}"
    open(p, "wb").write(fn(kobj).encode("utf-8"))
    rep["kg_style"] = style
    rep["kg_changed_sites"] = sum(v[2] for v in sites_done.values())
    report[slug] = rep

json.dump(report, open("/home/z/my-project/work/run014/apply_report.json", "w"),
          ensure_ascii=False, indent=1)
print("APPLIED OK")
for slug, rep in report.items():
    print(f"  {slug}: content[{rep['content_style']}] x{len(rep['content'])} "
          f"spine[{rep['spine_style']}] x{len(rep['spine'])} "
          f"kg[{rep['kg_style']}] sites={rep['kg_changed_sites']} "
          f"perRow={sorted(rep['kg'].values())}")
