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
