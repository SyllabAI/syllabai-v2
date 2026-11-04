import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Filter } from "lucide-react";
import { boardOf, getCourseBundle, loadHubCourse } from "@/lib/courses";
import { getDataProvider } from "@/lib/data";
import { CourseHeader } from "@/components/hub/course-header";
import { QuestionbankIndex, type QbLooseSet, type QbTopic } from "./questionbank-index";
import type { Course } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** "1C" → "Paper 1C"; full paper codes (4MA1/1F) pass through verbatim. */
function paperLabel(p: string): string {
  return p.length <= 4 ? `Paper ${p}` : p;
}

/**
 * Questionbank index (trace 1a19342adcb572ed — the RevisionDojo-pattern
 * redesign, operator-approved recommendations): one narrow centered column
 * of numbered topic sections (native <details>, no JS); each row is a
 * SUB-TOPIC — progress ring (the same primitives as the sidebar topic-tree:
 * ProgressRing over the real learner overlay) + corpus-native label + title
 * + a right-aligned question count — clicking through per the row-link law
 * (SME selector audit D3): single-set rows open the set; multi-set rows land
 * on the grouped ?subtopic= view that holds every counted question (the
 * chevron still expands every set inline, so nothing becomes unreachable);
 * sets with no sub-topic home stay listed under "Other sets".
 *
 * T-KG-17: `?paper=` scopes the bank to sets whose anchored spec points are
 * assessed in that paper — row and topic counts recompute per scope, and the
 * row target follows the first in-scope set.
 *
 * UX audit 2026-10-02 #20: `?q=<partId>` search deep links resolve to the
 * question set and redirect there (unresolvable q renders the index);
 * legacy `?spec=` links jump to the set that anchors the spec point.
 *
 * Ring semantics of record (operator traces 1a195fd0b0947695 +
 * 1a1982281a3d7a65): this select page's rows carry the QUESTIONS-ONLY ring
 * — answered parts ÷ available questions, never notes, never flashcards —
 * each select page owns its own denominator (the revision-notes page counts
 * reads, the flashcards page rates cards; the combined engagement ring
 * stays the sidebar's posture).
 *
 * The listing itself renders in questionbank-index.tsx (client) since trace
 * 1a19acb6ec437e25: it joined the revision-notes index's MathsGenie toolbar
 * treatment — search left, Resume (the most recently scored set) right —
 * which needs the learner overlay; the server page keeps the redirect and
 * paper-scope laws and hands the client a slim, serializable row payload.
 */
export default async function ExamQuestionsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<{ spec?: string; paper?: string; q?: string; subtopic?: string }>;
}) {
  const { course: slug } = await params;
  const { spec, paper, q, subtopic: subtopicParam } = await searchParams;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();
  const { meta, stats } = hub;

  // UX audit 2026-10-02 #20: search results (lib/ai/retrieval.ts) emit
  // /exam-questions?q=<partId> deep links — the index ignored ?q= entirely,
  // landing every search hit on the unfiltered bank. Resolve the part to its
  // question set and redirect there; an unresolvable q renders the index.
  if (q) {
    const topicWithPart = hub.questionTopics.find((t) =>
      t.questions.some((x) => x.parts.some((p) => p.id === q)),
    );
    if (topicWithPart) {
      redirect(`/courses/${meta.slug}/exam-questions/${topicWithPart.slug}`);
    }
  }

  // spec-point → papers (+ coursework pseudo-tag) for the part-level join
  const bundle = await getCourseBundle(slug);
  const curriculum =
    bundle?.curriculum ?? (hub.viaProvider ? await getDataProvider().curriculum() : null);
  const appByCode = new Map(
    (curriculum?.nodes ?? [])
      .filter((n) => n.family === "SPEC_POINT" && n.applicability)
      .map((n) => [n.code, n.applicability!]),
  );
  const COURSEWORK = "__coursework__";
  const papersOfSet = (setSlug: string): Set<string> => {
    const out = new Set<string>();
    const set = hub.questionTopics.find((t) => t.slug === setSlug);
    for (const q of set?.questions ?? [])
      for (const p of q.parts) {
        for (const c of p.specPointCodes ?? []) {
          const a = appByCode.get(c);
          if (!a) continue;
          for (const x of a.papers ?? []) out.add(x);
          if ((a.papers ?? []).length === 0 && a.coursework) out.add(COURSEWORK);
        }
      }
    return out;
  };
  const setPapers = new Map(hub.questionTopics.map((t) => [t.slug, papersOfSet(t.slug)]));

  const paperOptions = [...new Set([...setPapers.values()].flatMap((s) => [...s]))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );
  const paperLabelOf = (p: string) => (p === COURSEWORK ? "Coursework" : paperLabel(p));
  const paperActive = paper ?? null;

  // legacy deep links used ?spec=4CH1-1.1 — jump to the sub-topic's home with
  // the same row-link law as everywhere else: a single canonical set opens
  // directly; several sets land on the grouped ?subtopic= view (never just
  // the first in corpus order — the row-link policy, SME selector audit D3)
  const specSubtopic = spec ? hub.index.subtopicOfSpecPoint.get(spec) ?? null : null;
  const specSets = specSubtopic ? hub.setsBySubtopic[specSubtopic] ?? [] : [];
  if (spec && specSets.length === 1) {
    redirect(`/courses/${meta.slug}/exam-questions/${specSets[0]}`);
  }
  if (spec && specSets.length > 1) {
    redirect(
      `/courses/${meta.slug}/exam-questions?subtopic=${encodeURIComponent(specSubtopic!)}`,
    );
  }
  const base = `/courses/${meta.slug}`;

  const inScope = (setSlug: string) =>
    !paperActive || (setPapers.get(setSlug)?.has(paperActive) ?? false);

  // Row-link-policy landing (SME selector audit, D3): multi-set sidebar and
  // index rows point here with ?subtopic= — a scoped view that holds every
  // question the row's aggregate count promised. Unknown codes degrade to
  // the full index.
  const scopedCode =
    subtopicParam && hub.index.subtopicByCode.has(subtopicParam) ? subtopicParam : null;
  const scopedSub = scopedCode ? hub.index.subtopicByCode.get(scopedCode)! : null;
  const scopedTopic = scopedSub ? hub.index.topicByCode.get(scopedSub.topicCode) ?? null : null;

  // Sub-topic granularity of record: every set is listed under its canonical
  // sub-topic (subtopicOfQuestionSet — the same law that feeds the sidebar's
  // setsBySubtopic / setListsBySubtopic / hrefs.questions), so row counts
  // here always agree with the sidebar. Counts are whole-set question counts
  // (resourceCounts bumps t.questions.length to the canonical home), summed
  // over the in-scope sets so a paper filter rescales rows honestly.
  // Slim, serializable payload for the client listing (questionbank-index).
  const allRows: QbTopic[] = hub.index.tree.topics
    .map((topic) => {
      const subs = topic.subtopics
        .map((sub) => {
          const sets = (hub.setListsBySubtopic[sub.code] ?? []).filter((s) => inScope(s.slug));
          // the same whole-set count sum the old inline render used — a
          // sub-topic whose in-scope sets hold zero questions stays dropped
          const count = sets.reduce((a, s) => a + s.count, 0);
          return {
            code: sub.code,
            label: sub.code.endsWith("-gen") ? null : sub.label || null,
            title: sub.title,
            sets,
            count,
          };
        })
        .filter((r) => r.count > 0);
      return { code: topic.code, number: topic.number, title: topic.title, subs };
    })
    .filter((g) => g.subs.length > 0);
  // scoped landing: only the scoped sub-topic's row, under its own topic
  const rows: QbTopic[] = scopedCode
    ? allRows
        .filter((t) => t.code === scopedTopic?.code)
        .map((t) => ({ ...t, subs: t.subs.filter((s) => s.code === scopedCode) }))
        .filter((t) => t.subs.length > 0)
    : allRows;

  // sets whose canonical home resolved to nothing — never listed under any
  // sub-topic — keep the honest "Other sets" section
  const placed = new Set(
    Object.values(hub.setListsBySubtopic).flatMap((sets) => sets.map((s) => s.slug)),
  );
  const unplaced: QbLooseSet[] = scopedCode
    ? []
    : hub.questionTopics
        .filter((t) => !placed.has(t.slug))
        .filter((t) => inScope(t.slug))
        .map((t) => ({ slug: t.slug, title: t.setName ? `${t.name} — ${t.setName}` : t.name, count: t.questions.length }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <CourseHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Exam Questions`}
        crumb="Exam Questions"
        description={`Choose a topic to practise exam-style questions — ${stats.questions} questions across ${stats.questionSets} sets, with parts, command words, mark schemes and self-marking.`}
      />

      {paperOptions.length > 1 && (
        /* t-ui-polish run-004: hero→body join at the mt-6 family rhythm
            (was mt-4 — the only join on this page off the constant). */
        <div className="mt-6 flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-3 py-2.5">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="size-3.5" aria-hidden />
            Assessed in
          </span>
          <Link
            href={`${base}/exam-questions`}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              paperActive === null
                ? "border-primary/40 bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            All papers
          </Link>
          {paperOptions.map((p) => (
            <Link
              key={p}
              href={`${base}/exam-questions?paper=${encodeURIComponent(p)}`}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                paperActive === p
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {paperLabelOf(p)}
            </Link>
          ))}
        </div>
      )}

      {/* MathsGenie toolbar + listing + Other sets + empty states — client
          (questionbank-index) over the slim payload above. When a paper
          scope empties the bank, the scoped empty card renders client-side
          with the same copy (paperLabel carries the active label). */}
      <QuestionbankIndex
        course={meta.slug as Course}
        counts={hub.counts}
        rows={rows}
        unplaced={unplaced}
        paperLabel={paperActive ? paperLabelOf(paperActive) : null}
        scoped={!!scopedCode}
        scopedTopicTitle={scopedTopic?.title ?? null}
        scopedTopicNumber={scopedTopic?.number ?? null}
      />
    </div>
  );
}
