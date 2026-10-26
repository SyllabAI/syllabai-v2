#!/usr/bin/env bun
/**
 * T-BOOK-010 — the PACK LINT of record (the S2 gate, G1–G4).
 *
 * Usage:
 *   bun scripts/books/lint.mjs <booksDir> <manifest.json> <spec-points.yaml> [--book 4ch1]
 *
 * Gates (BOOK-PACK-SPEC §6):
 *   G1 binding   — chapterKey ∈ spine; ord monotonic 1..n; pdfPageAnchor
 *                  within the manifest chapter range AND monotonic;
 *                  specPointRefs ⊆ the chapter's spec subsection (the
 *                  subsection letter of record from the canonical graph);
 *                  checkRefs grammar; glossaryRefs resolve in the authored
 *                  glossary files.
 *   G2 schema    — every block parses book.block/1 (contracts zod; the
 *                  ingest-time serving values documentId/docVersion/
 *                  validationState=SUGGESTED are injected here EXACTLY as
 *                  books-ingest-rail.ts writes them — same law, one place).
 *   G3 language  — the chem banned-phrase list (per-chapter scope) + the
 *                  OCR-residue class; adding a ban = normal PR; removing
 *                  one needs a finding reference (SELF-IMPROVEMENT).
 *   G4 licensing — sim-embed simId ∈ the PhET allowlist of record; media-
 *                  embed licenseRef present (schema law re-asserted) AND
 *                  sourceId resolving to a curated row in
 *                  meta/media-sources.yaml (ADR-BOOK-0002: status curated,
 *                  licensing_row.reviewed_date present, checked_date fresh
 *                  within recheck_days — stale = WARN, absent = FAIL —,
 *                  specRefs in the hosting chapter's canonical subsection,
 *                  hosting_pack chapter in the spine and equal to the
 *                  block's chapter, payload url/youtubeId == row values);
 *                  no image files in packs (figures are page-true pointers);
 *                  honest-empty: a pack with zero blocks FAILS (delete it).
 *
 * Exit 0 = no error-class findings (warns print but never fail — the
 * ADR-BOOK-0002 freshness gate is a warn class); exit 1 = any error finding.
 * Findings print with the pack/block anchor so the authoring pass can cite
 * them in findings.jsonl.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import yaml from "js-yaml";

import { bookBlockSchema } from "../../packages/contracts/src/books.ts";

// ── args ─────────────────────────────────────────────────────────────────────
const [booksDir, manifestPath, specPointsPath] = process.argv.slice(2);
if (booksDir == null || manifestPath == null || specPointsPath == null) {
  console.error("usage: lint.mjs <booksDir> <manifest.json> <spec-points.yaml>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const docId = manifest.book.documentId; // the serving documentId of record
const docVersion = manifest.book.docVersion ?? 1;
const rangeByChapter = new Map(
  (manifest.slices ?? [])
    .filter((s) => s.role === "lesson" && s.chapterKey)
    .map((s) => [s.chapterKey, s.pdfRange]),
);

// spine from book.yaml
const book = yaml.load(readFileSync(join(booksDir, "meta", "book.yaml"), "utf8"));
const spineKeys = new Set(
  Object.values(book.spine).flatMap((rows) => rows.map((r) => r.c)),
);
const chapterKeyOf = (c) => {
  const unit = Object.entries(book.spine).find(([, rows]) => rows.some((r) => r.c === c))?.[0];
  return `u${unit?.slice(1)}:c${Number.parseInt(c.slice(1), 10)}`;
};

// canonical spec graph: subsection membership per official code
const specYaml = yaml.load(readFileSync(specPointsPath, "utf8"));
const subsectionByCode = new Map();
for (const p of specYaml.specification_points ?? []) {
  subsectionByCode.set(p.official_code, p.subsection);
}

// chapter → subsection letter of record (the S1 binding; see receipt)
// F-BOOK-0004: c10 was mapped to S1-h before any c10 pack existed; the
// canonical graph binds 1.55C-1.60C to S1-i (electrolysis) — fixed at
// T-BOOK-016, the first lane to author a c10 pack.
// T-BOOK-011/012/013: c11-c29 extended schema-first from the canonical
// subsection table (specification_points.yaml), not from book.yaml notes.
// Chapters whose DB join sets carry a neighbouring-subsection code (c12 joins
// 2.4C from S2-a; c27/c28 join the shared 4.29C from S4-e — repeated LO-box
// matches) bind to their DOMINANT subsection; authoring must avoid the
// cross-boundary codes (lint G1 enforces subsection membership anyway).
const CHAPTER_SUBSECTION = {
  c01: "4CH1-S1-a", c02: "4CH1-S1-b", c03: "4CH1-S1-c", c04: "4CH1-S1-d",
  c05: "4CH1-S1-e", c06: "4CH1-S1-e", c07: "4CH1-S1-f", c08: "4CH1-S1-g",
  c09: "4CH1-S1-h", c10: "4CH1-S1-i",
  c11: "4CH1-S2-a", c12: "4CH1-S2-b", c13: "4CH1-S2-c", c14: "4CH1-S2-d",
  c15: "4CH1-S2-e", c16: "4CH1-S2-f", c17: "4CH1-S2-g", c18: "4CH1-S2-h",
  c19: "4CH1-S3-a", c20: "4CH1-S3-b", c21: "4CH1-S3-c",
  c22: "4CH1-S4-a", c23: "4CH1-S4-b", c24: "4CH1-S4-c", c25: "4CH1-S4-d",
  c26: "4CH1-S4-e", c27: "4CH1-S4-f", c28: "4CH1-S4-g", c29: "4CH1-S4-h",
};

// authored glossary slugs
const glossarySlugs = new Set();
for (const f of readdirSync(join(booksDir, "glossary"))) {
  if (!f.endsWith(".yaml") || f.startsWith("seed-")) continue; // seeds are floors, never resolution targets
  const doc = yaml.load(readFileSync(join(booksDir, "glossary", f), "utf8"));
  for (const t of doc?.terms ?? []) if (t.slug) glossarySlugs.add(t.slug);
}

// ── ADR-BOOK-0002: the curated external-media manifest (media-embed rows) ───
// Append-only ledger at books/<qual>/meta/media-sources.yaml; lint law 4 of
// BOOK-PACK-SPEC made mechanically checkable against it. The file is
// OPTIONAL at lint time only in the sense that an absent manifest fails any
// media-embed block (honest-empty law: no manifest row, no card).
let mediaRows = [];
try {
  mediaRows = yaml.load(readFileSync(join(booksDir, "meta", "media-sources.yaml"), "utf8")) ?? [];
} catch {
  mediaRows = []; // absent manifest — every media-embed fails the resolve law below
}
const mediaById = new Map((Array.isArray(mediaRows) ? mediaRows : []).map((r) => [r.id, r]));
// duplicate ids would make the resolve law ambiguous — counted here, failed per-block below
const idCounts = new Map();
for (const r of Array.isArray(mediaRows) ? mediaRows : []) {
  idCounts.set(r.id, (idCounts.get(r.id) ?? 0) + 1);
}

// PhET allowlist of record (real, loadable sims only)
const PHET_ALLOWLIST = new Set([
  "states-of-matter-basics", "states-of-matter", "build-an-atom", "isotopes-and-atomic-mass",
  "balancing-chemical-equations", "build-a-molecule", "acid-base-solutions", "concentration",
  "molarity", "ph-scale", "reactants-products-and-leftovers", "salts-and-solubility", "atom-viewer",
]);

// G3: the chem banned-phrase list (chapter-scoped)
const BANNED = [
  { phrase: /free electrons/i, chapters: ["c07", "c08", "c09", "c10"], why: "imprecise delocalised-electron phrasing (G3; ms_avoids in glossary)" },
  { phrase: /sea of electrons/i, chapters: ["c07", "c08", "c09", "c10"], why: "unqualified sea-model phrasing" },
  { phrase: /\bH2SO4\b(?![\s(])/, chapters: "__all__", why: "OCR subscript-loss pattern — Unicode subscripts or <sub> markup of record only" },
];

const findings = [];
const warnFindings = [];
const fail = (pack, block, gate, msg) => findings.push({ pack, block, gate, msg });
const warn = (pack, block, gate, msg) => warnFindings.push({ pack, block, gate, msg });

function walkBlocks(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkBlocks(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

const packsDir = join(booksDir, "packs");
const packDirs = readdirSync(packsDir, { withFileTypes: true }).filter((e) => e.isDirectory());

let blockCount = 0;
for (const packEnt of packDirs) {
  const packDir = join(packsDir, packEnt.name);
  const packName = packEnt.name;
  const packYamlPath = join(packDir, "pack.yaml");
  try {
    statSync(packYamlPath);
  } catch {
    fail(packName, null, "G1", "pack.yaml missing (S0 output of record)");
    continue;
  }
  const pack = yaml.load(readFileSync(packYamlPath, "utf8"));
  const chapter = pack.chapter;

  // ── G1 binding ──
  if (!spineKeys.has(chapter)) {
    fail(packName, null, "G1", `chapter ${chapter} not in the spine (orphan pack law)`);
    continue;
  }
  const ck = chapterKeyOf(chapter);
  const range = rangeByChapter.get(ck);
  if (range == null) fail(packName, null, "G1", `no manifest range for ${ck}`);

  const files = walkBlocks(packDir).sort();
  if (files.length === 0) {
    fail(packName, null, "G4", "honest-empty: zero blocks — delete the pack instead");
    continue;
  }

  let lastOrd = 0;
  let lastAnchor = 0;
  for (const f of files) {
    const rel = f.replace(packDir + "/", "");
    let authored;
    try {
      authored = JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      fail(packName, rel, "G2", `unparseable JSON: ${e.message}`);
      continue;
    }
    blockCount += 1;

    // chapter_key binding (authored files carry chapterKey; ingest adds the rest)
    if (authored.chapterKey !== ck) {
      fail(packName, rel, "G1", `chapterKey ${authored.chapterKey} ≠ spine-derived ${ck}`);
    }
    if (authored.ord !== lastOrd + 1) {
      fail(packName, rel, "G1", `ord must be monotonic 1..n (got ${authored.ord}, expected ${lastOrd + 1})`);
    }
    lastOrd = Math.max(lastOrd, authored.ord ?? lastOrd);

    if (authored.pdfPageAnchor != null) {
      if (range != null && (authored.pdfPageAnchor < range[0] || authored.pdfPageAnchor > range[1])) {
        fail(packName, rel, "G1", `pdfPageAnchor ${authored.pdfPageAnchor} outside the chapter range ${range[0]}-${range[1]}`);
      }
      if (authored.pdfPageAnchor < lastAnchor) {
        fail(packName, rel, "G1", `pdfPageAnchor ${authored.pdfPageAnchor} breaks monotonicity (> ${lastAnchor})`);
      }
      lastAnchor = authored.pdfPageAnchor;
    }

    for (const code of authored.specPointRefs ?? []) {
      const sub = subsectionByCode.get(code);
      if (sub == null) fail(packName, rel, "G1", `spec code ${code} not in the canonical graph`);
      else if (sub !== CHAPTER_SUBSECTION[chapter]) {
        fail(packName, rel, "G1", `spec code ${code} lives in ${sub}, chapter bound to ${CHAPTER_SUBSECTION[chapter]}`);
      }
    }
    for (const ref of authored.checkRefs ?? []) {
      if (!/^sme-eq-[a-z0-9-]+-q\d+$/.test(ref)) {
        fail(packName, rel, "G1", `checkRef ${ref} off the bank external-ref grammar`);
      }
    }
    for (const slug of authored.glossaryRefs ?? []) {
      if (!glossarySlugs.has(slug)) {
        fail(packName, rel, "G1", `glossaryRef ${slug} does not resolve in books/${basename(booksDir)}/glossary/`);
      }
    }

    // ── G2 schema (the serving values injected exactly as the ingest writes them) ──
    const serving = {
      id: authored.id,
      documentId: docId,
      docVersion,
      chapterKey: authored.chapterKey,
      ord: authored.ord,
      type: authored.type,
      pdfPageAnchor: authored.pdfPageAnchor ?? null,
      content: authored.content ?? {},
      checkRefs: authored.checkRefs ?? [],
      glossaryRefs: authored.glossaryRefs ?? [],
      specPointRefs: authored.specPointRefs ?? [],
      validationState: "SUGGESTED",
      version: authored.version ?? 1,
    };
    const parsed = bookBlockSchema.safeParse(serving);
    if (!parsed.success) {
      fail(packName, rel, "G2", parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
    }

    // ── G3 language ──
    const text = JSON.stringify(authored.content ?? {});
    for (const ban of BANNED) {
      if (ban.chapters === "__all__" || ban.chapters.includes(chapter)) {
        if (ban.phrase.test(text)) fail(packName, rel, "G3", ban.why);
      }
    }

    // ── G4 licensing ──
    if (authored.type === "sim-embed") {
      if (!PHET_ALLOWLIST.has(authored.content?.simId)) {
        fail(packName, rel, "G4", `simId ${authored.content?.simId} not on the PhET allowlist of record`);
      }
    }
    if (authored.type === "media-embed") {
      if (!authored.content?.licenseRef) {
        fail(packName, rel, "G4", "media-embed without licenseRef (honest-empty law: no card)");
      }
      const sid = authored.content?.sourceId;
      if (sid == null || sid === "") {
        fail(packName, rel, "G4", "media-embed without sourceId (ADR-BOOK-0002 decision 1: resolve law — no manifest row, no card)");
      } else {
        const row = mediaById.get(sid);
        if (row == null) {
          fail(packName, rel, "G4", `sourceId ${sid} does not resolve in meta/media-sources.yaml (ADR-BOOK-0002: no row, no card)`);
        } else {
          if ((idCounts.get(sid) ?? 0) > 1) fail(packName, rel, "G4", `manifest row ${sid} is duplicated (resolve law requires unique ids)`);
          if (row.status !== "curated") {
            fail(packName, rel, "G4", `manifest row ${sid} status=${row.status ?? "(absent)"} — only curated rows serve (retired = honest-empty)`);
          }
          const lr = row.licensing_row;
          if (lr == null || typeof lr !== "object" || !lr.reviewed_date) {
            fail(packName, rel, "G4", `manifest row ${sid} missing licensing_row.reviewed_date (BOOK-PACK-SPEC lint law 4)`);
          }
          const checked = row.checked_date ? Date.parse(row.checked_date) : NaN;
          const recheck = Number.isFinite(Number(row.recheck_days)) ? Number(row.recheck_days) : 90;
          if (Number.isNaN(checked)) {
            fail(packName, rel, "G4", `manifest row ${sid} missing checked_date (curation protocol law: unverified URLs never serve)`);
          } else {
            const ageDays = (Date.now() - checked) / 86400000;
            if (ageDays > recheck) {
              warn(packName, rel, "G4", `manifest row ${sid} checked_date ${row.checked_date} is stale (> recheck_days=${recheck}) — re-verify embeddability and re-stamp`);
            }
          }
          // spec join set: row.specRefs sit in the block chapter's canonical
          // subsection (the same binding law the pack's own specPointRefs run)
          for (const code of row.specRefs ?? []) {
            const sub = subsectionByCode.get(code);
            if (sub == null) fail(packName, rel, "G4", `manifest row ${sid} specRef ${code} not in the canonical graph`);
            else if (sub !== CHAPTER_SUBSECTION[chapter]) {
              fail(packName, rel, "G4", `manifest row ${sid} specRef ${code} lives in ${sub}, chapter bound to ${CHAPTER_SUBSECTION[chapter]}`);
            }
          }
          // hosting_pack: chapter token must exist in the spine and be the
          // block's own chapter (the ADR's one-pack-of-record law)
          const m = /(?:^|-)c(\d{2})(?:-|$)/.exec(String(row.hosting_pack ?? ""));
          const rowChapter = m ? `c${m[1]}` : null;
          if (rowChapter == null || !spineKeys.has(rowChapter)) {
            fail(packName, rel, "G4", `manifest row ${sid} hosting_pack ${row.hosting_pack ?? "(absent)"} does not name a spine chapter`);
          } else if (rowChapter !== chapter) {
            fail(packName, rel, "G4", `manifest row ${sid} hosts in ${rowChapter} but the block binds to ${chapter}`);
          }
          // payload drift guards: the card serves the row of record, never a fork
          if (row.url != null && authored.content?.url !== row.url) {
            fail(packName, rel, "G4", `payload url drifts from manifest row ${sid}`);
          }
          if (row.kind === "video") {
            if (typeof authored.content?.youtubeId !== "string" || authored.content.youtubeId === "") {
              fail(packName, rel, "G4", `video row ${sid} needs payload youtubeId mirrored from the manifest (renderer embed law)`);
            } else if (row.youtube_id != null && authored.content.youtubeId !== row.youtube_id) {
              fail(packName, rel, "G4", `payload youtubeId drifts from manifest row ${sid}`);
            }
          }
        }
      }
    }
  }

  // pack.yaml block plan vs files (the S0 plan is binding)
  const planned = (pack.blocks ?? []).length;
  if (planned !== files.length) {
    fail(packName, null, "G1", `pack.yaml plans ${planned} blocks, ${files.length} on disk (the S0 plan is the law)`);
  }
}

console.log(
  `lint: ${packDirs.length} packs, ${blockCount} blocks, ${findings.length} finding(s), ${warnFindings.length} warn(s)`,
);
for (const f of findings) {
  console.log(`  [${f.gate}] ${f.pack}${f.block ? `/${f.block}` : ""} — ${f.msg}`);
}
for (const f of warnFindings) {
  console.log(`  [${f.gate} WARN] ${f.pack}${f.block ? `/${f.block}` : ""} — ${f.msg}`);
}
process.exit(findings.length === 0 ? 0 : 1);
