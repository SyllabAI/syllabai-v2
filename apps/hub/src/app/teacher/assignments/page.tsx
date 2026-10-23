import type { Metadata } from "next";
import { listCourses, pilotCourseSlug } from "@/lib/courses";
import { loadContentJson } from "@/lib/corpus";
import { AssignmentsClient } from "./assignments-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assignments · Teacher workspace",
  description:
    "Teacher assignments (core-backed): build from the question bank, assign to your cohort, track real learner hand-ins — completion evidence recorded on core.",
};

/**
 * The Seneca resource packs flag (T-SENECA-001) — flags.json law, adapted
 * from the UGM gating: absent file / key / slug = OFF (one-flip kill,
 * ADR-CLASS-0001 practice). The option renders only for flagged courses
 * whose resource library is linked (the picker itself renders the honest
 * empty state when the API holds no rows).
 */
async function senecaPacksEnabled(courseSlug: string | null): Promise<boolean> {
  if (!courseSlug) return false;
  try {
    const raw = await loadContentJson<{ flags?: Record<string, { courses?: string[] }> }>(
      "flags.json",
    );
    const courses = raw?.flags?.senecaCourseResources?.courses;
    return Array.isArray(courses) && courses.includes(courseSlug);
  } catch {
    return false; // a broken flag file never surfaces the option
  }
}

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; from?: string; subtopics?: string }>;
}) {
  const params = await searchParams;
  const courses = (await listCourses())
    .filter((c) => c.hasBundle)
    .map((c) => ({ slug: c.slug, label: c.label, code: c.code, level: c.level }));
  const pilot = await pilotCourseSlug();
  const initialCourse =
    courses.find((c) => c.slug === params.course)?.slug ?? pilot ?? courses[0]?.slug ?? null;
  const initialSubtopics = (params.subtopics ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60);
  const senecaEnabled = await senecaPacksEnabled(initialCourse);

  return (
    <AssignmentsClient
      courses={courses}
      initialCourse={initialCourse}
      fromTest={params.from ?? null}
      initialSubtopics={initialSubtopics}
      senecaEnabled={senecaEnabled}
    />
  );
}
