/**
 * T-TUTOR-AIM-P2 — the pipeline pins over the REAL karag module:
 *
 *   §7.4 (confidence, log-first): the learner's raw selection rides BOTH
 *   ask paths' TutorAnsweredEvent verbatim; absent = null (the NO-DEFAULT
 *   law — a no-tap is never recorded as a guessing); a refusal still logs
 *   the tap; anonymous previews carry null (the account-only law).
 *
 *   §7.6 (the probe): the offer rides AskResult.probe and the stream's
 *   completed event AFTER the full answer; null on every refusal and on
 *   the empty-learner posture (most asks); the offer carries metadata only
 *   (node id + corpus title — §13.2).
 *
 *   §7.5 (the aim in composition): the generator receives a TutorContext
 *   whose aim/commandWord are computed from the ONE read set — the aim is
 *   live when the learner carries signal, byte-absent when it does not.
 */
import { describe, expect, test } from "bun:test";
import { buildTutorModule } from "../../src/services/tutor";
import { evidenceFromChunk } from "../../src/services/tutor/evidence";
import { userPrompt, promptIdentity } from "../../src/services/tutor/prompt";
import type { TutorContext } from "../../src/services/tutor/context";
import type { SqlFn } from "../../src/services/tutor/sql";

const LEARNER = "bb000000-0000-4000-8000-000000000001";
const TOPIC_A = "aa000000-0000-4000-8000-00000000000a";
const P1 = "ac000000-0000-4000-8000-000000000001";
const MISCO_1 = "ab000000-0000-4000-8000-000000000001";
const ROW_A = "dd000000-0000-4000-8000-000000000001";
const CHUNK_A = "ee000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-17T08:00:00Z");
const clock = { now: () => NOW };

const SCOPE = {
  curriculumVersionId: "cv-00000000-0000-0000-0000-000000000001",
  code: "4CH1-2017",
  surface: new Set([TOPIC_A]),
};
const scopes = {
  resolveActive: async () => SCOPE,
  resolveForCourse: async () => SCOPE,
};

const kgGraph = {
  structureNodes: async () => [
    { id: TOPIC_A, code: "4CH1-U1-T3", title: "Projectile motion", validation_status: "VALIDATED" },
  ],
  prerequisiteChains: async () =>
    new Map([[TOPIC_A, [{ id: P1, title: "Vector components", depth: 1 }]]]),
  misconceptionsForTopics: async () =>
    new Map([[TOPIC_A, [{ id: MISCO_1, title: "gravity pulls sideways in flight" }]]]),
};

const evidenceRow = evidenceFromChunk({
  documentRowId: ROW_A,
  documentId: "doc-1",
  documentVersion: 1,
  chunkId: CHUNK_A,
  chunkIndex: 0,
  kind: "TEXTBOOK",
  content: "A projectile's horizontal and vertical components are independent.",
  pageStart: 3,
  pageEnd: 3,
  elementIds: [],
  embeddingModel: "text-embedding-004",
  cosine: 0.9,
});

const notPaper = async () => ({ items: [], identityParsed: false, identityLabel: null });

const learnerModel = (over: {
  states?: unknown[];
  readings?: unknown[];
} = {}) => ({
  skillStates: async () => over.states ?? [],
  misconceptionReadings: async () => over.readings ?? [],
  activeStruggleInferences: async () => [],
  topicEngagements: async () => [],
  pendingReviews: async () => [],
});

function fakeSql(): SqlFn {
  return (async () => []) as unknown as SqlFn;
}

interface Captured {
  events: unknown[];
  contexts: TutorContext[];
}

function makeHarness(over: { states?: unknown[]; readings?: unknown[] } = {}) {
  const captured: Captured = { events: [], contexts: [] };
  const deps = {
    sql: fakeSql(),
    clock,
    kgGraph,
    scopes,
    vectorRetriever: async () => [evidenceRow],
    paperQuestionResolver: notPaper,
    generator: {
      async generate(_q: string, _h: unknown, context: TutorContext) {
        captured.contexts.push(context);
        return { answer: "The components are independent [1].", model: "fake-model", provider: "fake-provider", finishReason: "stop" };
      },
      async *streamGenerate(_q: string, _h: unknown, context: TutorContext) {
        captured.contexts.push(context);
        yield { answer: "The components ", model: "fake-model", providerName: "fake-provider", finishReason: null };
        yield { answer: "are independent [1].", model: "fake-model", providerName: "fake-provider", finishReason: "stop" };
      },
    },
    telemetry: (e: unknown) => captured.events.push(e),
    learnerModel: learnerModel(over) as never,
  };
  const mod = buildTutorModule(deps.sql, clock, deps as never);
  return { mod, captured };
}

const QUESTION = "Explain why projectile motion range depends on launch angle.";
const PLAIN_QUESTION = "What determines the range of a projectile motion?";

describe("T-TUTOR-AIM-P2 — the confidence capture (DC10 §7.4, log-first)", () => {
  test("blocking ask: the selection rides the event verbatim", async () => {
    const { mod, captured } = makeHarness();
    await mod.ask(LEARNER, QUESTION, [], null, null, null, "guessing");
    const tel = captured.events[0] as { confidence: string | null; promptIdentity: string };
    expect(tel.confidence).toBe("guessing");
    // the identity of record is the v20 bump (run-003, the §7.9 gate release)
    expect(tel.promptIdentity).toBe("tutor-grounded/v20");
    expect(promptIdentity()).toBe("tutor-grounded/v20");
  });

  test("streaming ask: stream parity — the selection rides the event verbatim", async () => {
    const { mod, captured } = makeHarness();
    for await (const _e of mod.askStream(LEARNER, QUESTION, [], null, null, null, "think_so")) {
      void _e;
    }
    const tel = captured.events[0] as { confidence: string | null };
    expect(tel.confidence).toBe("think_so");
  });

  test("NO-DEFAULT: a no-tap ask carries null — never an inferred value", async () => {
    const { mod, captured } = makeHarness();
    await mod.ask(LEARNER, QUESTION, [], null, null, null, null);
    expect((captured.events[0] as { confidence: string | null }).confidence).toBeNull();
    const { mod: mod2, captured: cap2 } = makeHarness();
    await mod2.ask(LEARNER, QUESTION, [], null, null, null);
    expect((cap2.events[0] as { confidence: string | null }).confidence).toBeNull();
  });

  test("a refusal still logs the tap (log-first; the answer itself never mentions it)", async () => {
    const captured: unknown[] = [];
    // the refusal posture of record (tutor-core parity): an EMPTY graph —
    // no matched topics → no KG evidence, the empty vector arm → zero
    // grounding → the deterministic refusal, generator never reached
    const deps = {
      sql: fakeSql(),
      clock,
      kgGraph: {
        structureNodes: async () => [],
        prerequisiteChains: async () => new Map(),
        misconceptionsForTopics: async () => new Map(),
      },
      scopes,
      vectorRetriever: async () => [], // the deterministic refusal path
      paperQuestionResolver: notPaper,
      generator: { generate: async () => ({ answer: "", model: null, provider: "deterministic-refusal", finishReason: null }) },
      telemetry: (e: unknown) => captured.push(e),
      learnerModel: learnerModel() as never,
    };
    const mod = buildTutorModule(deps.sql, clock, deps as never);
    const result = await mod.ask(LEARNER, QUESTION, [], null, null, null, "sure");
    expect(result.refused).toBe(true);
    expect(result.probe).toBeNull(); // a refusal offers nothing
    const tel = captured[0] as { confidence: string | null; refused: boolean };
    expect(tel.confidence).toBe("sure");
    expect(tel.refused).toBe(true);
  });
});

describe("T-TUTOR-AIM-P2 — the probe offer (DC10 §7.6, offer-not-claim)", () => {
  test("a weak direct prerequisite offers ONE probe on both paths", async () => {
    const { mod, captured } = makeHarness({
      states: [{ nodeId: P1, mastery: 0.35, attempts: 2, correctCount: 0, lastPracticedAt: NOW, proceduralFluencyGap: null }],
    });
    const result = await mod.ask(LEARNER, QUESTION, [], null, null, null, null);
    expect(result.probe).toEqual({ nodeId: P1, title: "Vector components" });
    for await (const e of mod.askStream(LEARNER, QUESTION, [], null, null, null, null)) {
      if (e.kind === "completed") {
        expect(e.probe).toEqual({ nodeId: P1, title: "Vector components" });
      }
    }
    expect(captured.contexts.length).toBeGreaterThan(0);
  });

  test("an active misconception on the topic aims the answer (§7.5 composition) and the offer carries metadata only", async () => {
    const { mod, captured } = makeHarness({
      readings: [{ misconceptionNodeId: MISCO_1, effective: 0.72 }],
    });
    const result = await mod.ask(LEARNER, QUESTION, [], null, null, null, null);
    expect(result.probe).toBeNull(); // the misconception is on the TOPIC, not the prerequisite
    const ctx = captured.contexts[0]!;
    expect(ctx.aim).not.toBeNull();
    expect(ctx.aim!.correction).toEqual({ nodeId: MISCO_1, title: "gravity pulls sideways in flight" });
    // the §11 injection law: the prompt carries the CATALOG title, never a
    // probability or free-text reading
    const p = userPrompt(QUESTION, [], ctx, "NONCE1234");
    expect(p).toContain('"gravity pulls sideways in flight"');
    expect(p).not.toContain("0.72");
    expect(p).not.toContain("effective");
    expect(p).toContain("COMMAND WORD OF RECORD: EXPLAIN");
  });

  test("the empty learner posture stays byte-stable: no aim, no pin, no probe", async () => {
    const { mod, captured } = makeHarness();
    const result = await mod.ask(LEARNER, PLAIN_QUESTION, [], null, null, null, null);
    expect(result.probe).toBeNull();
    const ctx = captured.contexts[0]!;
    expect(ctx.aim).toBeNull();
    expect(ctx.commandWord).toBeNull();
    const p = userPrompt(PLAIN_QUESTION, [], ctx, "NONCE1234");
    expect(p).not.toContain("AIM (computed");
    expect(p).not.toContain("COMMAND WORD OF RECORD");
  });
});
