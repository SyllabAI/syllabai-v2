#!/usr/bin/env bash
# T-MIG-107 verify substrate: reset + drizzle push + V6/V7 seed + harness users.
set -euo pipefail
PGBIN=/home/z/build/toolchain/pg/usr/lib/postgresql/17/bin
export LD_LIBRARY_PATH=/home/z/build/toolchain/pg/usr/lib/x86_64-linux-gnu:/home/z/build/toolchain/pg/usr/lib/postgresql/17/lib
DB=syllabai_verify
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d $DB -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
cd /home/z/my-project/syllabai-v2/packages/db
DATABASE_URL="postgres://postgres@127.0.0.1:5544/$DB" bunx --bun drizzle-kit push --force >/dev/null 2>&1
echo "schema pushed"
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d $DB -q -f /home/z/build/seed-dump/v6v7-seed.sql >/dev/null
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d $DB -q -c "
insert into roles (name, description) values ('STUDENT','Learner'),('TEACHER','Teacher'),('ADMIN','Admin') on conflict (name) do nothing;
insert into users (id, email, password_hash, display_name, enabled, token_version, created_at) values
('10700000-0000-4000-8000-000000000001','t107-learner@verify.local','bcrypt-harness-no-login','T107 LEARNER',true,1,now()),
('10700000-0000-4000-8000-000000000002','t107-teacher@verify.local','bcrypt-harness-no-login','T107 TEACHER',true,1,now()),
('10700000-0000-4000-8000-000000000003','t107-admin@verify.local','bcrypt-harness-no-login','T107 ADMIN',true,1,now())
on conflict (id) do update set enabled=true, token_version=1;
insert into user_roles (user_id, role) values
('10700000-0000-4000-8000-000000000001','STUDENT'),
('10700000-0000-4000-8000-000000000002','TEACHER'),
('10700000-0000-4000-8000-000000000003','ADMIN') on conflict do nothing;"
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d $DB -tA -c "select 'substrate: '||(select count(*) from knowledge_nodes)||' nodes, '||(select count(*) from questions)||' questions, '||(select count(*) from users where email like 't107-%')||' users'"
