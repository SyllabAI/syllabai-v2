# Data-Plane Placement Law — Main Relational DB vs Corpus Warehouses

- **Status:** RATIFIED — operator plan statement, trace `1a168885359acda1`, 2026-10-23: *"The user data, auth, course selected, learner model data, everything will be in the current database. And all the corpus related data will be in other databases."*
- **Operationalizes:** ADR-038 (course-group vector warehouses). ADR-038 decided the architecture; this document is the binding placement rule every agent applies when writing data.
- **Broadcast:** every agent must read §2 before any DB write. Ignorance of this law is not an excuse for a misplaced write; a misplaced write is a defect, not a preference.

---

## 1. The law in one line

**Identity, courses, and the learner model live in the main database. All corpus data lives in other databases (the warehouse fleet). Nothing else is negotiable, nothing else is ambiguous after §2.**

- **Main** = `ep-ancient-cake-a52e4kfd / neondb` (the restored production project). One writer discipline, OLTP, always-on.
- **Corpus** = course-group Neon projects per ADR-038 (~10–19 groups × 5–10 courses, ≤ 0.8 GB each, one account, 20 GB account cap).

## 2. Placement table (binding)

### MAIN — transactional / identity plane

| Plane | Tables (of-record examples) | Rationale |
|---|---|---|
| Identity + auth | `users`, `user_roles`, JWT core; future `oauth_accounts` / email-verification (Path B, pending) | Single identity system. The satellite prototype's parallel `neon_auth` identity is NOT a write target and never becomes one (ADR-038 quarantine stands). |
| Course selection + classroom | enrollment/course-targeting state, `classes`, `class_members`, `class_features`, announcements | Teachers and learners mutate these constantly; they are small, hot, relational. |
| Assignments (of-record domain) | `assignments`, `assignment_submissions`, task state | Classroom loop, learner-writable. |
| Learner model | attempts + answer state, flashcards + ratings/trail, marking-queue state, human-mark writes, intervention, target series, knowledge-graph surfaces, `cla_threads` | The "learner model data" the operator named. Writes are hot, per-user, and privacy-bearing. |
| Curriculum spine | curriculum nodes/versions/mappings | Small relational taxonomy that anchors mastery; stays adjacent to the learner model. |
| Deterministic anchors | bank/card/store resolver anchors | T-MIG-138 law: zero embeddings, zero vectors in main. Anchors are ids, not content. |

**Main size shape:** the Oct-22 baseline was 335 MB, of which ~227 MB is corpus (see below). Post cut-over main residual ≈ **100 MB** — permanently clear of the 1 GB Free-plan wall; future growth is learner activity, not content bloat.

### CORPUS — warehouse fleet (course-group projects)

| Plane | Tables | Notes |
|---|---|---|
| Papers registry + text | `documents`, `exam_papers` | Baseline census: 1,354 documents (301 QUESTION_PAPER / 289 MARK_SCHEME / 489 EXTERNAL_QUESTIONS / 162 SYLLABUS / 112 EXTERNAL_NOTES); 4MA1=110, 4CH1=37+8. |
| Chunk + vector plane | `document_chunks` (+ embeddings) | 133 MB / ~13.7k rows at baseline. HNSW lives here, not in main. |
| Mark schemes | `mark_points` | 35 MB / 40,250 rows. Scheme data = corpus; mark WRITES stay in main. |
| Assets (bytea) | `question_asset` (30 MB / 585), `revision_note_asset` (29 MB / 194) | Object Storage remains the escape hatch at scale (ADR-038 §backup law). |
| Books content | `book_chapters`, `book_blocks`, `book_glossary_terms` packs | Content = corpus; `chapter_progress` = learner state → MAIN (join key `(document_id, doc_version, chapter_key)` is already composite and portable). Books cut-over follows the paper planes in a later group wave. |
| Subject Intelligence / syllabus docs | document planes of the corresponding kinds | Same registry, same law. |

**Fleet capacity (of-record, ADR-038 §2):** 94 courses × 50–150 MB = 4.7–14.1 GB total — fits the 20 GB account cap in ~10–19 groups. Free caps: 1 GB/project, 100 projects, 100 CU-hrs/project, 5 GB egress/project, Object Storage 5 GB/project.

## 3. Transition law (what current agents do TODAY)

1. **T0 — now → cut-over:** corpus writes continue ONLY into main's existing corpus planes, by the owning lane, single-writer per plane. Learner/auth writes are unaffected, always main. The T-MIG-141 Phase B/C/D gate law is unchanged (DB-writing legs stay gated on NEON-DB-LOSS parity closure).
2. **T1 — cut-over of a subject group:** the provisioned warehouse becomes the SOLE write home for that group's corpus planes. Main's corresponding rows go read-only, the migration is parity-verified both directions, and after acceptance the main copies are dropped **zero-residue** (house law), reclaiming the ~227 MB.
3. **T2 — steady state:** main = identity + learner model; warehouses = read-mostly, scale-to-zero; nightly `pg_dump` → Object Storage backup law per ADR-038.
4. **No dual writes, ever.** During T1 no agent writes the same corpus row in two projects "to be safe" — that is how drift and the last incident happen.
5. **No new corpus plane in main.** After this ratification, a new content table family is assigned its warehouse home at design time. If that subject group's warehouse doesn't exist yet, the plane is DEFERRED, not built in main. (Additive migration files touching existing main corpus planes for a task already in flight remain valid under T0.)

## 4. Seam contract (cross-project references)

1. **Ids are the contract.** Cross-project references are by existing UUID/text id only. **No cross-project FKs** — referential integrity is app-law and intake-law from here.
2. **Text-compare law (T-MIG-141, of record):** `exam_papers.question_paper_document_id` / `mark_scheme_document_id` are varchar and legitimately hold non-UUID audit ids (`audit-qp-*`). Compare as text; never `::uuid`-cast.
3. **Retrieval is two-step (ADR-038):** warehouse `vector_search(course_slug, k)` → ids → hydrate by id. Deterministic resolver anchors in main need no vectors.
4. **Marking path:** human/smart marks are written in main; scheme lookups (`mark_points`) read from the corpus plane by id.
5. **Hydration discipline:** batch id lookups across the seam; no N+1 per-row cross-project queries; pooler RTT is the budget.
6. **Connection material:** warehouse credentials are env-only, never committed (briefing §0 law unchanged). Each warehouse gets its own role/password pair, rotated on the same schedule as everything else on the rotation list.

## 5. Order of execution (claimable via T-OPS-PLANE-001)

1. **Step 0 (blocks everything):** official NEON-DB-LOSS parity closure — full Oct-22 baseline census + T-C20 battery exit 0, filed as a receipt. Single-writer hold on the endpoint releases on this.
2. Trim pass: dedup + the unwired 1,223-chunk pdftotext-layout plane ruling (T-MIG-141 disclosure) + migration census re-pin.
3. Provisioner: Neon API → frozen template SQL (vector ext + chunks + HNSW), parity-verified chunk migration, zero-residue drop.
4. Cut-over waves: maths group (4MA1) first, then chemistry (4CH1), then the 94-course fleet per ADR-038 sequencing.
