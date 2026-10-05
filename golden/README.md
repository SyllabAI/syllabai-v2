# golden/

The parity gate: recorded request/response pairs from the frozen Java core,
replayed against the v2 api. A module is PORTED only when its cases pass.

- `runner.ts` — replay/diff engine (`bun golden/runner.ts --selftest` |
  `--target <url> [--token <jwt>]`); tolerance rules for timestamps/uuids/tokens.
- `cases/` — scrubbed fixtures, one JSON per case. **No pilot PII**: emails,
  names, and tokens are deterministically masked at capture time.
- Capture + scrub procedure, per-wave case menus, and the non-gating rule
  for LLM surfaces: `docs/GOLDEN_MASTER.md`.

CI runs `--selftest` (engine sanity, no live target). Live replay runs are
operator/agent-driven against a booted v2 api per wave gate.

## Case schema (post T-MIG-006)

```json
{
  "name": "...", "method": "GET|POST|PUT|PATCH|DELETE", "path": "/api/v1/...",
  "request": { "headers": { "Authorization": "Bearer {{TOKEN}}" }, "body": {} },
  "expect": { "status": 200, "body": {}, "headers": { "X-Search-Empty-Cause": "SCOPE_UNRESOLVED" } },
  "tolerate": ["timestamp", "id", "accessToken"],
  "seq": 1
}
```

- `tolerate` — field NAMES removed from BOTH sides of the body diff before
  comparison (wired into the replay engine by T-MIG-006; previously only
  selftest used it). Use for wall-clock timestamps and boot-generated
  values (fresh accessToken/user id per replay db). The scrubbed capture
  values stay in the file for archaeology.
- `unordered` — body-root-relative dotted paths whose ARRAY values compare
  as MULTISETS (T-MIG-024; scope re-ruled by R0 after the F-3 re-examination
  of ruling 5990536177): every element must match exactly (after `tolerate`
  redaction) but in ANY order — PERMITTED ONLY for arrays whose order the
  FROZEN SOURCE leaves unspecified (e.g. `MarkSchemeRepository.findByPaperId`,
  which carries no ORDER BY; JPA collections without `@OrderBy`).
  SCOPE RULE: where the frozen source DOES specify an order, the port must
  implement it and the golden case stays strictly order-pinned —
  `teacher-content-paper-review-realdata-200` `versions[]` is the precedent:
  frozen `QuestionVersionRepository.findByPaperId` (:46-51 @ 6cad6ef) carries
  `order by v.question.externalRef nulls last, v.version desc`, so the port
  implements exactly that and NO declaration is used for it. Declared
  relaxation only: arrays at undeclared paths — including arrays INSIDE a
  declared array's elements — keep strict order, and a different multiset
  still fails.
- `expect.headers` — response-header subset match (T-MIG-004 F-3 closure):
  case-insensitive header names, exact values; a missing actual header
  fails by name. Ports must reproduce core headers (T-C31 empty-cause
  semantics, 429 Retry-After, ...) — the gate now verifies them.
- `seq` — optional replay ordinal. Seq'd cases run FIRST in seq order
  (write-path state: register-success(1) -> duplicate(2) -> login(3) ->
  wrong-password(4) -> me(5)); all other cases follow in filename order.
  Absent `seq` = the case claims no state and must be order-independent.
- `{{TOKEN}}` — request-header placeholder substituted from `--token <jwt>`
  at replay time. A case carrying it without `--token` is a hard harness
  error (fail-fast), never a silent unauthenticated replay.

## Live replay procedure (identity canonical gate)

1. Boot the v2 api against a FRESH database (or reset it between runs —
   write cases mutate state; register-success-201 is 409 on rerun).
2. Register/login once on the target to mint a live token, then:
   `bun golden/runner.ts --target http://localhost:8080 --token <jwt>`
3. Canonical expectation after T-MIG-010 + T-MIG-006: 16/16 identity cases
   PASS; health passes once the core-shape fix (PR #12 / T-MIG-013) lands.
   Content cases keep their captured dummy bearers until their owning port
   migrates them to `{{TOKEN}}` (T-MIG-020's replay tool covers that lane
   today).

## CI-side Neon replay runner (T-MIG-044 — the standing re-proof instrument)

`.github/workflows/neon-replay.yml` mechanizes the recorded T-MIG-022
two-posture protocol corpus-wide (agent sandboxes are DNS-blocked; CI is
not). **STRICT READ-ONLY POSTURE — replay only; cases stay forever-gates:**

- The runner NEVER captures, scrubs, edits, retires, or re-pins a case. It
  replays the committed corpus at the checked-out sha verbatim; a post-run
  `git diff --exit-code` step proves the corpus untouched (read-only
  evidence in every run log).
- It NEVER contacts the production Neon branch with reads or writes. Each
  run provisions two disposable copy-on-write branches from the production
  parent (docs/BASELINE_DB.md §2 doctrine) via `tools/neon-branch.ts` and
  drops them afterwards + 404-verifies (T-MIG-035 discipline), `if: always()`
  — even on failure. Connection URIs are add-mask-ed, never logged.
- Divergences are REPORTED (red job + per-case JSON report artifact + step
  summary) for R0/R6 disposition per AGENT_COORDINATION §6 — never
  auto-fixed, never silently tolerated (§7: no silent widening).

Two passes, union verdict (T-MIG-022 run-001 doctrine; the posture regex
`/realdata|-real-/` is the v2 tool's, verbatim):

| pass | CASE_MODE | branch posture | tranche |
|------|-----------|----------------|---------|
| A | `seed` | COW branch reset by `tools/apply-reset.ts` (Flyway-SEED state: content tables empty, zero users, roles re-seeded) | all non-realdata cases |
| B | `prod` | COW branch AS-COWED (production pilot rows intact, NO reset) | the 15 `*realdata*`/`*real-*` cases |

Tools (all under `tools/`): `ci-replay.ts` (corpus-wide driver — seq-aware
case ordering via the gated loader, comparator IMPORTED from `runner.ts`
(zero comparator drift), tokens minted through the honest register/login
surface with role selection by ROUTE RULE per SecurityConfig.java:66-91;
`--plan` prints the deterministic posture split without a target, `--union`
merges the two posture reports), `apply-reset.ts` + `boot-with-timeout.ts`
(repo-resident copies of the T-MIG-022 receipt tools — provenance + sha in
each header; the H-2 docstring/code divergence is preserved INTACT on
purpose), `neon-branch.ts` (Neon API v2 create/drop/404-verify only).

KNOWN POSTURE NOTES (disclosures, not defects of the runner): cases
captured from LOCAL Flyway-seeded boots (w3/curriculum/teacher families)
pin V6/V7 fixed-uuid seed rows that `apply-reset.ts`'s full wipe removes
(H-2) — such cases FAIL honestly with full evidence until R0/R6 rule a
third posture (e.g. a Flyway-seed fixture from the frozen core) or re-pin;
cases pinning capture-time identity values in non-tolerated fields (e.g.
`w3-history-after-submit-200`'s learnerId) fail until the case is amended.
First-run findings ARE the re-proof instrument working.

Repo setup (one-time, operator): secret `NEON_API_KEY`; variables
`NEON_PROJECT_ID`, `NEON_PARENT_BRANCH_ID` (the production branch id).
Triggers: `workflow_dispatch` + daily schedule; `concurrency` serializes
runs.
