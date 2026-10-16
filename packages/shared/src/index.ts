/**
 * @syllabai/shared — logic that must be BYTE-IDENTICAL on both sides of the
 * api/hub boundary.
 *
 * This package exists to kill the parity harness. In the frozen world,
 * mathNormalize-class logic had to be kept in parity across repos and gated
 * on it (hub #6 "port the s142 drift normalizer", web #13 "mathNormalize
 * hub-parity evolution — 2 T-C44 deltas + 4 T-C47 residuals, gate 20").
 * Here, both apps import THE ONE implementation.
 *
 * What belongs here: pure, deterministic, domain functions with zero I/O —
 * normalizers, validators that both sides need, formatting shared by api
 * responses and hub rendering.
 *
 * What does NOT belong here: anything touching the database, HTTP, env, or
 * app-specific UI state.
 *
 * Wave plan: T-MIG-011 lifts the mathNormalize implementation from
 * apps/hub (imported from syllabai-hub @ 93226a43) into this package and
 * re-exports it from the hub import path, so parity becomes an import
 * statement instead of a gated cross-repo port. Until that lands, hub's
 * local copy remains the behaviour reference and this package stays minimal.
 */
export const SHARED_PACKAGE_VERSION = "0.1.0";

/**
 * T-MIG-011 (Wave 1): mathNormalize lifted BYTE-IDENTICAL from
 * apps/hub/src/lib/mathNormalize.ts (syllabai-hub @ 93226a43 lineage).
 * Hub now re-exports this implementation from its own import path, so
 * parity is an import statement instead of a gated cross-repo port.
 */
export * from "./mathNormalize";

/**
 * T-MIG-130 (hub chat bank-intent wiring, operator trace
 * 1a140a3f4c796e11): the deterministic zero-LLM classifier that decides
 * whether the hub chat relay probes the tutor-bank bands (T-MIG-128/129)
 * plus the band lead-in builders. Pure domain logic — the package's exact
 * charter — and contract, not presentation: pinned first-hand in
 * bank-intent.test.ts inside the suite of record.
 */
export * from "./bank-intent";

/**
 * T-MIG-130 run-010 (chat answer-side render hygiene, operator trace
 * 1a1458af5eed4b21): the citation-debris strip. The hub chat renderer
 * applies it to assistant content before the math-delimiter normalizer —
 * the API's marker law keeps its digit-only territory, the s22 record
 * stays verbatim; pinned first-hand in answerDebris.test.ts.
 */
export * from "./answerDebris";
