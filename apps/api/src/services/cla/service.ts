/**
 * The CLA orchestration (T-MIG-069 tranche-2) — frozen source:
 * syllabai-core @ 6cad6ef cla/ClaService.java :1-906, line-against-line.
 *
 * The pipeline, end to end (the class javadoc :35-55, verbatim structure):
 *
 *   ResourceContext (server-resolved, fail-closed)
 *     → bounded read-only tools (fixed composition, traced)
 *     → deterministic topic anchors (the resolved context — never
 *       model-invented)
 *     → hybrid retrieval: anchor KG node + its validated spec structure
 *       (the authoritative prior) + validated chunks
 *     → reciprocal-rank fusion → rerank → evidence cap
 *     → grounding gate → mode-constrained grounded generation (Tutor stack)
 *     → citation resolution (same validation stack as the Tutor)
 *     → interaction event → provenance-bearing telemetry (the 061 posture)
 *
 * Hard boundaries, all inherited unchanged:
 *  - the context anchor is ALWAYS evidence[0]-class prior — a validated
 *    curriculum node resolved server-side, so an anchored ask structurally
 *    cannot fabricate its topic;
 *  - with zero surviving evidence the service refuses deterministically (no
 *    LLM call) — for KG_TOPIC step 1 this is structurally unreachable (the
 *    validated anchor itself is evidence); question-anchored kinds exercise
 *    the refusal path against thin retrieval;
 *  - the learner's measured state personalizes FRAMING only (§2.3) — honest
 *    labels, no internal probabilities disclosed;
 *  - no step of this pipeline writes canonical KG, mastery, misconception
 *    or validation state — the interaction event rides the injected sink
 *    (the composition root wires the 061 no-op posture; zero tables,
 *    ADR-031 intact).
 *
 * RUNTIME STEP (disclosed): the four dependency-served kinds dispatch
 * (KG_TOPIC, SPECIFICATION_POINT, PAST_PAPER_QUESTION, QUESTION_PART); the
 * NOTE_SECTION lead-evidence branch (:746-790 noteSectionEvidence +
 * noteEvidenceLimit) DEFERS with its resolver branch (the 053 t3/t4 gate —
 * the constants NOTE_CHUNK_LIMIT / NOTE_CONTEXT_EVIDENCE_LIMIT /
 * NOTE_DOCUMENT_FILE_PREFIX defer with it); the frozen lessonAction /
 * noteTitle brief branches port verbatim but are unreachable in this
 * runtime (their context fields are null on the served kinds — the
 * deferral law, never silent).
 *
 * DORMANT SEAM (the tutor posture, the claim card's law of record): the
 * generator is the tutor's injected seam — the composition root wires the
 * dormant provider, so generation-reaching asks serve the honest 503
 * tutor_unavailable (TutorGenerationError) while every deterministic law
 * (resolution, gates, tools, refusal honesty, citation plumbing) stays
 * LIVE. Deterministic refusals NEVER 503.
 */
import {
  evidenceFromNode,
  type EvidenceItem,
} from "../tutor/evidence";
import { fuseWithPlanWeights } from "../tutor/rrf";
import { noReranker, type EvidenceReranker } from "../tutor/karag";
import { resolveCitations } from "../tutor/citations";
import {
  selectIntervention,
  type InterventionPlan,
  type TutorContext,
  type KnowledgeContext,
  type MatchedTopic,
  type MisconceptionSignal,
  type PrerequisiteLink,
} from "../tutor/context";
import type {
  GeneratedAnswer,
  TutorGenerator,
  VectorRetriever,
} from "../tutor/karag";
import { ArgumentError, TutorGenerationError } from "../tutor/errors";
import type { LearnerModelPort } from "../tutor";
import { knowledgeTree, type NodeView } from "../knowledge";
import { mapSubjectJoinedRow } from "../curriculum/subjects";
import { QuestionFamilyAssembler, QuestionTaxonomy, ServableQuestions } from "../questions";
import type { SqlFn } from "../assessment/sql";
import type { SubmitClock } from "../selfmark";
import { promptIdentity } from "../tutor/prompt";
import { BadRequestException, NotFoundException } from "../identity/errors";
import {
  checkModeAdmission,
  evidenceEligible,
  schemePointEvidenceAllowed,
  type ClaResponseMode,
} from "./leakage-policy";
import {
  enabledFor,
  learnerState,
  learnerStateScope,
  relatedConcepts,
  specificationContext,
  toolTrace,
  type ClaToolRegistryDeps,
  type ClaToolTrace,
} from "./tool-registry";
import {
  isQuestionContext,
  isQuestionPartContext,
  type ClaContextKind,
  type ClaResourceContext,
} from "./context";
import type { ClaContextResolver } from "./context-resolver";
import type { ClaMode } from "@syllabai/contracts";

/** the deterministic refusal (ClaService REFUSAL :84-89 — the Java text
 *  block's embedded newlines are part of the frozen wire string). */
export const CLA_REFUSAL =
  "I can't explain that from the validated course material anchored to this\n" +
  "topic yet — there is no matching source content to ground an answer, and\n" +
  "SyllabAI never guesses. Try rephrasing within the topic, or ask your\n" +
  "teacher to ingest the relevant material.";

/**
 * How many of the resolved topic's DIRECT VALIDATED subtopic learning
 * outcomes may join the deterministic evidence (:91-99): a bare topic title
 * is honest but not teachable — the specification structure beneath the
 * topic is curriculum truth. Bounded so the evidence cap still leaves room
 * for validated chunks.
 */
export const SPEC_STRUCTURE_LIMIT = 4;

/** per-part prompt bound inside the whole-question parts evidence (:104-106) */
export const PART_PROMPT_BOUND = 1200;

/** the frozen @Value defaults (:193-194) */
export const CLA_VECTOR_CANDIDATES = 12;
export const CLA_EVIDENCE_LIMIT = 6;

/** ClaInteractionEvent (:422-438 + shared/events/ClaInteractionEvent) — the
 *  provenance-bearing interaction record. The sink is the injected 061
 *  posture: the composition root wires the no-op (zero tables, ADR-031);
 *  the event SHAPE is the gated deterministic surface. */
export interface ClaInteractionEvent {
  learnerId: string;
  question: string;
  topicNodeIds: string[];
  evidenceCount: number;
  evidenceSources: string[];
  refused: boolean;
  model: string | null;
  promptIdentity: string;
  latencyMs: number;
  interventionType: string | null;
  mode: string;
  kind: string;
  reference: string;
  toolInvocations: ClaToolTrace[];
}

export type ClaTelemetrySink = (event: ClaInteractionEvent) => void;

export interface ClaServiceDeps {
  sql: SqlFn;
  clock: SubmitClock;
  resolver: ClaContextResolver;
  registryDeps: ClaToolRegistryDeps;
  learnerModel: Pick<
    LearnerModelPort,
    "skillStates" | "misconceptionReadings" | "activeStruggleInferences"
  >;
  vectorRetriever: VectorRetriever;
  generator: TutorGenerator;
  telemetry: ClaTelemetrySink;
  reranker?: EvidenceReranker;
  vectorCandidates?: number;
  evidenceLimit?: number;
}

export interface ClaAskInput {
  learnerId: string;
  kind: ClaContextKind;
  rootId: string | null;
  topicNodeId: string | null;
  questionId: string | null;
  partId: string | null;
  specCode: string | null;
  noteId: string | null;
  mode: ClaMode;
  question: string;
}

/** the resolved view assembly — the frozen ClaAnswerView.of projection. */
export interface ClaAnswerViewValue {
  answer: string;
  citations: ReturnType<typeof resolveCitations>;
  context: {
    kind: ClaContextKind;
    reference: string;
    topicNodeId: string;
    rootId: string;
    subjectCode: string;
    topicCode: string;
    topicTitle: string;
    curriculumVersion: string;
    curriculumBoard: string;
    curriculumQualification: string;
    validationState: string;
    mode: ClaMode;
    questionStem: string | null;
    questionCommandWord: string | null;
    questionMarks: number;
    paperCode: string | null;
    attempted: boolean | null;
    partLabel: string | null;
    lessonAction: ClaResourceContext["lessonAction"];
    noteId: string | null;
    noteTitle: string | null;
  };
  topics: Array<{ code: string; title: string; matchScore: number }>;
  evidenceCount: number;
  model: string | null;
  provider: string;
  refused: boolean;
  latencyMs: number;
  tools: ClaToolTrace[];
}

/** attempt row for the learner-work evidence (the repo read shape). */
interface AttemptRow {
  id: string;
}

/** answer row (the repo read shape). */
interface AnswerRow {
  question_part_id: string;
  answer_text: string | null;
}

/** part row (the parts-evidence read shape). */
interface PartRow {
  id: string;
  label: string;
  prompt: string | null;
  command_word: string | null;
  marks: number;
}

/** mark scheme + points (the repo read shapes). */
interface MarkSchemeRow {
  id: string;
  validation_state: string;
}

interface MarkPointRow {
  ref: string | null;
  marks: number;
  text: string;
  question_part_id: string | null;
  ordering: number;
}

export function buildClaService(deps: ClaServiceDeps) {
  const { sql, clock, resolver, registryDeps, learnerModel } = deps;
  const vectorCandidates = Math.max(1, deps.vectorCandidates ?? CLA_VECTOR_CANDIDATES);
  const evidenceLimit = Math.max(1, deps.evidenceLimit ?? CLA_EVIDENCE_LIMIT);
  const reranker = deps.reranker ?? noReranker;
  const taxonomy = new QuestionTaxonomy(
    sql,
    new ServableQuestions(sql),
    new QuestionFamilyAssembler(),
  );

  const nodeDescriptionRead = async (nodeId: string): Promise<string | null> => {
    const rows = (await sql`
      select description from knowledge_nodes where id = ${nodeId}::uuid`) as unknown as Array<{
      description: string | null;
    }>;
    return rows[0]?.description ?? null;
  };

  /** questionParts.findQuestionIdByPartId — the scalar projection through
   *  the canonical FKs (part → version → question). */
  const questionIdByPartId = async (partId: string): Promise<string | null> => {
    const rows = (await sql`
      select v.question_id from question_parts p
      join question_versions v on v.id = p.question_version_id
      where p.id = ${partId}`) as unknown as Array<{ question_id: string }>;
    return rows[0]?.question_id ?? null;
  };

  /** attempts.findFirstByLearnerIdAndQuestionIdOrderByCreatedAtDesc */
  const latestAttempt = async (learnerId: string, questionId: string): Promise<AttemptRow | null> => {
    const rows = (await sql`
      select id from attempts
      where learner_id = ${learnerId} and question_id = ${questionId}
      order by created_at desc
      limit 1`) as unknown as AttemptRow[];
    return rows[0] ?? null;
  };

  /** answers.findByAttemptIdOrderByQuestionPartId */
  const answersByAttempt = async (attemptId: string): Promise<AnswerRow[]> => {
    const rows = (await sql`
      select question_part_id, answer_text from answers
      where attempt_id = ${attemptId}
      order by question_part_id`) as unknown as AnswerRow[];
    return rows;
  };

  /** questionParts.findByQuestionVersionIdOrderByOrdering */
  const partsByVersion = async (versionId: string): Promise<PartRow[]> => {
    const rows = (await sql`
      select p.id, p.label, p.prompt, p.command_word, p.marks
      from question_parts p
      where p.question_version_id = ${versionId}
      order by p.ordering`) as unknown as PartRow[];
    return rows;
  };

  /** markSchemes.findFirstByQuestionVersionIdOrderByCreatedAtDesc */
  const latestMarkScheme = async (versionId: string): Promise<MarkSchemeRow | null> => {
    const rows = (await sql`
      select id, validation_state from mark_schemes
      where question_version_id = ${versionId}
      order by created_at desc
      limit 1`) as unknown as MarkSchemeRow[];
    return rows[0] ?? null;
  };

  const pointsByScheme = async (schemeId: string): Promise<MarkPointRow[]> => {
    const rows = (await sql`
      select ref, marks, text, question_part_id, ordering from mark_points
      where mark_scheme_id = ${schemeId}
      order by ordering`) as unknown as MarkPointRow[];
    return rows;
  };

  /** the current-version read for the parts/scheme evidence (the frozen
   *  QuestionVersionRepository.findByQuestionIdOrderByVersionDesc call —
   *  the SAME read the resolver's spine makes; the service's own copy is
   *  the frozen topology's second consumer). */
  const currentVersion = async (
    questionId: string,
  ): Promise<{ id: string } | null> => {
    const rows = (await sql`
      select v.id from question_versions v
      where v.question_id = ${questionId}
      order by v.version desc
      limit 1`) as unknown as Array<{ id: string }>;
    return rows[0] ?? null;
  };

  /** a manual deterministic evidence item (the frozen EvidenceItem
   *  constructor :682-686/:711-713/:748-752/:820-825 — id-anchored, no
   *  chunk/node provenance, matchScore 1.0, rerank 0.0). */
  const leadItem = (
    source: EvidenceItem["source"],
    content: string,
    topicNodeId: string,
  ): EvidenceItem => ({
    source,
    content,
    documentRowId: null,
    documentId: null,
    documentVersion: null,
    chunkId: null,
    chunkIndex: null,
    nodeId: null,
    nodeCode: null,
    nodeType: null,
    nodeTitle: null,
    pageStart: null,
    pageEnd: null,
    elementIds: [],
    topicIds: [topicNodeId],
    retrievalScore: 1.0,
    fusedScore: 0.0,
    rerankScore: null,
  });

  /** findNode (:657-671) — the depth-first tree walk. */
  const findNode = (node: NodeView | null, id: string): NodeView | null => {
    if (node === null) return null;
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const found = findNode(child, id);
      if (found !== null) return found;
    }
    return null;
  };

  /**
   * The curriculum scope of a resolved CLA context (:610-622 scopeOf, the
   * T-C07 house rule): curriculum identity comes from the OWNING SUBJECT of
   * the anchored resource, so the scope derives from that subject's version
   * + subject-root subtree — never from the global single-owner resolution
   * the free-text tutor uses. A resolved context whose subject root cannot
   * be re-resolved is a server defect and fails closed (the resolver's own
   * NotFound shape).
   */
  const scopeOf = async (context: ClaResourceContext) => {
    const rows = (await sql`
      select s.id, s.curriculum_version_id, s.code, s.name, s.knowledge_node_id, s.created_at,
             v.id as v_id, v.board, v.qualification, v.code as v_code, v.title as v_title,
             v.status as v_status, v.created_at as v_created_at
      from subjects s
      join curriculum_versions v on v.id = s.curriculum_version_id
      where s.knowledge_node_id = ${context.rootId}`) as unknown as Array<
      Record<string, unknown>
    >;
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException("curriculum subject root", context.rootId);
    }
    const subject = mapSubjectJoinedRow(row);
    const surface = await taxonomy.subtreeIds(context.rootId);
    return {
      curriculumVersionId: subject.version.id,
      code: subject.version.code,
      surface: new Set<string>(surface),
    };
  };

  /**
   * Deterministic specification-structure evidence (:631-655, contract §5:
   * the context is the authoritative prior): the resolved topic's DIRECT
   * VALIDATED subtopic learning outcomes, code-ordered, bounded. Curriculum
   * truth resolved from the same subject tree the context was resolved
   * from — no retrieval, no model input, provenance-bearing. SUGGESTED/
   * UNVALIDATED nodes are invisible here exactly as they are to context
   * resolution (§1.2 gate parity).
   */
  const specStructureEvidence = async (
    context: ClaResourceContext,
    subjectTree: NodeView,
  ): Promise<EvidenceItem[]> => {
    const topic = findNode(subjectTree, context.topicNodeId);
    if (topic === null || topic.children === null || topic.children.length === 0) {
      return [];
    }
    const description = await nodeDescriptionRead(context.topicNodeId);
    void description; // the ANCHOR item carries the description (frozen :374);
    // the spec-structure children carry their own (below)
    return topic.children
      .filter((c) => c.type === "SUBTOPIC")
      .filter((c) => c.validationStatus === "VALIDATED")
      .sort((a, b) => {
        // Comparator.comparing(NodeView::code, nullsLast(naturalOrder)) :644-646
        if (a.code === b.code) return 0;
        if (a.code === null) return 1;
        if (b.code === null) return -1;
        return a.code < b.code ? -1 : 1;
      })
      .slice(0, SPEC_STRUCTURE_LIMIT)
      .map((c) => ({
        // EvidenceItem.fromNode(...) + withTopicIds(RESOLVED anchor) —
        // attribution stays on the resolved topic: the learner asked about
        // the topic, not each subtopic (LIM attribution, telemetry, NBA)
        ...evidenceFromNode({
          nodeId: c.id,
          code: c.code,
          nodeType: c.type,
          title: c.title,
          description: c.description,
          matchScore: 0.9,
        }),
        topicIds: [context.topicNodeId],
      }));
  };

  /** part-scoped learner-work selection (:683-688): a part context sees
   *  only ITS answer. */
  const partAllowsAnswer = (context: ClaResourceContext, answer: AnswerRow): boolean => {
    if (!isQuestionPartContext(context)) return true;
    return context.reference === answer.question_part_id;
  };

  /** answerPartLabel (:690-696) — proxy-safe part label for the work line. */
  const answerPartLabel = async (partId: string): Promise<string> => {
    const rows = (await sql`
      select label from question_parts where id = ${partId}`) as unknown as Array<{
      label: string;
    }>;
    return rows[0]?.label ?? "?";
  };

  /**
   * §7.3 CHECK feedback input (:677-681 learnerWorkEvidence): the learner's
   * OWN submitted answers from their most recent attempt on the anchored
   * question. Part-level contexts receive ONLY the anchored part's answer.
   * Resolved by ids, never model-selected; null when no attempt answers
   * exist. Same admission gate as the scheme points.
   */
  const learnerWorkEvidence = async (
    context: ClaResourceContext,
  ): Promise<EvidenceItem | null> => {
    const questionId = isQuestionPartContext(context)
      ? await questionIdByPartId(context.reference)
      : context.reference;
    if (questionId === null) return null;
    const attempt = await latestAttempt(context.learnerId, questionId);
    if (attempt === null) return null;
    const answers = await answersByAttempt(attempt.id);
    const lines: string[] = [];
    for (const a of answers) {
      if (!partAllowsAnswer(context, a)) continue;
      const label = await answerPartLabel(a.question_part_id);
      lines.push(`your submitted answer for part (${label}): ${a.answer_text ?? ""}`);
    }
    const content = lines.join("\n");
    if (content.length === 0) return null;
    return leadItem(
      "LEARNER_WORK",
      "The learner's submitted work (most recent attempt): " + content,
      context.topicNodeId,
    );
  };

  /**
   * The anchored question's own stem as lead evidence (:699-714, §2.1: the
   * learner is already looking at it — presenting it back is not a leak; it
   * is the anchor). Part-level contexts anchor the PART prompt (explicitly
   * labeled). Provenance: the served stem/prompt of the VALIDATED current
   * version.
   */
  const questionStemEvidence = (context: ClaResourceContext): EvidenceItem => {
    const command = context.questionCommandWord === null ? "" : context.questionCommandWord + " — ";
    const anchored =
      context.partLabel !== null
        ? `Part (${context.partLabel}) (${context.questionMarks} marks) ${command}${context.questionStem}`
        : `Question (${context.questionMarks} marks) ${command}${context.questionStem}`;
    return leadItem("QUESTION_PAPER", anchored, context.topicNodeId);
  };

  /** generation-budget bound for one part prompt (:754-760). */
  const boundPartPrompt = (prompt: string | null): string => {
    if (prompt === null) return "";
    return prompt.length <= PART_PROMPT_BOUND ? prompt : prompt.slice(0, PART_PROMPT_BOUND) + " …";
  };

  /**
   * Whole-question lead evidence (:716-753, s129): the anchored question's
   * OWN part prompts, joined in serving order. The SME corpus carries most
   * structured questions' text in the parts — so a whole-question anchor
   * that served only the stem would ground the model on a question it
   * cannot read. Id-anchored through the canonical FK chain, never
   * retrieval; no mark-scheme material rides along. Part-level contexts do
   * NOT get this item (they carry their own prompt in the stem slot).
   */
  const questionPartsEvidence = async (
    context: ClaResourceContext,
  ): Promise<EvidenceItem | null> => {
    const version = await currentVersion(context.reference);
    if (version === null) return null;
    const parts = await partsByVersion(version.id);
    if (parts.length === 0) return null;
    const joined = parts
      .map(
        (p) =>
          `(${p.label}) (${p.marks}${p.marks === 1 ? " mark)" : " marks)"}` +
          `${p.command_word !== null ? " " + p.command_word + ":" : ""}` +
          ` ${boundPartPrompt(p.prompt)}`,
      )
      .join("\n");
    return leadItem("QUESTION_PAPER", "Question parts:\n" + joined, context.topicNodeId);
  };

  /** part-appropriate marking-evidence selection (:831-838, §7.3): a part
   *  context admits points targeting THAT part plus question-level points
   *  (part null); question-level contexts admit all points. */
  const partAllowsPoint = (context: ClaResourceContext, point: MarkPointRow): boolean => {
    if (!isQuestionPartContext(context)) return true;
    return point.question_part_id === null || context.reference === point.question_part_id;
  };

  /**
   * §7.3 post-attempt feedback evidence (:786-829): the question's OWN
   * VALIDATED mark-scheme points from the assessment model (question-
   * granular, resolved by ids) — NOT page-level document chunks. Null when
   * no VALIDATED scheme exists (honest — feedback then grounds on spec
   * context alone). Part-level contexts receive the PART-APPROPRIATE
   * subset.
   */
  const schemePointEvidence = async (
    context: ClaResourceContext,
  ): Promise<EvidenceItem | null> => {
    const questionId = isQuestionPartContext(context)
      ? await questionIdByPartId(context.reference)
      : context.reference;
    if (questionId === null) return null;
    const version = await currentVersion(questionId);
    if (version === null) return null;
    const scheme = await latestMarkScheme(version.id);
    if (scheme === null || scheme.validation_state !== "VALIDATED") return null;
    const points = (await pointsByScheme(scheme.id))
      .filter((p) => partAllowsPoint(context, p))
      .sort((a, b) => a.ordering - b.ordering);
    const content = points.map((p) => `${p.ref} (${p.marks}): ${p.text}`).join("; ");
    if (content.length === 0) return null;
    return leadItem("MARK_SCHEME", "Mark scheme points: " + content, context.topicNodeId);
  };

  /** deterministic mode constraint (:459-536 modePlan — the mode rewrites
   *  the plan; the anchored-label builder keeps every frozen branch even
   *  where the served kinds make them unreachable). */
  const modePlan = (
    mode: ClaResponseMode,
    context: ClaResourceContext,
    policyPlan: InterventionPlan,
  ): InterventionPlan => {
    const anchored =
      context.partLabel !== null
        ? `anchored question part (${context.partLabel}) on topic ${context.topicCode}`
        : isQuestionContext(context)
          ? `anchored question on topic ${context.topicCode}`
          : context.noteTitle !== null
            ? `anchored revision note '${context.noteTitle}' on topic ${context.topicCode}`
            : context.kind === "SMART_LESSON"
              ? `anchored Smart Lesson on topic ${context.topicCode}`
              : `anchored topic ${context.topicCode}`;
    switch (mode) {
      case "EXPLAIN":
        return isQuestionContext(context)
          ? // question contexts: DECODE the question, never answer it — the
            // exam-questions "Understand" quick action (s129)
            {
              type: policyPlan.type,
              rationale: `CLA EXPLAIN mode on the ${anchored} — question decoding (decode-only: what is being asked, never the answer)`,
              actions: [
                "Decode what the anchored question and each of its parts (as served in the SOURCES) is asking: the command word, the marks and what the examiner wants, part by part.",
                "Never state, narrow or rule out the expected answer — no candidate answers, no eliminations, no 'not just X' steering (the same discipline as HINT, pre- and post-attempt).",
                "Stay within the anchored topic and its prerequisites.",
                "Use the learner brief to choose framing; never reveal internal probabilities, model names or diagnostic rules.",
              ],
            }
          : {
              type: policyPlan.type,
              rationale: `CLA EXPLAIN mode on the ${anchored} — ${policyPlan.rationale}`,
              actions: [
                "Teach the anchored concept from the numbered SOURCES, citing [n] where used.",
                "Stay within the anchored topic and its prerequisites.",
                "Use the learner brief to choose framing; never reveal internal probabilities, model names or diagnostic rules.",
              ],
            };
      case "SUMMARIZE":
        return {
          type: policyPlan.type,
          rationale: `CLA SUMMARIZE mode on the ${anchored} — ${policyPlan.rationale}`,
          actions: [
            "Summarize the anchored topic from the numbered SOURCES only.",
            "Cover the WHOLE anchored specification structure: every provided specification statement appears in the summary — never compress only the first source.",
            "One concise clause per specification statement — compress, do not expand (large topics must stay inside the generation budget).",
            "Preserve the spec anchors (topic code and source citations for every statement group you cover).",
            "Do not add material that is not present in the SOURCES.",
          ],
        };
      case "HINT":
        return {
          type: policyPlan.type,
          rationale: `CLA HINT mode on the ${anchored} — scaffolding only (answer-leakage gate: no final answers, no mark-scheme points)`,
          actions: [
            "Scaffold the learner's OWN next step: questions, cues and worked analogies from the SOURCES.",
            "Never state the final answer; never enumerate mark-scheme points.",
            "Stay within the anchored topic and its prerequisites.",
          ],
        };
      case "CHECK":
        return {
          type: policyPlan.type,
          rationale: `CLA CHECK mode post-attempt on the ${anchored} — full feedback unlocked by the attempt-state gate`,
          actions: [
            "Review the learner's submitted answers (in the SOURCES as the learner-work entries) against the numbered SOURCES.",
            "Walk through the mark-scheme points where they apply, citing [n].",
            "Be specific about what earned marks and what did not, without revealing internal probabilities or diagnostic rules.",
          ],
        };
    }
  };

  /** honest learner brief (:538-565 learnerBrief) from the GET_LEARNER_STATE
   *  tool result (§2.3) — the SMART_LESSON line branches port verbatim and
   *  stay unreachable on the served kinds (lessonAction null). */
  const learnerBrief = (
    state: { skills: Array<{ nodeId: string; mastery: number }>; misconceptions: Array<{ effective: number }> },
    context: ClaResourceContext,
  ): string => {
    const none = `Learner state: no prior measured evidence on ${context.topicCode}.`;
    const lessonLine: string | null = null; // SMART_LESSON defers (the frozen lessonActionBrief :567-586 — unreachable on the served kinds)
    if (state.skills.length === 0 && state.misconceptions.length === 0) {
      return lessonLine === null ? none : `${none}\n${lessonLine}`;
    }
    let sb = "Learner state for the anchored topic:\n";
    const own = state.skills.find((s) => s.nodeId === context.reference);
    if (own !== undefined) {
      sb += `- measured mastery of '${context.topicTitle}': ${own.mastery.toFixed(2)}\n`;
    }
    for (const r of state.misconceptions) {
      if (r.effective >= 0.5) {
        sb += "- active misconception flagged on this topic (instructional strategy selected from evidence)\n";
      }
    }
    if (!sb.includes("- ")) {
      return lessonLine === null ? none : `${none}\n${lessonLine}`;
    }
    if (lessonLine !== null) {
      sb += lessonLine;
    }
    return sb.trim();
  };

  /** knowledge brief (:584-608 knowledgeBrief): spec chain + prerequisites
   *  + misconceptions. */
  const knowledgeBrief = (
    specChain: Array<{ code: string; title: string; type: string }>,
    knowledge: KnowledgeContext,
  ): string => {
    let sb = "Curriculum context:\n";
    for (const t of knowledge.topics) {
      sb += `- anchored topic ${t.code}: ${t.title}\n`;
    }
    if (specChain.length > 1) {
      sb += "Specification chain of the anchored topic:\n";
      for (const a of specChain.slice(0, specChain.length - 1)) {
        sb += `- ${a.code}: ${a.title} (${a.type})\n`;
      }
    }
    if (knowledge.prerequisites.length > 0) {
      sb += "Prerequisites of the anchored topic:\n";
      for (const p of knowledge.prerequisites.slice(0, 8)) {
        sb += `- ${p.title} (${p.depth}${p.depth === 1 ? " hop" : " hops deep"})\n`;
      }
    }
    if (knowledge.misconceptions.length > 0) {
      sb += "Known misconceptions attached to this topic:\n";
      for (const m of knowledge.misconceptions.slice(0, 6)) {
        sb += `- ${m.title}\n`;
      }
    }
    return sb.trim();
  };

  return {
    /** the constants + pieces the route layer and pins consume. */
    constants: { SPEC_STRUCTURE_LIMIT, PART_PROMPT_BOUND, vectorCandidates, evidenceLimit },

    /**
     * contextualAsk (:220-455) — the deterministic pipeline end to end.
     */
    async contextualAsk(input: ClaAskInput): Promise<ClaAnswerViewValue> {
      const { learnerId, kind, mode } = input;
      const question = input.question;
      if (learnerId === null || learnerId === undefined) {
        throw new ArgumentError("learnerId is required on the CLA surface");
      }
      if (question === null || question === undefined || question.trim().length === 0) {
        throw new ArgumentError("question must not be blank");
      }
      const startedAt = Date.now();
      const toolTraces: ClaToolTrace[] = [];
      const trace = <T>(
        execution: () => Promise<{ tool: string; args: string; value: T }>,
      ): Promise<T> =>
        (async () => {
          const start = Date.now();
          const result = await execution();
          const latencyMs = Date.now() - start;
          toolTraces.push(toolTrace(result.tool as never, result.args, result.value, latencyMs));
          return result.value;
        })();

      // 1. server-side context resolution — fail-closed (contract §1, §5);
      //    the per-kind required-reference laws are the frozen dispatch
      //    (:234-278) verbatim; the deferred kinds are refused here with the
      //    frozen closed-enum 400 (the runtime-step law)
      let context: ClaResourceContext;
      switch (kind) {
        case "KG_TOPIC": {
          if (input.rootId === null || input.topicNodeId === null) {
            throw new BadRequestException("KG_TOPIC context requires rootId and topicNodeId");
          }
          context = await resolver.resolveKgTopic(input.rootId, input.topicNodeId, learnerId);
          break;
        }
        case "SPECIFICATION_POINT": {
          if (input.rootId === null) {
            throw new BadRequestException("SPECIFICATION_POINT context requires rootId");
          }
          context = await resolver.resolveSpecificationPoint(
            input.rootId,
            input.specCode,
            learnerId,
          );
          break;
        }
        case "PAST_PAPER_QUESTION": {
          if (input.questionId === null) {
            throw new BadRequestException("PAST_PAPER_QUESTION context requires questionId");
          }
          context = await resolver.resolvePastPaperQuestion(input.questionId, learnerId);
          break;
        }
        case "QUESTION_PART": {
          if (input.partId === null) {
            throw new BadRequestException("QUESTION_PART context requires partId");
          }
          context = await resolver.resolveQuestionPart(input.partId, input.rootId, learnerId);
          break;
        }
        default:
          // SMART_LESSON / NOTE_SECTION (and any undeclared value) — the
          // frozen default branch :279-281
          throw new BadRequestException(
            "context kind not supported by this runtime step: " + String(kind),
          );
      }
      // the registry, not the caller, decides which tools may run (§4.1);
      // the leakage gate (§7.4) runs BEFORE any retrieval or generation
      enabledFor(context.kind, mode);
      checkModeAdmission(context, mode);

      // 2. bounded read-only tools, fixed composition (§4) — each timed
      const subjectTree = await knowledgeTree({ sql, clock }, context.rootId, false);
      const specContext = await trace(() =>
        Promise.resolve(specificationContext(context, subjectTree)),
      );
      const related = await trace(() => relatedConcepts(registryDeps, context));

      // 3. deterministic anchors: the resolved context is the ONLY topic
      //    match (:281-303)
      const anchors: MatchedTopic[] = [
        {
          nodeId: context.topicNodeId,
          code: context.topicCode,
          title: context.topicTitle,
          matchScore: 1.0,
        },
      ];
      const prerequisiteLinks: PrerequisiteLink[] = related.prerequisites.map((p) => ({
        forTopicId: context.reference,
        nodeId: p.id,
        title: p.title,
        depth: p.depth,
      }));
      const misconceptionSignals: MisconceptionSignal[] = related.misconceptions.map((m) => ({
        forTopicId: context.reference,
        nodeId: m.nodeId,
        title: m.title,
      }));
      const knowledge: KnowledgeContext = {
        topics: anchors,
        prerequisites: prerequisiteLinks,
        misconceptions: misconceptionSignals,
      };

      // 4. hybrid evidence (:305-336): the anchor as authoritative prior,
      //    joined by the topic's own validated specification structure +
      //    validated chunks
      const kgCandidates: EvidenceItem[] = [];
      for (const topic of anchors) {
        kgCandidates.push({
          ...evidenceFromNode({
            nodeId: topic.nodeId,
            code: topic.code,
            nodeType: "TOPIC",
            title: topic.title,
            description: await nodeDescriptionRead(context.topicNodeId),
            matchScore: topic.matchScore,
          }),
        });
      }
      kgCandidates.push(...(await specStructureEvidence(context, subjectTree)));
      const vectorList = await deps.vectorRetriever(question, vectorCandidates, await scopeOf(context));
      const fused = fuseWithPlanWeights([kgCandidates, vectorList]);
      // rerank → cap → attribution → the §7.4 deterministic evidence filter
      // (:337-343 — applied post-fusion, pre-gate)
      const reranked = reranker(question, fused);
      let evidence: EvidenceItem[] = reranked
        .slice(0, evidenceLimit)
        .map((item) =>
          item.source === "KNOWLEDGE_NODE" ? item : { ...item, topicIds: [context.topicNodeId] },
        )
        .filter((item) => evidenceEligible(context, mode, item));

      // question contexts lead with FIXED deterministic evidence outside the
      // fusion pool (:339-377): [stem] [+ whole-question parts prompts]
      // [+ the learner's OWN submitted answers] [+ VALIDATED scheme points]
      // — then the bounded cap applies to the whole list
      if (isQuestionContext(context)) {
        const lead: EvidenceItem[] = [questionStemEvidence(context)];
        if (!isQuestionPartContext(context)) {
          const partsEvidence = await questionPartsEvidence(context);
          if (partsEvidence !== null) lead.push(partsEvidence);
        }
        if (schemePointEvidenceAllowed(context, mode)) {
          const workEvidence = await learnerWorkEvidence(context);
          if (workEvidence !== null) lead.push(workEvidence);
          const schemeEvidence = await schemePointEvidence(context);
          if (schemeEvidence !== null) lead.push(schemeEvidence);
        }
        lead.push(...evidence);
        evidence = lead.slice(0, Math.min(lead.length, evidenceLimit));
      }

      // 5. grounding gate → mode-constrained grounded generation (:379-416).
      //    The dormant seam: a non-refused ask REACHES the generator — the
      //    injected provider is unavailable, the TutorGenerationError maps
      //    to the honest 503 at the route; deterministic refusals NEVER 503.
      let generated: GeneratedAnswer;
      let refused = false;
      let interventionType: string | null = null;
      if (evidence.length === 0) {
        refused = true;
        generated = { answer: CLA_REFUSAL, model: null, provider: "deterministic-refusal" };
      } else {
        const scope = learnerStateScope(context.topicNodeId, related.prerequisites);
        const ownState = await trace(() => learnerState(registryDeps, learnerId, scope));
        // the policy consumes the FULL reading list propagated by the caller
        // (the M3 tranche-2 posture — the GET_LEARNER_STATE view answers a
        // different question than the policy's own reads)
        const [readings, activeInferences] = await Promise.all([
          learnerModel.misconceptionReadings(learnerId),
          learnerModel.activeStruggleInferences(learnerId),
        ]);
        const policyPlan = selectIntervention(
          learnerId,
          knowledge.topics,
          knowledge.misconceptions,
          readings,
          activeInferences,
        );
        const plan = modePlan(mode, context, policyPlan);
        interventionType = plan.type;
        const tutorContext: TutorContext = {
          learnerBrief: learnerBrief(ownState, context),
          memoryBrief: null,
          knowledgeBrief: knowledgeBrief(specContext, knowledge),
          evidence,
          interventionPlan: plan,
        };
        generated = await deps.generator.generate(question.trim(), [], tutorContext);
      }

      // 6. citations — the SAME resolution/validation stack as the Tutor
      const citations = resolveCitations(evidence);
      const latencyMs = Date.now() - startedAt;

      // 7. interaction evidence (contract §6): deterministic anchors +
      //    provenance — the injected sink (the 061 no-op posture)
      deps.telemetry({
        learnerId,
        question: question.trim(),
        topicNodeIds: [context.topicNodeId],
        evidenceCount: evidence.length,
        evidenceSources: evidence.map((item) => item.source),
        refused,
        model: generated.model,
        promptIdentity: promptIdentity(),
        latencyMs,
        interventionType,
        mode,
        kind: context.kind,
        reference: context.reference,
        toolInvocations: [...toolTraces],
      });

      // the ContextView flattening (frozen ClaAnswerView.ContextView :31-58):
      // the CurriculumVersionInfo rides as three flat strings on the wire
      const contextView = {
        kind: context.kind,
        reference: context.reference,
        topicNodeId: context.topicNodeId,
        rootId: context.rootId,
        subjectCode: context.subjectCode,
        topicCode: context.topicCode,
        topicTitle: context.topicTitle,
        curriculumVersion: context.curriculumVersion.code,
        curriculumBoard: context.curriculumVersion.board,
        curriculumQualification: context.curriculumVersion.qualification,
        validationState: context.validationState,
        mode,
        questionStem: context.questionStem,
        questionCommandWord: context.questionCommandWord,
        questionMarks: context.questionMarks,
        paperCode: context.paperCode,
        attempted: context.attempted,
        partLabel: context.partLabel,
        lessonAction: context.lessonAction,
        noteId: context.noteId,
        noteTitle: context.noteTitle,
      };
      return {
        answer: generated.answer,
        citations,
        context: contextView,
        topics: anchors.map((t) => ({ code: t.code, title: t.title, matchScore: t.matchScore })),
        evidenceCount: evidence.length,
        model: generated.model,
        provider: generated.provider,
        refused,
        latencyMs,
        tools: [...toolTraces],
      };
    },
  };
}

export type ClaService = ReturnType<typeof buildClaService>;
export type { TutorGenerationError };
