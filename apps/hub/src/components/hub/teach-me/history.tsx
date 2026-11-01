"use client";

/**
 * Teach-Me history (T-TEACHME-001 run-003) — the sessions list of record
 * (GET /teach-me/sessions?course=…), grouped Today/Earlier by the UTC day
 * the server stamped (the quota law's day boundary is UTC, so the grouping
 * follows the same clock — not the viewer's local one).
 */
import { Badge } from "@/components/ui/badge";
import type { SessionHistoryItem, TeachSessionStatus } from "@syllabai/contracts";

export interface TeachMeHistoryProps {
  items: SessionHistoryItem[];
  onOpen: (sessionId: SessionHistoryItem["sessionId"]) => void;
}

const STATUS_BADGE: Record<TeachSessionStatus, { label: string; className: string }> = {
  active: { label: "in progress", className: "border-primary/40 text-primary" },
  review_pending: { label: "review generating", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  completed: { label: "reviewed", className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  abandoned: { label: "ended early", className: "border-muted-foreground/30 text-muted-foreground" },
};

/** UTC-day grouping (the quota clock of record), not the viewer's local day. */
export function groupByUtcDay(
  items: SessionHistoryItem[],
  now: Date,
): Array<{ label: string; items: SessionHistoryItem[] }> {
  const dayOf = (iso: string) => iso.slice(0, 10);
  const today = dayOf(now.toISOString());
  const yesterday = dayOf(new Date(now.getTime() - 86_400_000).toISOString());
  const groups = new Map<string, SessionHistoryItem[]>();
  for (const item of items) {
    const day = dayOf(item.createdAt);
    const label = day === today ? "Today" : day === yesterday ? "Yesterday" : day;
    const bucket = groups.get(label) ?? [];
    bucket.push(item);
    groups.set(label, bucket);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}

export function TeachMeHistory({ items, onOpen }: TeachMeHistoryProps) {
  if (items.length === 0) {
    return (
      <p className="mx-auto max-w-3xl rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        No sessions yet — teach the Pupil something and it lands here.
      </p>
    );
  }
  const groups = groupByUtcDay(items, new Date());
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </h3>
          <ul className="space-y-2">
            {g.items.map((it) => {
              const badge = STATUS_BADGE[it.status];
              return (
                <li key={it.sessionId}>
                  <button
                    type="button"
                    onClick={() => onOpen(it.sessionId)}
                    className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        Taught{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {it.specPointIds.join(" · ")}
                        </span>
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                        {badge.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {new Date(it.createdAt).toLocaleString()}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
