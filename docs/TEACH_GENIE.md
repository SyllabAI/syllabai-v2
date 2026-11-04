# T-TEACHGENIE-001 · Teach Genie — the MathsGenie-parity learn-by-teaching surface

**Date:** 2026-11-04 · **Branch:** `feat/teach-genie` · **Operator commission:** "Exactly like
mathsgenie, teach genie feature. Check the attached file. I also want the UI/UX to feel like
this." (chat `97a19c8c-d041-4ae2-9754-07fef634fc42`, 2026-11-04)

## 1. What the attachment is

Eleven full-page captures of **MathsGenie's logged-in "Teach Genie" app**
(mathsgenie.co.uk, saved 2026-10-31, `Teach Genie _ MathsGenie (1–10).zip`). They decode
to six screens and the app's design system:

| Capture | Screen of record |
| --- | --- |
| (3), base | Landing, fresh (typing-dots hero, no history rail) |
| (1), (2) | Landing with preview chat exchanges |
| (10) | Landing + history rail ("+ New Session", Today/Yesterday groups, subject · time-ago, status dot) |
| (5), (6), (7) | Live session ("Objective 1/6 · View learning objectives", End Session, Baby Genie chat, "New messages" pill, mic + Ask-for-help composer) |
| (8) | Session Complete overlay (0/6 objectives, View Session Review / View Chat, read-only chat) |
| (9) | Session review (transcript with purple user bubbles + Strengths / Areas for Improvement / Suggested Practice rail) |

## 2. Design system decoded from the captures (the `.tg-scope` palette)

- **Light:** background `#fff` · foreground `#0a0a0a` · muted `#f5f5f5` · muted-foreground
  `#737373` · border `#e5e5e5` · accent-primary `#cefbff` on `#1cb0f6` (Duolingo blue) ·
  accent-purple (user bubbles) `#e0e7ff` on `#4338ca` · radius `.5rem` ladder.
- **Dark:** background `#191919` · muted `#242424` · border `#333` · accent-primary `#002e5f`
  on `#46cbe3` · accent-purple `#1e1b4b` on `#a5b4fc`.
- **Type:** body Inter; titles Manrope-bold tracking-tight (hub ships Inter; `.tg-title`
  renders Inter bold tracking-tight — the same-foundry sibling).
- **Components:** blue pill CTAs (`rounded-full`), ghost `rounded-xl border-2
  border-transparent` buttons, red ghost End Session, inverted "New messages" pill.

Implementation: `apps/hub/src/app/globals.css` block `T-TEACHGENIE-001` re-points the
**existing shadcn token slots** inside a `.tg-scope` wrapper (light + dark), so the MG look
holds inside any hub theme without forking primitives.

## 3. What was built

### Frontend (new surface, same engine)

- `apps/hub/src/app/courses/[course]/teach-genie/page.tsx` — server page; **unchanged
  flags.json `teachMe` gate** (pilot: `igcse-chemistry-19`); honest "import pending" states
  preserved; renders `.tg-scope` + client.
- `apps/hub/src/components/hub/teach-genie/`:
  - `teach-genie-client.tsx` — landing → picker → session → complete-overlay → review,
    with history/permalink opens (read-only chat + "View review").
  - `landing.tsx` — MG hero (preview chat above the avatar, typing dots before the first
    session), "Learn by Teaching" + Feynman tooltip, blue Start pill, "How it works"
    3 steps, UTC-day-grouped history rail with subject · time-ago · status dot.
  - `picker.tsx` — "Pick up to three from your spec, or describe your own": live
    search-as-description filter over the committed spec tree (grounded canon preserved),
    difficulty + length segmented controls, picked-chips row.
  - `session-screen.tsx` — sticky header card (Back / "Objective N/M · View learning
    objectives" popover / red-ghost End Session with two-step arm), current-objective
    strip, MG chat (bubble-less Baby Genie prose groups, right-aligned muted user bubbles
    at 75%, "New messages" jump pill), MG composer (dictation mic via the tutor
    composer's Web Speech pattern, "Ask for help" popover → course Tutor deep link,
    autosize textarea, blue send pill). Verdict chips render as MG-quiet captions under
    the student's own message (the T-TEACHME-001 chip law, restyled).
  - `complete-modal.tsx` (inside session-screen) — MG (8) overlay: X/N objectives,
    statuses, View Session Review / View Chat over the blurred read-only chat.
  - `review-screen.tsx` — MG (9): transcript + purple user bubbles + "Session ended ·"
    divider + objectives; right rail Strengths (emerald, extractive quotes + turn refs),
    Areas for Improvement (orange, you-said/actually), Suggested Practice cards
    (real course resources only), AI_SUGGESTED disclosure; honest pending card while the
    review generates (3s poll, ~2min ceiling).
  - `baby-genie.tsx` — **original** inline-SVG avatar (no MathsGenie art is copied).
  - `util.ts` + `teach-genie-laws.test.ts` — MG row recipes (time-ago, status dots/labels,
    objective statuses, ended-line), unit-tested.
- `apps/hub/src/app/courses/[course]/teach-me/page.tsx` → permanent redirect to
  `/teach-genie`; course-page tile renamed "Teach Genie" ("Teach Baby Genie" CTA).

### Backend (same fail-closed engine, MG-parity shape)

- `config.ts` — `pupilName: "Baby Genie"`; In-Depth = **6 objectives** (the MG header is
  literally "Objective 1/6") with 8 message slots; LLM-call ceiling 12, token estimate
  ceiling 90k; prompt pins `pupil.v2` / `teachme.turn.v2` / `teachme.objectives.v2`.
- `prompts/pupil.md` (v2) — Baby Genie identity + MG casual voice (lowercase starts,
  contractions, exactly one trailing question); all hard invariants (D2 confusion law,
  no-correction, no-gamification) unchanged.
- `prompts/teachme-turn-v2.md` — persona naming + "3–6 objectives" wording.
- `OBJECTIVES_SYSTEM_V2` (inline) — now also returns `openingMessage`: a topic-aware,
  in-character Baby Genie opener ("i'm a bit muddled about *<picked topics>*…", MG parity).
  Optional in the zod shape → a v1-shaped response falls back to the static opener instead
  of failing the session (availability-safe; judged facts stay fail-closed).
- `service.ts` — opener persisted as the `opening` pupil row; quota/flag copy says
  "Teach Genie".
- `packages/contracts/src/teach-me.ts` — ordinal/coverage/objectives ceilings 4→8.
- `packages/db/drizzle/0025_teach-genie-objectives.sql` — `teach_objectives` ordinal
  CHECK 1–4 → 1–8 (additive, reversible).
- Tests: `behavioural.test.ts` gains the opener law + v2 pins; `config sanity` asserts the
  new shape; fixtures carry the opener + 6-objective In-Depth tree. **22/22 pass**;
  contracts 8/8; hub laws 4/4; `tsc --noEmit` clean; `next build` green with
  `/courses/igcse-chemistry-19/teach-genie` prerendered.

## 4. Verified UX walk (Playwright, contract-shaped mocks, 2026-11-04)

landing → picker (3 picks, Medium, Quick) → session opening (topic-aware opener) →
60-word explanation → judged reply + "Great" caption → End Session (two-step) →
Session Complete overlay (0/3) → View Session Review (strengths/improvements/practice) →
dark-mode pass. All eight states captured and matched against the captures.

## 5. Deltas from MathsGenie (deliberate, disclosed)

1. **No MathsGenie assets.** Their mascot art and brand are theirs; Baby Genie is an
   original same-role character. UX structure, palette and copy patterns are mirrored.
2. **"Describe your own" = grounded search.** MG lets free-text topics leave the spec;
   SyllabAI's evidence doctrine (AI_SUGGESTED, extractive quotes, misconception
   registry) requires the canon, so the free-text box filters the real spec tree instead.
3. **No XP/streak topbar.** MG's gamified chrome is app-level and out of scope for this
   surface; the charter already forbids gamification talk in-session.
4. **No file-upload in the composer** (MG has image/PDF attach) — deferred; the syllabus-
   anchored flow doesn't need it in v1.
5. **Verdict captions stay.** MG shows no judge output in-chat; SyllabAI's honesty laws
   render the chip, so it lives as a quiet caption under the student's message.
6. **Permalinks** reuse the existing `/teach-genie` client state rather than new deep
   routes (MG uses `/teach-genie/:id`); a follow-up can add real permalink routes.

## 6. Rollout

Engine + route ship together behind the existing `flags.json → flags.teachMe` key
(currently `igcse-chemistry-19` only). Wave expansion = flip slugs in that one key, no
deploy. Migration `0025` must be applied to the shared Neon DB before the first In-Depth
6-objective session (the API refuses nothing meanwhile — ordinals ≤4 still pass the old
CHECK, so Quick sessions are safe pre-migration).
