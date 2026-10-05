/**
 * T-MIG-034 route tests — the observable HTTP contract of
 * POST /api/v1/learners/me/answer-input/transcribe over an IN-MEMORY Hono
 * app (no Neon). Binding envelopes per the frozen handler law + the
 * captured w3-transcribe-unauthed-401 shape; the LLM text itself is never
 * golden-gated — the ENVELOPES are the contract.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createAnswerInputRouter } from "../../src/routes/answer-input";
import { buildAnswerInputModule } from "../../src/services/answer-input";
import type { TranscriptionProvider } from "../../src/services/answer-input/service";

const LEARNER_ID = "aa645313-5930-4381-91ed-caff67a2f836";
const PNG = "iVBORw0KGgo=";

function makeApp(
  auth: (c: Context) => Record<string, unknown> | null,
  provider: TranscriptionProvider | null = null,
) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const a = auth(c);
    if (a) c.set("syllabai.auth" as never, a as never);
    await next();
  });
  const module = buildAnswerInputModule(provider);
  app.route("/api/v1/learners/me/answer-input", createAnswerInputRouter(module));
  return app;
}

const STUDENT = {
  email: "student@example.edu",
  userId: LEARNER_ID,
  roles: ["STUDENT"],
  tokenVersion: 1,
};

describe("POST /api/v1/learners/me/answer-input/transcribe", () => {
  test("unauthenticated -> Boot 401 body (w3-transcribe-unauthed-401 shape, path pinned)", async () => {
    const res = await makeApp(() => null).request("/api/v1/learners/me/answer-input/transcribe", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Unauthorized");
    expect(body.status).toBe(401);
    expect(body.path).toBe("/api/v1/learners/me/answer-input/transcribe");
  });

  test("empty / non-JSON / non-object body -> 400 malformed_body (captured binding law)", async () => {
    const app = makeApp(() => STUDENT);
    for (const body of [undefined, "not json", JSON.stringify([1, 2]), JSON.stringify("scalar")]) {
      const res = await app.request("/api/v1/learners/me/answer-input/transcribe", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      });
      expect(res.status).toBe(400);
      const view = (await res.json()) as Record<string, unknown>;
      expect(view.error).toBe("malformed_body");
      expect(view.message).toBe(
        "request body is not readable (check field types and enum values)",
      );
    }
  });

  test("object-typed fields are binding failures; scalars coerce (Jackson parity)", async () => {
    const app = makeApp(() => STUDENT);
    const arr = await app.request("/api/v1/learners/me/answer-input/transcribe", {
      method: "POST",
      body: JSON.stringify({ imageBase64: ["x"], mimeType: "image/png" }),
      headers: { "content-type": "application/json" },
    });
    expect(arr.status).toBe(400);
    expect(((await arr.json()) as Record<string, unknown>).error).toBe("malformed_body");

    const coerced = await app.request("/api/v1/learners/me/answer-input/transcribe", {
      method: "POST",
      body: JSON.stringify({ imageBase64: 12345, mimeType: true }),
      headers: { "content-type": "application/json" },
    });
    // coercion succeeds → the SERVICE law runs → 400 transcription_bad_request
    // (mime "true" is off the whitelist) — the 400 CODE is the differentiator.
    expect(coerced.status).toBe(400);
    expect(((await coerced.json()) as Record<string, unknown>).error).toBe(
      "transcription_bad_request",
    );
  });

  test("null fields reach the service law -> 400 transcription_bad_request 'image is required'", async () => {
    const res = await makeApp(() => STUDENT).request(
      "/api/v1/learners/me/answer-input/transcribe",
      { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } },
    );
    expect(res.status).toBe(400);
    const view = (await res.json()) as Record<string, unknown>;
    expect(view.error).toBe("transcription_bad_request");
    expect(view.message).toBe("image is required");
  });

  test("DORMANT seam -> 503 transcription_unavailable on a valid request", async () => {
    const res = await makeApp(() => STUDENT).request(
      "/api/v1/learners/me/answer-input/transcribe",
      {
        method: "POST",
        body: JSON.stringify({ imageBase64: "iVBORw0KGgo=", mimeType: "image/png" }),
        headers: { "content-type": "application/json" },
      },
    );
    expect(res.status).toBe(503);
    const view = (await res.json()) as Record<string, unknown>;
    expect(view.error).toBe("transcription_unavailable");
    expect(view.message).toBe(
      "transcription service is unavailable right now, try again shortly",
    );
  });

  test("success -> 200 with the contract-validated view envelope", async () => {
    const provider: TranscriptionProvider = {
      generate: async () => ({
        text: "The area is $\\frac{1}{2}bh$",
        providerName: "glm-4v",
        model: "glm-4v-plus",
        latencyMs: 900,
      }),
    };
    const res = await makeApp(() => STUDENT, provider).request(
      "/api/v1/learners/me/answer-input/transcribe",
      {
        method: "POST",
        body: JSON.stringify({ imageBase64: PNG, mimeType: "image/webp" }),
        headers: { "content-type": "application/json" },
      },
    );
    expect(res.status).toBe(200);
    const view = (await res.json()) as Record<string, unknown>;
    expect(view).toEqual({
      text: "The area is $\\frac{1}{2}bh$",
      provider: "glm-4v",
      model: "glm-4v-plus",
      latencyMs: 900,
    });
  });
});
