/**
 * Learner self-mark router — path parity with the frozen core (T-MIG-032
 * tranche 2): LearnerSelfMarkController @RequestMapping("/api/v1/learners/me
 * /attempts") POST /{attemptId}/self-mark → 201 SelfMarkView (:34-43).
 *
 * Route security: /api/v1/learners/me/** falls under anyRequest().authenticated()
 * (SecurityConfig.java:87-91; captured w3-selfmark-unauthed-401 pins the Boot
 * 401 before any handler work) — authz shell first.
 *
 * Body binding law (capture + frozen handler parity, same two-envelope
 * classifier as routes/assessment): binding failures (bad uuid in partId)
 * → 400 malformed_body; constraint violations (@Min/@Max/@NotNull) → 400
 * validation_failed "field: message" (first field error, :158-165 — UNCAPTURED
 * for this surface, single-field pins, disclosed); the duplicate-part rule is
 * BOUNDARY law (selfMarkRequestSchema superRefine → 400 bad_request with the
 * detail message "duplicate part in self-mark: {partId}" — NOT the fixed
 * "malformed request" body; shared BadRequestException parity :37-42).
 * Path binding: @PathVariable UUID — unparseable → 400 bad_request "malformed
 * request" (MethodArgumentTypeMismatchException :167-170).
 *
 * CAPTURED QUIRK — FROZEN-FAITHFUL AT CAPTURE (T-MIG-053, R0 call), now
 * PARTIALLY AMENDED by operator ruling (T-MIG-104): the golden
 * w3-selfmark-unknown-attempt-500 POSTs {} — Jackson binds parts=null (the
 * record declares no constraint on the list), @Valid passes (its constraints
 * are element-scoped), and the controller's dedup loop NPEs on the null list
 * (LearnerSelfMarkController.java:42-43); the catch-all advice
 * (GlobalExceptionHandler.java:224-230) serves the opaque 500. The port
 * reproduced exactly that (T-MIG-055 family, golden-captured). OPERATOR
 * RULING (a) trace 1a11c248ec801069 (2026-10-08, the 071 case-amendment
 * precedent) AMENDS the whole-field null shape on this live flipped surface:
 * the port no longer reproduces the frozen 500 — nullish parts serve the
 * mapped 400 bad_request "self-mark carries no part marks" (the service's
 * own no-part-marks gate envelope, LearnerSelfMarkService :74-76 — ONE law
 * for every no-declared-parts shape: absent / null / []). The ELEMENT-null
 * shape (parts[i] = null) is OUT of the ruling: the T-MIG-057/058 NPE-parity
 * 500 STANDS. An unknown attempt with VALID parts remains a mapped 404 in
 * the port (NotFoundException) — never "fixed".
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import { buildSelfMarkModule, NotFoundError, BadRequestError, ConflictError } from "../../services/selfmark";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { apiError } from "../../services/identity/errors";
import { requireAuth, getAuth } from "../../middleware/auth";
import { selfMarkRequestSchema } from "@syllabai/contracts";

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
 * Two-envelope classifier (routes/assessment port — duplicated here rather
 * than cross-imported to keep the two PR fences disjoint; shared-helper
 * extraction queued in next_safe_actions). Jackson binds the whole document
 * before @Valid: any binding failure anywhere beats every constraint.
 */
function classifyBodyError(error: ZodError): { kind: "malformed" } | { kind: "validation"; message: string } {
  const isBinding = (i: ZodError["issues"][number]): boolean => {
    if (i.code === "invalid_string") return true;
    if (i.code === "invalid_type") {
      const received = (i as { received?: string }).received;
      return received !== "undefined" && received !== "null";
    }
    return false;
  };
  if (error.issues.some(isBinding)) return { kind: "malformed" };
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  // the schema's superRefine carries the BOUNDARY duplicate-part law with its
  // exact frozen message — bad_request with detail (shared BadRequestException)
  if (first.code === "custom" && first.message.startsWith("duplicate part in self-mark:")) {
    return { kind: "validation", message: first.message };
  }
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : (acc ? `${acc}.${seg}` : String(seg))),
    "",
  );
  if (first.code === "invalid_type") {
    // T-MIG-053: parts null/absent never reaches the classifier (the schema
    // binds it nullish and the route throws NPE parity BEFORE dedup); a
    // non-null wrong type is a Jackson BINDING failure caught by isBinding
    // above. T-MIG-059 (F-B): the widened schema mirrors Jackson's bind law
    // (nullish element fields), so nested received-null/undefined issues no
    // longer exist — the only null-rejecting node left is the element OBJECT
    // itself (depth 2), which the elementNullIssue guard consumes for the
    // 500 law before this switch. This branch is fail-closed defensive.
    return { kind: "validation", message: `${field}: must not be null` };
  }
  if (first.code === "too_small") {
    const minimum = (first as { minimum?: number }).minimum;
    return { kind: "validation", message: `${field}: must be greater than or equal to ${minimum ?? 0}` };
  }
  if (first.code === "too_big") {
    const maximum = (first as { maximum?: number }).maximum;
    return { kind: "validation", message: `${field}: must be less than or equal to ${maximum ?? 99}` };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}



export function createLearnerSelfMarkRouter(module: ReturnType<typeof buildSelfMarkModule>): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /:attemptId/self-mark — LearnerSelfMarkController.selfMark (:34-43)
  r.post("/:attemptId/self-mark", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    const rawAttemptId = c.req.param("attemptId");
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rawAttemptId)) {
      return c.json(apiError(400, "bad_request", "malformed request"), 400);
    }
    const attemptId = rawAttemptId;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = selfMarkRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      // duplicate-part boundary law: bad_request WITH detail (not validation_failed)
      if (verdict.message.startsWith("duplicate part in self-mark:")) {
        return c.json(apiError(400, "bad_request", verdict.message), 400);
      }
      // T-MIG-057: a null LIST ELEMENT is not a validation event in the frozen
      // core. Jackson binds {"parts":[null]} into the bare List (SelfMarkRequest
      // :59 declares no @Valid container-element cascade), @Valid passes, and
      // the dedup loop NPEs on the first null element (LearnerSelfMarkController
      // :40-47) -> catch-all 500 internal_error BEFORE the service. Whole-
      // document binding order is preserved: shapes that ALSO carry a non-null
      // binding failure (e.g. a malformed partId uuid) already returned
      // malformed_body above via isBinding — Jackson binds the whole document
      // before the handler runs. Constraint-class issues on non-null elements
      // (e.g. the inferred @Max(99)) never fire in the frozen core without the
      // cascade, and the loop NPE precedes them regardless, so any element-level
      // null issue here routes to the same NPE-parity throw as the whole-field
      // guard below.
      // T-MIG-058 DEPTH PIN: "element-level" means EXACTLY parts[i] — the
      // guard must not swallow NESTED nulls (parts[i].partId / parts[i]
      // .marksAwarded, path length > 2).
      // T-MIG-059 (F-B): nested nulls no longer REACH this classifier at all —
      // the widened schema mirrors Jackson's bind law (nullish partId /
      // marksAwarded, absent-field-as-null) and they flow to the service: a
      // null partId survives the controller loop (HashMap.put(null, v) legal,
      // :44) and dies at the exact-parts gate — 400 bad_request
      // ("self-mark must cover exactly the attempt's parts"); a null
      // marksAwarded is data-dependent (400 exact-parts first, or the
      // unboxing NPE -> 500 in the bound loop, LearnerSelfMarkService :116 —
      // the service parity-throws). The depth pin stays fail-closed for any
      // residual depth-2 element null (the bare-null-element 500 law).
      const elementNullIssue = parsed.error.issues.some(
        (i) =>
          i.code === "invalid_type" &&
          (i as { received?: string }).received === "null" &&
          i.path[0] === "parts" &&
          typeof i.path[1] === "number" &&
          i.path.length === 2,
      );
      if (elementNullIssue) {
        throw new Error(
          "selfmark controller NPE parity: request.parts() carries a null element (LearnerSelfMarkController.java:43 — no @Valid cascade on List<PartSelfMark>)",
        );
      }
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    // T-MIG-104 AMENDED LAW (operator ruling (a), trace 1a11c248ec801069;
    // the 071 case-amendment precedent): the frozen controller law iterated
    // request.parts() directly — with parts ABSENT or JSON-null, binding
    // succeeded (no constraint on the list), @Valid passed, and the loop
    // NPE'd (LearnerSelfMarkController.java:42-43); the unmapped NPE served
    // the opaque 500 the port reproduced (T-MIG-053/055, golden-captured).
    // The operator amended the golden law: the port now serves the MAPPED
    // product envelope — the SAME 400 the service's no-part-marks gate
    // (LearnerSelfMarkService.java:74-76) serves for the empty list, so ONE
    // law covers every no-declared-parts shape (absent / null / []). The
    // ELEMENT-null shape (parts[i] = null) keeps its T-MIG-057/058 NPE-parity
    // 500 — the elementNullIssue guard below is UNCHANGED by this amendment.
    if (parsed.data.parts == null) {
      return c.json(apiError(400, "bad_request", "self-mark carries no part marks"), 400);
    }
    // controller law: the dedup loop builds the Map (the schema's put-semantics
    // superRefine already rejected every displace-non-null duplicate —
    // T-MIG-059); parts is non-null here (the T-MIG-104 amended 400 above). Each
    // entry normalizes to Jackson's bind law: an ABSENT field binds as null,
    // so `?? null` mirrors the record the frozen controller would hold. The
    // loop's Map.set is last-write-wins — exactly the HashMap.put sequence
    // when no duplicate threw (a stored-null displacement is silent, so
    // {X:null},{X:1} lands {X:1} here exactly as frozen).
    const marksByPartId = new Map<string | null, number | null>();
    for (const p of parsed.data.parts) {
      marksByPartId.set(p.partId ?? null, p.marksAwarded ?? null);
    }
    try {
      const view = await module.selfMark.selfMark(auth.userId, attemptId, marksByPartId, parsed.data.comment ?? null);
      return c.json(view, 201);
    } catch (e) {
      if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
      if (e instanceof BadRequestError) return c.json(apiError(400, "bad_request", e.message), 400);
      if (e instanceof ConflictError) return c.json(apiError(409, "conflict", e.message), 409);
      throw e;
    }
  });

  return r;
}

export function buildSelfMarkRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildSelfMarkModule(sql);
  return { module, selfMarkRoute: createLearnerSelfMarkRouter(module) };
}

