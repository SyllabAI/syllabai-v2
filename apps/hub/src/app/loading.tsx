/**
 * Root route skeleton (T-HUB-AUDITFIX-1 run-005, 2026-11-08 design audit
 * P5/P10: the app had a loading voice only inside /courses/[course] — a
 * cold first paint on any other segment showed nothing, then jumped).
 * Loading-voice law: skeletons for surfaces, spinners for actions.
 * Approximates the default content column; nothing here pretends to be
 * real data.
 */
export default function RootLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-hidden>
      <div className="h-8 w-64 max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border bg-muted/50 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
