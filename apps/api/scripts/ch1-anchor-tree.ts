/**
 * T-MG-CH1-MARK-1 — the paper-anchor driver: the ADR-037 official set for
 * 4CH1/1C June 2026 (apps/hub/content/igcse-chemistry-19/official-papers.json,
 * slug official-4ch1-1c-2026-06 — the operator-validated verbatim archive
 * corpus, converter G7 gates) written into the CORE BANK as the
 * paper-anchored question tree the paper-regions service serves:
 *
 *   questions (exam_paper_id, external_ref "4ch1/past-papers/2026-06/4CH1-1C#qN",
 *              the T-MIG era law) → question_versions (v1, VALIDATED)
 *   → question_parts (label = the printed sub-path, prompt = hygienicStem)
 *   → mark_schemes (one POINTS scheme per version, version-level)
 *   → mark_points (DIRECT part binding, ref "q{n}{part}-{k}" in MS row order —
 *     the REF LAW the mark-point-rects seed resolves 1:1 against)
 *
 * The exam_papers row is NOT created here: 4CH1/1C June 2026 already exists
 * as a VALIDATED PAST_PAPER row with both document links (production uuid of
 * record ef899774-7aa1-4246-8fb1-99b4d3cdfa95); a missing row fails loudly.
 *
 * IDEMPOTENCE: every write is find-or-insert + update in place — a re-run
 * converges (no duplicates: uq_question_version, uq_question_part,
 * uq_mark_scheme, and the (mark_scheme_id, ref) pair).
 *
 * VALIDATION POSTURE (disclosed): rows land VALIDATED — the content of
 * record is the operator-validated ADR-037 official corpus (verbatim archive
 * extraction, part-sum G7 gate, honest refusals), the derivation here is
 * mechanical (no LLM), and the sibling era trees (the 46 glm-ocr chemistry
 * papers) are VALIDATED. Provenance rides extractionMethod +
 * sourceDocumentId; this receipt is the disclosure.
 *
 * Usage:
 *   bun apps/api/scripts/ch1-anchor-tree.ts --mode dry  --receipt <out.json>
 *   bun apps/api/scripts/ch1-anchor-tree.ts --mode apply --db <0600 uri file> --receipt <out.json>
 *   (--db omitted → DATABASE_URL env; the 133d guard protocol governs prod)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const PAPER_CODE = "4CH1/1C";
const SESSION_LABEL = "June 2026";
const BUNDLE_PATH = "apps/hub/content/igcse-chemistry-19/official-papers.json";
const SET_SLUG = "official-4ch1-1c-2026-06";
const DOC_REF = "4ch1/past-papers/2026-06/4CH1-1C";
const EXTRACTION_METHOD = "adr037-official-set-paper-anchor-v1 (T-MG-CH1-MARK-1)";

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry";
const dbFileIdx = args.indexOf("--db");
const receiptIdx = args.indexOf("--receipt");
const receiptPath = receiptIdx >= 0 ? args[receiptIdx + 1] : null;
const bundleIdx = args.indexOf("--bundle");
const bundlePath = bundleIdx >= 0 ? args[bundleIdx + 1] : BUNDLE_PATH;

// ── source of record ─────────────────────────────────────────────────────────
const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Array<Record<string, unknown>>;
const set = (bundle as Array<{ slug: string }>).find((s) => s.slug === SET_SLUG);
if (!set) throw new Error(`bundle set ${SET_SLUG} not found in ${bundlePath}`);

type Part = {
  id: string;
  order: number;
  marks: number;
  problemMd: string | null;
  markPoints?: Array<{ id: string; marks: number; textMd: string }>;
};
type Q = { id: string; order: number; totalMarks: number; parts: Part[] };

const questions = (set as unknown as { questions: Q[] }).questions;
if (!questions?.length) throw new Error("official set carries no questions");

// ── pre-write gates (fail loudly, the RECT-2 posture) ────────────────────────
const errors: string[] = [];
questions.forEach((q, qi) => {
  const n = qi + 1;
  const partSum = q.parts.reduce((a, p) => a + p.marks, 0);
  if (partSum !== q.totalMarks) errors.push(`q${n}: part sum ${partSum} != totalMarks ${q.totalMarks}`);
  q.parts.forEach((p) => {
    const label = p.id.split("_1c_")[1].split("-", 1)[1] ?? p.id.split("_1c_")[1].slice(2);
    if (label.length > 12) errors.push(`q${n}: label too long: ${label}`);
    const pts = p.markPoints ?? [];
    const ptSum = pts.reduce((a, mp) => a + mp.marks, 0);
    if (ptSum !== p.marks) errors.push(`q${n} ${label}: point sum ${ptSum} != part marks ${p.marks}`);
    pts.forEach((_, k) => {
      const ref = `q${n}${label}-${k + 1}`;
      if (ref.length > 20) errors.push(`ref too long: ${ref}`);
    });
  });
});
const grand = questions.reduce((a, q) => a + q.totalMarks, 0);
if (grand !== 110) errors.push(`grand total ${grand} != 110 (the printed paper total)`);
if (errors.length) {
  console.error("PRE-WRITE GATES FAILED:");
  for (const e of errors) console.error(" -", e);
  process.exit(2);
}
const nParts = questions.reduce((a, q) => a + q.parts.length, 0);
const nPoints = questions.reduce((a, q) => a + q.parts.reduce((b, p) => b + (p.markPoints?.length ?? 0), 0), 0);
console.log(`source: ${questions.length} questions / ${nParts} parts / ${nPoints} points, grand 110 — gates green`);

// ── db seam ──────────────────────────────────────────────────────────────────
import { createSql } from "../src/services/identity/users";
import { hygienicStem } from "../src/services/tutor/stem-hygiene";
type Sql = ReturnType<typeof createSql>;

let sql: Sql | null = null;
function db(): Sql {
  if (sql) return sql;
  const url = dbFileIdx >= 0 ? readFileSync(args[dbFileIdx + 1], "utf8").trim() : process.env.DATABASE_URL;
  if (!url) throw new Error("no database: pass --db <0600 uri file> or DATABASE_URL");
  sql = createSql(url);
  return sql;
}

const counts = { questions: 0, versions: 0, parts: 0, schemes: 0, points: 0, updates: 0 };

async function resolvePaper(): Promise<{ id: string; qpDocId: string; msDocId: string }> {
  const rows = await db()`select id, question_paper_document_id, mark_scheme_document_id
    from exam_papers where paper_code = ${PAPER_CODE} and session_label = ${SESSION_LABEL} limit 1` as Array<{
    id: string; question_paper_document_id: string; mark_scheme_document_id: string;
  }>;
  if (rows.length === 0) {
    throw new Error(`exam_papers row ${PAPER_CODE} / ${SESSION_LABEL} not found — the paper must be ingested first`);
  }
  // the document-id columns ARE the documentId strings (varchar(80) of record)
  return {
    id: rows[0].id,
    qpDocId: rows[0].question_paper_document_id,
    msDocId: rows[0].mark_scheme_document_id,
  };
}

async function anchorOne(tx: Sql, paper: { id: string; qpDocId: string; msDocId: string }, q: Q, qn: number) {
  const externalRef = `${DOC_REF}#q${qn}`;
  const stem = hygienicStem(`Question ${qn} — ${PAPER_CODE} ${SESSION_LABEL}`);
  const marks = q.totalMarks;
  const secs = Math.max(60, marks * 90);

  // question (find-or-create by paper + external_ref)
  const qrows = await tx`select id from questions where exam_paper_id = ${paper.id} and external_ref = ${externalRef} limit 1` as Array<{ id: string }>;
  let questionId: string;
  if (qrows.length > 0) {
    questionId = qrows[0].id;
    await tx`update questions set marks = ${marks}, active = true where id = ${questionId}`;
    counts.updates++;
  } else {
    questionId = randomUUID();
    await tx`insert into questions (id, external_ref, question_type, stem, marks, difficulty,
      expected_time_seconds, provenance, active, version, exam_paper_id, difficulty_source, created_at)
      values (${questionId}, ${externalRef}, 'STRUCTURED', ${stem}, ${marks}, 3, ${secs},
      'PAST_PAPER', true, 1, ${paper.id}, 'official-set-verbatim', now())`;
    counts.questions++;
  }

  // version v1
  const vrows = await tx`select id from question_versions where question_id = ${questionId} and version = 1 limit 1` as Array<{ id: string }>;
  let versionId: string;
  if (vrows.length > 0) {
    versionId = vrows[0].id;
    await tx`update question_versions set stem = ${stem}, marks = ${marks},
      validation_state = 'VALIDATED', source_document_id = ${paper.qpDocId},
      extraction_method = ${EXTRACTION_METHOD} where id = ${versionId}`;
    counts.updates++;
  } else {
    versionId = randomUUID();
    await tx`insert into question_versions (id, question_id, version, stem, marks, difficulty,
      expected_time_seconds, validation_state, source_document_id, extraction_method, created_at)
      values (${versionId}, ${questionId}, 1, ${stem}, ${marks}, 3, ${secs}, 'VALIDATED',
      ${paper.qpDocId}, ${EXTRACTION_METHOD}, now())`;
    counts.versions++;
  }

  // one POINTS scheme per version (version-level binding; points bind directly)
  const srows = await tx`select id from mark_schemes where question_version_id = ${versionId} and version_label = '1' limit 1` as Array<{ id: string }>;
  let schemeId: string;
  if (srows.length > 0) {
    schemeId = srows[0].id;
    await tx`update mark_schemes set scheme_kind = 'POINTS', validation_state = 'VALIDATED',
      source_document_id = ${paper.msDocId}, extraction_method = ${EXTRACTION_METHOD} where id = ${schemeId}`;
    counts.updates++;
  } else {
    schemeId = randomUUID();
    await tx`insert into mark_schemes (id, question_version_id, question_part_id, version_label,
      source_document_id, validation_state, extraction_method, scheme_kind, created_at)
      values (${schemeId}, ${versionId}, null, '1', ${paper.msDocId}, 'VALIDATED', ${EXTRACTION_METHOD}, 'POINTS', now())`;
    counts.schemes++;
  }

  for (const p of [...q.parts].sort((a, b) => a.order - b.order)) {
    const label = p.id.split("_1c_")[1].split("-", 1)[1] ?? p.id.split("_1c_")[1].slice(2);
    const prompt = hygienicStem(p.problemMd ?? `Question ${qn} part ${label} (verbatim text pending scan)`);
    const prows = await tx`select id from question_parts where question_version_id = ${versionId} and label = ${label} limit 1` as Array<{ id: string }>;
    let partId: string;
    if (prows.length > 0) {
      partId = prows[0].id;
      await tx`update question_parts set prompt = ${prompt}, marks = ${p.marks}, ordering = ${p.order} where id = ${partId}`;
      counts.updates++;
    } else {
      partId = randomUUID();
      await tx`insert into question_parts (id, question_version_id, label, prompt, marks, ordering, created_at)
        values (${partId}, ${versionId}, ${label}, ${prompt}, ${p.marks}, ${p.order}, now())`;
      counts.parts++;
    }

    const pts = [...(p.markPoints ?? [])];
    for (let k = 0; k < pts.length; k++) {
      const mp = pts[k];
      const ref = `q${qn}${label}-${k + 1}`;
      const text = hygienicStem(mp.textMd);
      const mrows = await tx`select id from mark_points where mark_scheme_id = ${schemeId} and ref = ${ref} limit 1` as Array<{ id: string }>;
      if (mrows.length > 0) {
        await tx`update mark_points set text = ${text}, marks = ${mp.marks},
          question_part_id = ${partId}, ordering = ${k} where id = ${mrows[0].id}`;
        counts.updates++;
      } else {
        await tx`insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text, marks, created_at)
          values (${randomUUID()}, ${schemeId}, ${partId}, ${ref}, ${k}, ${text}, ${mp.marks}, now())`;
        counts.points++;
      }
    }
  }
}

async function main() {
  const paper = await resolvePaper();
  console.log(`paper row: ${paper.id} (QP doc ${paper.qpDocId} / MS doc ${paper.msDocId})`);
  if (mode === "dry") {
    // the rehearsal posture: resolve + gates only, zero writes
    console.log("DRY — no bytes written. Would anchor", questions.length, "questions.");
  } else {
    await db().transaction(async (tx) => {
      for (let i = 0; i < questions.length; i++) {
        await anchorOne(tx as unknown as Sql, paper, questions[i], i + 1);
      }
    });
    console.log("APPLIED:", JSON.stringify(counts));
  }
  if (receiptPath) {
    writeFileSync(receiptPath, JSON.stringify({
      task: "T-MG-CH1-MARK-1", mode, paperCode: PAPER_CODE, sessionLabel: SESSION_LABEL,
      paperId: paper.id, source: { bundle: bundlePath, set: SET_SLUG },
      counts, grandMarks: grand, questions: questions.length, parts: nParts, points: nPoints,
      validation_posture: "VALIDATED rows from the operator-validated ADR-037 verbatim corpus; mechanical derivation, no LLM; disclosed in the lane receipt",
    }, null, 1));
    console.log("receipt ->", receiptPath);
  }
  await (sql as unknown as { end?: () => Promise<void> } | null)?.end?.();
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
