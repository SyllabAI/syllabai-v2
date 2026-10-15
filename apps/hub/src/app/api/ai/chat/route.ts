import { NextRequest } from "next/server";
import { z } from "zod";
import {
  coreStreamAuthorized,
  coreFetchAuthorized,
  coreErrorDetail,
} from "@/lib/core-proxy";
import { v2SurfaceBase } from "@/lib/api";
import { v2StreamAuthorized, v2FetchAuthorized, type V2FetchResult } from "@/lib/v2-proxy";
import {
  bankAxisLabel,
  bankPaperLeadIn,
  bankQuestionsLeadIn,
  classifyBankIntent,
  type BankIntent,
} from "@syllabai/shared";
import {
  surfaceForCourseRef,
  mapCitation,
  type CoreCitation,
  type CitationSurface,
} from "@/lib/citation-map";
import { rateLimit, rateLimitKey, rateLimitResponse, type RateLimitRule } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  question: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(12)
    .default([]),
  /** §22 session to persist the exchange to (web s140 parity) — optional;
   *  core fails fast with 404 when the id is foreign/unknown, before any
   *  LLM spend. The per-turn 2000-char bound mirrors core's HistoryTurn
   *  validation (the old 4000 cap would 400 any long answer's next ask). */
  sessionId: z.string().uuid().optional(),
  /** V53 (ADR-030): the opaque hub-supplied course reference the ask is
   *  scoped by (the registry's curriculumCode) — optional; core resolves it
   *  fail-closed against its own registry and refuses cross-course asks.
   *  Absent = the legacy course-less ask (pilot behavior unchanged). */
  courseRef: z.string().max(64).optional(),
});

/** Core TutorAnswerView (lib/types.ts mirror — kept local so this route
 *  stays self-contained against the DTO the legacy fallback reads). */
interface CoreTutorAnswer {
  answer: string;
  citations: CoreCitation[];
  evidenceCount: number;
  model: string | null;
  provider: string;
  refused: boolean;
  latencyMs: number;
}

// ── the tutor bank bands (T-MIG-130, the T-MIG-128/129 hub wiring) ─────
//
// Structural mirrors of the v2 contracts (packages/contracts/src/tutor.ts,
// tutorBank*Schema) — the same trust posture as CoreTutorAnswer above: the
// upstream is this repo's own typed surface, the payloads pass through to
// the browser unreshaped (wire truth), and the renderer stays defensive.

interface BankPaperRef {
  paperId: string;
  title: string | null;
  paperCode: string | null;
  sessionLabel: string | null;
  series: string | null;
  year: number | null;
  validationState: string;
}

interface BankQuestionItem {
  questionId: string;
  externalRef: string | null;
  questionType: string | null;
  stem: string;
  marks: number;
  commandWord: string | null;
  specPointCodes: string[];
  paper: BankPaperRef | null;
}

interface BankQuestionsView {
  resolvedNodes: { id: string; nodeType: string; title: string; code: string | null }[];
  total: number;
  items: BankQuestionItem[];
}

interface BankPaperDocumentView {
  documentId: string | null;
  chunkCount: number;
  chunks: {
    chunkIndex: number;
    documentRowId: string;
    documentId: string;
    pageStart: number | null;
    pageEnd: number | null;
    content: string;
    atomNumber: string | null;
  }[];
}

interface BankPaperFullView {
  paper: BankPaperRef;
  questions: BankQuestionItem[];
  questionPaper: BankPaperDocumentView;
  markScheme: BankPaperDocumentView;
  siblings: BankPaperRef[];
}

export type BankBandPayload =
  | { kind: "questions"; view: BankQuestionsView }
  | { kind: "paper"; view: BankPaperFullView };

/** The bank probe ceiling (ms): a hung v2 must never delay the fall-through
 *  to the grounded ask — the bands are an enhancement layer, never a gate. */
const BANK_PROBE_TIMEOUT_MS = 10_000;

/** The chat-render census cap for band (1): the view carries the honest
 *  total; the items list is what the card scrolls. */
const BANK_QUESTIONS_LIMIT = 25;

/** The deterministic pre-flight: classify → probe → a self-built band SSE
 *  (band → meta → delta lead-in → done). Returns null on EVERY
 *  non-resolving path — no v2 base (the one-env-var rollback), a
 *  non-matching question (the classifier is precision-first), a probe
 *  error/timeout, a non-200, a non-binding identity (404) or an empty
 *  census — and the caller serves the ALWAYS-ON grounded ask unchanged.
 *  Zero LLM: the bands are metadata + bank rows only (the 128/129 law). */
async function tryBankBand(question: string, token: string): Promise<Response | null> {
  const intent: BankIntent = classifyBankIntent(question);
  if (!intent) return null;

  // the table-governed upstream decision — the bank family rides its own
  // narrow row; an unset v2 base (rollback) skips the bands entirely
  const bankBase = v2SurfaceBase("/api/v1/tutor/bank", process.env.NEXT_PUBLIC_API_V2_BASE_URL);
  if (!bankBase) return null;

  const path =
    intent.kind === "paper"
      ? `/api/v1/tutor/bank/paper?q=${encodeURIComponent(question.trim())}`
      : `/api/v1/tutor/bank/questions?${new URLSearchParams({
          ...(intent.spec ? { spec: intent.spec } : {}),
          ...(intent.topic ? { topic: intent.topic } : {}),
          limit: String(BANK_QUESTIONS_LIMIT),
        })}`;

  let probe: V2FetchResult<unknown>;
  try {
    probe = await v2FetchAuthorized<unknown>(bankBase, path, {
      method: "GET",
      token,
      timeoutMs: BANK_PROBE_TIMEOUT_MS,
    });
  } catch {
    return null; // probe never gates the tutor
  }
  if (!probe.ok || probe.data == null || typeof probe.data !== "object") return null;

  let payload: BankBandPayload;
  if (intent.kind === "paper") {
    payload = { kind: "paper", view: probe.data as BankPaperFullView };
  } else {
    const view = probe.data as BankQuestionsView;
    // an empty census is NOT a band answer — the grounded ask may still
    // teach the topic from the corpus (honest empty → fall through)
    if (!Array.isArray(view.items) || view.items.length === 0) return null;
    payload = { kind: "questions", view };
  }

  return bankBandStream(payload, bandLeadIn(payload, intent));
}

/** The band turn's deterministic lead-in — the content string the transcript,
 *  copy, export and future-ask history all read (the card renders below it). */
function bandLeadIn(payload: BankBandPayload, intent: BankIntent): string {
  if (payload.kind === "paper") {
    const v = payload.view;
    return bankPaperLeadIn(
      v.paper,
      v.questions.length,
      v.questions.reduce((s, q) => s + (q.marks || 0), 0),
      v.siblings.map((s) => s.paperCode).filter((c): c is string => c != null),
    );
  }
  return bankQuestionsLeadIn(
    payload.view.total,
    payload.view.items.length,
    bankAxisLabel(intent && intent.kind === "questions" ? intent : { kind: "questions" }),
  );
}

/** The band SSE — the same frame vocabulary as the ask stream, with ONE new
 *  event: `band` carries the structured view for the chat card; meta marks
 *  the turn provider ("bank" — deterministic, no model involved); the
 *  delta is the lead-in; done closes. Sends are guarded: a consumer gone
 *  mid-probe must not crash the route. */
function bankBandStream(payload: BankBandPayload, leadIn: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        // the wrapped envelope (the citations frame's convention) — the
        // structured view rides `.band`, room for probe metadata later
        send("band", { band: payload });
        send("meta", { provider: "bank", model: null, refused: false, evidenceCount: 0 });
        send("delta", { text: leadIn });
        send("done", { ok: true });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* the consumer vanished first — nothing to close */
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

/**
 * Phase-1 hardening: burst + sustained caps for one learner on the tutor
 * relay (a real tutor turn takes seconds; nobody legitimate needs more).
 * Per-instance on serverless — see lib/rate-limit.ts for the honesty note;
 * core's own per-JWT limiter stays authoritative.
 */
const CHAT_LIMITS: RateLimitRule[] = [
  { limit: 10, windowMs: 60_000 },
  { limit: 60, windowMs: 3_600_000 },
];

/**
 * POST /api/ai/chat — grounded tutor. B3 (T-MIG-118): the ALWAYS-ON upstream
 * is the v2 api (`/api/v1/tutor/ask/stream`, the 106 flipped pair row) —
 * the table-governed decision is v2SurfaceBase per path, with the core path
 * surviving ONLY as the pinned one-env-var rollback fallback (MIGRATION_PLAN
 * §7; the claAskFetch precedent). The browser contract is unchanged.
 *
 * Streaming contract (tutor SSE tranche): the upstream generates
 * token-incrementally with the signed-in learner's JWT forwarded — this repo
 * holds no LLM keys. The proxy pipes the SSE through in real time
 * (citations → meta → delta → done), remapping only the citation payloads
 * into the hub's citation shape. v2's stream is the line-against-line port
 * of core's (TutorController.askStream :208-256 — routes/tutor.ts :307-381),
 * so the frames, the event vocabulary and the pre-flight error classes are
 * the same contract (the 106 declared divergence — the DESIGNED 400/404
 * where the frozen core's stream controller served 500 — is of record).
 *
 * Honest degradation paths:
 * - the upstream answers JSON on the stream path (a pre-stream error class
 *   delivered as a JSON body, or a legacy upstream) → the blocking
 *   adaptation keeps the tutor up through any deploy order;
 * - upstream errors before the stream opens → the same JSON error mapping
 *   as before (401/429/503 with client-safe guidance);
 * - the upstream dies mid-stream → its `error` event passes through and
 *   the chat renders the honest error state on the partial answer;
 * - the v2 env var unset (rollback) → every path reverts to core.
 *
 * Thread transcripts persist to the §22 session store when the client
 * binds one (HUB-TUTOR-SESSIONS): the sessionId rides the ask, the
 * upstream appends the completed exchange (stream: on the Completed event
 * only; legacy
 * fallback: server-side inside /ask), and the conversations pane reads the
 * same store back. A thread without a binding asks unpersisted, exactly as
 * before.
 */
export async function POST(req: NextRequest) {
  const token =
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
    (req.cookies.get("syllabai.token")?.value ?? null);

  // Rate-limit BEFORE any body parsing or core fan-out; anonymous callers
  // key on IP and fall through to the 401 below.
  const limited = rateLimit(rateLimitKey(req, "ai/chat"), CHAT_LIMITS);
  if (!limited.ok) return rateLimitResponse(limited);

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return Response.json(
      { error: "invalid_body", detail: e instanceof Error ? e.message.slice(0, 200) : "bad request" },
      { status: 400 },
    );
  }

  if (!token) {
    return Response.json(
      { error: "unauthorized", detail: "Sign in to use the tutor — it runs on your SyllabAI account." },
      { status: 401 },
    );
  }

  // T-MIG-130: the deterministic bank bands — a precision-first classifier
  // decides whether this question is a whole-paper fetch or a question-
  // listing census; a resolving probe serves the structured view + a
  // deterministic lead-in with ZERO LLM involvement, and EVERY
  // non-resolving path falls through to the grounded ask below (the bands
  // are an enhancement layer, never a gate).
  const band = await tryBankBand(parsed.question, token);
  if (band) return band;

  const coreBody = {
    question: parsed.question,
    history: parsed.history.map((h) => ({ role: h.role, text: h.content })),
    ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
    // V53: the ref rides BOTH delivery paths — the stream proxy above and
    // the legacy blocking fallback below — so deploy skew between hub and
    // core can never strand the field
    ...(parsed.courseRef ? { courseRef: parsed.courseRef } : {}),
  };

  // the per-ask citation surface: when the ask is course-scoped and that
  // course ships a graph, KNOWLEDGE_NODE citations deep-link to its explorer
  // (the bridge in citation-map decides per link — honest nulls otherwise)
  const surface = await surfaceForCourseRef(parsed.courseRef);

  // B3 (T-MIG-118): the table-governed upstream decision — v2 first (the
  // 106 pair row resolves the stream path), core only on rollback (env
  // unset). The shapes are structural mirrors; the mapping below is shared.
  const streamPath = "/api/v1/tutor/ask/stream";
  const v2Base = v2SurfaceBase(streamPath, process.env.NEXT_PUBLIC_API_V2_BASE_URL);
  let result: Awaited<ReturnType<typeof coreStreamAuthorized>>;
  try {
    result = v2Base
      ? await v2StreamAuthorized(v2Base, streamPath, {
          method: "POST",
          token,
          body: coreBody,
          // the learner's own abort (stop button, navigation) releases the
          // upstream fetch — the upstream stops generating for a gone reader
          signal: req.signal,
        })
      : await coreStreamAuthorized(streamPath, {
          method: "POST",
          token,
          body: coreBody,
          signal: req.signal,
        });
  } catch {
    return Response.json(
      { error: "core_unreachable", detail: "The SyllabAI backend is waking up — try again in a few seconds." },
      { status: 503 },
    );
  }

  if (!result.ok) {
    const status = result.status === 401 || result.status === 403 ? 401 : result.status;
    // deploy skew / legacy core: the stream endpoint 404s — retry the
    // blocking ask and keep the tutor up with the re-chunked stream
    if (result.status === 404) {
      return legacyBlockingFallback(token, coreBody, surface);
    }
    const detail =
      status === 401
        ? "Your session expired — sign in again to continue."
        : result.status === 429
          ? "The tutor is busy right now — wait a moment and ask again."
          : coreErrorDetail(result.errorBody, "The tutor call failed on the backend.");
    return Response.json({ error: status === 401 ? "unauthorized" : "core_error", detail }, { status });
  }

  const upstream = result.response!;
  if (result.contentType?.includes("application/json")) {
    // legacy core answered the stream path with a JSON body (old build on a
    // warm route) — degrade to the blocking adaptation
    return legacyFromJsonResponse(upstream, surface);
  }

  return pipeSse(upstream, surface, req.signal);
}

// ── streaming passthrough ────────────────────────────────────────────────

/**
 * Pipe core's SSE through, remapping `citations` payloads into the hub's
 * citation shape and forwarding meta/delta/done/error verbatim. A `: ping`
 * comment every 15s keeps intermediate proxies from closing an idle
 * connection (core's citations arrive fast, but a Render cold start delays
 * the HEADERS — that window is covered by the fetch's AbortSignal, and a
 * cold start that already returned can still trickle slowly).
 *
 * `clientGone` is the request's abort signal: a stop press / navigation /
 * proxy cut flips it, the upstream fetch aborts (the signal is composed
 * into coreStreamAuthorized's fetch) and the pipe releases core's LLM call
 * instead of streaming into a dead connection.
 */
function pipeSse(upstream: Response, surface: CitationSurface, clientGone: AbortSignal): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      /** send/ping are guarded: once the consumer is gone (abort, external
       *  cancel) the controller refuses further enqueues and a bare throw
       *  here would mask the honest error path */
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true; // consumer vanished mid-frame
        }
      };

      const ping = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(ping, 15_000);

      const onClientGone = () => {
        closed = true;
        clearInterval(heartbeat);
        void upstream.body?.cancel().catch(() => {});
      };
      if (clientGone.aborted) onClientGone();
      else clientGone.addEventListener("abort", onClientGone, { once: true });

      const reader = upstream.body!.getReader();
      let buffer = "";
      /** spec-compliant SSE field read: ONE optional leading space after the
       *  colon — Spring's SseEmitter writes `event:name` (no space), our own
       *  legacy fallback writes `event: name` (with space) */
      const field = (frame: string, name: string): string | undefined => {
        const line = frame.split("\n").find((l) => l.startsWith(`${name}:`));
        if (line === undefined) return undefined;
        const value = line.slice(name.length + 1);
        return value.startsWith(" ") ? value.slice(1) : value;
      };
      /** the terminal handshake — done OR error observed from upstream */
      let sawTerminal = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const event = field(frame, "event");
            const dataLine = field(frame, "data");
            if (!event || !dataLine) continue; // comments / heartbeats
            let data: unknown;
            try {
              data = JSON.parse(dataLine);
            } catch {
              continue; // a truncated frame — the next chunk completes it
            }
            if (event === "citations" && data && typeof data === "object") {
              const d = data as { citations?: CoreCitation[]; sufficient?: boolean };
              // explicit (c, i) — a bare .map(mapCitation) would hand the
              // ARRAY in as the surface argument
              send("citations", {
                citations: (d.citations ?? []).map((c, i) => mapCitation(c, i, surface)),
                sufficient: d.sufficient ?? false,
              });
            } else {
              // meta / delta / done / error — core's shapes ARE the browser contract
              if (event === "done" || event === "error") sawTerminal = true;
              send(event, data);
            }
          }
        }
        // honesty: an upstream that ends WITHOUT the terminal handshake
        // (proxy cut, Render idle timeout, core bug) must not pass as a
        // complete answer — say so on the same channel
        if (!sawTerminal) {
          send("error", { message: "The tutor stream ended before completion — please ask again." });
        }
      } catch {
        // upstream died mid-stream — tell the reader honestly
        if (!closed) {
          send("error", { message: "The tutor stream was interrupted — please ask again." });
        }
      } finally {
        clearInterval(heartbeat);
        clientGone.removeEventListener("abort", onClientGone);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      // Next may cancel the response stream without req.signal having fired —
      // release the upstream stream (and core's LLM call) either way
      void upstream.body?.cancel().catch(() => {});
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

// ── legacy degradation (deploy skew / old core) ──────────────────────────

/** Blocking `/ask` + re-chunk — the pre-stream adaptation, kept verbatim so
 *  hub deploys never outpace core deploys. */
async function legacyBlockingFallback(
  token: string,
  coreBody: {
    question: string;
    history: { role: string; text: string }[];
    sessionId?: string;
    courseRef?: string;
  },
  surface: CitationSurface,
): Promise<Response> {
  try {
    // B3: the blocking twin rides the same table decision (the 106 pair row
    // resolves both /ask and /ask/stream) — v2 first, core on rollback.
    const askPath = "/api/v1/tutor/ask";
    const askV2 = v2SurfaceBase(askPath, process.env.NEXT_PUBLIC_API_V2_BASE_URL);
    const result = askV2
      ? await v2FetchAuthorized<CoreTutorAnswer>(askV2, askPath, {
          method: "POST",
          token,
          body: coreBody,
        })
      : await coreFetchAuthorized<CoreTutorAnswer>(askPath, {
          method: "POST",
          token,
          body: coreBody,
        });
    if (!result.ok || !result.data) {
      const status = result.status === 401 || result.status === 403 ? 401 : result.status;
      const detail =
        status === 401
          ? "Your session expired — sign in again to continue."
          : result.status === 429
            ? "The tutor is busy right now — wait a moment and ask again."
            : coreErrorDetail(result.errorBody, "The tutor call failed on the backend.");
      return Response.json({ error: status === 401 ? "unauthorized" : "core_error", detail }, { status });
    }
    return chunkedStream(result.data, surface);
  } catch {
    return Response.json(
      { error: "core_unreachable", detail: "The SyllabAI backend is waking up — try again in a few seconds." },
      { status: 503 },
    );
  }
}

/** A 200-JSON response from the stream path (legacy core): same adaptation. */
async function legacyFromJsonResponse(upstream: Response, surface: CitationSurface): Promise<Response> {
  try {
    const turn = (await upstream.json()) as CoreTutorAnswer;
    return chunkedStream(turn, surface);
  } catch {
    return Response.json(
      { error: "core_error", detail: "The tutor call failed on the backend." },
      { status: 502 },
    );
  }
}

function chunkedStream(turn: CoreTutorAnswer, surface: CitationSurface): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        send("citations", {
          citations: turn.citations.map((c, i) => mapCitation(c, i, surface)),
          sufficient: turn.evidenceCount > 0,
        });
        send("meta", {
          provider: turn.provider,
          model: turn.model,
          refused: turn.refused,
          evidenceCount: turn.evidenceCount,
        });
        const chunks = turn.answer.match(/[\s\S]{1,48}/g) ?? [];
        for (const c of chunks) {
          send("delta", { text: c });
          await new Promise((r) => setTimeout(r, 12));
        }
        send("done", { ok: true });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
