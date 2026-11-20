"use client";

/**
 * ZoomableFigure — the official-figure scan lightbox (F-QB-2b, honest
 * re-audit 2026-11-20).
 *
 * Corpus figures (the official paper scans: Description/Name tables,
 * structures, apparatus) are hotlinked images rendered at container width.
 * On a phone that is ~28% of printed size for the wide table scans — the
 * exact surface students answer FROM — and there was no way to see the
 * figure at readable scale without leaving the flow. The figure is now a
 * real control: tap opens a full-screen overlay that renders the scan at
 * its intrinsic (1:1) size inside a pannable scroll area — a wide table
 * fits no phone column, so the overlay pans instead of shrinking — and
 * tap anywhere, the ✕ button or Esc closes.
 *
 * Dark mode dims the INLINE copy slightly (the white scan plate glared
 * against the dark theme, F-QB-2d); the overlay always shows the
 * print-true scan (reading is the point).
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ZoomableFigure({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  /** extra classes for the inline trigger (callers keep their layout) */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Esc closes; the overlay locks body scroll while open and restores it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    // focus returns to the figure that opened the overlay
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={alt ? `${alt} — view full size` : "View figure full size"}
        title="View full size"
        className={cn(
          "mx-auto my-2 block w-full cursor-zoom-in overflow-hidden rounded-md border bg-muted/40 p-0 text-left",
          "focus-visible:outline-2 focus-visible:outline-primary",
          className,
        )}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-auto w-full dark:brightness-90"
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt || "Figure — full size"}
          className="fixed inset-0 z-50 bg-black/85"
          onClick={close}
        >
          <div className="absolute right-3 top-3 z-10">
            <button
              type="button"
              autoFocus
              onClick={close}
              aria-label="Close full-size figure"
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="h-full overflow-auto p-3 sm:p-6">
            {/* max-w-none: render at intrinsic size (1:1) and pan — the
                shrink-to-fit behavior is exactly the defect being fixed */}
            <img src={src} alt={alt} decoding="async" className="mx-auto block max-w-none bg-white" />
            <p className="pb-2 text-center text-xs text-white/70">
              Scroll or pinch to pan · tap anywhere to close
            </p>
          </div>
        </div>
      )}
    </>
  );
}
