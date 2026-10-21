import { NextRequest, NextResponse } from "next/server";

import { coreFetchAuthorized } from "@/lib/core-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-BOOK-003 — the hub's progress proxy for the rail shell (client → hub →
 * api, the core/questions route's posture, books-sized).
 *
 * WHY a hub route at all: the chapter_progress surface is AUTH-gated on the
 * api (a user signal, PII — the deliberate counter-posture to the public-read
 * corpus family). The learner's JWT lives in an httpOnly cookie, so the
 * browser cannot attach it to an api call itself; the hub server reads the
 * cookie and forwards it as Bearer — exactly how /api/ai/* and
 * /api/core/questions cross the ADR-029 boundary. The api stays the only
 * writer of the table; this route is a pipe, never a store.
 *
 * Upstream: GET/PUT /api/v1/content/books/:documentId/progress?chapter=…
 * Responses pass through with their status (the client renders the same
 * honest verdicts the api produced — 401 signed-out, 400 malformed, 200
 * {progress}). Any pass-through failure keeps the rail fully usable: progress
 * is a coverage signal, not a gate.
 */

const TOKEN_COOKIE = "syllabai.token";

function tokenOf(req: NextRequest): string | null {
  return req.cookies.get(TOKEN_COOKIE)?.value ?? null;
}

/** The two params the api's chapterKeyOr400 gate owns upstream; this proxy
 *  only guards the URL shape (encode, never re-validate — the api is the
 *  law and its 400 body is the honest answer). */
function upstreamPath(documentId: string, chapter: string): string | null {
  if (!documentId.trim() || !chapter.trim()) return null;
  return `/api/v1/content/books/${encodeURIComponent(documentId)}/progress?chapter=${encodeURIComponent(chapter)}`;
}

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get("documentId") ?? "";
  const chapter = req.nextUrl.searchParams.get("chapter") ?? "";
  const path = upstreamPath(documentId, chapter);
  if (!path) {
    return NextResponse.json(
      { error: "validation_failed", message: "documentId and chapter are required" },
      { status: 400 },
    );
  }
  const result = await coreFetchAuthorized<unknown>(path, {
    method: "GET",
    token: tokenOf(req),
  });
  return NextResponse.json(result.data ?? { progress: null }, { status: result.status });
}

export async function PUT(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get("documentId") ?? "";
  const chapter = req.nextUrl.searchParams.get("chapter") ?? "";
  const path = upstreamPath(documentId, chapter);
  if (!path) {
    return NextResponse.json(
      { error: "validation_failed", message: "documentId and chapter are required" },
      { status: 400 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "malformed request" },
      { status: 400 },
    );
  }
  const result = await coreFetchAuthorized<unknown>(path, {
    method: "PUT",
    token: tokenOf(req),
    body,
  });
  return NextResponse.json(result.data ?? { progress: null }, { status: result.status });
}
