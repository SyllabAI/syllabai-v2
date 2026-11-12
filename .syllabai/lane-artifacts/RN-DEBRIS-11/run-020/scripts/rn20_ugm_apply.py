#!/usr/bin/env python3
"""RN-DEBRIS-11 run-020 — the UGM serve-plane extension (honest-gap rows).

The +3 official pure-1 codes must ride both UGM bundles' spec-point indexes
(the fold law: index == curriculum SPEC_POINT codes minus the three folded
a-codes). The new codes are UNCOVERED (no SME resources) — they enter as
honest-gap rows per the ial-maths-20-pure-4/0606 precedent: primaryPick null,
resourceCount 0, ugmIds [], NOT in coverage.specPointsCovered, never served.
Also re-pins the four census sites in ugm.bundle.test.ts (30 -> 33 index codes;
the AS curriculum census 33 -> 36). The fleet/station numbers are untouched.
"""
import json, re, sys, hashlib
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-020"

def fail(m): print(f"FAIL: {m}", flush=True); sys.exit(1)

def dump_auto(obj, raw):
    for d in (lambda o, t: json.dumps(o, indent=1, ensure_ascii=False) + ("\n" if t else ""),
              lambda o, t: json.dumps(o, separators=(",", ":"), ensure_ascii=False) + ("\n" if t else "")):
        for t in (True, False):
            if d(obj, t) == raw: return d, t
    return None, None

def sha(b): return hashlib.sha256(b).hexdigest()

# pins of record (same extraction law as the main apply)
r18_script = (REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-018/scripts/run018_adjudication.py").read_text(encoding="utf-8")
PINS = {}
for code in ("1.3.3", "1.3.4", "1.3.5"):
    m = re.search(rf'"{code}": \("([^"]+)", None, "PROPOSAL"', r18_script)
    if not m: fail(f"{code} pin missing")
    PINS[code] = m.group(1)
PINS["1.3.3"] = PINS["1.3.3"].replace("(x – a)2", "(x – a)²").replace("(y – b)2", "(y – b)²").replace("= r 2 ", "= r² ")
if PINS["1.3.3"].count("²") != 3: fail("1.3.3 composition law")

NEW = [{"code": c, "officialText": t, "primaryPick": None, "resourceCount": 0, "ugmIds": []}
       for c, t in PINS.items()]

manifest_entry = {"plane": "ugm-serve", "bundles": [], "testRepins": []}
for slug in ("cie-a-level-maths-20-pure-1", "cie-as-maths-20-pure-1"):
    up = HUB / f"content/{slug}/ugm-resources.json"
    raw = up.read_text(encoding="utf-8")
    doc = json.loads(raw)
    (d, t) = dump_auto(doc, raw)
    if not d: fail(f"{slug}: UGM serializer round-trip failed")
    sp = doc["specPoints"]
    if len(sp) != 30: fail(f"{slug}: pre index len {len(sp)} != 30")
    if any(x["code"] in PINS for x in sp): fail(f"{slug}: add code already present")
    codes = [x["code"] for x in sp]
    i132 = codes.index("1.3.2")
    if codes[i132 + 1] != "1.4.1": fail(f"{slug}: 1.3.2 is not followed by 1.4.1 (fold-law order)")
    sp[i132 + 1:i132 + 1] = [dict(x) for x in NEW]
    if len(sp) != 33: fail(f"{slug}: post index len")
    for x in NEW:
        got = next(y for y in sp if y["code"] == x["code"])
        if got["officialText"] != x["officialText"] or got["primaryPick"] is not None or got["ugmIds"] != [] or got["resourceCount"] != 0:
            fail(f"{slug}: honest-gap shape wrong for {x['code']}")
    if x and x["code"] in doc["coverage"]["specPointsCovered"]: fail(f"{slug}: uncovered code joined specPointsCovered")
    pre_sha = sha(raw.encode())
    up.write_text(d(doc, t), encoding="utf-8")
    manifest_entry["bundles"].append({"slug": slug, "addedCodes": [x["code"] for x in NEW],
        "kind": "honest-gap rows (0606/ial-pure-4 precedent: null pick, zero rows, never served)",
        "sha256": {"pre": pre_sha, "post": sha(up.read_bytes())}})
    print(f"UGM-EXTEND OK {slug}: 30 -> 33 index codes (3 honest-gap rows after 1.3.2)")

# test re-pins (census sites only; fleet/station numbers untouched)
tp = HUB / "src/lib/ugm.bundle.test.ts"
tsrc = tp.read_text(encoding="utf-8")
repins = [
    ('describe("the lane census of record (8 lanes / 30 stations / 30 spec points)"',
     'describe("the lane census of record (8 lanes / 30 stations / 33 spec points)"'),
    ('test("spec points: 30 codes across 1.1.x / 1.2.x / folded 1.3.x / folded 1.4.x / 1.5.x / 1.6.x / 1.7.x / 1.8.x"',
     'test("spec points: 33 codes across 1.1.x / 1.2.x / folded 1.3.x / folded 1.4.x / 1.5.x / 1.6.x / 1.7.x / 1.8.x (run-020 adds 1.3.3/1.3.4/1.3.5 as honest-gap rows)"'),
    ("    expect(curCodes).toHaveLength(33);", "    expect(curCodes).toHaveLength(36);"),
    ("    expect(as1.specPoints).toHaveLength(30);", "    expect(as1.specPoints).toHaveLength(33);"),
]
for old, new in repins:
    if tsrc.count(old) != 1: fail(f"repin site not exactly-once: {old[:60]!r} (count {tsrc.count(old)})")
    tsrc = tsrc.replace(old, new, 1)
    manifest_entry["testRepins"].append({"from": old.strip()[:80], "to": new.strip()[:80]})
# the 33->36 comment on the AS bijection law
old_c = "    // 33 AS spine codes, 30 in the index — the three folded a-codes disclosed below"
new_c = "    // 36 AS spine codes, 33 in the index — the three folded a-codes disclosed below; run-020's 1.3.3/1.3.4/1.3.5 ride as honest-gap rows"
if tsrc.count(old_c) != 1: fail("comment repin site not found")
tsrc = tsrc.replace(old_c, new_c, 1)
manifest_entry["testRepins"].append({"from": old_c.strip()[:80], "to": new_c.strip()[:80]})
tp.write_text(tsrc, encoding="utf-8")
print("TEST-REPINS OK: 5 sites (2 titles, 2 lengths, 1 comment); coverage pins untouched (30 covered codes)")

# gates append
gates_path = ART / "gates_r0.json"
gates = json.loads(gates_path.read_text(encoding="utf-8"))
gates["gates"] += [
    {"gate": "ugm:honest-gap-rows", "ok": True, "detail": "both pure-1 bundles 30->33 index codes; 0606/ial-pure-4 shape; specPointsCovered untouched (30)"},
    {"gate": "ugm:test-repins", "ok": True, "detail": "5 census sites in ugm.bundle.test.ts; fold law unchanged"},
]
gates_path.write_text(json.dumps(gates, indent=1, ensure_ascii=False) + "\n")
amp = ART / "apply_manifest_r0.json"
am = json.loads(amp.read_text(encoding="utf-8"))
am["courses"].append(manifest_entry)
amp.write_text(json.dumps(am, indent=1, ensure_ascii=False) + "\n")
print("ALL UGM GATES GREEN — artifacts updated")
