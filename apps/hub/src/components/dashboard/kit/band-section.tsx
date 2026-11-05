import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BandSection — the kit's ONE section chassis (dashboard-redesign kit,
 * T-DASH-SKIN-1).
 *
 * One spine per page: the PageHero opens, bands carry the rest. Every
 * band is the same header row — tinted glyph, semibold title, honest
 * count, one action — over its content grid; the section heading is the
 * landmark, so callers stop hand-rolling "flex items-center justify-
 * between" headers that drift (the My subjects / My classes pair already
 * drifted once). Counts are content: the count prop is the band's honest
 * summary line ("· 4", "· 2 live · 1 this browser", a loading line) or
 * omitted entirely when there is genuinely nothing to count.
 *
 * Server-safe: the action slot (e.g. an overlay-opening Button) is passed
 * in from the caller, client or server alike.
 */
export function BandSection({
  icon: Icon,
  title,
  count,
  action,
  children,
  className,
}: {
  /** Tinted at text-primary like the Jump back in / Study plan headers. */
  icon?: LucideIcon;
  title: string;
  /** The band's honest summary — rendered INSIDE the h2 at text-sm
   *  weight-normal muted, the dashboard's existing count idiom. */
  count?: React.ReactNode;
  /** Right side of the header row — usually one outline Button. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {Icon && <Icon className="size-4 text-primary" aria-hidden />}
          {title}
          {count !== undefined && count !== null && (
            <span className="text-sm font-normal text-muted-foreground">{count}</span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
