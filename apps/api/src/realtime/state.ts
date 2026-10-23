/**
 * F-188 — the realtime state machine of record: presence, rooms, queues and
 * store-and-forward envelopes over EPHEMERAL in-memory state (prereg
 * docs/F188-REALTIME-PLAN.md, R3/R4/R7).
 *
 * Posture of record:
 *  - R3: everything in here dies with the process. No database, no
 *    persistence, no gradebook surface, no settlement math (the import
 *    census Q8b pins the file-level law). Envelopes are best-effort,
 *    TTL-bounded; a restart drops them — disclosed in the plan.
 *  - R4: primitives that never decide. queue.take returns the n oldest ids
 *    and removes them — a data structure, not a matchmaking verdict.
 *  - R6: payloads are opaque strings relayed byte-identical; the frames this
 *    module originates carry protocol metadata only.
 *  - Q10: the ONLY clock is the injected one (opts.now, default new Date()) —
 *    sweeps, TTLs and stamps are deterministic under test.
 *
 * The hub is adapter-agnostic: every call returns outcomes (frames addressed
 * per connection + close orders); server.ts maps them onto real sockets.
 */
import {
  RT,
  capsOfRecord,
  clientFrameSchema,
  type ClientFrame,
  type RtErrorCode,
  type ServerFrame,
} from "./protocol";

/** R2 — the principal the adapter resolved at the upgrade (identity plane). */
export interface HubAuth {
  userId: string;
  email: string;
  roles: readonly string[];
}

export interface OutFrame {
  connId: string;
  frame: ServerFrame;
}

export interface OutClose {
  connId: string;
  code: number;
  reason: string;
}

export interface HubOut {
  frames: OutFrame[];
  close: OutClose[];
}

const EMPTY: HubOut = { frames: [], close: [] };

interface Conn {
  connId: string;
  userId: string;
  helloed: boolean;
  connectedAt: number;
  lastSeen: number;
  rooms: Set<string>;
  queues: Set<string>;
  /** Ring of frame timestamps inside the last second (burst law, Q9). */
  sentAt: number[];
}

interface Room {
  id: string;
  /** connId -> userId (a user may hold several connections in one room). */
  members: Map<string, string>;
  createdAt: number;
}

interface QueueEntry {
  connId: string;
  userId: string;
  enqueuedAt: number;
}

interface RtQueue {
  id: string;
  entries: QueueEntry[];
  createdAt: number;
}

interface PendingEnvelope {
  from: string;
  payload: string;
  at: number;
}

export interface HubOpts {
  /** The injected clock of record (Q10) — every stamp and sweep uses it. */
  now?: () => Date;
}

export class RealtimeHub {
  private readonly conns = new Map<string, Conn>();
  private readonly rooms = new Map<string, Room>();
  private readonly queues = new Map<string, RtQueue>();
  /** userId -> pending store-and-forward envelopes (R3: memory, TTL, R5 cap). */
  private readonly pending = new Map<string, PendingEnvelope[]>();
  private readonly now: () => Date;

  constructor(opts: HubOpts = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  private ms(): number {
    return this.now().getTime();
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private out(frame: ServerFrame, connIds: string[]): HubOut {
    return { frames: connIds.map((connId) => ({ connId, frame })), close: [] };
  }

  private merge(a: HubOut, b: HubOut): HubOut {
    return { frames: [...a.frames, ...b.frames], close: [...a.close, ...b.close] };
  }

  private error(connId: string, code: RtErrorCode, message: string, of?: string): HubOut {
    return this.out({ v: 1, type: "error", code, message, ...(of !== undefined ? { of } : {}) }, [connId]);
  }

  // ------------------------------------------------------------------ lifecycle

  /** Register a connection (the adapter calls this from `open`). */
  connect(auth: HubAuth): { connId: string } {
    const connId = crypto.randomUUID();
    const t = this.ms();
    this.conns.set(connId, {
      connId,
      userId: auth.userId,
      helloed: false,
      connectedAt: t,
      lastSeen: t,
      rooms: new Set(),
      queues: new Set(),
      sentAt: [],
    });
    return { connId };
  }

  /** R8 — the hello handshake: welcome + the store-and-forward flush (Q5). */
  hello(connId: string): HubOut {
    const conn = this.conns.get(connId);
    if (!conn) return EMPTY;
    conn.lastSeen = this.ms();
    if (conn.helloed) return this.error(connId, "already_hello", "hello already completed");
    conn.helloed = true;
    const welcome: ServerFrame = {
      v: 1,
      type: "welcome",
      connId,
      userId: conn.userId,
      serverTime: this.iso(),
      caps: capsOfRecord(),
      online: this.conns.size,
    };
    let out = this.out(welcome, [connId]);
    // R5/Q5 — deliver anything addressed to this user while they were away.
    const stored = this.pending.get(conn.userId);
    if (stored && stored.length > 0) {
      this.pending.delete(conn.userId);
      for (const env of stored) {
        out = this.merge(
          out,
          this.out(
            { v: 1, type: "envelope", from: env.from, payload: env.payload, at: new Date(env.at).toISOString(), stored: true },
            [connId],
          ),
        );
      }
    }
    return out;
  }

  /**
   * Clean or swept disconnect (R7). Idempotent by design — the adapter's
   * close handler and the sweep's close order may both land here.
   */
  disconnect(connId: string): HubOut {
    const conn = this.conns.get(connId);
    if (!conn) return EMPTY;
    this.conns.delete(connId);
    let out: HubOut = EMPTY;
    // Rooms: honest presence leaves to the remaining members (R7).
    for (const roomId of conn.rooms) {
      const room = this.rooms.get(roomId);
      if (!room) continue;
      room.members.delete(connId);
      const others = [...room.members.keys()];
      if (others.length === 0) {
        this.rooms.delete(roomId);
      } else {
        out = this.merge(
          out,
          this.out(
            { v: 1, type: "presence", room: roomId, userId: conn.userId, event: "leave", online: others.length, at: this.iso() },
            others,
          ),
        );
      }
    }
    conn.rooms.clear();
    // Queues: silently removed (the consumer re-syncs via its own take/peek laws).
    for (const queueId of conn.queues) {
      const queue = this.queues.get(queueId);
      if (!queue) continue;
      queue.entries = queue.entries.filter((e) => e.connId !== connId);
      if (queue.entries.length === 0) this.queues.delete(queueId);
    }
    conn.queues.clear();
    return out;
  }

  /**
   * R7 — the sweep: stale conns (lastSeen beyond STALE_MS), un-hello'd conns
   * past the hello window, envelopes past their TTL. Deterministic (Q10).
   */
  sweep(): HubOut {
    const t = this.ms();
    let out: HubOut = EMPTY;
    for (const conn of [...this.conns.values()]) {
      const stale = t - conn.lastSeen > RT.STALE_MS;
      const unhelloed = !conn.helloed && t - conn.connectedAt > RT.HELLO_WINDOW_MS;
      if (stale || unhelloed) {
        out = this.merge(out, this.disconnect(conn.connId));
        out = this.merge(out, {
          frames: [],
          close: [{ connId: conn.connId, code: stale ? 1000 : 1008, reason: stale ? "stale" : "hello window" }],
        });
      }
    }
    for (const [userId, stored] of this.pending) {
      const alive = stored.filter((env) => t - env.at <= RT.ENVELOPE_TTL_MS);
      if (alive.length === 0) this.pending.delete(userId);
      else if (alive.length !== stored.length) this.pending.set(userId, alive);
    }
    return out;
  }

  // ------------------------------------------------------------------ frames

  /** The frame entry point (the adapter calls this from `message`). */
  frame(connId: string, raw: string): HubOut {
    const conn = this.conns.get(connId);
    if (!conn) return EMPTY;
    conn.lastSeen = this.ms();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return this.merge(this.error(connId, "bad_json", "frame is not valid JSON"), {
        frames: [],
        close: [{ connId, code: 1002, reason: "bad_json" }],
      });
    }

    const probe = parsedJson as { v?: unknown; type?: unknown };
    if (probe.v !== RT.PROTOCOL_VERSION) {
      return this.merge(this.error(connId, "unknown_version", `protocol version must be ${RT.PROTOCOL_VERSION}`), {
        frames: [],
        close: [{ connId, code: 1002, reason: "unknown_version" }],
      });
    }
    const parsed = clientFrameSchema.safeParse(probe);
    if (!parsed.success) {
      // Unknown or malformed type: named unknown_type when the type is not in
      // the vocabulary at all, bad_frame when it is but the shape is wrong.
      // Neither closes — an authenticated connection may stumble (R8).
      const known = [
        "hello", "room.join", "room.leave", "room.say",
        "queue.join", "queue.leave", "queue.take", "deliver", "ping",
      ];
      if (typeof probe.type !== "string" || !known.includes(probe.type)) {
        return this.error(connId, "unknown_type", "unknown frame type", typeof probe.type === "string" ? probe.type : undefined);
      }
      return this.error(connId, "bad_frame", "frame shape rejected by the schema of record", probe.type);
    }
    const msg = parsed.data;

    // Q9 — burst law (ping exempt: liveness is not abuse), AFTER the parse so
    // the exemption keys on the parsed type, never on raw string content.
    if (msg.type !== "ping") {
      const t = this.ms();
      conn.sentAt = conn.sentAt.filter((ts) => t - ts < 1000);
      if (conn.sentAt.length >= RT.BURST_PER_SEC) {
        return this.merge(this.error(connId, "burst", "frame burst over the cap of record"), {
          frames: [],
          close: [{ connId, code: 1008, reason: "burst" }],
        });
      }
      conn.sentAt.push(t);
    }

    // R8 — the hello gate (parsed type, not string sniffing).
    if (!conn.helloed && msg.type !== "hello") {
      return this.merge(this.error(connId, "handshake_required", "hello must be the first frame"), {
        frames: [],
        close: [{ connId, code: 1008, reason: "handshake_required" }],
      });
    }

    if (msg.type === "hello") return this.hello(connId);

    switch (msg.type) {
      case "room.join":
        return this.roomJoin(conn, msg.room);
      case "room.leave":
        return this.roomLeave(conn, msg.room);
      case "room.say":
        return this.roomSay(conn, msg.room, msg.payload, msg.excludeSelf ?? true);
      case "queue.join":
        return this.queueJoin(conn, msg.queue);
      case "queue.leave":
        return this.queueLeave(conn, msg.queue);
      case "queue.take":
        return this.queueTake(conn, msg.queue, msg.n);
      case "deliver":
        return this.deliver(conn, msg.to, msg.payload);
      case "ping":
        return this.out({ v: 1, type: "pong", t0: msg.t0 ?? null, serverTime: this.iso() }, [connId]);
      default:
        return this.error(connId, "unknown_type", "unknown frame type");
    }
  }

  // ------------------------------------------------------------------ rooms (R4/Q3)

  private roomJoin(conn: Conn, roomId: string): HubOut {
    if (conn.rooms.has(roomId)) return this.error(conn.connId, "already_member", "already a member of this room", roomId);
    let room = this.rooms.get(roomId);
    if (!room) {
      if (this.rooms.size >= RT.MAX_ROOMS) return this.error(conn.connId, "room_cap", "live room count at the cap of record", roomId);
      room = { id: roomId, members: new Map(), createdAt: this.ms() };
      this.rooms.set(roomId, room);
    }
    if (room.members.size >= RT.ROOM_CAP) return this.error(conn.connId, "room_full", "room at the cap of record", roomId);
    room.members.set(conn.connId, conn.userId);
    conn.rooms.add(roomId);
    const others = [...room.members.keys()].filter((c) => c !== conn.connId);
    let out = this.out(
      { v: 1, type: "presence.snapshot", room: roomId, members: [...room.members.values()], at: this.iso() },
      [conn.connId],
    );
    if (others.length > 0) {
      out = this.merge(
        out,
        this.out(
          { v: 1, type: "presence", room: roomId, userId: conn.userId, event: "join", online: room.members.size, at: this.iso() },
          others,
        ),
      );
    }
    return out;
  }

  private roomLeave(conn: Conn, roomId: string): HubOut {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.has(conn.connId)) {
      return this.error(conn.connId, "not_member", "not a member of this room", roomId);
    }
    room.members.delete(conn.connId);
    conn.rooms.delete(roomId);
    const remaining = [...room.members.keys()];
    if (remaining.length === 0) this.rooms.delete(roomId);
    const frame: ServerFrame = {
      v: 1, type: "presence", room: roomId, userId: conn.userId, event: "leave", online: remaining.length, at: this.iso(),
    };
    // The leaver learns its own leave too (honest self-view), then the roommates.
    return this.out(frame, [conn.connId, ...remaining]);
  }

  private roomSay(conn: Conn, roomId: string, payload: string, excludeSelf: boolean): HubOut {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.has(conn.connId)) {
      return this.error(conn.connId, "not_member", "not a member of this room", roomId);
    }
    // R5 — the envelope cap of record: observable as the too_large code (the
    // frame stays connected); MAX_FRAME_BYTES is the adapter's byte backstop.
    if (payload.length > RT.ENVELOPE_BYTES) {
      return this.error(conn.connId, "too_large", `payload over the ${RT.ENVELOPE_BYTES}-char cap of record`, roomId);
    }
    const frame: ServerFrame = { v: 1, type: "room.message", room: roomId, from: conn.userId, payload, at: this.iso() };
    const targets = [...room.members.keys()].filter((c) => (excludeSelf ? c !== conn.connId : true));
    return this.out(frame, targets);
  }

  // ------------------------------------------------------------------ queues (R4/Q4)

  private queueJoin(conn: Conn, queueId: string): HubOut {
    if (conn.queues.has(queueId)) return this.error(conn.connId, "already_queued", "already queued here", queueId);
    let queue = this.queues.get(queueId);
    if (!queue) {
      if (this.queues.size >= RT.MAX_QUEUES) return this.error(conn.connId, "queue_cap", "live queue count at the cap of record", queueId);
      queue = { id: queueId, entries: [], createdAt: this.ms() };
      this.queues.set(queueId, queue);
    }
    if (queue.entries.length >= RT.QUEUE_CAP) return this.error(conn.connId, "queue_full", "queue at the cap of record", queueId);
    queue.entries.push({ connId: conn.connId, userId: conn.userId, enqueuedAt: this.ms() });
    conn.queues.add(queueId);
    return this.out({ v: 1, type: "queue.joined", queue: queueId, depth: queue.entries.length, at: this.iso() }, [conn.connId]);
  }

  private queueLeave(conn: Conn, queueId: string): HubOut {
    const queue = this.queues.get(queueId);
    if (!queue || !conn.queues.has(queueId)) {
      return this.error(conn.connId, "not_queued", "not queued here", queueId);
    }
    queue.entries = queue.entries.filter((e) => e.connId !== conn.connId);
    conn.queues.delete(queueId);
    if (queue.entries.length === 0) this.queues.delete(queueId);
    return this.out({ v: 1, type: "queue.left", queue: queueId, reason: "self", at: this.iso() }, [conn.connId]);
  }

  private queueTake(conn: Conn, queueId: string, n: number): HubOut {
    const queue = this.queues.get(queueId);
    if (!queue) return this.error(conn.connId, "unknown_queue", "no such queue", queueId);
    // R4 — take the n oldest, atomically, capped at depth. A data structure,
    // not a pairing verdict; what the consumer does with the ids is its law.
    const taken = queue.entries.splice(0, n);
    for (const entry of taken) {
      const c = this.conns.get(entry.connId);
      if (c) c.queues.delete(queueId);
    }
    if (queue.entries.length === 0) this.queues.delete(queueId);
    let out = this.out(
      { v: 1, type: "queue.taken", queue: queueId, users: taken.map((e) => e.userId), at: this.iso() },
      [conn.connId],
    );
    for (const entry of taken) {
      out = this.merge(
        out,
        this.out({ v: 1, type: "queue.left", queue: queueId, reason: "taken", at: this.iso() }, [entry.connId]),
      );
    }
    return out;
  }

  // ------------------------------------------------------------------ ghost delivery (R4/Q5)

  private deliver(conn: Conn, to: string, payload: string): HubOut {
    if (payload.length > RT.ENVELOPE_BYTES) {
      return this.error(conn.connId, "too_large", `payload over the ${RT.ENVELOPE_BYTES}-char cap of record`, to);
    }
    const at = this.iso();
    const targets = [...this.conns.values()].filter((c) => c.userId === to && c.helloed);
    if (targets.length > 0) {
      let out = this.out({ v: 1, type: "envelope", from: conn.userId, payload, at, stored: false }, targets.map((c) => c.connId));
      out = this.merge(out, this.out({ v: 1, type: "deliver.ack", to, queued: false, at }, [conn.connId]));
      return out;
    }
    // Store-and-forward (R3/R5): best-effort, TTL'd, capped — oldest evicted.
    const stored = this.pending.get(to) ?? [];
    if (stored.length >= RT.PENDING_PER_TARGET) stored.shift();
    stored.push({ from: conn.userId, payload, at: this.ms() });
    this.pending.set(to, stored);
    return this.out({ v: 1, type: "deliver.ack", to, queued: true, at }, [conn.connId]);
  }

  // ------------------------------------------------------------------ introspection (battery-only)

  /** Counters of record for the battery — never served on the wire (R6). */
  stats(): { conns: number; rooms: number; queues: number; pending: number } {
    return {
      conns: this.conns.size,
      rooms: this.rooms.size,
      queues: this.queues.size,
      pending: [...this.pending.values()].reduce((n, list) => n + list.length, 0),
    };
  }
}
