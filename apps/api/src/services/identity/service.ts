/**
 * AuthService port — register / login / me / changePassword.
 * Frozen source: identity/AuthService.java (verified 2026-10-04, T-MIG-010).
 *
 * Parity-critical semantics (each maps to a golden-able boundary):
 *   - register: 409 "email already registered" on existsByEmailIgnoreCase;
 *     role resolution (null/blank → STUDENT; trim+upper valueOf; unknown →
 *     400 "unknown role: <trimmed>"; ADMIN → 403 "admin accounts are
 *     provisioned by an administrator" — never a silent downgrade);
 *     TEACHER requires the join code, fail-closed (blank configured code
 *     refuses everything with the SAME 403 as a wrong code — no config
 *     oracle), constant-time compare (MessageDigest.isEqual analog);
 *     stored email is LOWERCASED (UserView.email reflects that); displayName
 *     stored UNTRIMMED on register (bootstrap trims — verified asymmetry).
 *   - login: per-account budget checked BEFORE any bcrypt work; unknown
 *     user, disabled account, wrong password all → recordFailure + the ONE
 *     401 BadCredentials body (no echo of which factor failed); success
 *     clears the budget and issues a token.
 *   - me: 404 "<resource> <id> not found" (NotFoundException format).
 *   - changePassword: current password authorizes (a bearer token alone
 *     cannot take over the account); wrong current/disabled → 401
 *     invalid_credentials; success rotates hash AND bumps token_version
 *     (R1: every previously issued token dies at its next request).
 */

import {
  BadCredentialsError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "./errors";
import type { JwtPort } from "./jwt";
import type { IdentityStore } from "./store";
import type { PasswordPort } from "./password";
import type { LoginBudgetPort } from "./budget";
import type { UserView } from "@syllabai/contracts";

const ROLE_NAMES = ["STUDENT", "TEACHER", "ADMIN"] as const;

/** constant-time comparison analog of MessageDigest.isEqual */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // same shape as MessageDigest.isEqual: length mismatch → still burn a
    // comparison over a fixed span so the negative path is not obvious
    Buffer.from("0".repeat(ab.length));
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export interface AuthServiceDeps {
  store: IdentityStore;
  passwords: PasswordPort;
  jwt: JwtPort;
  budget: LoginBudgetPort;
  /** trimmed configured teacher join code; "" = gate closed */
  teacherJoinCode: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  role?: string | null;
  joinCode?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** mirrors AuthResponse.java — tokenType is ALWAYS "Bearer" (compact ctor) */
export interface AuthResult {
  accessToken: string;
  tokenType: "Bearer";
  user: UserView;
}

function toView(row: { id: string; email: string; displayName: string; roles: readonly string[] }): UserView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    roles: [...row.roles] as UserView["roles"],
  };
}

export function createAuthService(deps: AuthServiceDeps) {
  const { store, passwords, jwt, budget, teacherJoinCode } = deps;

  /** AuthService.selfServiceRole — verbatim semantics. */
  async function selfServiceRole(requested: string | null | undefined): Promise<"STUDENT" | "TEACHER"> {
    if (requested === null || requested === undefined || requested.trim() === "") {
      return "STUDENT";
    }
    const candidate = requested.trim().toUpperCase();
    if (!(ROLE_NAMES as readonly string[]).includes(candidate)) {
      throw new BadRequestError(`unknown role: ${requested.trim()}`);
    }
    if (candidate === "ADMIN") {
      throw new ForbiddenError("admin accounts are provisioned by an administrator");
    }
    return candidate as "STUDENT" | "TEACHER";
  }

  /** AuthService.requireJoinCode — fail-closed, constant-time, one 403 shape. */
  function requireJoinCode(presented: string | null | undefined): void {
    if (
      teacherJoinCode === "" ||
      presented === null ||
      presented === undefined ||
      !constantTimeEqual(teacherJoinCode, presented)
    ) {
      throw new ForbiddenError("teacher registration requires a valid join code");
    }
  }

  return {
    /** returns the created row + issued token (201 response is the route's job) */
    async register(request: RegisterInput): Promise<AuthResult> {
      if (await store.existsByEmailIgnoreCase(request.email)) {
        throw new ConflictError("email already registered");
      }
      const role = await selfServiceRole(request.role);
      if (role === "TEACHER") {
        requireJoinCode(request.joinCode);
      }
      const id = crypto.randomUUID();
      const hash = await passwords.hash(request.password);
      const row = await store.createUser({
        id,
        email: request.email.toLowerCase(),
        passwordHash: hash,
        displayName: request.displayName,
        roles: [role],
      });
      const token = await jwt.issueAccessToken({
        id: row.id,
        email: row.email,
        tokenVersion: row.tokenVersion,
        roles: row.roles,
      });
      return { accessToken: token, tokenType: "Bearer", user: toView(row) };
    },

    async login(request: LoginInput): Promise<AuthResult> {
      // per-TARGET-account budget (R5) — BEFORE any bcrypt work
      budget.checkAllowed(request.email);
      const user = await store.findByEmailIgnoreCase(request.email);
      if (user === null || !user.enabled) {
        budget.recordFailure(request.email);
        throw new BadCredentialsError();
      }
      const ok = await passwords.verify(request.password, user.passwordHash);
      if (!ok) {
        budget.recordFailure(request.email);
        throw new BadCredentialsError();
      }
      budget.recordSuccess(request.email);
      const token = await jwt.issueAccessToken({
        id: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
        roles: user.roles,
      });
      return { accessToken: token, tokenType: "Bearer", user: toView(user) };
    },

    async me(email: string): Promise<UserView> {
      const user = await store.findByEmailIgnoreCase(email);
      if (user === null) {
        throw NotFoundError.forResource("user", email);
      }
      return toView(user);
    },

    async changePassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
      const user = await store.findByEmailIgnoreCase(email);
      if (user === null) {
        throw NotFoundError.forResource("user", email);
      }
      if (!user.enabled || !(await passwords.verify(currentPassword, user.passwordHash))) {
        throw new BadCredentialsError();
      }
      const newHash = await passwords.hash(newPassword);
      await store.rotatePasswordHash(user.id, newHash);
      // Java logs "AUDIT: password rotated (self-service) for <email>"
      console.info(`AUDIT: password rotated (self-service) for ${email}`);
    },

    /** BootstrapAdminService.provisionUser — admin-side provisioning. */
    async provisionUser(
      email: string,
      rawPassword: string,
      displayName: string,
      roles: readonly string[],
    ): Promise<UserRowLike> {
      if (await store.existsByEmailIgnoreCase(email)) {
        throw new ConflictError("email already registered");
      }
      const hash = await passwords.hash(rawPassword);
      return store.createUser({
        id: crypto.randomUUID(),
        email: email.toLowerCase(),
        passwordHash: hash,
        displayName,
        roles,
      });
    },

    /** exposed for the JWT revocation check middleware (filter port) */
    jwt,
    budget,
    store,
  };
}

export interface UserRowLike {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  tokenVersion: number;
}

// RateLimitError is exported here so routes can narrow on it explicitly.
export { RateLimitError };
