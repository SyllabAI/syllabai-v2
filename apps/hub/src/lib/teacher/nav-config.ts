import {
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  Network,
  Sparkles,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

/**
 * Teacher nav model (dashboard-redesign kit, T-TEACH-SHELL-1).
 *
 * The ten-tab strip's flat list, GROUPED by data provenance — the grouping
 * is the redesign's information architecture: Workspace = surfaces a
 * teacher runs all day; Live data = reads the school's core roster; Tools
 * = corpus-local generators on the sample bank; Demo lens = the disclosed
 * SAMPLE cohort. Every href, label and icon is the strip's, unchanged —
 * no route moves, only the grouping is new.
 *
 * `prefix` marks the two surfaces whose detail routes stay lit under the
 * parent row (the strip's own special cases): Classes keeps /teacher/
 * classes/[id], Toolkit keeps /teacher/toolkit/[tool]. Everything else is
 * exact-match — critical for /teacher/class (Class insights), which
 * prefix-matches both /teacher/classes and /teacher/class-graph if left
 * to startsWith.
 */
export interface TeacherNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  prefix?: boolean;
}

export interface TeacherNavGroup {
  label: string;
  items: TeacherNavItem[];
}

export const TEACHER_NAV_GROUPS: TeacherNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/teacher", label: "Overview", icon: LayoutDashboard },
      { href: "/teacher/marking", label: "Marking review", icon: ClipboardCheck },
      { href: "/teacher/classes", label: "Classes", icon: Users, prefix: true },
    ],
  },
  {
    label: "Live data",
    items: [
      // exact-match on purpose — see the prefix note above
      { href: "/teacher/class", label: "Class insights", icon: Network },
      { href: "/teacher/reports", label: "Reports", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/teacher/test-builder", label: "Test Builder", icon: ClipboardList },
      { href: "/teacher/assignments", label: "Assignments", icon: ListChecks },
      { href: "/teacher/validation", label: "Validation", icon: FileCheck2 },
      { href: "/teacher/toolkit", label: "Toolkit", icon: Sparkles, prefix: true },
    ],
  },
  {
    label: "Demo lens",
    items: [
      { href: "/teacher/class-graph", label: "Class graph (demo)", icon: Waypoints },
    ],
  },
];
