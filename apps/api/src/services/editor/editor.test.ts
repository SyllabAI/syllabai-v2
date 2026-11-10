/**
 * Editor plane tests — ADR-044 run-002 Phase 1. The grant-row law (ADR §3)
 * exercised at both layers: the service (editorMe — active grant / revoked
 * grant / no grant / fail-closed drifted scopes) and the requireEditor
 * gate composition through a real Hono app (401 → 403 → 200, the Boot
 * bodies verbatim, scopes carried for handlers).
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { EditorMeView } from "@syllabai/contracts";
import { editorMe, buildEditorModule, type EditorDeps } from "./index";
import { createEditorGate, getEditor } from "../../middleware/editor";
import {
  createAuthMiddleware,
  getAuth,
  type AuthContext,
} from "../../middleware/auth";

// ── the fake grant store ─────────────────────────────────────────────────────

const USER = "11111111-1111-1111-1111-111111111111";

interface GrantRow {
  scopes: unknown;
  revoked_at: string | null;
}

function fakeSql(grants: GrantRow[]) {
  // the service query filters revoked_at IS NULL in SQL; the fake mirrors
  // that filter so the test exercises the same visible behavior
  return ((async () => {
    return grants
      .filter((g) => g.revoked_at === null)
      .map((g) => ({ scopes: g.scopes }));
  })) as unknown as EditorDeps["sql"];
}

// ── service law (editorMe) ───────────────────────────────────────────────────

describe("editorMe (the grant-row law, ADR-044 §3)", () => {
  test("possession of an unrevoked row IS the role — view with scopes", async () => {
    const deps = { sql: fakeSql([{ scopes: ["workbench"], revoked_at: null }]) };
    const view = await editorMe(deps, USER);
    expect(view).not.toBeNull();
    expect(view!.editor).toBe(true);
    expect(view!.scopes).toEqual(["workbench"]);
  });

  test("no grant row → null (the caller renders the Boot 403)", async () => {
    const deps = { sql: fakeSql([]) };
    expect(await editorMe(deps, USER)).toBeNull();
  });

  test("a revoked grant does not surface (revoked_at filter)", async () => {
    const deps = { sql: fakeSql([{ scopes: ["workbench"], revoked_at: "2026-11-01T00:00:00Z" }]) };
    expect(await editorMe(deps, USER)).toBeNull();
  });

  test("fail-closed: a drifted scope degrades to null, never a 500", async () => {
    for (const scopes of [["admin"], ["workbench", "admin"], ["nope"], [42], "workbench"]) {
      const deps = { sql: fakeSql([{ scopes, revoked_at: null }]) };
      expect(await editorMe(deps, USER)).toBeNull();
    }
  });
});

// ── gate composition (requireEditor through a real Hono app) ─────────────────

function buildApp(grants: GrantRow[]) {
  const module = buildEditorModule(fakeSql(grants));
  const app = new Hono();
  app.use(
    "*",
    createAuthMiddleware(async (h) => {
      if (h === "Bearer valid-token") {
        return {
          email: "editor@example.com",
          userId: USER,
          roles: [],
          tokenVersion: 1,
        } satisfies AuthContext;
      }
      return null;
    }),
  );
  app.use("*", createEditorGate(module));
  app.get("/probe", (c) => {
    const editor = getEditor(c);
    const auth = getAuth(c)!;
    return c.json({ scopes: editor?.scopes ?? null, email: auth.email }, 200);
  });
  return app;
}

describe("requireEditor gate composition (ADR-044 §3, the Boot bodies verbatim)", () => {
  // the Boot body carries a timestamp — compare the law fields, not the clock
  const expectBootBody = async (res: Response, status: 401 | 403) => {
    expect(res.status).toBe(status);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe(status === 401 ? "Unauthorized" : "Forbidden");
    expect(body.status).toBe(status);
    expect(body.path).toBe("/probe");
    expect(typeof body.timestamp).toBe("string");
    return body;
  };

  test("unauthenticated → the Boot 401 before anything else runs", async () => {
    const res = await buildApp([{ scopes: ["workbench"], revoked_at: null }]).request("/probe");
    await expectBootBody(res, 401);
  });

  test("authenticated grant-less account → the Boot 403", async () => {
    const res = await buildApp([]).request("/probe", {
      headers: { Authorization: "Bearer valid-token" },
    });
    await expectBootBody(res, 403);
  });

  test("grant holder proceeds — 200 with scopes carried for handlers", async () => {
    const res = await buildApp([{ scopes: ["workbench"], revoked_at: null }]).request("/probe", {
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scopes: string[]; email: string };
    expect(body.scopes).toEqual(["workbench"]);
    expect(body.email).toBe("editor@example.com");
  });

  test("revocation is effective on the next request (request-time check)", async () => {
    // same app, but the grant row is revoked — the very request that used
    // to pass now takes the 403 without any token-version bump
    const res = await buildApp([{ scopes: ["workbench"], revoked_at: "2026-11-09T00:00:00Z" }]).request(
      "/probe",
      { headers: { Authorization: "Bearer valid-token" } },
    );
    await expectBootBody(res, 403);
  });

  test("the gate carries a full EditorMeView (not a bare truthy flag)", async () => {
    const module = buildEditorModule(fakeSql([{ scopes: ["workbench"], revoked_at: null }]));
    const view: EditorMeView | null = await module.editorMe(USER);
    expect(view).toEqual({ editor: true, scopes: ["workbench"] });
  });
});
