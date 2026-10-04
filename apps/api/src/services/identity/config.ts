/**
 * Identity module configuration — the syllabai.security.* + syllabai.ratelimit.*
 + syllabai.bootstrap.* surfaces the frozen core exposes, read from env with
 the SAME defaults as application.yml (never invented values):
 *   SYLLABAI_JWT_SECRET           — required, ≥32 bytes (JwtService fail-fast)
 *   SYLLABAI_JWT_TTL              — default PT2H (application.yml:109)
 *   SYLLABAI_TEACHER_JOIN_CODE    — default "" → gate CLOSED (application.yml:117)
 *   SYLLABAI_CORS_ORIGINS         — default localhost:3000 + syllabai.vercel.app
 *                                    (application.yml:110)
 *   SYLLABAI_RATELIMIT_ENABLED    — default true (application.yml:131)
 *   rate limit window             — 60s, login-per-account 10 (:132,:141)
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
  ratelimit: { enabled: boolean; windowMs: number; loginPerAccount: number };
}

export const DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "https://syllabai.vercel.app"];

export function readIdentityConfig(env: Record<string, string | undefined> = process.env): IdentityConfig {
  const jwtSecret = env.SYLLABAI_JWT_SECRET ?? "";
  const jwtTtl = env.SYLLABAI_JWT_TTL || "PT2H";
  const teacherJoinCode = (env.SYLLABAI_TEACHER_JOIN_CODE ?? "").trim();
  const corsRaw = (env.SYLLABAI_CORS_ORIGINS ?? "").trim();
  const corsOrigins = corsRaw === "" ? [...DEFAULT_CORS_ORIGINS] : corsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const ratelimitEnabled = (env.SYLLABAI_RATELIMIT_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const bootstrapEnabled = (env.SYLLABAI_BOOTSTRAP_ENABLED ?? "true").trim().toLowerCase() !== "false";
  return {
    jwtSecret,
    jwtTtl,
    teacherJoinCode,
    corsOrigins,
    bootstrapEnabled,
    ratelimit: { enabled: ratelimitEnabled, windowMs: 60_000, loginPerAccount: 10 },
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
