/**
 * Transcription contract pins (T-MIG-049) — acceptance baseline is the
 * Java declaration (frozen syllabai-core @ 6cad6ef; TranscriptionController,
 * AnswerInputTranscriptionService). Binding truth is minimal (no bean
 * validation on the request record) — the service ladder is pinned as
 * exported constants + these tests.
 */
import { describe, expect, it } from "bun:test";
import {
  TRANSCRIPTION_ALLOWED_MIME_TYPES,
  TRANSCRIPTION_MAX_DECODED_BYTES,
  TRANSCRIPTION_MESSAGE_BAD_BASE64,
  TRANSCRIPTION_MESSAGE_EMPTY_PAYLOAD,
  TRANSCRIPTION_MESSAGE_IMAGE_REQUIRED,
  TRANSCRIPTION_MESSAGE_NOTHING_READABLE,
  TRANSCRIPTION_MESSAGE_TOO_LARGE,
  TRANSCRIPTION_MESSAGE_UNAVAILABLE,
  TRANSCRIPTION_MESSAGE_UNSUPPORTED_MIME,
  transcriptionRequestSchema,
  transcriptionViewSchema,
} from "./transcription";

describe("policy constants (AnswerInputTranscriptionService :44-47)", () => {
  it("mime allowlist is exactly {image/png, image/jpeg, image/webp}", () => {
    expect(TRANSCRIPTION_ALLOWED_MIME_TYPES).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("decoded-size cap is 4 MiB", () => {
    expect(TRANSCRIPTION_MAX_DECODED_BYTES).toBe(4 * 1024 * 1024);
  });
});

describe("frozen verbatim service-ladder messages (:92-159)", () => {
  it("400 family", () => {
    expect(TRANSCRIPTION_MESSAGE_IMAGE_REQUIRED).toBe("image is required");
    expect(TRANSCRIPTION_MESSAGE_UNSUPPORTED_MIME).toBe(
      "unsupported image type (allowed: png, jpeg, webp): <mime>",
    );
    expect(TRANSCRIPTION_MESSAGE_BAD_BASE64).toBe("image payload is not valid base64");
    expect(TRANSCRIPTION_MESSAGE_EMPTY_PAYLOAD).toBe("image payload is empty");
  });

  it("413 template carries both byte counts and the downscale instruction", () => {
    expect(TRANSCRIPTION_MESSAGE_TOO_LARGE).toBe(
      "image is <n> bytes, over the <m> byte cap — downscale it and try again",
    );
  });

  it("503 and 422 messages", () => {
    expect(TRANSCRIPTION_MESSAGE_UNAVAILABLE).toBe(
      "transcription service is unavailable right now, try again shortly",
    );
    expect(TRANSCRIPTION_MESSAGE_NOTHING_READABLE).toBe(
      "we couldn't read any handwriting in that image — write clearly and try again",
    );
  });
});

describe("transcriptionRequestSchema (Controller :72-73 — binding truth only)", () => {
  it("both fields nullable with absent ≡ null (NO bean validation on the record)", () => {
    expect(transcriptionRequestSchema.safeParse({}).success).toBe(true);
    expect(transcriptionRequestSchema.parse({})).toEqual({
      imageBase64: null,
      mimeType: null,
    });
    expect(transcriptionRequestSchema.safeParse({ imageBase64: null, mimeType: null }).success).toBe(
      true,
    );
  });

  it("binding accepts NON-image mime strings and non-base64 text — the service ladder rejects them", () => {
    // "application/pdf" and "not base64" are binding-legal; the 400 lives in
    // the service (:95-104) — the schema must NOT pre-reject them (rule 3:
    // the accept set matches Jackson binding, not the service policy).
    expect(
      transcriptionRequestSchema.safeParse({ imageBase64: "not base64!!", mimeType: "application/pdf" })
        .success,
    ).toBe(true);
  });

  it("rejects non-string field types (Jackson String binding)", () => {
    expect(transcriptionRequestSchema.safeParse({ imageBase64: 42 }).success).toBe(false);
    expect(transcriptionRequestSchema.safeParse({ mimeType: true }).success).toBe(false);
  });
});

describe("transcriptionViewSchema (Controller :76-81)", () => {
  it("accepts the v2-dialect success shape with provider provenance", () => {
    expect(
      transcriptionViewSchema.safeParse({
        text: "The ball rolls $5\\,m$ then stops.",
        provider: "glm",
        model: "glm-4.6v",
        latencyMs: 812,
      }).success,
    ).toBe(true);
  });

  it("all four components serialize on every success — absent rejected", () => {
    expect(
      transcriptionViewSchema.safeParse({ text: "x", provider: "p", model: "m" }).success,
    ).toBe(false);
  });

  it("latencyMs is an integer (Java long)", () => {
    expect(
      transcriptionViewSchema.safeParse({ text: "x", provider: "p", model: "m", latencyMs: 1.5 })
        .success,
    ).toBe(false);
  });
});
