/**
 * T-MIG-060 tranche 1 — the tutor module factory (frozen law @ 6cad6ef).
 *
 * The composition-root seam for the Wave-6 tutor + sessions band: inject the
 * sql adapter + clock + the retrieval/generation/learner ports; the module
 * exposes the session store (the §22 transcript surface) and the KA-RAG
 * ask/askStream pipeline.
 *
 * SAFETY-CRITICAL PORT RULE: `paperQuestionResolver` has NO default. A
 * silent "notPaperAsk" fallback would disable the fail-open guard (the
 * confident-misattribution class it exists to kill) without anyone deciding
 * to. Tranche-1b lands the full port — services/tutor/paper-question.ts
 * (PaperQuestionResolver.java :92-649 line-against-line) + the Fetch bank
 * seam it rides (fetch-parser.ts + fetch-bank.ts); routes (tranche-2) wire
 * buildPaperQuestionResolver(sql) explicitly.
 *
 * COMPOSITION LAW (the ServableQuestions posture): the curriculum scopes and
 * the vector search COMPOSE the landed content module's ports
 * (services/content/scope.ts + services/content/retrieval.ts) — they are
 * never mirrored here. The learner-model reads are this module's own SQL
 * over the same baseline tables (the per-module structural-seam doctrine;
 * consolidation ruling requested — see context.ts header).
 */
import type { SqlFn } from "./sql";
import type { ConversationTurn } from "./conversation";
import {
  type Clock,
  buildTutorSessionStore,
  type SessionSummaryView,
  type SessionView,
  type AppendRequest,
} from "./session-store";
import {
  type CurriculumScopes,
  type KaragDeps,
  type LearnerModelPort,
  type PaperQuestionResolver,
  type TutorStreamEvent,
  karagAsk,
  karagAskStream,
  noReranker,
} from "./karag";
import { buildSqlKgGraph } from "./kg-retriever";

export {
  // errors + laws
  TUTOR_UNAVAILABLE_MESSAGE,
  NotFoundError,
  ConflictError,
  ArgumentError,
  TutorGenerationError,
} from "./errors";
export {
  // conversation (s139 working memory)
  MAX_HISTORY_TURNS,
  MAX_TURN_CHARS,
  ROLE_USER,
  ROLE_ASSISTANT,
  conversationTurnOf,
  sanitizeHistory,
  stripCitationMarkers,
} from "./conversation";
export {
  // output hygiene (H2 + T-C40 ③b)
  StreamSanitizer,
  sanitizeAnswer,
  streamThrough,
  MAX_PENDING,
  ABS_PENDING,
  MIN_TAIL,
  MARKER_LOOKBACK,
} from "./sanitize";
export {
  // citations (§17)
  resolveCitations,
  type Citation,
} from "./citations";
export {
  // RRF (plan §7)
  fuse,
  fuseWithPlanWeights,
  planWeightOf,
  PLAN_V2_WEIGHTS,
  DEFAULT_RRF_K,
} from "./rrf";
export { retrievalQuery, RETRIEVAL_WINDOW_TURNS, RETRIEVAL_QUERY_MAX_CHARS } from "./retrieval-query";
export {
  // prompt identity + fences + the v10 assembly
  promptIdentity,
  PROMPT_REGISTRY_KEY,
  PROMPT_VERSION,
  TUTOR_REFUSAL,
  paperIdentityRefusal,
  courseScopeRefusal,
  CONVERSATION_REJUDGE_NOTE,
} from "./prompt";
export {
  // context + policy + memory
  selectIntervention,
  memoryDigest,
  assembleTutorContext,
  relaxedToPrior,
  TUTOR_BDT_PAPER_DEFAULTS,
  TUTOR_POLICY_VERSION,
  INTERVENTION_THRESHOLD,
  type KnowledgeContext,
  type MatchedTopic,
  type InterventionPlan,
  type InterventionType,
  type TutorContext,
  type SkillState,
  type MisconceptionReading,
  type StruggleInferenceRow,
} from "./context";
export {
  // KG retriever (T-024 intent matcher)
  kgRetrieve,
  buildSqlKgGraph,
  tokensOf,
  SINGLE_TOKEN_MIN_SPECIFICITY,
  type KgGraphPort,
} from "./kg-retriever";
export {
  // session store (§22)
  buildTutorSessionStore,
  MAX_LISTED_SESSIONS,
  MAX_TITLE_CHARS,
  MAX_SESSIONS_PER_LEARNER,
  MAX_CONTENT_CHARS,
  type SessionView,
  type SessionSummaryView,
  type TurnView,
  type AppendRequest,
  type Clock,
} from "./session-store";
export {
  // the KA-RAG pipeline
  karagAsk,
  karagAskStream,
  prepare,
  buildGroundedTutorGenerator,
  noReranker,
  MIN_COSINE,
  TUTOR_MAX_TOPICS,
  TUTOR_VECTOR_CANDIDATES,
  TUTOR_EVIDENCE_LIMIT,
  type AskResult,
  type TutorStreamEvent,
  type TutorGenerator,
  type GeneratedAnswer,
  type GeneratedDelta,
  type LlmProvider,
  type PaperQuestionResolver,
  type PaperResolution,
  type VectorRetriever,
  type CurriculumScopes,
  type LearnerModelPort,
  type TelemetrySink,
  type KaragDeps,
} from "./karag";
export {
  // the paper-question resolver (tranche-1b — the REQUIRED port)
  buildPaperQuestionResolver,
  completeIdentity,
  identityLabel,
  subjectCode,
  unitCandidates,
  unitFromPaperCode,
  matchQuestion,
  atomMatches,
  contentMarks,
  MAX_QP_ITEMS,
  MAX_CARD_ITEMS,
  MAX_STORE_QP_ITEMS,
  MAX_STORE_MS_ITEMS,
  MAX_MS_ITEMS_SEEKING,
  MAX_STORE_QP_ITEMS_SEEKING,
  MAX_STORE_MS_ITEMS_SEEKING,
  type PaperResolutionResult,
  type ResolverScope,
} from "./paper-question";
export {
  // the Fetch query parser (tranche-1b — the resolver's shared parser)
  parseFetchQuery,
  hasExplicitPaper,
  parsedIsEmpty,
  partAtomOf,
  type ParsedFetchQuery,
} from "./fetch-parser";
export {
  // the Fetch bank seam (tranche-1b — identity/ambiguity law)
  buildTutorFetchBank,
  type BankFetchResult,
  type BankPaperHit,
  type BankQuestionRow,
  type BankScope,
  type TutorFetchPort,
} from "./fetch-bank";
export type { SqlFn } from "./sql";

export interface TutorModule {
  sessionStore: {
    create(learnerId: string): Promise<SessionView>;
    view(learnerId: string, sessionId: string): Promise<SessionView>;
    latest(learnerId: string): Promise<SessionView | null>;
    list(learnerId: string): Promise<SessionSummaryView[]>;
    delete(learnerId: string, sessionId: string): Promise<void>;
    requireOwned(learnerId: string, sessionId: string): Promise<void>;
    requireCourseConsistent(
      learnerId: string,
      sessionId: string,
      courseRef: string | null,
    ): Promise<void>;
    append(learnerId: string, exchange: AppendRequest): Promise<void>;
  };
  ask: (
    learnerId: string | null,
    question: string,
    history: ReadonlyArray<ConversationTurn>,
    sessionId: string | null,
    courseRef: string | null,
  ) => ReturnType<typeof karagAsk>;
  askStream: (
    learnerId: string | null,
    question: string,
    history: ReadonlyArray<ConversationTurn>,
    sessionId: string | null,
    courseRef: string | null,
  ) => AsyncGenerator<TutorStreamEvent>;
}

/**
 * buildTutorModule — the composition root. The KaragDeps ports (kgGraph,
 * scopes, vectorRetriever, paperQuestionResolver, generator, telemetry,
 * learnerModel) are injectable; kgGraph defaults to the sql-backed port
 * (baseline tables). The paperQuestionResolver is REQUIRED (see the header).
 */
export function buildTutorModule(
  sql: SqlFn,
  clock: Clock,
  deps: Omit<KaragDeps, "sql" | "clock" | "kgGraph" | "reranker"> & {
    kgGraph?: KaragDeps["kgGraph"];
    reranker?: KaragDeps["reranker"];
  },
): TutorModule {
  const karag: KaragDeps = {
    sql,
    clock,
    kgGraph: deps.kgGraph ?? buildSqlKgGraph(sql),
    scopes: deps.scopes,
    vectorRetriever: deps.vectorRetriever,
    paperQuestionResolver: deps.paperQuestionResolver,
    generator: deps.generator,
    telemetry: deps.telemetry,
    learnerModel: deps.learnerModel,
    reranker: deps.reranker ?? noReranker,
    maxTopics: deps.maxTopics,
    vectorCandidates: deps.vectorCandidates,
    evidenceLimit: deps.evidenceLimit,
  };
  return {
    sessionStore: buildTutorSessionStore(sql, clock),
    ask: (learnerId, question, history, sessionId, courseRef) =>
      karagAsk(karag, learnerId, question, history, sessionId, courseRef),
    askStream: (learnerId, question, history, sessionId, courseRef) =>
      karagAskStream(karag, learnerId, question, history, sessionId, courseRef),
  };
}
