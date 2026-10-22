/**
 * F-183 — the instant MS-reveal law in drill mode (real mark schemes, method
 * credit). Product spec: Kognity dossier v1.1 Deep Dive D §8.4–8.5 (tracker
 * F-183, repo syllabai-v2, deps F-182 / F-047 / F-144); prereg of record
 * docs/F183-MS-REVEAL-LAW-PLAN.md (committed WITH this implementation per the
 * #216/#225/#229/#232/DC-4/F182 pattern). Positioning line of record: THE
 * SOLUTIONS ARE THE EXAMINER'S — a drill whose reveal paraphrases instead of
 * showing the real mark scheme repeats the documented Kognity weakness.
 *
 * THE LAW (L1..L6 — pinned by test/drill/reveal-law.test.ts):
 *   L1  INSTANT. The reveal rides the evidence ack — the SAME response that
 *       records the attempt. No second gated fetch, no polling, no scheduled
 *       unlock. By construction it is post-attempt: the evidence row is
 *       immutable-committed before the reveal is computed (serve.ts order).
 *   L2  NEVER TEACHER-GATED. The drill MS of record is the SERVED corpus
 *       (apps/hub/content/<course>/questions.json per-part markPoints,
 *       answerStatus "linked" — the examiner's own scheme). The drill never
 *       reads the AI-extracted mark_schemes plane, so the VALIDATED_ONLY /
 *       INCLUDE_SUGGESTED policy (services/questions/reveal.ts) does not
 *       apply here and no validationState ever enters the drill ack. The
 *       REJECTED/FLAGGED semantics are that plane's; they cannot reach a
 *       surface that never queries it.
 *   L3  VERBATIM. Points render exactly as the examiner wrote them: ref =
 *       corpus point id, textMd byte-for-byte, corpus order preserved, never
 *       reordered, never paraphrased. marksTotal is derived (sum of point
 *       marks) and the bank fail-closes unless it equals the part's marks.
 *   L4  METHOD CREDIT. Structured drill parts (text responses) get the Smart
 *       Mark method-credit verdict — the ADR-025 Decision vocabulary (per
 *       point: methodCredited boolean + rationale), computed AGAINST the MS
 *       of record. The verdict is EPHEMERAL ack content (the FeedbackLlm
 *       posture: never stored) — the zero-stakes law holds: no attempts, no
 *       ai_mark_events, no writes outside the drill's own tables. MCQ parts
 *       are server-graded already; they never carry a method-credit verdict.
 *   L5  BOUNDARIES. Everywhere else reveal gating stays as-is —
 *       MarkSchemeReveal is untouched by this module. No drill MS enters any
 *       draw payload (the draw response schema has no such fields); no gated
 *       plane content enters the drill ack (no validationState field exists
 *       on drillMarkSchemeViewSchema).
 *   L6  HONEST NULL. A part without a linked MS of record reveals
 *       solutionMd with markScheme null; a dormant/unavailable generator
 *       reveals no verdict. Both nulls are visible to the validation metric
 *       ("% drill reveals showing full M-point MS") — the law refuses to
 *       paraphrase a missing MS into a fake one, exactly the Kognity
 *       weakness this feature exists to kill.
 *
 * The generator seam (DrillMethodCreditGenerator) is the injected LLM seam —
 * the MarkingCandidateGenerator pattern (lifecycle-gated, dormant by
 * default). Production composition: chainAsDrillMethodCreditGenerator over
 * THE ONE LLM CHAIN OF RECORD (services/llmchain/bridges.ts); zero-key boots
 * stay dormant and the ack degrades to the honest null (L6).
 */
import type {
  DrillMarkSchemeView,
  DrillMethodCreditAllocation,
  DrillMethodCreditView,
} from "@syllabai/contracts";

import type { DrillBank } from "./bank";

/** The method-credit wire view IS the contracts type (single source of record). */
export type { DrillMethodCreditView };

/** The input one method-credit verdict is computed over. */
export interface DrillMethodCreditInput {
  readonly problemMd: string;
  /** The learner's structured (text) response, verbatim. */
  readonly responseText: string;
  /** The MS of record points to credit against (L4: never invented points). */
  readonly points: readonly { readonly ref: string; readonly textMd: string; readonly marks: number }[];
}

/**
 * The injected LLM seam for drill method credit — the MarkingCandidateGenerator
 * posture: propose-only, lifecycle-gated (available()), and every allocation
 * it returns is re-validated against the MS of record before the ack (the
 * validator-trio law: no invented refs, no duplicates).
 */
export interface DrillMethodCreditGenerator {
  /** The generator's declared pipeline version (rides the ack for provenance). */
  readonly pipelineVersion: string;
  /** Dormant-by-default: false when the LLM chain has no available member. */
  available(): boolean;
  credit(input: DrillMethodCreditInput): Promise<DrillMethodCreditAllocation[]>;
}

export class DrillMethodCreditGenerationError extends Error {
  constructor(
    public readonly reason: string,
    public readonly rawOutput: string | null = null,
  ) {
    super(reason);
    this.name = "DrillMethodCreditGenerationError";
  }
}

/** The reveal payload the evidence ack carries (both fields honest-null, L6). */
export interface DrillRevealView {
  readonly markScheme: DrillMarkSchemeView | null;
  readonly methodCredit: DrillMethodCreditView | null;
}

/**
 * The validator-trio analog (bounds + coverage, adapted to method credit —
 * pure, deterministic, never invents): every allocation must reference a
 * KNOWN point ref of the MS of record, no duplicate refs, and a rationale
 * must be present whenever the generator says anything at all. Returns null
 * on any violation — the ack degrades to the honest null instead of serving
 * an ungrounded verdict.
 */
export function validateMethodCreditAllocations(
  allocations: readonly DrillMethodCreditAllocation[],
  points: readonly { readonly ref: string }[],
): DrillMethodCreditAllocation[] | null {
  const known = new Set(points.map((p) => p.ref));
  const seen = new Set<string>();
  for (const allocation of allocations) {
    if (!known.has(allocation.ref)) return null; // invented point id — refuse
    if (seen.has(allocation.ref)) return null; // duplicate — refuse
    if (typeof allocation.methodCredited !== "boolean") return null;
    if (typeof allocation.rationale !== "string" || allocation.rationale.length === 0) return null;
    seen.add(allocation.ref);
  }
  return [...allocations];
}

/**
 * The reveal law, computed for one recorded drill attempt. `input` is the
 * structured-response context (null for MCQ or when the caller has no
 * response text); `generator` is the injected seam (null = the dormant
 * posture, e.g. zero-key boots — L6).
 *
 * Order guarantees (L1): callers invoke this ONLY after the evidence row is
 * committed — the reveal is post-attempt by construction.
 */
export async function revealForEvidence(
  bank: DrillBank,
  partId: string,
  input: { readonly responseKind: "choice" | "text"; readonly responseText: string } | null,
  generator: DrillMethodCreditGenerator | null,
): Promise<DrillRevealView> {
  // L3 verbatim pass-through: the bank's MS of record IS the ack's MS (the
  // projection adds only the wire's source stamp — never a transformation of
  // the examiner's data). The bank already fail-closed the arithmetic
  // (marksTotal == part.marks).
  const bankMs = bank.markSchemeOf(partId);
  const markScheme: DrillMarkSchemeView | null = bankMs
    ? {
        source: "corpus-of-record",
        answerStatus: bankMs.answerStatus,
        points: bankMs.points.map((p) => ({ ref: p.ref, textMd: p.textMd, marks: p.marks })),
        marksTotal: bankMs.marksTotal,
      }
    : null;

  // L4: method credit is a structured-part concept — text responses only,
  // computed AGAINST the MS of record (no MS of record -> nothing to credit
  // against -> the honest null, never a verdict over invented points).
  let methodCredit: DrillMethodCreditView | null = null;
  if (
    input !== null &&
    input.responseKind === "text" &&
    generator !== null &&
    generator.available() &&
    markScheme !== null
  ) {
    try {
      const raw = await generator.credit({
        problemMd: bank.contentOf(partId)?.problemMd ?? "",
        responseText: input.responseText,
        points: markScheme.points,
      });
      const validated = validateMethodCreditAllocations(raw, markScheme.points);
      if (validated !== null) {
        methodCredit = {
          engine: "smart-mark",
          pipelineVersion: generator.pipelineVersion,
          allocations: validated,
          creditsTotal: validated.filter((a) => a.methodCredited).length,
        };
      }
      // invalid generator output -> methodCredit stays null (fail-closed, L6)
    } catch {
      // provider unavailable / unparseable / truncated -> the honest null;
      // the MS reveal itself is deterministic corpus content and unaffected
      methodCredit = null;
    }
  }

  return { markScheme, methodCredit };
}
