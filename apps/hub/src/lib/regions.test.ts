/**
 * regions fetcher law tests (T-MG-MP-RECT-1 run-001) — the mirror law:
 * any contract drift fails THIS parse first, loudly; any transport failure
 * is honest-null. Network-free (fetch is stubbed).
 */
import { describe, expect, test, afterEach } from "bun:test";
import { fetchPaperRegions, resolvePaperAsset, resolvePaperAssetCached } from "./regions";

const ORIGINAL = { base: process.env.NEXT_PUBLIC_API_BASE_URL, core: process.env.SYLLABAI_CORE_BASE_URL };

const ORIGINAL_FETCH = globalThis.fetch;

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stubFetch(impl: FetchImpl) {
  globalThis.fetch = impl as typeof fetch;
}

const VALID_PAYLOAD = {
  extracted: true,
  markable: true,
  groundingComplete: true,
  regions: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      kind: "part",
      regionKey: "1MA1/1F-q9.a",
      parentRegionId: "48000000-0000-4000-8000-000000000001",
      label: "a",
      marks: 1,
      page: 4,
      rects: [{ page: 4, x: 0.08, y: 0.31, width: 0.52, height: 0.06, ordinal: 0 }],
      questionPartId: "60000000-0000-4000-8000-000000000001",
      answersOnFigure: false,
      markable: true,
      extracted: true,
    },
  ],
};

afterEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL.base;
  process.env.SYLLABAI_CORE_BASE_URL = ORIGINAL.core;
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("fetchPaperRegions — the honest-failure law", () => {
  test("no base url configured → null (never throws)", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.SYLLABAI_CORE_BASE_URL;
    const res = await fetchPaperRegions("47000000-0000-4000-8000-000000000001", "tok");
    expect(res).toBeNull();
  });

  test("no token → null (the guaranteed-401 posture, no request issued)", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    stubFetch(() => {
      throw new Error("must not be called");
    });
    const res = await fetchPaperRegions("47000000-0000-4000-8000-000000000001", null);
    expect(res).toBeNull();
  });

  test("non-200 → null", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    stubFetch(() => Promise.resolve(new Response("{}", { status: 404 })));
    const res = await fetchPaperRegions("47000000-0000-4000-8000-000000000001", "tok");
    expect(res).toBeNull();
  });

  test("malformed body → null (the mirror parse fails first, silently at the seam)", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ extracted: "yes" }), { status: 200 })));
    const res = await fetchPaperRegions("47000000-0000-4000-8000-000000000001", "tok");
    expect(res).toBeNull();
  });

  test("network error → null", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    stubFetch(() => Promise.reject(new Error("down")));
    const res = await fetchPaperRegions("47000000-0000-4000-8000-000000000001", "tok");
    expect(res).toBeNull();
  });
});

describe("fetchPaperRegions — the mirror law", () => {
  test("valid payload parses through the strict mirror and rides the auth header", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    let seenAuth = "";
    let seenPath = "";
    stubFetch((_url: unknown, init?: RequestInit) => {
      seenAuth = String((init?.headers as Record<string, string>).Authorization);
      seenPath = String(_url);
      return Promise.resolve(new Response(JSON.stringify(VALID_PAYLOAD), { status: 200 }));
    });
    const res = await fetchPaperRegions("47000000-0000-4000-8000-000000000001", "tok-123");
    expect(res).not.toBeNull();
    expect(res!.regions).toHaveLength(1);
    expect(res!.regions[0]!.regionKey).toBe("1MA1/1F-q9.a");
    expect(res!.regions[0]!.questionPartId).not.toBeNull(); // the WIRED law
    expect(seenAuth).toBe("Bearer tok-123");
    expect(seenPath).toContain("/api/v1/paper-assets/47000000-0000-4000-8000-000000000001/regions");
  });
});

// ── T-MG-FEEDBACK-1 run-001 — resolvePaperAsset (the identity bridge) ───────

describe("resolvePaperAsset — the honest-failure law", () => {
  test("no base url → null; no token → null without a request", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.SYLLABAI_CORE_BASE_URL;
    expect(await resolvePaperAsset("1MA1/1F", "June 2025", "tok")).toBeNull();
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    stubFetch(() => {
      throw new Error("must not be called");
    });
    expect(await resolvePaperAsset("1MA1/1F", "June 2025", null)).toBeNull();
  });

  test("404 (the not-ingested steady state) → null — never a fabricated uuid", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    stubFetch(() => Promise.resolve(new Response("{}", { status: 404 })));
    expect(await resolvePaperAsset("1MA1/1F", "June 2025", "tok")).toBeNull();
  });

  test("malformed body / network error → null", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ paperId: "nope" }), { status: 200 })));
    expect(await resolvePaperAsset("1MA1/1F", "June 2025", "tok")).toBeNull();
    stubFetch(() => Promise.reject(new Error("down")));
    expect(await resolvePaperAsset("1MA1/1F", "June 2025", "tok")).toBeNull();
  });
});

describe("resolvePaperAsset — the mirror + request law", () => {
  test("valid pair parses, rides the auth header, encodes the query", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    let seenUrl = "";
    let seenAuth = "";
    stubFetch((url: unknown, init?: RequestInit) => {
      seenUrl = String(url);
      seenAuth = String((init?.headers as Record<string, string>).Authorization);
      return Promise.resolve(
        new Response(JSON.stringify({ paperId: "47000000-0000-4000-8000-000000000009" }), { status: 200 }),
      );
    });
    const res = await resolvePaperAsset("1MA1/1F", "June 2025", "tok-123");
    expect(res).toEqual({ paperId: "47000000-0000-4000-8000-000000000009" });
    expect(seenUrl).toContain("/api/v1/paper-assets/resolve?");
    expect(seenUrl).toContain("paperCode=1MA1%2F1F");
    expect(seenUrl).toContain("sessionLabel=June%202025");
    expect(seenAuth).toBe("Bearer tok-123");
  });

  test("resolvePaperAssetCached memoizes one promise per identity pair", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ paperId: "47000000-0000-4000-8000-000000000008" }), { status: 200 }),
      );
    });
    const [a, b] = await Promise.all([
      resolvePaperAssetCached("4CH1/1C", "June 2025", "tok"),
      resolvePaperAssetCached("4CH1/1C", "June 2025", "tok"),
    ]);
    expect(a).toEqual({ paperId: "47000000-0000-4000-8000-000000000008" });
    expect(b).toEqual(a);
    expect(calls).toBe(1);
  });
});
