# DC-1 — The Marking-Context Contract (dated prereg of record)

Task run of record: operator word **"Start DC-1"** (IM trace `1a15fe62c2e2bd2d`, 2026-10-22).
Branch: `dc1-mark-context` from main @ `b536b2c`. PR target: main. Merge is operator-gated.

This prereg is dated and additive; it silently edits nothing. It sits beside
`docs/DC2-V14-SUPERSESSION-PLAN.md` (the DC-2 law of record, merged in PR #269) and
consumes the same recovered spec text of record:
`SyllabAI-SmartChat-Mark-Design-Spec.docx` (sha256 `0da8044a…`, SHA256SUMS receipt at
the lane's recovery preserve).

## 1. The law text of record (spec §3.1, P0014–P0017, verbatim)

> **3.1 DC-1 - The Marking-Context Contract**
>
> Observed (pass 3): when the learner opened the question-surface chat after a mark,
> the assistant received the full marking state - it quoted the submitted answer
> verbatim ("You wrote:"), stated the marks awarded with examiner framing, named the
> missed point explicitly, offered acceptable alternatives with numeric values, and
> synthesised a cross-part comparison on request. The in-card feedback tabs, by
> contrast, coached without any of this detail. None of that chat behaviour is
> achievable unless the mark state is plumbed into the chat's grounding.
>
> Decision. When a chat turn resolves to a question part that has at least one marked
> attempt, the tutor pipeline MUST assemble a MARK CONTEXT block from the marking
> engine's own artifacts - never a re-derivation. The block carries: the part identity
> (paper pin, question number, part label), the learner's submitted answer text
> verbatim, the per-point Allocation list (awarded flag and marksAwarded for every
> point), the MarkingPoint scheme lines in order, and the total. Mechanics. TutorContext
> and AssembleInputs gain a markContext field; karag prepare() gains step 2.8 (after
> the quiz-scaffold step, before context assembly) that loads the latest attempt for
> the referenced part from the smartmark store and projects it through the existing
> toMarkingPoint path. Resolution order follows the existing intent laws: an explicit
> part reference ("question 1c") wins, then the conversation's current part if the
> session has one, else no mark context. Failure is honest: no attempt or a load
> failure degrades to the ordinary grounded ask, exactly like the quiz-scaffold's
> fail-open.
>
> Acceptance. (a) Integration pin: for a marked part, the tutor's first paragraph
> contains the verbatim quote-back and the exact per-point accounting (this is
> directly testable against the pass-3 captures, screens 109-111). (b) Negative pin:
> with no attempt on the part, the ask proceeds without fabrication - the tutor must
> not invent a mark state. (c) Cross-part pin: a two-part comparison ask produces a
> synthesis built only from the two parts' Allocations, in the pattern of screens
> 120-121.

And the spec's own boundary note (P0045, governing):

> DC-1 deliberately loads the LATEST attempt only; the observed cross-part synthesis
> works because each part's latest attempt is exactly what the learner is discussing -
> a history of attempts is a DC-3/DC-5 concern and stays out of the context budget.

## 2. Mechanics mapping (spec span → v2 artifact, all verified first-hand)

| Spec span | v2 artifact of record |
| --- | --- |
| "karag prepare() gains step 2.8 (after the quiz-scaffold step, before context assembly)" | `karag.ts prepare()` — new step 2.8 between step 2.7 (quiz scaffold, :384-398) and step 3 (rank fusion, :400) |
| "TutorContext and AssembleInputs gain a markContext field" | `context.ts` — `TutorContext.markContext?` / `AssembleInputs.markContext?`, propagated in `assembleTutorContext` |
| "loads the latest attempt … from the smartmark store" | NEW `services/tutor/mark-context.ts` loader over the smartmark tables (`attempts` → `answers` → `smart_mark_results`, `question_versions` → `question_parts` → `mark_schemes` → `mark_points`), sql-direct like the quiz-scaffold loader |
| "projects it through the existing toMarkingPoint path" | `toMarkingPoint` (smartmark/index.ts :59) applied to the `mark_points` rows — the frozen projection, byte-identical |
| "an explicit part reference ('question 1c') wins" | the existing fetch-parser intent law (`parseFetchQuery` → qnum + part letter + letter-gated partRoman) |
| "the conversation's current part if the session has one" | NO SUBSTRATE on the tutor pipeline (ruling R2 below) — degrades honestly to the third arm |
| "else no mark context" | `markContext = null` → the ask proceeds exactly as before (fail-open) |
| "exactly like the quiz-scaffold's fail-open" | `.catch(() => null)` advisory posture; the loader never gates an ask |
| the DISCLOSURE TIER 2 co-wiring | the v14 seam's own deferral note (context.ts :373-377): "the tutor surface holds tier 1 until DC-1's part resolution (prepare step 2.8 + markContext)" |

## 3. Scope rulings of record (each disclosed here; none silent)

- **R1 — surface of record.** The spec's named extension point is the karag tutor
  pipeline: the quiz-scaffold step 2.7 it anchors to exists only there. The CLA
  assistant surface shares `TutorContext` but does not run `prepare()`; populating
  markContext on the CLA surface is outside the spec's named mechanics.
  `cla/service.ts` takes ZERO bytes in this PR.
- **R2 — resolution arm 2 degrades honestly.** The tutor pipeline has no
  conversation-current-part substrate (no `currentPart` column exists anywhere in the
  service tree — verified). Fabricating one is the exact defect the v14 prereg ruled
  out ("no fabricated resolution order"). Implemented resolution order: explicit part
  reference → none. Disclosed in the prompt block's own law and here.
- **R3 — paper scope.** An explicit part reference resolves ONLY within the session
  paper pin (`pinPaperId` + `activePaperLabel`). The run-013 ACTIVE PAPER CONTEXT law
  already makes unqualified "question N" mean THIS paper; the spec's block identity
  names the paper pin for the same reason. Unpinned asks fail open. The evidence path
  (resolver, fail-open guard) is untouched — step 2.8 never feeds the SOURCES pool.
- **R4 — reference grammar.** The existing fetch-parser intent law is the reference
  grammar of record: `parseFetchQuery(ask)` binds qnum, part letter (a–h) and the
  letter-gated partRoman; one reference per ask (the parser's own shape — the ask's
  first identity). Row matching: `leadingQuestionNumber(external_ref) === qnum` (the
  quiz-scaffold law); part match tries the row's own external_ref suffix first (the
  corpus stores per-part rows, e.g. "2(a)"), else the current question version's
  `question_parts` labels (normalized: lowercased, parens/spaces stripped; a bound
  roman tries the combined label forms). Zero or ambiguous candidates → fail-open.
- **R5 — latest attempt, validated only.** Latest `attempts` row for
  (learner, question) by `created_at desc`; the answer row for the resolved part; the
  LATEST `smart_mark_results` row with `validation_passed` (the loadFeedbackSource
  law, :885-896). No attempt, no answer row, no validated result, or ANY in-scope
  point missing its breakdown entry → null. The marking engine's own invariant is
  every-point-decided; a partial accounting would violate the exact-per-point
  acceptance pin, so the loader fails open rather than serve one.
- **R6 — block data.** Per point: ref, scheme line text, scheme marks, awarded flag,
  marksAwarded — the Allocation fields the law names, in `mark_points.ordering`. The
  marker's evidence/rationale strings stay out of the block (not named by the law;
  context budget). The learner's submitted answer renders INSIDE the request's fence
  pair (learner data, H2 doctrine); the identity lines, point records and total render
  unfenced (marking-engine artifacts — OUR scaffolding, the QUIZ SCAFFOLD class).
- **R7 — disclosure-tier wiring (the v14 seam lights up).** Step 2.8 sets the tutor
  surface's tier from the spec's own state triple: surface = the tutor chat turn (a
  deliberate act), part marked? = the loader's verdict ⇒ `disclosureTier = markContext
  != null ? 2 : 1`. The CLA surface's of-record predicate (cla/service.ts :945) takes
  ZERO bytes — both surfaces now ride marking state on their own substrate, which is
  the DC-2 consistency property by construction, not by edit.
- **R8 — cross-part acceptance (c).** One reference binds per ask (R4); the observed
  screens 120-121 pattern is a multi-turn conversation. The block's law line makes the
  pin deterministic: comparisons synthesize ONLY from the per-point accounting present
  in this block, in earlier turns of the conversation, or in the SOURCES — never a
  part's invented state. Pinned by prompt-content test.
- **R9 — prompt identity v14→v15.** The MARK CONTEXT block is new prompt content and
  the tier-2 block gains the "or as the MARK CONTEXT block gives them" span: the
  three-piece set is law (spec §3.1 P0016) + run (this task) + trace
  (`1a15fe62c2e2bd2d`). `promptIdentity()` → `tutor-grounded/v15`; history entry cites
  the prereg, the spec sha256 prefix and the operator trace. Never a silent edit.
- **R10 — fences.** ZERO bytes: `routes/cla.ts`, `cla/service.ts`,
  `cla/leakage-policy.ts`, `routes/tutor.ts`, `hub/**`, `packages/**`. The stamps at
  `cla/service.ts:959` and the karag stamps flow by import, byte-verbatim.
  `tutor/karag.ts` IS touched — it is the spec's own named extension point (step 2.8).

## 4. The diff map (planned)

| File | Delta | Content |
| --- | --- | --- |
| `apps/api/src/services/tutor/mark-context.ts` | NEW | `MarkContextPoint` / `MarkContext` types + `loadMarkContext` (the deterministic loader, fail-open) |
| `apps/api/src/services/tutor/karag.ts` | +~20/−1 | step 2.8; `PreparedAsk.markContext` + `disclosureTier`; `assembleContext` passes both |
| `apps/api/src/services/tutor/context.ts` | +~12/−2 | `markContext` on TutorContext/AssembleInputs + propagation (v15 comments) |
| `apps/api/src/services/tutor/prompt.ts` | +~42/−3 | PROMPT_VERSION "15" + v15 history entry; `PromptContext.markContext?`; the MARK CONTEXT block; tier-2 span |
| `apps/api/test/tutor/tutor-core.test.ts` | +~120/−3 | identity pin v15; MARK CONTEXT law-presence; block render pins; step 2.8 pins (resolution, fail-open matrix, tier wiring) |
| `apps/api/test/cla/cla-service.test.ts` | +1/−1 | identity pin v15 |
| `docs/DC1-MARK-CONTEXT-PLAN.md` | NEW | this prereg |

## 5. Acceptance mapping

| Spec pin | Implementation of record |
| --- | --- |
| (a) first paragraph carries the verbatim quote-back + the exact per-point accounting | the block's law line instructs exactly that ("In your FIRST paragraph, quote the learner's submitted answer verbatim … and give the exact per-point accounting"); the data (verbatim answer + full Allocation list) is deterministic pipeline state. Pinned: block content + loader fidelity tests |
| (b) no attempt ⇒ no fabrication | loader returns null on no attempt/answer/validated result; the block is absent; tier stays 1; the ask proceeds byte-identically. Pinned across the fail-open matrix |
| (c) cross-part synthesis only from the Allocations | the block's comparison law line (R8). Pinned by prompt-content test |

## 6. Battery plan (on the exact head, before the PR)

Root typecheck ×4; `bun test` apps/api + packages (expect the pre-existing
classroom/features.test.ts fixed-403 timestamp flake class only, the disclosed
FU2-precedent); targeted pins `tutor-core` + `cla-service`; golden selftest;
retrieval-eval + its selftest; zero-core census gate; hub `tsc`; `next build`;
stamps census; `routes/cla.ts` zero-byte verification. The PR halts at the
operator-gated merge word.
