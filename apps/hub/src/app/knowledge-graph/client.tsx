"use client";

/**
 * Knowledge Graph host chrome — single-course scoped (ADR-029 tranche 4.1).
 *
 * A data-decoupled loader build (public/kg/openhuman-course-explorer.html,
 * forked from the byte-faithful v77 renderer) renders ONE course's canonicalKG
 * JSON — the course this page was opened for (?course=<slug>, deep-linked from
 * that course's page). Inside a course's graph there is deliberately NO course
 * switcher: the graph is a property of the subject you selected, not a
 * browsing surface (operator decision, trace 1a0e8568eb6bb545).
 *
 * The entry points that arrive WITHOUT a course (top-nav, home card, stale
 * citations) never silently render the pilot's graph — with a hundred-plus
 * published graphs (106 at the T-KG-FIX-1 pin) that read as "every course
 * shows chemistry" (operator report, trace 1a0f88ea8a493bad). They land on an honest picker instead, and an
 * unknown slug says so instead of falling back. The picker is the ENTRY state
 * only; the graph view itself stays switcher-free per the operator decision.
 *
 * The iframe reports back over postMessage (syllabai-kg:ready / :error), so
 * the counts chip shows the live data path. Learner state is pushed IN over
 * postMessage (syllabai-kg:learner) — always, once resolved, so the renderer's
 * embedded sample map can never resurface; the payload carries a provenance
 * flag so the renderer's legend/peek text stays honest (measured vs simulated
 * vs unavailable).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ExternalLink,
  FlaskConical,
  Gauge,
  Maximize2,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLearnerState } from "@/lib/kg-learner-state";
import { LearnerStateDrawer } from "./state-drawer";

interface CourseLite {
  slug: string;
  label: string;
  subject: string;
  code: string;
  level: string;
  /** true when public/kg/data/<slug>.json exists — the picker lists exactly
   *  what will load, nothing aspirational (server-computed in page.tsx) */
  hasGraph?: boolean;
}

interface KgCounts {
  nodes: number;
  edges: number;
  specPoints: number;
}

const PROTO_URL = "/graph-explorer";

/**
 * Entry: resolve the course from the URL. A valid ?course=<slug> renders the
 * single-course chrome (key={course} remounts everything on change); a
 * missing or unknown course renders the landing picker — never another
 * course's graph.
 */
export function KnowledgeGraphClient({ courses }: { courses: CourseLite[] }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("course");
  // UX audit 2026-10-02 #20: search results emit /knowledge-graph?course=X&node=Y
  // deep links — the node param used to be dropped silently at this boundary.
  const requestedNode = searchParams.get("node");
  // F2 (KG-AUDIT-1): the entry requires hasGraph, not just a registry match.
  // A registry course whose data file is missing lands on the honest picker
  // (fail-closed) instead of the graph view's error overlay. Registry-data
  // parity is exact today (106 = 106), so this changes the failure mode only.
  const course =
    requested && courses.some((c) => c.slug === requested && c.hasGraph)
      ? requested
      : null;
  if (!course) {
    return <CourseGraphLanding courses={courses} requested={requested} />;
  }
  return (
    <KnowledgeGraphCourse
      key={course}
      course={course}
      courses={courses}
      node={requestedNode}
    />
  );
}

/**
 * The honest entry state: every published graph, grouped by qualification
 * level. The registry is the single source of course identity; hasGraph
 * (server fs check) is the single source of what actually loads.
 */
function CourseGraphLanding({
  courses,
  requested,
}: {
  courses: CourseLite[];
  requested: string | null;
}) {
  const graphed = courses
    .filter((c) => c.hasGraph)
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.label.localeCompare(b.label));
  const byLevel = new Map<string, CourseLite[]>();
  for (const c of graphed) {
    const arr = byLevel.get(c.level) ?? [];
    arr.push(c);
    byLevel.set(c.level, arr);
  }
  const levels = [...byLevel.keys()].sort((a, b) =>
    a === b ? 0 : a === "IGCSE" ? -1 : b === "IGCSE" ? 1 : a.localeCompare(b),
  );
  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-y-auto bg-background px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-primary" aria-hidden />
          <h1 className="text-sm font-semibold tracking-tight">Knowledge graphs</h1>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          One specification graph per course, generated from the course&apos;s
          curriculum. Open a graph here or from that course&apos;s page.
        </p>
        {requested && (
          <Alert className="mt-4">
            <AlertTitle>No graph for &ldquo;{requested}&rdquo;</AlertTitle>
            <AlertDescription>
              That course has no published graph — unknown slug, or a registry
              course whose data file is missing (check for a typo) — pick one
              of the published graphs below.
            </AlertDescription>
          </Alert>
        )}
        {levels.map((level) => (
          <section key={level} className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {level}
            </h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {byLevel.get(level)!.map((c) => (
                <Link
                  key={c.slug}
                  href={`/knowledge-graph?course=${encodeURIComponent(c.slug)}`}
                  className="group flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {c.label}
                    </span>
                    {/* the slug disambiguates same-subject variants (Accounting
                        paper variants, Maths Pure 1-4, modular units) without
                        inventing display names the registry does not carry */}
                    <span className="block truncate font-mono text-2xs text-muted-foreground">
                      {c.slug}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-2xs"
                  >
                    {c.code}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function KnowledgeGraphCourse({
  course,
  courses,
  node,
}: {
  course: string;
  courses: CourseLite[];
  /** ?node= deep link (audit #20) — focused in the renderer once it reports ready */
  node: string | null;
}) {
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<KgCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // the course arrives pre-validated by the entry (registry match + published
  // data-file probe) — the invalid-or-missing case never reaches this component
  const activeCourse = course;

  // learner state (KG phases 1 + 2): the CORE model when the course is the
  // pilot and the learner is signed in (real attempts, real decay, real
  // review queue — ADR-029 tranche 4), else the simulated browser-local
  // derivation. `overlay` is pushed into the renderer's dormant
  // learner-state engine over postMessage, `drawer` feeds the My State /
  // History sheet, `source` keeps the provenance honest.
  const { overlay: learner, drawer, source } = useLearnerState(activeCourse);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // F1 (KG-AUDIT-1): the drawer opens programmatically from the chip below,
  // so Radix has no opener of record — without this ref the drawer drops
  // focus on BODY when closed. The drawer restores it via onCloseAutoFocus.
  const stateChipRef = useRef<HTMLButtonElement | null>(null);

  // ALWAYS post once resolved — including the bridge-error case (empty
  // entries): the renderer's embedded sample map must never resurface, and
  // the provenance flag keeps its legend and node-peek text honest.
  const postLearnerOverlay = useCallback(() => {
    if (!learner) return; // still loading — the renderer defaults to no state
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "syllabai-kg:learner",
        course: activeCourse,
        overlay: learner.entries, // {} on bridge error — honest emptiness
        provenance: learner.bridgeError ? "unavailable" : source,
      },
      // F5 (KG-AUDIT-1): bind to our own origin — the renderer iframe is
      // same-origin by construction, so this never blocks the real handshake.
      window.location.origin,
    );
  }, [activeCourse, learner, source]);

  // (re-)post whenever the iframe (re)becomes ready or the derivation changes
  useEffect(() => {
    if (ready) {
      postLearnerOverlay();
      // audit #20: focus the ?node= target — only meaningful after the
      // renderer reports ready (its node map exists by then). The renderer
      // no-ops on an unknown id, so a stale/foreign code is silently safe.
      if (node) {
        frameRef.current?.contentWindow?.postMessage(
          { type: "syllabai-kg:focus-node", course: activeCourse, node },
          window.location.origin,
        );
      }
    }
  }, [ready, postLearnerOverlay, activeCourse, node]);

  // NO address-bar rewrite here (T-C55): this component once "cleaned" the
  // pilot's URL with window.history.replaceState deleting ?course= — but
  // Next patches history.replaceState to push into the App Router state, so
  // useSearchParams() re-rendered empty, `requested` became null, and this
  // page flipped ITSELF onto the landing picker mid-session: the pilot deep
  // link could never hold (deck-flow e2e: the drawer trigger unmounted under
  // the click — 2/29 red since 429e4ad made null land on the picker; before
  // that commit the delete was harmless because null fell back to the pilot).
  // For non-pilot courses the rewrite was a no-op (it set the same value),
  // so the effect was pure liability. The param-ful URL IS the canonical
  // deep-link form — the landing picker links every course with exactly it.

  // loader-build handshake: one stable listener; the iframe re-posts on every
  // course switch (key={activeCourse} remounts it), so state updates only
  // ever happen from message events — never synchronously in an effect.
  // If the loader beats us to it (warm cache), the host-ready ping below
  // makes it re-post its status.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      // F5 (KG-AUDIT-1): only our own same-origin renderer fork may drive the
      // handshake — anything else (another window, an extension) is ignored.
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string; counts?: KgCounts; message?: string };
      if (d?.type === "syllabai-kg:ready" && d.counts) {
        setCounts(d.counts);
        setReady(true);
        setError(null);
      } else if (d?.type === "syllabai-kg:error") {
        setError(d.message ?? "unknown loader error");
      }
    };
    window.addEventListener("message", onMessage);
    // ask a possibly-already-finished loader to re-post its status
    frameRef.current?.contentWindow?.postMessage(
      { type: "syllabai-kg:host-ready" },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onFrameLoad = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "syllabai-kg:host-ready" },
      window.location.origin,
    );
  }, []);

  const current = courses.find((c) => c.slug === activeCourse);
  const iframeSrc = `/kg/openhuman-course-explorer.html?course=${encodeURIComponent(activeCourse)}`;

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenEnabled) {
      window.open(iframeSrc, "_blank", "noopener");
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (shellRef.current) {
      void shellRef.current.requestFullscreen().catch(() => {});
    }
  }, [iframeSrc]);

  return (
    <div ref={shellRef} className="flex flex-col bg-background">
      {/* toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4">
        <Network className="size-4 shrink-0 text-primary" aria-hidden />
        <h1 className="truncate text-sm font-semibold tracking-tight">Knowledge Graph</h1>
        {/* the course this graph belongs to — a label, not a switcher: the
            graph shows only the selected subject (no browsing other courses) */}
        {current && (
          <>
            <Badge variant="outline" className="hidden max-w-[15rem] truncate font-medium sm:inline-flex">
              {current.label}
            </Badge>
            <Badge variant="outline" className="hidden font-mono text-2xs md:inline">
              {current.code}
            </Badge>
          </>
        )}
        {counts && (
          <Badge
            variant="outline"
            className="hidden font-mono text-2xs text-success xl:inline"
          >
            {counts.nodes} nodes · {counts.edges} edges · {counts.specPoints} spec points
          </Badge>
        )}

        {/* learner state chip — opens the My State / History drawer (the
            phase-1 legend popover folded into the drawer, one derivation) */}
        {learner && !learner.bridgeError && learner.stats.total > 0 && (
          <Button
            ref={stateChipRef}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2 font-mono text-2xs text-muted-foreground"
            aria-haspopup="dialog"
            onClick={() => setDrawerOpen(true)}
          >
            <Gauge className="size-3.5 shrink-0" aria-hidden />
            <span className="tabular-nums">{learner.stats.measured}/{learner.stats.total}</span>
            <span className="hidden lg:inline">
              {source === "core"
                ? learner.stats.measured > 0
                  ? "measured · live · my state"
                  : "live · my state"
                : learner.stats.measured > 0
                  ? "measured · my state"
                  : "no evidence · my state"}
            </span>
          </Button>
        )}

        <span className="ml-auto" />

        {/* prototype lab cross-link */}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="hidden h-8 text-xs lg:inline-flex"
        >
          <Link href={PROTO_URL}>
            <FlaskConical className="size-3.5" aria-hidden />
            Prototype lab
          </Link>
        </Button>

        <Button
          asChild
          variant="outline"
          size="icon"
          aria-label="Open this course graph in a new tab"
        >
          <a href={iframeSrc} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Toggle fullscreen"
          onClick={toggleFullscreen}
        >
          <Maximize2 className="size-3.5" aria-hidden />
        </Button>
      </div>

      {/* My State / History drawer (KG phase 2) — same derivation as the graph */}
      <LearnerStateDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        returnFocusRef={stateChipRef}
        courseLabel={current?.label ?? "this course"}
        course={activeCourse}
        drawer={drawer}
        source={source}
      />

      {/* explorer canvas */}
      <div className="relative" style={{ height: "calc(100dvh - 3.5rem - 3rem)" }}>
        {(!ready || error) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center text-xs text-muted-foreground">
            {error ? (
              <Alert variant="destructive" className="max-w-md text-left">
                <AlertTitle>Graph data failed to load</AlertTitle>
                <AlertDescription className="font-mono text-2xs">
                  {error}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div
                  className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary"
                  role="status"
                  aria-label="Loading knowledge graph"
                />
                <span>
                  loading {current?.label ?? "course"} knowledge graph…
                </span>
              </>
            )}
          </div>
        )}
        <iframe
          key={activeCourse}
          ref={frameRef}
          src={iframeSrc}
          onLoad={onFrameLoad}
          title={`Knowledge Graph — ${current?.label ?? "course"}`}
          className={cn(
            "absolute inset-0 h-full w-full border-0 transition-opacity duration-300",
            ready && !error ? "opacity-100" : "opacity-0",
          )}
          allow="fullscreen"
        />
      </div>

      {/* honest data-path footnote */}
      <div className="flex items-center gap-1.5 border-t px-4 py-1.5 text-2xs text-muted-foreground">
        <Network className="size-3 shrink-0" aria-hidden />
        <span>
          {current?.label ?? "This course"}&apos;s specification graph — generated
          from its official curriculum content and rendered by our graph viewer.
          One graph per course: open it from that course&apos;s page. Prerequisite
          links come from tutor-validated concept dependencies plus a draft,
          inferred tier — the provenance panel labels each tier; edge types
          toggle in the relation menu. Experimental build:{" "}
          <span className="font-mono">/graph-explorer</span>.
        </span>
      </div>
    </div>
  );
}
