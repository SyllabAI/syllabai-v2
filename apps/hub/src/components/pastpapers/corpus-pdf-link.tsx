"use client";

/**
 * CorpusPdfLink (T-MIG-128) — a papers-list row button that ALSO warms the
 * same-origin edge-cached PDF on pointer intent. pointerenter fetches the
 * /api/corpus-pdf URL once; the immutable HTTP cache (max-age=31536000)
 * then holds the bytes so the viewer mounts with the document already
 * paid for. Keyboard focus is deliberately NOT a prefetch trigger (tabbing
 * a list must not download fifty PDFs); on touch, the pointer event fires
 * just before navigation, which still buys a small head start.
 *
 * Discipline: a module-level warmed set + a small in-flight cap (2) keep a
 * fast mouse sweep across the list from stampeding the network — the
 * browser HTTP cache dedupes the rest by itself. Fire-and-forget: prefetch
 * failure is BY DESIGN invisible (the viewer has its own honest loading,
 * progress and one-shot fallback states).
 */
import Link from "next/link";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";

/** URLs already warmed this session — fetch() again would be a no-op
 *  against the HTTP cache, but skipping it saves the request entirely. */
const warmed = new Set<string>();
/** at most two intent prefetches in flight; a sweep never stampedes */
const inFlight = new Set<string>();

function warm(pdfUrl: string) {
  if (warmed.has(pdfUrl) || inFlight.has(pdfUrl)) return;
  if (inFlight.size >= 2) return;
  inFlight.add(pdfUrl);
  fetch(pdfUrl, { priority: "low" } as RequestInit)
    .then(() => {
      // 200s are immutable-cached by the proxy; failures stay uncached and
      // unwarmed so a later REAL navigation retries honestly
      warmed.add(pdfUrl);
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight.delete(pdfUrl);
    });
}

export function CorpusPdfLink({
  href,
  pdfUrl,
  children,
  ...rest
}: {
  href: string;
  /** same-origin /api/corpus-pdf/... URL to warm on pointer intent */
  pdfUrl: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "asChild" | "href">) {
  const onIntent = useCallback(() => warm(pdfUrl), [pdfUrl]);
  return (
    <Button asChild {...rest}>
      <Link href={href} onPointerEnter={onIntent}>
        {children}
      </Link>
    </Button>
  );
}
