/**
 * T-MIG-133 band 133f (r7a) — the bundle→spine adapter for second-subject
 * book rolls (the Maths A slice of record: 4MA1).
 *
 * WHY: the 133b join engine (spine-join.ts) is spine-INJECTED and
 * book-generic, but the chemistry pilot's spine source is the sha-pinned
 * teacher snapshot (loadConceptGraphSnapshot — 4CH1-only, 182 points). A
 * second subject has no such snapshot; it DOES have the hub content bundle
 * of record (apps/hub/content/<slug>/curriculum.json, schema
 * syllabai-demo.content-bundle/2.0, importSource SyllabAI/syllabai-resources
 * main@75755855, operator-authorized SME license line, Amendment
 * 2026-09-17). This adapter projects that bundle onto the SAME SpinePoint
 * shape the join engine consumes — zero forks of the join engine, zero DB
 * writes (the bundle→KG seed remains the T-MIG-134 instrument, operator-
 * gated; the books join does not need it because the spine is injected).
 *
 * Grammar of record (mirroring the chemistry snapshot's law, test fixture
 * 4CH1-1.1/1.1): code = `<specCode>-<node.code>` (e.g. "4MA1-1.1A");
 * officialCode = node.code (the OFFICIAL Edexcel statement number, letter
 * suffixes preserved: 1.1A/1.1B); wording = node.title verbatim
 * (whitespace as shipped — statement text is NEVER repaired, the verbatim
 * law); globalOrder = 1-based index in the bundle nodes array (stable, the
 * bundle's own order is the order of record).
 *
 * Fail-closed: missing/blank spec code, empty node set, zero SPEC_POINT
 * rows, duplicate official codes, non-string/blank titles — all throw.
 * The intake receipt of a real roll must additionally pin the bundle
 * sha256 (the driver carries --spine-expected for the count guard; the
 * unit test pins the digest of record: 9d4a42ca…f8724e5).
 *
 * Deterministic: no clocks, no randomness, no model calls, no filesystem
 * access (the caller reads the bundle bytes and passes the parsed JSON —
 * tests pass synthetic bundles, the driver passes the real pinned bytes).
 */

export interface BundleApplicability {
  tier?: string | null;
  papers?: string[] | null;
  rule?: string | null;
}

/** Structural minimal bundle node (superset-compatible with the
 * syllabai-demo.content-bundle/2.0 curriculum.json nodes; the T-MIG-134
 * seed's BundleCurriculum shape satisfies this structurally — no import,
 * no cross-lane coupling). */
export interface BundleNodeLike {
  code?: unknown;
  family?: unknown;
  title?: unknown;
  applicability?: BundleApplicability | null;
}

export interface BundleCurriculumLike {
  code?: unknown;
  nodes?: unknown;
}

export interface SpineCensus {
  specCode: string;
  nodes: number;
  topics: number;
  subtopics: number;
  specPoints: number;
  byTier: Record<string, number>;
}

export interface BundleSpineResult {
  spine: Array<{
    code: string;
    officialCode: string;
    wording: string;
    globalOrder: number;
  }>;
  census: SpineCensus;
}

function fail(msg: string): never {
  throw new Error(`bundle-spine: ${msg}`);
}

export function buildBundleSpine(
  bundle: BundleCurriculumLike,
  opts: { specCode?: string } = {},
): BundleSpineResult {
  if (typeof bundle.code !== "string" || bundle.code.trim() === "") {
    fail("bundle curriculum.code is missing or blank");
  }
  const specCode = opts.specCode ?? bundle.code;
  if (specCode.trim() === "") fail("specCode is blank");
  if (!Array.isArray(bundle.nodes)) fail("bundle nodes is not an array");
  if (bundle.nodes.length === 0) fail("bundle nodes is empty");

  const familyOf = (n: BundleNodeLike) =>
    typeof n.family === "string" ? n.family : "";
  const codeOf = (n: BundleNodeLike) =>
    typeof n.code === "string" ? n.code : "";

  let topics = 0;
  let subtopics = 0;
  const byTier: Record<string, number> = {};
  const spine: BundleSpineResult["spine"] = [];
  const seenOfficial = new Set<string>();

  for (let i = 0; i < bundle.nodes.length; i++) {
    const n = bundle.nodes[i] as BundleNodeLike;
    const family = familyOf(n);
    if (family === "TOPIC") topics += 1;
    else if (family === "SUBTOPIC") subtopics += 1;
    else if (family === "SPEC_POINT") {
      const official = codeOf(n);
      if (official.trim() === "") fail(`spec point at nodes[${i}] has a blank code`);
      if (seenOfficial.has(official)) {
        fail(`duplicate official spec code ${official}`);
      }
      seenOfficial.add(official);
      if (typeof n.title !== "string" || n.title.trim() === "") {
        fail(`spec point ${official} has a missing or blank wording`);
      }
      const tier =
        typeof n.applicability?.tier === "string" ? n.applicability.tier : "unspecified";
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      spine.push({
        code: `${specCode}-${official}`,
        officialCode: official,
        wording: n.title,
        globalOrder: i + 1,
      });
    }
    // other families (SUBJECT) are census-silent by design
  }

  if (spine.length === 0) fail("bundle carries zero SPEC_POINT rows");
  if (new Set(spine.map((p) => p.code)).size !== spine.length) {
    fail("duplicate spine codes (official codes unique but prefix collision)");
  }

  return {
    spine,
    census: {
      specCode,
      nodes: bundle.nodes.length,
      topics,
      subtopics,
      specPoints: spine.length,
      byTier,
    },
  };
}
