/**
 * Loose-card copy — course-aware honesty law (T-HUB-LOOSE-COPY-1).
 *
 * The unmapped-notes card must not promise pending work where the spec-mapping
 * lane is CLOSED. Courses listed in ADJUDICATED_NO_SPEC_HOME have a finished
 * spec-point mapping whose remaining code-less notes carry an operator
 * adjudication of "no statement-plane home" (T-SPEC-2B terminal-stay class;
 * family of record T-SPECS-MATHSB-2B-OVERLAY-1 run-001, commit 3c74e63c;
 * convergence receipt .syllabai/receipts/T-CONSUME-EDX-1/
 * run-002-maths-b-attach-refresh-convergence-r0.json). For every other course
 * the default copy stays truthful: the upstream mapping is still in progress,
 * so "the mapping is still in progress … they'll slot into the topic tree" is
 * accurate there (student register per T-REGISTER run-001).
 */
const ADJUDICATED_NO_SPEC_HOME: Record<string, { title: string; body: string }> = {
  "igcse-maths-b-16": {
    title: "Not on the official specification",
    body:
      "These notes don't match any statement on the official specification, so they're listed at course level rather than under a subtopic. That's a deliberate decision, not pending work.",
  },
};

const DEFAULT_COPY: { title: string; body: string } = {
  title: "Not tied to a spec point yet",
  body:
    "These notes don't match a specific spec point yet — the mapping is still in progress, and they'll slot into the topic tree when it's done.",
};

export function looseAnchorCopy(course: string): { title: string; body: string } {
  return ADJUDICATED_NO_SPEC_HOME[course] ?? DEFAULT_COPY;
}
