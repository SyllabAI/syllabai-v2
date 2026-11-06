import Link from "next/link";
import { cn } from "@/lib/utils";
import { pathActive } from "@/components/layout/side-nav";
import type { CourseStripItem } from "@/lib/course-nav";

/**
 * CourseToolNav — the course tool strip (T-NAV-STRIP-1): MathsGenie's
 * navigation tab, transcribed from the live site (course-tool-nav
 * investigation, 2026-11-06 — MG renders this bar on every course-scoped
 * tool page, GCSE Maths 16 items / A-Level Maths 11, data-driven per
 * course).
 *
 * Shape of record (MG byte-recipe + house tokens):
 *   - a full-width bar with the `border-b-2` rule under the course chrome;
 *   - items are REAL <Link>s (SSR-able, prefetchable, bookmarkable) — no
 *     client tab state anywhere: the route IS the active tab, exactly MG's
 *     model (`aria-current="page"` + accent underline; the underline overlaps
 *     the bar's own rule via -mb-[2px], MG's -mb-[2px] verbatim);
 *   - `whitespace-nowrap` + horizontal scroll (MG's `overflow-x-clip` bar;
 *     the house scrollbar-none affordance — one scroller, all breakpoints);
 *   - the site's focus-visible ring law on every item (the resource-Link
 *     recipe course-body-tabs run-004 pinned).
 *
 * Deliberate deltas vs MG (spec notes of record): the strip never renders on
 * the course root (the CourseBodyTabs trio is the root nav — MG parity: their
 * root carries no strip either), on viewer/document-focus routes (s146 chrome
 * stand-down, the full-height player), and its items never include ghost
 * rows or tree facets. The active law: the course-root item pills on an
 * EXACT match only (pathActive's prefix match would pin it on every course
 * route); every other item rides pathActive — the SAME helper the sidebar
 * rows use, so the two views can never disagree about what is active.
 *
 * Run-002 (operator feedback 2026-11-06, "it makes the website look too
 * noisy"): re-read of the 2026-11-06 captures — MG has NO persistent
 * sidebar at all; the strip IS their nav, on a single-column page, and it
 * shows only on a subset of tool pages (question bank, papers, lessons,
 * revision guides — 12 site-wide items), never on the course root, index,
 * home, marker or progress pages. Our desktop already has the persistent
 * sidebar (lg+), so a second full nav above the hero reads as duplication.
 * The strip therefore rides BELOW lg only — exactly the range where the
 * sidebar stands down behind the Menu bar and the page is single-column,
 * i.e. the range this MG transcription was always for. Override escape
 * hatch: tailwind-merge lets a caller pass lg:block to restore desktop.
 */
export function CourseToolNav({
  items,
  pathname,
  className,
}: {
  items: CourseStripItem[];
  pathname: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Course tools"
      className={cn("border-b-2 bg-background lg:hidden", className)}
    >
      <div className="scrollbar-none flex min-w-0 items-center overflow-x-auto px-3 sm:px-4">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-[2px] flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 pb-2 pt-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
