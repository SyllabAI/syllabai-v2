/**
 * Editor-plane constants shared across planes (ADR-044, run-011).
 *
 * Lives in @syllabai/shared (the leaf package both the api and the hub
 * bundle) because the Phase 2 merge-transport disclosure must render IN
 * THE PRODUCT verbatim: the hub's Workbench banner and the api's proposal
 * responses carry the SAME string, by law — a disclosure that drifts
 * between planes is not a disclosure. The hub deliberately does NOT
 * consume @syllabai/contracts (its bundler cannot resolve the contracts
 * tree's .js-suffixed source imports; the hub mirrors wire shapes locally
 * in @/lib/contracts) — shared is the one safe home for cross-plane text.
 */

/** The Phase 2 merge-transport disclosure (B4 — the reference MVP's
 * no-networked-commit-path law, ADR-044 §9, carried verbatim). */
export const EDITOR_PHASE2_MERGE_DISCLOSURE =
  "Phase 2 records the merge in the proposal journal with a SIMULATED PR transport: no corpus byte changes and nothing user-visible changes until Phase 3 wires the real GitHub PR path and the census-guard serve (ADR-044 §2 E-0, §9)." as const;
