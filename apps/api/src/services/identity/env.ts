/**
 * Identity module configuration — ported from the frozen Java core.
 *
 * Sources (syllabai-core @ main, frozen, verified 2026-10-04 by T-MIG-010):
 *   identity/JwtService.java          (secret fail-fast, ttl @Value PT2H)
 *   identity/SecurityProperties.java  (ttl default 2h, cors origins)
 *   identity/AuthService.java         (teacher-join-code: blank = fail closed)
 *   identity/BootstrapAdminService.java (@Value syllabai.bootstrap.enabled:true)
 *   src/main/resources/application.yml (env names + defaults, copied verbatim)
 *
 * Env surface (compat with the Java core — same names, same defaults):
 *   SYLLABAI_JWT_SECRET          min 32 bytes, fail-fast (R-JWT: Java-issued
 *                                tokens must verify through cutover, so the
 *                                SAME secret value is required)
 *   SYLLABAI_JWT_TTL             ISO-8601 duration, default PT2H
 *   SYLLABAI_TEACHER_JOIN_CODE   blank/absent = teacher self-service CLOSED
 *   SYLLABAI_BOOTSTRAP_ENABLED   default true
 *   SYLLABAI_CORS_ORIGINS        comma-separated, default per application.yml
 */

export interface IdentityEnv {
  SYLLABAI_JWT_SECRET: string;
  SYLLABAI_JWT_TTL?: string;
  SYLLABAI_TEACHER_JOIN_CODE?: string;
  SYLLABAI_BOOTSTRAP_ENABLED?: string;
  SYLLABAI_CORS_ORIGINS?: string;
}

/** application.yml: cors-allowed-origins default (verbatim). */
export const CORS_ORIGINS_DEFAULT = "http://localhost:3000,https://syllabai.vercel.app";

/**
 * Parse Spring-style durations: ISO-8601 "PT2H"/"PT30S"/"P1D" and the simple
 * "60s"/"5m"/"2h" forms Spring's Duration binding also accepts. Strict on
 * garbage: a mis-typed TTL would silently widen the token window, so it
 * throws instead of falling back.
 */
export function parseDurationMs(raw: string | undefined, fallbackMs: number): number {
  if (raw === undefined || raw.trim() === "") return fallbackMs;
  const s = raw.trim();
  // simple Spring form: <number>(s|m|h|d)
  const simple = /^(\d+)([smhd])$/.exec(s);
  if (simple) {
    const n = Number(simple[1]);
    const unit = simple[2] as "s" | "m" | "h" | "d";
    const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    return n * mult;
  }
  // ISO-8601: P(nD)?(T(nH)(nM)(nS(.fraction)?)?)? — the shapes the core uses
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/.exec(s);
  if (iso && (iso[1] || iso[2] || iso[3] || iso[4])) {
    const d = Number(iso[1] ?? 0) * 86_400_000;
    const h = Number(iso[2] ?? 0) * 3_600_000;
    const m = Number(iso[3] ?? 0) * 60_000;
    const sec = Number(iso[4] ?? 0) * 1000;
    return d + h + m + sec;
  }
  throw new Error(
    `[identity] fail-fast: SYLLABAI_JWT_TTL "${raw}" is not a parseable duration (ISO-8601 like PT2H, or 60s/5m/2h).`,
  );
}

export interface IdentityConfig {
  jwtSecret: string;
  jwtTtlMs: number;
  /** trimmed; "" = teacher self-service closed (fail-closed 403) */
  teacherJoinCode: string;
  bootstrapEnabled: boolean;
  corsOrigins: string[];
}

/**
 * Builds the identity config and ENFORCES the JwtService boot gate:
 * "syllabai.security.jwt-secret must be set to at least 32 bytes (env
 * SYLLABAI_JWT_SECRET)" — IllegalStateException in the frozen core. The
 * message text is kept verbatim for log parity.
 */
export function buildIdentityConfig(env: Partial<IdentityEnv>): IdentityConfig {
  const secret = env.SYLLABAI_JWT_SECRET ?? "";
  if (secret.length === 0 || secret.trim() === "" || Buffer.byteLength(secret) < 32) {
    throw new Error(
      "syllabai.security.jwt-secret must be set to at least 32 bytes (env SYLLABAI_JWT_SECRET)",
    );
  }
  const ttlRaw = env.SYLLABAI_JWT_TTL;
  const enabledRaw = env.SYLLABAI_BOOTSTRAP_ENABLED;
  return {
    jwtSecret: secret,
    jwtTtlMs: parseDurationMs(ttlRaw, 2 * 3_600_000),
    teacherJoinCode: (env.SYLLABAI_TEACHER_JOIN_CODE ?? "").trim(),
    bootstrapEnabled: enabledRaw === undefined || enabledRaw.trim() === "" ? true : enabledRaw.trim() === "true",
    corsOrigins: (env.SYLLABAI_CORS_ORIGINS ?? CORS_ORIGINS_DEFAULT)
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o !== ""),
  };
}
