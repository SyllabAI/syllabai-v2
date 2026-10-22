// ── DC-4 — Lens Cards as Navigation (docs/DC4-LENS-CARDS-NAVIGATION-PLAN.md)
// The lens grid: the empty-state card grid as one presentational component
// (markup byte-identical to the shipped note-cla cards), consumed by the
// chat surfaces. OPENER-ONLY by construction (spec §3.4 acceptance (c)):
// callers render it inside their existing empty-state predicates; this
// component adds no render path of its own.
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { LensRow } from "@/lib/lens-registry";

export function LensGrid<T extends LensRow>({
  lenses,
  columns = 2,
  disabled,
  onPick,
}: {
  lenses: T[];
  columns?: 1 | 2;
  disabled?: boolean;
  onPick: (lens: T) => void;
}) {
  return (
    <div className={columns === 2 ? "grid grid-cols-2 gap-2 pt-1" : "grid grid-cols-1 gap-2 pt-1"}>
      {lenses.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(a)}
          className="flex flex-col gap-1 rounded-xl bg-primary/10 px-3 py-2.5 text-left transition-colors hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <a.icon className="size-3.5 shrink-0 text-primary" aria-hidden />
            {a.title}
          </span>
          <span className="text-[11px] leading-snug text-muted-foreground">{a.description}</span>
        </button>
      ))}
    </div>
  );
}

/** Deterministic copy of record for the route-kind router hooks. */
export const LENS_ROUTE_CTA_COPY = {
  flashcards: "Open Flashcards",
  "exam-questions": "Practice Exam Questions",
} as const;

/**
 * DC-4 acceptance (b): the deterministic router hook rendered under a
 * lens-originated answer. Client-side push — the panel stays mounted and
 * the conversation keeps its state (the grid itself never re-renders
 * mid-thread; the hook is thread-scoped).
 */
export function LensRouterCta({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="inline-flex w-fit items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
    >
      {children}
      <ArrowRight className="size-3 shrink-0" aria-hidden />
    </button>
  );
}
