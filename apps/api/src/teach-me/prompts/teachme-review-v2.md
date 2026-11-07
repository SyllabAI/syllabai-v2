# Pinned prompt `teachme.review.v2` — post-session review generator (async, one call)

> Drop-in path: apps/api/src/teach-me/prompts/teachme-review-v2.md
> Fixture-replayed in CI (T-MIG-039). Bump to v3, never edit in place.
> v2 (2026-11-06): adds the student-voice role guard for strengths — the model
> was quoting the pupil's paraphrase of the student as a "student strength",
> tripping the extractive law (LLM_SHAPE_DRIFT → 409 on /end, review card never
> produced). v2 also adds the empty-list grounding law: when a served list is
> empty, the corresponding array MUST be [] — the model was inventing practice
> resources / exam anchors to fill empty blocks (same 409 class).
> Everything else unchanged from v1.
> Output is validated against the `ReviewCard` zod contract; shape drift =
> fail-closed refusal (LLM_SHAPE_DRIFT).

## Placeholders the API fills (deterministic)

- `{{COURSE_CANON}}` — spec-point canon excerpts for the session's spec points
- `{{OBJECTIVES}}` — objectives + final statuses
- `{{TRANSCRIPT}}` — full turn-by-turn transcript with message_seq
- `{{COVERAGE_ROWS}}` — persisted coverage rows (covered, evidence_quote,
  contradiction_detected per objective/message)
- `{{MISCONCEPTION_REGISTRY_EXCERPT}}` — candidate misconception entries for these
  spec points (id + statement + signature)
- `{{PAST_PAPER_ANCHORS}}` — real past-paper parts for these spec points from the
  serving corpus (paperRef + questionRef only — the model may NOT invent refs)
- `{{PRACTICE_RESOURCES}}` — the course's real question-bank sets + revision-note
  links (label + resourceType + href only)
- `{{PREREQ_WARNINGS}}` — precomputed T-C11 prerequisite warnings (spec point,
  prereq spec point, note) — passed through, not judged

## Instructions

Produce the review card for the student who just taught the session. This card is the
correction of record (ADR-040 D2): anything the pupil could not say in-session is
disclosed here, plainly and kindly.

**Empty-list grounding law (hard rule, tested).** The placeholder blocks above are
served lists. Where a block is empty — rendered as "(none indexed yet)", "(none
indexed for these spec points)", "(no registry entries for these spec points)" or
"(none)" — the corresponding output array MUST be `[]`. NEVER invent a paperRef,
questionRef, href, label or registry id to fill an empty block. An honest card with
empty sections is correct; an invented item is a refusal (LLM_SHAPE_DRIFT).

1. **strengths** (≤ 4): extractive quotes of the STUDENT's own good examples or
   explanations, each with its message_seq. Compose nothing. The student's words are
   exactly the `#n STUDENT:` lines of `{{TRANSCRIPT}}`:
   - `quote` MUST be a character-for-character substring of a `#n STUDENT:` line,
     and `messageSeq` MUST be that same n.
   - NEVER quote a `#n PUPIL…` line — not even one where the pupil paraphrases the
     student's own explanation back in student-sounding voice (the probe pattern
     makes that likely). A pupil paraphrase is the pupil's voice, not a student
     quote: it is a compliment to the student, never a quotable strength. If the
     best material lives only in a pupil line, find the student's own original
     `#n STUDENT:` wording it came from, or drop the item.
   - If no `#n STUDENT:` line contains a genuinely strong example, return an empty
     array — an empty `strengths` is valid; never weaken the extractive rule to
     fill the card.
   - Self-check before answering: for every strengths item, confirm `quote` appears
     verbatim inside the `#messageSeq STUDENT:` line; delete any item that fails
     that check.
2. **improvements** (≤ 4): for each error, misstatement or gap in the transcript:
   `statement` (what the student said, near-verbatim), `correction` (the course-canon
   statement, grounded ONLY in `{{COURSE_CANON}}`), `specPointIds`. If there were no
   errors, return an empty array — do not invent weaknesses.
3. **specPointVerdicts**: one per spec point in the session — covered /
   partially_covered / not_covered / flagged (flagged = pasted-notes overlap from the
   coverage rows). Verdicts come from `{{COVERAGE_ROWS}}`, not from your own
   re-judgement.
4. **misconceptionNotes** (≤ 4): for each error that matches a registry entry in
   `{{MISCONCEPTION_REGISTRY_EXCERPT}}`, emit {statement, matchedMisconceptionId,
   confidence}. If no registry entry matches, emit the note with
   `matchedMisconceptionId: null` and a conservative confidence. Never invent a
   registry id. If the registry block is empty, `matchedMisconceptionId` is always
   null.
5. **examAnchors** (≤ 3): pick from `{{PAST_PAPER_ANCHORS}}` only. If that block is
   empty, return `[]`.
6. **suggestedPractice** (≤ 4): pick from `{{PRACTICE_RESOURCES}}` only — label the
   item by what it practises; never fabricate a href. If that block is empty, return
   `[]`.
7. **prereqWarnings**: pass `{{PREREQ_WARNINGS}}` through verbatim.

## Output — ONE JSON object matching the ReviewCard contract

```json
{
  "strengths": [{ "quote": "…", "messageSeq": 3 }],
  "improvements": [{ "statement": "…", "correction": "…", "specPointIds": ["…"] }],
  "specPointVerdicts": [{ "specPointId": "…", "verdict": "covered", "evidenceQuote": "…" }],
  "misconceptionNotes": [{ "statement": "…", "matchedMisconceptionId": "…", "confidence": 0.8 }],
  "examAnchors": [{ "specPointId": "…", "paperRef": "…", "questionRef": "…" }],
  "prereqWarnings": [],
  "suggestedPractice": [{ "label": "…", "resourceType": "question_bank", "href": "…" }]
}
```

`generatedAt` is stamped by the API, not by you. Tone: direct, specific, encouraging —
a good teacher's written feedback, never condescending, never gaming talk.
