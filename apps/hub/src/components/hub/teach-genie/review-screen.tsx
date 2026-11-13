"use client";

/**
 * T-TEACHGENIE-001 — the session review screen (data laws unchanged: the
 * ReviewCard contract — strengths are extractive quotes with their turn
 * number, improvements pair what you said with the canon correction,
 * practice hrefs are real course resources only). T-TEACHGENIE-004 re-lays
 * it out from the MG two-pane rail into the house single-column pattern:
 * the review card (Strengths / Areas for Improvement / Suggested Practice)
 * stacks above the replay transcript, which now renders the SAME anatomy as
 * the live session view (bubble-less SillyAI prose, bg-muted user bubbles),
 * then the "Session ended" divider and the learning objectives.
 *
 * While the review is still generating (end() → review_pending), the review
 * card shows the honest pending card with the same poll law the old
 * Teach-Me review used (3s interval, ~2min ceiling, manual retry — no
 * silent spin).
 */
import { useEffect, useRef } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { BabyGenieAvatar } from "./baby-genie";
import { ObjectiveRow } from "./session-screen";
import { endedLine, reviewEvidenceLead } from "./util";
import type { ReviewCard, TeachSession } from "@syllabai/contracts";
import type { TeachGenieTranscriptRow } from "./session-screen";

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_TRIES = 40; // ~2 minutes, then the honest still-generating state

export interface TeachGenieReviewProps {
  session: TeachSession;
  transcript: TeachGenieTranscriptRow[];
  review: ReviewCard | null;
  courseLabel: string;
  /** T-TEACHGENIE-008 — the API's affirmative enrollment flag: true ONLY for
   *  a confirmed class_members row. False or unknown renders the neutral
   *  independent evidence lead — never a teacher claim to a learner without
   *  a teacher. */
  classroomStudent: boolean;
  /** fetch the permalink payload — the poll law calls this every 3s */
  refresh: () => Promise<void>;
  onBack: () => void;
}

export function TeachGenieReview({ session, transcript, review, courseLabel, classroomStudent, refresh, onBack }: TeachGenieReviewProps) {
  const pending = review == null && session.status === "review_pending";
  const failed = review == null && session.status !== "review_pending";

  useReviewPoll(pending, refresh);

  const covered = session.objectives.filter((o) => o.status === "covered").length;

  return (
    <div className="flex w-full flex-col" data-testid="tg-review">
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground">
          <ArrowLeft aria-hidden /> Back to session
        </Button>
      </div>

      {/* the review card of record — sections stacked, the house pattern */}
      <section aria-label="Review your session" className="mt-3 rounded-xl border bg-card p-5 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight text-foreground">Review your session</h3>
        <div className="mt-5 flex flex-col gap-6">
          {review ? (
            <ReviewSections review={review} courseLabel={courseLabel} classroomStudent={classroomStudent} />
          ) : pending ? (
            <PendingCard />
          ) : (
            <FailedCard />
          )}
        </div>
      </section>

      {/* the replay — same anatomy as the live session view */}
      <div className="mt-8 flex flex-col gap-3" aria-label="Session transcript">
        {transcript.map((row) =>
          row.role === "pupil" ? (
            <div key={row.id} className="flex w-full flex-col items-start">
              <div className="mb-1.5 flex items-center gap-2 px-2">
                <BabyGenieAvatar size={24} round />
                <span className="text-sm font-medium text-muted-foreground">SillyAI</span>
              </div>
              <div className="w-full max-w-[75%] px-2">
                <div className="prose-sm min-w-0 text-[15px] leading-relaxed text-foreground">
                  <Markdown>{row.text}</Markdown>
                </div>
              </div>
            </div>
          ) : (
            <div key={row.id} className="flex w-full flex-col items-end gap-1">
              <div className="max-w-[75%] rounded-2xl rounded-br-md bg-muted px-4 py-3 text-[15px] leading-relaxed text-foreground">
                <p className="m-0 whitespace-pre-wrap">{row.text}</p>
              </div>
            </div>
          ),
        )}
      </div>

      {session.endedAt && (
        <div className="my-8 flex items-center gap-3 font-medium">
          <div className="h-px flex-1 bg-border" />
          <p className="whitespace-nowrap text-xs font-normal text-muted-foreground">
            Session ended · {endedLine(session.endedAt)}
          </p>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <div className="mb-4">
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
    <div className="rounded-lg border border-dashed border-border p-5 text-center" role="status">
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
    <div className="rounded-lg border border-dashed border-border p-5 text-center" role="status">
      <p className="text-sm font-medium text-foreground">The review didn&apos;t land</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        The session ended before the review could generate (or generation was refused). Nothing was invented to fill
        the gap — reopen this session later from your history.
      </p>
    </div>
  );
}

function ReviewSections({ review, courseLabel, classroomStudent }: { review: ReviewCard; courseLabel?: string; classroomStudent: boolean }) {
  return (
    <>
      <section aria-label="Strengths">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Strengths</h4>
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
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Areas for Improvement
        </h4>
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
                  <p className="mt-1 font-mono text-2xs text-muted-foreground">{imp.specPointIds.join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {review.suggestedPractice.length > 0 && (
        <section aria-label="Suggested Practice">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested Practice
          </h4>
          <ul className="space-y-2">
            {review.suggestedPractice.map((p, i) => {
              const typeLabel = p.resourceType === "question_bank" ? "Question Bank" : p.resourceType === "revision_notes" ? "Notes" : "Past Paper";
              return (
                <li key={i}>
                  {/* the house card-hover voice (border-primary/60 + shadow lift),
                      the same one the Exam-code pill and the lesson rows speak */}
                  <Link
                    href={p.href}
                    className="flex items-start gap-3 rounded-lg border bg-background p-4 transition-[border-color,box-shadow] hover:border-primary/60 hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground">{p.label}</p>
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        {courseLabel ? <span>{courseLabel} · </span> : null}
                        {typeLabel}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                        Open <ExternalLink className="size-3" aria-hidden />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-2xs leading-relaxed text-muted-foreground">
        {reviewEvidenceLead(classroomStudent)} Spec verdicts of record:
        {review.specPointVerdicts.map((v) => ` ${v.specPointId}=${v.verdict}`).join("," )}.
      </p>
    </>
  );
}
