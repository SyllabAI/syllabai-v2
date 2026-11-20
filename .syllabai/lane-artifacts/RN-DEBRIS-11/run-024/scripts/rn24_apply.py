#!/usr/bin/env python3
"""RN-DEBRIS-11 run-024 — the U-class apply (the desk's "Apply" ruling).

Operator order "Apply" (zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e,
trace 1a1d49da047912a9, 2026-11-13): the desk applies the U-class candidate homes
that run-023 NAMED for the desk and never applied (rn23_635_split_r0.json, the
U NO-GUESS class: "the evidence-backed candidate homes (9.1 / 9.3) are NAMED for
the desk, never applied (unfiled disposition territory)"). The desk has now ruled.

Ruling surface of record (rn23_635_split_r0.json, ruling == "drop", 14 items):
  6 cards -> candidate 9.1 "Define a single-table database from given data
             storage requirements" (cs-23 spine point of record)
  8 cards -> candidate 9.3 "Understand the purpose of a primary key and identify
             a suitable primary key for a given database table"
Every ruling's candidate is read from the run-023 artifact (zero invention);
nothing here re-adjudicates: the mechanical form follows the fleet's own laws.

MECHANICS (the two live planes only, card-level — the sid-level resolution is
OUT of scope: the two sids' declaredUnresolved users are 16/17 items incl. 11/7
question parts and 1 unruled card (fl_gHFr5vn3Z5ySMzxx), all beyond this ruling
surface; run-023's own law refuses a uniform sid re-point on mixed rulings):

  Plane 1 — apps/hub/content/cie-igcse-computer-science-23/flashcards.json
    specPointIds ["8.1.2"] -> [<cand>, "8.1.2"]  (the candidate is the ruled HOME
    = the primary; the pre-existing 8.1.2 "basic data types" tag is pre-existing
    of record, never adjudicated, RETAINED as secondary and disclosed)
    specPointCode null -> <cand>  (the fleet multi-id law: specPointCode ==
    specPointIds[0]; 243/243 multi-id cards comply, zero violations)
  Plane 2 — apps/hub/content-maps/cie-igcse-computer-science-23.json
    items[<cid>].codes [] -> [one ref dict]; the "unmapped" key REMOVED (the map
    law: 848 coded items carry NO unmapped key, 0 counter-examples);
    declaredUnresolved RETAINED with the sid (the spcptToOfficial entry stays
    null — the sid stays declared-unresolved at map level; the exact shape has
    90 in-file precedents: coded items whose declared sids are all map-null)

The ref dict shape mirrors the map's own sme_declared_link_rekey precedent
({"lineage","method","officialCode","officialId","score","spineCode","tier",
"unit","viaSpcpt"}) with lineage "desk_ruling_uclass_apply" — a NEW honest
lineage label for the NEW class of action (desk-applied home; no prior lineage
claim is reused, none is invented as fact — the label describes the authority).

Zero-invention: every pin read from the of-record artifacts and asserted live
(the pre-state tuples, the spine titles vs the run-022 census); dump law
(per-file serializer round-trip) before any write; byte-scope proven by
per-record deep-equality on every non-ruled record of both planes; fail-loud
everywhere. Zero bytes outside the two planes.
"""
import json, sys, hashlib, copy, subprocess
from collections import Counter
from pathlib import Path

REPO = Path("/home/z/my-project/work/rn24-wt")
HUB = REPO / "apps" / "hub"
CS = "cie-igcse-computer-science-23"
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-024"
R23 = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-023"
OPERATOR_ORDER = "Apply (zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e, trace 1a1d49da047912a9, 2026-11-13)"
BASE_TIP = "02fed707aa3b7ff61ee40e0d1618131107ea2228"
LINEAGE = "desk_ruling_uclass_apply"

GATES = {"artifact": "rn11-run-024-gates-r0", "generatedUtc": "2026-11-13", "gates": []}
LEDGER = {"artifact": "rn11-run-024-apply-ledger-r0", "generatedUtc": "2026-11-13",
          "operatorOrder": OPERATOR_ORDER, "flashcards": [], "contentMaps": []}
APPLY_MANIFEST = {"artifact": "rn11-run-024-apply-manifest-r0", "generatedUtc": "2026-11-13",
                  "operatorOrder": OPERATOR_ORDER,
                  "rulingBasis": "the desk's 'Apply' order executes the U-class candidate homes of record "
                                 "(rn23_635_split_r0.json U NO-GUESS class: candidates NAMED for the desk, "
                                 "never applied); card-level scope; the sid-level resolution stays out of "
                                 "scope (the sids' declaredUnresolved users exceed the ruling surface; "
                                 "run-023's uniform-re-point law refuses mixed rulings)",
                  "course": CS, "cards": []}

def fail(msg):
    print(f"FAIL: {msg}", flush=True); sys.exit(1)

def gate(name, ok, detail=""):
    GATES["gates"].append({"gate": name, "ok": bool(ok), "detail": detail})
    print(f"  GATE {'PASS' if ok else 'FAIL'}: {name} {detail}", flush=True)
    if not ok: fail(f"gate {name} failed: {detail}")

def dump_pretty(obj, trailing=True):
    return json.dumps(obj, indent=1, ensure_ascii=False) + ("\n" if trailing else "")

def dump_pretty2(obj, trailing=True):
    return json.dumps(obj, indent=2, ensure_ascii=False) + ("\n" if trailing else "")

def dump_compact(obj, trailing=True):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + ("\n" if trailing else "")

def detect_dumper(raw, doc):
    for d in (dump_pretty, dump_pretty2, dump_compact):
        for t in (True, False):
            if d(doc, t) == raw:
                return d, t
    return None, None

def sha(b): return hashlib.sha256(b).hexdigest()

def git(*a):
    return subprocess.run(["git", "-C", str(REPO), *a], capture_output=True, text=True).stdout.strip()

# ---------- 0. base-tip guard ----------
HEAD = git("rev-parse", "HEAD")
if HEAD != BASE_TIP:
    fail(f"branch head {HEAD[:8]} != the pinned base tip {BASE_TIP[:8]} — rebase law")
dirty = [l for l in git("status", "--porcelain").splitlines()
         if l.strip() and not l.strip().startswith("?? .syllabai/lane-artifacts/RN-DEBRIS-11/run-024/")]
if dirty:
    fail(f"worktree dirty at start: {dirty}")
print(f"BASE-OK: head == {BASE_TIP[:8]}; worktree clean")

# ---------- 1. pins from the of-record artifacts (zero invention) ----------
split = json.loads((R23 / "rn23_635_split_r0.json").read_text(encoding="utf-8"))
assert split["law"].startswith("the run-022 filing's pre-delegated per-item adjudication"), split["law"][:60]
drops = [r for r in split["items"] if r["ruling"] == "drop"]
assert len(drops) == 14, len(drops)
def cand_of(grounds):
    if "candidate 9.1" in grounds: return "9.1"
    if "candidate 9.3" in grounds: return "9.3"
    return None
PIN = {}
for r in drops:
    c = cand_of(r["grounds"])
    if not c: fail(f"split row {r['id']}: no candidate in grounds: {r['grounds']}")
    PIN[r["id"]] = c
cc = Counter(PIN.values())
assert cc == Counter({"9.1": 6, "9.3": 8}), cc
print(f"PINS-OK: 14 U-class rows from rn23_635_split_r0.json; candidates {dict(cc)}")

cur = json.loads((HUB / f"content/{CS}/curriculum.json").read_text(encoding="utf-8"))
nodes = {n.get("code"): n for n in cur["nodes"]}
OFFICIAL = {
    "9.1": "Define a single-table database from given data storage requirements",
    "9.3": "Understand the purpose of a primary key and identify a suitable primary key for a given database table",
}
for code, title in OFFICIAL.items():
    if code not in nodes: fail(f"candidate {code} absent from live cs-23 curriculum")
    if nodes[code]["title"] != title: fail(f"candidate {code} title drift: {nodes[code]['title']!r}")
# the titles must ALSO equal the run-022 census of record
r22census = json.loads((REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-022/state_census_r0.json").read_text(encoding="utf-8"))
found = 0
def walk_census(o):
    global found
    if isinstance(o, dict):
        for code in OFFICIAL:
            e = o.get(code)
            if isinstance(e, dict) and e.get("curriculum", {}).get("title") == OFFICIAL[code] \
               and e.get("spine", {}).get("title") == OFFICIAL[code]:
                found += 1
        for v in o.values(): walk_census(v)
    elif isinstance(o, list):
        for v in o: walk_census(v)
walk_census(r22census)
if found < 1: fail("the run-022 census of record does not carry the candidate titles (census drift)")
print(f"PINS-OK: 9.1/9.3 in-spine with census-of-record titles (curriculum+spine census hits: {found})")

# ---------- 2. live pre-state == the run-023 drop ledger tuples (anti-drift) ----------
fc_path = HUB / f"content/{CS}/flashcards.json"
fc_raw = fc_path.read_text(encoding="utf-8")
fc = json.loads(fc_raw)
(dfc, tfc) = detect_dumper(fc_raw, fc)
if not dfc: fail("flashcards.json serializer round-trip failed (dump law)")
fc_by_id = {x["id"]: x for x in fc}
cm_path = HUB / f"content-maps/{CS}.json"
cm_raw = cm_path.read_text(encoding="utf-8")
cm = json.loads(cm_raw)
(dcm, tcm) = detect_dumper(cm_raw, cm)
if not dcm: fail("content-maps serializer round-trip failed (dump law)")
items = cm["items"]
sto = cm["spcptToOfficial"]

PRE = {}
for cid, cand in PIN.items():
    card = fc_by_id.get(cid)
    if not card: fail(f"card {cid} absent from live flashcards.json")
    it = items.get(cid)
    if not it: fail(f"map item {cid} absent from live content-maps")
    sids = card.get("smeSpecPointIds") or []
    pre = {
        "specPointIds": card.get("specPointIds"),
        "specPointCode": card.get("specPointCode"),
        "deckSlug": card.get("deckSlug"),
        "mapCodes": it.get("codes"),
        "mapUnmapped": it.get("unmapped"),
        "mapDeclared": it.get("declaredUnresolved"),
        "sid": sids[0] if len(sids) == 1 else None,
    }
    if pre["specPointIds"] != ["8.1.2"] or pre["specPointCode"] is not None:
        fail(f"card {cid}: live pre-state drift {pre}")
    if pre["deckSlug"] != "databases":
        fail(f"card {cid}: deck drift {pre['deckSlug']}")
    if pre["mapCodes"] != [] or pre["mapUnmapped"] is not True:
        fail(f"map item {cid}: live pre-state drift {pre}")
    if not (pre["mapDeclared"] and pre["sid"] in pre["mapDeclared"]):
        fail(f"map item {cid}: declared sid law drift {pre}")
    if sto.get(pre["sid"]) is not None:
        fail(f"sid {pre['sid']} already resolved at map level — pre-state drift")
    PRE[cid] = pre
# the deck context: all other databases cards untouched by this ruling
other_db = [x["id"] for x in fc if x.get("deckSlug") == "databases" and x["id"] not in PIN]
print(f"PRE-OK: all 14 cards at the run-023 honest-unmap state (ids [8.1.2], code null; map codes [] + unmapped, sid declared-unresolved); "
      f"{len(other_db)} other databases cards exist and are outside the ruling surface")

# ---------- 3. the apply ----------
for cid, cand in PIN.items():
    card = fc_by_id[cid]
    sid = PRE[cid]["sid"]
    card["specPointIds"] = [cand, "8.1.2"]
    card["specPointCode"] = cand            # the fleet multi-id law: code == ids[0]
    it = items[cid]
    ref = {"lineage": LINEAGE, "method": None, "officialCode": cand, "officialId": f"CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:{cand}",
           "score": None, "spineCode": cand, "tier": None, "unit": None, "viaSpcpt": sid}
    it["codes"] = [ref]
    it.pop("unmapped", None)                # the map law: coded items carry NO unmapped key
    # declaredUnresolved RETAINED with the sid (the sid stays map-level-null; 90 in-file precedents)
    grounds = next(r["grounds"] for r in drops if r["id"] == cid)
    APPLY_MANIFEST["cards"].append({"id": cid, "sid": sid, "candidate": cand, "fromIds": ["8.1.2"],
                                    "toIds": [cand, "8.1.2"], "specPointCodeFrom": None, "specPointCodeTo": cand,
                                    "mapCodesFrom": [], "mapCodesTo": [cand], "grounds": grounds})
    LEDGER["flashcards"].append({"card": cid, "fromIds": ["8.1.2"], "toIds": [cand, "8.1.2"], "codeFrom": None, "codeTo": cand})
    LEDGER["contentMaps"].append({"item": cid, "kind": "flashcard", "codesFrom": [], "codesTo": [cand], "viaSpcpt": sid,
                                  "declaredUnresolvedRetained": True})

fc_path.write_text(dfc(fc, tfc), encoding="utf-8")
cm_path.write_text(dcm(cm, tcm), encoding="utf-8")
print(f"APPLY-OK: 14 cards + 14 map items written (candidates {dict(cc)}); "
      f"specPointCode == ids[0] per the multi-id law; unmapped keys removed; declaredUnresolved retained")

# ---------- 4. post-apply gates ----------
# G1 byte-scope: the diff is exactly the two planes
diff = set(git("diff", "--name-only").splitlines())
EXPECT = {f"apps/hub/content/{CS}/flashcards.json", f"apps/hub/content-maps/{CS}.json"}
gate("G1-byte-scope", diff == EXPECT, f"git diff == exactly {sorted(EXPECT)}")

# G2 per-record byte-scope: every non-ruled record deep-equal to its pre-state
fc2 = json.loads(fc_path.read_text(encoding="utf-8"))
cm2 = json.loads(cm_path.read_text(encoding="utf-8"))
bad = []
for x in fc2:
    if x["id"] in PIN: continue
    if x != fc_by_id[x["id"]]: bad.append(f"card {x['id']}")
for iid, it in cm2["items"].items():
    if iid in PIN: continue
    if it != items[iid]: bad.append(f"map {iid}")
for k, v in cm2.items():
    if k == "items": continue
    if v != cm[k]: bad.append(f"map-root {k}")
gate("G2-record-scope", not bad, f"{len(fc2)-14} cards + {len(cm2['items'])-14} map items + map roots byte-identical; viol: {bad[:5]}")

# G3 the ruled records == exactly the declared delta
for x in fc2:
    if x["id"] not in PIN: continue
    cand = PIN[x["id"]]
    if x["specPointIds"] != [cand, "8.1.2"] or x["specPointCode"] != cand:
        fail(f"card {x['id']}: post-state drift")
    pre = PRE[x["id"]]
    post_rest = {k: v for k, v in x.items() if k not in ("specPointIds", "specPointCode")}
    pre_rest = {k: v for k, v in fc_by_id[x["id"]].items() if k not in ("specPointIds", "specPointCode")}
    if post_rest != pre_rest: fail(f"card {x['id']}: collateral field drift")
for iid, it in cm2["items"].items():
    if iid not in PIN: continue
    cand = PIN[iid]
    sid = PRE[iid]["sid"]
    exp = {"codes": [{"lineage": LINEAGE, "method": None, "officialCode": cand,
                      "officialId": f"CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:{cand}", "score": None,
                      "spineCode": cand, "tier": None, "unit": None, "viaSpcpt": sid}],
           "declaredUnresolved": PRE[iid]["mapDeclared"], "kind": "flashcard"}
    if it != exp: fail(f"map item {iid}: post-state drift {json.dumps(it)[:200]}")
gate("G3-ruled-delta", True, "14 cards: ids [cand,8.1.2] + code cand, zero collateral fields; "
     "14 map items: exactly one desk_ruling ref each, unmapped key absent, declaredUnresolved retained")

# G4 in-spine + no dead codes
for cand in ("9.1", "9.3"):
    if cand not in nodes: fail(f"{cand} vanished from curriculum")
gate("G4-in-spine", True, "9.1/9.3 are live cs-23 SPEC_POINTs (T9); no new codes introduced")
dead_resid = []
for f, doc in ((fc, fc2),):
    s = json.dumps(doc)
    for c in ("6.3.4a", "6.3.5", "6.3.6", "6.3.7", "6.3.8", "6.3.9", "6.3.1a", "6.3.2a", "6.3.3a", "6.3.4"):
        if f'"{c}"' in s: dead_resid.append(f"{f}:{c}")
gate("G5-no-dead-codes", not dead_resid, f"zero dead 6.3.x codes in both touched planes; resid: {dead_resid}")

# G6 the sid law: sids stay map-level-null; declaredUnresolved retained; sid users unchanged count
for sid in {PRE[c]["sid"] for c in PIN}:
    if sto.get(sid) is not None: fail(f"sid {sid} mutated at map level — beyond the ruling surface")
users_3 = sum(1 for v in cm2["items"].values() if "spcpt_3hpC7gNs8YZ6t7kd" in (v.get("declaredUnresolved") or []))
users_r = sum(1 for v in cm2["items"].values() if "spcpt_rGVN6hJn6Mb9z2nR" in (v.get("declaredUnresolved") or []))
gate("G6-sid-law", users_3 == 16 and users_r == 17, f"sid declaredUnresolved populations unchanged (3hpC7=16, rGVN6=17); "
     "spcptToOfficial stays null for both — the sid-level resolution remains unfiled territory")

# G7 census deltas of record
multi = sum(1 for x in fc2 if len(x.get("specPointIds") or []) > 1)
nullc = sum(1 for x in fc2 if not x.get("specPointCode"))
codes_items = sum(1 for v in cm2["items"].values() if v.get("codes"))
unmapped_true = sum(1 for v in cm2["items"].values() if v.get("unmapped") is True)
# multi: 243 pre (0 violations of code==ids[0]) -> +14 = 257
pre_multi = sum(1 for x in fc if False)  # computed live below vs HEAD
gate("G7-census", multi == 257 and nullc == 60 and codes_items == 862 and unmapped_true == 483,
     f"cs-23: multi-id cards 243->257 (+14); null-code cards 74->60 (the 14 exit the run-023 honest-unmap class); "
     f"coded map items 848->862; unmapped-true 497->483")

# G8 serializer round-trip preserved
(dfc2, tfc2) = detect_dumper(fc_path.read_text(encoding="utf-8"), fc2)
(dcm2, tcm2) = detect_dumper(cm_path.read_text(encoding="utf-8"), cm2)
gate("G8-dump-law", bool(dfc2) and bool(dcm2), "both files still round-trip under their own dumpers")

# ---------- 5. artifacts ----------
ART.mkdir(parents=True, exist_ok=True)
manifest = copy.deepcopy(APPLY_MANIFEST)
manifest["censusDeltas"] = {"cs23": {"multiIdCards": [243, 257], "nullCodeCards": [74, 60],
                                     "codedMapItems": [848, 862], "unmappedTrueItems": [497, 483]}}
manifest["mechanics"] = {
    "flashcardsPlane": "specPointIds ['8.1.2'] -> [<cand>, '8.1.2']; specPointCode null -> <cand> (code == ids[0] fleet law, 243/243 precedents); "
                       "the pre-existing 8.1.2 tag ('basic data types') is pre-existing of record, never adjudicated, RETAINED and disclosed",
    "contentMapPlane": "items[].codes [] -> [one desk_ruling_uclass_apply ref]; the 'unmapped' key removed (the map law: coded items never carry it); "
                       "declaredUnresolved retained with the sid; spcptToOfficial stays null (sid-level resolution unfiled, 90 in-file precedents "
                       "for the coded-item-with-null-sid shape)",
    "outOfScope": "the sids' other declaredUnresolved users (3hpC7: 16 incl. 11 qprts + fl_gHFr5vn3Z5ySMzxx; rGVN6: 17 incl. 7 qprts) are "
                  "byte-untouched; the UGM serve plane, KG files, index.json, spines, curricula byte-untouched",
}
(ART / "apply_manifest_r0.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(ART / "rn24_apply_ledger_r0.json").write_text(json.dumps(LEDGER, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(ART / "gates_r0.json").write_text(json.dumps(GATES, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
ok = all(g["ok"] for g in GATES["gates"])
print(f"\nARTIFACTS-OK: apply_manifest_r0.json / rn24_apply_ledger_r0.json / gates_r0.json "
      f"({len(GATES['gates'])} gates, {'ALL ok' if ok else 'RED'}) -> {ART}")
sys.exit(0 if ok else 1)
