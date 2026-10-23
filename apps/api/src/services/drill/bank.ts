/**
 * F-182 build — the drill bank of record: the served course bundle
 * (apps/hub/content/<course>/questions.json + curriculum.json) as an
 * injectable port.
 *
 * Law of the substrate (inherited verbatim from the F-182 opening,
 * docs/F182-DRILL-SURFACE-PLAN.md §2): the bundle of record is the SERVED
 * content plane — the same bytes the census-of-record artifact is pinned to
 * by apps/api/test/drill/draw.test.ts (the anti-drift pin). The draw endpoint
 * serves from THIS bank so a draw can never disagree with the census.
 *
 * The port seam: routes and tests program against `DrillBank`; production
 * composition (`bundleBank`) loads the bundle lazily once per isolate via the
 * census-script relative-path law and fail-closes on anything outside the
 * censused-course registry (the anchor law: the surface ships ONLY where
 * spec-tagging exists — an uncensused course is not a smaller bank, it is no
 * bank at all).
 *
 * Answer-facts discipline: the content views handed to the wire strip
 * `isCorrect` from choices (the client never sees an answer before the
 * attempt); the bank retains a private grading lookup (`isCorrectChoice`)
 * the evidence seam uses server-side. `solutionMd` never enters a draw view —
 * it rides the evidence response only (the instant post-attempt reveal).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectParts,
  computeCensus,
  DRILLABLE_FLOOR,
  planeOf,
  type AddressRow,
  type BundleQuestion,
  type BundleSet,
  type CurriculumNode,
  type DrillPart,
} from "./census";
import { poolsByCode } from "./draw";

/** The censused courses of record. Fail-closed registry — extend ONLY with a course that carries its own census-of-record pin. */
export const DRILL_COURSE_REGISTRY = ["igcse-chemistry-19"] as const;
export type DrillCourse = (typeof DRILL_COURSE_REGISTRY)[number];

export class UnknownCourseError extends Error {
  constructor(course: string) {
    super(`drill course ${course} is not served — the surface ships only where a census of record exists`);
    this.name = "UnknownCourseError";
  }
}

/** Part content as the client may see it (never carries isCorrect/solutionMd). */
export interface DrillPartContent {
  readonly problemMd: string;
  readonly questionType: string | null;
  readonly commandWord: string | null;
  readonly choices: readonly { label: string; textMd: string }[] | null;
}

/** One MS point OF RECORD — verbatim from the bundle's markPoints (F-183 L3). */
export interface DrillMarkSchemePoint {
  readonly ref: string;
  readonly textMd: string;
  readonly marks: number;
}

/**
 * The MS of record for one part (F-183): the served bundle's per-part
 * `markPoints` + `answerStatus`, verbatim. marksTotal is DERIVED (sum of the
 * point marks) and the bank refuses to serve a part whose point marks do not
 * sum to the part's marks — the examiner's arithmetic is not negotiable.
 */
export interface DrillBankMarkScheme {
  readonly answerStatus: string;
  readonly points: readonly DrillMarkSchemePoint[];
  readonly marksTotal: number;
}

export interface DrillBank {
  readonly course: string;
  readonly parts: readonly DrillPart[];
  /** Census of record rows (all spine addresses; the route filters to drillable). */
  readonly addressRows: readonly AddressRow[];
  readonly censusSummary: {
    readonly specPointAddresses: number;
    readonly covered: number;
    readonly drillable: number;
    readonly thin: number;
    readonly uncovered: number;
  };
  /** The pool at one address (multi-code parts ride several pools). */
  poolOf(code: string): readonly DrillPart[];
  contentOf(partId: string): DrillPartContent | null;
  /** Marks of one part (the evidence seam's marksPossible). */
  marksOf(partId: string): number | null;
  /** SERVER-ONLY grading lookup: is `label` the correct choice of `partId`? Null when the part/label is unknown or the part is not MCQ. */
  isCorrectChoice(partId: string, label: string): boolean | null;
  /** The instant post-attempt reveal (the F-183 lane formalizes the law). */
  solutionOf(partId: string): string | null;
  /**
   * F-183 — the MS of record for one part, verbatim from the corpus
   * (markPoints + answerStatus). Null when the part carries no linked MS of
   * record (law L6: honest null, never paraphrased into a fake MS).
   */
  markSchemeOf(partId: string): DrillBankMarkScheme | null;
}

interface BankEntry {
  bank: DrillBank;
}

/** The served part shape with the content fields the census module does not read. */
interface RichBundlePart {
  id: string;
  marks: number;
  problemMd?: string;
  solutionMd?: string | null;
  questionType?: string | null;
  commandWord?: string | null;
  choices?: { label: string; textMd: string; isCorrect?: boolean }[] | null;
  /** F-183: the MS of record (the wave-20 solution-enrichment wave; answerStatus "linked"). */
  markPoints?: { id: string; marks: number; textMd: string }[] | null;
  answerStatus?: string | null;
}

const banks = new Map<string, BankEntry>();

/** The census-script relative-path law, from src/services/drill up to apps/. */
function hubContentDir(): string {
  return join(import.meta.dir, "../../../../hub/content");
}

export function bundleBank(course: string): DrillBank {
  const cached = banks.get(course);
  if (cached) return cached.bank;

  if (!(DRILL_COURSE_REGISTRY as readonly string[]).includes(course)) {
    throw new UnknownCourseError(course);
  }
  const hub = hubContentDir();
  const sets = JSON.parse(readFileSync(join(hub, course, "questions.json"), "utf8")) as BundleSet[];
  const curriculum = JSON.parse(readFileSync(join(hub, course, "curriculum.json"), "utf8")) as {
    nodes: CurriculumNode[];
  };

  const source = `apps/hub/content/${course}/questions.json`;
  const parts = collectParts(sets);
  const census = computeCensus(course, source, sets, curriculum.nodes);

  // Content + grading maps keyed by part id (one pass over the bundle).
  const contentById = new Map<string, DrillPartContent>();
  const correctLabelByPart = new Map<string, string>();
  const marksByPart = new Map<string, number>();
  const solutionByPart = new Map<string, string>();
  const msByPart = new Map<string, DrillBankMarkScheme>();
  for (const set of sets) {
    for (const question of set.questions as BundleQuestion[]) {
      for (const raw of question.parts) {
        const part = raw as RichBundlePart;
        const codes = (raw as { specPointCodes?: string[] | null }).specPointCodes ?? [];
        if (codes.length === 0) continue;
        if (typeof part.problemMd !== "string") {
          throw new Error(`drill bank ${course}: part ${part.id} carries no problemMd — refusing to serve unreadable content`);
        }
        contentById.set(part.id, {
          problemMd: part.problemMd,
          questionType: part.questionType ?? null,
          commandWord: part.commandWord ?? null,
          choices: part.choices
            ? part.choices.map((ch) => ({ label: ch.label, textMd: ch.textMd }))
            : null,
        });
        marksByPart.set(part.id, part.marks);
        if (typeof part.solutionMd === "string") {
          solutionByPart.set(part.id, part.solutionMd);
        }
        if (Array.isArray(part.markPoints) && part.markPoints.length > 0) {
          // F-183 fail-closed arithmetic law: the examiner's points must sum
          // to the part's marks — a bank that served a disagreeing MS would
          // be inventing a second truth (the real-bundle baseline is 2535
          // linked parts, 0 mismatches — the pin lives in bank.test.ts).
          const marksTotal = part.markPoints.reduce((sum, mp) => sum + mp.marks, 0);
          if (marksTotal !== part.marks) {
            throw new Error(
              `drill bank ${course}: part ${part.id} markPoints sum ${marksTotal} != part marks ${part.marks} — refusing to serve a disagreeing MS of record`,
            );
          }
          msByPart.set(part.id, {
            answerStatus: part.answerStatus ?? "unknown",
            points: part.markPoints.map((mp) => ({ ref: mp.id, textMd: mp.textMd, marks: mp.marks })),
            marksTotal,
          });
        }
        if (part.choices) {
          const correct = part.choices.find((ch) => ch.isCorrect === true);
          if (correct) correctLabelByPart.set(part.id, correct.label);
        }
      }
    }
  }

  const pools = poolsByCode(parts);
  const bank: DrillBank = {
    course,
    parts,
    addressRows: census.addresses,
    censusSummary: census.coverage,
    poolOf: (code) => pools.get(code) ?? [],
    contentOf: (partId) => contentById.get(partId) ?? null,
    marksOf: (partId) => marksByPart.get(partId) ?? null,
    isCorrectChoice: (partId, label) => {
      const correct = correctLabelByPart.get(partId);
      if (correct === undefined) return null; // not MCQ or no flagged choice — never invent
      return correct === label;
    },
    solutionOf: (partId) => solutionByPart.get(partId) ?? null,
    markSchemeOf: (partId) => msByPart.get(partId) ?? null,
  };
  banks.set(course, { bank });
  return bank;
}

export { DRILLABLE_FLOOR, planeOf };
