"use client";

/**
 * The assistant surface's sync loop — DC-6 phase 3b
 * (docs/DC6-ASSISTANT-SURFACE-SYNC-PLAN.md §4).
 *
 * The question surface's sync laws (question-cla-sync.ts, phase 3), copied
 * per the family's disclosed copy-adapt style — the two modules stay
 * decoupled so neither surface's blast radius reaches the other:
 *
 * - the LOCAL store is the source of truth; the server is a best-effort
 *   full-state MIRROR (the operator's DB ruling, trace 1a15a73da1a77c05);
 * - fire-once, no POST/PUT retry (the hub request<T>() retries GETs only) —
 *   a failed mirror leaves a local-only gap, disclosed;
 * - a 404 on PUT/DELETE says the server thread is gone (deleted elsewhere):
 *   unbind + drop marker, the thread is NOT re-created for the rest of the
 *   session — deletion is respected;
 * - a LOCAL delete of a bound thread propagates the server DELETE
 *   (fire-and-forget): an unwired delete would resurrect the thread on
 *   every hydration — the deletion-respected law demands the call site
 *   (plan §5.4);
 * - hydration is once-per-session, per-thread fetch failures skip that
 *   thread (the s143 discipline), and NEVER move the active pointer;
 * - everything is silent-failure: a logged-out learner or a network error
 *   degrades to exactly the phase-1 local-only behavior.
 *
 * Module scope, zero React — called from AssistantClient's ask commits and
 * mount effect, and from the history rail's rename/delete handlers.
 */

import { ApiError, api, getToken } from "@/lib/api";
import type { ClaAssistantThreadView } from "@/lib/types";
import {
  bindAssistantSession,
  getAssistantThread,
  hydrateAssistantThreads,
  unbindAssistantSession,
  type AssistantMessage,
  type AssistantThread,
  type HydratedAssistantThread,
} from "./assistant-threads";
import {
  fromWireAssistantMessage,
  MIRROR_TRANSCRIPT_CAP,
  toWireAssistantMessage,
} from "./assistant-sync-wire";

/** trailing debounce per thread — one mirror PUT per ask burst, not one per
 *  message commit (the user + assistant legs commit separately). */
const SYNC_DEBOUNCE_MS = 800;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** local thread ids whose server anchor 404'd or was deleted locally —
 *  never re-created this session */
const droppedThreads = new Set<string>();
/** hydration is once per session (the mount effect refires per navigation) */
let hydratedThisSession = false;

/** Schedule a debounced full-state mirror of ONE thread (the active thread
 *  after an ask; a renamed thread after a rename — not only the active one). */
export function scheduleAssistantSync(threadId: string): void {
  if (typeof window === "undefined") return;
  if (!getToken()) return;
  const prev = timers.get(threadId);
  if (prev) clearTimeout(prev);
  timers.set(
    threadId,
    setTimeout(() => {
      timers.delete(threadId);
      void syncAssistantThread(threadId);
    }, SYNC_DEBOUNCE_MS),
  );
}

async function syncAssistantThread(threadId: string): Promise<void> {
  const thread = getAssistantThread(threadId);
  if (!thread || thread.messages.length === 0) return; // nothing to mirror
  if (thread.sessionId == null && droppedThreads.has(thread.id)) return;
  try {
    let sessionId = thread.sessionId;
    if (sessionId == null) {
      // the lazy-bind moment (the tutor's bindSession law): create the
      // server anchor once, bind it into the store, then mirror
      const created = await api.claAssistantThreadCreate({
        surface: "assistant",
        courseSlug: thread.courseSlug ?? null,
        title: thread.title,
      });
      sessionId = created.threadId;
      bindAssistantSession(thread.id, sessionId);
    }
    await api.claAssistantThreadSync(sessionId, {
      title: thread.title,
      courseSlug: thread.courseSlug ?? null,
      messages: thread.messages.slice(-MIRROR_TRANSCRIPT_CAP).map(toWireAssistantMessage),
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && thread.sessionId != null) {
      // the server thread is gone (deleted elsewhere) — respect deletion
      droppedThreads.add(thread.id);
      unbindAssistantSession(thread.id);
    }
    // every other failure is silent — the local tier stays the source of truth
  }
}

/**
 * A locally-deleted thread: the drop marker goes up FIRST (the debounced
 * timer can never re-create it), then the server DELETE fires when the
 * thread was bound. Fire-and-forget — a failed DELETE leaves the server row
 * until the durable deletion-propagation follow-up (disclosed, plan §5.4).
 */
export function notifyAssistantThreadDeleted(thread: AssistantThread): void {
  if (typeof window === "undefined") return;
  droppedThreads.add(thread.id);
  const prev = timers.get(thread.id);
  if (prev) {
    clearTimeout(prev);
    timers.delete(thread.id);
  }
  if (thread.sessionId == null || !getToken()) return;
  void api.claThreadDelete(thread.sessionId).catch(() => {
    // silent — the drop marker already prevents re-mirror this session
  });
}

/** Hydrate the learner's server-side assistant threads into the local store
 *  (once per session; the rail's course filter does the scoping after). */
export async function hydrateAssistantFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!getToken()) return;
  if (hydratedThisSession) return;
  hydratedThisSession = true;
  try {
    const summaries = await api.claThreadList({ surface: "assistant" });
    if (!Array.isArray(summaries) || summaries.length === 0) return;
    // transcripts ride a per-thread fetch (the s143 discipline); an
    // individual failure skips that thread, never the hydration
    const views = await Promise.all(
      summaries
        .filter((s) => s.surface === "assistant")
        .map((s) => api.claAssistantThreadGet(s.threadId).catch(() => null)),
    );
    const incoming: HydratedAssistantThread[] = views
      .filter((v): v is ClaAssistantThreadView => v != null)
      .map((v) => ({
        sessionId: v.threadId,
        title: v.title,
        courseSlug: v.courseSlug,
        createdAt: Date.parse(v.createdAt) || 0,
        updatedAt: Date.parse(v.lastActiveAt) || 0,
        messages: v.messages
          .map(fromWireAssistantMessage)
          .filter((m): m is AssistantMessage => m != null),
      }));
    hydrateAssistantThreads(incoming);
  } catch {
    // silent — the sync tier is best-effort (plan §5)
  }
}
