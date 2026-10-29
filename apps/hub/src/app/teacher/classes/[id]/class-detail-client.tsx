"use client";

/**
 * One class's workspace (V51, TFA-01/02): the live roster (enroll by email,
 * remove), the announcement board (publish with §9 categories, per-
 * announcement read counts over the real roster), and the lifecycle switch.
 *
 * T-TEACH-004 (core class workspace parity): a live class also EMBEDS its
 * course's resources — the same hub surfaces students use (revision notes,
 * exam questions, flashcards, the per-subject Knowledge Graph) plus the
 * course's past-papers archive, with real corpus counts — and the corpus-
 * local teacher tools (Test Builder, assignments, validation) deep-linked
 * with ?course=. The class sits on exactly ONE course (core's model), so
 * this is one section, no per-subject repetition; the browser-local class
 * container keeps its own per-subject layout. Resources are read-only
 * corpus surfaces: they render for archived classes too.
 *
 * Honesty rules: everything is live from core; the read count states what it
 * counts ("read by N of M"); a failed action surfaces its real message and
 * changes nothing locally; a missing corpus package or an empty paper
 * archive is a badge on the card, never a fake number.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  ArchiveRestore,
  BookOpen,
  BookOpenCheck,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileQuestion,
  GraduationCap,
  LibraryBig,
  ListChecks,
  Loader2,
  Map as MapIcon,
  Megaphone,
  Network,
  ScrollText,
  Send,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api } from "@/lib/api";
import type { TeacherAnnouncementView, TeacherClassDetailView } from "@/lib/types";
import type { TeacherCourseLite } from "../../teacher-client";
import { cn } from "@/lib/utils";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const CATEGORY_LABEL: Record<string, string> = {
  general: "General",
  homework: "Homework",
  notice: "Notice",
  "exam-reminder": "Exam reminder",
  resource: "Resource",
};

/** Same shape the student dashboard and the local class workspace read from
 *  /api/course-stats (the interface is deliberately identical — parity is the
 *  point; a shared module would couple the two workspaces' bands). */
interface CourseStat {
  slug: string;
  hasBundle: boolean;
  topics: number;
  notes: number;
  questionSets: number;
  questions: number;
  flashcards: number;
}

const RESOURCES = [
  {
    key: "notes",
    icon: BookOpen,
    label: "Revision Notes",
    href: (slug: string) => `/courses/${slug}/revision-notes`,
  },
  {
    key: "questions",
    icon: FileQuestion,
    label: "Exam Questions",
    href: (slug: string) => `/courses/${slug}/exam-questions`,
  },
  {
    key: "flashcards",
    icon: LibraryBig,
    label: "Flashcards",
    href: (slug: string) => `/courses/${slug}/flashcards`,
  },
  {
    key: "topics",
    icon: Network,
    label: "Knowledge Graph",
    href: (slug: string) => `/knowledge-graph?course=${slug}`,
    countLabel: "topics in the corpus",
  },
  {
    key: "papers",
    icon: ScrollText,
    label: "Past Papers",
    href: (slug: string) => `/courses/${slug}/past-papers`,
    pastPapers: true,
  },
] as const;

const TOOLS = [
  {
    href: (slug: string) => `/teacher/test-builder?course=${slug}`,
    icon: ClipboardList,
    title: "Test Builder",
    desc: "Assemble a printable, marks-aware test from the committed question bank — target the class's weakest areas, answer key included.",
    badge: "§6",
  },
  {
    href: (slug: string) => `/teacher/assignments?course=${slug}`,
    icon: ListChecks,
    title: "Assignments",
    desc: "Build from the bank, assign with a due date, track completion on the live roster, remediate in one click.",
    badge: "Phase 2",
  },
  {
    href: (slug: string) => `/teacher/validation?course=${slug}`,
    icon: FileCheck2,
    title: "AI content validation",
    desc: "Review real AI-authored model solutions from the bank and record approve / edit / reject verdicts before they count.",
    badge: "Phase 2",
  },
] as const;

// T-TEACH-014 — the Teaching Toolkit group (the 4 educator-ai generators).
// Distinct from TOOLS on purpose: the deep link carries the CLASS id (the
// grounding key) alongside the course slug, and the tool pages render the
// server-resolved Subject/Board/Level chips — no subject picker anywhere.
const TOOLKIT_CARDS = [
  {
    href: (classId: string, slug: string) => `/teacher/toolkit/lesson-plan?class=${classId}&course=${slug}`,
    color: "#E25881",
    icon: BookOpenCheck,
    title: "Lesson Plan Generator",
    desc: "Duration-driven lesson plan with the topic's curriculum objectives attached verbatim — starter to plenary, differentiation included.",
    badge: "Toolkit",
  },
  {
    href: (classId: string, slug: string) => `/teacher/toolkit/rubric?class=${classId}&course=${slug}`,
    color: "#F89900",
    icon: ClipboardCheck,
    title: "Rubric Developer",
    desc: "Analytic rubric across up to four criteria with a computed four-level scale — scores derive from marks, never guessed.",
    badge: "Toolkit",
  },
  {
    href: (classId: string, slug: string) => `/teacher/toolkit/sow?class=${classId}&course=${slug}`,
    color: "#26B3E8",
    icon: MapIcon,
    title: "Curriculum Mapper",
    desc: "Multi-lesson scheme of work — objectives, activities, differentiation and stretch for each lesson, building progressively.",
    badge: "Toolkit",
  },
  {
    href: (classId: string, slug: string) => `/teacher/toolkit/coach?class=${classId}&course=${slug}`,
    color: "#49B081",
    icon: GraduationCap,
    title: "Learning Coach",
    desc: "Clarify or challenge a passage for any audience — key concepts, critical details, applications and connections.",
    badge: "Toolkit",
  },
] as const;

function statCount(stat: CourseStat | null, key: string): number | undefined {
  if (!stat?.hasBundle) return undefined;
  return (stat as unknown as Record<string, number>)[key];
}

export function ClassDetailClient({
  classId,
  courses,
  paperCounts,
}: {
  classId: string;
  /** the server-passed registry subset (page.tsx listCourses — the same
   *  payload the dispatcher's local branch renders) */
  courses: TeacherCourseLite[];
  /** registry slug → past-papers archive count (server-computed from the
   *  committed corpus index — a server-only lib, so it arrives as data) */
  paperCounts: Record<string, number>;
}) {
  const [detail, setDetail] = useState<TeacherClassDetailView | null>(null);
  const [announcements, setAnnouncements] = useState<TeacherAnnouncementView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // enroll form
  const [email, setEmail] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollNote, setEnrollNote] = useState<string | null>(null);

  // announcement composer
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, a] = await Promise.all([api.teacherClassDetail(classId), api.teacherClassAnnouncements(classId)]);
      setDetail(d);
      setAnnouncements(a);
    } catch (err) {
      setError(apiMessage(err, "This class is unavailable right now — core did not answer."));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  // T-TEACH-004: corpus counts for the class's ONE course — the same
  // /api/course-stats payload the student dashboard and the local class
  // workspace read. The detail (carrying courseSlug) loads first; the fetch
  // rides the resolved slug. A failed fetch leaves the skeleton counts — the
  // honest posture the local workspace shares; the past-papers count is a
  // server-passed prop and never depends on this fetch.
  const courseSlug = detail?.courseSlug ?? null;
  const [stat, setStat] = useState<CourseStat | null>(null);
  useEffect(() => {
    if (!courseSlug) return;
    let cancelled = false;
    fetch(`/api/course-stats?slugs=${encodeURIComponent(courseSlug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { stats?: Record<string, CourseStat> }) => {
        if (!cancelled && data.stats) setStat(data.stats[courseSlug] ?? null);
      })
      .catch(() => {
        /* counts fall back to skeletons */
      });
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  const enroll = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setEnrolling(true);
    setEnrollNote(null);
    try {
      const d = await api.teacherClassEnroll(classId, { email: trimmed });
      setDetail(d);
      setEmail("");
      setEnrollNote(
        d.members.some((m) => m.email.toLowerCase() === trimmed.toLowerCase())
          ? `Enrolled: ${trimmed}`
          : null,
      );
    } catch (err) {
      setEnrollNote(apiMessage(err, "The enrollment did not reach core."));
    } finally {
      setEnrolling(false);
    }
  };

  const removeMember = async (studentId: string) => {
    try {
      setDetail(await api.teacherClassRemoveMember(classId, studentId));
    } catch (err) {
      setError(apiMessage(err, "The removal did not reach core."));
    }
  };

  const publish = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await api.teacherPublishAnnouncement(classId, { title: t, body: b, category });
      setTitle("");
      setBody("");
      setCategory("general");
      setAnnouncements(await api.teacherClassAnnouncements(classId));
    } catch (err) {
      setPublishError(apiMessage(err, "The announcement did not reach core."));
    } finally {
      setPublishing(false);
    }
  };

  const toggleStatus = async () => {
    if (!detail) return;
    try {
      await api.teacherSetClassStatus(classId, detail.status === "active" ? "archived" : "active");
      await load();
    } catch (err) {
      setError(apiMessage(err, "The status change did not reach core."));
    }
  };

  // T-TEACH-002 (ADR-CLASS-0001): the class AI-feature toggles — a partial
  // write per flip (absent keys keep their value server-side); the response
  // IS the refreshed detail, so the panel re-renders from the answer.
  // Guard: an API that predates T-TEACH-002 serves no features block — the
  // handler refuses honestly instead of crashing the page.
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const toggleFeature = async (key: "smartMark" | "tutor" | "cla") => {
    if (!detail?.features) return;
    const next = !detail.features[key];
    setSavingFeature(key);
    setFeatureError(null);
    try {
      setDetail(await api.teacherSetClassFeatures(classId, { [key]: next }));
    } catch (err) {
      setFeatureError(apiMessage(err, "The toggle change did not reach core."));
    } finally {
      setSavingFeature(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading class" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link href="/teacher/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> All classes
        </Link>
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "Class not found."}
        </div>
      </div>
    );
  }

  const active = detail.status === "active";

  // T-TEACH-004: the class's one course, resolved against the server-passed
  // registry subset (live classes are created on full-status courses, all
  // bundled — this resolves in practice). If core ever pointed at a slug the
  // registry dropped, the section honestly stays off; the header keeps
  // showing core's own courseLabel.
  const course = courses.find((c) => c.slug === detail.courseSlug);

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/classes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All classes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {detail.name}
            <Badge variant="outline" className="font-mono text-[10px]">
              {detail.status}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{detail.courseLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/courses/${detail.courseSlug}`}>
              <BookOpen className="size-3.5" aria-hidden /> Course hub
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/teacher/classes/${detail.id}/knowledge-graph`}>
              <Network className="size-3.5" aria-hidden /> Class KG heatmap
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void toggleStatus()}>
            {active ? (
              <>
                <Archive className="size-3.5" aria-hidden /> Archive
              </>
            ) : (
              <>
                <ArchiveRestore className="size-3.5" aria-hidden /> Reopen
              </>
            )}
          </Button>
        </div>
      </div>

      {!active && (
        <div className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
          This class is archived — students no longer see it in their classroom, and
          enrollment/publishing are closed until you reopen it.
        </div>
      )}

      {/* T-TEACH-002 (ADR-CLASS-0001): the class AI-feature toggles. The
          enforcement honesty is rendered with the control: tutor + the CLA
          fact-check surface deny server-side for your members today; Smart
          Mark's toggle records your policy and rides the same learner
          honesty surface, its attempt-level gate lands with the
          course-registry backfill (ADR §4 anchor-strength law). The panel
          is CONDITIONAL on the features block: an API that predates
          T-TEACH-002 serves none — the honest render is no panel, never a
          dehydrated control row. */}
      {detail.features && (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="size-4 text-primary" aria-hidden />
            Class features
          </h2>
          <p className="text-xs text-muted-foreground">
            Off means OFF for this class's members — the hub shows them the honest
            "your teacher turned this off" state. Students outside your class are never
            affected.
          </p>
          {featureError && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {featureError}
            </div>
          )}
          <ul className="divide-y rounded-lg border">
            <li className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">Tutor</p>
                <p className="text-xs text-muted-foreground">
                  The AI tutor ask surface. Off: your members' tutor asks for this
                  course are refused before any AI spend.
                </p>
              </div>
              <Switch
                checked={detail.features.tutor}
                disabled={savingFeature !== null}
                onCheckedChange={() => void toggleFeature("tutor")}
                aria-label="Toggle tutor for this class"
              />
            </li>
            <li className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">CLA fact-check</p>
                <p className="text-xs text-muted-foreground">
                  The question CHECK surface (answer-leakage gate included). Off: your
                  members' CHECK asks for this course are refused. Other CLA kinds stay
                  open until their anchoring lands (ADR §4).
                </p>
              </div>
              <Switch
                checked={detail.features.cla}
                disabled={savingFeature !== null}
                onCheckedChange={() => void toggleFeature("cla")}
                aria-label="Toggle CLA fact-check for this class"
              />
            </li>
            <li className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Smart Mark{" "}
                  <Badge variant="outline" className="ml-1 font-mono text-[10px]">
                    recorded
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Auto-grading + feedback explanations. Your choice is recorded and
                  visible to the class now; attempt-level enforcement lands with the
                  course-registry backfill (ADR §4).
                </p>
              </div>
              <Switch
                checked={detail.features.smartMark}
                disabled={savingFeature !== null}
                onCheckedChange={() => void toggleFeature("smartMark")}
                aria-label="Toggle smart mark for this class"
              />
            </li>
          </ul>
        </CardContent>
      </Card>
      )}

      {/* T-TEACH-004 (core class workspace parity): the class's course
          resources — the same hub surfaces students use — plus the course's
          past-papers archive and the corpus-local teacher tools. The class
          sits on ONE course, so this is one section; the browser-local class
          container keeps its per-subject layout. Read-only corpus surfaces:
          rendered for archived classes too. */}
      {course && (
        <section aria-labelledby="course-resources" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="course-resources" className="text-sm font-semibold">
              Course resources · {course.subject}
            </h2>
            <span className="text-[11px] text-muted-foreground">
              the same hub surfaces students use — not class-private copies
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {RESOURCES.map((r) => {
              const papers = "pastPapers" in r;
              const count = papers ? paperCounts[course.slug] : statCount(stat, r.key);
              return (
                <Link
                  key={r.key}
                  href={r.href(course.slug)}
                  className="group rounded-lg border bg-card p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <r.icon className="size-4" aria-hidden />
                  </span>
                  <p className="mt-3 flex items-center gap-1 text-sm font-semibold">
                    {r.label}
                    <ArrowRight
                      className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {stat && !stat.hasBundle && !papers ? (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        no corpus package
                      </Badge>
                    ) : papers ? (
                      count ? (
                        `${count} ${count === 1 ? "paper" : "papers"} in the archive`
                      ) : (
                        "no papers in the archive yet"
                      )
                    ) : count === undefined ? (
                      <Skeleton className="inline-block h-3 w-16" />
                    ) : "countLabel" in r ? (
                      `${count} ${r.countLabel}`
                    ) : (
                      `${count} in the corpus`
                    )}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {TOOLS.map((t) => (
              <Card key={t.title} className="py-0 transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary/10">
                      <t.icon className="size-4 text-primary" aria-hidden />
                    </span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {t.badge}
                    </Badge>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{t.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
                  <Button asChild size="sm" variant="outline" className="mt-3 gap-1.5">
                    <Link href={t.href(course.slug)}>
                      Open
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* T-TEACH-014 — the Teaching Toolkit group: the 4 educator-ai
              generators, grounded in THIS class (the deep link carries the
              class id AND the course slug; the tool page renders the
              server-resolved subject chips — no subject picker). */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLKIT_CARDS.map((t) => (
              <Card key={t.title} className="py-0 transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="flex size-9 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${t.color}1a` }}
                    >
                      <t.icon className="size-4" style={{ color: t.color }} aria-hidden />
                    </span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {t.badge}
                    </Badge>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{t.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
                  <Button asChild size="sm" variant="outline" className="mt-3 gap-1.5">
                    <Link href={t.href(classId, course.slug)}>
                      Open
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* roster */}
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserPlus className="size-4 text-primary" aria-hidden />
              Roster · {detail.members.length} {detail.members.length === 1 ? "student" : "students"}
            </h2>
            <div className="flex gap-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@school.example — registered email"
                type="email"
                disabled={!active}
                aria-label="Student email to enroll"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void enroll();
                }}
              />
              <Button onClick={() => void enroll()} disabled={enrolling || !active || !email.trim()}>
                {enrolling ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Enroll"}
              </Button>
            </div>
            {enrollNote && <p className="text-xs text-muted-foreground">{enrollNote}</p>}
            {detail.members.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                Nobody enrolled yet. Students register first (the join-code flow), then you
                enroll them here by email. Enrollment never touches their learning data.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {detail.members.map((m) => (
                  <li key={m.studentId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    {active && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${m.displayName}`}
                        onClick={() => void removeMember(m.studentId)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* announcements */}
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Megaphone className="size-4 text-primary" aria-hidden />
              Announcements
            </h2>
            {active && (
              <div className="space-y-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title — e.g. Test on Thursday"
                  maxLength={200}
                  aria-label="Announcement title"
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What should the class know?"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Announcement body"
                />
                <div className="flex items-center gap-2">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-40" aria-label="Announcement category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => void publish()} disabled={publishing || !title.trim() || !body.trim()}>
                    {publishing ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <>
                        <Send className="size-3.5" aria-hidden /> Publish
                      </>
                    )}
                  </Button>
                </div>
                {publishError && (
                  <p role="alert" className="text-xs text-destructive">
                    {publishError}
                  </p>
                )}
              </div>
            )}
            {announcements.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                Nothing published yet. Announcements reach exactly this class's members
                inside their subject workspace — never an AI channel, never anyone else.
              </p>
            ) : (
              <ul className="space-y-2">
                {announcements.map((a) => {
                  const pct = a.memberCount > 0 ? Math.round((a.readCount / a.memberCount) * 100) : 0;
                  return (
                    <li key={a.id} className="rounded-lg border px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{a.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {CATEGORY_LABEL[a.category] ?? a.category}
                        </Badge>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{a.body}</p>
                      <p className={cn("mt-1.5 text-[10px] text-muted-foreground")} title={`${a.readCount} of ${a.memberCount} members read this`}>
                        read by {a.readCount} of {a.memberCount}
                      </p>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
