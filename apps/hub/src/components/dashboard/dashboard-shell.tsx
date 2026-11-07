"use client";

/**
 * DashboardShell — the dashboard's persistent chrome (T-DASH-SIDEBAR-001).
 *
 * The reference is the operator-supplied RevisionDojo home capture: a
 * persistent left <aside aria-label="Navigation sidebar"> carrying the
 * primary nav, a collapsible "My Subjects" accordion and a curriculum
 * segmented control. RD's sidebar owns the brand row because RD has no
 * header; ours lives under the global AppShell header (identity, theme,
 * sign-out stay there), so the sidebar opens with the collapse toggle
 * instead of a logo — no double brand.
 *
 * Structure (RD → SyllabAI):
 *   RD exam-board selector (DP/MYP/University) → level tabs All/IGCSE/IAL
 *     filtering the accordion (the roster may span both levels; "all" is
 *     the honest default — a tab that hides half the roster by default is
 *     a dark pattern; CIE's A-Level/AS lanes surface under All, see
 *     lib/dashboard-sidebar-model.ts);
 *   RD Home → Dashboard; RD My Subjects accordion → the "My subjects" group
 *     (roster courses, each expanding into its five quick links);
 *   RD Jojo/Planner/Notes/Resources rows → the Study / Resources / Tools
 *     groups (same glyphs as the header dropdown — one icon, one meaning,
 *     audit F8's law).
 *
 * Behaviour is the course shell's proven mechanics, not RD's CSS: the 44px
 * collapsed rail (one rail width app-wide — run-008 C-1), rail-keep rows
 * with tooltips (run-005 tier-b), the hover-expand float with the rail
 * strip pointer-intent guard (run-009/run-010), localStorage persistence,
 * and the mobile drawer with the focus-trap contract (UX audit P2-8). The
 * shared run-004b renderer (components/layout/side-nav.tsx) renders both
 * sidebars, so the active-row law cannot drift between them.
 *
 * The accordion's per-course children ride the tree-child pattern; they are
 * expanded-only — five icon pills per course would be noise on the 44px
 * rail, so the rail keeps the course row alone (the course chrome lives one
 * click away, exactly like RD's collapsed subjects).
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Dumbbell,
  FileQuestion,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScrollText,
  Sparkles,
  SquareStack,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { createAccountStore } from "@/lib/account-stores";
import { cn } from "@/lib/utils";
import {
  SideNav,
  SIDEBAR_RAIL_PX,
  type NavItem,
  type SideNavGroup,
} from "@/components/layout/side-nav";
import { useMySubjects } from "@/lib/my-subjects";
import type { CourseMeta } from "@/lib/courses";
import {
  courseResourceLinks,
  filterCoursesByLevel,
  LEVEL_FILTERS,
  resolveMySubjects,
  type LevelFilter,
} from "@/lib/dashboard-sidebar-model";

const RAIL_HIDDEN_KEY = "hub:dashboard-rail-hidden"; // RETIRED (legacy adoption pin)
const LEVEL_FILTER_KEY = "hub:dashboard-level-filter"; // RETIRED (legacy adoption pin)

/**
 * The dashboard preference doc — the "dashboard-prefs" key of the
 * workspace-document plane (T-ACCOUNT-ONLY run-001): the rail collapse +
 * the level filter live in the account. The two retired localStorage keys
 * above are adopted once per tab, then removed.
 */
const dashboardPrefsStore = createAccountStore<{
  railHidden: boolean;
  levelFilter: LevelFilter;
}>({
  docKey: "dashboard-prefs",
  initial: { railHidden: false, levelFilter: "all" },
  parse: (raw) => {
    const d = { railHidden: false, levelFilter: "all" as LevelFilter };
    if (!raw || typeof raw !== "object") return d;
    const p = raw as { railHidden?: unknown; levelFilter?: unknown };
    return {
      railHidden: p.railHidden === true,
      levelFilter:
        p.levelFilter === "igcse" || p.levelFilter === "ial" ? p.levelFilter : d.levelFilter,
    };
  },
  legacyKeys: [RAIL_HIDDEN_KEY, LEVEL_FILTER_KEY],
  readLegacy: () => {
    try {
      const railHidden = window.localStorage.getItem(RAIL_HIDDEN_KEY) === "1";
      const rawLevel = window.localStorage.getItem(LEVEL_FILTER_KEY);
      const levelFilter =
        rawLevel === "igcse" || rawLevel === "ial" ? rawLevel : "all";
      return { railHidden, levelFilter };
    } catch {
      return { railHidden: false, levelFilter: "all" };
    }
  },
});

/** T-DASH-SIDEBAR-001: the sidebar footer's "Add subject" opens the SAME
 *  cascading overlay the My subjects grid uses, without prop-drilling the
 *  shell through the client tree (DashboardClient listens for this). */
const ADD_COURSE_EVENT = "syllabai:dashboard-add-course";

function dispatchAddCourse() {
  window.dispatchEvent(new CustomEvent(ADD_COURSE_EVENT));
}

/** RD's exam-board selector slot: a segmented control with the sliding
 *  thumb (aria-pressed buttons, RD's own pattern). gap-0 so the thumb's
 *  slot arithmetic is exact: three equal slots, translateX(idx * 100%). */
function LevelSelector({
  value,
  onChange,
}: {
  value: LevelFilter;
  onChange: (f: LevelFilter) => void;
}) {
  const idx = Math.max(
    0,
    LEVEL_FILTERS.findIndex((f) => f.key === value),
  );
  return (
    <div
      role="group"
      aria-label="Filter my subjects by level"
      className="relative flex w-full rounded-2xl bg-muted p-1"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-xl bg-background shadow-xs transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: "calc((100% - 8px) / 3)",
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {LEVEL_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          aria-pressed={value === f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            "relative z-10 flex-1 cursor-pointer whitespace-nowrap rounded-xl px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === f.key
              ? "text-foreground"
              : "text-muted-foreground [@media(hover:hover)]:hover:bg-background/60 [@media(hover:hover)]:hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function DashboardShell({
  courses,
  children,
}: {
  courses: CourseMeta[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { slugs } = useMySubjects();

  const [open, setOpen] = useState(false); // mobile drawer
  // Desktop collapse ("Hide menu") — SSR-initialised expanded; a persisted
  // collapse restores after hydration (the course shell's width-restore
  // posture: one expanded frame beats a hydration mismatch).
  const [hidden, setHidden] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);

  // Level tabs (RD's selector slot): "all" is the default, a persisted
  // choice restores with the rail state.
  const [level, setLevel] = useState<LevelFilter>("all");

  useEffect(() => {
    const restore = () => {
      const prefs = dashboardPrefsStore.get();
      if (prefs.railHidden) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHidden(true);
      }
      setLevel(prefs.levelFilter);
    };
    restore();
    return dashboardPrefsStore.subscribe(() => {
      if (dashboardPrefsStore.hydrated()) restore();
    });
  }, []);

  const persistHidden = (next: boolean) => {
    setHidden(next);
    dashboardPrefsStore.set({ ...dashboardPrefsStore.get(), railHidden: next });
  };

  const changeLevel = (next: LevelFilter) => {
    setLevel(next);
    dashboardPrefsStore.set({ ...dashboardPrefsStore.get(), levelFilter: next });
  };

  // run-009 hover-expand — the course shell's exact contract: with the rail
  // collapsed, pointer hover floats the panel over the content; railHover is
  // transient (never persisted), the pinned toggle keeps its semantics.
  const [railHover, setRailHover] = useState(false);
  const sidebarOpen = !hidden || railHover;
  const sidebarFloating = hidden && railHover;

  // run-010 pointer-intent guard: hover-intent enters through the 44px rail
  // strip; an enter farther right is boundary churn from the DOM swap under
  // a stationary pointer, not intent.
  const onAsidePointerEnter = (e: React.PointerEvent<HTMLElement>) => {
    if (e.clientX > SIDEBAR_RAIL_PX) return;
    if (hidden && e.pointerType !== "touch") setRailHover(true);
  };
  const onAsidePointerLeave = () => {
    if (railHover) setRailHover(false);
  };

  // Mobile drawer focus management (UX audit 2026-10-02, P2-8) — the course
  // shell's contract verbatim: focus lands on the panel, Tab cycles inside,
  // Escape closes, background scroll locks, focus returns to the trigger.
  useEffect(() => {
    if (!open) return;
    const panel = drawerPanelRef.current;
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

  // ── the nav model ──────────────────────────────────────────────────────
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  const roster = resolveMySubjects(slugs, bySlug);
  const rosterFiltered = filterCoursesByLevel(roster, level);

  // Per-course accordion children (expanded-only — see the header note).
  // The hub row claims exact (its href is every sibling's prefix — the
  // #13 double-pill law); the four resource rows prefix-match their own
  // subtrees (note readers, question players, deck runners, paper viewers).
  const courseItems: NavItem[] = rosterFiltered.map((c) => {
    const base = `/courses/${c.slug}`;
    return {
      href: base,
      label: c.label || c.subject,
      icon: GraduationCap,
      children: sidebarOpen
        ? courseResourceLinks(c.slug).map((l) => ({
            href: l.href,
            label: l.label,
            icon: BookOpen,
            ...(l.key === "hub" ? { exact: pathname === base } : {}),
          }))
        : undefined,
    };
  });

  const navGroups: SideNavGroup[] = [
    {
      label: "Study",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: pathname === "/dashboard" },
        { href: "/plan", label: "Study plan", icon: CalendarDays },
        { href: "/tutor", label: "AI Tutor", icon: Sparkles },
        { href: "/practice", label: "Practice", icon: Dumbbell },
      ],
    },
    // absent-when-absent (the Seneca law): no roster, no accordion — the
    // page's own empty state owns discovery, the chrome never fakes it.
    ...(courseItems.length > 0
      ? [{ label: "My subjects", items: courseItems }]
      : []),
    {
      label: "Resources",
      items: [
        { href: "/revision-notes", label: "Revision Notes", icon: BookOpen },
        { href: "/exam-questions", label: "Exam Questions", icon: FileQuestion },
        { href: "/flashcards", label: "Flashcards", icon: SquareStack },
        { href: "/past-papers", label: "Past Papers", icon: ScrollText },
      ],
    },
    {
      label: "Tools",
      items: [
        { href: "/assistant", label: "Assistant", icon: BookOpenCheck },
        { href: "/knowledge-graph", label: "Knowledge Graph", icon: Network },
        { href: "/learner", label: "My Progress", icon: User },
      ],
    },
  ];

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-1px)]">
      {/* mobile drawer: the same nav model, expanded semantics. */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboard menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div
            ref={drawerPanelRef}
            tabIndex={-1}
            className="absolute inset-y-14 left-0 w-80 max-w-[85vw] border-r bg-background outline-none"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-semibold tracking-tight">Dashboard</span>
                <Button variant="ghost" size="icon" className="size-9 [@media(hover:none)]:size-11" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
              {/* run-011: RD's mobile drawer ships scrollbar-none too. */}
              <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-3 pb-6">
                <div className="pt-1">
                  <LevelSelector value={level} onChange={changeLevel} />
                </div>
                <SideNav
                  ariaLabel="Dashboard navigation"
                  navGroups={navGroups}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                />
              </div>
              <div className="border-t px-3 py-3">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => { dispatchAddCourse(); setOpen(false); }}>
                  <Plus className="size-4" aria-hidden /> Add subject
                </Button>
                <div className="pt-2">
                  <ThemeToggle variant="row" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* run-009: while the collapsed rail is hovered, the spacer holds the
          44px reservation so the content column never reflows. */}
      {sidebarFloating && <div aria-hidden className="hidden w-11 shrink-0 lg:block" />}

      {/* desktop sidebar — one element animating its width between the
          panel (w-64) and the 44px icon rail, the course shell's exact
          posture (sticky under the 56px header; transient float fixed). */}
      <aside
        onPointerEnter={onAsidePointerEnter}
        onPointerLeave={onAsidePointerLeave}
        className={cn(
          "hidden shrink-0 overflow-hidden border-r bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex lg:flex-col",
          sidebarFloating
            ? "fixed left-0 top-14 z-30 h-[calc(100dvh-3.5rem-1px)]"
            : "sticky top-14 h-[calc(100dvh-3.5rem-1px)]",
          sidebarOpen ? "w-64" : "w-11",
        )}
        aria-label="Dashboard navigation"
      >
        {/* header: brand + collapse toggle / the float's pin control
            (run-012 — the transient panel is where the uncollapse
            affordance lives, MG's pinnable-rail). */}
        <div className={cn("flex items-center py-3", sidebarOpen ? "justify-between px-4" : "justify-center")}>
          {sidebarOpen ? (
            <>
              <span className="text-sm font-semibold tracking-tight">SyllabAI</span>
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
                    persistHidden(true);
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
                persistHidden(false);
                setRailHover(false);
              }}
              aria-label="Show menu"
              title="Show menu"
            >
              <PanelLeftOpen className="size-4" aria-hidden />
            </Button>
          )}
        </div>

        {/* run-011: the references' sidebar scroll affordance. */}
        <div className={cn("scrollbar-none min-h-0 flex-1 overflow-y-auto pb-6", sidebarOpen ? "px-3" : "px-1")}>
          {sidebarOpen && (
            <div className="pt-1">
              <LevelSelector value={level} onChange={changeLevel} />
            </div>
          )}
          <SideNav
            ariaLabel="Dashboard navigation"
            navGroups={navGroups}
            pathname={pathname}
            collapsed={!sidebarOpen}
          />
        </div>

        {/* footer dock: add-subject (the overlay event) + theme, same dock
            the course sidebar carries. */}
        <div className={cn("flex border-t py-3", sidebarOpen ? "flex-col gap-1.5 px-3" : "flex-col items-center gap-1 px-0.5")}>
          {sidebarOpen ? (
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={dispatchAddCourse}>
              <Plus className="size-4" aria-hidden /> Add subject
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shadow-xs"
                  onClick={dispatchAddCourse}
                  aria-label="Add subject"
                  title="Add subject"
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Add subject</TooltipContent>
            </Tooltip>
          )}
          <ThemeToggle variant={sidebarOpen ? "row" : "icon"} />
        </div>
      </aside>

      {/* content column */}
      <div className="min-w-0 flex-1">
        {/* mobile-only drawer trigger bar — the course pages' pattern; the
            desktop sidebar is toggled by the rail icon when collapsed. */}
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
          <span className="min-w-0 truncate text-sm font-medium">Dashboard</span>
        </div>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
