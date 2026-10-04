# @syllabai/shared

Cross-app pure logic — the parity killer. Both `apps/api` and `apps/hub`
import from here so normalizer-class behaviour can never drift again
(the frozen world maintained it as a gated cross-repo port; see
`src/index.ts` header for the receipts).

Wave plan: T-MIG-011 lifts mathNormalize from the hub import into here.
