/**
 * Course registry + per-course bundle loading (server-only).
 *
 * The Learning Hub is per-course by design (SaveMyExams model, research §4):
 * every route lives under /courses/[course]/… and reads this registry. The
 * demo ships exactly one full content bundle (the 4CH1 pilot, imported by
 * scripts/import_content.py); the other registered courses resolve to honest
 * "import pending" states instead of fabricated content.
 *
 * Provider discipline: the pilot bundle is served through the DemoDataProvider
 * seam (mock/neon/core-api) exactly like the pre-hub surfaces. Registered
 * courses without a local bundle never return invented data.
 */
import "server-only";
import { cache } from "react";
import { z } from "zod";
import {
  ConceptGraph,
  ContentManifest,
  Curriculum,
  ExamQuestionTopic,
  Flashcard,
  RevisionNote,
  SimLearnerState,
} from "@/lib/contracts";
import type {
  ConceptGraph as ConceptGraphT,
  ContentManifest as ContentManifestT,
  Curriculum as CurriculumT,
  ExamQuestionTopic as ExamQuestionTopicT,
  Flashcard as FlashcardT,
  RevisionNote as RevisionNoteT,
  SimLearnerState as SimLearnerStateT,
} from "@/lib/contracts";
import { loadContentJson, hasContentFile } from "@/lib/corpus";
import { boardOf } from "./board";

const CourseRegistry = z.object({
  schema: z.string(),
  note: z.string(),
  courses: z.array(
    z.object({
      slug: z.string(),
      level: z.string(),
      subject: z.string(),
      /** display label incl. course variant ("Maths — Pure 1", "Chemistry (Higher)") */
      label: z.string().optional(),
      code: z.string(),
      status: z.enum(["pilot", "full", "registered"]),
      /** V53 (ADR-030): the core `curriculum_versions.code` the tutor is
       *  scoped by for this course — EXPLICIT hub-maintained data, never
       *  derived (the Edexcel official code `4CH1` and the syllabus-era
       *  code `4CH1-2017` have no derivable rule between them). Absent =
       *  the tutor is not yet available for this course; the /tutor surface
       *  gates honestly instead of falling back to another course's corpus. */
      curriculumCode: z.string().optional(),
      /** T-MIG-135d: the course is cleared for the core identity bridge —
       *  real attempts, Smart Mark and learner-model writes (the pilot
       *  gate's operator-declared DATA form; the chemistry pilot row is
       *  eligible via status:"pilot"). Absent = read-only course. */
      coreBridge: z.boolean().optional(),
      /** CIE-INTEGRATION course-catalog card (A2): the awarding board the
       *  row's surfaces render ("Cambridge International" for the CIE wave).
       *  EXPLICIT hub-maintained data, never derived — same discipline as
       *  curriculumCode. Absent = the pre-CIE Edexcel-only registry
       *  (boardOf() renders "Edexcel"). */
      board: z.string().optional(),
    }),
  ),
});

export interface CourseMeta {
  slug: string;
  level: string;
  subject: string;
  label: string;
  code: string;
  status: "pilot" | "full" | "registered";
  /** V53 (ADR-030): hub-maintained bridge to core's curriculum registry —
   *  absent = tutor honestly gated for this course (no cross-corpus fallback). */
  curriculumCode?: string;
  /** T-MIG-135d: the course is cleared for the core identity bridge (real
   *  attempts, Smart Mark, learner-model writes) — the operator-declared
   *  DATA form of the pilot gate; the chemistry pilot row is eligible via
   *  status:"pilot". Absent = read-only course. */
  coreBridge?: boolean;
  /** CIE-INTEGRATION course-catalog card (A2): awarding board for the row's
   *  surfaces ("Cambridge International" for the CIE wave). Absent = Edexcel. */
  board?: string;
  /** true when a validated content bundle is committed under content/<slug>/ */
  hasBundle: boolean;
}

/**
 * Board label for course-level copy (titles, crumbs, provenance lines).
 * Re-exported from lib/board (client-safe): the add-course CIE-board fix
 * (operator trace 1a1580a42635b8d9) moved the rule where client components
 * can reach it — one source of truth for both planes. G3's board-aware
 * fix: the hardcoded "Edexcel ${level} ${label}" titles were false for
 * CIE rows.
 */
export { boardOf } from "./board";

export interface CourseBundle {
  meta: CourseMeta;
  manifest: ContentManifestT;
  curriculum: CurriculumT;
  conceptGraph: ConceptGraphT;
  notes: RevisionNoteT[];
  questionTopics: ExamQuestionTopicT[];
  /** ADR-037 official past papers, OUT of the exam-questions plane by IA
   *  decision: they serve the Past Papers interactive view only (the
   *  "Interactive" button per paper row), never the topic tree/bank. */
  officialPaperTopics: ExamQuestionTopicT[];
  flashcards: FlashcardT[];
  simLearner: SimLearnerStateT;
}

/**
 * Bundle-offload note (perf band): the fs reads moved behind lib/corpus.ts
 * (fs at build/dev, same-origin static fetch at runtime) — the old
 * `path.join(process.cwd(), "content")` literals are exactly what made the
 * Vercel file tracer copy the ~185MB corpus into every function bundle that
 * reaches this module (~35 functions).
 *
 * The `getDataProvider` import also moved from the module top into the one
 * branch that uses it, as a dynamic import: that branch needs a pilot slug
 * WITHOUT a committed bundle, but pilotCourseSlug() only returns slugs whose
 * bundle exists — so the branch is a near-unreachable last resort, while the
 * static import dragged @/lib/data (→ data/mock.ts → seven compile-baked
 * ~3.4MB of JSON) into every course lambda. Dead import, dropped.
 */

let registryCache: CourseMeta[] | null = null;

export async function listCourses(): Promise<CourseMeta[]> {
  if (registryCache) return registryCache;
  // audit 2026-10-02 P2-3: an unguarded parse here crashed the whole tree
  // (no error boundary at the time). Degrade to an empty registry instead —
  // every consumer renders its honest empty state and the app stays up.
  let raw: unknown;
  try {
    // null (missing registry) → CourseRegistry.parse throws → empty registry
    raw = await loadContentJson("courses.json");
  } catch (err) {
    console.error("[courses] registry unreadable — serving empty registry", err);
    registryCache = [];
    return registryCache;
  }
  const parsed = CourseRegistry.parse(raw);
  registryCache = await Promise.all(
    parsed.courses.map(async (c) => ({
      ...c,
      label: c.label ?? c.subject,
      hasBundle: await hasContentFile(`${c.slug}/manifest.json`),
    })),
  );
  return registryCache;
}

export async function getCourseMeta(slug: string): Promise<CourseMeta | null> {
  const all = await listCourses();
  return all.find((c) => c.slug === slug) ?? null;
}

/** The one slug with a committed official-tree bundle (the 4CH1 pilot). */
export async function pilotCourseSlug(): Promise<string | null> {
  const all = await listCourses();
  return all.find((c) => c.status === "pilot" && c.hasBundle)?.slug ?? null;
}

// ── per-course pin census (provenance honesty, T-DISPLAY-PINCENSUS-1) ────
//
// The bundle plane lawfully carries PER-COURSE pins (each content/<slug>/
// manifest.json names its own importSource.ref — several distinct pins are
// live at any time: consume waves pin their tranche, the pilot rides its
// ADR-037 sync). The homepage footer used to render the PILOT's manifest
// ref as if it were a site-wide pin — a provenance claim the per-course
// pin law does not make. This census computes the real distribution from
// the committed manifests so the footer can state it honestly (computed,
// never hardcoded: it cannot drift into a single-hash global claim).

/** "main@<40hex>" → "main@<10hex>" — display form; the full ref stays in the manifest. */
export function shortPinRef(ref: string): string {
  const at = ref.lastIndexOf("@");
  return at > 0 ? `${ref.slice(0, at)}@${ref.slice(at + 1, at + 11)}` : ref;
}

/** Official pins are "branch@<40hex>"; anything else is a non-pin source
 *  (e.g. the A2 course-catalog skeleton manifests, which point at this repo
 *  by design — teaching content arrives with the sibling CIE wave). */
const PIN_REF_SHAPE = /^[^@]+@[0-9a-f]{40}$/;

export interface BundlePinGroup {
  /** bundled courses riding this source */
  courses: number;
  /** distinct registry boards (boardOf), alphabetical */
  boards: string[];
  /** distinct importSource repos behind this group */
  repos: string[];
  /** full importSource.ref of the group ("main@<40hex>" for official pins) */
  ref: string;
  /** true when ref is a branch@40hex official pin; false = local skeleton */
  isPin: boolean;
}

export interface BundlePinCensus {
  /** registered courses with a committed bundle */
  bundled: number;
  /** bundled courses whose manifest carries no importSource.ref (disclosed, never hidden) */
  unpinned: number;
  /** official pin groups first (busiest, then ref order), local skeletons last */
  groups: BundlePinGroup[];
}

/**
 * Census over the committed bundle plane: one small manifest.json read per
 * bundled course (never the full bundle), grouped by (repo, ref). Cached —
 * manifests are immutable between deploys (ADR-021 discipline), and the
 * corpus loader's own revalidate:300 fetch cache backs the runtime plane.
 */
export const bundlePinCensus = cache(async function bundlePinCensus(): Promise<BundlePinCensus> {
  const all = await listCourses();
  const bundled = all.filter((c) => c.hasBundle);
  const reads = await Promise.all(
    bundled.map(async (c) => ({
      board: boardOf(c),
      m: await loadContentJson<{ importSource?: { ref?: string; repo?: string } }>(
        `${c.slug}/manifest.json`,
      ),
    })),
  );

  const byKey = new Map<string, BundlePinGroup>();
  let unpinned = 0;
  for (const { board, m } of reads) {
    const ref = m?.importSource?.ref ?? "";
    if (!ref) {
      unpinned += 1;
      continue;
    }
    const repo = m?.importSource?.repo ?? "?";
    const key = `${repo}#${ref}`;
    const g = byKey.get(key) ?? {
      courses: 0,
      boards: [],
      repos: [],
      ref,
      isPin: PIN_REF_SHAPE.test(ref),
    };
    if (!g.boards.includes(board)) g.boards.push(board);
    if (!g.repos.includes(repo)) g.repos.push(repo);
    g.courses += 1;
    byKey.set(key, g);
  }

  const groups = [...byKey.values()].map((g) => ({ ...g, boards: [...g.boards].sort() }));
  groups.sort(
    (a, b) =>
      Number(b.isPin) - Number(a.isPin) || b.courses - a.courses || a.ref.localeCompare(b.ref),
  );
  return { bundled: bundled.length, unpinned, groups };
});

/**
 * Load a course bundle. Pilot course → validates every file with the demo
 * contracts. Registered course without a bundle → null (caller renders the
 * honest "import pending" state). Never returns partially-invented content.
 */
const bundleCache = new Map<string, CourseBundle | null>();

export async function getCourseBundle(slug: string): Promise<CourseBundle | null> {
  if (bundleCache.has(slug)) return bundleCache.get(slug)!;
  const meta = await getCourseMeta(slug);
  if (!meta || !meta.hasBundle) {
    bundleCache.set(slug, null);
    return null;
  }

  const read = (f: string) => loadContentJson(`${slug}/${f}`);

  const [manifest, curriculum, conceptGraph, notes, questions, flashcards, learner, officialPapers] =
    await Promise.all([
      read("manifest.json"),
      read("curriculum.json"),
      read("concept-graph.json"),
      read("notes.json"),
      read("questions.json"),
      read("flashcards.json"),
      read("learner-sim.json"),
      // optional plane: courses predating the split have no official-papers.json
      read("official-papers.json"),
    ]);

  if (!manifest || !curriculum || !conceptGraph || !notes || !questions || !flashcards || !learner) {
    // The registry says a bundle exists but one or more files did not
    // resolve (fetch-plane miss). Old behavior: readFile threw and the
    // route errored. Keep the honest failure instead of inventing content.
    bundleCache.set(slug, null);
    return null;
  }

  const result = {
    meta,
    manifest: ContentManifest.parse(manifest) as ContentManifestT,
    curriculum: Curriculum.parse(curriculum) as CurriculumT,
    conceptGraph: ConceptGraph.parse(conceptGraph) as ConceptGraphT,
    notes: z.array(RevisionNote).parse(notes) as RevisionNoteT[],
    questionTopics: z.array(ExamQuestionTopic).parse(questions) as ExamQuestionTopicT[],
    officialPaperTopics: officialPapers
      ? (z.array(ExamQuestionTopic).parse(officialPapers) as ExamQuestionTopicT[])
      : [],
    flashcards: z.array(Flashcard).parse(flashcards) as FlashcardT[],
    simLearner: SimLearnerState.parse(learner) as SimLearnerStateT,
  };
  bundleCache.set(slug, result);
  return result;
}

export function coursePath(meta: CourseMeta, rest = ""): string {
  return `/courses/${meta.slug}${rest}`;
}

// ── hub-level aggregation (sidebar data + derived indexes) ─────────────

export interface HubCourse {
  meta: CourseMeta;
  /** true when the corpus came through the DemoDataProvider seam (ladder modes) */
  viaProvider: boolean;
  /** which navigation tree powers this hub: "official" (parsed Pearson spec) or "sme-native" (corpus tree) */
  treeKind: string;
  index: ReturnType<typeof import("@/lib/spec-tree").buildSpecTreeIndex>;
  counts: Record<string, { notes: number; questions: number; flashcards: number }>;
  hrefs: {
    notes: Record<string, string>;
    questions: Record<string, string>;
    flashcards: Record<string, string>;
  };
  noteSubtopic: Record<string, string | null>;
  /** sub-topic code → question-set slugs anchored there */
  setsBySubtopic: Record<string, string[]>;
  /** sub-topic code → the notes anchored there, corpus order (tree expander) */
  notesBySubtopic: Record<string, { noteId: string; title: string; guidedStudy: boolean }[]>;
  /** sub-topic code → the question sets anchored there, corpus order (tree expander) */
  setListsBySubtopic: Record<string, { slug: string; title: string; count: number }[]>;
  /** sub-topic code → flashcards */
  cardsBySubtopic: Record<string, string[]>;
  notes: RevisionNoteT[];
  questionTopics: ExamQuestionTopicT[];
  /** official past papers — Past Papers interactive view only (never the
   *  exam-questions tree/index/counts; IA decision, user directive) */
  officialPaperTopics: ExamQuestionTopicT[];
  flashcards: FlashcardT[];
  stats: { notes: number; questions: number; questionSets: number; flashcards: number; specPoints: number };
}

/**
 * Everything a Learning Hub surface needs for one course, derived once:
 * the canonical spec tree, per-sub-topic resource counts, and canonical
 * hrefs (sidebar rows deep-link to the right resource). Resolves content
 * through the DemoDataProvider seam for the pilot (ladder: mock → neon →
 * core-api), and through committed bundles for any future course.
 *
 * Request-deduped with React cache(): the course layout AND each page both
 * call this per render — without the dedupe the page re-reads the whole
 * bundle after the layout already did, doubling TTFB and (critically)
 * delaying the page's notFound() until after the shell has flushed, which
 * turned unknown slugs into soft-404s (200 + not-found UI, s133).
 */
export const loadHubCourse = cache(
  async function loadHubCourse(slug: string): Promise<HubCourse | null> {
  const { buildSpecTreeIndex, resourceCounts, subtopicOfNote, subtopicOfQuestionSet, subtopicOfFlashcard } =
    await import("@/lib/spec-tree");

  const meta = await getCourseMeta(slug);
  if (!meta) return null;

  const bundle = await getCourseBundle(slug);
  const pilot = await pilotCourseSlug();
  let notes, questionTopics, flashcards, curriculum, viaProvider = false;
  let officialPaperTopics: ExamQuestionTopicT[] = [];

  if (bundle) {
    ({ notes, questionTopics, flashcards, curriculum, officialPaperTopics } = bundle);
  } else if (slug === pilot) {
    // pilot without a committed bundle → provider seam (neon / core-api ladder);
    // the demo provider corpus rides the official 4CH1 tree. Dynamic import:
    // this branch is a near-unreachable last resort (see module note) and the
    // static edge used to bake the mock corpus into every course lambda.
    const { getDataProvider } = await import("@/lib/data");
    const provider = getDataProvider();
    [notes, questionTopics, flashcards, curriculum] = await Promise.all([
      provider.revisionNotes(),
      provider.examQuestionTopics(),
      provider.flashcards(),
      provider.curriculum(),
    ]);
    viaProvider = true;
  } else {
    // registered course, no bundle yet — honest empty hub
    return {
      meta,
      viaProvider: false,
      treeKind: "sme-native",
      index: emptyIndex(slug, meta.subject),
      counts: {},
      hrefs: { notes: {}, questions: {}, flashcards: {} },
      noteSubtopic: {},
      setsBySubtopic: {},
      notesBySubtopic: {},
      setListsBySubtopic: {},
      cardsBySubtopic: {},
      notes: [],
      questionTopics: [],
      officialPaperTopics: [],
      flashcards: [],
      stats: { notes: 0, questions: 0, questionSets: 0, flashcards: 0, specPoints: 0 },
    };
  }

  const index = buildSpecTreeIndex(curriculum);
  const countsMap = resourceCounts(notes, questionTopics, flashcards, index);
  const counts: HubCourse["counts"] = {};
  for (const [code, v] of countsMap) counts[code] = v;

  const base = `/courses/${slug}`;
  const hrefs: HubCourse["hrefs"] = { notes: {}, questions: {}, flashcards: {} };
  const setsBySubtopic: Record<string, string[]> = {};
  const notesBySubtopic: HubCourse["notesBySubtopic"] = {};
  const setListsBySubtopic: HubCourse["setListsBySubtopic"] = {};
  const cardsBySubtopic: Record<string, string[]> = {};
  const noteSubtopic: Record<string, string | null> = {};

  for (const t of questionTopics) {
    const s = subtopicOfQuestionSet(t, index);
    if (s) {
      // first-write wins: the row's default target is the first set in corpus
      // order (e.g. Multiple-Choice before Structured); the tree expander
      // lists every set anchored to the sub-topic
      hrefs.questions[s] ??= `${base}/exam-questions/${t.slug}`;
      (setsBySubtopic[s] ??= []).push(t.slug);
      (setListsBySubtopic[s] ??= []).push({
        slug: t.slug,
        title: t.setName ?? t.name,
        count: t.questions.length,
      });
    }
  }
  for (const n of notes) {
    const s = subtopicOfNote(n, index);
    noteSubtopic[n.noteId] = s;
    if (s) {
      // first-write wins (corpus order = curated section order); the tree
      // expander lists every note so none is unreachable from navigation
      hrefs.notes[s] ??= `${base}/revision-notes/${n.noteId}`;
      (notesBySubtopic[s] ??= []).push({ noteId: n.noteId, title: n.title, guidedStudy: n.guidedStudy });
      (cardsBySubtopic[s] ??= []);
    }
  }
  for (const f of flashcards) {
    const s = subtopicOfFlashcard(f, notes, index);
    if (s) {
      (cardsBySubtopic[s] ??= []).push(f.id);
      if (!hrefs.flashcards[s]) hrefs.flashcards[s] = `${base}/flashcards/${s}`;
    }
  }

  return {
    meta,
    viaProvider,
    treeKind: viaProvider ? "official" : ((bundle as NonNullable<typeof bundle>).manifest.treeKind ?? "sme-native"),
    index,
    counts,
    hrefs,
    noteSubtopic,
    setsBySubtopic,
    notesBySubtopic,
    setListsBySubtopic,
    cardsBySubtopic,
    notes,
    questionTopics,
    officialPaperTopics,
    flashcards,
    stats: {
      notes: notes.length,
      questions: questionTopics.reduce((a, t) => a + t.questions.length, 0),
      questionSets: questionTopics.length,
      flashcards: flashcards.length,
      specPoints: index.tree.topics.reduce((a, t) => a + t.specPointCount, 0),
    },
  };
  },
);

function emptyIndex(code: string, subject: string) {
  // structural placeholder for courses without a parsed specification yet
  return {
    tree: { subjectCode: code, subjectTitle: subject, topics: [] },
    subtopicOfSpecPoint: new Map<string, string>(),
    topicOfSubtopic: new Map<string, string>(),
    subtopicByCode: new Map(),
    topicByCode: new Map(),
  };
}
