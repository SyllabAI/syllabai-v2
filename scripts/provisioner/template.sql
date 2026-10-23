-- ============================================================
-- SYLLABAI WAREHOUSE TEMPLATE v1 — FROZEN (2026-10-23)
-- ============================================================
-- Law: docs/DATA-PLANE-PLACEMENT.md + ADR-038. One warehouse
-- project per course GROUP (data-driven by subject_id). Every
-- warehouse is created by running THIS FILE verbatim — no
-- per-group edits, ever. A schema change = new template
-- version + a receipt, never an ALTER on a live warehouse.
--
-- Pins of record (run-001-trim-census-r0):
--   vector: pgvector, dim 768, gemini-embedding-001,
--           HNSW vector_cosine_ops (defaults, no m/ef params)
--   scope:  v1 = chunk serving plane + meta. The mark plane
--           (mark_schemes/mark_points) gets template v2 at its
--           own cut-over. Assets (bytea) stay in main until
--           their plane ruling.
--   drain:  ix_*_pending (WHERE embedding IS NULL) is NOT
--           reproduced — warehouses receive fully-embedded rows.
--
-- Hydration seam contract (placement law §4): main keeps the
-- deterministic anchors and passes ids only. A warehouse never
-- holds users, attempts, classes, or any identity plane.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE warehouse_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);
-- populated by provision.mjs after apply:
--   template_version = wh-v1
--   course_group     = <group name>
--   subject_id       = <subject uuid>
--   migrated_at      = <utc>
--   source_fingerprint = <estate row fingerprint of source at copy time>

CREATE TABLE warehouse_chunks (
  id uuid PRIMARY KEY,
  document_id text NOT NULL,          -- text-compare law (never ::uuid cast)
  document_row_id uuid NOT NULL,
  course_group text NOT NULL,
  subject_id uuid NOT NULL,
  kind text NOT NULL,                 -- QUESTION_PAPER | MARK_SCHEME | EXTERNAL_QUESTIONS | TEXTBOOK | EXTERNAL_NOTES | SYLLABUS
  chunk_index integer NOT NULL,
  content text NOT NULL,
  page_start integer,
  page_end integer,
  series text,
  year integer,
  paper_code text,
  atom_number text,
  spec_codes jsonb,
  token_estimate integer,
  embedding_model text,
  embedded_at timestamptz,
  created_at timestamptz NOT NULL,
  embedding vector(768),
  CONSTRAINT uq_warehouse_chunk UNIQUE (document_row_id, chunk_index)
);

CREATE INDEX ix_warehouse_chunks_embedding
  ON warehouse_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ix_warehouse_chunks_subject_kind
  ON warehouse_chunks (subject_id, kind);
CREATE INDEX ix_warehouse_chunks_subject_year_series
  ON warehouse_chunks (subject_id, year, series);
CREATE INDEX ix_warehouse_chunks_course_group
  ON warehouse_chunks (course_group);
CREATE INDEX ix_warehouse_chunks_document_id
  ON warehouse_chunks (document_id);
CREATE INDEX ix_warehouse_chunks_spec_codes
  ON warehouse_chunks USING gin (spec_codes) WHERE spec_codes IS NOT NULL;

-- The two-step retrieval seam query of record (placement law §4):
--   STEP 1 (warehouse):  SELECT id FROM warehouse_chunks
--                        WHERE course_group = $1 AND kind = ANY($2)
--                        ORDER BY embedding <=> $3 LIMIT $4;
--   STEP 2 (main):       hydrate the returned ids against the
--                        deterministic anchor planes. Batched; no N+1.
