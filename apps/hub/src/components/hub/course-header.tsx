/**
 * Course header block — the course hero band.
 *
 * Restyled to the MathsGenie course-page anatomy (hub-coursepage-mg-layout,
 * operator request via chat trace 1a18c3f754d0e421): a pastel gradient hero
 * card carrying the breadcrumb trail, bold qualification title, exam-code
 * pill and description. The band's gradient lives in globals.css
 * (.course-hero-gradient) — hub token hues, dark-mode aware.
 *
 * The Course Resources / Strengths & Weaknesses tab pair that used to sit
 * bottom-aligned on the band's edge is GONE (operator request via chat
 * trace 1a19368d4aa8384d): the course root's body tabs (course-body-tabs)
 * now carry Strengths & Weaknesses as their third pane, so the hero was
 * running two navigation systems for the same content. The showTabs and
 * activeTab props left with the pair — the fourteen subpage call sites
 * (exam-questions, past-papers, revision-notes, …) already rendered the
 * hero bare, and the strengths route page keeps its hero without the pair
 * too. Every other part of the SME anatomy survives: breadcrumbs, H1,
 * exam-code pill, description, children slot (the root page's
 * "Edexcel | IGCSE | 4CH1" line + course switcher).
 */
import { Breadcrumbs, ExamCodePill } from "@/components/hub/chrome";
import { courseCrumbItems } from "@/lib/board";
import type { CourseMeta } from "@/lib/courses";

export function CourseHeader({
  meta,
  title,
  description,
  crumb,
  children,
}: {
  meta: Pick<CourseMeta, "level" | "subject" | "label" | "code" | "slug" | "board">;
  title: string;
  description?: string;
  /** Final breadcrumb label — the current page's name for subpages (e.g.
   *  "Revision Notes"). Omitted on the course root, where the course itself
   *  is the current crumb. The full trail is composed by
   *  courseCrumbItems (lib/board): board → level → course, board crumb
   *  linking to the directory's board-filtered view (UX review F-05 — the
   *  old trail put the board last as the "current page" and linked the
   *  middle crumb to the page's own URL). */
  crumb?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative isolate overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* MG pastel wash — hub-token gradient, see globals.css */}
      <div aria-hidden className="course-hero-gradient absolute inset-0 -z-10" />
      <div className="space-y-3 p-5 sm:p-6">
        <Breadcrumbs items={courseCrumbItems(meta, crumb)} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {title}
          </h1>
          <ExamCodePill code={meta.code} />
        </div>
        {description && (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {description}
          </p>
        )}
        {children}
      </div>
    </header>
  );
}
