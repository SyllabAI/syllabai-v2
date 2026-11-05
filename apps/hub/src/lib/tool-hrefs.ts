/**
 * Study-tools href laws — run-015 (UX audit F3–F7, trace 1a19b6125c2d7e4d).
 *
 * Extracted verbatim from app-shell.tsx (where they had lived untested since
 * the 2026-10-02 P2-5 fix) so the contract is unit-testable — audit F7: the
 * resolver encodes real branching (course → last-opened → bare) and its
 * uniform application over the menu rows let F4 slip through: EVERY row was
 * course-scoped, but only some tools HAVE a course-scoped surface, so inside
 * a course the "Dashboard" row resolved to /courses/<slug>/dashboard — a
 * route that does not exist (404). The fix is the COURSE_SCOPED_KINDS
 * allow-list below; the allow-list, the resolution order and the active-row
 * law are pinned in tool-hrefs.test.ts.
 */
import kgDataIndex from "../../public/kg/data/index.json";
import coursesRegistry from "../../content/courses.json";

// slugs with a published graph bundle (public/kg/data/<slug>.json) — exactly
// what the KG page's picker lists, from the same generated manifest
const KG_COURSE_SLUGS = new Set(kgDataIndex.courses.map((c) => c.slug));

// every registry slug — validates the last-opened fallback below
const COURSE_SLUGS = new Set(
  (coursesRegistry.courses as { slug: string }[]).map((c) => c.slug),
);

/**
 * run-015 (audit F4): the menu rows that have a course-scoped surface under
 * /courses/<slug>/ — revision-notes / exam-questions / flashcards (no global
 * surface; the bare hrefs are the legacy redirect that lands the pilot) and
 * past-papers (the course's own paper set; the bare /past-papers is the
 * corpus-wide archive browser, not a wrong destination). Everything else in
 * the menu — Dashboard, Courses, Study plan, the More-tools rows — is a
 * global surface and keeps its bare href at every depth.
 */
const COURSE_SCOPED_KINDS = new Set([
  "revision-notes",
  "exam-questions",
  "flashcards",
  "past-papers",
]);

/**
 * Course-scoped Study tools href resolution (UX audit 2026-10-02, P2-5;
 * run-015 narrows it to the rows that actually have a course surface).
 *
 * Resolution order:
 *
 *   1. the course you're in (same pattern as knowledgeGraphHref below)
 *   2. your last-opened course (the account's last-opened doc via
 *      lib/last-opened.ts, validated against the build-time registry)
 *   3. the bare href — for the course-scoped kinds the legacy redirect
 *      lands the pilot, the only course with a full licensed corpus today
 *      (disclosed in-header); for global rows the bare href IS the
 *      destination.
 */
export function courseScopedToolHref(
  href: string,
  pathname: string,
  lastOpenedSlug: string | null,
): string {
  const kind = href.slice(1); // "revision-notes" | "exam-questions" | "flashcards" | "past-papers" | ...
  if (!COURSE_SCOPED_KINDS.has(kind)) {
    return href; // global surface — never prefixed (audit F4)
  }
  const inCourseSlug = pathname.startsWith("/courses/")
    ? (pathname.split("/")[2] ?? "")
    : "";
  if (inCourseSlug) {
    return `/courses/${encodeURIComponent(inCourseSlug)}/${kind}`;
  }
  if (lastOpenedSlug && COURSE_SLUGS.has(lastOpenedSlug)) {
    return `/courses/${encodeURIComponent(lastOpenedSlug)}/${kind}`;
  }
  return href;
}

/**
 * Context-aware Knowledge Graph href (operator request, trace
 * 1a0f8ddd3e6a11bd): inside a course, the header entry deep-links that
 * course's graph — same destination the course page's "View parsed spec"
 * card uses — instead of dumping the learner on the picker. Anywhere else
 * (and for courses whose graph isn't published) it stays the honest picker
 * entry; unknown slugs are refused here so the picker never renders its
 * "unknown slug" note for a link the header itself produced.
 */
export function knowledgeGraphHref(pathname: string): string {
  if (pathname.startsWith("/courses/")) {
    // usePathname is decoded; raw segment check (no decode) also can't throw
    // on malformed %-sequences — and every registry slug is plain ASCII, so
    // an encoded segment simply won't match and falls back to the picker
    const slug = pathname.split("/")[2] ?? "";
    if (slug && KG_COURSE_SLUGS.has(slug)) {
      return `/knowledge-graph?course=${encodeURIComponent(slug)}`;
    }
  }
  return "/knowledge-graph";
}

/**
 * run-015 (audit F6): the active-row law — whether a Study-tools menu row
 * names the surface the learner is already on. Pure so the dropdown can
 * mark it with aria-current="page" (assistive tech) plus a check glyph and
 * a muted ground (sight), and so the law is testable next to the resolver
 * it mirrors:
 *
 *   - exact match: the global rows (/dashboard, /courses, /plan, …)
 *   - inside a course: /courses/<slug>/<kind>[/…] marks the row whose kind
 *     matches the third segment — the course prefix is irrelevant to WHICH
 *     tool you're using; "past papers of my course" still lights Past Papers
 *   - elsewhere: the row's own first segment as a prefix (/past-papers/<…>,
 *     /tutor/…) — a surface deeper than the menu row is still that tool
 *
 * Deliberately NOT active: the bare /courses row on any /courses/<slug>/…
 * page (the learner is inside one course, not browsing the directory), and
 * course subroutes that no menu row names (specification, seneca, ugm, …).
 */
export function isToolActive(href: string, pathname: string): boolean {
  const kind = href.slice(1);
  if (pathname === href) {
    return true;
  }
  if (pathname.startsWith("/courses/")) {
    const kindSeg = pathname.split("/")[3] ?? "";
    return kindSeg !== "" && kindSeg === kind;
  }
  return pathname.startsWith(`/${kind}/`);
}
