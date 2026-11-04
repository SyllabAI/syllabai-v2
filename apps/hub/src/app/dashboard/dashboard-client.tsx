"use client";

/**
 * Dashboard — the student's SME-style home (Task 21 + 21-b fidelity pass,
 * matched against the real savemyexams.com /members/ reference page):
 *
 *   1. Greeting header ("Welcome back 👋" — server-rendered from the
 *        routing session; B-2 made /dashboard an account surface; the
 *        neutral form — the session carries an account handle, not a
 *        display name)
 *   2. My courses — one card per added subject:
 *        eyebrow "Edexcel · {level}" · subject name · Last viewed badge ·
 *        "Continue revising" · per-resource rows with corpus counts AND
 *        live progress % (SME ProgressBarGroup parity) computed from the
 *        browser-local activity overlay (notes read, questions attempted,
 *        flashcards rated) — real activity, honestly 0% before you start.
 *        On the pilot card, signed-in learners also get an ACCOUNT strip
 *        (course-stats contract, ADR-029 tranche 4.11): full-trail coverage
 *        from the core account — attempts volume + distinct questions /
 *        notes / cards — shown as its own honest element BESIDE the device
 *        rows, never replacing them (self-marked answers and pre-account
 *        activity are device-local by design; core counts can only be a
 *        subset of what this device shows).
 *   3. Next best actions — ranked advice from the learner's own evidence
 *        (lib/next-best-actions.ts): misconception watch, review-due topics,
 *        problem-question retries, low-mastery practice, note coverage
 *   4. "Got another course?" slot card (SME's trailing grid cell) — opens
 *        the cascading board → level → subject add-course overlay
 *   5. "Jump back in" — resume card from the last-opened store
 *
 * Vertical rhythm (D-1): the page leads with the act-now row (reviews due
 * + set work), then Jump back in, then My subjects; the ambient rest
 * (attribution, advice, plan) follows — the resume card no longer sits
 * below two viewports of peers.
 *
 * The dashboard lists ONLY the learner's own subjects (no full-registry
 * catalogue — discovery lives in the overlay). The roster + last-opened
 * stay device-local by design (the account syncs a mirror); resource
 * counts come from /api/course-stats (committed bundles).
 *
 * B-2: this surface requires a session — the proxy redirects anonymous
 * requests to /login?next=…, so the identity-dependent copy branches the
 * demo needed ("Hi there", the device-only storage line) are gone; the
 * greeting renders from the session and the disclosure states the
 * account-truth unconditionally.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarCheck,
  ChevronRight,
  CloudCheck,
  FileQuestion,
  GraduationCap,
  Plus,
  RotateCcw,
  SquareStack,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyCoursesSync, useMySubjects } from "@/lib/my-subjects";
import { useToast } from "@/hooks/use-toast";
import { useIdentity } from "@/lib/identity";
import { useLastOpened, resourceLabel } from "@/lib/last-opened";
import { useCourseProgress } from "@/lib/progress";
// UX audit 2026-10-02 #17: the dashboard's sub-1%-decimal formatting is now
// the shared contract (progress-ring and strengths-panel had rounded to 0%)
import { formatPercent, percentLabel } from "@/lib/format";
import { api, getToken } from "@/lib/api";
import { railTodayCopy, useStudyPlan } from "@/lib/study-plan-client";
import { boardOf, hasExamSeriesCalendar } from "@/lib/board";
import { useDashboardCore } from "@/lib/dashboard-core";
import { fetchBridge, type LearnerBridge } from "@/lib/learner-state";
import { useExamTargets } from "@/lib/exam-series";
import { daysAgo, subtopicSetFor } from "@/lib/next-best-actions";
import { NextBestActionsCard } from "./next-best-actions-card";
import { ReviewDueStrip } from "./review-due-strip";
import { SetWorkCard } from "./set-work-card";
import { ProgressAttributionCard } from "./progress-attribution-card";
import { ExamSeriesPicker } from "./exam-series-picker";
import { AddCourseOverlay } from "./add-course-overlay";
import type { CourseMeta } from "@/lib/courses";
import type { CourseExamTargetView, CourseStatsView } from "@/lib/types";

interface CourseStat {
  slug: string;
  hasBundle: boolean;
  topics: number;
  notes: number;
  questionSets: number;
  questions: number;
  flashcards: number;
}

const QUICK_ADD = [
  "igcse-chemistry-19",
  "igcse-maths-a-18-foundation",
  "igcse-maths-a-18-higher",
  "igcse-physics-19",
  "igcse-biology-19",
  "ial-maths-20-pure-1",
];

function rowValue(value: number | undefined, unit: string) {
  if (value === undefined) return <Skeleton className="h-3 w-10" />;
  return (
    <span className="text-xs font-medium tabular-nums text-foreground">
      {value} {unit}
      {value === 1 ? "" : "s"}
    </span>
  );
}

function percentOf(done: number, total: number | undefined): number | undefined {
  if (total === undefined || total <= 0) return undefined;
  // precise value — tiny fractions (<1%) still move the needle and are
  // formatted with a decimal at display time, so the first answered
  // question is visible immediately instead of rounding to 0%
  return Math.min(100, (done / total) * 100);
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Account coverage (course-stats contract, ADR-029 tranche 4.11): the
 * learner's FULL-trail aggregates from their core account — per-LEARNER,
 * not per-course, so D-4 drops the pilot-join probe that used to gate the
 * fetch and D-3 renders the result ONCE at the My subjects section level
 * instead of as a second, disagreeing number on one pilot card. Every
 * negative (signed out, core behind the contract or down) degrades to null
 * without a word. Re-reads when new core evidence lands (attempt / rating /
 * vote events fire `syllabai:core-evidence`).
 */
function useAccountStats(enabled: boolean): CourseStatsView | null {
  const [stats, setStats] = useState<CourseStatsView | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      if (!getToken()) return; // signed out — no account trail to show
      api
        .learnerCourseStats()
        .then((s) => {
          if (!cancelled) setStats(s);
        })
        .catch(() => {}); // core behind the contract or down — silent
    };
    load();
    window.addEventListener("syllabai:core-evidence", load);
    return () => {
      cancelled = true;
      window.removeEventListener("syllabai:core-evidence", load);
    };
  }, [enabled]);

  return stats;
}

/** SME ProgressBarGroup parity: title row + percent, thin rounded bar underneath. */
function ProgressBar({ percent }: { percent: number | undefined }) {
  if (percent === undefined) return null;
  return (
    <div
      className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${
          percent >= 100 ? "bg-chart-2" : "bg-primary"
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function ResourceRow({
  href,
  icon: Icon,
  label,
  value,
  percent,
  disabled,
}: {
  href: string;
  icon: typeof BookOpen;
  label: string;
  value: React.ReactNode;
  percent?: number | undefined;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <span className="flex w-full items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1 truncate text-sm">{label}</span>
        {value}
        {percent !== undefined && (
          <span
            className={`w-20 shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums ${
              percent > 0 ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {percentLabel(percent)}
          </span>
        )}
        <ChevronRight
          className={`size-4 shrink-0 transition-opacity ${disabled ? "text-muted-foreground/30" : "text-muted-foreground/60"}`}
          aria-hidden
        />
      </span>
      <ProgressBar percent={percent} />
    </>
  );
  const cls =
    "flex flex-col gap-0 rounded-md px-2 py-2 transition-colors " +
    (disabled
      ? "cursor-not-allowed text-muted-foreground/60"
      : "hover:bg-muted hover:text-foreground");
  return (
    <li>
      {disabled ? (
        <span aria-disabled className={cls} title="Import pending">
          {inner}
        </span>
      ) : (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      )}
    </li>
  );
}

function SubjectCard({
  meta,
  stat,
  isLastViewed,
  onRemove,
  examTarget,
}: {
  meta: CourseMeta;
  stat: CourseStat | undefined;
  isLastViewed: boolean;
  onRemove: (slug: string) => void;
  /** T-C79: the declared exam target with its derived countdown —
   *  undefined = unavailable (signed out / core behind the contract; no
   *  surface at all), null = nothing declared (the honest picker state) */
  examTarget?: CourseExamTargetView | null;
}) {
  const base = `/courses/${meta.slug}`;
  const counts =
    stat?.hasBundle
      ? { notes: stat.notes, questions: stat.questions, sets: stat.questionSets, cards: stat.flashcards }
      : null;

  // Live progress % — the student's own browser-local activity overlay
  // (notes read · distinct questions attempted · flashcards rated), shown
  // against real corpus totals. Honestly 0% before any activity.
  const progress = useCourseProgress(meta.slug);
  const questionsTouched = useMemo(
    () =>
      new Set([...Object.keys(progress.selfScores), ...Object.keys(progress.mcqAnswers)]).size,
    [progress],
  );
  const percents = counts
    ? {
        notes: percentOf(Object.keys(progress.notesRead).length, counts.notes),
        questions: percentOf(questionsTouched, counts.questions),
        cards: percentOf(Object.keys(progress.flashcards).length, counts.cards),
      }
    : null;

  return (
    <Card className="relative h-full border-primary/25 transition-[border-color,box-shadow] hover:border-primary/60 hover:shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${meta.label} from my subjects`}
        onClick={() => onRemove(meta.slug)}
        className="absolute top-1 right-1 size-9 rounded-full text-muted-foreground hover:text-destructive"
      >
        <X className="size-4" aria-hidden />
      </Button>
      <CardContent className="flex h-full flex-col gap-1 p-4 pr-11">
        {/* eyebrow: board · level (SME: "IGCSE · Edexcel") — the row's real
            board via lib/board ("Edexcel" for the pre-CIE rows, the row's
            registry value for the CIE wave) */}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {boardOf(meta)} · {meta.level}
        </p>

        {/* subject name + Last viewed badge */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={base} className="group min-w-0">
            <span className="block truncate text-base font-bold group-hover:text-primary">
              {meta.subject}
            </span>
          </Link>
          {isLastViewed && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
              Last viewed
            </Badge>
          )}
        </div>
        <p className="font-mono text-xs text-muted-foreground">{meta.code || "code pending"}</p>

        {/* T-C79: the exam-series declaration + its derived countdown —
            a picker over the IMPORTED calendar, never a typed date; the
            chip renders "≈" for estimated sittings and the entries-closed
            fact; unavailable states render nothing at all */}
        <div className="pt-0.5">
          {/* the calendar surface carries both boards of record (trace
              1a1589078364b76d): each lane reads its OWN board's calendar —
              a Cambridge lane's is honestly empty until its measured
              key-times dataset is imported, never a Pearson list */}
          {hasExamSeriesCalendar(meta) && (
            <ExamSeriesPicker
              slug={meta.slug}
              level={meta.level}
              board={boardOf(meta)}
              target={examTarget}
              label={`${meta.subject} (${meta.code || "code pending"})`}
              compact
            />
          )}
        </div>

        <Link
          href={base}
          className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Continue revising
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>

        {/* per-resource rows: corpus counts + live progress (SME parity).
            D-3: ONE number, one definition — these rows are this device's
            activity against the course's corpus totals; the rule is stated
            ONCE in the dashboard header sentence (UX review 2026-11-04:
            the per-card "Progress on this device" label + tooltip repeated
            the same provenance line five times down one page). The
            account-level trail lives at the My subjects section level. */}
        {counts && percents ? (
          <>
            <ul className="space-y-0.5 pt-0.5">
            <ResourceRow
              href={`${base}/revision-notes`}
              icon={BookOpen}
              label="Revision Notes"
              value={rowValue(counts.notes, "note")}
              percent={percents.notes}
            />
            <ResourceRow
              href={`${base}/exam-questions`}
              icon={FileQuestion}
              label="Exam Questions"
              value={rowValue(counts.questions, "question")}
              percent={percents.questions}
            />
            <ResourceRow
              href={`${base}/flashcards`}
              icon={SquareStack}
              label="Flashcards"
              value={rowValue(counts.cards, "card")}
              percent={percents.cards}
            />
            </ul>
          </>
        ) : (
          <div className="mt-1 space-y-2 border-t pt-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-10" />
            </div>
            {!meta.hasBundle && (
              <p className="text-xs text-muted-foreground">
                Content import pending — hub not available yet.
              </p>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

export function DashboardClient({
  courses,
}: {
  courses: CourseMeta[];
}) {
  useMyCoursesSync(); // T-TEACH-001 — mirror the roster to core while signed in (write-through + reconcile)
  // T-TIER1: the last-opened + mock-results mirrors mount in the app shell
  // (their writes happen on course routes / past-papers, not just here).
  const { slugs, has, add, remove, restore } = useMySubjects();
  const identity = useIdentity();
  const lastOpened = useLastOpened();
  const studyPlan = useStudyPlan(); // the Study plan rail (spec §5.3) — one server projection
  const signedIn = identity !== null; // the identity session of record (token + user)
  const [addOpen, setAddOpen] = useState(false);
  // T-DASH-SIDEBAR-001: the sidebar's footer "Add subject" opens THIS
  // overlay (a window event, not prop drilling — the shell is chrome, not
  // an owner of the roster state).
  useEffect(() => {
    const open = () => setAddOpen(true);
    window.addEventListener("syllabai:dashboard-add-course", open);
    return () => window.removeEventListener("syllabai:dashboard-add-course", open);
  }, []);
  const [stats, setStats] = useState<Record<string, CourseStat>>({});

  const bySlug = useMemo(() => {
    const m = new Map<string, CourseMeta>();
    for (const c of courses) m.set(c.slug, c);
    return m;
  }, [courses]);

  const { toast } = useToast();

  // D-7 (frontend-flow audit): removal was one tap — equal visual weight
  // with the reading affordances — with no confirm and no undo, and it
  // takes this device's progress keys for the course with it. The cheapest
  // honest fix is the undoable kind: the card leaves at once, a 5-second
  // toast owns the regret window, and Undo re-inserts the slug exactly
  // where it was. (Signed in, the write-through mirror treats the
  // remove/restore pair as two idempotent full-set PUTs — account sync
  // stays consistent either way.)
  const removeSubject = useCallback(
    (slug: string) => {
      const index = slugs.indexOf(slug);
      const label = bySlug.get(slug)?.label ?? slug;
      remove(slug);
      toast({
        title: `${label} removed`,
        description: "Your progress for it on this device went with it.",
        duration: 5000,
        action: (
          <ToastAction altText={`Undo removing ${label}`} onClick={() => restore(slug, index)}>
            Undo
          </ToastAction>
        ),
      });
    },
    [slugs, bySlug, remove, restore, toast],
  );

  // valid roster = stored slugs that still exist in the registry
  const mySubjects = useMemo(
    () => slugs.filter((s) => bySlug.has(s)).map((s) => bySlug.get(s) as CourseMeta),
    [slugs, bySlug],
  );
  const slugsKey = mySubjects.map((c) => c.slug).join(",");

  useEffect(() => {
    if (!slugsKey) return;
    let cancelled = false;
    fetch(`/api/course-stats?slugs=${encodeURIComponent(slugsKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { stats?: Record<string, CourseStat> }) => {
        if (!cancelled && data.stats) setStats((prev) => ({ ...prev, ...data.stats }));
      })
      .catch(() => {
        /* keep previous stats; card falls back to skeletons */
      });
    return () => {
      cancelled = true;
    };
  }, [slugsKey]);

  // "Jump back in" — only if the recorded course still resolves in the registry
  // (memoized: the core jump-back's derivation depends on it below)
  const jumpBack = useMemo(
    () =>
      lastOpened && bySlug.has(lastOpened.slug)
        ? { course: bySlug.get(lastOpened.slug) as CourseMeta, resource: lastOpened.resource }
        : null,
    [lastOpened, bySlug],
  );

  // D-3/D-4: the account trail is per-learner — fetched once for the
  // signed-in dashboard and rendered once at the My subjects section level
  // below; the pilot was never an API boundary, only a component-tree
  // special case.
  const accountStats = useAccountStats(signedIn);

  // T-C79: the learner's declared exam targets keyed by course slug —
  // undefined per card = unavailable (signed out / core behind the V62
  // contract); a missing key = nothing declared (the honest picker state)
  const examTargets = useExamTargets();

  // P1-7 — cross-device jump back in (HUB-DASH-CORE, trace 1a0ec29c8c8cfb71):
  // when THIS device has no navigation history, the account's most recent
  // measured topic takes the slot — the account trail is real evidence of
  // where the learner left off, even from another device. D-4: the bridge
  // joins the RESOLVED course (the selection law's winner — pilot-first,
  // then the roster), never a hard-coded slug. Silently absent when the
  // device has history, the resolved course left the roster, core is down,
  // or no measured evidence exists.
  const core = useDashboardCore();
  const coreCourse = core.kind === "ready" ? core.model.course : null;
  const coreCourseInRoster = coreCourse != null && mySubjects.some((c) => c.slug === coreCourse);
  const [coreBridge, setCoreBridge] = useState<LearnerBridge | null>(null);
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

  const coreJumpBack = useMemo(() => {
    if (jumpBack || !coreCourseInRoster || !coreBridge || core.kind !== "ready") return null;
    const top = [...core.model.state.skillStates]
      .filter((s) => s.attempts > 0 && s.lastPracticedAt)
      .sort((a, b) => Date.parse(b.lastPracticedAt) - Date.parse(a.lastPracticedAt))[0];
    if (!top) return null;
    const meta = bySlug.get(coreCourse as string) as CourseMeta | undefined;
    if (!meta) return null;
    const node = core.model.kg?.nodes.find((n) => n.id === top.nodeId) ?? null;
    // node code → the hub's own question set for that sub-topic (the bridge's
    // additive join); the exam-questions index is the honest fallback
    const setSlug = subtopicSetFor(node?.code, coreBridge);
    return {
      title: top.nodeName ?? node?.title ?? "Your most recent topic",
      href: setSlug
        ? `/courses/${coreCourse}/exam-questions/${setSlug}`
        : `/courses/${coreCourse}/exam-questions`,
      lastPractised: daysAgo(Date.now(), Date.parse(top.lastPracticedAt)),
      meta,
    };
  }, [jumpBack, coreCourse, coreCourseInRoster, coreBridge, core, bySlug]);

  // D-2 (frontend-flow audit): ONE resume decision instead of two mutually
  // exclusive look-alike blocks — this device's last-opened surface wins;
  // only when the device has no history does the account's most recent
  // measured topic fill the slot. Both sources collapse into one shape so
  // the card below renders exactly once, with one heading and one
  // provenance badge line for the source.
  const resume = useMemo(() => {
    if (jumpBack) {
      return {
        source: "device" as const,
        resource: jumpBack.resource,
        title: jumpBack.course.subject,
        meta: jumpBack.course,
        href:
          jumpBack.resource === "hub"
            ? `/courses/${jumpBack.course.slug}`
            : `/courses/${jumpBack.course.slug}/${jumpBack.resource}`,
        lastPractised: null as string | null,
      };
    }
    if (coreJumpBack) {
      return {
        source: "account" as const,
        resource: "exam-questions" as const,
        title: coreJumpBack.title,
        meta: coreJumpBack.meta,
        href: coreJumpBack.href,
        lastPractised: coreJumpBack.lastPractised as string | null,
      };
    }
    return null;
  }, [jumpBack, coreJumpBack]);

  return (
    <div className="space-y-8">
      {/* greeting — the neutral form (UX review 2026-11-04): the routing
          session carries only the account handle (initials + a code, e.g.
          "HNA 269a"), not a display name, and "Hi HNA 269a" read as a
          login chip where a greeting belongs. "Welcome back" is honest
          for every session; the header's identity chip already shows the
          handle. Renders on the server (B-2): no "Hi there" frame. */}
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Welcome back 👋
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your launchpad for spec-anchored revision — notes, exam questions and flashcards
          mapped to each of your courses. Your progress syncs to your account across
          devices; self-marked answers and reading history stay on this device.
        </p>
      </header>

      {/* ---- Act now (D-1): the dashboard's first row answers "what should
          I do now?" — the retention loop's headline (HUB-DASH-CORE P1-5:
          account queue when the resolved course's core path is live, the
          device's Ebbinghaus derivation otherwise) beside the server-composed
          set-work facts (T-C78 agenda). One row, one card each; either may
          render nothing when it has no news. ---- */}
      <section aria-label="Act now">
        <div className="grid gap-3 lg:grid-cols-2">
          <ReviewDueStrip courses={mySubjects} />
          <SetWorkCard />
        </div>
      </section>

      {/* t-ui-polish run-001 — the MG/RD dashboard split: the working surfaces
          (resume, subjects) own the main column; the advice layer (progress
          attribution, next best actions, study plan) reads from a narrower
          rail at xl. Below xl the single-column stack survives unchanged —
          main's D-1 order (act now → jump back in → subjects → advice) is
          exactly the below-xl order, so the split only re-plumbs xl+. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-8">
        <div className="space-y-8">

      {/* ---- Jump back in (D-1: the returning student's highest-frequency
          action leaves the page bottom) — ONE surface (SME resume card +
          the account trail, D-2). Priority: this device wins; the account
          fills the gap. The source badge explains why the card can differ
          between the phone and the school lab instead of reading as a bug. ---- */}
      {resume && (
        <section aria-label="Jump back in" className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <RotateCcw className="size-4 text-primary" aria-hidden />
            Jump back in
          </h2>
          <Link href={resume.href} className="group block focus-visible:outline-none">
            <Card className="transition-colors group-hover:border-primary/50">
              <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <Badge variant="secondary" className="font-medium">
                  {resourceLabel(resume.resource)}
                </Badge>
                <span className="text-sm font-semibold">{resume.title}</span>
                <span className="text-sm text-muted-foreground">
                  {boardOf(resume.meta)} · {resume.meta.level} · {resume.meta.code}
                </span>
                <Badge
                  variant="outline"
                  className="gap-1 px-1.5 py-0 text-[10px] font-medium text-primary"
                  title={
                    resume.source === "account"
                      ? "From your SyllabAI account — it follows you across devices"
                      : "From this device's recent activity"
                  }
                >
                  {resume.source === "account" && <CloudCheck className="size-3" aria-hidden />}
                  {resume.source === "account"
                    ? `from your account · last practised ${resume.lastPractised}`
                    : "from this device"}
                </Badge>
                <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </CardContent>
            </Card>
          </Link>
        </section>
      )}

      {/* ---- My courses ---- */}
      <section aria-label="My subjects" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            My subjects <span className="text-sm font-normal text-muted-foreground">· {mySubjects.length}</span>
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" aria-hidden />
            Add course
          </Button>
        </div>

        {/* D-3/D-4: the account trail is ONE section-level line — the
            per-learner coverage the course-stats contract returns — instead
            of a second, disagreeing number duplicated onto one pilot card.
            The fine print rides the title hover. */}
        {accountStats && (
          <p
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
            title="Counted from your SyllabAI account — it follows you across devices. The progress bars on each card track this device, including self-marked answers that stay local."
          >
            <Badge
              variant="outline"
              className="gap-1 px-1.5 py-0 text-[10px] font-medium text-primary"
            >
              <CloudCheck className="size-3" aria-hidden /> Live
            </Badge>
            <span className="tabular-nums">
              {plural(accountStats.attempts, "attempt")} ·{" "}
              {plural(accountStats.distinctQuestions, "question")} ·{" "}
              {plural(accountStats.notesViewed, "note")} ·{" "}
              {plural(accountStats.flashcardsRated, "card")}
            </span>
          </p>
        )}

        {mySubjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap className="size-4 text-primary" aria-hidden />
                No subjects yet — add your first one.
              </p>
              <p className="text-sm text-muted-foreground">
                Pick your exam board, level and subject, or start with a popular one:
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="size-3.5" aria-hidden />
                  Choose a subject
                </Button>
                {QUICK_ADD.filter((s) => bySlug.has(s)).map((slug) => {
                  const c = bySlug.get(slug) as CourseMeta;
                  return (
                    <Button key={slug} size="sm" variant="outline" className="gap-1.5" onClick={() => add(slug)}>
                      <Plus className="size-3.5" aria-hidden />
                      {c.label}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {mySubjects.map((c) => (
              <SubjectCard
                key={c.slug}
                meta={c}
                stat={stats[c.slug]}
                isLastViewed={lastOpened?.slug === c.slug}
                onRemove={removeSubject}
                examTarget={
                  examTargets === null ? undefined : examTargets.get(c.slug) ?? null
                }
              />
            ))}
            {/* SME's trailing slot cell: "Got another course?" — opens the
                cascading board → level → subject overlay */}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex min-h-[10rem] flex-col items-start justify-center gap-2 rounded-2xl border border-dashed border-muted-foreground/40 p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-sm font-semibold">Got another course?</p>
              <p className="text-xs text-muted-foreground">
                Save your courses for easy access.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Plus className="size-3.5" aria-hidden />
                Add course
              </span>
            </button>
          </div>
        )}
      </section>

        </div>

        {/* t-ui-polish run-001 — the advice rail: the three read-model cards
            that render nothing signed out. A complementary landmark so the
            rail is skippable alongside the main landmark. */}
        <aside aria-label="Advice and planning" className="space-y-8">

      {/* ---- DC-7 progress attribution (measured facts — the SAME projection
          the trees' rings read; never advice, never a local counter; renders
          nothing signed out). The labelled section + h2 live inside the
          component and mount only when at least one course resolved — the
          old bare wrapper shipped an empty labelled landmark (UX review
          2026-11-04). ---- */}
      <ProgressAttributionCard courses={mySubjects} />

      {/* ---- Next best actions (recommendation output — advice, not facts) ---- */}
      <section aria-label="Next best actions">
        <NextBestActionsCard courses={mySubjects} />
      </section>

      {/* ---- Study plan rail (spec §5.3 — the Create Study Plan button,
          replaced by today's completion once a plan exists: "You've
          completed 1 of 4 tasks today" with a progress bar. The counters
          ride the same server payload as the plan page — one projection,
          never a local counter; docs/STUDY-PLAN-BUILDER-PLAN.md) ---- */}
      <section aria-label="Study plan" className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarCheck className="size-4 text-primary" aria-hidden />
          Study plan
        </h2>
        {signedIn && studyPlan ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium">{railTodayCopy(studyPlan)}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${studyPlan.week.counters.percentToday}%` }}
                />
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/plan">View plan</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Structured by experienced teachers, tailored to your courses.
              </p>
              <Button asChild size="sm">
                {/* B-2: this surface is session-gated, so the demo-era
                    /login fallback is unreachable — the CTA always opens
                    the builder. */}
                <Link href="/plan">Create Study Plan</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

        </aside>
      </div>

      {/* ---- Add course — cascading board → level → subject overlay ---- */}
      <AddCourseOverlay
        open={addOpen}
        onOpenChange={setAddOpen}
        courses={courses}
        has={has}
        onAdd={add}
      />

    </div>
  );
}
