/**
 * Hub-side paper-marks client — T-MG-CROPMARK-1 run-002 (plan of record:
 * docs/MG-MARK-PARITY-PLAN.md §3.4; the crop producer's wire half over the
 * run-001 202+poll API). lib/pdf-drawings.ts discipline mirrored verbatim:
 *
 * - SCHEMA MIRROR law: the hub resolves zod v4 while packages/contracts
 *   builds on v3 — the strict serving shapes are mirrored LOCALLY and the
 *   canonical shapes are imported TYPE-ONLY. Structural, never behavioral:
 *   drift fails THIS parse first, loudly.
 * - HONEST-OUTCOME law: the DEFINED outcomes are typed (the api's own
 *   taxonomy — 202 accepted; 400/404/413/422 rejection envelopes; the
 *   poll's queued/running/succeeded/failed; the 404 unknown-mark of the
 *   non-durable registry) and everything undefined (network, 5xx, garbage)
 *   collapses to the honest "failed" class — never a fabricated markId,
 *   never a fabricated award.
 * - no-store: a mark job is the learner's live interaction; a cached
 *   snapshot would lie about a terminal state.
 * - POSTURE: the learner rides the JWT — the token is caller-supplied
 *   (localStorage["syllabai.token"], the v0 pilot posture); no learnerId
 *   ever appears on a wire shape.
 * - retry: 0 (their offline class): the client never re-POSTs a mark; a
 *   re-mark is a NEW job (the once-only claim absorbs duplicate writes
 *   idempotently — the run-001 receipt law).
 */
import { z } from "zod";

import type { PaperMarkAccepted, PaperMarkPollResponse } from "@syllabai/contracts";

// ── the strict-shape mirrors (paperMarkAcceptedSchema / paperMarkPollResponseSchema) ──

const assembledAwardMirror = z.object({
  code: z.string().min(1),
  awarded: z.boolean(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  ordinal: z.number().int().min(0),
  markPointId: z.string().uuid().nullable(),
  page: z.number().int().min(1).nullable(),
});

const feedbackMirror = z.object({
  attempt: z.string().min(1),
  chatMessage: z.string(),
  pointsScored: z.array(z.string()),
  pointsNotScored: z.array(z.string()),
  thoughtProcess: z.string(),
  strategiesForImprovement: z.array(z.string()),
});

const pollSnapshotMirror = z.object({
  markId: z.string().uuid(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  pipelineVersion: z.string().min(1).optional(),
  regionKey: z.string().min(1).optional(),
  transcription: z.string().optional(),
  feedback: feedbackMirror.optional(),
  awards: z.array(assembledAwardMirror).optional(),
  receipt: z
    .object({
      emitted: z.number().int().min(0),
      suppressed: z.number().int().min(0),
      workingBlocks: z.number().int().min(0),
    })
    .optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
  queuedAt: z.string().min(1),
  completedAt: z.string().nullable(),
});

export type MirroredPollSnapshot = z.infer<typeof pollSnapshotMirror>;

const acceptedMirror = z.object({
  markId: z.string().uuid(),
  status: z.literal("queued"),
});

/** The api's honest error envelope (ApiErrorBody: {error, message, ...}). */
const apiErrorMirror = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
});

/** Core origin, client-safe (the regions.ts/pdf-drawings.ts resolution). */
function marksBaseUrl(): string | null {
  const raw = process.env.SYLLABAI_CORE_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/$/, "").replace(/\/api\/v1$/, "");
}

function authHeaders(token: string | null): HeadersInit {
  return { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** The defined POST /regions/:regionId/mark outcomes. */
export type RegionMarkRequestResult =
  | { outcome: "accepted"; markId: string }
  | { outcome: "rejected"; message: string }
  | { outcome: "unconfigured" }
  | { outcome: "no_token" }
  | { outcome: "failed" };

/**
 * POST /api/v1/paper-marks/regions/:regionId/mark {imageDataUrl}.
 * 202 → accepted {markId} (the poll handle; the client polls, never
 * re-POSTs). The DEFINED 4xx envelopes (malformed/crop_malformed 400 ·
 * crop_too_large 413 · unknown region 404 · no_mark_points 422) surface
 * their honest message as "rejected"; everything else is "failed".
 */
export async function requestRegionMark(
  regionId: string,
  imageDataUrl: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<RegionMarkRequestResult> {
  // Token-first: a signed-out learner is no_token regardless of server
  // config (the caller-supplied posture); unconfigured is the honest
  // missing-origin class.
  if (!token) return { outcome: "no_token" };
  const base = marksBaseUrl();
  if (!base) return { outcome: "unconfigured" };
  try {
    const res = await fetchImpl(`${base}/api/v1/paper-marks/regions/${encodeURIComponent(regionId)}/mark`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ imageDataUrl }),
    });
    if (res.status === 202) {
      const parsed = acceptedMirror.safeParse(await res.json().catch(() => null));
      return parsed.success
        ? { outcome: "accepted", markId: (parsed.data as PaperMarkAccepted).markId }
        : { outcome: "failed" };
    }
    if (res.status === 400 || res.status === 404 || res.status === 413 || res.status === 422) {
      const env = apiErrorMirror.safeParse(await res.json().catch(() => null));
      return env.success
        ? { outcome: "rejected", message: env.data.message }
        : { outcome: "rejected", message: `marking refused the crop (HTTP ${res.status})` };
    }
    return { outcome: "failed" };
  } catch {
    return { outcome: "failed" };
  }
}

/** The defined GET /marks/:markId outcomes. */
export type MarkPollResult =
  | { outcome: "snapshot"; snapshot: MirroredPollSnapshot }
  | { outcome: "unknown" }
  | { outcome: "no_token" }
  | { outcome: "failed" };

/**
 * GET /api/v1/paper-marks/marks/:markId — one poll step. "unknown" is the
 * non-durable registry's honest restart path (the job no longer exists) —
 * a DEFINED outcome, surfaced as such, never retried into a fabrication.
 */
export async function pollMark(
  markId: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<MarkPollResult> {
  const base = marksBaseUrl();
  if (!base) return { outcome: "failed" };
  if (!token) return { outcome: "no_token" };
  try {
    const res = await fetchImpl(`${base}/api/v1/paper-marks/marks/${encodeURIComponent(markId)}`, {
      headers: authHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return { outcome: "unknown" };
    if (!res.ok) return { outcome: "failed" };
    const parsed = pollSnapshotMirror.safeParse(await res.json().catch(() => null));
    return parsed.success
      ? { outcome: "snapshot", snapshot: parsed.data as PaperMarkPollResponse }
      : { outcome: "failed" };
  } catch {
    return { outcome: "failed" };
  }
}

export interface PollLoopDeps {
  markId: string;
  token: string | null;
  /** Poll cadence (default 1.2 s — the job lifecycle is a vision+LLM run). */
  intervalMs?: number;
  /** Terminal-observation cap (default 100 ≈ 2 min) — the honest "timeout"
   * afterwards; the panel's Check again resumes the SAME markId (never a
   * re-POST — retry: 0). */
  maxPolls?: number;
  /** Injectable waiter (tests run synchronously). */
  delay?: (ms: number) => Promise<void>;
  poll?: typeof pollMark;
  /** Cooperative cancellation (panel dismissed / layer unmounted). */
  isCancelled?: () => boolean;
}

export type PollLoopResult =
  | { status: "succeeded"; snapshot: MirroredPollSnapshot }
  | { status: "failed"; snapshot: MirroredPollSnapshot | null }
  | { status: "timeout"; markId: string }
  | { status: "lost" }
  | { status: "cancelled" };

/**
 * The poll loop of record: poll until a terminal snapshot (succeeded |
 * failed), the honest lost (unknown), the cap (timeout), or cancellation.
 * NEVER re-POSTs — the markId is the only handle.
 */
export async function pollUntilTerminal(deps: PollLoopDeps): Promise<PollLoopResult> {
  const intervalMs = deps.intervalMs ?? 1_200;
  const maxPolls = deps.maxPolls ?? 100;
  const delay =
    deps.delay ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const poll = deps.poll ?? pollMark;
  let last: MirroredPollSnapshot | null = null;
  for (let i = 0; i < maxPolls; i += 1) {
    if (deps.isCancelled?.()) return { status: "cancelled" };
    if (i > 0) await delay(intervalMs);
    if (deps.isCancelled?.()) return { status: "cancelled" };
    const step = await poll(deps.markId, deps.token);
    if (step.outcome === "unknown") return { status: "lost" };
    if (step.outcome === "snapshot") {
      last = step.snapshot;
      if (step.snapshot.status === "succeeded") return { status: "succeeded", snapshot: step.snapshot };
      if (step.snapshot.status === "failed") return { status: "failed", snapshot: step.snapshot };
      continue; // queued | running — the honest interim
    }
    return { status: "failed", snapshot: last }; // failed | no_token — the undefined class
  }
  return { status: "timeout", markId: deps.markId };
}

// ── T-MG-FEEDBACK-1 run-001 — the ledger read (plan §3.6 surfaces) ──────────
// GET /api/v1/paper-marks — the getRegionMarks contract (the Phase-2
// servedMarkAward/servedRegionMarks/paperMarksLedger shapes, mirrored per
// the SCHEMA MIRROR law above; canonical shapes imported TYPE-ONLY).

const servedAwardMirror = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  awarded: z.boolean(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  ordinal: z.number().int().min(0),
  markPointId: z.string().uuid().nullable(),
  page: z.number().int().min(1).nullable(),
  workingRef: z.string().uuid().nullable(),
  pipelineVersion: z.string().min(1),
  feedback: feedbackMirror,
  createdAt: z.string(),
});

const servedWorkingBlockMirror = z.object({
  id: z.string().uuid(),
  kind: z.enum(["ink", "text", "structure"]),
  content: z.unknown(),
  createdAt: z.string(),
});

const regionMarksMirror = z.object({
  regionKey: z.string().min(1),
  page: z.number().int().min(1).nullable(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(0),
  awards: z.array(servedAwardMirror),
  workingBlocks: z.array(servedWorkingBlockMirror),
});

const ledgerMirror = z.object({
  documentRefType: z.enum([
    "printable",
    "paper_asset",
    "uploaded_paper",
    "daily_five_sheet",
    "collection_worksheet",
    "paper_mark_submission",
  ]),
  documentRefId: z.string().uuid(),
  regions: z.array(regionMarksMirror),
});

export type MirroredPaperMarksLedger = z.infer<typeof ledgerMirror>;

/** The defined GET ledger outcomes (the honest-outcome law, run-002 shape). */
export type PaperMarksLedgerResult =
  | { outcome: "ledger"; ledger: MirroredPaperMarksLedger }
  | { outcome: "no_token" }
  | { outcome: "unconfigured" }
  | { outcome: "failed" };

/**
 * GET /api/v1/paper-marks?documentRefType=paper_asset&documentRefId=<uuid>
 * — the CALLING learner's award ledger for one paper (Phase-2 posture: the
 * learner rides the JWT, never the wire). The 200 honest-empty
 * (regions: []) is a DEFINED outcome; everything undefined (network, 5xx,
 * garbage) collapses to "failed" — never a fabricated ledger.
 */
export async function fetchPaperMarksLedger(
  documentRefId: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PaperMarksLedgerResult> {
  if (!token) return { outcome: "no_token" };
  const base = marksBaseUrl();
  if (!base) return { outcome: "unconfigured" };
  try {
    const qs = `documentRefType=paper_asset&documentRefId=${encodeURIComponent(documentRefId)}`;
    const res = await fetchImpl(`${base}/api/v1/paper-marks?${qs}`, {
      headers: authHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { outcome: "failed" };
    const parsed = ledgerMirror.safeParse(await res.json().catch(() => null));
    return parsed.success
      ? { outcome: "ledger", ledger: parsed.data as MirroredPaperMarksLedger }
      : { outcome: "failed" };
  } catch {
    return { outcome: "failed" };
  }
}
