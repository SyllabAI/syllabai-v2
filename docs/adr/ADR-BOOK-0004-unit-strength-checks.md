# ADR-BOOK-0004: Unit Strength Checks — binding, gating and serving

| | |
|---|---|
| **Status** | ACCEPTED — operator acceptance word of record, IM trace `1a19f606f8741cbd`, 2026-11-03: *"the strength-checks lane (T-BOOK-069) proceed"* (drafted under the widen order, IM trace `1a19b69d1fddc0b5`, 2026-11-02) |
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

## Run-001 amendments (DB-truth, 2026-11-02 — the first live fire of the armed vehicle)

The draft above was written DB-blind (armed without a pooler credential). First live fire
against the bank surfaced four mechanical corrections; all are disclosed here and carry
their rationale in the T-BOOK-069 run-001 receipt. (Acceptance note: the ADR was PROPOSED
through run-001 — the lane then executed under the standing operator order, trace
`1a19b69d1fddc0b5`, plus the credential hand, trace `1a19d157d5ca8cc9`; the operator's
acceptance word for the lane, trace `1a19f606f8741cbd`, 2026-11-03, is recorded in the
status header above.)

1. **Keying v2 (supersedes decision 4's mechanism, not its intent).** The draft's SME
   `external_ref` regex is subject-ambiguous: physics items (`sme-eq-1-1-movement-and-position-…`)
   parse to the same numeric prefix as chemistry points (first live audit: "23/182 covered"
   polluted by non-chemistry items across every band). The DB's keying of record is
   `question_spec_points` (role PRIMARY, validation_state AI_VALIDATED, 41,636 rows) →
   `knowledge_nodes.code`, where chemistry spec nodes are subject-true (`4CH1-1.1` …
   `4CH1-4.50C`). The vehicle v2 keys through that graph; unit bands are code prefixes —
   the cross-subject collision class is structurally impossible. Real density:
   u1 51/60, u2 39/50, u3 18/22, u4 28/50 band points covered.
2. **Per-unit audit scoping.** The draft's `--audit u<N>` never bound its unit argument
   (every call audited the full 182-point spec). v2 scopes by band prefix.
3. **Gate semantics.** Zero-item points print the honest blockers and the unit ships the
   largest honest subset with the gap filed (decision 4's own thin-bank clause); the exit-1
   hard-fail of the draft would have blocked the honest subset itself — contradiction removed.
4. **Mechanics of record for the packs** (all zero-schema):
   - strength packs are `strength-u<N>/` dirs, self-named in `pack.yaml`; the lint's
     orphan-pack law moves from the pack to each block (per-item chapter binding);
   - block ords occupy a **reserved high band (100+)** in each bound chapter's ord space —
     `uq_book_blocks_identity (document, version, chapter_key, ord)` never collides with the
     chapter pack's own 1..n;
   - `pdfPageAnchor` is null on strength blocks (unit-level artifacts, no page of record);
   - the bank's checkRef grammar carries optional `-pN` part suffixes — the lint grammar
     of record widened;
   - **serving**: `railBlocksForChapter` serves any VALIDATED row, so the decision-3
     exclusion extends to the LESSON RAIL (blocks whose id prefix is `strength-u<N>/` are
     excluded from chapter rails and chapter checks; they serve only through the
     unit-scoped endpoint). Until that core change is merged AND deployed, the strength
     blocks stay SUGGESTED (inert under every code version) — the S4 flip is the
     operator's lever and fires only after the exclusion is live in production.
