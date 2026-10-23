/**
 * F-188 — the realtime state battery (prereg docs/F188-REALTIME-PLAN.md,
 * laws R1..R10, battery Q1..Q10): the in-process law pins over the REAL
 * RealtimeHub with the injected clock (Q10) — no sockets, no database, no
 * wall-clock. The loopback transport legs live in wire.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RT, type ServerFrame } from "../../src/realtime/protocol";
import { RealtimeHub, type HubOut } from "../../src/realtime/state";

// Q10 — the frozen clock of record: every hub in this battery ticks ONLY when
// the battery advances it. No wall-clock read can flake a stamp or a sweep.
let NOW_MS = Date.parse("2026-10-24T00:00:00Z");
const clock = () => new Date(NOW_MS);
const tick = (ms: number) => {
  NOW_MS += ms;
};

const newHub = () => new RealtimeHub({ now: clock });

const USERS = ["u1", "u2", "u3", "u4"];
const authOf = (id: string) => ({ userId: id, email: `${id}@syllabai.test`, roles: ["STUDENT"] as const });

/** Connect + hello, returning the connId; frames collected by the caller. */
function connect(hub: RealtimeHub, userId: string): string {
  const { connId } = hub.connect(authOf(userId));
  hub.frame(connId, JSON.stringify({ v: 1, type: "hello" }));
  return connId;
}

const framesOf = (out: HubOut): ServerFrame[] => out.frames.map((f) => f.frame);
const typesOf = (out: HubOut): string[] => framesOf(out).map((f) => f.type);
const closeOf = (out: HubOut) => out.close;
const send = (hub: RealtimeHub, connId: string, frame: Record<string, unknown>): HubOut =>
  hub.frame(connId, JSON.stringify({ v: 1, ...frame }));

// ---------------------------------------------------------------- Q1 — the handshake law

describe("F-188 realtime battery — Q1 handshake law (R2/R8)", () => {
  test("hello first → welcome with the caps of record and the injected clock stamp", () => {
    const hub = newHub();
    const { connId } = hub.connect(authOf("u1"));
    const out = hub.frame(connId, JSON.stringify({ v: 1, type: "hello" }));
    expect(typesOf(out)).toEqual(["welcome"]);
    const w = framesOf(out)[0] as Extract<ServerFrame, { type: "welcome" }>;
    expect(w.connId).toBe(connId);
    expect(w.userId).toBe("u1");
    expect(w.serverTime).toBe(clock().toISOString());
    expect(w.caps.protocolVersion).toBe(RT.PROTOCOL_VERSION);
    expect(w.caps.roomCap).toBe(RT.ROOM_CAP);
    expect(w.caps.envelopeTtlMs).toBe(RT.ENVELOPE_TTL_MS);
    expect(w.online).toBe(1);
  });

  test("any frame before hello is refused fail-closed (close 1008 handshake_required)", () => {
    const hub = newHub();
    const { connId } = hub.connect(authOf("u1"));
    const out = send(hub, connId, { type: "room.join", room: "r" });
    expect(typesOf(out)).toEqual(["error"]);
    expect(closeOf(out)).toEqual([{ connId, code: 1008, reason: "handshake_required" }]);
    // the refusal is enforced even when the payload would sniff as innocent
    const hub2 = newHub();
    const c2 = connect(hub2, "u1");
    const hub3 = newHub();
    const { connId: c3 } = hub3.connect(authOf("u1"));
    const sneaky = send(hub3, c3, { type: "room.say", room: "r", payload: 'please say hello first' });
    expect(closeOf(sneaky)).toEqual([{ connId: c3, code: 1008, reason: "handshake_required" }]);
    expect(c2).toBeDefined();
  });

  test("hello twice → error already_hello, connection stays", () => {
    const hub = newHub();
    const connId = connect(hub, "u1");
    const out = send(hub, connId, { type: "hello" });
    expect(framesOf(out).map((f) => (f as { code: string }).code)).toEqual(["already_hello"]);
    expect(closeOf(out)).toEqual([]);
  });

  test("unknown version closes 1002; malformed JSON closes 1002; unknown type stays with a named code", () => {
    const hub = newHub();
    const { connId } = hub.connect(authOf("u1"));
    expect(closeOf(hub.frame(connId, JSON.stringify({ v: 2, type: "hello" }))).map((c) => c.code)).toEqual([1002]);

    const hub2 = newHub();
    const c2 = connect(hub2, "u1");
    expect(closeOf(hub2.frame(c2, "{not json")).map((c) => c.code)).toEqual([1002]);

    const hub3 = newHub();
    const c3 = connect(hub3, "u1");
    const out = hub3.frame(c3, JSON.stringify({ v: 1, type: "room.braid", room: "r" }));
    expect(framesOf(out).map((f) => (f as { code: string }).code)).toEqual(["unknown_type"]);
    expect(closeOf(out)).toEqual([]);
    expect(hub3.stats().conns).toBe(1);
  });
});

// ---------------------------------------------------------------- Q2 — the presence law

describe("F-188 realtime battery — Q2 presence law (R6/R7)", () => {
  test("join → snapshot to joiner + join event to the others; disconnect → leave event", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const b = connect(hub, "u2");

    const aOut = send(hub, a, { type: "room.join", room: "battle:r1" });
    expect(typesOf(aOut)).toEqual(["presence.snapshot"]);
    const snap = framesOf(aOut)[0] as Extract<ServerFrame, { type: "presence.snapshot" }>;
    expect(snap).toEqual({ v: 1, type: "presence.snapshot", room: "battle:r1", members: ["u1"], at: clock().toISOString() });

    const bOut = send(hub, b, { type: "room.join", room: "battle:r1" });
    // b gets the snapshot; a (the earlier member) gets the join event —
    // one join fans exactly two frames, each addressed to exactly one peer
    expect(bOut.frames).toHaveLength(2);
    expect(bOut.frames[0]).toEqual({
      connId: b,
      frame: { v: 1, type: "presence.snapshot", room: "battle:r1", members: ["u1", "u2"], at: clock().toISOString() },
    });
    expect(bOut.frames[1]!.connId).toBe(a);
    expect(bOut.frames[1]!.frame).toEqual({
      v: 1, type: "presence", room: "battle:r1", userId: "u2", event: "join", online: 2, at: clock().toISOString(),
    });
    // u1 hears u2's join — and NOTHING else rides the presence frame (R6)
    const aHears = hub.disconnect(b);
    const leaveFrames = framesOf(aHears).filter((f) => f.type === "presence");
    expect(leaveFrames).toEqual([
      { v: 1, type: "presence", room: "battle:r1", userId: "u2", event: "leave", online: 1, at: clock().toISOString() },
    ]);
  });

  test("the sweep reaps a stale connection and fans honest leave events (R7)", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const b = connect(hub, "u2");
    send(hub, a, { type: "room.join", room: "battle:r1" });
    send(hub, b, { type: "room.join", room: "battle:r1" });

    tick(RT.STALE_MS + 1);
    const out = hub.sweep();
    expect(out.close.map((c) => ({ id: c.connId, code: c.code, reason: c.reason }))).toEqual([
      { id: a, code: 1000, reason: "stale" },
      { id: b, code: 1000, reason: "stale" },
    ]);
    // both conns are gone; disconnect is idempotent (sweep + adapter close both land)
    expect(hub.disconnect(a)).toEqual({ frames: [], close: [] });
    expect(hub.stats()).toEqual({ conns: 0, rooms: 0, queues: 0, pending: 0 });
  });

  test("a connection silent-but-inside STALE_MS survives; the hello window reaps un-hello'd conns", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    tick(RT.STALE_MS - 1000);
    expect(hub.sweep().close).toEqual([]);
    const hub2 = newHub();
    const c2 = hub2.connect(authOf("u1")).connId; // never hellos
    tick(RT.HELLO_WINDOW_MS + 1);
    const out = hub2.sweep();
    expect(out.close).toEqual([{ connId: c2, code: 1008, reason: "hello window" }]);
    expect(a).toBeDefined();
  });
});

// ---------------------------------------------------------------- Q3 — the room law

describe("F-188 realtime battery — Q3 room law (R4/R5)", () => {
  test("say fans to the roommates, sender excluded by default; excludeSelf:false echoes too", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const b = connect(hub, "u2");
    send(hub, a, { type: "room.join", room: "battle:r1" });
    send(hub, b, { type: "room.join", room: "battle:r1" });

    const out = send(hub, a, { type: "room.say", room: "battle:r1", payload: "move-1-bytes" });
    expect(typesOf(out)).toEqual(["room.message"]);
    const msg = framesOf(out)[0] as Extract<ServerFrame, { type: "room.message" }>;
    expect(msg.from).toBe("u1"); // SERVER-stamped, never client-claimed
    expect(msg.payload).toBe("move-1-bytes");
    expect(out.frames.every((f) => f.connId === b)).toBe(true); // sender excluded

    const echo = send(hub, a, { type: "room.say", room: "battle:r1", payload: "echo-me", excludeSelf: false });
    expect(echo.frames.map((f) => f.connId).sort()).toEqual([a, b].sort());
  });

  test("a non-member say is refused; the cap of record holds; the empty room is reaped", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const outsider = connect(hub, "u2");
    send(hub, a, { type: "room.join", room: "battle:r1" });
    const refused = send(hub, outsider, { type: "room.say", room: "battle:r1", payload: "x" });
    expect(framesOf(refused).map((f) => (f as { code: string }).code)).toEqual(["not_member"]);

    const room = "battle:cap";
    const conns: string[] = [];
    for (let i = 0; i < RT.ROOM_CAP; i++) {
      const c = connect(hub, `u${i}`);
      conns.push(c);
      const out = send(hub, c, { type: "room.join", room });
      expect(framesOf(out).every((f) => f.type === "presence.snapshot" || f.type === "presence")).toBe(true);
    }
    const over = connect(hub, "over");
    const full = send(hub, over, { type: "room.join", room });
    expect(framesOf(full).map((f) => (f as { code: string }).code)).toEqual(["room_full"]);

    for (const c of conns) hub.disconnect(c);
    // only the earlier battle:r1 (a's room) remains — the cap room reaped itself
    expect(hub.stats().rooms).toBe(1);
    expect(closeOf(hub.frame(over, JSON.stringify({ v: 1, type: "ping" })))).toEqual([]);
  });

  test("room ids are length-capped (R5 MAX_ID_CHARS)", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const long = "r".repeat(RT.MAX_ID_CHARS + 1);
    const out = hub.frame(a, JSON.stringify({ v: 1, type: "room.join", room: long }));
    expect(framesOf(out).map((f) => (f as { code: string }).code)).toEqual(["bad_frame"]);
  });
});

// ---------------------------------------------------------------- Q4 — the queue law

describe("F-188 realtime battery — Q4 queue law (R4: a dumb FIFO that never decides)", () => {
  test("FIFO order preserved; take(n) returns the n oldest atomically and caps at depth", () => {
    const hub = newHub();
    const ids = ["u1", "u2", "u3", "u4"];
    const conns = ids.map((u) => connect(hub, u));
    for (const c of conns) send(hub, c, { type: "queue.join", queue: "mm:chem-1C" });

    const taker = connect(hub, "u5");
    const out = send(hub, taker, { type: "queue.take", queue: "mm:chem-1C", n: 2 });
    expect(typesOf(out)).toEqual(["queue.taken", "queue.left", "queue.left"]);
    const taken = framesOf(out)[0] as Extract<ServerFrame, { type: "queue.taken" }>;
    expect(taken.users).toEqual(["u1", "u2"]); // FIFO, atomically
    const lefts = framesOf(out).slice(1) as Extract<ServerFrame, { type: "queue.left" }>[];
    expect(lefts.every((f) => f.reason === "taken")).toBe(true);
    expect(lefts.map((f) => f.queue)).toEqual(["mm:chem-1C", "mm:chem-1C"]);
    // the two taken conns are the recipients of the two queue.left frames
    expect(out.frames.slice(1).map((f) => f.connId)).toEqual([conns[0]!, conns[1]!]);

    const over = send(hub, taker, { type: "queue.take", queue: "mm:chem-1C", n: 99 });
    const taken2 = framesOf(over)[0] as Extract<ServerFrame, { type: "queue.taken" }>;
    expect(taken2.users).toEqual(["u3", "u4"]); // capped at depth
    expect(hub.stats().queues).toBe(0); // drained queue reaped
  });

  test("duplicate join refused; unknown queue take refused; QUEUE_CAP holds", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    send(hub, a, { type: "queue.join", queue: "q" });
    expect(framesOf(send(hub, a, { type: "queue.join", queue: "q" })).map((f) => (f as { code: string }).code)).toEqual(["already_queued"]);
    expect(framesOf(send(hub, a, { type: "queue.take", queue: "nope", n: 1 })).map((f) => (f as { code: string }).code)).toEqual(["unknown_queue"]);

    const conns = [a];
    for (let i = 1; i < RT.QUEUE_CAP; i++) {
      const c = connect(hub, `u${i}`);
      conns.push(c);
      send(hub, c, { type: "queue.join", queue: "q" });
    }
    const over = connect(hub, "over");
    expect(framesOf(send(hub, over, { type: "queue.join", queue: "q" })).map((f) => (f as { code: string }).code)).toEqual(["queue_full"]);
    expect(hub.stats().queues).toBe(1);
  });
});

// ---------------------------------------------------------------- Q5 — the ghost-delivery law

describe("F-188 realtime battery — Q5 ghost-delivery law (R3/R5: best-effort, TTL, capped)", () => {
  test("online target → immediate envelope (stored:false) + ack(queued:false)", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const b = connect(hub, "u2");
    const out = send(hub, a, { type: "deliver", to: "u2", payload: "ghost-run-bytes" });
    expect(typesOf(out)).toEqual(["envelope", "deliver.ack"]);
    const env = framesOf(out)[0] as Extract<ServerFrame, { type: "envelope" }>;
    expect(env.from).toBe("u1"); // server-stamped
    expect(env.payload).toBe("ghost-run-bytes");
    expect(env.stored).toBe(false);
    expect(out.frames[0]!.connId).toBe(b);
    const ack = framesOf(out)[1] as Extract<ServerFrame, { type: "deliver.ack" }>;
    expect(ack.queued).toBe(false);
    expect(out.frames[1]!.connId).toBe(a);
  });

  test("offline target → ack(queued:true), delivered on the next hello as stored:true; byte-identity holds", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const ghost = "ghost-run-▸-«unicode»-bytes-𝄞";
    const ackOut = send(hub, a, { type: "deliver", to: "u9-offline", payload: ghost });
    const ack = framesOf(ackOut)[0] as Extract<ServerFrame, { type: "deliver.ack" }>;
    expect(ack.queued).toBe(true);
    expect(hub.stats().pending).toBe(1);

    const b = hub.connect(authOf("u9-offline")).connId;
    const out = hub.frame(b, JSON.stringify({ v: 1, type: "hello" }));
    expect(typesOf(out)).toEqual(["welcome", "envelope"]);
    const env = framesOf(out)[1] as Extract<ServerFrame, { type: "envelope" }>;
    expect(env.stored).toBe(true);
    expect(env.from).toBe("u1");
    // Q5 — the byte-identity law: what went in is what comes out
    expect(env.payload).toBe(ghost);
    expect(hub.stats().pending).toBe(0);
  });

  test("the sweep expires envelopes past their TTL (R5, deterministic under the injected clock)", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    send(hub, a, { type: "deliver", to: "u9-offline", payload: "will-expire" });
    tick(RT.ENVELOPE_TTL_MS + 1);
    hub.sweep();
    expect(hub.stats().pending).toBe(0);
    const b = hub.connect(authOf("u9-offline")).connId;
    const out = hub.frame(b, JSON.stringify({ v: 1, type: "hello" }));
    expect(typesOf(out)).toEqual(["welcome"]); // nothing stale rides the flush
  });

  test("PENDING_PER_TARGET evicts the oldest (R5, disclosed)", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    for (let i = 0; i <= RT.PENDING_PER_TARGET; i++) {
      if (i % 20 === 0) tick(1000); // keep the burst window clear — this leg pins the PENDING cap, not Q9
      send(hub, a, { type: "deliver", to: "u9-offline", payload: `env-${i}` });
    }
    expect(hub.stats().pending).toBe(RT.PENDING_PER_TARGET);
    const b = hub.connect(authOf("u9-offline")).connId;
    const out = hub.frame(b, JSON.stringify({ v: 1, type: "hello" }));
    const envelopes = framesOf(out).filter((f) => f.type === "envelope") as Extract<ServerFrame, { type: "envelope" }>[];
    expect(envelopes.length).toBe(RT.PENDING_PER_TARGET);
    expect(envelopes[0]!.payload).toBe("env-1"); // env-0 evicted
  });

  test("the envelope cap of record is observable as too_large (the frame stays)", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const out = send(hub, a, { type: "deliver", to: "u2", payload: "x".repeat(RT.ENVELOPE_BYTES + 1) });
    expect(framesOf(out).map((f) => (f as { code: string }).code)).toEqual(["too_large"]);
    expect(closeOf(out)).toEqual([]);
    expect(hub.stats().conns).toBe(1);
  });
});

// ---------------------------------------------------------------- Q6 — stability under load

describe("F-188 realtime battery — Q6 stability under load (R5 caps, zero cross-talk)", () => {
  test("500 conns in 125 rooms of 4: every roommate gets exactly one message, nobody else anything", () => {
    const hub = newHub();
    const roomOf = new Map<string, string>();
    const connsByRoom = new Map<string, string[]>();
    for (let i = 0; i < 500; i++) {
      const userId = `load-${i}`;
      const room = `battle:load-${Math.floor(i / 4)}`;
      const c = connect(hub, userId);
      roomOf.set(c, room);
      send(hub, c, { type: "room.join", room });
      connsByRoom.set(room, [...(connsByRoom.get(room) ?? []), c]);
    }
    expect(hub.stats().rooms).toBe(125);
    expect(hub.stats().conns).toBe(500);

    let messages = 0;
    for (const [room, conns] of connsByRoom) {
      for (const c of conns) {
        const out = send(hub, c, { type: "room.say", room, payload: `move-from-${c.slice(0, 8)}` });
        // exactly the 3 roommates, never the sender, never a foreign room
        expect(out.frames.length).toBe(3);
        const targets = out.frames.map((f) => f.connId);
        for (const t of targets) {
          expect(targets.filter((x) => x === t).length).toBe(1);
          expect(conns).toContain(t);
          expect(t).not.toBe(c);
        }
        for (const f of out.frames) {
          const msg = f.frame as Extract<ServerFrame, { type: "room.message" }>;
          expect(msg.room).toBe(room);
        }
        messages += out.frames.length;
      }
    }
    expect(messages).toBe(500 * 3);
    expect(hub.stats().conns).toBe(500);
  });

  test("FIFO order exact under interleaved queue load (100 joins, 10 takes of 10)", () => {
    const hub = newHub();
    const queued: string[] = [];
    for (let i = 0; i < 100; i++) {
      const c = connect(hub, `q-${i}`);
      queued.push(`q-${i}`);
      send(hub, c, { type: "queue.join", queue: "mm:load" });
    }
    const taker = connect(hub, "taker");
    const drained: string[] = [];
    for (let k = 0; k < 10; k++) {
      const out = send(hub, taker, { type: "queue.take", queue: "mm:load", n: 10 });
      const taken = framesOf(out)[0] as Extract<ServerFrame, { type: "queue.taken" }>;
      expect(taken.users.length).toBe(10);
      drained.push(...taken.users);
    }
    expect(drained).toEqual(queued); // FIFO holds end to end
    expect(hub.stats().queues).toBe(0);
  });
});

// ---------------------------------------------------------------- Q8 — the leakage census

describe("F-188 realtime battery — Q8 leakage census (R6: opaque payloads, whitelisted metadata)", () => {
  const FORBIDDEN = [
    "score", "scores", "marks", "marksAwarded", "marksPossible", "correct",
    "isCorrect", "answer", "answers", "evidence", "progress", "mastery",
    "posterior", "misconception", "settlement", "grade", "gradebook",
    "strength", "decay", "drawId", "reveal",
  ];
  /** Server-originated metadata fields the plane may ever attach (R6/R8). */
  const METADATA_FIELDS = new Set([
    "v", "type", "connId", "userId", "serverTime", "caps", "online",
    "room", "members", "at", "from", "payload", "queue", "depth", "reason",
    "users", "to", "queued", "stored", "t0", "code", "message", "of", "event",
  ]);

  function walkKeys(value: unknown, path: string, keys: string[], payloadOk: boolean): void {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      // array members carry no field names — walk the values only
      for (const v of value) walkKeys(v, `${path}[]`, keys, payloadOk);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (payloadOk && k === "payload") continue; // the opaque relay, exempt by law
      keys.push(path + k);
      if (FORBIDDEN.includes(k)) keys.push(`FORBIDDEN:${path}${k}`);
      walkKeys(v, `${path}${k}.`, keys, payloadOk);
    }
  }

  test("every frame the plane emits across a full scenario carries metadata fields only", () => {
    const hub = newHub();
    // the scenario soup: rooms, says, queues, takes, delivers, sweeps, errors
    const a = connect(hub, "u1");
    const b = connect(hub, "u2");
    const soup: HubOut[] = [];
    soup.push(send(hub, a, { type: "room.join", room: "battle:census" }));
    soup.push(send(hub, b, { type: "room.join", room: "battle:census" }));
    soup.push(send(hub, a, { type: "room.say", room: "battle:census", payload: "opaque-move-bytes" }));
    soup.push(send(hub, a, { type: "queue.join", queue: "mm:census" }));
    soup.push(send(hub, b, { type: "queue.take", queue: "mm:census", n: 1 }));
    soup.push(send(hub, a, { type: "deliver", to: "u2", payload: "ghost-bytes" }));
    soup.push(send(hub, a, { type: "deliver", to: "nobody-offline", payload: "stored-bytes" }));
    soup.push(send(hub, a, { type: "room.say", room: "battle:census", payload: "x" }));
    soup.push(hub.sweep());
    soup.push(hub.disconnect(b));
    // the payload itself carries a forbidden-looking NAME — still exempt (opaque)
    soup.push(send(hub, a, { type: "room.say", room: "battle:census", payload: "hello", excludeSelf: false }));

    const allFrames = soup.flatMap((out) => out.frames.map((f) => f.frame));
    expect(allFrames.length).toBeGreaterThan(10);
    const keys: string[] = [];
    for (const frame of allFrames) {
      const payloadBearing = frame.type === "room.message" || frame.type === "envelope";
      walkKeys(frame, "", keys, payloadBearing);
    }
    const forbidden = keys.filter((k) => k.startsWith("FORBIDDEN:"));
    expect(forbidden).toEqual([]);
    const unknownFields = keys.filter((k) => !k.startsWith("FORBIDDEN:") && !METADATA_FIELDS.has(k.split(".").pop()!));
    expect(unknownFields).toEqual([]);
  });

  test("Q8b import census — the file-level law of R6 (state plane imports NOTHING; composition root imports the identity law ONLY)", () => {
    const base = join(import.meta.dir, "../../src/realtime");
    const statePlane = readFileSync(join(base, "protocol.ts"), "utf8") + readFileSync(join(base, "state.ts"), "utf8");
    const serverSrc = readFileSync(join(base, "server.ts"), "utf8");

    // the census keys on ACTUAL import specifiers — never on prose mentions
    const importSpecs = (src: string): string[] => {
      const specs: string[] = [];
      for (const m of src.matchAll(/from\s+"([^"]+)"/g)) specs.push(m[1]!);
      for (const m of src.matchAll(/^\s*import\s+"([^"]+)"/gm)) specs.push(m[1]!);
      return specs;
    };

    const stateSpecs = importSpecs(statePlane);
    for (const spec of stateSpecs) {
      expect(["./protocol", "zod"]).toContain(spec); // the state plane's entire import surface
    }
    const serverSpecs = importSpecs(serverSrc);
    for (const spec of serverSpecs) {
      expect([
        "../middleware/auth", "../services/identity/jwt", "../services/identity/users",
        "@syllabai/db", "../env", "./protocol", "./state",
      ]).toContain(spec); // the identity law ONLY, plus the plane's own modules (R2/R6)
    }
    // the composition root MUST reuse the identity law (R2) — its presence is the law, not a leak
    expect(serverSrc).toContain("createJwtAuthenticator");
    expect(serverSrc).toContain("JwtService");
  });
});

// ---------------------------------------------------------------- Q9 — the burst law

describe("F-188 realtime battery — Q9 burst law (R5: 30 non-ping frames/s, ping exempt)", () => {
  test("the 31st frame inside one second is refused with burst + close 1008", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    send(hub, a, { type: "room.join", room: "battle:burst" }); // alone: says fan to nobody
    // hello + join already occupy the first two burst slots (they count —
    // only ping is exempt), so 28 says fill the window and the 29th bursts.
    for (let i = 0; i < RT.BURST_PER_SEC - 2; i++) {
      const out = send(hub, a, { type: "room.say", room: "battle:burst", payload: `m${i}` });
      expect(out.close).toEqual([]);
    }
    const over = send(hub, a, { type: "room.say", room: "battle:burst", payload: "over" });
    expect(framesOf(over).map((f) => (f as { code: string }).code)).toEqual(["burst"]);
    expect(closeOf(over)).toEqual([{ connId: a, code: 1008, reason: "burst" }]);
  });

  test("ping is exempt — 200 pings inside one second never burst", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    let pongs = 0;
    for (let i = 0; i < 200; i++) {
      const out = hub.frame(a, JSON.stringify({ v: 1, type: "ping", t0: i }));
      if (framesOf(out).some((f) => f.type === "pong")) pongs++;
      expect(out.close).toEqual([]);
    }
    expect(pongs).toBe(200);
  });
});

// ---------------------------------------------------------------- Q10 — the clock law

describe("F-188 realtime battery — Q10 clock law (R7: the injected clock of record)", () => {
  test("every stamp is the injected clock's; advancing it moves the stamps deterministically", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const t0 = clock().toISOString();
    // a fresh conn's hello carries the welcome stamped by the frozen clock
    const c2 = hub.connect(authOf("u2")).connId;
    const w = framesOf(hub.frame(c2, JSON.stringify({ v: 1, type: "hello" })))[0] as Extract<ServerFrame, { type: "welcome" }>;
    expect(w.serverTime).toBe(clock().toISOString());
    expect(w.serverTime).toBe(t0); // nothing advanced between the two connects

    tick(5000);
    const b = connect(hub, "u3");
    const snap = framesOf(send(hub, b, { type: "room.join", room: "battle:r" }))[0] as Extract<ServerFrame, { type: "presence.snapshot" }>;
    expect(snap.at).toBe(clock().toISOString());
    expect(new Date(snap.at).getTime() - new Date(t0).getTime()).toBe(5000);
  });

  test("the sweep and the TTL are deterministic under the frozen clock (no flake possible)", () => {
    const hub = newHub();
    const a = connect(hub, "u1");
    const b = connect(hub, "u2");
    send(hub, a, { type: "room.join", room: "battle:clock" });
    send(hub, b, { type: "deliver", to: "u1", payload: "in-ttl" });

    tick(RT.STALE_MS - 1000);
    expect(hub.sweep().close).toEqual([]); // inside the window: nothing reaps
    tick(1001);
    const out = hub.sweep();
    expect(out.close.length).toBe(2); // both conns stale at the same deterministic tick
    expect(hub.stats().pending).toBe(0); // and the envelope expired with them
  });
});
