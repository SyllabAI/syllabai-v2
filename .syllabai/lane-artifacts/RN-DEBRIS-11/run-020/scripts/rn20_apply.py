#!/usr/bin/env python3
"""RN-DEBRIS-11 run-020 — the structural adds apply (D2 + D6-adds of the run-019 filing).

Operator order "run-020" (trace 1a1ce80c01c93d3d). Executes the filing's step-2
census-growth adds — the unambiguous, byte-exact-pinned, subtopic-hung,
exporter-independent items:
  D2: cs-23 (cie-igcse-computer-science-23) +5 official rows under SUB8.1
      (8.1.5, 8.1.6a, 8.1.6b, 8.1.6c, 8.1.7 — titles byte-exact from the
      run-017 census of record), official sequence position after 8.1.4.
  D6-adds: cie-{a-level,as}-maths-20-pure-1 +3 official rows under SUB1.3
      (1.3.3, 1.3.4, 1.3.5 — titles from the run-018 adjudication pins;
      1.3.3 composed per the fleet glyph law, disclosed), official sequence
      position after 1.3.2 / before the parse-vintage 1.3.2a blob.
NOT touched (still-open desk choices per the filing): D1 exporter law,
D3 8.1.1a re-code, D4 T7 re-parent, D5 6.3.x debris, 1.3.1a/1.3.2a disposition.

Zero invention: every pin read from the of-record artifacts and asserted.
Dump law: per-file serializer round-trip asserted before any write; byte-scope
proven by per-node dump diff (only the declared adds + order bumps differ).
"""
import json, re, sys, hashlib, copy
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-020"
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

def fail(msg):
    print(f"FAIL: {msg}", flush=True); sys.exit(1)

def dump_pretty(obj, trailing=True):
    return json.dumps(obj, indent=1, ensure_ascii=False) + ("\n" if trailing else "")

def dump_compact(obj, trailing=True):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + ("\n" if trailing else "")

def detect_dumper(raw, doc):
    for d in (dump_pretty, dump_compact):
        for t in (True, False):
            if d(doc, t) == raw:
                return d, t
    return None, None

def sha(b): return hashlib.sha256(b).hexdigest()

# ---------- 1. pins from the of-record artifacts (zero invention) ----------
r17census = json.loads((REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-017/official_0478_census_r0.json").read_text(encoding="utf-8"))
T_CS23 = {k: r17census["subRows"][k] for k in ("8.1.5", "8.1.6a", "8.1.6b", "8.1.6c", "8.1.7")}
assert len(T_CS23) == 5 and all(T_CS23.values())
r18_script = (REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-018/scripts/run018_adjudication.py").read_text(encoding="utf-8")
PINS13 = {}
for code in ("1.3.3", "1.3.4", "1.3.5"):
    m = re.search(rf'"{code}": \("([^"]+)", None, "PROPOSAL"', r18_script)
    if not m: fail(f"{code} PROPOSAL pin not found in the run-018 adjudication of record")
    PINS13[code] = m.group(1)
raw133 = PINS13["1.3.3"]
comp133 = raw133.replace("(x – a)2", "(x – a)²").replace("(y – b)2", "(y – b)²").replace("= r 2 ", "= r² ")
if comp133 == raw133: fail("1.3.3 composition produced no change")
if comp133.count("²") != 3 or " 2 " in comp133 or CTRL.search(comp133): fail(f"1.3.3 composition law violated: {comp133!r}")
T_PURE1 = {"1.3.3": comp133, "1.3.4": PINS13["1.3.4"], "1.3.5": PINS13["1.3.5"]}
COMPOSED = {"1.3.3": True, "1.3.4": False, "1.3.5": False}
print(f"PINS-OK cs23 x5 byte-exact (run-017 census subRows); pure1 x3 (1.3.3 composed per the fleet glyph law)")

COURSES = [
    {"slug": "cie-igcse-computer-science-23", "adds": T_CS23, "composed": {k: False for k in T_CS23},
     "node_after": "8.1.4", "node_before": "8.1.8", "edge_after": "8.1.4", "edge_next_target": "8.1.8",
     "pre_pts": 88, "delta": 5,
     "bump_expect": ["8.1.8", "8.2.1", "8.2.2", "8.2.3", "8.3.1", "8.3.2"],
     "kg_pre": (120, 210, 88), "ugm": False},
    {"slug": "cie-a-level-maths-20-pure-1", "adds": T_PURE1, "composed": COMPOSED,
     "node_after": "1.3.2a", "node_before": "cie-a-level-maths-2023-2025-T1:SUB1.4", "edge_after": "1.3.2a",
     "pre_pts": 33, "delta": 3, "bump_expect_count": 19, "kg_pre": (43, 88, 33), "ugm": True},
    {"slug": "cie-as-maths-20-pure-1", "adds": T_PURE1, "composed": COMPOSED,
     "node_after": "1.3.2a", "node_before": "cie-a-level-maths-2023-2025-T1:SUB1.4", "edge_after": "1.3.2a",
     "pre_pts": 33, "delta": 3, "bump_expect_count": 19, "kg_pre": (43, 88, 33), "ugm": False},
]

ART.mkdir(parents=True, exist_ok=True)
(ART / "scripts").mkdir(exist_ok=True)
apply_manifest = {"artifact": "rn11-run-020-apply-manifest-r0", "generatedUtc": "2026-11-12",
                  "operatorOrder": "run-020 (trace 1a1ce80c01c93d3d)",
                  "scope": "run-019 filing step-2: D2 cs-23 8.1 adds + D6 pure-1 1.3 adds; D1/D3/D4/D5 + 1.3.1a/1.3.2a disposition NOT touched",
                  "courses": []}
gates = {"artifact": "rn11-run-020-gates-r0", "generatedUtc": "2026-11-12", "gates": []}

def gate(name, ok, detail=""):
    gates["gates"].append({"gate": name, "ok": bool(ok), "detail": detail})
    print(f"  GATE {'PASS' if ok else 'FAIL'}: {name} {detail}")
    if not ok: fail(f"gate {name} failed: {detail}")

# ---------- 2. KG exporter import (run-018 invocation law) ----------
sys.path.insert(0, str(HUB / "scripts"))
import kg_export  # noqa: E402
reg_data = json.loads((HUB / "content/courses.json").read_text(encoding="utf-8"))
registry = {}
for entry in (reg_data if isinstance(reg_data, list) else reg_data.get("courses", [])):
    if isinstance(entry, dict) and entry.get("slug"):
        registry[entry["slug"]] = entry

def node_dumps(nodes):
    return {n.get("code") or f"@{i}": dump_compact(n, False) for i, n in enumerate(nodes)}

for C in COURSES:
    slug = C["slug"]
    print(f"== {slug} ==")
    cp = HUB / f"content/{slug}/curriculum.json"
    sp = HUB / f"spines/{slug}.json"
    kp = HUB / f"public/kg/data/{slug}.json"
    mp = HUB / f"content/{slug}/manifest.json"
    up = HUB / f"content/{slug}/ugm-resources.json"
    raws = {"curriculum": cp.read_bytes(), "spine": sp.read_bytes(), "kg": kp.read_bytes(), "manifest": mp.read_bytes()}
    ugm_sha_pre = sha(up.read_bytes()) if C["ugm"] else None

    c_doc = json.loads(raws["curriculum"]); s_doc = json.loads(raws["spine"]); k_doc = json.loads(raws["kg"])
    (dc, tc) = detect_dumper(raws["curriculum"].decode("utf-8"), c_doc)
    (ds, ts) = detect_dumper(raws["spine"].decode("utf-8"), s_doc)
    (dk, tk) = detect_dumper(raws["kg"].decode("utf-8"), k_doc)
    if not (dc and ds and dk): fail(f"{slug}: serializer round-trip failed (dump law)")
    m_raw = raws["manifest"].decode("utf-8")
    m_doc = json.loads(m_raw)
    (dm, tm) = detect_dumper(m_raw, m_doc)
    if not dm: fail(f"{slug}: manifest serializer round-trip failed")
    gate(f"{slug}:G1-serializers", True, "content/spine/kg/manifest round-trip EXACT (dump law)")

    # pre-state snapshots for the byte-scope law
    pre_c_nodes = copy.deepcopy(c_doc["nodes"]); pre_c_edges = copy.deepcopy(c_doc["edges"])
    pre_s_nodes = copy.deepcopy(s_doc["curriculum"]["nodes"]); pre_s_edges = copy.deepcopy(s_doc["curriculum"]["edges"])

    # --- content curriculum surgery ---
    nodes = c_doc["nodes"]
    pre_pts = {n["code"]: n for n in nodes if n.get("family") == "SPEC_POINT"}
    if len(pre_pts) != C["pre_pts"]: fail(f"{slug}: pre point census {len(pre_pts)} != {C['pre_pts']}")
    if any(code in pre_pts for code in C["adds"]): fail(f"{slug}: add code already present (collision)")
    ia = next(i for i, n in enumerate(nodes) if n.get("code") == C["node_after"])
    ib = next(i for i, n in enumerate(nodes) if n.get("code") == C["node_before"])
    if ib != ia + 1: fail(f"{slug}: {C['node_after']} (pos {ia}) and {C['node_before']} (pos {ib}) not adjacent")
    pid = nodes[ia]["parents"][0]
    if nodes[ib].get("family") == "SPEC_POINT":
        if nodes[ib]["order"] != nodes[ia]["order"] + 1: fail(f"{slug}: insertion point not densely adjacent (order law)")
    else:
        nxt = next(n for n in nodes[ib:] if n.get("family") == "SPEC_POINT")
        if nxt["order"] != nodes[ia]["order"] + 1: fail(f"{slug}: block-boundary insertion point violates the point-order law")
    new_nodes = [{"code": code, "family": "SPEC_POINT", "title": title, "description": None,
                  "parents": [pid], "provenanceTier": nodes[ia]["provenanceTier"],
                  "order": nodes[ia]["order"] + 1 + i}
                 for i, (code, title) in enumerate(C["adds"].items())]
    bump = [n for n in nodes if n.get("family") == "SPEC_POINT" and n["order"] > nodes[ia]["order"]]
    if "bump_expect" in C and [n["code"] for n in bump] != C["bump_expect"]:
        fail(f"{slug}: bump set mismatch: {[n['code'] for n in bump]}")
    if "bump_expect_count" in C and len(bump) != C["bump_expect_count"]:
        fail(f"{slug}: bump count {len(bump)} != {C['bump_expect_count']}")
    for n in bump: n["order"] += C["delta"]
    nodes[ib:ib] = new_nodes
    edges = c_doc["edges"]
    ei = next(i for i, e in enumerate(edges) if e.get("source") == pid and e.get("target") == C["edge_after"])
    if "edge_next_target" in C:
        if edges[ei + 1].get("target") != C["edge_next_target"]: fail(f"{slug}: edge adjacency broken at {ei}")
    elif edges[ei + 1].get("source") == pid: fail(f"{slug}: edge block boundary not found at {ei}")
    proto = edges[ei]
    new_edges = [dict(source=pid, relation=proto["relation"], target=code,
                      provenanceTier=proto["provenanceTier"]) for code in C["adds"]]
    edges[ei + 1:ei + 1] = new_edges
    post_pts_c = [n for n in c_doc["nodes"] if n.get("family") == "SPEC_POINT"]
    if len(post_pts_c) != C["pre_pts"] + C["delta"]: fail(f"{slug}: post content census")
    if sorted(n["order"] for n in post_pts_c) != list(range(1, C["pre_pts"] + C["delta"] + 1)):
        fail(f"{slug}: post orders not dense 1..{C['pre_pts'] + C['delta']}")
    for code, title in C["adds"].items():
        if next(n for n in post_pts_c if n["code"] == code)["title"] != title: fail(f"{slug}: {code} title not carried")
        if code not in {e["target"] for e in c_doc["edges"]}: fail(f"{slug}: {code} edge missing")
    gate(f"{slug}:G2-content-surgery", True, f"+{C['delta']} nodes at the official position, +{C['delta']} edges, {len(bump)} order bumps (+{C['delta']} each)")

    # --- spine surgery (identical) ---
    snodes = s_doc["curriculum"]["nodes"]; sedges = s_doc["curriculum"]["edges"]
    sia = next(i for i, n in enumerate(snodes) if n.get("code") == C["node_after"])
    sib = next(i for i, n in enumerate(snodes) if n.get("code") == C["node_before"])
    if sib != sia + 1: fail(f"{slug}: spine adjacency broken")
    spid = snodes[sia]["parents"][0]
    if spid != pid: fail(f"{slug}: spine parent id != content ({spid} vs {pid})")
    if snodes[sib].get("family") != "SPEC_POINT":
        nxt = next(n for n in snodes[sib:] if n.get("family") == "SPEC_POINT")
        if nxt["order"] != snodes[sia]["order"] + 1: fail(f"{slug}: spine block-boundary insertion violates the point-order law")
    for n in snodes:
        if n.get("family") == "SPEC_POINT" and n["order"] > snodes[sia]["order"]: n["order"] += C["delta"]
    snodes[sib:sib] = copy.deepcopy(new_nodes)
    sei = next(i for i, e in enumerate(sedges) if e.get("source") == pid and e.get("target") == C["edge_after"])
    sedges[sei + 1:sei + 1] = copy.deepcopy(new_edges)
    cmap = {n["code"]: n for n in c_doc["nodes"] if "-SME-" not in str(n.get("code", ""))}
    smap = {n["code"]: n for n in snodes}
    if set(cmap) != set(smap): fail(f"{slug}: content/spine official code sets diverge")
    for code in cmap:
        a, b = cmap[code], smap[code]
        if (a.get("title"), a.get("order"), a.get("family"), a.get("parents"), a.get("provenanceTier")) != \
           (b.get("title"), b.get("order"), b.get("family"), b.get("parents"), b.get("provenanceTier")):
            fail(f"{slug}: plane parity broken at {code}")
    gate(f"{slug}:G3-spine-mirror", True, f"per-code parity {len(cmap)} official nodes, edges mirrored")

    # --- manifest bump ---
    old_v, new_v = C["pre_pts"], C["pre_pts"] + C["delta"]
    pat = rf'"specPoints": {old_v}\b'
    if len(re.findall(pat, m_raw)) != 1: fail(f"{slug}: manifest specPoints {old_v} not exactly-once")
    m_new_raw = re.sub(pat, f'"specPoints": {new_v}', m_raw, count=1)
    m_new_doc = json.loads(m_new_raw)
    if m_new_doc["counts"]["specPoints"] != new_v: fail(f"{slug}: manifest bump verify")
    gate(f"{slug}:G4-manifest", True, f"specPoints {old_v}->{new_v} (single site)")

    # --- write content/spine/manifest BEFORE the KG regen (the exporter reads disk) ---
    cp.write_text(dc(c_doc, tc), encoding="utf-8")
    sp.write_text(ds(s_doc, ts), encoding="utf-8")
    mp.write_text(dm(m_new_doc, tm), encoding="utf-8")

    # --- KG regen (run-016/017/018 law + the 700bb601 spanning-tree law) ---
    pre_kg_meta = k_doc["meta"]["counts"]
    if (pre_kg_meta["nodes"], pre_kg_meta["edges"], pre_kg_meta["specPoints"]) != C["kg_pre"]:
        fail(f"{slug}: pre-KG meta {pre_kg_meta} != of-record {C['kg_pre']}")
    pre_kg_points = {p["id"]: p["text"] for p in k_doc["points"]}
    pre_kg_hier = sum(1 for e in k_doc["edges"] if (e[2] if isinstance(e, list) else e.get("relation")) == "hier")
    if pre_kg_hier != len(k_doc["nodes"]) - 1: fail(f"{slug}: pre-KG spanning tree broken ({pre_kg_hier} vs {len(k_doc['nodes'])-1})")
    # SME-filtered export input: the KG of record is the OFFICIAL spec graph — the seeder's
    # T-SME-SEL-W2 law skips -SME- rows fleet-wide (nothing lands, nothing dangles); the exporter
    # predates the SME class, so the regen runs on the filtered official tree and the full content
    # doc (with the SME picker layer) is restored right after (T-SME-SEL territory untouched).
    sme_nodes = [n for n in c_doc["nodes"] if "-SME-" in str(n.get("code", ""))]
    export_doc = c_doc
    if sme_nodes:
        export_doc = copy.deepcopy(c_doc)
        export_doc["nodes"] = [n for n in export_doc["nodes"] if "-SME-" not in str(n.get("code", ""))]
        export_doc["edges"] = [e for e in export_doc["edges"]
                               if "-SME-" not in str(e.get("source", "")) and "-SME-" not in str(e.get("target", ""))]
        if len(export_doc["nodes"]) != len(c_doc["nodes"]) - len(sme_nodes): fail(f"{slug}: SME filter node census")
        cp.write_text(dc(export_doc, tc), encoding="utf-8")
    payload = kg_export.export_course(slug, registry)
    cts = payload["meta"]["counts"]
    exp = (C["kg_pre"][0] + C["delta"], C["kg_pre"][1] + C["delta"], C["pre_pts"] + C["delta"])
    if (cts["nodes"], cts["edges"], cts["specPoints"]) != exp:
        fail(f"{slug}: KG counts {cts} != expected {exp}")
    payload2 = kg_export.export_course(slug, registry)
    p1 = json.loads(json.dumps(payload)); p2 = json.loads(json.dumps(payload2))
    p1["meta"].pop("generatedUtc", None); p2["meta"].pop("generatedUtc", None)
    if json.dumps(p1, sort_keys=True) != json.dumps(p2, sort_keys=True): fail(f"{slug}: KG deep-equal broken")
    if sme_nodes:
        cp.write_text(dc(c_doc, tc), encoding="utf-8")  # restore the full content doc (SME layer intact)
    kg_points = {p["id"]: p["text"] for p in payload["points"]}
    for code, title in C["adds"].items():
        if kg_points.get(code) != title: fail(f"{slug}: KG point {code} does not carry the official title")
    for pid_, txt in kg_points.items():
        if CTRL.search(txt): fail(f"{slug}: KG point {pid_} carries control chars")
    # the KG mirror law: points[].text == the content titles of record (T-SPEC-KG-REGEN-1)
    reconciled = sorted(k for k, t in pre_kg_points.items() if k in kg_points and kg_points[k] != t)
    # hand-maintained spanning-tree edges (700bb601 law): cs-23's stub sections sec7/sec9/sec10
    # hang via [subject,secN,hier] edges the exporter does not emit; re-append at the canonical
 # numeric position in the subject block. meta stays the exporter output (nodes/meta law).
    hand = []
    if slug == "cie-igcse-computer-science-23":
        hand = [["subject", "sec7", "hier"], ["subject", "sec9", "hier"], ["subject", "sec10", "hier"]]
        for e in hand:
            pos = next(i for i, x in enumerate(payload["edges"])
                       if isinstance(x, list) and x[0] == "subject" and x[1].startswith("sec")
                       and int(x[1][3:]) < int(e[1][3:])
                       and (i + 1 >= len(payload["edges"])
                            or not (isinstance(payload["edges"][i + 1], list)
                                    and payload["edges"][i + 1][0] == "subject"
                                    and payload["edges"][i + 1][1].startswith("sec")
                                    and int(payload["edges"][i + 1][1][3:]) < int(e[1][3:]))))
            payload["edges"].insert(pos + 1, e)
    arr_hier = sum(1 for e in payload["edges"] if (e[2] if isinstance(e, list) else e.get("relation")) == "hier")
    if arr_hier != cts["nodes"] - 1: fail(f"{slug}: post-KG spanning tree broken ({arr_hier} vs {cts['nodes']-1})")
    gate(f"{slug}:G5-kg-regen", True,
         f"array {len(payload['nodes'])}n/{len(payload['edges'])}e (meta {cts['nodes']}/{cts['edges']}/{cts['specPoints']} = exporter output), hier {arr_hier}==nodes-1, deep-equal OK, {C['delta']} new titles carried"
         + (f", {len(reconciled)} pre-existing drift texts reconciled to the mirror law" if reconciled else ""))

    # --- byte-scope law: per-node dump diff vs pre-state ---
    post_c_all = node_dumps(c_doc["nodes"]); pre_c_all = node_dumps(pre_c_nodes)
    added = set(post_c_all) - set(pre_c_all)
    if added != set(C["adds"]): fail(f"{slug}: content node delta != the declared adds ({added})")
    bumped_codes = {n["code"] for n in bump}
    for code in pre_c_all:
        if code in added: continue
        pre_d, post_d = pre_c_all[code], post_c_all[code]
        if code in bumped_codes:
            pre_n = next(n for n in pre_c_nodes if n.get("code") == code and n.get("family") == "SPEC_POINT")
            post_n = next(n for n in c_doc["nodes"] if n.get("code") == code and n.get("family") == "SPEC_POINT")
            a = {k: v for k, v in pre_n.items() if k != "order"}; b = {k: v for k, v in post_n.items() if k != "order"}
            if a != b or post_n["order"] - pre_n["order"] != C["delta"]:
                fail(f"{slug}: bumped node {code} differs beyond the order field")
        elif pre_d != post_d:
            fail(f"{slug}: non-bump node {code} mutated")
    pre_edge_set = [dump_compact(e, False) for e in pre_c_edges]
    post_edge_set = [dump_compact(e, False) for e in c_doc["edges"]]
    from collections import Counter
    edge_delta = Counter(post_edge_set) - Counter(pre_edge_set)
    if set(edge_delta) != {dump_compact(e, False) for e in new_edges} or sum(edge_delta.values()) != C["delta"]:
        fail(f"{slug}: edge delta != the declared adds")
    post_s_all = node_dumps(snodes); pre_s_all = node_dumps(pre_s_nodes)
    if set(post_s_all) - set(pre_s_all) != set(C["adds"]): fail(f"{slug}: spine node delta != the declared adds")
    for code in pre_s_all:
        if code in post_s_all and code not in added:
            a, b = pre_s_all[code], post_s_all[code]
            if a != b:
                pre_n = next(n for n in pre_s_nodes if n.get("code") == code and n.get("family") == "SPEC_POINT")
                post_n = next(n for n in snodes if n.get("code") == code and n.get("family") == "SPEC_POINT")
                pa = {k: v for k, v in pre_n.items() if k != "order"}; pb = {k: v for k, v in post_n.items() if k != "order"}
                if pre_n.get("family") != "SPEC_POINT" or pa != pb or post_n["order"] - pre_n["order"] != C["delta"]:
                    fail(f"{slug}: spine node {code} mutated beyond the law")
    gate(f"{slug}:G7-byte-scope", True, f"delta == exactly {C['delta']} nodes + {C['delta']} edges + {len(bump)} order fields, both planes; zero other bytes")

    # --- write KG + index (index = the P5 array truth per 700bb601/kg-corpus) ---
    kp.write_text(dk(payload, tk), encoding="utf-8")
    ip = HUB / "public/kg/data/index.json"
    i_raw = ip.read_text(encoding="utf-8")
    i_doc = json.loads(i_raw)
    (di, ti) = detect_dumper(i_raw, i_doc)
    if not di: fail(f"{slug}: index serializer round-trip failed")
    entry = next(c for c in i_doc["courses"] if c.get("slug") == slug)
    pre_arr_n, pre_arr_e = len(k_doc["nodes"]), len(k_doc["edges"])
    if (entry["counts"]["nodes"], entry["counts"]["edges"], entry["counts"]["specPoints"]) != (pre_arr_n, pre_arr_e, C["kg_pre"][2]):
        fail(f"{slug}: index pre-truth {entry['counts']} != array {(pre_arr_n, pre_arr_e, C['kg_pre'][2])}")
    entry["counts"]["nodes"] = len(payload["nodes"])
    entry["counts"]["edges"] = len(payload["edges"])
    entry["counts"]["specPoints"] = cts["specPoints"]
    ip.write_text(di(i_doc, ti), encoding="utf-8")
    gate(f"{slug}:G8-index", True, f"index counts -> {entry['counts']['nodes']}n/{entry['counts']['edges']}e/{entry['counts']['specPoints']}sp (P5 array truth)")
    if C["ugm"]:
        if sha(up.read_bytes()) != ugm_sha_pre: fail(f"{slug}: UGM mutated (must be untouched)")
        gate(f"{slug}:G6-ugm-untouched", True, "ugm-resources.json byte-identical (new points carry no resources)")

    apply_manifest["courses"].append({
        "slug": slug, "addedNodes": new_nodes, "addedEdges": new_edges,
        "orderBumps": [{"code": n["code"], "from": n["order"] - C["delta"], "to": n["order"]} for n in bump],
        "manifest": {"specPoints": {"from": old_v, "to": new_v}},
        "kgSpanningTreeHandEdges": hand,
        "kgPreExistingDriftReconciled": {"codes": reconciled,
            "note": "the of-record KG file's points[].text for these codes predated the content titles of record; the regen restores the T-SPEC-KG-REGEN-1 mirror law (points[].text == content titles)"},
        "index": {"counts": {"from": {"nodes": pre_arr_n, "edges": pre_arr_e, "specPoints": C["kg_pre"][2]},
                             "to": {"nodes": len(payload["nodes"]), "edges": len(payload["edges"]), "specPoints": cts["specPoints"]}}},
        "composed": dict(C["composed"]),
        "sha256": {"curriculum": {"pre": sha(raws["curriculum"]), "post": sha(cp.read_bytes())},
                   "spine": {"pre": sha(raws["spine"]), "post": sha(sp.read_bytes())},
                   "kg": {"pre": sha(raws["kg"]), "post": sha(kp.read_bytes())},
                   "manifest": {"pre": sha(raws["manifest"]), "post": sha(mp.read_bytes())}}})

(ART / "gates_r0.json").write_text(json.dumps(gates, indent=1, ensure_ascii=False) + "\n")
(ART / "apply_manifest_r0.json").write_text(json.dumps(apply_manifest, indent=1, ensure_ascii=False) + "\n")
print("ALL IN-SCRIPT GATES GREEN — artifacts written")
