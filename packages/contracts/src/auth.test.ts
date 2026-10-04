/**
 * Contract pins for the identity/auth port (T-MIG-001).
 *
 * These are UNIT-level accept/reject pins derived from the frozen Java
 * constraints (jakarta.validation + Hibernate Validator semantics) — they
 * are the schema's regression net. They do NOT replace golden-master
 * capture (GOLDEN_MASTER.md §2): live recorded cases remain the parity
 * gate; these pins make the contract boundary reviewable before capture.
 *
 * Rule under test: the accept/reject SET must equal the Java core's for
 * every payload class the DTOs constrain (index.ts rules 1–3).
 */
import { describe, expect, test } from "bun:test";
import {
  authResponseSchema,
  isJakartaEmail,
  loginRequestSchema,
  passwordChangeRequestSchema,
  registerRequestSchema,
  roleSchema,
  userViewSchema,
} from "./auth";

const OK = { email: "a@b.co", password: "longenough1x", displayName: "Ann" };

describe("RegisterRequest — email (@Email @NotBlank @Size(max=254))", () => {
  test("accepts a plain email", () => {
    expect(registerRequestSchema.safeParse({ ...OK }).success).toBe(true);
  });

  test("accepts 'a@b' — Hibernate @Email has NO TLD requirement", () => {
    expect(registerRequestSchema.safeParse({ ...OK, email: "a@b" }).success).toBe(true);
  });

  test("rejects 'not-an-email', '@b.co', 'a@', 'a@b.', 'a..b@c.co', 'a b@c.co'", () => {
    for (const email of ["not-an-email", "@b.co", "a@", "a@b.", "a..b@c.co", "a b@c.co"]) {
      expect(registerRequestSchema.safeParse({ ...OK, email }).success).toBe(false);
    }
  });

  test("rejects whitespace-only email (@NotBlank)", () => {
    expect(registerRequestSchema.safeParse({ ...OK, email: "  " }).success).toBe(false);
  });

  test("accepts 254-char email, rejects 255 (@Size counts the WHOLE address; caps chosen to isolate @Size)", () => {
    // 4 labels of 63/63/63/60 → domain 252, total 254: every OTHER cap satisfied.
    const domain254 = ["y".repeat(63), "y".repeat(63), "y".repeat(63), "y".repeat(60)].join(".");
    const email254 = `a@${domain254}`;
    expect(email254.length).toBe(254);
    expect(registerRequestSchema.safeParse({ ...OK, email: email254 }).success).toBe(true);
    // Same shape one char longer: 255 total → only @Size(max=254) is violated.
    const domain255 = ["y".repeat(63), "y".repeat(63), "y".repeat(63), "y".repeat(61)].join(".");
    const email255 = `a@${domain255}`;
    expect(email255.length).toBe(255);
    expect(registerRequestSchema.safeParse({ ...OK, email: email255 }).success).toBe(false);
  });

  test("rejects >64-char local part (Hibernate cap, independent of @Size(254))", () => {
    const local = "x".repeat(65);
    expect(isJakartaEmail(`${local}@b.co`)).toBe(false);
    expect(isJakartaEmail(`${"x".repeat(64)}@b.co`)).toBe(true);
  });

  test("accepts hyphenated labels, rejects label edge hyphens (Hibernate domain rule)", () => {
    expect(isJakartaEmail("a@my-domain.co")).toBe(true);
    expect(isJakartaEmail("a@-b.co")).toBe(false);
    expect(isJakartaEmail("a@b-.co")).toBe(false);
  });
});

describe("RegisterRequest — password (the ONE platform bar, R6)", () => {
  test("boundary exact: 11 reject / 12 accept / 100 accept / 101 reject", () => {
    const p = (n: number) => ("a".repeat(Math.max(0, n - 1)) + "1").slice(0, n);
    expect(registerRequestSchema.safeParse({ ...OK, password: p(11) }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...OK, password: p(12) }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...OK, password: p(100) }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...OK, password: p(101) }).success).toBe(false);
  });

  test("rejects no-letter (all digits) and no-digit (all letters) — \\p{L} and \\d patterns", () => {
    expect(registerRequestSchema.safeParse({ ...OK, password: "123456789012" }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...OK, password: "abcdefghijkl" }).success).toBe(false);
  });

  test("rejects missing password entirely", () => {
    expect(
      registerRequestSchema.safeParse({ email: "a@b.co", displayName: "Ann" }).success,
    ).toBe(false);
  });
});

describe("RegisterRequest — displayName (@NotBlank @Size(2,100))", () => {
  test("rejects '' and whitespace-only '  ' — @NotBlank is load-bearing over min(2)", () => {
    expect(registerRequestSchema.safeParse({ ...OK, displayName: "" }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...OK, displayName: "  " }).success).toBe(false);
  });

  test("accepts padded ' Ann ' (NotBlank only forbids BLANK), 1-char reject, 2/100 accept, 101 reject", () => {
    expect(registerRequestSchema.safeParse({ ...OK, displayName: " Ann " }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...OK, displayName: "A" }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...OK, displayName: "An" }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...OK, displayName: "x".repeat(100) }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...OK, displayName: "x".repeat(101) }).success).toBe(false);
  });
});

describe("RegisterRequest — role/joinCode (DTO is String; policy is T-MIG-010's service)", () => {
  test("legacy 3-field shape (no role/joinCode) still accepted (historical constructor)", () => {
    const r = registerRequestSchema.safeParse({ email: "a@b.co", password: "longenough1x", displayName: "Ann" });
    expect(r.success).toBe(true);
  });

  test("role: null / undefined / 'TEACHER' / even 'ADMIN' pass the DTO — service refuses ADMIN (AuthService.java:102)", () => {
    for (const role of [null, undefined, "TEACHER", "ADMIN"]) {
      const payload = { ...OK, role, joinCode: role === "TEACHER" ? "code123" : undefined };
      expect(registerRequestSchema.safeParse(payload).success).toBe(true);
    }
  });

  test("joinCode accepts null and string (record fields carry no annotations)", () => {
    expect(registerRequestSchema.safeParse({ ...OK, joinCode: null }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...OK, joinCode: "x" }).success).toBe(true);
  });
});

describe("RegisterRequest — unknown properties (Jackson/Spring Boot default parity)", () => {
  test("ACCEPTS an extra unknown key — core ignores unknown props (no FAIL_ON_UNKNOWN override)", () => {
    const parsed = registerRequestSchema.safeParse({ ...OK, bogus: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("bogus" in parsed.data).toBe(false); // stripped, not stored
  });

  test("accepts a JSON null joinCode AND a missing role (both bind to null in Java)", () => {
    expect(registerRequestSchema.safeParse({ ...OK, role: null, joinCode: null }).success).toBe(true);
  });
});

describe("LoginRequest (@Email @NotBlank email, @NotBlank password — no floor)", () => {
  test("accepts 1-char password — login has NO size floor (only register/rotate do)", () => {
    expect(loginRequestSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  test("rejects whitespace-only password (@NotBlank load-bearing here)", () => {
    expect(loginRequestSchema.safeParse({ email: "a@b.co", password: " " }).success).toBe(false);
  });

  test("rejects missing/null email and password", () => {
    expect(loginRequestSchema.safeParse({ password: "x" }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: null, password: "x" }).success).toBe(false);
  });

  test("login email has NO @Size(max=254) — a 257-char email (Hibernate caps maxed) is accepted here but REJECTED by register", () => {
    // 4 labels of 63 → domain 255 (Hibernate's own domain cap), local 1 → total 257.
    const longest = `a@${["y".repeat(63), "y".repeat(63), "y".repeat(63), "y".repeat(63)].join(".")}`;
    expect(longest.length).toBe(257);
    expect(loginRequestSchema.safeParse({ email: longest, password: "x" }).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...OK, email: longest }).success).toBe(false); // @Size(254) is register-only
  });
});

describe("PasswordChangeRequest (self-service rotation — current secret is the authorization)", () => {
  const CHANGE = { currentPassword: "old-password-1", newPassword: "new-password-2" };

  test("accepts a well-formed change", () => {
    expect(passwordChangeRequestSchema.safeParse(CHANGE).success).toBe(true);
  });

  test("currentPassword: @NotBlank only — NO size floor, 'x' accepted, ' ' rejected", () => {
    expect(passwordChangeRequestSchema.safeParse({ ...CHANGE, currentPassword: "x" }).success).toBe(true);
    expect(passwordChangeRequestSchema.safeParse({ ...CHANGE, currentPassword: " " }).success).toBe(false);
  });

  test("newPassword carries the SAME register floor (R6: no weak rotation path)", () => {
    expect(passwordChangeRequestSchema.safeParse({ ...CHANGE, newPassword: "short1x" }).success).toBe(false);
    expect(passwordChangeRequestSchema.safeParse({ ...CHANGE, newPassword: "nonewdigits" }).success).toBe(false);
    expect(passwordChangeRequestSchema.safeParse({ ...CHANGE, newPassword: "123456789012" }).success).toBe(false);
  });
});

describe("Role enum (Role.java — exactly three names, case-sensitive like valueOf)", () => {
  test("accepts STUDENT/TEACHER/ADMIN only", () => {
    for (const r of ["STUDENT", "TEACHER", "ADMIN"]) expect(roleSchema.safeParse(r).success).toBe(true);
    for (const r of ["student", "Teacher", "GUEST", ""]) expect(roleSchema.safeParse(r).success).toBe(false);
  });
});

describe("UserView / AuthResponse (response shapes, AuthService.java:84/139, BootstrapAdminService:127)", () => {
  const view = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "a@b.co",
    displayName: "Ann",
    roles: ["STUDENT"],
  };

  test("UserView accepts Role-name arrays", () => {
    expect(userViewSchema.safeParse(view).success).toBe(true);
    expect(userViewSchema.safeParse({ ...view, roles: ["TEACHER", "ADMIN"] }).success).toBe(true);
  });

  test("UserView.roles rejects non-enum names (Set<Role> by construction)", () => {
    expect(userViewSchema.safeParse({ ...view, roles: ["student"] }).success).toBe(false);
    expect(userViewSchema.safeParse({ ...view, roles: ["MODERATOR"] }).success).toBe(false);
  });

  test("AuthResponse: tokenType is ALWAYS 'Bearer' (compact constructor), anything else rejected", () => {
    expect(authResponseSchema.safeParse({ accessToken: "jwt", tokenType: "Bearer", user: view }).success).toBe(true);
    expect(authResponseSchema.safeParse({ accessToken: "jwt", tokenType: "bearer", user: view }).success).toBe(false);
  });
});
