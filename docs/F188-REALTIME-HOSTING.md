# F-188 realtime plane — hosting decision of record and serving-receipt protocol

**Decision date:** 2026-10-24 · **Operator word:** "0$ credit card less hosting"
(chat trace `1a16a78dc3415ff5`) · **Decision class:** zero-cost, no-credit-card
hosting for the ADR-038 realtime plane of record (`apps/api/src/realtime/server.ts`
— the standalone Bun-native WebSocket transport, path `/realtime`).

This document is the hosting-line place of record: the landscape the decision was
made against (surveyed live 2026-10-24), the decision itself, the disclosed
posture trade-offs of the chosen class, and the protocol by which "the plane
SERVES in a deployment of record" (the sole lift condition of the F-186
realtime-infra gate arm, operator ruling trace `1a1693693b033a2d`) is evidenced.

## 1. The constraint, precisely

ADR-038 fixes two hard facts the hosting decision must respect:

1. **The plane is a long-lived process.** It is deliberately NOT the Vercel
   serverless fetch-handler entry, which cannot hold persistent connections
   (ADR-038 R1). Serverless functions are architecturally excluded — this is not
   a price trade-off, it is the decision of record.
2. **The plane's state is ephemeral process-local** (ADR-038 R3). Nothing is
   persisted, so the host needs no disk durability; restarts drop state and are
   already disclosed posture, not a violation.

The operator's word adds two constraints: **$0 cost** and **no credit card** at
signup. The plane's only database use is the revocation lookup (`createJwtAuthenticator`
→ `UsersRepository` via `createSql` on `DATABASE_URL` — the Neon Postgres of
record), which is reachable over the public internet with TLS, so the host needs
no private networking.

## 2. Landscape surveyed (live, 2026-10-24)

| Platform | Verdict for this line | The fact of record |
| --- | --- | --- |
| **Render — free web service** | **SELECTED** | No card for the free tier (exceeding limits suspends — never charges without a payment method); 750 free instance-hours/month (~one full month for a single service); Docker runtime supported; WebSockets supported; spin-down after 15 min without inbound traffic — WebSocket messages count as inbound, so live sessions keep the plane awake; ~1 min wake; ephemeral filesystem; Render "may restart a Free web service at any time". |
| Koyeb | EXCLUDED | Card-free entry removed February 2026: new accounts start on Pro behind a $29 pre-authorization hold (Mistral acquisition). |
| Fly.io | EXCLUDED | Credit card required for all organizations except Linked Organizations; smallest always-on machine is a paid $2.19/month. |
| Hugging Face Spaces | EXCLUDED | Free CPU Basic tier eliminated and Docker/Gradio SDKs locked behind ZeroGPU restrictions for unpaid accounts (mid-2026); free Docker Space creation greyed out. |
| Glitch | EXCLUDED | App hosting shut down (2025). |
| Railway | EXCLUDED | One-time trial credit, then a payment method is required — not $0 forever. |
| Oracle Cloud Always Free | EXCLUDED (constraint) | Genuinely free ARM VMs, but a card is required for signup verification — fails the operator's no-card constraint. |
| Cloudflare Workers + Durable Objects | EXCLUDED (architecture) | Free tier is cardless and supports WebSockets, but it is a different runtime and state model than the Bun-native, process-local posture of record — deploying the plane there would require a new ADR-level decision, not a hosting choice inside ADR-038. |
| Deno Deploy | EXCLUDED (architecture) | Cardless free tier, but Deno runtime — the transport of record is Bun-native; a port is a new decision. |
| SnapDeploy (free tier) | FALLBACK 1 | Cardless, 4 web-service containers, ~100 instance-hours/month, scale-to-zero on browser-visit wake; a young platform — held as fallback, not primary. |
| Self-host + Cloudflare Tunnel | FALLBACK 2 | $0 and cardless if an always-on machine exists; a laptop-class host is not an acceptable deployment of record unless the operator explicitly accepts the uptime posture. |

## 3. The decision of record

**Primary: Render free web service, Docker runtime, built from
`apps/api/Dockerfile.realtime` (repo-root Blueprint `render.yaml`), region
Frankfurt.** The image runs `bun apps/api/src/realtime/server.ts` with
`REALTIME_PORT` mapped from the platform-injected `PORT` by the image CMD —
the server of record is not modified by one byte for hosting.

**Fallback ladder (in order, each only if the previous is unavailable):**
SnapDeploy free → self-host + Cloudflare Tunnel (only with the operator's
explicit uptime acceptance) → a cardless edge runtime (new ADR required).

## 4. Disclosed posture of the chosen class (binding on this line)

These are accepted facts of the free class of record, not defects of the plane:

- **Idle spin-down:** 15 minutes without inbound traffic spins the service down;
  the next HTTP request or new WebSocket connection wakes it (~1 minute; Render
  shows a loading page to browsers). WebSocket messages from existing
  connections count as inbound traffic — a live battle keeps the plane awake for
  the whole session. Between sessions the first joiner eats the ~1-minute wake.
- **Keep-alive, if ever wanted, must target `/realtime`:** while spun down,
  Render intercepts `/robots.txt` itself (a keep-alive pointed there silently
  proves nothing); a GET on `/realtime` from a spun-down state wakes the
  service, and once awake the plane answers it fail-closed (401 without
  credentials — which still counts as inbound traffic).
- **Ephemeral filesystem:** identical in spirit to the plane's own R3 posture —
  nothing the plane does depends on disk state surviving.
- **Restarts at platform will:** ADR-038 already discloses that a restart drops
  in-memory presence, rooms, queues, and TTL'd ghost envelopes.
- **750 instance-hours/month** (~a full month for one always-awake service).
  Exceeding included limits suspends the service until next month; without a
  payment method Render suspends rather than bills — the operator's no-card
  constraint is structurally safe.
- **No private networking on free:** irrelevant here — the revocation lookup
  reaches the Neon endpoint of record over public TLS.

## 5. Environment contract of record (the only three the plane reads)

| Variable | Meaning | Value class |
| --- | --- | --- |
| `PORT` → `REALTIME_PORT` | Render injects `PORT`; the image CMD maps it to the plane's `REALTIME_PORT` (default 8081). | platform-managed |
| `SYLLABAI_JWT_SECRET` | The identity law of record (≥32 bytes; the plane refuses to start without it; must equal the Java core secret per the R-JWT wire-parity contract). | operator secret — set in the Render dashboard, never committed |
| `DATABASE_URL` | Neon Postgres of record; the plane's ONLY database use is the JWT revocation lookup. | operator secret — set in the Render dashboard, never committed |

## 6. Serving-receipt protocol (what lifts the gate)

The F-186 realtime-infra gate arm lifts when the plane **serves in a deployment
of record**. The evidence of record is a **serving receipt (run-002 of the
F-188 line)**, produced by `apps/api/scripts/realtime-serving-probe.ts` against
the deployed `wss://…/realtime` endpoint:

1. **Authenticated handshake** — a real JWT of record resolves the upgrade
   (the `?bearer=` browser-compat leg); the plane answers `welcome` with its
   connection id, the principal's user id, server time, and the full caps table.
2. **Loopback round-trip** — `ping` → `pong` with the observed latency against
   the 60s battle-clock smoke bound.
3. **Presence round-trip** — `room.join` → `presence.snapshot` membership →
   `room.leave`, proving the ephemeral state plane serves, not merely binds.
4. The transcript (URL, timestamps, verdict JSON, deployed image git SHA) is
   filed to `.syllabai/receipts/F188-REALTIME/` and referenced from the F-188
   tracker row; the gate arm's lift is then recorded there.

A fail-closed result (401 on unauthenticated attempt) while the authenticated
probe passes is **expected and correct** — it is the identity law doing its job
at the upgrade; it never blocks a receipt that the authenticated leg already
proves.

## 7. The operator's three steps (all that remain)

1. Create a Render account (email or GitHub sign-in — **no card**).
2. Dashboard → New → Blueprint → connect `SyllabAI/syllabai-v2` → the repo-root
   `render.yaml` is picked up (service `syllabai-realtime-plane`); when prompted,
   fill the two `sync: false` values (`SYLLABAI_JWT_SECRET`, `DATABASE_URL`).
   First deploy builds the Dockerfile (~2–4 minutes).
3. Hand the agent the service's `wss://…onrender.com/realtime` URL (and a valid
   learner JWT if a fully authenticated receipt is wanted immediately). The
   agent runs the probe, files the receipt, and records the gate lift.

Full record: `ADR-038-REALTIME_PLANE_STANDALONE_EPHEMERAL_BOUNDARY_STRICT.md`
on the SyllabAI ledger (the architecture of record — this file governs hosting
only) and `docs/F188-REALTIME-PLAN.md` (the build prereg of record).
