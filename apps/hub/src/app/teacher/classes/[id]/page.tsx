import type { Metadata } from "next";
import { listCourses } from "@/lib/courses";
import { corpusPapersForCourse } from "@/lib/pastpapers-corpus";
import { ClassWorkspaceDispatcher } from "./class-workspace-dispatcher";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Class workspace · Teacher workspace",
  description:
    "One class's workspace: the tools and course resources for every subject it covers, plus the live core roster — enroll students, publish notices, read cohort analytics.",
};

export default async function TeacherClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const all = await listCourses();
  const courses = all
    .filter((c) => c.hasBundle)
    .map((c) => ({ slug: c.slug, label: c.label, subject: c.subject, code: c.code, level: c.level }));

  // T-TEACH-004 (core class workspace parity): the live class workspace embeds
  // the course's resources INCLUDING the past-papers archive, so the archive
  // count must reach the client as a plain number. The corpus index is a
  // server-only concern (lib/pastpapers-corpus is fs/import-bound) — counted
  // here per registry slug (unmapped courses count 0 — the honest zero the
  // archive page itself renders) and handed down as data, never as a fetch.
  const paperCounts: Record<string, number> = {};
  for (const c of all) paperCounts[c.slug] = corpusPapersForCourse(c.slug).length;

  return <ClassWorkspaceDispatcher classId={id} courses={courses} paperCounts={paperCounts} />;
}
