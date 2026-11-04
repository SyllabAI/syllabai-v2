/**
 * Workspace-document contract pins (T-AUDIT-TIER1 run-003) — the app-pinned
 * doc-key allow-list is the load-bearing law: the generic /api/v1/me/documents
 * surface must never degenerate into an arbitrary user-keyed KV dump, and it
 * must never shadow a dedicated-service key either. These tests pin every
 * admitted key shape AND the rejections.
 */
import { describe, expect, it } from "bun:test";
import {
  WORKSPACE_DOC_KEY_PATTERNS,
  WORKSPACE_DOC_MAX_BYTES,
  workspaceDocGetSchema,
  workspaceDocKeySchema,
  workspaceDocListSchema,
  workspaceDocPutRequestSchema,
} from "./workspace-docs";

describe("workspaceDocKeySchema — the app-pinned allow-list", () => {
  it("admits every pinned plain key verbatim", () => {
    for (const key of WORKSPACE_DOC_KEY_PATTERNS) {
      if (typeof key === "string") {
        expect(workspaceDocKeySchema.safeParse(key).success).toBe(true);
      }
    }
  });

  it("admits per-course progress keys (the slug grammar only)", () => {
    expect(workspaceDocKeySchema.safeParse("progress:igcse-chemistry-19").success).toBe(true);
    expect(workspaceDocKeySchema.safeParse("progress:igcse-biology").success).toBe(true);
  });

  it("rejects unknown keys, prefix games, and malformed slugs", () => {
    expect(workspaceDocKeySchema.safeParse("progress:").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("progress:IGCSE-CHEMISTRY").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("progress:../etc").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("anything-else").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("threads:tutor").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("progress:igcse-chemistry-19/x").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("").success).toBe(false);
  });

  it("rejects keys beyond the 100-char cap", () => {
    expect(workspaceDocKeySchema.safeParse(`progress:${"a".repeat(100)}`).success).toBe(false);
  });

  it("REJECTS the dedicated-service sibling keys (no shadow copies of record)", () => {
    // each of these stores has its own account mirror with its own table and
    // wire (T-TIER1 / T-MIG-096 lineage) — admitting them here would fork
    // the truth, so the closed vocabulary refuses them BEFORE any query
    expect(workspaceDocKeySchema.safeParse("last-opened").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("mock-results").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("teaching-coverage").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("saved-tests").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("content-reviews").success).toBe(false);
  });
});

describe("workspace doc envelopes", () => {
  it("PUT body accepts an opaque value (any JSON the store owns)", () => {
    expect(workspaceDocPutRequestSchema.safeParse({ value: { threads: [] } }).success).toBe(true);
    expect(workspaceDocPutRequestSchema.safeParse({ value: null }).success).toBe(true);
    expect(workspaceDocPutRequestSchema.safeParse({}).success).toBe(false);
  });

  it("list shape validates the hydration payload", () => {
    const parsed = workspaceDocListSchema.safeParse({
      docs: [
        { key: "tutor-threads", value: { threads: [], activeId: null }, updatedAt: "2026-11-03T00:00:00Z" },
        { key: "progress:igcse-chemistry-19", value: { notesRead: {} }, updatedAt: "2026-11-03T00:00:00Z" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("single-GET shape carries the honest-null posture", () => {
    expect(workspaceDocGetSchema.safeParse({ key: "deck-sessions", value: null, updatedAt: null }).success).toBe(true);
    expect(workspaceDocGetSchema.safeParse({ key: "not-a-key", value: null, updatedAt: null }).success).toBe(false);
  });

  it("512 KB cap constant is the documented envelope", () => {
    expect(WORKSPACE_DOC_MAX_BYTES).toBe(512 * 1024);
  });

  it("the thread-store doc keys are exact rows (no sub-key capture)", () => {
    for (const key of ["tutor-threads", "assistant-threads", "cla-question-threads"]) {
      expect(workspaceDocKeySchema.safeParse(key).success).toBe(true);
      expect(workspaceDocKeySchema.safeParse(`${key}-x`).success).toBe(false);
      expect(workspaceDocKeySchema.safeParse(`${key}:extra`).success).toBe(false);
    }
  });
});
