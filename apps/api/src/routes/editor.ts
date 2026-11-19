/**
 * Editor router — ADR-044 (v2-NATIVE, additive; NO frozen-core counterpart).
 * Phase 1 (run-002) shipped GET /me; run-011 (Phase 2) adds the proposal
 * plane, mounted under "/api/v1/editor" (the teacher-me class verbatim):
 *
 *   GET  /me                    → 200 EditorMeView ({editor:true,scopes}) —
 *                                 the capability surface (unchanged)
 *   GET  /banks                 → 200 EditorBankInventory — the corpus
 *                                 inventory derived from the LIVE resources
 *                                 HEAD (read-only GitHub REST; typed 502s)
 *   POST /preflight             ← EditorPreflightRequest → 200 verdict (the
 *                                 stateless gate run; persists nothing)
 *   POST /proposals             ← EditorCreateProposalRequest → 201 carried
 *                                 (Tier 3 takes 422 editor_tier3_refused;
 *                                 caps 413/422; upstream 502)
 *   GET  /proposals             → 200 EditorProposalList (the caller's OWN
 *                                 proposals — the journal plane, ADR §9)
 *   GET  /proposals/:id         → 200 | 404 not_found (foreign ids take the
 *                                 honest 404 — existence never leaks)
 *   GET  /proposals/:id/receipts→ 200 EditorProposalReceipts | 404
 *
 * DELIBERATELY NO MORE (ADR §8/§11, asserted by tests — not by comment):
 * there is NO editor-reachable serve or merge-to-main endpoint in ANY
 * phase; the only writes on this plane are proposal + receipt rows, and
 * the Tier 1 merge records a SIMULATED transport until Phase 3.
 *
 * Route security: the shell runs requireAuth FIRST (the Boot 401 before
 * any handler work), then the grant-row predicate (requireEditor — ADR
 * §3), then the handler. Body-bearing routes run the two-envelope
 * classifier (binding failures beat constraints — the workspace-docs R-1
 * law, verbatim).
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
  EDITOR_ERR_FIELD_DELTA_CAP,
  EDITOR_ERR_NOT_FOUND,
  EDITOR_ERR_OPEN_PROPOSALS_CAP,
  EDITOR_ERR_RATE_LIMITED,
  EDITOR_ERR_TIER3_REFUSED,
  EDITOR_ERR_UPSTREAM,
  editorCreateProposalRequestSchema,
  editorPreflightRequestSchema,
} from "@syllabai/contracts";
import { buildEditorModule, type EditorModule, ProposalCapError, ProposalValidationError, Tier3RefusedError } from "../services/editor";
import { BanksInventoryError } from "../services/editor/banks";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { apiError } from "../services/identity/errors";
import { createEditorGate, getEditor } from "../middleware/editor";
import { getAuth } from "../middleware/auth";

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The two-envelope classifier — the workspace-docs R-1 law, verbatim:
 * binding failures beat constraints; the absent field is the jakarta
 * default ("must not be null"). */
function classifyBodyError(error: ZodError): { kind: "malformed" } | { kind: "validation"; message: string } {
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    if (received !== "undefined" && received !== "null") return { kind: "malformed" };
    return { kind: "validation", message: `${field}: must not be null` };
  }
  return { kind: "validation", message: `${field}: ${first.message}` };
}

export function createEditorRouter(module: EditorModule): Hono {
  const r = new Hono();

  // authz shell FIRST: the Boot 401 (unauthenticated) then the Boot 403
  // (authenticated-but-grant-less) — the teacher-me shell law with the
  // requireEditor predicate (ADR-044 §3).
  r.use("*", createEditorGate(module));

  // GET /me — the capability surface (ADR §8). The view is assembled by
  // the gate; the handler just renders it (the grant is read once per
  // request, never cached into a token — the revocation law).
  r.get("/me", async (c) => {
    return c.json(getEditor(c)!, 200); // gate invariant
  });

  // GET /banks — the corpus inventory of record (read-only; the live
  // resources HEAD; typed upstream failures, never a stale fake)
  r.get("/banks", async (c) => {
    try {
      return c.json(await module.banksInventory(), 200);
    } catch (e) {
      if (e instanceof BanksInventoryError) {
        const code = e.code === "rate_limited" ? EDITOR_ERR_RATE_LIMITED : EDITOR_ERR_UPSTREAM;
        return c.json(apiError(502, code, e.message), 502);
      }
      throw e; // 500 (infrastructure, never masked)
    }
  });

  // POST /preflight — the stateless gate run (ADR §8: "returning the typed
  // refusal list without persisting anything"). A verdict is a verdict —
  // ok:false is a 200 carrying refusals, not an error class.
  r.post("/preflight", async (c) => {
    const raw = await readJsonBody(c);
    if (!raw) return c.json(malformedBody(), 400);
    const parsed = editorPreflightRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    return c.json(module.preflight(parsed.data).verdict, 200);
  });

  // POST /proposals — create (server-side tier classification; the client's
  // is advisory). 201 carried | 422 Tier 3 refused | 413/422 caps | 502
  // upstream | 400 two-envelope.
  r.post("/proposals", async (c) => {
    const raw = await readJsonBody(c);
    if (!raw) return c.json(malformedBody(), 400);
    const parsed = editorCreateProposalRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const verdict = classifyBodyError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    const auth = getAuth(c)!; // shell invariant
    try {
      return c.json(await module.createProposal(auth.userId, parsed.data), 201);
    } catch (e) {
      if (e instanceof Tier3RefusedError) {
        return c.json(
          {
            status: 422,
            error: EDITOR_ERR_TIER3_REFUSED,
            message: e.message,
            verdict: e.verdict,
            timestamp: new Date().toISOString(),
          },
          422,
        );
      }
      if (e instanceof ProposalCapError) {
        const code = e.code === EDITOR_ERR_FIELD_DELTA_CAP ? EDITOR_ERR_FIELD_DELTA_CAP : EDITOR_ERR_OPEN_PROPOSALS_CAP;
        return c.json(apiError(e.status, code, e.message), e.status);
      }
      if (e instanceof ProposalValidationError) {
        return c.json(apiError(400, "validation_failed", e.message), 400);
      }
      if (e instanceof BanksInventoryError) {
        const code = e.code === "rate_limited" ? EDITOR_ERR_RATE_LIMITED : EDITOR_ERR_UPSTREAM;
        return c.json(apiError(502, code, e.message), 502);
      }
      throw e; // 500 (infrastructure, never masked)
    }
  });

  // GET /proposals — the caller's own journal (ADR §9: the receipts for the
  // user's own proposals; the plane never serves another account's queue)
  r.get("/proposals", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    return c.json({ proposals: await module.listProposals(auth.userId) }, 200);
  });

  // GET /proposals/:id — the detail (own only; foreign ids → honest 404)
  r.get("/proposals/:id", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    const proposal = await module.getProposal(auth.userId, c.req.param("id"));
    if (!proposal) return c.json(apiError(404, EDITOR_ERR_NOT_FOUND, "no such proposal for this account"), 404);
    return c.json(proposal, 200);
  });

  // GET /proposals/:id/receipts — the audit journal (append-only plane)
  r.get("/proposals/:id/receipts", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    const journal = await module.listReceipts(auth.userId, c.req.param("id"));
    if (!journal) return c.json(apiError(404, EDITOR_ERR_NOT_FOUND, "no such proposal for this account"), 404);
    return c.json(journal, 200);
  });

  return r;
}

export function buildEditorRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildEditorModule(sql, env);
  return { module, editorRoute: createEditorRouter(module) };
}
