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
