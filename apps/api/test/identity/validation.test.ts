/**
 * Jackson/jakarta boundary pins — the validation-failure bodies golden
 * capture will replay. Frozen spec: dto constraint declaration order +
 * GlobalExceptionHandler.invalid() (400 validation_failed,
 * "<field>: <defaultMessage>", FIRST field error) + Hibernate's @Email
 * null/"" short-circuit. T-MIG-001 residuals honored (never widened).
 */
import { describe, expect, test } from "bun:test";
import {
  validateLogin,
  validatePasswordChange,
  validateRegister,
} from "../../src/services/identity/validation";

const GOOD_PASSWORD = "longenough1x";

describe("register boundary (RegisterRequest.java order: email, password, displayName, role, joinCode)", () => {
  test("blank email → @NotBlank (Hibernate @Email passes null/'' — short-circuit)", () => {
    const r = validateRegister({ email: "", password: GOOD_PASSWORD, displayName: "Ann" });
    expect(r.ok).toBe(false);
    expect(r.field).toBe("email");
    expect(r.message).toBe("must not be blank");
  });

  test("whitespace email → @Email fires first (declaration order)", () => {
    const r = validateRegister({ email: "  ", password: GOOD_PASSWORD, displayName: "Ann" });
    expect(r.field).toBe("email");
    expect(r.message).toBe("must be a valid email");
  });

  test("'a@b' is VALID (Hibernate semantics — T-MIG-001 F3)", () => {
    const r = validateRegister({ email: "a@b", password: GOOD_PASSWORD, displayName: "Ann" });
    expect(r.ok).toBe(true);
    expect(r.data?.email).toBe("a@b");
  });

  test("number email coerced like Jackson scalar→String, then @Email rejects", () => {
    const r = validateRegister({ email: 12345, password: GOOD_PASSWORD, displayName: "Ann" });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("must be a valid email");
  });

  test("255-char structurally-valid email → @Size(max=254) jakarta text", () => {
    // programmatic construction: every label ≤63, local ≤64, domain ≤255 —
    // @Email must PASS so @Size(max=254) is the firing constraint
    const local = "a".repeat(62);
    const domain = ["b".repeat(63), "c".repeat(63), "d".repeat(32), "e".repeat(31)].join(".");
    const email = `${local}@${domain}`;
    expect(email.length).toBe(255);
    const r = validateRegister({ email, password: GOOD_PASSWORD, displayName: "Ann" });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("size must be between 0 and 254");
  });

  test("257-char email: login ACCEPTS (no @Size), register REJECTS — T-MIG-001 pin", () => {
    const local = "a".repeat(62);
    const domain = ["b".repeat(63), "c".repeat(63), "d".repeat(63), "ef"].join(".");
    const email = `${local}@${domain}`; // 257 chars, structurally valid
    expect(email.length).toBe(257);
    const reg = validateRegister({ email, password: GOOD_PASSWORD, displayName: "Ann" });
    expect(reg.ok).toBe(false);
    const log = validateLogin({ email, password: "whatever-nonblank" });
    expect(log.ok).toBe(true);
  });

  test("short password → @Size(12,100) jakarta text", () => {
    const r = validateRegister({ email: "a@b", password: "ab1", displayName: "Ann" });
    expect(r.field).toBe("password");
    expect(r.message).toBe("size must be between 12 and 100");
  });

  test("blank password → @NotBlank first (declaration order)", () => {
    const r = validateRegister({ email: "a@b", password: "   ", displayName: "Ann" });
    expect(r.message).toBe("must not be blank");
  });

  test("no-letter password → first @Pattern message", () => {
    const r = validateRegister({ email: "a@b", password: "123456789012", displayName: "Ann" });
    expect(r.message).toBe("must contain a letter");
  });

  test("no-digit password → second @Pattern message", () => {
    const r = validateRegister({ email: "a@b", password: "abcdefghijkl", displayName: "Ann" });
    expect(r.message).toBe("must contain a digit");
  });

  test("1-char displayName → @Size(2,100) jakarta text", () => {
    const r = validateRegister({ email: "a@b", password: GOOD_PASSWORD, displayName: "A" });
    expect(r.field).toBe("displayName");
    expect(r.message).toBe("size must be between 2 and 100");
  });

  test("padded displayName ' Ann ' is VALID (T-MIG-001 F2 pin)", () => {
    const r = validateRegister({ email: "a@b", password: GOOD_PASSWORD, displayName: " Ann " });
    expect(r.ok).toBe(true);
    expect(r.data?.displayName).toBe(" Ann "); // register stores UNTRIMMED
  });

  test("first field error wins: bad email AND bad password → email reported", () => {
    const r = validateRegister({ email: "nope", password: "short", displayName: "" });
    expect(r.field).toBe("email");
  });

  test("unknown role passes the DTO (service policy — F5 boundary)", () => {
    const r = validateRegister({
      email: "a@b",
      password: GOOD_PASSWORD,
      displayName: "Ann",
      role: "HYDRA",
    });
    expect(r.ok).toBe(true);
    expect(r.data?.role).toBe("HYDRA");
  });

  test("object-valued email → unreadable body (Jackson MismatchedInput parity)", () => {
    expect(() => validateRegister({ email: { a: 1 }, password: GOOD_PASSWORD, displayName: "Ann" })).toThrow();
  });

  test("non-object body (array) → malformed body", () => {
    expect(() => validateRegister(["nope"])).toThrow();
  });
});

describe("login boundary (LoginRequest.java: @Email @NotBlank email, @NotBlank password — NO floor)", () => {
  test("blank password rejected with jakarta text; any non-blank accepted", () => {
    expect(validateLogin({ email: "a@b", password: "" }).message).toBe("must not be blank");
    expect(validateLogin({ email: "a@b", password: "x" }).ok).toBe(true);
  });

  test("missing fields behave like nulls (Jackson record binding)", () => {
    const r = validateLogin({});
    expect(r.ok).toBe(false);
    expect(r.field).toBe("email");
    expect(r.message).toBe("must not be blank");
  });
});

describe("password-change boundary (PasswordChangeRequest.java)", () => {
  test("currentPassword has NO size bounds — @NotBlank only", () => {
    const r = validatePasswordChange({ currentPassword: "x", newPassword: GOOD_PASSWORD });
    expect(r.ok).toBe(true);
  });

  test("newPassword carries the register floor", () => {
    const r = validatePasswordChange({ currentPassword: "whatever", newPassword: "short1" });
    expect(r.field).toBe("newPassword");
    expect(r.message).toBe("size must be between 12 and 100");
  });
});
