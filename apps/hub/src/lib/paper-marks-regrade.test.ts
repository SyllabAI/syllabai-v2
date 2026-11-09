/**
 * T-MG-PLAYER-MARK-1 run-001 — the typed regrade channel's client tests.
 * The mirror-law discipline under test: the DEFINED outcomes are typed
 * (202 accepted; the 400/404/422 envelopes; no_token; unconfigured) and
 * everything undefined (network, 5xx, garbage bodies) collapses to the
 * honest "failed" class — never a fabricated markId. fetchImpl is
 * injected (the requestRegionMark test posture; no network in CI).
 */
import { afterAll, describe, expect, test } from "bun:test";

import { requestPartRegrade, pollUntilTerminal } from "./paper-marks";

const TOKEN = "test-token";
const PART_ID = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const MARK_ID = "11111111-1111-4111-8111-111111111111";

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Test doubles are bare async fns — cast to the injected type once. */
const stubFetch = (impl: unknown): typeof fetch => impl as typeof fetch;

const withEnv = (run: () => void | Promise<void>) => {
  const prevBase = process.env.SYLLABAI_CORE_BASE_URL;
  process.env.SYLLABAI_CORE_BASE_URL = "https://api.test";
  return (async () => {
    try {
      await run();
    } finally {
      if (prevBase === undefined) delete process.env.SYLLABAI_CORE_BASE_URL;
      else process.env.SYLLABAI_CORE_BASE_URL = prevBase;
    }
  })();
};

afterAll(() => {
  delete process.env.SYLLABAI_CORE_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

describe("requestPartRegrade — the defined outcomes", () => {
  test("202 + valid body → accepted {markId}; the POST carries the bearer token, the JSON body, no-store", async () => {
    await withEnv(async () => {
      let seen: { url: string; init: RequestInit } | null = null;
      const res = await requestPartRegrade(
        PART_ID,
        "<p>5e</p>",
        TOKEN,
        stubFetch((_url: unknown, init: RequestInit | undefined) => {
          seen = { url: String(_url), init: (init ?? {}) as RequestInit };
          return Promise.resolve(jsonRes(202, { markId: MARK_ID, status: "queued" }));
        }),
      );
      expect(res).toEqual({ outcome: "accepted", markId: MARK_ID });
      const s = seen as { url: string; init: RequestInit } | null;
      expect(s!.url).toBe(`https://api.test/api/v1/paper-marks/parts/${PART_ID}/regrade`);
      expect(s!.init.method).toBe("POST");
      expect((s!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
      expect(s!.init.cache).toBe("no-store");
      expect(JSON.parse(String(s!.init.body))).toEqual({ answerHtml: "<p>5e</p>" });
    });
  });

  test("422 no_mark_points envelope → rejected with the api's honest message", async () => {
    await withEnv(async () => {
      const res = await requestPartRegrade(PART_ID, "x", TOKEN, stubFetch(async () =>
        jsonRes(422, { error: "no_mark_points", message: "region part has no mark_points" }),
      ));
      expect(res).toEqual({ outcome: "rejected", message: "region part has no mark_points" });
    });
  });

  test("404 unknown part → rejected; 400 malformed → rejected", async () => {
    await withEnv(async () => {
      const notFound = await requestPartRegrade(PART_ID, "x", TOKEN, stubFetch(async () =>
        jsonRes(404, { error: "not_found", message: "no such part" }),
      ));
      expect(notFound.outcome).toBe("rejected");
      const malformed = await requestPartRegrade(PART_ID, "x", TOKEN, stubFetch(async () =>
        jsonRes(400, { error: "malformed_request", message: "malformed request" }),
      ));
      expect(malformed.outcome).toBe("rejected");
    });
  });

  test("202 + garbage body → failed (never a fabricated markId)", async () => {
    await withEnv(async () => {
      const res = await requestPartRegrade(PART_ID, "x", TOKEN, stubFetch(async () =>
        jsonRes(202, { nonsense: true }),
      ));
      expect(res).toEqual({ outcome: "failed" });
    });
  });

  test("5xx and network failure collapse to failed; no token → no_token; missing origin → unconfigured", async () => {
    await withEnv(async () => {
      const serverError = await requestPartRegrade(PART_ID, "x", TOKEN, stubFetch(async () => jsonRes(503, {})));
      expect(serverError).toEqual({ outcome: "failed" });
      const network = await requestPartRegrade(PART_ID, "x", TOKEN, stubFetch(async () => {
        throw new Error("down");
      }));
      expect(network).toEqual({ outcome: "failed" });
    });
    const noToken = await requestPartRegrade(PART_ID, "x", null, stubFetch(async () => jsonRes(202, {})));
    expect(noToken).toEqual({ outcome: "no_token" });
    const prev = process.env.SYLLABAI_CORE_BASE_URL;
    delete process.env.SYLLABAI_CORE_BASE_URL;
    const unconfigured = await requestPartRegrade(PART_ID, "x", TOKEN, stubFetch(async () => jsonRes(202, {})));
    expect(unconfigured).toEqual({ outcome: "unconfigured" });
    if (prev !== undefined) process.env.SYLLABAI_CORE_BASE_URL = prev;
  });
});

describe("pollUntilTerminal — the regrade happy path (typed channel integration)", () => {
  test("queued → succeeded snapshot; the markId is the only handle, never a re-POST", async () => {
    await withEnv(async () => {
      const polls: string[] = [];
      const result = await pollUntilTerminal({
        markId: MARK_ID,
        token: TOKEN,
        delay: async () => {},
        poll: async (markId) => {
          polls.push(markId);
          return {
            outcome: "snapshot" as const,
            snapshot: {
              markId: MARK_ID,
              status: "succeeded" as const,
              awards: [{ code: "B1", awarded: true, score: 1, maxScore: 1, ordinal: 0, markPointId: null, page: null }],
              feedback: {
                attempt: "full",
                chatMessage: "So it says simplify: you've combined all five e terms correctly to get 5e.",
                pointsScored: ["B1: 5e"],
                pointsNotScored: [],
                thoughtProcess: "The student wrote 5e. B1 awarded.",
                strategiesForImprovement: [],
              },
              queuedAt: "2026-11-04T00:00:00Z",
              completedAt: "2026-11-04T00:00:01Z",
            },
          };
        },
      });
      expect(result.status).toBe("succeeded");
      if (result.status === "succeeded") {
        expect(result.snapshot.awards![0]!.code).toBe("B1");
        expect(result.snapshot.feedback!.chatMessage).toContain("5e");
      }
      expect(polls).toEqual([MARK_ID]);
    });
  });
});

// ── T-MG-MARK-DELTA-1 (Lane E) — the forceFresh wire law + the mirror's
// additive fields (attemptClass / workingRefLabel / cached receipt) ──────────

describe("requestPartRegrade — T-MG-MARK-DELTA-1 forceFresh", () => {
  test("forceFresh: true rides the body (the explicit 'mark again' affordance forces a fresh job)", async () => {
    await withEnv(async () => {
      let seen: { init: RequestInit } | null = null;
      const res = await requestPartRegrade(
        PART_ID,
        "<p>same draft</p>",
        TOKEN,
        stubFetch((_url: unknown, init: RequestInit | undefined) => {
          seen = { init: (init ?? {}) as RequestInit };
          return Promise.resolve(jsonRes(202, { markId: MARK_ID, status: "queued" }));
        }),
        true,
      );
      expect(res).toEqual({ outcome: "accepted", markId: MARK_ID });
      const s = seen as { init: RequestInit } | null;
      expect(JSON.parse(String(s!.init.body))).toEqual({ answerHtml: "<p>same draft</p>", forceFresh: true });
    });
  });

  test("default (no forceFresh arg) omits the field — the identical re-mark may short-circuit", async () => {
    await withEnv(async () => {
      let seen: { init: RequestInit } | null = null;
      await requestPartRegrade(
        PART_ID,
        "<p>same draft</p>",
        TOKEN,
        stubFetch((_url: unknown, init: RequestInit | undefined) => {
          seen = { init: (init ?? {}) as RequestInit };
          return Promise.resolve(jsonRes(202, { markId: MARK_ID, status: "queued" }));
        }),
      );
      const s = seen as { init: RequestInit } | null;
      expect(JSON.parse(String(s!.init.body))).toEqual({ answerHtml: "<p>same draft</p>" });
    });
  });
});

describe("pollUntilTerminal — T-MG-MARK-DELTA-1 mirror fields (additive optional)", () => {
  const baseSnapshot = {
    markId: MARK_ID,
    status: "succeeded",
    queuedAt: "2026-11-04T10:00:00Z",
    completedAt: "2026-11-04T10:00:05Z",
    transcription: "the attempt",
    feedback: {
      attempt: "the attempt",
      chatMessage: "Two points considered.",
      pointsScored: ["P1: t — c"],
      pointsNotScored: [],
      thoughtProcess: "the attempt",
      strategiesForImprovement: [],
    },
    awards: [
      {
        code: "P1",
        awarded: true,
        score: 1,
        maxScore: 1,
        ordinal: 0,
        markPointId: "22222222-2222-4222-8222-222222222222",
        page: 2,
        attemptClass: "full",
        workingRefLabel: "W2",
      },
    ],
    receipt: { emitted: 1, suppressed: 0, workingBlocks: 0, cached: true },
  };

  test("a snapshot WITH the Lane E fields parses; the citation label, attempt class and cached receipt ride through", async () => {
    await withEnv(async () => {
      const loop = await pollUntilTerminal({
        markId: MARK_ID,
        token: TOKEN,
        delay: async () => undefined,
        poll: (async () => ({ outcome: "snapshot", snapshot: baseSnapshot })) as never,
      });
      expect(loop.status).toBe("succeeded");
      if (loop.status !== "succeeded") return;
      expect(loop.snapshot.awards?.[0]?.attemptClass).toBe("full");
      expect(loop.snapshot.awards?.[0]?.workingRefLabel).toBe("W2");
      expect(loop.snapshot.receipt?.cached).toBe(true);
    });
  });

  test("a snapshot WITHOUT the Lane E fields still parses (backward compatibility — the additive law)", async () => {
    await withEnv(async () => {
      const bare = JSON.parse(JSON.stringify(baseSnapshot)) as Record<string, unknown>;
      const awards = (bare.awards as Array<Record<string, unknown>>)[0]!;
      delete awards.attemptClass;
      delete awards.workingRefLabel;
      delete (bare.receipt as Record<string, unknown>).cached;
      const loop = await pollUntilTerminal({
        markId: MARK_ID,
        token: TOKEN,
        delay: async () => undefined,
        poll: (async () => ({ outcome: "snapshot", snapshot: bare })) as never,
      });
      expect(loop.status).toBe("succeeded");
      if (loop.status !== "succeeded") return;
      expect(loop.snapshot.awards?.[0]?.attemptClass).toBeUndefined();
      expect(loop.snapshot.awards?.[0]?.workingRefLabel).toBeUndefined();
      expect(loop.snapshot.receipt?.cached).toBeUndefined();
    });
  });
});
