# syllabai-v2 — multi-agent worklog (APPEND-ONLY)

Protocol: after each task (or meaningful attempt), append a section:

    ---
    Task ID: T-MIG-xxx
    Agent: <role><n> (<agent id>)
    Task: <one line>

    Work Log:
    - <steps>

    Stage Summary:
    - <results / decisions / deviations>

Never rewrite, reorder, or delete existing entries. On append conflict:
`git pull --rebase`, then re-append.

---

Task ID: T-MIG-SEED
Agent: R0-integrator (Super Z, operator session trace 347fbb29ca71934f658854f7261bdb83)
Task: Bootstrap the monorepo per operator directive 2026-10-04 ("Create the new repo, clone everything needed in there, create docs, set up, write the complete plan doc").

Work Log:
- Created GitHub repo SyllabAI/syllabai-v2 (public, main) — 2026-10-04
- Shallow-cloned frozen syllabai-hub @ 93226a43edefafb3bfa9d0fddf119948da29fa9a; imported full tree (153MB incl. 80MB content corpus) into apps/hub; pruned .git + .github/workflows; PROVENANCE.md records source+SHA+rules
- Scaffolded bun-workspaces monorepo: root scripts/tsconfig/.gitignore/CI; packages/contracts (zod, auth DTOs ported constraint-for-constraint from core identity DTOs — RegisterRequest 12-char letter+digit floor, join-code gate, UserView/AuthResponse shapes), packages/shared (parity-killer charter), packages/db (Drizzle + Neon serverless client, jdbc:-prefix guard, baseline doctrine)
- Scaffolded apps/api (Hono): GET /actuator/health live with exact {status:UP} parity; POST /api/auth/register|login validate via contracts then answer honest 501 (T-MIG-010 pending); fail-fast env gate ported (blank SYLLABAI_JWT_SECRET/DATABASE_URL refuses boot); bun tests green-by-construction seed
- Committed golden-master harness (golden/runner.ts: selftest + live replay, tolerance rules; cases/health.json) — CI runs selftest
- Wrote docs: MIGRATION_PLAN (waves 0-7, controller port map, risk register R-JWT..R-PII, cutover/rollback, catch-up, DoD), AGENT_COORDINATION (roles R0-R7, claim protocol, file-ownership fences, task yaml format, escalation, anti-patterns), GOLDEN_MASTER, BASELINE_DB, REFERENCE_DOCS (13 pack ADRs + core/hub doc maps with frozen-repo raw links)
- Seeded .syllabai/tasks/: T-MIG-000/001/002/003/010/011 (master-pack T-C42 yaml convention; scope.allowed fences)
- CI note: hub intentionally NOT in the CI build lane until T-MIG-000 (153MB corpus + bun install scope)

Stage Summary:
- Repo live: https://github.com/SyllabAI/syllabai-v2 · core/hub untouched (C1 honored) · same-Neon constraint embedded in docs + client code guards · next: assign agents to T-MIG-000/001/002/003 (three parallel lanes, disjoint files)

---

Task ID: ORIENTATION (prerequisite gate for all my lanes; claim commit for T-MIG-000)
Agent: R7-flex (Super Z, z.ai session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Phase-1 orientation per the operator briefing — tour the frozen org, read the platform docs + the six binding ADRs + T-C42 format + bench-receipt heritage, then post this entry before any of my PRs merge.

Work Log:
- Read, in order: v2 README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog tail → all six T-MIG task yamls; then syllabai-core (README, render.yaml, docs/DEPLOYMENT.md), syllabai-hub docs (ARCHITECTURE, REPOSITORY_MAP), master-pack ADR-031/025/036/034/020/023 + .syllabai/tasks/T-C42.yaml + bench/review receipts (e.g. fa1-recon-20261003 REPORT.md with its 9-check asserted verification table and SHA256SUMS manifest).

Stage Summary:
- Product loop in my own words: SyllabAI is an AI-assisted exam-prep platform (pilot: Edexcel IGCSE Chemistry 4CH1) where students self-register as STUDENTs, browse a curriculum-anchored course hub (spec tree → revision notes, exam questions, flashcards) and attempt questions that are either self-marked against the published scheme or smart-marked per part by a pipeline of deterministic validators (bounds/mark-sum/coverage) with an LLM that is never the final truth and a κ ≥ 0.60 gate before student-facing expansion. Every attempt emits append-only evidence telemetry that updates the learner model (BKT mastery stored as the post-practice anchor P₀; BDT misconception probabilities; forgetting decay COMPUTED at every read from (P₀, last_practiced_at, now), never persisted — ADR-031) and feeds recommendations, review scheduling and the flashcard ladder. A retrieval-grounded tutor/CLA answers only from validated grounding chunks with numbered citations and refuses deterministically when evidence is empty; it explains but never awards marks — Smart Mark is the single marking authority (ADR-025: per-part, bounded, no chatbox). Teachers run classes, rosters, marking queues, curriculum validation gates (unvalidated content never serves), knowledge-graph/coverage/analytics surfaces; research endpoints are k-anonymized on the wire with k=5 at learner-unit granularity (ADR-036). One Neon Postgres + pgvector is the single data substrate for relational + graph + vector data; the frozen Java core serves it from Render with the Next.js hub on Vercel, and v2 re-platforms the backend to TypeScript against the SAME database via strangler-fig, verified by golden-master replay.
- Correctness mechanism 1 — receipts: every claim ships recorded evidence. Concrete example: master-pack bench/review/fa1-recon-20261003/REPORT.md records a SELECT-only first-hand verification with a 9-check asserted table (retired orphan = REJECTED, 16/16 relabels, serving gate "4,593 — exactly the last pin", zero unaccounted audit writes) plus a SHA256SUMS manifest over every artifact; v2 continues this as .syllabai/receipts/ per PR.
- Correctness mechanism 2 — fail-fast at boot: misconfiguration refuses to start instead of limping. Concrete example: blank SYLLABAI_JWT_SECRET refuses boot (render.yaml generateValue + DEPLOYMENT.md §1), and missing R2 secrets log a boot-time WARN then fail LOUDLY at first storage use with the missing setting names — no silent local-disk fallback. The v2 api seed already ports this verbatim (blank SYLLABAI_JWT_SECRET/DATABASE_URL refuses boot).
- Correctness mechanism 3 — pre-registration + honest verdicts: decisions are argued and rejected-alternatives recorded BEFORE implementation, and results report what is NOT known. Concrete examples: ADR-031 documents that its regression test REPLACED a test that had asserted the buggy write-through, and honestly records that pre-existing rows carry unrecoverable decayed anchors (conservative error direction) rather than claiming a clean fix; ADR-036 stays Status: Proposed until the operator's ACCEPT flip; ADR-034 marks real-device receipt semantics UNVERIFIED-until-live-probe in T-C61.
- Unclear / questions for the operator: (1) the briefing points at syllabai-resources/bench/review/ but at HEAD the bench receipts live in the master pack (SyllabAI/syllabai bench/review/) — syllabai-resources has no bench/ dir; confirm master pack is the receipt heritage. (2) hub docs/ARCHITECTURE.md is titled "syllabai-demo — Architecture" and REPOSITORY_MAP.md still names syllabai-web as the production frontend — is syllabai-hub the renamed syllabai-web lineage, and is there a hub-specific architecture doc I missed? (3) T-MIG-000's scope.allowed omits .syllabai/receipts/** and .syllabai/worklog.md, while AGENT_COORDINATION §2.5/§5 mandate receipts + worklog appends for every PR — I read the coordination doc as the binding general law (process artifacts always in-fence) and will note this reconciliation in the task's execution_record; confirm. (4) decay double-schedule guard: v2 Cron must stay env-gated OFF until Wave 7 cutover (BASELINE_DB §4.3) — confirm no Wave-0 work depends on it. (5) sandbox egress: api.neon.tech is unreachable (HTTP 000) and Groq returns 403 from this session's IP — Neon read/introspection tasks (T-MIG-002/003) may need a different egress or operator-side capture; noting early.
- Self-selection: briefing role slot was blank → claimed T-MIG-000 (lowest-id P0, no deps, unblocks T-MIG-003; zero overlap with any other claim — none existed at claim time) as R7-flex (workspace/CI lane). Claim recorded in the same commit as this entry per AGENT_COORDINATION §2.1.

---

Task ID: T-MIG-000
Agent: R7-flex (Super Z, z.ai session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Workspace unification — hub as first-class bun workspace package + CI hub lane.

Work Log:
- Claimed per protocol (branch t-mig-000/r7, CLAIMED + claimed_at in commit f8455f4 alongside my ORIENTATION entry; no competing claims or open PRs at claim time — verified against origin + PR list)
- Renamed apps/hub package syllabai-hub → @syllabai/hub (scripts byte-unchanged); deleted apps/hub/bun.lock; root bun install → root bun.lock committed (1826 pkgs, 8.27s)
- Full import-vs-manifest audit of apps/hub/src (script kept at my session's scripts/hub_dep_audit.py): bun 1.3 isolated workspace installs exposed undeclared direct imports that the old hub-local lockfile had masked via transitive hoisting — @tiptap/core (peer-dep trap), unist-util-visit-parents, @types/node, @types/hast, vfile. All declared at frozen-tree versions; ZERO source changes
- ci.yml: verify job now installs once from the root lockfile (--frozen-lockfile); added hub job (frozen install + bun run --cwd apps/hub build, 30m timeout)
- Verified locally: typecheck exit 0 · bun test apps/api packages 4/4 · golden/runner.ts --selftest OK · api boots with {"status":"UP"} · hub full production build green (corpus prebuild verify + Next 16.3.8 Turbopack + standalone)
- Receipts: .syllabai/receipts/T-MIG-000/run-001-local-verify.json (CI run id to follow in run-002-ci.json)

Stage Summary:
- T-MIG-000 exit criteria met locally; PR opened for R0 (status IN_REVIEW; DONE is R0's write)
- Two doctrine gaps flagged for R0 in the PR body: (a) scope.allowed omits the receipts/worklog process artifacts that §2.5/§5 mandate; (b) dep-declaration additions beyond the yaml parenthetical, forced by the task's own exit criterion — both narrowly scoped and recorded in execution_record
- For the next lane (T-MIG-002/003): this sandbox cannot reach api.neon.tech (egress HTTP 000) and Groq returns 403 from here — Neon-backed tasks need different egress or operator-side capture; noted in my Orientation entry
