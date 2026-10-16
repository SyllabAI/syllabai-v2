import { describe, expect, test } from "bun:test";
import {
  bankAxisLabel,
  bankPaperLeadIn,
  bankQuestionsLeadIn,
  classifyBankIntent,
  seriesLabel,
} from "./bank-intent";

describe("classifyBankIntent — band (2) whole-paper fetch", () => {
  test("the operator's example: 'give me the full 2019 june paper 1'", () => {
    expect(classifyBankIntent("give me the full 2019 june paper 1")).toEqual({
      kind: "paper",
    });
  });

  test("fullness without a fetch verb", () => {
    expect(classifyBankIntent("the whole paper 1 june 2019 please")).toEqual({
      kind: "paper",
    });
  });

  test("paired QP+MS wording", () => {
    expect(
      classifyBankIntent("question paper and mark scheme for june 2019 1C"),
    ).toEqual({ kind: "paper" });
  });

  test("fetch verb + session anchor", () => {
    expect(classifyBankIntent("show me the june 2019 paper 1")).toEqual({
      kind: "paper",
    });
    expect(classifyBankIntent("open paper 2C november 2018")).toEqual({
      kind: "paper",
    });
  });

  test("mark scheme fetch with a session anchor", () => {
    expect(classifyBankIntent("get the mark scheme for june 2019 paper 1")).toEqual(
      { kind: "paper" },
    );
  });

  test("NO hijack: a paper noun alone does not probe", () => {
    expect(classifyBankIntent("how do marks work in paper 1?")).toBeNull();
    expect(classifyBankIntent("what is paper chromatography?")).toBeNull();
  });

  test("NO hijack: fetch verb without a session anchor", () => {
    expect(classifyBankIntent("open the paper for me")).toBeNull();
  });

  test("NO hijack: fullness next to 'paper' but about a process", () => {
    // probes at most once; the v2 identity binding 404s and the relay
    // falls through — the classifier must not crash or misroute the shape
    const intent = classifyBankIntent("explain the full paper making process");
    // 'paper' noun + 'full' → a probe shape; acceptable (honest 404 → ask)
    expect(intent).toEqual({ kind: "paper" });
  });

  test("empty / whitespace", () => {
    expect(classifyBankIntent("")).toBeNull();
    expect(classifyBankIntent("   ")).toBeNull();
  });
});

describe("classifyBankIntent — run-004 proposal #1 law (qnum-guard + fullness adjacency)", () => {
  test("QNUM-GUARD: the run-004 LEG A hijack phrasing yields to the grounded arm", () => {
    expect(
      classifyBankIntent(
        "What was question 6 in June 2019 paper 1, and what does a full-credit answer require?",
      ),
    ).toBeNull();
  });

  test("QNUM-GUARD: fetch verb + session anchor cannot override an explicit question number", () => {
    expect(classifyBankIntent("show me question 6 of june 2019 paper 1")).toBeNull();
    expect(classifyBankIntent("get q6 from june 2019 paper 1")).toBeNull();
    expect(classifyBankIntent("open question no. 6 june 2019")).toBeNull();
  });

  test("QNUM-GUARD: 'question paper 1' is a paper noun, not a question number", () => {
    expect(classifyBankIntent("show me the question paper 1 june 2019")).toEqual({
      kind: "paper",
    });
  });

  test("FULLNESS ADJACENCY: 'full marks'/'full-credit' without a qnum no longer hijacks", () => {
    expect(classifyBankIntent("i want full marks in the june 2019 paper 1")).toBeNull();
    expect(
      classifyBankIntent(
        "what does a full-credit answer to the june 2019 paper 1 electrolysis question need",
      ),
    ).toBeNull();
  });

  test("whole-paper asks keep riding band 2 (the operator's actual phrasings)", () => {
    expect(
      classifyBankIntent("Show me the complete June 2019 exam paper 1 and its grading criteria"),
    ).toEqual({ kind: "paper" });
    expect(classifyBankIntent("give me the full 2019 june paper 1")).toEqual({ kind: "paper" });
    expect(classifyBankIntent("the whole paper 1 june 2019 please")).toEqual({ kind: "paper" });
    expect(classifyBankIntent("get the full mark scheme for june 2019 paper 1")).toEqual({
      kind: "paper",
    });
  });
});

describe("classifyBankIntent — band (1) question listing", () => {
  test("the operator's example #1: quoted topic", () => {
    expect(
      classifyBankIntent("give me all questions related to 'organic chemistry'"),
    ).toEqual({ kind: "questions", topic: "organic chemistry" });
  });

  test("plain topic phrasing", () => {
    expect(classifyBankIntent("list questions on electrolysis")).toEqual({
      kind: "questions",
      topic: "electrolysis",
    });
    expect(classifyBankIntent("show questions about the rates of reaction")).toEqual({
      kind: "questions",
      topic: "rates of reaction",
    });
  });

  test("spec point axis (named + bare after prep)", () => {
    expect(classifyBankIntent("what questions are on spec point 2.44")).toEqual({
      kind: "questions",
      spec: "2.44",
    });
    expect(classifyBankIntent("give me questions for specification 1.15")).toEqual({
      kind: "questions",
      spec: "1.15",
    });
    expect(classifyBankIntent("list all questions on 2.44")).toEqual({
      kind: "questions",
      spec: "2.44",
    });
  });

  test("both axes — spec wins the service precedence, topic rides along", () => {
    expect(
      classifyBankIntent("give me all questions on organic chemistry spec point 2.44"),
    ).toEqual({ kind: "questions", spec: "2.44", topic: "organic chemistry" });
  });

  test("trailing session/paper refinements are trimmed from the topic", () => {
    expect(
      classifyBankIntent("list questions on electrolysis from june 2019"),
    ).toEqual({ kind: "questions", topic: "electrolysis" });
    expect(classifyBankIntent("show me all questions on bonding paper 1")).toEqual({
      kind: "questions",
      topic: "bonding",
    });
  });

  test("past-paper questions phrase", () => {
    expect(
      classifyBankIntent("past paper questions on ionic bonding"),
    ).toEqual({ kind: "questions", topic: "ionic bonding" });
  });

  test("NO hijack: conceptual how/why questions never probe", () => {
    expect(classifyBankIntent("how do questions about electrolysis look?")).toBeNull();
    expect(classifyBankIntent("why are all questions in chemistry hard?")).toBeNull();
  });

  test("NO probe: a listing opener with no extractable axis", () => {
    expect(classifyBankIntent("list all questions")).toBeNull();
    expect(classifyBankIntent("show me the periodic table")).toBeNull();
    expect(classifyBankIntent("list the topics in organic chemistry")).toBeNull();
  });

  test("NO hijack: the chat's own starters stay on the grounded ask", () => {
    expect(
      classifyBankIntent("Explain the three states of matter and what 4CH1-1.1 requires"),
    ).toBeNull();
    expect(classifyBankIntent("How do you calculate moles from mass and RFM?")).toBeNull();
    expect(
      classifyBankIntent("What does 4CH1-1.25 say about ionic bonding?"),
    ).toBeNull();
    expect(
      classifyBankIntent("Give me a mark-scheme style answer for a separation techniques question"),
    ).toBeNull();
  });

  test("a bare numeric topic is not a topic", () => {
    expect(classifyBankIntent("list questions on 2019")).toBeNull();
  });
});

describe("lead-ins", () => {
  test("seriesLabel", () => {
    expect(seriesLabel("JUN")).toBe("June");
    expect(seriesLabel("jan")).toBe("January");
    expect(seriesLabel("NOVEMBER")).toBe("November");
    expect(seriesLabel(null)).toBeNull();
    expect(seriesLabel(" ")).toBeNull();
  });

  test("bankPaperLeadIn — the 128/129 live-verify shape", () => {
    expect(
      bankPaperLeadIn(
        { paperCode: "1C", series: "JUN", year: 2019, title: null },
        15,
        110,
        ["1CR", "2C", "2CR"],
      ),
    ).toBe(
      "**1C · June 2019** — 15 questions · 110 marks, served with the paired mark scheme. Same-session papers also in the bank: 1CR, 2C, 2CR.",
    );
  });

  test("bankPaperLeadIn — singular + no siblings + no code", () => {
    expect(
      bankPaperLeadIn({ paperCode: null, series: null, year: null, title: "Specimen paper" }, 1, 0, []),
    ).toBe("**Specimen paper** — 1 question, served with the paired mark scheme.");
  });

  test("bankQuestionsLeadIn — honest total-then-shown", () => {
    expect(bankQuestionsLeadIn(248, 25, "“Organic chemistry”")).toBe(
      "**248 past-paper questions** match “Organic chemistry”. Showing the first 25 — refine the topic to narrow the list.",
    );
    expect(bankQuestionsLeadIn(46, 46, "specification point 2.44")).toBe(
      "**46 past-paper questions** match specification point 2.44.",
    );
    expect(bankQuestionsLeadIn(1, 1, "“Electrolysis”")).toBe(
      "**1 past-paper question** match “Electrolysis”.",
    );
  });

  test("bankAxisLabel", () => {
    expect(bankAxisLabel({ kind: "questions", spec: "2.44" })).toBe(
      "specification point 2.44",
    );
    expect(bankAxisLabel({ kind: "questions", topic: "Organic chemistry" })).toBe(
      "“Organic chemistry”",
    );
  });
});
