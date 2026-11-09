"use client";

/**
 * MockResultsStrip — recent mock results for THIS course, from the
 * account-backed self-marked tally store (lib/mock-results.ts, T-TIER1):
 * signed in the tallies live on the learner's account (learner_mock_results)
 * and mirror here; signed out they stay this-browser-only (the footer says
 * which posture is live). Rendered client-side after mount so SSR markup
 * stays deterministic.
 */
import { Trash2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIdentity } from "@/lib/identity";
import { clearMockResults, formatSpent, useMockResults, type MockResult } from "@/lib/mock-results";

export function MockResultsStrip({ course }: { course: string }) {
  const results = useMockResults(course);
  const identity = useIdentity();

  if (results === null || results.length === 0) return null;

  const pct = (r: MockResult) => Math.round((r.marks / Math.max(1, r.total)) * 100);

  return (
    <section
      aria-label="Your recent mock results"
      className="rounded-xl border bg-muted/30 p-3 print:hidden"
    >
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">Your recent mocks</h2>
        <span className="text-2xs text-muted-foreground">
          {identity ? "saved to your account" : "saved in this browser only"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 px-2 text-2xs text-muted-foreground"
          onClick={() => clearMockResults(course)}
        >
          <Trash2 className="size-3" aria-hidden />
          Clear
        </Button>
      </div>
      <ul className="mt-2 flex snap-x gap-2 overflow-x-auto pb-1">
        {results.slice(0, 8).map((r) => (
          <li
            key={r.id}
            className="w-44 shrink-0 snap-start rounded-lg border bg-background p-2.5 text-xs"
          >
            <p className="truncate font-mono text-2xs font-semibold">{r.ref}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {new Date(r.finishedAt).toLocaleDateString()} · {formatSpent(r.timeUsedSec)} spent
              {r.ended === "time-up" ? " · time-up" : ""}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {r.marks}
              <span className="text-xs font-normal text-muted-foreground"> / {r.total}</span>
              <span
                className={`ml-1.5 text-2xs font-medium ${
                  pct(r) >= 50 ? "text-success" : "text-destructive"
                }`}
              >
                {pct(r)}%
                {/* UX audit 2026-10-02 #16: pass/fail was color-only (1.4.1) */}
                <span className="sr-only">{pct(r) >= 50 ? " — pass" : " — not yet passed"}</span>
              </span>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-2xs text-muted-foreground">
        Mock grading is self-marked against the official mark scheme — your own tally, not a
        canonical marked result.
      </p>
    </section>
  );
}
