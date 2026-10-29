-- ============================================================
-- WAREHOUSE TEMPLATE v3 (wh-v3) — seneca_resources MULTI-COURSE EDITION
-- ============================================================
-- Owner: T-SENECA-001 (rollout wave, operator rulings trace 1a16fa6c496aa371:
-- placement (a) W1-interim for ALL course groups; IAL -> Seneca "International
-- A Level"; variant families INCLUDED per course).
--
-- Template law (wh-v2 fragment header): a template version is FROZEN DDL
-- applied as a whole, never an ALTER on a live warehouse.
--   wh-v3 := wh-v2 + THIS fragment, where THIS fragment re-shapes
--   seneca_resources from PRIMARY KEY (id) to PRIMARY KEY (id, course_slug).
--
-- WHY (the rollout law, plan-of-record amendment D10): one Seneca resource
-- genuinely serves SEVERAL hub courses (a Combined-award chemistry section
-- serves 4SD0; an Edexcel-iGCSE maths section serves 4MA1 Foundation AND
-- Higher AND the 2024 modular units). Under PK(id) a row can only ever live
-- in one course — last-write-wins, later courses starve. wh-v3 makes the
-- (resource, course) PAIR the unit of storage: each hub course gets its own
-- library instance of every resource that matches its group rule. Storage
-- stays far under the 0.8 GB course-group cap (~tens of MB for the rollout).
--
-- Migration of record onto the LIVE sci-chem warehouse (W1) — atomic swap,
-- one transaction, zero residue, the established T1 pattern:
--   1. CREATE TABLE seneca_resources_v3 (this shape, verbatim);
--   2. INSERT INTO v3 SELECT * FROM seneca_resources  (pilot rows re-homed,
--      course_slug unchanged — additive, nothing dropped);
--   3. DROP TABLE seneca_resources;  4. ALTER TABLE v3 RENAME;
--   5. recreate the indexes (below); 6. warehouse_meta template_version
--   wh-v2 -> wh-v3.  Parity census re-verified post-swap (receipt).
--
-- Seam contract unchanged (DATA-PLANE-PLACEMENT §4): main's
-- assignment_resources rows reference resources by the bare text id
-- (resource_id varchar(64)); ids are the contract, NO cross-project FK ever.
-- The fail-closed existence/course validation stays app-side (D5): with
-- per-course instances, `where course_slug = $1 and id = any(...)` keeps its
-- exact semantics — the API module needs NO change.

CREATE TABLE seneca_resources_v3 (
  id varchar(64) NOT NULL,
  course_slug varchar(96) NOT NULL,  -- v2 width 64 broke on the longest hub
                                     -- slug (…double-award-23-chemistry = 66);
                                     -- wh-v3 fixes the width (main's
                                     -- course_registry already carries it)
  kind varchar(16) NOT NULL,
  title text,
  topic_path text,
  marks_total integer,
  question_type varchar(60),
  content_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, course_slug),
  CONSTRAINT seneca_resources_kind_check CHECK (
    kind::text = ANY (ARRAY['courseSection'::character varying,
                            'examQuestion'::character varying,
                            'quiz'::character varying]::text[])),
  CONSTRAINT seneca_resources_marks_check CHECK (
    marks_total IS NULL OR marks_total >= 0)
);

CREATE INDEX ix_seneca_resources_course_kind
  ON seneca_resources_v3 (course_slug, kind);
CREATE INDEX ix_seneca_resources_topic
  ON seneca_resources_v3 (course_slug, topic_path);
