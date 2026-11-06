"use client";

/**
 * Teacher workspace — REBUILT to the operator's vision (HUB-TEACHER-DASH
 * wave 1, trace 1a0ec61d5612aa6d: "The teacher dashboard (in syllabai-hub)
 * is not how I envisioned. All the tools, resources will be inside a certain
 * Subject/Class/Section. Basically the dashboard will look like student one,
 * but instead of subject it is a class card. Teacher will add class, then
 * select subjects. Then inside there, all the tools and course resources
 * will exist.").
 *
 * The anatomy now mirrors the student dashboard (src/app/dashboard/
 * dashboard-client.tsx) beat for beat, with CLASS as the card entity:
 *   1. Greeting header ("Hi {name} 👋" — the student dashboard's pattern)
 *   2. My classes — one card per class (SubjectCard parity): eyebrow, name,
 *      per-SUBJECT rows with real corpus counts from /api/course-stats,
 *      open-workspace link, remove X. The trailing slot card ("Got another
 *      class?") and the empty-state CTA open the add-class overlay (the
 *      add-course cascade, name + multi-subject).
 *   3. The old overview's sections moved INSIDE the class workspace
 *      (/teacher/classes/[id]) — that is the directive's whole point:
 *      tools and course resources live inside the class, not on the
 *      dashboard.
 *   4. TeacherNav stays (the marking / live-roster / intelligence surfaces
 *      are workspace chrome, not class content) + the compact honesty
 *      footnote carries the old overview's live-vs-demo provenance line.
 *
 * Honesty: a class here is a browser-local container (lib/teacher/
 * my-classes.ts — the same demo-truth class as the student's subject
 * roster); the live core roster (/teacher/classes, RBAC) is a separate,
 * database-backed surface and every label keeps them distinct.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Database,
  GraduationCap,
  Plus,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// dashboard-redesign kit (T-TEACH-SKIN-1): the teacher home wears the same
// hero-band + band-section spine as the course pages, and its class cards
// wear the shared EntityTileCard chassis + the ONE provenance badge.
import { PageHero } from "@/components/dashboard/kit/page-hero";
import { BandSection } from "@/components/dashboard/kit/band-section";
import { StatChip } from "@/components/dashboard/kit/stat-chip";
import { ProvenanceBadge } from "@/components/dashboard/kit/provenance-badge";
import { EntityTileCard } from "@/components/dashboard/kit/entity-tile-card";
import { useIdentity } from "@/lib/identity";
import { useMyClasses, type TeacherClass } from "@/lib/teacher/my-classes";
import { boardOf } from "@/lib/board";
import { ApiError, api } from "@/lib/api";
import type { TeacherClassView } from "@/lib/types";
import { AddClassOverlay } from "./add-class-overlay";

/** The page passes the registry subset this dashboard renders. The board
 *  rides along (absent = the pre-CIE Edexcel rows) so class cards and the
 *  picker print the row's real awarding board — operator trace
 *  1a158596b1569079 opened the class-creation picker to both boards, and
 *  the pre-fix hard-coded "Edexcel" eyebrow would have been false for
 *  every Cambridge lane a class covers. */
export interface TeacherCourseLite {
  slug: string;
  label: string;
  subject: string;
  code: string;
  level: string;
  board?: string;
}

/** Same shape the student dashboard reads from /api/course-stats. */
interface CourseStat {
  slug: string;
  hasBundle: boolean;
  topics: number;
  notes: number;
  questionSets: number;
  questions: number;
  flashcards: number;
}

function rowValue(value: number | undefined, unit: string) {
  if (value === undefined) return <Skeleton className="h-3 w-10" />;
  return (
    <span className="text-xs font-medium tabular-nums text-foreground">
      {value} {unit}
      {value === 1 ? "" : "s"}
    </span>
  );
}

/** One subject row on a class card — ResourceRow parity from the student
 *  dashboard (icon-ish dot, label, counts, chevron), navigating into the
 *  class workspace where that subject's tools and resources live. */
function SubjectRow({
  classId,
  label,
  code,
  stat,
}: {
  classId: string;
  label: string;
  code: string;
  stat: CourseStat | undefined;
}) {
  return (
    <li>
      <Link
        href={`/teacher/classes/${classId}`}
        className="flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{label}</span>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {code}
          </span>
        </span>
        {stat?.hasBundle ? (
          <span className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
            {rowValue(stat.notes, "note")} · {rowValue(stat.questions, "question")} ·{" "}
            {rowValue(stat.flashcards, "card")}
          </span>
        ) : (
          <Skeleton className="h-3 w-24 shrink-0" />
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </Link>
    </li>
  );
}

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** A LIVE core class on the dashboard (audit P2-6) — the EntityTileCard
 *  chassis with the ONE provenance badge it can never shed: live,
 *  database-backed, roster-managed on the Classes surface. The ad-hoc
 *  "Live · core" span retired into ProvenanceBadge (T-TEACH-SKIN-1). */
function CoreClassCard({ cls }: { cls: TeacherClassView }) {
  return (
    <EntityTileCard
      eyebrow={cls.courseLabel}
      badge={<ProvenanceBadge kind="live-core" />}
      name={cls.name}
      nameHref={`/teacher/classes/${cls.id}`}
      footerLink={{ href: `/teacher/classes/${cls.id}`, label: "Open workspace" }}
      muted={cls.status === "archived"}
    >
      <p className="text-xs text-muted-foreground">
        {cls.memberCount} {cls.memberCount === 1 ? "student" : "students"} enrolled
        {cls.status === "archived" ? " · archived" : ""}
      </p>
    </EntityTileCard>
  );
}

function ClassCard({
  cls,
  bySlug,
  stats,
  onRemove,
  onEdit,
}: {
  cls: TeacherClass;
  bySlug: Map<string, TeacherCourseLite>;
  stats: Record<string, CourseStat>;
  onRemove: (id: string) => void;
  onEdit: (cls: TeacherClass) => void;
}) {
  // selection order preserved; unknown slugs filtered at render (registry truth)
  const subjects = cls.subjectSlugs
    .map((s) => bySlug.get(s))
    .filter((c): c is TeacherCourseLite => !!c);

  // the class's real boards from the registry rows — one board prints its
  // name, several print honestly "Mixed boards" (classes may span boards
  // since the class-creation picker went two-board); zero valid subjects
  // prints the bare count (the body already explains the edit path)
  const classBoards = [...new Set(subjects.map((c) => boardOf(c)))];
  const eyebrowBoard =
    subjects.length === 0
      ? null
      : classBoards.length === 1
        ? classBoards[0]
        : "Mixed boards";

  return (
    <EntityTileCard
      eyebrow={
        eyebrowBoard
          ? `${eyebrowBoard} · ${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}`
          : `${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}`
      }
      badge={<ProvenanceBadge kind="device" />}
      name={cls.name}
      nameHref={`/teacher/classes/${cls.id}`}
      footerLink={{ href: `/teacher/classes/${cls.id}`, label: "Open class workspace" }}
      footerSlot={
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={() => onEdit(cls)}
        >
          Edit subjects
        </Button>
      }
      topRightSlot={
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${cls.name} from my classes`}
          onClick={() => onRemove(cls.id)}
          className="absolute top-1 right-1 size-9 rounded-full text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" aria-hidden />
        </Button>
      }
    >
      {/* per-subject rows with real corpus counts (course-stats) */}
      {subjects.length > 0 ? (
        <ul className="mt-1 space-y-0.5 border-t pt-1">
          {subjects.map((c) => (
            <SubjectRow
              key={c.slug}
              classId={cls.id}
              label={c.subject}
              code={c.code || "code pending"}
              stat={stats[c.slug]}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
          No valid subjects left — edit the class to pick its lanes.
        </p>
      )}
    </EntityTileCard>
  );
}

export function TeacherClient({ courses }: { courses: TeacherCourseLite[] }) {
  const identity = useIdentity();
  const { classes, add, update, remove } = useMyClasses();
  const [addOpen, setAddOpen] = useState(false);
  const [editClass, setEditClass] = useState<TeacherClass | null>(null);
  const [stats, setStats] = useState<Record<string, CourseStat>>({});

  // Audit P2-6: the Overview showed ONLY browser-local containers while the
  // Classes tab showed only core rosters — neither surface knew the other
  // existed. The dashboard now lists both, badged by provenance; creation
  // flows stay where they were (the overlay grows local containers, the
  // Classes tab grows live rosters).
  const [coreClasses, setCoreClasses] = useState<TeacherClassView[] | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return; // no account — there is no core roster to fetch
    let cancelled = false;
    api
      .teacherClasses()
      .then((rows) => {
        if (!cancelled) {
          setCoreClasses(rows);
          setCoreError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCoreClasses([]);
          setCoreError(
            apiMessage(err, "Live classes are unavailable right now — core did not answer."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const bySlug = useMemo(() => {
    const m = new Map<string, TeacherCourseLite>();
    for (const c of courses) m.set(c.slug, c);
    return m;
  }, [courses]);

  // one course-stats read for the UNION of every class's subjects — the
  // student dashboard's slugsKey pattern verbatim
  const slugsKey = useMemo(
    () => [...new Set(classes.flatMap((c) => c.subjectSlugs))].sort().join(","),
    [classes],
  );

  useEffect(() => {
    if (!slugsKey) return;
    let cancelled = false;
    fetch(`/api/course-stats?slugs=${encodeURIComponent(slugsKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { stats?: Record<string, CourseStat> }) => {
        if (!cancelled && data.stats) setStats((prev) => ({ ...prev, ...data.stats }));
      })
      .catch(() => {
        /* keep previous stats; rows fall back to skeletons */
      });
    return () => {
      cancelled = true;
    };
  }, [slugsKey]);

  return (
    <div className="space-y-8">
      {/* T-TEACH-SKIN-1: the course page's hero band opens the teacher
          dashboard — eyebrow, display title, description, and the two
          class provenances as StatChips (live once core answered, the
          browser-local containers always). Core still loading renders no
          chip at all rather than a fabricated zero. */}
      <PageHero
        eyebrow="Teacher workspace"
        title={<>Hi {identity?.name ?? "there"} 👋</>}
        description="Add a class, pick the subjects it covers, and every tool and course resource for them lives inside it. Marking review and class intelligence read live cohort data; the corpus tools run on the local sample bank."
        stats={
          <>
            <StatChip
              icon={ShieldCheck}
              tone="success"
              label="live classes"
              value={identity ? (coreClasses?.length ?? undefined) : 0}
            />
            <StatChip
              icon={Database}
              tone="muted"
              label="this browser"
              value={classes.length}
            />
          </>
        }
      />

      {/* ---- My classes (BandSection chassis: the count line stays the
          honest provenance summary, the Add class action rides the band
          header) ---- */}
      <BandSection
        icon={Users}
        title="My classes"
        count={
          identity && coreClasses === null
            ? "· loading live classes…"
            : identity
              ? `· ${coreClasses?.length ?? 0} live · ${classes.length} this browser`
              : `· ${classes.length} this browser`
        }
        action={
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setEditClass(null);
              setAddOpen(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            Add class
          </Button>
        }
      >

        {coreError && (
          <p
            role="note"
            className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn-ink"
          >
            {coreError} Your browser-local containers are unaffected and still listed below.
          </p>
        )}

        {classes.length === 0 && !coreError && (coreClasses?.length ?? 0) === 0 && !(identity && coreClasses === null) ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap className="size-4 text-primary" aria-hidden />
                No classes yet — add your first one.
              </p>
              <p className="text-sm text-muted-foreground">
                Name the class, then select the subjects it covers. The tools and course resources
                for those subjects live inside the class workspace. For a live, database-backed
                roster, create a class on the{" "}
                <Link href="/teacher/classes" className="font-medium underline underline-offset-2">
                  Classes
                </Link>{" "}
                surface.
              </p>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5" aria-hidden />
                Create a class
              </Button>
            </CardContent>
          </Card>
        ) : classes.length === 0 && identity && coreClasses === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-3 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(coreClasses ?? []).map((c) => (
              <CoreClassCard key={c.id} cls={c} />
            ))}
            {classes.map((cls) => (
              <ClassCard
                key={cls.id}
                cls={cls}
                bySlug={bySlug}
                stats={stats}
                onRemove={remove}
                onEdit={(c) => {
                  setEditClass(c);
                  setAddOpen(true);
                }}
              />
            ))}
            {/* the student dashboard's trailing slot cell, class edition */}
            <button
              type="button"
              onClick={() => {
                setEditClass(null);
                setAddOpen(true);
              }}
              className="flex min-h-[10rem] flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/40 p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-sm font-semibold">Got another class?</p>
              <p className="text-xs text-muted-foreground">
                Add a class, then select its subjects.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Plus className="size-3.5" aria-hidden />
                Add class
              </span>
            </button>
          </div>
        )}
      </BandSection>

      {/* E-2 (frontend-flow audit): the delivery roadmap rendered inside
          the product — "Phase 3" badges are operator language with no
          classroom audience, and the footnote cited repo docs. The plan
          text lives in the repo (docs/TEACHER_MODE_PLAN.md); the one line
          a teacher may need here is the data one below. */}
      <section aria-label="About the data">
        <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Marking and insights read your school&apos;s live data.</span>
        </div>
      </section>

      {/* ---- Add / edit class — name → board → subject multi-select ---- */}
      <AddClassOverlay
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) setEditClass(null);
        }}
        courses={courses}
        editClass={
          editClass
            ? { id: editClass.id, name: editClass.name, subjectSlugs: editClass.subjectSlugs }
            : null
        }
        onCreate={(name, subjectSlugs) => {
          add(name, subjectSlugs);
        }}
        onUpdate={(id, patch) => {
          update(id, patch);
        }}
      />
    </div>
  );
}
