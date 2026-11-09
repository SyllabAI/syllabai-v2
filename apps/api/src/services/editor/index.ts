/**
 * Editor services — ADR-044 run-002 Phase 1 (v2-NATIVE, additive; NO
 * frozen-core counterpart — the workspace-docs class). The grant plane
 * behind the requireEditor shell and GET /api/v1/editor/me:
 *
 *   - editor_grants  → editorMe: possession of an unrevoked row IS the
 *     role (ADR-044 §3); the API checks the grant AT REQUEST TIME, never
 *     inside a token, so revocation (revoked_at) is effective on the next
 *     request without a token-version bump. scopes ride the closed
 *     contracts vocabulary (packages/contracts editorScopeSchema — an
 *     unknown scope in a grant row degrades to a 403, fail-closed, not a
 *     500: the grant data may only ever carry what the vocabulary admits).
 *
 * Phase 1 reads editor_grants ONLY. The proposal/receipt planes (§7) stay
 * unwritten until Phase 2's proposal router — no editor write path exists
 * yet (E-0: the serving plane is never directly editable, and Phase 1
 * ships no pens).
 */
import type { EditorMeView, EditorScope } from "@syllabai/contracts";
import { EDITOR_SCOPES, editorMeViewSchema } from "@syllabai/contracts";
import type { SqlFn } from "../assessment/sql";

export interface EditorDeps {
  sql: SqlFn;
}

interface EditorGrantRow {
  scopes: unknown;
}

/**
 * The capability surface of record (ADR §8: "GET /me — the capability
 * surface (200 with scopes for grant holders, 403 otherwise)"). Returns
 * the EditorMeView when the account holds an unrevoked grant whose scopes
 * all bind to the closed vocabulary; null otherwise (the caller renders
 * the Boot 403 — ADR §3: "grant holders proceed", nobody else does).
 */
export async function editorMe(deps: EditorDeps, userId: string): Promise<EditorMeView | null> {
  const rows = (await deps.sql`
    select scopes from editor_grants
    where user_id = ${userId} and revoked_at is null
    limit 1
  `) as unknown as EditorGrantRow[];
  const row = rows[0];
  if (!row) return null;
  // fail-closed scope law: the stored scopes must be a JSON array whose
  // every member binds to the closed vocabulary — a drifted row (garbage
  // jsonb, an unknown scope) degrades to "no grant" (403), never a 500
  // and never an unscoped surface.
  if (!Array.isArray(row.scopes)) return null;
  const scopes: EditorScope[] = [];
  for (const s of row.scopes) {
    if (typeof s !== "string") return null;
    if (!(EDITOR_SCOPES as readonly string[]).includes(s)) return null;
    scopes.push(s as EditorScope);
  }
  // the view law is the contract's own parse (defense-in-depth against a
  // contracts drift silently widening the wire)
  return editorMeViewSchema.parse({ editor: true, scopes });
}

export function buildEditorModule(sql: SqlFn) {
  const deps = { sql };
  return {
    editorMe: (userId: string) => editorMe(deps, userId),
  };
}

export type EditorModule = ReturnType<typeof buildEditorModule>;
