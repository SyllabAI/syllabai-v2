import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TINTS, type Tone } from "./tint";

/**
 * FeatureTile — the kit's grouped tile-band atom (dashboard-redesign kit,
 * T-DASH-SKIN-1).
 *
 * The course resources page's tile language — a size-14 tinted icon
 * square beside a semibold title and an honest meta line — as one
 * component, for the dashboard surfaces that group their destinations
 * into bands (class workspace tools, resource groups). The tile's hover
 * is the site's one card hover law (run-001/003/004: border-color +
 * shadow, never a lift).
 *
 * Honest states: a tile WITHOUT an href is a ghost — no link, no pointer,
 * no chevron, a muted availability chip instead (run-013's ghost law: a
 * ghost is not a link — a `href: "#"` tile is forbidden). A tile WITH an
 * href is one whole-card Link — the tile IS the affordance, no inner
 * buttons.
 */
export function FeatureTile({
  icon: Icon,
  tone = "primary",
  title,
  description,
  meta,
  href,
  ghostLabel = "Coming soon",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  description?: string;
  /** The count line under the description — real counts only
   *  ("12 notes · 340 questions"); omit when there is nothing to count. */
  meta?: React.ReactNode;
  /** Destination. Absent = honest ghost tile (no navigation). */
  href?: string;
  /** The ghost chip's copy — an honest unavailability note beats the
   *  default "Coming soon" where the reason is known ("Import pending"). */
  ghostLabel?: string;
  className?: string;
}) {
  const iconSquare = (
    <span
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-xl",
        TINTS[tone].wash,
        TINTS[tone].ink,
      )}
    >
      <Icon className="size-6" aria-hidden />
    </span>
  );
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {meta && <div className="mt-1.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {href ? (
        <ChevronRight
          className="mt-1 size-4 shrink-0 self-center text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      ) : (
        <span className="shrink-0 self-center rounded-full border bg-background px-2 py-0.5 text-2xs font-medium text-muted-foreground">
          {ghostLabel}
        </span>
      )}
    </>
  );
  const shell =
    "group flex items-start gap-3 rounded-2xl border bg-card p-4 transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(shell, "hover:border-primary/60 hover:shadow-sm", className)}
      >
        {iconSquare}
        {body}
      </Link>
    );
  }
  return (
    <div aria-disabled="true" className={cn(shell, "opacity-75", className)}>
      {iconSquare}
      {body}
    </div>
  );
}
