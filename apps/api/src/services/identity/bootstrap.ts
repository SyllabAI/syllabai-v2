/**
 * One-time first-admin bootstrap port — the V19 window.
 * Frozen sources: identity/BootstrapAdminService.java + BootstrapStateStore.java
 * (verified 2026-10-04, T-MIG-010).
 *
 * Gate semantics (each verbatim):
 *   - status: {"available": claimable()} — enabled && PENDING && zero ADMINs
 *   - claim: disabled → 409 "bootstrap claim surface is disabled on this deployment"
 *            state row missing → 409 "bootstrap state row missing"
 *            not PENDING → 409 "bootstrap claim window is closed (state <X>)"
 *            wall-clock expired (now > updated_at + 15min, anchored to the
 *            row's persisted armed-at, NOT JVM boot — R3) → flip EXPIRED
 *            terminally + 409 "bootstrap claim window is closed (state EXPIRED)"
 *            an ADMIN exists → 409 "an ADMIN account already exists"
 *   - claimant: ADMIN+TEACHER, email lowercased, displayName TRIMMED
 *     (register does NOT trim — verified asymmetry), AuthResponse 200.
 *
 * Transactional deviation, disclosed (recorded in execution_record + PR):
 * the core performs insert+consume in ONE transaction (saveAndFlush then a
 * JdbcTemplate UPDATE, row-locked via FOR UPDATE). The neon-http driver has
 * no interactive transaction, so v2 validates → inserts → consumes with a
 * conditional UPDATE … WHERE state='PENDING' → verifies claimed_by; on a
 * lost race it compensates (deletes its user) and answers the same 409 the
 * core's rollback produces. Concurrent bootstrap claims are a two-operator
 * foot-gun, not a golden surface; the compensating path restores the exact
 * post-state the core's rollback leaves.
 */

import { ConflictError, BadRequestError } from "./errors";
import type { IdentityStore } from "./store";
import type { PasswordPort } from "./password";
import type { JwtPort } from "./jwt";
import type { RegisterInput, AuthResult } from "./service";

/** BootstrapAdminService.CLAIM_WINDOW — 15 minutes after arming. */
export const CLAIM_WINDOW_MS = 15 * 60_000;

export interface BootstrapDeps {
  store: IdentityStore;
  passwords: PasswordPort;
  jwt: JwtPort;
  enabled: boolean;
  now?: () => number;
}

/** BootstrapAdminService.validatePasswordStrength — unreachable via the route
 * (the DTO already enforces the same floor) but ported for parity. */
function validatePasswordStrength(password: string | null | undefined): void {
  if (
    password === null ||
    password === undefined ||
    password.length < 12 ||
    !/[a-zA-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new BadRequestError(
      "bootstrap password must be at least 12 characters and contain letters and digits",
    );
  }
}

export function createBootstrapService(deps: BootstrapDeps) {
  const now = deps.now ?? Date.now;

  async function claimable(): Promise<boolean> {
    if (!deps.enabled) return false;
    const s = (await deps.store.peekState()) ?? { state: "EXPIRED" as const, updatedAtMs: 0 };
    return s.state === "PENDING" && (await deps.store.adminCount()) === 0;
  }

  async function claim(request: RegisterInput): Promise<AuthResult> {
    if (!deps.enabled) {
      throw new ConflictError("bootstrap claim surface is disabled on this deployment");
    }
    const armed = await deps.store.peekState();
    if (armed === null) {
      throw new ConflictError("bootstrap state row missing");
    }
    if (armed.state !== "PENDING") {
      throw new ConflictError(`bootstrap claim window is closed (state ${armed.state})`);
    }
    if (now() > armed.updatedAtMs + CLAIM_WINDOW_MS) {
      await deps.store.expireWindow();
      console.warn(
        `AUDIT: bootstrap claim window EXPIRED unused — wall-clock check at claim time (armed at ${new Date(armed.updatedAtMs).toISOString()}). Reopening requires an explicit migration`,
      );
      throw new ConflictError("bootstrap claim window is closed (state EXPIRED)");
    }
    if ((await deps.store.adminCount()) > 0) {
      throw new ConflictError("an ADMIN account already exists");
    }
    validatePasswordStrength(request.password);

    const id = crypto.randomUUID();
    const hash = await deps.passwords.hash(request.password);
    await deps.store.createUser({
      id,
      email: request.email.toLowerCase(),
      passwordHash: hash,
      displayName: request.displayName.trim(),
      roles: ["ADMIN", "TEACHER"],
    });
    const consumed = await deps.store.consumeWindow(id);
    if (!consumed) {
      // concurrent claim won — compensate to the rollback-equivalent state:
      // the core's transaction would roll the user INSERT back; delete ours.
      await deps.store.deleteUser(id);
      throw new ConflictError("bootstrap claim window is closed (state CONSUMED)");
    }
    const row = await deps.store.findById(id);
    if (row === null) {
      throw new ConflictError("bootstrap claim window is closed (state CONSUMED)");
    }
    console.warn(
      `AUDIT: first-admin bootstrap claimed by ${request.email.toLowerCase()} at ${new Date(now()).toISOString()} — window consumed terminally`,
    );
    const token = await deps.jwt.issueAccessToken({
      id: row.id,
      email: row.email,
      tokenVersion: row.tokenVersion,
      roles: row.roles,
    });
    return {
      accessToken: token,
      tokenType: "Bearer",
      user: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        roles: [...row.roles] as AuthResult["user"]["roles"],
      },
    };
  }

  return { claimable, claim };
}
