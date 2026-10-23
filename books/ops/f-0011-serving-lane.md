# OPS LANE f-0011 — the books serving plane (reader leg down at production)

Lane of record for the third serving-plane family finding (f-0008 Render
origin misidentification → f-0009 stale retired-origin citations → f-0011
the live serving plane itself). Root-cause-twice law escalation: this is
the dedicated ops lane the content lane asked for — it owns the platform
side; CourseLessons files evidence only.

## 1. Diagnosis of record (receipts, not theory)

Battery of record: `scripts/tc20-battery.mjs` (URL-pinned, 12 probes).
Run receipt 2026-10-23T08:07Z at the origins of record
(`syllabai-hub-v2.vercel.app` / `syllabai-v2.vercel.app`):

| leg | probe | result | verdict |
|-----|-------|--------|---------|
| corpus | lessons-index.json | 200, 5 packs | GREEN |
| corpus | all 5 pack JSONs | 200, status=published, chapterKey markers, sections>0 | GREEN (5/5) |
| api | /actuator/health | 200 UP | GREEN |
| api | /api/v1/content/books (no param) | 400 validation_failed | GREEN — route + request-validation ALIVE |
| api | /api/v1/content/books?courseId=igcse-chemistry-19 | **500 internal_error** | **RED — the break** |
| hub | /api/health (native) | 200 ok | GREEN |
| hub | /courses/igcse-chemistry-19/books | 200, no NEXT_HTTP_ERROR, zero lesson badges | GREEN shell / honest-empty |
| hub | lesson page | unverifiable downstream of the shelf 500 | RED by dependency |

Discriminator receipt (pins the break INSIDE the first DB query):
- The 400 (request validation, pre-DB) is GREEN.
- The 500 (post-validation, DB-touching) is RED.
- ⇒ The v2 api process is up and serving; the failure is the api → Neon
  query leg on the books family specifically.

### Layer-1 re-adjudication (the f-0011 "rewrite plane" clause)

f-0011's layer (1) claimed the hub "lost" a `/api/v1/*` + `/actuator/*`
rewrite plane. Evidence says that plane NEVER existed in the repo of
record and is NOT part of the reader chain:

- `git log --all -S "rewrites" -- apps/hub/next.config.ts apps/hub/vercel.json`
  → EMPTY (no commit ever added rewrites to either file).
- The hub's server reads ride `coreBaseUrl()` DIRECTLY to the core origin
  (`apps/hub/src/lib/core-proxy.ts:15`; the T-MIG-133 band 133j row
  comment in `apps/hub/src/lib/api.ts` states the 133c law verbatim: "the
  hub's SERVER reads ride coreBaseUrl() directly (lib/books.ts, the 133c
  law) and are untouched by this row").
- The hub-origin `/api/v1/*` 404s are therefore the direct-core law
  working as designed — hub-native `/api/*` routes exist only for their
  own families (health, corpus-pdf, books glossary, cron). A curl to the
  hub origin's `/api/v1/...` probing the rewrite plane measures a plane
  that is not part of this architecture.
- The reader break is 100% the api → Neon leg (layer 2). The battery's
  C2 probe (200 + zero badges) matches the f-0011 observation exactly.

## 2. Root-cause classes for the DB leg (census decides)

Precedent of record: T-TEACH-011 run-001's COW preflight proved production
LAGGED migrations (0006 authored but never applied there). The books
family tables: `book_chapters` = migration 0002 (base), rail tables
(`book_blocks`, `book_glossary_terms`, `chapter_progress`) = 0005.
The shelf/chapters SQL joins `documents ⋈ book_chapters` — a missing
relation is a hard SQL error → the catch-all 500 internal_error.

Decision tree (dispatch census first — read-only, zero-write):

```
census P2 table battery
├─ book_chapters ABSENT (or documents)  → migration lag class
│    → dispatch mode=apply-0005 (confirm APPLY-0005-F0011)
│    → then the DATA leg: books-ingest.ts (133f multi-book driver,
│      --subject-code 4CH1 law) behind its own COW-proof, then the
│      operator validation flip (the T-C20 serving lever)
├─ book_chapters PRESENT, TEXTBOOK rows 0 or non-VALIDATED
│    → data leg / validation flip class (no DDL needed)
│    → books-ingest.ts and/or the operator flip; re-run battery
├─ rows VALIDATED but shelf still 500
│    → api connection/driver class: the api runtime connects via the
│      NeonWsClient (createSql, T-MIG-014) while census uses TCP — if
│      TCP sees a healthy serving state, triage the api project's
│      DATABASE_URL env on Vercel (expired Neon branch target is the
│      known ephemeral-branch class) — operator/Vercel-side action
└─ everything present AND the battery green → re-run battery, close f-0011
```

## 3. Dispatch commands (operator, PAT required)

```bash
# census (read-only — safe, dispatchable freely)
gh workflow run t-book-ops-f0011.yml -R SyllabAI/syllabai-v2 \
  -f mode=census -f note="f-0011 ops lane census r0"
gh run watch -R SyllabAI/syllabai-v2 <run-id>; gh run download <run-id> -R SyllabAI/syllabai-v2

# apply-0005 (COW-proof → prod-apply; the dispatch IS the fire order)
gh workflow run t-book-ops-f0011.yml -R SyllabAI/syllabai-v2 \
  -f mode=apply-0005 -f confirm=APPLY-0005-F0011 -f note="f-0011 0005 apply r0"
```

## 4. Close criteria

1. Census receipt pins the class of record (artifact + the lane report).
2. The repair per the decision tree lands (apply-0005 receipt
   APPLIED-AND-VERIFIED, or the data/flip/env equivalent).
3. `node scripts/tc20-battery.mjs --expect-packs <N>` exits 0 at the
   origins of record (N = published packs at that moment).
4. CourseLessons findings f-0011 → closed with the receipts referenced;
   the serving-plane family gets its retro note (root-cause-twice law).
