/**
 * T-HUB-INK-BRK run-003 — the ink-wedge heal script (operator lane).
 *
 * Live incident (2026-11-13): the probe learner's 4CH1/1C drawing row
 * started returning 500 on BOTH GET and PUT /api/v1/learner/pdf-drawings
 * after a two-session interleaved-write stress test. The PR #977 self-heal
 * (safeServed) does NOT cover it — healthy rows serve 200 on the same
 * build while this row 500s, which places the failure BEFORE the served-
 * schema parse (most plausibly a storage-level failure reading the row —
 * the SELECT itself may throw, e.g. corrupt TOAST data). No application
 * code can heal that; the row must be deleted so the pair resets to the
 * honest-empty posture (the client re-seeds on the next write).
 *
 * This script is the LANE OF RECORD for that heal: it CAPTURES the row's
 * contents first (for the receipts — the poison fingerprint), then
 * DELETES it under an exact three-key guard (learner_id + document_ref_
 * type + source_url — never a bare-id delete), then postverifies the
 * count. Every step prints an operator-readable line; the guard is
 * parametrized (no string interpolation into SQL).
 *
 * INVARIANTS: exactly one target row expected; the delete returns the
 * deleted ids (0 → the wedge self-resolved, nothing to do); the script
 * NEVER deletes anything outside the guard.
 */
import postgres from "postgres";

const url = process.env.T138_PROD_DATABASE_URL;
const learnerId = process.env.HEAL_LEARNER_ID;
const sourceUrl = process.env.HEAL_SOURCE_URL;

if (!url || !learnerId || !sourceUrl) {
  console.error("ABORT: T138_PROD_DATABASE_URL / HEAL_LEARNER_ID / HEAL_SOURCE_URL are all required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, ssl: "require" });

try {
  console.log(`HEAL target learner=${learnerId} sourceUrl=${sourceUrl.slice(0, 80)}...`);

  // 1) CAPTURE — full row fingerprint (doc head + md5 + size). If the
  // storage-level failure poisons even this read, fall back to the
  // light SELECT (no doc column) — if THAT throws too, the whole-row
  // storage is corrupt and the capture is honestly impossible.
  let captured: Array<Record<string, unknown>> = [];
  let captureMode: "full" | "light" | "none" = "none";
  try {
    captured = await sql`
      select id, revision, updated_at,
             octet_length(doc::text) as doc_bytes,
             left(doc::text, 600)    as doc_head,
             md5(doc::text)          as doc_md5
      from learner_pdf_drawings
      where learner_id = ${learnerId}
        and document_ref_type = 'paper_asset'
        and source_url = ${sourceUrl}
    `;
    captureMode = "full";
  } catch (eFull) {
    console.log(`CAPTURE full read FAILED (${String(eFull).slice(0, 200)}) — retrying light (no doc column)`);
    try {
      captured = await sql`
        select id, revision, updated_at
        from learner_pdf_drawings
        where learner_id = ${learnerId}
          and document_ref_type = 'paper_asset'
          and source_url = ${sourceUrl}
      `;
      captureMode = "light";
    } catch (eLight) {
      console.log(`CAPTURE light read ALSO FAILED (${String(eLight).slice(0, 200)}) — proceeding on the delete-by-keys path (the storage failure is confirmed row-level)`);
    }
  }
  console.log(`CAPTURE mode=${captureMode} rows=${captured.length}`);
  for (const r of captured) console.log("CAPTURED ROW:", JSON.stringify(r));

  // 2) DELETE under the exact three-key guard.
  const del = await sql`
    delete from learner_pdf_drawings
    where learner_id = ${learnerId}
      and document_ref_type = 'paper_asset'
      and source_url = ${sourceUrl}
    returning id
  `;
  console.log(`DELETED ${del.length} row(s)${del.length ? " id=" + String(del[0]!.id) : ""}`);

  // 3) POSTVERIFY — the pair must now read clean.
  const after = await sql`
    select count(*)::int as n
    from learner_pdf_drawings
    where learner_id = ${learnerId}
      and document_ref_type = 'paper_asset'
      and source_url = ${sourceUrl}
  `;
  console.log(`POSTVERIFY remaining=${after[0]!.n} (expect 0)`);
  if (after[0]!.n !== 0) {
    console.error("POSTVERIFY FAILED — rows remain; DO NOT treat this run as healed");
    await sql.end();
    process.exit(2);
  }
  console.log("HEAL COMPLETE — the pair is reset; the client re-seeds honest-empty on the next write");
  await sql.end();
} catch (e) {
  console.error("HEAL FAILED:", String(e).slice(0, 400));
  try { await sql.end(); } catch { /* already closed */ }
  process.exit(1);
}
