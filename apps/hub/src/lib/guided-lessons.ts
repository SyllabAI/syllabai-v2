/**
 * Guided-lessons seam (server-only) — the read side of the SME guided-lesson
 * integration (adapter guided-lesson-0.1--hub-lesson-import-1.0).
 *
 * WHERE THE DATA COMES FROM: the integration channel promoted 112
 * hub-lesson-import + 112 sme-question-package artifacts from the frozen
 * authoring corpus (INT-0 pin 4d85c47…, promotion commit 2c765006…,
 * SyllabAI/syllabai-resources integration/) and the import runner
 * (scripts/import_guided/run_import.mjs, hub-import-runner/1.0) landed them
 * byte-exact into content/igcse-chemistry-19/guided-lessons,
 * guided-questions and the guided-import.json discovery index
 * (guided-import-index/1.0). 224/224 sha256-verified; closing identity
 * 112 notes / 239 lessons / 1,195 checks re-derived from disk at import.
 *
 * LOADER DISCIPLINE: everything rides the existing corpus loader
 * (lib/corpus.ts loadContentJson) — fs plane at build/dev, CDN fetch plane
 * (/corpus/*) on Vercel lambdas — with zero loader changes, exactly as the
 * import receipt's static-build pickup gate verified.
 *
 * FAIL-CLOSED LAW: courses without a guided-import.json get `null` (the
 * note reader renders no guided banner); a noteId absent from the index
 * yields `null` (no partial rendering). Nothing here ever synthesises
 * content — the artifacts are the only source.
 */
import "server-only";
import { loadContentJson, hasContentFile } from "@/lib/corpus";

/** One per-note row of guided-import.json (guided-import-index/1.0). */
export interface GuidedImportEntry {
  noteId: string;
  wave: number;
  /** Bundle-relative path, e.g. "igcse-chemistry-19/guided-lessons/rn_X.hub-lesson-import.json". */
  lessonPath: string;
  packagePath: string;
  lessonSha256: string;
  packageSha256: string;
  streamSha256: string;
  streamChars: number;
}

/** guided-import.json top level (runner-owned discovery index). */
export interface GuidedImportIndex {
  format: string;
  runner: string;
  imported_at_utc: string;
  upstream: {
    repo: string;
    namespace: string;
    commit: string;
    manifest: string;
    manifest_sha256: string;
    manifest_version: number;
    int0_pin: string;
  };
  counts: {
    notes: number;
    lessons: number;
    checks: number;
    keyPoints: number;
    distractors: number;
    glossaryTerms: number;
    authored_chars_conserved: number;
    /** Figures census (figures-0.2 generation, additive). */
    figures?: number;
    figures_module_mapped?: number;
    figures_note_level?: number;
  };
  landing: {
    lessons_rel: string;
    questions_rel: string;
    lesson_files: number;
    question_files: number;
    byte_exact: boolean;
    additive_only: boolean;
  };
  notes: GuidedImportEntry[];
}

/** hub/lesson-import/1.0 — one guided lesson set for one revision note. */
export interface GuidedLessonImport {
  format: string;
  adapter: string;
  source: {
    sourceFormat: string;
    noteId: string;
    corpusVersion: string;
    sourceLayerSha256: string;
    pinnedRef: string;
  };
  lesson: {
    id: string;
    topicTitle: string;
    subtopicTitle: string;
    sourceUrl: string;
    specAnchors: { code: string; text: string }[];
    primer: { text: string; prerequisiteSubtopic: string | null };
    modules: GuidedModule[];
    /** Figures layer (hub/lesson-import/1.1, additive): the parent revision note's own
     *  diagrams, mapped deterministically upstream; absent in the 1.0 generation. */
    figures?: GuidedFigure[];
    assets: {
      glossary: { term: string; definition: string; firstLesson: number }[];
      workedExample?: {
        prompt: string;
        steps: string[];
        finalAnswer: string;
      };
    };
  };
}

/** One guided module (rn_X::L<i>) of a hub-lesson-import artifact. */
export interface GuidedModule {
  id: string;
  title: string;
  sourceHeadings: string[];
  specRefs: string[];
  opening: string;
  keyPoints: string[];
  depthLayers: {
    low: GuidedDepthLayer;
    medium: GuidedDepthLayer;
  };
  gatePolicy: {
    ratingsScale: string[];
    continueDisabledUntilChoice: boolean;
    resumeWithoutReRate: boolean;
    postCheckRecalibration: boolean;
  };
  checkRefs: string[];
  /** Figures layer (additive): ids of this module's claimed figures; resolves in
   *  lesson.figures (closure import-gated both ways). */
  figureIds?: string[];
}

export interface GuidedDepthLayer {
  restatement: string;
  analogy: string;
  examPointer: string;
}

/** NOTE: the resolver helpers (figuresForModule / noteLevelFigures) live in
 *  lib/guided-figures.ts — client-safe, no server-only import.

/** One figure of the figures layer (hub/lesson-import/1.1): the parent revision
 *  note's own asset (sourcing decision of record — zero new hosting), with the
 *  nearest preceding note heading as provenance and the claiming lessons as
 *  L-ordinals (empty = note-level figure, page-fallback only). */
export interface GuidedFigure {
  id: string;
  url: string;
  alt: string;
  sourceHeading: string;
  /** figures-2.1 captions layer (hub/lesson-import/1.2): the parent note's own
   *  explanatory line, coalesced at the 0.3 source generation; absent where the
   *  source has none (renderer falls back to the provenance line only). */
  caption?: string;
  /** figures-2.2 binding layer (hub/lesson-import/1.3): the rule of record that
   *  produced this figure's claims — heading-unique | sole-lesson |
   *  content-overlap | note-level | unresolved (fail-closed keeps). */
  binding?: string;
  moduleIds: string[];
}


/** sme-question-package/1.0 — the checks that back a lesson's checkRefs. */
export interface GuidedQuestionPackage {
  format: string;
  adapter: string;
  packageId: string;
  subject: string;
  questions: GuidedQuestion[];
}

export interface GuidedQuestion {
  id: string;
  moduleId: string;
  stem: string;
  misconceptionClass: string;
  options: {
    key: string;
    text: string;
    correct: boolean;
    explanation: string;
    misconception: string | null;
  }[];
}

/** The discovery index for a course, or null when the course has none. */
export async function loadGuidedIndex(course: string): Promise<GuidedImportIndex | null> {
  const rel = `${course}/guided-import.json`;
  if (!(await hasContentFile(rel))) return null;
  return loadContentJson<GuidedImportIndex>(rel);
}

/** The index row for one note, or null when the note has no guided lesson. */
export function findGuidedEntry(
  index: GuidedImportIndex | null,
  noteId: string,
): GuidedImportEntry | null {
  return index?.notes.find((n) => n.noteId === noteId) ?? null;
}

/** The hub-lesson-import artifact for an index row (fail-closed on null). */
export function loadGuidedLesson(
  entry: GuidedImportEntry,
): Promise<GuidedLessonImport | null> {
  return loadContentJson<GuidedLessonImport>(entry.lessonPath);
}

/** The sme-question-package artifact for an index row (fail-closed on null). */
export function loadGuidedPackage(
  entry: GuidedImportEntry,
): Promise<GuidedQuestionPackage | null> {
  return loadContentJson<GuidedQuestionPackage>(entry.packagePath);
}
