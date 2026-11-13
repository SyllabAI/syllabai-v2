#!/usr/bin/env python3
"""RN-DEBRIS-11 run-023 — the open-dispositions apply (the run-022 filing's combination).

Operator order "run-023" (zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e,
trace 1a1d343a03eb5c35, 2026-11-13). Executes the run-022 filing's lane-recommended
combination — D3=opt1, D4=opt1, D5=opt1, D6b=opt1 — as a mechanical apply whose
every judgment class was pre-delegated by the filing ("desk/lane to assign per item
at run-023 with a disclosed per-item rule"):

  D3=1  re-code 8.1.1a -> 8.1.4f (title = run-017 census subRows['8.1.4f'], byte-exact;
        position after 8.1.4; census-neutral 114 points; prereq C47-CON-OPERATORS
        re-anchors 8.1.1a -> 8.1.4f in the same change)
  D4=1  remove the six mis-filed carriers (6.3.4a, 6.3.5, 6.3.6, 6.3.7, 6.3.8, 6.3.9 —
        all byte-equal the landed official 7.4/7.5a/7.5b/7.6-7.9, census r0); re-point
        their tag refs 1:1 byte-exact (6.3.4a->7.4, 6.3.6->7.6, 6.3.7->7.7, 6.3.8->7.8,
        6.3.9->7.9); the 6.3.5 tag population splits per-item across the landed pair
        7.5a/7.5b (the blob components) with every assignment disclosed per item;
        re-anchor the five D4 prereq concepts
  D5=1  remove the four doc-verbatim non-rows (6.3.1a, 6.3.2a, 6.3.3a, 6.3.4); drop the
        dead 6.3.4 refs (all six tagged parts also carry 6.3.4a -> 7.4, census r0);
        re-anchor the three pointer concepts onto the filing's single computed
        candidates (LOGIC-GATE-SYMBOLS -> 10.1 byte-semantic; FLOWCHART-SYMBOLS and
        PSEUDOCODE-FORMAT -> 7.9, co-anchor class disclosed)
  D6b=1 remove 1.3.1a + 1.3.2a in BOTH pure-1 courses (100% redundant post-run-020,
        census r0 residual proof); re-anchor MAP1-CON-LINE-EQUATION -> 1.3.1 and
        MAP1-CON-CIRCLE-EQUATION -> 1.3.3 in the same change

Ruling basis (disclosed of record): the desk's bare execution order under the
run-019 -> 020/021 precedent (run-021 executed the filing's option (a) on a bare
order; rejected options were rejected in the filing); the run-022 filing's lane
recommendations are the filing's endorsed executable combination; the ruling
surface's per-item tokens were not needed because the filing itself pre-delegated
every judgment class to run-023 with disclosed rules. The desk's veto surface is
the PR review (author does not self-merge — filing-time mergePlan law).

The 6.3.5 per-item split (rn23_635_split_r0.json carries the full table): every
ruling carries an EVIDENCE PIN of record (the SME-declaration class, the
validat/verif stem census, the validation/verification category-term counts) and
the apply ASSERTS the live corpus tuple equals the pin (anti-drift, fail-loud).
Evidence classes:
  E1  SME declaration of record — the item's own smeSpecPointIds name the upstream
      SME spec point whose VERBATIM text the corpus cites: spcpt_NNNzT3vsdXS97q4S
      == "(a) Understand the need for validation checks to be made on input data
      and the different types of validation check" (rn_73mKxFyPvcjk2zKw body
      citation, byte-exact) -> 7.5a; spcpt_XNYvx8XttSPbzSFg == the (b) verification
      statement -> 7.5b.
  E2/E3  text/mark-scheme evidence — stems, the validation category terms
      (range/length/type/presence/format check; double entry / visual check), and
      the solution's own naming of the check types (incl. the range-check
      construction task qstnprt_JS2kZRsvZVTCVW5V, grounds quoted in its row).
  U   NO-GUESS class — 14 databases-deck cards whose PRIMARY content is
      database-domain (their SME ids are the single-table-database spec point whose
      text == official 9.1 byte-exact per the corpus's own citation, and the
      primary-key spec point): the dead tag is DROPPED (honest unmap — the fleet's
      7,572-card null-code class; the declaredUnresolved standing law "never
      force-assigned") and the evidence-backed candidate homes (9.1 / 9.3) are NAMED
      for the desk, never applied (unfiled disposition territory).

Census-extension plane (disclosed): content-maps/<cs-23>.json items[].codes refs
move with the same per-item maps — the kg-learner-bridge consumes this map live;
stale refs would silently drop cards from the KG overlay.

Zero-invention: every pin read from the of-record artifacts and asserted live;
dump law (per-file serializer round-trip) before any write; byte-scope proven by
per-node/per-ref dump diff; zero-residual sweep at the end; fail-loud everywhere.
"""
import json, re, sys, hashlib, copy, subprocess
from collections import Counter
from pathlib import Path

REPO = Path("/home/z/my-project/work/syllabai-v2")
HUB = REPO / "apps" / "hub"
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-023"
R22 = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-022"
OUT = Path("/home/z/my-project/work/rn23/out")
CS = "cie-igcse-computer-science-23"
P1A = "cie-a-level-maths-20-pure-1"
P1S = "cie-as-maths-20-pure-1"

D4_SIX = ["6.3.4a", "6.3.5", "6.3.6", "6.3.7", "6.3.8", "6.3.9"]
D5_FOUR = ["6.3.1a", "6.3.2a", "6.3.3a", "6.3.4"]
CS_REMOVE = D4_SIX + D5_FOUR
CS_MAP1TO1 = {"6.3.4a": "7.4", "6.3.6": "7.6", "6.3.7": "7.7", "6.3.8": "7.8", "6.3.9": "7.9"}
CS_PREREQ = {
    "C47-CON-OPERATORS": ("8.1.1a", "8.1.4f"),
    "C47-CON-VALIDATION-TYPES": ("6.3.5", "7.5a"),
    "C47-CON-TEST-DATA": ("6.3.6", "7.6"),
    "C47-CON-TRACE-TABLE": ("6.3.7", "7.7"),
    "C47-CON-ERROR-IDENTIFICATION": ("6.3.8", "7.8"),
    "C47-CON-ALGORITHM-WRITE-AMEND": ("6.3.9", "7.9"),
    "C47-CON-FLOWCHART-SYMBOLS": ("6.3.1a", "7.9"),
    "C47-CON-LOGIC-GATE-SYMBOLS": ("6.3.2a", "10.1"),
    "C47-CON-PSEUDOCODE-FORMAT": ("6.3.3a", "7.9"),
}
P1_REMOVE = ["1.3.1a", "1.3.2a"]
P1_PREREQ = {
    "MAP1-CON-LINE-EQUATION": ("1.3.1a", "1.3.1"),
    "MAP1-CON-CIRCLE-EQUATION": ("1.3.2a", "1.3.3"),
}
OPERATOR_ORDER = "run-023 (zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e, trace 1a1d343a03eb5c35, 2026-11-13)"
BASE_TIP = "24e6f5fd6acef778b459be9fab0e76e3c529c8d7"

GATES = {"artifact": "rn11-run-023-gates-r0", "generatedUtc": "2026-11-13", "gates": []}
APPLY_MANIFEST = {"artifact": "rn11-run-023-apply-manifest-r0", "generatedUtc": "2026-11-13",
                  "operatorOrder": OPERATOR_ORDER,
                  "rulingBasis": "the run-022 filing's lane-recommended combination (D3=1/D4=1/D5=1/D6b=1) executed on the desk's bare order under the run-019->020/021 precedent; every judgment class per the filing's own pre-delegated disclosed rules; the desk's veto surface is the PR review",
                  "courses": []}

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

def load(rel):
    return json.loads((HUB / rel).read_text(encoding="utf-8"))

def load_raw(rel):
    return (HUB / rel).read_text(encoding="utf-8")

def git(*a):
    return subprocess.run(["git", "-C", str(REPO), *a], capture_output=True, text=True).stdout.strip()

# ---------- 0. base-tip + census drift guard ----------
HEAD = git("rev-parse", "HEAD")
if HEAD != BASE_TIP:
    fail(f"branch head {HEAD[:8]} != the pinned base tip {BASE_TIP[:8]} — rebase law")
changed = git("diff", "--name-only", "0cb0161809765d871b34c1f3e12136f188463184", "HEAD").splitlines()
LANE_PLANES = []
for s in (CS, P1A, P1S):
    LANE_PLANES += [f"apps/hub/content/{s}/", f"apps/hub/spines/{s}.json", f"apps/hub/public/kg/data/{s}.json"]
LANE_PLANES += ["apps/hub/public/kg/data/index.json", "apps/hub/content-maps/cie-igcse-computer-science-23.json"]
drift = [p for p in changed if any(p.startswith(pref) or p == pref.rstrip("/") for pref in LANE_PLANES)]
if drift:
    fail(f"lane-course plane drift between the census base 0cb01618 and this base tip: {drift}")
print(f"BASE-OK: head == {BASE_TIP[:8]}; the three lane courses' planes byte-identical to the run-022 census base 0cb01618 "
      f"(main's other-course advances — biology waves / video-map / flags — are outside the census scope of record)")

# ---------- 1. pins from the of-record artifacts (zero invention) ----------
r17census = json.loads((REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/run-017/official_0478_census_r0.json").read_text(encoding="utf-8"))
TITLE_814F = r17census["subRows"]["8.1.4f"]
assert TITLE_814F == "Understand and use arithmetic, logical and Boolean operators"
r22deltas = json.loads((R22 / "option_deltas_r0.json").read_text(encoding="utf-8"))
r22adj = json.loads((R22 / "adjudication_r0.json").read_text(encoding="utf-8"))
assert r22adj["status"].startswith("ADJUDICATION-OF-RECORD")
assert r22deltas["options"]["combined_D4opt1_plus_D5opt1"]["pointsAfter"] == 104
assert r22deltas["options"]["D4"]["opt1_remove6_repoin_reanchor"]["tagRepoints_1to1_byteExact"] == CS_MAP1TO1

cur0 = load(f"content/{CS}/curriculum.json")
def node_of(nodes, code):
    hits = [n for n in nodes if n.get("code") == code]
    return hits[0] if len(hits) == 1 else None
n811a = node_of(cur0["nodes"], "8.1.1a")
if not n811a or n811a["title"] != TITLE_814F:
    fail("D3 pin drift: live 8.1.1a title != run-017 census subRows[8.1.4f]")
for c in CS_REMOVE + ["8.1.1a"]:
    if not node_of(cur0["nodes"], c):
        fail(f"remove/recode code {c} absent from live curriculum (census drift)")
for c in P1_REMOVE:
    for slug in (P1A, P1S):
        if not node_of(load(f"content/{slug}/curriculum.json")["nodes"], c):
            fail(f"{slug}: {c} absent (census drift)")
print("PINS-OK: run-017 8.1.4f title, run-022 deltas maps, live row presence — all asserted")

# ---------- 2. the disclosed 6.3.5 per-item rulings with evidence pins of record ----------
SME_A = "spcpt_NNNzT3vsdXS97q4S"   # upstream SME spec point == official (a) verbatim
SME_B = "spcpt_XNYvx8XttSPbzSFg"   # upstream SME spec point == official (b)
RULE_635 = {
    # question parts (14)
    "qstnprt_7r9RYCnXqws5CVPH": ("a", ["7.5a"], "E1 smeid=(a); range-check validation problem",
        {"sme": "a", "validat": 0, "verif": 0, "aTerms": 1, "bTerms": 0}),
    "qstnprt_x3bvWjMRp2h8vQNQ": ("b", ["7.5b"], "E1 smeid=(b); verification-check problem",
        {"sme": "b", "validat": 0, "verif": 3, "aTerms": 0, "bTerms": 1}),
    "qstnprt_prPTjTTSbnVW5Hqy": ("both", ["7.5a", "7.5b"], "E1 both smeids; problem table spans validation/verification/both",
        {"sme": "both", "validat": 3, "verif": 3, "aTerms": 0, "bTerms": 0}),
    "qstnprt_kTksMpf6rYtv4fKr": ("a", ["7.5a"], "E2 'A validation check ... is a' (format check); zero verification evidence",
        {"sme": None, "validat": 1, "verif": 0, "aTerms": 2, "bTerms": 1}),
    "qstnprt_Gz698jNmCqfwDhVG": ("both", ["7.5a", "7.5b"], "E1 both smeids; 'validation and verification checks' problem",
        {"sme": "both", "validat": 3, "verif": 3, "aTerms": 1, "bTerms": 1}),
    "qstnprt_yBFKmm54b4VVk2HX": ("a", ["7.5a"], "E1 smeid=(a); 'what is meant by data validation'",
        {"sme": "a", "validat": 2, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "qstnprt_ZFW7k22pmPPdDSBG": ("a", ["7.5a"], "E1 smeid=(a); 'Describe the validation checks'",
        {"sme": "a", "validat": 2, "verif": 0, "aTerms": 3, "bTerms": 0}),
    "qstnprt_cz8yNdvBn9MZd7HS": ("b", ["7.5b"], "E1 smeid=(b); double-entry (verification) state-why",
        {"sme": "b", "validat": 0, "verif": 3, "aTerms": 0, "bTerms": 1}),
    "qstnprt_JS2kZRsvZVTCVW5V": ("a", ["7.5a"], "E2-semantic of record: the task CONSTRUCTS a range check on input values (bounds 1..500 inclusive with re-input on out-of-range; solution: 'check if the value entered is between 1 and 500 inclusive ... If the value is not in range, output an error message') — the (a) component's check-type class; zero verification evidence",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "qstnprt_BSb7mKp6kt7YTBjV": ("both", ["7.5a", "7.5b"], "E3 solution names validation/length check AND verification/double entry",
        {"sme": "a", "validat": 1, "verif": 1, "aTerms": 1, "bTerms": 1}),
    "qstnprt_pZX2rMJ9gQcWjNmM": ("a", ["7.5a"], "E3 solution: length/type/presence/format validation checks; zero verification evidence",
        {"sme": "a", "validat": 2, "verif": 0, "aTerms": 4, "bTerms": 0}),
    "qstnprt_Qp7NtwvyJ6rz22MD": ("a", ["7.5a"], "E2 'format check validation' on Email field",
        {"sme": "a", "validat": 1, "verif": 0, "aTerms": 1, "bTerms": 0}),
    "qstnprt_rdcT295MJ7phkMmz": ("a", ["7.5a"], "E2 'type check validation' on StudentID field",
        {"sme": "a", "validat": 1, "verif": 0, "aTerms": 1, "bTerms": 0}),
    "qstnprt_n9WxgR8Xb7BxcHBD": ("a", ["7.5a"], "E2 'two different types of validation'",
        {"sme": "a", "validat": 2, "verif": 0, "aTerms": 2, "bTerms": 0}),
    # flashcards — validation-and-verification deck (10): E1 deterministic
    "fl_mSRvrvgCGBqs2ZSr": ("a", ["7.5a"], "E1 smeid=(a); 'Define validation' card",
        {"sme": "a", "validat": 2, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_gfZKNQ8XcKPb5NTG": ("a", ["7.5a"], "E1 smeid=(a); 'six categories of validation' card",
        {"sme": "a", "validat": 2, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_YVXXSbbkPChtdSWn": ("a", ["7.5a"], "E1 smeid=(a); range-check card",
        {"sme": "a", "validat": 0, "verif": 0, "aTerms": 1, "bTerms": 0}),
    "fl_jd7TQRQN5XYsrdKr": ("a", ["7.5a"], "E1 smeid=(a); length-check card (its single 'verifies' stem is the card's own phrasing of the validation check)",
        {"sme": "a", "validat": 0, "verif": 1, "aTerms": 1, "bTerms": 0}),
    "fl_sD685BMZB48yJyCr": ("a", ["7.5a"], "E1 smeid=(a); type-check card (its single 'verifies' stem is the card's own phrasing of the validation check)",
        {"sme": "a", "validat": 0, "verif": 1, "aTerms": 1, "bTerms": 0}),
    "fl_SmT4t3txSPjhqBqS": ("a", ["7.5a"], "E1 smeid=(a); presence-check card",
        {"sme": "a", "validat": 0, "verif": 0, "aTerms": 1, "bTerms": 0}),
    "fl_SKBBHqB4p6VDtfPB": ("a", ["7.5a"], "E1 smeid=(a); format-check card",
        {"sme": "a", "validat": 0, "verif": 0, "aTerms": 1, "bTerms": 0}),
    "fl_9HCfg73J7PbHhXQp": ("b", ["7.5b"], "E1 smeid=(b); 'What is verification' card",
        {"sme": "b", "validat": 0, "verif": 2, "aTerms": 0, "bTerms": 0}),
    "fl_BwwjWPqcWCHZZzbd": ("b", ["7.5b"], "E1 smeid=(b); 'two methods of verification' card",
        {"sme": "b", "validat": 0, "verif": 2, "aTerms": 0, "bTerms": 2}),
    "fl_xMhdt46rW2DHvFpd": ("b", ["7.5b"], "E1 smeid=(b); check-digit card — the SME layer itself declares it (b); 'verify' stem corroborates",
        {"sme": "b", "validat": 0, "verif": 1, "aTerms": 0, "bTerms": 0}),
    # flashcards — databases deck, validation-flavored (3): E2 category/keyword
    "fl_D2X3Hn7TnvWHxPGv": ("a", ["7.5a"], "E2 'Define validation rule' card",
        {"sme": None, "validat": 2, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_C4qzjW5YKPVks5WP": ("a", ["7.5a"], "E2 'A length check is a validation' card",
        {"sme": None, "validat": 1, "verif": 0, "aTerms": 1, "bTerms": 0}),
    "fl_2KNzN2YSxyGnZSXf": ("a", ["7.5a"], "E2 presence check (validation category, six-categories card of record)",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 1, "bTerms": 0}),
    # flashcards — databases deck, database-domain (14): U class (NO-GUESS drop + candidates named)
    "fl_GPCVpB35Wk6ByBYX": ("drop", [], "U db-domain ('What is a database'; smeid 3hpC7 == official 9.1 verbatim per the corpus's own citation); candidate 9.1 named, not applied",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_JVVmnbmjSK2ChSS7": ("drop", [], "U db-domain ('Define field'); candidate 9.1",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_DS3K2xNCW8r5W4Df": ("drop", [], "U db-domain ('record'); candidate 9.1",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_c865JT8GWTqw5tMq": ("drop", [], "U db-domain (field=row T/F); candidate 9.1",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_nFdzmWtZQZSRhcny": ("drop", [], "U db-domain ('primary key'; smeid rGVN6 == primary-key territory); candidate 9.3 named, not applied",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_xp2KWtrfct7GPhNh": ("drop", [], "U db-domain (primary key numeric T/F); candidate 9.3",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_Qj4jNGWbmJvspXfK": ("drop", [], "U db-domain ('foreign key'); candidate 9.3",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_ZVJDX6Bh6PZPFTxF": ("drop", [], "U db-domain (foreign-key purpose); candidate 9.3",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_qWnydfS2JKsXfJgW": ("drop", [], "U db-domain (every table has a PK T/F); candidate 9.3",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_RRB6sxzZs5thsT3J": ("drop", [], "U db-domain (good primary key); candidate 9.3",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_sX64VvMkFnH9YHHG": ("drop", [], "U db-domain ('record' define); candidate 9.1",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_JMZkg5DQhnd5Y29B": ("drop", [], "U db-domain ('field' define); candidate 9.1",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_T7VPkYbFbNh8b9R6": ("drop", [], "U db-domain (composite key T/F); candidate 9.3",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    "fl_tZxbTx77f5cXQbKt": ("drop", [], "U db-domain (primary key example); candidate 9.3",
        {"sme": None, "validat": 0, "verif": 0, "aTerms": 0, "bTerms": 0}),
    # notes (2)
    "rn_73mKxFyPvcjk2zKw": ("both", ["7.5a", "7.5b"], "note body cites spcpt_NNNzT == official (a) VERBATIM; covers validation (14 stems) and verification (11 stems)",
        {"sme": "both", "validat": 14, "verif": 11, "aTerms": 5, "bTerms": 2}),
    "rn_pzFQ4MZnDWbnY6rf": ("a", ["7.5a"], "RE-ADJUDICATED on full evidence: the Validation section is 3,173 of 5,893 body bytes (10 validation stems, 5 category terms, zero verification content — the single 'verify' stem is the check-digit-validation phrasing of record) and teaches the (a) component's check-type taxonomy in the database-field context; its single-table-database coverage carries the note's own 9.1-cited spec point — candidate 9.1 named for the desk, not applied",
        {"sme": None, "validat": 10, "verif": 1, "aTerms": 5, "bTerms": 0}),
}

qs = load(f"content/{CS}/questions.json")
fcs = load(f"content/{CS}/flashcards.json")
nts = load(f"content/{CS}/notes.json")
part_by_id = {p["id"]: p for s in qs for q in s.get("questions", []) for p in q.get("parts", [])}
fc_by_id = {f["id"]: f for f in fcs}
nt_by_id = {n["noteId"]: n for n in nts}

STEM_V = re.compile(r"validat", re.I)
STEM_W = re.compile(r"verif", re.I)
CATS_A = ["range check", "length check", "type check", "presence check", "format check"]
CATS_B = ["double entry", "visual check"]

split_table = []
for iid, (ruling, targets, grounds, pin) in RULE_635.items():
    if iid.startswith("qstnprt_"): src, kind = part_by_id.get(iid), "question_part"
    elif iid.startswith("fl_"): src, kind = fc_by_id.get(iid), "flashcard"
    else: src, kind = nt_by_id.get(iid), "note"
    if src is None: fail(f"ruling item {iid} not found in the live planes")
    if kind == "question_part":
        text = (src.get("problemMd") or "") + "\n" + (src.get("solutionMd") or "")
    elif kind == "flashcard":
        text = (src.get("front") or "") + "\n" + (src.get("back") or "")
    else:
        text = (src.get("title") or "") + "\n" + (src.get("bodyMd") or "")
    sme = src.get("smeSpecPointIds") or []
    sme_class = ("both" if (SME_A in sme and SME_B in sme) else
                 "a" if SME_A in sme else "b" if SME_B in sme else None)
    live = {"sme": sme_class, "validat": len(STEM_V.findall(text)), "verif": len(STEM_W.findall(text)),
            "aTerms": len([t for t in CATS_A if t in text.lower()]),
            "bTerms": len([t for t in CATS_B if t in text.lower()])}
    if live != pin:
        fail(f"evidence drift at {iid}: live {json.dumps(live)} != disclosed pin {json.dumps(pin)} — grounds: {grounds}")
    split_table.append({"id": iid, "plane": kind, "ruling": ruling, "targets": targets,
                        "grounds": grounds, "evidencePin": pin, "evidenceLive": live})
print(f"SPLIT-OK: {len(split_table)} per-item 6.3.5 rulings asserted against their evidence pins of record "
      f"(a={sum(1 for r in split_table if r['ruling']=='a')}, b={sum(1 for r in split_table if r['ruling']=='b')}, "
      f"both={sum(1 for r in split_table if r['ruling']=='both')}, drop={sum(1 for r in split_table if r['ruling']=='drop')})")
RULING_BY_ID = {r["id"]: r for r in split_table}

# ---------- 3. census-extension population + reference census vs the filing of record ----------
cmap = json.loads(load_raw(f"content-maps/{CS}.json"))
cmap_items = cmap["items"]
pop_parts = {i for i in RULE_635 if i.startswith("qstnprt_")}
pop_parts |= {p["id"] for s in qs for q in s.get("questions", []) for p in q.get("parts", [])
              if set(p.get("specPointCodes") or []) & (set(CS_MAP1TO1) | {"6.3.5", "6.3.4"})}
pop_notes = {i for i in RULE_635 if i.startswith("rn_")}
pop_notes |= {n["noteId"] for n in nts
              if set(n.get("specPointCodes") or []) & (set(CS_MAP1TO1) | {"6.3.5", "6.3.4"})}
POP_BY_KIND = {"flashcard": ({f["id"] for f in fcs if (f.get("specPointCode") or "") in set(CS_REMOVE)}
                             | {i for i in RULE_635 if i.startswith("fl_")}),
               "question_part": pop_parts, "note": pop_notes}
cmap_hit_ids = {}
for iid, item in cmap_items.items():
    refs = item.get("codes") or []
    if any((r.get("officialCode") if isinstance(r, dict) else r) in set(CS_REMOVE) | {"8.1.1a"} for r in refs):
        cmap_hit_ids[iid] = item
for iid, item in cmap_hit_ids.items():
    if iid not in POP_BY_KIND.get(item.get("kind"), set()) and iid not in RULING_BY_ID:
        fail(f"content-maps item {iid} ({item.get('kind')}) carries a target code but is outside the ruled population")
print(f"MAP-OK: {len(cmap_hit_ids)} content-maps items carry target codes, all inside the ruled population")

p_refs = [(p["id"], sorted(set(p.get("specPointCodes") or []) & (set(CS_REMOVE) | {"8.1.1a"})))
          for s in qs for q in s.get("questions", []) for p in q.get("parts", [])
          if set(p.get("specPointCodes") or []) & (set(CS_REMOVE) | {"8.1.1a"})]
f_refs = [(f["id"], [f.get("specPointCode")]) for f in fcs
          if (f.get("specPointCode") or "") in set(CS_REMOVE) | {"8.1.1a"}]
n_refs = [(n["noteId"], sorted(set(n.get("specPointCodes") or []) & (set(CS_REMOVE) | {"8.1.1a"})))
          for n in nts if set(n.get("specPointCodes") or []) & (set(CS_REMOVE) | {"8.1.1a"})]
live_q = Counter(); live_f = Counter(); live_n = Counter()
for _, hits in p_refs: live_q.update(hits)
for _, hits in f_refs: live_f.update(hits)
for _, hits in n_refs: live_n.update(hits)
c22 = json.loads((R22 / "state_census_r0.json").read_text(encoding="utf-8"))["cs23"]["refsPerCode"]
DEAD_CODES = set(CS_REMOVE) | {"8.1.1a"}
for plane, live, key in (("questions", live_q, "questions"), ("flashcards", live_f, "flashcards"), ("notes", live_n, "notes")):
    for code, cnt in c22[key].items():
        if code not in DEAD_CODES: continue  # 8.1.4 (landed, stays) is outside this run's re-point set
        if live.get(code, 0) != cnt:
            fail(f"{plane}-ref drift {code}: live {live.get(code,0)} != census of record {cnt}")
print(f"REFS-OK: question parts {len(p_refs)}, flashcards {len(f_refs)}, notes {len(n_refs)} — byte-equal to the run-022 census of record")

# ---------- 4. order-law ports (the run-022 deltas engine) ----------
def _ord_key(pid):
    head = pid.split(".", 1)[0] if "." in pid else pid
    parts = pid.split(".")
    nums, letter = [], ""
    for i, comp in enumerate(parts):
        if i == 0 and comp == head and len(parts) > 1:
            nums.append(float(comp)); continue
        m = re.match(r"^(\d+)([A-Za-z]*)$", comp)
        if m:
            nums.append(float(m.group(1))); letter = m.group(2) or letter
        else:
            try: nums.append(float(comp.rstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")))
            except ValueError: nums.append(0.0)
    return tuple(nums) + (letter,)

def ord_gate_ok(nodes):
    pts = [n["code"] for n in nodes if n["family"] == "SPEC_POINT"]
    by_sec = {}
    for c in pts: by_sec.setdefault(c.split(".")[0], []).append(c)
    for sec, codes in by_sec.items():
        ords = [_ord_key(c) for c in codes]
        if ords != sorted(ords) or len(set(ords)) != len(ords): return False, sec
    return True, None

def dense_renumber(nodes):
    i = 0
    for n in nodes:
        if n["family"] == "SPEC_POINT":
            i += 1; n["order"] = i
    return nodes

# ---------- 5. the uniform per-element map law for every tag-plane code ----------
def map_codes_element(code, iid=None):
    """Returns a LIST of replacement codes ([] = the element is dropped)."""
    if code == "6.3.5" and iid is not None:
        return list(RULING_BY_ID[iid]["targets"]) if iid in RULING_BY_ID else None
    if code in CS_MAP1TO1:
        return [CS_MAP1TO1[code]]
    if code == "6.3.4":
        return []
    if code == "8.1.1a":
        return ["8.1.4f"]
    return [code]  # non-target codes pass through untouched

REPOINT_LEDGER = {"artifact": "rn11-run-023-repoint-ledger-r0", "generatedUtc": "2026-11-13",
                  "law": "every tag-plane edit of record, per item, per field — questions parts (specPointCodes+specPointIds), flashcards (specPointCode+specPointIds), notes (specPointCodes+specPointIds), content-maps items[].codes refs, prerequisites conceptAnchors",
                  "questions": [], "flashcards": [], "notes": [], "contentMaps": [], "prerequisites": {}}

# ---------- 6. the surgery ----------
def surgery_curriculum(doc, remove_codes, recode, post_pts):
    nodes, edges = doc["nodes"], doc["edges"]
    for c in remove_codes:
        hit = [n for n in nodes if n.get("code") == c]
        if len(hit) != 1: fail(f"remove {c}: {len(hit)} hits")
        nodes.remove(hit[0])
    if recode:
        old, new, after, title = recode
        idx = [i for i, n in enumerate(nodes) if n.get("code") == old]
        if len(idx) != 1: fail(f"recode {old}: {len(idx)} hits")
        n = nodes.pop(idx[0])
        n["code"] = new; n["title"] = title
        ai = [i for i, x in enumerate(nodes) if x.get("code") == after]
        if len(ai) != 1: fail(f"recode after {after}: {len(ai)} hits")
        nodes.insert(ai[0] + 1, n)
        ei = [i for i, e in enumerate(edges) if e.get("target") == old]
        if len(ei) != 1: fail(f"recode edge {old}: {len(ei)} hits")
        rec_edge = edges.pop(ei[0]); rec_edge["target"] = new
        ae = [i for i, e in enumerate(edges) if e.get("target") == after]
        if len(ae) != 1: fail(f"recode edge-after {after}: {len(ae)} hits")
        edges.insert(ae[0] + 1, rec_edge)
    removed_set = set(remove_codes)
    doc["edges"] = [e for e in edges if not (e.get("target") in removed_set or e.get("source") in removed_set)]
    dense_renumber(nodes)
    ok, bad = ord_gate_ok(nodes)
    if not ok: fail(f"ord gate red post-surgery (section {bad})")
    pts = [n for n in nodes if n["family"] == "SPEC_POINT"]
    if len(pts) != post_pts: fail(f"post point census {len(pts)} != {post_pts}")
    if sorted(n["order"] for n in pts) != list(range(1, post_pts + 1)):
        fail("post orders not dense")

def bump_table(pre_nodes, post_nodes):
    pre = {n["code"]: n["order"] for n in pre_nodes if n.get("family") == "SPEC_POINT"}
    post = {n["code"]: n["order"] for n in post_nodes if n.get("family") == "SPEC_POINT"}
    return {c: (pre[c], post[c]) for c in post if c in pre and pre[c] != post[c]}

def node_dumps(nodes):
    return {n.get("code") or f"@{i}": dump_compact(n, False) for i, n in enumerate(nodes)}

COURSES = [
    {"slug": CS, "remove": CS_REMOVE, "recode": ("8.1.1a", "8.1.4f", "8.1.4", TITLE_814F),
     "pre_pts": 114, "post_pts": 104, "kg_pre": (146, 239, 114), "kg_post": (136, 229, 104),
     "tagplanes": True, "ugm": False},
    {"slug": P1A, "remove": P1_REMOVE, "recode": None,
     "pre_pts": 36, "post_pts": 34, "kg_pre": (46, 91, 36), "kg_post": (44, 89, 34),
     "tagplanes": False, "ugm": True},
    {"slug": P1S, "remove": P1_REMOVE, "recode": None,
     "pre_pts": 36, "post_pts": 34, "kg_pre": (46, 91, 36), "kg_post": (44, 89, 34),
     "tagplanes": False, "ugm": False},
]

sys.path.insert(0, str(HUB / "scripts"))
import kg_export  # noqa: E402
reg_data = json.loads((HUB / "content/courses.json").read_text(encoding="utf-8"))
registry = {}
for entry in (reg_data if isinstance(reg_data, list) else reg_data.get("courses", [])):
    if isinstance(entry, dict) and entry.get("slug"):
        registry[entry["slug"]] = entry

for C in COURSES:
    slug = C["slug"]
    print(f"== {slug} ==")
    cp = HUB / f"content/{slug}/curriculum.json"
    sp = HUB / f"spines/{slug}.json"
    kp = HUB / f"public/kg/data/{slug}.json"
    mp = HUB / f"content/{slug}/manifest.json"
    raws = {"curriculum": cp.read_bytes(), "spine": sp.read_bytes(), "kg": kp.read_bytes(), "manifest": mp.read_bytes()}
    c_doc = json.loads(raws["curriculum"]); s_doc = json.loads(raws["spine"]); k_doc = json.loads(raws["kg"])
    (dc, tc) = detect_dumper(raws["curriculum"].decode("utf-8"), c_doc)
    (ds, ts) = detect_dumper(raws["spine"].decode("utf-8"), s_doc)
    (dk, tk) = detect_dumper(raws["kg"].decode("utf-8"), k_doc)
    if not (dc and ds and dk): fail(f"{slug}: serializer round-trip failed (dump law)")
    m_raw = raws["manifest"].decode("utf-8"); m_doc = json.loads(m_raw)
    (dm, tm) = detect_dumper(m_raw, m_doc)
    if not dm: fail(f"{slug}: manifest serializer round-trip failed")
    gate(f"{slug}:G1-serializers", True, "content/spine/kg/manifest round-trip EXACT (dump law)")

    pre_c_nodes = copy.deepcopy(c_doc["nodes"]); pre_c_edges = copy.deepcopy(c_doc["edges"])
    pre_s_nodes = copy.deepcopy(s_doc["curriculum"]["nodes"]); pre_s_edges = copy.deepcopy(s_doc["curriculum"]["edges"])

    # spine meta.dupCodePolicy: the build-time record of the synthetic-suffix dedupe
    # class — all of its examples are exactly the codes this run removes/re-codes, so
    # the post-state record is the rebuild-equivalent empty class (disclosed, ledgered)
    dcp = s_doc.get("meta", {}).get("dupCodePolicy")
    if dcp:
        ex = dcp.get("examples") or []
        dead_or_recoded = set(C["remove"]) | ({"8.1.1a"} if C["recode"] else set())
        if dcp.get("suffixed") != len(ex) or not (set(ex) & dead_or_recoded):
            fail(f"{slug}: spine dupCodePolicy examples {ex} != the census of record's dedupe class")
        kept = [c for c in ex if c not in dead_or_recoded]
        dcp["suffixed"] = len(kept)
        dcp["examples"] = kept
        REPOINT_LEDGER.setdefault("spineMetaDupCodePolicy", {})[slug] = {
            "from": {"suffixed": len(ex), "examples": ex},
            "to": {"suffixed": len(kept), "examples": kept},
            "law": "the dedupe-class examples removed/re-coded by this run leave the record; the surviving synthetic-suffix codes (if any) stay of record; the rule text itself is unchanged"}

    # curriculum + spine surgery (identical law, both planes)
    surgery_curriculum(c_doc, C["remove"], C["recode"], C["post_pts"])
    surgery_curriculum(s_doc["curriculum"], C["remove"], C["recode"], C["post_pts"])
    cmap_by = {n["code"]: n for n in c_doc["nodes"] if "-SME-" not in str(n.get("code", ""))}
    smap_by = {n["code"]: n for n in s_doc["curriculum"]["nodes"]}
    if set(cmap_by) != set(smap_by): fail(f"{slug}: content/spine code sets diverge")
    for code in cmap_by:
        a, b = cmap_by[code], smap_by[code]
        if (a.get("title"), a.get("order"), a.get("family"), a.get("parents"), a.get("provenanceTier")) != \
           (b.get("title"), b.get("order"), b.get("family"), b.get("parents"), b.get("provenanceTier")):
            fail(f"{slug}: plane parity broken at {code}")
    bumps = bump_table(pre_c_nodes, c_doc["nodes"])
    sbumps = bump_table(pre_s_nodes, s_doc["curriculum"]["nodes"])
    if bumps != sbumps: fail(f"{slug}: content/spine bump tables diverge")
    g2 = ((f"-{len(C['remove'])} nodes/edges; recode {C['recode'][0]}->{C['recode'][1]} after {C['recode'][2]}; " if C["recode"] else f"-{len(C['remove'])} nodes/edges; ") +
          f"dense {C['pre_pts']}->{C['post_pts']}; {len(bumps)} order bumps; ord gate PASS; plane parity {len(cmap_by)} official nodes")
    gate(f"{slug}:G2-surgery", True, g2)

    # manifest single-site bump
    m_from, m_to = C["pre_pts"], C["post_pts"]
    pat = rf'"specPoints": {m_from}\b'
    if len(re.findall(pat, m_raw)) != 1: fail(f"{slug}: manifest specPoints {m_from} not exactly-once")
    m_new_raw = re.sub(pat, f'"specPoints": {m_to}', m_raw, count=1)
    if json.loads(m_new_raw)["counts"]["specPoints"] != m_to: fail(f"{slug}: manifest bump verify")
    gate(f"{slug}:G4-manifest", True, f"specPoints {m_from}->{m_to} (single site)")

    # prerequisites re-anchor (single-site per concept, census-pinned, same change)
    pp = HUB / f"content/{slug}/prerequisites.json"
    p_raw = pp.read_text(encoding="utf-8"); p_doc = json.loads(p_raw)
    (dp, tp) = detect_dumper(p_raw, p_doc)
    if not dp: fail(f"{slug}: prerequisites serializer round-trip failed")
    pre_anchor_sets_of_record = copy.deepcopy(p_doc.get("conceptAnchors", {}))
    reanchor_map = CS_PREREQ if slug == CS else P1_PREREQ
    for con, (oldc, newc) in reanchor_map.items():
        anchors = p_doc.get("conceptAnchors", {}).get(con)
        if anchors is None: fail(f"{slug}: prereq concept {con} missing")
        if oldc not in anchors: fail(f"{slug}: {con} anchors {anchors} do not carry the census of record's {oldc}")
        new_set = sorted(set(anchors) - {oldc} | {newc})
        REPOINT_LEDGER["prerequisites"][f"{slug}:{con}"] = {"from": sorted(anchors), "to": new_set}
        p_doc["conceptAnchors"][con] = new_set
    for con, anchors in p_doc.get("conceptAnchors", {}).items():
        if con in reanchor_map: continue
        hit = [a for a in anchors if a in set(C["remove"]) | {"8.1.1a"}]
        if hit: fail(f"{slug}: unfiled prereq anchor on a removed code: {con} -> {hit}")
    pp.write_text(dp(p_doc, tp), encoding="utf-8")
    gate(f"{slug}:G-prereq", True, f"{len(reanchor_map)} concepts re-anchored in the same change (single-site, census-pinned)")

    # write content/spine/manifest BEFORE the KG regen (the exporter reads disk)
    cp.write_text(dc(c_doc, tc), encoding="utf-8")
    sp.write_text(ds(s_doc, ts), encoding="utf-8")
    mp.write_text(dm(json.loads(m_new_raw), tm), encoding="utf-8")

    # tag planes (cs-23 only — the pure-1 pair carries zero refs, census r0)
    if C["tagplanes"]:
        qp = HUB / f"content/{slug}/questions.json"
        q_raw = qp.read_text(encoding="utf-8"); q_doc = json.loads(q_raw)
        (dq, tq) = detect_dumper(q_raw, q_doc)
        if not dq: fail("questions serializer round-trip failed")
        DEAD = set(CS_REMOVE) | {"8.1.1a"}
        for s in q_doc:
            for q in s.get("questions", []):
                for p in q.get("parts", []):
                    codes = p.get("specPointCodes") or []
                    if not any(x in DEAD for x in codes): continue
                    pid = p["id"]
                    new_codes = []
                    for x in codes:
                        t = map_codes_element(x, pid)
                        if t is None: fail(f"part {pid}: 6.3.5 element without a ruling")
                        new_codes.extend(t)
                    if len(new_codes) != len(set(new_codes)): fail(f"part {pid}: duplicate codes after map {new_codes}")
                    if not new_codes: fail(f"part {pid}: would lose ALL codes (unfiled)")
                    REPOINT_LEDGER["questions"].append({"part": pid, "set": s.get("slug"), "from": codes, "to": new_codes})
                    p["specPointCodes"] = new_codes
                    p["specPointIds"] = list(new_codes)
        qp.write_text(dq(q_doc, tq), encoding="utf-8")

        fp = HUB / f"content/{slug}/flashcards.json"
        f_raw = fp.read_text(encoding="utf-8"); f_doc = json.loads(f_raw)
        (dff, tff) = detect_dumper(f_raw, f_doc)
        if not dff: fail("flashcards serializer round-trip failed")
        for f in f_doc:
            code = f.get("specPointCode")
            ids = f.get("specPointIds") or []
            if (code not in DEAD) and not any(x in DEAD for x in ids): continue
            fid = f["id"]
            if code in DEAD:
                t = map_codes_element(code, fid)
                if t is None: fail(f"card {fid}: 6.3.5 code without a ruling")
                if t == []:
                    f["specPointCode"] = None
                else:
                    if len(t) != 1: fail(f"card {fid}: single-valued specPointCode cannot carry {t}")
                    f["specPointCode"] = t[0]
            new_ids = []
            for x in ids:
                tt = map_codes_element(x, fid) if x in DEAD else [x]
                if tt is None: fail(f"card {fid}: 6.3.5 id element without a ruling")
                new_ids.extend(tt)
            if len(new_ids) != len(set(new_ids)): fail(f"card {fid}: duplicate ids after map {new_ids}")
            f["specPointIds"] = new_ids
            REPOINT_LEDGER["flashcards"].append({"card": fid, "fromCode": code, "toCode": f["specPointCode"],
                                                 "fromIds": ids, "toIds": new_ids})
        fp.write_text(dff(f_doc, tff), encoding="utf-8")

        npth = HUB / f"content/{slug}/notes.json"
        n_raw = npth.read_text(encoding="utf-8"); n_doc = json.loads(n_raw)
        (dn, tn) = detect_dumper(n_raw, n_doc)
        if not dn: fail("notes serializer round-trip failed")
        for n in n_doc:
            codes = n.get("specPointCodes") or []
            if not any(x in DEAD for x in codes): continue
            nid = n["noteId"]
            new_codes = []
            for x in codes:
                t = map_codes_element(x, nid)
                if t is None: fail(f"note {nid}: 6.3.5 element without a ruling")
                new_codes.extend(t)
            if len(new_codes) != len(set(new_codes)): fail(f"note {nid}: duplicate codes after map {new_codes}")
            if not new_codes: fail(f"note {nid}: would lose ALL codes (unfiled)")
            REPOINT_LEDGER["notes"].append({"note": nid, "from": codes, "to": new_codes})
            n["specPointCodes"] = new_codes
            n["specPointIds"] = list(new_codes)
        npth.write_text(dn(n_doc, tn), encoding="utf-8")

        cm_raw = load_raw(f"content-maps/{CS}.json")
        cm_doc = json.loads(cm_raw)
        (dcm, tcm) = detect_dumper(cm_raw, cm_doc)
        if not dcm: fail("content-maps serializer round-trip failed")
        # (a) spcptToOfficial: the SME-id resolution table follows the same per-code map;
        #     a 6.3.5-resolved id must carry ONE uniform ruling across all its items
        for sid, entry in cm_doc.get("spcptToOfficial", {}).items():
            oc = entry.get("officialCode")
            if oc not in DEAD: continue
            if oc == "6.3.5":
                users = [iid for iid in RULING_BY_ID
                         if sid in ((part_by_id[iid].get("smeSpecPointIds") or []) if iid in part_by_id else
                                    (fc_by_id[iid].get("smeSpecPointIds") or []) if iid in fc_by_id else
                                    (nt_by_id[iid].get("smeSpecPointIds") or []))]
                rulings = {RULING_BY_ID[i]["ruling"] for i in users}
                if not users or len(rulings) != 1:
                    fail(f"spcptToOfficial {sid}: users {users} carry mixed/absent rulings {rulings} — cannot re-point uniformly")
                tgt = list(RULING_BY_ID[users[0]]["targets"])
                if len(tgt) != 1: fail(f"spcptToOfficial {sid}: single-valued officialCode cannot carry {tgt}")
            else:
                tgt = map_codes_element(oc)
            entry["officialCode"] = tgt[0]
            entry["officialCodes"] = [tgt[0]]
            REPOINT_LEDGER["contentMaps"].append({"item": f"spcptToOfficial:{sid}", "kind": "spcpt-resolution",
                                                  "repoints": [[oc, tgt[0]]], "unmapped": None})
        # (b) reconciliation.uncoveredSpineCodeList: the dead codes leave the uncovered list
        usl = ((cm_doc.get("reconciliation") or {}).get("uncoveredSpineCodeList"))
        if isinstance(usl, list):
            kept = [c for c in usl if c not in DEAD]
            if len(kept) != len(usl):
                cm_doc["reconciliation"]["uncoveredSpineCodeList"] = kept
                REPOINT_LEDGER["contentMaps"].append({"item": "reconciliation:uncoveredSpineCodeList", "kind": "reconciliation",
                                                      "repoints": [[c, None] for c in usl if c in DEAD], "unmapped": None})
        for iid, item in cm_doc["items"].items():
            refs = item.get("codes") or []
            if not any((r.get("officialCode") if isinstance(r, dict) else r) in DEAD for r in refs): continue
            kind = item.get("kind")
            new_refs = []
            changed_rows = []
            for r in refs:
                if not isinstance(r, dict):
                    fail(f"map item {iid}: non-dict code ref (schema drift): {r!r}")
                oc = r.get("officialCode")
                if oc not in DEAD:
                    new_refs.append(r); continue
                if oc == "6.3.5":
                    if iid not in RULING_BY_ID: fail(f"map item {iid}: 6.3.5 ref without a ruling")
                    targets = list(RULING_BY_ID[iid]["targets"])
                else:
                    targets = map_codes_element(oc)
                for t in targets:
                    nr = copy.deepcopy(r); nr["officialCode"] = t; nr["spineCode"] = t
                    new_refs.append(nr); changed_rows.append([oc, t])
            item["codes"] = new_refs
            if not new_refs and item.get("unmapped") is False:
                item["unmapped"] = True
            REPOINT_LEDGER["contentMaps"].append({"item": iid, "kind": kind,
                                                  "repoints": changed_rows, "unmapped": item.get("unmapped")})
        (HUB / f"content-maps/{CS}.json").write_text(dcm(cm_doc, tcm), encoding="utf-8")
        gate(f"{slug}:G-tagplanes", True,
             f"questions {len(REPOINT_LEDGER['questions'])} parts / flashcards {len(REPOINT_LEDGER['flashcards'])} cards / notes {len(REPOINT_LEDGER['notes'])} notes / content-maps {len(REPOINT_LEDGER['contentMaps'])} map items re-pointed per item; ledger of record written")
    else:
        for rel in (f"content/{slug}/questions.json", f"content/{slug}/flashcards.json", f"content/{slug}/notes.json"):
            raw = load_raw(rel)
            for c in C["remove"]:
                if f'"{c}"' in raw: fail(f"{slug}: {rel} carries {c} (census r0 said 0 refs)")
        gate(f"{slug}:G-tagplanes", True, "zero tag-plane refs (census r0) — re-asserted live")

    # --- KG regen (v1.7 exporter of record; run-016/017/018/021 law) ---
    k_meta = k_doc["meta"]["counts"]
    if (k_meta["nodes"], k_meta["edges"], k_meta["specPoints"]) != C["kg_pre"]:
        fail(f"{slug}: pre-KG meta {k_meta} != of-record {C['kg_pre']}")
    pre_kg_hier = sum(1 for e in k_doc["edges"] if (e[2] if isinstance(e, list) else e.get("relation")) == "hier")
    if pre_kg_hier != len(k_doc["nodes"]) - 1: fail(f"{slug}: pre-KG spanning tree broken ({pre_kg_hier})")
    pre_pre_rel = sum(1 for e in k_doc["edges"] if (e[2] if isinstance(e, list) else e.get("relation")) in ("pre", "rel"))
    pre_pre_edges = [e for e in k_doc["edges"] if isinstance(e, list) and e[2] in ("pre", "rel")]
    # The projected pre/rel expectation, computed by replicating the exporter's own
    # standing projection (v1.6 web tier: concept-anchor sets resolve to point-id
    # sets, cross-product pairs, self-loops skipped, reversed pairs dropped outright,
    # point_ord_key governance). Pre anchors (pre re-anchor) + pre code set must
    # reproduce the pre-state KG's pre/rel set exactly; post anchors + post code set
    # produce the expected post set. The run-022 deltas' "counts stable" projection
    # refines by exactly the anchor-set cross-product narrowing + the co-anchor
    # collapse + reversal classes, all enumerated in the ledger of record.
    qual = p_doc.get("curriculumCode") or ""
    pre_anchor_sets = copy.deepcopy(pre_anchor_sets_of_record)
    post_anchor_sets = p_doc["conceptAnchors"]
    pre_codes = [n["code"] for n in pre_c_nodes if n["family"] == "SPEC_POINT"]
    post_codes = [n["code"] for n in c_doc["nodes"] if n["family"] == "SPEC_POINT"]
    web_edges = p_doc.get("conceptWebPrerequisiteEdges", [])
    inf_pre_tuples = p_doc.get("inferredPrototypePre", [])
    inf_rel_tuples = p_doc.get("inferredPrototypeRel", [])
    val_edges = p_doc.get("validatedPrerequisiteEdges", [])
    if val_edges: fail(f"{slug}: the snapshot carries {len(val_edges)} validated edges — the replica must be extended before applying")
    def project(anchors_map, codes):
        seen = {kg_export.point_id_for(qual, c) for c in codes}
        anchors = {}
        for cc, specs in anchors_map.items():
            pids = {kg_export.point_id_for(qual, sp) for sp in specs} & seen
            if pids: anchors[cc] = pids
        def resolve(code):
            if code in anchors_map:
                return anchors.get(code, set()), code in anchors
            pid = kg_export.point_id_for(qual, code)
            return ({pid} if pid in seen else set()), pid in seen
        def mapped_pairs(tuples):
            out = set()
            for a, b in tuples:
                pa, pb = a[2:], b[2:]   # snapshot tuples are 'p:<pointId>' verbatim
                if pa in seen and pb in seen and pa != pb: out.add((pa, pb))
            return out
        inferred_pre = mapped_pairs(inf_pre_tuples)
        related = mapped_pairs(inf_rel_tuples)
        out = set()
        for (p, d) in inferred_pre: out.add(("p:" + p, "pre", "p:" + d))
        for (p, d) in related: out.add(("p:" + p, "rel", "p:" + d))
        for e in web_edges:
            dep_pids, dep_ok = resolve(e["dependent"])
            pre_pids, pre_ok = resolve(e["prerequisite"])
            if not dep_ok or not pre_ok or not dep_pids or not pre_pids: continue
            for d in dep_pids:
                for p in pre_pids:
                    if d == p: continue
                    if (p, d) in inferred_pre or (p, d) in related: continue  # the inferred tiers win
                    if kg_export.point_ord_key(p) < kg_export.point_ord_key(d):
                        out.add(("p:" + p, "pre", "p:" + d))   # the exporter emits 'p:'-prefixed ids
        return out
    pre_proj = project(pre_anchor_sets, pre_codes)
    actual_pre_set = set((e[0], e[2], e[1]) for e in pre_pre_edges)
    if pre_proj != actual_pre_set:
        fail(f"{slug}: the pre-state projection replica != the pre-KG of record "
             f"(missing {sorted(pre_proj - actual_pre_set)[:3]}, unexpected {sorted(actual_pre_set - pre_proj)[:3]})")
    expected_pre = project(post_anchor_sets, post_codes)
    # the per-edge ledger classification: every lost edge carries its shipped successor(s)
    reanchor_by_old = {old: new for (_, (old, new)) in (CS_PREREQ if slug == CS else P1_PREREQ).items()}
    def _emap(code):
        base = code[2:] if code.startswith("p:") else code
        return "p:" + reanchor_by_old.get(base, base)
    dropped_pre = []
    for lost in sorted(actual_pre_set - expected_pre):
        succ = [t for t in expected_pre if t[0] == _emap(lost[0]) and t[2] == _emap(lost[2])]
        if not succ:
            succ = [t for t in expected_pre if t[0] == _emap(lost[0]) and lost[2][2:] in t[2]] or \
                   [t for t in expected_pre if _emap(lost[2]) == t[2] and lost[0][2:] in t[0]]
        if _emap(lost[0]) == _emap(lost[2]):
            law = "self-loop after the filed re-anchor (the D5 co-anchor class collapse, disclosed)"
        elif kg_export.point_ord_key(_emap(lost[0])[2:]) >= kg_export.point_ord_key(_emap(lost[2])[2:]):
            law = "reversed after the filed re-anchor (the web tier's in-order law: reversed pairs dropped, never demoted)"
        elif succ:
            law = "re-anchored per the filed concept map — the pair's successor edge(s) ship of record"
        else:
            law = "vanishes under the filed anchor-set diff (the cross-product narrowing; no successor)"
        dropped_pre.append({"from": [lost[0], lost[2]], "law": law, "successors": succ})
    sme_nodes = [n for n in c_doc["nodes"] if "-SME-" in str(n.get("code", ""))]
    export_doc = c_doc
    if sme_nodes:
        export_doc = copy.deepcopy(c_doc)
        export_doc["nodes"] = [n for n in export_doc["nodes"] if "-SME-" not in str(n.get("code", ""))]
        export_doc["edges"] = [e for e in export_doc["edges"]
                               if "-SME-" not in str(e.get("source", "")) and "-SME-" not in str(e.get("target", ""))]
        cp.write_text(dc(export_doc, tc), encoding="utf-8")
    payload = kg_export.export_course(slug, registry)
    cts = payload["meta"]["counts"]
    # the replica IS the expectation: 81 surviving + 9 re-anchor-gained = 90 pre/rel;
    # the 13 lost edges are ledgered with their successors (9 replaced, 4 collapsed)
    exp_edges = (C["kg_pre"][0] - len(C["remove"])) - 1 + len(expected_pre)
    if (cts["nodes"], cts["specPoints"]) != (C["kg_pre"][0] - len(C["remove"]), C["kg_pre"][2] - len(C["remove"])):
        fail(f"{slug}: KG node/point counts {cts} != expected")
    if cts["edges"] != exp_edges:
        fail(f"{slug}: KG edge count {cts['edges']} != re-anchor-law expectation {exp_edges} "
             f"(hier {C['kg_pre'][0] - len(C['remove']) - 1} + pre/rel {pre_pre_rel - len(dropped_pre)} after {len(dropped_pre)} exporter-law drops)")
    payload2 = kg_export.export_course(slug, registry)
    p1 = json.loads(json.dumps(payload)); p2 = json.loads(json.dumps(payload2))
    p1["meta"].pop("generatedUtc", None); p2["meta"].pop("generatedUtc", None)
    if json.dumps(p1, sort_keys=True) != json.dumps(p2, sort_keys=True): fail(f"{slug}: KG deep-equal broken")
    if sme_nodes:
        cp.write_text(dc(c_doc, tc), encoding="utf-8")  # restore the full content doc (SME layer intact)
    kg_points = {p["id"]: p["text"] for p in payload["points"]}
    gone = set(C["remove"]) | ({"8.1.1a"} if slug == CS else set())
    for rc in gone:
        if rc in kg_points: fail(f"{slug}: removed code {rc} still present in the regenerated KG points")
    if slug == CS and kg_points.get("8.1.4f") != TITLE_814F:
        fail(f"{slug}: KG point 8.1.4f does not carry the run-017 census title")
    cur_by = {n["code"]: n for n in c_doc["nodes"]}
    drift_pts = [pid for pid, t in kg_points.items() if pid in cur_by and cur_by[pid]["title"] != t]
    if drift_pts: fail(f"{slug}: KG mirror drift at {drift_pts[:5]}")
    if slug == CS:
        subj_secs = [e[1] for e in payload["edges"] if isinstance(e, list) and e[0] == "subject" and e[1].startswith("sec")]
        for sec in ("sec7", "sec9", "sec10"):
            if sec not in subj_secs: fail(f"{slug}: v1.7 natural emission lost {sec} (the absorbed 700bb601 law)")
    arr_hier = sum(1 for e in payload["edges"] if (e[2] if isinstance(e, list) else e.get("relation")) == "hier")
    if arr_hier != cts["nodes"] - 1: fail(f"{slug}: post-KG spanning tree broken ({arr_hier} vs {cts['nodes']-1})")
    actual_pre = set((e[0], e[2], e[1]) if isinstance(e, list) else (e["source"], e["target"], e["relation"])
                     for e in payload["edges"]
                     if (e[2] if isinstance(e, list) else e.get("relation")) in ("pre", "rel"))
    if actual_pre != expected_pre:
        miss = expected_pre - actual_pre; extra = actual_pre - expected_pre
        fail(f"{slug}: projected pre/rel set != the re-anchor expectation (missing {sorted(miss)[:4]}, unexpected {sorted(extra)[:4]})")
    mpre = payload.get("meta", {}).get("prerequisites", {})
    mpre0 = (k_doc.get("meta", {}).get("prerequisites") or {})
    if mpre and mpre0:
        n_self = sum(1 for d in dropped_pre if "self-loop" in d["law"])
        rev_unique = {_emap(d["from"][0]) + "->" + _emap(d["from"][1])
                      for d in dropped_pre if "reversed" in d["law"]}
        cw0 = ((mpre0.get("conceptWebSkipped") or {}).get("selfLoop") or 0)
        cw1 = ((mpre.get("conceptWebSkipped") or {}).get("selfLoop") or 0)
        wr0 = ((mpre0.get("reversedGovernance") or {}).get("webReversedDropped") or 0)
        wr1 = ((mpre.get("reversedGovernance") or {}).get("webReversedDropped") or 0)
        if cw1 - cw0 != n_self:
            fail(f"{slug}: selfLoop counter delta {cw0}->{cw1} != the accounted {n_self}")
        if wr1 - wr0 != len(rev_unique):
            fail(f"{slug}: webReversedDropped counter delta {wr0}->{wr1} != the accounted {len(rev_unique)} (post-dedupe {sorted(rev_unique)})")
    REPOINT_LEDGER.setdefault("projectedPreEdges", {})[slug] = {
        "from": pre_pre_rel, "to": len(actual_pre),
        "dropped": dropped_pre,
        "counterDeltas": {"selfLoop": [((mpre0.get("conceptWebSkipped") or {}).get("selfLoop") or 0),
                                        ((mpre.get("conceptWebSkipped") or {}).get("selfLoop") or 0)],
                           "webReversedDropped": [((mpre0.get("reversedGovernance") or {}).get("webReversedDropped") or 0),
                                                   ((mpre.get("reversedGovernance") or {}).get("webReversedDropped") or 0)]},
        "law": "endpoints re-anchored per the filed concept map; the exporter's standing web-tier laws (self-loop skip per input pair, reversed-pair drop per deduped entry, counter deltas vs the pre-state meta) account every delta"}
    psubs = payload.get("pointSubtopics") or {}
    members = [m for lst in psubs.values() for m in lst]
    for rc in gone:
        if rc in members: fail(f"{slug}: removed code {rc} still in a pointSubtopics bucket")
    if slug == CS:
        if "8.1.4f" not in members: fail(f"{slug}: 8.1.4f missing from the pointSubtopics buckets")
        b6c = next((sorted(lst) for lst in psubs.values() if "6.3.1" in lst), None)
        if b6c is not None and b6c != ["6.3.1", "6.3.2", "6.3.3"]:
            fail(f"{slug}: SUB6.3 bucket post-state {b6c} != exactly official 6.3.1-6.3.3")
    kp.write_text(dk(payload, tk), encoding="utf-8")
    gate(f"{slug}:G5-kg-regen", True,
         f"array {cts['nodes']}n/{cts['edges']}e/{cts['specPoints']}sp (meta = exporter output); hier {arr_hier}==nodes-1; "
         f"deep-equal OK x2; pre/rel {pre_pre_rel}->{len(actual_pre)} per the re-anchor law ({len(dropped_pre)} exporter-law drops, ledgered); mirror law zero drift; removed codes absent"
         + ("; sec7/sec9/sec10 natural emission absorbed" if slug == CS else ""))

    # --- byte-scope law: per-node dump diff vs pre-state ---
    post_c_all = node_dumps(c_doc["nodes"]); pre_c_all = node_dumps(pre_c_nodes)
    vanished = set(pre_c_all) - set(post_c_all)
    arrived = set(post_c_all) - set(pre_c_all)
    expect_vanish = set(C["remove"]) | ({"8.1.1a"} if C["recode"] else set())
    if vanished != expect_vanish: fail(f"{slug}: content node vanishing set {vanished ^ expect_vanish}")
    if slug == CS and arrived != {"8.1.4f"}: fail(f"{slug}: content node arrival set {arrived}")
    if slug != CS and arrived: fail(f"{slug}: unexpected node arrivals {arrived}")
    for code in pre_c_all:
        if code in vanished: continue
        post_code = "8.1.4f" if (slug == CS and code == "8.1.1a") else code
        pre_n = next(n for n in pre_c_nodes if n.get("code") == code)
        post_n = next(n for n in c_doc["nodes"] if n.get("code") == post_code)
        if pre_n.get("family") == "SPEC_POINT":
            if code == "8.1.1a" and slug == CS:
                a = {k: v for k, v in pre_n.items() if k not in ("code", "title", "order")}
                b = {k: v for k, v in post_n.items() if k not in ("code", "title", "order")}
                if a != b or post_n["title"] != TITLE_814F: fail(f"{slug}: recoded node differs beyond code/title/order")
            elif code in bumps:
                a = {k: v for k, v in pre_n.items() if k != "order"}
                b = {k: v for k, v in post_n.items() if k != "order"}
                if a != b: fail(f"{slug}: bumped node {code} differs beyond the order field")
            elif pre_c_all[code] != post_c_all[post_code]:
                fail(f"{slug}: non-bump node {code} mutated")
        elif pre_c_all[code] != post_c_all[post_code]:
            fail(f"{slug}: non-point node {code} mutated")
    pre_edge_set = Counter(dump_compact(e, False) for e in pre_c_edges)
    post_edge_set = Counter(dump_compact(e, False) for e in c_doc["edges"])
    edge_add = post_edge_set - pre_edge_set
    edge_del = pre_edge_set - post_edge_set
    expect_removed_edges = sum(1 for e in pre_c_edges if e.get("target") in set(C["remove"])) + (1 if C["recode"] else 0)
    expect_added_edges = 1 if slug == CS else 0  # the recoded edge re-enters with its new target dump
    if sum(edge_del.values()) != expect_removed_edges or sum(edge_add.values()) != expect_added_edges:
        fail(f"{slug}: edge delta != the declared surgery (+{sum(edge_add.values())}/-{sum(edge_del.values())}, expected +{expect_added_edges}/-{expect_removed_edges})")
    post_s_all = node_dumps(s_doc["curriculum"]["nodes"]); pre_s_all = node_dumps(pre_s_nodes)
    if set(pre_s_all) - set(post_s_all) != expect_vanish: fail(f"{slug}: spine vanishing set drift")
    for code in pre_s_all:
        if code in expect_vanish: continue
        post_code = "8.1.4f" if (slug == CS and code == "8.1.1a") else code
        if pre_s_all[code] != post_s_all[post_code]:
            pre_n = next(n for n in pre_s_nodes if n.get("code") == code)
            post_n = next(n for n in s_doc["curriculum"]["nodes"] if n.get("code") == post_code)
            if pre_n.get("family") != "SPEC_POINT": fail(f"{slug}: spine non-point node {code} mutated")
            if code == "8.1.1a" and slug == CS:
                a = {k: v for k, v in pre_n.items() if k not in ("code", "title", "order")}
                b = {k: v for k, v in post_n.items() if k not in ("code", "title", "order")}
                if a != b or post_n["title"] != TITLE_814F: fail(f"{slug}: spine recoded node differs beyond code/title/order")
            else:
                a = {k: v for k, v in pre_n.items() if k != "order"}
                b = {k: v for k, v in post_n.items() if k != "order"}
                if a != b: fail(f"{slug}: spine node {code} mutated beyond the order field")
    gate(f"{slug}:G7-byte-scope", True,
         f"delta == exactly -{len(C['remove'])} nodes/edges"
         + (" + the 8.1.1a->8.1.4f re-code (code/title only)" if slug == CS else "")
         + f" + {len(bumps)} order fields, both planes; zero other bytes")

    # --- index re-census (P5 array truth per 700bb601/kg-corpus) ---
    ip = HUB / "public/kg/data/index.json"
    i_raw = ip.read_text(encoding="utf-8"); i_doc = json.loads(i_raw)
    (di, ti) = detect_dumper(i_raw, i_doc)
    if not di: fail(f"{slug}: index serializer round-trip failed")
    entry = next((c for c in i_doc["courses"] if isinstance(c, dict) and c.get("slug") == slug), None)
    if entry is None: fail(f"{slug}: index entry missing")
    if (entry["counts"]["nodes"], entry["counts"]["edges"], entry["counts"]["specPoints"]) != C["kg_pre"]:
        fail(f"{slug}: index pre-truth {entry['counts']} != the of-record {C['kg_pre']}")
    entry["counts"]["nodes"] = cts["nodes"]
    entry["counts"]["edges"] = cts["edges"]
    entry["counts"]["specPoints"] = cts["specPoints"]
    ip.write_text(di(i_doc, ti), encoding="utf-8")
    gate(f"{slug}:G8-index", True, f"index counts -> {cts['nodes']}n/{cts['edges']}e/{cts['specPoints']}sp (P5 array truth)")

    if C["ugm"]:
        up = HUB / f"content/{slug}/ugm-resources.json"
        if not up.exists():
            fail(f"{slug}: ugm-resources.json expected (run-020 carried the UGM law) but missing")
        head_blob = subprocess.run(["git", "-C", str(REPO), "show", f"{BASE_TIP}:apps/hub/content/{slug}/ugm-resources.json"],
                                   capture_output=True).stdout
        if not head_blob or sha(up.read_bytes()) != sha(head_blob):
            fail(f"{slug}: UGM serve plane mutated (must be byte-identical)")
        gate(f"{slug}:G6-ugm-untouched", True, "ugm-resources.json byte-identical to the base tip of record")

    APPLY_MANIFEST["courses"].append({
        "slug": slug,
        "removedCodes": C["remove"],
        "recode": ({"from": C["recode"][0], "to": C["recode"][1], "after": C["recode"][2],
                    "title": C["recode"][3], "titleSource": "run-017 census subRows[8.1.4f]"} if C["recode"] else None),
        "orderBumps": [{"code": c, "from": v[0], "to": v[1]} for c, v in sorted(bumps.items())],
        "manifest": {"specPoints": {"from": m_from, "to": m_to}},
        "prereqReanchors": {k: list(v) for k, v in (CS_PREREQ if slug == CS else P1_PREREQ).items()},
        "kg": {"from": list(C["kg_pre"]), "to": [cts["nodes"], cts["edges"], cts["specPoints"]]},
        "sha256": {"curriculum": {"pre": sha(raws["curriculum"]), "post": sha(cp.read_bytes())},
                   "spine": {"pre": sha(raws["spine"]), "post": sha(sp.read_bytes())},
                   "kg": {"pre": sha(raws["kg"]), "post": sha(kp.read_bytes())},
                   "manifest": {"pre": sha(raws["manifest"]), "post": sha(mp.read_bytes())}}})

# ---------- 7. zero-residual sweep (the 13 dead codes vanish from every lane plane) ----------
ALL_DEAD = set(CS_REMOVE) | {"8.1.1a"} | set(P1_REMOVE)
RESIDUAL = {}
for slug in (CS, P1A, P1S):
    codes = ALL_DEAD if slug == CS else set(P1_REMOVE)
    targets = [f"content/{slug}"] + [f"spines/{slug}.json", f"public/kg/data/{slug}.json"]
    if slug == CS: targets.append(f"content-maps/{slug}.json")
    for t in targets:
        p = HUB / t
        if not p.exists(): continue
        raw = p.read_text(encoding="utf-8") if p.is_file() else "".join(
            q.read_text(encoding="utf-8") for q in sorted(p.rglob("*.json")))
        nz = {c: n for c in sorted(codes) for n in [len(re.findall(r'"' + re.escape(c) + r'"', raw))] if n}
        if nz: RESIDUAL[t] = nz
if RESIDUAL:
    fail(f"zero-residual sweep RED: {json.dumps(RESIDUAL)[:600]}")
gate("fleet:G-zero-residual", True,
     "all 13 dead codes absent from every lane plane of all 3 courses (content dirs, spines, kg arrays, content-maps); other courses' own 6.3.5 rows untouched (fleet-noop)")

# ---------- 8. write the run artifacts of record ----------
ART.mkdir(parents=True, exist_ok=True)
(ART / "gates_r0.json").write_text(json.dumps(GATES, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(ART / "apply_manifest_r0.json").write_text(json.dumps(APPLY_MANIFEST, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(ART / "rn23_635_split_r0.json").write_text(json.dumps(
    {"artifact": "rn11-run-023-635-split-r0", "generatedUtc": "2026-11-13",
     "law": "the run-022 filing's pre-delegated per-item adjudication, executed; every ruling carries its evidence pin of record (asserted live at apply time) and its disclosed grounds; the U-class is the NO-GUESS drop (candidates named for the desk, never applied)",
     "smeWitness": {"spcpt_NNNzT3vsdXS97q4S": "the upstream SME spec point whose text the corpus cites VERBATIM as official (a) (rn_73mKxFyPvcjk2zKw body citation)",
                    "spcpt_XNYvx8XttSPbzSFg": "the upstream SME spec point for official (b)"},
     "items": split_table}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
(ART / "rn23_repoint_ledger_r0.json").write_text(json.dumps(REPOINT_LEDGER, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print("ALL IN-SCRIPT GATES GREEN — artifacts written")
