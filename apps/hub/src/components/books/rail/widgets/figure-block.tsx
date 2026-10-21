"use client";

/** T-BOOK-004 — figure: the page-true pointer card (figures live in the
 *  mounted PDF, never in the repo — the licensing law). */
import { MapPin } from "lucide-react";

import type { RailBlock } from "@/lib/books-rail";

import { Button } from "@/components/ui/button";

export function FigureBlock({ block, onJump }: { block: RailBlock; onJump: (p: number) => void }) {
  const c = block.content;
  const caption = typeof c.caption === "string" ? c.caption : null;
  // the contract's figure law carries content.page; pdfPageAnchor is the envelope twin
  const page =
    typeof c.page === "number" && c.page > 0 ? c.page : block.pdfPageAnchor;
  return (
    <div className="rounded-lg border bg-card p-3 text-sm" data-ord={block.ord}>
      <p className="text-muted-foreground">
        Page-true figure region in the book pane{caption ? ` — ${caption}` : ""}.
      </p>
      {page != null && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-7 gap-1 px-2 text-xs"
          onClick={() => onJump(page)}
          aria-label={`Show page ${page} in the book pane`}
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          See p.{page}
        </Button>
      )}
    </div>
  );
}
