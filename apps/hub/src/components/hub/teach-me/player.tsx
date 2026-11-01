"use client";

/**
 * Teach-Me player (T-TEACHME-001 run-003) — the probe chat of record.
 *
 * Transcript anatomy (probe of record, task yaml research): the Pupil
 * paraphrases its updated understanding back, then asks the next edge-case
 * question; each student message earns an expandable verdict chip holding
 * an extractive feedback line naming the covered learning point; objectives
 * tick off automatically as coverage lands — no mid-session scoring screen.
 *
 * D2 doctrine lives server-side: the Pupil never corrects in-session; the
 * review card is the correction of record. This surface only renders what
 * the contract carries.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  TeachObjective,
  TeachSession,
  VerdictChip,
} from "@syllabai/contracts";
import { wordsOf } from "./errors";

export interface TeachMeTranscriptRowView {
  id: string;
  seq: number;
  role: "student" | "pupil";
  kind: "opening" | "paraphrase_probe" | "clarify_nudge" | "confusion" | null;
  text: string;
}

export interface TeachMePlayerProps {
  session: TeachSession;
  transcript: TeachMeTranscriptRowView[];
  chips: Record<number, VerdictChip>;
  sending: boolean;
  ceilingReached: boolean;
  onSend: (text: string) => void;
  onEnd: () => void;
  ending: boolean;
  endArmed: boolean;
  onArmEnd: () => void;
}

const KIND_LABEL: Record<NonNullable<TeachMeTranscriptRowView["kind"]>, string> = {
  opening: "opening question",
  paraphrase_probe: "checks understanding",
  clarify_nudge: "asks for more",
  confusion: "is confused",
};

const OBJECTIVE_BADGE: Record<TeachObjective["status"], { label: string; className: string }> = {
  not_started: { label: "to cover", className: "border-muted-foreground/25 text-muted-foreground" },
  covered: { label: "covered ✓", className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  not_covered: { label: "not covered", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  flagged: { label: "flagged", className: "border-red-500/40 text-red-600 dark:text-red-400" },
};

export function objectivesPanel(objectives: TeachObjective[]) {
  return (
    <ol className="space-y-1.5">
      {objectives.map((o) => {
        const badge = OBJECTIVE_BADGE[o.status];
        return (
          <li key={o.id} className="flex items-start gap-2 text-xs leading-relaxed">
            <Badge variant="outline" className={`shrink-0 text-[10px] ${badge.className}`}>
              {badge.label}
            </Badge>
            <span className={o.status === "not_started" ? "text-muted-foreground" : ""}>
              {o.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function TeachMePlayer({
  session,
  transcript,
  chips,
  sending,
  ceilingReached,
  onSend,
  onEnd,
  ending,
  endArmed,
  onArmEnd,
}: TeachMePlayerProps) {
  const [text, setText] = useState("");
  const words = useMemo(() => wordsOf(text), [text]);
  const overCharLimit = text.length > 4000;
  const canSend = text.trim().length > 0 && !sending && !ceilingReached && !overCharLimit;

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* objectives rail — auto-ticking, MG parity */}
      <section
        aria-label="Learning objectives"
        className="rounded-lg border border-border bg-card px-4 py-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Objectives — tick themselves off as you cover them
          </h3>
          <span className="text-xs text-muted-foreground">
            {session.objectives.filter((o) => o.status === "covered").length}/
            {session.objectives.length}
          </span>
        </div>
        {objectivesPanel(session.objectives)}
      </section>

      {/* transcript */}
      <section aria-label="Session transcript" className="space-y-3">
        {transcript.map((row) =>
          row.role === "pupil" ? (
            <div key={row.id} className="flex items-start gap-2.5">
              <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                P
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  the Pupil · {row.kind ? KIND_LABEL[row.kind] : "replies"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{row.text}</p>
              </div>
            </div>
          ) : (
            <div key={row.id} className="flex flex-col items-end gap-1">
              <div className="flex max-w-[85%] items-start justify-end gap-2.5 self-end">
                <div className="rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-primary-foreground">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{row.text}</p>
                </div>
              </div>
              {chips[row.seq] && <VerdictChipView chip={chips[row.seq]} />}
            </div>
          ),
        )}
        {sending && (
          <p className="pl-10 text-xs text-muted-foreground" aria-live="polite">
            the Pupil is thinking…
          </p>
        )}
      </section>

      {/* composer */}
      {!ceilingReached ? (
        <section aria-label="Your explanation" className="rounded-lg border border-border bg-card p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            rows={4}
            placeholder="Explain it in your own words — the Pupil learns from how you put it together…"
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={4500}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {words} {words === 1 ? "word" : "words"}
              {words > 0 && words < 12 && " — the Pupil engages with fuller explanations"}
              {overCharLimit && (
                <span className="ml-1 text-red-600 dark:text-red-400">
                  over the 4000-character limit
                </span>
              )}
            </p>
            <Button size="sm" onClick={submit} disabled={!canSend}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Tip: ⌘/Ctrl + Enter sends. Short replies may earn a nudge instead of a verdict.
          </p>
        </section>
      ) : (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          You&apos;ve used this session&apos;s turns — end it to get your review card.
        </p>
      )}

      {/* end session */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {session.messageCount} {session.messageCount === 1 ? "turn" : "turns"} taught
        </p>
        {endArmed ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onArmEnd} disabled={ending}>
              Keep going
            </Button>
            <Button size="sm" variant="destructive" onClick={onEnd} disabled={ending}>
              {ending ? "Ending…" : "Really end & review"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={onArmEnd} disabled={ending}>
            End session
          </Button>
        )}
      </div>
    </div>
  );
}

/** The expandable verdict chip (probe of record: "Great" + extractive line). */
export function VerdictChipView({ chip }: { chip: VerdictChip }) {
  return (
    <details className="max-w-[85%] self-end rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
      <summary className="cursor-pointer list-none font-medium">
        <span
          className={`mr-1.5 inline-block size-2 rounded-full align-middle ${
            chip.flaggedPastedNotes
              ? "bg-red-500"
              : chip.wordFloorPassed
                ? "bg-emerald-500"
                : "bg-amber-500"
          }`}
        />
        {chip.flaggedPastedNotes ? "Flagged" : chip.verdict}
        {chip.coveredObjectiveIds.length > 0 && (
          <span className="ml-1.5 text-muted-foreground">
            · {chip.coveredObjectiveIds.length}{" "}
            {chip.coveredObjectiveIds.length === 1 ? "objective" : "objectives"} covered
          </span>
        )}
        <span className="ml-1.5 text-muted-foreground/60">— details</span>
      </summary>
      <div className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5 leading-relaxed text-muted-foreground">
        <p>{chip.feedbackLine}</p>
        {chip.flaggedPastedNotes && (
          <p className="text-red-600 dark:text-red-400">
            This explanation overlaps your course&apos;s written material too closely — it
            reads as pasted notes, so it can&apos;t earn coverage credit. Put it into your
            own words and try again.
          </p>
        )}
        {chip.overlapScore !== null && (
          <p className="text-[11px] text-muted-foreground/70">
            corpus-overlap check: {(chip.overlapScore * 100).toFixed(0)}%
          </p>
        )}
      </div>
    </details>
  );
}
