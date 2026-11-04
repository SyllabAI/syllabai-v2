/**
 * Workspace-document store (T-AUDIT-TIER1 run-003) — the account-backed
 * persistence plane for the hub's client workspace stores. One row per
 * (user, doc key) in `user_documents` (packages/db 0025); the hub's stores
 * write through here and hydrate from here, so nothing learner/teacher-
 * shaped lives only in a browser profile anymore.
 *
 * Posture (learner-pdf-drawings parity): write-capable, transaction-free —
 * the composite PK (user_id, doc_key) IS the concurrency grain. Each store
 * doc is single-writer per user session (the hub's one debounced flusher per
 * key), so an upsert race degenerates to last-write-wins on the whole
 * document — the SAME whole-document law the localStorage era had (one
 * browser, one JSON blob), now account-scoped. Values are opaque JSONB: the
 * per-store shapes and caps stay owned by their store modules + contracts;
 * this store is the envelope.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

export interface WorkspaceDocRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class WorkspaceDocs {
  constructor(private readonly sql: SqlFn) {}

  /** Every stored doc for the user (the hydration list), oldest first. */
  async list(userId: string): Promise<WorkspaceDocRow[]> {
    const rows = await this.sql`
      select doc_key, value, updated_at
      from user_documents
      where user_id = ${userId}::uuid
      order by updated_at asc
    `;
    return rows.map((r) => ({
      key: String(r.doc_key),
      value: r.value,
      updatedAt: new Date(r.updated_at as string).toISOString(),
    }));
  }

  /** One doc — honest-null when never written (the Get envelope). */
  async get(userId: string, key: string): Promise<WorkspaceDocRow | null> {
    const rows = await this.sql`
      select doc_key, value, updated_at
      from user_documents
      where user_id = ${userId}::uuid and doc_key = ${key}
    `;
    const r = rows[0];
    if (!r) return null;
    return {
      key: String(r.doc_key),
      value: r.value,
      updatedAt: new Date(r.updated_at as string).toISOString(),
    };
  }

  /** Upsert the whole document — the stored row's updatedAt back. */
  async put(userId: string, key: string, value: unknown): Promise<WorkspaceDocRow> {
    const rows = await this.sql`
      insert into user_documents (user_id, doc_key, value, updated_at)
      values (${userId}::uuid, ${key}, ${JSON.stringify(value)}::jsonb, now())
      on conflict (user_id, doc_key)
      do update set value = excluded.value, updated_at = now()
      returning doc_key, value, updated_at
    `;
    const r = rows[0]!;
    return {
      key: String(r.doc_key),
      value: r.value,
      updatedAt: new Date(r.updated_at as string).toISOString(),
    };
  }

  /** Remove one doc (the "clear" paths). Idempotent. */
  async delete(userId: string, key: string): Promise<void> {
    await this.sql`
      delete from user_documents
      where user_id = ${userId}::uuid and doc_key = ${key}
    `;
  }
}
