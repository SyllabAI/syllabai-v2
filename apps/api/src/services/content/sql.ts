/**
 * Structural sql adapter for the content module.
 *
 * Mirrors the tagged-template adapter identity/users.ts builds (Neon
 * WebSocket `Client`), declared here as a STRUCTURAL type so the content
 * repositories stay decoupled from the identity module's internals and from
 * the T-MIG-014 driver-dispatch rework (PR #13): whatever adapter the
 * composition root passes must only satisfy this shape. Read-only tranche —
 * no transaction affordance is declared until a content write path needs one
 * (R-TX doctrine applies to writes only; every query in this module is a
 * single statement).
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;
