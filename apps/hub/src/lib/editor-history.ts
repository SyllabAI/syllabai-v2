import "server-only";

/**
 * Editor edit-history — ADR-044 Phase 1, the read-only per-question
 * edit-history view of record (ADR §10: "the read-only per-question
 * edit-history view — nearly free, because the corpus is git: surface
 * commit/blame for the bank path in the hub and editors gain provenance
 * before they gain pens").
 *
 * READ-ONLY by construction: this module never writes anywhere — no corpus
 * byte, no DB row, no proposal. It reads the corpus of record
 * (SyllabAI/syllabai-resources, a PUBLIC repo) through the GitHub REST API
 * and shapes it for the hub's history panel (the server route handler is
 * the only production caller; it capability-gates the caller first — the
 * route-gating layer of ADR §5).
 *
 * The three pure laws of record (pinned in editor-history.test.ts):
 *
 *  1. BANK PATH LAW (corpusBankPathOfRecord) — the corpus file a served
 *     question belongs to:
 *       - official banks (schema syllabai.official-paper-questions/0.1):
 *         the corpus directory rides the set's source.pageUrl (a
 *         github.com/SyllabAI/syllabai-resources/tree/<ref>/<dir> URL of
 *         record, stamped by the conversion waves); the bank file is
 *         <dir>/questions.md.
 *       - SME banks (schema syllabai.sme-exam-questions/1.1): the
 *         structural law verified across the corpus families (4CH1 and
 *         the CIE slices): SME-ExamQuestion/<course>/<sectionSlug>/
 *         <topicSlug>/questions.md.
 *       - an unknown schema tries both laws (pageUrl first, then
 *         structural); nothing resolvable → null (honest 404 upstream).
 *
 *  2. ANCHOR LAW (questionAnchorRegion) — the question's region in the
 *     bank file is found BY CONTENT, never by ordinal: the hub question's
 *     part stems are whitespace-normalized and located in the
 *     whitespace-normalized file (verified 100% on the states-of-matter
 *     set); the enclosing corpus heading region (SME "## Q<n> — …" /
 *     official "## Question <n> (…)") is the attribution unit. The
 *     ordinal mapping is NOT used — hub ordering and corpus ordering were
 *     observed to diverge (the Q2-1-mark counter-example), so a content
 *     anchor is the only honest attribution. Not found → "unavailable"
 *     (path-level history still renders, disclosed).
 *
 *  3. HUNK LAW (parsePatchHunks / hunksTouchRegion) — a commit touches
 *     the question iff one of its unified-diff hunks' NEW line range
 *     intersects the anchor region. GitHub OMITS the patch for whole-file
 *     events (added / removed / renamed / truncation-class diffs) — for
 *     those the commit honestly counts as touched with patchUnavailable=
 *     true (a whole-file event touches every region by construction; a
 *     truncated modified diff cannot rule the region out — both are
 *     disclosed, never silently "other region"). A commit with NO entry
 *     for the bank path is the only clean touched=false.
 *
 * The GitHub I/O is unauthenticated by default (public repo); a server-side
 * GITHUB_TOKEN / GH_TOKEN (optional env, never NEXT_PUBLIC) raises the rate
 * ceiling. Responses cache via the Next fetch cache (revalidate 300s).
 */

const RESOURCES_REPO = "SyllabAI/syllabai-resources";
const RAW_BASE = `https://raw.githubusercontent.com/${RESOURCES_REPO}/main`;
const API_BASE = `https://api.github.com/repos/${RESOURCES_REPO}`;
/** Commit detail fan-out cap (the REST calls per history build). */
export const BANK_HISTORY_COMMIT_CAP = 10;
const CACHE_REVALIDATE_S = 300;

// ── law 1: the bank path ─────────────────────────────────────────────────────

export interface BankPathOfRecord {
  path: string;
  kind: "sme" | "official";
}

export interface BankSetRef {
  schema?: string | null;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  source?: { pageUrl?: string | null } | null;
}

const RESOURCES_TREE_RE =
  /^https:\/\/github\.com\/SyllabAI\/syllabai-resources\/tree\/[^/]+\/(.+?)\/?$/;

function officialFromPageUrl(pageUrl: string | null | undefined): BankPathOfRecord | null {
  if (!pageUrl) return null;
  const m = pageUrl.match(RESOURCES_TREE_RE);
  if (!m || !m[1]) return null;
  return { path: `${m[1]}/questions.md`, kind: "official" };
}

function smeStructural(course: string, set: BankSetRef): BankPathOfRecord | null {
  if (!set.sectionSlug || !set.topicSlug) return null;
  return {
    path: `SME-ExamQuestion/${course}/${set.sectionSlug}/${set.topicSlug}/questions.md`,
    kind: "sme",
  };
}

export function corpusBankPathOfRecord(course: string, set: BankSetRef): BankPathOfRecord | null {
  const schema = set.schema ?? "";
  if (schema === "syllabai.official-paper-questions/0.1") {
    return officialFromPageUrl(set.source?.pageUrl);
  }
  if (schema === "syllabai.sme-exam-questions/1.1") {
    return smeStructural(course, set);
  }
  return officialFromPageUrl(set.source?.pageUrl) ?? smeStructural(course, set);
}

// ── law 2: the content anchor ────────────────────────────────────────────────

export interface AnchorLineMap {
  text: string;
  spans: Array<{ start: number; end: number; line: number }>;
}

export function normalizeForAnchor(file: string): AnchorLineMap {
  const spans: Array<{ start: number; end: number; line: number }> = [];
  let text = "";
  const lines = file.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const n = lines[i].replace(/\s+/g, " ").trim().toLowerCase();
    if (!n) continue;
    if (text) text += " ";
    spans.push({ start: text.length, end: text.length + n.length, line: i });
    text += n;
  }
  return { text, spans };
}

export function lineOfOffset(map: AnchorLineMap, offset: number): number {
  for (const s of map.spans) {
    if (offset >= s.start && offset < s.end) return s.line;
  }
  return -1;
}

export interface AnchorRegion {
  heading: string;
  /** 0-based inclusive */
  start: number;
  /** 0-based exclusive */
  end: number;
}

/** Both corpus heading forms of record: SME "## Q<n>" / official "## Question <n>". */
const CORPUS_Q_HEADING_RE = /^## (?:Q\d+|Question \d+)/;

export function questionAnchorRegion(
  fileLines: string[],
  anchorLine: number,
): AnchorRegion | null {
  if (anchorLine < 0 || anchorLine >= fileLines.length) return null;
  let start = -1;
  for (let i = Math.min(anchorLine, fileLines.length - 1); i >= 0; i--) {
    if (CORPUS_Q_HEADING_RE.test(fileLines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = fileLines.length;
  for (let i = start + 1; i < fileLines.length; i++) {
    if (CORPUS_Q_HEADING_RE.test(fileLines[i])) {
      end = i;
      break;
    }
  }
  return { heading: fileLines[start].trim(), start, end };
}

/** The part stems that anchor a question (whitespace-collapsed, lowercase). */
export function anchorStemsOfQuestion(
  q: { parts?: Array<{ problemMd?: string | null }> | null },
): string[] {
  const stems: string[] = [];
  for (const p of q.parts ?? []) {
    const raw = (p.problemMd ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (raw.length >= 24) stems.push(raw); // a usable anchor is distinctive
  }
  return stems;
}

/**
 * Locate the question's region by content: the first part stem found in
 * the normalized file wins (the part stems are verbatim corpus text per
 * the consume transforms). null → attribution "unavailable".
 */
export function findQuestionRegion(
  file: string,
  q: { id?: string; order?: number; parts?: Array<{ problemMd?: string | null }> | null },
): AnchorRegion | null {
  const map = normalizeForAnchor(file);
  const fileLines = file.split("\n");
  for (const stem of anchorStemsOfQuestion(q)) {
    const at = map.text.indexOf(stem);
    if (at < 0) continue;
    const line = lineOfOffset(map, at);
    if (line < 0) continue;
    return questionAnchorRegion(fileLines, line);
  }
  return null;
}

// ── law 3: the hunks ─────────────────────────────────────────────────────────

export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parsePatchHunks(patch: string): PatchHunk[] {
  const hunks: PatchHunk[] = [];
  for (const raw of patch.split("\n")) {
    const m = raw.match(HUNK_RE);
    if (!m) continue;
    hunks.push({
      oldStart: Number(m[1]),
      oldLines: m[2] !== undefined ? Number(m[2]) : 1,
      newStart: Number(m[3]),
      newLines: m[4] !== undefined ? Number(m[4]) : 1,
    });
  }
  return hunks;
}

/** Do the hunks' NEW ranges intersect the region ([start, end), 0-based)? */
export function hunksTouchRegion(hunks: PatchHunk[], start: number, end: number): boolean {
  if (end <= start) return false;
  return hunks.some((h) => {
    // a 0-length new range (+c,0) still points AT line c — treat as the
    // single line c-1→c boundary (insertion point), 0-based [c-1, c)
    const hStart = h.newLines === 0 ? h.newStart - 1 : h.newStart - 1;
    const hEnd = h.newLines === 0 ? h.newStart : h.newStart - 1 + h.newLines;
    return hStart < end && hEnd > start;
  });
}

// ── the GitHub I/O (the route handler is the only production caller) ─────────

export class BankHistoryError extends Error {
  constructor(
    public code: "rate_limited" | "not_found" | "github_unreachable",
    message: string,
  ) {
    super(message);
  }
}

function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "syllabai-hub-editor-history",
    // REST previews need no version header; the corpus API is stable v3
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghFetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: ghHeaders(),
      next: { revalidate: CACHE_REVALIDATE_S },
    });
  } catch {
    throw new BankHistoryError("github_unreachable", "GitHub REST fetch failed");
  }
  if (res.status === 403 || res.status === 429) {
    throw new BankHistoryError("rate_limited", "GitHub REST rate limit / forbidden");
  }
  if (res.status === 404) {
    throw new BankHistoryError("not_found", `not found: ${url}`);
  }
  if (!res.ok) {
    throw new BankHistoryError("github_unreachable", `GitHub REST status ${res.status}`);
  }
  return (await res.json()) as unknown;
}

async function fetchHeadFile(path: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${RAW_BASE}/${encodeURI(path)}`, {
      headers: { "User-Agent": "syllabai-hub-editor-history" },
      next: { revalidate: CACHE_REVALIDATE_S },
    });
  } catch {
    throw new BankHistoryError("github_unreachable", "raw fetch failed");
  }
  if (res.status === 404) throw new BankHistoryError("not_found", `corpus file not found: ${path}`);
  if (res.status === 403 || res.status === 429) {
    throw new BankHistoryError("rate_limited", "raw fetch rate-limited");
  }
  if (!res.ok) throw new BankHistoryError("github_unreachable", `raw fetch status ${res.status}`);
  return await res.text();
}

export interface GhCommitStub {
  sha: string;
  commit: {
    author?: { name?: string | null; date?: string | null } | null;
    message: string;
  };
  html_url?: string;
}

export async function listBankCommits(path: string): Promise<GhCommitStub[]> {
  const data = (await ghFetchJson(
    `${API_BASE}/commits?path=${encodeURIComponent(path)}&per_page=${BANK_HISTORY_COMMIT_CAP}`,
  )) as unknown;
  if (!Array.isArray(data)) {
    throw new BankHistoryError("github_unreachable", "unexpected commits payload");
  }
  return data as GhCommitStub[];
}

interface GhCommitDetail {
  files?: Array<{ filename?: string; status?: string; patch?: string }>;
  html_url?: string;
}

async function commitFileEntriesForBank(
  sha: string,
  path: string,
): Promise<Array<{ status: string; patch: string | null }>> {
  const data = (await ghFetchJson(`${API_BASE}/commits/${sha}`)) as GhCommitDetail;
  const entries: Array<{ status: string; patch: string | null }> = [];
  for (const f of data.files ?? []) {
    if (f.filename !== path) continue;
    entries.push({
      status: f.status ?? "modified",
      patch: typeof f.patch === "string" ? f.patch : null,
    });
  }
  return entries;
}

// ── the payload shaping ──────────────────────────────────────────────────────

export interface BankCommit {
  sha: string;
  date: string | null;
  author: string | null;
  message: string;
  url: string;
  touched: boolean;
  /** true when the touch verdict came from a whole-file event (GitHub
   * omitted the patch — added/removed/renamed/truncated), not hunk math */
  patchUnavailable: boolean;
  /** the file-entry status of record when known ("added" | "modified" | ...) */
  fileStatus: string | null;
  hunks: Array<{ newStart: number; newLines: number }>;
}

export interface QuestionHistoryPayload {
  course: string;
  questionId: string;
  questionOrder: number;
  bank: BankPathOfRecord;
  /** "anchored": the region law found the question; "unavailable": path-level history only */
  attribution: "anchored" | "unavailable";
  anchor: { heading: string; startLine: number; endLine: number } | null;
  commits: BankCommit[];
  disclosure: string;
}

export async function buildQuestionHistory(
  course: string,
  set: BankSetRef,
  q: { id: string; order: number; parts?: Array<{ problemMd?: string | null }> | null },
): Promise<QuestionHistoryPayload> {
  const bank = corpusBankPathOfRecord(course, set);
  if (!bank) {
    throw new BankHistoryError("not_found", "no corpus bank path of record for this set");
  }
  const [commitsStub, headFile] = await Promise.all([listBankCommits(bank.path), fetchHeadFile(bank.path)]);
  const region = findQuestionRegion(headFile, q);
  const fileLines = headFile.split("\n");

  const commits: BankCommit[] = [];
  for (const stub of commitsStub) {
    let touched = false;
    let patchUnavailable = false;
    let fileStatus: string | null = null;
    let hunks: Array<{ newStart: number; newLines: number }> = [];
    if (region) {
      const entries = await commitFileEntriesForBank(stub.sha, bank.path);
      if (entries.length > 0) {
        fileStatus = entries[0].status;
        const patched = entries.filter((e) => e.patch !== null);
        if (patched.length === 0) {
          // whole-file event (added/removed/renamed) or a truncated diff —
          // the region cannot be ruled out: honest touch + disclosure
          touched = true;
          patchUnavailable = true;
        } else {
          const parsed = patched.flatMap((e) => parsePatchHunks(e.patch!));
          touched = hunksTouchRegion(parsed, region.start, region.end);
          hunks = touched
            ? parsed
                .filter((h) => hunksTouchRegion([h], region.start, region.end))
                .map((h) => ({ newStart: h.newStart, newLines: h.newLines }))
            : [];
        }
      }
    }
    commits.push({
      sha: stub.sha,
      date: stub.commit.author?.date ?? null,
      author: stub.commit.author?.name ?? null,
      message: stub.commit.message.split("\n")[0] ?? "",
      url: stub.html_url ?? `https://github.com/${RESOURCES_REPO}/commit/${stub.sha}`,
      touched,
      patchUnavailable,
      fileStatus,
      hunks,
    });
  }

  return {
    course,
    questionId: q.id,
    questionOrder: q.order,
    bank,
    attribution: region ? "anchored" : "unavailable",
    anchor: region
      ? {
          heading: region.heading,
          startLine: region.start + 1, // 1-based for display
          endLine: Math.min(region.end, fileLines.length), // 1-based inclusive-ish (exclusive converted)
        }
      : null,
    commits,
    disclosure: region
      ? "Read-only provenance from the corpus of record (syllabai-resources git history). Attribution is content-anchored to the question's corpus region; a commit is marked when its diff touches that region."
      : "Read-only provenance from the corpus of record (syllabai-resources git history). The question's corpus region could not be content-anchored in the current file — the commit list is the bank-path history of record, not per-question attribution.",
  };
}

/** Set-level history (no per-question attribution) for the panel's header. */
export async function buildSetHistory(
  course: string,
  set: BankSetRef,
): Promise<{ bank: BankPathOfRecord; commits: BankCommit[] }> {
  const bank = corpusBankPathOfRecord(course, set);
  if (!bank) {
    throw new BankHistoryError("not_found", "no corpus bank path of record for this set");
  }
  const commitsStub = await listBankCommits(bank.path);
  return {
    bank,
    commits: commitsStub.map((stub) => ({
      sha: stub.sha,
      date: stub.commit.author?.date ?? null,
      author: stub.commit.author?.name ?? null,
      message: stub.commit.message.split("\n")[0] ?? "",
      url: stub.html_url ?? `https://github.com/${RESOURCES_REPO}/commit/${stub.sha}`,
      touched: false,
      patchUnavailable: false,
      fileStatus: null,
      hunks: [],
    })),
  };
}
