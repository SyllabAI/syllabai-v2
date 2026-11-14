"use client";

/**
 * Dashboard "Next best actions" card — the demo port of the web workbench's
 * T-033 learner-facing recommendation card (F-092 minimal slice, ADR-017).
 *
 * RECOMMENDATION output, deliberately separate from measured-fact panels.
 * Two sources, never mixed within a course (HUB-DASH-CORE P1-4, operator
 * trace 1a0ec29c8c8cfb71):
 *
 *   - core path — the pilot course, signed in, core reachable: rows come
 *     from the account's own read model (GET /recommendations) in core's
 *     rank order, deep-linked into the hub's question sets via the bridge's
 *     subtopicSets join. This is the SAME read model the workbench consumes;
 *     the local rules below are its browser-local port.
 *   - local path — everything else (signed out, other courses, core down):
 *     ranked learning advice derived from the learner's own browser-local
 *     evidence (marks, mastery, the forgetting-decay schedule and the
 *     SIMULATED misconception watch) via lib/next-best-actions.ts.
 *
 * The UI never invents or rewords the evidence — reason lines carry the
 * derived numbers verbatim, misconception states keep their SIMULATED label
 * (and, since P1-6, the local path ranks them below the learner's own
 * measured evidence), and the footer names the provenance of every row.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  BookOpenCheck,
  CalendarClock,
  Compass,
  Layers,
  MessagesSquare,
  RotateCcw,
  Target,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchBridge, type LearnerBridge } from "@/lib/learner-state";
import { useAllCourseProgress } from "@/lib/progress";
import { useDashboardCore } from "@/lib/dashboard-core";
import { useNow } from "@/lib/use-now";
import {
  coreActionsToDashboard,
  deriveDashboardActions,
  NBA_ROW_CAP,
  type DashboardAction,
  type NbaActionType,
} from "@/lib/next-best-actions";
import { PILOT_COURSE_SLUG } from "@/lib/attempt-bridge";
import type { CourseMeta } from "@/lib/courses";

/* Status chips ride the semantic slots (--success/warn/info/cat/destructive),
   not hardcoded Tailwind hues — each theme resolves them into its own family
   (SME emerald/amber/sky/violet; QG fern/clay/teal/violet; candy mulberry/
   cherry/plum; plum violet/lavender/plum). The slots flip per mode, so no
   dark: overrides are needed. Design-audit second pass (m2). */
const typeConfig: Record<NbaActionType, { label: string; icon: typeof Compass; chip: string }> = {
  REMEDIATE_MISCONCEPTION: {
    label: "Fix misconception",
    icon: BookOpenCheck,
    chip: "border-warn/40 text-warn",
  },
  REVIEW_TOPIC: {
    label: "Review topic",
    icon: CalendarClock,
    chip: "border-info/40 text-info",
  },
  RETRY_PROBLEM_QUESTION: {
    label: "Retry question",
    icon: RotateCcw,
    chip: "border-destructive/40 text-destructive",
  },
  PRACTISE_QUESTIONS: {
    label: "Practise questions",
    icon: Target,
    chip: "border-success/40 text-success",
  },
  UNCOVERED_NOTE: {
    label: "Cover new ground",
    icon: BookOpen,
    chip: "border-cat/40 text-cat",
  },
  // core-only action types (HUB-DASH-CORE P1-4) — the local rules never
  // produce these; the chips follow the same semantic-slot discipline
  REVIEW_PREREQUISITE: {
    label: "Revise prerequisite",
    icon: Layers,
    chip: "border-info/40 text-info",
  },
  ASK_TUTOR: {
    label: "Ask the tutor",
    icon: MessagesSquare,
    chip: "border-cat/40 text-cat",
  },
  TIMED_EXERCISE: {
    label: "Practise timed",
    icon: Timer,
    chip: "border-success/40 text-success",
  },
};

function ActionRow({ action, rank }: { action: DashboardAction; rank: number }) {
  const config = typeConfig[action.actionType];
  const Icon = config.icon;
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
      aria-label={`Action ${rank}: ${config.label} — ${action.title}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums text-muted-foreground">
          {rank}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={`${config.chip} h-5 gap-1 px-1.5 text-2xs`}>
              <Icon className="size-3" aria-hidden="true" />
              {config.label}
            </Badge>
            <Badge variant="secondary" className="h-5 px-1.5 text-2xs font-medium">
              {action.courseLabel} · {action.courseLevel}
            </Badge>
          </div>
          {/* V-3 (visual audit 2026-11-13): the panel has vertical room —
              titles clamp to two lines instead of clipping mid-word; the
              existing title attr stays as the hover floor. */}
          <p className="mt-1 line-clamp-2 text-sm font-medium" title={action.title}>
            {action.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{action.detail}</p>
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link href={action.href}>{action.cta}</Link>
        </Button>
      </div>
    </li>
  );
}

export function NextBestActionsCard({ courses }: { courses: CourseMeta[] }) {
  const slugs = useMemo(() => courses.map((c) => c.slug), [courses]);
  const slugsKey = slugs.join(",");
  const progressBySlug = useAllCourseProgress(slugs);
  const [bridges, setBridges] = useState<Record<string, LearnerBridge | null>>({});
  const now = useNow();
  const core = useDashboardCore();
  const [coreBridge, setCoreBridge] = useState<LearnerBridge | null>(null);

  useEffect(() => {
    if (!slugsKey) return;
    let cancelled = false;
    for (const slug of slugsKey.split(",")) {
      fetchBridge(slug).then((bridge) => {
        if (!cancelled) setBridges((prev) => (prev[slug] === bridge ? prev : { ...prev, [slug]: bridge }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [slugsKey]);

  // D-4: the core read model carries its own course (the selection law's
  // winner — pilot-first, then the roster); the account rows and their
  // bridge join key on THAT course, never a hard-coded pilot slug. The
  // bridge deep-links core rows into the hub's own question sets (additive
  // join — null bridge degrades rows to the exam-questions index).
  const coreCourse = core.kind === "ready" ? core.model.course : null;
  const coreCourseInRoster = coreCourse != null && courses.some((c) => c.slug === coreCourse);
  useEffect(() => {
    if (coreCourse == null || !coreCourseInRoster) return;
    let cancelled = false;
    fetchBridge(coreCourse).then((bridge) => {
      if (!cancelled) setCoreBridge(bridge);
    });
    return () => {
      cancelled = true;
    };
  }, [coreCourse, coreCourseInRoster]);

  const coreView =
    coreCourseInRoster && core.kind === "ready" ? core.model.recommendations : null;
  const coreActions = useMemo(() => {
    if (!coreView || coreView.actions.length === 0 || coreCourse == null) return [];
    const meta = courses.find((c) => c.slug === coreCourse) as CourseMeta;
    return coreActionsToDashboard(coreView, {
      course: meta.slug,
      courseLabel: meta.subject,
      courseLevel: meta.level,
      bridge: coreBridge,
    });
  }, [coreView, coreCourse, courses, coreBridge]);

  // the account's read model REPLACES the local derivation for the resolved
  // course only (replace-not-merge, per course — the same ruling as the KG
  // drawer's core path); other courses keep their device-derived rows
  const coreReplacedResolved = coreActions.length > 0;
  const localCourses = useMemo(
    () =>
      coreReplacedResolved && coreCourse != null
        ? courses.filter((c) => c.slug !== coreCourse)
        : courses,
    [courses, coreReplacedResolved, coreCourse],
  );

  const inputs = useMemo(
    () =>
      localCourses.map((c) => ({
        slug: c.slug,
        subject: c.subject,
        label: c.label,
        level: c.level,
        bridge: bridges[c.slug] ?? null,
        progress: progressBySlug[c.slug],
      })),
    [localCourses, bridges, progressBySlug],
  );

  const pending =
    courses.some((c) => bridges[c.slug] === undefined) ||
    // hold device rows while the account read is unresolved when the pilot
    // is in the roster — today the only live core join, so it is the one
    // course whose rows could flash locally and then swap to the account's.
    // When a second course joins core, widen this to any core-joined
    // roster course (the selection law already resolves pilot-first).
    (courses.some((c) => c.slug === PILOT_COURSE_SLUG) && core.kind === "loading");
  const actions = useMemo(() => {
    // core rows first (the account's evidence outranks the device overlay —
    // the same precedence P1-6 encodes inside the local rules), then the
    // local derivation in its tier order, capped together
    return [...coreActions, ...deriveDashboardActions(inputs, now)].slice(0, NBA_ROW_CAP);
  }, [coreActions, inputs, now]);

  const resolvedSubject =
    coreCourse != null
      ? (courses.find((c) => c.slug === coreCourse)?.subject ?? coreCourse)
      : null;

  // Dashboard UX review 2026-11-04: the footer used to enumerate internal
  // reason codes ("reason codes: Due Review, Low Mastery") — debug output,
  // not policy. One plain sentence per source now; the codes stay internal.
  const provenance = coreReplacedResolved
    ? localCourses.length > 0
      ? `Ranked from your account's progress (${resolvedSubject}); your other courses from this device's activity.`
      : "Ranked from your account's progress — the same read model the workbench consumes."
    : "Ranked from this device's study activity — marks, mastery and the review schedule.";

  const bridgeFailed =
    courses.length > 0 &&
    actions.length === 0 &&
    courses.every((c) => bridges[c.slug] === null) &&
    !(core.kind === "ready" && core.model.recommendations);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        {/* real h2 (UX review 2026-11-04): the rail's sections were labelled
            landmarks with no headings — the AT outline jumped from h2 in the
            main column to nothing here. Visual styling is unchanged. */}
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Compass className="size-4 text-primary" aria-hidden="true" />
          Next best actions
        </h2>
        <CardDescription>
          Ranked learning advice from your evidence — what to do next and why. Reasons cite
          measured marks, mastery and review schedules; they are advice, not facts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a course and your next best actions will appear here, ranked from your own
            evidence.
          </p>
        ) : pending && actions.length === 0 ? (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : bridgeFailed ? (
          <p className="text-sm text-muted-foreground">
            Next-best actions are unavailable right now — the measured panels still work.
          </p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to recommend yet — answer a question and the learning loop starts here.
          </p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {actions.map((action, i) => (
                <ActionRow key={action.key} action={action} rank={i + 1} />
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="size-3 shrink-0" aria-hidden="true" />
                {provenance}
              </p>
              <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                <Link href="/tutor">
                  <MessagesSquare className="size-3.5" aria-hidden="true" />
                  Stuck? Ask the AI Tutor
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
