"use client";

/**
 * BandCard — the deterministic tutor-bank card in the chat (T-MIG-130).
 *
 * Renders the structured view the relay's pre-ask probe served (the
 * T-MIG-128/129 bands): a question-bank census (resolved node chips, the
 * honest total-then-shown cut, marks + spec codes + paper per item) or the
 * whole-paper one-view (paper header + VALIDATED badge, question count and
 * marks sum, the DISCLOSED same-session siblings, and the paired QP/MS
 * rows deep-linked into the F-022 source reader at their first digitized
 * page — the citation deepLink law: /sources/{documentRowId}?page=N).
 *
 * Zero LLM was involved in whatever this card shows — the footer says so,
 * because an honest surface labels its provenance.
 */
import { Badge } from "@/components/ui/badge";
import { seriesLabel } from "@syllabai/shared";
import { CitationPaperLink } from "@/components/citations/citation-paper-link";
import { BookOpenCheck, CheckSquare, ExternalLink, FileText, ListChecks } from "lucide-react";
import type { TurnBand, TurnBandQuestionItem } from "./threads";

/** The F-022 reader href — the same law the citation bridge applies:
 *  /sources/{row}?page=N[&course=slug]; an absent row id stays an honest
 *  null (never a fabricated path). */
function readerHref(documentRowId: string, page: number | null, courseSlug?: string | null): string {
  const params = new URLSearchParams();
  if (page != null) params.set("page", String(page));
  if (courseSlug) params.set("course", courseSlug);
  const qs = params.toString();
  return `/sources/${documentRowId}${qs ? `?${qs}` : ""}`;
}

function pageSpan(chunks: { pageStart: number | null; pageEnd: number | null }[]): string | null {
  const starts = chunks.map((c) => c.pageStart).filter((p): p is number => p != null);
  const ends = chunks.map((c) => c.pageEnd).filter((p): p is number => p != null);
  if (starts.length === 0) return null;
  const min = Math.min(...starts);
  const max = ends.length > 0 ? Math.max(...ends) : min;
  return min === max ? `p. ${min}` : `pp. ${min}–${max}`;
}

function paperLabel(p: { series: string | null; year: number | null; paperCode: string | null }): string {
  const sess = [seriesLabel(p.series), p.year ?? null].filter(Boolean).join(" ");
  return [sess || null, p.paperCode].filter((x): x is string => x != null && x !== "").join(" · ");
}

function QuestionRow({ q }: { q: TurnBandQuestionItem }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <Badge variant="outline" className="mt-0.5 h-5 shrink-0 px-1.5 text-[10px] tabular-nums">
        {q.marks}
        {q.marks === 1 ? "mk" : "mks"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs leading-snug">{q.stem}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {[
            q.paper ? paperLabel(q.paper) : null,
            q.specPointCodes.length > 0 ? q.specPointCodes.join(", ") : null,
            q.commandWord,
          ]
            .filter((x): x is string => x != null && x !== "")
            .join(" · ")}
        </p>
      </div>
    </li>
  );
}

export function BandCard({ band, courseSlug }: { band: TurnBand; courseSlug?: string | null }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      {band.kind === "questions" ? <QuestionsBand band={band} /> : <PaperBand band={band} courseSlug={courseSlug} />}
      <p className="border-t bg-background/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        Deterministic result from the SyllabAI question bank — no AI model involved.
      </p>
    </div>
  );
}

function QuestionsBand({ band }: { band: Extract<TurnBand, { kind: "questions" }> }) {
  const { view } = band;
  const cut = view.items.length < view.total;
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <ListChecks className="size-3.5 text-primary" aria-hidden />
        <span className="text-xs font-semibold">Question bank</span>
        <Badge variant="outline" className="h-4 px-1.5 text-[9.5px] tabular-nums">
          {view.total} match{view.total === 1 ? "" : "es"}
        </Badge>
        {view.resolvedNodes.slice(0, 3).map((n) => (
          <Badge key={n.id} variant="secondary" className="h-4 max-w-44 px-1.5 text-[9.5px]">
            <span className="truncate">{n.code ? `${n.code} ${n.title}` : n.title}</span>
          </Badge>
        ))}
      </div>
      <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto pr-1">
        {view.items.map((q) => (
          <QuestionRow key={q.questionId} q={q} />
        ))}
      </ul>
      {cut && (
        <p className="text-[10px] text-muted-foreground">
          Showing the first {view.items.length} of {view.total} — refine the topic to narrow the list.
        </p>
      )}
    </div>
  );
}

function PaperBand({ band, courseSlug }: { band: Extract<TurnBand, { kind: "paper" }>; courseSlug?: string | null }) {
  const { view } = band;
  const marks = view.questions.reduce((s, q) => s + (q.marks || 0), 0);
  const qp = view.questionPaper;
  const ms = view.markScheme;
  const qpRow = firstChunkHref(qp, courseSlug);
  const msRow = firstChunkHref(ms, courseSlug);
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <BookOpenCheck className="size-3.5 text-primary" aria-hidden />
        <span className="text-xs font-semibold">
          {paperLabel(view.paper) || view.paper.title || "Exam paper"}
        </span>
        <Badge variant="outline" className="h-4 px-1.5 text-[9.5px] tabular-nums">
          {view.questions.length} questions · {marks} marks
        </Badge>
        {view.paper.validationState === "VALIDATED" && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[9.5px] text-success">
            <CheckSquare className="size-2.5" aria-hidden /> validated
          </Badge>
        )}
      </div>
      {view.siblings.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Same-session papers also in the bank:{" "}
          {view.siblings.map((s) => s.paperCode).filter(Boolean).join(", ")}
        </p>
      )}
      <ul className="divide-y divide-border/60">
        <DocRow
          label="Question paper"
          chunkCount={qp.chunkCount}
          span={pageSpan(qp.chunks)}
          href={qpRow}
        />
        <DocRow
          label="Mark scheme"
          chunkCount={ms.chunkCount}
          span={pageSpan(ms.chunks)}
          href={msRow}
        />
      </ul>
      {view.questions.length > 0 && (
        <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto pr-1">
          {view.questions.slice(0, 12).map((q) => (
            <QuestionRow key={q.questionId} q={q} />
          ))}
        </ul>
      )}
      {view.questions.length > 12 && (
        <p className="text-[10px] text-muted-foreground">
          First 12 of {view.questions.length} questions shown — open the paper to read them all.
        </p>
      )}
    </div>
  );
}

/** The first digitized chunk's reader href — the entry page for the whole
 *  document (the reader paginates from there, the F-022 pane law). */
function firstChunkHref(
  doc: { documentId: string | null; chunks: { documentRowId: string; pageStart: number | null }[] },
  courseSlug?: string | null,
): string | null {
  const first = doc.chunks[0];
  if (!first) return null;
  return readerHref(first.documentRowId, first.pageStart, courseSlug);
}

function DocRow({
  label,
  chunkCount,
  span,
  href,
}: {
  label: string;
  chunkCount: number;
  span: string | null;
  href: string | null;
}) {
  const body = (
    <>
      <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-xs font-medium">{label}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {chunkCount > 0 ? `${chunkCount} pages${span ? ` · ${span}` : ""}` : "not digitized"}
      </span>
      {href && <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  return (
    <li>
      {href ? (
        // the F-022 law: the /sources deep link opens the SAME in-place
        // PdfPane dialog the citation chips use (the learner's Bearer rides
        // the client fetch — an <a> navigation could never carry it)
        <CitationPaperLink
          href={href}
          className="flex items-center gap-2 py-2 transition-colors hover:bg-muted/50"
          title={`Open the ${label.toLowerCase()}`}
        >
          {body}
        </CitationPaperLink>
      ) : (
        <div className="flex items-center gap-2 py-2 opacity-70">{body}</div>
      )}
    </li>
  );
}
