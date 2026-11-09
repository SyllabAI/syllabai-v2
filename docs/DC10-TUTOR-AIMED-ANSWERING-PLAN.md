# DC10 — Tutor upgrade: keep the grounding, add the aim (T-TUTOR-AIM-1)

**Status:** proposed, not started · **Date:** 2026-11-09 · **Provenance:** operator-directed upgrade study — learnharness mechanism analysis → internal v1/v2/v3 proposal → adversarial external review (Claude, relayed by operator, 2026-11) + GLM substitute review + ai-memory governance review (hardening only, 2026-11) · **Trace:** 1a1bcaac733073a1 · **Succeeds:** DC7 / DC9 (tutor retrieval, pivot, refusal — untouched; this plan layers above them)

## 1. Thesis

The tutor answers fast, grounded and honestly. The defect DC10 targets is not
retrieval. It is that the learner context the pipeline **already reads once per
ask** (`learner-model.ts`: skillStates, misconceptionReadings with the MED-2
staleness-relaxed effective probability, activeStruggleInferences, the s140
episodic digest, pendingReviews — five call sites owned by `assembleContext`,
single-read M3 law) **never reaches answer composition**. The reads feed the
brief, the digest and the policy, then the answer is written as if the learner
were a stranger.

The framing correction from the external review, recorded because it changes
what we build: the original pitch read as "fix the librarian → turn the
librarian into a teacher." That is the wrong reading. The librarian is fine.
The converged directive is: **answer the question fast, then use what we know
about the learner to make the answer better and the follow-up smarter — keep
the grounding, add the aim.** Answer-shape personalisation is cheap and
invisible; interaction-shape personalisation (probing, cadence) spends learner
time and is therefore rationed to one optional post-answer probe.

## 2. Provenance and method

1. **learnharness analysis** (amosblomqvist/learnharness, AGPL-3.0): Prober
   bracketing, Teacher predict→teach→check with visible plan, Practitioner
   retrieval practice, per-learner knowledge graph built by
   extractor→identity-auditor→deterministic-merger, voice laws, distractors
   that each encode a specific error model. Full mechanism notes were produced
   in-session; the mechanisms DC10 borrows and the ones it rejects are listed
   in §5 and §7. **Clean-room note:** learnharness is AGPL-3.0; DC10 borrows
   *mechanisms as ideas*, zero code, zero prompt text. This document is the
   disclosure of that inspiration.
2. **Internal proposal** (v1/v2/v3, 2026-11): v1 confidence + misconception
   distractors + voice law; v2 diagnose mode + predict/check cadence; v3
   served-evidence-grounded learner graph.
3. **Consultation brief** issued to an external reviewer — Appendix A
   (reconstructed from session records; the original text lives in operator
   chat, trace 1a1b23049c206ef1).
4. **GLM substitute review** — Appendix B (position summary; ran on the same
   brief when no direct Claude path existed).
5. **External review (Claude, relayed by operator)** — the decisive input.
   Its full text lives in operator chat; §9 carries the condensed decision
   log with the load-bearing quotes.
6. **ai-memory governance review** (akitaonrails/ai-memory, MIT, 2026-11) —
   a post-approval hardening pass, not a mechanism source: no mechanism
   adopted, three governance patterns adopted as §13.

Convergence rule applied: where at least two of the three reviews converged
independently, adopted; where they split, the operator's phasing directive
decides (distractors + voice law → confidence + aimed answering → ledger +
loop).

## 3. Verdicts on the original v1/v2/v3

| proposal | verdict | rationale |
|---|---|---|
| v1 confidence field | **Adopt, log-first** | ship the three-button capture, do NOT consume it at launch; calibration first (§7.4) |
| v1 distractors encode misconceptions | **Adopt, build first** | rated the strongest idea on the table by the external review; a schema foothold already exists (§7.1) |
| v1 voice law | **Adopt** | one pinned-prompt bump, nearly free (§7.2) |
| v2 diagnose-as-prologue | **Kill** | an interrogation wall before the answer hijacks learner time and breaks the first-answer law (§5) |
| v2 predict/check cadence in Q&A | **Kill here, relocate** | cadence belongs to Teach SillyAI; change the handoff copy instead (§7.8) |
| v2 one optional post-answer probe | **Adopt** | collapsed form of "check your understanding"; deterministic selection (§7.6) |
| v3 extraction learner graph | **Kill as proposed; reshape as served-evidence ledger** | four independent reasons, §5; the reshape is deterministic and LLM-free (§7.7) |

## 4. What the learner sees (plain changelog)

| # | today | after DC10 | example |
|---|---|---|---|
| 1 | ask → answer | ask → **Sure / Think so / Guessing** (no default) → answer | "Sure" + later wrong drills = strongest misconception signal there is, at zero LLM cost |
| 2 | distractors are plausible filler | each wrong option **names the misconception it encodes** | circuits MCQ: "current gets used up by the bulb" pick → we know *which* wrong model they hold |
| 3 | same answer for everyone | answers **aimed** at the known learner | two students ask about rate vs temperature: the one with the "particles expand" reading gets it killed in line one; the one who proved collision theory gets straight to Maxwell–Boltzmann |
| 4 | re-teaches proven things | **no re-derivation** of what the ledger shows was taught and drilled right | photoelectric effect explained in 4 prior sessions → one line, move on |
| 5 | nothing | **one optional probe** after the full answer, only near a known gap | projectile range question ends: "Quick check — at 45°, which component determines range?" |
| 6 | answers ignore command words | **mark-scheme-shaped answers** per command word | "State…" → one line; "Explain…" → because/therefore chain; "Evaluate…" → both sides + judgement |
| 7 | tutor and drill scheduler are strangers | answers **touch the revision schedule** | titration question + stoichiometry in decay → "I've added 3 practice items for tonight" |
| 8 | praise padding, premise-agreement | **calmer voice** | "Since heavier objects fall faster…" → the premise is corrected plainly, no "great thinking!" |

Items 1–2 land in P1/P2 and are invisible until data accrues; items 3 and 6
are the ones a learner notices on day one.

## 5. Kill list (and why, so nobody re-proposes these)

1. **Diagnose-as-prologue.** No interrogation wall before the answer. The
   Prober's bracketing is a nice mechanism in a product whose whole surface is
   teaching; in a Q&A tutor it taxes every ask to serve the minority of asks
   that need diagnosis. The collapsed survivor is §7.6.
2. **Withholding or delaying the answer for cadence.** Frozen rule: **the
   first answer must fully answer the question.** Predict-then-reveal pacing
   is Teach SillyAI's job.
3. **v3-as-proposed (extractor → identity auditor → merger learner graph).**
   Four reasons, from the external review, all accepted:
   (a) served evidence is derivable from a join table
   `(learner_id, spec_node_id, chunk_id, session, turn, served_at)` with zero
   LLM; (b) extractor+auditor+merger is ≥2 LLM calls per turn on a $0 stack —
   unpayable; (c) learnharness extracts propositions from teacher *prose*
   because it has no corpus — our KG proposition rows already ARE the corpus;
   (d) "never store mastery" is learnharness's honest posture as a
   corpus-less tutor, and it is simply wrong for us: mocks, drills and marks
   are ground truth we already store.
4. **Mastery-from-prose inference.** Same reasoning as 3(d): mastery signals
   come from marked work, never from prose extraction.
5. **Device-local anything.** House law (PR #801, merge `630d0c9e`): every
   learner artefact is account-side.

## 6. Phasing

Operator directive: distractors + voice law first, then confidence + aimed
answering, then ledger + loop.

### Phase 1 — content and prompt only, no learner data
- §7.1 misconception-coded distractors (generation discipline + marking write)
- §7.2 voice law (one prompt bump)
- §7.3 command-word / mark-scheme answer shapes (one prompt bump; can share
  the P1 changeset if the bump discipline prefers one deploy)

### Phase 2 — confidence + aimed answering
- §7.4 confidence buttons (capture only)
- §7.5 aimed answering (consume the already-read learner context in
  composition; one indexed read per ask is preserved — this extends the M3
  law, it does not add a read)
- §7.6 single optional post-answer probe

### Phase 3 — ledger + loop
- §7.7 served-evidence ledger (deterministic writes)
- §7.8 tutor→drill scheduling hook + Teach SillyAI handoff copy
- §7.9 calibration surfaces + exam-date awareness (consume-later)

### Cross-cutting laws, every phase
- First answer complete, always.
- **Degrade-never-block:** any new optional enhancement call degrades to the
  plain grounded answer. Skip the enhancement, never skip the answer.
- One indexed learner read per ask (M3 law stands; composition consumes what
  the read already returned).
- All prompt changes via bump, byte-equality test; no in-place edits.
- Fail-closed posture unchanged; account-only unchanged; AI_SUGGESTED
  disclosure law unchanged.

## 7. Feature specs

### 7.1 Misconception-coded distractors (P1, build first)
The foothold exists: `apps/api/src/services/assessment/types.ts` already
declares, for MCQ, a "misconception node the chosen distractor expresses", and
`services/learner-model/model-update.ts` already consumes distractor identity
on model updates. The work is discipline and closure, not schema:

1. **Generation law:** every generated distractor MUST name its misconception
   node, drawn from the KG's per-topic misconception rows
   (`kg-retriever.ts` / `graphs.ts` — the catalog already exists, no new
   content store). A distractor that cannot name one is regenerated or cut.
   Enforced by generation-prompt bump + conformance lint, not by runtime
   hope.
2. **Marking closure:** a wrong pick lands as a misconceptionReading that
   references the catalog node id — never free text (see §11 injection
   risk).
3. **Consumption:** readings from this source corroborate confidence (§7.4)
   and feed aimed correction (§7.5).

**Retirement test:** if misconception-coded picks show no agreement with
independent signals and no effect on downstream drill performance over 4
weeks, revert the generation law to optional. Cheap kill: it is a lint rule
and a prompt bump.

### 7.2 Voice law (P1)
Pinned-prompt additions to the tutor generation bump: no praise padding ("great
question"), no premise-agreement bias (never open by validating a wrong
premise to be kind), correction-first posture, plain register. This is a
content-law bump with the byte-equality test; no new calls, no new data.

### 7.3 Command-word / mark-scheme literacy (P1)
Rated the biggest single exam-mark lever by all three reviews, and the
cheapest: command words are printed on the papers.

1. Deterministic command-word classification from the ask + spec wording
   (state / describe / explain / calculate / compare / evaluate …), with a
   per-board wording audit as an open question (§12).
2. Answer-shape guidance per command-word family in the pinned generation
   prompt: STATE = one line; EXPLAIN = because/therefore chain; EVALUATE =
   both sides + explicit judgement; CALCULATE = full working.
3. Shapes stay extractive-grounded and cited — the law changes the *shape*,
   never the *sourcing*.

### 7.4 Confidence capture (P2, log-first)
Three buttons — **Sure / Think so / Guessing** — no default, stored raw on the
ask event (`confidence: 'sure' | 'think_so' | 'guessing' | null`, nullable, no
server-side default).

Five consumption rules, from the external review, all accepted:
1. **Per-learner normalisation only** after ~15 responses: deviation from the
   learner's OWN baseline, never population stats.
2. **Never the sole basis of a misconception reading.** High confidence +
   wrong outcome needs independent corroboration (e.g. a distractor-encoded
   pick on the same node) before it touches the model.
3. **Honesty at zero cost:** the answer never tells the learner their
   confidence influenced anything.
4. **Log first, consume later:** 2–3 weeks of pure logging before any
   consumption ships.
5. **Noise gate:** if sure-vs-guessing accuracy gap stays under ~10 points,
   it is noise — stay log-only.

### 7.5 Aimed answering (P2, the core change)
`assembleContext` already performs the one indexed learner read per ask. DC10
extends **consumption into composition** (`karag.ts` generation path +
`prompt.ts`):

- strongest active misconception for the target node → explicit correction in
  the opening line ("First — particles don't get bigger, they just move
  faster…");
- proven prerequisites → compressed to one line, no re-derivation;
- examples biased toward proven-strong adjacent areas;
- decay-due target → flagged for the §7.8 hook.

Guardrails:
- Extractive grounding unchanged — aimed shaping selects and orders cited
  material; it never introduces a new claim class.
- **Empty-context byte-stability:** with empty learner tables the answer path
  is byte-equivalent to today (the EMPTY-tables posture in
  `learner-model.ts` becomes the regression test).
- Degrade-never-block: if the learner read or shaping fails, the answer is
  the plain grounded one.
- The first answer fully answers the question. Aim changes *content*, never
  *timing*.

### 7.6 Single optional probe (P2)
Deterministic selection, no LLM: offered only when an adjacent prerequisite
node of the answered topic carries an active gap signal (misconceptionReading
or weak skillState). At most ONE probe per ask, AFTER the full answer,
explicit opt-in copy ("Quick check — …"). Ignoring it does nothing. Sessions
accumulate the bracketing behaviour naturally (one per ask ceiling). No
prologue, ever (§5.1).

### 7.7 Served-evidence ledger (P3)
The v3 reshape. A deterministic join table written by the serving path —
what was actually served to this learner:

```sql
tutor_served_evidence (
  id           uuid primary key,
  learner_id   uuid not null,
  spec_node_id text not null,
  chunk_id     uuid,            -- nullable: corrections may not map to a chunk
  session_id   uuid not null,
  turn_id      int  not null,
  surface      text not null,   -- 'tutor_answer' | 'probe' | 'drill' | 'mock_mark'
  kind         text not null,   -- 'citation' | 'correction' | 'example' | 'prereq_recap'
  served_at    timestamptz not null default now()
);
-- index (learner_id, spec_node_id, served_at)
```

Zero LLM. Zero extraction. Consumers: aimed answering's no-re-teaching rule
(§7.5), the drill loop (§7.8), and the outcome metric (§10). Escalation
toward anything richer is allowed only after 6–8 weeks of live evidence that
ledger + existing learner state is insufficient.

### 7.8 Tutor→drill loop + handoffs (P3)
After an answer, deterministic rule: if the target node (or the prerequisite
hit by a correction) is decay-due under F184 decay strength
(`services/drill/`), the response metadata carries a scheduling directive;
the hub surfaces it as "added N practice items for tonight." No LLM in the
decision. Additionally: when a misconception correction landed, the answer may
close with the Teach SillyAI handoff ("want to test this by teaching it?") —
this is where predict→teach→check cadence lives, per §5.2.

### 7.9 Calibration surfaces + exam-date awareness (P3, consume-later)
Once the confidence log has a curve: a learner-visible calibration read-out
("when you say you're sure, you're right 85% of the time"). Exam-date
awareness: pass the sitting date into prompt assembly so pendingReview
spacing and answer emphasis weight the calendar. Both are consume-later —
nothing here blocks P1–P2.

## 8. House-law compliance checklist

| law | DC10 posture |
|---|---|
| fail-closed | unchanged; learner-read failure degrades shaping, not grounding |
| pinned prompts, bump + byte-equality | §7.2/§7.3/§7.5 are bumps; §7.1 touches generation prompts as a bump |
| extractive grounding + citations | §7.5 reshapes selected cited material only |
| AI_SUGGESTED disclosure | unchanged; no new unlabelled AI-content class |
| account-only | ledger + confidence live account-side (PR #801 posture) |
| $0 stack | DC10 adds ZERO mandatory LLM calls; the only candidate optional call (none currently specified) would be degradable |
| single indexed learner read per ask | M3 law preserved; composition consumes the existing read |
| first answer complete | frozen rule, §5.2 |

## 9. Decision log — the three-way review, condensed

The brief asked eight questions (Appendix A). Positions: **[int]** internal
proposal, **[glm]** GLM substitute (Appendix B), **[ext]** external review
(Claude, relayed). Decisions in §3/§5–§7.

1. **Thesis verdict** — [int] librarian→teacher framing; [ext] rejected the
   framing: *"your tutor discards information it already has"*; directive:
   *"Answer the question fast, then use what you know about the learner to
   make the answer better and the follow-up smarter"*; don't read the roadmap
   as "fix the librarian" but *"keep the grounding, add the aim."* → adopted
   as §1.
2. **What to build first** — [int] confidence in v1; [ext] distractors first
   ("the best idea in the document"), voice law ≈free, confidence ships
   unconsumed. → §6 P1/P2.
3. **Is confidence trustworthy?** — [glm] binary only; [ext] three buttons +
   five rules (§7.4). → three buttons, log-first.
4. **Diagnose friction** — [glm] opt-in diagnose; [int] prologue; [ext] kill
   the prologue, answer-first + one optional probe. → §7.6.
5. **Cadence vs Q&A** — [ext] aimed answering yes (content), hijacking no
   (timing); cadence → Teach SillyAI handoff. → §5.2, §7.8.
6. **Missing items surfaced by review** — command-word/mark-scheme literacy
   (adopted §7.3), tutor→drill loop (§7.8), exam-date awareness (§7.9),
   outcome metric (§10), worked-example fading (**open question**, §12),
   learner-signal read limits (already law, §7.5), one prompt bump for P1
   (§6), degrade-never-block (§6), *"visible payoff is the moat"* (§4).
7. **Three risks + cheapest retire test** — per-feature retirement tests in
   §7.1/§7.4/§10 rather than a separate risk register.
8. **Six weeks, one thing** — the external review's answer: the aimed answer
   plus the misconception distractor loop, because that pair is the visible
   payoff; operator phasing puts distractors + voice law first as the
   no-risk on-ramp. → §6.

## 10. Metrics and retirement tests

Honesty note first: ~3,400 API tests prove the plumbing works, not that
learners improve. DC10's outcome probe: mock-mark trajectory on
ledger-covered nodes vs uncovered nodes, directional only, no causal claim.

| feature | signal | cheapest kill test |
|---|---|---|
| misconception distractors (§7.1) | corroboration with independent readings; drill performance after a coded pick | 4 weeks of no agreement + no drill delta → revert generation law to optional |
| confidence (§7.4) | sure-vs-guessing accuracy gap | gap < ~10 pts after 2–3 weeks → stay log-only indefinitely |
| aimed answering (§7.5) | re-explanation rate of proven prereqs ↓; misconception recurrence on corrected nodes ↓ | no measurable delta in 4 weeks → reduce to misconception-correction only |
| probe (§7.6) | uptake rate | <5% uptake over 4 weeks → kill the surface |
| ledger (§7.7) | write volume, query cost | write amplification pain → batch/async writes before any design retreat |
| drill loop (§7.8) | completion rate of scheduled items | low completion → keep the directive, drop the copy |

## 11. Risks

1. **Prompt injection via stored learner text.** Misconception readings and
   struggle strings are data; if re-served into prompts as free text they are
   an injection surface. Law for DC10: composition context references catalog
   NODE IDS (KG misconception rows), never free-text readings. The rendering
   of the correction is generated from the cited material, not from the
   stored string.
2. **$0 stack budget.** DC10 adds no mandatory LLM calls: P1 is prompt bumps
   + lint; P2 consumes an existing read; P3 is deterministic writes. Any
   future optional enhancement call must degrade (§6).
3. **AGPL-3.0 contamination.** Mechanisms-as-ideas only, no code, no prompt
   text (§2.1). Any future temptation to copy learnharness code goes through
   an operator licence decision, not an engineer.
4. **Confident-wrong amplification.** Mitigated by §7.4 rule 2 (corroboration
   required).
5. **Ledger write volume.** Index defined in §7.7; retention window is an
   open question (§12) to be fixed at build time, not at design time.

## 12. Open questions

1. Does confidence attach to every ask or first ask of a thread only?
2. Probe frequency cap per session/day (beyond the one-per-ask ceiling)?
3. Command-word wording differs per board (Edexcel vs CIE) — needs a
   spec-wording audit before §7.3 pins.
4. Ledger retention window and any aggregation law.
5. Normalisation threshold N≈15 — tune from the calibration curve, not a
   priori.
6. Worked-example fading (external review's surfaced item) — parked; only
   meaningful once §7.5 ships.

## 13. Hardening amendments (ai-memory review, 2026-11-09)

Post-approval review of akitaonrails/ai-memory (MIT-licensed Rust
agent-memory layer, v3.4.4). Different problem class — one operator's
context across disposable coding-agent sessions, stored as an
LLM-consolidated prose wiki — versus one learner's structured,
ground-truth-backed state; its storage model is exactly what §5.3/§5.4
already rejected for learner memory. **No mechanism adopted.** Three
governance patterns adopted as amendments below; all lint-or-wording,
zero new LLM calls, zero schema changes.

### 13.1 Prompt instruction budget (governs the §7.2/§7.3/§7.5 bumps)

Reliable instruction-follow tops out around 150–200 instructions; past
~200 lines measured adherence drops by more than 30%, and the drop hits
the load-bearing rules too — prompt bloat weakens the laws that already
matter. DC10 adds law text to pinned prompts in every phase, so:

- each pinned tutor prompt carries a hard imperative-line budget,
  enforced by a build-time lint that fails the bump over cap;
- admission test per line: "would removing this cause a mistake?" — if
  no, it is retrieval knowledge, not prompt law;
- promotion is subtractive: admitting a law names the law it replaces or
  evicts; a bump never grows the budget silently.

### 13.2 Offer-not-claim nudge semantics (governs §7.6 and §7.8)

The probe, the drill-scheduling directive and the Teach SillyAI handoff
are OFFERS: they claim nothing and consume nothing until the learner's
explicit tap. Ambient surfaces carry metadata only (count, node id,
availability) — never learner-derived free text, which stays behind the
explicit accept; this sharpens the §11.1 injection law (node IDs, never
free-text readings). A claimable artefact (e.g. one scheduled drill set)
is claimed exactly once under two independent state guards, so a
re-render cannot double-schedule it.

### 13.3 Gate taxonomy: mechanism evidence ≠ default-on (governs §6 and §10)

Two separable decisions, never collapsed: (a) the mechanism passed its
benchmark, (b) the mechanism ships default-on and its copy is frozen.
DC10's retirement tests prove (a); (b) is a separate bump with its own
byte-equality test. A passing measurement never silently implies a
default flip or a prompt-copy change.

### 13.4 Parked, explicitly not adopted

Verbatim residue for budgeted projections: when a bounded projection
drops items, regex-mine literal tokens (quantities, units, command words,
spec codes) from exactly the dropped text and append them as a bounded
zero-LLM block, byte-identical when off. Plausible refinement for long
quantitative threads under the 4-turn/1200-char working-memory blend;
parked because DC7/DC9 already own the retrieval-side pollution and this
is a refinement, not a lever. Revisit only if live multi-turn threads
show lost quantities mattering.

## Appendix A — the consultation brief (reconstructed)

Rebuilt 2026-11-09 from session records; the original text was authored
2026-11 and lives in operator chat (trace 1a1b23049c206ef1). Substance
preserved; wording may differ. The brief was issued verbatim to the external
reviewer and to the GLM substitute — both reviewed the SAME text, which is
what makes the three-way comparison in §9 fair.

Contents of the brief: SyllabAI context (TS monorepo, apps/api Hono+Drizzle
+Neon/pgvector, apps/hub Next.js; 106+ Edexcel/CIE courses; $0 LLM stack with
key-pool failover; house laws: fail-closed, pinned prompts with bump +
byte-equality, extractive grounding, AI_SUGGESTED disclosure, account-only);
tutor current state (deterministic intent → KG intent arm → vector/keyword
arms → weighted RRF → spec-boost → rerank seam → grounded generation with
citations; honesty floor; DC7 pivot arm; DC9 KG intent pivot; passive learner
model read once per ask but weakly consumed; deterministic quiz scaffold;
drills with decay; Teach SillyAI); the seven learnharness mechanisms; the
v1/v2/v3 proposal; and the eight questions reproduced in §9. The brief's
closing instruction to the reviewer: challenge, don't admire.

## Appendix B — GLM substitute review (position summary)

Ran on the identical brief when no direct Claude path was available; clearly
labelled as a substitute at the time, retained here because two of its
positions independently converged with the external review. Positions:
kill v3 as proposed (converged with the external review); merge v1+v2 into
one pass; binary confidence rather than three buttons (rejected — §7.4 keeps
three buttons with the log-first gate); opt-in diagnose mode (rejected —
§7.6 keeps the collapsed post-answer probe instead). Full text was produced
in-session and lives in operator chat.
