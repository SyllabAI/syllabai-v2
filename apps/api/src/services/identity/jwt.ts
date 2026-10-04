/**
 * JwtService port — issue/verify HS256-family access tokens.
 * Frozen source: identity/JwtService.java (verified 2026-10-04, T-MIG-010).
 *
 * R-JWT compat (MIGRATION_PLAN risk register): Java-issued tokens must verify
 * here through cutover, and vice versa. That pins:
 *   - the SAME secret (SYLLABAI_JWT_SECRET) — enforced in env.ts;
 *   - jjwt's algorithm selection: Keys.hmacShaKeyFor(secretBytes) picks the
 *     HMAC by key length — ≥64 bytes → HS512, ≥48 → HS384, else HS256 — and
 *     signWith(key)/verifyWith(key) then use exactly that algorithm. We mirror
 *     the selection and REJECT tokens whose alg header disagrees with the
 *     key-derived algorithm (jjwt fails such tokens; accepting them would be
 *     an algorithm-confusion hole the core does not have).
 *   - claims: sub=email, jti=user id, uid=user id (string UUID), ver=token
 *     version (Long; null for pre-V46 tokens — the filter treats null as
 *     mismatched, fail-closed), roles=[Role names], iat/exp (seconds).
 *   - expiry: jjwt throws ExpiredJwtException when exp is BEFORE now
 *     (exp == now is still valid) — mirrored.
 */

const enc = new TextEncoder();

function base64urlFromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function bytesFromBase64url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

export type HmacAlg = "HS256" | "HS384" | "HS512";

/** jjwt Keys.hmacShaKeyFor algorithm selection, by key byte length. */
export function algForKey(secret: string): HmacAlg {
  const bytes = Buffer.byteLength(secret);
  if (bytes >= 64) return "HS512";
  if (bytes >= 48) return "HS384";
  return "HS256";
}

async function hmac(secret: string, alg: HmacAlg, data: string): Promise<Uint8Array> {
  const hash = alg === "HS512" ? "SHA-512" : alg === "HS384" ? "SHA-384" : "SHA-256";
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** constant-time byte comparison (signature check must not leak via timing). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export interface TokenInfo {
  subject: string;
  userId: string;
  /** Role names (uppercase) carried in the "roles" claim. */
  roles: string[];
  /** "ver" claim; null when absent (pre-V46 token) — fail-closed upstream. */
  tokenVersion: number | null;
  expiresAt: Date;
}

export interface JwtPort {
  issueAccessToken(user: { id: string; email: string; tokenVersion: number; roles: readonly string[] }): Promise<string>;
  parse(token: string): Promise<TokenInfo>;
  ttlMs(): number;
}

export interface JwtServiceDeps {
  secret: string;
  ttlMs: number;
  now?: () => number;
}

/**
 * Standard Role names, enforced like Role.valueOf on parse: an unknown role
 * name throws (IllegalArgumentException in the core → context stays empty).
 */
const ROLE_NAMES = new Set(["STUDENT", "TEACHER", "ADMIN"]);

export function createJwtService(deps: JwtServiceDeps): JwtPort {
  const { secret, ttlMs } = deps;
  // JwtService.java constructor — IllegalStateException parity, message verbatim
  if (secret.length === 0 || secret.trim() === "" || Buffer.byteLength(secret) < 32) {
    throw new Error(
      "syllabai.security.jwt-secret must be set to at least 32 bytes (env SYLLABAI_JWT_SECRET)",
    );
  }
  const now = deps.now ?? Date.now;
  const alg = algForKey(secret);

  return {
    ttlMs: () => ttlMs,

    async issueAccessToken(user): Promise<string> {
      const issuedAtSec = Math.floor(now() / 1000);
      const expSec = Math.floor((now() + ttlMs) / 1000);
      const header = base64urlFromBytes(enc.encode(JSON.stringify({ alg, typ: "JWT" })));
      const payload = base64urlFromBytes(
        enc.encode(
          JSON.stringify({
            sub: user.email,
            jti: user.id,
            uid: user.id,
            ver: user.tokenVersion,
            roles: [...user.roles],
            iat: issuedAtSec,
            exp: expSec,
          }),
        ),
      );
      const sig = await hmac(secret, alg, `${header}.${payload}`);
      return `${header}.${payload}.${base64urlFromBytes(sig)}`;
    },

    async parse(token): Promise<TokenInfo> {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("JwtException: malformed token");
      const [h, p, s] = parts as [string, string, string];

      let headerJson: { alg?: string };
      try {
        headerJson = JSON.parse(Buffer.from(bytesFromBase64url(h)).toString("utf8"));
      } catch {
        throw new Error("JwtException: malformed header");
      }
      if (headerJson.alg !== alg) {
        // jjwt verifyWith(SecretKey): the token's alg must be the key's alg.
        throw new Error(`JwtException: algorithm mismatch (token ${headerJson.alg}, key ${alg})`);
      }

      const expected = await hmac(secret, alg, `${h}.${p}`);
      const presented = bytesFromBase64url(s);
      if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
        throw new Error("JwtException: signature mismatch");
      }

      let claims: Record<string, unknown>;
      try {
        claims = JSON.parse(Buffer.from(bytesFromBase64url(p)).toString("utf8"));
      } catch {
        throw new Error("JwtException: malformed payload");
      }

      const expMs = typeof claims.exp === "number" ? claims.exp * 1000 : NaN;
      if (!Number.isFinite(expMs) || expMs < now()) {
        // jjwt: exp.before(now) → ExpiredJwtException (exp == now still valid)
        throw new Error("JwtException: token expired");
      }

      const uid = typeof claims.uid === "string" ? claims.uid : "";
      if (!UUID_RE.test(uid)) {
        // UUID.fromString failure = IllegalArgumentException in the core —
        // the filter catches it and leaves the context empty.
        throw new Error("IllegalArgumentException: uid is not a UUID");
      }

      const verClaim = claims.ver;
      const tokenVersion =
        typeof verClaim === "number" && Number.isFinite(verClaim) ? verClaim : null;

      const rawRoles = Array.isArray(claims.roles) ? claims.roles : [];
      const roles: string[] = [];
      for (const r of rawRoles) {
        if (typeof r !== "string" || !ROLE_NAMES.has(r)) {
          throw new Error("IllegalArgumentException: unknown role in token");
        }
        roles.push(r);
      }

      return {
        subject: typeof claims.sub === "string" ? claims.sub : "",
        userId: uid,
        roles,
        tokenVersion,
        expiresAt: new Date(expMs),
      };
    },
  };
}
