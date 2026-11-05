"use client";

/**
 * TeacherShell — the teacher workspace's persistent chrome
 * (dashboard-redesign kit, T-TEACH-SHELL-1).
 *
 * The ten-tab strip (teacher-nav.tsx, 2026-09-28) carried every teacher
 * surface's navigation as one horizontally-scrolling row: ten tabs of
 * equal visual weight, mixing the surfaces a teacher lives in (Overview,
 * Marking, Classes) with corpus-local tools (Test Builder, Toolkit) and
 * the demo lens, and growing a scroll-affordance subsystem (P3-9) just to
 * survive its own width. The redesign replaces it with the student
 * dashboard's sidebar contract (T-DASH-SIDEBAR-001) carrying the teacher
 * nav model (lib/teacher/nav-config.ts): one grouped, always-visible
 * spine — Workspace / Live data / Tools / Demo lens — where the grouping
 * itself says which surfaces read live core data and which run on the
 * sample bank.
 *
 * Behaviour is the dashboard shell's proven mechanics verbatim, NOT new
 * CSS: the 44px collapsed rail (one rail width app-wide — run-008 C-1),
 * rail-keep rows with tooltips (run-005 tier-b), the hover-expand float
 * with the rail strip pointer-intent guard (run-009/run-010), the
 * account-backed rail pref (T-ACCOUNT-ONLY run-001: the collapse lives in
 * the "teacher-shell-prefs" workspace doc — the dashboard-prefs rail's
 * twin; the retired localStorage record adopts once per tab), the mobile
 * drawer with the focus-trap
 * contract (UX audit P2-8), and the shared run-004b SideNav renderer —
 * so the active-row law cannot drift between the student and teacher
 * sidebars. The strip's identity line moves to the sidebar footer (the
 * header's identity chip stays the primary affordance; RequireAuth in the
 * layout already gates the role, so the strip's role-mismatch note is
 * redundant here).
 *
 * The content column keeps the dashboard's rhythm: px-4/6/8 + max-w-6xl —
 * exactly the width the teacher surfaces render at today under the global
 * AppShell column, so no teacher page reflows.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  SideNav,
  SIDEBAR_RAIL_PX,
  type SideNavGroup,
} from "@/components/layout/side-nav";
import { useIdentity } from "@/lib/identity";
import { createAccountStore } from "@/lib/account-stores";
import { TEACHER_NAV_GROUPS } from "@/lib/teacher/nav-config";

const RAIL_HIDDEN_KEY = "hub:teacher-rail-hidden"; // RETIRED (legacy adoption pin)

/**
 * The teacher shell's preference doc — the "teacher-shell-prefs" key of
 * the workspace-document plane (T-ACCOUNT-ONLY run-001, the review pass's
 * catch: this rail was the one LIVE localStorage writer the sweep missed).
 * The desktop rail collapse lives in the account; the retired localStorage
 * record above is adopted once per tab, then removed. The shape is the
 * dashboard-prefs rail field verbatim, so the two shells stay twins.
 */
const teacherShellPrefsStore = createAccountStore<{ railHidden: boolean }>({
  docKey: "teacher-shell-prefs",
  initial: { railHidden: false },
  parse: (raw) => {
    if (!raw || typeof raw !== "object") return { railHidden: false };
    return { railHidden: (raw as { railHidden?: unknown }).railHidden === true };
  },
  legacyKeys: [RAIL_HIDDEN_KEY],
  readLegacy: () => {
    try {
      return { railHidden: window.localStorage.getItem(RAIL_HIDDEN_KEY) === "1" };
    } catch {
      return { railHidden: false };
    }
  },
});

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const identity = useIdentity();

  const [open, setOpen] = useState(false); // mobile drawer
  // Desktop collapse — SSR-initialised expanded; the account-backed pref
  // restores after hydration (the course shell's width-restore posture:
  // one expanded frame beats a hydration mismatch).
  const [hidden, setHidden] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);

  // T-ACCOUNT-ONLY run-001: the rail collapse is the account's
  // "teacher-shell-prefs" doc. Restore on hydration (subscribe, not a
  // one-shot read — the store's value lands with the engine's merge),
  // persist through the store (the engine's debounced PUT); no
  // localStorage behind any of it (the legacy adoption is the store's).
  useEffect(() => {
    const restore = () => {
      const prefs = teacherShellPrefsStore.get();
      if (prefs.railHidden) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHidden(true);
      }
    };
    restore(); // the legacy adoption's seed may already be in memory
    return teacherShellPrefsStore.subscribe(() => {
      if (teacherShellPrefsStore.hydrated()) restore();
    });
  }, []);

  const persistHidden = (next: boolean) => {
    setHidden(next);
    teacherShellPrefsStore.set({ railHidden: next });
  };

  // run-009 hover-expand — the course shell's exact contract.
  const [railHover, setRailHover] = useState(false);
  const sidebarOpen = !hidden || railHover;
  const sidebarFloating = hidden && railHover;

  // run-010 pointer-intent guard: hover-intent enters through the 44px rail.
  const onAsidePointerEnter = (e: React.PointerEvent<HTMLElement>) => {
    if (e.clientX > SIDEBAR_RAIL_PX) return;
    if (hidden && e.pointerType !== "touch") setRailHover(true);
  };
  const onAsidePointerLeave = () => {
    if (railHover) setRailHover(false);
  };

  // Mobile drawer focus management (UX audit P2-8) — the dashboard shell's
  // contract verbatim: focus lands on the panel, Tab cycles inside, Escape
  // closes, background scroll locks, focus returns to the trigger.
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
  // The config's `prefix` rows keep the SideNav default (startsWith), so
  // their detail routes (/teacher/classes/[id], /teacher/toolkit/[tool])
  // light the parent row. Every other row asserts its exact boolean: ON
  // only on its own path — which is also what kills the /teacher/class vs
  // /teacher/classes prefix collision the strip had to special-case.
  const navGroups: SideNavGroup[] = TEACHER_NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      ...(item.prefix ? {} : { exact: pathname === item.href }),
    })),
  }));

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-1px)]">
      {/* mobile drawer: the same nav model, expanded semantics. */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Teacher workspace menu"
        >
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            ref={drawerPanelRef}
            tabIndex={-1}
            className="absolute inset-y-14 left-0 w-80 max-w-[85vw] border-r bg-background outline-none"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-semibold tracking-tight">Teacher workspace</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 [@media(hover:none)]:size-11"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-3 pb-6">
                <SideNav
                  ariaLabel="Teacher workspace navigation"
                  navGroups={navGroups}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                />
              </div>
              {identity && (
                <div className="border-t px-3 py-3">
                  <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    <span className="min-w-0 truncate">
                      {identity.name} · <span className="font-medium">{identity.role}</span>
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* run-009: while the collapsed rail is hovered, the spacer holds the
          44px reservation so the content column never reflows. */}
      {sidebarFloating && <div aria-hidden className="hidden w-11 shrink-0 lg:block" />}

      {/* desktop sidebar — one element animating its width between the
          panel (w-64) and the 44px icon rail, the dashboard shell's exact
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
        aria-label="Teacher workspace navigation"
      >
        {/* header: label + collapse toggle / the float's pin control
            (run-012 — the transient panel is where the uncollapse
            affordance lives). */}
        <div
          className={cn(
            "flex items-center py-3",
            sidebarOpen ? "justify-between px-4" : "justify-center",
          )}
        >
          {sidebarOpen ? (
            <>
              <span className="text-sm font-semibold tracking-tight">Teacher workspace</span>
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

        <div
          className={cn(
            "scrollbar-none min-h-0 flex-1 overflow-y-auto pb-6",
            sidebarOpen ? "px-3" : "px-1",
          )}
        >
          <SideNav
            ariaLabel="Teacher workspace navigation"
            navGroups={navGroups}
            pathname={pathname}
            collapsed={!sidebarOpen}
          />
        </div>

        {/* footer: the strip's identity line, demoted to its honest place —
            secondary, quiet, out of the nav's way. */}
        {identity && (
          <div className={cn("border-t py-3", sidebarOpen ? "px-3" : "px-1")}>
            {sidebarOpen ? (
              <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">
                  {identity.name} · <span className="font-medium">{identity.role}</span>
                </span>
              </p>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex size-9 items-center justify-center">
                    <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {identity.name} · {identity.role}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </aside>

      {/* content column */}
      <div className="min-w-0 flex-1">
        {/* mobile-only drawer trigger bar — the dashboard pages' pattern. */}
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
          <span className="min-w-0 truncate text-sm font-medium">Teacher workspace</span>
        </div>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
