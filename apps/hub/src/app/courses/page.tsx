import type { Metadata } from "next";
import { listCourses } from "@/lib/courses";
import { loadContentJson } from "@/lib/corpus";
import { corpusPapersForCourse } from "@/lib/pastpapers-corpus";
import type { CourseCounts } from "@/lib/directory-stats";
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
  // T-HUB-COURSES-PUBLIC-2 (①): the card substance line's data — each
  // course's OWN manifest counts (notes / flashcards / questions), one small
  // manifest.json read per row at build on this static page, plumbed to the
  // client like archivePapers. A manifest that fails to read simply yields
  // zeroes — the card renders no line rather than a fabricated one.
  const bundleStats = Object.fromEntries(
    await Promise.all(
      courses.map(async (c): Promise<[string, CourseCounts]> => {
        const manifest = await loadContentJson<{
          counts?: { notes?: number; flashcards?: number; questions?: number };
        }>(`${c.slug}/manifest.json`);
        const k = manifest?.counts;
        return [
          c.slug,
          {
            notes: k?.notes ?? 0,
            flashcards: k?.flashcards ?? 0,
            questions: k?.questions ?? 0,
          },
        ];
      }),
    ),
  );
  const counts = {
    edexcel: courses.filter((c) => c.board == null).length,
    cambridge: courses.filter((c) => c.board != null).length,
    total: courses.length,
  };
  // T-HUB-COURSES-PUBLIC-2 (⑤): the directory is public and statically
  // prerendered — it now gets the same structured-data treatment the course
  // pages already carry (the F-08 precedent in [course]/page.tsx). Registry
  // facts only; nothing invented. Item URLs resolve against the production
  // of record (www.syllab-ai.com — see the metadataBase note in layout.tsx).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "SyllabAI course directory",
    description: intro(counts),
    numberOfItems: courses.length,
    itemListElement: courses.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Course",
        name: c.label,
        url: `https://www.syllab-ai.com/courses/${c.slug}`,
        educationalLevel: c.level,
        inLanguage: "en",
        isAccessibleForFree: true,
        provider: { "@type": "Organization", name: "SyllabAI" },
      },
    })),
  };
  return (
    <div className="space-y-6">
      {/* T-HUB-COURSES-PUBLIC-2 (⑤): structured data — same honestly
          composed facts as the page copy, nothing invented. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
      <CourseDirectory
        courses={courses}
        archivePapers={archivePapers}
        bundleStats={bundleStats}
      />
    </div>
  );
}
