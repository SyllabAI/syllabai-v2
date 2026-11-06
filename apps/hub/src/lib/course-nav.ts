import {
  BookMarked,
  BookOpen,
  Bookmark,
  Compass,
  FileQuestion,
  Files,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListTree,
  Map,
  ScrollText,
  Sparkles,
  Speech,
  SquareStack,
  Target,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { courseHasBookArchive } from "@/lib/books-registry";
import type { SidebarData } from "@/components/hub/course-data-context";
import type { NavItem, SideNavGroup } from "@/components/layout/side-nav";

/**
 * T-NAV-STRIP-1 — the ONE course-nav registry, two views.
 *
 * The sidebar's groups lived inline in course-shell.tsx since run-013; the
 * MathsGenie navigation-tab investigation (2026-11-06,
 * download/course-tool-nav-investigation.md) showed MG renders a SECOND,
 * data-driven view of the same per-course tool list — a horizontal strip on
 * every course-scoped tool page (16 items on GCSE Maths Edexcel, 11 on
 * A-Level Maths Edexcel) — while the sidebar and the strip coexist. To let
 * both surfaces exist without drift, the builder moves here verbatim (same
 * groups, order, gates, honest-absence laws) and grows the flattened strip
 * view beside it.
 *
 * Every gate below is the SAME loader-backed gate the dashboard bands key
 * on (SidebarData comments of record): absent-when-absent — a course without
 * a tool shows no row for it anywhere, never a placeholder.
 */
export function buildCourseNavGroups(
  data: SidebarData,
  pathname: string,
): SideNavGroup[] {
  const base = `/courses/${data.course.slug}`;

  return [
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
        // run-014 (audit F2): SquareStack — the old CircleHelp glyph read as
        // "Help"; same glyph as the header dropdown's Flashcards row.
        { href: `${base}/flashcards`, label: "Flashcards", icon: SquareStack },
        // run-013 R1/G4 (audit MEDIUM): guided lessons — the committed
        // guided-import.json gate (the SAME loadGuidedIndex the Learn-band
        // card keys on). Absent-when-absent (the Seneca law) means this row
        // self-updates as the corpus rollout progresses — coverage 1/109
        // today, and the chrome never shows a placeholder for the other 108.
        ...(data.hasGuidedLessons
          ? [{ href: `${base}/guided-lessons`, label: "Guided lessons", icon: Lightbulb }]
          : []),
        // T-TEACHGENIE-004 (operator order 2026-11-05, "the frontend flow of
        // Teach me/SillyAI is not like the other pages"): the learn-by-
        // teaching lane rides the persistent chrome like every other lane —
        // until now it was reachable ONLY through the dashboard tile. Same
        // absent-when-absent law as the rows above: the flags.json "teachMe"
        // gate (the SAME teachMeEnabledForCourse read the /teach-genie page
        // and the Learn-band card key on) decides the row; non-pilot courses
        // keep the honest roadmap card, never a dead link. ⚠️ OUT-OF-FENCE
        // ADDITIVE MOUNT (course-shell + layout are outside the
        // T-TEACHGENIE fence) — same one-commit precedent as the course
        // tile (T-TEACHME-001 run-003 R0), shipped separately for
        // ratification.
        ...(data.hasTeachMe
          ? [{ href: `${base}/teach-genie`, label: "Teach SillyAI", icon: Speech }]
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
        // T-KG-COV-1: the coarse weekly question ("how far through the
        // specification am I?") rides beside the per-point one it feeds.
        { href: `${base}/coverage`, label: "Syllabus coverage", icon: ListChecks },
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
}

/**
 * The strip view (T-NAV-STRIP-1) — MG's navigation tab: a flat, ordered list
 * of the course's REAL tools. Ghost/roadmap rows (Target Test) and tree
 * facets (Saved questions) are chrome-only concepts and never ride the
 * strip; every remaining row has a real href, so the strip is an <a> row.
 * Order IS the sidebar's registry order — Course → Learn → Practise →
 * Track & improve — flattened.
 */
export interface CourseStripItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** the course root only pills on an exact match (pathActive's prefix
   * match would otherwise pin it on EVERY course route) */
  exact?: boolean;
}

export function buildCourseStripItems(data: SidebarData): CourseStripItem[] {
  const base = `/courses/${data.course.slug}`;
  const groups = buildCourseNavGroups(data, base);
  return groups.flatMap((g) =>
    g.items.flatMap((item): CourseStripItem[] =>
      item.href && !item.disabled ? [{ href: item.href, label: item.label, icon: item.icon, exact: item.href === base }] : [],
    ),
  );
}

// NavItem stays imported so the strip's input type is visibly the sidebar's
// own row contract (buildCourseNavGroups returns SideNavGroup[] of NavItem).
export type { NavItem };
