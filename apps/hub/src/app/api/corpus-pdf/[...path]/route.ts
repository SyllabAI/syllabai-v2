import { NextRequest } from "next/server";
import { PASTPAPERS_REPO } from "@/lib/pastpapers-shared";

/**
 * T-MIG-128 — same-origin, edge-cached corpus PDF delivery.
 *
 * WHY (measured, operator trace 1a1405bb2acd6d81 "snappy and lag free"): the
 * pane used to stream multi-MB PDFs straight from raw.githubusercontent.com,
 * which sends `cache-control: max-age=300` — a 5-MINUTE browser cache. Every
 * re-open after five minutes re-downloaded the file; every first open raced
 * raw's origin instead of a nearby edge PoP. Corpus reality: 10,361 PDFs /
 * 5.86 GB, median QP 0.53 MB, p90 1.77 MB, max 20.7 MB (scanned papers).
 *
 * WHAT: a strict same-origin passthrough (`/api/corpus-pdf/<corpusPath>`)
 * that streams the archive bytes with IMMUTABLE cache semantics:
 *
 *   cache-control: public, max-age=31536000, immutable,
 *                  s-maxage=31536000, stale-while-revalidate=604800
 *
 * — the browser keeps a paper for a year (re-open = instant, zero bytes),
 * and the Vercel edge keeps it per region (first viewer in a region warms
 * it for everyone). The corpus is an append-only archive by law, so
 * immutable caching is sound: a path's bytes never change once published.
 *
 * SAFETY: this is NOT an open relay. The path must be corpus-shaped —
 * `past-papers/<specKey>/(past-papers|specimen)/<dir>/(qp|ms|er).pdf` —
 * every segment is character-validated, `..` is impossible, and only the
 * one archive host is ever contacted. Non-200 upstreams are 502 with
 * `no-store` so a raw hiccup is never cached.
 *
 * CSP: the viewer fetches this SAME-ORIGIN, which `connect-src 'self'`
 * already allows (next.config) — no policy change. The "Open raw PDF"
 * download link keeps the direct raw.githubusercontent.com origin.
 */

/** Corpus-relative path → validated absolute path, or null. */
function validatedCorpusPath(segments: readonly string[]): string | null {
  if (segments.length < 5) return null;
  const path = segments.join("/");
  // bounded length; must be corpus-shaped and end in a known material PDF
  if (path.length > 220) return null;
  if (!path.startsWith("past-papers/")) return null;
  if (!/(^|\/)(qp|ms|er)\.pdf$/.test(path)) return null;
  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") return null;
    if (!/^[A-Za-z0-9._-]+$/.test(seg)) return null;
  }
  return path;
}

/** Never prerender 10k+ PDF routes; every request is a live passthrough. */
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  const corpusPath = validatedCorpusPath(segments ?? []);
  if (!corpusPath) {
    return new Response("corpus path rejected", {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://raw.githubusercontent.com/${PASTPAPERS_REPO}/main/${corpusPath}`,
      {
        // the CDN cache below us is the share point; per-instance fetch
        // caching would only hide upstream hiccups behind stale locals
        cache: "no-store",
        headers: { "user-agent": "syllabai-hub-corpus-proxy (T-MIG-128)" },
      },
    );
  } catch {
    return new Response("corpus upstream unreachable", {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("corpus upstream error", {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }

  const headers = new Headers();
  headers.set("content-type", "application/pdf");
  // pass content-length through so pdf.js onProgress stays honest (the
  // loading state shows real download progress against the true total)
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("etag", etag);
  headers.set(
    "cache-control",
    "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=604800",
  );
  return new Response(upstream.body, { status: 200, headers });
}
