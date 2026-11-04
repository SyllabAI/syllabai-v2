# review-pass(T-TUTOR-EXP-1) — run-001 — 2026-11-04

- scope: the full PR #695 diff (20 files, +944/−24) read file-by-file with a reviewer's
  eye, PLUS a first-hand gate re-run in this worktree at head `2379cc4d`
- verdict: **READY — no blocking findings.** Two minor non-blocking observations
  (G-1, G-2) and a set of verified-of-record notes; nothing to change before merge.
- reviewer: r0 (author-side pre-review pass, filed under the same operator directive
  as the card — the pass the operator asked for before human review)

## 1. First-hand re-verification (this worktree, head 2379cc4d)

| gate | receipt claim | this pass |
|---|---|---|
| workspace typecheck | 5/5 | **5/5** (turbo-cached on a clean HEAD tree) |
| the six touched test files | green | **133 pass / 0 fail** (610 expect calls) |
| generator byte-no-op law | verified | re-run → `git status --porcelain` = **0 changed files** |
| CI on head | — | **hub ✅ verify ✅** (run 41694230414) |
| mergeable vs main | — | **clean** (base auto-advanced to `3b169103`; zero overlap between main's movement and the PR's file families) |

Disclosed scope: the full 2730-test api suite was NOT re-run in this pass — it is
carried by CI `verify` (green) and the receipt's first-hand run. The six files this
PR touches were re-run first-hand above.

## 2. File-by-file findings

### A. The deploy law (snapshot.ts, generator, inline module, inline test)

- ✅ the six pins go `const` → `export const` with values byte-identical to pre-patch
  (diff-verified: no pin value moved)
- ✅ inline-first `readResource` keeps the disk fallback; the frozen drift text stays
  verbatim and the NEW inline-source rider is EXACT — it fires only when
  `CONCEPT_GRAPH_INLINE_ASSETS[path] === bytes`, i.e. only when this module actually
  supplied the drift, never on a disk-side drift
- ✅ the learner-band reads (`concepts/concept_edges/practicals`) previously used raw
  `readFileSync` — they now route through `readResource` and gained both the uniform
  error shape and inline participation (an honest strengthening, not a behavior change)
- ✅ the CI test cross-checks inline == disk == pin from BOTH directions plus the V15
  store-fact counts (182/4/28) served from the inline bytes — a partial re-sync
  (YAMLs moved, module stale, or the reverse) fails in CI, not in production
- **G-1 (minor, accepted)**: the static import loads all six YAMLs (~1.46 MB) into
  every process at boot, including non-tutor entrypoints. This is the deliberate cost
  of "self-contained by construction" and is disclosed in the receipt (bundle ~39% ↑).
  If it ever matters, the retreat is a lazy `import()` at the `readResource` boundary —
  deliberately NOT taken now (the synchronous `readResource` signature is load-bearing
  across all six call sites).
- **G-2 (minor, cosmetic)**: the generator names its full-module string `banner`
  (it is the entire file body), and there is no post-write self-verify read-back.
  Non-blocking; fix opportunistically on any later generator touch.

### B. 001 — citation titles (evidence.ts, vector-arm.ts, citations.ts)

- ✅ additive `EvidenceItem.sourceTitle` with the 133d precedent semantics; because the
  interface field is REQUIRED, typecheck forces every constructor to decide — the
  compiler-driven exhaustive-update claim holds
- ✅ `titledLabel`: null AND blank/whitespace titles degrade byte-for-byte to the
  frozen label (never `Revision notes —  — p1`); the em-dash separator matches
  `pageSuffix`'s own
- ✅ the warehouse-seam arm stays honestly title-less: those rows carry no `title`,
  and `r.title == null` is true for `undefined` — the guard degrades to honest null
  (verified against the un-touched seam select)
- ✅ wire-compatible: the label is the same string field; contracts untouched

### C. 005 — quiz honesty (prompt.ts, karag.ts, quiz-scaffold.ts)

- ✅ PROMPT_VERSION 15→16 with both identity pins updated (tutor-core.test.ts,
  cla-service.test.ts)
- ✅ the floor fires ONLY on `quizScaffold == null && isQuizAsk(query)` — the guard is
  the guarantee that the scaffolded path stays byte-identical
- ✅ floor math: `best <= 0` → passthrough copy; the relative 0.5× is computed over
  DOCUMENT chunks only (KNOWLEDGE_NODE/LEARNER_WORK excluded from `best` AND from the
  floor — intent anchors and the learner's own words pass by construction); the
  floor-then-cap ordering is intentional (semantic filter before budget)
- ✅ deterministic end to end (no LLM in the path); the 0.5 ratio is a disclosed
  judged constant (receipt §G) — the retrieval-eval ablation that should eventually
  set it belongs to the T-TUTOR-EXP-2 eval harness family (see §4)

### D. 004 — CLA spec-statement evidence (cla/service.ts)

- ✅ the builder is PURE and tested against the REAL pinned snapshot, not a fixture;
  honest null pinned for IALCHEM / 9702 / empty codes
- ✅ bounds: SPEC_STATEMENT_LIMIT=4 × (≤130 chars + ellipsis); the ≤600-char content
  pin is asserted against the REAL code space, so a hypothetical longer official-code
  space trips CI rather than prod
- ✅ snapshot parse is process-cached; the SYLLABUS leakage posture is untouched
  (`evidenceEligible` still gates only MARK_SCHEME doc chunks on question contexts)
- ✅ wiring order matches the receipt: behind the anchor, ahead of the subtopic
  pointers, in the deterministic kg candidate band

### E. The verified-of-record no-ops (002 / 003)

- ✅ re-checked this pass: the hub tutor page resolves `/tutor?course=<slug>` to the
  registry `curriculumCode` and hands THAT to the chat as `courseRef`, and the
  topic-context HINT/CHECK disablement IS the frozen CLA contract. Shipping zero hub
  bytes is the CORRECT change set, not an omission.

## 3. Merge / rollout notes (operator-facing)

- **merging ≠ deploying**: the of-record api project is link=null (CLI-only,
  operator-gated). The NEXT CLI deploy after merge carries the inline assets
  automatically — no stage-file discipline required, and the 2026-11-03 omission class
  is impossible under ANY recipe from that moment.
- expect the bundle +1.46 MB at that deploy; the FIRST ask post-deploy exercises the
  inline read (and if anything is off, the drift rider names the regeneration step).
- rollback: reverting the PR restores the disk-fail-closed pre-outage posture; no pin
  ever moved, so the revert is clean.

## 4. Follow-through

- the Socratic-engagement prompt work is filed as **T-TUTOR-EXP-2** (card + design
  draft, run-000, branch `t-tutor-exp/run-002`) — its live eval harness is also the
  honest place to set the 0.5 quiz-floor constant (receipt §G's open item).
