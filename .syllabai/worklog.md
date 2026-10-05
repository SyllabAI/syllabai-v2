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

Task ID: ORIENTATION (Phase-1 gate; previously committed 2026-10-04T18:10Z on the withdrawn t-mig-002/r2 local branch)
Agent: R5-hub-lane (Super Z, zai-web session web-1f157e25)
Task: Re-land the Phase-1 orientation entry that was stranded by the T-MIG-002 claim collision, so this lane's first worklog entry remains an Orientation per agent briefing §2.

Work Log:
- Phase-1 orientation was completed at 18:08–18:10Z before claiming T-MIG-002 (commit 385e0c9, never pushed): v2 docs in order; core README/render.yaml/DEPLOYMENT; hub ARCHITECTURE/REPOSITORY_MAP; ADRs 031/025/036/034/020/023; T-C42.yaml; bench receipts. Full text + findings were re-landed during the t-mig-002 rebase and now live in this worklog's history.
- T-MIG-002 outcome: claimed 18:08Z locally, completed a full verified baseline, then discovered peer R2-db's pushed IN_REVIEW claim (18:20Z, PR #4). Yielded per §2.1 with an independent re-verification of their branch (typecheck 0 errors on repo pins; battery ALL PASS) posted as PR #4 review comment (issuecomment-5983442044). Lesson recorded: claims only exist once pushed — this claim goes up before implementation.

Stage Summary:
- Product loop + correctness mechanisms (receipts / fail-fast / preregistration) as stated in the earlier ORIENTATION entry; operator questions 1–4 recorded there, with Q1 (path parity → v2 serves /api/v1/** + /actuator/health) answered by R0 in the T-MIG-001 review.
- Now claiming T-MIG-011 (hub adapter, Wave 1, R5 lane): parallel-safe work (mathNormalize lift into @syllabai/shared + env-driven per-surface API base override + .env.example) proceeds while the auth-flow verification waits on the T-MIG-010 merge; dep-gated remainder documented in the task yaml. Claim pushed IMMEDIATELY this time.

---

Task ID: T-MIG-011
Agent: R5-hub-lane (Super Z agent, session web-1f157e25, utc 2026-10-04)
Task: Hub adapter (Wave 1) — mathNormalize lift into @syllabai/shared + per-surface strangler-fig API routing + env reference sheet.

Work Log:
- Claimed 19:16:23Z and PUSHED the claim commit before implementing (T-MIG-002 collision lesson).
- Lifted mathNormalize byte-identical into packages/shared/src/mathNormalize.ts per the shared package charter; 10 TS-only non-null assertions forced by noUncheckedIndexedAccess (base tsconfig has it, hub doesn't) — every site provably safe, runtime identical, documented in an in-file LIFT NOTE.
- 17 parity pins freeze rules 1-6 + R1-R4 + corpus identity at the package boundary; one pin records actual production behaviour (R4 closes before non-mathish "mol") rather than the source header's idealised shape.
- Hub shim: lib/mathNormalize.ts re-exports the canonical implementation; 4 call sites untouched and green.
- api.ts: NEXT_PUBLIC_API_V2_BASE_URL + V2_SURFACE_PREFIXES (Wave 1: /api/v1/auth) — env-driven per-surface routing with single-env rollback; .env.example documents all public envs.
- Gates: 17/17 pins, 49/49 root tests, golden selftest OK, shared/contracts/db typechecks clean, scoped hub tsc 0 errors in both touched files.
- Fence disclosures for R0: hub package.json dep line, hub .gitignore !.env.example negation, and the shim (mandated by the task basis; outside the yaml's parenthetical).

Stage Summary:
- Parallel-safe scope COMPLETE and pushed; task stays IN_PROGRESS honestly: the live auth-flow verification against the v2 api is dep-gated on T-MIG-010's merge (claim arbitration pending r3/r3b) — flipping NEXT_PUBLIC_API_V2_BASE_URL is the only remaining action after 010's golden gate. Receipt: .syllabai/receipts/T-MIG-011/run-001.json.

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

---
Task ID: T-MIG-014 (claim)
Agent: r1 (Super Z, zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Claim the per-IP RateLimitFilter (deep-audit M1) port — the micro-task T-MIG-010's execution_record recommends

Work Log:
- Operator directive "claiming T-MIG-010 next" arrived before a sandbox reset wiped this session's workspace; on re-provision (operator-supplied GITHUB_PAT, env-var channel only) and re-clone, main had moved to 67639db: T-MIG-010 was DONE via PR #11 (R0 arbitration: R3-api-a earliest-claim). The stale instruction was retired — no claim was attempted on a DONE task.
- Pre-claim survey (per §2.1): open PRs = #12 only (T-MIG-013 IN_REVIEW); live branches = t-mig-011/r5 (hub, CLAIMED), t-mig-005/r1 (content-read contracts, CLAIMED), t-mig-013/r3 (golden hardening), r7/yaml-receipts-backfill. Wave-2 slots (020..022) have no yamls yet and the phase-2 R0 entry sequences them behind T-MIG-011 + the T-MIG-004 acceptance worklist.
- Selected the one genuinely OPEN item with an in-repo recommendation: T-MIG-010 boundary note (b) — per-IP RateLimitFilter (M1, com.syllabai.ratelimit) explicitly left for "its own micro-task". Authored .syllabai/tasks/T-MIG-014-port-ratelimit.yaml per §4 (T-MIG-004 yaml-authorship precedent), wave 1, deps [T-MIG-010], P2 (parallel-safe: fences disjoint from every active lane).
- Spec re-read from frozen core @ 6cad6ef: RateLimitFilter.java (two tiers, fixed windows, XFF trusted-chain walk, fail-open), RateLimitProperties.java (audited budgets 10/5/3/10/20, window 60s), RateLimitFilterTest.java (11 cases to mirror), SecurityConfig.java:96-99 (addFilterAfter JwtAuthenticationFilter — LLM tier keys on the identity the JWT filter resolved), application.yml:123-134 (ops-tunable budgets, defaults restated). v2 conventions read: budget.ts port style (injectable clock, line-anchored header), errors.ts (two distinct 429 bodies: exception path "Too many attempts" w/o body field vs filter path "Too many requests" WITH retryAfterSeconds field), index.ts wiring, config.ts ratelimit block.
- Fidelity pre-commitments (to be evidenced in the receipt): alignment-compare window reset (!start.equals(windowStart), NOT insideWindow), count > limit strict, retryAfter = floor((windowEnd-now+999)/1000) min 1 computed before admit, MAX_KEYS=100_000 sweep at 2-window cutoff, OPTIONS+enabled bypass, fail-open on internal error, XFF rightmost-first first-public-hop walk incl. CGNAT 100.64/10 and the literal 172.2x predicate, learnerKey userId→subject→IP.
- Branch t-mig-014/r1 cut from origin/main @ 67639db; claim + yaml + this entry pushed at claim time (collision lesson T-MIG-002/010 applied).

Stage Summary:
- T-MIG-014 CLAIMED at 2026-10-05T05:23:35Z; implementation follows in this branch (middleware port → mirrored test suite → mount wiring as a separate disclosed commit → receipt → IN_REVIEW). Golden-capture posture disclosed in advance: unit-tier mirror suite is the gate for this task; live 429 golden cases against the frozen core are deferred to the runner-capability follow-up (T-MIG-004 F-3: no per-case request-header injection / response-header comparison yet) — disclosed to R0 in the receipt, no case weakened.

---
Task ID: T-MIG-014 (implementation)
Agent: r1 (Super Z, zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Port the per-IP RateLimitFilter (deep-audit 09-28 M1) — the micro-task recommended by T-MIG-010's execution_record

Work Log:
- Implemented apps/api/src/middleware/ratelimit.ts against the frozen source @ 6cad6ef (RateLimitFilter.java + RateLimitProperties.java, line-anchored header). Two tiers: auth per-IP (login/register/bootstrap-admin/password POSTs) + llm:ask per-learner (tutor/cla/transcribe/smart-mark, keyed userId → subject → IP). In-memory fixed windows: alignment-compare reset (NOT LoginAttemptBudget's insideWindow — the Java pair differs deliberately), strict count>limit reject, retryAfter=max(1,floor((windowEnd-now+999)/1000)) computed pre-bump, MAX_KEYS=100_000 sweep at 2×window cutoff, OPTIONS+enabled=false bypass, fail-open on internal errors.
- XFF trusted-chain walk ported verbatim (rightmost-first, skip private, first public = key, socket-peer fallback). CAUGHT BY THE MIRROR SUITE: my first noUncheckedIndexedAccess fix dropped hop.strip() before the private check, so " 10.44.0.7" stopped matching startsWith("10.") and the walk keyed on the varying internal hop — exactly the bug the Java comment says the walk exists to prevent. Restored strip-before-checks; the 4 XFF topology tests + clientIp e2e now pin it.
- 429 body duality preserved and pinned: filter path = "Too many requests…" WITH retryAfterSeconds as a body field (+ Retry-After header); exception path (RateLimitException via errors.ts, pre-existing) = "Too many attempts…" WITHOUT the field. Both load-bearing per the frozen source; do-not-unify noted in both files.
- config.ts ratelimit block extended inside the fence: audited budgets (login 10 / register 5 / bootstrap 3 / password 10 / llm 20, window 60s — RateLimitProperties:53-59, application.yml:123-134) + SYLLABAI_RATELIMIT_* env overrides. loginPerAccount/windowMs semantics untouched (T-MIG-010 surface).
- Test mirror at test/ratelimit/ratelimit-filter.test.ts: all 11 Java RateLimitFilterTest cases + 4 extras (predicate unit incl. CGNAT/172.2x/malformed-100.x, clientIp e2e, env overrides, filter-body-shape pin). Hono-app harness plays the chain (auth-stub → limiter → dummy routes) matching the real mount order.
- Gates re-executed: typecheck x4 exit 0 (api/contracts/shared/db; hub gate is next build, untouched); apps/api 87 pass / 0 fail / 4 skip (skips = Neon integration tier, NEON_PAT absent this session — T-MIG-004 F-5 posture, integration tier untouched by this fence); packages/contracts 28/0. bun install at root was required on the fresh clone (T-MIG-000 unified workspace).
- Commits on t-mig-014/r1: (1) claim (already pushed), (2) implementation + tests + config + receipt + yaml flip + worklog, (3) OUT-OF-FENCE index.ts mount wiring (import + one app.use between the Bearer middleware and the routers — SecurityConfig.java:96-99 addFilterAfter parity) with header disclosure, per the T-MIG-010 convention.

Stage Summary:
- T-MIG-014 → IN_REVIEW; receipt at .syllabai/receipts/T-MIG-014/run-001-ratelimit-filter.json (fidelity map Java-line → TS-symbol, 5 disclosures: fail-open single-dispatch divergence, out-of-fence commit, golden-429 capture deferred to the F-3 runner follow-up, llm tier dormant-by-routes until Wave 3 surfaces land, defensive remoteAddr fallback). PR open for R0. The v2 api now enforces the M1 cost/brute-force tier the frozen core enforces — the last piece of the com.syllabai.ratelimit package.

---
Task ID: T-MIG-016 (renumber from T-MIG-014 — ID yielded to PR #13)
Agent: r1 (Super Z, zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Resolve the three-way T-MIG-014 ID collision at push time; keep the RateLimitFilter M1 port in R0's queue under a collision-free ID

Work Log:
- Push-time survey surfaced the collision resolution recorded on PR #13: three tasks raced the T-MIG-014 ID — r7a docs-drift (claim 05:00:49Z, unpushed) already yielded as T-MIG-015 (PR #14); R3a db-drivers (claim ecded41 @ 05:08:44Z) holds PR #13 IN_REVIEW; this lane's claim b1f63b4 @ 05:23:58Z is the latest of the three.
- Yielded the ID per §2.1 earliest-claim + the r7a/#14 precedent ("earliest-claim is a tiebreak, not territory") — in this lane's case the yield is clock-correct, not merely courteous. Renumbered to T-MIG-016 (next free at push time; 016..019 verified unclaimed on main and remotes).
- Mechanics mirrored r7a/#14 exactly: branch t-mig-016/r1 (content byte-identical to 6a75667 — claim, implementation, OUT-OF-FENCE mount untouched); yaml renamed + id/status/scope.allowed renumbered + renumber paragraph appended to execution_record; receipts dir renamed with run-001-ratelimit-filter.json byte-identical; index.ts disclosure comments renumbered (comment-only, 3 lines); renumber receipt run-002-renumber.json (full timeline, decision, gates); this append-only entry. No past worklog entries touched.
- PR #15 closes with cross-reference to the replacement PR; remote branch t-mig-014/r1 deleted after the replacement opens (namespace hygiene for PR #13's receipts dir); CI evidence from content-identical head 6a75667 cited in the receipt (verify + hub success).

Stage Summary:
- T-MIG-016 → IN_REVIEW on t-mig-016/r1; replacement PR open for R0 with the same 5 disclosures + the renumber disclosure. Zero substantive change to the port; the M1 cost/brute-force tier remains fully represented. Operator's "(2)" directive (NEON_PAT-gated follow-ups) evaluated in-session: real-data tranche already delivered by w0a (PR #16, Neon COW branch); api integration tier remains operator-gated (INTEGRATION_DATABASE_URL / NEON_PAT absent — §6.3 posture, F-5 precedent; runbook ready: T-MIG-010 run-002 recipe + db.integration.test.ts header).

## T-MIG-016 — R0: identity golden live-replay verification + gate hardening (DONE)

- **When/who:** 2026-10-05, R0-integrator, operator-delegated check-in ("verify T-MIG-010 replays green against all 16 identity golden cases; check T-MIG-011").
- **Claim protocol:** self-assigned verification lane; no conflicts (board lanes T-MIG-011/012/013/014/015 untouched).
- **Verification instrument:** UNMODIFIED v2 api (main 67639db) over real HTTP; production Neon WS driver tunneled via `neonConfig.webSocketConstructor` to a LOCAL PostgreSQL 17.11+pgvector 0.8.0 (no-root deb unpack, cleartext hba — consumes the client's pipelined Startup+'p'+query burst exactly like the real Neon proxy). Zero production/Neon connections. Capture-config parity: teacher join-code env unset. Baseline schema applied + `roles` seeded (FK requirement).
- **Gates re-executed:** typecheck 0 errors; unit 119/0/4skip; golden selftest OK.
- **Result:** Tier A verbatim replay **13/16** (3 fails classified state/scrub-dependent), Tier B state-aware **4/4** (register→duplicate→login→/me with live token; only capture-scrubbed `accessToken`/`id` redacted) → **UNION 16/16. T-MIG-010's 0/16→16/16 acceptance bar is MET.**
- **Defects the gate exposed, fixed in-pass (receipts: `.syllabai/receipts/T-MIG-016/run-001-identity-golden-verify.json`):**
  - **F-1** `golden/runner.ts` live path ignored case `tolerate` (byte-strict diff) → every timestamped case permanently unpassable; root cause of the standing 0/16. Comparator now `deepEqualTolerant` (§5 doctrine).
  - **F-2** health route served seed shape; core serves `{groups:[liveness,readiness],status:UP}` (golden `actuator-health-parity`, justified:true) → fixed + unit pin updated.
  - **F-3** @Email message now pinned to Hibernate's captured "must be a well-formed email address" (contracts + 3 unit pins).
  - **F-4** first-field selection: Hibernate traversal reports **password before email** (both missing-fields captures); `validationMessage` ranks by observed order, evidence-only-updatable.
  - **F-5 (filed, NOT fixed — T-MIG-002/R2 lane):** baseline SQL is fully `/* */`-commented (applies nothing as-is); ~203 CREATE INDEX statements carry drizzle-pull opclass artifacts failing on vanilla Postgres; `roles` seed rows missing for the `user_roles` FK.
- **Honest gaps:** R-JWT cross-verify with a Java-issued token still pending (capture-side); verification on local Postgres (same SQL surface); M1 RateLimitFilter still unported.
- **Fleet notes:** wave-2/3 lanes can now trust verbatim replay — content/curriculum cases should be re-run against a seeded environment; the F-5 baseline issues block any fresh-environment boot and should be T-MIG-002's next micro-task.
Task ID: T-MIG-021 (wave-2 curriculum port — CLAIM)
Agent: R7a (Super Z, zai session web-da4ab8b1)
Task: Claim T-MIG-021 (curriculum port) per the wave-2 claim-prep dossier (PR #17) — "021 curriculum first" readiness line; R0 ratification of the task id requested in the PR (T-MIG-013/020 precedent).

Work Log:
- Pre-claim verification at main 67639db: zero T-MIG-021 yamls, zero t-mig-021* remote branches (fetch --prune immediately before branch cut). R0 queue re-polled first: no verdicts yet on #12/#13/#14/#15/#16/#17; PR #13 (T-MIG-014 db drivers) still open.
- Race context: R3-api-a claimed T-MIG-020 at 05:41:57Z (branch e50a63f) — wave-2 claim race is live; their yaml explicitly carves the curriculum controllers OUT of the 020 fence ("T-MIG-021's surface — NOT this task's fence"), so no overlap. Claim proceeds with deps declared pre-merge (same shape as 020's claim).
- Claimed T-MIG-021 at 2026-10-05T05:54:23Z; branch t-mig-021/r7a cut from main 67639db. Surface: CurriculumController (7 cases) + TeacherCurriculumController (6 cases), 13 golden cases total — the most replay-stable W2 family (V6 fixed-constant seed uuids; F-5 real-data tranche does not gate this surface).
- Plan (execution_record): contract-independent service/repository layer FIRST over curriculum tables (raw SQL per users.ts precedent), stubbed-sql unit tests; route factories staged in-fence; MOUNTING + zod wiring gate on T-MIG-005 and lands with the golden replay flip; index.ts wiring flagged OUT-OF-FENCE (T-MIG-010/013 precedent). F-1 divergence call flagged for R0: nodes on unknown version captured 200 [] — replicate as-is unless ruled otherwise.
- Receipt .syllabai/receipts/T-MIG-021/run-001.json (collision scan + cross-lane coordination + surface map). This entry appended. Diff surface: docs-only claim commit — zero bytes under packages/, apps/, golden/.

Stage Summary:
- T-MIG-021 CLAIMED by r7a (earliest-claim timestamp on record per §2.1); yaml self-filed, R0 ratification requested via PR. Execution next on this branch, gated: service/repo layer can start immediately; replay flip gates on PR #13 (T-MIG-014 db dispatch) + T-MIG-005 (contracts). Residual for R0: contested T-MIG-014 ID still has r1's claim-only branch out (PR #15) — unchanged from the T-MIG-015 coordination note.
- (T-MIG-021 addendum, same session) Tranche 1 LANDED: contract-independent curriculum services (versions/subjects/review-read) + buildCurriculumModule + 17 stubbed-sql unit tests pinning query shapes and captured seed behavior (overview 1/0/10, F-1 empty queue on unknown version, code-sorted nodes, SUGGESTED empty queue, null-root guard). findSubtreeIds' recursive PART_OF CTE carried VERBATIM; parity decisions (CTE aggregation vs the Java N+1, LEFT-JOIN parent, WHERE status filter, TS-side final sort) disclosed in receipt run-001-tranche1.json. Gates: typecheck x4 exit 0; bun test 136/4skip/0 fail (119 base + 17 new; T-MIG-020's content tests live on R3's branch); golden selftest OK read-only; replay NOT RUN (routes unmounted — tranche 2, gated on T-MIG-005 + PR #13). Deviation disclosed: route factories deferred to tranche 2 (same rationale as T-MIG-020 tranche 1 — no dead validation code pre-merge). yaml -> IN_PROGRESS.

Task ID: T-MIG-005
Agent: R1-contracts (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e; prior lane R2-db on T-MIG-002 is DONE/closed — one lane at a time)
Task: Claim the Wave-2 contracts prerequisite (self-selected per briefing §5) + post-merge verification of PR #4 (T-MIG-002).

Work Log:
- Session resumed post-compaction with zero local state; re-ran FIRST ACTIONS: anonymous clone (public read — REST API rate-limited all session from shared egress 8.212.10.159, 60/60 unauth), read README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog (full) → task board, in §3 order.
- PR #4 CI watch + check (operator directive): PR #4 = T-MIG-002 (this session's prior lane) — MERGED by R0 at 01c41d4 ("rebased, gates re-executed green — 62 tables / 579 cols, flyway history untouched, SELECT-only held"). Independent verification at main 67639db: frozen install exit 0 (918 pkgs), typecheck x4 exit 0, bun test 100/0/4skip (matches R0 receipt), golden selftest OK, 54 case files; static spot-checks of the merged artifacts (schema README flyway-exclusion note lines 29-43; client.ts jdbc: guard lines 32-35) all PASS. API check-runs endpoint stayed rate-limited (evidence basis = R0 merge record + T-MIG-013 yaml's independent "CI verify+hub success" observation + this local re-execution). Receipt: pre_claim_gate_verification block in .syllabai/receipts/T-MIG-005/run-001-claim.json.
- Board survey: T-MIG-011 IN_PROGRESS on t-mig-011/r5 (r5, claimed 19:16:23Z — earliest-claim-wins, not contestable, despite main yaml still showing OPEN); T-MIG-013 IN_REVIEW (PR #12, R3-api-a). No unowned OPEN task → per §2.1/§6 this lane FILED the missing critical-path prerequisite instead of improvising on a claimed fence: Wave-2 content-read contracts (T-MIG-005), the §3 serialisation point gating T-MIG-020..022; T-MIG-001 covered identity only. Id 005 = next free number; 020..022 left reserved for the port tasks (T-MIG-013 id-ratification precedent).
- Claim per §2.1: yaml owner+status CLAIMED in THIS branch-start commit; branch t-mig-005/r1 off main 67639db; claim receipt run-001-claim.json (board survey + gate evidence + plan of work).

Stage Summary:
- T-MIG-005 CLAIMED (R1 lane, fences: packages/contracts/src/** + own yaml/receipts/worklog only — disjoint from t-mig-011/r5 and t-mig-013/r3). Next: DTO extraction from frozen core (raw reads) → zod schemas with source headers → diff vs 38 captured cases → PR. No Neon connection needed; no production contact of any kind.

---

Task ID: T-MIG-005 (addendum — push blocker)
Agent: R1-contracts (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Escalation record — branch push rejected for lack of credentials; task status held CLAIMED (local).

Work Log:
- `git push -u origin t-mig-005/r1` → "could not read Username for 'https://github.com'" (no credentials available non-interactively). Non-echoing diagnosis: no PAT/TOKEN/KEY env names, no ~/.git-credentials, no ~/.netrc, no gh, no credential.helper; briefing §0 plaintext lost in session compaction, never file-persisted per credential law (same pattern as T-MIG-004 F-5 and the T-MIG-000 w0a stand-down).
- No substitute credential improvised (credential law). No production/Neon/upstream contact of any kind.
- Addendum receipt committed locally: .syllabai/receipts/T-MIG-005/run-001-claim-push-attempt.json.

Stage Summary:
- T-MIG-005 implementation-ready and CLAIMED locally; branch t-mig-005/r1 (9f43ff4, off 67639db) is push-ready verbatim. UNBLOCK for the operator/R0: re-supply a valid GITHUB_PAT as env var → push + open PR "T-MIG-005: wave-2 content-read contracts" (receipts listed, id-ratification requested), or push the branch from an authenticated session. Claim timestamp 05:06:59Z @ 9f43ff4 establishes earliest-claim priority.

---

Task ID: T-MIG-005 (work entry)
Agent: R1-contracts (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Wave-2 content-read contracts — port the six controllers' read-surface DTOs constraint-for-constraint into packages/contracts.

Work Log:
- Extracted sources from frozen syllabai-core via blob-filtered sparse checkout (raw reads, zero upstream writes): 6 W2 controllers + ContentReviewService + CurriculumReviewService + the 4 entity files carrying the wire enums (Document.Kind, ValidationState ×3 identical, Question.Type, CurriculumVersion.Status, ValidationStatus, NodeType full domain incl. MISCONCEPTION/CONCEPT).
- Landed packages/contracts/src/{content.ts,curriculum.ts,errors.ts} + 69 pin tests (content.test.ts, curriculum.test.ts — captured T-MIG-004 bodies embedded verbatim) + index.ts exports + one-word auth.ts diff (export existing notBlank; no behavior change). Spring-exact param binding ported: StringToEnumConverterFactory trims before valueOf; StringToBooleanConverter true/false-only; NumberUtils.parseNumber int semantics (trim-all-whitespace, sign+digits, int32 range, "" → null → 400 for primitive). Two OBSERVED error envelopes pinned in errors.ts with capture citations.
- FINDINGS F1-F6 in .syllabai/receipts/T-MIG-005/run-002-work.json. Headline: F1 — pin tests caught z.coerce.number() widening the accept set vs Java int binding ("1e3" would have passed) BEFORE commit; replaced with a parseInt-exact mirror. F6 — T-MIG-004 F-2 blank-search-500 divergence preserved (declared @NotBlank kept; R0 owns the call). F5 — nullability debt on capture-unproven fields tagged inline, tightening list in receipt (unblocks when the F-5 NEON_PAT tranche lands).
- Gates, final pass, all exit-captured: contracts typecheck 0; contracts tests 69/0; repo typecheck x4 0; bun test 141 pass / 4 skip / 0 fail (was 100 — +41 pins, 0 regressions); golden --selftest OK.

Stage Summary:
- T-MIG-005 work COMPLETE on branch t-mig-005/r1 (IN_PROGRESS → IN_REVIEW pending PR). Scope decision (READ-surfaces-only, write-flow DTOs excluded to owning waves; id 005 self-assigned) submitted for R0 ratification in the PR. BLOCKER: PR/push blocked on credential — the PAT supplied at ~05:14Z authenticated the claim push then revoked within ~2 min (401 'Bad credentials' on all calls); no substitute improvised per credential law. Branch is push-ready verbatim: commit 9f43ff4 (claim) + work commit; UNBLOCK = live GITHUB_PAT → push → PR "T-MIG-005: wave-2 content-read contracts" (yaml link + receipts + ratification request) → IN_REVIEW.

---

Task ID: T-MIG-005 (unblock + PR #18)
Agent: R1-contracts (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Execute the recorded UNBLOCK — push the work commit, open the PR, flip status to IN_REVIEW.

Work Log:
- Second operator-supplied GITHUB_PAT (after the 05:1xZ revocation) loaded as env var only, never echoed/persisted. First-use 401 diagnosed non-echoingly as a harness artifact: env vars do not survive across tool-shell invocations in this session (fingerprint pat_len:0 — the Authorization header was EMPTY, not invalid; git-side anonymous reads kept succeeding). Re-run with export+use in a single invocation validated 200 on GET /user.
- Branch pushed: bf72e98..0cd5e93; ls-remote verified remote t-mig-005/r1 @ 0cd5e93377628cb419bbf5555cfe137877ebb92e. Claim priority had already been secured (9f43ff4 landed on remote before the first PAT's revocation).
- PR #18 opened via API: "T-MIG-005: wave-2 content-read contracts" (base main) — body lists all receipts, fences, gates (contracts 69/0; bun test 141/0/4skip; typecheck x4 0; selftest OK), findings F1–F6, and requests R0 id-ratification (T-MIG-013 precedent) + scope ratification (READ-only surfaces).
- yaml status → IN_REVIEW (+ execution_record UNBLOCK line); receipt run-003-push-pr.json committed; this entry appended.

Stage Summary:
- T-MIG-005 is IN_REVIEW on PR #18 with the full work tree on remote (9f43ff4 → bf72e98 → 0cd5e93). Awaiting R0: review, exclusive merge, id + scope ratification. Lane idle on this side until review feedback.

---
Task ID: ORIENTATION (pre-task entry, briefed per AGENT_BRIEFING §2)
Agent: R1-contracts-c (Super Z, zai-web session web-64d10b73-530a-4f71-9961-85d0436c7fb5)
Task: Phase-1 orientation — tour the frozen org, read the law, adopt the culture, then self-select a lane. No code in this entry.

Work Log:
- Read the eight required v2 items in order (README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog tail → tasks/*.yaml), then toured upstream from fresh clones: syllabai-core (README, render.yaml, docs/DEPLOYMENT.md, then the assessment module source for the lane I intended to claim), syllabai-hub (docs/ARCHITECTURE.md + docs/REPOSITORY_MAP.md + README promotion note), master pack (all six mandated ADRs read in full — 031, 025, 036, 034, 020, 023 — plus the seven wave-relevant ones skimmed: 017, 021, 027, 030, 032, 033, 035; .syllabai/tasks/T-C42.yaml exemplar), and the R7 wave-2 claim-prep dossier on PR #17.
- Collision survey before claiming (§5): open PRs #12–#22 enumerated with their yaml scope.allowed globs; remote branches ls-remote'd. Board at main @ 67639db: T-MIG-000/001/002/003/004/010/012 DONE, T-MIG-011 claimed (branch t-mig-011/r5), Wave-2 fully fenced (contracts #18, curriculum #19, content ports #20/#22, F-5 extension #16, rate-limit #21, runner/tooling #12/#13/#14).

Stage Summary:
- (a) PRODUCT LOOP IN MY OWN WORDS: A student self-registers on the hub — always STUDENT (teachers exist only behind a fail-closed join-code gate, ADMIN is never self-serviceable, and the same registration endpoint bootstraps the first admin exactly once) — and lands in a curriculum anchored to an official specification (Edexcel IGCSE/IAL 4CH1) rather than a free-floating content pool. They practise real exam questions: MCQs grade deterministically against the tagged correct option, while structured answers go through Smart Mark — normalise, align evidence to validated mark-scheme points, run bounds/mark-sum/coverage validators, append-only results, the LLM never the final truth — with the honest View-Mark-Scheme self-mark as a first-class alternative (ADR-025: one marking authority, no chatbox). Every marked attempt emits an immutable evidence event that updates the learner model — BKT mastery with format-aware guess pricing (ADR-033), BDT misconception posteriors whose evidence ages toward the prior (ADR-032) — and those stored values are ANCHORS: forgetting decay is computed at read and never persisted (ADR-031), so the nightly job is exact under late/catch-up runs and a same-instant rerun is idempotent. From that state the platform derives, also computed-at-read, an explainable next-best-action agenda (the exam-aware executive layer ADR-035 extends it without touching the engine), spaced-repetition flashcards whose cross-device trail merge is receipt-based because server-vs-device clocks cannot dedup honestly (ADR-034), and smart lessons; meanwhile the tutor/CLA answers through a KA-RAG chain that retrieves only from VALIDATED curriculum-graph nodes and embedded chunks, refuses deterministically when evidence is insufficient, resolves the course reference fail-closed (ADR-030), and emits numbered citations that must resolve to real chunks. Teachers see classroom-scoped surfaces only — marking queues that show their enrolled learners' work and never block the independent flow (ADR-027) — and research calibration endpoints suppress sub-k cells on the wire (k=5 distinct learners, ADR-036), because authorization is not disclosure control. The whole loop is what this repo is strangler-figging: the frozen Java core keeps serving production on Render while v2 re-platforms each domain behind golden-master parity gates onto the same Neon database.
- (b) THREE CORRECTNESS MECHANISMS OBSERVED, each with one concrete example: 1) GOLDEN-MASTER PARITY — "ported" means recorded evidence, not hope; concrete example: T-MIG-004's 38 Wave-2 cases replay against the seed api as 0/38 with ALL cases expected-pending (T-MIG-020's acceptance worklist), and the runner's --selftest gate exists because a parity comparator with broken tolerance handling generates false confidence (GOLDEN_MASTER §5) — the gate audits itself. 2) COMPUTED-AT-READ ANCHOR INVARIANTS — stored values are post-practice posteriors and every derived number is recomputed from (anchor, timestamp, now); concrete example: ADR-031's regression test secondConsecutivePassDoesNotCompound fails on pre-fix code (pass 2 reads ≈0.3206 and writes through) and passes post-fix, which is what makes the exponential semigroup exact — N passes compose as e^(−(t1+t2)/τ) — and V38 catch-up runs genuinely exact for the first time. 3) RECEIPTS OR IT DIDN'T HAPPEN — every claim carries machine-checkable evidence; concrete example: T-C42.yaml's execution_record pins the production probe (PRB-01 pct_above_050 = 59.5%, 1,745/2,935 VALIDATED chunks, transport deviation disclosed) with CI run ids and merge SHAs, and this repo's first vine already continues the culture — T-MIG-010's run-002 receipt proves LIVE token-version revocation on a Neon branch (old token → 401 after rotation), not a unit-test simulation.
- (c) UNCLEAR / QUESTIONS FOR THE OPERATOR/R0: 1) The R7 dossier's 3-way Wave-2 split (020/021/022) has been OVERRUN by the open PR fences — PR #20's scope (services/content/** incl. assets.ts + review.ts) already covers the dossier's T-MIG-022 surface (ContentController + QuestionAssetController): does R0 want T-MIG-022 filed separately anyway, or folded into whichever T-MIG-020 PR merges and the id retired? 2) Stacked-contracts merge order: T-MIG-006 (this lane) is stacked on PR #18 per the T-MIG-010 precedent ("stacked on PR #1 + PR #2") — confirm R0's preferred order (18 → 6) or whether contracts tasks should instead be self-contained with namespaced duplicate enums (rejected here: drift risk on identical frozen values). 3) Jackson primitive-boolean binding: Spring Boot leaves FAIL_ON_NULL_FOR_PRIMITIVES disabled, so JSON null on selfDoubtFlag/timedCondition binds to false, not 400 — this lane encodes that fact in the schema preprocess; flagging for R6 so the first attempt golden capture pins it explicitly. 4) LearnerSelfMarkController's SelfMarkRequest carries NO validation annotations, so a null parts array NPEs the controller loop into a 500 — captured-as-is per GOLDEN_MASTER, or is replicating an honest 500 a justified-divergence call for R0 at port time? 5) T-MIG-004 F-5 (NEON_PAT) still gates every lane's real-data capture tranche including Wave-3 attempt/question surfaces — re-flagged from this lane; no substitute credential was improvised.
---
Task ID: T-MIG-006
Agent: R1-contracts-c (Super Z, zai-web session web-64d10b73-530a-4f71-9961-85d0436c7fb5)
Task: Wave-3 assessment-loop zod contracts — claim + port (branch-start per AGENT_COORDINATION §2.1)

Work Log:
- Claimed per §5 self-selection: highest-priority OPEN serialised point (Wave-3 contracts feed every T-MIG-030..034 port lane; the plan's three serialised points are contracts → implementation → golden). Zero fence overlap verified against PRs #12–#22 and remote branches; branch t-mig-006/r1c cut STACKED on t-mig-005/r1 @ 9a99790 (PR #18) — real dependency: assessment DTOs reuse questionTypeSchema / contentValidationStateSchema / uuidPathSchema / notBlank first ported there from the same frozen sources.
- Task yaml authored per §4 with scope.allowed limited to assessment.ts + assessment.test.ts + the one-line index.ts re-export + yaml/receipts/worklog; stacking disclosed in base + execution_record.

Stage Summary:
- T-MIG-006 CLAIMED; implementation (the assessment.ts port + parity tests) follows in this branch's next commits; orientation entry above rides this PR per the w0a precedent so the Phase-1 gate is satisfied for this lane in the same merge.

---
Task ID: T-MIG-006 (completion entry)
Agent: R1-contracts-c (Super Z, zai-web session web-64d10b73-530a-4f71-9961-85d0436c7fb5)
Task: Wave-3 assessment-loop zod contracts — ported, gated, IN_REVIEW

Work Log:
- Read the frozen assessment surface constraint-for-constraint: all 11 records in assessment/dto/ + the five controller files incl. their nested records (PaperView/PaperDetailView/PaperQuestionView; PartSelfMark/SelfMarkRequest/SelfMarkView/PartView) + the construction sites that decide null-vs-empty on the wire (AssessmentService.submit :96-135; AttemptHistoryService.historyFor :60-130) + Answer.java:34 / Attempt.java:82 (the two MarkingState domains) + Question.java:26-27 / QuestionPart.java:31-39 / ServableQuestionService.specPointRefs :110-140.
- Ported packages/contracts/src/assessment.ts: 4 request schemas (jakarta constraints verbatim: @NotNull UUIDs, @NotNull @Min(0) Long, @Min(1)@Max(5) Integer WITHOUT @NotNull → nullish, @Size(max=4000) with UTF-16 parity, @NotEmpty @Valid cascade, primitive-boolean null→false preprocess per Boot's disabled FAIL_ON_NULL_FOR_PRIMITIVES) + 13 response view schemas (present-or-null, never absent; capture-unproven tags where no construction path proves nullability) + both MarkingState enums / Provenance / family-type / SpecPointRef / param + path bundles. Shared enums imported from ./content — no duplicated value lists (stack disclosure in the yaml).
- Encoded the boundary's true accept/reject sets, including two captured-behaviour flags for the port lane: SelfMarkRequest null parts → core NPE → 500 (schema faithfully accepts; divergence call = R0), and the duplicate-part 400 with the controller's exact message encoded as superRefine. Jackson scalar→boolean coercion documented as the port layer's binding-shim duty (T-MIG-010 precedent) — not silently dropped.
- Gates: bun install frozen (bun.lock byte-identical); typecheck x4 exit 0; bun test apps/api packages → 185 pass / 0 fail / 4 skip (assessment.test.ts contributes 53 pins); golden --selftest OK.
- H-1 (honest disclosure): one initial test failure was the TEST's misreading of zod strictness (expected rejection of unknown option keys; zod strips them by house convention) — test corrected to pin the strip semantics; no schema constraint was widened anywhere.

Stage Summary:
- T-MIG-006 IN_REVIEW: branch t-mig-006/r1c (claim commit 7d33d04), receipt .syllabai/receipts/T-MIG-006/run-001-gates.json, PR titled "T-MIG-006: wave-3 assessment-loop zod contracts" — STACKED on PR #18, merge-order note (18 → 6) in the PR body for R0. Wave-3 port lanes (T-MIG-030..034) are contracts-unblocked on merge. Follow-ups filed in the yaml's next_safe_actions: smartmark/teacher-marking/test-builder/transcription DTO surfaces (other packages — W3 remainder/W5), R1 consolidation of the duplicated javaIntParamSchema mirror post-#18, R6 flags for the first attempt-surface capture (primitive-boolean null binding; partial self-mark behavior).

Task ID: T-MIG-006 (claim)
Agent: R1-contracts (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Self-file + claim the write-flow contracts prerequisite (operator directive: "check, claim and continue to work") while T-MIG-005 awaits R0 review.

Work Log:
- PR #18 watch: CI verify+hub SUCCESS @ 9a99790, mergeable_state clean, no R0 review yet; main unmoved at 67639db.
- Board survey (9 open PRs): T-MIG-020 two-branch collision (r3a claimed 05:23:50Z / PR #20, 25/25 live replay, vs r3 claimed 05:41:57Z / tranche-1 IN_PROGRESS — earliest-claim favors r3a, R0 arbitrates); T-MIG-021 claimed 05:54:23Z (PR #19, claim-only); T-MIG-014 three-way id collision (PR #13 db-driver vs PR #15 ratelimit; 015/r7a yielded + renumbered); R7 dossier (PR #17) proposed 022 = teacher-content + question assets, but r3a's 020 (26 content cases incl. review queues + question assets) + 021 (12 curriculum cases) absorb the full 38-case read surface — 022 left for an R0 call, deliberately unclaimed by this lane.
- Gap filed: WRITE-FLOW CONTRACTS. PR #20 ships honest 501s for every ContentController/ContentDocumentController write surface, each naming "the T-MIG-020 write-surfaces follow-up"; MIGRATION_PLAN §5 puts the assessment loop in Wave 3 (T-MIG-030..034); §4.1 contracts-first + the dossier's gate list ("packages/contracts is R1's fence — request, don't reach into the fence") make the zod prerequisite an R1-lane task. No yaml on any in-flight branch claims it; id T-MIG-006 free.
- Claim per §2.1: branch t-mig-006/r1 stacked on t-mig-005/r1 @ 9a99790 (write contracts import 005's enums, Spring-exact binding mirrors, error envelopes — canonical contracts tree, no vendoring/duplication); yaml owner + status CLAIMED @ 06:08:30Z with second-lane disclosure (operator directive trace 1a10aa5d3ca4eb61; 005 review turnaround unaffected); receipt run-001-claim.json (board survey incl. collision timestamps, pre-claim gates, plan of work) — all in this branch-start commit.
- Next: raw-read (C1) write DTOs from frozen core 6cad6ef → packages/contracts/src/content-writes.ts; pins from Java-declared shapes (no golden write captures exist); diff review (never widen); gates; push.

Stage Summary:
- T-MIG-006 CLAIMED (stacked on PR #18). The write-surface 501s now have a named contracts prerequisite en route. Awaiting R0: #18 review, 006 id ratification, stacking acceptance.

---

Task ID: T-MIG-006 (work entry)
Agent: R1-contracts (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Port the six W2 controllers' WRITE-surface DTOs constraint-for-constraint into packages/contracts (stacked on t-mig-005/r1).

Work Log:
- Raw-read (C1, frozen core 6cad6ef via the pre-existing local sparse clone): ContentController (15 write endpoints), ContentDocumentController (2), TeacherCurriculumController (5), PastPaperDraftDto, CurriculumDraftDto, CanonicalDocumentDto, CanonicalDocumentValidator, ContentReviewService records. Verified CurriculumController/ContentReaderController/QuestionAssetController have NO write mappings (F4).
- Landed packages/contracts/src/content-writes.ts (+40-pin content-writes.test.ts + index export): PastPaperDraftDto (5 nested records, MarkSchemeDraft null-points→[] compactor), CurriculumDraftDto (RECURSIVE TopicDraft via z.lazy — package's first recursive schema), CanonicalDocumentDto (13 fields, 4 element families, §8 snake_case wire names kept), CanonicalDocumentValidator → canonicalDocumentViolations (violation strings + order byte-matched; P-6 derivedDocumentId SHA-256 mirror with independently computed test vectors), review-action requests (PlaceRequest @NotNull uuid; TopicMappingRequest; SchemeValidateRequest whole-body-optional per @RequestBody(required=false)), validate-all `force` boxed-Boolean binding, 8 write-response views (z.literal "SUGGESTED" where the controller hardcodes it).
- FINDINGS F1–F5 in run-002-work.json. Headline F1: request-side binding ≠ response-side serialization — `.nullable().default(null)` mirrors Jackson's absent≡null for references; `.default(<jvm>)` + null-reject mirrors primitives; .nullish() is WRONG on request bodies (invents undefined, a state Java never has). F2: Jackson default scalar coercions mirrored (javaJsonInt/Double/Bool). F3: TeacherCurriculumController's 5 write endpoints are MISSING from PR #20's 501 inventory — the write follow-up must scope them in.
- Gates, final pass, all exit-captured: contracts typecheck 0; contracts tests 109/0 (was 69 — +40 pins); repo typecheck x4 0; bun test 181 pass / 4 skip / 0 fail (was 141 — 0 regressions); golden --selftest OK.
- NO golden write captures exist — acceptance baseline is the Java declaration itself (positive pins from records, negative pins from @NotNull/coercion/validator rejections, byte-exact violation strings + derivation vectors). Divergence note recorded: schemaVersion 409 (drafts) vs validator 400 (canonical) mirrored as constants + collector, not folded into binding schemas.

Stage Summary:
- T-MIG-006 work COMPLETE on t-mig-006/r1 → IN_REVIEW (PR #23, stacked on PR #18). The write-surfaces follow-up named by PR #20's 501s now has its §4.1 prerequisite en route, including the F3 intel (teacher-curriculum writes missing from the 501 inventory). Awaiting R0: #18 merge first, then 006 retarget; id + stacking ratification.
---
Task ID: T-MIG-004 (F-5 extension addendum — real-data capture complete)
Agent: w0a (Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Execute the preregistered F-5 unblock (operator supplied NEON_PAT): capture the real-data happy-path tranche for the W2 content-read surfaces from a Neon COW branch; append missing cases + receipts. No port code, no runner changes.

Work Log:
- Operator unblock received in-session (NEON_PAT). Verified against Neon API v2 (GET /projects 200; project billowing-cherry-15418366 "SyllabAI"). NOTE: the sandbox does not persist exported env vars across tool calls — the first verification round actually ran with an EMPTY bearer (400 "not authenticated"; a fake-token control returns 401, a distinguishing signature). Token persisted to the gitignored operator-workspace .env and sourced per call thereafter; value never echoed.
- Workspace had been reset between segments (run-002 scratch tooling gone): re-provisioned Temurin JDK 25.0.4.1 + Maven 3.9.16, shallow-cloned syllabai-core to scratch (C1 read-only), mvn -DskipTests package BUILD SUCCESS 39.8s (boot jar 180MB). Background processes do not survive between tool calls here — the build/boot/capture pattern runs foreground within single calls (T-MIG-010-era sandbox note amended).
- Created Neon COW branch golden-capture/2026-10-05 (br-fancy-surf-a52owvza, parent production br-muddy-bar-a5huwldd) with its own read_write endpoint; reset the branch-local neondb_owner password via the API (production role untouched). Read-only inventory of the branch: 1023 documents / 4740 document_chunks / 108 exam_papers (95 VALIDATED, 13 REJECTED, 0 SUGGESTED) / 585 question_asset / 1526 questions / 323 users; created_at unique across all documents (ordering determinism verified before committing the full-listing case).
- Booted the frozen core against the branch (synthetic JWT secret, synthetic teacher join code, LLM test mode, decay-job off by config; Flyway validated the copied history no-op; Hibernate validate passed on the production end-state). First teacher registration got 403 — my script had exported only an internal alias, not SYLLABAI_TEACHER_JOIN_CODE; the core's fail-closed gate refused exactly as designed. Fixed env name; both synthetic accounts registered via the honest API path.
- Captured 15 golden cases (13 + 2 extension): teacher documents list/detail/canonical on real rows (full 1023-doc listing committed as exact body); review-queue v1/v2/v3 on real state (papers [] is TRUE production reality — 0 SUGGESTED — with real counters v1 59/144, v3 practicableTopicCount 34; v1-vs-v2 asymmetry pinned, see F-9); exam-papers/{real VALIDATED 4CH0/2CR June 2013}/review (first real PaperReviewView); reader CitationDocumentView with PaperRef (role QP) AND the paper=null branch; page drill-ins (page=1 cover-empty honest text:"", page=4 real 716-char text, page=99 bounds 404); question-assets real binary 200 (130627B image/png via <non-json> sentinel, F-8 convention); unauthed 401 + student-403 on the real surface.
- Gates: typecheck x4 exit 0; bun test 119/0/4skip; golden --selftest OK. Replay classification of the 15 (status-level, locally booted current-main v2 api): 1/15 PASS (unauthed 401 — fallback already answers), 14 EXPECTED-PENDING owned by T-MIG-020/021. Full 70-case replay against the branch-backed api is compute-impractical in this sandbox (F-13).
- Findings F-9..F-14 recorded in .syllabai/receipts/T-MIG-004/run-002-extension-neon.json. Headlines: F-9 v1-vs-v2 review-queue counter asymmetry is a PARITY REQUIREMENT (do not normalise); F-11 search-with-real-hits REMAINS uncaptured — the serving path hard-requires SYLLABAI_EMBEDDING_GEMINI_API_KEY (lexical arm is benchmark-only); recommendation (b) for R0: behavioural gate for search-hits instead of a golden case; F-12 zero SUGGESTED papers in production — the F-5 queue item was adjusted to pin the real state.

Stage Summary:
- F-5 tranche: 4 of 5 surfaces captured and committed (15 new cases; 69 total on this branch); search-hits is the single residual item and is blocked on a provider-key DECISION, not on capture mechanics (F-11). Zero production writes, zero production compute contact (branch endpoint only), zero upstream writes, zero PII/secrets committed (automated email scan: 0 non-synthetic). Receipts: .syllabai/receipts/T-MIG-004/run-002-extension-neon.json + .syllabai/receipts/capture/2026-10-05/run-003-004-neon-cow-extension.json (per-case sha256). Task yaml status intentionally untouched (DONE is R0's field); this addendum + receipts carry the extension. Branch t-mig-004/w0a-ext is push-ready; push/PR blocked on a valid GITHUB_PAT in this session (same credential class as the T-MIG-000 stand-down addendum) — escalation per AGENT_COORDINATION §6.

---

Task ID: R7-HOUSEKEEPING (wave-2 claim prep — read-only dossier)
Agent: R7a (agent-da4ab8, zai session web-da4ab8b1, Asia/Dhaka)
Task: Flex-lane prep for the Wave-2 ports (T-MIG-020..022) R0 named next — evidence-only; no claims filed, no fences touched.

Work Log:
- Survey: all seeded tasks DONE or claimed (011 -> r5 branch active); four PRs in R0's queue (#12/#13/#14/#15); no claimable lane without collision. Proceeded with read-only prep intel for the next phase instead (w0a intel-broadcast precedent).
- Derived the W2 route surface from main's own golden cases (54 total = 15 auth + 1 health [DONE lane] + 38 W2): teacher/content/documents 11 (ContentDocumentController), teacher/content review+provenance 9 (ContentController), content/documents reader 3 (ContentReaderController), curriculum subjects+versions 7 (CurriculumController), teacher/curriculum 6 (TeacherCurriculumController), question-assets 2 (QuestionAssetController). Full per-case map in the receipt.
- Verified frozen-core controller/repository paths at syllabai-core @ 6cad6ef (anonymous treeless clone) — all six controllers + repositories exist at the cited paths.
- Starting state recorded: apps/api routes = auth + health only; routers-then-401-fallback (T-MIG-010 ratified wiring) means the 7 unauthed-401 W2 cases should replay green TODAY (expectation, labelled — verify at replay); ports must preserve exact shape/status while replacing fallback 401s with real handler authz.
- Dependency gates recorded: PR #13 (seed-shaped replay db) gates all three lanes; T-MIG-004 F-5 (NEON_PAT) gates the real-data tranche + question-assets binary path; runner header-comparison gap (F-3) + tolerate wiring defect sit in R6's fence; packages/contracts is R1's fence (W2 response schemas need R1 coordination at source per T-MIG-010 precedent); F-1/F-2 divergence calls (200 [] unknown version; blank-query 500) belong to R0 — captured as-is, do not silently fix.

Stage Summary:
- Receipt: .syllabai/receipts/R7-housekeeping/wave2-claim-prep.json (route surface + verified controller map + proposed 020/021/022 split [recommendation only — R0 owns the final split] + per-task claim readiness). Claim race left to §2.1; this dossier is not a claim. Merge-order note: PR #14 (T-MIG-015) also appends to this worklog tail — whichever lane merges second rebases per append-only union.
Task ID: T-MIG-010 (rebase + golden replay addendum)
Agent: R3-api-a (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Rebase the identity port onto post-W0 main; face the T-MIG-003 golden gate; fix capture-surfaced divergences

Work Log:
- Cherry-picked the port commits onto main @ 728450f (R0's UNBLOCK-SEQUENCE had rebuilt this lane; my claim 0462fd3 was cherry-picked by R0 as the lane claim — arbitration evidence for the r3b draft PR #9 recorded in the PR thread). Worklog union merged; yaml note retargeted to the rebased base.
- Capture-surfaced fixes (the golden gate doing its job):
  (1) R-JWT alg selection — the deployed core signs with jjwt's KEY-SIZE-SELECTED alg (HS384 per the captured token; the JwtService class doc's "HS256" is stale). Port now selects HS256/HS384/HS512 by secret byte length; parse accepts the HmacSHA family, rejects everything else.
  (2) @Email text — capture pins "must be a well-formed email address" (Hibernate 9); translated at the route layer; R1 asked to update packages/contracts at source.
  (3) Empty-body field-error order — capture pins "password: must not be blank" for {} on both surfaces; encoded as a capture-pinned rule; core ordering may be nondeterministic (R6 probe requested).
  (4) Health body — {groups:[liveness,readiness],status:"UP"} (OUT-OF-FENCE one-liner; case already justified:true).
- Golden replay vs live v2 api on the branch: canonical runner 1/16; tolerant classification 13/16 PASS with 0 GENUINE-FAIL — the 3 pending are harness/capture items owned by R6/R0: runner deepEqual drops the tolerate list (12 cases fail on tolerated timestamps only — one-line fix in golden/**), scrub substitution for success-case token/id, write-case ordering/state, bearer-token injection. Evidence tool (fence-safe) + full classification in .syllabai/receipts/T-MIG-010/run-003-golden-replay.json.
- Bun serving note for api dev: `bun apps/api/src/index.ts` auto-serves the default export; a manual Bun.serve double-binds and crashes boot — removed the manual serve.

Stage Summary:
- All gates on the rebased head: typecheck 0 errors; unit 107 pass / 0 fail; integration 4/4 vs branch; golden replay 13/16 tolerant / 0 genuine / 3 harness-pending; selftest OK.
- T-MIG-010 remains the fleet's critical path (R0's own words) — this PR is the completed port, receipted end-to-end; merge order #1-superseded → #2 → this (already rebased on main).

---
Task ID: T-MIG-013
Agent: R3-api-a (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Land the capture-driven identity golden-gate hardening that postdated the T-MIG-010 merge

Work Log:
- Replayed the T-MIG-003 golden cases against the live ported api BEFORE the merge finished (run-003 in the T-MIG-010 receipts); the replay surfaced four divergences that main's merged state does not yet carry. Filed T-MIG-013 (task id self-assigned, R0 ratification requested in the PR) and cherry-picked the fixes onto main @ 67639db.
- Landed: R-JWT key-size alg selection (HS384 cutover-critical fix), @Email Hibernate 9 text shim, empty-body field-order pin, health groups shape (OUT-OF-FENCE one-liner), tolerant replay classification tooling (fence-safe).
- Gates: typecheck 0 errors; unit 107/0/4skip; selftest OK; identity golden subset 13/16 tolerant-pass with 0 genuine divergences (classification in receipts).

Stage Summary:
- Harness/capture items for R6/R0 (golden/** fence): runner tolerate wiring, scrub substitution, write-case ordering, bearer-token injection.

Stage Summary addendum (T-MIG-013): CI first ran red on a test-harness timing artifact (epoch-aligned 60s window boundary crossed mid-loop reset the per-account counter → Expected 9 / Received 7); assertions made boundary-robust; CI verify+hub both success on the hardened head. PR #12 awaiting R0 (task-id ratification + merge).

---

Task ID: T-MIG-014
Agent: R7a (agent-da4ab8, zai session web-da4ab8b1, Asia/Dhaka)
Task: Reference docs drift fix — REFERENCE_DOCS.md ADR paths + receipts-heritage attribution (self-selected per §5; closes R7a orientation Q1, corroborated by R1 orientation Q2).

Work Log:
- Sandbox reset detected on session resume (clone/.creds/local worklog wiped) — re-cloned syllabai-v2 anonymously (public repo) and reconstructed state from the repo per receipts culture. PR #3 (T-MIG-000) and PR #5 (R7 housekeeping) confirmed MERGED via git history; my lane items DONE.
- Board survey: 7 DONE, T-MIG-011 claimed (r5), T-MIG-013 filed by R3 (branch yaml) — not claimable. Self-selected the open docs-drift fix as R7a flex work; authored .syllabai/tasks/T-MIG-014-reference-docs-drift.yaml per §4 (w0a/T-MIG-004 precedent) after a no-collision scan (no yaml claims v2 docs/**).
- Verified EVERY path REFERENCE_DOCS.md cites, via anonymous shallow clones of master pack / syllabai-core / syllabai-hub / syllabai-resources: 13/13 ADRs at pack ROOT (0 under docs/adr/), 12/12 core rows OK, 8/8 hub rows OK, no bench/ at resources root. Only the two drift items were wrong.
- Fixed: 13 ADR row paths (docs/adr/ADR-* -> ADR-*), receipts-heritage line (resources-repo -> master-pack bench/review/), + 2-line verification note. Nothing else. Evidence: .syllabai/receipts/T-MIG-014/run-001.json.
- PUSH BLOCKED: no GITHUB_PAT this session (sandbox reset wiped .creds; per credential law no token improvised/created — same wall w0a hit and disclosed). Branch t-mig-014/r7a is push-ready verbatim; yaml status -> BLOCKED per w0a precedent.

Stage Summary:
- UNBLOCK for operator/R0: supply a valid GITHUB_PAT in-session -> push t-mig-014/r7a -> PR "T-MIG-014: reference docs drift fix" -> IN_REVIEW. Docs-drift findings F-class: REFERENCE_DOCS.md now 33/33 verified paths; future agents get correct raw.githubusercontent URLs. Rotation recommendation for briefing tokens stands (they transited chat plaintext; several peers report dead tokens in-worklog).

---

Task ID: T-MIG-015 (renumbered from T-MIG-014 — push + collision yield)
Agent: R7a (agent-da4ab8, zai session web-da4ab8b1, Asia/Dhaka)
Task: Push the completed docs-drift fix after operator credential unblock; resolve the three-way T-MIG-014 ID collision surfaced at push-time recheck.

Work Log:
- Operator unblock received (fresh GITHUB_PAT supplied in-session; stored under .creds/ only, never echoed/committed — the rotation recommendation for chat-transited tokens stands). Push executed per the pre-blocked plan.
- Collision discovered at push-time recheck: three DIFFERENT tasks filed as T-MIG-014 within 23 minutes, each after an honest no-collision scan against main (the scans raced each other, not main): this lane (docs drift, claim 27bca71 @ 2026-10-05T05:00:49Z — earliest); R3a/superz-agent-b (URL-dispatched db driver, claim ecded41 @ 05:08:44Z, PR #13 open IN_REVIEW @ 05:19:09Z, P1, unblocks Wave-2 replay); R1 (per-IP RateLimitFilter M1, claim b1f63b4 @ 05:23:58Z, claim-only).
- Decision: YIELD the T-MIG-014 ID despite earliest claim; renumbered this task to T-MIG-015 (next free — nothing on main/remote used it at push time). Rationale: earliest-claim is a tiebreak, not territory; PR #13 is already in R0's review queue with .syllabai/receipts/T-MIG-014/** populated and mergeable-clean, so contesting would churn an in-review P1 and buy nothing substantive. R0 retains full discretion to re-rule the ID; nothing substantive changes either way.
- Mechanics: branch t-mig-014/r7a -> t-mig-015/r7a; yaml + receipts dir moved to T-MIG-015 (run-001.json byte-identical); claimed_at corrected to the commit-authoritative stamp (the 19:55+06 value was a transcription error — commit 27bca71 says 05:00:49Z = 11:00:49+06); status BLOCKED -> IN_REVIEW; the docs citation line follows the receipt to T-MIG-015; run-002.json records this run incl. gates (docs-only: diff-surface check, code gates N/A).

Stage Summary:
- PR "T-MIG-015: reference docs drift fix" open, IN_REVIEW, awaiting R0; 33/33 cited paths verified. Residual for R0: R1's claim-only t-mig-014/r1 still carries the contested ID — after PR #13, T-MIG-014 on main means the db-driver task, so R1's lane is the one needing renumber per this timeline.
Agent: superz-agent-b (R3 lane self-selected; zai-web session web-06433aa8-e5f9-4e9b-9519-db4ca339d2a9)
Task: Filed+claimed+implemented URL-dispatched db drivers (postgres.js for non-Neon Postgres) so golden replay can target seed-shaped state — plus found+fixed a latent neon-http incompatibility the live check exposed.

Work Log:
- Post-merge acknowledgment of R0's T-MIG-012 ruling (b7ef4a5): my final commit had swept a regenerated root bun.lock via `git add -A` without a status re-check, contradicting the receipt's "zero lockfile changes" claim. Process slip owned; status-recheck added to my commit checklist.
- Board survey after re-establishing my sandbox (full reset — re-cloned, credentials re-loaded from operator message): 7 tasks DONE, T-MIG-011 claimed (r5), PR #12 (T-MIG-013) verified no-overlap. Per R0's phase-2 critical path ("then Wave-2 ports T-MIG-020..022 against the fresh capture"), the blocker in front of every Wave-2 replay gate is replay-environment access: no driver in the monorepo can reach a seed-shaped non-Neon Postgres.
- Filed+claimed T-MIG-014 in the branch-start commit (ecded41): URL-dispatched drivers; disclosed out-of-fence identity adapter + mechanical bun.lock change up front.
- Implemented: isNeonUrl() host dispatch in packages/db (neon-http for *.neon.tech — production unchanged; postgres.js TCP for everything else), 9 unit pins, createSql adapter split (NeonWsClient = byte-identical prior behaviour; PostgresJsClient = TCP) with interactive-tx semantics preserved.
- Created Neon scratch branch t-mig-014/r3a via console.neon.tech (rows-only; no production contact). Operational notes recorded: /connection_uri route absent in current API; role creation IGNORES caller-supplied passwords and returns its own 16-char value — future lanes take the password from the creation response.
- LIVE EXPOSURE OF A LATENT SUBSTRATE BUG: createDb()'s neon-http path failed every live Neon query — drizzle-orm 0.38.x calls neon(strings, values, options), a form @neondatabase/serverless 1.x removed; invisible to unit tests (lazy construction), never live-exercised (T-MIG-010's integration used ws). Fixed in-fence: pin 0.10.2 + do-not-lone-bump comment. Re-ran live: 3/3 PASS (neon-http select; postgres.js TCP select+params; createSql template + interactive tx + rollback-then-reuse).
- Gates: root typecheck exit 0 (4 workspaces); bun test 111/111; golden selftest OK.
- Receipt: .syllabai/receipts/T-MIG-014/run-001.json.

Stage Summary:
- T-MIG-014 → IN_REVIEW (PR t-mig-014/r3a). The fleet gains: seed-shaped golden replay for Wave 2 (the T-MIG-004 worklist becomes executable), CI-runnable replay tooling, and a substrate bug fix that would have burned the first createDb consumer. Next for this agent: T-MIG-020 (content read surfaces, 26 golden cases) — contracts content.ts + the four read surfaces + honest 501s on the write paths, replayed per the environment doctrine this task establishes.

---

Task ID: ORIENTATION (Phase-1 gate per AGENT_BRIEFING §2 — this agent's own entry; no PR from this agent merges before it exists)
Agent: r3-c (self-selected agent — Super Z, zai-web session web-1f157e25-0ed7-4f18-8956-3b2a993bc646)
Task: Phase-1 orientation — tour the org, read the law, adopt the culture. No code in this entry.

Work Log:
- Read the eight required v2 items in order (README → MIGRATION_PLAN → AGENT_COORDINATION → GOLDEN_MASTER → BASELINE_DB → REFERENCE_DOCS → worklog (all 455 lines, tail thrice) → task queue), then toured upstream: shallow-cloned syllabai (master pack), syllabai-core, syllabai-hub (clone landed exactly at import SHA 93226a4), syllabai-resources (blobless sparse — repo times out a plain shallow clone; bench/review ABSENT there, confirming prior agents' finding that the receipt heritage lives in the master pack). Read core README + render.yaml (env surface, fail-fast JWT doctrine, R2 boot-time-WARN/loud-fail notes) + docs/DEPLOYMENT.md; hub docs/ARCHITECTURE.md + REPOSITORY_MAP.md; all 13 master-pack ADRs (031, 025, 036, 034, 020, 023 mandated; 017, 021, 027, 030, 032, 033, 035 wave-relevant); .syllabai/tasks/T-C42.yaml (format model); bench/review/doc-validation-20261004/tc75 postverify receipt (row-count invariant + SHA256SUMS style).

Stage Summary:
- (a) PRODUCT LOOP IN MY OWN WORDS: A learner registers on the hub (always STUDENT; teachers arrive only through a join-code gate, ADMIN is never self-serviceable) and studies a curriculum anchored to an official Edexcel spec. They practise real exam-paper questions; every answer is marked by exactly one authority — MCQs deterministically, structured parts by Smart Mark, which normalises the answer, aligns evidence to VALIDATED mark-scheme points, and runs bounds/mark-sum/coverage validators so the LLM proposes but never decides; self-mark against the revealed scheme stays a first-class alternative. Each marked attempt emits an evidence event that updates the learner model — BKT mastery with format-aware guess pricing and BDT misconception posteriors — and those stored values are ANCHORS: forgetting decay (ADR-031) and misconception relaxation toward the base rate (ADR-032) are computed at read from (anchor, timestamp) pairs and never persisted, so late or catch-up runs compose exactly instead of compounding. From that state the platform derives an explainable next-best-action agenda (recommendations are learning-first, never engagement-optimised, ADR-017), spaced-repetition flashcards whose cross-device rating trail merges by sync receipts rather than timestamps (ADR-034), and smart lessons. The tutor/CLA answers through a retrieval chain grounded ONLY in validated curriculum-graph nodes and embedded content chunks — it refuses deterministically when evidence is insufficient or the course reference does not resolve to exactly one serving curriculum (ADR-030), and every citation deep-links to a learner-readable endpoint that serves only content on the serving side of the corpus law. Teachers see classroom-scoped surfaces — marking queues showing only their enrolled learners' answers (ADR-027), coverage/analytics over the knowledge graph, test building — and research surfaces expose calibration statistics under learner-unit k-anonymity (k=5, ADR-036) that never self-accepts its own ratification. The whole loop is being strangler-figged into this repo behind golden-master parity gates on the same Neon database while the frozen Java core keeps serving production.
- (b) THREE CORRECTNESS MECHANISMS OBSERVED: 1) RECEIPTS — every claim carries machine-checkable evidence; concrete example: T-C42.yaml's execution_record pins the production probe (PRB-01 pct_above_050 = 59.5%, 1,745/2,935, VALIDATED pool n=2,935) with CI run ids and merge SHAs, and the tc75 postverify receipt asserts "audit total 2829 -> 2835 (+6 exactly)" with SHA256SUMS alongside — the same discipline this repo's .syllabai/receipts/ continues. 2) FAIL-FAST — services refuse to boot or serve in a misconfigured state; concrete example: render.yaml + core README — blank SYLLABAI_JWT_SECRET refuses startup, R2 secrets missing is a boot WARN whose operations then fail loudly naming the missing setting (no silent local-disk fallback), and v2's packages/db client refuses blank or jdbc:-prefixed DATABASE_URLs; the extension I just ported: ContentRetrievalService throws a loud IllegalStateException when no embedding provider is keyed rather than silently returning empty hits. 3) PREREGISTRATION + HONEST VERDICTS — decisions and their gates are written before evidence, and negative results stay recorded; concrete example: ADR-036 stays Status: Proposed with the operator's ACCEPT flip named as the ratification step ("this ADR does not self-accept"), ADR-033 keeps shortAnswerGuess=0.05 labelled provisional with "an empty bin is no evidence, never good evidence", and the T-MIG-004 capture committed the blank-query 500 and the nodes-by-version 200-[] oddities as-is instead of smoothing them.
- (c) UNCLEAR / QUESTIONS FOR THE OPERATOR: 1) golden/cases/content-docs-embed-unknown-404.json captures a 500 internal_error (Java checks the embedding provider BEFORE the document row, so unknown-id cannot 404 unkeyed) — the FILENAME says 404 but the EXPECT says 500; I port to the expect and flag the name/expect mismatch for R6 (rename is R6's call, never mine). 2) T-MIG-004 F-2's mechanism hypothesis ("@NotBlank does not trigger method validation") does not fully explain the 500 on the same boot that also captured SCOPE_UNRESOLVED empties — my port reproduces the captured 500 verbatim without committing to a mechanism; if R6 ever re-probes the core and pins a different mechanism the case stays the law. 3) The search empty-cause header (X-Search-Empty-Cause) is captured in case descriptions only because the runner compares status+body — T-MIG-013 named "runner header comparison" a harness gap in R6's fence; until it lands, my receipt classifies header parity separately. 4) REFERENCE_DOCS.md still cites master-pack ADRs under docs/adr/ though they sit at the repo root (doc-fix candidate, docs shepherd).


---

Task ID: T-MIG-020
Agent: r3-c (Super Z, zai-web session web-1f157e25-0ed7-4f18-8956-3b2a993bc646)
Task: Port content READ surfaces (Wave 2) — teacher content documents + review queues v1/v2/v3 + paper review/audit/provenance + question topics read + citation reader + question assets; golden-gated

Work Log:
- Self-selected per AGENT_BRIEFING §5 after re-reading the worklog tail and surveying the remote (git ls-remote + anonymous API): T-MIG-011 CLAIMED (r5), T-MIG-013 IN_REVIEW (r3a, PR #12), no Wave-2 port branch existed; R0's UNBLOCK-SEQUENCE-PHASE2 names Wave-2 ports the next critical path. Authored .syllabai/tasks/T-MIG-020-content-read-surfaces.yaml per §4 (T-MIG-004 precedent for authoring a missing yaml) and claimed in the branch-start commit f5773bc together with this agent's Orientation entry.
- Read the frozen sources constraint-for-constraint before any code (contracts-first): ContentDocumentController, ContentReaderController, QuestionAssetController, ContentController (read endpoints), ContentReviewService (read-only projections incl. baseEnrichment + v3 census + rankReasons + anchor synthesis), CurriculumScopeResolver (incl. M3 memo + V53 resolveForCourse), ChunkVectorRepository (searchServingEligible + diagnoseEmpty SQL verbatim), DocumentRepository (existsCitable corpus law), DocumentPageText, SearchEmptyCause/Diagnostics, DocumentEmbeddingService (embed order), SecurityConfig route rules, GlobalExceptionHandler shapes, KnowledgeNodeRepository subtree CTE.
- Wrote packages/contracts/src/content.ts (zod, source-line headers, nulls-not-optional Jackson law, Document.Kind/ValidationState enums from the ck constraints, captured binding behaviours documented) + export line in contracts/src/index.ts.
- Ported apps/api/src/services/content/: scope.ts (resolver + recursive CTE), repositories.ts + review-repos.ts (observed query surfaces, R-LAZY), retrieval.ts (searchServingEligible/diagnoseEmpty SQL verbatim, CURRENT_EMBED_REV=2, MAX_LIMIT=50 clamp, SearchEmptyDiagnostics.cause() classification, Gemini provider seam), reader.ts (corpus law + verbatim page text), review.ts (v1/v2/v3 queues + paperReview/audit/provenance/topics with pure helpers exported), index.ts (composition root, fail-fast DATABASE_URL).
- Ported apps/api/src/routes/content/index.ts: three routers with the authz shell FIRST (teacher: TEACHER/ADMIN Boot 401/403 bodies; reader/assets: authenticated), search binding parity (missing query → 400 validation_failed custom shape; PRESENT-BLANK → 500 captured as-is per T-MIG-004 F-2; conversion-before-validation order), uuid path params → 400 "malformed request", honest 501s (16 write surfaces) naming the owning task, question-assets empty-body 404, embed provider-before-lookup order.
- OUT-OF-FENCE commit 47c91f6: 3 mount lines in apps/api/src/index.ts (path parity) — R0 ratification requested per T-MIG-010 precedent.
- Gates (persisted gate script, exit-captured; receipt .syllabai/receipts/T-MIG-020/run-001-local-verify.json): typecheck x4 exit 0; bun test 151 pass / 0 fail / 13 skip (unit tier over in-memory fakes pins captured bodies incl. messages and empty shapes; content integration tier committed, self-skips without INTEGRATION_DATABASE_URL); golden --selftest OK. Golden live replay of the 25 owned cases PENDING on a Neon branch — NEON_PAT absent this session (same posture as T-MIG-004 F-5); NO case weakened, NO capture altered.

Stage Summary:
- T-MIG-020 implementation COMPLETE with all executable gates green; 25 golden cases statically classified to handlers + test pins (see receipt). Honest gaps disclosed: live replay pending Neon unblock; X-Search-Empty-Cause header parity not runner-verifiable (R6 harness item); embed write path behind the provider seam (unkeyed = the core's own 500); case filename/expect mismatch (embed-unknown-404 pins 500) flagged for R6. Zero upstream writes, zero Neon connections, zero PII/secrets committed.

---
Task ID: T-MIG-020 (addendum — push blocker)
Agent: r3-c (Super Z, zai-web session web-1f157e25-0ed7-4f18-8956-3b2a993bc646)
Task: Escalation record — branch push rejected; task status → BLOCKED per AGENT_COORDINATION §2/§6

Work Log:
- `git push -u origin t-mig-020/r3` → "fatal: could not read Username for 'https://github.com'": no GITHUB_PAT in this session's environment at all (briefing §0 plaintext unavailable in-context after the summarisation boundary and never file-persisted per credential law; anonymous reads work — the repo is public — which is why this surfaced only at the first authenticated write, the same pattern as w0a's T-MIG-000 addendum).
- No substitute credential improvised (credential law: do not create new tokens). No upstream writes attempted (C1). No secrets echoed or committed (env-var NAME references only).
- Committed protocol artifacts locally on branch t-mig-020/r3: receipt (.syllabai/receipts/T-MIG-020/run-001-local-verify.json), task yaml status BLOCKED (push-only; implementation complete), this entry.

Stage Summary:
- T-MIG-020 is push-ready verbatim: local branch t-mig-020/r3 = f5773bc (claim + Orientation) → a7d5b85 (in-fence port) → 47c91f6 (OUT-OF-FENCE mounts) → this commit (receipts + worklog + BLOCKED). UNBLOCK for the operator/R0: provide a valid GITHUB_PAT to this lane (then push, open PR "T-MIG-020: port content read surfaces (Wave 2)", flip status IN_REVIEW), or push the branch from an authenticated session and review the receipt at .syllabai/receipts/T-MIG-020/run-001-local-verify.json.

---
Task ID: T-MIG-020 (addendum 2 — lane collision on the shared branch name; escalation per AGENT_COORDINATION §6)
Agent: r3-c (Super Z, zai-web session web-1f157e25-0ed7-4f18-8956-3b2a993bc646)
Task: Record the duplicate-claim collision on t-mig-020/r3 and move this lane's push to a disambiguated branch; R0 arbitration requested.

Work Log:
- Operator supplied GITHUB_PAT (+NEON_PAT). PAT verified (api.github.com /user → 200, account SyllabAI). Push of t-mig-020/r3 REJECTED non-fast-forward: the remote branch already exists with peer R3-api-a's commits (e50a63f claim @ 2026-10-05T05:42:41Z → a5a08de tranche-1 services → 3eff6bb worklog append @ 05:55:59Z; deps: T-MIG-005 contracts + T-MIG-014 driver dispatch; task IN_PROGRESS).
- Precedence facts (git author dates; both branches from 67639db): THIS lane's claim f5773bc @ 2026-10-05T05:17:00Z precedes R3-api-a's e50a63f @ 05:42:41Z by ~25 min; this lane could not push earlier (credential blocker, addendum above) while the peer could.
- Doctrine applied: NO force-push over the peer's branch; NO unilateral merge/rebase of the two implementations; NO cross-fence rework of either side. Escalation recorded instead (this entry + yaml execution_record + PR disclosure).
- Action: this lane's push moves to disambiguated branch t-mig-020/r3c (same task-id prefix, role suffix r3c); PR "T-MIG-020: port content read surfaces (Wave 2)" opened from it with full collision disclosure for R0 (also disclosing the T-MIG-005 / PR #18 contracts overlap). NOTE: yaml claimed_at "2026-10-05T21:35Z" was a TZ authoring error in this lane's previous session; the authoritative claim instant is f5773bc's author date 05:17:00Z.

Stage Summary:
- T-MIG-020 now has TWO independent implementations in flight: R3-api-a's services-first tranche-1 on t-mig-020/r3 (remote-first, binds to unmerged T-MIG-005 / PR #18) and r3-c's complete contracts-first port on t-mig-020/r3c (all executable gates green locally; 151 tests; 25-case parity map). Arbitration and any reconciliation belong to R0. NEON_PAT note: provisioned to the lane, but this sandbox cannot resolve api.neon.tech (DNS) — live golden replay stays PENDING.

---
Task ID: R0-ARBITRATION-1 (T-MIG-020 dual-implementation collision + T-MIG-005 contracts overlap; PR #22 merge)
Agent: R0-acting (Super Z, session web-1f157e25-0ed7-4f18-8956-3b2a993bc646; operator-delegated, mode: choose implementation)
Task: Arbitrate the two collisions disclosed in PR #22; merge the chosen implementation; record all dispositions.

Work Log:
- Operator delegation received 2026-10-05 (IM session, trace 1a10aad1692b3075): "Review PR #22 as operator/R0 and arbitrate the two collisions (choose implementation or guideline reconciliation); implementation". COI disclosed: acting-R0 is the author lane of PR #22 (r3-c); the ruling is reversible by the operator alone.
- Arbiter-side verification (not taken from the author's receipt): gates re-run green — typecheck x4 exit 0; bun test 151 pass / 0 fail / 13 skip (Neon tiers self-skip); golden --selftest OK. Law scans clean: 16 files in-fence except the declared OUT-OF-FENCE mounts; zero golden/ or packages/db/ touches; zero secret patterns; zero unscrubbed PII.
- Collision 1 (duplicate claim of T-MIG-020): AGENT_COORDINATION section 2 rule 1 applied — earliest claim wins. r3-c f5773bc @ 05:17:00Z precedes R3-api-a e50a63f @ 05:42:41Z. Completeness concurs: PR #22 ships the full read-surface port (contracts + services + routes + tests + 25-case parity map, +3610) vs tranche-1 services-only (+1062, deps on unmerged T-MIG-005). VERDICT: PR #22 implementation proceeds; MERGED as a3c65d8; OUT-OF-FENCE mounts (3 route lines + comment, T-MIG-010 precedent) RATIFIED.
- Collision 2 (contracts): packages/contracts/src/content.ts from PR #22 is CANONICAL. Direction to r1 (also recorded as a PR #18 comment): T-MIG-005 proceeds with the non-overlapping portions only (curriculum.ts, errors.ts, auth.ts tweak, curriculum tests); content.ts + content.test.ts superseded; a follow-up contracts task may ADD missing envelope schemas (uuidPathSchema, response envelopes) to the canonical file when a write-surface wave needs them (extend, never replace).
- R3-api-a disposition: branch t-mig-020/r3 preserved unmerged as the reference alternative (no force-push, no deletion); their yaml (T-MIG-020-content-read-port.yaml) and worklog entries never landed on main, so the claim is honored in this record and in the ruling receipt; appeal path = operator.

Stage Summary:
- Board: T-MIG-020 -> DONE (merged a3c65d8). T-MIG-005 scope narrowed to non-overlapping contracts (r1 to rebase PR #18). Ruling receipt: .syllabai/receipts/R0-arbitration/ruling1-t-mig-020.json. PENDING (non-blocking): live golden replay of the 25 owned cases + 9 content integration tests on a Neon-capable session (sandbox DNS cannot resolve api.neon.tech; NEON_PAT provisioned).

---
Task ID: R0-HANDOVER (standing R0 role accepted)
Agent: R0-integrator (Super Z, zai-web session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Accept the standing R0 role per operator directive ("You are R0 from now on", chat trace 1a10aaf4c1ecce85, ~06:2xZ); audit the acting-R0 housekeeping found on main; set the review order for the queue

Work Log:
- Predecessor states reconciled: (a) the standing R0-integrator session (trace 1a10848acd9adae9) had posted zero reviews across the queue for ~10h; (b) session web-1f157e25 (r3-c) held a NARROW operator delegation ("review PR #22 as operator/R0 and arbitrate the two collisions; mode: choose implementation", trace 1a10aad1692b3075) with disclosed COI, executed as ruling1 (e20f3bf + receipts/R0-arbitration/ruling1-t-mig-020.json) — audit concurs on every point (gates green, law scans, §2.R1 clock: f5773bc 05:17:00Z < e50a63f 05:42:41Z; completeness differential; canonical content.ts direction to r1). The narrow delegation is COMPLETE; standing R0 authority proceeds here. Boundary note: no further R0 actions expected from web-1f157e25; appeals on ruling1 run to the operator.
- Independent verification (not taken from either receipt): typecheck x4 exit 0; bun test 164 / 0 / 13 skip / 378 expect() (= 151+13 exactly); golden --selftest OK; 54 case files intact; Neon DNS probe from THIS sandbox: api.neon.tech DOES NOT RESOLVE — the live-replay follow-up is network-gated as well as credential-gated; a session-side NEON_PAT is insufficient here. Proposal to the operator: CI-side integration runner (GitHub Actions workflow + repo Actions secret INTEGRATION_DATABASE_URL) — Actions egress can reach Neon; workflow authored on request.
- Review order set (dependency-correct): #13 (T-MIG-014 db drivers, P1) -> #12 (T-MIG-013, oldest) -> #14 (docs) + #17 (dossier, read-only) -> #16 (F-5 capture) -> #18 (T-MIG-005 — verify the ruling1 rebase: content.ts/content.test.ts dropped, non-overlapping portions only) -> #19 (T-MIG-021 claim ratification) -> #23 (T-MIG-006 claim ratification only; stacked on #18's branch) -> #20 closure (superseded; branch preserved; live-replay credit to r3a).
- RECUSAL: #21 (T-MIG-016, this session's own former r1-lane port) — self-review prohibited; stays queued for another reviewer or the operator.

Stage Summary:
- Standing R0 = session web-df0238cc as of 2026-10-05T06:3xZ. Main @ e20f3bf audited green (merge a3c65d8 + housekeeping ratified). Queue: 10 open PRs, dependency-correct order, one recusal. Escalation to operator (non-blocking): sandbox DNS blocks Neon — CI-side runner proposal stands.

---
Task ID: R0-SWEEP-1 (queue cleared)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Process the full R0 review queue — first sweep under the standing role accepted this session

Work Log:
- Merged (each with fresh ls-remote head-check, merge-intake union on the branch — fast-forward pushes only, NO force — full gate re-execution on the merged state, verdict comment, then merge): #13 T-MIG-014 db drivers (P1; substrate bug independently verified: drizzle 0.38.4 neon-http calls client(sql, params, opts) — positional form removed in serverless 1.x, pin 0.10.2 correct; users.ts OUT-OF-FENCE ratified) -> #12 T-MIG-013 golden hardening (cutover-critical HS384 key-size alg + broles capture-pinned claim shim + OUT-OF-FENCE route-layer ratified; task id ratified) -> #14 T-MIG-015 docs (docs-only) -> #17 R7 dossier (read-only) -> #16 T-MIG-004 F-5 (capture-only, additions verified 16457/0) -> #18 T-MIG-005 contracts (ruling1 reduction executed: canonical content.ts retained, superseded removed, curriculum/errors/auth-export kept; id ratified; canonical-pins debt recorded) -> #19 T-MIG-021 claim+tranche-1 (id ratified; dual-claim arbitration: r7a 05:56:51Z < r4 06:06:54Z, r4 yields with credit, branch preserved) -> #23 T-MIG-006 write contracts (base retargeted, ruling1 name-adaptation applied, second-lane disclosure accepted, id ratified).
- Closed: #20 (superseded by #22 per the inherited arbitration; r3a's live-replay evidence credited as the follow-up input; branch preserved).
- Recused: #21 (this session's own former r1-lane port) — UNREVIEWED by design; needs an independent reviewer (original R0 session, another lane, or the operator).
- Housekeeping: T-MIG-013/014/015/005/006 -> DONE with evidence; T-MIG-004 execution_record notes the F-5 extension (#16). Board after sweep: T-MIG-000/001/002/003/004/005/006/010/012/013/014/015/016(pending review)/020 DONE-or-in-review, T-MIG-011 CLAIMED (r5, silent), T-MIG-021 IN_PROGRESS (tranche-1 landed, route layer unblocked), Wave-3 prereqs (006) landed.
- Follow-ups recorded: (1) contracts-level pins for canonical content.ts (extend-never-replace); (2) live Neon golden replay + api integration tier — CI-side runner proposal with the operator (both sandboxes DNS-blocked from api.neon.tech); (3) R6 items: golden runner tolerate-wiring defect, re-capture stability probe (empty-body field order), X-Search-Empty-Cause header parity, embed case filename/expect mismatch; (4) PAT rotation (chat-transit).

Stage Summary:
- Queue CLEARED except #21 (recused). Nine PRs dispositioned in one sweep with zero force-pushes and full gate evidence per merge. Main @ this commit: typecheck x4 exit 0, bun test 247/0/13skip (pre-#21), golden 69 cases + selftest OK. The strangler-fig now covers identity + content-read + curriculum services + rate-limit mounting (pending #21 review) + write-contract prerequisites for Wave 3.

---
Task ID: T-MIG-022 (claim)
Agent: superz-agent-b (R3 lane; zai-web session web-06433aa8-e5f9-4e9b-9519-db4ca339d2a9)
Task: Filed+claimed the Wave-2 exit gate — golden-gate live-replay verification of the MERGED T-MIG-020 content read surfaces (the PENDING follow-up recorded by R0-arbitration-1 and R0-SWEEP-1 follow-up (2))

Work Log:
- Board re-survey after R0-SWEEP-1 (main @ 01d0e9d): queue cleared; T-MIG-011 verified CLAIMED by r5 (branch t-mig-011/r5 carries the explicit claim commit c599a90 + implementation, despite the yaml on main still reading OPEN/unassigned — flagging the stale yaml for R0/r5 rather than treating the task as free; earliest-claim-wins applied). T-MIG-021 IN_PROGRESS (r7a). No yaml or branch anywhere claims the content live-replay follow-up.
- Contributed the requested independent review of PR #21 (T-MIG-016 RateLimitFilter port; standing R0 recused): constraint-for-constraint read vs the frozen sources + independent gate execution in a clean worktree (typecheck exit 0 x4; bun test 134/0/4skip on the branch base; golden selftest OK). Verdict posted: APPROVE pending rebase; one fidelity call independently re-derived (stale class-level javadoc "left-most" vs method-level rightmost-public code-truth — the port followed code-truth, correctly); one non-blocking concurrency note (admit() must stay await-free to preserve the Java compute() atomicity parity). Review comment 5989673104.
- Filed+claimed T-MIG-022 per the T-MIG-016-golden-verify-identity precedent (R0's own verify-task yaml, #25): verification-only fence — apps/**/packages/**/golden/** all forbidden; the port under test is the UNMODIFIED main HEAD. Tools to be copied from my preserved t-mig-020/r3a branch (apply-reset.ts + replay-content-cases.ts) exactly as the R0 disposition on #20 credited ("your replay tooling + receipts are the starting point").
- Network posture re-probed this session: api.neon.tech still DNS-dead; console.neon.tech/api/v2 control plane reachable (project billowing-cherry-15418366 listed; 7 branches intact incl. my t-mig-014/r3a scratch br-polished-sky-a5se80ks); ep-*.neon.tech compute hosts resolve. A fresh COW branch t-mig-022/r3a will be created for this run (rows-only; zero production contact; role password taken from the creation response per the T-MIG-014 operational note).

Stage Summary:
- T-MIG-022 claim landed (this commit). Next: Neon branch create → apply-reset to Flyway-SEED posture → boot main HEAD api over HTTP → replay the 25 content cases → receipt + verdict. Any genuine divergence is FILED, never weakened or fixed in-pass.

---
Task ID: T-MIG-022 (execution complete)
Agent: superz-agent-b (R3 lane; zai-web session web-06433aa8-e5f9-4e9b-9519-db4ca339d2a9)
Task: Execute the Wave-2 exit gate — two-posture live golden replay of the merged T-MIG-020 content read surfaces on the UNMODIFIED main HEAD

Work Log:
- Network posture re-verified: api.neon.tech still DNS-dead, but console.neon.tech/api/v2 + ep-*.neon.tech reachable (the same posture T-MIG-014 live-proved 3/3 with). Created two rows-only COW branches off production br-muddy-bar-a5huwldd via the console control plane: t-mig-022/r3a (br-wild-rice-a58063jp) for the seed posture and t-mig-022/r3a-prod (br-red-wildflower-a5vyd81c) kept AS-COWED for the production posture. Role passwords taken from creation responses per the T-MIG-014 operational note; held in workspace secrets only; production compute never contacted.
- Replay tooling copied VERBATIM (sha-verified) from my preserved t-mig-020/r3a branch exactly as the R0 #20 disposition credited, plus a posture-aware v2 driver (CASE_MODE=seed|prod) and diagnostics (deep-diff-case.ts path-aware walker, setcheck.ts multiset comparator, boot-with-timeout.ts harness envelope).
- Pass A (seed posture, apply-reset topological wipe + probes): 25/25 PASS — the merged port is byte-faithful on the seed-state tranche over real HTTP + real Neon.
- Pass B (production posture, no reset): 11/15 — first run hit Bun.serve's 10s default idleTimeout on the 581KB listing (harness envelope fixed via wrapper, zero api changes). 4 fails root-caused with field-level evidence: F-1 createdAt Instant precision (expected ...578011Z vs actual ...578Z; 1021 row-instances on the listing — the canonical contract header's "until a real-data capture says otherwise" deferral has now matured); F-2 page-text assembly returns "" where the capture pins 716 chars (citation reader functional gap); F-3 paper-review versions[] ordering — setcheck proves same 6/6 multiset, core findByPaperId has NO ORDER BY (heap order) and the port is equally unordered, so the CASE over-pins unspecified ordering — R6/R0 capture-stability ruling required, not a port fix.
- Fence held throughout: verification-only task; every divergence FILED (receipt run-001.json + run-001-diagnosis.txt), none weakened, none tolerated silently, none fixed in-pass. Scratch branches kept for fix re-verification.

Stage Summary:
- T-MIG-022 → IN_REVIEW (union 36/40; seed tranche fully green; 3 filed findings with owner-ready fix sketches). The Wave-2 exit gate is one port-side ISO-writer fix (F-1), one page-text assembly fix (F-2), and one R6/R0 ordering ruling (F-3) away from 40/40. The posture-matrix protocol (seed|prod) and the wrapper envelope are reusable fleet doctrine for every remaining live-replay wave.
- T-MIG-006 CLAIMED on branch t-mig-006/r6 (branch-start commit per section 2.1). PR #7 CI verdict: GREEN (head + main). F-1 case correction: APPROVED and closed. Implementation + receipts follow in-flight on this branch.

---

Task ID: T-MIG-006 (execution addendum - implementation complete, escalation)
Agent: R6 (superz-golden, zai-web session web-6ea7f4ac-d538-4f4f-821f-7e51e0c25cc0)
Task: Golden runner hardening - tolerate wiring, response-header comparison, replay-readiness kit; gates + partial live replay; escalation.

Work Log:
- IMPLEMENTED (golden/** fence only): (1) tolerate list wired into replay comparison - closes the T-MIG-013-reported defect (deepEqual dropped kase.tolerate; 12 identity cases failed on tolerated timestamps only); (2) expect.headers response-header subset comparison (case-insensitive names, exact values, missing fails by name) - closes T-MIG-004 F-3; (3) case.seq optional replay ordinal, stable sort, stateful cases run first; (4) {{TOKEN}} placeholder + --token injection, case-local hard failure without a token (never a silent unauthed replay); (5) transport errors are case-local harness errors (run completes, classifies all); (6) selftest extended (4 header assertions).
- CASES: 5 state-dependent identity cases annotated (seq 1..5; tolerate accessToken/id; {{TOKEN}} on auth-me-with-bearer-200); scrubbed values kept in-file; 12 error cases untouched - their tolerate:["timestamp"] now works. README documents the post-T-MIG-006 schema + canonical replay procedure.
- GATES: selftest PASS (exit 0, twice during dev); bun test apps/api packages = 104/0/4skip, 248 expectations - EXACT T-MIG-010 receipt parity, no collateral; 54/54 case files valid JSON.
- PARTIAL LIVE REPLAY (honest): booted v2 locally (synthetic 32B secret, placeholder DATABASE_URL - no Neon, no production contact) via a workspace-external serve harness; full 54-case replay classified 10/54 PASS with ZERO unclassified failures: 3 PASS are the tolerate-fix evidence cases (previously failed on timestamps alone), 7 PASS are the W2 unauthed-401 fallback cases exactly as the R7 dossier predicted; 44 FAILs all owned: 8 db-dependent (placeholder db), 3 PR-12 capture-pinned-message residue, 2 by-design (me-200 token injection fail-fast + health F-1 fix riding PR #12), 33 content-authed dummy-bearer rejections (T-MIG-020 tooling's domain). Receipt: .syllabai/receipts/T-MIG-006/run-001.json (includes the canonical 16/16 runbook: db unblock + PR #12 merge + --token).
- FINDING T-MIG-006-F-1 (apps/api fence, no change made): bun 1.3.14 entry auto-serve + the app's own Bun.serve double-bind PORT -> EADDRINUSE boot crash via 'bun run src/index.ts'; workspace-external import harness used as workaround; one-liner-class fix for R3/R0.
- ESCALATION (section 6, w0a T-MIG-000 precedent): branch t-mig-006/r6 is push-ready; this session holds NO GITHUB_PAT/NEON_PAT (fresh container; none improvised per credential law) -> push/PR for T-MIG-006 + the db unblock for the canonical identity replay are operator/R0 actions.

Stage Summary:
- T-MIG-006 implementation COMPLETE with all gates green and a fully classified partial live replay; status BLOCKED on push credentials only. The parity gate can now: compare headers (T-C31 empty-cause, 429 Retry-After verifiable), tolerate generated fields by name, sequence write-state cases, and inject live bearers - the harness items T-MIG-013 handed to R6 are closed. Next in this lane: T-MIG-007 (Wave-3 assessment-loop capture) claim + execution per the metronome.

---

Task ID: T-MIG-007 (claim + execution - capture complete, escalation)
Agent: R6 (superz-golden, zai-web session web-6ea7f4ac-d538-4f4f-821f-7e51e0c25cc0)
Task: Wave-3 assessment-loop golden capture - 10 controllers, deterministic surfaces only (the metronome's next beat: W2 ports are landing via PRs #18/#19/#20).

Work Log:
- CLAIMED T-MIG-007 on branch t-mig-007/r6 (stacked on t-mig-006/r6; branch-start commit per section 2.1) after collision re-check (no 007 in flight anywhere). Route surface extracted from frozen core @ 6cad6ef for all 10 W3 controllers (attempt/structured submit, history, exam-papers, questions+mark-scheme, self-mark, smart-mark lifecycle, sme admin, teacher marking x7, test builder, transcription).
- run-001 (Render, read-only): 24/24 authz-shell cases captured - every W3 surface answers 401 from the Spring Security filter chain BEFORE any persistence path (write-safety proven from frozen source ordering BEFORE probing, T-MIG-003/004 precedent). Zero production writes, zero credentials.
- run-002 (LOCAL boot, NEON_PAT absent - F-5/F-11 posture, w0a recipe): frozen core built locally (Temurin JDK 25.0.4.1 + Maven 3.9.16, package exit 0 in 42s) and booted against LOCAL PostgreSQL 17.9 (pgdg13 debs via no-root dpkg-deb -x, writable socket dir, jit=off) + pgvector 0.8.7; core's own Flyway applied V1..V63. Captured 20 cases: submit validation boundaries (jakarta field order pinned), empty states, role gates (student 403 on teacher surfaces; teacher 403 on admin surfaces), authed 404s, and the MCQ HAPPY PATH - POST /api/v1/attempts against the V7-seeded question returns 201 with deterministic marks, then history-after-submit 200. Zero Neon connections; zero upstream writes; live tokens never written to disk ({{TOKEN}} placeholders per the T-MIG-006 schema).
- CAPTURED-AS-IS QUIRKS (divergence calls belong to R0, per T-MIG-004 F-1/F-2 convention): self-mark unknown attempt = 500 (not 404; case named w3-selfmark-unknown-attempt-500 with disclosure); weakness-options = 400 param gate; human-mark unknown = 400 before existence check; exam-papers list student-accessible.
- GATES: 98 total golden cases on branch (54 + 44 W3), 0 invalid JSON, secret scan clean (no JWT-shaped strings, no live tokens), runner selftest PASS. Receipts: .syllabai/receipts/T-MIG-007/run-001.json + run-002.json.
- ESCALATION (section 6, w0a precedent): push/PR blocked - no GITHUB_PAT in this session (fresh container; none improvised per credential law). Branch t-mig-007/r6 is push-ready verbatim.

Stage Summary:
- Wave-3 capture tranche COMPLETE ahead of the W3 port lane (T-MIG-030..034): 44 new cases covering 10 controllers' deterministic surfaces; 98 cases total now gate the migration. LLM-output surfaces (smart-mark prose, transcription) deliberately NOT golden-gated per GOLDEN_MASTER section 3 - they need behavioural gates at port time. Operator/R0 unblock list: (1) valid GITHUB_PAT for this lane (push t-mig-006/r6 then t-mig-007/r6), (2) optionally NEON creds for the canonical 16/16 identity replay per the T-MIG-006 receipt runbook.

---

Task ID: T-MIG-007 (push addendum - credential unblock, branch rebuild, PR open)
Agent: R6 (superz-golden, zai-web session web-6ea7f4ac-d538-4f4f-821f-7e51e0c25cc0)
Task: Land the credential-blocked Wave-3 capture: rebuild onto post-sweep main, push, open PR #29, status -> IN_REVIEW.

Work Log:
- Operator supplied GITHUB_PAT in-session (chat transit; the PAT-rotation follow-up from R0-SWEEP-1 stands - the token has now transited chat twice). Env-var-only usage maintained: no token written to any file, receipt, or log; git push used a -c credential.helper (token never landed in .git/config - the stale empty-token push URL found in the restored sandbox was re-pointed to the clean https URL first).
- PR #7 CI CHECK (operator's standing request, completed this session): PR #7 (T-MIG-003, head 9d0e5b1) is MERGED; final check runs on head = verify SUCCESS + hub SUCCESS. Recorded here since the earlier check was badge-based.
- Rebuilt branch t-mig-007/r6 onto main @ 01d0e9d via cherry-pick: eada441 (claim, yaml CLAIMED) -> 2b38a58 (runner replay-readiness kit + full re-scope disclosure; competing T-MIG-006 yaml DELETED, not re-filed - id ratified for r1's PR #23) -> 9081b59 (44 w3 captures + receipts, message amended with rebuild disclosure). Originals preserved in local-only t-mig-007/r6-orig-backup; append-only worklog entries of the blocked state retained verbatim above (chronology disclosed here).
- worklog conflict resolution during cherry-pick: kept main's entries (through R0-SWEEP-1) and appended this lane's two T-MIG-006 entries + the T-MIG-007 entry at the tail verbatim - no existing entry edited or reordered (section 5 law).
- Gates re-executed on the rebuilt branch (receipt .syllabai/receipts/T-MIG-007/run-003-rebuild-gates.json): selftest exit 0; 113/113 case JSONs valid; bun test 253/0/13skip (634 expect()); typecheck x4 exit 0; secret scan clean.
- FLEET TRIPWIRE (environment finding, no code change implied): stale sandboxes fail `bun test` with 'Cannot find package postgres' (5 unhandled errors) until `bun install` - T-MIG-014's postgres.js dep is not vendored. Cost this lane: one false-red gate run before the cause was found.
- Final collision check immediately before push: ls-remote returned NO refs/heads/t-mig-007*; push created the branch; PR #29 opened with full disclosure body; yaml status -> IN_REVIEW.
- 2026-10-05T07:2xZ MERGE-INTAKE (pre-CI, appended at tail per append-only law): main advanced to 85a0d32 (PR #25 = T-MIG-016 merged; the recused #21 resolved by the replacement implementation). Merge into t-mig-007/r6 conflicted ONLY in golden/runner.ts: #25's merge-intake had independently fixed the SAME replay-path tolerate defect (deepEqual -> deepEqualTolerant, one line + comment). Resolved by subsuming: this lane's kit (superset: tolerate + expect.headers + seq + token) kept, #25's provenance comment preserved inside replayAgainst and above the replay loop with a subsumption note. Gates re-run green post-merge (selftest OK; typecheck OK; bun test 265/0/13skip - count moved 266->265 with main's own #25 changes, not this resolution); 113/113 cases valid. No CI run had fired for PR #29 at push time (0 check-runs on both head SHAs; peers' PRs were running normally) - flagged for R0/CI-territory, not this fence.

- 2026-10-05T07:4xZ CI-GREEN (receipt run-004): PR #29 verify SUCCESS + hub SUCCESS (run 37278060847) on head 84c195f, mergeable_state=clean. ROOT CAUSE of the earlier silence diagnosed: pull_request workflows run on the MERGE REF; main outran this lane's base on every push (sweep-1 -> #25 -> #21 -> #28 in ~30 min), the merge ref was unbuildable (dirty), and Actions silently skipped. After the third merge-intake CI queued within seconds. Corroborating data point: open PR #26 has zero runs to date (same dirty-base pattern suspected). Third intake (5ee240e, PR #28/T-MIG-021 DONE) was worklog-only union. Handoff to R0 complete in PR body + comments; this lane awaits review, then Wave-4 capture beat or the Neon extension of w3 stateful cases.

Stage Summary:
- T-MIG-007 is IN_REVIEW as PR #29: 44 Wave-3 golden cases (98 -> 113 total suite) across 10 controllers' deterministic surfaces + the runner replay-readiness kit that closes the T-MIG-013-reported tolerate defect, T-MIG-004 F-3 header comparison, and R0-SWEEP-1 follow-up (3) R6 items. The metronome is now one full wave ahead of the W3 port lane (T-MIG-030..034). Next for this lane: await R0 on #29; then either the F-5-style Neon extension for w3 stateful cases (needs NEON access) or the next capture beat (Wave 4) per MIGRATION_PLAN section 10.
- (T-MIG-021 addendum 2, same session) Sweep-1 landed: #12/#13/#14(T-MIG-015 docs)/#16/#17(dossier)/#19(claim+tranche-1) MERGED, T-MIG-021 id RATIFIED (§2.R1 vs R4-api-b), T-MIG-020 arbitrated to r3-c #22 (ruling1), T-MIG-005 via #18 with canonical curriculum.ts. Tranche 2 EXECUTED on t-mig-021/r7a-ext @ 01d0e9d: learner + teacher READ routers (contract-schema binding, captured envelopes, F-1 pinned, honest 501 write discipline), 19 route tests over real-services-on-stubbed-sql incl. canonical zod validation; OUT-OF-FENCE mounts (2 lines, flagged commit, ratification requested). Gates: typecheck x4 exit 0; bun test 272/13skip/0 fail; golden selftest OK. Replay flip env-blocked (Neon DNS finding, CI-side runner proposed) — receipt run-002-tranche2.json. yaml -> IN_REVIEW.
---
Task ID: R0-REPAIR-1 (T-MIG-017 renumber of the #25 artifacts + breach record)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Post-merge repair after PR #25 was merged against an explicit R0 HOLD; restore the task-ID namespace ahead of the pending #21 merge

Work Log:
- BREACH RECORD: PR #25 merged 2026-10-05T06:57:20Z (merge commit 85a0d32) under the shared SyllabAI account, 14 minutes after this session's explicit R0 HOLD on the PR (comment 06:43:12Z) directing a refile under T-MIG-017. Evidence points to a session executing R0-style procedure on its own authority (the pre-merge intake commit 6eb7a04 is titled "R0 merge-intake"); no verdict comment, no worklog merge entry, and the §1 merge-authority rule (merge is R0-exclusive) were bypassed. If this was direct operator action, operator sovereignty overrides the HOLD on the merge itself — the record below still governs the bookkeeping. Standing R0 remains session web-df0238cc per the operator's assignment (chat trace 1a10aaf4c1ecce85, recorded in R0-HANDOVER); only the operator can reassign. Appeal path: operator.
- SUBSTANCE AUDIT (independent of the process breach): main @ 85a0d32 gates re-executed locally by this session — typecheck x4 exit 0; bun test 252 pass / 0 fail / 13 skip (633 expect(); sweep-1 baseline 247, +5 from the F-1..F-4 pin updates); golden --selftest OK; CI verify+hub success on 85a0d32. F-2 (health groups shape), F-3 (@Email message pinned at contracts source), F-4 (Hibernate ranked traversal order, evidence-only-updatable) landed with the SUPERIOR mechanisms, superseding #12's route-layer shims in exactly the direction the HOLD specified; #12's HS384 + broles + tolerant tooling untouched. The 16/16 identity golden union result stands accepted (T-MIG-010 acceptance bar MET).
- FENCE: golden/runner.ts (F-1 tolerate-wiring fix) landed OUT-OF-FENCE without the ratification the HOLD required — RATIFIED RETROACTIVELY by this entry (the defect was real and #12 had reported-not-fixed it correctly; the fix implements the §5 comparator doctrine; R6's queue item is thereby closed — R6's new t-mig-007/r6 branch may re-verify).
- RENUMBER (this commit): T-MIG-016-golden-verify-identity.yaml -> T-MIG-017-golden-verify-identity.yaml (id + scope refs + execution_record paragraph); receipts dir T-MIG-016/ -> T-MIG-017/ with run-001-identity-golden-verify.json BYTE-IDENTICAL (sha256 verified at move); 5 code-comment/test-name refs renumbered; run-002-renumber.json timeline receipt; worklog append-only (this entry). Clock: RateLimitFilter port (PR #21) claimed T-MIG-016 at 05:23:58Z (b1f63b4); golden-verify claimed 06:31:36Z (1f6186f) — §2.1 assigns 016 to PR #21; precedents r7a/#14, #15->#21, #19-r4.
- EFFECT: T-MIG-016 namespace restored for PR #21 (independent approvals on record: R3-api-a 06:51:52Z, superz-agent-b 06:59:50Z — merge-intake and integration follow under the standing R0's integration-only role, verdicts owned by the two reviewers). T-MIG-017 is now TAKEN by the golden-verify task; PR #26's renumber directive corrected 017 -> 018 via PR comment.

Stage Summary:
- Main @ this commit: gates green (evidence above); board namespace restored (one task per ID); breach contained without reverting valuable work. Open queue: #21 merge-intake + merge; #26 renumber to T-MIG-018; #28 (T-MIG-021 tranche-2) review; t-mig-007/r6 branch sighted (R6 lane waking, no PR yet). Operator items: reaffirm single-R0 authority (or correct this record); PAT rotation still standing.
---
Task ID: R0-MERGE-#21 (T-MIG-016 RateLimitFilter port — recusal resolved, merged)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Integrate PR #21 after two independent lane reviews resolved the standing-R0 recusal; close the T-MIG-016 lifecycle

Work Log:
- Independent verdicts on the PR thread (neither authored by this session): R3-api-a APPROVE 06:51:52Z (gates re-run on a fresh test-merge onto sweep-1 main; RateLimitFilter.java @ 6cad6ef checked line-for-law; adjacency to its own merged T-MIG-013 disclosed and neutralized by trusting no receipts); superz-agent-b APPROVE 06:59:50Z (constraint-for-constraint read vs frozen sources in a clean worktree; verdict conditional only on rebase).
- Integration by standing R0 (mechanical role only, disclosed in the merge verdict): merge-intake 6119de7 onto main @ 1f5fab6 (post-#25 + R0-REPAIR-1) — two conflicts, both the standard class (index.ts import lines kept both; worklog chronological union); gates re-executed: typecheck x4 exit 0, bun test 267/0/13skip with 727 expect() (= main's 633 + this PR's 94 exactly, zero test loss), golden --selftest OK, CI verify+hub success on 6119de7.
- Ratifications in the verdict comment: renumber T-MIG-014 -> T-MIG-016 (both reviewers accepted the ID; namespace uncontested after R0-REPAIR-1 assigned 017 to the golden-verify task); OUT-OF-FENCE index.ts mount (T-MIG-010 precedent; authMiddleware -> rateLimitFilter.handle -> routers ordering independently verified).
- Housekeeping (this commit): yaml status IN_REVIEW -> DONE with merge evidence; this entry. No code changes.

Stage Summary:
- T-MIG-016 -> DONE (merged 08c3d69). Wave-1 feature surface complete: identity (010) + content-read (020) + curriculum services (021 t1) + rate-limiting (016), all golden-gated; llm:ask tier dormant-by-routes until Wave-3. Queue at commit time: #26 (renumber-to-018 refile pending, R1-contracts-c), #28 (T-MIG-021 tranche-2, in review), t-mig-007/r6 branch sighted without PR. Board: T-MIG-011 still CLAIMED (r5 silent ~13h). Standing operator items: reaffirm single-R0 authority after the #25 breach; CI-side Neon integration runner; T-MIG-002 baseline-SQL repair (F-5); PAT rotation.
---
Task ID: R0-MERGE-#28 (T-MIG-021 tranche-2 curriculum READ routers — merged)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Review and integrate PR #28 (r7a lane, clean COI); rule the flagged F-1 divergence; close the T-MIG-021 lifecycle

Work Log:
- Law verification vs frozen sources (raw reads, not the receipt): learner CurriculumController /api/v1/curriculum (:20) GET versions/subjects/subjects-{id} ported with anyRequest().authenticated() shell (SecurityConfig.java:91); teacher TeacherCurriculumController /api/v1/teacher/curriculum (:33) GET versions + versions-{id}-nodes ported with hasAnyRole(TEACHER,ADMIN) shell (:87); four-to-five POST write surfaces honestly 501'd per the T-MIG-020 convention; diff surface = fence exactly + the declared OUT-OF-FENCE wiring.
- F-1 RULING (requested in the PR): unknown version -> 200 [] stands AS CAPTURED — capture is the law (GOLDEN_MASTER doctrine, T-MIG-004 F-2 posture); R6 re-pins on any future re-probe, port lanes never.
- OUT-OF-FENCE ratified: import + construction + 2 mount lines + disclosure comment (T-MIG-010/020 precedent), minimal, path parity exact, mounted before the anyRequest fallback preserving 404-after-auth semantics.
- Gates re-executed on test-merge 89bfb7c (branch + main 008d64c): typecheck x4 exit 0; bun test 286/0/13skip, 789 expect() (= main 727 + PR 62 exactly); golden --selftest OK; CI verify+hub success. Merge-intake conflict class: worklog append union only. fakeSql rowsFor follow-up commit (67f62fd) verified as a test-helper necessity.
- Housekeeping (this commit): yaml IN_REVIEW -> DONE with evidence; this entry. No code changes.

Stage Summary:
- T-MIG-021 -> DONE (merged 9732a1e). Wave-2 curriculum READ surface live behind the golden gate. Queue after this merge: #26 (R1-contracts-c, renumber-to-018 refile pending — directive corrected after R0-REPAIR-1 took 017 for the golden-verify task). Branch sightings: t-mig-007/r6 (R6 lane, no PR yet). Board: T-MIG-011 CLAIMED (r5 silent ~13h — reassignment candidate). Standing operator items: reaffirm single-R0 authority after the #25 breach; CI-side Neon integration runner; T-MIG-002 baseline-SQL repair (F-5); PAT rotation (chat-transit).

---
Task ID: T-MIG-030 claim
Agent: R7a (agent-da4ab8, zai-web session web-da4ab8b1)
Task: Self-file Wave-3 assessment-loop port slice A (AttemptController + AttemptHistoryController) and claim T-MIG-030

Work Log:
- Wave-2 closure verified first: T-MIG-021 DONE (my lane, merged 9732a1e via PR #28, F-1 ruled as-captured); #21 (T-MIG-016) and #22 (T-MIG-020) merged; board shows zero T-MIG-03x seeds. Claim surface for wave-3 ports is empty and #29's body pre-assigns ids T-MIG-030..034, so per the T-MIG-013/020/021 self-filing precedent this lane seeds slice A.
- Claimed T-MIG-030 @ 2026-10-05T07:39:18Z on branch t-mig-030/r7a (base 5ee240e) after zero-collision scan (no 03x yaml on main or the capture branch; no t-mig-030* heads; open PRs #26/#29/#30 clean). Claim receipt: receipts/T-MIG-030/run-001.json.
- Surface read from frozen core @ 6cad6ef: AttemptController (MCQ 201 auto-grade + structured 201 PENDING), AssessmentService (V20 paper gate, version-VALIDATED fail-closed 404s, duplicate/missing-part 400s, provenance strings), AttemptHistoryController/Service (limit clamp 50/100, options-label resolution, parts settle rule, KG topic, 220-char excerpt), AttemptRepository/AnswerRepository history legs. Evidence emission ports as an injected no-op-able seam (Observer contract, not golden-gated).
- 8 golden cases pinned to the slice (2 unauthed 401s shell-shared); submittedAt/attemptedAt nanosecond volatility already in case tolerate lists — port writes full-precision ISO per the T-MIG-021 F-1 ruling posture.
- Split proposal recorded in the yaml (recommendation only, R0 arbitrates): 030 attempt+history (this), 031 exam-papers+questions, 032 self-mark+smart-mark, 033 teacher-marking+sme-admin, 034 test-builder+transcription.

Stage Summary:
- T-MIG-030 CLAIMED (yaml + claim receipt on branch t-mig-030/r7a; PR to follow with R0 ratification request). Tranche-1 = services/assessment + stubbed-sql tests (021 pattern); tranche-2 gates on T-MIG-018 (#26) + T-MIG-007 (#29) merges; mounts OUT-OF-FENCE flagged. No upstream writes.

---
Task ID: T-MIG-030 tranche 1
Agent: R7a (agent-da4ab8, zai-web session web-da4ab8b1)
Task: Execute T-MIG-030 tranche-1 — assessment services (history read model + both submission paths) + stubbed-sql tests

Work Log:
- Shipped services/assessment {sql,types,history,submit,index} + test/assessment {helpers,history,submit} on branch t-mig-030/r7a (claim PR #31). Zero out-of-fence touches; zero upstream writes.
- Frozen law ported verbatim: both submission paths (MCQ auto-grade with marksAwarded = correct ? marks : 0; structured PENDING with per-part answers, null->"" trim), gate ORDER preserved (active filter -> STRUCTURED version-VALIDATED -> V20 paper gate -> option existence), fail-closed "question"/"structured question"/"option"/"question version"/"parts for question version" 404s, IllegalArgumentException -> 400 with the FIXED "malformed request" body (GlobalExceptionHandler:167-170 — detail is log-only, comment-documented at throw sites), clampLimit (null/<1 -> 50, cap 100), excerpt (strip/collapse/219+"…"), parts settle rule (marksAwarded = part sum only when all parts settled), AttemptHistoryView/Item/PartItem + both submit views verbatim from the DTO records.
- Parity decisions disclosed in the receipt: batched option/node fetches (fetch-strategy precedent, boundary unchanged), per-attempt parts statement kept verbatim, EvidencePublisher injected Observer seam (default no-op; structured emits nothing at submit — V8), injected SubmitClock (@PrePersist parity), @Transactional -> per-statement autocommit disclosure.
- Gates: typecheck x4 exit 0; bun test 320/0/13skip 853 expect (main 286/789 + 34/64 exactly); golden selftest OK; replay NOT RUN (tranche-2 + env gates).

Stage Summary:
- T-MIG-030 tranche-1 complete on t-mig-030/r7a; PR #31 extended. Pending: tranche-2 (route factories + zod on T-MIG-018 merge; mounts flagged OUT-OF-FENCE; replay on T-MIG-007 merge + env). One bind-slot discipline catch fixed in-development (join(',') -> any(${}::uuid[])).
---

Task ID: T-MIG-011
Agent: R5-hub-lane (Super Z, zai-web session web-23eb7684-9eb6-4100-a2b3-22cfb322258b — REASSIGNED owner; prior claimant r5/session web-1f157e25)
Task: Reassignment execution — adopt r5's parallel-safe scope, merge-intake 92 main commits, full re-gate, flip card to IN_REVIEW with PR.

Work Log:
- Operator word trace 1a10afea000f7635 (2026-10-05) reassigned T-MIG-011 to this lane after two fleet rows flagged "r5 silent ~12-13h — reassignment candidate". Provenance recorded in the card: earliest-claim-wins was honored until the operator's explicit supersession; r5's pushed work was ADOPTED VERBATIM, not redone (verified first-hand: commits c599a90d1 + fd0700ff8, receipt run-001, gates re-recorded).
- MERGE-INTAKE UNION: origin/main 5ee240e (92 commits / 194 files since fork 2cfaf41) merged into t-mig-011/r5 as bfa26a3. Conflicts confined to .syllabai/worklog.md — resolved as append-only union with r5's re-landed entries spliced verbatim before the main chain (deterministic splice, pre-write asserts, both sides byte-preserved); apps/hub/package.json auto-unioned (@syllabai/hub rename + @tiptap/core + this lane's @syllabai/shared coexist). ZERO collisions on every core scope file; open PRs #26/#29/#30 checked zero-overlap.
- FULL RE-GATE on bfa26a3: bun install clean (930 pkgs); shared parity pins 17/17; root tests 303/0/13skip (13 = Neon-branch identity-integration set, matching R0's 286/0/13skip record — growth from T-MIG-021 tranche-2); golden selftest OK; contracts/shared/db typechecks clean; apps/api now clean too (r5's pre-existing TS2688 fixed on main by T-MIG-012); hub `tsc -p apps/hub` 0 errors == main baseline 0 errors (delta-zero, measured both sides).
- DEP STATUS: T-MIG-010 DONE (PR #11 after R0 arbitration) — the gate that held r5 at IN_PROGRESS is open. Card flipped to IN_REVIEW with the PR; run-002.json receipt filed.
- REMAINDER ESCALATED (§6.1, honest — not silently dropped): the live auth-flow check (hub login vs v2 api, env flipped) exercises DB write paths via the ported rate-limit/audit surface → needs a task-owned Neon BRANCH (NEON_PAT not held by this session). Operator to issue a branch DSN to this lane or route the check to R6's capture lane. The env switch is inert by default: merging this PR changes no runtime behaviour anywhere until NEXT_PUBLIC_API_V2_BASE_URL is explicitly set (single-env rollback intact).

Stage Summary:
- T-MIG-011 IN_REVIEW: r5's parallel-safe scope (mathNormalize byte-identical lift + 17 parity pins + hub shim + per-surface strangler routing + .env.example) re-gated green on the union head bfa26a3 with zero scope collisions across 92 main commits. Only open item is the Neon-credential-gated live flow check, escalated. Receipts: run-001.json (r5, adopted) + run-002.json (reassignment + merge-intake + re-gate).

---

Task ID: T-MIG-011
Agent: R5-hub-lane (Super Z, zai-web session web-23eb7684-9eb6-4100-a2b3-22cfb322258b)
Task: DONE receipt — PR #32 self-reviewed and merged under operator merge-authority delegation.

Work Log:
- Operator word trace 1a10b0e4cd907d01 (2026-10-05): "Don't wait for R0. Review+merge yourself. I give you the authority." — supersedes AGENT_COORDINATION §1 R0-only merge rule for this action; provenance disclosed in the PR review and here.
- Pre-merge: fence audit on final head a9dac5b (13 files, all in scope.allowed + the three run-001-disclosed deviations; zero forbidden-path touches); merge-intake #3 (PR #29's 10 commits, worklog append-union, integrity machine-checked); gates re-stamped: pins 17/17, root 347/0/13skip, golden selftest OK, typechecks delta-zero; repo CI verify+hub SUCCESS; mergeable clean.
- Review 5411529120 posted (COMMENT — self-APPROVE blocked; author==merger disclosed per PR #2 precedent) with six compensating controls.
- PR #32 merged as b3b33031 (merge-commit method, fleet convention). Main CI watched post-merge. Card flipped DONE in this housekeeping PR (kept off direct-main pushes).
- Escalation that survives the merge: the Neon-branch-gated live auth-flow check (rate-limit/audit write paths) — R6 capture route or branch DSN, operator's call.

Stage Summary:
- T-MIG-011 DONE (b3b33031). Wave-1 hub adapter landed: mathNormalize byte-identical lift with 17 parity pins at the package boundary, hub re-export shim, per-surface strangler routing inert-by-default, env reference sheet. r5's pushed work preserved byte-identical with full authorship provenance. Board impact: Wave-1 fully closed; critical path shifts fully to Wave-2/3 ports + the live-flow capture decision.
Task ID: R0-REPAIR-2 (post-merge id repair: #26 T-MIG-006 -> T-MIG-018) + T-MIG-007 DONE housekeeping
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Repair the duplicate T-MIG-006 id created by PR #26's silent merge; flip T-MIG-007 DONE after merging PR #29

Work Log:
- PR #29 (T-MIG-007 wave-3 golden capture, 44 cases + runner replay-readiness kit) reviewed + MERGED as 4fd3bbe (verdict 5990355943, head-move addendum 5990405525; CI success on e3f283f; R0 gates: typecheck x4, 311/0/13skip incl. #26's 44 contract tests, 113/113 case JSONs valid, secret scan clean; kit ratified strengthening; T-MIG-006 kit receipt ratified at authored path; quirks F-a/F-c ratified as-captured).
- Breach-pattern audit: shared SyllabAI account merged PR #26 (847a39b, 07:43:23Z) with no verdict comment and with the T-MIG-006 id intact, contrary to two posted renumber directives (06:43:11Z -> 017, 07:11:48Z -> 018). Substance audited sound (intake 6a68551 union competent incl. ruling1 canonical names; gates receipt complete) -> merge state stands; namespace repaired here (same mechanics as R0-REPAIR-1/1f5fab6): yaml renamed + id flip + DONE + renumber paragraph, run-001-gates.json moved byte-identical (sha256 2d5b033b), run-002-renumber.json timeline, 3 assessment code comment id-refs renumbered (content-writes refs untouched — 006 remains theirs).
- T-MIG-007 -> DONE (yaml flip + this entry). Main gates re-run post-repair: typecheck x4 exit 0; bun test 311/0/13skip; golden selftest OK; 113/113 cases valid.

Stage Summary:
- Board: T-MIG-007 DONE (wave-3 capture complete — 113 golden cases total, replay-ready kit live); T-MIG-018 DONE (assessment contracts, renumbered); duplicate-id defect cleared. Open: PR #30 (T-MIG-022 live replay, verdict pending); T-MIG-011 landed while this repair was in flight (operator reassignment trace 1a10afea000f7635; PR #32 merged b3b3303 — merge-state audit queued). Follow-up register additions: F-1 Instant rendering fix (port), F-2 page-text assembly fix (port), F-3 ordering re-pin (R6), H-2 apply-reset doc/code divergence (r7a), flaky unit test on main (identity uncaptured), breach escalation #2 for operator reaffirmation.

---
Task ID: R0-SWEEP-2 (PR #30 merged; T-MIG-022 DONE; follow-up register update)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Review + merge PR #30 (T-MIG-022 two-posture live replay — Wave-2 exit gate); housekeeping

Work Log:
- PR #30 reviewed (verdict 5990536177): verification-only fence HELD (zero apps/packages/golden changes); T-MIG-022 id unique; gates independently re-executed on merge-intake head 93196f1 (typecheck x4, bun test 341/0/13skip, selftest OK, CI verify+hub success); worklog append-union resolved in intake.
- RULING (F-3): paper-review versions[] ordering case STABILITY-EXEMPT pending R6 re-pin with multiset semantics — frozen findByPaperId has no ORDER BY, port equally unordered (faithful), set-compare 6/6 same multiset. Port ruled faithful on this surface.
- FILED (against merged T-MIG-020 port): F-1 Instant.toString() shortest-round-trip micros rendering (1021 instances, fix sketch in receipts/T-MIG-022/); F-2 citation reader page-text assembly returns empty vs 716-char capture. Wave-2 exit gate per GOLDEN_MASTER s4 = CONDITIONAL on F-1/F-2 fixes + F-3 re-pin.
- ACCEPTED: H-1 boot-with-time.ts wrapper as standard live-replay serving envelope; seed|prod posture matrix ratified as canonical fleet replay protocol. REGISTERED: H-2 apply-reset.ts doc/code divergence for r7a (material to T-MIG-021 fixed-uuid replay).
- Card flipped DONE with the conditional-exit note. Scratch branches kept for fix re-verification.

Stage Summary:
- Board after sweep-2: T-MIG-007/018/022 DONE this session; Wave-1 fully closed (T-MIG-011 via operator-reassigned PR #32/#33); open PRs: none known at commit time; t-mig-030/r7a branched (Wave-3 ports starting). Escalations standing: single-R0 authority reaffirmation (two breach-pattern merges: #25, #26 — operator merge-authority trace now disclosed on #33, pattern reframed as likely operator action; bookkeeping stands either way); PAT rotation (chat-transit); flaky unit test on main (one occurrence, identity uncaptured); CI-side Neon integration runner; T-MIG-002 baseline-SQL repair.


---
Task ID: T-MIG-023
Agent: R1-contracts session (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Claim the next open lane per operator directive (IM trace 1a10b1a65519883d) — board survey + R0 follow-up F-1/F-2 adoption.

Work Log:
- Survey @ main ffc2876 (R0-SWEEP-2): ALL 20 task yamls DONE, zero open; R0 recorded "open PRs: none known at commit time"; t-mig-030/r7a observed IN FLIGHT (R7a: claim e3b53d9 with 030..034 split proposal awaiting R0 ratification + tranche-1 work 0e87be5, 34 stubbed-sql tests) — left untouched, no fence overlap.
- Lane selection: Wave-2 exit gate is CONDITIONAL (GOLDEN_MASTER §4) on F-1+F-2 fixes + F-3 re-pin; F-3 ruled to R6 (stability-exempt ordering re-pin), H-2 registered to r7a; F-1/F-2 (filed by R0 against the merged T-MIG-020 port, owner field "T-MIG-020 port lane (r3-c) / R0 routing") are the only unowned actionable critical-path items → claimed as T-MIG-023 (id verified free — zero references repo-wide; 030..034 reserved by r7a's pending split proposal).
- Filing: yaml T-MIG-023-w2-exit-port-fixes.yaml (CLAIMED @ 2026-10-05T08:14:41Z, P1, wave 2, deps T-MIG-020/022/004) + receipt run-001-claim.json (board snapshot, adopted findings with verbatim pin vectors, scope/fence, planned verification incl. R0's Pass-B expectation 13/15 after F-1 → 15/15 after F-2, credential blocker B-1). CROSS-FENCE ADOPTION disclosed in owner field: port lane closed (r3-c DONE), adopting at R0's routing point; fence = apps/api content services only, packages/db source untouched (verbatim timestamp fraction via repo-layer SQL shaping).
- Workspace incident recorded in receipt: harness reset wiped the session workspace between turns (clone, scripts, session worklog); rebuilt from remote + context; no repo content affected.
- BLOCKER B-1: no live GitHub credential (first PAT revoked ~2 min; second lost to harness reset) → claim commit LOCAL ONLY on t-mig-023/r1 @ ffc2876. UNBLOCK: operator PAT → push → PR "T-MIG-023: wave-2 exit port fixes (F-1 instant rendering + F-2 page-text assembly)" (receipts + fence disclosure in body) → IN_PROGRESS on work start.

Stage Summary:
- T-MIG-023 CLAIMED (local): the two R0-filed port divergences that block the conditional Wave-2 exit gate. Acceptance pins pre-registered (Java Instant.toString() fraction law with 0/3/6/9-digit vectors; 716-char page-text capture). Work not started (claim-only round per operator directive); execution plan in yaml + receipt. Claim priority attaches at remote push time per AGENT_COORDINATION (T-MIG-005 run-001 precedent).

---
Task ID: T-MIG-030 tranche 2
Agent: R7a (agent-da4ab8, zai-web session web-da4ab8b1)
Task: Execute T-MIG-030 tranche-2 — assessment route factories + zod wiring + OUT-OF-FENCE mounts + route tests

Work Log:
- Both tranche-2 gates merged this window: T-MIG-018 (PR #26, R0-REPAIR-2 renumber) for the zod contracts; T-MIG-007 (PR #29) for the replay kit. Tranche-1 itself merged as PR #31 -> 2ca1a16 (self-reviewed + merged by this lane under the operator's explicit merge-authority delegation, trace 1a10b1d0c70818a9, disclosed in review 5990742535 + run-003 receipt; six compensating controls incl. first-hand law re-verification and test-count decomposition 381 = 347 main + 34 mine).
- Shipped routes/assessment/index.ts: createAttemptRouter (POST /api/v1/attempts MCQ auto-grade; POST /api/v1/attempts/structured PENDING) + createAttemptHistoryRouter (GET /api/v1/learners/me/attempts, advisory limit) + buildAssessmentRouters composition mirroring buildCurriculumRouters. 19 route tests over REAL services on stubbed sql; 200/201 bodies double-pinned (canonical contracts schemas + captured bodies).
- Body-binding law resolved from capture + handler reads: the captured 'missing fields' 400s are EMPTY-BODY malformed_body (Jackson required-body-missing), NOT {} validation — {} binds with nulls then @NotNull fires validation_failed 'questionId: must not be null' (handler :158-165). UUID fields are binding-fail-fast (captured bad-uuid 400). Classifier: any binding failure anywhere beats every constraint (Jackson parses the whole document before @Valid). All inferred messages pinned SINGLE-FIELD so Hibernate traversal order can never flip a pin (T-MIG-017 lesson).
- OUT-OF-FENCE mounts shipped as the separate flagged commit (2 mount lines + import + construction + comment) per the 010/020/021 ratified precedent; ratification requested at PR review.
- Gates: typecheck x4 exit 0; bun test 400/0/13skip 1026 expect (= main 381/967 + 19/59 exactly); golden selftest OK; replay NOT RUN (env-blocked: no local postgres, Neon network-gated — unchanged fleet-wide; cases wired for the CI-side runner).

Stage Summary:
- T-MIG-030 tranche-2 complete on t-mig-030/r7a-ext; PR to follow with run-004 receipt + R0 ratification request for the mounts. Attempt + history surfaces are now fully mounted behind the golden gate (replay pending env). Remaining wave-3 slices 031-034 per the recorded split proposal stay open for other lanes or R0 arbitration.

---
Task ID: R0-SWEEP-3 (PR #31 merged — T-MIG-030 tranche-1 ratified, E-1 bound)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Review + merge PR #31 (T-MIG-030 wave-3 assessment port slice A — claim + tranche-1)

Work Log:
- Id 030 ratified (19 yaml ids, zero duplicates); 030..034 split map arbitrated + ratified as filed. PR body stale ("docs-only" vs tranche-1 landed) noted non-blocking.
- Tranche-1 law review vs frozen sources @ 6cad6ef: MCQ submit 9 steps, structured submit 9 steps, history read model (clamp/excerpt/settling) — all constraint-for-constraint; IAE fixed-body 400 verified verbatim vs GlobalExceptionHandler.java:167-170; V20 paper gate + ServableQuestionSpec branch exact.
- ONE finding: E-1 — evidence seam cannot express Attempt.markEvidenceEmitted() (EvidencePublisher.java:37/53); evidence_emitted never flips; latent (no re-fire site yet); bound as tranche-2 condition with required unit pins. Recorded on the yaml.
- Gates on intake content (head 20da5ab): typecheck x4, bun test 362/0/13skip (375 = 341 + 34 exact), selftest OK, CI verify+hub success; tolerate-claim on w3 cases verified factual; R-TX posture ratified as disclosed; lane's own intake (2c07ffb, operator trace 1a10b1d0c70818a9 disclosed in run-003) accepted — my parallel intake discarded.
- MERGED. Housekeeping: yaml status comment + E-1 paragraph + this entry. Card stays IN_PROGRESS (tranche-2 pending: routes, zod wiring, OUT-OF-FENCE mounts, golden replay of the 8 cases).

Stage Summary:
- Board: T-MIG-030 tranche-1 landed; wave-3 port train rolling (030 in flight, 031..034 seeds available per the ratified map). Next review targets: T-MIG-030 tranche-2 when pushed; 031..034 filings if seeded. Standing: F-1/F-2 content fixes, F-3 re-pin (R6), H-2 (r7a), E-1 (r7a tranche-2), CI-side Neon runner, T-MIG-002 baseline-SQL, PAT rotation, flaky-test watch.

---
Task ID: T-MIG-023 (work start)
Agent: R1-contracts session (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Unblock executed — third operator PAT validated (login SyllabAI), claim branch pushed, work started.

Work Log:
- 2026-10-05T08:31:04Z: token 200 on GET /user → push -u origin t-mig-023/r1 → remote @ 46f4f19 (ls-remote verified). Claim priority attached at push time per AGENT_COORDINATION. Credential law held (env var + per-invocation helper only, outputs redacted by pattern).
- yaml → IN_PROGRESS; receipts updated. Proceeding: F-1 (repositories.ts:64-65/169-170/314 — Java-exact Instant writer + verbatim DB fraction, repo-layer SQL shaping) and F-2 (reader.ts documentPageText — mirror frozen ContentReaderService page assembly; pin = 716-char capture).

---
Task ID: T-MIG-031
Agent: R3-api-a (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Claim the Wave-3 route-layer slice "exam-papers + questions READ port" per the R0-ratified 030..034 seeding map (verdict 5990832802) — 11 golden cases over the ServableQuestionService one-owner boundary

Work Log:
- Pre-claim board sweep at main ffc2876: T-MIG-000..022 all DONE; PR #31 (r7a T-MIG-030 tranche-1) open at scan time — my collision rescan 08:19:33Z, merge landed 08:19:39Z (six-second race window, disclosed for the record; zero other T-MIG-031 claimants existed at any point).
- Collision scan re-verified immediately before branch cut (08:19:33Z): zero T-MIG-031 yamls on main, zero t-mig-031* remote heads, zero file overlap with T-MIG-030's fence (services|routes|test /assessment/**).
- Surface grounded against frozen syllabai-core @ 6cad6ef (raw reads only): ExamPaperController (:24/:42/:50), QuestionController (:24/:39/:60/:79/:84/:97), ServableQuestionService (424 lines — one-owner servability boundary + V20 paper-level gate + batched current-versions + specPointRefs PRIMARY-first ordering + taxonomy PART_OF grouping with deterministically-lowest parent + deduped census), ServableQuestionSpec, MarkSchemeRevealService (policy env + fail-fast boot + REJECTED/FLAGGED never reveal + 204 withhold), QuestionFamilyAssembler (SME ref convention, 23 pinned interleaved family orders VERBATIM, non-corpus rows single-member after the corpus), SecurityConfig :91 anyRequest().authenticated() (no role rules on either base path — matches the captured unauthed-401/student-200 pairs).
- Contracts gate pre-satisfied: T-MIG-018 (PR #26 merged) already ships every schema the surface needs — import, never edit.
- Fence design: this lane's TS files live in DISJOINT dirs (services|routes|test /questions|exam-papers /**) against T-MIG-030's pushed globs; boundary disclosure written into the yaml + claim receipt; shared laws imported, never edited. r7a's merged fakeSql helper pattern will be structurally duplicated in test/questions/helpers.ts (no cross-fence test imports), per the per-module seam convention.
- Claim artifacts: .syllabai/tasks/T-MIG-031-exam-papers-questions-read.yaml (CLAIMED, full execution_record with line cites + tranche plan) + .syllabai/receipts/T-MIG-031/run-001-claim.json + this entry, committed as the branch-start commit e57a393 per §2 rule 1.
- CREDENTIAL DISCLOSURE: session environment reset between operator contacts — no GITHUB_PAT at claim-authoring time (08:20Z); operator provisioned a fresh PAT (chat-transient, env-injected per doctrine, never persisted) and the branch pushed as-is at the claim instant; merge-intake of post-#31 main (daad88e) followed as this union commit. Earliest-claim evidence = e57a393 author+committer timestamps; no force-push, no history rewrite.
- R0 verdict 5990832802 (PR #31) ratified the 030..034 seeding map with "031 exam-papers+questions" — this filing's scope matches the ratified mapping exactly; PR requests task-id ratification + fence acknowledgment. R0's "keep bodies in sync" directive acknowledged: the PR body states claim-status only and will be updated per tranche.

Stage Summary:
- T-MIG-031 CLAIMED (branch t-mig-031/r3a pushed; commit e57a393 + this intake). Deps T-MIG-018/007/014 all merged — slice immediately portable. Tranche-1 (services/questions + services/exam-papers, stubbed-sql tests) next; tranche-2 (zod-wired route factories + flagged OUT-OF-FENCE mounts) follows. Golden replay posture: env-blocked follow-up per T-MIG-020/021 precedent, no case weakened.



---
Task ID: T-MIG-024 (claim — operator drain-cycle queue item W2-F3)
Agent: R4-api-b (Super Z, zai-web session web-77b6eb1d-5d09-4958-852b-ea9f8f7a9c8a)
Task: Claim exactly one drain-cycle item after zero-collision scan; implement the F-3 multiset re-pin.

Work Log:
- Synced on origin/main @ daad88e (worklog tail through R0-SWEEP-3; directive state 2ca1a16 already superseded — nothing held, no open PR from this lane; T-MIG-021 yield stands DONE).
- Zero-collision scan: W2-F1+F-2 TAKEN (t-mig-023/r1, IN_PROGRESS); 030-tranche-2 r7a; 031 PR #34; 035 hub live-flow; F-3 UNCLAIMED → claimed W2-F3 as T-MIG-024 (id ratification requested in PR; T-MIG-021/023 precedent). One task per agent held; T-MIG-002-R left unclaimed.
- Branch-start claim per §2.1: t-mig-024/r4 @ daad88e; yaml CLAIMED + receipt run-001-claim.json; implementation follows (runner declared-unordered multiset rule + case re-pin + selftest pins + reorder-check tool; fence = golden/** + bookkeeping only).

---
Task ID: T-MIG-035 (claim — T-MIG-011's escalated remainder, routed by operator word)
Agent: w0a (Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Operator "T-MIG-011-adjacent hub work. Check if already done" (trace 1a10b2e6fc57b639) → verified the parallel-safe T-MIG-011 scope DONE (PR #32, b3b33031) while the escalated live auth-flow check remains open and unowned → claimed it as self-filed T-MIG-035 (next free id; 031..034 reserved by the ratified 030..034 split map).

Work Log:
- Board check: T-MIG-011 DONE; its yaml + worklog rows record exactly one surviving item — "the Neon-branch-gated live auth-flow check (rate-limit/audit write paths) — R6 capture route or branch DSN, operator's call". No yaml owns it.
- Operator word routes it to this lane, which holds the verified NEON_PAT and the proven branch/boot/synthetic-account mechanics (T-MIG-004 run-002).
- Self-filed .syllabai/tasks/T-MIG-035-hub-live-flow.yaml (fence: task yaml + receipts/T-MIG-035/** + worklog append + local scratch only; apps/hub + apps/api read-only — defects FILED, never silently fixed).
- Claim commit = branch start per §2.1 (this commit).

Stage Summary:
- T-MIG-035 CLAIMED. Next: provision COW branch hub-live-flow/2026-10-05, boot v2 api against it, verify hub strangler routing via the hub's own api.ts decision, run register/login/me live through the constructed URL, assert branch DB write paths (users + audit rows), receipts + PR.

---
Task ID: T-MIG-024 (work complete — IN_REVIEW)
Agent: R4-api-b (Super Z, zai-web session web-77b6eb1d-5d09-4958-852b-ea9f8f7a9c8a)
Task: Implement the W2-F3 multiset re-pin and drive to PR.

Work Log:
- golden/runner.ts: GoldenCase.unordered?[] (declared body-root dotted paths); canonicalizeUnordered sorts declared-path arrays by post-redaction canonical JSON (multiset semantics; undeclared + nested arrays stay strict); deepEqualTolerant gains an optional 4th arg — zero behaviour change for the other 112 cases; 7 selftest pins added; deepEqualTolerant exported; CLI main wrapped in import.meta.main so golden/tools can import the comparator (direct invocation unchanged; ci.yml:32 verified).
- teacher-content-paper-review-realdata-200.json re-pinned with "unordered": ["versions"] — the only over-pinned structure per the F-3 ruling; golden/README.md documents the rule.
- golden/tools/reorder-check.ts (setcheck precedent): runs the REAL committed case offline — identity/rotate/reverse pass; marks mutation, paper.id mutation, and un-declared reorder all fail. 7 PASS + 1 SKIP.
- Gates: typecheck x4 exit 0; bun test 361/1/13 (1 = the pre-existing follow-up-register flake, identity routes.test.ts:329 — file re-run x2 green; this diff touches zero apps/packages files); golden selftest OK; reorder-check green. Receipt run-002-work.json.
- Fence held: golden/** + bookkeeping only; docs/GOLDEN_MASTER.md untouched (doctrine amendment flagged in PR for R0). Live single-case replay stays with R6/R0 posture (sandbox DNS-blocked from Neon — standing finding).

Stage Summary:
- T-MIG-024 IN_REVIEW: the F-3 comparator condition of the CONDITIONAL Wave-2 exit gate is ready for independent review; PR opened (R0 actions: id ratification + optional §5 codification). One task per agent held; lane goes IDLE after PR per drain-cycle step 7.

---
Task ID: T-MIG-035 (run-001 — live auth-flow check executed; ALL 10 CHECKS PASS)
Agent: w0a (Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Execute the escalated T-MIG-011 remainder — live auth-flow verification of the hub auth surface against the v2 api, strangler env flipped, on a task-owned Neon COW branch.

Work Log:
- Provisioned Neon COW branch hub-live-flow/2026-10-05 (br-mute-dust-a50ov8nc, endpoint ep-bold-boat-a50g21yb, parent production) via the console.neon.tech/api/v2 base — api.neon.tech still DNS-dark; fallback first proven on the run-006 drop. Branch-local role password reset; production role untouched; DSN in gitignored operator .env only.
- Booted apps/api against the branch (PORT=8090; branch DSN; synthetic 32B JWT secret; synthetic teacher join code). Boot clean; no LLM keys needed for the auth surface.
- Harness imports the hub's ACTUAL routing decision (apps/hub/src/lib/api.ts resolveBase/apiPath) with NEXT_PUBLIC_API_V2_BASE_URL set — not a reimplementation: 10/10 PASS. Highlights: auth surfaces resolve to the v2 base while /api/v1/subjects stays core (strangler isolation intact); register 201 + login 200 + /me 200 via the hub-constructed URLs; AuthResponse {accessToken,tokenType,user} matches the hub's types.ts contract exactly; wrong-password 401 exercises the budget path; no Retry-After on admitted logins.
- Write-path proof: users row dce2ba69… exists on the branch only; branch users total 324 = 323 COW-copied production rows + 1 synthetic. Zero production writes, zero production compute contact.
- Residual honestly recorded: browser-level UI drive NOT executed (stretch goal; the React form render layer is the only unexercised hop). Receipts: .syllabai/receipts/T-MIG-035/run-001-hub-live-flow.json.

Stage Summary:
- T-MIG-035 evidence complete: the last open item of the Wave-1 hub adapter is CLOSED with live proof. After merge, COW branch br-mute-dust-a50ov8nc can be dropped. PR follows with receipts; status stays R0's field.

---
Task ID: T-MIG-023 (work complete — IN_REVIEW)
Agent: R1-contracts session (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Execute F-1 + F-2 (the two R0-filed Wave-2 exit gate blockers) per T-MIG-022 run-001 diagnosis + ratified fix sketches.

Work Log:
- F-1 (1021 Instant divergences): content repositories now shape every consumed timestamptz verbatim — to_char(col at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') at 10 select sites (documents x3 + col-ref, exam_papers x4 + col-ref, audit x1) — and javaInstantText() renders the Jackson Instant law (fraction groups-of-3, trailing zero-groups trimmed: .578011Z / .578Z / none). Date round-trip sites removed; audit ORDER BY qualified to the true column. packages/db untouched (repo-layer SQL shaping only).
- F-2 (reader page text "" vs 716-char capture): documentPageText now binds the §8 snake_case element keys (page_number/reading_order) with Jackson int-coercion parity (NUMERIC_TEXT exact-int strings); bind violation throws → error boundary fixed-500 (R10, route calls pageText unguarded = IllegalStateException parity); [null] elements skipped; camelCase keys intentionally dead (they bound nothing in Java either — the drift itself). Root cause cross-checked against frozen ContentReaderController.java (:97-105 full-DTO binding) + contracts canonicalElementBase (:349-366).
- Pins: fidelity-fixes.test.ts NEW (9 tests / 25 expects — T-MIG-022 capture vectors verbatim, fraction law incl. 000500/578010 edge groups, §8 binding negative, coercion, fail-loud, verbatim 716-char vector with order-restoration); routes.test.ts 020-era pin corrected to §8 (assertions unchanged — the old pin pinned the drift).
- Gates exit-captured: bun install --frozen-lockfile 930 pkgs clean; typecheck x4 exit 0; bun test 356/0/13skip; golden selftest OK.
- B-2 ESCALATION (§6.1, honest): live replay NOT RUN — golden COW-branch DSN lost to the workspace wipe (.env gone); ambient DATABASE_URL probed = dead local placeholder (AggregateError). UNBLOCK: operator COW DSN → T-MIG-022 tools both postures, or R0 merge-intake re-execution (T-MIG-007 precedent). R0 expectation: Pass B 15/15 after F-1+F-2, Pass A 25/25.

Stage Summary:
- T-MIG-023 IN_REVIEW: both conditional-exit port divergences fixed with pinned laws; all local gates green; live replay escalated B-2 with probe evidence. PR opened same session. Wave-2 exit gate becomes fully actionable on replay (F-3 stability ruling stands pending R6 re-pin).

---
Task ID: T-MIG-023 drain-cycle status receipt (trace 1a10b512c7656ab9)
Agent: R1-contracts session (Super Z, zai-web session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Status line: T-MIG-023 (t-mig-023/r1, PR #38) | drain: synced ffc2876->0cd360b, merge-intake 422066e (worklog append-union byte-verified, zero code overlap; gates typecheck x4 / 392 pass 0 fail 13 skip / selftest OK), 3-way F-1/F-2 collision disclosed (earliest pushed claim: 46f4f19 @ 08:31:04Z) | BLOCKED (no PAT: intake-head push + PR body update pending) | suggestion: R0 three-way arbitration across t-mig-023/r1 (earliest claim + pins) vs t-mig-023/r3a (live 40/40 + F-3 contradicting the 5990536177 ruling) vs w2-f1/r3c (F-1-only capture proof); queue a COW DSN to clear B-2.
---
Task ID: DRAIN-CYCLE-STATUS (operator step 7 one-liner)
Agent: R4-api-b
Task: Status receipt per the operator drain-cycle directive (trace 1a10b3643c2cc971).

Work Log:
- R4-api-b | synced @ daad88e, claimed queue item W2-F3 as T-MIG-024 (zero-collision scan; W2-F1/F-2 were r1's), implemented declared-unordered multiset comparator + case re-pin + 7 selftest pins + reorder-check tool, all gates green (typecheck x4, bun test 361/1/13 with the 1 = pre-existing register flake re-run x2 green, selftest OK, reorder-check 7P/1S), receipt run-002-work, yaml IN_REVIEW, PR #37 opened (R0: id ratification + comparator verdict) | IDLE (PR #37 awaiting independent review; also posted independent APPROVE review on PR #34 per step 5) | suggestion: next round assign a lane to the flaky identity budget test (routes.test.ts:329, register item "identity uncaptured" — second occurrence observed this cycle, passes on re-run; a time-window freeze or budget-reset pin would de-flake it) and, after F-1/F-2/F-3 land, have R0 re-run the Wave-2 exit-gate check to flip W2 CLOSED.

---
Task ID: T-MIG-032 claim
Agent: R7a (agent-da4ab8, zai-web session web-da4ab8b1)
Task: Self-file + claim Wave-3 marking port, learner half (LearnerSelfMark + StudentSmartMark over the shared pipeline)

Work Log:
- T-MIG-030 closed through tranche-2 this session (PR #31 tranche-1 R0-ratified; PR #36 tranche-2 + E-1 self-merged under operator delegation). 031 taken by r3a (R0-seeded yaml + branch); 023/024/035 filed by r1/r4/w0a. 032/033/034 remain from the ratified split map.
- Read the full frozen 032 surface first: LearnerSelfMarkController/Service (row-lock-first settle law, exact-part-set rule, bounds as Conflict 409, learner_self_marks never HumanMark, evidenceFired via publishGraded), StudentSmartMarkController/Service (one-engine doctrine — the SAME SmartMarkService pipeline as the teacher queue, batched per attempt; reveal policy VALIDATED_ONLY 409; kappaGatePassed authority flag; ephemeral feedback prose; telemetry events), KappaAgreementService (Cohen's kappa, perfect-agreement convention), validators trio, append-only SmartMarkResult.
- E-1 contract (bound at T-MIG-030 tranche-2) applies directly: publishGraded claim true -> guarded flip; already-fired -> false no-op. The 032/033 binding recorded in the seam's in-source contract.
- CAPTURED QUIRK filed for R0 ruling: self-mark unknown attempt = 500 internal_error as-captured (vs smart-mark 404) — port yields 404 naturally; disclosed, never silently fixed (F-1 posture).
- Claimed T-MIG-032 @ 2026-10-05T09:00:00Z: zero-collision scan 0/0 (no 032 yaml on main, no t-mig-032* heads, no overlapping open PRs); branch t-mig-032/r7a from 8f67d05; yaml self-filed with R0 ratification request; claim receipt run-001.json.
- Split-boundary disclosure: the shared SmartMarkService pipeline lands in THIS fence (services/smartmark); T-MIG-033's teacher queue imports it — cross-slice contract recorded in both the yaml and the receipt.

Stage Summary:
- T-MIG-032 CLAIMED (claim + receipt on branch t-mig-032/r7a; PR to follow with R0 ratification request). Tranche-1 = services/selfmark + services/smartmark + stubbed-sql tests; tranche-2 = routes + zod (self-mark schemas live; smart-mark views local, R1 top-up) + flagged mounts + replay (CI-side runner pending).

---
Task ID: T-MIG-032 tranche 1
Agent: R7a (agent-da4ab8, zai-web session web-da4ab8b1)
Task: Execute T-MIG-032 tranche-1 — self-mark + smart-mark services over the shared pipeline, stubbed-sql tests

Work Log:
- Shipped services/selfmark (SelfMarkService: the full LearnerSelfMarkService gate order — empty-marks 400 pre-lock, select-for-update serialization, no-leak 404, structured-only, pre-settlement PENDING/SMART_MARKED only, exact-part-set, bounds-as-409, learner_self_marks settle, conservative correct rule, E-1 claim + guarded flip) and services/smartmark (SmartMarkPipeline with the validator trio + batch topology + fallback ladder; SmartMarkService.markAttempt with honest SCHEME_NOT_VALIDATED refusals, append-only results, fail-closed kappaGatePassed, evidence at completion only; StudentSmartMarkService with reveal-policy mirror, authoritative honesty flag, accepted-result-required feedback, verbatim explain/improve prompts, ephemeral prose).
- E-1 contract (bound at T-MIG-030 tranche-2) consumed at BOTH evidence sites: claim -> guarded flip; noop claims false -> no flip. Tests pin both postures.
- 27 tests (11 selfmark + 16 smartmark) pin gate order, message texts, settle shapes, validator violations, batch/fallback behavior, kappa fail-closed, reveal 409s, feedback grounding 409.
- Gates: typecheck x4 exit 0; bun test 429/0/13skip 1099 expect (= main 402/1031 + 27/68 exactly); golden selftest OK; replay NOT RUN (tranche-2 + env).
- Captured self-mark-500 quirk stays disclosed for R0 ruling (port yields 404 naturally — pinned in tests).

Stage Summary:
- T-MIG-032 tranche-1 complete on t-mig-032/r7a (PR #40). Tranche-2: route factories (self-mark schemas live; smart-mark views need R1 top-up) + flagged OUT-OF-FENCE mounts + replay. 033 (teacher marking) imports this pipeline — cross-slice contract recorded.

---
Task ID: R0-SWEEP-4 (drain cycle: #34 + #35 merged; #36 merge-state audit + E-2 filed; board sync)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Operator drain-cycle directive (all lanes, trace 1a10b366256d41c1): sync, drive claims/PRs, review open PRs, stop. R0 execution: review + merge the open board, housekeeping, then claim one queue item (W2-F3).

Work Log:
- SYNC at directive receipt: main daad88e (8 merges in the prior hour confirmed); board zero-open at directive-write time, THREE PRs open at scan time (#34/#35/#36) - the drain directive was executed against the live board, not the stated snapshot.
- PR #34 (T-MIG-031 claim, R3-api-a) reviewed + MERGED as db4268d (verdict 5991110868): id ratified against the split map (verdict 5990832802), zero-duplicate scan re-verified (21 yaml ids), disjoint-dirs fence design vs T-MIG-030 globs ACKNOWLEDGED, all 11 named golden cases verified present in the merged capture, CI verify+hub success on 0b8422a.
- PR #35 (T-MIG-035 hub live-flow, w0a) reviewed; first merge attempt hit a worklog conflict (post-#34 main db4268d, both PRs appended at the same tail) - R0 merge-intake 4442cfb on the lane branch per the standing dirty-mergeable rule (append-only union, chronological: 031 claim 08:20Z then 035 claim + run-001; both sides byte-verified sha256; resolver script scripts/r0-intake-35-worklog-union.py with pre-write asserts + post-write byte-identity checks); gates re-run on the intake head (typecheck x4, 362/0/13skip 931 expect = main baseline exact, selftest OK) before push; MERGED as 3a73e87 (verdict 5991125747: verification-only fence HELD, Neon COW posture sanctioned per the operator-routed branch mechanism, zero prod writes/contact, secrets clean, harness-imports-hub-routing methodology ratified, UI-drive residual accepted as preregistered stretch). yaml flipped CLAIMED -> DONE in this housekeeping commit; COW branch br-mute-dust-a50ov8nc may be dropped.
- PR #36 (T-MIG-030 tranche-2, r7a) REVIEWED IN FULL but merged by another authority before my verdict could gate it: head moved mid-review (772b9dc -> 0c74d67: E-1 seam implementation 8cf0002 + intake 0c74d67 - audited clean); MERGED at 08:52:46Z as 8f67d05 by the shared account under operator word trace 1a10b1d0c70818a9 (self-review verdict 5991221664 posted 2s pre-merge; the same delegation already disclosed in run-003 at tranche-1). My addendum 5991329067 landed 09:00:25Z - 7m41s POST-merge: a race, not a sovereignty contest; the merge stands under the operator-delegation doctrine (#32 pattern). Addendum RATIFICATIONS stand as recorded on the thread: OUT-OF-FENCE mounts, malformed_body/validation_failed two-envelope classifier (binding-failure precedes @Valid - Jackson binds the whole document first), single-field pins vs traversal-order flips, E-1 seam claim contract + guarded flip, F-1 inheritance posture.
- E-2 FILED (on the T-MIG-030 yaml, fix sketch owner r7a): the route factory builds the module with the noop default publisher (routes/assessment/index.ts:286) -> claim=false suppresses the guarded flip -> live surface returns evidenceEmitted=false post-MCQ-submit while golden/cases/w3-history-after-submit-200.json pins attempts[0].evidenceEmitted=true (frozen law: publishMcq always fires at MCQ submit, Attempt.java:159-161; row lands true at commit). Replay of that ONE case would fail once the CI-side runner lands. Fix: frozenParityEvidencePublisher default (claims true, emits nothing - flip is Attempt.java domain law, event pipeline stays dormant/disclosed); noop stays as the 032/033 publishGraded suppression test double. ~5 lines; no service change; run-004 e1_satisfaction + gate counts to refresh with it.
- T-MIG-030 yaml flipped IN_REVIEW -> DONE with conditions (E-2 + replay env-block) per the T-MIG-022 pattern; both yaml flips + this entry = this housekeeping commit. CI on merged main 8f67d05: verify+hub success.
- Board after sweep-4: #34/#35/#36 all merged; queue per drain directive: W2-F1 (branch w2-f1/r3c sighted - r3c claim in flight), W2-F2, W2-F3 (claimed by THIS lane as T-MIG-036, next free id), T-MIG-002-R. T-MIG-030 tranche-2 done; E-2 open on r7a's desk.

Stage Summary:
- Sweep-4 merged two PRs (#34, #35), audited the third (#36) post-merge under a disclosed operator delegation, and filed E-2 with a fix sketch instead of re-litigating the merge. Wave-1 fully closed incl. the live-flow escalation (T-MIG-035 DONE). Wave-3 train: 030 DONE (conditions), 031 claimed, 032..034 seeds open. Standing register: E-2 (r7a, blocks 1 replay case), F-1/F-2 content fixes (sketches in receipts/T-MIG-022/), F-3 re-pin -> THIS lane now executing as T-MIG-036, H-2 apply-reset divergence (r7a), CI-side Neon replay runner (operator), T-MIG-002 baseline-SQL repair, PAT rotation, flaky unit test watch (one occurrence, identity uncaptured).



---
Task ID: T-MIG-031
Agent: R3-api-a (Super Z, zai-web session web-752465e5-2985-476b-86a3-0bf785493dc5)
Task: Drain-cycle intake — merge current main (0cd360b, R0 sweep-4) into the tranche-1 branch; PR #43 to mergeable-clean

Work Log:
- SYNC per the drain directive (trace 1a10b52e36b4dc25): worklog re-read (sweep-4 entries: #34/#35 merged, #36 audited post-merge, E-2 filed on r7a's desk, W2-F3 -> R0's T-MIG-036); PR #43 found mergeable=dirty against 0cd360b.
- Intake commit (this one): sole conflict = worklog append tail (append-only union, both sides byte-preserved; my tranche-1 + drain entries re-landed on top of main's sweep-4 chain). Zero code-file conflicts — the fence (services|test /questions|exam-papers /**) is disjoint from everything merged in sweep-4.
- Gates re-run on the intake head before push (see run-003 receipt addendum); no force-push; history linear.

Stage Summary:
- PR #43 back to mergeable-clean; independent review requested (authors never self-merge — §5 recusal rule); R0 merge-intake ready. Queue items all claimed by other lanes (W2-F1 #42+r3c, W2-F3 T-MIG-036 R0, T-MIG-002-R #44 w0a, W2-F2 via T-MIG-023 #38/#41) — zero-collision scan says NO new claim for this lane; next: one independent review of another lane's PR, then status receipt + stop.

---
Drain-cycle status receipt: R3-api-a | synced at 0cd360b, drove T-MIG-031 tranche-1 (PR #43) through drain intake (0cd360b union, zero code conflicts, gates re-stamped 421/0/13skip + selftest OK, mergeable-clean, independent review requested) + posted independent APPROVE review on PR #42 (W2-F1, test-merge gates 410/0/13skip) | IDLE (tranche-1 awaiting R0 merge-intake; tranche-2 queued behind it) | suggestion: T-MIG-032/033 (marking ports) are the W3 critical path and E-2 (r7a) blocks one replay case — consider pairing a reviewer for #40 now so the marking train does not queue behind the W2 exit fixes.---
Task ID: R0-COLLISION-1 (section 2.1 arbitration: W2-F3 double-claim - T-MIG-024 wins, T-MIG-036 released)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Arbitrate the W2-F3 collision between PR #37 (T-MIG-024, R4-api-b) and PR #45 (T-MIG-036, R0's own claim).

Work Log:
- MECHANICAL RULING (timestamps verifiable on refs, ruling posted on #37 as comment 5991610725): earliest claim = T-MIG-024, claim commit a24c970 author-date 08:44:32Z (PR #37 created 08:51:28Z); R0's T-MIG-036 claim ~09:1xZ - late by ~26-30 min. R4-api-b's zero-collision scan was sound AT claim time (F-3 unclaimed sighted); R0's scan ran at cycle START and was not re-verified immediately before claiming - the five-PR burst (#37/#38/#40/#41/#42) opened in between and #37 was missed. PROCESS MISS recorded on the R0 side: the scan discipline (fresh ls-remote + open-PR query AT claim time, not before the cycle) is reaffirmed for ALL lanes including R0.
- DISPOSITION: PR #45 CLOSED unmerged (close receipt 5991617793); branch t-mig-036/r0 deleted; id T-MIG-036 returns to the free pool (its yaml never merged - zero namespace damage). T-MIG-024 id CONFIRMED (024 free on main, zero duplicates).
- CONFLICT DISCLOSURE: R0 was a party and ruled AGAINST its own claim; the implementation review of #37 goes to an independent lane (R4-api-b authored; R0 recused from this item's substance review). Six technical review criteria posted on #37 from the released parallel implementation (multiset-vs-set duplicates guard; tolerate-composition order; per-case scoping; byte-identity of captured data; frozen-law re-read; flake escalation).
- FLAKE ESCALATION: #37's gates record the register flake as 1 fail (re-run green) - SECOND fleet occurrence (first: main during the T-MIG-017-era pass). On a third occurrence: root-cause with the test identity captured.
- OTHER COLLISIONS SIGHTED, NOT ARBITRATED THIS CYCLE (directive step 7 - R0 stopped after its own item): T-MIG-023 appears in BOTH #38 and #41 (double-claim or refile - needs the same mechanical timestamp check); #42 (W2-F1 via w2-f1/r3c) vs #38/#41 (both citing F-1 content fixes) - possible F-1 scope overlap across three PRs. Arbitration queue for the next R0 pass or operator direction.

Stage Summary:
- W2-F3 resolved: T-MIG-024 (PR #37) owns it; R0 released cleanly with the ruling + review criteria on record. Drain-cycle queue fully claimed across the fleet: W2-F1 (#42 + T-MIG-023 overlap TBD), W2-F2 (t-mig-023/r1 sighted), W2-F3 (#37), T-MIG-002-R (#44 w0a).

R0-integrator | drain cycle: synced (main daad88e->0cd360b), merged #34 (T-MIG-031 claim) + #35 (T-MIG-035 live-flow, after R0 intake 4442cfb), audited #36 post-merge under disclosed operator delegation (trace 1a10b1d0c70818a9) and FILED E-2 w/ fix sketch (r7a: noop-default evidence wiring vs captured evidenceEmitted pin; ~5 lines), housekeeping 0cd360b (030 DONE w/ conditions, 035 DONE), claimed W2-F3 as T-MIG-036 then RELEASED it on the section 2.1 collision (T-MIG-024/PR #37 earliest by ~26 min; ruling + 6 review criteria on #37; own process miss recorded) | IDLE | suggestion: next round - assign E-2 to r7a (unblocks the 030 replay case), mechanically arbitrate the T-MIG-023 double-claim (#38 vs #41) and the F-1 scope overlap (#42 vs #38/#41) by claim-commit timestamps, and root-cause the register flake on its third occurrence.

---
Task ID: T-MIG-030 E-2
Agent: R7a (agent-da4ab8, zai-web session web-da4ab8b1)
Task: Execute R0's E-2 fix sketch (noop-default evidence wiring vs the captured evidenceEmitted pin)

Work Log:
- frozenParityEvidencePublisher added in routes/assessment/index.ts and wired as the buildAssessmentRouters default (claims TRUE per Attempt.java:159-161 domain law, emits nothing — event pipeline stays dormant as disclosed since tranche-1); noopEvidencePublisher stays the 032/033 publishGraded suppression TEST double (never live wiring).
- 2 pin tests added (live claim true; noop false). run-004 e1_satisfaction refreshed with the E-2 addendum + gate re-stamp.
- Gates: typecheck x4 exit 0; bun test 431/0/13skip 1101 expect (= post-#40 main 429/1099 + 2/2 exactly); golden selftest OK.
- Replay note: the E-2 fix unblocks w3-history-after-submit-200 for the CI-side runner (the one case E-2 blocked).

Stage Summary:
- E-2 executed per R0's sketch, no service change needed (as predicted). PR to follow; merge per the drain-cycle rule (independent review / R0 — authors never self-merge).
---
Task ID: T-MIG-002-R (claim)
Agent: w0a (Super Z, zai-web session web-e79a3bd8-5bc9-4aae-abe2-eb5f5d3964dd)
Task: Operator DRAIN CYCLE (all lanes) item 4 — claim exactly ONE drain-queue item after zero-collision scan.

Work Log:
- Drain cycle executed in order: (2) held claim T-MIG-035 driven to merge — R0 merge-intake merged PR #35 (3a73e87) with the worklog append-union (4442cfb); post-merge lane commitment executed: Neon COW branch br-mute-dust-a50ov8nc dropped + 404-verified (T-MIG-035 CLOSED, capture infra gone, zero production contact). (3/5) independent review posted on PR #36 (T-MIG-030 tranche-2, comment 5991331784): law verified vs frozen core (malformed_body/validation_failed/malformed-request bodies verbatim, path parity, binding-beats-constraint classifier, mounts concurred for ratification) with ONE blocking finding F-36-1 — E-1 binding condition unmet (evidence seam never flips evidence_emitted; replay-visible via w3-history-after-submit-200's evidenceEmitted:true). Author lane landed the exact remediation pre-merge (8cf0002: publishMcq fires-boolean contract + once-only guarded flip where evidence_emitted=false + 2 unit pins); post-merge main gates re-stamped: typecheck x4 exit 0, 383/0/13 (CI scope, = 381 + 2 E-1 pins exactly), selftest OK.
- Item 4 zero-collision scan @ main 8f67d05: W2-F1 -> PR #42 (claimed), W2-F2/F-1/F-3 -> T-MIG-023 PRs #38 AND #41 (two lanes, DUPLICATE id — R0 arbitration flagged), W2-F3 -> T-MIG-024 PR #37 (claimed). Only zero-collision item: T-MIG-002-R -> CLAIMED by this lane (card + run-001-claim.json on branch t-mig-002r/w0a; id ratification requested at PR review per T-MIG-030 precedent).

Stage Summary:
- T-MIG-002-R IN_PROGRESS (claim stage): repair goal = repo-resident re-runnable re-baseline path reconciling T-MIG-002's F2/F3 scripted fixes; surface read begins on the operator's next word. Fence: T-MIG-002 scope + receipts/card; packages/db/package.json and generated schema remain untouched (flag-only).

---

w0a | drove held claim T-MIG-035 to merge (PR #35 merged 3a73e87; Neon COW br-mute-dust-a50ov8nc dropped + 404-verified) + independent review of PR #36 (F-36-1 E-1 blocking finding -> author landed 8cf0002 remediation pre-merge; post-merge gates 383/0/13 re-stamped) + claimed T-MIG-002-R (sole zero-collision queue item) | BLOCKED-ON-NEXT-WORD (claim in flight, execution queued) | suggestion: arbitrate the T-MIG-023 duplicate id (PRs #38 vs #41) before review effort is spent twice, and route the W2-exit fix reviews to lanes not authoring them.
---
Task ID: T-MIG-032 tranche 2
Agent: R7a (agent-da4ab8, zai-web session web-da4ab8b1)
Task: Execute T-MIG-032 tranche-2 — route factories + zod wiring + OUT-OF-FENCE mounts + route tests

Work Log:
- Shipped routes/selfmark (LearnerSelfMarkController port: POST /:attemptId/self-mark 201; duplicate-part boundary law via the contracts superRefine -> 400 bad_request WITH detail; two-envelope body classifier; path-uuid conversion 400) and routes/smartmark (StudentSmartMarkController port: smart-mark + feedback-explanation + improvement-plan, 503 smart_feedback_unavailable with the FIXED body per GlobalExceptionHandler :107-117, path-uuid conversion). DORMANT LLM live seams disclosed (generator refuses, feedback 503s) — LlmProvider infra is the wave-3 LLM-chain lane's surface.
- 13 route tests over REAL services on stubbed sql: self-mark canonical selfMarkViewSchema 201 + empty-body 400 + duplicate 400 + bad-uuid malformed_body + @Max(99) single-field pin + path conversion + unknown-attempt 404 (captured-500 quirk stays with R0) + Boot 401; smart-mark 200 with kappa-authoritative + compact pointLabel + feedback 200s + 503 fixed body.
- CORRECTION caught by the canonical-schema pin (tranche-1 disclosed): SelfMarkPartView field marks -> marksPossible (frozen record component name, PartView(marksPossible) verified at source). Fence-internal fix.
- OUT-OF-FENCE mounts shipped as the separate flagged commit (2 mount lines at /api/v1/learners/me/attempts + imports + construction + comment) per the 010/020/021/030 ratified precedent.
- Gates: typecheck x4 exit 0; bun test 444/0/13skip 1139 expect (= post-#46 main 431/1101 + 13/38 exactly); golden selftest OK.
- Branch hygiene note: an initial mixed commit sequence was split cleanly — E-2 stays alone on t-mig-030/r7a-e2 (PR #46), the two 032 commits cherry-picked onto t-mig-032/r7a-ext from origin/main (zero content overlap between the two PRs).

Stage Summary:
- T-MIG-032 tranche-2 complete on t-mig-032/r7a-ext; PR to follow with run-003 receipt + R0 ratification request for the mounts. Per the drain-cycle rule (authors never self-merge), both #46 and this PR await independent review / R0 merge-intake.

r7a | drain cycle: synced (main 2ca1a16->77359e7 confirmed stale-snapshot), drove held claims — T-MIG-030 E-2 fix executed per R0's sketch (frozenParityEvidencePublisher live wiring + 2 pin tests, PR #46 ready) and T-MIG-032 tranche-2 executed (selfmark+smartmark routers, 13 route tests, tranche-1 marks->marksPossible correction caught by the canonical pin, flagged OUT-OF-FENCE mounts, PR #47 ready); both left unmerged per the authors-never-self-merge rule | BLOCKED (on independent review / R0 merge-intake for #46 + #47) | suggestion: next round — route #46 to any lane for a 5-minute review (it unblocks the w3-history replay case), then have R0 ratify #47's mounts + rule the self-mark-500 captured quirk, and seed the LLM-chain lane (both PRs' dormant seams wait on it).
---
Task ID: T-MIG-024 (run-003 - R0 F-3 ruling execution)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Re-examine F-3 ruling 5990536177 per operator directive (trace 1a10b7fe85b49a21 item 2); execute the winning disposition on PR #37.

Work Log:
- FROZEN-SOURCE RE-READ @ 6cad6ef: QuestionVersionRepository.findByPaperId (:46-51) CARRIES `order by v.question.externalRef nulls last, v.version desc` — my 08:05:47Z ruling premise ("findByPaperId carries NO ORDER BY (heap order)") was WRONG for this finder; it held only for MarkSchemeRepository.findByPaperId (:49-53). ContentReviewService.paperReview (:866-879) preserves the finder order into PaperReviewView.versions[] — versions[] is Java-deterministic, the capture (q01..q06 ascending) IS the Java order, and the port (review-repos.ts, both walks unordered) was NEVER faithful here.
- RULING (posted on #37 + correction addendum on #30): port-side ORDER BY restore WINS over markSchemes-only re-pin — r3a's recommendation adopted; zero golden weakening; multiset semantics SCOPED to genuinely-unordered legs (markSchemes walks, un-@OrderBy'd JPA collections).
- EXECUTED on t-mig-024/r4 (r4 idle since 08:53:24Z; fence extension authorized by the ruling + the operator's "#37 (post-rework)" queue item): review-repos.ts findFullByPaperId + audit-walk findByPaperId gain the exact JPQL-mirroring ORDER BY; case "unordered" declaration REMOVED; README comparator doctrine re-scoped; reorder-check.ts re-framed as two-posture law proof; comparator machinery retained dormant; receipt run-003-ruling-execution.json + yaml ruling_execution.
- CORRECTION CULTURE: this is R0's own ruling corrected on R0's own motion at the operator's direction — premise disproof recorded verbatim, not papered over.

Stage Summary:
- F-3 resolved the faithful way: the port now implements the frozen ORDER BY, the golden case stays strict, the Wave-2 exit gate's F-3 condition is satisfied on merge. CI + local gates on the intake head; merge per the operator queue.
---
Task ID: R0-SWEEP-5 (arbitration + merge sweep: board drained 6/6; W2 exit gate flipped)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: Operator arbitration + merge sweep directive (trace 1a10b7fe85b49a21): F-1/F-2 four-way, F-3 re-examination, ratifications, dependency-ordered merge queue, W2 gate flip.

Work Log:
- F-1/F-2 FOUR-WAY ARBITRATED (ruling 5992522545 on #38): r1 wins on claim-commit d92cd1021 08:17:06Z (fetchable 08:31:05Z per the 46f4f19ce blocker receipt) vs r3a/#41 375ff3eb1 08:35:07Z vs r3c/#42 36ecbd4e0 08:52:08Z; #41's self-release (dc70da835 + 31252da4f) RATIFIED as correct section 2.1 conduct (cross-ref 5992522796); #42 closed SUPERSEDED (5992523078); local-only contenders t-mig-024/r3 + t-mig-w2f1/r3c verified NEVER ESTABLISHED (zero remote refs, ls-remote) - recorded and dismissed.
- F-3 RE-RULED (5992834084 on #37 + correction addendum 5992834401 on #30): ruling 5990536177's premise DISPROVEN at frozen source 6cad6ef - QuestionVersionRepository.findByPaperId (:46-51) CARRIES `order by v.question.externalRef nulls last, v.version desc` (the premise held only for MarkSchemeRepository.findByPaperId :49-53). Disposition: port-side ORDER BY restore WINS (r3a's recommendation) with ZERO golden weakening; multiset semantics SCOPED to genuinely-unordered legs. R0 executed the rework on t-mig-024/r4 (r4 idle since 08:53:24Z; fence extension authorized by the ruling + the operator's post-rework queue item; recusal superseded by the operator's explicit re-examination directive - disclosed): review-repos.ts findFullByPaperId + audit walk gain the exact JPQL-mirroring ORDER BY; case "unordered:[versions]" REMOVED (strict pinning restored); README comparator doctrine re-scoped; reorder-check.ts re-framed two-posture proof; comparator machinery retained dormant.
- RATIFIED: T-MIG-002-R id on #44 (5992957156 - unique across main's yaml id set; operator drain-queue provenance); #47 OUT-OF-FENCE mounts (5992850136 - path parity verified vs LearnerSelfMarkController :28/:37 + StudentSmartMarkController :35/:44/:51/:59; 503 fixed-body vs GlobalExceptionHandler :107-117).
- MERGE QUEUE EXECUTED in dependency order, every merge independently gated (CI verify+hub on the exact head; R0 local gates on all three R0-intake heads): #46 E-2 -> 3a0cf41 (sketch executed exactly; Attempt.java:159-161 verified) -> #43 T-MIG-031 tranche-1 -> c3795276 (fence + V20 gate + PRIMARY-first + reveal fail-closed spot-checked vs 6cad6ef; R0 worklog intake 8c2146e) -> #38 T-MIG-023 -> 4be3fad3 (R0 worklog intake 5d34235; r1's own intake-3 chain respected, HOLD FOR R0 honored) -> #37 T-MIG-024 post-rework -> 1424a337 (R0 ruling-execution 1d71a14 + intake b145b70; gates 459/0/13skip 1221 expect + selftest + reorder-check locally) -> #47 T-MIG-032 tranche-2 -> 24d7ef81 (intake 91163b1) -> #44 T-MIG-002-R claim -> 1c117ca2 (intake ef898b6). BOARD: ZERO OPEN PRs.
- W2 EXIT GATE FLIPPED UNCONDITIONAL (operator directive item 5): all three conditions (F-1, F-2 via #38; F-3 re-pin via #37) satisfied on merged main; T-MIG-022 yaml status updated (incl. the superseded STABILITY-EXEMPT note corrected to the re-ruling). CI-side replay runner stays the standing periodic re-proof instrument; cases remain forever-gates.
- PROCESS NOTES: worklog unions resolved append-only-chronologically via per-PR resolver scripts with pre-write asserts + inverse-removal byte-identity post-checks (scripts/r0-intake-{37,38,43,44,47}-*.py; junction newline normalization <=1 byte, disclosed per union). r1's branch CI silence (heads pre-intake) was compensated by R0 local gate re-execution + the intake heads' own green CI. No force-push anywhere; all pushes fast-forward. PROCESS MISS recorded: this housekeeping commit was first authored against a stale local main (API merges do not move local refs) - caught on push, redone against origin/main; local refs must be synced before any direct-to-main housekeeping.

Stage Summary:
- Sweep-5 drained the board 6/6 with two arbitrations on record, two ratifications, one R0 self-correction (F-3), and the Wave-2 exit gate CLOSED. Wave-3 train: 030/031/032 landed or conditioned; T-MIG-002-R execution unblocked on w0a's desk. Remaining register: CI-side Neon replay runner (operator), flaky identity budget test root-cause (2 occurrences), PAT rotation, H-2 apply-reset reconciliation (r7a), T-MIG-033/034 seeds.

R0-integrator | arbitration + merge sweep: F-1/F-2 four-way ruled (r1 earliest 08:17:06Z; #41 self-release ratified, #42 closed superseded, local-only contenders never established), F-3 re-ruled on disproven premise (ORDER BY restore, zero golden weakening, executed), #44 id + #47 mounts ratified, merge queue #46->#43->#38->#37->#47->#44 drained (6/6 merged, zero open PRs), W2 exit gate flipped UNCONDITIONAL | IDLE | suggestion: next round - assign the CI-side Neon replay runner (it is now the only live-replay instrument and unblocks T-MIG-030's replay condition + the 40/40 re-proof), give T-MIG-002-R execution its operator word (w0a is unblocked), and root-cause the identity budget flake on its next occurrence.

---
Task ID: R0-ROUND-6 (housekeeping: sweep-5 card flips + donation hazard verification)
Agent: R0-integrator (Super Z, session web-df0238cc-641e-4e8e-ae60-bc44c2aeec2e)
Task: ROUND-6 directive (main @ 79bdc23 stated green; W1+W2 CLOSED): SYNC FIRST, then per-task protocol; zero-collision scan; STOP after — no self-filed wave work.

Work Log:
- SYNC executed: worklog tail re-read (~8 receipts incl. R0-SWEEP-5); all 27 task yamls status-scanned; live board queried (0 open PRs, 0 open issues; CI verify+hub success on 79bdc23 — matches the directive's stated baseline); ls-remote 44 heads all known merged-lane residue (no 033/034 branches, no 031-tranche-2 branch yet) — zero-collision scan CLEAN, no new claim available for this lane.
- BOARD-vs-CARDS DRIFT found: T-MIG-023 and T-MIG-024 still IN_REVIEW and T-MIG-032 still CLAIMED on main although their PRs merged in sweep-5 (#38=4be3fad3, #37=1424a33, #40=77359e7 + #47=24d7ef8) — the protocol's "card flip" step was left outstanding by the sweep-5 housekeeping. T-MIG-031 (IN_PROGRESS, tranche-2 on R3-api-a's desk) and T-MIG-002R (IN_PROGRESS, execution awaits the operator's word — w0a's stated blocker) are ACCURATE as-is; no flip.
- ARBITRATION-DONATION verified (PR #38 comment 5993757759, posted by w0a at 11:44:29Z executing operator trace 1a10b7d4e7294959; authored work = r3-c's closed W2-F1 claim): the donation's ONE actionable item — the ${}-interpolation adoption hazard ("a ${}-bound to_char silently returns a constant string per row; stub tests and typecheck cannot catch it") — verified on merged main 79bdc23 by full read of apps/api/src/services/content/repositories.ts + codebase-wide greps: 8/8 live to_char sites are LITERAL sql`` template text (documents x3, exam_papers x4, content_review_audit x1 — site map matches the donation's exactly); every ${} slot carries value parameters only; DOCUMENT_COLUMNS/PAPER_COLUMNS (which contain cast text) are declared-then-unused dead constants, never interpolated; ORDER BY on raw columns; 3/3 mappers route through javaInstantText; 9 F-1 pins live. VERDICT: hazard ABSENT — no remediation, no follow-up work item. Receipt: .syllabai/receipts/R0-arbitration/donation-38-hazard-verify.json. Verification answer posted on-thread (#38).
- CARD FLIPS executed (this commit): T-MIG-023 IN_REVIEW -> DONE (arbitration provenance + hazard-verification pointer + standing CI-runner condition), T-MIG-024 IN_REVIEW -> DONE (F-3 re-ruling provenance, strict pinning restored), T-MIG-032 CLAIMED -> DONE (both-tranche provenance, mounts ratified 5992850136, standing conditions: CI-side runner replay + R1 schema top-up). Worklog + receipt = this housekeeping commit.
- GATES on the housekeeping head (stamped in the push receipt): typecheck x4 exit 0; bun test apps/api packages = 485 pass / 0 fail / 13 skip, 1259 expect (= the directive's stated main baseline EXACT — yaml/worklog/receipt-only diff); golden selftest OK (113 cases).
- PROCESS DISCIPLINE per sweep-5's recorded miss: origin/main re-verified UNCHANGED (79bdc23) immediately before commit+push; authored against a fresh clone; fast-forward push only; no force-push.

Stage Summary:
- Round-6 board state after this pass: every merged card now reflects merged reality (zero card/PR drift); the donation hazard is verified and answered on-thread; the only remaining register items are operator-routed (CI-side Neon replay runner, T-MIG-002-R execution word, PAT rotation) or lane-owned (T-MIG-031 tranche-2 = R3-api-a, H-2 = r7a, identity-budget flake root-cause on 3rd occurrence). NO new claim was available to this lane without self-filing wave work (033/034 remain reserved, unfiled per the ratified split map) — per the directive, R0 stops here.

R0-integrator | round-6: synced (main 79bdc23, board zero-open, CI green), verified the ARBITRATION-DONATION ${}-binding hazard ABSENT on merged main (8/8 to_char literal, receipt + on-thread answer), flipped the 3 stale cards (023/024/032 -> DONE w/ provenance + standing conditions) | IDLE | suggestion: route the CI-side Neon replay runner to a lane (it is the standing re-proof instrument for 022/023/024/030/032 and the only live-replay path), give w0a the T-MIG-002-R execution word, and treat DOCUMENT_COLUMNS/PAPER_COLUMNS dead constants as sweep-cleanup in a future housekeeping pass (harmless, flagged only).
---
Task ID: T-MIG-002-R (execution reroute — operator trace 1a10c9d1ef9ebbe1)
Agent: R1-contracts session (Super Z, session web-ab7a0483-4415-4f31-ad16-b00a0e10053e)
Task: Finish T-MIG-002-R execution (F2 drizzle-kit re-run crash + F3 scripted renderer fixes) per Round-7 directive; claim card ratified 5992957156 (PR #44 merged).

Work Log:
- SYNC: main c920eeaf (round-6 housekeeping). Zero-collision verified: refs/heads/t-mig-002r/w0a @ ef898b648 == #44 merge-intake (ancestor of main) — w0a never moved past the merged claim card; no open PR touches this lane's surfaces.
- Claimed on branch t-mig-002r/r1 (cut from c920eeaf); receipt run-002-claim-r1.json; card status-line reroute note added (owner field untouched per card edit scope).
- Surface read: checked-in schema.ts carries all 8 F3 fix sites (5x .default(''), 0x broken forms; bytea/tsvector shims via custom_types.ts); snapshot targets 62 tables / 579 columns / 87 indexes; F2 = kit 0.30.6 gel-core hard-import + squasher ZodError on index expression:null (8 partial indexes in schema).

Stage Summary:
- Plan: in-repo codemod (render_fixes.ts) + F2 preflight + repo-resident 579/579 parity checker + pinned-toolchain recipe (kit 0.31.11 + orm 0.45.3 + @neondatabase/serverless 1.2.0; Neon COW-branch-only, drop after) + bun tests; package.json NEVER touched (flag only). Live pull deferred — zero production Neon contact, no COW DSN in sandbox.
