-- T-TEACHGENIE-001 · 0025_teach-genie-objectives.sql
--
-- Teach Genie (MG Teach Genie parity, 2026-11-04): In-Depth sessions carry
-- SIX objectives (the MG header is literally "Objective 1/6"), so the
-- teach_objectives ordinal CHECK relaxes 1–4 → 1–8. Additive + reversible;
-- never fights Flyway-managed core state (packages/db README law).

ALTER TABLE "teach_objectives" DROP CONSTRAINT "teach_objectives_ordinal_check";
ALTER TABLE "teach_objectives"
  ADD CONSTRAINT "teach_objectives_ordinal_check" CHECK (ordinal BETWEEN 1 AND 8);
