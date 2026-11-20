-- T-TUTOR-AIM-P3 run-001 (DC10 §7.7 + §7.8): the served-evidence LEDGER and
-- the drill-loop DIRECTIVE plane. Applied as RAW SQL per the 0007 disclosure
-- law (no drizzle bookkeeping on apply), matching the 0027/0029 precedent.
--
-- tutor_served_evidence — the §7.7 ledger of record: what was ACTUALLY
-- served to this learner, written by the serving path (deterministic, zero
-- LLM, zero extraction — the plan's own words). One row per distinct
-- (session turn, spec node, chunk, kind) observation. spec_node_id is TEXT
-- by design (the plan's sketch of record): the tutor surfaces key rows on
-- the KG node id (uuid-shaped, the same id class skill_states /
-- review_schedules / tutor_topic_engagements already carry) while the
-- drill/mock_mark surfaces key rows on (course, code) drill addresses —
-- one text column admits both id spaces without a union table. chunk_id is
-- nullable: corrections may not map to a chunk (the plan's own comment).
-- session_id + turn_id are NOT NULL: the ledger is SESSION-SCOPED by design
-- — a sessionless ask persists nothing here (its engagement row already
-- logged the ask; the transcript-free ask has no turn of record). Anonymous
-- previews write NOTHING (the account-only law, PR #801 posture).
-- RETENTION (the §12 open question 4 fixed at build time): 180 days — the
-- learner-model's own staleness tau (BDT paper defaults, context.ts); the
-- purge function of record is services/tutor/served-evidence.ts
-- purgeExpiredServedEvidence (the nightly wiring is the disclosed residual —
-- the purge ships unit-pinned, the cron hook rides the next window band).
--
-- tutor_drill_directives — the §7.8 loop's directive plane, the §13.2
-- claimable-artefact home. One row per answer that EARNED a scheduling
-- directive (decay-due matched topics under the held reads), written by the
-- serving path after the §22 turn append fixes the assistant turn id. The
-- directive_id is the DETERMINISTIC hash of (learner, session, turn) — a
-- re-render of the same answer can never mint a second directive for the
-- same turn. claimed_at is the claim's CAS guard: NULL = unclaimed; the
-- claim flips it under `where claimed_at is null` (guard 2 — exactly-once
-- under concurrency) while the row's existence + learner ownership is the
-- server-issued state guard 1. node_ids carries the directive's target KG
-- node ids (uuid jsonb array — catalog metadata only, §13.2: never
-- learner-derived free text); course_ref is the serving ask's course scope
-- (the claim draws at the row's OWN course, never the caller's claim).

CREATE TABLE IF NOT EXISTS "tutor_served_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "learner_id" uuid NOT NULL,
  "spec_node_id" text NOT NULL,
  "chunk_id" uuid,
  "session_id" uuid NOT NULL,
  "turn_id" integer NOT NULL,
  "surface" text NOT NULL,
  "kind" text NOT NULL,
  "served_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tutor_served_evidence_surface_check" CHECK ("surface" IN ('tutor_answer', 'probe', 'drill', 'mock_mark')),
  CONSTRAINT "tutor_served_evidence_kind_check" CHECK ("kind" IN ('citation', 'correction', 'example', 'prereq_recap'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tutor_served_evidence_learner_node_served_idx" ON "tutor_served_evidence" ("learner_id", "spec_node_id", "served_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tutor_served_evidence_session_idx" ON "tutor_served_evidence" ("session_id", "turn_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tutor_drill_directives" (
  "directive_id" text PRIMARY KEY,
  "learner_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "turn_id" integer NOT NULL,
  "course_ref" varchar(64),
  "node_ids" jsonb NOT NULL,
  "correction_node_id" text,
  "scheduled_count" integer,
  "served_at" timestamptz NOT NULL DEFAULT now(),
  "claimed_at" timestamptz
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tutor_drill_directives_learner_served_idx" ON "tutor_drill_directives" ("learner_id", "served_at");--> statement-breakpoint
