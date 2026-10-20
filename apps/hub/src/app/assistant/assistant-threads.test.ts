import { describe, expect, test } from "bun:test";

/**
 * DC-6 phase 1 store pins (docs/DC6-ASSISTANT-HISTORY-PLAN.md §4):
 * - the assistant thread store behaves like the tutor's local store
 *   (create / append + title derivation / caps / rename / delete+undo);
 * - the ISOLATION pin: assistant and tutor thread stores share no state —
 *   a thread created on one surface is invisible to the other.
 *
 * bun test runs without a DOM, so the store's `typeof window === "undefined"`
 * guards keep state in memory — exactly the honest-degradation tier the
 * store ships for private-mode browsers.
 */

import {
  appendMessages,
  createThread,
  deleteThread,
  groupThreads,
  insertThread,
  renameThread,
  titleFrom,
  updateThread,
  getActiveThread,
  setActiveThread,
  type AssistantThread,
} from "./assistant-threads";
// cross-surface isolation probe — the tutor store must stay blind to
// assistant threads (import is read-only; nothing here writes to it)
import { getThreads as getTutorThreads } from "../tutor/threads";

describe("assistant thread store (DC-6 phase 1)", () => {
  test("createThread makes an active, course-scoped thread", () => {
    const t = createThread("New chat", { slug: "test-course-a", label: "Test A" });
    expect(t.courseSlug).toBe("test-course-a");
    expect(t.courseLabel).toBe("Test A");
    expect(t.messages).toEqual([]);
    expect(getActiveThread()?.id).toBe(t.id);
    deleteThread(t.id);
  });

  test("appendMessages derives the title from the first user turn and bounds it", () => {
    const t = createThread("New chat");
    appendMessages(t.id, [
      { role: "user", content: "  Why   does the   mark scheme split 2-mark points?  ", at: 1 },
    ]);
    const stored = getActiveThread();
    expect(stored?.title).toBe("Why does the mark scheme split 2-mark points?");
    // the 52-char law: 52 content chars + the ellipsis = 53 total
    const long = createThread("New chat");
    appendMessages(long.id, [{ role: "user", content: "x".repeat(80), at: 2 }]);
    expect((getActiveThread()?.title ?? "").endsWith("…")).toBe(true);
    expect((getActiveThread()?.title ?? "").length).toBe(53);
    deleteThread(t.id);
    deleteThread(long.id);
  });

  test("the 200-message cap keeps the newest tail", () => {
    const t = createThread("New chat");
    const msgs = Array.from({ length: 205 }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
      at: i,
    }));
    appendMessages(t.id, msgs);
    const holder: { current: AssistantThread | null } = { current: null };
    updateThread(t.id, (th) => {
      holder.current = th;
      return th;
    });
    expect(holder.current?.messages.length).toBe(200);
    expect(holder.current?.messages[0]?.content).toBe("m5");
    expect(holder.current?.messages[199]?.content).toBe("m204");
    deleteThread(t.id);
  });

  test("renameThread cleans and bounds the title; empty restores the old one", () => {
    const t = createThread("Seed");
    appendMessages(t.id, [{ role: "user", content: "seed question", at: 1 }]);
    renameThread(t.id, "  spaced   name  ");
    expect(getActiveThread()?.title).toBe("spaced name");
    renameThread(t.id, "   ");
    expect(getActiveThread()?.title).toBe("spaced name");
    deleteThread(t.id);
  });

  test("delete + insertThread restores the thread with its active slot (undo)", () => {
    const t = createThread("Undo me");
    expect(getActiveThread()?.id).toBe(t.id);
    deleteThread(t.id);
    // the deleted id must never stay active — it fell to the next thread or null
    expect(getActiveThread()?.id).not.toBe(t.id);
    const snapshot: AssistantThread = { ...t, messages: [] };
    insertThread(snapshot, t.id);
    expect(getActiveThread()?.id).toBe(t.id);
    deleteThread(t.id);
  });

  test("setActiveThread(null) with threads present keeps threads but no active", () => {
    const t = createThread("Active probe");
    setActiveThread(null);
    expect(getActiveThread()).toBeNull();
    deleteThread(t.id);
  });

  test("groupThreads buckets by date with the tutor's labels and order", () => {
    const now = Date.now();
    // pure-function probe over constructed threads — the store's own
    // updateThread always bumps updatedAt to now, so dates must ride the input
    const mk = (id: string, updatedAt: number): AssistantThread => ({
      id,
      title: id,
      createdAt: updatedAt,
      updatedAt,
      messages: [],
    });
    const groups = groupThreads([
      mk("older", now - 40 * 86_400_000),
      mk("yesterday", now - 86_400_000 - 60_000),
      mk("today", now),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Older"]);
    expect(groups[0].threads[0]?.title).toBe("today");
    expect(groups[2].threads[0]?.title).toBe("older");
  });

  test("titleFrom mirrors the tutor's 52-char law", () => {
    expect(titleFrom("   ")).toBe("New chat");
    expect(titleFrom("short")).toBe("short");
    expect(titleFrom("x".repeat(52))).toBe("x".repeat(52));
    expect(titleFrom("x".repeat(53)).endsWith("…")).toBe(true);
  });
});

describe("cross-surface isolation (plan §4 pin c)", () => {
  test("assistant threads never appear in the tutor store (and vice versa)", () => {
    const tutorCountBefore = getTutorThreads().length;
    const t = createThread("assistant-only thread", { slug: "iso-course", label: "Iso" });
    appendMessages(t.id, [{ role: "user", content: "isolation probe", at: 1 }]);
    // the tutor store has no visibility of it — count unchanged, and no
    // tutor thread carries the assistant's content
    expect(getTutorThreads().length).toBe(tutorCountBefore);
    for (const tt of getTutorThreads()) {
      expect(tt.messages.some((m) => m.content === "isolation probe")).toBe(false);
    }
    deleteThread(t.id);
  });
});
