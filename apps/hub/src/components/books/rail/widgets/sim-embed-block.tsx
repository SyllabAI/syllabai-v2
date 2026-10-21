"use client";

/**
 * T-BOOK-006 — sim-embed: the PhET iframe (CC-BY-4.0, the ONLY provider in
 * the pilot — the licensing law). Consent-to-load: the iframe mounts on
 * the learner's click (CSP-friendly, no third-party frames render until
 * asked), the fallback link is ALWAYS visible (mandatory by contract),
 * attribution rides the card.
 */
import { useState } from "react";

import type { RailBlock } from "@/lib/books-rail";

import { WidgetCard } from "../check-shared";
import { Button } from "@/components/ui/button";
import { ExternalLink, Play } from "lucide-react";

export function SimEmbedBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const provider = typeof c.provider === "string" ? c.provider : null;
  const simId = typeof c.simId === "string" ? c.simId : null;
  const title = typeof c.title === "string" ? c.title : null;
  const attribution = typeof c.attribution === "string" ? c.attribution : null;
  const fallbackUrl = typeof c.fallbackUrl === "string" && c.fallbackUrl !== "" ? c.fallbackUrl : null;
  const blurb = typeof c.blurb === "string" ? c.blurb : null;

  const [loaded, setLoaded] = useState(false);

  if (provider !== "phet" || simId == null || title == null || fallbackUrl == null) {
    return null; // a non-PhET or fallback-less sim never ships (contract law)
  }

  const src = `https://phet.colorado.edu/sims/html/${encodeURIComponent(simId)}/latest/${encodeURIComponent(simId)}_en.html`;

  return (
    <WidgetCard ord={block.ord} typeLabel="Simulation" prompt={title} accent>
      {blurb && <p className="mb-2 text-[13px] leading-snug text-muted-foreground">{blurb}</p>}
      {loaded ? (
        <div className="overflow-hidden rounded-md border">
          <iframe
            src={src}
            title={`PhET simulation: ${title}`}
            className="aspect-video w-full"
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-3">
          <p className="text-[13px] text-muted-foreground">
            Interactive simulation — loads from PhET (University of Colorado Boulder) when you start it.
          </p>
          <Button size="sm" className="h-7 gap-1 px-3 text-xs" onClick={() => setLoaded(true)}>
            <Play className="h-3.5 w-3.5" aria-hidden />
            Start the simulation
          </Button>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          PhET Interactive Simulations · {attribution ?? "CC-BY-4.0"}
        </span>
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline decoration-dotted"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Open directly
        </a>
      </div>
    </WidgetCard>
  );
}
