/**
 * JWT port pins — T-MIG-010. Frozen spec: identity/JwtService.java +
 * JwtAuthenticationFilter.java (ver claims, fail-closed revocation).
 * R-JWT: Java-issued tokens must verify here (and vice versa) through cutover.
 */
import { describe, expect, test } from "bun:test";
import { createJwtService, algForKey } from "../../src/services/identity/jwt";

const SECRET_32 = "0123456789abcdef0123456789abcdef"; // 32 bytes → HS256
const SECRET_64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64 → HS512

const user = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  email: "student@example.invalid",
  tokenVersion: 1,
  roles: ["STUDENT"] as const,
};

describe("JwtService boot gate (JwtService.java constructor)", () => {
  test("secret < 32 bytes is a construction-time failure (IllegalStateException parity)", () => {
    expect(() => createJwtService({ secret: "short", ttlMs: 7_200_000 })).toThrow(
      /at least 32 bytes/,
    );
  });
});

describe("algForKey — jjwt Keys.hmacShaKeyFor selection by key length", () => {
  test("32 bytes → HS256, 48 → HS384, 64 → HS512", () => {
    expect(algForKey(SECRET_32)).toBe("HS256");
    expect(algForKey("x".repeat(48))).toBe("HS384");
    expect(algForKey(SECRET_64)).toBe("HS512");
  });
});

describe("issueAccessToken / parse roundtrip (claims sub/jti/uid/ver/roles/iat/exp)", () => {
  const jwt = createJwtService({ secret: SECRET_32, ttlMs: 7_200_000 });

  test("roundtrip preserves identity claims; TTL default 2h (PT2H)", async () => {
    const token = await jwt.issueAccessToken(user);
    const info = await jwt.parse(token);
    expect(info.subject).toBe(user.email);
    expect(info.userId).toBe(user.id);
    expect(info.roles).toEqual(["STUDENT"]);
    expect(info.tokenVersion).toBe(1);
    const ttlSec = (info.expiresAt.getTime() - Date.now()) / 1000;
    expect(ttlSec).toBeGreaterThan(7_199 - 60); // ~2h
    expect(jwt.ttlMs()).toBe(7_200_000);
  });

  test("issued token header declares the key-derived alg", async () => {
    const token = await jwt.issueAccessToken(user);
    const header = JSON.parse(atob(token.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(header.alg).toBe("HS256");
    expect(header.typ).toBe("JWT");
  });
});

describe("parse rejections (JwtException | IllegalArgumentException → context empty)", () => {
  const jwt = createJwtService({ secret: SECRET_32, ttlMs: 7_200_000 });

  test("tampered payload rejected", async () => {
    const token = await jwt.issueAccessToken(user);
    const parts = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "attacker@x.invalid", uid: user.id, ver: 1, roles: ["ADMIN"], exp: Math.floor(Date.now() / 1000) + 999 })).toString("base64url");
    await expect(jwt.parse(`${parts[0]}.${forged}.${parts[2]}`)).rejects.toThrow(/signature/);
  });

  test("expired token rejected (exp strictly before now)", async () => {
    let nowMs = 1_000_000;
    const clocked = createJwtService({ secret: SECRET_32, ttlMs: 1_000, now: () => nowMs });
    const token = await clocked.issueAccessToken(user);
    nowMs += 2_000; // past exp
    await expect(clocked.parse(token)).rejects.toThrow(/expired/);
  });

  test("exp == now is still valid (jjwt exp.before(now) semantics)", async () => {
    let nowMs = 1_000_000;
    const clocked = createJwtService({ secret: SECRET_32, ttlMs: 1_000, now: () => nowMs });
    const token = await clocked.issueAccessToken(user);
    nowMs += 1_000; // exp == now
    const info = await clocked.parse(token);
    expect(info.userId).toBe(user.id);
  });
  test("alg mismatch vs key rejected (no algorithm confusion)", async () => {
    const hs512 = createJwtService({ secret: SECRET_64, ttlMs: 7_200_000 });
    const hs256 = createJwtService({ secret: SECRET_32, ttlMs: 7_200_000 });
    const token = await hs512.issueAccessToken(user); // HS512 header
    await expect(hs256.parse(token)).rejects.toThrow(/algorithm mismatch/);
  });

  test("non-UUID uid rejected (IllegalArgumentException analog)", async () => {
    // hand-signed token (valid signature) carrying uid="not-a-uuid"
    const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payloadB64 = Buffer.from(
      JSON.stringify({ sub: user.email, uid: "not-a-uuid", ver: 1, roles: ["STUDENT"], exp: Math.floor(Date.now() / 1000) + 999 }),
    ).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET_32),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    const token = `${headerB64}.${payloadB64}.${Buffer.from(sig).toString("base64url")}`;
    await expect(jwt.parse(token)).rejects.toThrow(/uid/);
  });

  test("unknown role name in token rejected (Role.valueOf analog)", async () => {
    const svc = createJwtService({ secret: SECRET_32, ttlMs: 7_200_000 });
    const token = await svc.issueAccessToken({ ...user, roles: ["SUPERUSER"] as unknown as string[] });
    await expect(svc.parse(token)).rejects.toThrow(/role/);
  });

  test("absent ver claim parses as null (pre-V46 token) — filter fails closed", async () => {
    const svc = createJwtService({ secret: SECRET_32, ttlMs: 7_200_000 });
    const token = await svc.issueAccessToken(user);
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    delete payload.ver;
    // craft a properly-signed token WITHOUT ver by using the service internals
    // (re-sign manually with the same secret)
    const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const crypto = globalThis.crypto;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET_32),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    const tokenNoVer = `${headerB64}.${payloadB64}.${Buffer.from(sig).toString("base64url")}`;
    const info = await svc.parse(tokenNoVer);
    expect(info.tokenVersion).toBeNull();
  });
});
