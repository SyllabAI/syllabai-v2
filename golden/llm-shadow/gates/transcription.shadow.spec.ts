// GATE STUB: transcription seam — recorded-shadow behavioural gate (doctrine §8.2).
// The seam is UNLANDED (transcription DTOs deliberately not ported — answerinput contracts
// package belongs to its owning wave); this stub pins the machinery + fixture anatomy so the
// owning wave inherits a working gate.
import { describe, expect, test } from "bun:test";
import { compareTranscription } from "../lib/shadow-compare.ts";
import type { ShadowFixture, TranscriptArtifact } from "../lib/types.ts";
import recordedFixture from "../fixtures/transcription/recorded/transcribe-001.json";
import okCandidate from "../fixtures/transcription/candidate/transcribe-001.ok.json";
import t2Drift from "../fixtures/transcription/candidate/transcribe-001.t2-drift.json";

const stripMeta = (o: Record<string, unknown>): TranscriptArtifact => {
  const { _expected: _e, _case: _c, ...rest } = o;
  return rest as unknown as TranscriptArtifact;
};
const baseline = recordedFixture as ShadowFixture;
const seg = (i: number, startMs: number, endMs: number, speaker: string, text: string) => ({
  index: i, startMs, endMs, speaker, text,
});

describe("transcription gate — fixture lifecycle (file-loaded)", () => {
  test("punctuation-only variance PASSes", () => {
    const r = compareTranscription(baseline, stripMeta(okCandidate));
    expect(r.verdict).toBe("PASS");
    expect(r.hardFails).toEqual([]);
  });

  test("glucose->sucrose is a T2 beyond-threshold FAIL (not T3 — numerics/anchors clean)", () => {
    const r = compareTranscription(baseline, stripMeta(t2Drift));
    expect(r.verdict).toBe("FAIL");
    expect(r.hardFails).toEqual([]);
    const text = r.segments.find((s) => s.segmentId === "seg1" && s.field === "text");
    expect(text?.ok).toBe(false);
    expect(text?.declaredClass).toBe("T2");
    expect(text?.score).toBeLessThan(0.9);
  });
});

describe("transcription gate — tolerance classes (inline vectors)", () => {
  const ok = (): TranscriptArtifact => ({
    segments: [
      seg(0, 0, 3200, "host", "Photosynthesis begins when chlorophyll absorbs light."),
      seg(1, 3200, 6400, "guest", "That energy powers the cell, producing glucose."),
    ],
  });

  test("identical artifact PASSes", () => {
    expect(compareTranscription(baseline, ok()).verdict).toBe("PASS");
  });

  test("T3: invented numeric token hard-fails", () => {
    const c = ok();
    c.segments[1]!.text = "That energy powers the cell, producing glucose in 2 steps.";
    const r = compareTranscription(baseline, c);
    expect(r.hardFails.some((h) => h.includes('numeric token invented (seg1): "2"'))).toBe(true);
  });

  test("T3: dropped numeric token hard-fails (inline baseline carrying a number)", () => {
    const numBaseline: ShadowFixture = {
      ...baseline,
      case: "numeric-vector",
      artifact: { segments: [seg(0, 0, 3200, "host", "The reaction peaks at 45 degrees.")] },
      anchors: ["reaction peaks 45 degrees"],
    };
    const c: TranscriptArtifact = { segments: [seg(0, 0, 3200, "host", "The reaction peaks at degrees.")] };
    const r = compareTranscription(numBaseline, c);
    expect(r.hardFails.some((h) => h.includes('numeric token dropped (seg0): "45"'))).toBe(true);
    expect(r.verdict).toBe("FAIL");
  });

  test("T3: claim anchor missing hard-fails (citation plumbing)", () => {
    const c = ok();
    c.segments[0]!.text = "Hello and welcome to the show.";
    const r = compareTranscription(baseline, c);
    expect(r.hardFails.some((h) => h.startsWith("T3: grounding anchor unresolvable"))).toBe(true);
  });

  test("T0: speaker change FAILs", () => {
    const c = ok();
    c.segments[1]!.speaker = "narrator";
    const r = compareTranscription(baseline, c);
    expect(r.segments.some((s) => s.field === "speaker" && !s.ok)).toBe(true);
    expect(r.verdict).toBe("FAIL");
  });

  test("T1: segment count mismatch FAILs structurally", () => {
    const c = ok();
    c.segments = c.segments.slice(0, 1);
    const r = compareTranscription(baseline, c);
    expect(r.segments.find((s) => s.field === "segments.length")?.declaredClass).toBe("T1");
    expect(r.verdict).toBe("FAIL");
  });
});

describe("transcription gate — invariants (§3.4-analogue, always hard fail)", () => {
  test("timestamp gap between segments", () => {
    const c = { segments: [seg(0, 0, 3200, "host", "a"), seg(1, 4000, 6400, "guest", "b")] };
    const r = compareTranscription(baseline, c);
    expect(r.hardFails.some((h) => h.includes("gap/overlap"))).toBe(true);
  });

  test("unknown speaker label", () => {
    const c = { segments: [seg(0, 0, 3200, "audience", "a")] };
    const r = compareTranscription(baseline, c);
    expect(r.hardFails.some((h) => h.includes('unknown speaker "audience"'))).toBe(true);
  });

  test("non-monotonic segment timing", () => {
    const c = { segments: [seg(0, 100, 50, "host", "a")] };
    const r = compareTranscription(baseline, c);
    expect(r.hardFails.some((h) => h.includes("endMs < startMs"))).toBe(true);
  });
});
