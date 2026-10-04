# @syllabai/contracts

The API contract as executable zod schemas — one source of truth consumed by
`apps/api` (request validation + response shaping) and `apps/hub` (typed
client). This package is what deletes the DTO-ferry layer the Java core
needed, and the drift the old hub↔core boundary suffered.

**Porting rule:** every schema names its Java source file in a header
comment and copies constraints verbatim. Disagreement = schema bug.
See `src/index.ts` for the full rules and `src/auth.ts` for the exemplar
port (identity domain, T-MIG-001 expands this to every remaining DTO).
