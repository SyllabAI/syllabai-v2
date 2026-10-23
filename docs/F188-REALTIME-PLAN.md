# F-188 — the realtime plane: transport, presence, rooms, queues, ghost-delivery (the build opening of record)

**Prereg of record** — committed WITH the implementation per the
#216/#225/#229/#232/DC-4/F182/F183/F184/F185/F186 pattern. Laws R1..R10 and the
validation battery Q1..Q10 below were fixed before the battery ran; the battery
pins them. Operator words of record: initiation trace 1a169faf8411d2cd (F-188
filed Planned, PR #48), build-opening word "Proceed" trace 1a16a048c1b94319
(2026-10-24).

**Boundary of record (binding on every section below):** F-188 is
INFRASTRUCTURE ONLY — persistent bidirectional transport + presence +
room/matchmaking-queue + async-ghost-delivery primitives serving the battle
family. NOTHING matchmaking-, bracket-, or leaderboard-shaped ships under this
line (the operator ruling trace 1a1693693b033a2d's standing disclosure survives
the initiation and the build). The descoped F-186 territory (descope terms
trace 1a169e8c0e52bebd, place-of-record on the F-186 row notes) is this line's
downstream consumer and files its own line(s) once these primitives serve.

## R1 — Transport: a standalone long-lived WebSocket plane, outside the serverless request plane

The api's deployment of record is Vercel serverless (`apps/api/src/index.ts`
default export is the fetch handler; "Deployment: Vercel" is that file's own
header). A serverless function cannot hold a persistent bidirectional
connection, so the realtime plane of record is a SEPARATE long-lived process:
`apps/api/src/realtime/server.ts`, a `Bun.serve` composition root speaking
Bun-native WebSocket on its own port (`REALTIME_PORT`, default 8081), path
`/realtime`. It is deliberately NOT imported by the Vercel entry (no mount, no
index.ts touch, no double-bind — the index.ts header's own warning stands
untouched). Local run: `bun run dev:realtime` (workspace script added to
`apps/api/package.json` — the only existing-file touch in this lane).

**Disclosed of record:** the production hosting decision for the long-lived
process is the operator's (container/VM/managed host — any Bun-capable box).
The plane ships runnable of record (local + CI battery); the production
latency p95 receipt is the deployed plane's own measurement, not claimed here.

## R2 — Auth: the identity law reused verbatim at the upgrade, fail-closed

The upgrade reuses THE identity law of record — `createJwtAuthenticator`
(JwtService parse + the fail-closed revocation check: unknown user, disabled
account, or stale/null `ver` all reject), the same middleware the request
plane mounts. No socket resources are granted on failure: the upgrade is
refused with the Boot-shaped 401 body. Bearer header is preferred; `?bearer=`
query is accepted because the browser WebSocket API cannot set headers
(disclosed; the token is the same 2h-TTL identity token — consumers mint fresh
ones per connect, as any browser client must). The plane's only database use
is this revocation lookup — the identity plane, NOT realtime state (R3).

## R3 — State posture: ephemeral, in-memory, process-local; zero persistence

All realtime state — presence, rooms, queues, pending ghost envelopes — lives
in process memory and dies with the process. No Neon table, no durable
realtime store, no gradebook surface, no progress-bearing write of any kind.
Battle settlement is UNTOUCHED and stays computed-at-read over the drill's own
immutable rows (ADR-031 posture; the plane never sees settlement math — the
import census Q8b proves it). **Disclosed of record:** a process restart drops
presence/rooms/queues and undelivered envelopes (envelopes are best-effort,
TTL-bounded — R5); durability needs are consumer-line territory, not F-188's.
This is the filed posture verbatim: "battle settlement stays computed-at-read
never persisted (ADR-031 posture), zero gradebook surface."

## R4 — Boundary: primitives that never decide

The plane provides exactly five primitive families: transport (R1),
presence (who is connected, per room), rooms (join/leave/broadcast over opaque
string ids), a queue (a dumb FIFO: join/leave/take-oldest-n), and
store-and-forward envelopes (address an opaque payload to a user id; deliver
now or on next connect, TTL-bounded). It owns ZERO decisions: no pairing, no
rating, no eligibility, no scoring, no bracket logic, no leaderboard.
`queue.take(n)` returns the n oldest queued user ids and removes them — a data
structure, not a matchmaking verdict; what a consumer does with taken ids is
the consumer's law. Primitives are open to any authenticated principal;
consumer lines wrap authority laws around their own queue/room naming and
their own surfacing (any class-level surfacing they build is governed by
ADR-036's accepted on-the-wire k=5 distinct-learner rule — the plane itself
surfaces presence/userId only, R6).

## R5 — Caps of record (fail-closed, disclosed)

| cap | value | on exceed |
|---|---|---|
| PROTOCOL_VERSION | 1 | error + close 1002 |
| MAX_FRAME_BYTES | 65 536 | error + close 1009 |
| ENVELOPE_BYTES | 16 384 | error `too_large` (frame stays) |
| ROOM_CAP | 32 members | error `room_full` |
| MAX_ROOMS | 1024 live rooms | error `room_cap` |
| QUEUE_CAP | 256 entries | error `queue_full` |
| MAX_QUEUES | 256 live queues | error `queue_cap` |
| PENDING_PER_TARGET | 64 envelopes | oldest evicted (disclosed) |
| ENVELOPE_TTL_MS | 600 000 (10 min) | swept, disclosed |
| STALE_MS | 90 000 since lastSeen | swept close 1000 |
| HELLO_WINDOW_MS | 10 000 after connect | swept close 1008 |
| BURST_PER_SEC | 30 frames/s (ping exempt) | error + close 1008 |
| MAX_ID_CHARS | 128 (room/queue ids) | error `bad_id` |
| payload wire size | opaque string, byte-identical relay | — |

## R6 — Leakage law: opaque payloads, whitelisted metadata, import census

Payloads (`room.say.payload`, `deliver.payload`) are OPAQUE strings relayed
byte-identical — the plane never parses, enriches, or interprets them, so it
cannot leak what it does not understand. Server-originated metadata carries
only protocol fields (protocol version, frame types, connection/room/queue
ids, userId, membership counts, timestamps, caps, error codes). The Q8
census walks every frame the plane emits across a full battery scenario and
asserts no gradebook/learner-state field name appears outside the exempt
opaque `payload` field; the Q8b import census pins the file-level law:
`protocol.ts` + `state.ts` (the state plane) import NOTHING from db / drill /
battle / assessment / identity; `server.ts` (the composition root) may import
the identity law ONLY (R2) and nothing gradebook-adjacent. Presence is
identity-minimal by design: userId + counts, nothing else (disclosed).

## R7 — Liveness: hello window, lastSeen, sweep

A connection must send `hello` as its first frame within HELLO_WINDOW_MS or be
swept (close 1008). Every frame updates lastSeen; the sweep (adapter interval,
default 15 s) closes connections silent beyond STALE_MS (close 1000) and
expires envelopes past their TTL. Disconnects (clean or swept) fan honest
`presence` leave events to roommates and remove the connection from rooms and
queues. Sweeps use the injected clock — deterministic under test (Q10).

## R8 — Envelope protocol v1

JSON text frames only (binary refused, close 1003). `{"v":1,"type":...}`.
Client → server: `hello`, `room.join{room}`, `room.leave{room}`,
`room.say{room,payload,excludeSelf?}`, `queue.join{queue}`,
`queue.leave{queue}`, `queue.take{queue,n}`, `deliver{to,payload}`,
`ping{t0?}`. Server → client: `welcome{connId,userId,serverTime,caps,online}`,
`presence.snapshot{room,members,at}`, `presence{room,userId,event,online,at}`,
`room.message{room,from,payload,at}`, `queue.joined{queue,depth,at}`,
`queue.left{queue,reason,at}`, `queue.taken{queue,users,at}`,
`deliver.ack{to,queued,at}`, `envelope{from,payload,at,stored}`, `pong{t0,serverTime}`,
`error{code,message,of?}`. Unknown type → `error` frame, connection stays;
unknown version → error + close 1002; malformed JSON → error + close 1002;
first frame must be `hello`; `room.say` fan-out excludes the sender unless
`excludeSelf:false`. Error codes of record: `bad_json`, `bad_frame`,
`unknown_type`, `unknown_version`, `handshake_required`, `already_hello`,
`bad_id`, `too_large`, `room_full`, `room_cap`, `not_member`, `already_member`,
`queue_full`, `queue_cap`, `unknown_queue`, `already_queued`, `not_queued`,
`bad_take`, `burst`, `binary_frame`.

## R9 — The prereg battery Q1..Q10 (the F-188 validation metric, operationalized)

The tracker row's validation metric: presence/room stability under load;
delivery latency p95 within the 60s battle clock; zero gradebook/learner-state
leakage on the wire; the descoped consumer line(s) file and ship on the
primitives. Fixed before implementation ran:

- **Q1 (handshake law):** unauthenticated / garbage-token / unknown-user /
  disabled-user upgrades are refused fail-closed (HTTP 401, Boot-shaped body,
  no socket). Valid upgrade + `hello` → `welcome` with caps of record.
- **Q2 (presence law):** join → snapshot to joiner + join event to others;
  disconnect → leave event; swept stale connection → leave event + close.
  Presence frames carry only {room, userId, event, online, at}.
- **Q3 (room law):** join/leave/say fan-out with sender exclusion by default;
  non-member say refused; ROOM_CAP enforced; id length capped; empty room
  reaped.
- **Q4 (queue law):** FIFO order preserved; `take(n)` returns the n oldest
  atomically and caps at depth; duplicate join refused; QUEUE_CAP enforced;
  taken members receive `queue.left{reason:"taken"}`.
- **Q5 (ghost-delivery law):** online target → immediate `envelope{stored:false}`
  + `deliver.ack{queued:false}`; offline target → `deliver.ack{queued:true}`,
  stored, delivered on next hello as `envelope{stored:true}`; TTL expiry swept;
  PENDING_PER_TARGET evicts oldest; payloads relay byte-identical (unicode
  included); sender identity is SERVER-stamped (`from` is never client-claimed).
- **Q6 (stability under load):** 500 synthetic connections in 125 rooms of 4;
  every member says once; every roommate receives exactly one message; zero
  frames to non-members; FIFO order exact under interleaved queue load; caps
  hold at their boundaries.
- **Q7 (latency):** loopback echo p95 over 200 pings < 250 ms and envelope
  relay p95 < 2 000 ms — smoke bounds of record, both far inside the 60 s
  battle clock; the production p95 receipt is the deployed plane's own
  (disclosed, R1).
- **Q8 (leakage census):** every frame emitted across the Q6 scenario soup
  walked recursively: no forbidden field name (score/marks/correct/answer/
  evidence/progress/mastery/posterior/misconception/settlement/grade/…) outside
  the exempt opaque `payload` field; **Q8b (import census):** the file-level
  import law of R6 pinned by reading the source.
- **Q9 (burst law):** the 31st frame inside one second on one connection →
  error + close 1008; ping exempt (liveness is not abuse).
- **Q10 (clock law):** every `at` stamp comes from the injected clock; sweeps
  and TTLs are deterministic under a frozen clock; the plane reads no
  wall-clock inside the state machine.

The wire battery (real Bun WebSocket client over loopback against a real
`Bun.serve`) pins Q1's transport legs and Q7's echo p95 on top of the
in-process state battery; the state battery pins the laws deterministically
with the injected clock.

## R10 — Deployment posture and the of-record seams

Standalone entry `bun run dev:realtime` (`REALTIME_PORT`, default 8081). Boot
keeps the fail-fast env discipline of record: blank `SYLLABAI_JWT_SECRET` or
blank `DATABASE_URL` refuses to start (the same law apps/api boots under — the
DATABASE_URL feeds only the R2 revocation lookup). The plane exposes no HTTP
surface beyond the `/realtime` upgrade (anything else → 404 not_found; failed
auth → Boot-shaped 401). It writes nothing anywhere: no table, no file, no
gradebook — the zero-persistence posture is load-bearing (R3), and the descoped
consumer line(s) file against THESE primitives once they serve (the F-186
descope terms' own words).
