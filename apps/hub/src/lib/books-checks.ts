/**
 * T-BOOK-008/009 — the CLIENT-side rail wiring: fetchers + mirrors for the
 * check lane, the glossary layer, and the tutor rail (all through the hub
 * proxy routes, which own the cookie→Bearer crossing).
 *
 * NOT "server-only" (lib/books-rail.ts is): these run in the rail's client
 * components. The mirrors re-pin the strict serving shapes (railCheckBlock
 * Schema / railCheckSubmitResultSchema / bookGlossaryTermSchema from
 * @syllabai/contracts, type-only) so a proxy/upstream drift fails THIS parse
 * first, loudly — the lib/books.ts schema-mirror law, client side.
 *
 * Honest-failure law: every fetcher returns null on ANY failure (non-200,
 * malformed, offline) — the rail renders its honest states, never a
 * fabricated question, never a fake verdict.
 */
import { z } from "zod";

import type { RailCheckBlock, RailCheckSubmitResult, BookGlossaryTerm } from "@syllabai/contracts";

const checkBlockMirror = z.object({
  blockId: z.string().min(1),
  checkRefs: z.array(z.string().min(1)).min(1),
  question: z
    .object({
      questionId: z.string().uuid(),
      stem: z.string().min(1),
      marks: z.number().int().min(1),
      commandWord: z.string().nullable(),
      options: z
        .object({ id: z.string().uuid(), label: z.string().min(1), text: z.string().min(1) })
        .array()
        .min(2),
    })
    .nullable(),
});

const checkResultMirror = z.object({
  correct: z.boolean(),
  correctOptionId: z.string().uuid().nullable(),
  marksAwarded: z.number().int().min(0),
});

const glossaryTermMirror = z.object({
  subjectCode: z.string().min(1),
  term: z.string().min(1),
  slug: z.string().min(1),
  definition: z.string().min(1),
  msAccepts: z.array(z.string()),
  msAvoids: z.array(z.string()),
  aliases: z.array(z.string()),
  audioUrl: z.string().nullable(),
  translations: z.record(z.string(), z.string()).nullable(),
});

async function getJson<T>(path: string, parse: (raw: unknown) => T): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown, parse: (raw: unknown) => T): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}

// ── T-BOOK-008: the check lane ───────────────────────────────────────────────

/** Resolve the chapter's mcq-embed blocks against the bank. */
export function fetchChapterChecks(
  documentId: string,
  chapterKey: string,
): Promise<RailCheckBlock[] | null> {
  return getJson(
    `/api/books/checks?documentId=${encodeURIComponent(documentId)}&chapter=${encodeURIComponent(chapterKey)}`,
    (raw) => z.array(checkBlockMirror).parse(raw),
  );
}

/** Submit one check attempt (auth-gated upstream; 401 ⇒ null = honest
 *  "signed out", the player stays local). */
export function submitChapterCheck(input: {
  documentId: string;
  chapterKey: string;
  blockId: string;
  questionId: string;
  chosenOptionId: string;
  responseTimeMs: number;
}): Promise<RailCheckSubmitResult | null> {
  return postJson(
    `/api/books/checks/submit?documentId=${encodeURIComponent(input.documentId)}&chapter=${encodeURIComponent(input.chapterKey)}`,
    {
      blockId: input.blockId,
      questionId: input.questionId,
      chosenOptionId: input.chosenOptionId,
      responseTimeMs: input.responseTimeMs,
    },
    (raw) => checkResultMirror.parse(raw),
  );
}

// ── T-BOOK-007: the glossary layer ───────────────────────────────────────────

/** The book's glossary terms (slugs optional — omit for the whole shelf). */
export function fetchBookGlossary(
  courseSlug: string,
  slugs: string[] | null,
): Promise<BookGlossaryTerm[] | null> {
  const q = new URLSearchParams({ course: courseSlug });
  if (slugs != null && slugs.length > 0) q.set("slugs", slugs.join(","));
  return getJson(`/api/books/glossary?${q.toString()}`, (raw) =>
    z.array(glossaryTermMirror).parse(raw),
  );
}

// ── T-BOOK-009: the tutor rail ───────────────────────────────────────────────

export interface TutorRailAsk {
  question: string;
  documentId: string;
  chapterKey: string;
  chapterTitle: string;
  specCodes: string[];
  /** compact hint lines from the chapter's loaded glossary (ms language) */
  glossaryHints: Array<{ term: string; accepts: string }>;
  /** the page anchor for the citation deep link (the block's pdfPageAnchor) */
  page?: number | null;
}

export interface TutorRailAnswer {
  answer: string;
  refused: boolean;
  /** the page-true deep link coordinates the card renders as "grounded" */
  citationHref: string | null;
}

/** The scoped KA-RAG ask (composed + course-anchored at the proxy). */
export function askRailTutor(
  courseSlug: string,
  input: TutorRailAsk,
): Promise<TutorRailAnswer | null> {
  return postJson("/api/books/tutor/ask", { course: courseSlug, ...input }, (raw) => {
    const shaped = z
      .object({
        answer: z.string().min(1),
        refused: z.boolean(),
        citationHref: z.string().nullable(),
      })
      .parse(raw);
    return shaped;
  });
}
