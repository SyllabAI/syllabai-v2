/**
 * T-SM-EDX-INGEST-R1 residue-fix — the 4-question package driver (econ ×2 + pure-1 ×2).
 *
 * AGENT-SIDE fix tool (not committed; the lane receipt records it). The
 * frozen shim CANNOT package these courses: the econ bundle's `:SUB1.1.1`
 * three-segment dotted SUBTOPIC tails predate the frozen subtopic law, and
 * the awave-seeded DB spines (econ TOPICs `4EC1-S{topicOrder}-{a}`, flat
 * spec codes `4EC1-{code}`; pure-1 `YMA01-P1.x` prefix injection, primary
 * `YMA01-SP{n}-_`) are not derivable by the current mapper. Proven by the
 * frozen validate fail-closing (`YMA01-1.11` unknown KG code) on the of-record
 * targeted runner.
 *
 * THIS driver therefore builds the 4-question packages by mirroring the
 * shim's per-question field laws byte-for-byte (bundle-questions.ts:245-449)
 * and hands them to the FROZEN SmeQuestionIngestService (validate + KG
 * resolution + ADR-026 slice-scoped replace + version/scheme emission) —
 * every DB-facing law stays frozen. The 4 emitted refs are ABSENT from the
 * questions table (probe of record), so the replace is a pure insert:
 * zero deactivations, zero touching of the serving 958.
 *
 * Code grounding of record (DB-verified from the serving rows):
 *   econ  government-policies-q35            spec 4EC1-2.1.2b  primary 4EC1-S3-2
 *         (Monetary policy / central banks — ECB asset purchases;
 *          set siblings anchor 2.1.2x with primary 4EC1-S3-2)
 *   econ  the-macroeconomic-objectives-q14   spec 4EC1-1.1.1e  primary 4EC1-S1-1
 *         ("Possible causes of positive or negative economic growth" — exact;
 *          sibling q0 anchors 1.1.1e with primary 4EC1-S1-1)
 *   pure-1 graphs-of-functions-q0           spec YMA01-P1.11  primary YMA01-SP1-_
 *         (Graphs of functions; sketching — sibling sketching rows)
 *   pure-1 laws-of-indices-and-surds-q11    spec YMA01-P1.1   primary YMA01-SP1-_
 *         (Laws of indices — both parts; sibling index-law rows)
 *
 * Usage:
 *   bun apps/api/scripts/r1fix-econ-package.ts --dry-run
 *   bun apps/api/scripts/r1fix-econ-package.ts --apply
 * SEED_DATABASE_URL inline-only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

import {
  bundleQuestionsZip,
  type BundleQuestionSet as ShimSet,
  type SmePackage,
  type SmePart,
  type SmeQuestion,
} from "../src/services/sme/bundle-questions";
import { SmeQuestionIngestService } from "../src/services/sme/index";
import type { SubmitClock } from "../src/services/selfmark";
import { flattenTxForFrozenServices } from "./cie-phase4-apply";

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;
if (!mode) {
  console.error("usage: bun r1fix-econ-package.ts (--apply | --dry-run)");
  process.exit(2);
}
const uri = process.env.SEED_DATABASE_URL;
if (!uri) {
  console.error("SEED_DATABASE_URL missing (inline env only)");
  process.exit(2);
}

// ── the DB-verified anchor grounding (the authored corpus codes → awave DB codes) ──
const COURSES = [
  {
    slug: "igcse-economics-17",
    anchors: {
      "government-policies-q35": { specDb: "4EC1-2.1.2b", primaryDb: "4EC1-S3-2" },
      "the-macroeconomic-objectives-q14": { specDb: "4EC1-1.1.1e", primaryDb: "4EC1-S1-1" },
    } as Record<string, { specDb: string; primaryDb: string }>,
  },
  {
    slug: "ial-maths-20-pure-1",
    anchors: {
      "graphs-of-functions-q0": { specDb: "YMA01-P1.11", primaryDb: "YMA01-SP1-_" },
      "laws-of-indices-and-surds-q11": { specDb: "YMA01-P1.1", primaryDb: "YMA01-SP1-_" },
    } as Record<string, { specDb: string; primaryDb: string }>,
  },
];

const DIFFICULTY_TO_INT: Record<string, number> = { easy: 2, medium: 3, hard: 4, very_hard: 5 };
const SECONDS_PER_MARK = 72;
const MIN_TIME_SECONDS = 60;
const partLabel = (order: number): string => {
  if (order < 0 || order > 25) throw new Error("part order out of the a..z label range");
  return String.fromCharCode(97 + order);
};

// the ingest-time image normalization (the DB-bound copy only) — same as the
// of-record targeted runner
const IMG_MD = /!\[[\s\S]*?\]\(assets\/([^)\s]+)\)/g;
const describeAsset = (name: string): string =>
  "[image: " + name.replace(/\.[A-Za-z0-9]+$/, "").replace(/^\d{3,4}-/, "").split("-").filter(Boolean).join(" ") + "]";
const normalizeMd = (value: unknown): unknown =>
  typeof value === "string" ? value.replace(IMG_MD, (_m, name: string) => describeAsset(name)) : value;

const questionsByCourse = new Map<string, SmeQuestion[]>();
for (const course of COURSES) {
  const cBase = join(import.meta.dir, "../../../apps/hub/content", course.slug);
  const cManifest = JSON.parse(readFileSync(join(cBase, "manifest.json"), "utf8")) as {
    generatedUtc: string;
    importSource: { repo: string; ref: string };
  };
  const sets = JSON.parse(readFileSync(join(cBase, "questions.json"), "utf8")) as unknown as ShimSet[];
  const courseQuestions: SmeQuestion[] = [];
  for (const [key, anchor] of Object.entries(course.anchors)) {
    const setSlug = key.replace(/-q\d+$/, "") + "--exam-questions";
    const order = Number(key.split("-q").pop());
    const set = sets.find((s) => String(s.slug ?? "") === setSlug);
    if (!set) throw new Error("set not found: " + setSlug);
    const q = (set.questions ?? []).find((qq) => Number((qq as { order: number }).order) === order);
    if (!q) throw new Error("question not found: " + key);
    const cq = q as {
      totalMarks: number;
      difficulty: string;
      parts: {
        problemMd?: string;
        solutionMd?: string;
        marks: number;
        commandWord?: string;
        choices?: { label: string; textMd?: string; isCorrect: boolean }[] | null;
        markPoints?: { marks: number; textMd?: string }[] | null;
        sourcePaper?: Record<string, unknown> | null;
        specPointCodes?: string[];
      }[];
    };
    const baseRef = `sme-eq-${course.slug}-${key}`;
    const authored = (cq.parts[0]?.specPointCodes ?? []).join(",");
    console.log(`[r1fix] ${baseRef}: authored corpus codes=[${authored}] -> spec ${anchor.specDb} / primary ${anchor.primaryDb}`);

    const parts: SmePart[] = cq.parts.map((p, idx) => {
      if (p.problemMd == null && p.solutionMd == null) throw new Error("part has neither problemMd nor solutionMd");
      let options: { label: string; text: string; isCorrect: boolean }[] | null = null;
      if (p.choices != null && p.choices.length > 0) {
        if (p.choices.length < 2) throw new Error("MCQ part needs >=2 options");
        options = p.choices.map((ch) => ({ label: ch.label, text: ch.textMd ?? "", isCorrect: ch.isCorrect }));
      }
      let markPoints: { marks: number; text: string | null }[] | null = null;
      if (p.markPoints != null && p.markPoints.length > 0) {
        const mpSum = p.markPoints.reduce((a, mp) => a + mp.marks, 0);
        if (p.markPoints.some((mp) => !(mp.marks > 0)) || mpSum !== p.marks) throw new Error("mark points do not sum to part marks");
        markPoints = p.markPoints.map((mp) => ({ marks: mp.marks, text: mp.textMd ?? null }));
      }
      return {
        label: partLabel(idx),
        prompt: normalizeMd(p.problemMd) as string,
        marks: p.marks,
        commandWord: p.commandWord ?? null,
        solutionMd: normalizeMd(p.solutionMd ?? null) as string | null,
        options,
        markPoints,
      };
    });

    const hasSmeDifficulty = cq.difficulty != null && cq.difficulty in DIFFICULTY_TO_INT;
    if (!hasSmeDifficulty && cq.difficulty != null) throw new Error("unknown difficulty word: " + cq.difficulty);
    courseQuestions.push({
      externalRef: baseRef,
      questionType: "STRUCTURED", // the shim's constant — the service's MIXED branch emits the -p1 member for the MCQ
      stem: null,
      marks: cq.totalMarks,
      difficulty: hasSmeDifficulty ? DIFFICULTY_TO_INT[cq.difficulty]! : 3,
      difficultySource: hasSmeDifficulty ? "SME" : "DEFAULT",
      expectedTimeSeconds: Math.max(MIN_TIME_SECONDS, Math.round(cq.totalMarks * SECONDS_PER_MARK)),
      commandWord: cq.parts[0]!.commandWord ?? null,
      primaryTopicCode: anchor.primaryDb,
      secondaryTopicCodes: null,
      specPoints: [{ code: anchor.specDb, role: "PRIMARY", provenance: "AI_VALIDATED" }],
      sourcePaper: (cq.parts[0]!.sourcePaper ?? null) as Record<string, unknown> | null,
      smeSet: set.name ?? null,
      smeDifficulty: cq.difficulty,
      options: null,
      solutionMd: null,
      parts,
    });
  }
  questionsByCourse.set(course.slug, courseQuestions);
}

// one package per course — the source envelope (sourceDocIdOf) is per-course
const packages: SmePackage[] = [];
for (const course of COURSES) {
  const courseQuestions = questionsByCourse.get(course.slug) ?? [];
  const cManifest = JSON.parse(
    readFileSync(join(import.meta.dir, "../../../apps/hub/content", course.slug, "manifest.json"), "utf8"),
  ) as { generatedUtc: string; importSource: { repo: string; ref: string } };
  packages.push({
    packageVersion: "1.0",
    corpusVersion: `syllabai.sme-exam-questions/1.1@${cManifest.importSource.ref.replace(/^main@/, "")}`,
    generatedAt: cManifest.generatedUtc,
    source: `sme-eq-${course.slug}`,
    counts: {
      questions: courseQuestions.length,
      parts: courseQuestions.reduce((n, q) => n + (q.parts?.length ?? 0), 0),
      options: courseQuestions.reduce((n, q) => n + (q.parts ?? []).reduce((m, p) => m + (p.options?.length ?? 0), 0), 0),
      sets: Object.keys(course.anchors).length,
      unmapped: 0,
      badSum: 0,
      dupOrder: 0,
    },
    questions: courseQuestions,
  });
}
for (const p of packages) {
  console.log(`[r1fix] package ${p.source}: ${p.counts.questions} questions, ${p.counts.parts} parts, ${p.counts.options} options`);
}

const zips = packages.map((p) => ({ source: p.source, zip: bundleQuestionsZip(p) }));
for (const z of zips) console.log(`[r1fix] ${z.source}: zip ${z.zip.length} bytes`);

const clock: SubmitClock = { now: () => new Date(), newId: () => crypto.randomUUID() };
const sql = postgres(uri, { ssl: "require", max: 1, prepare: false });
try {
  for (const z of zips) {
    if (mode === "dry-run") {
      const sentinel = new Error("DRY-RUN-ROLLBACK-SENTINEL");
      try {
        await sql.begin(async (tx) => {
          const service = new SmeQuestionIngestService(flattenTxForFrozenServices(tx as never) as never, clock);
          const summary = await service.ingest(z.zip);
          console.log(`[r1fix] ${z.source} dry-run (rolled back): ${JSON.stringify(summary)}`);
          throw sentinel;
        });
        throw new Error("dry-run sentinel did not fire");
      } catch (e) {
        if (e !== sentinel) throw e;
      }
    } else {
      const summary = await sql.begin(async (tx) => {
        const service = new SmeQuestionIngestService(flattenTxForFrozenServices(tx as never) as never, clock);
        return service.ingest(z.zip);
      });
      console.log(`[r1fix] ${z.source} APPLIED: ${JSON.stringify(summary)}`);
    }
  }
  if (mode === "dry-run") console.log("[r1fix] dry-run sentinel(s) fired — zero persistence confirmed");
} finally {
  await sql.end();
}
