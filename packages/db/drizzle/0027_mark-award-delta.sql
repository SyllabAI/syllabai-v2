-- T-MG-MARK-DELTA-1 run-001 (rollout plan Lane E; plan of record:
-- docs/MG-MARK-ROLLOUT-PLAN.md §3 Lane E over docs/MG-MARK-PARITY-PLAN.md
-- §1.9). ONE additive migration on mark_awards, the 2026-11-04 live-capture
-- contract delta:
--   attempt_class — the observed verdict classification (full | partial |
--     blank; MG's `attempt: "full"` field, rollout plan §2 observation 4)
--     stamped per award row by the doctrine-match pipeline;
--   cache_hash — the re-mark content hash ({content bytes, ink-doc revision,
--     mark_points version}; identical re-marks short-circuit to the standing
--     award, "mark again with AI" forces a fresh job — MG's re-mark
--     semantics + our cost law, rollout plan §6 risk 3).
-- BOTH nullable: pre-existing rows stay honest (absence = the additive law;
-- no backfill, no rename, no removal). Applied as RAW SQL per the 0007
-- disclosure law (no drizzle bookkeeping on apply).

ALTER TABLE "mark_awards" ADD COLUMN "attempt_class" text;--> statement-breakpoint
ALTER TABLE "mark_awards" ADD COLUMN "cache_hash" text;--> statement-breakpoint
ALTER TABLE "mark_awards" ADD CONSTRAINT "mark_awards_attempt_class_check" CHECK (attempt_class IS NULL OR attempt_class IN ('full', 'partial', 'blank'));
