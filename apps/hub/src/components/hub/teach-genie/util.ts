/**
 * T-TEACHGENIE-001 — Teach Genie display helpers (pure, unit-tested).
 */

/** MG history rows show "0m ago / 12m ago / 3h ago / 2d ago", then the date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The status-dot recipe for a session row (house primary since
 *  T-TEACHGENIE-004 — the MG cyan is retired with the .tg-scope skin). */
export function statusDotClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-500";
    case "active":
      return "bg-primary";
    case "review_pending":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground/50";
  }
}

/** The MG status label for a session row / objective row. */
export function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "active":
      return "In progress";
    case "review_pending":
      return "Review generating";
    default:
      return "Ended early";
  }
}

/** Objective status label (the "Not started" lines under each objective). */
export function objectiveStatusLabel(status: string): string {
  switch (status) {
    case "covered":
      return "Covered";
    case "not_covered":
      return "Not covered";
    case "flagged":
      return "Flagged — looked pasted";
    default:
      return "Not started";
  }
}

export function objectiveDotClass(status: string): string {
  switch (status) {
    case "covered":
      return "border-transparent bg-green-500";
    case "not_covered":
      return "border-transparent bg-red-500";
    case "flagged":
      return "border-transparent bg-amber-500";
    default:
      return "border-2 border-border bg-transparent";
  }
}

/** "Session ended · Sat, Oct 31, 2026, 11:24 PM" (the review divider). */
export function endedLine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* T-TEACHGENIE-008 — the enrollment-conditional ratification footnotes.
 *
 * Classroom students read the teacher-ratifies sentence of record (the
 * T-TEACHME-001 copy, byte-identical). Independent students read the honest
 * neutral line — no teacher claim, and no counts-toward-record promise
 * (auto-commit is NOT live: the copy must never promise what the engine
 * doesn't do). Fail-safe direction: callers pass the API's affirmative
 * enrollment flag only — unknown or error ⇒ false ⇒ the neutral line (a
 * missing sentence is honest; a false teacher claim is not).
 */

/** The picker footer sentence ("Start session" button area). */
export function pickerEvidenceFootnote(classroomStudent: boolean): string {
  return classroomStudent
    ? "Sessions are AI_SUGGESTED evidence — your teacher ratifies before anything counts."
    : "Sessions are AI_SUGGESTED evidence.";
}

/** The review card's evidence lead (the "Spec verdicts of record:" line follows). */
export function reviewEvidenceLead(classroomStudent: boolean): string {
  return classroomStudent
    ? "AI_SUGGESTED evidence — your teacher ratifies before any of this touches your record."
    : "AI_SUGGESTED evidence.";
}
