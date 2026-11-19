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

The three live courses (chem/phys/bio) predate this law and are
grandfathered in **report mode**: their budget drift (bridge/opener/layer
word counts) is reported at import and by the census, but never blocks.
The P3 backfill generation that authors `interactions[]` re-pins those
artifacts and must declare `chunk_law: "enforce"`.
