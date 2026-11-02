# ADR-BOOK-0004: Unit Strength Checks — binding, gating and serving

| | |
|---|---|
| **Status** | PROPOSED — awaiting the operator's acceptance word (drafted under the widen order, IM trace `1a19b69d1fddc0b5`, 2026-11-02) |
| **Date** | 2026-11-02 |
| **Lane** | T-BOOK-069 |
| **Supersedes** | nothing |
| **Extends** | ADR-BOOK-0001 (rail-over-spine), PLAN-4CH1-v1.1 §5/§7 (10–15 bank items per unit), T-BOOK-008 bank-serving law |

## Context

The 29 chapter packs are published and serving (178/178 blocks VALIDATED). The
plan's last content artifact class — the **unit-closing Strength Check**
(10–15 bank items per unit, 4 sets) — is unbuilt. The plan gates it on a
per-point bank-density SQL check (§126: "per-point density audit runs as a SQL
check and gates Strength Checks"). Two design questions were open:

**(a) Binding.** Blocks bind to `chapter_key` on the `book_chapters` spine
(spine law); a *unit* is not a chapter. How do unit-level items bind without a
parallel taxonomy?

**(b) Serving.** The checks surface is chapter-scoped
(`/v1/content/books/:docId/checks?chapter=`). How does a unit assessment serve
without diluting chapter checks or inventing a new content class?

## Decisions

1. **Binding: per-item chapter binding.** A strength pack (`strength-u<N>/`)
   is an **L2 grouping only**. Its blocks are ordinary `mcq-embed` blocks;
   each block binds (`chapterKey`) to the chapter that owns the item's spec
   point, and its `specRefs` stay inside that chapter's join set. Zero schema
   change, zero new spine rows — the spine law and the join law are intact.
2. **Identity: the pack prefix rides the block id.** Block ids are
   `<pack>/b<NN>` by law (PACK-SPEC §3) — `strength-u1/b03` therefore names
   its unit assessment without any new field. The unit check of record = all
   VALIDATED blocks whose id prefix is `strength-u<N>/` under the parent
   document.
3. **Serving: one unit-scoped, read-only core query.**
   `GET /v1/content/books/:docId/strength-checks?unit=uN` resolves the
   id-prefix set through the EXISTING railChecks law verbatim (ACTIVE,
   `MCQ_SINGLE`, the paper-serving LEFT JOIN, current `question_version`,
   honest `question:null` on an unresolved ref). Chapter-level
   `checks?chapter=` responses **exclude** strength-pack blocks — the chapter
   check stays chapter-scoped (no dilution); the exclusion is the intended
   behavior change and is disclosed here.
4. **Gate: the density audit of record.**
   `apps/api/scripts/books-strength/density-audit.mts --audit` (read-only,
   env-only credentials) counts ACTIVE `MCQ_SINGLE` bank items per spec point
   across the unit's band (SME `external_ref` keying, the T-BOOK-000
   convention) and **fails the lane** if any point in the unit band has zero
   eligible items. A thin-bank unit ships as the largest honest subset and the
   gap is filed — never padded (honest-empty law).
5. **Authoring: machine-proposed, agent-confirmed.** `--select u<N>` emits the
   candidate item ids (10–15) ordered for per-point coverage first; the
   authoring agent pins the set into blocks (G1–G4 as usual, S1/S2/S3
   adversarial separation), and the flip rides the standard S4 law (double
   VALIDATED gate, ingest of record only).
6. **Budget: 10–15 items per unit.** No new block types (frozen vocabulary
   holds — `mcq-embed` already exists).

## Consequences

**+** Spine law, join law, bank law and the frozen 11-type vocabulary are all
preserved; the core change is one read-only endpoint plus the chapter-checks
exclusion filter.

**−** The density gate can honestly block a unit whose bank is thin for some
spec points; the set then ships as the largest honest subset and the coverage
gap is filed in `qa/findings.jsonl` rather than padded.

**−** Past-paper-tagged items are OUT of the audit's count of record in v1 —
they carry no per-point spec key without the tagging sprint the plan
deliberately deferred (PLAN §126). The audit counts SME-keyed items and
discloses the class boundary; widening the key source is a later ADR, not a
silent change.
