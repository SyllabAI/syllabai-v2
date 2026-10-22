/**
 * Underground Mathematics lane resources (server-only).
 *
 * The consumption seam for the UGM corpus landed of record in
 * SyllabAI/syllabai-resources (UGM-Enrichment #55 facts + UGM-Resources #58
 * text, functions lane second) under ADR-UGM-0001 as amended 2026-10-23 and
 * the operator attestation of 2026-10-23. The hub-side import is
 * scripts/import_ugm.py → content/<lane>/ugm-resources.json
 * (schema syllabai-demo.ugm-lane-resources/1.1, multi-lane); this module is its only
 * reader. Math stays byte-true in UGM's native \( \) / \[ \] delimiters —
 * the shared Markdown renderer's normalizeCorpusMath already supports them.
 *
 * Gating law (flags.json, ADR-CLASS-0001 practice adapted to content):
 *   - the flag FILE, the flag KEY or the course slug being ABSENT = OFF —
 *     getUgmBundle returns null and every surface renders its honest
 *     empty/not-found state; nothing renders from an unflagged bundle.
 *   - one-flip kill: delete the course slug from flags.json (content-only
 *     change, no code deploy).
 * The flag gates RENDERING only — it never fabricates data, and a flagged
 * course without a committed bundle still resolves to null (honest empty).
 *
 * The corpus is review_state SUGGESTED (AGENT.md rule 2): every surface
 * built on this module carries the state, the provenance tier and the
 * rights line — no surface may present these mappings as authoritative.
 */
import "server-only";
import { cache } from "react";
import { z } from "zod";
import { loadContentJson } from "@/lib/corpus";

export const UGM_FLAG_KEY = "ugmLaneResources";

// ── bundle schema (syllabai-demo.ugm-lane-resources/1.1) ──────────────
// 1.1 (multi-lane): singular station/stationUrl → stations[]; each resource
// carries its station slug; source.enrichment/resourcesDir are per-lane
// arrays; coverage gains a per-lane breakdown. 1.0 (single station) is
// superseded — schema drift degrades to the honest empty state (below).

const UgmSpecPointRef = z.object({
  code: z.string(),
  confidence: z.string().nullish(),
  primaryPick: z.boolean(),
  note: z.string().nullish(),
  modesRecorded: z.array(z.number()).default([]),
});

const UgmResource = z.object({
  ugmId: z.string(),
  slug: z.string(),
  station: z.string(),
  title: z.string(),
  url: z.string(),
  resourceType: z.string().nullish(),
  resourceTypeLabel: z.string().nullish(),
  level: z.string().nullish(),
  hasTeacherSupport: z.boolean(),
  nonOverlap: z.boolean(),
  nonOverlapReason: z.string().optional(),
  specPoints: z.array(UgmSpecPointRef),
  bodyMd: z.string(),
});

const UgmSpecPointIndex = z.object({
  code: z.string(),
  officialText: z.string().nullish(),
  primaryPick: z.string(),
  resourceCount: z.number(),
  ugmIds: z.array(z.string()),
});

const UgmStationRef = z.object({
  slug: z.string(),
  title: z.string(),
  url: z.string().nullish(),
});

const UgmLaneBundle = z.object({
  schema: z.string(),
  generatedUtc: z.string(),
  reviewState: z.object({ state: z.string(), note: z.string() }),
  lane: z.string(),
  stations: z.array(UgmStationRef).min(1),
  source: z.object({
    repo: z.string(),
    ref: z.string(),
    enrichment: z.array(z.string()).min(1),
    enrichmentSchema: z.string().optional(),
    resourcesDir: z.array(z.string()).min(1),
    ledger: z.string(),
    adr: z.string(),
    operatorAttestation: z.string(),
  }),
  rights: z.object({
    holder: z.string(),
    license: z.string(),
    textOnly: z.boolean(),
    note: z.string(),
  }),
  coverage: z.object({
    ugmResourcesConsidered: z.number(),
    aligned: z.number(),
    nonOverlap: z.number(),
    alignedShare: z.number().nullish(),
    candidateRows: z.number(),
    specPointsCovered: z.array(z.string()),
    lanes: z.array(z.object({
      station: z.string(),
      stationTitle: z.string(),
      ugmResourcesConsidered: z.number().nullish(),
      aligned: z.number(),
      nonOverlap: z.number(),
      alignedShare: z.number().nullish(),
      candidateRows: z.number(),
    })),
  }),
  specPoints: z.array(UgmSpecPointIndex),
  resources: z.array(UgmResource),
});

export type UgmBundle = z.infer<typeof UgmLaneBundle>;
export type UgmResource = z.infer<typeof UgmResource>;

// ── flag law (flags.json) ─────────────────────────────────────────────

const FlagsFile = z.object({
  schema: z.string(),
  flags: z.record(z.string(), z.unknown()),
});

/**
 * Render-time flag check. Absent file / absent key / absent slug = OFF.
 * Errors degrade to OFF (a broken flag file must never surface content).
 */
export const ugmFeatureEnabled = cache(async function ugmFeatureEnabled(
  courseSlug: string,
): Promise<boolean> {
  const raw = await loadContentJson("flags.json");
  if (!raw) return false;
  const parsed = FlagsFile.safeParse(raw);
  if (!parsed.success) {
    console.error("[ugm] flags.json unreadable — surface stays OFF", parsed.error.message);
    return false;
  }
  const entry = parsed.data.flags[UGM_FLAG_KEY];
  if (!entry || typeof entry !== "object") return false;
  const courses = (entry as { courses?: unknown }).courses;
  return Array.isArray(courses) && courses.includes(courseSlug);
});

/**
 * The flagged + committed + validated bundle for one course, or null.
 * Null is honest: flag off, bundle missing, or schema drift — the caller
 * renders the empty/not-found state either way.
 */
export const getUgmBundle = cache(async function getUgmBundle(
  courseSlug: string,
): Promise<UgmBundle | null> {
  if (!(await ugmFeatureEnabled(courseSlug))) return null;
  const raw = await loadContentJson(`${courseSlug}/ugm-resources.json`);
  if (!raw) return null;
  const parsed = UgmLaneBundle.safeParse(raw);
  if (!parsed.success) {
    console.error(
      `[ugm] bundle schema drift for ${courseSlug} — serving honest empty state`,
      parsed.error.message,
    );
    return null;
  }
  return parsed.data;
});

export function ugmResourceById(bundle: UgmBundle, ugmId: string): UgmResource | null {
  return bundle.resources.find((r) => r.ugmId === ugmId) ?? null;
}

/** Aligned resources hanging off one spec-point code, corpus order. */
export function ugmResourcesAt(bundle: UgmBundle, code: string): UgmResource[] {
  const ids = new Set(
    bundle.specPoints.find((sp) => sp.code === code)?.ugmIds ?? [],
  );
  return bundle.resources.filter((r) => ids.has(r.ugmId));
}

/** Station titles of the bundle's lanes, e.g. "Quadratics and Combining Functions". */
export function ugmStationNames(bundle: UgmBundle): string {
  const titles = bundle.stations.map((s) => s.title);
  if (titles.length <= 1) return titles[0] ?? "Underground Mathematics";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}
