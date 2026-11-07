"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Briefcase,
  Cpu,
  FlaskConical,
  Globe2,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { boardOf, distinctBoards } from "@/lib/board";
import type { CourseMeta } from "@/lib/courses";
import { duplicateVariants } from "@/lib/course-variant";
import { resourceLabel, useLastOpened } from "@/lib/last-opened";

// The short names people actually type into a courses search — matched
// alongside the registry's board label (boardOf) so "cie" finds the
// Cambridge International lanes without inventing a second board value.
const BOARD_SEARCH_ALIASES: Record<string, string> = {
  "Cambridge International": "cie caie cambridge",
  Edexcel: "pearson edexcel",
};

// T-HUB-COURSES-PUBLIC-1 fix ④: the directory grouped by size (b.length),
// which happened to put IGCSE first — a coincidence of the registry, not a
// law. The order is now the curriculum's own ladder: IGCSE (14–16) → AS →
// A-Level → IAL (16–18), unknown levels trail by size. Deterministic.
const STAGE_ORDER = ["IGCSE", "AS", "A-Level", "IAL"] as const;
const stageRank = (level: string): number => {
  const i = (STAGE_ORDER as readonly string[]).indexOf(level);
  return i === -1 ? STAGE_ORDER.length : i;
};

// T-HUB-COURSES-PUBLIC-1 fix ③: 106 courses, zero imagery — the cards were
// an undifferentiated wall. Each subject family gets one quiet glyph (the
// house icon set, muted foreground, decorative) so a scan of the grid reads
// as subjects, not as 106 equal tiles. Case-insensitive: the registry has
// both "ICT" and "Ict".
const subjectIcon = (subject: string): LucideIcon => {
  const s = subject.toLowerCase();
  if (/biolog|chem|phys|science/.test(s)) return FlaskConical;
  if (/math/.test(s)) return Sigma;
  if (/account|business|econom/.test(s)) return Briefcase;
  if (/comput|\bict\b/.test(s)) return Cpu;
  if (/geog|hist|religio|environment/.test(s)) return Globe2;
  return BookOpen; // English + everything else
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
}: {
  courses: CourseMeta[];
  /** slug -> committed corpus archive paper count (UX review F-01); rows
   *  absent from the map or at 0 simply carry no badge — never a false one */
  archivePapers?: Record<string, number>;
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
    const b = new URLSearchParams(window.location.search).get("board");
    if (b && boards.some(([name]) => name === b)) setBoardState(b);
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
      const alias = BOARD_SEARCH_ALIASES[boardOf(c)] ?? "";
      return (
        c.label.toLowerCase().includes(needle) ||
        c.subject.toLowerCase().includes(needle) ||
        c.code.toLowerCase().includes(needle) ||
        c.level.toLowerCase().includes(needle) ||
        boardOf(c).toLowerCase().includes(needle) ||
        alias.includes(needle)
      );
    });
  }, [courses, board, q]);

  const groups = useMemo(() => {
    const g = new Map<string, CourseMeta[]>();
    for (const c of filtered) g.set(c.level, [...(g.get(c.level) ?? []), c]);
    return [...g.entries()].sort((a, b) => {
      const byStage = stageRank(a[0]) - stageRank(b[0]);
      if (byStage !== 0) return byStage;
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  return (
    <div className="space-y-6">
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
          onChange={(e) => setQ(e.target.value)}
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
          <Badge variant="secondary" className="px-1.5">
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
            <Badge variant="secondary" className="px-1.5">
              {count}
            </Badge>
          </Button>
        ))}
        </div>
      </div>
      {groups.map(([level, list]) => (
        <section key={level} aria-label={level}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {level} <span className="font-normal">· {list.length} course{list.length === 1 ? "" : "s"}</span>
          </h2>
          {/* t-ui-polish run-003 — the dashboard subjects grid recipe:
              gap-4, MG-sized quiet targets. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => {
              // fix ③: two lanes, legible at a glance — committed corpus
              // cards carry the primary tint; import-pending cards go
              // dashed on a muted surface and keep a NEUTRAL hover (their
              // hover used to invite exactly like real cards, then led to
              // grey tiles). min-h is gone: with 2-line titles the dead
              // vertical budget was ~35% of every card.
              const ghost = c.status !== "pilot" && c.status !== "full";
              const Icon = subjectIcon(c.subject);
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
                    <CardContent className="flex items-start gap-3 p-5">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(archivePapers?.[c.slug] ?? 0) > 0 && (
                          <Badge
                            variant="secondary"
                            title="Official question papers + mark schemes, readable on the course page"
                          >
                            {archivePapers?.[c.slug]} past paper{(archivePapers?.[c.slug] ?? 0) === 1 ? "" : "s"}
                          </Badge>
                        )}
                        {c.status === "pilot" ? (
                            <Badge className="uppercase">pilot corpus · official spec tree</Badge>
                          ) : c.status === "full" ? (
                            <Badge variant="outline" className="uppercase">
                              full corpus
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="uppercase text-muted-foreground">
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
              setQ("");
              setBoard(null);
            }}
          >
            Clear search &amp; filters
          </Button>
        </div>
      )}
    </div>
  );
}
