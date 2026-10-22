"use client";

/**
 * Study-Plan Builder — the plan surface client (spec §5.3; prereg of record
 * docs/STUDY-PLAN-BUILDER-PLAN.md).
 *
 * THE BUILDER IS THREE STEPS, EACH CHEAP AND DEFAULTED (the spec's own
 * words): step one pre-selects the learner's courses ("Your plan balances
 * revision across the subjects you pick"); step two defaults each course's
 * exam season with pickers per course; step three defaults two hours per
 * weekday with add controls for the weekend ("Your plan fits your revision
 * into the time you set"). Generation shows the "Creating your Study Plan"
 * interstitial naming a teacher-designed framework, then the weekly page:
 * the goal card with the season chip, an Edit plan action, the day strip,
 * the "0 of 4" counter with a percent, and per-course task groups pairing
 * exactly one Revise task (Revision Notes, 15 minutes) with one Practise
 * task (Exam Questions, 45 minutes) per topic, each deep-linking into the
 * resource.
 *
 * COMPLETION IS THE PROJECTION'S VERDICT — every check mark comes from the
 * payload's DC-7 decision (Revise = the note check; Practise = five marked
 * parts), never from local state; the manual toggle/Adjust menu of the
 * observed product is a disclosed run-001 residual (prereg §5).
 *
 * Builder state is DERIVED, not synced: the defaults prefill (the learner's
 * saved courses ∩ the registry, falling back to the registry) is a render-
 * phase memo; user edits ride an override state on top of it — no effect-
 * body setState (the react-hooks/set-state-in-effect law).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Circle, Loader2, Pencil, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getToken } from "@/lib/api";
import { useMySubjects } from "@/lib/my-subjects";
import {
  completionCopy,
  dayName,
  goalCopy,
  saveStudyPlan,
  taskHref,
  useStudyPlan,
  useStudyPlanDefaults,
  type StudyPlanSeason,
  type StudyPlanUpsertBody,
} from "@/lib/study-plan-client";

type Mode = "view" | "builder" | "generating";

const HOUR_STEPPER_MAX = 8;

interface BuilderState {
  courses: string[];
  seasons: Record<string, StudyPlanSeason>;
  weekdayHours: number;
  weekendHours: number;
}

function seasonChip(s: StudyPlanSeason): string {
  return `${s.label} ${s.examYear}`;
}

export function PlanClient() {
  const payload = useStudyPlan();
  const defaults = useStudyPlanDefaults();
  const mySubjects = useMySubjects();
  const [mode, setMode] = useState<Mode>("view");
  const [step, setStep] = useState(1);
  const [override, setOverride] = useState<BuilderState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signedIn = useMemo(() => typeof window !== "undefined" && Boolean(getToken()), []);

  // mode derivation: the payload decides builder-vs-week once it arrives;
  // "view" means "the derived posture" (week with a plan, builder without)
  const derivedMode: Mode = !signedIn || payload ? "view" : defaults ? "builder" : "view";
  const effectiveMode: Mode = mode === "view" ? derivedMode : mode;

  // the defaults prefill — render-phase derivation (the spec's "cheap and
  // defaulted": step 1 pre-selects the learner's courses)
  const prefill: BuilderState | null = useMemo(() => {
    if (!defaults) return null;
    const saved = mySubjects.slugs.filter((s) => defaults.courses.some((c) => c.courseSlug === s));
    return {
      courses: saved.length > 0 ? saved : defaults.courses.map((c) => c.courseSlug),
      seasons: { ...defaults.seasons },
      weekdayHours: Math.round(defaults.weekdayMinutes / 60),
      weekendHours: Math.round(defaults.weekendMinutes / 60),
    };
  }, [defaults, mySubjects.slugs]);

  const builder: BuilderState =
    override ??
    prefill ?? {
      courses: [],
      seasons: {},
      weekdayHours: 2,
      weekendHours: 0,
    };

  const openBuilder = (edit: boolean) => {
    setError(null);
    setOverride(
      edit && payload
        ? {
            courses: [...payload.plan.courses],
            seasons: { ...payload.plan.seasons },
            weekdayHours: Math.round(payload.plan.weekdayMinutes / 60),
            weekendHours: Math.round(payload.plan.weekendMinutes / 60),
          }
        : null, // fresh entry: the prefill serves (and re-serves) the defaults
    );
    setStep(1);
    setMode("builder");
  };

  const toggleCourse = (slug: string, checked: boolean) => {
    setOverride((o) => {
      const base = o ?? prefill ?? builder;
      if (checked) {
        return base.courses.includes(slug)
          ? base
          : { ...base, courses: [...base.courses, slug] };
      }
      const seasons = { ...base.seasons };
      delete seasons[slug];
      return { ...base, courses: base.courses.filter((s) => s !== slug), seasons };
    });
  };

  const setSeason = (slug: string, patch: Partial<StudyPlanSeason>) => {
    setOverride((o) => {
      const base = o ?? prefill ?? builder;
      const current =
        base.seasons[slug] ??
        defaults?.seasons[slug] ?? {
          label: "Summer",
          examYear: new Date().getUTCFullYear() + 2,
          examMonth: 6,
        };
      return { ...base, seasons: { ...base.seasons, [slug]: { ...current, ...patch } } };
    });
  };

  const setHours = (kind: "weekdayHours" | "weekendHours", value: number) => {
    setOverride((o) => ({ ...(o ?? prefill ?? builder), [kind]: value }));
  };

  const generate = async () => {
    if (builder.courses.length === 0) {
      setError("Pick at least one course — your plan balances revision across the subjects you pick.");
      return;
    }
    setError(null);
    setMode("generating");
    const body: StudyPlanUpsertBody = {
      courses: builder.courses,
      seasons: builder.seasons,
      weekdayMinutes: builder.weekdayHours * 60,
      weekendMinutes: builder.weekendHours * 60,
    };
    const saved = await saveStudyPlan(body);
    if (!saved) {
      setError("The plan could not be saved just now — check your connection and try again.");
      setMode("builder");
      return;
    }
    setMode("view");
  };

  // ── signed out: the disclosed CTA posture ────────────────────────────────
  if (!signedIn) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <h1 className="text-xl font-semibold">Your Study Plan</h1>
            <p className="text-sm text-muted-foreground">
              Structured by experienced teachers, tailored to your courses. Sign in to build a plan
              from your subjects.
            </p>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ── the weekly page (the generation result of record) ────────────────────
  if (effectiveMode === "view" && payload) {
    const { week } = payload;
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
        {/* goal card: the season chip + the honest coverage claim */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold">Get exam-ready</h1>
                {week.courses.map((c) => (
                  <Badge key={c.courseSlug} variant="secondary" className="font-medium">
                    {c.label ?? c.courseSlug} · {seasonChip(c.season)}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{goalCopy(payload)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => openBuilder(true)}>
              <Pencil className="size-4" aria-hidden />
              Edit plan
            </Button>
          </CardContent>
        </Card>

        {/* the "N of M today" counter with a percent (the observed rail's twin) */}
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>
                You&rsquo;ve completed {week.counters.todayCompleted} of {week.counters.todayTotal} tasks today
              </span>
              <span className="text-muted-foreground">{week.counters.percentToday}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${week.counters.percentToday}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* the day strip across the week */}
        <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="This week">
          {week.days.map((d) => {
            const isToday = d.date === week.today;
            const done = d.tasks.filter((t) => t.complete).length;
            return (
              <div
                key={d.date}
                role="listitem"
                className={`rounded-lg border p-2 text-center text-xs ${isToday ? "border-primary" : "border-border"}`}
              >
                <div className="font-medium">{dayName(d.dayOfWeek)}</div>
                <div className="text-muted-foreground">{d.date.slice(8)}</div>
                <div className={done > 0 ? "font-medium text-primary" : "text-muted-foreground"}>
                  {d.tasks.length > 0 ? `${done}/${d.tasks.length}` : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {/* per-day per-course task groups (the paired Revise/Practise law) */}
        {week.days
          .filter((d) => d.tasks.length > 0)
          .map((d) => {
            const byCourse = new Map<string, typeof d.tasks>();
            for (const t of d.tasks) {
              const list = byCourse.get(t.courseSlug) ?? [];
              list.push(t);
              byCourse.set(t.courseSlug, list);
            }
            return (
              <section key={d.date} aria-label={`Tasks for ${d.date}`} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {dayName(d.dayOfWeek)} {d.date}
                  {d.date === week.today ? " · Today" : ""}
                </h2>
                {[...byCourse.entries()].map(([slug, tasks]) => (
                  <Card key={slug}>
                    <CardContent className="space-y-2 p-4">
                      <div className="text-sm font-medium">
                        {week.courses.find((c) => c.courseSlug === slug)?.label ?? slug}
                      </div>
                      {tasks.map((t) => (
                        <Link
                          key={`${t.taskId}@${t.date}`}
                          href={taskHref(t)}
                          className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none"
                        >
                          {t.complete ? (
                            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                          ) : (
                            <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <span className="space-y-0.5">
                            <span className="flex flex-wrap items-center gap-2">
                              <Badge variant={t.type === "REVISE" ? "secondary" : "outline"} className="font-medium">
                                {t.type === "REVISE" ? "Revise" : "Practise"} · {t.minutes} min
                              </Badge>
                              <span className="text-sm font-medium">{t.subtopicTitle}</span>
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {t.complete
                                ? completionCopy(t)
                                : t.type === "PRACTISE" && t.markedParts !== undefined
                                  ? `${t.markedParts} of ${t.threshold ?? 5} marked parts`
                                  : t.type === "REVISE"
                                    ? "Revision Notes"
                                    : "Exam Questions"}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </section>
            );
          })}
      </main>
    );
  }

  // ── the generation interstitial (names the teacher-designed framework) ──
  if (effectiveMode === "generating") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
            <p className="text-lg font-medium">Creating your Study Plan</p>
            <p className="text-sm text-muted-foreground">
              Your teacher-designed framework is pairing topics to your weeks across{" "}
              {builder.courses.length} {builder.courses.length === 1 ? "course" : "courses"}.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ── the three-step builder ───────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
      <div className="flex items-center gap-2">
        <CalendarCheck className="size-5 text-primary" aria-hidden />
        <h1 className="text-xl font-semibold">Create your Study Plan</h1>
      </div>
      <ol className="flex gap-2 text-xs text-muted-foreground" aria-label="Builder steps">
        {["Subjects", "Exam seasons", "Weekly time"].map((label, i) => (
          <li
            key={label}
            className={`rounded-full border px-3 py-1 ${step === i + 1 ? "border-primary font-medium text-foreground" : ""}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Your plan balances revision across the subjects you pick.
            </p>
            {!defaults && <p className="text-sm text-muted-foreground">Loading your courses…</p>}
            {defaults?.courses.map((c) => (
              <label key={c.courseSlug} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/60">
                <Checkbox
                  checked={builder.courses.includes(c.courseSlug)}
                  onCheckedChange={(v) => toggleCourse(c.courseSlug, v === true)}
                  aria-label={`Include ${c.label ?? c.courseSlug}`}
                />
                <span className="text-sm">
                  {c.label ?? c.courseSlug}
                  {c.level ? <span className="text-muted-foreground"> · {c.level}</span> : null}
                </span>
              </label>
            ))}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setStep(2)} disabled={builder.courses.length === 0}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Each course&rsquo;s exam season is defaulted — adjust the pickers if yours differ.
            </p>
            {builder.courses.map((slug) => {
              const season =
                builder.seasons[slug] ??
                defaults?.seasons[slug] ?? {
                  label: "Summer",
                  examYear: new Date().getUTCFullYear() + 2,
                  examMonth: 6,
                };
              return (
                <div key={slug} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-40 flex-1 text-sm font-medium">
                    {defaults?.courses.find((c) => c.courseSlug === slug)?.label ?? slug}
                  </span>
                  <select
                    aria-label={`Season for ${slug}`}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={season.label}
                    onChange={(e) => setSeason(slug, { label: e.target.value })}
                  >
                    <option>May/June</option>
                    <option>Summer</option>
                  </select>
                  <select
                    aria-label={`Exam year for ${slug}`}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={season.examYear}
                    onChange={(e) => setSeason(slug, { examYear: Number(e.target.value) })}
                  >
                    {[1, 2, 3].map((delta) => {
                      const y = new Date().getUTCFullYear() + delta;
                      return (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button size="sm" onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              Your plan fits your revision into the time you set — two hours per weekday is the
              default, and you can add weekend time.
            </p>
            {(
              [
                ["Weekday hours", "weekdayHours"],
                ["Weekend hours", "weekendHours"],
              ] as const
            ).map(([label, kind]) => {
              const value = builder[kind];
              return (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Remove an hour from ${label.toLowerCase()}`}
                      disabled={value === 0}
                      onClick={() => setHours(kind, Math.max(0, value - 1))}
                    >
                      −
                    </Button>
                    <span className="w-10 text-center text-sm">{value} h</span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Add an hour to ${label.toLowerCase()}`}
                      disabled={value >= HOUR_STEPPER_MAX}
                      onClick={() => setHours(kind, Math.min(HOUR_STEPPER_MAX, value + 1))}
                    >
                      +
                    </Button>
                  </span>
                </div>
              );
            })}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button size="sm" onClick={() => void generate()}>
                <Sparkles className="size-4" aria-hidden />
                Generate my plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
