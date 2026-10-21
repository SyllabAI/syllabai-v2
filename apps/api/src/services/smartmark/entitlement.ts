/**
 * DC-3 re-attempt economics — the entitlement policy of record (spec §3.3,
 * SyllabAI-SmartChat-Mark-Design-Spec.docx sha256 0da8044a...).
 *
 * The spec's mechanics: "the gate is an entitlement policy row read by the
 * route, not UI styling: free = one AI mark per part per scheme revision,
 * trial = N re-marks per day, paid = generous or unlimited."
 *
 * MEDIUM MAPPING (disclosed, prereg R3): v2 has no billing store, so a DB
 * policy row would be uneditable dead weight — this module IS the policy
 * source the route path reads, and `learnerMarkTier()` is the single swap
 * point a future billing lane replaces. v2 posture of record: every learner
 * is `free`.
 *
 * POLICY VALUES: the spec's own effort note requires PRODUCT SIGN-OFF on the
 * values before the mechanism merges ("DC-3 touches money..."), and open
 * question (a) leaves the trial's N + day-scoping open of record. The free
 * row is the spec's own law (one AI mark per part per scheme revision) and is
 * fully implemented + pinned; the trial row's value below is a PLACEHOLDER
 * that is unreachable under the free-posture resolver, and the gate refuses
 * loudly if a trial tier is ever resolved before sign-off lands.
 */

/** The entitlement tiers the spec names. */
export type MarkEntitlementTier = "free" | "trial" | "paid";

/** The policy shape: what a tier allows per (learner, part, scheme revision). */
export interface MarkEntitlementPolicy {
  /** The included AI marks per part per scheme revision (the free law: 1). */
  readonly includedMarksPerPartPerSchemeRevision: number;
  /** The re-marks the tier allows (trial = N per day — value PENDING
   *  SIGN-OFF, spec open question (a); the day-window semantics are part of
   *  the same open question and are NOT invented here). */
  readonly reMarks: number;
  /** Paid = generous or unlimited (the spec's own words). */
  readonly unlimited: boolean;
}

/** The policy matrix of record. The free row is the spec's own law; the
 *  trial row is an inert placeholder pending product sign-off; the paid row
 *  is the spec's "unlimited" reading. */
export const MARK_ENTITLEMENT_POLICY: Readonly<
  Record<MarkEntitlementTier, MarkEntitlementPolicy>
> = {
  free: {
    includedMarksPerPartPerSchemeRevision: 1,
    reMarks: 0,
    unlimited: false,
  },
  trial: {
    includedMarksPerPartPerSchemeRevision: 1,
    reMarks: 3, // PLACEHOLDER pending product sign-off (spec open question (a))
    unlimited: false,
  },
  paid: {
    includedMarksPerPartPerSchemeRevision: 1,
    reMarks: 0,
    unlimited: true,
  },
};

/** The learner's tier. v2 posture of record: free for every learner — no
 *  billing store exists; this function is the swap point (prereg R3). */
export function learnerMarkTier(): MarkEntitlementTier {
  return "free";
}

/** The refusal detail builder — the spec's own disclosure sentence with
 *  honest counts ("the count is disclosed at the point of gating... because
 *  silent metering reads as breakage"). Never silent, never invented copy. */
export function entitlementRefusalDetail(
  policy: MarkEntitlementPolicy,
  meteredParts: ReadonlyArray<{ label: string; prior: number }>,
): string {
  const parts = meteredParts
    .map((p) => `${p.label} (${p.prior} AI mark${p.prior === 1 ? "" : "s"} already)`)
    .join(", ");
  return (
    "marking entitlement reached: Your first mark on this part is free — " +
    `${policy.reMarks} re-marks left${parts ? ` — metered: ${parts}` : ""}`
  );
}
