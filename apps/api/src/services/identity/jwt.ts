/**
 * JwtService port — constraint-for-constraint from the frozen Java core
 * (syllabai-core @ main, src/main/java/com/syllabai/identity/JwtService.java).
 *
 * Wire parity contract (R-JWT — Java-issued tokens MUST verify here and
 * vice versa, through cutover and the catch-up window):
 *   - alg HS256, signing key = RAW secret bytes (HMAC-SHA-256 over
 *     `${b64url(header)}.${b64url(claims)}`), exactly jjwt's
 *     `Keys.hmacShaKeyFor(secret.getBytes())` + `signWith(key)`.
 *   - jjwt 0.13 emits header {"alg":"HS256"} (no typ) — we emit the same.
 *   - Claims (jjwt builder order irrelevant; names binding):
 *       sub   = user email
 *       jti   = user UUID (also duplicated as uid — the filter reads uid)
 *       uid   = user UUID string
 *       ver   = users.token_version (long; absent on pre-V46 tokens →
 *               parse yields null → callers treat as MISMATCH, fail-closed)
 *       roles = array of Role names
 *       iat/exp = NumericDate SECONDS (jjwt Date-based claims)
 *   - TTL default PT2H (JwtService.java:37); configurable via
 *     SYLLABAI_JWT_TTL (ISO-8601 duration, e.g. PT2H, PT30M, PT90S).
 *   - Construction fails fast on blank/short secret — the Java core's
 *     IllegalStateException("...at least 32 bytes...") is the boot contract
 *     (JwtService.java:38-41); message kept verbatim.
 *
 * Verification matches jjwt parser semantics we depend on:
 *   - signature mismatch, malformed segments, bad JSON → invalid token
 *   - exp in the past → expired (jjwt ExpiredJwtException → invalid)
 *   - nbf/iat in the future: jjwt would reject — not signable by this
 *     service anyway; treated as invalid here for symmetry.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type Role = "STUDENT" | "TEACHER" | "ADMIN";

export interface TokenInfo {
  subject: string;
  userId: string;
  roles: Role[];
  /** token_version at issue time; null when the claim is absent (pre-V46). */
  tokenVersion: number | null;
  expiresAt: Date;
}

export class JwtException extends Error {}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ISO-8601 duration subset used by the core config (PT2H default):
 * PT[nH][nM][nS] — hours/minutes/seconds. Java Duration.parse accepts more
 * (days, weeks), but the only configured value across the frozen repo is
 * PT2H (application.yml) and the env override carries the same shape.
 */
export function parseIsoDuration(value: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value.trim());
  if (!m || (!m[1] && !m[2] && !m[3])) {
    throw new Error(`[identity] unsupported jwt-ttl duration: ${value}`);
  }
  const [, h, min, s] = m;
  return Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

export class JwtService {
  private readonly key: Buffer;
  private readonly ttlSeconds: number;

  constructor(secret: string, ttl = "PT2H") {
    // Fail-fast port of JwtService.java:38-41 (message verbatim).
    if (!secret || secret.trim() === "" || Buffer.byteLength(secret) < 32) {
      throw new Error(
        "syllabai.security.jwt-secret must be set to at least 32 bytes (env SYLLABAI_JWT_SECRET)",
      );
    }
    this.key = Buffer.from(secret, "utf8");
    this.ttlSeconds = parseIsoDuration(ttl);
  }

  get ttl(): number {
    return this.ttlSeconds;
  }

  issueAccessToken(user: {
    email: string;
    id: string;
    tokenVersion: number;
    roles: readonly string[];
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.ttlSeconds;
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.email,
        jti: user.id,
        uid: user.id,
        ver: user.tokenVersion,
        roles: user.roles.map((r) => r),
        iat: now,
        exp,
      }),
    ).toString("base64url");
    const sig = Buffer.from(
      createHmac("sha256", this.key).update(`${header}.${payload}`).digest(),
    ).toString("base64url");
    return `${header}.${payload}.${sig}`;
  }

  /** Port of JwtService.parse — throws JwtException on any invalid/expired token. */
  parse(token: string): TokenInfo {
    const parts = token.split(".");
    if (parts.length !== 3) throw new JwtException("malformed token");
    const [header, payload, sig] = parts as [string, string, string];
    if (!header || !payload || !sig) throw new JwtException("malformed token");

    const expected = createHmac("sha256", this.key)
      .update(`${header}.${payload}`)
      .digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(sig, "base64url");
    } catch {
      throw new JwtException("malformed signature");
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new JwtException("signature mismatch");
    }

    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw new JwtException("malformed claims");
    }

    const exp = claims.exp;
    if (typeof exp !== "number" || Math.floor(Date.now() / 1000) >= exp) {
      throw new JwtException("token expired");
    }

    const uid = claims.uid;
    if (typeof uid !== "string" || !UUID_RE.test(uid)) {
      // Java: UUID.fromString(claims.get("uid", String.class)) throws on
      // garbage — IllegalArgumentException → the filter treats as invalid.
      throw new JwtException("missing or invalid uid claim");
    }
    const subject = claims.sub;
    if (typeof subject !== "string") throw new JwtException("missing subject");

    // Java: claims.get("ver", Long.class) → null when absent; a non-numeric
    // ver would raise a conversion failure → treat as invalid.
    let tokenVersion: number | null = null;
    if (claims.ver !== undefined && claims.ver !== null) {
      if (typeof claims.ver === "number" && Number.isFinite(claims.ver)) {
        tokenVersion = Math.trunc(claims.ver);
      } else if (typeof claims.ver === "string" && /^-?\d+$/.test(claims.ver)) {
        tokenVersion = Number(claims.ver);
      } else {
        throw new JwtException("invalid ver claim");
      }
    }

    const rawRoles = claims.roles ?? [];
    if (!Array.isArray(rawRoles)) throw new JwtException("invalid roles claim");
    const roles: Role[] = [];
    for (const r of rawRoles) {
      if (r !== "STUDENT" && r !== "TEACHER" && r !== "ADMIN") {
        // Java: Role.valueOf throws IllegalArgumentException → invalid token.
        throw new JwtException("unknown role in token");
      }
      roles.push(r);
    }

    return {
      subject,
      userId: uid.toLowerCase(),
      roles,
      tokenVersion,
      expiresAt: new Date(exp * 1000),
    };
  }
}
