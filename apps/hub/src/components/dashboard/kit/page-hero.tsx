import { cn } from "@/lib/utils";

/**
 * PageHero — the redesign kit's opening band (dashboard-redesign kit,
 * T-DASH-SKIN-1).
 *
 * The course page's hero anatomy (components/hub/course-header.tsx)
 * generalised to the dashboard surfaces: a pastel gradient hero card —
 * the same .course-hero-gradient wash, hub-token hues, dark-mode aware —
 * carrying the page's eyebrow, display-weight title, description, an
 * optional right action slot and an optional StatChip row. One spine per
 * page: the hero opens the page, BandSections carry the rest, and nothing
 * between them competes for the H1. Server component — interactive slots
 * (buttons wired to overlays) are passed in from client callers, exactly
 * like CourseHeader's children slot.
 */
export function PageHero({
  breadcrumbs,
  eyebrow,
  title,
  description,
  actions,
  stats,
  children,
  className,
}: {
  /** Breadcrumb trail above the title (T-HEADER-1: the course lander's
   *  board → level → course trail rides the same hero as everything else —
   *  one header component, two postures: hero band here for LANDERS, the
   *  bare PageHeader block everywhere else). */
  breadcrumbs?: React.ReactNode;
  /** Small-caps context line above the title ("Teacher workspace"). */
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned slot on the title row — buttons / overlays. */
  actions?: React.ReactNode;
  /** StatChip row under the description. Counts are content: pass real
   *  numbers or omit the prop entirely — an absent count is honest, a
   *  placeholder is decoration. */
  stats?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border bg-card shadow-sm",
        className,
      )}
    >
      {/* the course hero's pastel wash — one gradient, every surface */}
      <div aria-hidden className="course-hero-gradient absolute inset-0 -z-10" />
      <div className="space-y-3 p-5 sm:p-6">
        {breadcrumbs}
        {eyebrow && (
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {title}
          </h1>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
        {description && (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {description}
          </p>
        )}
        {stats && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">{stats}</div>
        )}
        {children}
      </div>
    </header>
  );
}
