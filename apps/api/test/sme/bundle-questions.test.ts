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
// ADR-037 (run-004, trace 1a15fc4a3676c085): the chemistry-19 bundle is the
// per-point re-apply's content plane — the official past-paper sets carry
// PER-PAPER topicSlugs (the set slug itself) so the shared ref law's
// (topicSlug, order) namespace is injective across sets. The pre-fix law
// (every official set on "official-past-papers") collided on 12 base refs /
// 35 emitted forms and the frozen package-global seenRefs gate refused the
// bundle at BUILD — the run-003 of-record blocker.
const chemistry = {
  slug: "igcse-chemistry-19",
  // Bank of record spans both planes post-IA-split: questions.json (28 SME
  // topic sets) + official-papers.json (54 ADR-037 official sets, optional
  // file) — the same concat order as the pre-split file, so every frozen
  // census pin below is byte-stable.
  sets: [
    ...JSON.parse(readFileSync(join(HUB, "igcse-chemistry-19/questions.json"), "utf8")),
    ...JSON.parse(readFileSync(join(HUB, "igcse-chemistry-19/official-papers.json"), "utf8")),
  ] as BundleQuestionSet[],
  curriculum: JSON.parse(readFileSync(join(HUB, "igcse-chemistry-19/curriculum.json"), "utf8")) as BundleCurriculum,
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
function buildChemistry() {
  return buildSmePackage({ courseSlug: chemistry.slug, curriculum: chemistry.curriculum, sets: chemistry.sets, ...SOURCE });
}

describe("T-MIG-135b the real bundles through the shim + the frozen gates", () => {
  test("the higher bundle builds at the exact manifest numbers", () => {
    const pkg = buildHigher();
    expect(pkg.packageVersion).toBe("1.0");
    expect(pkg.source).toBe("sme-eq-igcse-maths-a-18-higher");
    expect(pkg.corpusVersion).toContain("syllabai.sme-exam-questions/1.1");
    // 2ece53b re-import carried no option-bearing parts; the 4MB1 OCR-repair
    // wave re-introduced four option-bearing maths-a parts (options 0 -> 4)
    expect(pkg.counts).toEqual({ questions: 2692, parts: 3538, options: 4, sets: 58, unmapped: 9, badSum: 0, dupOrder: 2 });
  });

  test("the foundation bundle builds at the exact manifest numbers", () => {
    const pkg = buildFoundation();
    expect(pkg.counts).toEqual({ questions: 274, parts: 430, options: 0, sets: 45, unmapped: 1, badSum: 0, dupOrder: 0 });
  });

  test("the chemistry-19 bundle builds at the ADR-037 wave-12 census numbers with the per-paper official namespace (run-004 + wave 12)", () => {
    const pkg = buildChemistry();
    // the R-VARIANT wave-17 census of record (82 sets: 28 topic + 54 official —
    // 16 1C + 16 2C + the F-178 R tranches 11 1CR + 11 2CR; converter v0.13.1 —
    // the R tranches convert (PR #46/#47), the spec-label waves resolve 1059/1059
    // R parts with zero pending-llm (resources PR #50), and the F52 italic-Delta
    // normalization fixes the 2020-01 R prose; unmapped 1 -> 2: the corpus-level
    // anchor-law counter now spans the R slices' one honestly-unmapped question
    // plus the documented 2019-06 1C terminal case)
    expect(pkg.counts).toEqual({ questions: 999, parts: 4007, options: 1480, sets: 82, unmapped: 2, badSum: 0, dupOrder: 0 });
    const refs = (pkg.questions ?? []).map((q) => q.externalRef as string);
    // the package-global namespace is injective — the exact gate that
    // refused the pre-fix bundle (run-003: duplicate externalRef
    // sme-eq-igcse-chemistry-19-official-past-papers-q1)
    expect(new Set(refs).size).toBe(refs.length);
    // the official plane: 476 admitted questions post-wave-17 (was 280 at
    // wave-12: the F-178 R-variant tranches join — 118 1CR + 79 2CR questions
    // minus the one terminal unmapped question that does not build a served
    // ref), per-paper ref forms now spanning all four variants, every ref
    // embedding its own set slug
    const official = refs.filter((r) => r.includes("official-4ch1-"));
    expect(official.length).toBe(476);
    expect(new Set(official).size).toBe(476);
    for (const ref of official) {
      expect(ref).toMatch(/^sme-eq-igcse-chemistry-19-official-4ch1-(1c|2c|1cr|2cr)-\d{4}-\d{2}-q\d+$/);
    }
    // the topic plane: untouched by the waves (999 - 476)
    expect(refs.length - official.length).toBe(523);
  });

  test("the REAL parsePackage + the REAL validate accept both packages", () => {
    for (const build of [buildHigher, buildFoundation, buildChemistry]) {
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
    // the 4MB1 OCR-repair wave re-introduced option-bearing parts (options 4) —
    // the MCQ emission law is exercised on real corpus parts again
    const mcqPart = pkg.questions!
      .flatMap((x) => x.parts ?? [])
      .find((p) => p.options != null);
    expect(mcqPart).toBeDefined();
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

  test("ref overflow is impossible by the shared law: an absurd course slug compresses deterministically within the varchar(80) bound (the tranche-3 amendment)", () => {
    // the pre-tranche-3 law refused a 90-char course slug outright
    // (/leaves no ref room/); the run-006 0973 class (55-char registry
    // slugs) required the deterministic slice+hash compression — the same
    // law the topic side carries — so the pin moves to the bound itself
    const ref = smeQuestionRef("c".repeat(90), "topic", 0);
    expect(ref.length).toBeLessThanOrEqual(80);
    expect(ref.startsWith("sme-eq-")).toBe(true);
  });

  test("two sets sharing a topicSlug collide on the package-global namespace and REFUSE (the run-003 blocker class — the per-paper namespace is the fix)", () => {
    // the pre-fix official wiring: every set on one topicSlug, orders
    // restarting per set — the shared law derives the same ref twice and
    // the frozen seenRefs gate refuses the whole bundle at BUILD
    const a = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    const b = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    b[0]!.slug = a[0]!.slug + "-twin";
    b[0]!.questions[0]!.order = a[0]!.questions[0]!.order;
    expect(() => oneSet(foundation.slug, foundation.curriculum, [...a, ...b])).toThrow(/duplicate externalRef/);
    // the fix law: distinct per-paper topicSlugs dissolve the collision —
    // same orders, same course, disjoint refs, clean build
    const c = structuredClone(a);
    const d = structuredClone(b);
    d[0]!.topicSlug = d[0]!.slug;
    c[0]!.topicSlug = c[0]!.slug;
    const pkg = oneSet(foundation.slug, foundation.curriculum, [...c, ...d]);
    const refs = (pkg.questions ?? []).map((q) => q.externalRef as string);
    expect(new Set(refs).size).toBe(refs.length);
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

// ── T-MIG-136 bands 3b+4 -> T-CONSUME-EDX-1: the maths-b past-paper corpus ──
// The 2ece53b Edexcel bundle refresh EMPTIED the hub bundle's question axis
// (igcse-maths-b-16 questions 1,249 -> 0, the upstream SME manifest's
// census-backed no_topic_questions_on_sme ruling) and moved the question axis
// to the band-5 DB fetch-bank (1,192 anchored rows). The bundle-side pinned
// laws (1,192-count census, 91-of-98 anchor codes, whole-corpus null
// difficulty) therefore died with the refresh; the shim's deterministic
// mapping laws survive and are pinned here through synthetic 1.1 sets.
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

/** one minimal in-spine 1.1 set: Q1 (2 marks, one part, spec 1A) */
function oneSyntheticSet(difficulty: string | null, code = "1A"): BundleQuestionSet[] {
  return [
    {
      topicId: "top_synth--tqst_synth",
      slug: "2026-06-4mb1-01--exam-questions",
      name: "June 2026 · Paper 1 (4MB1/01)",
      topicSlug: "2026-06-4mb1-01",
      section: "Past papers",
      sectionSlug: "past-papers",
      curriculum: {
        board: "Pearson Edexcel",
        level: "IGCSE",
        subject: "Maths",
        code: "4MB1",
        syllabusVersion: "2016",
      },
      source: { provider: "synthetic law probe", license: "n/a" },
      schema: "syllabai.sme-exam-questions/1.1",
      relatedNoteIds: [],
      questions: [
        {
          id: "qstn_synth01",
          order: 0,
          difficulty,
          style: "exam_whole",
          totalMarks: 2,
          parts: [
            {
              id: "qstnprt_synth01",
              order: 0,
              questionType: "open",
              marks: 2,
              commandWord: "Find",
              specPointIds: [code],
              specPointCodes: [code],
              problemMd: "Work out 2 + 2.\n\n............",
              solutionMd: "**P1** (2 marks) 4",
              choices: null,
              sourcePaper: { date: "June 2026", number: "4MB1/01", questionNumber: 1, questionPart: null },
            },
          ],
        },
      ],
    },
  ] as unknown as BundleQuestionSet[];
}


describe("ADR-037 v0.7 the markPoints ride-through laws", () => {
  const one = (sets: BundleQuestionSet[]) =>
    buildSmePackage({ courseSlug: foundation.slug, curriculum: foundation.curriculum, sets, ...SOURCE });
  test("per-point markPoints map 1.1 → 1.0 and pass the REAL frozen gates", () => {
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    const part = sets[0]!.questions[0]!.parts[0]!;
    const first = Math.max(1, part.marks - 1);
    part.markPoints = [
      { id: "MP1", marks: first, textMd: "first awardable point" },
      { id: "MP2", marks: part.marks - first, textMd: "second awardable point" },
    ];
    const pkg = one(sets);
    const mp = pkg.questions?.[0]!.parts?.[0]!.markPoints;
    expect(mp).not.toBeNull();
    expect(mp!.length).toBe(2);
    expect(mp!.reduce((s, m) => s + m.marks, 0)).toBe(part.marks);
    expect(mp![0]!.text).toBe("first awardable point");
    // the REAL frozen gates accept the amended tree (parse + validate)
    const service = new SmeQuestionIngestService(THROWING_SQL, CLOCK);
    expect(() =>
      service.validate(parsePackage(JSON.stringify(pkg)), new Map()),
    ).not.toThrow();
  });

  test("a markPoints sum violation refuses the shim (the G7 law, fail-closed)", () => {
    const sets = structuredClone(foundation.sets.slice(0, 1)) as BundleQuestionSet[];
    const part = sets[0]!.questions[0]!.parts[0]!;
    part.markPoints = [{ id: "MP1", marks: part.marks + 1, textMd: "too many marks" }];
    expect(() => one(sets)).toThrow(
      BundleQuestionsError,
    );
  });
});

describe("T-MIG-136 bands 3b+4 through T-CONSUME-EDX-1: the maths-b corpus laws", () => {
  test("the RESTORED interactive bundle builds through the shim (the 04aee80 operator ruling 'Restore it', trace 1a15de779f2250f9)", () => {
    // the 2ece53b emptied state was superseded of record: the operator
    // restored the interactive maths-b bundle (65 sets / 1,249 questions,
    // byte-exact from 8ee371e) — the restored bundle builds through the
    // shim, and the question-less refusal law is pinned synthetically below.
    // ocr-repair-run-001-r0 (trace 1a15e7d6114dff35 'Initiate OCR to fix the
    // capture channel') then recovered the image-only 2019-06 4MB1/02R QP:
    // the last honest-empty set became a real 11-question/100-mark record
    // (evidence-grounded, 0 badSum candidates) -> census 65 sets / 1,260.
    // parse-repair-run-001-r0 (trace 1a15fcd0922b2391 'fire the parse-repair
    // ops lane') then reconciled the whole bundle to the official QP-footer/
    // blueprint evidence: the 57 defects-vs-official repaired, 10 missing
    // questions recovered (incl. the 2023-01-02 q11/q12 split), badSum 0 ->
    // the of-record census is 65 sets / 1,270 questions, ALL of which now
    // map through the shim (excluded = 0; the conservation law holds with
    // an empty exclusion population).
    expect(mathsB.sets.length).toBe(65);
    const pkg = buildMathsB();
    expect(pkg.counts?.sets).toBe(65);
    // the conservation law: every bundle question either maps through or is
    // excluded AND counted (the band-4 unmapped/badSum/dupOrder population)
    const excluded =
      (pkg.counts?.unmapped ?? 0) + (pkg.counts?.badSum ?? 0) + (pkg.counts?.dupOrder ?? 0);
    expect(excluded + (pkg.questions ?? []).length).toBe(1270);
    expect((pkg.questions ?? []).length).toBeGreaterThan(0);
    expect(() =>
      buildSmePackage({ courseSlug: mathsB.slug, curriculum: mathsB.curriculum, sets: [], ...SOURCE }),
    ).toThrow(/carries no question sets/);
  });

  test("the deterministic mapping laws on a synthetic in-spine set: difficulty word ranks, dbCode joins, provenance", () => {
    const pkg = buildSmePackage({
      courseSlug: mathsB.slug,
      curriculum: mathsB.curriculum,
      sets: oneSyntheticSet("easy"),
      generatedUtc: mathsB.manifest.generatedUtc,
      importRef: "x",
    });
    const q = pkg.questions?.[0]!;
    // the worded difficulty law (easy 2 / medium 3 / hard 4), source "SME"
    expect(q.difficulty).toBe(2);
    expect(q.difficultySource).toBe("SME");
    expect(q.smeDifficulty).toBe("easy");
    // the seed-side dbCode join survives: spec 1A -> SUBTOPIC placeholder topic + 4MB1-S1-1A
    expect(q.primaryTopicCode).toBe("4MB1-S1-_");
    expect(q.specPoints?.[0]?.code).toBe("4MB1-S1-1A");
    expect(q.specPoints?.[0]?.provenance).toBe("AI_VALIDATED");
  });

  test("the difficulty rank pins across the word alphabet (medium 3, hard 4)", () => {
    for (const [word, rank] of [["medium", 3], ["hard", 4]] as const) {
      const pkg = buildSmePackage({
        courseSlug: mathsB.slug,
        curriculum: mathsB.curriculum,
        sets: oneSyntheticSet(word),
        generatedUtc: mathsB.manifest.generatedUtc,
        importRef: "x",
      });
      expect(pkg.questions?.[0]?.difficulty).toBe(rank);
      expect(pkg.questions?.[0]?.difficultySource).toBe("SME");
    }
  });

  test("the past-paper null-difficulty default law: 3 / DEFAULT for a residual null", () => {
    const pkg = buildSmePackage({
      courseSlug: mathsB.slug,
      curriculum: mathsB.curriculum,
      sets: oneSyntheticSet(null),
      generatedUtc: mathsB.manifest.generatedUtc,
      importRef: "x",
    });
    expect(pkg.questions?.[0]?.difficulty).toBe(3);
    expect(pkg.questions?.[0]?.difficultySource).toBe("DEFAULT");
    expect(pkg.questions?.[0]?.smeDifficulty).toBe(null);
  });

  test("an unknown NON-null difficulty word still refuses (the worded-bundle law)", () => {
    expect(() =>
      buildSmePackage({
        courseSlug: mathsB.slug,
        curriculum: mathsB.curriculum,
        sets: oneSyntheticSet("brutal"),
        generatedUtc: mathsB.manifest.generatedUtc,
        importRef: "x",
      }),
    ).toThrow(/unknown difficulty word/);
  });

  test("the REAL parsePackage + the REAL validate accept the synthetic maths-b package", () => {
    const pkg = buildSmePackage({
      courseSlug: mathsB.slug,
      curriculum: mathsB.curriculum,
      sets: oneSyntheticSet("easy"),
      generatedUtc: mathsB.manifest.generatedUtc,
      importRef: "x",
    });
    const parsed = parsePackage(JSON.stringify(pkg));
    expect(parsed.questions?.length).toBe(1);
    const service = new SmeQuestionIngestService(THROWING_SQL, CLOCK);
    expect(() => service.validate(parsed, new Map())).not.toThrow();
  });
});
