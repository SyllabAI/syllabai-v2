/**
 * The paper-mark/v1 identity module — T-MG-CROPMARK-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.4, pipeline step 4:
 *
 *   "the marking prompt lives in a NEW module under the additive services
 *    band; the `tutor-grounded/v15` identity is untouched and this surface
 *    is a NEW identity slot `paper-mark/v1` declared in the new module,
 *    not in prompt.ts"
 *
 * ZERO-TOUCH law: the tutor identity of record is NOT imported here and
 * NOT modified anywhere in this lane. The identity slot of the AI marker
 * lives HERE and only here.
 *
 * The two observed sentences of record (plan §1.7/§1.8, verbatim from the
 * operator's own live attempt on their platform) are carried as doctrine:
 *
 *   "the question explicitly requires all working, so the conclusion alone
 *    earns no marks"                              — the doctrine sentence
 *   "The handwriting in part (a) is outside the scope of this marking."
 *                                                — the scoping sentence
 *
 * Pin (a) asserts the doctrine sentence's presence in the marking prompt;
 * pin (b) asserts the scoping law by construction (per-region inputs) and
 * by the marker's own scoping discipline below.
 */

/** The NEW identity slot of record (plan §3.4) — also the pipelineVersion
 * stamped onto every award row this pipeline writes. */
export const PAPER_MARK_PROMPT_IDENTITY = "paper-mark/v1";
export const PIPELINE_VERSION = PAPER_MARK_PROMPT_IDENTITY;

/** The doctrine sentence of record, verbatim (plan §1.7, 17.p1). */
export const DOCTRINE_SENTENCE =
  "the question explicitly requires all working, so the conclusion alone earns no marks";

/** The vision-transcription step (pipeline step 3). The crop is ONE
 * region — the scoping law is stated to the transcriber too, but it is
 * ENFORCED by construction: the caller ships only this region's crop
 * (pin b's integration test holds the transcriber seam to it). LaTeX
 * delimiter law mirrored from the answer-input transcription posture
 * (structural duplicate — the fences stay independent). */
export const CROP_TRANSCRIPTION_SYSTEM_PROMPT = `You transcribe the student's handwritten working inside a cropped region of an exam paper image.

Scope rule (absolute): the crop shows exactly ONE question region. Transcribe ONLY what is written inside it — anything outside the crop (other questions, other parts, page furniture) is outside the scope of this marking and must never be described, referenced, or solved.

Output rules (absolute):
- Written MATH goes inside inline LaTeX delimiters: $x^2 + 1$, $\\frac{d}{dx}$. Every formula, expression, equation, or numeric working is math — delimit it.
- Written WORDS stay plain text outside the delimiters. Do not output markdown structure: no headings, lists, bold/italic markers, tables, or code fences.
- Transcribe only what the student actually wrote. Preserve their wording and their working order; do not correct, complete, solve, or add anything.
- If parts are unreadable, transcribe the readable parts and mark each unreadable spot with [?].
- If the crop contains no handwritten work at all, output exactly: [empty]`;

/** The user prompt of the transcription step. */
export function buildCropTranscriptionUserPrompt(regionLabel: string): string {
  return `Transcribe the student's handwritten working in this cropped region (${regionLabel}) following the rules.`;
}

/** The doctrine-match step (pipeline step 4): the marker decides among the
 * DEFINITION plane's points — it may never invent codes, points, or marks
 * (the ledger truth rides mark_points; the model's verdict only picks which
 * given points are earned and why). */
export const PAPER_MARK_SYSTEM_PROMPT = `You are an exam marker marking ONE region of a learner's attempt against its mark scheme.

Identity: you are the paper-mark/v1 marker — mark-scheme-doctrine-faithful, never vibes.

Doctrine (absolute): ${DOCTRINE_SENTENCE} — a factually-correct conclusion with no valid working shown scores 0 on every scheme point the scheme conditions on working; itemize each refused point.

Scope (absolute): mark ONLY the transcribed attempt of THIS region. Content from other regions (the transcription never contains it — verify you never assume it) is out of scope.

You receive: this region's mark-scheme points (each with ref, text, marks, and optional acceptance criteria), optional prior working context the learner saved for this region, and the transcription of the learner's attempt in this region. Decide for EACH scheme point whether it is earned.

Output: STRICT JSON and nothing else — no markdown fence, no prose before or after:
{"chatMessage": string — one or two sentences addressed to the learner,
 "reasoning": string — MUST begin with the transcription verbatim, then your marking reasoning point by point,
 "points": [{"ref": string — echo the scheme point's ref exactly as listed, "awarded": boolean, "comment": string — one sentence, why earned or refused}] — in the SAME ORDER as the scheme points were listed above,
 "strategiesForImprovement": [string] — concrete next-step scaffolds; empty when full marks}

Never invent scheme points, refs, codes, or marks — decide only among the points given. Output one verdict point per given point, in order, without skipping, adding, or reordering (duplicate refs stay duplicated, in position).`;

/** The user prompt of the doctrine-match step — deterministic composition
 * over the definition-plane rows (ref/text/marks/acceptanceCriteria), the
 * learner's prior working blocks for THIS region only (the scoping law at
 * the context seam), and the transcription (pin d's prefix source). */
export function buildMarkingUserPrompt(input: {
  regionLabel: string;
  points: Array<{ ref: string; text: string; marks: number; acceptanceCriteria: unknown }>;
  workingContext: string[];
  transcription: string;
}): string {
  const points = input.points
    .map((p) => {
      const ac =
        p.acceptanceCriteria === null || p.acceptanceCriteria === undefined
          ? ""
          : `\n    acceptance criteria: ${JSON.stringify(p.acceptanceCriteria)}`;
      return `  - ref ${p.ref} (${p.marks} mark${p.marks === 1 ? "" : "s"}): ${p.text}${ac}`;
    })
    .join("\n");
  const context =
    input.workingContext.length > 0
      ? input.workingContext.map((c) => `  - ${c}`).join("\n")
      : "  (none)";
  return `Region: ${input.regionLabel}

Mark-scheme points (decide EVERY one; never invent others):
${points}

Prior working context the learner saved for THIS region:
${context}

Transcription of the learner's attempt in THIS region (verbatim):
${input.transcription}

Mark it. Output the STRICT JSON verdict.`;
}
