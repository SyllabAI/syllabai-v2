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

## Wave-4 tranche (T-MIG-040-PREP) — replay-readiness

`w4-*.json` (57 cases): the learner wave captured one wave ahead of its port
lane (T-MIG-007 pattern). Two capture postures, disclosed per-case in
`source:`:

- **22 pre-auth authz-shell cases** from the deployed Render core
  (read-only; write-safety proven from `SecurityConfig` source ordering —
  JWT filter → `anyRequest().authenticated()` → 401 entry point BEFORE any
  controller — and confirmed live: every probe answered 401).
- **35 authed deterministic cases** from a LOCAL frozen-core boot
  (JDK 25 + Maven, LOCAL PostgreSQL 17.9 + pgvector 0.8.7, Flyway V1..V63
  applied by the core; zero Neon). Empty states, validation boundaries,
  the flashcard rating → derived-schedule lifecycle, practice → state /
  knowledge-graph / course-stats / agenda / smart-lesson, exam-series
  targeting against the V63 seed, intervention lifecycle shell, and the
  authed-vs-unauthed posture pair on an unknown path.

Replay prerequisites and the deterministic decay law the wave-4 port must
implement are restated in `golden/tools/w4-readiness.ts` (run it: exit 0 =
ready). Captured-as-is quirks (R0 divergence calls, never fixed in-pass):
F-e dotted-anchor 400; intervention unknown-run 400-before-404.
