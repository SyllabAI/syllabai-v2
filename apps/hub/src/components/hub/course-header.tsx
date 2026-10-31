/**
 * Course header block — the course hero band.
 *
 * Restyled to the MathsGenie course-page anatomy (hub-coursepage-mg-layout,
 * operator request via chat trace 1a18c3f754d0e421): a pastel gradient hero
 * card carrying the breadcrumb trail, bold qualification title, exam-code
 * pill and description. The band's gradient lives in globals.css
 * (.course-hero-gradient) — hub token hues, dark-mode aware.
 *
 * The hero's bottom-aligned Course Resources / Strengths & Weaknesses tab
 * pair is GONE (operator request, chat trace 1a192c8ad6b77ad9): course-root
 * navigation is consolidated into the body tab trio on the page below the
 * hero (course-body-tabs — Topics | Resources | Strengths & Weaknesses),
 * and the course sidebar (course-shell) still links Strengths & Weaknesses.
 * The showTabs/activeTab props died with the pair — their only call sites
 * were the course root and the strengths page. The rest of the prop API is
 * UNCHANGED from the SME-anatomy version: every subpage (exam-questions,
 * past-papers, revision-notes, …) keeps its call site and inherits the hero
 * without per-page edits. What was here before is all still here —
 * breadcrumbs, H1, exam-code pill, description, children slot (the root
 * page's "Edexcel | IGCSE | 4CH1" line + course switcher) — only the tab
 * pair left.
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
