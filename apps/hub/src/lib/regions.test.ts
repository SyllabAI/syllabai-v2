/**
 * regions fetcher law tests (T-MG-MP-RECT-1 run-001) — the mirror law:
 * any contract drift fails THIS parse first, loudly; any transport failure
 * is honest-null. Network-free (fetch is stubbed).
 */
import { describe, expect, test, afterEach } from "bun:test";
import { fetchPaperRegions } from "./regions";

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

const ORIGINAL = { base: process.env.NEXT_PUBLIC_API_BASE_URL, core: process.env.SYLLABAI_CORE_BASE_URL };

afterEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL.base;
  process.env.SYLLABAI_CORE_BASE_URL = ORIGINAL.core;
  // @ts-expect-error test stub
  globalThis.fetch = ORIGINAL_FETCH;
});

const ORIGINAL_FETCH = globalThis.fetch;

function stubFetch(impl: () => Promise<Response>) {
  // @ts-expect-error test stub
  globalThis.fetch = impl;
}

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
