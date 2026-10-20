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
