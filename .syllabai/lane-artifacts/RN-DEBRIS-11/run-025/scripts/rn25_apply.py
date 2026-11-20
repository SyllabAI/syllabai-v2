#!/usr/bin/env python3
"""RN-DEBRIS-11 run-025 — the sid-level resolution (the desk's "apply run-025").

Operator order "apply run-025" (zai-web session web-df0238cc-641e-4e8e-ae60-
bc44c2aeec2e, trace 1a1d4fa972c97a2d, 2026-11-13). The desk files the sid-level
resolution — the unfiled territory run-024's receipts name standing:

  run-024-uclass-apply.json boundaries: "the sid-level resolution unfiled
  territory remains unfiled (the sids stay declared-unresolved at map level)"
  run-024-postReview.json zeroInvention: "the sid-level resolution stays
  unfiled (spcptToOfficial null, declaredUnresolved retained, the 90-precedent
  shape)"

THE RULING SURFACE OF RECORD (registry-only, zero item-plane bytes):

  spcptToOfficial["spcpt_3hpC7gNs8YZ6t7kd"] -> officialCode "9.1"
  spcptToOfficial["spcpt_rGVN6hJn6Mb9z2nR"] -> officialCode "9.3"

Witnesses of record, asserted LIVE at apply time (anti-drift):
  - the corpus's own note-body citation in rn_pzFQ4MZnDWbnY6rf cites
    spcpt_3hpC7gNs8YZ6t7kd as "1 Define a single-table database from given
    data / storage requirements" — unwrapped byte-exact == the live spine 9.1
    title; run-023's uClass law named this witness ("their SME ids: the
    single-table-database spec point whose text == official 9.1 byte-exact
    per the corpus's own citation")
  - the corpus's own note-body citation in rn_KGhttHj9fT889Bm2 cites
    spcpt_rGVN6hJn6Mb9z2nR as "3 Understand the purpose of a primary key and /
    identify a suitable primary key for a given / database table" — unwrapped
    byte-exact == the live spine 9.3 title; run-023 named rGVN6 "primary-key
    territory; candidate 9.3 named"; run-024's receipt carries both titles as
    the candidates of record

SCOPE LAW (the run-023 uniform-re-point law, applied correctly):
  The registry entry records the SPEC-POINT IDENTITY (the sid's own text ==
  the official title, witness-verbatim). It re-points NO user. The run-023
  law refuses mechanical uniform re-points on MIXED user populations —
  run-025 performs none: all 1,345 map items stay byte-identical,
  declaredUnresolved RETAINED for all 33 users (the in-file precedent:
  spcpt_7JRKzsBqqdfPqf5t is registry-resolved -> 8.1.2 while its declarers
  keep their own item states, incl. fl_gHFr5vn3Z5ySMzxx codes [] unmapped),
  the 14 run-024 cards stay at their [cand, '8.1.2'] homes, flashcards /
  notes / questions planes byte-untouched. The rGVN6 mixed item-level split
  (2x9.1 / 8x9.3 per the desk's own per-card rulings, #994) is DISCLOSED of
  record and stands untouched — the sid-level truth and the per-card truths
  coexist exactly as the 7JRK precedent shape allows.

Entry shape mirrors the registry's own (lineage/method/officialCode/
officialCodes/officialId/score/tier/unit/via), lineage "desk_ruling_sid_
resolution" — a NEW honest label for the NEW class of action per the
desk_ruling_uclass_apply precedent; tier null; officialId
CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:<code> == the run-024 refs' exact form
for these codes; via "RN-DEBRIS-11 run-025"; keys inserted at the registry's
ASCII-sort positions (the registry is ASCII-sorted, 116/116 verified).

Zero-invention: every pin read from the of-record artifacts and asserted
live; dump law (per-file serializer round-trip) before any write; byte-scope
proven by per-record deep-equality on every untouched record and root;
fail-loud everywhere. Zero bytes outside the one declared plane.
"""
import json, sys, hashlib, copy, re, subprocess
from collections import Counter
from pathlib import Path

REPO = Path("/home/z/my-project/work/rn24-wt")
HUB = REPO / "apps" / "hub"
CS = "cie-igcse-computer-science-23"
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-025"
R23 = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-023"
OPERATOR_ORDER = "apply run-025 (zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e, trace 1a1d4fa972c97a2d, 2026-11-13)"
BASE_TIP = "b5439c38e27e2fde58968c624a5a5d605bf2960c"
LINEAGE = "desk_ruling_sid_resolution"
VIA = "RN-DEBRIS-11 run-025"

S1 = "spcpt_3hpC7gNs8YZ6t7kd"   # single-table database -> 9.1
S2 = "spcpt_rGVN6hJn6Mb9z2nR"   # primary key -> 9.3
OFFICIAL = {
    "9.1": "Define a single-table database from given data storage requirements",
    "9.3": "Understand the purpose of a primary key and identify a suitable primary key for a given database table",
}
WITNESS = {
    "9.1": "rn_pzFQ4MZnDWbnY6rf",
    "9.3": "rn_KGhttHj9fT889Bm2",
}
SID_OF = {S1: "9.1", S2: "9.3"}
# pinned ASCII-sort neighbors of record (verified live at pre-state)
NEIGHBORS = {
    S1: ("spcpt_3WQhvNCVYsrXcHHx", "spcpt_3jzz7R9t45dccP3N"),
    S2: ("spcpt_qZTkxK8ydb3Nb5fR", "spcpt_rYGQnC9SrgGvXqrb"),
}

GATES = {"artifact": "rn11-run-025-gates-r0", "generatedUtc": "2026-11-13", "gates": []}
LEDGER = {"artifact": "rn11-run-025-sid-resolution-ledger-r0", "generatedUtc": "2026-11-13",
          "operatorOrder": OPERATOR_ORDER, "sidResolution": [], "usersOfRecord": []}
MANIFEST = {"artifact": "rn11-run-025-apply-manifest-r0", "generatedUtc": "2026-11-13",
            "operatorOrder": OPERATOR_ORDER,
            "rulingBasis": "the desk's 'apply run-025' order files the sid-level resolution — the unfiled "
                           "territory run-024's receipts name standing (uclass-apply boundaries + postReview "
                           "zeroInvention: 'spcptToOfficial null, declaredUnresolved retained, the 90-precedent "
                           "shape'); registry-only scope; the run-023 uniform-re-point law refuses mixed "
                           "MECHANICAL USER re-points and run-025 performs none (all items byte-untouched)",
            "course": CS, "sids": []}

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

def git(*a):
    return subprocess.run(["git", "-C", str(REPO), *a], capture_output=True, text=True).stdout.strip()

# ---------- 0. base-tip guard ----------
HEAD = git("rev-parse", "HEAD")
if HEAD != BASE_TIP:
    fail(f"branch head {HEAD[:8]} != the pinned base tip {BASE_TIP[:8]} — rebase law")
dirty = [l for l in git("status", "--porcelain").splitlines()
         if l.strip() and not l.strip().startswith("?? .syllabai/lane-artifacts/RN-DEBRIS-11/run-025/")]
if dirty:
    fail(f"worktree dirty at start: {dirty}")
print(f"BASE-OK: head == {BASE_TIP[:8]}; worktree clean")

# ---------- 1. pins from the of-record artifacts (zero invention) ----------
split = json.loads((R23 / "rn23_635_split_r0.json").read_text(encoding="utf-8"))
assert split["law"].startswith("the run-022 filing's pre-delegated per-item adjudication"), split["law"][:60]
u_law = next(r for r in split["items"] if r["id"] == "fl_GPCVpB35Wk6ByBYX")
assert "smeid 3hpC7 == official 9.1 verbatim per the corpus's own citation" in u_law["grounds"], u_law["grounds"]
r_law = next(r for r in split["items"] if r["id"] == "fl_nFdzmWtZQZSRhcny")
assert "smeid rGVN6 == primary-key territory" in r_law["grounds"] and "candidate 9.3" in r_law["grounds"], r_law["grounds"]
drops = [r for r in split["items"] if r["ruling"] == "drop"]
assert len(drops) == 14, len(drops)
print("PINS-OK: the run-023 split artifact of record carries the U-class law lines "
      "(3hpC7 == 9.1 verbatim witness; rGVN6 primary-key territory, candidate 9.3)")

receipt24 = json.loads((REPO / ".syllabai/receipts/RN-DEBRIS-11/run-024-uclass-apply.json").read_text(encoding="utf-8"))
cands = receipt24["applied"]["candidates"]
assert cands["9.1"].startswith("Define a single-table database from given data storage requirements (6 cards"), cands["9.1"][:80]
assert cands["9.3"].startswith("Understand the purpose of a primary key and identify a suitable primary key for a given database table (8 cards"), cands["9.3"][:80]
print("PINS-OK: the run-024 receipt of record carries both candidate titles")

# the live spine + curriculum of record
spine = json.loads((HUB / "spines" / f"{CS}.json").read_text(encoding="utf-8"))
sp_nodes = {n.get("code"): n for n in spine["curriculum"]["nodes"]}
cur = json.loads((HUB / "content" / CS / "curriculum.json").read_text(encoding="utf-8"))
cu_nodes = {n.get("code"): n for n in cur["nodes"]}
for code, title in OFFICIAL.items():
    if code not in sp_nodes or sp_nodes[code]["title"] != title:
        fail(f"spine drift: {code} title {sp_nodes.get(code, {}).get('title')!r}")
    if code not in cu_nodes or cu_nodes[code]["title"] != title:
        fail(f"curriculum drift: {code} title {cu_nodes.get(code, {}).get('title')!r}")
print("PINS-OK: 9.1/9.3 in-spine and in-curriculum, titles byte-exact of record")

# ---------- 2. the witness: the corpus's own citations (live assert) ----------
notes = json.loads((HUB / "content" / CS / "notes.json").read_text(encoding="utf-8"))
notes_by_id = {n["noteId"]: n for n in notes}
witness_cited = {}
for code, nid in WITNESS.items():
    body = notes_by_id[nid]["bodyMd"]
    sid = S1 if code == "9.1" else S2
    m = re.search(r"\*\*Spec point\*\* — `" + sid + r"` · \"([^\"]+)\"", body)
    if not m: fail(f"the corpus citation for {sid} absent from {nid} (witness drift)")
    cited = re.sub(r"^\d+\s+", "", re.sub(r"\s+", " ", m.group(1)).strip())
    if cited != OFFICIAL[code]:
        fail(f"witness unwrap != spine title for {code}: {cited!r}")
    witness_cited[code] = cited
print(f"WITNESS-OK: {WITNESS['9.1']} cites 3hpC7 and {WITNESS['9.3']} cites rGVN6 — "
      f"both unwrapped citations byte-exact == the spine titles")

# ---------- 3. live pre-state (anti-drift) ----------
cm_path = HUB / f"content-maps/{CS}.json"
cm_raw = cm_path.read_text(encoding="utf-8")
cm = json.loads(cm_raw)
(dcm, tcm) = detect_dumper(cm_raw, cm)
if not dcm: fail("content-maps serializer round-trip failed (dump law)")
items = cm["items"]
sto = cm["spcptToOfficial"]
for sid in (S1, S2):
    if sto.get(sid) is not None:
        fail(f"sid {sid} already resolved at map level — pre-state drift")
    if sid not in cm["spcptUnmapped"]:
        fail(f"sid {sid} absent from spcptUnmapped — pre-state drift (the honest-unmapped declaration of record)")
# the in-file precedent: resolved sids STAY listed in spcptUnmapped (7JRK, 2dkChv) —
# run-025 leaves the list byte-untouched (G2 root deep-equal enforces)
if "spcpt_7JRKzsBqqdfPqf5t" not in cm["spcptUnmapped"] or cm["spcptToOfficial"].get("spcpt_7JRKzsBqqdfPqf5t") is None:
    fail("the 7JRK precedent shape absent (resolved-in-registry + still-listed) — registry law drift")
ks = list(sto.keys())
assert ks == sorted(ks), "registry is not ASCII-sorted — pre-state drift"
assert len(ks) == 116, len(ks)
for sid, (before, after) in NEIGHBORS.items():
    i = ks.index(sid) if sid in ks else None
    if i is not None: fail(f"{sid} unexpectedly present")
# neighbor sanity: the pinned before/after must be adjacent in the current order
for sid, (before, after) in NEIGHBORS.items():
    bi, ai = ks.index(before), ks.index(after)
    if ai != bi + 1:
        fail(f"neighbor adjacency drift for {sid}: {before} vs {after}")
def users_of(sid):
    return [iid for iid, v in items.items()
            if sid in (v.get("declaredUnresolved") or []) or
               any(c.get("viaSpcpt") == sid for c in (v.get("codes") or []))]
u1, u2 = users_of(S1), users_of(S2)
if len(u1) != 16 or len(u2) != 17:
    fail(f"sid user population drift: 3hpC7={len(u1)} (expect 16), rGVN6={len(u2)} (expect 17)")
print(f"PRE-OK: registry 116 ASCII-sorted entries, both sids null, neighbors adjacent; "
      f"users of record 3hpC7=16 / rGVN6=17")

# ---------- 4. the apply (registry-only) ----------
def entry(code):
    return {"lineage": LINEAGE, "method": None, "officialCode": code,
            "officialCodes": [code], "officialId": f"CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:{code}",
            "score": None, "tier": None, "unit": None, "via": VIA}

sto_new = {}
for k in sorted(ks + [S1, S2]):
    sto_new[k] = entry(SID_OF[k]) if k in (S1, S2) else sto[k]
cm2 = copy.deepcopy(cm)
cm2["spcptToOfficial"] = sto_new
cm_path.write_text(dcm(cm2, tcm), encoding="utf-8")
print(f"APPLY-OK: spcptToOfficial 116 -> 118 entries ({S1} -> 9.1, {S2} -> 9.3); zero other bytes")

# ---------- 5. post-apply gates ----------
# G1 byte-scope: the diff is exactly the map
diff = set(git("diff", "--name-only").splitlines())
EXPECT = {f"apps/hub/content-maps/{CS}.json"}
gate("G1-byte-scope", diff == EXPECT, f"git diff == exactly {sorted(EXPECT)}")

# G2 record-scope: every root, every item, every prior sid entry byte-identical
cm3 = json.loads(cm_path.read_text(encoding="utf-8"))
bad = []
for iid, it in cm3["items"].items():
    if it != items[iid]: bad.append(f"map-item {iid}")
for k, v in cm3.items():
    if k == "spcptToOfficial": continue
    if v != cm[k]: bad.append(f"map-root {k}")
for k, v in cm3["spcptToOfficial"].items():
    if k in (S1, S2): continue
    if v != sto[k]: bad.append(f"prior-sid {k}")
gate("G2-record-scope", not bad, f"1,345 map items + all other map roots + all 116 prior sid entries "
     f"byte-identical (deep-equal); viol: {bad[:5]}")

# G3 the ruled delta == exactly the two declared entries
exp_shape = {S1: entry("9.1"), S2: entry("9.3")}
if {k: cm3["spcptToOfficial"][k] for k in (S1, S2)} != exp_shape:
    fail(f"registry delta drift: {json.dumps({k: cm3['spcptToOfficial'][k] for k in (S1, S2)})[:200]}")
if set(cm3["spcptToOfficial"].keys()) != set(ks) | {S1, S2}:
    fail("registry key set drift")
gate("G3-ruled-delta", True, "exactly two new entries, shape lineage/method/officialCode/officialCodes/"
     "officialId/score/tier/unit/via == the declared form; zero other registry bytes")

# G4 in-spine + registry order law
ks2 = list(cm3["spcptToOfficial"].keys())
order_ok = ks2 == sorted(ks2)
pos1, pos2 = ks2.index(S1), ks2.index(S2)
adj_ok = (ks2[pos1-1], ks2[pos1+1]) == NEIGHBORS[S1] and (ks2[pos2-1], ks2[pos2+1]) == NEIGHBORS[S2]
for code in ("9.1", "9.3"):
    if code not in sp_nodes or code not in cu_nodes: fail(f"{code} vanished from spine/curriculum")
gate("G4-order-law", order_ok and adj_ok, f"registry ASCII-sorted 118/118; {S1} between "
     f"{NEIGHBORS[S1][0][:12]}.. and {NEIGHBORS[S1][1][:12]}..; {S2} between {NEIGHBORS[S2][0][:12]}.. and "
     f"{NEIGHBORS[S2][1][:12]}..; 9.1/9.3 live SPEC_POINTs, no new codes introduced")

# G5 the witness chain re-pin (post-state)
for code, nid in WITNESS.items():
    body = notes_by_id[nid]["bodyMd"]
    sid = S1 if code == "9.1" else S2
    m = re.search(r"\*\*Spec point\*\* — `" + sid + r"` · \"([^\"]+)\"", body)
    cited = re.sub(r"^\d+\s+", "", re.sub(r"\s+", " ", m.group(1)).strip())
    assert cited == OFFICIAL[code] == sp_nodes[code]["title"] == cu_nodes[code]["title"]
    if cm3["spcptToOfficial"][sid]["officialCode"] != code:
        fail(f"registry officialCode drift for {sid}")
gate("G5-witness-verbatim", True, "rn_pzFQ4MZnDWbnY6rf cites 3hpC7 and rn_KGhttHj9fT889Bm2 cites rGVN6 — "
     "unwrapped citations == spine == curriculum titles byte-exact (live re-pin post-apply); "
     "the registry rows now carry exactly these codes")

# G6 the sid law: declaredUnresolved retained; populations unchanged; run-024 cards untouched
users1b, users2b = [iid for iid, v in cm3["items"].items() if S1 in (v.get("declaredUnresolved") or [])], \
                   [iid for iid, v in cm3["items"].items() if S2 in (v.get("declaredUnresolved") or [])]
du_pop_ok = len(users1b) == 16 and len(users2b) == 17
run24_cards = ["fl_GPCVpB35Wk6ByBYX", "fl_JVVmnbmjSK2ChSS7", "fl_DS3K2xNCW8r5W4Df", "fl_c865JT8GWTqw5tMq",
               "fl_nFdzmWtZQZSRhcny", "fl_xp2KWtrfct7GPhNh", "fl_Qj4jNGWbmJvspXfK", "fl_ZVJDX6Bh6PZPFTxF",
               "fl_qWnydfS2JKsXfJgW", "fl_RRB6sxzZs5thsT3J", "fl_sX64VvMkFnH9YHHG", "fl_JMZkg5DQhnd5Y29B",
               "fl_T7VPkYbFbNh8b9R6", "fl_tZxbTx77f5cXQbKt"]
cards_ok = all(cm3["items"][c] == items[c] for c in run24_cards)
gHFr = cm3["items"]["fl_gHFr5vn3Z5ySMzxx"]
gHFr_ok = gHFr == {"codes": [], "declaredUnresolved": [S1, "spcpt_7JRKzsBqqdfPqf5t"], "kind": "flashcard", "unmapped": True}
gate("G6-sid-law", du_pop_ok and cards_ok and gHFr_ok,
     f"declaredUnresolved retained: 3hpC7=16 / rGVN6=17 users unchanged (byte-identical items); the 14 run-024 "
     f"cards untouched at their ruled homes; fl_gHFr5vn3Z5ySMzxx (the unruled card) byte-identical — the "
     f"resolved-sid-with-retained-declaration shape (the 7JRK in-file precedent)")

# G7 census deltas of record (unchanged vs run-024)
fc = json.loads((HUB / f"content/{CS}/flashcards.json").read_text(encoding="utf-8"))
multi = sum(1 for x in fc if len(x.get("specPointIds") or []) > 1)
nullc = sum(1 for x in fc if not x.get("specPointCode"))
codes_items = sum(1 for v in cm3["items"].values() if v.get("codes"))
unmapped_true = sum(1 for v in cm3["items"].values() if v.get("unmapped") is True)
gate("G7-census", multi == 257 and nullc == 60 and codes_items == 862 and unmapped_true == 483,
     f"cs-23 census unchanged vs the run-024 record: multi-id cards 257; null-code cards 60; coded map items 862; "
     f"unmapped-true 483 (registry additions are census-neutral)")

# G8 serializer round-trip preserved
(dcm2, tcm2) = detect_dumper(cm_path.read_text(encoding="utf-8"), cm3)
gate("G8-dump-law", bool(dcm2), "the map still round-trips under its own dumper (indent=1, ensure_ascii=False)")

# ---------- 6. artifacts ----------
ART.mkdir(parents=True, exist_ok=True)
kind_of = {iid: items[iid]["kind"] for iid in set(u1) | set(u2)}
for sid, code in ((S1, "9.1"), (S2, "9.3")):
    MANIFEST["sids"].append({"sid": sid, "officialCode": code, "officialCodes": [code],
                             "officialId": f"CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:{code}",
                             "title": OFFICIAL[code], "witnessNote": WITNESS[code],
                             "witnessCitation": witness_cited[code],
                             "lineage": LINEAGE, "via": VIA, "tier": None, "method": None,
                             "insertedBetween": list(NEIGHBORS[sid])})
for sid, users in ((S1, u1), (S2, u2)):
    for iid in sorted(users):
        it = items[iid]
        LEDGER["usersOfRecord"].append({"sid": sid, "item": iid, "kind": it["kind"],
                                        "declaredUnresolved": it.get("declaredUnresolved"),
                                        "codesOfficial": [c.get("officialCode") for c in (it.get("codes") or [])],
                                        "unmapped": it.get("unmapped") is True,
                                        "postApplyState": "byte-identical (declaredUnresolved retained; no re-point)"})
LEDGER["sidResolution"] = MANIFEST["sids"]
LEDGER["mixedRulingDisclosure"] = (
    "spcpt_rGVN6hJn6Mb9z2nR's flashcard users split 2x9.1 (fl_sX64VvMkFnH9YHHG, fl_JMZkg5DQhnd5Y29B) / 8x9.3 by the "
    "desk's own per-card rulings of record (PR #994, c8480650); the sid-level entry (9.3) records the SPEC-POINT "
    "identity per the corpus's own verbatim citation and re-points NO user — the run-023 uniform-re-point law "
    "refuses mechanical user re-points on mixed populations and run-025 performs none; the item-level state stands "
    "exactly as run-024 left it (the 7JRK resolved-sid-with-retained-declaration precedent shape)")
MANIFEST["mechanics"] = {
    "surface": "apps/hub/content-maps/cie-igcse-computer-science-23.json spcptToOfficial registry ONLY (+2 entries "
               "at the ASCII-sort positions); zero other bytes",
    "entryShape": "the registry's own shape (lineage/method/officialCode/officialCodes/officialId/score/tier/unit/"
                  "via); lineage 'desk_ruling_sid_resolution' (the honest new label per the desk_ruling_uclass_apply "
                  "precedent); tier null; officialId CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:<code> == the run-024 "
                  "refs' exact form for these codes; via 'RN-DEBRIS-11 run-025'",
    "outOfScope": "all 1,345 map items byte-untouched (declaredUnresolved retained for all 33 users — the 7JRK "
                  "in-file precedent); flashcards/notes/questions planes byte-untouched; the 14 run-024 cards "
                  "untouched at [cand, '8.1.2']; spcptUnmapped/reconciliation/contentCoverage/inputs/generatedUtc "
                  "byte-unchanged; UGM serve plane / KG files / index.json / spines / curricula byte-untouched",
}
(ART / "apply_manifest_r0.json").write_text(json.dumps(MANIFEST, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(ART / "rn25_sid_resolution_ledger_r0.json").write_text(json.dumps(LEDGER, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(ART / "gates_r0.json").write_text(json.dumps(GATES, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
ok = all(g["ok"] for g in GATES["gates"])
print(f"\nARTIFACTS-OK: apply_manifest_r0.json / rn25_sid_resolution_ledger_r0.json / gates_r0.json "
      f"({len(GATES['gates'])} gates, {'ALL ok' if ok else 'RED'}) -> {ART}")
sys.exit(0 if ok else 1)
