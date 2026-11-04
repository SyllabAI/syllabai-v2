/**
 * T-TEACH-REPORTS-1 — the /teacher/reports export builders (teacher mode
 * plan Phase 3: "Reports & exports (per student, per class, term view)").
 *
 * Pure, dependency-free CSV composition over the two read-only class
 * intelligence views the page already loads (ClassOverviewView +
 * ClassLearnerRow[] via /api/v1/teacher/class/*) — zero new API surface,
 * zero server-side state: a report is a deterministic function of the same
 * wire shapes the Class insights page renders.
 *
 * Honesty laws carried over verbatim:
 *  - Evidence semantics stay separated; nulls mean unmeasured (the
 *    ClassLearnerRow contract) — a null mastery exports as an EMPTY cell,
 *    never 0, never "N/A": no fabricated values anywhere.
 *  - There is NO term entity in core yet — the export stamps the
 *    generatedAt ISO and the evidence window (recentActivity.windowStart)
 *    verbatim; term grouping is named as pending, not simulated.
 *  - RFC 4180 wire hygiene: a field is quoted iff it contains , " \r or \n
 *    (quotes doubled); rows join with CRLF; the document ends with a
 *    terminator so the last record is not silently truncated by readers.
 *  - Self-describing rows: root_code / generated_at / evidence_window ride
 *    as leading columns on every data row (the join-safe pattern) so a
 *    downloaded sheet stays attributable without side files.
 */
import type {
  ClassLearnerRow,
  ClassOverviewView,
  ClassTopicAggregate,
} from "@/lib/types";

export type CsvValue = string | number | null | undefined;

/** RFC 4180 field escaping: quote iff needed; double embedded quotes. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV record — fields escaped, joined with commas. */
export function csvRow(fields: CsvValue[]): string {
  return fields.map(csvField).join(",");
}

/** A full CSV document: CRLF records, CRLF-terminated. */
export function csvDocument(rows: string[]): string {
  return rows.join("\r\n") + "\r\n";
}

/** Mastery cell: raw 0–1 at two decimals (the Class insights rendering),
 *  empty when unmeasured — never a zero. */
export function formatMastery(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : value.toFixed(2);
}

/** Timestamp cell: the wire ISO verbatim (timezone-true), empty when null. */
export function formatIso(value: string | null | undefined): string {
  return value ?? "";
}

/** `yyyymmdd` stamp from an ISO instant (UTC) — filename-safe. */
export function dayStamp(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/** Lowercase filename-safe slug of the subject root code (e.g. "4CH1"). */
export function rootSlug(rootCode: string): string {
  return rootCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "class";
}

export interface ReportMeta {
  rootCode: string;
  generatedAt: string;
  evidenceWindowStart: string;
}

/** The three leading self-description columns, shared by both exports. */
const META_COLUMNS = ["root_code", "generated_at", "evidence_window_start"] as const;

function metaFields(meta: ReportMeta): CsvValue[] {
  return [meta.rootCode, meta.generatedAt, meta.evidenceWindowStart];
}

/** Weakest-topics cell: `CODE band 0.31 (n attempts)` joined with `; `. */
export function weakestTopicsCell(row: ClassLearnerRow): string {
  return row.weakestTopics
    .map((t) => `${t.code} ${t.band} ${t.mastery.toFixed(2)} (${t.attempts} attempts)`)
    .join("; ");
}

/** Active-misconception codes cell (counts live in the signals detail). */
export function misconceptionCodesCell(row: ClassLearnerRow): string {
  return row.misconceptionSignals.map((m) => m.code).join("; ");
}

const STUDENT_COLUMNS = [
  ...META_COLUMNS,
  "learner_id",
  "display_name",
  "created_at",
  "evidence_state",
  "topics_measured",
  "total_topics",
  "mean_mastery",
  "evidence_backed_attempts",
  "recent_attempts",
  "recent_correct",
  "last_activity_at",
  "tutor_engagements",
  "last_tutor_engagement_at",
  "due_reviews",
  "active_misconceptions",
  "misconception_codes",
  "weakest_topics",
] as const;

/** Per-student report table (the "per student" Phase-3 export). */
export function studentsCsv(
  overview: ClassOverviewView,
  learners: ClassLearnerRow[],
  generatedAt: string,
): string {
  const meta: ReportMeta = {
    rootCode: overview.rootCode,
    generatedAt,
    evidenceWindowStart: overview.recentActivity.windowStart,
  };
  const rows = [csvRow([...STUDENT_COLUMNS])];
  for (const l of learners) {
    rows.push(
      csvRow([
        ...metaFields(meta),
        l.learnerId,
        l.displayName,
        formatIso(l.createdAt),
        l.evidenceState,
        l.topicsMeasured,
        overview.totalTopics,
        formatMastery(l.meanMastery),
        l.evidenceBackedAttempts,
        l.recentAttempts,
        l.recentCorrect,
        formatIso(l.lastActivityAt),
        l.tutorEngagements,
        formatIso(l.lastTutorEngagementAt),
        l.dueReviews,
        l.activeMisconceptions,
        misconceptionCodesCell(l),
        weakestTopicsCell(l),
      ]),
    );
  }
  return csvDocument(rows);
}

const TOPIC_COLUMNS = [
  ...META_COLUMNS,
  "node_id",
  "code",
  "title",
  "parent_code",
  "parent_title",
  "learners_measured",
  "mean_mastery",
  "mastery_band",
  "evidence_backed_attempts",
  "learners_with_active_misconception",
] as const;

/** Per-topic aggregate table (the "per class" Phase-3 export). */
export function topicsCsv(overview: ClassOverviewView, generatedAt: string): string {
  const meta: ReportMeta = {
    rootCode: overview.rootCode,
    generatedAt,
    evidenceWindowStart: overview.recentActivity.windowStart,
  };
  const rows = [csvRow([...TOPIC_COLUMNS])];
  const byCode = (a: ClassTopicAggregate, b: ClassTopicAggregate) =>
    a.code.localeCompare(b.code);
  for (const t of [...overview.topics].sort(byCode)) {
    rows.push(
      csvRow([
        ...metaFields(meta),
        t.nodeId,
        t.code,
        t.title,
        t.parentCode,
        t.parentTitle,
        t.learnersMeasured,
        formatMastery(t.meanMastery),
        t.masteryBand,
        t.evidenceBackedAttempts,
        t.learnersWithActiveMisconception,
      ]),
    );
  }
  return csvDocument(rows);
}

/** `syllabai-<root>-<kind>-report-<yyyymmdd>.csv` — stable, sort-friendly. */
export function reportFileName(
  overview: ClassOverviewView,
  kind: "students" | "topics",
  generatedAt: string,
): string {
  return `syllabai-${rootSlug(overview.rootCode)}-${kind}-report-${dayStamp(generatedAt)}.csv`;
}

/** Trigger the browser download of a CSV document (client-only helper). */
export function downloadCsv(fileName: string, document_: string): void {
  const blob = new Blob([document_], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
