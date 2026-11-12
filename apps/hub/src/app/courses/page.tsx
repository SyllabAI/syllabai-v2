import type { Metadata } from "next";
import { FileStack, GraduationCap, LibraryBig, Sparkles } from "lucide-react";
import { listCourses } from "@/lib/courses";
import { loadContentJson } from "@/lib/corpus";
import { corpusPapersForCourse } from "@/lib/pastpapers-corpus";
import {
  summarizeDirectoryStats,
  type CourseCounts,
} from "@/lib/directory-stats";
import { StatChip } from "@/components/dashboard/kit/stat-chip";
import { CourseDirectory } from "./course-directory";

// T-HUB-COURSES-PUBLIC-1 (UX audit 2026-11-07, fix ②): the intro led with a
// 113-word operator-provenance paragraph — the page's own finding was that it
// owned the mobile first screen before a single course rendered. The intro is
// now the count + substance line (31 words); the provenance and honesty notes
// survive verbatim-in-substance one click down, in a <details> disclosure.
// T-HUB-COURSES-UI-3: the count line no longer undersells the shelf — the
// page sections itself IGCSE → AS → A-Level → IAL, so "IAL/IGCSE course
// variants" became the full ladder (same counts, same substance tail).
const intro = ({
  edexcel,
  cambridge,
  total,
}: {
  edexcel: number;
  cambridge: number;
  total: number;
}) =>
  `${edexcel} Edexcel and ${cambridge} Cambridge International courses — ${total} Learning Hubs across IGCSE, AS, A-Level and IAL: spec-anchored revision notes, exam questions, flashcards and the official QP+MS past-paper archive, organised around each course's specification tree.`;

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
  // T-HUB-COURSES-UI-2: the hero band's StatChip row — the directory's own
  // census, derived from the same arrays the cards render. Registry +
  // committed-bundle facts only (option-1 law); StatChip hides anything
  // absent, and summarizeDirectoryStats is unit-pinned for the derivation.
  const summary = summarizeDirectoryStats(courses, archivePapers);
  return (
    <div className="space-y-6">
      {/* T-HUB-COURSES-PUBLIC-2 (⑤): structured data — same honestly
          composed facts as the page copy, nothing invented. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* T-HUB-COURSES-UI-2: the page opens with the course page's own hero
          band (operator design order, trace 1a1bc441088a9629 — "make the
          course page look more like this"). The band is the house's approved
          PageHero kit — the same gradient wash, title recipe and StatChip row
          the attached course page runs. LAW AMENDMENT (disclosed in the task
          yaml + PR): T-HEADER-1 pinned /courses to the bare tool-page header;
          this operator order moves THIS page to the lander posture, every
          other tool page keeps the PageHeader law. The hero's interactive
          slots (search, board chips, Continue chip) are composed inside the
          client directory; the server authors title/description/stats and the
          provenance disclosure here. */}
      <CourseDirectory
        courses={courses}
        archivePapers={archivePapers}
        bundleStats={bundleStats}
        hero={{
          eyebrow: "Course directory",
          title: "Courses",
          description: intro(counts),
          stats: (
            <>
              <StatChip icon={GraduationCap} label="courses" value={summary.total} />
              <StatChip
                icon={LibraryBig}
                label="full corpus"
                value={summary.fullCorpus}
                tone="success"
              />
              <StatChip
                icon={Sparkles}
                label="tutor ready"
                value={summary.tutorReady}
                tone="cat"
              />
              <StatChip
                icon={FileStack}
                label="past papers"
                value={summary.papers.toLocaleString("en-GB")}
                tone="info"
              />
            </>
          ),
          // T-HUB-COURSES-PUBLIC-1 fix ②: the provenance paragraph, demoted
          // from the intro but kept whole — no-JS <details>, server-rendered,
          // now riding the hero's quiet bottom slot.
          provenance: (
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
          ),
        }}
      />
    </div>
  );
}
