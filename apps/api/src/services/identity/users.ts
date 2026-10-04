/**
 * UserRepository port — the OBSERVED query surface of the frozen
 * UserRepository.java / User.java against the Flyway-owned schema
 * (R-LAZY doctrine: port the repository call sequence, not the entity map).
 *
 * Tables (Flyway-owned, row-level read/write only — BASELINE_DB.md §4):
 *   users(id uuid PK, email varchar(254) UNIQUE NOT NULL,
 *         password_hash varchar(100) NOT NULL, display_name varchar(100) NOT NULL,
 *         enabled boolean NOT NULL, token_version bigint NOT NULL DEFAULT 1,
 *         created_at timestamptz NOT NULL)
 *   user_roles(user_id → users.id, role varchar(16) NOT NULL)  [element collection]
 *
 * Behaviour parity notes:
 *   - findByEmailIgnoreCase: Java is CaseInsensitive via
 *     `lower(email) = lower(?)` (Spring's IgnoredCase key) — roles are
 *     EAGER (EntityGraph), so the port fetches them in the same round trip
 *     (array_agg) or a follow-up query; a user row always exists with ≥1 role.
 *   - register insert: id/created_at are @PrePersist (UUID.randomUUID(),
 *     Instant.now()) — the port assigns them in code, matching the core.
 *   - token_version: Java default 1 on INSERT (User.java:53).
 *   - rotate: password_hash + token_version+1 in one UPDATE (User.rotatePasswordHash).
 *
 * Multi-statement writes (register, bootstrap claim) run in interactive
 * transactions (see createSql below) so the R-TX doctrine holds: no partial
 * writes, row-locked claim serialization.
 */
import { Client } from "@neondatabase/serverless";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  enabled: boolean;
  tokenVersion: number;
  createdAt: Date;
  roles: string[];
}

export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

/**
 * Builds the repository over a Neon DATABASE_URL.
 *
 * Driver choice (deliberate): the HTTP `neon()` function only supports
 * BATCHED transactions (an array of queries — no conditional flow between
 * them), while register/claim need INTERACTIVE transactions with row locking
 * (FOR UPDATE on bootstrap_admin_state, R-TX doctrine). The same package's
 * WebSocket `Client` provides full interactive sessions, so the port uses it
 * through a tagged-template adapter that keeps the repository code
 * driver-agnostic. A single serialized session per repository instance —
 * pooling/uniformity lands with the db-baseline integration (T-MIG-002).
 */
export function createSql(databaseUrl: string): NeonSql {
  const client = new Client({ connectionString: databaseUrl });
  let connecting: Promise<void> | null = null;
  const ensure = () => {
    connecting ??= client.connect().then(() => undefined);
    return connecting;
  };
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    await ensure();
    const { text, values } = toQuery(strings, params);
    const res = await client.query({ text, values });
    return res.rows as Array<Record<string, unknown>>;
  }) as NeonSql;
  fn.transaction = async <T>(body: (tx: SqlFn) => Promise<T>): Promise<T> => {
    await ensure();
    await client.query({ text: "begin" });
    try {
      const result = await body(fn as SqlFn);
      await client.query({ text: "commit" });
      return result;
    } catch (e) {
      await client.query({ text: "rollback" });
      throw e;
    }
  };
  return fn;
}

/** Tagged template → {text with $n placeholders, values}. */
function toQuery(strings: TemplateStringsArray, params: unknown[]): { text: string; values: unknown[] } {
  let text = strings[0] ?? "";
  const values: unknown[] = [];
  for (let i = 0; i < params.length; i++) {
    values.push(params[i]);
    text += `$${i + 1}${strings[i + 1] ?? ""}`;
  }
  return { text, values };
}

export function createUsersRepository(databaseUrl: string) {
  return new UsersRepository(createSql(databaseUrl));
}

interface NeonSql extends SqlFn {
  transaction<T>(fn: (tx: SqlFn) => Promise<T>): Promise<T>;
}

export class UsersRepository {
  constructor(private readonly sql: NeonSql) {}

  /** Port of findByEmailIgnoreCase (case-insensitive; roles eager). */
  async findByEmailIgnoreCase(email: string): Promise<UserRow | null> {
    const rows = await this.sql`
      select u.id, u.email, u.password_hash, u.display_name, u.enabled,
             u.token_version, u.created_at,
             coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
      from users u
      left join user_roles r on r.user_id = u.id
      where lower(u.email) = lower(${email})
      group by u.id
      limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    return toRow(rows[0]);
  }

  /** Port of existsByEmailIgnoreCase. */
  async existsByEmailIgnoreCase(email: string): Promise<boolean> {
    const rows = await this.sql`
      select 1 as one from users where lower(email) = lower(${email}) limit 1`;
    return rows.length > 0;
  }

  /**
   * Port of userRepository.save(new User(...)) for registration:
   * INSERT users + INSERT user_roles atomically (PrePersist defaults
   * assigned in code; token_version defaults via the column).
   * Caller has already decided the email is free — a UNIQUE violation
   * surfacing here is a race; it propagates as a DB error (the Java core's
   * equivalent would be a ConstraintViolation → 500 on a true race; the
   * exists-check + same-tx insert window is identical).
   */
  async insertUser(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    roles: string[];
    id: string;
    createdAt: Date;
  }): Promise<UserRow> {
    return this.sql.transaction(async (tx) => {
      const inserted = await tx`
        insert into users (id, email, password_hash, display_name, enabled, created_at)
        values (${input.id}::uuid, ${input.email}, ${input.passwordHash}, ${input.displayName},
                true, ${input.createdAt.toISOString()}::timestamptz)
        returning id, email, password_hash, display_name, enabled, token_version, created_at`;
      const row = inserted[0];
      if (!row) throw new Error("users insert returned no row");
      for (const role of input.roles) {
        await tx`insert into user_roles (user_id, role) values (${input.id}::uuid, ${role})`;
      }
      return toRow({ ...row, roles: input.roles });
    });
  }

  /**
   * Port of changePassword's user.rotatePasswordHash + save: the ONLY
   * supported way the stored hash changes; bumps token_version so every
   * previously issued token dies at its next request (User.java:123-128).
   * Returns the new token_version.
   */
  async rotatePasswordHash(email: string, newPasswordHash: string): Promise<number> {
    const rows = await this.sql`
      update users set password_hash = ${newPasswordHash}, token_version = token_version + 1
      where lower(email) = lower(${email})
      returning token_version`;
    const row = rows[0];
    if (!row) throw new Error("rotate on missing user — caller must pre-check");
    return Number(row.token_version);
  }

  /** Port of the JwtAuthenticationFilter's findById revocation lookup (PK read). */
  async findById(id: string): Promise<UserRow | null> {
    const rows = await this.sql`
      select u.id, u.email, u.password_hash, u.display_name, u.enabled,
             u.token_version, u.created_at,
             coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
      from users u
      left join user_roles r on r.user_id = u.id
      where u.id = ${id}::uuid
      group by u.id
      limit 1`;
    if (rows.length === 0 || !rows[0]) return null;
    return toRow(rows[0]);
  }
}

function toRow(r: Record<string, unknown>): UserRow {
  return {
    id: String(r.id),
    email: String(r.email),
    passwordHash: String(r.password_hash),
    displayName: String(r.display_name),
    enabled: Boolean(r.enabled),
    tokenVersion: Number(r.token_version),
    createdAt: new Date(String(r.created_at)),
    roles: (r.roles as string[] | null) ?? [],
  };
}
