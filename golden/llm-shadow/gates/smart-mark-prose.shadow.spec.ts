// GATE STUB: smart-mark prose seam — recorded-shadow behavioural gate (doctrine §4-§6, §8.1).
// Real seam: apps/api/src/services/smartmark/index.ts :414-419 (FeedbackLlm); the route-level
// 503 fixed-body law is pinned by T-MIG-032's route tests — cited here, never re-pinned.
import { describe, expect, test } from "bun:test";
import { assertFixtureCompatible, compareFeedbackProse } from "../lib/shadow-compare.ts";
import { ShadowFeedbackLlm, ShadowRefusal, promptKey } from "../lib/feedback-llm-proxy.ts";
import { REFUSAL_CONTRACT } from "../lib/seam-config.ts";
import type { FeedbackProseArtifact, ShadowFixture } from "../lib/types.ts";
import recordedFixture from "../fixtures/smart-mark-prose/recorded/explain-001.json";
import okCandidate from "../fixtures/smart-mark-prose/candidate/explain-001.ok.json";
import driftedNum from "../fixtures/smart-mark-prose/candidate/explain-001.drifted-num.json";
import schemeLeak from "../fixtures/smart-mark-prose/candidate/explain-001.scheme-leak.json";

const stripMeta = (o: Record<string, unknown>): FeedbackProseArtifact => {
  const { _expected: _e, _case: _c, ...rest } = o;
  return rest as unknown as FeedbackProseArtifact;
};
const baseline = recordedFixture as ShadowFixture;
const baseArtifact = baseline.artifact as FeedbackProseArtifact;
const art = (text: string, over: Partial<FeedbackProseArtifact> = {}): FeedbackProseArtifact => ({
  view: baseArtifact.view,
  partId: baseArtifact.partId,
  text,
  modelId: baseArtifact.modelId,
  generatedAt: baseArtifact.generatedAt,
  ...over,
});

describe("smart-mark-prose gate — fixture lifecycle (file-loaded)", () => {
  test("punctuation + tolerated generatedAt variance PASSes (§4 canonicalization, runner tolerate law)", () => {
    const r = compareFeedbackProse(baseline, stripMeta(okCandidate));
    expect(r.verdict).toBe("PASS");
    expect(r.hardFails).toEqual([]);
  });

  test("numeric drift is a T3 hard FAIL", () => {
    const r = compareFeedbackProse(baseline, stripMeta(driftedNum));
    expect(r.verdict).toBe("FAIL");
    expect(r.hardFails.some((h) => h.includes('numeric token dropped: "1"'))).toBe(true);
    expect(r.hardFails.some((h) => h.includes('numeric token invented: "2"'))).toBe(true);
  });

  test("scheme-text leak fires the forbidden vector (T3, pointLabel law)", () => {
    const r = compareFeedbackProse(baseline, stripMeta(schemeLeak));
    expect(r.verdict).toBe("FAIL");
    expect(r.hardFails.some((h) => h.startsWith("T3: leak vector fired"))).toBe(true);
  });
});

describe("smart-mark-prose gate — tolerance classes (inline vectors)", () => {
  test("T1: envelope field missing is a hard structural fail (exact key set)", () => {
    const c = art(baseArtifact.text) as unknown as Record<string, unknown>;
    delete c.modelId;
    const r = compareFeedbackProse(baseline, c as unknown as FeedbackProseArtifact);
    expect(r.hardFails.some((h) => h.includes('envelope field "modelId" missing'))).toBe(true);
    expect(r.verdict).toBe("FAIL");
  });

  test("T1: extra envelope field is a breach", () => {
    const c = { ...art(baseArtifact.text), marks: 2 } as unknown as FeedbackProseArtifact;
    const r = compareFeedbackProse(baseline, c);
    expect(r.hardFails.some((h) => h.includes('envelope field "marks" is not part of'))).toBe(true);
  });

  test("T0: partId mismatch FAILs", () => {
    const r = compareFeedbackProse(baseline, art(baseArtifact.text, { partId: "00000000-0000-4000-8000-0000000000ff" }));
    expect(r.segments.some((s) => s.field === "partId" && !s.ok)).toBe(true);
    expect(r.verdict).toBe("FAIL");
  });

  test("T2: single-synonym variance within threshold PASSes (solid->careful)", () => {
    const r = compareFeedbackProse(baseline, art(baseArtifact.text.replace("solid reasoning", "careful reasoning")));
    expect(r.verdict).toBe("PASS");
    expect(r.segments.find((s) => s.field === "explanation")?.score).toBeGreaterThan(0.9);
  });

  test("T2: beyond-threshold rewrite FAILs WITHOUT any T3 (anchors + numerics intact)", () => {
    const rewritten =
      "You stated that light energy is absorbed by the pigment in the leaf, and you identified the conversion into chemical energy. The remaining 1 mark sits on the storage step, which your response did not address.";
    const r = compareFeedbackProse(baseline, art(rewritten));
    expect(r.hardFails.filter((h) => h.startsWith("T3"))).toEqual([]);
    expect(r.verdict).toBe("FAIL");
    const text = r.segments.find((s) => s.field === "explanation");
    expect(text?.declaredClass).toBe("T2");
    expect(text?.score).toBeLessThan(0.9);
  });

  test("T3: unresolvable grounding anchor hard-fails (citation plumbing, §4.1)", () => {
    const r = compareFeedbackProse(baseline, art("You earned both marks for clear reasoning about energy in leaves. The last point was not covered."));
    expect(r.hardFails.filter((h) => h.startsWith("T3: grounding anchor unresolvable")).length).toBe(3);
  });
});

describe("smart-mark-prose gate — ShadowFeedbackLlm (ADR-MIG-0001 Option A)", () => {
  const sys = "explain-system-prompt";
  const usr = "explain-user-prompt";
  const key = promptKey(sys, usr, 0.2);
  const records = new Map([[key, { promptHash: key, temperature: 0.2, output: "recorded shadow prose", recordedAt: "2026-10-05T15:55:02Z" }]]);

  test("replay is byte-stable across calls (determinism law, doctrine §6)", async () => {
    const proxy = new ShadowFeedbackLlm(records);
    const a = await proxy.generate(sys, usr, 0.2);
    const b = await proxy.generate(sys, usr, 0.2);
    expect(a).toBe(b);
    expect(a).toBe("recorded shadow prose");
  });

  test("no shadow -> honest refusal, never fabricated prose (§3 dimension 1)", async () => {
    const proxy = new ShadowFeedbackLlm(new Map());
    expect(proxy.available()).toBe(false);
    try {
      await proxy.generate("other", usr, 0.2);
      expect.unreachable();
    } catch (e) {
      expect(e instanceof ShadowRefusal).toBe(true);
      expect((e as Error).message).toContain(REFUSAL_CONTRACT.serviceErrorKind);
    }
  });

  test("empty recorded output -> refusal (services/smartmark :889-891 law)", async () => {
    const proxy = new ShadowFeedbackLlm(new Map([[key, { promptHash: key, temperature: 0.2, output: "  ", recordedAt: "" }]]));
    try {
      await proxy.generate(sys, usr, 0.2);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain(REFUSAL_CONTRACT.serviceEmptyResponseMessage);
    }
  });

  test("capture mode forwards + records; replay of the capture serves byte-identical prose", async () => {
    const captured: unknown[] = [];
    let calls = 0;
    const delegate: { available(): boolean; generate(s: string, u: string, t: number): Promise<string> } = {
      available: () => true,
      generate: async () => {
        calls += 1;
        return `live-${calls}`;
      },
    };
    const cap = new ShadowFeedbackLlm(new Map(), { delegate, onRecord: (r) => captured.push(r) });
    const live1 = await cap.generate(sys, usr, 0.2);
    expect(live1).toBe("live-1");
    expect(captured.length).toBe(1);
    // replay from what capture recorded
    const rec = captured[0] as { promptHash: string; temperature: number; output: string; recordedAt: string };
    const replay = new ShadowFeedbackLlm(new Map([[rec.promptHash, rec]]));
    expect(await replay.generate(sys, usr, 0.2)).toBe("live-1");
    expect(calls).toBe(1); // delegate hit exactly once — CI replay adds no provider calls
  });
});

describe("smart-mark-prose gate — fixture guard (§7 anatomy)", () => {
  test("schema/seam mismatch rejected", () => {
    const bad = { ...baseline, seam: "transcription" } as ShadowFixture;
    expect(assertFixtureCompatible(bad, "smart-mark-prose").length).toBe(1);
    expect(assertFixtureCompatible(baseline, "smart-mark-prose")).toEqual([]);
  });
});
