/**
 * T1 prereq feedback — the schema law of record (T-KG-TRIPWIRE-1 Phase 1).
 *
 * Spec: apps/hub/docs/KG-F8-TELEMETRY-TRIPWIRE-SPEC.md §4/§7. One learner
 * signal is EVIDENCE, never a verdict (I1/I2): events are anonymous,
 * browser-local, course-keyed, and never ride the account doc — the session
 * id is a random per-browser id with NO account link, so the account plane
 * can never attribute a signal. Phase 1 adds zero network calls; the only
 * consumer beyond this module is the Phase 2 weekly report, which reads
 * AGGREGATES (≥3 distinct sessions in a rolling 7 days) and re-derives
 * corpus tiers from the repo of record — never from the event's tier field
 * (the fork can only render what its drawer shows, so `rendered_tier`
 * carries the drawer's tag vocabulary; the corpus join happens report-side).
 *
 * The renderer fork (public/kg/openhuman-course-explorer.html) carries the
 * same law inline — it is a self-contained build and cannot import TS. The
 * fork-contract half of kg-prereq-feedback.test.ts pins the two
 * implementations together: changing a constant here without the fork (or
 * the fork without here) fails the test.
 */

export const KFB_EVENT = "kg_prereq_feedback";
export const KFB_VERDICTS = ["WRONG_DIRECTION", "NOT_A_PREREQ", "UNCLEAR"] as const;
export type KgFeedbackVerdict = (typeof KFB_VERDICTS)[number];
export const KFB_TEXT_CAP = 280;
export const KFB_STORE_PREFIX = "syllabai.kg-feedback:";
export const KFB_SESSION_KEY = "syllabai.kg-feedback.session";

export interface KgPrereqFeedbackEvent {
  event: typeof KFB_EVENT;
  course: string;
  a: string;
  b: string;
  type: "pre";
  rendered_tier: string;
  verdict: KgFeedbackVerdict;
  free_text: string;
  ts: string;
  session: string;
}

export function kfbStoreKey(course: string): string {
  return KFB_STORE_PREFIX + course;
}

export type BuildFeedbackResult =
  | { ok: true; event: KgPrereqFeedbackEvent }
  | { ok: false; reason: string };

/** Build + validate one event (the fork mirrors this law inline). */
export function buildPrereqFeedback(input: {
  course: string;
  a: string;
  b: string;
  renderedTier: string;
  verdict: string;
  freeText?: string;
  ts?: string;
  session: string;
}): BuildFeedbackResult {
  const course = String(input.course ?? "").trim();
  const a = String(input.a ?? "").trim();
  const b = String(input.b ?? "").trim();
  const verdict = String(input.verdict ?? "");
  if (!(KFB_VERDICTS as readonly string[]).includes(verdict)) {
    return { ok: false, reason: `verdict outside the store vocabulary: ${verdict}` };
  }
  if (!course || !a || !b) return { ok: false, reason: "course, a and b are required" };
  return {
    ok: true,
    event: {
      event: KFB_EVENT,
      course,
      a,
      b,
      type: "pre",
      rendered_tier: String(input.renderedTier ?? ""),
      verdict: verdict as KgFeedbackVerdict,
      free_text: String(input.freeText ?? "").slice(0, KFB_TEXT_CAP),
      ts: input.ts ?? new Date().toISOString(),
      session: String(input.session ?? "").trim() || "kfb-unavailable",
    },
  };
}

/** Structural guard for anything claiming to be a stored event (report/export ingestion). */
export function isKgFeedbackEvent(x: unknown): x is KgPrereqFeedbackEvent {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    e.event === KFB_EVENT &&
    typeof e.course === "string" &&
    e.course.length > 0 &&
    typeof e.a === "string" &&
    e.a.length > 0 &&
    typeof e.b === "string" &&
    e.b.length > 0 &&
    e.type === "pre" &&
    typeof e.rendered_tier === "string" &&
    (KFB_VERDICTS as readonly string[]).includes(String(e.verdict)) &&
    typeof e.free_text === "string" &&
    e.free_text.length <= KFB_TEXT_CAP &&
    typeof e.ts === "string" &&
    !Number.isNaN(Date.parse(e.ts)) &&
    typeof e.session === "string" &&
    e.session.length > 0
  );
}

// ── browser-local store (course-keyed, append-only) ─────────────────────────

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read one course's stored events. A corrupt record reads as empty — honest
 * zeros, never a crash; the next append overwrites the junk with a clean
 * array (the store is a signal cache, not a ledger of record).
 */
export function readKgFeedback(course: string): KgPrereqFeedbackEvent[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(kfbStoreKey(course));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(isKgFeedbackEvent);
  } catch {
    return [];
  }
}

/** Append-only write; a refused write reports failure instead of losing the signal silently. */
export function appendKgFeedback(
  course: string,
  ev: KgPrereqFeedbackEvent,
): { ok: boolean; reason?: string } {
  const s = storage();
  if (!s) return { ok: false, reason: "no browser storage" };
  try {
    const arr = readKgFeedback(course);
    arr.push(ev);
    s.setItem(kfbStoreKey(course), JSON.stringify(arr));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "storage write failed" };
  }
}

/** The anonymous per-browser session id — random, no account link, ever. */
export function kfbSessionId(): string {
  const s = storage();
  if (!s) return "kfb-unavailable";
  try {
    let v = s.getItem(KFB_SESSION_KEY);
    if (!v) {
      v =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `kfb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      s.setItem(KFB_SESSION_KEY, v);
    }
    return v;
  } catch {
    return "kfb-unavailable";
  }
}

// ── Phase-2 aggregation law (pinned now, consumed by the weekly report) ─────

export interface KfbEdgeAggregate {
  course: string;
  a: string;
  b: string;
  type: "pre";
  distinctSessions: number;
  events: number;
  /** max distinct sessions seen within ANY rolling window on this edge */
  windowSessions: number;
  flagged: boolean;
  firstTs: string;
  lastTs: string;
}

/**
 * The T1 signal law: an edge is flagged when ≥ minSessions DISTINCT session
 * ids flagged it within a rolling windowDays window (spec §4). Same-session
 * repeats never converge to a flag; below the minimum the events stay
 * long-tail — visible, weighted, never auto-filed (I1: aggregation is the
 * signal's only power; disposition stays human).
 */
export function aggregateKgFeedback(
  events: KgPrereqFeedbackEvent[],
  opts?: { windowDays?: number; minSessions?: number },
): KfbEdgeAggregate[] {
  const windowMs = (opts?.windowDays ?? 7) * 24 * 60 * 60 * 1000;
  const min = opts?.minSessions ?? 3;
  const byEdge = new Map<string, KgPrereqFeedbackEvent[]>();
  for (const ev of events) {
    if (!isKgFeedbackEvent(ev)) continue;
    const k = `${ev.course}|${ev.a}|${ev.b}|${ev.type}`;
    const arr = byEdge.get(k) ?? [];
    arr.push(ev);
    byEdge.set(k, arr);
  }
  const out: KfbEdgeAggregate[] = [];
  for (const arr of byEdge.values()) {
    if (arr.length === 0) continue;
    const sorted = [...arr].sort((x, y) => Date.parse(x.ts) - Date.parse(y.ts));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) continue;
    let windowSessions = 0;
    sorted.forEach((ev, i) => {
      const t = Date.parse(ev.ts);
      const sessions = new Set(
        sorted
          .slice(0, i + 1)
          .filter((p) => t - Date.parse(p.ts) <= windowMs)
          .map((p) => p.session),
      );
      windowSessions = Math.max(windowSessions, sessions.size);
    });
    out.push({
      course: first.course,
      a: first.a,
      b: first.b,
      type: "pre",
      distinctSessions: new Set(sorted.map((p) => p.session)).size,
      events: sorted.length,
      windowSessions,
      flagged: windowSessions >= min,
      firstTs: first.ts,
      lastTs: last.ts,
    });
  }
  return out.sort((x, y) => y.windowSessions - x.windowSessions || y.events - x.events);
}
