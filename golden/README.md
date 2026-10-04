# golden/

The parity gate: recorded request/response pairs from the frozen Java core,
replayed against the v2 api. A module is PORTED only when its cases pass.

- `runner.ts` — replay/diff engine (`bun golden/runner.ts --selftest` |
  `--target <url>`); tolerance rules for timestamps/uuids/tokens.
- `cases/` — scrubbed fixtures, one JSON per case. **No pilot PII**: emails,
  names, and tokens are deterministically masked at capture time.
- Capture + scrub procedure, per-wave case menus, and the non-gating rule
  for LLM surfaces: `docs/GOLDEN_MASTER.md`.

CI runs `--selftest` (engine sanity, no live target). Live replay runs are
operator/agent-driven against a booted v2 api per wave gate.
