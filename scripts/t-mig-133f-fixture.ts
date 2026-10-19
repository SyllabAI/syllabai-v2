/**
 * T-MIG-133 band 133f (r7a) — the DRY-RUN fixture generator (the Maths A
 * readiness proof of record).
 *
 * Emits a SYNTHETIC v3 Docling JSONL + a minimal valid 3-page PDF under
 * the scratch dir. The fixture is book-stand-in BY DISCLOSURE (no book
 * text is reproduced — the T-MIG-131 x44 law keeps book bytes out of the
 * tree; the real Maths A package is operator-delivered, the tmpfiles
 * law). What the fixture proves is the DETERMINISTIC PIPELINE: the
 * 133b-derived multi-book driver (books-ingest.ts) runs the full
 * validate → TOC → LO-join → canonical → chunk stream against the REAL
 * pinned 4MA1 bundle spine — with LO bullets quoting REAL spec
 * statements pulled from the bundle at runtime (always in sync with the
 * pinned bytes).
 *
 * Deterministic: fixed ids, no clocks, no randomness; the two "real
 * statement" picks are FIRST-match rules over the bundle order of record
 * (1.1A = the first Foundation statement; the first Higher-tier
 * statement).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/repos/syllabai-v2";
const OUT = "/home/z/my-project/scratch/t-mig-133f-fixture";
const BUNDLE = join(ROOT, "apps/hub/content/igcse-maths-a-18-higher/curriculum.json");

interface BundleNode {
  code: string;
  family: string;
  title: string;
  applicability?: { tier?: string | null } | null;
}

const bundle = JSON.parse(readFileSync(BUNDLE, "utf8")) as {
  code: string;
  nodes: BundleNode[];
};

const spec = bundle.nodes.filter((n) => n.family === "SPEC_POINT");
const firstFoundation = spec.find((n) => (n.applicability?.tier ?? "") === "Foundation")!;
const firstHigher = spec.find((n) => (n.applicability?.tier ?? "") === "Higher")!;

/** Book-typographic capitalization of the LO box (the 133b fixture law). */
function bullet(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Row {
  id: string;
  book_title: string;
  author: string;
  unit_no: number | null;
  unit_name: string | null;
  chapter_no: number | null;
  chapter_title: string;
  section: string | null;
  content_type: string;
  book_pages: [number, number] | null;
  pdf_pages: [number, number];
  char_count: number;
  text: string;
}

const BOOK_TITLE = "Edexcel International GCSE (9-1) Mathematics A Student Book 2 (synthetic dry-run fixture)";
const AUTHOR = "Synthetic fixture author (band 133f)";
const UNIT = "Numbers and the number system";

function row(partial: Omit<Row, "book_title" | "author" | "char_count">): Row {
  return {
    book_title: BOOK_TITLE,
    author: AUTHOR,
    char_count: partial.text.length,
    ...partial,
  };
}

const rows: Row[] = [
  row({
    id: "fx_maths_0001", unit_no: null, unit_name: null, chapter_no: null,
    chapter_title: "Front matter (contents, about this book, assessment overview)",
    section: null, content_type: "front_matter", book_pages: null, pdf_pages: [1, 2],
    text: "Contents. This fixture front matter is EXCLUDED by the content-type law (counted, never silent).",
  }),
  row({
    id: "fx_maths_0002", unit_no: 1, unit_name: UNIT, chapter_no: null,
    chapter_title: "Unit 1 divider and chapter map", section: null, content_type: "divider",
    book_pages: null, pdf_pages: [3, 3],
    text: "Unit 1 divider. EXCLUDED by the group-title law.",
  }),
  row({
    id: "fx_maths_0010", unit_no: 1, unit_name: UNIT, chapter_no: 1, chapter_title: "Integers and place value",
    section: null, content_type: "learning_objectives", book_pages: [2, 2], pdf_pages: [14, 14],
    text: `LEARNING OBJECTIVES\n\n• ${bullet(firstFoundation.title)}\n\n• ${bullet(spec[1]!.title)}`,
  }),
  row({
    id: "fx_maths_0011", unit_no: 1, unit_name: UNIT, chapter_no: 1, chapter_title: "Integers and place value",
    section: null, content_type: "body", book_pages: [3, 4], pdf_pages: [15, 16],
    text: "Integers are whole numbers: positive, negative and zero. Place value decides what each digit of a number is worth. (SYNTHETIC body text — fixture only.)",
  }),
  row({
    id: "fx_maths_0012", unit_no: 1, unit_name: UNIT, chapter_no: 1, chapter_title: "Integers and place value",
    section: null, content_type: "key_point", book_pages: [4, 4], pdf_pages: [16, 16],
    text: "Key point: multiplying by 10 shifts each digit one place to the left. (SYNTHETIC — fixture only.)",
  }),
  row({
    id: "fx_maths_0020", unit_no: 1, unit_name: UNIT, chapter_no: 2, chapter_title: "Fractions and decimals",
    section: null, content_type: "learning_objectives", book_pages: [18, 18], pdf_pages: [30, 30],
    text: `LEARNING OBJECTIVES\n\n• ${bullet(firstHigher.title)}`,
  }),
  row({
    id: "fx_maths_0021", unit_no: 1, unit_name: UNIT, chapter_no: 2, chapter_title: "Fractions and decimals",
    section: null, content_type: "body", book_pages: [19, 20], pdf_pages: [31, 32],
    text: "Fractions name parts of wholes; decimals name them in tenths and hundredths. (SYNTHETIC — fixture only.)",
  }),
  row({
    id: "fx_maths_0022", unit_no: 1, unit_name: UNIT, chapter_no: 2, chapter_title: "Fractions and decimals",
    section: null, content_type: "exam_hint", book_pages: [20, 20], pdf_pages: [32, 32],
    text: "Exam hint: show every line of working — method marks survive arithmetic slips. (SYNTHETIC — fixture only.)",
  }),
  row({
    id: "fx_maths_0030", unit_no: 1, unit_name: UNIT, chapter_no: null,
    chapter_title: "Unit 1: end-of-unit questions", section: null, content_type: "unit_questions",
    book_pages: [114, 114], pdf_pages: [126, 126],
    text: "1 (a) Write down the place value of the digit 7 in 4.71. (SYNTHETIC — fixture only.)",
  }),
  row({
    id: "fx_maths_0040", unit_no: null, unit_name: null, chapter_no: null,
    chapter_title: "Glossary", section: null, content_type: "glossary", book_pages: [300, 300],
    pdf_pages: [330, 330], text: "Integer: a whole number. (SYNTHETIC — fixture only.)",
  }),
];

mkdirSync(OUT, { recursive: true });
const jsonlPath = join(OUT, "maths_a_dry_run_v3.jsonl");
writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

// ── a minimal VALID 3-page PDF (deterministic bytes; the driver reads the
//    bytes opaquely for the sha256 — the parse of record is the JSONL) ──────
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
];
let pdf = "%PDF-1.4\n";
const xref: number[] = [];
objects.forEach((body, i) => {
  xref.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefStart = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const off of xref) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefStart}\n%%EOF\n`;
const pdfPath = join(OUT, "maths_a_dry_run.pdf");
writeFileSync(pdfPath, pdf, "latin1");

console.log(
  JSON.stringify(
    {
      jsonl: jsonlPath,
      pdf: pdfPath,
      rows: rows.length,
      picks: {
        firstFoundation: { code: firstFoundation.code, tier: firstFoundation.applicability?.tier ?? null },
        secondStatement: { code: spec[1]!.code, tier: spec[1]!.applicability?.tier ?? null },
        firstHigher: { code: firstHigher.code, tier: firstHigher.applicability?.tier ?? null },
      },
    },
    null,
    1,
  ),
);
