# R0/R6 divergence triage — neon-replay run #7 (2026-10-06T01:14Z, id 37398163424)

Delegated disposition per operator directive (IM trace 1a10f19187bb1649). Evidence: artifact
`neon-replay-37398163424-1` (seed.json / prod.json / union.md / boot logs). Corpus at `fe97f94`.
Union verdict **108/170 PASS** (seed 95/155, prod 13/15) = **62 divergences**, all dispositioned below.

Stability vs run #6 (T-MIG-047 run-002, 105/170): 60/62 fails identical across runs — the fail set is
deterministic except the 429-class membership (rotates) and cases closed between runs (`w4-course-stats-empty-200`,
`w4-state-empty-200` routes landed; `w3-smartmark-unknown-attempt-404` fixed). The instrument is driving real consumption.

## Class rulings

### A — W4 route not yet implemented — 25 case(s)
**Disposition:** EXPECTED-ABSENT — consume via W4 port lane; no case action

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `w4-agenda-composed-200` | seed | 404 vs 200 | yes |
| `w4-agenda-empty-200` | seed | 404 vs 200 | yes |
| `w4-attempt-mcq-practice-201` | seed | 404 vs 201 | yes |
| `w4-exam-series-qualification-filter-200` | seed | 404 vs 200 | yes |
| `w4-exam-series-seeded-calendar-200` | seed | 404 vs 200 | yes |
| `w4-exam-series-unknown-qualification-200` | seed | 404 vs 200 | yes |
| `w4-flashcard-rating-bad-cardid-400` | seed | 404 vs 400 | yes |
| `w4-flashcard-rating-bad-rating-400` | seed | 404 vs 400 | yes |
| `w4-flashcard-rating-dotted-anchor-400` | seed | 404 vs 400 | yes |
| `w4-flashcard-rating-know-2-201` | seed | 404 vs 201 | yes |
| `w4-flashcard-rating-know-201` | seed | 404 vs 201 | yes |
| `w4-flashcard-rating-still-learning-201` | seed | 404 vs 201 | yes |
| `w4-flashcard-schedule-derived-200` | seed | 404 vs 200 | yes |
| `w4-flashcard-schedule-empty-200` | seed | 404 vs 200 | yes |
| `w4-flashcard-trail-200` | seed | 404 vs 200 | yes |
| `w4-flashcard-trail-empty-200` | seed | 404 vs 200 | yes |
| `w4-intervention-create-missing-rootid-400` | seed | 404 vs 400 | yes |
| `w4-intervention-unknown-run-400` | seed | 404 vs 400 | yes |
| `w4-knowledge-graph-empty-200` | seed | 404 vs 200 | yes |
| `w4-knowledge-graph-practiced-200` | seed | 404 vs 200 | yes |
| `w4-smart-lesson-missing-params-400` | seed | 404 vs 400 | yes |
| `w4-smart-lesson-practiced-200` | seed | 404 vs 200 | yes |
| `w4-target-series-clear-204` | seed | 404 vs 204 | yes |
| `w4-target-series-clear-again-204` | seed | 404 vs 204 | yes |
| `w4-target-series-put-201` | seed | 404 vs 200 | yes |

### B — H-2 seed-posture gap (pre-disclosed) — 13 case(s)
**Disposition:** R0/R6 RULING DUE NOW — third-posture task filed; honest reds until it lands

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `curriculum-subject-by-id-student-200` | seed | 404 vs 200 | yes |
| `curriculum-subjects-student-200` | seed | 200 vs 200 | yes |
| `curriculum-versions-archived-student-200` | seed | 200 vs 200 | yes |
| `curriculum-versions-student-200` | seed | 200 vs 200 | yes |
| `teacher-curriculum-nodes-teacher-200` | seed | 200 vs 200 | yes |
| `teacher-curriculum-versions-teacher-200` | seed | 200 vs 200 | yes |
| `w3-attempt-mcq-happy-201` | seed | 404 vs 201 | yes |
| `w3-attempt-missing-fields-400` | seed | 400 vs 400 | yes |
| `w3-attempt-structured-missing-fields-400` | seed | 400 vs 400 | yes |
| `w3-history-after-submit-200` | seed | 200 vs 200 | yes |
| `w3-history-empty-student-200` | seed | 200 vs 200 | yes |
| `w3-questions-families-student-200` | seed | 200 vs 200 | yes |
| `w3-questions-topics-student-200` | seed | 200 vs 200 | yes |

### C — v2-only register rate limit — 8 case(s)
**Disposition:** PARITY DEFECT (P2) — auth lane: match frozen core or R0-approved justified divergence (operator-visible)

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `auth-register-admin-refused-403` | seed | 429 vs 403 | no |
| `auth-register-bad-email-400` | seed | 429 vs 400 | no |
| `auth-register-blank-displayname-400` | seed | 429 vs 400 | yes |
| `auth-register-missing-fields-400` | seed | 429 vs 400 | yes |
| `auth-register-password-no-digit-400` | seed | 429 vs 400 | yes |
| `auth-register-short-password-400` | seed | 429 vs 400 | yes |
| `auth-register-teacher-no-joincode-403` | seed | 429 vs 403 | yes |
| `auth-register-unknown-role-400` | seed | 429 vs 400 | yes |

### D — auth guard widening on public curriculum GETs — 2 case(s)
**Disposition:** PARITY DEFECT (P2) — auth lane: align with SecurityConfig permit list

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `curriculum-subject-bad-uuid-400` | seed | 401 vs 400 | yes |
| `curriculum-subject-unknown-404` | seed | 401 vs 404 | yes |

### E — harness destroys case-pinned 401 postures — 2 case(s)
**Disposition:** HARNESS DEFECT (P1) — tooling lane: ci-replay.ts bearer override; v2 behavior UNPROVEN, re-proof owed

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `w4-agenda-malformed-bearer-401` | seed | 404 vs 401 | yes |
| `w4-state-empty-bearer-401` | seed | 200 vs 401 | yes |

### F — comparator key-order sensitivity — 1 case(s)
**Disposition:** COMPARATOR DEFECT (P2) — tooling lane: canonicalize object keys in deepEqualTolerant (RFC 8259)

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `w3-marking-throughput-teacher-200` | seed | 200 vs 200 | yes |

### G — createdAt wire-format divergence (prod) — 2 case(s)
**Disposition:** PORT DEFECT (P3, cosmetic) — content lane: raw timestamp passthrough

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `content-docs-teacher-detail-realdata-200` | prod | 200 vs 200 | yes |
| `content-docs-teacher-realdata-200` | prod | 200 vs 200 | yes |

### H — capture-time identity pinned in non-tolerated fields — 7 case(s)
**Disposition:** CASE AMENDMENT (P3) — case-owner lane: tolerate[] additions; auth-me → third-posture tranche candidate

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `auth-me-with-bearer-200` | seed | 200 vs 200 | yes |
| `w4-course-stats-practiced-200` | seed | 200 vs 200 | yes |
| `w4-flashcard-rating-unknown-anchor-404` | seed | 404 vs 404 | yes |
| `w4-register-learner-201` | seed | 201 vs 201 | yes |
| `w4-smart-lesson-unknown-topic-404` | seed | 404 vs 404 | yes |
| `w4-state-practiced-200` | seed | 200 vs 200 | yes |
| `w4-target-series-unknown-series-404` | seed | 404 vs 404 | yes |

### I — non-JSON marker asymmetry — 1 case(s)
**Disposition:** HARNESS DEFECT (P3) — tooling lane: replay marker must reproduce capture convention; verify v2 0-byte body at re-proof

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `question-assets-unknown-404` | seed | 404 vs 404 | yes |

### J — core 500 vs port 400 (selfmark unknown attempt) — 1 case(s)
**Disposition:** JUSTIFIED-DIVERGENCE CANDIDATE — R6 verifies frozen source, then R0-approved justified note

| case | posture | actual vs expected | stable #6→#7 |
|---|---|---|---|
| `w3-selfmark-unknown-attempt-500` | seed | 400 vs 500 | yes |

## Notes carried into the rulings

- **A (25):** 19 route-404s with 2xx expectations + 6 validation-404s (flashcard/intervention/smart-lesson 4xx cases whose routes do not exist yet). The README pre-discloses the w4 tranche as captured-one-wave-ahead. Cascade: `w4-state-practiced-200`, `w4-course-stats-practiced-200`, `w4-agenda-composed-200`, `w4-flashcard-schedule-derived-200` are downstream of the missing practice-write route — they clear via cascade once it lands (modulo H amendments). Captured-as-is quirks (dotted-anchor 400; intervention unknown-run 400-before-404) are PRE-RULED R0 calls — they surface at port time, not as new findings.
- **B (13):** the worklog's registered "H-2 third-posture ruling" is hereby DECIDED as follows: file a task card for a THIRD tranche — `apply-reset.ts --seed` mode replaying the frozen core's V6/V7 seed SQL into the COW branch, `CASE_MODE=seeded`, carrying exactly these seed-pinned cases (curriculum/teacher-curriculum/w3-questions/w3-attempt/w3-history families + `auth-me-with-bearer-200`). Re-pinning to empty-store expectations is REJECTED (destroys seed coverage; cases are forever). Operator-visible by doctrine (workflow + tool change). Until it lands these remain honest reds with disclosed cause.
- **C (8):** the frozen core has no register rate limit at capture thresholds (captures show 400/403; the replay burst trips v2's 429 with Retry-After 46s; membership rotates between runs). Parity-first: auth lane strips or aligns the limiter; if the operator rules the limiter STAYS, each affected case gets a `justified: true` note + `expect.headers` Retry-After pin (T-MIG-004 F-3 gate). The runner must NOT pace around a parity defect (masking).
- **D (2):** cases carry no Authorization header (captured unauthenticated from the deployed core) and expect 400/404; v2 answers 401. Guard widening — auth lane aligns `/api/v1/curriculum/**` GET guarding with SecurityConfig.java (R6 verifies the frozen permit list before porting). Positive control: `content-reader-real-doc-unauthed-401` PASSES in prod — the gap is route-scoped, not global.
- **E (2):** ci-replay.ts replaces ANY case-declared Authorization value with the route-rule bearer (`hadAuth` branch). `w4-state-empty-bearer-401` pins `Bearer ` (empty) — the runner sent a VALID student token and v2 honestly answered 200-empty to an authed request. The 401 posture was never exercisable: **v2's empty-bearer behavior is UNPROVEN by this run** — neither cleared nor implicated. Fix (tooling lane, P1 because it silently masks authz regressions): honor case-pinned auth postures — extend the keyword set (`unauthed|malformed-bearer|empty-bearer` → DUMMY) or keep the literal Authorization when it is not a `{{TOKEN}}` placeholder. Re-proof after fix.
- **F (1):** `deepEqualTolerant` compares `JSON.stringify(redacted)` — object key insertion order is significant. `w3-marking-throughput-teacher-200` bodies are semantically identical (same keys/values, different order: Jackson declaration order vs v2 insertion order). RFC 8259: objects are unordered. Fix: canonicalize object keys before compare (extend selftest accordingly); `unordered[]` array-multiset semantics unchanged (T-MIG-024 scope intact).
- **G (2):** prod diffs are prefix-identical through `createdAt` — divergence is timestamp wire-precision (core emits raw stored precision; v2 reformats). Port defect, cosmetic; content lane passes the stored string through verbatim. Prod posture otherwise 13/15 — production-data parity is strong.
- **H (7):** README pre-names this class. Amendments owed: `w4-register-learner-201` += `accessToken`; `w3-history-after-submit-200` += `learnerId` (dual-cause with B); `w4-course-stats-practiced-200` / `w4-state-practiced-200` mostly clear via A-cascade (learnerId already tolerated on the latter); `auth-me-with-bearer-200` pins seed-user_10 email/displayName (tolerate=['id'] insufficient) → moved to the B third-posture tranche. Amendments go through the case-owner lane — the CI runner never edits cases (read-only posture).
- **I (1):** replay-side non-JSON marker `<non-json>` can never match the capture-side `<non-json:0 bytes>` — unmatchable by construction. Tooling lane normalizes the marker convention; re-proof must also confirm v2 actually returns a 0-byte body (a non-empty error page would be an additional v2 defect).
- **J (1):** `w3-selfmark-unknown-attempt-500` — core 500 internal_error vs port 400 bad_request. The port's behavior is strictly better (validation before persistence). R6 verifies the frozen source path; expected outcome is a GOLDEN_MASTER §4 justified divergence (record in execution_record, R0 approval, `justified: true` case note — never case deletion).

## Action register (owners)

| # | action | owner lane | priority |
|---|---|---|---|
| 1 | ci-replay.ts: honor case-pinned auth postures (E) | tooling (T-MIG-044 lineage) | P1 |
| 2 | auth: register rate-limiter parity ruling + guard alignment (C, D) | auth lane | P2 |
| 3 | deepEqualTolerant object-key canonicalization + selftest (F) | tooling (T-MIG-006 lineage) | P2 |
| 4 | task card: third Flyway-seed posture — apply-reset --seed + CASE_MODE=seeded tranche (B) | tooling + operator sign-off | P2 |
| 5 | W4 port lane continues; A-class clears on landing; pre-ruled quirks surface at port time (A) | W4 lane (T-MIG-040/043 lineage) | in-flight |
| 6 | content-docs timestamp passthrough (G) | content lane | P3 |
| 7 | tolerate[] amendments: register-learner += accessToken; history-after-submit += learnerId (H) | case owners | P3 |
| 8 | non-JSON marker convention + v2 0-byte confirmation (I) | tooling | P3 |
| 9 | selfmark unknown-attempt: frozen-source verification → justified note (J) | R6 + R0 | P3 |

Union trajectory: run #6 105/170 → run #7 108/170 (+3: two W4 routes landed, one smartmark fix; 429 membership rotates).
Projected clearing profile as actions land: A-cascade + H amendments ≈ +25..32 → ~140/170; B third posture ≈ +13 → ~153/170;
C/D/E/F/G/I/J close the remainder → 170/170 with zero case deletions.
