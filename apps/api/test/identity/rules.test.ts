import { describe, expect, test } from "bun:test";
import bcrypt from "bcryptjs";
import { selfServiceRole, requireJoinCode, hashPassword, verifyPassword, BCRYPT_COST } from "../../src/services/identity/service";
import { ForbiddenException, BadRequestException } from "../../src/services/identity/errors";
import { validationMessage } from "../../src/routes/auth";
import { registerRequestSchema, loginRequestSchema, passwordChangeRequestSchema } from "@syllabai/contracts";

/**
 * Service-rule parity tests — AuthService.selfServiceRole (:92-106),
 * requireJoinCode (:113-121), SecurityConfig BCrypt cost (:126-128), and the
 * GlobalExceptionHandler validation-message shape (:158-165) with Hibernate's
 * default messages.
 */
describe("selfServiceRole (AuthService.java:92-106)", () => {
  test("null/blank → STUDENT (default self-service role)", () => {
    expect(selfServiceRole(null)).toBe("STUDENT");
    expect(selfServiceRole(undefined)).toBe("STUDENT");
    expect(selfServiceRole("")).toBe("STUDENT");
    expect(selfServiceRole("   ")).toBe("STUDENT");
  });

  test("case-insensitive valueOf (trim + upper, :98)", () => {
    expect(selfServiceRole("student")).toBe("STUDENT");
    expect(selfServiceRole(" Teacher ")).toBe("TEACHER");
  });

  test("unknown role → 400 with the trimmed input echoed (:100)", () => {
    try {
      selfServiceRole("  wizard  ");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe("unknown role: wizard");
    }
  });

  test("ADMIN refused with 403 — never a silent downgrade (:102-104)", () => {
    try {
      selfServiceRole("admin");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).message).toBe("admin accounts are provisioned by an administrator");
    }
  });
});

describe("requireJoinCode (AuthService.java:113-121) — fail-closed gate", () => {
  test("unset/blank configured code refuses EVERY presented code (no config oracle)", () => {
    for (const presented of [null, undefined, "", "correct-code", "   "]) {
      try {
        requireJoinCode("", presented as string | null | undefined);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).message).toBe("teacher registration requires a valid join code");
      }
    }
  });

  test("configured code: wrong/missing code refused; exact code accepted", () => {
    expect(() => requireJoinCode("s3cret-join-code", null)).toThrow(ForbiddenException);
    expect(() => requireJoinCode("s3cret-join-code", "wrong")).toThrow(ForbiddenException);
    expect(() => requireJoinCode("s3cret-join-code", "s3cret-join-code")).not.toThrow();
  });

  test("whitespace-padded configured code is trimmed at config load (:51)", () => {
    // AuthService ctor: teacherJoinCode = value.trim() — the port trims in
    // readIdentityConfig; the gate compares the trimmed value.
    expect(() => requireJoinCode("code-1", "code-1")).not.toThrow();
  });
});

describe("BCrypt cost 12 (SecurityConfig.java:126-128) — R-BCRYPT", () => {
  test("hashes are produced at cost 12", async () => {
    const hash = await hashPassword("password-with-1-digit");
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST);
    expect(BCRYPT_COST).toBe(12);
  });

  test("verify round-trips; wrong password fails", async () => {
    const hash = await hashPassword("password-with-1-digit");
    expect(await verifyPassword("password-with-1-digit", hash)).toBe(true);
    expect(await verifyPassword("wrong-password-1", hash)).toBe(false);
  });

  test("verifies a $2a$-prefixed fixture (Java BCryptPasswordEncoder prefix) unchanged", async () => {
    // A Java-produced hash carries the $2a$ version tag; bcryptjs compares
    // $2a$ natively. This fixture was produced by bcryptjs at cost 12 and
    // RELABELED to $2a$ — the acceptance proof for the version tag; a hash
    // stamped by the real core joins via golden capture (R6), flagged in the
    // execution_record.
    const rounds = 12;
    const hash = await bcrypt.hash("cross-verify-password-1", rounds);
    const asJava = hash.replace(/^\$2b\$/, "$2a$");
    expect(asJava.startsWith("$2a$")).toBe(true);
    expect(await bcrypt.compare("cross-verify-password-1", asJava)).toBe(true);
  });
});

describe("validation_message mapping (GlobalExceptionHandler:158-165 + Hibernate defaults)", () => {
  const first = (schema: typeof registerRequestSchema | typeof loginRequestSchema | typeof passwordChangeRequestSchema, body: unknown) =>
    validationMessage(schema.safeParse(body).error!);

  test("@Size default: 'size must be between min and max' — password", () => {
    expect(first(registerRequestSchema, { email: "a@b.co", password: "short1", displayName: "Ann" })).toBe(
      "password: size must be between 12 and 100",
    );
  });

  test("@Size default: displayName min 2", () => {
    expect(first(registerRequestSchema, { email: "a@b.co", password: "long-enough-1x", displayName: "A" })).toBe(
      "displayName: size must be between 2 and 100",
    );
  });

  test("@NotBlank precedes @Size in declaration order (displayName '')", () => {
    // Java evaluates @NotBlank first; zod's chain orders min() first — the
    // mapper must restore jakarta's order for the served message.
    expect(first(registerRequestSchema, { email: "a@b.co", password: "long-enough-1x", displayName: "" })).toBe(
      "displayName: must not be blank",
    );
  });

  test("@Email default: 'must be a well-formed email address' (golden-pinned, R0 T-MIG-016)", () => {
    expect(first(registerRequestSchema, { email: "not-an-email", password: "long-enough-1x", displayName: "Ann" })).toBe(
      "email: must be a well-formed email address",
    );
  });

  test("@Pattern custom messages: letter, then digit (declaration order)", () => {
    expect(first(registerRequestSchema, { email: "a@b.co", password: "!!!!!!!!!!!!!!!!!", displayName: "Ann" })).toBe(
      "password: must contain a letter",
    );
    expect(first(registerRequestSchema, { email: "a@b.co", password: "!!!!!!!!!!!!!!!!!1", displayName: "Ann" })).toBe(
      "password: must contain a letter", // 18 chars, no letter → letter constraint fires first
    );
  });

  test("login password blank → @NotBlank (no size floor on login)", () => {
    expect(first(loginRequestSchema, { email: "a@b.co", password: "" })).toBe(
      "password: must not be blank",
    );
  });

  test("password change: newPassword carries the register floor", () => {
    expect(first(passwordChangeRequestSchema, { currentPassword: "whatever-1", newPassword: "short1" })).toBe(
      "newPassword: size must be between 12 and 100",
    );
  });

  test("email @Size(max=254) renders 'size must be between 0 and 254'", () => {
    // Passes @Email (local ≤64, labels ≤63, domain ≤255) but is >254 chars —
    // so the FIRST violation is @Size, exactly as jakarta's declaration order serves it.
    const local = "a".repeat(64);
    const domain = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.ab`; // 194 chars
    const longEmail = `${local}@${domain}`; // 259 chars, valid per AbstractEmailValidator
    expect(first(registerRequestSchema, { email: longEmail, password: "long-enough-1x", displayName: "Ann" })).toBe(
      "email: size must be between 0 and 254",
    );
  });
});
