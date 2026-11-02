/**
 * Study-tools href law tests (run-015, audit F3–F7, trace
 * 1a19b6125c2d7e4d): the course-scoped resolution order (current course →
 * last-opened → bare) restricted to the tools that actually HAVE a
 * course-scoped surface (F4 — the uniform resolver used to send the
 * Dashboard row at /courses/<slug>/dashboard, a route that does not exist),
 * the Past Papers course scoping (F5), the active-row law (F6) and the KG
 * deep-link refusal rules. Fixtures are real registry slugs:
 * igcse-chemistry-19 is the pilot (next.config PILOT); not-a-course is
 * registered nowhere.
 */
import { describe, expect, it } from "bun:test";

import {
  courseScopedToolHref,
  isToolActive,
  knowledgeGraphHref,
} from "./tool-hrefs";

const PILOT = "igcse-chemistry-19";
const IN_COURSE = `/courses/${PILOT}/flashcards`;

describe("courseScopedToolHref", () => {
  it("scopes the course-scoped kinds to the course you are in (F4/F5)", () => {
    expect(courseScopedToolHref("/flashcards", IN_COURSE, null)).toBe(
      `/courses/${PILOT}/flashcards`,
    );
    expect(
      courseScopedToolHref("/revision-notes", `/courses/${PILOT}/specification`, null),
    ).toBe(`/courses/${PILOT}/revision-notes`);
    expect(
      courseScopedToolHref(
        "/exam-questions",
        `/courses/${PILOT}/revision-notes/limiting-reactants`,
        null,
      ),
    ).toBe(`/courses/${PILOT}/exam-questions`);
    expect(courseScopedToolHref("/past-papers", IN_COURSE, null)).toBe(
      `/courses/${PILOT}/past-papers`,
    );
  });

  it("leaves global surfaces bare inside a course — the F4 404 regression", () => {
    expect(courseScopedToolHref("/dashboard", IN_COURSE, null)).toBe("/dashboard");
    expect(courseScopedToolHref("/courses", IN_COURSE, null)).toBe("/courses");
  });

  it("falls back to the last-opened course outside one", () => {
    expect(courseScopedToolHref("/flashcards", "/", PILOT)).toBe(
      `/courses/${PILOT}/flashcards`,
    );
    expect(courseScopedToolHref("/past-papers", "/dashboard", PILOT)).toBe(
      `/courses/${PILOT}/past-papers`,
    );
  });

  it("last-opened never scopes a global row (F4)", () => {
    expect(courseScopedToolHref("/dashboard", "/dashboard", PILOT)).toBe("/dashboard");
    expect(courseScopedToolHref("/courses", "/", PILOT)).toBe("/courses");
  });

  it("refuses an unknown last-opened slug and stays bare", () => {
    expect(courseScopedToolHref("/flashcards", "/", "not-a-course")).toBe("/flashcards");
  });

  it("stays bare with no course and no last-opened (the legacy redirect path)", () => {
    expect(courseScopedToolHref("/exam-questions", "/", null)).toBe("/exam-questions");
    expect(courseScopedToolHref("/past-papers", "/", null)).toBe("/past-papers");
  });

  it("never scopes the study-plan row (F3 — there is no /courses/<slug>/plan)", () => {
    expect(courseScopedToolHref("/plan", IN_COURSE, PILOT)).toBe("/plan");
  });
});

describe("knowledgeGraphHref", () => {
  it("deep-links the graph of the course you are in", () => {
    expect(knowledgeGraphHref(IN_COURSE)).toBe(`/knowledge-graph?course=${PILOT}`);
  });

  it("stays the picker for a slug with no published graph", () => {
    expect(knowledgeGraphHref("/courses/not-a-course/flashcards")).toBe(
      "/knowledge-graph",
    );
  });

  it("stays the picker outside a course", () => {
    expect(knowledgeGraphHref("/dashboard")).toBe("/knowledge-graph");
  });

  it("cannot throw on a malformed %-sequence (raw segment check)", () => {
    expect(knowledgeGraphHref("/courses/%zz/flashcards")).toBe("/knowledge-graph");
  });
});

describe("isToolActive", () => {
  it("exact match on the global rows", () => {
    expect(isToolActive("/dashboard", "/dashboard")).toBe(true);
    expect(isToolActive("/courses", "/courses")).toBe(true);
    expect(isToolActive("/plan", "/plan")).toBe(true);
    expect(isToolActive("/tutor", "/tutor")).toBe(true);
    expect(isToolActive("/knowledge-graph", "/knowledge-graph")).toBe(true);
  });

  it("a course-scoped surface marks its tool row, whatever the course", () => {
    expect(isToolActive("/flashcards", IN_COURSE)).toBe(true);
    expect(isToolActive("/flashcards", "/courses/ial-maths-20-pure-1/flashcards")).toBe(
      true,
    );
    expect(isToolActive("/past-papers", `/courses/${PILOT}/past-papers`)).toBe(true);
  });

  it("sibling rows stay inactive on a course surface", () => {
    expect(isToolActive("/dashboard", IN_COURSE)).toBe(false);
    expect(isToolActive("/courses", IN_COURSE)).toBe(false);
    expect(isToolActive("/revision-notes", IN_COURSE)).toBe(false);
  });

  it("the course home itself activates nothing (inside one course, not the directory)", () => {
    expect(isToolActive("/courses", `/courses/${PILOT}`)).toBe(false);
    expect(isToolActive("/flashcards", `/courses/${PILOT}`)).toBe(false);
  });

  it("course subroutes no menu row names activate nothing", () => {
    expect(isToolActive("/flashcards", `/courses/${PILOT}/specification`)).toBe(false);
    expect(isToolActive("/exam-questions", `/courses/${PILOT}/seneca`)).toBe(false);
  });

  it("global prefix match (archive depth, deeper tool routes)", () => {
    expect(isToolActive("/past-papers", "/past-papers/edexcel/ial/mathsb")).toBe(true);
    expect(isToolActive("/tutor", "/tutor/new-session")).toBe(true);
  });

  it("unrelated paths activate nothing", () => {
    expect(isToolActive("/dashboard", "/")).toBe(false);
    expect(isToolActive("/past-papers", "/practice")).toBe(false);
  });
});
