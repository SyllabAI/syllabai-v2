"use client";

/**
 * The CLA thread sync loop — DC-6 phase 3
 * (docs/DC6-CLA-SYNC-TIER-PLAN.md §4-5).
 *
 * Laws of record:
 * - the LOCAL store is the source of truth; the server is a best-effort
 *   full-state MIRROR (the operator's DB ruling, trace 1a15a73da1a77c05 —
 *   history follows the learner across devices);
 * - the sync is CLIENT-side because gate/error legs are client renderings
 *   of the ask's 400/409/404/503 — only the client can mirror them (the
 *   server-side append-on-ask design would silently lose them);
 * - fire-once, no POST retry (the hub request<T>() retries GETs only) — a
 *   failed sync leaves a local-only gap, disclosed (plan §5.5);
 * - a PUT 404 says the server thread is gone (deleted elsewhere):
 *   unbind + drop marker, the thread is NOT re-created for the rest of the
 *   session — deletion is respected (plan §4);
 * - hydration NEVER moves the active pointer; restore stays an explicit
 *   user act (the phase-2a restore path, unchanged);
 * - everything is silent-failure: a logged-out learner or a network error
 *   degrades to exactly the phase-2a local-only behavior.
 *
 * Module scope, zero React — called from the player's setMessages adapter
 * (schedule) and the overlay's open effect (hydrate).
 */
import { ApiError, api, getToken } from "@/lib/api";
import type { ClaThreadSyncMessage, ClaThreadView } from "@/lib/types";
import {
  bindQuestionClaSession,
  getActiveThreadFor,
  hydrateQuestionClaThreads,
  unbindQuestionClaSession,
  type HydratedClaThread,
  type QuestionClaStoredMessage,
} from "./question-cla-threads";

/** trailing debounce per question — one mirror PUT per ask burst, not one
 *  per message commit (the user + assistant legs commit separately). */
const SYNC_DEBOUNCE_MS = 800;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** local thread ids whose server anchor 404'd — never re-created this session */
const droppedThreads = new Set<string>();
/** question ids hydrated this session (the overlay's open effect refires) */
const hydratedQuestions = new Set<string>();

/** Schedule a debounced full-state mirror of the question's active thread. */
export function scheduleQuestionClaSync(questionId: string): void {
  if (typeof window === "undefined") return;
  if (!getToken()) return;
  const prev = timers.get(questionId);
  if (prev) clearTimeout(prev);
  timers.set(
    questionId,
    setTimeout(() => {
      timers.delete(questionId);
      void syncActiveThread(questionId);
    }, SYNC_DEBOUNCE_MS),
  );
}

async function syncActiveThread(questionId: string): Promise<void> {
  const thread = getActiveThreadFor(questionId);
  if (!thread || thread.messages.length === 0) return; // nothing to mirror
  if (thread.sessionId == null && droppedThreads.has(thread.id)) return;
  try {
    let sessionId = thread.sessionId;
    if (sessionId == null) {
      // the lazy-bind moment (the tutor's bindSession law): create the
      // server anchor once, bind it into the store, then mirror
      const created = await api.claThreadCreate({
        surface: "question_cla",
        questionId,
        questionNumber: thread.questionNumber ?? null,
        courseSlug: thread.courseSlug ?? null,
        title: thread.title,
      });
      sessionId = created.threadId;
      bindQuestionClaSession(questionId, thread.id, sessionId);
    }
    await api.claThreadSync(sessionId, {
      title: thread.title,
      questionNumber: thread.questionNumber ?? null,
      courseSlug: thread.courseSlug ?? null,
      messages: thread.messages.map(toWireMessage),
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && thread.sessionId != null) {
      // the server thread is gone (deleted elsewhere) — respect deletion
      droppedThreads.add(thread.id);
      unbindQuestionClaSession(thread.id);
    }
    // every other failure is silent — the local tier stays the source of truth
  }
}

/** Hydrate this question's server-side threads into the local store. */
export async function hydrateQuestionClaFromServer(questionId: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!getToken()) return;
  if (hydratedQuestions.has(questionId)) return;
  hydratedQuestions.add(questionId);
  try {
    const summaries = await api.claThreadList({ surface: "question_cla", questionId });
    if (!Array.isArray(summaries) || summaries.length === 0) return;
    // transcripts ride a per-thread fetch (the s143 discipline); an
    // individual failure skips that thread, never the hydration
    const views = await Promise.all(
      summaries.map((s) => api.claThreadGet(s.threadId).catch(() => null)),
    );
    const incoming: HydratedClaThread[] = views
      .filter((v): v is ClaThreadView => v != null)
      .map((v) => ({
        sessionId: v.threadId,
        title: v.title,
        questionNumber: v.questionNumber,
        courseSlug: v.courseSlug,
        createdAt: Date.parse(v.createdAt) || 0,
        updatedAt: Date.parse(v.lastActiveAt) || 0,
        messages: v.messages.map(fromWireMessage),
      }));
    hydrateQuestionClaThreads(questionId, incoming);
  } catch {
    // silent — the sync tier is best-effort (plan §5)
  }
}

/** local union -> wire union (the assistant leg renames result -> payload). */
function toWireMessage(m: QuestionClaStoredMessage): ClaThreadSyncMessage {
  switch (m.kind) {
    case "assistant":
      return { kind: "assistant", at: m.at, payload: m.result };
    case "error":
      return { kind: "error", at: m.at, text: m.text, question: m.question };
    default:
      return { kind: m.kind, at: m.at, text: m.text };
  }
}

/** wire union -> local union (the mirror of toWireMessage). */
function fromWireMessage(m: ClaThreadView["messages"][number]): QuestionClaStoredMessage {
  switch (m.kind) {
    case "assistant":
      return { kind: "assistant", at: m.at, result: m.payload };
    case "error":
      return { kind: "error", at: m.at, text: m.text, question: m.question };
    default:
      return { kind: m.kind, at: m.at, text: m.text };
  }
}
