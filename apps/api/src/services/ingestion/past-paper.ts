/**
 * PastPaperIngestionService port — the T-011 content-bank bridge
 * (T-MIG-082 tranche B2). Byte-faithful port of the frozen
 * teacher/ingestion/PastPaperIngestionService.java (359 lines) @ 6cad6ef,
 * verified line-against-line 2026-10-07.
 *
 * Deterministic, whole-draft, single transaction: either the full paper
 * lands or nothing does (the CALLER owns the transaction — the frozen
 * @Transactional joins the glm-ocr pair's one transaction; this port takes
 * the caller's SqlFn).
 *
 * Ported laws:
 *   - everything lands in SUGGESTED state — drafts are heuristic v0 output
 *     and nothing serves to learners until a teacher validates (§7);
 *   - duplicate guard: findByPaperCodeAndSessionLabel → 409 "paper X Y
 *     already ingested";
 *   - the identity gate: no session label → 409 "paper identity
 *     incomplete: no session label (refusing a nameless paper — supply
 *     --session-label at parse time)";
 *   - the title builds ONLY from printed identity components, skipping
 *     absent ones (never the literal "null");
 *   - difficulty 3 + the 90s/mark heuristic, reviewable; STRUCTURED type;
 *     marks clamped ≥ 1 (parts ≥ 0);
 *   - one INGESTION-ANCHOR TOPIC node per paper (UNVALIDATED, find-or-
 *     create by code — two papers of the same session share ONE anchor;
 *     the >40-char code caps with an 8-hex JAVA-hashCode suffix — the
 *     frozen String.format("%08x", hashCode()) is ported bit-exactly) +
 *     the PART_OF edge under the subject root (find-or-create, uq_edge);
 *   - part labels unique per version: the first occurrence keeps the
 *     printed label, later ones get ".2", ".3" … (parser fragmentation is
 *     surfaced as review findings by the mapper, never silently dropped);
 *   - mark points split by the questionRef prefix law ("N" or "N-x"),
 *     part resolved by the label after the first dash, question-level
 *     points attach to the scheme directly.
 */
import type { SqlFn } from "../identity/users";
import { ConflictException } from "../identity/errors";
import type { PastPaperDraft } from "@syllabai/contracts";

type Row = Record<string, unknown>;

export interface IngestionSummary {
  paperId: string;
  questions: number;
  parts: number;
  markPoints: number;
}

/** Java String.hashCode — the anchor-code cap's hash (bit-exact, 32-bit signed). */
export function javaStringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** String.format("%08x", hashCode) — two's-complement hex rendering. */
export function javaHex8(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function nullSafe(value: string | null | undefined, fallback: string | null): string | null {
  return value == null || value.trim() === "" ? fallback : value;
}

/** null-safe truncation for VARCHAR columns fed from untrusted draft input (:346-349). */
function bound(value: string | null, maxLength: number): string | null {
  if (value === null || value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

/**
 * Part labels are unique per version (:202-214): keep BOTH rows of a
 * duplicated printed label, later occurrences suffix ".2", ".3", … —
 * deterministic, never guessing which row is the real part.
 */
export function uniquePartLabel(label: string | null, seen: Set<string>): string | null {
  if (label === null) return null;
  if (!seen.has(label)) {
    seen.add(label);
    return label;
  }
  let n = 2;
  while (seen.has(`${label}.${n}`)) n++;
  seen.add(`${label}.${n}`);
  return `${label}.${n}`;
}

/** points whose questionRef matches the question number exactly or "N-x" parts (:217-225). */
function pointsForQuestion(
  points: NonNullable<PastPaperDraft["markScheme"]>["points"],
  questionNumber: string,
): NonNullable<PastPaperDraft["markScheme"]>["points"] {
  const prefix = `${questionNumber}-`;
  return points.filter(
    (p) => p.questionRef !== null && (p.questionRef === questionNumber || p.questionRef.startsWith(prefix)),
  );
}

/** resolve the part a mark point targets: "3-a" → part "a" of question 3 (:228-237). */
function resolvePartRef(questionRef: string): string | null {
  const dash = questionRef.indexOf("-");
  if (dash < 0 || dash + 1 >= questionRef.length) return null;
  return questionRef.slice(dash + 1);
}

/** subjectCode (:319-324): qualification + "-" + subject|GEN, \W-stripped, upper, cap 20. */
export function subjectCodeOf(
  qualification: string | null,
  subject: string | null,
): string {
  const raw = `${qualification ?? ""}-${subject ?? "GEN"}`;
  const sanitized = raw.replace(/\W+/g, "").toUpperCase();
  return sanitized.slice(0, Math.min(20, sanitized.length));
}

/**
 * Human-readable paper title from printed identity components only
 * (:336-343): e.g. "IGCSE Chemistry 4CH1/1C June 2020"; never "null".
 */
export function paperTitleOf(
  meta: NonNullable<PastPaperDraft["paper"]>,
  paperCode: string | null,
  sessionLabel: string,
): string {
  const unit = paperCode ?? meta.unit;
  const title = [meta.qualification, meta.subject, unit, sessionLabel]
    .filter((part) => part != null && part.trim() !== "")
    .join(" ")
    .trim();
  return title === "" ? "past paper" : title;
}

/**
 * Anchor identity = ONE PER PAPER (:260-317): printed paper code + session
 * label; a paper without a code falls back to its session label (papers of
 * the same session share the placeholder); without both, a random 8-hex
 * fragment (unreachable via the pair bridge — the identity gate rejects
 * label-less papers first).
 */
export function anchorCodeOf(
  paperCode: string | null,
  sessionLabel: string | null,
  randomFragment: string,
): string {
  const strip = (s: string) => s.replace(/\W+/g, "").toUpperCase();
  const rawIdentity =
    paperCode === null
      ? sessionLabel === null
        ? randomFragment
        : strip(sessionLabel)
      : strip(paperCode) + (sessionLabel === null ? "" : strip(sessionLabel));
  let anchorCode = `ING-${rawIdentity}`;
  if (anchorCode.length > 40) {
    anchorCode = `${anchorCode.slice(0, 31)}-${javaHex8(javaStringHashCode(anchorCode))}`;
  }
  return anchorCode;
}

interface ResolvedSubject {
  id: string;
  knowledgeNodeId: string | null;
}

/** resolveSubject (:239-258): find by code, else find-or-create the board/qualified DRAFT version + subject. */
async function resolveSubject(
  sql: SqlFn,
  meta: NonNullable<PastPaperDraft["paper"]>,
  code: string,
): Promise<ResolvedSubject> {
  const existing: Row[] = await sql`select id, knowledge_node_id from subjects where code = ${code} limit 1`;
  if (existing.length > 0 && existing[0]) {
    return {
      id: String(existing[0].id),
      knowledgeNodeId: existing[0].knowledge_node_id == null ? null : String(existing[0].knowledge_node_id),
    };
  }
  const versions: Row[] = await sql`
    select id, board, qualification from curriculum_versions order by created_at desc`;
  let cvId: string | null = null;
  for (const v of versions) {
    const board = v.board == null ? null : String(v.board);
    const qualification = v.qualification == null ? null : String(v.qualification);
    if (
      meta.board !== null &&
      board !== null &&
      board.toLowerCase() === meta.board.toLowerCase() &&
      meta.qualification !== null &&
      qualification !== null &&
      qualification.toLowerCase() === meta.qualification.toLowerCase()
    ) {
      cvId = String(v.id);
      break;
    }
  }
  if (cvId === null) {
    cvId = crypto.randomUUID();
    await sql`
      insert into curriculum_versions (id, board, qualification, code, title, status, created_at)
      values (
        ${cvId}::uuid,
        ${nullSafe(meta.board, "unknown-board")},
        ${nullSafe(meta.qualification, "unknown")},
        ${code}-INGEST,
        ${(meta.qualification ?? "") + " " + (meta.subject ?? "") + " (ingested, pending review)"},
        'DRAFT',
        ${new Date().toISOString()}
      )`;
  }
  const subjectId = crypto.randomUUID();
  await sql`
    insert into subjects (id, curriculum_version_id, code, name, knowledge_node_id, created_at)
    values (
      ${subjectId}::uuid,
      ${cvId}::uuid,
      ${code},
      ${nullSafe(meta.subject, "unknown subject")},
      null::uuid,
      ${new Date().toISOString()}
    )`;
  return { id: subjectId, knowledgeNodeId: null };
}

/** createIngestionAnchor (:260-317): find-or-create the TOPIC placeholder + the PART_OF edge. */
async function createIngestionAnchor(
  sql: SqlFn,
  meta: NonNullable<PastPaperDraft["paper"]>,
  subject: ResolvedSubject,
  ingestedBy: string | null,
): Promise<string> {
  const anchorCode = anchorCodeOf(
    meta.paperCode,
    meta.sessionLabel,
    crypto.randomUUID().slice(0, 8),
  );
  let subjectRootId = subject.knowledgeNodeId;
  if (subjectRootId !== null) {
    // knowledgeNodes.findById(subject.knowledgeNodeId()).orElse(null) — a
    // dangling subject root silently skips the PART_OF edge (frozen :282-284)
    const rootRows: Row[] = await sql`select id from knowledge_nodes where id = ${subjectRootId}::uuid limit 1`;
    if (rootRows.length === 0) subjectRootId = null;
  }
  // find-or-create (uq_knowledge_node_code): found anchors keep their
  // original provenance untouched
  const found: Row[] = await sql`select id from knowledge_nodes where code = ${anchorCode} limit 1`;
  let anchorId: string;
  if (found.length > 0 && found[0]) {
    anchorId = String(found[0].id);
  } else {
    anchorId = crypto.randomUUID();
    await sql`
      insert into knowledge_nodes (
        id, code, node_type, title, description, validation_status,
        provenance, created_by, version, created_at
      ) values (
        ${anchorId}::uuid,
        ${anchorCode},
        'TOPIC',
        ${`Ingestion anchor: ${nullSafe(meta.paperCode, meta.unit) ?? "null"}`},
        ${"Auto-created topic for past-paper ingestion — remap during review (Master Spec §7: pipeline never guesses curriculum placement)."},
        'UNVALIDATED',
        ${`past-paper draft ${nullSafe(meta.paperCode, "unknown")}`},
        ${ingestedBy ?? "ingestion-v1"},
        1,
        ${new Date().toISOString()}
      )`;
  }
  // same sharing rule for the PART_OF edge (uq_edge is source+target+type):
  // skip only when this exact (anchor → subjectRoot) edge already exists
  if (subjectRootId !== null) {
    const edges: Row[] = await sql`
      select target_node_id from knowledge_edges
      where source_node_id = ${anchorId}::uuid and relation_type = 'PART_OF'
      limit 1`;
    const edgeTarget = edges.length > 0 && edges[0] ? String(edges[0].target_node_id) : null;
    if (edgeTarget !== subjectRootId) {
      await sql`
        insert into knowledge_edges (
          id, source_node_id, target_node_id, relation_type, strength,
          rationale, validation_status, provenance, created_by, version, created_at
        ) values (
          ${crypto.randomUUID()}::uuid,
          ${anchorId}::uuid,
          ${subjectRootId}::uuid,
          'PART_OF',
          null,
          ${"ingestion anchor under subject root"},
          'UNVALIDATED',
          ${"past-paper draft"},
          ${"ingestion-v1"},
          1,
          ${new Date().toISOString()}
        )`;
    }
  }
  return anchorId;
}

/**
 * ingest (:77-191): the T-011 whole-draft ingestion. Caller owns the
 * transaction; every insert rides the caller's SqlFn.
 */
export async function ingestPastPaperDraft(
  sql: SqlFn,
  draft: PastPaperDraft,
  ingestedBy: string | null,
): Promise<IngestionSummary> {
  if (draft.paper === null || draft.questions === null || draft.questions.length === 0) {
    throw new ConflictException("draft has no paper metadata or no questions");
  }
  // narrowed by the guard above (the ConflictException is the frozen :79-81)
  const meta = draft.paper as NonNullable<PastPaperDraft["paper"]>;
  const questions = draft.questions as NonNullable<PastPaperDraft["questions"]>;
  if (
    meta.paperCode !== null &&
    meta.sessionLabel !== null &&
    (
      await sql`
      select id from exam_papers
      where paper_code = ${meta.paperCode} and session_label = ${meta.sessionLabel} limit 1`
    ).length > 0
  ) {
    throw new ConflictException(
      `paper ${meta.paperCode} ${meta.sessionLabel} already ingested`,
    );
  }
  // identity gate (fail-closed): a paper without a printed/derived session
  // label has no reviewable identity
  if (meta.sessionLabel === null || meta.sessionLabel.trim() === "") {
    throw new ConflictException(
      "paper identity incomplete: no session label (refusing a nameless paper — supply --session-label at parse time)",
    );
  }

  const subject = await resolveSubject(sql, meta, subjectCodeOf(meta.qualification, meta.subject));
  const anchorTopic = await createIngestionAnchor(sql, meta, subject, ingestedBy);

  const paperCode = bound(meta.paperCode, 30);
  const sessionLabel = bound(meta.sessionLabel, 60);

  const paperId = crypto.randomUUID();
  await sql`
    insert into exam_papers (
      id, subject_id, title, board, qualification, unit, session_label,
      paper_code, question_paper_document_id, mark_scheme_document_id,
      validation_state, provenance, extraction_method, created_by, created_at,
      series, year
    ) values (
      ${paperId}::uuid,
      ${subject.id}::uuid,
      ${bound(paperTitleOf(meta, paperCode, sessionLabel!), 200)!},
      ${bound(nullSafe(meta.board, "unknown-board"), 40)!},
      ${bound(nullSafe(meta.qualification, "unknown"), 20)!},
      ${bound(meta.unit, 60)},
      ${sessionLabel},
      ${paperCode},
      ${bound(meta.questionPaperDocumentId, 80)},
      ${bound(meta.markSchemeDocumentId, 80)},
      'SUGGESTED',
      'PAST_PAPER',
      ${bound(draft.extractionMethod, 120)},
      ${ingestedBy}::uuid,
      ${new Date().toISOString()},
      null,
      null
    )`;

  let questionCount = 0;
  let partCount = 0;
  const versionsByNumber = new Map<string, string>();
  for (const q of questions) {
    const questionId = crypto.randomUUID();
    await sql`
      insert into questions (
        id, external_ref, question_type, stem, marks, difficulty,
        expected_time_seconds, command_word, primary_topic_node_id,
        provenance, active, version, created_at, exam_paper_id
      ) values (
        ${questionId}::uuid,
        ${q.externalRef},
        'STRUCTURED',
        ${nullSafe(q.prompt, "")},
        ${Math.max(q.marks, 1)},
        3,
        ${90 * Math.max(q.marks, 1)},
        ${q.commandWord},
        ${anchorTopic}::uuid,
        'PAST_PAPER',
        true,
        1,
        ${new Date().toISOString()},
        ${paperId}::uuid
      )`;
    const versionId = crypto.randomUUID();
    await sql`
      insert into question_versions (
        id, question_id, version, stem, marks, difficulty,
        expected_time_seconds, command_word, validation_state,
        source_document_id, extraction_confidence, extraction_method, created_at
      ) values (
        ${versionId}::uuid,
        ${questionId}::uuid,
        1,
        ${nullSafe(q.prompt, "")},
        ${Math.max(q.marks, 1)},
        3,
        ${90 * Math.max(q.marks, 1)},
        ${q.commandWord},
        'SUGGESTED',
        ${meta.questionPaperDocumentId},
        ${q.confidence},
        ${draft.extractionMethod},
        ${new Date().toISOString()}
      )`;
    // Java HashMap allows null keys; every downstream use string-concats the
    // key ("null-"), so the JS map stores the same "null" rendering verbatim
    versionsByNumber.set(q.questionNumber ?? "null", versionId);
    questionCount++;
    let order = 0;
    const seenLabels = new Set<string>();
    for (const p of q.parts!) { // null parts = the frozen NPE → 500 (no null-normalizer on QuestionDraft)
      const label = uniquePartLabel(p.label ?? null, seenLabels);
      await sql`
        insert into question_parts (
          id, question_version_id, label, prompt, command_word, marks, ordering, created_at
        ) values (
          ${crypto.randomUUID()}::uuid,
          ${versionId}::uuid,
          ${label},
          ${nullSafe(p.prompt, "")},
          ${p.commandWord},
          ${Math.max(p.marks, 0)},
          ${order++},
          ${new Date().toISOString()}
        )`;
      partCount++;
    }
  }

  let pointCount = 0;
  if (draft.markScheme !== null && draft.markScheme.points !== null) {
    const scheme = draft.markScheme;
    for (const [questionNumber, versionId] of versionsByNumber) {
      const mine = pointsForQuestion(scheme.points, questionNumber);
      if (mine.length === 0) continue;
      const schemeId = crypto.randomUUID();
      await sql`
        insert into mark_schemes (
          id, question_version_id, version_label, source_document_id,
          validation_state, extraction_method, created_at, general_guidance
        ) values (
          ${schemeId}::uuid,
          ${versionId}::uuid,
          ${nullSafe(scheme.version, "1")},
          ${scheme.sourceDocumentId},
          'SUGGESTED',
          ${draft.extractionMethod},
          ${new Date().toISOString()},
          ${scheme.generalGuidance ?? null}
        )`;
      let order = 0;
      for (const mp of mine) {
        // resolve the part a mark point targets: "3-a" → part "a"
        const partRef = resolvePartRef(mp.questionRef!);
        let partId: string | null = null;
        if (partRef !== null) {
          const partRows: Row[] = await sql`
            select id from question_parts
            where question_version_id = ${versionId}::uuid and label = ${partRef}
            limit 1`;
          if (partRows.length > 0 && partRows[0]) partId = String(partRows[0].id);
        }
        await sql`
          insert into mark_points (
            id, mark_scheme_id, question_part_id, ref, ordering, text,
            marks, acceptance_criteria, extraction_confidence, created_at
          ) values (
            ${crypto.randomUUID()}::uuid,
            ${schemeId}::uuid,
            ${partId}::uuid,
            ${mp.questionRef},
            ${order++},
            ${mp.text},
            ${Math.max(mp.marks, 1)},
            ${JSON.stringify(mp.acceptance)}::jsonb,
            ${mp.confidence},
            ${new Date().toISOString()}
          )`;
        pointCount++;
      }
    }
  }

  return { paperId, questions: questionCount, parts: partCount, markPoints: pointCount };
}
