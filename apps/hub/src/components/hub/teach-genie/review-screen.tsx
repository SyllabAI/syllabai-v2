"use client";

/**
 * T-TEACHGENIE-001 — the session review screen (MG capture (9)): the full
 * transcript on the left (Baby Genie groups + PURPLE user bubbles — the
 * review replay of record), the "Session ended · <date>" rule, the learning
 * objectives; the right rail carries "Review your session": Strengths
 * (emerald), Areas for Improvement (orange), Suggested Practice cards with
 * Open links. Data is the ReviewCard contract — strengths are extractive
 * quotes with their turn number, improvements pair what you said with the
 * canon correction, practice hrefs are real course resources only.
 *
 * While the review is still generating (end() → review_pending), the rail
 * shows the honest pending card with the same poll law the old Teach-Me
 * review used (3s interval, ~2min ceiling, manual retry — no silent spin).
 */
import { useEffect, useRef } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, X } from "lucide-react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { BabyGenieAvatar } from "./baby-genie";
import { ObjectiveRow } from "./session-screen";
import { endedLine } from "./util";
import type { ReviewCard, TeachSession } from "@syllabai/contracts";
import type { TeachGenieTranscriptRow } from "./session-screen";

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_TRIES = 40; // ~2 minutes, then the honest still-generating state

export interface TeachGenieReviewProps {
  session: TeachSession;
  transcript: TeachGenieTranscriptRow[];
  review: ReviewCard | null;
  courseLabel: string;
  /** fetch the permalink payload — the poll law calls this every 3s */
  refresh: () => Promise<void>;
  onBack: () => void;
}

export function TeachGenieReview({ session, transcript, review, courseLabel, refresh, onBack }: TeachGenieReviewProps) {
  const pending = review == null && session.status === "review_pending";
  const failed = review == null && session.status !== "review_pending";

  useReviewPoll(pending, refresh);

  const covered = session.objectives.filter((o) => o.status === "covered").length;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* main transcript column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="bg-background px-4 py-3 sm:px-6 md:sticky md:top-0 md:z-10 md:border-b-2 md:border-border">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden /> Go back
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 sm:px-6">
          {/* mobile: review sections above the transcript */}
          <div className="mb-6 lg:hidden">
            {review ? (
              <ReviewSections review={review} />
            ) : pending ? (
              <PendingCard />
            ) : (
              <FailedCard />
            )}
          </div>

          <div className="flex flex-col gap-3">
            {transcript.map((row) =>
              row.role === "pupil" ? (
                <div key={row.id} className="flex w-full flex-col items-start gap-1">
                  <div className="mb-0.5 flex items-center gap-2 px-2">
                    <BabyGenieAvatar size={24} round />
                    <span className="tg-title text-sm text-muted-foreground">SillyAI</span>
                  </div>
                  <div className="max-w-[75%] px-2">
                    <div className="rounded-2xl bg-muted px-4 py-3 text-[15px] leading-relaxed text-foreground">
                      <Markdown>{row.text}</Markdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={row.id} className="flex w-full flex-col items-end gap-1">
                  <div className="tg-bubble-user max-w-[75%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed">
                    <p className="m-0 whitespace-pre-wrap">{row.text}</p>
                  </div>
                </div>
              ),
            )}
          </div>

          {session.endedAt && (
            <div className="my-6 flex items-center gap-3 font-medium">
              <div className="h-0.5 flex-1 bg-muted" />
              <p className="whitespace-nowrap text-xs font-normal text-muted-foreground">
                Session ended · {endedLine(session.endedAt)}
              </p>
              <div className="h-0.5 flex-1 bg-muted" />
            </div>
          )}

          <div className="mb-8 mt-16">
            <p className="mb-4 text-xs font-medium text-muted-foreground">
              Learning objectives · {covered}/{session.objectives.length} completed
            </p>
            <ul className="space-y-4">
              {session.objectives.map((o) => (
                <ObjectiveRow key={o.id} o={o} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* review rail (desktop) */}
      <aside
        aria-label="Review your session"
        className="hidden w-[22rem] shrink-0 overflow-y-auto border-l-2 border-border bg-background p-5 lg:block xl:w-96"
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-3">
            <h4 className="tg-title text-balance text-xl tracking-tight text-foreground">Review your session</h4>
            <button
              type="button"
              onClick={onBack}
              aria-label="Close review"
              className="inline-flex cursor-pointer items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {review ? (
            <ReviewSections review={review} courseLabel={courseLabel} />
          ) : pending ? (
            <PendingCard />
          ) : (
            <FailedCard />
          )}
        </div>
      </aside>
    </div>
  );
}

function useReviewPoll(active: boolean, refresh: () => Promise<void>) {
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!active) return;
    attemptRef.current = 0;
    const tick = () => {
      void refresh().finally(() => {
        attemptRef.current += 1;
        if (attemptRef.current < POLL_MAX_TRIES) {
          timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      });
    };
    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, refresh]);
}

function PendingCard() {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-5 text-center" role="status">
      <div className="mx-auto mb-3 flex w-fit items-center gap-1" aria-hidden>
        <span className="tg-dot size-2 rounded-full bg-muted-foreground/50" />
        <span className="tg-dot size-2 rounded-full bg-muted-foreground/50" />
        <span className="tg-dot size-2 rounded-full bg-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-foreground">Preparing your review…</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        SillyAI&apos;s teacher is writing up what landed and what to tighten. This usually takes under a minute —
        it lands here the moment it&apos;s ready.
      </p>
    </div>
  );
}

function FailedCard() {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-5 text-center" role="status">
      <p className="text-sm font-medium text-foreground">The review didn&apos;t land</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        The session ended before the review could generate (or generation was refused). Nothing was invented to fill
        the gap — reopen this session later from your history.
      </p>
    </div>
  );
}

function ReviewSections({ review, courseLabel }: { review: ReviewCard; courseLabel?: string }) {
  return (
    <>
      <section aria-label="Strengths">
        <h3 className="tg-title mb-3 text-base font-bold tracking-tight text-foreground">Strengths</h3>
        {review.strengths.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing quotable this session — that&apos;s honest, not harsh.</p>
        ) : (
          <ul className="space-y-2">
            {review.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" aria-hidden />
                <div className="prose-sm text-sm leading-relaxed text-foreground/90">
                  <Markdown>{`“${s.quote}”`}</Markdown>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">(your turn {s.messageSeq})</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Areas for Improvement">
        <h3 className="tg-title mb-3 text-base font-bold tracking-tight text-foreground">Areas for Improvement</h3>
        {review.improvements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No corrections this session — the canon agrees with what you taught.
          </p>
        ) : (
          <ul className="space-y-2">
            {review.improvements.map((imp, i) => (
              <li key={i} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-orange-500" aria-hidden />
                <div className="prose-sm text-sm leading-relaxed text-foreground/90">
                  <Markdown>{`You said: *${imp.statement}* — actually: ${imp.correction}`}</Markdown>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{imp.specPointIds.join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {review.suggestedPractice.length > 0 && (
        <section aria-label="Suggested Practice">
          <h3 className="tg-title mb-3 text-base font-bold tracking-tight text-foreground">Suggested Practice</h3>
          <ul className="space-y-2">
            {review.suggestedPractice.map((p, i) => {
              const typeLabel = p.resourceType === "question_bank" ? "Question Bank" : p.resourceType === "revision_notes" ? "Notes" : "Past Paper";
              return (
                <li key={i}>
                  <Link
                    href={p.href}
                    className="flex items-start gap-3 rounded-xl bg-muted p-4 transition-colors hover:bg-muted/70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground">{p.label}</p>
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        {courseLabel ? <span>{courseLabel} · </span> : null}
                        {typeLabel}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-foreground">
                        Open <span aria-hidden>→</span>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        AI_SUGGESTED evidence — your teacher ratifies before any of this touches your record. Spec verdicts of record:
        {review.specPointVerdicts.map((v) => ` ${v.specPointId}=${v.verdict}`).join("," )}.
      </p>
    </>
  );
}
