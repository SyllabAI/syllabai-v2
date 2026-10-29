/**
 * F-188 — the realtime wire battery: real Bun WebSocket clients over loopback
 * against the REAL composition root (startRealtimeServer, R1/R2/R10). The
 * deterministic law legs live in state.test.ts; this file pins the transport
 * reality — the fail-closed upgrade, the handshake on the wire, the opaque
 * byte-identity relay, and the Q7 echo p95 smoke bound.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createJwtAuthenticator, type AuthContext } from "../../src/middleware/auth";
import { JwtService } from "../../src/services/identity/jwt";
import type { UserRow } from "../../src/services/identity/users";
import { RT, type ServerFrame } from "../../src/realtime/protocol";
import { startRealtimeServer, type RealtimeServerDeps } from "../../src/realtime/server";

// Boot discipline of record (same as test/api.test.ts): env set BEFORE the
// module composition; the placeholder DATABASE_URL is never touched by the
// battery — the stub users repo below IS the revocation plane here.
process.env.SYLLABAI_JWT_SECRET ??= "unit-test-secret-0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL ??= "postgresql://placeholder.local/syllabai?sslmode=require";

const SECRET = process.env.SYLLABAI_JWT_SECRET!;
const jwt = new JwtService(SECRET);

const USERS: Record<string, Pick<UserRow, "id" | "enabled" | "tokenVersion">> = {
  "11111111-1111-4111-8111-111111111111": { id: "11111111-1111-4111-8111-111111111111", enabled: true, tokenVersion: 1 },
  "22222222-2222-4222-8222-222222222222": { id: "22222222-2222-4222-8222-222222222222", enabled: true, tokenVersion: 1 },
};
const stubUsers = { findById: async (id: string) => USERS[id] ?? null };
const depsOf = (): RealtimeServerDeps => ({ authenticate: createJwtAuthenticator(jwt, stubUsers as never) });

const tokenOf = (userId: string, email: string) => jwt.issueAccessToken({ id: userId, email, tokenVersion: 1, roles: ["STUDENT"] });
const A = { id: "11111111-1111-4111-8111-111111111111", email: "a@syllabai.test" };
const B = { id: "22222222-2222-4222-8222-222222222222", email: "b@syllabai.test" };

const A_TOKEN = tokenOf(A.id, A.email);
const B_TOKEN = tokenOf(B.id, B.email);
const A_UID = A.id;
const B_UID = B.id;

/** A small promise-flavoured ws client for the battery. */
class RtClient {
  private ws: WebSocket;
  private inbox: ServerFrame[] = [];
  private opened: Promise<void>;
  closed: Promise<{ code: number; reason: string }>;

  constructor(url: string, token?: string) {
    // Bun's WebSocket accepts a headers option (the browser API's type says
    // string|string[]; the runtime knows the options object — R2's header leg).
    const opts = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
    this.ws = new WebSocket(url, opts as string | undefined);
    this.opened = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("ws error (upgrade refused?)"));
    });
    this.closed = new Promise((resolve) => {
      this.ws.onclose = (ev: CloseEvent) => resolve({ code: ev.code, reason: ev.reason ?? "" });
    });
    this.ws.onmessage = (ev) => {
      this.inbox.push(JSON.parse(String(ev.data)) as ServerFrame);
    };
  }

  get open(): Promise<void> {
    return this.opened;
  }

  send(frame: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ v: 1, ...frame }));
  }

  raw(text: string): void {
    this.ws.send(text);
  }

  /** The next UNCONSUMED frame of the given type (order-sensitive callers
   * assert on the returned frame itself; polling keeps this deterministic). */
  async next(type?: string, timeoutMs = 2000): Promise<ServerFrame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const key = type ?? "*";
      const idx = this.consumedIdx.get(key) ?? 0;
      const pool = type ? this.inbox.filter((f) => f.type === type) : this.inbox;
      if (pool.length > idx) return this.consumed(type);
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${type ?? "any frame"}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  private consumedIdx = new Map<string, number>();
  private consumed(type?: string): ServerFrame {
    const key = type ?? "*";
    const idx = this.consumedIdx.get(key) ?? 0;
    const pool = type ? this.inbox.filter((f) => f.type === type) : this.inbox;
    const frame = pool[idx]!;
    this.consumedIdx.set(key, idx + 1);
    return frame;
  }

  async drainUntil(type: string, timeoutMs = 2000): Promise<ServerFrame> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const idx = this.consumedIdx.get(type) ?? 0;
      const pool = this.inbox.filter((f) => f.type === type);
      if (pool.length > idx) return this.consumed(type);
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`drainUntil timeout: ${type}`);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {}
  }
}

describe("F-188 realtime wire battery — the fail-closed upgrade (Q1/R2)", () => {
  test("no token → HTTP 401 Boot-shaped body, no socket", async () => {
    const rt = startRealtimeServer(depsOf(), { port: 0, sweepIntervalMs: 0 });
    try {
      const res = await fetch(`http://127.0.0.1:${rt.port}/realtime`);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { status: number; error: string; path: string };
      expect(body.error).toBe("Unauthorized");
      expect(body.path).toBe("/realtime");
    } finally {
      rt.stop();
    }
  });

  test("garbage token → 401; valid-shape token for an unknown user → 401 (fail-closed revocation)", async () => {
    const rt = startRealtimeServer(depsOf(), { port: 0, sweepIntervalMs: 0 });
    try {
      for (const token of ["garbage.token.here", tokenOf("99999999-9999-4999-8999-999999999999", "ghost@syllabai.test")]) {
        const res = await fetch(`http://127.0.0.1:${rt.port}/realtime`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(401);
      }
      expect(rt.hub.stats().conns).toBe(0);
    } finally {
      rt.stop();
    }
  });

  test("non-/realtime paths are a plain 404 (no HTTP surface beyond the upgrade, R10)", async () => {
    const rt = startRealtimeServer(depsOf(), { port: 0, sweepIntervalMs: 0 });
    try {
      const res = await fetch(`http://127.0.0.1:${rt.port}/anything-else`);
      expect(res.status).toBe(404);
    } finally {
      rt.stop();
    }
  });
});

describe("F-188 realtime wire battery — handshake, relay byte-identity, echo p95 (Q5/Q7)", () => {
  let rt: ReturnType<typeof startRealtimeServer>;
  let base: string;

  beforeAll(() => {
    rt = startRealtimeServer(depsOf(), { port: 0, sweepIntervalMs: 0 });
    base = `ws://127.0.0.1:${rt.port}/realtime`;
  });

  afterAll(() => {
    rt.stop();
  });

  test("valid upgrade → hello → welcome with the caps of record", async () => {
    const a = new RtClient(base, A_TOKEN);
    await a.open;
    a.send({ type: "hello" });
    const w = (await a.next("welcome")) as Extract<ServerFrame, { type: "welcome" }>;
    expect(w.userId).toBe(A_UID);
    expect(w.caps.protocolVersion).toBe(RT.PROTOCOL_VERSION);
    expect(w.caps.maxFrameBytes).toBe(RT.MAX_FRAME_BYTES);
    expect(rt.hub.stats().conns).toBe(1);
    a.close();
  });

  test("query-param auth (?bearer=) — the browser-compat leg of R2", async () => {
    const a = new RtClient(`${base}?bearer=${encodeURIComponent(A_TOKEN)}`);
    await a.open;
    a.send({ type: "hello" });
    const w = (await a.next("welcome")) as Extract<ServerFrame, { type: "welcome" }>;
    expect(w.userId).toBe(A_UID);
    a.close();
  });

  test("rooms on the wire: snapshot, presence, say relay byte-identical (unicode included)", async () => {
    const a = new RtClient(base, A_TOKEN);
    const b = new RtClient(base, B_TOKEN);
    await Promise.all([a.open, b.open]);
    a.send({ type: "hello" });
    b.send({ type: "hello" });
    await a.next("welcome");
    await b.next("welcome");

    a.send({ type: "room.join", room: "battle:wire" });
    const aSnap = (await a.next("presence.snapshot")) as Extract<ServerFrame, { type: "presence.snapshot" }>;
    expect(aSnap.members).toEqual([A_UID]);

    b.send({ type: "room.join", room: "battle:wire" });
    const bSnap = (await b.next("presence.snapshot")) as Extract<ServerFrame, { type: "presence.snapshot" }>;
    expect(bSnap.members).toEqual([A_UID, B_UID]);
    const aJoin = (await a.next("presence")) as Extract<ServerFrame, { type: "presence" }>;
    expect(aJoin.userId).toBe(B_UID);
    expect(aJoin.event).toBe("join");

    const PAYLOAD = "ghost-run-▸-«unicode»-𝄞-bytes-\\\"quoted\\\"";
    a.send({ type: "room.say", room: "battle:wire", payload: PAYLOAD });
    const msg = (await b.next("room.message")) as Extract<ServerFrame, { type: "room.message" }>;
    expect(msg.from).toBe(A_UID); // server-stamped on the wire
    expect(msg.payload).toBe(PAYLOAD); // byte-identity relay (R6)

    b.send({ type: "room.leave", room: "battle:wire" });
    const aLeave = (await a.next("presence")) as Extract<ServerFrame, { type: "presence" }>;
    expect(aLeave.event).toBe("leave");
    a.close();
    b.close();
  });

  test("ghost-delivery on the wire: offline store-and-forward arrives stored:true on the next hello", async () => {
    const sender = new RtClient(base, A_TOKEN);
    await sender.open;
    sender.send({ type: "hello" });
    await sender.next("welcome");
    sender.send({ type: "deliver", to: B_UID, payload: "offline-ghost-bytes" });
    const ack = (await sender.next("deliver.ack")) as Extract<ServerFrame, { type: "deliver.ack" }>;
    expect(ack.queued).toBe(true);
    sender.close();

    const b = new RtClient(base, B_TOKEN);
    await b.open;
    b.send({ type: "hello" });
    const env = (await b.drainUntil("envelope")) as Extract<ServerFrame, { type: "envelope" }>;
    expect(env.stored).toBe(true);
    expect(env.from).toBe(A_UID);
    expect(env.payload).toBe("offline-ghost-bytes");
    b.close();
  });

  test("Q7 — the echo p95 smoke bound: 200 pings, p95 well inside the 60s battle clock", async () => {
    const a = new RtClient(base, A_TOKEN);
    await a.open;
    a.send({ type: "hello" });
    await a.next("welcome");

    const rtts: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      a.send({ type: "ping", t0: i });
      const pong = (await a.next("pong")) as Extract<ServerFrame, { type: "pong" }>;
      expect(pong.t0).toBe(i); // the t0 echo is verbatim
      rtts.push(performance.now() - t0);
    }
    rtts.sort((x, y) => x - y);
    const p95 = rtts[Math.floor(rtts.length * 0.95)]!;
    const p50 = rtts[Math.floor(rtts.length * 0.5)]!;
    console.log(`[f188-wire] echo p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms (loopback, 200 pings)`);
    expect(p95).toBeLessThan(250); // the Q7 smoke bound of record
    a.close();
  });

  test("burst on the wire: the frame after the cap gets burst + close 1008", async () => {
    const a = new RtClient(base, A_TOKEN);
    const b = new RtClient(base, B_TOKEN);
    await Promise.all([a.open, b.open]);
    a.send({ type: "hello" });
    b.send({ type: "hello" });
    await a.next("welcome");
    await b.next("welcome");
    a.send({ type: "room.join", room: "battle:wireburst" });

    // hello + join occupy two slots; 28 says fill the window, the 29th bursts.
    for (let i = 0; i < RT.BURST_PER_SEC - 2; i++) {
      a.send({ type: "room.say", room: "battle:wireburst", payload: `m${i}` });
    }
    a.send({ type: "room.say", room: "battle:wireburst", payload: "over" });
    const closed = await a.closed;
    expect(closed.code).toBe(1008);
    a.close();
    b.close();
  });
});
