/**
 * Boot-time secret gate — PORTED BEHAVIOUR, not a new idea.
 *
 * The Java core fails fast at boot on blank security-critical config
 * (blank SYLLABAI_JWT_SECRET = refuse to start; render.yaml comment:
 * "auth (fails fast if blank)"). The v2 api keeps that discipline: it must
 * never come up half-configured and silently degrade — a missing secret
 * here means a request path that would later fail mid-flight, which is the
 * failure mode the frozen core was explicitly designed to prevent.
 *
 * During golden-master capture this api runs against a Neon BRANCH with
 * the SAME secret values as the Java core (JWT secret compat is what makes
 * token-issued-by-Java accepted-by-TS possible at cutover; see
 * docs/MIGRATION_PLAN.md §Risk register, R-JWT).
 */
export interface ApiEnv {
  SYLLABAI_JWT_SECRET: string;
  DATABASE_URL: string;
}

export function requireEnv<T extends keyof ApiEnv>(key: T): ApiEnv[T] {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`[api] fail-fast: required env ${key} is blank — refusing to start.`);
  }
  return value as ApiEnv[T];
}
