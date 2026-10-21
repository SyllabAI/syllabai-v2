import { NextRequest, NextResponse } from "next/server";

import { coreFetchAuthorized } from "@/lib/core-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * T-BOOK-009 — the tutor rail proxy: the SCOPED KA-RAG ask.
 *
 * The frozen tutor ask contract (tutorAskRequestSchema) is untouched — the
 * scoping is COMPOSITION at this seam: the chapter anchor (title, spec
 * codes of record from the chapter join, mark-scheme language from the
 * chapter's loaded glossary) prefixes the learner's question, and courseRef
 * anchors retrieval to the course. The learner's words are NEVER truncated
 * while context fits; the composed ask respects the 2000-char law.
 *
 * The citation deep link is built here from the 133d coordinates
 * (?chapter=&page= — the same path the tutor's book-arm citations resolve
 * through), so the card's "grounded" link is page-true, never fabricated.
 *
 * Auth: the ask is an LLM call on a learner session — the cookie→Bearer
 * crossing (the /api/ai/* posture). Refusals pass through as data (the
 * tutor's refusal honesty law), not as errors.
 */

const TOKEN_COOKIE = "syllabai.token";

interface RailAskBody {
  course?: unknown;
  question?: unknown;
  documentId?: unknown;
  chapterKey?: unknown;
  chapterTitle?: unknown;
  specCodes?: unknown;
  glossaryHints?: unknown;
  page?: unknown;
}

/** The composed ask: context bracket + learner question, 2000-char law. */
export function composeRailAsk(body: RailAskBody): { question: string; courseRef: string } | null {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const course = typeof body.course === "string" ? body.course.trim() : "";
  const chapterTitle = typeof body.chapterTitle === "string" ? body.chapterTitle.trim() : "";
  const chapterKey = typeof body.chapterKey === "string" ? body.chapterKey.trim() : "";
  if (question === "" || course === "") return null;
  const specCodes = Array.isArray(body.specCodes)
    ? (body.specCodes as unknown[]).filter((s): s is string => typeof s === "string" && s.trim() !== "").slice(0, 8)
    : [];
  const hints = Array.isArray(body.glossaryHints)
    ? (body.glossaryHints as unknown[])
        .filter(
          (h): h is { term: string; accepts: string } =>
            typeof h === "object" && h != null &&
            typeof (h as { term?: unknown }).term === "string" &&
            typeof (h as { accepts?: unknown }).accepts === "string" &&
            (h as { accepts: string }).accepts.trim() !== "",
        )
        .slice(0, 5)
    : [];
  let context = `[Studying: ${chapterTitle || chapterKey || "this chapter"}`;
  if (specCodes.length > 0) context += ` · spec ${specCodes.join(", ")}`;
  if (hints.length > 0) {
    context += ` · mark-scheme language: ${hints.map((h) => `${h.term} (accept "${h.accepts}")`).join("; ")}`;
  }
  context += `] `;
  const room = 2000 - context.length;
  if (room < 200) context = ""; // context never crowds out the question
  const learner = room >= 200 ? question.slice(0, Math.max(200, room)) : question.slice(0, 2000);
  return { question: `${context}${learner}`.slice(0, 2000), courseRef: course.slice(0, 64) };
}

export async function POST(req: NextRequest) {
  let body: RailAskBody;
  try {
    body = (await req.json()) as RailAskBody;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "malformed request" }, { status: 400 });
  }
  const composed = composeRailAsk(body);
  if (composed == null) {
    return NextResponse.json(
      { error: "validation_failed", message: "question and course are required" },
      { status: 400 },
    );
  }
  const result = await coreFetchAuthorized<{ answer?: string; refused?: boolean }>("/api/v1/tutor/ask", {
    method: "POST",
    token: req.cookies.get(TOKEN_COOKIE)?.value ?? null,
    body: { question: composed.question, courseRef: composed.courseRef },
  });
  if (!result.ok || result.data == null) {
    // the tutor-unavailable class: the card renders the honest retry state
    return NextResponse.json({ error: "tutor_unavailable" }, { status: result.status || 503 });
  }
  const page = typeof body.page === "number" && Number.isInteger(body.page) && body.page > 0 ? body.page : null;
  const chapterKey = typeof body.chapterKey === "string" ? body.chapterKey : null;
  const documentId = typeof body.documentId === "string" ? body.documentId : null;
  const citationHref =
    documentId != null && chapterKey != null
      ? `?chapter=${encodeURIComponent(chapterKey)}${page != null ? `&page=${page}` : ""}`
      : null;
  return NextResponse.json({
    answer: result.data.answer ?? "",
    refused: result.data.refused ?? false,
    citationHref,
  });
}
