/**
 * CD-A-hub (trace 1a18c3130e0a29f5): the test-builder weak-area lane's pure
 * mapping layer — the hub consumption of the law-pinned class-evidence view
 * the CD-A adapter wake-up put on GET /api/v1/teacher/tests/weakness-options
 * (policy "test-builder-weakness/v1").
 *
 * Two sources, ONE honest lane:
 *   live   — WeaknessOptionsView (server class evidence). Server ORDER is
 *            law (meanMastery asc, nulls last → active-misconception
 *            learners desc → code); this layer NEVER re-sorts. meanMastery
 *            null means unmeasured and stays null (the honesty law of the
 *            wire — no client-side fabrication of a number). Reasons are
 *            the three frozen literals; no client-side re-derivation.
 *   sample — the demo-era derivation over the committed course bundle's
 *            SAMPLE cohort (class-sim), moved here VERBATIM from the
 *            client (band weak/critical → LOW_MEAN_MASTERY; misconception
 *            probability >= 0.3 → ACTIVE_MISCONCEPTION_PRESENT; sort by
 *            meanMastery asc). It stays as the labeled fallback for
 *            courses where the live view is unresolvable or unavailable —
 *            never silently mixed with live rows.
 *
 * slug→rootId resolution (the CD-A disclosure gap): the ONLY bridge of
 * record is the hub course registry's explicit `curriculumCode`
 * (courses.json, V53/ADR-030 law: hub-maintained, never derived) matched
 * against SubjectView.curriculumVersion.code on the wire. knowledgeNodeId
 * nullable on the wire (capture-unproven) → null resolves to "unresolvable"
 * and the lane falls back — fail-closed, never guessed, never fuzzy-matched.
 */

import type { ClassOverview } from "./class-sim";
import type { SubjectView, WeaknessOptionsView } from "@/lib/types";

/** The three frozen reason literals (frozen TestBuilderService.java:212-218,
 *  enforced by weakTopicOptionSchema's enum) with their teacher-facing
 *  labels. The demo-era client map carried only the first two — the third
 *  exists on the wire and now has a label of record. */
export const WEAKNESS_REASON_LABELS: Record<string, string> = {
  LOW_MEAN_MASTERY: "low class mastery",
  ACTIVE_MISCONCEPTION_PRESENT: "active misconceptions",
  BLOCKED_BY_WEAK_PREREQUISITE: "blocked by weak prerequisite",
};

/** One selectable weak-area row, source-tagged. `key` doubles as the row
 *  identity and the selection token (sample: the bundle subtopic code the
 *  hub assembler consumes; live: the knowledge topicNodeId the server
 *  preview consumes — the two vocabularies never mix because a lane renders
 *  exactly one source at a time). */
export interface WeakLaneTarget {
  key: string;
  code: string;
  title: string;
  reasons: string[];
  /** live: null = unmeasured (honest); sample: always a number. */
  meanMastery: number | null;
  /** live only (wire masteryBand, nullable); sample null. */
  masteryBand: string | null;
  /** live: learners with an active misconception on the topic;
   *  sample: the SAMPLE misconception inventory size (different semantic —
   *  the unit is carried so the UI never calls inventory "learners"). */
  misconceptionCount: number;
  misconceptionUnit: "learners" | "tracked";
  /** live: servableQuestions (validated, assembly-eligible);
   *  sample: validated question count in the bundle. */
  questionCount: number;
  /** live only: prerequisite codes blocking the topic (evidence for
   *  BLOCKED_BY_WEAK_PREREQUISITE); sample []. */
  blockedBy: string[];
}

/** An unmeasured topic with servable content — an honest coverage gap,
 *  never claimed weak, never selectable. */
export interface WeakLaneGap {
  key: string;
  code: string;
  title: string;
  questionCount: number;
}

export interface WeakLaneLive {
  source: "live";
  targets: WeakLaneTarget[];
  gaps: WeakLaneGap[];
  enrolledLearners: number;
  learnersWithEvidence: number;
  rootId: string;
}

/**
 * The slug→rootId bridge of record. Returns the ONE distinct non-null
 * knowledgeNodeId among subjects whose curriculum version code equals the
 * registry row's explicit `curriculumCode`; null (fail-closed) when the
 * course carries no curriculumCode, no subject matches, every match has a
 * null knowledgeNodeId, or matches disagree on the node id (ambiguity is
 * never resolved by guessing — first-match-wins would silently pick a
 * subject).
 */
export function resolveRootIdForCourse(
  curriculumCode: string | undefined,
  subjects: SubjectView[],
): string | null {
  if (!curriculumCode) return null;
  const ids = new Set<string>();
  for (const s of subjects) {
    if (s.curriculumVersion?.code !== curriculumCode) continue;
    if (s.knowledgeNodeId) ids.add(s.knowledgeNodeId);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * The live lane: WeaknessOptionsView → rows. SERVER ORDER PRESERVED — the
 * view's weakTopics are already ordered by the frozen comparator; sorting
 * here would duplicate (and eventually diverge from) the law. Coverage gaps
 * are returned separately — they render as informational rows and are never
 * selectable.
 */
export function liveWeakLane(view: WeaknessOptionsView): WeakLaneLive {
  return {
    source: "live",
    targets: view.weakTopics.map((t) => ({
      key: t.topicNodeId,
      code: t.code,
      title: t.title,
      reasons: t.reasons,
      meanMastery: t.meanMastery,
      masteryBand: t.masteryBand,
      misconceptionCount: t.learnersWithActiveMisconception,
      misconceptionUnit: "learners",
      questionCount: t.servableQuestions,
      blockedBy: t.blockedByPrerequisiteCodes,
    })),
    gaps: view.coverageGaps.map((g) => ({
      key: g.topicNodeId,
      code: g.code,
      title: g.title,
      questionCount: g.servableQuestions,
    })),
    enrolledLearners: view.enrolledLearners,
    learnersWithEvidence: view.learnersWithEvidence,
    rootId: view.rootId,
  };
}

/**
 * The SAMPLE lane — the demo-era client derivation moved VERBATIM from
 * test-builder-client.tsx (the CD-A disclosure's "demo-era client-side
 * SAMPLE thresholds"). Thresholds are the demo's, not the wire's: band
 * weak/critical → LOW_MEAN_MASTERY, misconception probability >= 0.3 →
 * ACTIVE_MISCONCEPTION_PRESENT, ordered by meanMastery ascending. The UI
 * must label this source as demo data — it is cohort simulation, not class
 * evidence.
 */
export function sampleWeakTargets(cls: ClassOverview): WeakLaneTarget[] {
  const out: WeakLaneTarget[] = [];
  for (const section of cls.sections) {
    for (const sub of section.subtopics) {
      const reasons: string[] = [];
      if (sub.band === "weak" || sub.band === "critical") reasons.push("LOW_MEAN_MASTERY");
      if (sub.misconceptions.some((m) => m.probability >= 0.3))
        reasons.push("ACTIVE_MISCONCEPTION_PRESENT");
      if (reasons.length > 0) {
        out.push({
          key: sub.code,
          code: sub.code,
          title: sub.title,
          reasons,
          meanMastery: sub.meanMastery,
          masteryBand: null,
          misconceptionCount: sub.misconceptions.length,
          misconceptionUnit: "tracked",
          questionCount: sub.questionCount,
          blockedBy: [],
        });
      }
    }
  }
  return out.sort((a, b) => (a.meanMastery ?? 0) - (b.meanMastery ?? 0));
}
