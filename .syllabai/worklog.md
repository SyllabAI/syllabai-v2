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
Task ID: ORIENTATION (Phase-1 gate; no code claim before this entry)
Agent: R1-contracts (Super Z, zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Phase-1 orientation per .syllabai/AGENT_BRIEFING.md §2 — tour the org, read platform docs + binding ADRs + task convention, before claiming any task.

Work Log:
- Read (in order): v2 README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog tail → all 6 T-MIG yamls (000/001/002/003/010/011, all OPEN at read time, no peer claims visible)
- core (shallow-cloned, read-only): README.md, render.yaml (env surface, sync:false doctrine, healthCheckPath /actuator/health, previewsEnabled:false), docs/DEPLOYMENT.md (provision order, CORS gotcha, decay-window keep-alive contract, 2026-09-14 env-var API misuse disclosure)
- hub (raw-fetched only): docs/ARCHITECTURE.md, docs/REPOSITORY_MAP.md
- master pack: required ADRs 031, 025, 036, 034, 020, 023 read in full; 017/021/027/030/032/033/035 fetched for wave relevance; .syllabai/tasks/T-C42.yaml (the yaml convention: execution_record with traces, scope fences, acceptance, next_safe_actions)
- Receipt heritage located: SyllabAI/syllabai bench/review/ (22 dated lanes; sampled doc-validation-20261004: RUNBOOK.md + SHA256SUMS + independent READ_ONLY postverify JSON, 15/15 PASS format). resources repo NOT cloned (1.1GB; no bench/ at its root)
- Verified toolchain per v2 charter: bun 1.3.14, node v24.21.0, git 2.47.3 — no JDK present (by design)

(a) The product loop, in my own words:
SyllabAI is an exam-preparation platform for Cambridge/Edexcel-style papers (Cycle-1 pilot: Pearson Edexcel IGCSE Chemistry 4CH1, ~50 students). A student self-registers (always STUDENT role; teachers enter only through a valid join code that fails closed; ADMIN is never self-serviceable — a bootstrap path owns it), then studies an authored curriculum whose content passes a validation gate (SUGGESTED → VALIDATED; unvalidated content never serves). The student attempts exam-paper questions, which are marked per-part against validated mark schemes: deterministic normalisation and bounds/coverage/mark-sum validators first, AI suggestions bounded and append-only, teacher review gated by a κ ≥ 0.60 agreement threshold — the LLM is never the final truth. Every attempt emits evidence that updates BKT skill mastery and BDT misconception probabilities (tagged distractors strengthen, correct answers weaken), which drives recommendations and a smart lesson, plus spaced-repetition flashcards whose Ebbinghaus forgetting decay is computed at read time from the stored post-practice anchor P₀ and never persisted (ADR-031). A retrieval-grounded tutor/CLA answers only from validated, retrieved chunks with resolvable [n] citations and honestly refuses when evidence is insufficient (KA-RAG grounding gate). Teachers get classes, marking queues, curriculum/knowledge-graph review surfaces and analytics; the whole thing runs on ONE Neon Postgres+pgvector database behind a Java core that v2 must mirror behaviour-for-behaviour while it keeps serving.

(b) Three correctness mechanisms observed, with concrete examples:
1. Receipts (evidence or it didn't happen). ADR-034's Status line cites both merged PRs with head SHAs, CI check-run id 110827781941, merged SHAs 5a8d57f/2030ef6, and the zero-conflict merge simulation with tsc --noEmit exit 0. The bench lanes ship SHA256SUMS + an independent read-only post-verify (tc75_doc_validate_postverify_result.json: 15/15 explicit checks, each with pass/detail). v2 binds this unchanged: PRs attach .syllabai/receipts/T-MIG-xxx/<run>.json, golden replay output included.
2. Fail-fast at boot (refuse to run misconfigured). render.yaml + DEPLOYMENT.md: blank SYLLABAI_JWT_SECRET refuses startup by design (operator secret ≥32 chars); missing R2 secrets boot with a WARN and then fail loudly on first use naming the missing setting — never a silent local-disk fallback. The v2 seed already ports the doctrine (packages/db client refuses blank/jdbc:-prefixed URLs; api env gate refuses blank SYLLABAI_JWT_SECRET/DATABASE_URL).
3. Pre-registration and honest verdicts (decisions state their evidence and their failure modes up front). ADR-036 ships as PROPOSED and explicitly "does not self-accept" pending operator ratification of PR #62. ADR-031 documents its own bug frankly (nightly write-back compounded decay; m₀=0.8 crosses the review threshold day 8 vs day 26; existing rows keep unrecoverable anchors, error direction conservative) instead of hiding it. ADR-023 records its Slice-G benchmark as BLOCKED-in-authoring-environment rather than claiming a pass, and DEPLOYMENT.md discloses the 2026-09-14 env-var wipe incident verbatim with the API gotcha that caused it.

(c) Unclear — questions for the operator:
1. GEMINI_API_KEYS format: the four briefing values start with "AQ.Ab8RN6…" — not the AIza… form the Spring AI Gemini adapter (and any direct Generative Language API call) expects. Are these an exchange/OAuth intermediate requiring a different transport, or mis-pasted? Non-blocking for waves 0–1; Wave 6 needs an answer.
2. Doc drift in REFERENCE_DOCS.md: master-pack ADRs live at the pack ROOT (ADR-031-DECAY_IS_COMPUTED_NEVER_PERSISTED.md), not docs/adr/; receipt heritage lives at syllabai (master pack) bench/review/, not syllabai-resources/bench/review/. Fix in an R7 docs lane, or leave as-is?
3. GitHub topology: repos live under the USER account "SyllabAI" (the PAT's own account); /orgs/SyllabAI 404s. Is branch protection on syllabai-v2 main enabled (API says repo is public, default branch main)? Procedurally irrelevant to me (never push main) but it changes whether the rule is enforced or cultural. Also: syllabai-web (12th repo, production frontend per REPOSITORY_MAP) — confirm it is out of migration scope and hub @ 93226a43 is the one true import base (PROVENANCE.md says yes).
4. Path parity detail: core serves /api/v1/** (DEPLOYMENT checklist, hub client carries the prefix; PR_ENDPOINT_RETARGET.md exists) while the v2 seed registers /api/auth/**. MIGRATION_PLAN §3 makes path parity MANDATORY incl. /actuator/health. My working assumption: v2 api must serve the core's exact path set (/api/v1/** + /actuator/health), with the seed's /api/** mounts either re-pointed or kept-and-deprecated per golden evidence. This gates T-MIG-010/011 and golden capture — needs an integrator word before Wave 1 capture.
5. T-MIG-003 capture needs the Java core booted against a Neon branch (GOLDEN_MASTER §2) but the v2 charter says "no JDK anywhere". Confirm the intended split: capture lane uses an external JDK environment (operator or CI-hosted), or Render preview of the frozen core. Not my lane (R6) — recording the tension.

Stage Summary:
- Orientation gate satisfied; no code written yet. Claiming T-MIG-001 (contracts wave-1, P0, no deps, fence packages/contracts/** + its task yaml) as R1 — it is on the critical path (unblocks T-MIG-010; auth before everything) and its fence does not overlap T-MIG-000/002/003 lanes. Five operator questions recorded above; none blocks T-MIG-001.

---

Task ID: T-MIG-001
Agent: R1-contracts (Super Z, zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Port ALL identity-domain DTOs (frozen core identity/dto/*) to zod contracts, constraint-for-constraint, + Role enum values.

Work Log:
- Claimed 2026-10-04T18:00:34Z (commit 17796af) after fence-overlap check (only peer branch t-mig-000/r7, disjoint globs)
- Verified the spec in the frozen core (read-only): all 5 dto files + Role.java + AuthController/BootstrapAdminController path evidence (/api/v1/auth/**) + AuthService role-policy lines + Jackson unknown-props default (no override anywhere)
- Rewrote packages/contracts/src/auth.ts: PasswordChangeRequest + roleSchema NEW; fidelity fixes F1–F5 (removed .strict() per Jackson default; @NotBlank refine; isJakartaEmail replacing zod .email() — 'a@b' must be ACCEPTED; roles narrowed to Role names; service-policy boundary documented for T-MIG-010)
- 28 unit pins in packages/contracts/src/auth.test.ts (co-located, inside scope.allowed src/**) — every @Size/@NotBlank/@Pattern/@Email boundary incl. 254/255-char email constructions and the 257-char login-accepts-register-rejects pin
- Receipt: .syllabai/receipts/T-MIG-001/run-001-contracts-identity.json (verification, findings, residuals, fence disclosures)
- Full suite green: 32/32 repo-wide; contracts typeclean; root bun.lock NOT committed (T-MIG-000's file)

Stage Summary:
- T-MIG-001 → IN_REVIEW (PR t-mig-001/r1). Identity contracts are now byte-faithful to the frozen DTOs and unit-pinned; three seed exemplar bugs (strict(), missing @NotBlank, wrong email semantics) fixed with evidence — each is exactly the divergence class golden-master would have caught at capture time, now killed at contract level. Residuals (IP-literal domains, quoted local parts) flagged to R6 instead of silently widened. Pre-existing apps/api typecheck TS2688 (bun-types) reproduced on clean seed — for the T-MIG-000 lane. T-MIG-010 unblocked contract-wise.

---
Task ID: T-MIG-010
Agent: R3-api-a (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Claim T-MIG-010 (Wave 1 identity port) + broadcast Neon base-URL and CI triage intel

Work Log:
- Claimed T-MIG-010 (P1, Wave 1) — was OPEN, no fence collision with CLAIMED/IN_REVIEW lanes (001=contracts, 002=db, 003=golden). Branch t-mig-010/r3 stacked on t-mig-000/r7 (PR #1) + merge of t-mig-001/r1 (PR #2) as declared dev dependency; retargets to main after R0 merges bottom-up.
- Neon intel (unblocks R2/T-MIG-002): api.neon.tech has NO public A record (DoH via 1.1.1.1 AND dns.google: NOERROR, empty answer) — the prior "sandbox egress blocked" verdict was a misdiagnosis. Live API base: https://console.neon.tech/api/v2. Operator-issued org-scoped API key verified working: GET /projects → 200 (project billowing-cherry-15418366 "SyllabAI", org org-withered-mud-59985156). /users/me returns 404 for org keys (expected, not a failure).
- CI triage for PR #2 (T-MIG-001): verify job TS2688 (bun-types unresolvable in apps/api) traces to main having NO committed root bun.lock — fresh un-locked installs break type resolution; main's own CI has been red since seed (runs 37219877411, 37220335246). Local CI-equivalent run of r7+r1 merge: typecheck clean, bun test apps/api packages → 32 pass / 0 fail, golden selftest OK. Receipt-style comment posted on PR #2 requesting R0 merge-order arbitration.

Stage Summary:
- T-MIG-010 in progress. Port surface: register/login/me/password/bootstrap-status/bootstrap-admin per frozen AuthController/AuthService/BootstrapAdminService; JWT HS256 claims parity (sub/jti/uid/ver/roles, TTL PT2H, ≥32-byte secret fail-fast), ver-revocation fail-closed filter, BCrypt cost 12, join-code fail-closed constant-time gate, per-TARGET-account login budget (R5) with 429+Retry-After, ApiError body parity ({status,error,message,timestamp}).
- Scope boundary notes for R0 (goes in PR body): (a) per-IP RateLimitFilter (com.syllabai.ratelimit M1 filter) is NOT in T-MIG-010's title/scope — flagged for routing as its own micro-task; (b) mount-path parity /api/auth → /api/v1/auth plus app-level require-auth for unknown /api/v1/** both need apps/api/src/index.ts (outside this task's fence) — shipped as a separate OUT-OF-FENCE commit in the PR for R0 ratification per §6.1.
