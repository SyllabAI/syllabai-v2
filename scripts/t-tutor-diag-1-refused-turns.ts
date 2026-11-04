/**
 * T-TUTOR-DIAG-1 run-001 — read-only refused-turns probe (SELECT ONLY).
 *
 * Trigger: a live operator report — "difference between evaporation and
 * boiling" was refused ("the supplied sources do not contain any
 * information about…") while the same topic serves ev=6 evidence rows on
 * the verify learner across providers and phrasings. The differential
 * lives in tutor_session_turns, which persists every ask with
 * evidence_count / refused / answer_model / answer_provider, joined to
 * tutor_sessions for learner + course_ref.
 *
 * Posture (the t097 read-only doctrine, re-applied):
 *   - SELECT ONLY. Zero DDL, zero INSERT/UPDATE/DELETE, no Neon COW.
 *   - Credentials never printed and never receipted: only the endpoint host.
 *   - Turn/question/answer text is receipted at a 200-char head, learner
 *     identity as the UUID only — never an email or a full transcript.
 *   - A receipt JSON is ALWAYS written (even on failure) — honest red.
 *   - Any query failure reds the receipt and exits 1 (diagnostic red, the
 *     workflow's later steps still run and upload the receipt).
 *
 * run-002 adds Q5 — the FULL turn sequence (session_id, seq, role, text
 * head, ev/refused/provider) of every session the reporting learner
 * (b8f8afb5) opened in the last 3 days: settles whether the 15:30 refused
 * ask ran mid-conversation (retrieval-query history blending) or cold.
 *
 * CLI:
 *   bun scripts/t-tutor-diag-1-refused-turns.ts --db file:/tmp/uri.file \
 *     --receipt receipt.json        (or DATABASE_URL env instead of --db)
 */

import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

// ── CLI ──────────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
        const i = process.argv.indexOf(`--${name}`);
        if (i === -1 || i + 1 >= process.argv.length) return undefined;
        return process.argv[i + 1]!;
}

const dbArg = arg("db");
const receiptPath = arg("receipt") ?? "reports/refused-turns-receipt.json";

let uri = dbArg?.startsWith("file:")
        ? readFileSync(dbArg.slice(5), "utf8").trim()
        : (dbArg ?? process.env.DATABASE_URL ?? "");
uri = uri.trim();
if (uri.length === 0) {
        console.error("no database URI: pass --db file:/path or set DATABASE_URL");
        process.exit(2);
}
if (!uri.includes("sslmode=")) uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
const uriHost = new URL(uri).host; // host is safe to record; credentials are not

const receipt: Record<string, unknown> = {
        card: "T-TUTOR-DIAG-1",
        driver: "scripts/t-tutor-diag-1-refused-turns.ts",
        mode: "read-only-probe",
        db_host: uriHost,
        started_at: new Date().toISOString(),
        ok: false,
};

const sql = postgres(uri, {
        prepare: false,
        max: 2,
        idle_timeout: 5,
        connect_timeout: 10,
});

try {
        // 1 — every evaporation/boiling ask in the last 14 days, with the
        //     paired assistant turn (refused / evidence / model / provider).
        receipt.q1_evaporation_boiling = await sql`
                SELECT t.created_at                      AS asked_at,
                       s.learner_id,
                       s.course_ref,
                       left(t.content, 200)              AS question_head,
                       a.refused,
                       a.evidence_count,
                       COALESCE(a.answer_model, '(null)')  AS answer_model,
                       COALESCE(a.answer_provider, '(null)') AS answer_provider,
                       a.latency_ms,
                       left(a.content, 200)              AS answer_head
                FROM tutor_session_turns t
                JOIN tutor_sessions s ON s.id = t.session_id
                JOIN tutor_session_turns a
                     ON a.session_id = t.session_id AND a.seq = t.seq + 1 AND a.role = 'assistant'
                WHERE t.role = 'user'
                  AND t.created_at >= now() - interval '14 days'
                  AND (t.content ILIKE '%evaporat%' OR t.content ILIKE '%boiling%')
                ORDER BY t.created_at DESC
                LIMIT 20`;

        // 2 — every refused assistant turn in the last 7 days (any learner),
        //     with its question — the provider/ev clustering view.
        receipt.q2_recent_refused = await sql`
                SELECT a.created_at                      AS refused_at,
                       s.learner_id,
                       s.course_ref,
                       left(u.content, 200)              AS question_head,
                       a.evidence_count,
                       COALESCE(a.answer_model, '(null)')  AS answer_model,
                       COALESCE(a.answer_provider, '(null)') AS answer_provider,
                       a.latency_ms
                FROM tutor_session_turns a
                JOIN tutor_sessions s ON s.id = a.session_id
                JOIN tutor_session_turns u
                     ON u.session_id = a.session_id AND u.seq = a.seq - 1 AND u.role = 'user'
                WHERE a.role = 'assistant' AND a.refused = true
                  AND a.created_at >= now() - interval '7 days'
                ORDER BY a.created_at DESC
                LIMIT 25`;

        // 3 — per-provider ask + refusal stats over 7 days: does the refusal
        //     cluster on a pool member (stochasticity) or a learner (context)?
        receipt.q3_provider_stats = await sql`
                SELECT COALESCE(a.answer_provider, '(null)') AS provider,
                       COALESCE(a.answer_model, '(null)')  AS model,
                       count(*)                             AS asks,
                       count(*) FILTER (WHERE a.refused)    AS refused,
                       round(avg(a.evidence_count)::numeric, 2) AS avg_ev,
                       min(a.evidence_count)                AS min_ev
                FROM tutor_session_turns a
                WHERE a.role = 'assistant'
                  AND a.created_at >= now() - interval '7 days'
                GROUP BY 1, 2
                ORDER BY asks DESC
                LIMIT 20`;

        // 4 — the last 24h ask traffic (any content) so the operator's ask is
        //     found even when the phrasing matches neither keyword.
        receipt.q4_last_24h = await sql`
                SELECT t.created_at                      AS asked_at,
                       s.learner_id,
                       s.course_ref,
                       left(t.content, 160)              AS question_head,
                       a.refused,
                       a.evidence_count,
                       COALESCE(a.answer_provider, '(null)') AS answer_provider
                FROM tutor_session_turns t
                JOIN tutor_sessions s ON s.id = t.session_id
                JOIN tutor_session_turns a
                     ON a.session_id = t.session_id AND a.seq = t.seq + 1 AND a.role = 'assistant'
                WHERE t.role = 'user'
                  AND t.created_at >= now() - interval '24 hours'
                ORDER BY t.created_at DESC
                LIMIT 30`;

        // 5 (run-002) — the reporting learner's FULL session shape: every
        //     turn of every session they opened in the last 3 days. Reveals
        //     whether the refused ask was mid-conversation (prior turns
        //     blend into the retrieval query) or a cold single-turn ask.
        receipt.q5_learner_sessions = await sql`
                SELECT s.id                              AS session_id,
                       s.created_at                      AS session_started,
                       s.course_ref,
                       t.seq,
                       t.role,
                       t.created_at                      AS turn_at,
                       left(t.content, 160)              AS text_head,
                       t.evidence_count,
                       t.refused,
                       COALESCE(t.answer_model, '(null)')    AS answer_model,
                       COALESCE(t.answer_provider, '(null)') AS answer_provider
                FROM tutor_sessions s
                JOIN tutor_session_turns t ON t.session_id = s.id
                WHERE s.learner_id::text LIKE 'b8f8afb5%'
                  AND s.last_active_at >= now() - interval '3 days'
                ORDER BY s.created_at, t.seq
                LIMIT 80`;

        const counts = {
                q1: (receipt.q1_evaporation_boiling as unknown[]).length,
                q2: (receipt.q2_recent_refused as unknown[]).length,
                q3: (receipt.q3_provider_stats as unknown[]).length,
                q4: (receipt.q4_last_24h as unknown[]).length,
                q5: (receipt.q5_learner_sessions as unknown[]).length,
        };
        receipt.row_counts = counts;
        receipt.ok = true;
        console.log("probe ok:", JSON.stringify(counts));
} catch (err) {
        receipt.error = String(err).slice(0, 500);
        console.error("probe FAILED:", receipt.error);
} finally {
        receipt.finished_at = new Date().toISOString();
        writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
        console.log(`receipt written: ${receiptPath} (host: ${uriHost}, ok: ${receipt.ok})`);
        await sql.end({ timeout: 5 });
        if (receipt.ok !== true) process.exit(1);
}
