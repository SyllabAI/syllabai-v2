import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ScrollText } from "lucide-react";
import { boardOf, loadHubCourse } from "@/lib/courses";
import { collectPastPapers, paperEstTime, type PastPaper } from "@/lib/past-papers";
import { corpusViewerUrl } from "@/lib/pastpapers-shared";
import { fmtCount } from "@/lib/format";
import { SessionBrowser, type SessionBrowserGroup } from "@/components/pastpapers/session-browser";
import {
  corpusPapersForCourse,
  corpusSpecsForCourse,
  doubleAwardScopeNote,
  groupBySession,
  prettyBytes,
  sessionLabel,
  type CorpusPaperEntry,
} from "@/lib/pastpapers-corpus";
import {
  matchReconstructions,
  computeCoverage,
  coverageChipLabel,
  coverageTitle,
  blueprintFor,
  type ReconstructionCoverage,
} from "@/lib/pastpapers-reconstruction";
import { CoursePageHeader } from "@/components/hub/course-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MockResultsStrip } from "@/components/pastpapers/mock-results-strip";
import { allCourseParams } from "@/lib/static-params";

/** The row's composed meta line, verbatim from the pre-lane row markup. */
function paperMeta(p: CorpusPaperEntry): string {
  return [
    p.specTitle,
    p.durationMin != null
      ? `${Math.floor(p.durationMin / 60)}h${p.durationMin % 60 ? ` ${p.durationMin % 60}m` : ""} official`
      : "",
    p.qpBytes ? `QP ${prettyBytes(p.qpBytes)}` : "",
    p.msBytes ? `MS ${prettyBytes(p.msBytes)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** PDFs stream from raw.githubusercontent.com — warm the connection early. */
function PreconnectCorpus() {
  return (
    <>
      <link rel="preconnect" href="https://raw.githubusercontent.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://raw.githubusercontent.com" />
    </>
  );
}

/**
 * Past Papers — the student archive (SME-style), built on the
 * syllabai-pastpapers corpus.
 *
 *   Mode 1 · Papers   — every corpus paper grouped by session (SME layout):
 *                       QP / MS / Split into the mobile-first pdf.js viewer,
 *                       plus timed Mock runs graded against the MS.
 *   Mode 2 · Interactive — where the parsed question corpus attests a paper
 *                       (sourcePaper provenance) the row links into the real
 *                       Exam-Questions player; everything else shows an
 *                       honest "not parsed yet" roadmap chip.
 *
 * Honesty: corpus PDFs are AI-IDENTIFIED (operator ratification pending);
 * the index is derived from the canonical corpus layout. Papers exist here
 * ONLY because the archive holds them.
 */

/** Prerendered at build (ADR-021 perf pass, tranche 4.12) — see static-params.ts. */
export async function generateStaticParams() {
  return allCourseParams();
}
export default async function PastPapersPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: slug } = await params;
  const hub = await loadHubCourse(slug);
  if (!hub) notFound();

  const { meta } = hub;
  const base = `/courses/${meta.slug}`;

  // Mode 1 — the PDF archive
  const papers = corpusPapersForCourse(slug);
  const sessions = groupBySession(papers);
  const specMap = corpusSpecsForCourse(slug);

  // Mode 2 — interactive reconstructions from the parsed question corpus.
  // The corpus attests papers in FIVE different metadata shapes (verified by
  // walking questions.json across courses); matchReconstruction normalises
  // each into (session ids, unit, variant) to match corpus rows.
  // OFFICIAL-PLANE-ONLY LAW (operator order 2026-10-25, trace
  // 1a17e79bb0e50399, "disappear entirely"): reconstructions are built from
  // the official parsed plane (officialPaperTopics, ADR-037) ALONE. The SME
  // exam-questions bank NEVER builds an Interactive paper — its sourcePaper
  // refs are topic-question citations, not full-paper parses, and grouping
  // them into pseudo-papers misrepresented unparsed courses as interactive.
  // Courses without the official plane get NO Interactive surface at all
  // (no reconstructions, no playable badges, no Interactive chips); their
  // Exam Questions bank stays exactly as-is on its own surface.
  const parsedCourse = hub.officialPaperTopics.length > 0;
  const reconstructions = collectPastPapers(hub.officialPaperTopics);
  const { matchKeys, matchedReconKeys, reconForCorpus } = matchReconstructions(
    papers,
    reconstructions,
  );
  // coverage per matched row — official per-question totals (extracted from
  // the corpus QP PDFs at build time) vs what the parsed corpus holds.
  const coverages = new Map<string, ReconstructionCoverage | null>();
  for (const [corpusKey, recon] of reconForCorpus) {
    coverages.set(corpusKey, computeCoverage(recon, blueprintFor(corpusKey)));
  }
  const interactiveCount = matchKeys.size;
  // reconstructions with NO corpus PDF counterpart keep their own archive list
  const unmatchedReconstructions = reconstructions.filter((r) => !matchedReconKeys.has(r.key));
  // of those, the ones whose provenance provably pins a paper OUTSIDE the
  // qualification's assessed set (2-series surfacing decision) get a chip +
  // note instead of an unexplained absence
  const scopeNotes = new Map<string, { label: string; note: string }>();
  for (const r of unmatchedReconstructions) {
    const note = doubleAwardScopeNote(slug, r.date, r.number);
    if (note) scopeNotes.set(r.key, note);
  }

  const specNote =
    specMap == null
      ? "This course's past papers haven't been added yet."
      : undefined;

  // t-pastpapers-ux-1 — the archive's JSON-safe findability payload: the row
  // JSX moved verbatim into <SessionBrowser/> (client), the data stays here.
  const browserGroups: SessionBrowserGroup[] = sessions.map(([sessionId, group]) => ({
    sessionId,
    label: sessionLabel(sessionId),
    rows: group.map((p) => ({
      dir: p.dir,
      ref: p.ref,
      title: p.title,
      meta: paperMeta(p),
      specBadge: p.specBadge ?? null,
      variantChip: p.variantChip ?? null,
      playable: matchKeys.has(`${p.sessionId}:${p.dir}`),
      marks: { paperCode: p.ref, sessionLabel: sessionLabel(p.sessionId) },
      qp: p.qpBytes
        ? {
            href: `${base}/past-papers/view/${p.sessionId}/${p.dir}?doc=qp`,
            pdfUrl: corpusViewerUrl(p.qpPath),
          }
        : null,
      ms: p.msBytes
        ? {
            href: `${base}/past-papers/view/${p.sessionId}/${p.dir}?doc=ms`,
            pdfUrl: corpusViewerUrl(p.msPath),
          }
        : null,
      split:
        p.qpBytes && p.msBytes
          ? `${base}/past-papers/view/${p.sessionId}/${p.dir}?doc=split`
          : null,
      mock: p.qpBytes ? `${base}/past-papers/view/${p.sessionId}/${p.dir}?mode=mock` : null,
      interactive: parsedCourse
        ? {
            href: matchKeys.get(`${p.sessionId}:${p.dir}`)
              ? `${base}/past-papers/${matchKeys.get(`${p.sessionId}:${p.dir}`)}`
              : null,
            coverageLabel: coverageChipLabel(coverages.get(`${p.sessionId}:${p.dir}`) ?? null),
            coverageTitle: coverages.get(`${p.sessionId}:${p.dir}`)
              ? coverageTitle(coverages.get(`${p.sessionId}:${p.dir}`)!)
              : null,
          }
        : null,
    })),
  }));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <PreconnectCorpus />
      <CoursePageHeader
        meta={meta}
        title={`${boardOf(meta)} ${meta.level} ${meta.label} Past Papers`}
        crumb="Past Papers"
        description="Official past papers by session — open the QP and MS, self-mark, or run a timed mock."
      >
        {papers.length > 0 && (
          <Badge variant="secondary" className="font-medium">
            {fmtCount(papers.length)} papers · {fmtCount(sessions.length)} session{sessions.length === 1 ? "" : "s"}
            {interactiveCount > 0 ? ` · ${fmtCount(interactiveCount)} interactive` : ""}
          </Badge>
        )}
      </CoursePageHeader>

      {papers.length === 0 ? (
        <div className="mt-6 space-y-4">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ScrollText className="size-4 text-primary" aria-hidden />
                No past papers mapped for this course yet.
              </p>
              <p className="text-sm text-muted-foreground">
                {specNote ??
                  "We don't have past papers for this course yet. You can still practise by topic, or try the practice papers."}
              </p>
              <div className="flex flex-wrap gap-2 text-sm font-semibold text-primary">
                <Link href={`${base}/exam-questions`} className="hover:underline">
                  Browse topic questions →
                </Link>
                <Link href={`${base}/practice-papers`} className="hover:underline">
                  Practice Papers →
                </Link>
              </div>
            </CardContent>
          </Card>
          {unmatchedReconstructions.length > 0 && (
            <ReconstructionArchive base={base} papers={unmatchedReconstructions} notes={scopeNotes} />
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {/* provenance / modes banner — compacted (t-pastpapers-ux-1 U4:
              the 375px first screen must reach the paper rows) */}
          <div className="rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground print:hidden">
            <p>
              <span className="font-semibold text-foreground">Two ways to use a paper:</span> open
              the <span className="font-medium text-foreground">Question Paper</span> and{" "}
              <span className="font-medium text-foreground">Mark Scheme</span> PDFs and self-mark,
              or run a <span className="font-medium text-foreground">Mock</span>. Official
              documents, matched to this course.
            </p>
          </div>

          <MockResultsStrip course={meta.slug} />

          {/* t-pastpapers-ux-1 — the SME-style session sections moved into
              the client SessionBrowser: filter, sticky jump chips,
              collapsible groups; deliberately NO pagination (find-in-page
              preserved whole-corpus; collapsed groups stay in the DOM). */}
          <SessionBrowser groups={browserGroups} interactiveCount={interactiveCount} />

          {/* reconstructions with no PDF counterpart keep their honest archive */}
          {unmatchedReconstructions.length > 0 && (
            <ReconstructionArchive base={base} papers={unmatchedReconstructions} notes={scopeNotes} />
          )}
        </div>
      )}
    </div>
  );
}

/** Archive of interactive reconstructions that have no PDF counterpart. */
function ReconstructionArchive({
  base,
  papers,
  notes,
}: {
  base: string;
  papers: PastPaper[];
  notes: Map<string, { label: string; note: string }>;
}) {
  return (
    <section aria-label="Interactive reconstructions" className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Interactive reconstructions
        {/* t-ui-polish run-002 — same session-count recipe as above. */}
        <span className="font-normal text-muted-foreground"> · {fmtCount(papers.length)}</span>
      </h2>
      <p className="text-xs text-muted-foreground">
        Papers the question corpus has parsed (partial reconstructions — the questions we hold, in
        paper order). These predate the PDF archive and stay playable here.
      </p>
      <ul className="overflow-hidden rounded-xl border">
        {papers.map((p, i) => {
          const scope = notes.get(p.key);
          return (
            <li key={p.key} className={i > 0 ? "border-t" : undefined}>
              <Link
                href={`${base}/past-papers/${p.key}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold">{p.number}</span>
                    {scope && (
                      <Badge
                        variant="outline"
                        className="text-2xs text-muted-foreground"
                        title={scope.note}
                      >
                        {scope.label}
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {p.date} · {fmtCount(p.questions.length)} question{p.questions.length === 1 ? "" : "s"} ·{" "}
                    {fmtCount(p.totalMarks)} marks · {paperEstTime(p.totalMarks)}
                  </span>
                  {scope && (
                    <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground/80">
                      {scope.note}
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
