#!/usr/bin/env python3
r"""RN-DEBRIS-11 run-027 — the item-plane A1 apply (the run-026 adjudication filing's
lane-recommended option, executed on the desk's bare 'Proceed' order per the run-021
bare-order precedent: run-021 executed the run-019 filing's D1 on the bare 'run-021' order).

Zero-invention: the 14 rows and their codes come from the COMMITTED candidates_r0.json
(classA_unmappedUsers, byte-pinned) — the run-025 registry resolutions of record
(3hpC7 -> 9.1, rGVN6 -> 9.3), both witness citations live-asserted. The ref shape
mirrors the map's own desk-ruling ref (the desk_ruling_uclass_apply precedent:
lineage/method/officialCode/officialId/score/spineCode/tier/unit/viaSpcpt) with the
honest lineage label desk_ruling_adjudication_a1. Classes B/C/D/E stand at their
state-preserving defaults (B2/C2/D2/E2 retain — disclosed, desk re-ruleable).

Every assertion fail-loud; zero collateral beyond the 14 rows; dump-law byte-stable.
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
ART = ROOT / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-027"
ART.mkdir(parents=True, exist_ok=True)
BASE_TIP = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
MAP_REL = "apps/hub/content-maps/cie-igcse-computer-science-23.json"
CAND_REL = ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026/candidates_r0.json"
FC_REL = "apps/hub/content/cie-igcse-computer-science-23/flashcards.json"

S3, SR, S7 = "spcpt_3hpC7gNs8YZ6t7kd", "spcpt_rGVN6hJn6Mb9z2nR", "spcpt_7JRKzsBqqdfPqf5t"
LINEAGE = "desk_ruling_adjudication_a1"
CENSUS_PRE = {"multiIdCards": 257, "nullCodeCards": 60, "codedMapItems": 862, "unmappedTrueItems": 483}
CENSUS_A1 = {"multiIdCards": 257, "nullCodeCards": 60, "codedMapItems": 876, "unmappedTrueItems": 469}
POPS_PRE = {S3: 16, SR: 17, S7: 6}

FAILS = []
def check(name, ok, detail=""):
    if not ok:
        FAILS.append(f"{name}: {detail}")
    print(("PASS " if ok else "FAIL ") + name + (" — " + detail if detail else ""))

raw = (ROOT / MAP_REL).read_bytes()
cm = json.loads(raw)
fc = json.loads((ROOT / FC_REL).read_bytes())
cand = json.loads((ROOT / CAND_REL).read_text())
rows = cand["classA_unmappedUsers"]

def census(cm_obj):
    items = cm_obj["items"]
    return {"multiIdCards": sum(1 for x in fc if len(x.get("specPointIds") or []) > 1),
            "nullCodeCards": sum(1 for x in fc if not x.get("specPointCode")),
            "codedMapItems": sum(1 for v in items.values() if v.get("codes")),
            "unmappedTrueItems": sum(1 for v in items.values() if v.get("unmapped") is True)}

def pops(cm_obj):
    return {s: sum(1 for v in cm_obj["items"].values() if s in (v.get("declaredUnresolved") or []))
            for s in (S3, SR, S7)}

# ---------- G8 dump-law: the serializer reproduces the committed bytes ----------
check("G8-dump-law", (json.dumps(cm, indent=1, ensure_ascii=False) + "\n").encode() == raw,
      "json.dumps(indent=1, ensure_ascii=False)+'\\n' reproduces the committed map bytes byte-exactly")

# ---------- the byte-pinned row set ----------
check("G-rows-14", len(rows) == 14, f"{len(rows)} rows from the committed candidates_r0.json (never recomputed)")
check("G-rows-sids", {r["declaredSid"] for r in rows} == {S3, SR},
      f"{sum(1 for r in rows if r['declaredSid'] == S3)} x 3hpC7 -> 9.1 / "
      f"{sum(1 for r in rows if r['declaredSid'] == SR)} x rGVN6 -> 9.3 (6 q-parts + 1 note)")
targets = {r["item"] for r in rows}
check("G-targets-live", all(iid in cm["items"] for iid in targets) and len(targets) == 14,
      "all 14 targets present in the live map, ids distinct")

# ---------- G3 ruled-delta: every row's live shape == the candidates mapShapeOfRecord ----------
pre_ok, pre_rows = True, []
for r in rows:
    it = cm["items"][r["item"]]
    live = {"codes": it.get("codes") or [], "unmapped": it.get("unmapped") is True,
            "declaredUnresolved": it.get("declaredUnresolved")}
    if live != r["mapShapeOfRecord"]:
        pre_ok = False
    pre_rows.append({"item": r["item"], "kind": r["kind"], "declaredSid": r["declaredSid"],
                     "officialCode": r["candidateOfficialCode"], "officialId": r["candidateOfficialId"],
                     "candidateTitle": r["candidateTitle"], "pre": r["mapShapeOfRecord"]})
check("G3-ruled-delta-pre", pre_ok, "every row's live shape == the committed candidates_r0 mapShapeOfRecord")

# ---------- census + sid-law pre-pins ----------
c0, p0 = census(cm), pops(cm)
check("G7-census-pre", c0 == CENSUS_PRE, json.dumps(c0))
check("G6-sid-law-pre", p0 == POPS_PRE, json.dumps(p0))

# ---------- G4 in-spine + witnesses live (the evidence re-pin) ----------
CUR = json.loads((ROOT / "apps/hub/content/cie-igcse-computer-science-23/curriculum.json").read_text())
NOTES = json.loads((ROOT / "apps/hub/content/cie-igcse-computer-science-23/notes.json").read_text())
def title_of(code):
    hits = [n.get("title") for n in CUR["nodes"] if n.get("code") == code]
    assert len(hits) == 1, f"code {code}: {len(hits)} nodes"
    return hits[0]
T91, T93 = title_of("9.1"), title_of("9.3")
def cite(nid, sid):
    n = next(x for x in NOTES if x.get("noteId") == nid)
    lines = n["bodyMd"].split("\n")
    for i, l in enumerate(lines):
        if f"`{sid}`" in l and "Spec point" in l:
            buf = [l.split('· "', 1)[1] if '· "' in l else ""]
            j = i + 1
            while j < len(lines) and '"' not in "".join(buf) and j < i + 6:
                buf.append(lines[j]); j += 1
            raw_c = "\n".join(buf)
            if '"' in raw_c:
                raw_c = raw_c[:raw_c.index('"')]
            u = raw_c.replace("\n", " ").strip()
            return u.split(" ", 1)[1] if u[:1].isdigit() else u
    return None
check("G4-in-spine", T91 == "Define a single-table database from given data storage requirements"
      and T93 == "Understand the purpose of a primary key and identify a suitable primary key for a given database table",
      "both codes live SPEC_POINTs of the cs-23 curriculum (titles byte-pinned)")
check("G4-witnesses-live", cite("rn_pzFQ4MZnDWbnY6rf", S3) == T91 and cite("rn_KGhttHj9fT889Bm2", SR) == T93,
      "the corpus's own verbatim citations == the curriculum titles (live re-pin)")

# ---------- THE APPLY (the only mutation in this run) ----------
for r in rows:
    it = cm["items"][r["item"]]
    code = r["candidateOfficialCode"]
    it["codes"] = [{"lineage": LINEAGE, "method": None, "officialCode": code,
                    "officialId": r["candidateOfficialId"], "score": None,
                    "spineCode": code, "tier": None, "unit": None, "viaSpcpt": r["declaredSid"]}]
    it.pop("unmapped", None)  # the map law: coded items carry NO unmapped key
    # declaredUnresolved RETAINED untouched (the A1 reading)

# ---------- G1 byte-scope ----------
cm_pre = json.loads(raw)
diff_iids = sorted(i for i in cm_pre["items"] if cm_pre["items"][i] != cm["items"][i])
check("G1-byte-scope-14", diff_iids == sorted(targets), f"{len(diff_iids)} changed items == exactly the 14 targets")
key_ok = all({k for k in set(cm_pre["items"][i]) | set(cm["items"][i])
              if cm_pre["items"][i].get(k) != cm["items"][i].get(k)} <= {"codes", "unmapped"}
             for i in diff_iids)
check("G1-key-scope", key_ok, "changed items differ only in 'codes' (+ the 'unmapped' key removed); declaredUnresolved/kind untouched")

# ---------- G2 record-scope / zero collateral ----------
check("G2-record-scope-1331", all(cm_pre["items"][i] == cm["items"][i] for i in cm_pre["items"] if i not in targets),
      f"the other {len(cm_pre['items']) - 14} map items byte-identical (deep-equal)")
check("G2-roots-scope", all(cm_pre[k] == cm[k] for k in cm_pre if k != "items"),
      "every non-items map root byte-identical — incl. the build-time aggregates contentCoverage/spcptUnmapped/"
      "notesInlineRefs/reconciliation left untouched per the run-024/025 zero-collateral precedent (disclosed)")

# ---------- G5 map law fleet-wide ----------
viol = [i for i, v in cm["items"].items() if v.get("codes") and v.get("unmapped") is True]
check("G5-map-law", not viol, f"0 counter-examples fleet-wide ({sum(1 for v in cm['items'].values() if v.get('codes'))} coded items)")

# ---------- G6/G7 post-pins (the A1 projection asserted EXACTLY) ----------
c1, p1 = census(cm), pops(cm)
check("G7-census-post-A1", c1 == CENSUS_A1, json.dumps(c1) + " == the A1 projection of the filing")
check("G6-sid-law-post-retained", p1 == p0 == POPS_PRE, "declarations retained: populations unchanged 16/17/6")

# ---------- write (dump law) + manifest + gates_r0 ----------
(ROOT / MAP_REL).write_bytes((json.dumps(cm, indent=1, ensure_ascii=False) + "\n").encode())

manifest = {
    "artifact": "apply_manifest_r0", "family": "RN-DEBRIS-11", "run": "run-027",
    "kind": "the item-plane A1 apply manifest — the 14 re-pointed rows byte-pinned to the committed candidates_r0.json",
    "baseTip": BASE_TIP,
    "deskOrder": {"order": "Proceed", "trace": "1a1d6112c22b2841",
                  "session": "zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e, 2026-11-13"},
    "filingExecuted": "the run-026 adjudication filing's option A1 (lane-recommended) per the run-021 bare-order precedent",
    "refShape": "the desk_ruling_uclass_apply ref shape (lineage/method/officialCode/officialId/score/spineCode/tier/unit/viaSpcpt) with the honest lineage label " + LINEAGE,
    "rows": pre_rows,
    "retainedDefaults": {
        "B2": "fl_gHFr5vn3Z5ySMzxx retained unmapped with its dual 3hpC7+7JRK declaration (no recommendation filed; the desk order named none)",
        "C2": "the 14 cards' retained secondary '8.1.2' tags retained (multi-id 257)",
        "E2": "the 4 coded declarers' declarations retained (populations 16/17/6)",
        "D2": "the 2 rGVN6->9.1 cards' desk rulings of record stand",
    },
    "census": {"pre": c0, "post": c1, "a1Projection": CENSUS_A1},
    "sidPopulations": {"pre": p0, "post": p1},
    "generatedUtc": "2026-11-13",
}
(ART / "apply_manifest_r0.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")

gate_names = ["G1-byte-scope-14", "G1-key-scope", "G2-record-scope-1331", "G2-roots-scope",
              "G3-ruled-delta-pre", "G4-in-spine", "G4-witnesses-live", "G5-map-law",
              "G6-sid-law-pre", "G6-sid-law-post-retained", "G7-census-pre", "G7-census-post-A1", "G8-dump-law"]
gates = [{"gate": n, "ok": n not in [f.split(":")[0] for f in FAILS], "detail": ""}
         for n in gate_names]
(ART / "gates_r0.json").write_text(json.dumps({"gates": gates, "summary": f"{len(gate_names) - len(FAILS)}/{len(gate_names)}"}, indent=1) + "\n")

print(f"\napply gates: {len(gate_names) - len(FAILS)}/{len(gate_names)}")
if FAILS:
    print("FAILS:")
    [print(" -", f) for f in FAILS]
    sys.exit(1)
print("APPLY OK — the 14 rows re-pointed, everything else byte-untouched")
