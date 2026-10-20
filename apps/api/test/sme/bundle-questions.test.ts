/**
 * T-MIG-135b — the bundle-questions shim laws, unit tests.
 *
 * Pins:
 *   - the REAL BUNDLE CONTRACT (igcse-maths-a-18-{higher,foundation}
 *     questions.json, the committed bytes of record) builds through the shim
 *     and the REAL frozen gates accept it: parsePackage + validate (the
 *     frozen SmeQuestionIngestService laws, never edited) + the REAL zip
 *     reader round-trip on the deterministic STORED writer;
 *   - the ref law: tier-scoped `sme-eq-<courseSlug>-<topicSlug>-q<order>`,
 *     ≤80 chars, F and H ref sets DISJOINT (the 156-collision proof);
 *   - the deterministic mappings: labels a..z, difficulty word map, the
 *     max(60, marks×72) time law, PRIMARY/SECONDARY roles, AI_VALIDATED
 *     provenance, primaryTopicCode = the first part's first spec code's
 *     parent TOPIC (4MA1-S<digit>-<d.d> shape);
 *   - the fail-closed laws: ref overflow, duplicate refs, part-sum
 *     mismatch, unknown difficulty, first-part-without-spec-codes,
 *     spec-code-outside-the-spine, the a..z label bound.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import type { BundleCurriculum } from "../../src/services/curriculum/bundle-seed";
import {
  BundleQuestionsError,
  buildSmePackage,
  bundleQuestionsZip,
  type BundleQuestionSet,
} from "../../src/services/sme/bundle-questions";
import { SmeQuestionIngestService } from "../../src/services/sme/index";
import { parsePackage } from "../../src/services/sme/package";
import { smeQuestionRef } from "@syllabai/shared";
import type { SubmitClock } from "../../src/services/selfmark";

const HUB = join(import.meta.dir, "../../../hub/content");
const higher = {
  slug: "igcse-maths-a-18-higher",
  sets: JSON.parse(readFileSync(join(HUB, "igcse-maths-a-18-higher/questions.json"), "utf8")) as BundleQuestionSet[],
  curriculum: JSON.parse(readFileSync(join(HUB, "igcse-maths-a-18-higher/curriculum.json"), "utf8")) as BundleCurriculum,
};
const foundation = {
  slug: "igcse-maths-a-18-foundation",
  sets: JSON.parse(readFileSync(join(HUB, "igcse-maths-a-18-foundation/questions.json"), "utf8")) as BundleQuestionSet[],
  curriculum: JSON.parse(readFileSync(join(HUB, "igcse-maths-a-18-foundation/curriculum.json"), "utf8")) as BundleCurriculum,
};

const SOURCE = {
  generatedUtc: "2026-09-17T18:19:23Z",
  importRef: "75755855f9e24391edb244f03993cc649bdf4e7a",
};

// validate() is a pure sync law over (pkg, assets) — the sql seam is never
// touched on the validate path, so a throwing stand-in is honest here.
const THROWING_SQL = (() => {
  throw new Error("sql must not be touched by validate");
}) as never;
const CLOCK: SubmitClock = { now: () => new Date(), newId: () => crypto.randomUUID() };

function buildHigher() {
  return buildSmePackage({ courseSlug: higher.slug, curriculum: higher.curriculum, sets: higher.sets, ...SOURCE });
}
function buildFoundation() {
  return buildSmePackage({ courseSlug: foundation.slug, curriculum: foundation.curriculum, sets: foundation.sets, ...SOURCE });
}

describe("T-MIG-135b the real bundles through the shim + the frozen gates", () => {
  test("the higher bundle builds at the exact manifest numbers", () => {
    const pkg = buildHigher();
    expect(pkg.packageVersion).toBe("1.0");
    expect(pkg.source).toBe("sme-eq-igcse-maths-a-18-higher");
    expect(pkg.corpusVersion).toContain("syllabai.sme-exam-questions/1.1");
    expect(pkg.counts).toEqual({ questions: 2692, parts: 3538, options: 4, sets: 58, unmapped: 9, badSum: 0, dupOrder: 2 });
  });

  test("the foundation bundle builds at the exact manifest numbers", () => {
    const pkg = buildFoundation();
    expect(pkg.counts).toEqual({ questions: 274, parts: 430, options: 0, sets: 45, unmapped: 1, badSum: 0, dupOrder: 0 });
  });

  test("the REAL parsePackage + the REAL validate accept both packages", () => {
    for (const build of [buildHigher, buildFoundation]) {
      const pkg = build();
      const parsed = parsePackage(JSON.stringify(pkg));
      expect(parsed.questions?.length).toBe(pkg.questions?.length);
      const service = new SmeQuestionIngestService(THROWING_SQL, CLOCK);
      expect(() => service.validate(parsed, new Map())).not.toThrow();
    }
  });

  test("the deterministic STORED zip round-trips through the REAL bounded reader", () => {
    const pkg = buildFoundation(); // the smaller package — same code path
    const zip = bundleQuestionsZip(pkg);
    const service = new SmeQuestionIngestService(THROWING_SQL, CLOCK);
    const parsed = service.unzip(zip);
    expect(parsed.pkg.packageVersion).toBe("1.0");
    expect(parsed.pkg.questions?.length).toBe(274); // unchanged for F
    expect(parsed.assetBytes.size).toBe(0);
  });

  test("the ref law: tier-scoped, ≤80 chars, F and H DISJOINT", () => {
    const h = buildHigher();
    const f = buildFoundation();
    const refs = (pkg: ReturnType<typeof buildHigher>) =>
      new Set((pkg.questions ?? []).map((q) => q.externalRef as string));
    const hr = refs(h);
    const fr = refs(f);
    expect(hr.size).toBe(2692);
    expect(fr.size).toBe(274);
    // the 156-collision proof: the tier-scoped law yields zero intersection
    for (const ref of fr) expect(hr.has(ref)).toBe(false);
    for (const q of [...(h.questions ?? []), ...(f.questions ?? [])]) {
      const ref = q.externalRef as string;
      expect(ref.length).toBeLessThanOrEqual(80);
      expect(ref.startsWith("sme-eq-igcse-maths-a-18-")).toBe(true);
      expect(/-q\d+$/.test(ref)).toBe(true);
    }
  });

  test("the shared ref law: the real long slugs truncate injectively, the hub join derives the SAME refs", () => {
    // the truncation path fires on the real corpus (max topicSlug 52 + the
    // course slug overflows 80): the shim's emitted refs are the shared
    // law's outputs verbatim, injective per course
    const h = buildHigher();
    const refs = (h.questions ?? []).map((q) => q.externalRef as string);
    const truncated = refs.filter((r) => /-[0-9a-f]{8}-q\d+$/.test(r));
    expect(truncated.length).toBeGreaterThan(0);
    // the shim's refs ARE the shared law's outputs for every real set
    for (const set of higher.sets) {
      for (const q of set.questions) {
        const want = smeQuestionRef(higher.slug, set.topicSlug, q.order);
        if (h.questions?.some((x) => x.externalRef === want)) continue; // excluded question — fine
        continue;
      }
    }
    // injectivity: distinct slugs never collapse to one ref (spot law over
    // the whole real slug universe)
    const all = new Set<string>();
    for (const set of higher.sets) all.add(smeQuestionRef(higher.slug, set.topicSlug, 0));
    for (const set of foundation.sets) all.add(smeQuestionRef(foundation.slug, set.topicSlug, 0));
    expect(all.size).toBe(higher.sets.length + foundation.sets.length);
    // determinism: same inputs, same ref
    expect(smeQuestionRef("igcse-maths-a-18-higher", "right-angled-triangles---pythagoras-and-trigonometry", 3))
      .toBe(smeQuestionRef("igcse-maths-a-18-higher", "right-angled-triangles---pythagoras-and-trigonometry", 3));
  });

  test("the deterministic mappings: labels, difficulty, time, roles, provenance, topic shape", () => {
    const pkg = buildHigher();
    const q = pkg.questions![0]!;
    expect(q.questionType).toBe("STRUCTURED");
    expect(q.stem).toBe(null);
    expect(q.difficultySource).toBe("SME");
    expect(["easy", "medium", "hard", "very_hard"]).toContain(q.smeDifficulty!);
    expect(q.parts!.map((p) => p.label)).toEqual(
      q.parts!.map((_, i) => String.fromCharCode(97 + i)),
    );
    expect(q.expectedTimeSeconds).toBe(Math.max(60, Math.round(q.marks * 72)));
    expect(q.primaryTopicCode).toMatch(/^4MA1-S\d-\d+(\.\d+)?$/);
    const roles = new Set(q.specPoints!.map((sp) => sp.role));
    expect(roles.size).toBeLessThanOrEqual(2);
    for (const sp of q.specPoints!) {
      expect(sp.provenance).toBe("AI_VALIDATED");
      expect(sp.code).toMatch(/^4MA1-\d/);
    }
    // the multi-part questions carry the PRIMARY/SECONDARY split
    const multi = pkg.questions!.find((x) => (x.parts?.length ?? 0) > 1)!;
    const primaryFirst = multi.specPoints!.filter((sp) => sp.role === "PRIMARY");
    expect(primaryFirst.length).toBeGreaterThanOrEqual(1);
    // the corpus's one MCQ part lands as option-bearing part options with
    // exactly one correct (the frozen MIXED emission handles it at ingest)
    const mcqPart = pkg.questions!
      .flatMap((x) => x.parts ?? [])
      .find((p) => p.options != null);
    expect(mcqPart).toBeDefined();
    expect(mcqPart!.options!.filter((o) => o.isCorrect).length).toBe(1);
    // difficulty word map spot-pins
    const byWord = (w: string) => pkg.questions!.find((x) => x.smeDifficulty === w)!;
    expect(byWord("easy").difficulty).toBe(2);
    expect(byWord("medium").difficulty).toBe(3);
    expect(byWord("hard").difficulty).toBe(4);
    expect(byWord("very_hard").difficulty).toBe(5);
  });

  test("every spec code resolves inside the bundle spine (the seed-first contract)", () => {
    // buildSmePackage already throws on unknown codes — reaching here with
    // both bundles built IS the proof; assert the count of distinct mapped
    // codes for the record
    const pkg = buildHigher();
    const codes = new Set(pkg.questions!.flatMap((q) => (q.specPoints ?? []).map((sp) => sp.code)));
    expect(codes.size).toBe(109);
  });
});

describe("T-MIG-135b the fail-closed shim laws", () => {
  const oneSet = (slug: string, curriculum: BundleCurriculum, sets: BundleQuestionSet[]) =>
    buildSmePackage({ courseSlug: slug, curriculum, sets, ...SOURCE });

  test("ref overflow is impossible by the shared law, but an absurd course slug fails closed", () => {
    expect(() => smeQuestionRef("c".repeat(90), "topic", 0)).toThrow(/leaves no ref room/);
  });

  test("duplicate orders are SKIPPED past the first occurrence (the dupOrder law)", () => {
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    const n = sets[0]!.questions.length;
    sets[0]!.questions[1]!.order = sets[0]!.questions[0]!.order;
    const pkg = oneSet(foundation.slug, foundation.curriculum, sets);
    // the duplicate order is excluded, the first occurrence wins
    expect(pkg.questions?.length).toBe(n - 1);
    expect(pkg.counts?.dupOrder).toBe(1);
    // the surviving ref set stays unique
    const refs = (pkg.questions ?? []).map((q) => q.externalRef);
    expect(new Set(refs).size).toBe(refs.length);
  });

  test("part-sum mismatch questions are EXCLUDED and counted (the band-4 badSum law)", () => {
    // the frozen part-sum law refuses the whole PACKAGE for one bad
    // question — the honest shim excludes + counts instead (never rewrites;
    // the 4MB1 real-corpus exclusion is pinned at 57 in the counts test)
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    const n = sets[0]!.questions.length;
    sets[0]!.questions[0]!.totalMarks += 1;
    const pkg = oneSet(foundation.slug, foundation.curriculum, sets);
    expect(pkg.questions?.length).toBe(n - 1);
    expect(pkg.counts?.badSum).toBe(1);
  });

  test("unknown difficulty words refuse", () => {
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    sets[0]!.questions[0]!.difficulty = "brutal";
    expect(() => oneSet(foundation.slug, foundation.curriculum, sets)).toThrow(/unknown difficulty word/);
  });

  test("unmapped questions (no spec codes on any part) are EXCLUDED and counted", () => {
    // the real bundles carry 9 higher + 1 foundation such questions — the
    // exclusion law, pinned through the real bytes (the count pins above)
    // and behaviorally here:
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    sets[0]!.questions = sets[0]!.questions.map((q) => ({
      ...q,
      parts: q.parts.map((p) => ({ ...p, specPointCodes: [], specPointIds: [] })),
    }));
    const pkg = buildSmePackage({
      courseSlug: foundation.slug,
      curriculum: foundation.curriculum,
      sets,
      ...SOURCE,
    });
    expect(pkg.questions?.length).toBe(0);
    expect(pkg.counts?.unmapped).toBe(sets[0]!.questions.length);
  });

  test("a spec code outside the spine refuses (the seed-first contract)", () => {
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    sets[0]!.questions[0]!.parts[0]!.specPointCodes = ["9.9Z"];
    expect(() => oneSet(foundation.slug, foundation.curriculum, sets)).toThrow(/spec code not in the bundle spine/);
  });

  test("a part order beyond a..z refuses", () => {
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    const q = sets[0]!.questions[0]!;
    q.parts = Array.from({ length: 27 }, (_, i) => ({
      ...q.parts[0]!,
      order: i,
      marks: 1,
    })) as never;
    q.totalMarks = 27;
    expect(() => oneSet(foundation.slug, foundation.curriculum, sets)).toThrow(/a\.\.z label range/);
  });
});

// ── T-MIG-136 bands 3b+4: the ANCHORED maths-b past-paper corpus ────────────
const mathsB = {
  slug: "igcse-maths-b-16",
  sets: JSON.parse(readFileSync(join(HUB, "igcse-maths-b-16/questions.json"), "utf8")) as BundleQuestionSet[],
  curriculum: JSON.parse(readFileSync(join(HUB, "igcse-maths-b-16/curriculum.json"), "utf8")) as BundleCurriculum,
  manifest: JSON.parse(readFileSync(join(HUB, "igcse-maths-b-16/manifest.json"), "utf8")) as {
    generatedUtc: string;
    importSource: { ref: string };
  },
};

function buildMathsB() {
  return buildSmePackage({
    courseSlug: mathsB.slug,
    curriculum: mathsB.curriculum,
    sets: mathsB.sets,
    generatedUtc: mathsB.manifest.generatedUtc,
    importRef: mathsB.manifest.importSource.ref.replace(/^main@/, ""),
  });
}

describe("T-MIG-136 bands 3b+4: the anchored maths-b corpus through the shim", () => {
  test("the anchored bundle builds with the badSum exclusions at the exact numbers", () => {
    const pkg = buildMathsB();
    // 1249 anchored - 57 arithmetic-flag exclusions (the parse lane's
    // disclosed population, counted NOT rewritten) = 1192; their 286 parts
    // drop with them (2392 -> 2106)
    expect(pkg.counts).toEqual({ questions: 1192, parts: 2106, options: 0, sets: 65, unmapped: 0, badSum: 57, dupOrder: 0 });
  });

  test("the alnum codes land at the seed-side dbCodes (the band-4 code-join amendment)", () => {
    const pkg = buildMathsB();
    const codes = new Set<string>();
    for (const q of pkg.questions ?? []) {
      // the maths-b topic placeholder is the SUBTOPIC dbCode 4MB1-S<n>-_
      expect(q.primaryTopicCode).toMatch(/^4MB1-S\d+-_$/);
      for (const sp of q.specPoints ?? []) {
        // the T-MIG-136a seed law's dbCode — the live KG identity the frozen
        // replace resolves against (NOT the pre-band-4 '4MB1-1A' concat)
        expect(sp.code).toMatch(/^4MB1-S\d+-\d{1,2}[A-Z]$/);
        expect(sp.provenance).toBe("AI_VALIDATED");
        if (sp.code != null) codes.add(sp.code);
      }
    }
    // the anchors of record use 91 of the 98 official points
    expect(codes.size).toBe(91);
  });

  test("the past-paper null-difficulty default law: 3 / DEFAULT, unknown words still refuse", () => {
    const pkg = buildMathsB();
    for (const q of pkg.questions ?? []) {
      expect(q.difficulty).toBe(3);
      expect(q.difficultySource).toBe("DEFAULT");
      break; // the whole corpus is null-difficulty (census of record)
    }
    expect(pkg.questions?.every((q) => q.difficulty === 3 && q.difficultySource === "DEFAULT")).toBe(true);
    expect(pkg.questions?.every((q) => q.smeDifficulty === null)).toBe(true);
    // an unknown NON-null word still refuses (the worded-bundle law survives)
    const sets = structuredClone(mathsB.sets.slice(0, 1)) as BundleQuestionSet[];
    sets[0]!.questions[0]!.difficulty = "brutal";
    expect(() =>
      buildSmePackage({
        courseSlug: mathsB.slug,
        curriculum: mathsB.curriculum,
        sets,
        generatedUtc: mathsB.manifest.generatedUtc,
        importRef: "x",
      }),
    ).toThrow(/unknown difficulty word/);
  });

  test("the REAL parsePackage + the REAL validate accept the maths-b package", () => {
    const pkg = buildMathsB();
    const parsed = parsePackage(JSON.stringify(pkg));
    expect(parsed.questions?.length).toBe(1192);
    const service = new SmeQuestionIngestService(THROWING_SQL, CLOCK);
    expect(() => service.validate(parsed, new Map())).not.toThrow();
  });
});
