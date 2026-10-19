/**
 * T-MIG-133 band 133b (r0) — the book TOC derivation: the v3 Docling JSONL
 * rows → the canonical book-toc-v1 TOC (documents.canonical_json of
 * record) + the chapter aggregates (page ranges in BOTH numberings, the
 * LO box text) + the deterministic chunk-stream partition.
 *
 * Group law (the ChunkingService atom-boundary analogue for books): rows
 * with chapter_no != null group as `u<unit>:c<chapter>`; structural rows
 * (end-of-unit questions, answers, skills, dividers, front matter, glossary,
 * appendices, index) group as `u<unit>:x<slug>` with the slug derived from
 * the chapter_title (lowercase, non-alphanumeric → '-', trimmed). A group
 * change is a hard chunk boundary — no chunk ever crosses a chapter or a
 * structural group.
 *
 * Exclusion law of record (disclosed in the receipt): content_type index +
 * front_matter rows and the divider/chapter-map groups are NOT ingested
 * (page-number noise / book metadata / navigation noise — no tutor value,
 * no citation value). Everything else rides, including answers, glossary,
 * appendix, unit questions and the skills pages.
 */
import {
  bookTocCanonicalSchema,
  type BookChunk,
  type BookTocCanonical,
} from "@syllabai/contracts";

export function groupKeyOf(row: BookChunk): string {
  if (row.chapter_no != null) {
    return `u${row.unit_no ?? 0}:c${row.chapter_no}`;
  }
  const slug = row.chapter_title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `u${row.unit_no ?? 0}:x${slug}`;
}

/** The excluded content types (the disclosure law — counted, never silent). */
export const EXCLUDED_CONTENT_TYPES = ["index", "front_matter"] as const;

/** Groups whose whole title marks navigation/metadata noise (dividers and
 *  the front-matter block — the LO/join/chapter value is zero). */
export function isExcludedGroupTitle(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("divider and chapter map") || t.startsWith("front matter") || t === "divider";
}

export interface ChapterAgg {
  chapterKey: string;
  unitIndex: number;
  unitTitle: string;
  chapterIndex: number;
  title: string;
  bookPages: [number, number] | null;
  pdfPages: [number, number];
  learningObjective: string | null;
  firstLoChunkId: string | null;
}

export interface TocBuild {
  toc: BookTocCanonical;
  chapters: ChapterAgg[];
  /** the chunk-stream rows (included only), JSONL order preserved. */
  included: BookChunk[];
  includedGroupKeys: Array<{ groupKey: string; rows: number }>;
  excluded: { byType: Record<string, number>; byGroup: Record<string, number> };
}

export interface TocMeta {
  /** the DERIVED documentId (P-6 mirror) — the TOC's bookId. */
  bookId: string;
  pdfSha256: string;
  pageCount: number;
  parseRef: string;
  /** the qualification line of record in the TOC canonical (band 133e
   *  parameterization — the 133b chemistry pilot rides the DEFAULT below,
   *  byte-identical; second subjects pass their own, e.g. "Pearson
   *  Edexcel International GCSE (9-1) Mathematics A"). */
  qualification?: string;
}

function pageSpan(values: Array<[number, number] | null>): [number, number] | null {
  const starts = values.filter((v) => v !== null).map((v) => v![0]);
  const ends = values.filter((v) => v !== null).map((v) => v![1]);
  if (starts.length === 0) return null;
  return [Math.min(...starts), Math.max(...ends)];
}

export function deriveToc(rows: BookChunk[], meta: TocMeta): TocBuild {
  const excludedByType: Record<string, number> = {};
  const excludedGroups = new Map<string, number>();
  const included: BookChunk[] = [];
  for (const row of rows) {
    const et = EXCLUDED_CONTENT_TYPES as readonly string[];
    if (et.includes(row.content_type)) {
      excludedByType[row.content_type] = (excludedByType[row.content_type] ?? 0) + 1;
      continue;
    }
    if (row.chapter_no == null && isExcludedGroupTitle(row.chapter_title)) {
      excludedGroups.set(row.chapter_title, (excludedGroups.get(row.chapter_title) ?? 0) + 1);
      continue;
    }
    included.push(row);
  }

  // chapter aggregates (only rows with a real chapter_no)
  const chapterRows = new Map<string, BookChunk[]>();
  for (const row of included) {
    if (row.chapter_no == null) continue;
    const key = groupKeyOf(row);
    const bucket = chapterRows.get(key);
    if (bucket === undefined) chapterRows.set(key, [row]);
    else bucket.push(row);
  }
  const chapters: ChapterAgg[] = [...chapterRows.entries()]
    .map(([key, bucket]) => {
      const first = bucket[0]!;
      const loChunks = bucket
        .filter((r) => r.content_type === "learning_objectives")
        .sort((a, b) => a.pdf_pages[0] - b.pdf_pages[0] || a.id.localeCompare(b.id));
      const loText =
        loChunks.length === 0
          ? null
          : loChunks
              .map((r) => r.text)
              .join("\n\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
      return {
        chapterKey: key,
        unitIndex: first.unit_no as number,
        unitTitle: first.unit_name ?? "",
        chapterIndex: first.chapter_no as number,
        title: first.chapter_title.trim(),
        bookPages: pageSpan(bucket.map((r) => r.book_pages)),
        pdfPages: pageSpan(bucket.map((r) => r.pdf_pages)) as [number, number],
        learningObjective: loText === "" ? null : loText,
        firstLoChunkId: loChunks.length > 0 ? loChunks[0]!.id : null,
      };
    })
    .sort(
      (a, b) =>
        a.unitIndex - b.unitIndex ||
        a.chapterIndex - b.chapterIndex,
    );

  // units from the chapter aggregates
  const unitMap = new Map<number, { title: string; chapters: BookTocCanonical["units"][number]["chapters"] }>();
  for (const ch of chapters) {
    const u = unitMap.get(ch.unitIndex);
    const entry = {
      key: ch.chapterKey,
      index: ch.chapterIndex,
      title: ch.title,
      bookPages: ch.bookPages,
      pdfPages: ch.pdfPages,
      learningObjective: ch.learningObjective,
    };
    if (u === undefined) unitMap.set(ch.unitIndex, { title: ch.unitTitle, chapters: [entry] });
    else u.chapters.push(entry);
  }
  const toc: BookTocCanonical = bookTocCanonicalSchema.parse({
    schemaVersion: "book-toc-v1",
    bookId: meta.bookId,
    title: rows[0]?.book_title ?? "",
    author: rows[0]?.author ?? "",
    qualification: meta.qualification ?? "Pearson Edexcel International GCSE (9-1) Chemistry",
    pdfSha256: meta.pdfSha256,
    pageCount: meta.pageCount,
    parseRef: meta.parseRef,
    units: [...unitMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, u]) => ({ index, title: u.title, chapters: u.chapters })),
  });

  // the chunk-stream partition (included rows, JSONL order)
  const groupCounts = new Map<string, number>();
  for (const row of included) {
    const g = groupKeyOf(row);
    groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
  }
  return {
    toc,
    chapters,
    included,
    includedGroupKeys: [...groupCounts.entries()].map(([groupKey, rows]) => ({ groupKey, rows })),
    excluded: {
      byType: excludedByType,
      byGroup: Object.fromEntries(excludedGroups.entries()),
    },
  };
}
