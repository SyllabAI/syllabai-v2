import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, ScrollText } from "lucide-react";
import {
  allArchiveSpecs,
  archivePapersForSpec,
  corpusIndex,
  corpusRawUrl,
  courseForSpec,
} from "@/lib/pastpapers-corpus";
import {
  groupBySession,
  prettyBytes,
  sessionLabel,
  specTitle,
} from "@/lib/pastpapers-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import officialLinksJson from "@/data/pastpapers-official-links.json";

interface OfficialLinkEntry {
  subject: string;
  qualification: string;
  url: string;
  httpStatus: string;
}
interface OfficialLinksFile {
  meta: { retrievedAt: string };
  links: Record<string, OfficialLinkEntry>;
}
const OFFICIAL = officialLinksJson as unknown as OfficialLinksFile;

/** Prerendered at build for every spec the corpus holds — nothing dynamic. */
export async function generateStaticParams() {
  return allArchiveSpecs().map((s) => ({ key: s.specKey.split("/") }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string[] }>;
}): Promise<Metadata> {
  const { key } = await params;
  const spec = corpusIndex.specs[key.join("/")];
  return { title: spec ? `${specTitle(spec)} — past papers` : "Past papers archive" };
}

/**
 * Per-spec archive browser — direct QP / MS / ER PDF access for any
 * specification in the corpus, including the 44 specs with no hub course
 * (Cambridge International, IAL accounting/business/economics/…, IGCSE
 * commerce/computer-science/human-biology/…). PDFs stream straight from the
 * public corpus repo; no interactive player or mock is promised here — those
 * live in the hub courses' archives where the parsed question corpus attests
 * them.
 */
export default async function SpecArchivePage({
  params,
}: {
  params: Promise<{ key: string[] }>;
}) {
  const { key } = await params;
  const specKey = key.join("/");
  const spec = corpusIndex.specs[specKey];
  if (!spec) notFound();

  const papers = archivePapersForSpec(specKey);
  const sessions = groupBySession(papers);
  const courseSlug = courseForSpec(specKey);
  const official = OFFICIAL.links[specKey];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <link rel="preconnect" href="https://raw.githubusercontent.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://raw.githubusercontent.com" />

      <Link
        href="/past-papers"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All specifications
      </Link>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight">
            <ScrollText className="size-5 text-primary" aria-hidden />
            {specTitle(spec)}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono text-[11px]">{specKey}</span>
          </p>
        </div>
        <Badge variant="secondary" className="font-medium">
          {papers.length} papers · {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {courseSlug && (
          <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
            <Link href={`/courses/${courseSlug}/past-papers`}>
              <FileText className="size-3.5" aria-hidden />
              Open hub archive (mocks + interactive)
            </Link>
          </Button>
        )}
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

      <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground print:hidden">
        <p>
          Official exam documents streamed from the{" "}
          <span className="font-mono text-[11px]">syllabai-pastpapers</span> archive
          (AI-IDENTIFIED provenance, operator ratification pending · index generated{" "}
          {corpusIndex.meta.generatedAt.slice(0, 10)}, tree{" "}
          <span className="font-mono text-[11px]">{corpusIndex.meta.treeSha.slice(0, 7)}</span>).
          QP = question paper, MS = mark scheme, ER = examiner report.
        </p>
        {!courseSlug && (
          <p className="mt-1">
            This specification has no hub course yet, so papers open as direct PDFs — timed mocks
            and interactive play arrive with the course.
            {official
              ? " Sessions missing from the archive (cancelled or unpublished) remain available on the official Pearson page above."
              : ""}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-5">
        {sessions.map(([sessionId, group]) => (
          <section key={sessionId} aria-label={sessionLabel(sessionId)} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {sessionLabel(sessionId)}
            </h2>
            <ul className="overflow-hidden rounded-xl border">
              {group.map((p) => (
                <li
                  key={p.dir}
                  className="border-b last:border-b-0 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                    <div className="min-w-0 flex-1 basis-52">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm font-semibold">{p.ref}</span>
                        <span className="text-xs text-muted-foreground">{p.title}</span>
                        {p.specBadge && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {p.specBadge}
                          </Badge>
                        )}
                        {p.variantChip && (
                          <Badge variant="outline" className="text-[10px]">
                            {p.variantChip}
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.qpBytes ? `QP ${prettyBytes(p.qpBytes)}` : "no QP held"}
                        {p.msBytes ? ` · MS ${prettyBytes(p.msBytes)}` : " · no MS held"}
                        {p.erBytes ? ` · ER ${prettyBytes(p.erBytes)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PdfChip
                        label="Question Paper"
                        short="QP"
                        href={p.qpBytes ? corpusRawUrl(p.qpPath) : null}
                      />
                      <PdfChip
                        label="Mark Scheme"
                        short="MS"
                        href={p.msBytes ? corpusRawUrl(p.msPath) : null}
                      />
                      {p.erPath && p.erBytes ? (
                        <PdfChip label="Examiner Report" short="ER" href={corpusRawUrl(p.erPath)} />
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function PdfChip({ label, short, href }: { label: string; short: string; href: string | null }) {
  if (!href) {
    return (
      <span
        className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground/50"
        title={`No ${label.toLowerCase()} held for this paper`}
      >
        {short}
      </span>
    );
  }
  return (
    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
      <a href={href} target="_blank" rel="noreferrer noopener" aria-label={`${label} (opens PDF)`}>
        <FileText className="size-3.5" aria-hidden />
        {short}
      </a>
    </Button>
  );
}
