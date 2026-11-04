"use client";

/**
 * SideNav — the shared sidebar nav renderer (run-004b), extracted verbatim
 * from course-shell (T-DASH-SIDEBAR-001) so the course chrome and the new
 * dashboard sidebar render from ONE law and cannot drift (the pre-run-004
 * duplication is what let the two surfaces drift the first time). The row
 * recipe, the group fold behaviour and the rail shapes are the course
 * renderer's byte-for-byte; the only generalisation is the landmark name —
 * each surface passes its own aria-label.
 *
 * Consumers: course-shell.tsx (desktop sidebar + mobile drawer) and
 * components/dashboard/dashboard-shell.tsx (same two shapes).
 */
import { useId, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The collapsed rail is fixed 44px (`w-11`) by design — run-008 C-1 made only
 * the EXPANDED width continuous; the rail never takes inline width. run-010
 * uses the same constant as the hover-intent boundary (pointerenter must
 * arrive through the rail strip, not the panel area). Keep in lockstep with
 * the `w-11` classes in the shells. */
export const SIDEBAR_RAIL_PX = 44;

export type NavItem = {
  /** run-013 ghost law (audit C1+C3): disabled rows carry NO href — a ghost
   * is not a link (the old `href: "#"` rendered nowhere but lied in the
   * data). Enabled rows always carry one — the SideNavRow renderer guards it. */
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

export interface SideNavGroup {
  label: string;
  items: NavItem[];
}

/** run-013: NavItem.href is optional (ghost rows carry none) — a missing
 * href can never prefix-match, so a ghost row can never pill. */
export const pathActive = (href: string | undefined, pathname: string) =>
  href !== undefined && pathname.startsWith(href);

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
 *     the references' focus-visible recipe, replacing ring-ring/60.
 *
 * run-005 tier-b (structure, capture-verbatim): the row gains a second
 * shape — the 44px rail (collapsed) KEEPS rows mounted as 36px icon pills
 * (MG's rail-keep: labels hide, rows never unmount), each labelled by a
 * Radix tooltip (MG's data-slot="tooltip-trigger" recipe; the portal
 * escapes the aside's overflow-hidden) plus aria-label. Badges and tree
 * indent are expanded-only — a count pill has no business in a 36px icon
 * row.
 */
export function SideNavRow({
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
 * their parent behind RD's 2px rail at 17px. One renderer so the surfaces
 * cannot drift (the pre-run-004 duplication is what let them).
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
export function SideNav({
  navGroups,
  pathname,
  onNavigate,
  collapsed = false,
  ariaLabel = "Navigation",
}: {
  navGroups: SideNavGroup[];
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  ariaLabel?: string;
}) {
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const navId = useId();
  return (
    <nav aria-label={ariaLabel}>
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
                  <SideNavRow item={item} active={active} onNavigate={onNavigate} collapsed={collapsed} />
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
                          <SideNavRow
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
