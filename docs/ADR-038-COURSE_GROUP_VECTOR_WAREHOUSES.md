# ADR-038: Course-Group Vector Warehouses on a Single Neon Account

- **Status:** ACCEPTED (operator-delegated decision, trace 1a16869e9139f859 "figure it out"; capacity + account analysis trace 1a168662122cb201) — **RATIFIED 2026-10-23 by operator plan statement (trace 1a168885359acda1): main DB = identity + learner model, corpus = other databases. Placement is operationalized and binding in `docs/DATA-PLANE-PLACEMENT.md`.**
- **Date:** 2026-10-23
- **Related:** ADR-037 (official papers wiring), T-MIG-138 (4MA1 roll instrument), NEON-DB-LOSS run-001 receipt (the incident that escalated this ADR from "parked design" to "of-record")
- **Supersedes:** none. **Amends:** the single-project deployment assumption held since the v2 cutover.

## 1. Context

The tutor plane vectorizes **per course**: past papers + mark schemes + student books + Subject Intelligence docs (revision notes explicitly deferred — lowest-value quadrant, substantial overlap with books/SI; add later only on measured tutor failure). Tutors are course-scoped, so retrieval is naturally partitioned by course.

Two events made this decision non-optional:

1. **The 1 GB wall.** The production project (`ep-ancient-cake-a52e4kfd`) hit the Neon Free-plan per-project storage ceiling (official behavior at >1 GB: any insert/update/delete that would grow storage **fails**). Wave-16 (11 official 4CH1-2CR sets) landed on top of a 335 MB (33%) base measured 2026-10-22 and pushed the project to the limit.
2. **The overnight DB loss (2026-10-22 → 23).** The production database was dropped/recreated operator-keyed during the storage incident (see `.syllabai/receipts/NEON-DB-LOSS/run-001`). All 71 tables and persisted content were lost server-side. Recovery is deterministic re-derivation from git — which works only because content law never made the DB the sole copy. This ADR adds the guardrails so a 1 GB ceiling can never again create that pressure, and so losing a warehouse can never lose more than that warehouse.

## 2. Verified Neon Free plan inventory (checked 2026-10-23 against neon.com/pricing, /docs/introduction/plans, /faqs/free-plan-limits-and-quotas)

| Resource | Free allowance |
|---|---|
| Projects | 100 |
| Postgres storage | **1 GB per project, 20 GB account-wide cap** |
| Compute | 100 CU-hrs/project/mo; autoscale ≤ 2 CU; scale-to-zero @ 5 min (non-disableable) |
| Branches | 10 per project |
| Public network transfer | 5 GB/project/mo |
| Instant-restore history | 6 hours, capped at 1 GB of change history |
| Manual snapshots | **1** |
| Object Storage | 5 GB per project |
| Managed Better Auth | 60,000 MAU |

At-limit behavior (official FAQ): per-project >1 GB → growing writes fail; account >20 GB → same even if no single project is full; CU-hours/transfer exhausted → compute suspended until the monthly reset. **No limit ever deletes data** — the Oct-22→23 loss was an operator-keyed drop, not a platform purge.

## 3. Decision

**One Neon account. A fleet of course-group warehouse projects beside the main of-record project.** Never multiple accounts.

### 3.1 Account decision

Multiple accounts to multiply free limits is rejected:
- The Neon AUP defers to the Databricks Platform AUP; the exact clause could not be quoted from the sandbox, but free-tier multiplication is the canonical abuse-ban pattern — and the downside (all data behind abuse detection, entire $0 stack down, no recourse) is asymmetric against an upside of a few GB.
- Zero cross-account operations: no PITR, branches, migrations, or monitoring across accounts — the Oct-22→23 loss coordination happened entirely inside one console; fragmentation would have made it worse.
- N accounts = N tokens/secrets against an already-overdue rotation list.
- Legitimate multi-account (a real second owner, e.g. a tenant school with its own org) remains available *when a real second owner exists* — it is org tenancy then, not limit evasion.

### 3.2 Topology

- **P0 — main of-record project** (existing `ep-ancient-cake-…`): relational core (71 tables), auth, API serving. Target ≤ 600 MB after the bytea offload (question_asset/revision_note_asset → Neon Object Storage, 5 GB free; drop 8 legacy 4CH1 papers; vacuum). Runs migrations; never hosts vectors.
- **P1..Pk — course-group vector warehouses**: each holds one frozen template: `pgvector` extension, single `chunks` table (content, course_slug, source-kind, ref), HNSW index. No migrations per warehouse, ever — the template is provisioned by script (Neon API, one token) exactly like the frozen drivers (T-TEACH-011 protocol).
- **Group sizing:** 94 hub courses × 50–150 MB/chunk-plane = 4.7–14.1 GB full-archive corpus. Groups of 5–10 courses, each warehouse held ≤ ~0.8 GB (headroom under 1 GB); fleet ≈ 10–19 projects; account total stays well under 20 GB. Books-heavy courses get smaller groups; shared-textbook families (the 4× CIE A-Level Maths 2020 courses) share chunk rows via a course↔chunk map — store once, filter many.
- **Satellite quarantine:** the assignments prototype (template schema + neon_auth on the prod endpoint, 18 MB) stays experimental, is not of-record, and is excluded from the fleet. Fold-in goes through the core's existing classroom domain (`assignments`/`classes`/`class_members`) + the auth extension (ADR path B: same HS256 JWT, additive oauth_accounts/verification tables) — never as a second identity system.

### 3.3 Retrieval seam (two-step)

1. `vector_search(course_slug, k)` on the owning warehouse → chunk ids (+ distances)
2. hydrate ids against main (or a warehouse-local content cache) for real text/metadata

A static `course_slug → warehouse` map lives in main. Deterministic resolver anchors (bank/card/store) keep zero embeddings (T-MIG-138 law) — only semantic search gains a hop. Cross-warehouse queries are forbidden by construction; a course lives in exactly one group.

### 3.4 Backup law (new, incident-driven)

Free-plan durability (6h PITR, 1 manual snapshot) is **not** a backup strategy. Of-record additions:
- Nightly logical `pg_dump` of main → Neon Object Storage (5 GB) with 7-generation rotation; warehouse dumps weekly (they are re-derivable).
- Quarterly restore drill: a dump must actually restore into a scratch branch.
- The git re-derivation chain (archive → instruments → waves) remains the deep-recovery law, as proven by run-001's acceptance gate.

## 4. Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Single store forever | Wall re-arrives at the 2nd/3rd subject wave (already arrived); no blast-radius isolation — the Oct-22→23 loss hit everything at once |
| Project per course (94) | 100-project cap nearly exhausted; 20 GB ÷ 94 ≈ 213 MB average (books-heavy courses breach); 94 endpoints/branches/snapshots operationally unmanageable |
| Multiple accounts | §3.1 — asymmetric ban risk, zero cross-account ops, secrets sprawl |
| Launch plan now | Not rejected forever — $0.35/GB-mo is the escape hatch if the fleet ever approaches 20 GB; not needed at current scale; revisit at trigger |

## 5. Sequencing (trigger already fired)

1. Restoration completes (recovery_order in NEON-DB-LOSS run-001) — single-writer until census parity.
2. Trim pass on main: bytea → Object Storage; legacy drop; vacuum → ≤ 600 MB.
3. Provisioner script (Neon API → frozen template SQL) + first warehouse: **maths group** (4MA1 + the A-Level Maths 2020 family, deduped).
4. Wave migration per group with parity census + zero-residue drop from main (`document_chunks` shrinks toward zero on main as groups land).
5. Tutor retrieval seam flips warehouse-first per course behind a flag (133c-style flip law).

## 6. Consequences

- Positive: the 1 GB wall disappears as an operational class; tutor blast radius shrinks to a group; main stays lean and migration-clean; CU-hours stay near-zero (warehouses are read-mostly, scale-to-zero).
- Costs: one extra hop on semantic retrieval; a provisioner + router map to own; dumps to schedule.
- Honest residuals: egress (5 GB/project/mo) is untested against real student traffic; free CU-hours could bind if a warehouse serves hot traffic (mitigation: hydrate cache on main, or Launch for the hot warehouse only); the fleet's group boundaries are mutable but every move is a receipted migration, never a silent re-shard.
