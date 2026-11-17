-- T-TUTOR-AIM-P2 run-001 (DC10 §7.4, capture-only): the confidence log.
-- One append-only row per SELECTING tutor ask: the learner's raw
-- self-reported confidence ("sure" | "think_so" | "guessing") — the three
-- buttons, NO server-side default: a no-tap ask inserts NOTHING (the
-- absence of a row IS the null — a no-tap is never recorded as a
-- guessing). LOG-FIRST (the DC10 confidence law's rule 4): nothing in v2
-- READS this table — consumption is gated on weeks of pure logging and on
-- the per-learner normalisation + corroboration + noise-gate rules
-- (§7.4 rules 1/2/5). session_id is the §22 session anchor when the ask
-- carried one (nullable — sessionless asks log too). Anonymous previews
-- log nothing (the account-only law, PR #801 posture). Applied as RAW SQL
-- per the 0007 disclosure law (no drizzle bookkeeping on apply), matching
-- the 0027 precedent.

CREATE TABLE IF NOT EXISTS "tutor_ask_confidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "learner_id" uuid NOT NULL,
  "session_id" uuid,
  "confidence" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tutor_ask_confidence_confidence_check" CHECK ("confidence" IN ('sure', 'think_so', 'guessing'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tutor_ask_confidence_learner_created_idx" ON "tutor_ask_confidence" ("learner_id", "created_at");--> statement-breakpoint
