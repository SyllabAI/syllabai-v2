# T-MG-MARK-PARITY-1 — MathsGenie marking model: findings dossier + full-parity build plan (plan of record)

**Status**: plan of record — committed to main as the diff-of-record anchor for the T-MG-MARK-PARITY tranche (the DC-7 pattern: plan doc lands WITH or BEFORE implementation PRs; every phase PR cites this doc).

**Lane**: T-MG-MARK-PARITY tranche (6 phase cards, §3). Provenance class: **external read-only competitive analysis** (mathsgenie.co.uk), conducted 2026-10-30 with operator consent and an operator-supplied account (magic-code login, operator-relayed OTP). Method + integrity statement in §0.

**Stack strategy of record (adjudicated)**: **hybrid** — SyllabAI keeps its bespoke `pdf-pane.tsx` v4 viewer (pdf.js 4.10.38, windowed rendering, immutable-cache proxy) as the rendering substrate, and adopts the *model* (normalized-rect regions, mark-point award ledger, crop-then-mark AI pipeline, per-document ink persistence) rather than the MathsGenie *stack* (react-pdf-viewer + tldraw). The annotation-SDK decision (tldraw vs native) is explicitly DEFERRED to a Phase-3 decision gate (§3.3).

## 0. Provenance, method, and integrity statement

**How the dossier was captured.** Five analysis passes over `mathsgenie.co.uk/paper/gcse/maths/edexcel/gcse-maths-2025-june-1ma1-1f` (Edexcel GCSE Maths 1F, June 2025, 20 pages, Pearson print code P76402A0120) and the surrounding application surface:

1. **SSR dissection** — raw HTML (117,525 B) of the paper page: RSC payload asset model, chunk inventory (76 initial), zero iframe/embed/canvas server-side (client-rendered viewer).
2. **Hydrated-DOM ground truth** — headless Chromium: 4 `rpv-core__canvas-layer` + 4 text layers (windowed rendering of 20 pages), `window.pdfjsLib.version === "3.11.174"`, tldraw class-signature + 39 SVGs, full toolbar census (Browse/Select/Text/Math text box/Draw/Erase, pen colour + thickness, Line/Ruler/Protractor/Compasses, Undo/Redo/Clear).
3. **Network observation** — all tRPC traffic captured: `/api/pdf-proxy` fetches, `pdfMarking.getRegions`, batched `user.hasPdfDrawings,pdfMarking.getRegionMarks`, `paperMarking.list`,`paperMarking.listMarkSubmissions` (inputs captured verbatim from URLs).
4. **Client-bundle archaeology** — 196 Next.js chunks downloaded (4.7 MB initial + 48 runtime + 39 marker-route + 33 authed) and grepped: offline-cache procedure Sets (the full mutation taxonomy), the `createMarkSubmission` call site (chunk `1xxw32_5ihqvw.js`), the upload flow (`/api/paper-marking/upload` FormData contract), list-row mutation bindings (`paperMarking.remove` / `removeMarkSubmission`).
5. **Schema oracle** — tRPC zod validation-error probes (single POST, deliberately invalid payloads). tRPC validates input BEFORE the resolver runs; a validation-rejected probe executes NOTHING. Every shape in Appendix A was leaked by the validator this way, including the full `documentRef.type` enum. Existence classification: GET on a mutation → 405 METHOD_NOT_SUPPORTED (exists) vs 404 NOT_FOUND (does not).

**Authenticated pass.** Operator consented to login with their account (`nkhondokar2420136@…`, magic-code flow — first code expired, resend verified). The authenticated session enabled: the classroom paper-marker discovery (`/gcse/paper-marker` → classroom-scoped marker), the marking UI call sites, and — after the operator attempted the paper themselves in-session — first-hand observation of the **live attempt artifacts** (§1.8): their ink layer (`user.getPdfDrawings` → tldraw doc, 17→16 shapes across edits) and their per-region mark ledger (`pdfMarking.getRegionMarks` → 9 marks spanning B1 single-point, cross-part region scoping, and a P1/P1/C1 three-point region).

**Integrity statement.** This analysis wrote NOTHING to the target service beyond the operator's own in-product actions (their attempt, their ink). Zero mutations were issued by the analyst: every probe was rejected at the validation layer pre-resolver (the single role-guard execution — `battle.sheet.markRegion` "only available to student accounts" — mutated nothing and confirmed the account's classroom-owner role). Reads were unauthenticated where possible (`getRegions` is public) and cookie-scoped where required. The account remains the operator's; the session file is retained locally at operator discretion. MathsGenie is a free public revision site; all observed behavior is from its public learner-facing surface.

**Admissibility.** Findings are *schemas and behaviors of a production competitor*, captured first-hand — not speculation. Where a behavior was inferred (not observed), the text says "inferred" and names the evidence. Residual unobserved behaviors are listed in §1.9 with their non-blocker rationale.

## 1. Findings dossier

### 1.1 Stack identification (their side)

| Layer | Technology (observed) |
|---|---|
| Site | Next.js App Router (RSC payload, tRPC v11-style batched SuperJSON, `?dpl=nogit-*` deployments), 76 initial chunks, ~120+ runtime |
| PDF rendering | `@react-pdf-viewer/core` (399 `rpv-core__*` nodes) on **pdf.js 3.11.174** (self-hosted worker at `/assets/dependencies/pdfjs/3.11.174/pdf.worker.min.js`) |
| Annotation | **tldraw** (whiteboard SDK) mounted OVER the PDF; ink lives in tldraw's store, not in PDF annotation objects; 39 SVGs; op-based persistence (`canvas.commit` snapshot + appliedOpIds) |
| Delivery | `assets.mathsgenie.co.uk` CDN, content-hashed filenames (`question-paper-562b3d0f.pdf`), etag + `accept-ranges: bytes`, **no CORS header** |
| Fetch path | Same-origin proxy `/api/pdf-proxy?url=…&tz=UTC` — `cache-control: private, no-store`, sets 1-year `genie_anon_id` cookie, `content-disposition: inline`, re-serves a SMALLER body (664,113 B vs 730,627 B direct → server-side transform per view) |
| AI grounding | tRPC `pdfMarking.getRegions` / `getRegionMarks` + REST `/api/paper-marking/*` |
| Edge | Cloudflare (HKG/FRA pops observed) |

**Reading**: the renderer and the ink SDK are commodities (both bought); the moat is the *model* — regions with normalized geometry joined to a mark-scheme-coded award ledger, and a crop-then-mark discipline that physically scopes what the AI sees (§1.8).

### 1.2 Delivery architecture (their side)

- **Assets**: `https://assets.mathsgenie.co.uk/sources/genie/past-papers/2025/pearson/gcse-maths/1ma1-1f/question-paper-562b3d0f.pdf` — immutable-ish (etag, last-modified), ranged, but NO `access-control-allow-origin` → browser-side pdf.js cannot fetch cross-origin.
- **Proxy**: the viewer therefore fetches via `/api/pdf-proxy?url=<assets-url>&tz=UTC`. Properties: same-origin (solves CORS), `no-store` (zero caching — every view is a fresh transform + a fresh analytics event via `genie_anon_id`), inline disposition, body DIFFERS from the direct asset (smaller ⇒ server-side re-serve/transform). The `tz` parameter carries the viewer timezone (logging/localization, exact use inferred).
- **Cost note**: this is the opposite trade-off from SyllabAI's T-MIG-128 same-origin immutable-cache proxy (our grammar-validated, append-only, cache-forever law). Theirs buys per-view analytics + transform; ours buys cheap repeat views + validator purity. No change recommended — noted as a deliberate divergence.

### 1.3 The documentRef union and the region model

**`documentRef`** — the keying atom of the entire marking model (leaked verbatim by the zod validator):

```
{ type: "printable" | "paper_asset" | "uploaded_paper" | "daily_five_sheet"
        | "collection_worksheet" | "paper_mark_submission",
  id: <uuid>, variant: string }        // variant observed: "pdf"; "mcq" validates, empty result
```

Six document types share ONE region pipeline: official paper assets, user-uploaded papers, printable resources, daily-practice sheets, collection worksheets, and — critically — **paper mark submissions** (an attempt artifact is itself a document that regions can be served over; that is how the `/marked/{id}` view renders).

**`pdfMarking.getRegions`** — input `{ documentRef }` (public, unauthenticated read):

```
{ extracted: bool,            // region-extraction pipeline ran for this asset
  markable: bool,             // per-region AI marking available
  groundingComplete: bool,    // grounding pass finished
  homework: bool,             // asset is homework vs past paper
  regions: Region[] }
```

**Region** (64 on the 1F paper: 26 questions / 38 parts):

```
{ id: uuid,
  kind: "question" | "part",
  regionKey: "1" | "1.p1" | "6.a",     // TWO part conventions: .pN = answer-line parts; .a/.b/.c = labeled sub-parts
  parentRegionId: uuid | null,         // part -> question edge
  label: "1" | null,                   // question parents only
  marks: int | null,                   // parts only
  page: int,                           // 1-based
  rects: [{ x, y, width, height, page }],   // NORMALIZED 0..1, multi-rect supported
  questionPartId: uuid | null,         // DB-link slot — OBSERVED null on live past papers (unwired)
  answersOnFigure: bool,
  markable: bool }
```

**Negative path** (second asset UUID, likely the mark scheme): `{ extracted: false, markable: false, groundingComplete: true, homework: false, regions: [] }` — valid asset, never grounded.

**The `questionPartId` observation is the central finding for SyllabAI**: MathsGenie carries a join slot from visual regions to question-bank parts and leaves it NULL on live past papers — their region identity is NOT joined to their question bank on this surface. SyllabAI's `mark_points` rows already carry `question_part_id` FKs (identity joined, geometry absent). The two systems are exact complements (§1.10).

### 1.4 Procedure surface (observed + validator-leaked)

Queries (read):

| Procedure | Input (validated) | Notes |
|---|---|---|
| `pdfMarking.getRegions` | `{ documentRef }` | public; region model above |
| `pdfMarking.getRegionMarks` | `{ documentRef }` | the caller's award ledger for that document (§1.6) |
| `paperMarking.list` | `{ subjectCode }` | upload-pending rows (kind "upload") |
| `paperMarking.listMarkSubmissions` | `{ subjectCode }` | submissions (kind "marked"), sorted by updatedAt |
| `user.hasPdfDrawings` / `user.getPdfDrawings` | `{ sourceUrl, documentRef }` | sourceUrl REQUIRED (refine "Missing sourceUrl"); drawings keyed by BOTH the source URL and the documentRef — in-app vs external fallback ladder observed in client (`external | wait | in-app`) |
| `user.getProgressForBundle` / `getBookmarksForBundle`, `askGenieChat.getQuickActionOptions` / `getQuestionStarterPrompts` | — | adjacent surfaces, census only |

Mutations (all existence-confirmed; shapes validator-leaked):

| Procedure | Input (validated) | Notes |
|---|---|---|
| `paperMarking.createMarkSubmission` | `{ id, title, subjectCode, paperPdfUrl, markschemePdfUrl; optional paperPdfKey, markschemePdfKey, coverImageUrl, coverImageKey }` | **id = CLIENT-GENERATED uploadId UUID** (idempotency decided client-side) |
| `paperMarking.confirmMarkSubmission` | `{ id }` | finalize |
| `paperMarking.startEndOfPaperMarking` | `{ id }` | whole-paper marking mode |
| `paperMarking.retryExtraction` | `{ id }` | extraction is a retryable server stage |
| `paperMarking.resubmitMarkSubmission` | `{ id }` | re-run |
| `paperMarking.remove` / `removeMarkSubmission` | `{ id }` | list-row deletes (upload rows / submission rows respectively) |
| `paperMarking.regradePartAnswer` | `{ submissionId, questionLabel, answerHtml }` | typed-answer re-mark channel (HTML) |
| `paperMarkBatch.create` | `{ classroomId: UUID, title, subjectCode, markschemePdfUrl: URL, scripts: [{ id, paperPdfUrl, filename }] }` | one MS shared across classroom scripts |
| `paperMarkBatch.retryScript` | `{ submissionId }` | per-script retry |
| `pdfMarking.markQuestionRegion` | `{ regionId, imageDataUrl }` | **the answer is a cropped IMAGE of one region** |
| `canvas.commit` | `{ canvasId, snapshot: object, appliedOpIds: array }` | op-based ink sync |
| `user.savePdfDrawings` | `{ data: object }` | full tldraw doc save |
| `question.markQuestionPartWithAi` | `{ questionId, questionRevisionId, questionPartId, userAnswer }` | question-bank AI marking — **anchored on questionPartId, SyllabAI's own identity key** |
| `question.markDrawingWithAi` | — | drawing-based marking (shape not enumerated; Set membership only) |

Offline-queue classes (client config Sets): `{pdfMarking.markQuestionRegion, battle.sheet.markRegion, canvas.commit}` = queueable-offline; `{user.savePdfDrawings}` = own class; `{question.markQuestionPartWithAi, question.markDrawingWithAi, paperMarking.regradePartAnswer}` = long-running AI (retry: 0).

REST (non-tRPC): `/api/paper-marking/upload` — `FormData{ uploadId, kind: "paper"|"markscheme"|"cover", file }` → `{ url, key }`; `/api/paper-marking/extract-names`, `/api/paper-marking/extract-subject`; `/api/ask-genie`, `/api/ai/`, `/api/essay-marker/upload`, `/api/get-follow-up-questions`, `/api/study-planner/aggregate-topics`.

### 1.5 The upload → submission lifecycle (their "paper marker")

Reconstructed from the live call site (chunk `1xxw32_5ihqvw.js`, marker route) + network observation:

1. **Client generates the submission id** — `crypto.randomUUID()` (fallback timestamp-random). This id IS the `createMarkSubmission.id`. Idempotency anchor is client-side.
2. **File normalization** — paper → `paper.pdf`, mark scheme → `markscheme.pdf`; a `cover.jpg` is derived from the paper's first page (best-effort, null-tolerant).
3. **Three parallel uploads** — `POST /api/paper-marking/upload` as `FormData{uploadId, kind, file}` with kind ∈ `paper | markscheme | cover`; each returns `{url, key}`.
4. **`paperMarking.createMarkSubmission`** — `{id, title: "Marked paper – <en-GB date>", subjectCode, paperPdfUrl, paperPdfKey, markschemePdfUrl, markschemePdfKey, coverImageUrl?, coverImageKey?}`. Client gate: copyright-confirmation checkbox ("I confirm that uploading these materials … doesn't breach any copyright, licence terms, exam-board rules …") is REQUIRED before the flow arms.
5. **Navigate `/marked/{id}`** — extraction runs server-side (retryable via `retryExtraction`); regions for the submission are served through the SAME `getRegions` contract with `documentRef.type = "paper_mark_submission"`.
6. **Marking** — end-of-paper mode (`startEndOfPaperMarking`) or per-region (`markQuestionRegion`); confirm via `confirmMarkSubmission`; re-mark single parts via `regradePartAnswer` `{submissionId, questionLabel, answerHtml}`.
7. **Batch mode** — `paperMarkBatch.create` shares ONE mark scheme across multiple classroom scripts (`scripts[]`), each script `{id, paperPdfUrl, filename}`; per-script retry `paperMarkBatch.retryScript`.

The marker entry point is classroom-scoped: `/gcse/paper-marker` → "Choose a classroom to open its paper marker" → `/gcse/maths/edexcel/paper-marker?classroomId=<uuid>`. Energy economy exists on the account ("20 energy left") — consumption per marking inferred, not observed.

### 1.6 The mark ledger and feedback object

`pdfMarking.getRegionMarks {documentRef}` → `{ marks: Mark[] }`. Verbatim from the operator's live attempt (Appendix B):

```
Mark {
  markId: uuid,
  regionKey: "1.p1",               // joins to Region.regionKey
  regionId: uuid,                  // joins to Region.id
  score: int, maxScore: int,
  markschemeUsed: bool,
  workingBlocks: null | [...],     // structured-working slot (null on single-scribble answers)
  updatedAt: epoch-ms,
  feedbackObject: {
    score, attempt: "full", maxScore,
    chatMessage: string,           // markdown, chat voice ("So it says simplify: …")
    pointsScored: string[],
    pointsNotScored: string[],
    thoughtProcess: string,        // AI TRANSCRIBES the handwritten answer, then reasons against the scheme
    markPointsAwarded: [{ code: "B1"|"P1"|"C1"|…, awarded: bool, workingRef: string|null }],
    strategiesForImprovement: string[] }   // populated ONLY on failed parts (observed)
}
```

Observed codes: **B1** (single-mark correctness), **P1** (process), **C1** (conclusion/communication). A 3-mark region carries THREE award entries in one list — **position-indexed, no per-entry id** (two P1s are distinguishable only by array position). `workingRef` is an evidence-pointer slot (award → the working block that earned it) — null in every observed entry (no structured working exercised yet), but the slot plus `workingBlocks` define the evidence model.

**Doctrine observed (verbatim, 17.p1)**: "the question explicitly requires all working, so the conclusion alone earns no marks" — a factually-correct conclusion with zero shown working scored 0/3, `pointsNotScored` itemized 1:1 against the three mark points, `strategiesForImprovement` gave a 3-step scaffold. This is mark-scheme-doctrine-faithful AI marking, not vibes.

### 1.7 Ink persistence (their drawing layer)

- `user.getPdfDrawings {sourceUrl, documentRef}` → `{data: {doc: {schema: 1, shapes: [tldraw shapes]}}}`. Observed live: 17 shapes (15 `draw` + 2 `text`), 11,148 B; after operator edits: 16 shapes (11 draw + 5 text), 8,740 B — the doc is a living document, edited and re-saved across sessions.
- Shape anatomy: `{x, y, id: "shape:…", dash: "draw", fill: "none", size: "m", type: "draw", color: "black", scale, segments: [{path: "<base64-compressed path>"}]}` — tldraw's native store serialization verbatim.
- Incremental sync: `canvas.commit {canvasId, snapshot, appliedOpIds}` — op-log discipline (applied op ids tracked client-side; offline-queueable per the config Sets).
- Keying: BOTH `sourceUrl` (the proxy URL of the PDF currently open — covers external/user-supplied PDFs with no asset identity) AND `documentRef` (in-app assets). The client falls back down a ladder (`external | wait | in-app`) — drawings attach to whatever identity the document has.

### 1.8 Live attempt transcript (the operator's own attempt, observed first-hand)

All numbers below are from `getRegionMarks`/`getPdfDrawings` reads against the operator's account during the session. Read-only; the attempt itself was the operator's in-product action.

**Pass 1 — Q1–5** (5 marks, 4/5):

| Region | Transcribed answer | Score | Marker verdict (thoughtProcess, condensed) |
|---|---|---|---|
| 1.p1 | "5e" | 1/1 | B1: combined the five e terms correctly |
| 2.p1 | "0.75" | 1/1 | B1: correct decimal for three quarters; working not required |
| 3.p1 | "0.06 cm" | 0/1 | B1 requires 6 cm; mm→cm is divide by 10 |
| 4.p1 | "32" | 1/1 | B1: multiple of 8 between 25 and 35 |
| 5.p1 | "Acute angle" | 1/1 | B1: 53° correctly identified |

**Pass 2 — Q9** (3 marks, 1/3; ledger 8 marks, 5/8): 9.a "x + 5" 0/1 (Katy is 5 years *younger* → x−5); 9.b "3x" 0/1 (*twice* → 2x); 9.c "y = 3" 1/1 (via 12/4). **Region-scoping proof, verbatim from 9.b's thoughtProcess**: "The handwriting in part (a) is outside the scope of this marking." The per-rect crop PHYSICALLY bounds the marker's vision — cross-region leakage is prevented by construction (crop-then-mark), not by prompt discipline. Also: multi-line transcription works even with `workingBlocks: null` (9.c transcribed "y = 12/4" then "y = 3").

**Pass 3 — Q17** (1 region, 0/3; ledger 9 marks, 5/11): `markPointsAwarded = [{P1, false}, {P1, false}, {C1, false}]` — first multi-mark-point region observed. The operator's typed conclusion ("No, not enough milk") was factually CORRECT; all three marks refused under the show-your-working doctrine; `pointsNotScored` itemized exactly three entries (one per mark point); `strategiesForImprovement` scaffolded the full method (scale factor 15÷10 = 1.5 → four ingredient amounts → 300 ml needed vs 250 ml available).

**Ink layer** (both passes): 17 shapes pre-edit (15 draw + 2 text) → 16 shapes post-edit (11 draw + 5 text); compressed segment paths; edits survive round-trips.

### 1.9 Residual unobserved behaviors (non-blockers)

| Item | Why it does not block design |
|---|---|
| M1/A1 codes in the ledger | 1F leans B1/P1/C1; the ledger's `code` field is a free string slot — M1/A1 land in the same shape. Foundation-vs-Higher code distribution is content, not schema. |
| `workingRef` non-null / `workingBlocks` non-null | Slots exist with obvious semantics (award → evidence block). Phase-4 acceptance pins should include an evidence-pointer case from OUR data regardless of when their behavior is observed. |
| Nonzero partial credit (e.g. 1/3) | The ledger supports it structurally (per-point awarded flags; score = Σ). An earned-subset case would only confirm arithmetic already implied. |
| Batch flow live (`paperMarkBatch.*`) | Full input shapes validator-leaked; classroom-scoping observed in routes. Runtime behavior adds nothing structural. |
| `markQuestionRegion` live byte-flow | Input `{regionId, imageDataUrl}` is validator-leaked; the crop pipeline is evidenced by the region-scoping proof (§1.8) and transcription text. Watching the actual upload byte-stream would only size the payload. |

### 1.10 The three-part model and the SyllabAI gap analysis

The MathsGenie marking system decomposes into three joinable planes:

1. **Definition plane** — the mark scheme's atomic awardable units (codes, marks, criteria).
2. **Geometry plane** — normalized-rect regions over document pages, hierarchical (question → part), with a questionPartId bridge slot.
3. **Award plane** — the runtime ledger: per-region `markPointsAwarded[{code, awarded, workingRef}]` inside a feedback object with transcription, doctrine reasoning, and improvement scaffolds.

**SyllabAI today** (verified first-hand at main `8861ea1c`, §2): owns the definition plane (`mark_points`: id, markSchemeId FK-cascade, questionPartId nullable FK, ref varchar(20), ordering, text, marks >0, acceptanceCriteria jsonb, extractionConfidence 0..1) and has ZERO geometry and ZERO award ledger. MathsGenie owns geometry + award and leaves the definition bridge (`region.questionPartId`) NULL on live papers and has no per-award ids.

**The union both sides are missing is exactly the integration point**: `mark_points` identity (ours) ⟕ region rect-grounds (theirs) ⟕ award ledger with evidence refs (theirs) — with per-award ids kept from ours, and crop-then-mark scoping adopted as the pipeline law.

## 2. Grounding census (our side, verified first-hand at main `8861ea1c`)

- **`mark_points` exists and is the definition plane of record** — `packages/db/src/schema/schema.ts:1128`: `id uuid PK`, `markSchemeId uuid FK→mark_schemes ON DELETE cascade`, `questionPartId uuid nullable FK→question_parts`, `ref varchar(20)`, `ordering int NOT NULL`, `text text NOT NULL`, `marks int NOT NULL (CHECK > 0)`, `acceptanceCriteria jsonb`, `extractionConfidence double (CHECK 0..1)`, `createdAt timestamptz`; indexes `ix_mark_points_part (question_part_id)` + `ix_mark_points_scheme (mark_scheme_id, ordering)`. Writers = ingestion services (past-paper, glm-ocr, content-routing, SME bundle); readers = `drill/bank.ts`, `drill/reveal.ts`, content routes.
- **The NEON-DB-LOSS arc closed at 40,645 mark_points** vs the 40,250 peak basis (+395 disclosed) — the definition plane is rebuilt, drained (T-MIG-141 Phase D complete: no_vec 0, 13,765 uniform `gemini-embedding-001`, C1–C9 green), and warehouse-copied (W1 8,202 chunks id-sha-equal). The definition plane is STABLE and is the correct join anchor for geometry.
- **The viewer substrate is pdf-pane v4** — `apps/web` `pdf-pane.tsx` (2,242 lines): windowed rendering (radius 3/6, max 9 canvases, idle sweep), IO tracking, double-buffered swaps, dpr cap 2, two-phase zoom; text side = lazy line indexer → `lib/pdf-lines` → TextLayer + per-pane Ctrl+F; consumers = past-papers QP|MS|Split (4 mounts, active-pause), books rail/pages, citations (lazy). Known gaps of record (from the viewer analysis): zero dedicated tests for `pdf-lines`/`ms-questions`; module-level find registry + never-removed global keydown listener (refactor hazard); books static-imports pdf.js.
- **The delivery substrate is T-MIG-128** — same-origin immutable-cache PDF proxy with grammar validator (unit-tested, host-pinned), `corpus-pdf` route 163 lines. MathsGenie's `no-store` proxy is the deliberate divergence (§1.2); NOTHING in this plan touches T-MIG-128.
- **The award-adjacent event plane already exists** — `ai_mark_events` (learnerId, questionId, attemptId, answerId, questionPartId, markOrdinal, pipelineVersion; unique per learner+part+ordinal) written by smartmark/selfmark/teachermarking, with the graded-evidence seam `createGradedEvidencePublisher` (claim-before-write once-only law) — the DC-7 census fact. The mark_awards ledger (Phase 2) MUST join this stream, not fork it: a region award publishes into the same evidence event spine the progress rings already read.
- **Paper surfaces exist** — past-papers QP|MS|Split; per-paper "Log your mark"; `paperSourceUrl`-style provenance rows on paper records; mark schemes as first-class documents. The inline-attempt surface (draw-on-the-paper + mark-this-region) does NOT exist yet — that is Phase 3+.
- **Identity law** — identity of record `tutor-grounded/v15`; `prompt.ts` / `PROMPT_VERSION` / `packages/contracts` and the fence set (`apps/api/src/routes/cla.ts`, `apps/api/src/services/cla/service.ts`) are ZERO-TOUCH for this entire tranche.

## 3. Build plan (full parity, hybrid stack, six phase cards)

Ordering law: identity before geometry before awards before ink before pipeline before surfaces. Each phase is independently landable and additive-only; no phase modifies a fenced or identity file; every phase's PR cites this doc as its plan of record.

### 3.1 Phase 1 — T-MG-MP-RECT-1: rect grounds on the definition plane

**Goal**: give `mark_points` (and `question_parts`) normalized geometry, closing the identity↔geometry gap both systems share.

- **Schema (additive migration only)**: `mark_point_rects` — `id uuid PK`, `markPointId uuid FK→mark_points ON DELETE cascade`, `page int NOT NULL (CHECK > 0)`, `x/y/width/height double NOT NULL (CHECK 0..1 each)`, `ordinal int NOT NULL DEFAULT 0`, `extractionConfidence double NULL (CHECK 0..1)`, `createdAt timestamptz NOT NULL DEFAULT now()`; unique `(markPointId, ordinal)`; index `(page)`. Multi-rect per mark point (theirs: `rects[]`; ours: rows). NO column added to `mark_points` itself (pure additive side-table — the additive-only law at its cleanest).
- **Region-key law (adopted from theirs)**: `"9" | "9.p1" | "6.a"` — bare question / answer-line part / labeled sub-part. Store as a generated `region_key` ON the rect rows' parent resolution, or on `question_parts` as an additive generated column IF the parts table lacks a stable human key — decision pin at carding time; the DEFAULT is: derive, don't store (keys are derivable from part labels + ordering; storing them invites drift).
- **Backfill**: T-CONTENT-MP-REBUILD-001's corpus already carries per-part provenance; rect extraction for the CURRENT corpus is a SEPARATE content lane (T-MG-MP-RECT-2, content class — page-anchored extraction against the paper PDFs via the existing ingestion services). Phase 1 ships the table + API + a seed subset (one paper family, e.g. the 1F/1H 2025 Edexcel set) to prove the join end-to-end.
- **API (additive router module)**: `GET /api/v1/paper-assets/:id/regions` → the getRegions contract shape (extracted/markable/groundingComplete/regions[]) BUILT from `mark_point_rects` + `question_parts` + `mark_points` joins — SyllabAI's version comes out with `questionPartId` WIRED (theirs is null). Public-read posture (corpus content, zero PII) per the books-blocks precedent; 404 T-C20 on unknown asset; 200 `[]` honest-empty when ungrounded (the negative-path contract, theirs verified §1.3).
- **UI**: pdf-pane v4 gains a `rects` overlay layer (normalized coords → canvas-space per rendered page; render behind text layer; highlight-on-demand only — no always-on chrome). Touch list: one new overlay component + a thin `lib/regions.ts` fetcher mirroring `lib/books-rail.ts` discipline (strict-shape mirror, honest-null, no-store). pdf-pane.tsx itself is NOT modified in this phase (the overlay mounts alongside, not inside — the 2,242-line monolith is not touched until its own refactor lane).
- **Acceptance pins**: (a) join pin — every seeded rect resolves to a live `mark_points` row AND a `question_parts` row; (b) contract pin — API shape byte-matches the §1.3 region model with `questionPartId` non-null; (c) honest-empty pin — ungrounded asset returns the §1.3 negative path exactly; (d) zero-touch pin — Gate 1 + fence census clean.

### 3.2 Phase 2 — T-MG-AWARDS-1: the mark_awards ledger + feedback objects

**Goal**: the award plane — runtime, per-learner, per-region award rows joined to the definition plane, published into the DC-7 evidence stream.

- **Schema (additive)**: `mark_awards` — `id uuid PK` (per-award id — the thing THEIRS lacks), `learnerId uuid FK`, `regionKey text NOT NULL`, `markPointId uuid NULL FK→mark_points` (null when marking free-form regions with no definition join), `documentRefType text NOT NULL`, `documentRefId uuid NOT NULL`, `page int NULL`, `code text NOT NULL` (B1/M1/A1/P1/C1/…), `awarded bool NOT NULL`, `score int NOT NULL`, `maxScore int NOT NULL`, `workingRef uuid NULL` (evidence pointer → `mark_working_blocks.id`), `pipelineVersion text NOT NULL`, `feedback jsonb NOT NULL` (the feedbackObject: chatMessage, pointsScored[], pointsNotScored[], thoughtProcess, strategiesForImprovement[], attempt), `createdAt timestamptz NOT NULL DEFAULT now()`; index `(learnerId, documentRefType, documentRefId)`; unique `(learnerId, documentRefId, regionKey, code, ordinal)` with `ordinal int NOT NULL` (position-indexed duplicates — theirs — PLUS an ordinal so multi-P1 disambiguates).
- **`mark_working_blocks` (additive, Phase-2 optional / Phase-4 exercised)**: `id uuid PK`, `learnerId`, `documentRefType/Id`, `regionKey`, `kind text` (ink | text | structure), `content jsonb NOT NULL`, `createdAt` — the `workingBlocks` slot of record; `mark_awards.workingRef` points here (the evidence-pointer law).
- **Event spine join**: an award write publishes through `createGradedEvidencePublisher` semantics (claim-before-write once-only) — the progress rings see region awards WITHOUT a new event store (DC-7's "never a local counter" law holds).
- **API (additive)**: `GET /api/v1/paper-marks?documentRefType&documentRefId` (the getRegionMarks contract, learner-scoped, auth-gated — user signal/PII posture, userId from JWT context never the wire) + `POST /api/v1/paper-marks/regions/:regionId/awards` (Phase 4's pipeline writes here; Phase 2 ships the read side + seed data from an internal marking dry-run).
- **Acceptance pins**: (a) ledger pin — one region, three award rows (P1/P1/C1), score = Σ awarded, ordinal disambiguates the duplicate codes; (b) evidence pin — an award with `workingRef` resolves to its working block; (c) event pin — an award write emits exactly one graded-evidence event (the DC-7 integration-test pattern); (d) posture pin — read route is auth-gated, userId rides JWT context.

### 3.3 Phase 3 — T-MG-INK-1: the annotation layer + ink persistence (with the SDK decision gate)

**Goal**: draw-on-the-paper with per-document persistence — the inline-attempt surface.

- **Decision gate (carded, not pre-decided)**: tldraw (theirs — ~300 KB+ gz, full tool suite incl. maths instruments ruler/protractor/compasses, op-log built-in) vs native canvas ink on pdf-pane v4 (zero deps, dpr-cap harmonious, but no op-log and maths instruments are bespoke work). The hybrid-stack adjudication keeps this gate OPEN: Phase 3 opens with a one-spike evaluation (bundle cost, dpr-cap interplay with pdf-pane's two-phase zoom, offline queue fit, licence) and lands the verdict as a receipt before any surface code. DEFAULT if the spike is inconclusive: tldraw for ink only (headless mode, our toolbar, not theirs), mounted over pdf-pane v4 — renderer stays ours, ink SDK is bought.
- **Schema (additive)**: `learner_pdf_drawings` — `id uuid PK`, `learnerId uuid FK`, `documentRefType text NOT NULL`, `documentRefId uuid NOT NULL`, `sourceUrl text NULL` (the external-document fallback key — theirs requires it, ours makes it nullable WITH the documentRef refine `sourceUrl OR documentRef` — the "Missing sourceUrl" hard-require is their bug-adjacent rigidity, not a law to copy), `doc jsonb NOT NULL` (tldraw-schema store verbatim: `{schema, shapes[]}`), `revision int NOT NULL DEFAULT 1`, `updatedAt timestamptz`; unique `(learnerId, documentRefType, documentRefId)` (+ allow sourceUrl-keyed rows with null documentRefId via a partial unique index).
- **API (additive)**: `GET/PUT /api/v1/learner/pdf-drawings` (auth-gated; the `{sourceUrl, documentRef}` input pair; PUT carries `revision` — last-write-wins with revision conflict 409, op-log sync is Phase-3+ if the spike picks tldraw; `canvas.commit`-style incremental sync is a stretch pin, not a Phase-3 gate).
- **UI**: ink layer over the past-papers surface only (books/citations excluded — scope honesty); toolbar parity list borrowed from theirs (pen colour + thickness, undo/redo/clear, text boxes); maths instruments (ruler/protractor/compasses) EXPLICITLY deferred to a later surface card (T-MG-INK-2) — high delight, zero schema impact.
- **Acceptance pins**: (a) persistence pin — draw, reload, redraw survives byte-faithfully; (b) fallback pin — external PDF (sourceUrl-only) drawings store and load; (c) perf pin — ink stays 60 fps over the windowed renderer with dpr cap 2 (the spike's central question); (d) scope pin — books surfaces untouched.

### 3.4 Phase 4 — T-MG-CROPMARK-1: the crop-then-mark pipeline (markQuestionRegion equivalent)

**Goal**: the AI marking pipeline with the region-scoping law observed in §1.8 — crop the region rect at render resolution, ship the IMAGE, transcribe, match the scheme, write the ledger.

- **Pipeline (additive service module)**: `services/paper-marking/` — (1) receive `{regionId|regionKey, documentRef, imageDataUrl}` + carry the learner's `mark_working_blocks` context if any; (2) resolve the region → its `mark_points` definition rows (the questionPartId join — our advantage); (3) vision-transcribe the cropped image (the §1.8 law: transcription text IS part of the output, not a hidden intermediate); (4) doctrine-match against `mark_points` text/acceptanceCriteria (prompt-side identity files are ZERO-TOUCH — the marking prompt lives in a NEW module under the additive services band; the `tutor-grounded/v15` identity is untouched and this surface is a NEW identity slot `paper-mark/v1` declared in the new module, not in prompt.ts); (5) write `mark_awards` (+ working blocks) and publish the evidence event.
- **API (additive)**: `POST /api/v1/paper-marks/regions/:regionId/mark` (auth-gated, long-running posture: 202 + poll, retry: 0 per their offline class) + `POST /api/v1/paper-marks/parts/:partId/regrade` `{answerHtml}` (the typed channel).
- **Scoping law (adopted as a TEST)**: crop-then-mark is enforced by an integration pin — a two-region fixture where ink from region A must be invisible to region B's marking (the §1.8 9.b proof, made into our regression test).
- **Acceptance pins**: (a) doctrine pin — correct-conclusion-zero-working fixture scores 0/N with the doctrine sentence in thoughtProcess; (b) scoping pin (above); (c) ledger pin — awards land with per-award ids + ordinals and the evidence event fires once; (d) transcription pin — thoughtProcess begins with the transcribed answer (observed behavior, kept as contract).

### 3.5 Phase 5 — T-MG-UPLOAD-1: the submission flow (createMarkSubmission equivalent)

**Goal**: upload-a-completed-paper → server-side extraction → submission-as-document.

- **documentRef extension (additive)**: `uploaded_paper` + `paper_mark_submission` join our documentRef family (their six-type union is the validated design; we adopt the two we need, keep `printable`/`daily_five_sheet`/`collection_worksheet` UNIMPLEMENTED but reserved in the type union — matching their enum prevents a future migration).
- **Schema (additive)**: `paper_mark_submissions` — `id uuid PK` (client-generated UUID accepted — the idempotency anchor is theirs and it is good), `learnerId uuid FK`, `classroomId uuid NULL FK` (classroom-scoped marker parity), `title text NOT NULL`, `subjectCode text NOT NULL`, `paperUrl/paperKey/markschemeUrl/markschemeKey/coverImageUrl/coverImageKey` (asset rows via the existing object-store seam), `state text NOT NULL` (uploaded → extracting → extracted → marking → marked | failed, retryable per their `retryExtraction`), `createdAt/updatedAt`. Client-side file normalization (paper.pdf/markscheme.pdf naming + cover derivation) mirrored.
- **API (additive)**: `POST /api/v1/paper-marks/submissions` (multipart: two PDFs; copyright-confirmation checkbox is a REQUIRED field — adopt their gate verbatim, it is good law) + `GET /api/v1/paper-marks/submissions?subjectCode` (the two-list contract: upload-pending vs marked, sorted updatedAt) + `POST …/:id/(confirm|retry|resubmit|cancel)` (the four `{id}` verbs, validator-leaked shapes) + `GET /api/v1/paper-marks/submissions/:id/regions` (regions served over the submission-as-document — `documentRef.type = "paper_mark_submission"`).
- **Acceptance pins**: (a) idempotency pin — same client UUID twice = one submission; (b) state-machine pin — every retry verb only fires from its legal state; (c) gate pin — submission without copyright confirmation is a 400; (d) regions pin — a marked submission serves regions through the SAME §3.1 contract with the submission documentRef.

### 3.6 Phase 6 — T-MG-FEEDBACK-1: feedback + progress surfaces

**Goal**: learner-facing surfacing of the ledger — and the DC-7 join that makes it progress-native.

- **UI**: per-region highlight of marked regions on the paper (rect overlay from Phase 1 + award state from Phase 2); a feedback panel (chatMessage rendered as markdown; pointsScored/pointsNotScored lists; strategiesForImprovement on failures only — the observed law); paper-level rollup (5/11 style) on the paper card; "Log your mark" stays for manual entry (untouched).
- **Progress join**: region awards feed the topic tree through the EXISTING evidence rollup (questionPartId → topicNodeIds via question_spec_points/question_topics — the DC-7 census seams). A region award moves the same rings a marked part moves. No new projection.
- **Acceptance pins**: (a) ring pin — a region award advances the topic ring exactly like a marked part (DC-7 integration-test pattern); (b) copy pin — feedback panel renders all five feedbackObject fields with the failure-only strategies law; (c) rollup pin — paper card shows Σ score/Σ maxScore from the ledger, never a local counter.

### 3.7 Post-closure follow-up — T-MG-INK-3: the anonymous local-only ink posture

**Goal**: open the DRAW layer to logged-out learners per the operator's design law of record ("marking = login-constrained; the other tools don't have to be"), without touching any identity-bearing plane. Ruled after the lane closure (five of six phases landed; Phase 5 waived by choice).

- **Posture**: no-token view-mode QP renders the SAME ink surface in LOCAL mode — same toolbar, same maths instruments, same `syllabai-ink/1` doc schema verbatim, persisted browser-side (IndexedDB, ONE store, key = `sourceUrl` — the existing doc-identity law), ZERO server contact (no GET, no PUT, no Bearer, no telemetry). The pill states the posture honestly: "Local only — saved on this device. Log in to sync." Sync mode (token present) is byte-identical to the shipped behavior and never consults the local store.
- **Migration consent law**: login never auto-migrates local ink. An explicit "Upload to account" (union-by-id via the existing `rebaseShapes` law into the fetched server doc, one confirmed PUT — the local doc clears only after the PUT confirms) or an explicit "Discard local" is the only path; dismissal keeps the local doc and re-arms next visit.
- **Scope invariants (re-pinned verbatim)**: mock-mode exclusion (anonymous mock = exam conditions, zero chrome); MS-pane exclusion (QP pane only); region-mark token+paperId gate — anonymous marking stays IMPOSSIBLE and local ink NEVER feeds the ledger; past-papers-QP-only scope (books/citations excluded).
- **Acceptance pins**: (a) zero-contact — anonymous ink makes zero network calls (fetch-spy pinned); (b) persistence — draw/reload survives locally across tab close, quota failure renders an honest error, never a fabricated sync state; (c) migration — consent-gated only, clear-after-confirmed-PUT; (d) zero-touch — zero migrations (packages/db untouched), fences EXACT, pdf-pane.tsx untouched, no learnerId on any local shape.
- **Spec of record**: `.syllabai/tasks/T-MG-INK-3.yaml` (run-001, the spec run — zero code). Implementation is run-002 on a separate operator dispatch.

### 3.8 Post-closure follow-up #2 — T-MG-INK-4: the missing ink tools (math text box, eraser, shape select/move)

**Goal**: close the remaining tool-census gaps against the live MathsGenie paper surface (census of record: 2026-11-01, headless Chromium on the operator-cited 4CH1/2C URL) — MG ships **Math text box** (a MathLive `<math-field>`), **Erase**, and **Select**; ours shipped Pen / Text box / Line / Ruler / Protractor / Compasses with identical colours and widths. Operator dispatch: "spec this as T-MG-INK-4 (carded-not-built, same discipline)" (trace `1a192e6fc58fc1fd`).

- **Container law**: `syllabai-ink/1` stays VERBATIM — the server contract validates the container only (`inkDocSchema.shapes: z.array(z.unknown())`, the elements opaque), so new kinds ride the existing wire with ZERO contract/api/db bytes; the honest-parse boundary (unknown kinds dropped, never a throw) IS the compat law. A container version bump is FORBIDDEN (old clients would `parseDoc → null` the whole doc).
- **Math text box**: new `kind:"mtext"` `{ id, page, color, sizeFrac, x, y, tex }` (KaTeX source, 1..1000 chars), rendered via `katex.renderToString` (throwOnError:false) in a pointer-events:none DOM overlay per `[data-page]` (the InstrumentGuides family), positioned by the normalized 0..1 law; editing = inline textarea (LaTeX source), honest error-styled render for malformed tex. NOT MathLive (bundle/licence discipline — the MG-INK-SDK-GATE verdict stands; katex is already a hub dependency). Disclosed limitation: mtext does not composite into the region-crop marking bitmap this run (the overlay is not canvas pixels); a rasterization card is a named future candidate, never silently assumed.
- **Deletion law (the eraser)**: new `kind:"tombstone"` reusing the TARGET's id — the existing `rebaseShapes` union-by-id law (local-wins on id collision) then makes erasure survive every 409 rebase and migration upload with zero merge-law changes; old clients drop the kind and persist the deletion; undo restores the pre-erase snapshot verbatim; Clear all stays set-replacement (the revision law's single-writer asymmetry disclosed, not changed). Eraser = whole-shape atomic, css-px hit-disc, one commit per gesture.
- **Select/move**: an explicit Select tool — tap hit-test → dashed bbox affordance, drag translates (css-px intent, normalized per-axis at commit), Delete/✕ tombstones the selection, single-shape only (no rotate/resize/multi-select); guides keep their own grips.
- **Painter hardening**: `paintShapes` kind-switch with explicit skip for tombstone/mtext/unknown (the current `else paintText` would throw on an unknown kind — a latent hazard); strokes + text painting byte-identical; the crop composite keeps strokes + text verbatim.
- **Scope invariants (re-pinned verbatim)**: mock-mode exclusion; MS-pane exclusion; region-mark token+paperId gate — anonymous marking stays IMPOSSIBLE and local ink never feeds the ledger; past-papers-QP-only; sync gate preserved; zero migrations; fences EXACT; pdf-pane.tsx untouched; contracts byte-absent.
- **Spec of record**: `.syllabai/tasks/T-MG-INK-4.yaml` (run-001, the spec run — zero code). Implementation is run-002 on a separate operator dispatch.
- **Run-003 — the named candidates discharged** (operator trace `1a193259a20b5271`): (a) **mtext joins the region-crop marking bitmap** — the disclosed run-002 blindspot closes via the named path verbatim: `produceRegionCrop` is async and composites a font-inlined `<foreignObject>` SVG (the SAME `katex.renderToString` output the DOM overlay renders; the KaTeX css collected from the document's own stylesheets with every font `url()` inlined as a data URI — SVG-as-image loads no external resources — cached once per session), drawn after the sync ink pass at the bitmap scale the strokes paint at; every raster failure degrades to the plain-text rendering of the RAW KaTeX source (honest, never silent, never a throw); the sync painter's kind-switch is unchanged (mtext composites only in the crop producer's dedicated pass). (b) **Re-edit of existing text/mtext** — tap an existing box with its OWN tool opens the prefilled inline editor (MG parity; empty-canvas tap still creates); commit replaces the content IN PLACE (same id = the merge key, the newer-intent law — survives every 409 rebase like a move), one commit = one undo step, empty commit cancels, colour/size/anchor untouched (content-only, disclosed). Zero contract/api/db bytes; fences EXACT.

## 4. Lane compliance (gate-by-gate, per phase)

**Branch/PR staging**: one branch per phase run — `t-mg-mp-rect-1/run-001`, `t-mg-awards-1/run-001`, … — each PR titled `<type>(T-MG-<PHASE>-1): run-001 — <summary>` citing this doc. Phases 1–2 are migration-bearing (packages/db) and MUST ride the established migration discipline (drizzle additive migrations, no destructive ops, no renames); Phases 3–6 are API/UI additive modules.

**Gate 1 (identity)**: every PR asserts zero diffs on `prompt.ts`, `PROMPT_VERSION`, `packages/contracts/**`, and the Phase-4 prompt module declares its own `paper-mark/v1` identity INSIDE the new module. Automated check in each PR body.

**Gate 2 (CI double-verify)**: head + merge-commit CI green (verify + hub workflows) before any merge request; docs-only PR (this card) rides the same CI as the canary.

**Gate 3 (scope + fence census)**: every PR's `git diff --stat origin/main` must enumerate ONLY its §3-declared paths; fence census (byte-freeze of `apps/api/src/routes/cla.ts` + `apps/api/src/services/cla/service.ts`) re-run per PR; API-vs-local parity census per the standing battery.

**Gate 4 (mergeability)**: ff-only pushes, fetch-first, no force — the standing push law.

**Gate 5 (merge title form)**: `Merge PR #NNN: T-MG-<PHASE>-1 run-001 — <description>`; merges are OPERATOR-GATED — no R0-auto sweep is authorized for this tranche (the R0-auto boundary remains an open operator question; this plan explicitly claims manual-word merges only).

**Standing ops dependencies (not phase-gated, tracked in parallel)**: PAT rotation (CRITICAL-OVERDUE, unchanged by this plan); the 2 stale-red PRs (#285/#296) are NOT in this tranche's dependency chain.

## 5. Risks and open questions

1. **Copyright/doctrine for AI marking of third-party papers** — MathsGenie gates uploads behind an explicit copyright confirmation; SyllabAI's corpus is licensed content but the UPLOAD flow (Phase 5) brings user-supplied scans — the confirmation gate is adopted verbatim and legal review is a Phase-5 carding prerequisite (OPEN QUESTION for the operator: is user-upload marking in product scope at all, or is Phase 5 internal-tooling only?).
2. **Vision-call cost** — one cropped image per region per marking; a 20-page paper is ~40 regions. Cost model needed at Phase-4 carding (per-region caching by content hash of the crop — their `updatedAt`-per-region ledger implies no caching; we can do better).
3. **Extraction ownership** — their region extraction is a server pipeline (`retryExtraction` exists); OURS could be (a) content-lane precomputation (Phase-1 seed) or (b) on-demand. DEFAULT: precompute in the content lane (deterministic, cacheable, reviewable) — on-demand extraction is NOT planned.
4. **pdf-pane monolith hazard** — the module-level find registry + never-removed keydown listener must NOT receive more global state; the Phase-1/3 overlays are isolated components precisely to keep the monolith freeze-frame until its refactor lane.
5. **tldraw licence + bundle** — the Phase-3 spike must check licence terms for our use and the real gz cost on the past-papers route budget (the hub-bundle-offload work exists; a 300 KB+ gz ink SDK has a home only if lazy-loaded per-surface).
6. **Schema divergence risk** — their `questionPartId: null` on live papers means their region extraction does NOT depend on a question bank; OURS DOES (that is our advantage AND our constraint — regions for papers without ingested parts cannot be markable until the parts land; the honest-empty contract covers it).

## Appendix A — schema index (all captured first-hand; verbatim shapes live in §1)

| # | Shape | Where |
|---|---|---|
| A1 | `documentRef` 6-type union | §1.3 (zod leak) |
| A2 | `getRegions` response + Region | §1.3 (19,036 B payload parsed) |
| A3 | negative-path response | §1.3 (second asset UUID) |
| A4 | 14 mutation inputs (validator-leaked) | §1.4 table |
| A5 | upload FormData contract + `{url,key}` | §1.5 (call site `1xxw32_5ihqvw.js`) |
| A6 | `Mark` + `feedbackObject` + award entries | §1.6 (live attempt) |
| A7 | tldraw doc shape anatomy | §1.7 (11,148 B live doc) |
| A8 | offline-class Sets (procedure taxonomy) | §1.4 (client config) |
| A9 | REST endpoint inventory | §1.4 (client `U=[...]` array) |

## Appendix B — probe log (methodology receipt)

- GET probes: `getRegions` ×3 (1F, MS-UUID, variant=mcq), `getRegionMarks` ×4 (operator account), `paperMarking.list` + `listMarkSubmissions` ×2, `user.getPdfDrawings` ×3 (one 400 "Missing sourceUrl" — the refine discovery).
- POST probes (validation-layer only, all rejected pre-resolver): `regradePartAnswer`, `confirmMarkSubmission`, `startEndOfPaperMarking`, `retryExtraction`, `resubmitMarkSubmission`, `paperMarkBatch.create` ×2 (incl. nested `scripts[0]` element leak), `paperMarkBatch.retryScript`, `createMarkSubmission`, `pdfMarking.markQuestionRegion`, `canvas.commit`, `battle.sheet.markRegion` (role-guard execution only — no mutation), `user.savePdfDrawings`, `question.markQuestionPartWithAi`, `pdfMarking.getZones` (404 NOT_FOUND — oracle control).
- Existence oracle: GET-on-mutation → 405 METHOD_NOT_SUPPORTED = exists (`markQuestionRegion`); unknown path → 404 NOT_FOUND = control.
- Client archaeology: 196 chunks (4.7 MB) grepped; 2 offline-config chunks (`1mxsvx670-tel.js`, `0i6i2zun0oahh.js`) carry the taxonomy Sets; 1 marker chunk (`1xxw32_5ihqvw.js`) carries the lifecycle call sites.
- Zero writes to the target service; the only authenticated mutations in this dossier's timeline were the operator's own in-product actions (their attempt, their ink).
