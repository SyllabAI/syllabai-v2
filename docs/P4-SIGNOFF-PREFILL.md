# P4 Operator Sign-Off — Paste-Ready Block

> **STATUS: STAGED.** Fill the three `⟨FILL⟩` blanks after the P3 witness
> session, then paste the whole block into `.syllabai/worklog.md` (append-only).
> This pre-fill adapts the `docs/CUTOVER_RUNBOOK.md` §7 template to the posture
> actually executed of record (the per-family dual-run flip table rather than a
> single big-bang §2 env flip) — every filled value cites its receipt; nothing
> is pre-marked PASS that only the witness can mark.

```markdown
---
Task ID: W7-CUTOVER-SIGNOFF
Agent: OPERATOR (human)
Task: Wave-7 cutover sign-off per docs/CUTOVER_RUNBOOK.md.

Work Log:
- Preconditions P1 [MET] — board register 109/109 cards DONE, zero open/claimed
  (the T-MIG-113 rider-flip census of record); gates at the flip heads: typecheck
  x4 exit 0, apps/api+packages green, apps/hub green, golden selftest OK.
- Preconditions P2 [MET — replay runs 38158396055 (scheduled) + 38158584864
  (dispatched), both SUCCESS at merge tip af3a56a: UNION VERDICT 223/223 golden
  cases pass (seed 208/208 + prod 15/15), zero non-justified divergences; the
  declared R3-C limiter-429 disposition disclosed per the T-MIG-071 ruling].
- Preconditions P3 [⟨FILL: PASS/FAIL per loop — learner A1–A7, teacher B1–B8,
  tutor C1–C3⟩] per docs/P3-WITNESS-CLICKPATH.md (witnessed ⟨FILL: UTC date⟩,
  operator-init'd table; the expected CORE legs B4/B7/C1–C3 observed as
  disclosed, retirement owned by docs/DECOMMISSION-BANDS-PLAN.md).
- Preconditions P4 [MET] — this entry.
- Cutover executed of record as the DUAL-RUN FLIP-TABLE POSTURE (the §2
  big-bang env flip superseded by the T-MIG-037 flip law): 44 exact rows +
  4 mid-path rows of V2_SURFACE/MIDPATH each golden-gated per family
  (T-MIG-010…115 chain); rollback lever = unset NEXT_PUBLIC_API_V2_BASE_URL
  (the surface test pins every path back to core).
- §3 decay takeover executed of record 2026-10-09 (T-MIG-042 chain:
  DECAY_CRON_ENABLED live, vercel-cron drives the ledger exactly-once —
  21/21 distinct windows, zero double-decay across both schedulers during
  the overlap; the core scheduler running-but-idle by design).
- §4 48-hour watch OPENED 2026-10-09 (T-MIG-042 run-004) and ELAPSED
  2026-10-11 ~07:40Z with continuous union green and zero new non-justified
  divergences throughout.
- §6.1 legacy-repo archive (SyllabAI/syllabai-core, SyllabAI/syllabai-hub —
  read-only, never delete): ⟨FILL: DONE <UTC> / PENDING⟩ — operator-only lever.
- §6.2 Render core disable: GATED on the decommission bands of
  docs/DECOMMISSION-BANDS-PLAN.md reaching the zero-core-routing census —
  not before (the CORE_ONLY live emitters: marking answers detail +
  smart-mark tails, chat SSE hardwire, subjects leaf, and the dormant
  residue enumerated in the plan).

Stage Summary:
- V2 IS LIVE for pilot traffic under the dual-run flip-table posture of
  record; both planes verified live in the P3 witness session. The §6.1
  archive gate is ELIGIBLE and the §6.2 disable is decommission-band-gated.
  Watch window closes ⟨FILL: UTC+48h from the §6.1 archive if re-opened by
  the archive act, or N/A if the operator accepts the elapsed §4 window as
  the watch of record⟩.
```

## Why three blanks and not more

Every other value in the block is a first-hand receipt citation (board census,
replay run ids, decay chain, watch timestamps) that lanes verified and pushed
under the fetch-first law — pre-filling them is faithful transcription, not
testimony. The witness PASS/FAIL, the witnessed date, the archive click
timestamp, and the watch-window disposition are the operator's testimony only,
which is exactly what P4 exists to record.
