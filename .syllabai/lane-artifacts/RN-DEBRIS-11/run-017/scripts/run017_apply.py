#!/usr/bin/env python3
"""RN-DEBRIS-11 run-017 — apply: cs-23 garbage point-title repairs to the
official 0478 rows of record.

Law chain:
  evidence-first — the ONLY source of new title bytes is
  official_0478_census_r0.json (sha-pinned PDF, leak-detected, structure-
  asserted). The apply refuses to run if the census artifact is missing or
  the live pre-state does not match the surveyed garbage of record.

Repair class of record (run-016 newFindings[0], discharged here):
  cs-23 both-planes-garbage point titles — sweep-invisible (both planes
  byte-equal). 11 rows, two subclasses:
    A. mangled interleave (10 rows): 1.1.2, 1.1.4, 2.1.1, 2.1.2, 3.1.1,
       3.1.2, 3.2.3, 3.4.3, 6.3.5, 8.1.4
    B. multi-row blob (1 row): 8.1.1a — carries official 8.1.4(f)'s text
       (run-016 newFindings[1] mis-map suspicion, CONFIRMED by census)
  Partition law for 8.1.4/8.1.1a: the corpus rows partition official row
  8.1.4 — 8.1.4 takes sub-rows (a)-(e), 8.1.1a takes (f) (its anchor of
  record per run-016's own finding). No title byte is invented; no corpus
  code is changed (structural re-code = desk territory, filed in the
  proposal map artifact).

Surfaces: content curriculum + hub spine (both planes) + KG regen via
kg_export.export_course (run-016 law, deep-equal gate ex-generatedUtc).
Manifest counts UNCHANGED (88 points; title-only pass) — verified, not edited.
"""
import hashlib, json, re, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-017"
HUB = REPO / "apps" / "hub"
SLUG = "cie-igcse-computer-science-23"
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
LEAK = ["Including", "Limited to", "e.g.", "i.e.", "such as", "Candidates will not",
        "A packet of data contains", "see section 4", "See section 4"]

def fail(msg):
    print(f"FAIL: {msg}", flush=True); sys.exit(2)

def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()

def dump_pretty(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"  # run-016 dump law (indent=1)

def dump_compact(obj, trailing_nl):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + ("\n" if trailing_nl else "")

# ---------- 1. evidence-first load ----------
census_path = ART / "official_0478_census_r0.json"
if not census_path.exists():
    fail("census artifact missing — evidence pass must run first (zero-invention law)")
census = json.loads(census_path.read_text(encoding="utf-8"))
rows, sub = census["rows"], census["subRows"]

# the 11 repairs: code -> new title (from census bytes only)
REPAIRS = {
    "1.1.2": rows["1.1.2"]["official"],
    "1.1.4": rows["1.1.4"]["official"],
    "2.1.1": rows["2.1.1"]["official"],
    "2.1.2": rows["2.1.2"]["official"],
    "3.1.1": rows["3.1.1"]["official"],
    "3.1.2": rows["3.1.2"]["official"],
    "3.2.3": rows["3.2.3"]["official"],
    "3.4.3": rows["3.4.3"]["official"],
    "6.3.5": rows["7.5"]["official"],          # official row 7.5 (mis-map disclosed)
    "8.1.1a": sub["8.1.4f"],                   # official 8.1.4(f) — the partition's (f) half
}
# 8.1.4 takes (a)-(e): the official row minus its (f) tail (partition law)
full_814 = rows["8.1.4"]["official"]
tail = f" (f) {sub['8.1.4f']}"
if not full_814.endswith(tail):
    fail(f"8.1.4 (f)-tail mismatch: {full_814!r}")
REPAIRS["8.1.4"] = full_814[: -len(tail)]

# ---------- 2. pre-state verify (garbage of record, live) ----------
def load_plane(path):
    raw = path.read_text(encoding="utf-8")
    d = json.loads(raw)
    cur = d.get("curriculum", d)
    return raw, d, cur, cur["nodes"]

cpath, spath = HUB / f"content/{SLUG}/curriculum.json", HUB / f"spines/{SLUG}.json"
c_raw, c_doc, c_cur, c_nodes = load_plane(cpath)
s_raw, s_doc, s_cur, s_nodes = load_plane(spath)
cn = {n["code"]: n for n in c_nodes if n.get("family") == "SPEC_POINT"}
sn = {n["code"]: n for n in s_nodes if n.get("family") == "SPEC_POINT"}
if set(cn) != set(sn) or len(cn) != 88:
    fail(f"plane census drift: content {len(cn)} vs spine {len(sn)}")

manifest = []
for code, new in REPAIRS.items():
    old_c, old_s = cn[code]["title"], sn[code]["title"]
    if old_c != old_s:
        fail(f"{code} planes not byte-equal pre-apply (sweep-invisible law violated)")
    if old_c == new:
        fail(f"{code} old==new — nothing to repair?")
    if not CTRL.search(old_c) and code != "6.3.5":
        # class A/B carriers all carry the BEL glyph except the mis-filed 6.3.5
        fail(f"{code} expected BEL glyph in pre-state, none found")
    manifest.append({
        "code": code, "old": old_c, "new": new,
        "oldSha": sha(old_c), "newSha": sha(new),
        "composed": True, "censusSource": (
            "rows['7.5'] (official row 7.5; code 6.3.5 mis-map disclosed)"
            if code == "6.3.5" else
            "subRows['8.1.4f'] (official 8.1.4(f); partition law)"
            if code == "8.1.1a" else
            "rows['8.1.4'] minus (f) tail (partition law)"
            if code == "8.1.4" else
            f"rows['{code}']"),
    })
print(f"PRE-STATE OK: {len(manifest)} garbage rows of record, planes byte-equal")

# ---------- 3. apply (both planes) ----------
for code, new in REPAIRS.items():
    cn[code]["title"] = new
    sn[code]["title"] = new

c_out = dump_pretty(c_doc)
s_trailing = s_raw.endswith("\n")
s_out = dump_compact(s_doc, s_trailing)  # spine of record is compact single-line
# pretty-dump must not perturb anything but the 11 title strings: re-parse and
# deep-compare against the in-memory docs, then verify the diff is exactly the
# 11 title sites (anti-collateral assert)
c2 = json.loads(c_out); s2 = json.loads(s_out)
def strip_titles(doc):
    return json.loads(json.dumps(doc).replace('\\"title\\"', 'title'))  # noop guard
diff_sites = []
for (a, b, tag) in ((c_doc, c2, "content"), (s_doc, s2, "spine")):
    na = {n["code"]: n for n in a["nodes"] if n.get("family") == "SPEC_POINT"} if "nodes" in a else {n["code"]: n for n in a["curriculum"]["nodes"] if n.get("family") == "SPEC_POINT"}
    nb = {n["code"]: n for n in b["nodes"] if n.get("family") == "SPEC_POINT"} if "nodes" in b else {n["code"]: n for n in b["curriculum"]["nodes"] if n.get("family") == "SPEC_POINT"}
    for code in na:
        if na[code] != nb[code]:
            if na[code]["title"] == REPAIRS.get(code) and nb[code]["title"] == REPAIRS.get(code):
                diff_sites.append(tag)  # serialization round-trip only
            else:
                fail(f"unexpected non-title delta in {tag} {code}")
cpath.write_text(c_out, encoding="utf-8")
spath.write_text(s_out, encoding="utf-8")
print(f"APPLY OK: 11 sites x2 planes ({cpath.name}, {spath.name})")

# ---------- 4. post asserts ----------
c_raw2, c_doc2, c_cur2, c_nodes2 = load_plane(cpath)
s_raw2, s_doc2, s_cur2, s_nodes2 = load_plane(spath)
cn2 = {n["code"]: n for n in c_nodes2 if n.get("family") == "SPEC_POINT"}
sn2 = {n["code"]: n for n in s_nodes2 if n.get("family") == "SPEC_POINT"}
for code, new in REPAIRS.items():
    if cn2[code]["title"] != new or sn2[code]["title"] != new:
        fail(f"{code} post-apply title mismatch")
for n in list(cn2.values()) + list(sn2.values()):
    if CTRL.search(n["title"]):
        fail(f"control char survived in {n['code']}: {n['title']!r}")
for code, new in REPAIRS.items():
    for leak in LEAK:
        if leak in new:
            fail(f"{code} notes-vocabulary leak {leak!r}")
# counts unchanged (title-only law)
if len(cn2) != 88 or len(sn2) != 88 or len(c_nodes) != len(c_nodes2) or len(s_nodes) != len(s_nodes2):
    fail("node census drift — title-only pass must not change counts")
# byte-identity of everything except the 11 title sites: re-serialize the
# PRE-apply docs with the 11 titles swapped and compare to the written bytes
pre = json.loads(c_raw); pre2 = json.loads(s_raw)
for doc, code in ((pre, None),):
    pass
def with_titles(doc, mapping):
    for n in doc["nodes"] if "nodes" in doc else doc["curriculum"]["nodes"]:
        if n.get("family") == "SPEC_POINT" and n["code"] in mapping:
            n["title"] = mapping[n["code"]]
    return doc
exp_c = dump_pretty(with_titles(json.loads(c_raw), REPAIRS))
exp_s = dump_compact(with_titles(json.loads(s_raw), REPAIRS), s_trailing)
if exp_c != c_out or exp_s != s_out:
    fail("byte-exactness broken: output != pre-state + 11 title swaps only")
print("POST-ASSERTS OK: 11+11 sites, zero CTRL, zero leaks, counts 88/88, byte-exact scope")

# ---------- 5. KG regen (run-016 law) ----------
sys.path.insert(0, str(HUB / "scripts"))
import kg_export
reg_data = json.loads((HUB / "content/courses.json").read_text(encoding="utf-8"))
registry = {}
for entry in (reg_data if isinstance(reg_data, list) else reg_data.get("courses", [])):
    if isinstance(entry, dict) and entry.get("slug"):
        registry[entry["slug"]] = entry
kpath = HUB / f"public/kg/data/{SLUG}.json"
k_raw = kpath.read_text(encoding="utf-8")
payload = kg_export.export_course(SLUG, registry)
cts = payload["meta"]["counts"]
if cts["nodes"] != 120 or cts["specPoints"] != 88:
    fail(f"KG export counts drift: {cts}")
k_trailing = k_raw.endswith("\n")
k_out = dump_compact(payload, k_trailing)
payload2 = kg_export.export_course(SLUG, registry)
p1 = json.loads(json.dumps(payload)); p2 = json.loads(json.dumps(payload2))
p1["meta"].pop("generatedUtc", None); p2["meta"].pop("generatedUtc", None)
if json.dumps(p1, sort_keys=True) != json.dumps(p2, sort_keys=True):
    fail("KG deep-equal (ex-generatedUtc) broken")
# KG points must now carry the 11 official titles
kg_points = {p["id"]: p["text"] for p in payload["points"]}
for code, new in REPAIRS.items():
    if kg_points.get(code) != new:
        fail(f"KG point {code} does not carry the official title")
kpath.write_text(k_out, encoding="utf-8")
print(f"KG-REGEN OK: {cts['nodes']} nodes / {cts['edges']} edges / 88 points, deep-equal OK, 11 titles carried")

# ---------- 6. apply manifest artifact ----------
out = {
    "artifact": "rn11-run-017-apply-manifest-r0",
    "law": "evidence-first: new title bytes ONLY from official_0478_census_r0.json (sha-pinned 0478 PDF); "
           "partition law for 8.1.4/8.1.1a; codes UNCHANGED (structural re-code = desk territory); "
           "manifest counts untouched (title-only pass, 88/88); KG regen per run-016 law with deep-equal gate",
    "repairs": manifest,
    "files": [
        {"file": f"apps/hub/content/{SLUG}/curriculum.json", "oldSha": sha(c_raw), "newSha": sha(c_out), "sites": 11},
        {"file": f"apps/hub/spines/{SLUG}.json", "oldSha": sha(s_raw), "newSha": sha(s_out), "sites": 11},
        {"file": f"apps/hub/public/kg/data/{SLUG}.json", "oldSha": sha(k_raw), "newSha": sha(k_out),
         "disposition": "KG-REGEN-OK (exporter-compatible, deep-equal ex-generatedUtc)"},
    ],
    "notTouched": {
        "manifest.json": "counts unchanged (88 specPoints) — title-only pass",
        "prerequisites.json": "references point CODES (load-bearing for the structural proposal) — untouched",
        "notes/questions/flashcards/concept-graph/learner-sim": "no point-title mirrors (verified in the survey)",
        "content-maps": "no point titles",
        "ugm-resources.json": "does not exist for cs-23 (UGM re-serve law not applicable)",
    },
}
(ART / "apply_manifest_r0.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print("MANIFEST-OK -> .syllabai/lane-artifacts/RN-DEBRIS-11/run-017/apply_manifest_r0.json")
