/**
 * Paper-marks client tests — T-MG-CROPMARK-1 run-002. The honest-outcome
 * law as tests, over an INJECTED fetch (the ink-sync injectable-deps law):
 * the defined 202/4xx taxonomy, the mirror's strict parse, the non-durable
 * registry's honest 404, and the poll loop's terminal/lost/timeout/
 * cancelled states (retry: 0 — the loop never re-POSTs).
 */
import { describe, expect, test } from "bun:test";

import { pollMark, pollUntilTerminal, requestRegionMark, fetchPaperMarksLedger, type MirroredPollSnapshot } from "./paper-marks";

const TOKEN = "tok";

// The client-side origin of record (client-safe resolution) — set for the
// network-path tests; the no_token tests assert the gate BEFORE the origin.
process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.test";

/** A fetch double from a script of [status, body] pairs. */
function fetchDouble(responses: Array<{ status?: number; body?: unknown; throw?: boolean }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const step = responses.shift();
    if (!step || step.throw) throw new TypeError("network down");
    return new Response(step.body === undefined ? null : JSON.stringify(step.body), {
      status: step.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const PNG = "data:image/png;base64,AAAA";

const baseSnapshot: MirroredPollSnapshot = {
  markId: "0b8a5c3e-1111-4222-8333-444455556666",
  status: "succeeded",
  transcription: "2x",
  awards: [
    { code: "P1", awarded: true, score: 1, maxScore: 1, ordinal: 0, markPointId: null, page: 2 },
  ],
  queuedAt: "2026-10-31T00:00:00Z",
  completedAt: "2026-10-31T00:00:01Z",
};

describe("T-MG-CROPMARK-1 run-002 — requestRegionMark (the defined POST taxonomy)", () => {
  test("202 + valid body → accepted {markId}", async () => {
    const { impl, calls } = fetchDouble([{ status: 202, body: { markId: baseSnapshot.markId, status: "queued" } }]);
    const r = await requestRegionMark("0b8a5c3e-1111-4222-8333-444455556667", PNG, TOKEN, impl);
    expect(r).toEqual({ outcome: "accepted", markId: baseSnapshot.markId });
    expect(calls[0]?.url).toContain("/api/v1/paper-marks/regions/0b8a5c3e-1111-4222-8333-444455556667/mark");
    expect((calls[0]?.init?.body as string)).toContain("data:image/png;base64");
  });

  test("the defined 4xx envelopes surface their honest message as rejected", async () => {
    for (const status of [400, 404, 413, 422]) {
      const { impl } = fetchDouble([
        { status, body: { error: "no_mark_points", message: "region has no mark points", timestamp: "t" } },
      ]);
      const r = await requestRegionMark("0b8a5c3e-1111-4222-8333-444455556667", PNG, TOKEN, impl);
      expect(r).toMatchObject({ outcome: "rejected", message: "region has no mark points" });
    }
  });

  test("a 4xx with a garbage envelope is STILL a rejected (honest status fallback)", async () => {
    const { impl } = fetchDouble([{ status: 413, body: { junk: true } }]);
    const r = await requestRegionMark("0b8a5c3e-1111-4222-8333-444455556667", PNG, TOKEN, impl);
    expect(r).toMatchObject({ outcome: "rejected" });
  });

  test("202 with a malformed body is failed (never a fabricated markId)", async () => {
    const { impl } = fetchDouble([{ status: 202, body: { markId: "not-a-uuid" } }]);
    expect(await requestRegionMark("0b8a5c3e-1111-4222-8333-444455556667", PNG, TOKEN, impl)).toEqual({
      outcome: "failed",
    });
  });

  test("network throw / 5xx → failed (the undefined class)", async () => {
    const down = fetchDouble([{ throw: true }]);
    expect(await requestRegionMark("0b8a5c3e-1111-4222-8333-444455556667", PNG, TOKEN, down.impl)).toEqual({
      outcome: "failed",
    });
    const boom = fetchDouble([{ status: 500, body: { error: "x", message: "y" } }]);
    expect(await requestRegionMark("0b8a5c3e-1111-4222-8333-444455556667", PNG, TOKEN, boom.impl)).toEqual({
      outcome: "failed",
    });
  });

  test("no token → no_token WITHOUT touching the network", async () => {
    const { impl, calls } = fetchDouble([]);
    expect(await requestRegionMark("0b8a5c3e-1111-4222-8333-444455556667", PNG, null, impl)).toEqual({
      outcome: "no_token",
    });
    expect(calls.length).toBe(0);
  });
});

describe("T-MG-CROPMARK-1 run-002 — pollMark (the mirror's strict parse)", () => {
  test("200 valid snapshot → snapshot", async () => {
    const { impl } = fetchDouble([{ status: 200, body: baseSnapshot }]);
    const r = await pollMark(baseSnapshot.markId, TOKEN, impl);
    expect(r.outcome).toBe("snapshot");
    if (r.outcome === "snapshot") {
      expect(r.snapshot.status).toBe("succeeded");
      expect(r.snapshot.awards?.[0]?.code).toBe("P1");
    }
  });

  test("404 → unknown (the non-durable registry's honest restart path)", async () => {
    const { impl } = fetchDouble([{ status: 404, body: { error: "not_found", message: "mark x not found" } }]);
    expect(await pollMark(baseSnapshot.markId, TOKEN, impl)).toEqual({ outcome: "unknown" });
  });

  test("200 garbage → failed (the mirror refuses to pass drift through)", async () => {
    const { impl } = fetchDouble([{ status: 200, body: { status: "succeeded" } }]);
    expect(await pollMark(baseSnapshot.markId, TOKEN, impl)).toEqual({ outcome: "failed" });
  });
});

describe("T-MG-CROPMARK-1 run-002 — pollUntilTerminal (the loop law)", () => {
  const noDelay = async () => {};

  test("queued → running → succeeded returns the terminal snapshot", async () => {
    const polls: MirroredPollSnapshot[] = [
      { markId: baseSnapshot.markId, status: "queued", queuedAt: "t", completedAt: null },
      { markId: baseSnapshot.markId, status: "running", queuedAt: "t", completedAt: null },
      baseSnapshot,
    ];
    let n = 0;
    const r = await pollUntilTerminal({
      markId: baseSnapshot.markId,
      token: TOKEN,
      delay: noDelay,
      poll: async () => ({ outcome: "snapshot", snapshot: polls[n++] }),
    });
    expect(r).toMatchObject({ status: "succeeded" });
    expect(n).toBe(3);
  });

  test("a failed snapshot is a terminal snapshot (the honest error pair rides)", async () => {
    const r = await pollUntilTerminal({
      markId: baseSnapshot.markId,
      token: TOKEN,
      delay: noDelay,
      poll: async () => ({
        outcome: "snapshot" as const,
        snapshot: {
          ...baseSnapshot,
          status: "failed" as const,
          error: { code: "marking_unavailable", message: "the marker is unavailable" },
        },
      }),
    });
    expect(r).toMatchObject({ status: "failed", snapshot: { error: { code: "marking_unavailable" } } });
  });

  test("unknown → lost (the honest restart path, immediately terminal)", async () => {
    const r = await pollUntilTerminal({
      markId: baseSnapshot.markId,
      token: TOKEN,
      delay: noDelay,
      poll: async () => ({ outcome: "unknown" }),
    });
    expect(r).toEqual({ status: "lost" });
  });

  test("the cap → timeout carrying the SAME markId (Check again resumes, never re-POSTs)", async () => {
    let n = 0;
    const r = await pollUntilTerminal({
      markId: baseSnapshot.markId,
      token: TOKEN,
      maxPolls: 3,
      delay: noDelay,
      poll: async () => {
        n += 1;
        return { outcome: "snapshot" as const, snapshot: { ...baseSnapshot, status: "running" as const } };
      },
    });
    expect(r).toEqual({ status: "timeout", markId: baseSnapshot.markId });
    expect(n).toBe(3);
  });

  test("cancellation wins at the next boundary (dismiss stops the loop)", async () => {
    let cancelled = false;
    let polls = 0;
    const r = await pollUntilTerminal({
      markId: baseSnapshot.markId,
      token: TOKEN,
      delay: noDelay,
      isCancelled: () => cancelled,
      poll: async () => {
        polls += 1;
        cancelled = true; // the dismiss lands mid-poll
        return { outcome: "snapshot" as const, snapshot: { ...baseSnapshot, status: "running" as const } };
      },
    });
    expect(r).toEqual({ status: "cancelled" });
    expect(polls).toBe(1);
  });

  test("a poll failure mid-loop is the failed class (honest, retryable by the panel)", async () => {
    const r = await pollUntilTerminal({
      markId: baseSnapshot.markId,
      token: TOKEN,
      delay: noDelay,
      poll: async () => ({ outcome: "failed" }),
    });
    expect(r).toEqual({ status: "failed", snapshot: null });
  });
});

// ── T-MG-FEEDBACK-1 run-001 — fetchPaperMarksLedger (the ledger read) ───────

const LEDGER = {
  documentRefType: "paper_asset",
  documentRefId: "47000000-0000-4000-8000-000000000001",
  regions: [
    {
      regionKey: "1MA1/1F-q9.p1",
      page: 4,
      score: 1,
      maxScore: 1,
      awards: [
        {
          id: "aa000000-0000-4000-8000-000000000001",
          code: "B1",
          awarded: true,
          score: 1,
          maxScore: 1,
          ordinal: 0,
          markPointId: "ab000000-0000-4000-8000-000000000001",
          page: 4,
          workingRef: null,
          pipelineVersion: "paper-mark/v1",
          feedback: {
            attempt: "full",
            chatMessage: "So it says simplify…",
            pointsScored: ["B1: combined the terms"],
            pointsNotScored: [],
            thoughtProcess: "2x\n\nThe transcription matches the scheme.",
            strategiesForImprovement: [],
          },
          createdAt: "2026-10-31T00:00:00Z",
        },
      ],
      workingBlocks: [],
    },
  ],
};

describe("T-MG-FEEDBACK-1 run-001 — fetchPaperMarksLedger", () => {
  test("no token → no_token before any request", async () => {
    const { impl, calls } = fetchDouble([{ status: 200, body: LEDGER }]);
    const r = await fetchPaperMarksLedger(LEDGER.documentRefId, null, impl);
    expect(r).toEqual({ outcome: "no_token" });
    expect(calls).toHaveLength(0);
  });

  test("no origin → unconfigured", async () => {
    const saved = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    try {
      const { impl } = fetchDouble([]);
      const r = await fetchPaperMarksLedger(LEDGER.documentRefId, TOKEN, impl);
      expect(r).toEqual({ outcome: "unconfigured" });
    } finally {
      process.env.NEXT_PUBLIC_API_BASE_URL = saved;
    }
  });

  test("200 ledger parses through the strict mirror and rides the query of record", async () => {
    const { impl, calls } = fetchDouble([{ status: 200, body: LEDGER }]);
    const r = await fetchPaperMarksLedger(LEDGER.documentRefId, TOKEN, impl);
    expect(r.outcome).toBe("ledger");
    if (r.outcome === "ledger") {
      expect(r.ledger.regions).toHaveLength(1);
      expect(r.ledger.regions[0]!.score).toBe(1);
      expect(r.ledger.regions[0]!.awards[0]!.code).toBe("B1");
    }
    expect(calls[0]!.url).toContain("/api/v1/paper-marks?");
    expect(calls[0]!.url).toContain("documentRefType=paper_asset");
    expect(calls[0]!.url).toContain(`documentRefId=${LEDGER.documentRefId}`);
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  test("honest-empty ledger (regions: []) is a DEFINED outcome", async () => {
    const { impl } = fetchDouble([
      { status: 200, body: { documentRefType: "paper_asset", documentRefId: LEDGER.documentRefId, regions: [] } },
    ]);
    const r = await fetchPaperMarksLedger(LEDGER.documentRefId, TOKEN, impl);
    expect(r.outcome).toBe("ledger");
  });

  test("non-200 / malformed / network → failed — never a fabricated ledger", async () => {
    const down = fetchDouble([{ status: 500, body: { error: "x" } }]);
    expect((await fetchPaperMarksLedger(LEDGER.documentRefId, TOKEN, down.impl)).outcome).toBe("failed");
    const bad = fetchDouble([{ status: 200, body: { documentRefType: "paper_asset", regions: "nope" } }]);
    expect((await fetchPaperMarksLedger(LEDGER.documentRefId, TOKEN, bad.impl)).outcome).toBe("failed");
    const err = fetchDouble([{ throw: true }]);
    expect((await fetchPaperMarksLedger(LEDGER.documentRefId, TOKEN, err.impl)).outcome).toBe("failed");
  });
});
