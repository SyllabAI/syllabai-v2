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
 * T-TUTOR-SEC-1 (2026-11-07) — the removal round, phase 1 (T-TUTOR-AUDIT-1
 * finding TU-10, P0). The audit found this file — then in a PUBLIC repo —
 * hardcoding plaintext fallback passwords for two real accounts: both
 * passwords were burned. The response, in order:
 *   1. both passwords were ROTATED through the app's own POST
 *      /api/v1/auth/password (identity parity: changePassword bumps
 *      users.token_version, so every pre-rotation session — including any
 *      minted through the public /api/demo/login backdoor — dies at its
 *      next request; R1);
 *   2. this file: the master switch is env-gated DEFAULT-OFF and the
 *      plaintext fallback constants are GONE. The demo accounts exist only
 *      when all four SYLLABAI_DEMO_* env vars are set on the host; unset
 *      env resolves to null and the route refuses (fail-closed).
 * Production sets none of them, so the flag reads false: the landing stops
 * rendering (the regular landing renders instead, byte-identical),
 * /api/demo/login answers 404, and /demo renders the signed-out notice.
 * Re-enabling is a deliberate five-env-var act, never a code default.
 *
 * Full removal (phase 2): delete src/lib/demo/, src/app/api/demo/,
 * src/app/demo/, the page.tsx graft, and the demo accounts themselves
 * (operator-side).
 */

/** Master switch — env-gated, DEFAULT OFF (T-TUTOR-SEC-1). */
export const SHOWCASE_DEMO_ENABLED = process.env.SHOWCASE_DEMO_ENABLED === "true";

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
): ShowcaseAccount | null {
  // env-only since T-TUTOR-SEC-1: no credential material lives in source.
  // Unset env → null → showcaseAccountFor refuses → the route fails closed.
  const email = process.env[emailEnv];
  const password = process.env[passEnv];
  if (!email || !password) return null;
  return { role, email, password };
}

const SHOWCASE_ACCOUNTS: Record<ShowcaseRole, ShowcaseAccount | null> = {
  student: account(
    "student",
    "SYLLABAI_DEMO_STUDENT_EMAIL",
    "SYLLABAI_DEMO_STUDENT_PASSWORD",
  ),
  teacher: account(
    "teacher",
    "SYLLABAI_DEMO_TEACHER_EMAIL",
    "SYLLABAI_DEMO_TEACHER_PASSWORD",
  ),
};

/** Allow-listed role → demo account, or null (unknown role or env unset). */
export function showcaseAccountFor(role: string | null): ShowcaseAccount | null {
  if (role !== "student" && role !== "teacher") return null;
  return SHOWCASE_ACCOUNTS[role];
}
