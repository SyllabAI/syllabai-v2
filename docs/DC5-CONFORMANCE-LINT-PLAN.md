# DC-5 — Cross-Tool Marking Conformance: alternatives materialisation + conformance lint (run-001 prereg of record)

- **Date**: 2026-10-23 (Asia/Dhaka)
- **Operator word**: "Proceed" (trace `1a164e7ccff41b2d`) — the P2 band launch after P1 closed (DC-3 `751916cf` → DC-4 `30d8d21c` → DC-7 `c3dcd96d`, PR #307 collected by R0-AUTO 2026-10-22T18:01:42Z).
- **Branch**: `dc5-cross-tool-conformance`, base `71944a30` (origin/main tip at lane open).
- **Spec of record**: SmartChat-Mark-Design spec, sha256 `0da8044a0667a47c684d4b0486784be02bc4992546eca2ec2946043e9e2b287a`, §3.5. Roadmap row: *P2 | DC-5 alternatives materialisation + conformance lint | ingestion + smartmark + tutor | "Membership lint catches a synthetic out-of-set alternative"*. Identity of record stays `tutor-grounded/v15`.
- **The decision law (spec §3.5, verbatim intent)**: "The mark scheme's acceptable-answer surface is materialised ONCE and consumed by both generations … The marker grades against the point wording; the tutor (through DC-1) may remediate with any alternative in the materialised set — and nothing outside it. A conformance lint, in the spirit of the existing stem-hygiene pass, runs after tutor generation on marked-part turns: any point the tutor claims was missed must exist in the scheme rows, and any alternative or value it offers must exist in the set. … The lint is deterministic and cheap (set membership after the same normalisation the marker uses); violations are stripped and logged, mirroring how out-of-range citation markers are stripped today. The alternatives columns are additive to the existing ingestion pipeline and carry the scheme revision, so a scheme bump re-materialises both consumers at once."

## 1. Grounding census (first-hand, base `71944a30`)

1. **Fence law of record** — `docs/BASELINE_DB.md` §4.1: v2 may "read/write rows freely … **alter structure never** while the Java core is live" on Flyway-owned tables; §4.2: "New v2-only tables … are allowed … but must be listed in the schema README with their owning task id." `mark_points` and `mark_schemes` are Flyway-era baseline tables (`packages/db/src/schema/schema.ts` :330 / :194, introspected by T-MIG-002). The schema README repeats: "Drizzle must never … ALTER … any table the Java core owns."
2. **mark_points of record** — columns: `id, mark_scheme_id (FK cascade), question_part_id (FK), ref varchar(20), ordering, text (NOT NULL), marks, acceptance_criteria jsonb, extraction_confidence, created_at`; indexes `ix_mark_points_part`, `ix_mark_points_scheme (mark_scheme_id, ordering)`.
3. **mark_schemes of record** — `id, question_version_id (FK cascade), version_label varchar(20) default '1', source_document_id, validation_state, extraction_method, created_at, general_guidance`; `uq_mark_scheme (question_version_id, version_label)`. **The scheme-revision carrier**: a scheme bump is a NEW scheme row; `mark_points` hang off `mark_scheme_id`.
4. **`acceptance_criteria` is empty in practice** — every write path stores `'[]'`: the GLM-OCR bridge (`services/ingestion/glm-ocr.ts` :162, :172 hard-codes `acceptance: []`) and the SME apply path (`services/sme/index.ts` :441, :500, :510 write `JSON.stringify([])`). The acceptable-answer surface does NOT yet exist anywhere in the store — DC-5's materialisation is net-new data, not a re-expose.
5. **Live ingestion path of record** — the SME apply (ADR-037 B3 applied of record: 3,907 mark points @ `1.1@bf8d56c3`, receipt commit `02edf2bf`) inserts per-point rows when the converter split M1..Mn (validated to sum to the part's marks), else the frozen whole-block row (`services/sme/index.ts` `saveStructuredBody` :452-523 + the MCQ whole-block path :420-444). The secondary path is the past-paper bridge (`services/ingestion/past-paper.ts` :462-508). Both are the "existing ingestion pipeline" the spec names; both get the additive hook.
6. **Marker consumption (unchanged by DC-5)** — `services/smartmark/index.ts` :598/:1100/:1119 and `services/teachermarking/index.ts` :660 read `mark_points` by scheme (`id, ref, ordering, text, marks, question_part_id`) and grade against the point wording. The spec's own decision leaves the marker side untouched; zero smartmark changes in this lane.
7. **DC-1 seam of record** — `services/tutor/mark-context.ts` (prereg `docs/DC1-MARK-CONTEXT-PLAN.md`): `loadMarkContext` resolves the explicitly referenced part (fail-open cascade), the LATEST attempt, the LATEST VALIDATED `smart_mark_results` row, the scheme of the current version (`:286-291` — `order by created_at desc limit 1`, the resolveScheme law), the part's points via `toMarkingPoint` (`:293-300`), and the every-point-decided Allocation join (`:306-321`, fail-closed). Payload: `MarkContext { paperLabel, questionNumber, partLabel, answerText, points[{ref, text, marks, awarded, marksAwarded}], totals }`. Rides karag prepare() step 2.8 (`karag.ts` :424-426); `disclosureTier = markContext != null ? 2 : 1` (:538 — the DC-2 tier law); `TutorContext.markContext` (`karag.ts` :263, `context.ts` :377-383/:420/:472).
8. **Prompt/identity fence** — `services/tutor/prompt.ts` owns the MARK CONTEXT block (:81-84, :270-273, :436) and carries the identity of record (`tutor-grounded/v15`). prompt.ts + PROMPT_VERSION are untouched in this lane. `packages/contracts` has ZERO markContext exposure (census grep empty) — no contracts changes.
9. **Generation seam** — the tutor generator's blocking `generate()` (`karag.ts` :928-965) runs `chain.generate` then the H2 output-hygiene strip (:939-946: "out-of-range citation markers and echoed fence markers never reach the learner; stripping is OBSERVED (T-C40 ③b)" — `sanitizeAnswer` / `StreamSanitizer`, `sanitize.ts` :37/:88). Call sites: `services/cla/service.ts` :947 (FENCE ANCHOR, blocking tutor turn with `tutorContext`), karag :687 (blocking ask path), karag :811 (streaming ask path — `assembleContext` feeds BOTH, so both carry markContext), `routes/teaching-toolkit.ts` :936 (different call shape, no markContext — lint inert there). The CLA surface is blocking-only.
10. **Fence anchors verified on the lane branch** — `apps/api/src/routes/cla.ts` blob `3c2ceb01`, `apps/api/src/services/cla/service.ts` blob `db4573c7` (byte-identical to the of-record anchors). Both stay untouched: the lint hooks INSIDE the generator, which the frozen file already consumes through the deps interface.
11. **Migration protocol of record** — `drizzle/0009_dc3-mark-entitlement.sql`: CREATE-only additive SQL with `--> statement-breakpoint`s, drizzle-kit journal entry (version 7, breakpoints true) + snapshot; gates `db:check` + db `typecheck`; schema README owning-task ledger row (:130 "V2-native migrations (additive-only, post-baseline — owning task ledger)"). Precedents: 0006 class_features, 0008 teaching_toolkit, 0009 entitlement tables.
12. **Logging posture** — tutor services are log-silent; observation rides injected observers/telemetry (the TutorAnsweredEvent `deps.telemetry`, karag :698) and unit pins. The lint's "violations … logged" = a structured per-turn report surfaced as an additive optional telemetry field + pinned unit evidence.
13. **Test layout** — `apps/api/test/tutor/` (stem-hygiene.test.ts is the module-law precedent; tutor-core.test.ts carries the karag pins), `apps/api/test/sme/ingest-flow.test.ts` (ingestion hook precedent), `apps/api/test/ingestion/`. Runner: `bun test` (api suite 2,587 pass / 13 skip / 0 fail of record at DC-7).

## 2. Corrected readings of record (disclosed)

- **R-DC5-1 (sibling table, not columns).** The spec frames the materialisation as "MarkingPoint rows gain `acceptable_alternatives` and `numeric_values` columns". `mark_points` is Flyway-owned and BASELINE_DB §4.1 forbids altering it — a column add would break the running core, the "hardest technical constraint of the whole migration". The baseline-legal translation (§4.2's own mechanism) is a **new v2-only sibling table** keyed to `mark_points`/`mark_schemes`. Every element of the decision survives: materialised ONCE at ingestion, consumed by both generations, carrying the scheme revision (FK to `mark_schemes` — a scheme bump is a new scheme row and the consume seam reads the latest scheme's rows, so both consumers flip atomically).
- **R-DC5-2 (the normalisation law).** "The same normalisation the marker uses" has no deterministic referent in v2 — the marker is the LLM grading over the point text; no marker normaliser function exists of record. The lint's set membership therefore pins a **deterministic canonical-form law of record** (case-fold, whitespace collapse, punctuation-fold, unit/degree canonicalisation) defined and unit-pinned in the module. Disclosed as the honest v2 translation, not a claim about the model's internals.
- **R-DC5-3 (no prompt-side menu in run-001).** The tutor's remediation menu (listing the materialised set to the model) would render through the MARK CONTEXT block in prompt.ts — the identity-frozen file. Run-001 enforces the decision's CONSTRAINT half ("and nothing outside it") at the output seam and leaves the menu-in-prompt to a follow-up tranche that carries its own identity ruling. No acceptance pin requires the menu; the tutor's remediation vocabulary remains the scheme point texts the block already carries (which are the materialisation's own source rows), and the lint strips what drifts outside the set.
- **R-DC5-4 (activation law).** The lint is active exactly on marked-part turns — `context.markContext != null` (the DC-2 tier-2 trigger). Rule A (a claimed-missed point must exist in the scheme rows) is always active there. Rule B (offered alternatives/values must be in the set) is active per point that carries materialised rows; a point with no materialised rows passes through (the set is undefined, the materialisation is progressive) and the pass-through is itself logged — honest telemetry, never a silent gate.

## 3. Scope

**Run-001 delivers**: the `mark_point_alternatives` table (migration 0010, additive-only); the deterministic extraction module (the acceptable-answer surface from point text: accept/allow/do-not-accept/ignore clauses, ora flags, numeric+unit values) shared by both ingestion paths; the additive ingestion hooks (sme ×3 sites, past-paper ×1); the backfill function for existing rows exported and unit-pinned but NOT executed (DB writes are operator-gated workflow events — disclosed residual); the consume seam (mark-context rides materialised rows, fail-open); the conformance lint module beside stem-hygiene (Rules A/B, sentence-granular strip, structured report); karag hooks on both generation paths (blocking post-sanitize; streaming via a sentence-buffered wrapper composed after StreamSanitizer); telemetry field; all acceptance pins.

**Deliberately out of scope (each its own future ruling)**: the prompt-side menu (identity ruling, R-DC5-3); executing the backfill against live Neon (operator-gated); extraction-recall tuning on the live corpus (the backfill census reports coverage when the operator runs it — disclosed as honest telemetry, mirroring the MB4-MS-RATTACH class of residuals).

## 4. Mechanism

### 4.1 Migration `0010_dc5_mark_point_alternatives`

```sql
CREATE TABLE "mark_point_alternatives" (
  "id" uuid PRIMARY KEY NOT NULL,
  "mark_point_id" uuid NOT NULL,
  "mark_scheme_id" uuid NOT NULL,
  "kind" varchar(16) NOT NULL,          -- 'ALTERNATIVE' | 'NUMERIC'
  "value" text NOT NULL,                -- verbatim from the scheme line
  "normalised" text NOT NULL,           -- the R-DC5-2 canonical form (membership key)
  "source_span" text,                   -- the matched clause (provenance)
  "extraction_method" varchar(120),
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_mpa_kind" CHECK ((kind)::text = ANY ((ARRAY['ALTERNATIVE','NUMERIC'])::text[])),
  CONSTRAINT "uq_mpa_row" UNIQUE ("mark_point_id","kind","normalised")
);
ALTER TABLE "mark_point_alternatives" ADD CONSTRAINT "mpa_mark_point_fk" FOREIGN KEY ("mark_point_id") REFERENCES "mark_points"("id") ON DELETE CASCADE;
ALTER TABLE "mark_point_alternatives" ADD CONSTRAINT "mpa_mark_scheme_fk" FOREIGN KEY ("mark_scheme_id") REFERENCES "mark_schemes"("id") ON DELETE CASCADE;
CREATE INDEX "ix_mpa_scheme" ON "mark_point_alternatives" USING btree ("mark_scheme_id");
CREATE INDEX "ix_mpa_point" ON "mark_point_alternatives" USING btree ("mark_point_id");
```

CREATE-only; zero bytes change on any Flyway-era table. Schema README ledger row names this document.

### 4.2 Extraction module — `services/ingestion/acceptable-answers.ts`

Pure, deterministic, zero-IO: `extractAcceptableAnswers(pointText: string): ExtractedRow[]` (+ the normaliser `canonicalAnswer(s: string): string` exported for the lint). Rules (precision-first, each unit-pinned; fail-open — an unparseable point yields `[]`, never a mangled row):
- **E1** acceptance clauses: `Accept` / `Also accept` / `Allow` / `Award…for` → kind ALTERNATIVE rows.
- **E2** rejection clauses (`Do not accept`, `Reject`, `Do not allow`) and `Ignore` guidance are NOT acceptable answers — captured as `source_span` only for the lint's negative vocabulary (an offer matching a do-not-accept row is out-of-set by construction).
- **E3** `ora` / `or reverse` / reciprocal markers attach an equivalence flag to the enclosing clause's row (value stays the clause text; the flag lives in `extraction_method` metadata).
- **E4** numeric + unit tokens (nm/µm/mm/cm/m, °C/K, %, s/min/h, g/kg, cm³/dm³, ×-magnification) → kind NUMERIC rows (value = the number+unit as written).

Hooks (additive lines in the same transaction): after each `mark_points` insert in `services/sme/index.ts` (:441, :500, :510) and `services/ingestion/past-paper.ts` (:496-508), insert the extracted rows. `backfillMarkPointAlternatives(sql)` exports the same law over existing `mark_points` rows (idempotent via `uq_mpa_row`; ON CONFLICT DO NOTHING) — unit-pinned, operator-gated to execute.

### 4.3 Consume seam — `services/tutor/mark-context.ts` (additive)

Beside the existing points read (:293-297), one additive query loads `mark_point_alternatives` for the resolved scheme, and `MarkContextPoint` gains optional `alternatives?: string[]` and `numericValues?: string[]` (verbatim values). Absent rows → fields absent → Rule B inert for that point (R-DC5-4). The resolveScheme law (:286-291) already reads the LATEST scheme, so a scheme bump flips the materialised set atomically — the drift pin's mechanism, no new state.

### 4.4 Conformance lint — `services/tutor/mark-conformance.ts` (beside stem-hygiene)

Pure, deterministic, zero-write: `lintMarkedPartTurn(text: string, ctx: MarkContext): ConformanceResult` where `ConformanceResult = { text, violations: Violation[], stripped: number }`, `Violation = { rule: 'A'|'B', ref: string|null, kind, excerpt }`. Sentence-granular (split on terminal punctuation, evidence-cited grammars, precision-first — ambiguity passes through, never strips):
- **Rule A (point-existence; always active on tier-2 turns).** A sentence that claims a point was missed (miss/not-awarded/no-mark verbs) naming a point identifier → the identifier must match a `MarkContextPoint.ref` (the norm() label law mark-context already uses). Hallucinated identifier → strip the sentence, log.
- **Rule B (set membership; per point with materialised rows).** A sentence offering an alternative/acceptable answer or a numeric value for a missed point (offer grammar: "also accept", "would also score", "is also acceptable", "an alternative", "X would score", numeric+unit offers) with an extractable candidate → `canonicalAnswer(candidate)` must member `{canonical(point.text)} ∪ canonical(alternatives) ∪ numericValues` of the associated point. Out-of-set → strip the sentence, log. Association: the sentence's own ref mention, else the unique unawarded point when exactly one exists, else pass-through (ambiguous → never strip).
- Stripping removes the offending sentences and joins the remainder (mirroring the citation-marker strip's OBSERVED posture); the report is structured, never silent.

### 4.5 karag hooks (additive)

- **Blocking** (`generate()`, after `sanitizeAnswer`): when `context.markContext != null`, `lintMarkedPartTurn(sanitized, context.markContext)` replaces the answer with the linted text; the report rides an additive optional `conformance` field on the telemetry payload (rule counts + refs; no learner text in telemetry).
- **Streaming** (`streamGenerate()`): when `context.markContext != null`, deltas compose through a sentence-buffered wrapper (`MarkConformanceStreamSanitizer`) AFTER the existing `StreamSanitizer` — complete sentences are linted before emission; the tail flush goes through the exact blocking lint. Tier-1 turns are untouched byte-for-byte.

### 4.6 Untouched planes (gate census)

`apps/api/src/routes/cla.ts` (`3c2ceb01`) and `apps/api/src/services/cla/service.ts` (`db4573c7`) byte-identical; `prompt.ts`/PROMPT_VERSION untouched (identity `tutor-grounded/v15`); `packages/contracts` 0 files; Flyway-era tables 0 DDL bytes; smartmark/teachermarking 0 files.

## 5. Acceptance → pins

- **(a) Membership pin** — spec: "a synthetic tutor turn that offers an alternative absent from the set is caught by the lint (unit test on the lint itself)" → `apps/api/test/tutor/mark-conformance.test.ts`: synthetic tier-2 turn, out-of-set alternative offer → Rule B strip + violation logged; in-set alternative passes; unmaterialised point passes through with the pass-through log.
- **(b) Parity pin** — "for a marked part, marker wording and tutor remediation both reference only materialised rows" → extraction test pins that materialised rows derive from the point's own scheme text (marker wording = the source rows); lint test pins the tutor side references only set members.
- **(c) Drift pin** — "bumping the scheme revision changes what both surfaces accept, atomically" → consume-seam test: scheme v1 (alternative set S1) → v2 materialised (set S2); the loader returns S2 for the current version and Rule B flips in the same turn — no dual-read window (single query keyed to the resolved scheme id).
- Plus: extraction unit pins (E1-E4 + canonical law + idempotence), ingestion hook pins (sme + past-paper insert shapes), karag hook pins (tier-2 activation, tier-1 byte-inert, streaming sentence wrapper, telemetry field).

## 6. Battery (on the lane tip, all first-hand)

api pins (new suites) · full api suite (`bun test apps/api packages`) · root typecheck ×4 · `packages/db` `db:check` + `typecheck` · hub tsc · eslint(touched) · prebuild trio · build:hub · fence anchors `git ls-tree` == `3c2ceb01` / `db4573c7` · census: contracts/prompt.ts/Flyway-DDL 0 files.

## 7. Residuals (disclosed)

The live 3,907-row corpus materialises only when the operator runs the backfill (lane ships the law, not the DB write); extraction recall on the live corpus is measured by that run's census, not asserted here; the prompt-side menu awaits its identity ruling; streaming surfaces other than the karag ask path are out of the lint's reach (none carries markContext today — census fact #9).
