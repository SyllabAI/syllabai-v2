import type { Metadata } from "next";
import { listCourses } from "@/lib/courses";
import { corpusPapersForCourse } from "@/lib/pastpapers-corpus";
import { CourseDirectory } from "./course-directory";
import { PageHeader } from "@/components/layout/page-header";

// T-HUB-COURSES-PUBLIC-1 (UX audit 2026-11-07, fix ②): the intro led with a
// 113-word operator-provenance paragraph — the page's own finding was that it
// owned the mobile first screen before a single course rendered. The intro is
// now the count + substance line (31 words); the provenance and honesty notes
// survive verbatim-in-substance one click down, in a <details> disclosure.
const intro = ({
  edexcel,
  cambridge,
  total,
}: {
  edexcel: number;
  cambridge: number;
  total: number;
}) =>
  `${edexcel} Edexcel IAL/IGCSE course variants and ${cambridge} Cambridge International courses — ${total} Learning Hubs: spec-anchored revision notes, exam questions, flashcards and the official QP+MS past-paper archive, organised around each course's specification tree.`;

export async function generateMetadata(): Promise<Metadata> {
  const courses = await listCourses();
  const counts = {
    edexcel: courses.filter((c) => c.board == null).length,
    cambridge: courses.filter((c) => c.board != null).length,
    total: courses.length,
  };
  return { title: "Browse courses", description: intro(counts) };
}

export default async function CoursesIndexPage() {
  const courses = await listCourses();
  // UX review 2026-10-31 F-01: the intro promises the official QP+MS archive
  // "on every course page the archive covers" — but nothing said WHICH lanes,
  // so a chemistry student could click the most polished card into a grey
  // ghost tile. The cards now badge the committed corpus archive per course
  // (one in-memory index lookup per row, computed at build on this static
  // page; the official parsed plane needs per-course bundle loads and stays
  // out of the directory's budget — an unbadged lane is never a false claim).
  const archivePapers = Object.fromEntries(
    courses.map((c) => [c.slug, corpusPapersForCourse(c.slug).length]),
  );
  const counts = {
    edexcel: courses.filter((c) => c.board == null).length,
    cambridge: courses.filter((c) => c.board != null).length,
    total: courses.length,
  };
  return (
    <div className="space-y-6">
      {/* T-HEADER-1: the shared tool-page header — one text-2xl title law
          (was text-3xl; the directory is a tool page, not a lander). */}
      <PageHeader title="Courses" description={intro(counts)}>
        {/* T-HUB-COURSES-PUBLIC-1 fix ②: the provenance paragraph, demoted
            from the intro but kept whole — no-JS <details>, server-rendered. */}
        <details className="group max-w-3xl">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground">
            Where this content comes from
          </summary>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              The bundles are imported from the operator-authorized Save My
              Exams corpus — revision notes, exam questions and flashcards
              organised around each course&apos;s corpus specification tree.
              The Cambridge International lanes run the same import: the
              resource wave has landed, their teaching banks are live alongside
              the official QP+MS past-paper archive on every course page the
              archive covers.
            </p>
            <p>
              The few lanes the publisher never shipped (no SME exam questions;
              the newest wave has no past papers yet) stay honestly empty
              rather than fabricated. The 4CH1 Chemistry pilot additionally
              runs on the official Pearson specification tree with its concept
              graph.
            </p>
          </div>
        </details>
      </PageHeader>
      <CourseDirectory courses={courses} archivePapers={archivePapers} />
    </div>
  );
}
