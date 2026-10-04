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

---

Task ID: T-MIG-000
Agent: R7a (agent-da4ab8, zai session web-da4ab8b1, Asia/Dhaka)
Task: Workspace unification — hub becomes a first-class bun workspace package (@syllabai/hub), single root lockfile, CI hub lane.

Work Log:
- Claimed per briefing §5 after collision check (no open PRs, branches=[main], all yamls OPEN); claim + ORIENTATION entry committed as 9516045 on t-mig-000/r7a
- Renamed hub package to @syllabai/hub (scripts byte-identical); git rm apps/hub/bun.lock per scope
- Generated root bun.lock with @syllabai/{api,contracts,db,hub} as workspace members
- Diagnosed + fixed bun 1.3 isolated-linker breakage: root bunfig.toml pins linker="hoisted" (Turbopack could not resolve @tiptap/core / unist-util-visit-parents through the symlink layout; hoisted = hub's legacy layout, versions unchanged)
- Made hub's phantom import explicit: @tiptap/core ^3.31.3 in apps/hub/package.json (v3 peer-only dep, undeclared); root devDependency bun-types ^1.3.14 for apps/api tsconfig types:['bun-types']
- CI: verify job → root bun install --frozen-lockfile; new hub job (install + build:hub in its own 30-min lane)
- Gates: typecheck 4x clean · bun test 4/4 (honest-501 suite) · golden selftest OK · hub production build PASS (corpus-verify prebuild + full Next route table) · corpus byte-unchanged (git status)
- Receipt: .syllabai/receipts/T-MIG-000/run-01.json (deviations D1-D4 flagged for R0)

Stage Summary:
- T-MIG-000 → IN_REVIEW (PR open; R0 flips DONE). Wave 0 advance: workspace + CI ready for T-MIG-003 golden bring-up and T-MIG-002 db baseline lane.
- Decisions for peers: (1) root lockfile is now the single source of install truth — per-directory bun installs are obsolete, use root bun install --frozen-lockfile; (2) if your sandbox bun fails typescript resolution with "No version matching", clear ~/.bun/install/cache (stale-cache sandbox issue, not repo); (3) hub builds under hoisted layout only — keep linker=hoisted unless R0 rules otherwise.

---

Task ID: T-MIG-000 (run-02: R0 ruling 3 executed + rebase)
Agent: R7a (agent-da4ab8, zai session web-da4ab8b1, Asia/Dhaka)
Task: While PR #3 awaits R0 — execute R0 review 5407522112 ruling 3 (root `bun test` sweeping hub Playwright specs) on the T-MIG-000 lane; rebase per R0's "r7/r7a heads require rebase after merge".

Work Log:
- Rebased t-mig-000/r7a onto 2cfaf41 (T-MIG-001 merge). One conflict: worklog tail — resolved append-only (main's entries kept, my ORIENTATION entry appended at tail; chronological inversion vs commit timestamps disclosed in receipt run-02).
- Reproduced R0's artifact: bare `bun test` at root = 51 pass / 5 fail / 5 errors, all five playwright/lib loader errors from apps/hub/tests/e2e/*.spec.ts.
- Fix (root lane): bunfig.toml [test] pathIgnorePatterns = ["apps/hub/tests/e2e/**"]. A/B verified (revert -> 5 errors reproduce; re-apply -> 0). Surgical pattern chosen over apps/hub/** after precision check: hub has a legit bun unit test (src/lib/answer-format.test.ts, 19 tests) the broad pattern silently dropped (32 vs 51 tests) — rejected.
- Gates on rebased head: 4x typecheck clean; bare root bun test 51/51 0 errors (CI's scoped `bun test apps/api packages` unchanged, same 51); golden selftest OK; hub production build PASS; corpus byte-unchanged.
- Receipt: .syllabai/receipts/T-MIG-000/run-02.json (includes residuals: Playwright e2e has no CI runner lane — R5/budget decision, out of this lane).

Stage Summary:
- PR #3 head updated on top of post-T-MIG-001 main; ruling 3 closed on the T-MIG-000 lane. Repo invariant for peers: bare `bun test` at root is now safe (51/51). Remaining R0-directed R7 item: ruling 1 receipts-line backfill into remaining seed yamls — next PR, kept separate to preserve review granularity.

---

Task ID: ORIENTATION (Phase-1 gate; same commit claims T-MIG-002)
Agent: R2-db (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Phase-1 orientation per AGENT_BRIEFING §2 — tour the frozen org, read the platform docs + the six binding ADRs + T-C42 convention + bench-receipt heritage, before claiming any task.

Work Log:
- Read (in order): v2 README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog tail → all six T-MIG task yamls; re-fetched origin mid-flight (fleet moved: T-MIG-000 now PRs #1+#3, T-MIG-001 PR #2)
- Frozen platform docs: syllabai-core README + render.yaml (SYLLABAI_* env surface, sync:false, healthCheckPath, previewsEnabled:false) + docs/DEPLOYMENT.md (provision order, jdbc:→DATABASE_URL mapping, CORS mismatch gotcha, decay-window keep-alive contract, 2026-09-14 env-wipe incident disclosure); syllabai-hub docs ARCHITECTURE + REPOSITORY_MAP
- Master pack (raw-fetched): ADR-031 (decay computed at read, never persisted), ADR-025 (Smart Mark per-part, no chatbox, κ gate), ADR-036 (k-anonymity on the wire, learner-unit k=5), ADR-034 (receipt-based trail merge, no timestamp heuristics), ADR-020 (educational retrieval engine, authoritative-KG boundary), ADR-023 (LLM pool: structured failure classes, config-failure suppression, fail-closed modes); .syllabai/tasks/T-C42.yaml (the yaml convention with trace-cited execution_record + next_safe_actions)
- Receipt heritage sampled: master-pack bench/review/bridge-reconciliation-20261002/REPORT.md (SHA256SUMS manifest, verdict-first structure, per-number instrument pinning)
- Verified my lane's substrate: packages/db client.ts (jdbc:-prefix + blank-URL fail-fast guards), drizzle.config.ts (strict, DATABASE_URL-driven, "schema is generated not hand-written"), db:pull/db:check scripts present
- Environment probes (bun 1.3.14 / node v24.21.0): api.neon.tech does NOT resolve — DoH queries (dns.google + cloudflare-dns.com) return NOERROR with zero A records, i.e. the hostname has no public address; the Neon control-plane API is reachable at https://console.neon.tech/api/v2 (token verified, project billowing-cherry-15418366 "SyllabAI" pg18 listed). This resolves R7-flex's egress question: it is not sandbox egress blocking, it is a dead hostname.
- Neon census (read-only): branches = production (br-muddy-bar-a5huwldd, primary) + t-mig-002/r2 (br-dry-sun-a5wsx9n1, parented on production, NO compute endpoint) + preview/fix/tutor-math-mhchem + vercel-dev; endpoint hosts resolve (IPv6) from this sandbox.

Stage Summary:
- Product loop in my own words: SyllabAI is an AI-assisted exam-prep platform (pilot: Edexcel IGCSE Chemistry 4CH1, ~50 students) where students self-register as STUDENTs (teachers arrive only via a fail-closed join code; ADMIN exists only through a bootstrap path) and study curriculum content that serves only after passing a teacher validation gate (SUGGESTED → VALIDATED — unvalidated content never serves). They attempt exam-paper questions that are marked per part against validated mark schemes: deterministic normalisation and bounds/coverage/mark-sum validators run first, the LLM only proposes and is never the final truth, and student-facing expansion waits behind a κ ≥ 0.60 agreement gate (ADR-025: one marking authority, bounded, no chatbox). Every attempt emits append-only telemetry that updates the learner model — BKT skill mastery stored as the post-practice anchor P₀, BDT misconception probabilities (tagged distractors strengthen, correct answers weaken) — while Ebbinghaus forgetting decay is computed at every read from (P₀, last_practiced_at, now) and never persisted, which is what makes nightly catch-up runs exact and reruns idempotent (ADR-031). From that state come recommendations, smart lessons and a flashcard ladder whose cross-device history merges by sync receipts, never by timestamp heuristics (ADR-034); the tutor/CLA answers strictly from grounded retrieval with citations that must resolve to real chunks and refuses deterministically on empty evidence. Teachers get classes, marking queues, curriculum/KG validation and analytics; research surfaces hide any cell with fewer than 5 distinct learners on the wire itself (ADR-036). One Neon Postgres+pgvector database backs relational, graph and vector data alike, the frozen Java core serves it from Render, and this repo re-platforms that backend to TypeScript against the SAME database, strangler-fig style, with every ported surface proved by golden-master replay.
- Correctness mechanism 1 — receipts (evidence or it didn't happen): T-C42's execution_record cites the probe instrument, the exact numbers (59.5% above-0.50 over n=2,935), CI run ids and merge SHAs in one trace; bench reports ship SHA256SUMS over every artifact. v2 binds the same: .syllabai/receipts/T-MIG-xxx/<run>.json per PR.
- Correctness mechanism 2 — fail-fast (refuse to run misconfigured): blank SYLLABAI_JWT_SECRET refuses boot by design; missing R2 secrets boot with a WARN then fail loudly on first use naming the missing settings — no silent fallback. v2 already inherits it: packages/db refuses blank or jdbc:-prefixed DATABASE_URL.
- Correctness mechanism 3 — pre-registration + honest verdicts: ADR-031 discloses that the regression test REPLACED one asserting the buggy write-through, and that pre-existing rows keep unrecoverable anchors (conservative error direction); ADR-036 stays PROPOSED until the operator's ACCEPT; ADR-023 records its benchmark BLOCKED-in-authoring-environment rather than claiming a pass.
- Unclear / questions for the operator: (1) BASELINE_DB §3 row-count spot checks say "read through the Java core (or its seeded receipts)" — no JDK exists in this toolchain by charter; I intend to take the counts via SELECT-only SQL against the task branch (copy of production end-state). Confirm that is an acceptable read instrument for the checklist. (2) docs never state the Neon API base; api.neon.tech is DNS-dead and console.neon.tech/api/v2 works — worth one line in BASELINE_DB.md (R2 lane can add it with R0's word; staying out of docs/ this run per fence). (3) The Neon branch t-mig-002/r2 (br-dry-sun-a5wsx9n1) pre-exists my claim with no endpoint and no git trace — likely a predecessor session that died before claiming. I reuse it (adding my own endpoint) rather than duplicating; if a live claim surfaces, earliest-claim-wins applies and R0 arbitrates. (4) T-MIG-000 has two competing PRs (#1 r7, #3 r7a) — R0 merge-authority call, noted for the fleet.
- Self-selection: briefing role slot was blank → claimed T-MIG-002 (P0, wave 0, zero deps, unclaimed; fence packages/db/** + own receipts/yaml is disjoint from every active lane) as R2-db. Claim recorded in the same commit as this entry per AGENT_COORDINATION §2.1.

---

Task ID: T-MIG-002
Agent: R2-db (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: DB baseline — drizzle-kit pull of the Neon end-state onto a branch, verify, commit schema.

Work Log:
- Claimed T-MIG-002 (claim commit ab9928d, includes my Phase-1 ORIENTATION entry above); branch t-mig-002/r2
- Neon: reused the pre-existing name-conformant branch t-mig-002/r2 (br-dry-sun-a5wsx9n1, copy-on-write of production; no git trace of a prior claim — D2 in receipt), added read_write endpoint ep-small-sun-a5ufn5s6; production compute never contacted; all reads SELECT-only
- Baseline: drizzle-kit pull against the branch URL → 62 tables / 579 columns / 87 indexes / 54 FKs / 98 check constraints / 0 views / 0 enums; artifacts relocated byte-identical into packages/db/src/schema/** + packages/db/drizzle/**
- Typecheck + runtime proof on the REPO's drizzle-orm 0.38.4: tsc --noEmit clean; all 62 tables importable via getTableConfig
- BASELINE_DB §3 checklist executed live: 9/9 PASS (inventory triple-match, 579/579 column parity, flyway 63 rows read-only + never-managed note, row-count spot checks, pgvector 0.8.6 + vector(768), client.ts env guards proven)
- Receipts: .syllabai/receipts/T-MIG-002/run-001.json + run-001-verification.json (findings F1–F3, deviations D1–D2, next_safe_actions)

Stage Summary:
- Baseline COMMITTED and gated: the Drizzle schema now exists from the live end-state (never replayed), flyway_schema_history modelled-but-never-managed and documented in the schema README, core-owned bookkeeping tables enumerated, production untouched
- Fleet-relevant findings: F1 control-plane base is console.neon.tech/api/v2 (api.neon.tech is DNS-dead — no public A record; resolves R7-flex's ORIENTATION egress question); F2 the declared kit^0.30+orm^0.38 pair cannot run db:pull (gel-core import + squasher ZodError on a null-expression index) — package.json realignment flagged for the lane owner (outside my fence); F3 two deterministic renderer fixes applied scriptedly and proven snapshot-faithful (5 default sites, 3 customType shim sites)
- Follow-ups recorded (all outside my fence): wire `export * from "./schema"` into packages/db/src/index.ts; align packages/db package.json drizzle versions; R7 one-liner doc note for the Neon API base

---

Task ID: ORIENTATION (pre-claim, Phase 1 deliverable)
Agent: R6 (superz-golden, zai-web session web-6ea7f4ac-d538-4f4f-821f-7e51e0c25cc0)
Task: Phase-1 orientation tour of the frozen org before any migration code — syllabai-core, syllabai-hub, master-pack ADRs + T-C42, syllabai-resources receipt heritage.

Work Log:
- Read v2 docs in mandated order (README, MIGRATION_PLAN, AGENT_COORDINATION, GOLDEN_MASTER, BASELINE_DB, REFERENCE_DOCS, worklog, tasks/*).
- Toured syllabai-core: README, render.yaml, docs/DEPLOYMENT.md, JwtService + EmbeddingConfig boot gates, GlobalExceptionHandler/ApiError, controller inventory.
- Toured syllabai-hub: docs/ARCHITECTURE.md, docs/REPOSITORY_MAP.md, package.json, next.config.ts, api.ts/core-proxy.ts env coupling, mathNormalize.ts.
- Read all 13 master-pack ADRs (root-level files, not docs/adr/) + .syllabai/tasks/T-C42.yaml; toured syllabai-resources (receipts actually live in graph/reports/, not bench/review/).

Stage Summary:
(a) THE PRODUCT LOOP, in my own words: SyllabAI is an exam-preparation platform for Pearson Edexcel-style papers (pilot: IGCSE Chemistry 4CH1, ~50 students). A student registers (teachers gate themselves in via join codes), studies a curriculum-aligned content corpus organized around official specification points, attempts exam-paper questions, and gets them marked by Smart Mark — the single marking authority, scored per QuestionPart against teacher-validated scheme points — or by honest self-marking against the scheme. From that evidence the platform computes (never persists, ADR-031/032/035) a learner model: BKT mastery with format-aware guess rates, misconception posteriors that age toward the population prior, and Ebbinghaus decay over frozen-per-practice bands; a deterministic next-best-action engine turns that state into recommendations and a review agenda that becomes exam-aware (days-to-exam tier) without ever letting learners type their own exam dates. Flashcard reviews run on an append-only rating trail merged by sync receipts, driving review timing only — never mastery. The tutor/CLA is retrieval-grounded against the curriculum graph + pgvector embeddings and refuses deterministically when grounding is empty; the teacher side runs enrollment-scoped marking queues, class knowledge graphs, coverage analytics, and revision notes. All of it sits on one Neon Postgres (+pgvector) behind a Java 25 Spring modular monolith on Render's free tier, with a Next.js 16/bun hub on Vercel; the org runs the whole thing like a research program: every claim carries a receipt, every gate fails closed, every verdict is recorded even when negative.

(b) THREE CORRECTNESS MECHANISMS, one concrete example each:
  1. RECEIPTS — ADR-034 makes flashcard trail-merge identity receipt-based: every device rating carries sync: "core"|"local", written at the only moment truth is knowable (the submit outcome), because "receipts, not timestamps, are the cross-side identity"; the same culture shows in T-C42's execution_record quoting operator trace 1a0f8d431a7cbc8d, PR #44, merge 5ef132b, and CI run ids as a matter of course.
  2. FAIL-FAST — JwtService's constructor throws IllegalStateException at Spring boot when SYLLABAI_JWT_SECRET is blank or <32 bytes ("must be set to at least 32 bytes"); EmbeddingConfig likewise refuses to boot if the embedding dimension is not exactly 768, because the V11 pgvector column is vector(768) and a mismatch would only surface after API spend. The v2 api's src/env.ts ports this discipline verbatim.
  3. PREREGISTRATION / HONEST VERDICTS — ADR-033's C4 ships a pre-registered calibration review protocol ("one variable per PR, predicted signature before merge, post-change checkpoint with revert", admissibility floors 35/100/400, "an empty bin is no evidence, never good evidence"); the production probe reports κ as N/A until validated content exists rather than faking a green check, T-C69 records "verdict NOT PROMOTED (a finding)" as its deliverable, and ADR-036 explicitly refuses to self-accept (operator ratification is a separate recorded step).

(c) QUESTIONS FOR THE OPERATOR (unclear points):
  1. api.neon.tech currently has NO public A/AAAA record (verified via Google + Cloudflare DoH); console.neon.tech/api/v2 serves the same control plane and works with NEON_PAT. Should BASELINE_DB/AGENT_COORDINATION document console.neon.tech as the fallback host for agents whose resolvers fail on api.neon.tech?
  2. Briefing shorthand vs reality: master-pack ADRs sit at repo ROOT (not docs/adr/), and syllabai-resources receipts live in graph/reports/ (not bench/review/). Confirm the briefing is shorthand and REFERENCE_DOCS.md's paths should be re-baselined to actual tree locations.
  3. Doc drift inside frozen core: README says "Flyway V1–V14" and a 13-module map; the tree has 63 migrations and ~24 top-level packages. MIGRATION_PLAN already says 63 — confirm the FILE TREE (not core docs) is the authoritative port-map source.
  4. Path-parity gap found in the seed: core serves /api/v1/auth/** (hub client agrees) but the v2 scaffold mounts /api/auth (no v1). My golden cases will record the CORE's real paths; the mount fix belongs to T-MIG-010's fence. Flagging here so R3 doesn't discover it mid-port.
  5. T-MIG-003's dep T-MIG-000 is IN_REVIEW (PR #1). Proceeding on the seed tree since golden/** + apps/api are untouched by the hub workspace unification — confirm that reading of the dependency.

---

Task ID: T-MIG-003
Agent: R6 (superz-golden, zai-web session web-6ea7f4ac-d538-4f4f-821f-7e51e0c25cc0)
Task: CLAIM T-MIG-003 (golden-master bring-up) — branch t-mig-003/r6, claim recorded in the task yaml in this same commit (claim protocol §2.1).

Work Log:
- Peer-collision check before claiming: open PR #1 = T-MIG-000 (R7, in review); git branches t-mig-000/r7 + t-mig-001/r1 pushed; Neon branch t-mig-002/r2 created 2026-10-04T18:12:33Z (R2 active — hands off packages/db/**). T-MIG-003 was the highest-priority OPEN task with no overlapping claim.
- Feasibility probe passed: Render core URL resolves (read-only capture source); Maven Central + Adoptium DNS OK (local Java boot for write-surface capture possible); bun toolchain live for replay half.
- Scope fences honored: golden/**, .syllabai/receipts/capture/**, task yaml only.

Stage Summary:
- T-MIG-003 claimed at 2026-10-04T18:17Z by R6. Execution begins: capture health+auth cases from the frozen core (Render for read-only surfaces; Neon branch + local boot for write surfaces if feasible), scrub deterministically, prove the live replay gate against a booted v2 api, receipts to .syllabai/receipts/T-MIG-003/.

---

Task ID: T-MIG-003
Agent: R6 (superz-golden, zai-web session web-6ea7f4ac-d538-4f4f-821f-7e51e0c25cc0)
Task: Golden-master bring-up — capture health+auth golden cases from the frozen core, scrub, prove the live replay gate against a booted v2 api.

Work Log:
- Claimed T-MIG-003 at 2026-10-04T18:17Z (same commit as branch t-mig-003/r6) after collision checks: PR #1=T-MIG-000 (R7, in review), branches t-mig-000/r7 + t-mig-001/r1 exist, Neon branch t-mig-002/r2 created 18:12Z (= R2 active on T-MIG-002 — hands off packages/db/**).
- Session A (READ-ONLY, Render core): woke syllabai-core.onrender.com (~105s), captured 11 cases — health + every DTO validation boundary + unknown-email 401 + both role gates. Zero production writes; probe write-safety proven from frozen source ordering (@Valid → dup-email → role gates → save) BEFORE probing.
- Session B (WRITE surfaces, branch only): built the frozen core locally (Temurin JDK 25.0.4.1, Maven 3.9.16, mvn -DskipTests package exit 0), created Neon branch t-mig-003/r6 (COW of production; pre-boot verification: 62 tables, 63 flyway rows, pgvector 0.8.6 + vector(768) columns, questions 1526 / attempts 217 / users 322), booted it (prod profile, 512MB heap, port 8090) — Flyway validated 63 migrations and ran NONE. Captured 5 write cases: register 201, duplicate 409, login 200, wrong-password 401, /me 200. Exactly one synthetic STUDENT account created on the branch.
- Scrubbed deterministically; committed 16 golden cases (each with source line + tolerate list).
- Proved the LIVE gate: v2 api booted locally; --selftest OK (run twice — before/after a one-line runner hardening: null request body now means absent, construction only, diff engine untouched); full --target replay 0/16 PASS with every failure classified expected-pending + owned. The 0/16 IS the deliverable: it is T-MIG-010's acceptance worklist, expressed as recorded evidence.
- Findings F-1..F-5 recorded in .syllabai/receipts/T-MIG-003/run-001.json: F-1 seed health case stricter than the real core (case corrected, justified:true, R0 approval requested); F-2 mount gap /api/auth vs /api/v1/auth; F-3 501-pending + ApiError shape; F-4 fail-fast env gate exported but NEVER wired (blank-secret boot proven live); F-5 runner GET-body crash (fixed in-lane).
- Receipts: .syllabai/receipts/capture/2026-10-04/run-001-render-core.json, run-002-neon-branch-boot.json, .syllabai/receipts/T-MIG-003/run-001.json. Raw captures kept outside the repo (nothing to scrub — synthetic from creation). Branch credentials in a 0600 env file outside all repos; branch deletable after review.

Stage Summary:
- The capture→scrub→replay→diff loop is LIVE and proven end-to-end with 16 real cases covering the whole auth surface (happy paths, every validation boundary, both fail-closed role gates — teacher join-code is a 403, captured not assumed — and the no-factor-echo 401s).
- Wave-1 replay blockers are now precisely known and owned: remount /api/v1/auth (T-MIG-010), port handlers to ApiError shapes (T-MIG-010), add actuator groups field (one-liner for R0 to route), wire requireEnv (R0 to route).
- Zero writes to production anywhere in the run; Neon branch t-mig-003/r6 (br-divine-mode-a5xur4zv) can be dropped once this PR merges.

---

Task ID: R7-housekeeping (R0 review 5407522112 ruling 1)
Agent: R7a (agent-da4ab8, zai session web-da4ab8b1, Asia/Dhaka)
Task: Backfill the standard receipts scope line into remaining seed yamls, per R0 directive.

Work Log:
- Surveyed all six T-MIG yamls with exact-id grep: 002/010/011 have the line from seed; 001's gap is DONE/merged + disclosed (left untouched — post-merge amendment would be audit noise); exactly two MISSING: T-MIG-000, T-MIG-003.
- Patched both: added `- ".syllabai/receipts/T-MIG-000/**"` and `- ".syllabai/receipts/T-MIG-003/**"` to scope.allowed (2 added lines total, 0 removed, no other field touched). For 003 the capture/** fixtures dir is kept separate from run receipts.
- Receipt: .syllabai/receipts/R7-housekeeping/ruling1-receipts-backfill.json (discloses the self-referential receipts-dir gap this directive inherently creates, and the merge-order interaction with PR #3).

Stage Summary:
- Ruling 1 closed. Every OPEN task yaml now grants its own receipts dir; §2 rule 5 (receipt in every PR) is enforceable by fence-check, not goodwill. Branch r7/yaml-receipts-backfill off 2cfaf41 → PR.

---

Task ID: UNBLOCK-SEQUENCE (R0)
Agent: R0-integrator (Super Z, operator session trace 1a10848acd9adae9; operator directive "act as R0 and execute")
Task: Execute the unblock sequence from the 2026-10-05 status audit — merge the ready set, arbitrate the T-MIG-000 duplicate, restore green CI, rebuild the mis-stacked T-MIG-010 lane.

Work Log:
- PR #6 (T-MIG-012) merged FIRST after R0 stripped an accidental root bun.lock from its head (ruling commit b7ef4a5: the artifact contradicted the run-001 receipt's own "zero lockfile changes" fence claim and carried the pre-rename workspace name; canonical lock is T-MIG-000 territory). Gates re-executed on the stripped head: typecheck exit 0 across all four workspaces (first green root typecheck in repo history), 32/32 tests, golden selftest OK. Merge 0f03d9d.
- T-MIG-000 duplicate arbitrated: PR #3 (r7a) selected over PR #1 (r7) — conflict-free, canonical @syllabai/hub rename + root lockfile + CI hub lane + bunfig test-scoping. PR #1 closed with full ruling comment (r7's receipts preserved at ad95235 for archaeology). Rebased r7a onto 0f03d9d (worklog union), force-pushed 2da8a54, gates re-executed (frozen-lockfile install 917 pkgs, typecheck x4, 32/32, selftest). Merge 9d1f1f3.
- CI ON MAIN GREEN for the first time: push runs 37226776868 (0f03d9d) and 37227133159 (9d1f1f3) both success — verify lane AND the new 153MB hub build lane. The push-trigger was verified character-by-character to target [main] (sandbox display corruption initially made it read as a typo; ords 91/93 confirmed brackets intact — see sandbox note below).
- T-MIG-010 lane rebuilt: original t-mig-010/r3 was stacked on the now-closed PR #1 head. R0 cherry-picked the claim commit 0462fd3 onto 9d1f1f3, retargeted the yaml claim note (dev-dep T-MIG-002/003 serialize only the live replay gate; port work proceeds), resolved worklog union, force-pushed f6d11b4. Lane is now cleanly claimable-in-progress against current main.
- PR #4 (T-MIG-002 db baseline) rebased onto 9d1f1f3 (worklog union), force-pushed 4ede01b, gates re-executed incl. 1319-line schema.ts / 1032-line baseline SQL sanity. Merge 01c41d4.
- PR #7 (T-MIG-003 golden bring-up) rebased onto 01c41d4 (worklog union), force-pushed 9d0e5b1, gates re-executed: 16 case files verified on disk, hardened-runner selftest OK. Merge 06cf362.
- PR #5 (R7 housekeeping, ruling 1 backfill) rebased onto 06cf362, verified purely additive (one receipts-dir scope line per yaml + receipt + worklog), pushed 4d4c430, merge 60a0bad.
- R0 housekeeping commit: T-MIG-000/002/003/012 yamls IN_REVIEW -> DONE with merge evidence; this worklog entry appended.
- SANDBOX NOTE for future agents: this session's tool transport corrupted typed string literals AND display output (invisible chars injected into heredocs/scripts; bracket sequences silently dropped from displayed output — [main] displayed as ain]). Countermeasures used: structural detection instead of literal matching (startswith/contains probes built from chr() codes), character-code verification for critical strings, git object-store as source of truth over worktree/file views, persisted scripts over heredocs (scripts/ dir in the operator workspace).

Stage Summary:
- ALL 7 fleet PRs resolved (2,3,4,5,6,7 merged; 1 closed superseded). Wave 0 COMPLETE: T-MIG-000/001/002/003/012 all DONE, CI green on main @ 60a0bad incl. hub lane. T-MIG-010 lane rebuilt and unblocked (deps satisfied: 001/002/003 merged) — Wave 1 identity port is now the fleet's critical path. T-MIG-011 (hub adapter) OPEN and next-claimable. Board state: 5 DONE, 1 CLAIMED (010), 1 OPEN (011).

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

---
Task ID: T-MIG-010
Agent: R3-api-a (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Port identity/auth module (Wave 1) — register/login/JWT/RBAC/bootstrap-admin, golden-gated

Work Log:
- Read the frozen identity module constraint-for-constraint (AuthController, AuthService, JwtService, JwtAuthenticationFilter, SecurityConfig, User/UserRepository, BootstrapAdmin{Controller,Service,StateStore}, LoginAttemptBudget, GlobalExceptionHandler, ApiError, shared exceptions, application.yml) and ported all 6 endpoints under /api/v1/auth with exact status/message parity (201+Location register, 409 conflict, 403 fail-closed join-code + ADMIN refusal, 401 invalid_credentials no-echo, 429+Retry-After per-TARGET budget, 204 rotation, 409 bootstrap window states, 400 validation_failed with Hibernate-default first-field messages, malformed_body for unreadable bodies).
- JWT R-JWT parity: HS256 with raw-secret key, {alg:HS256} header (no typ), sub/jti/uid/ver/roles + seconds NumericDates, PT2H default, 32-byte fail-fast with verbatim message; parse: absent ver → null → fail-closed mismatch (pre-V46); revocation filter (unknown/disabled/stale-ver → context empty → 401) with one PK lookup per request.
- Jackson binding shims for accept/reject parity: unknown properties ignored, scalar→String coercion, arrays/objects for string fields → malformed_body; null on required fields → "must not be blank" (jakarta order restored where zod chain order differs).
- Built the port inside the T-MIG-010 fence (services/identity/**, routes/auth/**, middleware/**, test/identity/**). OUT-OF-FENCE changes isolated in their own commit for R0 ratification: apps/api/src/index.ts (mount /api/v1/auth parity — fixes the seed's /api/auth path bug; routers-then-401-fallback gives anyRequest().authenticated parity; ApiError error boundary; CORS parity), seed test relocation, declared deps (bcryptjs@3.0.2, @neondatabase/serverless@1.2.0 — registry-verified, lockfile updated).
- Neon branch t-mig-010/r3 created via console.neon.tech/api/v2 (org key); integration tier 4/4 PASS against it: row-level truth (token_version=1, role rows), LIVE ver-revocation after password rotation, teacher join-code path, CONSUMED-window 409 honesty. Driver: WebSocket Client with interactive transactions + FOR UPDATE (HTTP neon() can't do conditional tx) — adapter lives inside the fence; single serialized session, pooling deferred to T-MIG-002.
- Verification: typecheck 0 errors; bun test apps/api packages → 100 pass / 0 fail / 4 skip (integration tier); golden selftest OK. Receipts: .syllabai/receipts/T-MIG-010/run-001-local-verify.json, run-002-integration-neon.json. Task yaml → IN_REVIEW.

Stage Summary:
- Honest gaps (for R0/R6, none silently hidden): (1) golden live-replay gate PENDING on T-MIG-003 capture — no case weakened; (2) true R-JWT cross-verify needs a Java-issued token at capture (unit fixtures are jjwt-semantics-by-construction); (3) per-IP RateLimitFilter (M1) NOT ported — outside task title, recommend micro-task; (4) UserView.roles is a Java HashSet → JSON array order nondeterministic for multi-role users (ADMIN+TEACHER) — golden tolerance should be order-insensitive on roles; (5) freshness: seed's /api/auth 501-honesty stub replaced by the real port — the honest-501 discipline moves to the next unported surface.

---

---
Task ID: ORIENTATION (pre-task entry, briefed per AGENT_BRIEFING §2)
Task ID: ORIENTATION (pre-task entry, briefed per AGENT_BRIEFING §2)
Agent: w0a (self-selected agent — Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Phase-1 orientation — tour the org, read the law, adopt the culture. No code in this entry.

Work Log:
- Read the eight required v2 items in order (README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog → task queue), then toured upstream: shallow-cloned syllabai, syllabai-core, syllabai-resources (sparse: bench/review + manifests), syllabai-ops, syllabai-parser, syllabai-teacher-workbench, syllabai-demo. Read core README + render.yaml + docs/DEPLOYMENT.md; hub docs/ARCHITECTURE.md + REPOSITORY_MAP.md (in apps/hub import); all 13 master-pack ADRs (031, 025, 036, 034, 020, 023 mandated; 017, 021, 027, 030, 032, 033, 035 wave-relevant); .syllabai/tasks/T-C42.yaml; bench/review receipt samples (tc75 doc-validation postverify JSON).

Stage Summary:
- (a) PRODUCT LOOP IN MY OWN WORDS: A student registers on the hub (always STUDENT role; teachers are provisioned behind a join-code gate, ADMIN is never self-serviceable), browses a curriculum that is anchored to an official spec (Edexcel IGCSE/IAL), and practises real exam-paper questions. On submission, the attempt is marked — MCQs deterministically, structured answers by Smart Mark, which normalises the answer, aligns evidence to validated mark-scheme points, applies bounds/mark-sum/coverage validators, and produces append-only results that never let the LLM be the final truth; self-mark against the revealed scheme remains a first-class alternative. Every marked attempt emits an evidence event that updates the learner model — BKT mastery with format-aware guess pricing, BDT misconception posteriors — and those stored values are ANCHORS: forgetting decay (Ebbinghaus) and misconception relaxation are computed at read time and never persisted (ADR-031/032), so review scheduling is exact under late/catch-up runs. From that state the platform derives, also computed-at-read, an explainable next-best-action agenda, spaced-repetition flashcards whose raw rating trail merges across devices by sync receipts rather than timestamps (ADR-034), and smart lessons — while the tutor/CLA answers questions through a KA-RAG chain that retrieves from VALIDATED curriculum-graph nodes and embedded content chunks only, refuses deterministically when evidence is insufficient or the course scope does not resolve (ADR-030), and cites with deep links that must resolve to real chunks. Teachers see classroom-scoped surfaces — marking queues that show only their enrolled learners' answers (ADR-027), coverage/analytics over the knowledge graph, test building — and research surfaces expose calibration statistics under k-anonymity on the wire (k=5 distinct learners, ADR-036). The whole loop is strangler-figged into v2: the frozen Java core keeps serving production while this repo re-platforms each domain behind golden-master parity gates onto the same Neon database.
- (b) THREE CORRECTNESS MECHANISMS OBSERVED: 1) RECEIPTS — every claim carries machine-checkable evidence; concrete example: T-C42.yaml's execution_record records the production probe (PRB-01 pct_above_050 = 59.5%, 1,745/2,935, VALIDATED pool n=2,935) with CI run ids and merge SHAs, and bench/review/tc75 postverify receipts assert row-count invariants ("audit total 2829 -> 2835 (+6 exactly)") with SHA256SUMS alongside. 2) FAIL-FAST — services refuse to boot in a misconfigured state instead of degrading silently; concrete example: render.yaml + core README — blank SYLLABAI_JWT_SECRET refuses startup, R2 storage missing secrets is a boot-time WARN and then loud failures naming the missing setting on first use (no silent local-disk fallback), and v2's packages/db client refuses jdbc:-prefixed or blank DATABASE_URLs. 3) PREREGISTRATION + HONEST VERDICTS — research decisions are written before the evidence and reported with their negative space intact; concrete example: ADR-036 stays Status: Proposed and explicitly says the operator's ACCEPT flip is the ratification step ("this ADR does not self-accept"), and ADR-033's design-challenge record keeps the provisional shortAnswerGuess=0.05 labelled provisional with the empty-bin caveat ("an empty bin is no evidence, never good evidence").
- (c) UNCLEAR / QUESTIONS FOR THE OPERATOR: 1) REFERENCE_DOCS.md cites master-pack ADRs under docs/adr/…, but in the syllabai repo they sit at the repo root — path drift only, or should v2's doc index be corrected? 2) The briefing's "syllabai-resources/bench/review/" receipts directory does not exist in that repo; the receipt heritage actually lives at syllabai (master pack) bench/review/ + evidence/ — confirm the v2 docs may name the true location (doc-fix task candidate for the docs shepherd). 3) apps/api pins zod ^3.24 while the imported hub pins zod ^4.0.2 — will packages/contracts standardise one major (affects every Wave-1+ port), and if so which? 4) For T-MIG-000's CI hub lane: is a full `next build` (with corpus-verify prebuild) required per-PR, or is install+typecheck for hub acceptable until T-MIG-003 lands (build minutes + flakiness trade-off)? I implement build+verify locally and install+build in CI if the runner budget allows, else I record the divergence. 5) Shared zod peer: hub is ESM "type": "module"? — unchecked in this lane; contracts consumers should confirm before Wave-2 (not blocking Wave 0).
Task ID: T-MIG-000
Agent: w0a (self-selected agent — Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Workspace unification — hub becomes a first-class bun workspace package (Wave 0, P0)

Work Log:
- Claimed per AGENT_BRIEFING §5 (branch-start commit 7a6415c, status CLAIMED; remote had no peer claims/branches); Orientation entry above posted first per briefing §2.
- Renamed apps/hub package syllabai-hub → @syllabai/hub (scripts byte-identical, PROVENANCE rule 4 respected); deleted apps/hub/bun.lock (-2152 lines) per scope.
- Generated unified root bun.lock (2355 lines, sha256 head 72239b9f82eb7cc8) via root `bun install` — 1085 packages across the workspace.
- F1: apps/api typecheck broke (TS2688 bun-types unresolvable — bun hoists it only under apps/hub/node_modules while apps/api/tsconfig.json requests types:["bun-types"]). Fixed IN-FENCE via root devDependency bun-types@^1.4.2 (apps/api/tsconfig.json is outside this task's fence — follow-up filed for R3 in the receipt).
- F2: first `bun run build:hub` FAILED (exit 1, module-not-found): bun 1.3's default workspace linker "isolated" (node_modules/.bun store) hides transitive deps from app source, and apps/hub/src imports transitives directly (unist-util-visit-parents in src/lib/rehypeKatexMhchem.ts). Fixed IN-FENCE via root bunfig.toml [install] linker="hoisted" (upstream-parity layout); rebuild exit 0.
- Rewrote .github/workflows/ci.yml: verify job = one root install + typecheck + test + golden selftest; NEW hub job = root install + `bun run build:hub` (corpus-verify prebuild included, 30-min budget).
- Gates, final pass, all pipefail-captured exit 0 (receipt run-2026-10-04T1826Z.json): typecheck (contracts/shared/db/api) · bun test 4 pass/0 fail · golden --selftest OK · api smoke GET /actuator/health {"status":"UP"} + POST /api/auth/login honest 501 naming T-MIG-010 · build:hub compiled 6.5s, 630 static pages, standalone copied.
- F4 honesty note: first local typecheck pass was falsely green (pipe exit-masking); every receipted gate re-run with explicit exit capture. Upstream/Neon untouched; no credentials logged.

Stage Summary:
- T-MIG-000 gates GREEN; status → IN_REVIEW; PR "T-MIG-000: workspace unification — hub as first-class bun workspace" with receipt .syllabai/receipts/T-MIG-000/run-2026-10-04T1826Z.json (findings F1–F4 + follow-ups for R0/R3/R5). Root install is now `bun install` once, everywhere (local + CI). T-MIG-003 unblocked (its dep on this task is satisfied on this branch pending merge).
Task ID: T-MIG-000 (addendum — push blocker)
Agent: w0a (self-selected agent — Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Escalation record — branch push rejected; task status → BLOCKED per AGENT_COORDINATION §2/§6

Work Log:
- `git push -u …t-mig-000/w0a` → "remote: Invalid username or token … Authentication failed".
- Non-echoing diagnosis: `GET /user` with `Authorization: Bearer $GITHUB_PAT` → 401 (dead token); unauthenticated `GET /repos/SyllabAI/syllabai-v2` → 200 (public repo — the briefing-time clone succeeded anonymously, which is why the failure only surfaced at the first authenticated write). Zero peer branches on the remote is consistent with every briefed agent holding the same dead token.
- No substitute credential improvised (briefing credential law: "do not create new tokens"). No upstream writes attempted (C1). No secrets echoed or committed (all references are to the env-var NAME only).
- Committed protocol artifacts locally on the branch: receipt addendum (push_attempt) + task yaml status BLOCKED + this entry.

Stage Summary:
- T-MIG-000 implementation is COMPLETE with all gates green; only the push/PR step is blocked by an invalid GITHUB_PAT. Local branch t-mig-000/w0a (7a6415c → f9e7ebc → da114d9) is push-ready verbatim. UNBLOCK for the operator/R0: provide a valid GITHUB_PAT (then w0a pushes, opens PR "T-MIG-000: workspace unification — hub as first-class bun workspace", flips status to IN_REVIEW), or push the branch from an authenticated session and review the receipt at .syllabai/receipts/T-MIG-000/run-2026-10-04T1826Z.json.
---
Task ID: T-MIG-004
Agent: w0a (Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Capture content-read golden cases for Wave 2 (operator lane assignment; claim + capture sessions)

Work Log:
- NOTE: the ORIENTATION entry above is the briefing-§2 obligation first committed on branch t-mig-000/w0a (f9e7ebc) during the T-MIG-000 stand-down; per that stand-down's addendum it rides this PR so the orientation gate is satisfied on main. Content unchanged; re-appended at tail per §5 append-only discipline.
- Operator lane assignment received ("T-MIG-004 content-read golden cases"). Peer-collision survey: PRs #1/#3/#4/#5/#6/#7 open, #2 merged; no t-mig-004 branch existed; task yaml was absent from the seeded queue -> authored .syllabai/tasks/T-MIG-004-content-read-golden-cases.yaml per §4 and claimed in the branch-start commit (§2.1).
- Branch t-mig-004/w0a cut from origin/main @ 2cfaf41.

Stage Summary:
- T-MIG-004 CLAIMED; capture sessions executing per GOLDEN_MASTER §2 (run-001 Render read-only; run-002 local frozen-core boot on a LOCAL scratch Postgres migrated by the core's own Flyway seeds — zero production Neon connections this session). Orientation gate ride-along included. Findings and case inventory to follow in this entry's capture addendum.
---
Task ID: T-MIG-004 (capture addendum — sessions executed)
Agent: w0a (Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Content-read golden case capture for Wave 2 — run-001 (Render) + run-002 (local boot) + replay classification

Work Log:
- Captured 38 golden cases across all six W2 controllers (CurriculumController, TeacherCurriculumController, ContentDocumentController, ContentReaderController, ContentController, QuestionAssetController) in two sessions, both on 2026-10-05T19:02Z.
- run-001 (deployed frozen Render core, read-only): wake-gated (free-tier cold start ~5-9 min from this network), then 9 unauthenticated cases — the authz shell (7x 401 across the families, 1x 404 unknown subject, 1x 400 bad uuid). Filter chain answers before any persistence path; zero production writes; no credentials used.
- run-002 (LOCAL frozen-core boot — NEON_PAT absent this session, so T-MIG-003's Neon-COW pattern was adapted to a LOCAL scratch db): frozen tree copied to a scratch dir (C1: zero upstream writes), built with Temurin JDK 25.0.4.1 + Maven 3.9.16 (mvn -DskipTests package exit 0), booted default profile (LLM mode test, decay disabled, synthetic JWT secret + synthetic teacher join code set via env — teacher registration follows the honest API path) against a LOCAL PostgreSQL 17.11 + pgvector 0.8.0 (no-root deb unpack) into which the core's own Flyway applied V1..V63. Captured 29 cases: curriculum happy paths (V6 seed uses FIXED constant uuids — replay-stable, no id scrubbing needed), teacher/student authz (403s), empty-state 200s (documents [], review queues, nodes-by-status), 404s, search empty-cause 200s, and the error shapes (400 missing param, 500 blank query). Two synthetic accounts via honest register path; live synthetic tokens never left /tmp.
- Scrub per GOLDEN_MASTER §2.3: no PII entered any capture (responses contain seed curriculum content, empty lists, or error shapes only); authed cases commit the T-MIG-003-convention dummy bearer with the capture role recorded in the description; error-body timestamps in tolerate.
- Replay proof: golden/runner.ts --selftest PASS; --target replay against the seed v2 api = 1/39 (seed health case) with ALL 38 T-MIG-004 cases expected-pending (seed api serves none of these routes yet) — owned by T-MIG-020 (content read surfaces) / T-MIG-021 (curriculum), same posture as T-MIG-003's auth-case replay.
- Findings F-1..F-8 recorded in .syllabai/receipts/T-MIG-004/run-001.json. Headlines: F-1 teacher curriculum nodes-by-version returns 200 [] on unknown version id (no existence check — captured, divergence call belongs to R0); F-2 present-but-blank search query= returns 500 internal_error (@NotBlank does not fire — captured as-is, do not silently "fix" in the port); F-3 runner has no response-header comparison (X-Search-Empty-Cause SCOPE_UNRESOLVED vs COURSE_REF_UNRESOLVED captured in descriptions; harness follow-up); F-8 question-assets 404 has an empty body (case uses the runner's <non-json> sentinel).
- F-5 HIGH ESCALATION (§6.3): NEON_PAT not present in this session's credentials (only GITHUB_PAT persisted since the T-MIG-000 stand-down; briefing §0 plaintext unavailable in-context and never file-persisted per credential law). The REAL-DATA happy-path tranche is therefore uncaptured: documents list/canonical with ingested rows, citable-document page text (DocumentPageText), review queues with real SUGGESTED papers, question-assets binary happy path, search over embedded chunks. UNBLOCK: operator supplies NEON_PAT to this lane; the extension session follows the T-MIG-003 run-002 recipe (COW branch + synthetic accounts) and appends the missing cases. No production Neon connection of any kind was attempted, and no substitute credential was improvised.

Stage Summary:
- T-MIG-004 status IN_REVIEW: 38 cases committed under golden/cases/ (flat, T-MIG-003 convention), receipts at .syllabai/receipts/capture/2026-10-05/{run-001-render-core,run-002-local-boot}.json + .syllabai/receipts/T-MIG-004/run-001.json. W2 authz shell + empty states + error shapes + curriculum real-data happy paths are DONE; the document-bearing real-data tranche is gated on the F-5 unblock. Zero production writes, zero Neon connections, zero upstream writes, zero PII/secrets committed.


---

Task ID: UNBLOCK-SEQUENCE-PHASE2 (R0)
Agent: R0-integrator (Super Z, operator session trace 1a10848acd9adae9)
Task: Continue R0 execution after wave-0 completion — arbitrate the T-MIG-010 claim collision, merge the identity port, land T-MIG-004 capture.

Work Log:
- T-MIG-010 collision arbitrated: R3-api-a (PR #11, claim 0462fd3 @ 18:34:44Z) over r3b (PR #9, claim @ 18:39:30Z) — earliest-claim per §2.1 plus gate differential (run-002 LIVE Neon-branch integration: token_version revocation proven via old-token 401, register row-level SQL verification, honest 409 consumed-V19 bootstrap; run-001: 100/0/4skip, 248 expectations).
- INCIDENT + RECOVERY (honest disclosure): R0's earlier claim-only force-push to t-mig-010/r3 clobbered head d510090 (R3-api-a's completed port push that landed after R0's fetch). Recovered via server-side ref creation at the dangling SHA (t-mig-010/r3-api-a-archive); zero work lost. Process rule adopted: R0 force-pushes require fresh ls-remote + PR-head check.
- Port lineage rebuilt onto post-wave-0 main (superseded T-MIG-000 base commits dropped; claim + port b14c1e4 + OUT-OF-FENCE wiring eddfe85 + receipts replayed = 4442540); OUT-OF-FENCE wiring (path-parity mounts /api/v1/auth/**, ApiError boundary, CORS, bcryptjs/@neondatabase/serverless deps) R0-ratified per §6.1. Gates re-executed: typecheck x4 exit 0, 104 tests / 0 fail / 4 integration-skips / 248 expectations — matches receipt. PR #11 merged 1cef1be. PR #9 closed superseded with cross-validation credit (store/validation/password decomposition preserved at t-mig-010/r3b).
- PR #10 (T-MIG-004, 38 Wave-2 content-read golden cases) rebased onto 1cef1be (worklog union), gates re-executed (typecheck x4, 100/0/4skip, selftest OK, 54 total case files on disk), merged e3a2e7b.
- Housekeeping: T-MIG-010/004 yamls -> DONE with evidence; this entry appended.

Stage Summary:
- Board: T-MIG-000/001/002/003/004/010/012 DONE (7 tasks), T-MIG-011 CLAIMED (t-mig-011/r5), Wave-2 lanes filing. Identity/auth surface is LIVE in v2 with live-DB-proven revocation — the strangler-fig has its first real vine. 54 golden cases on main; Wave-2 acceptance worklist complete before any content-read port code lands. Critical path: T-MIG-011 hub adapter (claimed), then Wave-2 ports (T-MIG-020..022) against the fresh capture.
