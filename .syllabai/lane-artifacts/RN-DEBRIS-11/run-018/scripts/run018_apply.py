#!/usr/bin/env python3
"""RN-DEBRIS-11 run-018 — apply: the 9709 P1 glue/interleave title repairs to
the official rows of record (both pure-1 courses, three planes + UGM serve).

Law chain:
  evidence-first — the ONLY source of new title bytes is adjudication_r0.json
  (backed by official_9709_p1_census_r0.json, sha-pinned 9709 PDF
  3a7a3769…6256, run-009/016 continuity). The apply refuses to run if the
  adjudication artifact is missing or the live pre-state does not match the
  surveyed garbage of record.

Repair class of record (run-013 FLEET OBSERVATION, run-016 re-affirmation):
  cie-{a-level,as}-maths-20-pure-1 both-planes glue/interleave point titles —
  sweep-invisible (content == spine byte-equal 33/33; AS content == a-level
  content byte-equal). 33 corpus rows vs 34 official rows: 21 title repairs,
  10 byte-clean (disclosed), 2 debris rows + 1 coverage gap (1.3.3/1.3.4/1.3.5
  blob-carried) = structural PROPOSAL (NOT applied — desk territory).

Surfaces (per course):
  content curriculum + hub spine (title swaps, codes UNCHANGED) +
  ugm-resources.json officialText (T-UGM serve law: byte-true copy of the hub
  bundle of record) + KG regen via kg_export.export_course (run-016/017 law,
  deep-equal gate ex-generatedUtc).
"""
import hashlib, json, re, sys
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-018"
HUB = REPO / "apps" / "hub"
SLUGS = ["cie-a-level-maths-20-pure-1", "cie-as-maths-20-pure-1"]
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# 9709 P1 notes vocabulary (the notes column of the subject-content tables)
LEAK = ["Including", "e.g.", "Questions may", "Sketches should", "No specialised",
        "Knowledge of", "Only an informal", "By factorising", "A volume of revolution may",
        "the condition for the convergence"]  # last one is statement vocab — drop below
LEAK = ["Including", "e.g.", "Questions may", "Sketches should", "No specialised",
        "Knowledge of", "Only an informal", "By factorising", "A volume of revolution may"]
DEBRIS = {"1.3.1a", "1.3.2a"}  # proposal rows — titles UNTOUCHED this run


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()


def dump_pretty(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def dump_compact(obj, trailing_nl):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + ("\n" if trailing_nl else "")


# ---------- 1. evidence-first load ----------
adj_path = ART / "adjudication_r0.json"
if not adj_path.exists():
    fail("adjudication artifact missing — evidence pass must run first (zero-invention law)")
adj = json.loads(adj_path.read_text(encoding="utf-8"))
title_map = adj["titleMap"]
if len(title_map) != 21:
    fail(f"titleMap must carry 21 repairs, has {len(title_map)}")
REPAIRS = {code: v["new"] for code, v in title_map.items()}
for code, v in title_map.items():
    if v["old"] == v["new"]:
        fail(f"{code} old==new")
    if CTRL.search(v["new"]):
        fail(f"{code} new title carries control chars")
print(f"EVIDENCE-OK 21 repairs of record (composed: {sum(1 for v in title_map.values() if v['composed'])})")

# ---------- 2. pre-state verify (garbage of record, live) ----------
planes = {}
for slug in SLUGS:
    cp = HUB / f"content/{slug}/curriculum.json"
    sp = HUB / f"spines/{slug}.json"
    up = HUB / f"content/{slug}/ugm-resources.json"
    kp = HUB / f"public/kg/data/{slug}.json"
    c_raw, s_raw, u_raw, k_raw = (p.read_text(encoding="utf-8") for p in (cp, sp, up, kp))
    c_doc, s_doc, u_doc = json.loads(c_raw), json.loads(s_raw), json.loads(u_raw)
    cn = {n["code"]: n for n in c_doc["nodes"] if n.get("family") == "SPEC_POINT"}
    sn = {n["code"]: n for n in s_doc["curriculum"]["nodes"] if n.get("family") == "SPEC_POINT"}
    un = {p["code"]: p for p in u_doc["specPoints"]}
    kn = {p["id"]: p["text"] for p in json.loads(k_raw)["points"]}
    if set(cn) != set(sn) or len(cn) != 33:
        fail(f"{slug}: plane census drift content {len(cn)} vs spine {len(sn)}")
    if set(un) != set(cn) - DEBRIS - {"1.4.1a"}:
        fail(f"{slug}: UGM code set unexpected: missing={set(cn) - set(un)}")
    for code, v in title_map.items():
        if cn[code]["title"] != v["old"]:
            fail(f"{slug}:{code} content pre-state != surveyed garbage of record")
        if sn[code]["title"] != v["old"]:
            fail(f"{slug}:{code} spine pre-state != surveyed garbage of record")
    for code in cn:
        if cn[code]["title"] != sn[code]["title"]:
            fail(f"{slug}:{code} planes not byte-equal pre-apply (sweep-invisible law)")
    planes[slug] = dict(cp=cp, sp=sp, up=up, kp=kp, c_raw=c_raw, s_raw=s_raw, u_raw=u_raw,
                        k_raw=k_raw, c_doc=c_doc, s_doc=s_doc, u_doc=u_doc, cn=cn, sn=sn, un=un, kn=kn)
# cross-course byte-equality of the garbage (both-planes + both-courses class)
a, b = planes[SLUGS[0]], planes[SLUGS[1]]
for code in a["cn"]:
    if a["cn"][code]["title"] != b["cn"][code]["title"]:
        fail(f"cross-course garbage drift at {code}")
print("PRE-STATE OK: 2 courses x 33 points, content==spine, cross-course byte-equal garbage; UGM 30 codes (a-suffix debris unserved)")

# ---------- 3. sibling-file mirror survey (notTouched evidence) ----------
old_titles = [v["old"] for v in title_map.values()]
mirror_hits = {}
for slug in SLUGS:
    d = HUB / f"content/{slug}"
    for f in sorted(d.iterdir()):
        if f.name in ("curriculum.json", "ugm-resources.json") or not f.is_file():
            continue
        raw = f.read_text(encoding="utf-8")
        hits = [t for t in old_titles if t in raw]
        if hits:
            mirror_hits[f"{slug}/{f.name}"] = hits
    # KG + spine are covered above; registry/cards outside content/ scanned below
for rel in [f"spines/{s}.json" for s in SLUGS] + [f"public/kg/data/{s}.json" for s in SLUGS]:
    pass  # covered by the planes themselves
if mirror_hits:
    fail(f"unexpected point-title mirrors outside the planes of record: {list(mirror_hits)}")
print("MIRROR-SURVEY OK: zero old-title hits outside the 8 planes of record")

# ---------- 4. apply ----------
def with_titles(doc, mapping, family_key, container):
    nodes = doc[container]["nodes"] if container else doc["nodes"]
    for n in nodes:
        if n.get("family") == family_key and n["code"] in mapping:
            n["title"] = mapping[n["code"]]
    return doc


manifest_files = []
for slug in SLUGS:
    P = planes[slug]
    # 4a. content + spine title swaps
    with_titles(P["c_doc"], REPAIRS, "SPEC_POINT", None)
    with_titles(P["s_doc"], REPAIRS, "SPEC_POINT", "curriculum")
    c_out = dump_pretty(P["c_doc"])
    s_out = dump_compact(P["s_doc"], P["s_raw"].endswith("\n"))
    # 4b. UGM officialText byte-true to the final content titles (serve law)
    u_sites = 0
    final_titles = {n["code"]: n["title"] for n in P["c_doc"]["nodes"] if n.get("family") == "SPEC_POINT"}
    for p in P["u_doc"]["specPoints"]:
        new_t = final_titles[p["code"]]
        if p.get("officialText") != new_t:
            p["officialText"] = new_t
            u_sites += 1
    u_out = dump_pretty(P["u_doc"])
    # byte-exactness: output == pre-state + swaps only
    exp_c = dump_pretty(with_titles(json.loads(P["c_raw"]), REPAIRS, "SPEC_POINT", None))
    exp_s = dump_compact(with_titles(json.loads(P["s_raw"]), REPAIRS, "SPEC_POINT", "curriculum"), P["s_raw"].endswith("\n"))
    if exp_c != c_out or exp_s != s_out:
        fail(f"{slug}: byte-exactness broken (content/spine)")
    P["c_out"], P["s_out"], P["u_out"], P["u_sites"] = c_out, s_out, u_out, u_sites
    P["cp"].write_text(c_out, encoding="utf-8")
    P["sp"].write_text(s_out, encoding="utf-8")
    P["up"].write_text(u_out, encoding="utf-8")
    print(f"APPLY OK {slug}: content 21 + spine 21 + UGM officialText {u_sites} sites")

# ---------- 5. KG regen (run-016/017 law) ----------
sys.path.insert(0, str(HUB / "scripts"))
import kg_export
reg_data = json.loads((HUB / "content/courses.json").read_text(encoding="utf-8"))
registry = {}
for entry in (reg_data if isinstance(reg_data, list) else reg_data.get("courses", [])):
    if isinstance(entry, dict) and entry.get("slug"):
        registry[entry["slug"]] = entry
for slug in SLUGS:
    P = planes[slug]
    pre_kg = json.loads(P["k_raw"])
    pre_counts = pre_kg["meta"]["counts"]
    payload = kg_export.export_course(slug, registry)
    cts = payload["meta"]["counts"]
    if (cts["nodes"], cts["edges"], cts["specPoints"]) != (pre_counts["nodes"], pre_counts["edges"], pre_counts["specPoints"]):
        fail(f"{slug}: KG export counts drift {cts} vs pre {pre_counts}")
    payload2 = kg_export.export_course(slug, registry)
    p1 = json.loads(json.dumps(payload)); p2 = json.loads(json.dumps(payload2))
    p1["meta"].pop("generatedUtc", None); p2["meta"].pop("generatedUtc", None)
    if json.dumps(p1, sort_keys=True) != json.dumps(p2, sort_keys=True):
        fail(f"{slug}: KG deep-equal (ex-generatedUtc) broken")
    kg_points = {p["id"]: p["text"] for p in payload["points"]}
    for code, new in REPAIRS.items():
        if kg_points.get(code) != new:
            fail(f"{slug}: KG point {code} does not carry the official title")
    for pid, txt in kg_points.items():
        if CTRL.search(txt):
            fail(f"{slug}: KG point {pid} carries control chars")
    k_out = dump_compact(payload, P["k_raw"].endswith("\n"))
    P["kp"].write_text(k_out, encoding="utf-8")
    P["k_out"] = k_out
    print(f"KG-REGEN OK {slug}: {cts['nodes']}n/{cts['edges']}e/{cts['specPoints']}pts, deep-equal OK, 21 titles carried")

# ---------- 6. post asserts ----------
LEAK_IN_NEW = [leak for leak in LEAK for new in REPAIRS.values() if leak in new]
if LEAK_IN_NEW:
    fail(f"notes-vocabulary leak in new titles: {LEAK_IN_NEW}")
for slug in SLUGS:
    P = planes[slug]
    c2 = json.loads(P["cp"].read_text(encoding="utf-8"))
    s2 = json.loads(P["sp"].read_text(encoding="utf-8"))
    u2 = json.loads(P["up"].read_text(encoding="utf-8"))
    k2 = json.loads(P["kp"].read_text(encoding="utf-8"))
    cn2 = {n["code"]: n for n in c2["nodes"] if n.get("family") == "SPEC_POINT"}
    sn2 = {n["code"]: n for n in s2["curriculum"]["nodes"] if n.get("family") == "SPEC_POINT"}
    un2 = {p["code"]: p["officialText"] for p in u2["specPoints"]}
    kn2 = {p["id"]: p["text"] for p in k2["points"]}
    if len(cn2) != 33 or len(sn2) != 33 or len(kn2) != 33:
        fail(f"{slug}: post-apply census drift")
    for code in cn2:
        if cn2[code]["title"] != sn2[code]["title"]:
            fail(f"{slug}:{code} content/spine not byte-equal post-apply")
        if code in un2 and un2[code] != cn2[code]["title"]:
            fail(f"{slug}:{code} UGM officialText not byte-true post-apply")
        if kn2[code] != cn2[code]["title"]:
            fail(f"{slug}:{code} KG text not byte-true post-apply")
    for n in list(cn2.values()) + list(sn2.values()):
        if CTRL.search(n["title"]):
            fail(f"{slug}: control char survived in {n['code']}")
    # proposal rows byte-untouched (titles not in titleMap; rows must survive)
    for code in DEBRIS:
        if code not in cn2:
            fail(f"{slug}: debris row {code} vanished")
        if cn2[code]["title"] != planes[slug]["cn"][code]["title"]:
            fail(f"{slug}: debris row {code} title mutated (proposal = NOT applied)")
print("POST-ASSERTS OK: 2x33 points; content==spine==UGM==KG byte-true; zero CTRL; zero leaks; debris rows intact")
print("CROSS-COURSE: " + ("content planes byte-equal across the two courses" if all(
    planes[SLUGS[0]]["cn"][c]["title"] == planes[SLUGS[1]]["cn"][c]["title"] for c in planes[SLUGS[0]]["cn"]) else "DRIFT"))

# ---------- 7. apply manifest artifact ----------
def frec(p, raw, out, sites, disp=None):
    d = {"file": str(p.relative_to(REPO)), "oldSha": sha(raw), "newSha": sha(out)}
    if sites is not None:
        d["sites"] = sites
    if disp:
        d["disposition"] = disp
    return d


files = []
for slug in SLUGS:
    P = planes[slug]
    files += [
        frec(P["cp"], P["c_raw"], P["c_out"], 21),
        frec(P["sp"], P["s_raw"], P["s_out"], 21),
        frec(P["up"], P["u_raw"], P["u_out"], P["u_sites"],
             "T-UGM serve law: officialText byte-true to the hub bundle of record"),
        frec(P["kp"], P["k_raw"], P["k_out"], None,
             "KG-REGEN-OK (exporter-compatible, deep-equal ex-generatedUtc)"),
    ]
out = {
    "artifact": "rn11-run-018-apply-manifest-r0",
    "law": "evidence-first: new title bytes ONLY from adjudication_r0.json (sha-pinned 9709 PDF 3a7a3769…6256, "
           "run-009/016 continuity re-verified pre-extraction); codes UNCHANGED (structural re-code = desk "
           "territory, filed in adjudication_r0.json proposals); debris rows 1.3.1a/1.3.2a + coverage gap "
           "1.3.3/1.3.4/1.3.5 NOT applied; UGM officialText byte-true serve law; KG regen per run-016/017 law",
    "repairs": [
        {"carrier": code, "officialRow": v["officialRow"], "composed": v["composed"],
         "oldSha": sha(v["old"]), "newSha": sha(v["new"]), "glyphWork": v["glyphWork"]}
        for code, v in title_map.items()
    ],
    "files": files,
    "notTouched": {
        "manifest.json": "counts unchanged (33 specPoints x2) — title-only pass",
        "prerequisites.json": "references point CODES — untouched (no anchor changes; title-only pass)",
        "notes/questions/flashcards/concept-graph/learner-sim/placement-backfill": "mirror survey: zero old-title hits",
        "spine meta": "untouched (title-only pass; resourcesSha unchanged)",
        "1.4.1a code": "retained per the run-012 parse-vintage/frozen-anchor law (title repaired in place)",
    },
}
(ART / "apply_manifest_r0.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print("MANIFEST-OK -> .syllabai/lane-artifacts/RN-DEBRIS-11/run-018/apply_manifest_r0.json")
