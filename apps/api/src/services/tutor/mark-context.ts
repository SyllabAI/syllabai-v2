/**
 * DC-1 — the marking-context contract (spec §3.1 P0016; prereg of record
 * docs/DC1-MARK-CONTEXT-PLAN.md, operator trace 1a15fe62c2e2bd2d).
 *
 * The deterministic loader behind karag prepare() step 2.8: when the ask
 * carries an explicit part reference AND the session paper is pinned, it
 * resolves that part within the pinned paper and — when the learner's
 * LATEST attempt on it carries a validated smart-mark result — returns the
 * marking engine's OWN artifacts as the MARK CONTEXT payload. Never a
 * re-derivation: every field is read from the smartmark store
 * (attempts → answers → smart_mark_results; question_versions →
 * question_parts → mark_schemes → mark_points) and the point rows ride the
 * existing toMarkingPoint projection.
 *
 * Resolution order (the existing intent laws): an explicit part reference
 * ("question 1c") wins — the fetch-parser grammar (qnum, part letter a-h,
 * letter-gated partRoman) — else NO mark context. The tutor pipeline has no
 * conversation-current-part substrate; fabricating one is ruled out by the
 * prereg (R2), so the second arm degrades honestly to the third.
 *
 * Advisory posture, exactly like the quiz scaffold (the pin tier's own
 * law): no pin, no reference, no attempt, no validated result, an
 * ambiguous part match, or any loader failure → null → the ask proceeds
 * exactly as before. The loader never gates an ask and never feeds the
 * SOURCES pool — the evidence path is untouched.
 *
 * Laws mirrored (all verified first-hand):
 *   - loadQuizScaffold's question-number filter: leadingQuestionNumber
 *     (external_ref) === qnum (quiz-scaffold.ts :97-100, :126);
 *   - the validated-result selection: the LATEST smart_mark_results row
 *     with validation_passed (smartmark loadFeedbackSource :885-896);
 *   - resolveScheme: the current question version's latest mark scheme
 *     (smartmark :835-844);
 *   - the per-point projection: toMarkingPoint over the scheme's
 *     mark_points in `ordering`, scoped to the resolved part, joined to
 *     the validated result's breakdown by markPointId (smartmark
 *     project() :917-938).
 */
import { parseFetchQuery } from "./fetch-parser";
import { toMarkingPoint } from "../smartmark";
import type { SqlFn } from "./sql";

/** One marking point of the resolved part: the scheme line of record plus
 *  its Allocation decision (the awarded flag and marksAwarded the law
 *  names), in mark_points.ordering. The marker's evidence/rationale stay
 *  out of the payload (prereg R6: not named by the law; context budget).
 *  DC-5 (docs/DC5-CONFORMANCE-LINT-PLAN.md §4.3): the point's materialised
 *  acceptable-answer surface rides ADDITIVELY — absent rows leave the
 *  fields absent (fail-open; the lint's Rule B passes through for that
 *  point, prereg R-DC5-4). The prompt renderer consumes neither field
 *  (R-DC5-3: no prompt-side menu in run-001); the lint consumes both. */
export interface MarkContextPoint {
  /** the scheme point's own ref (mark_points.ref, e.g. "1-c-i") */
  ref: string;
  /** the MarkingPoint scheme line text, verbatim from the store */
  text: string;
  /** the scheme value of the point */
  marks: number;
  awarded: boolean;
  marksAwarded: number;
  /** DC-5: verbatim ALTERNATIVE rows of the point's materialised surface */
  alternatives?: string[];
  /** DC-5: verbatim NUMERIC rows of the point's materialised surface */
  numericValues?: string[];
}

/** The MARK CONTEXT payload — the marking engine's own artifacts for one
 *  explicitly referenced, marked question part (spec §3.1: part identity,
 *  submitted answer verbatim, per-point Allocation list, scheme lines in
 *  order, and the total). */
export interface MarkContext {
  /** the ACTIVE PAPER CONTEXT label (paper pin identity) */
  paperLabel: string;
  /** the paper's own external_ref of the matched question row ("1", "2(a)") */
  questionNumber: string;
  /** the resolved part's label (question_parts.label) */
  partLabel: string;
  /** the learner's submitted answer text, VERBATIM (null = an untyped
   *  submission — the block states that honestly, never invents one) */
  answerText: string | null;
  /** the per-point list in scheme order (Allocation list + scheme lines) */
  points: MarkContextPoint[];
  totalAwarded: number;
  totalPossible: number;
}

/** Normalized label/suffix comparison: case-folded, parens and spaces
 *  stripped ("A (ii)" → "aii"). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s()]/g, "");
}

/** The leading question number of the paper's own external_ref ("2",
 *  "2(a)", "Q2" → "2") — the quiz-scaffold law, byte-equivalent. */
function leadingQuestionNumber(externalRef: string): string | null {
  const m = /^q?\s*0*(\d+)/i.exec(externalRef.trim());
  return m == null ? null : String(Number.parseInt(m[1]!, 10));
}

/** The part suffix of a per-part external_ref ("2(a)" → "a",
 *  "2(c)(ii)" → "cii"); null for bare rows. */
function refPartSuffix(externalRef: string): string | null {
  const open = externalRef.indexOf("(");
  if (open < 0) return null;
  return norm(externalRef.substring(open));
}

interface QuestionRow {
  id: string;
  external_ref: string | null;
}

interface VersionPartRow {
  version_id: string;
  version: number;
  id: string;
  label: string;
  marks: number | null;
}

interface AttemptRow {
  id: string;
}

interface AnswerRow {
  id: string;
  answer_text: string | null;
}

interface ResultRow {
  id: string;
  answer_id: string;
  marks_awarded: number;
  validation_passed: boolean;
  breakdown: BreakdownEntry[] | null;
}

interface BreakdownEntry {
  markPointId: string;
  ref: string;
  marks: number;
  marksAwarded: number;
  awarded: boolean;
  evidence: string;
  rationale: string;
}

interface SchemeRow {
  id: string;
}

/**
 * loadMarkContext — the deterministic DC-1 payload, or null (fail-open).
 * One explicit part reference per ask (the parser's own shape); the part
 * resolves within the pinned paper only (prereg R3/R4); the LATEST attempt
 * only (the spec's own boundary note, P0045); VALIDATED results only
 * (prereg R5 — a partial accounting fails open rather than serve).
 */
export async function loadMarkContext(
  sql: SqlFn,
  paperId: string,
  paperLabel: string,
  learnerId: string,
  askText: string,
): Promise<MarkContext | null> {
  if (sql == null || paperId == null || paperId.trim() === "") return null;
  if (learnerId == null || learnerId.trim() === "") return null;
  const parsed = parseFetchQuery(askText ?? "");
  const qnum = parsed.qnum;
  const part = parsed.part;
  const partRoman = parsed.partRoman;
  if (qnum == null || part == null) return null;

  // the pinned paper's structured bank rows (the quiz-scaffold band's
  // query shape, active-policy AGNOSTIC — the pin gate upstream already
  // guarantees a VALIDATED paper row)
  const questionRows = (await sql`
    select q.id, q.external_ref
    from questions q
    where q.exam_paper_id = ${paperId}
    order by q.external_ref, q.id`) as unknown as QuestionRow[];
  const qnumRows = questionRows.filter(
    (r) =>
      r.external_ref != null &&
      leadingQuestionNumber(String(r.external_ref)) === String(qnum),
  );
  if (qnumRows.length === 0) return null;

  // part resolution, deterministic cascade (prereg R4):
  //   1. per-part external_ref rows ("2(a)") — suffix match, roman-refined
  //   2. else the bare row's current version's part labels
  const wantPart = norm(part);
  const wantCombined = partRoman == null ? null : norm(part + partRoman);
  const suffixMatches = qnumRows.filter((r) => {
    const suffix = refPartSuffix(String(r.external_ref));
    if (suffix == null) return false;
    return wantCombined != null
      ? suffix === wantCombined || suffix === wantPart
      : suffix === wantPart;
  });
  // roman refinement: when a roman sub-part is bound, an exact combined
  // suffix outranks the bare letter (rows "2(c)" and "2(c)(ii)" together
  // are NOT ambiguous under "2(c)(ii)")
  const refined =
    wantCombined != null && suffixMatches.some((r) => refPartSuffix(String(r.external_ref)) === wantCombined)
      ? suffixMatches.filter((r) => refPartSuffix(String(r.external_ref)) === wantCombined)
      : suffixMatches;

  let questionId: string | null = null;
  let questionNumber: string | null = null;
  if (refined.length === 1) {
    questionId = String(refined[0]!.id);
    questionNumber = String(refined[0]!.external_ref).trim();
  } else if (refined.length === 0) {
    // bare rows: match the current version's part labels
    const bare = qnumRows.filter((r) => refPartSuffix(String(r.external_ref)) == null);
    for (const row of bare) {
      const partRows = (await sql`
        select v.id as version_id, v.version, p.id, p.label, p.marks
        from question_parts p
        join question_versions v on v.id = p.question_version_id
        where v.question_id = ${String(row.id)}
        order by v.version desc, p.ordering`) as unknown as VersionPartRow[];
      if (partRows.length === 0) continue;
      const currentVersion = partRows[0]!.version;
      const inVersion = partRows.filter((p) => p.version === currentVersion);
      const matched = inVersion.filter((p) => {
        const label = norm(String(p.label));
        return wantCombined != null
          ? label === wantCombined || label === wantPart
          : label === wantPart;
      });
      if (matched.length === 1) {
        questionId = String(row.id);
        questionNumber = String(row.external_ref).trim();
        break;
      }
      if (matched.length > 1) return null; // ambiguous label — fail open
    }
    if (questionId == null) return null;
  } else {
    return null; // ambiguous part rows — fail open
  }
  if (questionId == null || questionNumber == null) return null;

  // the resolved part of the CURRENT version (the resolveScheme law's
  // version selection, joined through to the part rows)
  const partRows = (await sql`
    select v.id as version_id, v.version, p.id, p.label, p.marks
    from question_parts p
    join question_versions v on v.id = p.question_version_id
    where v.question_id = ${questionId}
    order by v.version desc, p.ordering`) as unknown as VersionPartRow[];
  if (partRows.length === 0) return null;
  const currentVersion = partRows[0]!.version;
  const inVersion = partRows.filter((p) => p.version === currentVersion);
  const wantLabel = wantCombined != null ? [wantCombined, wantPart] : [wantPart];
  const partCandidates = inVersion.filter((p) => wantLabel.includes(norm(String(p.label))));
  if (partCandidates.length !== 1) return null; // 0 or ambiguous — fail open
  const partRow = partCandidates[0]!;
  const partId = String(partRow.id);
  const versionId = String(partRow.version_id);

  // the LATEST attempt only (spec P0045 boundary note)
  const attemptRows = (await sql`
    select a.id
    from attempts a
    where a.learner_id = ${learnerId} and a.question_id = ${questionId}
    order by a.created_at desc
    limit 1`) as unknown as AttemptRow[];
  if (attemptRows.length === 0) return null; // no attempt — honest (acceptance b)
  const attemptId = String(attemptRows[0]!.id);

  // the answer row for the resolved part
  const answerRows = (await sql`
    select ans.id, ans.answer_text
    from answers ans
    where ans.attempt_id = ${attemptId} and ans.question_part_id = ${partId}
    limit 1`) as unknown as AnswerRow[];
  if (answerRows.length === 0) return null;
  const answerId = String(answerRows[0]!.id);
  const answerText = answerRows[0]!.answer_text;

  // the LATEST VALIDATED smart-mark result (the loadFeedbackSource law)
  const resultRows = (await sql`
    select id, answer_id, marks_awarded, validation_passed, breakdown
    from smart_mark_results
    where answer_id = ${answerId}
    order by created_at desc`) as unknown as ResultRow[];
  const result = resultRows.find((r) => r.validation_passed === true);
  if (result === undefined) return null; // not smart-marked yet — honest

  // the scheme of the current version (the resolveScheme law) and the
  // part's points through the EXISTING toMarkingPoint projection
  const schemeRows = (await sql`
    select id
    from mark_schemes
    where question_version_id = ${versionId}
    order by created_at desc
    limit 1`) as unknown as SchemeRow[];
  if (schemeRows.length === 0) return null;
  const pointRows = (await sql`
    select id, ref, ordering, text, marks, question_part_id
    from mark_points
    where mark_scheme_id = ${String(schemeRows[0]!.id)}
    order by ordering`) as unknown as Array<Record<string, unknown>>;
  const inScope = pointRows
    .map(toMarkingPoint)
    .filter((p) => p.questionPartId === partId);
  if (inScope.length === 0) return null;

  // DC-5 (docs/DC5-CONFORMANCE-LINT-PLAN.md §4.3): the resolved scheme's
  // materialised acceptable-answer surface, ONE additive query keyed to the
  // scheme id — the drift pin's mechanism (a scheme bump is a new scheme
  // row; the resolveScheme law above already reads the LATEST scheme, so
  // both consumers flip atomically). Fail-open: any error or empty table
  // leaves the surfaces absent and Rule B passes through (R-DC5-4).
  let altRows: Array<{ mark_point_id: string; kind: string; value: string }> = [];
  try {
    altRows = (await sql`
      select mark_point_id, kind, value
      from mark_point_alternatives
      where mark_scheme_id = ${String(schemeRows[0]!.id)}`) as unknown as Array<{
      mark_point_id: string;
      kind: string;
      value: string;
    }>;
  } catch {
    altRows = []; // fail-open — the materialisation is progressive
  }
  const altsByPoint = new Map<string, { alternatives: string[]; numericValues: string[] }>();
  for (const r of altRows) {
    const key = String(r.mark_point_id);
    const bucket = altsByPoint.get(key) ?? { alternatives: [], numericValues: [] };
    if (String(r.kind) === "NUMERIC") bucket.numericValues.push(String(r.value));
    else bucket.alternatives.push(String(r.value));
    altsByPoint.set(key, bucket);
  }

  // the Allocation join by markPointId; ANY point without its decided
  // entry fails open (the marking engine's own every-point-decided
  // invariant — a partial accounting would break the exact-accounting pin)
  const byPointId = new Map<string, BreakdownEntry>();
  if (result.breakdown != null) {
    for (const entry of result.breakdown) byPointId.set(String(entry.markPointId), entry);
  }
  const points: MarkContextPoint[] = [];
  for (const point of inScope) {
    const entry = byPointId.get(point.id);
    if (entry === undefined) return null; // partial accounting — fail open
    const surfaces = altsByPoint.get(String(point.id));
    points.push({
      ref: String(entry.ref),
      text: point.text,
      marks: point.marks,
      awarded: entry.awarded === true,
      marksAwarded: Number(entry.marksAwarded),
      ...(surfaces?.alternatives.length ? { alternatives: surfaces.alternatives } : {}),
      ...(surfaces?.numericValues.length ? { numericValues: surfaces.numericValues } : {}),
    });
  }

  return {
    paperLabel: String(paperLabel ?? ""),
    questionNumber,
    partLabel: String(partRow.label),
    answerText,
    points,
    totalAwarded: points.reduce((s, p) => s + p.marksAwarded, 0),
    totalPossible: points.reduce((s, p) => s + p.marks, 0),
  };
}
