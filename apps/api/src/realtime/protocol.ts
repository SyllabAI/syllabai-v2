/**
 * F-188 — the realtime plane's protocol of record: envelope v1, the caps of
 * record, and the frame vocabulary (prereg docs/F188-REALTIME-PLAN.md, R5/R8).
 *
 * This module is the STATE plane's vocabulary: pure types + schemas + caps.
 * The import census (plan R6, battery Q8b) forbids this file and state.ts
 * from importing anything db/drill/battle/assessment/identity — the plane
 * transports, it never decides and never reads learner state.
 */
import { z } from "zod";

/** R5 — the caps of record (fail-closed, disclosed in the plan table). */
export const RT = {
  PROTOCOL_VERSION: 1,
  MAX_FRAME_BYTES: 65_536,
  ENVELOPE_BYTES: 16_384,
  ROOM_CAP: 32,
  MAX_ROOMS: 1024,
  QUEUE_CAP: 256,
  MAX_QUEUES: 256,
  PENDING_PER_TARGET: 64,
  ENVELOPE_TTL_MS: 600_000,
  STALE_MS: 90_000,
  HELLO_WINDOW_MS: 10_000,
  BURST_PER_SEC: 30,
  MAX_ID_CHARS: 128,
} as const;

/** R8 — error codes of record. */
export type RtErrorCode =
  | "bad_json"
  | "bad_frame"
  | "unknown_type"
  | "unknown_version"
  | "handshake_required"
  | "already_hello"
  | "bad_id"
  | "too_large"
  | "room_full"
  | "room_cap"
  | "not_member"
  | "already_member"
  | "queue_full"
  | "queue_cap"
  | "unknown_queue"
  | "already_queued"
  | "not_queued"
  | "bad_take"
  | "burst"
  | "binary_frame";

const idField = z.string().min(1).max(RT.MAX_ID_CHARS);
// Payload size is NOT capped here: R5 routes it through the explicit
// too_large error (frame stays) so the cap is observable as a code of record;
// MAX_FRAME_BYTES is the adapter's byte-accurate backstop (close 1009).
const payloadField = z.string();

/** Client → server frames (R8). */
export const clientFrameSchema = z.discriminatedUnion("type", [
  z.object({ v: z.literal(RT.PROTOCOL_VERSION), type: z.literal("hello") }),
  z.object({ v: z.literal(RT.PROTOCOL_VERSION), type: z.literal("room.join"), room: idField }),
  z.object({ v: z.literal(RT.PROTOCOL_VERSION), type: z.literal("room.leave"), room: idField }),
  z.object({
    v: z.literal(RT.PROTOCOL_VERSION),
    type: z.literal("room.say"),
    room: idField,
    payload: payloadField,
    excludeSelf: z.boolean().optional(),
  }),
  z.object({ v: z.literal(RT.PROTOCOL_VERSION), type: z.literal("queue.join"), queue: idField }),
  z.object({ v: z.literal(RT.PROTOCOL_VERSION), type: z.literal("queue.leave"), queue: idField }),
  z.object({
    v: z.literal(RT.PROTOCOL_VERSION),
    type: z.literal("queue.take"),
    queue: idField,
    n: z.number().int().min(1).max(RT.QUEUE_CAP),
  }),
  z.object({
    v: z.literal(RT.PROTOCOL_VERSION),
    type: z.literal("deliver"),
    to: idField,
    payload: payloadField,
  }),
  z.object({
    v: z.literal(RT.PROTOCOL_VERSION),
    type: z.literal("ping"),
    t0: z.number().optional(),
  }),
]);

export type ClientFrame = z.infer<typeof clientFrameSchema>;

/** Server → client frames (R8) — the vocabulary the battery census walks. */
export type ServerFrame =
  | { v: 1; type: "welcome"; connId: string; userId: string; serverTime: string; caps: Record<string, number>; online: number }
  | { v: 1; type: "presence.snapshot"; room: string; members: string[]; at: string }
  | { v: 1; type: "presence"; room: string; userId: string; event: "join" | "leave"; online: number; at: string }
  | { v: 1; type: "room.message"; room: string; from: string; payload: string; at: string }
  | { v: 1; type: "queue.joined"; queue: string; depth: number; at: string }
  | { v: 1; type: "queue.left"; queue: string; reason: "self" | "taken" | "disconnect"; at: string }
  | { v: 1; type: "queue.taken"; queue: string; users: string[]; at: string }
  | { v: 1; type: "deliver.ack"; to: string; queued: boolean; at: string }
  | { v: 1; type: "envelope"; from: string; payload: string; at: string; stored: boolean }
  | { v: 1; type: "pong"; t0: number | null; serverTime: string }
  | { v: 1; type: "error"; code: RtErrorCode; message: string; of?: string };

/** The caps advertised in `welcome` (R5 — the same table, on the wire). */
export function capsOfRecord(): Record<string, number> {
  return {
    protocolVersion: RT.PROTOCOL_VERSION,
    maxFrameBytes: RT.MAX_FRAME_BYTES,
    envelopeBytes: RT.ENVELOPE_BYTES,
    roomCap: RT.ROOM_CAP,
    maxRooms: RT.MAX_ROOMS,
    queueCap: RT.QUEUE_CAP,
    maxQueues: RT.MAX_QUEUES,
    pendingPerTarget: RT.PENDING_PER_TARGET,
    envelopeTtlMs: RT.ENVELOPE_TTL_MS,
    burstPerSec: RT.BURST_PER_SEC,
  };
}
