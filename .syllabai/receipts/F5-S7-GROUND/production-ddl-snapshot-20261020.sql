--
-- PostgreSQL database dump
--

-- Dumped from database version 18.6 (653b019)
-- Dumped by pg_dump version 18.6 (653b019)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: neon_auth; Type: SCHEMA; Schema: -; Owner: neon_auth
--

CREATE SCHEMA neon_auth;


ALTER SCHEMA neon_auth OWNER TO neon_auth;

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" uuid NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE neon_auth.account OWNER TO neon_auth;

--
-- Name: invitation; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.invitation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    email text NOT NULL,
    role text,
    status text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "inviterId" uuid NOT NULL
);


ALTER TABLE neon_auth.invitation OWNER TO neon_auth;

--
-- Name: jwks; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.jwks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "expiresAt" timestamp with time zone,
    alg text,
    crv text
);


ALTER TABLE neon_auth.jwks OWNER TO neon_auth;

--
-- Name: member; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "organizationId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    role text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);


ALTER TABLE neon_auth.member OWNER TO neon_auth;

--
-- Name: organization; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    "createdAt" timestamp with time zone NOT NULL,
    metadata text
);


ALTER TABLE neon_auth.organization OWNER TO neon_auth;

--
-- Name: project_config; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.project_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    endpoint_id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    trusted_origins jsonb NOT NULL,
    social_providers jsonb NOT NULL,
    email_provider jsonb,
    email_and_password jsonb,
    allow_localhost boolean NOT NULL,
    plugin_configs jsonb,
    webhook_config jsonb
);


ALTER TABLE neon_auth.project_config OWNER TO neon_auth;

--
-- Name: session; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" uuid NOT NULL,
    "impersonatedBy" text,
    "activeOrganizationId" text
);


ALTER TABLE neon_auth.session OWNER TO neon_auth;

--
-- Name: user; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth."user" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role text,
    banned boolean,
    "banReason" text,
    "banExpires" timestamp with time zone
);


ALTER TABLE neon_auth."user" OWNER TO neon_auth;

--
-- Name: verification; Type: TABLE; Schema: neon_auth; Owner: neon_auth
--

CREATE TABLE neon_auth.verification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE neon_auth.verification OWNER TO neon_auth;

--
-- Name: announcement_reads; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.announcement_reads (
    announcement_id uuid NOT NULL,
    student_id uuid NOT NULL,
    read_at timestamp with time zone NOT NULL
);


ALTER TABLE public.announcement_reads OWNER TO neondb_owner;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.announcements (
    id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    category character varying(20) DEFAULT 'GENERAL'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT announcements_category_check CHECK (((category)::text = ANY ((ARRAY['GENERAL'::character varying, 'HOMEWORK'::character varying, 'NOTICE'::character varying, 'EXAM_REMINDER'::character varying, 'RESOURCE'::character varying])::text[])))
);


ALTER TABLE public.announcements OWNER TO neondb_owner;

--
-- Name: answers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.answers (
    id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    question_part_id uuid NOT NULL,
    answer_text text,
    marks_awarded integer,
    marking_state character varying(16) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT answers_marks_awarded_check CHECK ((marks_awarded >= 0)),
    CONSTRAINT ck_answer_marking_state CHECK (((marking_state)::text = ANY ((ARRAY['PENDING'::character varying, 'SMART_MARKED'::character varying, 'HUMAN_MARKED'::character varying, 'OVERRIDDEN'::character varying, 'SELF_MARKED'::character varying])::text[])))
);


ALTER TABLE public.answers OWNER TO neondb_owner;

--
-- Name: archive_tc27_card_wave_20260928; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.archive_tc27_card_wave_20260928 (
    id uuid CONSTRAINT documents_id_not_null NOT NULL,
    document_id character varying(80) CONSTRAINT documents_document_id_not_null NOT NULL,
    schema_version character varying(10) CONSTRAINT documents_schema_version_not_null NOT NULL,
    doc_version integer DEFAULT 1 CONSTRAINT documents_doc_version_not_null NOT NULL,
    kind character varying(20) CONSTRAINT documents_kind_not_null NOT NULL,
    source_uri character varying(500) CONSTRAINT documents_source_uri_not_null NOT NULL,
    file_name character varying(300),
    mime_type character varying(100) CONSTRAINT documents_mime_type_not_null NOT NULL,
    checksum character varying(128) CONSTRAINT documents_checksum_not_null NOT NULL,
    checksum_algorithm character varying(20) DEFAULT 'SHA-256'::character varying CONSTRAINT documents_checksum_algorithm_not_null NOT NULL,
    page_count integer CONSTRAINT documents_page_count_not_null NOT NULL,
    element_count integer CONSTRAINT documents_element_count_not_null NOT NULL,
    text_element_count integer CONSTRAINT documents_text_element_count_not_null NOT NULL,
    chunk_count integer DEFAULT 0 CONSTRAINT documents_chunk_count_not_null NOT NULL,
    source_engine character varying(60) CONSTRAINT documents_source_engine_not_null NOT NULL,
    source_engine_version character varying(40) CONSTRAINT documents_source_engine_version_not_null NOT NULL,
    extracted_at timestamp with time zone,
    canonical_json jsonb CONSTRAINT documents_canonical_json_not_null NOT NULL,
    ingested_by uuid,
    created_at timestamp with time zone CONSTRAINT documents_created_at_not_null NOT NULL,
    validation_state character varying(20) DEFAULT 'SUGGESTED'::character varying CONSTRAINT documents_validation_state_not_null NOT NULL,
    CONSTRAINT ck_documents_kind CHECK (((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[]))),
    CONSTRAINT ck_documents_validation_state CHECK (((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[]))),
    CONSTRAINT documents_chunk_count_check CHECK ((chunk_count >= 0)),
    CONSTRAINT documents_doc_version_check CHECK ((doc_version > 0)),
    CONSTRAINT documents_element_count_check CHECK ((element_count >= 0)),
    CONSTRAINT documents_page_count_check CHECK ((page_count > 0)),
    CONSTRAINT documents_text_element_count_check CHECK ((text_element_count >= 0))
);


ALTER TABLE public.archive_tc27_card_wave_20260928 OWNER TO neondb_owner;

--
-- Name: assignment_submissions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.assignment_submissions (
    id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    learner_id uuid NOT NULL,
    questions_completed integer NOT NULL,
    score integer,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT assignment_submissions_questions_completed_check CHECK ((questions_completed >= 0)),
    CONSTRAINT assignment_submissions_score_check CHECK (((score IS NULL) OR (score >= 0)))
);


ALTER TABLE public.assignment_submissions OWNER TO neondb_owner;

--
-- Name: assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.assignments (
    id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    course_slug character varying(64) NOT NULL,
    course_label character varying(120) NOT NULL,
    title character varying(200) NOT NULL,
    spec_refs jsonb NOT NULL,
    marks_total integer NOT NULL,
    question_count integer NOT NULL,
    due_at timestamp with time zone NOT NULL,
    status character varying(16) DEFAULT 'OPEN'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    class_id uuid,
    CONSTRAINT assignments_marks_total_check CHECK ((marks_total >= 1)),
    CONSTRAINT assignments_question_count_check CHECK ((question_count >= 1)),
    CONSTRAINT assignments_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying])::text[])))
);


ALTER TABLE public.assignments OWNER TO neondb_owner;

--
-- Name: attempts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.attempts (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    question_id uuid NOT NULL,
    chosen_option_id uuid,
    correct boolean NOT NULL,
    marks_awarded integer,
    response_time_ms bigint NOT NULL,
    confidence_level integer,
    self_doubt_flag boolean DEFAULT false NOT NULL,
    timed_condition boolean DEFAULT false NOT NULL,
    provenance character varying(40) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    marking_state character varying(16) DEFAULT 'AUTO_GRADED'::character varying NOT NULL,
    evidence_emitted boolean DEFAULT false NOT NULL,
    CONSTRAINT attempts_confidence_level_check CHECK (((confidence_level >= 1) AND (confidence_level <= 5))),
    CONSTRAINT attempts_response_time_ms_check CHECK ((response_time_ms >= 0)),
    CONSTRAINT ck_attempt_marking_state CHECK (((marking_state)::text = ANY ((ARRAY['AUTO_GRADED'::character varying, 'PENDING'::character varying, 'SMART_MARKED'::character varying, 'HUMAN_MARKED'::character varying, 'OVERRIDDEN'::character varying, 'SELF_MARKED'::character varying])::text[])))
);


ALTER TABLE public.attempts OWNER TO neondb_owner;

--
-- Name: book_chapters; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.book_chapters (
    id uuid NOT NULL,
    document_id character varying(80) NOT NULL,
    doc_version integer DEFAULT 1 NOT NULL,
    course_id character varying(60) NOT NULL,
    unit_index integer,
    unit_title text,
    chapter_index integer NOT NULL,
    chapter_key character varying(120) NOT NULL,
    title text NOT NULL,
    book_page_start integer,
    book_page_end integer,
    pdf_page_start integer,
    pdf_page_end integer,
    learning_objective text,
    spec_codes jsonb NOT NULL,
    validation_state character varying(20) DEFAULT 'SUGGESTED'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_book_chapters_doc_version CHECK ((doc_version > 0)),
    CONSTRAINT ck_book_chapters_validation_state CHECK (((validation_state)::text = ANY (ARRAY[('SUGGESTED'::character varying)::text, ('VALIDATED'::character varying)::text, ('REJECTED'::character varying)::text, ('FLAGGED'::character varying)::text])))
);


ALTER TABLE public.book_chapters OWNER TO neondb_owner;

--
-- Name: bootstrap_admin_state; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bootstrap_admin_state (
    id integer NOT NULL,
    state character varying(10) DEFAULT 'PENDING'::character varying NOT NULL,
    claimed_by uuid,
    claimed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bootstrap_admin_state_id_check CHECK ((id = 1)),
    CONSTRAINT ck_bas_state CHECK (((state)::text = ANY ((ARRAY['PENDING'::character varying, 'CONSUMED'::character varying, 'EXPIRED'::character varying])::text[])))
);


ALTER TABLE public.bootstrap_admin_state OWNER TO neondb_owner;

--
-- Name: campaign_db_identity; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.campaign_db_identity (
    id smallint NOT NULL,
    campaign_label character varying(80) NOT NULL,
    db_name character varying(80) NOT NULL,
    host_addr character varying(80),
    core_commit character varying(40),
    note character varying(200),
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_db_identity_id_check CHECK ((id = 1))
);


ALTER TABLE public.campaign_db_identity OWNER TO neondb_owner;

--
-- Name: class_members; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.class_members (
    id uuid NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    enrolled_by uuid NOT NULL,
    enrolled_at timestamp with time zone NOT NULL
);


ALTER TABLE public.class_members OWNER TO neondb_owner;

--
-- Name: classes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.classes (
    id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    course_slug character varying(64) NOT NULL,
    course_label character varying(120) NOT NULL,
    name character varying(120) NOT NULL,
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT classes_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[])))
);


ALTER TABLE public.classes OWNER TO neondb_owner;

--
-- Name: content_review_audit; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.content_review_audit (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_label character varying(254) DEFAULT ''::character varying NOT NULL,
    action character varying(24) NOT NULL,
    target_type character varying(24) NOT NULL,
    target_id uuid NOT NULL,
    from_state character varying(12),
    to_state character varying(12),
    detail text DEFAULT ''::text NOT NULL,
    CONSTRAINT ck_cra_action CHECK (((action)::text = ANY ((ARRAY['VALIDATE'::character varying, 'VALIDATE_ALL'::character varying, 'REJECT'::character varying, 'FLAG'::character varying, 'UNFLAG'::character varying, 'PLACE'::character varying, 'MAP_TOPICS'::character varying])::text[]))),
    CONSTRAINT ck_cra_target_type CHECK (((target_type)::text = ANY (ARRAY[('exam_paper'::character varying)::text, ('question_version'::character varying)::text, ('mark_scheme'::character varying)::text, ('question'::character varying)::text, ('document'::character varying)::text])))
);


ALTER TABLE public.content_review_audit OWNER TO neondb_owner;

--
-- Name: content_review_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.content_review_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.content_review_audit_id_seq OWNER TO neondb_owner;

--
-- Name: content_review_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.content_review_audit_id_seq OWNED BY public.content_review_audit.id;


--
-- Name: curriculum_versions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.curriculum_versions (
    id uuid NOT NULL,
    board character varying(50) NOT NULL,
    qualification character varying(50) NOT NULL,
    code character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    status character varying(16) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_curriculum_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[])))
);


ALTER TABLE public.curriculum_versions OWNER TO neondb_owner;

--
-- Name: decay_job_runs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.decay_job_runs (
    window_start timestamp with time zone NOT NULL,
    executed_at timestamp with time zone NOT NULL,
    trigger_kind character varying(20) NOT NULL,
    decayed integer NOT NULL,
    reviews_scheduled integer NOT NULL
);


ALTER TABLE public.decay_job_runs OWNER TO neondb_owner;

--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.document_chunks (
    id uuid NOT NULL,
    document_row_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    page_start integer,
    page_end integer,
    element_ids jsonb NOT NULL,
    token_estimate integer NOT NULL,
    embedding public.vector(768),
    embedding_model character varying(60),
    embedded_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
    kind character varying(20),
    subject_id uuid,
    series character varying(3),
    year integer,
    paper_code character varying(20),
    atom_number character varying(10),
    spec_codes jsonb,
    embed_rev integer DEFAULT 1 NOT NULL,
    CONSTRAINT ck_document_chunks_kind CHECK (((kind IS NULL) OR ((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[])))),
    CONSTRAINT ck_document_chunks_series CHECK (((series IS NULL) OR ((series)::text = ANY ((ARRAY['JAN'::character varying, 'JUN'::character varying, 'NOV'::character varying])::text[])))),
    CONSTRAINT document_chunks_chunk_index_check CHECK ((chunk_index >= 0)),
    CONSTRAINT document_chunks_embed_rev_check CHECK ((embed_rev > 0)),
    CONSTRAINT document_chunks_token_estimate_check CHECK ((token_estimate > 0))
);


ALTER TABLE public.document_chunks OWNER TO neondb_owner;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.documents (
    id uuid NOT NULL,
    document_id character varying(80) NOT NULL,
    schema_version character varying(10) NOT NULL,
    doc_version integer DEFAULT 1 NOT NULL,
    kind character varying(20) NOT NULL,
    source_uri character varying(500) NOT NULL,
    file_name character varying(300),
    mime_type character varying(100) NOT NULL,
    checksum character varying(128) NOT NULL,
    checksum_algorithm character varying(20) DEFAULT 'SHA-256'::character varying NOT NULL,
    page_count integer NOT NULL,
    element_count integer NOT NULL,
    text_element_count integer NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    source_engine character varying(60) NOT NULL,
    source_engine_version character varying(40) NOT NULL,
    extracted_at timestamp with time zone,
    canonical_json jsonb NOT NULL,
    ingested_by uuid,
    created_at timestamp with time zone NOT NULL,
    validation_state character varying(20) DEFAULT 'SUGGESTED'::character varying NOT NULL,
    CONSTRAINT ck_documents_kind CHECK (((kind)::text = ANY ((ARRAY['QUESTION_PAPER'::character varying, 'MARK_SCHEME'::character varying, 'SYLLABUS'::character varying, 'OTHER'::character varying, 'TEXTBOOK'::character varying, 'EXTERNAL_NOTES'::character varying, 'EXTERNAL_QUESTIONS'::character varying])::text[]))),
    CONSTRAINT ck_documents_validation_state CHECK (((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[]))),
    CONSTRAINT documents_chunk_count_check CHECK ((chunk_count >= 0)),
    CONSTRAINT documents_doc_version_check CHECK ((doc_version > 0)),
    CONSTRAINT documents_element_count_check CHECK ((element_count >= 0)),
    CONSTRAINT documents_page_count_check CHECK ((page_count > 0)),
    CONSTRAINT documents_text_element_count_check CHECK ((text_element_count >= 0))
);


ALTER TABLE public.documents OWNER TO neondb_owner;

--
-- Name: exam_papers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.exam_papers (
    id uuid NOT NULL,
    subject_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    board character varying(40) NOT NULL,
    qualification character varying(20) NOT NULL,
    unit character varying(60),
    session_label character varying(60),
    paper_code character varying(30),
    question_paper_document_id character varying(80),
    mark_scheme_document_id character varying(80),
    validation_state character varying(12) DEFAULT 'SUGGESTED'::character varying NOT NULL,
    provenance character varying(20) DEFAULT 'PAST_PAPER'::character varying NOT NULL,
    extraction_method character varying(120),
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    series character varying(3),
    year integer,
    CONSTRAINT ck_exam_paper_provenance CHECK (((provenance)::text = ANY ((ARRAY['PAST_PAPER'::character varying, 'TEACHER_AUTHORED'::character varying, 'SEED_DEMO'::character varying])::text[]))),
    CONSTRAINT ck_exam_paper_state CHECK (((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[]))),
    CONSTRAINT ck_exam_papers_series CHECK (((series IS NULL) OR ((series)::text = ANY ((ARRAY['JAN'::character varying, 'JUN'::character varying, 'NOV'::character varying])::text[]))))
);


ALTER TABLE public.exam_papers OWNER TO neondb_owner;

--
-- Name: exam_series; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.exam_series (
    id uuid NOT NULL,
    board character varying(50) NOT NULL,
    qualification character varying(50) NOT NULL,
    series_code character varying(60) NOT NULL,
    label character varying(120) NOT NULL,
    window_start date NOT NULL,
    window_end date NOT NULL,
    entry_deadline date,
    results_date date,
    published boolean DEFAULT true NOT NULL,
    estimated boolean DEFAULT false NOT NULL,
    source_url character varying(500) NOT NULL,
    retrieved_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_exam_series_window CHECK ((window_end >= window_start))
);


ALTER TABLE public.exam_series OWNER TO neondb_owner;

--
-- Name: experiments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.experiments (
    id uuid NOT NULL,
    experiment_key character varying(60) NOT NULL,
    name character varying(200) NOT NULL,
    hypothesis text,
    pinned_provider character varying(30),
    pinned_model character varying(100),
    status character varying(16) DEFAULT 'DRAFT'::character varying NOT NULL,
    params jsonb,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_experiment_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'RUNNING'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying, 'ARCHIVED'::character varying])::text[])))
);


ALTER TABLE public.experiments OWNER TO neondb_owner;

--
-- Name: flashcard_ratings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.flashcard_ratings (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    node_id uuid NOT NULL,
    card_id character varying(64) NOT NULL,
    rating character varying(16) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT flashcard_ratings_rating_check CHECK (((rating)::text = ANY ((ARRAY['STILL_LEARNING'::character varying, 'KNOW'::character varying])::text[])))
);


ALTER TABLE public.flashcard_ratings OWNER TO neondb_owner;

--
-- Name: flyway_schema_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.flyway_schema_history (
    installed_rank integer NOT NULL,
    version character varying(50),
    description character varying(200) NOT NULL,
    type character varying(20) NOT NULL,
    script character varying(1000) NOT NULL,
    checksum integer,
    installed_by character varying(100) NOT NULL,
    installed_on timestamp without time zone DEFAULT now() NOT NULL,
    execution_time integer NOT NULL,
    success boolean NOT NULL
);


ALTER TABLE public.flyway_schema_history OWNER TO neondb_owner;

--
-- Name: glm_ocr_bridge_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.glm_ocr_bridge_records (
    id uuid NOT NULL,
    paper_id uuid NOT NULL,
    bridge character varying(30) DEFAULT 'glm-ocr-v1'::character varying NOT NULL,
    qp_document_id character varying(80) NOT NULL,
    ms_document_id character varying(80) NOT NULL,
    qp_document_row_id uuid,
    ms_document_row_id uuid,
    qp_checksum character varying(128) NOT NULL,
    ms_checksum character varying(128) NOT NULL,
    extraction_methods character varying(120) NOT NULL,
    reconciliation_status character varying(20) NOT NULL,
    review_findings jsonb NOT NULL,
    qp_draft jsonb NOT NULL,
    ms_draft jsonb NOT NULL,
    reconciliation jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_glm_ocr_reconciliation_status CHECK (((reconciliation_status)::text = ANY ((ARRAY['OK'::character varying, 'REVIEW_REQUIRED'::character varying, 'SUPERSEDED'::character varying])::text[])))
);


ALTER TABLE public.glm_ocr_bridge_records OWNER TO neondb_owner;

--
-- Name: human_marks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.human_marks (
    id uuid NOT NULL,
    answer_id uuid NOT NULL,
    marker_id uuid NOT NULL,
    marks_awarded integer NOT NULL,
    per_point_decisions jsonb,
    comments text,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT human_marks_marks_awarded_check CHECK ((marks_awarded >= 0))
);


ALTER TABLE public.human_marks OWNER TO neondb_owner;

--
-- Name: intervention_run; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.intervention_run (
    run_id uuid NOT NULL,
    learner_id uuid NOT NULL,
    subject_id uuid,
    curriculum_version_id uuid,
    status character varying(16) NOT NULL,
    origin character varying(64) NOT NULL,
    target_specification_points jsonb DEFAULT '[]'::jsonb NOT NULL,
    question_part_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    diagnosis_snapshot_ref text,
    learner_state_snapshot_ref text,
    diagnosis_version character varying(128),
    action_type character varying(32) NOT NULL,
    intervention_version character varying(128) NOT NULL,
    intervention_hash character varying(128) NOT NULL,
    allowed_tool_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    terminal_outcome character varying(64),
    current_step integer,
    created_at timestamp with time zone NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT intervention_run_status_ck CHECK (((status)::text = ANY ((ARRAY['CREATED'::character varying, 'ACTIVE'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[]))),
    CONSTRAINT intervention_run_terminal_ck CHECK (((((status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[])) AND (terminal_outcome IS NOT NULL)) OR ((status)::text <> ALL ((ARRAY['COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[]))))
);


ALTER TABLE public.intervention_run OWNER TO neondb_owner;

--
-- Name: intervention_run_evidence; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.intervention_run_evidence (
    id uuid NOT NULL,
    run_id uuid NOT NULL,
    evidence_ref character varying(512) NOT NULL,
    role character varying(32) NOT NULL,
    captured_at timestamp with time zone NOT NULL
);


ALTER TABLE public.intervention_run_evidence OWNER TO neondb_owner;

--
-- Name: intervention_run_step; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.intervention_run_step (
    step_id uuid NOT NULL,
    run_id uuid NOT NULL,
    sequence_no integer NOT NULL,
    status character varying(16) NOT NULL,
    observation_type character varying(64) NOT NULL,
    input_evidence_ref text,
    output_evidence_ref text,
    blocked_reason text,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT intervention_run_step_sequence_ck CHECK ((sequence_no >= 0))
);


ALTER TABLE public.intervention_run_step OWNER TO neondb_owner;

--
-- Name: knowledge_edges; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.knowledge_edges (
    id uuid NOT NULL,
    source_node_id uuid NOT NULL,
    target_node_id uuid NOT NULL,
    relation_type character varying(30) NOT NULL,
    strength double precision,
    rationale character varying(500),
    validation_status character varying(20) DEFAULT 'UNVALIDATED'::character varying NOT NULL,
    provenance character varying(300),
    created_by character varying(100),
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_edge_relation CHECK (((relation_type)::text = ANY ((ARRAY['PART_OF'::character varying, 'REQUIRES_PREREQUISITE'::character varying, 'RELATED_TO'::character varying, 'MISCONCEPTION_OF'::character varying, 'EXPLAINED_BY'::character varying, 'REMEDIATED_BY'::character varying, 'WRONG_ANSWER_PATTERN'::character varying, 'COMMONLY_CONFUSED_WITH'::character varying])::text[]))),
    CONSTRAINT ck_no_self_edge CHECK ((source_node_id <> target_node_id))
);


ALTER TABLE public.knowledge_edges OWNER TO neondb_owner;

--
-- Name: knowledge_nodes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.knowledge_nodes (
    id uuid NOT NULL,
    code character varying(40) NOT NULL,
    node_type character varying(20) NOT NULL,
    title character varying(200) NOT NULL,
    description character varying(1000),
    validation_status character varying(20) DEFAULT 'UNVALIDATED'::character varying NOT NULL,
    provenance character varying(300),
    created_by character varying(100),
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    applicability jsonb,
    CONSTRAINT ck_node_type CHECK (((node_type)::text = ANY ((ARRAY['SUBJECT'::character varying, 'UNIT'::character varying, 'TOPIC'::character varying, 'SUBTOPIC'::character varying, 'MISCONCEPTION'::character varying, 'CONCEPT'::character varying])::text[]))),
    CONSTRAINT ck_node_validation CHECK (((validation_status)::text = ANY ((ARRAY['UNVALIDATED'::character varying, 'SUGGESTED'::character varying, 'VALIDATED'::character varying])::text[])))
);


ALTER TABLE public.knowledge_nodes OWNER TO neondb_owner;

--
-- Name: learner_course_enrolments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.learner_course_enrolments (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    course_slug character varying(100) NOT NULL,
    target_series_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.learner_course_enrolments OWNER TO neondb_owner;

--
-- Name: learner_self_marks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.learner_self_marks (
    id uuid NOT NULL,
    answer_id uuid NOT NULL,
    learner_id uuid NOT NULL,
    marks_awarded integer NOT NULL,
    comment text,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT learner_self_marks_marks_awarded_check CHECK ((marks_awarded >= 0))
);


ALTER TABLE public.learner_self_marks OWNER TO neondb_owner;

--
-- Name: mark_points; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.mark_points (
    id uuid NOT NULL,
    mark_scheme_id uuid NOT NULL,
    question_part_id uuid,
    ref character varying(20),
    ordering integer NOT NULL,
    text text NOT NULL,
    marks integer NOT NULL,
    acceptance_criteria jsonb,
    extraction_confidence double precision,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT mark_points_extraction_confidence_check CHECK (((extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision))),
    CONSTRAINT mark_points_marks_check CHECK ((marks > 0)),
    CONSTRAINT mark_points_ordering_check CHECK ((ordering >= 0))
);


ALTER TABLE public.mark_points OWNER TO neondb_owner;

--
-- Name: mark_schemes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.mark_schemes (
    id uuid NOT NULL,
    question_version_id uuid NOT NULL,
    version_label character varying(20) DEFAULT '1'::character varying NOT NULL,
    source_document_id character varying(80),
    validation_state character varying(12) DEFAULT 'SUGGESTED'::character varying NOT NULL,
    extraction_method character varying(120),
    created_at timestamp with time zone NOT NULL,
    general_guidance text,
    CONSTRAINT ck_mark_scheme_state CHECK (((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[])))
);


ALTER TABLE public.mark_schemes OWNER TO neondb_owner;

--
-- Name: misconception_states; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.misconception_states (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    misconception_node_id uuid NOT NULL,
    probability double precision NOT NULL,
    evidence_count integer DEFAULT 0 NOT NULL,
    last_evidence_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT misconception_states_probability_check CHECK (((probability >= (0)::double precision) AND (probability <= (1)::double precision)))
);


ALTER TABLE public.misconception_states OWNER TO neondb_owner;

--
-- Name: model_versions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.model_versions (
    id uuid NOT NULL,
    registry_key character varying(60) NOT NULL,
    version character varying(30) NOT NULL,
    params jsonb NOT NULL,
    provenance character varying(300),
    notes character varying(500),
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.model_versions OWNER TO neondb_owner;

--
-- Name: note_votes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.note_votes (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    node_id uuid NOT NULL,
    note_id character varying(64) NOT NULL,
    vote character varying(16) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT note_votes_vote_check CHECK (((vote)::text = ANY ((ARRAY['HELPFUL'::character varying, 'NOT_HELPFUL'::character varying])::text[])))
);


ALTER TABLE public.note_votes OWNER TO neondb_owner;

--
-- Name: prompt_versions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.prompt_versions (
    id uuid NOT NULL,
    registry_key character varying(60) NOT NULL,
    version character varying(30) NOT NULL,
    template text NOT NULL,
    notes character varying(500),
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.prompt_versions OWNER TO neondb_owner;

--
-- Name: question_asset; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.question_asset (
    filename character varying(512) NOT NULL,
    content_type character varying(128) NOT NULL,
    size_bytes bigint NOT NULL,
    bytes bytea NOT NULL,
    ingested_at timestamp with time zone NOT NULL,
    CONSTRAINT question_asset_name_ck CHECK (((filename)::text !~ '[/\\]'::text))
);


ALTER TABLE public.question_asset OWNER TO neondb_owner;

--
-- Name: question_options; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.question_options (
    id uuid NOT NULL,
    question_id uuid NOT NULL,
    label character varying(4) NOT NULL,
    option_text text NOT NULL,
    is_correct boolean DEFAULT false NOT NULL,
    misconception_node_id uuid,
    ordering integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.question_options OWNER TO neondb_owner;

--
-- Name: question_parts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.question_parts (
    id uuid NOT NULL,
    question_version_id uuid NOT NULL,
    label character varying(12) NOT NULL,
    prompt text NOT NULL,
    command_word character varying(30),
    marks integer NOT NULL,
    ordering integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT question_parts_marks_check CHECK ((marks >= 0)),
    CONSTRAINT question_parts_ordering_check CHECK ((ordering >= 0))
);


ALTER TABLE public.question_parts OWNER TO neondb_owner;

--
-- Name: question_spec_points; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.question_spec_points (
    id uuid NOT NULL,
    question_id uuid NOT NULL,
    spec_point_node_id uuid NOT NULL,
    role character varying(10) NOT NULL,
    provenance character varying(40) DEFAULT 'AI_VALIDATED'::character varying NOT NULL,
    validation_state character varying(16) DEFAULT 'AI_VALIDATED'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_qsp_role CHECK (((role)::text = ANY ((ARRAY['PRIMARY'::character varying, 'SECONDARY'::character varying])::text[]))),
    CONSTRAINT ck_qsp_state CHECK (((validation_state)::text = ANY ((ARRAY['AI_VALIDATED'::character varying, 'HUMAN_VALIDATED'::character varying])::text[])))
);


ALTER TABLE public.question_spec_points OWNER TO neondb_owner;

--
-- Name: question_topics; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.question_topics (
    id uuid NOT NULL,
    question_id uuid NOT NULL,
    node_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.question_topics OWNER TO neondb_owner;

--
-- Name: question_versions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.question_versions (
    id uuid NOT NULL,
    question_id uuid NOT NULL,
    version integer NOT NULL,
    stem text NOT NULL,
    marks integer NOT NULL,
    difficulty integer NOT NULL,
    expected_time_seconds integer NOT NULL,
    command_word character varying(30),
    validation_state character varying(12) DEFAULT 'SUGGESTED'::character varying NOT NULL,
    source_document_id character varying(80),
    extraction_confidence double precision,
    extraction_method character varying(120),
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_question_version_state CHECK (((validation_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying, 'FLAGGED'::character varying])::text[]))),
    CONSTRAINT question_versions_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 5))),
    CONSTRAINT question_versions_expected_time_seconds_check CHECK ((expected_time_seconds > 0)),
    CONSTRAINT question_versions_extraction_confidence_check CHECK (((extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision))),
    CONSTRAINT question_versions_marks_check CHECK ((marks > 0)),
    CONSTRAINT question_versions_version_check CHECK ((version > 0))
);


ALTER TABLE public.question_versions OWNER TO neondb_owner;

--
-- Name: questions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.questions (
    id uuid NOT NULL,
    external_ref character varying(80),
    question_type character varying(20) DEFAULT 'MCQ_SINGLE'::character varying NOT NULL,
    stem text NOT NULL,
    marks integer NOT NULL,
    difficulty integer NOT NULL,
    expected_time_seconds integer NOT NULL,
    command_word character varying(30),
    primary_topic_node_id uuid,
    provenance character varying(20) DEFAULT 'SEED_DEMO'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    exam_paper_id uuid,
    difficulty_source character varying(30),
    CONSTRAINT ck_question_provenance CHECK (((provenance)::text = ANY ((ARRAY['PAST_PAPER'::character varying, 'TEACHER_AUTHORED'::character varying, 'SEED_DEMO'::character varying, 'EXTERNAL_BANK'::character varying])::text[]))),
    CONSTRAINT ck_question_type CHECK (((question_type)::text = ANY ((ARRAY['MCQ_SINGLE'::character varying, 'SHORT_ANSWER'::character varying, 'STRUCTURED'::character varying])::text[]))),
    CONSTRAINT questions_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 5))),
    CONSTRAINT questions_expected_time_seconds_check CHECK ((expected_time_seconds > 0)),
    CONSTRAINT questions_marks_check CHECK ((marks > 0))
);


ALTER TABLE public.questions OWNER TO neondb_owner;

--
-- Name: review_schedules; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.review_schedules (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    node_id uuid NOT NULL,
    due_at timestamp with time zone NOT NULL,
    reason character varying(40) DEFAULT 'DECAY_CROSSED_THRESHOLD'::character varying NOT NULL,
    mastery_at_trigger double precision,
    status character varying(16) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_review_reason CHECK (((reason)::text = ANY ((ARRAY['DECAY_CROSSED_THRESHOLD'::character varying, 'TEACHER_ASSIGNED'::character varying])::text[]))),
    CONSTRAINT ck_review_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


ALTER TABLE public.review_schedules OWNER TO neondb_owner;

--
-- Name: revision_note; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.revision_note (
    note_id character varying(256) NOT NULL,
    topic_order integer NOT NULL,
    topic_title character varying(512) NOT NULL,
    subtopic_order integer NOT NULL,
    subtopic_title character varying(512) NOT NULL,
    note_order integer NOT NULL,
    title character varying(512) NOT NULL,
    body_md text NOT NULL,
    spec_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    spec_point_codes text DEFAULT ''::text NOT NULL,
    source_url text,
    ingested_at timestamp with time zone NOT NULL,
    corpus_version character varying(128) NOT NULL
);


ALTER TABLE public.revision_note OWNER TO neondb_owner;

--
-- Name: revision_note_asset; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.revision_note_asset (
    filename character varying(512) NOT NULL,
    content_type character varying(128) NOT NULL,
    size_bytes bigint NOT NULL,
    bytes bytea NOT NULL,
    ingested_at timestamp with time zone NOT NULL,
    CONSTRAINT revision_note_asset_name_ck CHECK (((filename)::text !~ '[/\\]'::text))
);


ALTER TABLE public.revision_note_asset OWNER TO neondb_owner;

--
-- Name: revision_note_viewed; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.revision_note_viewed (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    note_id character varying(256) NOT NULL,
    viewed_at timestamp with time zone NOT NULL
);


ALTER TABLE public.revision_note_viewed OWNER TO neondb_owner;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.roles (
    name character varying(16) NOT NULL,
    description character varying(200) NOT NULL
);


ALTER TABLE public.roles OWNER TO neondb_owner;

--
-- Name: skill_states; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.skill_states (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    node_id uuid NOT NULL,
    mastery double precision NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    correct_count integer DEFAULT 0 NOT NULL,
    last_practiced_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    procedural_fluency_gap double precision,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT skill_states_mastery_check CHECK (((mastery >= (0)::double precision) AND (mastery <= (1)::double precision))),
    CONSTRAINT skill_states_procedural_fluency_gap_check CHECK (((procedural_fluency_gap >= ('-1'::integer)::double precision) AND (procedural_fluency_gap <= (1)::double precision)))
);


ALTER TABLE public.skill_states OWNER TO neondb_owner;

--
-- Name: smart_mark_agreement_evaluations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.smart_mark_agreement_evaluations (
    id uuid NOT NULL,
    scope character varying(12) NOT NULL,
    exam_paper_id uuid,
    sample_size integer NOT NULL,
    kappa double precision NOT NULL,
    observed_agreement double precision NOT NULL,
    threshold double precision DEFAULT 0.60 NOT NULL,
    passed boolean NOT NULL,
    computed_at timestamp with time zone NOT NULL,
    computed_by uuid,
    CONSTRAINT ck_agreement_paper CHECK ((((scope)::text <> 'PAPER'::text) OR (exam_paper_id IS NOT NULL))),
    CONSTRAINT ck_agreement_scope CHECK (((scope)::text = ANY ((ARRAY['PAPER'::character varying, 'ALL'::character varying])::text[]))),
    CONSTRAINT smart_mark_agreement_evaluations_sample_size_check CHECK ((sample_size > 0))
);


ALTER TABLE public.smart_mark_agreement_evaluations OWNER TO neondb_owner;

--
-- Name: smart_mark_results; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.smart_mark_results (
    id uuid NOT NULL,
    answer_id uuid NOT NULL,
    pipeline_version character varying(20) NOT NULL,
    model_id character varying(80),
    marks_awarded integer NOT NULL,
    confidence double precision,
    validation_passed boolean NOT NULL,
    breakdown jsonb,
    failure_reason character varying(200),
    raw_output text,
    created_at timestamp with time zone NOT NULL,
    mark_scheme_id uuid,
    scheme_validation_state character varying(12),
    CONSTRAINT smart_mark_results_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT smart_mark_results_marks_awarded_check CHECK ((marks_awarded >= 0))
);


ALTER TABLE public.smart_mark_results OWNER TO neondb_owner;

--
-- Name: struggle_inferences; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.struggle_inferences (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    topic_node_id uuid NOT NULL,
    type character varying(40) NOT NULL,
    subtype character varying(80) NOT NULL,
    probability double precision NOT NULL,
    supporting_evidence jsonb NOT NULL,
    model_version character varying(80) NOT NULL,
    generated_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    superseded_at timestamp with time zone,
    teacher_override character varying(40),
    overridden_by uuid,
    overridden_at timestamp with time zone,
    CONSTRAINT struggle_inferences_check CHECK ((expires_at > generated_at)),
    CONSTRAINT struggle_inferences_probability_check CHECK (((probability >= (0)::double precision) AND (probability <= (1)::double precision)))
);


ALTER TABLE public.struggle_inferences OWNER TO neondb_owner;

--
-- Name: subjects; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.subjects (
    id uuid NOT NULL,
    curriculum_version_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    knowledge_node_id uuid,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.subjects OWNER TO neondb_owner;

--
-- Name: teacher_validation_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.teacher_validation_events (
    id bigint NOT NULL,
    importer_run_id uuid NOT NULL,
    decision_seq integer NOT NULL,
    decision_hash character(64) NOT NULL,
    action character varying(12) NOT NULL,
    target_type character varying(20) NOT NULL,
    target_id uuid NOT NULL,
    target_label text DEFAULT ''::text NOT NULL,
    reviewer character varying(80) NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    result_state character varying(12) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_tve_action CHECK (((action)::text = ANY ((ARRAY['VALIDATE'::character varying, 'REJECT'::character varying, 'FLAG'::character varying, 'REVERSE'::character varying])::text[]))),
    CONSTRAINT ck_tve_result_state CHECK (((result_state)::text = ANY ((ARRAY['SUGGESTED'::character varying, 'VALIDATED'::character varying, 'REJECTED'::character varying])::text[]))),
    CONSTRAINT ck_tve_target_type CHECK (((target_type)::text = ANY ((ARRAY['question_version'::character varying, 'mark_scheme'::character varying, 'exam_paper'::character varying])::text[]))),
    CONSTRAINT ck_tve_targets_differ CHECK ((NOT (((action)::text = 'REVERSE'::text) AND (decision_seq <= 0))))
);


ALTER TABLE public.teacher_validation_events OWNER TO neondb_owner;

--
-- Name: teacher_validation_events_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.teacher_validation_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teacher_validation_events_id_seq OWNER TO neondb_owner;

--
-- Name: teacher_validation_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.teacher_validation_events_id_seq OWNED BY public.teacher_validation_events.id;


--
-- Name: teaching_coverage; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.teaching_coverage (
    class_id uuid NOT NULL,
    spec_point_node_id uuid NOT NULL,
    status character varying(16) NOT NULL,
    marked_by uuid NOT NULL,
    marked_at timestamp with time zone NOT NULL,
    note character varying(500),
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_tcov_status CHECK (((status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[])))
);


ALTER TABLE public.teaching_coverage OWNER TO neondb_owner;

--
-- Name: teaching_coverage_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.teaching_coverage_events (
    id uuid NOT NULL,
    class_id uuid NOT NULL,
    spec_point_node_id uuid NOT NULL,
    status character varying(16) NOT NULL,
    previous_status character varying(16),
    actor_id uuid NOT NULL,
    note character varying(500),
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_tcov_event_prev CHECK (((previous_status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[]))),
    CONSTRAINT ck_tcov_event_status CHECK (((status)::text = ANY ((ARRAY['TAUGHT'::character varying, 'NOT_TAUGHT'::character varying])::text[])))
);


ALTER TABLE public.teaching_coverage_events OWNER TO neondb_owner;

--
-- Name: telemetry_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.telemetry_events (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    event_type character varying(40) NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_telemetry_type CHECK (((event_type)::text = ANY ((ARRAY['ATTEMPT_SUBMITTED'::character varying, 'BKT_UPDATED'::character varying, 'BDT_UPDATED'::character varying, 'REVIEW_SCHEDULED'::character varying, 'DECAY_APPLIED'::character varying, 'SELF_DOUBT_FLAGGED'::character varying, 'SMART_MARK_COMPLETED'::character varying, 'HUMAN_MARK_RECORDED'::character varying, 'KA_RAG_COMPLETED'::character varying, 'STRUGGLE_INFERRED'::character varying, 'TUTOR_INTERVENTION_SELECTED'::character varying, 'CLA_EXCHANGE_COMPLETED'::character varying, 'SMART_FEEDBACK_EXPLAINED'::character varying, 'SMART_IMPROVEMENT_PLAN_VIEWED'::character varying])::text[])))
);


ALTER TABLE public.telemetry_events OWNER TO neondb_owner;

--
-- Name: tutor_session_turns; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tutor_session_turns (
    id uuid NOT NULL,
    session_id uuid NOT NULL,
    seq integer NOT NULL,
    role character varying(16) NOT NULL,
    content text NOT NULL,
    evidence_count integer DEFAULT 0 NOT NULL,
    refused boolean DEFAULT false NOT NULL,
    answer_model character varying(120),
    answer_provider character varying(60),
    latency_ms double precision,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_tutor_session_turn_role CHECK (((role)::text = ANY (ARRAY[('user'::character varying)::text, ('assistant'::character varying)::text])))
);


ALTER TABLE public.tutor_session_turns OWNER TO neondb_owner;

--
-- Name: tutor_sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tutor_sessions (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    last_active_at timestamp with time zone NOT NULL,
    course_ref character varying(64)
);


ALTER TABLE public.tutor_sessions OWNER TO neondb_owner;

--
-- Name: tutor_topic_engagements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tutor_topic_engagements (
    id uuid NOT NULL,
    learner_id uuid NOT NULL,
    node_id uuid NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    evidence_count integer NOT NULL,
    refused boolean NOT NULL,
    answer_model character varying(120),
    created_at timestamp with time zone NOT NULL,
    signal_type character varying(24) DEFAULT 'TOPIC_ENGAGEMENT'::character varying NOT NULL,
    surface character varying(24) DEFAULT 'FREE_TUTOR'::character varying NOT NULL,
    response_mode character varying(20),
    context_kind character varying(32),
    context_reference uuid,
    classifier_version character varying(48) DEFAULT 'tutor-signals/v1'::character varying NOT NULL,
    CONSTRAINT ck_tte_signal CHECK (((signal_type)::text = ANY ((ARRAY['TOPIC_ENGAGEMENT'::character varying, 'EXPLANATION_REQUEST'::character varying, 'DOUBT_SIGNAL'::character varying, 'MISCONCEPTION_RELATED'::character varying, 'PREREQUISITE_HELP'::character varying, 'CLARIFICATION_REQUEST'::character varying])::text[]))),
    CONSTRAINT ck_tte_surface CHECK (((surface)::text = ANY ((ARRAY['FREE_TUTOR'::character varying, 'CONTEXTUAL_ASSISTANT'::character varying])::text[])))
);


ALTER TABLE public.tutor_topic_engagements OWNER TO neondb_owner;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role character varying(16) NOT NULL
);


ALTER TABLE public.user_roles OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email character varying(254) NOT NULL,
    password_hash character varying(100) NOT NULL,
    display_name character varying(100) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    token_version bigint DEFAULT 1 NOT NULL
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: content_review_audit id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.content_review_audit ALTER COLUMN id SET DEFAULT nextval('public.content_review_audit_id_seq'::regclass);


--
-- Name: teacher_validation_events id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teacher_validation_events ALTER COLUMN id SET DEFAULT nextval('public.teacher_validation_events_id_seq'::regclass);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);


--
-- Name: jwks jwks_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: organization organization_slug_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.organization
    ADD CONSTRAINT organization_slug_key UNIQUE (slug);


--
-- Name: project_config project_config_endpoint_id_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.project_config
    ADD CONSTRAINT project_config_endpoint_id_key UNIQUE (endpoint_id);


--
-- Name: project_config project_config_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.project_config
    ADD CONSTRAINT project_config_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: answers answers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_pkey PRIMARY KEY (id);


--
-- Name: archive_tc27_card_wave_20260928 archive_tc27_card_wave_20260928_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.archive_tc27_card_wave_20260928
    ADD CONSTRAINT archive_tc27_card_wave_20260928_pkey PRIMARY KEY (id);


--
-- Name: assignment_submissions assignment_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);


--
-- Name: book_chapters book_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.book_chapters
    ADD CONSTRAINT book_chapters_pkey PRIMARY KEY (id);


--
-- Name: bootstrap_admin_state bootstrap_admin_state_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bootstrap_admin_state
    ADD CONSTRAINT bootstrap_admin_state_pkey PRIMARY KEY (id);


--
-- Name: campaign_db_identity campaign_db_identity_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_db_identity
    ADD CONSTRAINT campaign_db_identity_pkey PRIMARY KEY (id);


--
-- Name: class_members class_members_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT class_members_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: content_review_audit content_review_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.content_review_audit
    ADD CONSTRAINT content_review_audit_pkey PRIMARY KEY (id);


--
-- Name: curriculum_versions curriculum_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.curriculum_versions
    ADD CONSTRAINT curriculum_versions_pkey PRIMARY KEY (id);


--
-- Name: decay_job_runs decay_job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.decay_job_runs
    ADD CONSTRAINT decay_job_runs_pkey PRIMARY KEY (window_start);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: exam_papers exam_papers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.exam_papers
    ADD CONSTRAINT exam_papers_pkey PRIMARY KEY (id);


--
-- Name: exam_series exam_series_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.exam_series
    ADD CONSTRAINT exam_series_pkey PRIMARY KEY (id);


--
-- Name: experiments experiments_experiment_key_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_experiment_key_key UNIQUE (experiment_key);


--
-- Name: experiments experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);


--
-- Name: flashcard_ratings flashcard_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.flashcard_ratings
    ADD CONSTRAINT flashcard_ratings_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history flyway_schema_history_pk; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.flyway_schema_history
    ADD CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank);


--
-- Name: glm_ocr_bridge_records glm_ocr_bridge_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.glm_ocr_bridge_records
    ADD CONSTRAINT glm_ocr_bridge_records_pkey PRIMARY KEY (id);


--
-- Name: human_marks human_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.human_marks
    ADD CONSTRAINT human_marks_pkey PRIMARY KEY (id);


--
-- Name: intervention_run_evidence intervention_run_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.intervention_run_evidence
    ADD CONSTRAINT intervention_run_evidence_pkey PRIMARY KEY (id);


--
-- Name: intervention_run intervention_run_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.intervention_run
    ADD CONSTRAINT intervention_run_pkey PRIMARY KEY (run_id);


--
-- Name: intervention_run_step intervention_run_step_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.intervention_run_step
    ADD CONSTRAINT intervention_run_step_pkey PRIMARY KEY (step_id);


--
-- Name: intervention_run_step intervention_run_step_unique_seq; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.intervention_run_step
    ADD CONSTRAINT intervention_run_step_unique_seq UNIQUE (run_id, sequence_no);


--
-- Name: knowledge_edges knowledge_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.knowledge_edges
    ADD CONSTRAINT knowledge_edges_pkey PRIMARY KEY (id);


--
-- Name: knowledge_nodes knowledge_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.knowledge_nodes
    ADD CONSTRAINT knowledge_nodes_pkey PRIMARY KEY (id);


--
-- Name: learner_course_enrolments learner_course_enrolments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.learner_course_enrolments
    ADD CONSTRAINT learner_course_enrolments_pkey PRIMARY KEY (id);


--
-- Name: learner_self_marks learner_self_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.learner_self_marks
    ADD CONSTRAINT learner_self_marks_pkey PRIMARY KEY (id);


--
-- Name: mark_points mark_points_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mark_points
    ADD CONSTRAINT mark_points_pkey PRIMARY KEY (id);


--
-- Name: mark_schemes mark_schemes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mark_schemes
    ADD CONSTRAINT mark_schemes_pkey PRIMARY KEY (id);


--
-- Name: misconception_states misconception_states_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.misconception_states
    ADD CONSTRAINT misconception_states_pkey PRIMARY KEY (id);


--
-- Name: model_versions model_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.model_versions
    ADD CONSTRAINT model_versions_pkey PRIMARY KEY (id);


--
-- Name: note_votes note_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.note_votes
    ADD CONSTRAINT note_votes_pkey PRIMARY KEY (id);


--
-- Name: announcement_reads pk_ann_read; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT pk_ann_read PRIMARY KEY (announcement_id, student_id);


--
-- Name: prompt_versions prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: question_asset question_asset_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_asset
    ADD CONSTRAINT question_asset_pkey PRIMARY KEY (filename);


--
-- Name: question_options question_options_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_pkey PRIMARY KEY (id);


--
-- Name: question_parts question_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_parts
    ADD CONSTRAINT question_parts_pkey PRIMARY KEY (id);


--
-- Name: question_spec_points question_spec_points_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_spec_points
    ADD CONSTRAINT question_spec_points_pkey PRIMARY KEY (id);


--
-- Name: question_topics question_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_topics
    ADD CONSTRAINT question_topics_pkey PRIMARY KEY (id);


--
-- Name: question_versions question_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_versions
    ADD CONSTRAINT question_versions_pkey PRIMARY KEY (id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: review_schedules review_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.review_schedules
    ADD CONSTRAINT review_schedules_pkey PRIMARY KEY (id);


--
-- Name: revision_note_asset revision_note_asset_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.revision_note_asset
    ADD CONSTRAINT revision_note_asset_pkey PRIMARY KEY (filename);


--
-- Name: revision_note revision_note_order_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.revision_note
    ADD CONSTRAINT revision_note_order_unique UNIQUE (topic_order, subtopic_order, note_order);


--
-- Name: revision_note revision_note_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.revision_note
    ADD CONSTRAINT revision_note_pkey PRIMARY KEY (note_id);


--
-- Name: revision_note_viewed revision_note_viewed_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.revision_note_viewed
    ADD CONSTRAINT revision_note_viewed_pkey PRIMARY KEY (id);


--
-- Name: revision_note_viewed revision_note_viewed_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.revision_note_viewed
    ADD CONSTRAINT revision_note_viewed_unique UNIQUE (user_id, note_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (name);


--
-- Name: skill_states skill_states_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.skill_states
    ADD CONSTRAINT skill_states_pkey PRIMARY KEY (id);


--
-- Name: smart_mark_agreement_evaluations smart_mark_agreement_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.smart_mark_agreement_evaluations
    ADD CONSTRAINT smart_mark_agreement_evaluations_pkey PRIMARY KEY (id);


--
-- Name: smart_mark_results smart_mark_results_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.smart_mark_results
    ADD CONSTRAINT smart_mark_results_pkey PRIMARY KEY (id);


--
-- Name: struggle_inferences struggle_inferences_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.struggle_inferences
    ADD CONSTRAINT struggle_inferences_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: teacher_validation_events teacher_validation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teacher_validation_events
    ADD CONSTRAINT teacher_validation_events_pkey PRIMARY KEY (id);


--
-- Name: teaching_coverage_events teaching_coverage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teaching_coverage_events
    ADD CONSTRAINT teaching_coverage_events_pkey PRIMARY KEY (id);


--
-- Name: teaching_coverage teaching_coverage_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teaching_coverage
    ADD CONSTRAINT teaching_coverage_pkey PRIMARY KEY (class_id, spec_point_node_id);


--
-- Name: telemetry_events telemetry_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.telemetry_events
    ADD CONSTRAINT telemetry_events_pkey PRIMARY KEY (id);


--
-- Name: tutor_session_turns tutor_session_turns_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tutor_session_turns
    ADD CONSTRAINT tutor_session_turns_pkey PRIMARY KEY (id);


--
-- Name: tutor_sessions tutor_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tutor_sessions
    ADD CONSTRAINT tutor_sessions_pkey PRIMARY KEY (id);


--
-- Name: tutor_topic_engagements tutor_topic_engagements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tutor_topic_engagements
    ADD CONSTRAINT tutor_topic_engagements_pkey PRIMARY KEY (id);


--
-- Name: answers uq_answer_per_part; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT uq_answer_per_part UNIQUE (attempt_id, question_part_id);


--
-- Name: document_chunks uq_document_chunk; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT uq_document_chunk UNIQUE (document_row_id, chunk_index);


--
-- Name: knowledge_edges uq_edge; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.knowledge_edges
    ADD CONSTRAINT uq_edge UNIQUE (source_node_id, target_node_id, relation_type);


--
-- Name: exam_series uq_exam_series; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.exam_series
    ADD CONSTRAINT uq_exam_series UNIQUE (board, qualification, series_code);


--
-- Name: learner_course_enrolments uq_learner_course_enrolment; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.learner_course_enrolments
    ADD CONSTRAINT uq_learner_course_enrolment UNIQUE (learner_id, course_slug);


--
-- Name: mark_schemes uq_mark_scheme; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mark_schemes
    ADD CONSTRAINT uq_mark_scheme UNIQUE (question_version_id, version_label);


--
-- Name: misconception_states uq_misconception_state; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.misconception_states
    ADD CONSTRAINT uq_misconception_state UNIQUE (learner_id, misconception_node_id);


--
-- Name: model_versions uq_model_version; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.model_versions
    ADD CONSTRAINT uq_model_version UNIQUE (registry_key, version);


--
-- Name: prompt_versions uq_prompt_version; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT uq_prompt_version UNIQUE (registry_key, version);


--
-- Name: question_options uq_question_option_label; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT uq_question_option_label UNIQUE (question_id, label);


--
-- Name: question_parts uq_question_part; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_parts
    ADD CONSTRAINT uq_question_part UNIQUE (question_version_id, label);


--
-- Name: question_spec_points uq_question_spec_point; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_spec_points
    ADD CONSTRAINT uq_question_spec_point UNIQUE (question_id, spec_point_node_id);


--
-- Name: question_topics uq_question_topic; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_topics
    ADD CONSTRAINT uq_question_topic UNIQUE (question_id, node_id);


--
-- Name: question_versions uq_question_version; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_versions
    ADD CONSTRAINT uq_question_version UNIQUE (question_id, version);


--
-- Name: skill_states uq_skill_state; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.skill_states
    ADD CONSTRAINT uq_skill_state UNIQUE (learner_id, node_id);


--
-- Name: tutor_session_turns uq_tutor_session_turn_seq; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tutor_session_turns
    ADD CONSTRAINT uq_tutor_session_turn_seq UNIQUE (session_id, seq);


--
-- Name: teacher_validation_events uq_tve_decision; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teacher_validation_events
    ADD CONSTRAINT uq_tve_decision UNIQUE (decision_seq, decision_hash);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: class_members ux_cmember_pair; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT ux_cmember_pair UNIQUE (class_id, student_id);


--
-- Name: account_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "account_userId_idx" ON neon_auth.account USING btree ("userId");


--
-- Name: invitation_email_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX invitation_email_idx ON neon_auth.invitation USING btree (email);


--
-- Name: invitation_organizationId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "invitation_organizationId_idx" ON neon_auth.invitation USING btree ("organizationId");


--
-- Name: member_organizationId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "member_organizationId_idx" ON neon_auth.member USING btree ("organizationId");


--
-- Name: member_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "member_userId_idx" ON neon_auth.member USING btree ("userId");


--
-- Name: organization_slug_uidx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE UNIQUE INDEX organization_slug_uidx ON neon_auth.organization USING btree (slug);


--
-- Name: session_userId_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX "session_userId_idx" ON neon_auth.session USING btree ("userId");


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: neon_auth; Owner: neon_auth
--

CREATE INDEX verification_identifier_idx ON neon_auth.verification USING btree (identifier);


--
-- Name: archive_tc27_card_wave_20260928_checksum_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX archive_tc27_card_wave_20260928_checksum_idx ON public.archive_tc27_card_wave_20260928 USING btree (checksum);


--
-- Name: archive_tc27_card_wave_20260928_created_at_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX archive_tc27_card_wave_20260928_created_at_idx ON public.archive_tc27_card_wave_20260928 USING btree (created_at DESC);


--
-- Name: archive_tc27_card_wave_20260928_document_id_doc_version_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX archive_tc27_card_wave_20260928_document_id_doc_version_idx ON public.archive_tc27_card_wave_20260928 USING btree (document_id, doc_version);


--
-- Name: archive_tc27_card_wave_20260928_kind_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX archive_tc27_card_wave_20260928_kind_idx ON public.archive_tc27_card_wave_20260928 USING btree (kind);


--
-- Name: flyway_schema_history_s_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);


--
-- Name: idx_document_chunks_content_tsv; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_document_chunks_content_tsv ON public.document_chunks USING gin (content_tsv);


--
-- Name: idx_struggle_inference_learner_expiry; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_struggle_inference_learner_expiry ON public.struggle_inferences USING btree (learner_id, expires_at DESC, probability DESC);


--
-- Name: idx_struggle_inference_learner_topic_expiry; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_struggle_inference_learner_topic_expiry ON public.struggle_inferences USING btree (learner_id, topic_node_id, expires_at DESC, probability DESC);


--
-- Name: idx_struggle_inference_supersede; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_struggle_inference_supersede ON public.struggle_inferences USING btree (learner_id, topic_node_id, type, expires_at DESC) WHERE (superseded_at IS NULL);


--
-- Name: idx_tutor_session_turns_session; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tutor_session_turns_session ON public.tutor_session_turns USING btree (session_id, seq);


--
-- Name: idx_tutor_sessions_learner_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tutor_sessions_learner_active ON public.tutor_sessions USING btree (learner_id, last_active_at DESC);


--
-- Name: intervention_run_evidence_run_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX intervention_run_evidence_run_idx ON public.intervention_run_evidence USING btree (run_id, captured_at);


--
-- Name: intervention_run_learner_created_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX intervention_run_learner_created_idx ON public.intervention_run USING btree (learner_id, created_at DESC);


--
-- Name: intervention_run_step_run_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX intervention_run_step_run_idx ON public.intervention_run_step USING btree (run_id, sequence_no);


--
-- Name: ix_ann_class_recent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_ann_class_recent ON public.announcements USING btree (class_id, created_at DESC);


--
-- Name: ix_answers_attempt; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_answers_attempt ON public.answers USING btree (attempt_id);


--
-- Name: ix_answers_part; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_answers_part ON public.answers USING btree (question_part_id);


--
-- Name: ix_answers_state; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_answers_state ON public.answers USING btree (marking_state);


--
-- Name: ix_as_class; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_as_class ON public.assignments USING btree (class_id);


--
-- Name: ix_as_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_as_created ON public.assignments USING btree (created_at DESC);


--
-- Name: ix_as_teacher; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_as_teacher ON public.assignments USING btree (teacher_id);


--
-- Name: ix_asub_assignment_recent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_asub_assignment_recent ON public.assignment_submissions USING btree (assignment_id, occurred_at DESC);


--
-- Name: ix_asub_learner; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_asub_learner ON public.assignment_submissions USING btree (learner_id);


--
-- Name: ix_attempts_learner_time; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_attempts_learner_time ON public.attempts USING btree (learner_id, created_at DESC);


--
-- Name: ix_attempts_question; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_attempts_question ON public.attempts USING btree (question_id);


--
-- Name: ix_book_chapters_course; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_book_chapters_course ON public.book_chapters USING btree (course_id);


--
-- Name: ix_class_teacher; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_class_teacher ON public.classes USING btree (teacher_id);


--
-- Name: ix_cmember_student; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_cmember_student ON public.class_members USING btree (student_id);


--
-- Name: ix_cra_actor; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_cra_actor ON public.content_review_audit USING btree (actor_user_id);


--
-- Name: ix_cra_occurred; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_cra_occurred ON public.content_review_audit USING btree (occurred_at DESC);


--
-- Name: ix_cra_target; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_cra_target ON public.content_review_audit USING btree (target_type, target_id);


--
-- Name: ix_document_chunks_document; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_document_chunks_document ON public.document_chunks USING btree (document_row_id);


--
-- Name: ix_document_chunks_embedding; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_document_chunks_embedding ON public.document_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: ix_document_chunks_pending; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_document_chunks_pending ON public.document_chunks USING btree (document_row_id) WHERE (embedding IS NULL);


--
-- Name: ix_document_chunks_spec_codes; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_document_chunks_spec_codes ON public.document_chunks USING gin (spec_codes) WHERE (spec_codes IS NOT NULL);


--
-- Name: ix_document_chunks_subject_kind; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_document_chunks_subject_kind ON public.document_chunks USING btree (subject_id, kind) WHERE (subject_id IS NOT NULL);


--
-- Name: ix_document_chunks_subject_year_series; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_document_chunks_subject_year_series ON public.document_chunks USING btree (subject_id, year, series) WHERE (subject_id IS NOT NULL);


--
-- Name: ix_documents_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_documents_created ON public.documents USING btree (created_at DESC);


--
-- Name: ix_documents_kind; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_documents_kind ON public.documents USING btree (kind);


--
-- Name: ix_edge_source_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_edge_source_type ON public.knowledge_edges USING btree (source_node_id, relation_type);


--
-- Name: ix_edge_target_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_edge_target_type ON public.knowledge_edges USING btree (target_node_id, relation_type);


--
-- Name: ix_exam_papers_paper_year_series; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_exam_papers_paper_year_series ON public.exam_papers USING btree (paper_code, year, series) WHERE (paper_code IS NOT NULL);


--
-- Name: ix_exam_papers_subject; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_exam_papers_subject ON public.exam_papers USING btree (subject_id);


--
-- Name: ix_exam_series_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_exam_series_lookup ON public.exam_series USING btree (board, qualification, published, window_start);


--
-- Name: ix_fr_learner_card; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_fr_learner_card ON public.flashcard_ratings USING btree (learner_id, card_id);


--
-- Name: ix_fr_learner_recent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_fr_learner_recent ON public.flashcard_ratings USING btree (learner_id, occurred_at DESC);


--
-- Name: ix_glm_ocr_bridge_reconciliation; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_glm_ocr_bridge_reconciliation ON public.glm_ocr_bridge_records USING btree (reconciliation_status);


--
-- Name: ix_human_marks_answer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_human_marks_answer ON public.human_marks USING btree (answer_id, created_at DESC);


--
-- Name: ix_knowledge_node_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_knowledge_node_type ON public.knowledge_nodes USING btree (node_type);


--
-- Name: ix_learner_course_enrolment_series; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_learner_course_enrolment_series ON public.learner_course_enrolments USING btree (target_series_id);


--
-- Name: ix_lsm_answer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_lsm_answer ON public.learner_self_marks USING btree (answer_id);


--
-- Name: ix_lsm_learner; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_lsm_learner ON public.learner_self_marks USING btree (learner_id);


--
-- Name: ix_mark_points_part; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_mark_points_part ON public.mark_points USING btree (question_part_id);


--
-- Name: ix_mark_points_scheme; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_mark_points_scheme ON public.mark_points USING btree (mark_scheme_id, ordering);


--
-- Name: ix_nv_learner_note; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_nv_learner_note ON public.note_votes USING btree (learner_id, note_id);


--
-- Name: ix_nv_learner_recent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_nv_learner_recent ON public.note_votes USING btree (learner_id, occurred_at DESC);


--
-- Name: ix_options_question; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_options_question ON public.question_options USING btree (question_id, ordering);


--
-- Name: ix_qsp_node; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_qsp_node ON public.question_spec_points USING btree (spec_point_node_id);


--
-- Name: ix_qsp_question; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_qsp_question ON public.question_spec_points USING btree (question_id);


--
-- Name: ix_question_parts_version; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_question_parts_version ON public.question_parts USING btree (question_version_id, ordering);


--
-- Name: ix_question_versions_question; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_question_versions_question ON public.question_versions USING btree (question_id, version DESC);


--
-- Name: ix_questions_paper; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_questions_paper ON public.questions USING btree (exam_paper_id) WHERE (exam_paper_id IS NOT NULL);


--
-- Name: ix_questions_topic; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_questions_topic ON public.questions USING btree (primary_topic_node_id) WHERE active;


--
-- Name: ix_review_learner_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_review_learner_status ON public.review_schedules USING btree (learner_id, status, due_at);


--
-- Name: ix_review_status_due; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_review_status_due ON public.review_schedules USING btree (status, due_at);


--
-- Name: ix_skill_states_last_practice; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_skill_states_last_practice ON public.skill_states USING btree (last_practiced_at);


--
-- Name: ix_skill_states_node; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_skill_states_node ON public.skill_states USING btree (node_id);


--
-- Name: ix_smart_mark_results_answer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_smart_mark_results_answer ON public.smart_mark_results USING btree (answer_id, created_at DESC);


--
-- Name: ix_tcov_event_point; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_tcov_event_point ON public.teaching_coverage_events USING btree (class_id, spec_point_node_id, created_at DESC);


--
-- Name: ix_telemetry_learner_time; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_telemetry_learner_time ON public.telemetry_events USING btree (learner_id, occurred_at DESC);


--
-- Name: ix_telemetry_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_telemetry_type ON public.telemetry_events USING btree (event_type);


--
-- Name: ix_tte_learner_recent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_tte_learner_recent ON public.tutor_topic_engagements USING btree (learner_id, occurred_at DESC);


--
-- Name: ix_tte_learner_signal; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_tte_learner_signal ON public.tutor_topic_engagements USING btree (learner_id, signal_type);


--
-- Name: ix_tte_learner_surface; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_tte_learner_surface ON public.tutor_topic_engagements USING btree (learner_id, surface, occurred_at DESC);


--
-- Name: ix_tte_node; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_tte_node ON public.tutor_topic_engagements USING btree (node_id);


--
-- Name: ix_tve_run; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_tve_run ON public.teacher_validation_events USING btree (importer_run_id);


--
-- Name: ix_tve_target; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX ix_tve_target ON public.teacher_validation_events USING btree (target_type, target_id);


--
-- Name: revision_note_tree_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX revision_note_tree_idx ON public.revision_note USING btree (topic_order, subtopic_order, note_order);


--
-- Name: revision_note_viewed_user_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX revision_note_viewed_user_idx ON public.revision_note_viewed USING btree (user_id, viewed_at DESC);


--
-- Name: uq_book_chapters_identity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_book_chapters_identity ON public.book_chapters USING btree (document_id, doc_version, chapter_key);


--
-- Name: uq_documents_canonical_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_documents_canonical_id ON public.documents USING btree (document_id, doc_version);


--
-- Name: uq_documents_checksum; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_documents_checksum ON public.documents USING btree (checksum);


--
-- Name: uq_exam_paper_identity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_exam_paper_identity ON public.exam_papers USING btree (paper_code, session_label) WHERE (paper_code IS NOT NULL);


--
-- Name: uq_glm_ocr_bridge_pair; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_glm_ocr_bridge_pair ON public.glm_ocr_bridge_records USING btree (qp_document_id, ms_document_id);


--
-- Name: uq_glm_ocr_bridge_paper; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_glm_ocr_bridge_paper ON public.glm_ocr_bridge_records USING btree (paper_id);


--
-- Name: uq_knowledge_node_code; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_knowledge_node_code ON public.knowledge_nodes USING btree (code);


--
-- Name: uq_one_correct_option; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_one_correct_option ON public.question_options USING btree (question_id) WHERE is_correct;


--
-- Name: uq_users_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (lower((email)::text));


--
-- Name: ux_class_teacher_course_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX ux_class_teacher_course_name ON public.classes USING btree (teacher_id, course_slug, lower((name)::text)) WHERE ((status)::text = 'ACTIVE'::text);


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_inviterId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_organizationId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.invitation
    ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE;


--
-- Name: member member_organizationId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE;


--
-- Name: member member_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.member
    ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: neon_auth; Owner: neon_auth
--

ALTER TABLE ONLY neon_auth.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE;


--
-- Name: answers answers_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id) ON DELETE CASCADE;


--
-- Name: answers answers_question_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_question_part_id_fkey FOREIGN KEY (question_part_id) REFERENCES public.question_parts(id);


--
-- Name: assignments assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- Name: attempts attempts_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: attempts attempts_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- Name: book_chapters book_chapters_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.book_chapters
    ADD CONSTRAINT book_chapters_document_fkey FOREIGN KEY (document_id, doc_version) REFERENCES public.documents(document_id, doc_version);


--
-- Name: bootstrap_admin_state bootstrap_admin_state_claimed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bootstrap_admin_state
    ADD CONSTRAINT bootstrap_admin_state_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.users(id);


--
-- Name: content_review_audit content_review_audit_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.content_review_audit
    ADD CONSTRAINT content_review_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_chunks document_chunks_document_row_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_row_id_fkey FOREIGN KEY (document_row_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_chunks document_chunks_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: exam_papers exam_papers_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.exam_papers
    ADD CONSTRAINT exam_papers_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: announcements fk_ann_class; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT fk_ann_class FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: announcement_reads fk_ann_read_ann; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT fk_ann_read_ann FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: class_members fk_cmember_class; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.class_members
    ADD CONSTRAINT fk_cmember_class FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: glm_ocr_bridge_records glm_ocr_bridge_records_paper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.glm_ocr_bridge_records
    ADD CONSTRAINT glm_ocr_bridge_records_paper_id_fkey FOREIGN KEY (paper_id) REFERENCES public.exam_papers(id);


--
-- Name: human_marks human_marks_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.human_marks
    ADD CONSTRAINT human_marks_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES public.answers(id) ON DELETE CASCADE;


--
-- Name: intervention_run_evidence intervention_run_evidence_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.intervention_run_evidence
    ADD CONSTRAINT intervention_run_evidence_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.intervention_run(run_id);


--
-- Name: intervention_run intervention_run_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.intervention_run
    ADD CONSTRAINT intervention_run_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id);


--
-- Name: intervention_run_step intervention_run_step_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.intervention_run_step
    ADD CONSTRAINT intervention_run_step_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.intervention_run(run_id);


--
-- Name: knowledge_edges knowledge_edges_source_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.knowledge_edges
    ADD CONSTRAINT knowledge_edges_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE;


--
-- Name: knowledge_edges knowledge_edges_target_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.knowledge_edges
    ADD CONSTRAINT knowledge_edges_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE;


--
-- Name: learner_course_enrolments learner_course_enrolments_target_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.learner_course_enrolments
    ADD CONSTRAINT learner_course_enrolments_target_series_id_fkey FOREIGN KEY (target_series_id) REFERENCES public.exam_series(id);


--
-- Name: learner_self_marks learner_self_marks_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.learner_self_marks
    ADD CONSTRAINT learner_self_marks_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES public.answers(id) ON DELETE CASCADE;


--
-- Name: learner_self_marks learner_self_marks_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.learner_self_marks
    ADD CONSTRAINT learner_self_marks_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mark_points mark_points_mark_scheme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mark_points
    ADD CONSTRAINT mark_points_mark_scheme_id_fkey FOREIGN KEY (mark_scheme_id) REFERENCES public.mark_schemes(id) ON DELETE CASCADE;


--
-- Name: mark_points mark_points_question_part_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mark_points
    ADD CONSTRAINT mark_points_question_part_id_fkey FOREIGN KEY (question_part_id) REFERENCES public.question_parts(id);


--
-- Name: mark_schemes mark_schemes_question_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mark_schemes
    ADD CONSTRAINT mark_schemes_question_version_id_fkey FOREIGN KEY (question_version_id) REFERENCES public.question_versions(id) ON DELETE CASCADE;


--
-- Name: misconception_states misconception_states_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.misconception_states
    ADD CONSTRAINT misconception_states_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: question_options question_options_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: question_parts question_parts_question_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_parts
    ADD CONSTRAINT question_parts_question_version_id_fkey FOREIGN KEY (question_version_id) REFERENCES public.question_versions(id) ON DELETE CASCADE;


--
-- Name: question_spec_points question_spec_points_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_spec_points
    ADD CONSTRAINT question_spec_points_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: question_spec_points question_spec_points_spec_point_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_spec_points
    ADD CONSTRAINT question_spec_points_spec_point_node_id_fkey FOREIGN KEY (spec_point_node_id) REFERENCES public.knowledge_nodes(id);


--
-- Name: question_topics question_topics_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_topics
    ADD CONSTRAINT question_topics_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: question_versions question_versions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.question_versions
    ADD CONSTRAINT question_versions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: questions questions_exam_paper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_exam_paper_id_fkey FOREIGN KEY (exam_paper_id) REFERENCES public.exam_papers(id);


--
-- Name: review_schedules review_schedules_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.review_schedules
    ADD CONSTRAINT review_schedules_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: revision_note_viewed revision_note_viewed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.revision_note_viewed
    ADD CONSTRAINT revision_note_viewed_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: skill_states skill_states_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.skill_states
    ADD CONSTRAINT skill_states_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: smart_mark_agreement_evaluations smart_mark_agreement_evaluations_exam_paper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.smart_mark_agreement_evaluations
    ADD CONSTRAINT smart_mark_agreement_evaluations_exam_paper_id_fkey FOREIGN KEY (exam_paper_id) REFERENCES public.exam_papers(id);


--
-- Name: smart_mark_results smart_mark_results_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.smart_mark_results
    ADD CONSTRAINT smart_mark_results_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES public.answers(id) ON DELETE CASCADE;


--
-- Name: smart_mark_results smart_mark_results_mark_scheme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.smart_mark_results
    ADD CONSTRAINT smart_mark_results_mark_scheme_id_fkey FOREIGN KEY (mark_scheme_id) REFERENCES public.mark_schemes(id);


--
-- Name: struggle_inferences struggle_inferences_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.struggle_inferences
    ADD CONSTRAINT struggle_inferences_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id);


--
-- Name: struggle_inferences struggle_inferences_overridden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.struggle_inferences
    ADD CONSTRAINT struggle_inferences_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES public.users(id);


--
-- Name: struggle_inferences struggle_inferences_topic_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.struggle_inferences
    ADD CONSTRAINT struggle_inferences_topic_node_id_fkey FOREIGN KEY (topic_node_id) REFERENCES public.knowledge_nodes(id);


--
-- Name: subjects subjects_curriculum_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_curriculum_version_id_fkey FOREIGN KEY (curriculum_version_id) REFERENCES public.curriculum_versions(id);


--
-- Name: teaching_coverage teaching_coverage_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teaching_coverage
    ADD CONSTRAINT teaching_coverage_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: teaching_coverage_events teaching_coverage_events_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teaching_coverage_events
    ADD CONSTRAINT teaching_coverage_events_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: teaching_coverage_events teaching_coverage_events_spec_point_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teaching_coverage_events
    ADD CONSTRAINT teaching_coverage_events_spec_point_node_id_fkey FOREIGN KEY (spec_point_node_id) REFERENCES public.knowledge_nodes(id);


--
-- Name: teaching_coverage teaching_coverage_spec_point_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.teaching_coverage
    ADD CONSTRAINT teaching_coverage_spec_point_node_id_fkey FOREIGN KEY (spec_point_node_id) REFERENCES public.knowledge_nodes(id);


--
-- Name: telemetry_events telemetry_events_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.telemetry_events
    ADD CONSTRAINT telemetry_events_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tutor_session_turns tutor_session_turns_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tutor_session_turns
    ADD CONSTRAINT tutor_session_turns_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.tutor_sessions(id) ON DELETE CASCADE;


--
-- Name: tutor_sessions tutor_sessions_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tutor_sessions
    ADD CONSTRAINT tutor_sessions_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tutor_topic_engagements tutor_topic_engagements_learner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tutor_topic_engagements
    ADD CONSTRAINT tutor_topic_engagements_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_fkey FOREIGN KEY (role) REFERENCES public.roles(name);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO t0_readonly;
GRANT USAGE ON SCHEMA public TO syllabai_v2_app_w2r2;


--
-- Name: TABLE announcement_reads; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.announcement_reads TO t0_readonly;


--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.announcements TO t0_readonly;


--
-- Name: TABLE answers; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.answers TO t0_readonly;


--
-- Name: TABLE archive_tc27_card_wave_20260928; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.archive_tc27_card_wave_20260928 TO t0_readonly;


--
-- Name: TABLE assignment_submissions; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.assignment_submissions TO t0_readonly;


--
-- Name: TABLE assignments; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.assignments TO t0_readonly;


--
-- Name: TABLE attempts; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.attempts TO t0_readonly;


--
-- Name: TABLE book_chapters; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.book_chapters TO t0_readonly;


--
-- Name: TABLE bootstrap_admin_state; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.bootstrap_admin_state TO t0_readonly;


--
-- Name: TABLE campaign_db_identity; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.campaign_db_identity TO t0_readonly;


--
-- Name: TABLE class_members; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.class_members TO t0_readonly;


--
-- Name: TABLE classes; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.classes TO t0_readonly;


--
-- Name: TABLE content_review_audit; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.content_review_audit TO t0_readonly;


--
-- Name: SEQUENCE content_review_audit_id_seq; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON SEQUENCE public.content_review_audit_id_seq TO t0_readonly;


--
-- Name: TABLE curriculum_versions; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.curriculum_versions TO t0_readonly;


--
-- Name: TABLE decay_job_runs; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.decay_job_runs TO t0_readonly;


--
-- Name: TABLE document_chunks; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.document_chunks TO t0_readonly;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.documents TO t0_readonly;


--
-- Name: TABLE exam_papers; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.exam_papers TO t0_readonly;


--
-- Name: TABLE exam_series; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.exam_series TO t0_readonly;


--
-- Name: TABLE experiments; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.experiments TO t0_readonly;


--
-- Name: TABLE flashcard_ratings; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.flashcard_ratings TO t0_readonly;


--
-- Name: TABLE flyway_schema_history; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.flyway_schema_history TO t0_readonly;


--
-- Name: TABLE glm_ocr_bridge_records; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.glm_ocr_bridge_records TO t0_readonly;


--
-- Name: TABLE human_marks; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.human_marks TO t0_readonly;


--
-- Name: TABLE intervention_run; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.intervention_run TO t0_readonly;


--
-- Name: TABLE intervention_run_evidence; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.intervention_run_evidence TO t0_readonly;


--
-- Name: TABLE intervention_run_step; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.intervention_run_step TO t0_readonly;


--
-- Name: TABLE knowledge_edges; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.knowledge_edges TO t0_readonly;


--
-- Name: TABLE knowledge_nodes; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.knowledge_nodes TO t0_readonly;


--
-- Name: TABLE learner_course_enrolments; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.learner_course_enrolments TO t0_readonly;


--
-- Name: TABLE learner_self_marks; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.learner_self_marks TO t0_readonly;


--
-- Name: TABLE mark_points; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.mark_points TO t0_readonly;


--
-- Name: TABLE mark_schemes; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.mark_schemes TO t0_readonly;


--
-- Name: TABLE misconception_states; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.misconception_states TO t0_readonly;


--
-- Name: TABLE model_versions; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.model_versions TO t0_readonly;


--
-- Name: TABLE note_votes; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.note_votes TO t0_readonly;


--
-- Name: TABLE prompt_versions; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.prompt_versions TO t0_readonly;


--
-- Name: TABLE question_asset; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.question_asset TO t0_readonly;


--
-- Name: TABLE question_options; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.question_options TO t0_readonly;


--
-- Name: TABLE question_parts; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.question_parts TO t0_readonly;


--
-- Name: TABLE question_spec_points; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.question_spec_points TO t0_readonly;


--
-- Name: TABLE question_topics; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.question_topics TO t0_readonly;


--
-- Name: TABLE question_versions; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.question_versions TO t0_readonly;


--
-- Name: TABLE questions; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.questions TO t0_readonly;


--
-- Name: TABLE review_schedules; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.review_schedules TO t0_readonly;


--
-- Name: TABLE revision_note; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.revision_note TO t0_readonly;


--
-- Name: TABLE revision_note_asset; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.revision_note_asset TO t0_readonly;


--
-- Name: TABLE revision_note_viewed; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.revision_note_viewed TO t0_readonly;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.roles TO t0_readonly;


--
-- Name: TABLE skill_states; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.skill_states TO t0_readonly;


--
-- Name: TABLE smart_mark_agreement_evaluations; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.smart_mark_agreement_evaluations TO t0_readonly;


--
-- Name: TABLE smart_mark_results; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.smart_mark_results TO t0_readonly;


--
-- Name: TABLE struggle_inferences; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.struggle_inferences TO t0_readonly;


--
-- Name: TABLE subjects; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.subjects TO t0_readonly;


--
-- Name: TABLE teacher_validation_events; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.teacher_validation_events TO t0_readonly;


--
-- Name: SEQUENCE teacher_validation_events_id_seq; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON SEQUENCE public.teacher_validation_events_id_seq TO t0_readonly;


--
-- Name: TABLE teaching_coverage; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.teaching_coverage TO t0_readonly;


--
-- Name: TABLE teaching_coverage_events; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.teaching_coverage_events TO t0_readonly;


--
-- Name: TABLE telemetry_events; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.telemetry_events TO t0_readonly;


--
-- Name: TABLE tutor_session_turns; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.tutor_session_turns TO t0_readonly;


--
-- Name: TABLE tutor_sessions; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.tutor_sessions TO t0_readonly;


--
-- Name: TABLE tutor_topic_engagements; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.tutor_topic_engagements TO t0_readonly;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.user_roles TO t0_readonly;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_roles TO syllabai_v2_app_w2r2;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: neondb_owner
--

GRANT SELECT ON TABLE public.users TO t0_readonly;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO syllabai_v2_app_w2r2;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: neondb_owner
--

ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON TABLES TO t0_readonly;


--
-- PostgreSQL database dump complete
--

