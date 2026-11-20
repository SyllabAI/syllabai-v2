# PENDING — Sidebar vs selector organization on the 27 SME-layered courses

> Recorded 2026-11-20 · status: **P1 + P2 + P3 IMPLEMENTED on `t-qa-org-002/fix` (414729a3 + 5438494a, off origin/main `a144d4d1`) awaiting landing · P0 RETRACTED (erratum — worked as designed)** · task card: `.syllabai/tasks/T-QA-ORG-001-sidebar-vs-selector.yaml` (status OPEN)
> Evidence: `.syllabai/receipts/T-QA-ORG-001/run-001.json` (audit) + `run-002.json` (P1/P2 + P0 erratum) + `run-003.json` (P3) · full narrative: the QA session's browser-qa report, section "Topic Trees sidebar vs Revision Notes selector — organization audit (2026-11-20)"

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

## Recommendation — placement and prioritization (updated after implementation)

**P0 — ~~Fix the demo-session note-page bounce~~ RETRACTED (erratum, run-002).** The claimed client-side bounce was an artifact of testing in a **cookie-less browser context** (agent-browser close/reopen) compounded by a curl `-b` cookie-*file* parsing bug during the audit fetches. Same-session re-verification: an authenticated demo session gets **200** on the note URL (curl) and the browser renders the note page directly with the sidebar tree in DOM; the anonymous **307 → `/login?next=…` for BOTH the note page and the selector is the designed session gate** (`lib/route-gate.ts` — the `/courses/` subtree row, T-ACCOUNT-ONLY + option-1 amendment). No defect; no code change. Lesson recorded: reproduce session-bound behavior only inside the session that holds the cookie.

**P1 — Fix the SME section numbering — ✅ IMPLEMENTED** (`t-qa-org-002/fix`, `spec-tree.ts`). `number: sec.order ?? 0` → position-based `i + 1` (the SME picker's own numbering, verified against the live picker on the 3 audited courses). Effect: notes selector 11–20 → 1–10, aligned with the sidebar; chem-25's "38. 1. Atomic Structure" double numbers gone. Display-only (deep links key on codes); `exam-questions/page.tsx:159` consumes the same field and picks up the same correction. Verified by law tests + `tsc --noEmit` + eslint.

**P2 — The sidebar mirrors the selector's SME tree on layered courses — ✅ IMPLEMENTED** (operator approved: "Ok, proceed"; `t-qa-org-002/fix`). `buildSmeSidebar` (pure, in `spec-tree.ts` beside the smeRow joins it composes): on the 27 layered courses the **notes and questions** sidebars render the SME sections — the same organization the selectors render — so the tree beside a note agrees with the page that linked to it **and the undercount disappears** (row counts account for every note; the official-spine sums were 93/173 lit-21, 70/239 chem-25, 197/199 maths-b). The **hub, flashcards variants and all 79 non-layered courses keep the official spine** (absent `smeSidebar` = unchanged). Rings: mirror rows derive reads ÷ row notes from the same per-note flags (`ProgressRing.localPercent`); questions-mirror rings stay not-started until the projection learns SME-keyed rows (disclosed residual). Active-row highlight resolves through `noteRow`/`setsByRow`; row hrefs mirror the D3 law (single-set deep link / multi-set grouped view). The official spine stays reachable via `/specification`.

**P3 — Official-spine hygiene — ✅ IMPLEMENTED** (receipt run-003; `t-qa-org-002/fix` 5438494a). The investigation sharpened the problem: the duplicates are corpus-native and **unrecoverable in-repo** — lit-21's official spine is a year-rotating set-text table (6× "Section A: Poetry", 3× "Section B: Prose", and "Set texts for examination in 2023 – Paper" truncated mid-sentence); chem-25 repeats every AS/A2 topic title (13 groups); 22 of the content bundles carry bundle-level duplicate TOPIC titles. The spine copy, kg export and curriculum all agree — the paper/component names were lost upstream, so they cannot be restored here without inventing them. The builder therefore **qualifies verbatim-colliding titles with an honest "(n of k)"** (`qualifyDuplicateTitles`, pure, applied to both rendered trees): no two rendered rows are indistinguishable, nothing invented, codes/deep links unaffected. Cross-tree pairs (official↔SME, e.g. maths-b's bare "Number" vs SME "Number") never render in one list and are intentionally untouched. Verified by 18 law tests incl. the REAL lit-21 bundle (post-qualification titles unique; "Section A: Poetry (1 of 6)"). **Upstream residual for the content lane:** restore the real paper/component names + untruncated titles at the corpus parse (importer / build_official_spines.py CIE adapter) — the rule then no-ops by construction.

**Landing:** from an authenticated session `git push -u origin t-qa-org-002/fix`, or `git am` the two patches IN ORDER against `a144d4d1`+ (P1+P2 first: `download/T-QA-ORG-002/0001-T-QA-ORG-001-P1-P2-mirror-the-SME-selector-organizat.patch`, then P3: `download/T-QA-ORG-002/0001-T-QA-ORG-001-P3-qualify-verbatim-colliding-official-.patch`), then PR through R0/lane tooling (`gh` absent in the QA sandbox). The sandbox recycled the clone twice mid-session — both branches were rebuilt from these exported patches each time; they are the transport of record.

## Reproduction (short)

Demo session → open `/courses/igcse-maths-b-16/revision-notes` (selector reads "11. Number") → open any note → sidebar reads "1. Number". Chem: selector rows "38. 1. Atomic Structure". Lit: 5 selector sections vs 15 sidebar topics. Demo bounce: fresh demo session → click any note → `/login?next=…` (curl with the same cookie on the note URL gets 200). Audit scripts live in the QA session workspace (`scripts/sidebar_audit.sh`, `scripts/extract_orgs.py`).

## Related open QA defects (separate lanes — recorded for completeness, not part of this card)

1. `GET /api/v1/learners/me/progress` → 401 for an authenticated demo session while agenda/courses return 200. *(same class as P0 above)*
2. React #418 hydration mismatch on `/dashboard` (1 per load).
3. `syllabai.com` parked for sale on GoDaddy (old brand domain lapsed).
4. `/sitemap.xml` 404 and no `Sitemap:` in robots.txt.
5. Stale marketing count "94 courses" (actual 103 layered / 106 listed).
6. `GET /api/v1/editor/me` → 403 auto-fired on course pages (gate it client-side).
7. ~~**Note pages client-bounce to `/login?next=…` for a fresh demo session**~~ **RETRACTED (erratum, run-002)** — the "bounce" was an anonymous (cookie-less) browser context, not a demo session; anonymous `/courses/…` gating is the designed `route-gate` behavior. The known `progress` 401 remains defect #1 above.
