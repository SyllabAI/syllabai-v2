/**
 * The model_versions registry reader (Card B) — the activation seam over the
 * provisioned baseline table (schema.ts:652, uq_model_version on
 * (registry_key, version); params jsonb; provenance/notes; created_at).
 *
 * ZERO-SCHEMA LAW: this card adds no migration. Every activation semantic
 * below is defined over exactly the six provisioned columns.
 *
 * ── ACTIVATION SEMANTICS (the one open decision, resolved) ──────────────────
 *
 * DECIDED: the EXPLICIT POINTER-ROW act.
 *
 *   A family's active version is whichever row a dedicated pointer row names:
 *
 *     registry_key = "@active/<family>"     (reserved namespace, varchar 60)
 *     version      = <the active version string of <family>>
 *     params       = '{}'                   (convention; audit lives in
 *                                            provenance/notes)
 *
 *   Resolution (resolveActiveBktParams): read the pointer row for the family;
 *   read the named target row; lenient-normalize its params (below). Any
 *   degenerate state falls back to the PAPER DEFAULTS — degrade, never
 *   invert — with the reason surfaced on the resolution:
 *
 *     no-pointer        no @active/<family> row yet (the of-record v1 state)
 *     ambiguous-pointer MORE THAN ONE pointer row exists (uq_model_version is
 *                       (registry_key, version) and pointer rows carry the
 *                       target name in `version`, so two rows CAN coexist —
 *                       the reader refuses to pick and falls back; the
 *                       documented activation act is transactional
 *                       delete-then-insert, so this state is operator error)
 *     target-missing    the pointer names a version with no row
 *     malformed-params  the target's params jsonb is not a JSON object
 *
 * WHY THIS OVER THE ALTERNATIVES (the decision record):
 *   - an `is_active` column + partial unique index is the textbook shape, but
 *     it is SCHEMA WORK — the card is zero-schema by scoping;
 *   - "latest created_at wins" makes an accidental seed row an INSTANT
 *     implicit live flip — the exact unsupervised-act class the lane's
 *     explicit-act posture forbids;
 *   - "max version wins" compares version STRINGS — lexicographic ordering
 *     is wrong (v10 < v2) and semver parsing is a second law to maintain;
 *   - the pointer row makes activation a DISTINCT, greppable, auditable act
 *     (provenance/notes carry who/why), gives atomic rollback (flip the
 *     pointer back), pre-provisions N candidate versions, and needs zero
 *     DDL. The reader-side ambiguous-pointer refusal keeps the failure mode
 *     fail-safe even if the act discipline slips.
 *
 * v1 WRITE SURFACE: seed/script-only (the card's scoping) — there is NO
 * runtime writer. The activation recipe, for the operator (one transaction):
 *
 *   begin;
 *   delete from model_versions where registry_key = '@active/learner.bkt';
 *   insert into model_versions (id, registry_key, version, params,
 *                               provenance, notes, created_at)
 *   values (gen_random_uuid(), '@active/learner.bkt', 'v1', '{}'::jsonb,
 *           '<who/why>', '<ticket/trace>', now());
 *   commit;
 *
 * ── THE SAME-RESOLVER INVARIANT (the consumer swap) ─────────────────────────
 *
 * BOTH BKT consumers resolve their base config through resolveActiveBktParams
 * — the WRITER (routes/assessment createLearnerModelEvidencePublisher →
 * updateOnAssessmentEvidence) and the REPORTER (services/research
 * calibrationReport). One resolution function, one normalizer, one fallback
 * law: a mid-flight activation can never give the writer one parameter set
 * and the calibration read another. The two format-aware resolvers
 * themselves (model-update.resolveBktParams / research.toParams) remain the
 * pinned line-against-line ports of LearnerProperties.Bkt.toParams :94-111 —
 * the invariant binds their CONFIG SOURCE, not their parity (their parity is
 * already pinned by their own tests).
 *
 * LENIENT NORMALIZATION (normalizeBktParams): the frozen compact-ctor law
 * (LearnerProperties.java :56-62 — "normalizes any param <= 0 to the paper
 * constant; a misconfigured knob degrades, never inverts"), hardened for
 * jsonb input: a field contributes only `typeof number && Number.isFinite &&
 * > 0`; anything else (missing, null, string, NaN, <= 0) falls back to the
 * paper constant. No upper clamp here — the degrade-never-invert guess clamp
 * lives at the emission resolvers (resolveBktParams / toParams), where the
 * F-062-A note already documents the registry-armed case.
 *
 * FAILURE POSTURE: fail-loud — a registry read failure propagates exactly
 * like any state-write failure (the module's no-silent-skip law); only the
 * four DECLARED degenerate states above fall back, never an exception.
 */
import {
  LEARNER_BKT_PAPER_DEFAULTS,
  type LearnerBktParams,
} from "./model-update";
import type { SqlFn } from "./model-update";

/** The one v1 registry family (BDT calibration is a declared future band). */
export const BKT_REGISTRY_FAMILY = "learner.bkt";

/** The reserved activation-pointer namespace (varchar 60: "@active/" + 60). */
export const REGISTRY_POINTER_PREFIX = "@active/";

/** The pointer row's registry_key for a family (see the activation recipe). */
export function activePointerKey(family: string): string {
  return `${REGISTRY_POINTER_PREFIX}${family}`;
}

/** The declared degenerate states that fall back to the paper defaults. */
export type RegistryFallbackReason =
  | "no-pointer"
  | "ambiguous-pointer"
  | "target-missing"
  | "malformed-params";

/**
 * What the resolver decided and WHY — `source: "registry"` always carries the
 * resolved version; `source: "paper-defaults"` always carries the reason.
 * The consumers pass the params through verbatim; the report surface is for
 * logs/forensics, not wire contract (v1).
 */
export interface RegistryResolution<T> {
  params: T;
  source: "registry" | "paper-defaults";
  version: string | null;
  reason: RegistryFallbackReason | null;
}

/**
 * The compact-ctor normalization (:56-62) hardened for jsonb — per-field,
 * lenient, never throwing. A registry row may carry any subset of the six
 * fields (a v1 calibration update overrides exactly the calibrated knobs and
 * rides the paper constants for the rest).
 */
export function normalizeBktParams(raw: unknown): LearnerBktParams {
  const obj =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const pick = (v: unknown, paper: number): number =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : paper;
  return {
    l0: pick(obj["l0"], LEARNER_BKT_PAPER_DEFAULTS.l0),
    slip: pick(obj["slip"], LEARNER_BKT_PAPER_DEFAULTS.slip),
    guess: pick(obj["guess"], LEARNER_BKT_PAPER_DEFAULTS.guess),
    learnRate: pick(obj["learnRate"], LEARNER_BKT_PAPER_DEFAULTS.learnRate),
    shortAnswerGuess: pick(
      obj["shortAnswerGuess"],
      LEARNER_BKT_PAPER_DEFAULTS.shortAnswerGuess,
    ),
    structuredGuess: pick(
      obj["structuredGuess"],
      LEARNER_BKT_PAPER_DEFAULTS.structuredGuess,
    ),
  };
}

function paperResolution(reason: RegistryFallbackReason): RegistryResolution<LearnerBktParams> {
  return { params: LEARNER_BKT_PAPER_DEFAULTS, source: "paper-defaults", version: null, reason };
}

/**
 * The ONE registry read both BKT consumers make (the same-resolver
 * invariant). Two keyed selects on the provisioned table; no writer; the
 * four declared degenerate states fall back to the paper defaults with the
 * reason on the resolution (see the header).
 */
export async function resolveActiveBktParams(
  sql: SqlFn,
): Promise<RegistryResolution<LearnerBktParams>> {
  // Deterministic order even in the ambiguous state — the pick itself is
  // refused, but the query shape stays stable for the query log.
  const pointers = (await sql`
    select version, params
    from model_versions
    where registry_key = ${activePointerKey(BKT_REGISTRY_FAMILY)}
    order by created_at desc, version desc
  `) as unknown as Array<{ version: unknown; params: unknown }>;

  if (pointers.length === 0) return paperResolution("no-pointer");
  if (pointers.length > 1) return paperResolution("ambiguous-pointer");

  const targetVersion = String(pointers[0]!.version);
  const targets = (await sql`
    select params
    from model_versions
    where registry_key = ${BKT_REGISTRY_FAMILY} and version = ${targetVersion}
  `) as unknown as Array<{ params: unknown }>;

  if (targets.length === 0) return paperResolution("target-missing");

  const raw = targets[0]!.params;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return paperResolution("malformed-params");
  }
  return {
    params: normalizeBktParams(raw),
    source: "registry",
    version: targetVersion,
    reason: null,
  };
}
