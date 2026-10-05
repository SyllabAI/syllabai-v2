/**
 * Structural sql adapter for the curriculum module (T-MIG-021 tranche 1).
 *
 * Mirrors the tagged-template adapter identity/users.ts builds (Neon
 * WebSocket `Client`), declared here as a STRUCTURAL type so the curriculum
 * repositories stay decoupled from the identity module's internals and from
 * the T-MIG-014 driver-dispatch rework (PR #13): whatever adapter the
 * composition root passes must only satisfy this shape. Read-only tranche —
 * no transaction affordance is declared until a write path needs one
 * (R-TX doctrine applies to writes only; every query in this module is a
 * single statement).
 *
 * Known follow-up (declared in receipt run-001): services/content declares
 * the same structural type (R3's tranche-1). Dedupe into a shared module
 * once T-MIG-014's dispatch rework lands — not done now because importing
 * across an unmerged peer branch would couple two lanes' merge order.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

/** One driver row (snake_case columns as Neon returns them). */
export type Row = Record<string, unknown>;
