import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * EntityTileCard — the kit's card-entity chassis (dashboard-redesign kit,
 * T-DASH-SKIN-1).
 *
 * SubjectCard (student dashboard) and ClassCard / CoreClassCard (teacher
 * dashboard) are one anatomy wearing different data: eyebrow, name link,
 * code line, per-resource rows, footer link — plus the top-right remove
 * affordance and the card-entity hover law (border-primary/30 → 60).
 * This chassis is that shared shell; the variants keep their data hooks
 * and rows, the chassis owns the frame so the two dashboards can never
 * drift apart again. Server-safe: interactive slots (remove button,
 * exam-series picker, provenance badge) are passed in by the caller.
 */
export function EntityTileCard({
  eyebrow,
  badge,
  name,
  nameHref,
  codeLine,
  footerLink,
  footerSlot,
  topRightSlot,
  children,
  className,
  muted = false,
}: {
  /** Small-caps context line ("Edexcel · IGCSE", "7 subjects"). */
  eyebrow?: React.ReactNode;
  /** Right-aligned pill on the eyebrow row — ProvenanceBadge, "Last
   *  viewed", the exam-series chip. One slot, caller's choice. */
  badge?: React.ReactNode;
  /** The entity's name — one whole-link affordance when nameHref is set. */
  name: React.ReactNode;
  nameHref?: string;
  /** The spec-code line ("4CH1", "code pending"). */
  codeLine?: React.ReactNode;
  /** Footer's primary link, chevron included ("Open class workspace"). */
  footerLink?: { href: string; label: string };
  /** Footer's secondary slot ("Edit subjects"). */
  footerSlot?: React.ReactNode;
  /** Absolute top-right slot — the remove X. When present, the card
   *  reserves pr-11 exactly like SubjectCard/ClassCard do today. */
  topRightSlot?: React.ReactNode;
  /** Body rows — per-resource / per-subject lists, pickers, notes. */
  children?: React.ReactNode;
  /** Archived / disabled dimming (CoreClassCard's archived state). */
  muted?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "relative h-full border-primary/30 transition-[border-color,box-shadow] hover:border-primary/60 hover:shadow-sm",
        muted && "opacity-70",
        className,
      )}
    >
      {topRightSlot}
      <CardContent
        className={cn("flex h-full flex-col gap-1", topRightSlot ? "p-4 pr-11" : "p-4")}
      >
        {(eyebrow || badge) && (
          <div className="flex items-center justify-between gap-2">
            {eyebrow ? (
              // V-3 (visual audit 2026-11-13): the eyebrow chip ("Mixed boards
              // · 2 subjects") clipped with no recovery — the native title is
              // the hover floor. Kept single-line: this shared kit card's
              // eyebrow row is meta, not content, and the tile rhythm depends
              // on it staying one line.
              <p
                className="min-w-0 truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
                title={typeof eyebrow === "string" ? eyebrow : undefined}
              >
                {eyebrow}
              </p>
            ) : (
              <span />
            )}
            {badge}
          </div>
        )}
        {nameHref ? (
          <Link href={nameHref} className="group mt-1 w-fit min-w-0">
            <span className="block truncate text-base font-bold group-hover:text-primary">
              {name}
            </span>
          </Link>
        ) : (
          <span className="mt-1 block truncate text-base font-bold">{name}</span>
        )}
        {codeLine && <p className="font-mono text-xs text-muted-foreground">{codeLine}</p>}
        {children}
        {(footerLink || footerSlot) && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            {footerLink ? (
              <Link
                href={footerLink.href}
                className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {footerLink.label}
                <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            ) : (
              <span />
            )}
            {footerSlot}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
