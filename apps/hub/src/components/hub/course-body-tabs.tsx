"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChartColumn, ChevronDown, List, LayoutGrid, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Course-body tab trio (hub-coursepage-mg-layout) — the MathsGenie
 * course-page signature: "Topics" (search + grouped topic cards, each row
 * expanding to its real per-subtopic resource links), "Resources"
 * (the categorised resource surface, server-rendered by the page and passed
 * through as `resources`) and "Strengths & Weaknesses" (the decay-driven
 * strength surface, also a server slot — operator request trace
 * 1a192c8ad6b77ad9 moved it here from the hero band, whose tab pair was
 * removed; the /strengths route and the sidebar entry stay live for deep
 * links).
 *
 * Honest-data discipline: the topic groups arrive from the server built from
 * the canonical spec tree + per-subtopic counts + canonical hrefs. A row
 * only expands when it has at least one real link; a link chip only exists
 * when the committed bundle holds that resource. Nothing is simulated here.
 *
 * Tab state is CLIENT-side on purpose: the course root is prerendered at
 * build (ADR-021 perf pass, tranche 4.12) and must not read searchParams
 * server-side. The URL's ?tab= param is the SINGLE source of truth — read
 * through an external store, written by pushTab with history.pushState
 * plus an explicit listener notify (pushState does not fire popstate), so
 * the pane can never drift from the address bar: deep links resolve after
 * hydration, tab clicks become real history entries (MG's tab links are
 * real hrefs), and Back/Forward land on whatever ?tab= says. The earlier
 * pickedTab ?? urlTab split could desync exactly there — Back after a
 * click kept the clicked pane while the URL moved on (run-002 fix).
 */

export interface TopicLink {
  label: string;
  href: string;
  count: number;
}

export interface TopicSubtopicRow {
  code: string;
  title: string;
  total: number;
  links: TopicLink[];
}

export interface TopicGroup {
  code: string;
  number: number;
  title: string;
  subtopics: TopicSubtopicRow[];
}

type BodyTab = "topics" | "resources" | "strengths";

/** The ?tab= external store — the URL is the single source of truth. The
 *  client snapshot re-reads the address bar on every notify; the server
 *  snapshot is null (→ resources pane) so SSR/hydration stay static
 *  (ADR-021). pushState/replaceState do NOT fire popstate, so programmatic
 *  switches notify by hand; popstate covers back/forward and any other
 *  history navigation. Snapshot returns a primitive, so value-identity
 *  keeps useSyncExternalStore loop-free without caching. */
const tabListeners = new Set<() => void>();

function readUrlTab(): BodyTab | null {
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "topics" || t === "resources" || t === "strengths" ? t : null;
}

function subscribeToTab(onChange: () => void): () => void {
  tabListeners.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    tabListeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function useUrlTab(): BodyTab | null {
  return useSyncExternalStore(subscribeToTab, readUrlTab, () => null);
}

/** pushTab — the writer half of the store: a real history entry (MG's tab
 *  links are real hrefs, so Back restores the previous tab), then the
 *  manual notify popstate can't give us. Mutates a copy of the current
 *  URL, so any other query params stay intact. */
function pushTab(t: BodyTab) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", t);
  window.history.pushState(null, "", url);
  for (const l of tabListeners) l();
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      aria-hidden
      className={cn(
        "pointer-events-none size-5 shrink-0 text-muted-foreground opacity-70 transition-transform duration-200 ease-out",
        open && "rotate-180",
      )}
    />
  );
}

function SubtopicRow({ row, index }: { row: TopicSubtopicRow; index: number }) {
  const [open, setOpen] = useState(false);
  const expandable = row.links.length > 0;
  return (
    <div className="rounded-xl">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 pr-2 text-left leading-tight transition-colors hover:bg-muted"
        >
          {/* UX review F-07: the decorative completion rings are gone — 138
              permanently-empty rings per lane announced "0 of N completed"
              to screen readers for progress nothing measures. The honest
              signals (per-row resource count, real chips) remain. */}
          <span className="min-w-0 flex-auto text-sm font-medium">
            <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
            {row.title}
          </span>
          <span className="flex-none text-xs text-muted-foreground">{row.total} resources</span>
          <Chevron open={open} />
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-3 py-3 pr-2 leading-tight opacity-60">
          <span className="min-w-0 flex-auto text-sm font-medium">
            <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
            {row.title}
          </span>
          <span className="flex-none text-[10px] uppercase tracking-wide text-muted-foreground">
            no resources yet
          </span>
        </div>
      )}
      {open && expandable && (
        <div className="pb-2 pl-3 pr-4">
          <div className="flex flex-wrap gap-2">
            {row.links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-full border bg-background px-3 py-1 text-xs font-medium transition hover:bg-muted"
              >
                {l.label}
                <span className="ml-1 text-muted-foreground">({l.count})</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseBodyTabs({
  groups,
  subtopicCount,
  resources,
  strengths,
}: {
  groups: TopicGroup[];
  subtopicCount: number;
  /** the server-rendered Resources pane (spec strip + resource bands +
   *  framework explainer) — an RSC payload passed into this client shell */
  resources: React.ReactNode;
  /** the server-rendered Strengths & Weaknesses slot (StrengthsPanel + the
   *  About-this-data disclosure) — an RSC payload passed into this client
   *  shell; the panel's own sign-in gate covers signed-out visitors */
  strengths: React.ReactNode;
}) {
  const urlTab = useUrlTab();
  const tab: BodyTab = urlTab ?? "resources";
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          subtopics: g.subtopics.filter((s) => s.title.toLowerCase().includes(query)),
        }))
        .filter((g) => g.subtopics.length > 0),
    [groups, query],
  );

  return (
    <div>
      {/* the MG tab row */}
      <div className="mt-6 flex items-end gap-5 border-b text-sm font-semibold">
        {(
          [
            { key: "topics", label: "Topics", icon: List },
            { key: "resources", label: "Resources", icon: LayoutGrid },
            { key: "strengths", label: "Strengths & Weaknesses", icon: ChartColumn },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => pushTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              "flex items-center gap-1.5 border-b-[3px] px-1 pb-2.5 pt-1 transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "topics" ? (
        <>
          <div className="relative mt-6 max-w-sm">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search topics..."
              aria-label="Search topics"
              className="w-full rounded-2xl border bg-muted py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {filtered.map((g) => (
              <section key={g.code} className="rounded-2xl border bg-card p-1">
                <div className="flex items-center gap-3 rounded-xl px-3 py-3 pr-2">
                  <span className="min-w-0 flex-auto text-base font-semibold">
                    {g.number}. {g.title}
                  </span>
                  <span className="flex-none text-xs text-muted-foreground">
                    {g.subtopics.length} subtopics
                  </span>
                </div>
                <div className="flex flex-col pl-4">
                  {g.subtopics.map((s, i) => (
                    <SubtopicRow key={s.code} row={s} index={i} />
                  ))}
                </div>
              </section>
            ))}
            {filtered.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No topics match &ldquo;{q}&rdquo;.
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {subtopicCount} subtopics across {groups.length} topics · every link is real,
              committed corpus content
            </p>
          </div>
        </>
      ) : tab === "strengths" ? (
        <div className="mt-6 flex flex-col gap-8">{strengths}</div>
      ) : (
        <div className="mt-6 flex flex-col gap-8">{resources}</div>
      )}
    </div>
  );
}
