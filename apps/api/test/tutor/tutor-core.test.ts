/**
 * T-MIG-060 tranche 1 pins — the deterministic tutor laws, line-against-line
 * against the frozen core @ 6cad6ef. Parity pins only; LLM outputs are never
 * golden-gated (R-LLM doctrine) — the generator seam is stubbed.
 */
import { describe, expect, test } from "bun:test";
import {
  MAX_HISTORY_TURNS,
  conversationTurnOf,
  sanitizeHistory,
  stripCitationMarkers,
} from "../../src/services/tutor/conversation";
import {
  ABS_PENDING,
  MAX_PENDING,
  MIN_TAIL,
  StreamSanitizer,
  sanitizeAnswer,
  streamThrough,
} from "../../src/services/tutor/sanitize";
import { fuse, fuseWithPlanWeights, PLAN_V2_WEIGHTS } from "../../src/services/tutor/rrf";
import { evidenceFromChunk, evidenceFromNode } from "../../src/services/tutor/evidence";
import { noReranker } from "../../src/services/tutor/karag";
import { retrievalQuery } from "../../src/services/tutor/retrieval-query";
import { resolveCitations } from "../../src/services/tutor/citations";
import {
  TUTOR_REFUSAL,
  courseScopeRefusal,
  fenceClose,
  fenceOpen,
  nonce,
  promptIdentity,
  userPrompt,
} from "../../src/services/tutor/prompt";
import { kgRetrieve, tokensOf } from "../../src/services/tutor/kg-retriever";
import {
  INTERVENTION_THRESHOLD,
  selectIntervention,
  type MisconceptionReading,
  type SkillState,
} from "../../src/services/tutor/context";
import { memoryDigest } from "../../src/services/tutor/context";
import { buildTutorSessionStore, type Clock } from "../../src/services/tutor/session-store";
import { buildTutorModule, type PaperQuestionResolver } from "../../src/services/tutor";
import type { SqlFn } from "../../src/services/tutor/sql";

// ── ConversationTurn (frozen :25-109) ───────────────────────────────────────

describe("conversation turn laws", () => {
  test("roles are whitelisted; unknown/blank roles drop the turn", () => {
    expect(conversationTurnOf("user", "hi")).toEqual({ role: "user", text: "hi" });
    expect(conversationTurnOf("assistant", "  answer [2] ")).toEqual({
      role: "assistant",
      text: "answer", // markers stripped + trimmed
    });
    expect(conversationTurnOf("system", "hi")).toBeNull();
    expect(conversationTurnOf("user", "  ")).toBeNull();
    expect(conversationTurnOf(null, "hi")).toBeNull();
  });

  test("assistant citation markers [n]/【n】 strip; user text stays verbatim", () => {
    expect(stripCitationMarkers("a [1] b 【12】 c")).toBe("a b c");
    expect(stripCitationMarkers("wide [2025] stays")).toBe("wide [2025] stays");
    const user = conversationTurnOf("user", "why is [2] like that");
    expect(user?.text).toBe("why is [2] like that");
    const assistant = conversationTurnOf("assistant", "see [3] and 【4】");
    expect(assistant?.text).toBe("see and");
  });

  test("turns bound at 2000 chars with the ellipsis suffix", () => {
    const long = "x".repeat(2500);
    const turn = conversationTurnOf("user", long);
    expect(turn?.text.length ?? 0).toBe(2000 + 1); // 2000 chars + "…"
    expect(turn?.text.endsWith("…") ?? false).toBe(true);
  });

  test("sanitize keeps the newest tail beyond MAX_HISTORY_TURNS", () => {
    const many = Array.from({ length: MAX_HISTORY_TURNS + 4 }, (_, i) => ({
      role: "user",
      text: `t${i}`,
    }));
    const clean = sanitizeHistory(many);
    expect(clean.length).toBe(MAX_HISTORY_TURNS);
    expect(clean[0]?.text).toBe("t4"); // the oldest survivors are the tail
    expect(clean[clean.length - 1]?.text).toBe("t15");
  });
});

// ── sanitizeAnswer + StreamSanitizer (frozen :482-514, :39-165) ─────────────

describe("output hygiene laws", () => {
  const open = fenceOpen("TESTCODE");
  const close = fenceClose("TESTCODE");

  test("fence echoes strip; in-range markers pass; out-of-range strip to the sink", () => {
    const raw = `a ${open}b${close} [1] [2] [3]`;
    const stripped: number[] = [];
    const out = sanitizeAnswer(raw, 2, open, close, (n) => stripped.push(n));
    expect(out).toBe("a b [1] [2] ");
    expect(stripped).toEqual([3]);
  });

  test("4-arg form output is byte-identical to the 5-arg (sink is observation-only)", () => {
    const raw = `x [1] 【9】 ${open}y${close}`;
    expect(sanitizeAnswer(raw, 1, open, close)).toBe(
      sanitizeAnswer(raw, 1, open, close, () => {}),
    );
  });

  test("stream parity: any delta split concatenates to the blocking sanitize", () => {
    const full = "the answer starts here [1] and cites [2] and 【7】 end";
    const evidenceCount = 2;
    // blocking reference
    const expected = sanitizeAnswer(full, evidenceCount, open, close);
    if (expected == null) throw new Error("sanitize returned null");
    // stream through hostile splits
    for (const chunkSize of [1, 2, 3, 5, 7, 11]) {
      const s = new StreamSanitizer(evidenceCount, open, close);
      const chunks: string[] = [];
      for (let i = 0; i < full.length; i += chunkSize) chunks.push(full.slice(i, i + chunkSize));
      const streamed = streamThrough(s, chunks);
      expect(streamed ?? null).toBe(expected);
      expect(s.strippedCitations()).toEqual([7]);
    }
  });

  test("forced cut never splits a marker (marker-opening retreat)", () => {
    // a space-free run longer than MAX_PENDING forces a cut; the '<'/'['/【'
    // retreat must keep every marker whole
    const hostile = "y".repeat(MAX_PENDING + 40) + `${open}z${close}` + " [1]";
    const s = new StreamSanitizer(1, open, close);
    const out = s.push(hostile) + s.flush();
    expect(out).not.toContain(open.slice(0, 5)); // no partial fence leak
    expect(out.includes("[1]")).toBe(true);
    expect(out.length).toBe(hostile.length - open.length - close.length);
  });

  test("constants match the frozen values", () => {
    expect(MAX_PENDING).toBe(512);
    expect(ABS_PENDING).toBe(8192);
    expect(MIN_TAIL).toBe(8);
    expect(nonce(() => 0)).toBe("AAAAAAAA"); // alphabet index 0
    expect(nonce(() => 0.999)).toBe("99999999"); // 31-char alphabet → index 30
  });
});

// ── RRF (frozen :22-138) ────────────────────────────────────────────────────

describe("reciprocal rank fusion", () => {
  const kg = evidenceFromNode({
    nodeId: "00000000-0000-0000-0000-000000000001",
    code: "IALCHEM2018-U1-T1",
    nodeType: "TOPIC",
    title: "Mole calculations",
    description: null,
    matchScore: 1,
  });
  const chunk = evidenceFromChunk({
    documentRowId: "00000000-0000-0000-0000-0000000000aa",
    documentId: "doc-1",
    documentVersion: 1,
    chunkId: "00000000-0000-0000-0000-0000000000bb",
    chunkIndex: 3,
    kind: "SYLLABUS",
    content: "spec text",
    pageStart: 6,
    pageEnd: null,
    elementIds: null,
    embeddingModel: "m",
    cosine: 0.9,
  });

  test("contribution = weight / (k + rank + 1); agreement accumulates", () => {
    const k = 60;
    const fused = fuse([[kg, chunk], [chunk]]);
    // chunk seen in both lists: rank 1 (w=0.9) + rank 0 (w=0.9)
    expect(fused[0]?.chunkId).toBe(chunk.chunkId);
    expect(fused[0]?.fusedScore).toBeCloseTo((0.9 / (k + 1 + 1)) + (0.9 / (k + 0 + 1)), 12);
    // kg seen once: rank 0, KNOWLEDGE_NODE weighs 1.0 (absent from the map)
    expect(fused[1]?.nodeId).toBe(kg.nodeId);
    expect(fused[1]?.fusedScore).toBeCloseTo(1 / (k + 0 + 1), 12);
  });

  test("plan weights: NOTE 1.0 > SYLLABUS 0.9 > QUESTION_PAPER 0.8 > TEXTBOOK 0.7 > MARK_SCHEME 0.6 > CARD 0.3", () => {
    expect(PLAN_V2_WEIGHTS.NOTE).toBe(1.0);
    expect(PLAN_V2_WEIGHTS.SYLLABUS).toBe(0.9);
    expect(PLAN_V2_WEIGHTS.QUESTION_PAPER).toBe(0.8);
    expect(PLAN_V2_WEIGHTS.TEXTBOOK).toBe(0.7);
    expect(PLAN_V2_WEIGHTS.MARK_SCHEME).toBe(0.6);
    expect(PLAN_V2_WEIGHTS.CARD).toBe(0.3);
    expect(PLAN_V2_WEIGHTS.KNOWLEDGE_NODE).toBe(1.0);
  });

  test("ties break by source ordinal then stable key (deterministic)", () => {
    const a = evidenceFromNode({
      nodeId: "00000000-0000-0000-0000-000000000002",
      code: "IALCHEM2018-U1-B",
      nodeType: "TOPIC",
      title: "B",
      description: null,
      matchScore: 1,
    });
    const b = evidenceFromNode({
      nodeId: "00000000-0000-0000-0000-000000000003",
      code: "IALCHEM2018-U1-A",
      nodeType: "TOPIC",
      title: "A",
      description: null,
      matchScore: 1,
    });
    const fused = fuseWithPlanWeights([[b, a]]);
    // equal scores (same rank, same weight) → nodeCode ASC
    expect(fused[0]?.nodeCode).toBe("IALCHEM2018-U1-A");
  });

  test("NoReranker copies the fused score into rerankScore — never null (T-MIG-070 blocker 2)", () => {
    // NoReranker.java:14-22 — item.withRerankScore(item.fusedScore()): the
    // §19 deterministic-identity/reproducibility contract; the former
    // pass-through left rerankScore: null on every post-fusion item while
    // the karag.ts comment claimed the copy.
    const a = { ...kg, fusedScore: 0.42 };
    const b = { ...chunk, fusedScore: 0.17 };
    const reranked = noReranker("why is that?", [a, b]);
    expect(reranked.map((i) => i.chunkId ?? i.nodeId)).toEqual([a.nodeId, b.chunkId]); // order copied
    expect(reranked.map((i) => i.rerankScore)).toEqual([0.42, 0.17]);
    expect(reranked.every((i) => i.rerankScore !== null)).toBe(true);
  });
});

// ── working memory (frozen :550-577) ────────────────────────────────────────

describe("retrieval query working memory", () => {
  test("no history → the question verbatim", () => {
    expect(retrievalQuery("why is that?", [])).toBe("why is that?");
  });
  test("newest turns enrich; render oldest-first with the question last", () => {
    const history = [
      { role: "user", text: "tell me about moles" },
      { role: "assistant", text: "moles measure amount" },
      { role: "user", text: "and molarity?" },
    ];
    const q = retrievalQuery("why is that?", history);
    expect(q).toBe("tell me about moles moles measure amount and molarity? why is that?");
  });
  test("the 1200-char budget trims the oldest material first", () => {
    const big = " ".repeat(0); // build exactly past the budget
    const history = [
      { role: "user", text: "a".repeat(700) },
      { role: "assistant", text: "b".repeat(700) },
    ];
    const q = retrievalQuery("question", history);
    // used starts at 8 ("question"); the NEWEST turn (b*700) fits (708 <= 1200);
    // the OLDEST (a*700) would overflow and is dropped first — oldest material
    // trims first, exactly as the frozen loop breaks (:562-564)
    expect(q.startsWith("b")).toBe(true);
    expect(q.endsWith("question")).toBe(true);
    expect(q).not.toContain("aaa");
  });
});

// ── citations (frozen SimpleCitationResolver :22-81) ────────────────────────

describe("citation resolution", () => {
  test("labels, page suffixes and deep links follow the frozen switch", () => {
    const node = evidenceFromNode({
      nodeId: "00000000-0000-0000-0000-000000000001",
      code: "IALCHEM2018-U1-T1",
      nodeType: "TOPIC",
      title: "Mole calculations",
      description: null,
      matchScore: 1,
    });
    const ms = evidenceFromChunk({
      documentRowId: "00000000-0000-0000-0000-0000000000aa",
      documentId: "doc-1",
      documentVersion: 1,
      chunkId: "00000000-0000-0000-0000-0000000000bb",
      chunkIndex: 0,
      kind: "MARK_SCHEME",
      content: "ms",
      pageStart: 6,
      pageEnd: 8,
      elementIds: null,
      embeddingModel: "m",
      cosine: 0.9,
    });
    const citations = resolveCitations([node, ms]);
    expect(citations[0]).toEqual({
      index: 1,
      label: "Specification topic IALCHEM2018-U1-T1 — Mole calculations",
      sourceType: "KNOWLEDGE_NODE",
      documentId: null,
      page: null,
      nodeId: node.nodeId,
      deepLink: `/api/v1/knowledge/nodes/${node.nodeId}`,
    });
    expect(citations[1]?.label).toBe("Mark scheme — pp6–8");
    expect(citations[1]?.deepLink).toBe(`/api/v1/content/documents/${ms.documentRowId}?page=6`);
  });
});

// ── refusal texts (frozen KaRagService :48-83, byte-verbatim) ───────────────

describe("refusal texts", () => {
  test("the three refusal laws are the frozen bytes", () => {
    expect(TUTOR_REFUSAL).toBe(`I can't answer that from the validated course material yet. There is no
matching specification topic or source document for this question, so
answering would mean guessing — which SyllabAI never does. Try naming the
topic (e.g. "moles", "bonding", "equilibria") or ask your teacher to
ingest the relevant material.`);
    expect(courseScopeRefusal("4CH1")).toContain('scoped to the course "4CH1"');
    expect(courseScopeRefusal("4CH1")).toContain("SyllabAI never answers across\ncourses");
    expect(promptIdentity()).toBe("tutor-grounded/v10");
  });
});

// ── KG intent matcher (frozen GraphKnowledgeRetriever :46-187) ──────────────

describe("kg intent matcher", () => {
  const graph = {
    async structureNodes() {
      return [
        { id: "n1", code: "T-LONG", title: "understand how to plot and interpret solubility curves", validation_status: "VALIDATED" },
        { id: "n2", code: "T-SHORT", title: "Mole calculations", validation_status: "VALIDATED" },
        { id: "n3", code: "T-UNVAL", title: "Mole calculations excel", validation_status: "SUGGESTED" },
        { id: "n4", code: "T-PLURAL", title: "Equilibrium", validation_status: "VALIDATED" },
      ];
    },
    async prerequisiteChains() {
      return new Map();
    },
    async misconceptionsForTopics() {
      return new Map();
    },
  };
  const scope = { surface: new Set(["n1", "n2", "n3", "n4"]), curriculumVersionId: "cv" };

  test("single generic token in a long title does NOT match (0.5 floor)", async () => {
    const ctx = await kgRetrieve(graph, "plot", 5, scope);
    expect(ctx.topics).toEqual([]);
  });
  test("a dominating single token matches a short title; plurals normalize symmetrically", async () => {
    const moles = await kgRetrieve(graph, "moles", 5, scope);
    expect(moles.topics.map((t) => t.code)).toEqual(["T-SHORT"]);
    const eq = await kgRetrieve(graph, "equilibria in gases", 5, scope);
    // "equilibria" → normalizePlural strips nothing (ends 'a'); the title
    // token "equilibrium" never matches — the honest v0 no-stemming
    // limitation pinned (:37-43), feeding the fail-closed refusal path
    expect(eq.topics.map((t) => t.code)).toEqual([]);
  });
  test("unvalidated seeds are invisible (§7)", async () => {
    const ctx = await kgRetrieve(graph, "mole calculations excel", 5, scope);
    expect(ctx.topics.map((t) => t.code)).not.toContain("T-UNVAL");
  });
  test("tokenizer drops stop tokens and 1-2 char fragments", () => {
    expect(tokensOf("How can you explain the moles?")).toEqual(new Set(["mole"]));
    expect(tokensOf("it is a")).toEqual(new Set());
  });
});

// ── policy + memory (frozen TutorPolicyService / TutorMemoryService) ────────

describe("tutor policy precedence", () => {
  const topics = [{ nodeId: "t1", code: "C1", title: "T", matchScore: 1 }];
  const misconceptions = [{ forTopicId: "t1", nodeId: "m1", title: "M" }];
  const baseState: SkillState = {
    nodeId: "t1",
    mastery: 0.4,
    attempts: 2,
    correctCount: 1,
    lastPracticedAt: null,
    proceduralFluencyGap: null,
  };

  test("1) teacher-confirmed inference on a matched topic wins", () => {
    const plan = selectIntervention(
      "l1",
      topics,
      misconceptions,
      [],
      [
        {
          topicNodeId: "t1",
          probability: 0.1,
          teacherConfirmed: true,
          teacherRejected: false,
          type: "PREREQUISITE_GAP",
          subtype: "weak-basics",
        },
      ],
    );
    expect(plan.type).toBe("PREREQUISITE_REVIEW");
  });

  test("2) probability ≥ 0.65 wins; 3) active BDT misconception overrides EXPLANATION", () => {
    const strong = selectIntervention(
      "l1",
      topics,
      misconceptions,
      [],
      [
        {
          topicNodeId: "t1",
          probability: INTERVENTION_THRESHOLD,
          teacherConfirmed: false,
          teacherRejected: false,
          type: "EXAM_LITERACY",
          subtype: null,
        },
      ],
    );
    expect(strong.type).toBe("PROCEDURAL_FLUENCY");

    const reading: MisconceptionReading = { misconceptionNodeId: "m1", effective: 0.5 };
    const byMisconception = selectIntervention("l1", topics, misconceptions, [reading], []);
    expect(byMisconception.type).toBe("MISCONCEPTION_REMEDIATION");
    const fallback = selectIntervention(
      "l1",
      topics,
      misconceptions,
      [{ misconceptionNodeId: "m1", effective: 0.49 }],
      [],
    );
    expect(fallback.type).toBe("EXPLANATION");
  });

  test("anonymous asks fall back to EXPLANATION without reading anything", () => {
    const plan = selectIntervention(null, topics, misconceptions, [], []);
    expect(plan.type).toBe("EXPLANATION");
    expect(plan.rationale).toBe("anonymous request");
  });

  test("episodic digest: doubt-heavy asks flag (mostly doubt-checks); recency is coarse", () => {
    const now = new Date("2026-10-06T04:00:00Z");
    const line = memoryDigest(
      "l1",
      [{ nodeId: "t1", title: "Mole calculations" }],
      [baseState],
      [
        { nodeId: "t1", signalType: "DOUBT_SIGNAL", occurredAt: new Date("2026-10-05T10:00:00Z") },
        { nodeId: "t1", signalType: "MISCONCEPTION_RELATED", occurredAt: new Date("2026-10-06T03:00:00Z") },
      ],
      [],
      now,
    );
    expect(line).toContain("- 'Mole calculations': 2 earlier tutor ask(s), the last earlier today");
    // doubtish=2 of n=2 → doubtish*2 > n → the flag renders (:140-142)
    expect(line).toContain("(mostly doubt-checks)");
    expect(line).toContain("practiced 2 time(s), 1 correct");
    expect(line).not.toContain("due for a spaced review");
  });
});

// ── the §22 session store over fakeSql ──────────────────────────────────────

type Row = Record<string, unknown>;
function fakeSql(responses: Record<string, Row[]>) {
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?");
    void params;
    for (const key of Object.keys(responses)) {
      if (text.includes(key)) return responses[key];
    }
    return [];
  }) as unknown as SqlFn;
  return fn;
}

const fixedClock: Clock = { now: () => new Date("2026-10-06T04:00:00Z") };

describe("tutor session store (§22 laws)", () => {
  test("create caps at 50 per learner (R13, 409 class)", async () => {
    const store = buildTutorSessionStore(
      fakeSql({ "count(*) as n from tutor_sessions": [{ n: 50 }] }),
      fixedClock,
    );
    await expect(store.create("l1")).rejects.toThrow(
      "session limit reached (50) — delete an old chat to start a new one",
    );
  });

  test("foreign-or-unknown sessions 404 identically", async () => {
    const store = buildTutorSessionStore(
      fakeSql({ "select id, learner_id": [] }),
      fixedClock,
    );
    await expect(store.view("l1", "s1")).rejects.toThrow("tutor session s1 not found");
    await expect(store.requireOwned("l1", "s1")).rejects.toThrow("tutor session s1 not found");
  });

  test("title derivation: one line, 120-char bound with the stripped ellipsis", async () => {
    const store = buildTutorSessionStore(
      fakeSql({
        "from tutor_sessions": [
          {
            id: "s1",
            learner_id: "l1",
            created_at: "2026-10-06T03:00:00Z",
            last_active_at: "2026-10-06T03:30:00Z",
            course_ref: null,
          },
        ],
        "group by session_id": [{ session_id: "s1", n: 2 }],
        "seq = 1": [{ session_id: "s1", role: "user", content: "  what  is  a   mole?  " }],
      }),
      fixedClock,
    );
    const summaries = await store.list("l1");
    const first = summaries[0];
    expect(first?.sessionId).toBe("s1");
    expect(first?.turnCount).toBe(2);
    expect(first?.title).toBe("what is a mole?");
    expect(first?.courseRef ?? null).toBeNull();
    expect(first?.createdAt).toBe("2026-10-06T03:00:00Z");
  });

  test("append persists the bound user turn + the stripped, bound assistant turn (:268-269, :281-287)", async () => {
    // T-MIG-070 nit-6 rider: the append law is now PINNED, not just exercised
    // — the user turn is bound-and-trimmed (NO citation strip on the user
    // side), the assistant turn is bound(stripCitationMarkers(answer)) — a
    // stored transcript renders as the learner-visible prose.
    const inserts: Array<{ text: string; params: unknown[] }> = [];
    const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("insert into tutor_session_turns")) inserts.push({ text, params });
      if (text.includes("select id, learner_id")) {
        return [
          {
            id: "s1",
            learner_id: "l1",
            created_at: "2026-10-06T03:00:00Z",
            last_active_at: "2026-10-06T03:30:00Z",
            course_ref: "4CH1",
          },
        ];
      }
      return [];
    }) as unknown as SqlFn;
    const store = buildTutorSessionStore(fn, fixedClock);
    await store.append("l1", {
      sessionId: "s1",
      question: "  what is a mole?  ",
      answer: "A mole [1] is a unit 【2】 of amount.",
      evidenceCount: 2,
      refused: false,
      model: "m",
      provider: "p",
      latencyMs: 12.5,
      courseRef: "4CH1",
    });
    expect(inserts.length).toBe(2); // the user turn and the assistant turn save together
    const userTurn = inserts[0]?.params ?? [];
    const assistantTurn = inserts[1]?.params ?? [];
    expect(userTurn[2]).toBe("user");
    expect(userTurn[3]).toBe("what is a mole?"); // bound() trims; user side stays verbatim
    expect(assistantTurn[2]).toBe("assistant");
    expect(assistantTurn[3]).toBe("A mole is a unit of amount."); // the :268-269 strip law
  });

  test("the stored assistant content binds at 4000 chars with the ellipsis (:281-287)", async () => {
    const inserts: Array<{ text: string; params: unknown[] }> = [];
    const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("insert into tutor_session_turns")) inserts.push({ text, params });
      if (text.includes("select id, learner_id")) {
        return [
          {
            id: "s1",
            learner_id: "l1",
            created_at: "2026-10-06T03:00:00Z",
            last_active_at: "2026-10-06T03:30:00Z",
            course_ref: "4CH1",
          },
        ];
      }
      return [];
    }) as unknown as SqlFn;
    const store = buildTutorSessionStore(fn, fixedClock);
    await store.append("l1", {
      sessionId: "s1",
      question: "q",
      answer: "x".repeat(4100),
      evidenceCount: 0,
      refused: false,
      model: "m",
      provider: "p",
      latencyMs: 1,
      courseRef: null,
    });
    const assistantTurn = inserts[1]?.params ?? [];
    const stored = assistantTurn[3] as string;
    expect(stored.length).toBe(4000 + 1); // 4000 chars + the ellipsis suffix
    expect(stored.endsWith("…")).toBe(true);
  });
});

// ── the pipeline: refusal parity + stream event order (stubbed generator) ──

describe("ka-rag pipeline parity", () => {
  const emptyGraph = {
    async structureNodes() {
      return [];
    },
    async prerequisiteChains() {
      return new Map();
    },
    async misconceptionsForTopics() {
      return new Map();
    },
  };
  const scopes = {
    async resolveActive() {
      return { curriculumVersionId: "cv", code: "4CH1", surface: new Set(["n1"]) };
    },
    async resolveForCourse(ref: string) {
      return ref === "4CH1"
        ? { curriculumVersionId: "cv", code: "4CH1", surface: new Set(["n1"]) }
        : null;
    },
  };
  const notPaper: PaperQuestionResolver = async () => ({
    items: [],
    identityParsed: false,
    identityLabel: null,
  });
  const events: unknown[] = [];
  const deps = {
    sql: fakeSql({}),
    clock: fixedClock,
    kgGraph: emptyGraph,
    scopes,
    vectorRetriever: async () => [],
    paperQuestionResolver: notPaper,
    generator: {
      async generate() {
        throw new Error("refusal paths never reach the generator");
      },
      // eslint-disable-next-line require-yield
      async *streamGenerate() {
        throw new Error("refusal paths never reach the generator");
      },
    },
    telemetry: (e: unknown) => events.push(e),
  } as const;

  test("empty grounding refuses deterministically (no LLM call) with the frozen bytes", async () => {
    events.length = 0;
    const mod = buildTutorModule(deps.sql, fixedClock, { ...deps } as never);
    const result = await mod.ask("l1", "why is that?", [], null, null);
    expect(result.refused).toBe(true);
    expect(result.provider).toBe("deterministic-refusal");
    expect(result.answer).toBe(TUTOR_REFUSAL);
    expect(result.evidenceCount).toBe(0);
    expect(result.citations).toEqual([]);
    expect(events.length).toBe(1); // the research event publishes exactly once
  });

  test("V53: a course ref that resolves to nothing refuses naming the ref", async () => {
    events.length = 0;
    const mod = buildTutorModule(deps.sql, fixedClock, { ...deps } as never);
    const result = await mod.ask("l1", "why is that?", [], null, "NOPE");
    expect(result.refused).toBe(true);
    expect(result.provider).toBe("deterministic-course-refusal");
    expect(result.answer).toBe(courseScopeRefusal("NOPE"));
  });

  test("streamed refusal: citations → meta → delta → completed (byte-identical text)", async () => {
    events.length = 0;
    const mod = buildTutorModule(deps.sql, fixedClock, { ...deps } as never);
    const seen: string[] = [];
    for await (const event of mod.askStream("l1", "why is that?", [], null, null)) {
      seen.push(event.kind);
      if (event.kind === "meta") {
        expect(event.provider).toBe("deterministic-refusal");
        expect(event.refused).toBe(true);
      }
      if (event.kind === "delta") expect(event.text).toBe(TUTOR_REFUSAL);
    }
    expect(seen).toEqual(["citations", "meta", "delta", "completed"]);
    expect(events.length).toBe(1); // eager publication, evidenceCount 0
  });

  test("blank questions throw the frozen argument error", async () => {
    const mod = buildTutorModule(deps.sql, fixedClock, { ...deps } as never);
    await expect(mod.ask("l1", "   ", [], null, null)).rejects.toThrow(
      "question must not be blank",
    );
  });
});
