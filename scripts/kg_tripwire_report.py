#!/usr/bin/env python3
"""
kg_tripwire_report.py — the F8 telemetry tripwire weekly report (spec phase 2).

Implements tripwire 3 of apps/hub/docs/KG-F8-TELEMETRY-TRIPWIRE-SPEC.md:
one ranked markdown + CSV report per run under
.syllabai/lane-artifacts/T-KG-TRIPWIRE-1/ plus append-only rows to the
review-queue ledger in the same directory.

Inputs (spec section 6):
  (a) T1 aggregated flags        — optional t1-events.json in the lane dir
                                   (kg_prereq_feedback events, spec section 4
                                   schema); absent means Phase 1 has not
                                   shipped and zero events exist.
  (b) T2 differentials           — optional t2-aggregates.json (per edge x
                                   cohort x outcome COUNTS only — I4: codes
                                   only, aggregates only, no per-learner rows).
  (c) structural QA re-run       — the same deterministic laws as
                                   scripts/kg_f8al_qa.py (P1-P6, F8.1-F8.7),
                                   run in COLLECTION mode (violations are
                                   findings, not aborts), plus pre-digraph
                                   cycle detection (Kahn) and the position-
                                   inversion census.
  (d) tier census re-derivation  — re-derived from data every run (never
                                   trusted stale); any UNCLASSIFIED served
                                   pair files a pipeline-defect row
                                   immediately.

Laws this script enforces on ITSELF (binding, fail-closed):
  L1  verdict / reviewer / review_date fields are written BYTE-EMPTY on
      every queue row, every run. A non-empty write aborts before commit.
  L2  the queue ledger is append-only: existing bytes are read, appended
      to, written, re-read and byte-asserted (new == old + appended;
      new.startswith(old)). Existing rows are never edited or removed.
  L3  codes only: the report and queue carry ids, keys, counts and
      statuses — never question text, note bodies, answers or per-learner
      identity (the /api/kg-learner-bridge law, I4).
  L4  no label changes, no verdicts, no dispositions: the script writes
      NOTHING outside the lane dir and the report CSV/MD; content/,
      public/kg/data and labels are read-only to it (I2, I3, I1).
  L5  stdlib only, no new dependencies (spec section 7).

Exit codes: 0 = report produced and queue appended honestly (findings are
the product, not a failure); 2 = internal integrity failure (L1/L2 breach,
unreadable corpus, byte-assert failure).

Usage:
  python3 scripts/kg_tripwire_report.py [--date YYYY-MM-DD] [--lane-dir PATH]

Constants of the method (disclosed in every report): T1 auto-file window
7 days at >= 3 distinct sessions; T2 minimum cohort n = 30 per arm (below
that an edge is insufficient_data, NEVER no_effect); T2 file threshold
|delta first-attempt| >= 0.10 on the web tier, any direction on the
operator-validated control tier (control-anomaly); Wald 95% CI on the
difference of proportions; confounds of spec section 5 are reprinted in
every report that carries a T2 section.
"""

import argparse
import collections
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
HUB = REPO / "apps" / "hub"
DATA = HUB / "public" / "kg" / "data"
CONTENT = HUB / "content"
DEFAULT_LANE = REPO / ".syllabai" / "lane-artifacts" / "T-KG-TRIPWIRE-1"

BASIS_VOCAB = {"DEFINITIONAL_DEPENDENCY", "USED_WITHOUT_RETEACHING"}
T1_VERDICTS = {"WRONG_DIRECTION", "NOT_A_PREREQ", "UNCLEAR"}
T1_WINDOW_DAYS = 7
T1_MIN_SESSIONS = 3
T2_MIN_N = 30
T2_FILE_THRESHOLD = 0.10
TIER_WEB = "AI_SUGGESTED (web)"
TIER_INFERRED = "AI_SUGGESTED (legacy inferred prototype)"
TIER_VALIDATED = "VALIDATED_BY_OPERATOR"

QUEUE_HEADER = (
    "row_id,filed_at,course,a,b,type,tier,signals,evidence_ref,status,"
    "verdict,reviewer,review_date\n"
)


def internal_fail(msg: str):
    print(f"INTERNAL-FAIL: {msg}", file=sys.stderr, flush=True)
    sys.exit(2)


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ----------------------------------------------------------------------------
# corpus load + law sweep (collection mode)
# ----------------------------------------------------------------------------

def load_corpus():
    files = sorted(DATA.glob("*.json"))
    spines = []
    for f in files:
        if f.name == "index.json":
            continue
        try:
            d = json.loads(f.read_text())
        except Exception as exc:
            internal_fail(f"unparseable spine {f.name}: {exc}")
        if isinstance(d, dict) and "nodes" in d and "edges" in d:
            spines.append((f.stem, d))
    if not spines:
        internal_fail("no spine files found")
    index = json.loads((DATA / "index.json").read_text())
    return spines, index


def sweep(spines, index):
    """Run every law in collection mode. Returns (violations, census,
    overlaps, stats, tier_map).

    violations: list of dicts {law, course, detail, pairs|None}
    census: per-tier served-pair counts + overlaps, re-derived
    tier_map: (course, a, b) -> tier string for every served pair
              (the T2 routing lookup; codes-only keys)
    """
    violations = []
    tier_map = {}
    census = collections.Counter()
    overlaps = collections.Counter()
    stats = {
        "courses": 0, "served": 0, "concept_web_edges": 0,
        "web_labeled": 0, "unclassified": 0, "inversions": 0, "cycles": 0,
        "op_validated": 0, "retarget": 0, "legacy_inferred": 0,
    }

    def v(law, course, detail, pairs=None):
        violations.append({"law": law, "course": course, "detail": detail,
                           "pairs": pairs or []})

    reg = {r.get("slug") for r in index.get("courses", [])}
    served_slugs = {s for s, _ in spines}
    orphans, ghosts = served_slugs - reg, reg - served_slugs
    if orphans or ghosts:
        v("P1", "*", f"orphans={sorted(orphans)} ghosts={sorted(ghosts)}")

    for slug, d in spines:
        stats["courses"] += 1
        nodes = {n.get("id") for n in d["nodes"]}
        types = {n.get("id"): n.get("type") for n in d["nodes"]}
        et = collections.Counter(e[2] for e in d["edges"])

        if et.get("hier", 0) != len(d["nodes"]) - 1:
            v("P2", slug, f"hier {et.get('hier', 0)} != nodes-1 {len(d['nodes']) - 1}")
        bad = [e for e in d["edges"] if e[0] not in nodes or e[1] not in nodes]
        if bad:
            v("P3", slug, f"{len(bad)} edges with missing endpoints, e.g. {bad[0]}")
        bad_pre = [e for e in d["edges"] if e[2] == "pre" and (
            types.get(e[0]) != "SpecificationPoint"
            or types.get(e[1]) != "SpecificationPoint")]
        if bad_pre:
            v("P4", slug, f"{len(bad_pre)} pre edges not spec-to-spec, e.g. {bad_pre[0]}")

        served = [(e[0], e[1]) for e in d["edges"] if e[2] == "pre"]
        served_set = set(served)
        stats["served"] += len(served_set)
        seen = set()
        for a, b in served:
            if a == b:
                v("P6", slug, f"self-loop {a}")
            if (a, b) in seen:
                v("P6", slug, f"duplicate pair {a}->{b}")
            if (b, a) in seen:
                v("P6", slug, f"mutual pair {a}<->{b}")
            seen.add((a, b))

        row = next((r for r in index["courses"] if r.get("slug") == slug), None)
        if row is None:
            v("P5", slug, "absent from index.json")
        else:
            c = row.get("counts", {})
            if c.get("nodes") != len(d["nodes"]) or c.get("edges") != len(d["edges"]):
                v("P5", slug, f"index {c} vs served nodes {len(d['nodes'])} edges {len(d['edges'])}")
        mc = d.get("meta", {}).get("counts", {})
        if mc.get("edges") != len(d["edges"]) or mc.get("nodes") != len(d["nodes"]):
            v("P5", slug, f"meta.counts {mc} vs served edges {len(d['edges'])}")
        if mc.get("byEdgeType", {}).get("pre", 0) != et.get("pre", 0):
            v("P5", slug, f"meta.counts.byEdgeType.pre != served {et.get('pre', 0)}")

        # Kahn cycle detection on the served pre digraph
        adj = collections.defaultdict(list)
        indeg = collections.defaultdict(int)
        vs = set()
        for a, b in served_set:
            adj[a].append(b)
            indeg[b] += 1
            vs.add(a)
            vs.add(b)
        q = [x for x in vs if indeg[x] == 0]
        seen_n = 0
        while q:
            x = q.pop()
            seen_n += 1
            for w in adj[x]:
                indeg[w] -= 1
                if indeg[w] == 0:
                    q.append(w)
        if seen_n != len(vs):
            stats["cycles"] += 1
            v("CYCLE", slug, f"pre digraph cycle over {len(vs) - seen_n} nodes")

        ppath = CONTENT / slug / "prerequisites.json"
        if not ppath.exists():
            if served_set:
                v("SNAPSHOT", slug, "served pre edges but no prerequisites.json")
            continue
        pre = json.loads(ppath.read_text())
        if "conceptWebPrerequisiteEdges" not in pre:
            if served_set:
                v("SNAPSHOT", slug, "served pre edges but no web-schema snapshot")
            continue

        pts = [p.get("id") for p in d["points"]]
        order = {p: i for i, p in enumerate(pts)}
        prefix_code = d.get("meta", {}).get("code")
        prefix = f"{prefix_code}-" if isinstance(prefix_code, str) and prefix_code else None

        def res(b):
            if b in order:
                return b
            if prefix and isinstance(b, str) and b.startswith(prefix) and b[len(prefix):] in order:
                return b[len(prefix):]
            return None

        # F8.1 — anchors resolve
        anchors = {}
        unres = []
        for con, binds in pre["conceptAnchors"].items():
            r = [res(b) for b in binds]
            dead = [b for b, x in zip(binds, r) if x is None]
            if not r or dead:
                unres.append((con, dead))
                r = [x for x in r if x is not None]
            anchors[con] = r
        if unres:
            v("F8.1", slug,
              f"{len(unres)} concepts with unresolvable anchor bindings ("
              + "; ".join(f"{c} -> dead {ds}" for c, ds in unres[:4])
              + (f"; +{len(unres) - 4} more" if len(unres) > 4 else "") + ")",
              pairs=[(c, json.dumps(ds)) for c, ds in unres])

        # F8.2 — basis vocabulary; F8.3 — web pair hygiene
        web = set()
        bad_basis, bad_pair = [], []
        seen_pairs = set()
        for e in pre["conceptWebPrerequisiteEdges"]:
            if e["basis"] not in BASIS_VOCAB:
                bad_basis.append(e["basis"])
            k = (e["prerequisite"], e["dependent"])
            if k[0] == k[1] or k in seen_pairs or (k[1], k[0]) in seen_pairs:
                bad_pair.append(k)
            if k[0] not in pre["conceptAnchors"] or k[1] not in pre["conceptAnchors"]:
                bad_pair.append(("unanchored-concept", k))
            seen_pairs.add(k)
            for a in anchors.get(e["prerequisite"], []):
                for b in anchors.get(e["dependent"], []):
                    if a != b and a in order and b in order and order[a] < order[b]:
                        web.add((f"p:{a}", f"p:{b}"))
        if bad_basis:
            v("F8.2", slug, f"{len(bad_basis)} basis values outside store vocabulary")
        if bad_pair:
            v("F8.3", slug, f"{len(bad_pair)} web pair hygiene violations, e.g. {bad_pair[:3]}")
        stats["concept_web_edges"] += len(pre["conceptWebPrerequisiteEdges"])

        # F8.4 — snapshot counts self-consistent
        cnt = pre["counts"]
        c4 = []
        if cnt.get("anchoredConcepts") != len(pre["conceptAnchors"]):
            c4.append("anchoredConcepts")
        if cnt.get("conceptWebEdges") != len(pre["conceptWebPrerequisiteEdges"]):
            c4.append("conceptWebEdges")
        if cnt.get("validatedEdges") != len(pre.get("validatedPrerequisiteEdges", [])):
            c4.append("validatedEdges")
        if cnt.get("inferredPre") != len(pre.get("inferredPrototypePre", [])):
            c4.append("inferredPre")
        if cnt.get("inferredRel") != len(pre.get("inferredPrototypeRel", [])):
            c4.append("inferredRel")
        if c4:
            v("F8.4", slug, f"counts block mismatch: {c4}")

        # legacy layer (mergeOf snapshots only) — the T-C11 operator store.
        # Retarget law (practicalEndpointRetarget disclosure): 12 operator-
        # validated edges carried ad-hoc 4CH1-PR-01..11 endpoints, retargeted
        # in-snapshot to real core-practical spec codes with provenance
        # strings UNTOUCHED — so retarget pairs are identified structurally:
        # a validated edge with any DIRECT (non-concept) endpoint is a
        # retargeted edge; the retarget class is the served pairs whose
        # derivation routes through such an edge. (Reproduces the run-002
        # fail-closed assert exactly: 12 edges -> 6 served pairs, pilot only.)
        legv, legv_concept, legv_direct, inf, ret = set(), set(), set(), set(), set()
        if "mergeOf" in pre:
            for e in pre.get("validatedPrerequisiteEdges", []):
                def leg_ep(x):
                    return anchors.get(x) if x in anchors else [res(x)]
                direct = e["prerequisite"] not in anchors or e["dependent"] not in anchors
                for a in (leg_ep(e["prerequisite"]) or []):
                    for b in (leg_ep(e["dependent"]) or []):
                        if a and b and a != b and a in order and b in order and order[a] < order[b]:
                            legv.add((f"p:{a}", f"p:{b}"))
                            (legv_direct if direct else legv_concept).add((f"p:{a}", f"p:{b}"))
            inf = {(x[0], x[1]) for x in pre.get("inferredPrototypePre", [])}
            ret = legv_direct & served_set
        else:
            if pre.get("validatedPrerequisiteEdges") not in (None, []):
                v("F8.6", slug, "validatedPrerequisiteEdges not empty on a web-schema snapshot")
            if pre.get("inferredPrototypePre") or pre.get("inferredPrototypeRel"):
                v("F8.6", slug, "inferredPrototype lists not empty on a web-schema snapshot")

        # F8.5 — served == calibrated derivation (web UNION legacy layer)
        derived = web | legv | inf
        if derived != served_set:
            extra = sorted(derived - served_set)
            miss = sorted(served_set - derived)
            v("F8.5", slug,
              f"calibration drift: derived {len(derived)} vs served {len(served_set)} "
              f"(sym {len(derived ^ served_set)}); derived-not-served {extra[:6]}; "
              f"served-not-derived {miss[:6]}",
              pairs=[(f"{a}->{b}", "derived-not-served") for a, b in extra]
                    + [(f"{a}->{b}", "served-not-derived") for a, b in miss])

        # F8.6 (merge law) — operator provenance byte-intact on the legacy layer
        if "mergeOf" in pre:
            bad_prov = [e for e in pre.get("validatedPrerequisiteEdges", [])
                        if "validated_by:operator" not in e.get("provenance", "")]
            if bad_prov:
                v("F8.6", slug, f"{len(bad_prov)} legacy validated edges lost operator provenance")
            prov_web = [e for e in pre["conceptWebPrerequisiteEdges"] if "provenance" in e]
            if prov_web:
                v("F8.6", slug, f"{len(prov_web)} web edges carry a provenance field")

        # F8.7 — disclosure present
        pr = d.get("meta", {}).get("prerequisites")
        if not isinstance(pr, dict) or "AI_SUGGESTED" not in json.dumps(pr):
            v("F8.7", slug, "meta.prerequisites disclosure missing or not AI_SUGGESTED")

        # tier census — multi-source membership allowed, re-derived every run.
        # Labels: every operator-store pair is VALIDATED_BY_OPERATOR; the
        # retarget tag marks pairs whose SOLE derivation source is a
        # direct-endpoint (retargeted) validated edge — the of-record
        # 'otherwise-unclassified' class (run-002: exactly 6, pilot only).
        ret_sole = ret - web - inf - legv_concept
        tiers = {p: set() for p in served_set}
        for p in web:
            if p in tiers:
                tiers[p].add(TIER_WEB)
        for p in legv:
            if p in tiers:
                tiers[p].add(TIER_VALIDATED)
        for p in ret_sole:
            if p in tiers:
                tiers[p].add("retarget-sole")
        for p in inf:
            if p in tiers:
                tiers[p].add(TIER_INFERRED)
        unclass = [p for p, t in tiers.items() if not t]
        for p in unclass:
            v("CENSUS", slug, f"UNCLASSIFIED served pair {p} — files pipeline-defect row",
              pairs=[(f"{p[0]}->{p[1]}", "unclassified")])
        stats["unclassified"] += len(unclass)
        for t in tiers.values():
            if TIER_WEB in t:
                census[TIER_WEB] += 1
            if TIER_VALIDATED in t:
                census[TIER_VALIDATED] += 1
            if "retarget-sole" in t:
                census["retarget_sole"] += 1
            if TIER_INFERRED in t:
                census[TIER_INFERRED] += 1
        for p, t in tiers.items():
            tier_map[(slug, p[0], p[1])] = (
                TIER_VALIDATED if TIER_VALIDATED in t
                else TIER_INFERRED if TIER_INFERRED in t
                else TIER_WEB if TIER_WEB in t else "")
        stats["web_labeled"] += sum(1 for t in tiers.values() if TIER_WEB in t)
        stats["op_validated"] += sum(1 for t in tiers.values() if TIER_VALIDATED in t)
        stats["retarget"] += sum(1 for t in tiers.values() if "retarget-sole" in t)
        stats["legacy_inferred"] += sum(1 for t in tiers.values() if TIER_INFERRED in t)
        overlaps["validated∩web"] += sum(1 for t in tiers.values()
                                         if TIER_WEB in t and TIER_VALIDATED in t)
        overlaps["inferred∩web"] += sum(1 for t in tiers.values()
                                        if TIER_WEB in t and TIER_INFERRED in t)
        overlaps["inferred∩validated"] += sum(1 for t in tiers.values()
                                              if TIER_INFERRED in t and TIER_VALIDATED in t)
        overlaps["retarget-routed-through (multi-source, not sole)"] += len(
            (ret & served_set) - ret_sole)

        # position inversion cohort (soft; own section of the report)
        inv = [(a, b) for (a, b) in served_set
               if order.get(a[2:], 10 ** 9) > order.get(b[2:], 10 ** 9)]
        if inv:
            stats["inversions"] += len(inv)
            v("INVERSION", slug, f"{len(inv)} served pre pairs inverted vs spine order, e.g. {inv[:4]}",
              pairs=[(f"{a}->{b}", "position-inversion") for a, b in inv])

    return violations, census, overlaps, stats, tier_map


# ----------------------------------------------------------------------------
# T1 aggregation (spec section 4)
# ----------------------------------------------------------------------------

def parse_ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def t1_aggregate(lane: Path):
    """Aggregate kg_prereq_feedback events. Returns (auto_file, longtail,
    malformed, n_events). auto_file entries carry the qualifying events for
    their evidence bundles."""
    path = lane / "t1-events.json"
    if not path.exists():
        return [], [], 0, 0
    try:
        events = json.loads(path.read_text())
    except Exception as exc:
        internal_fail(f"t1-events.json unparseable: {exc}")
    auto_file, longtail, malformed = [], [], 0
    by_key = collections.defaultdict(list)
    for ev in events:
        if not isinstance(ev, dict) or ev.get("event") != "kg_prereq_feedback" \
                or not ev.get("course") or not ev.get("a") or not ev.get("b") \
                or ev.get("type") != "pre" or ev.get("verdict") not in T1_VERDICTS \
                or not ev.get("session") or parse_ts(ev.get("ts", "")) is None \
                or len(ev.get("free_text", "")) > 280:
            malformed += 1
            continue
        by_key[(ev["course"], ev["a"], ev["b"], ev["type"])].append(ev)
    for key, evs in sorted(by_key.items()):
        evs.sort(key=lambda e: parse_ts(e["ts"]))
        latest = parse_ts(evs[-1]["ts"])
        window = [e for e in evs
                  if latest - parse_ts(e["ts"]) <= timedelta(days=T1_WINDOW_DAYS)]
        sessions = {e["session"] for e in window}
        if len(sessions) >= T1_MIN_SESSIONS:
            auto_file.append((key, evs, len(sessions)))
        else:
            longtail.append((key, evs, len(sessions)))
    return auto_file, longtail, malformed, len(events)


# ----------------------------------------------------------------------------
# T2 differential (spec section 5) — aggregates only (I4)
# ----------------------------------------------------------------------------

def _wald(p1, n1, p2, n2):
    import math
    se = math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
    return 1.96 * se if se > 0 else float("inf")


def t2_differential(lane: Path, tier_of_pair):
    """Compute the skip-vs-non-skip differential from aggregate counts.

    Input schema (t2-aggregates.json, codes-only): a JSON array of
      {"course","a","b","type","cohort":"skip"|"non_skip","n",
       "first_attempt_correct","eventual_correct","reattempt_total"}
    Rows below n>=30 in EITHER arm are insufficient_data — never no_effect.
    Returns (computed, insufficient, calibration_rows, under_powered).
    """
    path = lane / "t2-aggregates.json"
    if not path.exists():
        return [], 0, [], False
    try:
        rows = json.loads(path.read_text())
    except Exception as exc:
        internal_fail(f"t2-aggregates.json unparseable: {exc}")
    by_key = collections.defaultdict(dict)
    for r in rows:
        by_key[(r["course"], r["a"], r["b"], r["type"])][r["cohort"]] = r
    computed, insufficient, calibration = [], [], []
    for key, arms in sorted(by_key.items()):
        sk, ns = arms.get("skip"), arms.get("non_skip")
        if not sk or not ns or sk["n"] < T2_MIN_N or ns["n"] < T2_MIN_N:
            insufficient += 1
            continue
        p1 = sk["first_attempt_correct"] / sk["n"]
        p2 = ns["first_attempt_correct"] / ns["n"]
        delta = p1 - p2
        ci = _wald(p1, sk["n"], p2, ns["n"])
        row = {
            "course": key[0], "a": key[1], "b": key[2], "type": key[3],
            "n_skip": sk["n"], "n_non_skip": ns["n"],
            "delta_first_attempt": round(delta, 4),
            "ci95": round(ci, 4),
            "tier": tier_of_pair.get((key[0], key[1], key[2]), ""),
        }
        computed.append(row)
        if row["tier"] == TIER_VALIDATED:
            calibration.append(row)
    under_powered = bool(calibration) and all(
        abs(r["delta_first_attempt"]) < T2_FILE_THRESHOLD for r in calibration)
    return computed, insufficient, calibration, under_powered


# ----------------------------------------------------------------------------
# queue ledger (append-only, byte-asserted; L1/L2)
# ----------------------------------------------------------------------------

def append_queue_rows(lane: Path, rows):
    """Append rows to review-queue.csv. Byte-asserts append-only + the
    empty-verdict law. Returns (appended_rows, byte_assert_note)."""
    qpath = lane / "review-queue.csv"
    old = qpath.read_bytes() if qpath.exists() else b""
    if not old:
        appended = QUEUE_HEADER.encode()
    else:
        appended = b""
    out_rows = []
    for r in rows:
        # L1 — verdict fields byte-empty, enforced at the write boundary
        if r["verdict"] != "" or r["reviewer"] != "" or r["review_date"] != "":
            internal_fail("L1 breach: non-empty verdict/reviewer/review_date")
        line = ",".join(_csv_cell(r[k]) for k in (
            "row_id", "filed_at", "course", "a", "b", "type", "tier",
            "signals", "evidence_ref", "status", "verdict", "reviewer",
            "review_date")) + "\n"
        appended += line.encode()
        out_rows.append(r)
    new = old + appended
    if old and not new.startswith(old):
        internal_fail("L2 breach: existing queue bytes would change")
    qpath.write_bytes(new)
    back = qpath.read_bytes()
    if back != new or len(back) != len(old) + len(appended):
        internal_fail("L2 breach: byte assert failed after write")
    note = (f"ledger bytes {len(old)} -> {len(back)} "
            f"(+{len(appended)}); append-only assert PASS")
    return out_rows, note


def _csv_cell(v):
    v = str(v)
    if any(ch in v for ch in ",\"\n"):
        return '"' + v.replace('"', '""') + '"'
    return v


def existing_open_keys(lane: Path):
    """Signatures of OPEN rows already in the ledger. The queue is a work
    queue, not a log: a violation with an OPEN row is NOT re-filed by later
    runs (the row stays OPEN until a human disposition); a REVIEWED row
    does not block re-filing — a regression after review is new evidence.
    Key shapes: ('qa', course, law) | ('t1'|'t2', course, a, b, type)."""
    q = lane / "review-queue.csv"
    if not q.exists():
        return set(), 0
    import csv as _csv
    open_keys, reviewed = set(), 0
    for row in _csv.DictReader(q.read_text().splitlines()):
        sig = row.get("signals", "")
        if sig.startswith("QA:"):
            key = ("qa", row.get("course", ""), sig[3:].split(" ")[0])
        elif sig.startswith("T1:"):
            key = ("t1", row.get("course", ""), row.get("a", ""),
                   row.get("b", ""), row.get("type", ""))
        elif sig.startswith("T2:"):
            key = ("t2", row.get("course", ""), row.get("a", ""),
                   row.get("b", ""), row.get("type", ""))
        else:
            continue
        if row.get("status") == "OPEN":
            open_keys.add(key)
        elif row.get("status") == "REVIEWED":
            reviewed += 1
    return open_keys, reviewed


# ----------------------------------------------------------------------------
# report rendering
# ----------------------------------------------------------------------------

def render_markdown(run_date, now, violations, census, overlaps, stats,
                    t1, t2, filed_rows, byte_note, lane):
    auto1, tail1, mal1, n_ev1 = t1
    comp2, insuff2, calib2, under2 = t2
    by_law = collections.Counter(x["law"] for x in violations)
    L = []
    A = L.append
    A(f"# KG-F8 tripwire weekly report — {run_date}")
    A("")
    A(f"**Run (UTC):** {now} · **Lane:** T-KG-TRIPWIRE-1 · **Script:** "
      f"`scripts/kg_tripwire_report.py` (spec phase 2) · **Inputs:** corpus "
      f"({stats['courses']} spines) + "
      f"{'t1-events.json' if n_ev1 else 'T1 input ABSENT (phase 1 affordance not shipped; zero events exist)'} + "
      f"{'t2-aggregates.json' if (comp2 or insuff2) else 'T2 input ABSENT (no telemetry store yet; every edge insufficient_data)'}")
    A("")
    A("Learner signals are evidence, not verdicts. Nothing here changes a "
      "label, a serving decision or a queue row's verdict fields (I1-I3). "
      "Progress is never throttled by this report (I3).")
    A("")

    A("## 1. Queue actions this run")
    A("")
    if filed_rows:
        A(f"{len(filed_rows)} row(s) appended to `review-queue.csv` "
          f"(append-only, {byte_note}):")
        A("")
        A("| row_id | course | signals | priority |")
        A("|---|---|---|---|")
        for r in filed_rows:
            A(f"| {r['row_id']} | {r['course']} | {r['signals']} | {r.get('priority', '-')} |")
    else:
        A("0 rows filed — no auto-filing condition fired "
          "(no T1 events, no T2 aggregates, no QA violations, census clean).")
    A("")
    try:
        lane_disp = lane.relative_to(REPO)
    except ValueError:
        lane_disp = lane
    A(f"Queue ledger state after run: `{lane_disp / 'review-queue.csv'}` — "
      f"{_queue_len(lane)} row(s) of record, verdict/reviewer/review_date "
      f"byte-empty on every row (L1 asserted at the write boundary).")
    A("")

    A("## 2. Structural QA re-run (the deterministic laws of record)")
    A("")
    A("Same deterministic law set as the corpus sweeps of record "
      "(`scripts/kg_f8al_qa.py`: P1-P6, F8.1-F8.7) plus pre-digraph cycle "
      "detection and the position-inversion census — run in collection "
      "mode so one violation does not hide the rest.")
    A("")
    if violations:
        A(f"**{len(violations)} violation(s) across "
          f"{len({x['course'] for x in violations})} course(s).** Ranked; each "
          f"auto-files an OPEN queue row (highest priority, blocks nothing "
          f"— I3).")
        A("")
        for x in violations:
            A(f"- **[{x['law']}] {x['course']}** — {x['detail']}")
    else:
        A("0 violations — every law ACCEPT.")
    A("")
    A(f"Cycle census: {stats['cycles']} course(s) with pre-digraph cycles. "
      f"Position-inversion cohort: {stats['inversions']} served pair(s) "
      f"(soft signal; reported in its own section below when non-zero).")
    A("")

    A("## 3. Tier census — re-derived from data this run")
    A("")
    A("Never trusted stale; the classification is the F8.5 derivation "
      "itself (web export ∪ legacy derivation), multi-source membership "
      "allowed and disclosed:")
    A("")
    A("| tier | served pairs |")
    A("|---|---|")
    A(f"| {TIER_WEB} | {census[TIER_WEB]} |")
    A(f"| {TIER_VALIDATED} — concept-derived | {census[TIER_VALIDATED] - census.get('retarget_sole', 0)} |")
    A(f"| {TIER_VALIDATED} — practical-endpoint retarget (sole derivation) | {census.get('retarget_sole', 0)} |")
    A(f"| {TIER_VALIDATED} — total | {census[TIER_VALIDATED]} |")
    A(f"| {TIER_INFERRED} | {census[TIER_INFERRED]} |")
    A(f"| UNCLASSIFIED | {stats['unclassified']} (fail-closed law: any row files immediately) |")
    A("")
    A(f"Overlaps (multi-source): {dict(overlaps) if overlaps else 'none'}. "
      f"Served pre total: **{stats['served']}** across {stats['courses']} "
      f"courses; concept-level web edges: {stats['concept_web_edges']}.")
    A("")

    A("## 4. Tripwire 1 — thumbs-down aggregation")
    A("")
    if n_ev1 == 0:
        A("Input absent: the T1 affordance ships in spec phase 1, which has "
          "not landed — zero `kg_prereq_feedback` events exist anywhere. "
          "0 auto-filed, 0 long-tail. This section is the honest empty "
          "state, not a clean bill of health.")
    else:
        A(f"{n_ev1} event(s) read ({mal1} malformed, excluded and "
          f"disclosed). {len(auto1)} edge key(s) qualify for auto-filing "
          f"(>= {T1_MIN_SESSIONS} distinct sessions in a rolling "
          f"{T1_WINDOW_DAYS}-day window); {len(tail1)} sit in the long "
          f"tail (visible, weighted, not auto-filed).")
        for key, evs, nsess in auto1:
            A(f"- AUTO-FILE `{key[0]}` {key[1]} -> {key[2]} — "
              f"{len(evs)} events, {nsess} distinct sessions")
        for key, evs, nsess in tail1[:20]:
            A(f"- long-tail `{key[0]}` {key[1]} -> {key[2]} — "
              f"{len(evs)} events, {nsess} sessions")
    A("")

    A("## 5. Tripwire 2 — prereq-skip vs downstream differential")
    A("")
    if not (comp2 or insuff2):
        A("Input absent: no telemetry store exists yet, so every edge is "
          f"`insufficient_data` (below the n >= {T2_MIN_N} law in both "
          "arms). Below minimum n an edge is never reported `no_effect` — "
          "coverage asymmetry means tail points may sit below minimum n "
          "for months (spec section 5, confound 2).")
        A("")
        A(f"**Calibration cohort (operator-validated tier):** no aggregates "
          "to compute — the control cohort's differential is "
          "`insufficient_data` corpus-wide. Per the spec's own honesty law: "
          "a tripwire that cannot yet detect the known dependencies cannot "
          "be trusted to exonerate the AI tier; the metric is **under-"
          "powered at this coverage**, and this section says so rather "
          "than claiming exoneration.")
    else:
        A(f"{len(comp2)} edge(s) computed at n >= {T2_MIN_N} both arms; "
          f"{insuff2} insufficient_data. Effect sizes carry Wald 95% CIs "
          "and cohort sizes — never a bare verdict word (confound 1: "
          "self-selection — students who skip may be the stronger "
          "students; a positive skip delta can mean the edge is noise OR "
          "that only confident students dare skip).")
        web_rows = [r for r in comp2 if r["tier"] == TIER_WEB]
        for r in sorted(web_rows, key=lambda r: -abs(r["delta_first_attempt"])):
            A(f"- `{r['course']}` {r['a']} -> {r['b']} — delta "
              f"{r['delta_first_attempt']:+.2%} "
              f"[+-{r['ci95']:.2%}] "
              f"(n {r['n_skip']} vs {r['n_non_skip']}, {r['tier']})")
        A("")
        A(f"**Calibration cohort (operator-validated tier):** "
          f"{len(calib2)} computed. "
          + ("No signal at scale on the known-good tier — the metric is "
             "under-powered; it cannot yet be trusted to exonerate the AI "
             "tier (spec section 5, confound 3)." if under2 else
             "control-anomaly rows filed per the routing table."))
        for r in calib2:
            A(f"- control `{r['course']}` {r['a']} -> {r['b']} — delta "
              f"{r['delta_first_attempt']:+.2%} [+-{r['ci95']:.2%}] "
              f"(n {r['n_skip']} vs {r['n_non_skip']})")
    A("")

    inv = [x for x in violations if x["law"] == "INVERSION"]
    A("## 6. Position-inversion cohort")
    A("")
    if inv:
        for x in inv:
            A(f"- **{x['course']}** — {x['detail']}")
        A("")
        A("These are the likeliest genuine errors if any ever appear "
          "(spec section 5, confound 4); each is queue-filed.")
    else:
        A("0 served pre pairs sit inverted vs their spine's points[] order "
          "(the 2026-11-07 of-record state holds).")
    A("")

    A("## 7. Method and constants of this run")
    A("")
    A(f"- T1 auto-file: >= {T1_MIN_SESSIONS} distinct sessions on one edge "
      f"key within a rolling {T1_WINDOW_DAYS}-day window; long-tail below.")
    A(f"- T2 minimum cohort: n >= {T2_MIN_N} per arm, else "
      f"`insufficient_data` (never `no_effect`).")
    A(f"- T2 file threshold: |delta first-attempt| >= {T2_FILE_THRESHOLD:.2f} "
      "on the web tier (either direction — pruning evidence files too); "
      "any direction on the operator-validated tier files "
      "`control-anomaly`.")
    A("- CI: Wald 95% on the difference of proportions (disclosed "
      "approximation).")
    A("- Confounds carried by every report that carries a T2 section "
      "(spec section 5): (1) self-selection — students who skip may be "
      "the stronger students, so a positive skip delta can mean the edge "
      "is noise OR that only confident students dare skip; effect sizes "
      "ship with CI + cohort sizes, never a bare verdict word; "
      "(2) coverage asymmetry — popular points accrue cohorts fast, tail "
      "points may sit below minimum n for months, so below the n law an "
      "edge is `insufficient_data`, never `no_effect`; (3) calibration "
      "cohort — the differential is computed over the operator-validated "
      "tier too, and no signal at scale on that known-good tier means the "
      "metric is under-powered, not that the AI tier is exonerated; "
      "(4) position-inversion cohort — inverted pairs are the likeliest "
      "genuine errors and are reported in their own section.")
    A("- Queue routing per spec section 6: QA violation -> OPEN, highest "
      "priority; UNCLASSIFIED -> OPEN, `pipeline-defect`; T1 window -> "
      "OPEN with evidence bundle; T2 web below threshold at n>=30 -> OPEN; "
      "T2 control-tier -> OPEN, `control-anomaly`. Long-tail T1 waits for "
      "human pull.")
    A("- This report writes nothing outside the lane directory and its own "
      "report files; `prereqValidated` stays EMPTY; no verdict field is "
      "ever written by this script (L1-L4).")
    A("")
    return "\n".join(L) + "\n"


def _queue_len(lane: Path) -> int:
    q = lane / "review-queue.csv"
    if not q.exists():
        return 0
    return max(0, len(q.read_text().splitlines()) - 1)


def render_csv(violations, filed_rows, t1, t2, stats):
    auto1, tail1, mal1, n_ev1 = t1
    comp2, insuff2, calib2, under2 = t2
    out = ["class,course,law,subject,detail,priority,action"]
    # unclassified pairs already surface as CENSUS violations above
    for x in violations:
        pri = "highest" if x["law"] in ("CYCLE", "P1", "P2", "P3", "P4", "P5", "P6", "F8.1", "F8.2", "F8.3", "F8.4", "F8.5", "F8.6", "F8.7", "SNAPSHOT") else "high"
        out.append(_csv_cell("qa_violation") + "," + _csv_cell(x["course"]) + "," +
                    _csv_cell(x["law"]) + "," + _csv_cell("") + "," +
                    _csv_cell(x["detail"]) + "," + _csv_cell(pri) + "," +
                    _csv_cell("queue-filed"))
    for key, evs, nsess in auto1:
        out.append(_csv_cell("t1_auto_file") + "," + _csv_cell(key[0]) + ",T1," +
                    _csv_cell(f"{key[1]}->{key[2]}") + "," +
                    _csv_cell(f"{len(evs)} events / {nsess} sessions in window") + "," +
                    _csv_cell("high") + "," + _csv_cell("queue-filed"))
    for key, evs, nsess in tail1:
        out.append(_csv_cell("t1_longtail") + "," + _csv_cell(key[0]) + ",T1," +
                    _csv_cell(f"{key[1]}->{key[2]}") + "," +
                    _csv_cell(f"{len(evs)} events / {nsess} sessions (below window law)") + "," +
                    _csv_cell("low") + "," + _csv_cell("long-tail"))
    for r in comp2:
        act = "queue-filed" if (r["tier"] == TIER_VALIDATED or
                                abs(r["delta_first_attempt"]) >= T2_FILE_THRESHOLD) else "listed"
        out.append(_csv_cell("t2_differential") + "," + _csv_cell(r["course"]) + ",T2," +
                    _csv_cell(f"{r['a']}->{r['b']}") + "," +
                    _csv_cell(f"delta {r['delta_first_attempt']:+.4f} ci95 {r['ci95']:.4f} "
                              f"n {r['n_skip']}/{r['n_non_skip']} tier {r['tier']}") + "," +
                    _csv_cell("high" if r["tier"] == TIER_VALIDATED else "medium") + "," +
                    _csv_cell(act))
    if insuff2:
        out.append(_csv_cell("t2_insufficient") + ",*,T2,," +
                    _csv_cell(f"{insuff2} edge(s) below n>={T2_MIN_N} — insufficient_data, never no_effect") + "," +
                    _csv_cell("-") + "," + _csv_cell("disclosed"))
    return "\n".join(out) + "\n"


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    ap.add_argument("--lane-dir", default=str(DEFAULT_LANE))
    args = ap.parse_args()
    lane = Path(args.lane_dir)
    lane.mkdir(parents=True, exist_ok=True)
    (lane / "evidence").mkdir(exist_ok=True)
    now = iso_now()

    spines, index = load_corpus()
    violations, census, overlaps, stats, tier_map = sweep(spines, index)

    t1 = t1_aggregate(lane)
    t2 = t2_differential(lane, tier_map)
    auto1, tail1, mal1, n_ev1 = t1

    # ---- rows to file -----------------------------------------------------
    seq = 0

    def next_id():
        nonlocal seq
        seq += 1
        stamp = args.date.replace("-", "")
        return f"TRIP-{stamp}-{seq:03d}"

    # Routing per spec section 6. QA violations and T1 window hits carry an
    # evidence bundle; row_id <-> evidence naming is assigned in one pass.
    pending = []
    for x in violations:
        pending.append(("qa", x, "highest" if x["law"] != "INVERSION" else "high"))
    for key, evs, nsess in auto1:
        pending.append(("t1", (key, evs, nsess), "high"))
    for r in t2[0]:
        if r["tier"] == TIER_VALIDATED:
            pending.append(("t2-control", r, "high"))
        elif r["tier"] == TIER_WEB and abs(r["delta_first_attempt"]) >= T2_FILE_THRESHOLD:
            pending.append(("t2-web", r, "medium"))

    open_keys, reviewed_count = existing_open_keys(lane)
    skipped_open = []
    filtered = []
    for item in pending:
        kind, payload, pri = item
        if kind == "t1":
            key = payload[0]
            dk = ("t1", key[0], key[1], key[2], key[3])
        elif kind == "qa":
            dk = ("qa", payload["course"], payload["law"])
        else:
            dk = ("t2", payload["course"], payload["a"], payload["b"], payload["type"])
        if dk in open_keys:
            skipped_open.append(dk)
        else:
            filtered.append(item)
    pending = filtered

    qa_rows = []
    for kind, payload, pri in pending:
        rid = next_id()
        if kind == "qa":
            x = payload
            ev_name = f"evidence/{rid}.json"
            (lane / ev_name).write_text(json.dumps({
                "row_id": rid, "law": x["law"], "course": x["course"],
                "detail": x["detail"], "pairs": x["pairs"],
                "generated_utc": now,
            }, indent=2) + "\n")
            qa_rows.append({
                "row_id": rid, "filed_at": now, "course": x["course"],
                "a": "", "b": "", "type": "", "tier": "",
                "signals": f"QA:{x['law']} — {x['detail'][:180]}",
                "evidence_ref": ev_name, "status": "OPEN",
                "verdict": "", "reviewer": "", "review_date": "",
                "priority": pri,
            })
        elif kind == "t1":
            (key, evs, nsess) = payload
            ev_name = f"evidence/{rid}.json"
            (lane / ev_name).write_text(json.dumps({
                "row_id": rid, "edge_key": {"course": key[0], "a": key[1],
                                            "b": key[2], "type": key[3]},
                "distinct_sessions": nsess, "events": evs,
                "generated_utc": now,
            }, indent=2) + "\n")
            qa_rows.append({
                "row_id": rid, "filed_at": now, "course": key[0],
                "a": key[1], "b": key[2], "type": key[3],
                "tier": "", "signals": f"T1:{len(evs)} events / {nsess} distinct sessions in {T1_WINDOW_DAYS}d window",
                "evidence_ref": ev_name, "status": "OPEN",
                "verdict": "", "reviewer": "", "review_date": "",
                "priority": pri,
            })
        else:
            r = payload
            tag = "control-anomaly" if kind == "t2-control" else "review-priority"
            qa_rows.append({
                "row_id": rid, "filed_at": now, "course": r["course"],
                "a": r["a"], "b": r["b"], "type": r["type"],
                "tier": r["tier"],
                "signals": f"T2:{tag} delta {r['delta_first_attempt']:+.4f} ci95 {r['ci95']:.4f} n {r['n_skip']}/{r['n_non_skip']}",
                "evidence_ref": "", "status": "OPEN",
                "verdict": "", "reviewer": "", "review_date": "",
                "priority": pri,
            })

    filed, byte_note = append_queue_rows(lane, qa_rows)
    if skipped_open:
        byte_note += (f"; {len(skipped_open)} finding(s) already OPEN in the "
                      f"ledger — not re-filed ({reviewed_count} REVIEWED rows of record)")

    md = render_markdown(args.date, now, violations, census, overlaps, stats,
                         t1, t2, filed, byte_note, lane)
    csv_body = render_csv(violations, filed, t1, t2, stats)

    (lane / f"weekly-report-{args.date}.md").write_text(md)
    (lane / f"weekly-report-{args.date}.csv").write_text(csv_body)

    print(f"tripwire run {args.date}: served={stats['served']} "
          f"courses={stats['courses']} violations={len(violations)} "
          f"unclassified={stats['unclassified']} "
          f"queue_rows_filed={len(filed)}")
    print(f"  census: web={census[TIER_WEB]} validated={census[TIER_VALIDATED]} "
          f"(retarget-sole {census.get('retarget_sole', 0)}) "
          f"inferred={census[TIER_INFERRED]} unclassified={stats['unclassified']}")
    print(f"  queue: {byte_note}")
    print(f"  report: {lane / ('weekly-report-' + args.date + '.md')}")
    for x in violations:
        print(f"  [{x['law']}] {x['course']}: {x['detail'][:150]}")


if __name__ == "__main__":
    main()
