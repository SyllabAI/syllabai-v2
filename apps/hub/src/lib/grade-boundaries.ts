import "server-only";
/**
 * Grade Boundaries — the committed corpus loader (T-GRADE-1, run-002 split).
 *
 * The bundle is the mechanical import of the of-record resources lane
 * (`SyllabAI/syllabai-resources` GradeBoundaries/hub-import, sha-proven
 * Pearson/CIE documents, MathsGenie golden-master parity 6/6) into
 * `content/grade-boundaries/bundle.v1.json`. Loader laws mirror
 * lib/courses.ts: strict zod at the boundary, honest null for absent
 * courses, `cache()` per request — a course without corpus data resolves
 * to null and the card/page render the roadmap state, never a stub.
 *
 * RUN-002: the zod contract of record moved to ./grade-boundaries-schema
 * so the prebuild bundle validator and bun:test share the exact shape the
 * loader enforces (the wave-2 CIE/modular series shapes without a
 * series-level boundaries row must parse — a loader/contract drift here
 * nulls the WHOLE bundle and every course card falls back to roadmap).
 */
import { cache } from "react";
import { loadContentJson } from "@/lib/corpus";
import { GradeBoundariesSchema } from "./grade-boundaries-schema";
import type {
  GradeBoundariesBundle,
  GradeBoundariesCourse,
} from "./grade-boundaries-schema";

export { GradeBoundariesSchema } from "./grade-boundaries-schema";
export type {
  GradeBoundariesBundle,
  GradeBoundariesCourse,
  GradeBoundariesSeries,
} from "./grade-boundaries-schema";

const BUNDLE_REL = "grade-boundaries/bundle.v1.json";

export const loadGradeBoundariesBundle = cache(async (): Promise<GradeBoundariesBundle | null> => {
  const raw = await loadContentJson<unknown>(BUNDLE_REL);
  if (!raw) return null;
  const parsed = GradeBoundariesSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[grade-boundaries] bundle failed schema:",
      parsed.error.issues.slice(0, 3),
    );
    return null;
  }
  return parsed.data;
});

/** The course's boundaries entry, or null when the corpus has none yet. */
export const getGradeBoundaries = cache(
  async (slug: string): Promise<GradeBoundariesCourse | null> => {
    const bundle = await loadGradeBoundariesBundle();
    const entry = bundle?.courses[slug];
    return entry && entry.series.length > 0 ? entry : null;
  },
);

/** Cheap card-level summary (same bundle, cached — no extra IO). */
export const getGradeBoundariesSummary = cache(
  async (
    slug: string,
  ): Promise<{ seriesCount: number; latestSession: string | null; reviewRequired: boolean } | null> => {
    const entry = await getGradeBoundaries(slug);
    if (!entry) return null;
    const latest = entry.series[entry.series.length - 1];
    return {
      seriesCount: entry.series.length,
      latestSession: latest?.session ?? null,
      reviewRequired: entry.reviewRequired,
    };
  },
);
