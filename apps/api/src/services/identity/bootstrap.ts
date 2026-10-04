/**
 * Bootstrap admin port — the one-time first-admin window (V19
 * bootstrap_admin_state row), from frozen BootstrapAdminService.java +
 * BootstrapStateStore.java.
 *
 * Gate semantics preserved exactly:
 *   claimable (status probe): enabled && row state == PENDING && zero ADMIN
 *     roles. NOTE — the Java claimable() does NOT check the wall clock
 *     (BootstrapAdminService.java:72-78): a stale PENDING row still probes
 *     available:true until the scheduled expiry flips it or a claim arrives
 *     and is refused by the wall-clock check on the claim path (R3).
 *     The port replicates this asymmetry verbatim; the 60s scheduled sweep
 *     is a Vercel-Cron concern at cutover (MIGRATION_PLAN §5 W4), not an
 *     api-process timer, so the claim-path check is the enforcing gate here.
 *   claim: row-locked (FOR UPDATE) read; non-PENDING → 409 with the state
 *     in the message; wall-clock check against the ROW's updated_at (armed
 *     at) + 15min — expired-at-claim flips the row EXPIRED terminally;
 *     admin-exists → 409; password strength (12+/letter+digit) → 400 with
 *     the verbatim message; user created ADMIN+TEACHER in the same
 *     transaction that consumes the window; consume race → 409 CONSUMED.
 *
 * BootstrapStateStore SQL is ported statement-for-statement
 * (BootstrapStateStore.java:31-86), including `FOR UPDATE` row locking.
 */
import { randomUUID } from "node:crypto";
import type { SqlFn } from "./users";
import { createSql, UsersRepository, type UserRow } from "./users";
import { hashPassword, toAuthResponse, type AuthResponseShape } from "./service";
import { BadRequestException, ConflictException } from "./errors";
import type { IdentityServices } from "./config";

/** BootstrapAdminService.java:50 — CLAIM_WINDOW = 15 minutes. */
export const CLAIM_WINDOW_MS = 15 * 60 * 1000;

export type BootstrapState = "PENDING" | "CONSUMED" | "EXPIRED";

export interface BootstrapStateAndArmedAt {
  state: BootstrapState;
  updatedAt: Date;
}

export class BootstrapStateStore {
  constructor(private readonly sql: SqlFn) {}

  /** Exposed for unlocked, non-transactional reads by the service. */
  get raw(): SqlFn {
    return this.sql;
  }

  /** Port of lockStateWithArmedAt (:45-50) — call inside the claim tx. */
  async lockStateWithArmedAt(tx: SqlFn): Promise<BootstrapStateAndArmedAt | null> {
    const rows = await tx`
      select state, updated_at from bootstrap_admin_state where id = 1 for update`;
    const row = rows[0];
    return row ? toState(row) : null;
  }

  /** Port of peekStateWithArmedAt (:58-64) — unlocked read. */
  async peekStateWithArmedAt(): Promise<BootstrapStateAndArmedAt | null> {
    return this.lockStateWithArmedAt(this.sql);
  }

  /** Port of adminCount (:67-71). */
  async adminCount(tx: SqlFn): Promise<number> {
    const rows = await tx`select count(*) as n from user_roles where role = 'ADMIN'`;
    return Number(rows[0]?.n ?? 0);
  }

  /** Port of consume (:74-79) — true when the row was still PENDING. */
  async consume(tx: SqlFn, claimedBy: string): Promise<boolean> {
    const rows = await tx`
      update bootstrap_admin_state
      set state = 'CONSUMED', claimed_by = ${claimedBy}::uuid, claimed_at = now(), updated_at = now()
      where id = 1 and state = 'PENDING'
      returning id`;
    return rows.length === 1;
  }

  /** Port of expire (:82-86) — terminal expiry of an unused window. */
  async expire(): Promise<boolean> {
    const rows = await this.sql`
      update bootstrap_admin_state set state = 'EXPIRED', updated_at = now()
      where id = 1 and state = 'PENDING'
      returning id`;
    return rows.length === 1;
  }
}

function toState(r: Record<string, unknown>): BootstrapStateAndArmedAt {
  if (!r || r.state === undefined || r.updated_at === undefined) {
    throw new ConflictException("bootstrap state row missing");
  }
  const s = String(r.state);
  if (s !== "PENDING" && s !== "CONSUMED" && s !== "EXPIRED") {
    throw new ConflictException("bootstrap state row missing");
  }
  return { state: s, updatedAt: new Date(String(r.updated_at)) };
}

export class BootstrapAdminService {
  constructor(
    private readonly state: BootstrapStateStore,
    private readonly users: UsersRepository,
    private readonly identity: IdentityServices,
    private readonly databaseUrl: string,
  ) {}

  /** Anonymous status probe (BootstrapAdminController.java:33-36). */
  async claimable(): Promise<boolean> {
    if (!this.identity.config.bootstrapEnabled) return false;
    const s = (await this.state.peekStateWithArmedAt()) ?? { state: "EXPIRED" as const };
    if (s.state !== "PENDING") return false;
    return (await this.state.adminCount(this.state.raw)) === 0;
  }

  /** The one-time claim (BootstrapAdminService.claim :81-128). */
  async claim(request: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResponseShape> {
    if (!this.identity.config.bootstrapEnabled) {
      throw new ConflictException("bootstrap claim surface is disabled on this deployment");
    }
    const sql = createSql(this.databaseUrl);

    // Row-locked state read + all writes in ONE transaction (the Java
    // @Transactional claim + saveAndFlush + consume ordering).
    const claimed = await sql.transaction(async (tx) => {
      const armed = await this.state.lockStateWithArmedAt(tx);
      if (armed === null) {
        throw new ConflictException("bootstrap state row missing");
      }
      if (armed.state !== "PENDING") {
        throw new ConflictException(`bootstrap claim window is closed (state ${armed.state})`);
      }
      // Wall-clock enforcement ON the claim path (R3, :97-104): anchor is the
      // ROW's updated_at, not process boot — a restart must not re-arm.
      if (Date.now() > armed.updatedAt.getTime() + CLAIM_WINDOW_MS) {
        const flipped = await this.state.expire();
        if (flipped) {
          console.warn(
            "AUDIT: bootstrap claim window EXPIRED unused — wall-clock check at claim time " +
              `(armed at ${armed.updatedAt.toISOString()}). Reopening requires an explicit migration`,
          );
        }
        throw new ConflictException("bootstrap claim window is closed (state EXPIRED)");
      }
      if ((await this.state.adminCount(tx)) > 0) {
        throw new ConflictException("an ADMIN account already exists");
      }
      this.validatePasswordStrength(request.password);

      const passwordHash = await hashPassword(request.password);
      const email = request.email.toLowerCase();
      const user: UserRow = await this.users.insertUser({
        email,
        passwordHash,
        displayName: request.displayName.trim(),
        roles: ["ADMIN", "TEACHER"],
        id: randomUUID(),
        createdAt: new Date(),
      });
      if (!(await this.state.consume(tx, user.id))) {
        // concurrent claim won the row race — refuse (tx rolls back)
        throw new ConflictException("bootstrap claim window is closed (state CONSUMED)");
      }
      console.warn(
        `AUDIT: first-admin bootstrap claimed by ${email} at ${new Date().toISOString()} — window consumed terminally`,
      );
      return user;
    });

    return toAuthResponse(claimed, this.identity.jwt.issueAccessToken(claimed));
  }

  /** BootstrapAdminService.validatePasswordStrength (:157-165) — message verbatim. */
  private validatePasswordStrength(password: string | null): void {
    if (
      password === null ||
      password.length < 12 ||
      !/\p{L}/u.test(password) || // Character::isLetter analog (any Unicode letter)
      !/\d/.test(password)
    ) {
      throw new BadRequestException(
        "bootstrap password must be at least 12 characters and contain letters and digits",
      );
    }
  }
}
