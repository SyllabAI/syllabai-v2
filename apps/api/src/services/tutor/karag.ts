/**
 * KaRagService port (T-MIG-060 tranche 1) — frozen source @ 6cad6ef:
 * src/main/java/com/syllabai/tutor/KaRagService.java :44-584, line-against-line.
 *
 * KA-RAG orchestration (T-024, Master Spec §13): intent → KG context →
 * hybrid retrieval → fusion → rerank → grounded generation → citations →
 * telemetry. The pipeline's contract with itself:
 *   - intent is deterministic (no LLM entity invention, §7);
 *   - retrieval is hybrid — KG and vector evidence are fused by rank;
 *   - generation is grounded — zero surviving evidence refuses
 *     (deterministically, no LLM call);
 *   - a parsed paper-question identity that binds zero validated anchors
 *     refuses deterministically too (the fail-open guard, 09-27
 *     adjudication direction (a));
 *   - V53 (ADR-030): a present courseRef resolves EXACTLY that curriculum —
 *     zero or ambiguous matches refuse naming the ref, never a cross-corpus
 *     fallback.
 *
 * STREAM PARITY (askStream :284-392): the SAME prepare() as the blocking
 * ask (shared retrieval decisions cannot drift); citations BEFORE
 * generation; meta committed with the FIRST delta; refusals emit
 * citations → meta → single delta → completed with byte-identical texts;
 * an EMPTY generation (no surviving token) is a generation FAILURE (L2,
 * :361-376) — no meta, no telemetry event, nothing persists.
 */
import {
  sanitizeHistory,
  type ConversationTurn,
} from "./conversation";
import {
  type InterventionPlan,
  type TutorContext,
  assembleTutorContext,
  type KnowledgeContext,
  type MisconceptionReading,
  type SkillState,
  type StruggleInferenceRow,
  type TutorTopicEngagementRow,
  type ReviewSchedulePendingRow,
} from "./context";
import { resolveCitations, type Citation } from "./citations";
import { ArgumentError, TutorGenerationError } from "./errors";
import {
  fenceClose,
  fenceOpen,
  nonce,
  systemPrompt,
  userPrompt,
} from "./prompt";
import { evidenceFromNode, withRerankScore, type EvidenceItem } from "./evidence";
import { kgRetrieve } from "./kg-retriever";
import {
  TUTOR_REFUSAL,
  courseScopeRefusal,
  paperIdentityRefusal,
  promptIdentity,
} from "./prompt";
import { retrievalQuery } from "./retrieval-query";
import { fuseWithPlanWeights } from "./rrf";
import {
  StreamSanitizer,
  sanitizeAnswer,
} from "./sanitize";
import type { SqlFn } from "./sql";
import type { Clock } from "./session-store";

// ── budgets (:96-105) ───────────────────────────────────────────────────────

export const TUTOR_MAX_TOPICS = 5; // syllabai.tutor.max-topics
export const TUTOR_VECTOR_CANDIDATES = 12; // syllabai.tutor.vector-candidates
export const TUTOR_EVIDENCE_LIMIT = 6; // syllabai.tutor.evidence-limit

// ── ports (the module composes; no silent defaults for safety-critical laws) ─

/** The reranker port (v0: NoReranker keeps the merged order). */
export type EvidenceReranker = (
  query: string,
  fused: ReadonlyArray<EvidenceItem>,
) => ReadonlyArray<EvidenceItem>;

/** NoReranker — v0: copies the fused order with rerankScore = fused.
 * The frozen law is REAL, not commentary (NoReranker.java:14-22 —
 * item.withRerankScore(item.fusedScore()): "rerankScore copies the fused
 * score so downstream consumers never see null", the §19
 * deterministic-identity/reproducibility contract). T-MIG-070 restores the
 * copy — the former pass-through left rerankScore: null on every post-fusion
 * item while this comment claimed otherwise. */
export const noReranker: EvidenceReranker = (_query, fused) =>
  fused.map((i) => withRerankScore(i, i.fusedScore));

/** The vector arm (frozen ContentVectorRetriever :60-81): MIN_COSINE 0.50
 *  floor (T-C42 calibration), honest empty on an unavailable embedding
 *  provider (document evidence unavailable, not a pipeline failure). */
export type VectorRetriever = (
  query: string,
  limit: number,
  scope: { surface: ReadonlySet<string>; curriculumVersionId: string },
) => Promise<EvidenceItem[]>;

/** ContentVectorRetriever.MIN_COSINE :52 — the calibrated floor. */
export const MIN_COSINE = 0.5;

/**
 * The paper-question port (PaperQuestionResolver.Resolution :149-156): the
 * fail-open guard's identity parser. REQUIRED in the module factory — there
 * is deliberately NO silent "notPaperAsk" default, because defaulting would
 * disable the guard (the confident-misattribution class it exists to kill)
 * without anyone deciding to. Tranche-1b lands the full port
 * (services/tutor/paper-question.ts — buildPaperQuestionResolver); routes
 * (tranche-2) wire it. The scope gains the subject `code` the resolver's
 * card/store tiers read (CurriculumScopePort satisfies it structurally;
 * functions typed against the narrower pre-1b shape stay assignable).
 */
export interface PaperResolution {
  items: EvidenceItem[];
  identityParsed: boolean;
  identityLabel: string | null;
}

export type PaperQuestionResolver = (
  retrievalQueryText: string,
  scope: { surface: ReadonlySet<string>; curriculumVersionId: string; code: string },
) => Promise<PaperResolution>;

/** The generation seam (R-LLM: LLM outputs never golden-gated). Blocking
 *  `generate` + streaming `streamGenerate`; the fixed client-safe failure
 *  text travels as TutorGenerationError (deep-audit M2). */
export interface TutorGenerator {
  generate(
    query: string,
    history: ReadonlyArray<ConversationTurn>,
    context: TutorContext,
  ): Promise<GeneratedAnswer>;
  streamGenerate(
    query: string,
    history: ReadonlyArray<ConversationTurn>,
    context: TutorContext,
  ): AsyncIterable<GeneratedDelta>;
}

export interface GeneratedAnswer {
  answer: string;
  model: string | null;
  provider: string;
}

export interface GeneratedDelta {
  answer: string;
  model: string | null;
  provider: string | null; // null on the sanitizer's tail-flush delta
}

/** The curriculum-scope port (services/content/scope.ts composition). */
export interface CurriculumScopePort {
  curriculumVersionId: string;
  code: string;
  surface: ReadonlySet<string>;
}

export type CurriculumScopes = {
  resolveActive(
    learnerId: string | null,
  ): Promise<CurriculumScopePort | null>;
  resolveForCourse(ref: string): Promise<CurriculumScopePort | null>;
};

/** The research-telemetry port (the TutorAnsweredEvent consumer, §18). */
export interface TutorAnsweredEvent {
  learnerId: string | null;
  query: string;
  matchedTopicIds: string[];
  evidenceCount: number;
  evidenceSources: string[];
  refused: boolean;
  model: string | null;
  promptIdentity: string;
  latencyMs: number;
  at: Date;
  interventionType: string | null;
  historyTurns: number;
  sessionId: string | null;
  provider: string | null;
}
export type TelemetrySink = (event: TutorAnsweredEvent) => void;

/** The learner-model reads the context assembly consumes (M3: once per ask). */
export interface LearnerModelPort {
  skillStates(learnerId: string): Promise<SkillState[]>;
  misconceptionReadings(learnerId: string): Promise<MisconceptionReading[]>;
  /** active struggle inferences (read contract enforced on read) */
  activeStruggleInferences(learnerId: string): Promise<StruggleInferenceRow[]>;
  /** s140 episodic-memory reads */
  topicEngagements(
    learnerId: string,
    nodeIds: string[],
  ): Promise<TutorTopicEngagementRow[]>;
  pendingReviews(
    learnerId: string,
    nodeIds: string[],
  ): Promise<ReviewSchedulePendingRow[]>;
}

// ── PreparedAsk (:399-408) ──────────────────────────────────────────────────

interface PreparedAsk {
  knowledge: KnowledgeContext;
  evidence: EvidenceItem[];
  turns: ConversationTurn[];
  query: string;
  identityBoundUnserved: boolean;
  identityLabel: string | null;
  identityParsed: boolean;
  courseRef: string | null;
  unresolvedCourseRef: boolean;
}

export interface KaragDeps {
  sql: SqlFn;
  clock: Clock;
  kgGraph: Parameters<typeof kgRetrieve>[0];
  scopes: CurriculumScopes;
  vectorRetriever: VectorRetriever;
  paperQuestionResolver: PaperQuestionResolver;
  generator: TutorGenerator;
  telemetry: TelemetrySink;
  reranker?: EvidenceReranker;
  learnerModel?: LearnerModelPort;
  maxTopics?: number;
  vectorCandidates?: number;
  evidenceLimit?: number;
}

/**
 * prepare (:417-535) — the retrieval half of the pipeline (steps 0 → 4.5):
 * scope resolution, working-memory query enrichment, KG intent, hybrid
 * retrieval, paper lead pinning, rank fusion, dedup/cap and the fail-open
 * guard. SHARED by the blocking and streaming asks.
 */
export async function prepare(
  deps: KaragDeps,
  learnerId: string | null,
  question: string,
  history: ReadonlyArray<ConversationTurn>,
  courseRef: string | null,
): Promise<PreparedAsk> {
  if (question == null || question.trim().length === 0) {
    throw new ArgumentError("question must not be blank");
  }
  const turns = sanitizeHistory(history);
  const query = question.trim();

  // 0. active curriculum scope (T-C07, fail-closed). V53: a PRESENT courseRef
  // resolves exactly that curriculum — zero or ambiguous matches refuse
  // naming the ref. NO fallback from a failed per-course resolution to the
  // global scope (:428-434).
  const ref = courseRef == null || courseRef.trim().length === 0 ? null : courseRef.trim();
  let unresolvedCourseRef = false;
  let scope: CurriculumScopePort | null = null;
  if (ref != null) {
    scope = await deps.scopes.resolveForCourse(ref);
    if (scope == null) unresolvedCourseRef = true;
  } else {
    scope = await deps.scopes.resolveActive(learnerId);
  }

  // 0.5 working memory (s139)
  const enriched = retrievalQuery(query, turns);

  // 1. deterministic intent + KG context
  const knowledge: KnowledgeContext =
    scope == null
      ? { topics: [], prerequisites: [], misconceptions: [] }
      : await kgRetrieve(deps.kgGraph, enriched, deps.maxTopics ?? TUTOR_MAX_TOPICS, scope);

  // 2. hybrid retrieval: KG evidence + vector evidence
  const kgCandidates = knowledge.topics.map((topic) =>
    evidenceFromNode({
      nodeId: topic.nodeId,
      code: topic.code,
      nodeType: "TOPIC",
      title: topic.title,
      description: null,
      matchScore: topic.matchScore,
    }),
  );
  const vectorCandidatesList: EvidenceItem[] =
    scope == null
      ? []
      : await deps.vectorRetriever(
          enriched,
          deps.vectorCandidates ?? TUTOR_VECTOR_CANDIDATES,
          scope,
        );

  // 2.5 deterministic paper-question lead evidence (:470-483) — pinned at
  // the HEAD of the pool, outside RRF. A complete identity that bound
  // nothing is the fail-open guard's trigger, not a pass-through.
  const resolution: PaperResolution =
    scope == null
      ? { items: [], identityParsed: false, identityLabel: null }
      : await deps.paperQuestionResolver(enriched, scope);
  const pinned = resolution.items;

  // 3. rank fusion (plan §7 per-kind weights — the P3 serving posture)
  const fused = fuseWithPlanWeights([kgCandidates, vectorCandidatesList]);

  // 4. lead-first merge, dedup, rerank + cap (:493-515)
  const reranker = deps.reranker ?? noReranker;
  const reranked = reranker(enriched, fused);
  const seen = new Set<string>();
  const merged: EvidenceItem[] = [];
  for (const item of pinned) {
    if (seen.add(identityKey(item))) merged.push(item);
  }
  for (const item of reranked) {
    if (seen.add(identityKey(item))) merged.push(item);
  }
  let evidence: EvidenceItem[] = merged
    .slice(0, deps.evidenceLimit ?? TUTOR_EVIDENCE_LIMIT)
    .map((item) =>
      item.source === "KNOWLEDGE_NODE"
        ? item
        : { ...item, topicIds: knowledge.topics.map((t) => t.nodeId) },
    );

  // 4.5 fail-open guard (:517-532): the ask named a complete paper-question
  // identity and NOT ONE validated anchor bound it — zero the pool, the
  // deterministic refusal fires with the identity echoed.
  const identityBoundUnserved = resolution.identityParsed && pinned.length === 0;
  if (identityBoundUnserved) evidence = [];

  return {
    knowledge,
    evidence,
    turns,
    query,
    identityBoundUnserved,
    identityLabel: resolution.identityLabel,
    identityParsed: resolution.identityParsed,
    courseRef: ref,
    unresolvedCourseRef,
  };
}

/** Pipeline identity: a chunk by its row, a KG node by its node id (:579-583). */
function identityKey(item: EvidenceItem): string {
  return `${item.source}|${item.chunkId != null ? item.chunkId : "node:" + item.nodeId}`;
}

// ── stream events (TutorStreamEvent.java :30-51) ────────────────────────────

export type TutorStreamEvent =
  | { kind: "citations"; citations: Citation[]; sufficient: boolean }
  | { kind: "meta"; provider: string; model: string | null; refused: boolean; evidenceCount: number }
  | { kind: "delta"; text: string }
  | {
      kind: "completed";
      fullAnswer: string;
      provider: string;
      model: string | null;
      refused: boolean;
      evidenceCount: number;
      latencyMs: number;
      topics: Array<{ code: string; title: string; matchScore: number }>;
    };

function matchedTopicIds(knowledge: KnowledgeContext): string[] {
  return knowledge.topics.map((t) => t.nodeId);
}

function topicMatches(prep: PreparedAsk) {
  return prep.knowledge.topics.map((t) => ({
    code: t.code,
    title: t.title,
    matchScore: t.matchScore,
  }));
}

// ── the ask pipeline (:194-248 blocking, :288-392 streaming) ────────────────

export interface AskResult {
  answer: string;
  citations: Citation[];
  topics: Array<{ code: string; title: string; matchScore: number }>;
  evidenceCount: number;
  model: string | null;
  provider: string;
  refused: boolean;
  latencyMs: number;
}

async function assembleContext(
  deps: KaragDeps,
  prep: PreparedAsk,
  learnerId: string | null,
): Promise<TutorContext> {
  const learnerModel = deps.learnerModel;
  const states: SkillState[] =
    learnerId == null || learnerModel == null ? [] : await learnerModel.skillStates(learnerId);
  const readings: MisconceptionReading[] =
    learnerId == null || learnerModel == null ? [] : await learnerModel.misconceptionReadings(learnerId);
  const inferences: StruggleInferenceRow[] =
    learnerId == null || learnerModel == null
      ? []
      : await learnerModel.activeStruggleInferences(learnerId);
  const nodeIds = prep.knowledge.topics.map((t) => t.nodeId);
  const engagements: TutorTopicEngagementRow[] =
    learnerId == null || learnerModel == null
      ? []
      : await learnerModel.topicEngagements(learnerId, nodeIds);
  const pending: ReviewSchedulePendingRow[] =
    learnerId == null || learnerModel == null
      ? []
      : await learnerModel.pendingReviews(learnerId, nodeIds);
  return assembleTutorContext({
    knowledge: prep.knowledge,
    evidence: prep.evidence,
    learnerId,
    states,
    readings,
    engagements,
    pendingReviews: pending,
    activeInferences: inferences,
    now: deps.clock.now(),
  });
}

/** The blocking ask (:194-248). */
export async function karagAsk(
  deps: KaragDeps,
  learnerId: string | null,
  question: string,
  history: ReadonlyArray<ConversationTurn>,
  sessionId: string | null,
  courseRef: string | null,
): Promise<AskResult> {
  const startedAt = Date.now();
  const prep = await prepare(deps, learnerId, question, history, courseRef);
  const refused = prep.evidence.length === 0;

  let generated: GeneratedAnswer;
  let interventionType: string | null = null;
  if (refused) {
    if (prep.unresolvedCourseRef) {
      generated = {
        answer: courseScopeRefusal(prep.courseRef ?? ""),
        model: null,
        provider: "deterministic-course-refusal",
      };
    } else if (prep.identityBoundUnserved) {
      generated = {
        answer: paperIdentityRefusal(prep.identityLabel ?? "that paper question"),
        model: null,
        provider: "deterministic-paper-refusal",
      };
    } else {
      generated = { answer: TUTOR_REFUSAL, model: null, provider: "deterministic-refusal" };
    }
  } else {
    const context = await assembleContext(deps, prep, learnerId);
    interventionType =
      context.interventionPlan?.type == null ? null : context.interventionPlan.type;
    generated = await deps.generator.generate(prep.query, prep.turns, context);
  }

  const citations = resolveCitations(prep.evidence);
  const latencyMs = (Date.now() - startedAt) / 1000.0;

  // the TutorAnsweredEvent publishes exactly once, on completion, with full
  // parity fields (:228-237); refusals publish eagerly with the deterministic
  // provider identity (:316-319)
  deps.telemetry({
    learnerId,
    query: prep.query,
    matchedTopicIds: matchedTopicIds(prep.knowledge),
    evidenceCount: prep.evidence.length,
    evidenceSources: prep.evidence.map((i) => i.source),
    refused,
    model: generated.model,
    promptIdentity: promptIdentity(),
    latencyMs,
    at: deps.clock.now(),
    interventionType,
    historyTurns: prep.turns.length,
    sessionId,
    provider: generated.provider,
  });

  return {
    answer: generated.answer,
    citations,
    topics: topicMatches(prep),
    evidenceCount: prep.evidence.length,
    model: generated.model,
    provider: generated.provider,
    refused,
    latencyMs,
  };
}

/**
 * The streamed ask (:288-392) — delivered as an async generator of
 * TutorStreamEvents (the Reactor Flux's TS counterpart). The controller
 * layer owns the wire rendering (event: name + data: JSON) and the fixed
 * error event for generation failures (deep-audit M2).
 */
export async function* karagAskStream(
  deps: KaragDeps,
  learnerId: string | null,
  question: string,
  history: ReadonlyArray<ConversationTurn>,
  sessionId: string | null,
  courseRef: string | null,
): AsyncGenerator<TutorStreamEvent> {
  const startedAt = Date.now();
  const prep = await prepare(deps, learnerId, question, history, courseRef);
  const citations = resolveCitations(prep.evidence);
  const topics = topicMatches(prep);
  const refused = prep.evidence.length === 0;
  const evidenceCount = prep.evidence.length;

  if (refused) {
    let text: string;
    let provider: string;
    if (prep.unresolvedCourseRef) {
      text = courseScopeRefusal(prep.courseRef ?? "");
      provider = "deterministic-course-refusal";
    } else if (prep.identityBoundUnserved) {
      text = paperIdentityRefusal(prep.identityLabel ?? "that paper question");
      provider = "deterministic-paper-refusal";
    } else {
      text = TUTOR_REFUSAL;
      provider = "deterministic-refusal";
    }
    const latencyMs = (Date.now() - startedAt) / 1000.0;
    deps.telemetry({
      learnerId,
      query: prep.query,
      matchedTopicIds: matchedTopicIds(prep.knowledge),
      evidenceCount: 0,
      evidenceSources: [],
      refused: true,
      model: null,
      promptIdentity: promptIdentity(),
      latencyMs,
      at: deps.clock.now(),
      interventionType: null,
      historyTurns: prep.turns.length,
      sessionId,
      provider,
    });
    yield { kind: "citations", citations, sufficient: false };
    yield { kind: "meta", provider, model: null, refused: true, evidenceCount: 0 };
    yield { kind: "delta", text };
    yield {
      kind: "completed",
      fullAnswer: text,
      provider,
      model: null,
      refused: true,
      evidenceCount: 0,
      latencyMs,
      topics,
    };
    return;
  }

  const context = await assembleContext(deps, prep, learnerId);
  const interventionType =
    context.interventionPlan?.type == null ? null : context.interventionPlan.type;

  // generation: the first delta carries the Meta event (identity commits
  // with the first token); every delta flows sanitized in order (:340-354)
  let full = "";
  let provider: string | null = null;
  let model: string | null = null;
  let metaSent = false;

  yield { kind: "citations", citations, sufficient: evidenceCount > 0 };

  const deltas = deps.generator.streamGenerate(prep.query, prep.turns, context);
  for await (const delta of deltas) {
    full += delta.answer;
    if (provider == null && delta.provider != null) provider = delta.provider;
    if (model == null && delta.model != null) model = delta.model;
    if (!metaSent) {
      metaSent = true;
      yield {
        kind: "meta",
        provider: delta.provider ?? "unknown",
        model: delta.model,
        refused: false,
        evidenceCount,
      };
    }
    yield { kind: "delta", text: delta.answer };
  }

  if (!metaSent) {
    // L2 (audit 2026-10-02, :361-376): an EMPTY generation is a generation
    // FAILURE — no Meta was ever sent, the research event does not publish,
    // nothing persists. The client sees citations → the fixed error event,
    // never a silently blank done.
    throw new TutorGenerationError();
  }

  const latencyMs = (Date.now() - startedAt) / 1000.0;
  deps.telemetry({
    learnerId,
    query: prep.query,
    matchedTopicIds: matchedTopicIds(prep.knowledge),
    evidenceCount,
    evidenceSources: prep.evidence.map((i) => i.source),
    refused: false,
    model,
    promptIdentity: promptIdentity(),
    latencyMs,
    at: deps.clock.now(),
    interventionType,
    historyTurns: prep.turns.length,
    sessionId,
    provider,
  });
  yield {
    kind: "completed",
    fullAnswer: full,
    provider: provider ?? "unknown",
    model,
    refused: false,
    evidenceCount,
    latencyMs,
    topics,
  };
}

// ── the GroundedTutorGenerator over an injected LLM provider (:117-245) ─────

/** The LlmProvider port (infrastructure/llm) — the injected free-tier chain. */
export interface LlmProvider {
  available(): boolean;
  generate(req: {
    system: string;
    user: string;
    temperature: number;
    maxTokens: number;
  }): Promise<{ text: string; model: string; providerName: string }>;
  stream(req: {
    system: string;
    user: string;
    temperature: number;
    maxTokens: number;
  }): AsyncIterable<{ text: string; model: string; providerName: string }>;
}

export interface GeneratorOptions {
  temperature?: number; // syllabai.tutor.temperature, default 0.2
  maxTokens?: number; // syllabai.tutor.max-tokens, default 900
  nonceRandom?: () => number; // test seam for the fence code
}

/**
 * buildGroundedTutorGenerator (:117-245): the SAME prompt assembly as the
 * frozen v10 (systemPrompt + userPrompt from ./prompt), output hygiene
 * inline (blocking) or incremental via StreamSanitizer (streaming). The
 * chain-unavailable check matches the frozen posture: WARN-shaped throw with
 * the fixed client-safe message.
 */
export function buildGroundedTutorGenerator(
  chain: LlmProvider,
  opts: GeneratorOptions = {},
): TutorGenerator {
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 900;

  const requireAvailable = (): void => {
    if (!chain.available()) {
      // deep-audit 09-28 M2: the message served to the learner stays fixed
      // and client-safe (:133-142)
      throw new TutorGenerationError();
    }
  };

  return {
    async generate(query, history, context) {
      requireAvailable();
      try {
        const nonceValue = nonce(opts.nonceRandom ?? Math.random);
        const response = await chain.generate({
          system: systemPrompt(),
          user: userPrompt(query, history, context, nonceValue),
          temperature,
          maxTokens,
        });
        // H2 output hygiene: out-of-range citation markers and echoed fence
        // markers never reach the learner; stripping is OBSERVED (T-C40 ③b)
        const open = fenceOpen(nonceValue);
        const close = fenceClose(nonceValue);
        const strippedMarkers: number[] = [];
        const sanitized =
          sanitizeAnswer(response.text, context.evidence.length, open, close, (n) =>
            strippedMarkers.push(n),
          ) ?? "";
        return {
          answer: sanitized,
          model: response.model,
          provider: response.providerName,
        };
      } catch (e) {
        if (e instanceof TutorGenerationError) throw e;
        // provider error text is UNTRUSTED third-party content (:175-184) —
        // the served message is the fixed client text
        throw new TutorGenerationError();
      }
    },

    async *streamGenerate(query, history, context) {
      requireAvailable();
      const nonceValue = nonce(opts.nonceRandom ?? Math.random);
      const sanitizer = new StreamSanitizer(
        context.evidence.length,
        fenceOpen(nonceValue),
        fenceClose(nonceValue),
      );
      const request = {
        system: systemPrompt(),
        user: userPrompt(query, history, context, nonceValue),
        temperature,
        maxTokens,
      };
      try {
        for await (const delta of chain.stream(request)) {
          const text = sanitizer.push(delta.text == null ? "" : delta.text);
          if (text.length === 0) continue;
          yield { answer: text, model: delta.model, provider: delta.providerName };
        }
        // tail flush: the sanitizer's held-back remainder goes through the
        // exact blocking sanitizeAnswer; identity fields are null (:226-241)
        const tail = sanitizer.flush();
        if (tail.length > 0) yield { answer: tail, model: null, provider: null };
      } catch (e) {
        if (e instanceof TutorGenerationError) throw e;
        throw new TutorGenerationError();
      }
    },
  };
}

