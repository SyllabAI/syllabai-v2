#!/usr/bin/env python3
r"""RN-DEBRIS-11 run-026 — the declaredUnresolved item-plane adjudication filing (the run-022 desk-support pattern).

ZERO content bytes. Computes the state of record of the run-025-retained territory
(the 33 declaredUnresolved users) and names the evidence-backed candidate surface for
the desk, NEVER applied (the run-023 candidates law: 'the evidence-backed candidate
homes are NAMED for the desk, never applied (unfiled disposition territory)').

All truths re-pinned LIVE from the committed planes at the base tip; every assertion
fail-loud; zero schema invention beyond the honest filing labels.

Outputs (artifacts, committed):
  state_census_r0.json   — the live re-pin of record
  candidates_r0.json     — the per-item candidate rows
  adjudication_r0.json   — the ruling surface + per-option census projections
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]          # .../syllabai-v2 (worktree root)
ART = ROOT / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-026"
ART.mkdir(parents=True, exist_ok=True)

BASE_TIP = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                          text=True).stdout.strip()
RUN025_HEAD = "3588080c46a804a499c18ba0f21037a1e8073bbe"

FAILS = []
def check(name, ok, detail=""):
    if not ok:
        FAILS.append(f"{name}: {detail}")
    print(("PASS " if ok else "FAIL ") + name + (" — " + detail if detail else ""))

def load(rel):
    return json.loads((ROOT / rel).read_text())

# ---------- the planes of record (live at this worktree == BASE_TIP bytes) ----------
CM = load("apps/hub/content-maps/cie-igcse-computer-science-23.json")
FC = load("apps/hub/content/cie-igcse-computer-science-23/flashcards.json")
NOTES = load("apps/hub/content/cie-igcse-computer-science-23/notes.json")
CUR = load("apps/hub/content/cie-igcse-computer-science-23/curriculum.json")
LED = load(".syllabai/lane-artifacts/RN-DEBRIS-11/run-025/rn25_sid_resolution_ledger_r0.json")
MAN = load(".syllabai/lane-artifacts/RN-DEBRIS-11/run-025/apply_manifest_r0.json")

S3, SR, S7 = ("spcpt_3hpC7gNs8YZ6t7kd", "spcpt_rGVN6hJn6Mb9z2nR", "spcpt_7JRKzsBqqdfPqf5t")
CODE3, CODER, CODE7 = "9.1", "9.3", "8.1.2"

# ---------- 1. the cs-23 census of record (the rn24_apply.py G7 law, re-pinned live) ----------
multi = sum(1 for x in FC if len(x.get("specPointIds") or []) > 1)
nullc = sum(1 for x in FC if not x.get("specPointCode"))
coded_items = sum(1 for v in CM["items"].values() if v.get("codes"))
unmapped_true = sum(1 for v in CM["items"].values() if v.get("unmapped") is True)
check("G-census-multiIdCards", multi == 257, f"live {multi} == record 257")
check("G-census-nullCodeCards", nullc == 60, f"live {nullc} == record 60")
check("G-census-codedMapItems", coded_items == 862, f"live {coded_items} == record 862")
check("G-census-unmappedTrueItems", unmapped_true == 483, f"live {unmapped_true} == record 483")
CENSUS = {"multiIdCards": multi, "nullCodeCards": nullc,
          "codedMapItems": coded_items, "unmappedTrueItems": unmapped_true}

# ---------- 2. sid populations of record (the G6 law) ----------
pop3 = sum(1 for v in CM["items"].values() if S3 in (v.get("declaredUnresolved") or []))
popr = sum(1 for v in CM["items"].values() if SR in (v.get("declaredUnresolved") or []))
pop7 = sum(1 for v in CM["items"].values() if S7 in (v.get("declaredUnresolved") or []))
check("G-pop-3hpC7", pop3 == 16, f"live {pop3} == record 16")
check("G-pop-rGVN6", popr == 17, f"live {popr} == record 17")
POPS = {S3: pop3, SR: popr, S7: pop7}

# ---------- 3. the registry entries of record (live) ----------
sto = CM["spcptToOfficial"]
check("G-registry-size", len(sto) == 118, f"live {len(sto)} == 118 (the run-025 116->118 law)")
for sid, code in ((S3, CODE3), (SR, CODER)):
    e = sto.get(sid)
    ok = bool(e) and e.get("officialCode") == code and e.get("lineage") == "desk_ruling_sid_resolution" \
         and e.get("via") == "RN-DEBRIS-11 run-025" and e.get("officialId") == f"CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:{code}"
    check(f"G-registry-{sid[-6:]}", ok, json.dumps(e, sort_keys=True)[:160])
e7 = sto.get(S7)
check("G-registry-7JRK", bool(e7) and e7.get("officialCode") == CODE7,
      f"7JRK -> {e7 and e7.get('officialCode')} (spec_links_sidecar_accepted, of record)")

# ---------- 4. the 33 users: live map entries byte-equal the run-025 ledger ----------
users_live = []
for iid, it in CM["items"].items():
    du = it.get("declaredUnresolved") or []
    if S3 in du or SR in du:
        users_live.append({
            "sid": S3 if S3 in du else SR,
            "item": iid, "kind": it.get("kind"),
            "declaredUnresolved": du,
            "codesOfficial": [c.get("officialCode") for c in (it.get("codes") or [])],
            "unmapped": it.get("unmapped") is True,
        })
led_rows = sorted(LED["usersOfRecord"], key=lambda r: (r["sid"], r["item"]))
live_rows = sorted(users_live, key=lambda r: (r["sid"], r["item"]))
check("G-users-33-count", len(live_rows) == 33, f"live {len(live_rows)} == ledger 33")
KEYS = ("sid", "item", "kind", "declaredUnresolved", "codesOfficial", "unmapped")
check("G-users-byte-equal-ledger",
      [{k: r[k] for k in KEYS} for r in live_rows] == [{k: r[k] for k in KEYS} for r in led_rows],
      "the live 33 rows byte-equal the run-025 ledger usersOfRecord (projected to the 6 shared keys)")
by_kind = {}
for r in live_rows:
    by_kind.setdefault(r["kind"], []).append(r)
check("G-users-kind-split", len(by_kind.get("flashcard", [])) == 15 and len(by_kind.get("question_part", [])) == 16
      and len(by_kind.get("note", [])) == 2,
      f"flashcards {len(by_kind.get('flashcard', []))} / q-parts {len(by_kind.get('question_part', []))} / notes {len(by_kind.get('note', []))}")

# ---------- 5. curriculum titles of record (live re-pin) ----------
nodes = CUR["nodes"]
def title_of(code):
    hits = [n.get("title") for n in nodes if n.get("code") == code]
    assert len(hits) == 1, f"code {code}: {len(hits)} nodes"
    return hits[0]
T91, T93, T812 = title_of(CODE3), title_of(CODER), title_of(CODE7)
check("G-title-9.1", T91 == "Define a single-table database from given data storage requirements", T91)
check("G-title-9.3", T93 == "Understand the purpose of a primary key and identify a suitable primary key for a given database table", T93)
check("G-title-8.1.2", T812 == "Understand and use the basic data types", T812)

# ---------- 6. the witness citations re-asserted LIVE (the run-025 witness law) ----------
def note_citation(nid, sid):
    n = next(x for x in NOTES if x.get("noteId") == nid)
    lines = n["bodyMd"].split("\n")
    out = None
    for i, l in enumerate(lines):
        if f"`{sid}`" in l and "Spec point" in l:
            seg = l.split('· "', 1)[1] if '· "' in l else ""
            buf = [seg]
            j = i + 1
            while j < len(lines) and '"' not in "".join(buf) and j < i + 6:
                buf.append(lines[j]); j += 1
            raw = "\n".join(buf)
            if '"' in raw:
                raw = raw[:raw.index('"')]
            unwrapped = raw.replace("\n", " ").strip()
            # strip the leading SME local numeral per the run-025 witness law
            unwrapped = unwrapped.split(" ", 1)[1] if unwrapped[:1].isdigit() else unwrapped
            out = unwrapped
            break
    return out

w3 = note_citation("rn_pzFQ4MZnDWbnY6rf", S3)
wr = note_citation("rn_KGhttHj9fT889Bm2", SR)
check("G-witness-3hpC7-verbatim", w3 == T91, f"note citation == 9.1 title ({w3!r})")
check("G-witness-rGVN6-verbatim", wr == T93, f"note citation == 9.3 title ({wr!r})")

# ---------- 7. the 14 run-024 cards (flashcard plane, the multi-id law shape) ----------
cards14 = []
for r in live_rows:
    if r["kind"] != "flashcard" or r["item"] == "fl_gHFr5vn3Z5ySMzxx":
        continue
    c = next(x for x in FC if x.get("id") == r["item"])
    ids = c.get("specPointIds") or []
    cards14.append({"id": r["item"], "sid": r["sid"],
                    "specPointIds": ids, "specPointCode": c.get("specPointCode")})
check("G-cards14-count", len(cards14) == 14, f"live {len(cards14)}")
ok_shape = all(len(c["specPointIds"]) == 2 and c["specPointIds"][1] == CODE7
               and c["specPointCode"] == c["specPointIds"][0] for c in cards14)
check("G-cards14-multi-id-law", ok_shape, "every card specPointIds == [<cand>, '8.1.2'] and specPointCode == ids[0]")
mix = {}
for c in cards14:
    mix.setdefault(c["specPointCode"], []).append(c["id"])
check("G-cards14-split", sorted(mix.get(CODE3, [])) == sorted(["fl_DS3K2xNCW8r5W4Df", "fl_GPCVpB35Wk6ByBYX",
      "fl_JVVmnbmjSK2ChSS7", "fl_c865JT8GWTqw5tMq", "fl_sX64VvMkFnH9YHHG", "fl_JMZkg5DQhnd5Y29B"]) and
      len(mix.get(CODER, [])) == 8,
      f"6 cards at {CODE3} (incl. the 2 rGVN6-declarers) + 8 at {CODER} — the run-024 record split")

# ---------- 8. fl_gHFr — the dual-declaration card ----------
GH = "fl_gHFr5vn3Z5ySMzxx"
g_card = next(x for x in FC if x.get("id") == GH)
g_map = CM["items"][GH]
ghfr = {
    "cardPlane": {"specPointIds": g_card.get("specPointIds"), "specPointCode": g_card.get("specPointCode")},
    "mapPlane": {"codes": [], "unmapped": True, "declaredUnresolved": g_map.get("declaredUnresolved")},
    "declares": [S3, S7],
}
check("G-ghfr-dual-declaration", g_map.get("declaredUnresolved") == [S3, S7], str(g_map.get("declaredUnresolved")))
check("G-ghfr-map-unmapped", (g_map.get("codes") or []) == [] and g_map.get("unmapped") is True, "map codes [] + unmapped true")
check("G-ghfr-card-coded-8.1.2", g_card.get("specPointIds") == [CODE7] and g_card.get("specPointCode") == CODE7,
      "the card plane carries the pre-existing never-adjudicated '8.1.2' tag (run-024 receipt disclosure)")
ghfr_body = (g_card.get("front", "") + "\n" + g_card.get("back", ""))
ghfr["cardBodyWitness"] = {
    "front": g_card.get("front"), "back": g_card.get("back"),
    "verbatimMatch9.1": T91.lower() in ghfr_body.lower().replace("\n", " "),
    "verbatimMatch8.1.2": T812.lower() in ghfr_body.lower().replace("\n", " "),
    "disclosure": "no verbatim witness for either resolved code on the card body — the dual declaration is the sole link (honest disclosure of record)",
}
check("G-ghfr-no-witness", not ghfr["cardBodyWitness"]["verbatimMatch9.1"] and not ghfr["cardBodyWitness"]["verbatimMatch8.1.2"],
      "card body carries NO verbatim witness for 9.1 or 8.1.2 — disclosed")

# ---------- 9. planes byte-identity run-025-head <-> base tip ----------
for rel in ("apps/hub/content-maps/cie-igcse-computer-science-23.json",
            "apps/hub/content/cie-igcse-computer-science-23/flashcards.json",
            "apps/hub/content/cie-igcse-computer-science-23/questions.json",
            "apps/hub/content/cie-igcse-computer-science-23/notes.json"):
    a = subprocess.run(["git", "rev-parse", f"{RUN025_HEAD}:{rel}"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    b = subprocess.run(["git", "rev-parse", f"{BASE_TIP}:{rel}"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    check(f"G-plane-identity-{Path(rel).name}", a == b, f"{a[:8]} == {b[:8]} (zero drift since the run-025 head)")

# ---------- 10. candidates + projections (computed, never applied) ----------
unmapped_users = [r for r in live_rows if r["unmapped"]]
check("G-unmapped-15", len(unmapped_users) == 15, f"13 q-parts + 1 note + fl_gHFr = {len(unmapped_users)} (the 4 coded declarers are class C)")

coded_declarers = [r for r in live_rows if not r["unmapped"] and r["item"] not in
                   {c["id"] for c in cards14} | {GH}]
check("G-coded-declarers-4", len(coded_declarers) == 4,
      f"{len(coded_declarers)} coded multi-declaration rows (3 q-parts 7.5a/8.1.2 + rn_pzFQ note 7.5a/8.1.2 — all declaring 3hpC7, now registry-resolved 9.1)")

cand_rows = []
for r in unmapped_users:
    if r["item"] == GH:
        continue
    sid = r["sid"]
    cand_rows.append({
        "item": r["item"], "kind": r["kind"], "declaredSid": sid,
        "candidateOfficialCode": CODE3 if sid == S3 else CODER,
        "candidateOfficialId": f"CIE_IGCSE_COMPUTER_SCIENCE_2023_2025:{CODE3 if sid == S3 else CODER}",
        "candidateTitle": T91 if sid == S3 else T93,
        "evidence": ("the declared sid's registry resolution of record (run-025, desk_ruling_sid_resolution) "
                     "+ the corpus's own verbatim citation pinned live in this filing"),
        "witnessNoteCitation": (w3 if sid == S3 else wr),
        "mapShapeOfRecord": {"codes": [], "unmapped": True, "declaredUnresolved": [sid]},
    })
check("G-cand-rows-14", len(cand_rows) == 14, f"{len(cand_rows)} re-pointable unmapped rows (7 q-parts -> 9.1, 6 q-parts + 1 note -> 9.3)")

# census projection engine (the pinned G7 definitions)
def project(map_repoint=0, map_undeclare_pops=None, card_multi_to_single=0):
    p = dict(CENSUS)
    p["codedMapItems"] += map_repoint
    p["unmappedTrueItems"] -= map_repoint
    p["multiIdCards"] -= card_multi_to_single
    pops = dict(POPS)
    if map_undeclare_pops:
        for sid, delta in map_undeclare_pops.items():
            pops[sid] -= delta
    return {"census": p, "sidPopulations": pops}

proj_A1 = project(map_repoint=14)
proj_A2 = project(map_repoint=14, map_undeclare_pops={S3: 7, SR: 7})
proj_A3 = project()
proj_B = project(map_repoint=1)
proj_Cdrop = project(map_undeclare_pops={S3: 4})
proj_Ckeep = project()
proj_C1 = project(card_multi_to_single=14)
proj_D1 = project(map_undeclare_pops={SR: 2})
proj_D2 = project()

# ---------- artifacts ----------
state = {
    "artifact": "state_census_r0",
    "family": "RN-DEBRIS-11", "run": "run-026",
    "kind": "the live re-pin of the run-025-retained declaredUnresolved item-plane state of record (zero content bytes)",
    "baseTip": BASE_TIP, "run025Head": RUN025_HEAD,
    "planesByteIdentityRun025HeadToBaseTip": "all four cs-23 planes byte-identical (asserted in rn26_census.py)",
    "censusOfRecord": CENSUS,
    "sidPopulationsOfRecord": {S3: pop3, SR: popr, S7: pop7},
    "usersOfRecord33": live_rows,
    "cards14OfRecord": cards14,
    "codedDeclarersOfRecord": coded_declarers,
    "flGhFrOfRecord": ghfr,
    "registryOfRecord": {S3: sto[S3], SR: sto[SR], S7: sto[S7]},
    "curriculumTitlesOfRecord": {CODE3: T91, CODER: T93, CODE7: T812},
    "witnessCitationsLive": {S3: w3, SR: wr},
    "generatedUtc": "2026-11-13",
}
(ART / "state_census_r0.json").write_text(json.dumps(state, indent=1, ensure_ascii=False) + "\n")

candidates = {
    "artifact": "candidates_r0",
    "family": "RN-DEBRIS-11", "run": "run-026",
    "kind": "the evidence-backed candidate surface NAMED for the desk, never applied (the run-023 candidates law)",
    "baseTip": BASE_TIP,
    "classA_unmappedUsers": cand_rows,
    "classA_law": ("uniform population per sid among the unmapped users (7 q-parts declare 3hpC7 -> 9.1; 6 q-parts "
                   "+ 1 note declare rGVN6 -> 9.3); the run-023 uniform-re-point law refuses MECHANICAL applies on "
                   "the sids' FULL user populations (mixed by the desk's own per-card rulings of record) "
                   "— the apply is the desk's order, never the operator's"),
    "classB_flGhFr": {
        "item": GH,
        "declares": [S3, S7],
        "bothSidsRegistryResolvedOfRecord": {S3: CODE3, S7: CODE7},
        "cardPlaneOfRecord": ghfr["cardPlane"],
        "candidateSurface": [
            {"candidate": "map re-point -> 8.1.2 (mirror the card plane's pre-existing tag; viaSpcpt " + S7 + ")",
             "caveat": "the '8.1.2' card tag is pre-existing of record, never adjudicated (run-024 receipt disclosure)"},
            {"candidate": "map re-point -> 9.1 (viaSpcpt " + S3 + ", the run-025 resolution)",
             "caveat": "the card body carries no verbatim witness for 9.1"},
            {"candidate": "multi-id ['8.1.2','9.1'] or ['9.1','8.1.2'] (the fleet multi-id law: specPointCode == ids[0])",
             "caveat": "the primary-code choice is the desk's"},
            {"candidate": "retain unmapped (the state-preserving default)", "caveat": None},
        ],
        "disclosure": ghfr["cardBodyWitness"]["disclosure"],
    },
    "classC_cards14SecondaryTag": {
        "items": [c["id"] for c in cards14],
        "stateOfRecord": "specPointIds [<cand>, '8.1.2'] — the pre-existing never-adjudicated '8.1.2' tag retained as secondary and disclosed (run-024 receipt)",
        "candidateSurface": [
            {"candidate": "drop the secondary tag: specPointIds -> [<cand>] (multi-id 257 -> 243)", "caveat": "departures the run-024 record shape — the desk's call"},
            {"candidate": "retain (the state-preserving default)", "caveat": None},
        ],
    },
    "classC_codedDeclarers": {
        "rows": coded_declarers,
        "stateOfRecord": ("4 rows ALREADY CODED at the map level (qstnprt_Qp7NtwvyJ6rz22MD + qstnprt_rdcT295MJ7phkMmz "
                          "at ['7.5a'] via the run-023 6.3.5->7.5a re-point class; qstnprt_Rtvcbd6KJfPkCc9v at ['8.1.2']; "
                          "rn_pzFQ4MZnDWbnY6rf at ['7.5a','8.1.2']) while DECLARING spcpt_3hpC7 — now registry-resolved "
                          "-> 9.1 (run-025): the coded-item-vs-declared-sid divergence of record"),
        "candidateSurface": [
            {"candidate": "retain (the state-preserving default — the codes of record stand)", "caveat": None},
            {"candidate": "drop the retained 3hpC7 declaration (the declaration-satisfied reading; sid population 16 -> 12)",
             "caveat": "no in-file drop precedent — the desk's call"},
            {"candidate": "re-point to 9.1", "caveat": "REFUSED mechanically — the rows already carry the run-023 re-point codes of record; a re-point would overwrite them"},
        ],
    },
    "classD_rGVN6to9.1cards": {
        "items": ["fl_sX64VvMkFnH9YHHG", "fl_JMZkg5DQhnd5Y29B"],
        "stateOfRecord": "coded ['9.1'] by the desk's own per-card rulings of record (PR #994, c8480650) while their declared sid resolves 9.3 (run-025) — the item-vs-sid divergence of record",
        "candidateSurface": [
            {"candidate": "retain (the state-preserving default — the desk rulings stand)", "caveat": None},
            {"candidate": "drop the retained sid declaration (the declaration-satisfied reading)", "caveat": "no in-file drop precedent — the desk's call"},
            {"candidate": "re-point to 9.3", "caveat": "REFUSED mechanically — contradicts the desk's own rulings of record (the run-023 law)"},
        ],
    },
    "generatedUtc": "2026-11-13",
}
(ART / "candidates_r0.json").write_text(json.dumps(candidates, indent=1, ensure_ascii=False) + "\n")

adjudication = {
    "artifact": "adjudication_r0",
    "family": "RN-DEBRIS-11", "run": "run-026",
    "kind": "the apply-readiness ruling surface for the desk (the run-022 pattern: every remaining item is a multi-option structural desk call, so the run computed their apply-readiness instead of inventing a ruling)",
    "baseTip": BASE_TIP,
    "territoryOfRecord": ("the run-025-retained declaredUnresolved item plane: 33 users = 14 run-024 cards coded-but-declared "
                          "+ fl_gHFr the dual-declaration card + 13 unmapped q-parts + 4 coded declarers (3 q-parts + "
                          "rn_pzFQ the witness note itself) + rn_KGhttHj9fT889Bm2 the unmapped witness note + the 14 cards' "
                          "retained secondary '8.1.2' tags"),
    "options": {
        "A1": {"label": "re-point the 14 unmapped users (13 q-parts + 1 note) to their declared sid's resolved code + RETAIN the declarations (the run-024 card shape mirror)",
                "recommendation": "lane-recommended (the shape-consistent mechanical option; uniform population among the unmapped users)",
                "projection": proj_A1},
        "A2": {"label": "re-point the 14 + DROP the declarations (the declaration-satisfied reading; sid populations 16->9 / 17->10)",
                "recommendation": None, "projection": proj_A2},
        "A3": {"label": "retain the 14 as-is (the state-preserving default)", "recommendation": None, "projection": proj_A3},
        "B1": {"label": "fl_gHFr map re-point (code choice per the candidates_r0 surface) + retain the dual declaration",
                "recommendation": None, "projection": proj_B},
        "B2": {"label": "retain fl_gHFr as-is (the state-preserving default)", "recommendation": None, "projection": project()},
        "E1": {"label": "drop the 3hpC7 declarations on the 4 coded declarers (sid population 16 -> 12)",
                "recommendation": None, "projection": proj_Cdrop},
        "E2": {"label": "retain the coded declarers' declarations (the state-preserving default)", "recommendation": None, "projection": proj_Ckeep},
        "C1": {"label": "drop the 14 cards' retained secondary '8.1.2' tags", "recommendation": None, "projection": proj_C1},
        "C2": {"label": "retain the secondary tags (the state-preserving default)", "recommendation": None, "projection": project()},
        "D1": {"label": "drop the retained sid declaration on the 2 rGVN6->9.1 cards (sid population 17 -> 15)", "recommendation": None, "projection": proj_D1},
        "D2": {"label": "retain the 2 cards' declarations (the state-preserving default — the desk rulings stand)", "recommendation": None, "projection": proj_D2},
    },
    "lawsOfRecord": [
        "run-023 uniform-re-point law: refuses mechanical user re-points on mixed populations (rGVN6's users split 2x9.1 / 8x9.3 by the desk's own per-card rulings)",
        "run-023 candidates law: the evidence-backed candidates are NAMED for the desk, never applied",
        "the 7JRK resolved-sid-with-retained-declaration shape: registry-resolved sids STAY listed; declarers keep their item states",
        "the fleet multi-id law: code == ids[0] (243/243 precedents at the run-024 record, 257 now)",
        "the map law: coded items carry NO unmapped key (848 counter-example-free at the run-023 record)",
    ],
    "mergePlan": "PR to the R0 desk; author does not self-merge (the filing-time mergePlan law — the desk orders the apply and the self-merge separately); no force-push; fetch-first race-guard at push",
    "generatedUtc": "2026-11-13",
}
(ART / "adjudication_r0.json").write_text(json.dumps(adjudication, indent=1, ensure_ascii=False) + "\n")

print(f"\nartifacts written: state_census_r0.json / candidates_r0.json / adjudication_r0.json ({len(FAILS)} fails)")
if FAILS:
    print("FAILS:"); [print(" -", f) for f in FAILS]
    sys.exit(1)
print("ALL DERIVATION CHECKS PASS")
