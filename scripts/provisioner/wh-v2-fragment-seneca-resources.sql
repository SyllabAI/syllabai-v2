-- ============================================================
-- WAREHOUSE TEMPLATE v2 (wh-v2) — the sci-chem pack FRAGMENT
-- ============================================================
-- Owner: T-SENECA-001 (DDL fragment supplied to the T-OPS-PLANE-001
-- provisioner lane). Template law: docs/ADR-038-COURSE_GROUP_VECTOR_WAREHOUSES.md
-- — a template version is FROZEN DDL applied verbatim, never an ALTER on a
-- live warehouse; wh-v2 := frozen wh-v1 (scripts/provisioner/template.sql:
-- pgvector + warehouse_meta + warehouse_chunks + HNSW) + THIS fragment.
-- Ruling of record: operator trace 1a16adad843081b1 (receipt run-003) —
-- seneca_resources is a CORPUS plane, it lives HERE (course-group
-- warehouse), never in main (docs/DATA-PLANE-PLACEMENT.md).
--
-- Seam contract (DATA-PLANE-PLACEMENT §4): main's assignment_resources rows
-- reference THIS table by the bare text id (resource_id varchar(64)) — ids
-- are the contract, NO cross-project FK ever (the run-002 pre-ruling main FK
-- is dropped at the T1 step). The fail-closed existence/course validation
-- lives app-side (T-SENECA-001 plan D5). course_slug is the HUB course slug
-- of record (pilot: igcse-chemistry-19 = Edexcel IGCSE Chemistry 4CH1).
--
-- Provisioning (the provisioner lane's wh-v2 extension of provision.mjs):
--   1. apply template.sql (wh-v1, verbatim)
--   2. apply THIS fragment (verbatim)
--   3. warehouse_meta rows: template_version = wh-v2 (+ course_group /
--      subject_id / migrated_at as provision.mjs already writes them)
-- No ALTERs beyond this point — a change is wh-v3 + a receipt.
--
-- DDL of record: the run-002 live shape (0010_seneca_resource_packs.sql @
-- 158ece3a, including the run-002 title->text fix — 62 real EQ titles exceed
-- varchar(300), max 473), byte-equivalent modulo placement.

CREATE TABLE seneca_resources (
  id varchar(64) PRIMARY KEY,
  course_slug varchar(64) NOT NULL,
  kind varchar(16) NOT NULL,
  title text,
  topic_path text,
  marks_total integer,
  question_type varchar(60),
  content_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seneca_resources_kind_check CHECK (
    kind::text = ANY (ARRAY['courseSection'::character varying,
                            'examQuestion'::character varying,
                            'quiz'::character varying]::text[])),
  CONSTRAINT seneca_resources_marks_check CHECK (
    marks_total IS NULL OR marks_total >= 0)
);

CREATE INDEX ix_seneca_resources_course_kind
  ON seneca_resources (course_slug, kind);
CREATE INDEX ix_seneca_resources_topic
  ON seneca_resources (course_slug, topic_path);
