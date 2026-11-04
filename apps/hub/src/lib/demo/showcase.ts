import "server-only";

/**
 * T-DEMO-SHOWCASE-1 — the temporary showcase demo (operator order, chat
 * session web-c414c074, trace 1a1a826ecb54969d).
 *
 * WHAT THIS IS: for a live operator showcase, anonymous visitors can open
 * the hub and enter the student / teacher dashboards as two real demo
 * accounts without signing up or typing credentials. The showcase landing
 * (rendered at `/` and `/demo` while the flag below is true) hands a
 * visitor a real session minted through the NORMAL core login path —
 * `POST {v2}/api/v1/auth/login` with the account here, server-side only.
 * No auth bypass exists anywhere: every downstream call still carries the
 * demo account's own bearer token, and RBAC is unchanged.
 *
 * WHY THE CREDENTIALS SIT IN CODE: this is a deliberately temporary,
 * self-contained file in the private repo of record so every lane and
 * agent sees it in review and in grep. The upgrade path (Vercel env vars
 * on the hub project) is documented here for the removal round:
 *   SYLLABAI_DEMO_STUDENT_EMAIL / SYLLABAI_DEMO_STUDENT_PASSWORD
 *   SYLLABAI_DEMO_TEACHER_EMAIL / SYLLABAI_DEMO_TEACHER_PASSWORD
 * with this file reading them first and the constants second.
 *
 * HOW TO TURN THE SHOWCASE OFF (one line): set SHOWCASE_DEMO_ENABLED to
 * false. The landing stops rendering, /api/demo/login answers 404, and
 * nothing else in the app changes. Full removal: delete src/lib/demo/,
 * src/app/api/demo/, src/app/demo/, the page.tsx graft, and the demo
 * accounts themselves (operator-side).
 */

/** Master switch — the one-line kill-switch for the whole showcase. */
export const SHOWCASE_DEMO_ENABLED = true;

export type ShowcaseRole = "student" | "teacher";

export interface ShowcaseAccount {
  role: ShowcaseRole;
  email: string;
  password: string;
}

function account(
  role: ShowcaseRole,
  emailEnv: string,
  passEnv: string,
  email: string,
  password: string,
): ShowcaseAccount {
  // env first, constant fallback — the removal round moves these to env
  // without touching the call sites.
  return {
    role,
    email: process.env[emailEnv] || email,
    password: process.env[passEnv] || password,
  };
}

const SHOWCASE_ACCOUNTS: Record<ShowcaseRole, ShowcaseAccount> = {
  student: account(
    "student",
    "SYLLABAI_DEMO_STUDENT_EMAIL",
    "SYLLABAI_DEMO_STUDENT_PASSWORD",
    "hussaina269a@gmail.com",
    "6Six63ariRmemCY",
  ),
  teacher: account(
    "teacher",
    "SYLLABAI_DEMO_TEACHER_EMAIL",
    "SYLLABAI_DEMO_TEACHER_PASSWORD",
    "hussaina269b@gmail.com",
    "Ayesha-269b-Tk!72",
  ),
};

/** Allow-listed role → demo account, or null for anything else. */
export function showcaseAccountFor(role: string | null): ShowcaseAccount | null {
  if (role !== "student" && role !== "teacher") return null;
  return SHOWCASE_ACCOUNTS[role];
}
