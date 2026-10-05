/**
 * T-MIG-034 behavioural gates — AnswerInputTranscriptionService port.
 * LLM-OUTPUT surface: NOT golden-gated (GOLDEN_MASTER §3); every pin here
 * is a DETERMINISTIC law of the validation shell or the dormant seam.
 * Message strings are load-bearing (error envelopes carry them verbatim).
 */
import { describe, expect, test } from "bun:test";
import {
  AnswerInputTranscriptionService,
  MAX_DECODED_BYTES,
  TRANSCRIPTION_SYSTEM_PROMPT,
  isStandardBase64,
  TranscriptionBadRequestError,
  TranscriptionImageTooLargeError,
  TranscriptionNothingReadableError,
  TranscriptionUnavailableError,
  type TranscriptionProvider,
} from "../../src/services/answer-input/service";

const PNG = "iVBORw0KGgo="; // 8 bytes of PNG magic, valid standard base64

function okProvider(text = "F = $ma$ the net force"): TranscriptionProvider {
  return {
    generate: async () => ({
      text,
      providerName: "glm-4v",
      model: "glm-4v-plus",
      latencyMs: 812,
    }),
  };
}

function failingProvider(): TranscriptionProvider {
  return {
    generate: async () => {
      throw new Error("provider exploded (message must NOT leak)");
    },
  };
}

describe("transcription validation shell (frozen law)", () => {
  test("null/blank image -> 400 'image is required'", async () => {
    const svc = new AnswerInputTranscriptionService(null);
    for (const image of [null, "", "   "]) {
      try {
        await svc.transcribe(image as string | null, "image/png");
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(TranscriptionBadRequestError);
        expect((e as Error).message).toBe("image is required");
      }
    }
  });

  test("mime whitelist BEFORE the provider call (cost guard)", async () => {
    const svc = new AnswerInputTranscriptionService(null);
    for (const mime of ["image/gif", "application/pdf", null, "IMAGE/PNG"] as Array<string | null>) {
      try {
        await svc.transcribe(PNG, mime);
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(TranscriptionBadRequestError);
        expect((e as Error).message).toBe(
          `unsupported image type (allowed: png, jpeg, webp): ${mime}`,
        );
      }
    }
  });

  test("strict standard-alphabet base64 law", async () => {
    const svc = new AnswerInputTranscriptionService(null);
    for (const bad of ["not base64!!", "abc", "aGVsbG8", "====", "QQ==\n"]) {
      try {
        await svc.transcribe(bad, "image/png");
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(TranscriptionBadRequestError);
        expect((e as Error).message).toBe("image payload is not valid base64");
      }
    }
    expect(isStandardBase64(PNG)).toBe(true);
    expect(isStandardBase64("AB==")).toBe(true);
  });

  test("empty-decode branch is defensive: blank input hits the FIRST law", async () => {
    const svc = new AnswerInputTranscriptionService(null);
    // Any non-blank valid base64 quantum decodes to >= 1 byte, so the Java
    // "image payload is empty" branch is defensive-only; a blank payload
    // never reaches it ("image is required" wins, ordering pinned).
    try {
      await svc.transcribe("", "image/png");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("image is required");
    }
  });

  test("over-cap decode -> 413 with the frozen message shape", async () => {
    const svc = new AnswerInputTranscriptionService(null);
    const big = Buffer.alloc(MAX_DECODED_BYTES + 1).toString("base64");
    try {
      await svc.transcribe(big, "image/png");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptionImageTooLargeError);
      expect((e as Error).message).toBe(
        `image is ${MAX_DECODED_BYTES + 1} bytes, over the ${MAX_DECODED_BYTES} byte cap — downscale it and try again`,
      );
    }
  });

  test("DORMANT seam -> 503 with the frozen chain-exhausted message", async () => {
    const svc = new AnswerInputTranscriptionService(null);
    try {
      await svc.transcribe(PNG, "image/png");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptionUnavailableError);
      expect((e as Error).message).toBe(
        "transcription service is unavailable right now, try again shortly",
      );
    }
  });

  test("provider failure -> 503, provider error message NOT leaked", async () => {
    const svc = new AnswerInputTranscriptionService(failingProvider());
    try {
      await svc.transcribe(PNG, "image/png");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptionUnavailableError);
      expect((e as Error).message).toBe(
        "transcription service is unavailable right now, try again shortly",
      );
    }
  });

  test("blank and [empty] (case-insensitive) model output -> 422", async () => {
    for (const text of [null, "", "   ", "[empty]", "[EMPTY]"] as Array<string | null>) {
      const svc = new AnswerInputTranscriptionService(okProvider(text ?? ""));
      try {
        await svc.transcribe(PNG, "image/png");
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(TranscriptionNothingReadableError);
        expect((e as Error).message).toBe(
          "we couldn't read any handwriting in that image — write clearly and try again",
        );
      }
    }
  });

  test("success pass-through carries the v2 text + provenance verbatim", async () => {
    const svc = new AnswerInputTranscriptionService(okProvider());
    const view = await svc.transcribe(PNG, "image/png");
    expect(view).toEqual({
      text: "F = $ma$ the net force",
      provider: "glm-4v",
      model: "glm-4v-plus",
      latencyMs: 812,
    });
  });

  test("NOT a persistence surface: the service holds no sql and the provider receives the media", async () => {
    let seen: unknown = null;
    const provider: TranscriptionProvider = {
      generate: async (req) => {
        seen = req;
        return { text: "x", providerName: "p", model: "m", latencyMs: 1 };
      },
    };
    const svc = new AnswerInputTranscriptionService(provider);
    await svc.transcribe(PNG, "image/png");
    const req = seen as { media: { base64: string; mimeType: string }; temperature: number; maxTokens: number };
    expect(req.media.base64).toBe(PNG);
    expect(req.media.mimeType).toBe("image/png");
    // frozen chain options: temperature 0 (read-back, not generation), 700 tokens
    expect(req.temperature).toBe(0);
    expect(req.maxTokens).toBe(700);
  });

  test("the frozen v2 system prompt is carried VERBATIM (provider-lane contract)", () => {
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain("$\\frac{d}{dx}$");
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain("output exactly: [empty]");
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain("do not correct, complete, solve, or add anything");
  });
});
