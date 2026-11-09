# KG-F8 tripwire weekly report — 2026-11-09

**Run (UTC):** 2026-11-09T05:34:49Z · **Lane:** T-KG-TRIPWIRE-1 · **Script:** `scripts/kg_tripwire_report.py` (spec phase 2) · **Inputs:** corpus (106 spines) + T1 input ABSENT (phase 1 affordance not shipped; zero events exist) + T2 input ABSENT (no telemetry store yet; every edge insufficient_data)

Learner signals are evidence, not verdicts. Nothing here changes a label, a serving decision or a queue row's verdict fields (I1-I3). Progress is never throttled by this report (I3).

## 1. Queue actions this run

3 row(s) appended to `review-queue.csv` (append-only, ledger bytes 0 -> 980 (+980); append-only assert PASS):

| row_id | course | signals | priority |
|---|---|---|---|
| TRIP-20261109-001 | cie-igcse-english-language-20 | QA:F8.1 — 11 concepts with unresolvable anchor bindings (ENFL-CON-READ-WIDE -> dead ['S2.001']; ENFL-CON-READ-CRITICAL -> dead ['S2.002']; ENFL-CON-CW-PROGRAMME -> dead ['S4.009']; ENFL-CON- | highest |
| TRIP-20261109-002 | cie-igcse-english-language-20 | QA:F8.5 — calibration drift: derived 17 vs served 15 (sym 2); derived-not-served [('p:S2.009', 'p:S3.002'), ('p:S2.012', 'p:S3.003')]; served-not-derived [] | highest |
| TRIP-20261109-003 | cie-igcse-english-language-25 | QA:F8.1 — 9 concepts with unresolvable anchor bindings (ENF5-CON-READ-WIDE -> dead ['S2.001']; ENF5-CON-READ-CRITICAL -> dead ['S2.002']; ENF5-CON-CW-PROGRAMME -> dead ['S4.003']; ENF5-CON-C | highest |

Queue ledger state after run: `.syllabai/lane-artifacts/T-KG-TRIPWIRE-1/review-queue.csv` — 3 row(s) of record, verdict/reviewer/review_date byte-empty on every row (L1 asserted at the write boundary).

## 2. Structural QA re-run (the deterministic laws of record)

Same deterministic law set as the corpus sweeps of record (`scripts/kg_f8al_qa.py`: P1-P6, F8.1-F8.7) plus pre-digraph cycle detection and the position-inversion census — run in collection mode so one violation does not hide the rest.

**3 violation(s) across 2 course(s).** Ranked; each auto-files an OPEN queue row (highest priority, blocks nothing — I3).

- **[F8.1] cie-igcse-english-language-20** — 11 concepts with unresolvable anchor bindings (ENFL-CON-READ-WIDE -> dead ['S2.001']; ENFL-CON-READ-CRITICAL -> dead ['S2.002']; ENFL-CON-CW-PROGRAMME -> dead ['S4.009']; ENFL-CON-CW-DIFFERENT-STYLES -> dead ['S4.015']; +7 more)
- **[F8.5] cie-igcse-english-language-20** — calibration drift: derived 17 vs served 15 (sym 2); derived-not-served [('p:S2.009', 'p:S3.002'), ('p:S2.012', 'p:S3.003')]; served-not-derived []
- **[F8.1] cie-igcse-english-language-25** — 9 concepts with unresolvable anchor bindings (ENF5-CON-READ-WIDE -> dead ['S2.001']; ENF5-CON-READ-CRITICAL -> dead ['S2.002']; ENF5-CON-CW-PROGRAMME -> dead ['S4.003']; ENF5-CON-CW-DIFFERENT-STYLES -> dead ['S4.009']; +5 more)

Cycle census: 0 course(s) with pre-digraph cycles. Position-inversion cohort: 0 served pair(s) (soft signal; reported in its own section below when non-zero).

## 3. Tier census — re-derived from data this run

Never trusted stale; the classification is the F8.5 derivation itself (web export ∪ legacy derivation), multi-source membership allowed and disclosed:

| tier | served pairs |
|---|---|
| AI_SUGGESTED (web) | 20264 |
| VALIDATED_BY_OPERATOR — concept-derived | 118 |
| VALIDATED_BY_OPERATOR — practical-endpoint retarget (sole derivation) | 6 |
| VALIDATED_BY_OPERATOR — total | 124 |
| AI_SUGGESTED (legacy inferred prototype) | 30 |
| UNCLASSIFIED | 0 (fail-closed law: any row files immediately) |

Overlaps (multi-source): {'validated∩web': 49, 'inferred∩web': 17, 'inferred∩validated': 9, 'retarget-routed-through (multi-source, not sole)': 6}. Served pre total: **20351** across 106 courses; concept-level web edges: 9072.

## 4. Tripwire 1 — thumbs-down aggregation

Input absent: the T1 affordance ships in spec phase 1, which has not landed — zero `kg_prereq_feedback` events exist anywhere. 0 auto-filed, 0 long-tail. This section is the honest empty state, not a clean bill of health.

## 5. Tripwire 2 — prereq-skip vs downstream differential

Input absent: no telemetry store exists yet, so every edge is `insufficient_data` (below the n >= 30 law in both arms). Below minimum n an edge is never reported `no_effect` — coverage asymmetry means tail points may sit below minimum n for months (spec section 5, confound 2).

**Calibration cohort (operator-validated tier):** no aggregates to compute — the control cohort's differential is `insufficient_data` corpus-wide. Per the spec's own honesty law: a tripwire that cannot yet detect the known dependencies cannot be trusted to exonerate the AI tier; the metric is **under-powered at this coverage**, and this section says so rather than claiming exoneration.

## 6. Position-inversion cohort

0 served pre pairs sit inverted vs their spine's points[] order (the 2026-11-07 of-record state holds).

## 7. Method and constants of this run

- T1 auto-file: >= 3 distinct sessions on one edge key within a rolling 7-day window; long-tail below.
- T2 minimum cohort: n >= 30 per arm, else `insufficient_data` (never `no_effect`).
- T2 file threshold: |delta first-attempt| >= 0.10 on the web tier (either direction — pruning evidence files too); any direction on the operator-validated tier files `control-anomaly`.
- CI: Wald 95% on the difference of proportions (disclosed approximation).
- Confounds carried by every report that carries a T2 section (spec section 5): (1) self-selection — students who skip may be the stronger students, so a positive skip delta can mean the edge is noise OR that only confident students dare skip; effect sizes ship with CI + cohort sizes, never a bare verdict word; (2) coverage asymmetry — popular points accrue cohorts fast, tail points may sit below minimum n for months, so below the n law an edge is `insufficient_data`, never `no_effect`; (3) calibration cohort — the differential is computed over the operator-validated tier too, and no signal at scale on that known-good tier means the metric is under-powered, not that the AI tier is exonerated; (4) position-inversion cohort — inverted pairs are the likeliest genuine errors and are reported in their own section.
- Queue routing per spec section 6: QA violation -> OPEN, highest priority; UNCLASSIFIED -> OPEN, `pipeline-defect`; T1 window -> OPEN with evidence bundle; T2 web below threshold at n>=30 -> OPEN; T2 control-tier -> OPEN, `control-anomaly`. Long-tail T1 waits for human pull.
- This report writes nothing outside the lane directory and its own report files; `prereqValidated` stays EMPTY; no verdict field is ever written by this script (L1-L4).

