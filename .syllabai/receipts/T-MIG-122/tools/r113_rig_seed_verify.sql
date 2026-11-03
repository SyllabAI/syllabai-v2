-- T-MIG-113 verify-substrate seed: the Flyway DATA seeds the drizzle push does
-- not carry (the 107 "seed rows dumped from the capture boot" law) + the rig
-- structured question (identical literal uuids both sides).
INSERT INTO roles (name, description) VALUES
    ('STUDENT','Learner account — self-registered'),
    ('TEACHER','Teacher account — provisioned by an admin'),
    ('ADMIN','Administrator — full control')
ON CONFLICT DO NOTHING;

INSERT INTO questions (id, external_ref, question_type, stem, marks, difficulty,
                       expected_time_seconds, command_word, primary_topic_node_id,
                       provenance, created_at) VALUES
    ('45000000-0000-0000-0000-000000000001', 'T113-RIG-STRUCTURED-001', 'STRUCTURED',
     'Rig: describe the reaction and explain the energy change.',
     3, 3, 120, 'Explain', '20000000-0000-0000-0000-000000000012', 'SEED_DEMO', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO question_versions (id, question_id, version, stem, marks, difficulty,
                               expected_time_seconds, command_word, validation_state,
                               extraction_method, created_at) VALUES
    ('45100000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 1,
     'Rig: describe the reaction and explain the energy change.', 3, 3, 120, 'Explain',
     'VALIDATED', 't113-rig-seed', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO question_parts (id, question_version_id, label, prompt, command_word, marks, ordering, created_at) VALUES
    ('45200000-0000-0000-0000-000000000001', '45100000-0000-0000-0000-000000000001', '(a)',
     'Rig part (a): describe the reaction.', 'Describe', 2, 0, now()),
    ('45200000-0000-0000-0000-000000000002', '45100000-0000-0000-0000-000000000001', '(b)',
     'Rig part (b): explain the energy change.', 'Explain', 1, 1, now())
ON CONFLICT (id) DO NOTHING;

-- the fixed-uuid HARNESS USERS (T-MIG-122 re-derivation disclosure): the auth
-- middleware is FAIL-CLOSED on users.findById (R1/R2) and attempts FKs
-- learner_id -> users — the harness identities must EXIST with token_version
-- matching the driver's JWT ver claim (1) and enabled=true. The of-record
-- substrate carried them ("the fixed-uuid harness users" — the run receipts);
-- the insert was session-inline, now pinned here. password_hash is never
-- verified on this path (JWT-only identity).
INSERT INTO users (id, email, password_hash, display_name, enabled, created_at, token_version) VALUES
    ('11710000-0000-4000-8000-000000000001', 't116-teacher@verify.local',
     '$2a$10$rigseedrigseedrigseedrigseedrigseedrigseedrigseedrigse', 'T116 Verify Teacher', true, now(), 1),
    ('11720000-0000-4000-8000-000000000001', 't116-student@verify.local',
     '$2a$10$rigseedrigseedrigseedrigseedrigseedrigseedrigseedrigse', 'T116 Verify Student', true, now(), 1)
ON CONFLICT (id) DO NOTHING;
