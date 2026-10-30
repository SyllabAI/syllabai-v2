/**
 * PaperMarking — the crop-then-mark pipeline (T-MG-CROPMARK-1 run-001).
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.4 (the markQuestionRegion
 * equivalent) over the Phase-1/2 planes of record.
 *
 * PIPELINE (plan §3.4, five steps of record):
 *   (1) receive {regionId, imageDataUrl} + carry the learner's
 *       mark_working_blocks context if any;
 *   (2) resolve the region → its mark_points definition rows (the
 *       questionPartId join — our advantage; question regions ride the
 *       question's HIGHEST question_version's scheme);
 *   (3) vision-transcribe the cropped image (the §1.8 law: the
 *       transcription text IS part of the output, never a hidden
 *       intermediate);
 *   (4) doctrine-match against mark_points text/acceptanceCriteria (the
 *       paper-mark/v1 identity lives in prompt.ts OF THIS MODULE — the
 *       tutor identity is zero-touch);
 *   (5) write mark_awards (+ working blocks) and publish the evidence
 *       event — THROUGH the Phase-2 write site of record
 *       (PaperAwards.recordRegionAwards → the DC-7 claim-before-write
 *       once-only publisher; plan §3.2: "Phase 4's pipeline writes here").
 *
 * ANTI-HALLUCINATION LAW (the definition-join advantage): the model never
 * mints ledger truth. The verdict may only reference the refs GIVEN from
 * mark_points; each verdict point is joined back to its definition row and
 * the award row's code/score/maxScore/ordinal/markPointId come from the
 * DEFINITION plane (score = marks when awarded, else 0 — the Phase-2
 * write-side score law). A verdict referencing an unknown ref, missing a
 * given point, or failing to parse is an HONEST pipeline failure — never
 * fabricated awards.
 *
 * SCOPING LAW (pin b): enforced by construction — the pipeline feeds the
 * transcriber and the marker ONLY this region's crop, this region's
 * definition rows, and THIS learner's prior working blocks for THIS
 * regionKey. The two-region integration test (test/paper-marking/
 * scoping.test.ts) holds every seam to it: ink from region A is invisible
 * to region B's marking.
 *
 * TRANSCRIPTION-FIRST LAW (pin d): feedback.thoughtProcess begins with the
 * transcribed answer — the prompt instructs it AND the pipeline enforces
 * it (a verdict reasoning missing the verbatim prefix gets it prepended;
 * the ledger never stores a thoughtProcess that does not begin with the
 * transcription).
 *
 * LONG-RUNNING POSTURE (plan §3.4): the routes are 202 + poll (retry: 0
 * per their offline class). The registry is IN-PROCESS and NON-DURABLE —
 * disclosed: a process restart loses queued/running jobs (the poll then
 * 404s honestly); a re-mark is a NEW job whose award writes are absorbed
 * by the once-only claim.
 */
import {
  paperMarkPollResponseSchema,
  type MarkAwardWrite,
  type PaperMarkPollResponse,
} from "@syllabai/contracts";
import type { PaperAwards, ResolvedRegion } from "../paper-awards";
import type { TranscriptionProvider } from "../answer-input/service";
import {
  PIPELINE_VERSION,
  buildCropTranscriptionUserPrompt,
  buildMarkingUserPrompt,
  CROP_TRANSCRIPTION_SYSTEM_PROMPT,
  PAPER_MARK_SYSTEM_PROMPT,
} from "./prompt";
import type { MarkPointRow, SqlFn, WorkingBlockRow } from "./sql";

// ── the model seams (deterministic fakes in tests; CI stays model-free) ─────

/** The doctrine-match LLM seam — the composition root adapts the ONE
 * FailoverLlmChain of record onto this port (the chainAsFeedbackLlm
 * shape); null = dormant (the zero-key boot posture) → the job fails
 * honestly. */
export interface PaperMarkingLlm {
  generate(req: {
    system: string;
    user: string;
    temperature: number;
    maxTokens: number;
  }): Promise<{ text: string }>;
}

// ── honest failure taxonomy (job-failure codes of record) ───────────────────

export interface PipelineErrorShape {
  status: number;
  code: string;
  message: string;
}

export class PipelineError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(shape: PipelineErrorShape) {
    super(shape.message);
    this.status = shape.status;
    this.code = shape.code;
  }
}

/** 400 — the imageDataUrl payload is unreadable (mime/base64/empty). */
export const cropMalformed = (detail: string) =>
  new PipelineError({ status: 400, code: "crop_malformed", message: detail });

/** 413 — the decoded crop is over the byte cap. */
export const cropTooLarge = (actual: number, cap: number) =>
  new PipelineError({
    status: 413,
    code: "crop_too_large",
    message: `crop is ${actual} bytes, over the ${cap} byte cap — downscale it and try again`,
  });

/** 422 — the crop reached the model but holds no handwritten work. */
export const cropNothingReadable = () =>
  new PipelineError({
    status: 422,
    code: "transcription_nothing_readable",
    message: "we couldn't read any handwriting in that region — write clearly and try again",
  });

/** 503 — the vision/transcription seam is dormant or exhausted. */
export const transcriptionUnavailable = () =>
  new PipelineError({
    status: 503,
    code: "transcription_unavailable",
    message: "transcription service is unavailable right now, try again shortly",
  });

/** 503 — the doctrine-match LLM seam is dormant or exhausted. */
export const markingUnavailable = () =>
  new PipelineError({
    status: 503,
    code: "marking_unavailable",
    message: "marking service is unavailable right now, try again shortly",
  });

/** 502 — the marker's output failed the verdict law (unparseable, unknown
 * ref, missing point). HONEST failure — never fabricated awards. */
export const markingOutputInvalid = (detail: string) =>
  new PipelineError({ status: 502, code: "marking_output_invalid", message: detail });

// ── the imageDataUrl wire law (the answer-input posture, fences independent) ─

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** MAX_CROP_DECODED_BYTES — the answer-input transcription cap law (the
 * crop is SMALLER than a photo by construction — the cap stays the same
 * honest ceiling). */
export const MAX_CROP_DECODED_BYTES = 4 * 1024 * 1024;

/** Split the data URL into its mime + strict-base64 payload. Throws the
 * honest cropMalformed — never a fabricated fallback. */
export function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw cropMalformed("imageDataUrl must be a data:image/(png|jpeg|webp);base64 URL");
  const mimeType = match[1]!;
  const base64 = match[2]!;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw cropMalformed(`unsupported image type: ${mimeType}`);
  if (!isStandardBase64(base64)) throw cropMalformed("image payload is not valid base64");
  const decoded = Buffer.from(base64, "base64");
  if (decoded.length === 0) throw cropMalformed("image payload is empty");
  if (decoded.length > MAX_CROP_DECODED_BYTES) throw cropTooLarge(decoded.length, MAX_CROP_DECODED_BYTES);
  return { mimeType, base64 };
}

/** The STRICT base64 law — the answer-input posture verbatim (structural
 * duplicate; the fences stay independent): Node's Buffer decoder is
 * lenient (skips garbage), so the alphabet + length quantum are checked
 * explicitly BEFORE trusting the byte count. */
function isStandardBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

// ── the verdict law (the model-output shape; validated, never trusted) ──────

export interface MarkVerdictPoint {
  ref: string;
  awarded: boolean;
  comment: string;
}

export interface MarkVerdict {
  chatMessage: string;
  reasoning: string;
  points: MarkVerdictPoint[];
  strategiesForImprovement: string[];
}

/** The honest parse: strip ONE surrounding code fence if present (models
 * add them despite the instruction — the parse is tolerant THERE and
 * strict EVERYWHERE else), JSON.parse, then validate the verdict shape by
 * hand (no schema drift — every failure is a marking_output_invalid). */
export function parseVerdict(raw: string): MarkVerdict {
  const text = raw.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw markingOutputInvalid("marker output is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw markingOutputInvalid("marker output is not a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  const chatMessage = o.chatMessage;
  const reasoning = o.reasoning;
  const points = o.points;
  const strategies = o.strategiesForImprovement;
  if (typeof chatMessage !== "string" || chatMessage.trim().length === 0) {
    throw markingOutputInvalid("verdict.chatMessage must be a non-empty string");
  }
  if (typeof reasoning !== "string" || reasoning.trim().length === 0) {
    throw markingOutputInvalid("verdict.reasoning must be a non-empty string");
  }
  if (!Array.isArray(points) || points.length === 0) {
    throw markingOutputInvalid("verdict.points must be a non-empty array");
  }
  const cleaned: MarkVerdictPoint[] = points.map((p, i) => {
    if (p === null || typeof p !== "object" || Array.isArray(p)) {
      throw markingOutputInvalid(`verdict.points[${i}] is not an object`);
    }
    const q = p as Record<string, unknown>;
    if (typeof q.ref !== "string" || q.ref.length === 0) {
      throw markingOutputInvalid(`verdict.points[${i}].ref must be a non-empty string`);
    }
    if (typeof q.awarded !== "boolean") {
      throw markingOutputInvalid(`verdict.points[${i}].awarded must be a boolean`);
    }
    if (typeof q.comment !== "string") {
      throw markingOutputInvalid(`verdict.points[${i}].comment must be a string`);
    }
    return { ref: q.ref, awarded: q.awarded, comment: q.comment };
  });
  if (
    !Array.isArray(strategies) ||
    strategies.some((s) => typeof s !== "string")
  ) {
    throw markingOutputInvalid("verdict.strategiesForImprovement must be an array of strings");
  }
  return {
    chatMessage,
    reasoning,
    points: cleaned,
    strategiesForImprovement: strategies as string[],
  };
}

// ── the plan (route-time resolution: region + definition census) ────────────

export interface MarkPlan {
  resolution: ResolvedRegion;
  regionLabel: string;
  definitions: MarkPointRow[];
  page: number | null;
}

// ── the run result (the poll snapshot's succeeded payload) ──────────────────

export interface MarkRunResult {
  pipelineVersion: string;
  documentRefType: "paper_asset";
  documentRefId: string;
  regionKey: string;
  transcription: string;
  feedback: MarkAwardWrite["feedback"];
  awards: MarkAwardWrite[];
  receipt: { emitted: number; suppressed: number; workingBlocks: number };
}

// ── the in-process job registry (the 202 + poll posture) ────────────────────

export type MarkJobSnapshot = PaperMarkPollResponse;

export class MarkJobRegistry {
  private readonly jobs = new Map<string, MarkJobSnapshot>();
  private readonly inflight: Promise<void>[] = [];

  /**
   * Enqueue the run; the markId IS the poll handle. The registry owns the
   * lifecycle transitions (queued → running → succeeded | failed) and the
   * honest error mapping (any PipelineError keeps its code; anything else
   * becomes the generic internal failure — messages never leak internals).
   */
  enqueue(run: (markId: string) => Promise<MarkRunResult>): string {
    const markId = crypto.randomUUID();
    const queuedAt = new Date().toISOString();
    this.jobs.set(markId, { markId, status: "queued", queuedAt, completedAt: null });
    const p = (async () => {
      this.jobs.set(markId, { markId, status: "running", queuedAt, completedAt: null });
      try {
        const result = await run(markId);
        this.jobs.set(markId, {
          markId,
          status: "succeeded",
          queuedAt,
          completedAt: new Date().toISOString(),
          pipelineVersion: result.pipelineVersion,
          documentRefType: result.documentRefType,
          documentRefId: result.documentRefId,
          regionKey: result.regionKey,
          transcription: result.transcription,
          feedback: result.feedback,
          // the ASSEMBLED rows (the job's view of what was written) — the
          // per-award ledger ids are the CLAIM's gen_random_uuid() outputs,
          // served by the Phase-2 ledger read, never fabricated here.
          awards: result.awards.map((a) => ({
            code: a.code,
            awarded: a.awarded,
            score: a.score,
            maxScore: a.maxScore,
            ordinal: a.ordinal,
            markPointId: a.markPointId ?? null,
            page: a.page ?? null,
          })),
          receipt: result.receipt,
        });
      } catch (err) {
        const shape: PipelineErrorShape =
          err instanceof PipelineError
            ? { status: err.status, code: err.code, message: err.message }
            : {
                status: 500,
                code: "marking_failed",
                message: "the marking run failed — no awards were written",
              };
        this.jobs.set(markId, {
          markId,
          status: "failed",
          queuedAt,
          completedAt: new Date().toISOString(),
          error: { code: shape.code, message: shape.message },
        });
      }
    })();
    this.inflight.push(p.catch(() => undefined));
    return markId;
  }

  /** The poll: a frozen snapshot or null (unknown markId — honest 404). */
  poll(markId: string): MarkJobSnapshot | null {
    const snap = this.jobs.get(markId);
    return snap ? (structuredClone(snap) as MarkJobSnapshot) : null;
  }

  /** Test/drain seam: resolves when every enqueued run has settled. */
  async waitAll(): Promise<void> {
    await Promise.all(this.inflight);
  }
}

// ── the service ──────────────────────────────────────────────────────────────

export class PaperMarking {
  constructor(
    private readonly sql: SqlFn,
    private readonly awards: PaperAwards,
    private readonly transcriber: TranscriptionProvider | null,
    private readonly markingLlm: PaperMarkingLlm | null,
  ) {}

  /**
   * Pipeline step (2): resolve the region and its definition rows. The
   * region bridge is the Phase-2 resolveRegion OF RECORD (one bridge law,
   * one source); unknown region → 404 (the T-C20 envelope); a region with
   * no mark_points rows is honestly UNMARKABLE (422 no_mark_points — the
   * plan §5.6 honest-empty posture: regions for papers without ingested
   * parts cannot be marked until the parts land).
   */
  async plan(regionId: string): Promise<MarkPlan> {
    const resolution = await this.awards.resolveRegion(regionId); // 404 unknown
    const definitions = await this.definitionsFor(regionId, resolution.questionPartId);
    if (definitions.length === 0) {
      throw new PipelineError({
        status: 422,
        code: "no_mark_points",
        message: `region ${regionId} has no mark_points definition rows — it cannot be marked yet`,
      });
    }
    const page = await this.regionPage(definitions);
    // the human label of record IS the regionKey (the derived identity the
    // ledger serves — plan §3.1's one label law; no re-derivation).
    return { resolution, regionLabel: resolution.regionKey, definitions, page };
  }

  /**
   * The crop channel (plan §3.4 step 1): transcribe → doctrine-match →
   * assemble → write through the Phase-2 site. Throws PipelineError only
   * (the registry maps everything else honestly).
   */
  async markRegion(input: { learnerId: string; plan: MarkPlan; imageDataUrl: string }): Promise<MarkRunResult> {
    const { mimeType, base64 } = parseImageDataUrl(input.imageDataUrl);
    const transcription = await this.transcribe(input.plan.regionLabel, mimeType, base64);
    return this.matchAndWrite({
      learnerId: input.learnerId,
      plan: input.plan,
      transcription,
      working: { kind: "ink", content: this.inkBlockContent(input.plan, transcription, mimeType, base64.length) },
    });
  }

  /**
   * The typed channel (plan §3.4): the learner's typed answer IS the
 * transcription — no vision step; the same doctrine-match + ledger write
   * runs beneath it. The answerHtml rides the working block verbatim.
   */
  async regradePart(input: { learnerId: string; plan: MarkPlan; answerHtml: string }): Promise<MarkRunResult> {
    return this.matchAndWrite({
      learnerId: input.learnerId,
      plan: input.plan,
      transcription: input.answerHtml,
      working: { kind: "text", content: { answerHtml: input.answerHtml } },
    });
  }

  // ── steps 3-5, shared by both channels ────────────────────────────────────

  private async matchAndWrite(input: {
    learnerId: string;
    plan: MarkPlan;
    transcription: string;
    working: { kind: "ink" | "text" | "structure"; content: unknown };
  }): Promise<MarkRunResult> {
    const { plan, transcription } = input;

    // step 1 (context seam): the learner's prior working blocks for THIS
    // region only — the scoping law at the context seam (pin b).
    const context = await this.workingContext(
      input.learnerId,
      plan.resolution.documentRefType,
      plan.resolution.documentRefId,
      plan.resolution.regionKey,
    );

    // step 4: doctrine-match against the definition rows.
    if (this.markingLlm === null) throw markingUnavailable();
    const verdictRaw = await this.markingLlm
      .generate({
        system: PAPER_MARK_SYSTEM_PROMPT,
        user: buildMarkingUserPrompt({
          regionLabel: plan.regionLabel,
          points: plan.definitions.map((d) => ({
            ref: d.ref ?? `p${d.ordering + 1}`,
            text: d.text,
            marks: d.marks,
            acceptanceCriteria: d.acceptance_criteria ?? null,
          })),
          workingContext: context,
          transcription,
        }),
        temperature: 0,
        maxTokens: 1_600,
      })
      .catch(() => {
        throw markingUnavailable();
      });
    const verdict = parseVerdict(verdictRaw.text);

    // the definition-join law: the verdict is POSITION-joined to the
    // definition rows (mark_points refs are NOT unique — the observed
    // P1/P1 duplicates are ordinal-disambiguated, plan §3.2) — the model
    // ECHOES each given ref in the given ORDER, and the echo is verified:
    // the count must EQUAL the region's definition count (no silent drops,
    // no double marks) and each echoed ref must match its position (no
    // hallucinated points) — any violation is an honest
    // marking_output_invalid.
    if (verdict.points.length !== plan.definitions.length) {
      throw markingOutputInvalid(
        `verdict decided ${verdict.points.length} point(s) but the region holds ${plan.definitions.length}`,
      );
    }

    const joined = verdict.points.map((p, ordinal) => {
      const row = plan.definitions[ordinal]!; // the equality check above guarantees it
      const expectedRef = row.ref ?? `p${row.ordering + 1}`;
      if (p.ref !== expectedRef) {
        throw markingOutputInvalid(
          `verdict point ${ordinal} echoes ref ${p.ref} but the scheme lists ${expectedRef}`,
        );
      }
      return { p, row, ordinal };
    });

    // step 5: assemble the award rows — ledger truth from the DEFINITION
    // plane (code/score/maxScore/ordinal/markPointId), voice from the
    // verdict; feedback per the observed decomposition; thoughtProcess
    // transcription-first (pin d — the enforcement, not just the prompt).
    const thoughtProcess = verdict.reasoning.startsWith(transcription)
      ? verdict.reasoning
      : `${transcription}\n\n${verdict.reasoning}`;
    const pointsScored = joined
      .filter(({ p }) => p.awarded)
      .map(({ row, p }) => this.pointLabel(row, p.comment));
    const pointsNotScored = joined
      .filter(({ p }) => !p.awarded)
      .map(({ row, p }) => this.pointLabel(row, p.comment));
    const feedback: MarkAwardWrite["feedback"] = {
      attempt: transcription,
      chatMessage: verdict.chatMessage,
      pointsScored,
      pointsNotScored,
      thoughtProcess,
      strategiesForImprovement: verdict.strategiesForImprovement,
    };

    const awardWrites: MarkAwardWrite[] = joined.map(({ p, row, ordinal }, i) => {
      return {
        code: row.ref ?? `P${row.ordering + 1}`,
        awarded: p.awarded,
        score: p.awarded ? row.marks : 0,
        maxScore: row.marks,
        ordinal,
        markPointId: row.id,
        page: plan.page,
        feedback,
        // ONE working block per marking run — the evidence is REGION-grain
        // (the crop/transcription belongs to the region, not to one point);
        // it rides the FIRST assembled row. A suppressed re-fire (row 0's
        // claim lost) writes NO block — the once-only ordering of the
        // Phase-2 publisher handles it.
        working: i === 0 ? input.working : undefined,
      };
    });

    // step 5 (the write site of record): the Phase-2 bridge + the DC-7
    // claim-before-write once-only publisher — "Phase 4's pipeline writes
    // here" (plan §3.2). Suppressed re-fires are counted, never errors.
    const receipt = await this.awards.recordRegionAwards({
      learnerId: input.learnerId,
      resolution: plan.resolution,
      pipelineVersion: PIPELINE_VERSION,
      awards: awardWrites,
    });

    return {
      pipelineVersion: PIPELINE_VERSION,
      documentRefType: plan.resolution.documentRefType,
      documentRefId: plan.resolution.documentRefId,
      regionKey: plan.resolution.regionKey,
      transcription,
      feedback,
      awards: awardWrites,
      receipt: {
        emitted: receipt.emitted,
        suppressed: receipt.suppressed,
        workingBlocks: receipt.workingBlocks,
      },
    };
  }

  // ── step 3: vision transcription of the crop ─────────────────────────────

  private async transcribe(regionLabel: string, mimeType: string, base64: string): Promise<string> {
    if (this.transcriber === null) throw transcriptionUnavailable();
    let response;
    try {
      response = await this.transcriber.generate({
        systemPrompt: CROP_TRANSCRIPTION_SYSTEM_PROMPT,
        userPrompt: buildCropTranscriptionUserPrompt(regionLabel),
        temperature: 0,
        maxTokens: 900,
        media: { base64, mimeType },
      });
    } catch {
      // LlmProviderException catch parity — the message is NOT leaked.
      throw transcriptionUnavailable();
    }
    const text = (response.text ?? "").trim();
    if (text.length === 0 || text.toLowerCase() === "[empty]") throw cropNothingReadable();
    return text;
  }

  // ── the definition plane (step 2) + context seam (step 1) queries ─────────

  /** mark_points for a PART region: the direct questionPartId join (our
   * advantage). Deterministic: ordering asc, id asc. */
  private async partDefinitions(partId: string): Promise<MarkPointRow[]> {
    return (await this.sql`
      select mp.id, mp.ref, mp.ordering, mp.text, mp.marks, mp.acceptance_criteria
      from mark_points mp
      where mp.question_part_id = ${partId}
      order by mp.ordering asc, mp.id asc
    `) as unknown as MarkPointRow[];
  }

  /** mark_points for a QUESTION region: the scheme of the question's
   * HIGHEST question_version (the version int is the currency law; the
   * (question_id, version desc) index is of record). Deterministic:
   * ordering asc, id asc. */
  private async questionDefinitions(questionId: string): Promise<MarkPointRow[]> {
    return (await this.sql`
      select mp.id, mp.ref, mp.ordering, mp.text, mp.marks, mp.acceptance_criteria
      from mark_points mp
      join mark_schemes ms on ms.id = mp.mark_scheme_id
      join question_versions v on v.id = ms.question_version_id
      where v.question_id = ${questionId}
        and v.version = (
          select max(v2.version) from question_versions v2 where v2.question_id = ${questionId}
        )
      order by mp.ordering asc, mp.id asc
    `) as unknown as MarkPointRow[];
  }

  private async definitionsFor(regionId: string, questionPartId: string | null): Promise<MarkPointRow[]> {
    return questionPartId === null
      ? this.questionDefinitions(regionId)
      : this.partDefinitions(questionPartId);
  }

  /** The award-row page: min page over the definition rows' rects (null
   * when the region carries no rect grounds). The fleet's `= any(${ids}::uuid[])`
   * array law (teacher-assignments/classroom precedent). */
  private async regionPage(definitions: MarkPointRow[]): Promise<number | null> {
    if (definitions.length === 0) return null;
    const ids = definitions.map((d) => d.id);
    const hits = (await this.sql`
      select min(r.page) as page
      from mark_point_rects r
      where r.mark_point_id = any(${ids}::uuid[])
    `) as unknown as Array<{ page: number | null }>;
    return hits.length > 0 ? (hits[0]!.page ?? null) : null;
  }

  /** mark_working_blocks for (learner, doc, region) — the plan §3.4 step 1
   * context carry. Deterministic: created_at asc, id asc, capped at 10
   * (the prompt is context, not a transcript). */
  private async workingContext(
    learnerId: string,
    documentRefType: string,
    documentRefId: string,
    regionKey: string,
  ): Promise<string[]> {
    const rows = (await this.sql`
      select id, kind, content, created_at
      from mark_working_blocks
      where learner_id = ${learnerId}
        and document_ref_type = ${documentRefType}
        and document_ref_id = ${documentRefId}
        and region_key = ${regionKey}
      order by created_at asc, id asc
      limit 10
    `) as unknown as WorkingBlockRow[];
    return rows.map((r) => {
      const content = typeof r.content === "string" ? r.content : JSON.stringify(r.content ?? null);
      return `${r.created_at} (${r.kind}): ${content.slice(0, 400)}`;
    });
  }

  /** The ink working-block content — the evidence pointer's payload law:
   * the transcription + crop provenance (NEVER the raw base64 — the block
   * is context/evidence metadata, not an image store). */
  private inkBlockContent(
    plan: MarkPlan,
    transcription: string,
    mimeType: string,
    base64Bytes: number,
  ): unknown {
    return {
      regionKey: plan.resolution.regionKey,
      regionLabel: plan.regionLabel,
      transcription,
      crop: { mimeType, decodedBytes: base64Bytes },
    };
  }

  /** The pointsScored/pointsNotScored itemization law (observed §1.7: 1:1
   * against the mark points) — "ref: text — comment" at the definition
   * grain, bounded. */
  private pointLabel(row: MarkPointRow, comment: string): string {
    const ref = row.ref ?? `p${row.ordering + 1}`;
    const text = row.text.length > 160 ? `${row.text.slice(0, 157)}...` : row.text;
    const c = comment.length > 200 ? `${comment.slice(0, 197)}...` : comment;
    return `${ref}: ${text} — ${c}`;
  }
}
