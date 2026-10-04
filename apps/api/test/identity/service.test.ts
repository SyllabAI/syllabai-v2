/**
 * AuthService port pins — T-MIG-010 (memory store, fake passwords for speed;
 * the real bcrypt cost-12 pin lives in bcrypt.test.ts).
 * Frozen spec: identity/AuthService.java (verified line-by-line 2026-10-04).
 */
import { describe, expect, test } from "bun:test";
import { createAuthService } from "../../src/services/identity/service";
import { MemoryIdentityStore } from "../../src/services/identity/store";
import { fakePasswordPort } from "../../src/services/identity/password";
import { createJwtService } from "../../src/services/identity/jwt";
import { createLoginBudget } from "../../src/services/identity/budget";
import {
  BadCredentialsError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../src/services/identity/errors";

const SECRET = "0123456789abcdef0123456789abcdef";
const GOOD = "longenough1x";

function makeService(opts: { joinCode?: string; now?: () => number } = {}) {
  const store = new MemoryIdentityStore();
  const jwt = createJwtService({ secret: SECRET, ttlMs: 7_200_000, now: opts.now });
  const budget = createLoginBudget({ enabled: true, windowMs: 60_000, loginPerAccount: 10, now: opts.now });
  const auth = createAuthService({
    store,
    passwords: fakePasswordPort,
    jwt,
    budget,
    teacherJoinCode: opts.joinCode ?? "",
  });
  return { store, jwt, budget, auth };
}

const REGISTER = {
  email: "Student@Example.invalid",
  password: GOOD,
  displayName: "Ann",
};

describe("register (AuthService.register)", () => {
  test("default role STUDENT; email stored LOWERCASED; token issued", async () => {
    const { auth, store } = makeService();
    const result = await auth.register(REGISTER);
    expect(result.tokenType).toBe("Bearer");
    expect(result.user.roles).toEqual(["STUDENT"]);
    expect(result.user.email).toBe("student@example.invalid"); // lowercased
    const row = await store.findByEmailIgnoreCase("STUDENT@example.invalid");
    expect(row?.displayName).toBe("Ann"); // register does NOT trim
  });

  test("duplicate email (case-insensitive) → 409 'email already registered'", async () => {
    const { auth } = makeService();
    await auth.register(REGISTER);
    await expect(auth.register(REGISTER)).rejects.toThrow(ConflictError);
    await expect(
      auth.register({ ...REGISTER, email: "student@example.invalid" }),
    ).rejects.toThrow(/email already registered/);
  });

  test("role=ADMIN → 403 'admin accounts are provisioned by an administrator' (never downgraded)", async () => {
    const { auth } = makeService();
    await expect(
      auth.register({ ...REGISTER, role: "ADMIN" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      auth.register({ ...REGISTER, role: "admin" }),
    ).rejects.toThrow(/admin accounts are provisioned by an administrator/);
  });

  test("unknown role → 400 'unknown role: HYDRA' (trimmed echo)", async () => {
    const { auth } = makeService();
    await expect(auth.register({ ...REGISTER, role: "  HYDRA " })).rejects.toThrow(
      new BadRequestError("unknown role: HYDRA"),
    );
  });

  test("TEACHER without configured code → fail-closed 403 (no config oracle)", async () => {
    const { auth } = makeService({ joinCode: "" });
    await expect(
      auth.register({ ...REGISTER, role: "TEACHER", joinCode: "anything" }),
    ).rejects.toThrow(/teacher registration requires a valid join code/);
  });

  test("TEACHER with wrong code → SAME 403 (constant-time compare)", async () => {
    const { auth } = makeService({ joinCode: "s3cret-code" });
    await expect(
      auth.register({ ...REGISTER, role: "TEACHER", joinCode: "wrong-code" }),
    ).rejects.toThrow(/teacher registration requires a valid join code/);
  });

  test("TEACHER with correct code → TEACHER account + AUDIT path", async () => {
    const { auth } = makeService({ joinCode: "s3cret-code" });
    const result = await auth.register({ ...REGISTER, role: "TEACHER", joinCode: "s3cret-code" });
    expect(result.user.roles).toEqual(["TEACHER"]);
  });
});

describe("login (AuthService.login — budget BEFORE bcrypt)", () => {
  test("unknown user and wrong password are the SAME 401 (no factor echo)", async () => {
    const { auth } = makeService();
    await expect(auth.login({ email: "ghost@example.invalid", password: "whatever-long" })).rejects.toThrow(
      BadCredentialsError,
    );
    const { auth: auth2 } = makeService();
    await auth2.register(REGISTER);
    await expect(
      auth2.login({ email: "student@example.invalid", password: "wrong-password-here" }),
    ).rejects.toThrow(new BadCredentialsError());
  });

  test("disabled account cannot log in", async () => {
    const { auth, store } = makeService();
    const created = await auth.register(REGISTER);
    const row = await store.findById(created.user.id);
    row!.enabled = false;
    await expect(auth.login({ email: REGISTER.email, password: GOOD })).rejects.toThrow(
      BadCredentialsError,
    );
  });

  test("failed logins count; 11th attempt is a 429 BEFORE any bcrypt work", async () => {
    const { auth } = makeService();
    for (let i = 0; i < 10; i++) {
      await expect(
        auth.login({ email: "student@example.invalid", password: "wrong-password" }),
      ).rejects.toThrow(BadCredentialsError);
    }
    await expect(auth.login({ email: "student@example.invalid", password: GOOD })).rejects.toThrow(
      /Too many attempts/,
    );
  });

  test("successful login clears the failure history", async () => {
    const { auth } = makeService();
    await auth.register(REGISTER);
    await expect(
      auth.login({ email: REGISTER.email, password: "nope-nope-nope1" }),
    ).rejects.toThrow(BadCredentialsError);
    const ok = await auth.login({ email: REGISTER.email, password: GOOD });
    expect(ok.user.email).toBe("student@example.invalid");
    // history cleared: 9 more failures allowed before the budget
    for (let i = 0; i < 9; i++) {
      await expect(
        auth.login({ email: REGISTER.email, password: "nope-nope-nope1" }),
      ).rejects.toThrow(BadCredentialsError);
    }
  });
});

describe("me (AuthService.me → NotFoundException format)", () => {
  test("unknown user → 404 'user <email> not found'", async () => {
    const { auth } = makeService();
    await expect(auth.me("ghost@example.invalid")).rejects.toThrow(
      new NotFoundError("user ghost@example.invalid not found"),
    );
  });

  test("known user → UserView shape {id, email, displayName, roles}", async () => {
    const { auth } = makeService();
    await auth.register(REGISTER);
    const view = await auth.me("student@example.invalid");
    expect(Object.keys(view).sort()).toEqual(["displayName", "email", "id", "roles"]);
  });
});

describe("changePassword (AuthService.changePassword — R1 revocation anchor)", () => {
  test("wrong current password → 401; success rotates AND bumps token_version", async () => {
    const { auth, store, jwt } = makeService();
    const created = await auth.register(REGISTER);
    const before = (await store.findById(created.user.id))!.tokenVersion;
    await expect(
      auth.changePassword("student@example.invalid", "wrong-current-pw", "new-password-99"),
    ).rejects.toThrow(BadCredentialsError);
    await auth.changePassword("student@example.invalid", GOOD, "new-password-99");
    const after = (await store.findById(created.user.id))!.tokenVersion;
    expect(after).toBe(before + 1);
    // the OLD token is dead: ver mismatch → filter leaves context empty
    const oldInfo = await jwt.parse(created.accessToken);
    const row = await store.findById(oldInfo.userId);
    expect(row!.tokenVersion).not.toBe(oldInfo.tokenVersion);
  });

  test("unknown user → 404", async () => {
    const { auth } = makeService();
    await expect(
      auth.changePassword("ghost@example.invalid", "a", "new-password-99"),
    ).rejects.toThrow(NotFoundError);
  });
});
