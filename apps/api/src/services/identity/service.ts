/**
 * AuthService port — constraint-for-constraint from the frozen
 * com/syllabai/identity/AuthService.java (source line refs preserved).
 *
 * Behaviour parity obligations (each verified by tests in test/identity/):
 *   register:
 *     - duplicate email (case-insensitive) → 409 "email already registered" (:68)
 *     - role resolution: null/blank → STUDENT; case-insensitive valueOf
 *       (trim+upper, :98); unknown → 400 "unknown role: <trimmed>" (:100);
 *       ADMIN → 403 "admin accounts are provisioned by an administrator" (:103)
 *     - TEACHER requires the join code; gate FAILS CLOSED — blank/absent
 *       configured code refuses everything with the SAME 403 a wrong code
 *       gets (:113-121); comparison constant-time (timingSafeEqual)
 *     - email stored LOWERCASED (:75); BCrypt cost 12 (SecurityConfig.java:127)
 *   login:
 *     - budget check BEFORE any bcrypt work (:129) — per TARGET account
 *     - unknown user / disabled / wrong password are the SAME 401, and the
 *       failure is recorded either way (:132-137); success clears history (:138)
 *   me: unknown → 404 NotFoundException("user", email) (:146)
 *   changePassword: unknown → 404; disabled/wrong current → 401 BadCredentials
 *     (no echo); rotate bumps token_version (R1) — every pre-rotation token
 *     dies at its next request (AuthService.java:157-160)
 *
 * The AUDIT log lines (register-as-teacher, password rotation) are kept as
 * structured console logs with the same "AUDIT:" prefix.
 */
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { UsersRepository, UserRow } from "./users";
import type { Role } from "./jwt";
import {
  BadCredentialsException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "./errors";
import type { IdentityServices } from "./config";

/** SecurityConfig.java:127 — BCryptPasswordEncoder(12). R-BCRYPT parity. */
export const BCRYPT_COST = 12;

export function hashPassword(raw: string): Promise<string> {
  return bcrypt.hash(raw, BCRYPT_COST);
}

export async function verifyPassword(raw: string, hash: string): Promise<boolean> {
  // Java's encoder.matches handles null hash gracefully; bcryptjs needs a
  // string — an empty hash simply never matches (fail-closed).
  if (!hash) return false;
  return bcrypt.compare(raw, hash);
}

/** MessageDigest.isEqual port — constant-time byte comparison. */
function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // MessageDigest.isEqual leaks only length; the join-code gate refuses
    // everything below anyway, and every failure path returns the same 403,
    // so the length signal is unobservable to the client.
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** AuthService.selfServiceRole (:92-106). */
export function selfServiceRole(requested: string | null | undefined): Role {
  if (requested === null || requested === undefined || requested.trim() === "") {
    return "STUDENT";
  }
  const upper = requested.trim().toUpperCase();
  if (upper !== "STUDENT" && upper !== "TEACHER" && upper !== "ADMIN") {
    throw new BadRequestException(`unknown role: ${requested.trim()}`);
  }
  const role: Role = upper;
  if (role === "ADMIN") {
    throw new ForbiddenException("admin accounts are provisioned by an administrator");
  }
  return role;
}

/** AuthService.requireJoinCode (:113-121) — fail-closed, constant-time. */
export function requireJoinCode(configured: string, presented: string | null | undefined): void {
  if (
    configured.trim() === "" ||
    presented === null ||
    presented === undefined ||
    !constantTimeEqual(configured, presented)
  ) {
    throw new ForbiddenException("teacher registration requires a valid join code");
  }
}

export interface AuthResponseShape {
  accessToken: string;
  tokenType: "Bearer";
  user: { id: string; email: string; displayName: string; roles: Role[] };
}

export function toUserView(user: UserRow): AuthResponseShape["user"] {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles as Role[],
  };
}

export function toAuthResponse(user: UserRow, accessToken: string): AuthResponseShape {
  return { accessToken, tokenType: "Bearer", user: toUserView(user) };
}

export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly identity: IdentityServices,
  ) {}

  /** AuthService.register (:65-85). Throws the mapped domain errors. */
  async register(request: {
    email: string;
    password: string;
    displayName: string;
    role?: string | null;
    joinCode?: string | null;
  }): Promise<AuthResponseShape> {
    if (await this.users.existsByEmailIgnoreCase(request.email)) {
      throw new ConflictException("email already registered");
    }
    const role = selfServiceRole(request.role);
    if (role === "TEACHER") {
      requireJoinCode(this.identity.config.teacherJoinCode, request.joinCode);
    }
    const email = request.email.toLowerCase();
    const passwordHash = await hashPassword(request.password);
    const user = await this.users.insertUser({
      email,
      passwordHash,
      displayName: request.displayName,
      roles: [role],
      id: crypto.randomUUID(),
      createdAt: new Date(),
    });
    if (role === "TEACHER") {
      console.log(`AUDIT: teacher self-registered via join code (${email})`);
    }
    return toAuthResponse(user, this.identity.jwt.issueAccessToken(user));
  }

  /** AuthService.login (:123-140). */
  async login(request: { email: string; password: string }): Promise<AuthResponseShape> {
    // per-TARGET-account budget — BEFORE any bcrypt work (R5).
    this.identity.budget.checkAllowed(request.email);
    const user = await this.users.findByEmailIgnoreCase(request.email);
    if (
      user === null ||
      !user.enabled ||
      !(await verifyPassword(request.password, user.passwordHash))
    ) {
      this.identity.budget.recordFailure(request.email);
      throw new BadCredentialsException();
    }
    this.identity.budget.recordSuccess(request.email);
    return toAuthResponse(user, this.identity.jwt.issueAccessToken(user));
  }

  /** AuthService.me (:142-147). */
  async me(email: string): Promise<AuthResponseShape["user"]> {
    const user = await this.users.findByEmailIgnoreCase(email);
    if (user === null) throw new NotFoundException("user", email);
    return toUserView(user);
  }

  /** AuthService.changePassword (:161-172). */
  async changePassword(
    email: string,
    request: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const user = await this.users.findByEmailIgnoreCase(email);
    if (user === null) throw new NotFoundException("user", email);
    if (!user.enabled || !(await verifyPassword(request.currentPassword, user.passwordHash))) {
      throw new BadCredentialsException();
    }
    const newHash = await hashPassword(request.newPassword);
    await this.users.rotatePasswordHash(email, newHash);
    console.log(`AUDIT: password rotated (self-service) for ${email}`);
  }
}
