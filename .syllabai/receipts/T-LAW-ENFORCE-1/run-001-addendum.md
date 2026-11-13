# T-LAW-ENFORCE-1 run-001 addendum — the run-id citations of record (§8 citation law)

- Purpose: §8 requires that "any receipt claiming a restored/gated/verified
  state MUST cite this job's run id". The run-001 receipt could not cite
  run ids it did not yet have; this addendum attaches the machine
  citations for every claim it made.
- Citations of record:
  - law-readback PR run (head t-law-enforce-1/run-001, PR #1007):
    run **43443748787** — conclusion success (started 2026-11-13T14:32:55Z).
  - law-readback first main push run (triggered by the merge commit):
    run **43444968213** — conclusion success (started 2026-11-13T14:40:29Z).
  - PR #1007 merge of record: 7338132a574501abccb7e3bdab94c93fc84888db
    (2026-11-13, merge method: merge, gate green verify+hub+law-readback+coordination).
  - Ruleset 27179683 of record: enforcement active, bypass_actors [],
    required_status_checks = verify + hub + law-readback + coordination
    (PUT 200, read-back confirmed; branch main protected: true).
  - Main bytes of record: docs/AGENT_COORDINATION.md carries the
    "Correction of record" paragraph; the withdrawn corruption clause is
    absent; §8 markers intact (raw fetch verified post-merge).
- This addendum PR is itself the receipts-only fast-path proof: it lands
  through the gate carrying the two NEW required checks (law-readback +
  coordination) alongside verify + hub.
