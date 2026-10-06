/**
 * Transcription contracts — ported from the frozen Java core (T-MIG-049,
 * the T-MIG-018 next_safe_actions follow-up; operator trace 1a10cb48dc7edd15).
 *
 * Sources (syllabai-core @ 6cad6ef, frozen, raw reads 2026-10-05):
 *   src/main/java/com/syllabai/answerinput/TranscriptionController.java
 *       (/api/v1/learners/me/answer-input — POST /transcribe,
 *        consumes application/json; TranscriptionRequestView :72-73,
 *        TranscriptionView :76-81)
 *   src/main/java/com/syllabai/answerinput/AnswerInputTranscriptionService.java
 *       (validation posture :33-36; ALLOWED_MIME_TYPES :44;
 *        MAX_DECODED_BYTES :47; error ladder :130-159)
 *
 * REQUEST-BINDING LAW: TranscriptionRequestView carries NO jakarta
 * validation — both String components bind null when absent (no @NotNull
 * anywhere), and the request body itself is @RequestBody (required, default)
 * so a MISSING body is 400 before any field is read (Controller :62-65
 * re-checks null defensively). ALL field constraints are service-side:
 *   1. imageBase64 null/blank → 400 "image is required" (:92-94)
 *   2. mimeType null/not in the allowlist → 400 "unsupported image type
 *      (allowed: png, jpeg, webp): <mime>" (:95-98)
 *   3. base64 not decodable (standard alphabet) → 400 "image payload is
 *      not valid base64" (:100-104)
 *   4. decoded empty → 400 "image payload is empty" (:105-107)
 *   5. decoded > 4 MiB → 413 "image is <n> bytes, over the <m> byte cap —
 *      downscale it and try again" (:108-110)
 *   6. chain exhausted / no vision-capable provider → 503 "transcription
 *      service is unavailable right now, try again shortly" (:118-122)
 *   7. model output blank or "[empty]" → 422 "we couldn't read any
 *      handwriting in that image — write clearly and try again"
 *      (:123-126, :154-159)
 * The binding schemas below therefore mirror ONLY the binding truth
 * (nullable strings with Jackson absent≡null), and the service ladder is
 * pinned as exported message constants + tests — the port lane consumes
 * both. Error responses use the advice envelope (errors.ts
 * adviceErrorSchema) with status/error/message/timestamp.
 *
 * NOT a persistence surface: nothing writes rows or evidence — the image
 * is never stored, and the returned text becomes part of the answer only
 * via the learner's own next autosave/submit (Controller :22-24).
 *
 * NO golden captures exist for this surface — acceptance baseline is the
 * Java declaration, pinned in transcription.test.ts.
 */
import { z } from "zod";

// ── policy constants (AnswerInputTranscriptionService.java) ────────────────

/** Image types the adapter can map; anything else rejected pre-call (:44). */
export const TRANSCRIPTION_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Decoded image byte cap — matches the client-side downscale (≤1600px, ≤4 MB) (:47). */
export const TRANSCRIPTION_MAX_DECODED_BYTES = 4 * 1024 * 1024;

/**
 * Frozen verbatim service-ladder messages (port-layer duties — pinned so
 * the strings cannot drift; interpolation sites marked <n>/<m>/<mime>).
 */
export const TRANSCRIPTION_MESSAGE_IMAGE_REQUIRED = "image is required";
export const TRANSCRIPTION_MESSAGE_UNSUPPORTED_MIME =
  "unsupported image type (allowed: png, jpeg, webp): <mime>";
export const TRANSCRIPTION_MESSAGE_BAD_BASE64 = "image payload is not valid base64";
export const TRANSCRIPTION_MESSAGE_EMPTY_PAYLOAD = "image payload is empty";
export const TRANSCRIPTION_MESSAGE_TOO_LARGE =
  "image is <n> bytes, over the <m> byte cap — downscale it and try again";
export const TRANSCRIPTION_MESSAGE_UNAVAILABLE =
  "transcription service is unavailable right now, try again shortly";
export const TRANSCRIPTION_MESSAGE_NOTHING_READABLE =
  "we couldn't read any handwriting in that image — write clearly and try again";

// ── request / response ──────────────────────────────────────────────────────

/**
 * TranscriptionRequestView (Controller :72-73) — binding truth only:
 * both components nullable (absent ≡ null, no bean validation); every
 * acceptance constraint lives in the service ladder above.
 */
export const transcriptionRequestSchema = z.object({
  imageBase64: z.string().nullable().default(null),
  mimeType: z.string().nullable().default(null),
});
export type TranscriptionRequest = z.infer<typeof transcriptionRequestSchema>;

/**
 * TranscriptionView (Controller :76-81) — the v2-dialect text (words +
 * $…$ inline LaTeX) to insert at the caret, plus provider provenance.
 * text guaranteed non-blank and [empty]-free by the service (:87);
 * provider/model come from the winning chain member; latencyMs a Java
 * long. All four serialize on every success — 200 only (POST :51-53).
 */
export const transcriptionViewSchema = z.object({
  text: z.string(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number().int(),
});
export type TranscriptionView = z.infer<typeof transcriptionViewSchema>;
