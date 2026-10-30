"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown, List, LayoutGrid, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Course-body tab pair (hub-coursepage-mg-layout) — the MathsGenie
 * course-page signature: "Topics" (search + grouped topic cards, each row
 * expanding to its real per-subtopic resource links) beside "Resources"
 * (the categorised resource surface, server-rendered by the page and passed
 * through as `resources`).
 *
 * Honest-data discipline: the topic groups arrive from the server built from
 * the canonical spec tree + per-subtopic counts + canonical hrefs. A row
 * only expands when it has at least one real link; a link chip only exists
 * when the committed bundle holds that resource. Nothing is simulated here.
 *
 * Tab state is CLIENT-side on purpose: the course root is prerendered at
 * build (ADR-021 perf pass, tranche 4.12) and must not read searchParams
 * server-side. ?tab=topics deep links still work — the initial state is
 * synced from the URL after hydration and switches are written back with
 * history.replaceState, mirroring the original site's ?tab= addressing
 * without giving up the static HTML.
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

type BodyTab = "topics" | "resources";

/** ?tab= URL read — an external store, not component state: SSR/hydration
 *  see the server snapshot (null → resources pane), then the client snapshot
 *  re-renders the pane the URL asked for. popstate covers back/forward. */
function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function useUrlTab(): BodyTab | null {
  return useSyncExternalStore(
    subscribeToLocation,
    () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      return t === "topics" || t === "resources" ? t : null;
    },
    () => null,
  );
}

/** Decorative completion ring — the MG topic-row anatomy; hub surfaces will
 *  wire real per-topic progress here when the learner-model plane lands. */
function ProgressRing({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} className="relative size-6 flex-none">
      <svg aria-hidden className="size-6" viewBox="0 0 24 24">
        <circle
          className="text-muted-foreground/25"
          cx="12"
          cy="12"
          fill="none"
          r="8.25"
          stroke="currentColor"
          strokeWidth="3.5"
        />
      </svg>
    </div>
  );
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
          <ProgressRing label={`0 of ${row.links.length} resource kinds completed`} />
          <span className="min-w-0 flex-auto text-sm font-medium">
            <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
            {row.title}
          </span>
          <span className="flex-none text-xs text-muted-foreground">{row.total} resources</span>
          <Chevron open={open} />
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-3 py-3 pr-2 leading-tight opacity-60">
          <ProgressRing label="No resources yet" />
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
        <div className="pb-2 pl-10 pr-4">
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
}: {
  groups: TopicGroup[];
  subtopicCount: number;
  /** the server-rendered Resources pane (spec strip + resource bands +
   *  framework explainer) — an RSC payload passed into this client shell */
  resources: React.ReactNode;
}) {
  const [pickedTab, setPickedTab] = useState<BodyTab | null>(null);
  const urlTab = useUrlTab();
  const tab: BodyTab = pickedTab ?? urlTab ?? "resources";
  const [q, setQ] = useState("");

  const switchTab = (t: BodyTab) => {
    setPickedTab(t);
    // keep the MG-style ?tab= address bar in sync for deep links; replaceState
    // (no history spam) — popstate handles back/forward via the store above
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };

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
      {/* the MG tab pair */}
      <div className="mt-6 flex items-end gap-5 border-b text-sm font-semibold">
        {(
          [
            { key: "topics", label: "Topics", icon: List },
            { key: "resources", label: "Resources", icon: LayoutGrid },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTab(t.key)}
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
                  <ProgressRing label={`0 of ${g.subtopics.length} completed`} />
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
      ) : (
        <div className="mt-6 flex flex-col gap-8">{resources}</div>
      )}
    </div>
  );
}
