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
 *
 * Copy fidelity (run-004 proposal #4, operator trace 1a1458af5eed4b21):
 * linear DOM copy on this card scrambles the [badge][stem] pairing (a drag
 * from stem_1 reads badge_2 under it) and cuts at the scroll container's
 * boundary — the operator's original paste symptom. The card therefore
 * carries its own deterministic copy path: a per-row copy button and a
 * card-level "Copy all" that serialize the VIEW DATA (full stems, every
 * question the payload carries — never the DOM clamp, never the scroll
 * cut), with the band-1 shown/total cut disclosed in the copied header.
 */
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { seriesLabel } from "@syllabai/shared";
import { CitationPaperLink } from "@/components/citations/citation-paper-link";
import { BookOpenCheck, Check, CheckSquare, Copy, ExternalLink, FileText, Image as ImageIcon, ListChecks } from "lucide-react";
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

// ── copy fidelity (run-004 proposal #4) ───────────────────────────────

/** clipboard + 1600ms feedback state — the chat action-rail pattern */
function useCopyFeedback(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (permissions / insecure context) — stay silent
    }
  };
  return [copied, copy];
}

function marksTag(marks: number): string {
  return `[${marks} mk${marks === 1 ? "" : "s"}]`;
}

/** one serialized question row — the exact text both copy paths emit */
function questionCopyLine(index: number, q: TurnBandQuestionItem): string {
  return `${index + 1}. ${marksTag(q.marks)} ${q.stem}`;
}

/** the card's deterministic copy text — serialized from the VIEW DATA (full
 *  stems, every question the payload carries), never from the DOM: the
 *  line-clamp and the scroll containers are presentational and must not
 *  shape what the learner pastes. */
function bandCopyText(band: TurnBand, courseSlug?: string | null): string {
  if (band.kind === "questions") {
    const { view } = band;
    const cutNote =
      view.items.length < view.total
        ? ` — showing the first ${view.items.length} of ${view.total} (refine the topic for the rest)`
        : "";
    const lines = view.items.map((q, i) => questionCopyLine(i, q));
    return [`Question bank — ${view.total} matching question${view.total === 1 ? "" : "s"}${cutNote}`, "", ...lines].join(
      "\n",
    );
  }
  const { view } = band;
  const marks = view.questions.reduce((s, q) => s + (q.marks || 0), 0);
  const head = `${paperLabel(view.paper) || view.paper.title || "Exam paper"} — ${view.questions.length} questions · ${marks} marks`;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const qp = view.questionPaper.chunks[0];
  const ms = view.markScheme.chunks[0];
  const docLines = [
    qp ? `Question paper: ${origin}${readerHref(qp.documentRowId, qp.pageStart, courseSlug)}` : null,
    ms ? `Mark scheme: ${origin}${readerHref(ms.documentRowId, ms.pageStart, courseSlug)}` : null,
  ].filter((x): x is string => x != null);
  const lines = view.questions.map((q, i) => questionCopyLine(i, q));
  return [head, ...docLines, "", ...lines].join("\n");
}

const copyBtnClass =
  "inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

function QuestionRow({
  q,
  index,
  courseSlug,
}: {
  q: TurnBandQuestionItem;
  /** 0-based position in the card's data — the copy path's question number */
  index: number;
  courseSlug?: string | null;
}) {
  const [copied, copy] = useCopyFeedback();
  return (
    <li className="group/q flex items-start gap-2 py-1.5">
      <Badge variant="outline" className="mt-0.5 h-5 shrink-0 px-1.5 text-[10px] tabular-nums">
        {q.marks}
        {q.marks === 1 ? "mk" : "mks"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs leading-snug">{q.stem}</p>
        <FigureChips q={q} courseSlug={courseSlug} />
        <div className="mt-0.5 flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {[
              q.paper ? paperLabel(q.paper) : null,
              q.specPointCodes.length > 0 ? q.specPointCodes.join(", ") : null,
              q.commandWord,
            ]
              .filter((x): x is string => x != null && x !== "")
              .join(" · ")}
          </p>
          <button
            type="button"
            onClick={() => void copy(questionCopyLine(index, q))}
            className={`${copyBtnClass} opacity-100 transition-opacity lg:opacity-0 lg:group-hover/q:opacity-100 lg:focus-visible:opacity-100`}
            aria-label={`Copy question ${index + 1} (${q.marks} marks) with its full text`}
            title="Copy the full question text"
          >
            {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          </button>
        </div>
      </div>
    </li>
  );
}

/** lane #3 — the question's figure chips: the diagram EXISTENCE the stems
 *  only gesture at ("The diagram shows…"), each chip a reference (page +
 *  crop shape) that deep-links the F-022 reader at the figure's digitized
 *  page. Never an <img>: the crop binaries are not stored of record, and a
 *  broken src would be a lie — the reader's parsed page is the truth of
 *  record. Chips render ONLY where the parser's own attribution resolved. */
function FigureChips({ q, courseSlug }: { q: TurnBandQuestionItem; courseSlug?: string | null }) {
  const figures = q.figures ?? [];
  if (figures.length === 0) return null;
  const shown = figures.slice(0, 4);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((f, i) => {
        const dims = f.width != null && f.height != null ? `${f.width}×${f.height}` : null;
        const label = [f.page != null ? `QP p.${f.page}` : "QP", dims].filter(Boolean).join(" · ");
        const href = f.documentRowId ? readerHref(f.documentRowId, f.page, courseSlug) : null;
        const body = (
          <>
            <ImageIcon className="size-2.5 shrink-0" aria-hidden />
            <span>Diagram</span>
            {label !== "" && <span className="text-muted-foreground">{label}</span>}
          </>
        );
        const cls =
          "inline-flex items-center gap-1 rounded border bg-background/70 px-1 py-px text-[9.5px] leading-4";
        const title =
          f.sourceName != null
            ? `${f.sourceName} — open the question paper at this figure's page`
            : "Open the question paper at this figure's page";
        const key = `${f.documentRowId ?? "row"}-${f.page ?? "p"}-${i}`;
        return href ? (
          <CitationPaperLink key={key} href={href} className={`${cls} transition-colors hover:bg-muted/60`} title={title}>
            {body}
          </CitationPaperLink>
        ) : (
          <span key={key} className={cls} title={title}>
            {body}
          </span>
        );
      })}
      {figures.length > shown.length && (
        <span className="text-[9.5px] text-muted-foreground">+{figures.length - shown.length}</span>
      )}
    </div>
  );
}

export function BandCard({ band, courseSlug }: { band: TurnBand; courseSlug?: string | null }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      {band.kind === "questions" ? (
        <QuestionsBand band={band} courseSlug={courseSlug} />
      ) : (
        <PaperBand band={band} courseSlug={courseSlug} />
      )}
      <p className="border-t bg-background/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        Deterministic result from the SyllabAI question bank — no AI model involved.
      </p>
    </div>
  );
}

function QuestionsBand({
  band,
  courseSlug,
}: {
  band: Extract<TurnBand, { kind: "questions" }>;
  courseSlug?: string | null;
}) {
  const { view } = band;
  const cut = view.items.length < view.total;
  const [copied, copy] = useCopyFeedback();
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
        <button
          type="button"
          onClick={() => void copy(bandCopyText(band, courseSlug))}
          className={`${copyBtnClass} ml-auto`}
          aria-label="Copy all listed questions with their full text"
          title="Copy every listed question with its full text (not just the visible lines)"
        >
          {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          <span className="sr-only">Copy all</span>
        </button>
      </div>
      <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto pr-1">
        {view.items.map((q, i) => (
          <QuestionRow key={q.questionId} q={q} index={i} courseSlug={courseSlug} />
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
  const [copied, copy] = useCopyFeedback();
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
        <button
          type="button"
          onClick={() => void copy(bandCopyText(band, courseSlug))}
          className={`${copyBtnClass} ml-auto`}
          aria-label="Copy the whole paper listing with every question's full text"
          title="Copy every question with its full text (not just the visible lines)"
        >
          {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          <span className="sr-only">Copy all</span>
        </button>
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
          {view.questions.slice(0, 12).map((q, i) => (
            <QuestionRow key={q.questionId} q={q} index={i} courseSlug={courseSlug} />
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
