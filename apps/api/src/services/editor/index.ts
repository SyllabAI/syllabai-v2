/**
 * Editor services — ADR-044 (v2-NATIVE, additive; NO frozen-core counterpart
 * — the workspace-docs class). The grant plane (Phase 1) + the proposal
 * plane (run-011 Phase 2) behind the requireEditor shell:
 *
 *   - editor_grants   → editorMe: possession of an unrevoked row IS the
 *     role (ADR-044 §3); checked AT REQUEST TIME, never inside a token, so
 *     revocation is effective on the next request without a token-version
 *     bump. scopes ride the closed contracts vocabulary; a drifted row
 *     degrades to a 403, fail-closed, never a 500.
 *
 *   - editor_edit_proposals + editor_edit_receipts → the proposal plane
 *     (ADR §6/§7, run-011): POST /proposals classifies the tier SERVER-SIDE
 *     (the engine re-runs here; the client's tier is advisory), enforces
 *     the caps (10 open proposals / 512KB field delta / 200 receipts per
 *     proposal), and drives the §7 state machine:
 *
 *       Tier 1, gates green, base_sha clean  → merged   (Tier 1 auto-merge,
 *         the operator's ruling — with the SIMULATED PR transport disclosed
 *         in the receipt + response; no corpus byte moves until Phase 3
 *         wires the real PR path and the census-guard serve, ADR §2/§9)
 *       Tier 1, gates green, base_sha stale  → draft    (+ stale_regate
 *         receipt — the re-gate-before-bind law, §8)
 *       Tier 1/2 with gate refusals          → preflight_failed
 *                                             (+ preflight_refusal receipt
 *                                             carrying the typed refusal list)
 *       Tier 2, gates green                  → queued_review (the queue
 *         itself is Phase 3 negative space — disclosed, never approved
 *         in Phase 2; G-EYES is exported by the engine for that route)
 *       Tier 3 (any shape)                   → NOT CARRIED: the typed
 *         G-SCOPE refusal is disclosed and nothing persists (ADR §6)
 *
 *   - E-0 (ADR §2): NO editor-reachable serve or merge-to-main path exists
 *     here — the pipeline's step 7 belongs to the lane machinery alone.
 *     The only writes on this plane are proposal + receipt rows.
 *
 * Write atomicity: propose runs its INSERTs inside the createSql
 * transaction seam when the adapter provides one (it does — identity/users
 * createSql); the R-TX doctrine consequence is unchanged (see
 * services/assessment/sql.ts — the driver autocommits per statement when
 * no transaction seam exists, the posture every landed lane disclosed).
 */
import { randomUUID } from "node:crypto";
import type {
  EditorCreateProposalRequest,
  EditorEditProposal,
  EditorEditReceipt,
  EditorPreflightRequest,
  EditorPreflightResponse,
  EditorProposalCreateResponse,
  EditorProposalReceipts,
} from "@syllabai/contracts";
import {
  EDITOR_FIELD_DELTA_MAX_BYTES,
  EDITOR_OPEN_PROPOSALS_MAX,
  EDITOR_PHASE2_MERGE_DISCLOSURE,
  EDITOR_RECEIPT_ROWS_PER_PROPOSAL_MAX,
  editorEditProposalSchema,
  editorEditReceiptSchema,
} from "@syllabai/contracts";
import { EDITOR_GATES_VERSION, runPreflight, type PreflightVerdict } from "@syllabai/editor-gates";
import { fetchBankInventory, fieldHash, type BankInventory } from "./banks";
import type { EditorMeView, EditorScope } from "@syllabai/contracts";
import { EDITOR_SCOPES, editorMeViewSchema } from "@syllabai/contracts";
import type { SqlFn } from "../assessment/sql";

/** The sql seam of record: the bare SqlFn plus the optional transaction
 * helper createSql provides (structural typing per the module-fence law). */
export type EditorSql = SqlFn & {
  transaction?: <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T>;
};

export interface EditorDeps {
  sql: EditorSql;
  env: Record<string, string | undefined>;
  /** the resources-HEAD provider of record (fetchBankInventory); tests
   * inject a fixed head so no test ever contacts GitHub */
  head?: (env: Record<string, string | undefined>) => Promise<BankInventory>;
}

interface EditorGrantRow {
  scopes: unknown;
}

// ── the typed plane errors (the router maps them, the service never renders) ─

export class ProposalCapError extends Error {
  constructor(
    /** the contracts error code of record */
    public readonly code: "editor_cap_open_proposals" | "editor_field_delta_too_large",
    public readonly status: 413 | 422,
    message: string,
  ) {
    super(message);
  }
}

export class Tier3RefusedError extends Error {
  constructor(public readonly verdict: PreflightVerdict) {
    super("tier 3 delta refused — the Workbench does not carry structural edits (ADR-044 §6)");
  }
}

/** A proposal whose target_path carries no course slug of record — a
 * request-shape refusal (the router renders 400 validation_failed). */
export class ProposalValidationError extends Error {}

// ── the wire mappers (defense-in-depth: the rows parse through the law) ──────

function isoOf(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

type ProposalRow = Record<string, unknown>;

/** The first DEFINED value across the row's possible key shapes (the fake
 * and the real driver can alias differently; null stays null). */
function pick(r: ProposalRow, ...keys: string[]): unknown {
  for (const k of keys) {
    if (r[k] !== undefined) return r[k];
  }
  return undefined;
}

function mapProposal(r: ProposalRow): EditorEditProposal {
  const pr = pick(r, "proposalPr", "proposal_pr");
  return editorEditProposalSchema.parse({
    id: String(r.id),
    userId: String(pick(r, "userId", "user_id")),
    courseSlug: String(pick(r, "courseSlug", "course_slug")),
    bank: String(r.bank),
    targetPath: String(pick(r, "targetPath", "target_path")),
    tier: Number(r.tier),
    fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields,
    baseSha: String(pick(r, "baseSha", "base_sha")),
    proposalPr: pr == null ? null : String(pr),
    state: String(r.state),
    createdAt: isoOf(pick(r, "createdAt", "created_at")),
    updatedAt: isoOf(pick(r, "updatedAt", "updated_at")),
  });
}

function mapReceipt(r: ProposalRow): EditorEditReceipt {
  const before = pick(r, "beforeHash", "before_hash");
  const after = pick(r, "afterHash", "after_hash");
  const gateRun = pick(r, "gateRunId", "gate_run_id");
  return editorEditReceiptSchema.parse({
    id: String(r.id),
    proposalId: String(pick(r, "proposalId", "proposal_id")),
    actor: String(r.actor),
    action: String(r.action),
    beforeHash: before == null ? null : String(before),
    afterHash: after == null ? null : String(after),
    gateRunId: gateRun == null ? null : String(gateRun),
    detail: (r.detail ?? null) as Record<string, unknown> | null,
    createdAt: isoOf(pick(r, "createdAt", "created_at")),
  });
}

const OPEN_STATES = "('draft', 'preflight_failed', 'queued_review')";

// ── the grant plane (Phase 1, unchanged) ─────────────────────────────────────
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

// ── the proposal plane (run-011) ─────────────────────────────────────────────

export interface PreflightOutcome {
  verdict: EditorPreflightResponse;
}

export function preflight(deps: EditorDeps, input: EditorPreflightRequest): PreflightOutcome {
  void deps; // stateless by law — the engine is pure; the seam exists so the
  // router has ONE editor entry point and tests drive the module, not Hono.
  const verdict = runPreflight(input);
  return { verdict };
}

/** The receipt writer of record — refuses past the 200-rows-per-proposal
 * cap (unreachable in Phase 2 — propose writes ≤2 receipts — but the cap
 * is the contracts law and the guard is the proof it binds every writer). */
async function insertReceipt(deps: EditorDeps, row: {
  proposalId: string;
  actor: string;
  action: string;
  beforeHash: string | null;
  afterHash: string | null;
  gateRunId: string | null;
  detail: Record<string, unknown> | null;
}): Promise<EditorEditReceipt> {
  const countRows = (await deps.sql`
    select count(*)::int as n from editor_edit_receipts
    where proposal_id = ${row.proposalId}
  `) as Array<{ n: number }>;
  if ((countRows[0]?.n ?? 0) >= EDITOR_RECEIPT_ROWS_PER_PROPOSAL_MAX) {
    throw new ProposalCapError(
      "editor_cap_open_proposals",
      422,
      "the proposal's receipt journal is full (200 rows) — no further receipts can bind",
    );
  }
  const rows = (await deps.sql`
    insert into editor_edit_receipts
      (id, proposal_id, actor, action, before_hash, after_hash, gate_run_id, detail)
    values (${randomUUID()}, ${row.proposalId}, ${row.actor}, ${row.action},
            ${row.beforeHash}, ${row.afterHash}, ${row.gateRunId},
            ${row.detail ? JSON.stringify(row.detail) : null}::jsonb)
    returning id, proposal_id AS "proposalId", actor, action,
              before_hash AS "beforeHash", after_hash AS "afterHash",
              gate_run_id AS "gateRunId", detail, created_at AS "createdAt"
  `) as ProposalRow[];
  const r = rows[0];
  if (!r) throw new Error("editor_edit_receipts insert returned no row");
  return mapReceipt(r);
}

export async function createProposal(
  deps: EditorDeps,
  userId: string,
  input: EditorCreateProposalRequest,
): Promise<EditorProposalCreateResponse> {
  // cap 1 of 2: the field-delta bytes cap (the WORKSPACE_DOC_MAX_BYTES
  // figure — measured on the serialized delta, before any query, the
  // workspace-docs 413 law verbatim)
  if (JSON.stringify(input.fields).length > EDITOR_FIELD_DELTA_MAX_BYTES) {
    throw new ProposalCapError(
      "editor_field_delta_too_large",
      413,
      `the field delta exceeds the ${EDITOR_FIELD_DELTA_MAX_BYTES}-byte proposal cap`,
    );
  }
  // the course of record rides the target path (validated BEFORE any
  // upstream call — a proposal without a course slug cannot exist)
  courseOf(input.targetPath);
  // cap 2 of 2: the open-proposals cap (10) — open = draft /
  // preflight_failed / queued_review; merged and rejected leave the pool
  const countRows = (await deps.sql`
    select count(*)::int as n from editor_edit_proposals
    where user_id = ${userId} and state in ${OPEN_STATES}
  `) as Array<{ n: number }>;
  if ((countRows[0]?.n ?? 0) >= EDITOR_OPEN_PROPOSALS_MAX) {
    throw new ProposalCapError(
      "editor_cap_open_proposals",
      422,
      `the account already holds ${EDITOR_OPEN_PROPOSALS_MAX} open proposals — resolve some (re-propose or wait for review) before proposing more`,
    );
  }
  return createProposalInner(deps, userId, input);
}

async function createProposalInner(
  deps: EditorDeps,
  userId: string,
  input: EditorCreateProposalRequest,
): Promise<EditorProposalCreateResponse> {
  const head: BankInventory = await (deps.head ?? fetchBankInventory)(deps.env);
  const verdict = runPreflight({
    bank: input.bank,
    targetPath: input.targetPath,
    fields: input.fields,
    baseCtx: input.baseCtx,
  });

  if (verdict.tier === 3) {
    // G-SCOPE law: a Tier 3-shaped delta is refused, not reclassified, and
    // NOTHING persists (ADR §6 — the Workbench discloses and stops)
    throw new Tier3RefusedError(verdict);
  }

  const beforeHash = fieldHash(JSON.stringify(input.fields.map((f) => f.before)));
  const afterHash = fieldHash(JSON.stringify(input.fields.map((f) => f.after)));
  const baseClean = input.baseSha === head.headSha;
  const baseShaNote = { baseSha: input.baseSha, headSha: head.headSha, headFetchedAt: head.fetchedAt };

  let state: EditorEditProposal["state"];
  let receipts: Array<Parameters<typeof insertReceipt>[1]>;
  let autoMerged = false;
  let disclosure: string;

  if (!verdict.ok) {
    state = "preflight_failed";
    disclosure =
      "the proposal is carried as preflight_failed — the typed refusal list is on the preflight_refusal receipt; fix the flagged fields and re-propose";
    receipts = [
      {
        proposalId: "",
        actor: userId,
        action: "propose",
        beforeHash,
        afterHash,
        gateRunId: EDITOR_GATES_VERSION,
        detail: { tier: verdict.tier, ...baseShaNote },
      },
      {
        proposalId: "",
        actor: userId,
        action: "preflight_refusal",
        beforeHash: null,
        afterHash: null,
        gateRunId: EDITOR_GATES_VERSION,
        detail: { refusals: verdict.refusals, warnings: verdict.warnings },
      },
    ];
  } else if (verdict.tier === 1 && baseClean) {
    // the Tier 1 auto-merge path — SIMULATED TRANSPORT, DISCLOSED (the
    // reference MVP's no-networked-commit-path law, ADR §9 carried verbatim)
    state = "merged";
    autoMerged = true;
    disclosure = EDITOR_PHASE2_MERGE_DISCLOSURE;
    receipts = [
      {
        proposalId: "",
        actor: userId,
        action: "propose",
        beforeHash,
        afterHash,
        gateRunId: EDITOR_GATES_VERSION,
        detail: { tier: 1, autoMerged: true, ...baseShaNote },
      },
      {
        proposalId: "",
        actor: userId,
        action: "merge",
        beforeHash,
        afterHash,
        gateRunId: EDITOR_GATES_VERSION,
        detail: {
          simulatedTransport: true,
          headSha: head.headSha,
          disclosure:
            "recorded as merged against the simulated transport — the real PR on syllabai-resources is Phase 3 (GitHub App); the census-guard serve stays lane-only",
        },
      },
    ];
  } else if (verdict.tier === 1 && !baseClean) {
    state = "draft";
    disclosure =
      "the proposal is carried as draft: every gate is green but the base_sha is stale — re-propose against the current corpus HEAD to take the Tier 1 auto-merge path";
    receipts = [
      {
        proposalId: "",
        actor: userId,
        action: "propose",
        beforeHash,
        afterHash,
        gateRunId: EDITOR_GATES_VERSION,
        detail: { tier: 1, ...baseShaNote },
      },
      {
        proposalId: "",
        actor: userId,
        action: "stale_regate",
        beforeHash: null,
        afterHash: null,
        gateRunId: EDITOR_GATES_VERSION,
        detail: baseShaNote,
      },
    ];
  } else {
    // Tier 2, gates green — queued for four-eyes; the queue is Phase 3
    state = "queued_review";
    disclosure =
      "the proposal is carried as queued_review (content-bearing, four-eyes territory) — the review queue ships in Phase 3; until then no approval path exists and the proposal does not advance";
    receipts = [
      {
        proposalId: "",
        actor: userId,
        action: "propose",
        beforeHash,
        afterHash,
        gateRunId: EDITOR_GATES_VERSION,
        detail: { tier: 2, queueShipsPhase3: true, stale: !baseClean, ...baseShaNote },
      },
    ];
  }

  const id = randomUUID();
  const write = async (tx: EditorSql): Promise<EditorProposalCreateResponse> => {
    const rows = (await tx`
      insert into editor_edit_proposals
        (id, user_id, course_slug, bank, target_path, tier, fields, base_sha, proposal_pr, state)
      values (${id}, ${userId}, ${courseOf(input.targetPath)},
              ${input.bank}, ${input.targetPath}, ${verdict.tier},
              ${JSON.stringify(input.fields)}::jsonb, ${input.baseSha}, null, ${state})
      returning id, user_id AS "userId", course_slug AS "courseSlug", bank,
                target_path AS "targetPath", tier, fields, base_sha AS "baseSha",
                proposal_pr AS "proposalPr", state, created_at AS "createdAt", updated_at AS "updatedAt"
    `) as ProposalRow[];
    const pr = rows[0];
    if (!pr) throw new Error("editor_edit_proposals insert returned no row");
    const proposal = mapProposal(pr);
    const written: EditorEditReceipt[] = [];
    for (const r of receipts) {
      written.push(await insertReceipt({ sql: tx, env: deps.env }, { ...r, proposalId: id }));
    }
    return { proposal, receipts: written, autoMerged, verdict, disclosure };
  };

  if (deps.sql.transaction) {
    return deps.sql.transaction(write) as Promise<EditorProposalCreateResponse>;
  }
  return write(deps.sql);
}

/** The corpus course of record from the target path (the
 * corpusBankPathOfRecord structural law, api-side mirror: the second path
 * segment IS the course slug on every SME bank path). */
function courseOf(targetPath: string): string {
  const seg = targetPath.split("/").map((s) => s.trim());
  const candidate = seg[1] ?? "";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(candidate)) {
    throw new ProposalValidationError(
      "target_path: the corpus path of record is SME-ExamQuestion/<course>/... — the second segment must be a course slug (kebab-case)",
    );
  }
  return candidate;
}

export async function listProposals(deps: EditorDeps, userId: string): Promise<EditorEditProposal[]> {
  const rows = (await deps.sql`
    select id, user_id AS "userId", course_slug AS "courseSlug", bank,
           target_path AS "targetPath", tier, fields, base_sha AS "baseSha",
           proposal_pr AS "proposalPr", state, created_at AS "createdAt", updated_at AS "updatedAt"
    from editor_edit_proposals
    where user_id = ${userId}
    order by updated_at desc
    limit 100
  `) as ProposalRow[];
  return rows.map(mapProposal);
}

export async function getProposal(deps: EditorDeps, userId: string, id: string): Promise<EditorEditProposal | null> {
  const rows = (await deps.sql`
    select id, user_id AS "userId", course_slug AS "courseSlug", bank,
           target_path AS "targetPath", tier, fields, base_sha AS "baseSha",
           proposal_pr AS "proposalPr", state, created_at AS "createdAt", updated_at AS "updatedAt"
    from editor_edit_proposals
    where user_id = ${userId} and id = ${id}
    limit 1
  `) as ProposalRow[];
  const r = rows[0];
  return r ? mapProposal(r) : null;
}

/** The audit journal — the proposal's receipts, oldest first. Ownership is
 * checked FIRST and a foreign proposal takes the honest 404 (existence is
 * never leaked across accounts — the workspace-docs honest-null law). */
export async function listReceipts(
  deps: EditorDeps,
  userId: string,
  proposalId: string,
): Promise<EditorProposalReceipts | null> {
  const proposal = await getProposal(deps, userId, proposalId);
  if (!proposal) return null;
  const rows = (await deps.sql`
    select id, proposal_id AS "proposalId", actor, action,
           before_hash AS "beforeHash", after_hash AS "afterHash",
           gate_run_id AS "gateRunId", detail, created_at AS "createdAt"
    from editor_edit_receipts
    where proposal_id = ${proposalId}
    order by created_at asc
  `) as ProposalRow[];
  return { proposal, receipts: rows.map(mapReceipt) };
}

export function buildEditorModule(sql: EditorSql, env: Record<string, string | undefined> = process.env, head?: (env: Record<string, string | undefined>) => Promise<BankInventory>) {
  const deps: EditorDeps = { sql, env, ...(head ? { head } : {}) };
  return {
    editorMe: (userId: string) => editorMe(deps, userId),
    preflight: (input: EditorPreflightRequest) => preflight(deps, input),
    createProposal: (userId: string, input: EditorCreateProposalRequest) => createProposal(deps, userId, input),
    listProposals: (userId: string) => listProposals(deps, userId),
    getProposal: (userId: string, id: string) => getProposal(deps, userId, id),
    listReceipts: (userId: string, proposalId: string) => listReceipts(deps, userId, proposalId),
    banksInventory: () => (deps.head ?? fetchBankInventory)(deps.env),
  };
}

export type EditorModule = ReturnType<typeof buildEditorModule>;
