import { NextRequest } from "next/server";
import { BOOKS_REPO, PASTPAPERS_REPO } from "@/lib/pastpapers-shared";

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
 * SAFETY: this is NOT an open relay. The path must be archive-shaped —
 * `past-papers/<specKey>/(past-papers|specimen)/<dir>/(qp|ms|er).pdf` (the
 * T-MIG-128 corpus) or `books/<specKey>/student-book.pdf` plus its per-page
 * artifacts `books/<specKey>/(ocr_pages/page_NNN.txt|docling_pages/page_NNN.json)`
 * (T-MIG-133 band 133c) — every segment is character-validated, `..` is
 * impossible, and only the two archive hosts are ever contacted (past-papers
 * → syllabai-pastpapers, books → syllabai-resources; dispatch by root
 * segment). Non-200 upstreams are 502 with `no-store` so a raw hiccup is
 * never cached.
 *
 * CSP: the viewer fetches this SAME-ORIGIN, which `connect-src 'self'`
 * already allows (next.config) — no policy change. The "Open raw PDF"
 * download link keeps the direct raw.githubusercontent.com origin.
 */

/** Corpus-relative path → validated absolute path, or null.
 *  Exported for the unit gates (the validator IS the relay wall). */
export function validatedCorpusPath(segments: readonly string[]): string | null {
  if (segments.length < 5) return null;
  const path = segments.join("/");
  // bounded length; must be archive-shaped and end in a known material file
  if (path.length > 220) return null;
  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") return null;
    if (!/^[A-Za-z0-9._-]+$/.test(seg)) return null;
  }
  // T-MIG-128: the past-papers archive — question papers, mark schemes,
  // examiner reports only
  if (segments[0] === "past-papers") {
    if (!/(^|\/)(qp|ms|er)\.pdf$/.test(path)) return null;
    return path;
  }
  // T-MIG-133 band 133c: the books archive — the student-book PDF and its
  // per-page parse artifacts, nothing else (append-only, by grammar)
  if (segments[0] === "books") {
    // books/<board>/<qual>/<subject>/<spec>/<file...>
    if (segments.length === 6 && segments[5] === "student-book.pdf") return path;
    if (segments.length === 7 && segments[5] === "ocr_pages" && /^page_\d{3}\.txt$/.test(segments[6])) return path;
    if (segments.length === 7 && segments[5] === "docling_pages" && /^page_\d{3}\.json$/.test(segments[6])) return path;
    return null;
  }
  return null;
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
  // host dispatch by root segment (T-MIG-133c): the past-papers corpus and
  // the books archive live on different repos — the validator has already
  // pinned the root, so the dispatch is total over the accepted grammar
  const archiveRepo = segments[0] === "books" ? BOOKS_REPO : PASTPAPERS_REPO;
  try {
    upstream = await fetch(
      `https://raw.githubusercontent.com/${archiveRepo}/main/${corpusPath}`,
      {
        // the CDN cache below us is the share point; per-instance fetch
        // caching would only hide upstream hiccups behind stale locals
        cache: "no-store",
        headers: {
          "user-agent": archiveRepo === BOOKS_REPO
            ? "syllabai-hub-corpus-proxy (T-MIG-133c books)"
            : "syllabai-hub-corpus-proxy (T-MIG-128)",
        },
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
  // content-type by the validator-pinned grammar: PDFs for the panes, the
  // per-page parse artifacts as their natural types (133d's citations and
  // the 133b receipts consume them; the pane itself only ever asks .pdf)
  headers.set(
    "content-type",
    corpusPath.endsWith(".pdf")
      ? "application/pdf"
      : corpusPath.endsWith(".json")
        ? "application/json"
        : "text/plain; charset=utf-8",
  );
  // pass content-length through so pdf.js onProgress stays honest (the
  // loading state shows real download progress against the true total).
  // PDFs ONLY (the T-MIG-128 law's actual consumer): the live 133c probe
  // caught the text artifacts stalling on the edge — the CDN compresses
  // text/*, and a manually-set length corrupts the response framing. The
  // platform frames every other type itself; artifacts have no
  // progress-bar consumer.
  if (corpusPath.endsWith(".pdf")) {
    const len = upstream.headers.get("content-length");
    if (len) headers.set("content-length", len);
  }
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("etag", etag);
  headers.set(
    "cache-control",
    "public, max-age=31536000, immutable, s-maxage=31536000, stale-while-revalidate=604800",
  );
  return new Response(upstream.body, { status: 200, headers });
}
