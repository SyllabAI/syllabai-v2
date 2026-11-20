# Guided-lessons authoring checklist (P3, redesign plan §8)

The governance pieces of record for every future guided-corpus generation.
The import runner's **G-CHUNK gate** (`run_import.mjs`, powered by
`src/lib/guided-chunk-law.mjs` — the same module the renderer's arc uses)
enforces most of this at bake time: declare `chunk_law: "enforce"` on the
feed and violations FAIL-CLOSED before landing.

## Content laws (all validated at import)

- **One concept per lesson**; modules carry one idea each.
- **Opener** ("Here is what this lesson covers"): ≤ 45 words (§5.3).
- **Prerequisite bridge** (the primer): one beat, ≤ 45 words (§6).
- **Key points**: one per card, or two per card when BOTH fit 30 words
  (§5.2 — the renderer's `keyPointGroups` pairing law); each ≤ 30 words.
- **Depth layers**: every band (low, medium) carries restatement ("In plain
  words"), analogy ("Think of it like this") and exam pointer ("Exam
  pointer"), each ≤ 45 words (§8 mandatory beats + §6 beat law).
- **Check→key-point mappability**: every module with checks maps at least one
  check to a key-point group (§8). Multi-group checks staying in the end
  block is fine — that is the designed conservative fallback (§7).
- **Interaction cadence** (§8): once a module carries any `interactions[]`,
  at least half its checks must carry one — "one interaction per one or two
  beats". Widget payloads must satisfy `lib/guided-interactions.ts`'s
  fail-closed laws (an unplaceable drag-label or unbuildable eq-builder
  never ships).
- **Figures** are referenced by the key point they illustrate (FIGURES-2.1:
  a figure rides the card it was authored after).

## QA signals of record (§8 QA harness)

- `bun run qa:guided-census` — the payload census (beat budgets, interleave
  rate, interaction presence) across the live courses; interleave-rate
  parity anchors: chem 71.0% / phys 67.4% / bio 72.0% (P1 QA, 18 Nov 2026).
- `bun run test:e2e:guided` — the §8 headless walk: one sample lesson per
  staged course in a real browser after every bake (stage takeover, beat
  cards, MCQ wrong-answer → See it again / Ask the tutor, Escape exit).

## Legacy corpus

The three live courses (chem/phys/bio) predate this law and were
grandfathered in **report mode** until the compression lane landed.
The P3 backfill landed in two declared runs: **run-002** (the
`interactions[]` generation — packages-only delta, zero lesson bytes, report
mode) and **run-003** (the beat-compression lane — the 853 over-budget beats
hand-authored to law, every compressed note's stream anchor re-pinned, and
`chunk_law: "enforce"` live on the three run-003 feeds: the drift the census
table makes visible can never re-land). Post-run-003 census: **zero
violations** across all three courses; interleave anchors 71.0% / 67.4% /
72.0% reproduced (phys mapped count 1644 -> 1643, percentage unchanged —
the only mapping-input change is the 2 compressed physics key points in
rn_ZgGMNrRGBKvYxxFf L1/L2, disclosed).

run-003 also carries the run-002 review follow-up (PR #1138 review, operator
trace c0a36936075e53f86f0bddaa1751a1de): four chemistry sort-match payloads
passed the authoring numeric gate by comma-stripping, but their options are
electronic-configuration shell lists, not "value + ≤3-word unit" sets —
rn_Syxyh4Fct8KFg8NQ L1::Q3 / L1::Q4 / L2::Q5 and rn_mBqgkpZ3hbSBmWCC L2::Q3
(the mark scheme stays unique and winnable, but the electron-total reading
ties 2,8,9 vs 2,8,8,1). Re-derive those four checks under the strict
thousands-grouping gate (`-?\d{1,3}(,\d{3})+(\.\d+)?` — keeps `576,000 s`,
rejects shell lists) via the KIND_PRIORITY fallback, in the same landing as
the enforce flip. **DONE in run-003**: three landed as table-fill
(rn_Syxyh4Fct8KFg8NQ L1::Q3 / L1::Q4, rn_mBqgkpZ3hbSBmWCC L2::Q3) and one as
drag-label (rn_Syxyh4Fct8KFg8NQ L2::Q5 — the module-aware fallback: table-fill
would have collapsed that module's opt-in kind mix); plain integers carry no
comma and are untouched by the gate (the pre-existing legitimate sort-matches,
e.g. rn_Syxyh4Fct8KFg8NQ L1::Q2's 32/8/18/2 electron counts, stay). Learner
exposure remains zero: stage mode is allowlist-gated and chemistry is not yet
allowlisted in production.
