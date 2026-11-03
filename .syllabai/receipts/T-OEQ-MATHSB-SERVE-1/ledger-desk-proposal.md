# DESK PROPOSAL — resources LEDGER.md handover entry (T-OEQ-MATHSB-SERVE-1, G-S6 / H3 cutover)

**Status: DRAFT — NOT self-landed.** The card's scope keeps the resources repo
read-only for this lane ("LEDGER.md retirement record is resources-side
(propose via desk, not self-landed)"). The desk/operator lands this entry when
the G-S4 verdict unblocks the cutover.

**Proposed LEDGER.md entry (append):**

> ### 4MB1 (igcse-maths-b-16) — Official EQ handover, PENDING VERDICT (T-OEQ-MATHSB-SERVE-1)
> - State replaced: SME-ExamQuestion sets (65, agent-parsed + UIUX repair lineage)
>   reconstruct the 4MB1 past papers and light the hub past-papers rail.
> - State proposed: the Official-ExamQuestion/igcse-maths-b-16 emission of record
>   (66 sets @ resources main@3000e439d1464c2927d082696f5bb19313af3172, converter
>   v0.20.0 union, G0-G7 ALL PASS, 86/86 canaries) becomes the past-paper source
>   via the dedicated hub plane official-papers.json; SME sets retire from
>   past-paper matching (they keep serving the Exam Questions practice tree).
> - Rollback anchor: revert the v2 bundle two-file edit (official-papers.json
>   removal) — SME provenance is untouched in v2; the SME plane remains the
>   practice-tree source of record throughout.
> - Handover receipts: .syllabai/receipts/T-OEQ-MATHSB-SERVE-1/ (run-002
>   pre-flight H1 baseline; run-003 H2 comparison + G-S4 fail-closed finding).
> - H2 verdict required before this entry activates: the 2019-06/4MB1-02 official
>   emission carries 106 U+FFFD (OCR-sandwich MS) where the SME plane serves
>   UIUX-TIER-B-RUN-004-repaired text; five 2018-06/2019-06 sets carry 35 C1
>   mis-mapped symbol glyphs. Options A-D in run-003-h2-handover.json.

**Why via desk:** cross-repo donor is read-only for this lane (card scope), and
the H3 cutover record is the resources-side act by law.
