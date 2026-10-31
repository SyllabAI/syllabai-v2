/**
 * Hub-side paper-region fetcher — T-MG-MP-RECT-1 run-001 (plan of record:
 * docs/MG-MARK-PARITY-PLAN.md §3.1, the UI bullet).
 *
 * lib/books-rail.ts discipline, mirrored minus one line: the regions layer
 * is the pdf-pane OVERLAY's read path. books-rail is `server-only` because
 * the rail renders in server components; the overlay mounts alongside the
 * INTERACTIVE viewer, so this fetcher is client-safe (no server-only
 * import) and every OTHER law carries verbatim:
 *
 * - SCHEMA MIRROR law: the hub resolves zod v4 while packages/contracts
 *   builds on v3 — parse trees do not compose across majors — so the strict
 *   serving shape is mirrored LOCALLY and the canonical shapes are imported
 *   TYPE-ONLY. The mirror is structural, never behavioral: any drift fails
 *   THIS parse first, loudly.
 * - Honest-failure law: the fetch returns NULL on any failure (core not
 *   configured, non-200, malformed body) — the overlay renders its honest
 *   "no regions" state. Never a fabricated region, never a partial parse.
 * - no-store: region geometry is corpus data that changes under the
 *   RECT-2 extraction lane; a stale cache would draw wrong boxes.
 */
import { z } from "zod";

import type { PaperAssetRegionsResponse } from "@syllabai/contracts";

// ── the strict-shape mirror (paperAssetRegionsResponseSchema) ───────────────

const rectMirror = z.object({
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  ordinal: z.number().int().min(0),
});

const regionMirror = z.object({
  id: z.string().uuid(),
  kind: z.enum(["question", "part"]),
  regionKey: z.string().min(1),
  parentRegionId: z.string().uuid().nullable(),
  label: z.string().min(1),
  marks: z.number().int().min(0),
  page: z.number().int().min(1).nullable(),
  rects: z.array(rectMirror),
  questionPartId: z.string().uuid().nullable(),
  answersOnFigure: z.boolean(),
  markable: z.boolean(),
  extracted: z.boolean(),
});

const regionsResponseMirror = z.object({
  extracted: z.boolean(),
  markable: z.boolean(),
  groundingComplete: z.boolean(),
  regions: z.array(regionMirror),
});

export type MirroredRegionsResponse = z.infer<typeof regionsResponseMirror>;

/** Core origin, client-safe (mirrors core-proxy.ts coreBaseUrl resolution
 * without the server-only import). */
function regionsBaseUrl(): string | null {
  const raw = process.env.SYLLABAI_CORE_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/$/, "").replace(/\/api\/v1$/, "");
}

/**
 * GET /api/v1/paper-assets/:id/regions — honest-null on any failure.
 * The bearer token rides localStorage (the v0 pilot posture, lib/api.ts);
 * a null token is a guaranteed 401 → null (the honest state, not an
 * exception).
 */
export async function fetchPaperRegions(
  paperId: string,
  token: string | null,
): Promise<MirroredRegionsResponse | null> {
  const base = regionsBaseUrl();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/api/v1/paper-assets/${paperId}/regions`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const parsed = regionsResponseMirror.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── T-MG-FEEDBACK-1 run-001 — the corpus-card→ledger identity bridge ────────

/** The strict-shape mirror (paperAssetResolveResponseSchema). */
const resolveResponseMirror = z.object({ paperId: z.string().uuid() });

export type MirroredPaperAssetResolve = z.infer<typeof resolveResponseMirror>;

/**
 * GET /api/v1/paper-assets/resolve?paperCode&sessionLabel — honest-null on
 * any failure. The 404 (a corpus paper not ingested as an exam_papers row)
 * IS a defined steady state of the Phase-6 rollup: null renders nothing,
 * never a fabricated 0/0.
 */
export async function resolvePaperAsset(
  paperCode: string,
  sessionLabel: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<MirroredPaperAssetResolve | null> {
  const base = regionsBaseUrl();
  if (!base || !token) return null;
  try {
    const qs = `paperCode=${encodeURIComponent(paperCode)}&sessionLabel=${encodeURIComponent(sessionLabel)}`;
    const res = await fetchImpl(`${base}/api/v1/paper-assets/resolve?${qs}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const parsed = resolveResponseMirror.safeParse(await res.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The per-session promise memo (the paper-card economy: the archive list
 * mounts one rollup per paper row; React strict-mode double-effects and
 * re-renders would re-fire identical resolves). Keyed by the identity pair
 * + token presence; a 404's null is KEPT for the session (honest — a
 * not-ingested paper does not become ingested mid-page).
 */
const resolveMemo = new Map<string, Promise<MirroredPaperAssetResolve | null>>();

export function resolvePaperAssetCached(
  paperCode: string,
  sessionLabel: string,
  token: string | null,
): Promise<MirroredPaperAssetResolve | null> {
  const key = `${paperCode}|${sessionLabel}|${token ? "auth" : "anon"}`;
  let p = resolveMemo.get(key);
  if (!p) {
    p = resolvePaperAsset(paperCode, sessionLabel, token).catch(() => null);
    resolveMemo.set(key, p);
  }
  return p;
}
