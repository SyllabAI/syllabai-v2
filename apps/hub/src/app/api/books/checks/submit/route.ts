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
  const unit = req.nextUrl.searchParams.get("unit") ?? "";
  // T-BOOK-069: the unit strength-check lane rides ?unit=uN (a unit is not a
  // chapter — ADR-BOOK-0004 decision 1); chapter submits keep the chapter
  // law. Exactly one scope key is required (the api refuses both).
  if (!documentId.trim() || (!chapter.trim() && !unit.trim())) {
    return NextResponse.json(
      { error: "validation_failed", message: "documentId and chapter (or unit) are required" },
      { status: 400 },
    );
  }
  const scope = unit.trim()
    ? `unit=${encodeURIComponent(unit.trim())}`
    : `chapter=${encodeURIComponent(chapter)}`;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "malformed request" }, { status: 400 });
  }
  const result = await coreFetchAuthorized<unknown>(
    `/api/v1/content/books/${encodeURIComponent(documentId)}/checks/submit?${scope}`,
    { method: "POST", token: req.cookies.get(TOKEN_COOKIE)?.value ?? null, body },
  );
  return NextResponse.json(result.data ?? { error: "upstream" }, { status: result.status });
}
