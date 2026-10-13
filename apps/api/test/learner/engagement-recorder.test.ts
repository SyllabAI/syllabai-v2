/**
 * T-MIG-124 Phase 2 — the engagement recorder pins
 * (services/learner/engagement-recorder.ts). The frozen law @ 6cad6ef
 * (learner/TutorEngagementRecorder.java, V21/P7 + V24 + V25 sprint-2 §9):
 *
 *   - the V25 row classifier is deterministic and precedence-ordered:
 *     intervention-type mappings first (MISCONCEPTION_REMEDIATION →
 *     MISCONCEPTION_RELATED, PREREQUISITE_REVIEW → PREREQUISITE_HELP), then
 *     the doubt substrings, then clarifications BEFORE explanations (so
 *     "what do you mean" — which contains the explanation pattern "what do"
 *     — is a CLARIFICATION_REQUEST), then the explanation vocabulary, then
 *     the TOPIC_ENGAGEMENT default; case-insensitive throughout; a null
 *     question classifies on the intervention type alone;
 *   - one PURE-APPEND row per matched topic; the hard boundaries record
 *     only the deterministic anchors (never the raw chat text, never
 *     LLM-invented entities); a null learnerId or an empty matched-topic
 *     list writes NOTHING;
 *   - every row stamps classifierVersion "tutor-signals/v2" (the V25
 *     provenance — the column default is the older v1, the recorder writes
 *     the explicit law);
 *   - the FREE_TUTOR surface carries null response-mode/context triple; the
 *     CONTEXTUAL_ASSISTANT surface carries the server-resolved identity
 *     triple (mode, kind, reference);
 *   - the sinks NEVER throw into the ask (the §22 append-guard class):
 *     a write failure loses the row, never the delivered answer.
 */
import { describe, expect, test } from "bun:test";
import {
  SIGNAL_POLICY_VERSION,
  classifyEngagementSignal,
  claInteractionTelemetrySink,
  tutorEngagementTelemetrySink,
} from "../../src/services/learner/engagement-recorder";
import type { ClaInteractionEvent } from "../../src/services/cla/service";
import type { TutorAnsweredEvent } from "../../src/services/tutor/karag";
import type { SqlFn } from "../../src/services/tutor/sql";
import type { Clock } from "../../src/services/tutor/session-store";

const NOW = new Date("2026-10-13T08:00:00Z");
const NOW_ISO = "2026-10-13T08:00:00.000Z";
const clock: Clock = { now: () => NOW };
const LEARNER = "bb000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;
function fakeSql(responses: Record<string, Row[]> = {}) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push({ text, params });
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) return responses[key];
    }
    return [];
  }) as unknown as SqlFn & { queries: Array<{ text: string; params: unknown[] }> };
  fn.queries = queries;
  return fn;
}

const tutorEvent = (over: Partial<TutorAnsweredEvent> = {}): TutorAnsweredEvent => ({
  learnerId: LEARNER,
  query: "what is a mole?",
  matchedTopicIds: ["n1", "n2"],
  evidenceCount: 3,
  evidenceSources: ["doc-1"],
  refused: false,
  model: "fake-model",
  promptIdentity: "tutor/v10",
  latencyMs: 1.5,
  at: NOW,
  interventionType: null,
  historyTurns: 2,
  sessionId: null,
  provider: "fake-provider",
  ...over,
});

const claEvent = (over: Partial<ClaInteractionEvent> = {}): ClaInteractionEvent => ({
  learnerId: LEARNER,
  question: "what does enthalpy mean?",
  topicNodeIds: ["n9"],
  evidenceCount: 1,
  evidenceSources: ["doc-2"],
  refused: false,
  model: "fake-model",
  promptIdentity: "cla/v1",
  latencyMs: 1.0,
  interventionType: null,
  mode: "EXAM",
  kind: "KG_TOPIC",
  reference: "aa000000-0000-4000-8000-000000000009",
  toolInvocations: [],
  ...over,
});

describe("the V25 engagement classifier", () => {
  test("intervention mappings outrank every substring list", () => {
    expect(classifyEngagementSignal("explain it again", "MISCONCEPTION_REMEDIATION")).toBe(
      "MISCONCEPTION_RELATED",
    );
    expect(classifyEngagementSignal("I'm stuck on this", "PREREQUISITE_REVIEW")).toBe(
      "PREREQUISITE_HELP",
    );
  });

  test("doubt substrings win over clarification/explanation (precedence 3)", () => {
    expect(classifyEngagementSignal("I'm so CONFUSED by this", null)).toBe("DOUBT_SIGNAL");
    expect(classifyEngagementSignal("totally lost on step 3", null)).toBe("DOUBT_SIGNAL");
    expect(classifyEngagementSignal("no idea how to start", null)).toBe("DOUBT_SIGNAL");
  });

  test("clarification is checked BEFORE explanation — 'what do you mean' is not an explanation request", () => {
    expect(classifyEngagementSignal("what do you mean", null)).toBe("CLARIFICATION_REQUEST");
    expect(classifyEngagementSignal("can you clarify that", null)).toBe("CLARIFICATION_REQUEST");
    expect(classifyEngagementSignal("say that again please", null)).toBe("CLARIFICATION_REQUEST");
  });

  test("explanation vocabulary; the trailing-space forms ('why ', 'how ') are the frozen list verbatim", () => {
    expect(classifyEngagementSignal("explain photosynthesis", null)).toBe("EXPLANATION_REQUEST");
    expect(classifyEngagementSignal("why is the sky blue", null)).toBe("EXPLANATION_REQUEST");
    expect(classifyEngagementSignal("how do orbits work", null)).toBe("EXPLANATION_REQUEST");
  });

  test("the default is TOPIC_ENGAGEMENT (the topic-match fact alone)", () => {
    expect(classifyEngagementSignal("hello there friend", null)).toBe("TOPIC_ENGAGEMENT");
    expect(classifyEngagementSignal(null, null)).toBe("TOPIC_ENGAGEMENT");
  });
});

describe("the FREE_TUTOR telemetry sink", () => {
  test("one pure-append row per matched topic with the frozen column law", async () => {
    const sql = fakeSql();
    tutorEngagementTelemetrySink(sql, clock)(tutorEvent());
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0)); // flush the fire-and-forget chain
    expect(sql.queries.length).toBe(2);
    for (const q of sql.queries) {
      expect(q.text).toContain("insert into tutor_topic_engagements");
      expect(q.text).toContain("classifier_version");
    }
    expect(sql.queries[0]?.params).toContain("n1");
    expect(sql.queries[1]?.params).toContain("n2");
    expect(sql.queries[0]?.params).toContain(SIGNAL_POLICY_VERSION); // "tutor-signals/v2" explicit
    expect(sql.queries[0]?.params).toContain("FREE_TUTOR");
    expect(sql.queries[0]?.params).toContain("EXPLANATION_REQUEST"); // "what is a mole?" hits the frozen "what is" vocabulary
    expect(sql.queries[0]?.params).toContain("fake-model");
  });

  test("refused asks still record — the honest unresolved-interaction fact", async () => {
    const sql = fakeSql();
    tutorEngagementTelemetrySink(sql, clock)(tutorEvent({ refused: true, matchedTopicIds: ["n1"] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.queries.length).toBe(1);
    expect(sql.queries[0]?.params).toContain(true);
  });

  test("the hard boundaries: a null learner or an empty topic match writes NOTHING", async () => {
    const sql = fakeSql();
    tutorEngagementTelemetrySink(sql, clock)(tutorEvent({ learnerId: null, matchedTopicIds: ["n1"] }));
    tutorEngagementTelemetrySink(sql, clock)(tutorEvent({ matchedTopicIds: [] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.queries.length).toBe(0);
  });

  test("the append guard: a write failure NEVER propagates into the ask", async () => {
    const boom = (async () => {
      throw new Error("db down");
    }) as unknown as SqlFn;
    expect(() => tutorEngagementTelemetrySink(boom, clock)(tutorEvent())).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  test("the intervention signal rides the row (the policy → classifier coupling)", async () => {
    const sql = fakeSql();
    tutorEngagementTelemetrySink(sql, clock)(
      tutorEvent({ interventionType: "MISCONCEPTION_REMEDIATION", matchedTopicIds: ["n1"] }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.queries[0]?.params).toContain("MISCONCEPTION_RELATED");
  });
});

describe("the CONTEXTUAL_ASSISTANT telemetry sink", () => {
  test("the V24 surface identity triple rides the row; the classifier reads the question", async () => {
    const sql = fakeSql();
    claInteractionTelemetrySink(sql, clock)(claEvent());
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.queries.length).toBe(1);
    expect(sql.queries[0]?.params).toContain("CONTEXTUAL_ASSISTANT");
    expect(sql.queries[0]?.params).toContain("EXAM"); // mode
    expect(sql.queries[0]?.params).toContain("KG_TOPIC"); // kind
    expect(sql.queries[0]?.params).toContain("aa000000-0000-4000-8000-000000000009"); // reference
    expect(sql.queries[0]?.params).toContain("EXPLANATION_REQUEST"); // "what does enthalpy mean?" hits the "what does" vocabulary
  });

  test("the empty-topic guard writes nothing", async () => {
    const sql = fakeSql();
    claInteractionTelemetrySink(sql, clock)(claEvent({ topicNodeIds: [] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.queries.length).toBe(0);
  });
});
