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

/** The MG status-dot recipe for a session row. */
export function statusDotClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-500";
    case "active":
      return "bg-[#1cb0f6]";
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
