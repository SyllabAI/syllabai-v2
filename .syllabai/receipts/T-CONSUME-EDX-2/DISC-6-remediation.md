# DISC-6 remediation — the gate-exact grafts stage replaces the defective v1 pass

Filed: 2026-11-03, at the receipt site of the run that introduced the
corruption, by T-OEQ-PHYS-FORMAT-1 under the operator ruling **"R1+R2 as
recommended"** (zai-web trace `1a1a2138d7f42e51`). This receipt discharges the
hand-off's requests 3 and 4 (`.syllabai/receipts/T-CONSUME-EDX-2/DISC-6-handoff.md`)
from the physics lane's side:

1. **P2 (replay hazard) — DISCHARGED.** The documented EDX-2 reproducible
   path's grafts stage is SUPERSEDED by the committed, re-runnable
   implementation `apps/hub/scripts/import_corpus/clean_segment_grafts.py`
   (the gate-exact pairing). The defective v1 pass (clean-source pool keyed
   per QUESTION + kind, last-write-wins — the corruption step of record for
   the 22 physics-19 fields and the 5 cross-bank fields) MUST NOT be replayed
   under any circumstances; any future replay of the documented path is
   replay-safe **iff** its grafts stage invokes `clean_segment_grafts.py` or a
   descendant preserving its gate law.

2. **P1 (unauditable stack steps) — DISCHARGED for the grafts stage.** The
   stage now exists as a committed script with a JSON receipt and a selftest
   (the other stack steps — fetch_trees / fetch_corpus / build_bundles /
   23a / fix_tail / 23c / 23d — were already committed scripts).

## The gate-exact pairing law (each gate is a refusal, never a warning)

- **G-A** `source.part_id == target.part_id` — THE anti-collapse law the v1
  pass lacked: a graft may only install a field's OWN question's OWN part's
  content. Sibling-part sources are structurally impossible.
- **G-B** `source.question_id == target.question_id` — no cross-question flow.
- **G-C** kind alignment (`problem_md ↔ problemMd`, `solution_md ↔ solutionMd`).
- **G-D** target uniqueness — no (bank, question, part, kind) grafted twice.
- **G-E** source resolves (rev + path + field), non-empty, differs from the
  current value unless `--allow-noop`; target part must exist.
- **G-F** (`--strict-23a`) source passes the 23a debris scan (no MathML
  speech-text markers; even $-parity).
- **T1** per-bank serialization preserved (round-trip detection before any
  write — the stage must not change a bank's serialization form).

## Selftest of record (run at filing time, exit 0)

```
  selftest PASS: legit graft applies
  selftest PASS: sibling-part graft REFUSES (G-A)
  selftest PASS: cross-question graft REFUSES (G-B)
  selftest PASS: bank mutated only by the legit graft
clean_segment_grafts selftest: GREEN (3 gate checks + bank-mutation scope)
```

## Context: the 5 fields were repaired by the wave-D serving leg, not by a replay

The 5 cross-bank collapse fields (found by the DISC-6 census guard baseline)
were repaired by run-012 wave-D (plane := corpus of record at resources main
`5027ee19`, asset hrefs repinned to the bank-wide of-record form at pin
`1a5c37bc`, gates T1/G1–G6 green, census guard CLEAN exit-0 on each touched
bank). The corpus of record is untouched by wave-D. The ` pre` isotope/decay
glue debris served verbatim by the repair is the corpus of record's own
content class (already served verbatim elsewhere in these banks) — recorded as
process finding **P5** with the M4 corpus-side repair candidate (the
run-011-m3 analog for these banks).

## Remaining platform-lane item

Hand-off request 2 (wiring `census_guard.py` as a hard pre-ship gate in the
build/CI automation) remains open with the platform lane; the mandate text is
`apps/hub/scripts/import_corpus/CENSUS-GUARD.md`.
