import { describe, expect, test } from "bun:test";

/**
 * DC-6 phase 2a store pins (docs/DC6-QUESTION-CLA-HISTORY-PLAN.md §4):
 * - family pin: the store behaves like the assistant/tutor local stores
 *   (create-on-first-ask, title law, caps) with its OWN keys;
 * - restore pin: archive keeps the thread, restore brings it back, a
 *   post-archive ask opens a NEW thread;
 * - isolation pin: cla threads are invisible to the assistant and tutor
 *   stores (read-only probes — nothing here writes to them);
 * - race pin: updater payloads resolve against STORE state (fresh-prev law).
 *
 * bun test runs without a DOM, so the store's `typeof window === "undefined"`
 * guards keep state in memory — exactly the honest-degradation tier the
 * store ships for private-mode browsers.
 */

import {
  commitQuestionClaMessages,
  getActiveThreadFor,
  newThreadId,
  relativeTime,
  setActiveQuestionThread,
  threadsForQuestion,
  titleFrom,
  type QuestionClaStoredMessage,
  type QuestionClaThread,
} from "./question-cla-threads";
// cross-surface isolation probes — the assistant and tutor stores must stay
// blind to cla threads (imports are read-only; nothing here writes to them)
import { getActiveThread as getAssistantActiveThread } from "../../app/assistant/assistant-threads";
import { getThreads as getTutorThreads } from "../../app/tutor/threads";

const Q = "hub-question-1";

function userTurn(text: string) {
  return { kind: "user" as const, text, at: 1 };
}

function assistantTurn(): QuestionClaStoredMessage {
  return {
    kind: "assistant",
    at: 2,
    result: {
      answer: "The command word is *state* — one mark per correct point.",
      refused: false,
      citations: [
        {
          index: 1,
          label: "4CH0/1C Jan 2012",
          kind: "CONCEPT",
          ref: "concept-uuid",
          specPointCode: null,
          url: null,
          score: 0.9,
        },
      ],
      context: {
        kind: "PAST_PAPER_QUESTION",
        reference: "core-question-uuid",
        topicNodeId: null,
        rootId: "root-uuid",
        subjectCode: "4CH0",
        topicCode: "t-1",
        topicTitle: "Bonding",
        curriculumVersion: "v1",
        curriculumBoard: null,
        curriculumQualification: null,
        validationState: "VERIFIED",
        mode: "EXPLAIN",
        questionStem: null,
        questionCommandWord: null,
        questionMarks: 0,
        paperCode: "4CH0/1C",
        attempted: null,
        partLabel: null,
        lessonAction: null,
        noteId: null,
        noteTitle: null,
      },
      topics: [],
      evidenceCount: 3,
      latencyMs: 812,
      model: "glm-4.6",
      provider: "glm-4.6",
      tools: [{ tool: "vector_search", args: "state the bonding", resultSize: 3, latencyMs: 90 }],
    },
  };
}

describe("question-cla thread store (DC-6 phase 2a)", () => {
  test("commit creates the thread on the first ask, never on page load", () => {
    expect(getActiveThreadFor(Q)).toBeNull();
    commitQuestionClaMessages(Q, [userTurn("What is this question asking me to do?")], {
      questionNumber: 3,
      courseSlug: "igcse-chemistry",
    });
    const t = getActiveThreadFor(Q);
    expect(t).not.toBeNull();
    expect(t?.questionId).toBe(Q);
    expect(t?.questionNumber).toBe(3);
    expect(t?.courseSlug).toBe("igcse-chemistry");
    expect(t?.sessionId).toBeNull(); // the sync seam: local-only tier
    expect(t?.id.startsWith("qc_")).toBe(true);
  });

  test("title law: first user turn, 52 chars + ellipsis = 53", () => {
    // entry state: the prior test left Q's pointer active — archive so this
    // commit CREATES a thread (the title law applies to the first ask)
    setActiveQuestionThread(Q, null);
    commitQuestionClaMessages(Q, [userTurn("  Why   does the   mark scheme split 2-mark points?  ")]);
    expect(getActiveThreadFor(Q)?.title).toBe("Why does the mark scheme split 2-mark points?");
    setActiveQuestionThread(Q, null);
    commitQuestionClaMessages(Q, [userTurn("x".repeat(80))]);
    const title = getActiveThreadFor(Q)?.title ?? "";
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBe(53);
  });

  test("race pin: functional updaters resolve against store state — no dropped turns", () => {
    commitQuestionClaMessages(Q, [userTurn("q1")]);
    // the player forwards the overlay's payload untouched; both appends land
    commitQuestionClaMessages(Q, (m) => [...m, assistantTurn()]);
    commitQuestionClaMessages(Q, (m) => [...m, userTurn("q2")]);
    const msgs = getActiveThreadFor(Q)?.messages ?? [];
    expect(msgs.map((m) => m.kind)).toEqual(["user", "assistant", "user"]);
  });

  test("field-identical round trip: the assistant view survives the store deep-equal", () => {
    setActiveQuestionThread(Q, null);
    commitQuestionClaMessages(Q, [userTurn("decode this")], { questionNumber: 1 });
    commitQuestionClaMessages(Q, (m) => [...m, assistantTurn()]);
    const stored = getActiveThreadFor(Q)?.messages[1];
    expect(stored).toEqual(assistantTurn());
  });

  test("restore pin: empty-resolve archives (thread kept), a tap restores it", () => {
    setActiveQuestionThread(Q, null);
    commitQuestionClaMessages(Q, [userTurn("archived question")]);
    const archived = getActiveThreadFor(Q);
    expect(archived).not.toBeNull();
    const archivedId = archived!.id;
    // "New chat" — the overlay forwards the empty array
    commitQuestionClaMessages(Q, []);
    expect(getActiveThreadFor(Q)).toBeNull(); // pointer cleared…
    expect(threadsForQuestion(Q).some((t) => t.id === archivedId && t.messages.length === 1)).toBe(
      true,
    ); // …thread kept
    // the history list's tap: restore, transcript returns
    setActiveQuestionThread(Q, archivedId);
    expect(getActiveThreadFor(Q)?.messages[0]).toEqual(userTurn("archived question"));
  });

  test("restore never crosses questions: a thread is bound to its question", () => {
    setActiveQuestionThread(Q, null); // start detached: refusal must leave Q detached
    const other = "hub-question-2";
    commitQuestionClaMessages(other, [userTurn("a different question")]);
    const t = getActiveThreadFor(other);
    const before = threadsForQuestion(Q).length;
    setActiveQuestionThread(Q, t!.id); // foreign thread — refused
    expect(getActiveThreadFor(Q)).toBeNull();
    expect(threadsForQuestion(Q).length).toBe(before);
    setActiveQuestionThread(other, null);
  });

  test("a post-archive ask opens a NEW thread; the archived one is untouched", () => {
    const countBefore = threadsForQuestion(Q).length;
    const snapshot = threadsForQuestion(Q).map((t) => ({ id: t.id, msgs: t.messages.length }));
    // the restore from the prior test left the archived thread ACTIVE —
    // "New chat" first (the empty-resolve archive), THEN the fresh ask
    commitQuestionClaMessages(Q, []);
    expect(getActiveThreadFor(Q)).toBeNull();
    commitQuestionClaMessages(Q, [userTurn("a fresh ask")]);
    const fresh = getActiveThreadFor(Q)!;
    expect(fresh.messages).toEqual([userTurn("a fresh ask")]);
    expect(threadsForQuestion(Q).length).toBe(countBefore + 1);
    // every older thread byte-identical
    for (const s of snapshot) {
      const t = threadsForQuestion(Q).find((x) => x.id === s.id)!;
      expect(t.messages.length).toBe(s.msgs);
    }
  });

  test("cross-question isolation: question B's commits never touch question A", () => {
    const a = "iso-question-a";
    const b = "iso-question-b";
    commitQuestionClaMessages(a, [userTurn("A asks")]);
    const aId = getActiveThreadFor(a)!.id;
    commitQuestionClaMessages(b, [userTurn("B asks")]);
    commitQuestionClaMessages(b, (m) => [...m, assistantTurn()]);
    expect(getActiveThreadFor(a)?.id).toBe(aId);
    expect(getActiveThreadFor(a)?.messages.length).toBe(1);
    expect(getActiveThreadFor(b)?.messages.length).toBe(2);
    expect(threadsForQuestion(a).every((t) => t.questionId === a)).toBe(true);
    expect(threadsForQuestion(b).every((t) => t.questionId === b)).toBe(true);
    setActiveQuestionThread(a, null);
    setActiveQuestionThread(b, null);
  });

  test("the 100-message cap keeps the newest tail", () => {
    const q = "cap-question";
    const msgs = Array.from({ length: 105 }, (_, i) => userTurn(`m${i}`));
    commitQuestionClaMessages(q, msgs);
    const holder: { current: QuestionClaThread | null } = { current: null };
    const t = getActiveThreadFor(q)!;
    holder.current = t;
    expect(holder.current.messages.length).toBe(100);
    expect((holder.current.messages[0] as { text: string }).text).toBe("m5");
    expect((holder.current.messages[99] as { text: string }).text).toBe("m104");
    setActiveQuestionThread(q, null);
  });

  test("the 40-thread cap evicts oldest-updated and protects the active thread", () => {
    // fill to the cap across distinct questions
    for (let i = 0; i < 40; i++) {
      commitQuestionClaMessages(`cap-q-${i}`, [userTurn(`q${i}`)], { questionNumber: i });
    }
    expect(getActiveThreadFor("cap-q-39")).not.toBeNull();
    // one more commit pushes past the cap — the OLDEST thread goes, the
    // active one stays
    commitQuestionClaMessages("cap-q-new", [userTurn("newest")]);
    const total = getActiveThreadFor("cap-q-new") ? threadsForQuestion("cap-q-new").length : 0;
    expect(total).toBe(1);
    const allCount = 40; // family cap
    let count = 0;
    for (let i = 0; i < 41; i++) {
      const qid = i === 40 ? "cap-q-new" : `cap-q-${i}`;
      count += threadsForQuestion(qid).length;
    }
    expect(count).toBe(allCount);
    expect(threadsForQuestion("cap-q-39").length).toBe(1); // recent — survives
    setActiveQuestionThread("cap-q-new", null);
  });

  test("isolation pin: assistant and tutor stores stay blind to cla threads", () => {
    // this process committed cla threads only — the other surfaces must have
    // seen nothing
    expect(getAssistantActiveThread()).toBeNull();
    expect(getTutorThreads()).toEqual([]);
  });

  test("titleFrom + relativeTime + newThreadId keep the family vocabulary", () => {
    expect(titleFrom("")).toBe("New chat");
    expect(relativeTime(Date.now() - 30_000)).toBe("just now");
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe("5m ago");
    expect(newThreadId()).not.toBe(newThreadId());
  });
});

// ── DC-6 phase 3 sync-tier pins (docs/DC6-CLA-SYNC-TIER-PLAN.md §6) ────────
// The store's ENTIRE sync surface is bind/unbind/hydrate — the sync loop
// lives in question-cla-sync.ts (component layer, network; not imported
// here). Pinned: bind's cross-question refusal + idempotence, unbind's
// no-ops, hydration's dedup-by-sessionId / local-wins / never-move-the-
// active-pointer / malformed-filter / count return. The 40-cap eviction law
// is the SAME code path commit() pins above — not re-pinned here.

import {
  bindQuestionClaSession,
  hydrateQuestionClaThreads,
  unbindQuestionClaSession,
  type HydratedClaThread,
} from "./question-cla-threads";

const SYNC_Q = "sync-tier-question-1";

function hydratedThread(over: Partial<HydratedClaThread> = {}): HydratedClaThread {
  const now = Date.now();
  return {
    sessionId: `srv-${Math.random().toString(36).slice(2, 10)}`,
    title: "a synced chat",
    questionNumber: 3,
    courseSlug: "biology",
    createdAt: now - 5000,
    // RECENT on purpose: hydration additions must sort NEWEST so the
    // 40-cap eviction law (oldest-updated first) evicts stale test
    // leftovers, never the just-hydrated threads
    updatedAt: now,
    messages: [{ kind: "user", text: "asked on another device", at: 1500 }],
    ...over,
  };
}

describe("question cla threads — the sync tier (phase 3)", () => {
  test("bind: attaches the server anchor; refuses cross-question binds; idempotent", () => {
    commitQuestionClaMessages(SYNC_Q, [userTurn("the bind pin")]);
    const t = getActiveThreadFor(SYNC_Q)!;
    expect(t.sessionId).toBeNull();

    bindQuestionClaSession("another-question", t.id, "srv-x"); // wrong question → no-op
    expect(getActiveThreadFor(SYNC_Q)!.sessionId).toBeNull();

    bindQuestionClaSession(SYNC_Q, t.id, "srv-abc");
    expect(getActiveThreadFor(SYNC_Q)!.sessionId).toBe("srv-abc");

    bindQuestionClaSession(SYNC_Q, t.id, "srv-other"); // rebind is idempotent (first wins)
    expect(getActiveThreadFor(SYNC_Q)!.sessionId).toBe("srv-abc");
  });

  test("unbind: drops the binding (deletion respected); no-ops on unbound/unknown", () => {
    commitQuestionClaMessages(SYNC_Q, [userTurn("the unbind pin")]);
    const t = getActiveThreadFor(SYNC_Q)!;
    unbindQuestionClaSession(t.id); // already unbound → no-op, no throw
    expect(getActiveThreadFor(SYNC_Q)!.sessionId).toBeNull();

    bindQuestionClaSession(SYNC_Q, t.id, "srv-gone");
    expect(getActiveThreadFor(SYNC_Q)!.sessionId).toBe("srv-gone");
    unbindQuestionClaSession("no-such-thread"); // unknown id → no-op
    unbindQuestionClaSession(t.id);
    expect(getActiveThreadFor(SYNC_Q)!.sessionId).toBeNull();
    // the thread itself survives (local stays the source of truth)
    expect(getActiveThreadFor(SYNC_Q)!.messages).toHaveLength(1);
  });

  test("hydrate: server-only threads land bound to their sessionId; local wins; pointer never moves", () => {
    commitQuestionClaMessages(SYNC_Q, [userTurn("the hydrate pin")]);
    const local = getActiveThreadFor(SYNC_Q)!;
    bindQuestionClaSession(SYNC_Q, local.id, "srv-local");
    const pointerBefore = getActiveThreadFor(SYNC_Q)!.id;

    const added = hydrateQuestionClaThreads(SYNC_Q, [
      hydratedThread({ sessionId: "srv-from-device-b" }),
      hydratedThread({ sessionId: "srv-local" }), // already bound locally → skipped (local wins)
      hydratedThread({ sessionId: "srv-empty", messages: [] }), // empty → skipped
      hydratedThread({
        sessionId: "srv-malformed",
        messages: [
          { kind: "assistant", result: null, at: 1 } as unknown as QuestionClaStoredMessage, // invalid → filtered
          { kind: "user", text: "the one survivor", at: 2 },
        ],
      }),
    ]);
    const all = threadsForQuestion(SYNC_Q);
    const hydratedCount = all.filter((t) => t.sessionId?.startsWith("srv-")).length;
    // the return count = how many additions SURVIVED (the 40-cap law can
    // drop additions under full-store pressure — hydration never evicts
    // in-use threads; same eviction path commit() pins above)
    expect(added).toBe(hydratedCount - 1); // minus the pre-bound srv-local
    expect(added).toBeLessThanOrEqual(3);

    // local-wins: exactly ONE thread carries srv-local and it is the LOCAL one
    const localCopies = all.filter((t) => t.sessionId === "srv-local");
    expect(localCopies).toHaveLength(1);
    expect(localCopies[0]!.id).toBe(local.id);
    expect(localCopies[0]!.messages[0]?.kind).toBe("user");

    // the empty thread never landed
    expect(all.some((t) => t.sessionId === "srv-empty")).toBe(false);

    // every landed thread obeys the shape laws (question-locked, valid messages)
    for (const t of all) {
      expect(t.questionId).toBe(SYNC_Q);
      if (t.sessionId === "srv-malformed") {
        expect(t.messages).toHaveLength(1); // the invalid entry was dropped
        expect(t.messages[0]?.kind).toBe("user");
      }
      if (t.sessionId === "srv-from-device-b") {
        expect(t.title).toBe("a synced chat");
        expect(t.messages.map((m) => m.kind)).toEqual(["user"]);
      }
    }

    // the pointer never moved (restore stays an explicit user act)
    expect(getActiveThreadFor(SYNC_Q)!.id).toBe(pointerBefore);

    // dedup law (pressure-independent): a re-hydrated sessionId NEVER
    // duplicates — either it landed in call 1 (idempotent 0) or it was
    // dropped under cap pressure and lands now (1); never two copies
    hydrateQuestionClaThreads(SYNC_Q, [hydratedThread({ sessionId: "srv-from-device-b" })]);
    expect(threadsForQuestion(SYNC_Q).filter((t) => t.sessionId === "srv-from-device-b")).toHaveLength(
      Math.min(1, threadsForQuestion(SYNC_Q).filter((t) => t.sessionId === "srv-from-device-b").length),
    );
    expect(
      new Set(
        threadsForQuestion(SYNC_Q)
          .map((t) => t.sessionId)
          .filter((s): s is string => s != null),
      ).size,
    ).toBe(
      threadsForQuestion(SYNC_Q).filter((t) => t.sessionId != null).length, // no duplicate bindings, ever
    );
  });
});

// ── the rail verbs (phase 3c; docs/DC6-QUESTION-RAIL-VERBS-PLAN.md §5) ──
// The question rail's rename/delete/undo slice: the assistant rail's
// phase-3b store laws (renameThread / deleteThread / insertThread) pinned
// on the question store's OWN vocabulary. The network halves (the drop
// marker + the server DELETE/PUT) live in question-cla-sync.ts behind the
// window/token guards — bun has neither, so the honest-degradation tier is
// exactly these local pins.

import {
  deleteQuestionClaThread,
  insertQuestionClaThread,
  renameQuestionClaThread,
} from "./question-cla-threads";

const RAIL_Q = "rail-verbs-question-1";
const RAIL_Q2 = "rail-verbs-question-2";
const RAIL_CAP_Q = "rail-verbs-question-cap";

describe("question cla threads — the rail verbs (phase 3c)", () => {
  test("rename: trims + collapses, moves updatedAt, returns the fresh row; an empty draft keeps the old title", () => {
    commitQuestionClaMessages(RAIL_Q, [userTurn("the rename pin")], { questionNumber: 7 });
    const t = getActiveThreadFor(RAIL_Q)!;
    commitQuestionClaMessages(RAIL_Q, []); // archive → the rail-entry posture (non-active)
    const before = threadsForQuestion(RAIL_Q).find((x) => x.id === t.id)!;

    const renamed = renameQuestionClaThread(before.id, "  my   renamed   chat  ");
    expect(renamed).not.toBeNull();
    expect(renamed!.title).toBe("my renamed chat");
    expect(renamed!.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    expect(threadsForQuestion(RAIL_Q).find((x) => x.id === before.id)!.title).toBe("my renamed chat");
    // the fresh row carries the full state (the mirror mirrors EXACTLY what
    // was renamed — plan §3's direct-PUT law)
    expect(renamed!.messages).toEqual(before.messages);
    expect(renamed!.questionNumber).toBe(before.questionNumber);

    const kept = renameQuestionClaThread(before.id, "   ");
    expect(kept!.title).toBe("my renamed chat"); // whitespace-only keeps the old title
  });

  test("rename: unknown id returns null and mutates nothing", () => {
    expect(renameQuestionClaThread("no-such-rail-thread", "x")).toBeNull();
  });

  test("delete: removes the row and clears the OWNING question's pointer to null; other questions untouched", () => {
    commitQuestionClaMessages(RAIL_Q, [userTurn("active delete pin")]);
    const doomed = getActiveThreadFor(RAIL_Q)!;
    expect(getActiveThreadFor(RAIL_Q)!.id).toBe(doomed.id);

    commitQuestionClaMessages(RAIL_Q2, [userTurn("keep me")]);
    const keepId = getActiveThreadFor(RAIL_Q2)!.id;

    deleteQuestionClaThread(doomed.id);
    expect(threadsForQuestion(RAIL_Q).some((x) => x.id === doomed.id)).toBe(false);
    // the owning question's pointer cleared exactly like an archive (the
    // stale-pointers-protect-nothing law)
    expect(getActiveThreadFor(RAIL_Q)).toBeNull();
    // the OTHER question's pointer survives untouched
    expect(getActiveThreadFor(RAIL_Q2)!.id).toBe(keepId);
  });

  test("insert (undo): restores at the SAME id; makeActive=false leaves pointers alone", () => {
    commitQuestionClaMessages(RAIL_Q, [userTurn("undo pin")]);
    const t = getActiveThreadFor(RAIL_Q)!;
    commitQuestionClaMessages(RAIL_Q, []); // archive → rail entry
    deleteQuestionClaThread(t.id);
    expect(threadsForQuestion(RAIL_Q).some((x) => x.id === t.id)).toBe(false);

    insertQuestionClaThread(t, false);
    const restored = threadsForQuestion(RAIL_Q).find((x) => x.id === t.id)!;
    expect(restored.id).toBe(t.id); // the SAME id — no identity churn
    expect(restored.messages.map((m) => m.kind)).toEqual(["user"]);
    // undo never activates: restore stays an explicit user act (family law)
    expect(getActiveThreadFor(RAIL_Q)?.id).not.toBe(t.id);
  });

  test("insert: makeActive=true re-points the owning question only", () => {
    commitQuestionClaMessages(RAIL_Q, [userTurn("undo-active pin")]);
    const first = getActiveThreadFor(RAIL_Q)!;
    commitQuestionClaMessages(RAIL_Q, []); // archive the first
    commitQuestionClaMessages(RAIL_Q, [userTurn("a second thread")]); // NEW thread (pointer was null)
    const second = getActiveThreadFor(RAIL_Q)!;
    expect(second.id).not.toBe(first.id);

    deleteQuestionClaThread(first.id); // the real rail scenario: a NON-active entry
    insertQuestionClaThread(first, true);
    expect(getActiveThreadFor(RAIL_Q)!.id).toBe(first.id);
    // RAIL_Q2's pointer never moved
    expect(threadsForQuestion(RAIL_Q2).length).toBeGreaterThan(0);
  });

  test("insert: the 40-thread cap is respected on the insert path (runs LAST — fill pressure is global)", () => {
    for (let i = 0; i < 50; i++) {
      insertQuestionClaThread(
        {
          id: `qc-cap-${i}`,
          questionId: RAIL_CAP_Q,
          questionNumber: null,
          courseSlug: null,
          title: `cap filler ${i}`,
          createdAt: 1,
          updatedAt: 1,
          messages: [userTurn(`m${i}`)],
          seq: 10_000 + i,
          sessionId: null,
        },
        false,
      );
    }
    expect(threadsForQuestion(RAIL_CAP_Q).length).toBeLessThanOrEqual(40);
  });
});
