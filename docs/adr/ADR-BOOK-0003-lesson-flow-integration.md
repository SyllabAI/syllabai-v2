# ADR-BOOK-0003: lesson-flow integration — the interactive elements live INSIDE the lesson

| | |
|---|---|
| **Status** | **ACCEPTED** (2026-10-27) — operator order of record, trace `1a17cb69e4100d49`: *"The 'Interactive rail' … that can be seen beside the book pdfs, I wanted all of it moved into the lessons. Integrated inside the lesson … instead of showing cognito link, cant you give the actual youtube video link? Videos will also be inside the Lessons flow."* Implementation = T-BOOK-026 (this trace). |
| **Band** | `T-BOOK-xxx` (interactive books) |
| **Task** | T-BOOK-026 |
| **Date** | 2026-10-27 |
| **Basis** | ADR-BOOK-0001 (the rail, §5 two-pane law — superseded below); ADR-BOOK-0002 (media-embed embed law — display amendment below); T-BOOK-033 lesson surface (`books/[docId]/lesson`, `LessonView`, pack grammar `blockIds`); LESSON-PLAN-4CH1 §4 (derived-links law, untouched) |
| **Supersedes** | ADR-BOOK-0001 §5's two-pane layout law for the chapter surface (the "rail, not rewrite" product posture) — the lesson becomes the primary integrated flow; ADR-BOOK-0002 decision 3's **display** clause (provider-page CTA) as specified in decision 2 below |

## Decision summary

The **Lesson** surface (`/courses/[course]/books/[docId]/lesson`) renders the
chapter's VALIDATED rail block stream **inline inside the authored lesson
sections** — prose, figures, callouts and every interactive widget
(sort-match, drag-label, table-fill, num-stepper, eq-builder, mcq-embed,
sim-embed, media-embed) appear in the reading flow at their spec-anchored
point, with the video playing **inside the lesson** (youtube-nocookie player,
"Watch on YouTube" link). The rail viewer stays unchanged as the page-true
PDF companion — one substrate, **two renderers, both fully interactive**.

## Decisions

### 1. The join law: authored `blockIds` win; derived spec-fill; honest extras

The pack grammar already carries the placement field of record: a lesson
section's `blockIds` lists exact rail block ids (the T-BOOK-066 authoring
precedent: `u1:c01:s02` → `c01-states-and-solutions/b08`). The join
(`apps/hub/src/lib/lesson-blocks-join.ts`, pure, test-pinned):

1. **Authored placement WINS** — a claimed block renders in its authored
   section, exactly where the pack placed it.
2. **Derived fill** — every unclaimed block lands in the FIRST section (pack
   order) whose `specRefs` intersect the block's `specPointRefs` (both sides
   carry BARE officialCodes — the `books-lesson-links` grammar). This is the
   "all of it in the lessons" law: the whole VALIDATED fleet (178 blocks /
   29 chapters) integrates without waiting on pack authoring.
3. **Honest extras** — a block with no authored home and no spec intersection
   rides an "Interactive extras" section at the lesson's end; nothing is
   silently dropped, nothing invented.
4. Within a section, merged blocks sort back to `ord` order (reading flow).
   Deterministic in/out — SSR-stable (the `books-lesson-links` law).

### 2. media-embed display amendment (video-first)

- A resolved `youtubeId` renders the **youtube-nocookie player inline**
  (embed law unchanged: rel=0, no autoplay, lazy, title attr) plus a plain
  **"Watch on YouTube"** link — the provider-page CTA ("Watch at the
  provider") **leaves the card**. The Cognito page remains the data-of-record
  in `meta/media-sources.yaml` and the block payload (curation + licensing
  law untouched); it is simply no longer the displayed affordance.
- Attribution text stays in-card (licensing law); the provider-link card
  remains ONLY as the no-`youtubeId` fallback.

### 3. What carries over byte-for-byte

- **Serving law (ADR-BOOK-0001 §3 / T-C20):** unchanged — the api's DOUBLE
  gate (book VALIDATED AND pack rows VALIDATED) is the only source of blocks;
  honest-null/empty → the lesson renders exactly as before (no blocks, no
  fabrication); unknown/unvalidated book → 404 identical.
- **Widget behavior:** byte-identical (the same `BlockRenderer` of record);
  the T-BOOK-008 check lane (server-verdict submits) and T-BOOK-007 glossary
  lane dedupe per chapter at module scope (one wire fetch per chapter, N
  section instances).
- **Page-true anchoring:** a block's page affordance deep-links to the rail
  viewer's `?chapter=&page=` (the 133d citation drill-in) — the lesson never
  hosts the PDF itself; the rail remains the page-true companion.
- **The rail viewer is untouched** — same two-pane shell, same laws. The
  lesson gains the integrated flow; nothing is removed from the reader.
- **Zero API/contracts/DB changes** — hub-only (2 new files, 3 edits, 1 test
  file). `chapter_progress` remains the rail's signal; a lesson-side progress
  surface is a deliberate non-goal for this ADR (follow-up if ordered).

## Consequences

- The Lesson becomes the student's primary integrated surface: read, watch,
  practice in one flow — the Kognity-style parity the pilot targets.
- Packs author finer placement incrementally via `blockIds` (authored wins)
  without any code change; the derived fill keeps unauthored chapters rich.
- The lint law (G4) is untouched; no pack bytes change under this ADR.
