/**
 * T-MIG-034 contract pins — answer-input transcription schemas.
 * The ENVELOPES are contracts; the LLM text inside them is never
 * golden-gated (GOLDEN_MASTER §3) — the schema pins only the wire shape.
 */
import { describe, expect, test } from "bun:test";
import {
  transcriptionRequestSchema,
  transcriptionViewSchema,
  TRANSCRIPTION_ALLOWED_MIME_TYPES,
  TRANSCRIPTION_MAX_DECODED_BYTES,
} from "./answer-input";

describe("answer-input contracts", () => {
  test("transcriptionRequestSchema mirrors the nullable String components", () => {
    expect(
      transcriptionRequestSchema.parse({
        imageBase64: "aGVsbG8=",
        mimeType: "image/png",
      }),
    ).toEqual({ imageBase64: "aGVsbG8=", mimeType: "image/png" });
    // Jackson binding leaves absent keys as null fields — the schema is
    // nullish so {} parses (absent === null) and the route normalizes
    // undefined → null before the service's 400 transcription_bad_request.
    const absent = transcriptionRequestSchema.parse({});
    expect(absent.imageBase64 ?? null).toBeNull();
    expect(absent.mimeType ?? null).toBeNull();
  });

  test("transcriptionRequestSchema rejects array/scalar bodies (binding failures)", () => {
    expect(transcriptionRequestSchema.safeParse([]).success).toBe(false);
    expect(transcriptionRequestSchema.safeParse("hello").success).toBe(false);
    expect(
      transcriptionRequestSchema.safeParse({ imageBase64: 42 }).success,
    ).toBe(false);
  });

  test("transcriptionViewSchema pins the provenance shape (latencyMs integer)", () => {
    expect(
      transcriptionViewSchema.parse({
        text: "F = $ma$",
        provider: "glm-4v",
        model: "glm-4v-plus",
        latencyMs: 812,
      }),
    ).toEqual({ text: "F = $ma$", provider: "glm-4v", model: "glm-4v-plus", latencyMs: 812 });
    expect(
      transcriptionViewSchema.safeParse({
        text: "x",
        provider: "p",
        model: "m",
        latencyMs: 1.5,
      }).success,
    ).toBe(false);
  });

  test("service constants match the frozen sources exactly", () => {
    expect(TRANSCRIPTION_ALLOWED_MIME_TYPES).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    expect(TRANSCRIPTION_MAX_DECODED_BYTES).toBe(4 * 1024 * 1024);
  });
});
