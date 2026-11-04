-- T-SIB-INGEST-001 (r0) — widen the document kind enum with RESEARCH_EVIDENCE.
--
-- Operator-approved ruling (trace 1a1a2a0f13661c75: "Go with your recommendations"):
-- SubjectIntelligence (SIB) research artifacts ingest as first-class serving
-- documents. The tutor serving arm (apps/api/src/services/tutor/vector-arm.ts)
-- is kind-agnostic BY DESIGN (the frozen adapter law) — the new kind exists for
-- governance and audit: receipts, family policy (GAP held internal), and any
-- future family-level serving filter. varchar(20) fits ('RESEARCH_EVIDENCE' = 17).
--
-- Scope: public.documents + public.document_chunks ONLY. The archive snapshot
-- table (archive_tc27_card_wave_20260928) keeps its historical constraint —
-- archives never widen.
ALTER TABLE "documents" DROP CONSTRAINT "ck_documents_kind";
ALTER TABLE "documents" ADD CONSTRAINT "ck_documents_kind" CHECK ((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying, 'RESEARCH_EVIDENCE'::character varying])::text[]));
ALTER TABLE "document_chunks" DROP CONSTRAINT "ck_document_chunks_kind";
ALTER TABLE "document_chunks" ADD CONSTRAINT "ck_document_chunks_kind" CHECK ((kind IS NULL) OR ((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying, 'RESEARCH_EVIDENCE'::character varying])::text[])));
