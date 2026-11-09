"use client";

/**
 * T-TEACHGENIE-001 — the Teach Genie client orchestrator. Same five learner
 * routes of record as the Teach-Me engine it fronts (create → player → end →
 * poll → review, plus history/permalink), rendered in the house design
 * system (T-TEACHGENIE-004 — the lane rejoined the hub's token sheet and
 * CourseHeader chrome; the MG skin is retired):
 *
 *   landing (hero + recent sessions) → picker → session → Session Complete
 *   overlay → review (transcript + review card) — with permalinks reopening
 *   as the read-only chat + review sections.
 *
 * Every law stays server-side (quota, ceilings, word floor, overlap, D2);
 * this component renders contract-shaped truth and fails honest via
 * classifyTeachMeFailure (the server's learner-honest copy verbatim).
 * Verdict chips exist only in live responses — a resumed session renders
 * the transcript without them and says nothing untrue.
 */
import { useCallback, useEffect, useState } from "react";
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
import { classifyTeachMeFailure, type TeachMeFailure } from "@/components/hub/teach-me/errors";
import type { TeachGeniePickerNoteTopic } from "@/components/hub/teach-me/picker-data";
import { TeachGenieLanding, type TeachGeniePreviewRow } from "./landing";
import { TeachGeniePicker } from "./picker";
import { TeachGenieSession, type TeachGenieTranscriptRow } from "./session-screen";
import { TeachGenieReview } from "./review-screen";

type View =
  | { name: "landing" }
  | { name: "picker" }
  | { name: "session"; showComplete: boolean }
  | { name: "review" };

export interface TeachGenieClientProps {
  course: string;
  courseLabel: string;
  /** T-TEACHGENIE-002: the course's revision notes under unit/topic dropdowns. */
  noteTree: TeachGeniePickerNoteTopic[];
}

function openingRow(session: TeachSession, opening: PupilMessage): TeachGenieTranscriptRow {
  return {
    id: `${session.id}-0-opening`,
    seq: 0,
    role: "pupil",
    kind: opening.kind,
    text: opening.text,
  };
}

export function TeachGenieClient({ course, courseLabel, noteTree }: TeachGenieClientProps) {
  const [view, setView] = useState<View>({ name: "landing" });
  const [session, setSession] = useState<TeachSession | null>(null);
  const [transcript, setTranscript] = useState<TeachGenieTranscriptRow[]>([]);
  const [chips, setChips] = useState<Record<number, VerdictChip>>({});
  const [review, setReview] = useState<ReviewCard | null>(null);
  const [failure, setFailure] = useState<TeachMeFailure | null>(null);
  const [busy, setBusy] = useState(false); // create in flight
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const [ceilingReached, setCeilingReached] = useState(false);
  const [history, setHistory] = useState<SessionHistoryItem[] | null>(null);
  const [preview, setPreview] = useState<TeachGeniePreviewRow[] | null>(null);

  /* -- landing data: history + the latest session's first exchanges ------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = await api.teachMeListSessions(course);
        if (cancelled) return;
        setHistory(out.items);
        const latest = out.items[0];
        if (latest) {
          const detail = await api.teachMeGetSession(latest.sessionId);
          if (cancelled) return;
          setPreview(
            detail.transcript.slice(0, 4).map((row) => ({
              id: row.id,
              role: row.role,
              text: row.text.length > 120 ? `${row.text.slice(0, 117)}…` : row.text,
            })),
          );
        }
      } catch {
        // signed-out or provider-down: the hero still renders (typing dots),
        // the rail simply stays hidden — no fabricated history.
        if (!cancelled) setHistory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [course]);

  const fail = (err: unknown) => {
    setFailure(classifyTeachMeFailure(err));
    setBusy(false);
    setSending(false);
    setEnding(false);
  };

  /* -- create (route 1) --------------------------------------------------- */
  const start = async (
    body: Omit<CreateSessionRequest, "courseId" | "mode"> & { mode?: CreateSessionRequest["mode"] },
  ) => {
    setBusy(true);
    setFailure(null);
    try {
      const out = await api.teachMeCreateSession({ ...body, mode: body.mode ?? "chat", courseId: course });
      setSession(out.session);
      setTranscript([openingRow(out.session, out.opening)]);
      setChips({});
      setEndArmed(false);
      setCeilingReached(false);
      setView({ name: "session", showComplete: false });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /* -- message (route 2) --------------------------------------------------- */
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
      if (out.chip) setChips((prev) => ({ ...prev, [out.chip!.messageSeq]: out.chip! }));
      setSession(out.session);
      if (!out.pupilMessage) setCeilingReached(true);
    } catch (err) {
      fail(err);
    } finally {
      setSending(false);
    }
  };

  /* -- end (route 3): complete overlay, review generates async ------------- */
  const endSession = async () => {
    if (!session) return;
    setEnding(true);
    setFailure(null);
    try {
      const out = await api.teachMeEndSession(session.id);
      setSession((s) => (s ? { ...s, status: out.status } : s));
      setEndArmed(false);
      if (out.review) setReview(out.review);
      else setReview(null);
      setView({ name: "session", showComplete: true });
    } catch (err) {
      fail(err);
    } finally {
      setEnding(false);
    }
  };

  /* -- permalink refresh (route 5 — also the review poll law) -------------- */
  const refreshDetail = useCallback(async () => {
    if (!session) return;
    const payload = await api.teachMeGetSession(session.id);
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
    if (payload.review) setReview(payload.review);
  }, [session]);

  /* -- history / permalink open -------------------------------------------- */
  const openSession = async (sessionId: string) => {
    setFailure(null);
    try {
      const payload = await api.teachMeGetSession(sessionId);
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
      setReview(payload.review);
      setChips({}); // chips live only in the live responses
      setEndArmed(false);
      setCeilingReached(false);
      setView({ name: "session", showComplete: false });
    } catch (err) {
      fail(err);
    }
  };

  const openReview = () => {
    setView({ name: "review" });
  };

  const backToLanding = () => {
    // refresh the rail + preview so the landing reflects what just happened
    api
      .teachMeListSessions(course)
      .then((out) => setHistory(out.items))
      .catch(() => undefined);
    setView({ name: "landing" });
  };

  const failureBanner = failure && (
    <div
      role="alert"
      className={`mb-4 w-full rounded-lg border px-4 py-3 text-sm leading-relaxed ${
        failure.cls === "guardrail"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : failure.cls === "provider" || failure.cls === "network"
            ? "border-border bg-muted/50 text-foreground"
            : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
      }`}
    >
      <p className="font-medium">{failure.headline}</p>
      {failure.detail && <p className="mt-0.5 text-xs opacity-90">{failure.detail}</p>}
      {(failure.cls === "provider" || failure.cls === "network" || failure.cls === "unknown") && (
        <button
          type="button"
          onClick={() => setFailure(null)}
          className="mt-2 cursor-pointer rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
        >
          Dismiss
        </button>
      )}
    </div>
  );

  return (
    <div className="flex w-full flex-col" data-testid="teach-genie-root">
      {failureBanner}

      {view.name === "landing" && (
        <TeachGenieLanding
          courseLabel={courseLabel}
          history={history}
          preview={preview}
          starting={busy}
          onStart={() => setView({ name: "picker" })}
          onOpenSession={openSession}
        />
      )}

      {view.name === "picker" && (
        <TeachGeniePicker noteTree={noteTree} courseLabel={courseLabel} busy={busy} onStart={start} onBack={backToLanding} />
      )}

      {view.name === "session" && session && (
        <TeachGenieSession
          courseSlug={course}
          session={session}
          transcript={transcript}
          chips={chips}
          sending={sending}
          readOnly={session.status !== "active"}
          ceilingReached={ceilingReached}
          ending={ending}
          endArmed={endArmed}
          showComplete={view.showComplete && session.status !== "active"}
          onCompleteDismiss={() => setView({ name: "session", showComplete: false })}
          onViewReview={openReview}
          onSend={send}
          onEnd={endSession}
          onArmEnd={() => setEndArmed((v) => !v)}
          onBack={backToLanding}
        />
      )}

      {view.name === "review" && session && (
        <TeachGenieReview
          session={session}
          transcript={transcript}
          review={review}
          courseLabel={courseLabel}
          refresh={refreshDetail}
          onBack={() => setView({ name: "session", showComplete: false })}
        />
      )}
    </div>
  );
}
