# Pinned prompt `teachme.review.v1` — post-session review generator (async, one call)

> Drop-in path: apps/api/src/teach-me/prompts/teachme-review-v1.md
> Fixture-replayed in CI (T-MIG-039). Bump to v2, never edit in place.
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

1. **strengths** (≤ 4): extractive quotes of the student's own good examples or
   explanations, each with its message_seq. Compose nothing.
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
   registry id.
5. **examAnchors** (≤ 3): pick from `{{PAST_PAPER_ANCHORS}}` only.
6. **suggestedPractice** (≤ 4): pick from `{{PRACTICE_RESOURCES}}` only — label the
   item by what it practises; never fabricate a href.
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
