/**
 * T-TEACH-002 (ADR-CLASS-0001) — the class feature GATE: the enforcement
 * side of the toggle law, mounted at the composition root (src/index.ts)
 * so the frozen route files stay byte-zero (DC6-CLA-SYNC-TIER-PLAN §8).
 *
 * THE GATE LAW (§3): feature F is denied for learner L on anchor slug set S
 * iff L has a membership in an ACTIVE class whose course_slug ∈ S and whose
 * F toggle is OFF (COALESCE default ON). The union is CONSERVATIVE —
 * multi-slug anchors (the maths-variant curriculum codes) and multi-class
 * memberships deny if ANY matching class denies. Independent learners and
 * ARCHIVED classes are unaffected.
 *
 * THE ANCHOR-STRENGTH LAW (§4): an anchorless request PASSES — the gate
 * never fabricates an anchor, never becomes an existence oracle, and an
 * unresolvable reference stays the frozen route's own 404. Denial is
 * cost-zero (fires BEFORE any pipeline/LLM spend) with a FIXED client-safe
 * body (the GlobalExceptionHandler discipline — internals never leak into
 * client bodies).
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { apiError } from "../identity/errors";
import { getAuth } from "../../middleware/auth";
import type { SqlFn } from "../assessment/sql";
import type { ClassFeature } from "./features";

/** The wire code the hub matches on for its honest "your teacher turned
 *  this off" copy (ADR-CLASS-0001 §6). */
export const FEATURE_DISABLED_CODE = "feature_disabled_by_teacher";

const FEATURE_LABELS: Record<ClassFeature, string> = {
  smart_mark: "smart marking",
  tutor: "the tutor",
  cla: "the cla",
};

/** FIXED client-safe message — the only body text a denial ever carries. */
export function featureDisabledMessage(feature: ClassFeature): string {
  return `your teacher has turned off ${FEATURE_LABELS[feature]} for your class`;
}

export class FeatureDisabledByTeacherError extends Error {
  readonly feature: ClassFeature;
  constructor(feature: ClassFeature) {
    super(featureDisabledMessage(feature));
    this.feature = feature;
  }
}

export type FeatureGateDeps = { sql: SqlFn };

async function deniedViaSlugs(
  deps: FeatureGateDeps,
  learnerId: string,
  feature: ClassFeature,
  slugs: string[],
): Promise<boolean> {
  if (slugs.length === 0) return false;
  // The feature name inlines as static template text per the closed set
  // (column identifiers cannot be bind parameters; the fleet's bind-slot
  // discipline — the whitelist IS the injection fence, three static laws).
  const rows =
    feature === "smart_mark"
      ? ((await deps.sql`
          select 1 as denied
          from class_members m
          join classes c on c.id = m.class_id
          left join class_features f on f.class_id = c.id
          where m.student_id = ${learnerId}::uuid
            and c.status = 'ACTIVE'
            and c.course_slug = any(${slugs}::text[])
            and not coalesce(f.smart_mark, true)
          limit 1`) as unknown[])
      : feature === "tutor"
        ? ((await deps.sql`
          select 1 as denied
          from class_members m
          join classes c on c.id = m.class_id
          left join class_features f on f.class_id = c.id
          where m.student_id = ${learnerId}::uuid
            and c.status = 'ACTIVE'
            and c.course_slug = any(${slugs}::text[])
            and not coalesce(f.tutor, true)
          limit 1`) as unknown[])
      : ((await deps.sql`
          select 1 as denied
          from class_members m
          join classes c on c.id = m.class_id
          left join class_features f on f.class_id = c.id
          where m.student_id = ${learnerId}::uuid
            and c.status = 'ACTIVE'
            and c.course_slug = any(${slugs}::text[])
            and not coalesce(f.cla, true)
          limit 1`) as unknown[]);
  return rows.length > 0;
}

/** The question-chain bridge (§4): questionId → questions → exam_papers →
 *  subjects → curriculum_versions.code → course_registry.course_slug.
 *  Zero rows (unknown id, unset paper, unbridged curriculum code) = the
 *  honest anchorless pass-through. */
export async function courseSlugsForQuestion(deps: FeatureGateDeps, questionId: string): Promise<string[]> {
  if (!UUID_RE.test(questionId)) return [];
  const rows = (await deps.sql`
    select cr.course_slug
    from questions q
    join exam_papers ep on ep.id = q.exam_paper_id
    join subjects s on s.id = ep.subject_id
    join curriculum_versions cv on cv.id = s.curriculum_version_id
    join course_registry cr on cr.curriculum_code = cv.code
    where q.id = ${questionId}::uuid`) as Array<{ course_slug: string }>;
  return rows.map((r) => r.course_slug);
}

/** The attempt-chain bridge (§4): attemptId → the same question chain. */
export async function courseSlugsForAttempt(deps: FeatureGateDeps, attemptId: string): Promise<string[]> {
  if (!UUID_RE.test(attemptId)) return [];
  const rows = (await deps.sql`
    select cr.course_slug
    from attempts a
    join questions q on q.id = a.question_id
    join exam_papers ep on ep.id = q.exam_paper_id
    join subjects s on s.id = ep.subject_id
    join curriculum_versions cv on cv.id = s.curriculum_version_id
    join course_registry cr on cr.curriculum_code = cv.code
    where a.id = ${attemptId}::uuid`) as Array<{ course_slug: string }>;
  return rows.map((r) => r.course_slug);
}

/** The tutor session bridge: the bound session's stored course_ref. */
async function courseSlugForTutorSession(deps: FeatureGateDeps, sessionId: string): Promise<string | null> {
  if (!UUID_RE.test(sessionId)) return null;
  const rows = (await deps.sql`
    select course_ref from tutor_sessions where id = ${sessionId}::uuid`) as Array<{
    course_ref: string | null;
  }>;
  return rows[0]?.course_ref ?? null;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** A safe CLONE read of the JSON body — never consumes the stream the
 *  frozen handler will bind. Unreadable/malformed bodies resolve null and
 *  the gate passes through (the frozen route owns its malformed_body 400). */
async function bodyClone(c: { req: { raw: Request } }): Promise<Record<string, unknown> | null> {
  try {
    const clone = c.req.raw.clone();
    const parsed = await clone.json();
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export interface SurfaceGateSpec {
  feature: ClassFeature;
  /** POST-only by construction; the suffixes are the gated paths. */
  paths: readonly string[];
  /** Resolves the anchor slug set from the request (never throws into the
   *  frozen error law — resolution failures are anchorless pass-throughs). */
  resolve: (c: import("hono").Context, deps: FeatureGateDeps) => Promise<string[]>;
}

const asPath = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/** Builds the composition-root wrapper: a parent Hono whose middleware
 *  gates ONLY the named POST paths, then mounts the frozen router intact. */
export function withClassFeatureGate(
  inner: Hono,
  deps: FeatureGateDeps,
  spec: SurfaceGateSpec,
): Hono {
  const gate: MiddlewareHandler = async (c, next) => {
    if (c.req.method !== "POST") return next();
    const path = asPath(c.req.url);
    if (!spec.paths.some((p) => path === p || path.endsWith(p))) return next();
    const auth = getAuth(c);
    if (!auth) return next(); // the frozen shell owns the 401
    try {
      const slugs = await spec.resolve(c, deps);
      if (await deniedViaSlugs(deps, auth.userId, spec.feature, slugs)) {
        return c.json(
          apiError(403, FEATURE_DISABLED_CODE, featureDisabledMessage(spec.feature)),
          403,
        );
      }
    } catch {
      // gate-infrastructure failure is a PASS-THROUGH with the failure
      // logged — a broken bridge must never take the frozen route down
      // (the toggle is a policy control, not an availability dependency).
      console.error(`[feature-gate] ${spec.feature} anchor resolution failed; passing through`);
    }
    await next();
  };
  const wrapper = new Hono();
  wrapper.use("*", gate);
  wrapper.route("/", inner);
  return wrapper;
}

// ── the three surface resolvers (ADR-CLASS-0001 §4/§5) ──────────────────────

/** Tutor: body courseRef ?? bound session's course_ref. Blank courseRef
 *  (V53: blank = absent) and no session = anchorless pass-through (§4). */
export function resolveTutorAnchor(
  c: import("hono").Context,
  deps: FeatureGateDeps,
): Promise<string[]> {
  return (async () => {
    const body = await bodyClone(c);
    const rawRef = typeof body?.courseRef === "string" ? body.courseRef.trim() : "";
    if (rawRef !== "") return [rawRef];
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
    if (!sessionId) return [];
    const slug = await courseSlugForTutorSession(deps, sessionId);
    return slug ? [slug] : [];
  })();
}

/** CLA ask: only the CHECK kind has a resolvable anchor (its questionId →
 *  the question chain). Every other kind is the disclosed §4 OPEN tier. */
export function resolveClaAnchor(c: import("hono").Context, deps: FeatureGateDeps): Promise<string[]> {
  return (async () => {
    const body = await bodyClone(c);
    if (!body || body.kind !== "CHECK") return [];
    const questionId = typeof body.questionId === "string" ? body.questionId : null;
    if (!questionId) return [];
    return courseSlugsForQuestion(deps, questionId);
  })();
}

/** Smart Mark: the attemptId from the path → the attempt chain. Covers all
 *  three gated POSTs (/smart-mark + the two feedback actions). */
export function resolveSmartMarkAnchor(c: import("hono").Context, deps: FeatureGateDeps): Promise<string[]> {
  return (async () => {
    const path = asPath(c.req.url);
    const m = path.match(/\/([0-9a-fA-F-]{36})\/(?:smart-mark|parts\/[0-9a-fA-F-]{36}\/(?:feedback-explanation|improvement-plan))$/);
    const attemptId = m?.[1] ?? null;
    if (!attemptId) return [];
    return courseSlugsForAttempt(deps, attemptId);
  })();
}
