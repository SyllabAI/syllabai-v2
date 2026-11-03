-- ─────────────────────────────────────────────────────────────────────────────
-- F.5 §7 GATE G4 — THE ANCHOR-TYPE COMPANION CHECK (staged of record)
-- T-MIG-139 · receipt T-MIG-139/run-001 · owner w0a · 2026-10-21
--
-- THE HOLE (S3 battery §1, line-verified at 89962a5 / ad64753):
--   question_spec_points.spec_point_node_id FK → knowledge_nodes.id carries
--   role/state CHECKs only — NOTHING constrains the referenced node to
--   node_type='SPEC_POINT'. Post-G-round the graph satisfies it (8,138/8,138
--   anchors SPEC_POINT); this artifact CLOSES the hole for all future writes.
--
-- ⚠ STAGED, NEVER AUTO-APPLIED (drift discipline of record: "live trigger NOT
-- installed"). This file lives OUTSIDE packages/db/drizzle so no `migrate`
-- run can carry it to production silently. It installs on OPERATOR ORDER
-- only, after re-verifying the enable-time preconditions below.
--
-- Enable-time preconditions (ALL VERIFIED GREEN LIVE on production
-- 2026-10-21 via the read-only census path — scripts/g4-precond.js):
--   teaching_coverage          = 0
--   teaching_coverage_events   = 0
--   anchors_not_spec (question_spec_points ⋈ knowledge_nodes ≠ SPEC_POINT) = 0
--   SPEC_POINT rows            = 663 (4CH1 182 + 4MA1 188 + 4PH1 195 + 4MB1 98)
--   ck_node_type               = 7 values incl SPEC_POINT (the live G1)
--
-- ROLLBACK (zero data impact — the gate table's own law):
--   DROP TRIGGER ck_qsp_anchor_is_spec_point ON question_spec_points;
--   DROP FUNCTION assert_spec_point_anchor();
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assert_spec_point_anchor() RETURNS trigger AS $body$
BEGIN
  IF (SELECT node_type FROM knowledge_nodes WHERE id = NEW.spec_point_node_id)
      IS DISTINCT FROM 'SPEC_POINT' THEN
    RAISE EXCEPTION
      'ck_qsp_anchor_is_spec_point: question_spec_points row % references knowledge node % which is not SPEC_POINT (node_type=%) — anchor-type hole is closed of record (F.5 §7 G4)',
      NEW.id, NEW.spec_point_node_id,
      (SELECT node_type FROM knowledge_nodes WHERE id = NEW.spec_point_node_id);
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

CREATE TRIGGER ck_qsp_anchor_is_spec_point
  BEFORE INSERT OR UPDATE OF spec_point_node_id ON question_spec_points
  FOR EACH ROW EXECUTE FUNCTION assert_spec_point_anchor();
