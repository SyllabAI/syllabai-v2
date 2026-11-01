"use client";

/**
 * CourseShell — the persistent per-course chrome (SME model, research §4):
 *
 *   - ONE course sidebar (Course / Learn / Practise / Track & improve
 *     groups — run-013 C2 mirrors the dashboard's band taxonomy — with a
 *     "Hide menu" collapse) on every course surface — hub, indexes, details;
 *   - NO topic tree in the desktop sidebar: the numbered tree lives in the
 *     resource panel (see resource-panel.tsx) which resource DETAIL pages
 *     mount themselves, exactly like SaveMyExams' second column;
 *   - on mobile the tree is reachable from the course drawer instead.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookMarked,
  BookOpen,
  Bookmark,
  ChevronDown,
  CircleHelp,
  Compass,
  FileQuestion,
  Files,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  ListTree,
  Map,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  CourseDataProvider,
  type SidebarData,
  type SidebarVariant,
} from "@/components/hub/course-data-context";
import { TopicTreeWithIndexAuto } from "@/components/hub/topic-tree";
import { isDocumentFocusRoute, isViewerRoute } from "@/lib/focus-routes";
import { courseHasBookArchive } from "@/lib/books-registry";

export type { SidebarData, SidebarVariant } from "@/components/hub/course-data-context";

/** The collapsed rail is fixed 44px (`w-11`) by design — run-008 C-1 made only
 * the EXPANDED width continuous; the rail never takes inline width. run-010
 * uses the same constant as the hover-intent boundary (pointerenter must
 * arrive through the rail strip, not the panel area). Keep in lockstep with
 * the `w-11` classes below. */
const SIDEBAR_RAIL_PX = 44;

type NavItem = {
  /** run-013 ghost law (audit C1+C3): disabled rows carry NO href — a ghost
   * is not a link (the old `href: "#"` rendered nowhere but lied in the
   * data). Enabled rows always carry one — the NavRow renderer guards it. */
  href?: string;
  label: string;
  icon: typeof BookOpen;
  disabled?: boolean;
  badge?: string;
  exact?: boolean;
  /** run-004b: tree children (RD's collapsible-group pattern) — rendered
      under the parent with the 2px tree rail; only real hierarchy ships
      (Saved questions under Exam Questions), never invented depth. */
  children?: NavItem[];
};

// run-008 C-1 (tier-c-mining.md): the drag-resize handle constants. Clamps
// and default are OURS (MG's are not in the capture); default = 256 = the
// w-64 class state, so today's look is untouched until the user drags.
const SIDEBAR_MIN_W = 200;
const SIDEBAR_MAX_W = 340;
const SIDEBAR_DEFAULT_W = 256;
const SIDEBAR_WIDTH_KEY = "hub:course-rail-width";
const SIDEBAR_RESIZE_STEP = 16;

const clampSidebarWidth = (n: number) =>
  Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, n));

/** run-013: NavItem.href is optional (ghost rows carry none) — a missing
 * href can never prefix-match, so a ghost row can never pill. */
const pathActive = (href: string | undefined, pathname: string) =>
  href !== undefined && pathname.startsWith(href);

function persistSidebarWidth(w: number) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
  } catch {
    // storage blocked / full — the width just won't survive a reload
    // (honest degrade, same posture as the other hub prefs)
  }
}

/**
 * run-004b — the course nav row, corrected against the operator-supplied
 * saved captures of the real MathsGenie + RevisionDojo sidebars
 * (scripts/rd-sidebar.html, scripts/mg-sidebar.html): MG's airy rhythm
 * (px-2 py-2 rows, hairline panel, sentence-case group labels) with RD's
 * accent idiom — the ACTIVE row is a FILLED PILL in the
 * --accent-primary/--accent-primary-foreground token pair, exactly their
 * bg-accent-primary recipe. Icons are INLINE (both references — the
 * run-004 icon tiles were a wrong guess and cost 28px of label width),
 * inactive ink is the references' neutral 60%. Badges split by semantics:
 * harvest counts = quiet neutral pill (MG's only count badge is a red
 * todo-dot — a library size is metadata, not an alert); "roadmap" = the
 * accent pair inverted, RD's "New" chip. Every colour is a token ride —
 * --primary/--muted raws per the #500 alias contract, no hardcoded hex.
 * course-nav-item stays on the row as the documented theme hook
 * (globals.css); aria-current stays load-bearing for it and for a11y.
 *
 * run-005 tier-a (interactivity feel, capture-verbatim — see the
 * interactivity analysis over the operator-supplied captures):
 * (1) hover affordances ride [@media(hover:hover)] — BOTH references gate
 *     every hover that way, so touch devices never sticky-hover a row;
 * (2) icons brighten on row hover via the named group (group/navitem,
 *     opacity-60 → group-hover:opacity-100). No transition class on the
 *     icon — neither reference transitions it, they snap; (3) the keyboard
 *     focus ring rides the accent pair token (ring-accent-primary-foreground/50),
 *     the references' focus-visible recipe, replacing ring-ring/60;
 * (4) the shell's content swaps fade in (animate-in fade-in, 200ms ease-out,
 *     matching the aside's width ease) so the collapse/expand ease no longer
 *     ends in a hard pop. Opacity-only, which the 2026-10-30 reduced-motion
 *     audit keeps by design ("fewer and gentler, not zero").
 *
 * run-005 tier-b (structure, capture-verbatim): the row gains a second
 * shape — the 44px rail (collapsed) KEEPS rows mounted as 36px icon pills
 * (MG's rail-keep: labels hide, rows never unmount), each labelled by a
 * Radix tooltip (MG's data-slot="tooltip-trigger" recipe; the portal
 * escapes the aside's overflow-hidden) plus aria-label. Badges and tree
 * indent are expanded-only — a count pill has no business in a 36px icon
 * row. The tier-a content-swap fade retires here: rail-keep turns the
 * collapse swap into a morph, so there is nothing left to fade.
 */
function NavRow({
  item,
  active,
  onNavigate,
  indent = false,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  indent?: boolean;
  /** run-005 tier-b: the 44px rail shape — icon-only 36px row + tooltip. */
  collapsed?: boolean;
}) {
  // numeric badges (harvested counts, e.g. Seneca "1,736") render as quiet
  // neutral pills; "roadmap" renders as the accent pair inverted (RD "New")
  const isCount = item.badge !== undefined && /^\d/.test(item.badge);
  const badge = item.badge && (
    <span
      className={cn(
        "ml-auto shrink-0",
        isCount
          ? "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
          : "rounded-md bg-accent-primary-foreground px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-accent-primary",
      )}
    >
      {item.badge}
    </span>
  );
  if (item.disabled || !item.href) {
    return (
      <span
        aria-disabled
        title="On the roadmap"
        className={cn(
          "flex cursor-not-allowed items-center rounded-xl text-sm text-muted-foreground",
          collapsed ? "size-9 justify-center" : "gap-2.5 px-2 py-2",
        )}
      >
        <item.icon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {!collapsed && badge}
      </span>
    );
  }
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "course-nav-item group/navitem relative flex rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-foreground/50 focus-visible:ring-inset",
        collapsed
          ? "size-9 items-center justify-center"
          : "items-center gap-2.5 px-2 py-2",
        indent && !collapsed && "ml-7",
        active
          ? "bg-accent-primary text-accent-primary-foreground"
          : "text-foreground/60 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground",
      )}
    >
      {/* run-005 tier-a: idle icons sit at 60% and brighten on ROW hover
          (the references' exact recipe, touch-gated); the active pill's
          icon stays at full ink like MG's active row. */}
      <item.icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          active
            ? "opacity-100"
            : "opacity-60 [@media(hover:hover)]:group-hover/navitem:opacity-100",
        )}
      />
      {/* run-007 C-3: MG's label guard (min-w-0 flex-1, capture bytes
          2309898/2344575) — a flex item's implicit min-width is its content,
          so a bare `truncate` span never ellipsized, it hard-clipped at the
          aside's overflow-hidden edge. title = the v1 overflow affordance. */}
      {!collapsed && <span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>}
      {!collapsed && badge}
    </Link>
  );
  // run-005 tier-b: rail rows are labelled by tooltips (hover AND focus —
  // a native title never fires on keyboard focus), MG's collapsed-rail
  // recipe. The wrapper is UNCONDITIONAL: asChild keeps the Link identity
  // so the collapse toggle never remounts the row or drops focus; the
  // content only mounts on the rail, where the label is otherwise hidden.
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * run-004b — the shared nav renderer (desktop sidebar + mobile drawer).
 * Group labels go MG's way: sentence case, text-sm muted, carrying their
 * own top rhythm (px-2.5 pt-5 pb-1) — the 10.5px uppercase micro-tracking
 * read techy where both references read calm. Tree children render under
 * their parent behind RD's 2px rail at 17px. One renderer so the two
 * surfaces cannot drift (the pre-run-004 duplication is what let them).
 *
 * run-005 tier-b: groups FOLD. The label becomes a disclosure button
 * (aria-expanded, WAI-ARIA disclosure pattern; the chevron rides MG's
 * transition-transform rotate idiom, instant fold like the references'
 * un-animated collapsibles; run-006: motion-reduce:transition-none kills
 * the rotate easing under prefers-reduced-motion — the audit law stays
 * "fewer and gentler, not zero": the rotation turns instant and keeps
 * communicating fold state, same posture as the aside width morph).
 * Fold state is per-renderer in-memory — the
 * sidebar and the drawer each remember their own, a reload opens all.
 * On the rail the labels step aside for MG's hairline dividers
 * (h-0.5 w-6 mx-auto) with the name kept for AT in sr-only.
 */
function CourseNav({
  navGroups,
  pathname,
  onNavigate,
  collapsed = false,
}: {
  navGroups: { label: string; items: NavItem[] }[];
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const navId = useId();
  return (
    <nav aria-label="Course sections">
      {navGroups.map((g) => {
        // the rail never folds (hairlines are not controls); expanded
        // groups fold on their own label — closed state is in-memory only
        const closed = !collapsed && closedGroups[g.label] === true;
        const regionId = `${navId}-${g.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
        <div key={g.label}>
          {collapsed ? (
            <>
              <p className="sr-only">{g.label}</p>
              <div aria-hidden className="mx-auto my-1.5 h-0.5 w-6 rounded-full bg-border" />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setClosedGroups((s) => ({ ...s, [g.label]: !closed }))}
              aria-expanded={!closed}
              aria-controls={closed ? undefined : regionId}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 pb-1 pt-5 text-sm font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-foreground/50 focus-visible:ring-inset [@media(hover:hover)]:hover:text-foreground"
            >
              {g.label}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                  closed && "-rotate-90",
                )}
              />
            </button>
          )}
          {!closed && (
          <ul id={regionId} className="space-y-0.5">
            {g.items.map((item) => {
              // UX audit 2026-10-02 #13: a sibling row that claims the
              // current path via `exact` (e.g. Saved questions under
              // /exam-questions/saved) suppresses prefix rows — without
              // this, both rows highlighted at once. run-004b: the check
              // scopes to the item's own children when it has them (a tree
              // parent and its child must never pill at the same time),
              // else to the group's exact rows as before.
              const exactSiblings = (item.children ?? g.items).some(
                (s) => s.exact === true,
              );
              const active = item.disabled
                ? false
                : (item.exact ??
                  (pathActive(item.href, pathname) && !exactSiblings));
              return (
                <li key={item.label}>
                  <NavRow item={item} active={active} onNavigate={onNavigate} collapsed={collapsed} />
                  {item.children && (
                    <div className="relative mt-0.5 mb-1 space-y-0.5">
                      {/* RD's tree rail: 2px hairline at 17px spanning the
                          children — the parent-child visual contract */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-[17px] border-l-2 border-border"
                      />
                      {item.children.map((child) => {
                        const childActive = child.disabled
                          ? false
                          : (child.exact ?? pathActive(child.href, pathname));
                        return (
                          <NavRow
                            key={child.label}
                            item={child}
                            active={childActive}
                            onNavigate={onNavigate}
                            indent
                            collapsed={collapsed}
                          />
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          )}
        </div>
        );
      })}
    </nav>
  );
}

/**
 * run-008 C-1 (tier-c-mining.md) — the sidebar resize handle.
 *
 * Anatomy is MG's verbatim (byte 2348113): the last child of the aside, an
 * 8px strip straddling the border edge (`-right-1 w-2`, z-10, touch-none,
 * select-none; the aside's overflow-hidden leaves the inner 4px live — MG's
 * live zone is the same 4px, so this is faithful, not a regression).
 *
 * The one deliberate UPGRADE over the reference: MG's handle is aria-hidden
 * (pointer-only, invisible to AT). Our keyboard-fairness law requires a
 * parity path, so ours is a real WAI-ARIA separator — focusable,
 * aria-valuenow/min/max announcing the current width, ArrowLeft/ArrowRight
 * ±16px steps, Home/End to the clamps, focus ring riding the accent token
 * pair with ring-inset (the strip is 4px visible; an outset ring would be
 * clipped into invisibility by the aside's overflow-hidden).
 *
 * No new motion: the drag is direct manipulation (the aside's width ease is
 * suppressed inline while dragging), and there is no hover effect beyond the
 * cursor — MG's handle ships exactly that, and "fewer and gentler" holds.
 */
function SidebarResizeHandle({
  asideId,
  width,
  dragging,
  onPointerDown,
  onPointerMove,
  onDragEnd,
  onKeyDown,
}: {
  asideId: string;
  width: number | null;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  // if the handle unmounts mid-drag (route swap → auto-collapse), pointer
  // capture dies with it — make sure the shell's drag state resets. The
  // parent's onDragEnd is stable + idempotent, so the cleanup is safe.
  const dragEndRef = useRef(onDragEnd);
  useEffect(() => {
    dragEndRef.current = onDragEnd;
  }, [onDragEnd]);
  useEffect(() => {
    return () => dragEndRef.current();
  }, []);

  const announced = width ?? SIDEBAR_DEFAULT_W;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar width"
      aria-controls={asideId}
      aria-valuenow={announced}
      aria-valuemin={SIDEBAR_MIN_W}
      aria-valuemax={SIDEBAR_MAX_W}
      aria-valuetext={`${announced} pixels`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onDragEnd}
      onLostPointerCapture={onDragEnd}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none select-none",
        "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary-foreground/50",
        "focus-visible:bg-accent-primary/25",
        dragging && "bg-accent-primary/25",
      )}
    />
  );
}

export function CourseShell({
  data,
  children,
}: {
  data: SidebarData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [open, setOpen] = useState(false); // mobile drawer

  // run-008 C-1: user-chosen expanded width. null = never resized → the
  // w-64 class state (SSR renders null too, so hydration matches). The
  // rail state ignores it entirely — the 44px rail is fixed by design.
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{ x: number; w: number } | null>(null);
  // live mirror of the width during a drag — pointerup can land in the same
  // batch as the last pointermove, so the state read could be stale
  const dragWidthRef = useRef<number | null>(null);
  const asideId = useId();

  // restore a saved width once on mount (guarded like the other hub prefs)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
      if (raw === null || raw.trim() === "") return;
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarWidth(clampSidebarWidth(Math.round(n)));
    } catch {
      // private mode / blocked storage — default width
    }
  }, []);

  // stable + idempotent: safe to call from pointerup, lostpointercapture,
  // or the handle's unmount cleanup (route swap mid-drag)
  const endSidebarDrag = useCallback(() => {
    const w = dragWidthRef.current;
    dragStartRef.current = null;
    dragWidthRef.current = null;
    setSidebarDragging(false);
    if (w !== null) persistSidebarWidth(w);
  }, []);

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const aside = asideRef.current;
    if (!aside || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { x: e.clientX, w: aside.getBoundingClientRect().width };
    setSidebarDragging(true);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    // relative tracking (start width + dx) — drift-free, no jump at grab;
    // equivalent to MG's absolute edge tracking since the aside sits at x=0
    const next = clampSidebarWidth(Math.round(start.w + (e.clientX - start.x)));
    dragWidthRef.current = next;
    setSidebarWidth(next);
  };

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = sidebarWidth ?? SIDEBAR_DEFAULT_W;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = current - SIDEBAR_RESIZE_STEP;
    else if (e.key === "ArrowRight") next = current + SIDEBAR_RESIZE_STEP;
    else if (e.key === "Home") next = SIDEBAR_MIN_W;
    else if (e.key === "End") next = SIDEBAR_MAX_W;
    if (next === null) return;
    e.preventDefault();
    const clamped = clampSidebarWidth(next);
    setSidebarWidth(clamped);
    persistSidebarWidth(clamped); // keyboard steps commit immediately
  };

  // Desktop collapse ("Hide menu") — SSR-initialised to the document-focus
  // auto-collapse (s146): previously `false` at first paint, so a deep link
  // to the paper viewer rendered the 256px sidebar for one hydration frame
  // before the effect collapsed it. The effect below keeps the leave-route
  // restore contract (only undo a collapse WE performed).
  const [hidden, setHidden] = useState(() => isDocumentFocusRoute(pathname));
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);

  // run-009 hover-expand (ref-analysis/hover-expand-analysis.md): with the
  // rail collapsed, pointer hover floats the panel open over the content and
  // leaving collapses it back. Both references run this on the same
  // architecture — an in-flow reservation + a floating panel (MG byte
  // 2307648: spacer w-55 + absolute aside, data-slot="pinnable-rail"; RD
  // byte 2860705: width holder + absolute z-50 panel, --collapsed-width:
  // 64px) — so the transient expansion never reflows the content column.
  // railHover is transient by definition (never persisted); the pinned
  // toggle keeps its exact semantics.
  const [railHover, setRailHover] = useState(false);
  const sidebarOpen = !hidden || railHover; // expanded-state chrome
  const sidebarFloating = hidden && railHover; // fixed overlay + 44px spacer

  // Document-focus routes (past-paper viewer / interactive player) collapse
  // the sidebar to the 44px rail automatically — on those screens the PDF is
  // the whole point (user-reported: "such a small viewport for the pdf").
  // Leaving the route restores the prior state, but ONLY if we collapsed it
  // (a manual "Hide menu" by the user is never undone).
  const focusRoute = isDocumentFocusRoute(pathname);
  // s146: the paper-viewer route suppresses the global header (56px) and the
  // mobile Menu bar (49px) — the PDF is the screen there. The rail/sidebar
  // sticky offsets and the row's min-height must re-derive from the viewport
  // top on it, and the drawer trigger (which lives in the suppressed bar)
  // never renders.
  const viewerRoute = isViewerRoute(pathname);

  // run-009: hover-expand pointer gating — mouse/pen only (both references
  // gate every hover affordance in @media(hover:hover); a touch tap on the
  // rail must navigate, not float a panel), and never on viewer routes
  // (s146: the PDF is the screen — a transient panel over it on mouse-travel
  // is exactly the chrome the document-focus contract removes).
  //
  // run-010 (visual-smoke finding, prod repro): "Hide menu" clicked with the
  // pointer resting inside the panel looked like a no-op — as the width ease
  // shrinks the panel under the stationary pointer, the browser re-dispatches
  // pointerenter at the resting coordinates (boundary churn from the DOM
  // swap under the pointer), the guard below saw `hidden === true` and
  // re-floated the panel mid-collapse. Hover-intent means entering through
  // the 44px rail strip (the rail is the leftmost column and the float
  // opens to its right), so an enter farther right is churn, not intent:
  // ignore it. A real pointer re-entry while the float is animating under
  // the pointer is out of the rail contract the same way (the reference
  // rails — MG byte 1891064 w-16, RD --collapsed-width: 64px — are also
  // left-edge strips).
  const onAsidePointerEnter = (e: React.PointerEvent<HTMLElement>) => {
    if (e.clientX > SIDEBAR_RAIL_PX) return;
    if (hidden && !viewerRoute && e.pointerType !== "touch") setRailHover(true);
  };
  const onAsidePointerLeave = () => {
    if (railHover) setRailHover(false);
  };

  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (focusRoute) {
      if (!autoCollapsedRef.current) {
        autoCollapsedRef.current = true;
        // one-time init sync with the route (auto-collapse on document-focus
        // routes) — ported pattern from the demo; restructure in the
        // hardening tranche if the rule fires on new code
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHidden(true);
      }
    } else if (autoCollapsedRef.current) {
      autoCollapsedRef.current = false;
      setHidden(false);
    }
  }, [focusRoute]);

  // Mobile drawer focus management (UX audit 2026-10-02, P2-8): the dialog
  // had role/aria-modal but keyboard users could Tab straight through into
  // the page behind it, Escape did nothing, and focus never moved in or back
  // out. While open: focus lands on the panel, Tab cycles inside it, Escape
  // closes, background scroll locks; on close, focus returns to the trigger.
  useEffect(() => {
    if (!open) return;
    const panel = drawerPanelRef.current;
    // capture the trigger element now — reading menuBtnRef.current inside the
    // cleanup would race React's ref reassignment (exhaustive-deps rule)
    const menuBtn = menuBtnRef.current;
    if (!panel) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === panel) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      menuBtn?.focus();
    };
  }, [open]);

  const variant: SidebarVariant = useMemo(() => {
    if (pathname.includes("/revision-notes")) return "notes";
    if (pathname.includes("/exam-questions")) return "questions";
    if (pathname.includes("/past-papers") || pathname.includes("/practice-papers")) return "questions";
    if (pathname.includes("/flashcards")) return "flashcards";
    return "hub";
  }, [pathname]);

  const base = `/courses/${data.course.slug}`;

  const navGroups: {
    label: string;
    items: NavItem[];
  }[] = [
    {
      label: "Course",
      items: [
        // run-013 R1/G2 (sidebar content audit): the dashboard's band-1
        // flagship — the tutor — finally rides the persistent chrome. The
        // gate is the ADR-030 law itself (the registry curriculumCode, the
        // SAME field the band card and the /tutor page key on); a course
        // without a validated serving corpus shows NO row here — the honest
        // "not yet connected" state stays on the dashboard card. The row
        // never pills: /tutor sits outside /courses/*, which is correct —
        // it is a session surface, not a course route.
        ...(data.course.curriculumCode
          ? [{ href: `/tutor?course=${data.course.slug}`, label: "Course Tutor", icon: GraduationCap }]
          : []),
        { href: base, label: "Course Resources", icon: LayoutDashboard, exact: pathname === base },
        // run-013 R1/G1 (audit HIGH): the corpus spine — prerendered for ALL
        // 109 courses (ADR-021 allCourseParams) — was chrome-less on desktop;
        // its only persistent entry was a small exam-code pill in the page
        // header, which on a phone was the sole route into the most
        // subject-specific tool the platform has.
        { href: `${base}/specification`, label: "Specification", icon: ListTree },
      ],
    },
    {
      // run-013 C2: the dashboard's Learn band taxonomy (T-COURSE-BANDS-1) —
      // the group stops being "Revision" and mirrors the band that actually
      // holds these tools.
      label: "Learn",
      items: [
        { href: `${base}/revision-notes`, label: "Revision Notes", icon: BookOpen },
        // run-013 C1 (sidebar content audit): ONE ghost law per class —
        // data-conditional tools are ABSENT-WHEN-ABSENT (the law Seneca has
        // obeyed since T-SENECA-001), never disabled placeholders. T-MIG-140's
        // disabled+roadmap row is superseded: the chrome no longer advertises
        // a tool this course cannot open; the honest roadmap state stays on
        // the dashboard's Learn-band card. Same committed-registry gate as
        // the card (courseHasBookArchive); the shelf behind the link stays
        // the live T-C20 gate.
        ...(courseHasBookArchive(data.course.slug)
          ? [{ href: `${base}/books`, label: "Student Book", icon: BookMarked }]
          : []),
        { href: `${base}/flashcards`, label: "Flashcards", icon: CircleHelp },
        // run-013 R1/G4 (audit MEDIUM): guided lessons — the committed
        // guided-import.json gate (the SAME loadGuidedIndex the Learn-band
        // card keys on). Absent-when-absent (the Seneca law) means this row
        // self-updates as the corpus rollout progresses — coverage 1/109
        // today, and the chrome never shows a placeholder for the other 108.
        ...(data.hasGuidedLessons
          ? [{ href: `${base}/guided-lessons`, label: "Guided lessons", icon: Lightbulb }]
          : []),
        // run-013 R1/G5 (audit MEDIUM-LOW): Underground Mathematics — the
        // SAME absent=OFF law as lib/ugm.ts (flag + committed bundle or
        // nothing, errors degrade to OFF); the SAME getUgmBundle the
        // Learn-band card keys on. 10 maths courses today.
        ...(data.hasUgm
          ? [{ href: `${base}/ugm`, label: "Underground Mathematics", icon: Map }]
          : []),
        // T-SENECA-001 Task 43: harvested Seneca course content — the row
        // only renders for courses with a registered Seneca bundle under the
        // live flag (courses without a mapping show nothing, never a
        // disabled placeholder).
        ...(data.seneca
          ? [{ href: `${base}/seneca`, label: "Seneca Resources", icon: Sparkles, badge: data.seneca.total.toLocaleString() }]
          : []),
      ],
    },
    {
      // run-013 C2: the dashboard's Practise band name, verbatim.
      label: "Practise",
      items: [
        {
          href: `${base}/exam-questions`,
          label: "Exam Questions",
          icon: FileQuestion,
          // run-004b: Saved questions is real hierarchy (a facet of the
          // question bank), so it rides RD's tree-child pattern — the only
          // nesting the content honestly has
          children: [
            { href: `${base}/exam-questions/saved`, label: "Saved questions", icon: Bookmark, exact: pathname.endsWith("/saved") },
          ],
        },
        // run-013 C1: same class law. The OFFICIAL-PLANE-ONLY gate below is
        // unchanged (official parsed plane OR corpus PDF archive — never the
        // SME bank's sourcePaper citations); only the missing-data
        // presentation changes: disabled+roadmap → absent. The dashboard
        // keeps the honest roadmap card.
        ...(data.hasPastPapers || data.hasCorpusPapers
          ? [{ href: `${base}/past-papers`, label: "Past Papers", icon: ScrollText }]
          : []),
        { href: `${base}/practice-papers`, label: "Practice Papers", icon: Files },
        // run-013 C1+C3: the OTHER class — platform roadmap items render as
        // ghost rows (disabled + roadmap badge, NO href: the old "#" was an
        // inert-but-sloppy real anchor, and a disabled row is not a link).
        // Target Test keeps the one chrome ghost it already had; the
        // dashboard-only roadmap cards (Mock Exams, Mistakes Log, Strength
        // Battle) stay dashboard-only — the chrome is curated navigation and
        // this lane adds no new ghost rows.
        { label: "Target Test", icon: Target, disabled: true, badge: "roadmap" },
      ],
    },
    {
      // run-013 C2 (audit C2): the dashboard's Track & improve band — the
      // sidebar taxonomy was left behind by the band reorg ("Strengths &
      // Weaknesses" is a Track tool that sat under "Course"; Grade
      // Boundaries had no group to live in). Both rows move here so the two
      // information architectures agree about the same tools.
      label: "Track & improve",
      items: [
        { href: `${base}/strengths`, label: "Strengths & Weaknesses", icon: Compass, exact: pathname === `${base}/strengths` },
        // run-013 R1/G3: official boundaries live for 106/109 courses — the
        // same getGradeBoundariesSummary the Track card keys on;
        // absent-when-absent.
        ...(data.hasGradeBoundaries
          ? [{ href: `${base}/grade-boundaries`, label: "Grade Boundaries", icon: TrendingUp }]
          : []),
      ],
    },
  ];

  // NOTE (run-004b): the rail is no longer its own <aside> — the shell is
  // ONE element that animates its width between the expanded panel and the
  // 44px icon rail (MG's transition-[width] collapse; overflow-hidden
  // clips the panel while it slides shut — the old two-aside mount swap
  // could not animate, and the original w-0 collapse swallowed its own
  // re-open button, which is why the rail gets a full 44px, keeping
  // "Show menu" reachable).
  // run-005 tier-b: the swap is gone entirely. Rail-keep (MG's recipe)
  // keeps the nav mounted in BOTH shapes — the aside is one persistent
  // three-region column (header / scroll area / footer dock) whose rows
  // morph between full rows and 36px icon pills; nothing unmounts on
  // collapse, so the width ease has no content swap to soften and the
  // tier-a swap fade retires with it. The footer dock rides the existing
  // ThemeToggle (one store, shared with the app-shell's own controls).

  return (
    <CourseDataProvider data={data}>
      {/* course-shell-row: the CLA dock's physical-reflow hook (globals.css,
          HUB-CLA-SIDEBAR) — while a CLA panel is docked open on ≥1400px this
          row cedes 400px on the right, SME's expanded-chat behaviour */}
      <div
        className={cn(
          "course-shell-row flex",
          viewerRoute
            ? "min-h-[calc(100dvh-1px)]"
            : "min-h-[calc(100dvh-3.5rem-1px)]",
        )}
      >
        {/* mobile drawer: nav groups + the resource topic tree. Never on the
            paper-viewer route — its trigger (the Menu bar) is suppressed
            there, so a stale open state could never be dismissed. */}
        {open && !viewerRoute && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Course menu">
            <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
            <div
              ref={drawerPanelRef}
              tabIndex={-1}
              className="absolute inset-y-14 left-0 w-80 max-w-[85vw] border-r bg-background outline-none"
            >
              <MobileDrawerInner
                data={data}
                variant={variant}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
                navGroups={navGroups}
              />
            </div>
          </div>
        )}

        {/* run-009 hover-expand: the spacer plays MG's byte-2307648 role —
            while the panel floats (fixed) it holds the 44px rail reservation
            so the content column never reflows; it exists only during the
            transient hover expansion. */}
        {sidebarFloating && <div aria-hidden className="hidden w-11 shrink-0 lg:block" />}

        {/* desktop sidebar — the one and only course sidebar; run-004b: one
            element that animates width between the panel (w-64: back to the
            references' narrow rhythm now that the tiles are gone — 288px was
            tile-repair) and the 44px icon rail, MG's transition-[width] ease.
            run-008 C-1: the expanded width becomes continuous — a user-dragged
            width rides inline style (beats any width class); the rail keeps
            its w-11 class and never gets inline width, so collapse/expand
            still morphs between 44px and the remembered expanded width.
            run-009: while the collapsed rail is hovered, the SAME element
            switches to fixed and expands to the remembered width — the
            references' hover-expand on their spacer+float architecture
            (analysis doc §3), anchored to the viewport because our document
            scrolls where their app shell does not. */}
        <aside
          id={asideId}
          ref={asideRef}
          onPointerEnter={onAsidePointerEnter}
          onPointerLeave={onAsidePointerLeave}
          className={cn(
            "hidden shrink-0 overflow-hidden border-r bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex lg:flex-col",
            sidebarFloating
              ? // transient float: same visual spot the sticky rail occupies
                // (top-14 under the 56px header), above the page content
                "fixed left-0 top-14 z-30 h-[calc(100dvh-3.5rem-1px)]"
              : viewerRoute
                ? "sticky top-0 h-[calc(100dvh-1px)]"
                : "sticky top-14 h-[calc(100dvh-3.5rem-1px)]",
            sidebarOpen ? (sidebarWidth === null ? "w-64" : undefined) : "w-11",
          )}
          style={
            !sidebarOpen || sidebarWidth === null
              ? undefined
              : {
                  width: sidebarWidth,
                  // a 200ms width ease lags a live drag — kill the transition
                  // while the pointer is down, restored on release (spec C-1)
                  ...(sidebarDragging ? { transition: "none" } : {}),
                }
          }
          aria-label="Course navigation"
        >
          {/* header: course label + collapse toggle / re-open toggle.
              run-012: the hover-float carries the PIN control (MG's float is
              literally data-slot="pinnable-rail", capture byte 2307648 — the
              transient panel is where the uncollapse affordance lives).
              Previously the float branched on `sidebarOpen` and rendered
              "Hide menu", so the float had NO uncollapse control, and the
              rail's "Show menu" was unreachable by mouse: entering the 44px
              strip to reach it IS the hover intent that floats the panel and
              unmounts the button (operator-reported catch-22, repro
              16/16 — the click landed on the course label). In the float the
              toggle is therefore "Show menu": pinning morphs fixed→sticky at
              the SAME width — no collapse under the pointer, so no boundary
              churn (and run-010's clientX>44 guard plus the hidden===false
              gate both ignore any residual re-dispatch). */}
          <div className={cn("flex items-center py-3", sidebarOpen ? "justify-between px-4" : "justify-center")}>
            {sidebarOpen ? (
              <>
                <span className="text-sm font-semibold tracking-tight">{data.course.label ?? data.course.subject}</span>
                {sidebarFloating ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setHidden(false);
                      setRailHover(false); // pin open NOW — same width, sticky again
                    }}
                    aria-label="Show menu"
                    title="Show menu"
                  >
                    <PanelLeftOpen className="size-4" aria-hidden /> Show menu
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setHidden(true);
                      setRailHover(false); // run-009: "Hide" closes NOW, not on pointer-leave
                    }}
                  >
                    <PanelLeftClose className="size-4" aria-hidden /> Hide menu
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="size-9 shadow-xs"
                onClick={() => {
                  setHidden(false);
                  setRailHover(false);
                }}
                aria-label="Show menu"
                title="Show menu"
              >
                <PanelLeftOpen className="size-4" aria-hidden />
              </Button>
            )}
          </div>

          {/* run-011: scrollbar-none — the references' sidebar scroll
              affordance (RD's aside scroller and MG's nav scroller both ship
              scrollbar-none + overflow-y-auto). Wheel/touch/keyboard scroll
              preserved; the bar itself suppressed — one scroller serves all
              three shapes (expanded, 44px rail, run-009 float). */}
          <div className={cn("scrollbar-none min-h-0 flex-1 overflow-y-auto pb-6", sidebarOpen ? "px-3" : "px-1")}>
            <CourseNav navGroups={navGroups} pathname={pathname} onNavigate={() => setOpen(false)} collapsed={!sidebarOpen} />
          </div>

          {/* run-005 tier-b footer dock: MG pins a theme/settings footer
              under the scroll area; ours rides the existing ThemeToggle
              (same store the app-shell header/footer already drive). */}
          <div className={cn("flex border-t py-3", sidebarOpen ? "px-3" : "justify-center px-0.5")}>
            <ThemeToggle variant={sidebarOpen ? "row" : "icon"} />
          </div>

          {/* run-008 C-1: the resize handle, expanded-state only (the rail is
              fixed 44px by design — a different contract from MG's, whose rail
              is unpinned). */}
          {sidebarOpen && (
            <SidebarResizeHandle
              asideId={asideId}
              width={sidebarWidth}
              dragging={sidebarDragging}
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onDragEnd={endSidebarDrag}
              onKeyDown={onHandleKeyDown}
            />
          )}
        </aside>

        {/* content column */}
        <div className="min-w-0 flex-1">
          {/* mobile-only drawer trigger bar; the desktop sidebar is toggled
              by the rail icon when collapsed. Stands down on the paper-viewer
              route (s146): the global header above it is already suppressed
              there, and a second sticky 49px bar over the PDF is exactly the
              chrome the document-focus contract exists to remove. The
              viewer's own back link is the escape hatch. */}
          {!viewerRoute && (
          <div className="sticky top-14 z-30 flex items-center gap-2 border-b bg-background px-3 py-2 lg:hidden">
            <Button
              ref={menuBtnRef}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu className="size-4" aria-hidden /> Menu
            </Button>
            {/* run-007 C-3: same guard as the nav rows — this span is a flex
                item of the trigger bar, so long course names hard-clipped. */}
            <span className="min-w-0 truncate text-sm font-medium">{data.course.label ?? data.course.subject}</span>
          </div>
          )}
          {children}
        </div>
      </div>
    </CourseDataProvider>
  );
}

function MobileDrawerInner({
  data,
  variant,
  pathname,
  onNavigate,
  navGroups,
}: {
  data: SidebarData;
  variant: SidebarVariant;
  pathname: string;
  onNavigate: () => void;
  navGroups: {
    label: string;
    items: NavItem[];
  }[];
}) {
  const base = `/courses/${data.course.slug}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">{data.course.label ?? data.course.subject}</span>
        <Button variant="ghost" size="icon" className="size-9 [@media(hover:none)]:size-11" onClick={onNavigate} aria-label="Close menu">
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      {/* run-011: RD's mobile drawer ships scrollbar-none too. */}
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <CourseNav navGroups={navGroups} pathname={pathname} onNavigate={onNavigate} />

        {/* resource-flavoured topic tree (mobile navigation). Papers are
            linear documents — the Exam-Questions spec tree is noise on
            past-paper routes, same reasoning as the desktop ResourcePanel. */}
        {!pathname.includes("/past-papers") && (
          <div className="mt-5 border-t pt-4">
            <p className="sr-only">Topics</p>
            {/* Mobile UX audit (2026-09-28) P1: close ONLY on real navigation
                (leaf links / "View all topics"). The old onClickCapture fired
                on the expand/collapse <button>s too — the drawer unmounted,
                TopicTree's expanded state reset on remount, and no topic
                beyond the auto-expanded one could ever be browsed on mobile. */}
            <div
              role="presentation"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) onNavigate();
              }}
            >
              <TopicTreeWithIndexAuto variant={variant} />
            </div>
          </div>
        )}
      </div>

      {/* run-005 tier-b: the same footer dock the desktop sidebar carries —
          theme switching must not be desktop-only */}
      <div className="border-t px-3 py-3">
        <ThemeToggle variant="row" />
      </div>
    </div>
  );
}
