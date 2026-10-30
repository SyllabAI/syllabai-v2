-- T-MG-INK-1 run-002 (plan of record: docs/MG-MARK-PARITY-PLAN.md §3.3;
-- verdict record docs/MG-INK-SDK-GATE.md)
-- Additive single table: the annotation-ink persistence plane (native
-- canvas ink on pdf-pane v4 per the run-001 decision gate). One FULL-DOC
-- jsonb container {schema:'syllabai-ink/1', shapes[]} per (learner,
-- documentRef | sourceUrl) — E4: single-writer, full-doc PUT + revision
-- LWW 409 right-sized; no op-log (dead per the decision record).
--
-- Identity law (the plan §3.3 parenthetical refine): a drawing is keyed
-- EITHER by the internal documentRef (document_ref_type + document_ref_id,
-- the UNIQUE constraint) OR by the external sourceUrl (the external-PDF
-- fallback pin — rows with NULL document_ref_id, made unique per
-- (learner, document_ref_type, source_url) by the PARTIAL unique index).
-- The refine CHECK is the "sourceUrl OR documentRef" law (their 'Missing
-- sourceUrl' hard-require not copied — hence document_ref_id NULLABLE, the
-- T-card run-002 pin of record governing over the §3.3 NOT NULL token).
-- The container CHECK pins the doc law at rest (schema id 'syllabai-ink/1',
-- shapes an array). Cascade on learner delete (PII posture, the
-- mark_awards precedent). createdAt rides the 0018 housekeeping precedent
-- (disclosed additive extra beyond the plan's column list).
--
-- ADDITIVE-ONLY LAW (the 0017/0018 precedent): drizzle-kit generate against
-- the drifted baseline also proposes unrelated DROP/RENAME CONSTRAINT
-- churn from prior snapshot drift — that churn is REJECTED here; this
-- migration carries exactly the additive table DDL and nothing else.
CREATE TABLE "learner_pdf_drawings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"document_ref_type" text NOT NULL,
	"document_ref_id" uuid,
	"source_url" text,
	"doc" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_learner_pdf_drawings_learner_doc_ref" UNIQUE("learner_id","document_ref_type","document_ref_id"),
	CONSTRAINT "learner_pdf_drawings_refine_check" CHECK (source_url IS NOT NULL OR document_ref_id IS NOT NULL),
	CONSTRAINT "learner_pdf_drawings_doc_container_check" CHECK (jsonb_typeof(doc -> 'shapes') = 'array' AND doc ->> 'schema' = 'syllabai-ink/1'),
	CONSTRAINT "learner_pdf_drawings_revision_check" CHECK (revision >= 1)
);
--> statement-breakpoint
ALTER TABLE "learner_pdf_drawings" ADD CONSTRAINT "learner_pdf_drawings_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_learner_pdf_drawings_learner_type_sourceurl" ON "learner_pdf_drawings" USING btree ("learner_id" uuid_ops,"document_ref_type" text_ops,"source_url" text_ops) WHERE document_ref_id IS NULL;
