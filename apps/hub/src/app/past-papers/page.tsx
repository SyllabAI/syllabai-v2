import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, ScrollText } from "lucide-react";
import { allArchiveSpecs, corpusIndex, type CorpusArchiveSpec } from "@/lib/pastpapers-corpus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import officialLinksJson from "@/data/pastpapers-official-links.json";

export const metadata: Metadata = {
  title: "Past papers archive",
  description:
    "Every specification in the syllabai-pastpapers corpus — Pearson Edexcel and Cambridge International — browsable by qualification and subject.",
};

interface OfficialLinkEntry {
  subject: string;
  qualification: string;
  url: string;
  httpStatus: string;
}
interface OfficialLinksFile {
  meta: {
    generatedAt: string;
    source: string;
    corpusTreeSha: string;
    retrievedAt: string;
    note: string;
  };
  links: Record<string, OfficialLinkEntry>;
}
const OFFICIAL = officialLinksJson as unknown as OfficialLinksFile;

const BOARD_ORDER = ["pearson-edexcel", "cambridge-international"];
const QUAL_ORDER = ["international-gcse", "international-a-level", "gce-a-level", "igcse", "ial"];
const BOARD_LABELS: Record<string, string> = {
  "pearson-edexcel": "Pearson Edexcel",
  "cambridge-international": "Cambridge International",
};
const QUAL_LABELS: Record<string, string> = {
  "international-gcse": "International GCSE",
  "international-a-level": "International A-Level",
  "gce-a-level": "GCE A-Level",
  igcse: "IGCSE",
  ial: "International A-Level",
};

function orderIndex(list: string[], value: string): number {
  const i = list.indexOf(value);
  return i === -1 ? list.length : i;
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
 * Past Papers archive — the corpus-wide directory.
 *
 * The per-course archive (courses/[course]/past-papers) is the rich primary
 * IA, but the corpus holds far more specifications than the hub has courses
 * for (all of Cambridge International, IAL accounting/business/economics/…,
 * GCE modular maths, IGCSE commerce/computer-science/human-biology/…). This
 * directory makes EVERY spec reachable: mapped specs link into their course
 * archive; unmapped specs get a per-spec PDF browser (past-papers/[...key]).
 * Spec families with known archive gaps also deep-link to the official
 * Pearson past-papers page (read-only citation index, docs/ledger/
 * official-links.csv in the corpus repo).
 */
export default function PastPapersArchivePage() {
  const specs = allArchiveSpecs();
  const paperTotal = specs.reduce((n, s) => n + s.paperCount, 0);
  const officialCount = specs.filter((s) => OFFICIAL.links[s.specKey]).length;

  const byBoard = new Map<string, Map<string, Map<string, CorpusArchiveSpec[]>>>();
  for (const s of specs) {
    if (!byBoard.has(s.spec.board)) byBoard.set(s.spec.board, new Map());
    const quals = byBoard.get(s.spec.board)!;
    if (!quals.has(s.spec.qual)) quals.set(s.spec.qual, new Map());
    const subjects = quals.get(s.spec.qual)!;
    if (!subjects.has(s.spec.subject)) subjects.set(s.spec.subject, []);
    subjects.get(s.spec.subject)!.push(s);
  }
  const boards = [...byBoard.keys()].sort(
    (a, b) => orderIndex(BOARD_ORDER, a) - orderIndex(BOARD_ORDER, b) || a.localeCompare(b),
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <PreconnectCorpus />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ScrollText className="size-5 text-primary" aria-hidden />
            Past papers archive
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every specification held in the{" "}
            <span className="font-mono text-xs">syllabai-pastpapers</span> corpus — grouped by
            board, qualification and subject. Specs with a hub course open the full archive
            (mocks, interactive play); the rest open a direct PDF browser.
          </p>
        </div>
        <Badge variant="secondary" className="font-medium">
          {specs.length} specifications · {paperTotal} papers
          {officialCount > 0 ? ` · ${officialCount} with official links` : ""}
        </Badge>
      </div>

      <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground print:hidden">
        <p>
          Official exam documents streamed from the{" "}
          <span className="font-mono text-[11px]">syllabai-pastpapers</span> archive — AI-IDENTIFIED
          provenance, operator ratification pending · index generated{" "}
          {corpusIndex.meta.generatedAt.slice(0, 10)}, tree{" "}
          <span className="font-mono text-[11px]">{corpusIndex.meta.treeSha.slice(0, 7)}</span>.
        </p>
        <p className="mt-1">
          Where the archive has known gaps (cancelled sessions, unpublished mark schemes), the spec
          carries an <span className="font-medium text-foreground">Official source</span> link to
          Pearson&apos;s own past-papers page — retrieved and verified {OFFICIAL.meta.retrievedAt}.
        </p>
      </div>

      <div className="mt-6 space-y-8">
        {boards.map((board) => {
          const quals = byBoard.get(board)!;
          const qualKeys = [...quals.keys()].sort(
            (a, b) => orderIndex(QUAL_ORDER, a) - orderIndex(QUAL_ORDER, b) || a.localeCompare(b),
          );
          return (
            <section key={board} aria-label={BOARD_LABELS[board] ?? board} className="space-y-5">
              <h2 className="text-base font-bold tracking-tight">{BOARD_LABELS[board] ?? board}</h2>
              {qualKeys.map((qual) => {
                const subjects = quals.get(qual)!;
                const subjectKeys = [...subjects.keys()].sort((a, b) => a.localeCompare(b));
                return (
                  <div key={qual} className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {QUAL_LABELS[qual] ?? qual}
                    </h3>
                    {subjectKeys.map((subject) => {
                      const rows = subjects
                        .get(subject)!
                        .sort((a, b) => a.specKey.localeCompare(b.specKey));
                      return (
                        <ul key={subject} className="overflow-hidden rounded-xl border">
                          {rows.map((s) => (
                            <SpecRow key={s.specKey} s={s} />
                          ))}
                        </ul>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SpecRow({ s }: { s: CorpusArchiveSpec }) {
  const official = OFFICIAL.links[s.specKey];
  return (
    <li className="border-b last:border-b-0 transition-colors hover:bg-muted/50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1 basis-52">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold">{s.spec.spec.toUpperCase()}</span>
            <span className="text-sm">{s.spec.subject}</span>
            {s.courseSlug && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                hub course
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {s.paperCount} paper{s.paperCount === 1 ? "" : "s"} · {s.sessionCount} session
            {s.sessionCount === 1 ? "" : "s"}
            {s.courseSlug ? " · mocks + interactive in the hub archive" : " · direct PDF browsing"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {s.courseSlug && (
            <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
              <Link href={`/courses/${s.courseSlug}/past-papers`}>
                Open archive
                <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          )}
          <Button
            asChild
            size="sm"
            variant={s.courseSlug ? "outline" : "secondary"}
            className="h-7 text-xs"
          >
            <Link href={`/past-papers/${s.specKey}`}>Browse PDFs</Link>
          </Button>
          {official && (
            <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
              <a
                href={official.url}
                target="_blank"
                rel="noreferrer noopener"
                title={`Official Pearson past-papers page (verified HTTP ${official.httpStatus}, retrieved ${OFFICIAL.meta.retrievedAt}) — use it for sessions missing from this archive`}
              >
                Official source
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
