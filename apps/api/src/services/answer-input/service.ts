/**
 * Answer-input transcription service — faithful port of
 * AnswerInputTranscriptionService.java (syllabai-core @ 6cad6ef, frozen;
 * T-MIG-034). LLM-OUTPUT surface: the deterministic VALIDATION SHELL is the
 * port; the model call is an injected provider seam, DORMANT by default
 * (T-MIG-032 precedent) — a null provider maps to the same 503
 * transcription_unavailable envelope as the frozen chain-exhausted path
 * (FailoverLlmChain with no vision-capable member).
 *
 * Ported law (frozen source):
 *   - mime whitelist {image/png, image/jpeg, image/webp} BEFORE any provider
 *     call (cost guard), anything else → BadRequest "unsupported image type
 *     (allowed: png, jpeg, webp): <mime>";
 *   - base64 standard alphabet decode (NO data-URL prefix) → invalid →
 *     BadRequest "image payload is not valid base64"; empty decode →
 *     BadRequest "image payload is empty"; null/blank → BadRequest "image
 *     is required";
 *   - decoded size > 4 MiB → ImageTooLarge "image is X bytes, over the Y
 *     byte cap — downscale it and try again";
 *   - provider error → TranscriptionUnavailable "transcription service is
 *     unavailable right now, try again shortly";
 *   - blank text or "[empty]" (case-insensitive) → NothingReadable "we
 *     couldn't read any handwriting in that image — write clearly and try
 *     again" (the model read the image but found no handwritten work);
 *   - success: {text, provider, model, latencyMs} — text is the v2-dialect
 *     transcription (words + $…$ LaTeX), carried verbatim from the provider.
 *
 * NOT a persistence surface: nothing here writes rows — the image is never
 * stored and leaves no artifact beyond the returned text (behavioural pin
 * asserts zero write-shaped queries through any sql the host passes).
 *
 * Error envelopes (GlobalExceptionHandler.java:104-137):
 *   transcription_bad_request 400 · transcription_image_too_large 413 ·
 *   transcription_nothing_readable 422 · transcription_unavailable 503.
 */

/** The provider seam — the LLM-chain lane's surface (dormant by default). */
export interface TranscriptionMedia {
  base64: string;
  mimeType: string;
}

export interface TranscriptionProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  media: TranscriptionMedia;
}

export interface TranscriptionProviderResponse {
  text: string | null;
  providerName: string;
  model: string;
  latencyMs: number;
}

/**
 * The frozen chain's generate() law: resolves with the response or throws
 * LlmProviderException (here: any throw is a provider failure).
 */
export interface TranscriptionProvider {
  generate(request: TranscriptionProviderRequest): Promise<TranscriptionProviderResponse>;
}

export interface Transcription {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
}

/** 400 — malformed request (bad mime, bad base64, empty payload). */
export class TranscriptionBadRequestError extends Error {
  readonly status = 400;
  readonly code = "transcription_bad_request";
}

/** 413 — decoded image over the size cap. */
export class TranscriptionImageTooLargeError extends Error {
  readonly status = 413;
  readonly code = "transcription_image_too_large";
  constructor(actualBytes: number, maxBytes: number) {
    super(
      `image is ${actualBytes} bytes, over the ${maxBytes} byte cap — downscale it and try again`,
    );
  }
}

/** 503 — chain exhausted (no vision-capable provider / all failed) or seam dormant. */
export class TranscriptionUnavailableError extends Error {
  readonly status = 503;
  readonly code = "transcription_unavailable";
}

/** 422 — the model read the image but found no handwritten work. */
export class TranscriptionNothingReadableError extends Error {
  readonly status = 422;
  readonly code = "transcription_nothing_readable";
}

/** ALLOWED_MIME_TYPES — AnswerInputTranscriptionService.java:66-68. */
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** MAX_DECODED_BYTES — ≤1600px, ≤4 MB client downscale (:71). */
export const MAX_DECODED_BYTES = 4 * 1024 * 1024;

/**
 * The frozen TRANSCRIPTION_SYSTEM_PROMPT (answer format v2 policy) — carried
 * VERBATIM (the provider seam is dormant, but the prompt is part of the
 * ported law the LLM-chain lane will bind; trimming it would be drift).
 */
export const TRANSCRIPTION_SYSTEM_PROMPT = `You transcribe a photograph or drawing of a student's handwritten work.

Output rules (absolute):
- Written MATH goes inside inline LaTeX delimiters: $x^2 + 1$, $\\frac{d}{dx}$,
  $\\ce{H2SO4}$ for chemistry. Every formula, expression, equation, or numeric
  working is math — delimit it.
- Written WORDS stay plain text outside the delimiters. Do not output markdown
  structure: no headings, lists, bold/italic markers, tables, or code fences.
- Simple inline symbols in prose may stay Unicode: ² ³ ° ≤ ≥ × ± → ⇌.
- Transcribe only what the student actually wrote. Preserve their wording and
  their working order; do not correct, complete, solve, or add anything.
- If parts are unreadable, transcribe the readable parts and mark each unreadable
  spot with [?].
- If the image contains no handwritten work at all, output exactly: [empty]`;

const USER_PROMPT = "Transcribe the handwritten work in this image following the rules.";

/** Chain temperature 0 — transcription is a read-back, not a generation. */
const TEMPERATURE = 0.0;
const MAX_TOKENS = 700;

export class AnswerInputTranscriptionService {
  constructor(private readonly provider: TranscriptionProvider | null) {}

  async transcribe(base64Image: string | null, mimeType: string | null): Promise<Transcription> {
    if (base64Image === null || base64Image.trim().length === 0) {
      throw new TranscriptionBadRequestError("image is required");
    }
    if (mimeType === null || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new TranscriptionBadRequestError(
        `unsupported image type (allowed: png, jpeg, webp): ${mimeType}`,
      );
    }
    let decoded: Uint8Array;
    try {
      decoded = Buffer.from(base64Image, "base64");
    } catch {
      throw new TranscriptionBadRequestError("image payload is not valid base64");
    }
    // Java Base64.getDecoder() is the STRICT decoder and throws on invalid
    // input; Node's Buffer is lenient (skips garbage) — reproduce the
    // fail-loud law explicitly before trusting the byte count.
    if (!isStandardBase64(base64Image)) {
      throw new TranscriptionBadRequestError("image payload is not valid base64");
    }
    if (decoded.length === 0) {
      throw new TranscriptionBadRequestError("image payload is empty");
    }
    if (decoded.length > MAX_DECODED_BYTES) {
      throw new TranscriptionImageTooLargeError(decoded.length, MAX_DECODED_BYTES);
    }

    if (this.provider === null) {
      // Dormant seam (T-MIG-032 precedent) — the frozen behaviour this
      // mirrors is FailoverLlmChain with no vision-capable member: the
      // chain exhausts and the service translates to 503.
      throw new TranscriptionUnavailableError(
        "transcription service is unavailable right now, try again shortly",
      );
    }
    let response: TranscriptionProviderResponse;
    try {
      response = await this.provider.generate({
        systemPrompt: TRANSCRIPTION_SYSTEM_PROMPT,
        userPrompt: USER_PROMPT,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        media: { base64: base64Image, mimeType },
      });
    } catch {
      // LlmProviderException catch parity — the message is NOT leaked.
      throw new TranscriptionUnavailableError(
        "transcription service is unavailable right now, try again shortly",
      );
    }
    const text = (response.text ?? "").trim();
    if (text.length === 0 || text.toLowerCase() === "[empty]") {
      throw new TranscriptionNothingReadableError(
        "we couldn't read any handwriting in that image — write clearly and try again",
      );
    }
    return {
      text,
      provider: response.providerName,
      model: response.model,
      latencyMs: response.latencyMs,
    };
  }
}

/**
 * Standard-alphabet base64 law (RFC 4648 §4) — Java Base64.getDecoder()
 * strictness: standard alphabet only, length multiple of 4, '=' padding
 * only as a 1–2 char suffix, whitespace/garbage rejected.
 */
export function isStandardBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export interface AnswerInputComponents {
  transcription: AnswerInputTranscriptionService;
}

export function buildAnswerInputModule(
  provider: TranscriptionProvider | null = null,
): AnswerInputComponents {
  return { transcription: new AnswerInputTranscriptionService(provider) };
}
