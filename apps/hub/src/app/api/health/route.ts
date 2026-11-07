import { publicConfig } from "@/lib/config";

export const runtime = "nodejs";

/**
 * T-HUBWIRE-1 run-001 — the reachability receipt.
 *
 * `coreConfigured` (via isCoreApiConfigured()) only says an origin STRING is
 * present — env presence, never reachability. The 2026-11-05/06 incident
 * class (docs/T-HUBWIRE-1-PLAN.md §1): the hub was built with
 * NEXT_PUBLIC_API_BASE_URL=https://api.syllab-ai.com while that hostname was
 * not attached to any Vercel project — every browser-direct call died at the
 * edge with Vercel's generic text/plain NOT_FOUND while health kept saying
 * coreConfigured:true. The receipt below adds the missing half: an
 * unauthenticated probe of the resolved core origin, cached per isolate for
 * 60s, strictly ADDITIVE fields — no existing field changes meaning or shape.
 */
const PROBE_TTL_MS = 60_000;

interface CoreProbeReceipt {
  coreReachable: boolean | null;
  coreProbeOrigin: string | null;
  coreProbeDetail: string;
}

let probeCache: { at: number; value: CoreProbeReceipt } | null = null;

function resolveCoreOrigin(): string | null {
  const raw =
    process.env.SYLLABAI_CORE_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/$/, "").replace(/\/api\/v1$/, "");
}

/**
 * Classification law (matches scripts/t-hubwire-1-wire-proof.ts): a JSON
 * content-type on ANY status — 401 included — means the v2 api is serving
 * (the api answers with JSON envelopes even on auth failures). An edge page
 * (text/plain NOT_FOUND) or a transport failure means the origin is not
 * serving the wire.
 */
async function probeCoreOrigin(): Promise<CoreProbeReceipt> {
  const origin = resolveCoreOrigin();
  if (!origin) {
    return {
      coreReachable: null,
      coreProbeOrigin: null,
      coreProbeDetail: "no core origin configured — not probed",
    };
  }
  try {
    const res = await fetch(`${origin}/api/v1/auth/me`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2_500),
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return {
        coreReachable: true,
        coreProbeOrigin: origin,
        coreProbeDetail: `JSON envelope HTTP ${res.status} — the v2 api is serving`,
      };
    }
    return {
      coreReachable: false,
      coreProbeOrigin: origin,
      coreProbeDetail: `HTTP ${res.status} ${contentType || "(no content-type)"} — not the v2 api JSON envelope (unattached-host / edge-page class)`,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    return {
      coreReachable: false,
      coreProbeOrigin: origin,
      coreProbeDetail: `probe failed: ${name} (network error / timeout — origin unreachable)`,
    };
  }
}

/**
 * GET /api/health — self-report: service identity, active data mode, core
 * wiring. No secrets.
 */
export async function GET() {
  const cfg = publicConfig();
  if (!probeCache || Date.now() - probeCache.at > PROBE_TTL_MS) {
    probeCache = { at: Date.now(), value: await probeCoreOrigin() };
  }
  return Response.json({
    status: "ok",
    service: "syllabai-hub",
    dataMode: cfg.dataMode,
    coreConfigured: cfg.coreConfigured,
    coreReachable: probeCache.value.coreReachable,
    coreProbeOrigin: probeCache.value.coreProbeOrigin,
    coreProbeDetail: probeCache.value.coreProbeDetail,
    time: new Date().toISOString(),
  });
}
