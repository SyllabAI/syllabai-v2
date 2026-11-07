import { cn } from "@/lib/utils";

/**
 * PageHeader — the TOOL-page header law (T-HEADER-1, operator trace
 * 1a1b173567f8eb99 "A, full unification").
 *
 * Before this component the app spoke two header languages: the pastel hero
 * band (CourseHeader/PageHero — course pages, dashboard, teacher home) and a
 * zoo of bare per-page h1s (six-plus treatments: course detail pages at two
 * different sm: scales, learner tools at xl/2xl bold, teacher inner pages in
 * the font-display family at 2xl/3xl, the courses index at 3xl). The audit of
 * record (trace 1a1b16dba1e17571) pinned the drift; the MG captures
 * (tool-results/mg-rd) pinned the target: EVERY MathsGenie tool page —
 * course, lessons, papers, questions, revision guides — runs the SAME
 * text-2xl bold title, and only landers run bigger.
 *
 * THE LAW (one scale, one family, one rhythm):
 *   - tool/detail pages: THIS component — bare block, h1 at text-2xl bold
 *     tracking-tight, optional breadcrumb trail above, optional eyebrow,
 *     optional actions slot on the title row, optional muted description.
 *   - LANDER pages ONLY (course root, dashboard, teacher home): the hero band
 *     (PageHero — same gradient card as ever). MG's home/resources run big
 *     too; four surfaces, no more.
 *   - workspace-chrome headings (tutor chat, plan wizard, graph surfaces,
 *     source reader) are panel titles inside full-height tools, exempt the
 *     way MG's essay marker has no page title.
 *
 * Server component; interactive slots (buttons wired to overlays) are passed
 * in from client callers, exactly like PageHero's actions.
 */
export function PageHeader({
  breadcrumbs,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  /** Breadcrumb trail above the title (hub chrome's Breadcrumbs). */
  breadcrumbs?: React.ReactNode;
  /** Small-caps context line ("Teacher workspace") or a badge row — the
   *  hero's eyebrow. Node, not string: teacher pages ride badge pairs here
   *  (T-HEADER-1); bring your own styling. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned slot on the title row — pills, buttons, overlays. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("space-y-2", className)}>
      {breadcrumbs}
      {eyebrow && <div>{eyebrow}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-tight">
          {title}
        </h1>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </header>
  );
}
