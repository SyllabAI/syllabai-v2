# Golden-Master Parity Gate

The migration's core safety property: **the v2 api must answer what the
frozen Java core answers** — same status, same body shape, same validation
accept/reject sets — verified by recorded evidence, not by hope.

## 1. What a golden case is

`golden/cases/<domain>/<name>.json`:

```json
{
  "name": "auth-login-unknown-email-401",
  "description": "Java core returns 401 with its exact error body",
  "source": "captured from Render core 2026-10-05, scrubbed",
  "method": "POST",
  "path": "/api/auth/login",
  "request": { "body": { "email": "user_1 masked@example.invalid", "password": "wrongpass" } },
  "expect": { "status": 401, "body": { "status": 401, "error": "…" } },
  "tolerate": ["timestamp", "requestId"],
  "unordered": ["versions"]
}
```

Runner: `bun golden/runner.ts --selftest` (engine sanity, CI lane) |
`--target <url>` (live replay gate).

`unordered` (T-MIG-036, F-3 re-pin) is optional and key-name scoped per case:
arrays under those keys compare as MULTISETS (element order ignored,
duplicates preserved). Use it ONLY when the frozen source's read leaves row
order unspecified (no `OrderBy`/`ORDER BY`) — heap order is not law. The
captured data is never edited; only the comparator's sensitivity changes.

## 2. Capture procedure (R6 / golden-master role)

1. **Source of truth:** the frozen Java core (Render URL for read-only
   surfaces; a Neon-branch-backed local boot for write surfaces — never
   write into production Neon).
2. Record request + full response for each endpoint's: happy path, each
   validation failure the DTO enforces, authz failures (401/403), and the
   empty-state case. Validation boundaries are the highest-value fixtures:
   they encode jakarta.validation rules the contracts package must mirror.
3. **Scrub (mandatory, deterministic):** emails → `user_<n>@example.invalid`,
   display names → `User <n>`, tokens → fixed dummy, ids → stable fakes.
   Deterministic masking keeps diffs stable across re-captures.
4. Commit fixtures + a `source:` line in each case naming the capture run.
   Receipt of the capture session goes to
   `.syllabai/receipts/capture/<date>/`.

## 3. What is NEVER golden-gated

- **LLM-dependent outputs** (tutor text, CLA, intervention prose): nondeterministic.
  These surfaces get behavioural gates instead: honesty of refusals, citation
  plumbing resolving to the same grounding chunks, zod format contracts.
- Wall-clock timestamps, generated ids, secret material — use `tolerate`.
- Anything behind random ordering — pin ordering in the capture, or exclude.
  EXCEPTION (T-MIG-036, F-3 ruling): when the FROZEN reader itself leaves order
  unspecified (derived query with no `OrderBy`), order is not part of the law —
  pin the captured array and compare it multiset-wise via the case's `unordered`
  annotation instead of weakening or excluding the case.

## 4. Gate semantics per wave

- Wave exit requires: every deterministic endpoint of that wave has ≥1
  happy-path case + every DTO-enforced validation-failure case; replay
  100% PASS against a booted v2 api.
- A justified divergence (e.g. error-body text intentionally normalised)
  must be: recorded in the task's `execution_record`, approved by R0,
  and reflected by UPDATING THE CASE with a `justified: true` note — never
  by deleting the case.
- Cases are forever: they keep gating regressions after the migration.

## 5. Self-check invariant

`--selftest` must stay green in CI at all times. It proves the diff engine
itself (tolerance handling) works — a parity gate with a broken comparator
is worse than no gate, because it generates false confidence.
