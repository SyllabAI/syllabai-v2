import { defineConfig, devices } from "@playwright/test";

/**
 * P3 §8 headless QA walk — the guided-stage walker against the REAL corpus.
 *
 * Same standalone build as the default e2e config, but the walk is the
 * of-record bake gate for the guided-lessons lane: run after every bake
 * (`bun run test:e2e:guided`) and before any corpus backfill lands. The
 * guided pages serve the corpus plane (baked into public/corpus by the
 * build), so mock mode is irrelevant here and is deliberately unset.
 * Courses ride NEXT_PUBLIC_GUIDED_STAGE_COURSES (default igcse-chemistry-19);
 * set GUIDED_WALK_COURSE to walk physics/biology once they are staged.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /guided-stage-walk\.spec\.ts/,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 180_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run start",
    url: "http://localhost:3000",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: "production",
      HUB_CORPUS_STATIC_ORIGIN: "http://127.0.0.1:3000",
      PORT: "3000",
      // the walk's self-issued test session (see the spec header) — the SAME
      // secret the spec signs with; never a production credential
      SESSION_SECRET: process.env.E2E_SESSION_SECRET || "e2e-guided-walk-secret-0123456789abcdef",
    },
  },
});
