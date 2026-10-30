/**
 * Shared display formatters (ported from syllabai-web's lib/format.ts,
 * T-028). Pure presentation helpers — no business rules; every value they
 * render comes from a backend read model. Client-safe: the only import is
 * lib/board (also client-safe), so hub client surfaces share these too.
 */
import { boardOf } from "./board";

/** Compact relative time: "just now", "4 min ago", "3 h ago", "2 d ago". */
export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Humanize a backend enum-ish reason code: DECAY_CROSSED_THRESHOLD → "decay crossed threshold". */
export function humanizeCode(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .join(" ");
}

/** Future-facing compact relative time (ported from syllabai-web's
 *  lib/format.ts): "due in 2 d" / "due in 3 h" / "due in 45 min", or
 *  "overdue · 2 d" once the instant has passed. */
export function formatDue(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const absDays = Math.abs(ms) / 86_400_000;
  const unit =
    absDays >= 1
      ? `${Math.floor(absDays)} d`
      : absDays * 24 >= 1
        ? `${Math.floor(absDays * 24)} h`
        : `${Math.max(1, Math.floor(absDays * 60))} min`;
  return ms < 0 ? `overdue · ${unit}` : `due in ${unit}`;
}

/**
 * Count display helper (UX review 2026-10-31 F-15): the course page printed
 * "1075 questions", "1189 cards" and "67 papers" side by side — one device
 * (the per-tile count) wearing five formats, with four-digit numbers slow to
 * read unseparated. One helper, one format. "en-GB" is pinned (not
 * locale-default) so server and client renders agree byte-for-byte
 * (hydration) and the grouping follows the UK convention of the audience
 * (Edexcel / Cambridge International).
 */
export function fmtCount(n: number): string {
  return n.toLocaleString("en-GB");
}

/**
 * Course display title (UX review 2026-10-31 F-08): tab titles were
 * inconsistent across lanes because registry labels are — "Chemistry —
 * A-Level" carries its level, the registered lanes fall back to the bare
 * subject ("Geography"). The composer keeps the registry's variant detail
 * ("Maths — Mechanics") and guarantees the level is present exactly once.
 */
export function courseTitle(
  meta: { subject: string; level: string; label: string },
): string {
  const base = meta.label.trim() || meta.subject;
  return base.includes(meta.level) ? base : `${base} — ${meta.level}`;
}

/**
 * Per-course meta description (UX review 2026-10-31 F-08): the global site
 * blurb ("Spec-anchored revision for Edexcel IGCSE & IAL…") served verbatim
 * on Cambridge lanes, including empty ones. The description is composed from
 * the same live counts the tiles print — name only what exists, and say
 * honestly what happens on a lane whose bundle has not landed.
 */
export function courseMetaDescription(
  meta: { slug: string; subject: string; level: string; label: string; code: string; board?: string },
  stats: { notes: number; questions: number; flashcards: number },
): string {
  const qual = `${boardOf(meta)} ${meta.level} ${meta.subject}`;
  const parts: string[] = [];
  if (stats.notes > 0) {
    parts.push(`${fmtCount(stats.notes)} revision note${stats.notes === 1 ? "" : "s"}`);
  }
  if (stats.questions > 0) {
    parts.push(`${fmtCount(stats.questions)} exam-style question${stats.questions === 1 ? "" : "s"}`);
  }
  if (stats.flashcards > 0) {
    parts.push(`${fmtCount(stats.flashcards)} flashcard${stats.flashcards === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    return (
      `${qual} (${meta.code}) on SyllabAI Hub — the full revision hub for this course ` +
      "switches on the moment its content bundle lands."
    );
  }
  return (
    `${qual} (${meta.code}) revision hub: ${parts.join(", ")}, organised around ` +
    "the course's specification."
  );
}

/**
 * Percent display helpers (UX audit 2026-10-02 #17).
 *
 * Before these the dashboard formatted sub-1% values with a decimal
 * ("0.4%") while progress-ring / strengths-panel Math.rounded the same
 * signal — a learner's first engagement read as "0%" everywhere but the
 * dashboard. Every percent display now goes through one function.
 */

/**
 * Percent for display: whole numbers round; fractions below 1% keep one
 * decimal so the first completed item is visible immediately instead of
 * reading as "0%".
 */
export function formatPercent(percent: number): string {
  if (percent <= 0) return "0%";
  return percent >= 1 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`;
}

/**
 * Percent for storage/computation: one-decimal precision — enough for the
 * display contract above, immune to float drift (0.30000000000000004).
 */
export function roundPercent(percent: number): number {
  return Math.round(percent * 10) / 10;
}
