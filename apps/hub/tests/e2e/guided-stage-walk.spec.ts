import { test, expect, type Locator } from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

/**
 * P3 §8 headless walk — ONE sample guided lesson per staged course, against
 * the standalone build serving the REAL content plane (the guided pages read
 * the corpus plane, which the build bakes into public/corpus — mock mode
 * never touches this lane). The walk measures what Table 2 asked for: the
 * stage takeover opens, the beats render as cards, an MCQ check answers, and
 * the §5.5 error loop (See it again / Ask the tutor) works on a MAPPED check
 * (the conservative fallback law withholds the replay on unmapped checks —
 * the walk advances until it meets a mapped one, which the P1 QA interleave
 * rate guarantees within a few checks).
 * Run after every bake:  bun run test:e2e:guided
 */
const COURSE = process.env.GUIDED_WALK_COURSE || "igcse-chemistry-19";

/** The walk authenticates with a SELF-ISSUED test session: the same fixed
 *  secret the walk config injects into the served build, HS256, role
 *  "student" — the sai_session routing cookie of record (lib/session.ts).
 *  Never a production credential; the walk only exercises learner-visible
 *  UI and reads the pinned corpus from disk. */
const E2E_SECRET = process.env.E2E_SESSION_SECRET || "e2e-guided-walk-secret-0123456789abcdef";

async function seedSession(page: import("@playwright/test").Page) {
  const token = await new SignJWT({
    name: "e2e-guided-walk",
    email: "guided-walk@e2e.syllabai.test",
    role: "student",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("e2e-guided-walk")
    .setIssuer("syllabai-hub")
    .setAudience("syllabai-hub")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(E2E_SECRET));
  await page.context().addCookies([{ name: "sai_session", value: token, url: "http://localhost:3000" }]);
}

interface PkgQuestion {
  id: string;
  stem: string;
  kind?: string;
  options?: { key: string; text: string; correct: boolean }[];
  modelAnswer?: string;
}

function loadCorpus() {
  const contentDir = path.join(process.cwd(), "content");
  const idx = JSON.parse(fs.readFileSync(path.join(contentDir, COURSE, "guided-import.json"), "utf8"));
  const entry = idx.notes[0];
  const pkg = JSON.parse(fs.readFileSync(path.join(contentDir, entry.packagePath), "utf8"));
  return { noteId: entry.noteId as string, pkg: pkg as { questions: PkgQuestion[] } };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The arc's primary-action buttons (opener/bridge/key-point/layer/example). */
function nextButton(stage: Locator): Locator {
  return stage
    .getByRole("button", { name: /^(Got it|Continue|Rate my confidence|Start|Review|Walk through|See the worked|Next)/ })
    .first();
}

test(`guided stage walk — ${COURSE} (P0 takeover + P1 beats + P2 error loop)`, async ({ page }) => {
  const { noteId, pkg } = loadCorpus();
  await seedSession(page);
  await page.goto(`/courses/${COURSE}/guided-lessons/${noteId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });

  // ── P0: the full-height stage takeover replaces the document chrome ──────
  // The picker card is the pre-start screen in the document layout — the
  // takeover opens when the learner starts the lesson (engaged/picked law).
  await page
    .getByRole("button", { name: /^(Start|Continue|Review)/ })
    .first()
    .click();
  const stage = page.locator('[data-guided-stage="open"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByRole("button", { name: "Exit the guided lesson" })).toBeVisible();

  // ── P1: advance the beat arc to its first MCQ check surface ─────────────
  // Bounded primary-action loop. Written checks are skipped the honest way
  // (reveal the model answer, continue) — the R-3 taxonomy guarantees ≥ 1
  // MCQ per note, so the loop reaches one within the bound.
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    const group = page
      .locator('[data-guided-stage="open"] [role="radiogroup"][aria-label^="Options for question"]')
      .first();
    if (await group.isVisible().catch(() => false)) {
      reached = true;
      break;
    }
    const confidence = stage.getByRole("radio", { name: /^Low/ });
    if ((await confidence.count()) > 0 && (await confidence.first().isVisible())) {
      await confidence.first().click();
    }
    const btn = nextButton(stage);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(120);
    } else {
      break;
    }
  }
  expect(reached, "the arc reached an MCQ check within the bounded walk").toBe(true);

  // ── answer checks WRONG until one carries the mapped replay (P1 QA rate) ─
  let sawErrorLoop = false;
  for (let attempt = 0; attempt < 8 && !sawErrorLoop; attempt++) {
    const group = page
      .locator('[data-guided-stage="open"] [role="radiogroup"][aria-label^="Options for question"]')
      .first();
    if (!(await group.isVisible().catch(() => false))) break;
    const legend = group.locator("xpath=ancestor::fieldset[1]/legend");
    const legendText = (await legend.innerText()).replace(/^\s*\d+\.\s*/, "").trim();
    const q = (pkg.questions || []).find((c) => c.stem === legendText);
    expect(q, `the rendered stem "${legendText.slice(0, 60)}…" resolves in the pinned package`).toBeTruthy();
    const wrong = (q!.options || []).find((o) => !o.correct);
    expect(wrong, "the question carries an authored distractor").toBeTruthy();
    await group.getByRole("radio", { name: new RegExp(esc(wrong!.text.slice(0, 48))) }).first().click();
    await stage.getByRole("button", { name: "Submit answer" }).first().click();

    await expect(stage.getByText("Not quite").first()).toBeVisible();
    const seeAgain = stage.getByRole("button", { name: "See it again" }).first();
    if (await seeAgain.isVisible().catch(() => false)) {
      // ── P2 error loop of record ────────────────────────────────────────
      const tutorLink = stage.getByRole("link", { name: "Ask the tutor" }).first();
      await expect(tutorLink).toBeVisible();
      expect(await tutorLink.getAttribute("href")).toContain(`/tutor?course=${COURSE}&q=`);
      await seeAgain.click();
      const replay = stage.locator('[role="region"][aria-label="The key point this check teaches"]');
      await expect(replay).toBeVisible();
      // the toggle's accessible name flips when open (See it again ↔ Hide the key point)
      await stage.getByRole("button", { name: "Hide the key point" }).first().click();
      await expect(replay).not.toBeVisible();
      sawErrorLoop = true;
      break;
    }
    // unmapped check — the conservative law withheld the replay; advance to
    // the next check surface and try again (Next / Continue)
    const adv = nextButton(stage);
    if (!(await adv.isVisible().catch(() => false))) break;
    await adv.click();
    await page.waitForTimeout(120);
  }
  expect(sawErrorLoop, "a mapped check carried the §5.5 error loop (See it again + Ask the tutor)").toBe(true);

  // ── P0 exit: Escape closes the takeover, flow state preserved ────────────
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-guided-stage="open"]')).not.toBeVisible();
});
