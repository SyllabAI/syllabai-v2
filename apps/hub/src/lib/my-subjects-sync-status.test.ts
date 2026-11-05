/**
 * T-SYNC-OBS-001 store law tests — the my-subjects sync health surface
 * (lib/my-subjects.ts's observability layer, the operator trace 2026-11-05:
 * swallowed sync failures read as "my courses vanished").
 *
 * Pinned here (pure-module, per the answer-format.test.ts / tier1-stores
 * law): the sync-status REDUCER decisions and the bounded auto-retry ladder.
 *
 *   - ok resets the streak and clears the error; error climbs the streak and
 *     carries the API's own message (never invented); sign-out drops to idle —
 *     an error NEVER crosses an identity boundary (no stale toast for the
 *     previous account).
 *   - the retry ladder is 5s → 20s → 60s keyed by the streak AFTER the
 *     failure, then exhausted (null) — recovery beyond it is user-driven
 *     (manual Retry / local write / online / visibility / fresh login).
 *
 * Run: bun test apps/hub/src/lib/my-subjects-sync-status.test.ts
 */
import { describe, expect, test } from "bun:test";

const { nextSyncRetryDelayMs, reduceCoursesSyncState } = await import("./my-subjects");
import type { CoursesSyncState, CoursesSyncEvent } from "./my-subjects";

const IDLE: CoursesSyncState = { status: "idle", lastError: null, at: null, failureStreak: 0 };

const ev = {
  ok: (): CoursesSyncEvent => ({ type: "ok" }),
  error: (message: string): CoursesSyncEvent => ({ type: "error", message }),
  out: (): CoursesSyncEvent => ({ type: "signed-out" }),
};

describe("nextSyncRetryDelayMs — the bounded auto-retry ladder", () => {
  test("first failure → 5s, second → 20s, third → 60s", () => {
    expect(nextSyncRetryDelayMs(1)).toBe(5_000);
    expect(nextSyncRetryDelayMs(2)).toBe(20_000);
    expect(nextSyncRetryDelayMs(3)).toBe(60_000);
  });

  test("ladder exhausted at the 4th consecutive failure → null (user-driven recovery only)", () => {
    expect(nextSyncRetryDelayMs(4)).toBeNull();
    expect(nextSyncRetryDelayMs(7)).toBeNull();
  });

  test("no failure → no retry", () => {
    expect(nextSyncRetryDelayMs(0)).toBeNull();
    expect(nextSyncRetryDelayMs(-1)).toBeNull();
  });
});

describe("reduceCoursesSyncState — the sync health decision core", () => {
  test("idle + error → error streak 1, the API's own message carried verbatim", () => {
    const next = reduceCoursesSyncState(IDLE, ev.error("the server hit an error (HTTP 500)"));
    expect(next.status).toBe("error");
    expect(next.failureStreak).toBe(1);
    expect(next.lastError).toBe("the server hit an error (HTTP 500)");
    expect(next.at).toBeTruthy();
  });

  test("error + error → the streak climbs, the latest message wins", () => {
    const first = reduceCoursesSyncState(IDLE, ev.error("boom one"));
    const second = reduceCoursesSyncState(first, ev.error("boom two"));
    expect(second.status).toBe("error");
    expect(second.failureStreak).toBe(2);
    expect(second.lastError).toBe("boom two");
  });

  test("ok resets the streak and clears the error (the recovery law)", () => {
    const failed = reduceCoursesSyncState(reduceCoursesSyncState(IDLE, ev.error("x")), ev.error("x"));
    const ok = reduceCoursesSyncState(failed, ev.ok());
    expect(ok.status).toBe("ok");
    expect(ok.failureStreak).toBe(0);
    expect(ok.lastError).toBeNull();
  });

  test("a fresh failure after recovery restarts the streak at 1 (fresh toast, fresh ladder)", () => {
    const recovered = reduceCoursesSyncState(
      reduceCoursesSyncState(IDLE, ev.error("x")),
      ev.ok(),
    );
    const again = reduceCoursesSyncState(recovered, ev.error("y"));
    expect(again.failureStreak).toBe(1);
    expect(again.lastError).toBe("y");
  });

  test("signed-out → idle with the error DROPPED — no stale toast across an identity boundary", () => {
    const failed = reduceCoursesSyncState(reduceCoursesSyncState(IDLE, ev.error("x")), ev.error("x"));
    const out = reduceCoursesSyncState(failed, ev.out());
    expect(out.status).toBe("idle");
    expect(out.failureStreak).toBe(0);
    expect(out.lastError).toBeNull();
  });

  test("idle + signed-out → stays idle (the signed-out no-op law, T-TEACH-001)", () => {
    const out = reduceCoursesSyncState(IDLE, ev.out());
    expect(out.status).toBe("idle");
    expect(out.lastError).toBeNull();
  });
});
