/**
 * Teach-Me render gate (T-TEACHME-001 run-003) — the flags.json law for the
 * learn-by-teaching lane, exactly the ADR-CLASS-0001 practice adapted to
 * content that seneca-hub.ts / ugm.ts carry:
 *
 *   a flag FILE, the flag KEY or the course slug being ABSENT = OFF —
 *   nothing renders; flipping one key kills the surface without a code
 *   deploy. The flag gates RENDERING only; it never fabricates data.
 *
 * The serving scope of record is the API mirror (apps/api/src/teach-me/
 * config.ts TEACH_ME_CONFIG.flags.teachMe) — the behavioural suite's
 * flags-parity test keeps the two honest against each other, so the key
 * here stays the bare { enabled, courses } pair of that mirror.
 *
 * The pure half of this module is importable from tests without the corpus
 * seam; the cached IO half lazy-imports lib/corpus (server-only) so the
 * render-time read keeps the bundle-offload posture of every other
 * content surface.
 */
import { cache } from "react";

/** The flags.json key of record (run-003 flip; parity-pinned API-side). */
export const TEACH_ME_FLAG_KEY = "teachMe";

export interface TeachMeGate {
  enabled: boolean;
  courses: readonly string[];
}

export const TEACH_ME_GATE_OFF: TeachMeGate = { enabled: false, courses: [] };

/**
 * Absent file / absent key / disabled / malformed = OFF — a broken flag
 * entry must never surface the lane half-on. `enabled !== true` is a hard
 * OFF (truthy strings/numbers do not count), and the course list only
 * accepts non-empty strings (a malformed list degrades to no courses, so
 * the gate can render only the honest roadmap state).
 */
export function parseTeachMeGate(raw: unknown): TeachMeGate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return TEACH_ME_GATE_OFF;
  const rec = raw as Record<string, unknown>;
  if (rec["enabled"] !== true) return TEACH_ME_GATE_OFF;
  const list = rec["courses"];
  if (!Array.isArray(list)) return TEACH_ME_GATE_OFF;
  const courses = list.filter((c): c is string => typeof c === "string" && c.length > 0);
  return { enabled: true, courses };
}

/**
 * The render-time gate of record. Server-side only (the corpus seam is
 * server-only); components import `teachMeEnabledForCourse` / `teachMeGate`.
 */
export const teachMeGate = cache(async (): Promise<TeachMeGate> => {
  const { loadContentJson } = await import("@/lib/corpus");
  const raw = await loadContentJson("flags.json");
  if (!raw) return TEACH_ME_GATE_OFF;
  const flags = (raw as { flags?: Record<string, unknown> }).flags;
  if (!flags || typeof flags !== "object") return TEACH_ME_GATE_OFF;
  return parseTeachMeGate(flags[TEACH_ME_FLAG_KEY]);
});

/** ON for a course only when the gate is enabled AND lists the slug. */
export const teachMeEnabledForCourse = cache(
  async (courseSlug: string): Promise<boolean> => {
    const gate = await teachMeGate();
    return gate.enabled && gate.courses.includes(courseSlug);
  },
);
