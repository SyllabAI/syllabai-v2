# ADR-BOOK-0005: the rail retires from the book PDF viewer — the Lesson is the sole interactive surface

| | |
|---|---|
| **Status** | ACCEPTED (operator directive of record, trace `1a17cb69e4100d49` — *"The 'Interactive rail' … that can be seen beside the book pdfs, I wanted all of it moved into the lessons"* — reasserted 2026-11-03: *"remove the interactive rail from the book pdf, and add and seamlessly integrate them into the course lessons"*) |
| **Date** | 2026-11-03 |
| **Lane** | T-BOOK-071 |
| **Supersedes** | ADR-BOOK-0003's retention clause ("The rail viewer stays unchanged as the page-true PDF companion — one substrate, two renderers, both fully interactive"); the residual two-pane posture of ADR-BOOK-0001 §5 |
| **Extends** | ADR-BOOK-0003 decisions 1–2 (inline join law, media display law — both unchanged and now load-bearing); ADR-BOOK-0001 §3 serving law (unchanged); T-MIG-133c/133e pure mount law (restored in full) |

## Context

ADR-BOOK-0003 (T-BOOK-026) implemented the operator's lesson-flow order as a
**half-measure**: the rail's blocks went INTO the lesson reading flow
(authored `blockIds` win → derived spec-fill → honest extras; videos play
inline), but the implementation deliberately kept the two-pane rail mounted
beside the PDF — "one substrate, two renderers, both fully interactive."

The operator's directive of record never asked for two interactive surfaces.
Reasserted on 2026-11-03: remove the rail **from the book PDF page**; the
interactive elements live **in the course lessons, seamlessly integrated**.
The 4CH1 lesson surface already carries the full integration (29 sections
render `LessonInteractive` inline; the 28 media embeds play in-flow via
youtube-nocookie), so the only unbuilt half was the removal.

## Decisions

### 1. The chapter viewer returns to the pure page-true mount

`/courses/[course]/books/[docId]` renders the 133c/133e PDF pane **only**:

- no `fetchBookRailBlocks` call, no `railOn` gate, no two-pane shell;
- the page-true laws are restored verbatim: `?chapter=` opens the chapter
  slice, `?page=N` is the citation drill-in, `?part=questions` still resolves
  through the unchanged pure mount law, unknown/not-validated 404s
  identically (T-C20);
- **deleted as dead code:** `rail-workspace.tsx` (the two-pane shell) and
  `tutor-card.tsx` (its only consumer). The rail **component substrate**
  (`block-renderer.tsx`, `glossary-chips.tsx`, `check-shared.tsx`, the 12
  widgets) is NOT deleted — it is the lesson's rendering engine
  (`lesson-interactive.tsx` composes it).

### 2. The Lesson is the sole interactive surface — and is discoverable from the viewer

The viewer's Lesson affordance is promoted from a ghost text toggle to a
visible highlighted chip (`Sparkles` + "Lesson", `variant="secondary"`):
with the rail gone it is the **only** interactive hand-off, and
ADR-BOOK-0003 already names the lesson "the student's PRIMARY year-round
learning mode". The T-C20 visibility law is unchanged: the affordance
renders only when the chapter's pack is student-visible, or under
`?preview=1` for the operator.

### 3. Page-true anchoring survives the retirement

Lesson blocks' `pdfPageAnchor` deep links land on the viewer
(`?chapter=&page=N`) — still meaningful and unchanged, because the viewer is
the page-true PDF of record. Tutor citations, revision-note links and the
shelf TOC all resolve through the same mount laws as before; nothing outside
the chapter viewer changes.

### 4. Serving law untouched; the DB is NOT re-flipped

Blocks remain bound by ADR-BOOK-0001 §3 (book VALIDATED AND pack VALIDATED);
the api serves the same stream — the lesson consumes it exactly as before.
`book_blocks` rows, packs, and the `rail` naming of the wire contract
(`books-rail.ts`, `RailBlock`) keep their names: this ADR retires a
**presentation plane**, not the substrate. Renaming the wire would be churn
with no operator value; the header comments of record state the lesson is
the sole interactive renderer.

### 5. Progress continuity

`chapter_progress` (T-BOOK-067) keeps its single-row-per-chapter law; the
lesson tracker remains its writer/reader. Rail-era progress rows carry over
unchanged — the lesson renders the same rows, so no migration and no
backfill.

## Consequences

- The viewer page loses ~90 lines of rail plumbing and regains the exact
  pre-T-BOOK-003 geometry — students who only want the PDF see a pure PDF.
- Any future "rail" product concept must come back through a new ADR; the
  lesson is the interactive plane of record for the interactive book.
- The tutor-card surface (rail-side ask-the-tutor) is retired with the
  shell; the lesson and the main tutor surface remain the ask lanes.
