/**
 * Course header blocks — T-HEADER-1 (operator trace 1a1b173567f8eb99,
 * scope "A, full unification"): the ONE course-header module with TWO
 * postures of the same law.
 *
 *   - CourseHeader — the LANDER hero band (course ROOT only). The MathsGenie
 *     course-page anatomy (hub-coursepage-mg-layout, operator request via
 *     chat trace 1a18c3f754d0e421): pastel gradient hero card carrying the
 *     breadcrumb trail, bold qualification title, exam-code pill and
 *     description. Since run T-HEADER-1 it is a thin wrapper over PageHero
 *     (the dashboard kit's generalisation of this very band) — same gradient
 *     (.course-hero-gradient), same padding rhythm, same 3xl/4xl title; the
 *     component was duplicated markup before, now it is one hero everywhere.
 *     The Course Resources / Strengths & Weaknesses tab pair that used to sit
 *     bottom-aligned on the band's edge is GONE (operator request via chat
 *     trace 1a19368d4aa8384d): the course root's body tabs (course-body-tabs)
 *     carry Strengths & Weaknesses as their third pane.
 *
 *   - CoursePageHeader — the TOOL-page header (every course subpage + detail
 *     page): the shared PageHeader block (text-2xl bold — MG's exact tool
 *     title law), same breadcrumb trail, same exam-code pill affordance
 *     (T-COURSE-SPECPILL-1: the pill doubles as the Specification link) in
 *     the actions slot unless the caller brings its own. The fourteen-plus
 *     subpage call sites swapped CourseHeader → CoursePageHeader; the course
 *     ROOT keeps the hero (lander exception — MG's home/resources run big
 *     too; four landers total: course root, dashboard, teacher home,
 *     marketing home which sits outside the fence).
 */
import { Breadcrumbs, ExamCodePill } from "@/components/hub/chrome";
import { PageHeader } from "@/components/layout/page-header";
import { PageHero } from "@/components/dashboard/kit/page-hero";
import { courseCrumbItems } from "@/lib/board";
import type { CourseMeta } from "@/lib/courses";

type CourseHeaderProps = {
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
};

function courseTrail(meta: CourseHeaderProps["meta"], crumb?: string) {
  return <Breadcrumbs items={courseCrumbItems(meta, crumb)} />;
}

function specPill(meta: CourseHeaderProps["meta"]) {
  return <ExamCodePill code={meta.code} href={`/courses/${meta.slug}/specification`} />;
}

/** The course ROOT lander hero — pastel band, 3xl/4xl title. Lander exception. */
export function CourseHeader({ meta, title, description, crumb, children }: CourseHeaderProps) {
  return (
    <PageHero
      breadcrumbs={courseTrail(meta, crumb)}
      title={title}
      description={description}
      actions={specPill(meta)}
    >
      {children}
    </PageHero>
  );
}

/** The course TOOL-page header — bare block, text-2xl title, same trail + pill. */
export function CoursePageHeader({
  meta,
  title,
  description,
  crumb,
  actions,
  children,
}: CourseHeaderProps & {
  /** Overrides the default exam-code pill in the actions slot. */
  actions?: React.ReactNode;
}) {
  return (
    <PageHeader
      breadcrumbs={courseTrail(meta, crumb)}
      title={title}
      description={description}
      actions={actions ?? specPill(meta)}
    >
      {children}
    </PageHeader>
  );
}
