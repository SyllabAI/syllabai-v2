/**
 * T-TUTOR-AIM-P2 (DC10 §7.5): the aim — the deterministic selection laws +
 * the empty-context BYTE-STABILITY law + the v19 prompt rendering pins.
 *
 * Laws under test:
 *   - the aim consumes the reads assembleTutorContext ALREADY holds (M3: no
 *     new read) — assembleAim is pure over (knowledge, states, readings,
 *     pendingReviews);
 *   - CORRECTION: the strongest active reading (effective >= 0.5, the
 *     assembler's active gate) on a misconception the KG attached to a
 *     matched topic; ties/absence keep it null;
 *   - PROVEN: prerequisites at mastery >= AIM_PROVEN_MASTERY (0.70) —
 *     compressed, never re-derived;
 *   - STRONG AREAS: depth-1 adjacent nodes at proven mastery that are not
 *     themselves matched topics — the example-bias targets;
 *   - DECAY-DUE: flagged (pendingReviews ∩ matched topics) but renders
 *     NOTHING in P2 (the §7.8 hook is P3);
 *   - BYTE-STABILITY: an empty learner context aims NOTHING — no AIM block,
 *     no COMMAND WORD line, and the composed user prompt is byte-identical
 *     to the same prompt built without the P2 fields at all (the
 *     EMPTY-tables posture of learner-model.ts becomes the regression test).
 */
import { describe, expect, test } from "bun:test";
import {
  AIM_PROVEN_MASTERY,
  assembleAim,
  assembleTutorContext,
  type KnowledgeContext,
  type MisconceptionReading,
  type SkillState,
  type ReviewSchedulePendingRow,
} from "../../src/services/tutor/context";
import { systemPrompt, userPrompt, PROMPT_VERSION, promptIdentity } from "../../src/services/tutor/prompt";
import { evidenceFromChunk } from "../../src/services/tutor/evidence";

const NOW = new Date("2026-11-17T08:00:00Z");

const TOPIC_A = "aa000000-0000-4000-8000-00000000000a";
const TOPIC_B = "aa000000-0000-4000-8000-00000000000b";
const MISCO_1 = "ab000000-0000-4000-8000-000000000001";
const MISCO_2 = "ab000000-0000-4000-8000-000000000002";
const PREREQ_P1 = "ac000000-0000-4000-8000-000000000001";
const PREREQ_P2 = "ac000000-0000-4000-8000-000000000002";

const knowledge: KnowledgeContext = {
  topics: [{ nodeId: TOPIC_A, code: "4CH1-U1-T1", title: "Rates of reaction", matchScore: 0.9 }],
  prerequisites: [
    { forTopicId: TOPIC_A, nodeId: PREREQ_P1, title: "Particle collision theory", depth: 1 },
    { forTopicId: TOPIC_A, nodeId: PREREQ_P2, title: "Moles and concentration", depth: 1 },
    { forTopicId: TOPIC_A, nodeId: TOPIC_B, title: "Energy changes", depth: 1 },
  ],
  misconceptions: [
    { forTopicId: TOPIC_A, nodeId: MISCO_1, title: "particles get bigger when heated" },
    { forTopicId: TOPIC_A, nodeId: MISCO_2, title: "catalysts get used up" },
  ],
};

const state = (over: Partial<SkillState> & { nodeId: string }): SkillState => ({
  mastery: 0.4,
  attempts: 3,
  correctCount: 1,
  lastPracticedAt: NOW,
  proceduralFluencyGap: null,
  ...over,
});

const reading = (misconceptionNodeId: string, effective: number): MisconceptionReading => ({
  misconceptionNodeId,
  effective,
});

const pending = (nodeId: string): ReviewSchedulePendingRow => ({ nodeId });

// the evidence item the prompt needs (shape-only: one chunk row)
const evidence = [
  evidenceFromChunk({
    documentRowId: "dd000000-0000-4000-8000-000000000001",
    documentId: "doc-1",
    documentVersion: 1,
    chunkId: "ee000000-0000-4000-8000-000000000001",
    chunkIndex: 0,
    kind: "TEXTBOOK",
    content: "Collision theory: reactions occur when particles collide with sufficient energy.",
    pageStart: 12,
    pageEnd: 12,
    elementIds: [],
    embeddingModel: "text-embedding-004",
    cosine: 0.9,
  }),
];

const baseInputs = () => ({
  knowledge,
  evidence,
  learnerId: "l1" as string | null,
  states: [] as SkillState[],
  readings: [] as MisconceptionReading[],
  engagements: [],
  pendingReviews: [] as ReviewSchedulePendingRow[],
  query: "Explain why the rate increases with temperature." as string | null,
  now: NOW,
});

describe("assembleAim (DC10 §7.5 selection laws)", () => {
  test("the strongest active reading on a matched topic's misconception is the correction", () => {
    const aim = assembleAim(
      knowledge,
      [],
      [reading(MISCO_1, 0.6), reading(MISCO_2, 0.8)],
      [],
    );
    expect(aim).not.toBeNull();
    expect(aim!.correction).toEqual({ nodeId: MISCO_2, title: "catalysts get used up" });
    expect(aim!.decayDue).toBe(false);
  });

  test("a reading under the active gate (0.5) never corrects", () => {
    expect(assembleAim(knowledge, [], [reading(MISCO_1, 0.49)], [])).toBeNull();
  });

  test("a misconception attached to an UNMATCHED topic never corrects", () => {
    const k = { ...knowledge, misconceptions: [{ forTopicId: TOPIC_B, nodeId: MISCO_1, title: "x" }] };
    expect(assembleAim(k, [], [reading(MISCO_1, 0.9)], [])).toBeNull();
  });

  test("proven prerequisites compress at mastery >= 0.70; weak ones stay out", () => {
    const aim = assembleAim(
      knowledge,
      [state({ nodeId: PREREQ_P1, mastery: AIM_PROVEN_MASTERY }), state({ nodeId: PREREQ_P2, mastery: 0.3 })],
      [],
      [],
    );
    expect(aim).not.toBeNull();
    expect(aim!.correction).toBeNull();
    expect(aim!.provenPrerequisites).toEqual([{ nodeId: PREREQ_P1, title: "Particle collision theory" }]);
    // PREREQ_P1 is strong and adjacent — the example-bias target
    expect(aim!.strongAreas).toEqual([{ nodeId: PREREQ_P1, title: "Particle collision theory" }]);
  });

  test("strong areas exclude matched topics themselves", () => {
    // a node that is BOTH a matched topic and another topic's direct
    // prerequisite: proven (PROVEN line) but never an example-bias target
    const k: KnowledgeContext = {
      topics: [
        { nodeId: TOPIC_A, code: "4CH1-U1-T1", title: "Rates of reaction", matchScore: 0.9 },
        { nodeId: TOPIC_B, code: "4CH1-U1-T2", title: "Energy changes", matchScore: 0.8 },
      ],
      prerequisites: knowledge.prerequisites,
      misconceptions: [],
    };
    const aim = assembleAim(k, [state({ nodeId: TOPIC_B, mastery: 0.9 })], [], []);
    expect(aim!.strongAreas).toEqual([]);
    // but a matched topic that is proven still counts as a PROVEN prerequisite
    expect(aim!.provenPrerequisites).toEqual([{ nodeId: TOPIC_B, title: "Energy changes" }]);
  });

  test("decay-due flags on pendingReviews ∩ matched topics; alone it aims NOTHING in P2", () => {
    // decayDue rides the aim when the aim has something else to render
    const aim = assembleAim(knowledge, [], [reading(MISCO_1, 0.8)], [pending(TOPIC_A)]);
    expect(aim).not.toBeNull();
    expect(aim!.decayDue).toBe(true);
    // decayDue alone renders nothing — the null law (the §7.8 hook is P3)
    const only = { ...knowledge, misconceptions: [], prerequisites: [] };
    expect(assembleAim(only, [], [], [pending(TOPIC_A)])).toBeNull();
  });

  test("an empty learner context aims nothing (the byte-stability law)", () => {
    expect(assembleAim(knowledge, [], [], [])).toBeNull();
  });
});

describe("the v19 prompt (DC10 §7.5 AIM law + §7.3 pin)", () => {
  test("the version bump of record: tutor-grounded/v19", () => {
    expect(PROMPT_VERSION).toBe("19");
    expect(promptIdentity()).toBe("tutor-grounded/v19");
  });

  test("the AIM law is in the system prompt (both variants)", () => {
    for (const variant of ["chemistry", "general"] as const) {
      const p = systemPrompt(variant);
      expect(p).toContain("AIM. When the user message carries an AIM block");
      expect(p).toContain("compress what it marks PROVEN to at most one line");
      // presentation-only sovereignty pins
      expect(p).toContain("every claim still comes from the SOURCES with its citation");
      expect(p).toContain("an\n  ask without an AIM block is answered exactly as before");
    }
  });

  test("the v18 voice + shape laws are byte-unchanged (still in the prompt)", () => {
    const p = systemPrompt();
    expect(p).toContain("Open with the substance — never with praise or pleasantries");
    expect(p).toContain("answer in the shape that word is marked for");
  });

  test("EMPTY context: no AIM block, no COMMAND WORD line — and byte-identical to the pre-P2 composition", () => {
    // a question that does NOT open with a command word + no learner signal:
    // BOTH P2 fields stay null and the prompt is the pre-P2 bytes
    const inputs = baseInputs();
    inputs.query = "What is the state of matter at 0\u00b0C?";
    const ctx = assembleTutorContext(inputs);
    expect(ctx.aim).toBeNull();
    expect(ctx.commandWord).toBeNull();

    const q = "What is the state of matter at 0\u00b0C?";
    const withP2Fields = userPrompt(q, [], ctx, "NONCE1234");
    // the same prompt built with the PRE-P2 PromptContext shape (the P2
    // fields literally absent — the call shape every v18 call site had) —
    // byte-identical proves the machinery adds zero bytes
    const preP2Context = {
      learnerBrief: ctx.learnerBrief,
      memoryBrief: ctx.memoryBrief,
      knowledgeBrief: ctx.knowledgeBrief,
      evidence: ctx.evidence,
      interventionPlan: ctx.interventionPlan,
      activePaperLabel: ctx.activePaperLabel,
      quizScaffold: ctx.quizScaffold,
      courseCode: ctx.courseCode,
      disclosureTier: ctx.disclosureTier,
      markContext: ctx.markContext,
    };
    const withoutP2Fields = userPrompt(q, [], preP2Context, "NONCE1234");
    expect(withP2Fields).toBe(withoutP2Fields);
    expect(withP2Fields).not.toContain("AIM (computed");
    expect(withP2Fields).not.toContain("COMMAND WORD OF RECORD");
  });

  test("an aimed ask renders the AIM block and the command-word pin", () => {
    const inputs = baseInputs();
    inputs.states = [state({ nodeId: PREREQ_P1, mastery: 0.85 })];
    inputs.readings = [reading(MISCO_1, 0.72), reading(MISCO_2, 0.61)];
    const ctx = assembleTutorContext(inputs);
    expect(ctx.commandWord).toEqual({ word: "explain", family: "EXPLAIN" });

    const p = userPrompt("Explain why the rate increases with temperature.", [], ctx, "NONCE1234");
    expect(p).toContain("COMMAND WORD OF RECORD: EXPLAIN");
    expect(p).toContain("AIM (computed from this learner's own record for THIS question):");
    // the correction names the CATALOG title of the STRONGEST reading (0.72 > 0.61)
    expect(p).toContain('"particles get bigger when heated"');
    // the proven line compresses (never re-derive)
    expect(p).toContain("- PROVEN (do NOT re-derive; at most one acknowledging line): \"Particle collision theory\"");
    // the examples line biases to the strong adjacent area
    expect(p).toContain('- EXAMPLES: bias any example toward the learner\'s proven-strong adjacent areas: "Particle collision theory"');
  });

  test("a question that does not OPEN with a command word renders no pin", () => {
    const ctx = assembleTutorContext({ ...baseInputs(), query: "What is the state of matter at 0°C?" });
    expect(ctx.commandWord).toBeNull();
    const p = userPrompt("What is the state of matter at 0°C?", [], ctx, "NONCE1234");
    expect(p).not.toContain("COMMAND WORD OF RECORD");
  });

  test("the SOURCES/citation law is untouched by the aim (extractive grounding stands)", () => {
    const inputs = baseInputs();
    inputs.states = [state({ nodeId: PREREQ_P1, mastery: 0.9 })];
    inputs.readings = [reading(MISCO_1, 0.8)];
    const p = userPrompt("Explain why the rate increases.", [], assembleTutorContext(inputs), "NONCE1234");
    expect(p).toContain("SOURCES (cite these as [n]):");
    expect(p).toContain("[1]");
  });
});
