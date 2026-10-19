/**
 * Past Papers shared helpers — CLIENT-SAFE (no corpus index import).
 *
 * The full corpus index (src/data/pastpapers-index.json, ~285 KB) must stay
 * server-side: it feeds server components only. Anything a client component
 * needs — types, raw URL construction, labels — lives here so the index is
 * never bundled for the browser.
 */

// ── index shapes ───────────────────────────────────────────────────────────
export interface CorpusPaper {
  /** paper dir name, e.g. "4CH1-1C", "WMA11-01A" */
  d: string;
  /** material byte sizes (load hints) */
  qp?: number;
  ms?: number;
  er?: number;
  /** non-canonical pdf extras: [filename, bytes] */
  x?: Array<[string, number]>;
}

export interface CorpusSession {
  id: string;
  papers: CorpusPaper[];
}

export interface CorpusSpec {
  board: string;
  qual: string;
  subject: string;
  spec: string;
  sessions: CorpusSession[];
}

export interface CorpusIndexMeta {
  generatedAt: string;
  source: string;
  treeSha: string;
  note: string;
}

/** Flattened paper entry (what pages/components consume). */
export interface CorpusPaperEntry {
  /** index key, e.g. "pearson-edexcel/international-gcse/chemistry/4ch1" */
  specKey: string;
  specTitle: string;
  qual: string;
  sessionId: string;
  dir: string;
  /** official unit code, e.g. "4CH1" / "WCH11" */
  unit: string;
  /** paper variant part, e.g. "1C" / "01A" */
  variant: string;
  /** official reference "4CH1/1C" */
  ref: string;
  /** human title, e.g. "Paper 1C" / "Unit 1" */
  title: string;
  /** "Legacy spec" chip for retired-spec papers surfaced in the same archive */
  specBadge: string | null;
  /** "Timezone R" / "Variant A" chip, when applicable */
  variantChip: string | null;
  qpBytes?: number;
  msBytes?: number;
  erBytes?: number;
  /** attested official duration in minutes, or null (editable estimate) */
  durationMin: number | null;
  /** CIE papers only (G1): the official component number (the tens digit of
   *  the two-digit component code — "9701-S25-QP-12" → 1). Courses filter on
   *  it (the 9709 component banks, the 0580 core/extended tiers); null on
   *  Pearson rows where no such filter exists. */
  component: number | null;
  qpPath: string;
  msPath: string;
  /** corpus-relative examiner-report path; "" when not held */
  erPath?: string;
}

// ── pure helpers ───────────────────────────────────────────────────────────
export const PASTPAPERS_REPO = "SyllabAI/syllabai-pastpapers";

/**
 * T-MIG-133 band 133c — the Student Books archive lives on the
 * syllabai-resources repo under the corpus-pdf grammar books/<specKey>/
 * (band-133c archive-upload receipt: student-book.pdf + ocr_pages/ +
 * docling_pages/). Same append-only archive law as the past-papers corpus;
 * a different repo, so the /api/corpus-pdf proxy dispatches by root segment.
 */
export const BOOKS_REPO = "SyllabAI/syllabai-resources";

/** Public raw URL for any books-archive-relative path. */
export function booksRawUrl(booksPath: string): string {
  return `https://raw.githubusercontent.com/${BOOKS_REPO}/main/${booksPath}`;
}

/** Public raw URL for any corpus-relative path. */
export function corpusRawUrl(corpusPath: string): string {
  return `https://raw.githubusercontent.com/${PASTPAPERS_REPO}/main/${corpusPath}`;
}

/**
 * T-MIG-128: same-origin delivery for the viewer PANE — streams through
 * /api/corpus-pdf, which adds immutable browser + CDN caching on top of the
 * archive (raw.githubusercontent only grants max-age=300, so every re-open
 * after five minutes used to re-download). "Open raw PDF" links keep
 * corpusRawUrl — the proxy is for viewing, the raw origin stays the
 * download escape hatch and the pane's honest one-shot fallback.
 */
export function corpusViewerUrl(corpusPath: string): string {
  return `/api/corpus-pdf/${corpusPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function corpusRawPath(specKey: string, sessionId: string, dir: string, file: string): string {
  // specKeys omit the corpus repo's "past-papers/" root — raw paths need it
  const infix = sessionId === "specimen" ? "specimen" : `past-papers/${sessionId}`;
  return `past-papers/${specKey}/${infix}/${dir}/${file}`;
}

/** "2021-06" → "June 2021"; "specimen" → "Specimen". */
export function sessionLabel(id: string): string {
  if (id === "specimen") return "Specimen";
  const m = id.match(/^(\d{4})-(\d{2})$/);
  if (!m) return id;
  const months = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[Number(m[2])] ?? m[2]} ${m[1]}`;
}

export function sessionRankOf(id: string): number {
  if (id === "specimen") return -1;
  const m = id.match(/^(\d{4})-(\d{2})$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : -2;
}

/** IAL unit display names (WMA11 → "Pure 1", WCH11 → "Unit 1", …). */
export const IAL_UNIT_TITLES: Record<string, string> = {
  WMA11: "Pure 1", WMA12: "Pure 2", WMA13: "Pure 3", WMA14: "Pure 4",
  WME01: "Mechanics 1", WME02: "Mechanics 2", WME03: "Mechanics 3",
  WST01: "Statistics 1", WST02: "Statistics 2", WST03: "Statistics 3",
  WDM11: "Decision 1",
  WFM01: "Further Pure 1", WFM02: "Further Pure 2", WFM03: "Further Pure 3",
};

export function ialUnitTitle(unit: string): string {
  return IAL_UNIT_TITLES[unit] ?? `Unit ${unit.slice(-1)}`;
}

/**
 * CIE paper-dir grammar (G1, CIE-INTEGRATION course-catalog card):
 * "<4-digit syllabus>-[SWM]<yy>-QP-<nn>" — e.g. "9701-S25-QP-11" (May/June
 * 2025, Paper 1 variant 1), "9709-W19-QP-71" (the legacy component 7).
 * Every dir in the six indexed CIE specs matches this (census run-001,
 * zero parse hazards). null when the dir is not a CIE QP dir.
 */
export const CIE_DIR_RE = /^(\d{4})-([SWM]\d{2})-QP-(\d{2})$/;

export function parseCieDir(dir: string): { syllabus: string; session: string; component: string } | null {
  const m = dir.match(CIE_DIR_RE);
  if (!m) return null;
  return { syllabus: m[1], session: m[2], component: m[3] };
}

/**
 * Cover-verified CIE component → paper-name map (G1). Keys are
 * "<syllabus>/<component tens digit>"; values are the paper names as printed
 * on the QP covers (verified from the corpus PDFs — see the Task-62 receipt;
 * components NOT in the map render the plain "Paper <n>" title, never an
 * assumed name). Session-dependent names (0580) are excluded by design.
 */
export const CIE_PAPER_TITLES: Record<string, string> = {
  "9701/1": "Multiple Choice",
  "9701/2": "AS Level Structured Questions",
  "9701/3": "Advanced Practical Skills",
  "9701/4": "A Level Structured Questions",
  "9701/5": "Planning, Analysis and Evaluation",
  "9702/1": "Multiple Choice",
  "9702/2": "AS Level Structured Questions",
  "9702/3": "Advanced Practical Skills",
  "9702/4": "A Level Structured Questions",
  "9702/5": "Planning, Analysis and Evaluation",
  "9709/1": "Pure Mathematics 1",
  "9709/2": "Pure Mathematics 2",
  "9709/3": "Pure Mathematics 3",
  "9709/4": "Mechanics",
  "9709/5": "Probability & Statistics 1",
  "9709/6": "Probability & Statistics 2",
  "9709/7": "Probability & Statistics 2 (S2)",
  "0620/1": "Multiple Choice (Core)",
  "0620/2": "Multiple Choice (Extended)",
  "0620/3": "Theory (Core)",
  "0620/4": "Theory (Extended)",
  "0620/5": "Practical Test",
  "0620/6": "Alternative to Practical",
  "0625/1": "Multiple Choice (Core)",
  "0625/2": "Multiple Choice (Extended)",
  "0625/3": "Theory (Core)",
  "0625/4": "Theory (Extended)",
  "0625/5": "Practical Test",
  "0625/6": "Alternative to Practical",
  // 0580 deliberately NOT in the map: the covers' paper titles changed across
  // the archive (2019 "Paper 1 (Core)" vs 2025 "Paper 1 Non-calculator
  // (Core)"), so no single per-tens name is truthful for every row — the
  // plain "Paper <n>" title renders, and the tier lives in the course
  // identity (cie-igcse-maths-25-core / -extended).
};

export function specTitle(spec: CorpusSpec): string {
  const qual =
    spec.qual === "international-gcse" || spec.qual === "igcse"
      ? "IGCSE"
      : spec.qual === "international-a-level" || spec.qual === "ial"
        ? "IAL"
        : spec.qual;
  return `${qual} ${spec.subject} ${spec.spec.toUpperCase()}`;
}

/** Group papers by session for the SME-style year sections (input sorted). */
export function groupBySession(papers: CorpusPaperEntry[]): Array<[string, CorpusPaperEntry[]]> {
  const bySession = new Map<string, CorpusPaperEntry[]>();
  for (const p of papers) {
    bySession.set(p.sessionId, [...(bySession.get(p.sessionId) ?? []), p]);
  }
  return [...bySession.entries()];
}

/** "0.7 MB" load hint from bytes. */
export function prettyBytes(n: number | undefined): string {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
