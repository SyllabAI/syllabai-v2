import "server-only";

/**
 * T-BOOK-069 / ADR-BOOK-0004 — the hub-side UNIT STRENGTH CHECK read path
 * (the lib/books-rail.ts precedent, strength side). The unit's VALIDATED
 * strength blocks resolve at the api edge through the EXISTING railChecks
 * law (the api owns the double gate + the bank resolution); this lib reads
 * the wire at request time (no-store, ADR-029) and mirrors the strict
 * serving shape (lib/books.ts schema-mirror law, server side).
 *
 * Honest-failure law (lib/books-rail.ts verbatim): null on ANY failure —
 * the surface renders its honest state, never a fabricated question.
 * [] is the honest pre-flip state (book serves, no VALIDATED strength rows).
 */
import { z } from "zod";

import { coreBaseUrl } from "./core-proxy";

const strengthQuestionMirror = z.object({
  questionId: z.string().uuid(),
  stem: z.string().min(1),
  marks: z.number().int().min(1),
  commandWord: z.string().nullable(),
  options: z
    .object({
      id: z.string().uuid(),
      label: z.string().min(1),
      text: z.string().min(1),
    })
    .array()
    .min(2),
});

const strengthCheckMirror = z.object({
  blockId: z.string().min(1),
  checkRefs: z.array(z.string().min(1)),
  question: strengthQuestionMirror.nullable(),
});

const strengthChecksArrayMirror = z.array(strengthCheckMirror);
export type StrengthCheck = z.infer<typeof strengthCheckMirror>;
export type StrengthQuestion = z.infer<typeof strengthQuestionMirror>;

/** Server-side GET against the unit strength-check surface; null on ANY
 *  failure (the lib/books.ts getJson law, verbatim behavior). */
async function getJson<T>(path: string, parse: (raw: unknown) => T): Promise<T | null> {
  const base = coreBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}

/**
 * The unit's VALIDATED strength blocks resolved against the bank
 * (ADR-BOOK-0004 decision 3 — the strength rows' ONLY serving surface).
 *
 *  - null   → unavailable (core down, malformed body) — the page renders
 *             its honest unavailable state
 *  - []     → the honest pre-flip state (no VALIDATED strength rows yet)
 *  - blocks → the unit check flow mounts
 */
export async function fetchStrengthChecks(
  documentId: string,
  unit: string,
): Promise<StrengthCheck[] | null> {
  return getJson(
    `/api/v1/content/books/${encodeURIComponent(documentId)}/strength-checks?unit=${encodeURIComponent(unit)}`,
    (raw) => strengthChecksArrayMirror.parse(raw),
  );
}

/** How many strength items a unit currently serves (0 when unavailable —
 *  the shelf affordance gate: the row exists only when the check serves). */
export async function strengthCheckCount(
  documentId: string,
  unit: string,
): Promise<number> {
  const checks = await fetchStrengthChecks(documentId, unit);
  return checks?.length ?? 0;
}
