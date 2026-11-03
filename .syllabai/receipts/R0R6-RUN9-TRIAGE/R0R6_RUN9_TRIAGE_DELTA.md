# R0/R6 divergence triage — neon-replay run #9 (delta), superseded-forward to run #11

Operator directive "triage run #9's 57 divergences" (IM trace `1a10f8b3bf4a8111`, executed as R0+R6).
Evidence: artifacts `neon-replay-37408914789-1` (run #9, head `9bebf7e`), `-37417629684-1` (run #10,
head `ec40f1f`), `-37418673048-1` (run #11, head `d6911f6`). Baseline ruling: the run #7 triage
(`../R0R6-R7-TRIAGE/R0R6_R7_DIVERGENCE_TRIAGE.md`, 62 cases, classes A–J) + T-MIG-063 run-004 closure
(RICH-200-A/B closed; C/D filed). This receipt: (1) dispositions run #9's 57 against those rulings,
(2) records the trajectory through run #11, (3) makes FOUR NEW R0/R6 rulings backed by first-hand
frozen-source verification, (4) re-issues the action register.

## 1. Trajectory

| run | fired (UTC) | head | corpus | union verdict | divergences |
|---|---|---|---|---|---|
| #7/#8 | 01:14 | `56a8baa` | 170 | 108/170 | 62 (identical twice — determinism proof) |
| #9 | 03:25 | `9bebf7e` | 177 | 120/177 | 57 |
| #10 | 05:15 | `ec40f1f` | 177 | 137/177 | 40 |
| #11 | 05:28 | `d6911f6` | 177 | 137/177 | 40 (deterministic across heads) |

Run #9→#11 net: −17 (T-MIG-063 staging landed: rich-200 family 7/7 PASS on the live instrument,
6 B-class cleared, W4 route landings) + newly EXPOSED failures (the staging exercised V63 seed data
for the first time and found real port defects — the instrument working as designed).

## 2. Run #9's 57 → disposition classes

| class (lineage) | cases (run #9) | disposition | run #11 state |
|---|---|---|---|
| A — W4 route absent | w4-intervention ×2, w4-knowledge-graph ×2, w4-smart-lesson ×3 | EXPECTED-ABSENT; owners: T-MIG-061 t2 (intervention), T-MIG-066 043-consolidation (smart-lesson + learner-KG) | intervention/KG/smart-lesson still red (routes not yet mounted); flashcard-rating cleared (route landed, anchor resolves on staged V6 rows) |
| B — seed-posture gap (run-7 ruling: third posture) | curriculum ×6, w3-questions ×2, w3-attempt-mcq-happy, w4-attempt-mcq-practice, w4-target-series-put, w4-exam-series ×2, w4-flashcard-rating ×3 | RESOLVED-FORWARD: T-MIG-063 staged the V2/V6/V7/V63 seed — exam series + curriculum + questions now seeded | 6 cleared; 4 became 500s (new defect class, §3-R2); exam-series ×2 became DATE-FORMAT divergence (§3-R3) |
| C — v2-only register 429 | auth-register-* ×8 | STANDING (run-7 ruling): parity defect P2, auth lane; runner must NOT pace | 5 of 8 tripped (membership rotates — burst-order dependent) |
| D — curriculum unauth 400/404 vs 401 | curriculum-subject-bad-uuid-400, curriculum-subject-unknown-404 | **OVERTURNED — see §3-R1**: v2 is law-conformant; re-pin the cases | still red (unchanged) |
| E — harness bearer override | w4-agenda-malformed-bearer-401, w4-state-empty-bearer-401 | HARNESS DEFECT P1 (run-7 action 1) — still open | still red; v2 401 postures STILL UNPROVEN on the live instrument |
| F — comparator key order | (masked in run #9 by the rich-state flips) | comparator canonicalization owed (run-7 action 3) | w3-marking-throughput now fails on STATE; key-order unprovable until composition fix (§3-R5) |
| G — createdAt wire precision (prod) | content-docs ×2 | PORT DEFECT P3 (run-7): v2 reformats; core passes stored precision | unchanged, still red |
| H — capture identity in non-tolerated fields | w4-register-learner-201, auth-me-with-bearer-200, w3-history ×2, w4-course-stats-practiced, w4-state-practiced, w4-flashcard-schedule/trail | CASE AMENDMENT P3 (run-7 action 7); auth-me → staged-identity tranche | register-learner + auth-me + history red; course-stats/state/schedule/trail flipped into RICH-200-C (§3-R5) |
| I — non-JSON marker asymmetry | question-assets-unknown-404, w4-target-series-clear ×2 | HARNESS DEFECT P3 (run-7 action 8): symmetric empty-body law needed | unchanged, still red |
| J — selfmark 500-vs-400 | (cleared before run #9) | JUSTIFIED-DIVERGENCE lane (run-7) | closed earlier via T-MIG-055/057/058 lineage |
| RICH-200 wiring (run-9 new) | w3-sme-ingest ×2, w3-sme-status-admin, w3-teacher-marking-*-rich ×4 | RESOLVED-FORWARD: T-MIG-063 (multipart + /admin rule + staging) | 7/7 rich-200 PASS on the live instrument |

## 3. NEW R0/R6 rulings this triage

### R1 — run-7 ruling D is OVERTURNED (frozen-source verification)
Ruling D ordered the auth lane to "align `/api/v1/curriculum/**` GET guarding with
SecurityConfig.java", trusting the capture (400/404 unauthenticated). First-hand verification of the
frozen law (`syllabai-core` `SecurityConfig.java`, untouched since `42ea7d0` 2026-10-02 — i.e. in force
BEFORE the 2026-10-05T19:02Z capture): the `authorizeHttpRequests` block permits only
register/login/bootstrap/actuator/docs; there is NO curriculum permit entry; `anyRequest().authenticated()`
+ entry point `sendError(401)` (lines 65–94). The audit commit `d77a061` touched only HSTS headers — the
block was never tightened after capture. **v2's observed 401s ARE the frozen law's answer.** The capture's
400/404 cannot be reproduced from the pinned source (deployment drift or a scrubbed-away auth header at
capture time). Orders: (a) the auth-lane guard-alignment action is CANCELLED before implementation —
widening v2 would violate the law and the §7 anti-pattern list; (b) case-owner lane re-pins the two cases
to the law: expect 401 + Boot-default body `{timestamp,status:401,error:"Unauthorized",path}` with
`tolerate:["timestamp"]`, `justified:true` note citing this ruling + `SecurityConfig.java:65-94 @ 6cad6ef`;
(c) the positive control (`content-reader-real-doc-unauthed-401` PASS) already shows v2 == law elsewhere.

### R2 — the 500-class register is EXPANDED (RICH-200-D +2)
The closure commit named `w3-questions-families/topics` 500 on the V63 seed. Run #11 adds:
`teacher-curriculum-versions-teacher-200` (500 vs 200) and `w4-target-series-put-201` (500 vs 200 —
route landed via the 043 band, then 500s on staged data). Four cases now 500 where the frozen core
answers 2xx — §7 anti-pattern territory ("a 500 where the core returns 200"). Port lane P1; filed as
**T-MIG-067** with the case-by-case frozen citations owed at claim time.

### R3 — DATE wire-format defect (new class, port P2)
`w4-exam-series-qualification-filter/seeded-calendar` now fail on `windowStart/windowEnd/entryDeadline/
resultsDate`: v2 emits `2026-10-08T00:00:00.000Z` (timestamp serialization) vs the core's
`2026-10-08` (LocalDate passthrough). Distinct from G (createdAt precision): this is DATE-typed columns.
Port lane: serialize LocalDate-typed fields as bare dates; covered in T-MIG-067.

### R4 — error-taxonomy envelope (new class, port P2)
`w3-attempt-missing-fields-400` / `w3-attempt-structured-missing-fields-400`: v2 answers
`validation_failed`/`questionId: must not be null` where the core (same empty `{}` body, same seed state
now staged) answers `malformed_body`/`request body is not readable (check field types and enum values)`.
Was tabled under run-7 class B; the staging proved it posture-independent — a real envelope divergence.
Port lane: map unreadable/missing-required-field bodies to the core's `malformed_body` taxonomy.
Covered in T-MIG-067.

### R5 — corpus-sequencing composition (RICH-200-C answered)
The empty-pinned cases (`w3-marking-answers/queue-v2/throughput-teacher-200`, `w4-course-stats-empty-200`,
`w4-flashcard-schedule-empty-200`, `w4-flashcard-trail-empty-200`, `w4-state-empty-200`,
`w3-history-empty-student-200`, `w3-history-after-submit-200`) flipped red BECAUSE the staged state is
visible to the whole pass. Ruling: the seed pass becomes TWO ordered tranches on the same disposable
branch — **empty-pinned cases replay BEFORE the staging, staged-pinned cases after** (the corpus's own
`seq` machinery generalizes to tranche order). No case re-pinning to the other posture; both postures
stay covered; zero case deletions. Tooling lane, P2 (after E/I — same file, one pass).
`w3-history-after-submit-200` additionally needs the H-class tolerate amendments (`learnerId`,
`attemptId`) once composition lands.

## 4. Action register (delta from run-7's)

| # | action | owner lane | priority | delta |
|---|---|---|---|---|
| 1 | ci-replay bearer-pinned-posture fidelity (E) | tooling | P1 | unchanged, still open — authz postures unproven 4 runs |
| 2 | ~~auth guard alignment~~ | — | — | **CANCELLED by R1** |
| 3 | deepEqualTolerant key canonicalization (F) | tooling | P2 | unprovable until #5 lands |
| 4 | ~~third Flyway-seed posture~~ | — | — | EXECUTED as T-MIG-063 (staging) — composition residue → #5 |
| 5 | two-tranche seed-pass composition (R5 / RICH-200-C) | tooling | P2 | NEW |
| 6 | empty-body symmetric sentinel law (I: `_raw`/`<non-json:0 bytes>`/`<non-json>`/0-byte) | tooling | P3 | sharpened |
| 7 | tolerate[] amendments: register-learner += `accessToken`; history-after-submit += `learnerId`,`attemptId` (H) | case owners | P3 | unchanged |
| 8 | curriculum cases re-pin to the 401 law per R1 | case owners | P2 | NEW (replaces old #2) |
| 9 | T-MIG-067: 500-class ×4 + DATE wire-format ×2 + error-taxonomy ×2 | port lane | P1/P2 | NEW card |
| 10 | register 429 parity ruling (C) | auth lane + R0 | P2 | unchanged |
| 11 | prod createdAt passthrough (G) | content lane | P3 | unchanged |

## 5. Projected clearing profile

Composition (#5) + amendments (#7) ≈ +9; T-MIG-067 (#9) ≈ +8; re-pin (#8) ≈ +2; E/I/#6 ≈ +5;
C ruling (#10) ≈ +5..8; G ≈ +2; W4 mounts (T-MIG-061 t2, T-MIG-066) ≈ +5..7 → **177/177 reachable
with zero case deletions and zero comparator widenings**. Every remaining red has a named owner.
