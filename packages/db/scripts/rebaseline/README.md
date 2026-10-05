# packages/db re-baseline toolkit (T-MIG-002-R)

Repo-resident, re-runnable re-baseline path for the T-MIG-002 generated
baseline (62 tables · 579 columns · 87 indexes). This is the in-repo successor
of the T-MIG-002 D1 out-of-repo toolchain: the renderer-fix script is no
longer private — the checked-in baseline is now PROVEN repair-friendly by
tests that run on every `bun test packages` gate.

## Tools

| Tool | Purpose |
|---|---|
| `render_fixes.ts` | F3 codemod: kit-0.31.11 output → canonical schema bytes. Law A: `.default(')` → `.default('')` (5 baseline sites). Law B: `unknown("col")` → `bytea("col")` / `tsvector("col")` + import synthesis (3 baseline sites). Idempotent; refuses to guess on unannotated `unknown(` sites. |
| `preflight_f2.ts` | F2 preflight: verdict on the declared `packages/db/package.json` pair (kit ^0.30.0 + orm ^0.38.0 = KNOWN_BAD: gel-core hard-import + null-expression squasher crash) + `expression: null` crash-shape detector over `drizzle/meta/*_snapshot.json`. **Report-only — never edits package.json.** |
| `verify_parity.ts` | Living "579/579 columns.parity": imports the generated schema module and compares it against the snapshot (table set, column names, notNull, literal defaults). Exit 1 on any drift. |

Tests are colocated (`*.test.ts`) and run under the standard gate
(`bun test apps/api packages`) — the fixed-point and round-trip proofs keep
the checked-in baseline honest without any database access.

## Re-baseline procedure (never regenerate by hand)

1. **Preflight** — `bun packages/db/scripts/rebaseline/preflight_f2.ts`:
   confirms the toolchain pair is usable (currently the DECLARED pair is
   KNOWN_BAD — see the flag below) and the current snapshot is crash-shape
   free.
2. **Isolated toolchain (while the declared pair is broken)** — OUTSIDE the
   repo (D1 precedent), install the D1-proven trio:
   `drizzle-kit@0.31.11` + `drizzle-orm@0.45.x` + `@neondatabase/serverless@1.2.0`.
   Do NOT change `packages/db/package.json` in this lane — realignment is
   flagged for the package owner.
3. **Neon branch** — create/refresh a task-named Neon branch (copy-on-write
   of production). NEVER point `db:pull` at production itself; zero
   production contact. Drop the branch after the capture.
4. **Pull** — run `drizzle-kit pull` with `DATABASE_URL` pointed at the
   branch; record tool versions + branch name in the task receipt.
5. **Render fixes** — `bun packages/db/scripts/rebaseline/render_fixes.ts
   packages/db/src/schema/schema.ts --write`; expect exactly the known-site
   counts (empty-default + unknown-shim) on fresh kit output, 0 sites on a
   canonical file.
6. **Verify** — `bun packages/db/scripts/rebaseline/verify_parity.ts`
   (must print `columns.parity: PASS` with 579/579) and the standard gate
   battery (typecheck ×4; `bun test apps/api packages`; golden selftest).
7. **Record** — append a task receipt (capture date, branch, tool versions,
   site counts, parity result), update the header of
   `src/schema/README.md` with the new counts/date.

## F2 flag for the package owner (recorded, NOT actioned here)

`packages/db/package.json` declares `drizzle-kit ^0.30.0` + `drizzle-orm
^0.38.0` — a pair that cannot execute `db:pull` (F2). Recommendation (the
package owner's call, outside this task's fence): align to kit 0.31.x +
orm 0.45.x (or a pair whose pg-core exports bytea/tsvector helpers and whose
squasher tolerates null-expression index columns), then re-run this
procedure to prove no renderer drift.
