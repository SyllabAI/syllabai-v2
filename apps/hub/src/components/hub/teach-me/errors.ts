/**
 * Honest failure surfacing for the Teach-Me lane (T-TEACHME-001 run-003).
 *
 * The API's typed fail-closed vocabulary (packages/contracts/src/teach-me.ts)
 * arrives at the hub as ApiError { status, message } — the client `request`
 * seam keeps the server's own `message` verbatim, and every teach-me law
 * message is written learner-honest ("Daily Teach-Me session cap reached —
 * back tomorrow."). So the hub's job is NOT to re-derive error codes (that
 * would duplicate the server's single vocabulary) — it is to class the
 * failure by status, add a headline that says what actually happened, and
 * carry the server copy verbatim as the detail. 4xx stays honest by design
 * (the aiAskErrorMessage law); 5xx is the one place the hub says what is
 * really true instead of a bare 500.
 */
import type { ApiError } from "@/lib/api";

export type TeachMeFailureClass =
  | "unauthenticated" // 401 — session expired (the global handler also fires)
  | "forbidden" // 403 — NOT_OWNER
  | "guardrail" // 409 — quota / ceilings / word floor / overlap / flag / shape / eligibility
  | "missing" // 404
  | "provider" // 503 — the LLM chain of record is briefly unavailable
  | "network" // fetch-level
  | "unknown";

export interface TeachMeFailure {
  cls: TeachMeFailureClass;
  headline: string;
  /** the server's own honest copy, verbatim — null when there is none */
  detail: string | null;
  status: number | null;
}

const HEADLINES: Record<TeachMeFailureClass, string> = {
  unauthenticated: "Sign in to teach the Pupil",
  forbidden: "That session belongs to another learner",
  guardrail: "Teach-Me guardrail",
  missing: "That session no longer exists",
  provider: "The Pupil is briefly unavailable",
  network: "We couldn't reach the server",
  unknown: "Something went wrong",
};

export function classifyTeachMeFailure(err: unknown): TeachMeFailure {
  if (err instanceof Error && err.name === "TypeError") {
    return { cls: "network", headline: HEADLINES.network, detail: null, status: null };
  }
  if (err && typeof err === "object" && "status" in err) {
    const apiErr = err as ApiError;
    const cls: TeachMeFailureClass =
      apiErr.status === 401
        ? "unauthenticated"
        : apiErr.status === 403
          ? "forbidden"
          : apiErr.status === 404
            ? "missing"
            : apiErr.status === 409
              ? "guardrail"
              : apiErr.status === 503
                ? "provider"
                : apiErr.status >= 500
                  ? "provider"
                  : "unknown";
    return {
      cls,
      headline: HEADLINES[cls],
      detail: apiErr.message ?? null,
      status: apiErr.status,
    };
  }
  return {
    cls: "unknown",
    headline: HEADLINES.unknown,
    detail: err instanceof Error ? err.message : null,
    status: null,
  };
}

/**
 * Live word counter for the composer — DISPLAY ONLY. The 40-word floor is
 * ADR-040 D4 law enforced server-side (apps/api/src/teach-me/config.ts is
 * the single constants object of record); the hub deliberately does not
 * duplicate the threshold, it just shows the learner the substance of what
 * they are writing and lets the nudge response say the rest.
 */
export function wordsOf(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return (trimmed.match(/\S+/g) ?? []).length;
}
