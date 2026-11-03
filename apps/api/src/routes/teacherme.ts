/**
 * Teacher-me router — T-TIER1 run-002 (v2-NATIVE, additive; NO frozen-core
 * counterpart). The account-backed teacher stores, all under
 * @RequestMapping-equivalent "/api/v1/teachers/me":
 *
 *   GET  /saved-tests                          → 200 SavedTestsView
 *   PUT  /saved-tests                          → 200 SavedTestsView
 *   GET  /teaching-coverage                    → 200 TeachingCoverageView
 *   PUT  /teaching-coverage/{courseSlug}       → 200 TeachingCoverageView
 *   GET  /content-reviews                      → 200 ContentReviewsView
 *   PUT  /content-reviews                      → 200 ContentReviewsView
 *
 * Route security: the shell runs requireAuth FIRST (the Boot 401 before any
 * handler work — the classroom.ts shell law), then requireRole("TEACHER",
 * "ADMIN") (the classroom.ts role law — these are TEACHER-owned stores; a
 * student's token gets the Boot 403 before any handler work).
 *
 * Exception law (the learner-me family, verbatim):
 *   BadRequestError             → 400 bad_request (the kebab slug law)
 *   path slug law               → re-validated in the service (400
 *                                 bad_request "course slug must be a
 *                                 kebab-case registry key" verbatim)
 *   body binding failures       → 400 malformed_body (Jackson binds before
 *                                 @Valid — the two-envelope R-1 law)
 *   constraint violations       → 400 validation_failed (first field error,
 *                                 the jakarta default "must not be null")
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
  putContentReviewsRequestSchema,
  putSavedTestsRequestSchema,
  putTeachingCoverageRequestSchema,
} from "@syllabai/contracts";
import { buildTeacherMeModule, type TeacherMeModule } from "../services/teacher-me";
import { BadRequestError, defaultClock } from "../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * The two-envelope classifier — the teacher-me edition of the learner-me
 * law (R-1): binding failures (wrong JSON types, unknown enum values that
 * cannot bind) beat constraints; the absent field is the jakarta default
 * ("must not be null").
 */
function classifyBodyError(error: ZodError): { kind: "malformed" } | { kind: "validation"; message: string } {
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    if (received !== "undefined" && received !== "null") return { kind: "malformed" };
    return { kind: "validation", message: `${field}: must not be null` };
  }
  if (first.code === "invalid_string") {
    // a regex/format failure is a @Pattern CONSTRAINT (the learner-me law);
    // an unrecognised enum VALUE cannot bind (Jackson enum binding) — but
    // the closed vocabularies here are the wire contract, so the honest
    // surface is validation_failed naming the field either way (the
    // fallback below carries the enum-vocabulary failures verbatim).
    return { kind: "validation", message: `${field}: ${first.message}` };
  }
  if (first.code === "too_small" || first.code === "too_big") {
    const min = (first as { minimum?: number }).minimum;
    const max = (first as { maximum?: number }).maximum;
    if (first.code === "too_small") {
      return { kind: "validation", message: `${field}: must be greater than or equal to ${min ?? 0}` };
    }
    return { kind: "validation", message: `${field}: must be less than or equal to ${max ?? 0}` };
  }
  if (first.code === "custom") {
    return { kind: "validation", message: `${field}: ${first.message}` };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}

function bodyErrorResponse(
  c: { json: (b: unknown, s: number) => Response },
  error: ZodError,
): Response {
  const verdict = classifyBodyError(error);
  if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
  return c.json(apiError(400, "validation_failed", verdict.message), 400);
}

/** The shared error mapping for every teacher-me route. */
function mapErrors(e: unknown, c: { json: (b: unknown, s: number) => Response }): Response | null {
  if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
  return null;
}

export function createTeacherMeRouter(module: TeacherMeModule): Hono {
  const r = new Hono();

  // authz shell FIRST: the Boot 401 (unauthenticated) then the Boot 403
  // (authenticated-but-insufficient) — the classroom.ts shell law verbatim.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    const roleGate = requireRole(c, "TEACHER", "ADMIN");
    if (roleGate instanceof Response) return roleGate;
    await next();
  });

  // GET /saved-tests — the account's Test Builder library (honest empty
  // when the account never saved one).
  r.get("/saved-tests", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    try {
      return c.json(await module.listSavedTests(auth.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // PUT /saved-tests — the FULL desired library, idempotent replace (an
  // empty array clears the library). Slug law is service-side (400
  // bad_request verbatim); body law is the two-envelope classifier.
  r.put("/saved-tests", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = putSavedTestsRequestSchema.safeParse(body);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    try {
      return c.json(await module.setSavedTests(auth.userId, parsed.data), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /teaching-coverage — every course's taught-code overlay (course-slug
  // order; the honest empty is { coverage: [] }).
  r.get("/teaching-coverage", async (c) => {
    const auth = getAuth(c)!;
    try {
      return c.json(await module.teachingCoverage(auth.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // PUT /teaching-coverage/{courseSlug} — the FULL code set for that ONE
  // course (an empty array deletes the row — the honest clear). The path
  // slug is re-validated in the service (the learner-me kebab law).
  r.put("/teaching-coverage/:courseSlug", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = putTeachingCoverageRequestSchema.safeParse(body);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    try {
      return c.json(
        await module.setTeachingCoverageCourse(auth.userId, c.req.param("courseSlug"), parsed.data),
        200,
      );
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // GET /content-reviews — the account's AI-content validation verdicts
  // (newest first, one per resource; the honest empty is { reviews: [] }).
  r.get("/content-reviews", async (c) => {
    const auth = getAuth(c)!;
    try {
      return c.json(await module.contentReviews(auth.userId), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // PUT /content-reviews — the FULL desired verdict set, idempotent replace;
  // the one-verdict-per-resource law is enforced (posted dupes keep the
  // first; the unique index backs the store).
  r.put("/content-reviews", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = putContentReviewsRequestSchema.safeParse(body);
    if (!parsed.success) return bodyErrorResponse(c, parsed.error);
    try {
      return c.json(await module.setContentReviews(auth.userId, parsed.data), 200);
    } catch (e) {
      const mapped = mapErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

export function buildTeacherMeRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildTeacherMeModule(sql, defaultClock);
  return { module, teacherMeRoute: createTeacherMeRouter(module) };
}
