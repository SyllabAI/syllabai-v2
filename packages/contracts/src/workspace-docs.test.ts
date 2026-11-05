/**
 * Workspace-docs contract pins — T-AUDIT-TIER1 run-003.
 *
 * Ten pins over the closed key vocabulary, the 512KB plane cap and the
 * three envelopes (PUT request, list, honest-null get). These are the
 * wire truths the router and the hub client both compile against.
 */
import { describe, expect, test } from "bun:test";
import {
  WORKSPACE_DOC_KEY_PATTERNS,
  WORKSPACE_DOC_MAX_BYTES,
  putWorkspaceDocRequestSchema,
  workspaceDocGetSchema,
  workspaceDocKeySchema,
  workspaceDocListSchema,
} from "./workspace-docs";

describe("workspace-docs contracts", () => {
  test("exact-match keys parse", () => {
    for (const key of ["deck-sessions", "guided-flow", "teacher-classes", "test-builder-drafts", "assistant-threads", "tutor-threads", "cla-question-threads"]) {
      expect(workspaceDocKeySchema.safeParse(key).success).toBe(true);
    }
  });

  test("progress: family parses for kebab slugs", () => {
    expect(workspaceDocKeySchema.safeParse("progress:igcse-chemistry-19").success).toBe(true);
    expect(workspaceDocKeySchema.safeParse("progress:a").success).toBe(true);
  });

  test("progress: family rejects uppercase, leading dash and empty slug", () => {
    expect(workspaceDocKeySchema.safeParse("progress:IGCSE").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("progress:-chem").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("progress:").success).toBe(false);
  });

  test("unknown keys fail (closed vocabulary, fail-closed)", () => {
    expect(workspaceDocKeySchema.safeParse("saved-tests").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("mock-results").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("teaching-coverage").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("last-opened").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse("progressX:chem").success).toBe(false);
  });

  test("key bounds: empty and >100 chars fail", () => {
    expect(workspaceDocKeySchema.safeParse("").success).toBe(false);
    expect(workspaceDocKeySchema.safeParse(`tutor-threads:${"a".repeat(90)}`).success).toBe(false);
  });

  test("512KB plane cap constant", () => {
    expect(WORKSPACE_DOC_MAX_BYTES).toBe(524288);
  });

  test("PUT envelope: value required (absent fails, null passes)", () => {
    expect(putWorkspaceDocRequestSchema.safeParse({}).success).toBe(false);
    expect(putWorkspaceDocRequestSchema.safeParse({ value: null }).success).toBe(true);
    expect(putWorkspaceDocRequestSchema.safeParse({ value: { threads: [] } }).success).toBe(true);
  });

  test("list envelope validates a real payload", () => {
    const parsed = workspaceDocListSchema.safeParse({
      documents: [{ key: "tutor-threads", value: { threads: [] }, updatedAt: "2026-11-05T00:00:00.000Z" }],
    });
    expect(parsed.success).toBe(true);
  });

  test("get envelope accepts the honest-null shape", () => {
    const parsed = workspaceDocGetSchema.safeParse({
      key: "tutor-threads",
      value: null,
      updatedAt: null,
    });
    expect(parsed.success).toBe(true);
  });

  test("vocabulary of record has 15 entries (the dedicated planes stay refused)", () => {
    // T-ACCOUNT-ONLY run-001: the sweep added the seven single-preference
    // families (theme / cla-panel-mode / dashboard-prefs / course-shell-prefs
    // / tutor-prefs / pdf-viewer-prefs / note-scroll:<slug>) to the eight
    // run-003/004 keys.
    expect(WORKSPACE_DOC_KEY_PATTERNS).toHaveLength(15);
    // the dedicated server planes keep their OWN surfaces — they are
    // deliberately NOT workspace docs (the two planes never overlap).
    for (const refused of ["saved-tests", "teaching-coverage", "content-reviews", "mock-results", "last-opened"]) {
      expect(workspaceDocKeySchema.safeParse(refused).success).toBe(false);
    }
  });
});
