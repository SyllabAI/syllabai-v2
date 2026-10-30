"use client";

/**
 * CourseShell — the persistent per-course chrome (SME model, research §4):
 *
 *   - ONE course sidebar (Course / Revision / Exam Practice groups with a
 *     "Hide menu" collapse) on every course surface — hub, indexes, details;
 *   - NO topic tree in the desktop sidebar: the numbered tree lives in the
 *     resource panel (see resource-panel.tsx) which resource DETAIL pages
 *     mount themselves, exactly like SaveMyExams' second column;
 *   - on mobile the tree is reachable from the course drawer instead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookMarked,
  BookOpen,
  Bookmark,
  CircleHelp,
  Compass,
  FileQuestion,
  Files,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

type NavItem = {
  href: string;
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
 */
function NavRow({
  item,
  active,
  onNavigate,
  indent = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  indent?: boolean;
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
  if (item.disabled) {
    return (
      <span
        aria-disabled
        title="Not part of the pilot corpus yet"
        className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-muted-foreground"
      >
        <item.icon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
        <span className="truncate">{item.label}</span>
        {badge}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "course-nav-item relative flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        indent && "ml-7",
        active
          ? "bg-accent-primary text-accent-primary-foreground"
          : "text-foreground/60 hover:bg-muted hover:text-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
      {badge}
    </Link>
  );
}

/**
 * run-004b — the shared nav renderer (desktop sidebar + mobile drawer).
 * Group labels go MG's way: sentence case, text-sm muted, carrying their
 * own top rhythm (px-2.5 pt-5 pb-1) — the 10.5px uppercase micro-tracking
 * read techy where both references read calm. Tree children render under
 * their parent behind RD's 2px rail at 17px. One renderer so the two
 * surfaces cannot drift (the pre-run-004 duplication is what let them).
 */
function CourseNav({
  navGroups,
  pathname,
  onNavigate,
}: {
  navGroups: { label: string; items: NavItem[] }[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Course sections">
      {navGroups.map((g) => (
        <div key={g.label}>
          <p className="px-2.5 pb-1 pt-5 text-sm font-medium text-muted-foreground">
            {g.label}
          </p>
          <ul className="space-y-0.5">
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
                  (pathname.startsWith(item.href) && !exactSiblings));
              return (
                <li key={item.label}>
                  <NavRow item={item} active={active} onNavigate={onNavigate} />
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
                          : (child.exact ?? pathname.startsWith(child.href));
                        return (
                          <NavRow
                            key={child.label}
                            item={child}
                            active={childActive}
                            onNavigate={onNavigate}
                            indent
                          />
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
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
  // Desktop collapse ("Hide menu") — SSR-initialised to the document-focus
  // auto-collapse (s146): previously `false` at first paint, so a deep link
  // to the paper viewer rendered the 256px sidebar for one hydration frame
  // before the effect collapsed it. The effect below keeps the leave-route
  // restore contract (only undo a collapse WE performed).
  const [hidden, setHidden] = useState(() => isDocumentFocusRoute(pathname));
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);

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
        { href: base, label: "Course Resources", icon: LayoutDashboard, exact: pathname === base },
        { href: `${base}/strengths`, label: "Strengths & Weaknesses", icon: Compass, exact: pathname === `${base}/strengths` },
      ],
    },
    {
      label: "Revision",
      items: [
        { href: `${base}/revision-notes`, label: "Revision Notes", icon: BookOpen },
        // T-MIG-140 — the books option in the persistent course chrome (the
        // band-133k landing card was the only entry; the sidebar/drawer nav
        // — the thing every course surface shows — had none, which is the
        // operator's "no option in course page"). Same committed-registry
        // gate as the card (courseHasBookArchive): a disabled row with the
        // roadmap badge until the course's books/<specKey>/ archive home
        // lands; the shelf behind the link stays the live T-C20 gate.
        {
          href: `${base}/books`,
          label: "Student Book",
          icon: BookMarked,
          disabled: !courseHasBookArchive(data.course.slug),
          badge: courseHasBookArchive(data.course.slug) ? undefined : "roadmap",
        },
        { href: `${base}/flashcards`, label: "Flashcards", icon: CircleHelp },
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
      label: "Exam Practice",
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
        { href: `${base}/past-papers`, label: "Past Papers", icon: ScrollText, disabled: !data.hasPastPapers && !data.hasCorpusPapers, badge: data.hasPastPapers || data.hasCorpusPapers ? undefined : "roadmap" },
        { href: `${base}/practice-papers`, label: "Practice Papers", icon: Files },
        { href: "#", label: "Target Test", icon: Target, disabled: true, badge: "roadmap" },
      ],
    },
  ];

  // NOTE (run-004b): the rail is no longer its own <aside> — the shell is
  // ONE element that animates its width between the expanded panel and the
  // 44px icon rail (MG's transition-[width] collapse; overflow-hidden
  // clips the panel while it slides shut and the rail content swaps in
  // behind it — the old two-aside mount swap could not animate, and the
  // original w-0 collapse swallowed its own re-open button, which is why
  // the rail gets a full 44px, keeping "Show menu" reachable).
  const railButton = (
    <Button
      variant="outline"
      size="icon"
      className="size-9 shadow-xs"
      onClick={() => setHidden(false)}
      aria-label="Show menu"
      title="Show menu"
    >
      <PanelLeftOpen className="size-4" aria-hidden />
    </Button>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">{data.course.label ?? data.course.subject}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={() => setHidden(true)}
        >
          <PanelLeftClose className="size-4" aria-hidden /> Hide menu
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <CourseNav navGroups={navGroups} pathname={pathname} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );

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

        {/* desktop sidebar — the one and only course sidebar; run-004b: one
            element that animates width between the panel (w-64: back to the
            references' narrow rhythm now that the tiles are gone — 288px was
            tile-repair) and the 44px icon rail, MG's transition-[width] ease */}
        <aside
          className={cn(
            "sticky hidden shrink-0 overflow-hidden border-r bg-background transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex lg:flex-col",
            hidden ? "w-11 items-center pt-3" : "w-64",
            viewerRoute
              ? "top-0 h-[calc(100dvh-1px)]"
              : "top-14 h-[calc(100dvh-3.5rem-1px)]",
          )}
          aria-label="Course navigation"
        >
          {hidden ? railButton : sidebar}
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
            <span className="truncate text-sm font-medium">{data.course.label ?? data.course.subject}</span>
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
        <Button variant="ghost" size="icon" className="size-9" onClick={onNavigate} aria-label="Close menu">
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
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
    </div>
  );
}
