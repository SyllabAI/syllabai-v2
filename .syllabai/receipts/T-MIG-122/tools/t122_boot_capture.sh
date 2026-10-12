#!/bin/bash
# t122_boot_capture.sh — T-MIG-122 (B1-DEFECT-1 fix band): boot the frozen
# core 6cad6ef (re-cloned, jar rebuilt from the m2 cache) on the fresh
# syllabai_capture db, then re-derive the t-mig-116 capture corpus (the
# wiped fixtures of record re-captured — disclosed in the T-MIG-122 card).
# ZERO-KEY law: no LLM creds in env; SYLLABAI_LLM_MODE=test. Synthetic
# secrets, local-only. The join code matches the t116_capture.py of record.
set -u
export JAVA_HOME=/home/z/my-project/rig/jdk25/usr/lib/jvm/java-25-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
export SYLLABAI_DATABASE_URL="jdbc:postgresql://127.0.0.1:5544/syllabai_capture"
export SYLLABAI_DATABASE_USERNAME=postgres
export SYLLABAI_DATABASE_PASSWORD=postgres
export SYLLABAI_JWT_SECRET="t116-rig-0f5c9e2a7b1d4e6f8a3c5b7d9e1f2a4b6c8d0e2f4a6b8c0d2e4f6a8b1c3d5e7f"
export SYLLABAI_TEACHER_JOIN_CODE="rig-join-b124"
export SYLLABAI_LLM_MODE=test
export SERVER_PORT=8090
cd /home/z/my-project/repos/syllabai-core

# fresh capture substrate per run (the 107 fresh-substrate law) — the drop is
# DONE BEFORE the core boots and VERIFIED (the run-3 lesson: a stale core
# connection silently defeats DROP and every later leg rides the dirty db;
# port 8090 must be FREE or the health check answers the WRONG core)
export PGBIN=/home/z/my-project/rig/pg/usr/lib/postgresql/17/bin
export LD_LIBRARY_PATH=/home/z/my-project/rig/pg/usr/lib/x86_64-linux-gnu:/home/z/my-project/rig/pg/usr/lib/postgresql/17/lib
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='syllabai_capture';" >/dev/null 2>&1
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -c "DROP DATABASE IF EXISTS syllabai_capture;" 2>&1 | tail -1
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -c "CREATE DATABASE syllabai_capture;" 2>&1 | tail -1
$PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d syllabai_capture -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1 | tail -1
ROWS=$($PGBIN/psql -h 127.0.0.1 -p 5544 -U postgres -d syllabai_capture -At -c "select count(*) from question_versions;" 2>/dev/null || echo "0")
if [ "$ROWS" = "0" ]; then
  echo "substrate: FRESH (drop verified, zero rows / pre-flyway)"
else
  echo "SUBSTRATE NOT FRESH — aborting (the dirty-db law)"; exit 2
fi
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:8090/actuator/health; then
  echo "PORT 8090 ALREADY ANSWERING — a stale core holds it — aborting"; exit 2
fi

java -jar target/syllabai-core-0.1.0-SNAPSHOT.jar > /home/z/my-project/rig/core-boot-t122.log 2>&1 &
CORE_PID=$!
trap "kill $CORE_PID 2>/dev/null; wait $CORE_PID 2>/dev/null" EXIT

echo "core booting (pid $CORE_PID)..."
UP=0
for i in $(seq 1 60); do
  sleep 3
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/actuator/health 2>/dev/null)
  if [ "$CODE" = "200" ]; then UP=1; echo "core UP after ~$((i*3))s (health=200)"; break; fi
done
if [ "$UP" != "1" ]; then echo "CORE FAILED TO COME UP"; tail -25 /home/z/my-project/rig/core-boot-t122.log; exit 1; fi

echo "== ZERO-KEY assertion =="
env | grep -iE "GROQ|GEMINI|OPENROUTER" && { echo "LLM CREDENTIAL PRESENT — ZERO-KEY LAW VIOLATION"; exit 4; } || echo "clean (exit-4 gate passed)"

echo "== re-derive the capture corpus =="
python3 /home/z/my-project/scripts/t116_capture.py
RC=$?
echo "capture rc=$RC"
exit $RC
