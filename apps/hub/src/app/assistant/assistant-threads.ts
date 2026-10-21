"use client";

import { useSyncExternalStore } from "react";

/**
 * Assistant conversation store — DC-6 phase 1 (docs/DC6-ASSISTANT-HISTORY-PLAN.md).
 *
 * A structural mirror of the tutor's local thread store
 * (../tutor/threads.ts): module-level state + useSyncExternalStore, custom
 * event for same-tab reactivity, storage event for cross-tab. Deliberate
 * copy-adapt (disclosed in the plan): the two pure helpers (groupThreads,
 * relativeTime) are copied rather than imported so the assistant shares ZERO
 * files, keys, or types with the tutor surface — a tutor thread can never
 * surface here, and editing the tutor surface stays out of this task's blast
 * radius entirely.
 *
 * Phase-1 posture (plan §3 deviation 1): threads are device-local. The §22
 * server pane is a follow-up parity decision; the rail is shaped so it can
 * be added later exactly the way the tutor's was.
 */

import type { TutorCitation } from "@/lib/contracts";

/** The assistant mode enum — kept as string here so the store never imports
 *  from the client component (the client's Mode union assigns into it). */
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  at: number;
  mode?: string;
  citations?: TutorCitation[];
  provider?: string;
  model?: string | null;
  refused?: boolean;
  evidenceCount?: number;
  latencyMs?: number;
  context?: {
    kind: string;
    anchor: string;
    /** nullable of record: the ask response's attempted rides null when the
     *  server hasn't resolved attempt evidence (phase-3b round-trip honesty) */
    attempted?: boolean | null;
  };
}

export interface AssistantThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AssistantMessage[];
  /** V53 discipline (plan §2): the course this thread was started under —
   *  the rail filters slug-to-slug, never by label. */
  courseSlug?: string | null;
  courseLabel?: string | null;
  /** §22 sync-tier seam (phase 3b, plan §4): the server mirror anchor;
   *  null = local-only thread. Load() preserves it across reloads. */
  sessionId?: string | null;
  /** creation order — deterministic eviction tie-break (clock ties are
   *  real: fast asks and test loops land in the same millisecond; the
   *  question store's seq law, phase-3b parity) */
  seq?: number;
}

const KEY = "syllabai.assistant.threads.v1";
const ACTIVE_KEY = "syllabai.assistant.activeThread.v1";
const EVENT = "syllabai:assistant-threads-changed";

/** storage guards — keep localStorage bounded (tutor parity) */
const MAX_THREADS = 40;
const MAX_MESSAGES_PER_THREAD = 200;

interface StoredState {
  threads: AssistantThread[];
  activeId: string | null;
}

let state: StoredState = load();
const listeners = new Set<() => void>();

/** monotonic creation counter — survives reload via load()'s derive step */
let seqCounter = 0;

function load(): StoredState {
  if (typeof window === "undefined") return { threads: [], activeId: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { threads: [], activeId: null };
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed.threads)) return { threads: [], activeId: null };
    const threads = parsed.threads
      .filter((t) => t && typeof t.id === "string" && Array.isArray(t.messages))
      .slice(0, MAX_THREADS);
    // seq continuity: new threads must sort AFTER everything already stored
    seqCounter = threads.reduce((m, t) => Math.max(m, t.seq ?? 0), 0) + 1;
    return {
      threads,
      activeId:
        parsed.activeId && threads.some((t) => t.id === parsed.activeId)
          ? parsed.activeId
          : (threads[0]?.id ?? null),
    };
  } catch {
    return { threads: [], activeId: null };
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.localStorage.setItem(ACTIVE_KEY, state.activeId ?? "");
  } catch {
    // quota exceeded / private mode — the session still works in memory
  }
}

/** Trailing-edge throttle: disk writes wait (tutor parity). */
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

function notifySnapshot() {
  return { threads: state.threads, activeId: state.activeId };
}

let snap = notifySnapshot();

function commit(next: Partial<StoredState>) {
  state = { ...state, ...next };
  snap = notifySnapshot();
  emit();
}

/** Stable server snapshot — a fresh object per call would loop (React req). */
const EMPTY_SNAPSHOT: StoredState = { threads: [], activeId: null };

export function useAssistantSnapshot(): StoredState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
    () => EMPTY_SNAPSHOT,
  );
}

export function getActiveThread(): AssistantThread | null {
  return state.threads.find((t) => t.id === state.activeId) ?? null;
}

export function setActiveThread(id: string | null) {
  commit({ activeId: id });
}

export function newThreadId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Title case: first user message, trimmed to a readable label (tutor parity). */
export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  return t.length > 52 ? `${t.slice(0, 52).trimEnd()}…` : t;
}

export interface AssistantCourseContext {
  slug: string;
  label: string;
}

export function createThread(title = "New chat", course?: AssistantCourseContext | null): AssistantThread {
  const now = Date.now();
  const thread: AssistantThread = {
    id: newThreadId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    seq: seqCounter++,
    ...(course ? { courseSlug: course.slug, courseLabel: course.label } : {}),
  };
  commit({ threads: [thread, ...state.threads].slice(0, MAX_THREADS), activeId: thread.id });
  return thread;
}

/** Ensure there is an active thread (created on first ask, not on page load). */
export function ensureActiveThread(course?: AssistantCourseContext | null): AssistantThread {
  return getActiveThread() ?? createThread("New chat", course);
}

/** Immutably patch one thread; bumps updatedAt and re-orders to the top. */
export function updateThread(id: string, patch: (t: AssistantThread) => AssistantThread) {
  const idx = state.threads.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const updated = patch(state.threads[idx]);
  updated.updatedAt = Date.now();
  const threads = [...state.threads];
  threads.splice(idx, 1);
  commit({ threads: [updated, ...threads] });
}

export function appendMessages(threadId: string, msgs: AssistantMessage[]) {
  updateThread(threadId, (t) => ({
    ...t,
    messages: [...t.messages, ...msgs].slice(-MAX_MESSAGES_PER_THREAD),
    title:
      t.messages.length === 0 && msgs[0]?.role === "user" ? titleFrom(msgs[0].content) : t.title,
  }));
}

export function renameThread(id: string, title: string) {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  updateThread(id, (t) => ({ ...t, title: clean || t.title }));
}

export function deleteThread(id: string) {
  const threads = state.threads.filter((t) => t.id !== id);
  commit({
    threads,
    activeId: state.activeId === id ? (threads[0]?.id ?? null) : state.activeId,
  });
}

/** Snapshot a thread before deletion (undo support). */
export function insertThread(thread: AssistantThread, activeId: string | null) {
  const threads = [thread, ...state.threads.filter((t) => t.id !== thread.id)].slice(0, MAX_THREADS);
  commit({ threads, activeId });
}

// ── grouping + time helpers — copy-adapt of the tutor's pure helpers
//    (plan §2: disclosed; identical behavior, zero cross-surface imports) ──

export interface AssistantThreadGroup {
  label: string;
  threads: AssistantThread[];
}

export function groupThreads(threads: AssistantThread[]): AssistantThreadGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;
  const startOfMonth = startOfToday - 29 * 86_400_000;
  const buckets: Record<string, AssistantThread[]> = {};
  const order = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];
  for (const t of threads) {
    const at = t.updatedAt;
    const label =
      at >= startOfToday
        ? "Today"
        : at >= startOfYesterday
          ? "Yesterday"
          : at >= startOfWeek
            ? "Previous 7 days"
            : at >= startOfMonth
              ? "Previous 30 days"
              : "Older";
    (buckets[label] ??= []).push(t);
  }
  return order
    .filter((l) => buckets[l]?.length)
    .map((l) => ({ label: l, threads: buckets[l] }));
}

export function relativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── sync-tier functions (DC-6 phase 3b; docs/DC6-ASSISTANT-SURFACE-SYNC-PLAN.md §4) ──
// The same laws the question store pinned in phase 3, adapted to the
// assistant's single-active-pointer shape: the local store stays the source
// of truth; the server is a best-effort full-state mirror. These functions
// are the store's ENTIRE sync surface — the loop lives in assistant-sync.ts
// (component layer), keeping the zero-cross-surface decoupling law.

/** One hydrated server thread (the sync module maps the wire view to this
 *  shape — messages are the LOCAL role union; `content` not `payload`). */
export interface HydratedAssistantThread {
  sessionId: string;
  title: string;
  courseSlug: string | null;
  createdAt: number;
  updatedAt: number;
  messages: AssistantMessage[];
}

/**
 * Bind a local thread to its server anchor (the lazy-bind moment). The
 * FIRST binding wins (recovery goes through unbind — a stale-server
 * rebinding is never silent); unknown threads no-op.
 */
export function bindAssistantSession(localThreadId: string, serverThreadId: string) {
  const t = state.threads.find((th) => th.id === localThreadId);
  if (!t) return;
  if (t.sessionId != null) return; // first binding wins (monotonic, idempotent)
  updateInPlace(localThreadId, { sessionId: serverThreadId });
}

/**
 * Drop the binding: a 404 said the server thread is gone (deleted
 * elsewhere). Deletion is respected — the thread stays local-only and is
 * NOT re-created for the rest of the session (the sync module owns the
 * drop marker).
 */
export function unbindAssistantSession(localThreadId: string) {
  const t = state.threads.find((th) => th.id === localThreadId);
  if (!t || t.sessionId == null) return;
  updateInPlace(localThreadId, { sessionId: null });
}

/** One thread by id — the sync module's read seam (it must be able to
 *  mirror a RENAMED thread that is not the active one). */
export function getAssistantThread(id: string): AssistantThread | null {
  return state.threads.find((t) => t.id === id) ?? null;
}

/** All threads (tests + the future cross-question rail read). The array is
 *  the live state reference — treat it read-only; commit() replaces it. */
export function getAssistantThreads(): AssistantThread[] {
  return state.threads;
}

/**
 * Upsert server threads that are NOT already bound locally (local wins — a
 * bound thread is never clobbered). Hydration NEVER moves the active
 * pointer (restoring a conversation stays an explicit user act) and
 * respects the family caps with the survivor law: under full-store
 * pressure the non-active, non-addition threads evict first, then the
 * oldest additions yield — and the return count discloses exactly how many
 * landed. Malformed messages skip (never throw).
 */
export function hydrateAssistantThreads(incoming: HydratedAssistantThread[]): number {
  const bound = new Set(
    state.threads
      .filter((t) => t.sessionId != null)
      .map((t) => t.sessionId as string),
  );
  const fresh = incoming.filter(
    (s) => !bound.has(s.sessionId) && s.messages.length > 0,
  );
  if (fresh.length === 0) return 0;
  const now = Date.now();
  const additions: AssistantThread[] = fresh.map((s) => ({
    id: newThreadId(),
    title: s.title,
    createdAt: s.createdAt || now,
    updatedAt: s.updatedAt || now,
    messages: s.messages.filter(validAssistantMessage).slice(-MAX_MESSAGES_PER_THREAD),
    seq: seqCounter++,
    ...(s.courseSlug ? { courseSlug: s.courseSlug } : {}),
    sessionId: s.sessionId,
  }));
  // stale pointers protect nothing — only pointers to LIVE threads count
  const liveIds = new Set(state.threads.map((t) => t.id));
  const protectedActive =
    state.activeId != null && liveIds.has(state.activeId) ? state.activeId : null;
  let threads = [...state.threads, ...additions];
  if (threads.length > MAX_THREADS) {
    const additionIds = new Set(additions.map((a) => a.id));
    const overflow = threads.length - MAX_THREADS;
    const evictable = threads
      .filter((t) => t.id !== protectedActive && !additionIds.has(t.id))
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

/** Stored-message validation for the role union: a malformed entry is
 *  dropped, never thrown (the family's validMessage law). */
function validAssistantMessage(m: unknown): m is AssistantMessage {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  if (typeof x.at !== "number") return false;
  if (x.role !== "user" && x.role !== "assistant") return false;
  return typeof x.content === "string";
}

/** Patch sync fields WITHOUT touching updatedAt or the ordering (a bind is
 *  not a conversation update — the rail's recency must not move). */
function updateInPlace(id: string, patch: Partial<AssistantThread>) {
  commit({
    threads: state.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });
}
