# CENSUS-GUARD — the DISC-6 standing guard for SME question banks

Mandate of record: run-012 DISC-6 (ledger
`scripts/oeq_phys_run012/ledger.json` in SyllabAI/syllabai-resources, `disc6`
section; dossier `scripts/oeq_phys_run012/wave-c/disc6/edx2-attribution.md`).

## Why this exists

The T-CONSUME-EDX-2 run (v2 `c2388bca`, 2026-10-21) corrupted question banks
by writing the LAST part's md content under EARLIER parts' ids — the
post-build stack's clean-segment grafts v1 pass keyed its clean-source pool
per QUESTION instead of per PART. The corruption was **gate-invisible**: every
23a gate read ZERO after the grafts, because a cross-field mapping error is
not a per-field defect class. 22 fields in igcse-physics-19 were repaired by
the run-012 wave-C serving leg (v2 PR #675); 5 more fields in
igcse-physics-modular-24-unit-2, igcse-science-double-award-17-physics and
ial-maths-20-decision-1 are confirmed corrupted with intro commit `c2388bca`
(wave-D candidate, operator ruling pending).

## The law

**ANY rebuild of a content question bank MUST re-run this census guard and
land it exit-0, twice:**

1. on the freshly built bank, BEFORE it is committed (git mode against the
   worktree, or `--content-dir` pointed at the build output);
2. again AFTER any post-build stack step has run (the EDX-2 corruption was
   introduced by the stack, not the build).

The guard JSON receipt (`--json`) MUST be pasted into the run receipt's
`verification` block. A non-zero exit is fail-closed: the bank must not be
committed, pushed, or shipped until the findings are either repaired or
allowlisted per the corpus-classification procedure below.

## Usage

```bash
# scan the working tree (before committing a rebuilt bank)
python3 apps/hub/scripts/import_corpus/census_guard.py --content-dir apps/hub/content --json guard-receipt.json

# scan a commit (no checkout needed; CI-friendly)
python3 apps/hub/scripts/import_corpus/census_guard.py --git-rev HEAD --json guard-receipt.json

# one course only
python3 apps/hub/scripts/import_corpus/census_guard.py --course igcse-physics-19 --content-dir apps/hub/content

# with the informational serialization survey (T1 law: indent=1, ensure_ascii=False, no trailing newline)
python3 apps/hub/scripts/import_corpus/census_guard.py --git-rev HEAD --serialization-check
```

Exit codes: `0` clean (or only allowlisted findings) · `1` findings (fail-closed) · `2` usage error.

## What it detects

For every question with >= 2 parts, any two distinct parts whose
`problemMd`/`solutionMd` carry the same non-empty value:

- `collapse_signature` — the holder is an EARLIER part and the value equals
  the question's LAST part's content (the exact EDX-2 fingerprint);
- `sibling_copy` — any other same-question cross-part md duplication.

It does NOT cross-check the corpus of record (that is the resources lane's
reconciliation census); it is a bank-local, dependency-free, deterministic
signature scan. Stdlib only, no network (git mode shells out to `git show`).

## Allowlist policy

A finding may be allowlisted ONLY when a corpus classification attests it —
i.e. the corpus of record itself carries the duplicate (see the wave-C DISC-6
classification artifact on the resources side: cie-as-chemistry-25
`qstn_62k9kSPCBGRt34yy` is the first attested case: parts #1/#2 carry
identical 1,407-char solutions in the corpus itself). Pass
`--allowlist allow.json` with entries
`{"question_id": "...", "kind": "solutionMd", "value_sha256": "..."}` and
reference the classification receipt in the run receipt.

## Baseline of record (2026-11-03, v2 main `fa8059d7`)

106 banks / 44,502 questions / 148,978 md fields scanned; 39 findings in 27
groups; igcse-physics-19 **zero**. Receipt:
`.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1/disc6-guard-baseline.json`;
corpus classification:
`scripts/oeq_phys_run012/wave-c/disc6/guard-baseline-corpus-classification.json`
(resources). The 5 confirmed EDX-2-corrupted fields and the benign/out-of-scope
groups are enumerated there — they are NOT allowlisted; they are handed to
their owning lanes (wave-D candidate; fetch-bank lane for the maths-b groups).
