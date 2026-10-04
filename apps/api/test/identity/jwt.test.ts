import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { JwtService, JwtException, parseIsoDuration } from "../../src/services/identity/jwt";

/**
 * R-JWT parity tests — the wire contract JwtService.java + jjwt 0.13 define.
 *
 * Cross-verify honesty: the fixtures below are jjwt-semantics-by-construction
 * (HS256 HMAC over b64url(header).b64url(payload), {"alg":"HS256"} header,
 * seconds NumericDates) — the same primitive Node exposes. A token stamped by
 * the ACTUAL Java core (real jjwt output, real SYLLABAI_JWT_SECRET) must be
 * substituted at golden capture (T-MIG-003 / R6): the capture harness records
 * a register/login response and the replayed token MUST verify here. That
 * live cross-verify is the true R-JWT gate and is explicitly listed as
 * pending in the T-MIG-010 execution_record.
 */
const SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef"; // 48 bytes
const USER = {
  email: "alice@example.invalid",
  id: "11111111-2222-4333-8444-555555555555",
  tokenVersion: 3,
  roles: ["STUDENT"] as ("STUDENT" | "TEACHER" | "ADMIN")[],
};

describe("JwtService — construction fail-fast (JwtService.java:38-41)", () => {
  test("blank secret refuses boot with the verbatim message", () => {
    expect(() => new JwtService("")).toThrow(
      "syllabai.security.jwt-secret must be set to at least 32 bytes (env SYLLABAI_JWT_SECRET)",
    );
    expect(() => new JwtService("   ")).toThrow();
  });

  test("short secret (<32 bytes) refuses boot", () => {
    expect(() => new JwtService("too-short")).toThrow();
  });

  test("exactly 32 bytes is accepted (jjwt hmacShaKeyFor floor)", () => {
    expect(() => new JwtService("a".repeat(32))).not.toThrow();
  });
});

describe("JwtService — TTL (application.yml: syllabai.security.jwt-ttl PT2H)", () => {
  test("default TTL is 7200s (PT2H)", () => {
    expect(new JwtService(SECRET).ttl).toBe(7200);
  });
  test("SYLLABAI_JWT_TTL override parses ISO durations", () => {
    expect(new JwtService(SECRET, "PT30M").ttl).toBe(1800);
    expect(new JwtService(SECRET, "PT90S").ttl).toBe(90);
    expect(new JwtService(SECRET, "PT1H30M").ttl).toBe(5400);
  });
  test("unsupported duration shapes refuse to start", () => {
    expect(() => new JwtService(SECRET, "2h")).toThrow();
    expect(() => new JwtService(SECRET, "P1D")).toThrow(); // Java accepts P1D; the core only ever configures PT* — refuse loudly instead of guessing
  });
});

describe("JwtService — issued token wire shape (jjwt 0.13 parity)", () => {
  test("header is exactly {alg:HS256} (no typ), claims carry sub/jti/uid/ver/roles/iat/exp in SECONDS", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = new JwtService(SECRET).issueAccessToken(USER);
    const [h, p] = token.split(".") as [string, string];
    if (!h || !p) throw new Error("malformed token under test");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "HS256" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const after = Math.floor(Date.now() / 1000);
    expect(claims.sub).toBe(USER.email);
    expect(claims.jti).toBe(USER.id);
    expect(claims.uid).toBe(USER.id);
    expect(claims.ver).toBe(3);
    expect(claims.roles).toEqual(["STUDENT"]);
    expect(claims.iat).toBeGreaterThanOrEqual(before);
    expect(claims.iat).toBeLessThanOrEqual(after);
    expect(claims.exp - claims.iat).toBe(7200);
  });

  test("signature is HMAC-SHA256 over header.payload with RAW secret bytes", () => {
    const token = new JwtService(SECRET).issueAccessToken(USER);
    const [h, p, s] = token.split(".");
    const expected = createHmac("sha256", Buffer.from(SECRET, "utf8"))
      .update(`${h}.${p}`)
      .digest("base64url");
    expect(s).toBe(expected);
  });
});

describe("JwtService — parse (jjwt parser semantics)", () => {
  const jwt = new JwtService(SECRET);

  test("round-trips its own tokens", () => {
    const info = jwt.parse(jwt.issueAccessToken(USER));
    expect(info.subject).toBe(USER.email);
    expect(info.userId).toBe(USER.id);
    expect(info.tokenVersion).toBe(3);
    expect(info.roles).toEqual(["STUDENT"]);
  });

  test("verifies a hand-built jjwt-style token (cross-implementation fixture)", () => {
    // Built WITHOUT this service: minimal jjwt-shaped token, independent HMAC.
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        sub: "bob@example.invalid",
        uid: "99999999-8888-4777-8666-555555555555",
        ver: 1,
        roles: ["TEACHER", "ADMIN"],
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", Buffer.from(SECRET, "utf8"))
      .update(`${header}.${payload}`)
      .digest("base64url");
    const info = jwt.parse(`${header}.${payload}.${sig}`);
    expect(info.subject).toBe("bob@example.invalid");
    expect(info.userId).toBe("99999999-8888-4777-8666-555555555555");
    expect(info.roles).toEqual(["TEACHER", "ADMIN"]);
    expect(info.tokenVersion).toBe(1);
  });

  test("absent ver claim parses as null (pre-V46 token, JwtService.java:74-75)", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({ sub: "x@example.invalid", uid: "99999999-8888-4777-8666-555555555555", iat: now, exp: now + 60 }),
    ).toString("base64url");
    const sig = createHmac("sha256", Buffer.from(SECRET, "utf8"))
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(jwt.parse(`${header}.${payload}.${sig}`).tokenVersion).toBeNull();
  });

  test("expired token rejected (jjwt ExpiredJwtException path)", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "x@y.z", uid: "99999999-8888-4777-8666-555555555555", iat: 1, exp: 2 }),
    ).toString("base64url");
    const sig = createHmac("sha256", Buffer.from(SECRET, "utf8"))
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(() => jwt.parse(`${header}.${payload}.${sig}`)).toThrow(JwtException);
  });

  test("signature mismatch, garbage, unknown role, bad uid all reject", () => {
    const token = jwt.issueAccessToken(USER);
    const [h, p, s] = token.split(".") as [string, string, string];
    const other = new JwtService("other-secret-0123456789abcdef0123456789abcdef");
    expect(() => other.parse(token)).toThrow(JwtException); // wrong key
    expect(() => jwt.parse(`${h}.${p}.${s.slice(0, -2)}aa`)).toThrow(JwtException);
    expect(() => jwt.parse("not.a.token")).toThrow(JwtException);
    expect(() => jwt.parse(`${h}.${Buffer.from("zzz").toString("base64url")}.${s}`)).toThrow(JwtException);

    const badRole = Buffer.from(
      JSON.stringify({ sub: "x@y.z", uid: USER.id, ver: 1, roles: ["SUPERADMIN"], iat: 1, exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString("base64url");
    const sig1 = createHmac("sha256", Buffer.from(SECRET, "utf8")).update(`${h}.${badRole}`).digest("base64url");
    expect(() => jwt.parse(`${h}.${badRole}.${sig1}`)).toThrow(JwtException);

    const badUid = Buffer.from(
      JSON.stringify({ sub: "x@y.z", uid: "not-a-uuid", ver: 1, roles: [], iat: 1, exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString("base64url");
    const sig2 = createHmac("sha256", Buffer.from(SECRET, "utf8")).update(`${h}.${badUid}`).digest("base64url");
    expect(() => jwt.parse(`${h}.${badUid}.${sig2}`)).toThrow(JwtException);
  });
});

describe("parseIsoDuration", () => {
  test("PT2H/PT30M/PT90S/PT1H30M", () => {
    expect(parseIsoDuration("PT2H")).toBe(7200);
    expect(parseIsoDuration("PT30M")).toBe(1800);
    expect(parseIsoDuration("PT90S")).toBe(90);
    expect(parseIsoDuration("PT1H30M")).toBe(5400);
  });
});
