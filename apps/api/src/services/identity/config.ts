/**
 * Identity module configuration — the syllabai.security.* + syllabai.ratelimit.*
 + syllabai.bootstrap.* surfaces the frozen core exposes, read from env with
 the SAME defaults as application.yml (never invented values):
 *   SYLLABAI_JWT_SECRET           — required, ≥32 bytes (JwtService fail-fast)
 *   SYLLABAI_JWT_TTL              — default PT2H (application.yml:109)
 *   SYLLABAI_TEACHER_JOIN_CODE    — default "" → gate CLOSED (application.yml:117)
 *   SYLLABAI_CORS_ORIGINS         — default localhost:3000 + syllabai-hub.vercel.app
 *                                    + syllabai-hub-v2.vercel.app (documented supersession
 *                                    of the application.yml:110 port, which carried the
 *                                    legacy apex — T-MIG-098 / issue #147)
 *   SYLLABAI_RATELIMIT_ENABLED    — default true (application.yml:131)
 *   rate limit window             — 60s, login-per-account 10 (:132,:141)
 *   SYLLABAI_RATELIMIT_LOGIN_PER_IP     — default 10  (RateLimitProperties:54,
 *                                          application.yml:126)
 *   SYLLABAI_RATELIMIT_REGISTER_PER_IP  — default 5   (:55, yml:127)
 *   SYLLABAI_RATELIMIT_BOOTSTRAP_PER_IP — default 3   (:56, yml:128)
 *   SYLLABAI_RATELIMIT_PASSWORD_PER_IP  — default 10  (:57, yml:129)
 *   SYLLABAI_RATELIMIT_LLM_PER_LEARNER  — default 20  (:58, yml:130)
 *   SYLLABAI_BOOTSTRAP_ENABLED    — default true (BootstrapAdminService.java:62
 *                                    via relaxed binding of syllabai.bootstrap.enabled)
 *
 * This file lives inside services/identity/ so the whole port stays inside
 * the T-MIG-010 file fence (apps/api/src/env.ts is outside it).
 */
import { JwtService, type Role } from "./jwt";
import { LoginAttemptBudget } from "./budget";

export interface IdentityConfig {
  jwtSecret: string;
  jwtTtl: string;
  teacherJoinCode: string;
  corsOrigins: string[];
  bootstrapEnabled: boolean;
  ratelimit: {
    enabled: boolean;
    windowMs: number;
    loginPerIp: number;
    registerPerIp: number;
    bootstrapPerIp: number;
    passwordPerIp: number;
    llmPerLearner: number;
    loginPerAccount: number;
  };
}

/**
 * Ported default of the frozen core's application.yml:110 was
 * ["http://localhost:3000", "https://syllabai.vercel.app"]. The apex project is
 * now the decommission-pending zombie cluster (500 MIDDLEWARE_INVOCATION_FAILED,
 * issue #147 / prj_D7vf; topology of record in the R0 sweep a6e89b1), so the
 * faithful-port default named a dead origin. Documented supersession per the
 * operator order trace 1a119b4d197a2671 (T-MIG-098): the live browser origins
 * are the frozen-core hub (syllabai-hub.vercel.app) and the v2 hub
 * (syllabai-hub-v2.vercel.app). Production runs on the SYLLABAI_CORS_ORIGINS
 * env override, so this default governs local dev and fresh deployments.
 */
export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "https://syllabai-hub.vercel.app",
  "https://syllabai-hub-v2.vercel.app",
];

export function readIdentityConfig(env: Record<string, string | undefined> = process.env): IdentityConfig {
  const jwtSecret = env.SYLLABAI_JWT_SECRET ?? "";
  const jwtTtl = env.SYLLABAI_JWT_TTL || "PT2H";
  const teacherJoinCode = (env.SYLLABAI_TEACHER_JOIN_CODE ?? "").trim();
  const corsRaw = (env.SYLLABAI_CORS_ORIGINS ?? "").trim();
  const corsOrigins = corsRaw === "" ? [...DEFAULT_CORS_ORIGINS] : corsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const ratelimitEnabled = (env.SYLLABAI_RATELIMIT_ENABLED ?? "true").trim().toLowerCase() !== "false";
  // budget defaults are the audited M1 values (RateLimitProperties compact
  // constructor :53-59) — never invented; env overrides relaxed-bind the
  // syllabai.ratelimit.* keys exactly like the enabled switch above
  const ratelimitInt = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || raw.trim() === "") return fallback;
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };
  const bootstrapEnabled = (env.SYLLABAI_BOOTSTRAP_ENABLED ?? "true").trim().toLowerCase() !== "false";
  return {
    jwtSecret,
    jwtTtl,
    teacherJoinCode,
    corsOrigins,
    bootstrapEnabled,
    ratelimit: {
      enabled: ratelimitEnabled,
      windowMs: 60_000,
      loginPerIp: ratelimitInt(env.SYLLABAI_RATELIMIT_LOGIN_PER_IP, 10),
      registerPerIp: ratelimitInt(env.SYLLABAI_RATELIMIT_REGISTER_PER_IP, 5),
      bootstrapPerIp: ratelimitInt(env.SYLLABAI_RATELIMIT_BOOTSTRAP_PER_IP, 3),
      passwordPerIp: ratelimitInt(env.SYLLABAI_RATELIMIT_PASSWORD_PER_IP, 10),
      llmPerLearner: ratelimitInt(env.SYLLABAI_RATELIMIT_LLM_PER_LEARNER, 20),
      loginPerAccount: 10,
    },
  };
}

export interface IdentityServices {
  jwt: JwtService;
  budget: LoginAttemptBudget;
  config: IdentityConfig;
}

/** Builds the pure (no-DB) identity services; throws at boot on bad secrets. */
export function buildIdentityServices(config: IdentityConfig): IdentityServices {
  const jwt = new JwtService(config.jwtSecret, config.jwtTtl);
  const budget = new LoginAttemptBudget({
    windowMs: config.ratelimit.windowMs,
    loginPerAccount: config.ratelimit.loginPerAccount,
    enabled: config.ratelimit.enabled,
  });
  return { jwt, budget, config };
}

export type { Role };
