/**
 * Editor contracts tests — ADR-044 Phase 1. The caps are PINNED (ADR §7:
 * "every cap is a pinned test"), the closed vocabularies are pinned against
 * the 0028_editor-planes.sql CHECK constraints verbatim, and the me-view
 * law (grant holders get scopes; nothing else round-trips) is exercised.
 */
import { describe, expect, test } from "bun:test";
import {
  EDITOR_BANKS,
  EDITOR_FIELD_DELTA_MAX_BYTES,
  EDITOR_FIELDS_PER_PROPOSAL_MAX,
  EDITOR_OPEN_PROPOSALS_MAX,
  EDITOR_PROPOSAL_STATES,
  EDITOR_RECEIPT_ACTIONS,
  EDITOR_RECEIPT_ROWS_PER_PROPOSAL_MAX,
  EDITOR_SCOPES,
  editorEditProposalSchema,
  editorEditReceiptSchema,
  editorKebabSlugSchema,
  editorMeViewSchema,
  editorScopeSchema,
} from "./editor";
import { WORKSPACE_DOC_MAX_BYTES } from "./workspace-docs";

describe("editor caps (ADR-044 §7 — pinned)", () => {
  test("the three caps of record hold their ADR values", () => {
    expect(EDITOR_OPEN_PROPOSALS_MAX).toBe(10);
    expect(EDITOR_RECEIPT_ROWS_PER_PROPOSAL_MAX).toBe(200);
    expect(EDITOR_FIELD_DELTA_MAX_BYTES).toBe(WORKSPACE_DOC_MAX_BYTES); // 512KB reuse, verbatim
    expect(EDITOR_FIELD_DELTA_MAX_BYTES).toBe(512 * 1024);
    expect(EDITOR_FIELDS_PER_PROPOSAL_MAX).toBe(100); // shape bound, disclosed
  });
});

describe("editor closed vocabularies (0028 CHECK constraints, verbatim)", () => {
  test("scopes: workbench is the Phase 1 member; unknown scope cannot bind", () => {
    expect(EDITOR_SCOPES).toEqual(["workbench"]);
    expect(editorScopeSchema.safeParse("workbench").success).toBe(true);
    expect(editorScopeSchema.safeParse("admin").success).toBe(false);
    expect(editorScopeSchema.safeParse("").success).toBe(false);
  });

  test("banks: exactly the 0028 bank CHECK vocabulary", () => {
    expect(EDITOR_BANKS).toEqual(["questions", "notes", "flashcards"]);
  });

  test("proposal states: exactly the 0028 state CHECK vocabulary", () => {
    expect(EDITOR_PROPOSAL_STATES).toEqual([
      "draft",
      "preflight_failed",
      "queued_review",
      "approved",
      "merged",
      "rejected",
      "superseded",
    ]);
  });

  test("receipt actions: exactly the 0028 action CHECK vocabulary", () => {
    expect(EDITOR_RECEIPT_ACTIONS).toEqual([
      "propose",
      "preflight_refusal",
      "approve",
      "reject",
      "stale_regate",
      "merge",
      "serve",
    ]);
  });

  test("kebab slug law (the teacher-me grammar, verbatim)", () => {
    expect(editorKebabSlugSchema.safeParse("igcse-chemistry-19").success).toBe(true);
    expect(editorKebabSlugSchema.safeParse("IGCSE").success).toBe(false);
    expect(editorKebabSlugSchema.safeParse("a--b").success).toBe(false);
    // the double-award corpus slug (the longest of record) binds
    expect(
      editorKebabSlugSchema.safeParse(
        "cie-igcse-science-co-ordinated-sciences-double-award-23-biology",
      ).success,
    ).toBe(true);
  });
});

describe("editorMeView (GET /api/v1/editor/me — 200 body)", () => {
  test("editor: true with the holder's scopes round-trips", () => {
    const parsed = editorMeViewSchema.parse({ editor: true, scopes: ["workbench"] });
    expect(parsed.editor).toBe(true);
    expect(parsed.scopes).toEqual(["workbench"]);
  });

  test("editor: false / missing scopes cannot bind (the 200 body is grant-holders only)", () => {
    expect(editorMeViewSchema.safeParse({ editor: false, scopes: [] }).success).toBe(false);
    expect(editorMeViewSchema.safeParse({ editor: true }).success).toBe(false);
    expect(editorMeViewSchema.safeParse({ editor: true, scopes: ["admin"] }).success).toBe(false);
  });
});

describe("editorEditProposal (the 0028 wire image)", () => {
  const base = {
    id: "7d42b000-b927-4adf-8bfc-3b49ae3a738e",
    userId: "027067b3-3034-4e18-80c9-1484e1d9a52c",
    courseSlug: "igcse-chemistry-19",
    bank: "questions",
    targetPath: "SME-ExamQuestion/igcse-chemistry-19/1-principles-of-chemistry/1-1-states-of-matter/questions.md",
    tier: 1,
    fields: [{ field: "stem", before: "teh", after: "the" }],
    baseSha: "2e98a14703f",
    proposalPr: null,
    state: "draft",
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
  };

  test("a Tier 1 typography delta round-trips", () => {
    const parsed = editorEditProposalSchema.parse(base);
    expect(parsed.tier).toBe(1);
    expect(parsed.state).toBe("draft");
  });

  test("unknown bank / state / tier refuse (closed vocabularies)", () => {
    expect(editorEditProposalSchema.safeParse({ ...base, bank: "spines" }).success).toBe(false);
    expect(editorEditProposalSchema.safeParse({ ...base, state: "auto_merged" }).success).toBe(false);
    expect(editorEditProposalSchema.safeParse({ ...base, tier: 4 }).success).toBe(false);
    expect(editorEditProposalSchema.safeParse({ ...base, tier: 0 }).success).toBe(false);
  });

  test("course slug + fields shape bounds refuse drift", () => {
    expect(editorEditProposalSchema.safeParse({ ...base, courseSlug: "Not Kebab" }).success).toBe(false);
    const tooMany = Array.from({ length: EDITOR_FIELDS_PER_PROPOSAL_MAX + 1 }, (_, i) => ({
      field: `f${i}`,
      before: "a",
      after: "b",
    }));
    expect(editorEditProposalSchema.safeParse({ ...base, fields: tooMany }).success).toBe(false);
  });
});

describe("editorEditReceipt (the 0028 wire image, append-only)", () => {
  const base = {
    id: "820ab8d8-e97a-48c1-836e-b85f79a5701c",
    proposalId: "7d42b000-b927-4adf-8bfc-3b49ae3a738e",
    actor: "027067b3-3034-4e18-80c9-1484e1d9a52c",
    action: "approve",
    beforeHash: "a".repeat(64),
    afterHash: "b".repeat(64),
    gateRunId: "run-123",
    detail: null,
    createdAt: "2026-11-10T00:00:00.000Z",
  };

  test("the Tier 2 four-eyes approval receipt round-trips", () => {
    const parsed = editorEditReceiptSchema.parse(base);
    expect(parsed.action).toBe("approve");
  });

  test("evidence fields are optional (an action need not carry every field)", () => {
    const parsed = editorEditReceiptSchema.parse({
      ...base,
      beforeHash: null,
      afterHash: null,
      gateRunId: null,
    });
    expect(parsed.gateRunId).toBeNull();
  });

  test("unknown action refuses", () => {
    expect(editorEditReceiptSchema.safeParse({ ...base, action: "self_merge" }).success).toBe(false);
  });
});
