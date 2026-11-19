/**
 * T-TUTOR-AIM-P3 run-003 (DC10 §7.9) — the exam-calendar plane: the
 * learner's DECLARED sitting date rides prompt assembly so the calendar
 * weights (a) answer emphasis (the v20 EXAM CALENDAR law + the EXAM
 * CONTEXT block) and (b) the §7.8 pendingReview loop's spacing (the drill
 * directive's planned count tightens near the sitting).
 *
 * THE SOURCE OF RECORD: the learner's own exam-target rows (the frozen
 * ExamTargetReader seam, services/learner-model/exam-target-reader.ts —
 * learner_course_enrolments ∩ exam_series, the countdown DERIVED on that
 * read per ADR-031, whole calendar days). An empty target list is the
 * honest "no series declared" state — no invented date ever renders, and
 * an ask whose scoped course carries no declared target renders NOTHING
 * (the empty-context byte-stability law, test-pinned).
 *
 * THE SLUG↔CODE BRIDGE: the ask's courseRef is the CURRICULUM CODE
 * ("4CH1-2017" — the hub sends its registry's curriculumCode, V53), while
 * the exam-target rows key on the COURSE SLUG ("igcse-chemistry-19"). The
 * mapping of record is the SERVED registry (apps/hub/content/courses.json
 * — the hub's own picker data, census-pinned content plane; "no derivable
 * rule between them", EXPLICIT hub-maintained data). The loader reads it
 * through the SAME served-content-plane seam the drill bank uses
 * (services/drill/bank.ts hubContentDir) — never a duplicate mapping —
 * lazily once per isolate, and degrades HONESTLY: a missing file, a
 * missing field or an unknown code yields null and the ask carries no
 * exam context (degrade-never-block, the DC10 §8 posture).
 *
 * THE URGENCY BANDS (fixed at build time, the §12 open-question-4
 * precedent — retention's 180 days fixed the same way): IN_WINDOW = the
 * sitting window is open now (daysToWindowStart <= 0 and
 * daysToWindowEnd >= 0); NEAR = the window opens within EXAM_NEAR_DAYS
 * (21) calendar days; FAR = beyond. A window that has ENDED
 * (daysToWindowEnd < 0) weighs NOTHING: examContextBriefOf returns null
 * — a passed sitting is not calendar pressure.
 *
 * ZERO new LLM calls, ZERO migration, ZERO wire change: the exam context
 * is prompt-side scaffolding computed from reads the pipeline now holds.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { CourseExamTargetView } from "@syllabai/contracts";

/** NEAR band's outer bound, in whole calendar days to the window start. */
export const EXAM_NEAR_DAYS = 21;

/** The §7.9 spacing arm: the drill directive's planned count multiplies by
 *  this at NEAR/IN_WINDOW (the tonight-loop tightens near the sitting). The
 *  CLAIM's actual scheduled count stays the F-182/F-185 draw law's own —
 *  the run-001 chip law already governs plan-vs-actual (the chip flips to
 *  the claimed copy from the response's ACTUAL count). */
export const EXAM_DRILL_SPACING_MULTIPLIER = 2;

export type ExamUrgency = "IN_WINDOW" | "NEAR" | "FAR";

/** The urgency band of record, or null when the calendar weighs nothing
 *  (the window has ended). Pure, unit-pinned. */
export function examUrgencyOf(
  daysToWindowStart: number,
  daysToWindowEnd: number,
): ExamUrgency | null {
  if (daysToWindowEnd < 0) return null;
  if (daysToWindowStart <= 0) return "IN_WINDOW";
  if (daysToWindowStart <= EXAM_NEAR_DAYS) return "NEAR";
  return "FAR";
}

/** The prompt-side exam brief (§13.2 metadata only: dates, the series
 *  code/label, the band — never learner free text, §11). Null when no
 *  target matches or the window has ended — NOTHING renders. */
export interface ExamContextBrief {
  courseSlug: string;
  seriesCode: string;
  seriesLabel: string;
  windowStart: string;
  windowEnd: string;
  daysToWindowStart: number;
  daysToWindowEnd: number;
  urgency: ExamUrgency;
}

export function examContextBriefOf(
  target: CourseExamTargetView | null | undefined,
): ExamContextBrief | null {
  if (target == null) return null;
  const urgency = examUrgencyOf(target.daysToWindowStart, target.daysToWindowEnd);
  if (urgency == null) return null;
  return {
    courseSlug: target.courseSlug,
    seriesCode: target.seriesCode,
    seriesLabel: target.label,
    windowStart: target.windowStart,
    windowEnd: target.windowEnd,
    daysToWindowStart: target.daysToWindowStart,
    daysToWindowEnd: target.daysToWindowEnd,
    urgency,
  };
}

/** The pure target match: the ask's curriculum code → the registry slug →
 *  the learner's declared target for THAT course. Null on every miss (no
 *  scope, no mapping, no target) — the honest empty. */
export function matchExamTarget(
  targets: ReadonlyArray<CourseExamTargetView>,
  codeToSlug: (code: string) => string | null,
  curriculumCode: string | null,
): CourseExamTargetView | null {
  if (curriculumCode == null || curriculumCode.trim() === "") return null;
  const slug = codeToSlug(curriculumCode.trim());
  if (slug == null) return null;
  return targets.find((t) => t.courseSlug === slug) ?? null;
}

// ── the served registry bridge (the slug↔code map of record) ───────────────

/** The census-script relative-path law, from src/services/tutor up to apps/ —
 *  the same served-content-plane seam the drill bank uses. */
function hubContentDir(): string {
  return join(import.meta.dir, "../../../../hub/content");
}

interface RegistryRow {
  slug?: string;
  curriculumCode?: string;
}

/** Pure map builder over the registry rows — unit-pinned with synthetic
 *  rows; rows without BOTH fields contribute nothing. A code claimed by
 *  MORE THAN ONE course is AMBIGUOUS and maps to null (the V53 posture
 *  verbatim — "zero or ambiguous matches refuse": the real registry
 *  carries such collisions, e.g. the 9701-2025-2027 AS/A-level pair, and
 *  binding one course's sitting to a sibling course's ask would be a
 *  guessed exam date — never lawful). */
export function buildCourseSlugMap(
  rows: ReadonlyArray<RegistryRow>,
): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const r of rows) {
    if (!(r?.slug && r?.curriculumCode)) continue;
    const prev = m.get(r.curriculumCode);
    if (prev === undefined) m.set(r.curriculumCode, r.slug);
    else if (prev !== null && prev !== r.slug) m.set(r.curriculumCode, null);
  }
  return m;
}

let registryCache: Map<string, string | null> | null = null;

/** Lazy once-per-isolate read of the served registry (the bundleBank cache
 *  law). A missing/undecodable file yields the EMPTY map — every lookup
 *  then misses and the ask carries no exam context (degrade-never-block). */
export function courseSlugMap(): Map<string, string | null> {
  if (registryCache != null) return registryCache;
  registryCache = new Map<string, string | null>();
  try {
    const path = join(hubContentDir(), "courses.json");
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        courses?: RegistryRow[];
      };
      registryCache = buildCourseSlugMap(parsed.courses ?? []);
    }
  } catch {
    // the registry plane is unreadable on this deployment — the honest
    // empty map; exam awareness degrades, the ask is never blocked
    registryCache = new Map<string, string | null>();
  }
  return registryCache;
}

/** The production `courseSlugOf` dep — the ask's curriculum code → the
 *  course slug of the served registry, or null. */
export function buildCourseSlugOf(): (code: string) => string | null {
  return (code: string) => courseSlugMap().get(code) ?? null;
}

/** The seed for a test-injectable bridge over SYNTHETIC rows (the real
 *  registry's cache is per-isolate; tests that need their own map use
 *  buildCourseSlugMap directly). */
export function courseSlugOfMap(
  m: ReadonlyMap<string, string | null>,
): (code: string) => string | null {
  return (code: string) => m.get(code) ?? null;
}
