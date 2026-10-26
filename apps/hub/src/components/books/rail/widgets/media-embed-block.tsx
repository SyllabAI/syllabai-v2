"use client";

/**
 * T-BOOK-006 — media-embed: the poster + link card (video/3D/animation).
 * Ships only with an explicit licenseRef + a manifest-resolved sourceId (the
 * licensing law; lint G4 enforces the resolve side against
 * meta/media-sources.yaml). The rail never hosts third-party media bytes.
 *
 * ADR-BOOK-0002 decision 3 — the embed law: kind=video rows embed via
 * youtube-nocookie.com ONLY (rel=0, no autoplay, no playlists, no
 * endscreens, lazy, title in the iframe title attr), with the provider
 * attribution rendered IN-CARD (never in lesson prose — lesson-prose@2.0.0
 * untouched) and the plain link card as the standing fallback (embed
 * blocked / kind != video / youtubeId absent). The card frames the video as
 * apparatus ("Watch", return-to-lesson affordance), not as the lesson.
 */
import type { RailBlock } from "@/lib/books-rail";

import { WidgetCard } from "../check-shared";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

/** Only [A-Za-z0-9_-] are legal in a YouTube id — anything else never
 *  reaches the iframe src (the 11-char shape is enforced but not assumed:
 *  a shorter id still renders, a hostile string never does). */
function safeYouTubeId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^[A-Za-z0-9_-]{6,20}$/.test(v) ? v : null;
}

export function MediaEmbedBlock({ block }: { block: RailBlock }) {
  const c = block.content;
  const title = typeof c.title === "string" ? c.title : null;
  const url = typeof c.url === "string" && c.url !== "" ? c.url : null;
  const licenseRef = typeof c.licenseRef === "string" ? c.licenseRef : null;
  const blurb = typeof c.blurb === "string" ? c.blurb : null;
  const attribution = typeof c.attribution === "string" ? c.attribution : null;
  const youtubeId = safeYouTubeId(c.youtubeId);

  if (title == null || url == null || licenseRef == null) return null; // contract law

  return (
    <WidgetCard ord={block.ord} typeLabel="Watch" prompt={title}>
      {blurb && <p className="mb-2 text-[13px] leading-snug text-muted-foreground">{blurb}</p>}
      {youtubeId ? (
        <div className="overflow-hidden rounded-md border bg-black/90">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
            title={title}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full border-0"
          />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-3 text-xs">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {youtubeId ? "Watch at the provider" : "Open the resource"}
          </a>
        </Button>
      </div>
      {attribution && <p className="mt-1.5 text-[11px] text-muted-foreground">{attribution}</p>}
      <p className="text-[11px] text-muted-foreground">Licensing: {licenseRef}</p>
    </WidgetCard>
  );
}
