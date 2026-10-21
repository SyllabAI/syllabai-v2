/**
 * T-BOOK-020 — THE SINGLE COMMAND: one operator order runs the verified
 * u4 S3/S4 script set (the T-BOOK-013 unblock_path, scripts proven at
 * golive-r0 + T-BOOK-016 + T-BOOK-011/012 and adapted verbatim in
 * pipeline.ts / spotcheck.ts here). Operator order trace 1a15fb8ebb2ebbe1
 * item (1); the F-BOOK-0001 gate was discharged by the LICENSE-DATA.md
 * Student-Book amendment of record (syllabai-resources e832e617, PR #28).
 *
 *   DRY/read-only arm proof (no DB writes, needs DATABASE_URL for prechecks):
 *     DATABASE_URL=postgres://... bun apps/api/scripts/books-u4-s34/run.ts --check
 *
 *   THE OPERATOR FIRE ORDER (one command, full S3/S4, stop-on-fail):
 *     DATABASE_URL=postgres://... bun apps/api/scripts/books-u4-s34/run.ts --commit
 *
 * --commit chain: prechecks → chapter flip u4:c22..c29 (guarded tx) →
 * SCOPED staging (only c22-c29 packs + FULL glossary incl. u4-organic-chemistry.yaml
 * + meta/book.yaml; manifest rebuilt from book_chapters DB truth; digest copied in)
 * → the ingest of record UNCHANGED (spawned byte-identical) → 20% spot-check →
 * pack flip x46 (guarded tx) → serve proof (u1..u4 full book).
 * Repo-side follow-ups after a successful run (printed, PR-borne): pack.yaml
 * status notes c22-c29; the 24 u4 glossary terms await their own r3 lane.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { Client } from "@neondatabase/serverless";

const commit = process.argv.includes("--commit");
const digestIdx = process.argv.indexOf("--digest");
const repoIdx = process.argv.indexOf("--repo-root");
const REPO = repoIdx >= 0 ? process.argv[repoIdx + 1] : process.cwd();
const DOC = "e6c0db50-0f84-55de-b50c-e4d49285cd6d";
const U4 = ["u4:c22", "u4:c23", "u4:c24", "u4:c25", "u4:c26", "u4:c27", "u4:c28", "u4:c29"];
const BOOKS = join(REPO, "books", "4ch1");

const die = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const run = (label: string, args: string[], needDb: boolean) => {
  console.log(`\n===== ${label} =====`);
  if (needDb && process.env.DATABASE_URL == null) die(`${label}: DATABASE_URL required`);
  const p = Bun.spawnSync(["bun", ...args], {
    cwd: REPO,
    env: process.env as Record<string, string>,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (p.exitCode !== 0) die(`${label} exited ${p.exitCode} — stop-on-fail`);
};

// the manifest of record, rebuilt from book_chapters DB truth (build-manifest-r1 logic, inline)
async function buildManifest(outPath: string) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const book = await c.query(`select document_id, doc_version from documents where kind = 'TEXTBOOK' order by document_id limit 1`);
  const doc = book.rows[0];
  const chapters = await c.query(
    `select chapter_key, pdf_page_start, pdf_page_end from book_chapters
     where document_id = $1 and doc_version = $2 order by chapter_key`,
    [doc.document_id, doc.doc_version],
  );
  await c.end();
  const manifest = {
    book: { documentId: doc.document_id, docVersion: doc.doc_version },
    slices: chapters.rows.map((r) => ({
      role: "lesson",
      chapterKey: r.chapter_key,
      pdfRange: [r.pdf_page_start, r.pdf_page_end],
    })),
  };
  writeFileSync(outPath, JSON.stringify(manifest, null, 1));
  console.log(`manifest rebuilt from DB truth: ${manifest.slices.length} slices -> ${outPath}`);
}

async function measureGlossary(): Promise<Record<string, number>> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const g = await c.query(`select validation_state, count(*)::int as n from book_glossary_terms where subject_code = '4ch1' group by 1`);
  await c.end();
  return Object.fromEntries(g.rows.map((r) => [r.validation_state, Number(r.n)]));
}

function resolveDigest(): string {
  if (digestIdx >= 0) return process.argv[digestIdx + 1];
  for (const cand of [join(REPO, "assets", "u234-digest.json"), "/home/z/my-project/assets/u234-digest.json"]) {
    try {
      readFileSync(cand);
      return cand;
    } catch { /* next */ }
  }
  return die("digest not found — pass --digest <u234-digest.json> (built from the sha-pinned parse of record)");
}

// ── mode dispatch ────────────────────────────────────────────────────────────
if (!commit) {
  console.log("U4 S3/S4 ARM CHECK (read-only — no DB writes; the flip levers stay operator-held)");
  run("prechecks", ["apps/api/scripts/books-u4-s34/pipeline.ts", "prechecks", "--repo-root", REPO], true);
  run("serve-proof (armed baseline: u4 must be null x8)", ["apps/api/scripts/books-u4-s34/pipeline.ts", "serve-proof", "--repo-root", REPO], true);
  const digest = resolveDigest();
  const sha = createHash("sha256").update(readFileSync(digest)).digest("hex");
  console.log(`\ndigest of record: ${digest} (sha256 ${sha.slice(0, 16)}...)`);
  console.log("ARMED — the amendment of record (LICENSE-DATA.md e832e617) discharges F-BOOK-0001;");
  console.log("fire the full S3/S4 with exactly one command:");
  console.log("  DATABASE_URL=postgres://... bun apps/api/scripts/books-u4-s34/run.ts --commit");
  process.exit(0);
}

// ── the committed chain ──────────────────────────────────────────────────────
console.log("U4 S3/S4 OPERATOR RUN (--commit) — the T-BOOK-013 unblock_path step 2 of record");
run("1/7 prechecks", ["apps/api/scripts/books-u4-s34/pipeline.ts", "prechecks", "--repo-root", REPO], true);
run("2/7 chapter flip u4:c22..c29", ["apps/api/scripts/books-u4-s34/pipeline.ts", "flip-chapters", "--repo-root", REPO], true);

// 3/7 SCOPED staging (the isolation law): only c22-c29 packs + FULL glossary (gate lifted) + meta
const staging = join("/tmp", `staging-u4-s34-${Date.now()}`);
mkdirSync(join(staging, "packs"), { recursive: true });
mkdirSync(join(staging, "glossary"), { recursive: true });
mkdirSync(join(staging, "meta"), { recursive: true });
for (const slug of ["c22", "c23", "c24", "c25", "c26", "c27", "c28", "c29"]) {
  const packDir = readdirSync(join(BOOKS, "packs")).find((n) => n.startsWith(`${slug}-`));
  if (packDir == null) die(`staging: no pack dir for ${slug}`);
  cpSync(join(BOOKS, "packs", packDir), join(staging, "packs", packDir), { recursive: true });
}
const glossFiles = readdirSync(join(BOOKS, "glossary")).filter((n) => n.endsWith(".yaml"));
for (const f of glossFiles) cpSync(join(BOOKS, "glossary", f), join(staging, "glossary", f));
cpSync(join(BOOKS, "meta", "book.yaml"), join(staging, "meta", "book.yaml"));
console.log(`\n===== 3/7 SCOPED staging -> ${staging} =====`);
console.log(`  packs: c22-c29 (8 dirs) | glossary: ALL ${glossFiles.length} authored+seed files incl. u4-organic-chemistry.yaml (the F-BOOK-0001 gate is lifted by the amendment of record e832e617) | meta/book.yaml`);

const manifestPath = join(staging, "manifest.json");
await buildManifest(manifestPath);
const digestSrc = resolveDigest();
const digestPath = join(staging, "u234-digest.json");
cpSync(digestSrc, digestPath);
console.log(`digest: ${digestSrc} -> staging (sha256 ${createHash("sha256").update(readFileSync(digestSrc)).digest("hex").slice(0, 16)}...)`);

const glossPre = await measureGlossary();
console.log(`glossary pre-ingest: ${JSON.stringify(glossPre)}`);

// 4/7 the ingest of record, byte-identical, spawned
run("4/7 ingest of record (COMMIT)", ["apps/api/scripts/books-ingest-rail.ts", staging, manifestPath], true);

// 5/7 the 20% spot-check (pre-flip posture: negative controls inside)
run("5/7 spot-check", ["apps/api/scripts/books-u4-s34/spotcheck.ts", staging, manifestPath, digestPath, String(glossPre["VALIDATED"] ?? 88)], true);

// 6/7 the pack flip
run("6/7 pack flip x46", ["apps/api/scripts/books-u4-s34/pipeline.ts", "flip-packs", "--repo-root", REPO], true);

// 7/7 the serve proof (u1..u4 full book)
run("7/7 serve-proof (u1..u4 full book)", ["apps/api/scripts/books-u4-s34/pipeline.ts", "serve-proof", "--repo-root", REPO], true);

const glossPost = await measureGlossary();
console.log("\n===== RUN COMPLETE =====");
console.log(`glossary pre->post: ${JSON.stringify(glossPre)} -> ${JSON.stringify(glossPost)}`);
if ((glossPost["VALIDATED"] ?? 0) !== (glossPre["VALIDATED"] ?? 0)) {
  die("glossary VALIDATED count changed across the run — the ingest must not touch states");
}
console.log("repo-side follow-ups (PR-borne, not script-borne):");
console.log("  - pack.yaml status notes c22-c29 -> published (the S4 flip of record)");
console.log("  - the 24 u4 glossary terms await their own r3 validation lane (T-BOOK-017 pattern)");
console.log("U4 S3/S4 GREEN — the rail now serves the full book behind the §3 double gate.");
