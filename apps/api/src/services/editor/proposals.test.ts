/**
 * Editor proposal-plane tests — ADR-044 run-011 (Phase 2, the golden path
 * of record: act as an editor → pre-flight types the gates → propose →
 * Tier 1 advances with a receipt). Drives the REAL Hono router + the REAL
 * engine over an in-memory store; the ONLY seams faked are the sql adapter
 * and the resources-HEAD provider (no test contacts GitHub).
 *
 * The E-0 negative space is asserted by test at the end: the router's
 * entire route inventory contains no serve/merge-to-main path, and the
 * only write verbs ride /preflight and /proposals (ADR §8/§11).
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { EditorCreateProposalRequest, EditorPreflightRequest } from "@syllabai/contracts";
import { EDITOR_PHASE2_MERGE_DISCLOSURE } from "@syllabai/contracts";
import { buildEditorModule, ProposalCapError, type EditorDeps, type EditorSql } from "./index";
import { BanksInventoryError, type BankInventory } from "./banks";
import { createEditorGate, getEditor } from "../../middleware/editor";
import { createAuthMiddleware, getAuth, type AuthContext } from "../../middleware/auth";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const HEAD_SHA = "cf1c8378b7ffdb581360c1e6b79bac157443c08c";

const FIXED_HEAD: BankInventory = {
  headSha: HEAD_SHA,
  fetchedAt: "2026-11-19T15:00:00.000Z",
  truncated: false,
  courses: [{ slug: "igcse-physics-19", counts: { questions: 40, notes: 12, flashcards: 30 } }],
};

// ── the in-memory store (the two editor planes + the counts the laws read) ───

interface Store {
  proposals: Map<string, Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
  /** the open-proposal count the cap law sees (seedable) */
  openExtra: number;
  /** the receipt count the per-proposal cap law sees (seedable) */
  receiptExtra: number;
  /** whether the caller holds an unrevoked editor_grants row */
  grants: boolean;
  /** every sql call this store's adapter served (per-store — no leakage) */
  calls: SqlCall[];
}

function makeStore(grants = true): Store {
  return { proposals: new Map(), receipts: [], openExtra: 0, receiptExtra: 0, grants, calls: [] };
}

type SqlCall = { text: string; params: unknown[] };

function fakeSql(store: Store): EditorSql {
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?");
    // the grant-row query (requireEditor — request-time, never token-embedded)
    if (text.includes("from editor_grants")) {
      return store.grants ? [{ scopes: ["workbench"] }] : [];
    }
    // receipt count (the per-proposal journal cap)
    if (text.includes("count(*)::int as n from editor_edit_receipts")) {
      const pid = String(params[0]);
      const n = store.receipts.filter((r) => r.proposal_id === pid).length + store.receiptExtra;
      return [{ n }];
    }
    // open-proposal count (the cap law)
    if (text.includes("count(*)::int as n from editor_edit_proposals")) {
      return [{ n: store.openExtra }];
    }
    // proposal INSERT — proposal_pr is a SQL literal null, so 9 params
    if (text.includes("insert into editor_edit_proposals")) {
      const [id, userId, courseSlug, bank, targetPath, tier, fields, baseSha, state] = params as [
        string,
        string,
        string,
        string,
        string,
        number,
        string,
        string,
        string,
      ];
      const row: Record<string, unknown> = {
        id,
        userId,
        courseSlug,
        bank,
        targetPath,
        tier,
        fields: JSON.parse(fields),
        baseSha,
        proposalPr: null,
        state,
        created_at: new Date(),
        updated_at: new Date(),
      };
      store.proposals.set(id, row);
      return [row];
    }
    // receipt INSERT
    if (text.includes("insert into editor_edit_receipts")) {
      const [id, proposalId, actor, action, beforeHash, afterHash, gateRunId, detail] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
      ];
      const row: Record<string, unknown> = {
        id,
        proposal_id: proposalId,
        actor,
        action,
        before_hash: beforeHash,
        after_hash: afterHash,
        gate_run_id: gateRunId,
        detail: detail ? JSON.parse(detail) : null,
        created_at: new Date(),
      };
      store.receipts.push(row);
      return [row];
    }
    // list proposals
    if (text.includes("from editor_edit_proposals") && text.includes("order by updated_at desc")) {
      return [...store.proposals.values()].filter((r) => r.userId === params[0]);
    }
    // get proposal (own only)
    if (text.includes("from editor_edit_proposals") && text.includes("id = ?")) {
      const r = store.proposals.get(String(params[1]));
      return r && r.userId === params[0] ? [r] : [];
    }
    // receipts journal
    if (text.includes("from editor_edit_receipts") && text.includes("order by created_at asc")) {
      return store.receipts.filter((r) => r.proposal_id === params[0]);
    }
    throw new Error(`fake sql: unmatched query: ${text.slice(0, 120)}`);
  }) as EditorSql;
  fn.transaction = async <T>(body: (tx: EditorSql) => Promise<T>): Promise<T> => body(fn as unknown as EditorSql);
  return fn;
}

const instrumented = (store: Store): EditorSql => {
  const inner = fakeSql(store);
  return ((strings: TemplateStringsArray, ...params: unknown[]) => {
    store.calls.push({ text: strings.join("?"), params });
    return inner(strings, ...params);
  }) as EditorSql;
};

// ── the app harness (the Boot shell + the grant gate + the router) ───────────

function buildApp(store: Store, opts: { user?: string } = {}) {
  const sql = instrumented(store);
  const module = buildEditorModule(sql, {}, async () => FIXED_HEAD);
  const app = new Hono();
  const user = opts.user ?? USER;
  app.use(
    "*",
    createAuthMiddleware(async (h) => {
      if (h === "Bearer valid-token") {
        return { email: "editor@example.com", userId: user, roles: [], tokenVersion: 1 } satisfies AuthContext;
      }
      return null;
    }),
  );
  app.use("*", createEditorGate(module));
  app.route("/", createEditorRouterForTests(module));
  return app;
}

// the router of record, imported from the routes module (the same builder
// production uses — this indirection exists only because createEditorRouter
// takes the module, which buildEditorRouters wires in prod)
import { createEditorRouter as createEditorRouterForTests } from "../../routes/editor";

const AUTH = { headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" } };

const T1_FIELD = { field: "parts[0].problemMd", before: "A ball rolls down a slope", after: "A ball rolls down a slope." };
const T2_FIELD = { field: "parts[0].problemMd", before: "A ball rolls down a slope", after: "A ball rolls down a ramp" };
const T3_FIELD = { field: "stem", before: "a", after: "b" };

function preflightBody(fields: unknown[], baseCtx?: Record<string, unknown>): EditorPreflightRequest {
  return {
    bank: "questions",
    targetPath: "SME-ExamQuestion/igcse-physics-19/1-forces-and-motion/questions.md",
    fields: fields as EditorPreflightRequest["fields"],
    ...(baseCtx ? { baseCtx: baseCtx as EditorPreflightRequest["baseCtx"] } : {}),
  };
}

function proposeBody(fields: unknown[], baseSha = HEAD_SHA): EditorCreateProposalRequest {
  return { ...preflightBody(fields), baseSha } as EditorCreateProposalRequest;
}

// ── the golden path: preflight → propose → Tier 1 advances with receipts ─────

describe("POST /preflight — the stateless gate run", () => {
  test("Tier 1 typography delta → ok:true, tier 1 (the golden preflight)", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/preflight", { method: "POST", ...AUTH, body: JSON.stringify(preflightBody([T1_FIELD])) });
    expect(res.status).toBe(200);
    const v = (await res.json()) as { ok: boolean; tier: number; refusals: unknown[] };
    expect(v.ok).toBe(true);
    expect(v.tier).toBe(1);
    expect(v.refusals).toEqual([]);
  });

  test("a PUA-carrying delta → 200 ok:false with G-CHAR-PUA (a verdict, not an error)", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/preflight", {
      method: "POST",
      ...AUTH,
      body: JSON.stringify(preflightBody([{ ...T1_FIELD, after: "A \uE00Fball." }])),
    });
    expect(res.status).toBe(200);
    const v = (await res.json()) as { ok: boolean; refusals: Array<{ code: string }> };
    expect(v.ok).toBe(false);
    expect(v.refusals.some((r) => r.code === "G-CHAR-PUA")).toBe(true);
  });

  test("a one-word delta classifies Tier 2 server-side (the four-eyes default)", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/preflight", { method: "POST", ...AUTH, body: JSON.stringify(preflightBody([T2_FIELD])) });
    const v = (await res.json()) as { tier: number };
    expect(v.tier).toBe(2);
  });

  test("a structural delta discloses Tier 3 and stops", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/preflight", { method: "POST", ...AUTH, body: JSON.stringify(preflightBody([T3_FIELD])) });
    const v = (await res.json()) as { ok: boolean; tier: number; disclosure: string };
    expect(v.tier).toBe(3);
    expect(v.ok).toBe(false);
    expect(v.disclosure).toContain("lane preregistration");
  });

  test("unreadable body → 400 malformed_body (the two-envelope R-1 law)", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/preflight", { method: "POST", ...AUTH, body: "not json at all" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("malformed_body");
  });

  test("missing bank → 400 validation_failed (the second envelope)", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/preflight", {
      method: "POST",
      ...AUTH,
      body: JSON.stringify({ targetPath: "x/y/questions.md", fields: [T1_FIELD] }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("validation_failed");
  });

  test("unauthenticated → the Boot 401 before anything runs", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/preflight", { method: "POST", body: JSON.stringify(preflightBody([T1_FIELD])) });
    expect(res.status).toBe(401);
  });

  test("grant-less account → the Boot 403 (fail-closed)", async () => {
    const app = buildApp(makeStore(false));
    const res = await app.request("/preflight", { method: "POST", ...AUTH, body: JSON.stringify(preflightBody([T1_FIELD])) });
    expect(res.status).toBe(403);
  });
});

describe("POST /proposals — the §7 state machine (the Tier 1 auto-merge law)", () => {
  test("Tier 1 green + clean base_sha → merged, autoMerged, SIMULATED transport disclosed", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const res = await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      proposal: { state: string; tier: number; proposalPr: string | null; courseSlug: string };
      receipts: Array<{ action: string; detail: Record<string, unknown> | null }>;
      autoMerged: boolean;
      verdict: { tier: number };
      disclosure: string;
    };
    expect(body.proposal.state).toBe("merged");
    expect(body.proposal.tier).toBe(1);
    expect(body.proposal.proposalPr).toBeNull();
    expect(body.proposal.courseSlug).toBe("igcse-physics-19");
    expect(body.autoMerged).toBe(true);
    expect(body.receipts.map((r) => r.action)).toEqual(["propose", "merge"]);
    const merge = body.receipts[1]!;
    expect(merge.detail?.["simulatedTransport"]).toBe(true);
    expect(body.disclosure).toBe(EDITOR_PHASE2_MERGE_DISCLOSURE);
    expect(body.verdict.tier).toBe(1);
  });

  test("Tier 1 green + stale base_sha → draft + the stale_regate receipt", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const res = await app.request("/proposals", {
      method: "POST",
      ...AUTH,
      body: JSON.stringify(proposeBody([T1_FIELD], "aaaaaaaaaaa")),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { proposal: { state: string }; receipts: Array<{ action: string; detail: Record<string, unknown> | null }> };
    expect(body.proposal.state).toBe("draft");
    expect(body.receipts.map((r) => r.action)).toEqual(["propose", "stale_regate"]);
    expect(body.receipts[1]!.detail?.["baseSha"]).toBe("aaaaaaaaaaa");
    expect(body.receipts[1]!.detail?.["headSha"]).toBe(HEAD_SHA);
  });

  test("Tier 1 with gate refusals → preflight_failed + the typed refusal receipt", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const bad = { field: "parts[0].problemMd", before: "A ball", after: "A \uE00Fball" };
    const res = await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([bad])) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { proposal: { state: string }; receipts: Array<{ action: string; detail: Record<string, unknown> | null }> };
    expect(body.proposal.state).toBe("preflight_failed");
    const refusalReceipt = body.receipts.find((r) => r.action === "preflight_refusal");
    expect(refusalReceipt).toBeTruthy();
    expect((refusalReceipt!.detail?.["refusals"] as Array<{ code: string }>).some((r) => r.code === "G-CHAR-PUA")).toBe(true);
  });

  test("Tier 2 green → queued_review, disclosed as Phase 3 negative space", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const res = await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T2_FIELD])) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { proposal: { state: string }; autoMerged: boolean; disclosure: string };
    expect(body.proposal.state).toBe("queued_review");
    expect(body.autoMerged).toBe(false);
    expect(body.disclosure).toContain("Phase 3");
  });

  test("Tier 3 → 422 editor_tier3_refused and NOTHING persists (the G-SCOPE law)", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const res = await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T3_FIELD])) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; verdict: { tier: number } };
    expect(body.error).toBe("editor_tier3_refused");
    expect(body.verdict.tier).toBe(3);
    expect(store.proposals.size).toBe(0);
    expect(store.receipts.length).toBe(0);
  });

  test("the open-proposals cap (10) refuses with editor_cap_open_proposals", async () => {
    const store = makeStore();
    store.openExtra = 10;
    const app = buildApp(store);
    const res = await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("editor_cap_open_proposals");
  });

  test("the field-delta bytes cap (512KB) refuses with 413 editor_field_delta_too_large", async () => {
    const store = makeStore();
    const app = buildApp(store);
    // three ~200KB fields: each under the per-field zod max, total over the
    // proposal cap — the measured-bytes law (the workspace-docs 413 class)
    const chunk = "x".repeat(200 * 1024);
    const res = await app.request("/proposals", {
      method: "POST",
      ...AUTH,
      body: JSON.stringify(
        proposeBody([
          { field: "parts[0].problemMd", before: "a", after: chunk },
          { field: "parts[0].solutionMd", before: "b", after: chunk },
          { field: "parts[1].problemMd", before: "c", after: chunk },
        ]),
      ),
    });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("editor_field_delta_too_large");
  });

  test("a target_path without a course slug of record → 400 validation_failed", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const res = await app.request("/proposals", {
      method: "POST",
      ...AUTH,
      body: JSON.stringify({ ...proposeBody([T1_FIELD]), targetPath: "no-course-here.md" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("validation_failed");
  });

  test("an upstream (HEAD) failure → 502 rate_limited, nothing persists", async () => {
    const sql = instrumented(makeStore());
    const module = buildEditorModule(sql, {}, async () => {
      throw new BanksInventoryError("rate_limited", "the GitHub REST ceiling is exhausted for this instance");
    });
    const app = new Hono();
    app.use("*", createAuthMiddleware(async (h) => (
      h === "Bearer valid-token"
        ? { email: "editor@example.com", userId: USER, roles: [], tokenVersion: 1 }
        : null
    )));
    app.use("*", createEditorGate(module));
    app.route("/", createEditorRouterForTests(module));
    const res = await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("rate_limited");
  });

  test("the receipts journal cap guard binds (200 rows)", async () => {
    const store = makeStore();
    store.receiptExtra = 200;
    const app = buildApp(store);
    const res = await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toContain("journal is full");
  });
});

describe("GET /proposals(/:id)(/receipts) — the journal plane (own only)", () => {
  test("the journal lists the caller's own proposals, newest first", async () => {
    const store = makeStore();
    const app = buildApp(store);
    await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) });
    await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T2_FIELD])) });
    const res = await app.request("/proposals", AUTH);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { proposals: Array<{ state: string; tier: number }> };
    expect(body.proposals).toHaveLength(2);
    expect(body.proposals.map((p) => p.state).sort()).toEqual(["merged", "queued_review"]);
  });

  test("a foreign proposal id takes the honest 404 (existence never leaks)", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const created = (await (
      await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) })
    ).json()) as { proposal: { id: string } };
    const otherApp = buildApp(makeStore(), { user: OTHER });
    const res = await otherApp.request(`/proposals/${created.proposal.id}`, AUTH);
    expect(res.status).toBe(404);
    const res2 = await otherApp.request(`/proposals/${created.proposal.id}/receipts`, AUTH);
    expect(res2.status).toBe(404);
  });

  test("the receipts journal renders propose → merge in order with hashes", async () => {
    const store = makeStore();
    const app = buildApp(store);
    const created = (await (
      await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) })
    ).json()) as { proposal: { id: string } };
    const res = await app.request(`/proposals/${created.proposal.id}/receipts`, AUTH);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      proposal: { id: string };
      receipts: Array<{ action: string; beforeHash: string | null; afterHash: string | null; gateRunId: string | null }>;
    };
    expect(body.proposal.id).toBe(created.proposal.id);
    expect(body.receipts.map((r) => r.action)).toEqual(["propose", "merge"]);
    expect(body.receipts[0]!.beforeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.receipts[1]!.gateRunId).toContain("editor-gates@");
  });
});

describe("GET /banks — the corpus inventory of record", () => {
  test("200 with the live-head shape (courses × counts)", async () => {
    const app = buildApp(makeStore());
    const res = await app.request("/banks", AUTH);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { headSha: string; courses: Array<{ slug: string; counts: { questions: number } }> };
    expect(body.headSha).toBe(HEAD_SHA);
    expect(body.courses[0]?.slug).toBe("igcse-physics-19");
    expect(body.courses[0]?.counts.questions).toBe(40);
  });

  test("an upstream failure → 502 rate_limited (typed, never masked)", async () => {
    const sql = instrumented(makeStore());
    const module = buildEditorModule(sql, {}, async () => {
      throw new BanksInventoryError("rate_limited", "the GitHub REST ceiling is exhausted for this instance");
    });
    const app = new Hono();
    app.use("*", createAuthMiddleware(async (h) => (
      h === "Bearer valid-token"
        ? { email: "editor@example.com", userId: USER, roles: [], tokenVersion: 1 }
        : null
    )));
    app.use("*", createEditorGate(module));
    app.route("/", createEditorRouterForTests(module));
    const res = await app.request("/banks", AUTH);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("rate_limited");
  });
});

// ── the E-0 negative space (asserted by test, not by comment — ADR §11) ──────

describe("E-0: the route inventory is the negative space (ADR §8/§11)", () => {
  test("no editor-reachable serve/merge-to-main route exists in ANY phase", () => {
    const module = buildEditorModule(fakeSql(makeStore()), {}, async () => FIXED_HEAD);
    const app = createEditorRouterForTests(module);
    const routes = app.routes.map((r) => ({ method: r.method, path: r.path }));
    for (const r of routes) {
      const joined = `${r.method} ${r.path}`.toLowerCase();
      expect(joined).not.toContain("serve");
      expect(joined).not.toContain("mergetomain");
      expect(joined).not.toContain("corpus");
    }
    // the only write verbs ride /preflight and /proposals
    const writes = routes.filter((r) => r.method === "POST" || r.method === "PUT" || r.method === "DELETE");
    expect(writes.map((w) => w.path).sort()).toEqual(["/preflight", "/proposals"]);
  });

  test("propose writes exactly one proposal row + its receipt rows (the append-only plane)", async () => {
    const store = makeStore();
    const app = buildApp(store);
    await app.request("/proposals", { method: "POST", ...AUTH, body: JSON.stringify(proposeBody([T1_FIELD])) });
    const proposalInserts = store.calls.filter((c) => c.text.includes("insert into editor_edit_proposals")).length;
    const receiptInserts = store.calls.filter((c) => c.text.includes("insert into editor_edit_receipts")).length;
    const updates = store.calls.filter((c) => c.text.includes("update editor_edit_")).length;
    expect(proposalInserts).toBe(1);
    expect(receiptInserts).toBe(2);
    expect(updates).toBe(0); // receipts are append-only: no UPDATE exists on the plane
  });
});
