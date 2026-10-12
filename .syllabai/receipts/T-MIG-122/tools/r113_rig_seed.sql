-- T-MIG-113 local capture substrate seed (the fake-uuid law, role-labelled fakes).
-- Mirrors the T-MIG-033 prod-seed convention ("SQL-set by the seed") but on the
-- LOCAL capture DB only — prod Neon untouched (the 107 write-surface law).
-- Minimal deterministic structured question: version VALIDATED, parts (a) marks=2
-- and (b) marks=1 — the part-bound 409 law exercises marks 3 against bound 0-2.
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
