/**
 * T-MIG-138 band 138a — the 4MA1 past-paper intake driver (the roll
 * instrument; the PP-CORPUS absence verdict's closing lever).
 *
 * The deterministic pipeline, per paper dir in the SyllabAI/syllabai-pastpapers
 * archive (e.g. past-papers/2025-06/4MA1-1H):
 *   manifest.yaml → parse identity + material checksums → download qp.pdf /
 *   ms.pdf (sha256 fail-closed vs the manifest) → pdftotext -layout → segment
 *   by the deterministic question-start law (QP: line-start sequence-guarded
 *   numbers; MS: the "(Total for Question N is M marks)" footer law) → build
 *   THREE CanonicalDocuments (QUESTION_PAPER, MARK_SCHEME, the EXTERNAL_
 *   QUESTIONS q-card) → chunk via the FROZEN ChunkingService → [apply] land
 *   in ONE transaction per paper via the FROZEN ingestCanonicalDocument
 *   (documents + chunks WITH the Embedding-v2 identity mirror) + flip the
 *   intake decision of record (documents + exam_papers VALIDATED — the
 *   chemistry serving posture, paper-question.ts:290-296) + the exam_papers
 *   bank row (the tier-1 anchor) → postverify → receipt.
 *
 * Embeddings are NOT written here (the zero-API-keys content law — rows land
 * embed_rev=2 with NULL vectors; the CI-egress backfill runs separately, the
 * 133d discipline). The three deterministic resolver anchors (bank/card/store)
 * need ZERO embeddings — paper asks resolve the moment rows land.
 *
 * Conventions of record are the GOLDEN-MASTER chemistry shapes (read-only
 * peek 2026-10-20, evidence/t138_golden_master.json): title
 * "4MA1 Maths 4MA1/1H June 2025", board "Edexcel", qualification "4MA1",
 * session_label "June 2025", series JAN/JUN/NOV, paper_code "4MA1/1H",
 * card file_name "qcard-4MA1-1H-JUN-2025.txt", kind EXTERNAL_QUESTIONS,
 * documentId = derivedDocumentId(checksumHex, ENGINE, ENGINE_VERSION).
 * spec_codes stay NULL for maths (the honest absence — the original
 * chemistry spec resolution lane is out of this band's fence).
 *
 * Front matter (QP cover/instructions, MS general guidance — everything
 * before the first question) is EXCLUDED from textBlocks (the chemistry
 * corpus parity: its chunks start at Q1) — page_count stays PDF-true.
 *
 * Usage (dry — no DB, full deterministic pipeline + receipt):
 *   bun apps/api/scripts/papers-ingest-138.ts --mode dry \
 *     [--session 2025-06] [--unit 1H] [--limit N] \
 *     --receipt <out.json>
 * Usage (apply — ONE transaction per paper on the target DB; REQUIRES the
 * operator prod-DB write order per the 093/133b law, COW-proof first):
 *   ... --mode apply --db <0600 uri file> [same filters] --receipt <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { derivedDocumentId } from "@syllabai/contracts";

import { createSql } from "../src/services/identity/users";
import { ingestCanonicalDocument } from "../src/services/ingestion/canonical";
import { chunkCanonicalDocument } from "../src/services/ingestion/chunking";
import type {
  CanonicalDocument,
  CanonicalTextBlockElement,
  DocumentKind,
} from "@syllabai/contracts";

// ── constants of record ──────────────────────────────────────────────────────

const ARCHIVE_REPO = "SyllabAI/syllabai-pastpapers";
const ARCHIVE_BASE =
  "past-papers/pearson-edexcel/international-gcse/mathematics-a/4ma1";
const SUBJECT_CODE = "4MA1";
const SUBJECT_TITLE_QP_MS = "International GCSE Mathematics A";
const SUBJECT_TITLE_CARD = "IGCSE Maths";
const BOARD = "Edexcel";
const QUALIFICATION = "4MA1";
const ENGINE = "pdftotext-layout";
const ENGINE_VERSION = "25.03.0";
const SERIES_OF_MONTH: Record<string, string> = {
  "01": "JAN",
  "06": "JUN",
  "11": "NOV",
};
const MONTH_NAME: Record<string, string> = {
  "01": "January",
  "06": "June",
  "11": "November",
};

// ── arg parsing ──────────────────────────────────────────────────────────────

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      out[a.slice(2)] = next != null && !next.startsWith("--") ? next : "true";
      if (next == null || next.startsWith("--")) i -= 0;
      else i++;
    }
  }
  return out;
}

const A = args();
const MODE = A.mode ?? "dry";
if (MODE !== "dry" && MODE !== "apply") {
  console.error("mode must be dry|apply");
  process.exit(2);
}
const RECEIPT_PATH = A.receipt ?? `t138-intake-${MODE}-receipt.json`;
const PDFTOTEXT = A.pdftotext ?? "pdftotext";
const ARCHIVE_REF = A["archive-ref"] ?? "main";
const DB_FILE = A.db ?? "";
if (MODE === "apply" && !DB_FILE) {
  console.error("apply mode requires --db <0600 uri file>");
  process.exit(2);
}

// ── http helpers (GitHub token optional, public repo) ───────────────────────

const GH_TOKEN =
  process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.T138_GH_TOKEN || "";

async function fetchBytes(url: string): Promise<Buffer> {
  const headers: Record<string, string> = { "User-Agent": "t-mig-138-intake" };
  if (GH_TOKEN) headers["Authorization"] = `Bearer ${GH_TOKEN}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        if (attempt >= 4) throw new Error(`HTTP ${res.status} after retries: ${url}`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse((await fetchBytes(url)).toString("utf8"));
}

// ── minimal manifest parser (the known manifest shape; fail-closed) ─────────

interface ManifestMaterial {
  type: string;
  path: string;
  sha256: string;
}
interface Manifest {
  paperId: string | null;
  year: string | null;
  sessionMonth: string | null;
  officialReference: string | null;
  materials: ManifestMaterial[];
}

function parseManifestYaml(text: string): Manifest {
  const lines = text.split(/\r?\n/);
  const scalar = (key: string): string | null => {
    const re = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`);
    for (const line of lines) {
      const m = re.exec(line);
      if (m) {
        const v = m[1]!.replace(/^['"]|['"]$/g, "").trim();
        return v === "" || v === "null" ? null : v;
      }
    }
    return null;
  };
  // materials: the "- type: ..." list — collect type/path/sha256 triples
  const materials: ManifestMaterial[] = [];
  let current: Partial<ManifestMaterial> | null = null;
  let inMaterials = false;
  for (const line of lines) {
    if (/^materials:\s*$/.test(line)) {
      inMaterials = true;
      current = null;
      continue;
    }
    if (!inMaterials) continue;
    if (/^[^\s-]/.test(line)) {
      // a new top-level key ends the materials list — flush the last item
      if (current != null) materials.push(current as ManifestMaterial);
      inMaterials = false;
      current = null;
      continue;
    }
    const item = /^(\s*)-\s+(\w+):\s*(.*?)\s*$/.exec(line);
    if (item) {
      if (current != null) materials.push(current as ManifestMaterial);
      current = { [item[2]!]: item[3]!.replace(/^['"]|['"]$/g, "") } as Partial<ManifestMaterial>;
      continue;
    }
    const field = /^\s+(\w+):\s*(.*?)\s*$/.exec(line);
    if (field && current != null) {
      (current as Record<string, string>)[field[1]!] = field[2]!.replace(/^['"]|['"]$/g, "");
    }
  }
  if (current != null) {
    materials.push(current as ManifestMaterial);
    current = null;
  }

  const m: Manifest = {
    paperId: scalar("paper_id"),
    year: scalar("\\s*year") ?? null,
    sessionMonth: scalar("session_month"),
    officialReference: scalar("official_reference"),
    materials: materials.filter((x) => x.type && x.path && x.sha256),
  };
  // series year/session_month live under "series:" with 2-space indent
  const seriesBlock = /^series:\s*$/.exec("") != null;
  void seriesBlock;
  return m;
}

/** The series block is indented; the generic scalar() above must not match
 *  top-level-only — re-scan specifically inside the series: block. */
function seriesFields(text: string): { year: string | null; month: string | null } {
  const lines = text.split(/\r?\n/);
  let inSeries = false;
  let year: string | null = null;
  let month: string | null = null;
  for (const line of lines) {
    if (/^series:\s*$/.test(line)) {
      inSeries = true;
      continue;
    }
    if (inSeries && /^[^\s]/.test(line)) inSeries = false;
    if (!inSeries) continue;
    let m = /^\s+year:\s*'?(.*?)'?\s*$/.exec(line);
    if (m) year = m[1] === "" ? null : m[1]!;
    m = /^\s+session_month:\s*'?(.*?)'?\s*$/.exec(line);
    if (m) month = m[1] === "" ? null : m[1]!;
  }
  return { year, month };
}

// ── pdftotext extraction + segmentation ─────────────────────────────────────

function pdfToPages(pdfPath: string): string[] {
  const out = execFileSync(PDFTOTEXT, ["-layout", pdfPath, "-"], {
    maxBuffer: 64 * 1024 * 1024,
  }).toString("utf8");
  return out.split("\f").map((p) => p.replace(/\n$/, ""));
}

const NOISE = [
  /^\s*PMT\s*$/,
  /^\s*©\s*Pearson Education Ltd.*$/,
  /^\s*Pearson Edexcel Level 1\/Level 2.*$/,
];

function cleanLines(pageText: string, dropBareDigits = false): string[] {
  return pageText
    .split(/\r?\n/)
    .filter((l) => !NOISE.some((re) => re.test(l)))
    .filter((l) => !(dropBareDigits && /^\s*\d{1,3}\s*$/.test(l)));
}

interface QuestionBlock {
  qnum: number;
  marks: number | null;
  text: string;
  page: number;
}

const MS_TOTAL = /^\s*\(?\s*Total for Question\s+(\d{1,2})\s+is\s+(\d{1,2})\s+marks?\)?\s*\.?\s*$/;

/**
 * QP law (the totals-bounded block law): the unambiguous printed footer
 * "(Total for Question N is M marks)" ends every question — blocks are the
 * line ranges BETWEEN consecutive totals, sequence-guarded; block 1 loses
 * the cover/formula front matter (cut at the printed instruction line,
 * falling back to the first line-start "1" not followed by a digit). The
 * question start line is only searched for the CITATION PAGE; the block text
 * keeps the stem, answer lines and the total footer verbatim.
 */
function segmentQp(pages: string[]): QuestionBlock[] {
  const flat: Array<{ line: string; page: number }> = [];
  pages.forEach((pageText, pageIndex) => {
    for (const line of cleanLines(pageText, true)) flat.push({ line, page: pageIndex + 1 });
  });
  const totals: Array<{ qnum: number; marks: number; idx: number }> = [];
  flat.forEach((f, idx) => {
    const t = MS_TOTAL.exec(f.line);
    if (t) totals.push({ qnum: parseInt(t[1]!, 10), marks: parseInt(t[2]!, 10), idx });
  });
  if (totals.length === 0) return [];
  const FRONT_CUT = "You must write down all the stages in your working.";
  const blocks: QuestionBlock[] = [];
  let startIdx = 0;
  for (const total of totals) {
    if (total.qnum !== blocks.length + 1) continue; // stray/duplicate footer — skip
    let from = startIdx;
    if (total.qnum === 1) {
      for (let i = 0; i < total.idx; i++) {
        if (flat[i]!.line.includes(FRONT_CUT)) {
          from = i + 1;
          break;
        }
      }
      if (from === 0) {
        for (let i = 0; i < total.idx; i++) {
          if (/^\s*1\s+(?!\d)\S/.test(flat[i]!.line)) {
            from = i;
            break;
          }
        }
      }
    }
    const slice = flat.slice(from, total.idx + 1).filter((f) => f.line.trim() !== "");
    if (slice.length > 0) {
      blocks.push({
        qnum: total.qnum,
        marks: total.marks,
        text: slice.map((f) => f.line).join("\n"),
        page: slice[0]!.page,
      });
    }
    startIdx = total.idx + 1;
  }
  return blocks;
}

/**
 * MS law (the explicit-start grid law): question sections are bounded by the
 * grid's EXPLICIT question-number rows ("21   (a) ...", "22   x2 + ...", a
 * lone margin "9"), sequence-guarded so content digits never hijack the
 * identity; the "Total N marks" rows supply each question's marks (a
 * question with several total rows — the 1HR run-006 finding — keeps the
 * LAST, its own; the QP totals cross-check in the receipt flags residual
 * print discrepancies like 1H Q14). Block 1 opens at Q1's start row, so the
 * guidance pages and the table header fall away structurally.
 */
function segmentMs(pages: string[]): QuestionBlock[] {
  const flat: Array<{ line: string; page: number }> = [];
  pages.forEach((pageText, pageIndex) => {
    for (const line of cleanLines(pageText)) flat.push({ line, page: pageIndex + 1 });
  });
  const MS_ROW_TOTAL = /\bTotal\s+(\d{1,2})\s+marks?\s*$/;
  const START_ROW = /^\s{0,6}(\d{1,2})\*?(?:\s*\(|\s+\S|\s*$)/;
  const starts: Array<{ num: number; idx: number }> = [];
  flat.forEach((f, idx) => {
    const m = START_ROW.exec(f.line);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n === starts.length + 1) starts.push({ num: n, idx });
    }
  });
  if (starts.length === 0) return [];
  const totals: Array<{ marks: number; idx: number }> = [];
  flat.forEach((f, idx) => {
    const t = MS_ROW_TOTAL.exec(f.line);
    if (t) totals.push({ marks: parseInt(t[1]!, 10), idx });
  });
  // per-question marks: the LAST total row before the NEXT question's start
  const kept = new Map<number, { marks: number; idx: number }>();
  let ptr = 0;
  let lastNum = 0;
  for (const t of totals) {
    while (ptr < starts.length && starts[ptr]!.idx < t.idx) {
      lastNum = starts[ptr]!.num;
      ptr++;
    }
    if (lastNum > 0) kept.set(lastNum, t);
  }
  const blocks: QuestionBlock[] = [];
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]!.idx : flat.length;
    const t = kept.get(s.num);
    const slice = flat
      .slice(s.idx, t != null && t.idx < end ? t.idx + 1 : end)
      .filter((f) => f.line.trim() !== "");
    if (slice.length > 0) {
      blocks.push({
        qnum: s.num,
        marks: t?.marks ?? null,
        text: slice.map((f) => f.line).join("\n"),
        page: slice[0]!.page,
      });
    }
  });
  return blocks;
}

function firstSentence(text: string, cap = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const m = /^.{0,${cap}}?(?:[.?!]|\s(?=\()|$)/.exec(flat);
  const s = (m ? m[0] : flat).trim();
  return s.length === 0 ? flat.slice(0, cap) : s.slice(0, cap + 1);
}

// ── canonical builders ──────────────────────────────────────────────────────

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

interface PaperIdentity {
  unit: string;
  series: string;
  year: number;
  sessionLabel: string;
  monthName: string;
  paperCode: string;
}

function identityOf(session: string, unit: string): PaperIdentity {
  // session "2025-06" → month "06" → JUN / June
  const month = session.slice(5, 7);
  const series = SERIES_OF_MONTH[month];
  if (series == null) throw new Error(`no series mapping for session ${session}`);
  const monthName = MONTH_NAME[month]!;
  const year = parseInt(session.slice(0, 4), 10);
  return {
    unit,
    series,
    year,
    monthName,
    sessionLabel: `${monthName} ${year}`,
    paperCode: `${SUBJECT_CODE}/${unit}`,
  };
}

function retrievalMeta(id: PaperIdentity, subjectTitle: string, label: string) {
  return {
    subjectTitle,
    subjectCode: SUBJECT_CODE,
    series: id.series,
    year: id.year,
    paperCode: id.paperCode,
    label,
    unit: null,
    specCodes: null,
  };
}

function buildCanonicalDoc(params: {
  kind: DocumentKind;
  checksumHex: string;
  uri: string;
  mimeType: string;
  fileName: string | null;
  pageCount: number;
  blocks: Array<{ qnum: number; text: string; page: number }>;
  id: PaperIdentity;
  subjectTitle: string;
  label: string;
}): CanonicalDocument {
  const documentId = derivedDocumentId(params.checksumHex, ENGINE, ENGINE_VERSION);
  const textBlocks: CanonicalTextBlockElement[] = params.blocks.map((b, i) => ({
    element_id: `el-${i + 1}`,
    element_type: "text",
    page_number: b.page,
    bounding_box: null,
    text: b.text,
    reading_order: i + 1,
    confidence: null,
    source_engine: ENGINE,
    source_engine_version: ENGINE_VERSION,
    group_key: `q${b.qnum}`,
    role: null,
    heading_level: null,
  }));
  return {
    documentId,
    schemaVersion: "1.0",
    version: 1,
    source: {
      uri: params.uri,
      checksum: params.checksumHex,
      checksumAlgorithm: "SHA-256",
      mimeType: params.mimeType,
      fileName: params.fileName,
    },
    pageCount: params.pageCount,
    pages: Array.from({ length: params.pageCount }, (_, i) => ({
      pageNumber: i + 1,
      width: null,
      height: null,
    })),
    sections: null,
    textBlocks,
    tables: null,
    figures: null,
    equations: null,
    provenance: {
      engine: ENGINE,
      engineVersion: ENGINE_VERSION,
      extractedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      extractionParams: null,
      application: "t-mig-138-intake",
      schemaVersion: "1.0",
    },
    retrieval: retrievalMeta(params.id, params.subjectTitle, params.label),
  };
}

// ── per-paper pipeline ──────────────────────────────────────────────────────

interface PaperOutcome {
  dir: string;
  session: string;
  unit: string;
  status: "ingested" | "duplicate" | "skipped";
  reason?: string;
  qpChunks?: number;
  msChunks?: number;
  cardChunks?: number;
  qpQuestions?: number;
  msQuestions?: number;
  marksTotal?: number | null;
  marksMismatch?: number[];
  documentRowIds?: string[];
  examPaperRowId?: string | null;
}

async function processPaper(
  session: string,
  dir: string,
  sql: ReturnType<typeof createSql> | null,
  outcomes: PaperOutcome[],
): Promise<void> {
  const unitMatch = /^4MA1-(.+)$/.exec(dir);
  const unit = unitMatch ? unitMatch[1]! : null;
  const skip = (reason: string) => {
    outcomes.push({ dir, session, unit: unit ?? "?", status: "skipped", reason });
    console.log(`SKIP  ${session}/${dir}: ${reason}`);
  };
  if (unit == null) return skip("dir does not match 4MA1-<unit>");
  if (A.unit && unit !== A.unit) return skip("unit filter");

  const base = `${ARCHIVE_BASE}/past-papers/${session}/${dir}`;
  let manifestText: string;
  try {
    manifestText = (
      await fetchBytes(
        `https://raw.githubusercontent.com/${ARCHIVE_REPO}/${ARCHIVE_REF}/${base}/manifest.yaml`,
      )
    ).toString("utf8");
  } catch (e) {
    return skip(`manifest fetch failed: ${e}`);
  }
  const manifest = parseManifestYaml(manifestText);
  const series = seriesFields(manifestText);
  if (manifest.officialReference?.toUpperCase() !== `${SUBJECT_CODE}/${unit}`.toUpperCase()) {
    return skip(`official_reference mismatch: ${manifest.officialReference}`);
  }
  if (series.year == null || series.month == null || SERIES_OF_MONTH[series.month] == null) {
    return skip(`manifest series incomplete: year=${series.year} month=${series.month}`);
  }
  const qpMat = manifest.materials.find((m) => m.type === "question-paper");
  const msMat = manifest.materials.find((m) => m.type === "mark-scheme");
  if (qpMat == null || msMat == null) return skip("materials missing qp/ms");

  // download + checksum verify (fail-closed vs the manifest)
  const qpBytes = await fetchBytes(
    `https://raw.githubusercontent.com/${ARCHIVE_REPO}/${ARCHIVE_REF}/${base}/qp.pdf`,
  );
  const msBytes = await fetchBytes(
    `https://raw.githubusercontent.com/${ARCHIVE_REPO}/${ARCHIVE_REF}/${base}/ms.pdf`,
  );
  const qpSha = sha256Hex(qpBytes);
  const msSha = sha256Hex(msBytes);
  if (qpSha !== qpMat.sha256) return skip(`qp checksum mismatch ${qpSha} != ${qpMat.sha256}`);
  if (msSha !== msMat.sha256) return skip(`ms checksum mismatch ${msSha} != ${msMat.sha256}`);

  const id = identityOf(session, unit);
  const rawUri = `https://raw.githubusercontent.com/${ARCHIVE_REPO}/${ARCHIVE_REF}/${base}`;
  const tmpDir = `/tmp/t138/${session}-${dir}`;
  execFileSync("mkdir", ["-p", tmpDir]);
  const { writeFileSync: wf } = await import("node:fs");
  wf(`${tmpDir}/qp.pdf`, qpBytes);
  wf(`${tmpDir}/ms.pdf`, msBytes);
  const qpPages = pdfToPages(`${tmpDir}/qp.pdf`);
  const msPages = pdfToPages(`${tmpDir}/ms.pdf`);

  const qpQuestions = segmentQp(qpPages);
  const msQuestions = segmentMs(msPages);
  if (qpQuestions.length === 0) return skip("no QP questions segmented");
  if (msQuestions.length === 0) return skip("no MS questions segmented");

  const marksByQ = new Map(qpQuestions.map((b) => [b.qnum, b.marks]));
  const marksTotal = qpQuestions.reduce((acc, b) => acc + (b.marks ?? 0), 0);
  // the marks cross-check of record: the MS's own footer totals vs the QP's
  const marksMismatch = qpQuestions.filter(
    (b, i) => msQuestions[i] != null && b.marks != null && msQuestions[i]!.marks != null && b.marks !== msQuestions[i]!.marks,
  ).map((b) => b.qnum);

  // QP canonical: blocks joined across page splits (a question spanning pages
  // keeps one textBlock; page_number = its start page — the golden shape)
  const qpBlocks = qpQuestions.map((b) => ({
    qnum: b.qnum,
    page: b.page,
    text: b.text.replace(/\n{3,}/g, "\n\n").trim(),
  }));
  const msBlocks = msQuestions.map((b) => {
    // the QP's printed total is the exam's authority; the MS's own footer row
    // is the fallback (the 1F Q6 / 1H Q14 print discrepancies ride the receipt)
    const marks = marksByQ.get(b.qnum) ?? b.marks ?? null;
    const head =
      `Mark scheme for Question ${b.qnum}\n` +
      (marks != null ? `Question ${b.qnum} printed total: ${marks} marks\n` : "");
    return {
      qnum: b.qnum,
      page: b.page,
      text: `${head}${b.text.replace(/\n{3,}/g, "\n\n").trim()}`,
    };
  });
  // tail-phantom trim (the 2H finding): a trailing false start beyond the QP's
  // question count with no total row is post-paper furniture, never a question
  const qpCount = qpQuestions.length;
  const msTrimmed =
    msQuestions.length > qpCount
      ? msQuestions.filter((b) => b.qnum <= qpCount || b.marks != null)
      : msQuestions;
  // CARD synthesis: per-question marks + truncated stem, never answer-bearing
  const cardLines: string[] = [];
  const cardBlocks: Array<{ qnum: number; text: string; page: number }> = [];
  for (const q of qpQuestions) {
    const marks = marksByQ.get(q.qnum) ?? null;
    const stem = firstSentence(q.text);
    const text =
      `Q-Card | ${id.paperCode} | ${id.series === "JUN" ? "Jun" : id.series === "JAN" ? "Jan" : "Nov"} ${id.year} | ` +
      `Q${q.qnum} | marks: ${marks ?? "unknown"} | type: STRUCTURED | stem: ${stem}`;
    cardLines.push(text);
    cardBlocks.push({ qnum: q.qnum, page: 1, text });
  }
  const cardText = `${cardLines.join("\n")}\n`;
  const cardSha = sha256Hex(Buffer.from(cardText, "utf8"));

  const qpDoc = buildCanonicalDoc({
    kind: "QUESTION_PAPER",
    checksumHex: qpSha,
    uri: `${rawUri}/qp.pdf`,
    mimeType: "application/pdf",
    fileName: "qp.pdf",
    pageCount: qpPages.length,
    blocks: qpBlocks,
    id,
    subjectTitle: SUBJECT_TITLE_QP_MS,
    label: `Paper ${id.unit}`,
  });
  const msDoc = buildCanonicalDoc({
    kind: "MARK_SCHEME",
    checksumHex: msSha,
    uri: `${rawUri}/ms.pdf`,
    mimeType: "application/pdf",
    fileName: "ms.pdf",
    pageCount: msPages.length,
    blocks: msTrimmed.map((b) => ({ qnum: b.qnum, page: b.page, text: msBlocks.find((m) => m.qnum === b.qnum)!.text })),
    id,
    subjectTitle: SUBJECT_TITLE_QP_MS,
    label: `Paper ${id.unit}`,
  });
  const cardDoc = buildCanonicalDoc({
    kind: "EXTERNAL_QUESTIONS",
    checksumHex: cardSha,
    uri: `t-mig-138://qcard/${SUBJECT_CODE}/${id.paperCode}/${id.series}-${id.year}`,
    mimeType: "text/plain",
    fileName: `qcard-${SUBJECT_CODE}-${id.unit}-${id.series}-${id.year}.txt`,
    pageCount: 1,
    blocks: cardBlocks,
    id,
    subjectTitle: SUBJECT_TITLE_CARD,
    label: "Q-Card",
  });

  const qpPreview = chunkCanonicalDocument(qpDoc, "QUESTION_PAPER");
  const msPreview = chunkCanonicalDocument(msDoc, "MARK_SCHEME");
  const cardPreview = chunkCanonicalDocument(cardDoc, "EXTERNAL_QUESTIONS");

  if (MODE === "dry" || sql == null) {
    outcomes.push({
      dir,
      session,
      unit,
      status: "ingested",
      qpChunks: qpPreview.length,
      msChunks: msPreview.length,
      cardChunks: cardPreview.length,
      qpQuestions: qpQuestions.length,
      msQuestions: msTrimmed.length,
      marksTotal,
      marksMismatch,
    });
    console.log(
      `DRY   ${session}/${dir}: qp ${qpQuestions.length}Q/${qpPreview.length}c · ` +
        `ms ${msTrimmed.length}Q/${msPreview.length}c · card ${cardPreview.length}c · ` +
        `marks ${marksTotal}` +
        (marksMismatch.length > 0 ? ` · MARKS-MISMATCH ${JSON.stringify(marksMismatch)}` : ""),
    );
    return;
  }

  // APPLY: one transaction per paper — the frozen writer ×3 + the VALIDATED
  // intake decision + the exam_papers bank row.
  // The tranche-1 strict gate (the apply law of record): only papers with
  // aligned QP/MS question counts and an exact 100-mark total land — the
  // count/marks-divergent papers stay out (disclosed residuals, a later
  // pass revisits), keeping the landed corpus chemistry-clean.
  if (msTrimmed.length !== qpQuestions.length || marksTotal !== 100) {
    outcomes.push({
      dir,
      session,
      unit,
      status: "skipped",
      reason: `strict gate: qp ${qpQuestions.length}Q / ms ${msTrimmed.length}Q / marks ${marksTotal}`,
    });
    console.log(
      `GATE  ${session}/${dir}: qp ${qpQuestions.length} vs ms ${msTrimmed.length}, marks ${marksTotal} — withheld from tranche 1`,
    );
    return;
  }
  const result = await sql.transaction(async (tx) => {
    const qpIn = await ingestCanonicalDocument(
      tx as unknown as Parameters<typeof ingestCanonicalDocument>[0],
      qpDoc,
      JSON.stringify(qpDoc),
      "QUESTION_PAPER",
      null,
      new Date(),
    );
    const msIn = await ingestCanonicalDocument(
      tx as unknown as Parameters<typeof ingestCanonicalDocument>[0],
      msDoc,
      JSON.stringify(msDoc),
      "MARK_SCHEME",
      null,
      new Date(),
    );
    const cardIn = await ingestCanonicalDocument(
      tx as unknown as Parameters<typeof ingestCanonicalDocument>[0],
      cardDoc,
      JSON.stringify(cardDoc),
      "EXTERNAL_QUESTIONS",
      null,
      new Date(),
    );
    // the intake decision of record: the serving posture (chemistry parity)
    for (const rowId of [qpIn.id, msIn.id, cardIn.id]) {
      await tx`update documents set validation_state = 'VALIDATED' where id = ${rowId}::uuid`;
    }
    // the bank row (tier-1 anchor) — identity-guarded, idempotent
    const title = `${SUBJECT_CODE} Maths ${id.paperCode} ${id.sessionLabel}`;
    const existing = await tx`
      select id from exam_papers
      where paper_code = ${id.paperCode} and session_label = ${id.sessionLabel} limit 1`;
    let paperRowId: string | null = null;
    if (existing.length > 0) {
      paperRowId = String(existing[0]!.id);
      await tx`
        update exam_papers set
          question_paper_document_id = ${qpIn.documentId},
          mark_scheme_document_id = ${msIn.documentId},
          validation_state = 'VALIDATED'
        where id = ${paperRowId}::uuid`;
    } else {
      const subject = await tx`
        select id from subjects where code = ${SUBJECT_CODE} limit 1`;
      if (subject.length === 0) throw new Error(`subjects row ${SUBJECT_CODE} not found`);
      const inserted = await tx`
        insert into exam_papers (
          id, subject_id, title, board, qualification, unit, session_label,
          paper_code, question_paper_document_id, mark_scheme_document_id,
          validation_state, provenance, extraction_method, created_at, series, year
        ) values (
          ${crypto.randomUUID()}::uuid, ${subject[0]!.id}::uuid, ${title}, ${BOARD},
          ${QUALIFICATION}, ${id.unit}, ${id.sessionLabel}, ${id.paperCode},
          ${qpIn.documentId}, ${msIn.documentId},
          'VALIDATED', 'PAST_PAPER', 't-mig-138-pdftotext-intake-v1',
          ${new Date().toISOString()}, ${id.series}, ${id.year}
        ) returning id`;
      paperRowId = String(inserted[0]!.id);
    }
    return { qpIn, msIn, cardIn, paperRowId };
  });

  outcomes.push({
    dir,
    session,
    unit,
    status: "ingested",
    qpChunks: qpPreview.length,
    msChunks: msPreview.length,
    cardChunks: cardPreview.length,
    qpQuestions: qpQuestions.length,
    msQuestions: msTrimmed.length,
    marksTotal,
    marksMismatch,
    documentRowIds: [result.qpIn.id, result.msIn.id, result.cardIn.id],
    examPaperRowId: result.paperRowId,
  });
  console.log(
    `APPLY ${session}/${dir}: qp ${result.qpIn.chunks}c · ms ${result.msIn.chunks}c · ` +
      `card ${result.cardIn.chunks}c · paper row ${result.paperRowId}`,
  );
}

// ── main ────────────────────────────────────────────────────────────────────

async function listSessions(): Promise<string[]> {
  const tree = (await fetchJson(
    `https://api.github.com/repos/${ARCHIVE_REPO}/contents/${ARCHIVE_BASE}/past-papers?ref=${ARCHIVE_REF}`,
  )) as Array<{ name: string; type: string }>;
  if (!Array.isArray(tree)) throw new Error("session listing failed");
  return tree.filter((e) => e.type === "dir").map((e) => e.name).sort();
}

async function listPaperDirs(session: string): Promise<string[]> {
  const tree = (await fetchJson(
    `https://api.github.com/repos/${ARCHIVE_REPO}/contents/${ARCHIVE_BASE}/past-papers/${session}?ref=${ARCHIVE_REF}`,
  )) as Array<{ name: string; type: string }>;
  if (!Array.isArray(tree)) return [];
  return tree.filter((e) => e.type === "dir").map((e) => e.name).sort();
}

const outcomes: PaperOutcome[] = [];
const sessions = A.session
  ? A.session.split(",").map((s) => s.trim()).filter(Boolean)
  : await listSessions();
const limit = A.limit ? parseInt(A.limit, 10) : Number.MAX_SAFE_INTEGER;
let count = 0;

let sql: ReturnType<typeof createSql> | null = null;
if (MODE === "apply") {
  sql = createSql(readFileSync(DB_FILE, "utf8").trim());
}

for (const session of sessions) {
  if (count >= limit) break;
  const dirs = await listPaperDirs(session);
  for (const dir of dirs) {
    if (count >= limit) break;
    count++;
    try {
      await processPaper(session, dir, sql, outcomes);
    } catch (e) {
      outcomes.push({
        dir,
        session,
        unit: "?",
        status: "skipped",
        reason: `error: ${e}`,
      });
      console.log(`ERR   ${session}/${dir}: ${e}`);
    }
  }
}

const receipt = {
  lane: "T-MIG-138",
  band: "138a/138b",
  mode: MODE,
  archive: { repo: ARCHIVE_REPO, ref: ARCHIVE_REF, base: ARCHIVE_BASE },
  engine: { name: ENGINE, version: ENGINE_VERSION },
  filters: { session: A.session ?? null, unit: A.unit ?? null, limit: A.limit ?? null },
  papers: outcomes,
  totals: {
    attempted: count,
    ingested: outcomes.filter((o) => o.status === "ingested").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    qpChunks: outcomes.reduce((a, o) => a + (o.qpChunks ?? 0), 0),
    msChunks: outcomes.reduce((a, o) => a + (o.msChunks ?? 0), 0),
    cardChunks: outcomes.reduce((a, o) => a + (o.cardChunks ?? 0), 0),
    marksTotal: outcomes.reduce((a, o) => a + (o.marksTotal ?? 0), 0),
  },
  documentRowIds: outcomes.flatMap((o) => o.documentRowIds ?? []),
  finishedAt: new Date().toISOString(),
};
writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 1)}\n`);
console.log(
  `\nreceipt -> ${RECEIPT_PATH}\n` +
    `totals: ${JSON.stringify(receipt.totals)}`,
);
if (sql != null && typeof (sql as unknown as { end?: () => Promise<void> }).end === "function") {
  await (sql as unknown as { end: () => Promise<void> }).end();
}
