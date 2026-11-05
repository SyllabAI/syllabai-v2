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

## 7. T-TEACHGENIE-002 — the note-driven picker (unit/topic dropdowns)

**Date:** 2026-11-05 · **Operator commission** (chat trace `1a1a84b5cf0e865d`): the picker should
not make users choose spec points — they should choose the **Revision Note of the particular
course**, organized under **unit/topic dropdowns**.

### What changed

- **Picker (`teach-genie/picker.tsx`, rewritten).** The spec-point tree with multi-pick chips is
  replaced by two cascading dropdowns — **Unit** (spec-tree TOPIC, e.g. "Principles of chemistry")
  and **Topic** (spec-tree SUBTOPIC, e.g. "States of matter") — over a single-select list of the
  notes anchored under the chosen topic (the "Covers 4CH1-x.y" mono captions show each note's canon
  codes). The search box keeps the describe-your-own spirit: typing filters notes by title/unit/
  topic text and shows each hit's unit · topic home. Difficulty + length segmented controls, MG
  styling and the AI_SUGGESTED/quota caption are unchanged.
- **Projection (`teach-me/picker-data.ts` `buildTeachGenieNoteTree`, additive).** The SAME canonical
  spec tree every notes surface uses (never a second taxonomy): notes ride the sub-topic their canon
  codes anchor to (`subtopicOfNote` — the notes-index law); notes no code anchors land in an honest
  trailing "Other notes" group; zero-code notes are not offered (they cannot ground a session);
  note-free units/topics are pruned from the dropdowns. The page passes `bundle.curriculum +
  bundle.notes` — the same committed course bundle the Revision Notes index rides.
- **The bridge of record.** The picked note's `specPointCodes` ARE the create request's
  `specPointIds`, sent verbatim. Every engine law stays server-side and untouched: the G1 canon
  gate, the G2 note-corpus gate (the overlap detector already joins `revision_note` on these
  codes), the objectives shape law (every requested code covered by ≥1 objective; no objective may
  cite a code outside the requested set), quota, ceilings, D2/D4.
- **Contract (`packages/contracts/src/teach-me.ts`).** `teachSpecPointIdsSchema` ceiling **3 → 8**:
  a session may now ground on ONE note's full canon code set. The committed 4CH1 corpus carries
  1–4 codes per note (72×1, 27×2, 12×3, 1×4 — all 112 notes place); 8 = headroom for corpus
  growth, aligned with the objective ordinal ceiling (1–8, migration 0025). The old ≤3 wizard
  shape still parses (backward compatible; the legacy `teach-me` wizard compiles untouched).
- **Copy.** Landing "How it works" step 1 and the picker subtitle now describe the note-driven
  flow. The honest empty state (flagged course with no code-anchored notes → "warming up") is
  carried over from the bundle-missing case.

### Bounds

- No DB migration, no API route/service/sql byte changes, no new endpoints — the ceiling move is
  the only wire delta, and `teach_sessions.spec_point_ids` is jsonb (no count constraint).
- The API-side canon gate remains the fail-closed law: a note whose codes lack canon descriptions
  (or a DB note corpus that doesn't index them) refuses honestly with COURSE_NOT_ELIGIBLE — the
  same posture the spec-point picker had.
- MG's own picker keys on their revision-topic list; this delta moves SyllabAI to the equivalent
  unit of selection (one revision note ≈ one MG topic) without importing their taxonomy.

## 8. T-TEACHGENIE-003 — the "Teach SillyAI" rename (feature + persona)

**Date:** 2026-11-05 · **Operator commission** (chat trace `1a1aa68d913fd0d5`): "Rename this
feature to 'Teach SillyAI'. And check end to end if it is working or not."

### What changed

- **Feature display name:** every learner-visible "Teach Genie" string is now **"Teach SillyAI"** —
  page metadata title/description, the honest "not live"/"warming up" cards, the breadcrumb, the
  landing history-rail aria, the session conversation aria, and the course-page tile title/CTA.
- **Persona:** the pupil the learner teaches is renamed **Baby Genie → SillyAI** everywhere the
  learner sees it: landing preview label + typing-dots aria, session speaker names, composer
  placeholder/aria/send aria, the "Ask for help" popover copy, review-screen speaker + pending card,
  the avatar's `aria-label`, picker difficulty hints/legend/waking state, and `config.pupilName`
  (the API's persona of record). Pronouns move with the rename (he → it).
- **Pinned prompts bumped (the pinned-prompt law: bump, never edit):** `pupil.v2 → pupil.v3`
  (charter: identity line + provenance note; voice, probe pattern and all hard invariants byte-carried),
  `teachme.turn.v2 → teachme.turn.v3` (JOB 2 persona naming + output field description),
  `teachme.objectives.v2 → teachme.objectives.v3` (opener persona). The v2 `.md` sources stay checked
  in as pinned history; `scripts/gen_prompts_ts.py` now embeds the v3 files and the behavioural suite
  re-pins byte-equality against them. Review stays `teachme.review.v1` (persona-free).
- **API user-facing copy:** the two fail-closed messages now say "Teach SillyAI" (flag-disabled,
  daily cap). `TEACH_ME_CONFIG.prompts` re-pinned to the v3 trio (the stale `teachme.turn.v1` key —
  unconsumed, contradicting the v2 module since T-TEACHGENIE-001 — is corrected in the same breath).
- **Stale copy fix:** the course-page tile still advertised "pick spec points" after T-TEACHGENIE-002
  moved the picker to revision notes; it now says "pick a revision note".

### What deliberately did NOT change

- **Routes and identifiers:** `/courses/[course]/teach-genie`, the `teach-me` legacy redirect, the
  `teach-me` API module path, `flags.json → flags.teachMe`, the `TeachGenie*` component/contract
  identifiers, `buildTeachGenieNoteTree`, the `tg-*` CSS scope, DB tables and migration 0025's name —
  all internal, zero wire or data delta, untouched to keep the rename reviewable as a copy+prompt change.
- **The MathsGenie parity references** in comments/docs (MG-INK/MG-MARK plans, "MG Teach Genie parity"
  notes) — those describe where the design came from, not the feature's display name.
- **The avatar art** — the original stand-in (no MG IP) stays; re-drawing it for the SillyAI identity
  is an explicit follow-up, not part of a string rename.
- **History:** worklog, task/receipt records, and docs §§1–7 are dated records and stay as written.

## 9. T-TEACHGENIE-004 — the lane rejoins the house design system

**Date:** 2026-11-05 · **Operator commission** (chat trace `1a1ab2fc81bfd909`): "Also the
frontend flow of the Teach me/sillyai, is not like the other pages. Design is not consistent.
Compare with other pages."

### The comparison of record (Teach SillyAI vs the seventeen sibling course pages)

| Dimension | House style (revision-notes, flashcards, exam-questions, …) | Teach SillyAI before this task |
| --- | --- | --- |
| Page chrome | `CourseHeader` hero band: full breadcrumb trail (Home / board / level / course / crumb), extrabold H1, exam-code pill, description, pastel gradient | a two-word `text-xs` line (`Chemistry · Teach SillyAI`); no H1, no trail, no pill |
| Theme | the hub token sheet — SME primary, theme-aware dark mode, every hub theme renders | `.tg-scope` re-pointed the ENTIRE shadcn token sheet to MathsGenie's palette inside the hub shell |
| Colours | tokens only | ~12 inline MG hexes (`#1cb0f6`, `#46cbe3`, `#cefbff`, `#002e5f`, `#1a6fb8`, `#191919`) across five components |
| Type | Jakarta body / Kodchasan display | `.tg-title` forced Inter |
| Shape | hairline `border`, hub radius (0.625rem), `rounded-lg/xl/2xl` | `border-2` everywhere, MG radius (0.5rem), `rounded-full` pills |
| Buttons | house `Button` | raw `<button>` cyan pills |
| Layout | `mx-auto max-w-3xl` narrow column | full-bleed `max-w-6xl` landing, `100dvh` takeovers |
| History | list sections in the column | MG-style left rail with `border-2` dividers |
| Chat voice | tutor: user bubble `bg-muted` + `rounded-br-md`, composer `border bg-card` | purple `.tg-bubble-user` in preview/review but `bg-muted` live — inconsistent even with itself |
| Review | single-column sections as cards | MG two-pane right rail |
| Reachability | every lane has a sidebar row | NO sidebar row — the dashboard tile was the only door |

### What changed

- **globals.css:** the `.tg-scope` token override (light + dark), `.tg-title` and
  `.tg-bubble-user` are RETIRED; `.tg-dot` (the persona's typing dots) survives. §2 above now
  describes where the design came from, not what ships.
- **page.tsx:** mounts the SAME `CourseHeader` hero band and the SAME `mx-auto max-w-3xl`
  column as the sibling lanes (all states — pilot, not-live, warming-up — render under it).
- **landing.tsx:** the MG left rail becomes a house "Recent sessions" list section (still
  absent until the first session); hero/preview/steps re-skinned to tokens; house `Button`.
- **picker.tsx:** house tokens only — accent-primary picked chip, primary pick voice (the notes
  index's active-row wash), house search/select focus voice, hairline list card.
- **session-screen.tsx:** sticky header card, objective strip and complete overlay on hairline
  borders; End Session speaks the destructive voice; the composer adopts the tutor composer's
  house voice verbatim (border bg-card focus-within:border-primary/50, ghost mic, round primary
  send); user bubbles gain the tutor's `rounded-br-md` tail.
- **review-screen.tsx:** the MG two-pane rail becomes the house single column — review card
  (Strengths / Areas for Improvement / Suggested Practice) above a replay that now renders the
  SAME anatomy as the live view; suggested-practice rows speak the house card-hover voice.
- **Reachability:** the sidebar's Learn band gains a "Teach SillyAI" row for flagged courses
  (`hasTeachMe` on SidebarData, computed in the course layout from the SAME
  `teachMeEnabledForCourse` read; absent-when-absent elsewhere). ⚠️ Out-of-fence additive mount
  (course-shell/course-data-context/layout are outside the T-TEACHGENIE fence) — same one-commit
  precedent as the course tile (T-TEACHME-001 run-003 R0), shipped as its own commit for
  ratification.
- **util.ts:** the active status dot is house `bg-primary` (the one MG-hex law test re-pinned).

### What deliberately did NOT change

- **The flow:** landing → picker → session → Session Complete overlay → review, permalinks,
  the objectives popover, verdict chips, dictation, the poll law, quota copy — all mechanics are
  untouched; this was a skin + chrome change.
- **Routes and identifiers:** `/teach-genie`, `TeachGenie*` names, `tg-*` class prefix (dots),
  engine laws, wire — zero delta; the API side is byte-untouched by this task.
- **The avatar art** (persona of record, original stand-in).
- **History:** §§1–8 stay as written.
