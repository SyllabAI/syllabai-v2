/**
 * F-188 — the realtime plane's composition root: a STANDALONE long-lived
 * Bun.serve speaking Bun-native WebSocket on its own port (prereg
 * docs/F188-REALTIME-PLAN.md, R1/R2/R10).
 *
 * Why standalone of record (R1): the api's deployment of record is Vercel
 * serverless — apps/api/src/index.ts's default export is the fetch handler,
 * and a serverless function cannot hold a persistent bidirectional
 * connection. This plane is deliberately NOT imported by the Vercel entry
 * (no mount, no index.ts touch, no double-bind — that file's own warning
 * stands); it runs wherever a long-lived process lives (local:
 * `bun run dev:realtime`; the production hosting decision is the operator's,
 * disclosed in the plan).
 *
 * R2 — the upgrade reuses THE identity law of record (createJwtAuthenticator:
 * JwtService parse + the fail-closed revocation check). No socket resources
 * on failure — the Boot-shaped 401 body, same as the request plane.
 *
 * R10 — boot keeps the fail-fast env discipline (blank SYLLABAI_JWT_SECRET or
 * DATABASE_URL refuses to start; the DATABASE_URL feeds only the R2
 * revocation lookup — the state plane itself never touches the database).
 *
 * Import law (R6/Q8b): this composition root may import the identity law
 * ONLY — never drill/battle/assessment/gradebook-adjacent modules.
 */
import { createJwtAuthenticator, bootErrorBody, type AuthContext } from "../middleware/auth";
import { JwtService } from "../services/identity/jwt";
import { createSql, UsersRepository } from "../services/identity/users";
import { requireDatabaseUrl } from "@syllabai/db";
import { requireEnv } from "../env";
import { RT } from "./protocol";
import { RealtimeHub, type HubOut } from "./state";

export interface RealtimeServerDeps {
  /** The R2 authenticator of record (createJwtAuthenticator composition). */
  authenticate: (authorizationHeader: string | undefined) => Promise<AuthContext | null>;
}

export interface StartRealtimeServerOpts {
  /** Default: REALTIME_PORT env or 8081. 0 = ephemeral (the wire battery). */
  port?: number;
  /** Default 15 000; 0 disables the interval (tests sweep deterministically). */
  sweepIntervalMs?: number;
  hub?: RealtimeHub;
}

interface WsData {
  auth: AuthContext;
  connId: string | null;
}

export function startRealtimeServer(deps: RealtimeServerDeps, opts: StartRealtimeServerOpts = {}) {
  const hub = opts.hub ?? new RealtimeHub();
  const sockets = new Map<string, import("bun").ServerWebSocket<WsData>>();

  function fanOut(out: HubOut): void {
    for (const f of out.frames) {
      const target = sockets.get(f.connId);
      if (target) target.send(JSON.stringify(f.frame));
    }
    for (const c of out.close) {
      const target = sockets.get(c.connId);
      if (target) target.close(c.code, c.reason);
    }
  }

  function resolveToken(req: Request): string | undefined {
    const header = req.headers.get("Authorization");
    if (header) return header;
    // R2 — browser WebSocket clients cannot set headers; the ?bearer= query
    // is the disclosed browser-compat leg (same token, same fail-closed law).
    const q = new URL(req.url).searchParams.get("bearer");
    return q ? `Bearer ${q}` : undefined;
  }

  const port = opts.port ?? (process.env.REALTIME_PORT ? Number(process.env.REALTIME_PORT) : 8081);
  const sweepIntervalMs = opts.sweepIntervalMs ?? 15_000;

  const server = Bun.serve<WsData>({
    port,
    fetch: async (req, server) => {
      const url = new URL(req.url);
      if (url.pathname !== "/realtime") {
        return Response.json({ status: 404, error: "not_found", path: url.pathname }, { status: 404 });
      }
      const auth = await deps.authenticate(resolveToken(req));
      if (!auth) {
        return Response.json(bootErrorBody(401, url.pathname), { status: 401 });
      }
      const upgraded = server.upgrade(req, { data: { auth, connId: null } });
      if (!upgraded) {
        return Response.json({ status: 500, error: "internal_error" }, { status: 500 });
      }
      return undefined;
    },
    websocket: {
      open(ws) {
        const { connId } = hub.connect(ws.data.auth);
        ws.data.connId = connId;
        sockets.set(connId, ws);
      },
      message(ws, raw) {
        const connId = ws.data.connId;
        if (!connId) return;
        if (typeof raw !== "string") {
          // R8 — text protocol of record; binary frames are refused (1003).
          ws.send(JSON.stringify({ v: 1, type: "error", code: "binary_frame", message: "text frames only" }));
          ws.close(1003, "binary_frame");
          return;
        }
        if (Buffer.byteLength(raw, "utf8") > RT.MAX_FRAME_BYTES) {
          // R5 — the adapter's byte-accurate backstop (the hub works in chars).
          ws.send(JSON.stringify({ v: 1, type: "error", code: "too_large", message: "frame over MAX_FRAME_BYTES" }));
          ws.close(1009, "frame too large");
          return;
        }
        fanOut(hub.frame(connId, raw));
      },
      close(ws) {
        const connId = ws.data.connId;
        if (!connId) return;
        sockets.delete(connId);
        fanOut(hub.disconnect(connId));
      },
    },
  });

  const timers: ReturnType<typeof setInterval>[] = [];
  if (sweepIntervalMs > 0) {
    timers.push(setInterval(() => fanOut(hub.sweep()), sweepIntervalMs));
  }

  return {
    server,
    hub,
    port: server.port,
    stop(): void {
      for (const t of timers) clearInterval(t);
      server.stop(true);
      sockets.clear();
    },
  };
}

// Standalone boot of record (`bun run src/realtime/server.ts` / dev:realtime).
// Under `bun test` this module is imported, import.meta.main is false, and
// nothing binds a port — the same discipline as apps/api/src/index.ts.
if (import.meta.main) {
  const jwt = new JwtService(requireEnv("SYLLABAI_JWT_SECRET"));
  const users = new UsersRepository(
    createSql(requireDatabaseUrl(process.env as { DATABASE_URL?: string })),
  );
  const started = startRealtimeServer({ authenticate: createJwtAuthenticator(jwt, users) });
  console.log(
    `[realtime] F-188 plane of record listening on :${started.server.port} (path /realtime; ephemeral state posture per docs/F188-REALTIME-PLAN.md R3)`,
  );
}
