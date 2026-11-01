import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listCourses, loadHubCourse } from "@/lib/courses";
import { courseMetaDescription, courseTitle } from "@/lib/format";
import { hasPastPapers } from "@/lib/past-papers";
import { courseHasCorpusPapers } from "@/lib/pastpapers-corpus";
import { getSenecaForCourse } from "@/lib/seneca-hub";
import { getGradeBoundariesSummary } from "@/lib/grade-boundaries";
import { loadGuidedIndex } from "@/lib/guided-lessons";
import { getUgmBundle } from "@/lib/ugm";
import { CourseShell, type SidebarData } from "@/components/hub/course-shell";
import { LastOpenedTracker } from "@/components/hub/last-opened-tracker";

/**
 * Per-course layout — mounts the persistent course sidebar (the ONE sidebar,
 * SaveMyExams model, research §4 + flow crawl 2026-09-19). Resource detail
 * pages additionally mount the topic panel (resource-panel.tsx) as SME's
 * second column; hub/index pages have sidebar-only chrome.
 *
 * Deliberately NO <Suspense> around {children}: a boundary here lets the
 * shell (sidebar + fallback) flush with 200 before the page's notFound()
 * resolves, turning every unknown slug under /courses/[course]/… into a
 * soft-404 (200 + not-found UI, s133). Pages must be able to 404 pre-flush;
 * loadHubCourse is request-deduped (React cache) so the page rides the
 * layout's data instead of paying a second bundle read.
 *
 * Static-serving (ADR-021 perf pass, tranche 4.12): the corpus is committed
 * and immutable between deploys, and nothing in this tree reads session
 * state server-side (verified: no cookies()/headers() under src/app/courses
 * or src/components/hub — the shell's sign-in state is client-side), so the
 * former blanket force-dynamic (a demo-era inheritance — every course page
 * was ƒ server-rendered per request, zero CDN HTML) is gone. The layout
 * enumerates all registered course slugs at build; child pages prerender
 * what they enumerate (index pages: every course; detail pages: the pilot)
 * and render on-demand otherwise — unknown slugs still 404 pre-flush on the
 * on-demand path, so the s133 soft-404 fix holds verbatim.
 */
export async function generateStaticParams() {
  const courses = await listCourses();
  return courses.filter((c) => c.hasBundle).map((c) => ({ course: c.slug }));
}

// UX audit 2026-10-02 #14: every /courses/[course]/* page shared the root
// <title> — the tab read the same on the dashboard and 40 levels deep in a
// chemistry deck. The composed course title flows through the root template.
// UX review 2026-10-31 F-08: the bare label regressed on registered lanes
// (label falls back to the subject — "Geography", level dropped), and the
// global meta description described a different product on every Cambridge
// lane. courseTitle guarantees subject + variant + level; the description
// names only the counts this lane actually holds.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) return {};
  return {
    title: courseTitle(hub.meta),
    description: courseMetaDescription(hub.meta, hub.stats),
  };
}

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  // run-013 R1 (sidebar content audit): the chrome's conditional rows key on
  // the SAME server loaders the dashboard bands key on — one law per tool,
  // computed once here (React cache dedupes the page's own calls into these
  // same reads) so SSR and the client render identical rows — the ADR-021
  // hydration contract. Committed-content reads only; nothing session-scoped,
  // so static prerender is unaffected.
  const [seneca, gradeBoundaries, guided, ugm] = await Promise.all([
    getSenecaForCourse(slug),
    getGradeBoundariesSummary(slug),
    loadGuidedIndex(slug),
    getUgmBundle(slug),
  ]);

  const data: SidebarData = {
    course: {
      slug: hub.meta.slug,
      subject: hub.meta.subject,
      label: hub.meta.label,
      level: hub.meta.level,
      code: hub.meta.code,
      // ADR-030 tutor gate — the registry field the band-1 card and the
      // /tutor page both key on (run-013 R1/G2: Course Tutor rides the chrome)
      curriculumCode: hub.meta.curriculumCode,
    },
    tree: hub.index.tree,
    counts: hub.counts,
    hrefs: hub.hrefs,
    noteSubtopic: hub.noteSubtopic,
    notesBySubtopic: hub.notesBySubtopic,
    setsBySubtopic: hub.setListsBySubtopic,
    // OFFICIAL-PLANE-ONLY LAW (operator order 2026-10-25, trace
    // 1a17e79bb0e50399): "Past Papers" in the sidebar keys on the official
    // parsed plane (real interactive reconstructions) OR the corpus PDF
    // archive (hasCorpusPapers) — never on the SME exam-questions bank's
    // sourcePaper citations.
    hasPastPapers: hasPastPapers(hub.officialPaperTopics),
    hasCorpusPapers: courseHasCorpusPapers(slug),
    seneca: seneca ? { total: seneca.total } : undefined,
    // run-013 R1: G3/G4/G5 chrome gates — same law, same loader, as the band cards
    hasGradeBoundaries: gradeBoundaries !== null,
    hasGuidedLessons: guided !== null,
    hasUgm: ugm !== null,
  };

  return (
    <CourseShell data={data}>
      {/* records real navigation for the dashboard's Last viewed / Jump back in */}
      <LastOpenedTracker />
      {children}
    </CourseShell>
  );
}
