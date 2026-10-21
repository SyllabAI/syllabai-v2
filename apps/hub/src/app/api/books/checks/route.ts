import { NextRequest, NextResponse } from "next/server";

import { coreBaseUrl } from "@/lib/core-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-BOOK-008 — the checks proxy (client → hub → api). The check RESOLVE is
 * public-read upstream (corpus content, the double VALIDATED gate at the
 * api) so this is a plain pipe with NO auth crossing — the submit route
 * carries the cookie→Bearer law, this one just keeps the core base URL
 * server-side (never shipped to the browser).
 */

export async function GET(req: NextRequest) {
  const base = coreBaseUrl();
  if (!base) return NextResponse.json({ error: "core_not_configured" }, { status: 503 });
  const documentId = req.nextUrl.searchParams.get("documentId") ?? "";
  const chapter = req.nextUrl.searchParams.get("chapter") ?? "";
  if (!documentId.trim() || !chapter.trim()) {
    return NextResponse.json(
      { error: "validation_failed", message: "documentId and chapter are required" },
      { status: 400 },
    );
  }
  const res = await fetch(
    `${base}/api/v1/content/books/${encodeURIComponent(documentId)}/checks?chapter=${encodeURIComponent(chapter)}`,
    { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  const body = res.ok ? await res.json() : null;
  return NextResponse.json(body ?? [], { status: res.status });
}
