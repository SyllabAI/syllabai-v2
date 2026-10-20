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
  bindAssistantSession,
  createThread,
  deleteThread,
  getAssistantThread,
  groupThreads,
  hydrateAssistantThreads,
  insertThread,
  renameThread,
  setActiveThread,
  titleFrom,
  unbindAssistantSession,
  updateThread,
  getActiveThread,
  getAssistantThreads,
  type AssistantMessage,
  type AssistantThread,
  type HydratedAssistantThread,
} from "./assistant-threads";
import {
  fromWireAssistantMessage,
  MIRROR_TRANSCRIPT_CAP,
  toWireAssistantMessage,
} from "./assistant-sync-wire";
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

describe("assistant threads — the sync tier (phase 3b)", () => {
  /** A hydrated server view (the sync module maps the wire view to this). */
  const hydrated = (sessionId: string, over: Partial<HydratedAssistantThread> = {}): HydratedAssistantThread => ({
    sessionId,
    title: `server ${sessionId}`,
    courseSlug: "test-course-a",
    createdAt: 1000,
    updatedAt: 2000,
    messages: [
      { role: "user", content: "server question", at: 1 },
      { role: "assistant", content: "server answer", at: 2, citations: [] },
    ],
    ...over,
  });

  test("bind: attaches the server anchor; FIRST binding wins; recovery goes through unbind", () => {
    const t = createThread("Bind me");
    expect(t.sessionId ?? null).toBeNull(); // created local-only
    bindAssistantSession(t.id, "srv-bind-1");
    expect(getAssistantThread(t.id)?.sessionId).toBe("srv-bind-1");
    bindAssistantSession(t.id, "srv-bind-2"); // a rebinding is never silent
    expect(getAssistantThread(t.id)?.sessionId).toBe("srv-bind-1");
    unbindAssistantSession(t.id);
    expect(getAssistantThread(t.id)?.sessionId).toBeNull();
    bindAssistantSession(t.id, "srv-bind-3"); // recovery path rebinds
    expect(getAssistantThread(t.id)?.sessionId).toBe("srv-bind-3");
    bindAssistantSession("no-such-thread", "srv-x"); // unknown no-op
    deleteThread(t.id);
  });

  test("unbind: no-ops on unbound and unknown threads; a bind never moves updatedAt", () => {
    const t = createThread("Unbind probe");
    appendMessages(t.id, [{ role: "user", content: "probe", at: 1 }]);
    const before = getAssistantThread(t.id)?.updatedAt;
    unbindAssistantSession(t.id); // unbound — no-op
    expect(getAssistantThread(t.id)?.sessionId ?? null).toBeNull();
    bindAssistantSession(t.id, "srv-ub");
    const after = getAssistantThread(t.id)?.updatedAt;
    expect(after).toBe(before); // a bind is not a conversation update
    unbindAssistantSession("no-such-thread"); // unknown — no-op
    deleteThread(t.id);
  });

  test("hydrate: server-only threads land bound; local wins; the active pointer NEVER moves", () => {
    const local = createThread("Local thread", { slug: "test-course-a", label: "T" });
    appendMessages(local.id, [{ role: "user", content: "local ask", at: 1 }]);
    bindAssistantSession(local.id, "srv-shared");
    setActiveThread(local.id);
    const landed = hydrateAssistantThreads([
      hydrated("srv-shared"), // already bound locally — the server copy NEVER clobbers
      hydrated("srv-fresh-1"),
      hydrated("srv-fresh-2", { messages: [] }), // empty transcripts skip
    ]);
    expect(landed).toBe(1);
    // the addition landed, bound to its sessionId, messages validated through
    const addition = getAssistantThreads().find((t) => t.sessionId === "srv-fresh-1");
    expect(addition).not.toBeNull();
    expect(addition?.messages.length).toBe(2);
    expect(addition?.title).toBe("server srv-fresh-1");
    expect(addition?.courseSlug).toBe("test-course-a");
    // the bound local thread was NEVER clobbered by its server copy
    const shared = getAssistantThreads().filter((t) => t.sessionId === "srv-shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.id).toBe(local.id);
    // the phase-1 title law derived "local ask" from the first user turn —
    // the hydrated title ("server srv-shared") would show if it clobbered
    expect(shared[0]?.title).toBe("local ask");
    expect(getActiveThread()?.id).toBe(local.id); // pointer never moved
    // cleanup
    deleteThread(local.id);
    if (addition) deleteThread(addition.id);
  });

  test("hydrate under a full store: the active thread is protected, evictables go first, the count discloses", () => {
    for (let i = 0; i < 40; i++) createThread(`filler ${i}`); // active = filler 39
    const activeBefore = getActiveThread()?.id;
    const landed = hydrateAssistantThreads([hydrated("srv-pressure-1"), hydrated("srv-pressure-2")]);
    expect(landed).toBe(2); // both additions land — eviction covers the overflow
    expect(getAssistantThreads().length).toBe(40); // the cap held
    expect(getActiveThread()?.id).toBe(activeBefore); // the active thread survived
    // the OLDEST fillers evicted first (the survivor law's first arm)
    expect(getAssistantThreads().some((t) => t.title === "filler 0")).toBe(false);
    expect(getAssistantThreads().some((t) => t.title === "filler 1")).toBe(false);
    expect(getAssistantThreads().some((t) => t.title === "filler 39")).toBe(true);
    for (const t of [...getAssistantThreads()]) deleteThread(t.id);
    setActiveThread(null);
  });

  test("hydrate skips malformed messages, never throws", () => {
    const t = createThread("Malformed host");
    const landed = hydrateAssistantThreads([
      hydrated("srv-malformed", {
        messages: [
          { role: "user", content: "good", at: 1 },
          { role: "system", content: "bad role", at: 2 } as unknown as AssistantMessage,
          { content: "no at", at: 3 } as unknown as AssistantMessage,
        ],
      }),
    ]);
    expect(landed).toBe(1);
    // leave NO residue: the other surfaces' isolation pins run in this same
    // bun process and must see an empty assistant store
    const addition = getAssistantThreads().find((th) => th.sessionId === "srv-malformed");
    if (addition) deleteThread(addition.id);
    deleteThread(t.id);
    setActiveThread(null);
  });

  test("the wire construction contract: local -> wire -> local round-trips byte-honest", () => {
    expect(MIRROR_TRANSCRIPT_CAP).toBe(100);
    const user: AssistantMessage = { role: "user", content: "Why is the sky blue?", at: 5 };
    const wUser = toWireAssistantMessage(user);
    expect(wUser).toEqual({ kind: "user", at: 5, text: "Why is the sky blue?" });
    expect(fromWireAssistantMessage(wUser)).toEqual(user);

    const assistant: AssistantMessage = {
      role: "assistant",
      content: "Rayleigh scattering.",
      at: 6,
      citations: [
        {
          index: 1,
          label: "Note 3",
          kind: "NOTE",
          ref: "note-3",
          specPointCode: null,
          url: null,
          score: 0.9,
        },
      ],
      mode: "EXPLAIN",
      provider: "p",
      model: null,
      refused: false,
      evidenceCount: 3,
      latencyMs: 42,
      context: { kind: "SPEC_TOPIC", anchor: "9.1 — Respiration" },
    };
    const wAssistant = toWireAssistantMessage(assistant);
    expect(wAssistant.kind).toBe("assistant");
    if (wAssistant.kind === "assistant") {
      // absent stays absent; present stays present (the projection verbatim)
      expect(wAssistant.payload).toEqual({
        answer: "Rayleigh scattering.",
        citations: [
          {
            index: 1,
            label: "Note 3",
            kind: "NOTE",
            ref: "note-3",
            specPointCode: null,
            url: null,
            score: 0.9,
          },
        ],
        mode: "EXPLAIN",
        provider: "p",
        model: null,
        refused: false,
        evidenceCount: 3,
        latencyMs: 42,
        context: { kind: "SPEC_TOPIC", anchor: "9.1 — Respiration" },
      });
    }
    expect(fromWireAssistantMessage(wAssistant)).toEqual(assistant);

    // a minimal assistant message: citations defaults to [], optionals stay absent
    const minimal = toWireAssistantMessage({ role: "assistant", content: "hi", at: 1 });
    expect(minimal.kind === "assistant" && minimal.payload).toEqual({
      answer: "hi",
      citations: [],
    });
  });

  test("the wire contract skips gate/error legs — they cannot exist on assistant rows", () => {
    expect(
      fromWireAssistantMessage({ kind: "gate", at: 1, text: "x" }),
    ).toBeNull();
    expect(
      fromWireAssistantMessage({ kind: "error", at: 1, text: "x", question: "y" }),
    ).toBeNull();
  });
});
