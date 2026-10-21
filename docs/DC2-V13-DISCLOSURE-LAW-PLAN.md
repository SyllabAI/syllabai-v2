# DC-2 v13 — the two-tier disclosure law (prereg of record)

**Status**: prereg — committed to main WITH the implementation PR (the
#216/#225/#229/#232/#245 pattern: the plan doc is the PR's diff-of-record anchor).
**Operator ruling of record** (trace `1a15f789c365e9ad`): "Proceed with (a)" —
option (a) of the DC6-FU3-GROUNDING-GAP ruling menu: full v13 implementation
(law + pins + prereg + PR).
**Queue of record**: follow-up 3 of 3 (trace `1a15b3df8fdc0d8d` "1 → 2 → 3
Proceed"); sequencing pins satisfied (`docs/DC6-ASSISTANT-HISTORY-PLAN.md:123`,
`docs/DC6-QUESTION-CLA-HISTORY-PLAN.md:141` — DC-6 landed cleanly as #232/#245).
**Provenance disclosure (the honest label)**: DC-2 of record = "prompt v13
DISCLOSURE LAW" (the P0 two-tier disclosure law; `.syllabai/worklog.md:8659`,
Task 49, agent r4-api-b, session web-77b6eb1d). The law's full text lived in
`SyllabAI-SmartChat-Mark-Design-Spec.docx` — a download-lane artifact lost to
the sandbox resets; no DC task card, no spec mirror and no v13 prereg exists
in-repo (the recovery pass of record is the session worklog
`DC6-FU3-GROUNDING-GAP`). Per the (a) ruling THIS document is authored as the
law text's surviving anchor of record: the text below is authored by this lane
under the operator's ruling, NOT recovered verbatim from the lost spec; the
merge word makes it of record. A future spec recovery supersedes via a dated
new prereg, never by silent edit.

## 1. The law (v13 text, additive to the system-prompt Rules)

> - Two-tier disclosure law. Your own help is Tier 1: explanations, hints
>   and worked reasoning you produce are YOUR OWN teaching — present them
>   as yours, grounded in the SOURCES. The official scheme is Tier 2:
>   mark values, mark-split descriptors and examiner notes may be stated
>   only when the SOURCES carry them, labelled as mark-scheme content
>   (e.g. "the mark scheme gives M1 for ..."). Never present your own
>   worked answer as the official mark scheme, never invent or estimate
>   mark values, scheme splits or examiner wording the SOURCES do not
>   contain, and when the learner asks for the answer or the mark scheme
>   and the SOURCES do not carry it, say so and offer your own worked
>   solution clearly labelled as yours. A QUIZ SCAFFOLD keeps its own
>   rule: answers stay hidden until each question is attempted.

Two tiers: **Tier 1 — the tutor's own teaching voice** (explanations, hints,
worked reasoning presented AS the tutor's own, grounded in the SOURCES);
**Tier 2 — official scheme content** (mark values, split descriptors, examiner
notes) stated ONLY from the SOURCES and labelled as mark-scheme content. The
law TIGHTENS the existing honesty family (evidence-only answers, never fill
gaps, never invent spec references) over the answers/marks class; it gates no
new behavior and removes none. The quiz carve-out keeps the v12 scaffold's
answer-hiding rule supreme in quiz mode (specific rule over general law,
stated explicitly rather than left to reading).

## 2. Scope

**IN**: the `prompt.ts` system-prompt law bullet (both variants — the law
sits in the shared Rules list); `PROMPT_VERSION` "12"→"13" + the
version-history entry; the identity pins (`tutor-core.test.ts` :320,
`cla-service.test.ts` :454 → `tutor-grounded/v13`); the v13 law-presence pin
(the run-014/015 precedent); this prereg.
**OUT (untouched of record)**: karag `prepare()` / `TutorContext.markContext`
plumbing — that is DC-1's marking-context contract, a separate P0 item, not in
this queue; the cla/ask route `routes/cla.ts` (byte-frozen, T-MIG-069/097);
hub `apps/hub/**` (zero bytes); DB (no migration); the quiz-scaffold /
paper-pin machinery (v12/run-015 bytes stand).

## 3. Identity bump mechanics (verified first-hand)

The stamp flows by import: `cla/service.ts:959`, `karag.ts` ×3 and the tutor
index consume `promptIdentity()` — the bump moves every stamped answer's
identity to `tutor-grounded/v13` with ZERO bytes in any consumer file. cla/ask
answers carry the new identity VALUE while the route stays byte-frozen (the
established semantic: the stamp is a regime identifier; v11→v12 moved it the
same way). The engagement-recorder fixture literals ("tutor/v10", "cla/v1")
are injected, not derived — untouched. No golden capture pins the identity
(grep of record, 0 hits).

## 4. Gates (the established battery on the exact head)

root typecheck → bun test apps/api packages (full suites, 0 fail) → hub
`tsc --noEmit` → the v13 law pin + both identity pins → eslint on changed
paths → `next build` (hub byte-untouched; run for the unbroken battery
discipline).

## 5. Risk fences (byte-untouched of record)

`apps/api/src/routes/cla.ts` (the frozen ask) — ZERO bytes;
`packages/contracts/**` and `packages/db/**` — ZERO bytes; `apps/hub/**` —
ZERO bytes; tutor route/session-store files — ZERO bytes. Inside prompt.ts:
the v10 recency note, the v11 law bullet, the v12 QUIZ SCAFFOLD bullet and
the ACTIVE PAPER CONTEXT block are BYTE-VERBATIM — the law is one new bullet;
nothing above or beside it moves. The NOTATION_CHEMISTRY mhchem bullet stays
byte-verbatim across the bump (its comment's identity mention is the only
touched line).

## 6. Disclosed deviations

1. The law text is authored-of-record under ruling (a), not recovered
   verbatim from the lost spec — the provenance paragraph above is the
   honest label; the merge word is the operator's approval of the text.
2. cla answers carrying v13 while the cla prompt body itself is unchanged
   is the established regime-identifier semantic (v11→v12 precedent), not a
   deviation introduced here.
3. The law is conduct-level only: it changes what the tutor claims and
   how it labels it, never the retrieval, evidence, fence or refusal
   machinery — those bytes are frozen by §5.
