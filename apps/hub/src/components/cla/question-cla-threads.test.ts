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
