"use client";

/**
 * Per-sub-topic progress ring — the demo analogue of the SME circular
 * indicator that appears on every sidebar tree row (research §8). DC-7:
 * signed-in learners read the server projection of the persisted event
 * rows (lib/progress-server.ts — the projection-of-events law); the
 * browser-local SIMULATED overlay remains the signed-out fallback.
 */
import {
  subtopicFlashcardsRing,
  subtopicNotesRing,
  subtopicQuestionsRing,
  useCourseProgress,
  type Course,
} from "@/lib/progress";
import { formatPercent, roundPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Which denominator the ring covers. "all" (the default) = the combined
 * notes+questions+flashcards engagement coverage — the SIDEBAR's posture.
 * Each select page owns its own dimension instead (operator trace
 * 1a195fd0b0947695: "the rings show progress of revision notes only, not
 * exam questions and not flashcards. Both of their select pages will handle
 * their progress rings", extended by trace 1a1982281a3d7a65 to the other two
 * select pages' own ring semantics):
 * - "notes"      = reads ÷ available notes ONLY — revision-notes select page
 * - "questions"  = answered parts ÷ available questions ONLY — exam-questions select page
 * - "flashcards" = rated cards ÷ available cards ONLY — flashcards select page
 */
export type ProgressRingDimension = "all" | "notes" | "questions" | "flashcards";

export function ProgressRing({
  course,
  subtopic,
  counts,
  size = 18,
  className,
  projectionPercent,
  dimension = "all",
}: {
  course: Course;
  /** sub-topic code the ring is computed for */
  subtopic: string | null;
  counts: { notes: number; questions: number; flashcards: number };
  size?: number;
  className?: string;
  /** DC-7: the server projection's percent for this node on the active
   * tree's dimension — present (including 0) WINS over the local overlay
   * (the projection-of-events law, never a local counter); null/undefined
   * falls back to the SIMULATED overlay posture (signed-out demo). */
  projectionPercent?: number | null;
  /** "notes" / "questions" / "flashcards" swap the denominator to that
   * select page's own content type (see ProgressRingDimension). The server
   * projection branch above is dimension-agnostic by contract: a caller
   * that passes a projection also passes the matching dimension's number. */
  dimension?: ProgressRingDimension;
}) {
  const progress = useCourseProgress(course);
  const radius = (size - 3) / 2;
  const c = 2 * Math.PI * radius;

  let percent = 0;
  if (projectionPercent !== undefined && projectionPercent !== null) {
    percent = projectionPercent;
  } else if (subtopic && dimension === "notes") {
    percent = roundPercent(subtopicNotesRing(progress, subtopic, counts).percent);
  } else if (subtopic && dimension === "questions") {
    percent = roundPercent(subtopicQuestionsRing(progress, subtopic, counts).percent);
  } else if (subtopic && dimension === "flashcards") {
    percent = roundPercent(subtopicFlashcardsRing(progress, subtopic, counts).percent);
  } else if (subtopic) {
    const k = counts;
    const total = k.notes + k.questions + k.flashcards;
    if (total > 0) {
      const notes = Object.values(progress.notesRead).filter((v) => v.subtopic === subtopic).length;
      const questions =
        Object.values(progress.selfScores).filter((v) => v.subtopic === subtopic).length +
        Object.values(progress.mcqAnswers).filter((v) => v.subtopic === subtopic).length;
      const cards = Object.values(progress.flashcards).filter((v) => v.subtopic === subtopic).length;
      const done =
        Math.min(notes, k.notes) + Math.min(questions, k.questions) + Math.min(cards, k.flashcards);
      // UX audit 2026-10-02 #17: one-decimal precision — Math.round made the
      // first completed item read as "0%" in the aria label and tooltip
      percent = roundPercent((done / total) * 100);
    }
  }

  const complete = percent >= 100;
  const started = percent > 0;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      role="img"
      aria-label={`Progress: ${formatPercent(percent)}`}
      title={complete ? "Complete" : started ? formatPercent(percent) : "Not started"}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={2}
          className={complete ? "stroke-primary" : "stroke-muted-foreground/30"}
        />
        {started && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={2}
            stroke="currentColor"
            strokeDasharray={`${(c * percent) / 100} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="text-primary transition-[stroke-dasharray] duration-500"
          />
        )}
        {complete && <circle cx={size / 2} cy={size / 2} r={radius - 3} className="fill-primary" />}
      </svg>
    </span>
  );
}
