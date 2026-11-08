# KG-F8 telemetry tripwire spec — learner signals as the scalable validator for the AI_SUGGESTED pre tier

**Date:** 2026-11-08 · **Lane:** T-KG-TRIPWIRE-1 run-001 · **Status:** SPEC — drafted, not yet
implemented (nothing in this document changes code, data or labels) · **Author:** the F8
engineering agent (AI-drafted; a proposal for operator adoption, not a validated design —
the operator's adoption IS the validation event for the spec itself) · **Companion docs:**
`KG-F8-PILOT-FIT.md` (the fit gate that preceded the rollout), `TC11_ANCHOR_EVIDENCE_PASS.md`
(the operator-validated store this tier must never impersonate)

---

## 1. The problem this spec solves

The F8 rollout shipped 20,369 AI-suggested prerequisite edges across 106 web courses
(`public/kg/data/<slug>.json`, edge type `pre`). Serving was deliberately **decoupled from
validation**: the edges went live with honest `AI_SUGGESTED` / `UNVALIDATED` labels, and the
only gate that shipped them was deterministic structural QA (cycle / self-loop / dangling /
duplicate / orphan / position checks — corpus-wide sweep 2026-11-07: 106/106 spines,
20,369/20,369 edges reconciled, 0 hard violations, 0 soft flags).

What remains open is **content-level validation**: is each edge semantically right? The SME
validation pass (the named gate in `KG-F8-PILOT-FIT.md`) is the gold standard, but subject
matter experts are not available at 20,369-edge scale, and throttling serving on their queue
was explicitly rejected. This spec names the only population that scales: **the learners
themselves.** Three tripwires convert reading behaviour into review-queue candidates:

1. **Thumbs-down** on a prerequisite affordance (direct signal).
2. **Prereq-skip vs downstream differential** (behavioural signal — does skipping the
   prerequisite hurt performance on the dependent point?).
3. **Weekly anomaly report** (aggregation — turns the two signals above plus the structural
   QA re-run into a ranked, human-workable queue).

The design goal is the one the operator already fixed: **progress is never throttled, and the
human queue may wait forever.** Telemetry adds candidates to a queue; it never gates serving.

## 2. Binding invariants — what telemetry may never do

These are laws, not preferences. A tripwire implementation that violates any of them must be
treated as broken regardless of its metrics.

| # | Invariant | Rationale |
|---|-----------|-----------|
| I1 | **No auto-disposition.** Tripwires produce queue candidates + evidence bundles. Only a human reviewer may write CONFIRM / REJECT / AMEND (+ reviewer + review_date). | The verdict vocabulary belongs to the SME pass (`KG-F8-PILOT-FIT.md`); an agent writing verdicts would be self-validation with extra steps. |
| I2 | **No label changes.** `prereqValidated` stays EMPTY. AI edges keep `AI_SUGGESTED` / `UNVALIDATED`. No telemetry signal upgrades, downgrades or strips an edge's status. | Learners are witnesses, not validators. 100 thumbs-down do not make an edge `VALIDATED_BY_OPERATOR`. |
| I3 | **No serving gate.** Edge serving, course publishing and learner progress never depend on tripwire state, queue depth or review status. | The operator's standing directive: do not throttle progress. |
| I4 | **Codes only across the boundary.** Tripwire payloads carry spec-point ids, edge endpoints and outcome aggregates — never question text, note bodies, answers, or per-learner identity. | Extends the existing `/api/kg-learner-bridge` law verbatim. |
| I5 | **Append-only queue.** Review-queue rows are appended, never deleted; a reviewed row keeps its evidence forever. Disposition is a state transition, not an edit. | The queue is the audit trail; deletions would destroy the evidence chain. |

## 3. The object of monitoring — edge identity and the tier census

Every tripwire fires against a **served edge key**:

```
(course_slug, a, b, type="pre")     — a,b are p:-prefixed point ids exactly as served
```

joined at report time to `apps/hub/content/<slug>/prerequisites.json`
(`conceptWebPrerequisiteEdges`) for status, basis and provenance. Edge keys must be reported
byte-faithfully to the served spine — the join key law that cost this lane a false-ALARM
sweep once already (p:-prefixed edge endpoints vs bare point ids) applies here too.

**Tier census of the 20,369 served pairs** (basis of the watchlist):

| Tier | Status label | Approx. pairs | Tripwire posture |
|------|-------------|---------------|------------------|
| Operator-validated expansion (T-C11 legacy store, anchors-projected) | `VALIDATED_BY_OPERATOR` | ~11k of 20,369 | **Control cohort.** Watched, but never suspicious by tier; used to calibrate tripwire sensitivity (§5). |
| Legacy inferred prototype | `AI_SUGGESTED (legacy inferred prototype)` | remainder | Watchlist. |
| AI web tier (traceable to AI-generated web edges) | `AI_SUGGESTED (web)` | 9,072 (the WEB-REVIEW sheet of the SME package) | **Primary watchlist.** |
| Unclassified | — | 0, enforced fail-closed | Any UNCLASSIFIED row is itself an anomaly and files a queue row. |

Exact per-tier counts ship in the SME review package (`SHIPPED-EDGES` sheet) and are
re-derived by the weekly report script each run — the report must never trust a stale census.

## 4. Tripwire 1 — thumbs-down on the prerequisite affordance

**Surface.** Clicking an edge in `/knowledge-graph` (and the `/graph-explorer` build lab)
already opens a relationship explainer + provenance drawer. That drawer gains a
**"This prerequisite seems wrong"** affordance on `pre` edges whose rendered tier is
`AI_SUGGESTED` (the provenance panel already labels the tier — the affordance simply keys off
the same field). Operator-validated edges render the affordance too (learners can be right
about those as well) but the queue routing differs (§6).

**Event schema.**

```json
{
  "event": "kg_prereq_feedback",
  "course": "<slug>",
  "a": "p:3.4.1", "b": "p:3.4.2", "type": "pre",
  "rendered_tier": "AI_SUGGESTED (web)",
  "verdict": "WRONG_DIRECTION | NOT_A_PREREQ | UNCLEAR",
  "free_text": "optional, learner-typed, capped at 280 chars",
  "ts": "<iso8601>",
  "session": "<random per-browser id, no account link>"
}
```

**Semantics.** One thumbs-down is a **signal, not a verdict** (I1/I2). Its only power is
aggregation: ≥3 distinct `session` ids flagging the same edge key within a rolling 7-day
window auto-files a queue row with the evidence bundle (all raw events for the key).
Fewer than 3 distinct sessions: the events sit in local storage and surface in the weekly
report's long-tail section — visible, weighted, but not auto-filed.

**Honest disclosure in UI copy.** The affordance's own tooltip must say the signal is
reviewed by humans and does not change the graph immediately — matching the footnote's
existing honesty register ("the provenance panel labels each tier").

**Out of scope for v1:** "suggest a missing prerequisite" (free-edge authoring by learners).
It is a different trust problem (content injection) and gets its own spec if wanted.

## 5. Tripwire 2 — prereq-skip vs downstream differential

The behavioural tripwire. For a served edge `(a → b, pre)`, define:

- **Dependent event:** the learner first practises or completes point `b` (existing
  browser-local progress store already records events against content ids; the
  kg-learner-bridge join to spec points exists and is codes-only).
- **Skip:** the dependent event occurs while **no** card of point `a` was ever opened in
  that course by that learner before the dependent event. (Per-prerequisite, per-learner,
  course-local window. A learner who opened `a` later is still a skip as of `b`'s event.)
- **Differential for the edge:** downstream outcomes on `b` — first-attempt correctness,
  eventual correctness, reattempt count — compared between the skip cohort and the
  non-skip cohort, aggregated across all learners of the course.

**Reading direction.** A web-tier edge that adds no value shows ~no delta (skippers do as
well as openers). An edge that guards a real dependency shows skippers underperforming.
**Either result is useful**: the first prunes review-priority, the second raises it — and
both feed the same queue, never an automatic action.

**Confounds this tripwire must state honestly in every report:**

1. **Self-selection.** Students who skip prerequisites may be the stronger students; a
   positive delta for skippers could mean the edge is noise *or* that only confident
   students dare skip. The report must publish effect size with a confidence interval and
   the cohort sizes, never a bare verdict word.
2. **Coverage asymmetry.** Popular points accrue cohorts fast; tail points may sit below
   minimum n for months. Below **n ≥ 30 in both cohorts** an edge is reported as
   `insufficient_data` — never as `no_effect`.
3. **Calibration cohort.** The differential is also computed over the operator-validated
   tier. Those edges are known-good by construction; if the metric shows no signal on them
   at scale, the metric itself is under-powered and the report must say so (a tripwire that
   cannot detect the known dependencies cannot be trusted to exonerate the AI tier).
4. **Position inversion cohort.** Edges already soft-flagged as position-inverted (prereq
   listed after its dependent in the spine; currently 0 corpus-wide) are reported in their
   own section — they are the likeliest genuine errors if any ever appear.

**Privacy.** Computation runs on aggregated counts (per edge × cohort × outcome). In v1 the
per-learner skip map never leaves the browser if the weekly job runs client-side; if the
operator prefers a server job, the payload is still aggregates-only (I4). No per-learner
rows in reports, receipts or queue evidence.

## 6. Tripwire 3 — weekly anomaly report → review queue

**Cadence:** weekly (a `scripts/kg_tripwire_report.py` run + receipt; the schedule lives in
the lane, not in learner-facing code).

**Inputs:** (a) T1 aggregated flags; (b) T2 differentials with cohort stats; (c) the
structural QA harness re-run (the same deterministic checks as the 2026-11-07 sweep — cheap
and deterministic, catches regressions the behaviour signals would miss); (d) the tier
census re-derivation (any UNCLASSIFIED row files immediately).

**Output:** one ranked markdown + CSV report per run, filed under
`.syllabai/lane-artifacts/T-KG-TRIPWIRE-1/` (in-repo persistence law — artifacts outside the
repo do not survive workspace wipes), and — the actual product — **appended rows to the
review queue ledger**.

**Queue routing by tier** (auto-filed rows only; long-tail signals wait for human pull):

| Signal | Edge tier | Queue routing |
|--------|-----------|---------------|
| ≥3 distinct sessions thumbs-down in 7d | any | OPEN row, evidence bundle attached |
| Skip differential below threshold with n≥30 | `AI_SUGGESTED (web)` | OPEN row (review priority) |
| Skip differential (any direction) | `VALIDATED_BY_OPERATOR` | OPEN row tagged `control-anomaly` — a validated edge failing calibration is a tripwire-integrity issue first |
| Structural QA violation (regression) | any | OPEN row, highest priority, blocks nothing (I3) but is worked first |
| UNCLASSIFIED census row | — | OPEN row, `pipeline-defect` tag |

**Row schema** (append-only ledger; verdict fields human-only):

```
row_id, filed_at, course, a, b, type, tier,
signals (T1 count / T2 delta+CI / QA class), evidence_ref,
status: OPEN | REVIEWED
verdict: (empty until a human fills it)  CONFIRM | REJECT | AMEND
reviewer: (empty)   review_date: (empty)
```

The empty-verbatim-columns law is the same one the SME workbook shipped with: the system
delivers the structure, humans and only humans fill the judgment fields.

## 7. Events and storage summary

| Event / artifact | Produced by | Stored in | Crosses the bridge? |
|---|---|---|---|
| `kg_prereq_feedback` | learner click | browser-local progress store (course-keyed) | aggregates only, on export |
| skip map (per learner) | derived locally | browser-local | never (only aggregates) |
| weekly report md + csv | `kg_tripwire_report.py` | `.syllabai/lane-artifacts/T-KG-TRIPWIRE-1/` | n/a (repo-internal) |
| review queue ledger | weekly report + manual filing | same lane-artifacts dir | n/a |

No new dependencies, no server components in v1 beyond the existing bridge route.

## 8. Rollout order and acceptance criteria

| Phase | Ships | Acceptance (machine-checkable) |
|-------|-------|-------------------------------|
| 0 — this PR | The spec only | No diff outside `docs/` + lane bookkeeping; `prereqValidated` key present in 0/106 `prerequisites.json` (JSON-parse census, not grep — the string legitimately appears in the snapshots' own EMPTY-stays prose notes) |
| 1 | T1 affordance in the provenance drawer (both KG surfaces), event in browser-local store | Events match §4 schema; zero network calls added; tooltip honesty copy present; no label byte touched |
| 2 | `kg_tripwire_report.py` + first weekly run: T1 aggregation, T2 differential with n≥30 law, QA re-run, queue filing | Report row schema per §6; verdict fields byte-empty; queue append-only (byte-asserted); calibration cohort section present |
| 3 (optional) | Teacher-surface read-only view of the queue | Read-only; no write path from the teacher UI into content or labels |

## 9. What this spec deliberately does not do

- **No auto-confirm, auto-reject, auto-amend, auto-delete** — of anything, ever (I1, I5).
- **No `prereqValidated` writes** — the field stays empty until a human review pass earns it (I2).
- **No serving or progress gate** — queue depth is not a deployment input (I3).
- **No SME impersonation** — learner signals are evidence with stated confounds, not expert judgment; reports carry the confound sections, not verdict theatre.
- **No learner-authored edges** — missing-prereq suggestions are out of scope for v1 (§4).
- **No new third-party dependencies** — the analytics are one local event type and one script.

---

*Ship state this spec inherits, for the record: 106/106 web courses with served pre edges,
20,369/20,369 edges reconciled against the SME-package baseline (2026-11-07 machine QA,
MATCH), 0 hard violations, 0 soft flags, review queue empty. The tripwires exist so that the
first real anomaly surfaces itself instead of waiting for an SME who does not exist yet.*
