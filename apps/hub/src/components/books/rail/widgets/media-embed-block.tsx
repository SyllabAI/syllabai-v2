"use client";

/**
 * T-BOOK-006 — media-embed: the poster + link card (video/3D/animation).
 * Ships only with an explicit licenseRef (the licensing law); the rail
 * never hosts third-party media bytes — a curated external link card.
 */
import type { RailBlock } from "@/lib/books-rail";

import { WidgetCard } from "../check-shared";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export function MediaEmbedBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const title = typeof c.title === "string" ? c.title : null;
  const url = typeof c.url === "string" && c.url !== "" ? c.url : null;
  const licenseRef = typeof c.licenseRef === "string" ? c.licenseRef : null;
  const blurb = typeof c.blurb === "string" ? c.blurb : null;

  if (title == null || url == null || licenseRef == null) return null; // contract law

  return (
    <WidgetCard ord={block.ord} typeLabel="Watch" prompt={title}>
      {blurb && <p className="mb-2 text-[13px] leading-snug text-muted-foreground">{blurb}</p>}
      <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-3 text-xs">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open the resource
        </a>
      </Button>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Licensing: {licenseRef}</p>
    </WidgetCard>
  );
}
