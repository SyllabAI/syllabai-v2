"use client";

/**
 * CitationHover — the run-012 chat-parity hover preview (operator trace
 * 1a14af4dde23b471). A passive, zero-network card: the label plus a
 * destination line derived ONLY from the href's own shape — never a
 * pre-fire of the click pipeline (the citation dialog's core fetch stays
 * a click act). Wrap any chip: /sources deep links announce the cited
 * page, KG links the graph explorer, and an href-less (read-only)
 * citation states that honestly instead of pretending a viewer exists.
 *
 * Own module by law: Turbopack refuses the cross-module re-export when it
 * rides the citation-paper-link module (the CI build's "Export
 * CitationHover doesn't exist in target module" class) — this file is the
 * dependency-free fix; citation-paper-link imports FROM here.
 */
import { MousePointerClick } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

/** The /sources/{row}?page=N[&course=slug] shape — the F-022 deep link. */
function parseSourcesHref(href: string): { documentId: string; page: number; course: string | null } | null {
  const [path, query = ""] = href.split("?");
  const m = /^\/sources\/([^/]+)$/.exec(path);
  if (!m?.[1]) return null;
  const params = new URLSearchParams(query);
  const pageRaw = params.get("page");
  const page = pageRaw !== null && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1;
  return { documentId: m[1], page, course: params.get("course") };
}

export function CitationHover({
  href,
  label,
  children,
}: {
  href?: string | null;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <HoverCard openDelay={300} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-64 p-3">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold leading-snug">{label || "Cited source"}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {(() => {
              if (!href)
                return "Read-only citation — the tutor cited this source, but no in-app viewer is wired for it.";
              const parsed = parseSourcesHref(href);
              if (parsed)
                return `Opens cited page ${parsed.page} in place — the same text the tutor's evidence was served from.`;
              if (href.startsWith("/knowledge-graph")) return "Opens the course knowledge graph.";
              return "Opens the linked surface.";
            })()}
          </p>
          {href && (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <MousePointerClick className="size-3" aria-hidden /> Click to open
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
