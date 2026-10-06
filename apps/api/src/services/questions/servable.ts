/**
 * ServableQuestionService port (T-MIG-031 tranche 1).
 *
 * Frozen law (ServableQuestionService.java + ServableQuestionSpec.java,
 * syllabai-core @ 6cad6ef) — the learner-facing servable-question read
 * model, the ONE owner of the boundary rule "active + (MCQ) or (STRUCTURED
 * with a VALIDATED current version) — ingested/unvalidated content never
 * serves".
 *
 * V20 paper-level integrity gate: questions under a REJECTED or FLAGGED exam
 * paper never serve, even when their own versions are VALIDATED — a rejected
 * or flagged paper signals a systematic defect (wrong source, mis-placement,
 * mass extraction failure) that per-version validation cannot express.
 * Paper-less questions (SEED_DEMO orphans) are unaffected.
 *
 * Fetch-strategy parity (R-M-LAZY doctrine + the frozen repo's own batched
 * counterpart precedent): the Java EntityGraph fetched options in the main
 * query and parts with the versions; the port batches each family in ONE
 * statement and groups in-memory — serving boundaries unchanged, the spec
 * still decides. Java's per-question versions lookup (~1,800-query N+1 on
 * the unscoped surface, per QuestionVersionRepository's own javadoc) ports
 * as the batched current-versions fetch.
 *
 * Wire shapes are the merged T-MIG-018 contract types (z.infer) — tranche-1
 * staging deviation from T-MIG-030/021 (which used local types pending
 * #26): #26 is already merged, so the services bind the ratified wire law
 * directly and tranche-2 needs no import swap. Services never call zod.
 */
import type {
  QuestionType,
  SpecPointRef,
  StudentQuestionView,
} from "@syllabai/contracts";
import { NotFoundException } from "../identity/errors";
import type { SqlFn } from "./sql";

/** Question row as selected from `questions` (plain column names). */
interface QuestionRow {
  id: string;
  external_ref: string | null;
  question_type: QuestionType;
  stem: string;
  marks: number;
  difficulty: number;
  expected_time_seconds: number;
  command_word: string | null;
  primary_topic_node_id: string | null;
  exam_paper_id: string | null;
  provenance: string;
  active: boolean;
}

/** Option row — student view strips correct/misconception (Master Spec §20). */
interface OptionRow {
  id: string;
  question_id: string;
  label: string;
  text: string;
  ordering: number;
}

/** Version row (parts joined flat for the batched fetch). */
interface VersionRow {
  id: string;
  question_id: string;
  version: number;
  stem: string | null;
  marks: number;
  difficulty: number;
  expected_time_seconds: number;
  command_word: string | null;
  validation_state: string;
  part_id: string | null;
  part_label: string | null;
  part_prompt: string | null;
  part_command_word: string | null;
  part_marks: number | null;
  part_ordering: number | null;
}

interface CurrentVersion {
  id: string;
  version: number;
  stem: string | null;
  marks: number;
  difficulty: number;
  expectedTimeSeconds: number;
  commandWord: string | null;
  validationState: string;
  parts: Array<{
    id: string;
    label: string;
    prompt: string | null;
    commandWord: string | null;
    marks: number;
  }>;
}

/**
 * ServableQuestionSpec (spec pattern): active, and for STRUCTURED questions
 * the current version must be VALIDATED — ingested content never serves
 * silently. MCQs keep their Wave-0 flat serving rule (SEED_DEMO items are
 * live-validated v1 backfills). (ServableQuestionSpec.isSatisfiedBy)
 */
export function isServable(
  row: Pick<QuestionRow, "active" | "question_type">,
  currentVersion: CurrentVersion | null,
): boolean {
  if (!row.active) return false;
  if (row.question_type !== "STRUCTURED") return true;
  return currentVersion !== null && currentVersion.validationState === "VALIDATED";
}

export class ServableQuestions {
  constructor(private readonly sql: SqlFn) {}

  /**
   * V20 paper-level serving gate: ids of papers whose state must block
   * serving of EVERYTHING under them (REJECTED or FLAGGED — small result by
   * construction; ExamPaperRepository.findIdsBlockingServing).
   */
  async blockingPaperIds(): Promise<Set<string>> {
    const rows = await this.sql`
      select p.id from exam_papers p
      where p.validation_state in ('REJECTED', 'FLAGGED')`;
    return new Set(rows.map((r) => String(r.id)));
  }

  /**
   * V20 single-question fast path — consults the DB only when a paper exists
   * (paperBlocksServing: paper-less SEED_DEMO orphans get the per-question
   * rule only).
   */
  private async paperBlocksServing(examPaperId: string | null): Promise<boolean> {
    if (examPaperId === null) return false;
    const blocked = await this.blockingPaperIds();
    return blocked.has(examPaperId);
  }

  private async optionsFor(questionIds: string[]): Promise<Map<string, OptionRow[]>> {
    const byQuestion = new Map<string, OptionRow[]>();
    if (questionIds.length === 0) return byQuestion;
    // Column law: QuestionOption.java:33 @ 6cad6ef maps the Java `text`
    // field onto the column `option_text` — the former bare `o.text` here
    // selected a nonexistent column (Postgres 42703 "column o.text does
    // not exist"), 500-ing the families/topics reads on the live instrument
    // (runs #10/#11; T-MIG-067 P1 500-class). The alias keeps the OptionRow
    // mapping below unchanged.
    const rows = (await this.sql`
      select o.id, o.question_id, o.label, o.option_text as text, o.ordering
      from question_options o
      where o.question_id = any(${questionIds}::uuid[])
      order by o.question_id, o.ordering`) as unknown as OptionRow[];
    for (const r of rows) {
      const list = byQuestion.get(r.question_id);
      if (list) list.push(r);
      else byQuestion.set(r.question_id, [r]);
    }
    return byQuestion;
  }

  /**
   * Current (highest-version) version per structured question, one batched
   * query — the fetch strategy every list-shaped path already uses
   * (currentVersions + QuestionVersionRepository.findWithPartsByQuestionIdsIn
   * with the EntityGraph parts join flattened).
   */
  private async currentVersions(
    candidates: QuestionRow[],
  ): Promise<Map<string, CurrentVersion>> {
    const structuredIds = candidates
      .filter((q) => q.question_type === "STRUCTURED")
      .map((q) => q.id);
    const currentByQuestion = new Map<string, CurrentVersion>();
    if (structuredIds.length === 0) return currentByQuestion;
    const rows = (await this.sql`
      select v.id, v.question_id, v.version, v.stem, v.marks, v.difficulty,
             v.expected_time_seconds, v.command_word, v.validation_state,
             p.id as part_id, p.label as part_label, p.prompt as part_prompt,
             p.command_word as part_command_word, p.marks as part_marks,
             p.ordering as part_ordering
      from question_versions v
      left join question_parts p on p.question_version_id = v.id
      where v.question_id = any(${structuredIds}::uuid[])`) as unknown as VersionRow[];

    const byQuestion = new Map<string, VersionRow[]>();
    for (const r of rows) {
      const list = byQuestion.get(r.question_id);
      if (list) list.push(r);
      else byQuestion.set(r.question_id, [r]);
    }
    for (const [questionId, versions] of byQuestion) {
      // versions.stream().max(Comparator.comparingInt(QuestionVersion::version))
      let current: VersionRow | null = null;
      for (const v of versions) {
        if (current === null || v.version > current.version) current = v;
      }
      if (!current) continue;
      const parts = versions
        .filter((v) => v.version === current!.version && v.part_id !== null)
        .sort((a, b) => (a.part_ordering ?? 0) - (b.part_ordering ?? 0))
        .map((v) => ({
          id: v.part_id!,
          label: v.part_label!,
          prompt: v.part_prompt,
          commandWord: v.part_command_word,
          marks: v.part_marks!,
        }));
      currentByQuestion.set(questionId, {
        id: current.id,
        version: current.version,
        stem: current.stem,
        marks: current.marks,
        difficulty: current.difficulty,
        expectedTimeSeconds: current.expected_time_seconds,
        commandWord: current.command_word,
        validationState: current.validation_state,
        parts,
      });
    }
    return currentByQuestion;
  }

  /**
   * Curriculum refs per question id (ADR-026 + T-C24): PRIMARY mappings
   * first, then SECONDARY, each code-ordered — one batched query, empty
   * lists for questions without mappings (e.g. the seed MCQs). Each ref
   * carries the mapping role and the spec point's official applicability
   * verbatim (nullable); the view derives its bare-code list from these.
   *
   * Shared projection since T-C28: the exam-paper detail surface reuses
   * this exact method so every question-carrying payload speaks the same
   * spec-point dialect — no second SQL contract, no divergent ordering
   * rules. (specPointRefs — join through knowledge_nodes for the code +
   * applicability, per SmeQuestionSpecPointRepository.findCodesByQuestionIdsIn.)
   */
  async specPointRefs(
    questionIds: string[],
  ): Promise<Map<string, SpecPointRef[]>> {
    const byQuestion = new Map<string, SpecPointRef[]>();
    if (questionIds.length === 0) return byQuestion;
    const rows = await this.sql`
      select qsp.question_id, kn.code, qsp.role, kn.applicability
      from question_spec_points qsp
      join knowledge_nodes kn on kn.id = qsp.spec_point_node_id
      where qsp.question_id = any(${questionIds}::uuid[])`;
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const r of rows) {
      const qid = String(r.question_id);
      const list = grouped.get(qid);
      if (list) list.push(r);
      else grouped.set(qid, [r]);
    }
    for (const [questionId, qRows] of grouped) {
      byQuestion.set(
        questionId,
        qRows
          .sort((a, b) => {
            const ra = a.role === "PRIMARY" ? 0 : 1;
            const rb = b.role === "PRIMARY" ? 0 : 1;
            if (ra !== rb) return ra - rb;
            return String(a.code) < String(b.code)
              ? -1
              : String(a.code) > String(b.code)
                ? 1
                : 0;
          })
          .map((r) => ({
            code: String(r.code),
            role: String(r.role),
            applicability: (r.applicability ?? null) as SpecPointRef["applicability"],
          })),
      );
    }
    return byQuestion;
  }

  /**
   * Batched projection for list-shaped reads: fetch ALL structured versions
   * (parts included) in one query, pick each question's current version, then
   * apply the same spec as the single-question path. (projectAll)
   */
  private async projectAll(candidates: QuestionRow[]): Promise<StudentQuestionView[]> {
    const [currentByQuestion, refs, options] = await Promise.all([
      this.currentVersions(candidates),
      this.specPointRefs(candidates.map((q) => q.id)),
      this.optionsFor(candidates.map((q) => q.id)),
    ]);
    const out: StudentQuestionView[] = [];
    for (const q of candidates) {
      const view = this.project(q, currentByQuestion.get(q.id) ?? null, options.get(q.id) ?? []);
      if (view === null) continue;
      out.push({
        ...view,
        specPointCodes: (refs.get(q.id) ?? []).map((r) => r.code),
        specPoints: refs.get(q.id) ?? [],
      });
    }
    return out;
  }

  /**
   * null when the spec rejects the question (unvalidated content never
   * serves). (project — the DTO construction laws: StudentQuestionView.from /
   * .structured verbatim, incl. the version-over-question fallbacks.)
   */
  private project(
    q: QuestionRow,
    version: CurrentVersion | null,
    options: OptionRow[],
  ): StudentQuestionView | null {
    const optionViews = options.map((o) => ({ id: o.id, label: o.label, text: o.text }));
    if (q.question_type !== "STRUCTURED") {
      if (!isServable(q, null)) return null;
      return {
        id: q.id,
        externalRef: q.external_ref,
        type: q.question_type,
        stem: q.stem,
        marks: q.marks,
        difficulty: q.difficulty,
        expectedTimeSeconds: q.expected_time_seconds,
        commandWord: q.command_word,
        primaryTopicNodeId: q.primary_topic_node_id,
        examPaperId: q.exam_paper_id,
        options: optionViews,
        parts: [],
        specPointCodes: [],
        specPoints: [],
      };
    }
    if (version === null || !isServable(q, version)) return null;
    return {
      id: q.id,
      externalRef: q.external_ref,
      type: q.question_type,
      stem: version.stem === null ? q.stem : version.stem,
      marks: version.marks > 0 ? version.marks : q.marks,
      difficulty: version.difficulty,
      expectedTimeSeconds: version.expectedTimeSeconds,
      commandWord: version.commandWord,
      primaryTopicNodeId: q.primary_topic_node_id,
      examPaperId: q.exam_paper_id,
      options: [],
      parts: version.parts.map((p) => ({
        id: p.id,
        label: p.label,
        prompt: p.prompt,
        commandWord: p.commandWord,
        marks: p.marks,
      })),
      specPointCodes: [],
      specPoints: [],
    };
  }

  /**
   * All servable questions, difficulty-ordered. (allActive —
   * QuestionRepository.findAllActive: active = true order by difficulty.)
   */
  async allActive(): Promise<StudentQuestionView[]> {
    const rows = await this.sql`
      select q.id, q.external_ref, q.question_type, q.stem, q.marks,
             q.difficulty, q.expected_time_seconds, q.command_word,
             q.primary_topic_node_id, q.exam_paper_id, q.provenance, q.active
      from questions q
      where q.active = true
      order by q.difficulty`;
    return this.filterBlockedAndProject(rows as unknown as QuestionRow[]);
  }

  /**
   * Servable questions mapped to a topic (primary or question_topics),
   * difficulty-ordered. (activeByTopic — QuestionRepository.findActiveByTopic.)
   */
  async activeByTopic(topicNodeId: string): Promise<StudentQuestionView[]> {
    const rows = await this.sql`
      select q.id, q.external_ref, q.question_type, q.stem, q.marks,
             q.difficulty, q.expected_time_seconds, q.command_word,
             q.primary_topic_node_id, q.exam_paper_id, q.provenance, q.active
      from questions q
      where q.active = true
        and (q.primary_topic_node_id = ${topicNodeId} or exists (
              select 1 from question_topics qt
              where qt.question_id = q.id and qt.node_id = ${topicNodeId}))
      order by q.difficulty`;
    return this.filterBlockedAndProject(rows as unknown as QuestionRow[]);
  }

  /**
   * All servable questions whose topic mapping falls inside the given node
   * set (a subject's PART_OF subtree) — the subject-scoped practice surface
   * (session-56). Same servability boundary, same difficulty ordering, only
   * the scope narrows. (activeWithin — QuestionRepository.findActiveWithin.)
   */
  async activeWithin(nodeIds: string[]): Promise<StudentQuestionView[]> {
    const rows = await this.sql`
      select q.id, q.external_ref, q.question_type, q.stem, q.marks,
             q.difficulty, q.expected_time_seconds, q.command_word,
             q.primary_topic_node_id, q.exam_paper_id, q.provenance, q.active
      from questions q
      where q.active = true
        and (q.primary_topic_node_id = any(${nodeIds}::uuid[]) or exists (
              select 1 from question_topics qt
              where qt.question_id = q.id and qt.node_id = any(${nodeIds}::uuid[])))
      order by q.difficulty`;
    return this.filterBlockedAndProject(rows as unknown as QuestionRow[]);
  }

  /**
   * A single servable question, or null when missing/unservable (never
   * throws — the reveal service maps null to the 404). Java: findWithOptions
   * (no active filter in SQL — the spec owns active) → paper gate → project
   * → spec-point attach. (findById)
   */
  async findById(id: string): Promise<StudentQuestionView | null> {
    const rows = await this.sql`
      select q.id, q.external_ref, q.question_type, q.stem, q.marks,
             q.difficulty, q.expected_time_seconds, q.command_word,
             q.primary_topic_node_id, q.exam_paper_id, q.provenance, q.active
      from questions q
      where q.id = ${id}`;
    if (rows.length === 0) return null;
    const q = rows[0]! as unknown as QuestionRow;
    if (await this.paperBlocksServing(q.exam_paper_id)) return null;

    // currentVersion(q.id()) — findByQuestionIdOrderByVersionDesc, parts
    // fetched (EntityGraph "parts" flattened), first row = highest version
    const versionRows = (await this.sql`
      select v.id, v.question_id, v.version, v.stem, v.marks, v.difficulty,
             v.expected_time_seconds, v.command_word, v.validation_state,
             p.id as part_id, p.label as part_label, p.prompt as part_prompt,
             p.command_word as part_command_word, p.marks as part_marks,
             p.ordering as part_ordering
      from question_versions v
      left join question_parts p on p.question_version_id = v.id
      where v.question_id = ${id}
      order by v.version desc`) as unknown as VersionRow[];
    const current = this.currentFromVersionRows(versionRows);

    const options = await this.optionsFor([q.id]);
    const view = this.project(q, current, options.get(q.id) ?? []);
    if (view === null) return null;
    const refs = await this.specPointRefs([view.id]);
    return {
      ...view,
      specPointCodes: (refs.get(view.id) ?? []).map((r) => r.code),
      specPoints: refs.get(view.id) ?? [],
    };
  }

  /** V20: drop questions whose paper is REJECTED/FLAGGED, then batched
   * projection (filterBlockedPapers + projectAll, in call order). */
  private async filterBlockedAndProject(candidates: QuestionRow[]): Promise<StudentQuestionView[]> {
    if (candidates.length === 0) return [];
    const blocked = await this.blockingPaperIds();
    const surviving = candidates.filter(
      (q) => q.exam_paper_id === null || !blocked.has(q.exam_paper_id),
    );
    return this.projectAll(surviving);
  }

  /** group one question's flat version+parts rows into the current version
   * shape (shared by the batched and single-question paths). */
  private currentFromVersionRows(versions: VersionRow[]): CurrentVersion | null {
    if (versions.length === 0) return null;
    let current: VersionRow | null = null;
    for (const v of versions) {
      if (current === null || v.version > current.version) current = v;
    }
    if (!current) return null;
    const parts = versions
      .filter((v) => v.version === current!.version && v.part_id !== null)
      .sort((a, b) => (a.part_ordering ?? 0) - (b.part_ordering ?? 0))
      .map((v) => ({
        id: v.part_id!,
        label: v.part_label!,
        prompt: v.part_prompt,
        commandWord: v.part_command_word,
        marks: v.part_marks!,
      }));
    return {
      id: current.id,
      version: current.version,
      stem: current.stem,
      marks: current.marks,
      difficulty: current.difficulty,
      expectedTimeSeconds: current.expected_time_seconds,
      commandWord: current.command_word,
      validationState: current.validation_state,
      parts,
    };
  }
}
