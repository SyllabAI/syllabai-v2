/**
 * Learning Hub chrome — breadcrumb trail, exam-code pill, and framework tags.
 * Presentational only (server-safe); mirrors the SME header anatomy
 * (research §4): breadcrumb + exam-code pill + bold qualification title.
 */
import Link from "next/link";
import { ChevronRight, Home, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/hub/math-text";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  // V-11 completion (visual audit): nowrap on the labels (kept from the
  // first pass) stops mid-compound breaks, but the trail still flex-wraps
  // BETWEEN whole items — and greedy line packing then strands crumbs:
  // measured live at 390px on /courses/cie-igcse-science-co-ordinated-
  // sciences-double-award-23-biology, the trail rendered THREE lines
  // (Home / Cambridge International | / IGCSE | / Co-ordinated Sciences…)
  // with 128px of line 1 still free. One scrollable line instead: the
  // current-page label is capped (the page's own h1 carries the full
  // title right beneath), so no crumb ever sits orphaned mid-trail.
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex flex-nowrap items-center gap-1 overflow-x-auto text-xs", className)}
    >
      <Link
        href="/"
        className="-ml-1 inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-md px-1 py-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Home className="size-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">Home</span>
      </Link>
      {items.map((c, i) => (
        <span
          key={`${c.label}-${i}`}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"
        >
          {/* visual audit V-11: labels never break mid-compound ("Chemistry —
              A–Level" used to orphan-wrap under the home icon); the trail
              now scrolls as one line instead of wrapping between items */}
          {/* /80: /50 measured 1.96:1 (P3-13) — decorative but needlessly faint */}
          <span aria-hidden className="text-muted-foreground/80">/</span>
          {c.href && i < items.length - 1 ? (
            <Link
              href={c.href}
              className="inline-flex min-h-9 items-center rounded-md py-2 text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {c.label}
            </Link>
          ) : (
            <span
              className={
                i === items.length - 1
                  ? "max-w-[45vw] truncate font-medium text-foreground"
                  : "text-muted-foreground"
              }
            >
              {/* T-UGM-RENDER-2: the current-page crumb carries resource titles
                  whose $…$ math leaked raw on 235/628 UGM pages (fresh sweep
                  2026-10-29, residual R1). MathText is a server component and a
                  byte-identical no-op for math-free labels. */}
              <MathText text={c.label} />
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** "Exam code: 4CH1" pill (SME anatomy, research §4).
 *
 *  With `href` the pill IS the course's Specification link
 *  (T-COURSE-SPECPILL-1, operator request via chat trace
 *  1a1955167e89eb11): the spec card's standalone "Specification tree"
 *  button moved into the identity affordance every course page already
 *  carries, so the exam code doubles as the deep link — one less row of
 *  chrome doing the same job. A real link (not a fake button): one tab
 *  stop, labelled destination, house focus-visible voice.
 *  T-COURSE-SPECPILL-2: the paper-viewer workspace toolbar pill is live
 *  too, so every rendered pill carries the href; the prop stays optional
 *  as the escape hatch for surfaces that must not navigate.
 */
export function ExamCodePill({ code, href, className }: { code: string; href?: string; className?: string }) {
  const pillClass = cn(
    "inline-flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs",
    className,
  );
  if (!href) {
    return (
      <span className={pillClass}>
        <span className="font-semibold text-foreground">Exam code:</span>
        <span className="font-mono text-muted-foreground">{code}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      title="Open the specification"
      aria-label={`Exam code ${code} — open the specification`}
      className={cn(
        pillClass,
        // t-ui-polish run-004: the pill is the most-repeated interactive
        // affordance in the hub (16 hero bands + 3 bare headers + the paper
        // viewer toolbar) — its hover now speaks the house card-hover voice
        // (border-primary/60 + shadow-sm lift, runs 001-003) instead of the
        // off-vocabulary border-ring/bg-muted shift. Focus voice untouched.
        "transition-[border-color,box-shadow] hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      )}
    >
      <span className="font-semibold text-foreground">Exam code:</span>
      <span className="font-mono text-muted-foreground">{code}</span>
      <ListTree className="size-3.5 shrink-0 text-primary" aria-hidden />
    </Link>
  );
}


/** Numbered syllabus label, e.g. topic "1. Principles of chemistry". */
export function NumberedLabel({ number, title }: { number: number; title: string }) {
  return (
    <span>
      <span className="font-semibold">{number}.</span> {title}
    </span>
  );
}

export function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
        open && "rotate-90",
      )}
    />
  );
}
