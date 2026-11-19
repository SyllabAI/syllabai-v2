/**
 * Guided interactions bridge tests (P2, redesign plan §5.4/§5.5): the
 * fail-closed fallback law (an unknown kind or an uncheckable payload
 * NEVER becomes the answering surface — the standard MCQ/written UI
 * serves), the RailBlock envelope synthesis (the books widgets' own
 * parsers consume it verbatim) and the tutor anchored-entry deep link
 * (§5.5 — the same /tutor?course=&q=&spec= law the exam player uses).
 */
import { describe, expect, it } from "bun:test";

import {
  interactionBlock,
  tutorAskHref,
  usableInteraction,
} from "./guided-interactions";
import type { GuidedQuestion } from "./guided-lessons";

function q(overrides: Partial<GuidedQuestion>): GuidedQuestion {
  return {
    id: "q1",
    moduleId: "rn_x::L1",
    stem: "Which ion gives a lilac flame?",
    misconceptionClass: "flame-test-confusion",
    options: [
      { key: "a", text: "K+", correct: true, explanation: "Lilac is potassium.", misconception: null },
      { key: "b", text: "Na+", correct: false, explanation: "Yellow is sodium.", misconception: "sodium flame" },
    ],
    ...overrides,
  };
}

describe("usableInteraction — the fail-closed fallback law", () => {
  it("returns null when the check carries no interactions (every live check)", () => {
    expect(usableInteraction(q({}))).toBeNull();
    expect(usableInteraction(q({ interactions: [] }))).toBeNull();
  });

  it("returns null for unknown kinds — never a fake player", () => {
    expect(
      usableInteraction(q({ interactions: [{ kind: "word-search" } as never] })),
    ).toBeNull();
  });

  it("accepts a valid ORDER-mode sort-match", () => {
    const it0 = {
      kind: "sort-match" as const,
      items: [
        { id: "1", text: "Solid melts" },
        { id: "2", text: "Particles gain energy" },
        { id: "3", text: "Forces overcome" },
      ],
      correctOrder: ["2", "3", "1"],
    };
    expect(usableInteraction(q({ interactions: [it0] }))).toEqual(it0);
  });

  it("rejects an order-mode sort-match whose correctOrder is not the same item set", () => {
    expect(
      usableInteraction(
        q({
          interactions: [
            {
              kind: "sort-match",
              items: [{ id: "1", text: "a" }, { id: "2", text: "b" }],
              correctOrder: ["1", "1"],
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("accepts a valid MATCH-mode sort-match and rejects one missing a solution row", () => {
    const match = {
      kind: "sort-match" as const,
      items: [{ id: "i1", text: "lilac" }, { id: "i2", text: "green" }],
      targets: [{ id: "t1", text: "K+" }, { id: "t2", text: "Cu2+" }],
      solution: { i1: "t1", i2: "t2" },
    };
    expect(usableInteraction(q({ interactions: [match] }))).toEqual(match);
    expect(
      usableInteraction(
        q({ interactions: [{ ...match, solution: { i1: "t1" } }] }),
      ),
    ).toBeNull();
    expect(
      usableInteraction(
        q({ interactions: [{ ...match, solution: { i1: "t9", i2: "t2" } }] }),
      ),
    ).toBeNull();
  });

  it("rejects a sort-match with fewer than two items", () => {
    expect(
      usableInteraction(
        q({ interactions: [{ kind: "sort-match", items: [{ id: "1", text: "a" }], correctOrder: ["1"] }] }),
      ),
    ).toBeNull();
  });

  it("accepts a fully-answerable table-fill and rejects a cell with no accepts", () => {
    const fill = {
      kind: "table-fill" as const,
      columns: ["Test", "Ion"],
      rows: [{ cells: [{ accepts: ["lilac flame"] }, { accepts: ["K+", "potassium"] }] }],
    };
    expect(usableInteraction(q({ interactions: [fill] }))).toEqual(fill);
    expect(
      usableInteraction(
        q({
          interactions: [
            { ...fill, rows: [{ cells: [{ accepts: ["lilac flame"] }, { accepts: [] }] }] },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("accepts a valid drag-label and rejects an unanswerable slot", () => {
    const drag = {
      kind: "drag-label" as const,
      labels: ["cathode", "anode"],
      slots: [{ id: "A", answer: "cathode", alt: ["negative electrode"] }, { id: "B", answer: "anode" }],
    };
    expect(usableInteraction(q({ interactions: [drag] }))).toEqual(drag);
    expect(
      usableInteraction(
        q({ interactions: [{ ...drag, slots: [{ id: "A", answer: "cathode" }, { id: "B", answer: "" }] }] }),
      ),
    ).toBeNull();
  });

  it("accepts a valid eq-builder and rejects an empty bank or missing target", () => {
    const eq = {
      kind: "eq-builder" as const,
      target: "2H2 + O2 -> 2H2O",
      tokens: ["2H2", "O2", "2H2O"],
    };
    expect(usableInteraction(q({ interactions: [eq] }))).toEqual(eq);
    expect(usableInteraction(q({ interactions: [{ ...eq, target: "" }] }))).toBeNull();
    expect(usableInteraction(q({ interactions: [{ ...eq, tokens: [] }] }))).toBeNull();
  });
});

describe("interactionBlock — the RailBlock envelope the widgets consume", () => {
  it("maps the kind onto the books block type and rides the payload as content", () => {
    const interaction = {
      kind: "eq-builder" as const,
      target: "2H2 + O2 -> 2H2O",
      tokens: ["2H2", "O2", "2H2O"],
    };
    const b = interactionBlock("q1", interaction, 3);
    expect(b.type).toBe("eq-builder");
    expect(b.id).toBe("guided-q1");
    expect(b.ord).toBe(3);
    expect(b.documentId).toBe("guided-interaction");
    expect(b.pdfPageAnchor).toBeNull();
    expect(b.checkRefs).toEqual([]);
    expect(b.validationState).toBe("VALIDATED");
    // content carries the payload fields (minus the kind) — the widget
    // reads c.target / c.tokens verbatim
    expect(b.content).toEqual({ target: "2H2 + O2 -> 2H2O", tokens: ["2H2", "O2", "2H2O"] });
  });
});

describe("tutorAskHref — the §5.5 anchored-entry deep link", () => {
  it("carries the course, the missed check's words and the spec anchor", () => {
    const href = tutorAskHref("igcse-chemistry-19", "Which ion gives a lilac flame?", null, "4CH1-1.25");
    expect(href.startsWith("/tutor?")).toBeTrue();
    const u = new URLSearchParams(href.slice("/tutor?".length));
    expect(u.get("course")).toBe("igcse-chemistry-19");
    expect(u.get("q")).toBe('I got this guided-lesson check wrong: "Which ion gives a lilac flame?"');
    expect(u.get("spec")).toBe("4CH1-1.25");
  });

  it("appends the mapped key points when the mapping identified ONE group", () => {
    const u = new URLSearchParams(
      tutorAskHref("igcse-chemistry-19", "stem?", ["Potassium gives a lilac flame."], null).slice(
        "/tutor?".length,
      ),
    );
    expect(u.get("q")).toBe(
      'I got this guided-lesson check wrong: "stem?" — please explain: Potassium gives a lilac flame.',
    );
    expect(u.get("spec")).toBeNull();
  });

  it("caps the ask prompt so the tutor's own anchor suffix always fits", () => {
    const long = "x".repeat(5000);
    const u = new URLSearchParams(tutorAskHref("c", long, null, null).slice("/tutor?".length));
    expect((u.get("q") ?? "").length).toBeLessThanOrEqual(600);
  });
});
