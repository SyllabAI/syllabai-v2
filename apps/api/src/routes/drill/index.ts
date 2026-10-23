/**
 * F-182 build — the drill surface routers (the per-spec-point drill; prereg
 * of record docs/F182-DRILL-BUILD-PLAN.md under the opening plan
 * docs/F182-DRILL-SURFACE-PLAN.md §6.1).
 *
 * F-182-SPEC-NATIVE paths (not a frozen-port parity band — the DC-7 posture;
 * the product spec is Kognity dossier v1.1 Deep Dive D §8.5 row 1):
 *   GET  /api/v1/learners/me/drill/addresses?course=<slug>
 *   POST /api/v1/learners/me/drill/draw
 *   POST /api/v1/learners/me/drill/evidence
 *
 * Router posture is the createLearnerProgressRouter shape of record verbatim:
 * the authz shell answers BEFORE every handler (anonymous callers get 401,
 * never 404); the principal is getAuth(c).userId. Contracts-first
 * (MIGRATION_PLAN §4.1): every body/query binds through
 * @syllabai/contracts drill schemas — a failed safeParse is the binding
 * failure (400 malformed_body / 400 bad_request for the query), the
 * assessment-route law.
 *
 * Zero-stakes law: the handlers write ONLY the drill tables (services/drill/
 * store.ts) and read NO progress-bearing table — no attempts, no
 * ai_mark_events, no gradebook events, ever. F-184 adds ONE read-only path
 * over the drill's own evidence lane (GET /strengths — the decay-driven
 * strength projection; ADR-031: computed at read, never persisted).
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import { requireDatabaseUrl } from "@syllabai/db";
import {
  drillAddressesQuerySchema,
  drillDrawRequestSchema,
  drillEvidenceRequestSchema,
  strengthQuerySchema,
} from "@syllabai/contracts";

import { createSql } from "../../services/identity/users";
import { getAuth, requireAuth } from "../../middleware/auth";
import { toErrorResponse } from "../../services/identity/errors";
import type { SqlFn } from "../../services/tutor/sql";
import { bundleBank, UnknownCourseError, type DrillBank } from "../../services/drill/bank";
import {
  drawForLearner,
  recordDrillEvidence,
} from "../../services/drill/serve";
import { strengthsForLearner } from "../../services/drill/strength-serve";
import type { DrillMethodCreditGenerator } from "../../services/drill/reveal";
import { createDrillStore, type DrillStore } from "../../services/drill/store";

/** The assessment-route binding law: a failed safeParse IS the binding failure. */
function malformedBodyMessage(err: ZodError): string {
  return `request body is not readable (check field types and enum values): ${err.issues[0]?.message ?? "unparseable"}`;
}

async function readJsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined; // truly empty / non-JSON body — the same binding failure
  }
}

export interface DrillRouterDeps {
  bankOf(course: string): DrillBank;
  store: DrillStore;
  /**
   * F-184 — the injected clock (ADR-031 posture): the strengths projection
   * computes decay AT READ against this `now` and stamps it as generatedAt.
   * Default = the wall clock; tests freeze it.
   */
  nowOf?: () => Date;
  /**
   * F-183 — the Smart Mark method-credit seam (structured drill parts).
   * Optional + nullable: the dormant posture (zero-key boots, tests without a
   * stub) degrades to the honest null on the ack — law L6.
   */
  methodCreditGenerator?: DrillMethodCreditGenerator | null;
}

export function createDrillRouter(deps: DrillRouterDeps): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig anyRequest().authenticated() parity) —
  // the same gate posture as the learner routers next door.
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /api/v1/learners/me/drill/addresses?course=<slug> — the drillable
  // address picker: the census of record's summary plus ONLY the rows at or
  // above the fail-closed floor (policy P3 — the surface offers exactly
  // these; thin/uncovered rows stay out until content lands).
  r.get("/addresses", async (c) => {
    const parsed = drillAddressesQuerySchema.safeParse({
      course: c.req.query("course"),
    });
    if (!parsed.success) {
      return c.json({ status: 400, error: "bad_request", message: "malformed request" }, 400);
    }
    const bank = deps.bankOf(parsed.data.course); // UnknownCourseError -> 404 via onError
    return c.json({
      course: bank.course,
      summary: bank.censusSummary,
      addresses: bank.addressRows.filter((a) => a.drillable),
    });
  });

  // GET /api/v1/learners/me/drill/strengths?course=<slug> — the F-184
  // decay-driven strength projection: ONE read-only GET over the drill's own
  // evidence lane, composed by services/drill/strength-serve from THE strength
  // law of record (laws S1..S6). Every strength number is computed at THIS
  // read (ADR-031: computed, never persisted — no strength table exists) and
  // stamped generatedAt; the response carries the SERVER's BAR_SEMANTICS so
  // the surface renders the law's strings verbatim; the practice-now queue
  // rides beside the bars it distills (law S5). No write, no gradebook
  // surface, no progress-bearing read — the zero-stakes law holds verbatim.
  r.get("/strengths", async (c) => {
    const parsed = strengthQuerySchema.safeParse({
      course: c.req.query("course"),
    });
    if (!parsed.success) {
      return c.json({ status: 400, error: "bad_request", message: "malformed request" }, 400);
    }
    const auth = getAuth(c)!; // shell invariant: authenticated
    const bank = deps.bankOf(parsed.data.course); // UnknownCourseError -> 404 via onError
    const outcome = await strengthsForLearner(bank, deps.store, auth.userId, parsed.data.course, deps.nowOf?.() ?? new Date());
    return c.json(outcome);
  });

  // POST /api/v1/learners/me/drill/draw — one 5-part draw at a spec-point
  // address (policies P1..P5), persisted for recency (P4) + audit, returned
  // with content views that carry NO answer facts (choices ship without
  // isCorrect; solutionMd rides the evidence response only).
  r.post("/draw", async (c) => {
    const body = await readJsonBody(c);
    const parsed = drillDrawRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ status: 400, error: "malformed_body", message: malformedBodyMessage(parsed.error) }, 400);
    }
    const auth = getAuth(c)!; // shell invariant: authenticated
    const bank = deps.bankOf(parsed.data.course);
    const outcome = await drawForLearner(bank, deps.store, auth.userId, parsed.data);
    return c.json(outcome, 201);
  });

  // POST /api/v1/learners/me/drill/evidence — the F-055-SHAPED seam (ADR-016:
  // score, time, confidence, flag) over the drill address space: one
  // immutable row per (draw, part); the ack carries the INSTANT post-attempt
  // reveal (solutionMd) and the server-side MCQ grading (structured parts
  // stay ungraded — null, never invented). No gradebook surface is touched.
  r.post("/evidence", async (c) => {
    const body = await readJsonBody(c);
    const parsed = drillEvidenceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ status: 400, error: "malformed_body", message: malformedBodyMessage(parsed.error) }, 400);
    }
    const auth = getAuth(c)!; // shell invariant: authenticated
    const draw = await deps.store.drawOf(auth.userId, parsed.data.drawId);
    if (!draw) {
      // Ownership-scoped resolution — the course lives on the draw row, so
      // the bank resolves only after the draw itself is known to be ours.
      return c.json(
        { status: 404, error: "not_found", message: `drill draw ${parsed.data.drawId} not found` },
        404,
      );
    }
    const bank = deps.bankOf(draw.course);
    const outcome = await recordDrillEvidence(bank, deps.store, auth.userId, parsed.data, deps.methodCreditGenerator ?? null);
    return c.json(outcome, 201);
  });

  return r;
}

/** Module + router composition for the app root — the buildLearnerProgressRouters shape. */
export function buildDrillRouters(
  env: Record<string, string | undefined> = process.env,
  opts: {
    bankOf?: (course: string) => DrillBank;
    store?: DrillStore;
    methodCreditGenerator?: DrillMethodCreditGenerator | null;
  } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql: SqlFn = createSql(databaseUrl) as unknown as SqlFn;
  return {
    drillRoute: createDrillRouter({
      bankOf: opts.bankOf ?? bundleBank,
      store: opts.store ?? createDrillStore(sql),
      methodCreditGenerator: opts.methodCreditGenerator ?? null,
    }),
  };
}

/** Error mapping for the app root's onError (identity/errors + UnknownCourseError). */
export function drillErrorResponse(err: unknown): { status: number; body: { status: number; error: string; message: string; timestamp: string } } | null {
  if (err instanceof UnknownCourseError) {
    return {
      status: 404,
      body: { status: 404, error: "not_found", message: err.message, timestamp: new Date().toISOString() },
    };
  }
  return toErrorResponse(err);
}
