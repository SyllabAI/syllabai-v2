-- DC-3 re-attempt economics (spec §3.3, docx sha256 0da8044a...):
-- the attempt ordinal is first-class on the mark row, counted at the single
-- markAttempt path -- never inferred (spec mechanics of record). Key =
-- (learner, part, mark_scheme_id): the mark_schemes row (question_version_id,
-- version_label) is the scheme revision of record, so a revision bump starts
-- a fresh ordinal (acceptance b). Refusal rows (SCHEME_NOT_VALIDATED) are not
-- marks and stay NULL (they carry the refused scheme's id, so the exclusion
-- keys on failure_reason, not on mark_scheme_id). Backfill ranks existing
-- marks by created_at order -- a blanket default of 1 would lie for re-marks.
ALTER TABLE "smart_mark_results" ADD COLUMN "attempt_ordinal" integer;
UPDATE "smart_mark_results" r
SET "attempt_ordinal" = sub.rn
FROM (
  SELECT r2.id, ROW_NUMBER() OVER (
    PARTITION BY at.learner_id, a.question_part_id, r2.mark_scheme_id
    ORDER BY r2.created_at, r2.id
  ) AS rn
  FROM "smart_mark_results" r2
  JOIN "answers" a ON a.id = r2.answer_id
  JOIN "attempts" at ON at.id = a.attempt_id
  WHERE r2.mark_scheme_id IS NOT NULL
    -- DC-3: a SCHEME_NOT_VALIDATED refusal is not a mark (it delivered no
    -- feedback) -- excluded from the ordinal sequence, same as the live law
    AND r2.failure_reason IS DISTINCT FROM 'SCHEME_NOT_VALIDATED'
) sub
WHERE r.id = sub.id;
