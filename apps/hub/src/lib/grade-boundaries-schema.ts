/**
 * Grade Boundaries — the zod schema of record (T-GRADE-2 run-002).
 *
 * Split from lib/grade-boundaries.ts so the CONTRACT is importable from
 * plain bun:test / bun scripts (the loader module is server-only and pulls
 * the corpus fetch seam, which cannot run under bun:test). The loader, the
 * prebuild bundle validator and every test now share this one definition —
 * exactly the drift that produced run-002: the wave-2 bundle legitimately
 * carries series WITHOUT a series-level `boundaries` row (CIE documents
 * publish component + route tables; modular/IAL unit pages publish
 * unit raw/UMS + cash-in tables), the resources-lane G1 gate allowed that
 * shape, and the hub loader silently rejected the WHOLE bundle at safeParse
 * — every card on every course page fell back to the honest roadmap state
 * (production report: igcse-physics-19 grey/unclickable).
 *
 * Loader law (unchanged): strict zod at the boundary, honest null for
 * absent courses — but now the law and the corpus agree on the shape.
 */
import { z } from "zod";

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
          maxMark: z.number().nullable().optional(),
          // aggregate-ums mode (T-GRADE-2): the cash-in composition is
          // official Pearson structure metadata from the resources lane
          cashIn: z.string().optional(),
          required: z.array(z.string()).optional(),
          optionalPairs: z
            .array(z.tuple([z.string(), z.string()]))
            .optional(),
          aStar: z
            .object({
              overallMin: z.number(),
              a2Min: z.number(),
              a2Units: z.array(z.string()),
            })
            .optional(),
        })
        .nullable(),
      reviewRequired: z.boolean(),
      series: z.array(
        z.object({
          session: z.string(),
          year: z.number(),
          scale: z.string().optional(),
          maxMark: z.number().optional(),
          // OPTIONAL (T-GRADE-2 run-002): a series-level boundary row only
          // exists when the board publishes an OVERALL table for the
          // qualification — Edexcel linear International GCSE. CIE
          // thresholds documents grade through route options (routes[]) on
          // top of component tables; modular/IAL unit pages grade through
          // units[] raw→UMS and cashIns[]. The three shapes are disjoint
          // per course (linear-total ⇔ boundaries present), asserted by
          // scripts/validate_gradeb_bundle.ts in the prebuild chain.
          boundaries: z.record(z.string(), z.number().nullable()).optional(),
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
          // the full cash-in composition (standard variants, composition
          // order) — every unit the aggregate calculator converts, even on
          // "-unit-N" pages whose tables only list their own unit
          calculatorUnits: z
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
                gradeLadder: z.array(z.string()).optional(),
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
                award: z.string().nullable().optional(),
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
