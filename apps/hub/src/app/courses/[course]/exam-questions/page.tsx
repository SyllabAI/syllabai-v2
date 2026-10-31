import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronDown, FileQuestion, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { boardOf, getCourseBundle, loadHubCourse } from "@/lib/courses";
import { getDataProvider } from "@/lib/data";
import { CourseHeader } from "@/components/hub/course-header";
import { NumberedLabel } from "@/components/hub/chrome";
import { AddToTestLink } from "@/components/teacher/add-to-test-link";
import { ProgressRing } from "@/components/hub/progress-ring";
import type { Course } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** "1C" → "Paper 1C"; full paper codes (4MA1/1F) pass through verbatim. */
function paperLabel(p: string): string {
  return p.length <= 4 ? `Paper ${p}` : p;
}

const ZERO = { notes: 0, questions: 0, flashcards: 0 };

/**
 * Questionbank index (trace 1a19342adcb572ed — the RevisionDojo-pattern
 * redesign, operator-approved recommendations): one narrow centered column
 * of numbered topic sections (native <details>, no JS); each row is a
 * SUB-TOPIC — progress ring (the same primitives as the sidebar topic-tree:
 * ProgressRing over the real learner overlay) + corpus-native label + title
 * + a right-aligned question count — clicking through to the sub-topic's
 * canonical set (first set in corpus order, the same target the sidebar and
 * tree expander use). Sub-topics served by more than one set (MCQ vs
 * structured variants — 64 of 106 courses) expose a chevron that expands
 * every set with per-set counts, so nothing becomes unreachable; sets with
 * no sub-topic home (52 courses) stay listed under "Other sets".
 *
 * T-KG-17: `?paper=` scopes the bank to sets whose anchored spec points are
 * assessed in that paper — row and topic counts recompute per scope, and the
 * row target follows the first in-scope set.
 *
 * UX audit 2026-10-02 #20: `?q=<partId>` search deep links resolve to the
 * question set and redirect there (unresolvable q renders the index);
 * legacy `?spec=` links jump to the set that anchors the spec point.
 */
export default async function ExamQuestionsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<{ spec?: string; paper?: string; q?: string }>;
}) {
  const { course: slug } = await params;
  const { spec, paper, q } = await searchParams;
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

  // legacy deep links used ?spec=4CH1-1.1 — jump straight to the set that
  // anchors that spec point when it has one canonical home
  const specSubtopic = spec ? hub.index.subtopicOfSpecPoint.get(spec) ?? null : null;
  const specSets = specSubtopic ? hub.setsBySubtopic[specSubtopic] ?? [] : [];
  if (spec && specSets.length > 0) {
    redirect(`/courses/${meta.slug}/exam-questions/${specSets[0]}`);
  }
  const base = `/courses/${meta.slug}`;

  const inScope = (setSlug: string) =>
    !paperActive || (setPapers.get(setSlug)?.has(paperActive) ?? false);

  // Sub-topic granularity of record: every set is listed under its canonical
  // sub-topic (subtopicOfQuestionSet — the same law that feeds the sidebar's
  // setsBySubtopic / setListsBySubtopic / hrefs.questions), so row counts
  // here always agree with the sidebar. Counts are whole-set question counts
  // (resourceCounts bumps t.questions.length to the canonical home), summed
  // over the in-scope sets so a paper filter rescales rows honestly.
  const rows = hub.index.tree.topics
    .map((topic) => {
      const subs = topic.subtopics
        .map((sub) => {
          const sets = (hub.setListsBySubtopic[sub.code] ?? []).filter((s) => inScope(s.slug));
          return { sub, sets, count: sets.reduce((a, s) => a + s.count, 0) };
        })
        .filter((r) => r.count > 0);
      return { topic, subs, total: subs.reduce((a, r) => a + r.count, 0) };
    })
    .filter((g) => g.subs.length > 0);

  // sets whose canonical home resolved to nothing — never listed under any
  // sub-topic — keep the honest "Other sets" section
  const placed = new Set(
    Object.values(hub.setListsBySubtopic).flatMap((sets) => sets.map((s) => s.slug)),
  );
  const unplaced = hub.questionTopics
    .filter((t) => !placed.has(t.slug))
    .filter((t) => inScope(t.slug));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <CourseHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Exam Questions`}
        crumb="Exam Questions"
        description={`Choose a topic to practise exam-style questions — ${stats.questions} questions across ${stats.questionSets} sets, with parts, command words, mark schemes and self-marking.`}
      />

      {paperOptions.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-3 py-2.5">
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

      <div className="mt-6 divide-y divide-border/60">
        {rows.map(({ topic, subs, total }) => (
          <details key={topic.code} open className="group/topic py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <h2 className="text-[15px] font-semibold">
                <NumberedLabel number={topic.number} title={topic.title} />
              </h2>
              <span className="text-xs text-muted-foreground">
                ·{" "}
                {total} question{total === 1 ? "" : "s"}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <AddToTestLink courseSlug={meta.slug} codes={topic.subtopics.map((s) => s.code)} />
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open/topic:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>
            <ul className="mt-1.5 space-y-0.5">
              {subs.map(({ sub, sets, count }) => {
                const countsK = hub.counts[sub.code] ?? ZERO;
                const gen = sub.code.endsWith("-gen");
                const label = !gen && sub.label ? (
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {sub.label}
                  </span>
                ) : null;
                const rowInner = (
                  <>
                    <ProgressRing
                      course={meta.slug as Course}
                      subtopic={sub.code}
                      counts={countsK}
                      size={18}
                    />
                    {label}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover/link:text-primary">
                      {sub.title}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {count} question{count === 1 ? "" : "s"}
                    </span>
                  </>
                );
                if (sets.length === 1) {
                  return (
                    <li key={sub.code}>
                      <Link
                        href={`${base}/exam-questions/${sets[0].slug}`}
                        className="group/link flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                      >
                        {rowInner}
                      </Link>
                    </li>
                  );
                }
                // multi-set sub-topic (MCQ vs structured variants): the row
                // still navigates to the canonical set; the chevron expands
                // every set so nothing becomes unreachable (sidebar parity —
                // the tree expander lists the same per-set entries)
                return (
                  <li key={sub.code}>
                    <details className="group/sub">
                      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
                        <Link
                          href={`${base}/exam-questions/${sets[0].slug}`}
                          className="group/link flex min-w-0 flex-1 items-center gap-2.5"
                        >
                          {rowInner}
                        </Link>
                        <ChevronDown
                          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/sub:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <ul className="ml-9 mt-0.5 space-y-0.5 border-l pl-2">
                        {sets.map((s) => (
                          <li key={s.slug}>
                            <Link
                              href={`${base}/exam-questions/${s.slug}`}
                              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <span className="min-w-0 truncate">{s.title}</span>
                              <span className="shrink-0 tabular-nums">
                                {s.count} question{s.count === 1 ? "" : "s"}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}

        {unplaced.length > 0 && (
          <section aria-label="Other sets" className="py-3">
            <h2 className="text-[15px] font-semibold">Other sets</h2>
            <ul className="mt-1.5 space-y-0.5">
              {unplaced.map((set) => (
                <li key={set.slug}>
                  <Link
                    href={`${base}/exam-questions/${set.slug}`}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                  >
                    <FileQuestion className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
                      {set.name}
                      {set.setName ? ` — ${set.setName}` : ""}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {set.questions.length} question{set.questions.length === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {rows.length === 0 && unplaced.length === 0 && (
        <Card className="mt-6">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {paperActive ? (
              <>
                No imported question sets are anchored to spec points assessed in{" "}
                <span className="font-medium text-foreground">{paperLabelOf(paperActive)}</span> yet
                — the corpus currently covers other papers for this course.{" "}
                <Link href={`${base}/exam-questions`} className="underline hover:text-foreground">
                  Clear the paper scope
                </Link>
                .
              </>
            ) : (
              "No question sets imported for this course yet."
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
