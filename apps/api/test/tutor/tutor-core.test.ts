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
import { evidenceFromChunk, evidenceFromNode, type EvidenceItem } from "../../src/services/tutor/evidence";
import {
  noReranker,
  prepare,
  TUTOR_EVIDENCE_LIMIT,
  TUTOR_PIN_FILLER_CAP,
} from "../../src/services/tutor/karag";
import { retrievalQuery } from "../../src/services/tutor/retrieval-query";
import { resolveCitations } from "../../src/services/tutor/citations";
import {
  TUTOR_REFUSAL,
  courseScopeRefusal,
  fenceClose,
  fenceOpen,
  nonce,
  promptIdentity,
  systemPrompt,
  userPrompt,
} from "../../src/services/tutor/prompt";
import { kgRetrieve, tokensOf } from "../../src/services/tutor/kg-retriever";
import {
  INTERVENTION_THRESHOLD,
  assembleTutorContext,
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
    // v15 (DC-1): the identity follows the bumped prompt
    expect(promptIdentity()).toBe("tutor-grounded/v15");
  });

  test("the v11 spec-is-a-map quiz law is in the system prompt", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain(
      "Quiz and understanding-check questions assess the learner's subject",
    );
    expect(prompt).toContain("Never ask the\n  learner to recall or state a specification reference");
    expect(prompt).toContain("the specification is a map the tutor\n  reads, not content the learner memorises");
  });

  test("the v12 QUIZ SCAFFOLD serving rule is in the system prompt", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain("When a QUIZ SCAFFOLD block is present");
    expect(prompt).toContain("serve ONLY the questions it lists, in its order");
    expect(prompt).toContain("not reveal the answers before the learner attempts each one");
  });

  test("the v14 two-tier disclosure law (spec-recovered) is in the system prompt", () => {
    // whitespace-normalized: the spec's verbatim spans wrap across lines in
    // the template — the LAW is the span, the wrap is typesetting
    const flat = systemPrompt().replace(/\s+/g, " ");
    // the spec §3.2 verbatim spans (docs/DC2-V14-SUPERSESSION-PLAN.md §3)
    expect(flat).toContain("Two-tier disclosure law");
    expect(flat).toContain(
      "tier 1 (hint level) applies to all pre-attempt assistance and all post-attempt inline tabs",
    );
    expect(flat).toContain(
      "tier 2 (explicit) applies only to a post-attempt chat turn on a marked part, or an explicit reveal affordance",
    );
    expect(flat).toContain(
      "you may name the skill, the command word, the technique and the shape of a good answer",
    );
    expect(flat).toContain(
      "you MUST NOT state an un-awarded marking point, its acceptable alternatives, or values that would complete it",
    );
    // the carry-forward floor of the authored v13 anchor (never silent-edited away)
    expect(flat).toContain("never present your own worked answer as the official mark scheme");
    expect(flat).toContain("answers stay hidden until each question is attempted");
    // both variants carry the law (it sits in the shared Rules list)
    expect(systemPrompt("general").replace(/\s+/g, " ")).toContain("Two-tier disclosure law");
  });

  // the minimal assembly context (the quiz-scaffold.test.ts fixture shape)
  const baseContext = {
    learnerBrief: "Learner state: no prior evidence on the topics in this question.",
    memoryBrief: null,
    knowledgeBrief: "Curriculum context: no topics matched this question.",
    evidence: [] as EvidenceItem[],
    interventionPlan: {
      type: "EXPLANATION",
      rationale: "anonymous request",
      actions: ["Explain the concept from the supplied sources."],
    },
    activePaperLabel: null,
    quizScaffold: null,
  };

  test("the DISCLOSURE TIER 2 block renders only at tier 2 (the v14 supersession)", () => {
    const tier2 = userPrompt("explain electrolysis", [], { ...baseContext, disclosureTier: 2 }, "TESTNONCE");
    expect(tier2).toContain("DISCLOSURE TIER 2:");
    expect(tier2).toContain("the learner's own marked attempt on this question");
    expect(tier2).toContain("labelled as mark-scheme content");
    // tier 1 (explicit or the undefined default) renders no block — the
    // tier-1 posture is the law bullet alone
    expect(userPrompt("explain electrolysis", [], { ...baseContext, disclosureTier: 1 }, "TESTNONCE")).not.toContain("DISCLOSURE TIER");
    expect(userPrompt("explain electrolysis", [], baseContext, "TESTNONCE")).not.toContain("DISCLOSURE TIER");
    // unfenced scaffolding ordering: the tier block sits in the scaffold
    // cluster (after the question, before the intervention plan)
    expect(tier2.indexOf("DISCLOSURE TIER 2:")).toBeGreaterThan(tier2.indexOf("QUESTION:"));
    expect(tier2.indexOf("DISCLOSURE TIER 2:")).toBeLessThan(tier2.indexOf("INTERVENTION PLAN:"));
    // v15 (DC-1): the tier-2 block names the MARK CONTEXT block as a lawful
    // source of scheme content
    expect(tier2).toContain("or the MARK CONTEXT block gives them");
  });

  // v15 (DC-1): the MARK CONTEXT block fixtures — the marking engine's own
  // artifacts for one explicitly referenced marked part (spec §3.1 P0016)
  const markCtx = {
    paperLabel: "4CH1/1C June 2022",
    questionNumber: "1",
    partLabel: "c",
    answerText: "The rate increases because the surface area is larger.",
    points: [
      { ref: "1-c-i", text: "correctly states the effect on rate", marks: 1, awarded: true, marksAwarded: 1 },
      { ref: "1-c-ii", text: "explains in terms of collision frequency", marks: 1, awarded: false, marksAwarded: 0 },
    ],
    totalAwarded: 1,
    totalPossible: 2,
  };

  test("the v15 MARK CONTEXT block renders the marking engine's own artifacts (never a re-derivation)", () => {
    const out = userPrompt(
      "why did I lose a mark on question 1c?",
      [],
      { ...baseContext, markContext: markCtx, disclosureTier: 2 },
      "TESTNONCE",
    );
    expect(out).toContain("MARK CONTEXT:");
    // the spec §3.1 law spans (docs/DC1-MARK-CONTEXT-PLAN.md §1)
    expect(out).toContain('question 1, part c, of the pinned paper "4CH1/1C June 2022"');
    expect(out).toContain("Ground EVERY statement about their attempt in THIS block only");
    expect(out).toContain("never re-derive, estimate or invent any part of it");
    expect(out).toContain('quote the learner\'s submitted answer verbatim ("You wrote: ...")');
    // the submitted answer is the LEARNER'S DATA — inside the fence pair
    expect(out).toContain(
      "Submitted answer (verbatim):\n<<<UNTRUSTED-TESTNONCE>>>The rate increases because the surface area is larger.<<<END-UNTRUSTED-TESTNONCE>>",
    );
    // the exact per-point accounting + scheme lines in order + the total
    expect(out).toContain("- 1-c-i (1 mark): AWARDED — 1/1; scheme line: correctly states the effect on rate");
    expect(out).toContain("- 1-c-ii (1 mark): NOT awarded — 0/1; scheme line: explains in terms of collision frequency");
    expect(out).toContain("Total: 1/2 marks.");
    // the spec's cross-part pin (c): synthesis only from the given Allocations
    expect(out).toContain("never invent another part's mark state");
  });

  test("the v15 MARK CONTEXT block: honest untyped answer, scaffold-cluster placement, absence", () => {
    const out = userPrompt(
      "q?",
      [],
      { ...baseContext, markContext: { ...markCtx, answerText: null }, disclosureTier: 2 },
      "TESTNONCE",
    );
    expect(out).toContain("(no typed answer was recorded for this part)");
    // placement: after the tier-2 block, before the intervention plan
    expect(out.indexOf("DISCLOSURE TIER 2:")).toBeGreaterThan(out.indexOf("QUESTION:"));
    expect(out.indexOf("MARK CONTEXT:")).toBeGreaterThan(out.indexOf("DISCLOSURE TIER 2:"));
    expect(out.indexOf("MARK CONTEXT:")).toBeLessThan(out.indexOf("INTERVENTION PLAN:"));
    // absent when there is no mark state — the ordinary grounded ask
    expect(userPrompt("q?", [], baseContext, "TESTNONCE")).not.toContain("MARK CONTEXT");
  });

  test("assembleTutorContext propagates the mark context (the shared contract, DC-1)", () => {
    const ctx = assembleTutorContext({
      knowledge: { topics: [], prerequisites: [], misconceptions: [] },
      evidence: [],
      learnerId: null,
      states: [],
      readings: [],
      engagements: [],
      pendingReviews: [],
      activePaperLabel: null,
      quizScaffold: null,
      disclosureTier: 2,
      markContext: markCtx,
      now: fixedClock.now(),
    });
    expect(ctx.markContext).toEqual(markCtx);
    expect(ctx.disclosureTier).toBe(2);
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

// ── run-004 proposal #2 — the merge laws (operator trace 1a1446156b9d046d) ──

describe("ka-rag merge laws — run-004 proposal #2 (dedup restored + rekeyed, pins lead, filler capped)", () => {
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
    async resolveForCourse() {
      return null;
    },
  };

  const chunkItem = (
    row: string,
    page: number | null,
    chunkId: string,
    kind: string,
    cosine = 0.9,
  ): EvidenceItem =>
    evidenceFromChunk({
      documentRowId: row,
      documentId: "doc-" + row,
      documentVersion: 1,
      chunkId,
      chunkIndex: 0,
      kind,
      content: `content-${chunkId}`,
      pageStart: page,
      pageEnd: null,
      elementIds: [],
      embeddingModel: "test",
      cosine,
    });

  const nodeItem = (nodeId: string, title: string): EvidenceItem =>
    evidenceFromNode({
      nodeId,
      code: "4CH1-T" + nodeId,
      nodeType: "TOPIC",
      title,
      description: null,
      matchScore: 0.9,
    });

  const run = (
    pins: EvidenceItem[],
    vector: EvidenceItem[],
    opts?: { evidenceLimit?: number },
  ) =>
    prepare(
      {
        sql: fakeSql({}),
        clock: fixedClock,
        kgGraph: emptyGraph,
        scopes,
        vectorRetriever: async () => vector,
        paperQuestionResolver: async () => ({
          items: pins,
          identityParsed: pins.length > 0,
          identityLabel: null,
        }),
        ...(opts?.evidenceLimit != null ? { evidenceLimit: opts.evidenceLimit } : {}),
      } as never,
      "l1",
      "what was question 6 in june 2019 paper 1?",
      [],
      null,
    );

  test("DEDUP RESTORED: two chunks of one document on one page cite once (the Set.add-truthiness port defect)", async () => {
    // same documentRowId + page, DIFFERENT chunkIds — the shipped no-op
    // dedup cited the identical /sources/ deep link twice (run-005 live)
    const prep = await run(
      [chunkItem("rowA", 11, "c1", "QUESTION_PAPER")],
      [
        chunkItem("rowA", 11, "c2", "QUESTION_PAPER", 0.8),
        chunkItem("rowB", 9, "m1", "MARK_SCHEME", 0.7),
      ],
    );
    expect(prep.evidence.map((i) => i.chunkId)).toEqual(["c1", "m1"]);
    const links = resolveCitations(prep.evidence).map((c) => `${c.label}|${c.deepLink}`);
    expect(new Set(links).size).toBe(links.length); // no duplicate citation
  });

  test("DEDUP REKEYED: the same document on DIFFERENT pages still serves both citations", async () => {
    const prep = await run(
      [chunkItem("rowA", 11, "c1", "QUESTION_PAPER")],
      [chunkItem("rowA", 12, "c3", "QUESTION_PAPER", 0.8)],
    );
    expect(prep.evidence.map((i) => i.pageStart)).toEqual([11, 12]);
  });

  test("PINS LEAD: QP/MS pins precede the card anchor; filler follows capped", async () => {
    const prep = await run(
      [
        chunkItem("rowCard", 1, "k1", "EXTERNAL_QUESTIONS"),
        chunkItem("rowA", 11, "c1", "QUESTION_PAPER"),
        chunkItem("rowB", 9, "m1", "MARK_SCHEME"),
      ],
      [
        nodeItem("n1", "Reactivity"),
        chunkItem("rowD", 1, "d1", "EXTERNAL_NOTES", 0.6),
        chunkItem("rowE", 2, "d2", "EXTERNAL_NOTES", 0.5),
        chunkItem("rowF", 3, "d3", "EXTERNAL_NOTES", 0.4),
      ],
    );
    // pins: QP, MS, then the demoted card; filler capped at 2 (node + d1)
    expect(prep.evidence.map((i) => i.chunkId ?? i.nodeId)).toEqual([
      "c1",
      "m1",
      "k1",
      "n1",
      "d1",
    ]);
    expect(prep.evidence.length).toBe(3 + TUTOR_PIN_FILLER_CAP);
  });

  test("FILLER CAP: dup filler does not burn the budget; the cap counts admissions", async () => {
    const prep = await run(
      [chunkItem("rowA", 11, "c1", "QUESTION_PAPER")],
      [
        chunkItem("rowA", 11, "c2", "QUESTION_PAPER", 0.85), // dup — dropped, no budget
        chunkItem("rowB", 9, "m1", "MARK_SCHEME", 0.7),
        chunkItem("rowB", 10, "m2", "MARK_SCHEME", 0.65),
        chunkItem("rowD", 1, "d1", "EXTERNAL_NOTES", 0.5),
      ],
    );
    // order is the fusion's (per-kind plan weights) — assert the LAWS:
    // the pin leads, exactly fillerCap admissions follow (a budget-burning
    // cap would admit only 1 filler here: the dup would consume a slot),
    // and no (row, page) pair appears twice.
    expect(prep.evidence[0]!.chunkId).toBe("c1");
    expect(prep.evidence.length).toBe(1 + TUTOR_PIN_FILLER_CAP);
    const keys = prep.evidence.map((i) => `${i.documentRowId}|${i.pageStart}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("NO PINS: the frozen evidence-limit behaviour is byte-for-byte unchanged", async () => {
    const vector = Array.from({ length: 8 }, (_, k) =>
      chunkItem(`row${k}`, k + 1, `v${k}`, "EXTERNAL_NOTES", 0.9 - k * 0.05),
    );
    const prep = await run([], vector);
    expect(prep.evidence.length).toBe(TUTOR_EVIDENCE_LIMIT);
  });
});

// ── run-004 proposal #1 — the evidence hygiene projection (operator trace
// 1a144e5e55662125): chunk-sourced content is unwrapped of the math-markup
// class before the prompt (the model copies what its context shows); KG
// nodes and the learner's own words pass through untouched. ─────────────────

describe("ka-rag evidence hygiene — run-004 proposal #1 (context math-unwrap)", () => {
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
    async resolveForCourse() {
      return null;
    },
  };

  const rawChunk = (kind: string, content: string): EvidenceItem =>
    evidenceFromChunk({
      documentRowId: "rowX",
      documentId: "doc-rowX",
      documentVersion: 1,
      chunkId: "cX",
      chunkIndex: 0,
      kind,
      content,
      pageStart: 3,
      pageEnd: null,
      elementIds: [],
      embeddingModel: "test",
      cosine: 0.9,
    });

  const run = (vector: EvidenceItem[]) =>
    prepare(
      {
        sql: fakeSql({}),
        clock: fixedClock,
        kgGraph: emptyGraph,
        scopes,
        vectorRetriever: async () => vector,
        paperQuestionResolver: async () => ({
          items: [],
          identityParsed: false,
          identityLabel: null,
        }),
      } as never,
      "l1",
      "explain the reaction",
      [],
      null,
    );

  test("CHUNK SOURCED: the math-markup class unwraps before the prompt", async () => {
    const prep = await run([
      rawChunk("QUESTION_PAPER", "sodium peroxide $ \\mathrm{(N a_{2} O_{2})} $ absorbs $ \\mathrm{C O_{2}} $"),
    ]);
    const content = prep.evidence[0]!.content;
    expect(content).not.toContain("$");
    expect(content).not.toContain("\\");
    expect(content).toContain("(Na2O2)");
    expect(content).toContain("CO2");
  });

  test("LEARNER WORK: the learner's own words pass through byte-for-byte", async () => {
    const mine = "i think the answer is $ \\mathrm{H 2 S O 4} $ maybe?";
    const mineItem: EvidenceItem = {
      source: "LEARNER_WORK",
      content: mine,
      documentRowId: "rowMine",
      documentId: "doc-rowMine",
      documentVersion: 1,
      chunkId: "mine-1",
      chunkIndex: 0,
      nodeId: null,
      nodeCode: null,
      nodeType: null,
      nodeTitle: null,
      pageStart: null,
      pageEnd: null,
      specCodes: [],
      sourcePageStart: null,
      sourcePageEnd: null,
      bookCourseId: null,
      elementIds: [],
      topicIds: [],
      retrievalScore: 0.9,
      fusedScore: 0.9,
      rerankScore: null,
    };
    const prep = await run([mineItem]);
    expect(prep.evidence[0]!.content).toBe(mine);
  });

  test("KG NODE: curated node content passes through byte-for-byte", async () => {
    const node = evidenceFromNode({
      nodeId: "n1",
      code: "4CH1-2.20",
      nodeType: "SUBTOPIC",
      title: "Ionic bonding $ \\mathrm{N a C l} $",
      description: null,
      matchScore: 0.9,
    });
    const prep = await run([node]);
    expect(prep.evidence[0]!.content).toContain("$ \\mathrm{N a C l} $");
  });

  test("DEDUP IDENTITY: hygiene cannot change the merge key (one page still one citation)", async () => {
    const prep = await run([
      rawChunk("QUESTION_PAPER", "before $ \\mathrm{A} $ after"),
      rawChunk("QUESTION_PAPER", "before $ \\mathrm{B} $ after"),
    ]);
    // same row + page — one citation regardless of content projection
    expect(prep.evidence.length).toBe(1);
  });
});

// ── DC-1 — the marking-context contract (spec §3.1 P0016; prereg
// docs/DC1-MARK-CONTEXT-PLAN.md, operator trace 1a15fe62c2e2bd2d):
// karag prepare() step 2.8 over the smartmark store, fail-open like the
// quiz scaffold. ─────────────────────────────────────────────────────────────

describe("DC-1 mark context — karag prepare() step 2.8 (spec §3.1 P0016)", () => {
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
    async resolveForCourse() {
      return null;
    },
  };
  const pin = {
    paperId: "pap1",
    paperCode: "4CH1/1C",
    sessionLabel: "June 2022",
    series: "June",
    year: 2022,
    validationState: "VALIDATED",
    items: [],
  };

  const pointRows = [
    { id: "mp1", ref: "1-c-i", ordering: 0, text: "correctly states the effect on rate", marks: 1, question_part_id: "p1c" },
    { id: "mp2", ref: "1-c-ii", ordering: 1, text: "explains in terms of collision frequency", marks: 1, question_part_id: "p1c" },
  ];
  const fullBreakdown = [
    { markPointId: "mp1", ref: "1-c-i", marks: 1, marksAwarded: 1, awarded: true, evidence: "e1", rationale: "r1" },
    { markPointId: "mp2", ref: "1-c-ii", marks: 1, marksAwarded: 0, awarded: false, evidence: "e2", rationale: "r2" },
  ];

  const run = (
    ask: string,
    responses: Record<string, Row[]>,
    opts?: { learnerId?: string | null; paperPin?: unknown },
  ) =>
    prepare(
      {
        sql: fakeSql(responses),
        clock: fixedClock,
        kgGraph: emptyGraph,
        scopes,
        vectorRetriever: async () => [],
        paperQuestionResolver: async () => ({
          items: [],
          identityParsed: false,
          identityLabel: null,
        }),
        paperPin: async () => pin,
        ...(opts != null && "paperPin" in opts ? { paperPin: opts.paperPin as never } : {}),
      } as never,
      opts?.learnerId === undefined ? "l1" : opts.learnerId,
      ask,
      [],
      null,
      "pap1",
    );

  const happyRows = {
    "select q.id, q.external_ref\n": [{ id: "q1", external_ref: "1" }],
    "join question_versions v on v.id = p.question_version_id": [
      { version_id: "v1", version: 1, id: "p1c", label: "c", marks: 2 },
    ],
    "from attempts a": [{ id: "a1" }],
    "from answers ans": [
      { id: "ans1", answer_text: "The rate increases because the surface area is larger." },
    ],
    "from smart_mark_results": [
      { id: "r1", answer_id: "ans1", marks_awarded: 1, validation_passed: true, breakdown: fullBreakdown },
    ],
    "from mark_schemes": [{ id: "ms1" }],
    "from mark_points": pointRows,
  };

  test("the happy path: the marking engine's OWN artifacts, tier 2, SOURCES untouched", async () => {
    const prep = await run("why did I lose a mark on question 1c?", happyRows);
    const mark = prep.markContext;
    expect(mark).not.toBeNull();
    expect(mark!.paperLabel).toBe("4CH1/1C June 2022");
    expect(mark!.questionNumber).toBe("1");
    expect(mark!.partLabel).toBe("c");
    expect(mark!.answerText).toBe("The rate increases because the surface area is larger.");
    expect(mark!.points.map((p) => [p.ref, p.awarded, p.marksAwarded, p.marks])).toEqual([
      ["1-c-i", true, 1, 1],
      ["1-c-ii", false, 0, 1],
    ]);
    expect(mark!.totalAwarded).toBe(1);
    expect(mark!.totalPossible).toBe(2);
    // the spec's tier-2 trigger on this surface (prereg R7): post-attempt
    // chat turn on a marked part
    expect(prep.disclosureTier).toBe(2);
    // the loader never feeds the SOURCES pool — the evidence path untouched
    expect(prep.evidence.length).toBe(0);
  });

  test("per-part external_ref rows match by suffix; a bound roman refines", async () => {
    const perPart = await run("what went wrong on question 1(c)?", {
      ...happyRows,
      "select q.id, q.external_ref\n": [
        { id: "q1a", external_ref: "1(a)" },
        { id: "q1c", external_ref: "1(c)" },
      ],
    });
    expect(perPart.markContext?.questionNumber).toBe("1(c)");
    expect(perPart.markContext?.partLabel).toBe("c");
    expect(perPart.disclosureTier).toBe(2);

    const roman = await run("why was question 2c(ii) wrong?", {
      "select q.id, q.external_ref\n": [
        { id: "q2c", external_ref: "2(c)" },
        { id: "q2cii", external_ref: "2(c)(ii)" },
      ],
      "join question_versions v on v.id = p.question_version_id": [
        { version_id: "v9", version: 1, id: "p2cii", label: "c (ii)", marks: 2 },
      ],
      "from attempts a": [{ id: "a9" }],
      "from answers ans": [{ id: "ans9", answer_text: "the answer text" }],
      "from smart_mark_results": [
        {
          id: "r9",
          answer_id: "ans9",
          marks_awarded: 1,
          validation_passed: true,
          breakdown: [
            { markPointId: "mp9", ref: "2-c-ii", marks: 1, marksAwarded: 1, awarded: true, evidence: "e", rationale: "r" },
          ],
        },
      ],
      "from mark_schemes": [{ id: "ms9" }],
      "from mark_points": [
        { id: "mp9", ref: "2-c-ii", ordering: 0, text: "the scheme line", marks: 1, question_part_id: "p2cii" },
      ],
    });
    expect(roman.markContext?.questionNumber).toBe("2(c)(ii)");
    expect(roman.markContext?.partLabel).toBe("c (ii)");
    expect(roman.markContext?.points.map((p) => [p.ref, p.awarded, p.marksAwarded])).toEqual([
      ["2-c-ii", true, 1],
    ]);
  });

  test("resolution order: no explicit reference → no mark context (arm 2 degrades honestly, prereg R2)", async () => {
    const prep = await run("explain electrolysis to me", happyRows);
    expect(prep.markContext).toBeNull();
    expect(prep.disclosureTier).toBe(1);
  });

  test("fail-open: unpinned, anonymous, no attempt, unvalidated, partial accounting, ambiguous", async () => {
    // the pin port absent — a reference cannot resolve a paper
    const unpinned = await run("why did I lose a mark on question 1c?", happyRows, {
      paperPin: undefined,
    });
    expect(unpinned.markContext).toBeNull();
    expect(unpinned.disclosureTier).toBe(1);
    // anonymous asks never read the attempt store
    const anonymous = await run("why did I lose a mark on question 1c?", happyRows, {
      learnerId: null,
    });
    expect(anonymous.markContext).toBeNull();
    expect(anonymous.disclosureTier).toBe(1);
    // no attempt on the part — honest (spec acceptance b: no fabrication)
    const noAttempt = await run("why did I lose a mark on question 1c?", {
      ...happyRows,
      "from attempts a": [],
    });
    expect(noAttempt.markContext).toBeNull();
    expect(noAttempt.disclosureTier).toBe(1);
    // the latest result is not validated — no mark state is served
    const unvalidated = await run("why did I lose a mark on question 1c?", {
      ...happyRows,
      "from smart_mark_results": [
        { id: "r1", answer_id: "ans1", marks_awarded: 0, validation_passed: false, breakdown: null },
      ],
    });
    expect(unvalidated.markContext).toBeNull();
    // a point without its decided entry → partial accounting → fail open
    const partial = await run("why did I lose a mark on question 1c?", {
      ...happyRows,
      "from smart_mark_results": [
        {
          id: "r1",
          answer_id: "ans1",
          marks_awarded: 1,
          validation_passed: true,
          breakdown: [fullBreakdown[0]!],
        },
      ],
    });
    expect(partial.markContext).toBeNull();
    // ambiguous suffix matches → fail open
    const ambiguous = await run("why did I lose a mark on question 1c?", {
      ...happyRows,
      "select q.id, q.external_ref\n": [
        { id: "q1", external_ref: "1(c)" },
        { id: "q1b", external_ref: "1 (c)" },
      ],
    });
    expect(ambiguous.markContext).toBeNull();
    expect(ambiguous.disclosureTier).toBe(1);
  });

  test("any loader failure degrades to the ordinary grounded ask (the quiz-scaffold law)", async () => {
    const events: unknown[] = [];
    const prep = await prepare(
      {
        sql: (async () => {
          throw new Error("store down");
        }) as never,
        clock: fixedClock,
        kgGraph: emptyGraph,
        scopes,
        vectorRetriever: async () => [],
        paperQuestionResolver: async () => ({
          items: [],
          identityParsed: false,
          identityLabel: null,
        }),
        paperPin: async () => pin,
      } as never,
      "l1",
      "why did I lose a mark on question 1c?",
      [],
      null,
      "pap1",
    );
    expect(prep.markContext).toBeNull();
    expect(prep.disclosureTier).toBe(1);
    void events;
  });
});
