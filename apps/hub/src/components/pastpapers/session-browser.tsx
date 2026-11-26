"use client";

/**
 * SessionBrowser (t-pastpapers-ux-1) — the findability shell for the
 * past-papers archive (2026-11-26 live UX review, U1: a 398-paper archive
 * with no search, no jump-nav and no collapse rendered as a 26k-px scroll
 * wall). Client-side only, zero data-model change:
 *
 *   - one filter input (multi-term: "nov 2024 /12" narrows like it reads)
 *     with a DESIGNED empty state — closes the v3 audit's I9 (a filter must
 *     never dead-end into an undesigned blank);
 *   - a sticky jump-chip bar (one chip per session; a chip expands its
 *     group if collapsed and smooth-scrolls to it; the bar hides while
 *     filtering — the filter result replaces navigation). It sticks under
 *     the global header (56px) + the mobile Menu bar (48px, lg:hidden);
 *   - collapsible session groups: the two newest sessions start open,
 *     Expand/Collapse all sit on the filter row.
 *
 * Deliberately NO pagination: the archive stays one page so browser
 * find-in-page keeps working whole-corpus — collapsed groups are
 * display:none (the `hidden` attribute, not unmounting), the filter is the
 * designed answer for exact lookup, and Expand-all restores the full scan.
 *
 * Rows arrive from the page as JSON-safe data (the row JSX lives HERE,
 * moved verbatim from the page, so the server payload stays plain strings);
 * CorpusPdfLink / PaperMarksRollup / InteractiveChip keep their exact
 * client contracts (intent-prefetch, honest-absent ledger badge, roadmap
 * popover). Touch pass (U3): row CTAs 36px below sm / 28px at sm+; hover
 * pass (U2): the filled QP chip darkens one step (the shared secondary
 * variant's hover:bg-secondary/80 measures byte-identical to rest).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Puzzle,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CorpusPdfLink } from "@/components/pastpapers/corpus-pdf-link";
import { InteractiveChip } from "@/components/pastpapers/interactive-chip";
import { PaperMarksRollup } from "@/components/pastpapers/paper-marks-rollup";
import { fmtCount } from "@/lib/format";

/** One paper row, pre-serialized by the page — every field JSON-safe. */
export type SessionBrowserRow = {
  /** corpus dir — the stable React key and viewer route segment */
  dir: string;
  /** official reference, e.g. "0620/11" */
  ref: string;
  /** human title, e.g. "Paper 1: Multiple Choice (Core)" */
  title: string;
  /** the composed meta line: specTitle · official duration · QP/MS sizes */
  meta: string;
  specBadge: string | null;
  variantChip: string | null;
  /** the parsed corpus attests this paper (drives the playable badge) */
  playable: boolean;
  /** award-ledger identity; null → the honest-absent badge renders nothing */
  marks: { paperCode: string; sessionLabel: string } | null;
  qp: { href: string; pdfUrl: string } | null;
  ms: { href: string; pdfUrl: string } | null;
  split: string | null;
  mock: string | null;
  interactive: {
    href: string | null;
    coverageLabel: string | null;
    coverageTitle: string | null;
  } | null;
};

export type SessionBrowserGroup = {
  sessionId: string;
  label: string;
  rows: SessionBrowserRow[];
};

/** the sticky chip bar clears the global header (56px) + the mobile
 *  Menu bar (48px, lg:hidden — course-shell's sticky top-14 lg:hidden). */
const CHIPBAR_TOP = "top-[104px] lg:top-14";
/** sections smooth-scrolling from a chip must clear both bars + the chip bar */
const SECTION_SCROLL_MT = "scroll-mt-[152px] lg:scroll-mt-[104px]";

export function SessionBrowser({
  groups,
  interactiveCount,
}: {
  groups: SessionBrowserGroup[];
  interactiveCount: number;
}) {
  const [query, setQuery] = useState("");
  // the two newest sessions start open (the review's default posture)
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(groups.slice(0, 2).map((g) => g.sessionId)),
  );

  const terms = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );
  const filtering = terms.length > 0;

  const view = useMemo(() => {
    if (!filtering) {
      return groups.map((g) => ({ group: g, rows: g.rows, filtered: false as const }));
    }
    return groups
      .map((g) => ({
        group: g,
        rows: g.rows.filter((r) =>
          terms.every((t) =>
            `${r.ref} ${r.title} ${r.meta} ${r.specBadge ?? ""} ${r.variantChip ?? ""} ${g.label}`
              .toLowerCase()
              .includes(t),
          ),
        ),
        filtered: true as const,
      }))
      .filter((v) => v.rows.length > 0);
  }, [groups, terms, filtering]);

  const matchCount = view.reduce((n, v) => n + v.rows.length, 0);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jump = (id: string) => {
    setOpen((prev) => new Set(prev).add(id));
    requestAnimationFrame(() => {
      document
        .getElementById(`session-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="space-y-4">
      {/* filter row — the search input + Expand/Collapse all */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by paper code or session — try 0620/12 or nov 2023"
            aria-label="Filter past papers by code or session"
            className="h-9 pl-8 pr-8"
          />
          {query !== "" && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 size-7 rounded-full p-0 text-muted-foreground"
              aria-label="Clear the filter"
              onClick={() => setQuery("")}
            >
              <X className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        {!filtering && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1 px-2 text-xs"
              onClick={() => setOpen(new Set(groups.map((g) => g.sessionId)))}
            >
              <ChevronsUpDown className="size-3.5" aria-hidden />
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1 px-2 text-xs"
              onClick={() => setOpen(new Set())}
            >
              <ChevronsDownUp className="size-3.5" aria-hidden />
              Collapse all
            </Button>
          </>
        )}
      </div>

      {/* sticky session jump-chip bar — one chip per session; hidden while
          filtering (the filter result replaces navigation) */}
      {!filtering && (
        <nav
          aria-label="Jump to a session"
          className={`sticky z-20 flex gap-1 overflow-x-auto overscroll-contain rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur [touch-action:pan-x] ${CHIPBAR_TOP}`}
        >
          {groups.map((g) => (
            <Button
              key={g.sessionId}
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground"
              aria-label={`Jump to ${g.label}, ${fmtCount(g.rows.length)} papers`}
              onClick={() => jump(g.sessionId)}
            >
              {g.label}
              <span className="text-2xs tabular-nums text-muted-foreground/70">
                {fmtCount(g.rows.length)}
              </span>
            </Button>
          ))}
        </nav>
      )}

      {view.map(({ group, rows, filtered }) => {
        const expanded = filtered || open.has(group.sessionId);
        return (
          <section
            key={group.sessionId}
            id={`session-${group.sessionId}`}
            aria-label={group.label}
            className={`space-y-2 ${SECTION_SCROLL_MT}`}
          >
            {filtered ? (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {fmtCount(rows.length)} of {fmtCount(group.rows.length)}
                </span>
              </h2>
            ) : (
              <h2>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                  aria-expanded={expanded}
                  aria-controls={`rows-${group.sessionId}`}
                  onClick={() => toggle(group.sessionId)}
                >
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{group.label}</span>
                  <span className="font-normal normal-case">
                    {" "}
                    · {fmtCount(group.rows.length)}
                  </span>
                </button>
              </h2>
            )}
            {/* hidden, NOT unmounted — find-in-page must scan the whole
                archive even while groups are collapsed (the no-pagination
                law); the filter is the designed exact-lookup answer */}
            <ul
              id={`rows-${group.sessionId}`}
              hidden={!expanded}
              className="overflow-hidden rounded-xl border"
            >
              {rows.map((r) => (
                <PaperRow key={r.dir} r={r} interactiveCount={interactiveCount} />
              ))}
            </ul>
          </section>
        );
      })}

      {/* the designed empty state (closes v3 I9) — a filter that matches
          nothing explains itself and offers the way out */}
      {filtering && matchCount === 0 && (
        <div className="rounded-xl border border-dashed">
          <div className="flex flex-col items-start gap-3 p-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ScrollText className="size-4 text-primary" aria-hidden />
              No papers match &ldquo;{query}&rdquo;.
            </p>
            <p className="text-sm text-muted-foreground">
              Try a paper code like <span className="font-mono">0620/12</span>, a session like{" "}
              <span className="font-mono">nov 2023</span>, or words from the paper&apos;s title —
              every space-separated hint must match.
            </p>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setQuery("")}>
              Clear the filter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One archive row — moved verbatim from the page (the MG paper-row
 * signature and its law comments ride along). Touch pass: every row CTA
 * is 36px below sm, 28px at sm+ where a mouse cursor replaces the thumb.
 */
function PaperRow({
  r,
  interactiveCount,
}: {
  r: SessionBrowserRow;
  interactiveCount: number;
}) {
  return (
    <li className="border-b last:border-b-0 transition-colors hover:bg-muted/50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1 basis-52">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold">{r.ref}</span>
            {/* T-MG-FEEDBACK-1: the learner's AI-mark rollup for
                this paper, from the award ledger (absent unless
                the paper is ingested AND carries marks). */}
            {r.marks && (
              <PaperMarksRollup paperCode={r.marks.paperCode} sessionLabel={r.marks.sessionLabel} />
            )}
            <span className="text-xs text-muted-foreground">{r.title}</span>
            {r.specBadge && (
              <Badge variant="outline" className="text-2xs text-muted-foreground">
                {r.specBadge}
              </Badge>
            )}
            {r.variantChip && (
              <Badge variant="outline" className="text-2xs">
                {r.variantChip}
              </Badge>
            )}
            {r.playable && (
              <Badge
                variant="outline"
                // t-ui-polish run-007: the playable badge speaks the
                // house primary-tinted voice (border-primary/60).
                className="gap-1 border-primary/60 text-2xs text-primary"
              >
                <Puzzle className="size-3" aria-hidden />
                playable
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">{r.meta}</p>
        </div>
        {/* t-ui-polish run-002 — the MG paper-row signature:
            the resource chips line up into COLUMNS (QP/MS at a
            fixed width, right-aligned, never wrapping at sm+)
            so a session reads as a table without being one.
            Below sm the chips wrap as before. t-pastpapers-ux-1:
            row CTAs 36px below sm (U3 touch pass). */}
        <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap sm:justify-end">
          {r.qp ? (
            <CorpusPdfLink
              size="sm"
              variant="secondary"
              className="h-9 text-xs hover:brightness-95 sm:h-7 sm:w-32 sm:justify-center"
              href={r.qp.href}
              pdfUrl={r.qp.pdfUrl}
            >
              <FileText className="size-3.5" aria-hidden />
              Question Paper
            </CorpusPdfLink>
          ) : (
            <span
              className="inline-flex h-9 items-center rounded-md px-2 text-xs text-muted-foreground/50 sm:h-7 sm:w-32 sm:justify-center"
              title="No question paper held for this paper"
            >
              Question Paper
            </span>
          )}
          {r.ms ? (
            <CorpusPdfLink
              size="sm"
              variant="outline"
              className="h-9 text-xs sm:h-7 sm:w-32 sm:justify-center"
              href={r.ms.href}
              pdfUrl={r.ms.pdfUrl}
            >
              Mark Scheme
            </CorpusPdfLink>
          ) : (
            <span
              className="inline-flex h-9 items-center rounded-md px-2 text-xs text-muted-foreground/50 sm:h-7 sm:w-32 sm:justify-center"
              title="No mark scheme held for this paper"
            >
              Mark Scheme
            </span>
          )}
          {r.split && (
            <CorpusPdfLink
              size="sm"
              variant="outline"
              className="h-9 text-xs sm:h-7"
              href={r.split}
              pdfUrl={r.qp?.pdfUrl ?? ""}
              aria-label={`${r.ref} — split view (question paper and mark scheme)`}
            >
              Split
            </CorpusPdfLink>
          )}
          {r.mock && (
            <Button asChild size="sm" variant="outline" className="h-9 gap-1 text-xs sm:h-7">
              <Link href={r.mock} aria-label={`${r.ref} — start timed mock`}>
                Mock
              </Link>
            </Button>
          )}
          {r.interactive && (
            <InteractiveChip
              href={r.interactive.href}
              paperRef={r.ref}
              interactiveCount={interactiveCount}
              coverageLabel={r.interactive.coverageLabel}
              coverageTitle={r.interactive.coverageTitle}
            />
          )}
        </div>
      </div>
    </li>
  );
}
