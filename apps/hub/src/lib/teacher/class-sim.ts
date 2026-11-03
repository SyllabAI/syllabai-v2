import type { CourseBundle } from "../courses";
import { buildSpecTreeIndex, generalTopicsOfQuestionTopics, subtopicOfQuestionSet } from "../spec-tree";

/**
 * Class evidence for the teacher lens (TEACHER-2) — the HONEST topology
 * builder (T-AUDIT-TIER1). The deterministic SAMPLE-cohort generation this
 * module used to carry (24 seeded pseudo-students, per-subtopic PRNG mastery
 * draws, fabricated misconception prevalence) is REMOVED with the
 * browser-persistence purge: the teacher lens never again displays invented
 * learner evidence. What remains is everything that was real:
 *
 *   - the spec-tree TOPOLOGY (buildSpecTreeIndex — the identical subtopic
 *     codes, order and general rows the student hub renders, so the teacher
 *     lens and student surfaces can never drift apart);
 *   - the question-bank stats per subtopic (setSlugs / questionCount /
 *     totalMarks — committed corpus counts, nothing inferred);
 *   - the teaching-coverage overlay stays client-side per teacher
 *     (TEACHER_ARCHITECTURE §13.4 — NOT_TAUGHT means "no coverage
 *     recorded", never "weak").
 *
 * Every cohort-evidence field (mastery means, bands, distributions,
 * misconceptions) is the honest NULL now — real class analytics come from
 * the server-backed classes lane (/teacher/classes, T-MIG-112) and the
 * weakness lane's LIVE source; surfaces built on this module render the
 * nulls as "not measured", never a fabricated number.
 */

export type UnderstandingBand = "strong" | "good" | "developing" | "weak" | "critical";

export interface SubtopicMisconception {
  code: string;
  title: string;
  probability: number;
  evidenceCount: number;
}

export interface SubtopicAggregate {
  code: string;
  label: string;
  title: string;
  sectionCode: string;
  sectionTitle: string;
  /** Question-set slugs anchored to this subtopic (Test Builder input). */
  setSlugs: string[];
  /** Mean mastery — null = NOT MEASURED (no cohort evidence exists here). */
  meanMastery: number | null;
  /** Distribution shares — always 0 until real cohort evidence exists. */
  proficientPct: number;
  developingPct: number;
  strugglingPct: number;
  /** Understanding band — null = not measured. */
  band: UnderstandingBand | null;
  /** Always [] — fabricated misconception prevalence is gone for good. */
  misconceptions: SubtopicMisconception[];
  questionCount: number;
  totalMarks: number;
}

export interface ClassSection {
  code: string;
  title: string;
  subtopics: SubtopicAggregate[];
}

export interface ClassOverview {
  course: {
    slug: string;
    label: string;
    subject: string;
    code: string;
    level: string;
    board: string;
    syllabusVersion: string;
  };
  className: string;
  /** 0 — there is no cohort here; real rosters live in the classes lane. */
  students: number;
  sections: ClassSection[];
  /** null = not measured (no cohort evidence). */
  classMean: number | null;
  weakest: { code: string; title: string; meanMastery: number } | null;
}

// ── cohort + aggregation (topology + bank stats ONLY) ─────────────────────

const aggregateCache = new Map<string, ClassOverview>();

export function buildClassOverview(bundle: CourseBundle): ClassOverview {
  const slug = bundle.meta.slug;
  const cached = aggregateCache.get(slug);
  if (cached) return cached;

  const index = buildSpecTreeIndex(bundle.curriculum, {
    // keep teacher placement identical to the student hub (D0 gen rows)
    generalTopics: generalTopicsOfQuestionTopics(bundle.questionTopics),
  });

  // question sets anchored per subtopic code (same mapping the hub uses)
  const setsBySubtopic = new Map<string, string[]>();
  const setBySlug = new Map(bundle.questionTopics.map((t) => [t.slug, t]));
  for (const t of bundle.questionTopics) {
    const code = subtopicOfQuestionSet(t, index);
    if (code) {
      const list = setsBySubtopic.get(code) ?? [];
      list.push(t.slug);
      setsBySubtopic.set(code, list);
    }
  }

  const sections: ClassSection[] = [];

  for (const topic of index.tree.topics) {
    const subtopics: SubtopicAggregate[] = topic.subtopics.map((sub) => {
      const setSlugs = setsBySubtopic.get(sub.code) ?? [];
      const sets = setSlugs.map((s) => setBySlug.get(s)).filter((s) => s !== undefined);
      const questionCount = sets.reduce((a, s) => a + s.questions.length, 0);
      const totalMarks = sets.reduce(
        (a, s) => a + s.questions.reduce((x, q) => x + q.totalMarks, 0),
        0,
      );

      return {
        code: sub.code,
        label: sub.label,
        title: sub.title,
        sectionCode: topic.code,
        sectionTitle: topic.title,
        setSlugs,
        meanMastery: null, // not measured — no cohort evidence exists here
        proficientPct: 0,
        developingPct: 0,
        strugglingPct: 0,
        band: null,
        misconceptions: [],
        questionCount,
        totalMarks,
      };
    });

    if (subtopics.length > 0) {
      sections.push({ code: topic.code, title: topic.title, subtopics });
    }
  }

  const overview: ClassOverview = {
    course: {
      slug,
      label: bundle.meta.label,
      subject: bundle.meta.subject,
      code: bundle.meta.code,
      level: bundle.meta.level,
      board: bundle.curriculum.board,
      syllabusVersion: bundle.curriculum.syllabusVersion,
    },
    className: bundle.meta.label,
    students: 0,
    sections,
    classMean: null,
    weakest: null,
  };
  aggregateCache.set(slug, overview);
  return overview;
}
