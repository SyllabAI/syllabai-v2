"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/dashboard/kit/page-hero";
import { boardOf, distinctBoards } from "@/lib/board";
import type { CourseMeta } from "@/lib/courses";
import {
  courseLevelAnchor,
  groupDirectory,
} from "@/lib/directory-groups";
import {
  formatCourseStats,
  ZERO_COURSE_COUNTS,
  type CourseCounts,
} from "@/lib/directory-stats";
import { duplicateVariants } from "@/lib/course-variant";
import {
  FAMILY_LABELS,
  getSubjectIdentity,
  subjectFamily,
} from "@/lib/subject-identity";
import { SubjectGlyph } from "@/components/icons/subject-glyph";
import { resourceLabel, useLastOpened } from "@/lib/last-opened";

// The short names people actually type into a courses search — matched
// alongside the registry's board label (boardOf) so "cie" finds the
// Cambridge International lanes without inventing a second board value.
const BOARD_SEARCH_ALIASES: Record<string, string> = {
  "Cambridge International": "cie caie cambridge",
  Edexcel: "pearson edexcel",
};

// fix ③: the "Continue" chip deep-links only to lanes that are plain
// navigable surfaces; the other kinds lead to the course hub.
const DEEP_LINK_RESOURCES = new Set([
  "revision-notes",
  "exam-questions",
  "flashcards",
  "past-papers",
]);

export function CourseDirectory({
  courses,
  archivePapers,
  bundleStats,
  hero,
}: {
  courses: CourseMeta[];
  /** slug -> committed corpus archive paper count (UX review F-01); rows
   *  absent from the map or at 0 simply carry no badge — never a false one */
  archivePapers?: Record<string, number>;
  /** T-HUB-COURSES-PUBLIC-2 (①): slug -> committed bundle counts (notes /
   *  flashcards / questions), read from each manifest at build on this static
   *  page and plumbed like archivePapers. Absent rows simply render no
   *  substance line — the same never-a-false-claim law. */
  bundleStats?: Record<string, CourseCounts>;
  /** T-HUB-COURSES-UI-2: the opening band's server-authored content — the
   *  operator ordered the course page's design language for this page
   *  (trace 1a1bc441088a9629), and that design IS the house's PageHero kit.
   *  The server composes title/description/StatChips/provenance here; this
   *  client component supplies the band's interactive slots (search, board
   *  chips, the Continue pointer) as its children. */
  hero: {
    eyebrow: string;
    title: ReactNode;
    description: ReactNode;
    stats: ReactNode;
    provenance: ReactNode;
  };
}) {
  const [q, setQ] = useState("");
  // Audit #4: the directory rendered no board anywhere and offered no way
  // to filter by one — with two boards in the registry the cards were not
  // tellable apart and a board's lanes were unfindable card-by-card.
  const [board, setBoardState] = useState<string | null>(null);
  // UX review F-05 companion: the course pages' board crumb links to
  // /courses?board=… — land pre-filtered. Applied after mount so the SSR
  // HTML stays the unfiltered directory (no hydration mismatch); chip
  // toggles keep the URL in sync via replaceState (shareable, no history
  // spam). Invalid values are refused — the filter only ever names a real
  // registry board.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const b = params.get("board");
    if (b && boards.some(([name]) => name === b)) setBoardState(b);
    // T-HUB-COURSES-PUBLIC-2 (④): a shared ?q= lands pre-filled, same
    // apply-after-mount law as board= — the SSR HTML stays the unfiltered
    // directory, so hydration never disagrees.
    const nq = params.get("q");
    if (nq) setQ(nq);
    // `boards` derives from the courses prop via useMemo — stable per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setBoard = (b: string | null) => {
    setBoardState(b);
    const url = new URL(window.location.href);
    if (b) url.searchParams.set("board", b);
    else url.searchParams.delete("board");
    window.history.replaceState(null, "", url);
  };
  // T-HUB-COURSES-PUBLIC-2 (④): the search query joins board= in the URL —
  // any filtered view becomes a link you can paste. replaceState per change
  // (same no-history-spam law as the board chips); whitespace-only queries
  // clear the param rather than encoding dead weight.
  const setQuery = (next: string) => {
    setQ(next);
    const url = new URL(window.location.href);
    const trimmed = next.trim();
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };
  // T-HUB-COURSES-PUBLIC-2 (③): back-to-top visibility — one passive scroll
  // listener, mounted with the directory.
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // same subject+code lanes (e.g. Accounting 4AC1 ×2) — show the lane
  // qualifier from the slug so the cards are tellable apart (UX audit P2-7)
  const subtitles = useMemo(() => duplicateVariants(courses), [courses]);

  // distinct registry boards, busiest first — the same derivation the
  // add-course overlay's board step uses (one honest cascade shape)
  const boards = useMemo(() => distinctBoards(courses), [courses]);

  // T-HUB-COURSES-PUBLIC-1 fix ③: the "Continue" pointer is client-only —
  // the account-backed last-opened store reconciles through the app shell,
  // and useSyncExternalStore's server snapshot is null, so the SSR HTML of
  // this (now public, statically prerendered) page stays generic and
  // cache-safe. Registry membership is validated HERE, at read time (the
  // tool-hrefs law — the store never filters): a pointer to a course that
  // left the registry renders nothing.
  const last = useLastOpened();
  const lastEntry = useMemo(() => {
    if (!last) return null;
    const course = courses.find((c) => c.slug === last.slug);
    if (!course) return null;
    const href = DEEP_LINK_RESOURCES.has(last.resource)
      ? `/courses/${course.slug}/${last.resource}`
      : `/courses/${course.slug}`;
    return { course, href, resource: last.resource };
  }, [last, courses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courses.filter((c) => {
      if (board && boardOf(c) !== board) return false;
      if (!needle) return true;
      // run-002: the haystack gains the identity lib's canonical subject
      // and family label — "humanities" finds History/Geography/…, the
      // registry's "Mathematics" spelling is findable as "maths" (and
      // vice versa) because both fold onto the same canonical key.
      const family = subjectFamily(c.subject);
      const alias = BOARD_SEARCH_ALIASES[boardOf(c)] ?? "";
      return (
        c.label.toLowerCase().includes(needle) ||
        c.subject.toLowerCase().includes(needle) ||
        (family && FAMILY_LABELS[family].toLowerCase().includes(needle)) ||
        c.code.toLowerCase().includes(needle) ||
        c.level.toLowerCase().includes(needle) ||
        boardOf(c).toLowerCase().includes(needle) ||
        alias.includes(needle)
      );
    });
  }, [courses, board, q]);

  // T-HUB-COURSES-UI-1 run-002 (stage 2 of the approved redesign): the
  // grouping moved to the pure, unit-pinned law in lib/directory-groups.ts —
  // level sections keep the curriculum ladder (IGCSE → AS → A-Level → IAL,
  // T-HUB-COURSES-PUBLIC-1 fix ④) and each level groups its rows by subject
  // family in the identity lib's order (Sciences → Maths & CS → English →
  // Business & Econ → Humanities — the approved mockup's scan order).
  const groups = useMemo(() => groupDirectory(filtered), [filtered]);

  return (
    <div className="space-y-6">
      {/* T-HUB-COURSES-UI-2: the opening band — the course page's own hero
          recipe (the operator's approved design of record): gradient wash,
          display-weight title, description, honest StatChip row. The kit's
          one-spine law holds: the hero opens the page, nothing below
          competes for the H1, and the interactive furniture (Continue
          pointer, search + board chips, provenance disclosure) rides the
          band's children slot exactly as the course page's action row does. */}
      <PageHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        description={hero.description}
        stats={hero.stats}
      >
        {/* fix ③: the one personal, action-leading element sits above the
            tool row — quiet card, primary link, the resource named. */}
        {lastEntry && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-3.5 py-2.5 text-sm">
            <span className="text-muted-foreground">Continue where you left off:</span>
            <Link
              href={lastEntry.href}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {lastEntry.course.label}
            </Link>
            <span className="text-muted-foreground">
              · {resourceLabel(lastEntry.resource)}
            </span>
          </div>
        )}
        {/* t-ui-polish run-003 — one toolbar row: search beside the board
            chips at sm+ (they wrap as a stack below sm, exactly as before). */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Input
            value={q}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${courses.length} courses by subject, exam code or board…`}
            aria-label="Search courses"
            className="w-full sm:w-80"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by board">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={board === null}
            onClick={() => setBoard(null)}
            className={
              "gap-1.5 " + (board === null ? "border-primary/60 bg-primary/5 font-medium" : "")
            }
          >
            All boards
            <Badge variant="secondary" className="rounded-full px-1.5 tabular-nums">
              {courses.length}
            </Badge>
          </Button>
          {boards.map(([name, count]) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={board === name}
              onClick={() => setBoard(board === name ? null : name)}
              className={
                "gap-1.5 " + (board === name ? "border-primary/60 bg-primary/5 font-medium" : "")
              }
            >
              {name}
              <Badge variant="secondary" className="rounded-full px-1.5 tabular-nums">
                {count}
              </Badge>
            </Button>
          ))}
          </div>
        </div>
        {hero.provenance}
      </PageHero>
      {/* T-HUB-COURSES-PUBLIC-2 (③): the page is 106 cards across up to 4
          levels × 5 families — one quiet anchor row under the toolbar makes
          it navigable without search. Renders only the levels actually
          present, so a board-filtered view never links to a section it
          doesn't have. Anchors land with scroll-mt clearance for the sticky
          header (app-shell keeps the sticky top slot). */}
      {groups.length > 1 && (
        <nav
          aria-label="Jump to a qualification level"
          className="flex flex-wrap gap-2"
        >
          {groups.map(({ level, total }) => (
            <a
              key={level}
              href={`#${courseLevelAnchor(level)}`}
              className="rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              {level}{" "}
              <span className="font-normal">
                · {total} course{total === 1 ? "" : "s"}
              </span>
            </a>
          ))}
        </nav>
      )}
      {groups.map(({ level, total, families }) => (
        <section
          key={level}
          id={courseLevelAnchor(level)}
          aria-label={level}
          className="scroll-mt-20"
        >
          {/* T-HUB-COURSES-UI-2: the course page's section-title recipe
              (text-lg font-bold tracking-tight) replaces the old uppercase
              eyebrow — the level heading now reads like the attached page's
              own section headings, with the honest count riding quieter. */}
          <h2 className="mb-3 text-lg font-bold tracking-tight">
            {level}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {total} course{total === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="space-y-5">
            {families.map(({ family, label, courses: rows }) => (
              <div key={family}>
                {/* run-002: the family scan line — quieter than the level
                    header (text-sm under its text-lg), still a real heading
                    so the section reads as level → family → card. The old
                    uppercase shout is gone with the UI-2 recipe pass. */}
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {label}{" "}
                  <span className="font-normal">
                    · {rows.length} course{rows.length === 1 ? "" : "s"}
                  </span>
                </h3>
                {/* the dashboard subjects grid recipe: gap-4, MG-sized
                    quiet targets (t-ui-polish run-003) — now per family. */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((c) => {
                    // fix ③: two lanes, legible at a glance — committed corpus
                    // cards carry the primary tint; import-pending cards go
                    // dashed on a muted surface and keep a NEUTRAL hover (their
                    // hover used to invite exactly like real cards, then led to
                    // grey tiles). min-h is gone: with 2-line titles the dead
                    // vertical budget was ~35% of every card.
                    const ghost = c.status !== "pilot" && c.status !== "full";
                    // T-HUB-COURSES-PUBLIC-2 (①+②): the card's substance line
                    // inputs — real committed-corpus counts (server-plumbed
                    // manifest counts) + the tutor signal where the registry
                    // genuinely scopes one (curriculumCode, V53/ADR-030).
                    const statsLine = formatCourseStats(
                      bundleStats?.[c.slug] ?? ZERO_COURSE_COUNTS,
                    );
                    const tutorReady = Boolean(c.curriculumCode);
                    // run-002: the card's icon slot is the run-001 identity —
                    // the subject's bespoke glyph on its tile colour pair
                    // (lib/subject-identity.ts, the approved mockup), themed
                    // through the .subject-tile colour template in
                    // globals.css so all four themes and dark mode re-skin
                    // it without per-theme rules. Unmapped subjects (the
                    // build gate makes this a resilience path) render the
                    // muted lucide fallback tile instead.
                    const identity = getSubjectIdentity(c.subject);
                    return (
                      <Link key={c.slug} href={`/courses/${c.slug}`} className="group min-w-0 focus-visible:outline-none">
                        <Card
                          className={
                            ghost
                              ? "h-full border-dashed bg-muted/40 transition-[border-color,box-shadow] group-hover:border-muted-foreground/50 group-focus-visible:border-muted-foreground/50 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                              : c.hasBundle
                                ? "h-full border-primary/30 transition-[border-color,box-shadow] group-hover:border-primary/60 group-hover:shadow-sm group-focus-visible:border-primary/60 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                                : "h-full transition-[border-color,box-shadow] group-hover:border-primary/60 group-hover:shadow-sm group-focus-visible:border-primary/60 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                          }
                        >
                          <CardContent className="flex h-full items-start gap-3.5 p-5">
                            {identity ? (
                              <span
                                aria-hidden
                                className="subject-tile flex size-12 shrink-0 items-center justify-center rounded-xl border"
                                style={
                                  {
                                    "--subj-bg": identity.tile.bg,
                                    "--subj-fg": identity.tile.fg,
                                  } as CSSProperties
                                }
                              >
                                <SubjectGlyph glyph={identity.glyph} className="size-6" />
                              </span>
                            ) : (
                              <span
                                aria-hidden
                                className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground"
                              >
                                <BookOpen className="size-6" />
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              {/* fix ③: the distinguishing tail ("Biology Unit 1" vs
                                  "Unit 2") now wraps to two balanced lines instead
                                  of being truncated away; the color flip on hover
                                  stays a real-corpus signal, ghosts keep foreground. */}
                              <p
                                className={
                                  "line-clamp-2 text-pretty text-sm font-semibold" +
                                  (ghost ? "" : " group-hover:text-primary")
                                }
                              >
                                {c.label}
                              </p>
                              {subtitles.get(c.slug) && (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitles.get(c.slug)}</p>
                              )}
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {/* t-ui-polish run-003 — the board rides the mono meta
                                    line (the MG spec-code recipe); the badges carry
                                    only the honesty signals (archive size, corpus
                                    status), max two, no soup. */}
                                {boardOf(c)} · {c.code ? c.code : <span className="not-italic">code pending</span>}
                              </p>
                              {/* T-HUB-COURSES-PUBLIC-2 (①+②): the substance
                                  line — what is actually inside this course,
                                  led by the tutor signal where true. Zero-sized
                                  parts are omitted and an all-zero lane (the
                                  import-pending ghosts) renders no line at
                                  all; the max-two-badges law is untouched —
                                  this is a line, not a badge soup. */}
                              {(statsLine || tutorReady) && (
                                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                  {tutorReady && (
                                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                                      <Sparkles
                                        className="size-3 text-primary"
                                        aria-hidden
                                      />
                                      Tutor ready
                                    </span>
                                  )}
                                  {statsLine && <span>{statsLine}</span>}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(archivePapers?.[c.slug] ?? 0) > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full tabular-nums"
                                  title="Official question papers + mark schemes, readable on the course page"
                                >
                                  {archivePapers?.[c.slug]} past paper{(archivePapers?.[c.slug] ?? 0) === 1 ? "" : "s"}
                                </Badge>
                              )}
                              {c.status === "pilot" ? (
                                  <Badge className="rounded-full uppercase">pilot corpus · official spec tree</Badge>
                                ) : c.status === "full" ? (
                                  <Badge variant="outline" className="rounded-full uppercase">
                                    full corpus
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="rounded-full uppercase text-muted-foreground"
                                    title="This lane is registered; its full corpus — notes, exam questions, flashcards and the past-paper archive — is queued for import. Nothing is rendered for it yet."
                                  >
                                    import pending
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {filtered.length === 0 && (
        // fix ⑤: the empty state used to be a dead end — the only way out
        // was manually re-editing the search box. One clear action, and the
        // board chip's URL sync runs through the same setBoard() path.
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No {board ? `${board} ` : ""}courses match “{q}”.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              setBoard(null);
            }}
          >
            Clear search &amp; filters
          </Button>
        </div>
      )}
      {/* T-HUB-COURSES-PUBLIC-2 (③): after the jump-nav lands you deep in a
          106-card page, one small fixed action gets you back. Appears only
          past the first screen; smooth scroll honors reduced-motion. */}
      {showTop && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Back to top"
          onClick={() => {
            const reduce = window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
          }}
          className="fixed bottom-5 right-5 z-30 shadow-sm"
        >
          Top ↑
        </Button>
      )}
    </div>
  );
}
