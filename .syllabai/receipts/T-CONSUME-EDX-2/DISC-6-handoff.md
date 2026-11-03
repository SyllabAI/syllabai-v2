# DISC-6 hand-off — the EDX-2 stack attribution + the census guard (T-OEQ-PHYS-FORMAT-1)

Filed: 2026-11-03, into the receipt site of the run that introduced the
corruption. Full dossier of record (resources):
`scripts/oeq_phys_run012/wave-c/disc6/edx2-attribution.md` + the three
census/walk artifacts next to it; ledger `scripts/oeq_phys_run012/ledger.json`
DISC-6 → "ATTRIBUTED + HANDED OFF".

## The attribution verdict

The corruption introduced by this run (T-CONSUME-EDX-2, `c2388bca`,
2026-10-21) — per-part md fields carrying the question's LAST part's content —
is attributed to the post-build stack's **clean-segment grafts, v1 pass**
(the 23a residual chain: dictionary patch 21,592/22,104 → fix_tail 6 files →
**clean-segment grafts 321 (v1) + 36 (v2 gate-exact pairing)** → 0).

- Mechanism: the v1 pass's clean-source pool was keyed per QUESTION + field
  kind (last write wins), not per part; every residual target field therefore
  received its own question's last part's content. Last-part targets were
  correct-by-accident; single-part questions unaffected.
- Target selection, quantified at the build pin resources@`aa0b4de1`: 22/22
  igcse-physics-19 targets' true contents carry 23a-class pollution (18
  prose-form speech-text + 4 unconvertible multiline spans); the 139 polluted
  non-last non-targets are ALL span/multiline form — the dictionary-repairable
  class. The same law holds for the cross-bank holders (polluted at pin, last
  parts clean).
- The v1/v2 graft passes were ad-hoc worktree scripts, never committed — no
  file matching graft/clean-seg exists in any tree. The exact defective line
  is not recoverable; the step-level attribution rests on the receipt +
  worklog of record, elimination over the other stack steps, the EDX-1
  path-aligned counterfactual, and the data-side censuses above.

## What the delivered census guard found on day one

`apps/hub/scripts/import_corpus/census_guard.py` (stdlib-only, git-mode
capable) + `apps/hub/scripts/import_corpus/CENSUS-GUARD.md` (the mandate).
Baseline at v2 main `fa8059d7`: 106 banks / 44,502 questions / 148,978 md
fields, 39 findings in 27 groups
(`.syllabai/lane-artifacts/T-OEQ-PHYS-FORMAT-1/disc6-guard-baseline.json`):

- igcse-physics-19: **ZERO** — the run-012 wave-C repair (v2 PR #675) holds.
- **5 further fields corrupted by this run, confirmed by per-field history
  walks (intro = `c2388bca` in every case)**:
  - igcse-physics-modular-24-unit-2 — `qstn_StT48QqJHnmfWTDr` part 1 of 3,
    problemMd + solutionMd (radiation family, same as the physics-19 ZTrm
    case);
  - igcse-science-double-award-17-physics — `qstn_j4MgKD5BjMHMxFzG` part 1 of
    3, problemMd + solutionMd (radiation family);
  - ial-maths-20-decision-1 — `qstn_hjMZz7469DDbGmkD`, problemMd (the pool
    value here is the POST-PATCH last-part text — same collapse over the
    patched tree).
  These are the **wave-D candidate**: same L4 repair shape as wave-C (plane :=
  corpus of record verbatim, hotlink at the current cut, gates T1/G1–G6,
  guard green pre+post). Operator ruling requested; two radiation questions
  and one LP question have served wrong part content since 2026-10-21.
- Benign groups (corpus-attested, allowlist candidates): cie-as-chemistry-25
  `qstn_62k9kSPCBGRt34yy`; ial-maths-20-statistics-2 `qstn_VC4gHySgcd2xYVyf`
  (of-record twin, born pre-EDX-2).
- Out of scope: 20 maths-b fetch-bank groups (no corpus counterpart by the
  no_topic_questions ruling; this run never rebuilt that pack — restored
  byte-exact per this receipt's scope guards) → owned by the fetch-bank lane.

## Requests to the platform lane

1. **Wave-D**: repair the 5 fields (wave-C shape) — operator ruling requested.
2. **Wire the guard**: run `census_guard.py` exit-0 before committing ANY
   rebuilt bank and again after any post-build stack; paste the JSON receipt
   into the run receipt (the mandate text is in CENSUS-GUARD.md).
3. **Do NOT replay this run's "documented reproducible path"** until the graft
   stage is replaced by the gate-exact pairing (or dropped) — the documented
   path still contains the defective v1 pass (replay hazard).
4. **Commit every stack step as a re-runnable script** — the v1/v2 graft
   passes existed only as ad-hoc worktree scripts; that is why this
   attribution could not recover the exact line (process finding P1).
