# ADR-BOOK-0006: Cognito full-coverage mode for 4CH1 (density-guard revisit)

| | |
|---|---|
| **Status** | **ACCEPTED** (2026-11-04) — drafted and implemented under the operator's direct order "seamlessly integrate all the cognito videos into the course lesson 4ch1" (trace 1a1a4e45ca4e2325) |
| **Band** | `T-BOOK-xxx` (interactive books) |
| **Task** | T-BOOK-074 |
| **Date** | 2026-11-04 |
| **Basis** | ADR-BOOK-0002 decision 6 ("Pilot packs carry ≤ 2 media-embed blocks (density guard; **revisit post-pilot** — this ADR does not legislate fleet density)"); the 93-topic Cognito census; T-BOOK-066/070/073 serve + playback proofs |
| **Revisits** | ADR-BOOK-0002 decision 6, second bullet (the per-chapter ≤2 media-embed density guard) — **for 4CH1 only** |
| **Preserves** | every other ADR-BOOK-0002 decision: the embed law (decision 3), the manifest + G4 resolve law (decisions 2/5), the licensing basis (decision 4), the curation protocol (decision 6 fetch-verify), rollback-by-retire (decision 7), the anti-dilution law (decision 8) |

## Decision summary

4CH1 integrates **every fetch-verified Cognito video on the Edexcel-IGCSE track**
(one row per distinct asset). The ADR-BOOK-0002 per-chapter ≤2 guard — written
for the one-pack pilot and explicitly marked "revisit post-pilot" — is
revisited: per-chapter `media-embed` blocks may now exceed 2 where the provider
ships that many chapter-relevant videos. Everything else about the video layer
is unchanged.

## Decisions

1. **Coverage policy.** Every Cognito Edexcel-IGCSE Chemistry topic page that
   ships a video and maps to a 4CH1 chapter is integrated; census of record =
   93 topic pages, of which the video-bearing set is fully integrated after
   this ADR (29 pre-existing rows + 34 new rows = 63 video blocks fleet-wide).
   Topic pages with no video stay honest-empty (never padded).
2. **Placement law.** New video blocks append at the end of their chapter pack
   (the established T-BOOK-070/073 widen pattern), ordered by the provider's
   own topic numbering (required-practical topics 7.x trail their theory
   topics); `pdfPageAnchor` = the pack's current last anchor (monotonic,
   in-range); ords continue the pack's 1..n below the strength 100+ band.
3. **Duplicate-asset policy.** One video = one manifest row = one canonical
   hosting chapter. Where the provider reuses an asset across topic pages, the
   canonical topic hosts the row and the reuse is disclosed in the receipt.
4. **Spec binding unchanged.** Each row/block's `specPointRefs` still obey the
   G1/G4 canonical-subsection law and the DB join-set law at ingest; codes are
   chosen from the official spec text (not the provider's page structure).
5. **Scope.** 4CH1 only. Other books adopt full-coverage mode by their own ADR.

## Consequences

- Lint G1/G4 need no code change — the density guard was an ADR covenant, not
  a lint rule; the manifest remains append-only and the honest-empty and
  retire laws keep working unchanged.
- The DB estate grows 266 → 300 book_blocks for the 4CH1 document (all landing
  SUGGESTED, then operator S4 flips to VALIDATED — scoped land+flip per block,
  never the full-rail re-ingest).
- The 90-day recheck window now covers 63 rows; `checked_date` 2026-11-04.
