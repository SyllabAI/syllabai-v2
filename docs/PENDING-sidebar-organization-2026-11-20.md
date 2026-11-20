# PENDING — Sidebar vs selector organization on the 27 SME-layered courses (+ demo-session note-page bounce)

> Recorded 2026-11-20 · status: **PENDING — one defect fix (P0) + one one-line fix (P1) + one product decision (P2)** · task card: `.syllabai/tasks/T-QA-ORG-001-sidebar-vs-selector.yaml` (status OPEN)
> Evidence: `.syllabai/receipts/T-QA-ORG-001/run-001.json` · full narrative: the QA session's browser-qa report, section "Topic Trees sidebar vs Revision Notes selector — organization audit (2026-11-20)"

## What the learner sees (user-reported, confirmed live on 3 courses)

The user report: *"the Topic Trees sidebar beside any revision note — its organization of notes does not match the selector page's ones."* Confirmed, and quantified — the same course's sections are numbered **three different ways across three surfaces**, and the sidebar undercounts its own course:

| Course | Notes selector | Sidebar beside the note | Exam-questions bank |
|---|---|---|---|
| `igcse-maths-b-16` | **11–20** ("11. Number") | **1–10** ("1. Number") | official-topic sections 1–8 with gaps |
| `cie-a-level-chemistry-25` | **38–74**, double-numbered ("**38. 1.** Atomic Structure") | **1–37** | — |
| `cie-igcse-english-literature-21` | **16–20**, 5 SME sections | **1–15**, genuinely different topics ("Section A: Poetry" ×6 as year-variants) | — |

Sidebar topic "N Revision Notes" metas sum to **93 of 173** notes (lit-21), **70 of 239** (chem-25), **197 of 199** (maths-b) — bridged notes without official homes are invisible in the sidebar's counts.

## Root cause (code — verified at `cb0f9c3f`, re-verified unchanged on the advanced tip `118cbd35`)

- **Selector mirror law** (ADR-039 wave 8, by design): `revision-notes/page.tsx` renders the SME picker layer + `smeRowOfNote` when the course ships the SME layer — "SELECTOR-VIEW ONLY: the sidebar … keep subtopicOfNote's official homes" (`spec-tree.ts:276-308`).
- **Sidebar law**: `topic-tree.tsx` ← `courses.ts:482-489` — `noteSubtopic`/`notesBySubtopic` are always `subtopicOfNote`'s **official spine** homes.
- **Numbering bug**: `spec-tree.ts:210` — `number: sec.order ?? 0` uses the **raw corpus node order**, which continues *after* the official topics. That is why the offset equals each course's official-topic count exactly (10 → 11-20, 15 → 16-20, 37 → 38-74). The official tree numbers by position (`spec-tree.ts:134`).
- ⚠️ `exam-questions/page.tsx:159` also consumes `sec.number` (`smeAllRows`) — fix the field **at the source** and verify **both** selector surfaces in the PR.

## Recommendation — placement and prioritization

**P0 — Fix the demo-session note-page bounce** (R5 hub client + R3/R4 API). In a fresh demo session, opening any note client-side redirects to `/login?next=…` while the **server renders 200** (curl with the same session cookie succeeds). Same failure class as the known `progress` 401. It blocks the demo tour at the product's core page — a visitor cannot read a single note. Fix: client-side auth failure on note pages must **degrade** (hide rings, anonymous state), never hard-redirect when the server session is valid; align the API-side 401 on `/api/v1/learners/me/progress`. No product decision needed — mechanical.

**P1 — Fix the SME section numbering** (R5 hub, one line). `spec-tree.ts:210` → position-based numbering (`i + 1`, mirroring line 134's law) or parse the SME "N." prefix baked into the section titles (both converge for these courses). Effect: notes selector 11–20 → 1–10, aligned with the sidebar and with the exam-questions selector's own numbering; kills chem-25's "38. 1. Atomic Structure" double numbers. Verification in the PR: notes selector + exam-questions bank on `igcse-maths-b-16` and `cie-a-level-chemistry-25` (deeplinks use `?subtopic=<row code>`, not the number — display-only change, but prove it).

**P2 — Product decision: the sidebar mirrors the selector's SME tree on layered courses** (operator decision, then R5 build). On the 27 layered courses **every selector surface is already SME-organized** — notes (wave 8), exam questions (wave 1), flashcards (SME-native deck index). The sidebar is the **lone official-spine outlier**. Mirroring dissolves both the divergence **and** the undercount in one decision: `smeRowOfNote` covers all 2,077 notes with zero leftovers, so the sidebar's per-row counts reconcile automatically. Honest scope note: **not a one-liner** — active-row highlighting (`useActiveSubtopic` reads `noteSubtopic`) and progress-ring keys are official-code-based and need the smeRow mapping + per-row counts (the selector already computes both, so the data path exists). The official spine stays reachable via the existing `/specification` page; non-layered courses (79 of 106) are untouched. **If declined**: corpus placement backfill for the ~598 official-homeless notes (content lane) + spine cleanup — strictly more work than mirroring, and the two surfaces stay inconsistent.

**P3 — Official-spine hygiene regardless of P2** (content lane). Year-variant duplicate topics on the official spine (lit-21 renders "Section A: Poetry" six times, one per 2023/2024/2025 paper variant) hurt the `/specification` page too. Dedup/qualify the titles.

## Reproduction (short)

Demo session → open `/courses/igcse-maths-b-16/revision-notes` (selector reads "11. Number") → open any note → sidebar reads "1. Number". Chem: selector rows "38. 1. Atomic Structure". Lit: 5 selector sections vs 15 sidebar topics. Demo bounce: fresh demo session → click any note → `/login?next=…` (curl with the same cookie on the note URL gets 200). Audit scripts live in the QA session workspace (`scripts/sidebar_audit.sh`, `scripts/extract_orgs.py`).

## Related open QA defects (separate lanes — recorded for completeness, not part of this card)

1. `GET /api/v1/learners/me/progress` → 401 for an authenticated demo session while agenda/courses return 200. *(same class as P0 above)*
2. React #418 hydration mismatch on `/dashboard` (1 per load).
3. `syllabai.com` parked for sale on GoDaddy (old brand domain lapsed).
4. `/sitemap.xml` 404 and no `Sitemap:` in robots.txt.
5. Stale marketing count "94 courses" (actual 103 layered / 106 listed).
6. `GET /api/v1/editor/me` → 403 auto-fired on course pages (gate it client-side).
7. **Note pages client-bounce to `/login?next=…` for a fresh demo session** (server 200 via curl with the same cookie) — new in this audit; escalated to **P0** above.
