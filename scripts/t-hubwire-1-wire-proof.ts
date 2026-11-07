/**
 * T-HUBWIRE-1 run-001 — the hub↔api wire-proof driver of record.
 *
 * Probes the LIVE deployment topology and fails closed when the hub's
 * browser-direct API origin is not actually serving the v2 api. Zero deps,
 * stdlib fetch only (bun test or node >= 18). No secrets: unauthenticated
 * GETs against public origins only.
 *
 *   bun scripts/t-hubwire-1-wire-proof.ts \
 *     [--hub https://www.syllab-ai.com] \
 *     [--api https://api.syllab-ai.com] \
 *     [--api-fallback https://syllabai-v2-six.vercel.app]
 *
 * Exit codes:
 *   0  ALL-GREEN   — hub live AND the browser-direct api origin serves the
 *                    v2 api JSON envelope class
 *   2  WIRE-BROKEN — hub live but the browser-direct api origin does NOT
 *                    serve the v2 api (the 2026-11-06 incident class: an
 *                    unattached custom host serving Vercel's generic
 *                    text/plain NOT_FOUND at the edge)
 *   3  PROBE-ENV   — a listed origin could not be fetched at all (network
 *                    layer failure, not an HTTP verdict)
 *
 * The classification law: a JSON content-type on ANY status (401 included)
 * means the v2 api is serving — the api answers with JSON envelopes
 * ({timestamp,status,error,path}) even on auth failures. Vercel's edge
 * serves text/plain "NOT_FOUND" pages for hostnames no project claims.
 * Nothing in between counts.
 */

interface Opts {
  hub: string;
  api: string;
  apiFallback: string;
}

function parseOpts(argv: string[]): Opts {
  const o: Opts = {
    hub: "https://www.syllab-ai.com",
    api: "https://api.syllab-ai.com",
    apiFallback: "https://syllabai-v2-six.vercel.app",
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--hub") o.hub = argv[++i];
    else if (argv[i] === "--api") o.api = argv[++i];
    else if (argv[i] === "--api-fallback") o.apiFallback = argv[++i];
  }
  for (const k of ["hub", "api", "apiFallback"] as const) {
    o[k] = o[k].replace(/\/$/, "");
  }
  return o;
}

const UA = "syllabai-wire-proof/t-hubwire-1";

interface Probe {
  ok: boolean; // transport-level: got any HTTP response
  status: number | null;
  contentType: string | null;
  bodyHead: string;
}

async function probe(url: string, timeoutMs = 10_000): Promise<Probe> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    const body = (await res.text()).slice(0, 220).replace(/\s+/g, " ");
    return {
      ok: true,
      status: res.status,
      contentType: res.headers.get("content-type"),
      bodyHead: body,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    return { ok: false, status: null, contentType: null, bodyHead: `transport error: ${name}` };
  }
}

type ApiVerdict = "v2-api" | "edge-not-found" | "other" | "transport";

function classifyApi(p: Probe): ApiVerdict {
  if (!p.ok) return "transport";
  const ct = p.contentType ?? "";
  if (ct.includes("application/json")) return "v2-api";
  if (ct.startsWith("text/plain") && p.bodyHead.includes("NOT_FOUND")) return "edge-not-found";
  return "other";
}

function extractConnectSrc(csp: string | null): string[] {
  if (!csp) return [];
  const dir = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("connect-src"));
  if (!dir) return [];
  return dir.split(/\s+/).slice(1).filter(Boolean);
}

async function main(): Promise<number> {
  const o = parseOpts(process.argv.slice(2));
  const receipts: string[] = [];
  const stamp = new Date().toISOString();
  console.log(`T-HUBWIRE-1 wire-proof @ ${stamp}`);
  console.log(`  hub=${o.hub}  api=${o.api}  api-fallback=${o.apiFallback}\n`);

  // ── 1. the hub's own health route ──────────────────────────────────────
  const h = await probe(`${o.hub}/api/health`);
  let hubOk = false;
  let hubDataMode = "?";
  let hubCoreConfigured = "?";
  if (h.ok && h.status === 200 && (h.contentType ?? "").includes("application/json")) {
    try {
      const res = await fetch(`${o.hub}/api/health`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10_000),
      });
      const j = (await res.json()) as Record<string, unknown>;
      hubOk = j.service === "syllabai-hub";
      hubDataMode = String(j.dataMode ?? "?");
      hubCoreConfigured = String(j.coreConfigured ?? "?");
      receipts.push(
        `hub /api/health: HTTP ${res.status} service=${String(j.service)} dataMode=${hubDataMode} coreConfigured=${hubCoreConfigured} coreReachable=${String(j.coreReachable)} detail="${String(j.coreProbeDetail ?? "(pre-T-HUBWIRE-1 build — no receipt fields)")}"`,
      );
    } catch (e) {
      receipts.push(`hub /api/health: HTTP 200 but body parse failed: ${String(e)}`);
    }
  } else {
    receipts.push(`hub /api/health: HTTP ${h.status} ct=${h.contentType} :: ${h.bodyHead.slice(0, 120)}`);
  }
  console.log(`[1] hub health: ${hubOk ? "LIVE" : "DOWN"}`);

  // ── 2. what the deployed build inlines (CSP connect-src) ──────────────
  const home = await fetch(o.hub, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
  }).catch(() => null);
  const csp = home?.headers.get("content-security-policy") ?? null;
  const origins = extractConnectSrc(csp);
  const browserDirect = origins.filter((x) => !x.startsWith("'") && x !== "https://raw.githubusercontent.com");
  receipts.push(`hub CSP connect-src: ${origins.join(" ") || "(none)"}`);
  console.log(`[2] browser-direct origins (CSP): ${browserDirect.join(", ") || "(none)"}`);

  // ── 3. THE WIRE: does the browser-direct api origin serve the v2 api? ─
  const target = browserDirect[0] ?? o.api;
  const api = await probe(`${target}/api/v1/auth/me`);
  const verdict = classifyApi(api);
  receipts.push(
    `api ${target}/api/v1/auth/me: HTTP ${api.status} ct=${api.contentType} verdict=${verdict} :: ${api.bodyHead.slice(0, 120)}`,
  );
  console.log(`[3] browser-direct api origin ${target}: ${verdict}`);
  const wireOk = verdict === "v2-api";

  // ── 4. the fallback candidate (receipt only — never a silent rewrite) ─
  const fb = await probe(`${o.apiFallback}/api/v1/auth/me`);
  const fbVerdict = classifyApi(fb);
  receipts.push(
    `api-fallback ${o.apiFallback}/api/v1/auth/me: HTTP ${fb.status} ct=${fb.contentType} verdict=${fbVerdict}`,
  );
  console.log(`[4] api-fallback ${o.apiFallback}: ${fbVerdict}`);

  console.log("\n── receipts ──");
  for (const r of receipts) console.log(`  ${r}`);

  if (!hubOk) {
    console.log("\nVERDICT: PROBE-ENV (hub not reachable) — exit 3");
    return 3;
  }
  if (!wireOk) {
    console.log(
      `\nVERDICT: WIRE-BROKEN — the hub is live but ${target} does not serve the v2 api ` +
        `(verdict=${verdict}). Attach the hostname to the api project or rebuild the hub ` +
        `with a serving origin, then re-run. — exit 2`,
    );
    return 2;
  }
  console.log("\nVERDICT: ALL-GREEN — exit 0");
  return 0;
}

process.exit(await main());
