# T-TEACH-REPORTS-1 run-001 — /teacher/reports (Phase 3: reports & exports)

**Date:** 2026-11-05 · **Lane:** T-TEACH-REPORTS-1 · **Branch:** `t-teacher-reports-1/run-001` (cut @ main `a40e0db4`, CI 2/2 green)
**Operator order:** "Okay, proceed" (chat trace 1a1a7c9d0d12c755), executing the approved fix queue; this was the only queue item left lane-less after the parallel lanes closed #706, #713 and the UX P1/P2 batch (verified first-hand against main `a40e0db4` before the cut — zero collision: the fix-status matrix in UX_AUDIT_REPORT.md, the #724/#762 merges, and the open-issue scan).

## 1. Shipped of record

`/teacher/reports` — the Phase 3 "Reports & exports (per student, per class, term view)" slice, composed ENTIRELY client-side over the two existing read-only aggregation views (`GET /api/v1/teacher/class/overview`, `GET /api/v1/teacher/class/learners` — the exact wire shapes the Class insights page renders; TEACHER/ADMIN-gated at the router shell AND per-handler). Zero new API surface, zero engine surface: a report is a deterministic function of the same live evidence, so the two surfaces can never disagree.

| File | Change |
|---|---|
| `apps/hub/src/lib/teacher/report-export.ts` | NEW — pure RFC 4180 CSV builders: `studentsCsv` (per-student table: evidence state, topics measured/total, mean mastery, recent/total attempts, last activity, tutor engagements, due reviews, active misconceptions + codes, weakest topics), `topicsCsv` (per-topic aggregates sorted by code), the escaping/row/document primitives, filename law `syllabai-<root>-<kind>-report-<yyyymmdd>.csv`, and the `downloadCsv` browser helper. Self-describing rows: `root_code, generated_at, evidence_window_start` ride as leading columns on every data row. |
| `apps/hub/src/lib/teacher/report-export.test.ts` | NEW — 17 bun pins / 44 expects: escaping (comma/quote/CR/LF/doubling), null-unmeasured exports EMPTY (never 0, never "N/A" — asserted negatively), CRLF documents with the trailing terminator, meta columns on every row, UNMEASURED learner row shape (trailing `0,,`), topic code-order + quoted titles, filename law. |
| `apps/hub/src/app/teacher/reports/page.tsx` | NEW — the route shell (`force-dynamic`, metadata), the class/page.tsx pattern. |
| `apps/hub/src/app/teacher/reports/reports-client.tsx` | NEW — subject picker (api.subjects(), default first subject with a KG root — the Class insights adaptation), summary stat cards (enrolled / with evidence / recently active / topics measured with tutor-ask + pending-marking hints), per-student table, per-topic aggregate table, three actions (Students CSV / Topics CSV / Print summary). One generated-at stamp per load feeds exports, footer, and the print-only header consistently. |
| `apps/hub/src/components/teacher/teacher-nav.tsx` | ONE tab (Reports, FileSpreadsheet icon) appended after Toolkit — no other byte touched. |

## 2. Honesty laws (carried, named)

- Evidence semantics stay separated (the §4 law the Class insights page pins): mastery only from graded evidence (BKT); misconceptions are BDT estimates; tutor asks count as engagement, never weakness — the copy says so on the page.
- Unmeasured reads as unmeasured: null mastery exports as an EMPTY cell and renders as an em dash with an explanatory title — never 0, never a placeholder that could average to a lie.
- NO term entity exists in core: the term view is NOT simulated. Exports stamp `recentActivity.windowStart` and the generated-at instant; the page copy names term grouping as pending.
- The per-class summary export is the browser print path (the nav strip is already `print:hidden`; picker/buttons are `print:hidden`, a print-only header carries root code + stamps).

## 3. Gates of record (first-hand, this sandbox @ cut `a40e0db4` + this changeset)

- `bunx tsc --noEmit` (apps/hub): **exit 0** (after `bun install`; 988 packages, workspace root).
- New suite: **17 pass / 0 fail** (44 expects). Teacher lib suites whole: **56 pass / 0 fail** (4 files).
- Full hub battery: **1122 pass / 10 fail / 1 error** (33,946 expects, 78 files) — A/B-proven PRE-EXISTING: clean main (changes stashed) full battery = **10 fail / 1 error** (33,902 expects, 77 files — exactly −17 tests = this lane's passing pins). The failing set (account-docs-stores ×3, ugm.render ×1, api.v2-surface ×6) is identical with and without this changeset and passes 51/52 when the three files run in isolation on BOTH trees (the residual 1 is the same single failure on clean main: sandbox-env gaps — env-dependent suites + corpus artifacts — against CI-verified green main `a40e0db4`).
- Diff surface: 4 NEW files + 1 one-tab nav edit; zero apps/api bytes; zero contracts/db bytes.

## 4. Verification boundary (honest)

- No browser-run screenshot in this lane: the page is composed strictly of the existing ui-kit components (Card/Badge/Button/Skeleton/Alert) in the Class insights idiom, and the data layer is the two views that page already pins server-side. The render check of record is the typecheck + the house CI `hub` workflow on the PR.
- CSV output verified at the unit level only (by design — the builders are pure); the `downloadCsv` Blob wrapper is exercised by the page, not pinned (no DOM in the suite).

## 5. Phase 3 remainder (open, named)

- Roster & settings (invites, multiple classes, RBAC hardening) — NOT in this slice; no tracking task exists yet.
- Term view — blocked on a term entity in core (would need a core contract first).
- The `/teacher/class` vs `/teacher/classes` directory split is DELIBERATE (two data models, renamed tabs per UX audit #19) — recorded here so the drift finding is closed as by-design.
