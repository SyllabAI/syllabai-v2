# ADR-044 run-001 — receipt (the spec of record filed)

Date: 2026-11-09 · Operator order: "Re-file the spec where it counts" (trace 1a1bf9b23f1d45a9) · Preceding engagement: the editor-role design session, whose rulings bind this filing (Tier 1 auto-merge acceptable; all banks at once and future ones; the role is named "editor"; holders internal + external; deliverables ADR + docx + a full MVP build).

## What shipped

The design of record for the editor role and the content workbench, filed as `docs/ADR-044-EDITOR_ROLE_CONTENT_WORKBENCH.md` (PROPOSED — becomes ACCEPTED on merge, ADR-040/041 house precedent). Zero code bytes: this run is the law, not the build. The ADR pins: E-0 (the serving plane is never directly editable; every human edit flows corpus → gates → tiered merge → receipt → census → serve); the editor as a **v2-native grant plane** (`editor_grants` rows, NOT a fourth member of the frozen `Role` enum `{ STUDENT, TEACHER, ADMIN }` — zero frozen-core divergence, the workspace-docs class); the `requireEditor` shell (requireAuth first, 401 before everything, 403 otherwise, Boot-style bodies); the capability matrix (strictly content-scoped; composability with TEACHER; no platform powers); the seven-step edit pipeline with a **server-side tier classifier** (Tier 1 typography auto-merges on green per the operator ruling; Tier 2 four-eyes with G-EYES author-independence and post-merge census receipt; Tier 3 refused to the lane process); the gate-engine families of record (G-CANON / G-SER / G-FIELD / G-CHAR / G-ASSET / G-EYES / G-SCOPE) as ONE module consumed twice — hub pre-flight and CI gates; the data plane carded at `packages/db/drizzle/0028_editor-planes.sql` (next free number after 0027_mark-award-delta; `editor_edit_proposals` + `editor_edit_receipts` per the 0022/0023 personal-state law; the F5-S7 grants lane as a **Phase 1 exit criterion**; T-CAPS-POLICY-1-style caps); the v2-native API surface (`/api/v1/editor/*`, no editor-reachable serve or merge endpoint); phasing 0–4; and the negative space of record (no free-text AI rewrite passes over banks, no direct plane writes, no edits without PRs, no per-field locking, no self-merge above Tier 1).

## Inventory (3 files)

- `docs/ADR-044-EDITOR_ROLE_CONTENT_WORKBENCH.md` — the ADR of record (~4,900 words, 12 sections, house format per ADR-043)
- `.syllabai/receipts/ADR-044/run-001-spec-of-record.md` — this receipt
- `.syllabai/worklog.md` — append-only entry (byte-asserted tail append)

## Evidence

- Grounding reads at filing time, live from main: `packages/contracts/src/auth.ts` (the frozen vocabulary pin — "Role.java: exactly `{ STUDENT, TEACHER, ADMIN }`", all three `UserView` construction sites), `packages/contracts/src/content-writes.ts` (the frozen teacher-ingestion band — confirmed a different plane: draft→validate→place ingestion, not corpus curation), `apps/api/src/middleware/auth.ts` (the requireAuth/requireRole shell, Boot 401/403 bodies, fail-closed anonymous), `apps/hub/src/lib/identity.ts` (the derived identity — TEACHER/ADMIN → "teacher", else "student"), the `docs/` ADR series (037, 038, 040–043 present; **ADR-044 next free**; ADR-040 confirmed taken by the marking lane), `packages/db/drizzle/` (0000–0027 present; **0028 next free**).
- The reference Workbench MVP (the originating session): API golden path 20/20, browser UI flow 10/10, lint clean, run on real fixtures from `syllabai-resources@main` including the three wave-D-repaired physics questions as regression pins. Recorded in the ADR as companion evidence; its sandbox artifacts were lost to a workspace recycle and are superseded by this filing as the design of record.
- Circulation copy regenerated outside the repo at `download/editor-role/` (`adr-editor-role-workbench.md` + `.docx` + `.pdf`; R1 cover + DS-1 palette, TOC, 10 pages, postcheck 0 errors; the static PDF's numbering made internally consistent for standalone viewing).

## Disclosures

- Docs-only PR (zero src/test bytes) — the tutor gate is structurally satisfied; the code checks are expected green. The legacy Vercel status may show the known account-level deploy block (standing in the Nov 4–8 disclosures and the run-002 bake-lane context) — infrastructure, not this PR.
- The ADR is PROPOSED; it becomes ACCEPTED on merge, and the build phases (0028 migration, grants lane, workbench) start only under a fresh operator order.
- The originating session's rulings are carried verbatim in ADR §1; any re-ruling amends the ADR in public, it does not re-interpret it.
- The PAT exposure standing reminder remains open (see the worklog entry, tenth filing) and is unchanged by this run.
