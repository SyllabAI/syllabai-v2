/**
 * Region-mark state machine tests — T-MG-CROPMARK-1 run-002. The honest
 * lifecycle law as tests: start→accepted→progress→succeeded/failed, the
 * timeout Check-again resume (the SAME markId — retry: 0), the lost
 * registry, and the dismiss bookkeeping.
 */
import { describe, expect, test } from "bun:test";

import {
  awardsTotals,
  initialRegionMarkState,
  regionMarkReducer,
  type MirroredPollSnapshot,
} from "./region-mark-state";

const succeededSnapshot: MirroredPollSnapshot = {
  markId: "0b8a5c3e-1111-4222-8333-444455556666",
  status: "succeeded",
  regionKey: "9.b",
  transcription: "2x",
  feedback: {
    attempt: "2x",
    chatMessage: "Twice means multiply.",
    pointsScored: [],
    pointsNotScored: ["P1 — twice → 2x"],
    thoughtProcess: "2x — the answer reads 2x…",
    strategiesForImprovement: ["Re-read: 'twice' → ×2."],
  },
  awards: [
    { code: "P1", awarded: false, score: 0, maxScore: 1, ordinal: 0, markPointId: null, page: 2 },
  ],
  queuedAt: "2026-10-31T00:00:00Z",
  completedAt: "2026-10-31T00:00:01Z",
};

describe("T-MG-CROPMARK-1 run-002 — the honest lifecycle (regionMarkReducer)", () => {
  test("start opens the entry and focuses the panel", () => {
    const s = regionMarkReducer(initialRegionMarkState(), { type: "start", regionId: "r1", label: "9.b · 1 mark" });
    expect(s.entries.r1).toMatchObject({ phase: "cropping", label: "9.b · 1 mark", markId: null });
    expect(s.activeId).toBe("r1");
  });

  test("cropped → accepted carries the poll handle", () => {
    let s = regionMarkReducer(initialRegionMarkState(), { type: "start", regionId: "r1", label: "L" });
    s = regionMarkReducer(s, { type: "cropped", regionId: "r1" });
    expect(s.entries.r1?.phase).toBe("queued");
    s = regionMarkReducer(s, { type: "accepted", regionId: "r1", markId: "m1" });
    expect(s.entries.r1?.markId).toBe("m1");
  });

  test("progress rides queued→running; succeeded stores the snapshot verbatim", () => {
    let s = regionMarkReducer(initialRegionMarkState(), { type: "start", regionId: "r1", label: "L" });
    s = regionMarkReducer(s, { type: "cropped", regionId: "r1" });
    s = regionMarkReducer(s, { type: "progress", regionId: "r1", status: "running" });
    expect(s.entries.r1?.phase).toBe("running");
    s = regionMarkReducer(s, { type: "succeeded", regionId: "r1", snapshot: succeededSnapshot });
    expect(s.entries.r1?.phase).toBe("succeeded");
    expect(s.entries.r1?.snapshot).toEqual(succeededSnapshot);
  });

  test("failed stores the honest detail; the snapshot stays empty", () => {
    let s = regionMarkReducer(initialRegionMarkState(), { type: "start", regionId: "r1", label: "L" });
    s = regionMarkReducer(s, { type: "failed", regionId: "r1", detail: "no_mark_points: …" });
    expect(s.entries.r1?.phase).toBe("failed");
    expect(s.entries.r1?.detail).toContain("no_mark_points");
    expect(s.entries.r1?.snapshot).toBeNull();
  });

  test("timeout keeps the markId; progress from timeout resumes (the Check-again law — same handle, never a re-POST)", () => {
    let s = regionMarkReducer(initialRegionMarkState(), { type: "start", regionId: "r1", label: "L" });
    s = regionMarkReducer(s, { type: "cropped", regionId: "r1" });
    s = regionMarkReducer(s, { type: "timeout", regionId: "r1", markId: "m1", detail: "Still marking…" });
    expect(s.entries.r1?.phase).toBe("timeout");
    expect(s.entries.r1?.markId).toBe("m1");
    s = regionMarkReducer(s, { type: "progress", regionId: "r1", status: "running" });
    expect(s.entries.r1?.phase).toBe("running");
  });

  test("dismiss removes the entry and clears focus; a second region becomes the active panel", () => {
    let s = regionMarkReducer(initialRegionMarkState(), { type: "start", regionId: "r1", label: "L1" });
    s = regionMarkReducer(s, { type: "start", regionId: "r2", label: "L2" });
    expect(s.activeId).toBe("r2");
    s = regionMarkReducer(s, { type: "dismiss", regionId: "r2" });
    expect(s.entries.r2).toBeUndefined();
    expect(s.activeId).toBeNull();
    s = regionMarkReducer(s, { type: "start", regionId: "r3", label: "L3" });
    s = regionMarkReducer(s, { type: "dismiss", regionId: "r3" });
    expect(s.activeId).toBeNull();
  });

  test("actions for unknown regions are honest no-ops (never a fabricated entry)", () => {
    const s = regionMarkReducer(initialRegionMarkState(), {
      type: "succeeded",
      regionId: "ghost",
      snapshot: succeededSnapshot,
    });
    expect(s.entries.ghost).toBeUndefined();
    expect(s.activeId).toBeNull();
  });
});

describe("T-MG-CROPMARK-1 run-002 — the panel rollup (awardsTotals)", () => {
  test("Σ from the served award rows, never a local counter", () => {
    const snap: MirroredPollSnapshot = {
      ...succeededSnapshot,
      awards: [
        { code: "P1", awarded: true, score: 1, maxScore: 1, ordinal: 0, markPointId: null, page: 2 },
        { code: "P1", awarded: false, score: 0, maxScore: 1, ordinal: 1, markPointId: null, page: 2 },
      ],
    };
    expect(awardsTotals(snap)).toEqual({ score: 1, max: 2 });
  });

  test("no award rows → 0/0 (the honest empty)", () => {
    expect(awardsTotals({ ...succeededSnapshot, awards: undefined })).toEqual({ score: 0, max: 0 });
  });
});
