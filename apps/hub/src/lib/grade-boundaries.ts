import "server-only";
/**
 * Grade Boundaries — the committed corpus loader (T-GRADE-1).
 *
 * The bundle is the mechanical import of the of-record resources lane
 * (`SyllabAI/syllabai-resources` GradeBoundaries/hub-import, sha-proven
 * Pearson/CIE documents, MathsGenie golden-master parity 6/6) into
 * `content/grade-boundaries/bundle.v1.json`. Loader laws mirror
 * lib/courses.ts: strict zod at the boundary, honest null for absent
 * courses, `cache()` per request — a course without corpus data resolves
 * to null and the card/page render the roadmap state, never a stub.
 */
import { cache } from "react";
import { z } from "zod";
import { loadContentJson } from "@/lib/corpus";

export const GradeBoundariesSchema = z.object({
  schema: z.string(),
  generated: z.string(),
  generator: z.string(),
  source: z.object({
    lane: z.string(),
    documents: z.number(),
    manifest_sha16: z.string().nullable(),
  }),
  counts: z.object({
    courses_served: z.number(),
    courses_roadmap: z.number(),
    courses_total: z.number(),
  }),
  courses: z.record(
    z.string(),
    z.object({
      code: z.string(),
      board: z.string(),
      level: z.string().nullable(),
      title: z.string().nullable(),
      gradeLadder: z.array(z.string()).nullable(),
      tier: z.string().nullable().optional(),
      calculator: z
        .object({
          mode: z.string(),
          maxMark: z.number().nullable(),
        })
        .nullable(),
      reviewRequired: z.boolean(),
      series: z.array(
        z.object({
          session: z.string(),
          year: z.number(),
          scale: z.string().optional(),
          maxMark: z.number().optional(),
          boundaries: z.record(z.string(), z.number().nullable()),
          gradeLadder: z.array(z.string()).nullable().optional(),
          papersNote: z.string().nullable().optional(),
          tier: z.string().nullable().optional(),
          units: z
            .array(
              z.object({
                code: z.string(),
                title: z.string(),
                maxMark: z.number(),
                boundaries: z.record(z.string(), z.number().nullable()),
                ums: z
                  .object({
                    maxMark: z.number(),
                    boundaries: z.record(z.string(), z.number().nullable()),
                  })
                  .nullable()
                  .optional(),
              }),
            )
            .optional(),
          cashIns: z
            .array(
              z.object({
                code: z.string(),
                title: z.string(),
                maxMark: z.number(),
                boundaries: z.record(z.string(), z.number().nullable()),
              }),
            )
            .optional(),
          components: z
            .array(
              z.object({
                code: z.string(),
                maxMark: z.number(),
                boundaries: z.record(z.string(), z.number().nullable()),
              }),
            )
            .optional(),
          routes: z
            .array(
              z.object({
                combination: z.string(),
                option: z.string().nullable().optional(),
                maxWeightedMark: z.number(),
                boundaries: z.record(z.string(), z.number().nullable()),
              }),
            )
            .optional(),
          source: z
            .object({
              family: z.string(),
              sha256_16: z.string(),
            })
            .optional(),
        }),
      ),
    }),
  ),
});

export type GradeBoundariesBundle = z.infer<typeof GradeBoundariesSchema>;
export type GradeBoundariesCourse = GradeBoundariesBundle["courses"][string];
export type GradeBoundariesSeries = GradeBoundariesCourse["series"][number];

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
