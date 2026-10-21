import { NextRequest, NextResponse } from "next/server";

import { coreFetchAuthorized } from "@/lib/core-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-BOOK-008 — the check submit proxy. An attempt is a learner signal: the
 * cookie→Bearer crossing is THIS route's law (the httpOnly JWT never
 * reaches the browser's fetch), and the api's requireAuth + attempts insert
 * (provenance='BOOK_CHECK') stay the only writers of record.
 */

const TOKEN_COOKIE = "syllabai.token";

export async function POST(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get("documentId") ?? "";
  const chapter = req.nextUrl.searchParams.get("chapter") ?? "";
  if (!documentId.trim() || !chapter.trim()) {
    return NextResponse.json(
      { error: "validation_failed", message: "documentId and chapter are required" },
      { status: 400 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "malformed request" }, { status: 400 });
  }
  const result = await coreFetchAuthorized<unknown>(
    `/api/v1/content/books/${encodeURIComponent(documentId)}/checks/submit?chapter=${encodeURIComponent(chapter)}`,
    { method: "POST", token: req.cookies.get(TOKEN_COOKIE)?.value ?? null, body },
  );
  return NextResponse.json(result.data ?? { error: "upstream" }, { status: result.status });
}
