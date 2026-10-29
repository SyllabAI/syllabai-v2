/**
 * Past Papers — real provenance, honestly partial.
 *
 * Task 22 research finding: question parts across most bundles carry
 * `sourcePaper` (date + paper number + question number) — e.g.
 * "June 2021 · WCH11/01". That is genuine past-paper provenance from the
 * corpus, so we can offer a real Past Papers archive: group the questions
 * we hold by the paper they came from and play them back in question order.
 *
 * Honesty rules (non-negotiable):
 *   - A paper page is a PARTIAL RECONSTRUCTION — the questions the corpus
 *     holds from that paper, never the full official paper. Every surface
 *     says so.
 *   - No invented metadata: papers exist only where sourcePaper attests
 *     them; courses without provenance get an honest empty state (and the
 *     deterministic practice papers as an alternative).
 *   - Marks shown are the corpus items' marks, not official grade-boundary
 *     totals.
 */
import type { ExamQuestion } from "@/lib/contracts";

export interface PastPaper {
  /** stable slug, e.g. "june-2021-wch11-01" (dateSlug-numberSlug) */
  key: string;
  /** original corpus date string, e.g. "June 2021", "Oct/Nov 2020", "Specimen" */
  date: string;
  /** original paper reference, e.g. "WCH11/01" */
  number: string;
  questions: ExamQuestion[];
  /** original paper question number per entry (aligned with `questions`);
   * null when the provenance didn't carry one. Drives coverage math. */
  questionNumbers: Array<number | null>;
  totalMarks: number;
}

export interface QuestionBankLike {
  questions: ExamQuestion[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Descending sort key: newest session first; undated ("Specimen") last. */
function dateSortKey(date: string): number {
  const year = date.match(/\d{4}/)?.[0];
  if (!year) return 0;
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const lower = date.toLowerCase();
  let month = 0;
  months.forEach((m, i) => {
    if (lower.includes(m)) month = Math.max(month, i + 1);
  });
  return Number(year) * 12 + month;
}

function paperMeta(q: ExamQuestion): { date: string; number: string; questionNumber: number } | null {
  for (const part of q.parts) {
    const sp = part.sourcePaper;
    if (sp && (sp.date || sp.number)) {
      return {
        date: sp.date || "Unknown session",
        number: sp.number || "Unknown paper",
        questionNumber: sp.questionNumber ?? Number.POSITIVE_INFINITY,
      };
    }
  }
  return null;
}

/** Group the course's question banks into real past papers (by date + paper number). */
export function collectPastPapers(banks: QuestionBankLike[]): PastPaper[] {
  const byKey = new Map<
    string,
    { date: string; number: string; items: Array<{ q: ExamQuestion; qn: number }> }
  >();

  for (const bank of banks) {
    for (const q of bank.questions) {
      const meta = paperMeta(q);
      if (!meta) continue;
      const key = `${slugify(meta.date)}-${slugify(meta.number)}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { date: meta.date, number: meta.number, items: [] };
        byKey.set(key, entry);
      }
      entry.items.push({ q, qn: meta.questionNumber });
    }
  }

  const papers: PastPaper[] = [...byKey.entries()].map(([key, e]) => {
    // original paper order: by question number, then corpus order as tiebreak
    const ordered = e.items
      .map((i, idx) => ({ ...i, idx }))
      .sort((a, b) => (a.qn - b.qn) || (a.idx - b.idx));
    const questions = ordered.map((i) => i.q);
    return {
      key,
      date: e.date,
      number: e.number,
      questions,
      questionNumbers: ordered.map((i) => (Number.isFinite(i.qn) && i.qn > 0 ? i.qn : null)),
      totalMarks: questions.reduce((a, q) => a + (q.totalMarks || 0), 0),
    };
  });

  return papers.sort(
    (a, b) => dateSortKey(b.date) - dateSortKey(a.date) || a.number.localeCompare(b.number),
  );
}

/**
 * Paper keys (dateSlug-numberSlug) attested by the given banks. The official
 * ADR-037 plane is the source of record: wherever it reconstructs a paper,
 * that paper is fully held there (the exporter passes the SME content through
 * byte-identically into the official bundle).
 */
export function officialCoveredKeys(banks: QuestionBankLike[]): Set<string> {
  const covered = new Set<string>();
  for (const bank of banks) {
    for (const q of bank.questions) {
      const meta = paperMeta(q);
      if (meta) covered.add(`${slugify(meta.date)}-${slugify(meta.number)}`);
    }
  }
  return covered;
}

/**
 * Drop SME questions whose sourcePaper key is covered by the official plane.
 * Per PAPER KEY, not per question: mixing the partial SME provenance into a
 * complete official reconstruction concatenated both planes' copies of every
 * question (maths-B: 63 collided keys × 2 = every question twice on the
 * player, s-serve-1 dup report). Chemistry never hit this only because its
 * SME sourcePaper refs never collide with its official keys. Questions with
 * no sourcePaper can't collide and are kept (they never reach the grouping
 * anyway); SME-only paper keys (e.g. maths-B May 2020) survive untouched.
 */
export function dropOfficialCoveredSme(
  covered: Set<string>,
  banks: QuestionBankLike[],
): QuestionBankLike[] {
  if (covered.size === 0) return banks;
  return banks.map((bank) => ({
    ...bank,
    questions: bank.questions.filter((q) => {
      const meta = paperMeta(q);
      return !meta || !covered.has(`${slugify(meta.date)}-${slugify(meta.number)}`);
    }),
  }));
}

/**
 * collectPastPapers over the two planes with official precedence: the
 * official banks first, and the SME banks filtered down to papers the
 * official plane does NOT cover. All past-paper surfaces (rail + player)
 * must build their reconstructions through this — calling collectPastPapers
 * directly on the raw concatenation re-introduces the doubled questions.
 */
export function collectPastPapersTwoPlane(
  official: QuestionBankLike[],
  sme: QuestionBankLike[],
): PastPaper[] {
  return collectPastPapers([
    ...official,
    ...dropOfficialCoveredSme(officialCoveredKeys(official), sme),
  ]);
}

export function hasPastPapers(banks: QuestionBankLike[]): boolean {
  return banks.some((b) => b.questions.some((q) => q.parts.some((p) => p.sourcePaper?.date || p.sourcePaper?.number)));
}

export function findPastPaper(papers: PastPaper[], key: string): PastPaper | null {
  return papers.find((p) => p.key === key) ?? null;
}

/** Human meta line, mirroring the topic-page estimate convention. */
export function paperEstTime(totalMarks: number): string {
  if (totalMarks >= 80) {
    const hours = Math.round(totalMarks / 60);
    return `≈ ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `≈ ${totalMarks} min`;
}
