/**
 * T-TEACHGENIE-006 · scripts/t-teachgenie6-prove-update.ts
 *
 * The LIVE proof that the updateSession seam fix (apps/api/src/teach-me/
 * sql.ts) works against the REAL production tables — run from a workflow
 * against the production DB of record (SMOKE_DB_URI, the t-teachme-1-
 * vantage-probe smoke secret), BEFORE the API redeploy carries the fix.
 *
 * What it proves — the EXACT statements the API's write paths issue, through
 * the REAL store over the REAL Neon adapter (the same driver-dispatch branch
 * production uses):
 *   1. the flags-only patch (the sub-floor nudge write) round-trips
 *   2. the judged-turn counter patch (messageCount/llmCallCount/tokensUsed/
 *      flags) round-trips
 *   3. the end-session STATUS patch round-trips — exercised as a
 *      review_pending → active flip pair on the session of record (net-zero:
 *      the status law's exact UPDATE, fired and reverted; no LLM, no review
 *      generation, the session's status never leaves active at rest)
 *
 * The target session of record is the LIVE-pilot probe session (the
 * operator's own probe learner of record). Its flags receive the proof stamp
 * (disclosed residue); its status is net-zero by construction.
 *
 * Receipt: ALWAYS written, host-only scrub (no URIs/tokens/emails).
 *
 * CLI:
 *   bun scripts/t-teachgenie6-prove-update.ts --db "$SMOKE_DB_URI" \
 *     --session <uuid> --receipt proof-receipt.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createSql } from "../apps/api/src/services/identity/users";
import { createTeachMeStore } from "../apps/api/src/teach-me/sql";

function arg(name: string): string {
        const i = process.argv.indexOf(`--${name}`);
        if (i === -1 || i + 1 >= process.argv.length) {
                console.error(`missing --${name}`);
                process.exit(2);
        }
        return process.argv[i + 1]!;
}

const dbUrl = arg("db");
const sessionOfRecord = arg("session");
const receiptPath = arg("receipt");

const uriHost = new URL(dbUrl.trim()).host; // host is safe to record; credentials are not

const receipt: Record<string, unknown> = {
        card: "T-TEACHGENIE-006",
        driver: "scripts/t-teachgenie6-prove-update.ts",
        db_host: uriHost,
        session_of_record: sessionOfRecord,
        started_at: new Date().toISOString(),
        steps: [] as unknown[],
};
const writeReceipt = (ok: boolean) => {
        receipt.finished_at = new Date().toISOString();
        receipt.ok = ok;
        writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
};

const step = (name: string, detail: unknown) => {
        (receipt.steps as unknown[]).push({ name, detail });
        console.log(`step ${name}: ${JSON.stringify(detail).slice(0, 220)}`);
};

try {
        const sql = createSql(dbUrl.trim());
        const store = createTeachMeStore(sql);
        const stamp = new Date().toISOString();

        const before = await store.findSession(sessionOfRecord);
        if (!before) throw new Error("session of record not found");
        step("session of record found", {
                status: before.session.status,
                messageCount: before.session.messageCount,
                llmCallCount: before.session.llmCallCount,
        });

        // 1 — the flags-only patch (the sub-floor nudge write)
        const proofToken = `updateSession-proof-${stamp}`;
        await store.updateSession(sessionOfRecord, { flags: { updateSessionProof: proofToken } });
        const after1 = await store.findSession(sessionOfRecord);
        const ok1 = (after1?.session.flags as Record<string, unknown>).updateSessionProof === proofToken;
        step("flags-only patch", { ok: ok1, proofToken });
        if (!ok1) throw new Error("flags-only patch did not round-trip");

        // 2 — the judged-turn counter patch (the exact shape the judged turn issues)
        const mc = before.session.messageCount;
        const lc = before.session.llmCallCount;
        const tk = before.session.tokensUsed;
        await store.updateSession(sessionOfRecord, {
                messageCount: mc,
                llmCallCount: lc,
                tokensUsed: tk,
                flags: { updateSessionProof: proofToken, judgedTurnProbe: stamp },
        });
        const after2 = await store.findSession(sessionOfRecord);
        const ok2 =
                after2 != null &&
                after2.session.messageCount === mc &&
                after2.session.llmCallCount === lc &&
                after2.session.tokensUsed === tk &&
                (after2.session.flags as Record<string, unknown>).judgedTurnProbe === stamp;
        step("judged-turn counter patch", { ok: ok2 });
        if (!ok2) throw new Error("judged-turn counter patch did not round-trip");

        // 3 — the end-session STATUS patch, fired and reverted (net-zero)
        await store.updateSession(sessionOfRecord, { status: "review_pending", endedAt: stamp });
        const after3 = await store.findSession(sessionOfRecord);
        const ok3a = after3?.session.status === "review_pending";
        await store.updateSession(sessionOfRecord, { status: "active", endedAt: null });
        const after4 = await store.findSession(sessionOfRecord);
        const ok3b = after4?.session.status === "active" && after4.session.endedAt === null;
        step("end-session status patch + revert (net-zero)", { ok: ok3a && ok3b });
        if (!ok3a || !ok3b) throw new Error("the end-session status patch did not round-trip");

        receipt.ok = true;
        writeReceipt(true);
        console.log("T-TEACHGENIE-006 PROOF GREEN: updateSession round-trips on the production tables of record");
        // Exit hygiene (run-001 lesson): the Neon WebSocket client holds the event
        // loop open after the receipt — run-001 hung 5.4min until the server killed
        // the connection and surfaced an unhandled 'Connection terminated
        // unexpectedly' as a red job AFTER the green receipt. Explicit exit.
        process.exit(0);
} catch (err) {
        receipt.error = err instanceof Error ? err.message : String(err);
        console.error("T-TEACHGENIE-006 proof FAILED:", receipt.error);
        writeReceipt(false);
        process.exit(1);
}
