import "server-only";

/**
 * T-BOOK-003 — the hub-side INTERACTIVE RAIL read path (the lib/books.ts
 * precedent, rail side). Books are a LIVE corpus family: the rail's block
 * stream is the VALIDATED pack of record and changes under the operator's
 * pack flip, so it reads the api edge at request time (no-store, ADR-029 —
 * a production frontend never touches a database directly).
 *
 * SCHEMA MIRROR law (lib/books.ts verbatim): the hub resolves zod v4 while
 * packages/contracts builds on v3 — parse trees do not compose across
 * majors — so the hub mirrors the strict serving shapes locally and imports
 * the canonical shapes TYPE-ONLY. The mirror is structural, never
 * behavioral: any drift fails THIS parse first, loudly. The per-type payload
 * laws stay in contracts (the api already parsed them at the boundary);
 * the hub re-verifies the ENVELOPE (id/chapter/ord/type/anchors/refs) and
 * carries content as an opaque record — components narrow by type with
 * their own guards.
 *
 * Honest-failure law (lib/books.ts verbatim): every fetch returns NULL on
 * any failure (core not configured, non-200, malformed body) — the viewer
 * renders its honest state, exactly the unchanged 133c page. Never a
 * fabricated rail, never a partial parse.
 *
 * Serving law restated (ADR-BOOK-0001 §3): a pack serves only when the
 * parent book is VALIDATED AND the pack rows are VALIDATED — the api
 * enforces the DOUBLE gate; this lib reflects it. An empty array is the
 * honest "book serves, no flipped pack here"; null is "rail unavailable".
 */
import { z } from "zod";

import type { BookBlock } from "@syllabai/contracts";

import { coreBaseUrl } from "./core-proxy";

// ── the strict-shape mirror (bookBlockSchema envelope) ──────────────────────

const blockTypeMirror = z.enum([
  "prose",
  "figure",
  "callout",
  "mcq-embed",
  "sort-match",
  "drag-label",
  "table-fill",
  "num-stepper",
  "eq-builder",
  "sim-embed",
  "media-embed",
]);

const blockEnvelopeMirror = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  docVersion: z.number().int().min(1),
  chapterKey: z.string().min(1),
  ord: z.number().int().min(1),
  type: blockTypeMirror,
  pdfPageAnchor: z.number().int().min(1).nullable(),
  content: z.record(z.string(), z.unknown()),
  checkRefs: z.array(z.string()),
  glossaryRefs: z.array(z.string()),
  specPointRefs: z.array(z.string()),
  validationState: z.enum(["SUGGESTED", "VALIDATED", "REJECTED", "FLAGGED"]),
  version: z.number().int().min(1),
});

const blocksArrayMirror = z.array(blockEnvelopeMirror);
export type RailBlock = z.infer<typeof blockEnvelopeMirror>;

/** Server-side GET against the rail read surface; null on ANY failure.
 *  (The lib/books.ts getJson law, verbatim behavior.) */
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
 * The chapter's VALIDATED rail blocks, ord-ordered.
 *
 *  - null          → rail unavailable (core down, malformed body) — the
 *                    viewer renders the unchanged 133c page
 *  - []            → book serves, chapter has no flipped pack — SAME honest
 *                    unchanged-133c render (the ADR's "anything else
 *                    renders the unchanged 133c viewer" law)
 *  - non-empty     → the rail mounts (the two-pane shell)
 */
export async function fetchBookRailBlocks(
  documentId: string,
  chapterKey: string,
): Promise<RailBlock[] | null> {
  const parsed = await getJson(
    `/api/v1/content/books/${encodeURIComponent(documentId)}/blocks?chapter=${encodeURIComponent(chapterKey)}`,
    (raw) => blocksArrayMirror.parse(raw),
  );
  return parsed;
}
