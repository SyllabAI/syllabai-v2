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
 * so "not yet anchored … will slot them into the tree" is accurate there.
 */
const ADJUDICATED_NO_SPEC_HOME: Record<string, { title: string; body: string }> = {
  "igcse-maths-b-16": {
    title: "No spec-point home on the official specification",
    body:
      "The spec-point mapping for this course is complete: these notes match no statement on the official specification, so they are listed at course level rather than under a subtopic. This is an adjudicated outcome of the spec-mapping lane, not pending work.",
  },
};

const DEFAULT_COPY: { title: string; body: string } = {
  title: "Not yet anchored to a spec point",
  body:
    "These notes exist in the corpus without a machine-readable specification anchor — the spec-point mapping (still in progress upstream) will slot them into the tree.",
};

export function looseAnchorCopy(course: string): { title: string; body: string } {
  return ADJUDICATED_NO_SPEC_HOME[course] ?? DEFAULT_COPY;
}
