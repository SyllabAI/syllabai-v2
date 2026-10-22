# DC-4 — Lens Cards as Navigation (prereg of record)

**Status**: prereg — committed to main WITH the implementation PR (the #216/#225/#229/#232 pattern: this plan doc is the PR's diff-of-record anchor).

**Lane**: DC-4 tranche (P1 of the DC roadmap, spec §3.4). Roadmap order of record: DC-3 (merged, PR #294 → `751916cf`) → **DC-4** → DC-7.

**Spec of record**: SyllabAI-SmartChat-Mark-Design-Spec.docx, sha256 `0da8044a0667a47c684d4b0486784be02bc4992546eca2ec2946043e9e2b287a` (byte-verified EXACT against the DC-3 receipt's recorded sha at recovery, 2026-10-22; operator unblock trace `1a163f9f233e8531`, launch word "launch DC-4" trace `1a1640aef2c7e389`). §3.4 extracted verbatim from the byte-verified document.

## 0. The law of record (spec §3.4, verbatim)

> **3.4 DC-4 - Lens Cards as Navigation**
>
> Observed (passes 2-3): the four prompt cards (Definitions, Summary, Pitfalls, Exam help) are fixed entry points that each demonstrate one output grammar - a grounded term list, a bold-led prose paragraph, a quote-then-correction misconception list, a tips hierarchy - and each terminates in a router hook whose target tracks the intent (Flashcards for Definitions and Pitfalls, Exam Questions for Summary and Exam help). The card grid exists only on a fresh thread; after any response the conversation is the learner's to drive.
>
> Decision. The tutor's chat entry ships a fixed lens set per surface, each lens a deterministic prompt template plus one router target: on notes - Define the terms / Summarise / Common pitfalls / Exam technique, routing to flashcards, the quiz scaffold, misconception drilling and exam-question sets respectively; on questions - How to approach this / Why was I marked this, routing to the approach scaffold and (through DC-1) the marking context. Lenses render only on an empty thread; the free-text mode that follows is governed by the existing v12 laws unchanged. Mechanics. A lens is a data row (id, surface, template id, router target), not a code branch; the templates are pinned and golden-tested like the rest of prompt assembly. The quiz-scaffold intent law already demonstrates the pattern for one router target (a quiz-shaped ask serves the paper's own bank rows); lenses generalise the entry point so the learner does not have to know the magic words.
>
> Acceptance. (a) Grammar pins: each lens's output matches its grammar shape on the golden corpus (a Definitions run yields the note's terms with grounded definitions; a Pitfalls run yields quote-then-correction items). (b) Router pins: every lens run terminates in its target hook. (c) Opener-only pin: the lens grid never renders mid-thread.

## 1. Grounding census (what DC-4 extends — verified first-hand at lane open, main `d35dcae8`)

The observed product's opener cards are ALREADY v2-native — the DC-4 delta is the law (data rows + pinned templates + router targets + pins), not new cards:

- Notes surface: `NoteCla` (`apps/hub/src/components/cla/note-cla.tsx`) ships the four cards VERBATIM ("operator spec, verbatim" — the component's own comment) as the inline `QUICK_ACTIONS` const (`:88-121`: Definitions / Summary / Pitfalls / Exam help, modes EXPLAIN|SUMMARIZE), rendered in the empty state only (`thread.length === 0 && !busy`, 2-col grid `:297-315`), each firing `ask(mode, prompt, true)`.
- Questions surface: `QuestionClaOverlay` (`apps/hub/src/components/cla/question-cla-overlay.tsx`) ships two chips (Understand → EXPLAIN whole-question, `understandPrompt` `:377-379`; Approach → HINT targeted, `approachPrompt` `:380-384`), empty state only (`messages.length === 0 && !busy`, `:473-511`).
- Router-target machinery census: flashcards deck route `/courses/[course]/flashcards/[subtopic]` + index; exam-questions route `/courses/[course]/exam-questions/[topicSlug]` + index; the quiz-scaffold intent law (api `services/tutor/quiz-scaffold.ts`, prepare() step 2.7) and the DC-1 marking context (tutor v15 `markContext`) are shipped pipeline laws.
- Cross-surface router precedent: the question help panel deep-links the free tutor as `/tutor?course=…&q=…` (`question-player.tsx:575`, `bootQuestion` seam in `apps/hub/src/app/tutor/chat.tsx:306-313`).
- **No** router/navigation hook exists in any CLA component today; **no** "misconception drilling" or "approach scaffold" pages exist as UI routes; **no** lens/store exists in contracts or db.

## 2. Mechanics (what this PR lands — additive-only, hub-side)

1. **The lens registry** (`apps/hub/src/lib/lens-registry.ts`, NEW) — lenses become DATA ROWS per the spec's row shape (id, surface, template id, router target), with the pinned deterministic prompt templates and the closed router-target vocabulary:
   - `notes` rows (4): `definitions`, `summary`, `pitfalls`, `exam-help` — titles/descriptions/prompts byte-identical to the shipped operator-spec texts (pinned byte-for-byte in tests); router targets per the observed product's mapping of record: Definitions→flashcards, Pitfalls→flashcards, Summary→exam-questions, Exam help→exam-questions.
   - `questions` rows (3): `understand` (in-chat EXPLAIN whole-question), `approach` (in-chat HINT targeted = the approach scaffold; deterministic template over the resolved target, both branches pinned), and **`why-marked`** (NEW card, "Why was I marked this") whose router target is the DC-1 marking context through the tutor deep link `/tutor?course=…&q=<pinned ask>` — the `helpHref` pattern of record. The in-overlay ask cannot carry mark state (the CLA route plane is byte-frozen — `routes/cla.ts` @ `72644a96`), so the deep link IS the honest realisation: the tutor pipeline owns markContext (v15), and DC-1's own fail-open law governs the ask when no marked attempt resolves.
   - Route-kind targets resolve via `lensRouteHrefFor(target, course)`: `/courses/<course>/flashcards` and `/courses/<course>/exam-questions` (index routes; subtopic-scoped resolution would need a note→subtopic-slug join the notes panel does not carry — disclosed residual §5).
2. **The lens grid** (`apps/hub/src/components/cla/lens-grid.tsx`, NEW) — the empty-state card grid as one presentational component (markup byte-identical to the shipped card classes), consumed by both surfaces; `LensRouterCta` renders a deterministic router hook under a lens-originated answer (client-side `router.push`, the panel stays mounted).
3. **`note-cla.tsx`** — the inline `QUICK_ACTIONS` const is replaced by the registry rows (rendered card bytes unchanged); `ask()` gains an optional trailing `lensId` recorded on the user message; after a lens-originated answer the router CTA renders (acceptance (b)).
4. **`question-cla-overlay.tsx`** — the two shipped chips keep their markup bytes; their pinned prompts move to the registry constants/builders (byte-identical) + the new `why-marked` card; new additive `course` prop (passed by `question-player.tsx`).
5. **No** changes: `prompt.ts` / PROMPT_VERSION (identity of record stays `tutor-grounded/v15` — the free-text mode that follows a lens is governed by the existing laws unchanged, exactly as the spec pins), `packages/contracts/**`, `packages/db/**`, both fence anchors, all api routes.

## 3. Acceptance → pins mapping

- **(a) Grammar pins**: the pinned template bytes are the grammar's deterministic carrier — every lens template is byte-pinned (`apps/hub/src/lib/lens-registry.test.ts`), and each rides its existing governed pipeline (CLA modes for the notes/understand/approach lenses; the DC-2 disclosure tier law computes the tier state machine unchanged; the tutor's mark-context law for `why-marked`). Per the R-LLM doctrine, LLM OUTPUT is never golden-gated — the deterministic template + pipeline-law pins are the gates of record.
- **(b) Router pins**: the closed target vocabulary + `lensRouteHrefFor` + the `why-marked` deep-link builder are unit-pinned (including the unknown-lens fail-open → null); the notes CTA renders under lens-originated answers only.
- **(c) Opener-only pin**: both surfaces' grids stay inside the shipped empty-state predicates (`thread.length === 0 && !busy` / `messages.length === 0 && !busy`) — the registry adds no render path of its own; the existing behaviour is preserved byte-for-byte and the CTA renders only in the thread (never in the empty state).

## 4. Battery of record

Root `typecheck` (contracts/shared/db/api); full `bun test apps/api packages`; hub unit tests incl. the new `lens-registry.test.ts`; hub `tsc --noEmit`; hub `eslint` on touched files; `build:hub` full chain (prebuild trio incl. CIE validator + corpus-static + next build). Fence census post-build: `routes/cla.ts` / `services/cla/service.ts` diff-0 vs anchors; `git diff --stat` scoped to the hub plane + docs + receipts.

## 5. Honest gaps & residuals

- The spec's "misconception drilling" and "approach scaffold" router targets do not exist as UI pages and are NOT built by this lane: the shipped realisations are the in-chat governed asks (Pitfalls rides the note-grounded EXPLAIN misconception grammar; Approach rides HINT coaching — both pre-existing), exactly the quiz-scaffold-precedent reading in the law's mechanics paragraph.
- Notes-surface router CTAs resolve to the course index routes (flashcards / exam-questions), not subtopic-scoped decks — the note panel does not carry a subtopic slug; a later note→deck join can tighten this additively.
- `why-marked` deep-links the free tutor; mark context resolves per DC-1's own resolution order (fail-open to the ordinary grounded ask when no marked attempt/pin resolves) — disclosed, not hidden.
- The questions-surface grid becomes 3 cards (Understand / Approach / Why was I marked this); the shipped two cards' bytes are unchanged.
