"use client";

/**
 * Teach-Me review card (T-TEACHME-001 run-003) — the correction of record
 * (ADR-040 D2): strengths quoting the student's own words, the full
 * corrections that were deliberately withheld in-session, spec-point
 * verdicts, AI_SUGGESTED misconception candidates, real exam anchors, KG
 * prereq warnings and suggested practice. Everything here is AI_SUGGESTED
 * telemetry — the banner says so plainly (D1: nothing counts toward the
 * of-record mastery until a teacher ratifies it in the workbench).
 */
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { ReviewCard } from "@syllabai/contracts";

const VERDICT_BADGE: Record<ReviewCard["specPointVerdicts"][number]["verdict"], string> = {
  covered: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  partially_covered: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  not_covered: "border-red-500/40 text-red-600 dark:text-red-400",
  flagged: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
};

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function TeachMeReview({ review }: { review: ReviewCard }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">AI-suggested evidence.</strong> This review
        was generated from your teaching session. Like everything in Teach-Me, it is a{" "}
        <strong className="text-foreground">suggestion</strong> — your teacher reviews it
        before it ever counts toward your record.
      </div>

      {review.strengths.length > 0 && (
        <Section title="What landed" hint="Quoted from your own words — not paraphrased.">
          <ul className="space-y-2">
            {review.strengths.map((s, i) => (
              <li key={i} className="border-l-2 border-emerald-500/50 pl-3 text-sm leading-relaxed">
                <span className="text-muted-foreground">“{s.quote}”</span>
                <span className="ml-1.5 text-[11px] text-muted-foreground/60">
                  (your turn {s.messageSeq})
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {review.improvements.length > 0 && (
        <Section
          title="What to tighten"
          hint="The corrections the Pupil held back during the session — its persona never breaks character, so the full picture lives here."
        >
          <ul className="space-y-3">
            {review.improvements.map((imp, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <p className="rounded-md bg-muted/60 px-3 py-2 text-muted-foreground">
                  <span className="font-medium text-foreground/80">You said: </span>
                  “{imp.statement}”
                </p>
                <p className="mt-1.5 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
                  <span className="font-medium">Actually: </span>
                  {imp.correction}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                  {imp.specPointIds.join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Spec point verdicts">
        <ul className="flex flex-wrap gap-2">
          {review.specPointVerdicts.map((v) => (
            <li
              key={v.specPointId}
              className="rounded-lg border border-border px-3 py-2 text-xs leading-relaxed"
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                {v.specPointId}
              </span>{" "}
              <Badge variant="outline" className={`text-[10px] ${VERDICT_BADGE[v.verdict]}`}>
                {v.verdict.replace(/_/g, " ")}
              </Badge>
              {v.evidenceQuote && (
                <span className="mt-1 block text-muted-foreground">“{v.evidenceQuote}”</span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {review.misconceptionNotes.length > 0 && (
        <Section
          title="Misconception candidates"
          hint="Flagged for your teacher's queue — marked as candidates, never auto-applied to your record."
        >
          <ul className="space-y-2">
            {review.misconceptionNotes.map((m, i) => (
              <li key={i} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm leading-relaxed">
                <span className="text-muted-foreground">“{m.statement}”</span>
                <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  candidate · {(m.confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {review.examAnchors.length > 0 && (
        <Section title="Where the exam asks this" hint="Real past-paper anchors from this course's serving corpus — never invented.">
          <ul className="space-y-1.5 text-sm">
            {review.examAnchors.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {a.specPointId}
                </span>
                <span>
                  {a.paperRef} · {a.questionRef}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {review.prereqWarnings.length > 0 && (
        <Section title="Worth revisiting first" hint="Prerequisite points this session leaned on.">
          <ul className="space-y-1.5 text-sm">
            {review.prereqWarnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {w.prereqSpecPointId}
                </span>{" "}
                — {w.note}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {review.suggestedPractice.length > 0 && (
        <Section title="Suggested practice" hint="Real resources from this course — nothing invented.">
          <ul className="flex flex-wrap gap-2">
            {review.suggestedPractice.map((p, i) =>
              p.href.startsWith("/") ? (
                <li key={i}>
                  <Link
                    href={p.href}
                    className="inline-block rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    {p.label}
                  </Link>
                </li>
              ) : (
                <li key={i} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  {p.label} ({p.resourceType.replace(/_/g, " ")})
                </li>
              ),
            )}
          </ul>
        </Section>
      )}

      <p className="text-center text-[11px] text-muted-foreground/60">
        Review generated {new Date(review.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

/** The honest while-generating state (end is async by design — plan §6 route 3). */
export function ReviewPending({
  elapsedLabel,
  timedOut,
  onRefresh,
}: {
  elapsedLabel: string;
  timedOut: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
        <div
          className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden
        />
        {timedOut ? (
          <>
            <h3 className="text-sm font-semibold">Still generating…</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              The review is taking longer than usual ({elapsedLabel}). Your session is
              saved — you can reopen it from your history in a moment, or check again now.
            </p>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-4 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              Check again
            </button>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold">Generating session review…</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              The Pupil&apos;s tutor is reading your transcript and writing the review
              card — strengths, corrections and where the exam asks this. Usually a few
              seconds ({elapsedLabel}).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
