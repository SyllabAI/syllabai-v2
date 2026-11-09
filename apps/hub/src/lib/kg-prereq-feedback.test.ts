/**
 * T1 prereq feedback fixtures — T-KG-TRIPWIRE-1 run-003 (Phase 1).
 *
 * Two halves:
 *
 *  1. The schema + aggregation law over the lib of record
 *     (kg-prereq-feedback.ts): verdict vocabulary, the 280-char cap, the
 *     anonymous no-account-link session, append-only course-keyed storage,
 *     and the ≥3-distinct-sessions-in-7-days signal law (same-session
 *     repeats never converge to a flag; a session older than the window
 *     stops counting).
 *
 *  2. The FORK CONTRACT: the renderer fork
 *     (public/kg/openhuman-course-explorer.html) carries the same law
 *     inline because a self-contained build cannot import TS. These checks
 *     pin the two together — constants, the affordance copy (the spec's
 *     honesty register), the pre-only + loader-mode gating, the zero-new-
 *     network-calls law, and the untouched prereqValidated payload law.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  KFB_EVENT,
  KFB_VERDICTS,
  KFB_TEXT_CAP,
  KFB_STORE_PREFIX,
  KFB_SESSION_KEY,
  buildPrereqFeedback,
  isKgFeedbackEvent,
  readKgFeedback,
  appendKgFeedback,
  kfbSessionId,
  aggregateKgFeedback,
  type KgPrereqFeedbackEvent,
} from "./kg-prereq-feedback";

// ── the DOM-less window stub (Map-backed localStorage, full Storage surface) ──
const winStore = new Map<string, string>();
const stubWindow = {
  localStorage: {
    getItem: (k: string) => (winStore.has(k) ? winStore.get(k)! : null),
    setItem: (k: string, v: string) => void winStore.set(k, String(v)),
    removeItem: (k: string) => void winStore.delete(k),
    clear: () => void winStore.clear(),
    key: (i: number) => [...winStore.keys()][i] ?? null,
    get length() {
      return winStore.size;
    },
  },
};

beforeEach(() => {
  winStore.clear();
  (globalThis as { window?: unknown }).window = stubWindow;
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

function ev(over: Partial<KgPrereqFeedbackEvent>): KgPrereqFeedbackEvent {
  return {
    event: KFB_EVENT,
    course: "cie-igcse-chemistry-23",
    a: "p:2.3.1",
    b: "p:2.3.4",
    type: "pre",
    rendered_tier: "INFERRED PROTOTYPE",
    verdict: "NOT_A_PREREQ",
    free_text: "",
    ts: "2026-11-09T00:00:00.000Z",
    session: "s1",
    ...over,
  };
}

// ── 1. schema law ────────────────────────────────────────────────────────────

describe("buildPrereqFeedback", () => {
  test("builds a spec-conformant event", () => {
    const r = buildPrereqFeedback({
      course: "cie-igcse-chemistry-23",
      a: "p:2.3.1",
      b: "p:2.3.4",
      renderedTier: "INFERRED PROTOTYPE",
      verdict: "WRONG_DIRECTION",
      freeText: "this is backwards",
      session: "s9",
      ts: "2026-11-09T01:02:03.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.event).toBe("kg_prereq_feedback");
    expect(r.event.type).toBe("pre");
    expect(r.event.verdict).toBe("WRONG_DIRECTION");
    expect(r.event.free_text).toBe("this is backwards");
    expect(r.event.session).toBe("s9");
  });

  test("rejects verdicts outside the store vocabulary", () => {
    const r = buildPrereqFeedback({
      course: "c", a: "p:1", b: "p:2", renderedTier: "", verdict: "CONFIRM", session: "s",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("vocabulary");
  });

  test("rejects missing course/a/b", () => {
    for (const over of [{ course: "" }, { a: "" }, { b: "" }]) {
      const r = buildPrereqFeedback({
        course: "c", a: "p:1", b: "p:2", renderedTier: "", verdict: "UNCLEAR", session: "s", ...over,
      });
      expect(r.ok).toBe(false);
    }
  });

  test(`caps free_text at ${KFB_TEXT_CAP} chars`, () => {
    const r = buildPrereqFeedback({
      course: "c", a: "p:1", b: "p:2", renderedTier: "", verdict: "UNCLEAR",
      freeText: "x".repeat(KFB_TEXT_CAP + 50), session: "s",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.free_text.length).toBe(KFB_TEXT_CAP);
  });
});

describe("isKgFeedbackEvent", () => {
  test("accepts a valid event and rejects malformed claimants", () => {
    expect(isKgFeedbackEvent(ev({}))).toBe(true);
    expect(isKgFeedbackEvent(ev({ event: "something_else" as unknown as KgPrereqFeedbackEvent["event"] }))).toBe(false);
    expect(isKgFeedbackEvent(ev({ verdict: "CONFIRM" as never }))).toBe(false);
    expect(isKgFeedbackEvent(ev({ type: "rel" as never }))).toBe(false);
    expect(isKgFeedbackEvent(ev({ free_text: "x".repeat(KFB_TEXT_CAP + 1) }))).toBe(false);
    expect(isKgFeedbackEvent(ev({ ts: "not-a-date" }))).toBe(false);
    expect(isKgFeedbackEvent(ev({ session: "" }))).toBe(false);
    expect(isKgFeedbackEvent(null)).toBe(false);
    expect(isKgFeedbackEvent("kg_prereq_feedback")).toBe(false);
  });
});

// ── 2. browser-local store law ───────────────────────────────────────────────

describe("the course-keyed local store", () => {
  test("appends and reads back per course (append-only)", () => {
    const e1 = ev({ ts: "2026-11-09T00:00:00.000Z" });
    const e2 = ev({ session: "s2", verdict: "UNCLEAR", ts: "2026-11-09T00:01:00.000Z" });
    expect(appendKgFeedback(e1.course, e1).ok).toBe(true);
    expect(appendKgFeedback(e1.course, e2).ok).toBe(true);
    const back = readKgFeedback(e1.course);
    expect(back.length).toBe(2);
    expect(back[1]?.session).toBe("s2");
    // course-keyed: a different course reads empty
    expect(readKgFeedback("some-other-course").length).toBe(0);
  });

  test("corrupt records read as empty and the next append recovers the slot", () => {
    winStore.set(`${KFB_STORE_PREFIX}c1`, "{not json at all");
    expect(readKgFeedback("c1").length).toBe(0);
    const e = ev({ course: "c1" });
    expect(appendKgFeedback("c1", e).ok).toBe(true);
    expect(readKgFeedback("c1").length).toBe(1);
  });

  test("junk entries are filtered on read, not crashed on", () => {
    winStore.set(`${KFB_STORE_PREFIX}c2`, JSON.stringify([ev({ course: "c2" }), { junk: true }, null]));
    expect(readKgFeedback("c2").length).toBe(1);
  });

  test("session id is stable per browser and never account-linked", () => {
    const s1 = kfbSessionId();
    const s2 = kfbSessionId();
    expect(s1).toBe(s2);
    expect(s1).not.toBe("kfb-unavailable");
    expect(winStore.get(KFB_SESSION_KEY)).toBe(s1);
  });

  test("no storage -> honest unavailable, never a throw", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readKgFeedback("c")).toEqual([]);
    expect(kfbSessionId()).toBe("kfb-unavailable");
    const r = buildPrereqFeedback({ course: "c", a: "p:1", b: "p:2", renderedTier: "", verdict: "UNCLEAR", session: "s" });
    expect(r.ok).toBe(true);
  });
});

// ── 3. the T1 signal law (aggregation) ───────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
function at(day: number, hour = 0): string {
  return new Date(Date.UTC(2026, 10, 1 + day, hour)).toISOString();
}

describe("aggregateKgFeedback — the ≥3 distinct sessions in 7 days law", () => {
  test("3 distinct sessions inside the window flag the edge", () => {
    const events = [
      ev({ session: "s1", ts: at(0) }),
      ev({ session: "s2", ts: at(2) }),
      ev({ session: "s3", ts: at(5) }),
    ];
    const [agg] = aggregateKgFeedback(events);
    expect(agg?.flagged).toBe(true);
    expect(agg?.windowSessions).toBe(3);
    expect(agg?.distinctSessions).toBe(3);
  });

  test("same-session repeats never converge to a flag", () => {
    const events = Array.from({ length: 9 }, (_, i) => ev({ session: "solo", ts: at(0, i) }));
    const [agg] = aggregateKgFeedback(events);
    expect(agg?.distinctSessions).toBe(1);
    expect(agg?.windowSessions).toBe(1);
    expect(agg?.flagged).toBe(false);
  });

  test("2 distinct sessions (however many repeats) stay long-tail", () => {
    const events = [
      ev({ session: "s1", ts: at(0) }),
      ev({ session: "s1", ts: at(1) }),
      ev({ session: "s2", ts: at(2) }),
      ev({ session: "s2", ts: at(3) }),
    ];
    const [agg] = aggregateKgFeedback(events);
    expect(agg?.flagged).toBe(false);
    expect(agg?.windowSessions).toBe(2);
  });

  test("sessions older than the rolling window stop counting", () => {
    // s1@day0 and s2@day6 co-occur inside one 7-day window; s3@day20 shares
    // a window with neither (6d and 14d gaps vs the 7d law)
    const events = [
      ev({ session: "s1", ts: at(0) }),
      ev({ session: "s2", ts: at(6) }),
      ev({ session: "s3", ts: at(20) }),
    ];
    const [agg] = aggregateKgFeedback(events);
    expect(agg?.distinctSessions).toBe(3);
    expect(agg?.windowSessions).toBe(2);
    expect(agg?.flagged).toBe(false);
  });

  test("the window is per-edge — separate edges do not pool their sessions", () => {
    const events = [
      ev({ a: "p:1", b: "p:2", session: "s1", ts: at(0) }),
      ev({ a: "p:1", b: "p:2", session: "s2", ts: at(1) }),
      ev({ a: "p:9", b: "p:8", session: "s3", ts: at(2) }),
    ];
    const aggs = aggregateKgFeedback(events);
    expect(aggs.length).toBe(2);
    expect(aggs.every((a) => !a.flagged)).toBe(true);
  });

  test("custom thresholds keep the law parameterizable for calibration", () => {
    const events = [
      ev({ session: "s1", ts: at(0) }),
      ev({ session: "s2", ts: at(1) }),
    ];
    const [agg] = aggregateKgFeedback(events, { minSessions: 2, windowDays: 7 });
    expect(agg?.flagged).toBe(true);
  });
});

// ── 4. the fork contract (Phase 1 acceptance, machine-checkable) ─────────────

describe("the renderer fork contract (public/kg/openhuman-course-explorer.html)", () => {
  const fork = readFileSync(
    new URL("../../public/kg/openhuman-course-explorer.html", import.meta.url),
    "utf8",
  );

  test("carries the schema constants verbatim — the two implementations cannot drift", () => {
    expect(fork).toContain(`var KFB_EVENT='${KFB_EVENT}'`);
    for (const v of KFB_VERDICTS) expect(fork).toContain(`'${v}'`);
    expect(fork).toContain(`var KFB_TEXT_CAP=${KFB_TEXT_CAP}`);
    expect(fork).toContain(`var KFB_STORE_PREFIX='${KFB_STORE_PREFIX}'`);
    expect(fork).toContain(`var KFB_SESSION_KEY='${KFB_SESSION_KEY}'`);
  });

  test("affordance copy matches the spec's honesty register", () => {
    expect(fork).toContain("This prerequisite seems wrong?");
    // tooltip law: reviewed by humans + does not change the graph
    expect(fork).toContain("reviewed by humans");
    expect(fork).toContain("does not change the graph");
    // local-only disclosure
    expect(fork).toContain("Saved in this browser only");
  });

  test("affordance is pre-only and loader-mode-gated", () => {
    expect(fork).toContain("if(type!=='pre'||!KFB_COURSE)return ''");
    expect(fork).toContain("KFB_COURSE=slug");
  });

  test("adds zero network calls — the loader's /kg/data fetch stays the only one", () => {
    const fetches = fork.match(/fetch\(/g) ?? [];
    expect(fetches.length).toBe(1);
    expect(fork).toContain("fetch('/kg/data/'");
  });

  test("posts the event out (syllabai-kg:feedback) but never writes labels", () => {
    expect(fork).toContain("'syllabai-kg:feedback'");
    // the payload law intact: the validated tier still reads the spine's
    // prereqValidated list, and nothing in the fork ever writes it
    expect(fork).toContain("KG_PREREQ_VALIDATED=new Set(kg.prereqValidated||[])");
  });

  test("the kfb store is the ONLY new localStorage namespace", () => {
    // the fork's pre-existing browser-local use is the v74 saved-views store
    // (V74_VIEWS_KEY — camera/filters/pins, shipped long before this lane);
    // everything else must go through the kfb keys
    const uses = fork.match(/localStorage\.(getItem|setItem)\(/g) ?? [];
    const kfb = fork.match(/localStorage\.(getItem|setItem)\((kfbStoreKey|KFB_SESSION_KEY)/g) ?? [];
    const v74 = fork.match(/localStorage\.(getItem|setItem)\(V74_VIEWS_KEY/g) ?? [];
    expect(kfb.length).toBeGreaterThanOrEqual(4);
    expect(uses.length).toBe(kfb.length + v74.length);
    expect(fork).toContain("V74_VIEWS_KEY");
  });
});
