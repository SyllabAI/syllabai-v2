/**
 * Figures-layer helpers (client-safe) — the read side of the
 * hub/lesson-import/1.1 figures generation (adapter
 * guided-lesson-0.2--hub-lesson-import-1.1). Split from guided-lessons.ts so
 * client components can resolve figures without dragging the server-only
 * content seam into the bundle; the types ride type-only imports (erased at
 * compile time). Fail-closed law: an undeclared figureId resolves to nothing.
 */
import type { GuidedFigure, GuidedLessonImport } from `@/lib/guided-lessons`;

/** The figures a module claims (module.figureIds resolved against lesson.figures;
 *  closure is import-gated both ways upstream). */
export function figuresForModule(
  lesson: GuidedLessonImport,
  moduleOrdinal: number,
): GuidedFigure[] {
  const figures = lesson.lesson.figures;
  const ids = lesson.lesson.modules[moduleOrdinal]?.figureIds;
  if (!figures || !ids || ids.length === 0) return [];
  const byId = new Map(figures.map((f) => [f.id, f]));
  return ids
    .map((id) => byId.get(id))
    .filter((f): f is GuidedFigure => f !== undefined);
}

/** Note-level figures (moduleIds []) — readable in the read-as-a-page fallback
 *  and on the note page itself (via bodyMd), never inside the lesson flow. */
export function noteLevelFigures(lesson: GuidedLessonImport): GuidedFigure[] {
  return (lesson.lesson.figures ?? []).filter((f) => f.moduleIds.length === 0);
}
