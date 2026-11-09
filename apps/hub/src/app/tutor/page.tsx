import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCourseMeta, listCourses } from "@/lib/courses";
import { TutorChat, TutorCourseGate } from "./chat";

export const metadata: Metadata = { title: "Tutor" };

/**
 * V53 (ADR-030) — the tutor becomes course-aware through the hub's OWN
 * registry: `/tutor?course=<slug>` resolves the slug to the registry's
 * `curriculumCode` (the core `curriculum_versions.code` the ask is scoped
 * by) and hands it to the chat as the ask's `courseRef`. The mapping is
 * EXPLICIT hub-maintained data — a course without one gets the honest gate,
 * never a silent cross-corpus fallback.
 *
 * T-TUTOR-ENTRY-1 (T-TUTOR-AUDIT-1 TU-11) — the no-param entry stops being
 * the legacy composer. The scope law (`services/content/scope.ts`) fails a
 * course-less ask CLOSED for any learner whose footprint spans ≥2 active
 * curricula — since the F8 waves that is every multi-subject learner, and
 * the audit's live pass proved the global `/tutor` page a deterministic
 * refusal machine for them (identical refusal, zero retrieval, every ask).
 * The tutor answers from ONE course's own material (ADR-030), so the entry
 * must name that course before a composer exists at all:
 *   exactly one tutor-enabled course → redirect to its `/tutor?course=`
 *   several → a course picker (cards, no composer);
 *   none → the honest gate.
 * `tutorEnabled` is EXPLICIT hub-maintained registry data (same discipline
 * as `curriculumCode` — never derived from codes, bundles or API state).
 * The gates and picker render WITHOUT the auth wrapper (a signed-out
 * visitor deserves the same honest answer; a login wall in front of a dead
 * end is not honesty); every chat surface stays behind RequireAuth. The
 * course-scoped redirect target carries its own auth gate — a wall in
 * front of a live surface, which is the correct trade.
 */
export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { course: courseSlug } = await searchParams;
  const slug = courseSlug?.trim() || null;

  if (slug) {
    const meta = await getCourseMeta(slug);
    if (!meta) {
      return <TutorCourseGate label={slug} reason="unknown" />;
    }
    if (!meta.curriculumCode) {
      return <TutorCourseGate label={meta.label} reason="unmapped" />;
    }
    return (
      <Suspense
        fallback={
          <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
            Loading tutor…
          </div>
        }
      >
        <RequireAuth>
          <TutorChat
            courseSlug={meta.slug}
            courseLabel={meta.label}
            courseRef={meta.curriculumCode}
            courseBoard={meta.board ?? null}
          />
        </RequireAuth>
      </Suspense>
    );
  }

  // T-TUTOR-ENTRY-1: route, pick, or gate honestly — never a course-less
  // composer that must refuse every ask for multi-curriculum learners.
  const tutorCourses = (await listCourses()).filter(
    (c) => c.tutorEnabled && c.curriculumCode,
  );

  if (tutorCourses.length === 1) {
    redirect(`/tutor?course=${tutorCourses[0].slug}`);
  }

  if (tutorCourses.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <span
            className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-hidden
          >
            <Sparkles className="size-5" />
          </span>
          <h1 className="mt-3 text-base font-semibold">The tutor isn&apos;t available yet</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            The tutor answers only from a course&apos;s own validated material, and no
            course has one connected yet. Once your course&apos;s tutor is live, it
            opens from here and from the course&apos;s hub.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/">Back to the hub</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        Pick a course for your tutor session
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The tutor answers only from one course&apos;s own validated material — it never
        blends courses — so a session needs to know which course you&apos;re asking about.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {tutorCourses.map((c) => (
          <Link key={c.slug} href={`/tutor?course=${c.slug}`} className="group focus-visible:outline-none">
            <Card className="h-full transition-[border-color,box-shadow] group-hover:border-primary/60 group-hover:shadow-sm group-focus-visible:border-primary/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  {c.label}
                  <ArrowRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">
                  Grounded tutor — every answer cites the spec points it draws on.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
