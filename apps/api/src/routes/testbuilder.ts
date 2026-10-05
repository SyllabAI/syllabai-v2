/**
 * Test-builder route factories — path parity with the frozen Java core
 * (T-MIG-034; verified 2026-10-05):
 *   TestBuilderController  @RequestMapping("/api/v1/teacher/tests")  (:29)
 *     GET /preview           (rootId, topicNodeIds, maxQuestions,
 *                             targetMarks, includeAnswers)
 *     GET /weakness-options  (rootId)
 *
 * Route security (SecurityConfig.java:87): /api/v1/teacher/** →
 * hasAnyRole('TEACHER','ADMIN') — the authz shell runs before every
 * handler (Boot 401/403 bodies via requireRole, the captured
 * w3-teacher-tests-*-unauthed-401 envelopes).
 *
 * Query binding law (frozen GlobalExceptionHandler.java + the captured
 * envelopes):
 *   - MISSING required param → 400 validation_failed "missing required
 *     parameter: <name>" (MissingServletRequestParameterException :185-190;
 *     CAPTURED by w3-tests-weakness-options-teacher-200 for rootId).
 *   - Value present but wrong type (non-UUID rootId/topicNodeIds element,
 *     non-integer maxQuestions/targetMarks, non-boolean includeAnswers) →
 *     400 bad_request "malformed request"
 *     (MethodArgumentTypeMismatchException :167-170).
 *   - EMPTY value (""): Spring treats "" as ABSENT for non-String types —
 *     Integer/UUID/Boolean params bind to the default/null (history-surface
 *     precedent, T-MIG-030 tranche-2 header). For List<UUID> the
 *     StringToCollectionConverter maps "" to null → absent. Disclosed as
 *     INFERRED (uncaptured).
 *   - topicNodeIds binds comma-separated (a,b) — List<UUID> conversion;
 *     any non-UUID element → 400 bad_request.
 *   - includeAnswers has defaultValue "false".
 *
 * Weakness-options: the ClassAnalyticsService.overview dependency is
 * UNPORTED in v2 (not T-MIG-033's surface — that is teachermarking/sme).
 * The route honest-501s with the task reference until R0 routes the
 * analytics port — the deterministic selection law is ported and
 * unit-pinned behind the ClassAnalyticsPort seam (never a fabricated
 * body, never a silent gap).
 */
import { Hono } from "hono";
import { z } from "zod";
import type {
  TestPreviewView,
  WeaknessOptionsView,
} from "@syllabai/contracts";
import { requireRole } from "../middleware/auth";
import { apiError, NotFoundException } from "../services/identity/errors";
import { AnalyticsUnavailable } from "../services/testbuilder/builder";
import type { TestBuilder } from "../services/testbuilder/builder";
import { buildTestBuilderComponents } from "../services/testbuilder";

const uuidSchema = z.string().uuid();

/** MethodArgumentTypeMismatchException handler body (:167-170) — verbatim. */
const malformedRequest = () => apiError(400, "bad_request", "malformed request");

/** MissingServletRequestParameterException handler body (:185-190) — verbatim shape, param name interpolated. */
const missingParam = (name: string) =>
  apiError(400, "validation_failed", `missing required parameter: ${name}`);

/**
 * Single non-String query-param binder with Spring "" -as-absent parity:
 * absent or "" → null; a value failing the check → the type-mismatch
 * envelope; a valid value → parsed.
 */
function bindParam(
  raw: string | undefined,
  check: (v: string) => boolean,
): { value: string | null; error: ReturnType<typeof malformedRequest> | null } {
  if (raw === undefined || raw === "") return { value: null, error: null };
  if (!check(raw)) return { value: null, error: malformedRequest() };
  return { value: raw, error: null };
}

function isIntegerText(v: string): boolean {
  return /^[+-]?\d+$/.test(v);
}

function isBooleanText(v: string): boolean {
  return v === "true" || v === "false";
}

export function createTestBuilderRouter(deps: { builder: TestBuilder }): Hono {
  const r = new Hono();

  r.get("/preview", async (c) => {
    const auth = requireRole(c, "TEACHER", "ADMIN");
    if (auth instanceof Response) return auth;

    // rootId is REQUIRED (no defaultValue): absent/"" → the captured
    // validation_failed envelope (w3-tests-weakness-options-teacher-200
    // pins the weakness-options sibling — same binding law).
    const rootIdRaw = c.req.query("rootId");
    if (rootIdRaw === undefined || rootIdRaw === "") {
      return c.json(missingParam("rootId"), 400);
    }
    if (!uuidSchema.safeParse(rootIdRaw).success) {
      return c.json(malformedRequest(), 400);
    }

    // topicNodeIds: comma-separated List<UUID>; absent/"" → null ("" →
    // absent, StringToCollectionConverter parity — inferred, uncaptured);
    // any non-UUID element → the type-mismatch envelope.
    const topicsRaw = c.req.query("topicNodeIds");
    let topicNodeIds: string[] | null = null;
    let topicsError = false;
    if (topicsRaw !== undefined && topicsRaw !== "") {
      const parts = topicsRaw.split(",");
      topicsError = parts.some((p) => !uuidSchema.safeParse(p).success);
      if (!topicsError) topicNodeIds = parts;
    }
    if (topicsError) {
      return c.json(malformedRequest(), 400);
    }

    const maxQ = bindParam(c.req.query("maxQuestions"), isIntegerText);
    if (maxQ.error) return c.json(maxQ.error, 400);
    const maxQuestions = maxQ.value === null ? null : Number(maxQ.value);

    const target = bindParam(c.req.query("targetMarks"), isIntegerText);
    if (target.error) return c.json(target.error, 400);
    const targetMarks = target.value === null ? null : Number(target.value);

    const include = bindParam(c.req.query("includeAnswers"), isBooleanText);
    if (include.error) return c.json(include.error, 400);
    const includeAnswers = include.value === "true";

    try {
      const view: TestPreviewView = await deps.builder.preview(
        rootIdRaw,
        topicNodeIds,
        maxQuestions,
        targetMarks,
        includeAnswers,
      );
      return c.json(view, 200);
    } catch (e) {
      if (e instanceof NotFoundException) {
        return c.json(apiError(404, e.code, e.message), 404);
      }
      throw e;
    }
  });

  r.get("/weakness-options", async (c) => {
    const auth = requireRole(c, "TEACHER", "ADMIN");
    if (auth instanceof Response) return auth;

    const rootIdRaw = c.req.query("rootId");
    if (rootIdRaw === undefined || rootIdRaw === "") {
      return c.json(missingParam("rootId"), 400);
    }
    if (!uuidSchema.safeParse(rootIdRaw).success) {
      return c.json(malformedRequest(), 400);
    }

    try {
      const view: WeaknessOptionsView = await deps.builder.weaknessOptions(rootIdRaw);
      return c.json(view, 200);
    } catch (e) {
      if (e instanceof AnalyticsUnavailable) {
        // Honest unported-dependency gap (T-MIG-020 501 convention): the
        // class-analytics read service is unclaimed work; the route NEVER
        // fabricates weakness data.
        return c.json(
          apiError(
            501,
            "not_implemented",
            "class analytics dependency not yet ported (T-MIG-034 dependency; tracked for the analytics lane)",
          ),
          501,
        );
      }
      if (e instanceof NotFoundException) {
        return c.json(apiError(404, e.code, e.message), 404);
      }
      throw e;
    }
  });

  return r;
}

/**
 * Module + routers composition for the app root — mirrors
 * buildAssessmentRouters' shape exactly (env → requireDatabaseUrl →
 * createSql; the analytics port stays null until R0 routes the class
 * analytics lane).
 */
export function buildTestBuilderRouters(env: Record<string, string | undefined> = process.env) {
  const components = buildTestBuilderComponents(env);
  return {
    components,
    testBuilderRoute: createTestBuilderRouter({ builder: components.builder }),
  };
}
