

---

## T-SM-ROLLOUT / awave-bank-census-r0 (2026-10-25, trace 1a16fc5d0befd6b1)

Operator answered PR #352 Ask 1 by pasting pooled credentials in-chat (owner-role main + one warehouse endpoint + Neon API key). Census executed READ-ONLY on production main (session default_transaction_read_only=on, SELECT-only statements, secrets excluded from all repo artifacts; deviation from the census_ro spec disclosed in the receipt).

Result of record: ALL 17 A-wave subject rows (33 course rows) -> ZERO_BANK_REFS / NO_BANK_PARTS on production main. Positive control green: 4CH1 cv 4CH1-2017 = 105 papers bound / 41 with latest-version parts / 2,513 structured parts / 2,513 validated / 2,059 points-bound; 4MA1 = 110 papers bound, 0 bank questions (T-MIG-138 anchor posture). exam_papers total 218 bound to 3 subjects.

Conclusion: funnel A census leg DISCHARGED; next leg per the T-SM-BRIDGE-WIDEN r0 law = bundle ingest for all 33 rows from the committed corpus (17,319 parts) via a task-owned Neon COW branch (production main stays agent-read-only, no dual-write), then G1 audit -> two-file flip -> deploy -> live probe. Receipt: .syllabai/receipts/T-SM-ROLLOUT/awave-bank-census-r0.json
