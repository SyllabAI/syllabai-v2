import { expect, test } from "@playwright/test";

/**
 * Guard spec for the per-course tutor rail (V53 origin, ADR-030, PR #5;
 * STRICT SEPARATION law since the operator instruction of 2026-10-21,
 * trace 1a15b45224c4e3f5 — "each subject/course must have separate tutors,
 * separate history, conversations").
 *
 * The current contract, pinned here:
 *   - a course-scoped tutor's rail shows ONLY threads created under the
 *     SAME registry slug (threadInScope, slug-to-slug);
 *   - the legacy /tutor rail shows ONLY course-less threads;
 *   - no cross-course bleed in either direction — including the legacy
 *     pilot history, which the earlier V53 posture kept visible inside
 *     scoped rails and which the strict law retires.
 *
 * The label-collision case stays load-bearing: ial-chemistry-17 and
 * igcse-chemistry-19 are BOTH "Chemistry" in the registry. A filter that
 * compares courseLabel would show the IAL thread inside the IGCSE tutor
 * (cross-course bleed) — thread B2 asserts it stays hidden.
 *
 * Seeding follows the established harness pattern (deck-flow/a11y): the
 * session lands in localStorage via addInitScript before the app boots
 * (RequireAuth then mounts the chat), and the thread store is seeded the
 * same way — the store reads localStorage once at module init, so the rail
 * renders exactly the history a returning learner's browser would hold.
 * Titles carry unique markers so rail visibility is asserted by text, the
 * way a learner sees it.
 */

const PILOT = "igcse-chemistry-19"; // mapped: curriculumCode 4CH1-2017, label "Chemistry"
const OTHER_CHEM = "ial-chemistry-17"; // real course, ALSO labeled "Chemistry", unmapped

const OWN_TITLE = "IGCSE chem — moles question";
const OTHER_TITLE = "IAL chem — equilibrium question";
const LEGACY_TITLE = "Legacy pilot chat — no course";

const THREADS_KEY = "syllabai.tutor.threads.v1";

/** The seed payload, built in Node context and passed to the page as a
 *  serialized arg — addInitScript does NOT transfer closure variables, so
 *  the in-page callback must only read its argument (lesson from the first
 *  run: a closure over PILOT/OWN_TITLE threw ReferenceError in the page and
 *  the chat never mounted past RequireAuth). */
function seedPayload() {
  const now = Date.now();
  const threads = {
    threads: [
      {
        id: "rail-own",
        title: OWN_TITLE,
        createdAt: now - 60_000,
        updatedAt: now - 60_000,
        messages: [{ role: "user", content: "what is a mole?", at: now - 60_000 }],
        sessionId: null,
        courseSlug: PILOT,
        courseLabel: "Chemistry",
      },
      {
        id: "rail-other-same-label",
        title: OTHER_TITLE,
        createdAt: now - 120_000,
        updatedAt: now - 120_000,
        messages: [{ role: "user", content: "equilibrium shift?", at: now - 120_000 }],
        sessionId: null,
        // SAME display label as the pilot course, DIFFERENT registry slug —
        // the collision that makes label-matching wrong
        courseSlug: OTHER_CHEM,
        courseLabel: "Chemistry",
      },
      {
        id: "rail-legacy",
        title: LEGACY_TITLE,
        createdAt: now - 180_000,
        updatedAt: now - 180_000,
        messages: [{ role: "user", content: "hello", at: now - 180_000 }],
        sessionId: null,
        courseSlug: null,
        courseLabel: null,
      },
    ],
    activeId: "rail-own",
  };
  return {
    threadsRaw: JSON.stringify(threads),
    threadsKey: THREADS_KEY,
    user: JSON.stringify({
      id: "00000000-0000-0000-0000-00000000rail01",
      email: "rail-guard@e2e.test",
      displayName: "Rail Guard",
      roles: ["LEARNER"],
    }),
  };
}

test.beforeEach(({ context }) => {
  void context.addInitScript((seed) => {
    localStorage.setItem(seed.threadsKey, seed.threadsRaw);
    localStorage.setItem("syllabai.token", "e2e-rail-guard-token");
    localStorage.setItem("syllabai.user", seed.user);
  }, seedPayload());
});

test("scoped tutor rail: ONLY its own course's threads — other course AND course-less hidden", async ({
  page,
}) => {
  await page.goto(`/tutor?course=${PILOT}`);

  // the chat mounts past RequireAuth — the composer is the mount signal
  await expect(page.locator("textarea")).toBeVisible({ timeout: 20_000 });

  // rail assertions are scoped to the history nav: the ACTIVE thread's
  // title also renders in the chat pane, which would break strict mode
  const rail = page.locator('nav[aria-label="Conversation history"]');

  // scope honesty: the scope line names the course AND the served courseRef
  await expect(page.getByText("Scoped to Chemistry", { exact: false })).toBeVisible();
  await expect(page.getByText("(4CH1-2017)", { exact: true })).toBeVisible();

  // B1 — the scoped tutor's OWN thread is in its own rail
  await expect(rail.getByText(OWN_TITLE, { exact: true })).toBeVisible();

  // strict separation (operator instruction 2026-10-21): the legacy
  // course-less pilot history does NOT leak into a course's tutor —
  // each tutor owns its history alone
  await expect(rail.getByText(LEGACY_TITLE, { exact: true })).toHaveCount(0);

  // B2 — the label-collision guard: another course's thread — whose
  // courseLabel is ALSO "Chemistry" — must NOT leak into this rail
  await expect(rail.getByText(OTHER_TITLE, { exact: true })).toHaveCount(0);

  // the rail is not in its empty state while threads exist
  await expect(rail.getByText("No conversations yet", { exact: true })).toHaveCount(0);
});

test("legacy /tutor rail: ONLY course-less threads — every course's history stays in its own tutor", async ({
  page,
}) => {
  await page.goto("/tutor");
  await expect(page.locator("textarea")).toBeVisible({ timeout: 20_000 });

  const rail = page.locator('nav[aria-label="Conversation history"]');

  // the legacy honesty line renders (no course scope above it)
  await expect(page.getByText("Pilot tutor", { exact: false })).toBeVisible();
  await expect(page.getByText("Scoped to Chemistry", { exact: false })).toHaveCount(0);

  // strict separation: the legacy entry sees ONLY course-less threads —
  // course-created history lives in its own course's tutor
  await expect(rail.getByText(LEGACY_TITLE, { exact: true })).toBeVisible();
  await expect(rail.getByText(OWN_TITLE, { exact: true })).toHaveCount(0);
  await expect(rail.getByText(OTHER_TITLE, { exact: true })).toHaveCount(0);
});
