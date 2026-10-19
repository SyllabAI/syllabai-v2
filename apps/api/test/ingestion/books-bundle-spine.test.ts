/**
 * T-MIG-133 band 133f (r7a) — the second-subject spine gates (the Maths A
 * 4MA1 slice): the bundle→spine adapter against the REAL pinned bundle
 * bytes (the 134a "pinned bundle" precedent — in-repo committed corpus,
 * sha256 of record pinned HERE, drift fails this test first, loudly), the
 * adapter's fail-closed laws on synthetic bundles, the maths join smoke
 * (a real 4MA1 wording matches verbatim through the UNCHANGED 133b join
 * engine) and the maths official-code sort law (letter suffixes 1.1A/1.1B
 * sort inside their number: 1.1 < 1.1A < 1.2 < 1.10).
 *
 * No book text is reproduced — the LO fixtures quote SPEC STATEMENT
 * wordings from the in-repo SME-licensed bundle (the same class the
 * content bundles already ship); the real-book legs are receipted from
 * the operator-delivered package runs, not unit tests.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { buildBundleSpine, type BundleCurriculumLike } from "../../src/services/ingestion/books/bundle-spine";
import {
  joinChapterLearningObjectives,
  type SpinePoint,
} from "../../src/services/ingestion/books/spine-join";

const HIGHER_BUNDLE = join(
  import.meta.dir,
  "../../../../apps/hub/content/igcse-maths-a-18-higher/curriculum.json",
);
const FOUNDATION_BUNDLE = join(
  import.meta.dir,
  "../../../../apps/hub/content/igcse-maths-a-18-foundation/curriculum.json",
);

/** sha256 of record — the pinned-bundle law (see module header). */
const HIGHER_SHA256 = "9d4a42ca754f536477548f18058b535125937b486f3bca8edbd2a1624f8724e5";

const higherBytes = readFileSync(HIGHER_BUNDLE, "utf8");
const higherBundle = JSON.parse(higherBytes) as BundleCurriculumLike;
const foundationBundle = JSON.parse(readFileSync(FOUNDATION_BUNDLE, "utf8")) as BundleCurriculumLike;

describe("t-mig-133 band 133f — bundle pin (the REAL bytes)", () => {
  it("higher bundle digest matches the sha256 of record", () => {
    expect(createHash("sha256").update(higherBytes).digest("hex")).toBe(HIGHER_SHA256);
  });

  it("manifest schema + curriculum identity of record", () => {
    expect((higherBundle as { code?: unknown }).code).toBe("4MA1");
    const manifest = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../../../apps/hub/content/igcse-maths-a-18-higher/manifest.json"),
        "utf8",
      ),
    ) as { schema?: string; counts?: { specPoints?: number } };
    expect(manifest.schema).toBe("syllabai-demo.content-bundle/2.0");
    expect(manifest.counts?.specPoints).toBe(188);
  });
});

describe("t-mig-133 band 133f — buildBundleSpine on the REAL higher bundle", () => {
  const result = buildBundleSpine(higherBundle);

  it("census of record: 234 nodes / 6 topics / 39 subtopics / 188 spec points", () => {
    expect(result.census).toEqual({
      specCode: "4MA1",
      nodes: 234,
      topics: 6,
      subtopics: 39,
      specPoints: 188,
      byTier: { Foundation: 108, Higher: 80 },
    });
  });

  it("first spine point mirrors the chemistry grammar: code 4MA1-1.1A, bundle position preserved", () => {
    const first = result.spine[0]!;
    expect(first.officialCode).toBe("1.1A");
    expect(first.code).toBe("4MA1-1.1A");
    // globalOrder = the 1-based position in the bundle nodes array of record
    // (SUBJECT + TOPIC + SUBTOPIC precede the first SPEC_POINT — the
    // bundle's own order is the order of record, monotonic for the join
    // tiebreak)
    expect(first.globalOrder).toBe(4);
    expect(first.wording).toBe("understand and use integers (positive, negative and zero)");
  });

  it("spine laws: unique official codes, non-blank wordings, strictly increasing globalOrder", () => {
    const seen = new Set<string>();
    let prevOrder = 0;
    for (const p of result.spine) {
      expect(seen.has(p.officialCode)).toBe(false);
      seen.add(p.officialCode);
      expect(p.wording.trim().length).toBeGreaterThan(0);
      expect(p.globalOrder).toBeGreaterThan(prevOrder);
      prevOrder = p.globalOrder;
    }
    expect(seen.size).toBe(188);
  });

  it("letter-suffix and higher-tier statements are present (1.1B; a Higher-tier point)", () => {
    const codes = new Set(result.spine.map((p) => p.officialCode));
    expect(codes.has("1.1B")).toBe(true);
    // the bundle's tier split: 108 Foundation-assumed + 80 Higher-only
    expect(codes.size).toBe(188);
  });

  it("JOIN SMOKE: a real 4MA1 wording matches VERBATIM (tier 1) through the unchanged 133b engine", () => {
    const first = result.spine[0]!;
    const loText = `LEARNING OBJECTIVES\n\n• ${first.wording}`;
    const joined = joinChapterLearningObjectives(loText, "lo:fixture", result.spine);
    expect(joined.matchedBullets).toBe(1);
    expect(joined.refs.length).toBe(1);
    expect(joined.refs[0]!.officialCode).toBe("1.1A");
    expect(joined.refs[0]!.spineCode).toBe("4MA1-1.1A");
    expect(joined.refs[0]!.method).toBe("verbatim");
    expect(joined.refs[0]!.tier).toBe("1");
    expect(joined.review.length).toBe(0);
  });
});

describe("t-mig-133 band 133f — the tier-generic instrument (foundation bundle)", () => {
  it("foundation bundle projects 162 Foundation-only points", () => {
    const result = buildBundleSpine(foundationBundle);
    expect(result.census.specCode).toBe("4MA1");
    expect(result.census.specPoints).toBe(162);
    expect(result.census.byTier).toEqual({ Foundation: 162 });
  });
});

describe("t-mig-133 band 133f — maths official-code sort law", () => {
  it("refs order 1.1 < 1.1A < 1.2 < 1.10 (letter suffixes inside their number)", () => {
    const spine: SpinePoint[] = [
      { code: "4MA1-1.1", officialCode: "1.1", wording: "understand statement one", globalOrder: 1 },
      { code: "4MA1-1.1A", officialCode: "1.1A", wording: "understand statement one a", globalOrder: 2 },
      { code: "4MA1-1.2", officialCode: "1.2", wording: "understand statement two", globalOrder: 3 },
      { code: "4MA1-1.10", officialCode: "1.10", wording: "understand statement ten", globalOrder: 4 },
    ];
    // verb-led bullets (the real LO-box shape — lowercase starts fold as
    // sub-bullets per the 133b splitBullets law)
    const loText = [
      "LEARNING OBJECTIVES",
      "• Understand statement ten",
      "• Understand statement two",
      "• Understand statement one a",
      "• Understand statement one",
    ].join("\n\n");
    const joined = joinChapterLearningObjectives(loText, "lo:sort", spine);
    expect(joined.refs.map((r) => r.officialCode)).toEqual(["1.1", "1.1A", "1.2", "1.10"]);
  });
});

describe("t-mig-133 band 133f — fail-closed laws", () => {
  const okNode = { code: "1.1", family: "SPEC_POINT", title: "understand something" };

  it("throws on a blank spec code", () => {
    expect(() =>
      buildBundleSpine({ code: "4MA1", nodes: [{ ...okNode, code: " " }] }),
    ).toThrow(/blank code/);
  });

  it("throws on a missing code field", () => {
    expect(() =>
      buildBundleSpine({ code: "4MA1", nodes: [{ family: "SPEC_POINT", title: "x" }] }),
    ).toThrow(/blank code/);
  });

  it("throws on duplicate official codes", () => {
    expect(() =>
      buildBundleSpine({ code: "4MA1", nodes: [okNode, { ...okNode, title: "another" }] }),
    ).toThrow(/duplicate official spec code 1\.1/);
  });

  it("throws on a missing or blank wording", () => {
    expect(() =>
      buildBundleSpine({ code: "4MA1", nodes: [{ ...okNode, title: "" }] }),
    ).toThrow(/missing or blank wording/);
  });

  it("throws on zero SPEC_POINT rows / empty nodes / missing bundle code", () => {
    expect(() => buildBundleSpine({ code: "4MA1", nodes: [{ code: "t1", family: "TOPIC", title: "T" }] })).toThrow(
      /zero SPEC_POINT/,
    );
    expect(() => buildBundleSpine({ code: "4MA1", nodes: [] })).toThrow(/empty/);
    expect(() => buildBundleSpine({ nodes: [okNode] })).toThrow(/curriculum\.code is missing or blank/);
  });

  it("honors the explicit specCode override (bundle-generic instrument)", () => {
    const result = buildBundleSpine({ code: "4MA1", nodes: [okNode] }, { specCode: "4MA0" });
    expect(result.census.specCode).toBe("4MA0");
    expect(result.spine[0]!.code).toBe("4MA0-1.1");
  });
});
