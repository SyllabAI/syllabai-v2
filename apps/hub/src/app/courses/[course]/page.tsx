import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  CircleHelp,
  Compass,
  FileQuestion,
  Files,
  GraduationCap,
  Lightbulb,
  ListTree,
  NotebookPen,
  ScrollText,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { boardOf, listCourses, loadHubCourse, pilotCourseSlug } from "@/lib/courses";
import { courseMetaDescription, courseTitle, fmtCount } from "@/lib/format";
import { collectPastPapers } from "@/lib/past-papers";
import { corpusPapersForCourse } from "@/lib/pastpapers-corpus";
import { buildPracticePapers } from "@/lib/practice-papers";
import { battleServedFor } from "@/lib/battle-course";
import { CourseHeader } from "@/components/hub/course-header";
import CourseBodyTabs from "@/components/hub/course-body-tabs";
import type { TopicGroup } from "@/components/hub/course-body-tabs";
import { CourseSwitcher } from "@/components/hub/course-switcher";
import { TagChip } from "@/components/hub/chrome";
import { allCourseParams } from "@/lib/static-params";
import { courseHasBookArchive } from "@/lib/books-registry";
import { getUgmBundle, ugmStationNames } from "@/lib/ugm";
import { loadGuidedIndex } from "@/lib/guided-lessons";
import { getGradeBoundariesSummary } from "@/lib/grade-boundaries";

type FrameworkTag = "Study" | "Practice" | "Diagnose";

interface ResourceItem {
  icon: typeof BookOpen;
  title: string;
  desc: string;
  tags: FrameworkTag[];
  href?: string;
  countLabel?: string;
  ctaLabel?: string;
  ready: boolean;
  /** the honest not-ready badge — defaults to "roadmap" (a planned build
   *  phase); the tutor card overrides it ("not yet connected") because the
   *  tutor is BUILT — it gates on the course's serving corpus, ADR-030. */
  notReadyLabel?: string;
  /** hub-coursepage-mg-layout: the tinted icon-square wash (MG tile
   *  anatomy), hub tokens at low alpha so dark mode inherits for free. */
  tint: string;
}

/**
 * The per-subject Learning Hub (SME "Course Resources"; Task 21-b matched
 * against the real savemyexams.com course reference page), now carrying the
 * MathsGenie course-page anatomy (hub-coursepage-mg-layout, operator request
 * via chat trace 1a18c3f754d0e421):
 *   gradient hero (CourseHeader) · Topics | Resources body tab pair ·
 *   Resources = MG tile rows (tinted icon square + bold title + count) in
 *   the Ask the tutor / Practise / Track & improve / Learn bands (T-COURSE-BANDS-1
 *   run-001, operator plan B trace 1a192f93789cfe2d: the Exam Practice band
 *   split by job — question surfaces vs trackers/reference), with the spec
 *   strip and revision-framework explainer kept verbatim in content.
 * Corpus discipline kept: a card only links when the committed bundle
 * actually has the content; roadmap surfaces stay explicitly marked.
 * NOTHING was removed — every card, badge, tag and honest state from the
 * previous layout is present; only the container anatomy changed.
 */

/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return allCourseParams();
}

// UX review 2026-10-31 F-08: the growth-critical page shipped no canonical
// (while ?tab= produces URL variants), no OG/Twitter card, and a meta
// description describing a different product. Title + description compose
// from the registry's own data (courseTitle / courseMetaDescription); the
// [course] layout feeds the same composers to every subpage, and
// metadataBase (root layout) resolves the relative URLs.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) return {};
  const title = courseTitle(hub.meta);
  const description = courseMetaDescription(hub.meta, hub.stats);
  return {
    title,
    description,
    alternates: { canonical: `/courses/${slug}` },
    openGraph: {
      title,
      description,
      url: `/courses/${slug}`,
      type: "website",
      siteName: "SyllabAI Hub",
    },
    twitter: { card: "summary", title, description },
  };
}
export default async function CourseHubPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const pilotSlug = await pilotCourseSlug();
  const allCourses = await listCourses();
  const { meta, stats } = hub;
  // honest per-course count of lanes a visitor can actually open (F-03)
  const liveCount = allCourses.filter((c) => c.hasBundle).length;
  const base = `/courses/${meta.slug}`;
  const qual = `${boardOf(meta)} ${meta.level} ${meta.subject}`;
  const metaDescription = courseMetaDescription(meta, stats);
  // Course JSON-LD (F-08) — fed from the same live counts the tiles print;
  // no invented offers, ratings or durations.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: courseTitle(meta),
    description: metaDescription,
    educationalLevel: meta.level,
    inLanguage: "en",
    isAccessibleForFree: true,
    provider: { "@type": "Organization", name: "SyllabAI" },
  };
  // Task 22: real past-paper archive (sourcePaper provenance) + deterministic
  // practice papers assembled from the same banks.
  // OFFICIAL-PLANE-ONLY LAW (operator order 2026-10-25, trace
  // 1a17e79bb0e50399, "disappear entirely"): the Past Papers card counts
  // official parsed-plane reconstructions ONLY — the SME exam-questions bank
  // never advertises a past-paper playback promise. Courses without the
  // official plane keep an honest card: the corpus PDF archive (when the
  // syllabai-pastpapers archive holds this specification) or a not-ready
  // roadmap. The Exam Questions card/bank itself is untouched.
  const pastPapers = collectPastPapers(hub.officialPaperTopics);
  const heldQuestions = pastPapers.reduce((a, p) => a + p.questions.length, 0);
  const corpusArchivePapers = corpusPapersForCourse(slug);
  const practicePapers =
    stats.questionSets > 0 ? buildPracticePapers(meta.slug, hub.questionTopics) : [];
  // the 4CH1 pilot runs on the official Pearson tree; every other course runs
  // on the corpus's own (SME) tree until the official mapping lands upstream
  const officialTree = hub.treeKind !== "sme-native";
  // UGM lane resources (ADR-UGM-0001 as amended 2026-10-23): the card only
  // exists when the flags.json gate lists this course AND the committed
  // bundle validates (lib/ugm.ts absent=OFF law) — no roadmap ghost card.
  const ugm = await getUgmBundle(meta.slug);
  // R-1 (operator trace 1a179c6b53bff529): the guided-lesson card keys on the
  // committed guided-import.json of record (same fail-closed seam the per-note
  // banner uses) — live courses get real counts from the index, never
  // hardcoded; courses without one keep an honest roadmap card.
  const guided = await loadGuidedIndex(meta.slug);
  // T-GRADE-1: the boundaries card keys on the mechanically-imported
  // official corpus (resources GradeBoundaries lane, sha-proven) — a
  // course without data keeps the honest roadmap state.
  const gradeBoundaries = await getGradeBoundariesSummary(meta.slug);

  // Topics tab data (hub-coursepage-mg-layout): the canonical spec tree with
  // per-subtopic counts + canonical hrefs — the SAME joins the sidebar uses,
  // so every link here lands on a real surface. A row without any committed
  // resource renders honestly inert (no ghost links).
  const topicGroups: TopicGroup[] = hub.index.tree.topics.map((t) => ({
    code: t.code,
    number: t.number,
    title: t.title,
    subtopics: t.subtopics.map((s) => {
      const c = hub.counts[s.code] ?? { notes: 0, questions: 0, flashcards: 0 };
      const links = [
        c.notes > 0 && hub.hrefs.notes[s.code]
          ? { label: "Notes", href: hub.hrefs.notes[s.code], count: c.notes }
          : null,
        c.questions > 0 && hub.hrefs.questions[s.code]
          ? { label: "Questions", href: hub.hrefs.questions[s.code], count: c.questions }
          : null,
        c.flashcards > 0 && hub.hrefs.flashcards[s.code]
          ? { label: "Flashcards", href: hub.hrefs.flashcards[s.code], count: c.flashcards }
          : null,
      ].filter((x): x is { label: string; href: string; count: number } => x !== null);
      return {
        code: s.code,
        title: s.title,
        total: c.notes + c.questions + c.flashcards,
        links,
      };
    }),
  }));
  const subtopicCount = topicGroups.reduce((a, g) => a + g.subtopics.length, 0);

  const bands: { id: string; title: string; tagline: string; items: ResourceItem[] }[] = [
    {
      id: "ask",
      title: "Ask the tutor",
      tagline:
        "Stuck on a topic? Ask — answers come only from this course's validated material, with citations.",
      items: [
        {
          // The per-course tutor entry (operator instruction 2026-10-21):
          // every course gets a visible Tutor card. `ready` keys on the
          // registry's curriculumCode — the SAME law the /tutor page gates
          // by (ADR-030) — so a mapped course deep-links straight into its
          // own scoped tutor, and an unmapped one shows the honest
          // "not yet connected" state instead of a dead end. Each course's
          // tutor keeps its own history and conversations separately.
          icon: Sparkles,
          title: "Course Tutor",
          desc: meta.curriculumCode
            ? "A chat grounded in this course's specification, revision notes and past papers — every answer cites its sources and says so honestly when the evidence runs thin. Conversations stay separate per course."
            : "Connects once this course has a validated serving corpus — the tutor never answers across courses, so there is no cross-course fallback.",
          tags: ["Study", "Practice"],
          href: meta.curriculumCode ? `/tutor?course=${meta.slug}` : undefined,
          ctaLabel: "Ask the tutor",
          ready: !!meta.curriculumCode,
          notReadyLabel: "not yet connected",
          tint: "bg-primary/10",
        },
      ],
    },
    {
      // T-COURSE-BANDS-1 run-001 (operator plan B, trace 1a192f93789cfe2d):
      // the Exam Practice band split by job — the question surfaces stay
      // here in Practise (banks → papers → adaptive → engagement, the
      // learner journey); the trackers/reference moved to Track & improve.
      id: "practise",
      title: "Practise",
      tagline: "Test yourself with questions, tests and exam papers.",
      items: [
        {
          icon: FileQuestion,
          title: "Exam Questions",
          desc: "Past paper, exam-style and quiz questions with mark schemes and self-marking, organised by topic.",
          tags: ["Practice", "Diagnose"],
          href: `${base}/exam-questions`,
          countLabel: `${fmtCount(stats.questions)} question${stats.questions === 1 ? "" : "s"} · ${fmtCount(stats.questionSets)} set${stats.questionSets === 1 ? "" : "s"}`,
          ready: stats.questions > 0,
          tint: "bg-chart-2/15",
        },
        {
          icon: ScrollText,
          title: "Past Papers",
          desc:
            pastPapers.length > 0
              ? "The questions we hold from real past papers, grouped by session and played back in paper order — partial reconstructions, not the full official papers."
              : "Official question papers and mark schemes streamed from the archive — view them side by side, self-mark, or run a timed mock. Interactive playback lands as papers are parsed.",
          tags: ["Practice", "Diagnose"],
          ready: pastPapers.length > 0 || corpusArchivePapers.length > 0,
          href:
            pastPapers.length > 0 || corpusArchivePapers.length > 0
              ? `${base}/past-papers`
              : undefined,
          countLabel:
            pastPapers.length > 0
              ? `${fmtCount(pastPapers.length)} paper${pastPapers.length === 1 ? "" : "s"} · ${fmtCount(heldQuestions)} question${heldQuestions === 1 ? "" : "s"} held`
              : corpusArchivePapers.length > 0
                ? `${fmtCount(corpusArchivePapers.length)} paper${corpusArchivePapers.length === 1 ? "" : "s"} · official archive`
                : undefined,
          tint: "bg-chart-5/15",
        },
        {
          icon: Files,
          title: "Practice Papers",
          desc: "Full-length mixed papers assembled from this course's question bank — our stand-in for official papers that can't be redistributed. Same questions, same mark schemes.",
          tags: ["Practice", "Diagnose"],
          ready: practicePapers.length > 0,
          href: practicePapers.length > 0 ? `${base}/practice-papers` : undefined,
          countLabel:
            practicePapers.length > 0
              ? `${fmtCount(practicePapers.length)} papers · ${fmtCount(stats.questions)} questions`
              : undefined,
          tint: "bg-chart-1/15",
        },
        {
          icon: Files,
          title: "Mock Exams",
          desc: "Expert-created full practice papers — not available for this course yet.",
          tags: ["Practice", "Diagnose"],
          ready: false,
          tint: "bg-chart-1/15",
        },
        {
          icon: Target,
          title: "Target Test",
          desc: "Custom exam practice to target your weak spots — Phase C of the build plan.",
          tags: ["Practice", "Diagnose"],
          ready: false,
          tint: "bg-chart-2/15",
        },
        {
          // F-186 — the Strength Battle card (operator order, trace
          // 1a192c9d3ddbb92d: the battle surfaced on EVERY course page, as
          // roadmap). `ready` keys on the F-186 rollout law of record
          // (lib/battle-course.ts — the pinned 4CH1 pilot today): the served
          // course gets the live CTA into /practice/battle, every other
          // course keeps the honest roadmap card — the same posture the
          // Target Test / Mock Exams ghosts ride (never a dead CTA).
          icon: Swords,
          title: "Strength Battle",
          desc: battleServedFor(meta.slug)
            ? "Three questions, sixty seconds, head-to-head against the fair-coin sparring bot — the same real bank the drill serves, with the examiner's mark schemes revealed instantly. Zero stakes: battles ride your practice log, never a gradebook."
            : "Three questions, sixty seconds, head-to-head against a sparring bot on the same real exam-question bank — the drill wearing competitive energy, mark schemes revealed instantly. Rolling out course by course.",
          tags: ["Practice", "Diagnose"],
          href: battleServedFor(meta.slug) ? "/practice/battle" : undefined,
          ctaLabel: battleServedFor(meta.slug) ? "Battle the bot" : undefined,
          ready: battleServedFor(meta.slug),
          tint: "bg-primary/10",
        },
      ],
    },
    {
      // T-COURSE-BANDS-1 run-001 (operator plan B): the tracker/reference
      // band the Exam Practice split creates — how you did and what to do
      // next (Mistakes Log) plus the grade reference (Grade Boundaries).
      // The learner journey closes here: practise → track → back into Learn.
      id: "track",
      title: "Track & improve",
      tagline: "See where you're losing marks and what to do next — mistakes, boundaries and progress.",
      items: [
        {
          // T-MLOG-CARD-1 — the Mistakes Log card (operator order, trace
          // 1a192dd3f62f3ebd: the RevisionDojo Mistakes Log feature set
          // surfaced on every course page, as roadmap). No surface exists
          // yet — the card rides the honest roadmap posture (the Target
          // Test / Mock Exams ghosts): no href, no CTA, never a dead link.
          // When the lane lands, flip `ready` here; per-course gating would
          // key a lib law the same way lib/battle-course.ts does.
          // T-COURSE-BANDS-1: relocated from the Exam Practice band — the
          // tracker's home of record is Track & improve.
          icon: NotebookPen,
          title: "Mistakes Log",
          desc: "Every question you get wrong, kept in one place — logged with your answer, filtered by subject, topic and mastery state, then retried with the solution nearby until it sticks.",
          tags: ["Practice", "Diagnose"],
          ready: false,
          tint: "bg-chart-4/15",
        },
        {
          // T-GRADE-1 — the Grade Boundaries card (operator request, trace
          // 1a191d55e2154601: the MathsGenie predicted-grade-calculator
          // feature set). Live only where the official corpus has this
          // course; every other course keeps the honest roadmap card.
          // T-COURSE-BANDS-1: relocated from the Exam Practice band —
          // reference data belongs beside the tracker, not among the
          // question surfaces.
          icon: TrendingUp,
          title: "Grade Boundaries",
          desc: gradeBoundaries
            ? "Official boundaries for every recent session — the trend graph, boundary tables and a mark-to-grade calculator."
            : "Official session-by-session grade boundaries with a trend graph and mark-to-grade calculator — landing with the corpus rollout.",
          tags: ["Practice", "Diagnose"],
          href: gradeBoundaries ? `${base}/grade-boundaries` : undefined,
          ctaLabel: gradeBoundaries ? "See boundaries" : undefined,
          countLabel: gradeBoundaries
            ? `${fmtCount(gradeBoundaries.seriesCount)} session rows`
            : undefined,
          ready: !!gradeBoundaries,
          tint: "bg-chart-3/15",
        },
      ],
    },
    {
      // T-COURSE-BANDS-1 run-001: "Revision" → "Learn" — the content band
      // keeps its inventory and tagline; the name joins the learner loop
      // (learn → practise → track) the band set now tells end to end.
      id: "learn",
      title: "Learn",
      tagline: "Comprehensive content covering your entire exam specification.",
      items: [
        {
          icon: BookOpen,
          title: "Revision Notes",
          desc: officialTree
            ? "Concise, high-quality notes to build your understanding of every topic in the official specification."
            : "Concise, high-quality notes anchored to corpus spec points (official-spec mapping pending upstream).",
          tags: ["Study"],
          href: `${base}/revision-notes`,
          countLabel: `${fmtCount(stats.notes)} note${stats.notes === 1 ? "" : "s"}`,
          ready: stats.notes > 0,
          tint: "bg-chart-2/15",
        },
        {
          // T-MIG-133 band 133k — the books ENTRY (the shelf page is the
          // live T-C20 gate; this card gates on the committed books archive
          // of record, per lib/books-registry.ts — an entry can only ever
          // lead to an honest shelf, never a fabricated book).
          icon: BookMarked,
          title: "Student Book",
          desc: courseHasBookArchive(meta.slug)
            ? "The full student book, chapter by chapter — every chapter opens the book at its own page range, with the same spec joins the tutor grounds in."
            : "The full student book for this course — planned next in the books rollout.",
          tags: ["Study"],
          href: courseHasBookArchive(meta.slug) ? `${base}/books` : undefined,
          ctaLabel: "Open the book",
          ready: courseHasBookArchive(meta.slug),
          tint: "bg-primary/10",
        },
        {
          icon: CircleHelp,
          title: "Flashcards",
          desc: "Interactive digital flashcards that reinforce facts and definitions, imported per subtopic.",
          tags: ["Study", "Practice"],
          href: `${base}/flashcards`,
          countLabel: `${fmtCount(stats.flashcards)} card${stats.flashcards === 1 ? "" : "s"}`,
          ready: stats.flashcards > 0,
          tint: "bg-chart-4/15",
        },
        // Underground Mathematics lane library — flagged + bundled courses
        // only (see the ugm const above); absent otherwise, never a stub.
        ...(ugm
          ? [
              {
                icon: Compass,
                title: "Underground Mathematics",
                desc: `Cambridge's Underground Mathematics (${ugmStationNames(ugm)} collections) — rich problems with suggestions and worked solutions, mapped to this course's specification points (alignment candidates, SUGGESTED).`,
                tags: ["Study", "Practice"] as FrameworkTag[],
                href: `${base}/ugm`,
                countLabel: `${fmtCount(ugm.coverage.aligned)} resources · ${fmtCount(ugm.specPoints.length)} spec points`,
                ready: true,
                tint: "bg-primary/10",
              },
            ]
          : []),
        {
          // R-1 + R-5 (operator trace 1a179c6b53bff529): this card was the
          // stale "Smart Lesson — Phase C of the build plan" roadmap ghost
          // while the guided-lesson corpus is already live (112/112 notes on
          // the promoted integration). It now leads with the canonical name
          // ("Guided lessons" — R-5 unification) and, when the committed
          // guided-import.json exists, flips to the live state with index
          // counts and a path into the per-note guided entries. The gap-first
          // desc mirrors the R-7c picker copy on the lesson surface itself.
          icon: Lightbulb,
          title: "Guided lessons",
          desc: guided
            ? "Pick the concept you don't understand yet — we'll explain it simply, then check your understanding. Any order works."
            : "Step-by-step guided lessons for every revision note — rolling out course by course.",
          tags: ["Study", "Practice", "Diagnose"],
          // Entry-path lanes (b)+(c) (operator decision of record, trace
          // 1a1810c1ef1cb521): the live card now lands on the dedicated
          // guided-lessons index (one hop into any lesson) instead of three
          // hops through the notes listing; not-ready courses keep the
          // honest roadmap.
          href: guided ? `${base}/guided-lessons` : undefined,
          ctaLabel: guided ? "Browse lessons" : undefined,
          countLabel: guided
            ? `Live for ${fmtCount(guided.counts.notes)} notes · ${fmtCount(guided.counts.lessons)} lessons`
            : undefined,
          ready: Boolean(guided),
          tint: "bg-chart-4/15",
        },
      ],
    },
  ];

  const framework = [
    {
      tag: "Study" as FrameworkTag,
      desc: "Start with comprehensive revision material covering all specification content.",
    },
    {
      tag: "Practice" as FrameworkTag,
      desc: "Practise with exam-style questions and flashcards to build your confidence.",
    },
    {
      tag: "Diagnose" as FrameworkTag,
      desc: "Self-marking and strengths views expose your weak spots and guide you to improve.",
    },
  ];

  const resourcesPane = !hub.viaProvider && stats.notes + stats.questions === 0 ? null : (
    <>
      {/* specification card (SME: spec download; SyllabAI: parsed spec deep-link) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCap className="size-4.5 text-primary" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">Specification {meta.code}</p>
              <p className="text-xs text-muted-foreground">
                {officialTree
                  ? "Parsed specification points — the canonical tree powering this hub"
                  : "Corpus spec points (SME-native anchors) — the navigation tree powering this hub; official-code mapping is pending upstream"}
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {fmtCount(stats.specPoints)} spec points
            </Badge>
            <Link
              href={`/courses/${meta.slug}/specification`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ListTree className="size-4" aria-hidden />
              Specification tree
            </Link>
            <Link
              href={`/knowledge-graph?course=${meta.slug}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              View parsed spec <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* the resource bands as MG tile rows */}
      {bands.map((band) => (
        <section key={band.id} aria-label={band.title} className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold tracking-tight">{band.title}</h2>
            <p className="text-sm text-muted-foreground">{band.tagline}</p>
          </div>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {band.items.map((r) => {
              const inner = (
                <>
                  <span
                    className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${r.tint}`}
                    aria-hidden
                  >
                    <r.icon className="size-6 text-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold group-hover:text-primary">{r.title}</span>
                      {r.tags.map((t) => (
                        <TagChip key={t} tag={t} />
                      ))}
                      {!r.ready && (
                        <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">
                          {r.notReadyLabel ?? "roadmap"}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                      {r.desc}
                    </span>
                    {r.ready && (r.countLabel || r.ctaLabel) && (
                      <span className="mt-1 block text-xs font-medium text-foreground">
                        {r.countLabel}
                        {r.ctaLabel && (
                          <span className="ml-2 inline-flex items-center gap-1 text-primary">
                            {r.ctaLabel} <ArrowRight className="size-3.5" aria-hidden />
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </>
              );
              const tileClass =
                "group flex items-start gap-4 rounded-2xl p-2 transition-colors hover:bg-muted";
              return r.ready ? (
                <Link
                  key={r.title}
                  href={r.href ?? base}
                  className={`${tileClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={r.title}
                  aria-disabled
                  title="On the roadmap — not available for this course yet"
                  className={`${tileClass} opacity-70`}
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* SME's "Our revision framework" explainer */}
      <section aria-label="Our revision framework" className="space-y-3 pb-2">
        <h2 className="text-lg font-semibold">Our revision framework</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {framework.map((f) => (
            <Card key={f.tag} className="bg-muted/40">
              <CardContent className="space-y-2 p-4">
                <TagChip tag={f.tag} />
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* structured data (F-08): same honestly composed text as the meta
          description — the registry's own counts, nothing invented */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CourseHeader
        meta={meta}
        activeTab="resources"
        showTabs
        title={meta.subject}
        description={`Tools designed specifically for the ${qual} syllabus (${meta.code}): revision notes, the student book, exam-style questions and flashcards organised around the ${officialTree ? "official specification tree" : "corpus specification tree"} — with provenance kept visible on every item.`}
      >
        {/* SME hero anatomy: "Edexcel | IGCSE | 4CH1" + course switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{boardOf(meta)}</span>
            <span className="mx-2 text-muted-foreground/50">|</span>
            {meta.level}
            <span className="mx-2 text-muted-foreground/50">|</span>
            <span className="font-mono">{meta.code}</span>
          </p>
          <CourseSwitcher current={meta.slug} courses={allCourses.map((c) => ({ slug: c.slug, label: c.label, subject: c.subject, level: c.level, board: boardOf(c) }))} />
        </div>
      </CourseHeader>

      {!hub.viaProvider && stats.notes + stats.questions === 0 ? (
        <Card className="mt-8">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-primary" aria-hidden />
              Content for this course is on its way
            </CardTitle>
            <CardDescription>
              This course is registered and its materials are in preparation — the full hub
              switches on here the moment the content lands. Nothing is faked in the meantime:
              an empty course stays honestly empty.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-relaxed text-muted-foreground">
              When it goes live you get the whole set: the topic-by-topic notes reader, exam
              questions with mark schemes, flashcard decks and past papers — the same surfaces
              already live across the hub.
            </p>
            <p>
              Until then:{" "}
              <Link
                href={`/courses/${pilotSlug ?? ""}`}
                className="font-medium text-primary underline underline-offset-2"
              >
                Edexcel IGCSE Chemistry (4CH1)
              </Link>{" "}
              is fully loaded, or{" "}
              <Link
                href="/courses"
                className="font-medium text-primary underline underline-offset-2"
              >
                browse all {fmtCount(liveCount)} live courses
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <CourseBodyTabs groups={topicGroups} subtopicCount={subtopicCount} resources={resourcesPane} />
      )}
    </div>
  );
}
