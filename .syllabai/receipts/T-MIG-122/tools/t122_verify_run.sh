#!/bin/bash
# t122_verify_run.sh — T-MIG-122: fresh syllabai_verify substrate -> drizzle
# push -> the 113-class verify seed -> the t116_verify.ts driver IN-PROCESS
# (the FIXED tree) -> 12/12 ALL-GREEN or fail. ZERO-KEY law.
set -u
REPO=/home/z/my-project/repos/syllabai-v2
export PGBIN=/home/z/my-project/rig/pg/usr/lib/postgresql/17/bin
export LD_LIBRARY_PATH=/home/z/my-project/rig/pg/usr/lib/x86_64-linux-gnu:/home/z/my-project/rig/pg/usr/lib/postgresql/17/lib

echo "== fresh verify substrate =="
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='syllabai_verify';" >/dev/null 2>&1
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -c "DROP DATABASE IF EXISTS syllabai_verify;" 2>&1 | tail -1
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -c "CREATE DATABASE syllabai_verify;" 2>&1 | tail -1
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d syllabai_verify -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1 | tail -1
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5544/syllabai_verify"
cd $REPO/packages/db
$REPO/node_modules/.bin/drizzle-kit push --force 2>&1 | tail -2
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d syllabai_verify -f /home/z/my-project/scripts/r113_rig_seed_verify.sql 2>&1 | tail -3

echo "== ZERO-KEY assertion =="
env | grep -iE "GROQ|GEMINI|OPENROUTER" && { echo "LLM CREDENTIAL PRESENT — ZERO-KEY LAW VIOLATION"; exit 4; } || echo "clean (exit-4 gate passed)"

echo "== the golden-verify driver (the FIXED tree, in-process :8927) =="
export SYLLABAI_JWT_SECRET="t116-verify-3c7e1a9d5b2f8e4a6c0d9b3f7a1e5c8d2b6f0a4e8c3d7b1f5a9e2c6d0b4f8a3e"
cd $REPO
bun /home/z/my-project/scripts/t116_verify.ts
RC=$?
echo "verify rc=$RC"
exit $RC
