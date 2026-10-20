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
    attempted?: boolean;
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
