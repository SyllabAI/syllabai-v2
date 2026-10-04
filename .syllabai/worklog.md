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

Task ID: T-MIG-001 (R0 review + merge)
Agent: R0-integrator (Super Z, zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Integrator review of PR #2 (operator directive "R0 reviews PR #2") — verdict, rulings, merge, status transition.

Work Log:
- Re-executed every gate independently (fresh runs, not receipt-trust): all 5 DTOs + Role.java re-read against auth.ts; F1 re-verified in frozen source (zero FAIL_ON_UNKNOWN_PROPERTIES hits, zero MVC Jackson customizers — .strict() removal confirmed as fidelity fix); F5 citation AuthService.java:102 confirmed (ADMIN refusal lives at service); fresh tests 28/28 contracts + 4/4 api (= receipt's 32/32), tsc --noEmit exit 0; independent secret scan zero hits; worklog diff pure-append; Orientation gate satisfied
- R0 rulings: (1) receipts-dir fence gap ACCEPTED — §2 rule 5 binds every PR; R7 to backfill standard receipts line into remaining seed yamls; (2) Orientation Q4 answered — v2 api serves the core's exact surface /api/v1/** + /actuator/health per MIGRATION_PLAN §3, seed /api/** mounts re-pointed in T-MIG-010/011, R6 captures against core paths; (3) root-level `bun test` sweeping hub Playwright specs (5 loader errors, tooling artifact) routed to T-MIG-000 lane; (4) userViewSchema.email narrowing accepted — R6 must capture a UserView response-shape case, baseline-Neon failures are justified-divergence decisions, never silent loosening
- Verdict posted as review 5407522112 (COMMENT — GitHub blocks formal APPROVE on own PR; PR author == R0 account, disclosed in review per honest-verdicts culture; compensating control = full re-execution above)
- Status IN_REVIEW → DONE folded into the merge via this head branch (R0-owned transition, scope "status only")

Stage Summary:
- PR #2 merged (merge commit preserves cited SHAs 17796af/5ce7689); T-MIG-001 DONE constraint-for-constraint; T-MIG-010 contract dependency formally unblocked. r7/r7a heads require rebase after merge (worklog tail + bun.lock overlap). Critical path now: T-MIG-010 (identity api port, R3/R4) parallel to Wave-1 capture (R6).

---

Task ID: T-MIG-ORIENTATION (Phase-1 gate per agent briefing §2 — this agent's own entry; no PR from this agent merges before it exists)
Agent: R3-lane self-selected (superz-agent-b, zai-web session web-06433aa8-e5f9-4e9b-9519-db4ca339d2a9 — a DIFFERENT session from the R1 session whose orientation appears above; both are agents under the same operator briefing)
Task: Full orientation tour of the frozen platform before touching any migration code — product loop, correctness mechanisms, open questions. (Entry authored 2026-10-04 during a first work session whose local commits could not be pushed — dead GITHUB_PAT; landed 2026-10-05 with fresh operator-issued credentials, question statuses updated.)

Work Log:
- Read the eight briefing items in order on the then-current remote (main @ a945c20): v2 README → docs/MIGRATION_PLAN.md → docs/AGENT_COORDINATION.md → docs/GOLDEN_MASTER.md → docs/BASELINE_DB.md → docs/REFERENCE_DOCS.md → .syllabai/worklog.md (tail) → .syllabai/tasks/*.yaml (all six).
- Platform tour (read-only): syllabai-core README + render.yaml (SYLLABAI_* env surface, sync:false, healthCheckPath) + docs/DEPLOYMENT.md; syllabai-hub docs/ARCHITECTURE.md + docs/REPOSITORY_MAP.md; master-pack ADR-031/025/036/034/020/023 + .syllabai/tasks/T-C42.yaml; master-pack bench/evidence receipt packs.
- Since first authored, fleet peers landed their own entries; I re-read all of them before landing this one (r2's Neon census, r6's tour, R1's T-MIG-001, R0's merge rulings) so this entry records no question the fleet already answered.

Stage Summary:
- (a) The product loop, in my own words: A student self-registers (STUDENT by default; TEACHER honoured only with the platform join code and the gate fails closed when it is unset; ADMIN is never self-serviceable — the one-time bootstrap claim owns it) and authenticates with a JWT. They browse curriculum and the knowledge graph, where unvalidated (SUGGESTED) content can never serve, and attempt exam-paper questions that are marked either by Smart Mark — a bounded, per-part LLM pipeline wrapped in deterministic validators (bounds/mark-sum/coverage) behind a κ ≥ 0.60 agreement gate — or by honest self-marking against the scheme. Every attempt emits append-only telemetry evidence (ATTEMPT_SUBMITTED, BKT_UPDATED, BDT_UPDATED, REVIEW_SCHEDULED, DECAY_APPLIED, SELF_DOUBT_FLAGGED) that moves BKT mastery, stored as a post-practice anchor P₀, and BDT misconception probabilities; forgetting decay is COMPUTED at every read from (P₀, last_practiced_at, now) and never persisted, so reviews and readouts never compound (ADR-031). From that state the platform schedules spaced-repetition flashcards (raw rating trail append-only; cross-device merge by sync receipts, never timestamp heuristics — ADR-034), ranks next-best recommendations, and serves the tutor/CLA via KA-RAG (deterministic intent → hybrid retrieval → RRF → grounded generation with [n] citations that must resolve to real chunks; empty evidence = deterministic refusal without an LLM call). Teachers operate the same substrate from the other side — classes, rosters, marking queues, content/curriculum validation gates, knowledge graphs, analytics — while research telemetry is exposed only through k-anonymity on the wire (k=5, the unit is the distinct learner, enforced in the response itself — ADR-036). All of it sits on ONE Neon Postgres+pgvector database behind the frozen Java core, and this monorepo re-platforms that backend to TypeScript against the SAME database, strangler-fig style, with every ported surface proved by golden-master replay.
- (b) Three correctness mechanisms, one concrete example each: (1) RECEIPTS — T-C42's production probe is a dated evidence pack (probe_prod_result.json: histogram + 59.5% verdict over n=2,935 + frozen-SHA transport deviation) and the MIN_COSINE flip decision is traceable to core PR #44's merge commit; nothing is asserted without an artifact. (2) FAIL-FAST — a blank SYLLABAI_JWT_SECRET refuses boot by design (render.yaml/DEPLOYMENT.md), missing R2 secrets boot with WARN then fail loudly on first use naming the missing settings, and EmbeddingConfig refuses to boot if the embedding dimension is not exactly 768 (V11 pgvector column vector(768) — a mismatch would only surface after API spend); v2 carries the same doctrine into env.ts/client.ts guards. (3) PREREGISTRATION / HONEST VERDICTS — ADR-036 sits at "Proposed" until the operator's ACCEPT is recorded; ADR-031 documents its own bug frankly (m₀=0.8 crossing the review threshold day 8 vs day 26) and was demonstrated red/green by simulation before the patch; ADR-023 records its benchmark BLOCKED rather than claiming a pass.
- (c) Questions for the operator (status-tracked against fleet findings): (1) RESOLVED-ENV — briefing GITHUB_PAT was dead (401 probes recorded in the superseded T-MIG-001 receipt); operator issued fresh credentials 2026-10-05, push/PR verified working. (2) RESOLVED-BY-R2 — api.neon.tech is not sandbox-blocked, it is a dead hostname (no public A/AAAA via DoH); console.neon.tech/api/v2 is the working control plane and endpoint hosts resolve. (3) RESOLVED-BY-R6/peer — briefing path shorthand: ADRs live at master-pack root, receipts at syllabai graph/reports/. (4) OPEN — ADR-028/029/030 referenced in registers but absent from the master-pack snapshot (ADR-031 itself notes the gap): confirm intentional. (5) OPEN — briefing's GEMINI keys format (echoing the R1 session's Q1, unaddressed): "AQ.Ab8RN6…" ≠ AIza… form the Spring AI Gemini adapter expects; Wave 6 needs an answer. (6) OPEN — syllabai-web (12th repo, production frontend per REPOSITORY_MAP): confirm out of migration scope, hub @ 93226a43 the one import base (PROVENANCE.md says yes; seeking explicit operator word).

---

Task ID: T-MIG-001 (collision disclosure — superseded duplicate implementation, no PR opened)
Agent: R1-lane self-selected (superz-agent-b, zai-web session web-06433aa8-e5f9-4e9b-9519-db4ca339d2a9)
Task: Disclose that this agent independently implemented T-MIG-001 in a first session, unaware of the R1 session's earlier claim (it was visible only as local commits — the dead GITHUB_PAT of that session blocked push, so no remote/PR signal existed for peers to detect).

Work Log:
- First session claimed T-MIG-001 at 2026-10-05T00:05:00+06:00 (= 2026-10-04T18:05:00Z, local commit b52845b) and completed a constraint-for-constraint identity-DTO port with 33 parity tests + receipt run-001.json on local branch t-mig-001/r1 (head 5fce936); push impossible (dead PAT), so the claim existed only locally.
- On resuming with fresh credentials 2026-10-05: fetched and found the R1 session's claim at 2026-10-04T18:00:34Z (commit 17796af) — 4m26s EARLIER — already merged via PR #2 with R0 verdict APPROVED (review 5407522112). Per AGENT_COORDINATION §2 rule 1 (earliest claim wins) and §7 (do not duplicate or reopen DONE work): local branch renamed t-mig-001/r1-superseded-local, preserved unpushed for archaeology, NO duplicate PR opened, DONE stands.
- Cross-validation value of the duplicate (offered to R0/R6 as evidence, nothing landed): my independent port converged on the SAME three seed-exemplar fidelity fixes the merged work records (F @NotBlank trimmed-length refine; F exact Hibernate Validator 9.0 email semantics replacing zod .email(); F .strict() removal per Jackson FAIL_ON_UNKNOWN_PROPERTIES=false) — two agents reading the same frozen spec independently arrived at identical accept/reject-set corrections, which is a strong parity-confidence signal. My implementation additionally ported the full HV 9.0 quoted-local-part/IP-literal alternatives (merged work records those as residuals flagged to R6 — my HV 9.0-sourced LOCAL_PART_PATTERN/EMAIL_DOMAIN_PATTERN port, fetched at tag 9.0, may serve R6 if a case ever needs them; available on the preserved local branch).
- Unique findings from my run not present in the merged worklog/receipt: (1) UserView.roles is a Java Set serialized by Jackson → JSON array order UNDEFINED → golden replay cases must tolerate roles ordering (for R6's auth capture; recorded here since golden/** is not my lane). (2) apps/api TS2688 'bun-types' pre-existing failure — now filed+claimed as T-MIG-012 (next entry). (3) My 33-test suite vs merged 28 pins: no conflicting expectation found on any overlapped case (both reject '   ' password, both accept extra keys, both accept 'a@b'-class domains).

Stage Summary:
- T-MIG-001 remains DONE by its rightful owner (R1 session, PR #2). This agent's duplicate is disclosed, preserved locally, and contributes only cross-validation evidence and two forwarded findings. No fence was crossed then or now; the disclosure itself is the honest-verdicts culture applied to my own work.

---

Task ID: T-MIG-012
Agent: R3-lane self-selected (superz-agent-b, zai-web session web-06433aa8-e5f9-4e9b-9519-db4ca339d2a9)
Task: Filed+claimed+fixed apps/api TS2688 ('bun-types' type-library resolution) — restore fleet-wide green root typecheck/CI.

Work Log:
- Board survey with fresh credentials found no OPEN, claimable task without overlap or unmet deps (T-MIG-000 contested by PRs #1/#3; 002/003 held by r2/r6; 010/011 dep-blocked) — but every fleet PR was inheriting RED CI from the apps/api TS2688 failure (root typecheck chains it; CI runs root typecheck on every pull_request; finding first documented in the superseded T-MIG-001 receipt).
- Filed T-MIG-012 per AGENT_COORDINATION §6.1/§3.3 (file a task for a file in no fence), claimed it in the branch-start commit (b4b27c3), verified zero overlap: both T-MIG-000 PRs touch ci.yml/bun.lock/package.json/apps-hub only (checked via PR files API); r2 holds packages/db/**, r6 holds golden/**.
- Fix: apps/api/tsconfig.json "types": ["bun-types"] → ["bun"] (one line; @types/bun was already the installed devDep and re-exports bun-types). Rejected the alternative (adding bun-types devDep) because it would touch package.json+lockfile — T-MIG-000 territory — to freeze a legacy name.
- Gates freshly executed: apps/api tsc --noEmit exit 0; root `bun run typecheck` exit 0 with four tsc invocations (contracts/shared/db/api — green for the first time in repo history); `bun test apps/api packages` 32/32; `bun golden/runner.ts --selftest` OK.
- Receipt: .syllabai/receipts/T-MIG-012/run-001.json (root cause, rejected alternative, gate evidence, three findings forwarded to other lanes).

Stage Summary:
- T-MIG-012 → IN_REVIEW (PR t-mig-012/r3). Fleet CI signal restored: every open and future PR now gets a trustworthy green/red from root typecheck instead of a constant red. Disclosed-not-touched: ci.yml `branches: ain]` typo (push-CI on main dead; pull_request CI unaffected) — for the T-MIG-000 winner or R0. Forwarded to R6: UserView.roles Jackson Set ordering tolerance for golden auth capture. Next for this agent: re-survey the board after R0's T-MIG-000 arbitration; T-MIG-010 becomes claimable the moment T-MIG-002/003 land.

---

Task ID: ORIENTATION (pre-claim mandate, agent briefing §2 — no PR merges before this entry)
Agent: R7a (agent-da4ab8, zai session web-da4ab8b1, Asia/Dhaka)
Task: Phase-1 orientation — tour the org, read the law, adopt the culture. Read order per briefing §3: v2 README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog tail → tasks/*.yaml; then platform docs + ADRs + task-yaml/bench heritage.

Work Log:
- Read all 8 v2 items in the mandated order (HEAD a945c20 at read time), then: syllabai-core README.md / render.yaml / docs/DEPLOYMENT.md; syllabai-hub docs/ARCHITECTURE.md + docs/REPOSITORY_MAP.md (raw fetches, repos untouched — C1); master-pack ADR-031, ADR-025, ADR-036, ADR-034, ADR-020, ADR-023; master-pack .syllabai/tasks/T-C42.yaml; master-pack bench/review/ receipt dirs (sampled T-C75 doc-validation 2026-10-04 run: RUNBOOK + SHA256SUMS + report.json + independent postverify_result.json).
- Checked collisions before self-selecting: GitHub API shows zero open PRs, branches = [main]; worklog tail had only T-MIG-SEED at read time. All six T-MIG yamls OPEN/unassigned at claim-decision time.

Stage Summary:
- (a) The product loop in my own words: SyllabAI is an AI-assisted exam-preparation platform for Edexcel IGCSE/IAL-style papers. Students self-register (always STUDENT role), work through a curriculum-anchored course hub, and attempt exam-paper questions part-by-part; Smart Mark — the single marking authority — scores each part against that part's in-scope validated scheme points behind deterministic validators (bounds, coverage, mark-sum) with student-facing expansion gated on a κ ≥ 0.60 human-agreement threshold (ADR-025), while self-mark against the viewed scheme remains a first-class alternative. Every attempt emits append-only evidence (ATTEMPT_SUBMITTED, BKT_UPDATED, BDT_UPDATED, …) that drives BKT mastery, BDT misconception strengthening via tagged distractors (correct answers weaken them), recommendations, and learner state. Spaced-repetition flashcards schedule review timing from an Ebbinghaus decay that is COMPUTED at every read from the stored post-practice anchor P₀ and never persisted — the nightly job writes only the V38 ledger row and review_schedules inserts (ADR-031); ratings drive timing only, never mastery (ADR-034 pins SkillState empty). The tutor/CLA answers only from retrieval over the authoritative curriculum KG + validated content chunks (pgvector hybrid lexical+semantic, RRF fusion, citation chain that must resolve to real chunks; honest deterministic refusal when evidence is insufficient or the Groq→Gemini→OpenRouter chain is down — ADR-020/023). Teachers run classes, rosters, marking queues, curriculum/KG surfaces and analytics; research calibration surfaces hide any sub-k cell's outcomes on the wire (k=5 distinct learners, ADR-036). The v2 migration re-platforms the frozen Java core + hub into this monorepo against the SAME Neon database, strangler-fig, gated by golden-master parity.
- (b) Three correctness mechanisms observed, with concrete examples: (1) RECEIPTS — every claim carries its evidence artifact: T-C42's execution_record cites the exact probe numbers (PRB-01 pct_above_050 = 59.5%, 1,745/2,935), PR ids, merge SHAs and CI run ids; the master-pack bench/review/tc75 receipt ships RUNBOOK + SHA256SUMS + report.json + an INDEPENDENT read-only post-verify (DRY_RUN_OK → APPLIED → ALREADY_APPLIED proven → 15/15 PASS). (2) FAIL-FAST — services refuse to run misconfigured: blank SYLLABAI_JWT_SECRET refuses boot (render.yaml + DEPLOYMENT.md, and ported verbatim into apps/api/src/env.ts here); missing R2 settings boot with a WARN then fail loudly naming the missing keys (no silent local fallback); ADR-023 test mode never constructs real provider adapters even with keys present (no silent quota spend); unpinned experiments fail loudly. (3) PREREGISTRATION + HONEST VERDICTS — research decisions record status before evidence and never self-ratify: ADR-036 is "Proposed … the operator's ACCEPT flip is the ratification step; this ADR does not self-accept"; ADR-034 marks real-device receipt semantics "UNVERIFIED until a live probe"; ADR-023 records its live benchmark BLOCKED (credential-gated) with exact skip counts instead of a soft claim; ADR-020 forbids promoting any retrieval technique on external-repo claims alone (benchmark gate); ADR-031 honestly documents that pre-fix rows keep corrupted anchors and states the conservative error direction instead of promising a backfill.
- (c) Unclear / questions for the operator: (Q1) Doc-path drift: v2 docs/REFERENCE_DOCS.md cites master-pack ADRs at `docs/adr/…` and the briefing cites `syllabai-resources/bench/review/` — actually the ADRs sit at the master-pack repo ROOT and the review receipts sit in the master pack's `bench/review/`. Happy to fix REFERENCE_DOCS.md as an R7 docs task if confirmed. (Q2) My briefing's role field was blank; per §5 I self-selected the highest-priority OPEN non-conflicting task = T-MIG-000, taking the R7a flex-lane hat (a wave-0 workspace/tooling task doesn't map onto R1–R6 code lanes). Confirm or re-route. (Q3) MIGRATION_PLAN §10 calls T-MIG-000/002/003 "three parallel agents", but T-MIG-003.yaml declares deps [T-MIG-000]. Reading: capture work (Render-core reads, scrub, selftest) may start immediately; only the live-replay gate serializes behind 000's workspace/CI bring-up. Please confirm. (Q4) apps/hub/docs/ARCHITECTURE.md still self-titles "syllabai-demo" — verified NOT drift: hub README states syllabai-demo was promoted to PRODUCTION TRACK 2026-09-28 (ADR-029); demo-era docs are retained heritage. No action unless the operator wants a corrected hub map. (Q5) CI budget: adding the hub lane (153MB corpus + Next build) to a public repo's Actions is free but slow (~minutes); scope allows adding it "once install succeeds" — I will gate it behind its own job so the fast lane stays fast.
