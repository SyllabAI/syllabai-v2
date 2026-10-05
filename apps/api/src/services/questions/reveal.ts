/**
 * MarkSchemeRevealService port (T-MIG-031 tranche 1).
 *
 * Frozen law (MarkSchemeRevealService.java, syllabai-core @ 6cad6ef) — the
 * learner-facing mark-scheme reveal boundary (Master Spec §15/§20/§22).
 * A mark scheme is serving content like any other, so the reveal runs under
 * an explicit policy instead of an implicit one:
 *
 *   - VALIDATED_ONLY (default, spec-true): only VALIDATED schemes reveal;
 *     anything else withholds to an honest empty result the controller
 *     answers as 204, so the UI can say "pending teacher validation" instead
 *     of presenting AI-extracted content as authoritative.
 *   - INCLUDE_SUGGESTED: SUGGESTED schemes reveal too, carrying their
 *     validationState so the UI labels them "AI-extracted — pending teacher
 *     validation". An operator-authorized deviation, never a silent one.
 *
 * REJECTED and FLAGGED schemes never reveal under either policy (§20 V20
 * semantics). Reveal also rides the same servability gate as the question
 * itself — paper integrity gate included — so a question that cannot serve
 * has no scheme to show (404, not 204).
 *
 * Projection: part-scoped points grouped under their part (version order);
 * the rest general, ordering-sorted. acceptanceCriteria and extraction
 * metadata NEVER leave the backend — a learner surface is not a marking
 * surface. schemeMarks is DERIVED (MarkScheme.totalMarks() = sum of point
 * marks — not a column).
 */
import type { MarkSchemeRevealView, ValidationState } from "@syllabai/contracts";
import { NotFoundException } from "../identity/errors";
import type { ServableQuestions } from "./servable";
import type { SqlFn } from "./sql";

export type RevealPolicy = "VALIDATED_ONLY" | "INCLUDE_SUGGESTED";

/**
 * RevealPolicy.valueOf(...) with fail-fast semantics: a bad value throws at
 * construction — the policy guards learner content, and the frozen service
 * fails the boot on it (@Value injection + valueOf in the constructor).
 */
export function parseRevealPolicy(raw: string | undefined | null): RevealPolicy {
  const value = (raw ?? "VALIDATED_ONLY").trim().toUpperCase();
  if (value !== "VALIDATED_ONLY" && value !== "INCLUDE_SUGGESTED") {
    throw new Error(
      `Invalid mark-scheme reveal policy: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

interface VersionHeadRow {
  id: string;
  version: number;
}

interface SchemeRow {
  id: string;
  validation_state: string;
}

interface PointRow {
  id: string;
  ref: string;
  ordering: number;
  text: string;
  marks: number;
  question_part_id: string | null;
}

interface PartRow {
  part_id: string;
  label: string;
  prompt: string | null;
  command_word: string | null;
  marks: number;
  part_ordering: number;
}

export class MarkSchemeReveal {
  readonly policy: RevealPolicy;

  /**
   * Java injects the policy from `syllabai.assessment.markscheme-reveal-policy`
   * (default VALIDATED_ONLY) and parses it in the constructor — bad value =
   * boot failure. The port takes the raw env string through parseRevealPolicy
   * at the composition root; constructing with an invalid value throws here.
   */
  constructor(
    private readonly sql: SqlFn,
    private readonly servableQuestions: ServableQuestions,
    policy: RevealPolicy,
  ) {
    this.policy = policy;
  }

  /**
   * The reveal law. Returns null when the policy withholds the scheme — the
   * controller answers 204. Throws NotFoundException (404) when the question
   * itself is not servable. (reveal)
   */
  async reveal(questionId: string): Promise<MarkSchemeRevealView | null> {
    const question = await this.servableQuestions.findById(questionId);
    if (question === null) {
      throw new NotFoundException("question", questionId);
    }
    // current version head — findByQuestionIdOrderByVersionDesc first row
    const versions = (await this.sql`
      select v.id, v.version from question_versions v
      where v.question_id = ${questionId}
      order by v.version desc`) as unknown as VersionHeadRow[];
    const version = versions[0] ?? null;
    if (version === null) return null;

    // findFirstByQuestionVersionIdOrderByCreatedAtDesc (EntityGraph points
    // flattened — points batched below instead)
    const schemes = (await this.sql`
      select s.id, s.validation_state from mark_schemes s
      where s.question_version_id = ${version.id}
      order by s.created_at desc
      limit 1`) as unknown as SchemeRow[];
    const scheme = schemes[0] ?? null;
    if (scheme === null) return null;

    switch (scheme.validation_state) {
      case "REJECTED":
      case "FLAGGED":
        return null;
      case "SUGGESTED":
        if (this.policy === "VALIDATED_ONLY") return null;
        break;
      case "VALIDATED":
        // reveals under both policies
        break;
    }
    return this.project(question, version.id, scheme);
  }

  /** part-scoped points grouped under their part (version order); the rest
   * general, ordering-sorted. (project) */
  private async project(
    question: NonNullable<Awaited<ReturnType<ServableQuestions["findById"]>>>,
    versionId: string,
    scheme: SchemeRow,
  ): Promise<MarkSchemeRevealView> {
    const points = (await this.sql`
      select mp.id, mp.ref, mp.ordering, mp.text, mp.marks, mp.question_part_id
      from mark_points mp
      where mp.mark_scheme_id = ${scheme.id}`) as unknown as PointRow[];

    const byPart = new Map<string, PointRow[]>();
    const general: PointRow[] = [];
    for (const point of points) {
      if (point.question_part_id === null) {
        general.push(point);
      } else {
        const list = byPart.get(point.question_part_id);
        if (list) list.push(point);
        else byPart.set(point.question_part_id, [point]);
      }
    }
    const byOrdering = (a: PointRow, b: PointRow) => a.ordering - b.ordering;
    const toView = (p: PointRow) => ({ ref: p.ref, text: p.text, marks: p.marks });

    const parts = (await this.sql`
      select p.id as part_id, p.label, p.prompt, p.command_word, p.marks,
             p.ordering as part_ordering
      from question_parts p
      where p.question_version_id = ${versionId}
      order by p.ordering`) as unknown as PartRow[];

    const schemeMarks = points.reduce((sum, p) => sum + p.marks, 0);

    return {
      questionId: question.id,
      questionExternalRef: question.externalRef,
      schemeId: scheme.id,
      // the DB CHECK constrains the state domain (r7a's marking-state
      // doctrine: stored string at this layer, wire union at the contract)
      validationState: scheme.validation_state as ValidationState,
      schemeMarks,
      questionMarks: question.marks,
      parts: parts.map((part) => ({
        partId: part.part_id,
        label: part.label,
        prompt: part.prompt,
        marks: part.marks,
        points: (byPart.get(part.part_id) ?? []).sort(byOrdering).map(toView),
      })),
      generalPoints: general.sort(byOrdering).map(toView),
    };
  }
}
