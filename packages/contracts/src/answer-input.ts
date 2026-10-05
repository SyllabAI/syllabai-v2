/**
 * Answer-input transcription contracts — ported from the frozen Java core
 * (syllabai-core @ 6cad6ef, frozen; ported by T-MIG-034, 2026-10-05).
 *
 * Sources:
 *   src/main/java/com/syllabai/answerinput/TranscriptionController.java
 *   src/main/java/com/syllabai/answerinput/AnswerInputTranscriptionService.java
 *
 * SURFACE DOCTRINE (operator round-6 directive + GOLDEN_MASTER §3 +
 * docs/MIGRATION_PLAN.md §Risks): transcription is an LLM-OUTPUT surface —
 * its text is nondeterministic and is NEVER golden-gated. The deterministic
 * shell (authz, request validation, provider seam, error mapping) is ported
 * and gated behaviourally. Only the request/response ENVELOPES are contracts.
 *
 * Wire facts verified in the frozen sources (T-MIG-034 evidence):
 *   - TranscriptionRequestView(String imageBase64, String mimeType): both
 *     nullable String components. Jackson binding leaves absent keys as
 *     null fields, so the schema is `.nullish()` (absent === null) and the
 *     ROUTE normalizes undefined → null before the service law runs
 *     (non-object body → malformed_body; scalars coerce to String per
 *     Jackson scalar→String; arrays/objects are binding failures).
 *   - TranscriptionView(String text, String provider, String model, long
 *     latencyMs): all components non-null on the success path (text is
 *     guaranteed non-blank and [empty]-free by the service law; latencyMs is
 *     a Java long → number).
 *   - Error envelopes (GlobalExceptionHandler.java:104-137, exact codes):
 *       BadRequestException           → 400 "transcription_bad_request"
 *       ImageTooLargeException        → 413 "transcription_image_too_large"
 *       NothingReadableException      → 422 "transcription_nothing_readable"
 *       TranscriptionUnavailableException → 503 "transcription_unavailable"
 *     (message = the exception message, carried verbatim from the service).
 *   - NOT a persistence surface: the image is never stored; the returned
 *     text enters an answer only via the learner's own autosave/submit.
 */
import { z } from "zod";

/**
 * TranscriptionRequestView — one base64 image (standard alphabet, NO
 * data-URL prefix) + its mime type. The mime whitelist
 * {image/png, image/jpeg, image/webp} and the 4 MiB decoded-size cap are
 * SERVICE law (enforced before any provider call), not schema law — the
 * schema mirrors the wire shape only, so the service's captured error
 * envelopes stay reachable.
 */
export const transcriptionRequestSchema = z.object({
  imageBase64: z.string().nullish(),
  mimeType: z.string().nullish(),
});
export type TranscriptionRequest = z.infer<typeof transcriptionRequestSchema>;

/** TranscriptionView — the v2-dialect text + provider provenance. */
export const transcriptionViewSchema = z.object({
  text: z.string(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number().int(),
});
export type TranscriptionView = z.infer<typeof transcriptionViewSchema>;

/** Mime whitelist — AnswerInputTranscriptionService.ALLOWED_MIME_TYPES. */
export const TRANSCRIPTION_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Decoded image byte cap — MAX_DECODED_BYTES (≤1600px client downscale). */
export const TRANSCRIPTION_MAX_DECODED_BYTES = 4 * 1024 * 1024;
