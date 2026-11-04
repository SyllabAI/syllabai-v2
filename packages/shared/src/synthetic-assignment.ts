/**
 * Synthetic assignment-title filter — the ONE implementation on both sides
 * of the api/hub boundary (tier-3 follow-up 4, dashboard UX review
 * 2026-11-04).
 *
 * History: teacher-onboarding probe fixtures ("probe late
 * asprobe_1790628651", seeded with a bogus epoch-0 dueAt) leaked into every
 * live learner surface through the V49 NULL-class visibility law. #735
 * filtered them presentation-side (apps/hub set-work-card) and #735's
 * source fix stopped the v2 API issuing them (apps/api learner-me
 * `fetchAssignmentLists`) — but the predicate lived as two hand-synced
 * copies. This module is the byte-identical law both apps now import, so
 * the parity-drift class of regression is retired by construction.
 *
 * The law (pinned first-hand in synthetic-assignment.test.ts):
 *   - a title carrying the synthetic account slug `asprobe_<digits>`
 *     (case-insensitive, anywhere) is a probe fixture;
 *   - a title that STARTS with the word "probe" followed by whitespace is
 *     one too — the onboarding fixtures are all named "probe …";
 *   - anything else survives: a real assignment titled "Temperature
 *     probes" is fine (the slug has no word boundary and "probes" is not
 *     at string start).
 *
 * Known false-positive boundary, accepted in the UX review and pinned here
 * so any future loosening/tightening is a REVIEWED decision: a real
 * assignment whose title genuinely begins with "probe " (e.g. "Probe
 * design lab") is dropped. The fixtures speak the same English real work
 * can; the review judged a rare missed homework worth the guarantee that
 * no student ever reads a QA artefact as their class work again.
 *
 * Pure, deterministic, zero I/O — the package's charter (see index.ts).
 */
export const SYNTHETIC_TITLE_SLUG = /asprobe_\d+/i;

export function isSyntheticTitle(title: string): boolean {
  return SYNTHETIC_TITLE_SLUG.test(title) || /^probe\s/i.test(title);
}
