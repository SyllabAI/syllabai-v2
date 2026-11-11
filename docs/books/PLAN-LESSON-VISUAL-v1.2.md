# PLAN — Lesson Reader Visual Overhaul (WS1–WS7)

**Version:** v1.2 · **Date:** 2026-11-11 (Asia/Dhaka) · **Lane:** t-lesson-visual
**Status:** supersedes v1.1 (NOT recoverable — v1.1 existed only in conversation and was lost to sandbox recycle #5; every attempt to recover it failed: repo docs, `.syllabai/worklog.md` on origin/main, lane-artifacts, task cards, local artifacts all carry no WS numbering). v1.2 is a **first-hand re-derivation**: the surface was re-audited at main `03ff688d` and the lanes re-derived from (a) the surviving operator-approved decisions and (b) the live code. The re-derivation is disclosed per the honesty law; if the operator's remembered numbering differs, each lane is an independent unit and the table below is the numbering of record going forward.

**Surviving operator-approved decisions carried into v1.2 verbatim:**
- Q4 — font stack unchanged (no new faces; the T-HUB-AUDITFIX-1 run-002 house face stands).
- Q5 — reading measure `max-w-[36rem]` + `text-base` ≈ 72ch on the Lesson prose column.
- Nested radius law — child radii step down from the parent radius; one radius voice per surface.
- Motion tokens — durations/easings as tokens, explicit transition lists, `prefers-reduced-motion` respected.
- States checklist — every interactive element carries hover / focus-visible / active / disabled voices.

**Method law (per lane):** branch + PR of record, server-first (no new client boundaries), honest-absent (a lane never fakes data it cannot derive), CI gates (verify + hub) as the gate of record, ledger/worklog bookkeeping per lane. Lanes are independent units — each lands or fails alone.

## The lane table (re-derivation of record)

| Lane | Name | Scope (first-hand findings at `03ff688d`) | Key decisions applied |
|---|---|---|---|
| WS1 | Surface anatomy & nested radius | `BOX_STYLES` 12 box types (`rounded-r-md border-l-4`), learning-objectives box, glossary strip, derived-links strip, badges (`rounded` vs `rounded-md` mixed) — one radius/padding/label anatomy pass under the nested radius law | nested radius law |
| WS2 | Motion tokens | `globals.css` token block gains duration/easing tokens; explicit transition lists on lesson interactive elements; `prefers-reduced-motion` law | motion tokens |
| WS3 | Interactive states checklist | The Lesson reader's interactive set — section-rail anchor links, breadcrumb (Rail / Book shelf), derived "Keep going" links, footer chapter buttons — carries **hover only**: zero `focus-visible` rings (keyboard-invisible focus), no transitions, no active voices. Bring every element to the house states voice (the border-opacity ladder /30 rest · /50 focus · /60 interact and the run-004 focus-ring family) | states checklist |
| WS4 | Reading measure & prose typography | Prose column is unbounded (`article flex-1` in `max-w-6xl` → ~120+ chars/line on wide screens); prose `text-[15px]` off the ladder — apply Q5 measure + `text-base`, Q4 fonts unchanged | Q4, Q5 |
| WS5 | Section rail & progress tracker | The sticky aside (`w-56`) anchor list + `LessonProgressTracker` visual pass | — |
| WS6 | In-lesson widget zones | `LessonInteractive` / `BlockRenderer` check + glossary + video zones visual pass (screenshots of record: download/t-book-026/) | nested radius, states, motion |
| WS7 | Dark-mode parity & final walk | Dark-mode sweep of the lane outputs + full-surface screenshot walk + closing receipt | all |

## Ordering note

v1.2's order follows the surviving decision sequence (radius → motion → states → typography), which is the strongest evidence of v1.1's internal order. The numbering is declared of record from v1.2 forward; lanes do not depend on each other and can land in any order the operator calls.
