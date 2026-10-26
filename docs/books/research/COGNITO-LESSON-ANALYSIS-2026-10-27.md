# Cognito Lesson-Page Analysis — 4CH1 parity & adoption census (2026-10-27)

> Provenance: operator-provided URL (https://cognito.org/courses/gcse/chemistry-triple/iedexcel/notes/T2pCRmZTc3A/1.6-elements-compounds-mixtures),
> analyzed at trace 1a179adedb4682cd. Operator framing: "Their lessons are also
> similar … We can adopt things from them. Analyze. Then report everything to the
> self improving docs." Companion findings: **f-0038** (serve-plane audit miss —
> flashcards/exam-questions integration already shipped via T-BOOK-033) and
> **f-0039** (feature-gap census, open). Sibling research: `KOGNITY-DOSSIER-2026-10-20.md`.
> Sourcing caveat: textual fetch render — the video-player internals are inferred
> from rendered page text (timestamps, "Show timestamps"); re-verify interactively
> at build time.

## 1. What was analyzed

One Cognito notes page for **Edexcel IGCSE Triple Chemistry**, spec point **1.6 —
Elements, Compounds & Mixtures**, fetched 2026-10-27. Cognito organizes its course
by exact spec-point addresses (same scheme as our chapter spine + specCodes join),
which is the single most important convergence: our addressing discipline is the
industry-correct choice, and their page is the closest public analogue to our
Kognity-style lesson.

## 2. Page anatomy of record (ordered inventory)

1. Top nav + course context ("Edexcel IGCSE Triple").
2. Table of contents — 3 sections: *Elements, compounds and mixtures / Molecules /
   Classifying substances*.
3. Spec-addressed heading "1.6 - Elements, Compounds & Mixtures".
4. Three note sections — short bullet-style explanations.
5. Comparison table (substance classification: He, O₂, H₂O, …).
6. Key terms definitions block.
7. **"Key points to remember" — interactive checkboxes with a Reset button**
   (per-account persisted state).
8. "Common mistake" callout (capital letters in chemical formulae).
9. **"Take a quiz" + "View flashcards" links** (their assessment loop entries).
10. **Course video embed with per-section timestamps** (0:07 / 2:00 / 3:43 / 4:56,
    "Show timestamps" toggle) — the notes are video-anchored.
11. Next-topic navigation ("1.7 - Purity") + back-to-top.
12. Course-fit indicator ("4 of 4 sections match your course").
13. Non-instructional: free-account promo banners, cookie consent.

## 3. Mapping Cognito ↔ SyllabAI (pack block types + hub serving surface)

| Cognito element | SyllabAI counterpart | Verdict |
|---|---|---|
| Spec-point page addressing (1.6) | chapter spine + specCodes exact join (T-BOOK-033) | **parity — validates our scheme** |
| Note sections (bullets) | `prose` blocks, lesson-prose@2.0.0 textbook voice | ours denser / textbook-grade |
| Comparison table | `table-fill` (interactive, ms-validated cells) | **ours stronger** |
| Key terms block | glossary.yaml + `ms_accepts`/`ms_avoids` mark-scheme layer | **ours stronger** |
| "Common mistake" callout | `callout` (examiner-language, exam-hint class) | parity / ours stronger |
| Key-points checkboxes (persisted) | static `can-you…` callout | **GAP** |
| "Take a quiz" (self-authored questions) | `mcq-embed` + Exam-questions chips → **real past-paper topics** | **ours stronger** |
| "View flashcards" (static deck link) | SRS flashcards (deck-player, due badges, review scheduler) | **ours stronger** |
| Video embed + timestamps | `media-embed` — honest-empty fleet-wide | **GAP** |
| Next-topic nav (1.6 → 1.7) | lesson-view back-links only (grep 2026-10-27) | **GAP candidate** |
| "N of M sections match your course" | derivable from spec-join at serve time | GAP (cosmetic) |

## 4. Adoption candidates (decision table)

| # | Candidate | Vehicle | Law-compliance path | Status |
|---|---|---|---|---|
| 1 | **Cognito video embeds** (spec-mapped, with timestamps) | `media-embed` sources manifest per lesson | BOOK-PACK-SPEC lint law 4 (media-embed requires a licensing row or fails); ADR first for manifest schema; youtube-nocookie embed, suggestions off, per-video specRefs + checked-date + replacement policy | **Operator-endorsed — pilot 1 lesson.** Trade-offs of record: competitor brand inside our lessons, YouTube attention leak (mitigate: constrained nocookie player), link rot (mitigate: re-verify gate + replacement policy) |
| 2 | **Key-points checklist block** (persisted, per-student) | New 12th block type or `callout` payload extension; state joins the chapter_progress family | BOOK-PACK-SPEC §4: payload change / new type = **ADR first** | **Proposed — operator ruling needed.** Cheap, high UX-parity value |
| 3 | **Next/prev lesson nav** | hub `lesson-view` (serving-surface change, zero pack bytes) | derive strictly from spine order (u1-c01…c29); honest-absent at unit boundaries | **Proposed — verify existing surface first (audit item for next lane)** |
| 4 | Course-fit indicator | hub, spec-join derived | honest-absent law | **Deferred** (cosmetic) |

## 5. What we hold that Cognito does not (differentiators of record)

- **Real past-paper-derived exam questions + mark schemes** — Cognito's quiz is
  self-authored; the Kognity dossier documents teachers explicitly demanding
  past-paper practice. Our canonical corpus is the direct answer.
- **Mark-scheme language layer** (`ms_accepts`/`ms_avoids`) + Smart Mark method
  credit — Cognito has no marking model at all.
- **PhET CC-BY sim embeds** (`sim-embed`) — no equivalent on the Cognito page.
- **Richer interactive set**: `eq-builder`, `drag-label`, `num-stepper`,
  `sort-match`, `table-fill` vs their bullets + checkboxes.
- **SRS flashcards with due scheduling** vs a static deck link.
- **Honest-empty + exact spec-join laws** — we never fabricate a link or
  fake-fill a media block; both Cognito patterns are denser but unprincipled
  by comparison.

## 6. Positioning note (voice — do NOT adopt)

Cognito is **video-first with bullet-density notes**; SyllabAI lessons are
**textbook-grade prose** (lesson-prose@2.0.0, "The Lesson IS the textbook").
That is a different learning-mode contract, not a defect. Adoption should copy
their **interaction patterns** (checklist state, video anchoring, next-nav) —
not dilute our prose density or restructure around a video rail.

## 7. Follow-ups

1. **f-0039 stays open** until the operator rules on candidates 2/3; candidate 1
   pilots through an ADR draft in the next books lane (next free T-BOOK-066+;
   verify numbering at lane start — T-BOOK-065 is taken by the merged doctrine PR #172).
2. **f-0038's playbook bullet** ("serve-plane audit before proposing platform
   work") is a one-line PR candidate against BOOKS-START-HERE / BOOK-BUILD-PLAYBOOK.
3. Re-run this census if Cognito's page anatomy changes; the analysis is a
   point-in-time fetch (2026-10-27), textual-render caveats in the header.
