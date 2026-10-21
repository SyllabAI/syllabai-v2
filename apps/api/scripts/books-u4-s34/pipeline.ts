/**
 * T-BOOK-020 — the u4 S3/S4 pipeline, the T-BOOK-013 unblock_path step 2 of
 * record, armed as a tracked script (operator order trace 1a15fb8ebb2ebbe1
 * item (1): "Implement the amendment—then a single command can run the
 * verified u4 S3/S4 script set"). The F-BOOK-0001 release gate was
 * discharged by the LICENSE-DATA.md Student-Book amendment of record
 * (syllabai-resources e832e617, PR #28) — the flip levers stay
 * operator-held: NOTHING here writes without --commit on run.ts.
 *
 * Adapted VERBATIM in structure from the proven Phase B vehicle
 * (apps/api/scripts/session/pipeline-u23-r1.ts — COW-waiver class: zero DDL,
 * 0005 of record, every write its own guarded tx with pre/post re-prove).
 * Phases (each idempotent, each its own guarded tx):
 *   prechecks     — read-only: parent book VALIDATED, u4 chapters 8x SUGGESTED,
 *                   book_blocks u4:* = 0 (negative control), bank 8/8, and the
 *                   repo-side authored census (46 blocks in c22-c29 packs)
 *   flip-chapters — book_chapters u4:c22..c29 SUGGESTED->VALIDATED (NO
 *                   updated_at column in book_chapters — the schema of record)
 *   flip-packs    — book_blocks c22-c29 SUGGESTED->VALIDATED, version +1
 *   serve-proof   — the railBlocksForChapter double-gate emulation: u1/u2/u3
 *                   of-record counts must be UNCHANGED; u4 per-chapter served
 *                   count must equal its chapter state (null while SUGGESTED,
 *                   the EXPECT count once VALIDATED)
 *
 * Usage: DATABASE_URL=postgres://... bun apps/api/scripts/books-u4-s34/pipeline.ts <phase> [--repo-root <path>]
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "@neondatabase/serverless";

const phase = process.argv[2];
const repoRootIdx = process.argv.indexOf("--repo-root");
const REPO = repoRootIdx >= 0 ? process.argv[repoRootIdx + 1] : process.cwd();
if (phase == null) {
  console.error("usage: pipeline.ts <prechecks|flip-chapters|flip-packs|serve-proof> [--repo-root <path>]");
  process.exit(1);
}
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const U4 = ["u4:c22", "u4:c23", "u4:c24", "u4:c25", "u4:c26", "u4:c27", "u4:c28", "u4:c29"];
const DOC = "e6c0db50-0f84-55de-b50c-e4d49285cd6d";
// the authored census of record (T-BOOK-013 receipt + books/4ch1/packs repo truth, re-verified 2026-10-22)
const EXPECT: Record<string, number> = { "u4:c22": 6, "u4:c23": 8, "u4:c24": 5, "u4:c25": 5, "u4:c26": 6, "u4:c27": 5, "u4:c28": 5, "u4:c29": 6 };
const U1_SERVE: Record<string, number> = { "u1:c1": 7, "u1:c2": 6, "u1:c3": 6, "u1:c4": 5, "u1:c5": 6, "u1:c6": 7, "u1:c7": 6, "u1:c8": 6, "u1:c9": 4, "u1:c10": 7 };
const U2_SERVE: Record<string, number> = { "u2:c11": 6, "u2:c12": 6, "u2:c13": 7, "u2:c14": 7, "u2:c15": 6, "u2:c16": 7, "u2:c17": 6, "u2:c18": 7 };
const U3_SERVE: Record<string, number> = { "u3:c19": 6, "u3:c20": 7, "u3:c21": 6 };
const BANK = [
  "sme-eq-4-1-introduction-q2", "sme-eq-4-2-crude-oil-q4", "sme-eq-4-3-alkanes-q8", "sme-eq-4-4-alkenes-q9",
  "sme-eq-4-5-alcohols-q2", "sme-eq-4-6-carboxylic-acids-q7", "sme-eq-4-7-esters-q7", "sme-eq-4-8-synthetic-polymers-q5",
];

const die = async (msg: string) => { console.error(`FAIL: ${msg}`); await c.end(); process.exit(1); };

if (phase === "prechecks") {
  // repo-side authored census (before any DB probe — authoring drift fails fast)
  let authoredTotal = 0;
  for (const ck of U4) {
    const slug = ck.split(":")[1];
    const dir = join(REPO, "books", "4ch1", "packs");
    const packDir = readdirSync(dir).find((n) => n.startsWith(`${slug}-`));
    if (packDir == null) await die(`authored census: no pack dir for ${slug}`);
    const blocksDir = join(dir, packDir, "blocks");
    const n = readdirSync(blocksDir).filter((f) => f.endsWith(".json")).length;
    if (n !== EXPECT[ck]) await die(`authored census: ${ck} has ${n} blocks, want ${EXPECT[ck]}`);
    authoredTotal += n;
  }
  if (authoredTotal !== 46) await die(`authored census total ${authoredTotal} != 46`);
  console.log("precheck 0: authored census 46/46 blocks across c22-c29 packs (repo truth)");

  const book = await c.query(`select validation_state from documents where document_id = $1 and doc_version = 1`, [DOC]);
  if (book.rows[0]?.validation_state !== "VALIDATED") await die(`parent book state ${book.rows[0]?.validation_state}`);
  console.log("precheck 1: parent book VALIDATED");
  const ch = await c.query(
    `select chapter_key, validation_state from book_chapters where document_id = $1 and doc_version = 1 and chapter_key = any($2) order by chapter_key`,
    [DOC, U4],
  );
  const bad = ch.rows.filter((r) => r.validation_state !== "SUGGESTED");
  if (ch.rowCount !== 8 || bad.length > 0) await die(`chapters not 8x SUGGESTED: ${JSON.stringify(bad)}`);
  console.log("precheck 2: chapters u4:c22..c29 all SUGGESTED (8/8)");
  const blocks = await c.query(
    `select count(*)::int as n from book_blocks where document_id = $1 and doc_version = 1 and chapter_key = any($2)`,
    [DOC, U4],
  );
  if (Number(blocks.rows[0].n) !== 0) await die(`negative control failed: ${blocks.rows[0].n} blocks already present for c22-c29`);
  console.log("precheck 3: book_blocks for c22-c29 = 0 (negative control)");
  const bank = await c.query(
    `select count(distinct external_ref)::int as n from questions
     where external_ref = any($1) and active and question_type = 'MCQ_SINGLE'`,
    [BANK],
  );
  if (Number(bank.rows[0].n) !== 8) await die(`bank resolution ${bank.rows[0].n}/8`);
  console.log("precheck 4: bank 8/8 ACTIVE MCQ_SINGLE");
  console.log("PRECHECKS GREEN");
  await c.end();
  process.exit(0);
}

else if (phase === "flip-chapters") {
  try {
    await c.query("begin");
    const pre = await c.query(
      `select validation_state, count(*)::int as n from book_chapters where document_id = $1 and doc_version = 1 and chapter_key = any($2) group by 1`,
      [DOC, U4],
    );
    console.log(`pre: ${JSON.stringify(Object.fromEntries(pre.rows.map((r) => [r.validation_state, r.n])))}`);
    if (pre.rows.length !== 1 || pre.rows[0].validation_state !== "SUGGESTED" || Number(pre.rows[0].n) !== 8) {
      throw new Error("pre-state is not 8x SUGGESTED (idempotent no-op or drift)");
    }
    const upd = await c.query(
      `update book_chapters set validation_state = 'VALIDATED'
       where document_id = $1 and doc_version = 1 and chapter_key = any($2) and validation_state = 'SUGGESTED'`,
      [DOC, U4],
    );
    if ((upd.rowCount ?? 0) !== 8) throw new Error(`rowcount ${upd.rowCount} != 8`);
    const post = await c.query(
      `select validation_state, count(*)::int as n from book_chapters where document_id = $1 and doc_version = 1 and chapter_key = any($2) group by 1`,
      [DOC, U4],
    );
    console.log(`post: ${JSON.stringify(Object.fromEntries(post.rows.map((r) => [r.validation_state, r.n])))}`);
    await c.query("commit");
    console.log("COMMIT: chapter flip u4:c22..c29 SUGGESTED->VALIDATED (8/8, one tx)");
    await c.end();
    process.exit(0);
  } catch (e) {
    await c.query("rollback");
    await die(e instanceof Error ? e.message : String(e));
  }
}

else if (phase === "flip-packs") {
  try {
    await c.query("begin");
    const pre = await c.query(
      `select validation_state, count(*)::int as n, min(version)::int as min_v, max(version)::int as max_v
       from book_blocks where document_id = $1 and doc_version = 1 and chapter_key = any($2) group by 1`,
      [DOC, U4],
    );
    console.log(`pre: ${JSON.stringify(pre.rows)}`);
    const preRow = pre.rows.find((r) => r.validation_state === "SUGGESTED");
    if (!preRow || Number(preRow.n) !== 46) throw new Error("pre-state is not 46x SUGGESTED (run the ingest first / drift)");
    const negative = await c.query(
      `select count(*)::int as n from book_blocks where document_id = $1 and doc_version = 1 and chapter_key = any($2) and validation_state = 'VALIDATED'`,
      [DOC, U4],
    );
    if (Number(negative.rows[0].n) !== 0) throw new Error("negative control: VALIDATED rows already present pre-flip");
    const upd = await c.query(
      `update book_blocks set validation_state = 'VALIDATED', version = version + 1, updated_at = now()
       where document_id = $1 and doc_version = 1 and chapter_key = any($2) and validation_state = 'SUGGESTED'`,
      [DOC, U4],
    );
    if ((upd.rowCount ?? 0) !== 46) throw new Error(`rowcount ${upd.rowCount} != 46`);
    const post = await c.query(
      `select validation_state, count(*)::int as n, min(version)::int as min_v, max(version)::int as max_v
       from book_blocks where document_id = $1 and doc_version = 1 and chapter_key = any($2) group by 1`,
      [DOC, U4],
    );
    console.log(`post: ${JSON.stringify(post.rows)}`);
    await c.query("commit");
    console.log("COMMIT: pack flip x46 SUGGESTED->VALIDATED version 1->2 (one tx)");
    await c.end();
    process.exit(0);
  } catch (e) {
    await c.query("rollback");
    await die(e instanceof Error ? e.message : String(e));
  }
}

else if (phase === "serve-proof") {
  // the railBlocksForChapter shape: null (chapter not VALIDATED -> 133c viewer),
  // [] (validated, no blocks), N (validated with N VALIDATED blocks)
  const chaps = await c.query(
    `select chapter_key, validation_state from book_chapters where document_id = $1 and doc_version = 1`,
    [DOC],
  );
  const stateBy = new Map(chaps.rows.map((r) => [r.chapter_key, r.validation_state]));
  const counts = await c.query(
    `select chapter_key, count(*)::int as n from book_blocks
     where document_id = $1 and doc_version = 1 and validation_state = 'VALIDATED' group by 1`,
    [DOC],
  );
  const nBy = new Map(counts.rows.map((r) => [r.chapter_key, Number(r.n)]));
  let fails = 0;
  const serve = (ck: string) => {
    if (stateBy.get(ck) !== "VALIDATED") return "null (133c viewer)";
    return String(nBy.get(ck) ?? 0);
  };
  console.log("== u1 (of record, must be unchanged) ==");
  for (const [ck, want] of Object.entries(U1_SERVE)) {
    const got = serve(ck);
    const ok = got === String(want);
    if (!ok) fails += 1;
    console.log(`  ${ck} -> ${got} ${ok ? "" : "FAIL want " + want}`);
  }
  console.log("== u2/u3 (of record, must be unchanged) ==");
  for (const [ck, want] of Object.entries({ ...U2_SERVE, ...U3_SERVE })) {
    const got = serve(ck);
    const ok = got === String(want);
    if (!ok) fails += 1;
    console.log(`  ${ck} -> ${got} ${ok ? "" : "FAIL want " + want}`);
  }
  console.log("== u4 (the Phase C chapters — null while SUGGESTED, the EXPECT count once VALIDATED) ==");
  for (const ck of U4) {
    const got = serve(ck);
    const want = stateBy.get(ck) === "VALIDATED" ? String(EXPECT[ck]) : "null (133c viewer)";
    const ok = got === want;
    if (!ok) fails += 1;
    console.log(`  ${ck} -> ${got} ${ok ? "" : "FAIL want " + want}`);
  }
  const gloss = await c.query(`select validation_state, count(*)::int as n from book_glossary_terms where subject_code = '4ch1' group by 1`);
  console.log(`  glossary: ${JSON.stringify(Object.fromEntries(gloss.rows.map((r) => [r.validation_state, r.n])))} (post-run expectation: 88 VALIDATED + the 24 u4 terms SUGGESTED pending their own r3 lane)`);
  await c.end();
  console.log(fails === 0 ? "SERVE PROOF GREEN" : `SERVE PROOF FAILURES: ${fails}`);
  process.exit(fails === 0 ? 0 : 1);
}

else {
  await die(`unknown phase ${phase}`);
}
