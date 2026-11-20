# DC10 Appendix A — the consultation brief (RECONSTRUCTION)

> **Provenance and honesty note.** The original brief was authored 2026-11
> (trace 1a1b23049c206ef1) and issued **verbatim** to two reviewers: the
> external reviewer (Claude, relayed by the operator) and the GLM substitute
> — that is what makes the three-way comparison in DC10 §9 fair. The original
> text was lost to a sandbox recycle before it could be committed. This file
> is a faithful **reconstruction** from session records: every section, all
> eight questions, and the closing instruction are preserved in substance and
> order; the exact wording may differ from the lost original. Reconstructed
> 2026-11-17. The review trail it seeded is of record in
> `DC10-TUTOR-AIMED-ANSWERING-PLAN.md` (§3, §5, §7, §9, §13).

---

## 1. What SyllabAI is (context you need before judging)

TS monorepo. `apps/api` is Hono + Drizzle on Neon Postgres with pgvector;
`apps/hub` is Next.js. 106+ Edexcel/CIE courses (IGCSE, A-level) with a
structured spec/KG layer: topics, prerequisites, misconceptions, command-word
context — the corpus rows are *ours*, ingested from official specs and
textbook material.

The LLM stack is **$0**: free-tier chains across Groq / Gemini / OpenRouter
with a key-pool failover (DC8). Any design that adds mandatory per-turn LLM
calls is unpayable by construction. Roughly 3,400 API tests hold the line.

House laws, non-negotiable:

- **fail-closed** — a failed read fails the ask; nothing degrades silently
  into invention;
- **pinned prompts** — prompts are versioned artifacts: bump, never edit in
  place, byte-equality test proves the deployed copy is the pinned copy;
- **extractive grounding** — the tutor answers only from served, cited
  evidence; the honesty floor refuses when the sources do not carry the
  answer;
- **AI_SUGGESTED disclosure** — AI-generated content is labelled as such;
- **account-only** — every learner artefact lives in the account (PR #801
  removed device-local persistence entirely).

## 2. The Tutor today (the thing we are upgrading)

The answer path (`karag.ts`, plans DC7/DC9): deterministic intent → KG intent
arm → vector/keyword arms → weighted RRF → spec-boost → rerank seam →
generation + citations. The honesty floor reads the served head before the
model speaks; the v17 refusal/redirect prompts are pinned. DC9 added the KG
intent pivot arm so a mid-thread topic pivot resolves its own context instead
of inheriting the previous topic's.

The learner model is **passive but real**, read **once per ask** (M3 law):
skillStates, misconceptionReadings (with staleness-relaxed effective
probability), activeStruggleInferences, the s140 episodic digest, and
pendingReviews. The reads exist and propagate to the brief, the digest and
the policy — but **the answer is composed as if the learner were a
stranger**. That single sentence is why this study exists.

Adjacent surfaces: a deterministic quiz scaffold; drills with decay-strength
scheduling (F184); mock marking; a sibling face, **Teach SillyAI**, where the
learner teaches the material back (Feynman-style).

## 3. What learnharness does (the mechanisms on the table)

learnharness (amosblomqvist/learnharness, **AGPL-3.0** — mechanisms as ideas
only, zero code, zero prompt text) is an Electron/Next.js "agent harness for
learning". Seven mechanisms survived analysis:

1. **Prober** — per-strand binary bracketing: probe items bisect the
   learner's edge of ability before teaching starts.
2. **Teacher** — a visible plan (Mermaid DAG) of the teaching route, and a
   predict → teach → check rhythm: the learner predicts before being told,
   then is checked; the plan "collapses" lawfully rather than sprawling.
3. **Practitioner** — retrieval-practice discipline: an inactivity
   constraint (no new teaching while recall is unproven), **interleave by
   default**, a recall → discrimination → composition ladder, an R0–R5 hint
   ladder (hints fade from generic to specific), and decision points per
   minute.
4. **Per-learner knowledge graph** — propositions and reasoning chains
   extracted **only from the teacher's prose** (extractor → identity auditor
   → deterministic merger), with provenance down to the session turn. It
   stores *what was taught*, deliberately **not** mastery.
5. **Voice laws** — no praise padding ("great question"), no agreement bias
   (never validate a wrong premise to be kind).
6. **Distractors encode error models** — every wrong MCQ option is built
   from one specific, documented misconception, so a wrong pick names the
   wrong model, not just "incorrect".
7. **Honest posture** — it is a corpus-less tutor: it must infer state from
   prose because it has nothing else. We are not corpus-less.

## 4. The proposal under review (v1 / v2 / v3)

- **v1 — cheap capture and voice.** (a) a **confidence field** on ask
  events (learner self-reports how sure they are); (b) **distractors encode
  misconceptions** in quiz generation, with wrong picks landing as
  misconception readings; (c) a **voice law** for the tutor: no praise
  padding, no premise-agreement, correction-first.
- **v2 — teaching cadence.** (a) a **diagnose mode**: prober-style
  bracketing before answering, when signals suggest it; (b) a **predict →
  check cadence** inside the Q&A flow.
- **v3 — the learner graph.** A served-evidence-grounded per-learner graph:
  extractor → auditor → merger distilling the tutor's own served answers
  into propositions with turn provenance.

## 5. The eight questions

1. **Thesis.** I framed this upgrade as "the librarian becomes the teacher."
   Is that the right framing, or is the real defect something else?
2. **Ordering.** Across the seven mechanisms and v1–v3: what builds first,
   what never builds, and why?
3. **Confidence.** Can a self-reported confidence field ever be trustworthy
   enough to consume — and under exactly which rules — or is it noise we
   should not ship?
4. **Diagnose friction.** Is pre-answer diagnosis acceptable at all? If the
   answer must come first, how does diagnosis ever happen?
5. **Cadence vs Q&A.** Does predict → teach → check belong inside the Q&A
   flow, or does any such cadence hijack the answer the learner asked for?
6. **Missing levers.** What important lever did this proposal not surface?
7. **Risks.** Name the three biggest risks of this roadmap, and for each the
   **cheapest test that would retire it**.
8. **One thing.** If we had six weeks and could ship exactly one thing, what
   would it be and why that one?

## 6. The closing instruction (unchanged from the original)

**Challenge, don't admire.** Attack the thesis, kill the weak ideas
outright, name what is missing, and hold every recommendation against the
$0 stack, the house laws, and the fact that the learner came to *get an
answer*, not to be processed. A verdict that only admires the proposal is a
failed review.

---

*End of reconstruction. The reviews this brief produced: external review —
condensed decision log in DC10 §9; GLM substitute — Appendix B. The
converged outcome is DC10 itself.*
