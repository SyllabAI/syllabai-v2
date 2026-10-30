import type { Metadata } from "next";
import { listCourses } from "@/lib/courses";
import { CourseDirectory } from "./course-directory";

export const metadata: Metadata = { title: "Browse courses" };

export default async function CoursesIndexPage() {
  const courses = await listCourses();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {courses.filter((c) => c.board == null).length} Edexcel IAL/IGCSE course variants and{" "}
          {courses.filter((c) => c.board != null).length} Cambridge International courses —{" "}
          {courses.length} Learning Hubs. The bundles are imported from the operator-authorized
          Save My Exams corpus — revision notes, exam questions and flashcards organised around
          each course&apos;s corpus specification tree — and the Cambridge International lanes
          run the same import: the resource wave has landed, their teaching banks are live
          alongside the official QP+MS past-paper archive on every course page the archive
          covers. The few lanes the publisher never shipped (no SME exam questions; the newest
          wave has no past papers yet) stay honestly empty rather than fabricated. The 4CH1
          Chemistry pilot additionally runs on the official Pearson specification tree with its
          concept graph.
        </p>
      </header>
      <CourseDirectory courses={courses} />
    </div>
  );
}
