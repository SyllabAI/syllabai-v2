/**
 * Observed error-response envelopes — ported from the frozen Java core's
 * ACTUAL wire behavior (no Java record exists for these; they are Jackson
 * ErrorAttributes output + the app's @RestControllerAdvice).
 *
 * Sources (evidence: T-MIG-004 captures on main, 2026-10-05):
 *   1. Boot-default envelope — produced by the Spring Security filter
 *      chain BEFORE any controller runs (e.g. 401 with no/invalid token):
 *        { timestamp, status, error, path }
 *      Captures: content-reader-unauthed-401, content-docs-unauthed-401,
 *      curriculum-versions-unauthed-401, teacher-curriculum-versions-
 *      unauthed-401, question-assets-unauthed-401 (error: "Unauthorized").
 *      Note `message` is ABSENT (Boot's default include-message=never)
 *      and `path` is present — the mirror image of shape 2.
 *   2. Advice envelope — produced by the app's exception handling for
 *      application-level 4xx/5xx:
 *        { status, error, message, timestamp }
 *      Captures: content-docs-search-missing-query-400 ("validation_failed"),
 *      content-docs-canonical-unknown-404 ("not_found"). No `path` field.
 *
 * These schemas pin the RESPONSE side only (what the v2 api must emit and
 * what the hub client must parse). The golden runner compares full bodies
 * with `tolerate: ["timestamp"]`; these schemas exist so typed clients
 * share one definition of both envelopes instead of re-inventing them.
 */
import { z } from "zod";

/** Shape 1 — Spring Security filter chain / Boot default ErrorAttributes. */
export const bootDefaultErrorSchema = z.object({
  timestamp: z.string() /* ISO-8601, golden `tolerate` */,
  status: z.number().int(),
  error: z.string(),
  path: z.string(),
});
export type BootDefaultError = z.infer<typeof bootDefaultErrorSchema>;

/** Shape 2 — application advice (ApiError-class responses). */
export const adviceErrorSchema = z.object({
  status: z.number().int(),
  error: z.string(),
  message: z.string(),
  timestamp: z.string() /* ISO-8601, golden `tolerate` */,
});
export type AdviceError = z.infer<typeof adviceErrorSchema>;
