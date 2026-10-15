import "server-only";

/**
 * Server-side v2 proxy helpers — the v2 mirror of core-proxy.ts.
 *
 * B3 (T-MIG-118): the tutor SSE re-point. The chat route's ALWAYS-ON
 * upstream becomes the v2 api; the core path survives ONLY as the pinned
 * one-env-var rollback fallback (MIGRATION_PLAN §7), decided ONE layer up
 * by the consuming route via v2SurfaceBase (the table is the decision
 * surface — the 111 "per-exact-subpath, NEVER the bare parent" law holds
 * here as the per-path consultation). The live precedent this mirrors is
 * claAskFetch (apps/hub/src/app/api/ai/cla/route.ts :226-231,
 * table-governed with the core fallback since T-MIG-097).
 *
 * The base URL arrives from the caller (v2SurfaceBase's resolution of
 * NEXT_PUBLIC_API_V2_BASE_URL — the same env the client flip table uses;
 * runtime-visible in server routes, the claAskFetch class). These helpers
 * NEVER decide: they fetch where they are told.
 *
 * Shapes are byte-mirrors of CoreFetchResult / CoreStreamResult so the
 * consuming route's error mapping is untouched (the browser contract is
 * unchanged — only the upstream moves).
 */

export interface V2FetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorBody: unknown;
}

/** Authenticated server-side call against v2; never throws for HTTP
 *  verdicts — returns them so routes can map status → client guidance.
 *  `timeoutMs` tightens the 120s default for the fast-fail probes (the
 *  T-MIG-130 bank pre-flight: a hung upstream must never delay the
 *  fall-through to the grounded ask). */
export async function v2FetchAuthorized<T>(
  base: string,
  path: string,
  init: { method: "GET" | "POST"; token: string | null; body?: unknown; timeoutMs?: number },
): Promise<V2FetchResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;

  const res = await fetch(`${base}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
    // server-side proxies must not be cached by Next's data cache
    cache: "no-store",
  });
  if (res.ok) {
    return { ok: true, status: res.status, data: (await res.json()) as T, errorBody: null };
  }
  let errorBody: unknown = null;
  try {
    errorBody = await res.json();
  } catch {
    errorBody = null;
  }
  return { ok: false, status: res.status, data: null, errorBody };
}

export interface V2StreamResult {
  ok: boolean;
  status: number;
  /** media type of the response — "text/event-stream" for the streaming
   *  contract; a JSON content type on ok means a non-streaming upstream
   *  answered (the route's legacy adaptation covers it). */
  contentType: string | null;
  /** the raw response — present when ok (body NOT consumed) */
  response: Response | null;
  errorBody: unknown;
}

/** Authenticated server-side call against v2 that returns the RAW response
 *  for streaming consumption (the tutor SSE re-point). Never parses the
 *  body: the caller decides whether to pipe the SSE through. The
 *  AbortSignal semantics mirror coreStreamAuthorized exactly (the hard
 *  120s wall-clock ceiling composed with the client-gone signal via
 *  AbortSignal.any) — the browser-visible timeout behavior is unchanged. */
export async function v2StreamAuthorized(
  base: string,
  path: string,
  init: { method: "POST"; token: string | null; body?: unknown; signal?: AbortSignal },
): Promise<V2StreamResult> {
  const res = await fetch(`${base}${path}`, {
    method: init.method,
    headers: {
      Accept: "text/event-stream, application/json",
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal
      ? AbortSignal.any([AbortSignal.timeout(120_000), init.signal])
      : AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  const contentType = res.headers.get("content-type");
  if (res.ok) {
    return { ok: true, status: res.status, contentType, response: res, errorBody: null };
  }
  let errorBody: unknown = null;
  try {
    errorBody = await res.json();
  } catch {
    errorBody = null;
  }
  return { ok: false, status: res.status, contentType, response: null, errorBody };
}
