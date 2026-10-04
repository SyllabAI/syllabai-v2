# Reference Docs — the frozen upstream library

Everything below is in FROZEN repos (C1): read freely, write never.
Raw URLs use `https://raw.githubusercontent.com/SyllabAI/<repo>/main/<path>`.

## Process law — master pack (`SyllabAI/syllabai`)

| Doc | Why it binds the v2 port |
|-----|--------------------------|
| `docs/adr/ADR-020-EDUCATIONAL_RETRIEVAL_ENGINE.md` | Retrieval engine semantics — port exactly (R-PGVECTOR) |
| `docs/adr/ADR-023-LLM_PROVIDER_POOL_HARDENING.md` | Groq→Gemini→OpenRouter chain failover rules — Wave 6 |
| `docs/adr/ADR-025-SMART_MARK_PRODUCT_CONTRACT.md` | Smart-mark contract — Wave 3 |
| `docs/adr/ADR-027-TEACHER_MARKING_QUEUE_SCOPING.md` | Teacher marking scoping — Wave 5 |
| `docs/adr/ADR-030-PER_COURSE_TUTOR_SCOPING.md` | Tutor scoping — Wave 6 |
| `docs/adr/ADR-031-DECAY_IS_COMPUTED_NEVER_PERSISTED.md` | Decay is COMPUTED — governs the Vercel Cron port (Wave 4) |
| `docs/adr/ADR-032-MISCONCEPTION_EVIDENCE_AGES_TOWARD_THE_PRIOR.md` | Evidence aging — Wave 4 |
| `docs/adr/ADR-033-BKT_EMISSION_IS_FORMAT_AWARE.md` | BKT emission — Wave 3/4 |
| `docs/adr/ADR-034-TRAIL_MERGE_IS_RECEIPT_BASED.md` | Receipt-based trail merge — the receipts culture of this repo |
| `docs/adr/ADR-035-EXECUTIVE_LAYER_EXAM_AWARE_NBA.md` | Exam-aware executive layer — Wave 4 |
| `docs/adr/ADR-036-RESEARCH_ENDPOINT_K_ANONYMITY.md` | k-anonymity BINDS the v2 research surface port (Wave 6) |
| `docs/adr/ADR_017_LEARNING_FIRST_RECOMMENDATION_SYSTEM.md` | Recommendation system — Wave 4 |
| `docs/adr/ADR_021_CONTENT_COMPILER_AND_PORTABLE_CONTENT_PACKAGE.md` | Content compiler — Wave 2 |
| `.syllabai/tasks/T-C42.yaml` | The task-yaml FORMAT this repo mirrors (AGENT_COORDINATION §4) |

## Backend behaviour reference (`SyllabAI/syllabai-core`)

| Doc | Use |
|-----|-----|
| `docs/DEPLOYMENT.md` | Pilot runbook: Neon + Render + Vercel wiring, cold-start doctrine, decay/backup notes — the deployment facts the v2/Vercel port replaces |
| `docs/CONTEXTUAL_LEARNING_ASSISTANT_IMPLEMENTATION.md` | CLA internals — Wave 6 |
| `docs/RETRIEVAL_EMBEDDING_PLAN.md` | Embedding/retrieval plan — Wave 2/6 |
| `docs/LEARNER_INTERACTION_MEMORY_IMPLEMENTATION.md` | Interaction memory — Wave 4 |
| `docs/EVIDENCE_STATE_TRANSITION_HARDENING.md` | Evidence state machine — Wave 3 |
| `docs/INTERVENTION_RUN_ACCEPTANCE.md` + `INTERVENTION_RUN_PERSISTENCE_QUERY_COST.md` | Intervention runs + N+1 history (T-C32 heritage) — Wave 6 |
| `docs/CLA_EVALUATION_BUNDLE.md`, `CLA_STEP1_RUNTIME_ACCEPTANCE.md` | CLA acceptance — Wave 6 |
| `docs/PR_ENDPOINT_RETARGET.md` | Endpoint retarget history — path-parity context |
| `render.yaml` / `Dockerfile` | Env var names (the v2 keeps `SYLLABAI_*` names for compat), JVM cold-start history (why v2 exists), fail-fast doctrine |

## Frontend reference (`SyllabAI/syllabai-hub`, imported at `93226a43` into `apps/hub`)

| Doc | Use |
|-----|-----|
| `docs/ARCHITECTURE.md`, `docs/REPOSITORY_MAP.md` | How the hub is structured — required reading for R5 |
| `docs/CLA.md` | CLA frontend contract — Wave 6 |
| `docs/FRONTEND_PROMOTION_PLAN.md`, `docs/TEACHER_MODE_PLAN.md` | Feature plans — context for adapters |
| `docs/UX_AUDIT_REPORT.md`, `docs/audits/` | Known UX debt — do NOT fix during migration (parity first); file for post-migration |
| `docs/CORPUS_IMPORT_REPORT.md` | The 80MB content corpus handling — R-CORPUS |

## Conventions inherited

- Task yaml: master-pack format (see `.syllabai/tasks/` here).
- Receipts: JSON evidence per task under `.syllabai/receipts/` (heritage:
  resources-repo postflight receipts, ADR-034).
- Worklog: append-only sections with Task ID / Agent / Work Log / Stage
  Summary (`.syllabai/worklog.md`).
- Secrets: never committed; `sync:false`-style dashboards only (heritage:
  core render.yaml). Env prefix `SYLLABAI_` is kept for compat.
