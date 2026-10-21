"use client";

/**
 * T-BOOK-009 — the tutor rail card: the scoped ask surface at the rail's
 * foot. The learner asks in their own words; the proxy composes the chapter
 * anchor (title · spec codes · mark-scheme language) around them — the
 * frozen ask contract untouched. The answer renders with the 133d
 * page-true citation link ("grounded in this chapter"); refusals render as
 * refusals (the tutor's refusal honesty law), failures as a retry state.
 * Keyboard paths: textarea Enter submits (Shift+Enter newlines).
 */
import { useRef, useState } from "react";

import type { TutorRailAnswer } from "@/lib/books-checks";
import { askRailTutor } from "@/lib/books-checks";

import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

export function TutorCard({
  courseSlug,
  documentId,
  chapterKey,
  chapterTitle,
  specCodes,
  glossaryHints,
  page,
}: {
  courseSlug: string;
  documentId: string;
  chapterKey: string;
  chapterTitle: string;
  specCodes: string[];
  glossaryHints: Array<{ term: string; accepts: string }>;
  page: number | null;
}) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "asking" | "answered">("idle");
  const [answer, setAnswer] = useState<TutorRailAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (q === "" || state === "asking") return;
    setState("asking");
    setFailed(false);
    const a = await askRailTutor(courseSlug, {
      question: q,
      documentId,
      chapterKey,
      chapterTitle,
      specCodes,
      glossaryHints,
      page,
    });
    if (a == null) {
      setFailed(true);
      setState("idle");
      return;
    }
    setAnswer(a);
    setState("answered");
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3 text-sm">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Ask about this chapter
      </p>
      <textarea
        ref={inputRef}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void ask();
          }
        }}
        rows={2}
        placeholder="e.g. Why does the curve plateau during melting?"
        className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
        aria-label="Your question about this chapter"
        maxLength={1200}
      />
      <div className="mt-1.5 flex items-center gap-2">
        <Button size="sm" className="h-7 px-3 text-xs" onClick={() => void ask()} disabled={state === "asking" || question.trim() === ""}>
          {state === "asking" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Thinking…
            </>
          ) : (
            "Ask the tutor"
          )}
        </Button>
        {answer != null && answer.citationHref != null && !answer.refused && (
          <a
            href={answer.citationHref}
            className="text-[11px] text-muted-foreground underline decoration-dotted"
          >
            Grounded in this chapter{page != null ? ` · p.${page}` : ""}
          </a>
        )}
      </div>
      {failed && (
        <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-300" role="alert">
          The tutor is not answering right now — try again shortly.
        </p>
      )}
      {answer != null && (
        <div className="mt-2 rounded-md border bg-background p-2.5" aria-live="polite">
          {answer.refused ? (
            <p className="text-[13px] italic text-muted-foreground">
              The tutor declined to answer this one — try rephrasing or ask your teacher.
            </p>
          ) : (
            <p className="whitespace-pre-line text-[13px] leading-relaxed">{answer.answer}</p>
          )}
        </div>
      )}
    </div>
  );
}
