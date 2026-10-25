/**
 * Underground Mathematics lane resources (server-only).
 *
 * The consumption seam for the UGM corpus landed of record in
 * SyllabAI/syllabai-resources (UGM-Enrichment #55 facts + UGM-Resources #58
 * text, quadratics lane first; Functions second — PR #61; Coordinate geometry
 * third — PR #66, the first multi-station lane; Circular measure fourth —
 * PR #74, the first STRAND lane: new-text subset plus a cross-lane join that
 * serves the circles strand against its existing lane-3 bodies; Trigonometry
 * fifth — PR #79, the second two-station lane: the whole substrate as text of
 * record plus two cross-lane fact joins against the lane-2 bodies; Series
 * sixth — PR #89, the third two-station lane; Differentiation seventh —
 * PR #91 + amendment #92, the fourth two-station lane; Integration eighth —
 * PR #96 + the T-UGM-MODE1-8 amendment #99, the second STRAND lane and the
 * first lane whose pick set is entirely cross-lane joined text; Algebra
 * ninth — PR #114, the FIRST lane on a SECOND course plane (cie-a-level-
 * maths-20-pure-3, CIE 9709 Pure 3 3.1 Algebra) — candidate-model shape:
 * 35 fresh bodies corpus-wide + 16 non-overlaps by reference (no text) +
 * 9 CROSS-COURSE fact joins against pure-1 bodies served by reference;
 * Logarithmic and exponential functions tenth — PR #119 + the T-UGM-MODE1-10
 * stationScope amendment, the SECOND pure-3 lane — dedicated-station-plus-
 * strays shape (exp-and-log 31 of 34 fresh + 3 strays): 34 fresh bodies +
 * 26 non-overlaps by reference + 5 CROSS-COURSE one-to-many joins against
 * pure-1 bodies; the lane-9 byref row to-log-or-not-to-log flips to aligned
 * WITH a fresh body under 3.2.3 (the CONSUME-10 supersede law drops the
 * stale byref row))
 * under ADR-UGM-0001 as amended 2026-10-23 and the operator attestations of
 * 2026-10-23 (text) and 2026-10-24 (static figures, T-UGM-ASSETS-1). The
 * hub-side import is
 * scripts/import_ugm.py → content/<lane>/ugm-resources.json
 * (schema syllabai-demo.ugm-lane-resources/1.1, multi-lane); this module is its only
 * reader. Math stays byte-true in UGM's native \( \) / \[ \] delimiters —
 * the shared Markdown renderer's normalizeCorpusMath already supports them.
 * The 8a image plane: the importer injects `![alt](/ugm-assets/…)` figure
 * lines into the served bodyMd at section-anchored positions (the corpus
 * map of record is UGM-Resources/figures-map.json; binaries ship in
 * apps/hub/public/ugm-assets/); per-resource `figures` counts ride the rows.
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
// Lane 3+ adds multi-station lanes: one lane may carry SEVERAL UGM stations
// (the corpus enrichment's stationScope block is the of-record breakdown);
// a resource's `station` is always its front-matter UGM station.

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
  // T-UGM-HUB-CONSUME-8a: figure references injected into bodyMd (count
  // mirrors the corpus figures-map.json rows for this resource)
  figures: z.number().default(0),
  // T-UGM-HUB-CONSUME-8b: of those, how many render INLINE at the converter's
  // position-accurate placeholder spots (the rest are section-anchored)
  figuresInline: z.number().default(0),
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
    // T-UGM-HUB-CONSUME-8a: the image-plane sources of record
    figureMap: z.string().optional(),
    assetsManifest: z.string().optional(),
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
    // strand lanes (lane 4+): the cross-lane join of record — cross-lane
    // mappings served against earlier lanes' bodies (no new entries);
    // T-UGM-HUB-CONSUME-9: cross-COURSE joins count here too (they serve
    // by reference against the other course's committed bundle)
    crossLaneJoined: z.object({
      aligned: z.number(),
      nonOverlap: z.number(),
    }).optional(),
    specPointsCovered: z.array(z.string()),
    // T-UGM-HUB-CONSUME-8a: the image-plane census (run-scoped sums)
    figures: z.object({
      figureRefs: z.number(),
      resources: z.number(),
      uniqueAssets: z.number(),
      // T-UGM-HUB-CONSUME-8b: placeholders localized inline (fail-closed:
      // the importer refuses to ship any un-localized image placeholder)
      inlineRewritten: z.number().optional(),
    }).optional(),
    // T-UGM-HUB-CONSUME-9 (lane 9, candidate-model law): non-overlap rows
    // with NO text of record (bodyImported=false) — disclosed with their
    // reasons, never served as bodies
    nonOverlapByReference: z.object({
      count: z.number(),
      rows: z.array(z.object({
        ugmSlug: z.string(),
        station: z.string().nullish(),
        title: z.string().nullish(),
        url: z.string().nullish(),
        reason: z.string().nullish(),
      })),
    }).optional(),
    // T-UGM-HUB-CONSUME-9: the cross-course by-reference joins — the text
    // of record stays first-of-record under the serving course's bundle
    crossCourse: z.object({
      aligned: z.number(),
      nonOverlapRef: z.number().optional(),
      flips: z.number().nullish(),
      oneToMany: z.number().nullish(),
      courses: z.record(z.string(), z.number()).optional(),
      note: z.string().optional(),
      rows: z.array(z.object({
        ugmSlug: z.string(),
        codes: z.array(z.string()),
        title: z.string().nullish(),
        url: z.string().nullish(),
        station: z.string().nullish(),
        textOfRecordUnder: z.string().nullish(),
        servedUnder: z.string(),
        kind: z.string().nullish(),
        confidence: z.string().nullish(),
        note: z.string().nullish(),
        primaryPick: z.boolean().optional(),
        priorAlignmentOfRecord: z.unknown().optional(),
        nonOverlapRef: z.boolean().optional(),
      })),
    }).optional(),
    lanes: z.array(z.object({
      station: z.string(),
      stationTitle: z.string(),
      ugmResourcesConsidered: z.number().nullish(),
      aligned: z.number(),
      nonOverlap: z.number(),
      alignedShare: z.number().nullish(),
      candidateRows: z.number(),
      crossLaneAligned: z.number().optional(),
      crossLaneNonOverlap: z.number().optional(),
    })),
  }),
  specPoints: z.array(UgmSpecPointIndex),
  resources: z.array(UgmResource),
});

export { UgmLaneBundle };

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

/** Station titles of the bundle's lanes, e.g. "Quadratics and Combining Functions" (4 lanes: "…, Geometry of Equations and Circles"). */
export function ugmStationNames(bundle: UgmBundle): string {
  const titles = bundle.stations.map((s) => s.title);
  if (titles.length <= 1) return titles[0] ?? "Underground Mathematics";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}
