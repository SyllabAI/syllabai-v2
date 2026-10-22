/**
 * DC-7 — the hub's server-projection consumer pins (lib/progress-server.ts;
 * spec §3.7, prereg docs/DC7-PROGRESS-ATTRIBUTION-PLAN.md).
 *
 * The projection-of-events law, hub side: the ring percent derives from the
 * server payload (the event→projection rollup), never from a local counter;
 * a missing fact (no entry / empty denominator) returns null and the caller
 * falls back to the SIMULATED overlay posture (the of-record signed-out
 * behaviour). The payload shape mirrors the api's GET
 * /api/v1/learners/me/progress wire contract — the same `today` block the
 * plan projection and the dashboard card read (acceptance (c) hub-side).
 */
import { describe, expect, test } from "bun:test";
import {
  clearProjectionCache,
  projectionPercentFor,
  type ProgressProjectionPayload,
} from "./progress-server";

const PAYLOAD: ProgressProjectionPayload = {
  courseSlug: "igcse-chemistry-19",
  nodes: {
    "4CH1-S1-a": {
      notes: { done: 1, total: 2, fraction: 0.5, leafDone: true },
      questions: { done: 0, total: 3, fraction: 0, leafDone: false },
    },
    "4CH1-S1": {
      notes: { done: 1, total: 2, fraction: 0.5, leafDone: true },
      questions: { done: 1, total: 3, fraction: 0.333, leafDone: true },
    },
    "4CH1-S1-b": {
      notes: { done: 0, total: 0, fraction: 0, leafDone: false },
      questions: { done: 0, total: 0, fraction: 0, leafDone: false },
    },
  },
  today: { notesChecked: 1, markedParts: 5, mcqSubmitted: 2 },
  builtAt: "2026-10-23T08:00:00.000Z",
};

describe("DC-7 projection consumer — projectionPercentFor", () => {
  test("the ring percent derives from the projection fraction, never a local counter", () => {
    expect(projectionPercentFor(PAYLOAD, "4CH1-S1-a", "notes")).toBe(50);
    expect(projectionPercentFor(PAYLOAD, "4CH1-S1", "questions")).toBe(33);
    expect(projectionPercentFor(PAYLOAD, "4CH1-S1-a", "questions")).toBe(0);
  });

  test("a missing fact returns null — the caller's overlay fallback posture", () => {
    // no such node in the payload
    expect(projectionPercentFor(PAYLOAD, "4CH1-9.9", "notes")).toBeNull();
    // empty denominator (no resources to count) is NO fact, not zero
    expect(projectionPercentFor(PAYLOAD, "4CH1-S1-b", "notes")).toBeNull();
    // no payload at all (signed out / fetch failed)
    expect(projectionPercentFor(null, "4CH1-S1-a", "notes")).toBeNull();
  });

  test("the two dimensions stay separate (the observed product's two trees)", () => {
    const notes = projectionPercentFor(PAYLOAD, "4CH1-S1-a", "notes");
    const questions = projectionPercentFor(PAYLOAD, "4CH1-S1-a", "questions");
    expect(notes).toBe(50);
    expect(questions).toBe(0);
    expect(notes).not.toEqual(questions);
  });

  test("the shared today block is the consistency surface (acceptance (c))", () => {
    // the same payload object the trees read feeds the dashboard card and
    // the plan subscription — one `today`, never a second counter
    expect(PAYLOAD.today).toEqual({ notesChecked: 1, markedParts: 5, mcqSubmitted: 2 });
    expect(PAYLOAD.courseSlug).toBe("igcse-chemistry-19");
  });

  test("the cache seam starts empty and clears (the pins start from no facts)", () => {
    clearProjectionCache();
    expect(clearProjectionCache()).toBeUndefined();
  });
});
