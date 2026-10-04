/**
 * Identity persistence — the UserRepository/BootstrapStateStore surface,
 * ported behind a store interface (T-MIG-010).
 *
 * Frozen sources (verified 2026-10-04):
 *   identity/UserRepository.java       (findByEmailIgnoreCase,
 *                                       existsByEmailIgnoreCase, findById)
 *   identity/User.java                 (token_version bump on rotation, V46)
 *   identity/BootstrapStateStore.java  (V19 single-row state machine)
 *   db/migration/V1__identity.sql      (users/user_roles/roles DDL)
 *   db/migration/V19__bootstrap_admin_state.sql
 *   db/migration/V46__user_token_version.sql
 *
 * Fence note: packages/db/** is R2's lane. This module does NOT touch it and
 * does NOT hand-write schema.ts (AGENT_COORDINATION §7 anti-pattern). It
 * drives parameterized SQL through the @syllabai/db client that the seed
 * already exports — column names come from the Flyway DDL quoted above.
 *
 * The PgIdentityStore is exercised against a Neon BRANCH (same-Neon doctrine:
 * production stays read-only). The MemoryIdentityStore implements the exact
 * same contract for hermetic unit tests (case-insensitive email uniqueness,
 * token_version rotation, bootstrap state semantics).
 */

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  enabled: boolean;
  tokenVersion: number;
  createdAt: string;
  roles: string[];
}

export type BootstrapState = "PENDING" | "CONSUMED" | "EXPIRED";

export interface BootstrapStateAndArmedAt {
  state: BootstrapState;
  /** the persisted armed-at moment (updated_at) — window anchor (R3) */
  updatedAtMs: number;
}

export interface IdentityStore {
  findByEmailIgnoreCase(email: string): Promise<UserRow | null>;
  existsByEmailIgnoreCase(email: string): Promise<boolean>;
  findById(id: string): Promise<UserRow | null>;
  /** inserts user + roles; id is caller-generated (Java @PrePersist analog) */
  createUser(input: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    roles: readonly string[];
  }): Promise<UserRow>;
  /** rotates the hash and bumps token_version; returns the new version */
  rotatePasswordHash(id: string, newPasswordHash: string): Promise<number>;
  /** compensating delete for a lost bootstrap claim race (user_roles cascade) */
  deleteUser(id: string): Promise<void>;
  adminCount(): Promise<number>;
  /** unlocked read (status probe / expiry checks) */
  peekState(): Promise<BootstrapStateAndArmedAt | null>;
  consumeWindow(claimedBy: string): Promise<boolean>;
  expireWindow(): Promise<boolean>;
}

// ─── MemoryIdentityStore (hermetic tests) ─────────────────────────────────

export class UniqueEmailError extends Error {}

export class MemoryIdentityStore implements IdentityStore {
  /** key: LOWER(email) */
  private readonly byLowerEmail = new Map<string, UserRow>();
  private readonly byId = new Map<string, UserRow>();
  private bootstrapState: BootstrapStateAndArmedAt | null = {
    state: "PENDING",
    updatedAtMs: Date.now(),
  };

  /** seed helper for tests (bypasses hashing) */
  put(user: UserRow): void {
    this.byLowerEmail.set(user.email.toLowerCase(), user);
    this.byId.set(user.id, user);
  }

  /** test helper for the bootstrap window */
  setBootstrapState(s: BootstrapStateAndArmedAt | null): void {
    this.bootstrapState = s;
  }

  async findByEmailIgnoreCase(email: string): Promise<UserRow | null> {
    return this.byLowerEmail.get(email.toLowerCase()) ?? null;
  }

  async existsByEmailIgnoreCase(email: string): Promise<boolean> {
    return this.byLowerEmail.has(email.toLowerCase());
  }

  async findById(id: string): Promise<UserRow | null> {
    return this.byId.get(id) ?? null;
  }

  async createUser(input: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    roles: readonly string[];
  }): Promise<UserRow> {
    if (this.byLowerEmail.has(input.email.toLowerCase())) {
      throw new UniqueEmailError("email already registered");
    }
    const row: UserRow = {
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      enabled: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
      roles: [...input.roles],
    };
    this.byLowerEmail.set(row.email.toLowerCase(), row);
    this.byId.set(row.id, row);
    return row;
  }

  async rotatePasswordHash(id: string, newPasswordHash: string): Promise<number> {
    const row = this.byId.get(id);
    if (!row) throw new Error("user not found");
    row.passwordHash = newPasswordHash;
    row.tokenVersion += 1;
    return row.tokenVersion;
  }

  async deleteUser(id: string): Promise<void> {
    const row = this.byId.get(id);
    if (row) {
      this.byLowerEmail.delete(row.email.toLowerCase());
      this.byId.delete(id);
    }
  }

  async adminCount(): Promise<number> {
    let n = 0;
    for (const u of this.byId.values()) if (u.roles.includes("ADMIN")) n += 1;
    return n;
  }

  async peekState(): Promise<BootstrapStateAndArmedAt | null> {
    return this.bootstrapState ? { ...this.bootstrapState } : null;
  }

  async consumeWindow(claimedBy: string): Promise<boolean> {
    if (!this.bootstrapState || this.bootstrapState.state !== "PENDING") return false;
    this.bootstrapState = { state: "CONSUMED", updatedAtMs: Date.now() };
    void claimedBy;
    return true;
  }

  async expireWindow(): Promise<boolean> {
    if (!this.bootstrapState || this.bootstrapState.state !== "PENDING") return false;
    this.bootstrapState = { state: "EXPIRED", updatedAtMs: Date.now() };
    return true;
  }
}

// ─── PgIdentityStore (Neon branch / deployment) ───────────────────────────

import { sql } from "drizzle-orm";
import type { Db } from "@syllabai/db";

interface RawRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  enabled: boolean;
  token_version: number | string;
  created_at: Date | string;
  roles: string[] | null;
}

function toUserRow(r: RawRow): UserRow {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    displayName: r.display_name,
    enabled: r.enabled,
    tokenVersion: Number(r.token_version),
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
    roles: r.roles ?? [],
  };
}

export class PgIdentityStore implements IdentityStore {
  constructor(private readonly db: Db) {}

  private async rows(query: ReturnType<typeof sql>): Promise<RawRow[]> {
    // drizzle neon-http: execute() → { rows }; typed defensively across
    // driver versions rather than trusting a shape we don't own
    const res = (await this.db.execute(query)) as unknown as { rows?: RawRow[] } | RawRow[];
    return Array.isArray(res) ? res : (res.rows ?? []);
  }

  async findByEmailIgnoreCase(email: string): Promise<UserRow | null> {
    const rows = await this.rows(sql`
      SELECT u.id, u.email, u.password_hash, u.display_name, u.enabled,
             u.token_version, u.created_at,
             COALESCE(json_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '[]') AS roles
      FROM users u
      LEFT JOIN user_roles r ON r.user_id = u.id
      WHERE lower(u.email) = lower(${email})
      GROUP BY u.id
      LIMIT 1`);
    return rows.length > 0 ? toUserRow(rows[0]!) : null;
  }

  async existsByEmailIgnoreCase(email: string): Promise<boolean> {
    const rows = await this.rows(
      sql`SELECT 1 FROM users WHERE lower(email) = lower(${email}) LIMIT 1`,
    );
    return rows.length > 0;
  }

  async findById(id: string): Promise<UserRow | null> {
    const rows = await this.rows(sql`
      SELECT u.id, u.email, u.password_hash, u.display_name, u.enabled,
             u.token_version, u.created_at,
             COALESCE(json_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '[]') AS roles
      FROM users u
      LEFT JOIN user_roles r ON r.user_id = u.id
      WHERE u.id = ${id}::uuid
      GROUP BY u.id
      LIMIT 1`);
    return rows.length > 0 ? toUserRow(rows[0]!) : null;
  }

  async createUser(input: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    roles: readonly string[];
  }): Promise<UserRow> {
    await this.db.execute(sql`
      INSERT INTO users (id, email, password_hash, display_name, enabled, token_version, created_at)
      VALUES (${input.id}::uuid, ${input.email}, ${input.passwordHash}, ${input.displayName}, TRUE, 1, now())`);
    for (const role of input.roles) {
      await this.db.execute(
        sql`INSERT INTO user_roles (user_id, role) VALUES (${input.id}::uuid, ${role})`,
      );
    }
    const created = await this.findById(input.id);
    if (!created) throw new Error("insert succeeded but user row unreadable");
    return created;
  }

  async rotatePasswordHash(id: string, newPasswordHash: string): Promise<number> {
    const rows = await this.rows(sql`
      UPDATE users SET password_hash = ${newPasswordHash}, token_version = token_version + 1
      WHERE id = ${id}::uuid
      RETURNING token_version`);
    if (rows.length === 0) throw new Error("user not found");
    return Number(rows[0]!.token_version);
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM users WHERE id = ${id}::uuid`);
  }

  async adminCount(): Promise<number> {
    const rows = await this.rows(
      sql`SELECT count(*)::int AS n FROM user_roles WHERE role = 'ADMIN'`,
    );
    return Number((rows[0] as unknown as { n: number } | undefined)?.n ?? 0);
  }

  async peekState(): Promise<BootstrapStateAndArmedAt | null> {
    const rows = await this.rows(
      sql`SELECT state, updated_at FROM bootstrap_admin_state WHERE id = 1`,
    );
    if (rows.length === 0) return null;
    const r = rows[0] as unknown as { state: string; updated_at: Date | string };
    return {
      state: r.state as BootstrapState,
      updatedAtMs: typeof r.updated_at === "string" ? Date.parse(r.updated_at) : new Date(r.updated_at).getTime(),
    };
  }

  async consumeWindow(claimedBy: string): Promise<boolean> {
    const rows = await this.rows(sql`
      UPDATE bootstrap_admin_state
      SET state = 'CONSUMED', claimed_by = ${claimedBy}::uuid, claimed_at = now(), updated_at = now()
      WHERE id = 1 AND state = 'PENDING'`);
    return rows.length > 0;
  }

  async expireWindow(): Promise<boolean> {
    const rows = await this.rows(sql`
      UPDATE bootstrap_admin_state SET state = 'EXPIRED', updated_at = now()
      WHERE id = 1 AND state = 'PENDING'`);
    return rows.length > 0;
  }
}
