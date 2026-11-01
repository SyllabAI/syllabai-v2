"use client";

/**
 * Note-page client island: (1) fires the note-read event — trigger law of
 * record (operator trace 1a195fd0b0947695: "when a user opens a note and
 * scrolls down of that note, then only the note will become checked, not
 * just entering the note page"): the event fires when THIS strip — the
 * note's END — scrolls into view, so a note becomes read only by scrolling
 * down through it, never by merely opening the page. (A note short enough
 * to fit the viewport shows its end on entry — the whole note IS on screen,
 * which is honestly "seen"; the long-note entry case the operator called
 * out keeps its ring/tick until the learner actually scrolls through.) The
 * sidebar rings react like SME's (research §8), and — when the course is
 * the 4CH1 pilot and the learner is signed in — the SAME event reports the
 * view to syllabai-core (revision-notes progress feeds the backend's
 * learner model; core never counts a view the local overlay doesn't). (2)
 * Renders the "Was this revision note helpful?" micro-feedback footer
 * (research §5.4). The helpful rating always lands on the local overlay;
 * tranche 4.9 additionally mirrors it to the learner's core account as
 * append-only self-report evidence (lib/note-vote-bridge — pilot + signed
 * in + reachable only, every negative degrades silently, never mastery).
 */
import { useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markNoteRead, rateNoteHelpful, useCourseProgress, type Course } from "@/lib/progress";
import { api } from "@/lib/api";
import { submitNoteVote } from "@/lib/note-vote-bridge";
import { fetchPilotInfo, coreEvidenceChanged } from "@/lib/attempt-bridge";

export function NoteFootnote({
  course,
  noteId,
  subtopic,
}: {
  course: Course;
  noteId: string;
  subtopic: string | null;
}) {
  const progress = useCourseProgress(course);
  // derived from the overlay store — no local mirror state needed
  const voted = progress.notesRead[noteId]?.helpful ?? null;
  // tranche 4.9 honesty line: did the vote also reach the core account?
  // null until the first vote's mirror resolves (the local overlay holds it
  // either way — the footer never blocks on the answer)
  const [voteSync, setVoteSync] = useState<null | "account" | "local-signed-out" | "local-unreachable">(null);

  // the read-law sentinel: this strip IS the note's end (it renders after
  // the whole Markdown body — page.tsx) — visible ⇒ every line was scrolled
  // past, which is exactly the operator's "opens a note AND scrolls down"
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // one read event per mount; the observer owns the trigger
    let fired = false;
    let cancelled = false;

    const fire = () => {
      if (fired || cancelled) return;
      fired = true;
      markNoteRead(course, noteId, subtopic);
      // 4CH1 bridge: the SAME read becomes real evidence on the learner's
      // core account — gated on the identical trigger so core never counts
      // a view the local overlay doesn't (one event, two sinks).
      // Fire-and-forget with the pilot check — a note read must never
      // block rendering, and non-pilot courses stay local-only by design.
      fetchPilotInfo(course).then((pilot) => {
        if (cancelled || !pilot) return;
        api
          .markRevisionNoteViewed(noteId)
          .then(() => coreEvidenceChanged())
          .catch(() => {
            /* view stays local — honest, silent, non-blocking */
          });
      });
    };

    // Read law: fire when the note's end becomes visible (threshold 0.25 of
    // this ~60px strip ≈ 15px on screen — deliberate visibility, not a
    // 1-px flicker). Browsers without IntersectionObserver keep the old
    // whole-page posture (fire on mount) rather than losing reads entirely.
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return () => {
        cancelled = true;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fire();
      },
      { threshold: 0.25 },
    );
    if (rootRef.current) io.observe(rootRef.current);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [course, noteId, subtopic]);

  const castVote = (v: "up" | "down") => {
    rateNoteHelpful(course, noteId, v);
    // tranche 4.9: best-effort core mirror (pilot + signed in + anchor
    // resolved only) — the local overlay already holds the vote; a vote
    // change is a new append-only event and core's latest row wins
    if (!subtopic) return;
    void submitNoteVote(course, noteId, v, subtopic).then((outcome) => {
      if (outcome.kind === "synced") setVoteSync("account");
      else if (outcome.reason === "signed out") setVoteSync("local-signed-out");
      else setVoteSync("local-unreachable");
    });
  };

  return (
    <div
      ref={rootRef}
      className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3"
    >
      <p className="text-sm font-medium">Was this revision note helpful?</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={voted === "up" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => castVote("up")}
          aria-pressed={voted === "up"}
        >
          <ThumbsUp className="size-3.5" aria-hidden /> Yes
        </Button>
        <Button
          size="sm"
          variant={voted === "down" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => castVote("down")}
          aria-pressed={voted === "down"}
        >
          <ThumbsDown className="size-3.5" aria-hidden /> No
        </Button>
      </div>
      {voted && (
        <p className="text-xs text-muted-foreground">
          {voteSync === "account"
            ? "Thanks — recorded to your account as self-report evidence."
            : voteSync === "local-signed-out"
              ? "Thanks — recorded to your local overlay. Sign in to also keep votes on your account."
              : voteSync === "local-unreachable"
                ? "Thanks — recorded to your local overlay (your account is unreachable right now)."
                : "Thanks — recorded."}
        </p>
      )}
    </div>
  );
}
