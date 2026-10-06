/**
 * The server-side ResourceContext resolver (T-MIG-069 tranche-1b) — frozen
 * source: syllabai-core @ 6cad6ef cla/ClaContextResolver.java :1-492,
 * line-against-line (CLA contract §1, §5, §7).
 *
 * Resolution order (contract §5): resolve context → validate gate → scope.
 * Concretely:
 *  1. the root must BE a subject root — CLA v1 requires a subject-rooted
 *     context, which is what makes curriculum identity and subject isolation
 *     resolvable server-side;
 *  2. the topic must live inside the root's PART_OF subtree (hard subject
 *     isolation — a topic from another subject is a 404, not a silent
 *     cross-subject hop);
 *  3. the validation gate is the serving boundary's own rule: only VALIDATED
 *     curriculum nodes may anchor CLA evidence assembly (SUGGESTED/
 *     UNVALIDATED content is invisible to the CLA exactly as it is to the
 *     Tutor — and fails indistinguishably from an unresolvable reference, so
 *     no validation-state oracle is created);
 *  4. curriculum identity comes from the owning subject's version, never
 *     from the client.
 *
 * RUNTIME STEP (disclosed): this port lands the FOUR dependency-served kinds
 * — KG_TOPIC, SPECIFICATION_POINT, PAST_PAPER_QUESTION, QUESTION_PART. The
 * frozen resolveSmartLesson (:209-222) and resolveNoteSection (:252-282)
 * branches DEFER: SmartLessonService rides T-MIG-053 t4 and
 * RevisionNoteRepository rides T-MIG-053 t3 (r3a's in-flight tranches). The
 * frozen controller law "kinds not served by the current runtime step are a
 * 400 (closed enum, §1)" is the serving mechanism for the deferral — the
 * route dispatch (tranche-2) refuses the deferred kinds with the fixed 400
 * body; the deferral is disclosed, never silent. The with-copies the two
 * deferred resolvers consume (withLessonAction/withNote) already ported in
 * tranche-1a (context.ts) — the t3/t4 lanes enrich WITHOUT re-running gates.
 *
 * v2 seams (REUSE-not-redeclare):
 *  - graph.tree(rootId) is 053's knowledgeTree (the single tree read — the
 *    recursive PART_OF CTE + the code-sorted children fold);
 *  - graph.subtreeIds(rootId) is the questions module's taxonomy.subtreeIds
 *    (the exported 404-first port of KnowledgeGraphService.subtreeIds —
 *    "one implementation" law; composed here via the public classes);
 *  - ServableQuestionService.isServable(questionId) (:166-168 =
 *    findById(questionId).isPresent(), the paper-block + spec projection
 *    chain) is the landed ServableQuestions.findById(id) !== null — the
 *    one-owner servability boundary, byte-for-byte the same gate chain;
 *  - SubjectRepository.findAllByOrderByCode (the paper-less SEED_DEMO spine)
 *    is the landed SubjectsRepository; the row mapper is shared;
 *  - subjects.findByKnowledgeNodeId(rootId) has NO landed v2 equivalent —
 *    ported here as the resolver's own read over the SAME join shape the
 *    SubjectsRepository uses (mapper reused; disclosed, the repository
 *    method is a data access, not a service seam);
 *  - KnowledgeNodeRepository.findById (the gate's entity read) and
 *    QuestionVersionRepository.findByQuestionIdOrderByVersionDesc /
 *    QuestionPartRepository.findById / QuestionRepository.findById /
 *    ExamPaperRepository.findById / AttemptRepository.existsByLearnerIdAnd
 *    QuestionId are the resolver's OWN repository calls in the frozen
 *    topology (different consumers than the tutor/questions projections —
 *    different columns, different fail laws) — ported as local reads with
 *    the resolver's fail laws verbatim.
 *
 * Every failure mode is the indistinguishable 404 (contract §1.1): unknown
 * reference, foreign-subject reference, non-VALIDATED content and invalid
 * relationships all fail with the same shape — no existence oracle, no
 * validation-state oracle, no serving-state oracle.
 */
import { knowledgeTree, type NodeView } from "../knowledge";
import { mapSubjectJoinedRow, SubjectsRepository } from "../curriculum/subjects";
import {
  QuestionFamilyAssembler,
  QuestionTaxonomy,
  ServableQuestions,
} from "../questions";
import { BadRequestException, NotFoundException } from "../identity/errors";
import type { SqlFn } from "../assessment/sql";
import type { SubmitClock } from "../selfmark";
import type { ClaContextKind, ClaResourceContext } from "./context";

/** the resolver's deps — the sql adapter + the resolution clock. */
export interface ClaContextResolverDeps {
  sql: SqlFn;
  clock: SubmitClock;
}

export interface ClaContextResolver {
  resolveKgTopic(
    rootId: string,
    topicNodeId: string,
    learnerId: string,
  ): Promise<ClaResourceContext>;
  resolveSpecificationPoint(
    rootId: string,
    specCode: string | null,
    learnerId: string,
  ): Promise<ClaResourceContext>;
  resolvePastPaperQuestion(
    questionId: string,
    learnerId: string,
  ): Promise<ClaResourceContext>;
  resolveQuestionPart(
    partId: string,
    rootId: string | null,
    learnerId: string,
  ): Promise<ClaResourceContext>;
}

/** minimal subject row the resolver consumes (the joined mapper's output). */
type SubjectRow = ReturnType<typeof mapSubjectJoinedRow>;

/** question row as the resolver's repo read selects it (plain columns). */
interface QuestionRow {
  id: string;
  active: boolean;
  exam_paper_id: string | null;
  primary_topic_node_id: string | null;
  command_word: string | null;
}

/** question version row (the resolver's repo read — no parts join; the
 *  resolver never serves part lists, that is the questions module's job). */
interface VersionRow {
  id: string;
  question_id: string;
  version: number;
  stem: string;
  marks: number;
  command_word: string | null;
  validation_state: string;
}

/** question part row (the resolver's repo read). */
interface PartRow {
  id: string;
  question_version_id: string;
  label: string;
  prompt: string | null;
  command_word: string | null;
  marks: number;
}

/** exam paper row (the resolver's repo read). */
interface PaperRow {
  id: string;
  subject_id: string;
  paper_code: string | null;
}

/** the resolved question-anchor spine shared by the two assessment kinds
 *  (:477-482 QuestionAnchor record — subject, rootId, topicNode,
 *  currentVersion, paper). */
interface QuestionAnchor {
  subject: SubjectRow;
  rootId: string;
  topicNode: { id: string; code: string; title: string };
  currentVersion: VersionRow;
  paper: PaperRow | null;
}

/** the KnowledgeNode entity face the gate reads (:165-171). */
interface NodeEntityRow {
  code: string;
  title: string;
  validation_status: string;
}

/**
 * Factory — the composition root injects the sql adapter + the clock
 * (mirrors the frozen @Service constructor injection :71-93). Composes the
 * landed seams once: the servability one-owner boundary and the 404-first
 * subtreeIds port ride the questions module's public classes.
 */
export function buildClaContextResolver(
  deps: ClaContextResolverDeps,
): ClaContextResolver {
  const { sql, clock } = deps;
  const servable = new ServableQuestions(sql);
  const subjects = new SubjectsRepository(sql);
  const taxonomy = new QuestionTaxonomy(sql, servable, new QuestionFamilyAssembler());

  const nowIso = (): string => clock.now().toISOString();

  /**
   * subjects.findByKnowledgeNodeId(rootId) — the resolver's own read over
   * the SAME join shape SubjectsRepository maps (mapper reused; the null
   * return is the caller's fail law — "curriculum subject root" 404).
   */
  const subjectByKnowledgeNodeId = async (rootId: string): Promise<SubjectRow | null> => {
    const rows = (await sql`
      select s.id, s.curriculum_version_id, s.code, s.name, s.knowledge_node_id, s.created_at,
             v.id as v_id, v.board, v.qualification, v.code as v_code, v.title as v_title,
             v.status as v_status, v.created_at as v_created_at
      from subjects s
      join curriculum_versions v on v.id = s.curriculum_version_id
      where s.knowledge_node_id = ${rootId}`) as unknown as Array<Record<string, unknown>>;
    const row = rows[0];
    return row ? mapSubjectJoinedRow(row) : null;
  };

  /** KnowledgeNodeRepository.findById port — the gate's entity read. The
   *  miss law is the CALLER's (the frozen orElseThrow carries the kind
   *  label), so this returns null and the spine throws. */
  const nodeEntity = async (nodeId: string): Promise<NodeEntityRow | null> => {
    const rows = (await sql`
      select code, title, validation_status from knowledge_nodes where id = ${nodeId}::uuid`) as unknown as NodeEntityRow[];
    return rows[0] ?? null;
  };

  /** QuestionVersionRepository.findByQuestionIdOrderByVersionDesc — the
   *  current version is the FIRST row (highest version number). */
  const versionsByQuestionDesc = async (questionId: string): Promise<VersionRow[]> => {
    const rows = (await sql`
      select v.id, v.question_id, v.version, v.stem, v.marks, v.command_word, v.validation_state
      from question_versions v
      where v.question_id = ${questionId}
      order by v.version desc`) as unknown as VersionRow[];
    return rows;
  };

  /** QuestionRepository.findById (the raw row — the active filter is the
   *  CALLER's law, frozen :304-306 / :353-355). */
  const questionById = async (questionId: string): Promise<QuestionRow | null> => {
    const rows = (await sql`
      select q.id, q.active, q.exam_paper_id, q.primary_topic_node_id, q.command_word
      from questions q
      where q.id = ${questionId}`) as unknown as QuestionRow[];
    return rows[0] ?? null;
  };

  /** ExamPaperRepository.findById. */
  const paperById = async (paperId: string): Promise<PaperRow | null> => {
    const rows = (await sql`
      select p.id, p.subject_id, p.paper_code from exam_papers p
      where p.id = ${paperId}`) as unknown as PaperRow[];
    return rows[0] ?? null;
  };

  /** AttemptRepository.existsByLearnerIdAndQuestionId — the deterministic
   *  attempt-state read over the SAME substrate as Review Hub. */
  const attemptedRead = async (learnerId: string, questionId: string): Promise<boolean> => {
    const rows = (await sql`
      select 1 from attempts
      where learner_id = ${learnerId} and question_id = ${questionId}
      limit 1`) as unknown as unknown[];
    return rows.length > 0;
  };

  /** the frozen collect() (:484-491): flatten the tree into the by-id
   *  registry — the subtree registry every curriculum spine scopes by. */
  const collect = (node: NodeView, byId: Map<string, NodeView>): void => {
    byId.set(node.id, node);
    for (const child of node.children ?? []) collect(child, byId);
  };

  /** graph.tree(rootId) → the flattened registry (the frozen two-step:
   *  collect(graph.tree(rootId), byId) :129-131 / :157-158 / :266-267). */
  const registry = async (rootId: string): Promise<Map<string, NodeView>> => {
    const tree = await knowledgeTree({ sql, clock }, rootId, false);
    const byId = new Map<string, NodeView>();
    collect(tree, byId);
    return byId;
  };

  /** the CurriculumVersionInfo projection (:182-184) — curriculum identity
   *  from the owning subject's joined version. */
  const versionInfo = (subject: SubjectRow) => ({
    code: subject.version.code,
    board: subject.version.board,
    qualification: subject.version.qualification,
    status: subject.version.status,
  });

  /**
   * Shared resolution spine for the curriculum-node-anchored kinds
   * (:149-189 resolveCurriculumNode): subtree scoping + the §1.2 validation
   * gate + curriculum identity from the owning subject. Every failure is an
   * indistinguishable 404.
   */
  const resolveCurriculumNode = async (
    rootId: string,
    nodeId: string,
    learnerId: string,
    kind: ClaContextKind,
    what: string,
  ): Promise<ClaResourceContext> => {
    const subject = await subjectByKnowledgeNodeId(rootId);
    if (subject === null) {
      throw new NotFoundException("curriculum subject root", rootId);
    }

    // registry over the subject subtree (same scoping pattern as Smart Lesson)
    const byId = await registry(rootId);

    const topic = byId.get(nodeId);
    if (topic === undefined) {
      throw new NotFoundException(`${what} in this subject`, nodeId);
    }

    const node = await nodeEntity(nodeId);
    if (node === null) {
      throw new NotFoundException(what, nodeId);
    }
    if (node.validation_status !== "VALIDATED") {
      // validation gate (contract §1.2): fail-closed, indistinguishable
      // from unresolvable — no validation-state existence oracle
      throw new NotFoundException(`validated ${what}`, nodeId);
    }

    return {
      kind,
      reference: nodeId,
      topicNodeId: nodeId,
      rootId,
      subjectCode: subject.code,
      topicCode: node.code,
      topicTitle: node.title,
      curriculumVersion: versionInfo(subject),
      validationState: node.validation_status,
      learnerId,
      resolvedAt: nowIso(),
      questionStem: null,
      questionCommandWord: null,
      questionMarks: 0,
      paperCode: null,
      attempted: null,
      partLabel: null,
      lessonAction: null,
      noteId: null,
      noteTitle: null,
    };
  };

  /**
   * The shared question-anchored spine (:396-442 resolveQuestionAnchor):
   * paper → subject (or subtree containment for paper-less SEED_DEMO
   * questions) → primary topic inside the subject subtree + VALIDATED
   * (curriculum §1.2 gate) + the question's current version VALIDATED.
   * Every failure is an indistinguishable 404.
   */
  const resolveQuestionAnchor = async (question: QuestionRow): Promise<QuestionAnchor> => {
    const paper =
      question.exam_paper_id === null
        ? null
        : await (async () => {
            const p = await paperById(question.exam_paper_id as string);
            if (p === null) throw new NotFoundException("exam paper", question.exam_paper_id as string);
            return p;
          })();

    const topicNodeId = question.primary_topic_node_id;
    if (topicNodeId === null) {
      throw new NotFoundException("question topic anchor", question.id);
    }

    let subject: SubjectRow;
    if (paper !== null) {
      const owned = await subjects.findById(paper.subject_id);
      if (owned === null) throw new NotFoundException("subject", paper.subject_id);
      subject = owned;
    } else {
      // the paper-less SEED_DEMO walk: the subject whose subtree contains
      // the topic (findAllByOrderByCode order + subtreeIds containment —
      // the frozen stream filter+findFirst is the sequential short-circuit
      // a for-loop ports exactly)
      let hit: SubjectRow | undefined = undefined;
      for (const s of await subjects.findAllByOrderByCode()) {
        if (s.knowledgeNodeId === null) continue;
        if ((await taxonomy.subtreeIds(s.knowledgeNodeId)).includes(topicNodeId)) {
          hit = s;
          break;
        }
      }
      if (hit === undefined) {
        throw new NotFoundException("subject for question", question.id);
      }
      subject = hit;
    }

    const rootId = subject.knowledgeNodeId;
    if (rootId === null) {
      throw new NotFoundException("question topic anchor", question.id);
    }

    const byId = await registry(rootId);
    const topic = byId.get(topicNodeId);
    if (topic === undefined) {
      throw new NotFoundException("curriculum topic in this subject", topicNodeId);
    }

    const versions = await versionsByQuestionDesc(question.id);
    const currentVersion = versions[0];
    if (currentVersion === undefined) {
      throw new NotFoundException("question version", question.id);
    }
    if (currentVersion.validation_state !== "VALIDATED") {
      throw new NotFoundException("validated question", question.id);
    }

    const topicNode = await nodeEntity(topicNodeId);
    if (topicNode === null) {
      throw new NotFoundException("curriculum topic", topicNodeId);
    }
    if (topicNode.validation_status !== "VALIDATED") {
      // curriculum validation gate on the spec anchor (contract §1.2)
      throw new NotFoundException("validated curriculum topic", topicNodeId);
    }
    return {
      subject,
      rootId,
      topicNode: { id: topicNodeId, code: topicNode.code, title: topicNode.title },
      currentVersion,
      paper,
    };
  };

  /** the contextFrom projection (:444-475) — the question-anchored record
   *  shape (partMarks != null ? partMarks : currentVersion.marks). */
  const contextFrom = (
    anchor: QuestionAnchor,
    kind: ClaContextKind,
    reference: string,
    partLabel: string | null,
    commandWord: string | null,
    learnerId: string,
    stem: string | null,
    attempted: boolean,
    partMarks: number | null,
  ): ClaResourceContext => ({
    kind,
    reference,
    topicNodeId: anchor.topicNode.id,
    rootId: anchor.rootId,
    subjectCode: anchor.subject.code,
    topicCode: anchor.topicNode.code,
    topicTitle: anchor.topicNode.title,
    curriculumVersion: versionInfo(anchor.subject),
    validationState: anchor.currentVersion.validation_state,
    learnerId,
    resolvedAt: nowIso(),
    questionStem: stem,
    questionCommandWord: commandWord,
    questionMarks: partMarks ?? anchor.currentVersion.marks,
    paperCode: anchor.paper !== null ? anchor.paper.paper_code : null,
    attempted,
    partLabel,
    lessonAction: null,
    noteId: null,
    noteTitle: null,
  });

  return {
    /**
     * Resolve a KG_TOPIC context (:100-107). Every failure mode is a
     * NotFoundException: an unresolvable reference is a 404, never a
     * best-effort guess (contract §1.1).
     */
    async resolveKgTopic(rootId, topicNodeId, learnerId) {
      if (topicNodeId === null) {
        throw new BadRequestException("KG_TOPIC context requires topicNodeId");
      }
      return resolveCurriculumNode(rootId, topicNodeId, learnerId, "KG_TOPIC", "curriculum topic");
    },

    /**
     * Resolve a SPECIFICATION_POINT context (:117-141 — the syllabus-browser
     * anchor: the client passes the spec-point CODE it is displaying — e.g.
     * "4CH1-1.18" — an opaque string the server resolves to a validated
     * curriculum node in the rooted subject). Same fail-closed discipline as
     * resolveKgTopic: unknown code / code outside the subject / non-VALIDATED
     * node are all an indistinguishable 404 — no existence oracle, no
     * validation-state oracle.
     */
    async resolveSpecificationPoint(rootId, specCode, learnerId) {
      if (specCode === null || specCode === undefined || specCode.trim().length === 0) {
        throw new BadRequestException("SPECIFICATION_POINT context requires specCode");
      }
      const subject = await subjectByKnowledgeNodeId(rootId);
      if (subject === null) {
        throw new NotFoundException("curriculum subject root", rootId);
      }

      // registry over the subject subtree; the code must resolve INSIDE it
      // (subject isolation — a foreign subject's spec code is a 404, not a
      // best-effort guess)
      const byId = await registry(rootId);
      const wanted = specCode.trim();
      const match = [...byId.values()]
        .filter((n) => wanted === n.code)
        .map((n) => n.id)
        .sort()[0];
      if (match === undefined) {
        throw new NotFoundException("specification point in this subject", wanted);
      }
      return resolveCurriculumNode(
        rootId,
        match,
        learnerId,
        "SPECIFICATION_POINT",
        "validated specification point",
      );
    },

    /**
     * Resolve a PAST_PAPER_QUESTION context (:302-321 — step 2, CLA contract
     * §7). The question is the anchor; its primary KG topic is the
     * deterministic spec anchor. Resolution order (contract §5): resolve →
     * validation gate → scope → attempt state:
     *  1. the question must exist and be active — else 404;
     *  2. the question must be SERVABLE through the exact serving gate
     *     (ServableQuestionService.isServable — validated current version +
     *     paper-level integrity gate) — else an indistinguishable 404, no
     *     serving-state oracle;
     *  3. subject identity comes from the question's paper (server-side);
     *     the primary topic must live in that subject's subtree and be
     *     VALIDATED (the same curriculum gate as KG_TOPIC) — else 404;
     *  4. the attempt-state read (§7.3) is deterministic over attempt
     *     history — the SAME substrate as Review Hub.
     */
    async resolvePastPaperQuestion(questionId, learnerId) {
      const question = await questionById(questionId);
      if (question === null || !question.active) {
        throw new NotFoundException("servable question", questionId);
      }
      // validation/paper-integrity gate: fail-closed, indistinguishable
      // from unresolvable — no serving-state oracle (contract §7.1/§1.2).
      // The frozen gate IS findById(...).isPresent() (:166-168) — the landed
      // ServableQuestions.findById chain, REUSE-not-redeclare.
      if ((await servable.findById(questionId)) === null) {
        throw new NotFoundException("servable question", questionId);
      }
      const anchor = await resolveQuestionAnchor(question);
      const attempted = await attemptedRead(learnerId, question.id);
      return contextFrom(
        anchor,
        "PAST_PAPER_QUESTION",
        question.id,
        null,
        anchor.currentVersion.command_word !== null
          ? anchor.currentVersion.command_word
          : question.command_word,
        learnerId,
        anchor.currentVersion.stem,
        attempted,
        null,
      );
    },

    /**
     * Resolve a QUESTION_PART context (:345-387 — contract §1: part-level
     * anchor). The client passes the opaque part id (plus, optionally, the
     * subject root its UI is scoped to — when present it must MATCH the
     * part's own subject); everything else is resolved server-side through
     * the canonical assessment relationships:
     *  1. part → its QuestionVersion → the owning question (active) — every
     *     hop is a canonical FK, never inferred from free text;
     *  2. RELATIONSHIP gate: the part's version must BE the question's
     *     CURRENT version — a part of a superseded version is an invalid
     *     relationship, an indistinguishable 404;
     *  3. the question must be SERVABLE (exact serving gate) and its primary
     *     topic VALIDATED inside the owning subject's subtree — the same
     *     gates as the question-level anchor;
     *  4. an explicitly supplied rootId belonging to a DIFFERENT subject is
     *     a foreign-subject reference — 404, never a silent hop.
     * No existence oracle is created: unknown part / unknown question /
     * unvalidated content / foreign subject / invalid relationship all fail
     * with the same 404 shape.
     */
    async resolveQuestionPart(partId, rootId, learnerId) {
      if (partId === null) {
        throw new BadRequestException("QUESTION_PART context requires partId");
      }
      const partRows = (await sql`
        select p.id, p.question_version_id, p.label, p.prompt, p.command_word, p.marks
        from question_parts p
        where p.id = ${partId}`) as unknown as PartRow[];
      const part = partRows[0];
      if (part === undefined) {
        throw new NotFoundException("question part", partId);
      }
      // part.questionVersion() — the canonical FK (eagerly fetched in the
      // frozen entity graph; a plain read here)
      const versionRows = (await sql`
        select v.id, v.question_id, v.version, v.stem, v.marks, v.command_word, v.validation_state
        from question_versions v
        where v.id = ${part.question_version_id}`) as unknown as VersionRow[];
      const partVersion = versionRows[0];
      if (partVersion === undefined) {
        throw new NotFoundException("question part", partId);
      }
      const question = await questionById(partVersion.question_id);
      if (question === null || !question.active) {
        throw new NotFoundException("question part", partId);
      }

      // relationship gate: the part must belong to the question's CURRENT
      // version (a part of a superseded version is not a servable anchor)
      const current = (await versionsByQuestionDesc(question.id))[0];
      if (current === undefined) {
        throw new NotFoundException("question version", question.id);
      }
      if (current.id !== partVersion.id) {
        throw new NotFoundException("question part on the current version", partId);
      }
      // same serving/paper-integrity gate as the question-level anchor
      if ((await servable.findById(question.id)) === null) {
        throw new NotFoundException("servable question", question.id);
      }

      // subject isolation: an explicitly supplied root must BE this
      // question's own subject root (foreign-subject reference → 404)
      const anchor = await resolveQuestionAnchor(question);
      if (rootId !== null) {
        const scoped = await subjectByKnowledgeNodeId(rootId);
        if (scoped === null) {
          throw new NotFoundException("curriculum subject root", rootId);
        }
        if (scoped.id !== anchor.subject.id) {
          throw new NotFoundException("question part in this subject", partId);
        }
      }

      const attempted = await attemptedRead(learnerId, question.id);
      return contextFrom(
        anchor,
        "QUESTION_PART",
        partId,
        part.label,
        part.command_word !== null ? part.command_word : question.command_word,
        learnerId,
        part.prompt,
        attempted,
        part.marks,
      );
    },
  };
}
