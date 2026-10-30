"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { boardOf, distinctBoards } from "@/lib/board";
import type { CourseMeta } from "@/lib/courses";
import { duplicateVariants } from "@/lib/course-variant";

// The short names people actually type into a courses search — matched
// alongside the registry's board label (boardOf) so "cie" finds the
// Cambridge International lanes without inventing a second board value.
const BOARD_SEARCH_ALIASES: Record<string, string> = {
  "Cambridge International": "cie caie cambridge",
  Edexcel: "pearson edexcel",
};

export function CourseDirectory({ courses }: { courses: CourseMeta[] }) {
  const [q, setQ] = useState("");
  // Audit #4: the directory rendered no board anywhere and offered no way
  // to filter by one — with two boards in the registry the cards were not
  // tellable apart and a board's lanes were unfindable card-by-card.
  const [board, setBoard] = useState<string | null>(null);
  // same subject+code lanes (e.g. Accounting 4AC1 ×2) — show the lane
  // qualifier from the slug so the cards are tellable apart (UX audit P2-7)
  const subtitles = useMemo(() => duplicateVariants(courses), [courses]);

  // distinct registry boards, busiest first — the same derivation the
  // add-course overlay's board step uses (one honest cascade shape)
  const boards = useMemo(() => distinctBoards(courses), [courses]);

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
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="space-y-6">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${courses.length} courses by subject, exam code or board…`}
        aria-label="Search courses"
        className="max-w-md"
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
          <Badge variant="secondary" className="px-1.5 text-[10px]">
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
            <Badge variant="secondary" className="px-1.5 text-[10px]">
              {count}
            </Badge>
          </Button>
        ))}
      </div>
      {groups.map(([level, list]) => (
        <section key={level} aria-label={level}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {level} <span className="font-normal">· {list.length} course{list.length === 1 ? "" : "s"}</span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <Link key={c.slug} href={`/courses/${c.slug}`} className="group min-w-0 focus-visible:outline-none">
                <Card
                  className={
                    c.hasBundle
                      ? "h-full border-primary/30 transition-colors group-hover:border-primary/60 group-focus-visible:border-primary/60"
                      : "h-full transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/60"
                  }
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold group-hover:text-primary">{c.label}</p>
                      {subtitles.get(c.slug) && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitles.get(c.slug)}</p>
                      )}
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {c.code ? c.code : <span className="not-italic">code pending</span>}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-[10.5px]">
                          {boardOf(c)}
                        </Badge>
                        {c.status === "pilot" ? (
                          <Badge className="text-[10.5px] uppercase">pilot corpus · official spec tree</Badge>
                        ) : c.status === "full" ? (
                          <Badge variant="outline" className="text-[10.5px] uppercase">
                            full corpus
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10.5px] uppercase text-muted-foreground">
                            import pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {board ? `${board} ` : ""}courses match “{q}”.
        </p>
      )}
    </div>
  );
}
