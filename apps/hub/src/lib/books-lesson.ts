/**
 * T-BOOK-033 — the Lesson loader (server-only).
 *
 * LESSON-PLAN-4CH1 §5: the hub serves lessonPackV1 packs baked from the
 * CourseLessons authoring home (syllabai-resources) into
 * `content/<slug>/lessons/` by scripts/import_lesson_packs.py — the same
 * committed-content-plane every other corpus bundle rides (lib/corpus.ts;
 * fs at build/dev, fetch plane on Vercel lambdas).
 *
 * Serving law (T-C20 posture, mirrors lib/books.ts + the ADR-BOOK-0001 §3
 * levers): the pack file carries `status` (draft | reviewed | published);
 *
 *   - the lesson SHELF (and every student-visible affordance) lists
 *     PUBLISHED packs only — a draft/reviewed pack simply is not there
 *     (no state leak, honest absent);
 *   - the reader's Lesson toggle shows only published packs (preview
 *     param support lives in the PAGE layer, which may render a
 *     draft/reviewed pack ONLY with ?preview=1 and a visible DRAFT badge);
 *   - unknown pack id / missing plane → null (same answer as "not
 *     published"): callers render nothing.
 *
 * Schema-mirror law (lib/books.ts header): the hub resolves zod v4 while
 * packages/contracts builds on v3 — parse trees do not compose across
 * majors, so the strict serving shapes are mirrored locally and the
 * canonical shapes are imported TYPE-ONLY (r0.1 includes the optional
 * `markdown` carry field).
 */
import "server-only";
import { z } from "zod";
import { cache } from "react";

import type { LessonPack, LessonSection } from "@syllabai/contracts";

import { loadContentJson } from "./corpus";

// ── zod v4 mirrors of the canonical r0.1 shapes ──────────────────────────────

const lessonSectionMirror = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  bookPage: z.number().int().min(1).nullable(),
  chunkRefs: z.array(z.string().min(1)).min(1),
  blockIds: z.array(z.string().min(1)),
  glossarySlugs: z.array(z.string().min(1)),
  specRefs: z.array(z.string().min(1)).min(1),
  markdown: z.string().optional(),
});

const lessonPackMirror = z.object({
  packId: z.string().min(1),
  chapterKey: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  learningObjective: z.string().nullable(),
  paperRoute: z.enum(["core", "chemistry-only"]),
  sections: z.array(lessonSectionMirror).min(1),
  status: z.enum(["draft", "reviewed", "published"]),
  version: z.number().int().min(1),
  sources: z.object({
    bookOfRecord: z.string().min(1),
    parseOfRecord: z.string().min(1),
    blockPackReceipt: z.string().nullable(),
  }),
  lintPack: z.string().min(1),
});

const lessonIndexMirror = z.object({
  packs: z.array(
    z.object({
      packId: z.string().min(1),
      chapterKey: z.string().min(1),
    }),
  ),
});

const lessonGlossaryMirror = z.array(
  z.object({
    slug: z.string().min(1),
    term: z.string().min(1),
    definition: z.string().min(1),
    msAccepts: z.array(z.string()).default([]),
    msAvoids: z.array(z.string()).default([]),
    source: z.string().nullable().default(null),
  }),
);

export type LessonPackServed = z.infer<typeof lessonPackMirror>;
export type LessonSectionServed = z.infer<typeof lessonSectionMirror>;
export type LessonGlossaryEntry = z.infer<typeof lessonGlossaryMirror>[number];
export type LessonStatus = LessonPackServed["status"];

// content/ rel paths (fetch plane: /corpus/<rel> — build_corpus_static.mjs
// copies the whole content tree, lessons subdir included, unchanged)
const packRel = (slug: string, packId: string) => `${slug}/lessons/${packId}.json`;
const glossaryRel = (slug: string, packId: string) => `${slug}/lessons/${packId}.glossary.json`;
const indexRel = (slug: string) => `${slug}/lessons/lessons-index.json`;

/** The committed lessons-index.json: packId↔chapterKey existence map. */
export const fetchLessonIndex = cache(
  async (courseSlug: string): Promise<{ packId: string; chapterKey: string }[] | null> => {
    const raw = await loadContentJson<unknown>(indexRel(courseSlug));
    if (raw === null) return null;
    const r = lessonIndexMirror.safeParse(raw);
    return r.success ? r.data.packs : null;
  },
);

/** One baked pack, schema-mirror-parsed. null = absent or malformed. */
export const fetchLessonPack = cache(
  async (courseSlug: string, packId: string): Promise<LessonPackServed | null> => {
    const raw = await loadContentJson<unknown>(packRel(courseSlug, packId));
    if (raw === null) return null;
    const r = lessonPackMirror.safeParse(raw);
    return r.success ? r.data : null;
  },
);

/** The pack's glossary (baked from the CourseLessons glossary.yaml). */
export const fetchLessonGlossary = cache(
  async (courseSlug: string, packId: string): Promise<LessonGlossaryEntry[] | null> => {
    const raw = await loadContentJson<unknown>(glossaryRel(courseSlug, packId));
    if (raw === null) return null;
    const r = lessonGlossaryMirror.safeParse(raw);
    return r.success ? r.data : null;
  },
);

export interface ChapterLesson {
  pack: LessonPackServed;
  glossary: LessonGlossaryEntry[];
  /** true iff the pack is NOT published (page layer decides via ?preview=1). */
  previewOnly: boolean;
}

// ── the chapter-key join law (T-BOOK-033/status-flip r1 rider) ───────────────
// The SAME chapter lives in two key formats: the DB rail coordinate
// (book_chapters.chapter_key, `u<unit>:c<N>` — no padding; the live reader
// carries "u1:c1") and the lessonPack chapterKey (contracts grammar
// `u<N>:c<NN>` — zero-padded; the baked index carries "u1:c01"). Every
// pack↔chapter join normalizes to the unit/chapter INTEGERS. Unknown
// shapes → null (honest-absent: callers keep their exact-match behavior).
export function normalizedChapterKey(k: string): string | null {
  const m = /^u(\d+):c(\d+)$/.exec(k.trim());
  return m ? `u${Number(m[1])}:c${Number(m[2])}` : null;
}

/** The index row for a chapter key in EITHER format; null = no pack (honest). */
export function findChapterKeyInIndex(
  idx: { packId: string; chapterKey: string }[],
  chapterKey: string,
): { packId: string; chapterKey: string } | null {
  const want = normalizedChapterKey(chapterKey);
  if (!want) return null;
  return idx.find((p) => normalizedChapterKey(p.chapterKey) === want) ?? null;
}

/**
 * The lesson for one chapter, for the READER TOGGLE + LESSON PAGE.
 * Published packs return previewOnly=false; draft/reviewed return the
 * pack with previewOnly=true (the page renders them only behind
 * ?preview=1 with a DRAFT badge — operator preview, not a leak: the shelf
 * and the toggle still treat them as absent).
 */
export const fetchChapterLesson = cache(
  async (courseSlug: string, chapterKey: string): Promise<ChapterLesson | null> => {
    const idx = await fetchLessonIndex(courseSlug);
    if (!idx) return null;
    const entry = findChapterKeyInIndex(idx, chapterKey);
    if (!entry) return null;
    const pack = await fetchLessonPack(courseSlug, entry.packId);
    if (!pack) return null;
    const glossary = (await fetchLessonGlossary(courseSlug, entry.packId)) ?? [];
    return { pack, glossary, previewOnly: pack.status !== "published" };
  },
);

/**
 * The STUDENT-VISIBLE lesson for a chapter — the T-C20 gate, verbatim
 * posture: a pack that is not published simply is not served (null), no
 * state leaked. The ?preview=1 escape hatch is handled by the PAGE layer
 * via fetchChapterLesson, never here.
 */
export const fetchPublishedLessonForChapter = cache(
  async (courseSlug: string, chapterKey: string): Promise<ChapterLesson | null> => {
    const lesson = await fetchChapterLesson(courseSlug, chapterKey);
    return lesson && !lesson.previewOnly ? lesson : null;
  },
);

/**
 * Shelf entries for the course — PUBLISHED packs only (T-C20: the
 * status-absent mirror; a draft pack is not on the shelf). Unknown shape
 * rows are skipped silently (honest absent), malformed index → empty.
 */
export const fetchLessonShelfEntries = cache(
  async (courseSlug: string): Promise<
    { packId: string; chapterKey: string; title: string; sectionCount: number; version: number }[]
  > => {
    const idx = await fetchLessonIndex(courseSlug);
    if (!idx) return [];
    const out: {
      packId: string;
      chapterKey: string;
      title: string;
      sectionCount: number;
      version: number;
    }[] = [];
    for (const e of idx) {
      const pack = await fetchLessonPack(courseSlug, e.packId);
      if (!pack || pack.status !== "published") continue;
      out.push({
        packId: pack.packId,
        chapterKey: pack.chapterKey,
        title: pack.title,
        sectionCount: pack.sections.length,
        version: pack.version,
      });
    }
    return out;
  },
);

// type-only re-exports keep page code aligned with the canonical contracts
export type { LessonPack, LessonSection };
