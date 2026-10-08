/**
 * Chain→port bridge tests (ADR-MIG-0002): the tutor/CLA LlmProvider bridge,
 * the smartmark FeedbackLlm bridge, the transcription provider bridge, and
 * the LlmMarkingCandidateGenerator port — over a chain whose members run on
 * INJECTED fake fetches (no network). Pins the frozen candidate-generation
 * laws @ 6cad6ef: the v3 strict-JSON envelope + clamp-don't-reject over-awards
 * + boolean-`awarded` backward compatibility; the v4 batch envelope (exact
 * count, unique numeric part numbers, whole-batch refusal on any mismatch);
 * the truncation refusal (finish_reason length/max_tokens → TRUNCATED_OUTPUT
 * carrying the raw text); the JSON-body extraction (first '{' … last '}');
 * UUID mark-point validation (a malformed id is a bad CANDIDATE, never an
 * HTTP 400); the completion-budget formula (800 + 400/mark, caps 4k/8k); the
 * temperature 0.1 + reasoning-effort LOW request contract.
 */
import { describe, expect, test } from "bun:test";
import { FailoverLlmChain, buildLlmChain } from "../../src/services/llmchain";
import {
  chainAsCandidateGenerator,
  chainAsFeedbackLlm,
  chainAsLlmProvider,
  chainAsTranscriptionProvider,
  completionBudget,
  batchCompletionBudget,
  isTruncationFinish,
  resolveMarks,
} from "../../src/services/llmchain";
import { OpenAiCompatibleChainMember, GeminiChainMember } from "../../src/services/llmchain/adapters";
import { CandidateGenerationError } from "../../src/services/smartmark";
import type { MarkingContext, MarkingPoint } from "../../src/services/smartmark";

const MEMBER_OPTS = {
  failureThreshold: 3,
  cooldownSeconds: 60,
  dailyBudget: 1000,
  timeoutSeconds: 5,
} as const;

function fetchJson(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function groqChain(body: unknown) {
  const { calls, fetchImpl } = fetchJson(body);
  const member = new OpenAiCompatibleChainMember(
    "groq",
    { apiKey: "gsk", baseUrl: "https://groq.test/v1", model: "groq-model" },
    { ...MEMBER_OPTS, fetchImpl },
  );
  return { chain: new FailoverLlmChain([member]), calls };
}

const POINT_A1: MarkingPoint = {
  id: "11111111-1111-4111-8111-111111111111",
  ref: "a(i)",
  text: "states that the gas expands",
  marks: 2,
  questionPartId: "part-1",
};
const POINT_A2: MarkingPoint = {
  id: "22222222-2222-4222-8222-222222222222",
  ref: "a(ii)",
  text: "gives the squeaky-pop test",
  marks: 1,
  questionPartId: "part-1",
};

function context(overrides: Partial<MarkingContext> = {}): MarkingContext {
  return {
    answer: {
      id: "answer-1",
      attemptId: "attempt-1",
      questionPartId: "part-1",
      answerText: "The gas expands and gives a squeaky pop with a lit splint.",
      label: "(a)",
      partMarks: 3,
    },
    schemeId: "scheme-1",
    schemeValidationState: "VALIDATED",
    points: [POINT_A1, POINT_A2],
    ...overrides,
  };
}

const OK_BODY = (extra: Record<string, unknown> = {}) => ({
  choices: [
    {
      finish_reason: "stop",
      message: {
        content: JSON.stringify({
          confidence: 0.87,
          allocations: [
            { markPointId: POINT_A1.id, ref: "a(i)", marksAwarded: 2, evidence: "expands", rationale: "stated" },
            { markPointId: POINT_A2.id, ref: "a(ii)", marksAwarded: 1, evidence: "squeaky pop", rationale: "stated" },
          ],
          ...extra,
        }),
      },
    },
  ],
});

describe("chainAsLlmProvider — the tutor/CLA bridge", () => {
  test("generate rides the chain (model/provider surfaced for the §22 transcript)", async () => {
    const { chain } = groqChain({ choices: [{ finish_reason: "stop", message: { content: "grounded" } }] });
    const provider = chainAsLlmProvider(chain);
    expect(provider.available()).toBe(true);
    const out = await provider.generate({ system: "s", user: "u", temperature: 0.2, maxTokens: 900 });
    expect(out).toEqual({ text: "grounded", model: "groq-model", providerName: "groq" });
  });

  test("stream rides the chain's stream (deltas in order)", async () => {
    const encoder = new TextEncoder();
    const fetchImpl = (async (_url: unknown, _init?: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"one "}}]}\n\n'));
            c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"two"}}]}\n\n'));
            c.enqueue(encoder.encode("data: [DONE]\n\n"));
            c.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;
    const member = new OpenAiCompatibleChainMember(
      "groq",
      { apiKey: "gsk", baseUrl: "https://groq.test/v1", model: "m" },
      { ...MEMBER_OPTS, fetchImpl },
    );
    const provider = chainAsLlmProvider(new FailoverLlmChain([member]));
    const deltas: string[] = [];
    for await (const d of provider.stream({ system: "s", user: "u", temperature: 0.2, maxTokens: 900 })) {
      deltas.push(d.text);
    }
    expect(deltas).toEqual(["one ", "two"]);
  });

  test("zero-key buildLlmChain → available() false (the dormant posture through the bridge)", () => {
    const provider = chainAsLlmProvider(buildLlmChain({}, { now: () => new Date(0), utcDay: () => "2026-10-08" }));
    expect(provider.available()).toBe(false);
  });
});

describe("chainAsFeedbackLlm — the smart-mark feedback prose bridge", () => {
  test("generate(system, user, temperature) → the chain text; unavailable chain refuses first", async () => {
    const { chain } = groqChain({ choices: [{ finish_reason: "stop", message: { content: "prose" } }] });
    const llm = chainAsFeedbackLlm(chain);
    await expect(llm.generate("sys", "user prompt", 0.3)).resolves.toBe("prose");

    const zeroKey = chainAsFeedbackLlm(
      buildLlmChain({}, { now: () => new Date(0), utcDay: () => "2026-10-08" }),
    );
    expect(zeroKey.available()).toBe(false);
  });
});

describe("chainAsTranscriptionProvider — the vision-routing bridge", () => {
  test("media rides to the chain; latencyMs measured; response shape matches the service law", async () => {
    const { OpenAiCompatibleChainMember: Groq, GeminiChainMember: Gemini } = await import(
      "../../src/services/llmchain/adapters"
    );
    const groqCalls: Array<{ url: string; init: RequestInit }> = [];
    const geminiCalls: Array<{ url: string; init: RequestInit }> = [];
    const groqFetch = (async (url: unknown, init?: RequestInit) => {
      groqCalls.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const geminiFetch = (async (url: unknown, init?: RequestInit) => {
      geminiCalls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "$x^2 + 1$" }] } }] }),
        { status: 200 },
      );
    }) as typeof fetch;
    const chain = new FailoverLlmChain([
      new Groq("groq", { apiKey: "g", baseUrl: "https://g.test/v1", model: "m" }, { ...MEMBER_OPTS, fetchImpl: groqFetch }),
      new Gemini("gemini", { apiKey: "g", model: "gm" }, { ...MEMBER_OPTS, fetchImpl: geminiFetch }),
    ]);
    const provider = chainAsTranscriptionProvider(chain);
    const out = await provider.generate({
      systemPrompt: "transcribe",
      userPrompt: "go",
      temperature: 0,
      maxTokens: 700,
      media: { base64: "QUJD", mimeType: "image/png" },
    });
    expect(out.text).toBe("$x^2 + 1$");
    expect(out.providerName).toBe("gemini");
    expect(out.model).toBe("gm");
    expect(typeof out.latencyMs).toBe("number");
    expect(groqCalls).toHaveLength(0); // media never reaches the text-only member
  });
});

describe("chainAsCandidateGenerator — the LlmMarkingCandidateGenerator port", () => {
  test("unavailable chain → PROVIDER_UNAVAILABLE refusal (the pipeline's fail-closed path)", async () => {
    const generator = chainAsCandidateGenerator(
      buildLlmChain({}, { now: () => new Date(0), utcDay: () => "2026-10-08" }),
    );
    try {
      await generator.propose(context());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CandidateGenerationError);
      expect((e as CandidateGenerationError).reason).toBe("PROVIDER_UNAVAILABLE");
    }
  });

  test("happy path: prompt v3 contract (temp 0.1, reasoning low, budget formula) + parsed candidate", async () => {
    const { chain, calls } = groqChain(OK_BODY());
    const candidate = await chainAsCandidateGenerator(chain).propose(context());
    expect(candidate.modelId).toBe("groq-model");
    expect(candidate.confidence).toBe(0.87);
    expect(candidate.allocations).toHaveLength(2);
    expect(candidate.rawOutput).toContain("allocations"); // self-forensic rows
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.temperature).toBe(0.1);
    expect(body.reasoning_effort).toBe("low");
    // 800 + 400 * 3 marks = 2000
    expect(body.max_tokens).toBe(2000);
    const system = (body.messages as Array<{ role: string; content: string }>)[0]!.content;
    expect(system).toContain("Respond with ONLY a JSON object");
    expect(system).toContain("sub-point INDEPENDENTLY");
    const user = (body.messages as Array<{ role: string; content: string }>)[1]!.content;
    expect(user).toContain("QUESTION PART ((a)):");
    expect(user).toContain("id=11111111-1111-4111-8111-111111111111");
    expect(user).toContain("LEARNER ANSWER");
  });

  test("v3 clamp-don't-reject: an over-award clamps to the point's worth", async () => {
    const { chain } = groqChain(
      OK_BODY({
        allocations: [
          { markPointId: POINT_A1.id, ref: "a(i)", marksAwarded: 9, evidence: "", rationale: "" },
          { markPointId: POINT_A2.id, ref: "a(ii)", marksAwarded: 1 },
        ],
      }),
    );
    const candidate = await chainAsCandidateGenerator(chain).propose(context());
    expect(candidate.allocations[0]!.marksAwarded).toBe(2); // 2-mark point
    expect(candidate.allocations[0]!.awarded).toBe(true);
    expect(candidate.allocations[1]!.marksAwarded).toBe(1);
  });

  test("v2 boolean-awarded backward compatibility parses (whole point or nothing)", async () => {
    const { chain } = groqChain(
      OK_BODY({
        allocations: [
          { markPointId: POINT_A1.id, ref: "a(i)", awarded: true },
          { markPointId: POINT_A2.id, ref: "a(ii)", awarded: false },
        ],
      }),
    );
    const candidate = await chainAsCandidateGenerator(chain).propose(context());
    expect(candidate.allocations[0]!.marksAwarded).toBe(2); // pointMarks on true
    expect(candidate.allocations[1]!.marksAwarded).toBe(0); // 0 on false
  });

  test("malformed UUID markPointId → MALFORMED_ALLOCATION (a bad CANDIDATE, never an HTTP 400)", async () => {
    const { chain } = groqChain(
      OK_BODY({ allocations: [{ markPointId: "not-a-uuid", ref: "a(i)", marksAwarded: 1 }] }),
    );
    try {
      await chainAsCandidateGenerator(chain).propose(context());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CandidateGenerationError);
      expect((e as CandidateGenerationError).reason).toBe("MALFORMED_ALLOCATION");
    }
  });

  test("no JSON object in the output → UNPARSEABLE_OUTPUT carrying the raw text", async () => {
    const { chain } = groqChain({ choices: [{ finish_reason: "stop", message: { content: "I cannot mark this" } }] });
    try {
      await chainAsCandidateGenerator(chain).propose(context());
      expect.unreachable();
    } catch (e) {
      expect((e as CandidateGenerationError).reason).toBe("UNPARSEABLE_OUTPUT");
      expect((e as CandidateGenerationError).rawOutput).toBe("I cannot mark this");
    }
  });

  test("JSON fenced inside prose still extracts (first '{' … last '}' law)", async () => {
    const inner = JSON.stringify({
      confidence: 0.5,
      allocations: [{ markPointId: POINT_A1.id, ref: "a(i)", marksAwarded: 1 }],
    });
    const { chain } = groqChain({
      choices: [{ finish_reason: "stop", message: { content: `Here is my marking:\n${inner}\nThanks!` } }],
    });
    const candidate = await chainAsCandidateGenerator(chain).propose(context());
    expect(candidate.allocations).toHaveLength(1);
    expect(candidate.confidence).toBe(0.5);
  });

  test("truncated completion (finish_reason length) → TRUNCATED_OUTPUT with the raw text attached", async () => {
    const { chain } = groqChain({
      choices: [{ finish_reason: "length", message: { content: '{"confidence": 0.9, "allo' } }],
    });
    try {
      await chainAsCandidateGenerator(chain).propose(context());
      expect.unreachable();
    } catch (e) {
      expect((e as CandidateGenerationError).reason).toBe("TRUNCATED_OUTPUT");
      expect((e as CandidateGenerationError).rawOutput).toContain("allo");
    }
  });

  test("batch happy path: one object per part, index-aligned, budgets capped at 8000", async () => {
    const { chain, calls } = groqChain({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              parts: [
                {
                  part: 1,
                  confidence: 0.8,
                  allocations: [{ markPointId: POINT_A1.id, ref: "a(i)", marksAwarded: 2 }],
                },
                {
                  part: 2,
                  confidence: 0.9,
                  allocations: [{ markPointId: POINT_A2.id, ref: "a(ii)", marksAwarded: 0 }],
                },
              ],
            }),
          },
        },
      ],
    });
    const contexts = [
      context(),
      context({ answer: { ...context().answer, questionPartId: "part-2", label: "(b)" }, points: [POINT_A2] }),
    ];
    const candidates = await chainAsCandidateGenerator(chain).proposeAll(contexts);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.allocations[0]!.marksAwarded).toBe(2);
    expect(candidates[1]!.allocations[0]!.marksAwarded).toBe(0);
    expect(candidates[1]!.allocations[0]!.awarded).toBe(false);
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    // batch budget: 800 + 400 * (3 + 1 marks) = 2400 — under the 8000 cap
    expect(body.max_tokens).toBe(2400);
    const user = (body.messages as Array<{ role: string; content: string }>)[1]!.content;
    expect(user).toContain("STRUCTURED ATTEMPT: 2");
    expect(user).toContain("===== PART 1 of 2");
    expect(user).toContain("===== PART 2 of 2");
  });

  test("batch count mismatch → WHOLE-batch refusal (the pipeline's per-part fallback ladder takes over)", async () => {
    const { chain } = groqChain({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              parts: [{ part: 1, confidence: 0.8, allocations: [] }],
            }),
          },
        },
      ],
    });
    try {
      await chainAsCandidateGenerator(chain).proposeAll([context(), context()]);
      expect.unreachable();
    } catch (e) {
      expect((e as CandidateGenerationError).reason).toBe("UNPARSEABLE_OUTPUT");
    }
  });

  test("batch duplicate part number → WHOLE-batch refusal", async () => {
    const dup = { part: 1, confidence: 0.8, allocations: [] };
    const { chain } = groqChain({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ parts: [dup, dup] }) } }],
    });
    try {
      await chainAsCandidateGenerator(chain).proposeAll([context(), context()]);
      expect.unreachable();
    } catch (e) {
      expect((e as CandidateGenerationError).reason).toBe("UNPARSEABLE_OUTPUT");
    }
  });

  test("chain exhaustion mid-propose (429 x3 → cooldown) → PROVIDER_UNAVAILABLE", async () => {
    let status = 429;
    const fetchImpl = (async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ error: "quota" }), { status })) as typeof fetch;
    const member = new OpenAiCompatibleChainMember(
      "groq",
      { apiKey: "g", baseUrl: "https://g.test/v1", model: "m" },
      { failureThreshold: 3, cooldownSeconds: 60, dailyBudget: 1000, timeoutSeconds: 5, fetchImpl },
    );
    const generator = chainAsCandidateGenerator(new FailoverLlmChain([member]));
    // exhaust the failure threshold → cooldown → chain.available() false
    await generator.propose(context()).catch(() => {});
    await generator.propose(context()).catch(() => {});
    await generator.propose(context()).catch(() => {});
    expect(member.health().snapshot().coolingDown).toBe(true);
    try {
      await generator.propose(context());
      expect.unreachable();
    } catch (e) {
      expect((e as CandidateGenerationError).reason).toBe("PROVIDER_UNAVAILABLE");
    }
  });
});

describe("the budget + truncation helpers (unit tier)", () => {
  test("completionBudget: 800 base + 400/mark, capped at 4000; batch capped at 8000", () => {
    const one: MarkingPoint[] = [{ ...POINT_A1, marks: 1 }];
    expect(completionBudget(one)).toBe(1200);
    expect(completionBudget([POINT_A1, POINT_A2])).toBe(2000); // 3 marks
    const heavy: MarkingPoint[] = Array.from({ length: 20 }, () => ({ ...POINT_A1, marks: 10 }));
    expect(completionBudget(heavy)).toBe(4000); // cap
    // two contexts x 3 marks = 6 marks → 800 + 400*6 = 3200
    expect(batchCompletionBudget([context(), context()])).toBe(3200);
    const huge: MarkingPoint[] = Array.from({ length: 60 }, () => ({ ...POINT_A1, marks: 10 }));
    expect(batchCompletionBudget([{ ...context(), points: huge }])).toBe(8000); // batch cap
  });

  test("isTruncationFinish: the OpenAI-compatible + GenAI spellings, normalized lower-case", () => {
    expect(isTruncationFinish("length")).toBe(true);
    expect(isTruncationFinish("LENGTH")).toBe(true);
    expect(isTruncationFinish("max_tokens")).toBe(true); // the Google spelling
    expect(isTruncationFinish("stop")).toBe(false);
    expect(isTruncationFinish(null)).toBe(false);
  });

  test("resolveMarks: clamps over-awards; v2 boolean fallback; unknown point → 1-mark ceiling", () => {
    expect(resolveMarks({ marksAwarded: 5 }, POINT_A1)).toBe(2);
    expect(resolveMarks({ marksAwarded: -3 }, POINT_A1)).toBe(0);
    expect(resolveMarks({ awarded: true }, POINT_A2)).toBe(1);
    expect(resolveMarks({ awarded: false }, POINT_A2)).toBe(0);
    expect(resolveMarks({ marksAwarded: 7 }, undefined)).toBe(1); // defensive 1-mark ceiling
    expect(resolveMarks({}, POINT_A1)).toBe(0); // neither field → nothing earned
  });
});
