"use client";

/**
 * Teach-Me client orchestrator (T-TEACHME-001 run-003) — the state machine
 * over the five learner routes of record (plan §6, mounted run-002):
 * create → player → end → poll → review, plus history/permalink. Every law
 * (quota, ceilings, word floor, overlap, D2) lives server-side; this
 * component only renders contract-shaped truth and fails honest.
 *
 * Honesty notes of record:
 *  - verdict chips exist only in the live create/message responses (the
 *    teach_messages plane carries the transcript, not the chips) — a
 *    resumed session renders the transcript WITHOUT chips and says so; the
 *    review card is the durable verdict of record.
 *  - review generation is async: end() returns review_pending and this
 *    component polls the permalink route until the card exists, with an
 *    honest timeout state and a manual retry (no silent spinning).
 *  - failures render through classifyTeachMeFailure — the server's own
 *    learner-honest copy stays verbatim; the hub adds no spin.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { TeachMeSessionDetail } from "@/lib/api";
import type {
  CreateSessionRequest,
  PupilMessage,
  ReviewCard,
  SessionHistoryItem,
  TeachSession,
  VerdictChip,
} from "@syllabai/contracts";
import { TeachMeWizard } from "./wizard";
import { TeachMePlayer, type TeachMeTranscriptRowView } from "./player";
import { ReviewPending, TeachMeReview } from "./review";
import { TeachMeHistory } from "./history";
import { classifyTeachMeFailure, type TeachMeFailure } from "./errors";
import type { TeachMePickerTopic } from "./picker-data";

type View =
  | { name: "wizard" }
  | { name: "player" }
  | { name: "review" }
  | { name: "history" }
  | { name: "detail" };

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_TRIES = 40; // ~2 minutes, then the honest still-generating state

export interface TeachMeClientProps {
  course: string;
  courseLabel: string;
  topics: TeachMePickerTopic[];
}

function openingRow(session: TeachSession, opening: PupilMessage): TeachMeTranscriptRowView {
  return {
    id: `${session.id}-0-opening`,
    seq: 0,
    role: "pupil",
    kind: opening.kind,
    text: opening.text,
  };
}

export function TeachMeClient({ course, courseLabel, topics }: TeachMeClientProps) {
  const [view, setView] = useState<View>({ name: "wizard" });
  const [session, setSession] = useState<TeachSession | null>(null);
  const [transcript, setTranscript] = useState<TeachMeTranscriptRowView[]>([]);
  const [chips, setChips] = useState<Record<number, VerdictChip>>({});
  const [review, setReview] = useState<ReviewCard | null>(null);
  const [failure, setFailure] = useState<TeachMeFailure | null>(null);
  const [busy, setBusy] = useState(false); // create in flight
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const [ceilingReached, setCeilingReached] = useState(false);
  const [history, setHistory] = useState<SessionHistoryItem[] | null>(null);
  const [detail, setDetail] = useState<TeachMeSessionDetail | null>(null);
  const [pollElapsed, setPollElapsed] = useState("a moment");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);
  useEffect(() => clearPoll, [clearPoll]);

  const fail = (err: unknown) => {
    setFailure(classifyTeachMeFailure(err));
    setBusy(false);
    setSending(false);
    setEnding(false);
  };

  /* -- create (route 1) ------------------------------------------------ */
  const start = async (body: Omit<CreateSessionRequest, "courseId">) => {
    setBusy(true);
    setFailure(null);
    try {
      const out = await api.teachMeCreateSession({ ...body, courseId: course });
      setSession(out.session);
      setTranscript([openingRow(out.session, out.opening)]);
      setChips({});
      setEndArmed(false);
      setCeilingReached(false);
      setView({ name: "player" });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /* -- message (route 2) ----------------------------------------------- */
  const send = async (text: string) => {
    if (!session) return;
    setSending(true);
    setFailure(null);
    try {
      const out = await api.teachMePostMessage(session.id, { text });
      const studentSeq = out.session.messageCount;
      setTranscript((prev) => [
        ...prev,
        {
          id: `${session.id}-${studentSeq}-student`,
          seq: studentSeq,
          role: "student",
          kind: null,
          text,
        },
        ...(out.pupilMessage
          ? [
              {
                id: `${session.id}-${studentSeq}-pupil`,
                seq: studentSeq,
                role: "pupil" as const,
                kind: out.pupilMessage.kind,
                text: out.pupilMessage.text,
              },
            ]
          : []),
      ]);
      const chip = out.chip;
      if (chip) setChips((prev) => ({ ...prev, [chip.messageSeq]: chip }));
      setSession(out.session);
      if (!out.pupilMessage) setCeilingReached(true); // the message ceiling of record
    } catch (err) {
      fail(err);
    } finally {
      setSending(false);
    }
  };

  /* -- end (route 3) + poll (route 5) ----------------------------------- */
  const pollForReview = useCallback(
    (sessionId: string, attempt = 0) => {
      clearPoll();
      const startedAt = Date.now();
      const tick = async () => {
        try {
          const payload = await api.teachMeGetSession(sessionId);
          if (payload.review) {
            setReview(payload.review);
            setPollTimedOut(false);
            return;
          }
          if (attempt + 1 >= POLL_MAX_TRIES) {
            setPollTimedOut(true);
            return;
          }
          setPollElapsed(
            attempt === 0 ? "a moment" : `${Math.round((Date.now() - startedAt) / 1000)}s`,
          );
          pollTimer.current = setTimeout(() => pollForReview(sessionId, attempt + 1), POLL_INTERVAL_MS);
        } catch {
          // a transient poll miss must not kill the wait — retry honestly
          if (attempt + 1 >= POLL_MAX_TRIES) {
            setPollTimedOut(true);
            return;
          }
          pollTimer.current = setTimeout(() => pollForReview(sessionId, attempt + 1), POLL_INTERVAL_MS);
        }
      };
      void tick();
    },
    [clearPoll],
  );

  const endSession = async () => {
    if (!session) return;
    setEnding(true);
    setFailure(null);
    try {
      const out = await api.teachMeEndSession(session.id);
      setSession((s) => (s ? { ...s, status: out.status } : s));
      setEndArmed(false);
      if (out.review) {
        setReview(out.review);
      } else {
        setReview(null);
        setPollElapsed("a moment");
        setPollTimedOut(false);
        pollForReview(session.id);
      }
      setView({ name: "review" });
    } catch (err) {
      fail(err);
    } finally {
      setEnding(false);
    }
  };

  /* -- history (route 4) + permalink (route 5) --------------------------- */
  const openHistory = async () => {
    setFailure(null);
    try {
      const out = await api.teachMeListSessions(course);
      setHistory(out.items);
      setView({ name: "history" });
    } catch (err) {
      fail(err);
    }
  };

  const openSession = async (sessionId: string) => {
    setFailure(null);
    try {
      const payload = await api.teachMeGetSession(sessionId);
      if (payload.session.status === "active") {
        setSession(payload.session);
        setTranscript(
          payload.transcript.map((row) => ({
            id: row.id,
            seq: row.seq,
            role: row.role,
            kind: row.kind,
            text: row.text,
          })),
        );
        setChips({}); // chips live only in the live responses — the server re-derives on next turn
        setEndArmed(false);
        setCeilingReached(false); // the ceiling law re-arms server-side on the next send
        setView({ name: "player" });
        return;
      }
      setDetail(payload);
      if (payload.review) setReview(payload.review);
      setView({ name: "detail" });
    } catch (err) {
      fail(err);
    }
  };

  /* -- review_pending detail keeps polling too --------------------------- */
  useEffect(() => {
    if (view.name === "detail" && detail && !detail.review && detail.session.status === "review_pending") {
      pollForReview(detail.session.id);
      return () => clearPoll();
    }
  }, [view.name, detail, pollForReview, clearPoll]);

  // a poll that lands while the detail view is open completes the detail
  useEffect(() => {
    if (view.name === "detail" && detail && review && !detail.review) {
      setDetail({ ...detail, review });
    }
  }, [view.name, detail, review]);

  const failureBanner = failure && (
    <div
      role="alert"
      className={`mx-auto mb-4 max-w-3xl rounded-lg border px-4 py-3 text-sm leading-relaxed ${
        failure.cls === "guardrail"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : failure.cls === "provider" || failure.cls === "network"
            ? "border-border bg-muted/50"
            : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
      }`}
    >
      <p className="font-medium">{failure.headline}</p>
      {failure.detail && <p className="mt-0.5 text-[13px] opacity-90">{failure.detail}</p>}
      {(failure.cls === "provider" || failure.cls === "network" || failure.cls === "unknown") && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => setFailure(null)}
        >
          Dismiss
        </Button>
      )}
    </div>
  );

  return (
    <div>
      {/* view switcher */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          {view.name !== "wizard" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearPoll();
                setView({ name: "wizard" });
              }}
            >
              ← New session
            </Button>
          )}
          {view.name === "player" && (
            <span className="text-muted-foreground">
              Teaching {courseLabel} — keep going, the Pupil is listening.
            </span>
          )}
          {view.name === "review" && <span className="text-muted-foreground">Session review</span>}
          {view.name === "history" && <span className="text-muted-foreground">Your sessions</span>}
          {view.name === "detail" && (
            <span className="text-muted-foreground">Session of record</span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={openHistory}>
          History
        </Button>
      </div>

      {failureBanner}

      {view.name === "wizard" && (
        <TeachMeWizard topics={topics} onStart={start} busy={busy} />
      )}

      {view.name === "player" && session && (
        <>
          {Object.keys(chips).length === 0 && session.messageCount === 0 && (
            <p className="mx-auto mb-3 max-w-3xl text-center text-xs text-muted-foreground">
              Explain the first objective in your own words — verdict chips appear under
              each of your replies.
            </p>
          )}
          <TeachMePlayer
            session={session}
            transcript={transcript}
            chips={chips}
            sending={sending}
            ceilingReached={ceilingReached}
            onSend={send}
            onEnd={endSession}
            ending={ending}
            endArmed={endArmed}
            onArmEnd={() => setEndArmed((v) => !v)}
          />
        </>
      )}

      {view.name === "review" &&
        (review ? (
          <TeachMeReview review={review} />
        ) : (
          <ReviewPending
            elapsedLabel={pollElapsed}
            timedOut={pollTimedOut}
            onRefresh={() => session && pollForReview(session.id, POLL_MAX_TRIES - 1)}
          />
        ))}

      {view.name === "history" &&
        (history ? (
          <TeachMeHistory items={history} onOpen={openSession} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ))}

      {view.name === "detail" && detail && (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                {detail.session.status === "review_pending"
                  ? "Review generating"
                  : detail.session.status}
              </span>{" "}
              · taught {detail.session.specPointIds.join(" · ")} ·{" "}
              {detail.session.messageCount} turns
            </p>
            <p className="mt-1">
              The live verdict chips aren&apos;t kept after the session — the review card
              below is the durable record.
            </p>
          </div>
          {detail.review ? (
            <TeachMeReview review={detail.review} />
          ) : detail.session.status === "review_pending" ? (
            <ReviewPending
              elapsedLabel={pollElapsed}
              timedOut={pollTimedOut}
              onRefresh={() => pollForReview(detail.session.id, POLL_MAX_TRIES - 1)}
            />
          ) : (
            <TeachMePlayer
              session={detail.session}
              transcript={detail.transcript.map((row) => ({
                id: row.id,
                seq: row.seq,
                role: row.role,
                kind: row.kind,
                text: row.text,
              }))}
              chips={{}}
              sending={false}
              ceilingReached
              onSend={() => undefined}
              onEnd={endSession}
              ending={ending}
              endArmed={endArmed}
              onArmEnd={() => setEndArmed((v) => !v)}
            />
          )}
        </div>
      )}
    </div>
  );
}
