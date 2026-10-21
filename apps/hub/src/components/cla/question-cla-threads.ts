"use client";

import { useSyncExternalStore } from "react";

/**
 * Question-CLA thread store — DC-6 phase 2a
 * (docs/DC6-QUESTION-CLA-HISTORY-PLAN.md).
 *
 * A structural mirror of the assistant's local thread store
 * (../../app/assistant/assistant-threads.ts), itself a mirror of the tutor's:
 * module-level state + useSyncExternalStore, custom listener set for same-tab
 * reactivity, storage event for cross-tab, throttled trailing persist, honest
 * in-memory degradation when localStorage is unavailable. Zero imports from
 * any client component or other surface — the message union below is a
 * disclosed structural copy of question-cla-overlay.tsx's QuestionClaMessage
 * (plan §2), so overlay and store stay decoupled and the other surfaces stay
 * out of the blast radius entirely.
 *
 * Posture (plan §3 deviation 1): threads are device-local. The operator's
 * ruling of record (trace 1a15a73da1a77c05) makes DB-backed, cross-device
 * history the end-state; `sessionId` is the seam where the tutor's §22-style
 * sync tier slots in (null = local-only thread). The sync tier is a filed,
 * sequenced follow-up — this store is shaped so it lands without migration.
 *
 * One write path — commitQuestionClaMessages(questionId, update, meta) —
 * accepts the SAME payload the player historically forwarded to React state
 * (array or functional updater) and resolves it against STORE state, keeping
 * the fresh-prev race law: a mid-flight ask's turns can never drop (plan §4d).
 */

import type { ClaAnswerView } from "@/lib/types";

/** Structural copy of the overlay's QuestionClaMessage union (plan §2). */
export type QuestionClaStoredMessage =
  | { kind: "user"; text: string; at: number }
  | { kind: "assistant"; result: ClaAnswerView; at: number }
  | { kind: "gate"; text: string; at: number }
  | { kind: "error"; text: string; question: string; at: number };

export interface QuestionClaThread {
  id: string;
  /** the hub question id — the player's vocabulary, one active thread per question */
  questionId: string;
  /** 1-based display number of the card at ask time (history-list context) */
  questionNumber: number | null;
  /** V53 discipline: the course this thread was asked under */
  courseSlug?: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: QuestionClaStoredMessage[];
  /** creation order — deterministic eviction tie-break (clock ties are real:
   *  fast asks and test loops land in the same millisecond) */
  seq?: number;
  /** §22 sync-tier seam (plan §1): the future server session; null = local-only */
  sessionId?: string | null;
}

/** The player's historical setMessages payload — forwarded untouched. */
export type QuestionClaMessagesUpdate =
  | QuestionClaStoredMessage[]
  | ((prev: QuestionClaStoredMessage[]) => QuestionClaStoredMessage[]);

const KEY = "syllabai.claThreads.v1";
const ACTIVE_KEY = "syllabai.claThreads.activeByQuestion.v1";

/** storage guards — keep localStorage bounded (family parity; heavier
 *  messages: the CLA answer view carries citations + tools, hence 100) */
const MAX_THREADS = 40;
const MAX_MESSAGES_PER_THREAD = 100;

interface StoredState {
  threads: QuestionClaThread[];
  activeByQuestion: Record<string, string | null>;
}

/** monotonic creation counter — survives reload via load()'s derive step */
let seqCounter = 0;
let state: StoredState = load();
const listeners = new Set<() => void>();

/** Stored-message validation: a malformed entry is dropped, never thrown. */
function validMessage(m: unknown): m is QuestionClaStoredMessage {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  if (typeof x.at !== "number") return false;
  switch (x.kind) {
    case "user":
    case "gate":
      return typeof x.text === "string";
    case "error":
      return typeof x.text === "string" && typeof x.question === "string";
    case "assistant":
      return !!x.result && typeof x.result === "object";
    default:
      return false;
  }
}

function load(): StoredState {
  const s =
    typeof window === "undefined" ? { threads: [], activeByQuestion: {} } : loadFromStorage();
  // seq continuity: new threads must sort AFTER everything already stored
  seqCounter = s.threads.reduce((m, t) => Math.max(m, t.seq ?? 0), 0) + 1;
  return s;
}

function loadFromStorage(): StoredState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { threads: [], activeByQuestion: {} };
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed.threads)) return { threads: [], activeByQuestion: {} };
    const threads = parsed.threads
      .filter(
        (t) =>
          t &&
          typeof t.id === "string" &&
          typeof t.questionId === "string" &&
          typeof t.title === "string" &&
          Array.isArray(t.messages),
      )
      .map((t) => ({ ...t, messages: t.messages.filter(validMessage) }))
      .slice(0, MAX_THREADS);
    const activeByQuestion: Record<string, string | null> = {};
    const claimed = parsed.activeByQuestion && typeof parsed.activeByQuestion === "object"
      ? parsed.activeByQuestion
      : {};
    for (const [qid, tid] of Object.entries(claimed)) {
      if (typeof tid === "string" && threads.some((t) => t.id === tid && t.questionId === qid)) {
        activeByQuestion[qid] = tid;
      }
    }
    return { threads, activeByQuestion };
  } catch {
    return { threads: [], activeByQuestion: {} };
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(state.activeByQuestion));
  } catch {
    // quota exceeded / private mode — the session still works in memory
  }
}

/** Trailing-edge throttle: disk writes wait (family parity). */
function emit() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist();
  }, 400);
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === ACTIVE_KEY) {
      state = load();
      for (const l of listeners) l();
    }
  });
}

let snap = { threads: state.threads, activeByQuestion: state.activeByQuestion };

function commit(next: Partial<StoredState>) {
  state = { ...state, ...next };
  snap = { threads: state.threads, activeByQuestion: state.activeByQuestion };
  emit();
}

/** Stable server snapshot — a fresh object per call would loop (React req). */
const EMPTY_SNAPSHOT: StoredState = { threads: [], activeByQuestion: {} };

export function useQuestionClaSnapshot(): StoredState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
    () => EMPTY_SNAPSHOT,
  );
}

export function getActiveThreadFor(questionId: string): QuestionClaThread | null {
  const id = state.activeByQuestion[questionId];
  return (id && state.threads.find((t) => t.id === id)) || null;
}

/** All threads for a question, newest-updated first (tests + future rail). */
export function threadsForQuestion(questionId: string): QuestionClaThread[] {
  return state.threads.filter((t) => t.questionId === questionId);
}

/** Point a question at one of ITS threads (restore), or detach (archive view). */
export function setActiveQuestionThread(questionId: string, threadId: string | null) {
  if (threadId !== null) {
    const t = state.threads.find((th) => th.id === threadId);
    if (!t || t.questionId !== questionId) return; // a thread never crosses questions
  }
  commit({ activeByQuestion: { ...state.activeByQuestion, [questionId]: threadId } });
}

export function newThreadId(): string {
  return `qc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Title case: first user message, trimmed to a readable label (family law). */
export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  return t.length > 52 ? `${t.slice(0, 52).trimEnd()}…` : t;
}

export function relativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface QuestionClaCommitMeta {
  questionNumber?: number | null;
  courseSlug?: string | null;
}

/**
 * The ONE write path (plan §2): resolve the player's forwarded payload
 * against store state (fresh-prev race law), then either archive
 * (empty resolve — "New chat": pointer cleared, thread kept for revisit) or
 * ensure the active thread and replace its messages (created on the first
 * ask, never on page load; title = first user turn).
 */
export function commitQuestionClaMessages(
  questionId: string,
  update: QuestionClaMessagesUpdate,
  meta?: QuestionClaCommitMeta,
) {
  const active = getActiveThreadFor(questionId);
  const current = active?.messages ?? [];
  const next = typeof update === "function" ? update(current) : update;

  if (next.length === 0) {
    if (!active) return; // nothing to archive
    commit({ activeByQuestion: { ...state.activeByQuestion, [questionId]: null } });
    return;
  }

  let thread = active;
  if (!thread) {
    const now = Date.now();
    thread = {
      id: newThreadId(),
      questionId,
      questionNumber: meta?.questionNumber ?? null,
      courseSlug: meta?.courseSlug ?? null,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      messages: [],
      seq: seqCounter++,
      sessionId: null,
    };
  }

  const updated: QuestionClaThread = {
    ...thread,
    messages: next.slice(-MAX_MESSAGES_PER_THREAD),
    title:
      thread.messages.length === 0 && next[0]?.kind === "user" ? titleFrom(next[0].text) : thread.title,
    ...(meta?.questionNumber != null ? { questionNumber: meta.questionNumber } : {}),
    ...(meta?.courseSlug != null ? { courseSlug: meta.courseSlug } : {}),
  };

  const rest = state.threads.filter((t) => t.id !== updated.id);
  let threads = [updated, ...rest];
  if (threads.length > MAX_THREADS) {
    // cap: evict oldest-updated among the NON-active threads — the thread
    // being written is protected by construction
    const overflow = threads.length - MAX_THREADS;
    const byOldest = rest
      .slice()
      .sort((a, b) => a.updatedAt - b.updatedAt || (a.seq ?? 0) - (b.seq ?? 0));
    const evict = new Set(byOldest.slice(0, overflow).map((t) => t.id));
    threads = threads.filter((t) => !evict.has(t.id));
  }
  commit({
    threads,
    activeByQuestion: { ...state.activeByQuestion, [questionId]: updated.id },
  });
}

// ── sync-tier functions (DC-6 phase 3; docs/DC6-CLA-SYNC-TIER-PLAN.md §4) ──
// The local store stays the source of truth; the server is a best-effort
// full-state mirror. These three functions are the store's ENTIRE sync
// surface — the sync loop lives in question-cla-sync.ts (component layer),
// so this module keeps its zero-imports decoupling law.

/** Bind a local thread to its server anchor (the lazy-bind moment, the
 *  tutor's bindSession law). A thread never crosses questions; the FIRST
 *  binding wins (recovery goes through unbind — a stale-server rebinding is
 *  never silent). */
export function bindQuestionClaSession(
  questionId: string,
  localThreadId: string,
  serverThreadId: string,
) {
  const t = state.threads.find((th) => th.id === localThreadId);
  if (!t || t.questionId !== questionId) return; // a thread never crosses questions
  if (t.sessionId != null) return; // first binding wins (monotonic, idempotent)
  commit({
    threads: state.threads.map((th) =>
      th.id === localThreadId ? { ...th, sessionId: serverThreadId } : th,
    ),
  });
}

/** Drop the binding: a 404 said the server thread is gone. Deletion is
 *  respected — the thread stays local-only and is NOT re-created for the
 *  rest of the session (the sync module owns the drop marker). */
export function unbindQuestionClaSession(localThreadId: string) {
  const t = state.threads.find((th) => th.id === localThreadId);
  if (!t || t.sessionId == null) return;
  commit({
    threads: state.threads.map((th) =>
      th.id === localThreadId ? { ...th, sessionId: null } : th,
    ),
  });
}

/** One hydrated server thread (the sync module maps the wire view to this
 *  shape — messages are the LOCAL union; `result` not `payload`). */
export interface HydratedClaThread {
  sessionId: string;
  title: string;
  questionNumber: number | null;
  courseSlug: string | null;
  createdAt: number;
  updatedAt: number;
  messages: QuestionClaStoredMessage[];
}

/**
 * Upsert server threads that are NOT already bound locally (local wins — a
 * bound thread is never clobbered; plan §4). Hydration NEVER moves the
 * active pointer (restore stays an explicit user act) and respects the
 * family caps. Returns how many threads were added.
 */
export function hydrateQuestionClaThreads(
  questionId: string,
  incoming: HydratedClaThread[],
): number {
  const bound = new Set(
    state.threads
      .filter((t) => t.questionId === questionId && t.sessionId != null)
      .map((t) => t.sessionId as string),
  );
  const fresh = incoming.filter(
    (s) => !bound.has(s.sessionId) && s.messages.length > 0,
  );
  if (fresh.length === 0) return 0;
  const now = Date.now();
  const additions: QuestionClaThread[] = fresh.map((s) => ({
    id: newThreadId(),
    questionId,
    questionNumber: s.questionNumber,
    courseSlug: s.courseSlug,
    title: s.title,
    createdAt: s.createdAt || now,
    updatedAt: s.updatedAt || now,
    messages: s.messages.filter(validMessage).slice(-MAX_MESSAGES_PER_THREAD),
    seq: seqCounter++,
    sessionId: s.sessionId,
  }));
  // stale pointers (a thread evicted earlier without a pointer cleanup)
  // protect nothing — only pointers to LIVE threads count (family law)
  const liveIds = new Set(state.threads.map((t) => t.id));
  const activeIds = new Set(
    Object.values(state.activeByQuestion).filter(
      (v): v is string => v != null && liveIds.has(v),
    ),
  );
  let threads = [...state.threads, ...additions];
  if (threads.length > MAX_THREADS) {
    // cap: evict oldest-updated among the non-active, non-addition threads;
    // hydration NEVER evicts a just-fetched thread in favor of nothing —
    // under full pressure the OLDEST ADDITIONS yield (and the return count
    // discloses exactly how many landed). The rail follow-up (delete
    // wiring) is the pressure relief valve.
    const additionIds = new Set(additions.map((a) => a.id));
    const overflow = threads.length - MAX_THREADS;
    const evictable = threads
      .filter((t) => !activeIds.has(t.id) && !additionIds.has(t.id))
      .sort((a, b) => a.updatedAt - b.updatedAt || (a.seq ?? 0) - (b.seq ?? 0));
    const evict = new Set(evictable.slice(0, Math.max(0, overflow)).map((t) => t.id));
    if (evict.size < overflow) {
      const oldestAdditions = additions
        .filter((a) => !evict.has(a.id))
        .sort((a, b) => a.updatedAt - b.updatedAt || (a.seq ?? 0) - (b.seq ?? 0));
      for (const t of oldestAdditions) {
        if (evict.size >= overflow) break;
        evict.add(t.id);
      }
    }
    threads = threads.filter((t) => !evict.has(t.id));
  }
  commit({ threads });
  const survivorIds = new Set(threads.map((t) => t.id));
  return additions.filter((a) => survivorIds.has(a.id)).length;
}

// ── rail management verbs (DC-6 phase 3c; docs/DC6-QUESTION-RAIL-VERBS-PLAN.md) ──
// The question rail's rename/delete/undo slice: the SAME family laws the
// assistant rail shipped in phase 3b (assistant-threads.ts renameThread /
// deleteThread / insertThread, copy-adapt — zero cross-surface imports).
// The network half of each verb lives in question-cla-sync.ts (component
// layer), so this module keeps its zero-imports decoupling law.

/**
 * Rename one thread (the rail's rename verb). Whitespace is collapsed and
 * the draft is capped at 80 like the assistant's; an empty result keeps the
 * old title. `updatedAt` moves (the rail sorts newest-updated first) and the
 * fresh row is RETURNED so the sync module can mirror the exact state it
 * renamed (null = unknown id — a no-op).
 */
export function renameQuestionClaThread(threadId: string, title: string): QuestionClaThread | null {
  const existing = state.threads.find((t) => t.id === threadId);
  if (!existing) return null;
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  const updated: QuestionClaThread = {
    ...existing,
    title: clean || existing.title,
    updatedAt: Date.now(),
  };
  commit({ threads: state.threads.map((t) => (t.id === threadId ? updated : t)) });
  return updated;
}

/**
 * Delete one thread outright (the rail's delete verb, the local half — the
 * drop marker + the server DELETE are the sync module's). A thread never
 * crosses questions, so at most the OWNING question's active pointer can
 * reference it; it is cleared to null exactly like an archive (stale
 * pointers protect nothing — the family law).
 */
export function deleteQuestionClaThread(threadId: string) {
  const threads = state.threads.filter((t) => t.id !== threadId);
  const activeByQuestion: Record<string, string | null> = {};
  for (const [qid, tid] of Object.entries(state.activeByQuestion)) {
    activeByQuestion[qid] = tid === threadId ? null : tid;
  }
  commit({ threads, activeByQuestion });
}

/**
 * Restore a snapshotted thread at its SAME id (the undo leg of delete — the
 * assistant's insertThread law). Caps respected; the caller decides whether
 * the owning question's active pointer moves (the rail only ever deletes
 * NON-active threads, so undo passes false — restore stays an explicit act).
 */
export function insertQuestionClaThread(thread: QuestionClaThread, makeActive: boolean) {
  const threads = [thread, ...state.threads.filter((t) => t.id !== thread.id)].slice(0, MAX_THREADS);
  const activeByQuestion = { ...state.activeByQuestion };
  if (makeActive) activeByQuestion[thread.questionId] = thread.id;
  commit({ threads, activeByQuestion });
}
