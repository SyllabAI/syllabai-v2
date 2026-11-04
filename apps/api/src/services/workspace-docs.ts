/**
 * Workspace-docs service — T-AUDIT-TIER1 run-003 (v2-NATIVE, additive).
 *
 * The storage half of the workspace-document plane: ONE row per
 * (user_id, doc_key) in user_documents (0026). Values are OPAQUE jsonb —
 * this module never opens them (the reconcile law is the hub's per-store
 * bridge; the plane is last-write-wins per key with a server updated_at of
 * record). The 512KB cap is a ROUTER law (the wire contract in
 * packages/contracts WORKSPACE_DOC_MAX_BYTES) — the DB never re-litigates
 * it.
 *
 * List order: updated_at ASC (append-order of record — the hub's per-store
 * reconcile re-orders by its own law). Reads are honest: get() returns null
 * for an absent doc (the router renders the 200 {value:null,updatedAt:null}
 * envelope — never a 404 on a fresh account).
 */
import type { SqlFn } from "./identity/users";

export interface WorkspaceDocRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class WorkspaceDocs {
  constructor(private readonly sql: SqlFn) {}

  /** Every stored doc for the account, updated_at ascending. */
  async list(userId: string): Promise<WorkspaceDocRow[]> {
    const rows = await this.sql`
      SELECT doc_key AS key, value, updated_at AS "updatedAt"
      FROM user_documents
      WHERE user_id = ${userId}
      ORDER BY updated_at ASC`;
    return rows.map((r) => ({
      key: String(r.key),
      value: r.value,
      updatedAt: String(r.updatedAt),
    }));
  }

  /** ONE doc by key — null when the account never stored it. */
  async get(userId: string, key: string): Promise<WorkspaceDocRow | null> {
    const rows = await this.sql`
      SELECT doc_key AS key, value, updated_at AS "updatedAt"
      FROM user_documents
      WHERE user_id = ${userId} AND doc_key = ${key}
      LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    return { key: String(r.key), value: r.value, updatedAt: String(r.updatedAt) };
  }

  /** Upsert of record: INSERT .. ON CONFLICT DO UPDATE, the write instant
   *  stamped server-side (client clocks never win — the plane's LWW is
   *  arrival order, not payload timestamps). */
  async put(userId: string, key: string, value: unknown): Promise<WorkspaceDocRow> {
    const rows = await this.sql`
      INSERT INTO user_documents (user_id, doc_key, value, updated_at)
      VALUES (${userId}, ${key}, ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (user_id, doc_key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      RETURNING doc_key AS key, value, updated_at AS "updatedAt"`;
    const r = rows[0];
    return { key: String(r.key), value: r.value, updatedAt: String(r.updatedAt) };
  }

  /** Delete by key — true when a row was removed (the honest clear). */
  async delete(userId: string, key: string): Promise<boolean> {
    const rows = await this.sql`
      DELETE FROM user_documents
      WHERE user_id = ${userId} AND doc_key = ${key}
      RETURNING doc_key`;
    return rows.length > 0;
  }
}
